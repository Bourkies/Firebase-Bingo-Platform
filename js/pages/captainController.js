import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as userManager from '../core/data/userManager.js';
import * as teamManager from '../core/data/teamManager.js';
import * as configManager from '../core/data/configManager.js';

let allUsers = [], allTeams = {};
let authState = {};
let captainTeamId = null;

let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners
let unsubscribeUsers = null; // NEW: Separate tracker for the user listener

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
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
        document.getElementById('captain-view').style.display = 'block';
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('captain-view').style.display = 'none';
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
    // NEW: Also specifically clear the user listener if it exists
    if (unsubscribeUsers) {
        unsubscribeUsers();
        unsubscribeUsers = null;
    }
    const unsubs = [];

    // Listen for config to set the page title
    unsubs.push(configManager.listenToConfigAndStyles(configData => {
        const config = configData.config || {};
        document.title = (config.pageTitle || 'Bingo') + " | Captain's Dashboard";
    }));

    // First, listen to teams to determine if the user is a captain.
    console.log('[CaptainController] Subscribing to team data...');
    unsubs.push(teamManager.listenToTeams(newTeams => {
        allTeams = newTeams;
        checkCaptainStatus();

        // If the user is a captain, we can now safely listen to users.
        // We assume the security rules allow a captain to read user data.
        if (captainTeamId && !unsubscribeUsers) { // NEW: Check if we are already subscribed
            console.log('[CaptainController] User is a captain. Subscribing to all user data.');
            // NEW: Assign the unsubscribe function to our specific variable
            unsubscribeUsers = userManager.listenToUsers(newUsers => {
                console.log(`[CaptainController] Received ${newUsers.length} total users.`);
                allUsers = newUsers;
                renderCaptainView();
                hideGlobalLoader();
            });
        } else {
            // If not a captain, we don't need to fetch users.
            renderCaptainView(); // Render an empty state
            hideGlobalLoader();
        }
    }));

    unsubscribeFromAll = () => { unsubs.forEach(unsub => unsub && unsub()); if (unsubscribeUsers) unsubscribeUsers(); };
}

function renderCaptainView() {
    const container = document.getElementById('captain-team-container');
    container.innerHTML = ''; // Clear previous content

    if (!captainTeamId) return;

    const team = allTeams[captainTeamId];
    const teamCard = document.createElement('div');
    teamCard.className = 'team-card';

    const teamMembers = allUsers.filter(u => u.team === captainTeamId);
    const unassignedUsers = allUsers.filter(u => !u.team || !allTeams[u.team]);

    teamCard.innerHTML = `
        <div class="team-header">
            <span class="team-id-display-inline">[${captainTeamId}]</span>
            <h2>${team.name || 'Unnamed Team'}</h2>
        </div>
        <h4>Current Members (${teamMembers.length})</h4>
        <ul class="team-members-list">
            ${teamMembers.length > 0 ? teamMembers.map(m => `
                <li class="team-member-item">
                    <span>${m.displayName} ${m.uid === authState.user.uid ? '(You)' : ''}</span>
                    <button class="remove-member-btn" data-uid="${m.uid}" ${m.uid === authState.user.uid ? 'disabled title="You cannot remove yourself from the team."' : ''}>Remove</button>
                </li>`).join('') : '<li>No members assigned.</li>'
            }
        </ul>
        <div class="add-member-section">
            <h4>Add Members</h4>
            <input type="text" class="add-member-search" placeholder="Search for unassigned users...">
            <ul class="unassigned-users-list">${unassignedUsers.length > 0 ? unassignedUsers.map(u => `
                <li class="add-member-item" data-display-name="${u.displayName.toLowerCase()}">
                    <span>${u.displayName}</span>
                    <button class="add-member-btn" data-uid="${u.uid}">Add</button>
                </li>`).join('') : '<li>No unassigned users available.</li>'}</ul>
        </div>
    `;
    container.appendChild(teamCard);

    // Use event delegation on the table body
    container.onclick = (e) => {
        if (e.target.classList.contains('remove-member-btn')) {
            if (e.target.disabled) return;
            processUpdate(e.target.dataset.uid, null);
        } else if (e.target.classList.contains('add-member-btn')) {
            processUpdate(e.target.dataset.uid, captainTeamId);
        }
    };

    container.oninput = (e) => {
        if (e.target.classList.contains('add-member-search')) {
            const searchTerm = e.target.value.toLowerCase().trim();
            const list = e.target.nextElementSibling; // The <ul> list
            const items = list.querySelectorAll('.add-member-item');

            items.forEach(item => {
                const name = item.dataset.displayName;
                item.style.display = name.includes(searchTerm) ? 'flex' : 'none';
            });
        }
    };
}

async function processUpdate(uid, newTeamId) {
    console.log(`[CaptainController] Processing update for user ${uid}, new team ${newTeamId}`);

    showGlobalLoader();
    try {
        const user = allUsers.find(u => u.uid === uid);

        await userManager.updateUser(uid, { team: newTeamId });

        const action = newTeamId ? 'Added' : 'Removed';
        const teamName = allTeams[captainTeamId]?.name || 'your team';
        const preposition = newTeamId ? 'to' : 'from';
        showMessage(`${action} ${user.displayName} ${preposition} ${teamName}.`, false);

    } catch (error) {
        console.error(`Failed to update user ${uid}:`, error);
        alert(`Update failed: ${error.message}`);
        // The real-time listener will automatically revert the UI on error.
    } finally {
        hideGlobalLoader();
    }
}