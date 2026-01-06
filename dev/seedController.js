import { db, auth, fb } from '../js/core/firebase-config.js';
import { authStore } from '../js/stores/authStore.js';
// Import Firebase App and Auth directly to create a secondary instance
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, connectAuthEmulator, signInWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator, writeBatch, doc, collection, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const SEED_DEFINITIONS = [
    { suffix: 'Red' },
    { suffix: 'Blue' },
    { suffix: 'Green' },
    { suffix: 'Yellow' },
    { suffix: 'Purple' },
    { suffix: 'Orange' },
    { suffix: 'Cyan' },
    { suffix: 'Pink' },
    { suffix: 'Teal' },
    { suffix: 'Lime' },
    { suffix: 'Indigo' },
    { suffix: 'Brown' }
];

const REAL_EVIDENCE_LINKS = [
    'https://i.imgur.com/XqeWqgI.png',
    'https://i.imgur.com/aYQzzoQ.jpeg',
    'https://i.imgur.com/UezBVZ2.jpeg',
    'https://i.imgur.com/v7y90e7.jpeg'
];

// Helper to pause execution for a given number of milliseconds
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export function checkSafety() {
    // 1. Environment Check
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isLocal) {
        const confirmed = confirm("⚠️ PRODUCTION WARNING ⚠️\n\nYou are running this on a remote/production environment.\nThis will MODIFY and OVERWRITE data in your live database.\n\nAre you sure you want to proceed?");
        if (!confirmed) throw new Error("Operation cancelled by user.");
    }

    // 2. Admin Check
    const authState = authStore.get();
    if (!authState.isAdmin) {
        throw new Error("⛔ PERMISSION DENIED: You must be logged in as an Admin to perform seeding operations.");
    }
}

export async function getExistingTeams(skipSafety = false) {
    console.log("[SeedController] Fetching existing teams...");
    const snap = await fb.getDocs(fb.collection(db, 'teams'));
    return snap.docs.map(d => d.data());
}

// Helper to generate consistent seed user data for creation and deletion
function getSeedUserInfo(i) {
    let role = 'player';
    let isAdmin = false;
    let isEventMod = false;
    let isCaptain = false;
    let prettyRole = 'Player';

    if (i <= 2) {
        role = 'admin'; isAdmin = true; isEventMod = true;
        prettyRole = 'Admin';
    } else if (i <= 5) {
        role = 'mod'; isEventMod = true;
        prettyRole = 'Mod';
    } else {
        if (i >= 46) {
            role = 'player-mod-admin'; isAdmin = true; isEventMod = true;
            prettyRole = 'Player Mod Admin';
        } else if (i >= 41) {
            role = 'player-mod'; isEventMod = true;
            prettyRole = 'Player Mod';
        } else if (i % 10 === 0) {
            role = 'captain'; isCaptain = true;
            prettyRole = 'Captain';
        }
    }

    const username = `seed-${String(i).padStart(2, '0')}-${role}`;
    return { username, email: `${username}@fir-bingo-app.com`, role, isAdmin, isEventMod, isCaptain, prettyRole };
}

export async function seedTeams(log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }

    log("--- Seeding Teams ---");
    
    // 1. Get existing teams to determine next ID and avoid duplicate names
    const existingTeamsSnap = await fb.getDocs(fb.collection(db, 'teams'));
    const existingTeams = existingTeamsSnap.docs.map(d => ({ docId: d.id, ...d.data() }));
    
    // Find highest ID number (assuming format teamXX)
    let maxIdNum = 0;
    existingTeams.forEach(t => {
        const match = t.docId.match(/^team(\d+)$/);
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxIdNum) maxIdNum = num;
        }
    });

    const existingNames = new Set(existingTeams.map(t => t.name.toLowerCase()));
    const batch = fb.writeBatch(db);
    let addedCount = 0;
    
    for (const def of SEED_DEFINITIONS) {
        const teamName = `seed_${def.suffix}`;
        
        if (existingNames.has(teamName.toLowerCase())) {
            log(`Skipping ${teamName} (Name already exists)`);
            continue;
        }

        maxIdNum++;
        const newId = `team${String(maxIdNum).padStart(2, '0')}`;
        
        const teamData = {
            id: newId,
            name: teamName,
            captainId: null
        };

        const ref = fb.doc(db, 'teams', newId);
        batch.set(ref, teamData);
        log(`Prepared ${teamName} as ${newId}`);
        addedCount++;
    }

    if (addedCount > 0) {
        await batch.commit();
        log(`Successfully created ${addedCount} teams!`);
    } else {
        log("No new teams to create.");
    }
}

