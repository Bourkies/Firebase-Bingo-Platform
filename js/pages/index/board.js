let mainController;

export function initializeBoard(controller) {
    console.log('[Board] Initializing with controller.');
    mainController = controller;
}

export function renderBoard(options = {}) {
    console.log('[Board] renderBoard called.');
    const { config, authState, tiles, currentTeam, allTeams, teamData, allStyles, allTiles } = mainController.getState();
    const boardComponent = document.getElementById('board-container');
    // NEW: Use the dedicated notification container.
    const notificationContainer = document.getElementById('board-notification');
    notificationContainer.innerHTML = ''; // Always clear general notifications on re-render.

    if (!config) {
        return;
    }

    const shouldShowGeneric = isGenericView();
    // REVISED: The check for `tiles.length === 0` is removed.
    // We now trust the <bingo-board> component to handle a temporarily empty tiles array.
    // The component will simply render nothing and wait for the property to be updated with data.
    // We only abort if there's no team selected and it's not a generic view.
    if (!currentTeam && !shouldShowGeneric) {
        console.log('[Board] renderBoard aborted: No current team in non-generic view.');
        // Do not clear the boardComponent's innerHTML, as that removes the Lit component.
        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        return;
    }

    // FIX: Re-define isPrivate, which was removed in the last refactor.
    const isPrivate = config.boardVisibility === 'private';

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
    boardComponent.allTiles = allTiles; // Pass the full tile list for layout purposes
    boardComponent.isGenericView = shouldShowGeneric;
    boardComponent.setupMode = options.setupMode || false; // Pass setupMode to the component
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