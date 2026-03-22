"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bedrockMatcher = void 0;
const registry_1 = require("../fingerprints/registry");
// Fallback endpoint data used when registry lookup misses
const COMMAND_MAP = {
    InvokeModelCommand: {
        action: "invoke_model",
        endpoint: "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke",
        method: "POST",
    },
    ConverseCommand: {
        action: "converse",
        endpoint: "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse",
        method: "POST",
    },
    ConverseStreamCommand: {
        action: "converse_stream",
        endpoint: "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse-stream",
        method: "POST",
        streaming: true,
    },
};
exports.bedrockMatcher = {
    name: "provider-bedrock",
    matchLine(line) {
        const matches = [];
        const jsRegex = /\.send\(\s*new\s+(InvokeModelCommand|ConverseCommand|ConverseStreamCommand)\s*\(/gi;
        let jsMatch;
        while ((jsMatch = jsRegex.exec(line)) !== null) {
            const command = jsMatch[1];
            const reg = (0, registry_1.lookupMethod)("aws-bedrock", command);
            const fb = COMMAND_MAP[command];
            if (!reg)
                console.warn(`[fingerprints] no registry entry for aws-bedrock/${command}`);
            matches.push({
                kind: "sdk",
                provider: "aws-bedrock",
                sdk: "aws-sdk-bedrock-runtime",
                method: reg?.httpMethod ?? fb?.method ?? "POST",
                endpoint: reg?.endpoint ?? fb?.endpoint ?? "",
                resource: "model/{modelId}",
                action: fb?.action ?? command.toLowerCase(),
                streaming: reg?.streaming ?? fb?.streaming,
                batchCapable: reg?.batchCapable ?? false,
                cacheCapable: reg?.cacheCapable ?? true,
                rawMatch: jsMatch[0],
            });
        }
        const botoRegex = /\b(?:bedrock|client|runtime_client)\.(invoke_model|converse|converse_stream)\s*\(/gi;
        let botoMatch;
        while ((botoMatch = botoRegex.exec(line)) !== null) {
            const action = botoMatch[1].toLowerCase();
            const reg = (0, registry_1.lookupMethod)("aws-bedrock", action);
            // Fallback endpoint construction
            const fbEndpoint = action === "invoke_model"
                ? "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/invoke"
                : action === "converse"
                    ? "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse"
                    : "https://bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse-stream";
            if (!reg)
                console.warn(`[fingerprints] no registry entry for aws-bedrock/${action}`);
            matches.push({
                kind: "sdk",
                provider: "aws-bedrock",
                sdk: "boto3-bedrock-runtime",
                method: reg?.httpMethod ?? "POST",
                endpoint: reg?.endpoint ?? fbEndpoint,
                resource: "model/{modelId}",
                action,
                streaming: reg?.streaming ?? action === "converse_stream",
                batchCapable: reg?.batchCapable,
                cacheCapable: reg?.cacheCapable ?? true,
                rawMatch: botoMatch[0],
            });
        }
        return matches;
    },
};
//# sourceMappingURL=provider-bedrock.js.map