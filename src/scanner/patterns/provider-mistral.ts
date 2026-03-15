import { ApiCallMatch, LineMatcher } from "./types";

export const mistralMatcher: LineMatcher = {
  name: "provider-mistral",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const chatRegex = /\b(?:mistral|mistralClient|client)\.chat\.(complete|stream)\s*\(/gi;
    let chatMatch: RegExpExecArray | null;
    while ((chatMatch = chatRegex.exec(line)) !== null) {
      const action = chatMatch[1].toLowerCase();
      const streaming = action === "stream";
      matches.push({
        kind: "sdk",
        provider: "mistral",
        sdk: "mistral",
        method: "POST",
        endpoint: "https://api.mistral.ai/v1/chat/completions",
        resource: "chat/completions",
        action,
        streaming,
        cacheCapable: true,
        rawMatch: chatMatch[0],
      });
    }

    const otherRegex = /\b(?:mistral|mistralClient|client)\.(embeddings|ocr|files)\.(create|list|retrieve|upload|delete)\s*\(/gi;
    let otherMatch: RegExpExecArray | null;
    while ((otherMatch = otherRegex.exec(line)) !== null) {
      const resource = otherMatch[1].toLowerCase();
      const action = otherMatch[2].toLowerCase();
      const method = action === "list" || action === "retrieve" ? "GET" : action === "delete" ? "DELETE" : "POST";
      const endpoint = `https://api.mistral.ai/v1/${resource}${action === "list" || action === "create" || action === "upload" ? "" : "/{id}"}`;
      matches.push({
        kind: "sdk",
        provider: "mistral",
        sdk: "mistral",
        method,
        endpoint,
        resource,
        action,
        batchCapable: resource === "embeddings",
        rawMatch: otherMatch[0],
      });
    }

    return matches;
  },
};
