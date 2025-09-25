import '../components/Navbar.js';
import { db, fb } from '../core/firebase-config.js';
import { initAuth, signInWithGoogle, signInAnonymously, getAuthState, updateUserDisplayName } from '../core/auth.js';
import { createTileElement } from '../components/TileRenderer.js';
import { showMessage, showGlobalLoader, hideGlobalLoader, hexToRgba } from '../core/utils.js';

let config = {}, allTeams = {}, allStyles = {}, tiles = [], submissions = [], teamData = {}, scoreboard = [], currentTeam = '', authState = {}, allUsers = [];
let unsubscribeConfig = null, unsubscribeTiles = null, unsubscribeSubmissions = null, unsubscribeStyles = null, unsubscribeUsers = null;

document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners programmatically instead of using inline onclick
    document.getElementById('team-selector').addEventListener('change', handleTeamChange);
    document.querySelector('#submission-modal .close-button').addEventListener('click', closeModal);
    document.getElementById('submission-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('add-evidence-btn').addEventListener('click', () => addEvidenceInput());
    document.querySelector('#login-modal .close-button').addEventListener('click', closeLoginModal);

    // Use event delegation for dynamically created elements
    document.getElementById('evidence-container').addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-evidence-btn')) {
            event.target.closest('.evidence-item').remove();
            renumberEvidenceItems();
        }
    });

    document.body.addEventListener('login-request', openLoginModal);
    // Initialize data listeners first, then auth. This prevents race conditions.
    initializeApp();
    document.getElementById('login-google').addEventListener('click', () => { signInWithGoogle(); closeLoginModal(); });
    document.getElementById('login-anon').addEventListener('click', () => { signInAnonymously(); closeLoginModal(); });
    document.getElementById('welcome-form').addEventListener('submit', handleWelcomeFormSubmit);
    initAuth(onAuthStateChanged);
});

async function onAuthStateChanged(newAuthState) {
    authState = newAuthState;
    updatePageForAuth();

    // When auth state changes, team visibility might change (especially for private boards).
    // We need to re-evaluate and re-populate the team selector.
    const loadFirstTeam = config.loadFirstTeamByDefault === true;

    // If the auth callback was triggered by a team change, show a message.
    if (newAuthState.teamChanged) {
        const newTeamName = allTeams[newAuthState.profile.team]?.name || 'a new team';
        showMessage(`Your team has been changed to: ${newTeamName}. The board has been updated.`, false);
    }
    populateTeamSelector(allTeams, loadFirstTeam);
    setupUsersListener(); // Re-fetch users based on new auth state (e.g., to see teammates).
    setupSubmissionsListener(); // Re-setup the submissions listener based on the new auth state.

    // NEW: Welcome modal logic
    // Check if user is logged in, config allows prompting, and user hasn't set their name yet.
    if (authState.isLoggedIn && authState.profile && config.promptForDisplayNameOnLogin === true && authState.profile.hasSetDisplayName !== true) {
        showWelcomeModal();
    }
}

// This function sets up the listener for tiles, respecting censorship rules.
const setupTilesListener = () => {
    if (unsubscribeTiles) unsubscribeTiles();
    const isCensored = config.censorTilesBeforeEvent === true && !authState.isEventMod;
    const tilesCollectionName = isCensored ? 'public_tiles' : 'tiles';
    console.log(`Board censorship is ${isCensored ? 'ON' : 'OFF'}. Reading from '${tilesCollectionName}'.`);

    unsubscribeTiles = fb.onSnapshot(fb.collection(db, tilesCollectionName), (snapshot) => {
        console.log("Tiles updated in real-time.");
        tiles = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        processAllData();
        renderBoard(); // Render board with new tiles
    }, (error) => { console.error(`Error loading ${tilesCollectionName}:`, error); hideGlobalLoader(); });
};

