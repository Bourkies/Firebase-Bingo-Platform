
import '../components/Navbar.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';
import { fb, db } from '../core/firebase-config.js';

// NEW: Import stores instead of old managers
import { authStore } from '../stores/authStore.js';
import { usersStore, updateUser } from '../stores/usersStore.js';
import { teamsStore } from '../stores/teamsStore.js';

let currentSort = { column: 'displayName', direction: 'asc' };
let searchTerm = '';

// NEW: Define the custom domain for username/password accounts
const USERNAME_DOMAIN = '@fir-bingo-app.com';

document.addEventListener('DOMContentLoaded', () => {
    // Dynamically add search, note, and styles
    const controlsContainer = document.getElementById('admin-controls-container');
    controlsContainer.innerHTML = createAdminControlsHTML();
    document.getElementById('search-filter').addEventListener('input', handleSearch);

    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    usersStore.subscribe(onDataChanged);
    teamsStore.subscribe(onDataChanged);

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    const authState = authStore.get();

    // --- Visibility / Access Control ---
    if (!authState.authChecked) {
        showGlobalLoader();
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('permissions-view').style.display = 'none';
        return;
    }

    if (authState.isAdmin) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('permissions-view').style.display = 'block';
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('permissions-view').style.display = 'none';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You do not have the required permissions (Admin) to view this page.';
        }
        hideGlobalLoader();
    }

    // --- Data Loading Check ---
    const allUsers = usersStore.get();
    const allTeams = teamsStore.get();
    if (allUsers.length === 0 || Object.keys(allTeams).length === 0) {
        showGlobalLoader();
        return;
    } else {
        hideGlobalLoader();
    }

    renderUserManagement();
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
    const allUsers = usersStore.get();
    const allTeams = teamsStore.get();
    const authState = authStore.get();

    // Filter users based on search term
    const filteredUsers = allUsers.filter(user => {
        const name = (user.displayName || '').toLowerCase();
        const loginName = user.email?.endsWith(USERNAME_DOMAIN) ? user.email.replace(USERNAME_DOMAIN, '').toLowerCase() : (user.email || '').toLowerCase();
        const teamName = (allTeams[user.team]?.name || 'unassigned').toLowerCase();
        return name.includes(searchTerm) || loginName.includes(searchTerm) || teamName.includes(searchTerm);
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
        const canEditRoles = authState.isAdmin;
        const canEditAdmin = canEditRoles && user.uid !== authState.user.uid;
        const isModLockedByAdmin = user.isAdmin; // NEW: An admin is always a mod.
        const adminTooltip = !canEditAdmin ? 'title="Cannot remove your own admin status."' : '';

        // Logic to determine login name
        const loginName = user.email && user.email.endsWith(USERNAME_DOMAIN) ? user.email.replace(USERNAME_DOMAIN, '') : (user.email || 'N/A');

        const teamName = user.team ? (allTeams[user.team]?.name || 'Unknown Team') : 'Unassigned';

        return `
            <tr>
                <td data-label="Display Name">${user.displayName || ''}</td>
                <td data-label="Login Name">${loginName}</td>
                <td data-label="Team">${teamName}</td>
                <td data-label="Is Mod"><input type="checkbox" class="user-field mod-checkbox" data-doc-id="${user.docId}" data-field="isEventMod" ${user.isEventMod ? 'checked' : ''} ${!canEditRoles || isModLockedByAdmin ? 'disabled' : ''}></td>
                <td data-label="Is Admin" ${adminTooltip}><input type="checkbox" class="user-field" data-doc-id="${user.docId}" data-field="isAdmin" ${user.isAdmin ? 'checked' : ''} ${!canEditAdmin ? 'disabled' : ''}></td>
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

    const docId = e.target.dataset.docId;
    const field = e.target.dataset.field;
    const value = e.target.checked;
    const dataToUpdate = { [field]: value };    
    const allUsers = usersStore.get();
    const user = allUsers.find(u => u.docId === docId);

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
        await updateUser(docId, dataToUpdate);
        const role = field === 'isAdmin' ? 'Admin' : 'Event Mod';
        const action = value ? 'granted' : 'revoked';
        showMessage(`${role} role ${action} for ${user.displayName}.`, false);
        // The real-time store listener will handle the UI re-render.
    } catch (error) {
        console.error(`Failed to update user ${docId}:`, error);
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
        </style>
        <div class="search-bar">
            <label for="search-filter">Search:</label>
            <input type="text" id="search-filter" placeholder="Filter by name or login type...">
        </div>
    `;
}

// Add event listeners for sorting to the table headers after they are created
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#user-management-table th').forEach(th => {
        th.addEventListener('click', handleSort);
    });
});