import { ApiCallMatch, LineMatcher } from "./types";
import { normalizeDynamic, normalizeMethod } from "./utils";

interface PatternDef {
  sdk: string;
  regex: RegExp;
  methodGroup: number | null;
  urlGroup: number;
  fixedMethod?: string;
  normalizeUrl?: (raw: string) => string;
}

const PATTERN_DEFS: PatternDef[] = [
  {
    sdk: "fetch",
    regex: /fetch\(\s*['"`]([^'"`\n]+)['"`]\s*,\s*\{[^}]*method:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/gi,
    urlGroup: 1,
    methodGroup: 2,
  },
  {
    sdk: "fetch",
    regex: /fetch\(\s*['"`]([^'"`\n]+)['"`]/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    sdk: "fetch",
    regex: /fetch\(\s*`([^`]+)`/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    sdk: "fetch",
    regex: /fetch\(\s*([A-Za-z_$][\w$.]*)/gi,
    urlGroup: 1,
    methodGroup: null,
    normalizeUrl: normalizeDynamic,
  },
  {
    sdk: "axios",
    regex: /axios\.(get|post|put|patch|delete|head|options)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "axios",
    regex: /axios\(\s*['"`]([^'"`\n]+)['"`]/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    sdk: "axios",
    regex: /axios\(\s*([A-Za-z_$][\w$.]*)/gi,
    methodGroup: null,
    urlGroup: 1,
    normalizeUrl: normalizeDynamic,
  },
  {
    sdk: "got",
    regex: /got\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "got",
    regex: /got\(\s*['"`]([^'"`\s]+)['"`]/gi,
    urlGroup: 1,
    methodGroup: null,
  },
  {
    sdk: "superagent",
    regex: /superagent\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "ky",
    regex: /ky\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "requests",
    regex: /requests\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "requests",
    regex: /requests\.(get|post|put|patch|delete)\(\s*([A-Za-z_][\w.]*)/gi,
    methodGroup: 1,
    urlGroup: 2,
    normalizeUrl: normalizeDynamic,
  },
  {
    sdk: "http",
    regex: /http\.(Get|Post|Head)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "HttpClient",
    regex: /(?:this\.)?http\.(get|post|put|patch|delete)\s*(?:<[^>]*>)?\s*\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "$http",
    regex: /\$http\.(get|post|put|patch|delete)\(\s*['"`]([^'"`\s]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
  {
    sdk: "api-helper",
    regex: /(?:this\.)?(get|post|put|patch|delete)\(\s*['"`](\/[^'"`\n]+)['"`]/gi,
    methodGroup: 1,
    urlGroup: 2,
  },
];

function mapPatternMatch(def: PatternDef, match: RegExpExecArray): ApiCallMatch {
  const method = def.fixedMethod ?? (def.methodGroup !== null ? normalizeMethod(match[def.methodGroup]) : "GET");
  const rawUrl = match[def.urlGroup];
  const endpoint = def.normalizeUrl ? def.normalizeUrl(rawUrl) : rawUrl;

  return {
    kind: "http",
    sdk: def.sdk,
    provider: "generic-http",
    method,
    endpoint,
    resource: endpoint,
    rawMatch: match[0],
  };
}

export const genericHttpMatcher: LineMatcher = {
  name: "generic-http",
  matchLine(line: string): ApiCallMatch[] {
    const matches: ApiCallMatch[] = [];

    for (const def of PATTERN_DEFS) {
      def.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = def.regex.exec(line)) !== null) {
        matches.push(mapPatternMatch(def, match));
      }
    }

    return matches;
  },
};
