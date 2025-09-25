import '../components/Navbar.js';
import { db, fb } from '../core/firebase-config.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

const SUBMISSION_FIELDS = ['id', 'Team', 'PlayerIDs', 'AdditionalPlayerNames', 'Evidence', 'Notes', 'IsComplete', 'AdminVerified', 'RequiresAction', 'AdminFeedback', 'IsArchived', 'Timestamp', 'CompletionTimestamp', 'history'];
const EDITABLE_FIELDS = ['id', 'Team', 'PlayerNames', 'Evidence', 'Notes', 'IsComplete', 'AdminVerified', 'RequiresAction', 'AdminFeedback', 'IsArchived']; // Use PlayerNames for import mapping
let csvHeaders = [];
let csvData = [];
let allTiles = {}, allTeams = {}, allUsers = {};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('export-csv-btn').addEventListener('click', handleExport);
    document.getElementById('csv-file-input').addEventListener('change', handleFileSelect);
    document.getElementById('import-btn').addEventListener('click', handleImport);
    document.getElementById('clear-submissions-btn').addEventListener('click', openClearModal);
    document.querySelector('#clear-submissions-modal .close-button').addEventListener('click', closeClearModal);
    document.getElementById('delete-confirm-input').addEventListener('input', validateClear);
    document.getElementById('delete-confirm-btn').addEventListener('click', executeClear);
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(authState) {
    if (authState.isAdmin) {
        document.getElementById('import-view').style.display = 'flex';
        document.getElementById('access-denied').style.display = 'none';
        fetchPrerequisites();
    } else {
        document.getElementById('import-view').style.display = 'none';
        document.getElementById('access-denied').style.display = 'block';
        document.querySelector('#access-denied p').textContent = authState.isLoggedIn ? 'You must be an Admin to view this page.' : 'You must be logged in as an Admin to view this page.';
    }
}

async function fetchPrerequisites() {
    // Add usersSnapshot to the prerequisite fetch
    const [tilesSnapshot, teamsSnapshot, usersSnapshot] = await Promise.all([
        fb.getDocs(fb.collection(db, 'tiles')),
        fb.getDocs(fb.collection(db, 'teams')),
        fb.getDocs(fb.collection(db, 'users'))
    ]);
    tilesSnapshot.forEach(doc => allTiles[doc.data().id] = doc.data());
    teamsSnapshot.forEach(doc => allTeams[doc.id] = doc.data());
    usersSnapshot.forEach(doc => allUsers[doc.id] = doc.data());
}

async function handleExport() {
    showGlobalLoader();
    try {
        const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
        const submissions = snapshot.docs.map(doc => {
            const data = doc.data();
            // NEW: Convert PlayerIDs to a readable PlayerNames string for export
            const playerNames = (data.PlayerIDs || [])
                .map(uid => allUsers[uid]?.displayName || `[${uid.substring(0,5)}]`)
                .join(', ');
            const finalPlayerString = [playerNames, data.AdditionalPlayerNames].filter(Boolean).join(', ');

            const record = { 
                docId: doc.id,
                PlayerNames: finalPlayerString
            };
            SUBMISSION_FIELDS.forEach(field => {
                let value = data[field] ?? '';
                if (value && typeof value.toDate === 'function') {
                    value = value.toDate().toISOString();
                } else if (typeof value === 'object') {
                    value = JSON.stringify(value);
                }
                // Don't include the raw ID/name fields in the final export
                if (field === 'PlayerIDs' || field === 'AdditionalPlayerNames') return;

                record[field] = value;
            });
            return record;
        });

        if (submissions.length === 0) {
            showMessage('No submissions to export.', true);
            return;
        }

        // Define explicit headers to control order and inclusion
        const exportHeaders = ['docId', 'id', 'Team', 'PlayerNames', 'IsComplete', 'AdminVerified', 'RequiresAction', 'Timestamp', 'CompletionTimestamp', 'Notes', 'Evidence', 'AdminFeedback', 'IsArchived', 'history'];

        const csv = Papa.unparse(submissions, { header: true, columns: exportHeaders });
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'bingo-submissions-export.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showMessage('Export successful!', false);
    } catch (error) {
        showMessage(`Export failed: ${error.message}`, true);
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
            document.getElementById('import-btn').style.display = 'block';
            document.getElementById('import-results').style.display = 'none';
            hideGlobalLoader();
        },
        error: (error) => { showMessage(`CSV parsing error: ${error.message}`, true); hideGlobalLoader(); }
    });
}

