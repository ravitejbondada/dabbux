/**
 * backup.js — Data Backup & Restore
 * Trex — Track Expenses
 *
 * JSON and CSV export, JSON and CSV import, state validation,
 * full state restore, CSV parsing helpers, backup payload builder.
 * Future: Google Drive sync hooks belong here.
 *
 * Dependencies: core.js
 */

const BACKUP_FORMAT_VERSION = 1;
const BACKUP_APP_ID = "Trex";

function cloneStateSnapshot() {
    return JSON.parse(JSON.stringify(state));
}

function buildBackupPayload() {
    return {
        backupVersion: BACKUP_FORMAT_VERSION,
        app: BACKUP_APP_ID,
        exportedAt: new Date().toISOString(),
        data: cloneStateSnapshot()
    };
}

function normalizeImportedState(raw) {
    const src = (raw && raw.data) ? raw.data : (raw || {});
    const currency = src.currency || "INR";
    const currencySymbol = src.currencySymbol || "\u20B9";

    return {
        currency,
        currencySymbol,
        monthlyBudget: Number(src.monthlyBudget) || 50000,
        cycleType: src.cycleType === "calendar" ? "calendar" : "salary",
        cycleDay: Math.min(31, Math.max(1, parseInt(src.cycleDay, 10) || 5)),
        pinEnabled: src.pinEnabled !== false && src.pinEnabled !== "false",
        pinCode: String(src.pinCode || "1234").replace(/\D/g, "").slice(0, 4) || "1234",
        theme: src.theme === "light" ? "light" : "dark",
        categories: Array.isArray(src.categories) && src.categories.length
            ? src.categories.map(c => ({
                id: String(c.id),
                name: String(c.name || "Category"),
                color: c.color || "#6366f1",
                defaultPaymentId: c.defaultPaymentId || ""
            }))
            : [...DEFAULT_CATEGORIES],
        payments: Array.isArray(src.payments) && src.payments.length
            ? src.payments.map(p => ({
                id: String(p.id),
                name: String(p.name || "Payment"),
                type: p.type || "Cash",
                limit: Number(p.limit) || 0,
                color: p.color || "#10b981",
                billingDay: p.billingDay === undefined || p.billingDay === null || p.billingDay === ""
                    ? null
                    : Math.min(28, Math.max(1, parseInt(p.billingDay, 10) || 15))
            }))
            : [...DEFAULT_PAYMENTS],
        transactions: Array.isArray(src.transactions)
            ? src.transactions.map(t => ({
                id: String(t.id),
                amount: parseFloat(t.amount) || 0,
                categoryId: String(t.categoryId || ""),
                paymentId: String(t.paymentId || ""),
                date: String(t.date || ""),
                note: t.note || "",
                isRecurring: !!t.isRecurring,
                recurringId: t.recurringId || "",
                tripId:   t.tripId   || null,
                tripType: t.tripType || null,
                tripRef:  !!t.tripRef
            }))
            : [],
        savingGoals: Array.isArray(src.savingGoals)
            ? src.savingGoals.map(g => ({
                id: String(g.id),
                name: String(g.name || "Goal"),
                target: parseFloat(g.target) || 0,
                current: parseFloat(g.current) || 0
            }))
            : [],
        recurringExpenses: Array.isArray(src.recurringExpenses)
            ? src.recurringExpenses.map(r => ({
                id: String(r.id),
                name: String(r.name || "Recurring"),
                amount: parseFloat(r.amount) || 0,
                freq: r.freq || "monthly",
                startDate: r.startDate || "",
                categoryId: String(r.categoryId || ""),
                paymentId: String(r.paymentId || ""),
                note: r.note || "",
                lastProcessed: r.lastProcessed || "",
                createdAt: r.createdAt || "",
                updatedAt: r.updatedAt || ""
            }))
            : [],
        trips: Array.isArray(src.trips) ? src.trips.map(trip => ({
            ...trip,
            expenses: Array.isArray(trip.expenses) ? trip.expenses.map(exp => ({
                ...exp,
                categoryId: exp.categoryId || null,
                paymentId:  exp.paymentId  || null,
                type:       exp.type       || "on",
                ledgerTxId: exp.ledgerTxId || null
            })) : []
        })) : []
    };
}

function isValidBackupPayload(parsed) {
    if (!parsed || typeof parsed !== "object") return false;
    const data = parsed.data || parsed;
    return Array.isArray(data.categories)
        && Array.isArray(data.payments)
        && Array.isArray(data.transactions);
}

