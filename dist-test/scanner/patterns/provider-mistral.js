"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mistralMatcher = void 0;
const registry_1 = require("../fingerprints/registry");
exports.mistralMatcher = {
    name: "provider-mistral",
    matchLine(line) {
        const matches = [];
        const chatRegex = /\b(?:mistral|mistralClient|client)\.chat\.(complete|stream)\s*\(/gi;
        let chatMatch;
        while ((chatMatch = chatRegex.exec(line)) !== null) {
            const action = chatMatch[1].toLowerCase();
            const pattern = `chat.${action}`;
            const reg = (0, registry_1.lookupMethod)("mistral", pattern);
            if (!reg)
                console.warn(`[fingerprints] no registry entry for mistral/${pattern}`);
            matches.push({
                kind: "sdk",
                provider: "mistral",
                sdk: "mistral",
                method: reg?.httpMethod ?? "POST",
                endpoint: reg?.endpoint ?? "https://api.mistral.ai/v1/chat/completions",
                resource: "chat/completions",
                action,
                streaming: reg?.streaming ?? action === "stream",
                batchCapable: reg?.batchCapable,
                cacheCapable: reg?.cacheCapable ?? true,
                rawMatch: chatMatch[0],
            });
        }
        const otherRegex = /\b(?:mistral|mistralClient|client)\.(embeddings|ocr|files)\.(create|list|retrieve|upload|delete|process)\s*\(/gi;
        let otherMatch;
        while ((otherMatch = otherRegex.exec(line)) !== null) {
            const resource = otherMatch[1].toLowerCase();
            const action = otherMatch[2].toLowerCase();
            const pattern = `${resource}.${action}`;
            const reg = (0, registry_1.lookupMethod)("mistral", pattern);
            // Fallback HTTP method and endpoint
            const fbMethod = action === "list" || action === "retrieve" ? "GET" : action === "delete" ? "DELETE" : "POST";
            const fbEndpoint = `https://api.mistral.ai/v1/${resource}${action === "list" || action === "create" || action === "upload" || action === "process" ? "" : "/{id}"}`;
            if (!reg)
                console.warn(`[fingerprints] no registry entry for mistral/${pattern}`);
            matches.push({
                kind: "sdk",
                provider: "mistral",
                sdk: "mistral",
                method: reg?.httpMethod ?? fbMethod,
                endpoint: reg?.endpoint ?? fbEndpoint,
                resource,
                action,
                batchCapable: reg?.batchCapable ?? resource === "embeddings",
                cacheCapable: reg?.cacheCapable,
                rawMatch: otherMatch[0],
            });
        }
        return matches;
    },
};
//# sourceMappingURL=provider-mistral.js.map