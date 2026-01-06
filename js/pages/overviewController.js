import '../components/Navbar.js';
import { showGlobalLoader, hideGlobalLoader, generateTeamColors } from '../core/utils.js';
import { atom } from 'nanostores';

// NEW: Import stores instead of old managers
import { authStore } from '../stores/authStore.js';
import { configStore } from '../stores/configStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { tilesStore } from '../stores/tilesStore.js';
import { startOverviewListener } from '../stores/submissionsStore.js';
import { calculateScoreboardData, renderScoreboard } from '../components/Scoreboard.js';

// State variables that are truly local to this page
let fullFeedData = [];
let teamColorMap = {};
let myScoreChart = null;
let fullChartData = [];
let currentLeaderboardData = [];

// NEW: Local store for all overview data (Chart + Feed)
const overviewStore = atom([]);
let overviewUnsubscribe = null;
let lastOverviewParams = null;

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
    overviewStore.subscribe(onDataChanged);

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    // Get the latest state from all stores
    const authState = authStore.get();
    const { config } = configStore.get();
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    
    // Use the unified store for both feed and chart
    const overviewSubmissions = overviewStore.get();

    // NEW: Wait until both config and auth state are definitively loaded.
    // The authState check is crucial to prevent showing the page before permissions are known.
    // UPDATED: If auth is checked but config is missing (and not admin), we proceed to the disabled check below.
    // Otherwise, we wait.
    const isConfigBlocked = authState.authChecked && !config.pageTitle && !authState.isAdmin;
    if ((!config.pageTitle && !isConfigBlocked) || !authState.authChecked) {
        showGlobalLoader();
        return; // Wait for more data
    }

    // --- Manage Data Subscription ---
    // Determine what data we need based on visibility settings
    const isPublic = config.boardVisibility !== 'private';
    const teamId = authState.profile?.team;
    
    // Only restart the listener if the parameters have changed
    const paramsKey = `${isPublic}-${teamId}`;
    if (paramsKey !== lastOverviewParams) {
        if (overviewUnsubscribe) overviewUnsubscribe();
        overviewUnsubscribe = startOverviewListener(overviewStore, { isPublic, teamId });
        lastOverviewParams = paramsKey;
    }

    // Handle page visibility based on config and auth state
    const disabledPageContainer = document.getElementById('page-disabled');
    const mainContentContainer = document.getElementById('main-content');

    // --- Centralized Visibility Checks ---
    const isCensored = config.censorTilesBeforeEvent === true;
    const isOverviewDisabled = config.enableOverviewPage !== true;
    const canBypass = authState.isEventMod; // isEventMod is only true for logged-in mods/admins

    if ((isOverviewDisabled || isCensored || isConfigBlocked) && !canBypass) {
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
    }

    // Always update the filter dropdown to ensure it reflects Auth/Config state (e.g. Private mode)
    populateFeedFilter(allTeams, config, authState);

    const tilesByVisibleId = tiles.reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});
    const scoreOnVerifiedOnly = config.scoreOnVerifiedOnly === true;
    const allTeamIds = Object.keys(allTeams);
    currentLeaderboardData = calculateScoreboardData(overviewSubmissions, tiles, allTeams, config);

    // Filter submissions for private boards before processing feed and chart data
    const isPrivate = config.boardVisibility === 'private';
    let relevantSubmissions = overviewSubmissions; 
    if (isPrivate && authState.isLoggedIn && authState.profile?.team) {
        relevantSubmissions = overviewSubmissions.filter(sub => sub.Team === authState.profile.team);
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
        return { timestamp: event.timestamp, activeTeamId: event.teamId, ...teamScores };
    });

    // Use the single, centralized scoreboard renderer
    renderScoreboard(document.querySelector('#leaderboard-table tbody'), currentLeaderboardData, allTeams, config, authState, teamColorMap, 'Overview Page');
    renderFeed(allTeams);
    renderMVP(relevantSubmissions, tilesByVisibleId, allTeams, document.getElementById('feed-team-filter').value, currentLeaderboardData);
    renderChart(fullChartData, document.getElementById('feed-team-filter').value === 'all' ? Object.keys(allTeams) : [document.getElementById('feed-team-filter').value], allTeams);

    hideGlobalLoader();
}