// This function sets up the listener for submissions, respecting privacy rules.
const setupSubmissionsListener = () => {
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    let submissionsQuery;
    const isPrivateBoard = config.boardVisibility === 'private';
    const isPlayerOnTeam = authState.isLoggedIn && authState.profile?.team;

    if (isPrivateBoard && isPlayerOnTeam && !authState.isEventMod) {
        console.log(`Private board detected. Fetching submissions for team: ${authState.profile.team}`);
        submissionsQuery = fb.query(fb.collection(db, 'submissions'), fb.where('Team', '==', authState.profile.team));
    } else {
        submissionsQuery = fb.collection(db, 'submissions');
    }

    unsubscribeSubmissions = fb.onSnapshot(submissionsQuery, (snapshot) => {
        console.log("Submissions updated in real-time.");
        submissions = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        processAllData();
        renderBoard(); // Re-render board with new submission data
    }, (error) => { console.error("Error loading submissions:", error); hideGlobalLoader(); });
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
    unsubscribeConfig = fb.onSnapshot(fb.doc(db, 'config', 'main'), (doc) => {
        console.log("Config updated in real-time.");
        if (!doc.exists()) {
            document.getElementById('board-container').innerHTML = `<div class="error-message">Board configuration not found. Please contact an admin.</div>`;
            hideGlobalLoader();
            return;
        }
        config = doc.data();

        // After config is loaded, we can set up the other listeners that depend on it.
        setupTilesListener();
        setupSubmissionsListener();
        
        applyGlobalStyles();
        const loadFirstTeam = config.loadFirstTeamByDefault === true;
        populateTeamSelector(allTeams, loadFirstTeam);
        handleTeamChange();

        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        renderColorKey();
        renderScoreboard();
        if (!initialDataLoaded.config) { initialDataLoaded.config = true; checkAllLoaded(); }
    }, (error) => { console.error("Error loading config:", error); hideGlobalLoader(); });

    // Initial setup for listeners that don't depend on config.
    // They will be re-triggered by the config listener once it loads.
    setupTilesListener();
    setupSubmissionsListener();

    // Listener for the new teams collection
    const teamsQuery = fb.query(fb.collection(db, 'teams'), fb.orderBy(fb.documentId()));
    unsubscribeTeams = fb.onSnapshot(teamsQuery, (snapshot) => {
        console.log("Teams updated in real-time.");
        allTeams = {};
        snapshot.docs.forEach(doc => { allTeams[doc.id] = doc.data(); });
        const loadFirstTeam = config.loadFirstTeamByDefault === true;
        const selector = document.getElementById('team-selector');
        const previouslySelected = selector.value; // Keep this to preserve selection on public boards

        populateTeamSelector(allTeams, loadFirstTeam);

        // If the selector is now disabled, its value was set correctly inside populateTeamSelector and we should not touch it.
        // If it's not disabled (public board), try to preserve the previous selection.
        if (!selector.disabled) {
            if (Object.keys(allTeams).includes(previouslySelected)) {
                selector.value = previouslySelected;
            } else if (loadFirstTeam && Object.keys(allTeams).length > 0) {
                selector.value = Object.keys(allTeams).sort((a, b) => a.localeCompare(b))[0];
            }
        }
        handleTeamChange(); // Re-render board with new team data
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }, (error) => { console.error("Error loading teams:", error); });

    // Listener for the new styles collection
    unsubscribeStyles = fb.onSnapshot(fb.collection(db, 'styles'), (snapshot) => {
        console.log("Styles updated in real-time.");
        allStyles = {};
        snapshot.docs.forEach(doc => { allStyles[doc.id] = doc.data(); });
        renderColorKey();
        renderBoard(); // Re-render board with new styles
        if (!initialDataLoaded.styles) { initialDataLoaded.styles = true; checkAllLoaded(); }
    }, (error) => { console.error("Error loading styles:", error); });
}

function updatePageForAuth() {
    // This button is part of the Navbar component, so we must wait for it to be rendered.
    const changeNameBtn = document.getElementById('change-name-btn');
    if (changeNameBtn) {
        if (authState.isLoggedIn) {
            const profile = authState.profile || {};
            const canChangeName = !profile.isNameLocked;
            changeNameBtn.style.display = canChangeName ? 'inline-block' : 'none';
            changeNameBtn.onclick = () => showWelcomeModal(true); // Attach listener here
        } else {
            changeNameBtn.style.display = 'none';
        }
    }
}

