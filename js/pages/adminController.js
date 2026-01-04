import '../components/Navbar.js';
import { db, fb } from '../core/firebase-config.js';
import { showGlobalLoader, hideGlobalLoader } from '../core/utils.js';
// NEW: Import stores instead of old managers for reading data
import { authStore } from '../stores/authStore.js';
import { teamsStore } from '../stores/teamsStore.js'; 
import { tilesStore } from '../stores/tilesStore.js';
import { submissionsStore, updateSubmission } from '../stores/submissionsStore.js';
import { usersStore } from '../stores/usersStore.js';

let currentOpenSubmissionId = null; // NEW: To track the currently open modal
let currentSort = { column: 'lastEdited', direction: 'asc' }; // Default sort state

document.addEventListener('DOMContentLoaded', () => {
    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    teamsStore.subscribe(onDataChanged);
    tilesStore.subscribe(onDataChanged);
    submissionsStore.subscribe(onDataChanged);
    usersStore.subscribe(onDataChanged);

    // Setup event listeners for filters and modal
    document.getElementById('team-filter').addEventListener('change', renderSubmissionsTable);
    document.getElementById('search-filter').addEventListener('input', renderSubmissionsTable);
    document.querySelectorAll('#submissions-filters input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', renderSubmissionsTable);
    });
    document.querySelector('#submission-modal .close-button').addEventListener('click', () => {
        document.getElementById('submission-modal').style.display = 'none';
        currentOpenSubmissionId = null; // NEW: Clear the tracking variable on close
    });
    document.getElementById('modal-form').addEventListener('submit', handleSubmissionUpdate);

    // NEW: Mobile sort listener
    document.getElementById('sort-filter').addEventListener('change', (e) => {
        const [col, dir] = e.target.value.split('-');
        if (col && dir) {
            currentSort.column = col;
            currentSort.direction = dir;
            renderSubmissionsTable();
        }
    });

    // Setup sort listeners
    document.querySelectorAll('#submissions-table th').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.dataset.column;
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = ['created', 'lastEdited'].includes(column) ? 'desc' : 'asc';
            }
            renderSubmissionsTable();
        });
    });

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    const authState = authStore.get();

    // --- Visibility / Access Control ---
    const adminView = document.getElementById('admin-view');
    const accessDenied = document.getElementById('access-denied');

    if (!authState.authChecked) {
        showGlobalLoader();
        adminView.style.display = 'none';
        accessDenied.style.display = 'none';
        return;
    }

    if (authState.isEventMod) {
        accessDenied.style.display = 'none';
        document.getElementById('admin-view').style.display = 'flex';
        document.getElementById('user-assignment-link').style.display = authState.isEventMod ? 'inline-block' : 'none';
        document.getElementById('user-permissions-link').style.display = authState.isAdmin ? 'inline-block' : 'none';
        document.getElementById('submissions-import-link').style.display = authState.isAdmin ? 'inline-block' : 'none';
    } else {
        hideGlobalLoader();
        adminView.style.display = 'none';
        accessDenied.style.display = 'block';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You do not have the required permissions (Event Mod or Admin) to view this page.';
        }
        return;
    }

    // --- Data Loading Check ---
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    const submissions = submissionsStore.get();

    if (Object.keys(allTeams).length === 0 || tiles.length === 0) {
        showGlobalLoader();
        return;
    }

    hideGlobalLoader();

    // --- Render Page ---
    populateFilters();
    renderSubmissionsTable();

    // If a modal is open, check for updates and re-render it.
    if (currentOpenSubmissionId) {
        const updatedSub = submissions.find(s => s.docId === currentOpenSubmissionId);
        if (updatedSub) {
            openSubmissionModal(updatedSub, true); // Pass the updated submission object directly
        }
    }
}

function populateFilters() {
    const allTeams = teamsStore.get();
    const teamFilter = document.getElementById('team-filter');
    const currentValue = teamFilter.value;
    teamFilter.innerHTML = '<option value="all">All Teams</option>';
    Object.entries(allTeams).forEach(([id, data]) => {
        teamFilter.innerHTML += `<option value="${id}">${data.name}</option>`;
    });
    teamFilter.value = currentValue;
}

