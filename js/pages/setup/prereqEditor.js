/* prereqEditor.js */

let tilesData = [];
let lastSelectedTileIndex = null;

export function initializePrereqEditor(mainController) {
    console.log("prereqEditor: Initializing...");
}

export function updatePrereqEditorData(newTilesData, newLastSelectedTileIndex) {
    tilesData = newTilesData;
    lastSelectedTileIndex = newLastSelectedTileIndex;
}

export function populatePrereqUI(prereqString, mainController) {
    console.log("prereqEditor: populatePrereqUI called with:", prereqString);
    const prereqUiContainer = document.getElementById('prereq-ui-container');
    if (!prereqUiContainer) return;
    prereqUiContainer.innerHTML = '';

    let orGroups = [];
    let isNewFormat = false;

    if (prereqString && prereqString.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(prereqString);
            if (Array.isArray(parsed) && (parsed.length === 0 || Array.isArray(parsed[0]))) {
                orGroups = parsed;
                isNewFormat = true;
            }
        } catch (e) { /* Not valid JSON, treat as old format */ }
    }

    if (isNewFormat) {
        if (orGroups.length === 0) addPrereqOrGroup([], mainController);
        else orGroups.forEach(andGroup => addPrereqOrGroup(andGroup, mainController));
    } else {
        addPrereqOrGroup(prereqString ? prereqString.split(',') : [], mainController);
    }
}

function addPrereqOrGroup(andConditions = [], mainController) {
    console.log("prereqEditor: addPrereqOrGroup called with:", andConditions);
    const prereqUiContainer = document.getElementById('prereq-ui-container');
    if (!prereqUiContainer) return;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'prereq-or-group';

    const andInput = document.createElement('textarea');
    andInput.className = 'prereq-and-input';
    andInput.placeholder = 'Tile IDs to AND (e.g. A1, A2)';
    andInput.value = andConditions.map(s => String(s).trim()).filter(Boolean).join(', ');
    // REFACTOR: Use 'change' event for more deliberate saves.
    andInput.onchange = () => { console.log("prereqEditor: Input changed, updating JSON."); updatePrereqJson(mainController); };

    const validationSpan = document.createElement('span');
    validationSpan.className = 'prereq-validation-msg';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '−';
    removeBtn.className = 'remove-override-btn';
    removeBtn.style.marginTop = 0;
    removeBtn.onclick = () => {
        console.log("prereqEditor: Removing OR group.");
        groupDiv.remove();
        updatePrereqJson(mainController);
    };

    // The "OR" text is now removed for a cleaner, wrapping layout.
    prereqUiContainer.append(groupDiv);
    groupDiv.append(andInput, validationSpan, removeBtn);
}

function updatePrereqJson(mainController) {
    const prereqUiContainer = document.getElementById('prereq-ui-container'); // FIX: Added semicolon
    if (!prereqUiContainer) return;

    const validIds = new Set(tilesData.map(t => t.id));

    const orGroups = Array.from(prereqUiContainer.querySelectorAll('.prereq-or-group')).map(groupDiv => {
        const input = groupDiv.querySelector('.prereq-and-input');
        const validationSpan = groupDiv.querySelector('.prereq-validation-msg');
        const ids = input.value.split(',').map(s => s.trim()).filter(Boolean);

        const invalidIds = ids.filter(id => !validIds.has(id));
        if (invalidIds.length > 0) {
            validationSpan.textContent = `Invalid IDs: ${invalidIds.join(', ')}`;
            input.style.borderColor = '#e57373';
        } else {
            validationSpan.textContent = '';
            input.style.borderColor = '';
        }

        return ids;
    }).filter(group => group.length > 0);

    let prereqValue = '';
    if (orGroups.length === 1) {
        prereqValue = orGroups[0].join(',');
    } else if (orGroups.length > 1) {
        prereqValue = JSON.stringify(orGroups);
    }
    if (lastSelectedTileIndex !== null && tilesData[lastSelectedTileIndex] && mainController) {
        // FIX: Pass mainController as the third argument to match the function signature in setupController.
        mainController.saveTile(tilesData[lastSelectedTileIndex].docId, { 'Prerequisites': prereqValue }, mainController); 
    }
    mainController.renderTiles(); // Re-render tiles which will in turn call renderPrereqLines
}

function parsePrerequisites(prereqString) {
    if (!prereqString || !prereqString.trim()) return [];
    const trimmed = prereqString.trim();
    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed) && (parsed.length === 0 || Array.isArray(parsed[0]))) return parsed;
        } catch (e) { /* fall through */ }
    }
    return [trimmed.split(',').map(s => s.trim()).filter(Boolean)];
}

