/**
 * Test for the regex-fallback path in src/ast/parser-loader.ts.
 *
 * Audit Task A8: when web-tree-sitter is unavailable at module init, the
 * scanner must still detect API calls via the regex pass. We simulate the
 * "unavailable" state by setting RECOST_DISABLE_AST=1 before importing
 * core-scanner, which transitively imports parser-loader.ts and skips the
 * `require("web-tree-sitter")` call entirely.
 *
 * Why this matters: a silent regression in the regex fallback would degrade
 * detection in production VSIX builds with no node_modules without warning.
 */
import assert from "node:assert/strict";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

async function runTests(): Promise<void> {
  process.env.RECOST_DISABLE_AST = "1";

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "recost-ast-fallback-"));
  try {
    const relName = "uses-openai.ts";
    const absFile = path.join(tmp, relName);
    await fs.writeFile(
      absFile,
      `import OpenAI from "openai";\nconst client = new OpenAI();\nawait client.chat.completions.create({ model: "gpt-4", messages: [] });\n`,
      "utf8"
    );

    // Import lazily so the env var is picked up at module init.
    const coreScanner = await import("../scanner/core-scanner");

    // core-scanner exports `scanFiles(access)` which returns ApiCallInput[]
    // directly (no wrapper object). We pass a minimal ScanFileAccess that
    // points to our temp file.
    const results = await coreScanner.scanFiles({
      files: [{ absolutePath: absFile, relativePath: relName }],
      readFile: (p: string) => fs.readFile(p, "utf8"),
    });

    assert.ok(Array.isArray(results), "expected scanFiles to return an array");
    assert.ok(
      results.length > 0,
      `regex fallback should still detect openai chat.completions.create; got ${results.length} matches`
    );

    const hit = results.find(
      (c) =>
        /openai/i.test(c.provider ?? "") ||
        /openai/i.test(c.library ?? "") ||
        /chat\.completions/.test(c.methodSignature ?? "") ||
        /chat\/completions/.test(c.url ?? "")
    );
    assert.ok(
      hit,
      `expected at least one openai chat match in regex-fallback output. Got: ${JSON.stringify(results, null, 2)}`
    );
  } finally {
    delete process.env.RECOST_DISABLE_AST;
    await fs.rm(tmp, { recursive: true, force: true });
  }

  console.log("PASS ast-parser-loader-fallback");
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
