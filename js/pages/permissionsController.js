
import '../components/Navbar.js';
import { initAuth } from '../core/auth.js';
import { showGlobalLoader, hideGlobalLoader } from '../core/utils.js';

// Import the new data managers
import * as userManager from '../core/data/userManager.js';

let allUsers = [];
let authState = {};
let unsubscribeFromAll = () => {}; // Single function to unsubscribe from all listeners

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
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

    unsubs.push(userManager.listenToUsers(newUsers => {
        console.log("Permissions: Users updated in real-time.");
        allUsers = newUsers;
        renderUserManagement();
        hideGlobalLoader(); // Users are the only data needed for this page.
    }, authState));

    unsubscribeFromAll = () => unsubs.forEach(unsub => unsub && unsub());
}

function renderUserManagement() {
    const tbody = document.querySelector('#user-management-table tbody');
    tbody.innerHTML = allUsers.map(user => {
        // An admin can edit roles, but not for anonymous users or their own admin status.
        const canEditRoles = authState.isAdmin && !user.isAnonymous;
        const canEditAdmin = canEditRoles && user.uid !== authState.user.uid;
        const adminTooltip = !canEditAdmin ? 'title="Cannot remove your own admin status."' : '';
        const anonIndicator = user.isAnonymous ? ' (Anonymous)' : '';

        return `
            <tr>
                <td>${user.displayName || ''}${anonIndicator}</td>
                <td><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isEventMod" ${user.isEventMod ? 'checked' : ''} ${!canEditRoles ? 'disabled' : ''}></td>
                <td ${adminTooltip}><input type="checkbox" class="user-field" data-uid="${user.uid}" data-field="isAdmin" ${user.isAdmin ? 'checked' : ''} ${!canEditAdmin ? 'disabled' : ''}></td>
            </tr>`;
    }).join('');

    document.querySelectorAll('.user-field').forEach(input => {
        input.addEventListener('change', handleUserFieldChange);
    });
}

async function handleUserFieldChange(e) {
    if (e.target.disabled) return;

    const uid = e.target.dataset.uid;
    const field = e.target.dataset.field;
    const value = e.target.checked;

    try {
        showGlobalLoader();
        await userManager.updateUser(uid, { [field]: value });
        // The real-time listener will handle the UI update, so no need for success message.
    } catch (error) {
        console.error(`Failed to update user ${uid}:`, error);
        alert(`Update failed: ${error.message}`);
        // Revert the checkbox on failure
        e.target.checked = !value;
    } finally {
        hideGlobalLoader();
    }
}