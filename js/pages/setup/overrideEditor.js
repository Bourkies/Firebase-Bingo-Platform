/* overrideEditor.js */
import * as configManager from '../../core/data/configManager.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';

const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

let debouncedUpdateOverrides;

export function initializeOverrideEditor(mainController) {
    console.log("overrideEditor: Initializing...");
    debouncedUpdateOverrides = debounce((mainController) => {
        if (!mainController) return; // Guard against missing controller
        const index = mainController.lastSelectedTileIndex;
        const overridesContainer = document.getElementById('overrides-container');
        
        if (index === null || !mainController.tilesData || !mainController.tilesData[index] || !overridesContainer) return;

        const overrides = {};
        document.querySelectorAll('#overrides-container .override-item').forEach(item => {
            const status = item.querySelector('.override-status-select').value;
            const key = item.querySelector('.override-key').value;
            const valueEl = item.querySelector('.override-value');

            if (!status || !key || !valueEl) return;

            let value = valueEl.type === 'checkbox' ? valueEl.checked : valueEl.value;
            if (valueEl.dataset.unit) value += valueEl.dataset.unit;
            if (valueEl.tagName === 'SELECT' && value === '') return;

            if (!overrides[status]) overrides[status] = {};

            if (value === 'true') overrides[status][key] = true;
            else if (value === 'false') overrides[status][key] = false;
            else overrides[status][key] = value;
        });

        const newOverridesJson = Object.keys(overrides).length > 0 ? JSON.stringify(overrides, null, 2) : '';
        const textarea = document.getElementById('overrides-json-textarea');
        if (textarea) textarea.value = newOverridesJson;

        mainController.debouncedSaveTile(mainController.tilesData[index].docId, { 'Overrides (JSON)': newOverridesJson }, mainController);
        mainController.renderTiles();
    }, 500);
}

export function populateOverridesUI(overrides, mainController) {
    console.log("overrideEditor: populateOverridesUI called.");
    if (!document.getElementById('overrides-container')) return;
    const container = document.getElementById('overrides-container');
    container.innerHTML = '';
    if (typeof overrides !== 'object' || overrides === null) return;

    for (const [status, properties] of Object.entries(overrides)) {
        if (typeof properties === 'object' && properties !== null) {
            for (const [key, value] of Object.entries(properties)) {
                addOverrideRow(status, key, value, mainController);
            }
        }
    }
}

export function addOverrideRow(status = '', key = '', value = '', mainController) {
    console.log(`overrideEditor: addOverrideRow called for ${status}, ${key}`);
    if (!document.getElementById('overrides-container')) return;
    const container = document.getElementById('overrides-container');
    const item = document.createElement('div');
    item.className = 'override-item';

    const statusSelect = document.createElement('select');
    statusSelect.className = 'override-status-select';
    statusSelect.innerHTML = `<option value="">Select Status</option>`;
    STATUSES.forEach(s => {
        statusSelect.innerHTML += `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`;
    });

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

    // FIX: Pass mainController to the update callback
    const updateCallback = () => updateOverridesJsonFromCurrentTile(mainController);
    statusSelect.addEventListener('change', updateCallback);
    keySelect.addEventListener('change', () => {
        populateValueContainer(valueContainer, keySelect.value, '');
        updateCallback();
    });
    valueContainer.addEventListener('input', updateCallback);

    populateValueContainer(valueContainer, key, value);

    removeBtn.addEventListener('click', () => {
        item.remove();
        updateCallback();
    });
}

