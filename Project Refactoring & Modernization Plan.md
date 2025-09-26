# **Project Refactoring & Modernization Plan**

This document outlines a high-level strategy to refactor the Firebase Bingo Platform from a collection of self-contained HTML pages into a modern, modular, and maintainable web application.  
**Primary Goals:**

1. **Drastically Reduce Code Duplication:** Centralize shared logic for authentication, data management, and UI components.  
2. **Improve Manageability:** Break down large files (like setup.html) into small, focused modules that are easier to understand, debug, and maintain.  
3. **Ensure UI Consistency:** Create single "sources of truth" for UI components like the navbar and bingo tiles to guarantee they look and behave identically across all pages.  
4. **Enhance AI Collaboration:** Produce smaller, more focused files that can be easily fed into AI tools for analysis, debugging, or further development without hitting context limits.

## **The Blueprint: Target File Structure**

This is the target architecture we are working towards. It separates shared services (core), reusable UI components (components), and page-specific logic (pages).  
/  
├── index.html  
├── admin.html  
├── overview.html  
├── setup.html  
├── permissions.html  
├── users.html  
├── import_tiles.html  
├── import_config.html  
├── import_submissions.html  
├── troubleshoot.html 
├── firestore.rules
├── storage.rules
├── .gitignore  
├── TEST_PLAN.md  
├── Project Refactoring & Modernization Plan.md  
├── README.md  
│
├── .github/
│   └── workflows/
│       ├── firebase-hosting-merge.example.yml # Template for main branch deployment
│       └── firebase-hosting-pr.example.yml    # Template for pull request previews
│  
├── js/  
│   ├── core/  
│   │   ├── firebase-config.example.js  \# Template for Firebase keys
│   │   ├── auth.js                 \# Centralized authentication logic  
│   │   ├── utils.js                \# Truly shared helper functions  
│   │   └── data/                   \# Folder for data-specific managers
│   │       ├── configManager.js      \# Handles 'config' and 'styles' collections
│   │       ├── tileManager.js        \# Handles 'tiles' and 'public_tiles'
│   │       ├── submissionManager.js  \# Handles 'submissions'
│   │       ├── userManager.js        \# Handles 'users'
│   │       └── teamManager.js        \# Handles 'teams'
│   │
│   ├── components/  
│   │   ├── Navbar.js             \# Logic for the new universal navbar  
│   │   ├── Scoreboard.js         \# NEW: Centralized scoreboard calculation and rendering
│   │   ├── TileRenderer.js       \# Shared tile rendering logic
│   │   └── FormBuilder.js        \# NEW: Generates forms from a schema for the setup page  
│   │  
│   └── pages/  
│       ├── indexController.js    \# Logic unique to index.html  
│       ├── adminController.js    \# Logic unique to admin.html  
│       ├── overviewController.js \# Logic unique to overview.html
│       ├── setupController.js    \# Main coordinator for the setup page
│       ├── setup/                  \# NEW: Sub-modules for the setup page
│       │   ├── tileEditor.js       \# Manages the main tile details form
│       │   ├── prereqEditor.js     \# Manages prerequisite UI and line rendering
│       │   ├── overrideEditor.js   \# Manages the dynamic overrides UI
│       │   └── globalConfigEditor.js \# Manages global settings and teams panels
│       ├── permissionsController.js \# Logic unique to permissions.html
│       ├── usersController.js    \# Logic unique to users.html
│       ├── importTilesController.js \# Logic unique to import_tiles.html
│       ├── importConfigController.js \# Logic unique to import_config.html
│       ├── importSubmissionsController.js \# Logic unique to import_submissions.html
│       └── troubleshootController.js \# Logic unique to troubleshoot.html
│  

## **Critical Considerations & Potential Issues**

*   **Deployment & CI/CD:** Path changes are a primary source of build failures.
    *   **Requirement:** Before merging any major refactoring branch, the deployment process **must** be tested on that feature branch. The GitHub Actions workflow should be updated and verified to work with the new file structure to prevent breaking the `main` branch.

