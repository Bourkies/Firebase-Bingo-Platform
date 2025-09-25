import { db, auth, fb } from './firebase-config.js';

let currentUser = null;
let userProfile = null;
let onAuthChangeCallback = null;

export function initAuth(callback) {
    onAuthChangeCallback = callback;
    fb.onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user; // Set currentUser immediately
            // CRITICAL FIX: await the profile fetch before proceeding.
            await fetchUserProfile(user.uid, user.isAnonymous, user.displayName, user.email);
        } else {
            currentUser = null;
            userProfile = null;
        }
        if (onAuthChangeCallback) {
            onAuthChangeCallback(getAuthState());
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

async function fetchUserProfile(uid, isAnonymous = false, initialDisplayName = null, email = null) {
    const userDocRef = fb.doc(db, 'users', uid);
    const userDocSnap = await fb.getDoc(userDocRef);

    if (!userDocSnap.exists()) {
        // Create a new user profile if it doesn't exist
        const initialAuthDisplayName = isAnonymous ? `Anonymous-${uid.substring(0, 5)}` : (initialDisplayName || email || `User-${uid.substring(0,5)}`);
        const newUserProfile = {
            displayName: initialAuthDisplayName,
            team: null,
            isAdmin: false,
            isEventMod: false,
            isAnonymous: isAnonymous,
            isNameLocked: false, // NEW: Add lock field
            // For anonymous users, we don't prompt them to change their name. For new Google users, we do.
            hasSetDisplayName: isAnonymous
        };
        
        // We perform two separate operations: one to create the Firestore doc,
        // and one to update the Auth user's profile.
        await fb.setDoc(userDocRef, newUserProfile); 
        await fb.updateProfile(auth.currentUser, { displayName: initialAuthDisplayName });

        userProfile = newUserProfile;
    } else {
        userProfile = userDocSnap.data();
    }
}

export async function updateUserDisplayName(newName) {
    if (!currentUser || !userProfile) {
        throw new Error("User not authenticated.");
    }
    if (userProfile.isNameLocked) {
        throw new Error("Your display name has been locked by an administrator.");
    }

    const userRef = fb.doc(db, 'users', currentUser.uid);
    const authUser = auth.currentUser;
    try {
        // Update both the auth profile and the firestore doc in parallel
        // The Firestore document is the single source of truth for the display name.
        await fb.updateDoc(userRef, { displayName: newName, hasSetDisplayName: true });

        // Manually update local state to reflect change immediately
        // The onAuthStateChanged listener will handle UI updates by re-fetching the profile.
        userProfile.displayName = newName;
        userProfile.hasSetDisplayName = true;
        // Notify the main app that auth state has changed
        if (onAuthChangeCallback) {
            onAuthChangeCallback(getAuthState());
        }
    } catch (error) {
        console.error("Display name update error:", error);
        throw new Error("Failed to update display name: " + error.message);
    }
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