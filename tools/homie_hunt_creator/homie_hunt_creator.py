import argparse
import json
import logging
import os
import csv
import shutil
import requests
from PIL import Image, ImageDraw, ImageFont
from urllib.parse import quote_plus, quote

CACHE_DIR = ".cache" # Cache for downloaded images
OUTPUT_DIR = "output" # Base directory for all generated boards

def setup_logging():
    """Sets up basic logging to the console."""
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def parse_arguments():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(description="Generate a Homie Hunt bingo board from a JSON config.")
    parser.add_argument("config_file", type=str, help="Path to the JSON configuration file.")
    parser.add_argument("--clear-cache", action="store_true", help="Clear the image cache before running.")
    return parser.parse_args()

def clear_cache(cache_dir):
    """Deletes the cache directory if it exists."""
    if os.path.exists(cache_dir):
        logging.info(f"Clearing cache directory: {cache_dir}")
        try:
            shutil.rmtree(cache_dir)
            logging.info("Cache cleared successfully.")
        except OSError as e:
            logging.error(f"Error clearing cache: {e.strerror}")
    else:
        logging.info("Cache directory not found, nothing to clear.")

def load_config(filepath):
    """Loads and validates the JSON configuration file."""
    logging.info(f"Loading configuration from {filepath}...")
    try:
        with open(filepath, 'r') as f:
            config = json.load(f)
        # Basic validation
        if 'config' not in config or 'sections' not in config:
            raise ValueError("JSON must contain 'config' and 'sections' keys.")
        logging.info("Configuration loaded successfully.")
        return config
    except FileNotFoundError:
        logging.error(f"Configuration file not found at: {filepath}")
        return None
    except json.JSONDecodeError:
        logging.error(f"Invalid JSON in configuration file: {filepath}")
        return None
    except ValueError as e:
        logging.error(f"Configuration validation failed: {e}")
        return None

def get_wiki_image_url(page_title, api_url, session):
    """Fetches the main image URL for a given wiki page using a requests session."""
    logging.info(f"Fetching image URL for wiki page: '{page_title}'")
    params = {
        "action": "query",
        "format": "json",
        "titles": page_title,
        "prop": "pageimages",
        "pithumbsize": 500,  # Request a reasonably sized thumbnail
        "redirects": 1,      # Follow redirects
    }
    try:
        response = session.get(api_url, params=params)
        response.raise_for_status()
        data = response.json()
        pages = data.get("query", {}).get("pages", {})
        if not pages:
            logging.warning(f"No pages found in API response for '{page_title}'.")
            return None

        # The page ID is unknown, so we get the first (and only) page from the dict
        page_id = next(iter(pages))
        if page_id == "-1":
            logging.warning(f"Wiki page '{page_title}' does not exist.")
            return None

        page_data = pages[page_id]
        image_info = page_data.get("thumbnail")
        if image_info and "source" in image_info:
            logging.info(f"Found image URL for '{page_title}': {image_info['source']}")
            return image_info["source"]
        else:
            logging.warning(f"No image found on wiki page '{page_title}'.")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"Network error fetching image URL for '{page_title}': {e}")
        return None

def download_image(url, cache_path, session):
    """Downloads an image from a URL and saves it to the cache."""
    logging.info(f"Downloading image from {url} to {cache_path}")
    try:
        response = session.get(url, stream=True)
        response.raise_for_status()
        with open(cache_path, 'wb') as f:
            shutil.copyfileobj(response.raw, f)
        logging.info(f"Successfully cached image: {cache_path}")
        return cache_path
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to download image from {url}: {e}")
        return None

def get_image(wiki_title, api_url, session):
    """Fetches an image, using the cache if available."""
    if not wiki_title:
        return None

    # Sanitize title to create a valid filename
    safe_filename = quote_plus(wiki_title) + ".png"
    cache_path = os.path.join(CACHE_DIR, safe_filename)

    if os.path.exists(cache_path):
        logging.info(f"Found '{wiki_title}' in cache: {cache_path}")
        return cache_path

    logging.info(f"'{wiki_title}' not in cache, fetching from wiki...")
    image_url = get_wiki_image_url(wiki_title, api_url, session)
    if image_url:
        return download_image(image_url, cache_path, session)
    return None

