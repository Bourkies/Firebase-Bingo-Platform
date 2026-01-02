import '../components/Navbar.js';
import { showGlobalLoader, hideGlobalLoader, generateTeamColors } from '../core/utils.js';
import { atom } from 'nanostores';

// NEW: Import stores instead of old managers
import { authStore } from '../stores/authStore.js';
import { configStore } from '../stores/configStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { tilesStore } from '../stores/tilesStore.js';
import { submissionsStore, startFeedListener } from '../stores/submissionsStore.js';
import { usersStore } from '../stores/usersStore.js';
import { calculateScoreboardData, renderScoreboard } from '../components/Scoreboard.js';

// State variables that are truly local to this page
let fullFeedData = [];
let teamColorMap = {};
let myScoreChart = null;
let fullChartData = [];

// NEW: Local store for the feed (Limited to 50 items)
const feedStore = atom([]);

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('feed-team-filter').addEventListener('change', handleFilterChange);
    document.addEventListener('theme-changed', () => {
        handleFilterChange(); // This function already re-renders the chart and feed.
    });

    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    configStore.subscribe(onDataChanged);
    teamsStore.subscribe(onDataChanged);
    tilesStore.subscribe(onDataChanged);
    submissionsStore.subscribe(onDataChanged); // Keep this if you need full scoreboard, but we will use feedStore for feed
    feedStore.subscribe(onDataChanged);
    usersStore.subscribe(onDataChanged);

    // Start the optimized feed listener
    startFeedListener(feedStore);

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    // Get the latest state from all stores
    const authState = authStore.get();
    const { config } = configStore.get();
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    
    // Use the optimized feed store for the feed logic
    const feedSubmissions = feedStore.get();
    // For scoreboard, we still fall back to full submissions (or you can switch to server-side scores later)
    const allSubmissions = submissionsStore.get(); 
    const allUsers = usersStore.get();

    // NEW: Wait until both config and auth state are definitively loaded.
    // The authState check is crucial to prevent showing the page before permissions are known.
    if (!config.pageTitle || !authState.authChecked) {
        showGlobalLoader();
        return; // Wait for more data
    }

    // Handle page visibility based on config and auth state
    const disabledPageContainer = document.getElementById('page-disabled');
    const mainContentContainer = document.getElementById('main-content');

    // --- Centralized Visibility Checks ---
    const isCensored = config.censorTilesBeforeEvent === true;
    const isOverviewDisabled = config.enableOverviewPage !== true;
    const canBypass = authState.isEventMod; // isEventMod is only true for logged-in mods/admins

    if ((isOverviewDisabled || isCensored) && !canBypass) {
        document.getElementById('disabled-title').textContent = isCensored ? 'Event Not Started' : 'Overview Page Not Available';
        document.getElementById('disabled-message').textContent = isCensored 
            ? 'The scoreboard and activity feed are hidden until the event begins.'
            : 'The event administrator has disabled this page.';

        disabledPageContainer.style.display = 'block';
        mainContentContainer.style.display = 'none';
        hideGlobalLoader();
        return;
    }

    // If we've reached here, the page is visible.
    disabledPageContainer.style.display = 'none';
    mainContentContainer.style.display = 'grid';

    // NEW: Add a secondary guard for data needed for rendering.
    if (Object.keys(allTeams).length === 0) {
        showGlobalLoader();
        return;
    }

    showGlobalLoader();

    document.title = (config.pageTitle || 'Bingo') + ' | Scoreboard';

    // Regenerate team colors if teams have changed.
    if (Object.keys(teamColorMap).length !== Object.keys(allTeams).length) {
        teamColorMap = generateTeamColors(Object.keys(allTeams));
        populateFeedFilter(allTeams, config, authState);
    }

    const tilesByVisibleId = tiles.reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});
    const scoreOnVerifiedOnly = config.scoreOnVerifiedOnly === true;
    const allTeamIds = Object.keys(allTeams);
    const leaderboardData = calculateScoreboardData(allSubmissions, tiles, allTeams, config);

    // Filter submissions for private boards before processing feed and chart data
    const isPrivate = config.boardVisibility === 'private';
    let relevantSubmissions = feedSubmissions; // Use the limited feed data
    if (isPrivate && authState.isLoggedIn && authState.profile?.team) {
        relevantSubmissions = feedSubmissions.filter(sub => sub.Team === authState.profile.team);
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

    hideGlobalLoader();
}

function populateFeedFilter(teams = {}, config = {}, authState = {}) {
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

function renderFeed(allUsers, allTeams) {
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

function renderChart(chartData = [], teamIds = [], allTeams) {
    if (myScoreChart) myScoreChart.destroy();
    const ctx = document.getElementById('score-chart').getContext('2d');

    // Get computed style values from the root element
    const computedStyle = getComputedStyle(document.documentElement);
    const primaryTextColor = computedStyle.getPropertyValue('--primary-text').trim();
    const secondaryTextColor = computedStyle.getPropertyValue('--secondary-text').trim();
    const borderColor = computedStyle.getPropertyValue('--border-color').trim();

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
                legend: { position: 'top', labels: { color: primaryTextColor } }, // Team names in the legend
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
                    title: { display: true, text: 'Date', color: secondaryTextColor }, // X-axis title
                    ticks: { color: secondaryTextColor }, grid: { color: borderColor } // X-axis values
                },
                y: {
                    title: { display: true, text: 'Points', color: secondaryTextColor }, // Y-axis title
                    ticks: { color: secondaryTextColor, beginAtZero: true }, grid: { color: borderColor } // Y-axis values
                }
            }
        }
    });
}

function handleFilterChange() {
    const allUsers = usersStore.get();
    const allTeams = teamsStore.get();

    renderFeed(allUsers, allTeams);

    const selectedTeam = document.getElementById('feed-team-filter').value;
    const filteredTeamIds = selectedTeam === 'all' ? Object.keys(allTeams) : [selectedTeam];
    
    renderChart(fullChartData, filteredTeamIds, allTeams);
}