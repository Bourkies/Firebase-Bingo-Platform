import '../components/Navbar.js';

let fb, db, auth, initAuth, getAuthState;

// Helper to update UI
function updateCheck(id, status, badgeText, detailsText) {
    const item = document.getElementById(`check-${id}`);
    const badge = document.getElementById(`${id}-status`);
    const details = document.getElementById(`${id}-details`);

    item.className = `check-item status-${status}`;
    badge.className = `status-badge ${status}`;
    badge.textContent = badgeText;
    details.innerHTML = detailsText;
}

async function checkSdk() {
    try {
        const firebase = await import('../core/firebase-config.js');
        fb = firebase.fb;
        db = firebase.db;
        auth = firebase.auth;
        const authModule = await import('../core/auth.js');
        initAuth = authModule.initAuth;
        getAuthState = authModule.getAuthState;

        if (fb && db && auth && initAuth) {
            updateCheck('sdk', 'success', 'LOADED', 'Firebase SDK and auth module loaded successfully.');
            return true;
        }
        throw new Error('One or more Firebase modules failed to import.');
    } catch (e) {
        console.error("SDK Check Error:", e);
        let details = `Failed to load Firebase modules. This is a critical error.\n\n<strong>Possible Causes:</strong>\n- The file 'firebase-config.js' is missing or has a syntax error.\n- The file 'auth.js' is missing or has a syntax error.\n- There is a network issue preventing the Firebase SDK from loading from Google's servers.`;
        
        if (e.message && e.message.includes("doesn't provide an export named")) {
            details += `\n\n<strong>Specific Error Found:</strong>\nThis looks like a module import error. It means a file is trying to import a function that doesn't exist in the Firebase SDK. Check all files that import from 'firebase-config.js' or Firebase directly for typos or unimplemented features (like 'AppleAuthProvider').`;
        }
        details += `\n\n<span class="error-msg">Error: ${e.message}</span>`;
        updateCheck('sdk', 'error', 'ERROR', details);
        return false;
    }
}

function checkConfig() {
    if (!auth || !auth.app) {
        updateCheck('config', 'error', 'ERROR', 'Firebase app object not available. Cannot check config.');
        return;
    }
    const config = auth.app.options;
    if (config && config.projectId && config.projectId !== 'YOUR_PROJECT_ID') {
        updateCheck('config', 'success', 'VALID', `Configuration loaded for project: <strong>${config.projectId}</strong>`);
    } else {
        updateCheck('config', 'error', 'ERROR', `Firebase configuration appears to be invalid or is using placeholder values.\n\n<strong>Action:</strong>\n- Ensure you have copied 'firebase-config.example.js' to 'firebase-config.js'.\n- Ensure you have replaced the placeholder values in 'firebase-config.js' with your actual Firebase project keys.`);
    }
}

function checkImports() {
    if (!fb) {
        updateCheck('imports', 'error', 'SKIPPED', 'Skipped because Firebase SDK failed to load.');
        return;
    }

    const requiredFunctions = [
        // Firestore
        'getDoc', 'getDocs', 'setDoc', 'addDoc', 'updateDoc', 'deleteDoc',
        'doc', 'collection', 'query', 'where', 'orderBy', 'onSnapshot',
        'writeBatch', 'arrayUnion', 'serverTimestamp', 'documentId',
        // Auth
        'onAuthStateChanged', 'GoogleAuthProvider', 'signInWithPopup',
        'signInAnonymously', 'signOut', 'updateProfile',
        // Storage
        'ref', 'getDownloadURL', 'uploadBytes', 'deleteObject'
    ];

    const missingFunctions = [];
    for (const funcName of requiredFunctions) {
        if (typeof fb[funcName] !== 'function') {
            missingFunctions.push(funcName);
        }
    }

    if (missingFunctions.length === 0) {
        const details = `All ${requiredFunctions.length} required Firebase services are correctly exported from 'firebase-config.js'.`;
        updateCheck('imports', 'success', 'VALID', details);
    } else {
        const details = `The 'fb' object exported from 'firebase-config.js' is missing required functions. This usually means the config file is outdated or has been modified incorrectly.\n\n<strong>Action:</strong>\n- Compare your 'firebase-config.js' to 'firebase-config.example.js' to ensure all necessary services from 'firebase/app', 'firebase/auth', 'firebase/firestore', and 'firebase/storage' are being imported and added to the 'fb' object.\n\n<span class="error-msg"><strong>Missing Functions:</strong>\n${missingFunctions.join('\n')}</span>`;
        updateCheck('imports', 'error', 'ERROR', details);
    }
}

