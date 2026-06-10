# Dashboard-only Project ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a user-supplied (dashboard-created) Project ID the only path to remote scan enrichment; remove all project auto-creation from the extension and CLI.

**Architecture:** The extension already stores a workspace-scoped manual Project ID and validates it. We delete the auto-create-and-persist fallback (`getOrCreateProject`, `recost.projectId` globalState, the 404→recreate recovery) so the scan resolver returns either the manual project or `null`. A `null` target means local-only results plus a nudge. The CLI gains a `--project-id` flag / `RECOST_PROJECT_ID` env var and likewise stops creating projects. `createProject`/`findProjectByName` are deleted from the API client.

**Tech Stack:** TypeScript (strict), esbuild, React 18 (webview), Node test scripts compiled with `tsc` and run via `node dist-test/...`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `src/webview/scan-publishing-handler.ts` | Scan orchestration + remote submit | Nullable project target; remove 404 auto-recreate; local-only + nudge on null; drop `getProjectId`/`setProjectId` from context |
| `src/test/scan-publishing-handler.test.ts` | Handler behavior tests | Adjust stubs (`source: "manual"`, drop `createProject`); add null-target + manual-target tests |
| `src/webview-provider.ts` | Provider wiring + project resolution | `resolveScanProjectTarget` → manual-or-null; delete `getOrCreateProject`; retire `this.projectId`/`recost.projectId`; `getProjectId` (chat) → manual ID; drop createProject/findProjectByName import |
| `src/api-client.ts` | HTTP client | Delete `createProject`, `findProjectByName` |
| `src/cli/scan.ts` | CLI scan runner | `--project-id`/`RECOST_PROJECT_ID`; remove `createProject`; nudge + help |
| `webview/src/components/KeysPage.tsx` | Keys tab UI | Copy: remote now requires a dashboard-created Project ID; add "Open dashboard" affordance |

**Build/test commands** (run from `extension/`):
- Full type+unit test suite: `npm test`
- Single handler test after compile: `npm test` runs `dist-test/test/scan-publishing-handler.test.js` near the end of the chain. There is no per-file runner; the suite compiles everything via `tsc -p tsconfig.scanner-tests.json` first, so a type error anywhere fails fast.
- Extension build: `npm run build:ext`
- Webview build: `npm run build:webview`

---

## Task 1: Handler — nullable project target, no auto-creation (TDD)

**Files:**
- Modify: `src/webview/scan-publishing-handler.ts`
- Test: `src/test/scan-publishing-handler.test.ts`

- [ ] **Step 1: Update the test harness stubs for the new contract**

In `src/test/scan-publishing-handler.test.ts`, remove the now-unused `createProject` stub from the api-client cache mock (lines ~46-54). The exports object becomes:

```typescript
  exports: {
    submitScan: async () => {
      if (nextScanError) throw nextScanError;
      return { scanId: "scan-stub", summary: { totalEndpoints: 0, redundantCalls: 0, n1Suspects: 0, batchOpportunities: 0, cacheOpportunities: 0 } };
    },
    getAllEndpoints: async () => [],
    getAllSuggestions: async () => [],
  },
```

In `makeCtx`, remove the `setProjectId` and `getProjectId` properties, and change the resolver stub to return a manual target:

```typescript
    setLastFindings: () => {},
    getManualProjectId: () => null,
    getRcApiKey: async () => "rc-good",
    resolveScanProjectTarget: async () => ({ projectId: "proj-stub", source: "manual" as const }),
    getWorkspaceName: () => "ws",
```

- [ ] **Step 2: Add the two new behavior tests**

Insert before `console.log("PASS scan-publishing-handler");` in `runTests()`:

