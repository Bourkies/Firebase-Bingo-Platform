import { db, storage, fb } from '../firebase-config.js';

let tiles = [];
let unsubscribeTiles = null;

/**
 * Listens to the tiles collection, respecting censorship rules.
 * @param {object} authState - The current authentication state from auth.js.
 * @param {object} config - The main application config object.
 * @param {function} callback - Function to call with the tiles data.
 */
export function listenToTiles(authState, config, callback) {
    if (unsubscribeTiles) unsubscribeTiles();

    const isCensored = config.censorTilesBeforeEvent === true && !authState.isEventMod;
    const collectionName = isCensored ? 'public_tiles' : 'tiles';

    unsubscribeTiles = fb.onSnapshot(fb.collection(db, collectionName), (snapshot) => {
        tiles = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        callback(tiles);
    }, (error) => {
        console.error(`Error listening to ${collectionName}:`, error);
        callback({ error });
    });
}

/**
 * Returns the currently cached tiles array.
 * @returns {Array<object>}
 */
export function getTiles() {
    return tiles;
}

/**
 * Adds a new tile document.
 * @param {string} docId - The document ID for the new tile.
 * @param {object} data - The tile data.
 * @returns {Promise}
 */
export function addTile(docId, data) {
    return fb.setDoc(fb.doc(db, 'tiles', docId), data);
}

/**
 * Updates a tile document.
 * @param {string} docId - The document ID of the tile to update.
 * @param {object} data - The data to update.
 * @returns {Promise}
 */
export function updateTile(docId, data) {
    return fb.updateDoc(fb.doc(db, 'tiles', docId), data);
}

/**
 * Deletes a tile document.
 * @param {string} docId - The document ID of the tile to delete.
 * @returns {Promise}
 */
export function deleteTile(docId) {
    return fb.deleteDoc(fb.doc(db, 'tiles', docId));
}

/**
 * Deletes all tiles from the 'tiles' collection.
 * @returns {Promise}
 */
export async function deleteAllTiles() {
    const allTiles = await fb.getDocs(fb.collection(db, 'tiles'));
    const batch = fb.writeBatch(db);
    allTiles.forEach(tileDoc => batch.delete(tileDoc.ref));
    return batch.commit();
}

/**
 * Uploads an image file to Firebase Storage.
 * @param {File} file - The file to upload.
 * @param {string} storagePath - The path in storage (e.g., 'config/background').
 * @param {string|null} oldUrl - The previous image URL to delete, if any.
 * @returns {Promise<string>} The download URL of the new image.
 */
export async function uploadImage(file, storagePath, oldUrl = null) {
    if (oldUrl && oldUrl.includes('firebasestorage')) {
        try {
            await fb.deleteObject(fb.ref(storage, oldUrl));
        } catch (error) {
            if (error.code !== 'storage/object-not-found') {
                console.error("Could not delete old file:", error);
            }
        }
    }
    const newFileRef = fb.ref(storage, `${storagePath}/${file.name}`);
    await fb.uploadBytes(newFileRef, file);
    return fb.getDownloadURL(newFileRef);
}

/**
 * Syncs the main tile layout to the public_tiles collection for censored view.
 * @returns {Promise}
 */
export async function syncPublicLayout() {
    const publicFields = ['id', 'Points', 'Prerequisites', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)', 'Rotation'];
    const [publicTilesSnapshot, mainTilesSnapshot] = await Promise.all([
        fb.getDocs(fb.collection(db, 'public_tiles')),
        fb.getDocs(fb.collection(db, 'tiles'))
    ]);

    const batch = fb.writeBatch(db);
    publicTilesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    mainTilesSnapshot.docs.forEach(doc => {
        const publicData = publicFields.reduce((acc, field) => {
            if (doc.data()[field] !== undefined) acc[field] = doc.data()[field];
            return acc;
        }, {});
        batch.set(fb.doc(db, 'public_tiles', doc.id), publicData);
    });
    return batch.commit();
}