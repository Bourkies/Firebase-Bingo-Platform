import { LitElement, html, css } from 'lit';
import { createFormFields } from './FormBuilder.js';
import './BingoTile.js';

const configSchema = {
    pageTitle: { label: 'Page Title', type: 'text', description: 'The title displayed at the top of the bingo page and in the browser tab.' },
    boardImageUrl: { label: 'Board Background Image', type: 'image', description: 'A direct web URL to the bingo board background image.' },
    maxPageWidth: { label: 'Max Page Width', type: 'text', description: 'The maximum width for the page content. Use px or % (e.g., 1400px or 90%).' },
    showTileNames: { label: 'Show Tile Names', type: 'boolean', description: 'Set to TRUE to display tile names on the board by default, especially if no background image is used.' },
    unlockOnVerifiedOnly: { label: 'Unlock on Verified Only', type: 'boolean', description: 'Set to TRUE to require a tile to be "Verified" by an admin before its prerequisites are met for other tiles.' },
    scoreOnVerifiedOnly: { label: 'Score on Verified Only', type: 'boolean', description: 'Set to TRUE to only count points for "Verified" tiles on the scoreboard and overview.' },
    showScoreboard: { label: 'Show Scoreboard (Player Page)', type: 'boolean', description: 'Set to TRUE to display the team scoreboard at the bottom of the player page.' },
    enableOverviewPage: { label: 'Enable Public Overview Page', type: 'boolean', description: 'Set to TRUE to show the "Overview" link in the navbar for everyone. Admins can always see it.' },
    boardVisibility: { label: 'Board Visibility', type: 'select', options: ['public', 'private'], description: 'If "private", players can only see their own team\'s board state unless they are an admin.' },
    censorTilesBeforeEvent: { label: 'Censor Tiles Pre-Event', type: 'boolean', description: 'Set to TRUE to hide tile names and descriptions from all non-admins. Requires syncing the public layout below.' },
    setupModeEnabled: { label: 'Enable Setup Mode', type: 'boolean', description: 'Set to TRUE to hide the board from all non-admins. Admins will see a warning but can view the board normally.' },
    evidenceFieldLabel: { label: 'Evidence Field Label', type: 'text', description: 'The text label displayed above the evidence submission inputs in the modal.' },
    loadFirstTeamByDefault: { label: 'Load First Team by Default', type: 'boolean', description: 'Set to TRUE to automatically load the first team in the list on the player page, instead of showing "Select a Team...".' },
    promptForDisplayNameOnLogin: { label: 'Prompt for Display Name', type: 'boolean', description: 'Set to TRUE to show a welcome modal on first login, prompting users to set a custom display name.' },
    welcomeMessage: { label: 'Welcome Message', type: 'textarea', description: 'The message shown in the welcome modal. Use {displayName} as a placeholder for the user\'s current name.' },
};

const styleSchema = {
    shape: { label: 'Tile Shape', type: 'select', options: ['Square', 'Ellipse', 'Circle', 'Diamond', 'Triangle', 'Hexagon'], description: 'The overall shape of the tiles.' },
    fill: { label: 'Tile Fill', type: 'colorAndOpacity', description: 'The background color and opacity for the tile.' },
    border: { label: 'Border', type: 'widthAndColor', keys: { width: 'borderWidth', color: 'borderColor' }, unit: 'px', description: 'The tile\'s border width and color.' },
    hoverBorder: { label: 'Hover Border', type: 'widthAndColor', keys: { width: 'hoverBorderWidth', color: 'hoverBorderColor' }, unit: 'px', description: 'The border width and color on hover.' },
    useStampByDefault: { label: 'Use Stamp', type: 'boolean', description: 'Toggles the use of a stamp image for this status. When enabled, the settings below will apply.' },
    stampImageUrl: { label: 'Stamp Image', type: 'image', description: 'URL for the stamp image to display on tiles.' },
    stampScale: { label: `Stamp Scale`, type: 'range', min: 0, max: 3, step: 0.05, description: 'Size multiplier for the stamp (e.g., 1 is 100%, 0.5 is 50%).' },
    stampRotation: { label: `Stamp Rotation`, type: 'range', min: 0, max: 360, step: 1, unit: 'deg', description: 'Rotation of the stamp in degrees.' },
    stampPosition: { label: `Stamp Position`, type: 'text', description: 'CSS background-position value for the stamp (e.g., "center", "top left", "50% 50%").' }
};

