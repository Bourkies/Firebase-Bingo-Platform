import { initAuth } from './core/auth.js';
import { authStore } from './stores/authStore.js';
import { initConfigListener } from './stores/configStore.js';
import { initTeamsListener, teamsStore } from './stores/teamsStore.js';
import { initTilesListener } from './stores/tilesStore.js';
import { initUsersListener } from './stores/usersStore.js';
import { initSubmissionsListener } from './stores/submissionsStore.js';

let areStoresInitialized = false;

/**
 * Initializes all global data stores and sets up derived state calculations.
 * This function is designed to be called once per application load.
 */
export function initializeApp() {
    if (areStoresInitialized) return;
    areStoresInitialized = true;

    console.log('[AppInit] Initializing all global data stores...');

    // The order matters for dependencies: auth -> config -> others
    initAuth(() => {}); // Kicks off auth process, which populates authStore
    initConfigListener();
    initTeamsListener();
    initTilesListener();
    initUsersListener();
    initSubmissionsListener();

    // --- Derived State Calculation ---
    // Listen to both auth and teams stores to calculate captain status.
    // This is the single source of truth for the isTeamCaptain flag.
    const recalculateCaptainStatus = () => {
        const authState = authStore.get();
        const allTeams = teamsStore.get();

        // If the user is not logged in, we can be certain they are not a captain.
        if (!authState.isLoggedIn) {
            if (authState.isTeamCaptain) authStore.setKey('isTeamCaptain', false);
            return;
        }

        // If the user is logged in, but we don't have the data yet, do nothing.
        // This prevents the status from flickering to false during loading.
        if (!authState.profile?.team || Object.keys(allTeams).length === 0) {
            return;
        }

        const isCaptain = allTeams[authState.profile.team]?.captainId === authState.user.uid;
        if (authState.isTeamCaptain !== isCaptain) { // Only update if the status has actually changed.
            authStore.setKey('isTeamCaptain', isCaptain);
        }
    };

    authStore.subscribe(recalculateCaptainStatus);
    teamsStore.subscribe(recalculateCaptainStatus);
}