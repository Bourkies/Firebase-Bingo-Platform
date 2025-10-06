import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { db, fb } from '../core/firebase-config.js'; // NEW: Import db and fb for direct listener
import * as userManager from '../core/data/userManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as configManager from '../core/data/configManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as submissionManager from '../core/data/submissionManager.js';
import { calculateScoreboardData } from '../components/Scoreboard.js';
import { renderColorKey as renderColorKeyComponent } from '../components/TileRenderer.js';
import { showMessage, showGlobalLoader, hideGlobalLoader, generateTeamColors } from '../core/utils.js';

// Import new sub-modules
import { initializeBoard, renderBoard, renderScoreboard, getTileStatus } from './index/board.js';
import { initializeSubmissionModal, openModal as openSubmissionModal, closeModal as closeSubmissionModal, updateModalContent } from './index/submissionModal.js';

let config = {}, allTeams = {}, allStyles = {}, tiles = [], submissions = [], teamData = {}, scoreboardData = [], currentTeam = '', authState = {}, allUsers = [], teamColorMap = {};
let unsubscribeConfig = null, unsubscribeTiles = null, unsubscribeSubmissions = null, unsubscribeStyles = null, unsubscribeUsers = null;
let unsubscribeFromSingleSubmission = null; // NEW: For the modal listener

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('team-selector').addEventListener('change', handleTeamChange);
    document.body.addEventListener('show-message', (e) => showMessage(e.detail.message, e.detail.isError));

    // NEW: Search bar listeners
    const searchInput = document.getElementById('tile-search-input');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('focus', handleSearchInput); // Show results on focus if there's text
    document.addEventListener('click', handleGlobalClickForSearch); // To close results when clicking away
    injectSearchStyles(); // NEW: Inject CSS for the search bar

    // Initialize sub-modules
    initializeBoard(mainControllerInterface);
    initializeSubmissionModal(mainControllerInterface); // This sets up the base modal listeners

    initializeApp();
    initAuth(onAuthStateChanged);
});

/**
 * NEW: Injects the necessary CSS for the tile search bar into the document's head.
 * This keeps all component-specific logic and styling within the controller.
 */
function injectSearchStyles() {
    const style = document.createElement('style');
    style.textContent = `
        #tile-search-container {
            width: 100%;
            max-width: 1400px; /* Match other main elements */
            margin: 0 auto 1rem auto;
            position: relative; /* For positioning the results dropdown */
            display: none; /* Hidden by default, shown by controller */
        }
        #tile-search-input {
            width: 100%;
            padding: 0.75rem 1rem;
            font-size: 1rem;
            background-color: var(--surface-color);
            color: var(--primary-text);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            box-sizing: border-box;
        }
        #tile-search-input:focus {
            outline: none;
            border-color: var(--accent-color);
            box-shadow: 0 0 0 2px var(--accent-color-transparent);
        }
        #tile-search-results {
            display: none; /* Hidden until there are results */
            position: absolute;
            width: 100%;
            top: 100%;
            left: 0;
            background-color: var(--surface-color);
            border: 1px solid var(--border-color);
            border-top: none;
            border-radius: 0 0 8px 8px;
            max-height: 300px;
            overflow-y: auto;
            z-index: 99; /* Below navbar modal but above board */
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        }
        .search-result-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.75rem 1rem;
            cursor: pointer;
            border-bottom: 1px solid var(--border-color);
        }
        .search-result-item:last-child { border-bottom: none; }
        .search-result-item:hover { background-color: var(--hover-bg-color); }
        .search-result-item.locked { cursor: not-allowed; color: var(--secondary-text); }
        .search-result-item.locked:hover { background-color: transparent; }
        .search-result-status { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
        .search-result-info { display: flex; flex-direction: column; overflow: hidden; }
        .search-result-name { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .search-result-id { font-size: 0.8em; color: var(--secondary-text); }
        .search-result-desc { font-size: 0.8em; color: var(--secondary-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.25rem; }
        .search-result-status-text { font-size: 0.8em; font-weight: bold; }

    `;
    document.head.appendChild(style);
}

