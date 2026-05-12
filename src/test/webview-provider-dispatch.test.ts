import assert from "node:assert/strict";
import Module from "node:module";

// Stub `vscode` before any dependency of webview-provider tries to require it.
// webview-provider imports the `vscode` extension API at the top of the file,
// but dispatchWebviewMessage itself does not touch vscode at runtime, so an
// empty stub is sufficient for the dispatcher tests.
const originalResolve = (Module as unknown as { _resolveFilename: (req: string, parent: unknown) => string })._resolveFilename;
(Module as unknown as { _resolveFilename: (req: string, parent: unknown) => string })._resolveFilename = function (request: string, parent: unknown) {
  if (request === "vscode") return require.resolve("./vscode-stub");
  return originalResolve.call(this, request, parent);
};

import { dispatchWebviewMessage } from "../webview-provider";
import type { WebviewMessage } from "../messages";

function makeHandlers(overrides: Partial<Record<string, (...args: never[]) => unknown>> = {}) {
  const noop = async () => {};
  return {
    startScan: noop, runAiReview: noop, chat: noop, modelChanged: noop,
    applyFix: noop, openFile: noop, openDashboard: noop, runSimulation: noop,
    getAllKeyStatuses: noop, getProjectIdStatus: noop, setKey: noop, clearKey: noop,
    setProjectId: noop, clearProjectId: noop, testKey: noop, navigate: () => {},
    copyAiContext: noop, log: () => {},
    ...overrides,
  } as never;
}

async function runTests() {
  // Unknown type -> status "unknown"; logged
  {
    let logged = "";
    const r = await dispatchWebviewMessage(
      { type: "garbage" } as unknown as WebviewMessage,
      makeHandlers({ log: (m) => { logged = m as string; } })
    );
    assert.equal(r.status, "unknown");
    assert.match(logged, /unknown message type/i);
  }

  // Handler throw -> status "error"; error preserved
  {
    let logged = "";
    const r = await dispatchWebviewMessage(
      { type: "startScan" } as WebviewMessage,
      makeHandlers({
        startScan: async () => { throw new Error("boom"); },
        log: (m) => { logged = m as string; },
      })
    );
    assert.equal(r.status, "error");
    assert.ok((r as { error: string }).error.includes("boom"));
    assert.match(logged, /boom/);
  }

  // Success -> status "ok", handler called
  {
    let count = 0;
    const r = await dispatchWebviewMessage(
      { type: "startScan" } as WebviewMessage,
      makeHandlers({ startScan: async () => { count++; } })
    );
    assert.equal(r.status, "ok");
    assert.equal(count, 1);
  }

  console.log("PASS webview-provider-dispatch");
}

runTests().catch((e) => { console.error(e); process.exit(1); });
