import '../components/Navbar.js';
import { initAuth, signInWithGoogle, signInAnonymously, getAuthState } from '../core/auth.js';
// Import the new data managers
import * as userManager from '../core/data/userManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as configManager from '../core/data/configManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as submissionManager from '../core/data/submissionManager.js';
import { createTileElement } from '../components/TileRenderer.js';
import { calculateScoreboardData, renderScoreboard as renderScoreboardComponent } from '../components/Scoreboard.js';
import { showMessage, showGlobalLoader, hideGlobalLoader, hexToRgba } from '../core/utils.js';

let config = {}, allTeams = {}, allStyles = {}, tiles = [], submissions = [], teamData = {}, scoreboardData = [], currentTeam = '', authState = {}, allUsers = [];
let unsubscribeConfig = null, unsubscribeTiles = null, unsubscribeSubmissions = null, unsubscribeStyles = null, unsubscribeUsers = null;

document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners programmatically instead of using inline onclick
    document.getElementById('team-selector').addEventListener('change', handleTeamChange);
    document.querySelector('#submission-modal .close-button').addEventListener('click', closeModal);
    document.getElementById('submission-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('add-evidence-btn').addEventListener('click', () => addEvidenceInput());
    document.querySelector('#login-modal .close-button').addEventListener('click', closeLoginModal);
    document.getElementById('acknowledge-feedback-btn').addEventListener('click', handleAcknowledgeFeedback);

    // Use event delegation for dynamically created elements
    document.getElementById('evidence-container').addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-evidence-btn')) {
            event.target.closest('.evidence-item').remove();
            renumberEvidenceItems();
        }
    });

    document.body.addEventListener('login-request', openLoginModal);
    // Listen for messages from child components like the navbar
    document.body.addEventListener('show-message', (e) => showMessage(e.detail.message, e.detail.isError));

    // Initialize data listeners first, then auth. This prevents race conditions.
    initializeApp();
    document.getElementById('login-google').addEventListener('click', () => { signInWithGoogle(); closeLoginModal(); });
    document.getElementById('login-anon').addEventListener('click', () => { signInAnonymously(); closeLoginModal(); });
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

        // After config is loaded, we can set up the other listeners that depend on it.
        setupTilesListener();
        setupSubmissionsListener();
        
        applyGlobalStyles();
        const loadFirstTeam = config.loadFirstTeamByDefault === true;
        populateTeamSelector(allTeams, loadFirstTeam); // This is correct
        if (authState.isLoggedIn || config.boardVisibility !== 'private') handleTeamChange();

        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        renderColorKey();
        renderScoreboard();
        if (!initialDataLoaded.config) { initialDataLoaded.config = true; initialDataLoaded.styles = true; checkAllLoaded(); }
    });

    // Listener for the new teams collection
    unsubscribeTeams = teamManager.listenToTeams((newTeams) => {
        console.log("Teams updated in real-time.");
        allTeams = newTeams;
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

    // Use the centralized userManager to handle fetching users based on permissions.
    unsubscribeUsers = userManager.listenToUsers((newUsers) => {
        console.log(`indexController: Users updated. Received ${newUsers.length} users.`);
        allUsers = newUsers;
        // The navbar component has its own user listener, so no need to call an update here.
        // No need to check initialDataLoaded here as it's part of the auth flow
    }, authState); // Pass authState to determine which users to fetch.
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

function isGenericView() {
    const isPrivate = config.boardVisibility === 'private';
    const isPublic = !isPrivate;
    const isLoggedInWithTeam = authState.isLoggedIn && authState.profile?.team;

    // It's a generic view if the board is private AND the user isn't on a team.
    if (isPrivate && !isLoggedInWithTeam) return true;
    // It's a generic view if the board is public AND no team is selected from the dropdown.
    if (isPublic && !currentTeam) return true;
    return false;
}

function handleTeamChange() {
    const selector = document.getElementById('team-selector');
    const isPrivate = config.boardVisibility === 'private';

    // On a private board, the "current team" is always the user's team from their profile.
    // We must wait for authState to be populated before setting this.
    if (isPrivate) {
        if (authState.isLoggedIn && authState.profile?.team) {
            currentTeam = authState.profile.team;
        }
    } else {
        currentTeam = selector.value;
    }
    renderBoard();
}

function getTileStatus(tile, teamName) {
    if (isGenericView()) return 'Unlocked';

    const isPublic = config.boardVisibility !== 'private';
    // The teamName parameter is now a teamId
    if (!isPublic && teamName && teamName !== authState.profile?.team) {
        // On a private board, if you're viewing a team that isn't yours, tiles are hidden.
        // This is a safeguard; the UI should prevent selecting other teams anyway.
        return 'Hidden';
    }

    if (!teamName || !teamData[teamName]) return 'Locked'; // teamName is teamId
    const teamTileStates = teamData[teamName].tileStates;
    const state = teamTileStates[tile.id] || {}; // tile.id is the user-facing ID
    if (state.verified) return 'Verified';
    if (state.requiresAction) return 'Requires Action';
    if (state.complete) return 'Submitted';
    if (state.hasSubmission) return 'Partially Complete';

    const unlockOnVerifiedOnly = config.unlockOnVerifiedOnly === true;
    // The server's getBoardData() may split the 'Prerequisites' column by comma.
    // We rejoin it here to reconstruct the original string, which could be a simple list or a JSON array string.
    const prereqString = tile.Prerequisites || '';

    if (!prereqString || !prereqString.trim()) {
        return 'Unlocked'; // No prerequisites.
    }

    let orGroups = [];
    let isNewFormat = false;

    // Try to parse as JSON for the new AND/OR logic: e.g., [["A1","A2"],["B1"]]
    if (prereqString.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(prereqString);
            // Check if it's an array of arrays (or an empty array for an unlocked tile)
            if (Array.isArray(parsed) && (parsed.length === 0 || Array.isArray(parsed[0]))) {
                orGroups = parsed;
                isNewFormat = true;
            }
        } catch (e) {
            // Not valid JSON, will fall through to old format handling.
        }
    }

    if (!isNewFormat) {
        // Fallback to old format: a single AND group from a comma-separated list.
        const andGroup = prereqString.split(',').map(s => s.trim()).filter(Boolean);
        orGroups = andGroup.length > 0 ? [andGroup] : [];
    }

    if (orGroups.length === 0) {
        return 'Unlocked'; // No prerequisites after parsing.
    }

    // Check if any 'OR' group is satisfied.
    const prereqsMet = orGroups.some(andGroup => {
        // An empty AND group `[]` is vacuously true because `[].every()` returns true.
        return andGroup.every(prereqId => {
            const prereqState = teamTileStates[prereqId] || {};
            return unlockOnVerifiedOnly ? prereqState.verified : (prereqState.verified || prereqState.complete);
        });
    });
    return prereqsMet ? 'Unlocked' : 'Locked';
}

function renderBoard() {
  // NEW: Add a guard to prevent rendering before essential data is loaded.
  // The config must be loaded. If the board is private, auth must also be ready.
  if (!config || (config.boardVisibility === 'private' && !authState.isLoggedIn)) {
      return;
  }

  const shouldShowGeneric = isGenericView();
  // Clear the board if there are no tiles, OR if no team is selected AND we are not in a generic view.
  if (!tiles || tiles.length === 0 || (!currentTeam && !shouldShowGeneric)) {
    document.getElementById('board-container').innerHTML = '';
    document.getElementById('page-title').textContent = config.pageTitle || 'Bingo'; // Set title when board is cleared
    return;
  }

  const container = document.getElementById('board-container');
  container.innerHTML = '';
  // FIX: On a private board, the display team is always the user's team, not the dropdown value.
  const isPrivate = config.boardVisibility === 'private';
  const displayTeam = isPrivate ? authState.profile?.team : currentTeam;
  const displayTeamName = (displayTeam && allTeams) ? (allTeams[displayTeam]?.name || displayTeam) : '';
  
  if (displayTeamName) {
    document.title = `${config.pageTitle || 'Bingo'} : ${displayTeamName}`;
  } else {
    document.title = config.pageTitle || 'Bingo';
  }
  document.getElementById('page-title').textContent = displayTeam ? displayTeamName : (config.pageTitle || 'Bingo');
  const tooltip = document.getElementById('tile-tooltip');

  const renderTiles = () => {
    tiles.forEach(tile => {
      if (getTileStatus(tile, displayTeam) === 'Hidden') return;
      const status = getTileStatus(tile, displayTeam);

      const tileDiv = createTileElement(tile, status, config, allStyles, { baseClass: 'tile-overlay' });

      const tileName = tile.Name || 'Censored';
      const tileDesc = tile.Description || 'This tile is hidden until the event begins.';

      // --- UPDATED: Tooltip logic ---
      tileDiv.addEventListener('mousemove', (e) => {
          tooltip.innerHTML = `<h4>${tile.id}: ${tileName}</h4><p>${tileDesc}</p>`;
          tooltip.style.display = 'block';
          tooltip.style.left = `${e.clientX + 15}px`;
          tooltip.style.top = `${e.clientY + 15}px`;
      });
      tileDiv.addEventListener('mouseout', () => {
          tooltip.style.display = 'none';
          // The renderer's mouseout handler will take care of resetting the border
      });

      // Add tile name if configured and no stamp is present
      if ((config.showTileNames === true || !config.boardImageUrl) && !tileDiv.querySelector('.stamp-image')) {
        const tileNameSpan = document.createElement('span');
        tileNameSpan.textContent = tileName;
        tileDiv.appendChild(tileNameSpan);
      }

      // In generic view, modals cannot be opened.
      const genericView = isGenericView();
      const isMyTeam = authState.isLoggedIn && authState.profile?.team === displayTeam;
      const canOpenModal = !genericView && isMyTeam && status !== 'Locked';

      if (canOpenModal) {
          tileDiv.onclick = () => openModal(tile, status);
      } else if (status === 'Locked') {
          // Tile is locked for everyone, do nothing to the cursor.
      } else if (!displayTeam) {
          tileDiv.onclick = () => showMessage('Please select your team to interact with a tile.', true);
      } else if (!isMyTeam) {
            // Tile is visible but not interactive for this user (e.g., public board, viewing another team)
            tileDiv.style.cursor = 'not-allowed';
        }

      container.appendChild(tileDiv);
    });
  };

  // Helper function to apply the default placeholder background styles
  const setPlaceholderBackground = () => {
      container.style.backgroundImage = 'linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)';
      container.style.backgroundSize = '20px 20px';
      container.style.backgroundRepeat = 'repeat';
      container.style.aspectRatio = '1 / 1';
  };

  const imageUrl = config.boardImageUrl;
  if (!imageUrl) {
    setPlaceholderBackground();
    renderTiles(); return;
  }
  const img = new Image();
  img.onload = () => {
    container.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
    container.style.backgroundImage = `url('${imageUrl}')`;
    // FIX: Explicitly set the background size and repeat properties for the real image
    container.style.backgroundSize = 'cover';
    container.style.backgroundRepeat = 'no-repeat';
    renderTiles();
  };
  img.onerror = () => {
    // On error, revert to the placeholder background
    setPlaceholderBackground();
    const errorDiv = document.createElement('div'); errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<strong>Image Failed to Load</strong>`;
    container.appendChild(errorDiv); renderTiles();
  };
  img.src = imageUrl;
}

function renderColorKey() {
    if (!config || !allStyles) return;
    const keyContainer = document.getElementById('color-key-container');
    keyContainer.innerHTML = '';
    const keyOrder = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];

    keyOrder.forEach(status => {
        const style = allStyles[status] || {}; // Default to empty object if style is not defined

        // Provide defaults for color and opacity if not defined in the style object
        const color = style.color || '#888888'; // Default to a neutral grey
        const opacity = style.opacity ?? 0.7; // Use nullish coalescing to correctly handle opacity: 0

        const keyItem = document.createElement('div');
        keyItem.className = 'key-item';
        const colorBox = document.createElement('div');
        colorBox.className = 'key-color-box';
        colorBox.style.backgroundColor = hexToRgba(color, opacity);

        const useStamp = style.useStampByDefault === true;
        const stampImg = style.stampImageUrl;
        if (useStamp && stampImg) {
            colorBox.style.backgroundImage = `url('${stampImg}')`;
        }

        const keyLabel = document.createElement('span');
        keyLabel.textContent = status;
        keyItem.appendChild(colorBox);
        keyItem.appendChild(keyLabel);
        keyContainer.appendChild(keyItem);
    });
}

function renderScoreboard() {
    // NEW: Use the centralized scoreboard rendering component
    const container = document.getElementById('scoreboard-container');
    renderScoreboardComponent(container, scoreboardData, allTeams, config, authState, currentTeam);
}

// --- NEW: Dynamic Evidence Field Functions ---
function addEvidenceInput(link = '', name = '') {
    const container = document.getElementById('evidence-container');
    const itemCount = container.children.length;

    const evidenceItemDiv = document.createElement('div');
    evidenceItemDiv.className = 'evidence-item';

    // Swapped link and name inputs, and updated placeholder text for clarity.
    evidenceItemDiv.innerHTML = `
        <div class="evidence-item-header">
            <label>Evidence #${itemCount + 1}</label>
            <button type="button" class="remove-evidence-btn">&times;</button>
        </div>
        <input type="text" class="evidence-name" placeholder="Optional: name or short description" value="${name}">
        <input type="text" class="evidence-link" placeholder="Link (e.g., https://discord...)" value="${link}">
    `;
    container.appendChild(evidenceItemDiv);
}

function renumberEvidenceItems() {
    const container = document.getElementById('evidence-container');
    const items = container.querySelectorAll('.evidence-item');
    items.forEach((item, index) => {
        const label = item.querySelector('label');
        if (label) {
            label.textContent = `Evidence #${index + 1}`;
        }
    });
}

