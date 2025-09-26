import { initAuth, signOut, getAuthState, updateUserDisplayName } from '../core/auth.js';
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
        /* Modal Styles */
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.7); backdrop-filter: blur(4px); justify-content: center; align-items: center; }
        .modal-content { background-color: #2d2d2d; padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px; position: relative; }
        .modal-content h2 { margin-top: 0; color: var(--accent-color, #00aaff); }
        .modal-content p { color: #ccc; }
        .modal-content form { display: flex; flex-direction: column; gap: 1rem; }
        .modal-content label { font-weight: bold; }
        .modal-content input { width: 100%; background-color: #1e1e1e; color: #f0f0f0; border: 1px solid #444; padding: 0.75rem; border-radius: 4px; box-sizing: border-box; }
        .modal-content button[type="submit"] { background-color: var(--accent-color, #00aaff); color: #111; border: none; padding: 0.75rem; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: bold; }
        .modal-content button[type="submit"]:disabled { background-color: #555; cursor: not-allowed; }
        .close-button { color: #aaa; position: absolute; top: 1rem; right: 1.5rem; font-size: 28px; font-weight: bold; cursor: pointer; }
    </style>
    <div class="navbar">
        <div class="nav-links">
            <!-- Links will be populated by JS -->
        </div>
        <div id="auth-container" class="nav-actions">
            <span id="user-info"></span>
            <button id="change-name-btn" style="display: none;">Change Name</button>
            <button id="auth-button">Login</button>
        </div>
    </div>

    <!-- Name Change Modal -->
    <div id="welcome-modal" class="modal">
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2>Welcome!</h2>
            <p id="welcome-modal-message">Please set your display name for the event. This will be shown on leaderboards and submissions.</p>
            <form id="welcome-form">
                <label for="welcome-display-name">Display Name</label>
                <input type="text" id="welcome-display-name" required>
                <button type="submit">Save and Continue</button>
            </form>
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
        this.changeNameBtn = this.shadowRoot.querySelector('#change-name-btn');

        // Modal elements
        this.welcomeModal = this.shadowRoot.querySelector('#welcome-modal');
        this.welcomeForm = this.shadowRoot.querySelector('#welcome-form');
        this.closeWelcomeModalBtn = this.shadowRoot.querySelector('#welcome-modal .close-button');

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

        this.changeNameBtn.addEventListener('click', () => this.showWelcomeModal(true));
        this.closeWelcomeModalBtn.addEventListener('click', () => this.welcomeModal.style.display = 'none');
        this.welcomeForm.addEventListener('submit', (e) => this.handleWelcomeFormSubmit(e));


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
            // Check if we should show the welcome modal on first login
            if (this.authState.isLoggedIn && this.authState.profile && this.config.promptForDisplayNameOnLogin === true && this.authState.profile.hasSetDisplayName !== true) {
                this.showWelcomeModal();
            }
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

            // Show/hide change name button
            const profile = this.authState.profile || {};
            const canChangeName = !profile.isAnonymous && !profile.isNameLocked;
            this.changeNameBtn.style.display = canChangeName ? 'inline-block' : 'none';
            const roles = [];
            if (profile.isAdmin) roles.push('Admin');
            else if (profile.isEventMod) roles.push('Event Mod');

            const teamName = (profile.team && this.allTeams) ? (this.allTeams[profile.team]?.name || profile.team) : '';
            const roleString = roles.length > 0 ? `(${roles.join(', ')})` : '';
            const teamInfo = teamName ? ` | Team: ${teamName}` : '';
            this.userInfo.textContent = `${profile.displayName || 'User'} ${roleString} ${teamInfo}`;
        } else {
            this.authButton.textContent = 'Login';
            this.changeNameBtn.style.display = 'none';
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

    showWelcomeModal(isUpdate = false) {
        const messageEl = this.shadowRoot.getElementById('welcome-modal-message');
        const nameInput = this.shadowRoot.getElementById('welcome-display-name');
        const titleEl = this.welcomeModal.querySelector('h2');

        const defaultMessage = 'Please set your display name for the event. This will be shown on leaderboards and submissions.';

        if (isUpdate) {
            titleEl.textContent = 'Update Display Name';
        } else {
            titleEl.textContent = 'Welcome!';
        }
        messageEl.textContent = (this.config.welcomeMessage || defaultMessage).replace('{displayName}', this.authState.profile.displayName || 'User');
        nameInput.value = this.authState.profile.displayName || '';
        this.welcomeModal.style.display = 'flex';
    }

    async handleWelcomeFormSubmit(event) {
        event.preventDefault();
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        const newName = this.shadowRoot.getElementById('welcome-display-name').value.trim();
        if (!newName || !this.authState.isLoggedIn) return;

        try {
            await updateUserDisplayName(newName);
            this.welcomeModal.style.display = 'none';
            // Dispatch a success message event for the page to handle
            this.dispatchEvent(new CustomEvent('show-message', {
                bubbles: true, composed: true, detail: { message: 'Display name updated!', isError: false }
            }));
        } catch (error) {
            console.error('Display name update error:', error);
            alert('Failed to update display name: ' + error.message);
        } finally {
            submitBtn.disabled = false;
        }
    }
}

customElements.define('app-navbar', AppNavbar);

export default AppNavbar;