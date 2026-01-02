/* overrideEditor.js */
import { tilesStore } from '../../stores/tilesStore.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';

export const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];
const VALID_OVERRIDE_PROPERTIES = [
    'shape', 'color', 'opacity',
    'borderWidth', 'borderColor',
    'hoverBorderWidth', 'hoverBorderColor',
    'useStampByDefault', 'stampImageUrl', 'stampScale', 'stampRotation', 'stampPosition'
].sort();

const styleSchema = {
    shape: { label: 'Tile Shape', type: 'select', options: ['Square', 'Ellipse', 'Circle', 'Diamond', 'Triangle', 'Hexagon'], description: 'The overall shape of the tiles.' },
    stampScale: { label: `Stamp Scale`, type: 'range', min: 0, max: 3, step: 0.05, description: `Size multiplier for the stamp (e.g., 1 is 100%, 0.5 is 50%).` },
    stampRotation: { label: `Stamp Rotation`, type: 'range', min: 0, max: 360, step: 1, unit: 'deg', description: 'Rotation of the stamp in degrees.' },
};

export function initializeOverrideEditor(mainController) {
    console.log("[OverrideEditor] Initializing...");
    // The main logic is now in updateOverridesJsonFromCurrentTile, triggered by events.
}

function getOverridesFromUI(shadowRoot) {
    const specificOverrides = {};
    const allStatusOverrides = {};
    const rows = shadowRoot.querySelectorAll('#overrides-container .override-item');
    const seenSpecifics = new Set();
    const duplicates = new Set();

    // 1. First pass: Identify all specific duplicates
    rows.forEach(item => {
        const status = item.querySelector('.override-status-select').value;
        const key = item.querySelector('.override-key').value;
        item.style.border = ''; // Reset border
        if (status && key && status !== '__ALL__') {
            const uniqueKey = `${status}|${key}`;
            if (seenSpecifics.has(uniqueKey)) {
                duplicates.add(uniqueKey);
            }
            seenSpecifics.add(uniqueKey);
        }
    });

    // 2. Second pass: Build data structures and highlight duplicates
    rows.forEach(item => {
        const status = item.querySelector('.override-status-select').value;
        const key = item.querySelector('.override-key').value;
        const valueEl = item.querySelector('.override-value');
        
        if (!status || !key) return;

        const uniqueKey = `${status}|${key}`;
        if (duplicates.has(uniqueKey)) {
            item.style.border = '2px solid var(--error-color)';
        }

        let value;
        if (valueEl.type === 'checkbox') {
            value = valueEl.checked;
        } else if (valueEl.type === 'range' || valueEl.type === 'number') {
            // FIX: Re-add the unit to the value before saving to prevent "bouncing" sliders.
            value = parseFloat(valueEl.value); // Always get the number
            if (valueEl.dataset.unit) {
                value = `${value}${valueEl.dataset.unit}`; // Add unit back if it exists
            }
        } else {
            value = valueEl.value;
        }

        if (value === 'true') value = true;
        else if (value === 'false') value = false;

        if (status === '__ALL__') {
            allStatusOverrides[key] = value; // Last wins
        } else {
            if (!specificOverrides[status]) specificOverrides[status] = {};
            // Last one wins in case of duplicate
            specificOverrides[status][key] = value;
        }
    });

    // 3. Third pass: Apply the "All Statuses" rules
    Object.entries(allStatusOverrides).forEach(([key, value]) => {
        STATUSES.forEach(status => {
            if (!specificOverrides[status]) {
                specificOverrides[status] = {};
            }
            // Only apply if a more specific override for this property doesn't already exist
            if (specificOverrides[status][key] === undefined) {
                specificOverrides[status][key] = value;
            }
        });
    });

    return specificOverrides;
}

