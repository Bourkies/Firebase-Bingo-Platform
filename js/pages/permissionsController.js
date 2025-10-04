
import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as userManager from '../core/data/userManager.js';
import * as teamManager from '../core/data/teamManager.js';

let allUsers = [];
let authState = {};
let allTeams = {};
let currentSort = { column: 'displayName', direction: 'asc' };
let searchTerm = '';
let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners

// NEW: Define the custom domain for username/password accounts
const USERNAME_DOMAIN = '@fir-bingo-app.com';

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    // Dynamically add search, note, and styles
    const controlsContainer = document.getElementById('admin-controls-container');
    controlsContainer.innerHTML = createAdminControlsHTML();
    document.getElementById('search-filter').addEventListener('input', handleSearch);
    initAuth(onAuthStateChanged);
});

function onAuthStateChanged(newAuthState) {
    authState = newAuthState;
    if (authState.isAdmin) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('permissions-view').style.display = 'block';
        initializeApp(); // Re-initialize to apply correct permissions
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('permissions-view').style.display = 'none';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You do not have the required permissions (Admin) to view this page.';
        }
        hideGlobalLoader();
    }
}

function initializeApp() {
    showGlobalLoader();
    unsubscribeFromAll(); // Unsubscribe from any previous listeners
    const unsubs = [];

    if (!authState.isAdmin) {
        hideGlobalLoader();
        return;
    }

    let initialDataLoaded = { users: false, teams: false };
    const checkAllLoaded = () => {
        if (Object.values(initialDataLoaded).every(Boolean)) {
            hideGlobalLoader();
        }
    };

    unsubs.push(userManager.listenToUsers(newUsers => {
        console.log("Permissions: Users updated in real-time.");
        allUsers = newUsers;
        renderUserManagement();
        if (!initialDataLoaded.users) { initialDataLoaded.users = true; checkAllLoaded(); }
    }, authState));

    unsubs.push(teamManager.listenToTeams(newTeams => {
        console.log("Permissions: Teams updated in real-time.");
        allTeams = newTeams;
        renderUserManagement();
        if (!initialDataLoaded.teams) { initialDataLoaded.teams = true; checkAllLoaded(); }
    }));

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());
}

function handleSearch(event) {
    searchTerm = event.target.value.toLowerCase();
    renderUserManagement();
}

function handleSort(event) {
    const column = event.currentTarget.dataset.column;
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    renderUserManagement();
}

