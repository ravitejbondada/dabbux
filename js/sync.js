/**
 * sync.js — Google Drive AppData Sync Engine
 * DabbuX — Personal Finance Made Personal
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

// Default client ID can be overridden via state.googleClientId in UI
const DEFAULT_CLIENT_ID = "524956321287-k57fkvb1q1sc4s28o9c6p9o1j3p0l4h2.apps.googleusercontent.com";

/**
 * Initialize Google Identity Services token client
 */
function initGoogleAuth(forceInteractive = false) {
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) {
        console.warn("Google GIS SDK not loaded yet.");
        updateSyncStatus("error", "SDK loading");
        return;
    }

    const clientId = state.googleClientId || DEFAULT_CLIENT_ID;
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.appdata",
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
 * Finds the file ID of DabbuX sync file in appDataFolder
 */
async function findSyncFileId(token) {
    const query = encodeURIComponent("name = 'dabbux_sync_v4.json' and 'appDataFolder' in parents and trashed = false");
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
            name: "dabbux_sync_v4.json",
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
        // Save state avoiding sync loop
        localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
        updateSyncStatus("idle");
        console.log("DabbuX successfully pushed local data to Drive.");
    } catch (e) {
        console.error("pushToDrive error:", e);
        updateSyncStatus("error", e.message || "Failed to push");
    }
}

/**
 * Pulls and synchronizes data from Google Drive
 */
async function syncFromDrive() {
    if (!state.syncEnabled) return;
    updateSyncStatus("syncing");
    try {
        const token = await getValidToken(false);
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
        if (!remoteState || !remoteState.updatedAt) {
            console.warn("Remote state corrupted or invalid. Overwriting remote with local data.");
            await updateSyncFile(token, fileId, JSON.stringify(state));
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
            return;
        }

        const localTime = new Date(state.updatedAt).getTime();
        const remoteTime = new Date(remoteState.updatedAt).getTime();

        if (remoteTime === localTime) {
            console.log("Local and remote state are in sync.");
            state.lastSyncedAt = new Date().toISOString();
            localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
            updateSyncStatus("idle");
        } else if (remoteTime > localTime) {
            // New Device / First Run scenario
            const isLocalEmpty = state.transactions.length === 0 && state.savingGoals.length === 0;
            if (isLocalEmpty) {
                console.log("New device detected. Merging remote state onto empty local device.");
                applyRemoteState(remoteState);
            } else {
                // Real conflict
                showConflictModal(remoteState);
            }
        } else {
            // Local is newer: push to cloud
            console.log("Local state is newer. Uploading local state to Google Drive.");
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
 * Replaces local state with remote state
 */
function applyRemoteState(remoteState) {
    if (typeof normalizeImportedState === "function") {
        state = normalizeImportedState(remoteState);
    } else {
        state = remoteState;
    }
    state.lastSyncedAt = new Date().toISOString();
    state.syncStatus = "idle";
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));

    showNotification("Data synchronized from Google Drive successfully!");
    setTimeout(() => {
        window.location.reload();
    }, 1500);
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
 * Updates UI displays representing sync status
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

    if (typeof initLucideIcons === "function") {
        initLucideIcons();
    }
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

// Window focus synchronization listener
window.addEventListener("focus", () => {
    if (state.syncEnabled && navigator.onLine) {
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
 * Initiates the Google OAuth authorization flow manually.
 * If local data exists, prompts user to Merge or Fresh Start before OAuth.
 */
async function connectGoogleSync() {
    const hasLocalData = (state.transactions && state.transactions.length > 0) ||
                         (state.savingGoals && state.savingGoals.length > 0) ||
                         (state.recurringExpenses && state.recurringExpenses.length > 0);

    let migrationChoice = "merge"; // default
    if (hasLocalData) {
        migrationChoice = await showMigrationModal();
        if (!migrationChoice) return; // user cancelled
    }

    initGoogleAuth(true);

    // Store choice so the callback in initGoogleAuth can act on it
    window._pendingSyncMigration = migrationChoice;

    getValidToken(true)
        .then(async () => {
            // Token obtained — now safe to commit sync as enabled
            state.syncEnabled = true;
            saveStateToLocalStorage();
            updateSyncStatus("idle");
            showNotification("Google Drive connected!");
            renderSyncControls();

            if (window._pendingSyncMigration === "fresh") {
                // Fresh Start: pull remote data and overwrite local
                await syncFromDrive();
            } else {
                // Merge: push local data up to Drive (syncFromDrive handles if remote newer)
                await pushToDrive();
            }
            window._pendingSyncMigration = null;
            renderSyncControls();
        })
        .catch(err => {
            window._pendingSyncMigration = null;
            console.error("Connection failed:", err);
            updateSyncStatus("error", err.message || "Auth error");
        });
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
    await syncFromDrive();
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
    container.innerHTML = "";

    if (state.syncEnabled) {
        container.innerHTML = `
            <button onclick="triggerManualSync()"
                class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                <i data-lucide="refresh-cw" class="w-4 h-4"></i> Sync Now
            </button>
            <div class="grid grid-cols-2 gap-2">
                <button onclick="disconnectGoogleSync()"
                    class="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Disconnect
                </button>
                <button onclick="resetSyncData()"
                    class="bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 text-rose-400 font-bold py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 active:scale-95">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Reset Sync
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
}

/* ─────────────────────────────────────────────────────────────────────────
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
                        DabbuX stores all your data in this browser. If you <strong class="text-amber-400">clear your cache, switch browsers, or use incognito</strong>, your transactions, goals, and settings will be permanently lost.
                    </p>
                </div>
            </div>
            <p class="text-[10px] text-slate-500 leading-relaxed border-t border-slate-800 pt-3">
                Connect Google Drive to keep a private, encrypted backup that syncs across your devices — no server required.
            </p>
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
        const el = document.getElementById("syncOnboardingModal");
        if (el) el.remove();
        try { sessionStorage.setItem("dabbux_onboarding_seen", "1"); } catch (e) {}
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
    try {
        if (sessionStorage.getItem("dabbux_onboarding_seen")) return;
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

/* ─────────────────────────────────────────────────────────────────────────
   RESET SYNC — deletes the appDataFolder file from Drive, resets local flags.
───────────────────────────────────────────────────────────────────────── */

/**
 * Deletes the DabbuX sync file from Google Drive appDataFolder
 * and resets all local sync state. Provides a clean slate for re-setup.
 */
async function resetSyncData() {
    const confirmed = await customConfirm(
        "This will permanently delete your DabbuX backup from Google Drive and disconnect sync on this device. Your local data will remain untouched. This cannot be undone.",
        "Reset Sync Data",
        "Delete & Reset"
    );
    if (!confirmed) return;

    updateSyncStatus("syncing");
    try {
        const token = await getValidToken(false);
        const fileId = await findSyncFileId(token);
        if (fileId) {
            const delUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
            await fetchWithRetry(delUrl, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            });
            console.log("DabbuX Drive sync file deleted.");
        }
    } catch (e) {
        console.error("resetSyncData Drive delete failed:", e);
        // Still reset local state even if Drive call fails
    }

    // Reset local sync flags
    state.syncEnabled = false;
    state.lastSyncedAt = "";
    state.syncStatus = "idle";
    accessToken = null;
    tokenExpiry = 0;
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));

    renderSyncControls();
    updateSyncStatus("offline");
    showNotification("Sync data reset. Google Drive backup deleted.");
}
