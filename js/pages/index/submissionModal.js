import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';
import { saveSubmission } from '../../stores/submissionsStore.js';

let mainController;

export function initializeSubmissionModal(controller) {
    console.log('[SubmissionModal] Initializing.');
    mainController = controller;
    document.querySelector('#submission-modal .close-button').addEventListener('click', () => mainController.closeSubmissionModal());
    document.getElementById('submission-form').addEventListener('submit', handleFormSubmit);
    document.getElementById('add-evidence-btn').addEventListener('click', () => addEvidenceInput());
    document.getElementById('acknowledge-feedback-btn').addEventListener('click', handleAcknowledgeFeedback);

    document.getElementById('evidence-container').addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-evidence-btn')) {
            event.target.closest('.evidence-item').remove();
            renumberEvidenceItems();
        }
    });
}

/**
 * NEW: Updates the content of an already open modal with fresh data from a listener.
 * @param {object} tile - The tile object for context.
 * @param {object} submissionData - The new submission data from Firestore.
 */
export function updateModalContent(tile, submissionData) {
    console.log(`[SubmissionModal] Refreshing content for tile '${tile.id}'.`);
    const modal = document.getElementById('submission-modal');
    if (modal.style.display !== 'flex') return; // Don't update if not visible

    // Determine the new status based on the updated data
    let newStatus = 'Unlocked';
    if (submissionData) {
        if (submissionData.AdminVerified) newStatus = 'Verified';
        else if (submissionData.RequiresAction) newStatus = 'Requires Action';
        else if (submissionData.IsComplete) newStatus = 'Submitted';
        else if (submissionData.Timestamp) newStatus = 'Partially Complete';
    }

    // Re-run the openModal logic, which will now use the updated submission data
    // from the main controller's state, which was updated by the global listener.
    openModal(tile, newStatus);
}

export function openModal(tile, status) {
    console.log(`[SubmissionModal] Opening for tile '${tile.id}' with status '${status}'.`);
    const { config, allTeams, currentTeam, submissions } = mainController.getState();
    const modal = document.getElementById('submission-modal');
    const form = document.getElementById('submission-form');
    form.reset();
    document.getElementById('admin-feedback-display').style.display = 'none';

    document.getElementById('modal-tile-id').value = tile.id;
    const tileName = tile.Name || 'Censored';
    const tilePoints = tile.Points ? `<span style="color: var(--secondary-text); font-size: 0.8em;">${tile.Points} pts</span>` : '';
    document.getElementById('modal-tile-name').innerHTML = `<span>${tile.id}: ${tileName}</span> ${tilePoints}`;
    const teamName = (allTeams && allTeams[currentTeam]) ? allTeams[currentTeam].name : currentTeam;
    document.getElementById('modal-team-name').textContent = `Team: ${teamName}`;
    document.getElementById('modal-tile-desc').textContent = tile.Description || 'This tile is hidden until the event begins.';
    document.getElementById('evidence-label').textContent = config.evidenceFieldLabel || 'Evidence:';

    modal.style.display = 'flex';
    const isEditable = status !== 'Verified';

    const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tile.id && !s.IsArchived);
    let evidenceData = [];

    populatePlayerNameSelector(existingSubmission?.PlayerIDs || [], existingSubmission?.AdditionalPlayerNames || '');
    document.getElementById('notes').value = existingSubmission?.Notes || '';
    if (existingSubmission?.Evidence) {
        try {
            evidenceData = JSON.parse(existingSubmission.Evidence);
            if (!Array.isArray(evidenceData)) throw new Error("Not an array");
        } catch (e) {
            if (existingSubmission.Evidence) evidenceData = [{ link: existingSubmission.Evidence, name: '' }];
        }
    }

    clearEvidenceInputs();
    if (evidenceData.length > 0) {
        evidenceData.forEach(item => addEvidenceInput(item.link, item.name));
    } else if (isEditable) {
        addEvidenceInput();
    }

    const formElements = document.querySelectorAll('#submission-form input, #submission-form textarea, #submission-form button');
    const mainButton = document.getElementById('submit-button-main');
    const secondaryButton = document.getElementById('submit-button-secondary');
    const ackButton = document.getElementById('acknowledge-feedback-btn');

    if (existingSubmission?.AdminFeedback) {
        document.getElementById('admin-feedback-display').style.display = 'block';
        document.getElementById('admin-feedback-text').textContent = existingSubmission.AdminFeedback;
    }

    formElements.forEach(el => el.disabled = false);
    mainButton.style.display = 'block';
    secondaryButton.style.display = 'block';
    ackButton.style.display = 'none';

    if (status === 'Verified') {
        formElements.forEach(el => el.disabled = true);
        mainButton.textContent = 'Verified (Locked)';
        secondaryButton.style.display = 'none';
    } else if (status === 'Requires Action') {
        formElements.forEach(el => el.disabled = true);
        ackButton.disabled = false;
        ackButton.style.display = 'block';
        mainButton.style.display = 'none';
        secondaryButton.style.display = 'none';
    } else if (status === 'Submitted') {
        mainButton.textContent = 'Update Submission';
        mainButton.dataset.action = 'update';
        secondaryButton.textContent = 'Revert to Draft';
        secondaryButton.dataset.action = 'draft';
    } else if (status === 'Partially Complete') {
        mainButton.textContent = 'Submit for Review';
        mainButton.dataset.action = 'submit';
        secondaryButton.textContent = 'Update Draft';
        secondaryButton.dataset.action = 'draft';
    } else {
        mainButton.textContent = 'Submit for Review';
        mainButton.dataset.action = 'submit';
        secondaryButton.textContent = 'Save as Draft';
        secondaryButton.dataset.action = 'draft';
    }
}

