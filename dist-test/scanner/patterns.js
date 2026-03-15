"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchNormalizedLine = matchNormalizedLine;
exports.matchLine = matchLine;
exports.matchNormalizedRouteDefinitionLine = matchNormalizedRouteDefinitionLine;
exports.matchRouteDefinitionLine = matchRouteDefinitionLine;
exports.isInsideLoop = isInsideLoop;
const registry_1 = require("./patterns/registry");
const utils_1 = require("./patterns/utils");
const LOOP_KEYWORDS = /\b(for|while|forEach|\.map|\.flatMap|\.reduce)\b/;
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
function isInsideLoop(lines, currentIndex) {
    const lookback = Math.max(0, currentIndex - 5);
    for (let i = lookback; i < currentIndex; i++) {
        if (LOOP_KEYWORDS.test(lines[i])) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=patterns.js.map