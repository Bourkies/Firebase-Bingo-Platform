import { LitElement, html, css, unsafeCSS } from 'lit';
import { signOut, getAuthState, signInWithEmail, createUserWithEmail } from '../core/auth.js';
// NEW: Import the central app initializer
import { initializeApp } from '../app-init.js';
// Import stores and their write operations
import { authStore } from '../stores/authStore.js';
import { configStore } from '../stores/configStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { updateUserDisplayName } from '../stores/usersStore.js';

// NEW: Centralized variable for the responsive breakpoint.
const MOBILE_BREAKPOINT = '1000px';

class AppNavbar extends LitElement {
    static styles = css`
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
        @media (max-width: ${unsafeCSS(MOBILE_BREAKPOINT)}) {
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
        
        /* NEW: Styles for Email/Password form */
        .email-login-form { display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem; }
        .email-login-form input { background-color: var(--bg-color); color: var(--primary-text); border: 1px solid var(--border-color); padding: 0.75rem; border-radius: 4px; box-sizing: border-box; }
        .email-login-buttons { display: flex; gap: 0.75rem; margin-top: 0.5rem; }
        .email-login-buttons button { flex-grow: 1; background-color: var(--accent-color); color: var(--accent-text-color); border: none; padding: 0.75rem; border-radius: 8px; cursor: pointer; font-size: 1rem; font-weight: bold; }
        .email-login-buttons button.secondary { background-color: var(--surface-color); color: var(--primary-text); border: 1px solid var(--border-color); }
        .email-login-buttons button.secondary:hover { background-color: var(--hover-bg-color); }

        .form-divider { text-align: center; color: var(--secondary-text); margin: 1.5rem 0; font-size: 0.9rem; }
        .modal-switch { text-align: center; margin-top: 1.5rem; font-size: 0.9rem; color: var(--secondary-text); }

        /* NEW: Styles for login method descriptions and warnings */
        .login-method-description { font-size: 0.9rem; color: var(--secondary-text); margin-bottom: 0.5rem; text-align: left; }
        .login-method-description strong { color: var(--primary-text); }
        .login-method-warning { font-size: 0.8rem; color: var(--warn-color); margin-top: 0.25rem; text-align: left; }
        .google-login-container { position: relative; }
        /* NEW: Style for the Google info block */
        .google-info-block {
            margin-top: 0.5rem;
            padding: 0.75rem;
            background-color: rgba(100, 181, 246, 0.1);
            border: 1px solid rgba(100, 181, 246, 0.3);
            border-radius: 8px;
            font-size: 0.85rem;
            color: var(--secondary-text);
        }

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
    `;

    static properties = {
        authState: { state: true },
        config: { state: true },
        allTeams: { state: true },
        isWelcomeModalOpen: { state: true },
        isLoginModalOpen: { state: true },
        isSignupModalOpen: { state: true },
        isMobileMenuOpen: { state: true },
        isMobileView: { state: true },
        availableThemes: { state: true },
    };

    constructor() {
        super();
        this.authState = getAuthState(); // Get initial state
        this.config = {};
        this.allTeams = {};
        this.isWelcomeModalOpen = false;
        this.isLoginModalOpen = false;
        this.isSignupModalOpen = false;
        this.isMobileMenuOpen = false;
        this.isMobileView = false;
        this.availableThemes = [];
    }

    showLoginModal() {
        this.isLoginModalOpen = true;
    }

    hideLoginModal() {
        this.isLoginModalOpen = false;
    }

    hideSignupModal() {
        this.isSignupModalOpen = false;
    }

