import { atom } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';

// This store will hold the combined config and styles data.
export const configStore = atom({
    config: {},
    styles: {},
});

let unsubscribeConfig;
let unsubscribeStyles;
let isInitialized = false;

/**
 * Initializes the listeners for the main config and all style documents.
 * The data is combined and updated in the configStore.
 */
export function initConfigListener() {
    if (isInitialized) return;
    isInitialized = true;

    let currentConfig = {};
    let currentStyles = {};

    const updateStore = () => {
        configStore.set({ config: currentConfig, styles: currentStyles });
    };

    unsubscribeConfig = fb.onSnapshot(fb.doc(db, 'config', 'main'), (doc) => {
        console.log('[configStore] Received update for config/main.');
        currentConfig = doc.exists() ? doc.data() : {};
        updateStore();
    }, (error) => {
        console.error("[configStore] Error listening to config:", error);
    });

    unsubscribeStyles = fb.onSnapshot(fb.collection(db, 'styles'), (snapshot) => {
        console.log('[configStore] Received update for styles collection.');
        currentStyles = {};
        snapshot.docs.forEach(doc => {
            currentStyles[doc.id] = doc.data();
        });
        updateStore();
    }, (error) => {
        console.error("[configStore] Error listening to styles:", error);
    });
}

// --- NEW: Write Operations ---

/**
 * Updates a field in the main config document.
 * @param {object} data - The data to update.
 * @returns {Promise<void>}
 */
export function updateConfig(data) {
    const configRef = fb.doc(db, 'config', 'main');
    return fb.setDoc(configRef, data, { merge: true });
}

/**
 * Updates a specific style document.
 * @param {string} styleId - The ID of the style document (e.g., 'Verified').
 * @param {object} data - The data to update.
 * @returns {Promise<void>}
 */
export function updateStyle(styleId, data) {
    const styleRef = fb.doc(db, 'styles', styleId);
    return fb.setDoc(styleRef, data, { merge: true });
}

/**
 * Exports the full config (main config + all styles) as a JSON object.
 * @returns {Promise<object>}
 */
export async function exportFullConfig() {
    const configDoc = await fb.getDoc(fb.doc(db, 'config', 'main'));
    const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));

    const stylesData = {};
    stylesSnapshot.forEach(doc => {
        stylesData[doc.id] = doc.data();
    });

    return {
        config: configDoc.exists() ? configDoc.data() : {},
        styles: stylesData
    };
}

/**
 * Imports a full configuration from a JSON object.
 * @param {object} data - The full config object with `config` and `styles` keys.
 * @param {'merge'|'replace'} mode - The import mode.
 * @returns {Promise<void>}
 */
export async function importFullConfig(data, mode = 'merge') {
    const batch = fb.writeBatch(db);

    if (mode === 'replace') {
        const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));
        stylesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
        batch.delete(fb.doc(db, 'config', 'main'));
    }

    if (data.config) {
        batch.set(fb.doc(db, 'config', 'main'), data.config, { merge: mode === 'merge' });
    }
    if (data.styles) {
        for (const [styleId, styleData] of Object.entries(data.styles)) {
            batch.set(fb.doc(db, 'styles', styleId), styleData, { merge: mode === 'merge' });
        }
    }
    return batch.commit();
}

/**
 * Clears all config and style documents.
 * @returns {Promise<void>}
 */
export async function clearAllConfig() {
    const batch = fb.writeBatch(db);
    batch.delete(fb.doc(db, 'config', 'main'));
    const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));
    stylesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
}