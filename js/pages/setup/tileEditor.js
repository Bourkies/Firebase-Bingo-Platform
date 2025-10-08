/* tileEditor.js */
import { createFormFields } from '../../components/FormBuilder.js';
import { tilesStore, createTile, deleteTile, deleteAllTiles } from '../../stores/tilesStore.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';
import { createOverrideFieldset, populateOverridesUI, handleRawJsonOverrideChange, addOverrideRow } from './overrideEditor.js';
import { createPrereqFieldset, populatePrereqUI } from './prereqEditor.js';

// NEW: Add a module-level variable to hold the main controller interface.
let mainController;

const TILE_FIELD_DESCRIPTIONS = {
    'docId': 'The internal, unique, non-editable Firestore document ID.',
    'id': 'The user-facing "Tile ID" used for display and prerequisites (e.g., "B1"). Must be unique across all tiles.',
    'Name': 'The display name of the tile, shown on the board and in a modal.',
    'Description': 'A longer description of the tile task, shown in the submission modal.',
    'Prerequisites': 'The requirements to unlock this tile. Use the UI below to define AND/OR logic. Raw format: a comma-separated list for a single AND group (e.g., "A1,A2"), or a JSON array for complex OR groups (e.g., [["A1","A2"],["B1"]]).',
    'Points': 'The number of points this tile is worth when completed.',
    'Rotation': 'The rotation of the tile on the board in degrees.',
    'Top (%)': 'The position of the tile\'s top edge as a percentage of the board\'s height.',
    'Left (%)': 'The position of the tile\'s left edge as a percentage of the board\'s width.',
    'Width (%)': 'The width of the tile as a percentage of the board\'s width.',
    'Height (%)': 'The height of the tile as a percentage of the board\'s height.'
};

const tileEditorSchema = {
    docId: { label: 'Document ID', type: 'text', disabled: true, description: TILE_FIELD_DESCRIPTIONS.docId },
    id: { label: 'Tile ID', type: 'text', description: TILE_FIELD_DESCRIPTIONS.id },
    Name: { label: 'Name', type: 'text', description: TILE_FIELD_DESCRIPTIONS.Name },
    Points: { label: 'Points', type: 'text', description: TILE_FIELD_DESCRIPTIONS.Points },
    Description: { label: 'Description', type: 'textarea', description: TILE_FIELD_DESCRIPTIONS.Description },
    'Left (%)': { label: 'Left (%)', type: 'range', min: 0, max: 100, step: 0.01, description: TILE_FIELD_DESCRIPTIONS['Left (%)'] },
    'Top (%)': { label: 'Top (%)', type: 'range', min: 0, max: 100, step: 0.01, description: TILE_FIELD_DESCRIPTIONS['Top (%)'] },
    'Width (%)': { label: 'Width (%)', type: 'range', min: 0, max: 100, step: 0.01, description: TILE_FIELD_DESCRIPTIONS['Width (%)'] },
    'Height (%)': { label: 'Height (%)', type: 'range', min: 0, max: 100, step: 0.01, description: TILE_FIELD_DESCRIPTIONS['Height (%)'] },
    Rotation: { label: 'Rotation', type: 'range', min: 0, max: 360, step: 1, unit: 'deg', description: TILE_FIELD_DESCRIPTIONS.Rotation },
};

export function initializeTileEditor(controller) {
    const detailsForm = document.getElementById('details-form');
    const addNewTileBtn = document.getElementById('add-new-tile-btn');
    const deleteTileBtn = document.getElementById('delete-tile-btn');

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

    // REFACTOR: Use 'change' event for more deliberate saves.
    detailsForm?.addEventListener('change', handleEditorInputChange);
    addNewTileBtn?.addEventListener('click', addNewTile);
    deleteTileBtn?.addEventListener('click', deleteSelectedTile);

    // createEditorForm is now called from the main controller when data is ready
}

