import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { compressClusters } from "../intelligence/compression";

async function runTests() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "recost-compress-"));
  try {
    const file = path.join(tmp, "sample.ts");
    await fs.writeFile(file, "line1\nline2\nline3\nline4\n", "utf8");

    // Mock shapes adapted minimally to match ReviewCluster / RepoIntelligenceSnapshot.
    // The point of the test is to prove (a) compressClusters is async and awaitable,
    // and (b) it actually reads the file from disk asynchronously.
    const apiCall = {
      id: "call-1",
      fileId: "sample.ts",
      filePath: "sample.ts",
      line: 2,
      provider: null,
      method: "GET",
      url: "https://example.com",
      library: null,
      costModel: null,
      frequencyClass: null,
      batchCapable: false,
      cacheCapable: false,
      streaming: false,
      isMiddleware: false,
      crossFileOrigin: null,
    };

    const fileNode = {
      id: "sample.ts",
      filePath: "sample.ts",
      apiCallIds: ["call-1"],
      findingIds: [],
      providers: [],
    };

    const scoredFile = {
      filePath: "sample.ts",
      fileId: "sample.ts",
      scores: { importance: 0, costLeak: 0, reliabilityRisk: 0, aiReviewPriority: 0 },
      reasons: [],
    };

    const cluster = {
      id: "c1",
      primaryFile: scoredFile,
      relatedFiles: [],
      topFindings: [],
      providers: [],
      estimatedMonthlyCost: null,
      reviewQuestion: "Why?",
    } as never;

    const snapshot = {
      createdAt: new Date().toISOString(),
      repoRoot: tmp,
      files: { "sample.ts": fileNode },
      apiCalls: { "call-1": apiCall },
      findings: {},
      providers: {},
      totalFilesScanned: 1,
    } as never;

    const promise = compressClusters([cluster], snapshot);
    assert.ok(promise && typeof (promise as Promise<unknown>).then === "function", "compressClusters must return a Promise");

    const result = await promise;
    assert.ok(Array.isArray(result), "compressClusters must resolve to an array");
    assert.ok(JSON.stringify(result).includes("line"), "snippet must contain file content");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  console.log("PASS intelligence-compression-async");
}

runTests().catch((e) => { console.error(e); process.exit(1); });
