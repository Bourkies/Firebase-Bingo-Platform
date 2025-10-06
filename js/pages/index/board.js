import { createTileElement } from '../../components/TileRenderer.js';
import { renderScoreboard as renderScoreboardComponent } from '../../components/Scoreboard.js';
import { showMessage, hexToRgba } from '../../core/utils.js';

let mainController;

export function initializeBoard(controller) {
    console.log('[Board] Initializing with controller.');
    mainController = controller;
}

export function getTileStatus(tile, teamName) {
    const { config, teamData, authState } = mainController.getState();

    // This function can be very noisy, so we'll keep its logging commented out unless needed for deep debugging.
    if (isGenericView()) return 'Unlocked';

    const isPublic = config.boardVisibility !== 'private';
    if (!isPublic && teamName && teamName !== authState.profile?.team) {
        return 'Hidden';
    }

    if (!teamName || !teamData[teamName]) return 'Locked';
    const teamTileStates = teamData[teamName].tileStates;
    const state = teamTileStates[tile.id] || {};
    if (state.verified) return 'Verified';
    if (state.requiresAction) return 'Requires Action';
    if (state.complete) return 'Submitted';
    if (state.hasSubmission) return 'Partially Complete';

    const unlockOnVerifiedOnly = config.unlockOnVerifiedOnly === true;
    const prereqString = tile.Prerequisites || '';

    if (!prereqString || !prereqString.trim()) {
        return 'Unlocked';
    }

    let orGroups = [];
    let isNewFormat = false;

    if (prereqString.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(prereqString);
            if (Array.isArray(parsed) && (parsed.length === 0 || Array.isArray(parsed[0]))) {
                orGroups = parsed;
                isNewFormat = true;
            }
        } catch (e) { /* Fall through */ }
    }

    if (!isNewFormat) {
        const andGroup = prereqString.split(',').map(s => s.trim()).filter(Boolean);
        orGroups = andGroup.length > 0 ? [andGroup] : [];
    }

    if (orGroups.length === 0) {
        return 'Unlocked';
    }

    const prereqsMet = orGroups.some(andGroup => {
        return andGroup.every(prereqId => {
            const prereqState = teamTileStates[prereqId] || {};
            return unlockOnVerifiedOnly ? prereqState.verified : (prereqState.verified || prereqState.complete);
        });
    });
    return prereqsMet ? 'Unlocked' : 'Locked';
}