function renderSubmissionsTable() {
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    const allUsers = usersStore.get();
    const allSubmissions = submissionsStore.get();

    const tbody = document.querySelector('#submissions-table tbody');
    tbody.innerHTML = '';

    // Get filter values
    const selectedTeam = document.getElementById('team-filter').value;
    const searchTerm = document.getElementById('search-filter').value.toLowerCase();
    const showSubmitted = document.getElementById('status-submitted').checked;
    const showRequiresAction = document.getElementById('status-requires-action').checked;
    const showPartiallyComplete = document.getElementById('status-partially-complete').checked;
    const showVerified = document.getElementById('status-verified').checked;
    const useUtcTime = document.getElementById('utc-time-toggle').checked;

    // Create a map of user-facing IDs to tile data for quick lookups
    const tilesByVisibleId = new Map(tiles.map(t => [t.id, t]));
    
    // NEW: Robust user lookup (UID + Email)
    const usersMap = new Map();
    allUsers.forEach(u => {
        if (u.uid) usersMap.set(u.uid, u.displayName);
        if (u.docId) usersMap.set(u.docId, u.displayName);
    });

    const filteredSubmissions = allSubmissions.filter(sub => {
        if (sub.IsArchived) return false;

        // Team filter
        const teamMatch = selectedTeam === 'all' || sub.Team === selectedTeam;
        if (!teamMatch) return false;

        // Status filter
        const status = getSubmissionStatus(sub);
        const statusMatch = (status === 'Submitted' && showSubmitted) ||
                            (status === 'Requires Action' && showRequiresAction) ||
                            (status === 'Partially Complete' && showPartiallyComplete) ||
                            (status === 'Verified' && showVerified);
        if (!statusMatch) return false;

        // Search filter
        if (searchTerm) {
            const tileName = (tilesByVisibleId.get(sub.id)?.Name || '').toLowerCase();
            const teamName = (allTeams[sub.Team]?.name || '').toLowerCase();
            
            // NEW: Search through looked-up player names
            const playerNames = (sub.PlayerIDs || []).map(id => usersMap.get(id) || '').join(' ').toLowerCase();
            const additionalNames = (sub.AdditionalPlayerNames || '').toLowerCase();

            const tileId = (sub.id || '').toLowerCase();

            const searchIn = [teamName, tileId, tileName, playerNames, additionalNames];
            if (!searchIn.some(text => text.includes(searchTerm))) return false;
        }
        return true; // If all filters pass
    });

    // --- Sorting Logic ---
    filteredSubmissions.sort((a, b) => {
        const getVal = (sub, col) => {
            if (col === 'status') return getSubmissionStatus(sub);
            if (col === 'id') return sub.id || '';
            if (col === 'tileName') return tilesByVisibleId.get(sub.id)?.Name || '';
            if (col === 'teamName') return allTeams[sub.Team]?.name || sub.Team || '';
            if (col === 'created') return sub.Timestamp || new Date(0);
            if (col === 'createdBy') return getCreatedBy(sub, usersMap);
            if (col === 'lastEdited') return getLastEdited(sub);
            if (col === 'lastEditedBy') return getLastEditedBy(sub, usersMap);
            return '';
        };

        const valA = getVal(a, currentSort.column);
        const valB = getVal(b, currentSort.column);

        if (valA instanceof Date && valB instanceof Date) {
            return currentSort.direction === 'asc' ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        
        if (strA < strB) return currentSort.direction === 'asc' ? -1 : 1;
        if (strA > strB) return currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // Update Sort Indicators
    document.querySelectorAll('#submissions-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.column === currentSort.column) {
            th.classList.add(`sort-${currentSort.direction}`);
        }
    });

    // Sync mobile sort dropdown
    const sortDropdown = document.getElementById('sort-filter');
    if (sortDropdown) {
        sortDropdown.value = `${currentSort.column}-${currentSort.direction}`;
    }

    if (filteredSubmissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">No submissions match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredSubmissions.map(sub => {
        const status = getSubmissionStatus(sub);
        const tileName = tilesByVisibleId.get(sub.id)?.Name || sub.id;
        const teamName = allTeams[sub.Team]?.name || sub.Team;
        const date = sub.Timestamp; // Already a Date object
        const timestamp = formatCustomDateTime(date, useUtcTime);
        const lastEdited = formatCustomDateTime(getLastEdited(sub), useUtcTime);
        const createdBy = getCreatedBy(sub, usersMap);
        const lastEditedBy = getLastEditedBy(sub, usersMap);

        return `
            <tr data-id="${sub.docId}">
                <td data-label="Status"><span class="status-dot status-${status.replace(' ', '-')}"></span>${status}</td>
                <td data-label="Tile ID">${sub.id}</td>
                <td data-label="Tile" title="${tileName}">${tileName}</td>
                <td data-label="Team">${teamName}</td>
                <td data-label="Created">${timestamp}</td>
                <td data-label="Created By">${createdBy}</td>
                <td data-label="Last Edited">${lastEdited}</td>
                <td data-label="Edited By">${lastEditedBy}</td>
            </tr>
        `;
    }).join('');

    document.querySelectorAll('#submissions-table tbody tr').forEach(row => {
        row.addEventListener('click', () => openSubmissionModal(row.dataset.id));
    });
}

