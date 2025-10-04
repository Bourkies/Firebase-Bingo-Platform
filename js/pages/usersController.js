import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as userManager from '../core/data/userManager.js';
import * as teamManager from '../core/data/teamManager.js';

let allUsers = [], allTeams = {};
let authState = {};
let currentSort = { column: 'displayName', direction: 'asc' };
let searchTerm = '';

// NEW: Define the custom domain for username/password accounts
const USERNAME_DOMAIN = '@fir-bingo-app.com';

let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    document.getElementById('search-filter').addEventListener('input', handleSearch);
    document.querySelectorAll('#user-assignment-table th').forEach(th => {
        th.addEventListener('click', handleSort);
    });
    document.getElementById('add-team-btn').addEventListener('click', addNewTeam);
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(newAuthState) {
    authState = newAuthState;
    if (authState.isEventMod) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('users-view').style.display = 'block';
        initializeApp(); // Re-initialize to get data with the correct permissions
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('users-view').style.display = 'none';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You do not have the required permissions (Event Mod or Admin) to view this page.';
        }
        hideGlobalLoader();
    }
}

function initializeApp() {
    showGlobalLoader();
    unsubscribeFromAll();
    const unsubs = [];

    if (!authState.isEventMod) {
        hideGlobalLoader();
        return;
    }

    let initialDataLoaded = { users: false, teams: false };
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
        }
    };

    unsubs.push(userManager.listenToUsers(newUsers => { // The authState object is now optional
        allUsers = newUsers;
        renderUserTable();
        renderTeamManagement();
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, authState));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        allTeams = newTeams;
        renderUserTable();
        renderTeamManagement();
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());
}

function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    renderUserTable();
}

function handleSort(event) {
    const column = event.currentTarget.dataset.column;
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderUserTable();
}