// Listener for users collection, must be called after auth state is known
function setupUsersListener() {
    if (unsubscribeUsers) unsubscribeUsers();
    let usersQuery;
    // Admins/mods can see all users. Regular players can only see their own teammates.
    if (authState.isEventMod) {
        usersQuery = fb.collection(db, 'users');
    } else if (authState.isLoggedIn && authState.profile?.team) {
        usersQuery = fb.query(fb.collection(db, 'users'), fb.where('team', '==', authState.profile.team));
    } else {
        allUsers = []; // Logged out user can't see anyone.
        return;
    }
    unsubscribeUsers = fb.onSnapshot(usersQuery, (snapshot) => {
        console.log("Users updated in real-time.");
        allUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id }));
        // The navbar component has its own user listener, so no need to call an update here.
        // No need to check initialDataLoaded here as it's part of the auth flow
    }, (error) => { console.error("Error loading users:", error); });
}

function processAllData() {
    teamData = {};
    const newScoreboard = [];
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

    // Calculate scoreboard
    teamIds.forEach(teamId => {
        let score = 0;
        let completedTiles = 0;
        tiles.forEach(tile => {
            const status = getTileStatus(tile, teamId);
            const scoreOnVerified = config.scoreOnVerifiedOnly === true;
            const isScored = scoreOnVerified ? status === 'Verified' : (status === 'Verified' || status === 'Submitted');

            if (isScored) {
                score += parseInt(tile.Points) || 0;
                completedTiles++;
            }
        });
        newScoreboard.push({ teamId: teamId, score, completedTiles });
    });

    scoreboard = newScoreboard.sort((a, b) => b.score - a.score);
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
    // Scenario 1: Board is private, and the user is either not logged in or not on a team.
    if (config.boardVisibility === 'private' && (!authState.isLoggedIn || !authState.profile?.team)) return true;
    // Scenario 2: Board is public, but no team is selected and the config doesn't load one by default.
    if (config.boardVisibility !== 'private' && !currentTeam && config.loadFirstTeamByDefault !== true) return true;
    return false;
}

