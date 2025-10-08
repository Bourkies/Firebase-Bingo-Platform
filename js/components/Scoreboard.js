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
    // FIX: Use Array.isArray to prevent crashes if a listener fails and passes undefined.
    if (!Array.isArray(submissions) || !Array.isArray(tiles) || !allTeams || !config) {
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

            // This logic is from the working overviewController. If scoring is on verified only, only AdminVerified counts. Otherwise, IsComplete is sufficient.
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified === true : sub.IsComplete === true;

            if (isScored) {
                score += parseFloat(tile.Points) || 0;
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
 */
export function renderScoreboard(container, scoreboardData, allTeams, config, authState, teamColorMap = {}, sourcePage = 'Unknown') {
    // Visibility is now handled by the parent controller (e.g., indexController).
    if (!container) {
        return;
    }
    container.innerHTML = ''; // Clear the tbody for re-rendering

    let dataToRender;
    const isPrivate = config.boardVisibility === 'private';

    // This is the exact filtering logic from the working overviewController.
    if (isPrivate) {
        if (authState.isLoggedIn && authState.profile?.team) {
            dataToRender = scoreboardData.filter(item => item.teamId === authState.profile.team);
        } else {
            dataToRender = [];
        }
    } else {
        dataToRender = scoreboardData;
    }

    if (dataToRender.length === 0) {
        container.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #888;">No scores to display.</td></tr>';
        return;
    }
    
    // This is the exact rendering logic from the working overviewController.
    dataToRender.forEach((team, index) => {
        const row = container.insertRow();
        const teamName = allTeams[team.teamId]?.name || team.teamId;
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td style="color: ${teamColorMap[team.teamId] || '#fff'}">${teamName}</td>
            <td>${team.completedTiles}</td>
            <td>${team.score}</td>
        `;
    });
}