async function onAuthStateChanged(newAuthState) {
    console.log('[IndexController] onAuthStateChanged triggered.', { isLoggedIn: newAuthState.isLoggedIn, profileExists: !!newAuthState.profile });
    const oldAuthState = authState;
    authState = newAuthState;
    const loadFirstTeam = config.loadFirstTeamByDefault === true;

    // If the user's login status hasn't changed, but their profile has (e.g., team assignment),
    // we can proceed with updates. The key is to avoid acting before the profile is loaded.
    // The key check: if logged in, but the profile doesn't yet have a team property (even if it's null),
    // it means the Firestore profile hasn't been merged yet. So we wait.
    if (newAuthState.isLoggedIn && newAuthState.profile && newAuthState.profile.team === undefined) {
        console.log("[IndexController] Auth state updated, but full profile (with team) not ready. Deferring board render.");
        return;
    }

    if (newAuthState.teamChanged) {
        const newTeamName = allTeams[newAuthState.profile.team]?.name || 'a new team';
        showMessage(`Your team has been changed to: ${newTeamName}. The board is updating.`, false);
    }

    // Re-populate the selector and set the correct team value now that we know the profile is loaded.
    populateTeamSelector(allTeams, loadFirstTeam); // This will handle private board logic
    const selector = document.getElementById('team-selector');
    
    if (authState.isLoggedIn && authState.profile?.team && !selector.disabled) {
        // For public boards, if the user is logged in and has a team, select it.
        selector.value = authState.profile.team;
    } else if (!selector.value && loadFirstTeam && Object.keys(allTeams).length > 0 && !selector.disabled) {
        // Fallback for public boards if no user team is set but the config says to load the first one.
        selector.value = Object.keys(allTeams).sort((a, b) => a.localeCompare(b))[0];
    }

    setupUsersListener(); // Re-fetch users based on new auth state (e.g., to see teammates).
    setupSubmissionsListener(); // Re-setup the submissions listener based on the new auth state.

    // This is the key fix: After auth is confirmed and the profile is loaded, explicitly trigger a team change and board render.
    handleTeamChange();
}

// This function sets up the listener for tiles, respecting censorship rules.
const setupTilesListener = () => {
    if (unsubscribeTiles) unsubscribeTiles();
    // Use the centralized tileManager to handle fetching tiles based on permissions and config.
    unsubscribeTiles = tileManager.listenToTiles((newTiles) => { // FIX: Changed log to match format
        console.log("[IndexController] Tiles updated in real-time.");
        tiles = newTiles;
        processAllData();
        // Do not render here directly. Let the auth state change or team selection be the trigger.
        // Only render if a team is already selected, which means initial load is complete.
        if (currentTeam) {
            console.log("[IndexController] Tiles updated, re-rendering for current team.");
            renderBoard();
        }
    }, authState, config, true); // Pass true for includeDocId
};

// This function sets up the listener for submissions, respecting privacy rules.
const setupSubmissionsListener = () => {
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    // Use the centralized submissionManager to handle fetching submissions based on permissions and config.
    unsubscribeSubmissions = submissionManager.listenToSubmissions((newSubmissions) => { // FIX: Changed log to match format
        console.log("[IndexController] Submissions updated in real-time.");
        // The manager already converts timestamps, so we just assign the data.
        submissions = newSubmissions;
        processAllData();
        // Do not render here directly. Let the auth state change or team selection be the trigger.
        // Only render if a team is already selected, which means initial load is complete.
        if (currentTeam) {
            console.log("[IndexController] Submissions updated, re-rendering for current team.");
            renderBoard();
        }
    }, authState, config);
};

