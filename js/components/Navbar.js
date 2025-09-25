import { initAuth, signOut, getAuthState } from '../core/auth.js';
import { fb, db } from '../core/firebase-config.js';

const template = document.createElement('template');
template.innerHTML = `
    <style>
        :host {
            width: 100%;
            max-width: 1400px;
            box-sizing: border-box;
        }
        .navbar {
            width: 100%;
            background-color: #2d2d2d;
            border-radius: 8px;
            padding: 0.5rem 1rem;
            margin-bottom: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
        }
        .nav-links a, .nav-actions button {
            color: #f0f0f0;
            text-decoration: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            transition: background-color 0.2s;
            background: none;
            border: none;
            font-size: 1rem;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }
        .nav-links a:hover, .nav-actions button:hover {
            background-color: rgba(255, 255, 255, 0.1);
        }
        .nav-links a.active {
            background-color: var(--accent-color, #00aaff);
            color: #111;
            font-weight: bold;
        }
        .nav-actions {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        #user-info {
            font-size: 0.9rem;
            color: #a0a0a0;
        }
    </style>
    <div class="navbar">
        <div class="nav-links">
            <!-- Links will be populated by JS -->
        </div>
        <div id="auth-container" class="nav-actions">
            <span id="user-info"></span>
            <!-- The change name button is page-specific and will remain in index.html -->
            <button id="auth-button">Login</button>
        </div>
    </div>
`;

class AppNavbar extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.appendChild(template.content.cloneNode(true));

        this.authButton = this.shadowRoot.querySelector('#auth-button');
        this.userInfo = this.shadowRoot.querySelector('#user-info');
        this.navLinksContainer = this.shadowRoot.querySelector('.nav-links');

        this.allTeams = {};
        this.config = {};
        this.authState = getAuthState(); // Get initial state
    }

    connectedCallback() {
        // The page controller is responsible for opening the login modal
        this.authButton.addEventListener('click', () => {
            if (this.authState.isLoggedIn) {
                signOut();
            } else {
                // Dispatch an event that the page can listen for to open its login modal
                this.dispatchEvent(new CustomEvent('login-request', { bubbles: true, composed: true }));
            }
        });

        // Listen to data
        this.unsubscribeConfig = fb.onSnapshot(fb.doc(db, 'config', 'main'), (doc) => {
            this.config = doc.data() || {};
            this.render();
        });

        this.unsubscribeTeams = fb.onSnapshot(fb.collection(db, 'teams'), (snapshot) => {
            this.allTeams = {};
            snapshot.forEach(doc => {
                this.allTeams[doc.id] = doc.data();
            });
            this.render();
        });

        // Listen to auth changes
        initAuth(newAuthState => {
            this.authState = newAuthState;
            this.render();
        });
    }

    disconnectedCallback() {
        if (this.unsubscribeConfig) this.unsubscribeConfig();
        if (this.unsubscribeTeams) this.unsubscribeTeams();
        // The auth listener from initAuth is global and doesn't need to be unsubscribed here.
    }

    render() {
        this.renderAuthInfo();
        this.renderNavLinks();
    }

    renderAuthInfo() {
        if (this.authState.isLoggedIn) {
            this.authButton.textContent = 'Logout';
            const profile = this.authState.profile || {};
            const roles = [];
            if (profile.isAdmin) roles.push('Admin');
            else if (profile.isEventMod) roles.push('Event Mod');

            const teamName = (profile.team && this.allTeams) ? (this.allTeams[profile.team]?.name || profile.team) : '';
            const roleString = roles.length > 0 ? `(${roles.join(', ')})` : '';
            const teamInfo = teamName ? ` | Team: ${teamName}` : '';
            this.userInfo.textContent = `${profile.displayName || 'User'} ${roleString} ${teamInfo}`;
        } else {
            this.authButton.textContent = 'Login';
            this.userInfo.textContent = '';
        }
    }

    renderNavLinks() {
        const currentPage = window.location.pathname.split('/').pop();

        const links = [
            { href: './index.html', text: 'Player View', show: true },
            { href: './overview.html', text: 'Overview', show: this.config.enableOverviewPage === true || this.authState.isEventMod },
            { href: './admin.html', text: 'Admin', show: this.authState.isEventMod },
            { href: './setup.html', text: 'Setup', show: this.authState.isAdmin }
        ];

        this.navLinksContainer.innerHTML = links
            .filter(link => link.show)
            .map(link => `<a href="${link.href}" class="${link.href.includes(currentPage) ? 'active' : ''}">${link.text}</a>`)
            .join('');
    }
}

customElements.define('app-navbar', AppNavbar);

export default AppNavbar;