export function renderPrereqLines(prereqVisMode) {
    // console.log("prereqEditor: renderPrereqLines called."); // This can be noisy, commented out for now.
    const prereqLinesSvg = document.getElementById('prereq-lines-svg');
    if (!prereqLinesSvg) return;
    prereqLinesSvg.innerHTML = '';
    if (prereqVisMode === 'hide' || lastSelectedTileIndex === null || !tilesData) return;

    const destTileData = tilesData[lastSelectedTileIndex];
    if (!destTileData) return;

    const orGroups = parsePrerequisites(destTileData['Prerequisites']);
    if (orGroups.length === 0) return;

    const destCenter = {
        x: parseFloat(destTileData['Left (%)']) + parseFloat(destTileData['Width (%)']) / 2,
        y: parseFloat(destTileData['Top (%)']) + parseFloat(destTileData['Height (%)']) / 2
    };

    const totalGroups = orGroups.length;
    const baseStrokeWidth = 0.3;
    const strokeWidthIncrement = 0.4;
    const outlinePadding = 0.15;

    orGroups.forEach((andGroup, orIndex) => {
        const strokeWidth = baseStrokeWidth + (totalGroups - 1 - orIndex) * strokeWidthIncrement;
        const outlineWidth = strokeWidth + outlinePadding;
        const hue = (orIndex * 360) / totalGroups;
        const color = `hsl(${hue}, 85%, 55%)`;

        const outlinesFragment = document.createDocumentFragment();
        const fillsFragment = document.createDocumentFragment();

        andGroup.forEach(tileId => {
            const sourceTileData = tilesData.find(t => t.id === tileId);
            if (!sourceTileData) return;

            const sourceCenter = {
                x: parseFloat(sourceTileData['Left (%)']) + parseFloat(sourceTileData['Width (%)']) / 2,
                y: parseFloat(sourceTileData['Top (%)']) + parseFloat(sourceTileData['Height (%)']) / 2
            };

            const outlineLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            outlineLine.setAttribute('x1', `${sourceCenter.x}%`); outlineLine.setAttribute('y1', `${sourceCenter.y}%`);
            outlineLine.setAttribute('x2', `${destCenter.x}%`); outlineLine.setAttribute('y2', `${destCenter.y}%`);
            outlineLine.setAttribute('stroke', 'black');
            outlineLine.setAttribute('stroke-width', `${outlineWidth}%`);
            outlineLine.setAttribute('stroke-linecap', 'round');
            outlinesFragment.appendChild(outlineLine);

            const fillLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            fillLine.setAttribute('x1', `${sourceCenter.x}%`); fillLine.setAttribute('y1', `${sourceCenter.y}%`);
            fillLine.setAttribute('x2', `${destCenter.x}%`); fillLine.setAttribute('y2', `${destCenter.y}%`);
            fillLine.setAttribute('stroke', color);
            fillLine.setAttribute('stroke-width', `${strokeWidth}%`);
            fillLine.setAttribute('stroke-linecap', 'round');
            fillsFragment.appendChild(fillLine);
        });

        prereqLinesSvg.appendChild(outlinesFragment);
        prereqLinesSvg.appendChild(fillsFragment);
    });
}

export function createPrereqFieldset(mainController) {
    console.log("prereqEditor: createPrereqFieldset called.");
    const prereqFieldset = Object.assign(document.createElement('fieldset'), {
        className: 'overrides-fieldset',
        id: 'prereq-editor-container',
        style: 'grid-column: 1 / -1;',
    });

    const prereqLegend = document.createElement('legend');
    const legendText = Object.assign(document.createElement('span'), { textContent: 'Prerequisites (Advanced)' });
    const tooltip = Object.assign(document.createElement('span'), {
        className: 'tooltip-icon',
        textContent: '(?)',
        title: `Define conditions to unlock this tile.\n- Each box is an "AND" group (e.g., "A1, A2" means A1 AND A2 are required).\n- Add more boxes with the "+" button to create "OR" conditions (e.g., Box 1 OR Box 2).`
    });
    prereqLegend.append(legendText, tooltip);

    const prereqContent = Object.assign(document.createElement('div'), { className: 'fieldset-content' });
    const addGroupBtn = Object.assign(document.createElement('button'), {
        type: 'button',
        id: 'add-prereq-group-btn',
        textContent: '+ Add OR Group',
        title: 'Add a new "OR" condition group. Each box is an "AND" group.',
        onclick: () => { // Pass mainController to the functions
            addPrereqOrGroup([], mainController);
            updatePrereqJson(mainController);
        }
    });

    const prereqUiContainer = Object.assign(document.createElement('div'), { id: 'prereq-ui-container' });

    prereqContent.append(addGroupBtn, prereqUiContainer);
    prereqFieldset.append(prereqLegend, prereqContent);
    return prereqFieldset;
}