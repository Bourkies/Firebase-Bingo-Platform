/* globalconfigEditor.js */
import { createFormFields } from '../../components/FormBuilder.js';
import { createTileElement } from '../../components/TileRenderer.js';
import * as configManager from '../../core/data/configManager.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';

let config = {}, allStyles = {};

const configSchema = {
    // Global Config Fields
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
    'Rules & Visibility': ['unlockOnVerifiedOnly', 'scoreOnVerifiedOnly', 'showScoreboard', 'enableOverviewPage', 'boardVisibility', 'censorTilesBeforeEvent'],
};

const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];

async function saveConfig(key, value) {
    try {
        await configManager.updateConfig({ [key]: value });
        const fieldLabel = configSchema[key]?.label || key;
        const displayValue = String(value).length > 50 ? String(value).substring(0, 47) + '...' : value;
        showMessage(`Saved ${fieldLabel}: ${displayValue}`, false);
    } catch (err) {
        showMessage(`Error saving config: ${err.message}`, true);
        renderGlobalConfig();
    }
}

async function saveStyle(status, key, value) {
    try {
        await configManager.updateStyle(status, { [key]: value });
        const fieldLabel = styleSchema[key]?.label || key;
        const displayValue = String(value).length > 50 ? String(value).substring(0, 47) + '...' : value;
        showMessage(`Saved ${status} ${fieldLabel}: ${displayValue}`, false);
    } catch (err) {
        showMessage(`Error saving style ${status}: ${err.message}`, true);
        renderGlobalConfig();
    }
}

export function initializeGlobalConfig(mainController) {
    const toggleGlobalStylesBtn = document.getElementById('toggle-global-styles-btn');

    console.log("[GlobalConfigEditor] Initializing...");
    toggleGlobalStylesBtn?.addEventListener('click', toggleGlobalStyles);
    // REFACTOR: Use 'change' event instead of 'input' for more deliberate saves.
    document.getElementById('global-style-form')?.addEventListener('change', (e) => handleGlobalConfigChange(e, mainController));
    toggleGlobalStyles();
}

export function updateGlobalConfigData(newConfig, newStyles) {
    config = newConfig;
    allStyles = newStyles;
}

export function renderGlobalConfig(mainController) {
    console.log("[GlobalConfigEditor] renderGlobalConfig called.");
    const formContainer = document.getElementById('global-style-form');
    const activeElementId = document.activeElement?.id;
    if (!formContainer || !config) return; // Guard against running before config is loaded

    formContainer.innerHTML = '<p>Edit the global configuration below. Image fields support direct uploads. Changes will be reflected on the board live.</p>';

    for (const [groupName, properties] of Object.entries(configGroups)) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'overrides-fieldset';
        fieldset.append(Object.assign(document.createElement('legend'), { textContent: groupName }));
        const contentDiv = document.createElement('div');
        contentDiv.className = 'config-grid';
        fieldset.appendChild(contentDiv);
        createFormFields(contentDiv, configSchema, config, properties, {
            // Pass the flashField utility to FormBuilder
            flashField: (el) => mainController.flashField(el)
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
        const statusData = allStyles[status] || {};
        const statusFieldset = document.createElement('fieldset');
        statusFieldset.className = 'stamp-fieldset';
        statusFieldset.append(Object.assign(document.createElement('legend'), { textContent: status }));
        const statusContent = document.createElement('div');

        // NEW: Create and add a preview tile for this status
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; margin-bottom: 1rem; padding: 1rem; background-color: #1a1a1a; border-radius: 6px;';
        const mockTile = { id: 'Preview' };
        // FIX: Pass the correct baseClass for the setup page so the preview tile
        // inherits the correct border styles from the .draggable-tile CSS rules.
        const tileEl = createTileElement(mockTile, status, config, allStyles, { baseClass: 'draggable-tile' });
 
        // Override absolute positioning to make it fit in the form flow
        tileEl.style.position = 'relative';
        tileEl.style.width = '80px';
        tileEl.style.height = '80px';
        tileEl.style.left = 'auto';
        tileEl.style.top = 'auto';
        tileEl.style.cursor = 'default';
 
        if (config.showTileNames && !tileEl.querySelector('.stamp-image')) {
            tileEl.textContent = status;
        }
        previewContainer.appendChild(tileEl);
        statusFieldset.appendChild(previewContainer);

        statusContent.className = 'config-grid';
        statusFieldset.appendChild(statusContent);
        createFormFields(statusContent, styleSchema, statusData, Object.keys(styleSchema), { status });
        stylesContent.appendChild(statusFieldset);
    });

    formContainer.appendChild(stylesFieldset);

    // Restore focus if it was lost during re-render
    if (activeElementId) {
        const focusedEl = document.getElementById(activeElementId);
        if (focusedEl) focusedEl.focus();
    }
}

function handleGlobalConfigChange(event, mainController) {
    const input = event.target;
    const key = input.dataset.key;    
    // If there's no key, it's not a field we manage.
    if (!key || !mainController) return;

    const status = input.dataset.status;
    let newValue = input.type === 'checkbox' ? input.checked : input.value;
    if (input.dataset.unit) newValue += input.dataset.unit;

    if (input.type === 'text' && (key === 'boardImageUrl' || key === 'stampImageUrl')) {
        const fieldContainer = input.closest('.form-field');
        if (fieldContainer) {
            const previewImg = fieldContainer.querySelector('.image-upload-preview');
            if (previewImg) {
                previewImg.src = input.value;
                previewImg.style.display = input.value ? 'block' : 'none';
            }
        }
    }

    if (status) {
        if (!allStyles[status]) allStyles[status] = {};
        allStyles[status][key] = newValue;
        saveStyle(status, key, newValue);
    } else {
        config[key] = newValue;
        if (key === 'boardImageUrl') mainController.loadBoardImage(newValue);
        saveConfig(key, newValue);
    }
    console.log("[GlobalConfigEditor] Style/Config change detected, re-rendering tiles.");
    mainController.renderTiles();
}

function toggleGlobalStyles() {
    const form = document.getElementById('global-style-form');
    const isHidden = form.style.display === 'none';
    form.style.display = isHidden ? '' : 'none';
    document.getElementById('toggle-global-styles-btn').textContent = isHidden ? '-' : '+';
}