function initializeApp() {
    let unsubscribeTeams = null; // New listener for teams

    let initialDataLoaded = { config: false, teams: false, tiles: false, submissions: false, styles: false, users: false };
    // Check if initialization is already in progress to avoid race conditions on re-authentication
    if (document.body.dataset.initializing === 'true') {
        console.log("[IndexController] Initialization already in progress. Aborting new run.");
        return;
    }
    document.body.dataset.initializing = 'true';
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
        }
    };

    showGlobalLoader();

    // Detach old listeners if they exist to prevent memory leaks on hot-reloads
    if (unsubscribeConfig) unsubscribeConfig();
    if (unsubscribeTiles) unsubscribeTiles();
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    if (unsubscribeStyles) unsubscribeStyles();
    if (unsubscribeUsers) unsubscribeUsers();

    // Listener for the main configuration document
    unsubscribeConfig = configManager.listenToConfigAndStyles((newConfigData) => {
        console.log("[IndexController] Config updated in real-time.");
        if (newConfigData.error || !newConfigData.config) {
            document.getElementById('board-container').innerHTML = `<div class="error-message">Board configuration not found. Please contact an admin.</div>`;
            hideGlobalLoader();
            return;
        }
        config = newConfigData.config;
        allStyles = newConfigData.styles;

        setupTilesListener();
        setupSubmissionsListener();
        
        applyGlobalStyles();
        const loadFirstTeam = config.loadFirstTeamByDefault === true;
        populateTeamSelector(allTeams, loadFirstTeam); // This is correct
        // Do not call handleTeamChange here. Let onAuthStateChanged be the single source of truth for this.
        // The initial render will happen when all data is loaded and auth state is confirmed.
        // For a logged-out user on a public board, the first team selection will trigger the render.
        // Only render if a team is already selected, which means initial load is complete.
        if (currentTeam) {
            console.log("[IndexController] Config updated, re-rendering for current team.");
            renderBoard();
        }

        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        mainControllerInterface.renderColorKey();
        if (!initialDataLoaded.config) { initialDataLoaded.config = true; initialDataLoaded.styles = true; checkAllLoaded(); }
        document.body.dataset.initializing = 'false'; // Mark initialization as complete
    });

    // Listener for the new teams collection
    unsubscribeTeams = teamManager.listenToTeams((newTeams) => { // FIX: Changed log to match format
        console.log("[IndexController] Teams updated in real-time.");
        allTeams = newTeams;
        teamColorMap = generateTeamColors(Object.keys(newTeams));
        const loadFirstTeam = config.loadFirstTeamByDefault === true;
        const selector = document.getElementById('team-selector');

        populateTeamSelector(allTeams, loadFirstTeam);
        // If no team is selected yet and the config is set, select the first one.
        if (!selector.value && loadFirstTeam && Object.keys(allTeams).length > 0) {
            // As a fallback, if the setting is enabled, select the first team in the list.
            selector.value = Object.keys(allTeams).sort((a, b) => a.localeCompare(b))[0];
        }

        // Do not call handleTeamChange here. It will be called by onAuthStateChanged when ready.
        // Only render if a team is already selected, which means initial load is complete.
        if (currentTeam) {
            console.log("[IndexController] Teams updated, re-rendering for current team.");
            renderBoard();
        }
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    });
}

// Listener for users collection, must be called after auth state is known
function setupUsersListener() {
    if (unsubscribeUsers) unsubscribeUsers();

    // NEW: Only listen to users if logged in. This prevents permission errors for guests.
    if (!authState.isLoggedIn) {
        allUsers = []; // Clear user data on logout
        return;
    }

    unsubscribeUsers = userManager.listenToUsers((newUsers) => { // FIX: Changed log to match format
        console.log(`[IndexController] Users updated. Received ${newUsers.length} users.`);
        allUsers = newUsers;
    }, authState);
}

function processAllData() {
    console.log('[IndexController] processAllData called.');
    teamData = {};
    const teamIds = allTeams ? Object.keys(allTeams) : [];

    teamIds.forEach(teamId => {
        const teamSubmissions = submissions.filter(s => s.Team === teamId && !s.IsArchived);
        const tileStates = {};

        teamSubmissions.forEach(sub => { // sub.id is the user-facing tile ID
            const tileId = sub.id;
            if (!tileStates[tileId]) {
                tileStates[tileId] = { hasSubmission: false, complete: false, verified: false, requiresAction: false };
            }
            tileStates[tileId].hasSubmission = true;
            if (sub.IsComplete) tileStates[tileId].complete = true;
            if (sub.AdminVerified) tileStates[tileId].verified = true;
            if (sub.RequiresAction) tileStates[tileId].requiresAction = true;
        });
        teamData[teamId] = { tileStates };
    });

    // NEW: Use the centralized scoreboard calculation function
    scoreboardData = calculateScoreboardData(submissions, tiles, allTeams, config);

    // NEW: Render the scoreboard here, now that scoreboardData is guaranteed to be calculated.
    renderScoreboard();
}