function populateMappingTable() {
    const tbody = document.querySelector('#mapping-table tbody');
    tbody.innerHTML = '';
    const headerOptions = `<option value="">-- Ignore --</option>` + csvHeaders.map(h => `<option value="${h}">${h}</option>`).join('');

    EDITABLE_FIELDS.forEach(field => {
        const tr = document.createElement('tr');
        const isRequired = field === 'id' || field === 'Team' || field === 'PlayerNames';
        tr.innerHTML = `<td><label for="map-${field}" class="${isRequired ? 'required-field' : ''}">${field} ${isRequired ? '*' : ''}</label></td>
                        <td><select id="map-${field}" data-field="${field}">${headerOptions}</select></td>`;
        tbody.appendChild(tr);
        const select = tr.querySelector('select');
        const matchingHeader = csvHeaders.find(h => h.toLowerCase() === field.toLowerCase());
        if (matchingHeader) select.value = matchingHeader;
        select.addEventListener('change', updatePreview);
    });
    updatePreview();
}

function updatePreview() {
    const mapping = {};
    let idMapped = false, teamMapped = false, playerMapped = false;
    document.querySelectorAll('#mapping-table select').forEach(select => {
        if (select.value) {
            mapping[select.dataset.field] = select.value;
            if (select.dataset.field === 'id') idMapped = true;
            if (select.dataset.field === 'Team') teamMapped = true;
            if (select.dataset.field === 'PlayerNames') playerMapped = true;
        }
    });

    const importBtn = document.getElementById('import-btn');
    const step3 = document.getElementById('import-step-3');

    if (!idMapped || !teamMapped || !playerMapped) {
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
    previewThead.innerHTML = '<tr>' + mappedFields.map(f => `<th>${f}</th>`).join('') + '</tr>';

    csvData.slice(0, 10).forEach(row => {
        const tr = document.createElement('tr');
        let validationError = '';
        mappedFields.forEach(field => {
            const csvHeader = mapping[field];
            const value = row[csvHeader] || '';
            tr.innerHTML += `<td title="${value}">${value}</td>`;
            if (field === 'id' && !allTiles[value]) validationError = `Tile ID '${value}' does not exist.`;
            if (field === 'Team' && !allTeams[value]) validationError = `Team ID '${value}' does not exist.`;
        });
        if (validationError) {
            tr.style.backgroundColor = '#5d3a3a';
            tr.title = `Invalid Row: ${validationError}`;
            tr.querySelector('td').innerHTML += ` <span class="validation-error">(${validationError})</span>`;
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

    const resultsContainer = document.getElementById('import-results');
    const successList = document.getElementById('success-list');
    const failureList = document.getElementById('failure-list');
    resultsContainer.style.display = 'none';
    successList.innerHTML = '';
    failureList.innerHTML = '';

    const mapping = {};
    document.querySelectorAll('#mapping-table select').forEach(select => {
        if (select.value) mapping[select.dataset.field] = select.value;
    });

    const importMode = document.querySelector('input[name="import-mode"]:checked').value;

    const existingSubsSnapshot = await fb.getDocs(fb.collection(db, 'submissions'));
    const existingSubs = new Map(existingSubsSnapshot.docs.map(doc => [`${doc.data().id}|${doc.data().Team}`, { docId: doc.id, ...doc.data() }]));

    const operations = [];
    const failedRows = [];

    csvData.forEach((row, index) => {
        const subData = { PlayerIDs: [], AdditionalPlayerNames: '' };
        EDITABLE_FIELDS.forEach(field => {
            const csvHeader = mapping[field];
            if (csvHeader && row[csvHeader] !== undefined) {
                let value = row[csvHeader];
                // Handle boolean conversions
                if (['IsComplete', 'AdminVerified', 'RequiresAction', 'IsArchived'].includes(field)) {
                    value = String(value).toLowerCase() === 'true';
                }
                // Don't add PlayerNames directly to subData
                if (field !== 'PlayerNames') {
                    subData[field] = value;
                }
            }
        });

        // NEW: Process PlayerNames into PlayerIDs and AdditionalPlayerNames
        const playerNamesString = row[mapping['PlayerNames']] || '';
        const namesToProcess = playerNamesString.split(',').map(n => n.trim()).filter(Boolean);
        const usersByName = Object.values(allUsers).reduce((acc, user) => {
            if (user.displayName) acc[user.displayName.toLowerCase()] = user.uid;
            return acc;
        }, {});

        namesToProcess.forEach(name => {
            const foundId = usersByName[name.toLowerCase()];
            if (foundId) subData.PlayerIDs.push(foundId);
            else subData.AdditionalPlayerNames = [subData.AdditionalPlayerNames, name].filter(Boolean).join(', ');
        });

        const tileId = subData.id;
        const teamId = subData.Team;

        if (!tileId || !teamId) { failedRows.push({ rowNum: index + 2, reason: 'Missing Tile ID or Team ID.' }); return; }
        if (!allTiles[tileId]) { failedRows.push({ rowNum: index + 2, reason: `Tile ID '${tileId}' does not exist.` }); return; }
        if (!allTeams[teamId]) { failedRows.push({ rowNum: index + 2, reason: `Team ID '${teamId}' does not exist.` }); return; }

        const existingSub = existingSubs.get(`${tileId}|${teamId}`);
        if (existingSub) {
            if (importMode === 'skip') {
                operations.push({ type: 'skip', id: `${tileId} on ${teamId}` });
            } else if (importMode === 'overwrite') {
                operations.push({ type: 'set', ref: fb.doc(db, 'submissions', existingSub.docId), data: subData });
            } else if (importMode === 'archive') {
                operations.push({ type: 'update', ref: fb.doc(db, 'submissions', existingSub.docId), data: { IsArchived: true } });
                operations.push({ type: 'add', data: { ...subData, Timestamp: fb.serverTimestamp() } });
            }
        } else {
            operations.push({ type: 'add', data: { ...subData, Timestamp: fb.serverTimestamp() } });
        }
    });

    if (failedRows.length > 0) {
        showMessage(`Import failed with ${failedRows.length} validation errors.`, true);
        resultsContainer.style.display = 'block';
        document.getElementById('failure-results').style.display = 'block';
        failedRows.forEach(fail => failureList.innerHTML += `<li>Row ${fail.rowNum}: ${fail.reason}</li>`);
        hideGlobalLoader();
        importBtn.disabled = false;
        importBtn.textContent = 'Import Submissions';
        return;
    }

    try {
        const BATCH_SIZE = 499;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = fb.writeBatch(db);
            const chunk = operations.slice(i, i + BATCH_SIZE);
            chunk.forEach(op => {
                if (op.type === 'set') batch.set(op.ref, op.data, { merge: true });
                else if (op.type === 'update') batch.update(op.ref, op.data);
                else if (op.type === 'add') batch.set(fb.doc(fb.collection(db, 'submissions')), op.data);
            });
            await batch.commit();
        }
        showMessage(`Successfully processed ${operations.length} rows!`, false);
        resultsContainer.style.display = 'block';
        document.getElementById('success-results').style.display = 'block';
        operations.forEach(op => successList.innerHTML += `<li>${op.type.toUpperCase()}: ${op.id || op.data.id}</li>`);
        document.getElementById('csv-file-input').value = '';
        document.getElementById('import-step-2').style.display = 'none';
        document.getElementById('import-btn').style.display = 'none';
        document.getElementById('preview-container').style.display = 'none';
    } catch (error) {
        showMessage(`Import failed during database write: ${error.message}`, true);
    } finally {
        hideGlobalLoader();
        importBtn.disabled = false;
        importBtn.textContent = 'Import Submissions';
    }
}

function openClearModal() { document.getElementById('clear-submissions-modal').style.display = 'flex'; }
function closeClearModal() {
    const modal = document.getElementById('clear-submissions-modal');
    modal.style.display = 'none';
    document.getElementById('delete-confirm-input').value = '';
    document.getElementById('delete-confirm-btn').disabled = true;
}
function validateClear() {
    const input = document.getElementById('delete-confirm-input');
    const confirmBtn = document.getElementById('delete-confirm-btn');
    confirmBtn.disabled = input.value !== 'DELETE SUBMISSIONS';
}
async function executeClear() {
    showGlobalLoader();
    const confirmBtn = document.getElementById('delete-confirm-btn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';
    try {
        const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
        const BATCH_SIZE = 499;
        for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
            const batch = fb.writeBatch(db);
            const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
        showMessage('All submissions have been deleted.', false);
        closeClearModal();
    } catch (error) {
        showMessage(`Error clearing submissions: ${error.message}`, true);
    } finally {
        hideGlobalLoader();
        confirmBtn.textContent = 'Confirm Deletion';
    }
}