function handleTeamChange() {
  const selector = document.getElementById('team-selector');
  currentTeam = selector.value;
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
  const shouldShowGeneric = isGenericView();
  // Clear the board if there are no tiles, OR if no team is selected AND we are not in a generic view.
  if (!tiles || tiles.length === 0 || (!currentTeam && !shouldShowGeneric)) {
    document.getElementById('board-container').innerHTML = '';
    document.getElementById('page-title').textContent = config.pageTitle || 'Bingo'; // Set title when board is cleared
    return;
  }

  const container = document.getElementById('board-container');
  container.innerHTML = '';
  const displayTeam = currentTeam;
  const displayTeamName = (displayTeam && allTeams) ? (allTeams[displayTeam]?.name || displayTeam) : '';
  
  if (displayTeam) {
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
    const container = document.getElementById('scoreboard-container');
    if (!config || config.showScoreboard !== true) {
        container.style.display = 'none'; return;
    }
    container.style.display = 'flex';
    container.innerHTML = '<h2>Scoreboard</h2>';

    let dataToRender = scoreboard;
    const isPrivate = config.boardVisibility === 'private';

    // Filter scoreboard data for private boards
    if (isPrivate) {
        if (authState.isLoggedIn && authState.profile?.team) {
            // User is on a team, show only their team
            dataToRender = scoreboard.filter(item => item.teamId === authState.profile.team);
        } else {
            // User not on a team, show no scores
            dataToRender = [];
        }
    }

    if (dataToRender.length === 0) {
        const noScoreItem = document.createElement('div');
        noScoreItem.textContent = 'No scores to display.';
        noScoreItem.style.textAlign = 'center';
        noScoreItem.style.color = '#888';
        container.appendChild(noScoreItem);
    } else {
        dataToRender.forEach((team) => {
            const item = document.createElement('div');
            item.className = 'scoreboard-item';
            const teamName = (allTeams && allTeams[team.teamId]) ? allTeams[team.teamId].name : team.teamId;
            if (isPrivate) {
                // For private boards, hide rank and adjust grid
                item.style.gridTemplateColumns = '1fr 60px';
                item.innerHTML = `<div class="scoreboard-team">${teamName}</div><div class="scoreboard-score">${team.score}</div>`;
            } else {
                // For public boards, show rank as normal
                const originalIndex = scoreboard.findIndex(item => item.teamId === team.teamId);
                const rank = originalIndex !== -1 ? originalIndex + 1 : '-';
                item.innerHTML = `<div class="scoreboard-rank">${rank}.</div><div class="scoreboard-team">${teamName}</div><div class="scoreboard-score">${team.score}</div>`;
            }
            container.appendChild(item);
        });
    }
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

  populatePlayerNameSelector(existingSubmission?.PlayerIDs || [], existingSubmission?.AdditionalPlayerNames || '');
  document.getElementById('notes').value = existingSubmission?.Notes || '';
  document.getElementById('mark-as-complete').checked = existingSubmission?.IsComplete || false;

  let evidenceData = [];
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

  const formElements = document.querySelectorAll('#submission-form input, #submission-form textarea, #submission-form button');
  const submitButton = document.getElementById('submit-button');
  submitButton.className = ''; // Reset button style

  if (isEditable) {
      formElements.forEach(el => el.disabled = false);
      // NEW: Check for admin feedback to change button text/style
      if (existingSubmission?.AdminFeedback) {
          document.getElementById('admin-feedback-display').style.display = 'block';
          document.getElementById('admin-feedback-text').textContent = existingSubmission.AdminFeedback;
          submitButton.textContent = 'Resubmit for Review';
          submitButton.classList.add('resubmit-btn');
      } else {
          submitButton.textContent = 'Save Progress';
      }
  } else {
      formElements.forEach(el => el.disabled = true);
      submitButton.textContent = 'Verified (Locked)';
  }
}

function closeModal() {
  document.getElementById('submission-modal').style.display = 'none';
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const submitButton = document.getElementById('submit-button');
  submitButton.disabled = true;
  showGlobalLoader();

  // --- NEW: Collect evidence data ---
  const evidenceItems = [];
  document.querySelectorAll('#evidence-container .evidence-item').forEach(item => {
      const link = item.querySelector('.evidence-link').value.trim();
      const name = item.querySelector('.evidence-name').value.trim();
      if (link || name) { // Only add if at least one field is filled
          evidenceItems.push({ link, name });
      }
  });

  const canSubmit = authState.isLoggedIn && authState.profile?.team === currentTeam;
  if (!canSubmit) {
      showMessage('You do not have permission to submit for this team.', true);
      submitButton.disabled = false;
      hideGlobalLoader();
      return;
  }
  
  const tileId = document.getElementById('modal-tile-id').value;
  const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tileId && !s.IsArchived);

  const dataToSave = {
    PlayerIDs: JSON.parse(document.getElementById('player-ids-value').value || '[]'),
    AdditionalPlayerNames: document.getElementById('additional-players-value').value,
    Evidence: JSON.stringify(evidenceItems),
    Notes: document.getElementById('notes').value,
    Team: currentTeam,
    id: tileId, // Save the user-facing tile ID
    IsComplete: document.getElementById('mark-as-complete').checked,
  };
  
  // FIX: Define historyEntry before using it.
  const historyEntry = {
      timestamp: new Date(),
      user: { uid: authState.user.uid, name: authState.profile.displayName },
      changes: []
  };

  // If this is a resubmission, clear the feedback and "Requires Action" flag
  if (existingSubmission?.AdminFeedback) {
      historyEntry.action = 'Player Resubmission';
      historyEntry.changes.push({ field: 'AdminFeedback', from: `"${existingSubmission.AdminFeedback}"`, to: 'Acknowledged & Cleared' });
      dataToSave.RequiresAction = false; // Player has addressed the issue
      dataToSave.AdminFeedback = ''; // Clear the feedback message
  } else {
      historyEntry.action = 'Player Update';
  }

  try {
      if (existingSubmission) {
          // Use the correct document ID to get the reference for updating.
          const subRef = fb.doc(db, 'submissions', existingSubmission.docId);
          // Log specific changes by comparing against original values
          if (dataToSave.IsComplete !== !!existingSubmission.IsComplete) historyEntry.changes.push({ field: 'IsComplete', from: !!existingSubmission.IsComplete, to: dataToSave.IsComplete });
          if (JSON.stringify(dataToSave.PlayerIDs) !== JSON.stringify(existingSubmission.PlayerIDs || [])) historyEntry.changes.push({ field: 'PlayerIDs', from: 'Previous players', to: 'New players' });
          if (dataToSave.AdditionalPlayerNames !== (existingSubmission.AdditionalPlayerNames || '')) historyEntry.changes.push({ field: 'AdditionalPlayerNames', from: existingSubmission.AdditionalPlayerNames || '', to: dataToSave.AdditionalPlayerNames });
          if (dataToSave.Notes !== (existingSubmission.Notes || '')) historyEntry.changes.push({ field: 'Notes', from: existingSubmission.Notes || '', to: dataToSave.Notes });
          const oldEvidence = existingSubmission.Evidence || '[]';
          if (dataToSave.Evidence !== oldEvidence) historyEntry.changes.push({ field: 'Evidence', from: 'Previous evidence', to: 'New evidence' }); // Keep it simple for evidence

          // Only add history if there were actual changes
          if (historyEntry.changes.length > 0) {
              dataToSave.history = fb.arrayUnion(historyEntry);
          }

          if (dataToSave.IsComplete && !existingSubmission.IsComplete) {
              dataToSave.CompletionTimestamp = fb.serverTimestamp();
          }
          await fb.updateDoc(subRef, dataToSave);
      } else {
          dataToSave.Timestamp = fb.serverTimestamp(); // This call is correct
          if (dataToSave.IsComplete) {
              dataToSave.CompletionTimestamp = fb.serverTimestamp();
          }
          historyEntry.action = 'Player Create';
          dataToSave.history = [historyEntry];
          await fb.addDoc(fb.collection(db, 'submissions'), dataToSave);
      }
      showMessage('Submission saved!', false);
      closeModal();
  } catch (error) {
      showMessage('Submission failed: ' + error.message, true);
      console.error("Submission error:", error);
  } finally {
      submitButton.disabled = false;
      hideGlobalLoader();
  }
}

