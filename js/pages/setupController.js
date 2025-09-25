import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as configManager from '../core/data/configManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as userManager from '../core/data/userManager.js';
import { createTileElement } from '../components/TileRenderer.js';

// Import setup sub-modules
import { initializeTileEditor, updateTileEditorData, populateTileSelector, updateEditorPanelContent } from './setup/tileEditor.js';
import { initializePrereqEditor, updatePrereqEditorData, renderPrereqLines } from './setup/prereqEditor.js';
import { initializeOverrideEditor } from './setup/overrideEditor.js';
import { initializeGlobalConfig, updateGlobalConfigData, renderGlobalConfig, renderTeamsList } from './setup/globalConfigEditor.js';

let tilesData = [], allUsers = [], allTeams = {};
let config = {};
let allStyles = {};
let lastSelectedTileIndex = null;
let currentPreviewStatus = null;
let isTilesLocked = true;

let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners
const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];

let currentScale = 1;
let pan = { x: 0, y: 0 };

const boardContainer = document.getElementById('board-container');
const boardContent = document.getElementById('board-content');
const boardImage = document.getElementById('board-image');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
const resetZoomBtn = document.getElementById('reset-zoom');

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('lock-tiles-btn').addEventListener('click', toggleTileLock);
    createStylePreviewButtons();

    applyTileLockState();
    initializeApp();
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(authState) {
    if (authState.isAdmin) {
        document.getElementById('setup-view').style.display = 'flex';
        document.getElementById('access-denied').style.display = 'none';
        initializeApp();
    } else {
        document.getElementById('setup-view').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        document.querySelector('#access-denied p').textContent = authState.isLoggedIn ? 'You must be an Admin to view this page.' : 'You must be logged in as an Admin to view this page.';
    }
}

function initializeApp() {
    console.log("Setting up real-time data listeners...");
    showGlobalLoader();
    unsubscribeFromAll();
    const unsubs = [];

    let initialDataLoaded = { config: false, tiles: false, users: false, teams: false };
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
            showMessage('Live editor initialized and synced!', false);
        }
    };

    unsubs.push(configManager.listenToConfigAndStyles(newConfig => {
        console.log("Setup: Config/Styles updated in real-time.");
        config = newConfig.main || {};
        allStyles = newConfig.styles || {};
        renderGlobalConfig();
        updateGlobalConfigData(config, allStyles, allUsers, allTeams);
        updateTileEditorData(tilesData, lastSelectedTileIndex);
        updatePrereqEditorData(tilesData, lastSelectedTileIndex);

        loadBoardImage(config.boardImageUrl || '');
        renderTiles();
        if (!initialDataLoaded.config) { initialDataLoaded.config = true; checkAllLoaded(); }
    }, (error) => {
        showMessage('Error loading config: ' + error.message, true);
        hideGlobalLoader();
    }));

    unsubs.push(tileManager.listenToTiles(newTiles => {
        console.log("Setup: Tiles updated in real-time.");
        const needsRender = tilesData.length !== newTiles.length;
        tilesData = newTiles;
        updateTileEditorData(tilesData, lastSelectedTileIndex);
        updatePrereqEditorData(tilesData, lastSelectedTileIndex);


        populateTileSelector();

        if (needsRender) {
            renderTiles();
        }
        
        // Check if the currently selected tile was removed
        if (lastSelectedTileIndex !== null && !tilesData[lastSelectedTileIndex]) {
            updateEditorPanel(null);
        } else if (lastSelectedTileIndex !== null) {
            // If it still exists, refresh the editor panel with potentially new data
            updateEditorPanel(lastSelectedTileIndex);
        }

        if (!initialDataLoaded.tiles) { initialDataLoaded.tiles = true; checkAllLoaded(); }
    }, {}, null, true)); // Pass true for includeDocId

    unsubs.push(userManager.listenToUsers(newUsers => {
        console.log("Setup: Users updated in real-time.");
        allUsers = newUsers;
        updateGlobalConfigData(config, allStyles, allUsers, allTeams);
        if (initialDataLoaded.teams) renderTeamsList();
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, {}));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        console.log("Setup: Teams updated in real-time.");
        allTeams = newTeams;
        updateGlobalConfigData(config, allStyles, allUsers, allTeams);
        renderTeamsList();
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());

    const mainControllerInterface = {
        lastSelectedTileIndex, tilesData,
        updateEditorPanel, renderTiles, debouncedSaveTile, updateOverridesJsonFromCurrentTile
    };
    initializeTileEditor(mainControllerInterface);
    initializePrereqEditor(mainControllerInterface);
    initializeOverrideEditor(mainControllerInterface);
    initializeGlobalConfig(mainControllerInterface);

    createEditorForm();
    updateEditorPanel(null);
}

