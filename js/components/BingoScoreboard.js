/**
 * ⚠️ NOTE: This file is currently UNUSED in the active application.
 * 
 * It defines a Lit Web Component (<bingo-scoreboard>) intended to eventually replace the 
 * vanilla JS rendering logic currently found in `Scoreboard.js` and `overviewController.js`.
 * 
 * Future Refactoring Plan:
 * 1. Update `overview.html` to use this component instead of the raw <table>.
 * 2. Update `overviewController.js` to pass data to this component's properties.
 * 3. Remove the vanilla `renderScoreboard` function from `Scoreboard.js`.
 */
import { LitElement, html, css } from 'lit';

export class BingoScoreboard extends LitElement {
    static styles = css`
        :host {
            display: block;
            padding: 1.5rem;
            background-color: var(--surface-color);
            border-radius: 8px;
        }
        h2 {
            margin: 0 0 1rem 0;
            text-align: center;
            font-weight: 500;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 0.5rem;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid var(--border-color);
        }
        th { font-weight: bold; }
        tr:last-child td { border-bottom: none; }
        td:nth-child(1) { font-weight: bold; width: 40px; } /* Rank */
        td:nth-child(3), td:nth-child(4) { text-align: right; } /* Tiles, Score */
    `;

    static properties = {
        scoreboardData: { type: Array },
        allTeams: { type: Object },
        config: { type: Object },
        authState: { type:Object },
        teamColorMap: { type: Object },
    };

    render() {
        if (!this.scoreboardData || !this.config) return html``;

        const isPrivate = this.config.boardVisibility === 'private';
        const myTeamId = this.authState?.profile?.team;

        return html`
            <h2>Scoreboard</h2>
            <table>
                <thead>
                    <tr><th>#</th><th>Team</th><th>Tiles</th><th>Score</th></tr>
                </thead>
                <tbody>
                    ${this.scoreboardData.map(item => {
                        const teamName = this.allTeams[item.teamId]?.name || 'Unknown Team';
                        const teamColor = this.teamColorMap[item.teamId] || 'var(--primary-text)';
                        const isMyTeam = item.teamId === myTeamId;
                        return html`<tr style="color: ${teamColor}; ${isMyTeam ? 'font-weight: bold;' : ''}"><td>${item.rank}</td><td>${teamName}</td><td>${item.tilesCompleted}</td><td>${item.score}</td></tr>`;
                    })}
                </tbody>
            </table>
        `;
    }
}

customElements.define('bingo-scoreboard', BingoScoreboard);