// --- NEW: Welcome Modal Functions ---
function showWelcomeModal(isUpdate = false) {
    const modal = document.getElementById('welcome-modal');
    const messageEl = document.getElementById('welcome-modal-message');
    const nameInput = document.getElementById('welcome-display-name');
    const titleEl = modal.querySelector('h2');

    const defaultMessage = 'Please set your display name for the event. This will be shown on leaderboards and submissions.';

    if (isUpdate) {
        titleEl.textContent = 'Update Display Name';
    } else {
        titleEl.textContent = 'Welcome!';
    }
    messageEl.textContent = (config.welcomeMessage || defaultMessage).replace('{displayName}', authState.profile.displayName || 'User');
    nameInput.value = authState.profile.displayName || '';
    modal.style.display = 'flex';
}

async function handleWelcomeFormSubmit(event) {
    event.preventDefault();
    const submitBtn = event.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    const newName = document.getElementById('welcome-display-name').value.trim();
    if (!newName || !authState.isLoggedIn) return;

    try {
        await updateUserDisplayName(newName);
        document.getElementById('welcome-modal').style.display = 'none';
        showMessage('Display name updated!', false);
    } catch (error) {
        showMessage('Failed to update display name: ' + error.message, true);
        console.error('Display name update error:', error);
    } finally {
        submitBtn.disabled = false;
    }
}

// --- NEW: Login Modal Functions ---
function openLoginModal() {
    document.getElementById('login-modal').style.display = 'flex';
}
function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}
