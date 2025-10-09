import { LitElement, html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { hexToRgba } from '../core/utils.js';
import { classMap } from 'lit/directives/class-map.js';
export class BingoTile extends LitElement {
    static styles = css`
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
    `;

    static properties = {
        tile: { type: Object },
        status: { type: String },
        config: { type: Object },
        allStyles: { type: Object },
        authState: { type: Object },
        isLegendItem: { type: Boolean, attribute: 'is-legend-item' },
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

        const shape = (this._getProp('shape') || 'Square').toLowerCase();
        const clipPaths = { 'ellipse': 'ellipse(50% 50% at 50% 50%)', 'circle': 'ellipse(50% 50% at 50% 50%)', 'diamond': 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 'triangle': 'polygon(50% 0%, 0% 100%, 100% 100%)', 'hexagon': 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
        if (clipPaths[shape]) {
            tileStyles.clipPath = clipPaths[shape];
        }
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
        const tileName = config.censorTilesBeforeEvent && !this.authState?.isEventMod ? 'Censored' : (this.tile.Name || 'Unnamed Tile');

        return html`
            ${useStamp && stampUrl ? html`<div class="stamp-image" style="background-image: url('${stampUrl}'); background-position: ${this._getProp('stampPosition') || 'center'}; transform: scale(${this._getProp('stampScale') || '1'}) rotate(${this._getProp('stampRotation') || '0deg'});"></div>` : ''}
            ${(config.showTileNames === true || !config.boardImageUrl) && !stampUrl ? html`<div class="tile-content"><span>${tileName}</span></div>` : ''}
        `;
    }
}

customElements.define('bingo-tile', BingoTile);