/**
 * sync.js — Google Drive AppData Sync Engine
 * TReX - Devour Your Expenses
 *
 * Handles silent OAuth 2.0 authorization via GIS, Google Drive REST API calls,
 * local-first sync coordination, timestamp-based last-write-wins merging,
 * automatic re-auth, conflict resolution dialogs, and exponential backoff retry.
 *
 * Dependencies: core.js, backup.js
 */

let tokenClient = null;
let accessToken = null;
let tokenExpiry = 0;

// Keep this name local to sync.js. core.js already owns DEFAULT_CLIENT_ID in
// the global script scope, and redeclaring that const prevents this file from
// loading in browsers.
const SYNC_DEFAULT_CLIENT_ID = "219866394954-pg9187uvcq3gu0c4l51728m1u1hojt0c.apps.googleusercontent.com";
const SYNC_RESET_MARKER_TYPE = "trex_reset_marker";

function createSyncId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSyncIdentity(target = state) {
    if (!target.deviceId) target.deviceId = createSyncId("trex_device");
    if (!target.syncEpoch) target.syncEpoch = createSyncId("trex_epoch");
    if (!Array.isArray(target.syncResetHistory)) target.syncResetHistory = [];
    if (target.syncResetLineage === undefined) target.syncResetLineage = null;
    if (target.pendingCloudResetEpoch === undefined) target.pendingCloudResetEpoch = "";
    return target;
}

function hasMeaningfulLocalData(target = state) {
    return ["transactions", "savingGoals", "trips", "recurringExpenses", "emis"].some(key => Array.isArray(target[key]) && target[key].length > 0);
}

function isResetMarker(remoteState) {
    return remoteState && remoteState.trexSyncType === SYNC_RESET_MARKER_TYPE;
}

function getResetHistory(remoteState) {
    const history = Array.isArray(remoteState.syncResetHistory) ? remoteState.syncResetHistory : [];
    const previous = remoteState.syncResetLineage && remoteState.syncResetLineage.previousEpoch;
    return previous ? Array.from(new Set([...history, previous])) : history;
}

function isAcrossResetBoundary(localState, remoteState) {
    if (!remoteState || isResetMarker(remoteState)) return false;
    ensureSyncIdentity(localState);
    ensureSyncIdentity(remoteState);
    if (localState.syncEpoch === remoteState.syncEpoch) return false;

    const history = getResetHistory(remoteState);
    if (history.includes(localState.syncEpoch)) return true;

    const resetAt = remoteState.syncResetLineage && remoteState.syncResetLineage.resetAt;
    const lastSeen = localState.lastSyncedAt || localState.updatedAt || "";
    return !!resetAt && hasMeaningfulLocalData(localState) && (!lastSeen || new Date(lastSeen).getTime() < new Date(resetAt).getTime());
}

function buildResetMarker(previousEpoch) {
    const resetAt = new Date().toISOString();
    const nextEpoch = createSyncId("trex_epoch");
    const previousHistory = Array.isArray(state.syncResetHistory) ? state.syncResetHistory : [];
    return {
        trexSyncType: SYNC_RESET_MARKER_TYPE,
        syncEpoch: nextEpoch,
        previousSyncEpoch: previousEpoch || state.syncEpoch || "",
        syncResetLineage: {
            previousEpoch: previousEpoch || state.syncEpoch || "",
            resetAt,
            resetByDeviceId: state.deviceId || ""
        },
        syncResetHistory: Array.from(new Set([...previousHistory, previousEpoch || state.syncEpoch || ""])).filter(Boolean),
        resetAt,
        resetByDeviceId: state.deviceId || "",
        updatedAt: resetAt
    };
}

function buildFreshStateAfterReset(marker) {
    const resetAt = new Date().toISOString();
    const lineage = marker.syncResetLineage || {
        previousEpoch: marker.previousSyncEpoch || "",
        resetAt: marker.resetAt || resetAt,
        resetByDeviceId: marker.resetByDeviceId || ""
    };
    return {
        currency: "INR",
        currencySymbol: "\u20B9",
        monthlyBudget: 0,
        cycleType: "calendar",
        cycleDay: 1,
        creditCardsEnabled: false,
        pinEnabled: false,
        pinCode: "1234",
        categories: [...DEFAULT_CATEGORIES],
        payments: [...DEFAULT_PAYMENTS],
        transactions: [],
        savingGoals: [...DEFAULT_SAVING_GOALS],
        recurringExpenses: [],
        emis: [],
        trips: [],
        theme: "dark",
        syncEnabled: true,
        updatedAt: resetAt,
        lastSyncedAt: resetAt,
        syncStatus: "idle",
        syncUserEmail: "",
        syncDriveFileId: "",
        googleClientId: "",
        hideCloudPrompt: false,
        deviceId: createSyncId("trex_device"),
        syncEpoch: marker.syncEpoch || createSyncId("trex_epoch"),
        syncResetLineage: lineage,
        syncResetHistory: Array.from(new Set([
            ...(Array.isArray(marker.syncResetHistory) ? marker.syncResetHistory : []),
            lineage.previousEpoch || ""
        ])).filter(Boolean),
        pendingCloudResetEpoch: "",
        biometricEnabled: false,
        biometricCredentialId: "",
        biometricUserId: "",
        biometricLabel: "",
        biometricRegisteredAt: ""
    };
}

// Initialize GIS as soon as the SDK script finishes loading.
// The GIS script tag uses async defer, so this callback fires once it's ready.
window._trexGISReady = function () {
    initGoogleAuth(false);
    // If sync was already enabled (returning user), kick off a sync now that auth is ready
    if (state && state.syncEnabled) {
        syncFromDrive();
    }
};

/**
 * Initialize Google Identity Services token client
 */
function initGoogleAuth(forceInteractive = false) {
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
        console.warn("Google GIS SDK not loaded yet — will retry when ready.");
        return;
    }

    const clientId = state.googleClientId || SYNC_DEFAULT_CLIENT_ID;
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.appdata openid email profile",
        callback: (response) => {
            // NOTE: When called via connectGoogleSync → getValidToken, this
            // callback is temporarily replaced by getValidToken's own wrapper.
            // This branch only fires for background token renewals (e.g. focus
            // sync, manual sync) where getValidToken is NOT the initiator.
            if (response.error) {
                console.error("GIS Authentication failed:", response);
                updateSyncStatus("error", response.error);
                showNotification("Google Drive authorization failed.");
                return;
            }
            accessToken = response.access_token;
            tokenExpiry = Date.now() + (response.expires_in * 1000);
        }
    });
}

/**
 * Obtains a valid OAuth 2.0 access token silently or interactively if needed
 */
function getValidToken(forceInteractive = false) {
    return new Promise((resolve, reject) => {
        // If current token is valid (with 1-minute grace margin), return it
        if (accessToken && Date.now() < tokenExpiry - 60000) {
            resolve(accessToken);
            return;
        }

        if (!tokenClient) {
            initGoogleAuth();
        }

        if (!tokenClient) {
            reject(new Error("GIS client not loaded"));
            return;
        }

        // Intercept tokenClient callback once
        const originalCallback = tokenClient.callback;
        tokenClient.callback = (response) => {
            tokenClient.callback = originalCallback; // restore
            if (response.error) {
                reject(new Error(response.error));
                return;
            }
            accessToken = response.access_token;
            tokenExpiry = Date.now() + (response.expires_in * 1000);
            resolve(accessToken);
        };

        // requestAccessToken: empty prompt for silent, consent/select_account for interactive
        const promptOption = forceInteractive ? "consent" : "";
        try {
            tokenClient.requestAccessToken({ prompt: promptOption });
        } catch (e) {
            reject(e);
        }
    });
}