*   **Component Strategy (Web Components vs. Render Functions):** This plan intentionally uses a mix of component patterns.
    *   **Web Components (`Navbar.js`):** Used for self-contained UI elements that manage most of their own state and have minimal external dependencies. They are "drop-in" components.
    *   **Render Functions (`TileRenderer.js`, `FormBuilder.js`):** Used for UI elements that are highly dependent on external state and are frequently re-rendered by a parent controller. This pattern is more lightweight and performant for lists of items or dynamic forms where the state lives in the controller, not the component.
    *   **Guideline:** This distinction should be maintained. New components should be evaluated to see which pattern fits best.

*   **Event Listener Management:** Removing inline `onclick` attributes and using `addEventListener` is a core goal. However, this can lead to "dead" event listeners if the DOM is updated via `innerHTML`.
    *   **Requirement:** Page controllers must use **event delegation**. Instead of attaching a listener to each individual button (`button.addEventListener(...)`), attach a single listener to a static parent container (`container.addEventListener(...)`). This ensures that events from dynamically added or replaced elements are still captured and handled correctly.

*   **Maintaining Live Syncing:** A core feature of the current application is that all pages update in real-time as data changes in Firestore. This is achieved using `onSnapshot` listeners.
    *   **Requirement:** The new `DataManager.js` module **must** preserve this functionality. Instead of just having functions like `getDocument`, it should primarily expose functions that attach these `onSnapshot` listeners and provide callbacks for the pages to use. For example: `listenToCollection(collectionName, (data) => { /* page logic here */ });`. This ensures the "live" nature of the app is not lost.

*   **Global Functions (`window.functionName`):** Several files (like `index.html`) attach functions to the `window` object to make them accessible to `onclick` attributes in the HTML.
    *   **Issue:** This pattern breaks encapsulation and makes code harder to trace.
    *   **Solution:** As you refactor each page into its controller, you should remove the `onclick` attributes from the HTML and attach event listeners programmatically within the controller file (e.g., `document.getElementById('my-button').addEventListener('click', myFunction);`). This is a key part of the "Clean HTML" step in Phase 4.

*   **Correct Import Paths:** This will be the most frequent and tedious task. Every single file that is moved or that imports a moved file will need its import paths updated.
    *   **Issue:** A single incorrect path (e.g., `../` vs `./` or `/js/core/` vs `../core/`) can break a page's functionality entirely.
    *   **Solution:** Be meticulous and test each page thoroughly after refactoring its controller to ensure all modules are loading correctly. Browser developer tools (F12) will show any loading errors in the Console tab.

*   **Data Management Complexity:** To avoid creating a single, overly-large `DataManager.js` file, we will split data management logic by domain from the start. This keeps each module focused on a specific part of the database (e.g., tiles, users, config), making them easier to manage and test.

## **Phase 0: Pre-flight Check & Documentation**

**Objective:** Document the current state of the application to provide a clear "before" metric for measuring the success of the refactor.

#### **Action 0.1: Inventory Current Codebase**

*   **Task:**
    1.  Create a temporary document (`refactor_inventory.md`).
    2.  For each HTML file, record the approximate line count of the `<script type="module">` block.
    3.  List all major duplicated helper functions found across files (e.g., `showMessage`, `hexToRgba`).
    4.  This document will serve as a benchmark to demonstrate the reduction in code and duplication post-refactor.

## **Phase 1: Foundation \- Centralizing Core Services**

**Objective:** Extract all shared, non-UI logic into a core directory. This creates a stable foundation for all other changes.

#### **Action 1.1: Create New Directories**

1. Create the following new folders in your project:  
   * js/core/  
   * js/components/  
   * js/core/data/
   * js/pages/  
   * A new components/ folder at the root of the project.

#### **Action 1.2: Consolidate auth.js and Firebase Config**

* **Files Involved:** auth.js, firebase-config.js  
* **Task:**  
  1. Move the existing auth.js and firebase-config.js files into the new js/core/ directory.  
  2. Update the import path inside js/core/auth.js to correctly reference firebase-config.js (e.g., import { db, auth, fb } from './firebase-config.js';).
  3. **Deployment Note:** Update the GitHub Actions workflow (`.github/workflows/firebase-hosting-merge.yml`) to create `firebase-config.js` in the new `js/core/` directory.

#### **Action 1.3: Create the DataManager.js Module**
#### **Action 1.3: Create Data Management Modules**