const toRestValue = (val) => {
    if (val === null) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
    return { stringValue: String(val) };
};

export async function seedUsers(log, selectedTeamIds = [], password = 'password123') {
    try { checkSafety(); } catch(e) { alert(e.message); return; }
    
    log("--- Seeding Users (This may take a moment) ---");
    log(`Target Teams: ${selectedTeamIds.length > 0 ? selectedTeamIds.join(', ') : 'None (Admin/Mod only)'}`);

    const projectId = auth.app.options.projectId;
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    // Create 50 users
    for (let i = 1; i <= 50; i++) {
        // NEW: Initialize a fresh app PER USER to prevent Firestore connection hangs in emulator
        // This avoids the "Backend didn't respond" error caused by rapid auth switching on a single client
        const appName = `SeedApp_${i}_${Date.now()}`;
        const secondaryApp = initializeApp(auth.app.options, appName);
        const secondaryAuth = getAuth(secondaryApp);

        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
        }

        const info = getSeedUserInfo(i);
        let teamId = '';

        // Assign to a team if available (skip first 5 admin/mod-only users)
        if (i > 5 && selectedTeamIds.length > 0) {
            teamId = selectedTeamIds[(i - 6) % selectedTeamIds.length];
        }

        const { username, email, isAdmin, isEventMod, isCaptain, prettyRole } = info;

        let uid;
        let userObj;
        const startUser = Date.now();
        try {
            log(`[${i}/50] Processing ${username}...`);
            console.log(`[SeedController] Processing ${username} (${i}/50)`);

            // 1. Create or Get Auth User
            // Use secondaryAuth to keep main session active
            const startAuth = Date.now();
            try {
                log(`  > Creating Auth user...`);
                const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                uid = cred.user.uid;
                userObj = cred.user;
                log(`  > Auth created (${Date.now() - startAuth}ms).`);
            } catch (authError) {
                if (authError.code === 'auth/email-already-in-use') {
                    // If exists, try to sign in to get UID
                    log(`  > Email exists, signing in...`);
                    const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
                    uid = cred.user.uid;
                    userObj = cred.user;
                    log(`  > Auth exists. Signed in (${Date.now() - startAuth}ms).`);
                } else { throw authError; }
            }

            // 2. Create Firestore Profile (As the new user using REST API to avoid SDK hangs)
            // This satisfies the rule: allow create: if request.auth.token.email == userEmail
            const startProfile = Date.now();
            log(`  > Creating Firestore profile...`);
            
            const token = await userObj.getIdToken();
            const url = isLocal 
                ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/users/${email}`
                : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${email}`;

            const body = {
                fields: {
                    uid: toRestValue(uid),
                    email: toRestValue(email),
                    displayName: toRestValue(`Seed ${i} ${prettyRole}`),
                    team: toRestValue(teamId),
                    isAdmin: toRestValue(false),
                    isEventMod: toRestValue(false),
                    hasSetDisplayName: toRestValue(true)
                }
            };

            const res = await fetch(url, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) throw new Error(`REST API Error: ${res.status} ${await res.text()}`);
            
            log(`  > Profile created (${Date.now() - startProfile}ms).`);

            // 3. Assign Captaincy (As Admin)
            // Now we switch back to the main 'db' (Admin) to elevate permissions
            if (isAdmin || isEventMod || (isCaptain && teamId)) {
                const startPerms = Date.now();
                log(`  > Elevating permissions...`);
                const updates = {};
                if (isAdmin) updates.isAdmin = true;
                if (isEventMod) updates.isEventMod = true;
                
                if (Object.keys(updates).length > 0) await fb.updateDoc(fb.doc(db, 'users', email), updates);
                if (isCaptain && teamId) await fb.updateDoc(fb.doc(db, 'teams', teamId), { captainId: email });
                log(`  > Permissions updated (${Date.now() - startPerms}ms).`);
            }

            log(`Created ${username} (${teamId || 'No Team'}) - Total: ${Date.now() - startUser}ms`);
            
        } catch (e) {
            console.error(`[SeedController] Error processing ${username}:`, e);
            if (e.code === 'auth/wrong-password') {
                log(`Skipping ${username}: Auth exists but password mismatch.`);
            } else {
                log(`Error creating ${username}: ${e.message}`);
            }
        } finally {
            // Clean up the app instance immediately
            await deleteApp(secondaryApp);
            await delay(20); // Stability delay between user creations
        }
    }
    log("User seeding complete.");
}

