import '../components/Navbar.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';
import '../components/BingoTile.js'; // Import the tile component
// NEW: Import stores for reading data
import { authStore } from '../stores/authStore.js';
import { configStore, updateConfig, updateStyle } from '../stores/configStore.js'; 
import { tilesStore, updateTile as saveTile, publishTiles } from '../stores/tilesStore.js';
import '../components/TileEditorForm.js'; // Register the TileEditorForm component

// Import setup sub-modules
import { initializeTileEditor, populateTileSelector } from './setup/tileEditor.js';
import { initializePrereqEditor, renderPrereqLines } from './setup/prereqEditor.js';
import { initializeOverrideEditor } from './setup/overrideEditor.js';
import { initializeGlobalConfig, renderGlobalConfig } from './setup/globalConfigEditor.js';
 
export let lastSelectedTileIndex = null; // Export for sub-modules
let currentPreviewStatus = null;
let isTilesLocked = true;
let showTileIds = true; // State for the new toggle
let prereqVisMode = 'hide'; // State for the new prereq button

const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];

let currentScale = 1;
let pan = { x: 0, y: 0 };

// --- FIX: Re-add the missing UI Feedback Utility ---
function flashField(element) {
    if (!element) return;
    element.style.transition = 'none';
    element.style.backgroundColor = 'rgba(129, 200, 132, 0.5)'; // Green flash
    setTimeout(() => {
        element.style.transition = 'background-color 0.5s ease';
        // Find the original background color from the stylesheet or default.
        // This is a simplified approach; a more robust one might store the original color.
        const originalColor = window.getComputedStyle(element).getPropertyValue('background-color');
        element.style.backgroundColor = originalColor;
        setTimeout(() => element.style.transition = '', 500);
    }, 100);
}

const boardContainer = document.getElementById('board-container');
const boardContent = document.getElementById('board-content');
const boardImage = document.getElementById('board-image');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');
const resetZoomBtn = document.getElementById('reset-zoom');

// Main controller interface passed to sub-modules
const mainControllerInterface = {
    get lastSelectedTileIndex() { return lastSelectedTileIndex; },
    get allTiles() { return tilesStore.get(); },
    get config() { return configStore.get().config; },
    get allStyles() { return configStore.get().styles; },
    updateEditorPanel, renderTiles,
    flashField, loadBoardImage, saveTile,
};

document.addEventListener('DOMContentLoaded', () => {
    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    configStore.subscribe(onDataChanged);
    tilesStore.subscribe(onDataChanged);

    // Initialize sub-modules that attach event listeners
    initializeTileEditor(mainControllerInterface);
    initializePrereqEditor(mainControllerInterface);
    initializeOverrideEditor(mainControllerInterface);
    initializeGlobalConfig(mainControllerInterface);

    // Setup page-level event listeners
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
        renderPrereqLines(prereqVisMode);
    });

    // NEW: Publish Button Listener
    document.getElementById('publish-board-btn')?.addEventListener('click', async (e) => {
        if (!confirm('Publishing will update the board for all players. Continue?')) return;
        e.target.disabled = true;
        e.target.textContent = 'Publishing...';
        await publishTiles();
        e.target.textContent = 'Published!';
        setTimeout(() => { e.target.disabled = false; e.target.textContent = 'Publish Board'; }, 2000);
    });

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    const authState = authStore.get();
    const { config, styles } = configStore.get();
    const tilesData = tilesStore.get();

    // --- Visibility / Access Control ---
    const setupView = document.getElementById('setup-view');
    const accessDenied = document.getElementById('access-denied');

    if (!authState.authChecked) {
        showGlobalLoader();
        setupView.style.display = 'none';
        accessDenied.style.display = 'none';
        return;
    }

    if (authState.isAdmin) {
        setupView.style.display = 'flex';
        accessDenied.style.display = 'none';
    } else {
        hideGlobalLoader();
        setupView.style.display = 'none';
        accessDenied.style.display = 'block';
        accessDenied.querySelector('p').textContent = authState.isLoggedIn ? 'You must be an Admin to view this page.' : 'You must be logged in as an Admin to view this page.';
        return;
    }

    // --- Data Loading Check ---
    if (!config.pageTitle || !tilesData) {
        showGlobalLoader();
        return;
    }
    hideGlobalLoader();

    // --- Render Page ---
    document.title = (config.pageTitle || 'Bingo') + ' | Live Editor';

    // Full re-render of all components that depend on data
    renderGlobalConfig(mainControllerInterface);
    populateTileSelector();
    renderTiles();

    // If a tile is selected, ensure its panel is up-to-date
    if (lastSelectedTileIndex !== null) {
        updateEditorPanel(lastSelectedTileIndex);
    } else {
        updateEditorPanel(null); // Ensure editor is cleared if no tile is selected
    }

    // This is the first time we have all data, so we can now do things
    // that were previously done once.
    if (!document.body.dataset.initialized) {
        document.body.dataset.initialized = 'true';

        // NEW: Add listeners for Lit component events
        const tileEditor = document.getElementById('tile-editor-form-component');
        tileEditor.addEventListener('tile-update', (e) => saveTile(e.detail.docId, e.detail.data));
        tileEditor.addEventListener('render-tiles', () => renderTiles());
        tileEditor.addEventListener('render-tiles-preview', handleTilePreviewUpdate);

        const globalConfigEditor = document.getElementById('global-config-form-component');
        globalConfigEditor.addEventListener('config-change', handleGlobalConfigChange);
        globalConfigEditor.addEventListener('config-preview-change', (e) => {
            handleGlobalConfigChange(e); // Can use the same handler for preview
            renderTiles(); // Re-render all tiles for style previews
        });

        createStylePreviewButtons();
        applyTileLockState();
        loadBoardImage(config.boardImageUrl || '');
    }
}