function renderTiles() {
    boardContent.querySelectorAll('.draggable-tile').forEach(el => el.remove());
    if (!tilesData) return;
    const duplicateIds = getDuplicateIds(tilesData);

    const mainControllerInterface = {
        lastSelectedTileIndex, tilesData,
        updateEditorPanel, renderTiles, debouncedSaveTile, updateOverridesJsonFromCurrentTile
    };
    updatePrereqEditorData(tilesData, lastSelectedTileIndex);

    tilesData.forEach((tile, index) => {
        const status = currentPreviewStatus || 'Unlocked';
        const tileEl = createTileElement(tile, status, config, allStyles, {
            baseClass: 'draggable-tile',
            isHighlighted: lastSelectedTileIndex === index,
            hasConflict: duplicateIds.has(tile.id)
        });

        tileEl.dataset.index = index;
        tileEl.textContent = tile.id;

        if (tileEl.querySelector('div[style*="background-image"]')) {
            tileEl.textContent = '';
        }

        boardContent.appendChild(tileEl);
    });
    renderPrereqLines();
}

function applyTransform() {
    boardContent.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${currentScale})`;
}

function updateZoom() {
    currentScale = parseFloat(zoomSlider.value);
    zoomValue.textContent = `${Math.round(currentScale * 100)}%`;
    applyTransform();
}

zoomSlider.addEventListener('input', updateZoom);

resetZoomBtn.addEventListener('click', () => {
    zoomSlider.value = 1;
    pan = { x: 0, y: 0 };
    updateZoom();
});

interact(boardContainer)
    .draggable({
        listeners: {
            move(event) {
                pan.x += event.dx;
                pan.y += event.dy;
                applyTransform();
            }
        },
        allowFrom: '#board-content'
    });

interact('.draggable-tile')
    .draggable({
        listeners: {
            move(event) {
                const target = event.target;
                const index = target.dataset.index;
                if (!tilesData[index]) return;

                const containerWidth = boardContainer.clientWidth;
                const containerHeight = boardContainer.clientHeight;

                const dx_scaled = event.dx / currentScale;
                const dy_scaled = event.dy / currentScale;

                const x_pct = (parseFloat(target.style.left) || 0) + (dx_scaled / containerWidth * 100);
                const y_pct = (parseFloat(target.style.top) || 0) + (dy_scaled / containerHeight * 100);

                target.style.left = `${x_pct}%`;
                target.style.top = `${y_pct}%`;

                const dataToSave = {
                    'Left (%)': parseFloat(x_pct.toFixed(2)),
                    'Top (%)': parseFloat(y_pct.toFixed(2))
                };
                tilesData[index]['Left (%)'] = dataToSave['Left (%)'];
                tilesData[index]['Top (%)'] = dataToSave['Top (%)'];
                debouncedSaveTile(tilesData[index].docId, dataToSave);
                updateEditorPanel(index);
                renderPrereqLines();
            }
        }
    })
    .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
            move(event) {
                const target = event.target;
                const index = target.dataset.index;
                if (!tilesData[index]) return;

                const containerWidth = boardContainer.clientWidth;
                const containerHeight = boardContainer.clientHeight;

                let x_pct = parseFloat(target.style.left) || 0;
                let y_pct = parseFloat(target.style.top) || 0;
                
                const width_pct = (event.rect.width / currentScale) / containerWidth * 100;
                const height_pct = (event.rect.height / currentScale) / containerHeight * 100;

                x_pct += (event.deltaRect.left / currentScale) / containerWidth * 100;
                y_pct += (event.deltaRect.top / currentScale) / containerHeight * 100;

                target.style.width = `${width_pct}%`;
                target.style.height = `${height_pct}%`;
                target.style.left = `${x_pct}%`;
                target.style.top = `${y_pct}%`;
                
                const dataToSave = {
                    'Left (%)': parseFloat(x_pct.toFixed(2)),
                    'Top (%)': parseFloat(y_pct.toFixed(2)),
                    'Width (%)': parseFloat(width_pct.toFixed(2)),
                    'Height (%)': parseFloat(height_pct.toFixed(2))
                };
                tilesData[index]['Left (%)'] = dataToSave['Left (%)'];
                tilesData[index]['Top (%)'] = dataToSave['Top (%)'];
                tilesData[index]['Width (%)'] = dataToSave['Width (%)'];
                tilesData[index]['Height (%)'] = dataToSave['Height (%)'];
                debouncedSaveTile(tilesData[index].docId, dataToSave);
                updateEditorPanel(index);
                renderPrereqLines();
            }
        }
    });

function applyTileLockState() {
    const lockBtn = document.getElementById('lock-tiles-btn');
    if (isTilesLocked) {
        interact('.draggable-tile').draggable(false).resizable(false);
        lockBtn.textContent = 'Unlock Tiles';
    } else {
        interact('.draggable-tile').draggable(true).resizable(true);
        lockBtn.textContent = 'Lock Tiles';
    }
}

function toggleTileLock() {
    isTilesLocked = !isTilesLocked;
    applyTileLockState();
}

function updateEditorPanel(index) {
    if (index === null || !tilesData[index]) {
        index = null;
    }
    lastSelectedTileIndex = index;

    const mainControllerInterface = {
        lastSelectedTileIndex, tilesData,
        updateEditorPanel, renderTiles, debouncedSaveTile, updateOverridesJsonFromCurrentTile
    };
    updateTileEditorData(tilesData, lastSelectedTileIndex);
    updatePrereqEditorData(tilesData, lastSelectedTileIndex);
    updateEditorPanelContent(index, mainControllerInterface);

    renderPrereqLines();
}

function getDuplicateIds(tiles) {
    if (!tiles) return new Set();
    const ids = tiles.map(t => t.id).filter(id => id);
    const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index);
    return new Set(duplicates);
}

function createEditorForm() {
    // This function is now a placeholder, the logic is in tileEditor.js
    // It's called once on init to ensure the form is not empty.
    updateEditorPanelContent(null, {
        lastSelectedTileIndex: null,
        tilesData: [],
        updateEditorPanel,
        renderTiles,
        debouncedSaveTile,
        updateOverridesJsonFromCurrentTile
    });
}

boardContent.addEventListener('click', (event) => {
    if (event.target.classList.contains('interact-resizing') || event.target.classList.contains('interact-dragging')) {
        return;
    }
    const tileEl = event.target.closest('.draggable-tile');
    if (tileEl) {
        const index = parseInt(tileEl.dataset.index, 10);
        updateEditorPanel(index);
    }
});

function createStylePreviewButtons() {
    const container = document.getElementById('style-preview-controls');
    const statuses = [...STATUSES, null];
    statuses.forEach(status => {
        const btn = document.createElement('button');
        btn.textContent = status || 'Clear Preview';
        btn.onclick = () => {
            currentPreviewStatus = status;
            container.querySelectorAll('button').forEach(b => b.style.backgroundColor = '');
            if (status) btn.style.backgroundColor = '#0088cc';
            renderTiles();
        };
        container.appendChild(btn);
    });
}

function loadBoardImage(imageUrl) {
    const existingError = boardContent.querySelector('.error-message');
    if (existingError) existingError.remove();

    if (!imageUrl) {
        boardImage.src = '';
        boardContent.style.backgroundImage = 'none';
        boardImage.style.visibility = 'hidden';
        boardContent.style.aspectRatio = '1 / 1';
        return;
    }

    boardImage.onload = () => {
        boardContent.style.aspectRatio = `${boardImage.naturalWidth} / ${boardImage.naturalHeight}`;
        boardContent.style.backgroundImage = `url('${imageUrl}')`;
        boardImage.style.visibility = 'hidden'; // Keep it hidden, it's just for aspect ratio
    };
    boardImage.onerror = () => {
        boardContent.style.backgroundImage = 'none';
        boardContent.style.aspectRatio = '1 / 1';
        boardContent.appendChild(Object.assign(document.createElement('div'), { className: 'error-message', innerHTML: `<strong>Board Image Failed to Load</strong><br><small>Check the URL in the config or try re-uploading.</small>` }));
    };
    boardImage.src = imageUrl;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) { 
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedSaveTile = debounce(async (docId, data) => {
    if (!docId) return;
    try {
        await tileManager.updateTile(docId, data);
    } catch (err) {
        showMessage(`Error saving tile: ${err.message}`, true);
    }
}, 1000);