/**
 * Fetch wrapper implementing exponential backoff retry and token refresh
 */
async function fetchWithRetry(url, options = {}, retries = [2000, 5000, 15000]) {
    let attempt = 0;
    while (true) {
        try {
            const response = await fetch(url, options);
            if (response.status === 401) {
                console.log("Access token expired (401). Refreshing token...");
                accessToken = null; // Clear cached token
                const token = await getValidToken(false);
                options.headers = options.headers || {};
                options.headers["Authorization"] = `Bearer ${token}`;
                return await fetch(url, options); // Retry once
            }
            return response;
        } catch (error) {
            if (attempt >= retries.length) {
                throw error;
            }
            const delay = retries[attempt];
            console.warn(`Sync request failed. Retrying in ${delay}ms...`, error);
            updateSyncStatus("syncing", `Retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            attempt++;
        }
    }
}

/**
 * Finds the file ID of TReX sync file in appDataFolder
 */
async function findSyncFileId(token) {
    const query = encodeURIComponent("name = 'trex_sync_v4.json' and 'appDataFolder' in parents and trashed = false");
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`;
    const response = await fetchWithRetry(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error(`Query failed: HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.files && data.files.length > 0) {
        return data.files[0].id;
    }
    return null;
}

/**
 * Creates a sync file in appDataFolder (metadata + media content)
 */
async function createSyncFile(token, content) {
    // 1. Create metadata metadata
    const metadataUrl = "https://www.googleapis.com/drive/v3/files";
    const metaResponse = await fetchWithRetry(metadataUrl, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            name: "trex_sync_v4.json",
            parents: ["appDataFolder"]
        })
    });
    if (!metaResponse.ok) {
        throw new Error(`Create metadata failed: HTTP ${metaResponse.status}`);
    }
    const file = await metaResponse.json();
    const fileId = file.id;

    // 2. Upload actual content
    await updateSyncFile(token, fileId, content);
    return fileId;
}

/**
 * Updates content of an existing sync file in appDataFolder
 */
async function updateSyncFile(token, fileId, content) {
    const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
    const response = await fetchWithRetry(uploadUrl, {
        method: "PATCH",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        },
        body: content
    });
    if (!response.ok) {
        throw new Error(`Upload failed: HTTP ${response.status}`);
    }
}

/**
 * Downloads content of a sync file
 */
async function downloadSyncFile(token, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await fetchWithRetry(url, {
        headers: { "Authorization": `Bearer ${token}` }
    });
    if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`);
    }
    return await response.json();
}

/**
 * Pushes local state to Google Drive appDataFolder
 */
async function pushToDrive() {
    if (!state.syncEnabled) return;
    ensureSyncIdentity(state);
    if (state.pendingCloudResetEpoch) {
        updateSyncStatus("offline", "Reset pending");
        return;
    }
    updateSyncStatus("syncing");
    try {
        const token = await getValidToken(false);
        const fileId = await findSyncFileId(token);
        if (fileId) {
            const remoteState = await downloadSyncFile(token, fileId);
            if (isResetMarker(remoteState)) {
                await showCloudResetMarkerModal(remoteState, token, fileId);
                return;
            }
            if (remoteState && isAcrossResetBoundary(state, remoteState)) {
                await showResetBoundaryConflictModal(remoteState, token, fileId);
                return;
            }
        }
        const content = JSON.stringify(state);

        if (fileId) {
            await updateSyncFile(token, fileId, content);
        } else {
            await createSyncFile(token, content);
        }

        state.lastSyncedAt = new Date().toISOString();
        // Save state avoiding sync loop
        localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
        updateSyncStatus("idle");
        console.log("TReX successfully pushed local data to Drive.");
    } catch (e) {
        console.error("pushToDrive error:", e);
        updateSyncStatus("error", e.message || "Failed to push");
    }
}

/**
 * Pulls and synchronizes data from Google Drive.
 * Silent background engine: no intrusive conflict modals.
 * - remoteTime > localTime + already connected → remote is source of truth (overwrite arrays)
 * - remoteTime > localTime + initial linkage (both sides have data) → deduplicate-merge arrays
 * - Budget discrepancy → scoped minimalist confirmation modal only
 * - localTime > remoteTime → push local up
 */
async function syncFromDrive(forceInteractiveAuth = false) {
    if (!state.syncEnabled) {
        updateSyncStatus("offline");
        return;
    }
    ensureSyncIdentity(state);
    if (state.pendingCloudResetEpoch) {
        updateSyncStatus("offline", "Reset pending");
        return;
    }
    if (!navigator.onLine) {
        updateSyncStatus("offline");
        return;
    }
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
        console.warn("syncFromDrive: GIS SDK not ready yet. Will sync when ready.");
        updateSyncStatus("offline", "SDK not ready");
        return;
    }
    updateSyncStatus("syncing");
    try {
        let token;
        try {
            token = await getValidToken(false);
        } catch (authError) {
            if (!forceInteractiveAuth) throw authError;
            token = await getValidToken(true);
        }
        const fileId = await findSyncFileId(token);

        if (!fileId) {
            console.log("No remote sync file found. Seeding remote store with local data.");
            const content = JSON.stringify(state);
            await createSyncFile(token, content);
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
            return;
        }

        const remoteState = await downloadSyncFile(token, fileId);
        if (isResetMarker(remoteState)) {
            await showCloudResetMarkerModal(remoteState, token, fileId);
            return;
        }
        if (!remoteState || !remoteState.updatedAt) {
            console.warn("Remote state corrupted or invalid. Overwriting remote with local data.");
            await updateSyncFile(token, fileId, JSON.stringify(state));
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
            return;
        }

        ensureSyncIdentity(remoteState);
        if (isAcrossResetBoundary(state, remoteState)) {
            await showResetBoundaryConflictModal(remoteState, token, fileId);
            return;
        }

        const localTime = new Date(state.updatedAt).getTime();
        const remoteTime = new Date(remoteState.updatedAt).getTime();

        const mergedState = buildMergedSyncState(state, remoteState);
        const mergeChangedLocal = !sameSyncArrays(state, mergedState);
        const mergeChangedRemote = !sameSyncArrays(remoteState, mergedState);

        if (mergeChangedLocal || mergeChangedRemote) {
            console.log("Sync reconciliation: merged missing records across devices.");
            const newestTime = Math.max(
                Number.isFinite(localTime) ? localTime : 0,
                Number.isFinite(remoteTime) ? remoteTime : 0,
                Date.now()
            );
            mergedState.updatedAt = new Date(newestTime).toISOString();
            applyRemoteState(mergedState, true);
            if (fileId) {
                await updateSyncFile(token, fileId, JSON.stringify(state));
                state.lastSyncedAt = new Date().toISOString();
                localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            }
            updateSyncStatus("idle");
            return;
        }

        if (remoteTime === localTime) {
            // Already in sync
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
            return;
        }

        if (remoteTime > localTime) {
            // Check budget discrepancy before applying
            const budgetChanged = remoteState.monthlyBudget !== undefined &&
                                  state.monthlyBudget !== remoteState.monthlyBudget &&
                                  state.monthlyBudget !== 0;

            if (budgetChanged) {
                // Scoped budget-only confirmation — non-blocking for the rest of sync
                _showBudgetConflictModal(state.monthlyBudget, remoteState.monthlyBudget, (keepRemoteBudget) => {
                    if (!keepRemoteBudget) {
                        // Preserve local budget in the incoming remote state before applying
                        remoteState.monthlyBudget = state.monthlyBudget;
                    }
                    _applyRemoteSilent(remoteState, false, token, fileId);
                });
            } else {
                _applyRemoteSilent(remoteState, false, token, fileId);
            }
        } else {
            // Local is newer: push to cloud
            console.log("Local state is newer. Uploading to Google Drive.");
            await updateSyncFile(token, fileId, JSON.stringify(state));
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
        }
    } catch (e) {
        console.error("syncFromDrive error:", e);
        updateSyncStatus("error", e.message || "Failed to pull");
    }
}

/**
 * Merges sync collections and shared settings so two devices using the same
 * Drive file converge instead of endlessly preferring one timestamp.
 */
function buildMergedSyncState(localState, remoteState) {
    ensureSyncIdentity(localState);
    ensureSyncIdentity(remoteState);
    const localTime = new Date(localState.updatedAt || 0).getTime();
    const remoteTime = new Date(remoteState.updatedAt || 0).getTime();
    const preferLocal = Number.isFinite(localTime) && Number.isFinite(remoteTime)
        ? localTime > remoteTime
        : false;
    const newerState = preferLocal ? localState : remoteState;
    const merged = { ...remoteState };
    const mergeById = (local, remote) => {
        const map = new Map();
        (remote || []).forEach(item => {
            if (item && item.id) map.set(item.id, item);
        });
        (local || []).forEach(item => {
            if (item && item.id && !map.has(item.id)) map.set(item.id, item);
        });
        return Array.from(map.values());
    };

    merged.categories = mergeById(localState.categories, remoteState.categories);
    merged.payments = mergeById(localState.payments, remoteState.payments);
    merged.transactions = mergeById(localState.transactions, remoteState.transactions);
    merged.savingGoals = mergeById(localState.savingGoals, remoteState.savingGoals);
    merged.trips = mergeById(localState.trips, remoteState.trips);
    merged.recurringExpenses = mergeById(localState.recurringExpenses, remoteState.recurringExpenses);
    merged.emis = mergeById(localState.emis, remoteState.emis);

    [
        "currency",
        "currencySymbol",
        "monthlyBudget",
        "cycleType",
        "cycleDay",
        "theme",
        "dailyReminderEnabled",
        "dailyReminderTime",
        "budgetAlertEnabled",
        "budgetAlertThreshold"
    ].forEach(key => {
        if (newerState[key] !== undefined) merged[key] = newerState[key];
    });

    // Treat enabling cards as a shared capability. This avoids a stale device
    // with false overwriting a device that has already enabled card mode.
    merged.creditCardsEnabled = !!localState.creditCardsEnabled || !!remoteState.creditCardsEnabled;
    merged.syncEpoch = remoteState.syncEpoch || localState.syncEpoch;
    merged.syncResetLineage = remoteState.syncResetLineage || localState.syncResetLineage || null;
    merged.syncResetHistory = Array.from(new Set([
        ...(Array.isArray(localState.syncResetHistory) ? localState.syncResetHistory : []),
        ...(Array.isArray(remoteState.syncResetHistory) ? remoteState.syncResetHistory : [])
    ]));
    return merged;
}

function sameSyncArrays(a, b) {
    const arrayKeys = ["categories", "payments", "transactions", "savingGoals", "trips", "recurringExpenses", "emis"];
    const scalarKeys = ["currency", "currencySymbol", "monthlyBudget", "cycleType", "cycleDay", "theme", "creditCardsEnabled"];
    return arrayKeys.every(key => JSON.stringify(a[key] || []) === JSON.stringify(b[key] || [])) &&
        scalarKeys.every(key => (a[key] ?? null) === (b[key] ?? null));
}

/**
 * Internal: applies remote state after conflict resolution decisions are made.
 * isInitialLinkage=true → deduplicate-merge arrays; false → remote overwrites arrays.
 */
async function _applyRemoteSilent(remoteState, isInitialLinkage, token, fileId) {
    if (isInitialLinkage) {
        // Deduplicate merge: combine local + remote arrays by unique id
        const mergeById = (local, remote) => {
            const map = new Map();
            (local || []).forEach(item => map.set(item.id, item));
            (remote || []).forEach(item => { if (!map.has(item.id)) map.set(item.id, item); });
            return Array.from(map.values());
        };
        remoteState.transactions   = mergeById(state.transactions, remoteState.transactions);
        remoteState.savingGoals    = mergeById(state.savingGoals, remoteState.savingGoals);
        remoteState.trips          = mergeById(state.trips, remoteState.trips);
        console.log("Initial linkage: deduplication merge complete.");
    } else {
        console.log("Ongoing sync: remote is source of truth. Overwriting local arrays.");
    }

    applyRemoteState(remoteState, true);

    // Push merged result back to Drive so both sides converge
    if (isInitialLinkage && token && fileId) {
        try {
            await updateSyncFile(token, fileId, JSON.stringify(state));
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
        } catch (e) {
            console.warn("Post-merge push failed:", e);
        }
    }
}

/**
 * Minimalist budget conflict modal — only surfaces budget discrepancy.
 * Calls onResolved(keepRemoteBudget: boolean) when user decides.
 */
function _showBudgetConflictModal(localBudget, remoteBudget, onResolved) {
    const fmt = (v) => (state.currencySymbol || "₹") + Number(v).toLocaleString();
    const div = document.createElement("div");
    div.id = "budgetConflictModal";
    div.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[115] flex items-center justify-center p-4";
    div.innerHTML = `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-xs w-full shadow-2xl space-y-4">
            <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <i data-lucide="wallet" class="w-4 h-4"></i>
                </div>
                <div>
                    <h3 class="text-xs font-extrabold text-white">Budget Mismatch</h3>
                    <p class="text-[10px] text-slate-400">Which monthly budget should apply?</p>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 text-center text-[10px]">
                <button id="_budgetKeepLocal" class="p-2.5 bg-slate-800 border border-slate-700 rounded-xl hover:bg-slate-700 transition-all active:scale-95">
                    <div class="text-slate-400 mb-0.5">This device</div>
                    <div class="text-white font-extrabold text-xs">${fmt(localBudget)}</div>
                </button>
                <button id="_budgetUseRemote" class="p-2.5 bg-indigo-950/50 border border-indigo-500/30 rounded-xl hover:bg-indigo-900/50 transition-all active:scale-95">
                    <div class="text-slate-400 mb-0.5">Cloud</div>
                    <div class="text-white font-extrabold text-xs">${fmt(remoteBudget)}</div>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    if (typeof initLucideIcons === "function") initLucideIcons(div);

    const cleanup = (keepRemote) => { div.remove(); onResolved(keepRemote); };
    document.getElementById("_budgetKeepLocal").onclick = () => cleanup(false);
    document.getElementById("_budgetUseRemote").onclick = () => cleanup(true);
}

/**
 * Replaces local state with remote state, preserving device connection config.
 * Pass silent=true to suppress the notification toast (e.g. background auto-sync).
 */
function applyRemoteState(remoteState, silent = false) {
    // Preserve local connection config before overwriting
    ensureSyncIdentity(state);
    ensureSyncIdentity(remoteState);
    const preservedDeviceId = state.deviceId;
    const preservedBiometricEnabled = !!state.biometricEnabled;
    const preservedBiometricCredentialId = state.biometricCredentialId || "";
    const preservedBiometricUserId = state.biometricUserId || "";
    const preservedBiometricLabel = state.biometricLabel || "";
    const preservedBiometricRegisteredAt = state.biometricRegisteredAt || "";
    const preservedClientId = state.googleClientId || SYNC_DEFAULT_CLIENT_ID;
    const preservedEmail = state.syncUserEmail || remoteState.syncUserEmail || "";
    const preservedFileId = state.syncDriveFileId || "";

    state = normalizeSyncState(remoteState);

    // Restore local device connection config — never inherit from remote
    state.deviceId = preservedDeviceId;
    state.biometricEnabled = preservedBiometricEnabled;
    state.biometricCredentialId = preservedBiometricCredentialId;
    state.biometricUserId = preservedBiometricUserId;
    state.biometricLabel = preservedBiometricLabel;
    state.biometricRegisteredAt = preservedBiometricRegisteredAt;
    state.googleClientId = preservedClientId;
    state.syncUserEmail = preservedEmail;
    state.syncDriveFileId = preservedFileId;
    state.syncEnabled = true;
    state.pendingCloudResetEpoch = "";
    state.lastSyncedAt = new Date().toISOString();
    state.syncStatus = "idle";
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));

    if (!silent) {
        showNotification("Data synchronized from Google Drive.");
    }

    // Re-render UI immediately without a full page reload
    try { updateAppDashboardView(); } catch (e) {}
    try { syncSettingsFormFields(); } catch (e) {}
    try { renderSettingsLists(); } catch (e) {}
    try { renderCreditCardsView(); } catch (e) {}
    try { renderSyncControls(); } catch (e) {}
    try { syncBiometricSettingsUI(); } catch (e) {}
    updateSyncStatus("idle");
}

/**
 * Normalizes Drive sync state without dropping app fields. The backup import
 * normalizer rebuilds a smaller backup shape, so using it here strips live
 * settings like creditCardsEnabled, alert/reminder config, and EMIs.
 */
function normalizeSyncState(remoteState) {
    const src = (remoteState && remoteState.data) ? remoteState.data : (remoteState || {});
    const next = { ...state, ...src };

    next.categories = Array.isArray(src.categories) ? src.categories : (state.categories || []);
    next.payments = Array.isArray(src.payments) ? src.payments : (state.payments || []);
    next.transactions = Array.isArray(src.transactions) ? src.transactions : [];
    next.savingGoals = Array.isArray(src.savingGoals) ? src.savingGoals : [];
    next.recurringExpenses = Array.isArray(src.recurringExpenses) ? src.recurringExpenses : [];
    next.emis = Array.isArray(src.emis) ? src.emis : [];
    next.trips = Array.isArray(src.trips) ? src.trips : [];

    if (next.creditCardsEnabled === undefined) next.creditCardsEnabled = false;
    if (!next.currency) next.currency = "INR";
    if (!next.currencySymbol) next.currencySymbol = "\u20B9";
    if (!next.cycleType) next.cycleType = "calendar";
    if (!next.cycleDay) next.cycleDay = 1;
    if (!next.theme) next.theme = "dark";
    if (!next.pinCode) next.pinCode = "1234";
    if (!next.updatedAt) next.updatedAt = new Date().toISOString();
    if (next.lastSyncedAt === undefined) next.lastSyncedAt = "";
    if (next.syncStatus === undefined) next.syncStatus = "idle";
    if (next.syncUserEmail === undefined) next.syncUserEmail = "";
    if (next.syncDriveFileId === undefined) next.syncDriveFileId = "";
    ensureSyncIdentity(next);
    return next;
}

function summarizeSyncState(target) {
    const count = key => Array.isArray(target && target[key]) ? target[key].length : 0;
    return `${count("transactions")} transactions, ${count("savingGoals")} goals, ${count("trips")} trips, ${count("recurringExpenses")} recurring, ${count("emis")} EMIs`;
}

async function uploadLocalAsSyncSource(token, fileId, epoch, lineage, history) {
    ensureSyncIdentity(state);
    state.syncEpoch = epoch || state.syncEpoch || createSyncId("trex_epoch");
    state.syncResetLineage = lineage || state.syncResetLineage || null;
    state.syncResetHistory = Array.isArray(history) ? history : (state.syncResetHistory || []);
    state.pendingCloudResetEpoch = "";
    state.syncEnabled = true;
    state.updatedAt = new Date().toISOString();
    const content = JSON.stringify(state);
    if (fileId) {
        await updateSyncFile(token, fileId, content);
    } else {
        await createSyncFile(token, content);
    }
    state.lastSyncedAt = new Date().toISOString();
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
    updateSyncStatus("idle");
}

function pauseSyncForReset(epoch) {
    state.syncEnabled = false;
    state.pendingCloudResetEpoch = epoch || "";
    state.syncStatus = "offline";
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
    renderSyncControls();
    updateSyncStatus("offline", "Reset pending");
}

async function resetLocalDeviceNow(marker, token, fileId) {
    try {
        if (marker && token && fileId) {
            const freshState = buildFreshStateAfterReset(marker);
            await updateSyncFile(token, fileId, JSON.stringify(freshState));
        }
    } catch (e) {
        console.error("resetLocalDeviceNow marker resolution failed:", e);
    }
    accessToken = null;
    tokenExpiry = 0;
    localStorage.removeItem("androidWalletState_v4");
    try { sessionStorage.removeItem("trex_onboarding_seen"); } catch (e) {}
    window.location.reload();
}

function showCloudResetMarkerModal(marker, token, fileId) {
    return new Promise(resolve => {
        if (document.getElementById("cloudResetMarkerModal")) {
            document.getElementById("cloudResetMarkerModal").remove();
        }
        const resetAt = marker.resetAt ? new Date(marker.resetAt).toLocaleString() : "recently";
        const div = document.createElement("div");
        div.id = "cloudResetMarkerModal";
        div.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[120] flex items-center justify-center p-4";
        div.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                        <i data-lucide="rotate-ccw" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h3 class="text-sm font-extrabold text-white">Cloud Was Reset</h3>
                        <p class="text-[10px] text-slate-400 mt-0.5">Another device reset TReX ${resetAt}.</p>
                    </div>
                </div>
                <div class="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[10px] text-slate-400 leading-relaxed">
                    This device still has local data: <strong class="text-white">${summarizeSyncState(state)}</strong>. Choose before sync continues.
                </div>
                <div class="flex flex-col gap-2">
                    <button id="btnResetThisDevice" class="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Reset This Device Too
                    </button>
                    <button id="btnMakeLocalMain" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Make This Device Main
                    </button>
                    <button id="btnDecideResetLater" class="w-full bg-slate-800 hover:bg-slate-750 border border-slate-750 text-slate-300 font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Decide Later
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        if (typeof initLucideIcons === "function") initLucideIcons(div);

        document.getElementById("btnResetThisDevice").onclick = async () => {
            div.remove();
            await resetLocalDeviceNow(marker, token, fileId);
            resolve("reset");
        };
        document.getElementById("btnMakeLocalMain").onclick = async () => {
            try {
                await uploadLocalAsSyncSource(token, fileId, marker.syncEpoch, marker.syncResetLineage, marker.syncResetHistory);
                showNotification("This device is now the cloud source.");
            } catch (e) {
                updateSyncStatus("error", e.message || "Failed to update cloud");
            }
            div.remove();
            resolve("local");
        };
        document.getElementById("btnDecideResetLater").onclick = () => {
            pauseSyncForReset(marker.syncEpoch);
            showNotification("Sync paused until you choose how to handle the reset.");
            div.remove();
            resolve("later");
        };
    });
}

function showResetBoundaryConflictModal(remoteState, token, fileId) {
    return new Promise(resolve => {
        if (document.getElementById("resetBoundaryConflictModal")) {
            document.getElementById("resetBoundaryConflictModal").remove();
        }
        const resetAt = remoteState.syncResetLineage && remoteState.syncResetLineage.resetAt
            ? new Date(remoteState.syncResetLineage.resetAt).toLocaleString()
            : "a previous reset";
        const div = document.createElement("div");
        div.id = "resetBoundaryConflictModal";
        div.className = "fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[120] flex items-center justify-center p-4";
        div.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                        <i data-lucide="git-compare" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h3 class="text-sm font-extrabold text-white">Reset Conflict</h3>
                        <p class="text-[10px] text-slate-400 mt-0.5">Cloud has data created after ${resetAt}.</p>
                    </div>
                </div>
                <div class="grid grid-cols-1 gap-2 text-[10px]">
                    <div class="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
                        <div class="text-slate-500 uppercase font-black">This Device</div>
                        <div class="text-slate-200 font-bold mt-1">${summarizeSyncState(state)}</div>
                    </div>
                    <div class="p-3 bg-slate-950/60 rounded-2xl border border-slate-800">
                        <div class="text-slate-500 uppercase font-black">Cloud</div>
                        <div class="text-slate-200 font-bold mt-1">${summarizeSyncState(remoteState)}</div>
                    </div>
                </div>
                <div class="flex flex-col gap-2">
                    <button id="btnUseCloudAfterReset" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Force Cloud
                    </button>
                    <button id="btnUseLocalAfterReset" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Force Local
                    </button>
                    <button id="btnMergeAfterReset" class="w-full bg-amber-600 hover:bg-amber-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Force Merge
                    </button>
                    <button id="btnPauseAfterReset" class="w-full bg-slate-800 hover:bg-slate-750 border border-slate-750 text-slate-300 font-extrabold py-3 px-4 rounded-xl text-xs transition-all active:scale-95">
                        Keep Sync Paused
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
        if (typeof initLucideIcons === "function") initLucideIcons(div);

        document.getElementById("btnUseCloudAfterReset").onclick = () => {
            applyRemoteState(remoteState);
            div.remove();
            resolve("cloud");
        };
        document.getElementById("btnUseLocalAfterReset").onclick = async () => {
            try {
                await uploadLocalAsSyncSource(token, fileId, remoteState.syncEpoch, remoteState.syncResetLineage, remoteState.syncResetHistory);
                showNotification("Cloud replaced with this device's data.");
            } catch (e) {
                updateSyncStatus("error", e.message || "Failed to update cloud");
            }
            div.remove();
            resolve("local");
        };
        document.getElementById("btnMergeAfterReset").onclick = async () => {
            try {
                const mergedState = buildMergedSyncState(state, remoteState);
                mergedState.syncEpoch = remoteState.syncEpoch;
                mergedState.syncResetLineage = remoteState.syncResetLineage || null;
                mergedState.syncResetHistory = remoteState.syncResetHistory || [];
                mergedState.updatedAt = new Date().toISOString();
                applyRemoteState(mergedState, true);
                await updateSyncFile(token, fileId, JSON.stringify(state));
                state.lastSyncedAt = new Date().toISOString();
                localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
                updateSyncStatus("idle");
                showNotification("Local and cloud data force-merged.");
            } catch (e) {
                updateSyncStatus("error", e.message || "Failed to merge");
            }
            div.remove();
            resolve("merge");
        };
        document.getElementById("btnPauseAfterReset").onclick = () => {
            pauseSyncForReset(remoteState.syncEpoch);
            showNotification("Sync paused. Reconnect sync to choose later.");
            div.remove();
            resolve("pause");
        };
    });
}

/**
 * Display sync conflict modal
 */
function showConflictModal(remoteState) {
    createConflictModalUI();

    const localTime = new Date(state.updatedAt).toLocaleString();
    const remoteTime = new Date(remoteState.updatedAt).toLocaleString();
    const localTxs = state.transactions ? state.transactions.length : 0;
    const remoteTxs = remoteState.transactions ? remoteState.transactions.length : 0;

    document.getElementById("conflictLocalTime").textContent = localTime;
    document.getElementById("conflictLocalSummary").textContent = `${localTxs} transactions recorded`;
    document.getElementById("conflictRemoteTime").textContent = remoteTime;
    document.getElementById("conflictRemoteSummary").textContent = `${remoteTxs} transactions recorded`;

    const modal = document.getElementById("syncConflictModal");
    modal.classList.remove("hidden");
    initLucideIcons(modal);

    // Replace Local Click Handler
    document.getElementById("btnConflictReplace").onclick = () => {
        modal.classList.add("hidden");
        applyRemoteState(remoteState);
    };

    // Keep Local Click Handler
    document.getElementById("btnConflictKeepLocal").onclick = async () => {
        modal.classList.add("hidden");
        updateSyncStatus("syncing");
        try {
            const token = await getValidToken(false);
            const fileId = await findSyncFileId(token);
            const content = JSON.stringify(state);
            if (fileId) {
                await updateSyncFile(token, fileId, content);
            } else {
                await createSyncFile(token, content);
            }
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
            showNotification("Cloud database updated with local data.");
        } catch (e) {
            updateSyncStatus("error", e.message || "Failed to update cloud");
        }
    };

    // Cancel Handler
    document.getElementById("btnConflictCancel").onclick = () => {
        modal.classList.add("hidden");
        updateSyncStatus("idle");
        showNotification("Sync cancelled. Local device data preserved.");
    };
}

/**
 * Creates the Conflict Modal HTML elements dynamically in body
 */
function createConflictModalUI() {
    if (document.getElementById("syncConflictModal")) return;
    const div = document.createElement("div");
    div.id = "syncConflictModal";
    div.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4 hidden";
    div.innerHTML = `
        <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <i data-lucide="git-compare" class="w-5 h-5"></i>
                </div>
                <div>
                    <h3 class="text-sm font-extrabold text-white uppercase tracking-wider">Sync Conflict Detected</h3>
                    <p class="text-[10px] text-slate-400 mt-0.5">Choose which version you want to preserve:</p>
                </div>
            </div>
            
            <div class="space-y-2.5">
                <div class="p-3 bg-slate-950 rounded-2xl border border-slate-850 flex justify-between items-center">
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-black">Local Device</span>
                        <span class="text-xs font-bold text-slate-200 block mt-0.5" id="conflictLocalTime">Date</span>
                        <span class="text-[9px] text-slate-400 block mt-0.5" id="conflictLocalSummary">0 transactions</span>
                    </div>
                    <span class="text-xs bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-2 py-1 rounded-lg font-bold">This Device</span>
                </div>
                
                <div class="p-3 bg-slate-950 rounded-2xl border border-slate-850 flex justify-between items-center">
                    <div>
                        <span class="text-[9px] text-slate-500 uppercase font-black">Cloud (Google Drive)</span>
                        <span class="text-xs font-bold text-slate-200 block mt-0.5" id="conflictRemoteTime">Date</span>
                        <span class="text-[9px] text-slate-400 block mt-0.5" id="conflictRemoteSummary">0 transactions</span>
                    </div>
                    <span class="text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2 py-1 rounded-lg font-bold">Newer</span>
                </div>
            </div>
            
            <div class="flex flex-col gap-2 pt-2">
                <button id="btnConflictReplace" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95">
                    Replace Local (Use Cloud Data)
                </button>
                <button id="btnConflictKeepLocal" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95">
                    Keep Local (Overwrite Cloud Data)
                </button>
                <button id="btnConflictCancel" class="w-full bg-slate-800 hover:bg-slate-750 border border-slate-750 text-slate-300 font-extrabold py-3 px-4 rounded-xl text-xs uppercase tracking-wider transition-all active:scale-95">
                    Cancel Sync
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

/**
 * Fetches the authenticated user's email via Google userinfo endpoint.
 * Stores in state.syncUserEmail and persists to localStorage.
 */
async function fetchGoogleUserEmail(token) {
    try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!res.ok) return;
        const info = await res.json();
        if (info.email) {
            state.syncUserEmail = info.email;
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
        }
    } catch (e) {
        console.warn("fetchGoogleUserEmail failed:", e);
    }
}

/**
 * Renders (or hides) the account + Drive file metadata badge in the sync panel.
 * Shows when syncEnabled=true and email/fileId are known.
 */
async function renderSyncMetaBadge() {
    const badge = document.getElementById("syncMetaBadge");
    if (!badge) return;

    if (!state.syncEnabled) {
        badge.classList.add("hidden");
        return;
    }

    if (!state.syncUserEmail) {
        try {
            const token = await getValidToken(false);
            await fetchGoogleUserEmail(token);
        } catch (e) {}
    }

    // Populate email
    const emailEl = document.getElementById("syncMetaEmail");
    if (emailEl) emailEl.textContent = state.syncUserEmail || "—";

    // Populate file ID — fetch live if not cached
    const fileIdEl = document.getElementById("syncMetaFileId");
    if (fileIdEl) {
        if (state.syncDriveFileId) {
            fileIdEl.textContent = state.syncDriveFileId;
        } else {
            fileIdEl.textContent = "Resolving…";
            try {
                const token = await getValidToken(false);
                const fid = await findSyncFileId(token);
                if (fid) {
                    state.syncDriveFileId = fid;
                    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
                    fileIdEl.textContent = fid;
                } else {
                    fileIdEl.textContent = "Not yet created";
                }
            } catch (e) {
                fileIdEl.textContent = "Unavailable";
            }
        }
    }

    badge.classList.remove("hidden");
    if (typeof initLucideIcons === "function") initLucideIcons(badge);
}


/**
 * Updates the sync status indicator dot and text across all .sync-status-text elements.
 * Also updates state.syncStatus and re-renders the header sync icon.
 */
function updateSyncStatus(status, detail = "") {
    state.syncStatus = status;
    const targets = document.querySelectorAll(".sync-status-text");
    targets.forEach(el => {
        if (status === "syncing") {
            el.innerHTML = `<span class="text-indigo-400 font-bold flex items-center gap-1.5"><i data-lucide="refresh-cw" class="w-3.5 h-3.5 animate-spin"></i> Syncing... ${detail}</span>`;
        } else if (status === "error") {
            el.innerHTML = `<span class="text-rose-400 font-bold flex items-center gap-1"><i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> Sync Failed (${detail})</span>`;
        } else if (status === "offline") {
            el.innerHTML = `<span class="text-slate-500 font-bold flex items-center gap-1"><i data-lucide="wifi-off" class="w-3.5 h-3.5"></i> Offline</span>`;
        } else if (status === "idle") {
            const timeStr = state.lastSyncedAt ? formatTimeAgo(state.lastSyncedAt) : "never";
            el.innerHTML = `<span class="text-emerald-400 font-bold flex items-center gap-1"><i data-lucide="cloud-check" class="w-3.5 h-3.5 text-emerald-400"></i> Connected • Synced ${timeStr}</span>`;
        }
    });

    const indicatorDot = document.getElementById("syncIndicatorDot");
    if (indicatorDot) {
        indicatorDot.className = "w-2.5 h-2.5 rounded-full transition-all";
        if (status === "syncing") indicatorDot.classList.add("bg-indigo-400", "animate-pulse");
        else if (status === "error") indicatorDot.classList.add("bg-rose-500");
        else if (status === "offline") indicatorDot.classList.add("bg-slate-600");
        else if (status === "idle") indicatorDot.classList.add("bg-emerald-500");
    }

    if (typeof initLucideIcons === "function") initLucideIcons();
    updateHeaderSyncIcon();
}

/**
 * Updates the header cloud icon button (#headerSyncBtn) to reflect current sync state.
 * Button is ALWAYS visible — never hidden.
 * - sync off:  gray cloud-off → open settings
 * - error/offline: slate cloud-off → open settings
 * - idle:  indigo cloud-check → triggerManualSync()
 * - syncing: spinning refresh-cw
 */
function updateHeaderSyncIcon() {
    const btn = document.getElementById("headerSyncBtn");
    if (!btn) return;

    const iconEl = document.getElementById("headerSyncIcon");
    btn.onclick = null;
    btn.className = "w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 border flex items-center justify-center shadow-lg transition-all";

    if (!state.syncEnabled) {
        btn.classList.add("border-slate-700", "text-slate-500", "hover:text-slate-400");
        btn.title = "Cloud sync off — tap to set up";
        btn.onclick = () => switchScreen("settings");
        if (iconEl) { iconEl.setAttribute("data-lucide", "cloud-off"); iconEl.className = "w-4 h-4"; }
        if (typeof initLucideIcons === "function") initLucideIcons(btn);
        return;
    }

    const status = state.syncStatus || "idle";

    if (status === "idle") {
        btn.classList.add("border-indigo-500/40", "text-indigo-400", "hover:text-indigo-300");
        btn.title = "Synced — tap to sync now";
        btn.onclick = () => triggerManualSync();
        if (iconEl) { iconEl.setAttribute("data-lucide", "cloud-check"); iconEl.className = "w-4 h-4"; }
    } else if (status === "syncing") {
        btn.classList.add("border-indigo-500/40", "text-indigo-400");
        btn.title = "Syncing…";
        if (iconEl) { iconEl.setAttribute("data-lucide", "refresh-cw"); iconEl.className = "w-4 h-4 animate-spin"; }
    } else {
        btn.classList.add("border-slate-700", "text-slate-500", "hover:text-slate-400");
        btn.title = status === "error" ? "Sync error — tap to open settings" : "Offline — tap to open settings";
        btn.onclick = () => switchScreen("settings");
        if (iconEl) { iconEl.setAttribute("data-lucide", "cloud-off"); iconEl.className = "w-4 h-4"; }
    }

    if (typeof initLucideIcons === "function") initLucideIcons(btn);
}

/**
 * Formats timestamps relative to current time
 */
function formatTimeAgo(isoString) {
    if (!isoString) return "never";
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);

    if (diffSecs < 10) return "just now";
    if (diffSecs < 60) return `${diffSecs}s ago`;
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(isoString).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Tab visibility synchronization — fires when user switches back to the app tab
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.syncEnabled && navigator.onLine) {
        syncFromDrive();
    }
});

