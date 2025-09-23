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
        if (onAuthChangeCallback) {
            onAuthChangeCallback(getAuthState());
        }
    });
}

export async function signInWithGoogle() {
    const provider = new fb.GoogleAuthProvider();
    try {
        const result = await fb.signInWithPopup(auth, provider);
        const userDocRef = fb.doc(db, 'users', result.user.uid);
        const userDocSnap = await fb.getDoc(userDocRef);
        if (!userDocSnap.exists()) {
            await fb.setDoc(userDocRef, {
                uid: result.user.uid,
                email: result.user.email,
                displayName: result.user.displayName,
                team: null,
                isAdmin: false,
                isEventMod: false,
                hasSetDisplayName: false
            });
        }
    } catch (error) {
        console.error("Google Sign-In Error:", error);
        alert("Could not sign in with Google. Please try again.");
    }
}

export async function signOut() {
    try {
        await fb.signOut(auth);
    } catch (error) {
        console.error("Sign Out Error:", error);
    }
}

async function fetchUserProfile(uid) {
    const userDocRef = fb.doc(db, 'users', uid);
    const userDocSnap = await fb.getDoc(userDocRef);
    userProfile = userDocSnap.exists() ? userDocSnap.data() : null;
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