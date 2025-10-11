/* globalconfigEditor.js */
import '../../components/GlobalConfigForm.js'; // NEW: Import the Lit component
import { configStore } from '../../stores/configStore.js';

export function initializeGlobalConfig(controller) {
    const toggleGlobalStylesBtn = document.getElementById('toggle-global-styles-btn');
    const formComponent = document.getElementById('global-config-form-component');

    console.log("[GlobalConfigEditor] Initializing...");
    toggleGlobalStylesBtn?.addEventListener('click', toggleGlobalStyles);

    toggleGlobalStyles();
}

export function renderGlobalConfig(mainController) {
    console.log("[GlobalConfigEditor] renderGlobalConfig called.");
    const formComponent = document.getElementById('global-config-form-component');
    const { config, styles: allStyles } = configStore.get();
    if (!formComponent || !config || !allStyles) return;

    // Pass data to the Lit component's properties
    formComponent.config = config;
    formComponent.allStyles = allStyles;
}

function toggleGlobalStyles() {
    const formComponent = document.getElementById('global-config-form-component');
    if (!formComponent) return;
    formComponent.isVisible = !formComponent.isVisible;
    document.getElementById('toggle-global-styles-btn').textContent = formComponent.isVisible ? '-' : '+';
}