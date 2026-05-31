/**
 * settings.js — Settings, Categories & Payments
 * TReX � Devour Your Expenses
 *
 * Settings form sync, currency selector, budget/cycle save, credit card
 * toggle, billing day helpers, credit card cycle utilities and snapshot
 * calculations, category CRUD modals, payment account CRUD modals.
 *
 * Dependencies: core.js
 */

function buildCurrencySelectorOptions() {
    const select = document.getElementById("settingCurrency");
    select.innerHTML = "";
    CURRENCIES.forEach(curr => {
        const opt = document.createElement("option");
        opt.value = `${curr.code}|${curr.symbol}`;
        opt.textContent = curr.name;
        select.appendChild(opt);
    });
}

function syncSettingsFormFields() {
    document.getElementById("settingCurrency").value = `${state.currency}|${state.currencySymbol}`;
    const budgetInput = document.getElementById("settingMonthlyBudget");
    if (budgetInput) { budgetInput.value = state.monthlyBudget; budgetInput.placeholder = "e.g. 50,000"; }
    const cycleTypeEl = document.getElementById("settingCycleType");
    if (cycleTypeEl) cycleTypeEl.value = state.cycleType;
    const cycleDayEl = document.getElementById("settingCycleDay");
    if (cycleDayEl) cycleDayEl.value = state.cycleDay;
    const creditCardsToggle = document.getElementById("settingCreditCardsEnabled");
    if (creditCardsToggle) creditCardsToggle.checked = !!state.creditCardsEnabled;
    const lightToggle = document.getElementById("settingLightTheme");
    if (lightToggle) lightToggle.checked = (state.theme || "dark") === "light";
    
    // Cloud Sync Settings
    const clientIdInput = document.getElementById("settingGoogleClientId");
    if (clientIdInput) {
        clientIdInput.value = state.googleClientId || "";
    }
    if (typeof renderSyncControls === "function") {
        renderSyncControls();
    }
    if (typeof updateSyncStatus === "function") {
        updateSyncStatus(state.syncEnabled ? state.syncStatus : "offline");
    }

    toggleCycleDateSelector();
    syncNotificationSettings();
}

function toggleCycleDateSelector() {
    const cycleTypeEl = document.getElementById("settingCycleType");
    const target = document.getElementById("settingCycleDayContainer");
    if (!cycleTypeEl || !target) return; // only present when drawer budget panel is open
    if (cycleTypeEl.value === "salary") {
        target.style.display = "";
    } else {
        target.style.display = "none";
    }
}

function updateCurrencySetting() {
    const composite = document.getElementById("settingCurrency").value.split("|");
    state.currency = composite[0];
    state.currencySymbol = composite[1];
    saveStateToLocalStorage();
    showNotification(`Currency switched to ${state.currency} (${state.currencySymbol}).`);
}

function toggleCreditCardsSetting() {
    state.creditCardsEnabled = document.getElementById("settingCreditCardsEnabled").checked;
    if (state.creditCardsEnabled) {
        backfillMissingCreditCardBillingDays();
        activeCreditCardDueCycleKey = "current";
    } else {
        activeCreditCardId = null;
    }
    syncPaymentBillingDayRequirement("inline");
    syncPaymentBillingDayRequirement("edit");
    saveStateToLocalStorage();
    if (!document.getElementById("cardsView").classList.contains("hidden")) {
        renderCreditCardsView();
    }
    showNotification(state.creditCardsEnabled ? "Credit card mode enabled." : "Credit card mode disabled.");
}

function backfillMissingCreditCardBillingDays() {
    let changed = false;
    state.payments.forEach(pay => {
        const isCreditCard = pay.type === "Credit Card" || pay.type === "CC";
        const missingBillingDay = pay.billingDay === undefined || pay.billingDay === null || pay.billingDay === "";
        if (isCreditCard && missingBillingDay) {
            pay.billingDay = 15;
            changed = true;
        }
    });
    if (changed) {
        saveStateToLocalStorage();
    }
    return changed;
}

function isCreditCardBillingDayRequired(paymentType) {
    return !!state.creditCardsEnabled && (paymentType === "Credit Card" || paymentType === "CC");
}

function syncPaymentBillingDayRequirement(scopeKey) {
    const typeId = scopeKey === "edit" ? "editPayType" : "inlinePayType";
    const fieldId = scopeKey === "edit" ? "editPayBillingDay" : "inlinePayBillingDay";
    const helpId = scopeKey === "edit" ? "editPayBillingDayHelp" : "inlinePayBillingDayHelp";
    const type = document.getElementById(typeId)?.value || "";
    const billingField = document.getElementById(fieldId);
    const help = document.getElementById(helpId);
    const required = isCreditCardBillingDayRequired(type);

    if (!billingField) return;
    billingField.required = required;
    if (required) {
        billingField.setAttribute("aria-required", "true");
    } else {
        billingField.removeAttribute("aria-required");
    }

    if (help) {
        help.textContent = required
            ? "Required for credit cards while credit card mode is enabled."
            : "Recurring day of month for credit cards. Leave blank for now.";
    }
}

