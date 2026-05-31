# TReX — Active Work Log

**Last updated:** May 31, 2026
**Current version:** v3.5
**Changelog:** All completed work from v2.0–v3.5 is documented in `CHANGELOG.md`.

---

## Current Status

Phase 9 (Hosted Web Enablement) — **Complete ✅**
Next up: **TREX_IMPLEMENTATION_PLAN.md — Phase 1 (Settings Architecture Revamp)**

---

## Known Limitations

- **PWA daily reminder:** `scheduleDailyReminder()` uses `setTimeout` — requires the browser tab to be active. Does not fire with screen off or browser backgrounded. Planned fix: Capacitor migration (`@capacitor/local-notifications`).
- **PWA notifications:** Chrome's "Tap to copy URL" notification appears alongside app notifications on Android — this is browser behaviour, not fixable from JS.

---

## Next Phase — Implementation Plan Phase 1

**Reference:** `TREX_IMPLEMENTATION_PLAN.md`
**Goal:** Side drawer + clean Settings screen
**Upload these files to start:**
`index.html`, `styles.css`, `js/core.js`, `js/settings.js`

**Session resume format:**
```
TReX dev session resume.
Current phase: 1
Current step: [description]
Last completed: [what passed the checklist]
Uploading: [list of files]
```

---

## Resume Instructions

Re-upload only the files being touched for the current phase/step.
Verify the stability checklist before moving to the next step.
Update `CHANGELOG.md` and this file after each phase ships.
