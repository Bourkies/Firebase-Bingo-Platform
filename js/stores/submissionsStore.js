import { atom, onMount } from 'nanostores';
import { db, fb } from '../core/firebase-config.js';
import { tilesStore } from './tilesStore.js';

export const submissionsStore = atom([]);

onMount(submissionsStore, () => {
    console.log('[SubmissionsStore] Mounted. Starting listener...');
    const submissionsCollection = fb.collection(db, 'submissions');

    const unsubscribe = fb.onSnapshot(submissionsCollection, (snapshot) => {
        const source = snapshot.metadata.fromCache ? "local cache" : "server";
        console.log(`[SubmissionsStore] Submissions updated from ${source}. Count: ${snapshot.docs.length}`);
        const submissions = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                docId: doc.id,
                // Convert Firestore Timestamps to JS Date objects
                Timestamp: safeToDate(data.Timestamp),
                CompletionTimestamp: safeToDate(data.CompletionTimestamp),
                history: (data.history || []).map(h => ({
                    ...h,
                    timestamp: safeToDate(h.timestamp)
                }))
            };
        });
        submissionsStore.set(submissions);
    }, (error) => {
        console.error("[SubmissionsStore] Error fetching submissions:", error);
        if (error.code === 'permission-denied') {
            submissionsStore.set([]);
        }
    });

    return () => {
        console.log('[SubmissionsStore] Unmounted. Stopping listener.');
        unsubscribe();
    };
});

/**
 * Starts a listener for a specific team's submissions.
 * Used by the Index page to reduce reads.
 * @param {string} teamId - The team ID to listen for.
 * @param {object} storeToUpdate - The Nano Store atom to update with the results.
 * @returns {function} - Unsubscribe function.
 */
export function startTeamSubmissionsListener(teamId, storeToUpdate) {
    if (!teamId) {
        storeToUpdate.set([]);
        return () => {};
    }

    console.log(`[SubmissionsStore] Starting listener for Team: ${teamId}`);
    const q = fb.query(
        fb.collection(db, 'submissions'),
        fb.where('Team', '==', teamId)
    );

    return fb.onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(doc => processSubmissionDoc(doc));
        storeToUpdate.set(subs);
    }, (error) => {
        console.error(`[SubmissionsStore] Error listening to team ${teamId}:`, error);
    });
}

/**
 * Starts a listener for the activity feed (Last 50 items).
 * Used by the Overview page.
 * @param {object} storeToUpdate - The Nano Store atom to update.
 * @returns {function} - Unsubscribe function.
 */
export function startFeedListener(storeToUpdate) {
    console.log(`[SubmissionsStore] Starting Feed listener (Limit 50)`);
    const q = fb.query(
        fb.collection(db, 'submissions'),
        fb.orderBy('Timestamp', 'desc'),
        fb.limit(50)
    );

    return fb.onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(doc => processSubmissionDoc(doc));
        storeToUpdate.set(subs);
    }, (error) => {
        console.error(`[SubmissionsStore] Error listening to feed:`, error);
    });
}

/**
 * Starts a listener for the Overview page.
 * Optimizes reads by only fetching COMPLETED submissions (ignoring drafts)
 * and respecting the board visibility setting.
 * @param {object} storeToUpdate - The Nano Store atom to update.
 * @param {object} options - { isPublic: boolean, teamId: string }
 * @returns {function} - Unsubscribe function.
 */
export function startOverviewListener(storeToUpdate, { isPublic, teamId }) {
    let q;
    const collectionRef = fb.collection(db, 'submissions');

    if (!isPublic) {
        // Private Board: Load only the user's team (Admins see as player)
        if (!teamId) {
            storeToUpdate.set([]);
            return () => {};
        }
        q = fb.query(collectionRef, fb.where('Team', '==', teamId));
    } else {
        // Public Board: Load all COMPLETED submissions.
        // Optimization: We filter 'IsComplete == true' to avoid reading drafts.
        // We do NOT limit the count because the Chart/Leaderboard need full history.
        q = fb.query(collectionRef, fb.where('IsComplete', '==', true));
    }

    return fb.onSnapshot(q, (snapshot) => {
        const subs = snapshot.docs.map(doc => processSubmissionDoc(doc));
        storeToUpdate.set(subs);
    }, (error) => {
        console.error("[SubmissionsStore] Error in overview listener:", error);
        storeToUpdate.set([]);
    });
}

