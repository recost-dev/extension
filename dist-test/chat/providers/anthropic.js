"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicAdapter = void 0;
const errors_1 = require("../errors");
function anthropicMessages(request) {
    return request.messages
        .filter((message) => message.role !== "system")
        .map((message) => ({
        role: message.role,
        content: [{ type: "text", text: message.content }],
    }));
}
exports.anthropicAdapter = {
    id: "anthropic",
    displayName: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    defaultChatEndpoint: "/v1/messages",
    authHeaderFormat: "x-api-key",
    supportsStreaming: true,
    auth: {
        envKeyName: "ANTHROPIC_API_KEY",
        secretStorageKey: "eco.providerApiKey.anthropic",
        required: true,
    },
    models: [
        { id: "claude-3-5-haiku-latest", displayName: "Claude 3.5 Haiku", provider: "anthropic", supportsStreaming: true },
        { id: "claude-3-7-sonnet-latest", displayName: "Claude 3.7 Sonnet", provider: "anthropic", supportsStreaming: true },
        { id: "claude-3-5-sonnet-latest", displayName: "Claude 3.5 Sonnet", provider: "anthropic", supportsStreaming: true },
    ],
    authHeaders(apiKey) {
        return {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        };
    },
    validateRequest(request) {
        if (!exports.anthropicAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported Anthropic model: ${request.model}`, { provider: "anthropic" });
        }
    },
    toRequestBody(request, apiKey) {
        exports.anthropicAdapter.validateRequest(request);
        const systemPrompt = request.systemPrompt ??
            request.messages.find((message) => message.role === "system")?.content;
        const body = {
            model: request.model,
            messages: anthropicMessages(request),
            stream: Boolean(request.stream),
        };
        if (systemPrompt)
            body.system = systemPrompt;
        if (typeof request.maxTokens === "number")
            body.max_tokens = request.maxTokens;
        else
            body.max_tokens = 1024;
        if (typeof request.temperature === "number")
            body.temperature = request.temperature;
        return {
            url: `${exports.anthropicAdapter.baseUrl}${exports.anthropicAdapter.defaultChatEndpoint}`,
            headers: {
                "Content-Type": "application/json",
                ...exports.anthropicAdapter.authHeaders(apiKey ?? ""),
            },
            body,
        };
    },
    parseResponse(response, request) {
        const payload = response;
        const content = Array.isArray(payload.content) ? payload.content : [];
        const text = content
            .map((item) => item.text ?? "")
            .join("");
        return {
            provider: exports.anthropicAdapter.id,
            model: request.model,
            content: (0, errors_1.ensureStringContent)(text, "Anthropic returned an empty response.", "anthropic"),
            stopReason: payload.stop_reason,
            usage: payload.usage
                ? {
                    inputTokens: payload.usage.input_tokens,
                    outputTokens: payload.usage.output_tokens,
                    totalTokens: (payload.usage.input_tokens ?? 0) +
                        (payload.usage.output_tokens ?? 0),
                }
                : undefined,
            raw: response,
        };
    },
    parseStreamChunk(chunk, request) {
        const payload = chunk;
        if (payload.type === "content_block_delta") {
            const delta = payload.delta?.text ?? "";
            if (!delta)
                return null;
            return { provider: exports.anthropicAdapter.id, model: request.model, delta, raw: payload };
        }
        if (payload.type === "message_stop") {
            return { provider: exports.anthropicAdapter.id, model: request.model, delta: "", done: true, raw: payload };
        }
        return null;
    },
    mapHttpError(context) {
        if (context.status === 401 || context.status === 403) {
            return new errors_1.ChatAdapterError("bad_auth", "Anthropic authentication failed. Check ANTHROPIC_API_KEY or saved credentials.", { provider: "anthropic", status: context.status });
        }
        if (context.status === 429) {
            return new errors_1.ChatAdapterError("rate_limited", "Anthropic rate limit reached. Wait and try again.", { provider: "anthropic", status: context.status });
        }
        return new errors_1.ChatAdapterError("provider_error", `Anthropic request failed: ${context.bodyText || "Unknown error"}`, { provider: "anthropic", status: context.status });
    },
};
//# sourceMappingURL=anthropic.js.map