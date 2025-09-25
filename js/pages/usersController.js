import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as userManager from '../core/data/userManager.js';
import * as teamManager from '../core/data/teamManager.js';

let allUsers = [], allTeams = {};
let authState = {};
let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
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

    unsubs.push(userManager.listenToUsers(newUsers => {
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

function renderUserAssignments() {
    const tbody = document.querySelector('#user-assignment-table tbody');
    tbody.innerHTML = allUsers.map(user => {
        const teamOptions = Object.entries(allTeams).map(([id, data]) => `<option value="${id}" ${user.team === id ? 'selected' : ''}>${data.name}</option>`).join('');
        const isCaptain = user.team && allTeams[user.team]?.captainId === user.uid;
        const canBeCaptain = !!user.team && !user.isAnonymous; // Anonymous users cannot be captains
        const anonIndicator = user.isAnonymous ? ' (Anonymous)' : '';
        const isNameLocked = user.isNameLocked === true;

        return `
            <tr>
                <td><input type="text" class="user-field" data-uid="${user.uid}" data-field="displayName" value="${user.displayName || ''}" ${isNameLocked ? 'disabled' : ''}>${anonIndicator}</td>
                <td style="font-family: monospace; font-size: 0.8em; color: var(--secondary-text);">${user.uid}</td>
                <td><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isNameLocked" ${isNameLocked ? 'checked' : ''}></td>
                <td>
                    <select class="user-field" data-uid="${user.uid}" data-field="team">
                        <option value="">--None--</option>
                        ${teamOptions}
                    </select>
                </td>
                <td><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isCaptain" ${isCaptain ? 'checked' : ''} ${!canBeCaptain ? 'disabled' : ''}></td>
            </tr>`;
    }).join('');

    // Use event delegation on the table body
    const tableBody = document.querySelector('#user-assignment-table tbody');
    // Remove old listener to prevent duplicates if render is called again
    tableBody.removeEventListener('change', handleFieldChange);
    tableBody.removeEventListener('input', handleDebouncedFieldChange);
    // Add new listeners
    tableBody.addEventListener('change', handleFieldChange);
    tableBody.addEventListener('input', handleDebouncedFieldChange);
}

let inputTimeout;
function handleDebouncedFieldChange(e) {
    if (e.target.type === 'text' && e.target.classList.contains('user-field')) {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(() => processUpdate(e.target), 1000);
    }
}

function handleFieldChange(e) {
    const target = e.target;
    if ((target.type === 'checkbox' || target.tagName === 'SELECT') && target.classList.contains('user-field')) {
        processUpdate(target);
    }
}

async function processUpdate(target) {
    const uid = target.dataset.uid;
    const field = target.dataset.field;
    const value = target.type === 'checkbox' ? target.checked : target.value;

    showGlobalLoader();
    try {
        if (field === 'displayName' || field === 'isNameLocked') {
            await userManager.updateUser(uid, { [field]: value });
        } else if (field === 'team') {
            const oldTeamId = allUsers.find(u => u.uid === uid)?.team;
            const newTeamId = value || null;
            await userManager.updateUser(uid, { team: newTeamId });
            // If user was captain of old team, remove them as captain
            if (oldTeamId && oldTeamId !== newTeamId && allTeams[oldTeamId]?.captainId === uid) {
                await teamManager.updateTeam(oldTeamId, { captainId: null });
            }
        } else if (field === 'isCaptain') {
            const user = allUsers.find(u => u.uid === uid);
            const teamId = user?.team;
            if (!teamId) return; // Should not happen as checkbox is disabled

            if (value) { // isChecked
                // Set this user as the new captain for the team
                await teamManager.updateTeam(teamId, { captainId: uid });
            } else {
                // Only un-set captain if this user *is* the current captain
                if (allTeams[teamId]?.captainId === uid) {
                    await teamManager.updateTeam(teamId, { captainId: null });
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