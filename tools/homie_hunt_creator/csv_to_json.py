import csv
import json
import logging
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox

# --- Configuration ---
OUTPUT_DIR = Path('output')
# Words to ignore when generating item/boss prefixes.
IGNORE_WORDS = {'of', 'the', 'a', 'an', 'and'}
# Item-specific prefixes to strip from words within a tile's name.
# This is case-insensitive. Order matters: longer prefixes should come first.
ITEM_PREFIXES_TO_IGNORE = ["plate", "chain"]
# Maximum number of significant words to use for a prefix.
MAX_PREFIX_WORDS = 2
# Keywords to identify a bonus tile. If a tile's name contains any of these, it will only have one point instance.
BONUS_TILE_KEYWORDS = ["All Uniques", "Collection Log", "complete"]

def setup_logging():
    """Sets up basic logging to the console."""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def get_default_config(project_title="My Homie Hunt"):
    """Returns a default config object for the Homie Hunt Creator."""
    return {
        "config": {
            "projectTitle": project_title,
            "boardTitle": "My Homie Hunt Board",
            "wikiApiUrl": "https://oldschool.runescape.wiki/api.php",
            "autoLinkTileInstances": True,
            "autoGenerateTileIDs": False,
            "sectionColumns": 4,
            "sectionWidth": 296,
            "sectionPadding": 15,
            "sectionBgOpacity": 0.5,
            "tileColumns": 5,
            "tileWidth": 50,
            "tilePadding": 4,
            "boardTitleFont": "C:/Windows/Fonts/arialbd.ttf",
            "boardTitleFontSize": 64,
            "sectionTitleFont": "C:/Windows/Fonts/arial.ttf",
            "sectionTitleFontSize": 22,
            "tileTitleFont": "C:/Windows/Fonts/arial.ttf",
            "tileTitleFontSize": 16,
            "themeColors": {
                "background": "#1a1a1a",
                "primaryText": "#e0e0e0",
                "sectionBorder": "#333333",
                "sectionTitle": "#00bcd4",
                "boardTitleBackgroundColor": "#52281F",
                "tileTitle": "#ffffff"
            }
        },
        "sections": []
    }

def parse_point_multipliers(multiplier_str: str) -> list[float]:
    """Parses a string like '[1, 0.5, 0.5]' into a list of floats."""
    try:
        # Remove brackets and split by comma
        cleaned_str = multiplier_str.strip().strip('[]')
        if not cleaned_str:
            return []
        return [float(p.strip()) for p in cleaned_str.split(',')]
    except (ValueError, TypeError):
        logging.error(f"Invalid format for point multipliers: '{multiplier_str}'. Please use a format like '[1, 0.5, 0.5]'.")
        return []

def generate_prefix(name: str, used_prefixes: set, is_item_name: bool = False) -> str:
    """
    Generates a unique, smart prefix from a name string.
    - "General Graardor" -> "GEN_GRA"
    - "Ring of the Gods" -> "RIN_GOD"
    - "Malediction Shard 2" -> "MAL_SHA_2"
    - "Armadyl Chainskirt" (as item) -> "SKI"
    - "Dharok's Platebody" (as item) -> "BOD"
    Ensures the generated prefix is unique within the provided `used_prefixes` set.
    """
    # First, filter out general ignored words like 'of', 'the'.
    words = [word for word in name.split() if word.lower() not in IGNORE_WORDS]

    # If it's an item, process each word to strip known prefixes.
    if is_item_name:
        processed_words = []
        # Sort prefixes by length (desc) to match longer ones first (e.g., "platebody" before "plate").
        sorted_item_prefixes = sorted(ITEM_PREFIXES_TO_IGNORE, key=len, reverse=True)
        for word in words:
            word_lower = word.lower()
            for prefix in sorted_item_prefixes:
                if word_lower.startswith(prefix):
                    word = word[len(prefix):] # Strip the prefix
                    break # Move to the next word
            if word: # Only add the word if it's not empty after stripping
                processed_words.append(word)
        words = processed_words
    
    if not words:
        base_prefix = "NULL"
    else:
        prefix_parts = []
        non_numeric_word_count = 0
        for word in words:
            # Check if the word is a number
            if word.isdigit():
                prefix_parts.append(word)
            # Otherwise, if we haven't hit our word limit, take the first 3 letters
            elif non_numeric_word_count < MAX_PREFIX_WORDS:
                prefix_parts.append(word[:3].upper())
                non_numeric_word_count += 1

        if not prefix_parts: # Handle cases where all words were filtered
            base_prefix = "NULL"
        else:
            base_prefix = "_".join(prefix_parts)

    # Ensure uniqueness
    final_prefix = base_prefix
    counter = 1
    while final_prefix in used_prefixes:
        final_prefix = f"{base_prefix}_{counter}"
        counter += 1
    
    used_prefixes.add(final_prefix)
    return final_prefix

