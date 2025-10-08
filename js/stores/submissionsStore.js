import { atom } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';

// This store will hold the array of all submission documents.
export const submissionsStore = atom([]);

let unsubscribe;
let isInitialized = false;

/**
 * Initializes the listener for the 'submissions' collection.
 */
export function initSubmissionsListener() {
    if (isInitialized) return;
    isInitialized = true;

    const submissionsQuery = fb.query(fb.collection(db, 'submissions'), fb.orderBy('Timestamp', 'desc'));

    unsubscribe = fb.onSnapshot(submissionsQuery, (snapshot) => {
        console.log('[submissionsStore] Received update for submissions collection.');
        const submissions = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                docId: doc.id,
                Timestamp: data.Timestamp?.toDate(), // Convert Firestore Timestamp to JS Date
                CompletionTimestamp: data.CompletionTimestamp?.toDate() // Convert Firestore Timestamp to JS Date
            };
        });
        submissionsStore.set(submissions);
    }, (error) => {
        console.error("[submissionsStore] Error listening to submissions:", error);
        submissionsStore.set([]); // Set to empty array on error
    });
}