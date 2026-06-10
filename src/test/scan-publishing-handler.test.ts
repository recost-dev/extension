import assert from "node:assert/strict";
import Module from "node:module";

// Stub `vscode` before any dependency tries to require it.
const originalResolve = (Module as unknown as {
  _resolveFilename: (req: string, parent: unknown) => string;
})._resolveFilename;
(Module as unknown as {
  _resolveFilename: (req: string, parent: unknown) => string;
})._resolveFilename = function (request: string, parent: unknown) {
  if (request === "vscode") return require.resolve("./vscode-stub");
  return originalResolve.call(this, request, parent);
};

// Stub the workspace-scanner before scan-publishing-handler is imported, so we
// can drive handleStartScan() without touching the real scanner.
// Returning a real apiCall is required so the handler reaches the submitScan
// branch rather than short-circuiting via the apiCalls.length === 0 path.
const scannerStub = {
  scanWorkspace: async () => [
    {
      file: "src/app.ts",
      line: 1,
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      library: "fetch",
    },
  ],
  detectLocalWastePatterns: async () => [],
  countScopedWorkspaceFiles: async () => 0,
  getWorkspaceScanFiles: async () => [],
};
require.cache[require.resolve("../scanner/workspace-scanner")] = {
  id: require.resolve("../scanner/workspace-scanner"),
  filename: require.resolve("../scanner/workspace-scanner"),
  loaded: true,
  exports: scannerStub,
} as unknown as NodeJS.Module;

// Stub api-client.submitScan to reject with the status we want to test.
let nextScanError: (Error & { status?: number; retryAfterSeconds?: number }) | null = null;
require.cache[require.resolve("../api-client")] = {
  id: require.resolve("../api-client"),
  filename: require.resolve("../api-client"),
  loaded: true,
  exports: {
    submitScan: async () => {
      if (nextScanError) throw nextScanError;
      return { scanId: "scan-stub", summary: { totalEndpoints: 0, redundantCalls: 0, n1Suspects: 0, batchOpportunities: 0, cacheOpportunities: 0 } };
    },
    getAllEndpoints: async () => [],
    getAllSuggestions: async () => [],
  },
} as unknown as NodeJS.Module;

import { ScanPublishingHandler, type ScanPublishingHandlerContext } from "../webview/scan-publishing-handler";
import type { HostMessage } from "../messages";

function makeCtx(posted: HostMessage[]): ScanPublishingHandlerContext {
  const noop = async () => {};
  return {
    postMessage: (m) => { posted.push(m); },
    context: { secrets: { get: async () => undefined }, globalState: { get: () => undefined, update: noop }, workspaceState: { get: () => undefined, update: noop } } as never,
    setLastEndpoints: () => {},
    setLastSuggestions: () => {},
    setLastSummary: () => {},
    setLastApiCalls: () => {},
    setLastFindings: () => {},
    getManualProjectId: () => null,
    getRcApiKey: async () => "rc-good",
    resolveScanProjectTarget: async () => ({ projectId: "proj-stub", source: "manual" as const }),
    getWorkspaceName: () => "ws",
    openKeys: () => {},
    setRecostValidationState: noop,
    clearRecostValidationState: noop,
    sendRecostKeyStatusUpdate: noop,
    refreshStatusBar: () => {},
    resetChatHistory: () => {},
    exportDebugScanResults: noop,
    pruneSavedScenariosAgainst: noop,
  };
}

async function runTests() {
  // 1. 429 with Retry-After: 42 surfaces a scanNotification with "42 seconds" and publishes local results
  {
    const posted: HostMessage[] = [];
    const err = new Error("rate limited") as Error & { status: number; retryAfterSeconds: number };
    err.status = 429;
    err.retryAfterSeconds = 42;
    nextScanError = err;
    const handler = new ScanPublishingHandler(makeCtx(posted));
    await handler.handleStartScan();
    const notification = posted.find((m) => m.type === "scanNotification") as { type: "scanNotification"; message: string } | undefined;
    assert.ok(notification, "expected a scanNotification message");
    assert.match(notification!.message, /42 seconds/);
    assert.match(notification!.message, /local results/i);
  }

  // 2. 429 without Retry-After surfaces the generic "in a moment" message
  {
    const posted: HostMessage[] = [];
    const err = new Error("rate limited") as Error & { status: number };
    err.status = 429;
    nextScanError = err;
    const handler = new ScanPublishingHandler(makeCtx(posted));
    await handler.handleStartScan();
    const notification = posted.find((m) => m.type === "scanNotification") as { type: "scanNotification"; message: string } | undefined;
    assert.ok(notification, "expected a scanNotification message");
    assert.match(notification!.message, /in a moment/);
  }

  // 3. 429 with retryAfterSeconds: 1 produces "1 second" (singular)
  {
    const posted: HostMessage[] = [];
    const err = new Error("rate limited") as Error & { status: number; retryAfterSeconds: number };
    err.status = 429;
    err.retryAfterSeconds = 1;
    nextScanError = err;
    const handler = new ScanPublishingHandler(makeCtx(posted));
    await handler.handleStartScan();
    const notification = posted.find((m) => m.type === "scanNotification") as { type: "scanNotification"; message: string } | undefined;
    assert.ok(notification, "expected a scanNotification message");
    assert.match(notification!.message, /1 second\b/);
  }

  // 4. 401 calls refreshStatusBar() exactly once after sendRecostKeyStatusUpdate
  {
    const posted: HostMessage[] = [];
    let refreshCalls = 0;
    let sentKeyUpdate = false;
    let refreshedAfterUpdate = false;
    const err = new Error("invalid auth") as Error & { status: number };
    err.status = 401;
    nextScanError = err;
    const ctx: ScanPublishingHandlerContext = {
      ...makeCtx(posted),
      sendRecostKeyStatusUpdate: async () => { sentKeyUpdate = true; },
      refreshStatusBar: () => {
        refreshCalls++;
        if (sentKeyUpdate) refreshedAfterUpdate = true;
      },
    };
    const handler = new ScanPublishingHandler(ctx);
    await handler.handleStartScan();
    assert.equal(refreshCalls, 1);
    assert.equal(refreshedAfterUpdate, true, "refreshStatusBar must be called after sendRecostKeyStatusUpdate");
  }

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

  console.log("PASS scan-publishing-handler");
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
