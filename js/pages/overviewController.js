import '../components/Navbar.js';
import { initAuth, getAuthState } from '../core/auth.js';
import { showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as configManager from '../core/data/configManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as submissionManager from '../core/data/submissionManager.js';
import * as userManager from '../core/data/userManager.js';

let config = {}, allTeams = {}, allUsers = {}, tiles = [], submissions = [];
let authState = {};

let fullFeedData = [];
let teamColorMap = {};
let myScoreChart = null;
let fullChartData = [];
let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners

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

function initializeApp() {
    let initialDataLoaded = { config: false, teams: false, tiles: false, submissions: false, users: false };
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
            document.getElementById('main-content').style.display = 'grid';
        }
    };

    showGlobalLoader();
    unsubscribeFromAll(); // Unsubscribe from any previous listeners
    const unsubs = [];

    unsubs.push(configManager.listenToConfigAndStyles(newConfig => {
        console.log("Overview: Config updated in real-time.");
        if (!newConfig.main) {
            document.body.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--error-color);">Configuration not found.</div>`;
            hideGlobalLoader();
            return;
        }
        config = newConfig.main;

        if (config.enableOverviewPage !== true && !authState.isEventMod) {
            document.getElementById('page-disabled').style.display = 'block';
            document.getElementById('main-content').style.display = 'none';
            hideGlobalLoader();
            return;
        }

        document.title = (config.pageTitle || 'Bingo') + ' | Overview';

        // Setup other listeners that depend on config
        setupTilesListener();
        setupSubmissionsListener();

        if (!initialDataLoaded.config) { initialDataLoaded.config = true; checkAllLoaded(); }
    }));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        console.log("Overview: Teams updated in real-time.");
        allTeams = newTeams;
        teamColorMap = generateTeamColors(Object.keys(allTeams));
        populateFeedFilter(allTeams);
        processAllData();
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    unsubs.push(userManager.listenToUsers(newUsers => {
        console.log("Overview: Users updated in real-time.");
        allUsers = newUsers;
        processAllData();
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, authState));

    const setupTilesListener = () => {
        unsubs.push(tileManager.listenToTiles(newTiles => {
            console.log("Overview: Tiles updated in real-time.");
            tiles = newTiles;
            processAllData();
            if (!initialDataLoaded.tiles) { initialDataLoaded.tiles = true; checkAllLoaded(); }
        }, authState, config));
    };

    const setupSubmissionsListener = () => {
        unsubs.push(submissionManager.listenToSubmissions(newSubmissions => {
            console.log("Overview: Submissions updated in real-time.");
            submissions = newSubmissions;
            processAllData();
            if (!initialDataLoaded.submissions) { initialDataLoaded.submissions = true; checkAllLoaded(); }
        }, authState, config));
    };

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());
}

function processAllData() {
    if (!config.pageTitle || tiles.length === 0 || submissions.length === 0 || Object.keys(allUsers).length === 0) return;

    const scoreOnVerifiedOnly = config.scoreOnVerifiedOnly === true;
    const allTeamIds = Object.keys(allTeams);

    const tilesByVisibleId = tiles.reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});

    const leaderboardData = allTeamIds.map(teamId => {
        let score = 0;
        let completedTiles = 0;
        const teamSubmissions = submissions.filter(s => s.Team === teamId && !s.IsArchived);
        tiles.forEach(tile => {
            const sub = teamSubmissions.find(s => s.id === tile.id);
            if (!sub) return;
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified : (sub.IsComplete || sub.AdminVerified);
            if (isScored) {
                score += parseInt(tile.Points) || 0;
                completedTiles++;
            }
        });
        return { teamId: teamId, score, completedTiles };
    }).sort((a, b) => b.score - a.score);

    fullFeedData = submissions
        .filter(sub => sub.CompletionTimestamp && !sub.IsArchived)
        .map(sub => {
            const tile = tilesByVisibleId[sub.id];
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified : (sub.IsComplete || sub.AdminVerified);
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

    const scoredEvents = submissions
        .filter(sub => sub.CompletionTimestamp && !sub.IsArchived)
        .map(sub => {
            const tile = tilesByVisibleId[sub.id];
            const isScored = scoreOnVerifiedOnly ? sub.AdminVerified : (sub.IsComplete || sub.AdminVerified);
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

    renderLeaderboard(leaderboardData);
    handleFilterChange();
}

function renderLeaderboard(leaderboardData) {
    const tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = '';
    if (!leaderboardData || leaderboardData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No data available.</td></tr>';
        return;
    }
    leaderboardData.forEach((team, index) => {
        const row = tbody.insertRow();
        const teamName = allTeams[team.teamId]?.name || team.teamId;
        row.innerHTML = `
          <td>${index + 1}</td>
          <td style="color: ${teamColorMap[team.teamId] || '#fff'}">${teamName}</td>
          <td>${team.completedTiles}</td>
          <td>${team.score}</td>
        `;
    });
}

function populateFeedFilter(teams = {}) {
    const select = document.getElementById('feed-team-filter');
    select.innerHTML = '<option value="all">All Teams</option>';
    Object.entries(teams).sort((a, b) => a[0].localeCompare(b[0])).forEach(([id, teamData]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = teamData.name;
        select.appendChild(option);
    });
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
        const playerNames = (item.playerIds || []).map(uid => allUsers[uid]?.displayName || `[${uid.substring(0, 5)}]`).join(', ');
        const finalPlayerString = [playerNames, item.additionalPlayerNames].filter(Boolean).join(', ');
        const tileNameDisplay = item.tileName || '';

        div.innerHTML = `
            <p class="feed-title">${item.tileId} ${tileNameDisplay}: ${finalPlayerString} (${teamName})</p>
            <p class="feed-meta">${item.timestamp.toLocaleString()}</p>
        `;
        container.appendChild(div);
    });
}

function generateTeamColors(teamIds = []) {
    const colors = {};
    const goldenAngle = 137.5;
    teamIds.forEach((teamId, i) => {
        const hue = (i * goldenAngle) % 360;
        colors[teamId] = `hsl(${hue}, 70%, 55%)`;
    });
    return colors;
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