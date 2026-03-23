"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listKeyServices = listKeyServices;
exports.getKeyService = getKeyService;
exports.maskKeyPreview = maskKeyPreview;
exports.resolveKeyState = resolveKeyState;
exports.readStoredSecret = readStoredSecret;
exports.buildKeyStatusSummary = buildKeyStatusSummary;
exports.validateServiceKey = validateServiceKey;
const chat_1 = require("./chat");
const errors_1 = require("./chat/errors");
const api_client_1 = require("./api-client");
const ECOAPI_SERVICE = {
    serviceId: "ecoapi",
    displayName: "ReCost",
    kind: "ecoapi",
    secretStorageKey: "recost.apiKey",
    supportsTest: true,
};
function listKeyServices() {
    const providerServices = (0, chat_1.listProviderAdapters)()
        .filter((provider) => provider.id !== "recost" && provider.auth.required)
        .map((provider) => ({
        serviceId: provider.id,
        displayName: provider.displayName,
        kind: "provider",
        providerId: provider.id,
        envKeyName: provider.auth.envKeyName,
        secretStorageKey: provider.auth.secretStorageKey,
        supportsTest: true,
    }));
    return [ECOAPI_SERVICE, ...providerServices];
}
function getKeyService(serviceId) {
    const service = listKeyServices().find((entry) => entry.serviceId === serviceId);
    if (!service) {
        throw new Error(`Unsupported key service: ${serviceId}`);
    }
    return service;
}
function maskKeyPreview(value) {
    if (!value?.trim())
        return undefined;
    const trimmed = value.trim();
    return `${trimmed.slice(0, 6)}••••••••••`;
}
function resolveKeyState(source, validation) {
    if (validation)
        return validation.state;
    if (source === "env")
        return "from_environment";
    if (source === "secret")
        return "saved";
    return "missing";
}
async function readStoredSecret(service, secrets) {
    if (!service.secretStorageKey)
        return undefined;
    const direct = await secrets.get(service.secretStorageKey);
    if (direct?.trim())
        return direct.trim();
    if (service.serviceId === "openai") {
        const legacy = await secrets.get("recost.openaiApiKey");
        if (legacy?.trim())
            return legacy.trim();
    }
    return undefined;
}
async function buildKeyStatusSummary(service, secrets, validationState) {
    const envValue = service.envKeyName ? process.env[service.envKeyName]?.trim() : undefined;
    const storedValue = await readStoredSecret(service, secrets);
    const source = envValue ? "env" : storedValue ? "secret" : "missing";
    return {
        serviceId: service.serviceId,
        displayName: service.displayName,
        kind: service.kind,
        providerId: service.providerId,
        envKeyName: service.envKeyName,
        source,
        state: resolveKeyState(source, validationState),
        message: validationState?.message,
        maskedPreview: maskKeyPreview(envValue ?? storedValue),
        lastCheckedAt: validationState?.lastCheckedAt,
        supportsTest: service.supportsTest,
    };
}
async function validateServiceKey(service, apiKey) {
    const lastCheckedAt = new Date().toISOString();
    try {
        if (service.kind === "ecoapi") {
            await (0, api_client_1.validateEcoApiKey)(apiKey);
            return { state: "valid", lastCheckedAt };
        }
        const adapter = (0, chat_1.getProviderAdapter)(service.providerId ?? "");
        const model = adapter.models[0]?.id;
        if (!model) {
            return { state: "invalid", message: `${adapter.displayName} has no configured test model.`, lastCheckedAt };
        }
        await (0, chat_1.executeChat)({
            request: {
                provider: adapter.id,
                model,
                messages: [{ role: "user", content: "Reply with OK." }],
                maxTokens: 8,
                temperature: 0,
                stream: false,
            },
            secrets: {
                get: async (key) => {
                    if (key === adapter.auth.secretStorageKey)
                        return apiKey;
                    if (adapter.id === "openai" && key === "recost.openaiApiKey")
                        return apiKey;
                    return undefined;
                },
            },
        });
        return { state: "valid", lastCheckedAt };
    }
    catch (error) {
        if (error instanceof errors_1.ChatAdapterError && error.code === "bad_auth") {
            return { state: "invalid", message: error.message, lastCheckedAt };
        }
        if (error instanceof Error && service.kind === "ecoapi" && /401|403|unauth|invalid/i.test(error.message)) {
            return { state: "invalid", message: error.message, lastCheckedAt };
        }
        throw error;
    }
}
//# sourceMappingURL=key-management.js.map