// Helper to generate a realistic history chain and final state
function generateLifecycle(user, tileId) {
    const adminUser = { id: 'admin_bot', name: 'AutoAdmin' };
    
    // 1. Determine Scenario
    const rand = Math.random();
    let scenario = 'verified'; // Default
    if (rand < 0.1) scenario = 'draft';
    else if (rand < 0.3) scenario = 'submitted';
    else if (rand < 0.4) scenario = 'flagged';
    else if (rand < 0.5) scenario = 'resubmitted'; // Flagged then fixed

    // 2. Setup Time (Work backwards from now - random(0-7 days))
    const ONE_HOUR = 3600 * 1000;
    const ONE_DAY = 24 * ONE_HOUR;
    let cursorTime = Date.now() - Math.floor(Math.random() * 7 * ONE_DAY);
    
    // Helper to step back time
    const stepBack = () => {
        cursorTime -= Math.floor(Math.random() * ONE_DAY) + ONE_HOUR; // 1 hour to 25 hours gap
        return Timestamp.fromMillis(cursorTime);
    };

    // 3. Generate Evidence
    const evidenceCount = Math.random() > 0.85 ? 2 : 1;
    const evidence = [];
    const shuffledLinks = [...REAL_EVIDENCE_LINKS].sort(() => 0.5 - Math.random());
    for(let i=0; i<evidenceCount; i++) {
        evidence.push({ link: shuffledLinks[i % shuffledLinks.length], name: `Evidence ${i+1}` });
    }
    const evidenceStr = JSON.stringify(evidence);
    const evidenceSummary = evidence.map(e => `${e.name} (${e.link})`).join('; ');
    const notes = 'Seeded submission';

    // 4. Build History (Reverse order of events, then we'll reverse array to be chronological if needed, 
    //    but the seed loop expects the final state object. We construct history array to be stored on the doc.)
    
    let history = [];
    let finalState = {
        id: tileId,
        PlayerIDs: [],
        AdditionalPlayerNames: user.displayName,
        Evidence: evidenceStr,
        Notes: notes,
        IsComplete: false,
        AdminVerified: false,
        RequiresAction: false,
        AdminFeedback: '',
        IsArchived: false,
        Timestamp: null,
        CompletionTimestamp: null
    };

    // -- Step 5: Verify (Final Step for Verified) --
    if (scenario === 'verified') {
        const ts = Timestamp.fromMillis(cursorTime);
        history.unshift({
            timestamp: ts,
            user: adminUser,
            action: 'Admin Update',
            changes: [{ field: 'AdminVerified', from: false, to: true }]
        });
        finalState.AdminVerified = true;
        finalState.IsComplete = true; // Verified implies complete
        stepBack();
    }

    // -- Step 4: Resubmit (Final for Resubmitted, or intermediate for Verified) --
    if (scenario === 'resubmitted' || (scenario === 'verified' && Math.random() > 0.5)) {
        const ts = Timestamp.fromMillis(cursorTime);
        history.unshift({
            timestamp: ts,
            user: { id: user.email, name: user.displayName },
            action: 'Resubmit for Review',
            changes: [
                { field: 'AdminFeedback', from: '"Please fix evidence"', to: 'Acknowledged & Cleared' },
                { field: 'RequiresAction', from: true, to: false },
                { field: 'IsComplete', from: false, to: true }
            ]
        });
        finalState.RequiresAction = false;
        finalState.IsComplete = true;
        finalState.CompletionTimestamp = ts; // Reset completion time
        stepBack();

        // If we resubmitted, there must have been a flag before it
        const tsFlag = Timestamp.fromMillis(cursorTime);
        history.unshift({
            timestamp: tsFlag,
            user: adminUser,
            action: 'Admin Update',
            changes: [
                { field: 'RequiresAction', from: false, to: true },
                { field: 'AdminFeedback', from: '""', to: '"Please fix evidence"' },
                { field: 'IsComplete', from: true, to: false } // Flagging clears completion
            ]
        });
        // If this was the final state (scenario == flagged), set state
        if (scenario === 'flagged') {
            finalState.RequiresAction = true;
            finalState.AdminFeedback = "Please fix evidence";
            finalState.IsComplete = false;
            finalState.CompletionTimestamp = null;
        }
        stepBack();
    } else if (scenario === 'flagged') {
        // Case where it ends on flagged (didn't resubmit yet)
        const ts = Timestamp.fromMillis(cursorTime);
        history.unshift({
            timestamp: ts,
            user: adminUser,
            action: 'Admin Update',
            changes: [
                { field: 'RequiresAction', from: false, to: true },
                { field: 'AdminFeedback', from: '""', to: '"Please fix evidence"' },
                { field: 'IsComplete', from: true, to: false }
            ]
        });
        finalState.RequiresAction = true;
        finalState.AdminFeedback = "Please fix evidence";
        finalState.IsComplete = false;
        stepBack();
    }

    // -- Step 3: Submit (Final for Submitted, or intermediate) --
    if (scenario !== 'draft') {
        const ts = Timestamp.fromMillis(cursorTime);
        const isDraftPrecursor = Math.random() > 0.5; // 50% chance it started as draft
        
        if (isDraftPrecursor) {
            // Submit Draft
            history.unshift({
                timestamp: ts,
                user: { id: user.email, name: user.displayName },
                action: 'Submit Draft',
                changes: [
                    { field: 'IsComplete', from: false, to: true }
                ]
            });
            stepBack();
            
            // Create Draft (Precursor)
            const tsDraft = Timestamp.fromMillis(cursorTime);
            history.unshift({
                timestamp: tsDraft,
                user: { id: user.email, name: user.displayName },
                action: 'Create Draft',
                changes: [
                    { field: 'IsComplete', from: 'N/A', to: false },
                    { field: 'PlayerIDs', from: 'N/A', to: '[]' },
                    { field: 'AdditionalPlayerNames', from: 'N/A', to: user.displayName },
                    { field: 'Notes', from: 'N/A', to: notes },
                    { field: 'Evidence', from: 'N/A', to: evidenceSummary }
                ]
            });
            if (finalState.Timestamp === null) finalState.Timestamp = tsDraft;

        } else {
            // Direct Submission
            history.unshift({
                timestamp: ts,
                user: { id: user.email, name: user.displayName },
                action: 'Create Submission',
                changes: [
                    { field: 'IsComplete', from: 'N/A', to: true },
                    { field: 'PlayerIDs', from: 'N/A', to: '[]' },
                    { field: 'AdditionalPlayerNames', from: 'N/A', to: user.displayName },
                    { field: 'Notes', from: 'N/A', to: notes },
                    { field: 'Evidence', from: 'N/A', to: evidenceSummary }
                ]
            });
            if (finalState.Timestamp === null) finalState.Timestamp = ts;
        }

        // If this is the final state (submitted), set state
        if (scenario === 'submitted') {
            finalState.IsComplete = true;
            finalState.CompletionTimestamp = ts;
        }
        // If verified/flagged later, completion timestamp might be reset or preserved depending on logic.
        // For simplicity in seed, if it's currently complete, set timestamp to the submission time (or resubmit time).
        if (finalState.IsComplete && !finalState.CompletionTimestamp) finalState.CompletionTimestamp = ts;

    } else {
        // Draft Only
        const ts = Timestamp.fromMillis(cursorTime);
        history.unshift({
            timestamp: ts,
            user: { id: user.email, name: user.displayName },
            action: 'Create Draft',
            changes: [
                { field: 'IsComplete', from: 'N/A', to: false },
                { field: 'PlayerIDs', from: 'N/A', to: '[]' },
                { field: 'AdditionalPlayerNames', from: 'N/A', to: user.displayName },
                { field: 'Notes', from: 'N/A', to: notes },
                { field: 'Evidence', from: 'N/A', to: evidenceSummary }
            ]
        });
        finalState.Timestamp = ts;
        finalState.IsComplete = false;
    }

    // Sort history chronological for storage
    history.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
    finalState.history = history;
    
    // Ensure Team is set by caller
    return finalState;
}

