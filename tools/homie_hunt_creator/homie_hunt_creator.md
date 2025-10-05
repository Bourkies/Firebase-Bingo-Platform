# Homie Hunt Creator - Project Plan

## 1. Overview

This tool is a command-line utility written in Python designed to automate the creation of a "Homie Hunt" bingo event. It takes a structured JSON file as input, fetches images from a specified wiki, composes them into a single "tall" board image, and generates a corresponding CSV file for the tiles. This CSV is formatted for direct import into the Firebase Bingo Platform.

## 2. Core Features

*   **JSON-driven Configuration**: All event details, sections, and tiles are defined in a single JSON file.
*   **Automated Image Fetching**: Fetches boss and item images from a wiki (e.g., the OSRS Wiki) using its API.
*   **Image Caching**: Caches downloaded images locally to speed up subsequent runs and reduce network requests.
*   **Composite Image Generation**: Stitches the fetched images together into a single, large "tall" board image according to layout rules.
*   **CSV Data Export**: Generates a `tiles.csv` file with all tile data, including calculated positions, ready for import.
*   **Informational Logging**: Provides clear console output about its progress, including image fetching, processing, and file generation.

## 3. Input: `config.json` Structure

The tool is driven by a single `config.json` file. This file contains global settings and an array of "sections" that make up the board.

### 3.1. Top-Level Structure

The JSON object has two main keys: `config` for global settings and `sections` for the board content.

### 3.2. Global `config` Object

This object contains all the settings for the board's appearance, layout, and behavior.

#### General Settings
*   `projectTitle` (string): The name of your event, used for the output directory name.
*   `boardTitle` (string): The main title text to be drawn at the top of the board image.
*   `wikiApiUrl` (string): The URL to the MediaWiki API endpoint (e.g., `https://oldschool.runescape.wiki/api.php`).
*   `autoLinkTileInstances` (boolean): If `true`, automatically creates prerequisites to chain tile instances together (e.g., tile `-2` will require tile `-1`).
*   `autoGenerateTileIDs` (boolean): If `true`, the script will automatically generate a base `tileID` for each tile definition based on its position (e.g., `s1-t2`). If `false` (default), you must provide a `tileID` for each tile.

#### Layout & Sizing
*   `sectionColumns` (integer): The number of section columns to arrange on the board. Defaults to `1`.
*   `sectionWidth` (integer): The width of each section in pixels. Defaults to `400`.
*   `sectionPadding` (integer): The padding in pixels inside and around sections.
*   `sectionBgOpacity` (float): The opacity of the section background images, from `0.0` (transparent) to `1.0` (opaque). Defaults to `0.15`.
*   `tileColumns` (integer): The number of tile columns within each tile group. Defaults to `5`.
*   `tileWidth` (integer): The width and height of each square tile in pixels.
*   `tilePadding` (integer): The padding in pixels between tiles.

#### Fonts
*   `boardTitleFont` (string): Path to the `.ttf` font file for the main board title. Defaults to `arial.ttf`.
*   `boardTitleFontSize` (integer): Font size for the main board title. Defaults to `64`.
*   `sectionTitleFont` (string): Path to the `.ttf` font file for section titles.
*   `sectionTitleFontSize` (integer): Font size for section titles.
*   `tileTitleFont` (string): Path to the `.ttf` font file for tile group titles.
*   `tileTitleFontSize` (integer): Font size for tile group titles.

#### Theming & Colors (`themeColors` object)
This nested object defines the color palette for the generated board image.

*   `background` (string): The background color of the entire board image (e.g., `#121212`).
*   `primaryText` (string): The color for the main board title text (e.g., `#ffffff`).
*   `boardTitleBackgroundColor` (string, optional): The fill color for the box behind the main board title.
*   `boardTitleBorderColor` (string, optional): The border color for the box behind the main board title.
*   `sectionBorder` (string): The color of the border around each section (e.g., `#333333`).
*   `sectionTitle` (string): The color for section title text.
*   `tileBackgroundColor` (array): An `[R, G, B, A]` array for the semi-transparent background drawn behind each tile image (e.g., `[50, 50, 50, 128]`).
*   `tileTitle` (string): The color for tile group title text.

### 3.3. Section Object Structure

Each object in the `sections` array represents a distinct area on the board (e.g., a boss).

*   `title`: The display name for the section.
*   `wiki`: The name of the wiki page to query for the section's background image.
*   `tiles`: An array of tile definitions for this section.

### 3.4. Tile Object Structure

Each object in a section's `tiles` array defines a type of tile. The tool will generate multiple instances of this tile based on the `points` array.

*   `title`: The display name of the item/task.
*   `description`: The full description of the task.
*   `tileID` (string, optional): A **base ID** for the tile. The tool will append a suffix (e.g., `-1`, `-2`) to create unique IDs for each instance. This key is required unless `autoGenerateTileIDs` is set to `true` in the global config.
*   `wiki`: The name of the wiki page to query for the tile's image.
*   `points`: An array of numbers. The **length** of this array determines how many instances of this tile are created. Each instance will be assigned the corresponding point value from the array.

### 3.5. Complete `config.json` Example

A complete example can be found in the `HHC_config.example.json` file. You can copy this file to `config.json` and modify it to create your own event.

## 4. Output Files

1.  **`board.png`**: A single, tall PNG image containing all the generated sections and tiles.
2.  **`tiles.csv`**: A CSV file with headers matching the import tool (`id`, `Name`, `Points`, `Description`, `Prerequisites`, `Left (%)`, `Top (%)`, `Width (%)`, `Height (%)`).

## 5. Directory Structure

```
/tools/homie_hunt_creator/
├── homie_hunt_creator.py   # The main script
├── homie_hunt_creator.md   # This project plan
├── requirements.txt        # Python dependencies (e.g., Pillow, requests)
├── HHC_config.example.json # An example configuration file
├── config.json             # The user-created input file
└── .cache/                 # (Git Ignored) For storing downloaded images
└── output/                 # (Git Ignored) For generated boards
    └── my_bingo_event/
        ├── board.png
        └── tiles.csv
```

## 6. Usage

The tool is run from the command line within the `tools/homie_hunt_creator/` directory.

### 6.1. Installation

First, install the required Python libraries using pip and the `requirements.txt` file. It's recommended to do this within a Python virtual environment.

```bash
pip install -r requirements.txt
```
### 6.2. Running the Generator
To generate the board image and CSV file, run the Python script and provide the path to your config.json file as an argument.

```bash
python homie_hunt_creator.py HHC_config.example.json
```
### 6.3. Clearing the Cache
To delete all cached images and force the tool to re-download them on the next run, use the --clear-cache flag

```bash
python homie_hunt_creator.py config.json --clear-cache
```
