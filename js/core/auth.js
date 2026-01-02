import { db, auth, fb } from './firebase-config.js';
import { authStore } from '../stores/authStore.js';
import { teamsStore } from '../stores/teamsStore.js';

let currentUser = null;
let userProfile = null;
let unsubscribeUserProfile = null; // To clean up the profile listener on logout
let isAuthInitialized = false; // Prevent multiple initializations

// DEPRECATED: This will be removed once all pages are refactored.
// For now, it ensures backward compatibility with pages still using the old callback system.
let authChangeListeners = [];

let authStateHasBeenChecked = false;

export function initAuth(callback) {
    if (!authChangeListeners.includes(callback)) {
        authChangeListeners.push(callback);
    }
    // If auth is already initialized, immediately call back with the current state.
    if (isAuthInitialized) {
        callback(getAuthState());
        return;
    }
    isAuthInitialized = true;


    fb.onAuthStateChanged(auth, async (user) => {
        // Clean up any existing profile listener when auth state changes
        if (unsubscribeUserProfile) {
            unsubscribeUserProfile();
            unsubscribeUserProfile = null;
        }

        authStateHasBeenChecked = true; // Mark that the initial check has completed.
        if (user) {
            currentUser = user; // Set currentUser immediately
            // Immediately notify listeners that the user is logged in, even before the profile is fetched.
            notifyListeners();
            // Set up a real-time listener for the user's profile
            listenToUserProfile(user.uid, user.displayName, user.email);
        } else {
            currentUser = null;
            userProfile = null;
            // When logged out, immediately notify listeners
            notifyListeners();
        }
    });
}



export async function signInWithEmail(email, password) {
    try {
        await fb.signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest.
        return { success: true };
    } catch (error) {
        console.warn("Sign-In:", error.code); // Less aggressive logging
        let message = `Sign-in failed: ${error.message}`;
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            message = 'Invalid username or password.';
        }
        return { success: false, message };
    }
}

export async function createUserWithEmail(email, password) {
    try {
        await fb.createUserWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest.
        return { success: true };
    } catch (error) {
        console.warn("Account Creation:", error.code);
        let message = `Could not create account: ${error.message}`;
        if (error.code === 'auth/email-already-in-use') {
            message = 'Username is already taken. Please try another.';
        } else if (error.code === 'auth/weak-password') {
            message = 'Password is too weak. It must be at least 6 characters.';
        }
        return { success: false, message };
    }
}

function listenToUserProfile(uid, initialDisplayName, email) {
    const userDocRef = fb.doc(db, 'users', email);
    console.log(`[Auth] Setting up profile listener for user path: users/${email}`);

    unsubscribeUserProfile = fb.onSnapshot(userDocRef, async (docSnap) => {
        const oldTeam = userProfile?.team; // Store the old team before updating
        console.log('[Auth] Profile snapshot received.');

        if (!docSnap.exists()) {
            console.log('[Auth] Profile does not exist. Creating new profile.');
            // Create a new user profile if it doesn't exist
            
            // NEW: Derive display name from email (username) if available
            let defaultDisplayName = initialDisplayName;
            if (!defaultDisplayName && currentUser.email) {
                defaultDisplayName = currentUser.email.split('@')[0];
            }
            if (!defaultDisplayName) defaultDisplayName = `User-${uid.substring(0,5)}`;

            const newUserProfile = {
                uid: uid,
                displayName: defaultDisplayName,
                team: null,
                isAdmin: false,
                isEventMod: false,
                isNameLocked: false,
                hasSetDisplayName: true, // Auto-set to username, so we skip the welcome modal
                // FIX: Use the email from the currentUser object, which is more reliable on creation.
                email: currentUser.email 
            };
            
            try {
                await fb.setDoc(userDocRef, newUserProfile);
                // The listener will fire again with the newly created doc, so we don't set userProfile here.
                return; // Exit early, the next snapshot will have the data.
            } catch (error) {
                console.error("Error creating user profile:", error);
            }
        }
        
        // If the document exists, check if we need to backfill the email.
        if (docSnap.exists()) {
            const profileData = docSnap.data();
            const isPasswordUser = currentUser.providerData.some(p => p.providerId === 'password');
            // If it's a password user and the email field is missing from their profile
            if (isPasswordUser && !profileData.email) {
                console.log('[Auth] Backfilling missing email for existing username/password user.');
                try {
                    await fb.updateDoc(userDocRef, { email: currentUser.email });
                    // The listener will fire again with the updated data, so we exit here to avoid processing stale data.
                    return;
                } catch (error) { console.error("Error backfilling user email:", error); }
            }
        }

        userProfile = docSnap.data();
        console.log('[Auth] User profile data:', { displayName: userProfile.displayName, team: userProfile.team, isAdmin: userProfile.isAdmin });

        // After the profile is fetched or updated, notify the page controller.
        notifyListeners();
    }, (error) => {
        console.error("Error listening to user profile:", error);
        // In case of error, still provide a callback with the current (possibly null) state
        notifyListeners();
    });
}

function notifyListeners() {
    // NEW: Always get the state from the store, which now holds the latest captain status.
    const state = getAuthState();
    console.log('[Auth] Notifying listeners with state:', { isLoggedIn: state.isLoggedIn, isAdmin: state.isAdmin, isEventMod: state.isEventMod, isTeamCaptain: state.isTeamCaptain });
    
    // Update the store with the complete, fresh state.
    authStore.set(state);

    // DEPRECATED: Notify old-style listeners. This can be removed later.
    authChangeListeners.forEach(listener => {
        listener(state);
    });
}

export async function signOut() {
    try {
        await fb.signOut(auth);
        // onAuthStateChanged will handle cleanup and notifications.
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
}

export function getAuthState() {
    console.log(`[Auth] getAuthState called.`);
    const currentStoreState = authStore.get();
    const isLoggedIn = !!currentUser;
    const firestoreProfile = userProfile || {};
    const authProfile = currentUser || {};

    // Merge the Firestore profile with the Auth profile for a complete view.
    const oldTeam = currentStoreState.profile?.team;

    const fullProfile = isLoggedIn ? {
        ...firestoreProfile, // isAdmin, isEventMod, team, etc.
        uid: authProfile.uid,
        displayName: firestoreProfile.displayName || authProfile.displayName, // Prioritize Firestore name
        // Prioritize Firestore email (for username/pass), fallback to auth email
        email: firestoreProfile.email || authProfile.email,
    } : null;

    const newTeam = fullProfile?.team;

    return {
        isLoggedIn: isLoggedIn,
        user: currentUser,
        profile: fullProfile,
        isAdmin: fullProfile?.isAdmin === true,
        isEventMod: fullProfile?.isAdmin === true || fullProfile?.isEventMod === true,
        isTeamCaptain: currentStoreState.isTeamCaptain, // The value is now derived in app-init.js
        teamChanged: oldTeam !== undefined && oldTeam !== newTeam,
        authChecked: authStateHasBeenChecked // NEW: Signal that the initial auth check is done.
    };
}