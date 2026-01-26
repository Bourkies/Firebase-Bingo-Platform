import '../components/Navbar.js';
import { BingoTile } from '../components/BingoTile.js';
import { initAuth } from '../core/auth.js';
import { authStore } from '../stores/authStore.js';
import { teamsStore } from '../stores/teamsStore.js';
import { tilesStore } from '../stores/tilesStore.js';
import { submissionsStore } from '../stores/submissionsStore.js';
import { configStore } from '../stores/configStore.js';
import { showMessage, showGlobalLoader, hideGlobalLoader } from '../core/utils.js';
import * as WebMMuxer from 'webm-muxer';
import * as htmlToImage from 'html-to-image';

let timeline = [];
let isPlaying = false;
let abortController = null;
let cachedEventCount = 0; // NEW: Store count for size estimation

// Virtual resolution for the board (matches other pages)
const VIRTUAL_WIDTH = 3000;

// --- NEW: Light DOM Tile for Capture ---
// html-to-image cannot capture Shadow DOM content. We create a subclass that renders to Light DOM.
class BingoTileLight extends BingoTile {
    createRenderRoot() {
        return this; // Render into the main DOM, not a Shadow Root
    }
}
customElements.define('bingo-tile-light', BingoTileLight);

// Inject styles for the light-dom tile (since they won't be encapsulated anymore)
const styleString = BingoTile.styles.cssText || BingoTile.styles.toString();
const styleEl = document.createElement('style');
// Replace :host with the tag name to apply styles globally to these elements
styleEl.textContent = styleString.replace(/:host/g, 'bingo-tile-light');
document.head.appendChild(styleEl);

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    
    // Subscribe to stores
    authStore.subscribe(checkAdmin);
    teamsStore.subscribe(populateTeams);
    submissionsStore.subscribe(() => { refreshTimelineCount(); }); // Subscribe to trigger data load
    
    // Event Listeners
    document.getElementById('preview-btn').addEventListener('click', () => runSequence(false));
    document.getElementById('record-btn').addEventListener('click', () => runSequence(true));
    document.getElementById('thumbnail-btn').addEventListener('click', downloadThumbnail);
    document.getElementById('batch-btn').addEventListener('click', batchExport);
    
    // Settings Change Listeners (for caching and updates)
    const settingsInputs = ['gif-width', 'total-duration', 'end-delay', 'simple-mode', 'bg-color-picker', 'bg-transparent', 'start-date', 'end-date', 'team-selector', 'render-mode', 'overlay-position', 'overlay-size', 'export-format', 'loop-anim', 'show-overlay'];
    settingsInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', saveSettings);
        if (el) el.addEventListener('change', refreshTimelineCount); // Re-calc events on change
    });
    
    // Real-time background updates
    document.getElementById('bg-color-picker').addEventListener('input', updateBackground);
    document.getElementById('bg-transparent').addEventListener('change', updateBackground);

    document.getElementById('gif-width').addEventListener('input', () => {
        updateBoardScale();
        updateSizeEstimate();
    });
    document.getElementById('total-duration').addEventListener('input', () => {
        updateSizeEstimate();
    });
    document.getElementById('end-delay').addEventListener('input', () => {
        updateSizeEstimate();
    });
    document.getElementById('overlay-size').addEventListener('input', updateOverlayStyle);
    document.getElementById('overlay-position').addEventListener('change', updateOverlayStyle);
    document.getElementById('show-overlay').addEventListener('change', updateOverlayStyle);

    document.getElementById('render-mode').addEventListener('change', (e) => {
        updateTimingControls(e.target.value);
        saveSettings();
    });
    
    loadSettings();

    // Initial Setup
    if (!document.getElementById('start-date').value) {
        const now = new Date();
        document.getElementById('start-date').value = getLocalISOString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0));
        document.getElementById('end-date').value = getLocalISOString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59));
    }
    
    // Wait for data then render initial board
    setTimeout(() => {
        renderInitialBoard();
        updateTimingControls(document.getElementById('render-mode').value);
        refreshTimelineCount();
    }, 1000);
});

