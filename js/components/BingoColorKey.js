import { LitElement, html, css } from 'lit';
import './BingoTile.js'; // Import the tile component

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
            text-align: center;
            width: 80px; /* Give items a consistent width */
        }
        .key-item span {
            font-size: 0.8rem;
            color: var(--secondary-text);
        }
    `;

    static properties = {
        config: { type: Object },
        allStyles: { type: Object },
    };

    constructor() {
        super();
        this.config = {};
        this.allStyles = {};
    }

    render() {
        if (!this.config || !this.allStyles || Object.keys(this.allStyles).length === 0) {
            return html``;
        }

        // Define the order and labels for the legend
        const legendOrder = ['Verified', 'Submitted', 'Partially Complete', 'Unlocked', 'Locked', 'Requires Action'];

        return html`
            ${legendOrder.map(status => {
                // Only render the key if that status style exists
                if (!this.allStyles[status]) return null;

                return html`
                    <div class="key-item" title=${this.allStyles[status].description || status}>
                        <bingo-tile .tile=${{}} .status=${status} .config=${this.config} .allStyles=${this.allStyles} is-legend-item></bingo-tile>
                        <span>${status}</span>
                    </div>
                `;
            })}
        `;
    }
}

customElements.define('bingo-color-key', BingoColorKey);