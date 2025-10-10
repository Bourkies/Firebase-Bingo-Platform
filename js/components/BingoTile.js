import { LitElement, html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { hexToRgba } from '../core/utils.js';

export class BingoTile extends LitElement {
    static styles = css`
        /* REVISED: Use a double drop-shadow to force the glow outside the clip-path shape. */
        @keyframes pulse-glow {
            0% { filter: drop-shadow(0 0 0 var(--glow-color, transparent)) drop-shadow(0 0 0px var(--glow-color, transparent)); }
            70% { filter: drop-shadow(0 0 0 var(--glow-color, transparent)) drop-shadow(0 0 12px var(--glow-color, transparent)); }
            100% { filter: drop-shadow(0 0 0 var(--glow-color, transparent)) drop-shadow(0 0 0px var(--glow-color, transparent)); }
        }

        :host {
            position: absolute;
            box-sizing: border-box;
            /* Use CSS variables for the border, which will be set dynamically */
            border-style: solid;
            border-width: var(--tile-border-width, 2px);
            transition: background-color 0.3s ease, border-color 0.3s ease, transform 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            color: var(--primary-text);
            font-weight: bold;
            text-shadow: 1px 1px 3px var(--text-shadow-color);
            font-size: 0.9rem;
            padding: 4px;
            cursor: pointer;
            border-color: var(--tile-border-color, transparent);
        }

        /* NEW: Styles for when the tile is used in the color key legend */
        :host(.legend-item) {
            position: relative;
            width: 50px;
            height: 50px;
            flex-shrink: 0;
            cursor: help;
        }
        :host(:hover) {
            border-color: var(--tile-hover-border-color, var(--accent-color));
            border-width: var(--tile-hover-border-width, 2px);
            z-index: 2;
        }

        /* NEW: Apply the animation to the host element when it has the 'requires-action' class, but NOT if it's also a legend item. */
        :host(.requires-action:not(.legend-item)) {
            animation: pulse-glow 2s infinite;
        }


        .stamp-image {
            position: absolute;
            width: 100%;
            height: 100%;
            background-size: contain;
            background-repeat: no-repeat;
            pointer-events: none;
            z-index: 1;
        }

        /* NEW: The inner container for content */
        .tile-content {
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        /* NEW: Style for the ID overlay on the setup page */
        .tile-id-overlay {
            position: absolute;
            top: 50%; left: 50%; transform: translate(-50%, -50%);
            font-size: 12px; font-weight: bold; color: white;
            background: rgba(0,0,0,0.7); padding: 2px 5px;
            border-radius: 4px; z-index: 10;
            pointer-events: none;
        }
    `;

    static properties = {
        tile: { type: Object },
        status: { type: String },
        config: { type: Object },
        allStyles: { type: Object },
        authState: { type: Object },
        isLegendItem: { type: Boolean, attribute: 'is-legend-item' },
        // NEW: Properties for setup page functionality
        isSetupTile: { type: Boolean },
        isHighlighted: { type: Boolean },
        hasConflict: { type: Boolean },
        isSetupPreview: { type: Boolean },
        showId: { type: Boolean },
    };

    constructor() {
        super();
        // console.log('[BingoTile] Constructor: Component created.'); // Noisy, enable for debugging.
    }

    _getProp(propName) {
        const { tile, status, allStyles, config } = this;
        if (tile['Overrides (JSON)']) {
            try {
                const overrides = JSON.parse(tile['Overrides (JSON)']);
                if (overrides[status] && overrides[status][propName] !== undefined) {
                    return overrides[status][propName];
                }
            } catch (e) { /* ignore */ }
        }
        const statusStyle = allStyles[status];
        if (statusStyle && statusStyle[propName] !== undefined) {
            return statusStyle[propName];
        }
        return config[propName];
    }

    _getStyles() {
        const { tile, status } = this;

        // --- Dynamic Styling ---
        const color = this._getProp('color') || '#888888';
        const opacity = this._getProp('opacity') ?? 0.7;
        const borderWidth = this._getProp('borderWidth') || '2px';
        const borderColor = this._getProp('borderColor') || 'transparent';

        // Set CSS variables for both base and hover states
        this.style.setProperty('--tile-border-width', borderWidth);
        this.style.setProperty('--tile-border-color', borderColor);
        this.style.setProperty('--tile-hover-border-color', this._getProp('hoverBorderColor') || borderColor);
        this.style.setProperty('--tile-hover-border-width', this._getProp('hoverBorderWidth') || borderWidth);
        
        // NEW: Set the glow color to the tile's own background color for the animation.
        this.style.setProperty('--glow-color', color);

        // NEW: Handle setup-specific outlines for highlighting and conflicts
        if (this.isHighlighted) {
            this.style.borderColor = '#00d9f5'; // Highlight color
            this.style.zIndex = '2';
        }
        if (this.hasConflict) {
            this.style.outline = '3px solid var(--error-color)';
            this.style.outlineOffset = '2px';
        } else {
            this.style.outline = 'none';
        }
        // The styles object should NOT include border properties anymore
        const tileStyles = { backgroundColor: hexToRgba(color, opacity) };

        // Only apply positioning styles if it's a board tile
        if (!this.isLegendItem) {
            tileStyles.left = `${tile['Left (%)'] || 10}%`;
            tileStyles.top = `${tile['Top (%)'] || 10}%`;
            tileStyles.width = `${tile['Width (%)'] || 10}%`;
            tileStyles.height = `${tile['Height (%)'] || 10}%`;
            tileStyles.transform = `rotate(${tile.Rotation || 0}deg)`;
        }
        // NEW: Handle setup preview tile styles
        if (this.isSetupPreview) {
            tileStyles.position = 'relative';
            tileStyles.width = '80px';
            tileStyles.height = '80px';
            tileStyles.cursor = 'default';
        }

        const shape = (this._getProp('shape') || 'Square').toLowerCase();
        const clipPaths = { 'ellipse': 'ellipse(50% 50% at 50% 50%)', 'circle': 'ellipse(50% 50% at 50% 50%)', 'diamond': 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 'triangle': 'polygon(50% 0%, 0% 100%, 100% 100%)', 'hexagon': 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
        
        // FIX: Explicitly set clipPath to 'none' for squares to remove old shapes.
        tileStyles.clipPath = clipPaths[shape] || 'none';

        return tileStyles;
    }

    willUpdate(changedProperties) {
        // This is the correct lifecycle method to perform calculations before rendering.
        // It avoids causing side effects inside the render() method.
        const styles = this._getStyles();
        // Apply styles directly to the host element
        Object.assign(this.style, styles);

        // Apply classes directly to the host element for :host() styling
        const classes = {
            'legend-item': this.isLegendItem,
            [this.status.replace(/\s+/g, '-').toLowerCase()]: true,
        };
        this.className = Object.keys(classes).filter(key => classes[key]).join(' ');
    }

    render() {
        // console.log(`[BingoTile] render for tile '${this.tile.id}' with status '${this.status}'.`); // Very noisy, enable for debugging.
        const { config } = this;
        const useStamp = this._getProp('useStampByDefault') === true;
        const stampUrl = this._getProp('stampImageUrl');
        const tileName = this.tile.Name || 'Unnamed Tile';
        const showName = (this.isSetupPreview && !stampUrl) || (config.showTileNames === true && !stampUrl);

        return html`
            ${useStamp && stampUrl ? html`<div class="stamp-image" style="background-image: url('${stampUrl}'); background-position: ${this._getProp('stampPosition') || 'center'}; transform: scale(${this._getProp('stampScale') || '1'}) rotate(${this._getProp('stampRotation') || '0deg'});"></div>` : ''}
            ${showName ? html`<div class="tile-content"><span>${this.isSetupPreview ? this.status : tileName}</span></div>` : ''}
            ${this.showId ? html`<div class="tile-id-overlay">${this.tile.id}</div>` : ''}
        `;
    }
}

customElements.define('bingo-tile', BingoTile);