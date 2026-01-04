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

## 📝 QA & Testing

- [ ] **Full Smoke Test**: Test all pages after removing legacy auth to ensure no regressions.

## Change log

- **Submission Modal**: Fixed issue where the modal closed immediately after acknowledging admin feedback.
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