// Window online/offline status listeners
window.addEventListener("online", () => {
    if (state.syncEnabled) {
        syncFromDrive();
    }
});
window.addEventListener("offline", () => {
    updateSyncStatus("offline");
});

/**
 * Initiates the Google OAuth authorization flow.
 * If no cloud file exists yet → silent upload (no migration modal).
 * If cloud file exists AND local data exists → show migration modal.
 */
async function connectGoogleSync() {
    ensureSyncIdentity(state);
    initGoogleAuth(true);

    let token;
    try {
        token = await getValidToken(true);
    } catch (err) {
        console.error("Connection failed:", err);
        updateSyncStatus("error", err.message || "Auth error");
        return;
    }

    // Fetch + cache user email
    await fetchGoogleUserEmail(token);

    // Check whether a cloud file already exists
    let existingFileId = null;
    try {
        existingFileId = await findSyncFileId(token);
    } catch (e) {
        console.warn("findSyncFileId check failed:", e);
    }

    const hasLocalData = hasMeaningfulLocalData(state);

    if (!existingFileId) {
        // No cloud file → silent upload, no modal needed
        state.syncEnabled = true;
        saveStateToLocalStorage();
        updateSyncStatus("idle");
        showNotification("Google Drive connected!");
        renderSyncControls();
        await pushToDrive();
        // Resolve and cache the newly created file ID
        try {
            const newToken = await getValidToken(false);
            const newFid = await findSyncFileId(newToken);
            if (newFid) state.syncDriveFileId = newFid;
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
        } catch (e) {}
        renderSyncControls();
        renderSyncMetaBadge();
        renderResetDangerZone();
        return;
    }

    // Cloud file exists — ask user how to handle if local data present
    state.syncDriveFileId = existingFileId;
    let remoteState = null;
    try {
        remoteState = await downloadSyncFile(token, existingFileId);
    } catch (e) {
        console.warn("downloadSyncFile check failed:", e);
    }

    if (isResetMarker(remoteState)) {
        await showCloudResetMarkerModal(remoteState, token, existingFileId);
        renderSyncControls();
        renderSyncMetaBadge();
        renderResetDangerZone();
        return;
    }

    if (remoteState && isAcrossResetBoundary(state, remoteState)) {
        await showResetBoundaryConflictModal(remoteState, token, existingFileId);
        renderSyncControls();
        renderSyncMetaBadge();
        renderResetDangerZone();
        return;
    }

    let migrationChoice = "merge";
    if (hasLocalData) {
        migrationChoice = await showMigrationModal();
        if (!migrationChoice) return; // user cancelled
    }

    // Cache the file ID we already looked up
    state.syncEnabled = true;
    saveStateToLocalStorage();
    updateSyncStatus("idle");
    showNotification("Google Drive connected!");
    renderSyncControls();

    if (migrationChoice === "fresh") {
        applyRemoteState(remoteState || await downloadSyncFile(token, existingFileId), false);
    } else {
        await syncFromDrive();
    }
    renderSyncControls();
    renderSyncMetaBadge();
    renderResetDangerZone();
}

