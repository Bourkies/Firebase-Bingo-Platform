import '../components/Navbar.js';
// NEW: Import the central app initializer
import { initializeApp } from '../app-init.js';
import { authStore } from '../stores/authStore.js';
import { db, fb } from '../core/firebase-config.js';
import { configStore } from '../stores/configStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { tilesStore, getPublicTiles } from '../stores/tilesStore.js';
import { submissionsStore } from '../stores/submissionsStore.js';
import { usersStore } from '../stores/usersStore.js';

import { calculateScoreboardData } from '../components/Scoreboard.js';
import { showMessage, showGlobalLoader, hideGlobalLoader, generateTeamColors } from '../core/utils.js';

import '../components/BingoBoard.js';
import '../components/BingoScoreboard.js';
import '../components/BingoColorKey.js';
import '../components/BingoColorKey.js';
// Import new sub-modules
import { initializeBoard, renderBoard } from './index/board.js';
import { initializeSubmissionModal, openModal as openSubmissionModal, closeModal as closeSubmissionModal, updateModalContent } from './index/submissionModal.js';

// State variables. These will be populated by the stores.
let currentTeam = '';
let teamColorMap = {};

// NEW: State to track previous data for more efficient updates
let prevSubmissionsCount = -1;
let prevTilesCount = -1;
let prevTeamsCount = -1;
let prevConfig = null;

let unsubscribeFromSingleSubmission = null;