* **Files Involved:** All existing HTML files and the new `js/core/data/` directory.
* **Task:**  
  1. Create new files inside `js/core/data/` for each primary data domain: `configManager.js`, `tileManager.js`, `submissionManager.js`, `userManager.js`, and `teamManager.js`.
  2. Go through every `.html` file and move the corresponding Firestore and Storage logic into the appropriate new manager.
     * `configManager.js` will handle all interactions with the `config` and `styles` collections.
     * `tileManager.js` will handle `tiles` and `public_tiles`.
     * `submissionManager.js` will handle `submissions`.
     * `userManager.js` will handle the `users` collection.
     * `teamManager.js` will handle the `teams` collection.
  3. Each module will maintain an in-memory cache of its data, populated by the real-time listener. It will export functions that act as the sole interface for its domain. For example, `tileManager.js` would export:
     * `listenToTiles(callback)` (for real-time updates)
     * `getTiles()` (for synchronous access to already-loaded data)
     * `updateTile(tileId, data)`
     * `deleteTile(tileId)`
     * `exportTilesToCsv()`
     * `importTiles(data, mode)`

#### **Action 1.4: Consolidate utils.js**

* **Files Involved:** utils.js  
* **Task:**  
  1. Create a new, empty `js/core/utils.js` file.
  2. Go through each HTML file's script, identify helper functions like `showMessage`, `showGlobalLoader`, `hideGlobalLoader`, and `hexToRgba`.
  3. Move the first instance you find of each function into `utils.js` and export it.
  4. Delete all other duplicate copies of these functions from every other file.

## **Phase 2: The Universal Navbar Component**

**Objective:** Create a single, consistent, and encapsulated navbar using modern Web Component standards.

#### **Action 2.1: Create the Navbar Web Component**

* **Files Involved:** js/components/Navbar.js (new)  
* **Task:**  
  1. Create the `Navbar.js` module.
  2. This module will define a custom element (e.g., `class AppNavbar extends HTMLElement`).
  3. Inside its `connectedCallback()` method, it will:
     *   Set its own `innerHTML` to the navbar's complete HTML structure (including the slide-out menu and overlay).
     *   Dynamically build the navigation links, creating "General" and "Admin" sections.
     *   Use the user's auth state (imported from `auth.js`) to conditionally show/hide admin links.
     *   Attach all necessary event listeners for the hamburger menu, auth buttons, and overlay.
     *   Update user info and login/logout button text based on auth state.
  4. The module will register the component with the browser: `customElements.define('app-navbar', AppNavbar);`.
  5. **Note:** The `components/_navbar.html` file is no longer needed, as the HTML is now encapsulated within the JavaScript component.

## **Phase 3: The Reusable Tile Renderer Component**

**Objective:** Create a single source of truth for rendering a bingo tile to ensure 100% visual consistency between the player and admin views.

#### **Action 3.1: Create TileRenderer.js**

* **Files Involved:** js/components/TileRenderer.js (new), index.html, setup.html  
* **Task:**  
  1. Create the TileRenderer.js module.  
  2. Extract the core tile styling logic from the renderBoard/renderTiles functions in index.html and setup.html.  
  3. Export a function: createTileElement(tile, status, config, allStyles, options).  
     * This function will take all data and return a fully styled \<div\> element.  
     * The options object will specify page-specific details, like the base CSS class (tile-overlay for players vs. draggable-tile for admins).

#### **Action 3.2: Create FormBuilder.js (for Setup Page)**

*   **Objective:** Eliminate repetitive form-building logic in `setup.html`.
*   **Files Involved:** `js/components/FormBuilder.js` (new), `setup.html`
*   **Task:**
    1.  Create the `FormBuilder.js` module.
    2.  Export a function like `createFormFields(container, schema, data, changeHandler)`.
    3.  This function will programmatically generate form fields (inputs, selects, textareas, etc.) based on a schema object (like the `configSchema` and `styleSchema` already defined in `setup.html`).
    4.  It will populate the generated fields with values from the `data` object.
    5.  This will replace the large, manual DOM/HTML string creation functions (`renderGlobalConfig`, `createEditorForm`, etc.) in the `setup.html` script, drastically simplifying its logic.

## **Phase 4: Page-by-Page Refactoring**

#### **Action 3.3: Create Scoreboard.js**

