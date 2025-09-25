import { db, fb } from '../firebase-config.js';

let allTeams = {};
let unsubscribeTeams = null;

/**
 * Listens to the teams collection in real-time.
 * @param {function} callback - Function to call with the teams data.
 */
export function listenToTeams(callback) {
    if (unsubscribeTeams) unsubscribeTeams();

    const teamsQuery = fb.query(fb.collection(db, 'teams'), fb.orderBy(fb.documentId()));
    unsubscribeTeams = fb.onSnapshot(teamsQuery, (snapshot) => {
        allTeams = {};
        snapshot.docs.forEach(doc => {
            allTeams[doc.id] = doc.data();
        });
        callback(allTeams);
    }, (error) => {
        console.error("Error listening to teams:", error);
        callback({ error });
    });
}

/**
 * Returns the currently cached teams object.
 * @returns {object}
 */
export function getTeams() {
    return allTeams;
}

/**
 * Adds a new team.
 * @param {string} teamId - The new team ID (e.g., 'team01').
 * @param {object} data - The initial team data (e.g., { name: 'New Team' }).
 * @returns {Promise}
 */
export function addTeam(teamId, data) {
    return fb.setDoc(fb.doc(db, 'teams', teamId), data);
}

/**
 * Deletes a team.
 * @param {string} teamId - The ID of the team to delete.
 * @returns {Promise}
 */
export function deleteTeam(teamId) {
    return fb.deleteDoc(fb.doc(db, 'teams', teamId));
}