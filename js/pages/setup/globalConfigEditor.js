/* globalconfigEditor.js */
import { createFormFields } from '../../components/FormBuilder.js';
import * as configManager from '../../core/data/configManager.js';
import * as teamManager from '../../core/data/teamManager.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../../core/utils.js';

let allUsers = [], allTeams = {}, config = {}, allStyles = {};

const configSchema = {
    // Global Config Fields
    pageTitle: { label: 'Page Title', type: 'text', description: 'The title displayed at the top of the bingo page and in the browser tab.' },
    boardImageUrl: { label: 'Board Background Image', type: 'image', path: 'config/board_background', description: 'A direct web URL to the bingo board background image. You can also upload a file here.' },
    maxPageWidth: { label: 'Max Page Width', type: 'text', description: 'The maximum width for the page content. Use px or % (e.g., 1400px or 90%).' },
    showTileNames: { label: 'Show Tile Names', type: 'boolean', description: 'Set to TRUE to display tile names on the board by default, especially if no background image is used.' },
    unlockOnVerifiedOnly: { label: 'Unlock on Verified Only', type: 'boolean', description: 'Set to TRUE to require a tile to be "Verified" by an admin before its prerequisites are met for other tiles.' },
    scoreOnVerifiedOnly: { label: 'Score on Verified Only', type: 'boolean', description: 'Set to TRUE to only count points for "Verified" tiles on the scoreboard and overview.' },
    showScoreboard: { label: 'Show Scoreboard (Player Page)', type: 'boolean', description: 'Set to TRUE to display the team scoreboard at the bottom of the player page.' },
    enableOverviewPage: { label: 'Enable Public Overview Page', type: 'boolean', description: 'Set to TRUE to show the "Overview" link in the navbar for everyone. Admins can always see it.' },
    boardVisibility: { label: 'Board Visibility', type: 'select', options: ['public', 'private'], description: 'If "private", players can only see their own team\'s board state unless they are an admin.' },
    censorTilesBeforeEvent: { label: 'Censor Tiles Pre-Event', type: 'boolean', description: 'Set to TRUE to hide tile names and descriptions from all non-admins. Requires syncing the public layout below.' },
    evidenceFieldLabel: { label: 'Evidence Field Label', type: 'text', description: 'The text label displayed above the evidence submission inputs in the modal.' },
    loadFirstTeamByDefault: { label: 'Load First Team by Default', type: 'boolean', description: 'Set to TRUE to automatically load the first team in the list on the player page, instead of showing "Select a Team...".' },
    promptForDisplayNameOnLogin: { label: 'Prompt for Display Name', type: 'boolean', description: 'Set to TRUE to show a welcome modal on first login, prompting users to set a custom display name.' },
    welcomeMessage: { label: 'Welcome Message', type: 'textarea', description: 'The message shown in the welcome modal. Use {displayName} as a placeholder for the user\'s current name.' },
};

const styleSchema = {
    shape: { label: 'Tile Shape', type: 'select', options: ['Square', 'Ellipse', 'Circle', 'Diamond', 'Triangle', 'Hexagon'], description: 'The overall shape of the tiles.' },
    fill: { label: 'Tile Fill', type: 'colorAndOpacity', description: 'The background color and opacity for the tile.' },
    border: { label: 'Border', type: 'widthAndColor', keys: { width: 'borderWidth', color: 'borderColor' }, unit: 'px', description: 'The tile\'s border width and color.' },
    hoverBorder: { label: 'Hover Border', type: 'widthAndColor', keys: { width: 'hoverBorderWidth', color: 'hoverBorderColor' }, unit: 'px', description: 'The border width and color on hover.' },
    useStampByDefault: { label: 'Use Stamp', type: 'boolean', description: 'Toggles the use of a stamp image for this status. When enabled, the settings below will apply.' },
    stampImageUrl: { label: 'Stamp Image', type: 'image', path: 'styles/stamps/', description: 'URL for the stamp image to display on tiles. You can also upload a file.' },
    stampScale: { label: `Stamp Scale`, type: 'range', min: 0, max: 3, step: 0.05, description: `Size multiplier for the stamp (e.g., 1 is 100%, 0.5 is 50%).` },
    stampRotation: { label: `Stamp Rotation`, type: 'text', description: 'Rotation of the stamp (e.g., "45deg").' },
    stampPosition: { label: `Stamp Position`, type: 'text', description: 'CSS background-position value for the stamp (e.g., "center", "top left", "50% 50%").' }
};