```typescript
  // 5. No project target (no manual ID) → local-only + nudge, never calls submitScan
  {
    const posted: HostMessage[] = [];
    nextScanError = null;
    let submitCalled = false;
    const api = require.cache[require.resolve("../api-client")]!.exports as { submitScan: (...a: unknown[]) => Promise<unknown> };
    const realSubmit = api.submitScan;
    api.submitScan = async (...a: unknown[]) => { submitCalled = true; return realSubmit(...a); };
    const ctx: ScanPublishingHandlerContext = {
      ...makeCtx(posted),
      resolveScanProjectTarget: async () => null,
    };
    const handler = new ScanPublishingHandler(ctx);
    await handler.handleStartScan();
    api.submitScan = realSubmit;
    assert.equal(submitCalled, false, "submitScan must not be called without a project target");
    const nudge = posted.find((m) => m.type === "scanNotification" && /Project ID/i.test((m as { message: string }).message));
    assert.ok(nudge, "expected a nudge to add a Project ID");
  }

  // 6. Manual project target → submitScan IS called with that project id
  {
    const posted: HostMessage[] = [];
    nextScanError = null;
    let submittedProjectId: string | null = null;
    const api = require.cache[require.resolve("../api-client")]!.exports as { submitScan: (projectId: string, ...a: unknown[]) => Promise<unknown> };
    const realSubmit = api.submitScan;
    api.submitScan = async (projectId: string, ...a: unknown[]) => { submittedProjectId = projectId; return realSubmit(projectId, ...a); };
    const ctx: ScanPublishingHandlerContext = {
      ...makeCtx(posted),
      resolveScanProjectTarget: async () => ({ projectId: "proj-manual", source: "manual" as const }),
    };
    const handler = new ScanPublishingHandler(ctx);
    await handler.handleStartScan();
    api.submitScan = realSubmit;
    assert.equal(submittedProjectId, "proj-manual");
  }
```

- [ ] **Step 3: Run the suite to verify the new tests fail**

Run: `npm test`
Expected: TypeScript compile error first (`getProjectId`/`setProjectId` still referenced in `scan-publishing-handler.ts` but removed from the context stub), OR — once Step 4 type changes are partially applied — test 5 fails because the handler still dereferences a null target. Either way the suite is RED.

- [ ] **Step 4: Update the handler context interface**

In `src/webview/scan-publishing-handler.ts`, in `ScanPublishingHandlerContext`, delete the `setProjectId` and `getProjectId` members and change the resolver signature:

```typescript
  getManualProjectId(): string | null;
  getRcApiKey(): Promise<string | undefined>;
  resolveScanProjectTarget(rcApiKey: string): Promise<{ projectId: string; source: "manual" } | null>;
  getWorkspaceName(): string;
```

Remove the `createProject` import; the import line becomes:

```typescript
import { submitScan, getAllEndpoints, getAllSuggestions, type ApiClientError } from "../api-client";
```

- [ ] **Step 5: Replace the project-resolution + submit block**

In `handleStartScan`, replace the four local-only fallback expressions that read `manualProjectId ?? this.ctx.getProjectId() ?? "local"` (the no-key path, the empty-remote path, the optimistic publish, and the catch-path publishes) with `manualProjectId ?? "local"`.

Then replace the `try { const projectTarget = ... }` resolution + 404-recovery block (currently lines ~726-741) with:

```typescript
        const projectTarget = await this.ctx.resolveScanProjectTarget(rcApiKey);
        if (!projectTarget) {
          this.ctx.postMessage({
            type: "scanNotification",
            message: "Add a Project ID from your dashboard in the Keys tab to sync remotely.",
          });
          return;
        }
        const projectId = projectTarget.projectId;
        const scanResult = await submitScan(projectId, remoteApiCalls, rcApiKey);
```

(The optimistic `publishLocalOnlyResults(manualProjectId ?? "local", newLocalScanId())` call just above the `try` stays, so local results are already on screen when we `return`.) Delete the inner `try/catch` that called `createProject` on a 404 — `submitScan` is now awaited directly. Leave the outer `catch` (429 / auth / 404-manual / fetch-failed handling) intact; its `manualProjectId ?? "local"` fallbacks were updated above.

- [ ] **Step 6: Run the suite to verify it passes**

Run: `npm test`
Expected: PASS, ending with `PASS scan-publishing-handler` and the suite's final line.

- [ ] **Step 7: Commit**

```bash
git add src/webview/scan-publishing-handler.ts src/test/scan-publishing-handler.test.ts
git commit -m "feat(#45): scan handler resolves manual project or goes local-only; drop auto-create"
```

---

## Task 2: Provider — manual-or-null resolver, retire auto-creation state

**Files:**
- Modify: `src/webview-provider.ts`

- [ ] **Step 1: Rewrite `resolveScanProjectTarget`**

Replace the method (currently ~lines 492-500) with:

```typescript
  private async resolveScanProjectTarget(
    _rcApiKey: string
  ): Promise<{ projectId: string; source: "manual" } | null> {
    const manualProjectId = this.getManualProjectId();
    return manualProjectId ? { projectId: manualProjectId, source: "manual" } : null;
  }
```

- [ ] **Step 2: Delete `getOrCreateProject`**

Remove the entire `getOrCreateProject` method (currently ~lines 592-603).

- [ ] **Step 3: Remove the dead import and field**

