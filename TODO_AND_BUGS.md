# To-Do & Bug Tracker

## 🚨 High Priority


- [x] **Update README**: Instructions updated for Username-only auth and manual Admin setup.

## 🛠️ Refactoring & Modernization

- [ ] **Convert Setup Page to Lit**:
    - [x] Create `<tile-editor-form>` component.
    - Create `<global-config-form>` component.
    - Refactor `setupController.js` to use these components.
- [ ] **Convert Admin Page to Lit**:
    - Create `<submissions-table>` component.
    - Create `<review-modal>` component.
    - Refactor `adminController.js`.
- [ ] **Convert Users & Teams Page to Lit**:
    - Create reactive components for the user table and team management list to improve performance.
- [ ] **Library Integration**:
    - Integrate **Zod** for schema validation (config, tiles, submissions).
    - Integrate **Day.js** for consistent date formatting across the app.
    - (Optional) Integrate **Navigo** for client-side routing if moving to a true SPA structure.

## ✨ New Features

- [ ] **Bingo Bonuses**: Implement logic to group specific tiles together (e.g., "Complete Row 1") that awards bonus points when all are completed.

## 🐛 Known Bugs

- [x] captains Can't add team members (firestore rules issue?)
- [x] Mobile Modal Clipping: Fixed issue where submission modal could not be scrolled to the top/bottom on mobile devices by switching to safe flex centering and dynamic viewport units.

## 📝 QA & Testing

- [ ] **Full Smoke Test**: Test all pages after removing legacy auth to ensure no regressions.

## Change log

- **Admin Dashboard**: Improved the Submission History UI in the review modal. History entries are now structured with clear headers and color-coded diffs (Red/Green) for changed values, making it easier to track edits.
- **Team Selector**: Added "(Your Team)" indicator and highlighting to the player's assigned team in the dropdown list.
- **Index Page Layout**: Refactored the controls area. Removed the static page title heading. Grouped the Team Selector, Search Bar, and Zoom Controls into a vertical stack for better responsiveness. Increased the size of the Team Selector to serve as the main heading.
- **Bug Fix**: Fixed a crash on the Index page caused by `board.js` attempting to update the removed `#page-title` element.
- **Submission Modal**: Fixed issue where the modal closed immediately after acknowledging admin feedback.
- **Mobile Testing**: Updated `firebase-config.example.js` to support connecting to emulators via LAN IP (e.g., 192.168.x.x) for mobile device testing.
- **Admin Dashboard**: Added mobile-specific sorting dropdown and improved filter layout responsiveness.
- **Removed Legacy Auth**: Removed Google Sign-In and Anonymous login methods. The platform now exclusively uses the Username/Password flow (backed by Firebase Email/Password auth with a hidden domain).
    - Removed `isAnonymous` field from user profiles.
    - Removed `signInAnonymously`, `signInWithPopup`, `GoogleAuthProvider` from `firebase-config.js` and `auth.js`.
    - Updated `Navbar.js` to remove legacy login buttons.
    - Updated `usersController.js` and `permissionsController.js` to remove "Login Type" columns and logic.
    - Updated doc id of user is now set to the email address and the uid is moved to a key for the user.
    - **Firestore Rules**: Fixed `isCaptainOfTeam` check to validate against both `uid` and `email` (matching the architecture where `captainId` is the user's email/docId).
    - **Index Page**: Removed the embedded scoreboard component from the main board page in favor of the dedicated Overview page.
    - **Overview Page**: Fixed issue where the activity feed and chart would not populate in Private Board mode because the team filter dropdown was not updating correctly after authentication loaded.
    - **Overview Page**: Updated activity feed to hide player names for non-logged-in users and improved the visual layout of feed items.
    - **Overview Page**: Refined activity feed layout to emphasize team name (colored) and tile ID, moving tile name to a separate line.
    - **Overview Page**: Moved team filter to the top of the main column and added "(Your Team)" indicator to the dropdown options.
    - **Overview Page**: Improved "Points Over Time" chart to only show data points (dots) for the team that scored at that specific timestamp, reducing visual clutter.
    - **Zoom Controls**: Updated zoom behavior to zoom in/out from the center of the viewport instead of the top-left corner.
    - **Mobile Rendering Fix**: Implemented a "Virtual Resolution" system for the board. The board now renders internally at 3000px width and scales down to fit the screen. This eliminates tile jittering caused by sub-pixel rounding and ensures borders remain proportional on mobile devices.
    - **Board Height Fix**: Fixed an issue where the "Virtual Resolution" change caused the board container to take up excessive vertical space. Added logic to dynamically adjust the viewport height to match the scaled board content.
    - **Setup Page Sync**: Applied the "Virtual Resolution" and "Zoom to Center" logic to the Setup page (`setup.html`) to ensure the visual representation and behavior match the main player board.
    - **Setup Page Fixes**: Fixed the "Reset Zoom" button not re-centering the board immediately. Increased the font size of Tile IDs in setup mode to account for the new high-resolution rendering.
    - **Submission Logic**: Fixed issue where `CompletionTimestamp` was not being cleared when a submission was flagged by an admin or reverted to draft.
    - **Submission History**: Improved history logging to correctly reflect state changes for `IsComplete` and `CompletionTimestamp` during Admin flagging and Player acknowledgement.