/**
 * Saves or creates a submission. Handles both new drafts and updates.
 * @param {string|null} docId - The document ID to update, or null to create a new one.
 * @param {object} data - The submission data to save. 
 * @param {boolean} [isNew=false] - Set to true if creating a new document with a specific ID.
 */
export async function saveSubmission(docId, data, isNew = false) {
    if (docId) {
        // Update or Overwrite existing
        const subRef = fb.doc(db, 'submissions', docId);
        let result;
        if (isNew) {
            result = await fb.setDoc(subRef, data);
        } else {
            result = await fb.updateDoc(subRef, data);
        }
        await updateTeamAggregation(data.Team, data);
        return result;
    } else {
        // Create new with auto-ID
        const submissionsCollection = fb.collection(db, 'submissions');
        return await fb.addDoc(submissionsCollection, data);
    }
}

/**
 * Updates a submission from the admin panel.
 * @param {string} docId - The document ID to update.
 * @param {object} dataToUpdate - The fields to update.
 * @param {object|null} historyEntry - The history entry to add, if any.
 */
export async function updateSubmission(docId, dataToUpdate, historyEntry) {
    const subRef = fb.doc(db, 'submissions', docId);
    const finalData = { ...dataToUpdate };
    if (historyEntry) {
        finalData.history = fb.arrayUnion(historyEntry);
    }
    
    await fb.updateDoc(subRef, finalData);

    // Fetch the full submission to get Team and ID for aggregation
    // We try to get it from the store cache first to save a read
    const cachedSubs = submissionsStore.get();
    let fullSub = cachedSubs.find(s => s.docId === docId);
    
    // If not in cache (rare for admin), we might need to fetch it, but for now assume cache is valid
    if (fullSub) {
        const mergedData = { ...fullSub, ...finalData };
        await updateTeamAggregation(fullSub.Team, mergedData);
    }
}

/**
 * Imports submissions in bulk using batch writes.
 * @param {Array<object>} operations - An array of operation objects ({type, ref, data}).
 */
export async function importSubmissions(operations) {
    const affectedTeams = new Set();
    const BATCH_SIZE = 499;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
        const batch = fb.writeBatch(db);
        const chunk = operations.slice(i, i + BATCH_SIZE);
        chunk.forEach(op => {
            if (op.type === 'set') {
                const docRef = op.docId ? fb.doc(db, 'submissions', op.docId) : fb.doc(fb.collection(db, 'submissions'));
                batch.set(docRef, op.data, { merge: true });
                if (op.data.Team) affectedTeams.add(op.data.Team);
            } else if (op.type === 'update') {
                const docRef = fb.doc(db, 'submissions', op.docId);
                batch.update(docRef, op.data);
                // Note: Update ops might not have Team in data, but usually import provides full data.
                // If Team is missing, we might miss an aggregation update, but imports usually include it.
                if (op.data.Team) affectedTeams.add(op.data.Team);
            } else if (op.type === 'add') {
                batch.set(fb.doc(fb.collection(db, 'submissions')), op.data);
                if (op.data.Team) affectedTeams.add(op.data.Team);
            }
        });
        await batch.commit();
    }

    // After all writes are committed, regenerate aggregation for affected teams
    if (affectedTeams.size > 0) {
        await regenerateTeamAggregations(Array.from(affectedTeams));
    }
}

/**
 * Updates the aggregation data on the Team document.
 * This reduces reads on the Overview page by storing a summary of the submission state directly on the team.
 */
async function updateTeamAggregation(teamId, submissionData) {
    if (!teamId || !submissionData.id) return;

    // 1. Find the Tile Doc ID (Internal ID) using the User-Facing ID (e.g. "A1")
    const allTiles = tilesStore.get();
    const tile = allTiles.find(t => t.id === submissionData.id);
    
    // If we can't find the tile (e.g. it was deleted), we can't reliably key it.
    // Fallback to using the user-facing ID if necessary, but prefer docId.
    const key = tile ? tile.docId : submissionData.id;

    // 2. Determine Status
    let status = 'Draft';
    if (submissionData.AdminVerified) status = 'Verified';
    else if (submissionData.RequiresAction) status = 'Requires Action';
    else if (submissionData.IsComplete) status = 'Submitted';

    // 3. Determine Timestamp (Completion or Creation)
    // We store it as a Firestore Timestamp or null
    const timestamp = submissionData.CompletionTimestamp || submissionData.Timestamp || null;

    // 4. Parse Players
    let players = [];
    if (submissionData.AdditionalPlayerNames) {
        players = submissionData.AdditionalPlayerNames.split(',').map(s => s.trim()).filter(s => s);
    }

    // 5. Construct Summary Object
    const summary = {
        status,
        timestamp,
        players,
        tileId: submissionData.id // Store user-facing ID for easy display
    };

    // 6. Update Team Document
    // We use dot notation to update a specific key in the 'bingoState' map
    const teamRef = fb.doc(db, 'teams', teamId);
    const updateData = { [`bingoState.${key}`]: summary };

    try {
        await fb.updateDoc(teamRef, updateData);
    } catch (e) {
        console.warn(`[SubmissionsStore] Failed to update team aggregation: ${e.message}`);
        // We don't throw here to avoid blocking the main submission flow if this optimization fails
    }
}

