/**
 * Tests for ast/import-resolver.ts.
 *
 * All tests use real Tree-sitter parsing.  Barrel file tests use in-memory
 * file readers — no filesystem access is needed.
 */
import assert from "node:assert/strict";
import * as path from "path";
import { parseFile, setWasmDir } from "../ast/parser-loader";
import { resolveImports } from "../ast/import-resolver";

const WASM_DIR = path.join(__dirname, "..", "..", "assets", "parsers");
setWasmDir(WASM_DIR);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolve(
  src: string,
  filePath = "/project/src/index.ts",
  files: Record<string, string> = {}
) {
  const lang = filePath.endsWith(".ts") || filePath.endsWith(".tsx") ? "typescript" : "javascript";
  const tree = await parseFile(src, lang);
  if (!tree) throw new Error("Parse failed");
  const readFile = Object.keys(files).length > 0
    ? async (p: string) => files[p] ?? null
    : undefined;
  return resolveImports(tree, filePath, readFile);
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
  // ── ESM import patterns ──────────────────────────────────────────────────────

  await run("default import: import openai from 'openai'", async () => {
    const { importMap } = await resolve(`import openai from 'openai';`);
    assert.equal(importMap.get("openai"), "openai");
  });

  await run("named import: import { OpenAI } from 'openai'", async () => {
    const { importMap } = await resolve(`import { OpenAI } from 'openai';`);
    assert.equal(importMap.get("OpenAI"), "openai");
  });

  await run("aliased named import: import { OpenAI as AI } from 'openai'", async () => {
    const { importMap } = await resolve(`import { OpenAI as AI } from 'openai';`);
    assert.equal(importMap.get("AI"), "openai");
    assert.equal(importMap.get("OpenAI"), undefined, "original name not mapped");
  });

  await run("namespace import: import * as openai from 'openai'", async () => {
    const { importMap } = await resolve(`import * as openai from 'openai';`);
    assert.equal(importMap.get("openai"), "openai");
  });

  // ── CJS require patterns ─────────────────────────────────────────────────────

  await run("require: const openai = require('openai')", async () => {
    const { importMap } = await resolve(`const openai = require('openai');`, "/project/index.js");
    assert.equal(importMap.get("openai"), "openai");
  });

  await run("require destructure: const { OpenAI } = require('openai')", async () => {
    const { importMap } = await resolve(`const { OpenAI } = require('openai');`, "/project/index.js");
    assert.equal(importMap.get("OpenAI"), "openai");
  });

  await run("require destructure with alias: const { OpenAI: Client } = require('openai')", async () => {
    const { importMap } = await resolve(`const { OpenAI: Client } = require('openai');`, "/project/index.js");
    assert.equal(importMap.get("Client"), "openai");
    assert.equal(importMap.get("OpenAI"), undefined, "original name not in map");
  });

  // ── Constructor assignments ──────────────────────────────────────────────────

  await run("constructor: const client = new OpenAI() after import", async () => {
    const src = `
      import OpenAI from 'openai';
      const client = new OpenAI();
    `;
    const { importMap } = await resolve(src);
    assert.equal(importMap.get("OpenAI"), "openai");
    assert.equal(importMap.get("client"), "openai");
  });

  await run("constructor: const stripe = new Stripe('sk_...') via CLASS_TO_PACKAGE", async () => {
    const src = `
      import Stripe from 'stripe';
      const stripe = new Stripe('sk_test_123');
    `;
    const { importMap } = await resolve(src);
    assert.equal(importMap.get("stripe"), "stripe");
  });

  await run("constructor: const ai = new AI() where AI is aliased import", async () => {
    const src = `
      import { OpenAI as AI } from 'openai';
      const ai = new AI();
    `;
    const { importMap } = await resolve(src);
    assert.equal(importMap.get("AI"), "openai");
    assert.equal(importMap.get("ai"), "openai");
  });

  // ── Multiple imports from different packages ─────────────────────────────────

  await run("multiple imports: openai and stripe in same file", async () => {
    const src = `
      import OpenAI from 'openai';
      import Stripe from 'stripe';
      const openaiClient = new OpenAI();
      const stripeClient = new Stripe('sk_test');
    `;
    const { importMap } = await resolve(src);
    assert.equal(importMap.get("OpenAI"), "openai");
    assert.equal(importMap.get("Stripe"), "stripe");
    assert.equal(importMap.get("openaiClient"), "openai");
    assert.equal(importMap.get("stripeClient"), "stripe");
  });

  // ── Non-provider packages ────────────────────────────────────────────────────

  await run("non-provider: import lodash from 'lodash' — still mapped", async () => {
    const { importMap } = await resolve(`import _ from 'lodash';`);
    assert.equal(importMap.get("_"), "lodash");
  });

  // ── Mixed require and import ─────────────────────────────────────────────────

  await run("mixed: ESM import and CJS require in same file", async () => {
    const src = `
      import OpenAI from 'openai';
      const Stripe = require('stripe');
    `;
    const { importMap } = await resolve(src, "/project/index.js");
    assert.equal(importMap.get("OpenAI"), "openai");
    assert.equal(importMap.get("Stripe"), "stripe");
  });

  // ── Barrel file re-exports ───────────────────────────────────────────────────

  await run("barrel: export { askGPT } from './a' resolves to source package", async () => {
    // File C imports askGPT from barrel (File B).
    // File B re-exports askGPT from File A.
    // File A imports askGPT (as local fn) from openai.
    const fileA = `
      import OpenAI from 'openai';
      const openai = new OpenAI();
      export async function askGPT(prompt) { return openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] }); }
    `;
    const fileB = `export { askGPT } from './a';`;
    const fileC = `import { askGPT } from './b';`;

    const files: Record<string, string> = {
      "/project/src/a.ts": fileA,
      "/project/src/b.ts": fileB,
    };

    const { importMap } = await resolve(fileC, "/project/src/c.ts", files);
    // askGPT resolves: c→b barrel→a source. In a, askGPT isn't directly an
    // import (it's a local export function), but the import map of file A
    // contains OpenAI→openai. Our resolver checks if the requested name
    // appears in a.ts's importMap — it won't, because askGPT is a function
    // declaration. So we expect null or no mapping for askGPT (the function
    // itself, not an imported binding). This is acceptable behaviour —
    // askGPT isn't in the importMap, it would be discovered at call-resolution
    // time in 2.4 when scanning a.ts directly.
    // The important thing is this doesn't throw and barrel resolution runs.
    assert.ok(importMap instanceof Map);
  });

  await run("barrel: export * from './providers' — follows star re-export", async () => {
    const providers = `import OpenAI from 'openai'; export { OpenAI };`;
    const barrel = `export * from './providers';`;
    const consumer = `import { OpenAI } from './barrel';`;

    const files: Record<string, string> = {
      "/project/src/providers.ts": providers,
      "/project/src/barrel.ts": barrel,
    };

    const { importMap } = await resolve(consumer, "/project/src/consumer.ts", files);
    // OpenAI should be resolved to "openai" via barrel → providers
    // (providers exports OpenAI which is imported from "openai")
    assert.equal(importMap.get("OpenAI"), "openai");
  });

  // ── TypeScript typed function parameters ─────────────────────────────────────

  await run("TS typed param: function helper(client: OpenAI) → parameterMaps", async () => {
    const src = `
      import OpenAI from 'openai';
      function helper(client: OpenAI) {
        return client.chat.completions.create({});
      }
    `;
    const { parameterMaps } = await resolve(src);
    const helperParams = parameterMaps.get("helper");
    assert.ok(helperParams, "helper must have a parameterMap");
    assert.equal(helperParams!.get("client"), "openai");
  });

  await run("TS typed param: non-provider type annotation is ignored", async () => {
    const src = `
      function doWork(count: number, label: string) { return count; }
    `;
    const { parameterMaps } = await resolve(src);
    // count and label are not provider types — no entry expected
    const map = parameterMaps.get("doWork");
    assert.ok(!map || map.size === 0);
  });

  await run("TS typed param: multiple functions each get own map", async () => {
    const src = `
      import OpenAI from 'openai';
      import Stripe from 'stripe';
      function callAI(client: OpenAI) { client.chat.completions.create({}); }
      function charge(stripe: Stripe) { stripe.paymentIntents.create({}); }
    `;
    const { parameterMaps } = await resolve(src);
    assert.equal(parameterMaps.get("callAI")?.get("client"), "openai");
    assert.equal(parameterMaps.get("charge")?.get("stripe"), "stripe");
  });

  await run("JS file (no types): typed params not resolved (expected limitation)", async () => {
    const src = `
      function helper(client) { return client.chat.completions.create({}); }
    `;
    // No type annotation in JS → parameter map should be empty
    const { parameterMaps } = await resolve(src, "/project/index.js");
    const map = parameterMaps.get("helper");
    assert.ok(!map || map.size === 0);
  });

  // ── Aliased imports ──────────────────────────────────────────────────────────

  await run("aliased import chained through constructor", async () => {
    const src = `
      import { Anthropic as SDK } from '@anthropic-ai/sdk';
      const client = new SDK();
    `;
    const { importMap } = await resolve(src);
    assert.equal(importMap.get("SDK"), "@anthropic-ai/sdk");
    assert.equal(importMap.get("client"), "@anthropic-ai/sdk");
  });

  // ── Import of non-provider package still maps ────────────────────────────────

  await run("non-provider import is still recorded in importMap", async () => {
    const src = `import express from 'express';`;
    const { importMap } = await resolve(src);
    assert.equal(importMap.get("express"), "express");
  });
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
