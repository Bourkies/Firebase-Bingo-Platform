import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as userManager from '../core/data/userManager.js';
import * as teamManager from '../core/data/teamManager.js';

let allUsers = [], allTeams = {};
let authState = {};
let captainTeamId = null; // ID of the team this captain leads
let currentSort = { column: 'displayName', direction: 'asc' };
let searchTerm = '';
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
    console.log('[CaptainController] Auth state changed:', newAuthState);
    authState = newAuthState;
    // The initializeApp function will handle visibility after data is loaded
    // and we can determine if the user is a captain.
    initializeApp();
}

function checkCaptainStatus() {
    captainTeamId = Object.keys(allTeams).find(teamId => allTeams[teamId].captainId === authState.user?.uid) || null;
    console.log(`[CaptainController] Captain status check. User is captain of team: ${captainTeamId || 'None'}`);
    if (captainTeamId) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('users-view').style.display = 'block';
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('users-view').style.display = 'none';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You are not a captain of any team. This page is for team captains only.';
        }
        hideGlobalLoader();
    }
}

function initializeApp() {
    console.log('[CaptainController] Initializing app and data listeners...');
    showGlobalLoader();
    unsubscribeFromAll();
    const unsubs = [];

    // First, listen to teams to determine if the user is a captain.
    console.log('[CaptainController] Subscribing to team data...');
    unsubs.push(teamManager.listenToTeams(newTeams => {
        allTeams = newTeams;
        checkCaptainStatus();

        // If the user is a captain, we can now safely listen to users.
        // We assume the security rules allow a captain to read user data.
        if (captainTeamId) {
            // Check if we're already listening to users to avoid multiple subscriptions.
            if (unsubs.length === 1) { // Only the team listener exists
                console.log('[CaptainController] User is a captain. Subscribing to user data...');
                unsubs.push(userManager.listenToUsers(newUsers => {
                    console.log('[CaptainController] Received user data:', newUsers);
                    allUsers = newUsers;
                    renderUserAssignments();
                    hideGlobalLoader(); // Hide loader after users are loaded
                }));
            }
        } else {
            // If not a captain, we don't need to fetch users.
            hideGlobalLoader();
        }
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
    console.log('[CaptainController] Rendering user assignments...');
    if (!captainTeamId) return; // Don't render if the user is not a captain

    // Filter users
    const filteredUsers = allUsers.filter(user => {
        console.log(`[CaptainController] Filtering user: ${user.displayName} (Team: ${user.team})`);
        // Show only users on the captain's team or unassigned users
        const isEligible = user.team === captainTeamId || !user.team;
        if (!isEligible) return false;

        // Apply search term
        const name = (user.displayName || '').toLowerCase();
        const uid = (user.uid || '').toLowerCase();
        const teamName = (allTeams[user.team]?.name || '').toLowerCase();
        return name.includes(searchTerm) || uid.includes(searchTerm) || teamName.includes(searchTerm);
    });

    console.log('[CaptainController] Filtered users to render:', filteredUsers);

    // Sort users (removed 'isCaptain' sort option)
    filteredUsers.sort((a, b) => {
        const valA = a[currentSort.column] ?? '';
        const valB = b[currentSort.column] ?? '';
        const comparison = String(valA).localeCompare(String(valB), undefined, { numeric: true });
        return currentSort.direction === 'asc' ? comparison : -comparison;
    });

    const tbody = document.querySelector('#user-assignment-table tbody');
    tbody.innerHTML = filteredUsers.map(user => {
        const loginType = user.isAnonymous ? 'Anonymous' : 'Google';
        const loginTypeClass = user.isAnonymous ? 'login-type-anon' : 'login-type-google';
        const captainTeamName = allTeams[captainTeamId]?.name || 'Your Team';
        const isThisUserTheCaptain = user.uid === authState.user?.uid;

        const teamCellContent = isThisUserTheCaptain
            ? `<span>${captainTeamName} (You)</span>`
            : `<select class="user-field" data-uid="${user.uid}" data-field="team">
                   <option value="">--None--</option>
                   <option value="${captainTeamId}" ${user.team === captainTeamId ? 'selected' : ''}>${captainTeamName}</option>
               </select>`;

        return `
            <tr>
                <td data-label="Display Name">${user.displayName || 'N/A'}</td>
                <td data-label="Login Type"><span class="login-type-badge ${loginTypeClass}">${loginType}</span></td>
                <td data-label="User ID" style="font-family: monospace; font-size: 0.8em; color: var(--secondary-text);">${user.uid}</td>
                <td data-label="Team">${teamCellContent}</td>
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

    console.log(`[CaptainController] Processing update for user ${uid}, field ${field}, new value ${value}`);
    // Captains can only change team assignments
    if (field !== 'team') return;

    showGlobalLoader();
    try {
        const user = allUsers.find(u => u.uid === uid);
        const oldTeamId = user?.team;
        const newTeamId = value || null; // "" from select becomes null

        // Additional safeguard: prevent captain from removing themselves.
        if (user.uid === authState.user?.uid && newTeamId !== captainTeamId) {
            showMessage("As captain, you cannot remove yourself from your team.", true);
            return; // Stop the update
        }

        // Security check: Captain can only assign to their own team or unassign from their own team.
        if (oldTeamId && oldTeamId !== captainTeamId) {
            throw new Error("You cannot remove a user from another captain's team.");
        }
        if (newTeamId && newTeamId !== captainTeamId) {
            throw new Error("You can only assign users to your own team.");
        }

        await userManager.updateUser(uid, { team: newTeamId });

        const newTeamName = newTeamId ? allTeams[newTeamId]?.name : 'None';
        showMessage(`Moved ${user.displayName} to team "${newTeamName}".`, false);

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