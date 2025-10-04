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

```json
{
  "config": {
    "boardWidth": 1200,
    "projectTitle": "My Bingo Event",
    "boardTitle": "Event Title Here",
    "sectionColumns": 3,
    "sectionWidth": 400,
    "tileColumns": 5,
    "tileWidth": 100,
    "tilePadding": 10,
    "sectionPadding": 20,
    "sectionTitleFont": "path/to/font.ttf",
    "boardTitleFont": "path/to/font.ttf",
    "boardTitleFontSize": 64,
    "sectionBgOpacity": 0.15,
    "sectionTitleFontSize": 48,
    "themeColors": {
      "background": "#1a1a1a",
      "primaryText": "#e0e0e0",
      "sectionBorder": "#333333",
      "sectionTitle": "#00bcd4",
      "tileTitle": "#ffffff"
    },
    "tileTitleFont": "path/to/font.ttf",
    "tileTitleFontSize": 24,
    "wikiApiUrl": "https://oldschool.runescape.wiki/api.php"
  },
  "sections": [
    // ... Section objects go here
  ]
}
```

### 3.2. Section Object Structure

Each object in the `sections` array represents a distinct area on the board (e.g., a boss).

*   `title`: The display name for the section.
*   `wiki`: The name of the wiki page to query for the section's background image.
*   `tiles`: An array of tile definitions for this section.

```json
{
  "title": "Kree'arra",
  "wiki": "Kree'arra",
  "tiles": [
    // ... Tile objects go here
  ]
}
```

### 3.3. Tile Object Structure

Each object in a section's `tiles` array defines a type of tile. The tool will generate multiple instances of this tile based on the `points` array.

*   `title`: The display name of the item/task.
*   `description`: The full description of the task.
*   `tileID`: A **base ID** for the tile. The tool will append a suffix (e.g., `-1`, `-2`) to create unique IDs for each instance.
*   `wiki`: The name of the wiki page to query for the tile's image.
*   `points`: An array of numbers. The **length** of this array determines how many instances of this tile are created. Each instance will be assigned the corresponding point value from the array.

```json
{
  "title": "Armadyl Chestplate",
  "description": "Obtain an Armadyl Chestplate as a drop.",
  "tileID": "K1",
  "wiki": "Armadyl chestplate",
  "points": [100, 50, 25, 10, 5]
}
```

### 3.4. Complete `config.json` Example

```json
{
  "config": {
    "boardWidth": 1200,
    "projectTitle": "Grindmaster Homie Hunt",
    "boardTitle": "Gridmaster bingo",
    "sectionColumns": 3,
    "sectionWidth": 400,
    "tileColumns": 5,
    "tileWidth": 100,
    "tilePadding": 10,
    "sectionPadding": 20,
    "sectionTitleFont": "arial.ttf",
    "boardTitleFont": "arial.ttf",
    "boardTitleFontSize": 64,
    "sectionBgOpacity": 0.15,
    "sectionTitleFontSize": 48,
    "themeColors": {
      "background": "#1a1a1a",
      "primaryText": "#e0e0e0",
      "sectionBorder": "#333333",
      "sectionTitle": "#00bcd4",
      "tileTitle": "#ffffff"
    },
    "tileTitleFont": "arial.ttf",
    "tileTitleFontSize": 24,
    "wikiApiUrl": "https://oldschool.runescape.wiki/api.php"
  },
  "sections": [
    {
      "title": "Kree'arra",
      "wiki": "Kree'arra",
      "tiles": [
        {
          "title": "Armadyl Chestplate",
          "description": "Obtain an Armadyl Chestplate as a drop.",
          "tileID": "K1",
          "wiki": "Armadyl chestplate",
          "points": [100, 50, 25, 10, 5]
        },
        {
          "title": "Armadyl Chainskirt",
          "description": "Obtain an Armadyl Chainskirt as a drop.",
          "tileID": "K2",
          "wiki": "Armadyl chainskirt",
          "points": [100, 50, 25, 10, 5]
        }
      ]
    }
  ]
}
```

## 4. Output Files

1.  **`board.png`**: A single, tall PNG image containing all the generated sections and tiles.
2.  **`tiles.csv`**: A CSV file with headers matching the import tool (`id`, `Name`, `Points`, `Description`, `Left (%)`, `Top (%)`, `Width (%)`, `Height (%)`).

## 5. Directory Structure

```
/tools/homie_hunt_creator/
├── homie_hunt_creator.py   # The main script
├── homie_hunt_creator.md   # This project plan
├── requirements.txt        # Python dependencies (e.g., Pillow, requests)
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
python homie_hunt_creator.py config.json
```
### 4.3. Clearing the Cache
To delete all cached images and force the tool to re-download them on the next run, use the --clear-cache flag

```bash
python homie_hunt_creator.py config.json --clear-cache
```