Change the api-client import (line 10) from:

```typescript
import { findProjectByName, createProject, validateProjectId } from "./api-client";
```

to:

```typescript
import { validateProjectId } from "./api-client";
```

Delete the `private projectId: string | null = null;` field declaration (~line 147) and the line in `resolveWebviewView` that hydrates it (`this.projectId = this.context.globalState.get<string>("recost.projectId") ?? null;`, ~line 284).

- [ ] **Step 4: Rewire the chat project-id and drop unused wiring**

In the `ChatHandler` construction, change `getProjectId: () => this.projectId,` to:

```typescript
      getProjectId: () => this.getManualProjectId(),
```

In the `ScanPublishingHandler` construction, delete the `setProjectId: (id) => { this.projectId = id; },` and `getProjectId: () => this.projectId,` properties (they were removed from the context interface in Task 1).

- [ ] **Step 5: Build the extension to verify it compiles**

Run: `npm run build:ext`
Expected: builds with no TypeScript errors. (No `recost.projectId`, `getOrCreateProject`, `createProject`, or `findProjectByName` references remain in `webview-provider.ts`.)

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (no behavioral test depends on the removed provider internals beyond the handler tests already updated).

- [ ] **Step 7: Commit**

```bash
git add src/webview-provider.ts
git commit -m "refactor(#45): manual-or-null project resolver; retire recost.projectId auto-state"
```

---

## Task 3: API client — delete project-creation functions

**Files:**
- Modify: `src/api-client.ts`

- [ ] **Step 1: Confirm there are no remaining callers**

Run: `grep -rn "createProject\|findProjectByName" src/ | grep -v node_modules`
Expected: no matches (after Tasks 1-2). If any remain, they must be removed before deleting the functions.

- [ ] **Step 2: Delete the functions**

Remove `createProject` (currently ~lines 46-52) and `findProjectByName` (~lines 54-63) from `src/api-client.ts`. Keep `validateRcApiKey`, `validateProjectId`, `submitScan`, `getAllEndpoints`, `getAllSuggestions`.

- [ ] **Step 3: Build + test**

Run: `npm run build:ext && npm test`
Expected: builds and the suite PASSES. (`src/test/api-client.test.ts` does not reference the deleted functions.)

- [ ] **Step 4: Commit**

```bash
git add src/api-client.ts
git commit -m "refactor(#45): remove createProject/findProjectByName from API client"
```

---

## Task 4: CLI — supply Project ID via flag/env, no auto-creation

**Files:**
- Modify: `src/cli/scan.ts`

- [ ] **Step 1: Extend `CliOptions` and `parseArgs`**

Change the interface (~line 14):

```typescript
interface CliOptions {
  target: string;
  format: "json" | "summary" | "context";
  projectId?: string;
}
```

In `parseArgs`, add a local `let projectId: string | undefined;` near `let format`, and a flag branch inside the `while` loop, before the `if (!target)` branch:

```typescript
    if (arg === "--project-id") {
      const value = args.shift();
      if (!value) throw new Error("--project-id requires a value");
      projectId = value;
      continue;
    }
```

Then resolve env as a fallback at the return:

```typescript
  if (!target) return null;
  return { target, format, projectId: projectId ?? process.env.RECOST_PROJECT_ID?.trim() || undefined };
```

- [ ] **Step 2: Remove auto-creation from the scan run**

Replace the remote-enrichment guard and the `createProject` line. Change the import (line 6) to drop `createProject`:

```typescript
import { getAllEndpoints, getAllSuggestions, submitScan } from "../api-client";
```

Replace the block at ~lines 233-239:

```typescript
  const rcApiKey = resolveRcApiKey();
  const remoteApiCalls = apiCalls.filter(shouldSubmitRemote);
  let remoteResult: CliResult["remote"] = null;
  if (rcApiKey && options.projectId && remoteApiCalls.length > 0) {
    try {
      projectId = options.projectId;
      const remoteScan = await submitScan(projectId, remoteApiCalls, rcApiKey);
```

(The rest of the `try` body — `scanId = remoteScan.scanId;` through `mode = "remote-enriched";` — is unchanged.)

- [ ] **Step 3: Add the no-project-id nudge**

Immediately after the `if (rcApiKey && options.projectId && remoteApiCalls.length > 0) { ... }` block closes, add:

```typescript
  if (rcApiKey && !options.projectId && remoteApiCalls.length > 0) {
    process.stderr.write("Set RECOST_PROJECT_ID (or --project-id) to sync scans remotely. Showing local-only results.\n");
  }
```

