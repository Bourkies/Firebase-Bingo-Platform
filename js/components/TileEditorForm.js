import { LitElement, html, css } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { createFormFields } from './FormBuilder.js';
import { createPrereqFieldset, populatePrereqUI } from '../pages/setup/prereqEditor.js';
import { createOverrideFieldset, populateOverridesUI, handleRawJsonOverrideChange, addOverrideRow } from '../pages/setup/overrideEditor.js';

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

export class TileEditorForm extends LitElement {
    static styles = css`
        /* Styles are inherited from setup.html, but we can add component-specific ones here if needed */
        :host {
            display: block;
        }
        #details-form {
            display: grid;
            grid-template-columns: repeat(10, 1fr);
            gap: 15px;
        }
        /* Assign fields to grid columns/rows */
        .form-field[data-key="docId"]        { grid-column: span 2; }
        .form-field[data-key="id"]           { grid-column: span 2; }
        .form-field[data-key="Name"]         { grid-column: span 3; }
        .form-field[data-key="Points"]       { grid-column: span 3; }
        .form-field[data-key="Description"]  { grid-column: 1 / -1; }
        .form-field[data-key="Left (%)"]     { grid-column: span 2; }
        .form-field[data-key="Top (%)"]      { grid-column: span 2; }
        .form-field[data-key="Width (%)"]    { grid-column: span 2; }
        .form-field[data-key="Height (%)"]   { grid-column: span 2; }
        .form-field[data-key="Rotation"]     { grid-column: span 2; }
        .prereq-fieldset, .overrides-fieldset { grid-column: 1 / -1; }
    `;
    // FIX: Consolidate all styles into a single declaration and add missing styles for child components.
    static styles = [TileEditorForm.styles, css`
        .tooltip-icon { margin-left: 8px; color: var(--secondary-text); cursor: help; font-size: 0.8em; font-weight: normal; border-bottom: 1px dotted var(--secondary-text); display: inline-block; }
        .validation-msg { font-size: 0.8em; color: var(--error-color); margin-top: 4px; display: block; min-height: 1.2em; }

        /* Styles for vanilla JS components injected into the shadow DOM */
        .overrides-fieldset, .prereq-fieldset { border: 1px solid #444; border-radius: 4px; padding: 10px 15px; }
        .overrides-fieldset legend, .prereq-fieldset legend { color: var(--accent-color); }
        #prereq-ui-container { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; width: 100%; }
        .prereq-or-group { display: flex; flex-direction: column; gap: 8px; border: 1px solid var(--border-color); padding: 10px; border-radius: 4px; background-color: var(--bg-color); }
        .prereq-or-label { font-weight: bold; color: var(--accent-color); }
        .prereq-and-input { flex-grow: 1; }
        #overrides-container { display: flex; flex-direction: column; gap: 10px; }
        .override-item { display: grid; grid-template-columns: 150px 1fr 1fr 40px; gap: 10px; align-items: center; }
        .remove-override-btn { background-color: var(--error-color); padding: 8px; }
        .form-field-compound { display: flex; align-items: center; gap: 10px; }
        .form-field-compound input[type="color"] { padding: 0; height: 38px; width: 38px; flex-shrink: 0; border: none; }
        .color-text-input { font-family: monospace; flex-grow: 1; }

        /* Generic input styles that were previously global */
        input, textarea, select { width: 100%; padding: 8px; box-sizing: border-box; background-color: var(--bg-color); color: var(--primary-text); border: 1px solid var(--border-color); border-radius: 4px; }
        textarea { resize: vertical; min-height: 80px; font-family: monospace; }
        button { background-color: var(--accent-color); color: var(--accent-text-color); border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-size: 16px; margin-top: 10px; transition: background-color 0.2s; }
        button:hover { background-color: var(--accent-color-darker); }
        button:disabled { background-color: var(--disabled-bg-color); cursor: not-allowed; opacity: 0.7; }
    `];

    static properties = {
        tileData: { type: Object },
        allTiles: { type: Array },
        mainController: { type: Object },
        _formContent: { state: true } // NEW: Internal state for form content
    };

    constructor() {
        super();
        this.tileData = null;
        this.allTiles = [];
        this.mainController = {};
        this._formContent = null; // NEW: Initialize state
    }

    updated(changedProperties) {
        // FIX: Only re-render the entire form if the selected tile has changed (i.e., its docId is different).
        // This prevents the form from resetting itself due to its own updates coming back from the server.
        if (changedProperties.has('tileData')) {
            // Always call renderFormContents to update the main form fields.
            // This function is now lightweight and just sets a property.
            this.renderFormContents(); 

            // If a tile is selected, run the side-effect logic to append the vanilla JS components.
            // This runs *after* Lit's render cycle is complete, so the form element exists.
            if (this.tileData) {
                const form = this.shadowRoot.getElementById('details-form');
                if (!form) return;

                // FIX: Remove existing vanilla JS fieldsets before re-adding them to prevent duplication.
                // These are not managed by Lit's renderer, so we must clean them up manually.
                form.querySelector('.prereq-fieldset')?.remove();
                form.querySelector('.overrides-fieldset')?.remove();

                // --- Render Prerequisites ---
                const prereqFieldset = createPrereqFieldset(this.mainController, this.shadowRoot);
                form.appendChild(prereqFieldset);
                populatePrereqUI(this.tileData['Prerequisites'] || '', this.mainController, this.shadowRoot);

                // --- Render Overrides ---
                const overridesFieldset = createOverrideFieldset(this.mainController, this.shadowRoot);
                form.appendChild(overridesFieldset);
                
                const addOverrideBtn = overridesFieldset.querySelector('#add-override-btn');
                if (addOverrideBtn) addOverrideBtn.addEventListener('click', () => addOverrideRow('', '', '', this.mainController, this.shadowRoot));

                const rawJsonTextarea = overridesFieldset.querySelector('#overrides-json-textarea');
                if (rawJsonTextarea) rawJsonTextarea.addEventListener('change', (e) => handleRawJsonOverrideChange(e, this.mainController, this.shadowRoot));

                let overrides = {};
                try {
                    if (this.tileData['Overrides (JSON)']) overrides = JSON.parse(this.tileData['Overrides (JSON)']);
                } catch (e) { /* Ignore invalid JSON */ }

                if (rawJsonTextarea) rawJsonTextarea.value = this.tileData['Overrides (JSON)'] ? JSON.stringify(overrides, null, 2) : '';
                populateOverridesUI(overrides, this.mainController, this.shadowRoot);
            }
        }
    }