function getSubmissionStatus(sub) {
    if (sub.AdminVerified) return 'Verified';
    if (sub.RequiresAction) return 'Requires Action';
    if (sub.IsComplete) return 'Submitted';
    return 'Partially Complete';
}

function getLastEdited(sub) {
    // Return the latest timestamp from history, or the creation timestamp if no history exists
    if (sub.history && Array.isArray(sub.history) && sub.history.length > 0) {
        return sub.history.reduce((max, entry) => {
            const t = entry.timestamp;
            return (t && t > max) ? t : max;
        }, sub.Timestamp || new Date(0));
    }
    return sub.Timestamp || new Date(0);
}

function getCreatedBy(sub, usersMap) {
    if (sub.history && Array.isArray(sub.history) && sub.history.length > 0) {
        // Find the entry with the minimum timestamp
        const firstEntry = sub.history.reduce((min, entry) => {
            return (entry.timestamp < min.timestamp) ? entry : min;
        }, sub.history[0]);
        return firstEntry.user?.name || 'Unknown';
    }
    // Fallback to first player if no history
    if (sub.PlayerIDs && sub.PlayerIDs.length > 0) {
        return usersMap.get(sub.PlayerIDs[0]) || 'Unknown';
    }
    return 'Unknown';
}

function getLastEditedBy(sub, usersMap) {
    if (sub.history && Array.isArray(sub.history) && sub.history.length > 0) {
        // Find the entry with the maximum timestamp
        const lastEntry = sub.history.reduce((max, entry) => {
            return (entry.timestamp > max.timestamp) ? entry : max;
        }, sub.history[0]);
        return lastEntry.user?.name || 'Unknown';
    }
    // Fallback to first player if no history
    if (sub.PlayerIDs && sub.PlayerIDs.length > 0) {
        return usersMap.get(sub.PlayerIDs[0]) || 'Unknown';
    }
    return 'Unknown';
}

