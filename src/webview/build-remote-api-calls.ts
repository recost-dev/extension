import type { ApiCallInput } from "../analysis/types";
import { shouldSubmitRemote } from "../scan-results";
import { lookupHost } from "../scanner/fingerprints/registry";

export interface RemoteSubmitBuild {
  submitted: ApiCallInput[];
  unknownProviderCount: number;
  unknownProviderHosts: Record<string, number>;
}

function normalizeHostname(url: string): string {
  try {
    const raw = new URL(url).hostname;
    return raw.replace(/^www\./i, "").toLowerCase() || "<no-host>";
  } catch {
    return "<unparseable>";
  }
}

export function buildRemoteApiCalls(apiCalls: ApiCallInput[]): RemoteSubmitBuild {
  const candidates = apiCalls.filter(shouldSubmitRemote);
  const hosts: Record<string, number> = {};
  let unknownCount = 0;
  const submitted = candidates.map((call) => {
    const host = normalizeHostname(call.url);
    const provider = call.provider ?? lookupHost(host) ?? "unknown";
    if (provider === "unknown") {
      unknownCount += 1;
      hosts[host] = (hosts[host] ?? 0) + 1;
    }
    return { ...call, provider };
  });
  return { submitted, unknownProviderCount: unknownCount, unknownProviderHosts: hosts };
}