function applyGlobalStyles() {
    if (!config) return;
    const elements = document.querySelectorAll('.navbar, .controls, #board-container, .info-container');

    let configValue = config.maxPageWidth;
    let maxWidth;

    if (configValue && configValue.trim() !== '') {
        // If a value is provided, process it.
        // Check if it's a plain number string (e.g., "500").
        if (/^\d+$/.test(configValue.trim())) {
            // If so, append 'px' to make it a valid CSS value.
            maxWidth = `${configValue.trim()}px`;
        } else {
            // Otherwise, use the value as is (e.g., "500px", "90%", "none").
            maxWidth = configValue;
        }
    } else {
        // If the config value is missing, null, or an empty string, use the default.
        maxWidth = '1400px';
    }
    elements.forEach(el => el.style.maxWidth = maxWidth);
}

function populateTeamSelector(teams = {}, loadFirstTeam = false) {
    const selector = document.getElementById('team-selector');
    selector.innerHTML = '';
    selector.disabled = false; // Enable by default

    const isPrivate = config.boardVisibility === 'private';

    if (isPrivate) {
        if (authState.isLoggedIn && authState.profile?.team) {
            // Private board, user is on a team: Lock to their team.
            const teamId = authState.profile.team;
            const teamData = teams[teamId];
            if (teamData) {
                const option = document.createElement('option');
                option.value = teamId;
                option.textContent = teamData.name;
                selector.appendChild(option);
                selector.value = teamId;
                selector.disabled = true;
            } else {
                // Edge case: user's team doesn't exist in allTeams. Treat as no team.
                selector.innerHTML = '<option value="" selected disabled>Select a Team...</option>';
                selector.disabled = true;
            }
        } else {
            // Private board, user not logged in or not on a team: Show disabled placeholder.
            selector.innerHTML = '<option value="" selected disabled>Select a Team...</option>';
            selector.disabled = true;
        }
    } else {
        // Public board: Original behavior
        if (!loadFirstTeam) {
            const placeholder = document.createElement('option');
            placeholder.value = "";
            placeholder.textContent = "Select a Team...";
            placeholder.disabled = true;
            placeholder.selected = true;
            selector.appendChild(placeholder);
        }
        Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, teamData]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = teamData.name;
            selector.appendChild(option);
        });
    }
}

function handleTeamChange() {
    console.log('[IndexController] handleTeamChange called.');
    const selector = document.getElementById('team-selector');
    const isPrivate = config.boardVisibility === 'private';
    if (isPrivate) {
        if (authState.isLoggedIn && authState.profile?.team) {
            currentTeam = authState.profile.team;
        }
    } else {
        currentTeam = selector.value;
    }
    renderBoard();

    // NEW: Show search bar only when a team is selected
    document.getElementById('tile-search-container').style.display = currentTeam ? 'block' : 'none';
}