export async function seedSubmissions(log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }

    log("--- Seeding Submissions ---");
    
    // We need tiles to reference. Try reading from packed document first (more efficient).
    let tiles = [];
    try {
        const packedDoc = await fb.getDoc(fb.doc(db, 'tiles', 'packed'));
        if (packedDoc.exists() && packedDoc.data().tiles) {
            tiles = packedDoc.data().tiles;
            log(`Loaded ${tiles.length} tiles from 'tiles/packed'.`);
        }
    } catch (e) {
        log(`Warning: Could not read 'tiles/packed' (${e.message}).`);
    }

    // Fallback to individual documents if packed list is missing
    if (tiles.length === 0) {
        log("Packed tiles empty or missing. Falling back to individual documents...");
        const tilesSnap = await fb.getDocs(fb.collection(db, 'tiles'));
        tiles = tilesSnap.docs.filter(d => d.id !== 'packed').map(d => d.data());
    }

    tiles = tiles.filter(t => t.id); // Ensure valid ID

    if (tiles.length === 0) {
        log("ERROR: No tiles found. Please Import Tiles via the Setup page first.");
        return;
    }

    // We need users to reference
    const usersSnap = await fb.getDocs(fb.collection(db, 'users'));
    const users = usersSnap.docs.map(d => d.data());

    // Filter for seed players who are actually on a team
    const seedPlayers = users.filter(u => u.email.startsWith('seed-') && u.team);

    if (seedPlayers.length === 0) {
        log("ERROR: No users found. Run Seed Users first.");
        return;
    }

    // Fetch Existing Submissions (to avoid duplicates)
    const existingSubsSnap = await fb.getDocs(fb.collection(db, 'submissions'));
    // Map: TeamID -> Set(TileIDs)
    const existingTeamTiles = {};
    existingSubsSnap.docs.forEach(d => {
        const data = d.data();
        if (!existingTeamTiles[data.Team]) existingTeamTiles[data.Team] = new Set();
        existingTeamTiles[data.Team].add(data.id);
    });

    // Group seed players by team
    const seedUsersByTeam = {};
    seedPlayers.forEach(u => {
        if (!seedUsersByTeam[u.team]) seedUsersByTeam[u.team] = [];
        seedUsersByTeam[u.team].push(u);
    });

    const totalTiles = tiles.length;
    const maxPerTeam = Math.floor(totalTiles * 0.8); // 80% cap
    log(`Seeding Logic: Max ${maxPerTeam} submissions per team (80% of ${totalTiles} tiles).`);

    // Helper to check prerequisites
    const isTileUnlocked = (tile, completedSet) => {
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
        return prereqs.some(group => group.every(reqId => completedSet && completedSet.has(reqId)));
    };

    // Process each team
    for (const [teamId, teamUsers] of Object.entries(seedUsersByTeam)) {
        log(`Processing Team: ${teamId} (${teamUsers.length} players)...`);
        
        const actor = teamUsers[0];
        const appName = `SeedSub_${teamId}_${Date.now()}`;
        const secondaryApp = initializeApp(auth.app.options, appName);
        const secondaryAuth = getAuth(secondaryApp);
        const secondaryDb = getFirestore(secondaryApp);

        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
            connectFirestoreEmulator(secondaryDb, '127.0.0.1', 8080);
        }

        try {
            await signInWithEmailAndPassword(secondaryAuth, actor.email, 'password123');
            
            const completedSet = existingTeamTiles[teamId] || new Set();
            let batch = writeBatch(secondaryDb);
            let batchCount = 0;
            let totalCreated = 0;
            let round = 0;
            let madeProgress = true;

            while (madeProgress && round < 10) {
                madeProgress = false;
                round++;
                
                const shuffledUsers = [...teamUsers].sort(() => Math.random() - 0.5);

                for (const user of shuffledUsers) {
                    if (completedSet.size >= maxPerTeam) break;

                    const candidates = tiles.filter(t => 
                        !completedSet.has(t.id) && isTileUnlocked(t, completedSet)
                    );

                    if (candidates.length === 0) continue;
                    
                    const tile = candidates[Math.floor(Math.random() * candidates.length)];
                    
                    completedSet.add(tile.id);
                    madeProgress = true;

                    // Generate Lifecycle Data
                    const subData = generateLifecycle(user, tile.id);
                    subData.Team = teamId;
                    
                    // Generate Doc ID: YYMMDD-TeamID-TileID
                    // Use the creation timestamp for the ID date
                    const date = subData.Timestamp ? subData.Timestamp.toDate() : new Date();
                    const year = date.getUTCFullYear().toString().slice(-2);
                    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
                    const day = date.getUTCDate().toString().padStart(2, '0');
                    const docId = `${year}${month}${day}-${teamId}-${tile.id}`;

                    const ref = doc(secondaryDb, 'submissions', docId);
                    batch.set(ref, subData);
                    batchCount++;
                    totalCreated++;

                    if (batchCount >= 50) { // Reduced from 400 to 50 to prevent Emulator hangs
                        await batch.commit();
                        await delay(20); // Stability delay to let the Emulator transport layer catch up
                        batch = writeBatch(secondaryDb);
                        batchCount = 0;
                    }
                }
            }
            if (batchCount > 0) await batch.commit();
            log(`  > Created ${totalCreated} submissions for ${teamId}.`);

        } catch (e) {
            log(`  > ERROR seeding ${teamId}: ${e.message}`);
            console.error(e);
        } finally {
            await deleteApp(secondaryApp);
        }
    }
    log("Submission seeding complete.");
}