function clearEvidenceInputs() {
    const container = document.getElementById('evidence-container');
    container.innerHTML = '';
}

function populatePlayerNameSelector(savedPlayerIDs = [], savedAdditionalNames = '') {
    const membersContainer = document.getElementById('team-members-checkboxes');
    const teamCheckbox = document.getElementById('team-submission-checkbox');
    const manualInput = document.getElementById('manual-player-name');

    membersContainer.innerHTML = '';
    // Reset listeners and values
    teamCheckbox.checked = false;
    manualInput.value = '';

    // 1. Get team members and populate checkboxes
    const teamMembers = allUsers.filter(u => u.team === currentTeam);
    teamMembers.forEach(member => {
        const id = `player-check-${member.uid}`;
        const item = document.createElement('div');
        item.className = 'player-checkbox-item';
        // Use data-uid to store the user's ID
        item.innerHTML = `
            <input type="checkbox" id="${id}" data-uid="${member.uid}">
            <label for="${id}">${member.displayName}</label>
        `;
        membersContainer.appendChild(item);
    });

    // 2. Pre-fill the form based on saved data
    const teamName = allTeams[currentTeam]?.name || currentTeam;
    // Check if the submission was for the whole team
    if (savedAdditionalNames === teamName && savedPlayerIDs.length === 0) {
        teamCheckbox.checked = true;
    } else {
        // Check the boxes for saved player UIDs
        savedPlayerIDs.forEach(uid => {
            const memberCheckbox = membersContainer.querySelector(`[data-uid="${uid}"]`);
            if (memberCheckbox) memberCheckbox.checked = true;
        });
        // Populate the manual input with any additional names
        manualInput.value = savedAdditionalNames;
    }

    // 3. Add a single event listener to the container
    const container = document.getElementById('player-name-container');
    container.removeEventListener('input', updatePlayerNameField); // Clear old listener to prevent duplicates
    container.addEventListener('input', updatePlayerNameField);

    // 4. Initial update to set the hidden field values
    updatePlayerNameField();
}

