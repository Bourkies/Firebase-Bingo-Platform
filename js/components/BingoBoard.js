import { LitElement, html, css, unsafeCSS } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import './BingoTile.js'; // Import the new tile component
import { showMessage } from '../core/utils.js';

export class BingoBoard extends LitElement {
    static styles = css`
        :host {
            display: block;
            position: relative;
            width: 100%;
            background-size: cover;
            background-position: center;
            border-radius: 12px;
            box-shadow: 0 8px 24px var(--shadow-color);
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            background-color: var(--bg-color);
            background-image: linear-gradient(45deg, var(--surface-color) 25%, transparent 25%), linear-gradient(-45deg, var(--surface-color) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--surface-color) 75%), linear-gradient(-45deg, transparent 75%, var(--surface-color) 75%);
        }

        .error-message {
            padding: 2rem;
            background-color: var(--bg-color);
            border: 2px dashed var(--error-color);
            border-radius: 8px;
            text-align: center;
            width: 80%;
            word-wrap: break-word;
            position: absolute;
            z-index: 1;
        }

        /* Tooltip styles remain the same */
        #tile-tooltip {
            display: none;
            position: fixed;
            z-index: 1001;
            background-color: var(--bg-color);
            color: var(--primary-text);
            padding: 0.75rem;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            max-width: 300px;
            pointer-events: none;
            font-size: 0.9rem;
            line-height: 1.4;
        }

        #tile-tooltip h4 {
            margin: 0 0 0.5rem 0;
            color: var(--accent-color);
            font-size: 1rem;
        }

        #tile-tooltip p {
            margin: 0;
            color: var(--secondary-text);
        }
    `;

    static properties = {
        config: { type: Object },
        authState: { type: Object },
        tiles: { type: Array },
        currentTeam: { type: String },
        teamData: { type: Object },
        allStyles: { type: Object },
        displayTeam: { type: String },
        isGenericView: { type: Boolean },
        allTiles: { type: Array }, // NEW: To access full layout data when tiles are censored
        setupMode: { type: Boolean }, // NEW: To handle setup mode message
    };

    constructor() {
        super();
        console.log('[BingoBoard] Constructor: Component created.');
        this.config = {};
        this.authState = {};
        this.tiles = [];
        this.currentTeam = '';
        this.teamData = {};
        this.allStyles = {};
        this.displayTeam = '';
        this.isGenericView = false;
        this.allTiles = [];
        this.setupMode = false;
        this.tooltipElement = null;
    }

    connectedCallback() {
        super.connectedCallback();
        console.log('[BingoBoard] connectedCallback: Component added to DOM.');
        // The tooltip must be in the light DOM to be positioned correctly relative to the viewport.
        this.tooltipElement = document.getElementById('tile-tooltip');
    }

    updated(changedProperties) {
        super.updated(changedProperties);
        const changedProps = Array.from(changedProperties.keys());
        console.log(`[BingoBoard] updated: Properties changed: ${changedProps.join(', ')}`);
    }

    getTileStatus(tile) {
        // console.log(`[BingoBoard] getTileStatus for tile: ${tile.id}`); // This is very noisy, enable for debugging.
        if (this.isGenericView) return 'Unlocked';

        const isPublic = this.config.boardVisibility !== 'private';
        if (!isPublic && this.displayTeam && this.displayTeam !== this.authState.profile?.team) {
            return 'Hidden';
        }

        if (!this.displayTeam || !this.teamData[this.displayTeam]) return 'Locked';
        const teamTileStates = this.teamData[this.displayTeam].tileStates;
        const state = teamTileStates[tile.id] || {};
        if (state.verified) return 'Verified';
        if (state.requiresAction) return 'Requires Action';
        if (state.complete) return 'Submitted';
        if (state.hasSubmission) return 'Partially Complete';

        const unlockOnVerifiedOnly = this.config.unlockOnVerifiedOnly === true;
        const prereqString = tile.Prerequisites || '';

        if (!prereqString || !prereqString.trim()) return 'Unlocked';

        let orGroups = [];
        try {
            const parsed = JSON.parse(prereqString);
            if (Array.isArray(parsed) && (parsed.length === 0 || Array.isArray(parsed[0]))) {
                orGroups = parsed;
            }
        } catch (e) {
            const andGroup = prereqString.split(',').map(s => s.trim()).filter(Boolean);
            orGroups = andGroup.length > 0 ? [andGroup] : [];
        }

        if (orGroups.length === 0) return 'Unlocked';

        const prereqsMet = orGroups.some(andGroup =>
            andGroup.every(prereqId => {
                const prereqState = teamTileStates[prereqId] || {};
                return unlockOnVerifiedOnly ? prereqState.verified : (prereqState.verified || prereqState.complete);
            })
        );
        return prereqsMet ? 'Unlocked' : 'Locked';
    }