const configGroups = {
    'Board Configuration': ['pageTitle', 'boardImageUrl', 'maxPageWidth', 'showTileNames', 'evidenceFieldLabel', 'loadFirstTeamByDefault'],
    'User Experience': ['promptForDisplayNameOnLogin', 'welcomeMessage'],
    'Rules & Visibility': ['unlockOnVerifiedOnly', 'scoreOnVerifiedOnly', 'showScoreboard', 'enableOverviewPage', 'boardVisibility', 'censorTilesBeforeEvent', 'setupModeEnabled'],
};

const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];

export class GlobalConfigForm extends LitElement {
    static styles = css`
        :host { display: block; }
        .config-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .overrides-fieldset { grid-column: 1 / -1; border: 1px solid #444; border-radius: 4px; padding: 10px 15px; margin-top: 10px; }
        .overrides-fieldset legend { color: var(--accent-color); }
        .stamp-fieldset { border: 1px solid #444; border-radius: 4px; padding: 10px 15px; }
        .stamp-fieldset legend { color: var(--accent-color); }
        .preview-container { display: flex; justify-content: center; align-items: center; margin-bottom: 1rem; padding: 1rem; background-color: #1a1a1a; border-radius: 6px; }
    `;
    // FIX: Consolidate all styles into a single declaration and add missing global styles.
    static styles = [GlobalConfigForm.styles, css`
        .image-upload-preview { max-width: 100px; max-height: 50px; object-fit: contain; margin-top: 5px; border: 1px solid var(--border-color); background-color: var(--bg-color); border-radius: 4px; }

        /* Generic input styles that were previously global */
        input, textarea, select { width: 100%; padding: 8px; box-sizing: border-box; background-color: var(--bg-color); color: var(--primary-text); border: 1px solid var(--border-color); border-radius: 4px; }
        textarea { resize: vertical; min-height: 80px; }
        .form-field { display: flex; flex-direction: column; }
        .form-field label { margin-bottom: 5px; font-size: 14px; color: var(--secondary-text); }
        .form-field-compound { display: flex; align-items: center; gap: 10px; }
        .form-field-compound input[type="color"] { padding: 0; height: 38px; width: 38px; flex-shrink: 0; border: none; }
        .color-text-input { font-family: monospace; flex-grow: 1; }
        .tooltip-icon { margin-left: 8px; color: var(--secondary-text); cursor: help; font-size: 0.8em; font-weight: normal; border-bottom: 1px dotted var(--secondary-text); display: inline-block; }
    `];

    static properties = {
        config: { type: Object },
        allStyles: { type: Object },
        mainController: { type: Object },
        isVisible: { type: Boolean, reflect: true }
    };

    constructor() {
        super();
        console.log('[GlobalConfigForm] constructor: Component instance created.');
        this.config = {};
        this.allStyles = {};
        this.mainController = {};
        this.isVisible = true;
    }

    firstUpdated() {
        console.log('[GlobalConfigForm] firstUpdated: Component first rendered, calling renderFormContents.');
        this.renderFormContents();
    }

    updated(changedProperties) {
        console.log(`[GlobalConfigForm] updated: Properties changed: ${Array.from(changedProperties.keys()).join(', ')}`);
        // FIX: Only re-render the form if it's being populated for the first time.
        // This prevents the form from resetting itself due to its own updates coming back from the server.
        const wasUnpopulated = !changedProperties.get('config') || Object.keys(changedProperties.get('config')).length === 0;
        const isPopulated = this.config && Object.keys(this.config).length > 0;
        if (wasUnpopulated && isPopulated) {
            console.log('[GlobalConfigForm] updated: Config data received for the first time, re-rendering form contents.');
            this.renderFormContents();
        }
    }

