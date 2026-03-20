"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.perplexityAdapter = void 0;
const errors_1 = require("../errors");
const openai_1 = require("./openai");
exports.perplexityAdapter = {
    ...openai_1.openAiAdapter,
    id: "perplexity",
    displayName: "Perplexity",
    baseUrl: "https://api.perplexity.ai",
    defaultChatEndpoint: "/chat/completions",
    auth: {
        envKeyName: "PERPLEXITY_API_KEY",
        secretStorageKey: "eco.providerApiKey.perplexity",
        required: true,
    },
    models: [
        { id: "sonar", displayName: "Sonar", provider: "perplexity", supportsStreaming: true },
        { id: "sonar-pro", displayName: "Sonar Pro", provider: "perplexity", supportsStreaming: true },
        { id: "sonar-reasoning", displayName: "Sonar Reasoning", provider: "perplexity", supportsStreaming: true },
    ],
    validateRequest(request) {
        if (!exports.perplexityAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported Perplexity model: ${request.model}`, { provider: "perplexity" });
        }
    },
    mapHttpError(context) {
        if (context.status === 401 || context.status === 403) {
            return new errors_1.ChatAdapterError("bad_auth", "Perplexity authentication failed. Check PERPLEXITY_API_KEY or saved credentials.", { provider: "perplexity", status: context.status });
        }
        if (context.status === 429) {
            return new errors_1.ChatAdapterError("rate_limited", "Perplexity rate limit reached. Wait and try again.", { provider: "perplexity", status: context.status });
        }
        return new errors_1.ChatAdapterError("provider_error", `Perplexity request failed: ${context.bodyText || "Unknown error"}`, { provider: "perplexity", status: context.status });
    },
};
//# sourceMappingURL=perplexity.js.map