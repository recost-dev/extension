import { ApiCallMatch, LineMatcher } from "./types";
import { lookupMethod } from "../fingerprints/registry";

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Fallback endpoint resolution when registry lookup misses
function anthropicEndpoint(resource: string, action: string): { method: string; endpoint: string; batchCapable?: boolean; streaming?: boolean } | null {
  const r = resource.replace(/_/g, "").toLowerCase();
  const a = action.toLowerCase();

  if (r === "messages") {
    if (a === "create") return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages" };
    if (a === "stream") return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages", streaming: true };
  }
  if (r === "messagebatches") {
    if (a === "create") return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages/batches", batchCapable: true };
    if (a === "list") return { method: "GET", endpoint: "https://api.anthropic.com/v1/messages/batches", batchCapable: true };
    if (a === "retrieve") return { method: "GET", endpoint: "https://api.anthropic.com/v1/messages/batches/{id}", batchCapable: true };
    if (a === "cancel") return { method: "POST", endpoint: "https://api.anthropic.com/v1/messages/batches/{id}/cancel", batchCapable: true };
  }
  if (r === "files") {
    if (a === "create") return { method: "POST", endpoint: "https://api.anthropic.com/v1/files" };
    if (a === "list") return { method: "GET", endpoint: "https://api.anthropic.com/v1/files" };
    if (a === "retrieve") return { method: "GET", endpoint: "https://api.anthropic.com/v1/files/{id}" };
    if (a === "delete") return { method: "DELETE", endpoint: "https://api.anthropic.com/v1/files/{id}" };
  }
  return null;
}

export const anthropicMatcher: LineMatcher = {
  name: "provider-anthropic",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const sdkCallRegex =
      /\b(?:anthropic|client|claude|anthropicClient)(?:\.beta)?\.(messages|files|messageBatches|message_batches)\.(create|retrieve|list|delete|cancel|stream)\s*\(/gi;

    let sdkMatch: RegExpExecArray | null;
    while ((sdkMatch = sdkCallRegex.exec(line)) !== null) {
      const resource = sdkMatch[1];
      const action = sdkMatch[2];
      const pattern = `${toCamel(resource)}.${action}`;
      const reg = lookupMethod("anthropic", pattern);
      const fb = anthropicEndpoint(resource, action);

      if (!reg) console.warn(`[fingerprints] no registry entry for anthropic/${pattern}`);

      matches.push({
        kind: "sdk",
        provider: "anthropic",
        sdk: "anthropic",
        method: reg?.httpMethod ?? fb?.method ?? "POST",
        endpoint: reg?.endpoint ?? fb?.endpoint ?? "https://api.anthropic.com/v1/messages",
        resource,
        action,
        streaming: reg?.streaming ?? fb?.streaming,
        batchCapable: reg?.batchCapable ?? fb?.batchCapable,
        cacheCapable: reg?.cacheCapable ?? /messages/i.test(resource),
        rawMatch: sdkMatch[0],
      });
    }

    const streamHintRegex = /\b(?:messages\.stream|stream\s*=\s*true|with_streaming_response)\b/gi;
    if (streamHintRegex.test(line)) {
      const reg = lookupMethod("anthropic", "messages.stream");
      matches.push({
        kind: "sdk",
        provider: "anthropic",
        sdk: "anthropic",
        method: reg?.httpMethod ?? "POST",
        endpoint: reg?.endpoint ?? "https://api.anthropic.com/v1/messages",
        resource: "messages",
        action: "create",
        streaming: true,
        cacheCapable: reg?.cacheCapable ?? true,
      });
    }

    return matches;
  },
};