const configGroups = {
    'Board Configuration': ['pageTitle', 'boardImageUrl', 'maxPageWidth', 'showTileNames', 'evidenceFieldLabel', 'loadFirstTeamByDefault'],
    'User Experience': ['promptForDisplayNameOnLogin', 'welcomeMessage'],
    'Rules & Visibility': ['unlockOnVerifiedOnly', 'scoreOnVerifiedOnly', 'showScoreboard', 'enableOverviewPage', 'boardVisibility', 'censorTilesBeforeEvent'],
};

const STATUSES = ['Locked', 'Unlocked', 'Partially Complete', 'Submitted', 'Verified', 'Requires Action'];

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const debouncedSaveConfig = debounce(async (data) => {
    try {
        await configManager.updateConfig(data);
        console.log('Config auto-saved.');
    } catch (err) {
        showMessage(`Error saving config: ${err.message}`, true);
        renderGlobalConfig();
    }
}, 1000);

const debouncedUpdateTeam = debounce(async (teamId, field, value) => {
    try {
        await teamManager.updateTeam(teamId, { [field]: value });
        console.log(`Team ${teamId} field '${field}' auto-saved.`);
    } catch (err) {
        showMessage(`Error saving team ${teamId}: ${err.message}`, true);
        renderTeamsList();
    }
}, 1500);

const debouncedSaveStyle = debounce(async (styleId, data) => {
    try {
        await configManager.updateStyle(styleId, data);
        console.log(`Style ${styleId} auto-saved.`);
    } catch (err) {
        showMessage(`Error saving style: ${err.message}`, true);
        renderGlobalConfig();
    }
}, 1000);

export function initializeGlobalConfig(mainController) {
    const toggleTeamsBtn = document.getElementById('toggle-teams-btn');
    const toggleGlobalStylesBtn = document.getElementById('toggle-global-styles-btn');

    console.log("globalConfigEditor: Initializing...");
    toggleTeamsBtn?.addEventListener('click', toggleTeams);
    toggleGlobalStylesBtn?.addEventListener('click', toggleGlobalStyles);
    // FIX: Pass mainController to the handler
    document.getElementById('global-style-form')?.addEventListener('input', (e) => handleGlobalStyleInputChange(e, mainController)); 
    document.getElementById('add-team-btn')?.addEventListener('click', addNewTeam);

    toggleTeams();
    toggleGlobalStyles();
}

export function updateGlobalConfigData(newConfig, newStyles, newUsers, newTeams) {
    config = newConfig;
    allStyles = newStyles;
    allUsers = newUsers;
    allTeams = newTeams;
}

