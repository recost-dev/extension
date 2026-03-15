"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSnakeCase = toSnakeCase;
exports.normalizeMethod = normalizeMethod;
exports.parseHost = parseHost;
exports.uniqueMatches = uniqueMatches;
exports.toHttpCallMatches = toHttpCallMatches;
exports.normalizeDynamic = normalizeDynamic;
exports.withRisk = withRisk;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
function toSnakeCase(value) {
    return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function normalizeMethod(value, fallback = "GET") {
    if (!value)
        return fallback;
    const normalized = value.toUpperCase();
    return HTTP_METHODS.has(normalized) ? normalized : fallback;
}
function parseHost(url) {
    if (!url)
        return undefined;
    try {
        if (!/^https?:\/\//i.test(url))
            return undefined;
        return new URL(url).hostname.toLowerCase();
    }
    catch {
        return undefined;
    }
}
function uniqueMatches(matches) {
    const seen = new Set();
    const results = [];
    for (const match of matches) {
        const key = [
            match.kind,
            match.provider ?? "",
            match.sdk ?? "",
            match.method ?? "",
            match.endpoint ?? "",
            match.resource ?? "",
            match.action ?? "",
            match.operationName ?? "",
            match.host ?? "",
            match.streaming ? "1" : "0",
            match.batchCapable ? "1" : "0",
        ].join("|");
        if (seen.has(key))
            continue;
        seen.add(key);
        results.push(match);
    }
    return results;
}
function toHttpCallMatches(matches) {
    const seen = new Set();
    const results = [];
    for (const match of matches) {
        if (!match.method || !match.endpoint)
            continue;
        const library = match.provider ?? match.sdk ?? match.kind;
        const key = `${match.method} ${match.endpoint} ${library}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        results.push({ method: match.method, url: match.endpoint, library });
    }
    return results;
}
function normalizeDynamic(raw) {
    return `<dynamic:${raw}>`;
}
function withRisk(match, risk) {
    const risks = match.inferredCostRisk ? [...match.inferredCostRisk] : [];
    if (!risks.includes(risk))
        risks.push(risk);
    return { ...match, inferredCostRisk: risks };
}
//# sourceMappingURL=utils.js.map