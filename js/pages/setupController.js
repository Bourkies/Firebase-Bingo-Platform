import '../components/Navbar.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as configManager from '../core/data/configManager.js';
import * as tileManager from '../core/data/tileManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as userManager from '../core/data/userManager.js';
import { initAuth } from '../core/auth.js';
import { createTileElement } from '../components/TileRenderer.js';

// Import setup sub-modules
import { initializeTileEditor, updateTileEditorData, populateTileSelector, updateEditorPanelContent, createEditorForm } from './setup/tileEditor.js';
import { initializePrereqEditor, updatePrereqEditorData, renderPrereqLines, populatePrereqUI } from './setup/prereqEditor.js';
import { initializeOverrideEditor, updateOverridesJsonFromCurrentTile as updateOverridesCallback, populateOverridesUI } from './setup/overrideEditor.js';
import { initializeGlobalConfig, updateGlobalConfigData, renderGlobalConfig, renderTeamsList } from './setup/globalConfigEditor.js';

let tilesData = [], allUsers = [], allTeams = {};
let config = {};
let allStyles = {};
export let lastSelectedTileIndex = null; // Export for sub-modules
let currentPreviewStatus = null;
let isTilesLocked = true;
let showTileIds = true; // State for the new toggle
let prereqVisMode = 'hide'; // State for the new prereq button

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
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(authState) {
    console.log("setupController: onAuthStateChanged triggered. isAdmin:", authState.isAdmin);
    if (authState.isAdmin) {
        document.getElementById('setup-view').style.display = 'flex';
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('lock-tiles-btn')?.addEventListener('click', toggleTileLock);        
        document.getElementById('show-tile-ids-btn')?.addEventListener('click', (e) => {
            showTileIds = !showTileIds;
            e.target.textContent = showTileIds ? 'Hide IDs' : 'Show IDs';
            e.target.style.backgroundColor = showTileIds ? '' : '#555';
            renderTiles();
        });
        document.getElementById('prereq-vis-btn')?.addEventListener('click', (e) => {
            prereqVisMode = prereqVisMode === 'hide' ? 'selected' : 'hide';
            e.target.textContent = prereqVisMode === 'hide' ? 'Hidden' : 'Visible';
            e.target.style.backgroundColor = prereqVisMode === 'hide' ? '#555' : '';
            renderPrereqLines();
        });
        createStylePreviewButtons();
        applyTileLockState();
        initializeApp(authState); // Pass the authState object here
    } else {
        document.getElementById('setup-view').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        document.querySelector('#access-denied p').textContent = authState.isLoggedIn ? 'You must be an Admin to view this page.' : 'You must be logged in as an Admin to view this page.';
    }
}

function initializeApp(authState) {
    console.log("setupController: initializeApp starting...");
    showGlobalLoader();
    unsubscribeFromAll();
    let unsubs = [];

    let initialDataLoaded = { config: false, tiles: false, users: false, teams: false };
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            console.log("setupController: All initial data loaded.");
            hideGlobalLoader();
            showMessage('Live editor initialized and synced!', false);
        }
    };

    // Main controller interface passed to sub-modules
    const mainControllerInterface = {
        get lastSelectedTileIndex() { return lastSelectedTileIndex; },
        get tilesData() { return tilesData; },
        get config() { return config; },
        get allStyles() { return allStyles; },
        updateEditorPanel, renderTiles, debouncedSaveTile
    };
    
    unsubs.push(configManager.listenToConfigAndStyles(newConfig => {
        console.log("setupController: Config/Styles updated.");
        config = newConfig.config || {};
        allStyles = newConfig.styles || {}; // This line is correct
        
        updateGlobalConfigData(config, allStyles, allUsers, allTeams);

        if (!initialDataLoaded.config) {
            unsubs.push(tileManager.listenToTiles(newTiles => {
                console.log("setupController: Tiles updated.");
                const oldTileDocIds = new Set(tilesData.map(t => t.docId));
                const wasTileAdded = newTiles.length > tilesData.length;

                tilesData = newTiles;
                updateTileEditorData(tilesData, lastSelectedTileIndex); // Update data in tileEditor
                updatePrereqEditorData(tilesData, lastSelectedTileIndex); // Update data in prereqEditor

                populateTileSelector();
                renderTiles();

                if (wasTileAdded) {
                    // Find the newly added tile and select it
                    const newTile = tilesData.find(t => !oldTileDocIds.has(t.docId));
                    if (newTile) {
                        const newIndex = tilesData.findIndex(t => t.docId === newTile.docId);
                        updateEditorPanel(newIndex);
                    }
                } else {
                    // Check if the currently selected tile was removed
                    if (lastSelectedTileIndex !== null && !tilesData[lastSelectedTileIndex]) {
                        updateEditorPanel(null);
                    } else if (lastSelectedTileIndex !== null) {
                        // If it still exists, refresh the editor panel with potentially new data
                        updateEditorPanel(lastSelectedTileIndex);
                    }
                }

                if (!initialDataLoaded.tiles) { initialDataLoaded.tiles = true; checkAllLoaded(); }
            }, authState, config, true)); // Pass true for includeDocId

            // Initial render after first data load
            renderGlobalConfig(mainControllerInterface);
            updateEditorPanel(null);
            initialDataLoaded.config = true;
            checkAllLoaded();
        } else {
            // On subsequent updates, just re-render things that depend on config/styles
            renderGlobalConfig(mainControllerInterface);
            updatePrereqEditorData(tilesData, lastSelectedTileIndex);
            loadBoardImage(config.boardImageUrl || '');
            renderTiles();
        }
    })); // The error callback is no longer needed here

    // FIX: The authState object was being passed as the callback. Swapped argument order.
    unsubs.push(userManager.listenToUsers(newUsers => {
        console.log("setupController: Users updated.");
        allUsers = newUsers;
        updateGlobalConfigData(config, allStyles, allUsers, allTeams);
        if (initialDataLoaded.teams) renderTeamsList(allUsers);
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, authState));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        console.log("setupController: Teams updated.");
        allTeams = newTeams;
        updateGlobalConfigData(config, allStyles, allUsers, allTeams);
        renderTeamsList(allUsers);
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());

    // Initialize sub-modules that attach event listeners
    initializeTileEditor(mainControllerInterface);
    initializePrereqEditor(mainControllerInterface);
    initializeOverrideEditor(mainControllerInterface);
    initializeGlobalConfig(mainControllerInterface); // Pass the interface here
}

