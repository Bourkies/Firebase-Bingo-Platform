import { atom, map, onMount } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';
import { authStore } from './authStore.js';
import { configStore } from './configStore.js';

// This store will hold the array of all tile documents.
export const tilesStore = atom([]);

// NEW: Separate atoms for public and private tiles to manage them independently.
const privateTiles = atom([]);
const publicTiles = atom([]);

onMount(tilesStore, () => {
    let unsubscribe = null;
    let currentMode = null; // Track the current subscription mode to prevent redundant reconnects

    const handleStateChange = () => {
        const authState = authStore.get();
        const { config } = configStore.get();
        const isSetupPage = window.location.pathname.includes('setup.html');

        // Determine the required mode
        let newMode = 'private'; // Default
        if (isSetupPage) {
            newMode = 'setup';
        } else if (config?.censorTilesBeforeEvent === true && !authState?.isEventMod) {
            newMode = 'public';
        }

        // OPTIMIZATION: If the mode hasn't changed, do not tear down the listener.
        if (newMode === currentMode && unsubscribe) return;
        currentMode = newMode;

        // Clean up previous listener
        if (unsubscribe) { unsubscribe(); unsubscribe = null; }

        // 1. SETUP MODE: Always listen to the full collection for real-time editing
        if (newMode === 'setup') {
            console.log('[tilesStore] Setup mode: Listening to raw collection.');
            unsubscribe = fb.onSnapshot(fb.collection(db, 'tiles'), (snapshot) => {
                // Filter out the special 'packed' document so it doesn't show up as a tile
                const tiles = snapshot.docs
                    .filter(doc => doc.id !== 'packed')
                    .map(doc => ({ ...doc.data(), docId: doc.id }));
                tilesStore.set(tiles);
            });
            return;
        }

        // 2. PLAYER MODE: Listen to the "Packed" document (1 Read)
        
        // If censored, read from public config. If not, read from the protected tiles collection.
        const packedDocRef = (newMode === 'public')
            ? fb.doc(db, 'config', 'tiles_packed_public') 
            : fb.doc(db, 'tiles', 'packed');

        console.log(`[tilesStore] Player mode: Listening to packed doc at ${packedDocRef.path}`);
        
        // NEW: Try to load from LocalStorage for instant render
        const cacheKey = (newMode === 'public') ? 'bingo_tiles_public_cache' : 'bingo_tiles_cache';
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) tilesStore.set(JSON.parse(cached));
        } catch (e) { console.warn('Error reading tiles cache', e); }

        unsubscribe = fb.onSnapshot(packedDocRef, (doc) => {
            if (doc.exists() && doc.data().tiles) {
                const tilesData = doc.data().tiles;
                tilesStore.set(tilesData);
                localStorage.setItem(cacheKey, JSON.stringify(tilesData));
            } else {
                console.warn('[tilesStore] Packed tiles not found.');
                // Fallback: Only fall back to raw collection if we are allowed to see it (Uncensored).
                if (newMode !== 'public') {
                    unsubscribe = fb.onSnapshot(fb.collection(db, 'tiles'), (snap) => {
                        tilesStore.set(snap.docs.filter(d => d.id !== 'packed').map(d => ({...d.data(), docId: d.id})));
                    });
                } else {
                    tilesStore.set([]); // No public data available yet
                }
            }
        });
    }

    const unsubAuth = authStore.subscribe(handleStateChange);
    const unsubConfig = configStore.subscribe(handleStateChange);

    return () => {
        if (unsubscribe) unsubscribe();
        unsubAuth();
        unsubConfig();
    };
});

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

/**
 * Reads all tiles from the collection and saves them into a single "Packed" document.
 * This drastically reduces read costs for players.
 */
export async function publishTiles() {
    // 1. Fetch all raw tiles (Cost: N reads)
    const snapshot = await fb.getDocs(fb.collection(db, 'tiles'));
    const tiles = snapshot.docs
        .filter(doc => doc.id !== 'packed') // Don't include the packed doc in itself
        .map(doc => ({ ...doc.data(), docId: doc.id }));

    // 2. Create the "Public/Censored" version (Strip sensitive data)
    const publicTiles = tiles.map(t => ({
        id: t.id,
        docId: t.docId,
        'Left (%)': t['Left (%)'],
        'Top (%)': t['Top (%)'],
        'Width (%)': t['Width (%)'],
        'Height (%)': t['Height (%)'],
        'Rotation': t.Rotation,
        Points: t.Points,
        // We intentionally exclude Name, Description, Prerequisites for the censored version
    }));

    // 3. Save both versions to the 'config' collection (Cost: 2 writes)
    const batch = fb.writeBatch(db);
    batch.set(fb.doc(db, 'tiles', 'packed'), { tiles: tiles }); // Protected
    batch.set(fb.doc(db, 'config', 'tiles_packed_public'), { tiles: publicTiles });

    await batch.commit();
    console.log('[tilesStore] Board published successfully.');
}