    handleTileClick(tile, status) {
        console.log(`[BingoBoard] handleTileClick: Tile '${tile.id}', Status: '${status}'`);
        const isMyTeam = this.authState.isLoggedIn && this.authState.profile?.team === this.displayTeam;
        
        // NEW: Disable submissions if censored (even for admins in setup mode)
        const isCensored = this.config.censorTilesBeforeEvent === true && (!this.authState?.isEventMod || this.config.setupModeEnabled);
        if (isCensored) return;

        const canOpenModal = !this.isGenericView && isMyTeam && status !== 'Locked';

        if (canOpenModal) {
            this.dispatchEvent(new CustomEvent('open-submission-modal', { detail: { tile, status } }));
        } else if (status === 'Locked') {
            // Do nothing
        } else if (!this.displayTeam) {
            showMessage('Please select your team to interact with a tile.', true);
        } else if (!isMyTeam) {
            // Cursor style handles feedback
        }
    }

    render() {
        console.log('[BingoBoard] render: Re-rendering board.');

        // NEW: Handle setup mode directly in the component. Check authState existence to avoid errors.
        if (this.setupMode && !this.authState?.isEventMod) {
            // CLEAR STYLES: Ensure no stale image persists
            this.style.backgroundImage = '';
            this.style.aspectRatio = '1 / 1';
            return html`<div class="error-message" style="position: static; z-index: 0;">The event has not started or is currently being set up. Please check back later.</div>`;
        }

        // REVISED: Only check for config. The tiles array might be temporarily empty during a data refresh (e.g., switching to public_tiles).
        // The component will automatically re-render when the tiles property is updated with new data.
        if (!this.config?.pageTitle) {
            console.log('[BingoBoard] render: No config, rendering empty.');
            // CLEAR STYLES: Ensure no stale image persists
            this.style.backgroundImage = '';
            this.style.aspectRatio = '1 / 1';
            return html``;
        }

        const imageUrl = this.config.boardImageUrl;
        if (imageUrl) {
            const img = new Image();
            img.onload = () => {
                // GUARD: Only apply if the config still matches this image.
                // This prevents a race condition where an old image loads after the board has been cleared.
                if (this.config?.boardImageUrl === imageUrl) {
                    this.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`;
                    this.style.backgroundImage = `url('${imageUrl}')`;
                }
            };
            img.onerror = () => { this.style.aspectRatio = '1 / 1'; };
            img.src = imageUrl;
        } else {
            this.style.aspectRatio = '1 / 1';
            this.style.backgroundImage = ''; // Clear image if config has none (reverts to CSS default)
        }

        return html`
            ${this.tiles.map(tile => 
                keyed(tile.docId, html`
                    ${(() => {
                        const status = this.getTileStatus(tile);

                        if (status === 'Hidden') return html``;

                        // The `tile` object from `this.tiles` can be from 'tiles' (full data) or 'public_tiles' (censored data).
                        // We always want to use the layout properties from the full tile object for rendering.
                        const isCensored = this.config.censorTilesBeforeEvent === true && (!this.authState?.isEventMod || this.config.setupModeEnabled);
                        // The `tile` object from the store will now correctly contain layout data even when censored.
                        // The Name/Description fields will just be missing, which we handle below.
                        const layoutTile = tile;

                        // The tile object passed to bingo-tile needs all positional data.
                        // We create a new object to ensure we don't mutate the original tile from the store.
                        const displayTile = {
                            ...layoutTile, // Start with full layout data.
                            Name: isCensored ? 'Censored' : (tile.Name || 'Unnamed Tile'),
                            Description: isCensored ? 'This tile is hidden until the event begins.' : (tile.Description || 'No description.'),
                            Points: isCensored ? 0 : tile.Points,
                        };

                        return html`
                            <bingo-tile
                                .tile=${displayTile}
                                .status=${status}
                                .config=${this.config}
                                .allStyles=${this.allStyles}
                                .authState=${this.authState}
                                @click=${() => this.handleTileClick(tile, status)}
                                @mousemove=${(e) => {
                                    const tilePoints = displayTile.Points ? ` (${displayTile.Points} pts)` : '';
                                    this.tooltipElement.innerHTML = `<h4>${tile.id}: ${displayTile.Name}${tilePoints}</h4><p>${displayTile.Description}</p>`;
                                    this.tooltipElement.style.display = 'block';
                                    this.tooltipElement.style.left = `${e.clientX + 15}px`;
                                    this.tooltipElement.style.top = `${e.clientY + 15}px`;
                                }}
                                @mouseout=${() => { this.tooltipElement.style.display = 'none'; }}
                            ></bingo-tile>`;
                    })()}
                `)
            )}
        `;
    }
}

customElements.define('bingo-board', BingoBoard);