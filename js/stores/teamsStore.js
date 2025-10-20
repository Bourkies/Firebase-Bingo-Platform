import { map } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';

// A map is used for teams because they are a key-value object (teamId: teamData).
export const teamsStore = map({});

let unsubscribe;
let isInitialized = false;

/**
 * Initializes the listener for the 'teams' collection.
 */
export function initTeamsListener() {
    if (isInitialized) return;
    isInitialized = true;

    const teamsQuery = fb.query(fb.collection(db, 'teams'), fb.orderBy(fb.documentId()));

    unsubscribe = fb.onSnapshot(teamsQuery, (snapshot) => {
        console.log('[teamsStore] Received update for teams collection.');
        const newTeams = {};
        snapshot.docs.forEach(doc => {
            newTeams[doc.id] = doc.data();
        });
        teamsStore.set(newTeams);
    }, (error) => {
        console.error("[teamsStore] Error listening to teams:", error);
    });
}

// --- NEW: Write Operations ---

/**
 * Adds a new team with an auto-generated ID.
 * @param {string} docId - The ID for the new team document.
 * @param {object} teamData - The data for the new team.
 * @returns {Promise<void>}
 */
export function addTeam(docId, teamData) {
    // If docId is provided, use it. Otherwise, let Firestore generate one.
    const docRef = docId ? fb.doc(db, 'teams', docId) : fb.doc(fb.collection(db, 'teams'));
    // The onSnapshot listener will update the store automatically.
    return fb.setDoc(docRef, teamData);
}

/**
 * Updates a team document.
 * @param {string} teamId - The ID of the team to update.
 * @param {object} data - The data to merge into the team document.
 * @returns {Promise<void>}
 */
export function updateTeam(teamId, data) {
    const teamRef = fb.doc(db, 'teams', teamId);
    return fb.updateDoc(teamRef, data);
}

/**
 * Deletes a team.
 * @param {string} teamId - The ID of the team to delete.
 * @returns {Promise<void>}
 */
export function deleteTeam(teamId) {
    const teamRef = fb.doc(db, 'teams', teamId);
    return fb.deleteDoc(teamRef);
}