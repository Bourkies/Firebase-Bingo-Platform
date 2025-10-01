import { initAuth, signOut, getAuthState, updateUserDisplayName, signInWithGoogle, signInAnonymously } from '../core/auth.js';
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
            background-color: var(--surface-color);
            border-radius: 8px;
            padding: 0.5rem 1rem;
            margin-bottom: 1.5rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
            position: relative; /* For positioning the mobile menu */
        } 
        .nav-links {
            display: none; /* Hidden by default on mobile */
        }
        .nav-links-desktop {
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
 
        .nav-links-mobile {
            display: none; /* Hide mobile container by default */
        }
        .nav-links-desktop a, .nav-links-mobile a {
            color: var(--primary-text);
            text-decoration: none;
            padding: 0.5rem 1rem;
            border-radius: 6px;
            transition: background-color 0.2s;
        }
        .nav-actions button {
            color: var(--primary-text);
            padding: 0.5rem 1rem;
            border-radius: 6px;
            transition: background-color 0.2s;
            background: none;
            border: none;
            font-size: 1rem;
            cursor: pointer;
            font-family: var(--font-main);
        }
        .nav-links-desktop a:hover, .nav-links-mobile a:hover, .nav-actions button:hover {
            background-color: var(--hover-bg-color);
        }
        .nav-links-desktop a.active, .nav-links-mobile a.active {
            background-color: var(--accent-color);
            color: var(--accent-text-color);
            font-weight: bold;
        }
        .nav-actions {
            display: flex;
            align-items: center;
            gap: 1rem;
        }
        #theme-switcher {
            background-color: var(--surface-color, #2d2d2d);
            color: var(--primary-text, #f0f0f0);
            border: 1px solid var(--border-color, #444);
            padding: 0.4rem 0.5rem;
            border-radius: 6px;
            font-size: 1rem; /* Match other button font sizes */
            cursor: pointer;
        }
        #user-info {
            font-size: 0.9rem;
            color: var(--secondary-text);
            text-align: right;
            line-height: 1.3;
            /* Truncate to 2 lines */
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            /* Ensure it doesn't collapse vertically */
            min-height: 2.4em; /* Approx 2 lines */
            max-width: 250px; /* Prevent it from getting too wide */
        }
        /* Hamburger Menu Styles */
        .hamburger {
            display: none;
            flex-direction: column;
            justify-content: space-around;
            width: 2rem;
            height: 2rem;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 0;
            z-index: 10;
        }
        .hamburger span {
            width: 2rem;
            height: 0.25rem;
            background: var(--primary-text);
            border-radius: 10px;
            transition: all 0.3s linear;
        }
        /* Responsive Styles */
        @media (max-width: 850px) {
            .nav-links-mobile {
                display: none;
                flex-direction: column;
                align-items: flex-start;
                position: absolute;
                top: 100%;
                left: 0;
                width: 100%;
                /* Style Revamp */
                background-color: var(--bg-color); /* Use main background for contrast */
                border-radius: 8px;
                padding: 1rem 0;
                z-index: 10; /* Ensure it's on top of page content */
                border: 1px solid var(--border-color);
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                margin-top: 4px;
                box-sizing: border-box;
            }
            .nav-links-mobile.active {
                display: flex;
            }
            .nav-links-desktop {
                display: none; /* Hide desktop links on mobile */
            }
            .hamburger {
                display: flex;
            }
            /* Hide elements from the main bar on mobile */
            #auth-container #change-name-btn,
            #auth-container #theme-switcher {
                display: none;
            }
            /* Style for the change name button when it's in the mobile menu */
            #mobile-actions-container #change-name-btn {
                color: var(--primary-text);
                text-decoration: none;
                padding: 0.5rem 1rem;
                border-radius: 6px;
                transition: background-color 0.2s;
                background: none; /* Make background transparent to match links */
            }
            #mobile-actions-container #change-name-btn:hover {
                background-color: var(--hover-bg-color);
            }
        }
        /* Modal Styles */
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.6); backdrop-filter: blur(4px); justify-content: center; align-items: center; }
        .modal-content { background-color: var(--surface-color); padding: 2rem; border-radius: 12px; width: 90%; max-width: 500px; position: relative; border: 1px solid var(--border-color); }
        .modal-content h2 { margin-top: 0; color: var(--accent-color, #00aaff); }
        .modal-content p { color: var(--secondary-text); }
        .modal-content form { display: flex; flex-direction: column; gap: 1rem; }
        .modal-content label { font-weight: bold; }
        .modal-content input { width: 100%; background-color: var(--bg-color); color: var(--primary-text); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px; box-sizing: border-box; }        
        .modal-content button[type="submit"] { background-color: var(--accent-color); color: var(--accent-text-color); border: none; padding: 0.75rem; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: bold; }
        .modal-content button[type="submit"]:disabled { background-color: #555; cursor: not-allowed; }
        .close-button { color: var(--secondary-text); position: absolute; top: 1rem; right: 1.5rem; font-size: 28px; font-weight: bold; cursor: pointer; }
        /* Login Modal Specific Styles */
        #login-modal .modal-content { max-width: 400px; text-align: center; }
        .login-options { display: flex; flex-direction: column; gap: 1rem; margin-top: 1.5rem; }
        .login-options button {
            width: 100%; padding: 0.75rem; font-size: 1rem; border-radius: 8px;
            cursor: pointer; transition: background-color 0.2s; display: flex;
            align-items: center; justify-content: center; gap: 0.75rem;
        }
        #login-google { background-color: #4285F4; color: white; border: none; }
        #login-google:hover { background-color: #5a95f5; }
        #login-anon { background-color: #607d8b; color: white; border: none; }
        #login-anon:hover { background-color: #78909c; }
        .login-options svg { width: 20px; height: 20px; }
        .anon-warning {
            margin-top: 1.5rem; padding: 0.75rem; background-color: rgba(255, 193, 7, 0.1);
            border: 1px solid rgba(255, 193, 7, 0.3); border-radius: 8px; font-size: 0.85rem; text-align: left;
            color: var(--secondary-text);
        }
        .anon-warning strong { color: #ffc107; }
        .anon-warning ul { padding-left: 1.25rem; margin: 0.5rem 0 0 0; color: var(--secondary-text); }
    </style>
    <div class="navbar">
        <!-- Desktop Links -->
        <div class="nav-links-desktop">
            <!-- Links will be populated by JS -->
        </div>
        <button id="hamburger-btn" class="hamburger">
            <span></span>
            <span></span>
            <span></span>
        </button>
        <!-- Mobile Links (initially hidden) -->
        <div class="nav-links-mobile">
            <div id="mobile-actions-container" style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem; margin-top: 1rem; border-top: 1px solid var(--border-color); align-items: flex-start;">
                <!-- Mobile-specific actions will be moved here by JS -->
            </div>
        </div>
        <div id="auth-container" class="nav-actions">
            <span id="user-info"></span>
            <select id="theme-switcher"></select>
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

    <!-- Login Modal -->
    <div id="login-modal" class="modal">
        <div class="modal-content">
            <span class="close-button">&times;</span>
            <h2>Sign In</h2>
            <p>Choose an option to sign in and participate.</p>
            <div class="login-options">
                <button id="login-google">
                    <svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.42-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path><path fill="none" d="M0 0h48v48H0z"></path></svg>
                    Sign in with Google
                </button>
                <button id="login-anon">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12C20,13.42 19.53,14.74 18.75,15.85L15.85,18.75C14.74,19.53 13.42,20 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 0,0 6,12A6,6 0 0,0 12,18A6,6 0 0,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8Z"></path></svg>
                    Sign in Anonymously
                </button>
            </div>
            <div class="anon-warning">
                <strong>Warning:</strong> Anonymous sign-in has limitations:
                <ul>
                    <li>Your progress is tied to <strong>this browser on this device only</strong>. If you log out or clear your cache, you will <strong>not</strong> be able to log back into this anonymous account.</li>
                    <li>You cannot be assigned as a team captain, mod, or admin.</li>
                </ul>
            </div>
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
        this.navLinksDesktop = this.shadowRoot.querySelector('.nav-links-desktop');
        this.navLinksMobile = this.shadowRoot.querySelector('.nav-links-mobile');
        this.changeNameBtn = this.shadowRoot.querySelector('#change-name-btn');
        this.authContainer = this.shadowRoot.querySelector('#auth-container');
        this.mobileActionsContainer = this.shadowRoot.querySelector('#mobile-actions-container');
        this.authButton = this.shadowRoot.querySelector('#auth-button');

        this.hamburgerBtn = this.shadowRoot.querySelector('#hamburger-btn');

        this.themeSwitcher = this.shadowRoot.querySelector('#theme-switcher');

        // Modal elements
        this.welcomeModal = this.shadowRoot.querySelector('#welcome-modal');
        this.welcomeForm = this.shadowRoot.querySelector('#welcome-form');
        this.closeWelcomeModalBtn = this.shadowRoot.querySelector('#welcome-modal .close-button');

        // Login Modal elements
        this.loginModal = this.shadowRoot.querySelector('#login-modal');
        this.closeLoginModalBtn = this.shadowRoot.querySelector('#login-modal .close-button');
        this.loginGoogleBtn = this.shadowRoot.querySelector('#login-google');
        this.loginAnonBtn = this.shadowRoot.querySelector('#login-anon');

        this.allTeams = {};
        this.config = {};
        this.authState = getAuthState(); // Get initial state

    }

    showLoginModal() {
        this.loginModal.style.display = 'flex';
    }

    hideLoginModal() {
        this.loginModal.style.display = 'none';
    }

    connectedCallback() {
        this.authButton.addEventListener('click', () => {
            if (this.authState.isLoggedIn) {
                signOut();
            } else {
                this.showLoginModal();
            }
        });

        this.changeNameBtn.addEventListener('click', () => this.showWelcomeModal(true));
        this.closeWelcomeModalBtn.addEventListener('click', () => this.welcomeModal.style.display = 'none');
        this.welcomeForm.addEventListener('submit', (e) => this.handleWelcomeFormSubmit(e));

        this.closeLoginModalBtn.addEventListener('click', () => this.hideLoginModal());
        this.loginGoogleBtn.addEventListener('click', () => { signInWithGoogle(); this.hideLoginModal(); });
        this.loginAnonBtn.addEventListener('click', () => { signInAnonymously(); this.hideLoginModal(); });

        this.hamburgerBtn.addEventListener('click', () => {
            this.navLinksMobile.classList.toggle('active');
        });

        this.themeSwitcher.addEventListener('change', (e) => this.setTheme(e.target.value));
        this.populateThemeSwitcher();

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

        // Handle responsive element placement
        this.mediaQuery = window.matchMedia('(max-width: 850px)');
        this.handleResponsiveLayout(this.mediaQuery); // Initial check
        this.mediaQuery.addEventListener('change', this.handleResponsiveLayout.bind(this));


        // Listen to auth changes
        initAuth(newAuthState => {
            console.log('[Navbar] Auth state received:', { isLoggedIn: newAuthState.isLoggedIn, isTeamCaptain: newAuthState.isTeamCaptain, profile: newAuthState.profile ? { displayName: newAuthState.profile.displayName, team: newAuthState.profile.team } : null });
            this.authState = newAuthState;
            // Check if we should show the welcome modal on first login
            if (this.authState.isLoggedIn && this.authState.profile && this.config.promptForDisplayNameOnLogin === true && this.authState.profile.hasSetDisplayName !== true) {
                this.showWelcomeModal();
            }
            this.updateCurrentThemeSelection();
            this.render();
        });
    }

    disconnectedCallback() {
        if (this.unsubscribeConfig) this.unsubscribeConfig();
        if (this.unsubscribeTeams) this.unsubscribeTeams();
        // The auth listener from initAuth is global and doesn't need to be unsubscribed here.
    }

    render() {
        // Re-evaluate captain status whenever data changes, as this component has all the necessary info.
        // This ensures the UI is correct even if captain status changes while the user is on the page.
        if (this.authState.isLoggedIn && this.authState.profile) {
            const userTeamId = this.authState.profile.team;
            const userTeam = userTeamId ? this.allTeams[userTeamId] : null;
            const isCaptain = userTeam ? userTeam.captainId === this.authState.user.uid : false;
            if (this.authState.isTeamCaptain !== isCaptain) {
                console.log(`[Navbar] Captain status updated from ${this.authState.isTeamCaptain} to ${isCaptain}`);
                this.authState.isTeamCaptain = isCaptain;
            }
        }
        this.renderAuthInfo();
        this.renderNavLinks();
        this.updateCurrentThemeSelection();
    }

    renderAuthInfo() {
        if (this.authState.isLoggedIn) {
            this.authButton.textContent = 'Logout';

            // Show/hide change name button
            const profile = this.authState.profile || {};
            const canChangeName = !profile.isAnonymous && !profile.isNameLocked;
            this.changeNameBtn.style.display = canChangeName ? 'inline-block' : 'none';
            const roles = [];
            if (profile.isAdmin) { roles.push('Admin'); }
            if (profile.isEventMod) { roles.push('Event Mod'); }
            if (this.authState.isTeamCaptain) { roles.push('Captain'); }
            console.log('[Navbar] Rendering roles:', roles);

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
        console.log(`[Navbar] Rendering nav links. isTeamCaptain: ${this.authState.isTeamCaptain}`);

        const links = [
            { href: './index.html', text: 'Board', show: true },
            { href: './overview.html', text: 'Scoreboard', show: this.config.enableOverviewPage === true },
            { href: './captain.html', text: 'Team Management', show: this.authState.isTeamCaptain },
            { href: './admin.html', text: 'Admin', show: this.authState.isEventMod  || this.authState.isAdmin },
            { href: './setup.html', text: 'Setup', show: this.authState.isAdmin }
        ];

        const linksHtml = links
            .filter(link => link.show)
            .map(link => `<a href="${link.href}" class="${link.href.includes(currentPage) ? 'active' : ''}">${link.text}</a>`)
            .join('');
        
        this.navLinksDesktop.innerHTML = linksHtml;
        // Clear mobile links but preserve the actions container
        this.navLinksMobile.querySelectorAll('a').forEach(a => a.remove());
        this.navLinksMobile.insertAdjacentHTML('afterbegin', linksHtml);
    }

    handleResponsiveLayout(event) {
        if (event.matches) { // Mobile view
            // Move elements to the mobile menu
            this.mobileActionsContainer.appendChild(this.changeNameBtn);
            this.mobileActionsContainer.appendChild(this.themeSwitcher);
        } else { // Desktop view
            // Move elements back to the main auth container, before the auth button
            this.authContainer.insertBefore(this.themeSwitcher, this.authButton);
            this.authContainer.insertBefore(this.changeNameBtn, this.authButton);
        }
    }

    populateThemeSwitcher() {
        const availableThemes = [];
        // Find the theme.css stylesheet
        const styleSheet = Array.from(document.styleSheets).find(
            sheet => sheet.href && sheet.href.endsWith('theme.css')
        );

        if (styleSheet) {
            try {
                for (const rule of styleSheet.cssRules) {
                    if (rule.selectorText === ':root') {
                        const name = rule.style.getPropertyValue('--theme-name').trim().replace(/"/g, '');
                        if (name) availableThemes.push({ value: 'dark', text: name });
                    } else if (rule.selectorText?.startsWith('[data-theme=')) {
                        const match = rule.selectorText.match(/\[data-theme="([^"]+)"\]/);
                        const name = rule.style.getPropertyValue('--theme-name').trim().replace(/"/g, '');
                        if (match && name) {
                            availableThemes.push({ value: match[1], text: name });
                        }
                    }
                }
            } catch (e) { console.error("Could not parse stylesheet rules. This may be a CORS issue in local development.", e); }
        }
        this.themeSwitcher.innerHTML = availableThemes.map(theme => `<option value="${theme.value}">${theme.text}</option>`).join('');
    }

    updateCurrentThemeSelection() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        this.themeSwitcher.value = currentTheme;
    }

    setTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        localStorage.setItem('theme', theme);

        // Dispatch an event that other components (like charts) can listen to
        document.dispatchEvent(new CustomEvent('theme-changed', { detail: { theme } }));
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