"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openAiAdapter = void 0;
const errors_1 = require("../errors");
function buildOpenAiUsage(raw) {
    const usage = raw.usage;
    if (!usage)
        return undefined;
    return {
        inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
        outputTokens: typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
        totalTokens: typeof usage.total_tokens === "number" ? usage.total_tokens : undefined,
    };
}
function extractOpenAiContent(payload) {
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const first = choices[0];
    const message = first?.message;
    return (0, errors_1.ensureStringContent)(message?.content, "OpenAI returned an empty response.", "openai");
}
exports.openAiAdapter = {
    id: "openai",
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com",
    defaultChatEndpoint: "/v1/chat/completions",
    authHeaderFormat: "Authorization: Bearer <key>",
    supportsStreaming: true,
    auth: {
        envKeyName: "OPENAI_API_KEY",
        secretStorageKey: "eco.providerApiKey.openai",
        required: true,
    },
    models: [
        { id: "gpt-4o-mini", displayName: "GPT-4o Mini", provider: "openai", supportsStreaming: true },
        { id: "gpt-4o", displayName: "GPT-4o", provider: "openai", supportsStreaming: true },
        { id: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", provider: "openai", supportsStreaming: true },
        { id: "gpt-4.1", displayName: "GPT-4.1", provider: "openai", supportsStreaming: true },
        { id: "o3-mini", displayName: "o3 Mini", provider: "openai", supportsStreaming: false, reasoning: true },
        { id: "o1", displayName: "o1", provider: "openai", supportsStreaming: false, reasoning: true },
        { id: "o3", displayName: "o3", provider: "openai", supportsStreaming: false, reasoning: true },
    ],
    authHeaders(apiKey) {
        return { Authorization: `Bearer ${apiKey}` };
    },
    validateRequest(request) {
        const supported = exports.openAiAdapter.models.some((model) => model.id === request.model);
        if (!supported) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported OpenAI model: ${request.model}`, { provider: "openai" });
        }
    },
    toRequestBody(request, apiKey) {
        exports.openAiAdapter.validateRequest(request);
        const body = {
            model: request.model,
            messages: request.messages,
        };
        if (typeof request.temperature === "number")
            body.temperature = request.temperature;
        if (typeof request.maxTokens === "number")
            body.max_tokens = request.maxTokens;
        if (request.stream)
            body.stream = true;
        return {
            url: `${exports.openAiAdapter.baseUrl}${exports.openAiAdapter.defaultChatEndpoint}`,
            headers: {
                "Content-Type": "application/json",
                ...exports.openAiAdapter.authHeaders(apiKey ?? ""),
            },
            body,
        };
    },
    parseResponse(response, request) {
        const payload = response;
        return {
            provider: exports.openAiAdapter.id,
            model: request.model,
            content: extractOpenAiContent(payload),
            stopReason: (Array.isArray(payload.choices) ? payload.choices[0] : undefined)?.finish_reason,
            usage: buildOpenAiUsage(payload),
            raw: response,
        };
    },
    parseStreamChunk(chunk, request) {
        const payload = chunk;
        const choices = Array.isArray(payload.choices) ? payload.choices : [];
        const first = choices[0];
        const delta = first?.delta?.content;
        const done = first?.finish_reason != null;
        if (typeof delta !== "string" && !done)
            return null;
        return {
            provider: exports.openAiAdapter.id,
            model: request.model,
            delta: typeof delta === "string" ? delta : "",
            done,
            raw: payload,
        };
    },
    mapHttpError(context) {
        if (context.status === 401 || context.status === 403) {
            return new errors_1.ChatAdapterError("bad_auth", "OpenAI authentication failed. Check OPENAI_API_KEY or saved credentials.", { provider: "openai", status: context.status });
        }
        if (context.status === 429) {
            return new errors_1.ChatAdapterError("rate_limited", "OpenAI rate limit reached. Wait and try again.", { provider: "openai", status: context.status });
        }
        return new errors_1.ChatAdapterError("provider_error", `OpenAI request failed: ${context.bodyText || "Unknown error"}`, { provider: "openai", status: context.status });
    },
};
//# sourceMappingURL=openai.js.map