import '../components/Navbar.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// NEW: Import stores for reading data
import { authStore } from '../stores/authStore.js'; 
import { usersStore, updateUser } from '../stores/usersStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { configStore } from '../stores/configStore.js';

let captainTeamId = null;

document.addEventListener('DOMContentLoaded', () => {
    // The Navbar now initializes all stores. We just subscribe to them.
    authStore.subscribe(onDataChanged);
    usersStore.subscribe(onDataChanged);
    teamsStore.subscribe(onDataChanged);
    configStore.subscribe(onDataChanged);

    // Initial call to render the page with default store values.
    onDataChanged();
});

function onDataChanged() {
    const authState = authStore.get();
    const allTeams = teamsStore.get();
    const allUsers = usersStore.get();
    const { config } = configStore.get();

    // --- Page Title ---
    document.title = (config.pageTitle || 'Bingo') + " | Captain's Dashboard";

    // --- Visibility / Access Control ---
    if (!authState.authChecked) {
        showGlobalLoader();
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('captain-view').style.display = 'none';
        return;
    }

    if (authState.isTeamCaptain) {
        document.getElementById('access-denied').style.display = 'none';
        document.getElementById('captain-view').style.display = 'block';
    } else {
        document.getElementById('access-denied').style.display = 'block';
        document.getElementById('captain-view').style.display = 'none';
        if (authState.isLoggedIn) {
            document.querySelector('#access-denied p').textContent = 'You are not a Team Captain. This page is for team captains only.';
        }
        hideGlobalLoader();
        return;
    }

    // --- Data Loading Check ---
    if (Object.keys(allTeams).length === 0 || allUsers.length === 0) {
        showGlobalLoader();
        return;
    } else {
        hideGlobalLoader();
    }
    
    // Find the captain's team ID
    // We prioritize the team the user is assigned to.
    captainTeamId = authState.profile?.team;

    // Fallback: Check if the user is designated as captain on any team (by UID or Email)
    if (!captainTeamId) {
        captainTeamId = Object.keys(allTeams).find(teamId => {
            const t = allTeams[teamId];
            return t.captainId === authState.profile?.uid || t.captainId === authState.profile?.email;
        }) || null;
    }
    renderCaptainView();
}

function renderCaptainView() {
    const container = document.getElementById('captain-team-container');
    container.innerHTML = ''; // Clear previous content

    if (!captainTeamId) return;

    const allTeams = teamsStore.get();
    const allUsers = usersStore.get();
    const authState = authStore.get();

    const team = allTeams[captainTeamId];
    if (!team) return;

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
                    <button class="remove-member-btn" data-doc-id="${m.docId}" ${m.uid === authState.user.uid ? 'disabled title="You cannot remove yourself from the team."' : ''}>Remove</button>
                </li>`).join('') : '<li>No members assigned.</li>'
            }
        </ul>
        <div class="add-member-section">
            <h4>Add Members</h4>
            <input type="text" class="add-member-search" placeholder="Search for unassigned users...">
            <ul class="unassigned-users-list">${unassignedUsers.length > 0 ? unassignedUsers.map(u => `
                <li class="add-member-item" data-display-name="${u.displayName.toLowerCase()}">
                    <span>${u.displayName}</span>
                    <button class="add-member-btn" data-doc-id="${u.docId}">Add</button>
                </li>`).join('') : '<li>No unassigned users available.</li>'}</ul>
        </div>
    `;
    container.appendChild(teamCard);

    // Use event delegation on the table body
    container.onclick = (e) => {
        if (e.target.classList.contains('remove-member-btn')) {
            if (e.target.disabled) return;
            processUpdate(e.target.dataset.docId, null);
        } else if (e.target.classList.contains('add-member-btn')) {
            processUpdate(e.target.dataset.docId, captainTeamId);
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

async function processUpdate(docId, newTeamId) {
    console.log(`[CaptainController] Processing update for user ${docId}, new team ${newTeamId}`);

    const allUsers = usersStore.get();
    const allTeams = teamsStore.get();

    showGlobalLoader();
    try {
        const user = allUsers.find(u => u.docId === docId);

        await updateUser(docId, { team: newTeamId });

        const action = newTeamId ? 'Added' : 'Removed';
        const teamName = allTeams[captainTeamId]?.name || 'your team';
        const preposition = newTeamId ? 'to' : 'from';
        showMessage(`${action} ${user.displayName} ${preposition} ${teamName}.`, false);

    } catch (error) {
        console.error(`Failed to update user ${docId}:`, error);
        showMessage(`Update failed: ${error.message}`, true);
        // The real-time store listener will automatically revert the UI on error.
    } finally {
        hideGlobalLoader();
    }
}