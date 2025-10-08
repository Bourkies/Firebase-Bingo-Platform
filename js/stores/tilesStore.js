import { atom } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';
import { authStore } from './authStore.js';
import { configStore } from './configStore.js';

// This store will hold the array of all tile documents.
export const tilesStore = atom([]);

let unsubscribe;

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
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    const authState = authStore.get();
    const { config } = configStore.get();

    const isCensored = config?.censorTilesBeforeEvent === true && !authState?.isEventMod;
    const collectionName = isCensored ? 'public_tiles' : 'tiles';
    console.log(`[tilesStore] Listening to '${collectionName}' collection (censored: ${isCensored})`);

    const tilesQuery = fb.collection(db, collectionName);

    unsubscribe = fb.onSnapshot(tilesQuery, (snapshot) => {
        const tiles = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        tilesStore.set(tiles);
    }, (error) => {
        console.error(`[tilesStore] Error listening to ${collectionName}:`, error);
        tilesStore.set([]); // Return empty array on error.
    });
}