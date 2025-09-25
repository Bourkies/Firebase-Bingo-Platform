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
};

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function initializeOverrideEditor(mainController) {
    const debouncedUpdateOverrides = debounce(() => {
        if (mainController.lastSelectedTileIndex === null) return;
        const index = mainController.lastSelectedTileIndex;

        const overrides = {};
        document.querySelectorAll('#overrides-container .override-item').forEach(item => {
            const status = item.querySelector('.override-status-select').value;
            const key = item.querySelector('.override-key').value;
            const valueContainer = item.querySelector('.override-value-container');

            if (status && key && valueContainer.hasChildNodes()) {
                const inputElement = valueContainer.querySelector('.override-value');
                if (!inputElement) return;

                let value = inputElement.type === 'checkbox' ? inputElement.checked : inputElement.value;

                if (inputElement.dataset.unit) value += inputElement.dataset.unit;
                if (inputElement.tagName === 'SELECT' && value === '') return;
                if (!overrides[status]) overrides[status] = {};

                if (value === 'true') { overrides[status][key] = true; }
                else if (value === 'false') { overrides[status][key] = false; }
                else { overrides[status][key] = value; }
            }
        });

        const newOverridesJson = Object.keys(overrides).length > 0 ? JSON.stringify(overrides, null, 2) : '';
        document.getElementById('overrides-json-textarea').value = newOverridesJson;
        mainController.tilesData[index]['Overrides (JSON)'] = newOverridesJson;
        mainController.debouncedSaveTile(mainController.tilesData[index].docId, { 'Overrides (JSON)': newOverridesJson });
        mainController.renderTiles();
    }, 500);

    mainController.updateOverridesJsonFromCurrentTile = () => {
        debouncedUpdateOverrides();
    };
}

export function populateOverridesUI(overrides, mainController) {
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

    const updateCallback = () => mainController.updateOverridesJsonFromCurrentTile();
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
    } else if (isOpacity || isScale) {
        const schema = isOpacity ? { min: 0, max: 1, step: 0.01 } : styleSchema.stampScale;
        inputHtml = `<div class="form-field-compound">
                        <input type="range" class="override-value" value="${value || schema.min}" min="${schema.min}" max="${schema.max}" step="${schema.step}">
                        <span style="width: 40px; text-align: left;">${value || schema.min}</span>
                     </div>`;
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

    const rangeInput = container.querySelector('input[type="range"]');
    if (rangeInput) {
        rangeInput.addEventListener('input', (e) => {
            e.target.nextElementSibling.textContent = e.target.value;
        });
    }
}

export function handleRawJsonOverrideChange(event, mainController) {
    const textarea = event.target;
    try {
        const jsonString = textarea.value;
        if (jsonString.trim() === '') {
            populateOverridesUI({}, mainController);
            mainController.updateOverridesJsonFromCurrentTile();
            textarea.style.borderColor = '';
            return;
        }
        const parsedOverrides = JSON.parse(jsonString);
        populateOverridesUI(parsedOverrides, mainController);
        mainController.updateOverridesJsonFromCurrentTile();
        textarea.style.borderColor = '';
    } catch (e) {
        textarea.style.borderColor = '#e57373';
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