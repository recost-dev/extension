import assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";

async function run(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}`); throw err; }
}

(async () => {
  // tsc rootDir=src outputs this test to dist-test/test/, so the project root
  // sits two directories above the compiled test file.
  const projectRoot = path.resolve(__dirname, "..", "..");
  const fixtureDir = path.resolve(projectRoot, "src", "test", "fixtures", "a6");
  const cliPath = path.resolve(projectRoot, "dist", "cli", "scan.js");

  await run("data file with method-chain string keys produces zero detections", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("node", [cliPath, fixtureDir, "--format", "json"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    const result = JSON.parse(out);
    const fromDataFile = (result.endpoints ?? []).filter((e: any) =>
      (e.callSites ?? []).some((cs: any) => String(cs.file).endsWith("pricing-config.ts"))
    );
    assert.equal(
      fromDataFile.length, 0,
      `expected 0 detections from pricing-config.ts, got ${fromDataFile.length}: ${JSON.stringify(fromDataFile.map((e: any) => ({ method: e.methodSignature ?? e.method, lib: e.library, line: e.callSites?.[0]?.line })))}`
    );
  });

  await run("real service.ts call is still detected", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("node", [cliPath, fixtureDir, "--format", "json"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    const result = JSON.parse(out);
    const openaiCalls = (result.endpoints ?? []).filter((e: any) => e.provider === "openai");
    assert.ok(openaiCalls.length >= 1, `expected at least 1 openai detection in service.ts, got ${openaiCalls.length}`);
    const fromService = openaiCalls.filter((e: any) =>
      (e.callSites ?? []).some((cs: any) => String(cs.file).endsWith("service.ts"))
    );
    assert.ok(fromService.length >= 1, "openai detection should come from service.ts");
  });

  await run("service.ts emits exactly one openai call site (no import/constructor FPs)", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("node", [cliPath, fixtureDir, "--format", "json"], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    const result = JSON.parse(out);
    const serviceCallSites = (result.endpoints ?? []).flatMap((e: any) =>
      (e.callSites ?? []).filter((cs: any) => String(cs.file).endsWith("service.ts"))
    );
    // The real call is on line 5 (client.chat.completions.create). Lines 1
    // (import) and 2 (new OpenAI()) should NOT produce extra call sites.
    const phantomLines = serviceCallSites.filter((cs: any) => cs.line === 1 || cs.line === 2);
    assert.equal(
      phantomLines.length, 0,
      `expected no call sites at service.ts:1 or :2, got ${phantomLines.length}: ${JSON.stringify(phantomLines.map((cs: any) => ({ line: cs.line, library: cs.library })))}`
    );
  });

  await run("filename-based workaround patterns are removed from file-discovery.ts", () => {
    const fdSource = fs.readFileSync(
      path.resolve(projectRoot, "src", "scanner", "file-discovery.ts"),
      "utf8"
    );
    const bannedPatterns = ["pricing.ts", "pricing.js", "pricing.tsx", "costs.ts", "costs.js", "rates.ts", "rates.js", "api-config.ts", "api-config.js", "provider-config.ts", "provider-config.js", "api-pricing.ts", "api-pricing.js"];
    for (const p of bannedPatterns) {
      assert.ok(
        !fdSource.includes(`"**/${p}"`),
        `file-discovery.ts still contains filename-based workaround for **/${p}`
      );
    }
  });
})().catch((err) => { console.error(err); process.exit(1); });
