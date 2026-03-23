import type { MethodFingerprint } from "./types";
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
export declare function lookupMethod(provider: string, methodChain: string): MethodFingerprint | null;
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
export declare function lookupHost(hostname: string): string | null;
/**
 * Return all registered provider ids (in registration order).
 */
export declare function getAllProviders(): string[];
/**
 * Return all method fingerprints for a given provider.
 *
 * Provider matching is case-insensitive. Returns an empty array for unknown
 * providers.
 */
export declare function getProviderMethods(provider: string): MethodFingerprint[];
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
export declare function syncPricingFromBackend(backendUrl: string): Promise<void>;
