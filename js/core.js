/**
 * core.js — App Core
 * DabbuX — Personal Finance Made Personal
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
    { id: "c1", name: "Food & Dining", color: "#f59e0b", defaultPaymentId: "p2" },
    { id: "c2", name: "Transport & Cabs", color: "#3b82f6", defaultPaymentId: "p3" },
    { id: "c3", name: "Rent & Stay", color: "#ec4899", defaultPaymentId: "p1" },
    { id: "c4", name: "Utilities & Subs", color: "#ef4444", defaultPaymentId: "p1" },
    { id: "c5", name: "Entertainment", color: "#8b5cf6", defaultPaymentId: "p2" },
    { id: "c6", name: "Shopping", color: "#10b981", defaultPaymentId: "p1" }
];

const DEFAULT_PAYMENTS = [
    { id: "p1", name: "HDFC Premium Card", type: "Credit Card", limit: 150000, color: "#4f46e5", billingDay: null },
    { id: "p2", name: "Google Pay UPI", type: "UPI", limit: 0, color: "#06b6d4" },
    { id: "p3", name: "Wallet Cash", type: "Cash", limit: 0, color: "#eab308" }
];

const ACTIVE_TRANSACTIONS = [
    { id: "t1", amount: 1500, categoryId: "c1", paymentId: "p2", date: "2026-05-24", note: "Weekly vegetable groceries" },
    { id: "t2", amount: 450, categoryId: "c2", paymentId: "p3", date: "2026-05-24", note: "Auto ride office return" },
    { id: "t3", amount: 15000, categoryId: "c3", paymentId: "p1", date: "2026-05-05", note: "Monthly flat maintenance" },
    { id: "t4", amount: 1200, categoryId: "c4", paymentId: "p1", date: "2026-05-23", note: "Gigabit Broadband" },
    { id: "t5", amount: 3500, categoryId: "c5", paymentId: "p1", date: "2026-05-22", note: "Concert festival ticket" },
    { id: "t6", amount: 1800, categoryId: "c6", paymentId: "p2", date: "2026-05-21", note: "Casual denim shirts" },
    { id: "t7", amount: 800, categoryId: "c1", paymentId: "p2", date: "2026-05-20", note: "Family cafe lunch" },
    { id: "t8", amount: 350, categoryId: "c2", paymentId: "p3", date: "2026-05-19", note: "Metro smartcard recharge" }
];

const HISTORICAL_TRANSACTIONS = [
    { id: "th1", amount: 15000, categoryId: "c3", paymentId: "p1", date: "2026-04-05", note: "Rent House payout" },
    { id: "th2", amount: 6200, categoryId: "c1", paymentId: "p2", date: "2026-04-12", note: "Weekend gourmet diner" },
    { id: "th3", amount: 4800, categoryId: "c6", paymentId: "p1", date: "2026-04-18", note: "Apparel designer shoes" },
    { id: "th4", amount: 1200, categoryId: "c4", paymentId: "p1", date: "2026-04-20", note: "Broadband optic line" },
    { id: "th5", amount: 15000, categoryId: "c3", paymentId: "p1", date: "2026-03-05", note: "Base rent payout" },
    { id: "th6", amount: 8500, categoryId: "c1", paymentId: "p2", date: "2026-03-10", note: "Organic food bulk stores" },
    { id: "th7", amount: 9000, categoryId: "c5", paymentId: "p1", date: "2026-03-15", note: "Spa resort getaway weekend" },
    { id: "th8", amount: 1100, categoryId: "c4", paymentId: "p3", date: "2026-03-18", note: "Purified water delivery" }
];

const DEFAULT_SAVING_GOALS = [
    { id: "g1", name: "Tokyo Vacation Target", target: 120000, current: 65000 },
    { id: "g2", name: "MacBook Pro M4 Pro", target: 200000, current: 155000 }
];

// System configuration defaults (PIN lock disabled on load for clean onboarding)
let state = {
    currency: "INR",
    currencySymbol: "\u20B9",
    monthlyBudget: 50000,
    cycleType: "salary",
    cycleDay: 5,
    creditCardsEnabled: false,
    pinEnabled: false,
    pinCode: "1234",
    categories: [...DEFAULT_CATEGORIES],
    payments: [...DEFAULT_PAYMENTS],
    transactions: [...ACTIVE_TRANSACTIONS, ...HISTORICAL_TRANSACTIONS],
    savingGoals: [...DEFAULT_SAVING_GOALS],
    recurringExpenses: [],
    emis: [],
    trips: [],
    theme: "dark"
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
    syncNotificationSettings();
    if (state.dailyReminderEnabled && Notification.permission === "granted") {
        scheduleDailyReminder();
    }
    try { renderNewTripEmojiPicker(); } catch (e) { }
    wrapAllSelects();
    initLucideIcons();
};

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

function saveStateToLocalStorage() {
    cleanArchivedPayments();
    localStorage.setItem("androidWalletState_v4", JSON.stringify(state));
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
    }

    document.getElementById("screenContainer").scrollTop = 0;
    initLucideIcons();
}