function populateFeedFilter(teams = {}, config = {}, authState = {}) {
    const select = document.getElementById('feed-team-filter');
    const previousValue = select.value; // Preserve selection
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
                option.textContent = `${teamData.name} (Your Team)`;
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
            const isUserTeam = authState.isLoggedIn && authState.profile?.team === id;
            option.textContent = isUserTeam ? `${teamData.name} (Your Team)` : teamData.name;
            select.appendChild(option);
        });

        // Restore selection if it's still valid
        if (previousValue && (previousValue === 'all' || teams[previousValue])) {
            select.value = previousValue;
        }
    }
}

function renderFeed(allTeams) {
    const container = document.getElementById('feed-container');
    container.innerHTML = '';
    const selectedTeam = document.getElementById('feed-team-filter').value;
    const filteredData = selectedTeam === 'all' ? fullFeedData : fullFeedData.filter(item => item.teamId === selectedTeam);
    const scoredActivity = filteredData.filter(item => item.isScored);

    // NEW: Get auth state to determine visibility of player names
    const authState = authStore.get();
    const isLoggedIn = authState.isLoggedIn;

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
        
        let finalPlayerString = '';
        if (isLoggedIn) {
            const playerNames = (item.playerIds || []).map(id => {
                const strId = String(id);
                return strId.includes('@') ? `[${strId.split('@')[0]}]` : `[${strId.substring(0, 5)}]`;
            }).join(', ');
            finalPlayerString = [playerNames, item.additionalPlayerNames].filter(Boolean).join(', ');
        }
        
        const tileNameDisplay = item.tileName || '';

        div.innerHTML = `
            <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 0.2rem;">
                <span style="color: ${teamColor};">${teamName}</span>
                <span style="color: var(--primary-text); margin-left: 0.5rem;">${item.tileId}</span>
            </div>
            ${tileNameDisplay ? `<div style="margin-bottom: 0.2rem; font-weight: 500;">${tileNameDisplay}</div>` : ''}
            ${finalPlayerString ? `<div style="color: var(--secondary-text); font-size: 0.9em; margin-bottom: 0.2rem;">${finalPlayerString}</div>` : ''}
            <div class="feed-meta">${item.timestamp.toLocaleString()}</div>
        `;
        container.appendChild(div);
    });
}

