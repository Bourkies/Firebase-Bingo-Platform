import '../components/Navbar.js';
import { db, fb } from '../core/firebase-config.js';
import { showGlobalLoader, hideGlobalLoader } from '../core/utils.js';
import { initAuth, getAuthState } from '../core/auth.js';

let allUsers = {}, allTeams = {}, allTiles = {}, allSubmissions = [];
let unsubscribeUsers, unsubscribeConfig, unsubscribeTeams, unsubscribeTiles, unsubscribeSubmissions;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('team-filter').addEventListener('change', renderSubmissionsTable);
    document.getElementById('search-filter').addEventListener('input', renderSubmissionsTable);
    document.querySelectorAll('#submissions-filters input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', renderSubmissionsTable);
    });
    document.querySelector('#submission-modal .close-button').addEventListener('click', () => document.getElementById('submission-modal').style.display = 'none');
    document.getElementById('modal-form').addEventListener('submit', handleSubmissionUpdate);

    // Initialize authentication. The onAuthStateChanged callback will handle data initialization.
    initAuth(onAuthStateChanged);
});

async function onAuthStateChanged(authState) {
    if (authState.isEventMod) {
        document.getElementById('access-denied').style.display = 'none'; // This is where the authState is passed
        document.getElementById('admin-view').style.display = 'flex';
        // The navbar component now handles showing/hiding its own links.
        // The links below are for the admin dashboard content, not the navbar.
        document.getElementById('user-assignment-link').style.display = authState.isEventMod ? 'inline-block' : 'none';
        document.getElementById('user-permissions-link').style.display = authState.isAdmin ? 'inline-block' : 'none';
        document.getElementById('submissions-import-link').style.display = authState.isAdmin ? 'inline-block' : 'none';
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('admin-view').style.display = 'none';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You do not have the required permissions (Event Mod or Admin) to view this page.';
        }
        hideGlobalLoader();
    }
    // Initialize or re-initialize the app's data listeners whenever auth state changes.
    // This handles both initial load and login/logout events.
    initializeApp(authState);
}

function initializeApp(authState) {
    // Detach old listeners if they exist
    if (unsubscribeConfig) unsubscribeConfig();
    if (unsubscribeTeams) unsubscribeTeams();
    if (unsubscribeTiles) unsubscribeTiles();    
    if (unsubscribeSubmissions) unsubscribeSubmissions();
    if (unsubscribeUsers) unsubscribeUsers();
    let initialDataLoaded = { config: false, teams: false, tiles: false, submissions: false, users: false };
    const checkAllLoaded = () => { // FIX: Added allUsers to check
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
        }
    };

    // Listener for config
    unsubscribeConfig = fb.onSnapshot(fb.doc(db, 'config', 'main'), (doc) => {
        console.log("Admin: Config updated in real-time.");
        const config = doc.data() || {};
        // The navbar component now handles showing/hiding its own links.
        
        if (authState.isEventMod) {
            populateFilters();
        }
        if (!initialDataLoaded.config) { initialDataLoaded.config = true; checkAllLoaded(); }
    }, (error) => { console.error("Error listening to config:", error); hideGlobalLoader(); });

    // Listener for tiles
    unsubscribeTiles = fb.onSnapshot(fb.collection(db, 'tiles'), (snapshot) => {
        console.log("Admin: Tiles updated in real-time.");
        // Key by docId, value is the tile data object
        const newTiles = {};
        snapshot.forEach(doc => { newTiles[doc.id] = { ...doc.data(), docId: doc.id }; });
        allTiles = newTiles;
        
        if (authState.isEventMod) renderSubmissionsTable();
        if (!initialDataLoaded.tiles) { initialDataLoaded.tiles = true; checkAllLoaded(); }
    }, (error) => { console.error("Error listening to tiles:", error); hideGlobalLoader(); });

    // FIX: Add listener for teams to populate filters
    const teamsQuery = fb.query(fb.collection(db, 'teams'), fb.orderBy(fb.documentId()));
    unsubscribeTeams = fb.onSnapshot(teamsQuery, (snapshot) => {
        console.log("Admin: Teams updated in real-time.");
        allTeams = {};
        snapshot.docs.forEach(doc => { allTeams[doc.id] = doc.data(); });
        if (authState.isEventMod) {
            populateFilters();
        }
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }, (error) => { console.error("Error listening to teams:", error); hideGlobalLoader(); });

    // Listener for users
    unsubscribeUsers = fb.onSnapshot(fb.collection(db, 'users'), (snapshot) => {
        console.log("Admin: Users updated in real-time.");
        allUsers = {};
        snapshot.docs.forEach(doc => { allUsers[doc.id] = doc.data(); });
        if (authState.isEventMod) renderSubmissionsTable();
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, (error) => { console.error("Error listening to users:", error); hideGlobalLoader(); });


    // Listener for submissions
    if (authState.isEventMod) {
        document.getElementById('submissions-card').style.display = 'block';
        const submissionsQuery = fb.query(fb.collection(db, 'submissions'), fb.orderBy('Timestamp', 'desc'));
        unsubscribeSubmissions = fb.onSnapshot(submissionsQuery, (snapshot) => {
            console.log("Admin: Submissions updated in real-time.");
            allSubmissions = snapshot.docs.map(doc => ({...doc.data(), docId: doc.id}));
            renderSubmissionsTable();
            if (!initialDataLoaded.submissions) { initialDataLoaded.submissions = true; checkAllLoaded(); }
        });
    } else {
        document.getElementById('submissions-card').style.display = 'none';
    }
}

