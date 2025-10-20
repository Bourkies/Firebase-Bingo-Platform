import '../components/Navbar.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import stores for reading data
import { authStore } from '../stores/authStore.js'; 
import { teamsStore, addTeam, updateTeam, deleteTeam } from '../stores/teamsStore.js';
import { usersStore, updateUser } from '../stores/usersStore.js';

let captainTeamId = null;
let currentSort = { column: 'displayName', direction: 'asc' };

// Define the custom domain for username/password accounts
const USERNAME_DOMAIN = '@fir-bingo-app.com';

// State object to remember the open/closed status of details elements
const detailsState = { userManagement: false, teamManagement: false, teams: new Map() };

document.addEventListener('DOMContentLoaded', () => {
    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    teamsStore.subscribe(onDataChanged);
    usersStore.subscribe(onDataChanged);

    // Setup event listeners for filters
    document.getElementById('user-search-filter').addEventListener('input', onDataChanged);
    document.getElementById('team-filter').addEventListener('change', onDataChanged);

    // Use event delegation for all user table interactions
    const userTable = document.getElementById('users-table');
    userTable.querySelector('tbody').addEventListener('change', handleFieldChange);
    userTable.querySelector('thead').addEventListener('click', handleSort);


    // Event delegation for team management actions
    const teamManagementContainer = document.getElementById('teams-management-container');
    teamManagementContainer.addEventListener('click', handleTeamManagementClick);
    teamManagementContainer.addEventListener('input', handleTeamManagementInput);
    teamManagementContainer.addEventListener('change', handleTeamDetailsChange);

    // Add event listeners to track the state of the main details sections
    document.getElementById('user-management-details').addEventListener('toggle', (e) => { detailsState.userManagement = e.target.open; });
    document.getElementById('team-management-details').addEventListener('toggle', (e) => { detailsState.teamManagement = e.target.open; });
    teamManagementContainer.addEventListener('toggle', (e) => {
        if (e.target.classList.contains('team-card')) { detailsState.teams.set(e.target.dataset.teamId, e.target.open); }
    }, true); // Use capture phase to catch toggle on details

    // Add event listeners for the delete confirmation modal
    document.querySelector('#delete-team-modal .close-button').addEventListener('click', closeDeleteTeamModal);
    document.getElementById('delete-team-cancel-btn').addEventListener('click', closeDeleteTeamModal);
    document.getElementById('delete-team-confirm-input').addEventListener('input', validateDeleteInput);
    document.getElementById('delete-team-confirm-btn').addEventListener('click', executeDeleteTeam);

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    const authState = authStore.get();

    // --- Visibility / Access Control ---
    const usersView = document.getElementById('users-view');
    const accessDenied = document.getElementById('access-denied');

    if (!authState.authChecked) {
        showGlobalLoader();
        usersView.style.display = 'none';
        accessDenied.style.display = 'none';
        return;
    }

    // Access is granted to Captains, Mods, and Admins
    if (authState.isTeamCaptain || authState.isEventMod) {
        usersView.style.display = 'block';
        accessDenied.style.display = 'none';
    } else {
        hideGlobalLoader();
        usersView.style.display = 'none';
        accessDenied.style.display = 'block';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You must be a Team Captain, Event Mod, or Admin to view this page.';
        }
        return;
    }

    // --- Data Loading Check ---
    const allTeams = teamsStore.get();
    const allUsers = usersStore.get();

    // Only show loader if auth is checked but we have no data yet.
    if (authState.authChecked && (Object.keys(allTeams).length === 0 || allUsers.length === 0)) {
        showGlobalLoader();
    } else {
        hideGlobalLoader();
    }

    // Determine captain's team ID if applicable
    if (authState.isTeamCaptain) {
        captainTeamId = Object.keys(allTeams).find(teamId => allTeams[teamId].captainId === authState.user?.uid) || null;
    }

    // --- Render Page ---
    populateFilters();
    renderUsersTable();
    renderTeamManagement(); // NEW: Render the team management section
}

function populateFilters() {
    const allTeams = teamsStore.get();
    const teamFilter = document.getElementById('team-filter');
    const currentValue = teamFilter.value;

    teamFilter.innerHTML = `
        <option value="all">All Teams</option>
        <option value="unassigned">Unassigned</option>
    `;

    Object.entries(allTeams).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([id, data]) => {
        teamFilter.innerHTML += `<option value="${id}">${data.name}</option>`;
    });

    teamFilter.value = currentValue;
}

