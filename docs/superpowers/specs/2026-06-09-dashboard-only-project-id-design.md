# Dashboard-only project creation; manual Project ID as the sole remote path

**Issue:** #45 (Extension: Opt-in Project ID Persistence) — reframed.
**Date:** 2026-06-09
**Status:** Approved design, pending implementation plan.

## Background

Issue #45 originally asked for *opt-in* persistence of an auto-created project ID, on
the premise that "the extension creates a new project on every scan." That premise is
already stale: the current code persists an auto-created project ID across scans
(`getOrCreateProject()` in `webview-provider.ts`, stored in `globalState` under
`recost.projectId`), and a full bring-your-own-ID flow already exists (workspace-scoped
manual Project ID in the Keys tab, validated against `GET /projects/{id}`).

Rather than build the obsolete opt-in toggle or a telemetry-handoff panel, the team
decided to **invert the model**:

> Projects are created **only** in the web dashboard. The extension and CLI never create
> projects. The single way to get remote enrichment is to supply a Project ID (obtained
> from the dashboard) — in the extension via the Keys tab, in the CLI via flag/env.

This is mostly a **removal** of code (auto-creation) plus a small rewire, and it makes
the manually-entered Project ID the single source of truth for remote scans.

## Principle

- Project creation happens in the dashboard, never in the extension or CLI.
- Remote enrichment runs only when **both** a ReCost API key **and** a user-supplied
  Project ID are present (and the project is valid for that key).
- Any other state — no key, no Project ID, or an invalid Project ID — degrades
  gracefully to **local-only** results plus a nudge telling the user how to connect.

## Scope

Four areas change. Persistence storage, validation, and all local analysis are untouched.

### A. Extension scan flow

Files: `src/webview-provider.ts`, `src/webview/scan-publishing-handler.ts`.

- **Delete** `getOrCreateProject()` and its calls to `createProject` / `findProjectByName`.
- **Delete** the 404 → auto-recreate recovery block in `scan-publishing-handler.ts`
  (currently `if (status === 404 && projectTarget.source === "auto") { createProject... }`).
  A 404 from `submitScan` now means the supplied Project ID is invalid for this key.
- `resolveScanProjectTarget(rcApiKey)` collapses to:
  - manual ID present → `{ projectId: <manualId>, source: "manual" }`
  - otherwise → `null` (no remote target).
- `handleStartScan`: remote submit runs only when a key is present **and**
  `resolveScanProjectTarget` returns non-null. Otherwise call `publishLocalOnlyResults`.
  The local-only `projectId` argument becomes `manualProjectId ?? "local"` — the former
  `getProjectId() ?? "local"` fallback is removed.
- **Retire** the `recost.projectId` `globalState` key and the `this.projectId` field on
  `ReCostSidebarProvider` (no longer written by any flow).

### B. Chat context

Files: `src/webview-provider.ts`, `src/webview/chat-handler.ts` (consumer, unchanged shape).

- The `getProjectId()` callback passed to `ChatHandler` now returns `getManualProjectId()`
  instead of the retired `this.projectId`. The chat fallback chain
  `lastEndpoints[0]?.projectId ?? providerProjectId ?? "local"` is unchanged.

### C. CLI scan

File: `src/cli/scan.ts`.

- Add `projectId?: string` to `CliOptions`, resolved from a `--project-id` flag (via the
  existing `getFlag` helper) **or** the `RECOST_PROJECT_ID` env var. Flag takes precedence
  over env.
- **Delete** the `createProject(path.basename(...))` call.
- Remote enrichment runs only when `rcApiKey && projectId && remoteApiCalls.length > 0`.
  Absent any of these → local-only (the existing default path; `projectId` stays `"local"`).
- When a key is present but no Project ID is supplied, write a stderr nudge:
  `Set RECOST_PROJECT_ID (or --project-id) to sync scans remotely.`
- Update `printHelp()` to document the flag and env var.

### D. Keys tab UX

File: `webview/src/components/KeysPage.tsx`.

- Keep the existing Project ID input as the single remote control. There is no auto-created
  ID to surface anymore.
- Add a one-line hint with a dashboard link near the input:
  *"Create a project in the dashboard, then paste its ID here to sync scans."* The link
  targets the dashboard base URL (`RECOST_DASHBOARD_BASE_URL` via existing config).

### E. API client cleanup

File: `src/api-client.ts`.

- **Delete** `createProject` and `findProjectByName` (no remaining callers after A and C).
- Keep `validateProjectId` (powers Keys-tab validation) and `submitScan` /
  `getAllEndpoints` / `getAllSuggestions`.

## No-ID / failure behavior (graceful degradation)

| State | Behavior |
|-------|----------|
| No API key | Local-only + existing "no key" notification. |
| Key, no Project ID | Local-only + nudge: "Add a Project ID from your dashboard in the Keys tab to sync remotely." |
| Key + invalid Project ID (404) | Local-only; keep the saved manual ID; notify "Project ID … was not found." (existing manual-404 message path). |
| Key + valid Project ID | Remote submit to that project (existing path). |

## What stays untouched

- Workspace-scoped manual Project ID storage (`recost.manualProjectId:<scope>`).
- The validate → valid/invalid snapshot flow, key-fingerprinted.
- `submitScan`, `getAllEndpoints`, `getAllSuggestions`, `validateProjectId`.
- All local scanning, waste detection, simulator, and intelligence layers.

## Testing

- `resolveScanProjectTarget`: returns `null` with no manual ID; returns
  `{ projectId, source: "manual" }` when a manual ID is set.
- Extension scan, key present, no manual ID → local-only results + nudge notification;
  assert neither `createProject` nor `submitScan` is called.
- Extension scan, key + valid manual ID → `submitScan` called with that ID; remote-enriched
  results published.
- Extension scan, key + manual ID that 404s → local-only; saved manual ID retained;
  not-found notification.
- CLI: `--project-id` and `RECOST_PROJECT_ID` each drive remote submit to that ID; flag
  beats env; absent → local-only with no project creation.
- Regression: no remaining references to `getOrCreateProject`, `createProject`,
  `findProjectByName`, or `recost.projectId` in the codebase.

## Out of scope

- The opt-in `recost.persistProjectId` setting from the original #45 spec (obsolete under
  this model).
- Any telemetry-handoff `.env` snippet panel.
- Dashboard-side project-creation UX (already exists; not part of this repo's change).