function updateTimingControls(mode) {
    const label = document.getElementById('timing-label');
    const input = document.getElementById('total-duration');
    if (mode === 'events') {
        label.textContent = 'Speed (Frames Per Second)';
        input.value = input.value > 60 ? 10 : input.value; // Reset if weird
    } else {
        label.textContent = 'Total Duration (Seconds)';
    }
}

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('gif_gen_settings') || '{}');
    if (settings.width) document.getElementById('gif-width').value = settings.width;
    if (settings.duration) document.getElementById('total-duration').value = settings.duration;
    if (settings.endDelay) document.getElementById('end-delay').value = settings.endDelay;
    if (settings.simpleMode !== undefined) document.getElementById('simple-mode').checked = settings.simpleMode;
    if (settings.bgColor) document.getElementById('bg-color-picker').value = settings.bgColor;
    if (settings.bgTransparent !== undefined) document.getElementById('bg-transparent').checked = settings.bgTransparent;
    if (settings.startDate) document.getElementById('start-date').value = settings.startDate;
    if (settings.endDate) document.getElementById('end-date').value = settings.endDate;
    if (settings.teamId) {
        // We store the team ID, but we need to wait for teams to populate to select it.
        // This is handled in populateTeams.
        document.getElementById('team-selector').dataset.savedTeamId = settings.teamId;
    }
    if (settings.renderMode) {
        document.getElementById('render-mode').value = settings.renderMode;
        updateTimingControls(settings.renderMode);
    }
    if (settings.overlayPosition) document.getElementById('overlay-position').value = settings.overlayPosition;
    if (settings.overlaySize) document.getElementById('overlay-size').value = settings.overlaySize;
    if (settings.exportFormat) document.getElementById('export-format').value = settings.exportFormat;
    if (settings.showOverlay !== undefined) document.getElementById('show-overlay').checked = settings.showOverlay;
    
    updateOverlayStyle();
}

function saveSettings() {
    const settings = {
        width: document.getElementById('gif-width').value,
        duration: document.getElementById('total-duration').value,
        endDelay: document.getElementById('end-delay').value,
        simpleMode: document.getElementById('simple-mode').checked,
        bgColor: document.getElementById('bg-color-picker').value,
        bgTransparent: document.getElementById('bg-transparent').checked,
        startDate: document.getElementById('start-date').value,
        endDate: document.getElementById('end-date').value,
        teamId: document.getElementById('team-selector').value,
        renderMode: document.getElementById('render-mode').value,
        overlayPosition: document.getElementById('overlay-position').value,
        overlaySize: document.getElementById('overlay-size').value,
        exportFormat: document.getElementById('export-format').value,
        showOverlay: document.getElementById('show-overlay').checked
        // loop-anim is not critical to save, but we could.
    };
    localStorage.setItem('gif_gen_settings', JSON.stringify(settings));
    updateSizeEstimate();
}

function getLocalISOString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function checkAdmin(state) {
    const mainContent = document.getElementById('main-content');
    const accessDenied = document.getElementById('access-denied');
    
    if (!state.authChecked) return; // Wait for auth check to complete

    if (state.isAdmin) {
        if (mainContent) mainContent.style.display = 'flex';
        if (accessDenied) accessDenied.style.display = 'none';
    } else {
        if (mainContent) mainContent.style.display = 'none';
        if (accessDenied) accessDenied.style.display = 'block';
    }
}

function populateTeams(teams) {
    const selector = document.getElementById('team-selector');
    if (!selector || selector.options.length > 1) return; // Safety check + Already populated
    
    selector.innerHTML = '';
    Object.entries(teams).sort((a, b) => a[1].name.localeCompare(b[1].name)).forEach(([id, team]) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = team.name;
        selector.appendChild(opt);
    });

    // Restore saved selection if available
    const savedTeamId = selector.dataset.savedTeamId;
    if (savedTeamId && teams[savedTeamId]) {
        selector.value = savedTeamId;
    }
    refreshTimelineCount();
}

