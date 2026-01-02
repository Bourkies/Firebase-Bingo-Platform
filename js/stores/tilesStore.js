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
    let activeUnsubscribe = null; // Renamed for clarity
    let currentMode = null; // Track the current subscription mode to prevent redundant reconnects

    const handleStateChange = () => {
        const authState = authStore.get();
        const { config } = configStore.get();
        // FIX: Check for 'setup' generally to handle URLs without .html extension or query params
        const isSetupPage = window.location.pathname.toLowerCase().includes('setup');

        // Determine the required mode
        let newMode = 'private'; // Default
        if (isSetupPage) {
            newMode = 'setup';
        } else if (config?.censorTilesBeforeEvent === true && !authState?.isEventMod) {
            newMode = 'public';
        }

        // OPTIMIZATION: If the mode hasn't changed, do not tear down the listener.
        if (newMode === currentMode && activeUnsubscribe) return;
        currentMode = newMode;

        // Clean up previous listener
        if (activeUnsubscribe) { activeUnsubscribe(); activeUnsubscribe = null; }

        // 1. SETUP MODE: Always listen to the full collection for real-time editing
        if (newMode === 'setup') {
            console.log('[tilesStore] Setup mode: Listening to raw collection.');
            activeUnsubscribe = fb.onSnapshot(fb.collection(db, 'tiles'), (snapshot) => {
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

        activeUnsubscribe = fb.onSnapshot(packedDocRef, (doc) => {
            if (doc.exists() && doc.data().tiles) {
                const tilesData = doc.data().tiles;
                tilesStore.set(tilesData);
                localStorage.setItem(cacheKey, JSON.stringify(tilesData));
            } else {
                // NO FALLBACK: If the packed document doesn't exist, it's an explicit state.
                // The admin needs to publish the board. Reading the raw collection is too expensive for players.
                console.warn('[tilesStore] Packed tiles document not found. Please use the "Publish Board" button on the Setup page to generate it.');
                tilesStore.set([]);
            }
        });
    }

    const unsubAuth = authStore.subscribe(handleStateChange);
    const unsubConfig = configStore.subscribe(handleStateChange);

    return () => {
        if (activeUnsubscribe) activeUnsubscribe();
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
export async function publishTiles(tilesToPublish) {
    let tiles;
    if (tilesToPublish) {
        // If an array is provided, use it directly. This is for publishing selected changes.
        tiles = tilesToPublish;
    } else {
        // 1. Fetch all raw tiles (Cost: N reads)
        const snapshot = await fb.getDocs(fb.collection(db, 'tiles'));
        tiles = snapshot.docs
            .filter(doc => doc.id !== 'packed') // Don't include the packed doc in itself
            .map(doc => ({ ...doc.data(), docId: doc.id }));
    }

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

    // 3. Save both versions (Cost: 2 writes)
    // - 'tiles/packed': Full uncensored data. Protected by 'tiles' collection rules.
    // - 'config/tiles_packed_public': Censored data. Publicly readable in 'config' collection.
    const batch = fb.writeBatch(db);
    batch.set(fb.doc(db, 'tiles', 'packed'), { tiles: tiles });
    batch.set(fb.doc(db, 'config', 'tiles_packed_public'), { tiles: publicTiles });

    await batch.commit();
    console.log('[tilesStore] Board published successfully. Updated [tiles/packed] and [config/tiles_packed_public].');
}