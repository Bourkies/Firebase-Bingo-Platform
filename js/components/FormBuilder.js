import { html } from 'lit';
/*
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

/*
 * Creates a single form field based on a schema definition.
 * @param {string} key - The property key for the field.
 * @param {object} schema - The schema object for this specific field.
 * @param {*} value - The current value for the field.
 * @param {object} [options={}] - Additional options.
 * @param {string} [options.status] - The status group for style fields.
 * @returns {HTMLDivElement} The container element for the form field.
 */
function createField(key, schema, value, options = {}) { // This is now a Lit template function
    const { status, data } = options; // data is the parent object (e.g., a specific status style object)

    const labelHtml = html`
        <label for=${`${status || 'global'}-${key}`}>
            ${schema.label}
            ${schema.description ? html`
                <span class="tooltip-icon" title=${schema.description}>(?)</span>
            ` : ''}
        </label>
    `;

    switch (schema.type) {
        case 'image': {
            const val = value ?? '';

            const textInput = document.createElement('input');
            textInput.type = 'text';
            textInput.dataset.key = key;
            if (status) textInput.dataset.status = status;
            textInput.value = val;
            textInput.placeholder = 'Image URL';

            // Lit can't easily handle this two-way binding with imperative listeners,
            // so we'll stick to a simple text input for now. The parent component handles updates.
            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <input type="text" .value=${val} data-key=${key} data-status=${status}>
                </div>
            `;
        }
        case 'textarea': {
            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <textarea .value=${value ?? ''} data-key=${key} data-status=${status}></textarea>
                </div>
            `;
        }
        case 'boolean': {
            const checked = value === true;
            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <input type="checkbox" .checked=${checked} data-key=${key} data-status=${status} style="width: auto;">
                </div>
            `;
        }
        case 'select': {
            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <select .value=${value} data-key=${key} data-status=${status}>
                        ${schema.options.map(opt => html`<option value=${opt} ?selected=${value === opt}>${opt}</option>`)}
                    </select>
                </div>
            `;
        }
        case 'range': {
            const val = parseFloat(value) || schema.min;
            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <div class="form-field-compound">
                        <input
                            type="range"
                            .value=${val}
                            min=${schema.min}
                            max=${schema.max}
                            step=${schema.step}
                            data-key=${key}
                            data-status=${status}
                            data-unit=${schema.unit}
                        >
                        <input
                            type="number"
                            .value=${val}
                            min=${schema.min}
                            max=${schema.max}
                            step=${schema.step}
                            data-key=${key}
                            data-status=${status}
                            style="width: 70px;"
                        >
                    </div>
                </div>
            `;
        }
        case 'colorAndOpacity': {
            const colorVal = data?.color ?? '#ffffff';
            const opacityVal = data?.opacity ?? 0.5;

            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <div class="form-field-compound" style="flex-direction: column; align-items: stretch; gap: 8px;">
                        <!-- Color Part -->
                        <div class="form-field-compound">
                            <input type="color" .value=${colorVal} data-key="color" data-status=${status}>
                            <input type="text" class="color-text-input" .value=${colorVal} data-key="color" data-status=${status}>
                        </div>
                        <!-- Opacity Part -->
                        <div class="form-field-compound">
                            <input
                                type="range"
                                .value=${opacityVal}
                                min="0" max="1" step="0.01"
                                data-key="opacity"
                                data-status=${status}
                            >
                            <input
                                type="number"
                                .value=${opacityVal}
                                min="0" max="1" step="0.01"
                                data-key="opacity"
                                data-status=${status}
                                style="width: 70px;"
                            >
                        </div>
                    </div>
                </div>
            `;
        }
        case 'widthAndColor': {
            const widthKey = schema.keys.width;
            const colorKey = schema.keys.color;
            const unit = schema.unit || '';
            const widthVal = parseFloat(data?.[widthKey]) || 0;
            const colorVal = data?.[colorKey] ?? '#000000';

            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <div class="form-field-compound">
                        <input
                            type="number"
                            .value=${widthVal}
                            min="0" max="20" step="1"
                            data-key=${widthKey}
                            data-status=${status}
                            data-unit=${unit}
                            style="max-width: 70px;"
                        >
                        <span style="width: 30px; text-align: left; margin-left: 5px;">${unit}</span>
                        <input type="color" .value=${colorVal} data-key=${colorKey} data-status=${status}>
                        <input type="text" class="color-text-input" .value=${colorVal} data-key=${colorKey} data-status=${status}>
                    </div>
                </div>
            `;
        }
        case 'text':
        default:
            return html`
                <div class="form-field" data-key=${key}>
                    ${labelHtml}
                    <input
                        type="text"
                        .value=${value ?? ''}
                        name=${key}
                        data-key=${key}
                        data-status=${status}
                        ?disabled=${schema.disabled}
                    >
                </div>
            `;
    }
}

/*
 * Creates and populates a set of form fields within a given container.
 * @param {HTMLElement} container - The DOM element to append the fields to.
 * @param {object} schema - The schema object describing the fields.
 * @param {object} data - The data object with current values.
 * @param {string[]} properties - An array of keys from the schema to render.
 * @param {object} [options={}] - Additional options for field creation.
 */
export function createFormFields(schema, data, properties, options = {}) {
    return properties.map(prop => {
        const propSchema = schema[prop];
        if (!propSchema) return null;

        const value = data[prop] ?? (propSchema.type === 'range' ? propSchema.min : '');
        // Pass the parent `data` object for compound fields like colorAndOpacity
        return createField(prop, propSchema, value, { ...options, data });
    }).filter(field => field !== null);
}