async function renderInitialBoard() {
    const { config, styles } = configStore.get();
    const tiles = tilesStore.get();
    
    if (!config.pageTitle || tiles.length === 0) {
        setTimeout(renderInitialBoard, 500); // Retry if stores not ready
        return;
    }

    const captureTarget = document.getElementById('capture-target');
    if (!captureTarget) return; // Safety check

    captureTarget.style.width = `${VIRTUAL_WIDTH}px`;
    
    // Set Aspect Ratio based on image
    if (config.boardImageUrl) {
        await new Promise((resolve) => {
            const img = new Image();
            img.src = config.boardImageUrl;
            img.onload = () => {
                const aspect = img.naturalHeight / img.naturalWidth;
                captureTarget.style.height = `${VIRTUAL_WIDTH * aspect}px`;
                captureTarget.style.backgroundImage = `url('${config.boardImageUrl}')`;
                captureTarget.style.backgroundSize = '100% 100%';
                updateBoardScale();
                updateSizeEstimate();
                resolve();
            };
            img.onerror = () => {
                // Fallback to square if image fails
                captureTarget.style.height = `${VIRTUAL_WIDTH}px`;
                resolve();
            };
        });
    } else {
        captureTarget.style.height = `${VIRTUAL_WIDTH}px`;
    }

    // Render Tiles (Empty State)
    // Remove existing tiles but keep overlay
    const overlay = captureTarget.querySelector('.overlay-info');
    captureTarget.innerHTML = '';
    captureTarget.appendChild(overlay);

    tiles.forEach(tile => {
        const tileEl = document.createElement('bingo-tile-light');
        tileEl.tile = tile;
        tileEl.status = 'Unlocked'; // Default start state
        tileEl.config = config;
        tileEl.allStyles = styles;
        tileEl.id = `tile-${tile.id}`; // For easy access later
        captureTarget.appendChild(tileEl);
    });

    updateBoardScale();
    updateBackground(); // Ensure background is correct on init
}

function updateBoardScale() {
    const targetWidth = parseInt(document.getElementById('gif-width').value) || 800;
    const container = document.getElementById('preview-container');
    const target = document.getElementById('capture-target');
    
    // The board is rendered at VIRTUAL_WIDTH (3000px).
    // We scale the container to fit the screen visually, but the capture logic uses the internal resolution
    // For previewing, we just use CSS transform on the target
    const internalWidth = VIRTUAL_WIDTH; // Use constant to ensure correct scale calculation even if layout shifts
    const targetHeight = target.offsetHeight;
    
    // Visual preview scaling (fit to container)
    const containerWidth = container.clientWidth;
    const visualScale = containerWidth / internalWidth;
    
    target.style.transform = `scale(${visualScale})`;
    container.style.height = `${targetHeight * visualScale}px`;
}

function updateBackground() {
    const isTransparent = document.getElementById('bg-transparent').checked;
    const bgColor = document.getElementById('bg-color-picker').value;
    const captureTarget = document.getElementById('capture-target');
    
    if (captureTarget) {
        captureTarget.style.backgroundColor = isTransparent ? 'transparent' : bgColor;
    }
}

function updateOverlayStyle() {
    const position = document.getElementById('overlay-position').value;
    const size = document.getElementById('overlay-size').value;
    const show = document.getElementById('show-overlay').checked;
    const overlay = document.querySelector('.overlay-info');
    
    if (!overlay) return;

    overlay.style.display = show ? 'block' : 'none';
    // Reset positioning
    overlay.style.top = 'auto';
    overlay.style.bottom = 'auto';
    overlay.style.left = 'auto';
    overlay.style.right = 'auto';
    overlay.style.transform = 'none';

    // Apply Position
    if (position.includes('top')) overlay.style.top = '20px';
    if (position.includes('bottom')) overlay.style.bottom = '20px';
    
    if (position.includes('left')) overlay.style.left = '20px';
    if (position.includes('right')) overlay.style.right = '20px';
    if (position.includes('center')) {
        overlay.style.left = '50%';
        overlay.style.transform = 'translateX(-50%)';
    }

    // Apply Size (rem relative to board font size)
    overlay.style.fontSize = `${size}rem`;
}

function updateSizeEstimate() {
    const width = parseInt(document.getElementById('gif-width').value) || 800;
    const duration = parseInt(document.getElementById('total-duration').value) || 10;
    const endDelay = parseFloat(document.getElementById('end-delay').value) || 0;
    const renderMode = document.getElementById('render-mode').value;
    const format = document.getElementById('export-format').value;
    const target = document.getElementById('capture-target');
    
    // Estimate aspect ratio
    const aspect = target.offsetWidth > 0 ? target.offsetHeight / target.offsetWidth : 0.75;
    const height = width * aspect;
    
    // Estimate frames (approx 10-20 fps depending on complexity, but we calculate delay dynamically)
    // Let's assume ~15 frames per second for a smooth GIF, or based on event count if we knew it.
    // A safer upper bound estimate: 10 frames per second of duration.
    let frames = (duration + endDelay) * 15; // Default for timelapse
    if (renderMode === 'events') {
        frames = cachedEventCount || 10;
    }
    
    if (format === 'webm') {
        // WebM is much smaller, roughly 0.05 bytes per pixel per frame for simple content
        const bytes = width * height * frames * 0.05;
        const mb = bytes / (1024 * 1024);
        document.getElementById('size-estimate').textContent = `Est. Size: ~${mb.toFixed(1)} MB (WebM Video)`;
    } else {
        // Rough GIF size formula: Width * Height * Frames * 0.5 bytes
        const bytes = width * height * frames * 0.5;
        const mb = bytes / (1024 * 1024);
        document.getElementById('size-estimate').textContent = `Est. Size: ~${mb.toFixed(1)} MB (GIF)`;
    }
}

