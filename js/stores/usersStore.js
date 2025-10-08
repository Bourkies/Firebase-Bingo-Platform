import { atom } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';
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