def parse_csv_to_sections(lines: list[list[str]], point_multipliers: list[float], auto_name_tiles: bool) -> list[dict]:
    """Processes CSV rows into a list of sections for the Homie Hunt format."""
    sections = []
    current_section = None
    used_section_prefixes = set() # Track prefixes for sections to ensure uniqueness

    for i, row in enumerate(lines):
        if not any(row):  # Skip empty rows
            continue

        col_a = row[0].strip() if len(row) > 0 else ""
        col_b = row[1].strip() if len(row) > 1 else ""
        other_cols = [cell.strip() for cell in row[1:]]

        # --- Identify a new section (boss) ---
        # A new section has a name in column A and all other columns are empty.
        if col_a and not any(other_cols):
            if current_section:
                sections.append(current_section)

            section_prefix = generate_prefix(col_a, used_section_prefixes, is_item_name=False)
            current_section = {
                "title": col_a,
                "wiki": col_a,  # Assume wiki page is same as title
                "tiles": [],
                "_prefix": section_prefix, # Internal key for prefix
                "_used_tile_prefixes": set() # Internal set for tile uniqueness within this section
            }
            logging.info(f"Found new section: '{col_a}' -> Prefix: '{section_prefix}'")
            continue

        # --- Identify a tile (drop) for the current section ---
        # A tile has a name in column A and a numeric point value in column B.
        if current_section and col_a and col_b.isdigit():
            base_points = int(col_b)
            points_array = [round(base_points * m) for m in point_multipliers]

            # Check if the tile is a "bonus" tile based on its name
            is_bonus = any(keyword.lower() in col_a.lower() for keyword in BONUS_TILE_KEYWORDS)
            if is_bonus and points_array:
                # Bonus tiles only get the first (highest) point value.
                points_array = points_array[:1]
                logging.info(f"  - Detected BONUS tile: '{col_a}'. Points adjusted to: {points_array}")

            # Generate a smart, unique tileID for the item
            if auto_name_tiles:
                tile_prefix = generate_prefix(col_a, current_section["_used_tile_prefixes"], is_item_name=True)
                tile_id = f"{current_section['_prefix']}-{tile_prefix}"
            else:
                tile_id = ""

            tile_def = {
                "title": col_a,
                "description": f"Obtain a {col_a} as a drop.",
                "tileID": tile_id,
                "wiki": col_a, # Assume wiki page is same as title
                "points": points_array
            }
            current_section["tiles"].append(tile_def)
            logging.info(f"  - Added tile: '{col_a}' -> ID: '{tile_id if tile_id else '<Not Generated>'}'")

    # Add the last processed section
    if current_section:
        sections.append(current_section)

    # Clean up internal keys before returning
    for section in sections:
        section.pop('_prefix', None)
        section.pop('_used_tile_prefixes', None)

    return sections

class ConverterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("CSV to Homie Hunt JSON Converter")

        self.file_path_var = tk.StringVar()
        self.points_var = tk.StringVar(value="[1, 0.5, 0.25, 0.1, 0.05]")
        self.auto_name_tiles_var = tk.BooleanVar(value=True)

        # File selection
        tk.Label(root, text="Input CSV File:").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        tk.Entry(root, textvariable=self.file_path_var, width=50).grid(row=0, column=1, padx=10, pady=5)
        tk.Button(root, text="Browse...", command=self.browse_file).grid(row=0, column=2, padx=10, pady=5)

        # Points input
        tk.Label(root, text="Point Multipliers:").grid(row=1, column=0, padx=10, pady=5, sticky="w")
        tk.Entry(root, textvariable=self.points_var, width=50).grid(row=1, column=1, padx=10, pady=5)

        # Auto-naming toggle
        tk.Checkbutton(root, text="Automatically generate Tile IDs", variable=self.auto_name_tiles_var).grid(row=2, column=1, padx=10, pady=5, sticky="w")

        # Convert button
        tk.Button(root, text="Convert", command=self.convert).grid(row=3, column=1, padx=10, pady=20)

    def browse_file(self):
        file_path = filedialog.askopenfilename(
            title="Select the CSV file to parse",
            filetypes=[("CSV files", "*.csv")]
        )
        if file_path:
            self.file_path_var.set(file_path)

    def convert(self):
        input_csv_path_str = self.file_path_var.get()
        if not input_csv_path_str:
            messagebox.showerror("Error", "Please select an input CSV file.")
            return

        input_csv_path = Path(input_csv_path_str)
        project_title = input_csv_path.stem

        multipliers_str = self.points_var.get()
        point_multipliers = parse_point_multipliers(multipliers_str)
        if not point_multipliers:
            messagebox.showerror("Error", "Invalid point multipliers format. Please use a format like '[1, 0.5, 0.25]'.")
            return

        auto_name_tiles = self.auto_name_tiles_var.get()

        try:
            # Use 'utf-8-sig' to handle potential Byte Order Mark (BOM)
            with open(input_csv_path, mode='r', newline='', encoding='utf-8-sig') as csv_file:
                lines = list(csv.reader(csv_file))

            # Create the base JSON structure
            output_data = get_default_config(project_title)
            output_data['sections'] = parse_csv_to_sections(lines, point_multipliers, auto_name_tiles)

            # Determine output filename
            OUTPUT_DIR.mkdir(exist_ok=True)
            output_path = OUTPUT_DIR / f"{project_title}.json"
            counter = 1
            while output_path.exists():
                output_path = OUTPUT_DIR / f"{project_title}_{counter}.json"
                counter += 1

            # Write the output file
            with open(output_path, 'w', encoding='utf-8') as json_file:
                json.dump(output_data, json_file, indent=2)

            logging.info("=" * 50)
            logging.info("Conversion successful!")
            logging.info(f"Output saved to: {output_path}")
            logging.info("=" * 50)
            messagebox.showinfo("Success", f"Conversion successful!\n\nOutput saved to:\n{output_path}")

        except FileNotFoundError:
            logging.error(f"The file '{input_csv_path}' was not found.")
            messagebox.showerror("Error", f"File not found:\n{input_csv_path}")
        except Exception as e:
            logging.exception(f"An unexpected error occurred: {e}")
            messagebox.showerror("Error", f"An unexpected error occurred:\n{e}")

if __name__ == '__main__':
    setup_logging()
    logging.info("Starting CSV to Homie Hunt JSON Converter...")
    root = tk.Tk()
    app = ConverterApp(root)
    root.mainloop()
    logging.info("Application closed.")