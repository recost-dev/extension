"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupMethod = lookupMethod;
exports.lookupHost = lookupHost;
exports.getAllProviders = getAllProviders;
exports.getProviderMethods = getProviderMethods;
exports.syncPricingFromBackend = syncPricingFromBackend;
const index_1 = require("./index");
// ── Index structures built once at module load ────────────────────────────────
/** provider (lowercase) → pattern → MethodFingerprint */
const methodIndex = new Map();
/** lowercase exact hostname → provider id */
const exactHostIndex = new Map();
/** ordered list of regex-based host matchers */
const regexHostIndex = [];
for (const fp of index_1.ALL_PROVIDERS) {
    const key = fp.provider.toLowerCase();
    // Method index
    const methods = new Map();
    for (const m of fp.methods) {
        methods.set(m.pattern, m);
    }
    methodIndex.set(key, methods);
    // Host index (exact entries in ALL_PROVIDERS take priority)
    for (const h of fp.hosts) {
        const resolvedProvider = h.provider ?? fp.provider;
        if (h.isRegex) {
            regexHostIndex.push({ regex: new RegExp(h.pattern, "i"), provider: resolvedProvider });
        }
        else {
            exactHostIndex.set(h.pattern.toLowerCase(), resolvedProvider);
        }
    }
}
// Host-only providers (grouped mapping files — hosts only, no methods)
for (const fp of index_1.HOST_MAP_PROVIDERS) {
    for (const h of fp.hosts) {
        const resolvedProvider = h.provider ?? fp.provider;
        if (h.isRegex) {
            regexHostIndex.push({ regex: new RegExp(h.pattern, "i"), provider: resolvedProvider });
        }
        else {
            exactHostIndex.set(h.pattern.toLowerCase(), resolvedProvider);
        }
    }
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Look up a method fingerprint by provider and method chain.
 *
 * The chain may include a leading variable name that won't be in the registry
 * (e.g. "client.chat.completions.create"). If an exact match is not found the
 * first dot-segment is stripped and the lookup is retried, so both
 * "chat.completions.create" and "client.chat.completions.create" resolve to the
 * same entry.
 *
 * Provider matching is case-insensitive.
 *
 * @returns The matching `MethodFingerprint`, or `null` if not found.
 */
function lookupMethod(provider, methodChain) {
    if (!provider || !methodChain)
        return null;
    const methods = methodIndex.get(provider.toLowerCase());
    if (!methods)
        return null;
    // 1. Exact match
    const exact = methods.get(methodChain);
    if (exact)
        return exact;
    // 2. Strip the first segment (variable/alias name) and retry
    const dot = methodChain.indexOf(".");
    if (dot !== -1) {
        const withoutRoot = methodChain.slice(dot + 1);
        const stripped = methods.get(withoutRoot);
        if (stripped)
            return stripped;
    }
    return null;
}
/**
 * Resolve a hostname to a provider id.
 *
 * Exact matches are checked first (O(1)), then regex patterns in registration
 * order. Returns `null` for unknown hosts.
 *
 * @example
 * lookupHost("api.openai.com")              // → "openai"
 * lookupHost("us-central1-aiplatform.googleapis.com") // → "vertex-ai"
 */
function lookupHost(hostname) {
    if (!hostname)
        return null;
    const exact = exactHostIndex.get(hostname.toLowerCase());
    if (exact)
        return exact;
    for (const { regex, provider } of regexHostIndex) {
        if (regex.test(hostname))
            return provider;
    }
    return null;
}
/**
 * Return all registered provider ids (in registration order).
 */
function getAllProviders() {
    return index_1.ALL_PROVIDERS.map((fp) => fp.provider);
}
/**
 * Return all method fingerprints for a given provider.
 *
 * Provider matching is case-insensitive. Returns an empty array for unknown
 * providers.
 */
function getProviderMethods(provider) {
    if (!provider)
        return [];
    const methods = methodIndex.get(provider.toLowerCase());
    return methods ? Array.from(methods.values()) : [];
}
// ── Pricing sync ──────────────────────────────────────────────────────────────
/** Pricing fields that may be overwritten from the backend. Detection fields are never touched. */
const PRICING_FIELDS = [
    "costModel",
    "inputPricePer1M",
    "outputPricePer1M",
    "fixedFee",
    "percentageFee",
    "perRequestCostUsd",
];
/**
 * Fetch fresh pricing from the backend and patch the in-memory registry.
 *
 * Only pricing fields (costModel, inputPricePer1M, outputPricePer1M, fixedFee,
 * percentageFee, perRequestCostUsd) are overwritten. Detection fields (pattern,
 * httpMethod, endpoint, streaming, batchCapable, cacheCapable, description,
 * hosts, packages, languages) are NEVER touched.
 *
 * Methods returned by the API that are not in the bundled registry are skipped.
 * Bundled methods not present in the API response are left unchanged.
 * Any failure (timeout, HTTP error, malformed JSON) is logged and silently
 * ignored so the extension continues with bundled pricing.
 *
 * @param backendUrl  Base URL of the ReCost backend, e.g. "https://api.recost.dev"
 */
async function syncPricingFromBackend(backendUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3_000);
    let raw;
    try {
        const response = await fetch(`${backendUrl}/pricing`, { signal: controller.signal });
        if (!response.ok) {
            console.warn(`ReCost: pricing sync failed (HTTP ${response.status}), using bundled pricing`);
            return;
        }
        raw = await response.json();
    }
    catch (err) {
        console.warn("ReCost: pricing sync failed, using bundled pricing:", err);
        return;
    }
    finally {
        clearTimeout(timeoutId);
    }
    // Validate top-level shape
    if (raw == null ||
        typeof raw !== "object" ||
        !("providers" in raw) ||
        raw.providers == null ||
        typeof raw.providers !== "object") {
        console.warn("ReCost: pricing sync returned malformed data, using bundled pricing");
        return;
    }
    const data = raw;
    for (const [providerName, providerData] of Object.entries(data.providers)) {
        if (providerData == null ||
            typeof providerData !== "object" ||
            providerData.methods == null ||
            typeof providerData.methods !== "object") {
            continue;
        }
        const methods = methodIndex.get(providerName.toLowerCase());
        if (!methods) {
            // Provider not in bundled registry — skip entirely
            continue;
        }
        for (const [methodPattern, pricingData] of Object.entries(providerData.methods)) {
            const entry = methods.get(methodPattern);
            if (!entry) {
                // Method not in bundled registry — skip
                continue;
            }
            if (pricingData == null || typeof pricingData !== "object") {
                continue;
            }
            // Overwrite only pricing fields; never touch detection fields
            for (const field of PRICING_FIELDS) {
                const value = pricingData[field];
                if (value !== undefined) {
                    // Type-safe assignment through the known union
                    entry[field] = value;
                }
            }
        }
    }
}
//# sourceMappingURL=registry.js.map