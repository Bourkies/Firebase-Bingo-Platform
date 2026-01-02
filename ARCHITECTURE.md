# Project Overview & Architecture

This document outlines the file structure, page logic, and database schema for the Firebase Bingo Platform.

**Tech Stack:**
*   **Frontend Framework:** Vanilla JS with **Lit** for reactive Web Components.
*   **State Management:** **Nano Stores** for global state and Firestore synchronization.

## 1. Key Pages & File Paths

The application follows a modular architecture where each HTML page is driven by a specific JavaScript controller module.

### Main Pages

| Page | File Path | Controller | Description |
| :--- | :--- | :--- | :--- |
| **Admin Dashboard** | `.../Firebase-Bingo-Platform/admin.html` | `js/pages/adminController.js` | Main hub for administrators to review submissions and manage the event. |
| **Captain Dashboard** | `.../Firebase-Bingo-Platform/captain.html` | `js/pages/captainController.js` | Interface for team captains to manage their team members. |
| **Overview / Scoreboard** | `.../Firebase-Bingo-Platform/overview.html` | `js/pages/overviewController.js` | Public-facing dashboard showing the leaderboard, score graph, and activity feed. |
| **Board Setup** | `.../Firebase-Bingo-Platform/setup.html` | `js/pages/setupController.js` | Graphical editor for the bingo board, tiles, and global configuration. |

### Sub-Pages & Tools

| Page | File Path | Controller | Description |
| :--- | :--- | :--- | :--- |
| **User Management** | `.../Firebase-Bingo-Platform/users.html` | `js/pages/usersController.js` | Admin interface for viewing all users and assigning them to teams. |
| **Permissions** | `.../Firebase-Bingo-Platform/permissions.html` | `js/pages/permissionsController.js` | Admin interface for managing user roles (Admin, Event Mod). |
| **Import Config** | `.../Firebase-Bingo-Platform/import_config.html` | `js/pages/importConfigController.js` | Tool to import/export global settings and styles via JSON. |
| **Import Submissions** | `.../Firebase-Bingo-Platform/import_submissions.html` | `js/pages/importSubmissionsController.js` | Tool to bulk import submissions or export them to CSV. |
| **Import Tiles** | `.../Firebase-Bingo-Platform/import_tiles.html` | `js/pages/importTilesController.js` | Tool to bulk import tiles from CSV. |

### Developer Tools

| Page | File Path | Description |
| :--- | :--- | :--- |
| **Interactive Test Plan** | `.../Firebase-Bingo-Platform/dev/test_plan.html` | Interactive dashboard for running smoke tests. Includes buttons to quickly toggle global config settings (Visibility, Censorship, Setup Mode) for testing scenarios. |
| **Troubleshoot** | `.../Firebase-Bingo-Platform/dev/troubleshoot.html` | Diagnostic tool to verify Firebase SDK loading, configuration keys, and security rules. |
| **Theme Creator** | `.../Firebase-Bingo-Platform/dev/theme.html` | Tool for creating and previewing themes. |
| **Dev Hub** | `.../Firebase-Bingo-Platform/dev/dev.html` | Central hub for accessing all developer pages. |

---

## 2. Database Structure (Firestore)

The application uses Cloud Firestore. Below is the schema for the primary collections.

### Collection: `users`
Stores user profiles and authentication roles.
*   **Document ID:** User's Email Address (e.g., `username@fir-bingo-app.com`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `email` | String | The user's email address (matches Doc ID). |
| `uid` | String | Unique User ID from Firebase Auth. |
| `displayName` | String | The user's visible name. |
| `team` | String | Reference to a `teams` document ID. |
| `isAdmin` | Boolean | Grants full access to Setup, Permissions, and Admin pages. |
| `isEventMod` | Boolean | Grants access to Admin page for submission verification. |
| `isNameLocked` | Boolean | Prevents the user from changing their display name. |
| `hasSetDisplayName` | Boolean | Flag to track if the user has completed the welcome flow. |

