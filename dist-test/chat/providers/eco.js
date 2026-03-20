"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ecoAdapter = void 0;
const errors_1 = require("../errors");
exports.ecoAdapter = {
    id: "eco",
    displayName: "ECO AI",
    baseUrl: "https://api.ecoapi.dev",
    defaultChatEndpoint: "/chat",
    authHeaderFormat: "none",
    supportsStreaming: false,
    auth: {
        required: false,
    },
    models: [
        { id: "eco-ai", displayName: "Llama 3.1 (Free)", provider: "eco", supportsStreaming: false },
    ],
    authHeaders() {
        return {};
    },
    validateRequest(request) {
        if (!exports.ecoAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported ECO model: ${request.model}`, { provider: "eco" });
        }
        if (request.stream) {
            throw new errors_1.ChatAdapterError("streaming_not_supported", "ECO AI streaming is not supported.", { provider: "eco" });
        }
    },
    toRequestBody(request) {
        exports.ecoAdapter.validateRequest(request);
        return {
            url: `${exports.ecoAdapter.baseUrl}${exports.ecoAdapter.defaultChatEndpoint}`,
            headers: { "Content-Type": "application/json" },
            body: { messages: request.messages },
        };
    },
    parseResponse(response, request) {
        const payload = response;
        return {
            provider: exports.ecoAdapter.id,
            model: request.model,
            content: (0, errors_1.ensureStringContent)(payload?.data?.response, "No response from ECO AI. The service may be temporarily unavailable.", "eco"),
            raw: response,
        };
    },
    mapHttpError(context) {
        return new errors_1.ChatAdapterError("provider_error", `ECO AI request failed: ${context.bodyText || "Unknown error"}`, { provider: "eco", status: context.status });
    },
};
//# sourceMappingURL=eco.js.map