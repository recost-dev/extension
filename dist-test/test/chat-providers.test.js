"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const errors_1 = require("../chat/errors");
const chat_1 = require("../chat");
const key_management_1 = require("../key-management");
function test(name, fn) {
    Promise.resolve()
        .then(fn)
        .then(() => process.stdout.write(`✓ ${name}\n`))
        .catch((error) => {
        process.stderr.write(`✗ ${name}\n`);
        throw error;
    });
}
test("registry exposes all provider adapters", () => {
    const ids = (0, chat_1.listProviderAdapters)().map((provider) => provider.id);
    strict_1.default.deepEqual(ids, ["recost", "openai", "anthropic", "gemini", "xai", "cohere", "mistral", "perplexity"]);
});
test("openai adapter builds chat completions payload", () => {
    const adapter = (0, chat_1.getProviderAdapter)("openai");
    const built = adapter.toRequestBody({
        provider: "openai",
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: "System" },
            { role: "user", content: "Hello" },
        ],
        stream: true,
        temperature: 0.7,
        maxTokens: 200,
    }, "test-key");
    strict_1.default.equal(built.url, "https://api.openai.com/v1/chat/completions");
    strict_1.default.equal(built.body.stream, true);
    strict_1.default.equal(built.body.messages[0].role, "system");
});
test("anthropic adapter maps system prompt and non-system messages", () => {
    const adapter = (0, chat_1.getProviderAdapter)("anthropic");
    const built = adapter.toRequestBody({
        provider: "anthropic",
        model: "claude-3-5-haiku-latest",
        messages: [
            { role: "system", content: "Rules" },
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi" },
        ],
        stream: false,
    }, "test-key");
    const body = built.body;
    strict_1.default.equal(body.system, "Rules");
    strict_1.default.equal(body.messages[0].role, "user");
    strict_1.default.equal(body.messages.length, 2);
});
test("gemini adapter maps contents and system instruction", () => {
    const adapter = (0, chat_1.getProviderAdapter)("gemini");
    const built = adapter.toRequestBody({
        provider: "gemini",
        model: "gemini-2.0-flash",
        messages: [
            { role: "system", content: "Be concise" },
            { role: "user", content: "Hello" },
        ],
        stream: true,
    }, "test-key");
    strict_1.default.match(built.url, /streamGenerateContent\?alt=sse$/);
    const body = built.body;
    strict_1.default.ok(body.systemInstruction);
    strict_1.default.equal(body.contents[0].role, "user");
});
test("unsupported model errors are normalized", () => {
    const adapter = (0, chat_1.getProviderAdapter)("mistral");
    strict_1.default.throws(() => adapter.validateRequest({ provider: "mistral", model: "bad-model", messages: [], stream: false }), (error) => error instanceof errors_1.ChatAdapterError && error.code === "unsupported_model");
});
test("openai-compatible providers validate against their own model lists", () => {
    const adapter = (0, chat_1.getProviderAdapter)("mistral");
    const built = adapter.toRequestBody({
        provider: "mistral",
        model: "mistral-small-latest",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
    }, "test-key");
    strict_1.default.equal(built.url, "https://api.mistral.ai/v1/chat/completions");
    strict_1.default.equal(built.body.model, "mistral-small-latest");
});
test("missing auth resolves to normalized error", async () => {
    delete process.env.OPENAI_API_KEY;
    await strict_1.default.rejects(() => (0, chat_1.resolveProviderAuth)("openai", { get: async () => undefined }), (error) => error instanceof errors_1.ChatAdapterError && error.code === "missing_api_key" && error.envKeyName === "OPENAI_API_KEY");
});
test("http 429 maps to rate_limited", async () => {
    process.env.PERPLEXITY_API_KEY = "env-key";
    await strict_1.default.rejects(() => (0, chat_1.executeChat)({
        request: {
            provider: "perplexity",
            model: "sonar",
            messages: [{ role: "user", content: "Hello" }],
            stream: false,
        },
        fetchImpl: async () => new Response(JSON.stringify({ error: { message: "too many" } }), { status: 429 }),
    }), (error) => error instanceof errors_1.ChatAdapterError && error.code === "rate_limited");
});
test("recost adapter preserves current response shape", async () => {
    const response = await (0, chat_1.executeChat)({
        request: {
            provider: "recost",
            model: "recost-ai",
            messages: [{ role: "user", content: "Hello" }],
            stream: false,
        },
        fetchImpl: async () => new Response(JSON.stringify({ data: { response: "recost reply" } }), { status: 200 }),
    });
    strict_1.default.equal(response.content, "recost reply");
});
test("key services include ecoapi and supported providers", () => {
    const ids = (0, key_management_1.listKeyServices)().map((service) => service.serviceId);
    strict_1.default.deepEqual(ids, ["ecoapi", "openai", "anthropic", "gemini", "xai", "cohere", "mistral", "perplexity"]);
});
test("key status summary prefers environment over secret", async () => {
    process.env.GEMINI_API_KEY = "env-gemini-key";
    const gemini = (0, key_management_1.listKeyServices)().find((service) => service.serviceId === "gemini");
    strict_1.default.ok(gemini);
    const summary = await (0, key_management_1.buildKeyStatusSummary)(gemini, { get: async () => "stored-gemini-key" });
    strict_1.default.equal(summary.source, "env");
    strict_1.default.equal(summary.state, "from_environment");
    strict_1.default.equal(summary.maskedPreview, "env-ge••••••••••");
    delete process.env.GEMINI_API_KEY;
});
test("key status summary reports saved for stored secrets", async () => {
    const openai = (0, key_management_1.listKeyServices)().find((service) => service.serviceId === "openai");
    strict_1.default.ok(openai);
    const summary = await (0, key_management_1.buildKeyStatusSummary)(openai, { get: async (key) => (key === "eco.providerApiKey.openai" ? "sk-test-secret" : undefined) });
    strict_1.default.equal(summary.source, "secret");
    strict_1.default.equal(summary.state, "saved");
    strict_1.default.equal(summary.maskedPreview, "sk-tes••••••••••");
});
test("maskKeyPreview returns stable preview", () => {
    strict_1.default.equal((0, key_management_1.maskKeyPreview)("abc12345"), "abc123••••••••••");
    strict_1.default.equal((0, key_management_1.maskKeyPreview)("sk-super-secret"), "sk-sup••••••••••");
});
//# sourceMappingURL=chat-providers.test.js.map