function formatBillingDayLabel(day) {
    const n = parseInt(day, 10);
    if (!Number.isFinite(n) || n < 1 || n > 28) return "";
    const suffix = (n % 10 === 1 && n % 100 !== 11) ? "st"
        : (n % 10 === 2 && n % 100 !== 12) ? "nd"
        : (n % 10 === 3 && n % 100 !== 13) ? "rd"
        : "th";
    return `${n}${suffix}`;
}

function getPaymentSummaryLabel(pay) {
    const pieces = [pay.type];
    if (pay.type === "Credit Card" || pay.type === "CC") {
        const billingDayLabel = formatBillingDayLabel(pay.billingDay);
        if (billingDayLabel) pieces.push(`Billing day: ${billingDayLabel}`);
    }
    return pieces.join(" • ");
}

function getMonthKeyFromDate(dateObj) {
    const d = dateObj instanceof Date ? dateObj : new Date(dateObj || getTodayISO());
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getCreditCardAvailableCycles() {
    const seen = new Set();
    state.transactions.forEach(t => {
        if (t.date && t.date.length >= 7) seen.add(t.date.substring(0, 7));
    });
    seen.add(getMonthKeyFromDate(new Date()));

    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    return Array.from(seen)
        .sort((a, b) => b.localeCompare(a))
        .map(key => {
            const [yr, mo] = key.split("-");
            return { key, label: `${months[parseInt(mo, 10) - 1]} ${yr}` };
        });
}

function addDaysToISO(dateISO, days) {
    const d = new Date(`${dateISO}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toLocalISODate(d);
}

function getPreviousBillingBoundaryISO(pay, referenceDate = new Date()) {
    return getBillingBoundaryISO(pay, addDaysToISO(toLocalISODate(referenceDate), -1));
}

function getCreditCardDueRange(pay, cycleKey = "current", referenceDate = new Date()) {
    const billingDay = getPaymentBillingDay(pay);
    if (cycleKey === "current") {
        const endISO = getBillingBoundaryISO(pay, referenceDate);
        // Derive start from endISO directly (same logic as historic path)
        // — subtracting 1 day from referenceDate is unreliable when today >> billingDay
        const endDate = new Date(`${endISO}T00:00:00`);
        let prevYear = endDate.getFullYear();
        let prevMonth = endDate.getMonth() - 1;
        if (prevMonth < 0) { prevMonth = 11; prevYear -= 1; }
        const prevMonthDays = new Date(prevYear, prevMonth + 1, 0).getDate();
        const prevEndISO = toLocalISODate(new Date(prevYear, prevMonth, Math.min(billingDay, prevMonthDays)));
        const startISO = addDaysToISO(prevEndISO, 1);
        return { startISO, endISO, label: "Current cycle" };
    }

    const [yearStr, monthStr] = String(cycleKey).split("-");
    const year = parseInt(yearStr, 10);
    const monthIndex = parseInt(monthStr, 10) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
        return getCreditCardDueRange(pay, "current", referenceDate);
    }

    const endMonthDays = new Date(year, monthIndex + 1, 0).getDate();
    const endISO = toLocalISODate(new Date(year, monthIndex, Math.min(billingDay, endMonthDays)));

    let prevYear = year;
    let prevMonthIndex = monthIndex - 1;
    if (prevMonthIndex < 0) {
        prevMonthIndex = 11;
        prevYear -= 1;
    }
    const prevMonthDays = new Date(prevYear, prevMonthIndex + 1, 0).getDate();
    const prevEndISO = toLocalISODate(new Date(prevYear, prevMonthIndex, Math.min(billingDay, prevMonthDays)));
    const startISO = addDaysToISO(prevEndISO, 1);
    return { startISO, endISO, label: `${new Date(year, monthIndex, 1).toLocaleString(undefined, { month: "long", year: "numeric" })}` };
}

function getCreditCardRecentRange(pay, referenceDate = new Date()) {
    return {
        startISO: addDaysToISO(getBillingBoundaryISO(pay, referenceDate), 1),
        endISO: getTodayISO(),
        label: "Recent cycle"
    };
}

function populateCreditCardCycleSelectors() {
    const cycles = getCreditCardAvailableCycles();
    const currentMonthKey = getMonthKeyFromDate(new Date());
    const options = [{ key: "current", label: "Current Cycle" }, ...cycles.filter(c => c.key !== currentMonthKey)];
    const selectors = [
        document.getElementById("creditCardCycleSelector"),
        document.getElementById("creditCardDetailCycleSelector")
    ];

    selectors.forEach(sel => {
        if (!sel) return;
        const prev = sel.value || activeCreditCardDueCycleKey || "current";
        sel.innerHTML = "";
        options.forEach(cycle => {
            const opt = document.createElement("option");
            opt.value = cycle.key;
            opt.textContent = cycle.label;
            sel.appendChild(opt);
        });
        sel.value = options.some(o => o.key === prev) ? prev : "current";
    });
}

function setCreditCardViewMode(mode, cycleKey) {
    activeCreditCardMode = mode === "recent" ? "recent" : "due";
    if (cycleKey) activeCreditCardDueCycleKey = cycleKey;
    renderCreditCardsView();
}



function isCreditCardPayment(pay) {
    return !!pay && (pay.type === "Credit Card" || pay.type === "CC");
}

function getPaymentBillingDay(pay) {
    const raw = parseInt(pay && pay.billingDay, 10);
    if (Number.isFinite(raw) && raw >= 1 && raw <= 31) return raw;
    return 15;
}

function toLocalISODate(dateObj) {
    const d = dateObj instanceof Date ? new Date(dateObj) : new Date(dateObj || getTodayISO());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getBillingBoundaryISO(pay, referenceDate = new Date()) {
    const billingDay = getPaymentBillingDay(pay);
    const today = referenceDate instanceof Date ? new Date(referenceDate) : new Date(referenceDate || getTodayISO());
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    let boundaryYear = todayYear;
    let boundaryMonth = todayMonth;
    if (todayDay <= billingDay) {
        boundaryMonth -= 1;
        if (boundaryMonth < 0) {
            boundaryMonth = 11;
            boundaryYear -= 1;
        }
    }
    const monthDays = new Date(boundaryYear, boundaryMonth + 1, 0).getDate();
    const boundaryDay = Math.min(billingDay, monthDays);
    return toLocalISODate(new Date(boundaryYear, boundaryMonth, boundaryDay));
}

function getCreditCardBucketSnapshot(pay, dueCycleKey = activeCreditCardDueCycleKey, referenceDate = new Date()) {
    const todayISO = getTodayISO();
    const dueRange = getCreditCardDueRange(pay, dueCycleKey || "current", referenceDate);
    const recentRange = getCreditCardRecentRange(pay, referenceDate);
    const txs = state.transactions
        .filter(tx => tx.paymentId === pay.id && tx.date <= todayISO)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.amount - a.amount));
    const dueTxs = txs.filter(tx => tx.date >= dueRange.startISO && tx.date <= dueRange.endISO);
    const recentTxs = txs.filter(tx => tx.date >= recentRange.startISO && tx.date <= recentRange.endISO);
    return {
        dueRange,
        recentRange,
        dueTxs,
        recentTxs,
        dueTotal: dueTxs.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0),
        recentTotal: recentTxs.reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0)
    };
}

function getCreditCardPortfolioSnapshot(dueCycleKey = activeCreditCardDueCycleKey, referenceDate = new Date()) {
    const cards = state.payments.filter(isCreditCardPayment);
    return cards.reduce((acc, pay) => {
        const bucket = getCreditCardBucketSnapshot(pay, dueCycleKey, referenceDate);
        acc.cards.push({ pay, ...bucket });
        acc.dueTotal += bucket.dueTotal;
        acc.recentTotal += bucket.recentTotal;
        return acc;
    }, { cards: [], dueTotal: 0, recentTotal: 0 });
}

function updateExpensePaymentLockUI() {
    const paymentSelect = document.getElementById("expensePayment");
    const lockNote = document.getElementById("expensePaymentLockNote");
    if (!paymentSelect || !lockNote) return;
    const locked = !!expensePaymentLockId;
    paymentSelect.disabled = locked;
    paymentSelect.classList.toggle("opacity-60", locked);
    paymentSelect.classList.toggle("cursor-not-allowed", locked);
    if (locked) {
        const pay = state.payments.find(p => p.id === expensePaymentLockId);
        lockNote.textContent = pay ? `Payment locked to ${pay.name}.` : "Payment is locked to the selected credit card.";
        lockNote.classList.remove("hidden");
    } else {
        lockNote.classList.add("hidden");
    }
}

function clearExpensePaymentLock() {
    expensePaymentLockId = "";
    updateExpensePaymentLockUI();
}

function applyExpensePaymentLock(paymentId) {
    expensePaymentLockId = paymentId || "";
    const paymentSelect = document.getElementById("expensePayment");
    if (paymentSelect && expensePaymentLockId) {
        paymentSelect.value = expensePaymentLockId;
    }
    updateExpensePaymentLockUI();
}

function saveBudgetAndCycleSettings() {
    const limit = parseFloat(document.getElementById("settingMonthlyBudget").value);
    const cycleType = document.getElementById("settingCycleType").value;
    const cycleDayEl = document.getElementById("settingCycleDay");
    const startDay = cycleDayEl ? parseInt(cycleDayEl.value, 10) : state.cycleDay;

    if (isNaN(limit) || limit <= 0) {
        showNotification("Invalid monthly budget amount.");
        return;
    }

    if (cycleType === "salary" && (isNaN(startDay) || startDay < 1 || startDay > 28)) {
        showNotification("Payday must be between 1 and 28.");
        return;
    }

    state.monthlyBudget = limit;
    state.cycleType = cycleType;
    state.cycleDay = startDay;
    saveStateToLocalStorage();
    showNotification("Budget parameters updated.");
}

function renderSettingsLists() {
    // ── Categories ────────────────────────────────────────────────────────────
    // Guard: only render if the container is currently in the DOM (drawer open)
    const catList = document.getElementById("settingsCategoryList");
    if (catList) {
        catList.innerHTML = "";
        const catBadge = document.getElementById("settingsCatCountBadge");
        if (catBadge) {
            if (state.categories.length > 0) { catBadge.textContent = state.categories.length; catBadge.classList.remove("hidden"); }
            else catBadge.classList.add("hidden");
        }
        const sortedCategories = [...state.categories].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        sortedCategories.forEach(cat => {
            const defPay = state.payments.find(p => p.id === cat.defaultPaymentId) || { name: "None" };
            const row = document.createElement("div");
            row.className = "flex items-center justify-between bg-slate-900 rounded-xl border border-slate-855 text-xs overflow-hidden";
            row.innerHTML = `
                <div style="width:3px;align-self:stretch;background:${cat.color};flex-shrink:0;"></div>
                <div class="flex items-center justify-between flex-1 p-3.5 min-w-0">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="min-w-0">
                        <span class="font-bold text-slate-100 block truncate">${cat.name}</span>
                        <span class="text-[9px] text-slate-500 block truncate mt-0.5">Default Account: ${defPay.name}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="openEditCategoryModal('${cat.id}')" class="p-1.5 hover:bg-slate-850 text-slate-400 rounded">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteCategory('${cat.id}')" class="p-1.5 hover:bg-slate-850 text-rose-400 rounded">
                        <i data-lucide="trash" class="w-4 h-4"></i>
                    </button>
                </div>
                </div>
            `;
            catList.appendChild(row);
        });
    }

    // ── Payments ──────────────────────────────────────────────────────────────
    const payList = document.getElementById("settingsPaymentList");
    if (payList) {
        payList.innerHTML = "";
        const activePayments = state.payments.filter(p => !p.archived);
        const payBadge = document.getElementById("settingsPayCountBadge");
        if (payBadge) {
            if (activePayments.length > 0) { payBadge.textContent = activePayments.length; payBadge.classList.remove("hidden"); }
            else payBadge.classList.add("hidden");
        }
        const sortedPayments = [...activePayments].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
        sortedPayments.forEach(pay => {
            const card = document.createElement("div");
            card.className = "flex items-center justify-between bg-slate-900 rounded-xl border border-slate-855 text-xs overflow-hidden";
            card.innerHTML = `
                <div style="width:3px;align-self:stretch;background:${pay.color};flex-shrink:0;"></div>
                <div class="flex items-center justify-between flex-1 p-3.5">
                <div class="flex items-center gap-2.5">
                    <div>
                        <span class="font-bold text-slate-100 block">${pay.name}</span>
                        <span class="text-[9px] text-slate-500 block mt-0.5">${getPaymentSummaryLabel(pay)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5">
                    <button onclick="openEditPaymentModal('${pay.id}')" class="p-1.5 hover:bg-slate-855 text-slate-400 rounded">
                        <i data-lucide="edit-3" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deletePaymentMethod('${pay.id}')" class="p-1.5 hover:bg-slate-855 text-rose-400 rounded">
                        <i data-lucide="trash" class="w-4 h-4"></i>
                    </button>
                </div>
                </div>
            `;
            payList.appendChild(card);
        });
    }

    initLucideIcons();
    // Recurring and EMI lists are rendered by their own functions (defined in other JS files).
    // Guard against them not being loaded yet.
    if (typeof renderRecurringExpenses === "function") renderRecurringExpenses();
    if (typeof renderEMIsList === "function") renderEMIsList();
}

/* CATEGORIES EDITING */
function openEditCategoryModal(catId) {
    const cat = state.categories.find(c => c.id === catId);
    if (!cat) return;

    document.getElementById("editCatId").value = cat.id;
    document.getElementById("editCatName").value = cat.name;
    document.getElementById("editCatColor").value = cat.color;

    const defPayDropdown = document.getElementById("editCatDefaultPayment");
    defPayDropdown.innerHTML = '<option value="">None (No default pre-select)</option>';
    state.payments.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = `${p.name} (${p.type})`;
        defPayDropdown.appendChild(opt);
    });

    defPayDropdown.value = cat.defaultPaymentId || "";
    document.getElementById("editCategoryModal").classList.remove("hidden");
}

function closeEditCategoryModal() {
    document.getElementById("editCategoryModal").classList.add("hidden");
}

function saveEditCategory() {
    const id = document.getElementById("editCatId").value;
    const name = document.getElementById("editCatName").value.trim();
    const color = document.getElementById("editCatColor").value;
    const defaultPaymentId = document.getElementById("editCatDefaultPayment").value;

    if (!name) {
        showNotification("Name cannot remain blank.");
        return;
    }

    const catIndex = state.categories.findIndex(c => c.id === id);
    if (catIndex !== -1) {
        state.categories[catIndex].name = name;
        state.categories[catIndex].color = color;
        state.categories[catIndex].defaultPaymentId = defaultPaymentId;
        saveStateToLocalStorage();
        renderSettingsLists();
        closeEditCategoryModal();
        showNotification("Category configuration saved.");
    }
}

async function deleteCategory(catId) {
    if (state.categories.length <= 1) {
        showNotification("At least one active category is required.");
        return;
    }

    const inUse = state.transactions.some(t => t.categoryId === catId);
    if (inUse) {
        showNotification("Category contains active data. Clear transactions first.");
        return;
    }

    const cat = state.categories.find(c => c.id === catId);
    const label = cat ? `"${cat.name}"` : "this category";
    if (!await customConfirm(`Delete category ${label}? This cannot be undone.`)) return;

    state.categories = state.categories.filter(c => c.id !== catId);
    saveStateToLocalStorage();
    renderSettingsLists();
    showNotification("Category removed.");
}

/* PAYMENT ACCOUNTS EDITING */
function openEditPaymentModal(payId) {
    const pay = state.payments.find(p => p.id === payId);
    if (!pay) return;

    document.getElementById("editPayId").value = pay.id;
    document.getElementById("editPayName").value = pay.name;
    document.getElementById("editPayType").value = pay.type;
    document.getElementById("editPayBillingDay").value = pay.billingDay ?? "";
    document.getElementById("editPayColor").value = pay.color;

    document.getElementById("editPaymentModal").classList.remove("hidden");
    syncPaymentBillingDayRequirement("edit");
}

function closeEditPaymentModal() {
    document.getElementById("editPaymentModal").classList.add("hidden");
}

function saveEditPayment() {
    const id = document.getElementById("editPayId").value;
    const name = document.getElementById("editPayName").value.trim();
    const type = document.getElementById("editPayType").value;
    const billingDayRaw = document.getElementById("editPayBillingDay").value.trim();
    const billingDay = billingDayRaw ? Math.min(28, Math.max(1, parseInt(billingDayRaw, 10) || 15)) : null;
    const color = document.getElementById("editPayColor").value;

    if (!name) {
        showNotification("Name cannot remain blank.");
        return;
    }
    if (isCreditCardBillingDayRequired(type) && billingDay === null) {
        showNotification("Billing day is required for credit cards.");
        return;
    }

    const payIndex = state.payments.findIndex(p => p.id === id);
    if (payIndex !== -1) {
        state.payments[payIndex].name = name;
        state.payments[payIndex].type = type;
        state.payments[payIndex].billingDay = billingDay;
        state.payments[payIndex].color = color;
        saveStateToLocalStorage();
        renderSettingsLists();
        refreshCreditCardViews();
        closeEditPaymentModal();
        showNotification("Account configuration saved.");
    }
}

async function deletePaymentMethod(payId) {
    const activePayments = state.payments.filter(p => !p.archived);
    if (activePayments.length <= 1) {
        showNotification("At least one active payment account is required.");
        return;
    }

    const pay = state.payments.find(p => p.id === payId);
    const label = pay ? `"${pay.name}"` : "this account";
    if (!await customConfirm(`Delete account ${label}? This cannot be undone.`)) return;

    // Cancel all recurring expenses linked to this payment method
    const linkedRecurring = (state.recurringExpenses || []).filter(r => r.paymentId === payId);
    if (linkedRecurring.length > 0) {
        linkedRecurring.forEach(rec => {
            removeFutureRecurringTransactions(rec.id);
        });
        state.recurringExpenses = state.recurringExpenses.filter(r => r.paymentId !== payId);
    }

    const inUse = state.transactions.some(t => t.paymentId === payId);
    if (inUse) {
        if (pay) {
            pay.archived = true;
        }
        showNotification(linkedRecurring.length > 0
            ? `Account archived. ${linkedRecurring.length} recurring schedule${linkedRecurring.length > 1 ? "s" : ""} cancelled.`
            : "Account archived due to historic transactions.");
    } else {
        state.payments = state.payments.filter(p => p.id !== payId);
        showNotification(linkedRecurring.length > 0
            ? `Account removed. ${linkedRecurring.length} recurring schedule${linkedRecurring.length > 1 ? "s" : ""} cancelled.`
            : "Account removed.");
    }
    saveStateToLocalStorage();
    renderSettingsLists();
    renderRecurringExpenses();
    refreshCreditCardViews();
}

/* ── DRAWER SECTION NAVIGATION ───────────────────────────────────────────────
   openDrawerSection(sectionName) — slides the content sub-panel over the nav,
   rendering the appropriate form or list into #drawerContentBody.
   closeDrawerSection() — slides back to the nav list.
────────────────────────────────────────────────────────────────────────────── */

function openDrawerSection(sectionName) {
    const nav = document.getElementById('drawerNav');
    const content = document.getElementById('drawerContent');
    const body = document.getElementById('drawerContentBody');
    const title = document.getElementById('drawerContentTitle');
    if (!nav || !content || !body || !title) return;

    const sectionTitles = {
        budget:      'Budget & Cycle',
        categories:  'Categories',
        payments:    'Payment Methods',
        creditcards: 'Credit Cards',
        recurring:   'Recurring Expenses',
        emis:        'EMIs',
    };

    title.textContent = sectionTitles[sectionName] || 'Back';
    body.innerHTML = '';

    switch (sectionName) {

        case 'budget': {
            const _curDay = parseInt(state.cycleDay, 10) || 1;
            const _isSalary = state.cycleType === 'salary';
            // Build wheel rows HTML — 28 days max (safe for all months)
            let _wheelRows = '';
            for (let d = 1; d <= 28; d++) {
                _wheelRows += `<div class="wheel-item${d === _curDay ? ' selected' : ''}" data-value="${d}">${d}</div>`;
            }
            body.innerHTML = `
                <div class="drawer-form-section">
                    <label class="drawer-form-label">Monthly Budget Cap</label>
                    <input type="number" id="settingMonthlyBudget" placeholder="e.g. 50000"
                        value="${state.monthlyBudget || ''}"
                        class="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white focus:outline-none" />
                </div>
                <div class="drawer-form-section" style="padding-top:12px;">
                    <label class="drawer-form-label">Budget Reset Cycle</label>
                    <select id="settingCycleType" onchange="toggleCycleDateSelector()"
                        class="w-full app-dropdown rounded-lg text-xs focus:outline-none">
                        <option value="calendar" ${!_isSalary ? 'selected' : ''}>Calendar Month</option>
                        <option value="salary"   ${_isSalary  ? 'selected' : ''}>Payday Cycle</option>
                    </select>
                </div>
                <div id="settingCycleDayContainer" class="drawer-form-section" style="padding-top:12px;${!_isSalary ? 'display:none;' : ''}">
                    <label class="drawer-form-label" style="margin-bottom:8px;">Payday — day of month</label>
                    <!-- Tap-to-open display field -->
                    <div id="cycleDayDisplay" onclick="toggleCycleDayWheel()" style="
                        display:flex; align-items:center; justify-content:space-between;
                        background:#0f172a; border:1px solid #334155; border-radius:10px;
                        padding:11px 14px; cursor:pointer;">
                        <span id="cycleDayDisplayText" style="font-size:0.85rem;font-weight:600;color:#f1f5f9;">Day ${_curDay}</span>
                        <span id="cycleDayChevron" style="font-size:0.7rem;color:#64748b;transition:transform 0.2s;">▼</span>
                    </div>
                    <!-- Collapsed wheel — shown on tap -->
                    <div id="cycleDayWheel" style="
                        display:none; margin-top:6px;
                        position:relative; height:168px; overflow:hidden;
                        border-radius:14px; background:#0f172a;
                        border:1px solid rgba(99,102,241,0.25);
                        user-select:none; -webkit-user-select:none; touch-action:pan-y;">
                        <!-- selection highlight band -->
                        <div style="
                            position:absolute; left:0; right:0;
                            top:50%; transform:translateY(-50%);
                            height:42px; pointer-events:none; z-index:2;
                            background:rgba(99,102,241,0.12);
                            border-top:1px solid rgba(99,102,241,0.4);
                            border-bottom:1px solid rgba(99,102,241,0.4);
                            border-radius:8px; margin:0 12px;"></div>
                        <!-- top fade -->
                        <div style="
                            position:absolute; top:0; left:0; right:0; height:60px;
                            background:linear-gradient(to bottom,#0f172a 0%,transparent 100%);
                            pointer-events:none; z-index:3;"></div>
                        <!-- bottom fade -->
                        <div style="
                            position:absolute; bottom:0; left:0; right:0; height:60px;
                            background:linear-gradient(to top,#0f172a 0%,transparent 100%);
                            pointer-events:none; z-index:3;"></div>
                        <!-- scrollable track -->
                        <div id="cycleDayWheelTrack" style="
                            position:absolute; left:0; right:0;
                            display:flex; flex-direction:column; align-items:center;
                            will-change:transform; cursor:grab;">
                            <div style="height:63px;flex-shrink:0;"></div>
                            ${_wheelRows}
                            <div style="height:63px;flex-shrink:0;"></div>
                        </div>
                    </div>
                    <!-- hidden value field read by saveBudgetAndCycleSettings() -->
                    <input type="hidden" id="settingCycleDay" value="${_curDay}" />
                </div>
                <div class="drawer-form-section" style="padding-top:12px;padding-bottom:4px;">
                    <label class="drawer-form-label">Credit Card Mode</label>
                    <div class="flex items-center justify-between">
                        <span class="text-xs text-slate-400">Enable credit card tab &amp; controls</span>
                        <input type="checkbox" id="settingCreditCardsEnabled" onchange="toggleCreditCardsSetting()"
                            ${state.creditCardsEnabled ? 'checked' : ''}
                            class="w-5 h-5 accent-indigo-500 bg-slate-900 border-slate-800 rounded" />
                    </div>
                </div>
                <button class="drawer-save-btn" onclick="saveBudgetAndCycleSettings()">
                    Save Configuration
                </button>`;
            wrapAllSelects(body);
            // ── Toggle function ───────────────────────────────────────────────
            window._cycleDayWheelOpen = false;
            window.toggleCycleDayWheel = function() {
                const wheel   = body.querySelector('#cycleDayWheel');
                const chevron = body.querySelector('#cycleDayChevron');
                window._cycleDayWheelOpen = !window._cycleDayWheelOpen;
                if (window._cycleDayWheelOpen) {
                    wheel.style.display = 'block';
                    chevron.style.transform = 'rotate(180deg)';
                    // init wheel now that it's visible
                    initCycleDayWheelLogic(body);
                } else {
                    wheel.style.display = 'none';
                    chevron.style.transform = 'rotate(0deg)';
                }
            };
            // ── Wheel logic (deferred until wheel is shown) ───────────────────
            window.initCycleDayWheelLogic = function(container) {
                const ITEM_H = 42;
                const track  = container.querySelector('#cycleDayWheelTrack');
                const hidden = container.querySelector('#settingCycleDay');
                const displayText = container.querySelector('#cycleDayDisplayText');
                if (!track || track._wheelInited) return;
                track._wheelInited = true;
                let currentDay = parseInt(hidden.value, 10) || 1;
                let offsetY = 0, startY = 0, startOffset = 0;
                let isDragging = false, velocity = 0, lastY = 0, lastT = 0;

                function clamp(v) { return Math.min(Math.max(v, -(28 - 1) * ITEM_H), 0); }

                function snapTo(day, animate) {
                    currentDay = Math.min(Math.max(Math.round(day), 1), 28);
                    offsetY = -(currentDay - 1) * ITEM_H;
                    track.style.transition = animate ? 'transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)' : 'none';
                    track.style.transform = `translateY(${offsetY}px)`;
                    hidden.value = currentDay;
                    if (displayText) displayText.textContent = `Day ${currentDay}`;
                    track.querySelectorAll('.wheel-item').forEach(el => {
                        const isSelected = parseInt(el.dataset.value) === currentDay;
                        el.style.color      = isSelected ? '#a5b4fc' : '#94a3b8';
                        el.style.fontWeight = isSelected ? '700' : '400';
                        el.style.fontSize   = isSelected ? '17px' : '14px';
                    });
                }
                snapTo(currentDay, false);

                track.addEventListener('pointerdown', e => {
                    track.style.cursor = 'grabbing';
                    isDragging = true; velocity = 0;
                    startY = e.clientY; startOffset = offsetY;
                    lastY = e.clientY; lastT = Date.now();
                    track.setPointerCapture(e.pointerId);
                    e.preventDefault();
                }, { passive: false });

                track.addEventListener('pointermove', e => {
                    if (!isDragging) return;
                    const dt = Date.now() - lastT;
                    velocity = dt > 0 ? (e.clientY - lastY) / dt : 0;
                    lastY = e.clientY; lastT = Date.now();
                    offsetY = clamp(startOffset + (e.clientY - startY));
                    track.style.transition = 'none';
                    track.style.transform = `translateY(${offsetY}px)`;
                    e.preventDefault();
                }, { passive: false });

                track.addEventListener('pointerup', e => {
                    if (!isDragging) return;
                    isDragging = false;
                    track.style.cursor = 'grab';
                    snapTo(1 + Math.round(-clamp(offsetY + velocity * 120) / ITEM_H), true);
                    e.preventDefault();
                }, { passive: false });

                track.addEventListener('wheel', e => {
                    e.preventDefault();
                    snapTo(currentDay + (e.deltaY > 0 ? 1 : -1), true);
                }, { passive: false });
            };
            break;
        }
            wrapAllSelects(body);
            break;

        case 'categories':
            body.innerHTML = `
                <div style="padding:12px 16px 0; display:flex; justify-content:flex-end;">
                    <button onclick="openInlineCategoryModal()"
                        class="text-[10px] text-indigo-400 font-bold flex items-center gap-1 hover:underline">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add New
                    </button>
                </div>
                <div id="settingsCategoryList" class="space-y-2 p-3 text-slate-100"></div>`;
            initLucideIcons(body);
            renderSettingsLists();
            break;

        case 'payments':
            body.innerHTML = `
                <div style="padding:12px 16px 0; display:flex; justify-content:flex-end;">
                    <button onclick="openInlinePaymentModal()"
                        class="text-[10px] text-indigo-400 font-bold flex items-center gap-1 hover:underline">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add New
                    </button>
                </div>
                <div id="settingsPaymentList" class="space-y-2 p-3"></div>`;
            initLucideIcons(body);
            renderSettingsLists();
            break;

        case 'creditcards': {
            const _ccEnabled = !!state.creditCardsEnabled;
            const _cards = state.payments.filter(p => !p.archived && (p.type === 'Credit Card' || p.type === 'CC'));
            const _sym = state.currencySymbol || '₹';

            // Compute portfolio totals
            let _totalDue = 0, _totalRecent = 0;
            const _buckets = [];
            if (_ccEnabled && _cards.length > 0) {
                _cards.forEach(pay => {
                    const bucket = getCreditCardBucketSnapshot(pay);
                    _totalDue    += bucket.dueTotal || 0;
                    _totalRecent += bucket.recentTotal || 0;
                    _buckets.push({ pay, bucket });
                });
            }

            // Build per-card rows
            let _cardRows = '';
            if (_ccEnabled && _buckets.length > 0) {
                _buckets.forEach(({ pay, bucket }) => {
                    const due    = bucket.dueTotal || 0;
                    const recent = bucket.recentTotal || 0;
                    const billingLabel = pay.billingDay ? `Billing day ${pay.billingDay}` : 'No billing day';
                    _cardRows += `
                    <div style="background:#0f172a;border:1px solid rgba(99,102,241,0.18);border-radius:12px;padding:12px 14px;margin-bottom:8px;display:flex;align-items:stretch;gap:0;overflow:hidden;">
                        <!-- left color bar -->
                        <div style="width:3px;border-radius:3px;background:${pay.color};flex-shrink:0;margin-right:12px;"></div>
                        <div style="flex:1;min-width:0;">
                            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:9px;">
                                <span style="font-size:0.78rem;font-weight:700;color:#f1f5f9;">${pay.name}</span>
                                <span style="font-size:0.6rem;color:#64748b;">${billingLabel}</span>
                            </div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:7px;">
                                <div style="background:#1e293b;border-radius:8px;padding:9px 10px;">
                                    <div style="font-size:0.55rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Due</div>
                                    <div style="font-size:0.9rem;font-weight:700;color:#f87171;">${_sym}${due.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                                </div>
                                <div style="background:#1e293b;border-radius:8px;padding:9px 10px;">
                                    <div style="font-size:0.55rem;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Recent</div>
                                    <div style="font-size:0.9rem;font-weight:700;color:#fb923c;">${_sym}${recent.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                                </div>
                            </div>
                        </div>
                    </div>`;
                });
            } else if (_ccEnabled && _cards.length === 0) {
                _cardRows = `<p style="font-size:0.7rem;color:#475569;text-align:center;padding:16px 0;">No credit cards added yet.<br>Add one via Payment Methods → type "Credit Card".</p>`;
            }

            body.innerHTML = `
                <div style="padding:16px 16px 8px;">
                    <!-- Toggle row -->
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                        <div>
                            <div style="font-size:0.8rem;font-weight:600;color:#e2e8f0;">Credit Card Mode</div>
                            <div style="font-size:0.65rem;color:#64748b;margin-top:2px;">Billing cycles, due tracking &amp; CC tab</div>
                        </div>
                        <label style="position:relative;display:inline-block;width:44px;height:26px;flex-shrink:0;">
                            <input type="checkbox" id="settingCreditCardsEnabled" onchange="toggleCreditCardsSetting(); openDrawerSection('creditcards');"
                                ${_ccEnabled ? 'checked' : ''}
                                style="opacity:0;width:0;height:0;position:absolute;" />
                            <span style="
                                position:absolute;inset:0;border-radius:13px;cursor:pointer;
                                background:${_ccEnabled ? '#4f46e5' : '#1e293b'};
                                border:1px solid ${_ccEnabled ? '#4f46e5' : '#334155'};
                                transition:background 0.2s;"></span>
                            <span style="
                                position:absolute;top:3px;left:${_ccEnabled ? '21px' : '3px'};
                                width:20px;height:20px;border-radius:50%;background:#fff;
                                transition:left 0.2s;box-shadow:0 1px 4px rgba(0,0,0,0.4);"></span>
                        </label>
                    </div>
                    ${_ccEnabled ? `
                    <!-- Divider -->
                    <div style="height:1px;background:rgba(148,163,184,0.1);margin:14px 0 12px;"></div>
                    <!-- Portfolio total -->
                    <div style="background:linear-gradient(135deg,rgba(79,70,229,0.15) 0%,rgba(99,102,241,0.08) 100%);border:1px solid rgba(99,102,241,0.25);border-radius:14px;padding:14px 16px;margin-bottom:14px;">
                        <div style="font-size:0.6rem;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;">Total — All Cards</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div>
                                <div style="font-size:0.6rem;color:#94a3b8;margin-bottom:3px;">Due this cycle</div>
                                <div style="font-size:1.25rem;font-weight:800;color:#f87171;">${_sym}${_totalDue.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                            </div>
                            <div>
                                <div style="font-size:0.6rem;color:#94a3b8;margin-bottom:3px;">Recent spend</div>
                                <div style="font-size:1.25rem;font-weight:800;color:#fb923c;">${_sym}${_totalRecent.toLocaleString('en-IN', {maximumFractionDigits:0})}</div>
                            </div>
                        </div>
                    </div>
                    <!-- Per-card section header -->
                    <div style="font-size:0.6rem;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Cards</div>
                    ${_cardRows}
                    <!-- Go to cards tab -->
                    <button onclick="closeDrawer(); switchScreen('cards');" style="
                        width:100%;margin-top:4px;padding:10px;border-radius:10px;
                        background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);
                        color:#a5b4fc;font-size:0.75rem;font-weight:600;cursor:pointer;">
                        Open Cards Tab →
                    </button>` : ''}
                </div>`;
            break;
        }

        case 'recurring':
            body.innerHTML = `
                <div style="padding:12px 16px 0; display:flex; justify-content:flex-end;">
                    <button onclick="openRecurringModal()"
                        class="text-[10px] text-indigo-400 font-bold flex items-center gap-1 hover:underline">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add
                    </button>
                </div>
                <div id="settingsRecurringList" class="space-y-2.5 p-3 no-scrollbar"></div>
                <p id="settingsRecurringEmpty" class="text-[10px] text-slate-600 text-center py-2 hidden">No recurring expenses configured.</p>`;
            initLucideIcons(body);
            renderSettingsLists();
            break;

        case 'emis':
            body.innerHTML = `
                <div style="padding:12px 16px 0; display:flex; justify-content:flex-end;">
                    <button onclick="openEMIModal()"
                        class="text-[10px] text-indigo-400 font-bold flex items-center gap-1 hover:underline">
                        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Add
                    </button>
                </div>
                <div id="settingsEMIList" class="space-y-2.5 p-3 no-scrollbar"></div>
                <p id="settingsEMIEmpty" class="text-[10px] text-slate-600 text-center py-2 hidden">No credit card EMIs configured.</p>`;
            initLucideIcons(body);
            renderSettingsLists();
            break;

        default:
            body.innerHTML = '<p class="text-xs text-slate-500 p-4">Nothing here yet.</p>';
    }

    // Slide: hide nav, show content
    nav.classList.add('hidden-nav');
    content.classList.add('open');
    initLucideIcons(content);
    wrapAllSelects(content);
}

function closeDrawerSection() {
    const nav = document.getElementById('drawerNav');
    const content = document.getElementById('drawerContent');
    if (nav) nav.classList.remove('hidden-nav');
    if (content) content.classList.remove('open');
}
