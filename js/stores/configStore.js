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