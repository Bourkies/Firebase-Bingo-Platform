import '../components/Navbar.js';
import { db, fb } from '../core/firebase-config.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

const TILE_FIELDS = ['id', 'Name', 'Points', 'Description', 'Left (%)', 'Top (%)', 'Width (%)', 'Height (%)', 'Rotation', 'Prerequisites', 'Overrides (JSON)'];
let csvHeaders = [];
let csvData = [];

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('export-csv-btn').addEventListener('click', handleExport);
    document.getElementById('csv-file-input').addEventListener('change', handleFileSelect);
    document.getElementById('import-btn').addEventListener('click', handleImport);
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
        const tilesSnapshot = await fb.getDocs(fb.collection(db, 'tiles'));
        const tiles = tilesSnapshot.docs.map(doc => {
            const data = doc.data();
            // Ensure all fields exist in the exported object for consistent columns
            const tileRecord = {};
            TILE_FIELDS.forEach(field => {
                tileRecord[field] = data[field] ?? '';
            });
            return tileRecord;
        });

        if (tiles.length === 0) {
            showMessage('No tiles to export.', true);
            return;
        }

        const csv = Papa.unparse(tiles, { header: true });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'bingo-tiles-export.csv');
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
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            csvHeaders = results.meta.fields;
            csvData = results.data;
            document.getElementById('import-step-2').style.display = 'block';
            populateMappingTable();
            // Ensure the import button is visible for a new file upload
            document.getElementById('import-btn').style.display = 'block';
            document.getElementById('import-results').style.display = 'none';
            hideGlobalLoader();
        },
        error: (error) => {
            showMessage(`CSV parsing error: ${error.message}`, true);
            hideGlobalLoader();
        }
    });
}

function populateMappingTable() {
    const tbody = document.querySelector('#mapping-table tbody');
    tbody.innerHTML = '';

    const headerOptions = `<option value="">-- Ignore --</option>` + csvHeaders.map(h => `<option value="${h}">${h}</option>`).join('');

    TILE_FIELDS.forEach(field => {
        const tr = document.createElement('tr');
        const isRequired = field === 'id';
        tr.innerHTML = `
            <td><label for="map-${field}" class="${isRequired ? 'required-field' : ''}">${field} ${isRequired ? '*' : ''}</label></td>
            <td><select id="map-${field}" data-field="${field}">${headerOptions}</select></td>
        `;
        tbody.appendChild(tr);

        const select = tr.querySelector('select');
        // Auto-select if header matches field name (case-insensitive)
        const matchingHeader = csvHeaders.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === field.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (matchingHeader) {
            select.value = matchingHeader;
        }
        select.addEventListener('change', updatePreview);
    });
    updatePreview();
}

function updatePreview() {
    const mapping = {};
    let idMapped = false;
    document.querySelectorAll('#mapping-table select').forEach(select => {
        if (select.value) {
            mapping[select.dataset.field] = select.value;
            if (select.dataset.field === 'id' && select.value) {
                idMapped = true;
            }
        }
    });

    const importBtn = document.getElementById('import-btn');
    const step3 = document.getElementById('import-step-3');

    if (!idMapped) {
        step3.style.display = 'none';
        importBtn.disabled = true;
        return;
    }

    step3.style.display = 'block';
    importBtn.disabled = false;

    const previewThead = document.querySelector('#preview-table thead');
    const previewTbody = document.querySelector('#preview-table tbody');
    previewThead.innerHTML = '';
    previewTbody.innerHTML = '';

    const mappedFields = Object.keys(mapping);
    const headerRow = '<tr>' + mappedFields.map(f => `<th>${f}</th>`).join('') + '</tr>';
    previewThead.innerHTML = headerRow;

    const previewData = csvData.slice(0, 10); // Show first 10 rows
    previewData.forEach(row => {
        const tr = document.createElement('tr');
        let idValidationError = '';
        mappedFields.forEach(field => {
            const csvHeader = mapping[field];
            const value = row[csvHeader] || '';
            tr.innerHTML += `<td title="${value}">${value}</td>`;

            if (field === 'id') {
                if (!value) idValidationError = 'ID is missing.';
                else if (value.includes('/')) idValidationError = 'ID cannot contain "/".';
                else if (value.length > 1500) idValidationError = 'ID is too long.';
            }
        });
        if (idValidationError) {
            tr.style.backgroundColor = '#5d3a3a';
            tr.title = `Invalid Row: ${idValidationError}`;
            tr.querySelector('td').innerHTML += ` <span class="validation-error">(${idValidationError})</span>`;
        }
        previewTbody.appendChild(tr);
    });

    document.getElementById('import-summary').textContent = `Found ${csvData.length} rows to import.`;
}

