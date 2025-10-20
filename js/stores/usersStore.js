import { atom } from 'nanostores';
import { db, fb, auth } from '../core/firebase-config.js';
import { authStore } from './authStore.js';

// This store will hold the array of all user documents.
export const usersStore = atom([]);

let unsubscribe;

/**
 * Initializes the listener for the 'users' collection.
 */
export function initUsersListener() {
    // This listener depends on auth state to know if it has permission.
    authStore.subscribe(handleAuthStateChange);
}

function handleAuthStateChange(authState) {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    // Only admins/mods should listen to the full user list.
    if (!authState.isEventMod) {
        console.log('[usersStore] User is not an admin/mod. Not listening to users collection.');
        usersStore.set([]); // Clear data if permissions are lost
        return;
    }

    console.log('[usersStore] User is admin/mod. Listening to users collection.');
    const usersQuery = fb.collection(db, 'users');
    unsubscribe = fb.onSnapshot(usersQuery, (snapshot) => {
        const users = snapshot.docs.map(doc => ({
            ...doc.data(),
            uid: doc.id
        }));
        usersStore.set(users);
    }, (error) => {
        console.error("[usersStore] Error listening to users:", error);
        usersStore.set([]);
    });
}

// --- NEW: Write Operations ---

/**
 * Updates a specific user document in Firestore.
 * @param {string} uid - The ID of the user to update.
 * @param {object} data - An object containing the fields to update.
 * @returns {Promise<void>}
 */
export async function updateUser(uid, data) {
    if (!uid) {
        throw new Error("User ID is required to update a user.");
    }
    const userRef = fb.doc(db, 'users', uid);
    return fb.updateDoc(userRef, data);
}

/**
 * Updates a user's display name in both Firebase Auth and their Firestore profile.
 * @param {string} newName - The new display name.
 * @returns {Promise<void>}
 */
export async function updateUserDisplayName(newName) {
    const currentUser = auth.currentUser;
    const userProfile = authStore.get().profile;

    if (!currentUser || !userProfile) {
        throw new Error("User not authenticated.");
    }
    if (userProfile.isNameLocked) {
        throw new Error("Your display name has been locked by an administrator.");
    }

    const userRef = fb.doc(db, 'users', currentUser.uid);
    const authProfileUpdate = fb.updateProfile(currentUser, { displayName: newName });
    const firestoreUpdate = fb.updateDoc(userRef, { displayName: newName, hasSetDisplayName: true });

    // The onSnapshot listener in auth.js will automatically detect the Firestore change
    // and trigger the authStore to update the UI across the app.
    await Promise.all([authProfileUpdate, firestoreUpdate]);
}