    renderFormContents() {
        // This function is now only responsible for preparing the Lit-based part of the form.
        // The vanilla JS parts are handled as a side-effect in the `updated` method.
        const TILE_EDITOR_FIELDS = ['docId', 'id', 'Name', 'Points', 'Description', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)', 'Rotation'];
        this._formContent = this.tileData 
            ? html`${createFormFields(tileEditorSchema, this.tileData, TILE_EDITOR_FIELDS, { flashField: (el) => this.mainController.flashField(el) })}`
            : html`<p style="grid-column: 1 / -1; text-align: center; color: var(--secondary-text);">No tile selected. Select a tile on the board or from the dropdown to edit its details.</p>`;

        // The validation needs to run after the form content is set.
        this.validateTileId();
    }

    getDuplicateIds() {
        if (!this.allTiles) return new Set();
        const ids = this.allTiles.map(t => t.id).filter(id => id);
        const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index);
        return new Set(duplicates);
    }

    validateTileId() {
        if (!this.tileData) return;

        const duplicateIds = this.getDuplicateIds(this.allTiles.filter(t => t.docId !== this.tileData.docId));
        const idInput = this.shadowRoot.querySelector('#details-form input[name="id"]');
        if (!idInput) return;

        const parentField = idInput.closest('.form-field');
        if (!parentField) return;

        let validationMessage = parentField.querySelector('.validation-msg');
        if (!validationMessage) {
            validationMessage = document.createElement('span');
            validationMessage.className = 'validation-msg';
            parentField.appendChild(validationMessage);
        }

        if (duplicateIds.has(this.tileData.id)) {
            idInput.style.borderColor = 'var(--error-color)';
            validationMessage.textContent = 'This Tile ID is not unique!';
        } else {
            idInput.style.borderColor = '';
            validationMessage.textContent = '';
        }
    }

    /**
     * This single handler manages both live previews and debounced saves.
     * It's triggered by both 'input' and 'change' events.
     */
    handleFormUpdate(event) {
        if (!this.tileData) return;
        const input = event.target;
        const key = input.dataset.key;
        if (!key) return;

        // --- Live Preview & Sync ---
        // Sync slider and number input
        if (input.type === 'range') {
            const numberInput = this.shadowRoot.querySelector(`input[type="number"][data-key="${key}"]`);
            if (numberInput) numberInput.value = input.value;
        } else if (input.type === 'number' && input.validity.valid) {
            const rangeInput = this.shadowRoot.querySelector(`input[type="range"][data-key="${key}"]`);
            if (rangeInput) rangeInput.value = input.value;
        }

        // Dispatch preview event for visual updates on the board
        const visualKeys = ['Rotation', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)'];
        if (visualKeys.includes(key) && input.validity.valid) {
            this.dispatchEvent(new CustomEvent('render-tiles-preview', {
                detail: { docId: this.tileData.docId, key, value: input.value }
            }));
        }

        // --- Debounced Save ---
        // This will be called on both 'input' and 'change' events.
        // The debounce ensures we don't spam the server while typing or sliding.
        // The final 'change' event will simply reset the debounce timer and save the final value.
        if (!key || !input.closest('#details-form') || input.closest('.overrides-fieldset') || input.closest('.prereq-fieldset')) return;

        const numericKeys = ['Left (%)', 'Top (%)', 'Width (%)', 'Height (%)', 'Rotation', 'Points'];
        debouncedSave(this, this.tileData.docId, {
            key: key,
            value: input.type === 'checkbox' ? input.checked : input.value,
            isNumeric: numericKeys.includes(key),
            unit: input.dataset.unit
        });
    }

    render() {
        return html`
            <form id="details-form" @input=${this.handleFormUpdate} @change=${this.handleFormUpdate}>
                ${this._formContent}
            </form>
        `;
    }
}

customElements.define('tile-editor-form', TileEditorForm);

// --- REVISED: Debounced save logic is now outside the class method ---
const debouncedSave = debounce((component, docId, detail) => {
    let finalValue = detail.value;
    // On save, we parse the final value to a number if needed.
    // This happens after the user has stopped typing/interacting.
    if (detail.isNumeric && typeof finalValue === 'string' && finalValue.trim() !== '') {
        finalValue = parseFloat(finalValue) || 0;
    }
    // Add unit AFTER parsing, if applicable.
    if (detail.unit) {
        finalValue = `${finalValue}${detail.unit}`;
    }
    component.dispatchEvent(new CustomEvent('tile-update', {
        detail: { docId, data: { [detail.key]: finalValue } }
    }));
}, 500);

// Debounce function to delay execution
function debounce(func, wait) {
    let timeout;
    return (component, ...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(component, ...args), wait);
    };
}