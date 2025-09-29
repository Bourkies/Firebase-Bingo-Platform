import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import * as userManager from '../core/data/userManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as configManager from '../core/data/configManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as submissionManager from '../core/data/submissionManager.js';
import { calculateScoreboardData } from '../components/Scoreboard.js';
import { renderColorKey as renderColorKeyComponent } from '../components/TileRenderer.js';
import { showMessage, showGlobalLoader, hideGlobalLoader, generateTeamColors } from '../core/utils.js';

// Import new sub-modules
import { initializeBoard, renderBoard, renderScoreboard } from './index/board.js';
import { initializeSubmissionModal, openModal as openSubmissionModal } from './index/submissionModal.js';
import { initializeLoginModal } from './index/loginModal.js';

let config = {}, allTeams = {}, allStyles = {}, tiles = [], submissions = [], teamData = {}, scoreboardData = [], currentTeam = '', authState = {}, allUsers = [], teamColorMap = {};
let unsubscribeConfig = null, unsubscribeTiles = null, unsubscribeSubmissions = null, unsubscribeStyles = null, unsubscribeUsers = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('team-selector').addEventListener('change', handleTeamChange);
    document.body.addEventListener('show-message', (e) => showMessage(e.detail.message, e.detail.isError));

    // Initialize sub-modules
    initializeBoard(mainControllerInterface);
    initializeSubmissionModal(mainControllerInterface);
    initializeLoginModal();

    initializeApp();
    initAuth(onAuthStateChanged);
});

async function onAuthStateChanged(newAuthState) {
    authState = newAuthState;
    const loadFirstTeam = config.loadFirstTeamByDefault === true;

    if (newAuthState.teamChanged) {
        const newTeamName = allTeams[newAuthState.profile.team]?.name || 'a new team';
        showMessage(`Your team has been changed to: ${newTeamName}. The board is updating.`, false);
    }

    // Re-populate the selector to handle visibility changes (e.g., private boards).
    populateTeamSelector(allTeams, loadFirstTeam);

    // NEW: Logic to set the default selected team is now here.
    // This ensures authState.profile is available before we try to use it.
    const selector = document.getElementById('team-selector');
    if (selector.disabled) {
        // The value is already set by populateTeamSelector for private boards.
    } else if (authState.isLoggedIn && authState.profile?.team) {
        // If logged in and on a team (on a public board), select their team.
        selector.value = authState.profile.team;
    } else if (loadFirstTeam && Object.keys(allTeams).length > 0 && !selector.value) {
        // As a fallback, if the setting is enabled, select the first team in the list.
        selector.value = Object.keys(allTeams).sort((a, b) => a.localeCompare(b))[0];
    }

    setupUsersListener(); // Re-fetch users based on new auth state (e.g., to see teammates).
    setupSubmissionsListener(); // Re-setup the submissions listener based on the new auth state.

    // This is the key fix: After auth is confirmed, explicitly trigger a team change and board render.
    handleTeamChange();
}

// This function sets up the listener for tiles, respecting censorship rules.
const setupTilesListener = () => {
    if (unsubscribeTiles) unsubscribeTiles();
    // Use the centralized tileManager to handle fetching tiles based on permissions and config.
    unsubscribeTiles = tileManager.listenToTiles((newTiles) => {
        console.log("Tiles updated in real-time.");
        tiles = newTiles;
        processAllData();
        renderBoard(); // Render board with new tiles
    }, authState, config, true); // Pass true for includeDocId
};

// This function sets up the listener for submissions, respecting privacy rules.
const setupSubmissionsListener = () => {
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    // Use the centralized submissionManager to handle fetching submissions based on permissions and config.
    unsubscribeSubmissions = submissionManager.listenToSubmissions((newSubmissions) => {
        console.log("Submissions updated in real-time.");
        // The manager already converts timestamps, so we just assign the data.
        submissions = newSubmissions;
        processAllData();
        renderBoard(); // Re-render board with new submission data
    }, authState, config);
};

function initializeApp() {
    let unsubscribeTeams = null; // New listener for teams

    let initialDataLoaded = { config: false, teams: false, tiles: false, submissions: false, styles: false, users: false };
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
        console.log("Config updated in real-time.");
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
        if (authState.isLoggedIn || config.boardVisibility !== 'private') handleTeamChange();

        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        mainControllerInterface.renderColorKey();
        if (!initialDataLoaded.config) { initialDataLoaded.config = true; initialDataLoaded.styles = true; checkAllLoaded(); }
    });

    // Listener for the new teams collection
    unsubscribeTeams = teamManager.listenToTeams((newTeams) => {
        console.log("Teams updated in real-time.");
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

        handleTeamChange();
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    });
}

// Listener for users collection, must be called after auth state is known
function setupUsersListener() {
    if (unsubscribeUsers) unsubscribeUsers();
    unsubscribeUsers = userManager.listenToUsers((newUsers) => {
        console.log(`indexController: Users updated. Received ${newUsers.length} users.`);
        allUsers = newUsers;
    }, authState);
}

function processAllData() {
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
}

// This object acts as an interface for the sub-modules to access the main controller's state and methods.
const mainControllerInterface = {
    getState: () => ({ config, allTeams, allStyles, tiles, submissions, teamData, scoreboardData, currentTeam, authState, allUsers, teamColorMap }),
    openSubmissionModal: (tile, status) => openSubmissionModal(tile, status),
    renderColorKey: () => { // This now renders both the scoreboard and color key
        // The scoreboard is now rendered in processAllData(). This function now only renders the color key.
        const { config, allStyles } = mainControllerInterface.getState();
        renderColorKeyComponent(config, allStyles, document.getElementById('color-key-container'));
    },
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
    }
};
