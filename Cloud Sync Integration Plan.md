TReX - Cloud Sync Integration Plan

1. Project Requirements & Goals

Core Philosophy: Local-First, Cloud-Secondary

TReX must continue to operate as a high-performance offline PWA. localStorage remains the primary source of truth. Cloud sync via Google Drive serves as a background backup and multi-device consistency layer.

User Trust & Data Safety

Opt-in Cloud Sync: Users must explicitly connect Google Drive.

Data Risk Education: New users will be informed via a welcome modal that local-only usage risks data loss if browser caches are cleared.

Transparency: Users must always know the sync status of their data via a dedicated UI indicator.

Technical Constraints

Authentication: Single-provider (Google) using OAuth 2.0.

Scope: https://www.googleapis.com/auth/drive.appdata (hidden, app-specific folder ensures privacy and prevents user-side file deletion).

Conflict Resolution: "Last-write-wins" (default) but with a "Conflict Resolution Modal" for edge cases.

2. Implementation Strategy

A. New State Fields (in core.js)

syncEnabled (boolean): Whether the user has authorized Google Drive.

updatedAt (string): ISO timestamp of the last local modification.

lastSyncedAt (string): ISO timestamp of the last successful Drive push/pull.

syncStatus (string): "idle" | "syncing" | "error" | "offline".

B. Module Map Updates

js/sync.js (New):

Handles Google Identity Services (GIS).

Implements pushToDrive() and syncFromDrive() with retry logic.

Manages token refreshes silently.

core.js (Modified):

Triggers debounced pushToDrive() inside saveStateToLocalStorage().

Initiates syncFromDrive() on window.onload and window.focus().

settings.js (Modified):

Adds "Cloud Sync" section.

Displays sync status (e.g., "Last synced: 2m ago", "Sync failed - Tap to retry").

3. Reliability & Safety Measures

Conflict Resolution

When a new device connects or data discrepancies are detected (i.e., remote updatedAt != local updatedAt on startup):

Compare Timestamps: If remote is significantly newer, prompt the user.

Conflict Modal: Provide three choices:

"Keep Local": Overwrite cloud data with local state.

"Replace Local": Overwrite local state with cloud data.

"Cancel": Do nothing and keep local state.

Reliability Engine

Silent Token Refresh: The sync module will wrap API calls in try/catch blocks. If an auth error occurs, trigger a silent re-auth before retrying.

Exponential Backoff: If a network request fails, implement retries at 2s, 5s, and 15s intervals before flagging a "Sync Failed" status.

Manual Sync: Users will have a "Sync Now" button in settings to force a push/pull and check connectivity.

4. Deployment Roadmap

Phase

Description

Key Deliverables

Phase 1

Infrastructure

Add sync fields to state in core.js and create js/sync.js skeleton.

Phase 2

Google Auth

Implement GIS OAuth 2.0 and Drive AppData connection.

Phase 3

Sync Engine

Implement push/pull logic, merge comparisons, and retry loops.

Phase 4

UX & Polish

Add status indicator, conflict resolution modal, and warning UI.

5. Future-Proofing

Scaling: Current projections indicate the state object will stay under 2MB. We will monitor localStorage performance. If usage crosses the 5MB threshold, we will transition to an "archive older data" strategy (moving transaction history to secondary Drive files).