export function populateOverridesUI(overrides, mainController, shadowRoot) {
    console.log("[OverrideEditor] populateOverridesUI called.");
    // FIX: Query within the provided shadowRoot.
    const container = shadowRoot.getElementById('overrides-container');
    if (!container) return;
    container.innerHTML = '';
    if (typeof overrides !== 'object' || overrides === null) return;
    mainController.flashField(shadowRoot.getElementById('overrides-json-textarea'));

    // NEW LOGIC: Detect common properties to collapse into "All Statuses"
    const propertyMap = {}; // key -> { value, consistent, count }

    // 1. Analyze existing overrides against the known STATUSES list
    STATUSES.forEach(status => {
        if (overrides[status]) {
            Object.entries(overrides[status]).forEach(([key, value]) => {
                if (!propertyMap[key]) {
                    propertyMap[key] = { value, consistent: true, count: 1 };
                } else {
                    const entry = propertyMap[key];
                    if (entry.value !== value) entry.consistent = false;
                    entry.count++;
                }
            });
        }
    });

    const globalKeys = new Set();
    // 2. Identify keys that are present in ALL statuses with the SAME value
    Object.entries(propertyMap).forEach(([key, entry]) => {
        if (entry.consistent && entry.count === STATUSES.length) {
            globalKeys.add(key);
            addOverrideRow('__ALL__', key, entry.value, mainController, shadowRoot);
        }
    });

    // 3. Render specific overrides, skipping those covered by global keys
    for (const [status, properties] of Object.entries(overrides)) {
        if (typeof properties === 'object' && properties !== null) {
            for (const [key, value] of Object.entries(properties)) {
                // If this is a known status and the key is global, skip it (it's covered by __ALL__)
                if (STATUSES.includes(status) && globalKeys.has(key)) {
                    continue;
                }
                addOverrideRow(status, key, value, mainController, shadowRoot);
            }
        }
    }
}

export function addOverrideRow(status = '', key = '', value = '', mainController, shadowRoot) {
    console.log(`[OverrideEditor] addOverrideRow called for ${status}, ${key}`);
    // FIX: Query within the provided shadowRoot.
    const container = shadowRoot.getElementById('overrides-container');
    if (!container) return;
    const item = document.createElement('div');
    item.className = 'override-item';

    const statusSelect = document.createElement('select');
    statusSelect.className = 'override-status-select';
    statusSelect.innerHTML = `<option value="">Select Status</option>`;
    STATUSES.forEach(s => {
        statusSelect.innerHTML += `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`;
    });
    statusSelect.innerHTML += `<option value="__ALL__" ${status === '__ALL__' ? 'selected' : ''}>All Statuses</option>`;

    const keySelect = document.createElement('select');
    keySelect.className = 'override-key';
    keySelect.innerHTML = `<option value="">Select Property</option>`;
    VALID_OVERRIDE_PROPERTIES.forEach(prop => {
        const option = document.createElement('option');
        option.value = prop;
        option.textContent = prop;
        keySelect.appendChild(option);
    });
    keySelect.value = key;

    const valueContainer = document.createElement('div');
    valueContainer.className = 'override-value-container';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-override-btn';
    removeBtn.textContent = '−';

    item.append(statusSelect, keySelect, valueContainer, removeBtn);
    container.appendChild(item);

    // REFACTOR: Use 'change' event to trigger saves.
    const updateCallback = () => updateOverridesJsonFromCurrentTile(mainController, shadowRoot);
    // FIX: Re-add listener. The getOverridesFromUI function now correctly guards against incomplete rows.
    statusSelect.addEventListener('change', updateCallback);
    keySelect.addEventListener('change', () => {
        populateValueContainer(valueContainer, keySelect.value, '', mainController, shadowRoot);
        updateCallback(); // Trigger update when property changes
    });
    valueContainer.addEventListener('change', updateCallback);

    populateValueContainer(valueContainer, key, value, mainController, shadowRoot);
 
    removeBtn.addEventListener('click', () => {
        // FIX: Instead of relying on a debounced save, we will perform an immediate, explicit save.
        // 1. Remove the visual element from the DOM.
        item.remove();

        // 2. Regenerate the overrides object from the now-modified UI.
        const newOverrides = getOverridesFromUI(shadowRoot);
        const newOverridesJson = Object.keys(newOverrides).length > 0 ? JSON.stringify(newOverrides) : '';

        // 3. Dispatch the 'tile-update' event directly to the parent Lit component.
        // This bypasses the debounce and ensures the deletion is saved immediately.
        shadowRoot.host.dispatchEvent(new CustomEvent('tile-update', {
            detail: { docId: mainController.allTiles[mainController.lastSelectedTileIndex].docId, data: { 'Overrides (JSON)': newOverridesJson } }
        }));
    });
}