export async function getCounts(skipSafety = false) {
    
    console.log("[SeedController] Fetching counts...");
    const start = Date.now();

    // Fetch all docs to count manually in browser (avoids SDK mismatch issues)
    // Run in parallel to speed up loading
    const [tSnap, uSnap, sSnap, tiSnap] = await Promise.all([
        fb.getDocs(fb.collection(db, 'teams')),
        fb.getDocs(fb.collection(db, 'users')),
        fb.getDocs(fb.collection(db, 'submissions')),
        fb.getDocs(fb.collection(db, 'tiles'))
    ]);

    console.log(`[SeedController] Counts fetched in ${Date.now() - start}ms`);

    // Count Seeds
    const seedTeams = tSnap.docs.filter(d => d.data().name.startsWith('seed_')).length;
    const seedUsers = uSnap.docs.filter(d => d.data().email.startsWith('seed-')).length;
    const seedSubmissions = sSnap.docs.filter(d => {
        const ev = d.data().Evidence;
        return ev && (ev.includes('Seed Proof') || ev.includes('imgur.com'));
    }).length;
    
    return {
        teams: tSnap.size,
        seedTeams: seedTeams,
        users: uSnap.size,
        seedUsers: seedUsers,
        submissions: sSnap.size,
        seedSubmissions: seedSubmissions,
        tiles: tiSnap.size
    };
}