export function closeModal() {
    console.log('[SubmissionModal] Closing modal.');
    // The main controller will handle detaching the listener.
    document.getElementById('submission-modal').style.display = 'none';
}

function addEvidenceInput(link = '', name = '') {
    // console.log('[SubmissionModal] Adding evidence input.'); // This can be noisy
    const container = document.getElementById('evidence-container');
    const itemCount = container.children.length;

    const evidenceItemDiv = document.createElement('div');
    evidenceItemDiv.className = 'evidence-item';

    evidenceItemDiv.innerHTML = `
        <div class="evidence-item-header">
            <label>Evidence #${itemCount + 1}</label>
            <button type="button" class="remove-evidence-btn">&times;</button>
        </div>
        <input type="text" class="evidence-name" placeholder="Optional: name or short description" value="${name}">
        <input type="text" class="evidence-link" placeholder="Link (e.g., https://discord...)" value="${link}">
    `;
    container.appendChild(evidenceItemDiv);
}

function renumberEvidenceItems() {
    const container = document.getElementById('evidence-container');
    const items = container.querySelectorAll('.evidence-item');
    items.forEach((item, index) => {
        const label = item.querySelector('label');
        if (label) {
            label.textContent = `Evidence #${index + 1}`;
        }
    });
}

function clearEvidenceInputs() {
    document.getElementById('evidence-container').innerHTML = '';
}

function populatePlayerNameSelector(savedPlayerIDs = [], savedAdditionalNames = '') {
    const { allUsers, currentTeam } = mainController.getState();
    const membersContainer = document.getElementById('team-members-checkboxes');
    const teamCheckbox = document.getElementById('team-submission-checkbox');
    const manualInput = document.getElementById('manual-player-name');

    membersContainer.innerHTML = '';
    teamCheckbox.checked = false;
    manualInput.value = '';

    const teamMembers = allUsers.filter(u => u.team === currentTeam);
    teamMembers.forEach(member => {
        const id = `player-check-${member.uid}`;
        const item = document.createElement('div');
        item.className = 'player-checkbox-item';
        item.innerHTML = `<input type="checkbox" id="${id}" data-uid="${member.uid}"><label for="${id}">${member.displayName}</label>`;
        membersContainer.appendChild(item);
    });

    const { allTeams } = mainController.getState();
    const teamName = allTeams[currentTeam]?.name || currentTeam;
    if (savedAdditionalNames === teamName && savedPlayerIDs.length === 0) {
        teamCheckbox.checked = true;
    } else {
        savedPlayerIDs.forEach(uid => {
            const memberCheckbox = membersContainer.querySelector(`[data-uid="${uid}"]`);
            if (memberCheckbox) memberCheckbox.checked = true;
        });
        manualInput.value = savedAdditionalNames;
    }

    const container = document.getElementById('player-name-container');
    container.removeEventListener('input', updatePlayerNameField);
    container.addEventListener('input', updatePlayerNameField);
    updatePlayerNameField();
}