function updatePlayerNameField() {
    const membersContainer = document.getElementById('team-members-checkboxes');
    const teamCheckbox = document.getElementById('team-submission-checkbox');
    const manualInput = document.getElementById('manual-player-name');
    const playerIdsInput = document.getElementById('player-ids-value');
    const additionalNamesInput = document.getElementById('additional-players-value');

    const teamName = allTeams[currentTeam]?.name || currentTeam;

    // If "Submit for whole team" is checked, it overrides everything else.
    if (teamCheckbox.checked) {
        playerIdsInput.value = JSON.stringify([]);
        additionalNamesInput.value = teamName;
        membersContainer.querySelectorAll('input').forEach(i => { i.checked = false; i.disabled = true; });
        manualInput.value = ''; manualInput.disabled = true; return;
    }

    // Otherwise, enable other inputs and collect their values.
    membersContainer.querySelectorAll('input').forEach(i => i.disabled = false);
    manualInput.disabled = false;
    const selectedUIDs = Array.from(membersContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.uid);
    playerIdsInput.value = JSON.stringify(selectedUIDs);
    additionalNamesInput.value = manualInput.value.trim();
}

function openModal(tile, status) {
  const modal = document.getElementById('submission-modal');
  const form = document.getElementById('submission-form');
  form.reset();
  // Always show feedback if it exists, not just for "Requires Action" status
  document.getElementById('admin-feedback-display').style.display = 'none'; // Hide feedback by default

  document.getElementById('modal-tile-id').value = tile.id; // The user-facing ID
  document.getElementById('modal-tile-name').textContent = `${tile.id}: ${tile.Name || 'Censored'}`; // Handle censored name
  const teamName = (allTeams && allTeams[currentTeam]) ? allTeams[currentTeam].name : currentTeam;
  document.getElementById('modal-team-name').textContent = `Team: ${teamName}`;
  document.getElementById('modal-tile-desc').textContent = tile.Description || 'This tile is hidden until the event begins.'; // Handle censored desc
  document.getElementById('evidence-label').textContent = config.evidenceFieldLabel || 'Evidence:';

  modal.style.display = 'flex';
  const isEditable = status !== 'Verified';

  const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tile.id && !s.IsArchived);
  let evidenceData = [];

  populatePlayerNameSelector(existingSubmission?.PlayerIDs || [], existingSubmission?.AdditionalPlayerNames || '');
  document.getElementById('notes').value = existingSubmission?.Notes || '';
  if (existingSubmission?.Evidence) {
      try {
          evidenceData = JSON.parse(existingSubmission.Evidence);
          if (!Array.isArray(evidenceData)) throw new Error("Not an array");
      } catch (e) {
          if (existingSubmission.Evidence) evidenceData = [{ link: existingSubmission.Evidence, name: '' }];
      }
  }
  
  clearEvidenceInputs();
  if (evidenceData.length > 0) {
      evidenceData.forEach(item => addEvidenceInput(item.link, item.name));
  } else if (isEditable) {
      addEvidenceInput();
  }

  // --- NEW: Dynamic Button and Form State Logic ---
  const formElements = document.querySelectorAll('#submission-form input, #submission-form textarea, #submission-form button');
  const mainButton = document.getElementById('submit-button-main');
  const secondaryButton = document.getElementById('submit-button-secondary');
  const ackButton = document.getElementById('acknowledge-feedback-btn');

  // Always show feedback if it exists
  if (existingSubmission?.AdminFeedback) {
      document.getElementById('admin-feedback-display').style.display = 'block';
      document.getElementById('admin-feedback-text').textContent = existingSubmission.AdminFeedback;
  }

  // Default to enabled
  formElements.forEach(el => el.disabled = false);
  mainButton.style.display = 'block';
  secondaryButton.style.display = 'block';
  ackButton.style.display = 'none';

  if (status === 'Verified') {
      formElements.forEach(el => el.disabled = true);
      mainButton.textContent = 'Verified (Locked)';
      secondaryButton.style.display = 'none'; // Hide secondary button
  } else if (status === 'Requires Action') {
      // Only show the acknowledge button, disable the rest of the form until acknowledged
      formElements.forEach(el => el.disabled = true);
      ackButton.disabled = false;
      ackButton.style.display = 'block';
      mainButton.style.display = 'none';
      secondaryButton.style.display = 'none';
  } else if (status === 'Submitted') {
      mainButton.textContent = 'Update Submission';
      mainButton.dataset.action = 'update';
      secondaryButton.textContent = 'Revert to Draft';
      secondaryButton.dataset.action = 'draft';
  } else if (status === 'Partially Complete') {
      mainButton.textContent = 'Submit for Review';
      mainButton.dataset.action = 'submit';
      secondaryButton.textContent = 'Update Draft';
      secondaryButton.dataset.action = 'draft';
  } else { // Unlocked / New Submission
      mainButton.textContent = 'Submit for Review';
      mainButton.dataset.action = 'submit';
      secondaryButton.textContent = 'Save as Draft';
      secondaryButton.dataset.action = 'draft';
  }
}

