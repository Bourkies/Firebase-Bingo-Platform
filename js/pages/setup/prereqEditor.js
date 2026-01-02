/* prereqEditor.js */
// NEW: Import the tilesStore to read data directly.
import { tilesStore } from '../../stores/tilesStore.js';

let mainController;

export function initializePrereqEditor(controller) {
    console.log("[PrereqEditor] Initializing...");
    mainController = controller;
}

export function populatePrereqUI(prereqString, mainController, shadowRoot) {
    console.log("[PrereqEditor] populatePrereqUI called with:", prereqString);
    // FIX: Query within the provided shadowRoot, not the global document.
    const prereqUiContainer = shadowRoot.getElementById('prereq-ui-container');
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
        if (orGroups.length === 0) addPrereqOrGroup([], mainController, shadowRoot);
        else orGroups.forEach(andGroup => addPrereqOrGroup(andGroup, mainController, shadowRoot));
    } else {
        addPrereqOrGroup(prereqString ? prereqString.split(',') : [], mainController, shadowRoot);
    }
}

function addPrereqOrGroup(andConditions = [], mainController, shadowRoot) {
    console.log("[PrereqEditor] addPrereqOrGroup called with:", andConditions);
    // FIX: Query within the provided shadowRoot.
    const prereqUiContainer = shadowRoot.getElementById('prereq-ui-container');
    if (!prereqUiContainer) return;

    const groupDiv = document.createElement('div');
    groupDiv.className = 'prereq-or-group';

    const andInput = document.createElement('textarea');
    andInput.className = 'prereq-and-input';
    andInput.placeholder = 'Tile IDs to AND (e.g. A1, A2)';
    andInput.value = andConditions.map(s => String(s).trim()).filter(Boolean).join(', ');
    // REFACTOR: Use 'change' event for more deliberate saves.
    andInput.onchange = () => { console.log("[PrereqEditor] Input changed, updating JSON."); updatePrereqJson(mainController, shadowRoot); };

    const validationSpan = document.createElement('span');
    validationSpan.className = 'prereq-validation-msg';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '−';
    removeBtn.className = 'remove-override-btn';
    removeBtn.style.marginTop = 0;
    removeBtn.onclick = () => {
        console.log("[PrereqEditor] Removing OR group.");
        groupDiv.remove();
        updatePrereqJson(mainController, shadowRoot);
    };

    // The "OR" text is now removed for a cleaner, wrapping layout.
    prereqUiContainer.append(groupDiv);
    groupDiv.append(andInput, validationSpan, removeBtn);
}

function updatePrereqJson(mainController, shadowRoot) {
    // FIX: Query within the provided shadowRoot.
    const prereqUiContainer = shadowRoot.getElementById('prereq-ui-container');
    if (!prereqUiContainer) return;
    const tilesData = tilesStore.get();
    const lastSelectedTileIndex = mainController.lastSelectedTileIndex;

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
        // FIX: The saveTile function only takes two arguments.
        mainController.saveTile(tilesData[lastSelectedTileIndex].docId, { 'Prerequisites': prereqValue }); 
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
    console.log(`[PrereqEditor] renderPrereqLines called. Mode: ${prereqVisMode}`);
    const tilesData = tilesStore.get();
    const lastSelectedTileIndex = mainController.lastSelectedTileIndex;
    const prereqLinesSvg = document.getElementById('prereq-lines-svg');
    
    if (!prereqLinesSvg) {
        console.warn("[PrereqEditor] SVG element 'prereq-lines-svg' not found.");
        return;
    }
    
    prereqLinesSvg.innerHTML = '';
    
    if (prereqVisMode === 'hide') {
        console.log("[PrereqEditor] Mode is hidden, clearing lines.");
        return;
    }

    // Define arrow marker
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9'); 
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '3'); // Scale relative to stroke width
    marker.setAttribute('markerHeight', '3');
    marker.setAttribute('orient', 'auto');
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    path.setAttribute('fill', 'black');
    
    marker.appendChild(path);
    defs.appendChild(marker);
    prereqLinesSvg.appendChild(defs);

    // Helper function to draw lines for a single destination tile
    const drawLinesForTile = (destTileData) => {
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
                fillLine.setAttribute('marker-end', 'url(#arrowhead)'); // Add arrow
                fillsFragment.appendChild(fillLine);
            });

            prereqLinesSvg.appendChild(outlinesFragment);
            prereqLinesSvg.appendChild(fillsFragment);
        });
    };

    if (prereqVisMode === 'all') {
        tilesData.forEach(tile => drawLinesForTile(tile));
    } else if (prereqVisMode === 'selected') {
        if (lastSelectedTileIndex !== null && tilesData[lastSelectedTileIndex]) {
            drawLinesForTile(tilesData[lastSelectedTileIndex]);
        }
    }
}

export function createPrereqFieldset(mainController, shadowRoot) {
    console.log("[PrereqEditor] createPrereqFieldset called.");
    const prereqFieldset = Object.assign(document.createElement('fieldset'), {
        className: 'prereq-fieldset',
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
        onclick: () => { // Pass mainController and shadowRoot to the functions
            addPrereqOrGroup([], mainController, shadowRoot);
            updatePrereqJson(mainController, shadowRoot);
        }
    });

    const prereqUiContainer = Object.assign(document.createElement('div'), { id: 'prereq-ui-container' });

    prereqContent.append(addGroupBtn, prereqUiContainer);
    prereqFieldset.append(prereqLegend, prereqContent);
    return prereqFieldset;
}