function applyFullStateRestore(importedRaw) {
    state = normalizeImportedState(importedRaw);

    /* ── v1.01 MIGRATION on restore ── */
    if (!state.trips) state.trips = [];
    state.trips.forEach(trip => {
        if (!trip.expenses) trip.expenses = [];
        trip.expenses.forEach(exp => {
            if (!exp.categoryId) exp.categoryId = null;
            if (!exp.paymentId)  exp.paymentId  = null;
            if (!exp.type)       exp.type        = "on";
            if (!exp.ledgerTxId) exp.ledgerTxId  = null;
        });
    });
    state.transactions.forEach(tx => {
        if (tx.tripId    === undefined) tx.tripId    = null;
        if (tx.tripType  === undefined) tx.tripType  = null;
        if (tx.tripRef   === undefined) tx.tripRef   = false;
    });
    if (state.creditCardsEnabled) {
        backfillMissingCreditCardBillingDays();
    }

    saveStateToLocalStorage();

    const pinCheckbox = document.getElementById("settingPinEnabled");
    if (pinCheckbox) {
        pinCheckbox.checked = state.pinEnabled === true;
    }

    const lockScreen = document.getElementById("simulatedLockScreen");
    if (state.pinEnabled) {
        lockScreen.classList.remove("hidden");
        pinAttemptBuffer = "";
        updatePinVisualDots();
        lockScreen.classList.remove("opacity-0", "pointer-events-none");
    } else {
        lockScreen.classList.add("hidden");
        unlockApp();
    }

    const lockHint = document.getElementById("lockScreenPinHint");
    if (lockHint) lockHint.textContent = state.pinCode;

    buildCurrencySelectorOptions();
    syncSettingsFormFields();
    applyTheme(state.theme || "dark");
    updateAppLockButton();

    processRecurringExpenses();
    updateAppDashboardView();
    renderRecurringExpenses();
    renderSavingGoalsDedicated();

    if (!document.getElementById("settingsView").classList.contains("hidden")) {
        renderSettingsLists();
    }
    if (!document.getElementById("historyView").classList.contains("hidden")) {
        renderHistoryList();
    }
    if (!document.getElementById("reportsView").classList.contains("hidden")) {
        renderHistoricalMonthReport();
    }

    initLucideIcons();
}

function csvEscape(val) {
    const s = val === null || val === undefined ? "" : String(val);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function csvRow(fields) {
    return fields.map(csvEscape).join(",") + "\n";
}

function parseCSVLine(line) {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                cur += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === "," && !inQuotes) {
            result.push(cur);
            cur = "";
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

function parseBackupCSVSections(text) {
    const sections = {};
    let current = null;
    text.split(/\r?\n/).forEach(rawLine => {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) return;
        const header = line.match(/^\[([A-Z_]+)\]$/);
        if (header) {
            current = header[1];
            sections[current] = [];
            return;
        }
        if (current) sections[current].push(line);
    });
    return sections;
}

function parseSectionTable(sectionLines) {
    if (!sectionLines || sectionLines.length < 2) return [];
    const headers = parseCSVLine(sectionLines[0]);
    const rows = [];
    for (let i = 1; i < sectionLines.length; i++) {
        const cells = parseCSVLine(sectionLines[i]);
        if (!cells.length || cells.every(c => !c)) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = cells[idx] !== undefined ? cells[idx] : ""; });
        rows.push(row);
    }
    return rows;
}

function buildStateFromCSVSections(sections) {
    const draft = {
        categories: [],
        payments: [],
        transactions: [],
        savingGoals: [],
        recurringExpenses: []
    };

    const settingsRows = parseSectionTable(sections.SETTINGS);
    settingsRows.forEach(row => {
        const key = row.key;
        const val = row.value;
        if (key === "monthlyBudget") draft.monthlyBudget = Number(val);
        else if (key === "cycleDay") draft.cycleDay = Number(val);
        else if (key === "pinEnabled") draft.pinEnabled = val === "true";
        else if (key === "currency") draft.currency = val;
        else if (key === "currencySymbol") draft.currencySymbol = val;
        else if (key === "cycleType") draft.cycleType = val;
        else if (key === "pinCode") draft.pinCode = val;
        else if (key === "theme") draft.theme = val;
    });

    parseSectionTable(sections.CATEGORIES).forEach(row => {
        draft.categories.push({
            id: row.id,
            name: row.name,
            color: row.color,
            defaultPaymentId: row.defaultPaymentId || ""
        });
    });

    parseSectionTable(sections.PAYMENTS).forEach(row => {
        draft.payments.push({
            id: row.id,
            name: row.name,
            type: row.type,
            limit: Number(row.limit) || 0,
            color: row.color
        });
    });

    parseSectionTable(sections.TRANSACTIONS).forEach(row => {
        draft.transactions.push({
            id: row.id,
            amount: parseFloat(row.amount) || 0,
            categoryId: row.categoryId,
            paymentId: row.paymentId,
            date: row.date,
            note: row.note,
            isRecurring: row.isRecurring === "true",
            recurringId: row.recurringId || ""
        });
    });

    parseSectionTable(sections.RECURRING_EXPENSES).forEach(row => {
        draft.recurringExpenses.push({
            id: row.id,
            name: row.name,
            amount: parseFloat(row.amount) || 0,
            freq: row.freq || "monthly",
            startDate: row.startDate || "",
            categoryId: row.categoryId,
            paymentId: row.paymentId,
            note: row.note || "",
            lastProcessed: row.lastProcessed || "",
            createdAt: row.createdAt || "",
            updatedAt: row.updatedAt || ""
        });
    });

    parseSectionTable(sections.SAVING_GOALS).forEach(row => {
        draft.savingGoals.push({
            id: row.id,
            name: row.name,
            target: parseFloat(row.target) || 0,
            current: parseFloat(row.current) || 0
        });
    });

    return draft;
}

function downloadBackupFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportDataToJSON() {
    const payload = buildBackupPayload();
    downloadBackupFile(
        `wallet_engine_full_backup_${new Date().toISOString().split("T")[0]}.json`,
        JSON.stringify(payload, null, 2),
        "application/json"
    );
    showNotification("Backup exported (JSON).");
}

function exportDataToCSV() {
    const date = new Date().toISOString().split("T")[0];
    let csv = `# Trex Full Backup v${BACKUP_FORMAT_VERSION}\n`;
    csv += `# ExportedAt,${new Date().toISOString()}\n\n`;

    csv += "[SETTINGS]\n";
    csv += csvRow(["key", "value"]);
    csv += csvRow(["currency", state.currency]);
    csv += csvRow(["currencySymbol", state.currencySymbol]);
    csv += csvRow(["monthlyBudget", state.monthlyBudget]);
    csv += csvRow(["cycleType", state.cycleType]);
    csv += csvRow(["cycleDay", state.cycleDay]);
    csv += csvRow(["pinEnabled", state.pinEnabled]);
    csv += csvRow(["pinCode", state.pinCode]);
    csv += csvRow(["theme", state.theme || "dark"]);
    csv += "\n";

    csv += "[CATEGORIES]\n";
    csv += csvRow(["id", "name", "color", "defaultPaymentId"]);
    state.categories.forEach(c => {
        csv += csvRow([c.id, c.name, c.color, c.defaultPaymentId || ""]);
    });
    csv += "\n";

    csv += "[PAYMENTS]\n";
    csv += csvRow(["id", "name", "type", "limit", "color"]);
    state.payments.forEach(p => {
        csv += csvRow([p.id, p.name, p.type, p.limit, p.color]);
    });
    csv += "\n";

    csv += "[TRANSACTIONS]\n";
    csv += csvRow(["id", "amount", "categoryId", "paymentId", "date", "note", "isRecurring", "recurringId"]);
    state.transactions.forEach(t => {
        csv += csvRow([
            t.id, t.amount, t.categoryId, t.paymentId, t.date, t.note || "",
            t.isRecurring ? "true" : "false", t.recurringId || ""
        ]);
    });
    csv += "\n";

    csv += "[RECURRING_EXPENSES]\n";
    csv += csvRow(["id", "name", "amount", "freq", "startDate", "categoryId", "paymentId", "note", "lastProcessed", "createdAt", "updatedAt"]);
    (state.recurringExpenses || []).forEach(r => {
        csv += csvRow([
            r.id, r.name, r.amount, r.freq, r.startDate || "", r.categoryId, r.paymentId,
            r.note || "", r.lastProcessed || "", r.createdAt || "", r.updatedAt || ""
        ]);
    });
    csv += "\n";

    csv += "[SAVING_GOALS]\n";
    csv += csvRow(["id", "name", "target", "current", "percentComplete"]);
    (state.savingGoals || []).forEach(g => {
        const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
        csv += csvRow([g.id, g.name, g.target, g.current, pct]);
    });

    downloadBackupFile(`wallet_engine_full_backup_${date}.csv`, csv, "text/csv;charset=utf-8;");
    showNotification("Backup exported (CSV).");
}

function importBackupFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const text = evt.target.result;
            const lower = file.name.toLowerCase();

            if (lower.endsWith(".json")) {
                const parsed = JSON.parse(text);
                if (!isValidBackupPayload(parsed)) {
                    showNotification("Invalid JSON backup file.");
                    return;
                }
                applyFullStateRestore(parsed);
                showNotification("Wallet restored (JSON).");
            } else if (lower.endsWith(".csv")) {
                const sections = parseBackupCSVSections(text);
                if (!sections.SETTINGS && !sections.CATEGORIES) {
                    showNotification("Invalid CSV backup structure.");
                    return;
                }
                const draft = buildStateFromCSVSections(sections);
                if (!draft.categories.length && !draft.payments.length) {
                    showNotification("Backup lacks categories/payments.");
                    return;
                }
                applyFullStateRestore(draft);
                showNotification("Wallet restored (CSV).");
            } else {
                showNotification("Unsupported file format.");
            }
        } catch (err) {
            console.error(err);
            showNotification("Failed to import backup file.");
        }
        e.target.value = "";
    };
    reader.readAsText(file);
}