    renderFormContents() {
        console.log('[GlobalConfigForm] renderFormContents: Starting to build form from schema.');
        const formContainer = this.shadowRoot.getElementById('form-container');
        if (!formContainer || !this.config || !this.allStyles) {
            console.warn('[GlobalConfigForm] renderFormContents: Aborting render, missing container or data.', { hasContainer: !!formContainer, hasConfig: !!this.config, hasStyles: !!this.allStyles });
            return;
        }

        formContainer.innerHTML = '<p>Edit the global configuration below. Image fields support direct uploads. Changes will be reflected on the board live.</p>';

        for (const [groupName, properties] of Object.entries(configGroups)) {
            const fieldset = document.createElement('fieldset');
            fieldset.className = 'overrides-fieldset';
            fieldset.append(Object.assign(document.createElement('legend'), { textContent: groupName }));
            const contentDiv = document.createElement('div');
            contentDiv.className = 'config-grid';
            fieldset.appendChild(contentDiv);
            createFormFields(contentDiv, configSchema, this.config, properties, {
                flashField: (el) => this.mainController.flashField(el)
            });
            formContainer.appendChild(fieldset);
        }

        const stylesFieldset = document.createElement('fieldset');
        stylesFieldset.className = 'overrides-fieldset';
        stylesFieldset.append(Object.assign(document.createElement('legend'), { textContent: 'Tile Status Styles' }));
        const stylesContent = document.createElement('div');
        stylesContent.className = 'config-grid';
        stylesFieldset.appendChild(stylesContent);

        STATUSES.forEach(status => {
            const statusData = this.allStyles[status] || {};
            const statusFieldset = document.createElement('fieldset');
            statusFieldset.className = 'stamp-fieldset';
            statusFieldset.append(Object.assign(document.createElement('legend'), { textContent: status }));
            
            const previewContainer = document.createElement('div');
            previewContainer.className = 'preview-container';
            const mockTile = { id: 'Preview' };
            const tileEl = document.createElement('bingo-tile');
            tileEl.tile = mockTile;
            tileEl.status = status;
            tileEl.config = this.config;
            tileEl.allStyles = this.allStyles;
            tileEl.isSetupPreview = true;
            previewContainer.appendChild(tileEl);
            statusFieldset.appendChild(previewContainer);

            const statusContent = document.createElement('div');
            statusContent.className = 'config-grid';
            statusFieldset.appendChild(statusContent);
            createFormFields(statusContent, styleSchema, statusData, Object.keys(styleSchema), { status });
            stylesContent.appendChild(statusFieldset);
        });

        formContainer.appendChild(stylesFieldset);
    }

    handleFormUpdate(event) {
        console.log(`[GlobalConfigForm] handleFormUpdate: Event type '${event.type}' on target:`, event.target);
        const input = event.target;
        const key = input.dataset.key;
        if (!key) return;

        const status = input.dataset.status;
        let newValue = input.type === 'checkbox' ? input.checked : input.value;

        // --- Live Preview & Sync ---
        // Sync number input and slider
        if (input.type === 'range') {
            const numberInput = this.shadowRoot.querySelector(`input[type="number"][data-key="${key}"][data-status="${status || ''}"]`);
            if (numberInput) numberInput.value = newValue;
        } else if (input.type === 'number' && input.validity.valid) { // Only sync if the number is valid
            const rangeInput = this.shadowRoot.querySelector(`input[type="range"][data-key="${key}"][data-status="${status || ''}"]`);
            if (rangeInput) rangeInput.value = newValue;
        }

        // Dispatch preview event for real-time updates on the board
        this.dispatchEvent(new CustomEvent('config-preview-change', { detail: { status, key, value: newValue } }));

        // --- Debounced Save ---
        // This will be called on both 'input' and 'change' events.
        // The debounce ensures we don't spam the server.
        debouncedSave(this, {
            status,
            key,
            value: newValue,
            isNumeric: input.type === 'number',
            unit: input.dataset.unit
        });
    }

    render() {
        console.log(`[GlobalConfigForm] render: Rendering component. isVisible: ${this.isVisible}`);
        return html`
            <div id="form-container" @input=${this.handleFormUpdate} @change=${this.handleFormUpdate} style="display: ${this.isVisible ? 'block' : 'none'}"></div>
        `;
    }
}

customElements.define('global-config-form', GlobalConfigForm);

// --- Debounced save logic ---
const debouncedSave = debounce((component, detail) => {
    let finalValue = detail.value;
    // On save, we parse the final value to a number if needed.
    if (detail.isNumeric && typeof finalValue === 'string' && finalValue.trim() !== '') {
        finalValue = parseFloat(finalValue) || 0;
    }
    // Add unit AFTER parsing, if applicable.
    if (detail.unit) {
        finalValue = `${finalValue}${detail.unit}`;
    }
    component.dispatchEvent(new CustomEvent('config-change', {
        detail: { status: detail.status, key: detail.key, value: finalValue }
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