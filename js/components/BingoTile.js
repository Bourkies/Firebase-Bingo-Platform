import { LitElement, html, css } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { hexToRgba } from '../core/utils.js';

export class BingoTile extends LitElement {
    static styles = css`
        :host {
            position: absolute;
            box-sizing: border-box;
            border-style: solid;
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
    `;

    static properties = {
        tile: { type: Object },
        status: { type: String },
        config: { type: Object },
        allStyles: { type: Object },
        authState: { type: Object },
    };

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

    _applyStyles() {
        const { tile, status } = this;

        // --- Base Styling ---
        const tileStyles = {
            left: `${tile['Left (%)'] || 10}%`,
            top: `${tile['Top (%)'] || 10}%`,
            width: `${tile['Width (%)'] || 10}%`,
            height: `${tile['Height (%)'] || 10}%`,
            transform: `rotate(${tile.Rotation || 0}deg)`,
            backgroundColor: hexToRgba(this._getProp('color') || '#888888', this._getProp('opacity') ?? 0.7),
            borderWidth: this._getProp('borderWidth') || '2px',
            borderColor: this._getProp('borderColor') || 'transparent',
            '--tile-hover-border-color': this._getProp('hoverBorderColor') || this._getProp('borderColor') || 'transparent',
            '--tile-hover-border-width': this._getProp('hoverBorderWidth') || this._getProp('borderWidth') || '2px',
        };

        const shape = (this._getProp('shape') || 'Square').toLowerCase();
        const clipPaths = { 'ellipse': 'ellipse(50% 50% at 50% 50%)', 'circle': 'ellipse(50% 50% at 50% 50%)', 'diamond': 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', 'triangle': 'polygon(50% 0%, 0% 100%, 100% 100%)', 'hexagon': 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' };
        if (clipPaths[shape]) {
            tileStyles.clipPath = clipPaths[shape];
        }

        // Apply styles directly to the host element
        Object.assign(this.style, tileStyles);
        this.className = status.replace(/\s+/g, '-').toLowerCase();
    }

    firstUpdated() {
        this._applyStyles();
    }

    updated(changedProperties) {
        if (changedProperties.has('status') || changedProperties.has('config') || changedProperties.has('allStyles')) {
            this._applyStyles();
        }
    }

    render() {
        const { config } = this;
        const useStamp = this._getProp('useStampByDefault') === true;
        const stampUrl = this._getProp('stampImageUrl');
        const tileName = config.censorTilesBeforeEvent && !this.authState?.isEventMod ? 'Censored' : (this.tile.Name || 'Unnamed Tile');

        return html`
            ${useStamp && stampUrl ? html`<div class="stamp-image" style="background-image: url('${stampUrl}'); background-position: ${this._getProp('stampPosition') || 'center'}; transform: scale(${this._getProp('stampScale') || '1'}) rotate(${this._getProp('stampRotation') || '0deg'});"></div>` : ''}
            ${(config.showTileNames === true || !config.boardImageUrl) && !stampUrl ? html`<span>${tileName}</span>` : ''}
        `;
    }
}

customElements.define('bingo-tile', BingoTile);