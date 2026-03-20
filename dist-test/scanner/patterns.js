"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchNormalizedLine = matchNormalizedLine;
exports.matchLine = matchLine;
exports.matchNormalizedRouteDefinitionLine = matchNormalizedRouteDefinitionLine;
exports.matchRouteDefinitionLine = matchRouteDefinitionLine;
exports.getLoopDepth = getLoopDepth;
exports.isInsideLoop = isInsideLoop;
const registry_1 = require("./patterns/registry");
const utils_1 = require("./patterns/utils");
const LOOP_KEYWORDS = /\b(for|while|forEach|\.map|\.flatMap|\.reduce)\b/;
const LOOP_END_HINT = /[)}\]]\s*;?\s*$/;
function matchNormalizedLine(line) {
    const matches = [];
    for (const matcher of registry_1.LINE_MATCHERS) {
        matches.push(...matcher.matchLine(line));
    }
    return (0, utils_1.uniqueMatches)(matches);
}
function matchLine(line) {
    const normalized = matchNormalizedLine(line);
    return (0, utils_1.toHttpCallMatches)(normalized);
}
function matchNormalizedRouteDefinitionLine(line) {
    const matches = [];
    for (const matcher of registry_1.ROUTE_MATCHERS) {
        matches.push(...matcher.matchLine(line));
    }
    return (0, utils_1.uniqueMatches)(matches);
}
function matchRouteDefinitionLine(line) {
    const normalized = matchNormalizedRouteDefinitionLine(line);
    return (0, utils_1.toHttpCallMatches)(normalized);
}
function getLoopDepth(lines, currentIndex) {
    const lookback = Math.max(0, currentIndex - 12);
    let depth = 0;
    for (let i = lookback; i < currentIndex; i++) {
        const line = lines[i];
        if (LOOP_KEYWORDS.test(line)) {
            depth += 1;
            continue;
        }
        if (depth > 0 && LOOP_END_HINT.test(line) && !/[{][^}]*$/.test(line)) {
            depth -= 1;
        }
    }
    return Math.max(0, depth);
}
function isInsideLoop(lines, currentIndex) {
    return getLoopDepth(lines, currentIndex) > 0;
}
//# sourceMappingURL=patterns.js.map