- [ ] **Step 4: Document the flag in `printHelp`**

Add a line to the options section of `printHelp()` (locate the existing `--format` help line and add beneath it):

```typescript
    "  --project-id <id>   Dashboard project ID for remote sync (or RECOST_PROJECT_ID env var)",
```

- [ ] **Step 5: Build and smoke-test the CLI**

Run: `npm run build:ext`
Expected: compiles. Then verify help shows the flag:

Run: `node dist/cli/scan.js --help 2>&1 | grep -- "--project-id"`
Expected: prints the new help line.

- [ ] **Step 6: Commit**

```bash
git add src/cli/scan.ts
git commit -m "feat(#45): CLI takes --project-id/RECOST_PROJECT_ID; no project auto-creation"
```

---

## Task 5: Keys tab — copy reflects dashboard-only project creation

**Files:**
- Modify: `webview/src/components/KeysPage.tsx`

- [ ] **Step 1: Update the descriptive copy**

Replace the description line (currently `Optional per-workspace override for remote scan uploads.`) with text that states remote sync requires a dashboard-created project:

```tsx
            <div style={{ color: "var(--vscode-descriptionForeground)", fontSize: "11px" }}>
              Create a project in the ReCost dashboard, then paste its ID here to sync scans remotely. Without it, scans stay local-only.
            </div>
```

- [ ] **Step 2: Add an "Open dashboard" affordance using the existing IPC**

Directly below that description `<div>`, add a button that posts the existing `openDashboard` message (already handled by the host dispatcher):

```tsx
            <button
              type="button"
              onClick={() => postMessage({ type: "openDashboard" })}
              style={{
                alignSelf: "flex-start",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--vscode-textLink-foreground)",
                fontSize: "11px",
                textDecoration: "underline",
              }}
            >
              Open dashboard
            </button>
```

- [ ] **Step 3: Confirm `openDashboard` is an accepted webview message**

Run: `grep -rn "openDashboard" webview/src/ src/messages.ts src/webview-provider.ts`
Expected: `openDashboard` appears in the host dispatch (`src/webview-provider.ts`) and the `WebviewMessage` union (`src/messages.ts`). If it is NOT in the `WebviewMessage` type, add `| { type: "openDashboard" }` to that union in `src/messages.ts` and a matching `openDashboard: () => this.handleOpenDashboard()` dispatch entry (verify it already exists before adding).

- [ ] **Step 4: Build the webview**

Run: `npm run build:webview`
Expected: builds with no errors.

- [ ] **Step 5: Commit**

```bash
git add webview/src/components/KeysPage.tsx src/messages.ts
git commit -m "feat(#45): Keys tab copy + dashboard link for required Project ID"
```

---

## Task 6: Final verification

- [ ] **Step 1: No stale references remain**

Run: `grep -rn "getOrCreateProject\|createProject\|findProjectByName\|recost\.projectId" src/ webview/src/ | grep -v node_modules`
Expected: no matches.

- [ ] **Step 2: Full build + test**

Run: `npm run build && npm test`
Expected: full build (dashboard + webview + extension) succeeds and the test suite PASSES.

- [ ] **Step 3: Update CLAUDE.md auth section**

In `CLAUDE.md`, the "Auth / API Key System" and cost-estimation notes describe scan submission. Update the ReCost API key section to note that remote scans require a user-supplied (dashboard-created) Project ID set in the Keys tab (or `--project-id`/`RECOST_PROJECT_ID` for the CLI), and that the extension/CLI no longer auto-create projects. Commit:

```bash
git add CLAUDE.md
git commit -m "docs(#45): note dashboard-only project creation in auth section"
```

---

## Spec coverage check

- Extension auto-creation removed → Tasks 1, 2.
- 404→auto-recreate removed → Task 1 (Step 5).
- `resolveScanProjectTarget` manual-or-null → Tasks 1 (type), 2 (impl).
- `recost.projectId` / `this.projectId` retired → Task 2.
- Chat `getProjectId` → manual ID → Task 2 (Step 4).
- CLI `--project-id`/`RECOST_PROJECT_ID`, no createProject, nudge, help → Task 4.
- API client `createProject`/`findProjectByName` deleted → Task 3.
- Keys tab copy + dashboard link → Task 5.
- No-ID/failure degradation (local-only + nudge) → Task 1 (Steps 2, 5); existing 429/auth/manual-404 paths preserved → Task 1 (Step 5).
- Tests for null target, manual target, regression grep → Tasks 1, 6.