function populateValueContainer(container, propertyName, value) {
    container.innerHTML = '';

    const isColor = propertyName.toLowerCase().includes('color');
    const isOpacity = propertyName === 'opacity';
    const isShape = propertyName === 'shape';
    const isBoolean = propertyName === 'useStampByDefault';
    const isWidth = propertyName.toLowerCase().includes('width');
    const isScale = propertyName === 'stampScale';
    const isRotation = propertyName === 'stampRotation';
    const isImage = propertyName === 'stampImageUrl';

    let inputHtml = '';

    if (isShape) {
        const options = styleSchema.shape.options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('');
        inputHtml = `<select class="override-value"><option value="">Default</option>${options}</select>`;
    } else if (isColor) {
        const compoundDiv = document.createElement('div');
        compoundDiv.className = 'form-field-compound';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = value || '#000000';

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'override-value color-text-input';
        textInput.value = value || '#000000';

        colorInput.addEventListener('change', (e) => {
            textInput.value = e.target.value;
            textInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        textInput.addEventListener('input', (e) => {
            let potentialColor = e.target.value;
            if (/^[0-9A-F]{6}$/i.test(potentialColor) || /^[0-9A-F]{3}$/i.test(potentialColor)) {
                potentialColor = '#' + potentialColor;
                e.target.value = potentialColor;
            }
            colorInput.value = potentialColor;
        });

        compoundDiv.append(colorInput, textInput);
        container.appendChild(compoundDiv);
        return;
    } else if (isWidth) {
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
        // FIX: Parse the float value to handle units like 'deg'.
        // The number input box will clear if it's given a non-numeric string.
        const val = parseFloat(value) || schema.min;

        const compoundDiv = document.createElement('div');
        compoundDiv.className = 'form-field-compound';

        const rangeInput = document.createElement('input');
        rangeInput.type = 'range';
        rangeInput.className = 'override-value'; // This triggers the update
        rangeInput.value = val;
        if (schema.unit) rangeInput.dataset.unit = schema.unit;
        rangeInput.min = schema.min; rangeInput.max = schema.max; rangeInput.step = schema.step;

        const numberInput = document.createElement('input');
        numberInput.type = 'number';
        numberInput.style.width = '70px';
        numberInput.value = val;
        numberInput.min = schema.min; numberInput.max = schema.max; numberInput.step = schema.step;

        rangeInput.addEventListener('input', () => numberInput.value = rangeInput.value);
        numberInput.addEventListener('input', () => {
            rangeInput.value = numberInput.value;
            rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        compoundDiv.append(rangeInput, numberInput);
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
        textInput.style.flexGrow = '1';

        const fileInputId = `override-upload-${Date.now()}-${Math.random()}`;
        const uploadLabel = document.createElement('label');
        uploadLabel.htmlFor = fileInputId;
        uploadLabel.className = 'button-like-label';
        uploadLabel.textContent = 'Upload';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = fileInputId;
        fileInput.style.display = 'none';
        fileInput.dataset.path = 'overrides/stamps/';
        fileInput.addEventListener('change', (e) => handleOverrideImageUpload(e.target, textInput));

        compoundDiv.append(textInput, uploadLabel, fileInput);
        container.appendChild(compoundDiv);
        return;
    } else {
        inputHtml = `<input type="text" class="override-value" value="${value || ''}">`;
    }

    container.innerHTML = inputHtml;
}

export function handleRawJsonOverrideChange(event, mainController) {
    console.log("overrideEditor: handleRawJsonOverrideChange called.");
    const textarea = event.target;
    if (!mainController) return;
    try {
        const jsonString = textarea.value;
        if (jsonString.trim() === '') {
            populateOverridesUI({}, mainController);
            updateOverridesJsonFromCurrentTile(mainController);
            textarea.style.borderColor = '';
            return;
        }
        const parsedOverrides = JSON.parse(jsonString);
        populateOverridesUI(parsedOverrides, mainController);
        updateOverridesJsonFromCurrentTile(mainController);
        textarea.style.borderColor = '';
    } catch (e) {
        textarea.style.borderColor = '#e57373';
    }
}

export function updateOverridesJsonFromCurrentTile(mainController) {
    // FIX: Guard against missing controller
    if (!mainController) return;
    if (debouncedUpdateOverrides) {
        debouncedUpdateOverrides(mainController);
    }
}

async function handleOverrideImageUpload(fileInput, textInput) {
    const file = fileInput.files[0];
    if (!file) return;
    const storagePath = fileInput.dataset.path;

    showGlobalLoader();
    const oldUrl = textInput.value;

    try {
        const url = await configManager.uploadImage(storagePath, file, oldUrl);
        textInput.value = url;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        showMessage(`Uploaded ${file.name}`, false);
    } catch (error) {
        showMessage(`Upload failed: ${error.message}`, true);
    } finally {
        hideGlobalLoader();
    }
}

export function createOverrideFieldset(mainController) {
    console.log("overrideEditor: createOverrideFieldset called.");
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
        <button type="button" id="add-override-btn" disabled>+ Add Override</button>
        <div class="form-field" style="grid-column: 1 / -1;">
            <label for="overrides-json-textarea">Raw JSON</label>
            <textarea id="overrides-json-textarea" placeholder="You can also edit the raw JSON for the overrides here."></textarea>
        </div>
    `;
    fieldset.append(legend, content);
    return fieldset;
}