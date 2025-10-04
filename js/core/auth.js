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

export async function signInWithEmail(email, password) {
    try {
        await fb.signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest.
        return true; // Indicate success
    } catch (error) {
        console.error("Email/Password Sign-In Error:", error);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            alert('Sign-in failed: Invalid email or password.');
        } else {
            alert(`Sign-in failed: ${error.message}`);
        }
        return false; // Indicate failure
    }
}

export async function createUserWithEmail(email, password) {
    try {
        await fb.createUserWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest.
        return true; // Indicate success
    } catch (error) {
        console.error("Email/Password Account Creation Error:", error);
        if (error.code === 'auth/email-already-in-use') {
            alert('Sign-up failed: An account with this email already exists. Please try signing in instead.');
        } else if (error.code === 'auth/weak-password') {
            alert('Sign-up failed: The password is too weak. It must be at least 6 characters long.');
        } else {
            alert(`Could not create account: ${error.message}`);
        }
        return false; // Indicate failure
    }
}

function listenToUserProfile(uid, isAnonymous, initialDisplayName, email) {
    const userDocRef = fb.doc(db, 'users', uid);
    console.log(`[Auth] Setting up profile listener for user.`);

    unsubscribeUserProfile = fb.onSnapshot(userDocRef, async (docSnap) => {
        const oldTeam = userProfile?.team; // Store the old team before updating
        console.log('[Auth] Profile snapshot received.');

        if (!docSnap.exists()) {
            console.log('[Auth] Profile does not exist. Creating new profile.');
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
                return; // Exit early, the next snapshot will have the data.
            } catch (error) {
                console.error("Error creating user profile:", error);
            }
        }
        
        userProfile = docSnap.data();
        console.log('[Auth] User profile data:', { displayName: userProfile.displayName, team: userProfile.team, isAdmin: userProfile.isAdmin });

        // After getting the user profile, check if they are a team captain.
        let isTeamCaptain = false;
        if (userProfile?.team) {
            console.log(`[Auth] User is in team '${userProfile.team}'. Checking captain status.`);
            try {
                const teamDocRef = fb.doc(db, 'teams', userProfile.team);
                const teamDocSnap = await fb.getDoc(teamDocRef);
                if (teamDocSnap.exists() && teamDocSnap.data().captain === uid) {
                    isTeamCaptain = true;
                }
                console.log(`[Auth] Captain check result: ${isTeamCaptain}.`);
            } catch (error) {
                console.error("Error checking team captain status:", error);
            }
        } else {
            console.log('[Auth] User is not in a team. Skipping captain check.');
        }

        // After the profile is fetched or updated, notify the page controller.
        const authState = getAuthState(isTeamCaptain);
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
    const authProfileUpdate = fb.updateProfile(currentUser, { displayName: newName });
    const firestoreUpdate = fb.updateDoc(userRef, { displayName: newName, hasSetDisplayName: true });

    try {
        // The onSnapshot listener in listenToUserProfile will automatically detect the Firestore change
        // and trigger the onAuthChangeCallback to update the UI across the app.
        await Promise.all([
            authProfileUpdate,
            firestoreUpdate
        ]);
    } catch (error) {
        console.error("Display name update error:", error);
        throw new Error("Failed to update display name: " + error.message);
    }
}

function notifyListeners(authState = null) {
    const state = authState || getAuthState(false); // Pass a default for isTeamCaptain
    console.log('[Auth] Notifying listeners with state:', { isLoggedIn: state.isLoggedIn, isAdmin: state.isAdmin, isEventMod: state.isEventMod, isTeamCaptain: state.isTeamCaptain });
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

export function getAuthState(isTeamCaptain = false) {
    console.log(`[Auth] getAuthState called. isTeamCaptain parameter: ${isTeamCaptain}`);
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
        isTeamCaptain: isTeamCaptain,
    };
}