def process_sections(config_data, session):
    """
    Iterates through sections and tiles, fetches images, and prepares data for generation.
    """
    logging.info("Processing sections and tiles...")
    global_config = config_data['config']
    api_url = global_config['wikiApiUrl']
    auto_link = global_config.get('autoLinkTileInstances', False)
    auto_generate_ids = global_config.get('autoGenerateTileIDs', False)

    all_tile_data_for_csv = []
    image_layout_data = []

    for section_index, section in enumerate(config_data['sections']):
        logging.info(f"--- Processing section: {section['title']} ---")
        section_layout = {
            'title': section['title'],
            'background_path': get_image(section.get('wiki'), api_url, session),
            'tile_groups': []
        }

        for tile_def_index, tile_def in enumerate(section['tiles']):
            tile_group_layout = {
                'title': tile_def['title'],
                'image_path': get_image(tile_def.get('wiki'), api_url, session),
                'tiles': []
            }

            base_tile_id = ""
            if auto_generate_ids:
                base_tile_id = f"s{section_index+1}-t{tile_def_index+1}"
                logging.info(f"Auto-generating base tile ID: '{base_tile_id}' for tile '{tile_def['title']}'")
            else:
                base_tile_id = tile_def.get('tileID')
                if not base_tile_id:
                    logging.error(f"Missing 'tileID' for tile '{tile_def['title']}' in section '{section['title']}'. Skipping this tile definition.")
                    continue # Skip this tile definition entirely

            for i, points in enumerate(tile_def['points']):
                unique_id = f"{base_tile_id}-{i+1}"
                
                prereq_val = ''
                if auto_link and i > 0:
                    # Link this tile to the previous one in the sequence
                    previous_tile_id = f"{base_tile_id}-{i}"
                    # Format as a JSON array of arrays for the web app's prerequisite system
                    # e.g., [["some-tile-1"]] which means "some-tile-1 is required"
                    prereq_val = json.dumps([[previous_tile_id]])

                # Data for the CSV file
                csv_tile = {
                    'id': unique_id,
                    'Name': tile_def['title'],
                    'Points': points,
                    'Description': tile_def['description'],
                    'Prerequisites': prereq_val,
                    # Positional data will be added later
                }
                all_tile_data_for_csv.append(csv_tile)

                # Data for the image layout
                tile_group_layout['tiles'].append({'id': unique_id})
            
            section_layout['tile_groups'].append(tile_group_layout)
        image_layout_data.append(section_layout)

    return all_tile_data_for_csv, image_layout_data

