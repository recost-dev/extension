"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mistralAdapter = void 0;
const errors_1 = require("../errors");
const openai_1 = require("./openai");
exports.mistralAdapter = {
    ...openai_1.openAiAdapter,
    id: "mistral",
    displayName: "Mistral",
    baseUrl: "https://api.mistral.ai",
    auth: {
        envKeyName: "MISTRAL_API_KEY",
        secretStorageKey: "eco.providerApiKey.mistral",
        required: true,
    },
    models: [
        { id: "mistral-small-latest", displayName: "Mistral Small", provider: "mistral", supportsStreaming: true },
        { id: "mistral-large-latest", displayName: "Mistral Large", provider: "mistral", supportsStreaming: true },
        { id: "open-mixtral-8x22b", displayName: "Mixtral 8x22B", provider: "mistral", supportsStreaming: true },
    ],
    validateRequest(request) {
        if (!exports.mistralAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported Mistral model: ${request.model}`, { provider: "mistral" });
        }
    },
    mapHttpError(context) {
        if (context.status === 401 || context.status === 403) {
            return new errors_1.ChatAdapterError("bad_auth", "Mistral authentication failed. Check MISTRAL_API_KEY or saved credentials.", { provider: "mistral", status: context.status });
        }
        if (context.status === 429) {
            return new errors_1.ChatAdapterError("rate_limited", "Mistral rate limit reached. Wait and try again.", { provider: "mistral", status: context.status });
        }
        return new errors_1.ChatAdapterError("provider_error", `Mistral request failed: ${context.bodyText || "Unknown error"}`, { provider: "mistral", status: context.status });
    },
};
//# sourceMappingURL=mistral.js.map