    connectedCallback() {
        super.connectedCallback();
        // NEW: Initialize all data stores for the application
        initializeApp();

        this.populateThemeSwitcher();

        // Listen to data
        this.unsubscribeFromStores = [
            authStore.subscribe(newAuthState => {
                this.authState = newAuthState;
            }),
            teamsStore.subscribe(() => {
                this.allTeams = teamsStore.get();
            })
        ];
        this.unsubscribeFromStores.push(configStore.subscribe(() => {
            console.log('[Navbar] Config store updated.');
            this.config = configStore.get().config;
        }));

        // Handle responsive element placement
        this.mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT})`);
        this.handleResponsiveLayout(this.mediaQuery); // Initial check
        this.mediaQuery.addEventListener('change', this.handleResponsiveLayout.bind(this));
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.unsubscribeFromStores.forEach(unsub => unsub());
        this.mediaQuery.removeEventListener('change', this.handleResponsiveLayout.bind(this));
    }

    renderAuthInfo() {
        let userInfoText = '';
        if (this.authState.isLoggedIn) {
            const profile = this.authState.profile || {};
            const roles = [];
            if (profile.isAdmin) { roles.push('Admin'); }
            if (profile.isEventMod) { roles.push('Event Mod'); }
            if (this.authState.isTeamCaptain) { roles.push('Captain'); }
            console.log('[Navbar] Rendering roles:', roles);

            const teamName = (profile.team && this.allTeams) ? (this.allTeams[profile.team]?.name || profile.team) : '';
            const roleString = roles.length > 0 ? `(${roles.join(', ')})` : '';
            const teamInfo = teamName ? ` | Team: ${teamName}` : '';
            userInfoText = `${profile.displayName || 'User'} ${roleString} ${teamInfo}`;
        }
        return html`<span id="user-info">${userInfoText}</span>`;
    }

    renderNavLinks() {
        // Get the base filename of the current page, defaulting to 'index' for the root.
        const currentPagePath = window.location.pathname;

        console.log(`[Navbar] Rendering nav links. isTeamCaptain: ${this.authState.isTeamCaptain}`);

        // NEW: Use root-relative paths to ensure links work from any directory depth.
        const links = [
            { href: '/index.html', text: 'Board', show: true },
            { href: '/overview.html', text: 'Scoreboard', show: this.config.enableOverviewPage === true },
            { href: '/captain.html', text: 'Team Management', show: this.authState.isTeamCaptain },
            { href: '/admin.html', text: 'Admin', show: this.authState.isEventMod || this.authState.isAdmin },
            { href: '/setup.html', text: 'Setup', show: this.authState.isAdmin },
        ];

        const linksHtml = links
            .filter(link => link.show)
            .map(link => {
                // NEW: Check if the current page's path ends with the link's href.
                // This correctly handles both root paths (e.g., '/') and specific file paths.
                const isActive = currentPagePath.endsWith(link.href) || (currentPagePath === '/' && link.href === '/index.html');
                return `<a href="${link.href}" class="${isActive ? 'active' : ''}">${link.text}</a>`;
            })
            .join('');
        // This is not ideal for Lit, but since it's just a string of links, it's acceptable.
        // A better way would be to use `map` inside the template.
        const linksTemplate = links.filter(link => link.show).map(link => {
            const isActive = currentPagePath.endsWith(link.href) || (currentPagePath === '/' && link.href === '/index.html');
            return html`<a href="${link.href}" class="${isActive ? 'active' : ''}">${link.text}</a>`;
        });
        return linksTemplate;
    }

    handleResponsiveLayout(event) {
        this.isMobileView = event.matches;
    }

    populateThemeSwitcher() {
        const availableThemes = [];
        // Find the theme.css stylesheet
        const styleSheet = Array.from(this.getRootNode().styleSheets || document.styleSheets).find(
            sheet => sheet.href && sheet.href.endsWith('theme.css')
        );

        if (styleSheet?.cssRules) {
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
        this.availableThemes = availableThemes;
    }

    updateCurrentThemeSelection() {
        const themeSwitcher = this.shadowRoot?.getElementById('theme-switcher');
        if (themeSwitcher) themeSwitcher.value = document.documentElement.getAttribute('data-theme') || 'dark';
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
        this.isWelcomeModalOpen = true;
        // We can pass the `isUpdate` flag if needed, but for now, just opening is enough.
        // The renderWelcomeModal method will handle the content.
        // To make it reactive, we'd add an `isWelcomeUpdate` property.
    }

    async handleWelcomeFormSubmit(event) {
        event.preventDefault();
        const submitBtn = event.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;

        const form = event.target;
        const formData = new FormData(form);
        const newName = formData.get('welcome-display-name').trim();

        if (!newName || !this.authState.isLoggedIn) return;

        try {
            await updateUserDisplayName(newName);
            this.isWelcomeModalOpen = false;
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

    async handleEmailLogin(event, action) {
        event.preventDefault();
        const form = event.target;
        const formData = new FormData(form);
        const username = formData.get('username');
        const password = formData.get('password');

        if (!username || !password) {
            alert('Please enter both username and password.');
            return;
        }

        // Construct the email from the username
        const email = `${username.trim()}@fir-bingo-app.com`;

        let success = false;
        if (action === 'signin') {
            success = await signInWithEmail(email, password);
        } else if (action === 'signup') {
            success = await createUserWithEmail(email, password);
        }

        if (success) {
            this.hideLoginModal();
            this.hideSignupModal();
        }
    }

    renderWelcomeModal() {
        if (!this.isWelcomeModalOpen) return html``;

        const defaultMessage = 'Please set your display name for the event. This will be shown on leaderboards and submissions.';
        const message = (this.config.welcomeMessage || defaultMessage).replace('{displayName}', this.authState.profile.displayName || 'User');

        return html`
            <div id="welcome-modal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <span class="close-button" @click=${() => { this.isWelcomeModalOpen = false; }}>&times;</span>
                    <h2>Welcome!</h2>
                    <p>${message}</p>
                    <form id="welcome-form" @submit=${this.handleWelcomeFormSubmit}>
                        <label for="welcome-display-name">Display Name</label>
                        <input type="text" id="welcome-display-name" name="welcome-display-name" .value=${this.authState.profile.displayName || ''} required>
                        <button type="submit">Save and Continue</button>
                    </form>
                </div>
            </div>
        `;
    }

    renderLoginModal() {
        if (!this.isLoginModalOpen) return html``;
        return html`
            <div id="login-modal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <span class="close-button" @click=${this.hideLoginModal}>&times;</span>
                    <h2>Sign In</h2>

                    <p>Sign in with your username and password.</p>
                    <form id="email-login-form" class="email-login-form" @submit=${(e) => this.handleEmailLogin(e, 'signin')}>
                        <input type="text" name="username" placeholder="Username" required autocomplete="username">
                        <input type="password" name="password" placeholder="Password" required>
                        <button type="submit">Sign In</button>
                    </form>
                    <p class="modal-switch" style="margin-top: 0.75rem;">Don't have an account? <a href="#" @click=${(e) => { e.preventDefault(); this.hideLoginModal(); this.isSignupModalOpen = true; }}>Sign Up</a></p>

                    
                </div>
            </div>
        `;
    }

    renderSignupModal() {
        if (!this.isSignupModalOpen) return html``;
        return html`
            <div id="signup-modal" class="modal" style="display: flex;">
                <div class="modal-content">
                    <span class="close-button" @click=${this.hideSignupModal}>&times;</span>
                    <h2>Create Account</h2>
                    <p>Create an account to save your progress and join a team.</p>
                    <form id="email-signup-form" class="email-login-form" @submit=${(e) => this.handleEmailLogin(e, 'signup')}>
                        <input type="text" name="username" placeholder="Username" required autocomplete="username">
                        <input type="password" name="password" placeholder="Password (min. 6 characters)" required>
                        <button type="submit">Create Account</button>
                    </form>
                    <p class="modal-switch">Already have an account? <a href="#" @click=${(e) => { e.preventDefault(); this.hideSignupModal(); this.showLoginModal(); }}>Sign In</a></p>
                </div>
            </div>
        `;
    }

    render() {
        const canChangeName = this.authState.isLoggedIn && !this.authState.profile?.isAnonymous && !this.authState.profile?.isNameLocked;

        const desktopActions = html`
            <select id="theme-switcher" @change=${(e) => this.setTheme(e.target.value)}>
                ${this.availableThemes.map(theme => html`<option value="${theme.value}">${theme.text}</option>`)}
            </select>
            ${canChangeName ? html`<button id="change-name-btn" @click=${() => this.showWelcomeModal(true)}>Change Name</button>` : ''}
        `;

        return html`
            <div class="navbar">
                <!-- Desktop Links -->
                <div class="nav-links-desktop">
                    ${this.renderNavLinks()}
                </div>

                <button id="hamburger-btn" class="hamburger" @click=${() => { this.isMobileMenuOpen = !this.isMobileMenuOpen; }}>
                    <span></span><span></span><span></span>
                </button>

                <!-- Mobile Links (conditionally rendered) -->
                <div class="nav-links-mobile ${this.isMobileMenuOpen ? 'active' : ''}">
                    ${this.renderNavLinks()}
                    <div id="mobile-actions-container" style="display: flex; flex-direction: column; gap: 1rem; padding: 1rem; margin-top: 1rem; border-top: 1px solid var(--border-color); align-items: flex-start;">
                        ${desktopActions}
                    </div>
                </div>

                <div id="auth-container" class="nav-actions">
                    ${this.renderAuthInfo()}
                    ${!this.isMobileView ? desktopActions : ''}
                    <button id="auth-button" @click=${() => { this.authState.isLoggedIn ? signOut() : this.showLoginModal(); }}>
                        ${this.authState.isLoggedIn ? 'Logout' : 'Login'}
                    </button>
                </div>
            </div>

            ${this.renderWelcomeModal()}
            ${this.renderLoginModal()}
            ${this.renderSignupModal()}
        `;
    }
}

customElements.define('app-navbar', AppNavbar);

export default AppNavbar;