import { db, auth, fb } from '../js/core/firebase-config.js';
import { authStore } from '../js/stores/authStore.js';
// Import Firebase App and Auth directly to create a secondary instance
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, connectAuthEmulator, signInWithEmailAndPassword, deleteUser } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

function checkSafety() {
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

export async function getExistingTeams() {
    try { checkSafety(); } catch(e) { return []; }
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
        }
    }
    log("User seeding complete.");
}

export async function seedSubmissions(log) {
    try { checkSafety(); } catch(e) { alert(e.message); return; }

    log("--- Seeding Submissions ---");
    
    // We need tiles to reference
    const tilesSnap = await fb.getDocs(fb.collection(db, 'tiles'));
    if (tilesSnap.empty) {
        log("ERROR: No tiles found. Please Import Tiles via the Setup page first.");
        return;
    }
    const tiles = tilesSnap.docs.map(d => d.data());

    // We need users to reference
    const usersSnap = await fb.getDocs(fb.collection(db, 'users'));
    const users = usersSnap.docs.map(d => d.data());

    // Filter for seed players who are actually on a team
    const seedPlayers = users.filter(u => u.email.startsWith('seed-') && u.team);

    if (seedPlayers.length === 0) {
        log("ERROR: No users found. Run Seed Users first.");
        return;
    }

    // Get existing submissions to avoid duplicates
    const existingSubsSnap = await fb.getDocs(fb.collection(db, 'submissions'));
    const existingKeys = new Set(existingSubsSnap.docs.map(d => `${d.data().Team}_${d.data().id}`));

    // Identify seed teams to limit seeding scope
    const seedTeamIds = new Set(seedPlayers.map(u => u.team));

    // Track completed tiles per team in memory for prerequisite checking
    const teamCompletedTiles = {}; 
    existingSubsSnap.docs.forEach(d => {
        const data = d.data();
        if (data.IsComplete && seedTeamIds.has(data.Team)) {
            if (!teamCompletedTiles[data.Team]) teamCompletedTiles[data.Team] = new Set();
            teamCompletedTiles[data.Team].add(data.id);
        }
    });

    // Calculate Limits
    const totalTiles = tiles.length;
    const maxPerTeam = Math.floor(totalTiles * 0.8); // 80% cap
    log(`Seeding Logic: Max ${maxPerTeam} submissions per team (80% of ${totalTiles} tiles).`);

    const batchSize = 400;
    let batch = fb.writeBatch(db);
    let count = 0;
    let total = 0;

    // Helper to check prerequisites
    const isTileUnlocked = (tile, completedSet) => {
        if (!tile.Prerequisites) return true;
        let prereqs = [];
        try {
            // Handle JSON or CSV
            if (tile.Prerequisites.trim().startsWith('[')) {
                prereqs = JSON.parse(tile.Prerequisites);
            } else {
                prereqs = tile.Prerequisites.split(',').map(s => s.trim()).filter(s => s);
                if (prereqs.length > 0) prereqs = [prereqs]; // Convert CSV to single group
            }
        } catch (e) { return true; } // Fail open if parse error

        if (!Array.isArray(prereqs) || prereqs.length === 0) return true;

        // Check if ANY group is satisfied (OR logic)
        return prereqs.some(group => {
            // Check if ALL items in group are satisfied (AND logic)
            return group.every(reqId => completedSet && completedSet.has(reqId));
        });
    };

    // Simulation Loop: Run multiple passes to allow prerequisite chains to fill
    // We iterate until we can't add more or hit a safety limit
    let madeProgress = true;
    let round = 0;

    while (madeProgress && round < 10) {
        madeProgress = false;
        round++;
        log(`--- Simulation Round ${round + 1} ---`);
        
        // Shuffle players to distribute submissions randomly
        const shuffledPlayers = [...seedPlayers].sort(() => Math.random() - 0.5);

        for (const user of shuffledPlayers) {
            const teamId = user.team;
            const completedSet = teamCompletedTiles[teamId] || new Set();

            // Check 80% cap
            if (completedSet.size >= maxPerTeam) continue;

            // Find unlocked candidates
            const candidates = tiles.filter(t => 
                !existingKeys.has(`${teamId}_${t.id}`) && isTileUnlocked(t, completedSet)
            );

            if (candidates.length === 0) continue;
            const tile = candidates[Math.floor(Math.random() * candidates.length)];

            existingKeys.add(`${teamId}_${tile.id}`);
            madeProgress = true; // We added something, so another round might unlock more

        // Determine State
        const rand = Math.random();
        let state = 'draft';
        if (rand > 0.8) state = 'verified';
        else if (rand > 0.6) state = 'flagged';
        else if (rand > 0.3) state = 'submitted';
        
        const isComplete = state !== 'draft';
        const isAdminVerified = state === 'verified';
        const requiresAction = state === 'flagged';

        // Update memory for next iteration
        if (isComplete) {
            if (!teamCompletedTiles[teamId]) teamCompletedTiles[teamId] = new Set();
            teamCompletedTiles[teamId].add(tile.id);
        }

        // Generate History
        const history = [];
        const timestamp = fb.Timestamp.now();
        
        // 1. Initial Submission
        history.push({
            timestamp: timestamp,
            user: { uid: user.uid, name: user.displayName },
            action: state === 'draft' ? 'Create Draft' : 'Create Submission',
            changes: [{ field: 'IsComplete', from: false, to: isComplete }]
        });

        // 2. Admin Action (if applicable)
        let adminFeedback = '';
        if (state === 'flagged') {
            adminFeedback = "Screenshot is blurry. Please re-upload.";
            history.push({
                timestamp: timestamp,
                user: { uid: 'admin_bot', name: 'AutoAdmin' },
                action: 'Flag Submission',
                changes: [{ field: 'RequiresAction', from: false, to: true }]
            });
        } else if (state === 'verified') {
            history.push({
                timestamp: timestamp,
                user: { uid: 'admin_bot', name: 'AutoAdmin' },
                action: 'Verify Submission',
                changes: [{ field: 'AdminVerified', from: false, to: true }]
            });
        }
        
        // Generate Evidence (1 or 2 items)
        const evidenceCount = Math.random() > 0.8 ? 2 : 1;
        const evidence = [];
        for(let k=0; k<evidenceCount; k++) {
            evidence.push({ link: 'https://via.placeholder.com/150', name: `Seed Proof ${k+1}` });
        }

        const subData = {
            id: tile.id, // The tile ID (e.g., "A1")
            Team: user.team,
            PlayerIDs: [user.uid],
            AdditionalPlayerNames: '',
            Evidence: JSON.stringify(evidence),
            Notes: `Seeded submission (${state})`,
            IsComplete: isComplete,
            AdminVerified: isAdminVerified,
            RequiresAction: requiresAction,
            AdminFeedback: adminFeedback,
            IsArchived: false,
            Timestamp: timestamp,
            CompletionTimestamp: isComplete ? timestamp : null,
            history: history
        };

        const ref = fb.doc(fb.collection(db, 'submissions'));
        batch.set(ref, subData);

        count++;
        total++;
        if (count >= batchSize) {
            await batch.commit();
            batch = fb.writeBatch(db);
            count = 0;
            log(`Committed ${total} submissions...`);
            }
        }
    }
    if (count > 0) await batch.commit();
    log(`Done! Created ${total} submissions.`);
}

export async function getCounts() {
    try { checkSafety(); } catch(e) { return { teams: '-', users: '-', submissions: '-', tiles: '-' }; }
    
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
        return ev && ev.includes('Seed Proof');
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

    await fb.addDoc(fb.collection(db, 'submissions'), subData);
    log("Forced submission created.");
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

    const batchSize = 400;
    let batch = fb.writeBatch(db);
    let count = 0;

    for (const doc of docsToDelete) {
        batch.delete(doc.ref);
        count++;
        if (count >= batchSize) {
            await batch.commit();
            batch = fb.writeBatch(db);
            count = 0;
        }
    }
    if (count > 0) await batch.commit();
    log(`Deleted ${docsToDelete.length} docs from ${collectionName}.`);
}

export async function deleteSeedTeams(log) {
    await deleteCollectionSubset('teams', (doc) => doc.data().name.startsWith('seed_'), log);
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
    await deleteCollectionSubset('submissions', (doc) => {
        const ev = doc.data().Evidence;
        return ev && ev.includes('Seed Proof');
    }, log);
}