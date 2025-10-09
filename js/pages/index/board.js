import { renderScoreboard as renderScoreboardComponent } from '../../components/Scoreboard.js';

let mainController;

export function initializeBoard(controller) {
    console.log('[Board] Initializing with controller.');
    mainController = controller;
}

export function renderBoard() {
    console.log('[Board] renderBoard called.');
    const { config, authState, tiles, currentTeam, allTeams, teamData, allStyles } = mainController.getState();
    const boardComponent = document.getElementById('board-container');
    // NEW: Use the dedicated notification container.
    const notificationContainer = document.getElementById('board-notification');
    const adminWarningContainer = document.getElementById('admin-warning-container');
    notificationContainer.innerHTML = ''; // Always clear general notifications on re-render.
    adminWarningContainer.innerHTML = ''; // Always clear admin warnings on re-render.

    if (!config) {
        return;
    }

    // NEW: Add a guard clause for the new "Setup Mode"
    if (config.setupModeEnabled === true) {
        if (!authState.isEventMod) {
            // For non-admins, show a simple message and hide the board completely.
            boardComponent.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">The event has not started or is currently being set up. Please check back later.</p>';
            // Also hide the scoreboard and color key.
            const scoreboardWrapper = document.querySelector('.scoreboard-wrapper');
            if (scoreboardWrapper) scoreboardWrapper.style.display = 'none';
            const colorKeyContainer = document.getElementById('color-key-container');
            if (colorKeyContainer) colorKeyContainer.innerHTML = '';
            return; // Stop all further rendering for non-admins.
        } else {
            // For admins, show a prominent, non-dismissible warning message above the board.
            const adminMessage = '<p style="text-align:center; font-weight: bold; color: var(--warn-text-color); padding: 1rem; background-color: var(--warn-bg-color); border: 2px solid var(--warn-color); border-radius: 8px; margin-bottom: 1rem;">SETUP MODE IS ON: The board is currently hidden from all non-admin users.</p>';
            adminWarningContainer.innerHTML = adminMessage; // Use the dedicated admin container
        }
    }

    const isPrivate = config.boardVisibility === 'private';
    const isCensored = config.censorTilesBeforeEvent === true && !authState.isEventMod;
    const isLoggedIn = authState.isLoggedIn;
    const hasTeam = !!authState.profile?.team;

    // --- User Feedback & Access Control ---
    if (isPrivate && isCensored) {
        if (!isLoggedIn) {
            boardComponent.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">You must be logged in and assigned to a team to view the board.</p>';
            return;
        }
        if (!hasTeam) {
            boardComponent.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">You must be assigned to a team to view the board. Please contact an administrator or your team captain.</p>';
            return;
        }
    } else if (isPrivate && !isCensored) {
        // The board is visible, but we show a helpful message above it.
        let message = '';
        if (!isLoggedIn) { // This case shows the generic board, so we guide them to log in.
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">This is a private event. Please log in to see team progress.</p>';
        } else if (!hasTeam) { // Logged in, but no team. Guide them to select one.
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You are not yet assigned to a team. Please contact an administrator.</p>';
        }
        notificationContainer.innerHTML = message;
    } else if (!isPrivate && isCensored) {
        notificationContainer.innerHTML = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">The event has not started. Tile details are hidden.</p>';
        // Don't return, we still want to render the censored board.
    } else if (!isPrivate && !isCensored) {
        // NEW: Handle public, non-censored board states.
        let message = '';
        if (!isLoggedIn) { // Public board, but guide them to log in for full functionality.
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You are not logged in. Please log in to see team progress.</p>';
        } else if (!hasTeam) { // Logged in, but no team. Guide them to select one.
            message = '<p style-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You are not assigned to a team. Please select a team to see its progress.</p>';
        }
        notificationContainer.innerHTML = message;
    }


    const shouldShowGeneric = isGenericView();
    if (!tiles || tiles.length === 0 || (!currentTeam && !shouldShowGeneric)) {
        console.log('[Board] renderBoard aborted: No tiles or no current team in non-generic view.');
        // If there's nothing to render, ensure the board container is empty. The notification container is handled separately.
        boardComponent.innerHTML = '';
        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        return;
    }

    const displayTeam = isPrivate ? authState.profile?.team : currentTeam;
    const displayTeamName = (displayTeam && allTeams) ? (allTeams[displayTeam]?.name || displayTeam) : '';

    const pageName = displayTeamName || 'Bingo Board';
    document.title = `${config.pageTitle || 'Bingo'} | ${pageName}`;
    document.getElementById('page-title').textContent = displayTeam ? displayTeamName : (config.pageTitle || 'Bingo');

    // Update the Lit component's properties
    boardComponent.config = config;
    boardComponent.authState = authState;
    boardComponent.tiles = tiles;
    boardComponent.currentTeam = currentTeam;
    boardComponent.teamData = teamData;
    boardComponent.allStyles = allStyles;
    boardComponent.displayTeam = displayTeam;
    boardComponent.isGenericView = shouldShowGeneric;
}

export function isGenericView() {
    const { config, authState, currentTeam } = mainController.getState();
    const isPrivate = config.boardVisibility === 'private';
    const isPublic = !isPrivate;
    const isLoggedInWithTeam = authState.isLoggedIn && authState.profile?.team;

    if (isPrivate && !isLoggedInWithTeam) return true;
    if (isPublic && !currentTeam) return true;
    return false;
}

export function renderScoreboard() {
    console.log('[Board] renderScoreboard called.');
    const { scoreboardData, config, allTeams, authState, teamColorMap } = mainController.getState();

    // Render Scoreboard - This single line now handles everything.
    const scoreboardTbody = document.getElementById('scoreboard-container'); // This ID now refers to the tbody
    renderScoreboardComponent(scoreboardTbody, scoreboardData, allTeams, config, authState, teamColorMap, 'Index Page');
}