*   **Objective:** Centralize scoreboard calculation and rendering logic to eliminate bugs and ensure consistency across the index and overview pages.
*   **Files Involved:** `js/components/Scoreboard.js` (new), `indexController.js`, `overviewController.js`
*   **Task:**
    1.  Create the `Scoreboard.js` module.
    2.  Export a function `calculateScoreboardData(...)` that takes all necessary data (submissions, tiles, teams, config) and returns a sorted array of team scores. This becomes the single source of truth for score calculation.
    3.  Export a function `renderScoreboard(...)` to render the scoreboard UI, handling different visibility rules (e.g., public vs. private boards, team-specific views).
    4.  Refactor `indexController.js` and `overviewController.js` to import and use these new functions, removing their duplicated local logic.

## **Phase 4: Page-by-Page Refactoring**

**Objective:** Systematically refactor each HTML page to use the new modular architecture. This process is repeatable for every page.

1. **Create Controller:** In js/pages/, create a new controller file (e.g., indexController.js).  
2. **Migrate Logic:** Move the entire \<script type="module"\> block from the HTML file into its new controller file.  
3. **Clean and Update HTML:**
    *   Delete the old `<script type="module">` block from the HTML file.
    *   Replace the entire static `<div class="navbar">...</div>` with the new custom element tag: `<app-navbar></app-navbar>`.
    *   Remove any inline `onclick` event handlers from buttons or other elements.
    *   Add a single script tag at the bottom of the `<body>` pointing to the new controller: `<script type="module" src="/js/pages/indexController.js"></script>`.
4. **Refactor Controller:** Edit the new controller file:
    *   **Update Imports**: Change all import paths to point to the new `js/core/` and `js/components/` modules.
        *   The first line of every new page controller should be `import '../components/Navbar.js';` to ensure the custom element is registered.
        *   Subsequent lines will import the specific functions needed from the data manager modules (e.g., `import { listenToTiles, getTiles } from '../core/data/tileManager.js'`).
    *   **Initialize Components**: This step is now simplified. The navbar will initialize itself. The controller's job is to initialize its own page-specific logic.
    *   **Replace Direct DB Calls**: Replace all `fb.getDoc`, `fb.onSnapshot`, etc., calls with functions imported from your new data manager modules in `js/core/data/`.
    *   **Attach Event Listeners**: For every `onclick` you removed from the HTML, add a corresponding `document.getElementById('...').addEventListener('click', ...)` in your controller.

#### **The 4-Step Refactoring Process (for each page):**

#### **Action 4.1: Refactor index.html (Player View)**
* **Files Involved:** index.html, js/pages/indexController.js (new)  
* **Task:** Apply the refined 4-step process. The new `indexController.js` will initialize the navbar and then focus only on its unique logic: handling the team selector, rendering the board using `TileRenderer`, and managing the submission modal. It will import functions from `configManager`, `tileManager`, `submissionManager`, etc.

#### **Action 4.2: Refactor All Remaining Pages**

* **Files Involved:** admin.html, overview.html, users.html, permissions.html, import\_\*.html, etc.  
* **Task:** Repeat the refined 4-step refactoring process for every other page. Each page's controller will become very lean, primarily responsible for initializing the navbar and handling the specific UI elements on that single page.

### **Phase 4.1: Deconstructing the Setup Controller**

**Objective:** The `setupController.js` is the largest and most complex in the project. To improve manageability, it will be broken down into smaller, feature-focused modules. The main controller will become a coordinator, delegating tasks to these new modules.

#### **Action 4.1.1: Create Setup Sub-Modules**
*   **Task:** Create a new directory `js/pages/setup/`. Move logic from `setupController.js` into the following new modules:
    *   **`js/pages/setup/tileEditor.js`**: Manages the "Edit Tile Details" panel, including creating the form, handling input, and managing the tile selector dropdown.
    *   **`js/pages/setup/prereqEditor.js`**: Handles the complex logic for the prerequisite UI and rendering the visual connector lines on the board.
    *   **`js/pages/setup/overrideEditor.js`**: Manages the dynamic "Overrides" section, which has its own complex form-building logic.
    *   **`js/pages/setup/globalConfigEditor.js`**: Responsible for rendering and handling interactions with the "Global Config & Styles" and "Event Teams" panels.
