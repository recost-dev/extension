import type { FindingNode } from "./types";
import { normalizeProviderId } from "./provider-normalization";

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s:/._-]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeEvidence(evidence: string[]): string {
  return evidence
    .map(normalizeText)
    .filter(Boolean)
    .sort()
    .join("|");
}

export function makeFindingDedupeKey(finding: FindingNode): string {
  return [
    finding.filePath,
    finding.type,
    finding.line ?? "null",
    normalizeText(finding.description),
    normalizeEvidence(finding.evidence),
  ].join("::");
}

export interface FindingContextSignal {
  line?: number | null;
  method?: string | null;
  url?: string | null;
  provider?: string | null;
  library?: string | null;
  originFile?: string | null;
  originFunction?: string | null;
}

function normalizeLocationBucket(line: number | null | undefined): string {
  if (line === null || line === undefined) return "null";
  return String(line);
}

export function makeFindingContextDedupeKey(
  finding: FindingNode,
  signal?: FindingContextSignal | null
): string {
  return [
    finding.filePath,
    finding.type,
    normalizeLocationBucket(signal?.line ?? finding.line),
    normalizeText(finding.description),
    normalizeEvidence(finding.evidence),
    signal?.method?.toUpperCase() ?? "null",
    signal?.url?.trim() ?? "null",
    normalizeProviderId(signal?.provider) ?? "null",
    normalizeText(signal?.library ?? "null"),
    normalizeText(signal?.originFile ?? "null"),
    normalizeText(signal?.originFunction ?? "null"),
  ].join("::");
}

export function dedupeFindings<T extends FindingNode>(
  findings: T[],
  compare: (left: T, right: T) => number,
  keyFn: (finding: T) => string = makeFindingDedupeKey
): T[] {
  const byKey = new Map<string, T>();

  for (const finding of findings) {
    const key = keyFn(finding);
    const existing = byKey.get(key);
    if (!existing || compare(finding, existing) < 0) {
      byKey.set(key, finding);
    }
  }

  return [...byKey.values()];
}
