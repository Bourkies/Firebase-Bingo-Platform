import { db, fb } from '../firebase-config.js';

let config = {};
let allStyles = {};
let unsubscribeConfig = null;
let unsubscribeStyles = null;

/**
 * Listens to the main config document and all style documents.
 * @param {function} callback - Function to call when data changes.
 */
export function listenToConfigAndStyles(callback) {
    if (unsubscribeConfig) unsubscribeConfig();
    unsubscribeConfig = fb.onSnapshot(fb.doc(db, 'config', 'main'), (doc) => {
        config = doc.exists() ? doc.data() : {};
        callback({ config, styles: allStyles, error: null });
    }, (error) => {
        console.error("Error listening to config:", error);
        callback({ config: {}, styles: {}, error });
    });

    if (unsubscribeStyles) unsubscribeStyles();
    unsubscribeStyles = fb.onSnapshot(fb.collection(db, 'styles'), (snapshot) => {
        allStyles = {};
        snapshot.docs.forEach(doc => {
            allStyles[doc.id] = doc.data();
        });
        callback({ config, styles: allStyles, error: null });
    }, (error) => {
        console.error("Error listening to styles:", error);
        callback({ config: {}, styles: {}, error });
    });
}

/**
 * Returns the currently cached config object.
 * @returns {object}
 */
export function getConfig() {
    return config;
}

/**
 * Returns the currently cached styles object.
 * @returns {object}
 */
export function getStyles() {
    return allStyles;
}

/**
 * Updates a field in the main config document.
 * @param {object} data - The data to update.
 * @returns {Promise}
 */
export function updateConfig(data) {
    const configRef = fb.doc(db, 'config', 'main');
    return fb.setDoc(configRef, data, { merge: true });
}

/**
 * Updates a specific style document.
 * @param {string} styleId - The ID of the style document (e.g., 'Verified').
 * @param {object} data - The data to update.
 * @returns {Promise}
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
 * @returns {Promise}
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
 * @returns {Promise}
 */
export async function clearAllConfig() {
    const batch = fb.writeBatch(db);
    batch.delete(fb.doc(db, 'config', 'main'));
    const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));
    stylesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    return batch.commit();
}