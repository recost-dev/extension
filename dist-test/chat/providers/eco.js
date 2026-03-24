"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ecoAdapter = void 0;
const errors_1 = require("../errors");
exports.ecoAdapter = {
    id: "recost",
    displayName: "ReCost AI",
    baseUrl: "https://api.recost.dev",
    defaultChatEndpoint: "/chat",
    authHeaderFormat: "none",
    supportsStreaming: false,
    auth: {
        required: false,
    },
    models: [
        { id: "recost-ai", displayName: "Llama 3.1 (Free)", provider: "recost", supportsStreaming: false },
    ],
    authHeaders() {
        return {};
    },
    validateRequest(request) {
        if (!exports.ecoAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported ReCost model: ${request.model}`, { provider: "recost" });
        }
        if (request.stream) {
            throw new errors_1.ChatAdapterError("streaming_not_supported", "ReCost AI streaming is not supported.", { provider: "recost" });
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
            content: (0, errors_1.ensureStringContent)(payload?.data?.response, "No response from ReCost AI. The service may be temporarily unavailable.", "recost"),
            raw: response,
        };
    },
    mapHttpError(context) {
        return new errors_1.ChatAdapterError("provider_error", `ReCost AI request failed: ${context.bodyText || "Unknown error"}`, { provider: "recost", status: context.status });
    },
};
//# sourceMappingURL=eco.js.map