function checkAuth() {
    return new Promise(resolve => {
        initAuth(authState => {
            if (authState.isLoggedIn) {
                const profile = authState.profile || {};
                const details = `<strong>Status:</strong> Logged In\n<strong>User ID:</strong> ${authState.user.uid}\n<strong>Display Name:</strong> ${profile.displayName || 'N/A'}\n<strong>Email:</strong> ${profile.email || 'N/A'}\n<strong>Anonymous:</strong> ${profile.isAnonymous}\n\n<strong>Permissions:</strong>\n  - Admin: ${profile.isAdmin}\n  - Event Mod: ${profile.isEventMod}\n\n<strong>Team:</strong> ${profile.team || 'Not Assigned'}`;
                updateCheck('auth', 'success', 'LOGGED IN', details);
            } else {
                updateCheck('auth', 'warn', 'LOGGED OUT', 'You are not logged in. Some Firestore checks may fail due to security rules.');
            }
            resolve();
        });
    });
}

async function checkFirestore() {
    let results = [];
    let overallStatus = 'success';
    let errorCount = 0;

    const checkCollection = async (name, path) => {
        try {
            const docRef = fb.doc(db, path);
            const docSnap = await fb.getDoc(docRef);
            if (docSnap.exists()) {
                results.push(`- <strong>${name}:</strong> <span style="color: var(--success-color);">SUCCESS</span> (Found document at '${path}')`);
            } else {
                results.push(`- <strong>${name}:</strong> <span style="color: var(--warn-color);">WARN</span> (Document at '${path}' not found. This may be normal if not yet configured.)`);
                if (overallStatus !== 'error') overallStatus = 'warn';
            }
        } catch (e) {
            results.push(`- <strong>${name}:</strong> <span class="error-msg">ERROR</span> reading '${path}'. Reason: ${e.message}`);
            overallStatus = 'error';
            errorCount++;
        }
    };

    const checkCollectionCount = async (name) => {
        try {
            const querySnapshot = await fb.getDocs(fb.collection(db, name));
            results.push(`- <strong>${name} collection:</strong> <span style="color: var(--success-color);">SUCCESS</span> (Found ${querySnapshot.size} documents)`);
        } catch (e) {
            results.push(`- <strong>${name} collection:</strong> <span class="error-msg">ERROR</span> reading collection. Reason: ${e.message}`);
            overallStatus = 'error';
            errorCount++;
        }
    };

    // Run checks
    await checkCollection('Main Config', 'config/main');
    
    const authState = getAuthState();
    if (authState.isLoggedIn) {
        await checkCollection('Current User Profile', `users/${authState.user.uid}`);
    } else {
        results.push('- <strong>Current User Profile:</strong> SKIPPED (User not logged in)');
    }

    results.push('\n<strong>Collection Counts:</strong>');
    await checkCollectionCount('users');
    await checkCollectionCount('teams');
    await checkCollectionCount('tiles');
    await checkCollectionCount('public_tiles');
    await checkCollectionCount('styles');
    await checkCollectionCount('submissions');

    let summary = 'All checks passed.';
    let badgeText = 'OK';
    if (overallStatus === 'error') {
        summary = `Encountered ${errorCount} error(s). This often indicates a problem with <strong>Firestore Security Rules</strong> or database setup.`;
        badgeText = 'ERROR';
    } else if (overallStatus === 'warn') {
        summary = 'Some checks returned warnings. This might be expected for a new setup, but review the details.';
        badgeText = 'WARNING';
    }

    const detailsHtml = `${summary}\n\n<strong>Details:</strong>\n${results.join('\n')}`;
    updateCheck('firestore', overallStatus, badgeText, detailsHtml);
}