*   **`setupController.js` (The Main Controller)** will be refactored to be much leaner. It will be responsible for initializing the page and data listeners, managing core board interactions (zoom, pan, drag/resize), and importing/calling functions from the new sub-modules.

## **Phase 5: Testing & Documentation**

**Objective:** Verify that all application functionality remains intact and document the new architecture for future contributors.

#### **Action 5.1: Full QA Pass**

*   **Task:** Perform a full smoke test of the application, following the `TEST_PLAN.md`. Pay special attention to:
    *   Navbar loading correctly and responding to auth state changes on all pages.
    *   Real-time data updates propagating correctly across different open tabs/pages.
    *   All forms (submissions, setup page editors) submitting and persisting data correctly.
    *   No errors in the browser console on any page.

#### **Action 5.2: Update Project Documentation**

*   **Files Involved:** `README.md`
*   **Task:** Update the `README.md` to reflect the new project structure. Add a section for developers outlining the modular architecture and providing guidelines for creating new pages or components, including conventions for import paths (e.g., "Core services are imported using `../core/` paths").

---

## **Refactoring Checklist**

### Phase 0: Pre-flight Check
- [x] **0.1:** Create `refactor_inventory.md` and document line counts and duplicated functions.

### Phase 1: Foundation
- [x] **1.1:** Create new directories (`js/core`, `js/components`, `js/pages`).
- [x] **1.1 (cont.):** Create `js/core/data/` directory.
- [x] **1.2:** Move `auth.js` and `firebase-config.js` to `js/core/` and update paths.
- [x] **1.2 (cont.):** Add note to update GitHub Actions deployment script for new config location.
- [x] **1.3:** Create `configManager.js`, `tileManager.js`, `submissionManager.js`, `userManager.js`, and `teamManager.js` in `js/core/data/`.
- [x] **1.3 (cont.):** Move all Firestore/Storage logic from HTML files into the appropriate new manager modules.
- [x] **1.4:** Create `js/core/utils.js`.
- [x] **1.4 (cont.):** Consolidate all helper functions (`showMessage`, `hexToRgba`, etc.) into `utils.js`.

### Phase 2: Universal Navbar
- [x] **2.1:** Create `js/components/Navbar.js` as a Web Component (`<app-navbar>`).

### Phase 3: Reusable Tile Renderer
- [x] **3.1:** Create `js/components/TileRenderer.js` and centralize tile creation logic.
- [x] **3.2:** Create `js/components/Scoreboard.js` to centralize scoreboard logic.
- [x] **3.2:** Create `js/components/FormBuilder.js` to simplify `setup.html` logic.

### Phase 4: Page Controllers
- [x] Refactor `admin.html` -> `js/pages/adminController.js`.
- [x] Refactor `import_config.html` -> `js/pages/importConfigController.js`.
- [x] Refactor `import_submissions.html` -> `js/pages/importSubmissionsController.js`.
- [x] Refactor `import_tiles.html` -> `js/pages/importTilesController.js`.
- [x] Refactor `index.html` -> `js/pages/indexController.js`.
- [x] Refactor `overview.html` -> `js/pages/overviewController.js`.
- [x] Refactor `permissions.html` -> `js/pages/permissionsController.js`.
- [x] Refactor `setup.html` -> `js/pages/setupController.js`.
- [x] **Phase 4.1:** Deconstruct `setupController.js`
  - [x] Create `js/pages/setup/tileEditor.js`.
  - [x] Create `js/pages/setup/prereqEditor.js`.
  - [x] Create `js/pages/setup/overrideEditor.js`.
  - [x] Create `js/pages/setup/globalConfigEditor.js`.
- [x] Refactor `troubleshoot.html` -> `js/pages/troubleshootController.js`.
- [x] Refactor `users.html` -> `js/pages/usersController.js`.

### Phase 5: Testing & Documentation
- [ ] **5.1:** Initial page testing and bug fixing.
- [ ] **5.1:** New Feature Implementation `TEST_PLAN.md`. 
- [ ] **5.2:** Update `TEST_PLAN.md`.
- [ ] **5.3:** Complete a full QA pass using `TEST_PLAN.md`.
- [ ] **5.4:** Update `README.md` with the new architecture and developer guidelines.