// This object acts as an interface for the sub-modules to access the main controller's state and methods.
const mainControllerInterface = {
    getState: () => ({ config, allTeams, allStyles, tiles, submissions, teamData, scoreboardData, currentTeam, authState, allUsers, teamColorMap }),
    openSubmissionModal: (tile, status) => {
        // NEW: When opening the modal, attach a real-time listener to its specific submission document.
        if (unsubscribeFromSingleSubmission) unsubscribeFromSingleSubmission();

        const teamSubmissions = submissions.filter(s => s.Team === authState.profile.team && !s.IsArchived);
        const existingSubmission = teamSubmissions.find(s => s.id === tile.id) || {};

        if (existingSubmission.docId) {
            unsubscribeFromSingleSubmission = fb.onSnapshot(fb.doc(db, 'submissions', existingSubmission.docId), (doc) => {
                console.log('[IndexController] Live update for open submission modal.');
                const updatedData = doc.data();
                // Call a function in submissionModal.js to refresh its content
                updateModalContent(tile, updatedData);
            });
        }
        // Open the modal with the initial data. The listener will handle subsequent updates.
        openSubmissionModal(tile, status);
    },
    closeSubmissionModal: () => {
        if (unsubscribeFromSingleSubmission) unsubscribeFromSingleSubmission();
        unsubscribeFromSingleSubmission = null;
        closeSubmissionModal(); // Call the original close function from the module
    },
    renderColorKey: () => { // This now renders both the scoreboard and color key
        // The scoreboard is now rendered in processAllData(). This function now only renders the color key.
        const { config, allStyles } = mainControllerInterface.getState();
        renderColorKeyComponent(config, allStyles, document.getElementById('color-key-container'));
    },
    getTileStatus: (tile, tileState) => getTileStatus(tile, tileState),
    logDetailedChanges: (historyEntry, dataToSave, existingSubmission, evidenceItems) => {
        if (dataToSave.IsComplete !== !!existingSubmission.IsComplete) historyEntry.changes.push({ field: 'IsComplete', from: !!existingSubmission.IsComplete, to: dataToSave.IsComplete });

        const oldPlayerIDs = existingSubmission.PlayerIDs || [];
        const newPlayerIDs = dataToSave.PlayerIDs || [];
        if (JSON.stringify(oldPlayerIDs) !== JSON.stringify(newPlayerIDs)) {
            const usersById = new Map(allUsers.map(user => [user.uid, user.displayName]));
            const oldNames = new Set(oldPlayerIDs.map(uid => usersById.get(uid) || `[${uid.substring(0, 5)}]`));
            const newNames = new Set(newPlayerIDs.map(uid => usersById.get(uid) || `[${uid.substring(0, 5)}]`));
            const addedNames = [...newNames].filter(name => !oldNames.has(name));
            const removedNames = [...oldNames].filter(name => !newNames.has(name));
            const changes = [];
            if (addedNames.length > 0) changes.push(`Added: ${addedNames.join(', ')}`);
            if (removedNames.length > 0) changes.push(`Removed: ${removedNames.join(', ')}`);
            historyEntry.changes.push({ field: 'PlayerIDs', from: `(${oldNames.size} players)`, to: `(${newNames.size} players) ${changes.join('; ')}` });
        }

        if (dataToSave.AdditionalPlayerNames !== (existingSubmission.AdditionalPlayerNames || '')) historyEntry.changes.push({ field: 'AdditionalPlayerNames', from: existingSubmission.AdditionalPlayerNames || '', to: dataToSave.AdditionalPlayerNames });
        if (dataToSave.Notes !== (existingSubmission.Notes || '')) historyEntry.changes.push({ field: 'Notes', from: existingSubmission.Notes || '', to: dataToSave.Notes });

        const oldEvidence = existingSubmission.Evidence || '[]';
        if (dataToSave.Evidence !== oldEvidence) {
            let oldEvidenceArray = [];
            try {
                const parsed = JSON.parse(oldEvidence);
                if (Array.isArray(parsed)) oldEvidenceArray = parsed;
                else if (parsed) oldEvidenceArray = [{ link: String(parsed), name: '' }];
            } catch (e) {
                if (oldEvidence) oldEvidenceArray = [{ link: oldEvidence, name: '' }];
            }
            const newEvidenceArray = evidenceItems; // This is already an array of objects

            const oldEvidenceMap = new Map(oldEvidenceArray.map(item => [item.link, item.name]));
            const newEvidenceMap = new Map(newEvidenceArray.map(item => [item.link, item.name]));

            const changesSummary = [];

            // Check for added evidence
            newEvidenceMap.forEach((name, link) => {
                if (!oldEvidenceMap.has(link)) {
                    changesSummary.push(`Added: ${name || 'No Name'} (${link})`);
                }
            });

            // Check for removed evidence
            oldEvidenceMap.forEach((name, link) => {
                if (!newEvidenceMap.has(link)) {
                    changesSummary.push(`Removed: ${name || 'No Name'} (${link})`);
                } else if (newEvidenceMap.get(link) !== name) { // Check for modified description
                    changesSummary.push(`Modified: '${name}' to '${newEvidenceMap.get(link)}' for link (${link})`);
                }
            });

            if (changesSummary.length > 0) historyEntry.changes.push({ field: 'Evidence', from: `(${oldEvidenceArray.length} items)`, to: `(${newEvidenceArray.length} items) ${changesSummary.join('; ')}` });
        }
    },
};