async function refreshTimelineCount() {
    const events = await buildTimeline();
    cachedEventCount = events.length;
    updateSizeEstimate();
}

async function buildTimeline() {
    const teamId = document.getElementById('team-selector').value;
    const simpleMode = document.getElementById('simple-mode').checked;
    const startDateInput = document.getElementById('start-date').value;
    const endDateInput = document.getElementById('end-date').value;

    const startDate = startDateInput ? new Date(startDateInput) : new Date(0);
    const endDate = endDateInput ? new Date(endDateInput) : new Date();
    // Note: datetime-local input gives specific time, so we don't force end of day anymore unless user selected it.

    const allSubmissions = submissionsStore.get();
    const teamSubmissions = allSubmissions.filter(s => s.Team === teamId && !s.IsArchived);

    let events = [];

    // 1. Initial State (Start Date)
    events.push({
        time: startDate.getTime(),
        dateStr: formatDateForOverlay(startDate),
        type: 'init',
        changes: []
    });

    // 2. Process Submissions
    teamSubmissions.forEach(sub => {
        const tileId = sub.id;
        
        // If simple mode, we only care about the final completion time (or verification time)
        if (simpleMode) {
            // Use CompletionTimestamp if available, else Timestamp
            const ts = sub.CompletionTimestamp || sub.Timestamp;
            if (ts) {
                let status = 'Submitted';
                if (sub.AdminVerified) status = 'Verified';
                else if (sub.IsComplete) status = 'Submitted';
                
                // Only add if it falls in range
                if (ts.getTime() >= startDate.getTime() && ts.getTime() <= endDate.getTime()) {
                    events.push({
                        time: ts.getTime(),
                        dateStr: formatDateForOverlay(ts),
                        type: 'update',
                        tileId: tileId,
                        status: status
                    });
                }
            }
        } else {
            // Full History Mode
            // We reconstruct from the history array
            if (sub.history && sub.history.length > 0) {
                sub.history.forEach(h => {
                    if (!h.timestamp) return;
                    const t = h.timestamp.getTime();
                    if (t < startDate.getTime() || t > endDate.getTime()) return;

                    // Determine status from changes
                    let newStatus = null;
                    
                    // Heuristics for status based on history changes
                    const changes = h.changes || [];
                    const changeMap = {};
                    changes.forEach(c => changeMap[c.field] = c.to);

                    if (changeMap.hasOwnProperty('AdminVerified') && changeMap.AdminVerified === true) newStatus = 'Verified';
                    else if (changeMap.hasOwnProperty('RequiresAction') && changeMap.RequiresAction === true) newStatus = 'Requires Action';
                    else if (changeMap.hasOwnProperty('IsComplete')) {
                        newStatus = changeMap.IsComplete ? 'Submitted' : 'Partially Complete';
                    }
                    // If just created (no changes array or 'Create' action)
                    else if (h.action && h.action.includes('Create')) {
                        newStatus = sub.IsComplete ? 'Submitted' : 'Partially Complete';
                    }

                    if (newStatus) {
                        events.push({
                            time: t,
                            dateStr: formatDateForOverlay(h.timestamp),
                            type: 'update',
                            tileId: tileId,
                            status: newStatus
                        });
                    }
                });
            } else {
                // Fallback for legacy submissions without history
                const ts = sub.Timestamp;
                if (ts && ts.getTime() >= startDate.getTime() && ts.getTime() <= endDate.getTime()) {
                    events.push({
                        time: ts.getTime(),
                        dateStr: formatDateForOverlay(ts),
                        type: 'update',
                        tileId: tileId,
                        status: sub.AdminVerified ? 'Verified' : 'Submitted'
                    });
                }
            }
        }
    });

    // Sort events chronologically
    events.sort((a, b) => a.time - b.time);
    return events;
}

