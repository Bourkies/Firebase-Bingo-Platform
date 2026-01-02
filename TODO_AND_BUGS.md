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

- (Add bugs here as they are discovered during QA)

## 📝 QA & Testing

- [ ] **Full Smoke Test**: Test all pages after removing legacy auth to ensure no regressions.

## Change log