function closeModal() {
  document.getElementById('submission-modal').style.display = 'none';
}

/**
 * Validates if a given URL is an acceptable image link.
 * @param {string} urlString The URL to validate.
 * @returns {{isValid: boolean, message: string}}
 */
function validateEvidenceLink(urlString) {
    if (!urlString) {
        return { isValid: true, message: '' }; // An empty link is not an error.
    }

    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname.toLowerCase();

        // Rule 1: Allow specific Discord channel links
        if (hostname === 'discord.com' && pathname.startsWith('/channels/')) {
            return { isValid: true, message: '' };
        }

        // Rule 2: Block links from video/clip sharing sites
        const blockedDomains = ['medal.tv', 'youtube.com', 'youtu.be', 'twitch.tv', 'streamable.com'];
        if (blockedDomains.some(domain => hostname.includes(domain))) {
            return { isValid: false, message: `Links from ${hostname} are not permitted as they are for video clips.` };
        }

        // Rule 3: Allow direct image links from common hosts
        const allowedImageHosts = ['i.imgur.com', 'i.gyazo.com', 'i.postimg.cc', 'cdn.discordapp.com', 'media.discordapp.net', 'i.prntscr.com', 'i.ibb.co'];
        if (allowedImageHosts.some(host => hostname.endsWith(host))) {
            // Further check for valid image extensions on these hosts
            if (/\.(png|jpg|jpeg|webp)$/.test(pathname)) {
                return { isValid: true, message: '' };
            }
            return { isValid: false, message: 'Link must be a direct image (png, jpg, jpeg, webp).' };
        }

        // Rule 4: General rule for any other link - must end in a valid image extension
        if (/\.(png|jpg|jpeg|webp)$/.test(pathname)) {
            return { isValid: true, message: '' };
        }

        return { isValid: false, message: 'Link must be a direct image (e.g., ending in .png or .jpg) or a Discord message link.' };

    } catch (e) {
        return { isValid: false, message: 'Invalid URL format.' };
    }
}

