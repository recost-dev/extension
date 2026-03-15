import { LINE_MATCHERS, ROUTE_MATCHERS } from "./patterns/registry";
import { ApiCallMatch, HttpCallMatch } from "./patterns/types";
import { toHttpCallMatches, uniqueMatches } from "./patterns/utils";

const LOOP_KEYWORDS = /\b(for|while|forEach|\.map|\.flatMap|\.reduce)\b/;

export type { ApiCallMatch, HttpCallMatch };

export function matchNormalizedLine(line: string): ApiCallMatch[] {
  const matches: ApiCallMatch[] = [];
  for (const matcher of LINE_MATCHERS) {
    matches.push(...matcher.matchLine(line));
  }
  return uniqueMatches(matches);
}

export function matchLine(line: string): HttpCallMatch[] {
  const normalized = matchNormalizedLine(line);
  return toHttpCallMatches(normalized);
}

export function matchNormalizedRouteDefinitionLine(line: string): ApiCallMatch[] {
  const matches: ApiCallMatch[] = [];
  for (const matcher of ROUTE_MATCHERS) {
    matches.push(...matcher.matchLine(line));
  }
  return uniqueMatches(matches);
}

export function matchRouteDefinitionLine(line: string): HttpCallMatch[] {
  const normalized = matchNormalizedRouteDefinitionLine(line);
  return toHttpCallMatches(normalized);
}

export function isInsideLoop(lines: string[], currentIndex: number): boolean {
  const lookback = Math.max(0, currentIndex - 5);
  for (let i = lookback; i < currentIndex; i++) {
    if (LOOP_KEYWORDS.test(lines[i])) {
      return true;
    }
  }
  return false;
}