function updatePlayerNameField() {
    const { allTeams, currentTeam } = mainController.getState();
    const membersContainer = document.getElementById('team-members-checkboxes');
    const teamCheckbox = document.getElementById('team-submission-checkbox');
    const manualInput = document.getElementById('manual-player-name');
    const playerIdsInput = document.getElementById('player-ids-value');
    const additionalNamesInput = document.getElementById('additional-players-value');

    const teamName = allTeams[currentTeam]?.name || currentTeam;

    if (teamCheckbox.checked) {
        playerIdsInput.value = JSON.stringify([]);
        additionalNamesInput.value = teamName;
        membersContainer.querySelectorAll('input').forEach(i => { i.checked = false; i.disabled = true; });
        manualInput.value = ''; manualInput.disabled = true;
        return;
    }

    membersContainer.querySelectorAll('input').forEach(i => i.disabled = false);
    manualInput.disabled = false;
    const selectedUIDs = Array.from(membersContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.uid);
    playerIdsInput.value = JSON.stringify(selectedUIDs);
    additionalNamesInput.value = manualInput.value.trim();
}

function validateEvidenceLink(urlString) {
    if (!urlString) return { isValid: true, message: '' };
    try {
        const url = new URL(urlString);
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname.toLowerCase();
        if (hostname === 'discord.com' && pathname.startsWith('/channels/')) return { isValid: true, message: '' };
        const blockedDomains = ['medal.tv', 'youtube.com', 'youtu.be', 'twitch.tv', 'streamable.com'];
        if (blockedDomains.some(domain => hostname.includes(domain))) return { isValid: false, message: `Links from ${hostname} are not permitted.` };
        const allowedImageHosts = ['i.imgur.com', 'i.gyazo.com', 'i.postimg.cc', 'cdn.discordapp.com', 'media.discordapp.net', 'i.prntscr.com', 'i.ibb.co'];
        if (allowedImageHosts.some(host => hostname.endsWith(host))) {
            if (/\.(png|jpg|jpeg|webp)$/.test(pathname)) return { isValid: true, message: '' };
            return { isValid: false, message: 'Link must be a direct image (png, jpg, jpeg, webp).' };
        }
        if (/\.(png|jpg|jpeg|webp)$/.test(pathname)) return { isValid: true, message: '' };
        return { isValid: false, message: 'Link must be a direct image or a Discord message link.' };
    } catch (e) {
        return { isValid: false, message: 'Invalid URL format.' };
    }
}

async function handleAcknowledgeFeedback() {
    console.log('[SubmissionModal] handleAcknowledgeFeedback called.');
    const { submissions, currentTeam, authState } = mainController.getState();
    const tileId = document.getElementById('modal-tile-id').value;
    const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tileId && !s.IsArchived);
    if (!existingSubmission) return;

    const historyEntry = {
        timestamp: new Date(),
        user: { uid: authState.user.uid, name: authState.profile.displayName },
        action: 'Acknowledge Feedback',
        changes: [{ field: 'RequiresAction', from: true, to: false }]
    };

    // Only log IsComplete change if it actually changes (though it should be false if flagged)
    if (existingSubmission.IsComplete) {
        historyEntry.changes.push({ field: 'IsComplete', from: true, to: false });
    }

    const dataToUpdate = {
        RequiresAction: false, // Set to false when acknowledging
        IsComplete: false,
        history: [...(existingSubmission.history || []), historyEntry]
    };
    // Ensure timestamp is cleared if it exists
    if (existingSubmission.CompletionTimestamp) {
        dataToUpdate.CompletionTimestamp = null;
        historyEntry.changes.push({ field: 'CompletionTimestamp', from: 'Set', to: 'Cleared' });
    }

    await saveSubmission(existingSubmission.docId, dataToUpdate);
    showMessage('Feedback acknowledged. You can now edit and resubmit.', false);    
}