function formatDateForOverlay(date) {
    if (!date) return '';
    // Format: "Jan 26, 2026, 5 PM" (No minutes/seconds)
    return date.toLocaleString(undefined, { 
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', hour12: true 
    });
}

async function runSequence(isRecording, silent = false) {
    if (isPlaying) return false;
    isPlaying = true;
    
    const statusText = document.getElementById('status-text');
    const progressBar = document.getElementById('progress-bar');
    const progressContainer = document.getElementById('progress-bar-container');
    const teamName = document.getElementById('team-selector').options[document.getElementById('team-selector').selectedIndex].text;
    const overlayTeam = document.getElementById('overlay-team');
    const overlayDate = document.getElementById('overlay-date');
    const timingValue = parseInt(document.getElementById('total-duration').value) || 10;
    const endDelay = parseFloat(document.getElementById('end-delay').value) || 0;
    const renderMode = document.getElementById('render-mode').value;
    const targetWidth = parseInt(document.getElementById('gif-width').value) || 800;
    const exportFormat = document.getElementById('export-format').value;
    const loopAnim = document.getElementById('loop-anim').checked;
    
    let currentTimestamp = 0;

    // Calculate scale factor for html2canvas
    // VIRTUAL_WIDTH is 3000. If target is 800, scale is 800/3000.
    const scale = targetWidth / VIRTUAL_WIDTH;

    overlayTeam.textContent = teamName;
    progressContainer.style.display = 'block';
    statusText.textContent = "Building timeline...";

    // Reset Board
    await renderInitialBoard();
    
    const events = await buildTimeline();
    if (events.length === 0) {
        if (!silent) alert("No events found in the selected date range.");
        else console.log(`[Batch] Skipping ${teamName}: No events found.`);
        isPlaying = false;
        return false;
    }

    // Calculate delay per frame based on total duration
    // Ensure a minimum delay of 20ms (50fps) to prevent browser choking
    // For timelapse, we target 15fps by default (66ms) if not specified, but here we use timingValue
    let delayMs = 66; 
    if (renderMode === 'events') {
        delayMs = 1000 / timingValue; // timingValue is FPS
    }

    // Background Settings
    const isTransparent = document.getElementById('bg-transparent').checked;
    const bgColor = document.getElementById('bg-color-picker').value;

    // Determine capture background color
    // For GIF transparency, we use a "Magic Pink" key color to avoid making black text transparent.
    // For WebM, we use real alpha (rgba(0,0,0,0)).
    let captureBg = bgColor;
    if (isTransparent) {
        if (exportFormat === 'gif') captureBg = '#fe00fe'; // Magic Pink
        if (exportFormat === 'webm') captureBg = null; // Use null to let html-to-image default to transparent
    }

    // Setup GIF
    // Setup Encoders
    let gif = null;
    let muxer = null, videoEncoder = null;
    if (isRecording && exportFormat === 'gif') {
        statusText.textContent = "Initializing GIF encoder...";
        // Fetch worker code to create blob (avoids external file issues)
        const workerResponse = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
        const workerBlob = await workerResponse.blob();
        const workerUrl = URL.createObjectURL(workerBlob);

        gif = new GIF({
            workers: 2,
            quality: 10,
            workerScript: workerUrl,
            width: targetWidth,
            height: document.getElementById('capture-target').offsetHeight * scale,
            transparent: isTransparent ? 0xfe00fe : null, // Tell GIF encoder to treat Magic Pink as transparent
            background: isTransparent ? null : bgColor,
            repeat: loopAnim ? 0 : -1 // 0 = loop forever, -1 = no loop
        });
        
        gif.on('finished', (blob) => {
            statusText.textContent = "Download starting...";
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${teamName.replace(/\s+/g, '_')}_bingo_${new Date().toISOString().slice(0,10)}.gif`;
            a.click();
            isPlaying = false;
            statusText.textContent = "Done!";
            progressContainer.style.display = 'none';
        });
    }

    if (isRecording && exportFormat === 'webm') {
        if (!window.VideoEncoder) {
            alert("Your browser does not support VideoEncoder. Please use Chrome, Edge, or a newer browser.");
            isPlaying = false;
            return;
        }
        statusText.textContent = "Initializing WebM encoder...";
        
        // Calculate dimensions (must be even numbers for some codecs)
        const videoWidth = targetWidth % 2 === 0 ? targetWidth : targetWidth - 1;
        const videoHeight = Math.floor(document.getElementById('capture-target').offsetHeight * scale) % 2 === 0 
            ? Math.floor(document.getElementById('capture-target').offsetHeight * scale) 
            : Math.floor(document.getElementById('capture-target').offsetHeight * scale) - 1;

        muxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: { 
                codec: 'V_VP9', 
                width: videoWidth, 
                height: videoHeight, 
                frameRate: 30,
                alpha: isTransparent // NEW: Tell muxer to include alpha channel
            } 
        });

        videoEncoder = new VideoEncoder({
            output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
            error: e => { console.error(e); alert("Video encoding error: " + e.message); }
        });
        videoEncoder.configure({ 
            codec: 'vp09.00.10.08', 
            width: videoWidth, 
            height: videoHeight, 
            bitrate: 2e6,
            alpha: 'keep' // NEW: Tell encoder to preserve transparency (defaults to discard)
        }); 
    }

    // Disable transitions for clean capture
    const style = document.createElement('style');
    style.id = 'disable-transitions';
    style.innerHTML = `* { transition: none !important; animation: none !important; }`;
    document.head.appendChild(style);

    // Initialize Tile States Map for Locking Logic
    const { config } = configStore.get();
    const tiles = tilesStore.get();
    const currentTileStates = {};
    tiles.forEach(t => {
        currentTileStates[t.id] = 'Unlocked'; // Default start
    });
    // Initial lock check
    checkLocks(tiles, currentTileStates, config);

    // Helper to capture current DOM state to canvas
    const getBoardCanvas = async () => {
        // Wait for DOM update (Lit element render)
        // Reduced wait time since transitions are disabled
        await new Promise(r => setTimeout(r, 20)); 

        if (isRecording) {
            try {
                const node = document.getElementById('capture-target');
                
                // 1. Capture at full resolution (VIRTUAL_WIDTH = 3000px)
                // html-to-image captures the element exactly as it renders in the DOM
                const fullResCanvas = await htmlToImage.toCanvas(node, {
                    width: VIRTUAL_WIDTH,
                    height: node.offsetHeight,
                    style: {
                        transform: 'none' // Ignore the preview scaling transform
                    },
                    backgroundColor: captureBg,
                    skipAutoScale: true, // Prevent internal scaling logic
                    cacheBust: true, // Helps with CORS images sometimes
                    skipFonts: true, // Prevents CORS errors with external stylesheets/fonts
                });

                // 2. Downscale to target resolution
                // We create a new canvas of the desired output size and draw the full res image onto it.
                const outputCanvas = document.createElement('canvas');
                outputCanvas.width = targetWidth;
                // Calculate height based on aspect ratio of the captured node
                const aspect = node.offsetHeight / node.offsetWidth;
                outputCanvas.height = targetWidth * aspect;

                const ctx = outputCanvas.getContext('2d');
                // High quality scaling
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(fullResCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

                return outputCanvas;
            } catch (e) {
                console.error("Frame capture error:", e);
                return null;
            }
        }
        return null;
    };

    // Helper to encode a frame
    const encodeFrame = (canvas, delay, timestampMs) => {
        if (!canvas) return;
        if (exportFormat === 'gif') {
            gif.addFrame(canvas, { delay: delay });
        } else if (exportFormat === 'webm') {
            const frame = new VideoFrame(canvas, { timestamp: timestampMs * 1000 }); // Microseconds
            videoEncoder.encode(frame);
            frame.close();
        }
    };

    // Helper to apply event
    const applyEvent = (event) => {
        if (event.type === 'update') {
            const tileEl = document.getElementById(`tile-${event.tileId}`);
            currentTileStates[event.tileId] = event.status;
            if (tileEl) {
                tileEl.status = event.status;
                tileEl.requestUpdate(); 
            }
            checkLocks(tiles, currentTileStates, config);
        }
    };

    if (renderMode === 'events') {
        // --- EVENT SEQUENCE MODE ---
        for (let i = 0; i < events.length; i++) {
            const event = events[i];
            
            // Update UI
            statusText.textContent = `Frame ${i + 1}/${events.length}: ${event.dateStr}`;
            progressBar.style.width = `${((i + 1) / events.length) * 100}%`;
            overlayDate.textContent = event.dateStr;

            applyEvent(event);
            const canvas = await getBoardCanvas();
            if (isRecording) {
                encodeFrame(canvas, delayMs, currentTimestamp);
            } else {
                await new Promise(r => setTimeout(r, delayMs));
            }
            currentTimestamp += delayMs;
        }
    } else {
        // --- TIME LAPSE MODE ---
        const fps = 15; // Fixed FPS for timelapse to ensure smoothness
        const totalFrames = timingValue * fps; // timingValue is Duration in seconds
        const startTime = events[0].time;
        const endTime = events[events.length - 1].time;
        const timeRange = endTime - startTime;
        const timeStep = timeRange / totalFrames;
        
        let eventIdx = 0;
        
        for (let frame = 0; frame <= totalFrames; frame++) {
            const currentTime = startTime + (frame * timeStep);
            
            // Apply all events that have happened up to this point in time
            let hasUpdates = false;
            while(eventIdx < events.length && events[eventIdx].time <= currentTime) {
                applyEvent(events[eventIdx]);
                eventIdx++;
                hasUpdates = true;
            }
            
            // Update UI
            const dateStr = formatDateForOverlay(new Date(currentTime));
            statusText.textContent = `Frame ${frame + 1}/${totalFrames}: ${dateStr}`;
            progressBar.style.width = `${((frame + 1) / totalFrames) * 100}%`;
            overlayDate.textContent = dateStr;

            const canvas = await getBoardCanvas();
            if (isRecording) {
                encodeFrame(canvas, 1000 / fps, currentTimestamp);
            } else {
                await new Promise(r => setTimeout(r, 1000 / fps));
            }
            currentTimestamp += (1000 / fps);
        }
    }

    // --- NEW: Add End Hold ---
    if (isRecording && endDelay > 0) {
        statusText.textContent = "Adding final hold...";
        // Capture the final state once
        const finalCanvas = await getBoardCanvas();
        
        if (exportFormat === 'gif') {
            // For GIF, we can just add one frame with a long delay
            encodeFrame(finalCanvas, endDelay * 1000, currentTimestamp);
        } else {
            // For WebM, we must generate frames to fill the time to ensure smooth playback/seeking
            const holdFps = 30;
            const holdFrames = Math.ceil(endDelay * holdFps);
            const step = 1000 / holdFps;
            
            for (let i = 0; i < holdFrames; i++) {
                encodeFrame(finalCanvas, step, currentTimestamp);
                currentTimestamp += step;
                // Update progress bar slightly to show activity
                if (i % 10 === 0) statusText.textContent = `Adding final hold... ${(i/holdFrames*100).toFixed(0)}%`;
            }
        }
    }

    // Re-enable transitions
    if (style.parentNode) style.parentNode.removeChild(style);

    if (isRecording) {
        if (exportFormat === 'gif') {
            statusText.textContent = "Rendering GIF (this may take a moment)...";
            // Wrap GIF rendering in a promise to await completion
            await new Promise(resolve => {
                gif.on('finished', (blob) => {
                    statusText.textContent = "Download starting...";
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${teamName.replace(/\s+/g, '_')}_bingo_${new Date().toISOString().slice(0,10)}.gif`;
                    a.click();
                    isPlaying = false;
                    statusText.textContent = "Done!";
                    progressContainer.style.display = 'none';
                    resolve();
                });
                gif.render();
            });
        } else {
            statusText.textContent = "Finalizing Video...";
            await videoEncoder.flush();
            muxer.finalize();
            const buffer = muxer.target.buffer;
            const blob = new Blob([buffer], { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${teamName.replace(/\s+/g, '_')}_bingo_${new Date().toISOString().slice(0,10)}.webm`;
            a.click();
            isPlaying = false;
            statusText.textContent = "Done!";
            progressContainer.style.display = 'none';
        }
    } else {
        isPlaying = false;
        statusText.textContent = "Preview Finished.";
        setTimeout(() => progressContainer.style.display = 'none', 2000);
    }
    return true;
}

async function batchExport() {
    const selector = document.getElementById('team-selector');
    // Filter out disabled options (like "Select a Team...")
    const options = Array.from(selector.options).filter(o => !o.disabled && o.value);
    const statusText = document.getElementById('status-text');
    const batchBtn = document.getElementById('batch-btn');
    
    if (isPlaying) {
        alert("An animation is currently running. Please wait for it to finish.");
        return;
    }

    if (options.length === 0) {
        alert("No teams available to export.");
        return;
    }

    if (!confirm(`This will generate and download files for ${options.length} teams. This process may take several minutes. Please allow the browser to download multiple files if prompted.\n\nContinue?`)) return;

    batchBtn.disabled = true;
    const originalTeam = selector.value;

    for (let i = 0; i < options.length; i++) {
        const opt = options[i];
        selector.value = opt.value;
        
        // Update UI
        statusText.textContent = `Batching (${i + 1}/${options.length}): ${opt.text}`;
        
        // 1. Generate Video/GIF (Awaits completion)
        // Pass silent=true to avoid alerts for empty teams
        const success = await runSequence(true, true);
        
        // 2. Generate Thumbnail (Only if events were found)
        if (success) await downloadThumbnail();
        
        // Small pause to ensure browser handles downloads gracefully
        await new Promise(r => setTimeout(r, 1000));
    }

    selector.value = originalTeam;
    await renderInitialBoard(); // Restore view
    statusText.textContent = "Batch Export Complete!";
    batchBtn.disabled = false;
}

async function downloadThumbnail() {
    const statusText = document.getElementById('status-text');
    const teamName = document.getElementById('team-selector').options[document.getElementById('team-selector').selectedIndex].text;
    const targetWidth = parseInt(document.getElementById('gif-width').value) || 800;
    const isTransparent = document.getElementById('bg-transparent').checked;
    const bgColor = document.getElementById('bg-color-picker').value;
    
    statusText.textContent = "Capturing thumbnail...";

    try {
        const node = document.getElementById('capture-target');
        
        // 1. Capture at full resolution
        const fullResCanvas = await htmlToImage.toCanvas(node, {
            width: VIRTUAL_WIDTH,
            height: node.offsetHeight,
            style: { transform: 'none' },
            backgroundColor: isTransparent ? null : bgColor,
            skipAutoScale: true,
            cacheBust: true,
            skipFonts: true,
        });

        // 2. Downscale to target resolution
        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = targetWidth;
        const aspect = node.offsetHeight / node.offsetWidth;
        outputCanvas.height = targetWidth * aspect;

        const ctx = outputCanvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(fullResCanvas, 0, 0, outputCanvas.width, outputCanvas.height);

        // 3. Download
        const blob = await new Promise(resolve => outputCanvas.toBlob(resolve, 'image/png'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${teamName.replace(/\s+/g, '_')}_thumbnail_${new Date().toISOString().slice(0,10)}.png`;
        a.click();
        
        statusText.textContent = "Thumbnail downloaded!";
        setTimeout(() => statusText.textContent = "Ready", 2000);
    } catch (e) {
        console.error("Thumbnail error:", e);
        statusText.textContent = "Error capturing thumbnail.";
    }
}

function checkLocks(allTiles, currentStatuses, config) {
    const unlockOnVerifiedOnly = config.unlockOnVerifiedOnly === true;
    
    // 1. Identify completed tiles based on current statuses
    const completedTileIds = new Set();
    allTiles.forEach(tile => {
        const status = currentStatuses[tile.id];
        if (status === 'Verified') {
            completedTileIds.add(tile.id);
        } else if (status === 'Submitted' && !unlockOnVerifiedOnly) {
            completedTileIds.add(tile.id);
        }
    });

    // 2. Check each tile
    allTiles.forEach(tile => {
        const currentStatus = currentStatuses[tile.id] || 'Unlocked';
        // Only update if it's Locked or Unlocked. Don't touch if it has a submission status.
        if (currentStatus === 'Locked' || currentStatus === 'Unlocked') {
            const isUnlocked = isTileUnlocked(tile, completedTileIds);
            const newStatus = isUnlocked ? 'Unlocked' : 'Locked';
            
            if (currentStatus !== newStatus) {
                currentStatuses[tile.id] = newStatus;
                // Update DOM
                const tileEl = document.getElementById(`tile-${tile.id}`);
                if (tileEl) {
                    tileEl.status = newStatus;
                    tileEl.requestUpdate();
                }
            }
        }
    });
}

function isTileUnlocked(tile, completedSet) {
    if (!tile.Prerequisites) return true;
    let prereqs = [];
    try {
        if (tile.Prerequisites.trim().startsWith('[')) {
            prereqs = JSON.parse(tile.Prerequisites);
        } else {
            prereqs = tile.Prerequisites.split(',').map(s => s.trim()).filter(s => s);
            if (prereqs.length > 0) prereqs = [prereqs];
        }
    } catch (e) { return true; }

    if (!Array.isArray(prereqs) || prereqs.length === 0) return true;
    return prereqs.some(group => group.every(reqId => completedSet.has(reqId)));
}