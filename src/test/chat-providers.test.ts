import assert from "node:assert/strict";
import { ChatAdapterError } from "../chat/errors";
import { executeChat, getProviderAdapter, listProviderAdapters, resolveProviderAuth } from "../chat";

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(fn)
    .then(() => process.stdout.write(`✓ ${name}\n`))
    .catch((error) => {
      process.stderr.write(`✗ ${name}\n`);
      throw error;
    });
}

test("registry exposes all provider adapters", () => {
  const ids = listProviderAdapters().map((provider) => provider.id);
  assert.deepEqual(ids, ["eco", "openai", "anthropic", "gemini", "xai", "cohere", "mistral", "perplexity"]);
});

test("openai adapter builds chat completions payload", () => {
  const adapter = getProviderAdapter("openai");
  const built = adapter.toRequestBody(
    {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "System" },
        { role: "user", content: "Hello" },
      ],
      stream: true,
      temperature: 0.7,
      maxTokens: 200,
    },
    "test-key"
  );
  assert.equal(built.url, "https://api.openai.com/v1/chat/completions");
  assert.equal((built.body as Record<string, unknown>).stream, true);
  assert.equal(((built.body as Record<string, unknown>).messages as Array<{ role: string }>)[0].role, "system");
});

test("anthropic adapter maps system prompt and non-system messages", () => {
  const adapter = getProviderAdapter("anthropic");
  const built = adapter.toRequestBody(
    {
      provider: "anthropic",
      model: "claude-3-5-haiku-latest",
      messages: [
        { role: "system", content: "Rules" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ],
      stream: false,
    },
    "test-key"
  );
  const body = built.body as Record<string, unknown>;
  assert.equal(body.system, "Rules");
  assert.equal(((body.messages as Array<unknown>)[0] as Record<string, unknown>).role, "user");
  assert.equal((body.messages as Array<unknown>).length, 2);
});

test("gemini adapter maps contents and system instruction", () => {
  const adapter = getProviderAdapter("gemini");
  const built = adapter.toRequestBody(
    {
      provider: "gemini",
      model: "gemini-2.0-flash",
      messages: [
        { role: "system", content: "Be concise" },
        { role: "user", content: "Hello" },
      ],
      stream: true,
    },
    "test-key"
  );
  assert.match(built.url, /streamGenerateContent\?alt=sse$/);
  const body = built.body as Record<string, unknown>;
  assert.ok(body.systemInstruction);
  assert.equal(((body.contents as Array<unknown>)[0] as Record<string, unknown>).role, "user");
});

test("unsupported model errors are normalized", () => {
  const adapter = getProviderAdapter("mistral");
  assert.throws(
    () => adapter.validateRequest({ provider: "mistral", model: "bad-model", messages: [], stream: false }),
    (error) => error instanceof ChatAdapterError && error.code === "unsupported_model"
  );
});

test("missing auth resolves to normalized error", async () => {
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(
    () => resolveProviderAuth("openai", { get: async () => undefined }),
    (error) => error instanceof ChatAdapterError && error.code === "missing_api_key" && error.envKeyName === "OPENAI_API_KEY"
  );
});

test("http 429 maps to rate_limited", async () => {
  process.env.PERPLEXITY_API_KEY = "env-key";
  await assert.rejects(
    () =>
      executeChat({
        request: {
          provider: "perplexity",
          model: "sonar",
          messages: [{ role: "user", content: "Hello" }],
          stream: false,
        },
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: "too many" } }), { status: 429 }),
      }),
    (error) => error instanceof ChatAdapterError && error.code === "rate_limited"
  );
});

test("eco adapter preserves current response shape", async () => {
  const response = await executeChat({
    request: {
      provider: "eco",
      model: "eco-ai",
      messages: [{ role: "user", content: "Hello" }],
      stream: false,
    },
    fetchImpl: async () => new Response(JSON.stringify({ data: { response: "eco reply" } }), { status: 200 }),
  });
  assert.equal(response.content, "eco reply");
});
