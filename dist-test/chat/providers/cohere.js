"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cohereAdapter = void 0;
const errors_1 = require("../errors");
exports.cohereAdapter = {
    id: "cohere",
    displayName: "Cohere",
    baseUrl: "https://api.cohere.com",
    defaultChatEndpoint: "/v2/chat",
    authHeaderFormat: "Authorization: Bearer <key>",
    supportsStreaming: true,
    auth: {
        envKeyName: "COHERE_API_KEY",
        secretStorageKey: "eco.providerApiKey.cohere",
        required: true,
    },
    models: [
        { id: "command-r", displayName: "Command R", provider: "cohere", supportsStreaming: true },
        { id: "command-r-plus", displayName: "Command R+", provider: "cohere", supportsStreaming: true },
    ],
    authHeaders(apiKey) {
        return { Authorization: `Bearer ${apiKey}` };
    },
    validateRequest(request) {
        if (!exports.cohereAdapter.models.some((model) => model.id === request.model)) {
            throw new errors_1.ChatAdapterError("unsupported_model", `Unsupported Cohere model: ${request.model}`, { provider: "cohere" });
        }
    },
    toRequestBody(request, apiKey) {
        exports.cohereAdapter.validateRequest(request);
        const systemPrompt = request.systemPrompt ?? request.messages.find((message) => message.role === "system")?.content;
        const chatHistory = request.messages
            .filter((message) => message.role !== "system")
            .slice(0, -1)
            .map((message) => ({
            role: message.role === "assistant" ? "CHATBOT" : "USER",
            message: message.content,
        }));
        const latest = request.messages.filter((message) => message.role !== "system").slice(-1)[0];
        return {
            url: `${exports.cohereAdapter.baseUrl}${exports.cohereAdapter.defaultChatEndpoint}`,
            headers: {
                "Content-Type": "application/json",
                ...exports.cohereAdapter.authHeaders(apiKey ?? ""),
            },
            body: {
                model: request.model,
                message: latest?.content ?? "",
                chat_history: chatHistory,
                preamble: systemPrompt,
                temperature: request.temperature,
                max_tokens: request.maxTokens,
                stream: Boolean(request.stream),
            },
        };
    },
    parseResponse(response, request) {
        const payload = response;
        const contentBlocks = payload.message?.content ?? [];
        const text = payload.text ??
            contentBlocks.map((item) => (typeof item.text === "string" ? item.text : "")).join("");
        return {
            provider: exports.cohereAdapter.id,
            model: request.model,
            content: (0, errors_1.ensureStringContent)(text, "Cohere returned an empty response.", "cohere"),
            usage: payload.usage
                ? {
                    inputTokens: payload.usage.billed_units?.input_tokens,
                    outputTokens: payload.usage.billed_units?.output_tokens,
                }
                : undefined,
            raw: response,
        };
    },
    parseStreamChunk(chunk, request) {
        const payload = chunk;
        const delta = payload.text ??
            payload.delta?.message?.content?.toString?.() ??
            payload.delta?.text ??
            payload.message?.content?.map((item) => (typeof item.text === "string" ? item.text : "")).join("") ??
            "";
        const eventType = payload.type ?? payload.event_type;
        if (!delta && eventType !== "message-end" && eventType !== "stream-end") {
            return null;
        }
        return {
            provider: exports.cohereAdapter.id,
            model: request.model,
            delta,
            done: eventType === "message-end" || eventType === "stream-end",
            raw: payload,
        };
    },
    mapHttpError(context) {
        if (context.status === 401 || context.status === 403) {
            return new errors_1.ChatAdapterError("bad_auth", "Cohere authentication failed. Check COHERE_API_KEY or saved credentials.", { provider: "cohere", status: context.status });
        }
        if (context.status === 429) {
            return new errors_1.ChatAdapterError("rate_limited", "Cohere rate limit reached. Wait and try again.", { provider: "cohere", status: context.status });
        }
        return new errors_1.ChatAdapterError("provider_error", `Cohere request failed: ${context.bodyText || "Unknown error"}`, { provider: "cohere", status: context.status });
    },
};
//# sourceMappingURL=cohere.js.map