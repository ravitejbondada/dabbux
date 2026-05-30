/**
 * auth.js â€” PIN & App Lock
 * TReX — Devour Your Expenses
 *
 * PIN lock screen: lock/unlock app, PIN entry buffer, biometric simulation,
 * visual dot indicators, PIN change flow, lock button header state.
 *
 * Dependencies: core.js
 */

function closePinSuccessModal() {
    document.getElementById("pinSuccessModal").classList.add("hidden");
}

function showPinChangeSuccess() {
    document.getElementById("pinSuccessModal").classList.remove("hidden");
    initLucideIcons();
}

/* SECURITY LOCK MODULES */
function isAppLocked() {
    const lock = document.getElementById("simulatedLockScreen");
    return lock && !lock.classList.contains("hidden") && !lock.classList.contains("opacity-0");
}

function updateAppLockButton() {
    const btn = document.getElementById("appLockButton");
    if (!btn) return;
    if (state.pinEnabled) {
        btn.classList.remove("hidden");
    } else {
        btn.classList.add("hidden");
    }
}

function lockApp() {
    if (!state.pinEnabled) {
        showNotification("Enable Security PIN in Settings first.");
        return;
    }

    pinAttemptBuffer = "";
    updatePinVisualDots();

    const lock = document.getElementById("simulatedLockScreen");
    lock.classList.remove("hidden", "opacity-0", "pointer-events-none");

    document.querySelectorAll("#recurringModal, #pinSuccessModal, #inlineCategoryModal, #inlinePaymentModal, #editCategoryModal, #editPaymentModal")
        .forEach(el => el.classList.add("hidden"));

    showNotification("App protected. PIN required.");
    initLucideIcons();
}

function unlockApp() {
    document.getElementById("simulatedLockScreen").classList.add("opacity-0", "pointer-events-none");
    setTimeout(() => {
        document.getElementById("simulatedLockScreen").classList.add("hidden");
    }, 500);
    pinAttemptBuffer = "";
    updatePinVisualDots();
}

function togglePinSetting() {
    state.pinEnabled = document.getElementById("settingPinEnabled").checked;
    const lock = document.getElementById("simulatedLockScreen");
    if (state.pinEnabled) {
        lock.classList.remove("hidden");
    } else {
        lock.classList.add("hidden");
        unlockApp();
    }
    updateAppLockButton();
    saveStateToLocalStorage();
    showNotification(state.pinEnabled ? "Passcode lock activated." : "Passcode lock deactivated.");
}

function pressPin(char) {
    if (pinAttemptBuffer.length < 4) {
        pinAttemptBuffer += char;
        updatePinVisualDots();
    }

    if (pinAttemptBuffer.length === 4) {
        setTimeout(() => {
            if (pinAttemptBuffer === (state.pinCode || "1234")) {
                unlockApp();
                showNotification("Passcode verified. Storage unlocked.");
                pinAttemptBuffer = "";
            } else {
                showNotification("Incorrect passcode. Try again.");
                clearPin();
            }
        }, 200);
    }
}

function clearPin() {
    pinAttemptBuffer = "";
    updatePinVisualDots();
}

function simulateBiometrics() {
    unlockApp();
    showNotification("Unlocked with Secure FaceID.");
    pinAttemptBuffer = "";
    updatePinVisualDots();
}

function updatePinVisualDots() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById("pinDot" + i);
        if (i <= pinAttemptBuffer.length) {
            dot.className = "w-4 h-4 rounded-full bg-indigo-500 border-2 border-indigo-400 scale-110 transition-all duration-200 shadow-md shadow-indigo-500/30";
        } else {
            dot.className = "w-4 h-4 rounded-full border-2 border-slate-800 bg-transparent transition-all duration-200";
        }
    }
}
function changePin() {
    const currentPin = document.getElementById("currentPinInput").value;
    const newPin = document.getElementById("newPinInput").value;
    const confirmPin = document.getElementById("confirmPinInput").value;

    const storedPin = state.pinCode || "1234";

    if (currentPin !== storedPin) {
        showNotification("Current PIN is incorrect.");
        document.getElementById("currentPinInput").value = "";
        return;
    }

    if (!/^\d{4}$/.test(newPin)) {
        showNotification("New PIN must be exactly 4 digits.");
        return;
    }

    if (newPin !== confirmPin) {
        showNotification("Confirm PIN does not match.");
        document.getElementById("confirmPinInput").value = "";
        return;
    }

    state.pinCode = newPin;
    saveStateToLocalStorage();

    const lockHint = document.getElementById("lockScreenPinHint");
    if (lockHint) lockHint.textContent = newPin;
    initLucideIcons();

    document.getElementById("currentPinInput").value = "";
    document.getElementById("newPinInput").value = "";
    document.getElementById("confirmPinInput").value = "";
    showNotification("PIN updated successfully.");
    showPinChangeSuccess();
}

