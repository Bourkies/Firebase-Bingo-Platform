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
| `captainId` | String | docid of the user designated as team captain. |

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
*   **Document ID:** date team and tile (e.g., `YYMMDD-team1-B1`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | String | The `id` of the `tiles` document being claimed. |
| `Team` | String | The `id` of the `teams` document. |
| `PlayerIDs` | Array<String> | List of user docid's involved in the submission. |
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

### Legacy Context (Removed Features)
Previously, the application supported **Google Sign-In** and **Anonymous** authentication. These have been fully removed to simplify the user experience and codebase.
*   **`isAnonymous`**: This field has been removed from the user schema.
*   **Login Types**: Logic distinguishing between "Google", "Anonymous", and "Username" accounts has been removed. All accounts are now treated uniformly as Username/Password accounts.
*   **Cleanup**: If you encounter code referencing `signInAnonymously`, `GoogleAuthProvider`, or `isAnonymous`, it is legacy code and should be refactored or removed.

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

## 11. Board Logic & Tile Statuses

The board logic determines the visual state of a tile based on the user's team and the tile's submission status.

### Tile Status Lifecycle
1.  **Locked**: The tile cannot be interacted with. This occurs if the tile has prerequisites (defined in `Prerequisites` field) that the team has not yet completed.
2.  **Unlocked**: Prerequisites are met (or none exist), but no submission has been made. The tile is clickable.
3.  **Draft** (Internal: `Partially Complete`): A player has started a submission (saved notes/evidence) but has not marked it as complete (`IsComplete: false`).
4.  **Submitted** (Internal: `IsComplete`): The team has claimed the tile. It is pending review.
5.  **Requires Action**: An Admin or Event Mod has reviewed the submission and requested changes (e.g., broken link, wrong screenshot). The submission is effectively "returned" to the team.
6.  **Verified** (Internal: `AdminVerified`): An Admin or Event Mod has confirmed the submission is valid. Points are awarded (depending on config). The tile is locked and cannot be edited further.

### Board Visibility Modes
*   **Public Board**: Users see the status of tiles for *all* teams.
*   **Private Board**: Users only see the status of tiles for *their own* team.
*   **Setup Mode**: The board is hidden from all non-admin users.
*   **Censored Mode**: Tile names and descriptions are hidden until the event starts, but the grid layout is visible.

### Prerequisite Logic
*   **Format**: Prerequisites are stored as a JSON array of arrays (CNF) or a simple CSV string.
*   **Evaluation**: A tile is unlocked if *at least one* group of prerequisites is fully satisfied (OR logic between groups, AND logic within a group).
*   **Visualization**: In Setup Mode, lines are drawn between tiles to visualize these dependencies.

## 12. User Lifecycle & Permissions

The platform enforces a strict "Self-Service" model for user creation to maintain security and data integrity.

### User Creation
*   **Mechanism:** A user must create their own Firestore profile immediately after Authentication.
*   **Rule:** `allow create: if request.auth.token.email == userEmail`
*   **Implication:** Admins *cannot* manually create user profiles for others via the database console or scripts unless those scripts authenticate *as* the new user.

### User Updates
*   **Self:** Users can update their `displayName` (if `isNameLocked` is false).
*   **Admin:** Can update any field, including Roles (`isAdmin`, `isEventMod`) and `team`.
*   **Captain:** Can update the `team` field for users (assigning/removing them from their own team).

### User Deletion
*   **Auth Account:** Deleting the Firebase Auth account prevents future logins.
*   **Firestore Profile:** The user's profile document in `users` is **retained** by default to preserve data integrity for Submissions and History logs.
*   **Cleanup:** Admins can explicitly delete user documents if necessary (e.g., removing seed data or GDPR requests), but this is a manual administrative action.

### Account Recreation (Relinking)
*   **Behavior:** If a user deletes their Auth account but their Firestore profile is retained, creating a new Auth account with the *same email address* will automatically relink to the existing Firestore profile.
*   **Data Preservation:** The user will regain access to their team assignment, history, and permissions (unless manually revoked by an Admin).

### Profile Regeneration (Orphaned Auth)
*   **Scenario:** A user logs in successfully (Auth account exists), but their Firestore profile document is missing (e.g., manually deleted by an Admin).
*   **Behavior:** The application detects the missing profile upon login and automatically generates a new, default profile.
*   **Implication:** The user retains their Auth UID. Since submissions reference UIDs, historical data remains linked, but the user will lose their Team assignment and Roles (Admin/Mod) until manually re-assigned.

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

## 10. Configuration Modes

The platform supports several global configuration modes that alter the behavior and visibility of the board. These are managed in the **Global Config** section of the Setup page.

### Board Visibility (`boardVisibility`)
*   **Public**: The board is visible to everyone. Users can see all teams and their progress.
*   **Private**: Users can only see the board and submissions for their *own* team. They cannot see other teams' progress.
    *   *Note:* Admins and Event Mods **CAN NOT** see other team's progress (they still have access to other teams submissions in the admin page).

### Pre-Event Censorship (`censorTilesBeforeEvent`)
*   **Enabled**: Hides the `Name` and `Description` of all tiles from non-admin users.
*   **Behavior**:
    *   Tiles are displayed with generic text (e.g., "Censored").
    *   Layout (position, size) is preserved so players can see the board structure.
    *   Clicking a tile does not open the submission modal.
*   **Purpose**: Allows admins to publish the board layout and teams before the event starts without revealing the challenges.

### Setup Mode (`setupModeEnabled`)
*   **Enabled**: Completely hides the board interface from non-admin users.
*   **Behavior**:
    *   **Admins/Mods**: See a warning banner ("SETUP MODE IS ON") but can interact with the board normally to test and configure it.
    *   **Players**: See a "Maintenance / Not Started" message instead of the board.
*   **Purpose**: For making major changes to the board structure or testing without users seeing broken states.