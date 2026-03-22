/**
 * Integration tests for FrequencyClass detection in the AST scanner.
 *
 * Each test parses a real TypeScript/JavaScript snippet with Tree-sitter and
 * checks that the `frequency` field on the returned AstCallMatch is correct.
 *
 * Covered: single, bounded-loop, unbounded-loop, parallel, polling,
 *           conditional, cache-guarded.
 */
import assert from "node:assert/strict";
import * as path from "path";
import { setWasmDir } from "../ast/parser-loader";
import { scanSourceWithAst } from "../ast/ast-scanner";
import type { AstScanResult } from "../ast/ast-scanner";

const WASM_DIR = path.join(__dirname, "..", "..", "assets", "parsers");
setWasmDir(WASM_DIR);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function scan(src: string, lang = "typescript"): Promise<AstScanResult> {
  return scanSourceWithAst(src, lang, "/project/src/api.ts");
}

async function run(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

(async () => {

  await run("frequency: call at top level → single", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
client.chat.completions.create({ model: "gpt-4o", messages: [] });
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "single");
    assert.equal(m!.loopContext, false);
  });

  await run("frequency: call inside for...of → bounded-loop", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
const items = ["a", "b"];
for (const item of items) {
  client.chat.completions.create({ model: "gpt-4o", messages: [] });
}
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "bounded-loop");
    assert.equal(m!.loopContext, true);
  });

  await run("frequency: call inside while loop → unbounded-loop", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
while (running) {
  client.chat.completions.create({ model: "gpt-4o", messages: [] });
}
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "unbounded-loop");
    assert.equal(m!.loopContext, true);
  });

  await run("frequency: call inside array.forEach callback → bounded-loop", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
const prompts = ["hello", "world"];
prompts.forEach(async (p) => {
  await client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: p }] });
});
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "bounded-loop");
    assert.equal(m!.loopContext, true);
  });

  await run("frequency: call inside Promise.all → parallel", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
await Promise.all([
  client.chat.completions.create({ model: "gpt-4o", messages: [] }),
  client.chat.completions.create({ model: "gpt-4o", messages: [] }),
]);
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "parallel");
    assert.equal(m!.loopContext, true);
  });

  await run("frequency: call inside setInterval callback → polling", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
setInterval(async () => {
  await client.chat.completions.create({ model: "gpt-4o", messages: [] });
}, 5000);
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "polling");
    assert.equal(m!.loopContext, true);
  });

  await run("frequency: call inside if block (no cache) → conditional", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
if (shouldFetch) {
  client.chat.completions.create({ model: "gpt-4o", messages: [] });
}
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "conditional");
    assert.equal(m!.loopContext, false);
  });

  await run("frequency: call inside cache guard → cache-guarded", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
if (!cache.has(key)) {
  client.chat.completions.create({ model: "gpt-4o", messages: [] });
}
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.frequency, "cache-guarded");
    assert.equal(m!.loopContext, false);
  });

  await run("frequency: polling beats loop (setInterval contains for...of)", async () => {
    const src = `
import OpenAI from "openai";
const client = new OpenAI();
setInterval(async () => {
  for (const item of queue) {
    await client.chat.completions.create({ model: "gpt-4o", messages: [] });
  }
}, 1000);
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    // polling has higher priority than bounded-loop
    assert.equal(m!.frequency, "polling");
  });

})();