function renderMVP(submissions, tilesById, allTeams, filterTeamId, leaderboardData) {
    const container = document.getElementById('mvp-container');
    container.innerHTML = '';

    // 1. Calculate Stats per Player per Team
    // Structure: { teamId: { playerName: { points: 0, tiles: 0 } } }
    const teamStats = {};

    submissions.forEach(sub => {
        // Only count scored submissions (Verified or Complete depending on logic, usually Verified for MVP to be safe, but we'll match the feed logic)
        // For MVP, we usually want to be strict, but let's use IsComplete for now to match the "live" feel, or AdminVerified if config says so.
        // We'll assume IsComplete for general MVP to show progress.
        if (!sub.IsComplete || sub.IsArchived) return;

        const tile = tilesById[sub.id];
        const points = tile ? (parseInt(tile.Points) || 0) : 0;
        
        // Parse names
        const rawNames = sub.AdditionalPlayerNames || '';
        const names = rawNames.split(',').map(n => n.trim()).filter(n => n);
        
        if (names.length === 0) return;

        const pointsPerPerson = points / names.length;

        if (!teamStats[sub.Team]) teamStats[sub.Team] = {};

        names.forEach(name => {
            if (!teamStats[sub.Team][name]) teamStats[sub.Team][name] = { points: 0, tiles: 0 };
            teamStats[sub.Team][name].points += pointsPerPerson;
            teamStats[sub.Team][name].tiles += 1;
        });
    });

    // 2. Determine Teams to Display
    let teamsToRender = filterTeamId === 'all' ? Object.keys(allTeams) : [filterTeamId];

    // Sort teams by Leaderboard Rank (Team Score)
    if (filterTeamId === 'all' && leaderboardData) {
        const teamRankMap = {};
        leaderboardData.forEach((item, index) => {
            teamRankMap[item.teamId] = index;
        });
        teamsToRender.sort((a, b) => {
            const rankA = teamRankMap.hasOwnProperty(a) ? teamRankMap[a] : 9999;
            const rankB = teamRankMap.hasOwnProperty(b) ? teamRankMap[b] : 9999;
            return rankA - rankB;
        });
    }

    // 3. Render Cards
    let hasData = false;

    teamsToRender.forEach(teamId => {
        const players = teamStats[teamId];
        if (!players) return; // No data for this team

        hasData = true;
        const teamName = allTeams[teamId]?.name || teamId;
        const teamColor = teamColorMap[teamId] || 'var(--accent-color)';

        // Find MVPs
        let pointsMVP = { name: 'N/A', val: 0 };
        let tilesMVP = { name: 'N/A', val: 0 };

        Object.entries(players).forEach(([name, stats]) => {
            if (stats.points > pointsMVP.val) pointsMVP = { name, val: stats.points };
            if (stats.tiles > tilesMVP.val) tilesMVP = { name, val: stats.tiles };
        });

        const div = document.createElement('div');
        div.className = 'mvp-card';
        div.style.borderLeftColor = teamColor;
        
        div.innerHTML = `
            <div class="mvp-header" style="color: ${teamColor}">${teamName}</div>
            <div class="mvp-row">
                <span class="mvp-label">Most Points</span>
                <span class="mvp-value">${pointsMVP.name} (${pointsMVP.val.toFixed(1)})</span>
            </div>
            <div class="mvp-row">
                <span class="mvp-label">Most Tiles</span>
                <span class="mvp-value">${tilesMVP.name} (${tilesMVP.val})</span>
            </div>
        `;
        container.appendChild(div);
    });

    if (!hasData) {
        container.innerHTML = '<p style="text-align:center; color: var(--secondary-text);">No MVP data available.</p>';
    }
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
            pointRadius: (ctx) => {
                const index = ctx.dataIndex;
                return chartData[index]?.activeTeamId === teamId ? 4 : 0;
            },
            pointHoverRadius: 6
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
                    type: 'time', time: { minUnit: 'day' },
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
    const allTeams = teamsStore.get();

    renderFeed(allTeams);
    // We need to pass the raw data to renderMVP, so we fetch it again from the store/scope
    const overviewSubmissions = overviewStore.get();
    const tiles = tilesStore.get();
    const tilesByVisibleId = tiles.reduce((acc, tile) => { if (tile.id) acc[tile.id] = tile; return acc; }, {});
    
    // Filter submissions for private board logic if needed (same logic as onDataChanged)
    const authState = authStore.get();
    const { config } = configStore.get();
    const isPrivate = config.boardVisibility === 'private';
    let relevantSubmissions = overviewSubmissions; 
    if (isPrivate && authState.isLoggedIn && authState.profile?.team) {
        relevantSubmissions = overviewSubmissions.filter(sub => sub.Team === authState.profile.team);
    }

    renderMVP(relevantSubmissions, tilesByVisibleId, allTeams, document.getElementById('feed-team-filter').value, currentLeaderboardData);

    const selectedTeam = document.getElementById('feed-team-filter').value;
    const filteredTeamIds = selectedTeam === 'all' ? Object.keys(allTeams) : [selectedTeam];
    
    renderChart(fullChartData, filteredTeamIds, allTeams);
}