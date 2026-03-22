/**
 * Integration tests for ast/ast-scanner.ts.
 *
 * All tests use real Tree-sitter parsing (WASM) — no mocking.
 * Tests cover:
 *  - Basic SDK calls with registry pricing
 *  - Aliased imports / constructor-assigned clients
 *  - Stripe calls
 *  - No API calls → empty results
 *  - fetch URL detection (HTTP kind)
 *  - Class wrapper detection (instance.method() + loop)
 *  - Callback patterns (forEach/map with fn refs)
 *  - Typed parameter detection (TS yes, JS no)
 *  - Middleware detection (same-file fn → tagged, imported fn → queue)
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
  lang = "typescript",
  filePath = "/project/src/index.ts",
  files: Record<string, string> = {}
): Promise<AstScanResult> {
  const readFile =
    Object.keys(files).length > 0
      ? async (p: string) => files[p] ?? null
      : undefined;
  return scanSourceWithAst(src, lang, filePath, readFile);
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
  // ── Basic SDK calls with registry pricing ────────────────────────────────────

  await run("basic: OpenAI chat.completions.create → sdk match with pricing", async () => {
    const src = `
      import OpenAI from 'openai';
      const client = new OpenAI();
      const result = await client.chat.completions.create({ model: "gpt-4o" });
    `;
    const { matches } = await scan(src);
    const found = matches.find((m) => m.methodChain.includes("chat.completions.create"));
    assert.ok(found, "must find chat.completions.create");
    assert.equal(found!.kind, "sdk");
    assert.equal(found!.provider, "openai");
    assert.equal(found!.packageName, "openai");
    // Registry should populate method/endpoint
    assert.equal(found!.method, "POST");
    assert.ok(found!.endpoint?.includes("openai.com"), "endpoint must include openai.com");
    assert.equal(found!.loopContext, false);
  });

  await run("basic: Anthropic messages.create → sdk match with pricing", async () => {
    const src = `
      import Anthropic from '@anthropic-ai/sdk';
      const client = new Anthropic();
      const msg = await client.messages.create({ model: "claude-3-5-haiku-latest", max_tokens: 1024, messages: [] });
    `;
    const { matches } = await scan(src);
    const found = matches.find((m) => m.methodChain.includes("messages.create"));
    assert.ok(found, "must find messages.create");
    assert.equal(found!.kind, "sdk");
    assert.equal(found!.provider, "anthropic");
    assert.equal(found!.packageName, "@anthropic-ai/sdk");
    assert.equal(found!.method, "POST");
  });

  // ── Aliased imports / constructor-assigned clients ────────────────────────────

  await run("aliased: const ai = new OpenAI() → detected via varMap", async () => {
    const src = `
      import OpenAI from 'openai';
      const ai = new OpenAI();
      await ai.chat.completions.create({ model: "gpt-4o-mini" });
    `;
    const { matches } = await scan(src);
    const found = matches.find((m) => m.methodChain.includes("chat.completions.create"));
    assert.ok(found, "must detect call via aliased variable");
    assert.equal(found!.provider, "openai");
  });

  await run("aliased: import { OpenAI as AI } + const client = new AI()", async () => {
    const src = `
      import { OpenAI as AI } from 'openai';
      const client = new AI();
      await client.embeddings.create({ input: "hello", model: "text-embedding-3-small" });
    `;
    const { matches } = await scan(src);
    const found = matches.find((m) => m.methodChain.includes("embeddings.create"));
    assert.ok(found, "must detect call through aliased import + constructor");
    assert.equal(found!.provider, "openai");
  });

  // ── Stripe calls ─────────────────────────────────────────────────────────────

  await run("stripe: paymentIntents.create → sdk match", async () => {
    const src = `
      import Stripe from 'stripe';
      const stripe = new Stripe('sk_test_123');
      const pi = await stripe.paymentIntents.create({ amount: 1000, currency: 'usd' });
    `;
    const { matches } = await scan(src);
    const found = matches.find((m) => m.methodChain.includes("paymentIntents.create"));
    assert.ok(found, "must find paymentIntents.create");
    assert.equal(found!.kind, "sdk");
    assert.equal(found!.provider, "stripe");
    assert.equal(found!.packageName, "stripe");
  });

  // ── No API calls → empty results ─────────────────────────────────────────────

  await run("no-api: file with no API calls → empty matches", async () => {
    const src = `
      function add(a: number, b: number): number {
        return a + b;
      }
      const result = add(1, 2);
      console.log(result);
    `;
    const { matches } = await scan(src);
    assert.equal(matches.length, 0, "should have no API matches");
  });

  // ── fetch URL detection ───────────────────────────────────────────────────────

  await run("fetch: URL to api.openai.com → http kind match", async () => {
    const src = `
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key }
      });
    `;
    const { matches } = await scan(src, "javascript");
    const found = matches.find((m) => m.kind === "http");
    assert.ok(found, "must find http kind match");
    assert.equal(found!.provider, "openai");
    assert.equal(found!.method, "POST");
    assert.ok(found!.endpoint?.includes("api.openai.com"));
  });

  await run("fetch: unknown host → http kind match without provider", async () => {
    const src = `
      const data = await fetch('https://api.example-internal.com/data');
    `;
    const { matches } = await scan(src, "javascript");
    const found = matches.find((m) => m.kind === "http");
    assert.ok(found, "must record fetch even for unknown hosts");
    assert.equal(found!.provider, undefined, "unknown host should have no provider");
  });

  // ── Class wrapper detection ───────────────────────────────────────────────────

  await run("class: instance.method() wrapping API call → detected", async () => {
    const src = `
      import OpenAI from 'openai';
      const client = new OpenAI();

      class AiService {
        async chat(prompt: string) {
          return await client.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
        }
      }

      const svc = new AiService();
      await svc.chat("hello");
    `;
    const { matches, classRegistry } = await scan(src);

    // classRegistry should have AiService with chat method
    const classInfo = classRegistry.get("AiService");
    assert.ok(classInfo, "AiService must be in classRegistry");
    assert.ok(classInfo!.methods.has("chat"), "chat method must be registered");

    // The svc.chat("hello") call should surface the underlying API call
    const found = matches.find((m) => m.methodChain.includes("chat.completions.create"));
    assert.ok(found, "underlying API call must be detected via class wrapper");
    assert.equal(found!.provider, "openai");
  });

  await run("class: method called in loop → loopContext = true", async () => {
    const src = `
      import OpenAI from 'openai';
      const client = new OpenAI();

      class Embedder {
        async embed(text: string) {
          return await client.embeddings.create({ input: text, model: 'text-embedding-3-small' });
        }
      }

      const embedder = new Embedder();
      const texts = ['a', 'b', 'c'];
      for (const t of texts) {
        await embedder.embed(t);
      }
    `;
    const { matches } = await scan(src);
    // The for-of loop call (embedder.embed(t)) should produce a loopContext=true match
    const found = matches.find(
      (m) => m.methodChain.includes("embeddings.create") && m.loopContext === true
    );
    assert.ok(found, "must find embeddings.create with loopContext=true via class wrapper in loop");
  });

  // ── Callback patterns ─────────────────────────────────────────────────────────

  await run("callback: items.forEach(askGPT) where askGPT makes API call → detected", async () => {
    const src = `
      import OpenAI from 'openai';
      const openai = new OpenAI();

      async function askGPT(prompt) {
        return await openai.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }] });
      }

      const prompts = ['hello', 'world'];
      prompts.forEach(askGPT);
    `;
    const { matches } = await scan(src, "javascript", "/project/src/index.js");
    const found = matches.find(
      (m) => m.methodChain.includes("chat.completions.create") && m.loopContext === true
    );
    assert.ok(found, "forEach callback API call must be detected with loopContext=true");
    assert.equal(found!.provider, "openai");
  });

  await run("callback: Promise.all(items.map(fetchData)) where fetchData calls Stripe → detected", async () => {
    const src = `
      import Stripe from 'stripe';
      const stripe = new Stripe('sk_test');

      async function fetchData(id) {
        return await stripe.paymentIntents.retrieve(id);
      }

      await Promise.all(ids.map(fetchData));
    `;
    const { matches } = await scan(src, "javascript", "/project/src/index.js");
    const found = matches.find(
      (m) => m.methodChain.includes("paymentIntents.retrieve") && m.loopContext === true
    );
    assert.ok(found, "Promise.all(map(fn)) callback must be detected with loopContext=true");
    assert.equal(found!.provider, "stripe");
  });

  await run("callback: items.forEach(localFunction) with no API calls → NOT detected", async () => {
    const src = `
      function localFunction(item) {
        return item.toString().toUpperCase();
      }

      const items = [1, 2, 3];
      items.forEach(localFunction);
    `;
    const { matches } = await scan(src, "javascript", "/project/src/index.js");
    // No API calls anywhere — should be empty
    assert.equal(matches.length, 0, "non-API callback should not produce matches");
  });

  // ── Typed parameter detection ─────────────────────────────────────────────────

  await run("typed param (TS): function helper(client: OpenAI) → detected", async () => {
    const src = `
      import OpenAI from 'openai';

      async function helper(client: OpenAI) {
        return await client.chat.completions.create({ model: 'gpt-4o', messages: [] });
      }
    `;
    const { matches } = await scan(src, "typescript");
    const found = matches.find((m) => m.methodChain.includes("chat.completions.create"));
    assert.ok(found, "TS typed param must allow detection");
    assert.equal(found!.provider, "openai");
  });

  await run("typed param (JS): same pattern without types → NOT detected", async () => {
    const src = `
      async function helper(client) {
        return await client.chat.completions.create({ model: 'gpt-4o', messages: [] });
      }
    `;
    const { matches } = await scan(src, "javascript", "/project/src/index.js");
    // No import, no type annotation → can't resolve client to any package
    const found = matches.find((m) => m.methodChain.includes("chat.completions.create"));
    assert.equal(found, undefined, "untyped JS param must not be detected without import");
  });

  // ── Middleware detection ──────────────────────────────────────────────────────

  await run("middleware: app.use(authMiddleware) where fn calls API in same file → tagged", async () => {
    const src = `
      import OpenAI from 'openai';
      const openai = new OpenAI();

      async function authMiddleware(req, res, next) {
        await openai.moderations.create({ input: req.body.text });
        next();
      }

      const app = { use: (fn) => fn };
      app.use(authMiddleware);
    `;
    const { matches } = await scan(src, "javascript", "/project/src/index.js");
    const found = matches.find((m) => m.isMiddleware === true);
    assert.ok(found, "same-file middleware API call must be tagged with isMiddleware=true");
    assert.equal(found!.provider, "openai");
  });

  await run("middleware: app.use(importedMiddleware) → added to middlewareQueue", async () => {
    const src = `
      import { authMiddleware } from './auth';
      const app = { use: (fn) => fn };
      app.use(authMiddleware);
    `;
    const { middlewareQueue } = await scan(src, "typescript");
    assert.ok(
      middlewareQueue.includes("authMiddleware"),
      "imported middleware must be added to middlewareQueue"
    );
  });

  // ── this.field detection ──────────────────────────────────────────────────────

  await run("this.field: class with this.openai = new OpenAI() in constructor", async () => {
    const src = `
      import OpenAI from 'openai';

      class ApiService {
        constructor() {
          this.openai = new OpenAI();
        }
        async complete(prompt: string) {
          return await this.openai.chat.completions.create({ model: 'gpt-4o', messages: [] });
        }
      }
    `;
    const { classRegistry } = await scan(src, "typescript");
    const svc = classRegistry.get("ApiService");
    assert.ok(svc, "ApiService must be in classRegistry");
    assert.ok(svc!.methods.has("complete"), "complete method must be registered");
    const calls = svc!.methods.get("complete")!;
    assert.ok(
      calls.some((m) => m.provider === "openai"),
      "this.openai.chat.completions.create must resolve to openai"
    );
  });

  // ── Multiple providers in one file ────────────────────────────────────────────

  await run("multi-provider: OpenAI + Stripe in same file → both detected", async () => {
    const src = `
      import OpenAI from 'openai';
      import Stripe from 'stripe';
      const openai = new OpenAI();
      const stripe = new Stripe('sk_test');

      async function run() {
        const chat = await openai.chat.completions.create({ model: 'gpt-4o', messages: [] });
        const pi = await stripe.paymentIntents.create({ amount: 500, currency: 'usd' });
      }
    `;
    const { matches } = await scan(src, "javascript", "/project/src/index.js");
    assert.ok(
      matches.some((m) => m.provider === "openai"),
      "must detect openai call"
    );
    assert.ok(
      matches.some((m) => m.provider === "stripe"),
      "must detect stripe call"
    );
  });
})().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
