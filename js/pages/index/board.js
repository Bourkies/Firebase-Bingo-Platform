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
            // The controller now handles hiding the scoreboard and color key components.
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

    // --- REFACTORED: User Feedback & Access Control ---
    const messageConfig = {
        private: {
            censored: {
                loggedIn: {
                    withTeam: null, // Render board
                    withoutTeam: { type: 'block', content: 'You must be assigned to a team to view the board. Please contact an administrator or your team captain.' }
                },
                loggedOut: { type: 'block', content: 'You must be logged in and assigned to a team to view the board.' }
            },
            notCensored: {
                loggedIn: {
                    withTeam: null, // Render board
                    withoutTeam: { type: 'notify', content: 'You are not yet assigned to a team. Please contact an administrator.' }
                },
                loggedOut: { type: 'notify', content: 'This is a private event. Please log in to see team progress.' }
            }
        },
        public: {
            censored: {
                any: { type: 'notify', content: 'The event has not started. Tile details are hidden.' }
            },
            notCensored: {
                loggedIn: {
                    withTeam: null, // Render board
                    withoutTeam: { type: 'notify', content: 'You are not assigned to a team. Please select a team to see its progress.' }
                },
                loggedOut: { type: 'notify', content: 'You are not logged in. Please log in to see team progress.' }
            }
        }
    };

    const visibility = isPrivate ? 'private' : 'public';
    const censorship = isCensored ? 'censored' : 'notCensored';
    const loginStatus = isLoggedIn ? 'loggedIn' : 'loggedOut';
    const teamStatus = hasTeam ? 'withTeam' : 'withoutTeam';

    let message = messageConfig[visibility][censorship][loginStatus]?.[teamStatus] ?? messageConfig[visibility][censorship].any;

    if (message) {
        const messageHtml = `<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">${message.content}</p>`;
        if (message.type === 'block') {
            boardComponent.innerHTML = messageHtml;
            return;
        } else if (message.type === 'notify') {
            notificationContainer.innerHTML = messageHtml;
        }
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