/**
 * Calculates the scoreboard data from raw submissions, tiles, and team data.
 * This is the single source of truth for score calculation.
 * @param {Array<object>} submissions - All submission documents.
 * @param {Array<object>} tiles - All tile documents.
 * @param {object} allTeams - An object of all team documents, keyed by teamId.
 * @param {object} config - The main application config object.
 * @returns {Array<object>} A sorted array of team score objects.
 */
export function calculateScoreboardData(submissions, tiles, allTeams, config) {
    if (!submissions || !tiles || !allTeams || !config) {
        return [];
    }

    const scoreOnVerifiedOnly = config.scoreOnVerifiedOnly === true;
    const allTeamIds = Object.keys(allTeams);

    const leaderboardData = allTeamIds.map(teamId => {
        let score = 0;
        let completedTiles = 0;
        const teamSubmissions = submissions.filter(s => s.Team === teamId && !s.IsArchived);

        tiles.forEach(tile => {
            const sub = teamSubmissions.find(s => s.id === tile.id);
            if (!sub) return; // No submission for this tile, so no points.

            // This logic is from the working overviewController.
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified : (sub.IsComplete || sub.AdminVerified);

            if (isScored) {
                score += parseInt(tile.Points) || 0;
                completedTiles++;
            }
        });
        return { teamId: teamId, score, completedTiles };
    }).sort((a, b) => b.score - a.score);

    return leaderboardData;
}

/**
 * Renders the scoreboard into a given container element.
 * @param {HTMLElement} container - The DOM element to render the scoreboard into.
 * @param {Array<object>} scoreboardData - The pre-calculated and sorted scoreboard data.
 * @param {object} allTeams - An object of all team documents, keyed by teamId.
 * @param {object} config - The main application config object.
 * @param {object} authState - The current user authentication state.
 * @param {string} [currentTeamId] - The currently selected team ID, for filtering on public boards.
 */
export function renderScoreboard(container, scoreboardData, allTeams, config, authState, currentTeamId) {
    if (!config || config.showScoreboard !== true) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = '<h2>Scoreboard</h2>';

    let dataToRender = scoreboardData;
    const isPrivate = config.boardVisibility === 'private';

    // Filter scoreboard data based on board visibility and auth state
    if (isPrivate) {
        // On a private board, only show the user's own team score
        const userTeamId = authState.profile?.team;
        dataToRender = userTeamId ? scoreboardData.filter(item => item.teamId === userTeamId) : [];
    } else {
        // On a public board, if a specific team is selected, show only that team
        if (currentTeamId) {
            dataToRender = scoreboardData.filter(item => item.teamId === currentTeamId);
        } else {
            // If no team is selected on a public board, show nothing.
            dataToRender = [];
        }
    }

    if (dataToRender.length === 0) {
        const noScoreItem = document.createElement('div');
        noScoreItem.textContent = 'No scores to display for the current selection.';
        noScoreItem.style.textAlign = 'center';
        noScoreItem.style.color = '#888';
        container.appendChild(noScoreItem);
        return;
    }

    dataToRender.forEach((team) => {
        const item = document.createElement('div');
        item.className = 'scoreboard-item';
        const teamName = allTeams[team.teamId]?.name || team.teamId;

        if (isPrivate) {
            // For private boards, hide rank and adjust grid
            item.style.gridTemplateColumns = '1fr 60px';
            item.innerHTML = `<div class="scoreboard-team">${teamName}</div><div class="scoreboard-score">${team.score}</div>`;
        } else {
            // For public boards, show rank as normal. Find the original rank from the full, unfiltered data.
            const originalIndex = scoreboardData.findIndex(item => item.teamId === team.teamId);
            const rank = originalIndex !== -1 ? originalIndex + 1 : '-';
            item.innerHTML = `<div class="scoreboard-rank">${rank}.</div><div class="scoreboard-team">${teamName}</div><div class="scoreboard-score">${team.score}</div>`;
        }
        container.appendChild(item);
    });
}