function renderUserManagement() {
    // Filter users based on search term
    const filteredUsers = allUsers.filter(user => {
        const name = (user.displayName || '').toLowerCase();
        const loginType = user.isAnonymous ? 'anonymous' : (user.email?.endsWith(USERNAME_DOMAIN) ? 'username' : 'google');
        const loginName = user.email?.endsWith(USERNAME_DOMAIN) ? user.email.replace(USERNAME_DOMAIN, '').toLowerCase() : '';
        const teamName = (allTeams[user.team]?.name || 'unassigned').toLowerCase();
        return name.includes(searchTerm) || loginType.includes(searchTerm) || loginName.includes(searchTerm) || teamName.includes(searchTerm);
    });

    // Sort users
    filteredUsers.sort((a, b) => {
        let valA, valB;
        if (currentSort.column === 'team') {
            valA = allTeams[a.team]?.name || 'Unassigned';
            valB = allTeams[b.team]?.name || 'Unassigned';
        } else {
            valA = a[currentSort.column] ?? '';
            valB = b[currentSort.column] ?? '';
        }

        const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });

    const tbody = document.querySelector('#user-management-table tbody');
    tbody.innerHTML = filteredUsers.map(user => {
        // An admin can edit roles, but not for anonymous users or their own admin status.
        const canEditRoles = authState.isAdmin && !user.isAnonymous;
        const canEditAdmin = canEditRoles && user.uid !== authState.user.uid;
        const isModLockedByAdmin = user.isAdmin; // NEW: An admin is always a mod.
        const adminTooltip = !canEditAdmin ? 'title="Cannot remove your own admin status."' : '';

        // NEW: Logic to determine login type
        let loginType = 'Google';
        let loginName = 'N/A';
        let loginTypeClass = 'login-type-google';
        if (user.isAnonymous) {
            loginType = 'Anonymous';
            loginTypeClass = 'login-type-anon';
        } else if (user.email && user.email.endsWith(USERNAME_DOMAIN)) {
            loginType = 'Username';
            loginTypeClass = 'login-type-username';
            loginName = user.email.replace(USERNAME_DOMAIN, '');
        }

        const teamName = user.team ? (allTeams[user.team]?.name || 'Unknown Team') : 'Unassigned';

        return `
            <tr>
                <td data-label="Display Name">${user.displayName || ''}</td>
                <td data-label="Login Name">${loginName}</td>
                <td data-label="Login Type"><span class="login-type-badge ${loginTypeClass}">${loginType}</span></td>
                <td data-label="Team">${teamName}</td>
                <td data-label="Is Mod"><input type="checkbox" class="user-field mod-checkbox" data-uid="${user.uid}" data-field="isEventMod" ${user.isEventMod ? 'checked' : ''} ${!canEditRoles || isModLockedByAdmin ? 'disabled' : ''}></td>
                <td data-label="Is Admin" ${adminTooltip}><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isAdmin" ${user.isAdmin ? 'checked' : ''} ${!canEditAdmin ? 'disabled' : ''}></td>
            </tr>`;
    }).join('');

    // Update sort indicators in table headers
    document.querySelectorAll('#user-management-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.column === currentSort.column) {
            th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    // Use event delegation on the table body for the 'change' event.
    const tableBody = document.querySelector('#user-management-table tbody');
    tableBody.onchange = handleUserFieldChange;
}

async function handleUserFieldChange(e) {
    if (e.target.disabled) return;

    const uid = e.target.dataset.uid;
    const field = e.target.dataset.field;
    const value = e.target.checked;
    const dataToUpdate = { [field]: value };
    const user = allUsers.find(u => u.uid === uid);

    // NEW: If making a user an admin, also make them a mod.
    if (field === 'isAdmin' && value) {
        dataToUpdate.isEventMod = true;
        // Visually check the mod box in the same row immediately.
        const modCheckbox = e.target.closest('tr')?.querySelector('.mod-checkbox');
        if (modCheckbox) {
            modCheckbox.checked = true;
            modCheckbox.disabled = true; // Also disable it as it's now locked by admin status
        }
    }

    try {
        showGlobalLoader();
        await userManager.updateUser(uid, dataToUpdate);
        const role = field === 'isAdmin' ? 'Admin' : 'Event Mod';
        const action = value ? 'granted' : 'revoked';
        showMessage(`${role} role ${action} for ${user.displayName}.`, false);
        // The real-time listener will handle the UI re-render.
    } catch (error) {
        console.error(`Failed to update user ${uid}:`, error);
        alert(`Update failed: ${error.message}`);
        // Revert the checkbox on failure
        e.target.checked = !value;
    } finally {
        hideGlobalLoader();
    }
}

function createAdminControlsHTML() {
    return `
        <style>
            .admin-controls { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1.5rem; }
            .search-bar { display: flex; align-items: center; gap: 0.5rem; }
            .search-bar input { background-color: var(--bg-color); color: var(--primary-text); border: 1px solid var(--border-color); padding: 0.5rem; border-radius: 4px; width: 300px; }
            .info-note { background-color: rgba(100, 181, 246, 0.1); border-left: 4px solid #64b5f6; padding: 1rem; border-radius: 4px; font-size: 0.9rem; }
            #user-management-table th { cursor: pointer; user-select: none; }
            #user-management-table th.sort-asc::after, #user-management-table th.sort-desc::after { content: ''; display: inline-block; margin-left: 0.5em; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; }
            #user-management-table th.sort-asc::after { border-bottom: 5px solid var(--primary-text); }
            #user-management-table th.sort-desc::after { border-top: 5px solid var(--primary-text); }
            .login-type-badge { padding: 0.2em 0.6em; border-radius: 10px; font-size: 0.8em; font-weight: bold; }
            .login-type-google { background-color: #4285F4; color: white; }
            .login-type-anon { background-color: #757575; color: white; }
            .login-type-username { background-color: #00897b; color: white; }
        </style>
        <div class="search-bar">
            <label for="search-filter">Search:</label>
            <input type="text" id="search-filter" placeholder="Filter by name or login type...">
        </div>
        <div class="info-note">
            <strong>Note:</strong> Anonymous accounts cannot be granted Mod or Admin rights. These permissions require a verified Google account.
        </div>
    `;
}

// Add event listeners for sorting to the table headers after they are created
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#user-management-table th').forEach(th => {
        th.addEventListener('click', handleSort);
    });
});