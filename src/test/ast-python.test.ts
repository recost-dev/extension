/**
 * Integration tests for Python support in the AST scanner.
 *
 * All tests use real Tree-sitter parsing with the Python WASM grammar.
 * Covers: OpenAI SDK, Anthropic SDK, mixed imports, aliased imports,
 *         plain import style, and requests HTTP calls.
 */
import assert from "node:assert/strict";
import * as path from "path";
import { setWasmDir } from "../ast/parser-loader";
import { scanSourceWithAst } from "../ast/ast-scanner";
import type { AstScanResult } from "../ast/ast-scanner";

const WASM_DIR = path.join(__dirname, "..", "..", "assets", "parsers");
setWasmDir(WASM_DIR);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function scan(
  src: string,
  lang = "python",
  filePath = "/project/src/api.py"
): Promise<AstScanResult> {
  return scanSourceWithAst(src, lang, filePath);
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

  await run("Python: from openai import OpenAI + client.chat.completions.create → sdk match", async () => {
    const src = `
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(model="gpt-4o", messages=[])
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match");
    assert.equal(m!.kind, "sdk");
    assert.equal(m!.method, "POST");
    assert.ok(m!.endpoint?.includes("chat/completions"), "endpoint should include chat/completions");
  });

  await run("Python: import anthropic + client.messages.create → sdk match", async () => {
    const src = `
import anthropic
client = anthropic.Anthropic()
message = client.messages.create(model="claude-opus-4-6", max_tokens=1024, messages=[])
`;
    const { matches } = await scan(src);
    // Find the actual API call (not the constructor call anthropic.Anthropic())
    const m = matches.find((x) => x.provider === "anthropic" && x.method !== undefined);
    assert.ok(m, "expected anthropic messages.create match");
    assert.equal(m!.kind, "sdk");
    assert.equal(m!.method, "POST");
  });

  await run("Python: aliased import (from openai import OpenAI as AI) → detected", async () => {
    const src = `
from openai import OpenAI as AI
ai = AI()
result = ai.chat.completions.create(model="gpt-4o", messages=[])
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match via alias");
    assert.equal(m!.kind, "sdk");
  });

  await run("Python: mixed providers in one file → both detected", async () => {
    const src = `
from openai import OpenAI
import anthropic

oai = OpenAI()
ant = anthropic.Anthropic()

r1 = oai.chat.completions.create(model="gpt-4o", messages=[])
r2 = ant.messages.create(model="claude-opus-4-6", max_tokens=512, messages=[])
`;
    const { matches } = await scan(src);
    assert.ok(matches.some((m) => m.provider === "openai"), "should find openai");
    assert.ok(matches.some((m) => m.provider === "anthropic"), "should find anthropic");
  });

  await run("Python: plain import openai + client = openai.OpenAI() → detected", async () => {
    const src = `
import openai
client = openai.OpenAI()
resp = client.chat.completions.create(model="gpt-4o", messages=[])
`;
    const { matches } = await scan(src);
    // openai.OpenAI() — pkgPrefix="openai" → importMap.get("openai")="openai"
    const m = matches.find((x) => x.provider === "openai");
    assert.ok(m, "expected openai match via plain import + attribute constructor");
  });

  await run("Python: file with no API calls → empty matches", async () => {
    const src = `
def greet(name):
    return f"Hello, {name}"

result = greet("world")
print(result)
`;
    const { matches } = await scan(src);
    assert.equal(matches.length, 0);
  });

  await run("Python: requests.get with known host → http kind match", async () => {
    const src = `
import requests
resp = requests.get("https://api.openai.com/v1/models")
`;
    const { matches } = await scan(src);
    const m = matches.find((x) => x.kind === "http");
    assert.ok(m, "expected http match for requests.get");
    assert.equal(m!.method, "GET");
    assert.equal(m!.provider, "openai");
  });

  await run("Python: from openai import OpenAI, list multiple methods → all detected", async () => {
    const src = `
from openai import OpenAI
client = OpenAI()
client.chat.completions.create(model="gpt-4o", messages=[])
client.embeddings.create(model="text-embedding-3-small", input="hello")
`;
    const { matches } = await scan(src);
    const chatMatch = matches.find((m) => m.endpoint?.includes("chat/completions"));
    const embedMatch = matches.find((m) => m.endpoint?.includes("embeddings"));
    assert.ok(chatMatch, "should detect chat completions");
    assert.ok(embedMatch, "should detect embeddings");
  });

})();
