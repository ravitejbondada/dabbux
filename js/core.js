/**
 * core.js — App Core
 * TReX - Devour Your Expenses
 *
 * Global state, constants, localStorage persistence, app boot (window.onload),
 * switchScreen router, theme, notifications, custom confirm dialog,
 * dropdown wrapper utilities, Lucide icon init.
 *
 * Dependencies: none — must load first.
 * Global state: `state` object is defined here and shared across all modules.
 */

const CURRENCIES = [
    { code: "INR", symbol: "\u20B9", name: "INR (\u20B9) Indian Rupee" },
    { code: "USD", symbol: "$", name: "USD ($) United States Dollar" },
    { code: "EUR", symbol: "\u20AC", name: "EUR (\u20AC) Euro" },
    { code: "GBP", symbol: "\u00A3", name: "GBP (\u00A3) Great Britain Pound" }
];

const DEFAULT_CATEGORIES = [
    { id: "c1", name: "Food & Dining",     color: "#f59e0b", defaultPaymentId: null },
    { id: "c2", name: "Transport",         color: "#3b82f6", defaultPaymentId: null },
    { id: "c3", name: "Rent & Stay",       color: "#ec4899", defaultPaymentId: null },
    { id: "c4", name: "Utilities & Subs",  color: "#ef4444", defaultPaymentId: null },
    { id: "c5", name: "Entertainment",     color: "#8b5cf6", defaultPaymentId: null },
    { id: "c6", name: "Shopping",          color: "#10b981", defaultPaymentId: null }
];

const DEFAULT_PAYMENTS = [
    { id: "p1", name: "Cash",  type: "Cash",        limit: 0, color: "#eab308", billingDay: null },
    { id: "p2", name: "UPI",   type: "UPI",         limit: 0, color: "#06b6d4", billingDay: null },
    { id: "p3", name: "Card",  type: "Debit Card",  limit: 0, color: "#4f46e5", billingDay: null }
];

const DEFAULT_SAVING_GOALS = [];

// Fallback OAuth Client ID — used if state.googleClientId is empty
const DEFAULT_CLIENT_ID = "219866394954-pg9187uvcq3gu0c4l51728m1u1hojt0c.apps.googleusercontent.com";

// System configuration defaults (PIN lock disabled on load for clean onboarding)
let state = {
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
    syncEnabled: false,
    updatedAt: new Date().toISOString(),
    lastSyncedAt: "",
    syncStatus: "idle",
    syncUserEmail: "",
    syncDriveFileId: "",
    googleClientId: "",
    hideCloudPrompt: false,
    budgetAlertsEnabled: false,
    dailyReminderEnabled: false,
    dailyReminderTime: "21:00",
    dailyReminderLastShownDate: "",
    biometricEnabled: false,
    biometricCredentialId: "",
    biometricUserId: "",
    biometricLabel: "",
    biometricRegisteredAt: "",
    deviceId: `trex_device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    syncEpoch: `trex_epoch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    syncResetLineage: null,
    syncResetHistory: [],
    pendingCloudResetEpoch: ""
};

let trendChartInstance = null;
let reportsCategoryChartInstance = null;
let reportsPaymentChartInstance = null;
let reportsBarChartInstance = null;
let reportGaugeChartInstance = null;
let cardAnalyticsChartInstance = null;

let pinAttemptBuffer = "";
let activeTrendPeriod = "weekly";
let activeReportViewMode = "charts";
let activeCreditCardMode = "due";
let activeCreditCardDueCycleKey = "current";
let activeCreditCardId = null;
let expensePaymentLockId = "";
let pendingExpensePaymentLockId = "";
let expenseFormReturnCardId = "";
let activeCardAnalyticsVisible = false;
let emiFormPaymentLockId = "";