function populateValueContainer(container, propertyName, value, mainController, shadowRoot) {
    container.innerHTML = '';

    const isColor = propertyName.toLowerCase().includes('color');
    const isOpacity = propertyName === 'opacity';
    const isShape = propertyName === 'shape';
    const isBoolean = propertyName === 'useStampByDefault';
    const isWidth = propertyName.toLowerCase().includes('width');
    const isScale = propertyName === 'stampScale';
    const isRotation = propertyName === 'stampRotation';
    const isImage = propertyName === 'stampImageUrl';

    let inputHtml = ''; // This will be our fallback

    if (isShape) {
        const options = styleSchema.shape.options.map(opt => `<option value="${opt}" ${String(value) === opt ? 'selected' : ''}>${opt}</option>`).join('');
        inputHtml = `<select class="override-value"><option value="">Default</option>${options}</select>`;
    } else if (isColor) {
        const compoundDiv = document.createElement('div');
        compoundDiv.className = 'form-field-compound';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = String(value) || '#000000';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'override-value color-text-input';
        textInput.value = String(value) || '#000000';

        // Use 'change' for text input to avoid firing on every keystroke
        textInput.addEventListener('change', (e) => {
            colorInput.value = e.target.value;
        });
        // Use 'input' for color picker for live feedback, but 'change' to trigger the save.
        colorInput.addEventListener('input', (e) => {
            textInput.value = e.target.value;
        });
        colorInput.addEventListener('change', () => updateOverridesJsonFromCurrentTile(mainController, shadowRoot));
        textInput.addEventListener('input', (e) => {
            let potentialColor = e.target.value;
            if (/^[0-9A-F]{6}$/i.test(potentialColor) || /^[0-9A-F]{3}$/i.test(potentialColor)) {
                potentialColor = '#' + potentialColor;
                e.target.value = potentialColor;
            }
        });

        compoundDiv.append(colorInput, textInput);
        container.appendChild(compoundDiv);
        return;
    } else if (isWidth) { // This is now a fallback, range sliders are preferred
        inputHtml = `<div class="form-field-compound">
                        <input type="number" class="override-value" value="${parseFloat(value) || 0}" data-unit="px" min="0" max="20" step="1">
                        <span style="margin-left: 5px;">px</span>
                     </div>`;
    } else if (isOpacity || isScale || isRotation) {
        let schema;
        if (isOpacity) {
            schema = { min: 0, max: 1, step: 0.01 };
        } else if (isScale) {
            schema = styleSchema.stampScale;
        } else { // isRotation
            schema = styleSchema.stampRotation;
        }
        const val = parseFloat(value) || schema.min;

        const compoundDiv = document.createElement('div');
        compoundDiv.className = 'form-field-compound';

        const rangeInput = document.createElement('input');
        rangeInput.type = 'range'; // This is the primary input
        rangeInput.className = 'override-slider'; // Helper input
        rangeInput.value = val;
        rangeInput.min = schema.min; rangeInput.max = schema.max; rangeInput.step = schema.step;

        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.className = 'override-value'; // Primary source of truth
        if (schema.unit) numberInput.dataset.unit = schema.unit;
        numberInput.style.width = '70px';
        numberInput.value = val;
        numberInput.min = schema.min; numberInput.max = schema.max; numberInput.step = schema.step;

        rangeInput.addEventListener('input', () => {
            numberInput.value = rangeInput.value;
        });
        // Use 'change' on the number input to prevent sync loops
        numberInput.addEventListener('change', () => {
            rangeInput.value = numberInput.value;
        });
        compoundDiv.append(rangeInput, numberInput, Object.assign(document.createElement('span'), { textContent: schema.unit || '' }));
        container.appendChild(compoundDiv);
        return; // Exit early as we've already appended the element
    } else if (isBoolean) {
        const isTrue = value === true || String(value).toLowerCase() === 'true';
        const isFalse = value === false || String(value).toLowerCase() === 'false';
        inputHtml = `<select class="override-value">
                        <option value="">Default</option>
                        <option value="true" ${isTrue ? 'selected' : ''}>True</option>
                        <option value="false" ${isFalse ? 'selected' : ''}>False</option>
                     </select>`;
    } else if (isImage) {
        const compoundDiv = document.createElement('div');
        compoundDiv.className = 'form-field-compound';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'override-value';
        textInput.placeholder = 'Image URL';
        textInput.value = value || '';

        compoundDiv.append(textInput);
        container.appendChild(compoundDiv);
        return;
    } else {
        inputHtml = `<input type="text" class="override-value" value="${value || ''}">`;
    }

    container.innerHTML = inputHtml;
}

