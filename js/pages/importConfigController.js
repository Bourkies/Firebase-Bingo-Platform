import '../components/Navbar.js';
import { db, fb } from '../core/firebase-config.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

let parsedJsonData = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('export-json-btn').addEventListener('click', handleExport);
    document.getElementById('json-file-input').addEventListener('change', handleFileSelect);
    document.getElementById('import-btn').addEventListener('click', handleImport);
    document.getElementById('clear-config-btn').addEventListener('click', openClearModal);
    document.querySelector('#clear-config-modal .close-button').addEventListener('click', closeClearModal);
    document.getElementById('delete-confirm-input').addEventListener('input', validateClear);
    document.getElementById('delete-confirm-btn').addEventListener('click', executeClear);
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(authState) {
    if (authState.isAdmin) {
        document.getElementById('import-view').style.display = 'flex';
        document.getElementById('access-denied').style.display = 'none';
    } else {
        document.getElementById('import-view').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        document.querySelector('#access-denied p').textContent = authState.isLoggedIn ? 'You must be an Admin to view this page.' : 'You must be logged in as an Admin to view this page.';
    }
}

async function handleExport() {
    showGlobalLoader();
    try {
        const configDoc = await fb.getDoc(fb.doc(db, 'config', 'main'));
        const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));

        const stylesData = {};
        stylesSnapshot.forEach(doc => {
            stylesData[doc.id] = doc.data();
        });

        const fullConfig = {
            config: configDoc.exists() ? configDoc.data() : {},
            styles: stylesData
        };

        const jsonString = JSON.stringify(fullConfig, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'bingo-config-export.json');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showMessage('Export successful!', false);
    } catch (error) {
        showMessage(`Export failed: ${error.message}`, true);
        console.error('Export error:', error);
    } finally {
        hideGlobalLoader();
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    showGlobalLoader();
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            parsedJsonData = JSON.parse(e.target.result);
            document.getElementById('import-step-2').style.display = 'block';
            updatePreview();
        } catch (error) {
            showMessage(`JSON parsing error: ${error.message}`, true);
            parsedJsonData = null;
            document.getElementById('import-step-2').style.display = 'none';
        } finally {
            hideGlobalLoader();
        }
    };
    reader.onerror = () => {
        showMessage('Error reading file.', true);
        hideGlobalLoader();
    };
    reader.readAsText(file);
}

function updatePreview() {
    const previewEl = document.getElementById('json-preview');
    const importBtn = document.getElementById('import-btn');
    const summaryEl = document.getElementById('import-summary');

    if (!parsedJsonData || typeof parsedJsonData !== 'object') {
        previewEl.innerHTML = '<span class="validation-error">Invalid or empty JSON file.</span>';
        importBtn.disabled = true;
        summaryEl.textContent = '';
        return;
    }

    const hasConfig = parsedJsonData.hasOwnProperty('config') && typeof parsedJsonData.config === 'object';
    const hasStyles = parsedJsonData.hasOwnProperty('styles') && typeof parsedJsonData.styles === 'object';

    if (!hasConfig && !hasStyles) {
        previewEl.innerHTML = '<span class="validation-error">JSON must contain a "config" or "styles" object at the top level.</span>';
        importBtn.disabled = true;
        summaryEl.textContent = '';
        return;
    }

    previewEl.textContent = JSON.stringify(parsedJsonData, null, 2);
    importBtn.disabled = false;
    summaryEl.textContent = 'Preview loaded. Ready to import.';
}

async function handleImport() {
    if (!parsedJsonData) {
        showMessage('No valid data to import.', true);
        return;
    }

    showGlobalLoader();
    const importBtn = document.getElementById('import-btn');
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    const importMode = document.querySelector('input[name="import-mode"]:checked').value;

    try {
        if (importMode === 'replace') {
            // SAFER REPLACE: Instead of deleting first, perform all operations in one batch.
            // Fetch all documents to be deleted, then create a single batch that
            // performs all deletions and all new writes together.
            await performBatchedReplace();
        } else { // Merge mode
            await performBatchedMerge();
        }
        showMessage('Configuration imported successfully!', false);

    } catch (error) {
        showMessage(`Import failed: ${error.message}`, true);
        console.error('Import error:', error);
    } finally {
        hideGlobalLoader();
        importBtn.disabled = false;
        importBtn.textContent = 'Import Config';
    }
}

async function performBatchedMerge() {
    const batch = fb.writeBatch(db);
    // Process config
    if (parsedJsonData.config) {
        const configRef = fb.doc(db, 'config', 'main');
        batch.set(configRef, parsedJsonData.config, { merge: true });
    }
    // Process styles
    if (parsedJsonData.styles) {
        for (const [styleId, styleData] of Object.entries(parsedJsonData.styles)) {
            const styleRef = fb.doc(db, 'styles', styleId);
            batch.set(styleRef, styleData, { merge: true });
        }
    }
    await batch.commit();
}

async function performBatchedReplace() {
    const batch = fb.writeBatch(db);

    // 1. Schedule existing documents for deletion
    const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));
    stylesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(fb.doc(db, 'config', 'main')); // Also delete the main config

    // 2. Schedule new documents to be written
    if (parsedJsonData.config) {
        const configRef = fb.doc(db, 'config', 'main');
        batch.set(configRef, parsedJsonData.config); // No merge on replace
    }
    if (parsedJsonData.styles) {
        for (const [styleId, styleData] of Object.entries(parsedJsonData.styles)) {
            const styleRef = fb.doc(db, 'styles', styleId);
            batch.set(styleRef, styleData); // No merge on replace
        }
    }
    await batch.commit();
}

// --- Clear Config Logic ---
function openClearModal() {
    document.getElementById('clear-config-modal').style.display = 'flex';
}

function closeClearModal() {
    const modal = document.getElementById('clear-config-modal');
    modal.style.display = 'none';
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('delete-confirm-btn').disabled = true;
}

function validateClear() {
    const input = document.getElementById('delete-confirm-input');
    const confirmBtn = document.getElementById('delete-confirm-btn');
    confirmBtn.disabled = input.value !== 'DELETE CONFIG';
}

async function executeClear(silent = false) {
    if (!silent) showGlobalLoader();
    const confirmBtn = document.getElementById('delete-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
        const batch = fb.writeBatch(db);
        
        // Delete main config doc
        batch.delete(fb.doc(db, 'config', 'main'));

        // Delete all style docs
        const stylesSnapshot = await fb.getDocs(fb.collection(db, 'styles'));
        stylesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

        await batch.commit();
        if (!silent) {
            showMessage('All configurations have been cleared.', false);
            closeClearModal();
        }
    } catch (error) {
        if (!silent) showMessage(`Error clearing config: ${error.message}`, true);
        console.error("Clear config error:", error);
        // Re-throw if silent so the import process can catch it
        if (silent) throw error;
    } finally {
        if (!silent) hideGlobalLoader();
        confirmBtn.textContent = 'Confirm Deletion';
    }
}