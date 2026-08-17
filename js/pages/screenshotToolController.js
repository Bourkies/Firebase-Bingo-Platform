import '../components/Navbar.js';
import { authStore } from '../stores/authStore.js';
import { configStore } from '../stores/configStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { tilesStore } from '../stores/tilesStore.js';
import { generateTeamColors } from '../core/utils.js';

let myScoreChart = null;
let teamColorMap = {};

document.addEventListener('DOMContentLoaded', () => {
    // Listeners for controls
    document.getElementById('label-limit').addEventListener('change', renderChart);
    document.getElementById('legend-right').addEventListener('change', renderChart);
    document.getElementById('refresh-btn').addEventListener('click', renderChart);

    // Subscribe to stores
    authStore.subscribe(checkData);
    configStore.subscribe(checkData);
    teamsStore.subscribe(checkData);
    tilesStore.subscribe(checkData);
    
    // Initial check
    checkData();
});

function checkData() {
    const allTeams = teamsStore.get();
    if (Object.keys(allTeams).length > 0) {
        renderChart();
    }
}

function renderChart() {
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    const config = configStore.get().config;
    
    if (Object.keys(allTeams).length === 0) return;

    // Generate colors if needed
    if (Object.keys(teamColorMap).length !== Object.keys(allTeams).length) {
        teamColorMap = generateTeamColors(Object.keys(allTeams));
    }

    // Process Data (Copied/Adapted from overviewController.js)
    const overviewSubmissions = [];
    Object.entries(allTeams).forEach(([teamId, team]) => {
        if (!team.bingoState) return;
        Object.values(team.bingoState).forEach(entry => {
            overviewSubmissions.push({
                Team: teamId,
                id: entry.tileId,
                IsComplete: entry.status === 'Submitted' || entry.status === 'Verified',
                AdminVerified: entry.status === 'Verified',
                CompletionTimestamp: entry.timestamp && entry.timestamp.toDate ? entry.timestamp.toDate() : entry.timestamp,
            });
        });
    });

    const tilesByVisibleId = tiles.reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});

    const scoreOnVerifiedOnly = config.scoreOnVerifiedOnly === true;

    const scoredEvents = overviewSubmissions
        .filter(sub => sub.CompletionTimestamp)
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
    Object.keys(allTeams).forEach(id => teamScores[id] = 0);

    const chartData = scoredEvents.map(event => {
        teamScores[event.teamId] += event.points;
        return { timestamp: event.timestamp, activeTeamId: event.teamId, ...teamScores };
    });

    // Chart Rendering
    const ctx = document.getElementById('score-chart').getContext('2d');
    if (myScoreChart) myScoreChart.destroy();

    // Settings
    const labelLimit = parseInt(document.getElementById('label-limit').value) || 15;
    const legendRight = document.getElementById('legend-right').checked;

    const datasets = Object.keys(allTeams).map((teamId) => {
        const color = teamColorMap[teamId] || '#000000';
        let label = allTeams[teamId]?.name || teamId;
        if (label.length > labelLimit) label = label.substring(0, labelLimit) + '...';

        return {
            label: label,
            data: chartData.map(point => ({ x: point.timestamp, y: point[teamId] || null })),
            borderColor: color, backgroundColor: color, fill: false, stepped: true, spanGaps: true,
            pointRadius: 0, // Clean lines for screenshot
            pointHoverRadius: 0
        };
    });

    myScoreChart = new Chart(ctx, {
        type: 'line', data: { datasets: datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: legendRight ? 'right' : 'top', 
                    labels: { color: '#000000', font: { size: 14 } } 
                },
                title: { display: true, text: 'Score Progression', color: '#000000', font: { size: 18 } }
            },
            scales: {
                x: {
                    type: 'time', time: { minUnit: 'day' },
                    title: { display: true, text: 'Date', color: '#666666' },
                    ticks: { color: '#666666' }, grid: { color: '#cccccc' }
                },
                y: {
                    title: { display: true, text: 'Points', color: '#666666' },
                    ticks: { color: '#666666', beginAtZero: true }, grid: { color: '#cccccc' }
                }
            }
        }
    });
}