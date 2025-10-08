import { atom } from 'nanostores';

// The authStore holds the user's authentication state and profile.
// It's special because it's not populated by its own listener, but rather
// by the core auth.js service.

const defaultState = {
    isLoggedIn: false,
    user: null,
    profile: null,
    isAdmin: false,
    isEventMod: false,
    isTeamCaptain: false,
};

export const authStore = atom(defaultState);

// No initListener function here.
// The state will be updated by js/core/auth.js inside onAuthStateChanged.
// We will modify that file in a later step.