### Collection: `teams`
Stores team definitions.
*   **Document ID:** Sequential ID (e.g., `team01`, `team02`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String | Unique Team ID (matches Doc ID). |
| `name` | String | Display name of the team. |
| `color` | String | Hex color code used for charts and UI accents. |
| `captainId` | String | UID of the user designated as team captain. |

### Collection: `tiles`
Stores the configuration for each bingo tile on the board.
*   **Document ID:** 6-digit sequential number (e.g., `000001`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `docId` | String | Internal Firestore ID (matches Doc ID). |
| `id` | String | User-facing ID (e.g., "A1", "Boss-1"). Must be unique. |
| `Name` | String | Display title of the tile. |
| `Description` | String | Detailed instructions for the tile. |
| `Points` | Number | Score value of the tile. |
| `Prerequisites` | String/JSON | Logic for unlocking the tile. Can be a CSV string or JSON array of arrays. |
| `Overrides (JSON)` | String | JSON string defining dynamic changes based on team/user. |
| `Left (%)` | Number | Horizontal position on the board (0-100). |
| `Top (%)` | Number | Vertical position on the board (0-100). |
| `Width (%)` | Number | Width relative to board size. |
| `Height (%)` | Number | Height relative to board size. |
| `Rotation` | Number | Rotation in degrees. |
| `packed` (Doc) | JSON | Special document containing all uncensored tiles in a single payload for efficient loading. |

### Collection: `submissions`
Stores player claims for tiles.
*   **Document ID:** Auto-generated UUID

| Field | Type | Description |
| :--- | :--- | :--- |
| `docId` | String | Internal Firestore ID (matches Doc ID). |
| `id` | String | The `id` of the `tiles` document being claimed. |
| `Team` | String | The `id` of the `teams` document. |
| `PlayerIDs` | Array<String> | List of user UIDs involved in the submission. |
| `AdditionalPlayerNames` | String | Text field for non-registered players. |
| `Evidence` | String | URL or text evidence provided by the player. |
| `Notes` | String | Optional notes from the player. |
| `IsComplete` | Boolean | True if the tile is considered "done" (for public boards). |
| `AdminVerified` | Boolean | True if an admin has explicitly approved the submission. |
| `RequiresAction` | Boolean | Flag indicating the submission needs player attention. |
| `AdminFeedback` | String | Message from admin to player regarding rejection/issues. |
| `IsArchived` | Boolean | Soft-delete flag. |
| `Timestamp` | Timestamp | When the submission was created. |
| `CompletionTimestamp` | Timestamp | When the submission was marked complete. |
| `history` | Array<Object> | Audit log of changes to the submission. |

### Collection: `config`
Stores global application settings.

*   **Document ID:** `global` (Singleton document)

| Field | Type | Description |
| :--- | :--- | :--- |
| `pageTitle` | String | Browser tab title. |
| `boardTitle` | String | Title displayed on the board header. |
| `wikiApiUrl` | String | URL for the wiki integration. |
| `themeColors` | Map | Object containing color definitions (background, accent, etc.). |
| `censorTilesBeforeEvent` | Boolean | If true, hides tile details until start time. |
| `enableOverviewPage` | Boolean | Master switch for the public overview page. |
| `scoreOnVerifiedOnly` | Boolean | If true, points are only awarded after Admin Verification. |
| `boardVisibility` | String | 'public' (everyone sees all) or 'private' (teams see only theirs). |
| `tiles_packed_public` (Doc)| JSON | Special document containing censored/public tile data for efficient loading. |
| `...` | Various | Font settings, padding, and layout configuration. |

---

## 3. State Management (Nano Stores)

The application uses **Nano Stores** as the single source of truth for application state. Stores handle all Firestore subscriptions and write operations.

*   **Initialization (Lazy Loading):** The application uses a "Lazy Loading" pattern. `initializeApp()` only initializes Authentication. Data listeners (Tiles, Users, Submissions) are started automatically via `onMount` only when a page actually requires that data. This significantly reduces database read costs.

*   **`authStore.js`**: Manages current user, profile, and permissions (`isAdmin`, `isEventMod`, `isTeamCaptain`).
*   **`configStore.js`**: Syncs the `config/global` document.
*   **`teamsStore.js`**: Syncs the `teams` collection.
*   **`tilesStore.js`**: Syncs the `tiles` collection.
*   **`submissionsStore.js`**: Syncs the `submissions` collection.
*   **`usersStore.js`**: Syncs the `users` collection.

## 4. Shared Components

*   **`<app-navbar>` (Lit Component)**: 
    *   Included on every page.
    *   **Role:** Acts as the application shell. It initializes the global stores (`initializeApp`), manages Authentication state (Login/Signup/Welcome modals), and handles navigation.
    *   **Tech:** Built with **Lit** for reactive rendering based on `authStore` state.
*   **`TileRenderer.js`**: Standardized logic for rendering bingo tiles.
*   **`Scoreboard.js`**: Centralized logic for calculating scores and rendering the leaderboard.
*   **`FormBuilder.js`**: Utility for generating dynamic forms (used in Setup).

## 5. Theming System

The application supports dynamic theming (e.g., Light/Dark modes) controlled by the Navbar.

*   **CSS Variables:** Themes are defined in `css/theme.css` using CSS variables (e.g., `--bg-color`, `--primary-text`, `--accent-color`).
*   **Switching Mechanism:** The `<app-navbar>` updates the `data-theme` attribute on the `<html>` element (e.g., `<html data-theme="dark">`).
*   **Reactivity:** 
    *   CSS styles update automatically via the cascade.
    *   Canvas elements (like the Scoreboard Chart) listen for the custom `theme-changed` event dispatched by the Navbar to trigger a re-render with the new color palette.

## 6. Authentication Strategy

The project utilizes a **Username + Password** authentication model using a hidden email domain.

*   **Mechanism:** Users sign up and log in using a simple username. The application automatically appends `@fir-bingo-app.com` to the input to construct a valid email address for Firebase Authentication (e.g., `myuser` becomes `myuser@fir-bingo-app.com`).
*   **Objective:** To move towards using this username-based flow exclusively, removing the need for users to provide real email addresses or use third-party providers.

## 7. Security Rules (Firestore)

The `firestore.rules` file enforces Role-Based Access Control (RBAC) using custom helper functions.

*   **Roles:**
    *   **Admin:** Full write access to global config, tiles, teams, and styles. Can manage all users.
    *   **Event Mod:** Can verify submissions and view all users.
    *   **Team Captain:** Can view/list all users (to add members) and update their own team's roster.
    *   **Player:** Can create/update submissions for their own team and read their own/teammates' profiles.

*   **Key Rules:**
    *   **Public Read:** `config`, `teams`, and `styles` are readable by everyone.
    *   **Conditional Read:** `tiles` are readable unless `censorTilesBeforeEvent` is true (then only Admins/Mods).
    *   **Submissions:** Players can only create/update submissions for their assigned team.
    *   **Users:** Users can only update specific fields (displayName, email) on their own profile.

## 8. Documentation Maintenance

*   **`README.md`**: Serves as the entry point for developers and administrators. It **must** be kept up-to-date with any changes to the project structure, setup instructions, or key features.
*   **`ARCHITECTURE.md`**: Serves as the technical reference for AI assistants and developers, detailing the schema, file paths, and state management.

## 9. Performance & Caching Strategy

To minimize Firestore read costs and ensure scalability for 100+ concurrent users, the app employs a 3-layer optimization strategy:

1.  **Packed Tiles:**
    *   Instead of reading 100+ individual tile documents, players read a single "Packed" document (`config/tiles_packed_public` or `tiles/packed`).
    *   This reduces tile-related reads by ~99%.
2.  **Firestore Offline Persistence:**
    *   Enabled in `firebase-config.js`. Caches Submissions and Users to IndexedDB.
    *   Subsequent page loads only download *changed* data (deltas), often resulting in 0 reads for static data.
3.  **Local Storage Caching:**
    *   Used for `tiles`, `teams`, and `config`.
    *   Allows the board and UI to render instantly (0 latency) while the background listener checks for updates.