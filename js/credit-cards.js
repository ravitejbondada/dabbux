/**
 * credit-cards.js — Credit Card View & Analytics
 * TReX � Devour Your Expenses
 *
 * Credit card view renderer, card detail panel, transaction row rendering,
 * payment lock helpers for expense form, card analytics chart (Chart.js).
 *
 * Dependencies: core.js, settings.js (billing day helpers)
 */

function refreshCreditCardViews() {
    if (!document.getElementById("cardsView").classList.contains("hidden")) {
        renderCreditCardsView();
    }
}

function openCreditCardDetail(payId) {
    activeCreditCardId = payId;
    renderCreditCardsView();
}

function closeCreditCardDetail() {
    activeCreditCardId = null;
    renderCreditCardsView();
}

function openExpenseFromCreditCard() {
    if (!activeCreditCardId) return;
    pendingExpensePaymentLockId = activeCreditCardId;
    expenseFormReturnCardId = activeCreditCardId;
    switchScreen("addExpense");
}

function loadExpenseToFormForEditFromCreditCard(txId, payId) {
    loadExpenseToFormForEdit(txId, payId || "");
}

function renderCreditCardTransactionRows(container, txs, pay) {
    if (!container) return;
    const sym = state.currencySymbol || "₹";
    if (txs.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-900/40 border border-slate-850 rounded-2xl p-4 text-center">
                <p class="text-[11px] text-slate-500">No spends in this bucket yet.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = txs.map(tx => {
        const cat = state.categories.find(c => c.id === tx.categoryId) || { name: "Other", color: "#64748b" };
        const dateText = formatDateReadable(new Date(tx.date), { year: "2-digit" });
        const tripBadge = tx.tripRef
            ? `<span class="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-950 text-amber-400 font-bold uppercase shrink-0">${tx.tripType === "pre" ? "Pre-Trip" : "Trip"}</span>`
            : "";
        const actionButtons = tx.tripRef
            ? `<span class="p-1 text-slate-700" title="Managed via Trip"><i data-lucide="lock" class="w-3.5 h-3.5"></i></span>`
            : `<button onclick="loadExpenseToFormForEditFromCreditCard('${tx.id}', '${pay.id}')" class="p-1 text-slate-600 hover:text-indigo-400 rounded hover:bg-slate-950 transition-all" title="Edit">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="event.stopPropagation(); deleteTransaction('${tx.id}')" class="p-1 text-slate-600 hover:text-rose-400 rounded hover:bg-slate-950 transition-all" title="Delete">
                        <i data-lucide="trash" class="w-3.5 h-3.5"></i>
                    </button>`;
        const badgesHtml = tripBadge ? `<div class="flex items-center gap-1.5 flex-wrap">${tripBadge}</div>` : "";
        return `
            <div class="bg-slate-900/60 border border-slate-850 rounded-2xl p-3 flex justify-between items-stretch gap-2.5 transition-all">
                <div class="flex items-stretch gap-2.5 min-w-0 flex-1">
                    <span class="w-1 self-stretch rounded-full shrink-0" style="background-color: ${cat.color}"></span>
                    <div class="min-w-0 flex-1 space-y-2">
                        ${badgesHtml}
                        <div class="min-w-0">
                            <p class="text-[11px] font-bold text-slate-100 truncate">${tx.note || "No note"}</p>
                            <p class="text-[9px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                <span class="inline-flex items-center gap-1 rounded-md bg-slate-950 px-1.5 py-0.5">${dateText}</span>
                                <span class="inline-flex items-center gap-1 rounded-md bg-slate-950 px-1.5 py-0.5">
                                    <span class="w-2 h-2 rounded-full" style="background-color:${cat.color}"></span>
                                    ${cat.name}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>
                <div class="flex flex-col items-end gap-1.5 shrink-0 ml-1">
                    <span class="text-xs font-black text-indigo-300">${sym}${tx.amount.toLocaleString()}</span>
                    <div class="flex items-center gap-1">
                        ${actionButtons}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    initLucideIcons(container);
}

function renderCreditCardDetailView(pay, snapshot) {
    const detailPanel = document.getElementById("creditCardDetailPanel");
    const overviewPanel = document.getElementById("creditCardOverviewPanel");
    const detailTitle = document.getElementById("creditCardDetailTitle");
    const detailSubtitle = document.getElementById("creditCardDetailSubtitle");
    const dueBtn = document.getElementById("creditDetailDueTabBtn");
    const recentBtn = document.getElementById("creditDetailRecentTabBtn");
    const summaryAmount = document.getElementById("creditCardDetailSummaryAmount");
    const summaryNote = document.getElementById("creditCardDetailSummaryNote");
    const countBadge = document.getElementById("creditCardDetailCountBadge");
    const list = document.getElementById("creditCardDetailTxList");
    const cycleSelector = document.getElementById("creditCardDetailCycleSelector");
    if (!detailPanel || !overviewPanel || !pay) return;

    overviewPanel.classList.add("hidden");
    detailPanel.classList.remove("hidden");

    if (detailTitle) detailTitle.textContent = pay.name;
    if (detailSubtitle) detailSubtitle.textContent = `Bills on ${formatBillingDayLabel(pay.billingDay) || "15th"}`;

    if (dueBtn && recentBtn) {
        if (activeCreditCardMode === "due") {
            dueBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all bg-indigo-600 text-white flex items-center justify-center gap-1.5";
            recentBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all text-slate-400 hover:text-white flex items-center justify-center gap-1.5";
        } else {
            dueBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all text-slate-400 hover:text-white flex items-center justify-center gap-1.5";
            recentBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all bg-indigo-600 text-white flex items-center justify-center gap-1.5";
        }
    }

    const detailCycleSelectorContainer = document.getElementById("creditCardDetailCycleSelectorContainer");
    if (detailCycleSelectorContainer) {
        if (activeCreditCardMode === "due") {
            detailCycleSelectorContainer.classList.remove("hidden");
        } else {
            detailCycleSelectorContainer.classList.add("hidden");
        }
    }

    const currentTxs = activeCreditCardMode === "recent" ? snapshot.recentTxs : snapshot.dueTxs;
    if (summaryAmount) {
        const total = activeCreditCardMode === "recent" ? snapshot.recentTotal : snapshot.dueTotal;
        summaryAmount.textContent = `${state.currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (summaryNote) {
        summaryNote.textContent = activeCreditCardMode === "recent"
            ? `Open cycle after ${formatBillingDayLabel(pay.billingDay) || "15th"} is still live.`
            : `${snapshot.dueRange?.label || "Current cycle"} due window.`;
    }
    if (countBadge) countBadge.textContent = `${currentTxs.length} item${currentTxs.length === 1 ? "" : "s"}`;
    if (cycleSelector) cycleSelector.value = activeCreditCardDueCycleKey || "current";

    renderCreditCardTransactionRows(list, currentTxs, pay);

    // Render specific EMIs for this card
    const cardEMIList = document.getElementById("cardEMIList");
    const cardEMIContainer = document.getElementById("cardEMIContainer");
    const cardEMICountBadge = document.getElementById("cardEMICountBadge");
    if (cardEMIList) {
        const cardEmis = (state.emis || []).filter(e => e.paymentId === pay.id);
        if (cardEMICountBadge) cardEMICountBadge.textContent = cardEmis.length;
        if (cardEmis.length === 0) {
            // Hide container if no EMIs
            if (cardEMIContainer) cardEMIContainer.classList.add("hidden");
            cardEMIList.innerHTML = `<p class="text-[10px] text-slate-500 italic text-center py-2">No active EMIs on this card.</p>`;
        } else {
            // Show container if EMIs exist
            if (cardEMIContainer) cardEMIContainer.classList.remove("hidden");
            const sym = state.currencySymbol || "₹";
            cardEMIList.innerHTML = cardEmis.map(e => {
                const paidCount = e.postedInstallments ? e.postedInstallments.length : 0;
                const pct = Math.min(100, (paidCount / e.tenure) * 100);
                const remainingAmount = Math.max(0, e.totalPayable - (e.emiAmount * paidCount));
                return `
                    <div class="bg-slate-950 border border-slate-850 rounded-xl p-3 space-y-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="text-[11px] font-bold text-slate-200">${e.name}</p>
                                <p class="text-[9px] text-slate-500 mt-0.5">${paidCount} of ${e.tenure} months paid</p>
                            </div>
                            <div class="text-right">
                                <p class="text-xs font-black text-rose-400">${sym}${e.emiAmount.toLocaleString(undefined, {maximumFractionDigits:0})}/mo</p>
                                <p class="text-[9px] text-slate-500 mt-0.5">Remaining: ${sym}${remainingAmount.toLocaleString(undefined, {maximumFractionDigits:0})}</p>
                            </div>
                        </div>
                        <div class="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                            <div class="bg-rose-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
                        </div>
                        <div class="flex gap-2 pt-0.5">
                            <button onclick="openEMIScheduleModal('${e.id}')" class="flex-1 bg-slate-900 hover:bg-slate-800 text-[9px] text-indigo-300 font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1">
                                <i data-lucide="calendar-days" class="w-3 h-3"></i> Schedule
                            </button>
                            <button onclick="openEMIModal('${e.id}')" class="flex-1 bg-slate-900 hover:bg-slate-800 text-[9px] text-indigo-400 font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1">
                                <i data-lucide="pencil" class="w-3 h-3"></i> Edit
                            </button>
                            <button onclick="deleteEMI('${e.id}')" class="flex-1 bg-slate-900 hover:bg-slate-800 text-[9px] text-rose-400 font-bold py-2 rounded-lg transition-all flex items-center justify-center gap-1">
                                <i data-lucide="trash" class="w-3 h-3"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }

    // Sync Analytics toggles & rendering
    const analyticsContent = document.getElementById("cardAnalyticsContent");
    const toggleBtn = document.getElementById("toggleCardAnalyticsBtn");
    if (analyticsContent && toggleBtn) {
        if (activeCardAnalyticsVisible) {
            analyticsContent.classList.remove("hidden");
            toggleBtn.textContent = "Hide";
            renderCardAnalyticsChart();
        } else {
            analyticsContent.classList.add("hidden");
            toggleBtn.textContent = "Show";
        }
    }
}



function renderCreditCardsView() {
    const dueBtn = document.getElementById("creditDueTabBtn");
    const recentBtn = document.getElementById("creditRecentTabBtn");

    const summaryAmount = document.getElementById("creditCardSummaryAmount");
    const summaryNote = document.getElementById("creditCardSummaryNote");
    const countBadge = document.getElementById("creditCardCountBadge");
    const tiles = document.getElementById("creditCardTiles");
    const detailPanel = document.getElementById("creditCardDetailPanel");
    const overviewPanel = document.getElementById("creditCardOverviewPanel");
    const overviewCycleSelector = document.getElementById("creditCardCycleSelector");
    const detailCycleSelector = document.getElementById("creditCardDetailCycleSelector");
    if (!tiles || !detailPanel || !overviewPanel) return;

    const cards = state.payments.filter(isCreditCardPayment);
    cards.sort((a, b) => {
        const snapA = getCreditCardBucketSnapshot(a, activeCreditCardDueCycleKey);
        const snapB = getCreditCardBucketSnapshot(b, activeCreditCardDueCycleKey);
        const amtA = activeCreditCardMode === "recent" ? snapA.recentTotal : snapA.dueTotal;
        const amtB = activeCreditCardMode === "recent" ? snapB.recentTotal : snapB.dueTotal;
        return amtB - amtA;
    });
    const portfolio = getCreditCardPortfolioSnapshot(activeCreditCardDueCycleKey);
    const modeTitle = activeCreditCardMode === "recent" ? "Recent Spends" : "Total Due";
    const dueRangeLabel = activeCreditCardDueCycleKey === "current"
        ? "Current cycle"
        : (getCreditCardAvailableCycles().find(c => c.key === activeCreditCardDueCycleKey)?.label || "Selected cycle");

    populateCreditCardCycleSelectors();
    if (overviewCycleSelector) overviewCycleSelector.value = activeCreditCardDueCycleKey || "current";
    if (detailCycleSelector) detailCycleSelector.value = activeCreditCardDueCycleKey || "current";

    if (dueBtn && recentBtn) {
        if (activeCreditCardMode === "due") {
            dueBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all bg-indigo-600 text-white flex items-center justify-center gap-1.5";
            recentBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all text-slate-400 hover:text-white flex items-center justify-center gap-1.5";
        } else {
            dueBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all text-slate-400 hover:text-white flex items-center justify-center gap-1.5";
            recentBtn.className = "flex-1 py-2 rounded-xl text-[11px] font-bold transition-all bg-indigo-600 text-white flex items-center justify-center gap-1.5";
        }
    }

    const overviewCycleSelectorContainer = document.getElementById("creditCardCycleSelectorContainer");
    if (overviewCycleSelectorContainer) {
        if (activeCreditCardMode === "due") {
            overviewCycleSelectorContainer.classList.remove("hidden");
        } else {
            overviewCycleSelectorContainer.classList.add("hidden");
        }
    }

    if (summaryAmount) {
        const total = activeCreditCardMode === "recent" ? portfolio.recentTotal : portfolio.dueTotal;
        summaryAmount.textContent = `${state.currencySymbol}${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (summaryNote) {
        summaryNote.textContent = state.creditCardsEnabled
            ? (activeCreditCardMode === "recent"
                ? "Recent spends stay live against today's open cycle."
                : `Due is the rolling billing window for ${dueRangeLabel}.`)
            : "Enable credit card mode in Settings to activate this tab.";
    }
    if (countBadge) countBadge.textContent = cards.length;

    if (!state.creditCardsEnabled) {
        overviewPanel.classList.remove("hidden");
        detailPanel.classList.add("hidden");
        tiles.innerHTML = `
            <div class="bg-slate-900/40 border border-slate-850 rounded-2xl p-4 text-center space-y-2">
                <p class="text-xs font-bold text-slate-200">Credit card mode is off</p>
                <p class="text-[11px] text-slate-500 leading-relaxed">Turn it on in Settings to use this tab.</p>
            </div>
        `;
        initLucideIcons(tiles);
        return;
    }

    if (cards.length === 0) {
        overviewPanel.classList.remove("hidden");
        detailPanel.classList.add("hidden");
        tiles.innerHTML = `
            <div class="bg-slate-900/40 border border-slate-850 rounded-2xl p-4 text-center space-y-2">
                <p class="text-xs font-bold text-slate-200">No credit cards yet</p>
                <p class="text-[11px] text-slate-500 leading-relaxed">Add a credit card in Settings to start tracking billing days.</p>
            </div>
        `;
        initLucideIcons(tiles);
        return;
    }

    const activePay = activeCreditCardId ? cards.find(pay => pay.id === activeCreditCardId) : null;
    if (activeCreditCardId && !activePay) {
        activeCreditCardId = null;
    }

    if (activePay) {
        overviewPanel.classList.add("hidden");
        detailPanel.classList.remove("hidden");
        renderCreditCardDetailView(activePay, getCreditCardBucketSnapshot(activePay, activeCreditCardDueCycleKey));
    } else {
        overviewPanel.classList.remove("hidden");
        detailPanel.classList.add("hidden");
    }

    tiles.innerHTML = cards.map(pay => {
        const snapshot = getCreditCardBucketSnapshot(pay, activeCreditCardDueCycleKey);
        const billingDayLabel = formatBillingDayLabel(pay.billingDay) || "15th";
        const currentAmount = activeCreditCardMode === "recent" ? snapshot.recentTotal : snapshot.dueTotal;
        const currentCount = activeCreditCardMode === "recent" ? snapshot.recentTxs.length : snapshot.dueTxs.length;
        const modeTag = activeCreditCardMode === "recent" ? "Recent" : "Due";
        return `
            <button type="button" onclick="openCreditCardDetail('${pay.id}')" class="w-full text-left bg-slate-900/60 border border-slate-850 rounded-2xl p-3 active:scale-[0.98] transition-all flex items-stretch gap-2.5">
                <span class="w-1 self-stretch rounded-full shrink-0" style="background-color: ${pay.color}"></span>
                <div class="flex-1 flex items-center justify-between gap-3 min-w-0">
                    <div class="min-w-0 flex items-center gap-2">
                        <div class="min-w-0">
                            <p class="text-xs font-bold text-white truncate">${pay.name}</p>
                            <p class="text-[9px] text-slate-500 mt-0.5">Bills on ${billingDayLabel}</p>
                        </div>
                        <span onclick="event.stopPropagation(); openEditPaymentModal('${pay.id}')" class="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-all cursor-pointer flex items-center justify-center shrink-0" title="Edit Card">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </span>
                    </div>
                    <div class="shrink-0 text-right">
                        <p class="text-sm font-black text-white">${state.currencySymbol}${currentAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p class="text-[9px] text-slate-500 mt-0.5">${currentCount} item${currentCount === 1 ? "" : "s"} · ${modeTag}</p>
                    </div>
                </div>
            </button>
        `;
    }).join("");

    initLucideIcons(tiles);
}

/* ═══════════════════════════════════════════════════════
   CARD ANALYTICS FUNCTIONS (P1)
═══════════════════════════════════════════════════════ */
function toggleCardAnalytics() {
    activeCardAnalyticsVisible = !activeCardAnalyticsVisible;
    const content = document.getElementById("cardAnalyticsContent");
    const btn = document.getElementById("toggleCardAnalyticsBtn");
    if (content && btn) {
        if (activeCardAnalyticsVisible) {
            content.classList.remove("hidden");
            btn.textContent = "Hide";
            renderCardAnalyticsChart();
        } else {
            content.classList.add("hidden");
            btn.textContent = "Show";
        }
    }
}

function renderCardAnalyticsChart() {
    if (!activeCreditCardId || !activeCardAnalyticsVisible) return;
    const pay = state.payments.find(p => p.id === activeCreditCardId);
    if (!pay) return;

    const snapshot = getCreditCardBucketSnapshot(pay, activeCreditCardDueCycleKey);
    const currentTxs = activeCreditCardMode === "recent" ? snapshot.recentTxs : snapshot.dueTxs;

    // Group by category
    const categorySums = {};
    currentTxs.forEach(t => {
        const cat = state.categories.find(c => c.id === t.categoryId) || { name: "Other", color: "#64748b" };
        if (!categorySums[cat.name]) {
            categorySums[cat.name] = { amount: 0, color: cat.color };
        }
        categorySums[cat.name].amount += parseFloat(t.amount) || 0;
    });

    const labels = Object.keys(categorySums);
    const data = labels.map(l => categorySums[l].amount);
    const colors = labels.map(l => categorySums[l].color);

    // Destroy old chart
    if (cardAnalyticsChartInstance) {
        cardAnalyticsChartInstance.destroy();
        cardAnalyticsChartInstance = null;
    }

    const canvas = document.getElementById("cardDoughnutChart");
    if (!canvas || labels.length === 0) {
        if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        document.getElementById("cardAnalyticsCategoryBreakdown").innerHTML = `<p class="text-[10px] text-slate-500 italic text-center py-4">No data to display chart.</p>`;
        return;
    }

    cardAnalyticsChartInstance = new Chart(canvas.getContext("2d"), {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 1,
                borderColor: "rgba(15, 23, 42, 0.45)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            cutout: "70%"
        }
    });

    // Populate text list of categories
    const breakdown = document.getElementById("cardAnalyticsCategoryBreakdown");
    const totalAmount = data.reduce((s, a) => s + a, 0);
    breakdown.innerHTML = labels.map((l, i) => {
        const amt = data[i];
        const pct = totalAmount > 0 ? Math.round((amt / totalAmount) * 100) : 0;
        const col = colors[i];
        return `
            <div class="flex items-center justify-between text-[11px]">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${col}"></span>
                    <span class="text-slate-300 font-medium truncate">${l}</span>
                </div>
                <span class="text-slate-400 font-bold shrink-0">${state.currencySymbol}${amt.toLocaleString()} (${pct}%)</span>
            </div>
        `;
    }).join("");
}

