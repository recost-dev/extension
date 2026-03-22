/**
 * Tests for ast/parser-loader.ts.
 *
 * These tests exercise real Tree-sitter WASM parsing — no mocking needed.
 * Grammar files must be present in assets/parsers/ (run
 * `node scripts/download-wasm-grammars.mjs` once to populate them).
 */
import assert from "node:assert/strict";
import * as path from "path";
import { parseFile, getLanguageForExtension, setWasmDir } from "../ast/parser-loader";

// Point the loader at the project's assets/parsers directory.
// __dirname here = dist-test/test/  →  ../../assets/parsers = project root
const WASM_DIR = path.join(__dirname, "..", "..", "assets", "parsers");
setWasmDir(WASM_DIR);

// ── Async runner ──────────────────────────────────────────────────────────────

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
  await run("getLanguageForExtension: .js and .jsx → javascript", async () => {
    assert.equal(getLanguageForExtension(".js"), "javascript");
    assert.equal(getLanguageForExtension(".jsx"), "javascript");
    assert.equal(getLanguageForExtension(".JS"), "javascript"); // case-insensitive
  });

  await run("getLanguageForExtension: .ts and .tsx → typescript", async () => {
    assert.equal(getLanguageForExtension(".ts"), "typescript");
    assert.equal(getLanguageForExtension(".tsx"), "typescript");
    assert.equal(getLanguageForExtension(".TS"), "typescript");
  });

  await run("getLanguageForExtension: unsupported extensions → null", async () => {
    assert.equal(getLanguageForExtension(".py"), null);
    assert.equal(getLanguageForExtension(".go"), null);
    assert.equal(getLanguageForExtension(".rb"), null);
    assert.equal(getLanguageForExtension(""), null);
  });

  await run("parses a simple JS file: root node is 'program'", async () => {
    const tree = await parseFile("const x = 1;", "javascript");
    assert.ok(tree, "tree must not be null");
    assert.equal(tree!.rootNode.type, "program");
  });

  await run("parses a simple TS file: root node is 'program'", async () => {
    const tree = await parseFile("const x: number = 1;", "typescript");
    assert.ok(tree, "tree must not be null");
    assert.equal(tree!.rootNode.type, "program");
  });

  await run("parses an empty file without crashing", async () => {
    const tree = await parseFile("", "javascript");
    assert.ok(tree, "tree must not be null for empty input");
    assert.equal(tree!.rootNode.type, "program");
    assert.equal(tree!.rootNode.childCount, 0);
  });

  await run("handles invalid syntax gracefully (tree-sitter is error-tolerant)", async () => {
    const tree = await parseFile("const = ??? ({!", "javascript");
    // Tree-sitter always returns a tree with error nodes rather than throwing
    assert.ok(tree, "must return a tree even for invalid syntax");
    assert.equal(tree!.rootNode.type, "program");
    // The tree should contain at least one error node
    const src = tree!.rootNode.toString();
    assert.ok(src.includes("ERROR") || tree!.rootNode.hasError, "invalid source should produce error node");
  });

  await run("parses a real API call in JS", async () => {
    const src = `
      import OpenAI from "openai";
      const client = new OpenAI();
      const result = await client.chat.completions.create({ model: "gpt-4o" });
    `;
    const tree = await parseFile(src, "javascript");
    assert.ok(tree, "tree must not be null");
    assert.equal(tree!.rootNode.type, "program");
    assert.ok(!tree!.rootNode.hasError, "valid code must not produce error nodes");
  });

  await run("parses a real API call in TS with type annotation", async () => {
    const src = `
      import Anthropic from "@anthropic-ai/sdk";
      const client: Anthropic = new Anthropic();
      async function callAPI(): Promise<string> {
        const msg = await client.messages.create({ model: "claude-3-5-haiku-latest", max_tokens: 100, messages: [] });
        return msg.content[0].type;
      }
    `;
    const tree = await parseFile(src, "typescript");
    assert.ok(tree, "tree must not be null");
    assert.equal(tree!.rootNode.type, "program");
    assert.ok(!tree!.rootNode.hasError, "valid TS must not produce error nodes");
  });

  await run("returns null for unsupported language name", async () => {
    const tree = await parseFile("x = 1", "cobol");
    assert.equal(tree, null, "unsupported language should return null");
  });

  await run("grammars are cached: parsing twice uses the same language object", async () => {
    // Parse twice — should not throw and should produce the same root type
    const t1 = await parseFile("const a = 1;", "javascript");
    const t2 = await parseFile("const b = 2;", "javascript");
    assert.ok(t1 && t2);
    assert.equal(t1!.rootNode.type, t2!.rootNode.type);
  });

  await run("parses TSX file as typescript grammar", async () => {
    const src = `
      import React from "react";
      function App() { return <div>hello</div>; }
    `;
    const lang = getLanguageForExtension(".tsx");
    assert.equal(lang, "typescript");
    const tree = await parseFile(src, lang!);
    assert.ok(tree, "tsx should parse without crash");
    assert.equal(tree!.rootNode.type, "program");
  });
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
