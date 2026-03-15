"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyEndpointScope = classifyEndpointScope;
exports.detectEndpointProvider = detectEndpointProvider;
const HOST_PROVIDER_MAP = [
    { test: /(^|\.)openai\.com$/i, provider: "openai" },
    { test: /(^|\.)stripe\.com$/i, provider: "stripe" },
    { test: /^api\.github\.com$/i, provider: "github" },
    { test: /^api\.coingecko\.com$/i, provider: "coingecko" },
    { test: /(^|\.)newsdata\.io$/i, provider: "newsdata" },
    { test: /^hacker-news\.firebaseio\.com$/i, provider: "hacker-news" },
    { test: /(^|\.)wttr\.in$/i, provider: "weather" },
    { test: /(^|\.)zenquotes\.io$/i, provider: "quotes" },
    { test: /(^|\.)ip-api\.com$/i, provider: "geo" },
];
function isInternalHost(host) {
    const normalized = host.toLowerCase().replace(/^\[(.*)\]$/, "$1");
    return (normalized === "localhost" ||
        normalized === "127.0.0.1" ||
        normalized === "0.0.0.0" ||
        normalized === "::1" ||
        normalized.endsWith(".local") ||
        normalized.endsWith(".internal"));
}
function classifyEndpointScope(urlOrPath) {
    const value = urlOrPath.trim();
    if (!value)
        return "unknown";
    if (value.startsWith("/"))
        return "internal";
    if (/^<dynamic:[^>]+>$/i.test(value) || /\$\{[^}]+\}/.test(value)) {
        return "unknown";
    }
    if (!/^https?:\/\//i.test(value)) {
        return "unknown";
    }
    try {
        const parsed = new URL(value);
        if (!/^https?:$/i.test(parsed.protocol))
            return "unknown";
        if (!parsed.hostname)
            return "unknown";
        return isInternalHost(parsed.hostname) ? "internal" : "external";
    }
    catch {
        return "unknown";
    }
}
function detectEndpointProvider(urlOrPath) {
    const value = urlOrPath.trim();
    if (!value)
        return "unknown";
    if (value.startsWith("/"))
        return "internal";
    const dynamicMatch = value.match(/^<dynamic:([^>]+)>$/i);
    if (dynamicMatch) {
        const token = dynamicMatch[1];
        if (/base_url|api/i.test(token))
            return "dynamic-api";
        return "dynamic";
    }
    if (!/^https?:\/\//i.test(value))
        return "unknown";
    try {
        const parsed = new URL(value);
        const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
        if (!host)
            return "unknown";
        for (const mapping of HOST_PROVIDER_MAP) {
            if (mapping.test.test(host))
                return mapping.provider;
        }
        return host;
    }
    catch {
        return "unknown";
    }
}
//# sourceMappingURL=endpoint-classification.js.map