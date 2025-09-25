import { db, fb } from '../firebase-config.js';

let allUsers = [];
let unsubscribeUsers = null;

/**
 * Listens to the users collection, filtering based on auth state.
 * @param {object} authState - The current authentication state from auth.js.
 * @param {function} callback - Function to call with the users data.
 */
export function listenToUsers(authState, callback) {
    if (unsubscribeUsers) unsubscribeUsers();

    let usersQuery;
    if (authState.isEventMod) {
        // Admins/mods can see all users.
        usersQuery = fb.collection(db, 'users');
    } else if (authState.isLoggedIn && authState.profile?.team) {
        // Regular players can only see their own teammates.
        usersQuery = fb.query(fb.collection(db, 'users'), fb.where('team', '==', authState.profile.team));
    } else {
        // Logged out or teamless users see no one.
        allUsers = [];
        callback(allUsers);
        return;
    }

    unsubscribeUsers = fb.onSnapshot(usersQuery, (snapshot) => {
        allUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id }));
        callback(allUsers);
    }, (error) => {
        console.error("Error listening to users:", error);
        callback({ error });
    });
}

/**
 * Returns the currently cached users array.
 * @returns {Array<object>}
 */
export function getUsers() {
    return allUsers;
}