export function createEditorForm(tileData, mainController) {
    console.log("[TileEditor] createEditorForm called for tile:", tileData?.id || 'None');
    const detailsForm = document.getElementById('details-form');
    if (!detailsForm) return;
    detailsForm.innerHTML = '';

    const TILE_EDITOR_FIELDS = ['docId', 'id', 'Name', 'Points', 'Description', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)', 'Rotation'];
    createFormFields(detailsForm, tileEditorSchema, tileData || {}, TILE_EDITOR_FIELDS, {
        // Pass the flashField utility to FormBuilder for remote updates
        flashField: (el) => mainController.flashField(el)
    });

    const overridesFieldset = createOverrideFieldset(mainController);
    const prereqFieldset = createPrereqFieldset(mainController);

    detailsForm.appendChild(overridesFieldset);

    detailsForm.insertBefore(prereqFieldset, overridesFieldset);
    // Attach listeners to the newly created elements inside the overrides fieldset
    const addOverrideBtn = overridesFieldset.querySelector('#add-override-btn');
    if (addOverrideBtn) addOverrideBtn.addEventListener('click', () => addOverrideRow('', '', '', mainController));

    const rawJsonTextarea = overridesFieldset.querySelector('#overrides-json-textarea');
    if (rawJsonTextarea) rawJsonTextarea.addEventListener('change', (e) => handleRawJsonOverrideChange(e, mainController));

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
    const tilesData = tilesStore.get();
    if (!deleteTileBtn || !mainController) return; // Guard against element not existing or controller not ready

    if (index === null || !tilesData[index]) {
        deleteTileBtn.disabled = true;
        createEditorForm(null, mainController);
        const addOverrideBtn = document.querySelector('#add-override-btn');
        if (addOverrideBtn) addOverrideBtn.disabled = true;
        return;
    }

    const tile = tilesData[index];
    createEditorForm(tile, mainController);

    const addOverrideBtn = document.querySelector('#add-override-btn');
    if (addOverrideBtn) addOverrideBtn.disabled = false;
    deleteTileBtn.disabled = false;

    populatePrereqUI(tile['Prerequisites'] || '', mainController);

    let overrides = {};
    try {
        if (tile['Overrides (JSON)']) {
            overrides = JSON.parse(tile['Overrides (JSON)']);
        }
    } catch (e) { /* Ignore invalid JSON */ }

    const rawJsonTextarea = document.getElementById('overrides-json-textarea');
    if (rawJsonTextarea) { // Check if it exists before using it
        rawJsonTextarea.value = tile['Overrides (JSON)'] ? JSON.stringify(overrides, null, 2) : '';
        rawJsonTextarea.style.borderColor = '';
    }
    populateOverridesUI(overrides, mainController);

    const selector = document.getElementById('tile-selector-dropdown');
    if (selector) {
        selector.value = index !== null ? index : '';
    }

    validateTileId();
}

function getDuplicateIds(tiles) {
    if (!tiles) return new Set();
    const ids = tiles.map(t => t.id).filter(id => id);
    const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index);
    return new Set(duplicates);
}

function validateTileId() {
    const lastSelectedTileIndex = mainController.lastSelectedTileIndex;
    if (lastSelectedTileIndex === null) return;
    const allTiles = tilesStore.get();
    const tile = allTiles[lastSelectedTileIndex];
    const duplicateIds = getDuplicateIds(allTiles.filter(t => t.docId !== tile.docId));
    const idInput = document.querySelector('#details-form input[name="id"]');
    if (!idInput) return;
    
    const parentField = idInput.closest('.form-field');
    if (!parentField) return;

    let validationMessage = parentField.querySelector('.validation-msg');
    if (!validationMessage) {
        validationMessage = document.createElement('span');
        validationMessage.className = 'validation-msg';
        parentField.appendChild(validationMessage);
    }

    if (duplicateIds.has(tile.id)) {
        idInput.style.borderColor = '#e57373';
        validationMessage.textContent = 'This Tile ID is not unique!';
    } else {
        idInput.style.borderColor = '';
        validationMessage.textContent = '';
    }
}

function handleEditorInputChange(event) {
    const lastSelectedTileIndex = mainController.lastSelectedTileIndex;
    if (lastSelectedTileIndex === null) return;
    if (!mainController) return;

    const input = event.target;
    const key = input.dataset.key;
    if (!key) return;

    if (input.closest('#details-form') && !input.closest('.overrides-fieldset') && !input.closest('.prereq-fieldset')) {
        const tilesData = tilesStore.get();
        const tile = tilesData[lastSelectedTileIndex];
        if (!tile) return;

        let newValue = input.type === 'checkbox' ? input.checked : (input.value || '');
        // Append unit if the input element has a unit defined in its dataset
        if (input.dataset.unit) newValue += input.dataset.unit;

        // Don't mutate the store's data directly. The save will trigger a re-render.
        // tile[key] = newValue;

        mainController.saveTile(tile.docId, { [key]: newValue }, mainController);

        const visualKeys = ['id', 'Name', 'Rotation', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)'];
        if (visualKeys.includes(key) || key.toLowerCase().includes('color')) {
            mainController.renderTiles();
        }
        if (key === 'id') {
            validateTileId();
        }
    }
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