export function renderBoard() {
    console.log('[Board] renderBoard called.');
    const { config, authState, tiles, currentTeam, allTeams } = mainController.getState();
    const container = document.getElementById('board-container');
    // NEW: Use the dedicated notification container.
    const notificationContainer = document.getElementById('board-notification');
    notificationContainer.innerHTML = ''; // Always clear previous messages on re-render.

    if (!config) {
        return;
    }

    const isPrivate = config.boardVisibility === 'private';
    const isCensored = config.censorTilesBeforeEvent === true && !authState.isEventMod;
    const isLoggedIn = authState.isLoggedIn;
    const hasTeam = !!authState.profile?.team;

    // --- User Feedback & Access Control ---
    if (isPrivate && isCensored) {
        if (!isLoggedIn) {
            container.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">You must be logged in and assigned to a team to view the board.</p>';
            return;
        }
        if (!hasTeam) {
            container.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">You must be assigned to a team to view the board. Please contact an administrator or your team captain.</p>';
            return;
        }
    } else if (isPrivate && !isCensored) {
        // The board is visible, but we show a helpful message above it.
        let message = '';
        if (!isLoggedIn) {
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You must be logged in and assigned to a team to view your teams progress.</p>';
        } else if (!hasTeam) {
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You must be assigned to a team to view your teams progress.</p>';
        }
        notificationContainer.innerHTML = message;
    } else if (!isPrivate && isCensored) {
        notificationContainer.innerHTML = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">The event has not started. Tile details are hidden.</p>';
        // Don't return, we still want to render the censored board.
    } else if (!isPrivate && !isCensored) {
        // NEW: Handle public, non-censored board states.
        let message = '';
        if (!isLoggedIn) {
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You must be logged and assigned a team to view, edit or add submissions.</p>';
        } else if (!hasTeam) {
            message = '<p style="text-align:center; color: var(--secondary-text); padding: 1rem; background-color: var(--surface-color); border-radius: 8px; margin-bottom: 1rem;">You must be assigned a team to view, edit or add submissions.</p>';
        }
        notificationContainer.innerHTML = message;
    }


    const shouldShowGeneric = isGenericView();
    if (!tiles || tiles.length === 0 || (!currentTeam && !shouldShowGeneric)) {
        console.log('[Board] renderBoard aborted: No tiles or no current team in non-generic view.');
        // If there's nothing to render, ensure the board container is empty. The notification container is handled separately.
        container.innerHTML = '';
        document.getElementById('page-title').textContent = config.pageTitle || 'Bingo';
        return;
    }

    container.innerHTML = ''; // Clear the board container for a fresh render.
    const displayTeam = isPrivate ? authState.profile?.team : currentTeam;
    const displayTeamName = (displayTeam && allTeams) ? (allTeams[displayTeam]?.name || displayTeam) : '';

    const pageName = displayTeamName || 'Bingo Board';
    document.title = `${config.pageTitle || 'Bingo'} | ${pageName}`;
    document.getElementById('page-title').textContent = displayTeam ? displayTeamName : (config.pageTitle || 'Bingo');
    const tooltip = document.getElementById('tile-tooltip');

    const renderTiles = () => {
        tiles.forEach(tile => {
            if (getTileStatus(tile, displayTeam) === 'Hidden') return;
            const status = getTileStatus(tile, displayTeam);
            const { allStyles } = mainController.getState();

            const tileDiv = createTileElement(tile, status, config, allStyles, { baseClass: 'tile-overlay' });
            const tileName = config.censorTilesBeforeEvent && !authState.isEventMod ? 'Censored' : (tile.Name || 'Unnamed Tile');
            const tileDesc = config.censorTilesBeforeEvent && !authState.isEventMod ? 'This tile is hidden until the event begins.' : (tile.Description || 'No description.');
            const tilePoints = tile.Points ? ` (${tile.Points} pts)` : '';

            tileDiv.addEventListener('mousemove', (e) => {
                tooltip.innerHTML = `<h4>${tile.id}: ${tileName}${tilePoints}</h4><p>${tileDesc}</p>`;
                tooltip.style.display = 'block';
                tooltip.style.left = `${e.clientX + 15}px`;
                tooltip.style.top = `${e.clientY + 15}px`;
            });
            tileDiv.addEventListener('mouseout', () => {
                tooltip.style.display = 'none';
            });

            if ((config.showTileNames === true || !config.boardImageUrl) && !tileDiv.querySelector('.stamp-image')) {
                const tileNameSpan = document.createElement('span');
                tileNameSpan.textContent = tileName;
                tileDiv.appendChild(tileNameSpan);
            }

            const genericView = isGenericView();
            const isMyTeam = authState.isLoggedIn && authState.profile?.team === displayTeam;
            const canOpenModal = !genericView && isMyTeam && status !== 'Locked';

            if (canOpenModal) {
                tileDiv.onclick = () => mainController.openSubmissionModal(tile, status);
            } else if (status === 'Locked') {
                // Do nothing
            } else if (!displayTeam) {
                tileDiv.onclick = () => showMessage('Please select your team to interact with a tile.', true);
            } else if (!isMyTeam) {
                tileDiv.style.cursor = 'not-allowed';
            }

            container.appendChild(tileDiv);
        });
    };

    const setPlaceholderBackground = () => {
        container.style.backgroundImage = 'linear-gradient(45deg, #2a2a2a 25%, transparent 25%), linear-gradient(-45deg, #2a2a2a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #2a2a2a 75%), linear-gradient(-45deg, transparent 75%, #2a2a2a 75%)';
        container.style.backgroundSize = '20px 20px';
        container.style.backgroundRepeat = 'repeat';
        container.style.aspectRatio = '1 / 1';
    };

    const imageUrl = config.boardImageUrl;
    if (!imageUrl) {
        setPlaceholderBackground();
        renderTiles();
        return;
    }
    const img = new Image();
    img.onload = () => {
        container.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
        container.style.backgroundImage = `url('${imageUrl}')`;
        container.style.backgroundSize = 'cover';
        container.style.backgroundRepeat = 'no-repeat';
        renderTiles();
    };
    img.onerror = () => {
        setPlaceholderBackground();
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.innerHTML = `<strong>Image Failed to Load</strong>`;
        container.appendChild(errorDiv);
        renderTiles();
    };
    img.src = imageUrl;
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