function renderUsersTable() {
    const authState = authStore.get();
    const allUsers = usersStore.get();
    const allTeams = teamsStore.get();
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';

    // Get filter values
    const searchTerm = document.getElementById('user-search-filter').value.toLowerCase();
    const selectedTeam = document.getElementById('team-filter').value;

    // Sort users
    allUsers.sort((a, b) => {
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

    const filteredUsers = allUsers.filter(user => {
        // Search filter
        if (searchTerm) {
            const searchIn = [user.displayName, user.email, user.uid].join(' ').toLowerCase();
            if (!searchIn.includes(searchTerm)) return false;
        }

        // Team filter
        if (selectedTeam === 'unassigned') {
            if (user.team) return false;
        } else if (selectedTeam !== 'all') {
            if (user.team !== selectedTeam) return false;
        }

        return true;
    });

    if (filteredUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No users match the current filters.</td></tr>';
        return;
    }

    tbody.innerHTML = filteredUsers.map(user => {
        const isNameLocked = user.isNameLocked === true;
        const currentTeamName = user.team ? (allTeams[user.team]?.name || 'Invalid Team') : 'Unassigned';

        // Determine if the current admin can edit this user
        let canEdit = false;

        // Logic to determine login type and name
        let loginType = 'Google';
        let loginTypeClass = 'login-type-google';
        let loginName = user.email || 'N/A';

        if (user.isAnonymous) {
            loginType = 'Anonymous';
            loginTypeClass = 'login-type-anon';
        } else if (user.email && user.email.endsWith(USERNAME_DOMAIN)) {
            loginType = 'Username';
            loginTypeClass = 'login-type-username';
            loginName = user.email.replace(USERNAME_DOMAIN, '');
        }

        return `
            <tr>
                <td data-label="Display Name"><input type="text" class="user-field" data-uid="${user.uid}" data-field="displayName" value="${user.displayName || ''}" ${isNameLocked || !authState.isEventMod ? 'disabled' : ''}></td>
                <td data-label="Login Name">${loginName}</td>
                <td data-label="Login Type"><span class="login-type-badge ${loginTypeClass}">${loginType}</span></td>
                <td data-label="Team">${currentTeamName}</td>
                <td data-label="User ID" style="font-family: monospace; font-size: 0.8em; color: var(--secondary-text);">${user.uid}</td>
                <td data-label="Lock Name"><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isNameLocked" ${isNameLocked ? 'checked' : ''} ${!authState.isEventMod ? 'disabled' : ''}></td>
            </tr>
        `;
    }).join('');

    // Update sort indicators
    document.querySelectorAll('#users-table th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
        if (th.dataset.column === currentSort.column) {
            th.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

function handleSort(event) {
    const column = event.target.closest('th')?.dataset.column;
    if (!column) return;

    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }
    onDataChanged(); // Re-render with new sort
}

// --- NEW: Team Management Section ---

function renderTeamManagement() {
    const authState = authStore.get();
    const teamManagementDetails = document.getElementById('team-management-details');

    if (!authState.isEventMod) {
        // Hide the entire team management details section if not a mod/admin
        teamManagementDetails.style.display = 'none';
        return;
    } else {
        teamManagementDetails.style.display = 'block';
    }

    // Restore open states
    document.getElementById('user-management-details').open = detailsState.userManagement;
    teamManagementDetails.open = detailsState.teamManagement;
    const allTeams = teamsStore.get();
    const allUsers = usersStore.get();
    const container = document.getElementById('teams-management-container');

    // NEW: Get unassigned users once for all teams to use.
    const unassignedUsers = allUsers.filter(u => !u.team || !allTeams[u.team]);
    const unassignedUsersHTML = unassignedUsers.length > 0 ? unassignedUsers.map(u => `
        <li class="add-member-item" data-display-name="${u.displayName.toLowerCase()}"><span>${u.displayName}</span><button class="add-member-btn" data-uid="${u.uid}">Add</button></li>`).join('') : '<li class="no-results-message">No unassigned users available.</li>';

    const sortedTeams = Object.entries(allTeams).sort((a, b) => a[1].name.localeCompare(b[1].name));

    // Create options for captain selection, excluding users already captaining another team.
    const existingCaptainIds = new Set(Object.values(allTeams).map(t => t.captainId).filter(Boolean));

    container.innerHTML = sortedTeams.map(([id, team]) => {
        // NEW: Get members for this specific team
        const teamMembers = allUsers.filter(u => u.team === id);
        const teamMembersHTML = teamMembers.length > 0 ? teamMembers.map(m => `
            <li class="team-member-item"><span>${m.displayName}</span><button class="remove-member-btn" data-uid="${m.uid}">Remove</button></li>`).join('') : '<li>No members assigned.</li>';

        // Captain options are per-team, consisting of its members.
        const captainOptions = teamMembers
            .filter(u => !u.isAnonymous || u.uid === team.captainId) // Allow current captain even if anon
            .map(u => {
                const isCaptainOfOtherTeam = existingCaptainIds.has(u.uid) && u.uid !== team.captainId;
                return `<option value="${u.uid}" ${isCaptainOfOtherTeam ? 'disabled' : ''}>${u.displayName}${isCaptainOfOtherTeam ? ' (Cap of other team)' : ''}</option>`;
            }).join('');

        return `
        <details class="team-card" data-team-id="${id}" ${detailsState.teams.get(id) ? 'open' : ''}>
            <summary><span class="team-id-display-inline">[${id}]</span><span class="team-name-summary">${team.name || 'Unnamed Team'}</span></summary>
            <div class="details-content">
            <div class="team-header">
                <input type="text" class="team-name-input" value="${team.name}" placeholder="Team Name">
                <div class="form-field" style="margin-bottom: 0;">
                    <label for="captain-select-${id}">Captain</label>
                    <select id="captain-select-${id}" class="captain-select">
                        <option value="">-- No Captain --</option>
                        ${captainOptions}
                    </select>
                </div>
                <button class="destructive-btn delete-team-btn">Delete Team</button>
            </div>
            <h4>Current Members (${teamMembers.length})</h4>
            <ul class="team-members-list">${teamMembersHTML}</ul>
            <div class="add-member-section">
                <h4>Add Members</h4>
                <input type="text" class="add-member-search" placeholder="Search for unassigned users...">
                <ul class="unassigned-users-list">${unassignedUsersHTML}</ul>
            </div>
            </div>
        </details>
    `}).join('') + `<button id="add-team-btn" style="margin-top: 1rem;">+ Add New Team</button>`;

    // Set the selected captain for each team
    sortedTeams.forEach(([id, team]) => {
        const select = container.querySelector(`#captain-select-${id}`);
        if (select) {
            select.value = team.captainId || '';
        }
    });
}

async function handleTeamDetailsChange(event) {
    const target = event.target;
    if (!target.classList.contains('team-name-input') && !target.classList.contains('captain-select')) return;
    const teamCard = target.closest('.team-card');
    if (!teamCard) return;

    const teamId = teamCard.dataset.teamId;
    const newName = teamCard.querySelector('.team-name-input').value.trim();
    const newCaptainId = teamCard.querySelector('.captain-select').value || null;

    if (!newName) {
        showMessage('Team name cannot be empty.', true);
        event.target.value = teamsStore.get()[teamId].name; // Revert
        return;
    }

    showGlobalLoader();
    try {
        await updateTeam(teamId, { name: newName, captainId: newCaptainId });
        showMessage(`Team "${newName}" updated successfully.`, false);
    } catch (error) {
        console.error(`Failed to update team ${teamId}:`, error);
        showMessage(`Error updating team: ${error.message}`, true);
    } finally {
        hideGlobalLoader();
    }
}

async function handleTeamManagementClick(event) {
    const target = event.target;

    if (target.id === 'add-team-btn') {
        const newName = prompt('Enter the name for the new team:');
        if (newName && newName.trim()) {
            showGlobalLoader();
            try {
                await addTeam(newName.trim());
                showMessage(`Team "${newName.trim()}" created.`, false);
            } catch (error) {
                console.error('Failed to add team:', error);
                showMessage(`Error: ${error.message}`, true);
            } finally {
                hideGlobalLoader();
            }
        }
    }

    if (target.classList.contains('delete-team-btn')) {
        const teamCard = target.closest('.team-card');
        const teamId = teamCard.dataset.teamId;
        const teamName = teamCard.querySelector('.team-name-input').value;

        openDeleteTeamModal(teamId, teamName);
    }
}

function handleTeamManagementInput(event) {
    const target = event.target;
    if (target.classList.contains('add-member-search')) {
        handleMemberSearch(event);
    } else if (target.classList.contains('team-name-input')) {
        const summaryNameSpan = target.closest('.team-card')?.querySelector('.team-name-summary');
        if (summaryNameSpan) summaryNameSpan.textContent = target.value || 'Unnamed Team';
    }
}

async function executeDeleteTeam() {
    const confirmBtn = document.getElementById('delete-team-confirm-btn');
    const teamId = confirmBtn.dataset.teamId;
    const teamName = confirmBtn.dataset.teamName;

    closeDeleteTeamModal();
    showGlobalLoader();

    try {
        const membersToUnassign = usersStore.get().filter(user => user.team === teamId);
        const userUpdatePromises = membersToUnassign.map(member => updateUser(member.uid, { team: null }));

        await Promise.all(userUpdatePromises);
        await deleteTeam(teamId);

        showMessage(`Successfully deleted team "${teamName}" and unassigned ${membersToUnassign.length} members.`, false);
    } catch (error) {
        showMessage(`Error deleting team: ${error.message}`, true);
        console.error("Error during team deletion and member unassignment:", error);
    } finally {
        hideGlobalLoader();
    }
}

function openDeleteTeamModal(teamId, teamName) {
    const modal = document.getElementById('delete-team-modal');
    document.getElementById('delete-team-modal-name').textContent = `"${teamName}"`;
    const confirmInput = document.getElementById('delete-team-confirm-input');
    confirmInput.value = '';
    confirmInput.dataset.expectedName = 'DELETE';
    const confirmBtn = document.getElementById('delete-team-confirm-btn');
    confirmBtn.dataset.teamId = teamId;
    confirmBtn.dataset.teamName = teamName;
    confirmBtn.disabled = true;
    modal.style.display = 'flex';
    confirmInput.focus();
}

function closeDeleteTeamModal() {
    document.getElementById('delete-team-modal').style.display = 'none';
}

function validateDeleteInput() {
    const confirmInput = document.getElementById('delete-team-confirm-input');
    const confirmBtn = document.getElementById('delete-team-confirm-btn');
    confirmBtn.disabled = confirmInput.value !== confirmInput.dataset.expectedName;
}

async function handleFieldChange(e) {
    const target = e.target;
    if (target.classList.contains('user-field')) {
        const uid = target.dataset.uid;
        const field = target.dataset.field;
        const value = target.type === 'checkbox' ? target.checked : target.value;

        showGlobalLoader();
        try {
            const user = usersStore.get().find(u => u.uid === uid);
            await updateUser(uid, { [field]: value });
            const fieldLabel = field === 'displayName' ? 'Display Name' : 'Name Lock';
            showMessage(`Updated ${user.displayName}'s ${fieldLabel}.`, false);
        } catch (error) {
            console.error(`Failed to update user ${uid}:`, error);
            showMessage(`Update failed: ${error.message}`, true);
        } finally {
            hideGlobalLoader();
        }
    }
}

// --- NEW: Member Management in Team Cards ---

function handleMemberSearch(event) {
    const input = event.target;
    const searchTerm = input.value.toLowerCase().trim();
    const list = input.nextElementSibling; // The <ul> list
    if (!list) return;

    const items = list.querySelectorAll('.add-member-item');
    let visibleCount = 0;
    items.forEach(item => {
        const name = item.dataset.displayName;
        const isVisible = name.includes(searchTerm);
        item.style.display = isVisible ? 'flex' : 'none';
        if (isVisible) visibleCount++;
    });

    // Show/hide the "no users found" message
    const noResultsMsg = list.querySelector('.no-results-message');
    if (noResultsMsg) {
        noResultsMsg.style.display = visibleCount === 0 ? 'block' : 'none';
    }
}

async function handleMemberUpdate(teamId, userId, action) {
    const newTeamId = action === 'add' ? teamId : null;
    const allUsers = usersStore.get();
    const allTeams = teamsStore.get();
    const user = allUsers.find(u => u.uid === userId);

    if (!user) return;

    const teamName = allTeams[teamId]?.name || 'the team';
    const actionText = action === 'add' ? 'Added' : 'Removed';
    const preposition = action === 'add' ? 'to' : 'from';

    showGlobalLoader();
    try {
        await updateUser(userId, { team: newTeamId });
        showMessage(`${actionText} ${user.displayName} ${preposition} ${teamName}.`, false);
    } catch (error) {
        console.error(`Failed to update user ${userId}:`, error);
        showMessage(`Error: ${error.message}`, true);
    } finally {
        hideGlobalLoader();
    }
}

// Extend handleTeamManagementClick to handle member add/remove
const originalTeamManagementClick = handleTeamManagementClick;
handleTeamManagementClick = function(event) {
    const target = event.target;

    if (target.classList.contains('add-member-btn') || target.classList.contains('remove-member-btn')) {
        const teamId = target.closest('.team-card').dataset.teamId;
        const userId = target.dataset.uid;
        const action = target.classList.contains('add-member-btn') ? 'add' : 'remove';
        handleMemberUpdate(teamId, userId, action);
        return; // Stop further processing
    }
    originalTeamManagementClick(event); // Call the original function for other actions
};