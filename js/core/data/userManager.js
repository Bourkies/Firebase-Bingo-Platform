import { db, fb } from '../firebase-config.js';

/**
 * Listens for real-time updates to the users collection.
 * @param {function} callback - The function to call with the new users data.
 * @param {object} [authState] - Optional auth state to determine query.
 * @returns {function} An unsubscribe function.
 */
export function listenToUsers(callback, authState) {
    let usersQuery;

    // FIX: Correctly handle optional authState argument.
    // If authState is not provided or the user is an admin/mod, fetch all users.
    if (!authState || authState.isEventMod || !authState.isLoggedIn) {
        usersQuery = fb.collection(db, 'users');
    } else if (authState.isLoggedIn && authState.profile?.team) {
        // If a regular user is logged in and on a team, fetch only their teammates.
        usersQuery = fb.query(fb.collection(db, 'users'), fb.where('team', '==', authState.profile.team));
    } else {
        // If logged out or not on a team, return an empty list and don't listen.
        console.log("userManager: User is logged out or not on a team. Returning empty user list.");
        callback([]);
        return () => {}; // Return a no-op unsubscribe function.
    }

    return fb.onSnapshot(usersQuery, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id }));
        callback(users);
    }, (error) => {
        console.error("Error listening to users:", error);
        callback([]); // On error, return an empty array to prevent crashes.
    });
}

/**
 * Updates a specific user document in Firestore.
 * @param {string} uid - The ID of the user to update.
 * @param {object} data - An object containing the fields to update.
 */
export async function updateUser(uid, data) {
    if (!uid) {
        throw new Error("User ID is required to update a user.");
    }
    const userRef = fb.doc(db, 'users', uid);
    await fb.updateDoc(userRef, data);
}