function renderTiles() {
    console.log("setupController: renderTiles called.");
    boardContent.querySelectorAll('.draggable-tile').forEach(el => el.remove());
    if (!tilesData) return;
    const duplicateIds = getDuplicateIds(tilesData);

    tilesData.forEach((tile, index) => {
        const status = currentPreviewStatus || 'Unlocked';
        const tileEl = createTileElement(tile, status, config, allStyles, {
            baseClass: 'draggable-tile',
            isHighlighted: lastSelectedTileIndex === index,
            hasConflict: duplicateIds.has(tile.id)
        });

        tileEl.dataset.index = index;

        // Render like the index page: show tile NAME based on config.
        if (config.showTileNames === true && !tileEl.querySelector('.stamp-image')) {
            const tileNameSpan = document.createElement('span');
            tileNameSpan.textContent = tile.Name || tile.id; // Fallback to ID if name is missing
            tileEl.appendChild(tileNameSpan);
        }

        // NEW: Add a separate, styled element for the tile ID if the toggle is on.
        if (showTileIds) {
            const idOverlay = document.createElement('div');
            idOverlay.className = 'tile-id-overlay';
            idOverlay.textContent = tile.id;
            idOverlay.style.cssText = 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 12px; font-weight: bold; color: white; background: rgba(0,0,0,0.7); padding: 2px 5px; border-radius: 4px; z-index: 10; pointer-events: none;';
            tileEl.appendChild(idOverlay);
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
        lockBtn.textContent = 'Locked';
    } else {
        interact('.draggable-tile').draggable(true).resizable(true);
        lockBtn.textContent = 'Unlocked';
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
        get lastSelectedTileIndex() { return lastSelectedTileIndex; },
        get tilesData() { return tilesData; },
        get config() { return config; },
        get allStyles() { return allStyles; },
        updateEditorPanel, renderTiles, debouncedSaveTile
    };

    // Update data in sub-modules before re-rendering their content
    updateTileEditorData(tilesData, lastSelectedTileIndex);
    updatePrereqEditorData(tilesData, lastSelectedTileIndex);

    // Call the main content update function in tileEditor
    updateEditorPanelContent(index, mainControllerInterface);

    renderPrereqLines();
}

function getDuplicateIds(tiles) {
    if (!tiles) return new Set();
    const ids = tiles.map(t => t.id).filter(id => id);
    const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index);
    return new Set(duplicates);
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
    STATUSES.forEach(status => {
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

// FIX: Pass mainControllerInterface to the debounced function so it's available in the callback.
const debouncedSaveTile = debounce(async (docId, data, mainControllerInterface) => {
    if (!docId) return;
    console.log(`setupController: Debounced save for tile ${docId}`, data);
    try {
        await tileManager.updateTile(docId, data);
        if (data['Overrides (JSON)'] !== undefined && mainControllerInterface) updateOverridesCallback(mainControllerInterface);
    } catch (err) {
        showMessage(`Error saving tile: ${err.message}`, true);
    }
}, 1000);