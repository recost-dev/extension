"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listProviderAdapters = listProviderAdapters;
exports.getProviderAdapter = getProviderAdapter;
exports.findModelMetadata = findModelMetadata;
exports.getDefaultChatSelection = getDefaultChatSelection;
exports.buildProviderOptions = buildProviderOptions;
exports.resolveProviderAuth = resolveProviderAuth;
const errors_1 = require("./errors");
const anthropic_1 = require("./providers/anthropic");
const cohere_1 = require("./providers/cohere");
const eco_1 = require("./providers/eco");
const gemini_1 = require("./providers/gemini");
const mistral_1 = require("./providers/mistral");
const openai_1 = require("./providers/openai");
const perplexity_1 = require("./providers/perplexity");
const xai_1 = require("./providers/xai");
const providers = [
    eco_1.ecoAdapter,
    openai_1.openAiAdapter,
    anthropic_1.anthropicAdapter,
    gemini_1.geminiAdapter,
    xai_1.xAiAdapter,
    cohere_1.cohereAdapter,
    mistral_1.mistralAdapter,
    perplexity_1.perplexityAdapter,
];
function listProviderAdapters() {
    return providers.slice();
}
function getProviderAdapter(providerId) {
    const provider = providers.find((entry) => entry.id === providerId);
    if (!provider) {
        throw new errors_1.ChatAdapterError("unsupported_provider", `Unsupported chat provider: ${providerId}`);
    }
    return provider;
}
function findModelMetadata(providerId, modelId) {
    return getProviderAdapter(providerId).models.find((model) => model.id === modelId);
}
function getDefaultChatSelection() {
    return { provider: "eco", model: "eco-ai" };
}
function buildProviderOptions() {
    return providers.map((provider) => ({
        id: provider.id,
        displayName: provider.displayName,
        envKeyName: provider.auth.envKeyName,
        baseUrl: provider.baseUrl,
        defaultChatEndpoint: provider.defaultChatEndpoint,
        authHeaderFormat: provider.authHeaderFormat,
        supportsStreaming: provider.supportsStreaming,
        models: provider.models.map((model) => ({
            id: model.id,
            displayName: model.displayName,
            providerId: provider.id,
            supportsStreaming: model.supportsStreaming ?? provider.supportsStreaming,
        })),
    }));
}
async function resolveProviderAuth(providerId, secrets) {
    const provider = getProviderAdapter(providerId);
    if (!provider.auth.required) {
        return { source: "none" };
    }
    const envKeyName = provider.auth.envKeyName;
    if (envKeyName) {
        const envValue = process.env[envKeyName];
        if (envValue?.trim()) {
            return { apiKey: envValue.trim(), source: "env" };
        }
    }
    const secretKeys = [provider.auth.secretStorageKey];
    if (provider.id === "openai") {
        secretKeys.push("eco.openaiApiKey");
    }
    if (secrets) {
        for (const secretKey of secretKeys) {
            if (!secretKey)
                continue;
            const secretValue = await secrets.get(secretKey);
            if (secretValue?.trim()) {
                return { apiKey: secretValue.trim(), source: "secret" };
            }
        }
    }
    throw new errors_1.ChatAdapterError("missing_api_key", provider.auth.envKeyName
        ? `${provider.displayName} API key is missing. Set ${provider.auth.envKeyName} or save a key in the extension.`
        : `${provider.displayName} API key is missing.`, { provider: provider.id, envKeyName: provider.auth.envKeyName });
}
//# sourceMappingURL=provider-registry.js.map