/**
 * Maps internal status names to user-friendly display names for the search results.
 * @param {string} status - The internal status name (e.g., 'Partially Complete').
 * @returns {string} The display-friendly name (e.g., 'Draft').
 */
function getStatusDisplayName(status) {
    const nameMap = { 'Partially Complete': 'Draft', 'Requires Action': 'Admin Feedback' };
    return nameMap[status] || status;
}

/**
 * NEW: A wrapper to get both the status string and its corresponding CSS class.
 * This is needed because the main getTileStatus function was refactored to only return a string.
 * @param {string} status - The status string (e.g., "Verified", "Requires Action").
 * @returns {{status: string, statusClass: string}}
 */
function getStatusWithClass(status) {
    const statusClass = status.replace(/\s+/g, '-').toLowerCase();
    return { status, statusClass };
}

// --- NEW: Search Functionality ---

function handleSearchInput(event) {
    const searchTerm = event.target.value.toLowerCase();
    const resultsContainer = document.getElementById('tile-search-results');

    if (!searchTerm) {
        resultsContainer.innerHTML = '';
        resultsContainer.style.display = 'none';
        return;
    }

    const { tiles, teamData, currentTeam, config, authState } = mainControllerInterface.getState();
    const currentTeamData = teamData[currentTeam] || { tileStates: {} };

    const filteredTiles = tiles.filter(tile => 
        (tile.id?.toLowerCase().includes(searchTerm)) ||
        (tile.Name?.toLowerCase().includes(searchTerm)) ||
        (tile.Description?.toLowerCase().includes(searchTerm))
    ).slice(0, 10); // Limit to 10 results

    if (filteredTiles.length === 0) {
        resultsContainer.innerHTML = '<div class="search-result-item locked">No tiles found.</div>';
        resultsContainer.style.display = 'block';
        return;
    }

    resultsContainer.innerHTML = filteredTiles.map(tile => {
        const tileState = currentTeamData.tileStates[tile.id] || {};
        // FIX: The main getTileStatus now returns a string. We need to process it.
        const statusString = mainControllerInterface.getTileStatus(tile, currentTeam);
        const { status, statusClass } = getStatusWithClass(statusString);
        console.log(`[Search] Tile: ${tile.id}, Status: ${status}`); // Logging requested by user

        const isLocked = status === 'Locked';
        const displayName = getStatusDisplayName(status);
        const tileName = config.censorTilesBeforeEvent && !authState.isEventMod ? 'Censored' : (tile.Name || 'Unnamed Tile');
        const tileDesc = config.censorTilesBeforeEvent && !authState.isEventMod ? 'This tile is hidden until the event begins.' : (tile.Description || 'No description.');
        const tilePoints = tile.Points ? ` (${tile.Points} pts)` : '';

        return `
            <div class="search-result-item ${isLocked ? 'locked' : ''}" data-tile-id="${tile.id}" data-status="${status}">
                <div class="search-result-status" style="background-color: var(--status-${statusClass}-color);"></div>
                <div class="search-result-info">
                    <span class="search-result-name">${tileName}${tilePoints}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="search-result-id">ID: ${tile.id}</span>
                        <span class="search-result-status-text" style="color: var(--status-${statusClass}-color);">${displayName}</span>
                    </div>
                    <span class="search-result-desc">${tileDesc}</span>
                </div>
            </div>
        `;
    }).join('');

    resultsContainer.style.display = 'block';

    // Add click listeners to the new results
    resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
        if (!item.classList.contains('locked')) {
            item.addEventListener('click', handleSearchResultClick);
        }
    });
}

function handleSearchResultClick(event) {
    const item = event.currentTarget;
    const tileId = item.dataset.tileId;
    const status = item.dataset.status;
    const { tiles } = mainControllerInterface.getState();
    const tile = tiles.find(t => t.id === tileId);

    if (tile) {
        mainControllerInterface.openSubmissionModal(tile, status);
        // Clear search after selection
        document.getElementById('tile-search-input').value = '';
        document.getElementById('tile-search-results').style.display = 'none';
    }
}

function handleGlobalClickForSearch(event) {
    const searchContainer = document.getElementById('tile-search-container');
    if (!searchContainer.contains(event.target)) {
        document.getElementById('tile-search-results').style.display = 'none';
    }
}