/**
 * Disconnects the sync functionality and resets local sync status
 */
function disconnectGoogleSync() {
    customConfirm("Are you sure you want to disconnect Google Drive? Syncing will be disabled, but your data on both this device and Google Drive will remain intact.", "Disconnect Sync", "Disconnect")
        .then(confirmed => {
            if (!confirmed) return;
            state.syncEnabled = false;
            state.lastSyncedAt = "";
            state.syncStatus = "idle";
            accessToken = null;
            saveStateToLocalStorage();
            renderSyncControls();
            updateSyncStatus("offline");
            showNotification("Google Drive disconnected.");
        });
}

/**
 * Triggers a manual sync push/pull cycle
 */
async function triggerManualSync() {
    if (!state.syncEnabled) return;
    showNotification("Sync started...");
    await syncFromDrive(true);
    renderSyncControls();
}

/**
 * Applies and persists a custom client ID
 */
function saveCustomClientId() {
    const val = document.getElementById("settingGoogleClientId").value.trim();
    state.googleClientId = val || "";
    saveStateToLocalStorage();
    showNotification(state.googleClientId ? "Custom Client ID applied." : "Default Client ID restored.");
    initGoogleAuth(true);
    if (state.syncEnabled) {
        syncFromDrive();
    } else {
        renderSyncControls();
    }
}

