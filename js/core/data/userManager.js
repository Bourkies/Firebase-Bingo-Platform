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
    if (!authState || authState.isEventMod) {
        usersQuery = fb.collection(db, 'users');
    } else if (authState.isLoggedIn && authState.profile?.team) {
        // If a regular user is logged in and on a team, fetch only their teammates.
        usersQuery = fb.query(fb.collection(db, 'users'), fb.where('team', '==', authState.profile.team));
    } else {
        // If logged out or not on a team, return an empty list and don't listen.
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

// Other user management functions like updateUser would go here.