export function renderGlobalConfig(mainController) {
    console.log("globalConfigEditor: renderGlobalConfig called.");
    const formContainer = document.getElementById('global-style-form');
    if (!formContainer || !config) return; // Guard against running before config is loaded

    formContainer.innerHTML = '<p>Edit the global configuration below. Image fields support direct uploads. Changes will be reflected on the board live.</p>';

    for (const [groupName, properties] of Object.entries(configGroups)) {
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'overrides-fieldset';
        fieldset.append(Object.assign(document.createElement('legend'), { textContent: groupName }));
        const contentDiv = document.createElement('div');
        contentDiv.className = 'config-grid';
        fieldset.appendChild(contentDiv);
        createFormFields(contentDiv, configSchema, config, properties);
        formContainer.appendChild(fieldset);
    }

    const stylesFieldset = document.createElement('fieldset');
    stylesFieldset.className = 'overrides-fieldset';
    stylesFieldset.append(Object.assign(document.createElement('legend'), { textContent: 'Tile Status Styles' }));
    const stylesContent = document.createElement('div');
    stylesContent.className = 'config-grid';
    stylesFieldset.appendChild(stylesContent);

    STATUSES.forEach(status => {
        const statusData = allStyles[status] || {};
        const statusFieldset = document.createElement('fieldset');
        statusFieldset.className = 'stamp-fieldset';
        statusFieldset.append(Object.assign(document.createElement('legend'), { textContent: status }));
        const statusContent = document.createElement('div');
        statusContent.className = 'config-grid';
        statusFieldset.appendChild(statusContent);
        createFormFields(statusContent, styleSchema, statusData, Object.keys(styleSchema), { status });
        stylesContent.appendChild(statusFieldset);
    });

    formContainer.appendChild(stylesFieldset);
    // Add listeners after the form is built
    // FIX: Pass mainController to the handler
    formContainer.querySelectorAll('input[type="file"]').forEach(input => input.addEventListener('change', (e) => handleImageUpload(e.target, mainController)));
}

function handleGlobalStyleInputChange(event, mainController) {
    const input = event.target;
    const key = input.dataset.key;
    // FIX: Check for mainController before using it.
    if (!key) return;

    if (input.type === 'file' || !mainController) return;

    const status = input.dataset.status;
    let newValue = input.type === 'checkbox' ? input.checked : input.value;
    if (input.dataset.unit) newValue += input.dataset.unit;

    if (input.type === 'text' && (key === 'boardImageUrl' || key === 'stampImageUrl')) {
        const fieldContainer = input.closest('.form-field');
        if (fieldContainer) {
            const previewImg = fieldContainer.querySelector('.image-upload-preview');
            if (previewImg) {
                previewImg.src = input.value;
                previewImg.style.display = input.value ? 'block' : 'none';
            }
        }
    }

    if (status) {
        if (!allStyles[status]) allStyles[status] = {};
        allStyles[status][key] = newValue;
        debouncedSaveStyle(status, { [key]: newValue });
    } else {
        config[key] = newValue;
        if (key === 'boardImageUrl') mainController.loadBoardImage(newValue);
        debouncedSaveConfig({ [key]: newValue });
    }
    console.log("globalConfigEditor: Style/Config change detected, re-rendering tiles.");
    mainController.renderTiles();
}

async function handleImageUpload(input, mainController) {
    const file = input.files[0];
    console.log(`globalConfigEditor: handleImageUpload for ${input.dataset.path}`);
    if (!file) return;
    const storagePath = input.dataset.path;
    if (!storagePath) return;
    const compoundDiv = input.closest('.form-field-compound');
    const textInput = compoundDiv.querySelector('input[type="text"]');

    showGlobalLoader();
    const oldUrl = textInput.value;

    try {
        const url = await configManager.uploadImage(storagePath, file, oldUrl);
        if (textInput) textInput.value = url;
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
        showMessage(`Uploaded ${file.name}`, false);
    } catch (error) {
        showMessage(`Upload failed: ${error.message}`, true);
    } finally {
        hideGlobalLoader();
    }
}

function toggleGlobalStyles() {
    const form = document.getElementById('global-style-form');
    const isHidden = form.style.display === 'none';
    form.style.display = isHidden ? '' : 'none';
    document.getElementById('toggle-global-styles-btn').textContent = isHidden ? '-' : '+';
}