async function checkSecurity() {
    let details = [];
    let overallStatus = 'success';
    let errorCount = 0;

    const addResult = (status, message) => {
        let color = 'var(--primary-text)';
        if (status === 'SUCCESS') color = 'var(--success-color)';
        if (status === 'FAILURE') {
            color = 'var(--error-color)';
            overallStatus = 'error';
            errorCount++;
        }
        details.push(`- <span style="color: ${color};"><strong>${status}:</strong></span> ${message}`);
    };

    const authState = getAuthState();
    updateCheck('security', 'info', 'RUNNING', `Running checks for role: ${authState.isEventMod ? 'Admin/Mod' : (authState.isLoggedIn ? 'Player' : 'Logged Out')}...`);

    // --- Test 1: Listing all users ---
    details.push("<strong>Test 1: Attempting to list all users...</strong>");
    try {
        await fb.getDocs(fb.collection(db, 'users'));
        if (authState.isEventMod) {
            addResult('SUCCESS', 'Admin/Mod was able to list users, as per security rules.');
        } else {
            addResult('FAILURE', 'A non-admin was able to list all users. Rules are too permissive.');
        }
    } catch (e) {
        if (e.code === 'permission-denied') {
            if (authState.isEventMod) {
                addResult('FAILURE', 'Admin/Mod was blocked from listing users. Check `allow list` rule.');
            } else {
                addResult('SUCCESS', 'Non-admin was correctly blocked from listing users.');
            }
        } else {
            addResult('ERROR', `An unexpected error occurred: ${e.message}`);
        }
    }

    // --- Test 2: Reading another user's document ---
    details.push("\n<strong>Test 2: Attempting to read another user's document...</strong>");
    if (authState.isLoggedIn) {
        try {
            // To test this properly without listing all users (which a non-admin can't do),
            // we attempt to read a specific, non-existent user document.
            // The security rule should block this for a non-admin regardless of whether the doc exists.
            // Admins will get a "not found" result, which is not an error.
            const otherUserRef = fb.doc(db, 'users', 'a-different-user-id-that-is-not-mine');
            await fb.getDoc(otherUserRef);

            // If the above line does NOT throw an error, it means the read was allowed.
            if (authState.isEventMod) {
                addResult('SUCCESS', 'Admin/Mod was able to attempt a read on another user document, as per security rules.');
            } else {
                addResult('FAILURE', 'A non-admin was able to attempt a read on another user document. Rules are too permissive.');
            }
        } catch (e) {
            if (e.code === 'permission-denied') {
                // Getting a permission error is a success for non-admins, but a failure for admins.
                if (authState.isEventMod) {
                    addResult('FAILURE', 'Admin/Mod was blocked from reading another user document. Check `allow get` rule.');
                } else {
                    addResult('SUCCESS', 'Non-admin was correctly blocked from reading another user\'s document.');
                }
            } else {
                addResult('ERROR', `An unexpected error occurred: ${e.message}`);
            }
        }
    } else {
        details.push('- SKIPPED: User is not logged in.');
    }

    // --- Test 3: Reading own user document (for logged-in users) ---
    if (authState.isLoggedIn) {
        details.push("\n<strong>Test 3: Attempting to read own user document...</strong>");
        try {
            await fb.getDoc(fb.doc(db, 'users', authState.user.uid));
            addResult('SUCCESS', 'Logged-in user was able to read their own profile.');
        } catch (e) {
            addResult('FAILURE', `Logged-in user was blocked from reading their own profile. Error: ${e.message}`);
        }
    }

    // --- Final Summary ---
    let summary = 'All security checks passed.';
    let badgeText = 'PASSED';
    if (overallStatus === 'error') {
        summary = `Found ${errorCount} security failure(s). Review your Firestore rules immediately.`;
        badgeText = 'FAILED';
    } else if (overallStatus === 'warn') {
        summary = 'Some checks were inconclusive. This may be normal if there is only one user in the database.';
        badgeText = 'WARNING';
    }

    const detailsHtml = `${summary}\n\n<strong>Details:</strong>\n${details.join('\n')}`;
    updateCheck('security', overallStatus, badgeText, detailsHtml);
}

async function runAllChecks() {
    const sdkOk = await checkSdk();
    if (!sdkOk) {
        // Stop if SDK fails, as other checks will fail too
        updateCheck('config', 'error', 'SKIPPED', 'Skipped due to SDK load failure.');
        updateCheck('imports', 'error', 'SKIPPED', 'Skipped due to SDK load failure.');
        updateCheck('auth', 'error', 'SKIPPED', 'Skipped due to SDK load failure.');
        updateCheck('firestore', 'error', 'SKIPPED', 'Skipped due to SDK load failure.');
        updateCheck('security', 'error', 'SKIPPED', 'Skipped due to SDK load failure.');
        return;
    }

    checkConfig();
    checkImports();
    await checkAuth(); // This needs to complete before Firestore checks
    await checkFirestore();
    await checkSecurity();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rerun-checks-btn').addEventListener('click', runAllChecks);
    runAllChecks();
});