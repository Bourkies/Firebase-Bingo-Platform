import { hexToRgba } from '../core/utils.js';

/**
 * Creates a styled tile element for the bingo board.
 * This function centralizes all tile rendering logic.
 * @param {object} tile - The tile data object.
 * @param {string} status - The calculated status of the tile (e.g., 'Locked', 'Verified').
 * @param {object} config - The global configuration object.
 * @param {object} allStyles - The object containing all status-specific styles.
 * @param {object} options - Page-specific rendering options.
 * @param {string} options.baseClass - The base CSS class for the tile (e.g., 'tile-overlay' or 'draggable-tile').
 * @param {boolean} [options.isHighlighted=false] - Whether to apply a highlight border.
 * @param {boolean} [options.hasConflict=false] - Whether to apply a conflict outline.
 * @returns {HTMLDivElement} The fully-styled tile element.
 */
export function createTileElement(tile, status, config, allStyles, options) {
    const { baseClass, isHighlighted = false, hasConflict = false } = options;

    const tileEl = document.createElement('div');
    tileEl.className = `${baseClass} ${status.replace(/\s+/g, '-').toLowerCase()}`;

    // --- Property Getter ---
    const getProp = (propName, status) => {
        // 1. Check tile-specific overrides for the given status
        if (tile['Overrides (JSON)']) {
            try {
                const overrides = JSON.parse(tile['Overrides (JSON)']);
                if (overrides[status] && overrides[status][propName] !== undefined) {
                    return overrides[status][propName];
                }
            } catch (e) { /* ignore parsing errors */ }
        }
        // 2. Check status-specific styles
        const statusStyle = allStyles[status];
        if (statusStyle && statusStyle[propName] !== undefined) {
            return statusStyle[propName];
        }
        // 3. Fallback to global config defaults (though this is less common for tile styles)
        return config[propName];
    };

    // --- Base Styling ---
    tileEl.style.left = `${tile['Left (%)'] || 10}%`;
    tileEl.style.top = `${tile['Top (%)'] || 10}%`;
    tileEl.style.width = `${tile['Width (%)'] || 10}%`;
    tileEl.style.height = `${tile['Height (%)'] || 10}%`;
    tileEl.style.transform = `rotate(${tile.Rotation || 0}deg)`;

    // --- Dynamic Styling ---
    const color = getProp('color', status) || '#888888';
    const opacity = getProp('opacity', status) ?? 0.7;
    tileEl.style.backgroundColor = hexToRgba(color, opacity);

    const shape = (getProp('shape', status) || 'Square').toLowerCase();
    const clipPaths = { 'ellipse': 'ellipse(50% 50% at 50% 50%)', 'circle': 'ellipse(50% 50% at 50% 50%)', 'diamond': 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 'triangle': 'polygon(50% 0%, 0% 100%, 100% 100%)', 'hexagon': 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
    if (clipPaths[shape]) tileEl.style.clipPath = clipPaths[shape];

    const borderWidth = getProp('borderWidth', status) || '2px';
    const borderColor = getProp('borderColor', status) || 'transparent';
    // FIX: Use CSS variables for the border to allow hover effects from stylesheets.
    // Inline styles would otherwise override the :hover pseudo-class.
    tileEl.style.setProperty('--tile-border-width', borderWidth);
    tileEl.style.setProperty('--tile-border-color', borderColor);
    tileEl.style.borderStyle = 'solid'; // Set the non-changing part of the border
 
    // --- Page-Specific Overrides ---
    if (isHighlighted) {
        tileEl.style.borderColor = '#00d9f5';
        tileEl.style.zIndex = 2;
    }
    if (hasConflict) {
        tileEl.style.outline = '3px solid #e57373';
        tileEl.style.outlineOffset = '2px';
    }

    // --- Stamp Logic ---
    const useStamp = getProp('useStampByDefault', status) === true;
    const stampUrl = getProp('stampImageUrl', status);

    if (useStamp && stampUrl) {
        const scale = getProp('stampScale', status) || '1';
        const rotation = getProp('stampRotation', status) || '0deg';
        const position = getProp('stampPosition', status) || 'center';

        const stampEl = document.createElement('div');
        stampEl.style.cssText = `
            position: absolute; width: 100%; height: 100%; left: 0; top: 0;
            pointer-events: none; z-index: 1;
            background-image: url('${stampUrl}');
            background-repeat: no-repeat; background-size: contain;
            background-position: ${position};
            transform-origin: ${position};
            transform: scale(${scale}) rotate(${rotation});
        `;
        tileEl.appendChild(stampEl);
    }

    return tileEl;
}

/**
 * Renders the color key legend into a given container.
 * @param {object} config - The main application config object.
 * @param {object} allStyles - An object of all status-specific styles.
 * @param {HTMLElement} container - The DOM element to render the color key into.
 */
export function renderColorKey(config, allStyles, container) {
    if (!config || !allStyles || !container) return;

    container.innerHTML = ''; // Clear previous content

    const statusesToDisplay = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];
    const statusDisplayNames = {
        'Partially Complete': 'Draft', 'Requires Action': 'Admin Feedback'
    };

    statusesToDisplay.forEach(status => {
        const keyItem = document.createElement('div');
        keyItem.className = 'key-item';

        const displayName = statusDisplayNames[status] || status;
        const mockTile = { id: 'Preview' };
        // FIX: Assign a baseClass so the preview tile inherits the correct border styles
        // from the page's stylesheet (e.g., .tile-overlay in index.html).
        const options = { baseClass: 'tile-overlay' };
        const tilePreview = createTileElement(mockTile, status, config, allStyles, options);

        tilePreview.style.position = 'relative';
        tilePreview.style.width = '40px';
        tilePreview.style.height = '40px';
        tilePreview.style.left = 'auto';
        tilePreview.style.top = 'auto';
        tilePreview.style.cursor = 'default';
        tilePreview.style.fontSize = '10px';

        if (config.showTileNames && !tilePreview.querySelector('.stamp-image')) tilePreview.textContent = displayName;
        keyItem.append(tilePreview, displayName);
        container.appendChild(keyItem);
    });
}