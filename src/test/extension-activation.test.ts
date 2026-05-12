import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";
import Module from "node:module";

// Activation test for src/extension.ts.
//
// Strategy: extension.ts imports `vscode` at module top level, which is only
// available inside the real Extension Host. We monkey-patch Node's require
// resolution to return our local stub for any `require("vscode")`, then load
// the BUILT artifact (dist/extension.js) rather than compiling extension.ts
// under the scanner tsconfig — that would drag the entire webview-provider
// transitive closure into the test compile graph for no benefit.

const distExtensionPath = path.resolve(__dirname, "..", "..", "dist", "extension.js");
const mockVscodePath = path.resolve(__dirname, "__mocks__", "vscode.js");

function installVscodeMock(): void {
  if (!fs.existsSync(mockVscodePath)) {
    throw new Error(`vscode mock not compiled at ${mockVscodePath} — run "npx tsc -p tsconfig.scanner-tests.json" first`);
  }
  const originalRequire = Module.prototype.require as unknown as (id: string) => unknown;
  function patched(this: NodeJS.Module, id: string) {
    if (id === "vscode") return originalRequire.call(this, mockVscodePath);
    return originalRequire.call(this, id);
  }
  (Module.prototype as { require: unknown }).require = patched;
}

async function runTests() {
  if (!fs.existsSync(distExtensionPath)) {
    throw new Error(`dist/extension.js not found at ${distExtensionPath} — run "npm run build:ext" before tests`);
  }

  installVscodeMock();

  // Use dynamic require so tsc does not try to follow the import path into
  // the extension's `vscode` import chain. The vscode mock is now wired.
  const ext = require(distExtensionPath) as { activate?: unknown; deactivate?: unknown };

  assert.equal(typeof ext.activate, "function", "activate must be exported");
  assert.equal(typeof ext.deactivate, "function", "deactivate must be exported");

  // deactivate() must be idempotent — calling it before activate() ever fires,
  // and calling it twice, must not throw. This catches accidental state
  // assumptions in deactivate() that would otherwise blow up on edge-case
  // shutdown sequences (e.g., extension host kills before activate completes).
  (ext.deactivate as () => void)();
  (ext.deactivate as () => void)();

  console.log("PASS extension-activation");
}

runTests().catch((e) => { console.error(e); process.exit(1); });