export async function forceDebugSubmission(teamId, tileId, log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }
    
    log(`Forcing submission for ${teamId} - ${tileId}...`);
    
    const now = new Date();
    const year = now.getUTCFullYear().toString().slice(-2);
    const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = now.getUTCDate().toString().padStart(2, '0');
    const docId = `${year}${month}${day}-${teamId}-${tileId}`;

    const subData = {
        id: tileId,
        Team: teamId,
        PlayerIDs: [],
        AdditionalPlayerNames: 'Debug Force',
        Evidence: JSON.stringify([{ link: '#', name: 'Seed Proof Debug' }]),
        Notes: 'Forced Debug Submission',
        IsComplete: true,
        AdminVerified: false,
        RequiresAction: false,
        IsArchived: false,
        Timestamp: fb.Timestamp.now(),
        CompletionTimestamp: fb.Timestamp.now(),
        history: []
    };

    await fb.setDoc(fb.doc(db, 'submissions', docId), subData);
    log(`Forced submission created (${docId}).`);
}

async function deleteCollectionSubset(collectionName, filterFn, log, skipSafety = false) {
    if (!skipSafety) {
        try { checkSafety(); } catch(e) { alert(e.message); return; }
    }

    log(`Scanning ${collectionName} for seed data...`);
    const q = fb.query(fb.collection(db, collectionName));
    const snapshot = await fb.getDocs(q);
    
    const docsToDelete = snapshot.docs.filter(filterFn);
    
    if (docsToDelete.length === 0) {
        log(`No seed data found in ${collectionName}.`);
        return;
    }

    log(`Deleting ${docsToDelete.length} items from ${collectionName}...`);

    const batchSize = 50; // Reduced from 400 to 50 for stability
    let batch = fb.writeBatch(db);
    let count = 0;

    for (const doc of docsToDelete) {
        batch.delete(doc.ref);
        count++;
        if (count >= batchSize) {
            await batch.commit();
            await delay(20); // Stability delay
            batch = fb.writeBatch(db);
            count = 0;
        }
    }
    if (count > 0) await batch.commit();
    log(`Deleted ${docsToDelete.length} docs from ${collectionName}.`);
}