/**
 * Renders the primary connection and action buttons for Cloud Sync settings
 */
function renderSyncControls() {
    const container = document.getElementById("syncControlsContainer");
    if (!container) return;

    if (state.syncEnabled) {
        container.innerHTML = `
            <button onclick="triggerManualSync()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync Now
            </button>
            <div class="grid grid-cols-1 gap-2">
                <button onclick="disconnectGoogleSync()"
                    class="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Disconnect
                </button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <button onclick="connectGoogleSync()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                <i data-lucide="cloud-upload" class="w-4 h-4"></i> Connect Google Drive
            </button>
        `;
    }

    if (typeof initLucideIcons === "function") {
        initLucideIcons(container);
    }
    renderSyncMetaBadge();
    renderResetDangerZone();
}

/**
 * Renders the dedicated destructive reset section in Settings.
 */
function renderResetDangerZone() {
    const container = document.getElementById("resetDangerZoneContainer");
    if (!container) return;

    const cloudResetDisabled = !state.syncEnabled;
    container.innerHTML = `
        <div class="bg-rose-950/15 p-4 rounded-2xl border border-rose-900/50 space-y-3.5">
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                    <i data-lucide="alert-triangle" class="w-4 h-4"></i>
                </div>
                <div>
                    <h3 class="text-[10px] font-extrabold text-rose-300 uppercase tracking-widest">Destructive Reset Controls</h3>
                    <p class="text-[10px] text-slate-500 leading-relaxed mt-1">Final app-level reset actions. Export a backup first if you need to keep anything.</p>
                </div>
            </div>
            <button onclick="resetSyncData()" ${cloudResetDisabled ? "disabled" : ""}
                class="w-full border border-rose-800/50 text-rose-300 font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${cloudResetDisabled ? "bg-slate-900/50 opacity-45 cursor-not-allowed" : "bg-rose-950/40 hover:bg-rose-900/50 active:scale-95"}">
                <i data-lucide="cloud-off" class="w-3.5 h-3.5"></i> Reset Cloud Sync Only
            </button>
            <p class="text-[9px] text-slate-600 leading-relaxed -mt-1">Clears the cloud backup, leaves a reset marker for other devices, and disconnects this device. Local browser data stays untouched. ${cloudResetDisabled ? "Available after connecting Google Drive." : ""}</p>
            <button onclick="resetAllData()"
                class="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold py-3 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-lg shadow-rose-950/30">
                <i data-lucide="trash-2" class="w-4 h-4"></i> Full Reset: Cloud + Local
            </button>
            <p class="text-[9px] text-rose-200/70 leading-relaxed -mt-1">Clears cloud sync when connected, warns other devices with a reset marker, clears this browser's local app data, clears onboarding state, and reloads fresh.</p>
        </div>
    `;
    if (typeof initLucideIcons === "function") initLucideIcons(container);
}

