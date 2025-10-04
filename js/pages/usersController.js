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
        renderUserAssignments();
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, authState));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        allTeams = newTeams;
        renderUserAssignments();
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());
}

function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    renderUserAssignments();
}

function handleSort(event) {
    const column = event.currentTarget.dataset.column;
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderUserAssignments();
}

function renderUserAssignments() {
    // Filter users
    const filteredUsers = allUsers.filter(user => {
        const name = (user.displayName || '').toLowerCase();
        const uid = (user.uid || '').toLowerCase();
        const teamName = (allTeams[user.team]?.name || '').toLowerCase();
        return name.includes(searchTerm) || uid.includes(searchTerm) || teamName.includes(searchTerm);
    });

    // Sort users
    filteredUsers.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'isCaptain') {
            valA = a.team && allTeams[a.team]?.captainId === a.uid;
            valB = b.team && allTeams[b.team]?.captainId === b.uid;
        } else {
            valA = a[currentSort.column] ?? '';
            valB = b[currentSort.column] ?? '';
        }
        const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });

    const tbody = document.querySelector('#user-assignment-table tbody');
    tbody.innerHTML = filteredUsers.map(user => {
        const teamOptions = Object.entries(allTeams).map(([id, data]) => `<option value="${id}" ${user.team === id ? 'selected' : ''}>${data.name}</option>`).join('');
        const isCaptain = user.team && allTeams[user.team]?.captainId === user.uid;
        const canBeCaptain = !!user.team && !user.isAnonymous; // Anonymous users cannot be captains
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
                <td data-label="Login Type"><span class="login-type-badge ${loginTypeClass}">${loginType}</span></td>
                <td data-label="Login Name">${loginName}</td>
                <td data-label="User ID" style="font-family: monospace; font-size: 0.8em; color: var(--secondary-text);">${user.uid}</td>
                <td data-label="Lock Name"><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isNameLocked" ${isNameLocked ? 'checked' : ''}></td>
                <td data-label="Team">
                    <select class="user-field" data-uid="${user.uid}" data-field="team">
                        <option value="">--None--</option>
                        ${teamOptions}
                    </select>
                </td>
                <td data-label="Is Captain"><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isCaptain" ${isCaptain ? 'checked' : ''} ${!canBeCaptain ? 'disabled' : ''}></td>
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
        } else if (field === 'team') {
            const oldTeamId = allUsers.find(u => u.uid === uid)?.team;
            const newTeamId = value || null;
            const user = allUsers.find(u => u.uid === uid);
            const newTeamName = newTeamId ? allTeams[newTeamId]?.name : 'None';
            await userManager.updateUser(uid, { team: newTeamId });
            // If user was captain of old team, remove them as captain
            if (oldTeamId && oldTeamId !== newTeamId && allTeams[oldTeamId]?.captainId === uid) {
                await teamManager.updateTeam(oldTeamId, { captainId: null });
            }
            showMessage(`Moved ${user.displayName} to team "${newTeamName}".`, false);
        } else if (field === 'isCaptain') {
            const user = allUsers.find(u => u.uid === uid);
            const teamId = user?.team;
            if (!teamId) return; // Should not happen as checkbox is disabled

            if (value) { // isChecked
                // Set this user as the new captain for the team
                await teamManager.updateTeam(teamId, { captainId: uid });
                showMessage(`${user.displayName} is now captain of ${allTeams[teamId]?.name}.`, false);
            } else {
                // Only un-set captain if this user *is* the current captain
                if (allTeams[teamId]?.captainId === uid) {
                    await teamManager.updateTeam(teamId, { captainId: null });
                    showMessage(`${user.displayName} is no longer captain of ${allTeams[teamId]?.name}.`, false);
                }
            }
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