export async function deleteSeedTeams(log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }
    await deleteCollectionSubset('teams', (doc) => doc.data().name.startsWith('seed_'), log, true);
}

export async function deleteSeedUsers(log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }

    log("--- Deleting Seed Users (Auth & Firestore) ---");

    // Initialize Secondary App for Auth Deletion
    // We use a secondary app so we don't log out the current admin user
    const secondaryApp = initializeApp(auth.app.options, "SecondaryApp_Delete");
    const secondaryAuth = getAuth(secondaryApp);

    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        connectAuthEmulator(secondaryAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    }

    let deletedAuth = 0;
    let deletedDocs = 0;

    // Iterate through the known seed range (1-50) to catch everything
    for (let i = 1; i <= 50; i++) {
        const { email } = getSeedUserInfo(i);
        log(`[${i}/50] Processing ${email}...`);
        
        // 1. Try to delete Auth Account
        try {
            const cred = await signInWithEmailAndPassword(secondaryAuth, email, 'password123');
            await deleteUser(cred.user);
            deletedAuth++;
        } catch (e) {
            // Ignore if user not found (already deleted)
            if (e.code !== 'auth/user-not-found') {
                log(`  > Auth delete skipped: ${e.code}`);
            }
        }

        // 2. Try to delete Firestore Document (Using Admin privileges)
        try {
            await fb.deleteDoc(fb.doc(db, 'users', email));
            deletedDocs++;
        } catch (e) {
            log(`  > Firestore delete skipped: ${e.message}`);
        }
    }

    await deleteApp(secondaryApp);
    log(`Cleanup complete.`);
    log(`- Auth Accounts Deleted: ${deletedAuth}`);
    log(`- User Profiles Deleted: ${deletedDocs}`);
}

export async function deleteSeedSubmissions(log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }
    await deleteCollectionSubset('submissions', (doc) => {
        const ev = doc.data().Evidence;
        return ev && (ev.includes('Seed Proof') || ev.includes('imgur.com'));
    }, log, true);
}