import { ApiCallMatch, LineMatcher } from "./types";
import { lookupMethod } from "../fingerprints/registry";

const COHERE_ACTIONS = new Set(["chat", "embed", "rerank"]);

export const cohereMatcher: LineMatcher = {
  name: "provider-cohere",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];
    const regex = /\b(?:cohere|cohereClient|client)\.(chat|embed|rerank)\s*\(/gi;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      const action = match[1].toLowerCase();
      if (!COHERE_ACTIONS.has(action)) continue;

      const reg = lookupMethod("cohere", action);

      if (!reg) console.warn(`[fingerprints] no registry entry for cohere/${action}`);

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
