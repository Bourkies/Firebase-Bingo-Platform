/* globalconfigEditor.js */
import '../../components/GlobalConfigForm.js'; // NEW: Import the Lit component
import { configStore, updateConfig, updateStyle } from '../../stores/configStore.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';

async function saveConfig(key, value) {
    try {
        // NEW: Call the write function from the store
        await updateConfig({ [key]: value });
    } catch (err) {
        showMessage(`Error saving config: ${err.message}`, true);
        renderGlobalConfig();
    }
}

async function saveStyle(status, key, value) {
    try {
        // NEW: Call the write function from the store
        await updateStyle(status, { [key]: value });
    } catch (err) {
        showMessage(`Error saving style ${status}: ${err.message}`, true);
        renderGlobalConfig();
    }
}

export function initializeGlobalConfig(controller) {
    const toggleGlobalStylesBtn = document.getElementById('toggle-global-styles-btn');
    const formComponent = document.getElementById('global-config-form-component');

    console.log("[GlobalConfigEditor] Initializing...");
    toggleGlobalStylesBtn?.addEventListener('click', toggleGlobalStyles);
    formComponent?.addEventListener('config-change', (e) => handleGlobalConfigChange(e, controller));

    toggleGlobalStyles();
}

export function renderGlobalConfig(mainController) {
    console.log("[GlobalConfigEditor] renderGlobalConfig called.");
    const formComponent = document.getElementById('global-config-form-component');
    const { config, styles: allStyles } = configStore.get();
    if (!formComponent || !config || !allStyles) return;

    // Pass data to the Lit component
    formComponent.config = config;
    formComponent.allStyles = allStyles;
    formComponent.mainController = mainController;
}

function handleGlobalConfigChange(event, mainController) {
    const { status, key, value } = event.detail;
    if (!key) return;

    if (status) {
        saveStyle(status, key, value);
    } else {
        if (key === 'boardImageUrl') mainController.loadBoardImage(value);
        saveConfig(key, value);
    }
    console.log("[GlobalConfigEditor] Style/Config change detected, re-rendering tiles.");
    mainController.renderTiles();
}

function toggleGlobalStyles() {
    const formComponent = document.getElementById('global-config-form-component');
    if (!formComponent) return;
    formComponent.isVisible = !formComponent.isVisible;
    document.getElementById('toggle-global-styles-btn').textContent = formComponent.isVisible ? '-' : '+';
}