async function handleFormSubmit(event) {
    event.preventDefault();
    console.log('[SubmissionModal] handleFormSubmit called.');
    document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = true);
    showGlobalLoader();

    const { authState, currentTeam, submissions, allUsers } = mainController.getState();

    let allLinksAreValid = true;
    const evidenceItems = [];
    document.querySelectorAll('#evidence-container .evidence-item').forEach(item => {
        const link = item.querySelector('.evidence-link').value.trim();
        const name = item.querySelector('.evidence-name').value.trim();
        const validationResult = validateEvidenceLink(link);
        if (!validationResult.isValid) {
            allLinksAreValid = false;
            showMessage(validationResult.message, true);
            item.querySelector('.evidence-link').style.borderColor = 'var(--error-color)';
        } else {
            item.querySelector('.evidence-link').style.borderColor = '';
        }
        if (link || name) evidenceItems.push({ link, name });
    });

    if (!allLinksAreValid) {
        document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = false);
        hideGlobalLoader();
        return;
    }

    if (!authState.isLoggedIn || authState.profile?.team !== currentTeam) {
        showMessage('You do not have permission to submit for this team.', true);
        document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = false);
        hideGlobalLoader();
        return;
    }

    const tileId = document.getElementById('modal-tile-id').value;
    const existingSubmission = submissions.find(s => s.Team === currentTeam && s.id === tileId && !s.IsArchived);
    const action = event.submitter.dataset.action;
    console.log(`[SubmissionModal] Form action: '${action}'.`);

    const dataToSave = {
        PlayerIDs: JSON.parse(document.getElementById('player-ids-value').value || '[]'),
        AdditionalPlayerNames: document.getElementById('additional-players-value').value,
        Evidence: JSON.stringify(evidenceItems),
        Notes: document.getElementById('notes').value,
        Team: currentTeam,
        id: tileId,
        IsComplete: action === 'submit' || action === 'update',
        RequiresAction: action === 'draft' ? false : (existingSubmission?.RequiresAction || false),
    };

    const historyEntry = {
        timestamp: new Date(),
        user: { uid: authState.user.uid, name: authState.profile.displayName },
        changes: []
    };

    // Set history action
    if (action === 'draft') historyEntry.action = existingSubmission ? 'Revert to Draft' : 'Create Draft';
    else if (action === 'submit') {
        if (existingSubmission?.RequiresAction) {
            historyEntry.action = 'Resubmit for Review';
            historyEntry.changes.push({ field: 'AdminFeedback', from: `"${existingSubmission.AdminFeedback}"`, to: 'Acknowledged & Cleared' });
            dataToSave.RequiresAction = false;
        } else historyEntry.action = existingSubmission ? 'Submit Draft' : 'Create Submission';
    } else if (action === 'update') historyEntry.action = 'Update Submission';
    else historyEntry.action = 'Player Update';

    try {
        if (existingSubmission) {
            // Log detailed changes
            if (dataToSave.IsComplete && !existingSubmission.IsComplete) {
                dataToSave.CompletionTimestamp = new Date();
            } else if (!dataToSave.IsComplete && existingSubmission.CompletionTimestamp) {
                dataToSave.CompletionTimestamp = null;
            }

            mainController.logDetailedChanges(historyEntry, dataToSave, existingSubmission, evidenceItems);
            if (historyEntry.changes.length > 0) dataToSave.history = [...(existingSubmission.history || []), historyEntry];
            await saveSubmission(existingSubmission.docId, dataToSave);
        } else {
            dataToSave.Timestamp = new Date();
            if (dataToSave.IsComplete) dataToSave.CompletionTimestamp = new Date();
            historyEntry.changes.push({ field: 'IsComplete', from: 'N/A', to: dataToSave.IsComplete });
            
            const usersById = new Map(allUsers.map(user => [user.uid, user.displayName]));
            const playerNames = (dataToSave.PlayerIDs || []).map(uid => usersById.get(uid) || `[${uid.substring(0,5)}]`).join(', ');
            const playerSummary = playerNames ? `Added: ${playerNames}` : 'None';
            historyEntry.changes.push({ field: 'PlayerIDs', from: 'N/A', to: playerSummary });

            historyEntry.changes.push({ field: 'AdditionalPlayerNames', from: 'N/A', to: dataToSave.AdditionalPlayerNames });
            historyEntry.changes.push({ field: 'Notes', from: 'N/A', to: dataToSave.Notes });
            // NEW: Create a more detailed summary including the link.
            const evidenceSummary = evidenceItems.map(item => {
                if (item.name && item.link) {
                    return `${item.name} (${item.link})`;
                }
                return item.link || item.name; // Fallback if one is missing
            }).join('; ');
            historyEntry.changes.push({ field: 'Evidence', from: 'N/A', to: evidenceSummary || 'None' });
            dataToSave.history = [historyEntry];

            // NEW: Generate a structured document ID in YYMMDD-TEAMID-TILEID format.
            const now = new Date();
            const year = now.getUTCFullYear().toString().slice(-2);
            const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
            const day = now.getUTCDate().toString().padStart(2, '0');
            const newDocId = `${year}${month}${day}-${dataToSave.Team}-${dataToSave.id}`;

            await saveSubmission(newDocId, dataToSave, true); // Pass true for isNew
        }
        showMessage('Submission saved!', false);
        mainController.closeSubmissionModal(); // Use the controller interface to close
    } catch (error) {
        showMessage('Submission failed: ' + error.message, true);
        console.error("Submission error:", error);
    } finally {
        document.querySelectorAll('#modal-action-buttons button').forEach(b => b.disabled = false);
        hideGlobalLoader();
    }
}