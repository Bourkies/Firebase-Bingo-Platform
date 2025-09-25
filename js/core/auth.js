import { db, auth, fb } from './firebase-config.js';

let currentUser = null;
let userProfile = null;
let authChangeListeners = []; // Use an array for multiple listeners
let unsubscribeUserProfile = null; // To clean up the profile listener on logout
let isAuthInitialized = false; // Prevent multiple initializations

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

        if (user) {
            currentUser = user; // Set currentUser immediately
            // Immediately notify the page that the user is logged in, even before the profile is fetched.
            notifyListeners();
            // Set up a real-time listener for the user's profile
            listenToUserProfile(user.uid, user.isAnonymous, user.displayName, user.email);
        } else {
            currentUser = null;
            userProfile = null;
            // When logged out, immediately notify the page
            notifyListeners();
        }
    });
}

export async function signInWithGoogle() {
    const provider = new fb.GoogleAuthProvider();
    try {
        await fb.signInWithPopup(auth, provider);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        alert("Could not sign in with Google. Please try again.");
    }
}

export async function signInAnonymously() {
    try {
        await fb.signInAnonymously(auth);
        // onAuthStateChanged will handle the rest
    } catch (error) {
        console.error("Anonymous Sign-In Error:", error);
        alert("Could not sign in anonymously. Please try again.");
    }
}

function listenToUserProfile(uid, isAnonymous, initialDisplayName, email) {
    const userDocRef = fb.doc(db, 'users', uid);

    unsubscribeUserProfile = fb.onSnapshot(userDocRef, async (docSnap) => {
        const oldTeam = userProfile?.team; // Store the old team before updating

        if (!docSnap.exists()) {
            // Create a new user profile if it doesn't exist
            const initialAuthDisplayName = isAnonymous ? `Anonymous-${uid.substring(0, 5)}` : (initialDisplayName || email || `User-${uid.substring(0,5)}`);
            const newUserProfile = {
                displayName: initialAuthDisplayName,
                team: null,
                isAdmin: false,
                isEventMod: false,
                isAnonymous: isAnonymous,
                isNameLocked: false,
                hasSetDisplayName: isAnonymous
            };
            
            try {
                await fb.setDoc(userDocRef, newUserProfile);
                // The listener will fire again with the newly created doc, so we don't set userProfile here.
            } catch (error) {
                console.error("Error creating user profile:", error);
            }
        } else {
            userProfile = docSnap.data();
        }

        // After the profile is fetched or updated, notify the page controller.
        const authState = getAuthState();
        // Add a flag to the authState if the team was changed by this update
        if (oldTeam !== undefined && oldTeam !== authState.profile?.team) {
            authState.teamChanged = true;
        }
        notifyListeners(authState);
    }, (error) => {
        console.error("Error listening to user profile:", error);
        // In case of error, still provide a callback with the current (possibly null) state
        notifyListeners();
    });
}

export async function updateUserDisplayName(newName) {
    if (!currentUser || !userProfile) {
        throw new Error("User not authenticated.");
    }
    if (userProfile.isNameLocked) {
        throw new Error("Your display name has been locked by an administrator.");
    }

    const userRef = fb.doc(db, 'users', currentUser.uid);
    try {
        // The Firestore document is the single source of truth for the display name.
        // The onSnapshot listener in listenToUserProfile will automatically detect this change
        // and trigger the onAuthChangeCallback to update the UI across the app.
        await fb.updateDoc(userRef, { displayName: newName, hasSetDisplayName: true });
    } catch (error) {
        console.error("Display name update error:", error);
        throw new Error("Failed to update display name: " + error.message);
    }
}

function notifyListeners(authState = null) {
    const state = authState || getAuthState();
    authChangeListeners.forEach(listener => {
        listener(state);
    });
}

export async function signOut() {
    try {
        await fb.signOut(auth);
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
}

export function getAuthState() {
    const isLoggedIn = !!currentUser;
    const firestoreProfile = userProfile || {};
    const authProfile = currentUser || {};

    // Merge the Firestore profile with the Auth profile for a complete view.
    const fullProfile = isLoggedIn ? {
        ...firestoreProfile, // isAnonymous, isAdmin, isEventMod, team, etc.
        uid: authProfile.uid,
        displayName: firestoreProfile.displayName || authProfile.displayName, // Prioritize Firestore name
        email: authProfile.email, // Email only comes from auth
    } : null;

    return {
        isLoggedIn: isLoggedIn,
        user: currentUser,
        profile: fullProfile,
        isAdmin: fullProfile?.isAdmin === true,
        isEventMod: fullProfile?.isAdmin === true || fullProfile?.isEventMod === true,
    };
}