import { db, fb } from '../firebase-config.js';

let submissions = [];
let unsubscribeSubmissions = null;

/**
 * Listens to submissions, filtering based on auth state and board privacy.
 * @param {object} authState - The current authentication state from auth.js.
 * @param {object} config - The main application config object.
 * @param {function} callback - Function to call with the submissions data.
 */
export function listenToSubmissions(authState, config, callback) {
    if (unsubscribeSubmissions) unsubscribeSubmissions();

    let submissionsQuery;
    const isPrivateBoard = config.boardVisibility === 'private';
    const isPlayerOnTeam = authState.isLoggedIn && authState.profile?.team;

    if (isPrivateBoard && isPlayerOnTeam && !authState.isEventMod) {
        submissionsQuery = fb.query(fb.collection(db, 'submissions'), fb.where('Team', '==', authState.profile.team));
    } else {
        submissionsQuery = fb.collection(db, 'submissions');
    }

    unsubscribeSubmissions = fb.onSnapshot(submissionsQuery, (snapshot) => {
        submissions = snapshot.docs.map(doc => ({
            ...doc.data(),
            docId: doc.id,
            Timestamp: doc.data().Timestamp?.toDate(),
            CompletionTimestamp: doc.data().CompletionTimestamp?.toDate()
        }));
        callback(submissions);
    }, (error) => {
        console.error("Error listening to submissions:", error);
        callback({ error });
    });
}

/**
 * Returns the currently cached submissions array.
 * @returns {Array<object>}
 */
export function getSubmissions() {
    return submissions;
}

/**
 * Adds or updates a submission document.
 * @param {string|null} docId - The document ID to update, or null to add a new one.
 * @param {object} data - The submission data to save.
 * @returns {Promise}
 */
export function saveSubmission(docId, data) {
    if (docId) {
        const subRef = fb.doc(db, 'submissions', docId);
        return fb.updateDoc(subRef, data);
    } else {
        return fb.addDoc(fb.collection(db, 'submissions'), data);
    }
}

/**
 * Exports all submissions to an array of objects for CSV conversion.
 * @param {Array<object>} allUsers - The list of all users to resolve names.
 * @returns {Promise<Array<object>>}
 */
export async function exportSubmissions(allUsers = []) {
    const usersById = allUsers.reduce((acc, user) => {
        acc[user.uid] = user;
        return acc;
    }, {});

    const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
    return snapshot.docs.map(doc => {
        const data = doc.data();
        const playerNames = (data.PlayerIDs || [])
            .map(uid => usersById[uid]?.displayName || `[${uid.substring(0, 5)}]`)
            .join(', ');
        const finalPlayerString = [playerNames, data.AdditionalPlayerNames].filter(Boolean).join(', ');

        const record = {
            docId: doc.id,
            PlayerNames: finalPlayerString
        };
        // Add all other fields, converting Timestamps and objects
        for (const field in data) {
            if (field === 'PlayerIDs' || field === 'AdditionalPlayerNames') continue;
            let value = data[field] ?? '';
            if (value && typeof value.toDate === 'function') {
                value = value.toDate().toISOString();
            } else if (typeof value === 'object') {
                value = JSON.stringify(value);
            }
            record[field] = value;
        }
        return record;
    });
}

/**
 * Deletes all submissions from the database.
 * @returns {Promise}
 */
export async function clearAllSubmissions() {
    const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
    const BATCH_SIZE = 499;
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
        const batch = fb.writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}