import { atom, onMount } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';

export const submissionsStore = atom([]);

onMount(submissionsStore, () => {
    console.log('[SubmissionsStore] Mounted. Starting listener...');
    const submissionsCollection = fb.collection(db, 'submissions');

    const unsubscribe = fb.onSnapshot(submissionsCollection, (snapshot) => {
        const source = snapshot.metadata.fromCache ? "local cache" : "server";
        console.log(`[SubmissionsStore] Submissions updated from ${source}. Count: ${snapshot.docs.length}`);
        const submissions = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                docId: doc.id,
                // Convert Firestore Timestamps to JS Date objects
                Timestamp: data.Timestamp?.toDate(),
                CompletionTimestamp: data.CompletionTimestamp?.toDate(),
                history: (data.history || []).map(h => ({
                    ...h,
                    timestamp: h.timestamp?.toDate()
                }))
            };
        });
        submissionsStore.set(submissions);
    }, (error) => {
        console.error("[SubmissionsStore] Error fetching submissions:", error);
        if (error.code === 'permission-denied') {
            submissionsStore.set([]);
        }
    });

    return () => {
        console.log('[SubmissionsStore] Unmounted. Stopping listener.');
        unsubscribe();
    };
});

/**
 * Starts a listener for a specific team's submissions.
 * Used by the Index page to reduce reads.
 * @param {string} teamId - The team ID to listen for.
 * @param {object} storeToUpdate - The Nano Store atom to update with the results.
 * @returns {function} - Unsubscribe function.
 */
export function startTeamSubmissionsListener(teamId, storeToUpdate) {
    if (!teamId) {
        storeToUpdate.set([]);
        return () => {};
    }

    console.log(`[SubmissionsStore] Starting listener for Team: ${teamId}`);
    const q = fb.query(
        fb.collection(db, 'submissions'),
        fb.where('Team', '==', teamId)
    );

    return fb.onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(doc => processSubmissionDoc(doc));
        storeToUpdate.set(subs);
    }, (error) => {
        console.error(`[SubmissionsStore] Error listening to team ${teamId}:`, error);
    });
}

/**
 * Starts a listener for the activity feed (Last 50 items).
 * Used by the Overview page.
 * @param {object} storeToUpdate - The Nano Store atom to update.
 * @returns {function} - Unsubscribe function.
 */
export function startFeedListener(storeToUpdate) {
    console.log(`[SubmissionsStore] Starting Feed listener (Limit 50)`);
    const q = fb.query(
        fb.collection(db, 'submissions'),
        fb.orderBy('Timestamp', 'desc'),
        fb.limit(50)
    );

    return fb.onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(doc => processSubmissionDoc(doc));
        storeToUpdate.set(subs);
    }, (error) => {
        console.error(`[SubmissionsStore] Error listening to feed:`, error);
    });
}

/**
 * Starts a listener for the Overview page.
 * Optimizes reads by only fetching COMPLETED submissions (ignoring drafts)
 * and respecting the board visibility setting.
 * @param {object} storeToUpdate - The Nano Store atom to update.
 * @param {object} options - { isPublic: boolean, teamId: string }
 * @returns {function} - Unsubscribe function.
 */
export function startOverviewListener(storeToUpdate, { isPublic, teamId }) {
    let q;
    const collectionRef = fb.collection(db, 'submissions');

    if (!isPublic) {
        // Private Board: Load only the user's team (Admins see as player)
        if (!teamId) {
            storeToUpdate.set([]);
            return () => {};
        }
        q = fb.query(collectionRef, fb.where('Team', '==', teamId));
    } else {
        // Public Board: Load all COMPLETED submissions.
        // Optimization: We filter 'IsComplete == true' to avoid reading drafts.
        // We do NOT limit the count because the Chart/Leaderboard need full history.
        q = fb.query(collectionRef, fb.where('IsComplete', '==', true));
    }

    return fb.onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(doc => processSubmissionDoc(doc));
        storeToUpdate.set(subs);
    }, (error) => {
        console.error("[SubmissionsStore] Error in overview listener:", error);
        storeToUpdate.set([]);
    });
}

/**
 * Saves or creates a submission. Handles both new drafts and updates.
 * @param {string|null} docId - The document ID to update, or null to create a new one.
 * @param {object} data - The submission data to save. 
 * @param {boolean} [isNew=false] - Set to true if creating a new document with a specific ID.
 */
export async function saveSubmission(docId, data, isNew = false) {
    if (docId) {
        const subRef = fb.doc(db, 'submissions', docId);
        if (isNew) {
            // Use setDoc to create a new document with a specific ID.
            return await fb.setDoc(subRef, data);
        }
        // Use updateDoc for existing documents.
        return await fb.updateDoc(subRef, data);
    } else {
        const submissionsCollection = fb.collection(db, 'submissions');
        return await fb.addDoc(submissionsCollection, data);
    }
}

/**
 * Updates a submission from the admin panel.
 * @param {string} docId - The document ID to update.
 * @param {object} dataToUpdate - The fields to update.
 * @param {object|null} historyEntry - The history entry to add, if any.
 */
export async function updateSubmission(docId, dataToUpdate, historyEntry) {
    const subRef = fb.doc(db, 'submissions', docId);
    const finalData = { ...dataToUpdate };
    if (historyEntry) {
        finalData.history = fb.arrayUnion(historyEntry);
    }
    return await fb.updateDoc(subRef, finalData);
}

/**
 * Imports submissions in bulk using batch writes.
 * @param {Array<object>} operations - An array of operation objects ({type, ref, data}).
 */
export async function importSubmissions(operations) {
    const BATCH_SIZE = 499;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = fb.writeBatch(db);
        const chunk = operations.slice(i, i + BATCH_SIZE);
        chunk.forEach(op => {
            if (op.type === 'set') {
                const docRef = op.docId ? fb.doc(db, 'submissions', op.docId) : fb.doc(fb.collection(db, 'submissions'));
                batch.set(docRef, op.data, { merge: true });
            } else if (op.type === 'update') {
                const docRef = fb.doc(db, 'submissions', op.docId);
                batch.update(docRef, op.data);
            } else if (op.type === 'add') {
                batch.set(fb.doc(fb.collection(db, 'submissions')), op.data);
            }
        });
        await batch.commit();
    }
}

// Helper to process raw Firestore doc into our app format
function processSubmissionDoc(doc) {
    const data = doc.data();
    return {
        ...data,
        docId: doc.id,
        Timestamp: data.Timestamp?.toDate(),
        CompletionTimestamp: data.CompletionTimestamp?.toDate(),
        history: (data.history || []).map(h => ({
            ...h,
            timestamp: h.timestamp?.toDate()
        }))
    };
}

/**
 * Deletes all submissions from the database.
 */
export async function clearAllSubmissions() {
    const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
    if (snapshot.empty) return;

    const BATCH_SIZE = 499;
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
        const batch = fb.writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}