export function handleRawJsonOverrideChange(event, mainController, shadowRoot) {
    console.log("[OverrideEditor] handleRawJsonOverrideChange called.");
    const textarea = event.target;
    if (!mainController) return;
    try {
        const jsonString = textarea.value;
        if (jsonString.trim() === '') {
            populateOverridesUI({}, mainController, shadowRoot);
            updateOverridesJsonFromCurrentTile(mainController, shadowRoot);
            textarea.style.borderColor = '';
            return;
        }
        const parsedOverrides = JSON.parse(jsonString);
        populateOverridesUI(parsedOverrides, mainController, shadowRoot);
        updateOverridesJsonFromCurrentTile(mainController, shadowRoot);
        textarea.style.borderColor = '';
    } catch (e) {
        textarea.style.borderColor = '#e57373';
    }
}

export function updateOverridesJsonFromCurrentTile(mainController, shadowRoot) {
    // FIX: Guard against missing controller
    if (!mainController) return;
    // This function now just updates the UI and textarea. The actual save is triggered
    // by the 'change' event on the textarea itself.
    const overrides = getOverridesFromUI(shadowRoot);
    const newOverridesJson = Object.keys(overrides).length > 0 ? JSON.stringify(overrides, null, 2) : '';
    const rawJsonTextarea = shadowRoot.getElementById('overrides-json-textarea');
    if (rawJsonTextarea) rawJsonTextarea.value = newOverridesJson;

    // NEW: Dispatch save event immediately so UI changes persist to Firestore
    if (shadowRoot.host) {
        shadowRoot.host.dispatchEvent(new CustomEvent('tile-update', {
            detail: { docId: mainController.allTiles[mainController.lastSelectedTileIndex].docId, data: { 'Overrides (JSON)': newOverridesJson } }
        }));
    }

    mainController.renderTiles();
}

export function createOverrideFieldset(mainController, shadowRoot) {
    console.log("[OverrideEditor] createOverrideFieldset called.");
    const fieldset = Object.assign(document.createElement('fieldset'), {
        className: 'overrides-fieldset',
        id: 'overrides-editor-container',
        style: 'grid-column: 1 / -1;',
    });

    const legend = document.createElement('legend');
    const legendText = Object.assign(document.createElement('span'), { textContent: 'Overrides (Advanced)' });
    const tooltip = Object.assign(document.createElement('span'), {
        className: 'tooltip-icon',
        textContent: '(?)',
        title: `Apply unique styles to this specific tile that override the global status styles.\n- Select a Status (e.g., 'Verified').\n- Select a Property (e.g., 'color').\n- Set the desired value.\nThis tile will now use your new color when it is 'Verified', instead of the global 'Verified' color.`
    });
    legend.append(legendText, tooltip);

    const content = Object.assign(document.createElement('div'), { className: 'fieldset-content' });
    content.innerHTML = `
        <div id="overrides-container" style="grid-column: 1 / -1;"></div>
        <button type="button" id="add-override-btn">+ Add Override</button>
        <div class="form-field" style="grid-column: 1 / -1;">
            <label for="overrides-json-textarea">Raw JSON (Saving happens on change/blur)</label>
            <textarea id="overrides-json-textarea" placeholder="You can also edit the raw JSON for the overrides here."></textarea>
        </div>
    `;
    fieldset.append(legend, content);
    return fieldset;
}