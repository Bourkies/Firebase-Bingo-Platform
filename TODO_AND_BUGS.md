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

- captains Can't add team members (firestore rules issue?)

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
    - updated doc id of user is now set to the email address and the uid is moved to a key for the user
