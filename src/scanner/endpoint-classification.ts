import { lookupHost } from "./fingerprints/registry";

export type EndpointScope = "internal" | "external" | "unknown";

function isInternalHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1" ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

export function classifyEndpointScope(urlOrPath: string): EndpointScope {
  const value = urlOrPath.trim();
  if (!value) return "unknown";
  if (value.startsWith("/")) return "internal";

  if (/^<dynamic:[^>]+>$/i.test(value) || /\$\{[^}]+\}/.test(value)) {
    return "unknown";
  }

  if (!/^https?:\/\//i.test(value)) {
    return "unknown";
  }

  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) return "unknown";
    if (!parsed.hostname) return "unknown";
    return isInternalHost(parsed.hostname) ? "internal" : "external";
  } catch {
    return "unknown";
  }
}

export function detectEndpointProvider(urlOrPath: string): string {
  const value = urlOrPath.trim();
  if (!value) return "unknown";
  if (value.startsWith("/")) return "internal";

  const dynamicMatch = value.match(/^<dynamic:([^>]+)>$/i);
  if (dynamicMatch) {
    const token = dynamicMatch[1];
    if (/base_url|api/i.test(token)) return "dynamic-api";
    return "dynamic";
  }

  if (!/^https?:\/\//i.test(value)) return "unknown";

  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (!host) return "unknown";

    return lookupHost(host) ?? host;
  } catch {
    return "unknown";
  }
}