/* ------------------------------------------------------------------------
   ONBOARDING MODAL — shown once per session when sync is not enabled.
   Uses sessionStorage so it reappears in every incognito/private session.
───────────────────────────────────────────────────────────────────────── */

/**
 * Shows the onboarding sync recommendation modal.
 * Fires on first boot if sync is disabled. Dismissed state is stored in
 * sessionStorage so it retriggers on new tabs/incognito sessions.
 */
function showOnboardingModal() {
    if (document.getElementById("syncOnboardingModal")) return;

    const div = document.createElement("div");
    div.id = "syncOnboardingModal";
    div.className = "fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-[105] flex items-end justify-center p-4 pb-8";
    div.innerHTML = `
        <div class="bg-slate-900 border border-slate-700 rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 animate-slide-up">
            <div class="flex items-start gap-3">
                <div class="w-10 h-10 shrink-0 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mt-0.5">
                    <i data-lucide="shield-alert" class="w-5 h-5"></i>
                </div>
                <div>
                    <h3 class="text-sm font-extrabold text-white leading-tight">Your data is local-only</h3>
                    <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        TReX stores all your data in this browser. If you <strong class="text-amber-400">clear your cache, switch browsers, or use incognito</strong>, your transactions, goals, and settings will be permanently lost.
                    </p>
                </div>
            </div>
            <p class="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
                Connect Google Drive to keep a private, encrypted backup that syncs across your devices — no server required.
            </p>
            <label class="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" id="onboardingDontShowChk"
                    class="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer">
                <span class="text-[10px] text-slate-500 font-semibold">Don't show this reminder again</span>
            </label>
            <div class="flex gap-2">
                <button onclick="document._dismissOnboarding()"
                    class="flex-1 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition-all active:scale-95">
                    Not now
                </button>
                <button onclick="document._dismissOnboarding(); switchScreen('settings'); connectGoogleSync();"
                    class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <i data-lucide="cloud" class="w-3.5 h-3.5"></i> Enable Sync
                </button>
            </div>
        </div>
    `;

    document._dismissOnboarding = () => {
        const chk = document.getElementById("onboardingDontShowChk");
        if (chk && chk.checked) {
            state.hideCloudPrompt = true;
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
        }
        const el = document.getElementById("syncOnboardingModal");
        if (el) el.remove();
        try { sessionStorage.setItem("trex_onboarding_seen", "1"); } catch (e) {}
    };

    document.body.appendChild(div);
    if (typeof initLucideIcons === "function") initLucideIcons(div);
}

