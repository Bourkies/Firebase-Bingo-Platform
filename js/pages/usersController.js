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

// NEW: State object to remember the open/closed status of details elements
const detailsState = {
    userManagement: false,
    teamManagement: false,
    teams: new Map() // Use a Map to store teamId -> isOpen state
};

let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners
let resizeTimeout; // For debouncing window resize

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    document.getElementById('search-filter').addEventListener('input', handleSearch);
    document.querySelectorAll('#user-assignment-table th').forEach(th => {
        th.addEventListener('click', handleSort);
    });
    // NEW: Add event listeners to track the state of the main details sections
    const userManagementDetails = document.getElementById('user-management-details');
    const teamManagementDetails = document.getElementById('team-management-details');

    userManagementDetails.addEventListener('toggle', (e) => {
        detailsState.userManagement = e.target.open;
    });
    teamManagementDetails.addEventListener('toggle', (e) => {
        detailsState.teamManagement = e.target.open;
    });

    // NEW: Add event listeners for the delete confirmation modal
    document.querySelector('#delete-team-modal .close-button').addEventListener('click', closeDeleteTeamModal);
    document.getElementById('delete-team-cancel-btn').addEventListener('click', closeDeleteTeamModal);
    document.getElementById('delete-team-confirm-input').addEventListener('input', validateDeleteInput);
    document.getElementById('delete-team-confirm-btn').addEventListener('click', executeDeleteTeam);

    // NEW: Add a debounced resize listener to handle textarea height adjustments
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            document.querySelectorAll('.team-name-input').forEach(textarea => {
                // Only resize if the element is visible to avoid unnecessary calculations
                if (textarea.offsetParent !== null) {
                    textarea.style.height = 'auto';
                    textarea.style.height = `${textarea.scrollHeight}px`;
                }
            });
        }, 150);
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
        // NEW: Custom sort logic for team name
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

        // NEW: Get team name for display
        const teamName = user.team ? (allTeams[user.team]?.name || 'Unknown Team') : 'Unassigned';

        return `
            <tr>
                <td data-label="Display Name"><input type="text" class="user-field" data-uid="${user.uid}" data-field="displayName" value="${user.displayName || ''}" ${isNameLocked ? 'disabled' : ''}></td>
                <td data-label="Login Name">${loginName}</td>
                <td data-label="Login Type"><span class="login-type-badge ${loginTypeClass}">${loginType}</span></td>
                <td data-label="Team">${teamName}</td>
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

    // NEW: Restore the open state of the main details sections
    document.getElementById('user-management-details').open = detailsState.userManagement;
    document.getElementById('team-management-details').open = detailsState.teamManagement;

    // NEW: Before clearing the container, save the open state of each team card
    container.querySelectorAll('.team-card').forEach(card => {
        detailsState.teams.set(card.dataset.teamId, card.open);
    });

    container.innerHTML = '';

    Object.keys(allTeams).sort().forEach(teamId => {
        const team = allTeams[teamId];
        const teamCard = document.createElement('details');
        teamCard.className = 'team-card';
        teamCard.open = detailsState.teams.get(teamId) || false; // Restore open state, default to closed
        teamCard.dataset.teamId = teamId; // Add teamId to the dataset for tracking

        const teamMembers = allUsers.filter(u => u.team === teamId);
        // NEW: Also find users who are assigned to a team that no longer exists.
        const unassignedUsers = allUsers.filter(u => !u.team || !allTeams[u.team]);

        // NEW: Only allow team members to be selected as captain.
        const potentialCaptains = [...teamMembers];
        const currentCaptainUser = allUsers.find(u => u.uid === team.captainId);

        // If a captain is assigned but they are NOT on the team (edge case), add them to the list
        // so they appear in the dropdown and don't get accidentally removed on a different save.
        if (currentCaptainUser && !potentialCaptains.some(member => member.uid === currentCaptainUser.uid)) {
            potentialCaptains.push(currentCaptainUser);
        }

        const captainOptions = potentialCaptains
            .map(u => `<option value="${u.uid}" ${team.captainId === u.uid ? 'selected' : ''}>${u.displayName}</option>`)
            .join('');

        teamCard.innerHTML = `
            <summary><span class="team-id-display-inline">[${teamId}]</span><span class="team-name-summary">${team.name || 'Unnamed Team'}</span></summary>
            <div class="details-content">
                <div class="form-field">
                    <label for="team-name-${teamId}">Team Name</label>
                    <textarea id="team-name-${teamId}" class="team-name-input" data-team-id="${teamId}" placeholder="Team Name" rows="1">${team.name || ''}</textarea>
                </div>
                <div class="team-header">
                    <label for="team-captain-${teamId}">Team Captain:</label>
                    <select id="team-captain-${teamId}" class="team-captain-select" data-team-id="${teamId}">
                        <option value="">-- No Captain --</option>
                        ${captainOptions}
                    </select>
                </div>
                <div class="team-actions">
                    <button class="delete-team-btn destructive-btn" data-team-id="${teamId}" data-team-name="${team.name || 'Unnamed Team'}">Delete Team</button>
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
                    <ul class="unassigned-users-list">${unassignedUsers.length > 0 ? unassignedUsers.map(u => `
                        <li class="add-member-item" data-display-name="${u.displayName.toLowerCase()}">
                            <span>${u.displayName}</span>
                            <button class="add-member-btn" data-uid="${u.uid}" data-team-id="${teamId}">Add</button>
                        </li>`).join('') : '<li>No unassigned users available.</li>'}</ul>
                </div>
            </div>
        `;
        container.appendChild(teamCard);
    });

    // NEW: After rendering, go through each textarea and set its initial height correctly.
    // This prevents the "snap back" to 1 row after a data sync.
    container.querySelectorAll('.team-name-input').forEach(textarea => {
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
    });

    // NEW: Create and append the "Add New Team" button at the end of the container.
    const addTeamButton = document.createElement('button');
    addTeamButton.id = 'add-team-btn';
    addTeamButton.textContent = '+ Add New Team';
    addTeamButton.style.marginTop = '1rem'; // Add some space above the button
    container.appendChild(addTeamButton);

    // Add event listeners using delegation
    container.onchange = (e) => {
        if (e.target.classList.contains('team-name-input')) {
            // NEW: Find the parent team-card and update the summary span if the name changes
            const teamCard = e.target.closest('.team-card');
            const summaryNameSpan = teamCard?.querySelector('.team-name-summary');
            if (summaryNameSpan) summaryNameSpan.textContent = e.target.value || 'Unnamed Team';
            teamManager.updateTeam(e.target.dataset.teamId, { name: e.target.value });
        } else if (e.target.classList.contains('team-captain-select')) {
            teamManager.updateTeam(e.target.dataset.teamId, { captainId: e.target.value || null });
        }
    };

    container.onclick = (e) => {
        if (e.target.classList.contains('delete-team-btn')) {
            openDeleteTeamModal(e.target.dataset.teamId, e.target.dataset.teamName);
        } else if (e.target.classList.contains('remove-member-btn')) {
            userManager.updateUser(e.target.dataset.uid, { team: null });
        } else if (e.target.classList.contains('add-member-btn')) {
            userManager.updateUser(e.target.dataset.uid, { team: e.target.dataset.teamId });
        } else if (e.target.id === 'add-team-btn') { // NEW: Handle the add team button click
            addNewTeam();
        }
    };

    container.oninput = (e) => {
        if (e.target.classList.contains('add-member-search')) {
            const teamId = e.target.dataset.teamId;
            const searchTerm = e.target.value.toLowerCase().trim();
            const list = e.target.nextElementSibling; // The <ul> list
            const items = list.querySelectorAll('.add-member-item');

            items.forEach(item => {
                const name = item.dataset.displayName;
                item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
            });
        } else if (e.target.classList.contains('team-name-input')) {
            // NEW: Auto-resize the textarea
            const textarea = e.target;
            textarea.style.height = 'auto'; // Reset height to shrink if needed
            textarea.style.height = `${textarea.scrollHeight}px`;
        }
    };

    // NEW: Add a delegated 'toggle' listener to the container for team cards
    container.ontoggle = (e) => {
        if (e.target.classList.contains('team-card')) {
            detailsState.teams.set(e.target.dataset.teamId, e.target.open);
        }
    };
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
    const expectedName = confirmInput.dataset.expectedName;
    confirmBtn.disabled = confirmInput.value !== expectedName;
}

async function executeDeleteTeam() {
    const confirmBtn = document.getElementById('delete-team-confirm-btn');
    const teamId = confirmBtn.dataset.teamId;
    const teamName = confirmBtn.dataset.teamName;

    if (!teamId || !teamName) {
        showMessage('Error: Missing team information for deletion.', true);
        return;
    }

    closeDeleteTeamModal();
    showGlobalLoader();

    try {
        const membersToUnassign = allUsers.filter(user => user.team === teamId);
        const userUpdatePromises = membersToUnassign.map(member => {
            console.log(`Unassigning ${member.displayName} from team ${teamId}`);
            return userManager.updateUser(member.uid, { team: null });
        });

        await Promise.all(userUpdatePromises);
        await teamManager.deleteTeam(teamId);

        showMessage(`Successfully deleted team "${teamName}" and unassigned ${membersToUnassign.length} members.`, false);
    } catch (error) {
        showMessage(`Error deleting team: ${error.message}`, true);
        console.error("Error during team deletion and member unassignment:", error);
    } finally {
        hideGlobalLoader();
    }
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