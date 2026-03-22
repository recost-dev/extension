import type { MethodFingerprint } from "./types";
import { ALL_PROVIDERS } from "./index";

// ── Index structures built once at module load ────────────────────────────────

/** provider (lowercase) → pattern → MethodFingerprint */
const methodIndex = new Map<string, Map<string, MethodFingerprint>>();

/** lowercase exact hostname → provider id */
const exactHostIndex = new Map<string, string>();

/** ordered list of regex-based host matchers */
const regexHostIndex: Array<{ regex: RegExp; provider: string }> = [];

for (const fp of ALL_PROVIDERS) {
  const key = fp.provider.toLowerCase();

  // Method index
  const methods = new Map<string, MethodFingerprint>();
  for (const m of fp.methods) {
    methods.set(m.pattern, m);
  }
  methodIndex.set(key, methods);

  // Host index
  for (const h of fp.hosts) {
    if (h.isRegex) {
      regexHostIndex.push({ regex: new RegExp(h.pattern, "i"), provider: fp.provider });
    } else {
      exactHostIndex.set(h.pattern.toLowerCase(), fp.provider);
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
export function lookupMethod(provider: string, methodChain: string): MethodFingerprint | null {
  if (!provider || !methodChain) return null;

  const methods = methodIndex.get(provider.toLowerCase());
  if (!methods) return null;

  // 1. Exact match
  const exact = methods.get(methodChain);
  if (exact) return exact;

  // 2. Strip the first segment (variable/alias name) and retry
  const dot = methodChain.indexOf(".");
  if (dot !== -1) {
    const withoutRoot = methodChain.slice(dot + 1);
    const stripped = methods.get(withoutRoot);
    if (stripped) return stripped;
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
export function lookupHost(hostname: string): string | null {
  if (!hostname) return null;

  const exact = exactHostIndex.get(hostname.toLowerCase());
  if (exact) return exact;

  for (const { regex, provider } of regexHostIndex) {
    if (regex.test(hostname)) return provider;
  }

  return null;
}

/**
 * Return all registered provider ids (in registration order).
 */
export function getAllProviders(): string[] {
  return ALL_PROVIDERS.map((fp) => fp.provider);
}

/**
 * Return all method fingerprints for a given provider.
 *
 * Provider matching is case-insensitive. Returns an empty array for unknown
 * providers.
 */
export function getProviderMethods(provider: string): MethodFingerprint[] {
  if (!provider) return [];
  const methods = methodIndex.get(provider.toLowerCase());
  return methods ? Array.from(methods.values()) : [];
}