async function handleAcknowledgeFeedback() {
    const tileId = document.getElementById('modal-tile-id').value;
    const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tileId && !s.IsArchived);
    if (!existingSubmission) return;

    const dataToUpdate = { RequiresAction: false, IsComplete: false }; // Revert to a draft state
    await submissionManager.saveSubmission(existingSubmission.docId, dataToUpdate);
    showMessage('Feedback acknowledged. You can now edit and resubmit.', false);
    closeModal(); // Close and re-open to refresh the state
}

async function handleFormSubmit(event) {
  event.preventDefault();
  document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = true);
  showGlobalLoader();

  // --- NEW: Collect evidence data ---
  let allLinksAreValid = true;
  const evidenceItems = [];
  document.querySelectorAll('#evidence-container .evidence-item').forEach(item => {
      const link = item.querySelector('.evidence-link').value.trim();
      const name = item.querySelector('.evidence-name').value.trim();

      // --- NEW: Validate each link ---
      const validationResult = validateEvidenceLink(link);
      if (!validationResult.isValid) {
          allLinksAreValid = false;
          showMessage(validationResult.message, true);
          item.querySelector('.evidence-link').style.borderColor = 'var(--error-color)';
      } else {
          item.querySelector('.evidence-link').style.borderColor = ''; // Clear error style
      }

      if (link || name) { // Only add if at least one field is filled
          evidenceItems.push({ link, name });
      }
  });

  if (!allLinksAreValid) {
      document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = false);
      hideGlobalLoader();
      return; // Stop submission if any link is invalid
  }

  const canSubmit = authState.isLoggedIn && authState.profile?.team === currentTeam;
  if (!canSubmit) {
      showMessage('You do not have permission to submit for this team.', true);
      document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = false);
      hideGlobalLoader();
      return;
  }
  
  const tileId = document.getElementById('modal-tile-id').value;
  const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tileId && !s.IsArchived);

  // Determine if the main or secondary button was clicked
  const clickedButton = event.submitter;
  const action = clickedButton.dataset.action;

  const dataToSave = {
    PlayerIDs: JSON.parse(document.getElementById('player-ids-value').value || '[]'),
    AdditionalPlayerNames: document.getElementById('additional-players-value').value,
    Evidence: JSON.stringify(evidenceItems),
    Notes: document.getElementById('notes').value,
    Team: currentTeam,
    id: tileId,
    // NEW: Set IsComplete based on which button was clicked
    IsComplete: action === 'submit' || action === 'update',
    // When reverting to draft, clear RequiresAction flag if it exists
    RequiresAction: action === 'draft' ? false : (existingSubmission?.RequiresAction || false),
  };
  
  // FIX: Define historyEntry before using it.
  const historyEntry = {
      timestamp: new Date(),
      user: { uid: authState.user.uid, name: authState.profile.displayName },
      changes: []
  };

  // If this was a "Requires Action" tile and we are now submitting, log it.
  if (existingSubmission?.RequiresAction && dataToSave.IsComplete) {
      historyEntry.action = 'Player Resubmission';
      historyEntry.changes.push({ field: 'AdminFeedback', from: `"${existingSubmission.AdminFeedback}"`, to: 'Acknowledged & Cleared' });
      dataToSave.RequiresAction = false; // Player has addressed the issue
  } else {
      historyEntry.action = 'Player Update';
  }

  try {
      if (existingSubmission) {
          // Log specific changes by comparing against original values
          if (dataToSave.IsComplete !== !!existingSubmission.IsComplete) historyEntry.changes.push({ field: 'IsComplete', from: !!existingSubmission.IsComplete, to: dataToSave.IsComplete });
          if (JSON.stringify(dataToSave.PlayerIDs) !== JSON.stringify(existingSubmission.PlayerIDs || [])) historyEntry.changes.push({ field: 'PlayerIDs', from: 'Previous players', to: 'New players' });
          if (dataToSave.AdditionalPlayerNames !== (existingSubmission.AdditionalPlayerNames || '')) historyEntry.changes.push({ field: 'AdditionalPlayerNames', from: existingSubmission.AdditionalPlayerNames || '', to: dataToSave.AdditionalPlayerNames });
          if (dataToSave.Notes !== (existingSubmission.Notes || '')) historyEntry.changes.push({ field: 'Notes', from: existingSubmission.Notes || '', to: dataToSave.Notes });
          const oldEvidence = existingSubmission.Evidence || '[]'; // Evidence is stored as a string
          if (dataToSave.Evidence !== oldEvidence) historyEntry.changes.push({ field: 'Evidence', from: 'Previous evidence', to: 'New evidence' }); // Keep it simple for evidence

          // Only add history if there were actual changes
          if (historyEntry.changes.length > 0) {
              // The manager expects raw data, not special Firestore field values
              dataToSave.history = [...(existingSubmission.history || []), historyEntry];
          }

          if (dataToSave.IsComplete && !existingSubmission.IsComplete) {
              dataToSave.CompletionTimestamp = new Date(); // The manager will handle server timestamps if needed
          }
          await submissionManager.saveSubmission(existingSubmission.docId, dataToSave);
      } else {
          dataToSave.Timestamp = new Date();
          if (dataToSave.IsComplete) {
              dataToSave.CompletionTimestamp = new Date();
          }
          historyEntry.action = 'Player Create';
          dataToSave.history = [historyEntry];
          await submissionManager.saveSubmission(null, dataToSave);
      }
      showMessage('Submission saved!', false);
      closeModal();
  } catch (error) {
      showMessage('Submission failed: ' + error.message, true);
      console.error("Submission error:", error);
  } finally {
      document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = false);
      hideGlobalLoader();
  }
}

// --- NEW: Login Modal Functions ---
function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}
function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}
