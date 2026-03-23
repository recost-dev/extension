import { ApiCallMatch, LineMatcher } from "./types";
import { lookupMethod } from "../fingerprints/registry";

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

// Fallback for model action → endpoint suffix mapping
function mapGeminiAction(action: string): { method: string; endpointSuffix: string; streaming?: boolean; batchCapable?: boolean } | null {
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

export const geminiMatcher: LineMatcher = {
  name: "provider-gemini",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    const modelCallRegex =
      /\b(?:genai|client|gemini|googleAI|google_genai)\.models\.(generateContent|streamGenerateContent|embedContent|batchGenerateContent|generate_content|stream_generate_content|embed_content|batch_generate_content)\s*\(/gi;
    let modelMatch: RegExpExecArray | null;
    while ((modelMatch = modelCallRegex.exec(line)) !== null) {
      const action = modelMatch[1];
      const pattern = `models.${toCamel(action)}`;
      const reg = lookupMethod("gemini", pattern);
      const fb = mapGeminiAction(action);

      if (!reg) console.warn(`[fingerprints] no registry entry for gemini/${pattern}`);

      const fbEndpoint = fb ? `https://generativelanguage.googleapis.com/v1beta/models/{model}${fb.endpointSuffix}` : undefined;

      matches.push({
        kind: "sdk",
        provider: "gemini",
        sdk: "google-genai",
        method: reg?.httpMethod ?? fb?.method ?? "POST",
        endpoint: reg?.endpoint ?? fbEndpoint ?? "",
        resource: "models/{model}",
        action,
        streaming: reg?.streaming ?? fb?.streaming,
        batchCapable: reg?.batchCapable ?? fb?.batchCapable,
        cacheCapable: reg?.cacheCapable ?? /generate/i.test(action),
        rawMatch: modelMatch[0],
      });
    }

    const fileRegex = /\b(?:genai|client|gemini|googleAI|google_genai)\.files\.(upload|get|list|delete)\s*\(/gi;
    let fileMatch: RegExpExecArray | null;
    while ((fileMatch = fileRegex.exec(line)) !== null) {
      const action = fileMatch[1].toLowerCase();
      const pattern = `files.${action}`;
      const reg = lookupMethod("gemini", pattern);

      // Fallback endpoint construction
      const fbEndpoint =
        action === "list"
          ? "https://generativelanguage.googleapis.com/v1beta/files"
          : action === "upload"
            ? "https://generativelanguage.googleapis.com/upload/v1beta/files"
            : "https://generativelanguage.googleapis.com/v1beta/files/{id}";
      const fbMethod = action === "get" || action === "list" ? "GET" : action === "delete" ? "DELETE" : "POST";

      if (!reg) console.warn(`[fingerprints] no registry entry for gemini/${pattern}`);

      matches.push({
        kind: "sdk",
        provider: "gemini",
        sdk: "google-genai",
        method: reg?.httpMethod ?? fbMethod,
        endpoint: reg?.endpoint ?? fbEndpoint,
        resource: "files",
        action,
        batchCapable: reg?.batchCapable,
        cacheCapable: reg?.cacheCapable,
        rawMatch: fileMatch[0],
      });
    }

    const restRegex =
      /https?:\/\/generativelanguage\.googleapis\.com\/(v1(?:beta)?\/models\/[^\s'"`]+:(?:generateContent|streamGenerateContent|embedContent)|v1(?:beta)?\/files\/?[^\s'"`]*)/gi;
    let restMatch: RegExpExecArray | null;
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