function handleGlobalConfigChange(event) {
    const { status, key, value } = event.detail;
    if (!key) return;

    if (status) {
        updateStyle(status, { [key]: value });
    } else {
        if (key === 'boardImageUrl') loadBoardImage(value);
        updateConfig({ [key]: value });
    }
    // The store listener will trigger a re-render if necessary,
    // but for live style previews, we want an immediate re-render.
    if (event.type === 'config-preview-change') renderTiles();
}

function renderTiles() {
    console.log("[SetupController] renderTiles called.");
    // FIX: Target the new <bingo-tile> component tag to clear the board.
    boardContent.querySelectorAll('bingo-tile').forEach(el => el.remove());
    const tilesData = tilesStore.get();
    const { config, styles } = configStore.get();
    if (!tilesData) return;
    const duplicateIds = getDuplicateIds(tilesData);

    tilesData.forEach((tile, index) => {
        const tileEl = document.createElement('bingo-tile');
        tileEl.tile = tile;
        tileEl.status = currentPreviewStatus || 'Unlocked';
        tileEl.config = config;
        tileEl.allStyles = styles;
        tileEl.isSetupTile = true; // For setup-specific styles/behavior
        tileEl.isHighlighted = lastSelectedTileIndex === index;
        tileEl.hasConflict = duplicateIds.has(tile.id);
        // NEW: Pass the showId flag to the component's property.
        tileEl.showId = showTileIds;
        tileEl.dataset.index = index;

        boardContent.appendChild(tileEl);
    });
    renderPrereqLines(prereqVisMode);
}

function handleTilePreviewUpdate(event) {
    const { docId, key, value } = event.detail;
    const tilesData = tilesStore.get();
    const tileIndex = tilesData.findIndex(t => t.docId === docId);
    if (tileIndex === -1) return;

    // Find the specific tile element on the board and update it
    const tileEl = boardContent.querySelector(`bingo-tile[data-index="${tileIndex}"]`);
    if (tileEl) {
        // FIX: Create a *new* tile object to ensure Lit's property change detection works.
        // Mutating the existing object in the store's array is not enough.
        const newTileData = { ...tileEl.tile, [key]: parseFloat(value) || 0 };
        tileEl.tile = newTileData;
        // Also update the master array so other interactions have the latest data.
        // tilesData[tileIndex] = newTileData; // No need to mutate store directly here, visual update is enough until save
    }
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

interact('bingo-tile')
    .draggable({
        listeners: {
            move(event) {
                const tilesData = tilesStore.get();
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

                // Update local data for immediate feedback (e.g. for the editor panel)
                // But DO NOT save to DB yet.
                tilesData[index]['Left (%)'] = parseFloat(x_pct.toFixed(2));
                tilesData[index]['Top (%)'] = parseFloat(y_pct.toFixed(2));
                
                // Update the editor panel inputs live so you see the numbers change
                updateEditorPanel(index);
                renderPrereqLines(prereqVisMode);
            },
            end(event) {
                const tilesData = tilesStore.get();
                const target = event.target;
                const index = target.dataset.index;
                if (!tilesData[index]) return;

                const dataToSave = {
                    'Left (%)': tilesData[index]['Left (%)'],
                    'Top (%)': tilesData[index]['Top (%)']
                };
                saveTile(tilesData[index].docId, dataToSave);
            }
        }
    })
    .resizable({
        edges: { left: true, right: true, bottom: true, top: true },
        listeners: {
            move(event) { 
                const tilesData = tilesStore.get();
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
                
                // Update local data only
                tilesData[index]['Left (%)'] = parseFloat(x_pct.toFixed(2));
                tilesData[index]['Top (%)'] = parseFloat(y_pct.toFixed(2));
                tilesData[index]['Width (%)'] = parseFloat(width_pct.toFixed(2));
                tilesData[index]['Height (%)'] = parseFloat(height_pct.toFixed(2));

                updateEditorPanel(index);
                renderPrereqLines(prereqVisMode);
            },
            end(event) {
                const tilesData = tilesStore.get();
                const target = event.target;
                const index = target.dataset.index;
                if (!tilesData[index]) return;

                const dataToSave = {
                    'Left (%)': tilesData[index]['Left (%)'],
                    'Top (%)': tilesData[index]['Top (%)'],
                    'Width (%)': tilesData[index]['Width (%)'],
                    'Height (%)': tilesData[index]['Height (%)']
                };
                saveTile(tilesData[index].docId, dataToSave);
            }
        }
    });

function applyTileLockState() {
    const lockBtn = document.getElementById('lock-tiles-btn');
    if (isTilesLocked) {
        interact('bingo-tile').draggable(false).resizable(false);
        lockBtn.textContent = 'Locked';
    } else {
        interact('bingo-tile').draggable(true).resizable(true);
        lockBtn.textContent = 'Unlocked';
    }
}

function toggleTileLock() {
    isTilesLocked = !isTilesLocked;
    applyTileLockState();
}

function updateEditorPanel(index) {
    const tilesData = tilesStore.get();
    if (index === null || !tilesData?.[index]) {
        index = null;
    }
    lastSelectedTileIndex = index;

    // Update the Lit component
    const tileEditor = document.getElementById('tile-editor-form-component');
    if (tileEditor) {
        tileEditor.allTiles = tilesData;
        tileEditor.mainController = mainControllerInterface;
        tileEditor.tileData = index !== null ? tilesData[index] : null;
    }

    renderPrereqLines(prereqVisMode);
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
    const tileEl = event.target.closest('bingo-tile');
    if (tileEl) {
        const tilesData = tilesStore.get();
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