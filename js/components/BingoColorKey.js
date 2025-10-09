import { LitElement, html, css } from 'lit';
import './BingoTile.js';

export class BingoColorKey extends LitElement {
    static styles = css`
        :host {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 1rem;
            padding: 1rem;
            background-color: var(--surface-color);
            border-radius: 8px;
        }
        .key-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.5rem;
            font-size: 0.8rem;
            color: var(--secondary-text);
        }
        bingo-tile {
            position: relative !important; /* Override absolute positioning for the legend */
            width: 40px;
            height: 40px;
            cursor: default;
        }
    `;

    static properties = {
        config: { type: Object },
        allStyles: { type: Object },
    };

    render() {
        if (!this.config || !this.allStyles) return html``;

        const statusesToDisplay = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];
        const statusDisplayNames = { 'Partially Complete': 'Draft', 'Requires Action': 'Admin Feedback' };

        return html`
            ${statusesToDisplay.map(status => {
                const displayName = statusDisplayNames[status] || status;
                const mockTile = { id: 'Preview', Name: displayName }; // Pass name for censored boards
                return html`
                    <div class="key-item">
                        <bingo-tile .tile=${mockTile} .status=${status} .config=${this.config} .allStyles=${this.allStyles} .authState=${{}}></bingo-tile>
                        <span>${displayName}</span>
                    </div>
                `;
            })}
        `;
    }
}

customElements.define('bingo-color-key', BingoColorKey);