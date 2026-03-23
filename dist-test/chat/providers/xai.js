"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.xAiAdapter = void 0;
const errors_1 = require("../errors");
const openai_1 = require("./openai");
exports.xAiAdapter = {
    ...openai_1.openAiAdapter,
    id: "xai",
    displayName: "xAI (Grok)",
    baseUrl: "https://api.x.ai",
    auth: {
        envKeyName: "XAI_API_KEY",
        secretStorageKey: "eco.providerApiKey.xai",
        required: true,
    },
    models: [
        { id: "grok-2-latest", displayName: "Grok 2", provider: "xai", supportsStreaming: true },
        { id: "grok-2-vision-latest", displayName: "Grok 2 Vision", provider: "xai", supportsStreaming: true },
        { id: "grok-beta", displayName: "Grok Beta", provider: "xai", supportsStreaming: true },
    ],
    validateRequest(request) {
        if (!exports.xAiAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported xAI model: ${request.model}`, { provider: "xai" });
        }
    },
    toRequestBody(request, apiKey) {
        exports.xAiAdapter.validateRequest(request);
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
            url: `${exports.xAiAdapter.baseUrl}${exports.xAiAdapter.defaultChatEndpoint}`,
            headers: {
                "Content-Type": "application/json",
                ...exports.xAiAdapter.authHeaders(apiKey ?? ""),
            },
            body,
        };
    },
    mapHttpError(context) {
        if (context.status === 401 || context.status === 403) {
            return new errors_1.ChatAdapterError("bad_auth", "xAI authentication failed. Check XAI_API_KEY or saved credentials.", { provider: "xai", status: context.status });
        }
        if (context.status === 429) {
            return new errors_1.ChatAdapterError("rate_limited", "xAI rate limit reached. Wait and try again.", { provider: "xai", status: context.status });
        }
        return new errors_1.ChatAdapterError("provider_error", `xAI request failed: ${context.bodyText || "Unknown error"}`, { provider: "xai", status: context.status });
    },
};
//# sourceMappingURL=xai.js.map