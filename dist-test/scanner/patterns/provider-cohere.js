"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cohereMatcher = void 0;
const registry_1 = require("../fingerprints/registry");
const COHERE_ACTIONS = new Set(["chat", "embed", "rerank"]);
exports.cohereMatcher = {
    name: "provider-cohere",
    matchLine(line) {
        const matches = [];
        const regex = /\b(?:cohere|cohereClient|client)\.(chat|embed|rerank)\s*\(/gi;
        let match;
        while ((match = regex.exec(line)) !== null) {
            const action = match[1].toLowerCase();
            if (!COHERE_ACTIONS.has(action))
                continue;
            const reg = (0, registry_1.lookupMethod)("cohere", action);
            if (!reg)
                console.warn(`[fingerprints] no registry entry for cohere/${action}`);
            matches.push({
                kind: "sdk",
                provider: "cohere",
                sdk: "cohere",
                method: reg?.httpMethod ?? "POST",
                endpoint: reg?.endpoint ?? `https://api.cohere.com/v1/${action}`,
                resource: action,
                action,
                batchCapable: reg?.batchCapable ?? (action === "embed" || action === "rerank"),
                cacheCapable: reg?.cacheCapable ?? action === "chat",
                rawMatch: match[0],
            });
        }
        return matches;
    },
};
//# sourceMappingURL=provider-cohere.js.map