def generate_board_image(config, image_layout_data, all_tile_data_for_csv, output_path):
    """Generates the final 'tall' board image."""
    logging.info("Generating final board image...")
    
    # --- Load Fonts ---
    # Load each font individually to be resilient to one missing font file.
    try:
        board_title_font = ImageFont.truetype(config.get('boardTitleFont', 'arial.ttf'), config.get('boardTitleFontSize', 64))
    except IOError:
        logging.warning(f"Board title font '{config.get('boardTitleFont')}' not found. Falling back to default.")
        board_title_font = ImageFont.load_default()
    try:
        section_font = ImageFont.truetype(config['sectionTitleFont'], config['sectionTitleFontSize'])
    except IOError:
        logging.warning(f"Section title font '{config['sectionTitleFont']}' not found. Falling back to default.")
        section_font = ImageFont.load_default()
    try:
        tile_font = ImageFont.truetype(config['tileTitleFont'], config['tileTitleFontSize'])
    except IOError:
        logging.warning(f"Tile title font '{config['tileTitleFont']}' not found. Falling back to default.")
        tile_font = ImageFont.load_default()

    # --- Calculate Section Heights & Board Dimensions ---
    section_columns = config.get('sectionColumns', 1)
    tile_columns = config.get('tileColumns', 5)
    tile_width = config.get('tileWidth', 64)
    tile_padding = config.get('tilePadding', 5)
    padding = config['sectionPadding']

    # NEW: Calculate section_width based on tile configuration
    section_width = (tile_width * tile_columns) + (tile_padding * (tile_columns - 1)) + (padding * 2)

    section_heights = []
    for section in image_layout_data:
        height = padding + config['sectionTitleFontSize'] + padding
        for group in section['tile_groups']:
            height += config['tileTitleFontSize'] + config['tilePadding']
            num_rows = -(-len(group['tiles']) // tile_columns)  # Ceiling division
            height += num_rows * (config['tileWidth'] + config['tilePadding'])
        height += padding
        section_heights.append(height)

    board_width = (section_width * section_columns) + (padding * (section_columns + 1))
    title_box_height = config.get('boardTitleFontSize', 64) + (padding * 2)
    total_board_height = padding + title_box_height + padding
    num_section_rows = -(-len(image_layout_data) // section_columns)
    for i in range(num_section_rows):
        row_start_index = i * section_columns
        row_end_index = row_start_index + section_columns
        max_row_height = max(section_heights[row_start_index:row_end_index]) if row_start_index < len(section_heights) else 0
        total_board_height += max_row_height + padding

    # --- Create Image ---
    board = Image.new('RGB', (board_width, int(total_board_height)), color=config['themeColors']['background'])
    draw = ImageDraw.Draw(board, 'RGBA') # Use RGBA for transparent shapes

    # --- Draw Board Title Box and Text ---
    title_text = config.get('boardTitle', '')
    if title_text:
        title_box_y = padding
        
        # Draw themed background box for the title
        title_bg_color = config['themeColors'].get('boardTitleBackgroundColor')
        if title_bg_color:
            draw.rectangle(
                [padding, title_box_y, board_width - padding, title_box_y + title_box_height],
                fill=title_bg_color
            )
        title_border_color = config['themeColors'].get('boardTitleBorderColor')
        if title_border_color:
            draw.rectangle(
                [padding, title_box_y, board_width - padding, title_box_y + title_box_height],
                outline=title_border_color,
                width=2
            )
        
        # Calculate centered position for the text
        text_bbox = draw.textbbox((0, 0), title_text, font=board_title_font)
        text_x = (board_width - (text_bbox[2] - text_bbox[0])) / 2
        text_y = title_box_y + (title_box_height - (text_bbox[3] - text_bbox[1])) / 2
        draw.text((text_x, text_y), title_text, font=board_title_font, fill=config['themeColors'].get('primaryText', '#ffffff'))
    
    # --- Draw Sections ---
    current_board_y = padding + title_box_height + padding
    tile_map = {tile['id']: tile for tile in all_tile_data_for_csv}

    for i in range(num_section_rows):
        row_start_index = i * section_columns
        row_end_index = row_start_index + section_columns
        row_sections = image_layout_data[row_start_index:row_end_index]
        max_row_height = max(section_heights[row_start_index:row_end_index]) if row_start_index < len(section_heights) else 0

        for j, section in enumerate(row_sections):
            section_x = padding + j * (section_width + padding)
            section_y = current_board_y

            # Draw section border
            draw.rectangle(
                [section_x, section_y, section_x + section_width, section_y + max_row_height],
                outline=config['themeColors'].get('sectionBorder', '#333333'),
                width=2
            )

            # Draw section background image
            if section['background_path']:
                try:
                    # Open image and immediately convert to RGBA to preserve transparency info
                    base_img = Image.open(section['background_path']).convert('RGBA')

                    # --- FINAL: "Contain" and center scaling logic, allowing upscaling ---
                    target_w, target_h = section_width, int(max_row_height)
                    
                    # Calculate the ratio and decide which dimension to scale by to fit inside the target
                    ratio_w = target_w / base_img.width
                    ratio_h = target_h / base_img.height
                    scale_ratio = min(ratio_w, ratio_h)

                    new_w = int(base_img.width * scale_ratio)
                    new_h = int(base_img.height * scale_ratio)
                        
                    # Resize with a high-quality filter. This handles both upscaling and downscaling.
                    bg_img = base_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                    
                    # Create a new alpha channel with the desired opacity
                    opacity = int(255 * config.get('sectionBgOpacity', 0.15))
                    alpha = bg_img.getchannel('A')
                    new_alpha = alpha.point(lambda p: int(p * (opacity / 255)))
                    bg_img.putalpha(new_alpha)
                    
                    # Calculate paste position to center the image
                    paste_x = section_x + (target_w - bg_img.width) // 2 # Center horizontally
                    paste_y = int(section_y) + (target_h - bg_img.height) # Align to bottom vertically
                    board.paste(bg_img, (paste_x, paste_y), bg_img) # Use the image's own alpha channel as the mask
                except Exception as e:
                    logging.error(f"Could not process background image {section['background_path']}: {e}")

            # --- Draw content within the section ---
            content_y = section_y + padding
            draw.text((section_x + padding, content_y), section['title'], font=section_font, fill=config['themeColors']['sectionTitle'])
            content_y += config['sectionTitleFontSize'] + padding

            for group in section['tile_groups']:
                draw.text((section_x + padding, content_y), group['title'], font=tile_font, fill=config['themeColors']['tileTitle'])
                content_y += config['tileTitleFontSize'] + config['tilePadding']
                
                for k, tile_instance in enumerate(group['tiles']):
                    col = k % tile_columns
                    row = k // tile_columns
                    
                    x = section_x + padding + col * (config['tileWidth'] + config['tilePadding'])
                    y = content_y + row * (config['tileWidth'] + config['tilePadding'])

                    # Draw semi-transparent tile background
                    tile_bg_color = tuple(config['themeColors'].get('tileBackgroundColor', [50, 50, 50, 128]))
                    draw.rectangle([x, y, x + config['tileWidth'], y + config['tileWidth']], fill=tile_bg_color)

                    # Update CSV data with calculated positions
                    tile_id = tile_instance['id']
                    if tile_id in tile_map:
                        tile_map[tile_id]['Left (%)'] = (x / board_width) * 100
                        tile_map[tile_id]['Top (%)'] = (y / total_board_height) * 100
                        tile_map[tile_id]['Width (%)'] = (config['tileWidth'] / board_width) * 100
                        tile_map[tile_id]['Height (%)'] = (config['tileWidth'] / total_board_height) * 100

                    # Paste tile image
                    if group['image_path']:
                        try:
                            base_tile_img = Image.open(group['image_path']).convert("RGBA")
                            
                            # --- Scale image to fit within tile bounds while preserving aspect ratio ---
                            target_size = config['tileWidth']
                            
                            # Calculate the ratio to scale the image down to fit
                            ratio = min(target_size / base_tile_img.width, target_size / base_tile_img.height)
                            
                            # New dimensions
                            new_w = int(base_tile_img.width * ratio)
                            new_h = int(base_tile_img.height * ratio)
                            
                            tile_img = base_tile_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
                            
                            # Calculate centered paste position
                            paste_x = x + (target_size - new_w) // 2
                            paste_y = y + (target_size - new_h) // 2
                            board.paste(tile_img, (paste_x, paste_y), tile_img) # Use RGBA mask for transparency
                        except Exception as e:
                            logging.error(f"Could not open or paste image {group['image_path']}: {e}")
                            draw.rectangle([x, y, x + config['tileWidth'], y + config['tileWidth']], fill="#555", outline="#888")
                    else:
                        draw.rectangle([x, y, x + config['tileWidth'], y + config['tileWidth']], fill="#333", outline="#666")

                # After processing all tiles in a group, advance the y-position
                num_tile_rows = -(-len(group['tiles']) // tile_columns)
                content_y += num_tile_rows * (config['tileWidth'] + config['tilePadding'])
        
        current_board_y += max_row_height + padding

    board.save(output_path)
    logging.info(f"Board image saved as {output_path}")

def generate_tiles_csv(all_tile_data_for_csv, output_path):
    """Generates the CSV file for importing into the web app."""
    logging.info(f"Generating CSV file: {output_path}")
    if not all_tile_data_for_csv:
        logging.warning("No tile data to generate CSV.")
        return

    headers = ['id', 'Name', 'Points', 'Description', 'Prerequisites', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)']
    try:
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            for tile in all_tile_data_for_csv:
                # Ensure only the required headers are written
                row_data = {h: tile.get(h, '') for h in headers}
                writer.writerow(row_data)
        logging.info(f"CSV file saved as {output_path}")
    except IOError as e:
        logging.error(f"Could not write CSV file: {e}")

def main():
    """Main execution function."""
    setup_logging()
    args = parse_arguments()

    if args.clear_cache:
        clear_cache(CACHE_DIR)

    config_data = load_config(args.config_file)
    if not config_data:
        return

    # --- Create unique output directory ---
    project_title = config_data['config'].get('projectTitle', 'bingo_board')
    # Sanitize title for folder name
    safe_project_title = "".join(c for c in project_title if c.isalnum() or c in (' ', '_', '-')).rstrip().replace(' ', '_')
    
    output_folder_base = os.path.join(OUTPUT_DIR, safe_project_title)
    output_folder = output_folder_base
    counter = 1
    while os.path.exists(output_folder):
        output_folder = f"{output_folder_base}_{counter}"
        counter += 1
    
    os.makedirs(output_folder, exist_ok=True)
    logging.info(f"Created output directory: {output_folder}")

    # Define output file paths
    output_image_path = os.path.join(output_folder, "board.png")
    output_csv_path = os.path.join(output_folder, "tiles.csv")

    # Create cache directory for images
    os.makedirs(CACHE_DIR, exist_ok=True)

    # Use a session for persistent connections and headers
    with requests.Session() as session:
        # It's good practice to set a User-Agent for API requests
        session.headers.update({'User-Agent': 'HomieHuntCreator/1.0 (https://github.com/your-repo; your-contact)'})
        
        all_tile_data_for_csv, image_layout_data = process_sections(config_data, session)
        
        if not all_tile_data_for_csv:
            logging.error("Processing failed: No tiles were generated. Aborting.")
            return
        
        generate_board_image(config_data['config'], image_layout_data, all_tile_data_for_csv, output_image_path)
        generate_tiles_csv(all_tile_data_for_csv, output_csv_path)

    logging.info("Tool finished execution.")

if __name__ == "__main__":
    main()