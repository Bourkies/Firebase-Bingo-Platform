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