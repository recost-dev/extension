"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiMatcher = void 0;
function mapGeminiAction(action) {
    const normalized = action.toLowerCase();
    if (normalized === "generatecontent" || normalized === "generate_content") {
        return { method: "POST", endpointSuffix: ":generateContent" };
    }
    if (normalized === "streamgeneratecontent" || normalized === "stream_generate_content") {
        return { method: "POST", endpointSuffix: ":streamGenerateContent", streaming: true };
    }
    if (normalized === "embedcontent" || normalized === "embed_content") {
        return { method: "POST", endpointSuffix: ":embedContent", batchCapable: true };
    }
    if (normalized === "batchgeneratecontent" || normalized === "batch_generate_content") {
        return { method: "POST", endpointSuffix: ":batchGenerateContent", batchCapable: true };
    }
    return null;
}
exports.geminiMatcher = {
    name: "provider-gemini",
    matchLine(line) {
        const matches = [];
        const modelCallRegex = /\b(?:genai|client|gemini|googleAI|google_genai)\.models\.(generateContent|streamGenerateContent|embedContent|batchGenerateContent|generate_content|stream_generate_content|embed_content|batch_generate_content)\s*\(/gi;
        let modelMatch;
        while ((modelMatch = modelCallRegex.exec(line)) !== null) {
            const action = modelMatch[1];
            const mapped = mapGeminiAction(action);
            if (!mapped)
                continue;
            matches.push({
                kind: "sdk",
                provider: "gemini",
                sdk: "google-genai",
                method: mapped.method,
                endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}${mapped.endpointSuffix}`,
                resource: "models/{model}",
                action,
                streaming: mapped.streaming,
                batchCapable: mapped.batchCapable,
                cacheCapable: /generate/i.test(action),
                rawMatch: modelMatch[0],
            });
        }
        const fileRegex = /\b(?:genai|client|gemini|googleAI|google_genai)\.files\.(upload|get|list|delete)\s*\(/gi;
        let fileMatch;
        while ((fileMatch = fileRegex.exec(line)) !== null) {
            const action = fileMatch[1].toLowerCase();
            const method = action === "get" || action === "list" ? "GET" : action === "delete" ? "DELETE" : "POST";
            const endpoint = action === "list"
                ? "https://generativelanguage.googleapis.com/v1beta/files"
                : action === "upload"
                    ? "https://generativelanguage.googleapis.com/upload/v1beta/files"
                    : "https://generativelanguage.googleapis.com/v1beta/files/{id}";
            matches.push({
                kind: "sdk",
                provider: "gemini",
                sdk: "google-genai",
                method,
                endpoint,
                resource: "files",
                action,
                rawMatch: fileMatch[0],
            });
        }
        const restRegex = /https?:\/\/generativelanguage\.googleapis\.com\/(v1(?:beta)?\/models\/[^\s'"`]+:(?:generateContent|streamGenerateContent|embedContent)|v1(?:beta)?\/files\/?[^\s'"`]*)/gi;
        let restMatch;
        while ((restMatch = restRegex.exec(line)) !== null) {
            const endpoint = restMatch[0];
            const streaming = /streamGenerateContent/i.test(endpoint);
            matches.push({
                kind: "http",
                provider: "gemini",
                sdk: "rest",
                method: "POST",
                endpoint,
                resource: endpoint.includes("/files") ? "files" : "models",
                action: endpoint.split(":").pop(),
                streaming,
                batchCapable: /embedContent/i.test(endpoint),
                rawMatch: restMatch[0],
            });
        }
        return matches;
    },
};
//# sourceMappingURL=provider-gemini.js.map