// NEW: Debounce flag to prevent multiple renders in the same frame
let isRenderScheduled = false;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all data stores for the application
    initializeApp();

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
    const boardComponent = document.getElementById('board-container');
    boardComponent.addEventListener('open-submission-modal', (e) => {
        mainControllerInterface.openSubmissionModal(e.detail.tile, e.detail.status);
    });

    initializeSubmissionModal(mainControllerInterface); // This sets up the base modal listeners

    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    configStore.subscribe(onDataChanged);
    teamsStore.subscribe(onDataChanged);
    tilesStore.subscribe(onDataChanged);
    submissionsStore.subscribe(onDataChanged);
    usersStore.subscribe(onDataChanged);

    // Initial call to render the page with default store values.
    onDataChanged();
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
        .search-result-status { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; border: 1px solid var(--border-color); box-sizing: border-box; }
        .search-result-info { display: flex; flex-direction: column; overflow: hidden; }
        .search-result-name { font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .search-result-id { font-size: 0.8em; color: var(--secondary-text); }
        .search-result-desc { font-size: 0.8em; color: var(--secondary-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 0.25rem; }
        .search-result-status-text { font-size: 0.8em; font-weight: bold; }

    `;
    document.head.appendChild(style);
}

function onDataChanged() {
    if (isRenderScheduled) {
        return; // A render is already queued, do nothing.
    }
    isRenderScheduled = true;
    requestAnimationFrame(renderPage);
}

function renderPage() {
    console.log(`[IndexController] renderPage: Executing debounced render.`);
    isRenderScheduled = false; // Reset the flag
    
    // Get the latest state from all stores
    const authState = authStore.get();
    const { config, styles } = configStore.get();
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    const submissions = submissionsStore.get();

    // --- NEW: More intelligent rendering logic ---
    const submissionsChanged = submissions.length !== prevSubmissionsCount;
    const tilesChanged = tiles.length !== prevTilesCount;
    const teamsChanged = Object.keys(allTeams).length !== prevTeamsCount;
    const configChanged = JSON.stringify(config) !== JSON.stringify(prevConfig);

    let teamData, scoreboardData; // Will be populated if needed

    // Check if essential data is loaded.
    if (!config.pageTitle || Object.keys(allTeams).length === 0) {
        showGlobalLoader();
        return; // Wait for more data
    }
    hideGlobalLoader();

    const adminWarningContainer = document.getElementById('admin-warning-container');
    const boardComponent = document.getElementById('board-container');
    adminWarningContainer.innerHTML = ''; // Clear previous warnings

    // --- REVISED: Centralized check for Setup Mode at the top ---    
    // If setup mode is on, we must check the user's status.
    // CRITICAL: We must wait until `authState.authChecked` is true before evaluating roles.
    // This prevents a race condition on initial load where an admin might briefly be treated as a non-mod.
    if (config.setupModeEnabled === true) {
      // If auth is checked and the user is confirmed to NOT be a mod, show the message and stop.
      if (authState.authChecked && !authState.isEventMod) {
        // Hide the admin warning container in case it was visible
        if (adminWarningContainer) adminWarningContainer.style.display = 'none';
        // NEW: Pass the setupMode flag directly to renderBoard.
        // This ensures the property is set consistently on every render.
        renderBoard({ setupMode: true });
        // Explicitly hide all other interactive elements
        document.getElementById('team-selector').style.display = 'none';
        document.getElementById('tile-search-container').style.display = 'none';
        document.getElementById('scoreboard-container').style.display = 'none';
        document.getElementById('color-key-container').style.display = 'none';
        return; // Exit early, skipping all other render logic.
      }
      // If auth is checked and the user IS a mod, show the admin warning.
      if (authState.authChecked && authState.isEventMod) {
        if (adminWarningContainer) adminWarningContainer.style.display = 'block';
        adminWarningContainer.innerHTML = '<p style="text-align:center; font-weight: bold; color: var(--warn-text-color); padding: 1rem; background-color: var(--warn-bg-color); border: 2px solid var(--warn-color); border-radius: 8px; margin-bottom: 1rem;">SETUP MODE IS ON: The board is currently hidden from all non-admin users.</p>';
      }
      // If auth is not yet checked, we don't do anything here and let the rest of the render proceed (which will likely just show a loader).
    }

    // If setup mode is on for an admin, show the warning message.
    if (config.setupModeEnabled === true && authState.isEventMod) {
        if (adminWarningContainer) adminWarningContainer.style.display = 'block';
        adminWarningContainer.innerHTML = '<p style="text-align:center; font-weight: bold; color: var(--warn-text-color); padding: 1rem; background-color: var(--warn-bg-color); border: 2px solid var(--warn-color); border-radius: 8px; margin-bottom: 1rem;">SETUP MODE IS ON: The board is currently hidden from all non-admin users.</p>';
    }

    // Regenerate team colors if teams have changed.
    if (teamsChanged) {
        teamColorMap = generateTeamColors(Object.keys(allTeams));
    }

    // Handle team change notification
    if (authState.teamChanged) {
        const newTeamName = allTeams[authState.profile.team]?.name || 'a new team';
        showMessage(`Your team has been changed to: ${newTeamName}. The board is updating.`, false);
    }

    // Update UI elements that depend on the new data
    if (configChanged) {
        applyGlobalStyles(config);
        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
    }
    populateTeamSelector(allTeams, config, authState); // Always run to reflect current selection

    // Set the current team based on the new state
    currentTeam = document.getElementById('team-selector').value;

    // FIX: Show/hide search bar based on current team selection on every render.
    document.getElementById('tile-search-container').style.display = currentTeam ? 'block' : 'none';

    const colorKeyEl = document.getElementById('color-key-container');

    // Only recalculate data if relevant stores have changed
    if (submissionsChanged || tilesChanged || teamsChanged || configChanged) {
        ({ teamData, scoreboardData } = processAllData(submissions, tiles, allTeams, config));
    }

    // If checks pass, proceed with normal rendering.
    renderBoard({ setupMode: config.setupModeEnabled }); // This function is now smarter and only passes data
    const scoreboardEl = document.getElementById('scoreboard-container');
    if (scoreboardData) {
        scoreboardEl.style.display = scoreboardData.length > 0 ? 'block' : 'none';
        scoreboardEl.scoreboardData = scoreboardData;
        scoreboardEl.allTeams = allTeams;
        scoreboardEl.config = config;
        scoreboardEl.authState = authState;
        scoreboardEl.teamColorMap = teamColorMap;
    }

    if (configChanged) {
        colorKeyEl.style.display = 'flex';
        colorKeyEl.config = config;
        colorKeyEl.allStyles = styles;
    }

    // Update previous state trackers
    prevSubmissionsCount = submissions.length;
    prevTilesCount = tiles.length;
    prevTeamsCount = Object.keys(allTeams).length;
    prevConfig = JSON.parse(JSON.stringify(config)); // Deep copy
}
function processAllData(submissions, tiles, allTeams, config) {
    console.log('[IndexController] processAllData called.');
    if (!Array.isArray(submissions) || !Array.isArray(tiles)) {
        console.warn('[IndexController] processAllData aborted: submissions or tiles data is not a valid array.');
        return { teamData: {}, scoreboardData: [] };
    }

    const teamData = {};
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

    const scoreboardData = calculateScoreboardData(submissions, tiles, allTeams, config);

    return { teamData, scoreboardData };
}

function applyGlobalStyles(config) {
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

function populateTeamSelector(teams = {}, config = {}, authState = {}) {
    const selector = document.getElementById('team-selector');
    // FIX: Preserve the user's current selection during re-renders.
    const previouslySelectedTeam = selector.value;

    selector.innerHTML = '';
    selector.disabled = false; // Enable by default
    const loadFirstTeam = config.loadFirstTeamByDefault === true;

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

        // Set the selected value based on previous selection, auth state, or default.
        if (previouslySelectedTeam) {
            selector.value = previouslySelectedTeam;
        } else if (authState.isLoggedIn && authState.profile?.team) {
            selector.value = authState.profile.team;
        } else if (!selector.value && loadFirstTeam && Object.keys(teams).length > 0) {
            selector.value = Object.keys(teams).sort((a, b) => a.localeCompare(b))[0];
        }
    }
}

function handleTeamChange() {
    console.log('[IndexController] handleTeamChange called.');
    const selector = document.getElementById('team-selector');

    // Trigger a full re-render to update the board for the new team.
    onDataChanged();
}

// This object acts as an interface for the sub-modules to access the main controller's state and methods.
const mainControllerInterface = {
    getState: () => {
        const { config, styles } = configStore.get();
        const allTeams = teamsStore.get();
        const tiles = tilesStore.get();
        const submissions = submissionsStore.get();
        const allUsers = usersStore.get();
        const authState = authStore.get();

        // SIMPLIFIED: The tilesStore now correctly provides either full or public tiles.
        const { teamData, scoreboardData } = processAllData(submissions, tiles, allTeams, config);

        return { config, allTeams, allStyles: styles, tiles, allTiles: tiles, submissions, teamData, scoreboardData, currentTeam, authState, allUsers, teamColorMap };
    },
    openSubmissionModal: (tile, status) => {
        // NEW: When opening the modal, attach a real-time listener to its specific submission document.
        if (unsubscribeFromSingleSubmission) unsubscribeFromSingleSubmission();

        const authState = authStore.get();
        const submissions = submissionsStore.get();

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
    getTileStatus: (tile, teamName) => {
        const boardComponent = document.getElementById('board-container');
        return boardComponent.getTileStatus(tile, teamName);
    },
    logDetailedChanges: (historyEntry, dataToSave, existingSubmission, evidenceItems) => {
        if (dataToSave.IsComplete !== !!existingSubmission.IsComplete) historyEntry.changes.push({ field: 'IsComplete', from: !!existingSubmission.IsComplete, to: dataToSave.IsComplete });

        const allUsers = usersStore.get();

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

    const { config, styles: allStyles } = configStore.get();
    const tiles = tilesStore.get();
    const authState = authStore.get();
    const { teamData } = processAllData(submissionsStore.get(), tiles, teamsStore.get(), config);


    const currentTeamData = teamData[currentTeam] || { tileStates: {} };

    const filteredTiles = tiles.filter(tile => {
        // Get the status for the current tile
        const statusString = mainControllerInterface.getTileStatus(tile, currentTeam);
        const statusDisplayName = getStatusDisplayName(statusString).toLowerCase();

        // Check if the search term matches any of the tile's properties or its status
        const idMatch = tile.id?.toLowerCase().includes(searchTerm);
        const nameMatch = tile.Name?.toLowerCase().includes(searchTerm);
        const descMatch = tile.Description?.toLowerCase().includes(searchTerm);
        const statusMatch = statusDisplayName.includes(searchTerm);

        return idMatch || nameMatch || descMatch || statusMatch;
    }
    ); // No limit on results

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
        
        // REVERTED: Logic to derive a solid color from the style config for the status dot.
        let statusDotColor = `var(--status-${statusClass}-color)`; // Default to theme color
        let statusTextColor = statusDotColor; // Text color starts the same
        const statusStyle = allStyles[status];
        if (statusStyle && statusStyle.color) {
            const rgbaMatch = statusStyle.color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
            const alpha = rgbaMatch ? parseFloat(rgbaMatch[4]) : 1;

            if (alpha > 0) {
                statusTextColor = statusStyle.color; // Use the full color (potentially with alpha) for text
                // For the dot, we want a solid color, so we strip the alpha.
                if (rgbaMatch) {
                    statusDotColor = `rgb(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]})`;
                } else {
                    statusDotColor = statusStyle.color; // Assumes hex or named color
                }
            }
        }

        const isLocked = status === 'Locked';
        const displayName = getStatusDisplayName(status);
        const tileName = config.censorTilesBeforeEvent && !authState.isEventMod ? 'Censored' : (tile.Name || 'Unnamed Tile');
        const tileDesc = config.censorTilesBeforeEvent && !authState.isEventMod ? 'This tile is hidden until the event begins.' : (tile.Description || 'No description.');
        const tilePoints = tile.Points ? ` (${tile.Points} pts)` : '';

        return `
            <div class="search-result-item ${isLocked ? 'locked' : ''}" data-tile-id="${tile.id}" data-status="${status}">
                <div class="search-result-status" style="background-color: ${statusDotColor};"></div>
                <div class="search-result-info">
                    <span class="search-result-name">${tileName}${tilePoints}</span>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="search-result-id">ID: ${tile.id}</span>
                        <span class="search-result-status-text" style="color: ${statusTextColor};">${displayName}</span>
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
