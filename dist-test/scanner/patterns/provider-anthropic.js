"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.anthropicMatcher = void 0;
function anthropicEndpoint(resource, action) {
    const normalizedResource = resource.replace(/_/g, "").toLowerCase();
    const normalizedAction = action.toLowerCase();
    if (normalizedResource === "messages") {
        if (normalizedAction === "create")
            return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages" };
        if (normalizedAction === "stream") {
            return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages", streaming: true };
        }
    }
    if (normalizedResource === "messagebatches") {
        if (normalizedAction === "create")
            return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages/batches", batchCapable: true };
        if (normalizedAction === "list")
            return { method: "GET", endpoint: "https://api.anthropic.com/v1/messages/batches", batchCapable: true };
        if (normalizedAction === "retrieve")
            return { method: "GET", endpoint: "https://api.anthropic.com/v1/messages/batches/{id}", batchCapable: true };
        if (normalizedAction === "cancel")
            return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages/batches/{id}/cancel", batchCapable: true };
    }
    if (normalizedResource === "files") {
        if (normalizedAction === "create")
            return { method: "POST", endpoint: "https://api.anthropic.com/v1/files" };
        if (normalizedAction === "list")
            return { method: "GET", endpoint: "https://api.anthropic.com/v1/files" };
        if (normalizedAction === "retrieve")
            return { method: "GET", endpoint: "https://api.anthropic.com/v1/files/{id}" };
        if (normalizedAction === "delete")
            return { method: "DELETE", endpoint: "https://api.anthropic.com/v1/files/{id}" };
    }
    return null;
}
exports.anthropicMatcher = {
    name: "provider-anthropic",
    matchLine(line) {
        const matches = [];
        const sdkCallRegex = /\b(?:anthropic|client|claude|anthropicClient)(?:\.beta)?\.(messages|files|messageBatches|message_batches)\.(create|retrieve|list|delete|cancel|stream)\s*\(/gi;
        let sdkMatch;
        while ((sdkMatch = sdkCallRegex.exec(line)) !== null) {
            const resource = sdkMatch[1];
            const action = sdkMatch[2];
            const mapped = anthropicEndpoint(resource, action);
            if (!mapped)
                continue;
            matches.push({
                kind: "sdk",
                provider: "anthropic",
                sdk: "anthropic",
                method: mapped.method,
                endpoint: mapped.endpoint,
                resource: resource,
                action,
                streaming: mapped.streaming,
                batchCapable: mapped.batchCapable,
                cacheCapable: /messages/i.test(resource),
                rawMatch: sdkMatch[0],
            });
        }
        const streamHintRegex = /\b(?:messages\.stream|stream\s*=\s*true|with_streaming_response)\b/gi;
        if (streamHintRegex.test(line)) {
            matches.push({
                kind: "sdk",
                provider: "anthropic",
                sdk: "anthropic",
                method: "POST",
                endpoint: "https://api.anthropic.com/v1/messages",
                resource: "messages",
                action: "create",
                streaming: true,
                cacheCapable: true,
            });
        }
        return matches;
    },
};
//# sourceMappingURL=provider-anthropic.js.map