window.onload = function () {
    const savedState = localStorage.getItem("androidWalletState_v4");
    if (savedState) {
        try {
            state = JSON.parse(savedState);
        } catch (e) {
            console.error("Local state corrupted. Resetting safely.", e);
        }
    }

    // Sync user preference triggers
    const pinCheckbox = document.getElementById("settingPinEnabled");
    if (pinCheckbox) {
        pinCheckbox.checked = state.pinEnabled === true;
    }

    const lockScreen = document.getElementById("simulatedLockScreen");
    if (state.pinEnabled) {
        lockScreen.classList.remove("hidden");
    } else {
        lockScreen.classList.add("hidden");
    }

    updateAppLockButton();
    buildCurrencySelectorOptions();
    syncSettingsFormFields();
    applyTheme(state.theme || "dark");

    if (!state.recurringExpenses) state.recurringExpenses = [];
    if (!state.emis) state.emis = [];
    if (!state.trips) state.trips = [];
    if (!state.pinCode) state.pinCode = "1234";
    if (!state.theme) state.theme = "dark";
    if (state.creditCardsEnabled === undefined) state.creditCardsEnabled = false;
    if (state.syncEnabled === undefined) state.syncEnabled = false;
    if (state.updatedAt === undefined) state.updatedAt = new Date().toISOString();
    if (state.lastSyncedAt === undefined) state.lastSyncedAt = "";
    if (state.syncStatus === undefined) state.syncStatus = "idle";
    if (state.syncUserEmail === undefined) state.syncUserEmail = "";
    if (state.syncDriveFileId === undefined) state.syncDriveFileId = "";
    if (state.hideCloudPrompt === undefined) state.hideCloudPrompt = false;
    if (state.budgetAlertsEnabled === undefined) state.budgetAlertsEnabled = false;
    if (state.dailyReminderEnabled === undefined) state.dailyReminderEnabled = false;
    if (!state.dailyReminderTime) state.dailyReminderTime = "21:00";
    if (state.dailyReminderLastShownDate === undefined) state.dailyReminderLastShownDate = "";
    if (state.biometricEnabled === undefined) state.biometricEnabled = false;
    if (state.biometricCredentialId === undefined) state.biometricCredentialId = "";
    if (state.biometricUserId === undefined) state.biometricUserId = "";
    if (state.biometricLabel === undefined) state.biometricLabel = "";
    if (state.biometricRegisteredAt === undefined) state.biometricRegisteredAt = "";
    if (!state.deviceId) state.deviceId = `trex_device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (!state.syncEpoch) state.syncEpoch = `trex_epoch_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    if (state.syncResetLineage === undefined) state.syncResetLineage = null;
    if (!Array.isArray(state.syncResetHistory)) state.syncResetHistory = [];
    if (state.pendingCloudResetEpoch === undefined) state.pendingCloudResetEpoch = "";

    /* ── v1.01 MIGRATION ─────────────────────────────────────
       Ensure every trip expense has categoryId + paymentId.
       Ensure every transaction has tripId / tripType / tripRef
       defaulting to null/false so downstream code can rely on them.
    ─────────────────────────────────────────────────────────── */
    state.trips.forEach(trip => {
        if (!trip.expenses) trip.expenses = [];
        trip.expenses.forEach(exp => {
            if (!exp.categoryId) exp.categoryId = null;
            if (!exp.paymentId) exp.paymentId = null;
            if (!exp.type) exp.type = "on";
            if (!exp.ledgerTxId) exp.ledgerTxId = null;
        });
    });
    state.transactions.forEach(tx => {
        if (tx.tripId === undefined) tx.tripId = null;
        if (tx.tripType === undefined) tx.tripType = null;
        if (tx.tripRef === undefined) tx.tripRef = false;
    });
    state.payments.forEach(pay => {
        if (pay.billingDay === undefined) pay.billingDay = null;
    });
    if (state.creditCardsEnabled) {
        backfillMissingCreditCardBillingDays();
    }

    state.recurringExpenses.forEach(rec => {
        if (!rec.startDate) rec.startDate = getTodayISO();
    });

    processRecurringExpenses();
    processEMIs();
    updateAppDashboardView();
    renderQuickLogButtons();
    registerTrexServiceWorker();
    syncNotificationSettings();
    if (state.dailyReminderEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
        checkMissedDailyReminder();
        scheduleDailyReminder();
    }
    try { renderNewTripEmojiPicker(); } catch (e) { }
    if (state.syncEnabled && typeof syncFromDrive === "function") {
        syncFromDrive();
    } else if (typeof updateSyncStatus === "function") {
        updateSyncStatus("offline");
    }
    if (typeof checkAndShowOnboardingModal === "function") {
        checkAndShowOnboardingModal();
    }
    wrapAllSelects();
    initLucideIcons();
    if (typeof updateHeaderSyncIcon === "function") {
        updateHeaderSyncIcon();
    }
    if (typeof syncBiometricSettingsUI === "function") {
        syncBiometricSettingsUI();
    }
};

function registerTrexServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;
    navigator.serviceWorker.register("sw.js")
        .catch(err => console.warn("TReX service worker registration failed:", err));
}

/* ── SELECT WRAPPER — forces app theme on all dropdowns ────────────────
   Wraps every <select class="app-dropdown"> found in the document
   (and any added later via dynamic HTML) in a .select-wrap container
   so our CSS chevron and theme colours override the system picker.
   Called once on init and exposed globally so dynamic screens can call
   it after injecting new <select> elements.
─────────────────────────────────────────────────────────────────────── */
function forceDropdownDarkTheme(sel) {
    if (!sel) return;
    sel.style.colorScheme = "dark";
    Array.from(sel.options || []).forEach(opt => {
        opt.style.backgroundColor = "#0f172a";
        opt.style.color = "#f8fafc";
        opt.style.colorScheme = "dark";
    });
}

function wrapAllSelects(root) {
    const scope = root || document;
    scope.querySelectorAll("select.app-dropdown").forEach(sel => {
        forceDropdownDarkTheme(sel);
        if (sel.parentElement && sel.parentElement.classList.contains("select-wrap")) return;
        const wrapper = document.createElement("div");
        wrapper.className = "select-wrap";
        sel.parentNode.insertBefore(wrapper, sel);
        wrapper.appendChild(sel);
        sel.style.width = "100%";
    });
}

if (window.MutationObserver) {
    const dropdownThemeObserver = new MutationObserver(mutations => {
        const selects = new Set();
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches && node.matches("select.app-dropdown")) selects.add(node);
                if (node.matches && node.matches("option") && node.parentElement && node.parentElement.matches("select.app-dropdown")) {
                    selects.add(node.parentElement);
                }
                if (node.querySelectorAll) {
                    node.querySelectorAll("select.app-dropdown").forEach(sel => selects.add(sel));
                    node.querySelectorAll("option").forEach(opt => {
                        if (opt.parentElement && opt.parentElement.matches("select.app-dropdown")) selects.add(opt.parentElement);
                    });
                }
            });
        });
        selects.forEach(sel => {
            forceDropdownDarkTheme(sel);
            if (!sel.parentElement || !sel.parentElement.classList.contains("select-wrap")) {
                wrapAllSelects(sel.parentElement || document);
            }
        });
    });
    dropdownThemeObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function initLucideIcons(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-lucide]").forEach(el => {
        const existing = el.querySelector("svg");
        if (existing) existing.remove();
    });
    if (typeof lucide !== "undefined" && lucide.createIcons) {
        try {
            lucide.createIcons({ root: scope });
        } catch (e) {
            lucide.createIcons();
        }
    }
    // Always re-wrap any newly injected selects so they get app theming
    wrapAllSelects(scope);
}

function cleanArchivedPayments() {
    try {
        const activePaymentIds = new Set(state.transactions.map(t => t.paymentId));
        state.payments = state.payments.filter(p => !p.archived || activePaymentIds.has(p.id));
    } catch (e) { }
}

let syncTimeout = null;
function debouncedPushToDrive() {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        if (state.syncEnabled && typeof pushToDrive === "function") {
            pushToDrive();
        }
    }, 3000);
}

function saveStateToLocalStorage() {
    cleanArchivedPayments();
    state.updatedAt = new Date().toISOString();
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
    if (state.syncEnabled) {
        debouncedPushToDrive();
    }
}

/* BANNER TOAST MESSAGES */
function showNotification(message) {
    const el = document.getElementById("toastNotification");
    const text = document.getElementById("toastMessage");
    text.textContent = message;

    el.classList.remove("translate-y-24", "opacity-0");
    el.classList.add("translate-y-0", "opacity-100");

    setTimeout(() => {
        el.classList.remove("translate-y-0", "opacity-100");
        el.classList.add("translate-y-24", "opacity-0");
    }, 3000);
}

