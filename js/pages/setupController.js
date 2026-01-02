import '../components/Navbar.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';
import '../components/BingoTile.js'; // Import the tile component
// NEW: Import stores for reading data
import { authStore } from '../stores/authStore.js';
import { configStore, updateConfig, updateStyle } from '../stores/configStore.js'; 
import { tilesStore, updateTile as saveTile, publishTiles, createTile, deleteTile, deleteAllTiles, importTiles } from '../stores/tilesStore.js';
import { db, fb } from '../core/firebase-config.js';
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

let publishedTiles = [];
let tileDiff = [];

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
    const prereqBtn = document.getElementById('prereq-vis-btn');
    if (prereqBtn) {
        prereqBtn.textContent = prereqVisMode === 'hide' ? 'Hidden' : 'Visible';
        prereqBtn.style.backgroundColor = prereqVisMode === 'hide' ? '#555' : '';
        prereqBtn.addEventListener('click', (e) => {
            console.log("[SetupController] Prereq toggle clicked.");
            // Cycle: hide -> selected -> all -> hide
            if (prereqVisMode === 'hide') prereqVisMode = 'selected';
            else if (prereqVisMode === 'selected') prereqVisMode = 'all';
            else prereqVisMode = 'hide';

            let label = 'Hidden';
            if (prereqVisMode === 'selected') label = 'Selected';
            if (prereqVisMode === 'all') label = 'All';

            e.target.textContent = label;
            e.target.style.backgroundColor = prereqVisMode === 'hide' ? '#555' : '';
            renderPrereqLines(prereqVisMode);
        });
    }

    // REVISED: Publish button now opens the diff modal
    document.getElementById('publish-board-btn')?.addEventListener('click', openPublishModal);

    // NEW: Listeners for the new diff modal
    const diffModal = document.getElementById('publish-diff-modal');
    diffModal.querySelector('.close-button').addEventListener('click', closePublishModal);
    document.getElementById('publish-selected-btn').addEventListener('click', handlePublishSelected);
    document.getElementById('revert-selected-btn').addEventListener('click', handleRevertSelected);
    document.getElementById('select-all-diff-checkbox').addEventListener('change', (e) => {
        diffModal.querySelectorAll('.diff-checkbox').forEach(cb => cb.checked = e.target.checked);
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

    // Fetch the published tiles once to establish a baseline for diffing
    if (!document.body.dataset.publishedTilesFetched) {
        document.body.dataset.publishedTilesFetched = 'true';
        fetchPublishedTiles();
    }

    // --- Data Loading Check ---
    // REVISED: Only wait for config. The tilesStore can be initially empty,
    // and the page will reactively render them when they load.
    if (!config.pageTitle) {
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
    calculateAndRenderDiff();

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

function getDeepObjectDiff(oldObj, newObj) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

    for (const key of allKeys) {
        // Skip docId as it's metadata, not data
        if (key === 'docId') continue;

        const oldValue = oldObj ? oldObj[key] : undefined;
        const newValue = newObj ? newObj[key] : undefined;

        let areDifferent = false;
        if (key === 'Overrides (JSON)') {
            try {
                const oldOverrides = oldValue ? JSON.parse(oldValue) : {};
                const newOverrides = newValue ? JSON.parse(newValue) : {};
                if (JSON.stringify(oldOverrides) !== JSON.stringify(newOverrides)) {
                    areDifferent = true;
                }
            } catch (e) {
                if (oldValue !== newValue) areDifferent = true;
            }
        } else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            areDifferent = true;
        }

        if (areDifferent) changes.push({ field: key, from: oldValue, to: newValue });
    }
    return changes;
}

async function fetchPublishedTiles() {
    try {
        const packedDoc = await fb.getDoc(fb.doc(db, 'tiles', 'packed'));
        if (packedDoc.exists() && packedDoc.data().tiles) {
            publishedTiles = packedDoc.data().tiles;
        } else {
            publishedTiles = []; // No published data yet
        }
        // Now that we have the baseline, calculate the initial diff
        calculateAndRenderDiff();
    } catch (error) {
        console.error("Error fetching published tiles:", error);
        publishedTiles = [];
    }
}

function calculateAndRenderDiff() {
    const rawTiles = tilesStore.get() || [];
    
    const rawMap = new Map(rawTiles.map(t => [t.docId, t]));
    const pubMap = new Map(publishedTiles.map(t => [t.docId, t]));
    const newDiff = [];

    // 1. Check for modified and deleted tiles
    pubMap.forEach((pubTile, docId) => {
        const rawTile = rawMap.get(docId);
        if (!rawTile) {
            newDiff.push({ type: 'deleted', tile: pubTile });
        } else {
            const changes = getDeepObjectDiff(pubTile, rawTile);
            if (changes.length > 0) {
                newDiff.push({ type: 'modified', oldTile: pubTile, newTile: rawTile, changes });
            }
        }
    });

    // 2. Check for added tiles
    rawMap.forEach((rawTile, docId) => {
        if (!pubMap.has(docId)) {
            newDiff.push({ type: 'added', tile: rawTile });
        }
    });

    tileDiff = newDiff;

    // Update UI indicator
    const indicator = document.getElementById('publish-indicator');
    if (indicator) {
        indicator.style.display = tileDiff.length > 0 ? 'inline' : 'none';
    }
}

function openPublishModal() {
    if (tileDiff.length === 0) {
        showMessage('No unpublished changes to publish.', false);
        return;
    }
    populateDiffModal();
    document.getElementById('publish-diff-modal').style.display = 'flex';
}

function closePublishModal() {
    document.getElementById('publish-diff-modal').style.display = 'none';
}

function populateDiffModal() {
    const container = document.getElementById('diff-container');
    if (tileDiff.length === 0) {
        container.innerHTML = '<p style="text-align: center;">All changes have been published or reverted.</p>';
        return;
    }

    container.innerHTML = tileDiff.map(change => {
        let contentHtml = '';
        const tile = change.tile || change.newTile;

        switch (change.type) {
            case 'added':
                contentHtml = `<div class="diff-summary"><strong>ADDED:</strong> Tile "${tile.Name}" (ID: ${tile.id})</div>`;
                break;
            case 'deleted':
                contentHtml = `<div class="diff-summary"><strong>DELETED:</strong> Tile "${tile.Name}" (ID: ${tile.id})</div>`;
                break;
            case 'modified':
                const allKeys = new Set([...Object.keys(change.oldTile), ...Object.keys(change.newTile)]);
                const changesMap = new Map(change.changes.map(c => [c.field, c]));

                const detailsHtml = [...allKeys].filter(key => key !== 'docId').map(key => {
                    const changeDetail = changesMap.get(key);
                    const value = change.newTile[key];

                    if (changeDetail) {
                        const from = JSON.stringify(changeDetail.from ?? '""', null, 2);
                        const to = JSON.stringify(changeDetail.to ?? '""', null, 2);
                        return `<li class="highlight"><strong>${key}:</strong> <span class="from">${from}</span> → <span class="to">${to}</span></li>`;
                    } else {
                        return `<li><strong>${key}:</strong> ${JSON.stringify(value ?? 'null', null, 2)}</li>`;
                    }
                }).join('');

                contentHtml = `
                    <div class="diff-summary"><strong>MODIFIED:</strong> Tile "${tile.Name}" (ID: ${tile.id})</div>
                    <ul class="diff-details">${detailsHtml}</ul>
                `;
                break;
        }
        return `<div class="diff-item" data-doc-id="${tile.docId}" data-type="${change.type}">
                    <input type="checkbox" class="diff-checkbox" style="margin-top: 4px; width: auto;">
                    <div class="diff-item-content">${contentHtml}</div>
                </div>`;
    }).join('');
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
    console.log(`[SetupController] Rendering ${tilesData ? tilesData.length : 0} tiles.`);
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

function getSelectedDiffItems() {
    const selectedChanges = [];
    document.querySelectorAll('#diff-container .diff-checkbox:checked').forEach(checkbox => {
        const itemEl = checkbox.closest('.diff-item');
        const docId = itemEl.dataset.docId;
        const change = tileDiff.find(d => (d.tile?.docId || d.newTile?.docId) === docId);
        if (change) {
            selectedChanges.push(change);
        }
    });
    return selectedChanges;
}

async function handlePublishSelected() {
    const selectedItems = getSelectedDiffItems();
    if (selectedItems.length === 0) {
        showMessage('No changes selected to publish.', true);
        return;
    }

    showGlobalLoader();
    try {
        // Start with the current published tiles
        const finalTilesMap = new Map(publishedTiles.map(t => [t.docId, t]));

        // Apply changes
        selectedItems.forEach(change => {
            const docId = change.tile?.docId || change.newTile?.docId;
            if (change.type === 'added' || change.type === 'modified') {
                finalTilesMap.set(docId, change.newTile);
            } else if (change.type === 'deleted') {
                finalTilesMap.delete(docId);
            }
        });

        const finalTilesArray = Array.from(finalTilesMap.values());
        await publishTiles(finalTilesArray);

        // After publishing, refetch to confirm and clear the diff.
        await fetchPublishedTiles();
        closePublishModal();
        showMessage(`${selectedItems.length} change(s) published successfully!`, false);
    } catch (e) {
        showMessage('Error publishing changes: ' + e.message, true);
    } finally {
        hideGlobalLoader();
    }
}

async function handleRevertSelected() {
    const selectedItems = getSelectedDiffItems();
    if (selectedItems.length === 0) {
        showMessage('No changes selected to revert.', true);
        return;
    }
    if (!confirm(`Are you sure you want to revert ${selectedItems.length} selected change(s)?`)) return;

    showGlobalLoader();
    try {
        const promises = selectedItems.map(change => {
            const docId = change.tile?.docId || change.newTile?.docId;
            if (change.type === 'added') return deleteTile(docId);
            if (change.type === 'deleted') return createTile(docId, change.tile);
            if (change.type === 'modified') return saveTile(docId, change.oldTile);
            return Promise.resolve();
        });

        await Promise.all(promises);
        closePublishModal();
        showMessage(`${selectedItems.length} change(s) reverted.`, false);
    } catch (e) {
        showMessage('Error reverting changes: ' + e.message, true);
    } finally {
        hideGlobalLoader();
    }
}