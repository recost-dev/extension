"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeChat = executeChat;
const errors_1 = require("./errors");
const provider_registry_1 = require("./provider-registry");
async function readJsonOrText(response) {
    const text = await response.text();
    if (!text.trim())
        return { text };
    try {
        return { json: JSON.parse(text), text };
    }
    catch {
        return { text };
    }
}
async function emitSseStream(response, parseChunk, onChunk) {
    const reader = response.body?.getReader();
    if (!reader) {
        throw new errors_1.ChatAdapterError("malformed_response", "Streaming response body was missing.");
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done)
            break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith("data:"))
                continue;
            const payloadText = line.slice(5).trim();
            if (!payloadText || payloadText === "[DONE]")
                continue;
            let parsed = payloadText;
            try {
                parsed = JSON.parse(payloadText);
            }
            catch {
                parsed = payloadText;
            }
            const chunk = parseChunk(parsed);
            if (!chunk)
                continue;
            if (chunk.delta)
                fullContent += chunk.delta;
            if (onChunk)
                await onChunk(chunk);
        }
    }
    return fullContent;
}
async function executeChat(options) {
    const { request, secrets, onChunk, fetchImpl = fetch } = options;
    const adapter = (0, provider_registry_1.getProviderAdapter)(request.provider);
    adapter.validateRequest(request);
    if (request.stream && !adapter.supportsStreaming) {
        throw new errors_1.ChatAdapterError("streaming_not_supported", `${adapter.displayName} does not support streaming in this integration.`, {
            provider: adapter.id,
        });
    }
    const auth = await (0, provider_registry_1.resolveProviderAuth)(adapter.id, secrets);
    const built = adapter.toRequestBody(request, auth.apiKey);
    let response;
    try {
        response = await fetchImpl(built.url, {
            method: "POST",
            headers: built.headers,
            body: JSON.stringify(built.body),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Unknown network error";
        throw new errors_1.ChatAdapterError("network_error", `Network error. ${message}`, { provider: adapter.id });
    }
    if (!response.ok) {
        const payload = await readJsonOrText(response);
        throw adapter.mapHttpError({ status: response.status, bodyText: payload.text }, request);
    }
    if (request.stream && adapter.parseStreamChunk) {
        const content = await emitSseStream(response, (chunk) => adapter.parseStreamChunk?.(chunk, request) ?? null, onChunk);
        return {
            provider: adapter.id,
            model: request.model,
            content,
        };
    }
    const payload = await readJsonOrText(response);
    if (payload.json === undefined) {
        throw new errors_1.ChatAdapterError("malformed_response", `${adapter.displayName} returned a non-JSON response.`, { provider: adapter.id });
    }
    return adapter.parseResponse(payload.json, request);
}
__exportStar(require("./errors"), exports);
__exportStar(require("./provider-registry"), exports);
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map