/**
 * Dark-themed async replacement for native confirm().
 * Usage: if (!await customConfirm("Are you sure?")) return;
 * @param {string} message  - Body text shown in the dialog
 * @param {string} [title]  - Optional heading (default "Confirm Action")
 * @param {string} [okLabel] - Label for the confirm button (default "Delete")
 */
function customConfirm(message, title = "Confirm Action", okLabel = "Delete") {
    return new Promise(resolve => {
        const overlay = document.getElementById("customConfirmOverlay");
        const msgEl = document.getElementById("customConfirmMessage");
        const titleEl = document.getElementById("customConfirmTitle");
        const okBtn = document.getElementById("customConfirmOkBtn");
        const cancelBtn = document.getElementById("customConfirmCancelBtn");

        msgEl.textContent = message;
        titleEl.textContent = title;
        okBtn.textContent = okLabel;

        overlay.classList.add("active");
        initLucideIcons();

        function cleanup(result) {
            overlay.classList.remove("active");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            resolve(result);
        }
        function onOk() { cleanup(true); }
        function onCancel() { cleanup(false); }

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
    });
}

/* CLIENT COLOR THEME SETTINGS */
function applyTheme(theme) {
    state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
    const lightToggle = document.getElementById("settingLightTheme");
    if (lightToggle) lightToggle.checked = theme === "light";
}

function toggleThemeSetting() {
    const isLight = document.getElementById("settingLightTheme").checked;
    applyTheme(isLight ? "light" : "dark");
    saveStateToLocalStorage();
    showNotification(isLight ? "Light theme applied." : "Dark theme applied.");
    initLucideIcons();
}
function switchScreen(viewName) {
    document.querySelectorAll(".view-panel").forEach(p => p.classList.add("hidden"));
    document.getElementById(viewName + "View").classList.remove("hidden");

    // Navigation Tab HIGHLIGHTS
    const navHome = document.getElementById("navHome");
    const navLedger = document.getElementById("navHistory");
    const navGoals = document.getElementById("navGoals");
    const navReports = document.getElementById("navReports");
    const navCards = document.getElementById("navSettings");

    const defaultClass = "flex-1 flex flex-col items-center justify-center h-full text-slate-500 hover:text-slate-300 transition-colors";
    navHome.className = defaultClass;
    navLedger.className = defaultClass;
    navGoals.className = defaultClass;
    navReports.className = defaultClass;
    navCards.className = defaultClass;

    if (viewName === "dashboard") {
        navHome.className = "flex-1 flex flex-col items-center justify-center h-full text-indigo-400";
        updateAppDashboardView();
    } else if (viewName === "addExpense") {
        setupExpenseFormForAdd();
    } else if (viewName === "history") {
        navLedger.className = "flex-1 flex flex-col items-center justify-center h-full text-indigo-400";
        renderHistoryList();
    } else if (viewName === "goals") {
        navGoals.className = "flex-1 flex flex-col items-center justify-center h-full text-indigo-400";
        renderSavingGoalsDedicated();
        renderTripsList();
    } else if (viewName === "tripDetail") {
        navGoals.className = "flex-1 flex flex-col items-center justify-center h-full text-indigo-400";
    } else if (viewName === "reports") {
        navReports.className = "flex-1 flex flex-col items-center justify-center h-full text-indigo-400";
        setTimeout(() => renderHistoricalMonthReport(), 80);
    } else if (viewName === "cards") {
        navCards.className = "flex-1 flex flex-col items-center justify-center h-full text-indigo-400";
        renderCreditCardsView();
    } else if (viewName === "settings") {
        renderSettingsLists();
        if (typeof syncBiometricSettingsUI === "function") syncBiometricSettingsUI();
        if (typeof renderSyncControls === "function") renderSyncControls();
        if (typeof updateSyncStatus === "function") {
            updateSyncStatus(state.syncEnabled ? (state.syncStatus || "idle") : "offline");
        }
    }

    document.getElementById("screenContainer").scrollTop = 0;
    initLucideIcons();
}
