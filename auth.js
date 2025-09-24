import { db, auth, fb } from './firebase-config.js';

let currentUser = null;
let userProfile = null;
let onAuthChangeCallback = null;

export function initAuth(callback) {
    onAuthChangeCallback = callback;
    fb.onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            await fetchUserProfile(user.uid);
        } else {
            currentUser = null;
            userProfile = null;
        }
        handleRedirectResult(); // Check for Apple Sign-In redirect result
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

export async function signInWithApple() {
    const provider = new fb.AppleAuthProvider();
    // Apple sign-in works best with redirect, especially on mobile.
    await fb.signInWithRedirect(auth, provider);
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

// This function runs on page load to catch the result from Apple's redirect.
async function handleRedirectResult() {
    try {
        const result = await fb.getRedirectResult(auth);
        if (result) {
            // User signed in with Apple. onAuthStateChanged will now fire.
            console.log("Apple Sign-In redirect result processed.");
        }
    } catch (error) {
        console.error("Apple Sign-In Redirect Error:", error);
        if (error.code === 'auth/account-exists-with-different-credential') {
            alert("An account already exists with the same email address. Please sign in using the original method.");
        }
    }
}

async function fetchUserProfile(uid, isAnonymous = false, initialDisplayName = null, email = null) {
    const userDocRef = fb.doc(db, 'users', uid);
    const userDocSnap = await fb.getDoc(userDocRef);

    if (!userDocSnap.exists()) {
        // Create a new user profile if it doesn't exist
        const newUserProfile = {
            uid: uid,
            email: email,
            displayName: isAnonymous ? `Anonymous-${uid.substring(0, 5)}` : (initialDisplayName || `User-${uid.substring(0,5)}`),
            team: null,
            isAdmin: false,
            isEventMod: false,
            isAnonymous: isAnonymous,
            isNameLocked: false, // NEW: Add lock field
            // For anonymous users, we don't prompt them to change their name.
            // For new Google/Apple users, we do.
            hasSetDisplayName: isAnonymous
        };
        await fb.setDoc(userDocRef, newUserProfile);
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
    try {
        await fb.updateDoc(userRef, {
            displayName: newName,
            hasSetDisplayName: true
        });
        // Manually update local state to reflect change immediately
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
    const profile = userProfile || {};
    const isAdmin = profile.isAdmin === true;
    const isEventMod = isAdmin || profile.isEventMod === true;

    return {
        isLoggedIn: !!currentUser,
        user: currentUser,
        profile: userProfile,
        isAdmin: isAdmin,
        isEventMod: isEventMod,
    };
}