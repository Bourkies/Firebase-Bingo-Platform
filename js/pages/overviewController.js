import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showGlobalLoader, hideGlobalLoader, generateTeamColors } from '../core/utils.js';

// Import the new data managers
import * as configManager from '../core/data/configManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as submissionManager from '../core/data/submissionManager.js';
import * as userManager from '../core/data/userManager.js';
import { calculateScoreboardData, renderScoreboard } from '../components/Scoreboard.js';

let config = {}, allTeams = {}, allUsers = {}, tiles = [], submissions = [];
let authState = {};

let fullFeedData = [];
let teamColorMap = {};
let myScoreChart = null;
let fullChartData = [];
let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners

let initialDataLoaded = { config: false, teams: false, tiles: false, submissions: false, users: false };
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('feed-team-filter').addEventListener('change', handleFilterChange);
    initializeApp();
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(newAuthState) {
    authState = newAuthState;
    // Re-initialize listeners to apply correct permissions (e.g., for censored tiles)
    initializeApp();
}

/**
 * A centralized handler for all data updates. It updates the relevant
 * state variable and triggers a re-processing of all data if the initial
 * load is complete.
 * @param {string} dataType - The type of data being updated (e.g., 'teams', 'users').
 * @param {*} newData - The new data from the listener.
 */
function handleDataUpdateAndRender(dataType, newData) {
    // Update the corresponding global variable
    if (dataType === 'teams') allTeams = newData;
    else if (dataType === 'users') allUsers = newData;
    else if (dataType === 'tiles') tiles = newData;
    else if (dataType === 'submissions') submissions = newData;

    if (initialDataLoaded.config && initialDataLoaded.teams && initialDataLoaded.users && initialDataLoaded.tiles && initialDataLoaded.submissions) {
        processAllData();
    }
}

function initializeApp() {
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
            document.getElementById('main-content').style.display = 'grid';
            processAllData(); // Initial process call
        }
    };
    
    showGlobalLoader();
    unsubscribeFromAll(); // Unsubscribe from any previous listeners
    const unsubs = [];

    unsubs.push(configManager.listenToConfigAndStyles(newConfig => {
        console.log("Overview: Config/Styles updated in real-time. Received:", newConfig);
        // FIX: The new configManager returns an object with `config` and `styles` properties.
        // The old code expected a `main` property directly on the returned object.
        if (!newConfig || !newConfig.config) {
            document.body.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error-color);">Configuration not found.</div>`;
            hideGlobalLoader();
            return;
        }
        config = newConfig.config;

        if (config.enableOverviewPage !== true && !authState.isEventMod) {
            document.getElementById('page-disabled').style.display = 'block';
            document.getElementById('main-content').style.display = 'none';
            hideGlobalLoader();
            return;
        }

        document.title = (config.pageTitle || 'Bingo') + ' | Scoreboard';

        // Setup other listeners that depend on config
        setupTilesListener();
        setupSubmissionsListener();

        if (!initialDataLoaded.config) { initialDataLoaded.config = true; checkAllLoaded(); }
    }));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        console.log("Overview: Teams updated.");
        teamColorMap = generateTeamColors(Object.keys(newTeams));
        populateFeedFilter(newTeams);
        handleDataUpdateAndRender('teams', newTeams);
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    // Always pass authState to respect security rules for all user roles.
    unsubs.push(userManager.listenToUsers(newUsers => {
        console.log("Overview: Users updated.");
        handleDataUpdateAndRender('users', newUsers);
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); } 
    }, authState));

    const setupTilesListener = () => {
        unsubs.push(tileManager.listenToTiles(newTiles => {
            console.log("Overview: Tiles updated.");
            handleDataUpdateAndRender('tiles', newTiles);
            if (!initialDataLoaded.tiles) { initialDataLoaded.tiles = true; checkAllLoaded(); }
        }, authState, config, false)); // Correct call: (callback, authState, config, includeDocId)
    };

    const setupSubmissionsListener = () => {
        unsubs.push(submissionManager.listenToSubmissions(newSubmissions => {
            console.log("Overview: Submissions updated.");
            handleDataUpdateAndRender('submissions', newSubmissions);
            if (!initialDataLoaded.submissions) { initialDataLoaded.submissions = true; checkAllLoaded(); }
        }, authState, config)); // FIX: The listenToSubmissions manager expects (callback, authState, config)
    };

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());
}