function populateFilters() {
    const teamFilter = document.getElementById('team-filter');
    teamFilter.innerHTML = '<option value="all">All Teams</option>';
    Object.entries(allTeams).forEach(([id, data]) => {
        teamFilter.innerHTML += `<option value="${id}">${data.name}</option>`;
    });
}

function renderSubmissionsTable() {
    const tbody = document.querySelector('#submissions-table tbody');
    // Get filter values
    const selectedTeam = document.getElementById('team-filter').value;
    const searchTerm = document.getElementById('search-filter').value.toLowerCase();
    const showSubmitted = document.getElementById('status-submitted').checked;
    const showRequiresAction = document.getElementById('status-requires-action').checked;
    const showPartiallyComplete = document.getElementById('status-partially-complete').checked;
    const showVerified = document.getElementById('status-verified').checked;
    const useUtcTime = document.getElementById('utc-time-toggle').checked;

    // Create a map of user-facing IDs to tile data for quick lookups
    const tilesByVisibleId = Object.values(allTiles).reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});

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
            const tileName = (tilesByVisibleId[sub.id]?.Name || '').toLowerCase();
            const teamName = (allTeams[sub.Team]?.name || '').toLowerCase();
            
            // NEW: Search through looked-up player names
            const playerNames = (sub.PlayerIDs || [])
                .map(uid => allUsers[uid]?.displayName || '')
                .join(' ')
                .toLowerCase();
            const additionalNames = (sub.AdditionalPlayerNames || '').toLowerCase();

            const tileId = (sub.id || '').toLowerCase();

            const searchIn = [teamName, tileId, tileName, playerNames, additionalNames];
            if (!searchIn.some(text => text.includes(searchTerm))) return false;
        }
        return true; // If all filters pass
    });

    tbody.innerHTML = filteredSubmissions.map(sub => {
        const status = getSubmissionStatus(sub);
        const tileName = tilesByVisibleId[sub.id]?.Name || sub.id; // Use the new map
        const teamName = allTeams[sub.Team]?.name || sub.Team;
        const date = sub.Timestamp?.toDate();
        const timestamp = date ? (useUtcTime ? date.toUTCString() : date.toLocaleString()) : 'N/A';

        // NEW: Generate player name string from IDs
        const playerNames = (sub.PlayerIDs || [])
            .map(uid => allUsers[uid]?.displayName || `[${uid.substring(0,5)}]`)
            .join(', ');
        const finalPlayerString = [playerNames, sub.AdditionalPlayerNames].filter(Boolean).join(', ');


        return `
            <tr data-id="${sub.docId}">
                <td><span class="status-dot status-${status.replace(' ', '-')}"></span>${status}</td>
                <td>${sub.id}</td>
                <td title="${tileName}">${tileName}</td>
                <td>${teamName}</td>
                <td title="${finalPlayerString}">${finalPlayerString}</td>
                <td>${timestamp}</td>
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

function formatCustomDateTime(date, useUTC = false) {
    if (!date || !(date instanceof Date)) return 'N/A';

    const year = useUTC ? date.getUTCFullYear() : date.getFullYear();
    const month = String((useUTC ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0');
    const day = String(useUTC ? date.getUTCDate() : date.getDate()).padStart(2, '0');
    const hours = String(useUTC ? date.getUTCHours() : date.getHours()).padStart(2, '0');
    const minutes = String(useUTC ? date.getUTCMinutes() : date.getMinutes()).padStart(2, '0');
    const seconds = String(useUTC ? date.getUTCSeconds() : date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

function openSubmissionModal(submissionId) {
    const sub = allSubmissions.find(s => s.docId === submissionId);
    if (!sub) return;

    // Create a map of user-facing IDs to tile data for quick lookups
    const tilesByVisibleId = Object.values(allTiles).reduce((acc, tile) => {
        if (tile.id) acc[tile.id] = tile;
        return acc;
    }, {});

    document.getElementById('modal-submission-id').value = sub.docId;
    const teamName = allTeams[sub.Team]?.name || sub.Team;
    document.getElementById('modal-tile-name').textContent = `${sub.id}: ${tilesByVisibleId[sub.id]?.Name || 'Unknown Tile'}`;
    document.getElementById('modal-team').textContent = teamName;

    // NEW: Generate player name string from IDs
    const playerNames = (sub.PlayerIDs || [])
        .map(uid => allUsers[uid]?.displayName || `[${uid.substring(0,5)}]`)
        .join(', ');
    const finalPlayerString = [playerNames, sub.AdditionalPlayerNames].filter(Boolean).join(', ');
    document.getElementById('modal-players').textContent = finalPlayerString;
    document.getElementById('modal-notes').textContent = sub.Notes || 'None';

    const completionTimestamp = sub.CompletionTimestamp?.toDate();
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
        const sortedHistory = [...sub.history].sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
        sortedHistory.forEach(entry => {
            const date = entry.timestamp?.toDate();
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

    document.getElementById('submission-modal').style.display = 'flex';
}

async function handleSubmissionUpdate(event) {
    event.preventDefault();
    showGlobalLoader();
    const submissionId = document.getElementById('modal-submission-id').value;
    const existingSub = allSubmissions.find(s => s.docId === submissionId);
    if (!existingSub) return;

    const authState = getAuthState(); // We need the current admin's info
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

    const subRef = fb.doc(db, 'submissions', submissionId);
    try {
        // Only add history if there were actual changes
        if (historyEntry.changes.length > 0) {
            dataToUpdate.history = fb.arrayUnion(historyEntry);
        }
        await fb.updateDoc(subRef, dataToUpdate);
        document.getElementById('submission-modal').style.display = 'none';
    } catch (error) {
        console.error("Failed to update submission:", error);
    } finally {
        hideGlobalLoader();
    }
}