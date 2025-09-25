import { db, fb } from '../firebase-config.js';

/**
 * Listens for real-time updates to the tiles collection.
 * @param {function} callback - The function to call with the new tiles data.
 * @param {object} [authState] - Optional auth state.
 * @param {object} [config] - Optional main config object.
 * @param {boolean} [includeDocId=false] - Whether to include the Firestore document ID.
 * @returns {function} An unsubscribe function.
 */
export function listenToTiles(callback, authState, config, includeDocId = false) {
    // FIX: Correctly handle optional arguments.
    // The original call from setupController was passing multiple arguments,
    // causing the function to misinterpret them. This implementation correctly
    // uses the arguments as intended.

    const isCensored = config?.censorTilesBeforeEvent === true && !authState?.isEventMod;
    const collectionName = isCensored ? 'public_tiles' : 'tiles';
    console.log(`tileManager: Listening to '${collectionName}' collection (censored: ${isCensored})`);

    const tilesQuery = fb.collection(db, collectionName);

    return fb.onSnapshot(tilesQuery, (snapshot) => {
        const tiles = snapshot.docs.map(doc => {
            const data = doc.data();
            if (includeDocId) {
                return { ...data, docId: doc.id };
            }
            return data;
        });
        callback(tiles);
    }, (error) => {
        console.error(`Error listening to ${collectionName}:`, error);
        callback([]); // Return empty array on error.
    });
}

export async function updateTile(docId, data) {
    const tileRef = fb.doc(db, 'tiles', docId);
    return fb.updateDoc(tileRef, data);
}

// Other tile management functions like createTile, deleteTile, etc. would go here.