function processAllData() {
    // Guard against processing until all necessary data is loaded.
    if (!initialDataLoaded.config || !initialDataLoaded.teams || !initialDataLoaded.users || !initialDataLoaded.tiles) return;
    const tilesByVisibleId = tiles.reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});
    const scoreOnVerifiedOnly = config.scoreOnVerifiedOnly === true;
    const allTeamIds = Object.keys(allTeams);
    const leaderboardData = calculateScoreboardData(submissions, tiles, allTeams, config);

    // Filter submissions for private boards before processing feed and chart data
    const isPrivate = config.boardVisibility === 'private';
    let relevantSubmissions = submissions;
    if (isPrivate && authState.isLoggedIn && authState.profile?.team) {
        relevantSubmissions = submissions.filter(sub => sub.Team === authState.profile.team);
    }

    fullFeedData = relevantSubmissions
        .filter(sub => sub.CompletionTimestamp && !sub.IsArchived)
        .map(sub => {
            const tile = tilesByVisibleId[sub.id];
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified === true : sub.IsComplete === true;
            return {
                playerIds: sub.PlayerIDs || [],
                additionalPlayerNames: sub.AdditionalPlayerNames || '',
                teamId: sub.Team,
                tileId: sub.id,
                tileName: tile ? tile.Name : 'Unknown Tile',
                timestamp: sub.CompletionTimestamp,
                isScored: isScored
            };
        })
        .sort((a, b) => b.timestamp - a.timestamp);

    const scoredEvents = relevantSubmissions
        .filter(sub => sub.CompletionTimestamp && !sub.IsArchived)
        .map(sub => {
            const tile = tilesByVisibleId[sub.id];
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified === true : sub.IsComplete === true;
            return {
                teamId: sub.Team,
                points: isScored ? (parseInt(tile?.Points) || 0) : 0,
                timestamp: sub.CompletionTimestamp
            };
        })
        .filter(event => event.points > 0)
        .sort((a, b) => a.timestamp - b.timestamp);

    const teamScores = {};
    allTeamIds.forEach(id => teamScores[id] = 0);

    fullChartData = scoredEvents.map(event => {
        teamScores[event.teamId] += event.points;
        return { timestamp: event.timestamp, ...teamScores };
    });

    // Use the single, centralized scoreboard renderer
    renderScoreboard(document.querySelector('#leaderboard-table tbody'), leaderboardData, allTeams, config, authState, teamColorMap, 'Overview Page');
    handleFilterChange();
}

function populateFeedFilter(teams = {}) {
    const select = document.getElementById('feed-team-filter');
    select.innerHTML = '';
    select.disabled = false;

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
                select.appendChild(option);
                select.value = teamId;
            }
            select.disabled = true;
        } else {
            // Private board, user not on a team: Show disabled placeholder.
            select.innerHTML = '<option value="" selected disabled>No Team Data</option>';
            select.disabled = true;
        }
    } else {
        // Public board: Original behavior
        select.innerHTML = '<option value="all">All Teams</option>';
        Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, teamData]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = teamData.name;
            select.appendChild(option);
        });
    }
}

function renderFeed() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '';
    const selectedTeam = document.getElementById('feed-team-filter').value;
    const filteredData = selectedTeam === 'all' ? fullFeedData : fullFeedData.filter(item => item.teamId === selectedTeam);
    const scoredActivity = filteredData.filter(item => item.isScored);

    if (!scoredActivity || scoredActivity.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">No scored activity for the selected filter.</p>';
        return;
    }

    scoredActivity.forEach(item => {
        const div = document.createElement('div');
        div.className = 'feed-item';
        const teamColor = teamColorMap[item.teamId] || 'var(--accent-color)';
        div.style.borderLeftColor = teamColor;
        const teamName = allTeams[item.teamId]?.name || item.teamId; 
        const usersById = new Map(allUsers.map(user => [user.uid, user.displayName]));
        const playerNames = (item.playerIds || []).map(uid => usersById.get(uid) || `[${uid.substring(0, 5)}]`).join(', ');
        const finalPlayerString = [playerNames, item.additionalPlayerNames].filter(Boolean).join(', ');
        const tileNameDisplay = item.tileName || '';

        div.innerHTML = `
            <p class="feed-title">${item.tileId} ${tileNameDisplay}: ${finalPlayerString} (${teamName})</p>
            <p class="feed-meta">${item.timestamp.toLocaleString()}</p>
        `;
        container.appendChild(div);
    });
}

function renderChart(chartData = [], teamIds = []) {
    if (myScoreChart) myScoreChart.destroy();
    const ctx = document.getElementById('score-chart').getContext('2d');
    const datasets = teamIds.map((teamId) => {
        const color = teamColorMap[teamId] || '#ffffff';
        return {
            label: allTeams[teamId]?.name || teamId,
            data: chartData.map(point => ({ x: point.timestamp, y: point[teamId] || null })),
            borderColor: color, backgroundColor: color, fill: false, stepped: true, spanGaps: true,
        };
    });

    myScoreChart = new Chart(ctx, {
        type: 'line', data: { datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { color: 'var(--primary-text)' } },
                tooltip: {
                    mode: 'index', intersect: false,
                    callbacks: {
                        title: (tooltipItems) => tooltipItems.length > 0 ? new Date(tooltipItems[0].parsed.x).toUTCString() : ''
                    }
                }
            },
            scales: {
                x: {
                    type: 'time', time: {},
                    title: { display: true, text: 'Date', color: 'var(--secondary-text)' },
                    ticks: { color: 'var(--secondary-text)' }, grid: { color: 'var(--border-color)' }
                },
                y: {
                    title: { display: true, text: 'Points', color: 'var(--secondary-text)' },
                    ticks: { color: 'var(--secondary-text)', beginAtZero: true }, grid: { color: 'var(--border-color)' }
                }
            }
        }
    });
}

function handleFilterChange() {
    renderFeed();
    const selectedTeam = document.getElementById('feed-team-filter').value;
    const filteredTeamIds = selectedTeam === 'all' ? Object.keys(allTeams) : [selectedTeam];
    renderChart(fullChartData, filteredTeamIds);
}