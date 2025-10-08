import { atom } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';

export const submissionsStore = atom([]);

let unsubscribe = null;

export function initSubmissionsListener() {
    if (unsubscribe) {
        console.log('[SubmissionsStore] Listener already initialized.');
        return unsubscribe;
    }

    const submissionsCollection = fb.collection(db, 'submissions');

    unsubscribe = fb.onSnapshot(submissionsCollection, (snapshot) => {
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
        console.log(`[SubmissionsStore] Submissions updated. Count: ${submissions.length}`);
    }, (error) => {
        console.error("[SubmissionsStore] Error fetching submissions:", error);
    });

    return unsubscribe;
}

/**
 * Saves or creates a submission. Handles both new drafts and updates.
 * @param {string|null} docId - The document ID to update, or null to create a new one.
 * @param {object} data - The submission data to save.
 */
export async function saveSubmission(docId, data) {
    if (docId) {
        const subRef = fb.doc(db, 'submissions', docId);
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