/**
 * Called from core.js window.onload — shows onboarding modal if conditions met:
 * - sync is not enabled
 * - not already seen this session (sessionStorage key absent → triggers in incognito)
 */
function checkAndShowOnboardingModal() {
    if (state.syncEnabled) return;
    if (state.hideCloudPrompt === true) return;
    try {
        if (sessionStorage.getItem("trex_onboarding_seen")) return;
    } catch (e) { /* sessionStorage blocked — show anyway */ }
    // Small delay so the dashboard renders first
    setTimeout(showOnboardingModal, 1200);
}

/* ─────────────────────────────────────────────────────────────────────────
   MIGRATION MODAL — shown before OAuth when local data already exists.
   Returns a Promise resolving to "merge", "fresh", or null (cancelled).
───────────────────────────────────────────────────────────────────────── */

function showMigrationModal() {
    return new Promise(resolve => {
        if (document.getElementById("syncMigrationModal")) {
            document.getElementById("syncMigrationModal").remove();
        }

        const txCount = (state.transactions || []).length;
        const goalCount = (state.savingGoals || []).length;

        const div = document.createElement("div");
        div.id = "syncMigrationModal";
        div.className = "fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4";
        div.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                        <i data-lucide="cloud-upload" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <h3 class="text-sm font-extrabold text-white">Connect Google Drive</h3>
                        <p class="text-[10px] text-slate-400 mt-0.5">You have existing local data. Choose how to proceed:</p>
                    </div>
                </div>

                <div class="p-3 bg-slate-950/60 rounded-2xl border border-slate-800 text-[10px] text-slate-400">
                    Local device has <strong class="text-white">${txCount} transaction${txCount !== 1 ? "s" : ""}</strong>
                    and <strong class="text-white">${goalCount} goal${goalCount !== 1 ? "s" : ""}</strong>.
                </div>

                <div class="space-y-2">
                    <button id="btnMigrationMerge"
                        class="w-full text-left p-3.5 bg-indigo-950/50 hover:bg-indigo-950/80 border border-indigo-500/30 rounded-2xl transition-all active:scale-[0.99] group">
                        <span class="text-xs font-extrabold text-indigo-300 flex items-center gap-2">
                            <i data-lucide="upload-cloud" class="w-4 h-4"></i> Merge — Upload local data to Cloud
                        </span>
                        <p class="text-[9px] text-slate-400 mt-1 ml-6">Your current data is pushed to Google Drive. Any existing cloud data is overwritten with this device's version.</p>
                    </button>
                    <button id="btnMigrationFresh"
                        class="w-full text-left p-3.5 bg-slate-950/60 hover:bg-slate-900 border border-slate-800 rounded-2xl transition-all active:scale-[0.99] group">
                        <span class="text-xs font-extrabold text-slate-200 flex items-center gap-2">
                            <i data-lucide="download-cloud" class="w-4 h-4"></i> Fresh Start — Replace with Cloud data
                        </span>
                        <p class="text-[9px] text-slate-400 mt-1 ml-6">Cloud data replaces your local data. Your current local transactions and settings will be overwritten.</p>
                    </button>
                </div>

                <button id="btnMigrationCancel"
                    class="w-full bg-transparent border border-slate-800 text-slate-500 hover:text-slate-300 font-bold py-2 rounded-xl text-[10px] transition-all active:scale-95">
                    Cancel
                </button>
            </div>
        `;

        function cleanup(choice) {
            div.remove();
            resolve(choice);
        }

        document.body.appendChild(div);
        if (typeof initLucideIcons === "function") initLucideIcons(div);

        document.getElementById("btnMigrationMerge").onclick = () => cleanup("merge");
        document.getElementById("btnMigrationFresh").onclick = () => cleanup("fresh");
        document.getElementById("btnMigrationCancel").onclick = () => cleanup(null);
    });
}

/**
 * Deletes the cloud sync file, clears local browser data, and reloads to a
 * fresh default state. Intended for test data / factory reset only.
 */
async function resetAllData() {
    const confirmed = await customConfirm(
        "This will permanently delete your TReX cloud backup and erase all local data on this device, including transactions, settings, trips, goals, recurring expenses, EMIs, and PIN settings. This cannot be undone.",
        "Full Reset: Cloud + Local",
        "Delete Everything"
    );
    if (!confirmed) return;

    updateSyncStatus("syncing", "Full reset...");
    try {
        if (state.syncEnabled || tokenClient || accessToken) {
            ensureSyncIdentity(state);
            const marker = buildResetMarker(state.syncEpoch);
            const token = await getValidToken(false);
            const fileId = await findSyncFileId(token);
            if (fileId) {
                await updateSyncFile(token, fileId, JSON.stringify(marker));
            } else {
                await createSyncFile(token, JSON.stringify(marker));
            }
            console.log("TReX Drive sync file replaced with reset marker during full reset.");
        }
    } catch (e) {
        console.error("resetAllData Drive reset marker failed:", e);
    }

    accessToken = null;
    tokenExpiry = 0;
    localStorage.removeItem("androidWalletState_v4");
    try { sessionStorage.removeItem("trex_onboarding_seen"); } catch (e) {}
    window.location.reload();
}

/* ------------------------------------------------------------------------
   RESET SYNC — deletes the appDataFolder file from Drive, resets local flags.
───────────────────────────────────────────────────────────────────────── */

/**
 * Deletes the TReX sync file from Google Drive appDataFolder
 * and resets all local sync state. Provides a clean slate for re-setup.
 */
async function resetSyncData() {
    const confirmed = await customConfirm(
        "This will permanently delete your TReX backup from Google Drive and disconnect sync on this device. Your local data will remain untouched. This cannot be undone.",
        "Reset Sync Data",
        "Delete & Reset"
    );
    if (!confirmed) return;

    updateSyncStatus("syncing");
    try {
        ensureSyncIdentity(state);
        const marker = buildResetMarker(state.syncEpoch);
        const token = await getValidToken(false);
        const fileId = await findSyncFileId(token);
        if (fileId) {
            await updateSyncFile(token, fileId, JSON.stringify(marker));
        } else {
            await createSyncFile(token, JSON.stringify(marker));
        }
        console.log("TReX Drive sync file replaced with reset marker.");
    } catch (e) {
        console.error("resetSyncData Drive reset marker failed:", e);
        // Still reset local state even if Drive call fails
    }

    // Reset local sync flags
    state.syncEnabled = false;
    state.lastSyncedAt = "";
    state.syncStatus = "idle";
    state.pendingCloudResetEpoch = "";
    accessToken = null;
    tokenExpiry = 0;
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));

    renderSyncControls();
    updateSyncStatus("offline");
    showNotification("Sync data reset. Other devices will be asked how to proceed.");
}