async function handleImport() {
    showGlobalLoader();
    const importBtn = document.getElementById('import-btn');
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';

    // Reset results display on new import attempt
    const resultsContainer = document.getElementById('import-results');
    const successDiv = document.getElementById('success-results');
    const failureDiv = document.getElementById('failure-results');
    const successList = document.getElementById('success-list');
    const failureList = document.getElementById('failure-list');
    resultsContainer.style.display = 'none';
    successDiv.style.display = 'none';
    failureDiv.style.display = 'none';
    successList.innerHTML = '';
    failureList.innerHTML = '';
    const mapping = {};
    document.querySelectorAll('#mapping-table select').forEach(select => {
        if (select.value) mapping[select.dataset.field] = select.value;
    });

    // NEW: Get import mode
    const importMode = document.querySelector('input[name="import-mode"]:checked').value;

    // --- NEW: Fetch existing tiles to handle updates vs. new creations ---
    const existingTilesSnapshot = await fb.getDocs(fb.collection(db, 'tiles'));
    const existingTiles = existingTilesSnapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
    const existingTilesByVisibleId = new Map(existingTiles.map(t => [t.id, t]));

    // Find the highest current numeric docId to start incrementing from.
    const existingNumbers = existingTiles.map(t => parseInt(t.docId, 10)).filter(n => !isNaN(n));
    let maxDocIdNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    // --- END NEW ---

    const successfulRows = [];
    const failedRows = [];

    csvData.forEach((row, index) => {
        const tileData = {};
        TILE_FIELDS.forEach(field => {
            const csvHeader = mapping[field];
            if (csvHeader && row[csvHeader] !== undefined) {
                tileData[field] = row[csvHeader];
            }
        });

        const visibleId = tileData.id;
        if (!visibleId || visibleId.includes('/') || visibleId.length > 1500) {
            failedRows.push({ rowNum: index + 2, id: visibleId || '[Missing ID]', reason: 'Invalid or missing ID.' });
            return;
        }

        const existingTile = existingTilesByVisibleId.get(visibleId);
        let docId;

        if (existingTile) {
            // NEW: Handle import mode for existing tiles
            if (importMode === 'reject') {
                failedRows.push({ rowNum: index + 2, id: visibleId, reason: 'Tile ID already exists (mode: reject duplicates).' });
                return; // Skip this row
            }
            // If mode is 'overwrite', proceed as before
            docId = existingTile.docId; // This is an update, use existing docId
        } else {
            maxDocIdNumber++; // This is a new tile, generate a new docId
            docId = String(maxDocIdNumber).padStart(5, '0');
            // Add to map to handle duplicate visible IDs within the same CSV file correctly
            existingTilesByVisibleId.set(visibleId, { docId, ...tileData });
        }

        successfulRows.push({ docId: docId, data: tileData });
    });

    if (failedRows.length > 0) {
        showMessage(`Import failed with ${failedRows.length} errors. See details below.`, true);
        console.error("Import validation errors:", failedRows);

        // Display failure details
        resultsContainer.style.display = 'block';
        failureDiv.style.display = 'block';
        failedRows.forEach(fail => {
            const li = document.createElement('li');
            li.textContent = `Row ${fail.rowNum} (ID: ${fail.id}): ${fail.reason}`;
            failureList.appendChild(li);
        });

        hideGlobalLoader();
        importBtn.disabled = false;
        importBtn.textContent = 'Import Tiles';
        return;
    }

    const tilesToImport = successfulRows;

    try {
        const BATCH_SIZE = 499; // Firestore batch limit is 500
        for (let i = 0; i < tilesToImport.length; i += BATCH_SIZE) {
            const batch = fb.writeBatch(db);
            const chunk = tilesToImport.slice(i, i + BATCH_SIZE);
            chunk.forEach(tile => {
                const tileRef = fb.doc(db, 'tiles', tile.docId);
                batch.set(tileRef, tile.data);
            });
            await batch.commit();
            showMessage(`Imported ${i + chunk.length} of ${tilesToImport.length} tiles...`, false);
        }
        showMessage(`Successfully imported ${tilesToImport.length} tiles!`, false);

        // Display success details
        resultsContainer.style.display = 'block';
        successDiv.style.display = 'block';
        tilesToImport.forEach(tile => {
            const li = document.createElement('li');
            li.textContent = `Tile ID: ${tile.data.id} (Name: ${tile.data.Name || 'N/A'})`;
            successList.appendChild(li);
        });

        // Reset UI for next import, keeping results visible
        document.getElementById('csv-file-input').value = '';
        document.getElementById('import-step-2').style.display = 'none';
        document.getElementById('import-btn').style.display = 'none';
        document.getElementById('preview-container').style.display = 'none';
    } catch (error) {
        showMessage(`Import failed during database write: ${error.message}`, true);
        console.error('Import error:', error);
    } finally {
        hideGlobalLoader();
        importBtn.disabled = false;
        importBtn.textContent = 'Import Tiles';
    }
}