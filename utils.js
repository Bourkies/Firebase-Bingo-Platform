/**
 * Displays a temporary message box at the bottom of the screen.
 * @param {string} text The message to display.
 * @param {boolean} isError If true, the message box will have an error style.
 */
export function showMessage(text, isError = false) {
    const box = document.getElementById('message-box');
    if (!box) return;
    box.textContent = text;
    box.style.backgroundColor = isError ? '#c0392b' : '#27ae60';
    box.classList.add('show');
    setTimeout(() => box.classList.remove('show'), 4000);
}

/**
 * Shows the global loading bar at the top of the page.
 */
export function showGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'block';
}

/**
 * Hides the global loading bar.
 */
export function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

/**
 * Converts a hex color string to an rgba string.
 * @param {string} colorStr The hex color string (e.g., '#ff0000').
 * @param {number} alpha The alpha transparency value (0 to 1).
 * @returns {string} The resulting rgba color string.
 */
export function hexToRgba(colorStr, alpha) {
    if (!colorStr || typeof colorStr !== 'string') return `rgba(255, 255, 255, ${alpha})`;
    const sColor = colorStr.trim();
    if (sColor === 'transparent') return 'transparent';
    if (!sColor.startsWith('#')) return sColor;
    const hex = sColor.slice(1);
    let r = 0, g = 0, b = 0;
    if (hex.length === 3) { r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16); }
    else if (hex.length === 6) { r = parseInt(hex.substring(0, 2), 16); g = parseInt(hex.substring(2, 4), 16); b = parseInt(hex.substring(4, 6), 16); }
    else { return `rgba(255, 255, 255, ${alpha})`; }
    if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(255, 255, 255, ${alpha})`;
    return `rgba(${r},${g},${b},${alpha})`;
}