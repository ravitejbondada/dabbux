/**
 * settings.js — Settings, Categories & Payments
 * Trex — Track Expenses
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
    document.getElementById("settingMonthlyBudget").value = state.monthlyBudget;
    document.getElementById("settingCycleType").value = state.cycleType;
    document.getElementById("settingCycleDay").value = state.cycleDay;
    const creditCardsToggle = document.getElementById("settingCreditCardsEnabled");
    if (creditCardsToggle) creditCardsToggle.checked = !!state.creditCardsEnabled;
    const lightToggle = document.getElementById("settingLightTheme");
    if (lightToggle) lightToggle.checked = (state.theme || "dark") === "light";
    toggleCycleDateSelector();
    syncNotificationSettings();
}

function toggleCycleDateSelector() {
    const selectVal = document.getElementById("settingCycleType").value;
    const target = document.getElementById("settingCycleDayContainer");
    if (selectVal === "salary") {
        target.classList.remove("hidden");
    } else {
        target.classList.add("hidden");
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
    const startDay = parseInt(document.getElementById("settingCycleDay").value);

    if (isNaN(limit) || limit <= 0) {
        showNotification("Invalid monthly budget amount.");
        return;
    }

    if (cycleType === "salary" && (isNaN(startDay) || startDay < 1 || startDay > 31)) {
        showNotification("Payday range must exist between 1 and 31.");
        return;
    }

    state.monthlyBudget = limit;
    state.cycleType = cycleType;
    state.cycleDay = startDay;
    saveStateToLocalStorage();
    showNotification("Budget parameters updated.");
}

function renderSettingsLists() {
    // Categories
    const catList = document.getElementById("settingsCategoryList");
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
        row.className = "flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-855 text-xs";
        row.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="w-3 h-3 rounded-full" style="background-color: ${cat.color}"></span>
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
        `;
        catList.appendChild(row);
    });

    // Payments
    const payList = document.getElementById("settingsPaymentList");
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
        card.className = "flex items-center justify-between p-3.5 bg-slate-900 rounded-xl border border-slate-855 text-xs";
        card.innerHTML = `
            <div class="flex items-center gap-2.5">
                <span class="w-3 h-3 rounded-full" style="background-color: ${pay.color}"></span>
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
        `;
        payList.appendChild(card);
    });

    initLucideIcons();
    renderRecurringExpenses();
    renderEMIsList();
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
