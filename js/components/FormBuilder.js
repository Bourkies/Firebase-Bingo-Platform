/**
 * @file FormBuilder.js
 * A utility to programmatically create and populate form fields from a schema.
 * This centralizes form generation logic, especially for the setup page.
 */

/**
 * Creates a tooltip icon if a description is provided in the schema.
 * @param {string|undefined} description - The tooltip text.
 * @returns {HTMLSpanElement|null} The tooltip element or null.
 */
function createTooltip(description) {
    if (!description) return null;
    const tooltipSpan = document.createElement('span');
    tooltipSpan.className = 'tooltip-icon';
    tooltipSpan.textContent = '(?)';
    tooltipSpan.title = description;
    return tooltipSpan;
}

/**
 * Creates a single form field based on a schema definition.
 * @param {string} key - The property key for the field.
 * @param {object} schema - The schema object for this specific field.
 * @param {*} value - The current value for the field.
 * @param {object} [options={}] - Additional options.
 * @param {string} [options.status] - The status group for style fields.
 * @returns {HTMLDivElement} The container element for the form field.
 */
function createField(key, schema, value, options = {}) {
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'form-field';
    fieldContainer.dataset.key = key;

    const label = document.createElement('label');
    label.textContent = schema.label;
    const tooltip = createTooltip(schema.description);
    if (tooltip) label.appendChild(tooltip);
    fieldContainer.appendChild(label);

    const { status, data } = options;

    switch (schema.type) {
        case 'image': {
            const fileInputId = `file-upload-${key}-${status || 'global'}`;
            const val = value ?? '';

            const compoundDiv = document.createElement('div');
            compoundDiv.className = 'form-field-compound';

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.className = 'config-input';
            textInput.dataset.key = key;
            if (status) textInput.dataset.status = status;
            textInput.value = val;
            textInput.placeholder = 'Image URL';
            textInput.style.flexGrow = '1';

            const uploadLabel = document.createElement('label');
            uploadLabel.htmlFor = fileInputId;
            uploadLabel.className = 'button-like-label';
            uploadLabel.textContent = 'Upload';

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = fileInputId;
            fileInput.dataset.key = key;
            if (status) fileInput.dataset.status = status;
            fileInput.dataset.path = schema.path;
            fileInput.style.display = 'none';

            const previewImg = document.createElement('img');
            previewImg.src = val;
            previewImg.className = 'image-upload-preview';
            previewImg.style.display = val ? 'block' : 'none';

            // Event listener to update preview when URL is typed
            textInput.addEventListener('input', () => {
                previewImg.src = textInput.value;
                previewImg.style.display = textInput.value ? 'block' : 'none';
            });

            compoundDiv.append(textInput, uploadLabel, fileInput);
            fieldContainer.append(compoundDiv, previewImg);
            break;
        }
        case 'textarea': {
            const textarea = document.createElement('textarea');
            textarea.className = 'config-input';
            textarea.dataset.key = key;
            if (status) textarea.dataset.status = status;
            textarea.textContent = value ?? '';
            fieldContainer.appendChild(textarea);
            break;
        }
        case 'boolean': {
            const checked = value === true;
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'config-input';
            input.dataset.key = key;
            if (status) input.dataset.status = status;
            input.checked = checked;
            fieldContainer.appendChild(input);
            break;
        }
        case 'select': {
            const optionsHtml = schema.options.map(opt => `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`).join('');
            const select = document.createElement('select');
            select.className = 'config-input';
            select.dataset.key = key;
            if (status) select.dataset.status = status;
            select.innerHTML = optionsHtml;
            fieldContainer.appendChild(select);
            break;
        }
        case 'range': {
            const val = value ?? schema.min;
            const compoundDiv = document.createElement('div');
            compoundDiv.className = 'form-field-compound';

            const rangeInput = document.createElement('input');
            rangeInput.type = 'range';
            rangeInput.className = 'config-input';
            rangeInput.dataset.key = key;
            if (status) rangeInput.dataset.status = status;
            rangeInput.value = val;
            rangeInput.min = schema.min;
            rangeInput.max = schema.max;
            rangeInput.step = schema.step;

            const valueSpan = document.createElement('span');
            valueSpan.style.width = '40px';
            valueSpan.style.textAlign = 'left';
            valueSpan.textContent = val;

            rangeInput.addEventListener('input', () => {
                valueSpan.textContent = rangeInput.value;
            });

            compoundDiv.append(rangeInput, valueSpan);
            fieldContainer.appendChild(compoundDiv);
            break;
        }
        case 'colorAndOpacity': {
            const colorVal = data?.color ?? '#ffffff';
            const opacityVal = data?.opacity ?? 0.5;

            const wrapper = document.createElement('div');
            wrapper.className = 'form-field-compound';
            wrapper.style.cssText = 'flex-direction: column; align-items: stretch; gap: 8px;';

            // Color part
            const colorDiv = document.createElement('div');
            colorDiv.className = 'form-field-compound';
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.dataset.status = status;
            colorInput.dataset.key = 'color';
            colorInput.value = colorVal;
            const colorText = document.createElement('input');
            colorText.type = 'text';
            colorText.className = 'config-input color-text-input';
            colorText.dataset.status = status;
            colorText.dataset.key = 'color';
            colorText.value = colorVal;
            colorInput.addEventListener('input', () => colorText.value = colorInput.value);
            colorText.addEventListener('input', () => colorInput.value = colorText.value);
            colorDiv.append(colorInput, colorText);

            // Opacity part
            const opacityDiv = document.createElement('div');
            opacityDiv.className = 'form-field-compound';
            const opacityInput = document.createElement('input');
            opacityInput.type = 'range';
            opacityInput.className = 'config-input';
            opacityInput.dataset.status = status;
            opacityInput.dataset.key = 'opacity';
            opacityInput.value = opacityVal;
            opacityInput.min = 0; opacityInput.max = 1; opacityInput.step = 0.01;
            const opacitySpan = document.createElement('span');
            opacitySpan.style.cssText = 'width: 40px; text-align: left; margin-left: 10px;';
            opacitySpan.textContent = opacityVal;
            opacityInput.addEventListener('input', () => opacitySpan.textContent = opacityInput.value);
            opacityDiv.append(opacityInput, opacitySpan);

            wrapper.append(colorDiv, opacityDiv);
            fieldContainer.appendChild(wrapper);
            break;
        }
        case 'widthAndColor': {
            const widthKey = schema.keys.width;
            const colorKey = schema.keys.color;
            const unit = schema.unit || '';
            const widthVal = parseFloat(data?.[widthKey]) || 0;
            const colorVal = data?.[colorKey] ?? '#000000';

            const compoundDiv = document.createElement('div');
            compoundDiv.className = 'form-field-compound';

            const widthInput = document.createElement('input');
            widthInput.type = 'number';
            widthInput.className = 'config-input';
            widthInput.dataset.status = status;
            widthInput.dataset.key = widthKey;
            widthInput.value = widthVal;
            widthInput.min = 0; widthInput.max = 20; widthInput.step = 1;
            widthInput.dataset.unit = unit;
            widthInput.style.maxWidth = '70px';

            const unitSpan = document.createElement('span');
            unitSpan.style.cssText = 'width: 30px; text-align: left; margin-left: 5px;';
            unitSpan.textContent = unit;

            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.dataset.status = status;
            colorInput.dataset.key = colorKey;
            colorInput.value = colorVal;

            const colorText = document.createElement('input');
            colorText.type = 'text';
            colorText.className = 'config-input color-text-input';
            colorText.dataset.status = status;
            colorText.dataset.key = colorKey;
            colorText.value = colorVal;

            colorInput.addEventListener('input', () => colorText.value = colorInput.value);
            colorText.addEventListener('input', () => colorInput.value = colorText.value);

            compoundDiv.append(widthInput, unitSpan, colorInput, colorText);
            fieldContainer.appendChild(compoundDiv);
            break;
        }
        case 'text':
        default:
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'config-input';
            input.name = key; // Add name for easier form handling
            input.dataset.key = key;
            if (status) input.dataset.status = status;
            input.value = value ?? '';
            fieldContainer.appendChild(input);
            break;
    }
    return fieldContainer;
}

/**
 * Creates and populates a set of form fields within a given container.
 * @param {HTMLElement} container - The DOM element to append the fields to.
 * @param {object} schema - The schema object describing the fields.
 * @param {object} data - The data object with current values.
 * @param {string[]} properties - An array of keys from the schema to render.
 * @param {object} [options={}] - Additional options for field creation.
 */
export function createFormFields(container, schema, data, properties, options = {}) {
    properties.forEach(prop => {
        const propSchema = schema[prop];
        if (!propSchema) return;

        // Use name for form.elements access, but data-key for our logic
        const value = data[prop] ?? (propSchema.type === 'range' ? propSchema.min : '');
        const field = createField(prop, propSchema, value, { ...options, data });
        container.appendChild(field);
    });
}