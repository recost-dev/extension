"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vertexMatcher = void 0;
exports.vertexMatcher = {
    name: "provider-vertex",
    matchLine(line) {
        const matches = [];
        const sdkRegex = /\b(?:vertex|vertexAi|vertexAI|client|generativeModel)\.(generateContent|streamGenerateContent|generate_content|stream_generate_content|embedContent|embed_content)\s*\(/gi;
        let sdkMatch;
        while ((sdkMatch = sdkRegex.exec(line)) !== null) {
            const action = sdkMatch[1];
            const snake = action.toLowerCase();
            const streaming = snake.includes("stream");
            const embedding = snake.includes("embed");
            const method = "POST";
            const endpoint = embedding
                ? "https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:predict"
                : `https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/google/models/{model}:${streaming ? "streamGenerateContent" : "generateContent"}`;
            matches.push({
                kind: "sdk",
                provider: "vertex-ai",
                sdk: "vertex-ai",
                method,
                endpoint,
                resource: "projects/{project}/locations/{location}/publishers/google/models/{model}",
                action,
                streaming,
                batchCapable: embedding,
                cacheCapable: !embedding,
                rawMatch: sdkMatch[0],
            });
        }
        const restRegex = /https?:\/\/[a-z0-9-]+-aiplatform\.googleapis\.com\/v1\/projects\/[^\s'"`]+\/locations\/[^\s'"`]+\/(?:publishers\/google\/models\/[^\s'"`]+:(?:generateContent|streamGenerateContent|predict)|endpoints\/[^\s'"`]+:(?:generateContent|streamGenerateContent|predict))/gi;
        let restMatch;
        while ((restMatch = restRegex.exec(line)) !== null) {
            const endpoint = restMatch[0];
            matches.push({
                kind: "http",
                provider: "vertex-ai",
                sdk: "rest",
                method: "POST",
                endpoint,
                resource: endpoint.includes("/endpoints/") ? "endpoint" : "publisher-model",
                action: endpoint.split(":").pop(),
                streaming: /streamGenerateContent/i.test(endpoint),
                batchCapable: /predict/i.test(endpoint),
                cacheCapable: /generateContent/i.test(endpoint),
                rawMatch: restMatch[0],
            });
        }
        return matches;
    },
};
//# sourceMappingURL=provider-vertex.js.map