export function renderTeamsList(users) {
    console.log("globalConfigEditor: renderTeamsList called.");
    if (users) allUsers = users; // Only update if new users are passed in
    const teamsContainer = document.getElementById('teams-container');
    let activeElement = document.activeElement;
    let activeTeamId = null, activeFieldClass = null, activeValue = null, selectionStart = null, selectionEnd = null;

    if (activeElement && teamsContainer.contains(activeElement)) {
        const teamItem = activeElement.closest('.team-item');
        if (teamItem && teamItem.dataset.teamId) {
            activeTeamId = teamItem.dataset.teamId;
            activeValue = activeElement.value;
            selectionStart = activeElement.selectionStart;
            selectionEnd = activeElement.selectionEnd;
            if (activeElement.classList.contains('team-name')) activeFieldClass = 'team-name';
            else if (activeElement.classList.contains('team-captain')) activeFieldClass = 'team-captain';
        }
    }

    teamsContainer.innerHTML = '';
    if (!allTeams || Object.keys(allTeams).length === 0) return; // Guard against allTeams not being ready

    const sortedTeamIds = Object.keys(allTeams).sort();
    sortedTeamIds.forEach(teamId => {
        const team = allTeams[teamId];
        addTeamRow(teamId, team.name || '', team.captainId || '');
    });

    if (activeTeamId && activeFieldClass) {
        const newTeamItem = teamsContainer.querySelector(`.team-item[data-team-id="${activeTeamId}"]`);
        if (newTeamItem) {
            const newActiveElement = newTeamItem.querySelector(`.${activeFieldClass}`);
            if (newActiveElement) {
                newActiveElement.value = activeValue;
                newActiveElement.focus();
                try { newActiveElement.setSelectionRange(selectionStart, selectionEnd); } catch (e) { /* no-op */ }
            }
        }
    }
}

function addTeamRow(teamId, name = '', captainId = '') {
    const container = document.getElementById('teams-container');
    const item = document.createElement('div');
    item.className = 'team-item';
    item.dataset.teamId = teamId;

    const idDisplay = Object.assign(document.createElement('span'), { className: 'team-id-display', textContent: teamId, title: 'Team ID (fixed)' });
    const nameInput = Object.assign(document.createElement('input'), { type: 'text', className: 'team-field team-name', placeholder: 'Team Name', value: name });
    const captainSelect = document.createElement('select');
    captainSelect.className = 'team-field team-captain';
    captainSelect.innerHTML = `<option value="">-- No Captain --</option>`;
    allUsers.forEach(user => {
        captainSelect.innerHTML += `<option value="${user.uid}" ${user.uid === captainId ? 'selected' : ''}>${user.displayName || user.email}</option>`;
    });
    const removeBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'remove-team-btn', textContent: 'Remove', style: 'margin-top: 0;' });

    item.append(idDisplay, nameInput, captainSelect, removeBtn);
    container.appendChild(item);

    nameInput.oninput = (e) => debouncedUpdateTeam(teamId, 'name', e.target.value);
    captainSelect.onchange = (e) => debouncedUpdateTeam(teamId, 'captainId', e.target.value || null);
    removeBtn.onclick = () => {
        if (confirm(`Are you sure you want to delete team "${name || teamId}"?`)) {
            deleteTeam(teamId);
        }
    };
}

async function addNewTeam() {
    if (!allTeams) allTeams = {};
    const existingNumbers = Object.keys(allTeams).map(id => parseInt(id.replace('team', ''), 10)).filter(n => !isNaN(n));
    const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
    const newId = `team${String(maxNumber + 1).padStart(2, '0')}`;

    try {
        await teamManager.createTeam(newId, { name: 'New Team', captainId: null });
        showMessage(`Team ${newId} created.`, false);
    } catch (err) {
        showMessage(`Error creating team: ${err.message}`, true);
    }
}

async function deleteTeam(teamId) {
    try {
        await teamManager.deleteTeam(teamId);
    } catch (err) {
        showMessage(`Error deleting team: ${err.message}`, true);
    }
}

function toggleTeams() {
    const form = document.getElementById('teams-form');
    const isHidden = form.style.display === 'none';
    form.style.display = isHidden ? '' : 'none';
    document.getElementById('toggle-teams-btn').textContent = isHidden ? '-' : '+';
}