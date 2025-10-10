/* tileEditor.js */
import '../../components/TileEditorForm.js'; // Import the new Lit component
import { tilesStore, createTile, deleteTile, deleteAllTiles } from '../../stores/tilesStore.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';

// NEW: Add a module-level variable to hold the main controller interface.
let mainController;

export function initializeTileEditor(controller) {
    const addNewTileBtn = document.getElementById('add-new-tile-btn');
    const deleteTileBtn = document.getElementById('delete-tile-btn');
    const editorComponent = document.getElementById('tile-editor-form-component');

    console.log("[TileEditor] Initializing...");
    mainController = controller; // Store the controller reference.
    document.getElementById('delete-all-tiles-btn')?.addEventListener('click', openDeleteAllModal);
    document.querySelector('#delete-all-modal .close-button')?.addEventListener('click', closeDeleteAllModal);
    document.getElementById('delete-confirm-input')?.addEventListener('input', validateDeleteAll);
    document.getElementById('delete-confirm-btn')?.addEventListener('click', executeDeleteAll);

    document.getElementById('tile-selector-dropdown')?.addEventListener('change', (event) => {
        const selectedIndex = event.target.value;
        const newIndex = selectedIndex !== '' ? parseInt(selectedIndex, 10) : null;
        if (newIndex !== mainController.lastSelectedTileIndex) {
            mainController.updateEditorPanel(newIndex);
            mainController.renderTiles();
        }
    });

    addNewTileBtn?.addEventListener('click', addNewTile);
    deleteTileBtn?.addEventListener('click', deleteSelectedTile);
}

export function populateTileSelector() {
    console.log("[TileEditor] populateTileSelector called.");
    const selector = document.getElementById('tile-selector-dropdown');
    const tilesData = tilesStore.get();
    if (!selector) return;

    const sortedTiles = [...tilesData].sort((a, b) => (a.id || '').localeCompare(b.id || ''));

    selector.innerHTML = '<option value="">-- Select a Tile by ID --</option>';
    sortedTiles.forEach(tile => {
        const originalIndex = tilesData.findIndex(t => t.docId === tile.docId);
        const option = document.createElement('option');
        option.value = originalIndex;
        option.textContent = `${tile.id || '[No ID]'} - ${tile.Name || '[No Name]'}`;
        selector.appendChild(option);
    });

    const lastSelectedTileIndex = mainController.lastSelectedTileIndex;
    if (lastSelectedTileIndex !== null) {
        selector.value = lastSelectedTileIndex;
    } else {
        selector.value = '';
    }
}

export function updateEditorPanelContent(index) {
    console.log(`[TileEditor] updateEditorPanelContent called for index: ${index}`);
    const deleteTileBtn = document.getElementById('delete-tile-btn');
    const editorComponent = document.getElementById('tile-editor-form-component');
    const tilesData = tilesStore.get();
    if (!deleteTileBtn || !editorComponent || !mainController) return;

    if (index === null || !tilesData[index]) {
        deleteTileBtn.disabled = true;
        editorComponent.tileData = null;
        editorComponent.allTiles = tilesData;
        editorComponent.mainController = mainController;
        return;
    }

    const tile = tilesData[index];
    deleteTileBtn.disabled = false;

    // Pass data to the Lit component
    editorComponent.tileData = tile;
    editorComponent.allTiles = tilesData;
    editorComponent.mainController = mainController;
}

async function addNewTile() {
    console.log("[TileEditor] addNewTile called.");
    const tilesData = tilesStore.get();
    const existingNumbers = tilesData.map(t => parseInt(t.docId, 10)).filter(n => !isNaN(n));
    const maxNumber = existingNumbers.length > 0 ? Math.max(0, ...existingNumbers) : 0;
    const newDocId = String(maxNumber + 1).padStart(5, '0');

    const newTileData = {
        id: newDocId,
        Name: 'New Tile',
        'Left (%)': '45.00',
        'Top (%)': '45.00',
        'Width (%)': '10.00',
        'Height (%)': '10.00',
        Points: '', Description: '', Prerequisites: '', Rotation: '', 'Overrides (JSON)': ''
    };

    try {
        await createTile(newDocId, newTileData);
        showMessage(`Tile ${newDocId} created successfully.`, false);
    } catch (err) {
        showMessage(`Failed to create tile: ${err.message}`, true);
    }
}

async function deleteSelectedTile() {
    const lastSelectedTileIndex = mainController.lastSelectedTileIndex;
    if (lastSelectedTileIndex === null) return;
    console.log(`[TileEditor] deleteSelectedTile called for index: ${lastSelectedTileIndex}`);
    const tilesData = tilesStore.get();
    const tileToDelete = tilesData[lastSelectedTileIndex];
    if (confirm(`Are you sure you want to delete tile "${tileToDelete.id}"?`)) {
        try {
            await deleteTile(tileToDelete.docId);
            showMessage(`Tile ${tileToDelete.id} deleted.`, false);
        } catch (err) {
            showMessage(`Failed to delete tile: ${err.message}`, true);
        }
    }
}

function openDeleteAllModal() {
    document.getElementById('delete-all-modal').style.display = 'flex';
}

function closeDeleteAllModal() {
    const modal = document.getElementById('delete-all-modal');
    modal.style.display = 'none';
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('delete-confirm-btn').disabled = true;
}

function validateDeleteAll() {
    const input = document.getElementById('delete-confirm-input');
    const confirmBtn = document.getElementById('delete-confirm-btn');
    confirmBtn.disabled = input.value !== 'DELETE ALL';
}

async function executeDeleteAll() {
    console.log("[TileEditor] executeDeleteAll called.");
    showGlobalLoader();
    const confirmBtn = document.getElementById('delete-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
        await deleteAllTiles();
        showMessage('All tiles have been deleted.', false);
        closeDeleteAllModal();
    } catch (error) {
        showMessage(`Error deleting tiles: ${error.message}`, true);
    } finally {
        confirmBtn.textContent = 'Confirm Deletion';
        hideGlobalLoader();
    }
}