function renderUserTable() {
    // Filter users
    const filteredUsers = allUsers.filter(user => {
        const name = (user.displayName || '').toLowerCase();
        const loginName = (user.email?.endsWith(USERNAME_DOMAIN) ? user.email.replace(USERNAME_DOMAIN, '') : '').toLowerCase();
        return name.includes(searchTerm) || loginName.includes(searchTerm);
    });

    // Sort users
    filteredUsers.sort((a, b) => {
        const valA = a[currentSort.column] ?? '';
        const valB = b[currentSort.column] ?? '';
        const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });

    const tbody = document.querySelector('#user-assignment-table tbody');
    tbody.innerHTML = filteredUsers.map(user => {
        const isNameLocked = user.isNameLocked === true;

        // NEW: Logic to determine login type and name
        let loginType = 'Google';
        let loginTypeClass = 'login-type-google';
        let loginName = 'N/A';

        if (user.isAnonymous) {
            loginType = 'Anonymous';
            loginTypeClass = 'login-type-anon';
        } else if (user.email && user.email.endsWith(USERNAME_DOMAIN)) {
            loginType = 'Username';
            loginTypeClass = 'login-type-username'; // We'll need to add a style for this
            loginName = user.email.replace(USERNAME_DOMAIN, '');
        }

        return `
            <tr>
                <td data-label="Display Name"><input type="text" class="user-field" data-uid="${user.uid}" data-field="displayName" value="${user.displayName || ''}" ${isNameLocked ? 'disabled' : ''}></td>
                <td data-label="Login Name">${loginName}</td>
                <td data-label="Login Type"><span class="login-type-badge ${loginTypeClass}">${loginType}</span></td>
                <td data-label="User ID" style="font-family: monospace; font-size: 0.8em; color: var(--secondary-text);">${user.uid}</td>
                <td data-label="Lock Name"><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isNameLocked" ${isNameLocked ? 'checked' : ''}></td>
            </tr>`;
    }).join('');

    // Use event delegation on the table body
    const tableBody = document.querySelector('#user-assignment-table tbody');
    // Use a single 'change' event listener for all field types.
    // This fires when a text input loses focus, or a checkbox/select value changes.
    tableBody.onchange = handleFieldChange;

    // Update sort indicators
    document.querySelectorAll('#user-assignment-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.column === currentSort.column) {
            th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function renderTeamManagement() {
    const container = document.getElementById('teams-management-container');
    container.innerHTML = '';

    Object.keys(allTeams).sort().forEach(teamId => {
        const team = allTeams[teamId];
        const teamCard = document.createElement('details');
        teamCard.className = 'team-card';
        teamCard.open = true;

        const teamMembers = allUsers.filter(u => u.team === teamId);
        const unassignedUsers = allUsers.filter(u => !u.team && !u.isAnonymous);

        const captainOptions = allUsers
            .filter(u => !u.isAnonymous)
            .map(u => `<option value="${u.uid}" ${team.captainId === u.uid ? 'selected' : ''}>${u.displayName}</option>`)
            .join('');

        teamCard.innerHTML = `
            <summary><span class="team-id-display-inline">[${teamId}]</span> ${team.name || 'Unnamed Team'}</summary>
            <div class="details-content">
                <div class="team-header">
                    <input type="text" class="team-name-input" data-team-id="${teamId}" value="${team.name || ''}" placeholder="Team Name">
                    <select class="team-captain-select" data-team-id="${teamId}">
                        <option value="">-- No Captain --</option>
                        ${captainOptions}
                    </select>
                    <button class="delete-team-btn destructive-btn" data-team-id="${teamId}" data-team-name="${team.name || ''}">Delete Team</button>
                </div>
                <h4>Current Members (${teamMembers.length})</h4>
                <ul class="team-members-list">
                    ${teamMembers.length > 0 ? teamMembers.map(m => `
                        <li class="team-member-item">
                            <span>${m.displayName}</span>
                            <button class="remove-member-btn" data-uid="${m.uid}" data-team-id="${teamId}">Remove</button>
                        </li>`).join('') : '<li>No members assigned.</li>'
                    }
                </ul>
                <div class="add-member-section">
                    <h4>Add Members</h4>
                    <input type="text" class="add-member-search" data-team-id="${teamId}" placeholder="Search for unassigned users...">
                    <div class="add-member-search-results">
                        ${unassignedUsers.length > 0 ? '' : 'No unassigned users available.'}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(teamCard);
    });

    // Add event listeners using delegation
    container.onchange = (e) => {
        if (e.target.classList.contains('team-name-input')) {
            teamManager.updateTeam(e.target.dataset.teamId, { name: e.target.value });
        } else if (e.target.classList.contains('team-captain-select')) {
            teamManager.updateTeam(e.target.dataset.teamId, { captainId: e.target.value || null });
        }
    };

    container.onclick = (e) => {
        if (e.target.classList.contains('delete-team-btn')) {
            if (confirm(`Are you sure you want to delete team "${e.target.dataset.teamName}"? This cannot be undone.`)) {
                teamManager.deleteTeam(e.target.dataset.teamId);
            }
        } else if (e.target.classList.contains('remove-member-btn')) {
            userManager.updateUser(e.target.dataset.uid, { team: null });
        } else if (e.target.classList.contains('add-member-btn')) {
            userManager.updateUser(e.target.dataset.uid, { team: e.target.dataset.teamId });
        }
    };

    container.oninput = (e) => {
        if (e.target.classList.contains('add-member-search')) {
            const teamId = e.target.dataset.teamId;
            const searchTerm = e.target.value.toLowerCase();
            const resultsContainer = e.target.nextElementSibling;
            const unassignedUsers = allUsers.filter(u => !u.team && !u.isAnonymous);

            if (searchTerm.length < 2) {
                resultsContainer.innerHTML = '...';
                return;
            }

            const results = unassignedUsers.filter(u => u.displayName.toLowerCase().includes(searchTerm));
            resultsContainer.innerHTML = results.length > 0 ? results.map(u => `
                <div class="add-member-item">
                    <span>${u.displayName}</span>
                    <button class="add-member-btn" data-uid="${u.uid}" data-team-id="${teamId}">Add</button>
                </div>
            `).join('') : 'No matching users found.';
        }
    };
}

async function addNewTeam() {
    const existingNumbers = Object.keys(allTeams).map(id => parseInt(id.replace('team', ''), 10)).filter(n => !isNaN(n));
    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    const newId = `team${String(maxNumber + 1).padStart(2, '0')}`;

    try {
        showGlobalLoader();
        await teamManager.createTeam(newId, { name: 'New Team', captainId: null, docId: newId });
        showMessage(`Team ${newId} created.`, false);
    } catch (err) {
        showMessage(`Error creating team: ${err.message}`, true);
    } finally {
        hideGlobalLoader();
    }
}

async function processUpdate(target) {
    const uid = target.dataset.uid;
    const field = target.dataset.field;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    showGlobalLoader();
    try {
        if (field === 'displayName' || field === 'isNameLocked') {
            const user = allUsers.find(u => u.uid === uid);
            await userManager.updateUser(uid, { [field]: value });
            const fieldLabel = field === 'displayName' ? 'Display Name' : 'Name Lock';
            showMessage(`Updated ${user.displayName}'s ${fieldLabel} to "${value}".`, false);
        }
    } catch (error) {
        console.error(`Failed to update user ${uid}:`, error);
        alert(`Update failed: ${error.message}`);
        // The real-time listener will automatically revert the UI on error.
    } finally {
        hideGlobalLoader();
    }
}

function handleFieldChange(e) {
    const target = e.target;
    // Check if the event was triggered on an element we care about.
    if (target.classList.contains('user-field')) {
        processUpdate(target);
    }
}