function formatCustomDateTime(date, useUTC = false) {
    if (!date) return 'N/A'; // Already a Date object

    // Shorten year to 2 digits
    const year = (useUTC ? date.getUTCFullYear() : date.getFullYear()).toString().slice(-2);
    const month = String((useUTC ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
    const day = String(useUTC ? date.getUTCDate() : date.getDate()).padStart(2, '0');
    const hours = String(useUTC ? date.getUTCHours() : date.getHours()).padStart(2, '0');
    const minutes = String(useUTC ? date.getUTCMinutes() : date.getMinutes()).padStart(2, '0');
    
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
}

function openSubmissionModal(submissionOrId, isUpdate = false) {
    const allSubmissions = submissionsStore.get();
    const allTeams = teamsStore.get();
    const tiles = tilesStore.get();
    const allUsers = usersStore.get();

    // If we're opening from a click, we get an ID. If from a live update, we get the object.
    const sub = typeof submissionOrId === 'string' ? allSubmissions.find(s => s.docId === submissionOrId) : submissionOrId;
    if (!sub) return;

    // NEW: Track the open submission
    currentOpenSubmissionId = sub.docId;

    // Create a map of user-facing IDs to tile data for quick lookups
    const tilesByVisibleId = new Map(tiles.map(t => [t.id, t]));
    
    const usersMap = new Map();
    allUsers.forEach(u => {
        if (u.uid) usersMap.set(u.uid, u.displayName);
        if (u.docId) usersMap.set(u.docId, u.displayName);
    });

    document.getElementById('modal-submission-id').value = sub.docId;
    const teamName = allTeams[sub.Team]?.name || sub.Team;
    document.getElementById('modal-tile-name').textContent = `${sub.id}: ${tilesByVisibleId.get(sub.id)?.Name || 'Unknown Tile'}`;
    document.getElementById('modal-tile-description').textContent = tilesByVisibleId.get(sub.id)?.Description || '';
    document.getElementById('modal-team').textContent = teamName;

    // NEW: Generate player name string from IDs
    const playerNames = (sub.PlayerIDs || []).map(id => usersMap.get(id) || `[${String(id).substring(0,5)}]`).join(', ');
    const finalPlayerString = [playerNames, sub.AdditionalPlayerNames].filter(Boolean).join(', ');
    document.getElementById('modal-players').textContent = finalPlayerString;
    document.getElementById('modal-notes').textContent = sub.Notes || 'None';

    const completionTimestamp = sub.CompletionTimestamp; // Already a Date object
    document.getElementById('modal-timestamp-local').textContent = formatCustomDateTime(completionTimestamp, false);
    document.getElementById('modal-timestamp-utc').textContent = formatCustomDateTime(completionTimestamp, true);

    let evidenceHTML = 'None';
    if (sub.Evidence) {
        try {
            const evidenceList = JSON.parse(sub.Evidence);
            if (Array.isArray(evidenceList) && evidenceList.length > 0) {
                evidenceHTML = evidenceList.map((item, index) => 
                    `<a href="${item.link}" target="_blank" rel="noopener noreferrer" title="${item.link}" style="color: var(--accent-color); display: block;">${item.name || `Evidence ${index + 1}`}</a>`
                ).join('');
            }
        } catch (e) {
            evidenceHTML = `<a href="${sub.Evidence}" target="_blank" rel="noopener noreferrer" title="${sub.Evidence}" style="color: var(--accent-color);">${sub.Evidence}</a>`;
        }
    }
    document.getElementById('modal-evidence').innerHTML = evidenceHTML;

    document.getElementById('modal-verified').checked = sub.AdminVerified || false;
    document.getElementById('modal-requires-action').checked = sub.RequiresAction || false;

    // NEW: Handle Admin Feedback field
    const feedbackGroup = document.getElementById('admin-feedback-group');
    const feedbackInput = document.getElementById('modal-admin-feedback');
    feedbackInput.value = sub.AdminFeedback || '';
    feedbackGroup.style.display = sub.RequiresAction ? 'flex' : 'none';

    // NEW: Make checkboxes mutually exclusive for accept/reject flow
    const verifiedCheckbox = document.getElementById('modal-verified');
    const requiresActionCheckbox = document.getElementById('modal-requires-action');

    verifiedCheckbox.addEventListener('change', () => {
        if (verifiedCheckbox.checked) {
            requiresActionCheckbox.checked = false;
            feedbackGroup.style.display = 'none'; // Hide feedback when verifying
        }
    });

    requiresActionCheckbox.addEventListener('change', (e) => {
        if (requiresActionCheckbox.checked) { verifiedCheckbox.checked = false; }
        feedbackGroup.style.display = e.target.checked ? 'flex' : 'none';
    });

    // NEW: Render history
    const historyDetails = document.getElementById('history-details');
    const historyContent = document.getElementById('modal-history-content');
    const useUtcTime = document.getElementById('utc-time-toggle').checked;
    historyContent.innerHTML = '';
    if (sub.history && Array.isArray(sub.history)) {
        historyDetails.style.display = 'block';
        // Sort history from newest to oldest
        const sortedHistory = [...sub.history].sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
        sortedHistory.forEach(entry => {
            const date = entry.timestamp; // Already a Date object
            const timestamp = date ? (useUtcTime ? date.toUTCString() : date.toLocaleString()) : 'N/A';
            // Always show changes if they exist, including for creation events.
            const changesText = (entry.changes && entry.changes.length > 0)
                ? entry.changes.map(c =>
                    `'${c.field}' from '${c.from}' to '${c.to}'`
                ).join(', ') : '';

            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `<span class="timestamp">[${timestamp}]</span> <span class="user">${entry.user?.name || 'Unknown'}</span>: ${entry.action || 'Update'} ${changesText}`;
            historyContent.appendChild(item);
        });
    } else {
        historyDetails.style.display = 'none';
    }

    if (!isUpdate) {
        document.getElementById('submission-modal').style.display = 'flex';
    }
}

async function handleSubmissionUpdate(event) {
    event.preventDefault();
    showGlobalLoader();
    const allSubmissions = submissionsStore.get();
    const submissionId = document.getElementById('modal-submission-id').value;
    const existingSub = allSubmissions.find(s => s.docId === submissionId);
    if (!existingSub) return;

    const authState = authStore.get(); // We need the current admin's info
    const newVerified = document.getElementById('modal-verified').checked;
    const newRequiresAction = document.getElementById('modal-requires-action').checked;

    // FIX: Compare against the original values, not the live ones
    const originalVerified = !!existingSub.AdminVerified;
    const originalRequiresAction = !!existingSub.RequiresAction;
    const originalFeedback = existingSub.AdminFeedback || '';
    const newFeedback = document.getElementById('modal-admin-feedback').value;

    // NEW: Get original IsComplete status
    const originalIsComplete = !!existingSub.IsComplete;

    const historyEntry = {
        timestamp: new Date(),
        user: { uid: authState.user.uid, name: authState.profile.displayName },
        action: 'Admin Update',
        changes: []
    };
    
    // NEW: Determine the new IsComplete status
    // It becomes false if RequiresAction is checked, otherwise it remains as it was.
    const newIsComplete = newRequiresAction ? false : originalIsComplete;
    
    if (newVerified !== originalVerified) historyEntry.changes.push({ field: 'AdminVerified', from: originalVerified, to: newVerified });
    if (newRequiresAction !== originalRequiresAction) historyEntry.changes.push({ field: 'RequiresAction', from: originalRequiresAction, to: newRequiresAction });
    if (newFeedback !== originalFeedback) historyEntry.changes.push({ field: 'AdminFeedback', from: `"${originalFeedback}"`, to: `"${newFeedback}"` });

    const dataToUpdate = { AdminVerified: newVerified, RequiresAction: newRequiresAction, AdminFeedback: newRequiresAction ? newFeedback : '' };

    // NEW: If Requires Action is checked, automatically set IsComplete to false.
    if (newIsComplete !== originalIsComplete) historyEntry.changes.push({ field: 'IsComplete', from: originalIsComplete, to: newIsComplete });
    if (newRequiresAction) dataToUpdate.IsComplete = false;

    try {
        const history = historyEntry.changes.length > 0 ? historyEntry : null;
        await updateSubmission(submissionId, dataToUpdate, history);
        
        document.getElementById('submission-modal').style.display = 'none';
        currentOpenSubmissionId = null; // NEW: Clear tracking on successful update
    } catch (error) {
        console.error("Failed to update submission:", error);
    } finally {
        hideGlobalLoader();
    }
}