// Helper to process raw Firestore doc into our app format
function processSubmissionDoc(doc) {
    const data = doc.data();
    return {
        ...data,
        docId: doc.id,
        Timestamp: safeToDate(data.Timestamp),
        CompletionTimestamp: safeToDate(data.CompletionTimestamp),
        history: (data.history || []).map(h => ({
            ...h,
            timestamp: safeToDate(h.timestamp)
        }))
    };
}

// Helper to safely convert various timestamp formats to a JS Date
function safeToDate(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate(); // Firestore Timestamp
    if (val instanceof Date) return val; // Already a Date
    if (typeof val === 'object' && typeof val.seconds === 'number') {
        // Handle plain object { seconds: ..., nanoseconds: ... } (Bad Import Data)
        return new Date(val.seconds * 1000 + (val.nanoseconds || 0) / 1000000);
    }
    if (typeof val === 'string') {
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
}

/**
 * Deletes all submissions from the database.
 */
export async function clearAllSubmissions() {
    const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
    if (snapshot.empty) return;

    const BATCH_SIZE = 499;
    for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
        const batch = fb.writeBatch(db);
        const chunk = snapshot.docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
}

/**
 * Regenerates the bingoState aggregation for specific teams.
 * This is used by imports and manual admin actions to ensure the Overview page is correct.
 * @param {Array<string>} teamIds - List of team IDs to regenerate.
 */
export async function regenerateTeamAggregations(teamIds) {
    if (!teamIds || teamIds.length === 0) return;
    
    console.log(`[SubmissionsStore] Regenerating aggregation for ${teamIds.length} teams...`);
    const allTiles = tilesStore.get();
    
    // Fetch all submissions once (more efficient than querying per team if we are doing many)
    // For a "few MB" database, this is perfectly fine.
    const snapshot = await fb.getDocs(fb.collection(db, 'submissions'));
    const allSubmissions = snapshot.docs.map(d => d.data());

    const batch = fb.writeBatch(db);
    let batchCount = 0;

    teamIds.forEach(teamId => {
        const teamSubs = allSubmissions.filter(s => s.Team === teamId && !s.IsArchived);
        const bingoState = {};
        
        teamSubs.forEach(sub => {
            if (!sub.id) return;
            const tile = allTiles.find(t => t.id === sub.id);
            const key = tile ? tile.docId : sub.id;
            
            let status = 'Draft';
            if (sub.AdminVerified) status = 'Verified';
            else if (sub.RequiresAction) status = 'Requires Action';
            else if (sub.IsComplete) status = 'Submitted';

            // Fix: Ensure we convert any raw objects to proper Dates/Timestamps before writing to team aggregation
            const timestamp = safeToDate(sub.CompletionTimestamp) || safeToDate(sub.Timestamp) || null;
            let players = [];
            if (sub.AdditionalPlayerNames) {
                players = sub.AdditionalPlayerNames.split(',').map(s => s.trim()).filter(s => s);
            }

            bingoState[key] = { status, timestamp, players, tileId: sub.id };
        });

        const teamRef = fb.doc(db, 'teams', teamId);
        batch.update(teamRef, { bingoState });
        batchCount++;
    });

    if (batchCount > 0) await batch.commit();
    console.log('[SubmissionsStore] Aggregation regeneration complete.');
}

export async function regenerateAllTeamAggregations() {
    const snapshot = await fb.getDocs(fb.collection(db, 'teams'));
    const teamIds = snapshot.docs.map(d => d.id);
    await regenerateTeamAggregations(teamIds);
}