import { atom, map } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';
import { authStore } from './authStore.js';
import { configStore } from './configStore.js';

// This store will hold the array of all tile documents.
export const tilesStore = atom([]);

// NEW: Separate atoms for public and private tiles to manage them independently.
const privateTiles = atom([]);
const publicTiles = atom([]);

let unsubscribePrivate, unsubscribePublic;

/**
 * Initializes the listener for the 'tiles' or 'public_tiles' collection.
 */
export function initTilesListener() {
    // This listener depends on auth and config, so it subscribes to them.
    // When auth or config changes, it will re-evaluate and set up the correct listener.
    authStore.subscribe(handleStateChange);
    configStore.subscribe(handleStateChange);
}

function handleStateChange() {
    // Always clean up previous listeners
    if (unsubscribePrivate) unsubscribePrivate();
    if (unsubscribePublic) unsubscribePublic();

    const authState = authStore.get();
    const { config } = configStore.get();

    const isCensored = config?.censorTilesBeforeEvent === true && !authState?.isEventMod;

    if (isCensored) {
        console.log(`[tilesStore] Censored mode: Listening to 'public_tiles'.`);
        // In censored mode, we populate the main store with the public tile data.
        // This contains all necessary layout info. The component will handle the missing name/desc.
        unsubscribePublic = fb.onSnapshot(fb.collection(db, 'public_tiles'), (snapshot) => {
            const tiles = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            tilesStore.set(tiles);
        }, (error) => {
            console.error(`[tilesStore] Error listening to public_tiles:`, error);
            tilesStore.set([]);
        });
    } else {
        console.log(`[tilesStore] Uncensored mode: Listening to 'tiles'.`);
        // In uncensored mode, we listen to the full 'tiles' collection.
        // We also clear the publicTiles store as it's not needed.
        publicTiles.set([]);
        unsubscribePrivate = fb.onSnapshot(fb.collection(db, 'tiles'), (snapshot) => {
            const tiles = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
            tilesStore.set(tiles);
        }, (error) => {
            console.error(`[tilesStore] Error listening to tiles:`, error);
            tilesStore.set([]);
        });
    }
}

/**
 * A special getter that returns the public tile data if available.
 * This is used by the BingoBoard to get layout data in censored mode.
 * @returns {Array} The array of public tiles.
 */
export function getPublicTiles() {
    return publicTiles.get();
}

// --- NEW: Write Operations ---

/**
 * Updates a single tile document.
 * @param {string} docId - The Firestore document ID of the tile.
 * @param {object} data - The data to update.
 * @returns {Promise<void>}
 */
export function updateTile(docId, data) {
    const tileRef = fb.doc(db, 'tiles', docId);
    return fb.updateDoc(tileRef, data);
}

/**
 * Creates a new tile document.
 * @param {string} docId - The Firestore document ID for the new tile.
 * @param {object} data - The full data for the new tile.
 * @returns {Promise<void>}
 */
export function createTile(docId, data) {
    const tileRef = fb.doc(db, 'tiles', docId);
    return fb.setDoc(tileRef, data);
}

/**
 * Deletes a single tile document.
 * @param {string} docId - The Firestore document ID of the tile to delete.
 * @returns {Promise<void>}
 */
export function deleteTile(docId) {
    const tileRef = fb.doc(db, 'tiles', docId);
    return fb.deleteDoc(tileRef);
}

/**
 * Deletes all tiles from the 'tiles' collection in batches.
 * @returns {Promise<void>}
 */
export async function deleteAllTiles() {
    const tilesCollection = fb.collection(db, 'tiles');
    const snapshot = await fb.getDocs(tilesCollection);

    if (snapshot.empty) return;

    const BATCH_SIZE = 499; // Firestore batch limit is 500 operations
    let batch = fb.writeBatch(db);
    let count = 0;

    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;
        if (count === BATCH_SIZE) {
            await batch.commit();
            batch = fb.writeBatch(db);
            count = 0;
        }
    }

    if (count > 0) await batch.commit();
}

/**
 * Imports an array of tiles in batches.
 * @param {Array<{docId: string, data: object}>} tilesToImport - Array of tile objects to import.
 * @returns {Promise<void>}
 */
export async function importTiles(tilesToImport) {
    const BATCH_SIZE = 499;
    for (let i = 0; i < tilesToImport.length; i += BATCH_SIZE) {
        const batch = fb.writeBatch(db);
        const chunk = tilesToImport.slice(i, i + BATCH_SIZE);
        chunk.forEach(tile => {
            const tileRef = fb.doc(db, 'tiles', tile.docId);
            batch.set(tileRef, tile.data);
        });
        await batch.commit();
    }
}