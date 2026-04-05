import type {
  ApiCallNode,
  FileNode,
  FindingNode,
  RelatedFile,
  ReviewCluster,
  ScoredFile,
  ScoredSnapshot,
} from "./types";
import { dedupeFindings, makeFindingContextDedupeKey } from "./finding-dedupe";
import { isAnalysisToolingFilePath, isDeprioritizedContextFilePath, isTestLikeFilePath } from "./file-signals";
import { isRecostFixtureFile } from "../scanner/file-discovery";
import { filterRealProviders, normalizeProviderId } from "./provider-normalization";

const MAX_PRIMARY_FILES = 5;

let _includeTestFiles = false;
export function setIncludeTestFiles(value: boolean): void {
  _includeTestFiles = value;
}
const MIN_RELATED_FILES = 2;
const MAX_RELATED_FILES = 5;
const MAX_FINDINGS_PER_CLUSTER = 6;
const MIN_FINDINGS_PER_CLUSTER = 3;
const HIGH_FREQUENCY_ORDER = ["unbounded-loop", "parallel", "polling"] as const;
const HIGH_FREQUENCY_LABEL: Record<(typeof HIGH_FREQUENCY_ORDER)[number], string> = {
  "unbounded-loop": "calls inside unbounded loops",
  parallel: "parallel API fanout",
  polling: "polling traffic",
};
const RELATIONSHIP_WEIGHT = {
  repeatedPattern: 60,
  endpointPattern: 50,
  sameProvider: 40,
  sameDirectory: 30,
  sameModule: 20,
  highPriority: 5,
} as const;
const SEVERITY_WEIGHT: Record<FindingNode["severity"], number> = { high: 3, medium: 2, low: 1 };
const RELIABILITY_FINDING_TYPES = new Set(["rate_limit", "concurrency_control"]);

interface FileContext {
  file: FileNode;
  scoredFile: ScoredFile;
  apiCalls: ApiCallNode[];
  findings: FindingNode[];
  providers: string[];
  endpointKeys: Set<string>;
  repeatedKeys: Set<string>;
  parentDirectory: string | null;
  modulePrefix: string | null;
  rankIndex: number;
}

interface RelatedCandidate {
  filePath: string;
  relationship: string;
  score: number;
  isFallback: boolean;
}

type RelatedCandidateBucket = "runtime" | "tooling" | "test";

function buildEndpointKey(call: ApiCallNode): string {
  return `${call.provider ?? "unknown"}|${call.method}|${call.url}`;
}

function getRepeatedKeys(calls: ApiCallNode[]): Set<string> {
  const counts = new Map<string, number>();
  for (const call of calls) {
    const key = buildEndpointKey(call);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const repeatedKeys = new Set<string>();
  for (const [key, count] of counts.entries()) {
    if (count >= 2) repeatedKeys.add(key);
  }
  return repeatedKeys;
}

function getParentDirectory(filePath: string): string | null {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length < 2) return null;
  return segments.slice(0, -1).join("/");
}

function getModulePrefix(filePath: string): string | null {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length < 3) return null;
  return `${segments[0]}/${segments[1]}`;
}

function getDistinctProviders(apiCalls: ApiCallNode[]): string[] {
  return filterRealProviders(apiCalls.map((call) => call.provider));
}

function getNearestCallSignal(apiCalls: ApiCallNode[], finding: FindingNode) {
  if (finding.line === null || apiCalls.length === 0) return null;
  let nearest: ApiCallNode | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const apiCall of apiCalls) {
    const distance = Math.abs(apiCall.line - finding.line);
    if (distance < nearestDistance) {
      nearest = apiCall;
      nearestDistance = distance;
    }
  }
  if (!nearest) return null;
  return {
    line: nearest.line,
    method: nearest.method,
    url: nearest.url,
    provider: normalizeProviderId(nearest.provider),
    library: nearest.library,
    originFile: nearest.crossFileOrigin?.file ?? null,
    originFunction: nearest.crossFileOrigin?.functionName ?? null,
  };
}

function buildFileContexts(scored: ScoredSnapshot): FileContext[] {
  const rankIndexByFilePath = new Map(scored.scoredFiles.map((file, index) => [file.filePath, index]));

  return scored.scoredFiles.map((scoredFile) => {
    const file = scored.snapshot.files[scoredFile.fileId];
    const apiCalls = file.apiCallIds.map((id) => scored.snapshot.apiCalls[id]).filter(Boolean);
    const findings = dedupeFindings(
      file.findingIds.map((id) => scored.snapshot.findings[id]).filter(Boolean),
      compareFindings,
      (finding) => makeFindingContextDedupeKey(finding, getNearestCallSignal(apiCalls, finding))
    );

    return {
      file,
      scoredFile,
      apiCalls,
      findings,
      providers: getDistinctProviders(apiCalls),
      endpointKeys: new Set(apiCalls.map(buildEndpointKey)),
      repeatedKeys: getRepeatedKeys(apiCalls),
      parentDirectory: getParentDirectory(scoredFile.filePath),
      modulePrefix: getModulePrefix(scoredFile.filePath),
      rankIndex: rankIndexByFilePath.get(scoredFile.filePath) ?? Number.MAX_SAFE_INTEGER,
    };
  });
}

function getSharedValues(left: Set<string>, right: Set<string>): string[] {
  const shared: string[] = [];
  for (const value of left) {
    if (right.has(value)) shared.push(value);
  }
  return shared.sort();
}

function formatProvider(provider: string): string {
  if (!provider) return "Unknown";
  const knownDisplayNames: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    xai: "xAI",
    perplexity: "Perplexity",
    openrouter: "OpenRouter",
    groq: "Groq",
    deepseek: "DeepSeek",
    stripe: "Stripe",
    paypal: "PayPal",
    aws: "AWS",
    "aws-s3": "AWS S3",
    "aws-api-gateway": "AWS API Gateway",
    "aws-lambda": "AWS Lambda",
  };
  return knownDisplayNames[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

function compareCandidates(a: RelatedCandidate, b: RelatedCandidate): number {
  return b.score - a.score || a.filePath.localeCompare(b.filePath);
}

function buildExactMatchCandidate(primary: FileContext, candidate: FileContext): RelatedCandidate | null {
  const sharedRepeatedKeys = getSharedValues(primary.repeatedKeys, candidate.repeatedKeys);
  const sharedEndpointKeys = getSharedValues(primary.endpointKeys, candidate.endpointKeys);

  if (sharedRepeatedKeys.length > 0) {
    return {
      filePath: candidate.scoredFile.filePath,
      relationship: "Shares repeated API pattern",
      score: RELATIONSHIP_WEIGHT.repeatedPattern + sharedRepeatedKeys.length * 5,
      isFallback: false,
    };
  }

  if (sharedEndpointKeys.length > 0) {
    return {
      filePath: candidate.scoredFile.filePath,
      relationship: "Shares API endpoint pattern",
      score: RELATIONSHIP_WEIGHT.endpointPattern + sharedEndpointKeys.length * 4,
      isFallback: false,
    };
  }

  return null;
}

function buildBroadMatchCandidate(primary: FileContext, candidate: FileContext): RelatedCandidate | null {
  const sharedProviders = primary.providers.filter((provider) => candidate.providers.includes(provider)).sort();
  const sameDirectory = primary.parentDirectory !== null && primary.parentDirectory === candidate.parentDirectory;
  const sameModule =
    !sameDirectory &&
    primary.modulePrefix !== null &&
    primary.modulePrefix === candidate.modulePrefix;

  if (sharedProviders.length > 0) {
    return {
      filePath: candidate.scoredFile.filePath,
      relationship: `Uses same ${formatProvider(sharedProviders[0])} provider`,
      score: RELATIONSHIP_WEIGHT.sameProvider + sharedProviders.length * 3,
      isFallback: false,
    };
  }

  if (sameDirectory) {
    return {
      filePath: candidate.scoredFile.filePath,
      relationship: "Located in same directory",
      score: RELATIONSHIP_WEIGHT.sameDirectory,
      isFallback: false,
    };
  }

  if (sameModule) {
    return {
      filePath: candidate.scoredFile.filePath,
      relationship: "Located in same module",
      score: RELATIONSHIP_WEIGHT.sameModule,
      isFallback: false,
    };
  }

  return null;
}

function buildStrongCandidate(primary: FileContext, candidate: FileContext): RelatedCandidate | null {
  return buildExactMatchCandidate(primary, candidate) ?? buildBroadMatchCandidate(primary, candidate);
}

function buildFallbackCandidate(primary: FileContext, candidate: FileContext): RelatedCandidate | null {
  if (primary.rankIndex === Number.MAX_SAFE_INTEGER || candidate.rankIndex === Number.MAX_SAFE_INTEGER) {
    return null;
  }

  const rankDistance = Math.abs(primary.rankIndex - candidate.rankIndex);
  const proximityScore = Math.max(0, 10 - rankDistance);
  if (proximityScore <= 0) return null;

  return {
    filePath: candidate.scoredFile.filePath,
    relationship: "Also high-priority file",
    score: RELATIONSHIP_WEIGHT.highPriority + proximityScore,
    isFallback: true,
  };
}

function classifyRelatedCandidateBucket(filePath: string): RelatedCandidateBucket {
  if (isTestLikeFilePath(filePath)) return "test";
  if (isAnalysisToolingFilePath(filePath)) return "tooling";
  return "runtime";
}

function selectRelatedFiles(primary: FileContext, contexts: FileContext[]): RelatedFile[] {
  const runtimeStrongCandidates: RelatedCandidate[] = [];
  const toolingStrongCandidates: RelatedCandidate[] = [];
  const testStrongCandidates: RelatedCandidate[] = [];
  const runtimeFallbackCandidates: RelatedCandidate[] = [];
  const toolingFallbackCandidates: RelatedCandidate[] = [];
  const testFallbackCandidates: RelatedCandidate[] = [];

  for (const candidate of contexts) {
    if (candidate.scoredFile.filePath === primary.scoredFile.filePath) continue;
    const bucket = classifyRelatedCandidateBucket(candidate.scoredFile.filePath);

    const strongCandidate =
      bucket === "tooling"
        ? buildExactMatchCandidate(primary, candidate)
        : buildStrongCandidate(primary, candidate);
    if (strongCandidate) {
      if (bucket === "runtime") runtimeStrongCandidates.push(strongCandidate);
      else if (bucket === "tooling") toolingStrongCandidates.push(strongCandidate);
      else testStrongCandidates.push(strongCandidate);
      continue;
    }

    const fallbackCandidate =
      bucket === "tooling"
        ? buildBroadMatchCandidate(primary, candidate) ?? buildFallbackCandidate(primary, candidate)
        : buildFallbackCandidate(primary, candidate);
    if (fallbackCandidate) {
      if (bucket === "runtime") runtimeFallbackCandidates.push(fallbackCandidate);
      else if (bucket === "tooling") toolingFallbackCandidates.push(fallbackCandidate);
      else testFallbackCandidates.push(fallbackCandidate);
    }
  }

  const selected: RelatedCandidate[] = [];
  const usedPaths = new Set<string>();
  const addCandidates = (candidates: RelatedCandidate[], stopAtMin = false): void => {
    for (const candidate of candidates.sort(compareCandidates)) {
      if (selected.length >= MAX_RELATED_FILES) break;
      if (usedPaths.has(candidate.filePath)) continue;
      selected.push(candidate);
      usedPaths.add(candidate.filePath);
      if (stopAtMin && selected.length >= MIN_RELATED_FILES) break;
    }
  };

  addCandidates(runtimeStrongCandidates);
  addCandidates(toolingStrongCandidates);

  if (selected.length < MIN_RELATED_FILES) {
    addCandidates(runtimeFallbackCandidates, true);
  }

  if (selected.length < MIN_RELATED_FILES) {
    addCandidates(toolingFallbackCandidates, true);
  }

  if (selected.length < MIN_RELATED_FILES) {
    addCandidates(testStrongCandidates, true);
  }

  if (selected.length < MIN_RELATED_FILES) {
    addCandidates(testFallbackCandidates, true);
  }

  const finalSelection = selected.slice(0, MAX_RELATED_FILES);
  const nonTestSelection = finalSelection.filter((candidate) => !isTestLikeFilePath(candidate.filePath));
  const filteredSelection = nonTestSelection.length > 0 ? nonTestSelection : finalSelection;

  return filteredSelection.map(({ filePath, relationship }) => ({ filePath, relationship }));
}

function compareFindings(a: FindingNode, b: FindingNode): number {
  const scoreA = SEVERITY_WEIGHT[a.severity] * a.confidence;
  const scoreB = SEVERITY_WEIGHT[b.severity] * b.confidence;
  return scoreB - scoreA || a.filePath.localeCompare(b.filePath) || (a.line ?? 0) - (b.line ?? 0) || a.id.localeCompare(b.id);
}

function collectTopFindings(primary: FileContext, relatedFiles: RelatedFile[], contextByPath: Map<string, FileContext>): FindingNode[] {
  const findings = [...primary.findings];
  for (const relatedFile of relatedFiles) {
    const context = contextByPath.get(relatedFile.filePath);
    if (!context) continue;
    findings.push(...context.findings);
  }

  const uniqueFindings = dedupeFindings(
    Array.from(new Map(findings.map((finding) => [finding.id, finding])).values()),
    compareFindings,
    (finding) => {
      const context = contextByPath.get(finding.filePath);
      return makeFindingContextDedupeKey(finding, getNearestCallSignal(context?.apiCalls ?? [], finding));
    }
  );
  const maxCount = Math.min(MAX_FINDINGS_PER_CLUSTER, Math.max(MIN_FINDINGS_PER_CLUSTER, uniqueFindings.length));
  return uniqueFindings.sort(compareFindings).slice(0, maxCount);
}

function collectProviders(primary: FileContext, relatedFiles: RelatedFile[], contextByPath: Map<string, FileContext>): string[] {
  const providers = new Set(primary.providers);
  for (const relatedFile of relatedFiles) {
    const context = contextByPath.get(relatedFile.filePath);
    if (!context) continue;
    for (const provider of context.providers) {
      providers.add(provider);
    }
  }
  return Array.from(providers).sort();
}

function getHighestPriorityFrequencyLabel(apiCalls: ApiCallNode[]): string | null {
  for (const frequencyClass of HIGH_FREQUENCY_ORDER) {
    if (apiCalls.some((call) => call.frequencyClass === frequencyClass)) {
      return HIGH_FREQUENCY_LABEL[frequencyClass];
    }
  }
  return null;
}

function getStrongestReliabilityFinding(findings: FindingNode[]): FindingNode | null {
  return findings
    .filter((finding) => RELIABILITY_FINDING_TYPES.has(finding.type))
    .sort(compareFindings)[0] ?? null;
}

function hasCacheCapableWithoutCacheFinding(primary: FileContext): boolean {
  const hasCacheFinding = primary.findings.some((finding) => finding.type === "cache");
  return primary.apiCalls.some((call) => call.cacheCapable) && !hasCacheFinding;
}

function buildReviewQuestion(primary: FileContext): string {
  const providerName = primary.providers[0] ? formatProvider(primary.providers[0]) : "API";
  const frequencyLabel = getHighestPriorityFrequencyLabel(primary.apiCalls);
  if (frequencyLabel) {
    return `Check whether ${providerName} ${frequencyLabel} can be batched, cached, or guarded with tighter limits.`;
  }

  const reliabilityFinding = getStrongestReliabilityFinding(primary.findings);
  if (reliabilityFinding?.type === "rate_limit") {
    return `Check whether ${providerName} requests in this path need explicit rate limiting or backoff safeguards.`;
  }
  if (reliabilityFinding?.type === "concurrency_control") {
    return `Check whether ${providerName} calls in this path need tighter concurrency control or queueing.`;
  }

  if (primary.repeatedKeys.size > 0) {
    return `Check whether repeated ${providerName} API calls in this file can be deduplicated or consolidated.`;
  }

  if (hasCacheCapableWithoutCacheFinding(primary)) {
    return `Check whether cache-capable ${providerName} calls in this file should be cached before adding more traffic.`;
  }

  return `Check whether the highest-priority ${providerName} path in this file needs batching, safeguards, or request cleanup.`;
}

function createClusterId(primaryFilePath: string): string {
  return `cluster:${primaryFilePath}`;
}

function buildClusterFileSet(cluster: ReviewCluster): Set<string> {
  return new Set([cluster.primaryFile.filePath, ...cluster.relatedFiles.map((file) => file.filePath)]);
}

function getOverlapRatio(left: Set<string>, right: Set<string>): number {
  let overlap = 0;
  for (const filePath of left) {
    if (right.has(filePath)) overlap += 1;
  }
  return overlap / Math.min(left.size, right.size);
}

function compareClusters(a: ReviewCluster, b: ReviewCluster): number {
  return (
    Number(isTestLikeFilePath(b.primaryFile.filePath)) - Number(isTestLikeFilePath(a.primaryFile.filePath)) ||
    a.primaryFile.scores.aiReviewPriority - b.primaryFile.scores.aiReviewPriority ||
    Number(isTestLikeFilePath(a.relatedFiles[0]?.filePath ?? "")) - Number(isTestLikeFilePath(b.relatedFiles[0]?.filePath ?? "")) ||
    a.topFindings.length - b.topFindings.length ||
    a.primaryFile.filePath.localeCompare(b.primaryFile.filePath)
  );
}

function selectPrimaryContexts(contexts: FileContext[]): FileContext[] {
  // NOTE: isTestLikeFilePath only matches directory-based or .test./.spec. patterns.
  // A recost-mock-calls.ts at the repo root would NOT match isTestLikeFilePath,
  // so the fixture file must be gated explicitly and independently.
  const preferredRuntimeContexts = contexts.filter((context) => {
    const filePath = context.scoredFile.filePath;
    if (isRecostFixtureFile(filePath)) return _includeTestFiles; // explicit gate regardless of location
    if (isTestLikeFilePath(filePath)) return false;
    if (isDeprioritizedContextFilePath(filePath)) return false;
    return true;
  });
  if (preferredRuntimeContexts.length >= MAX_PRIMARY_FILES) {
    return preferredRuntimeContexts.slice(0, MAX_PRIMARY_FILES);
  }

  if (preferredRuntimeContexts.length > 0) {
    const selected = [...preferredRuntimeContexts];
    for (const context of contexts) {
      if (selected.length >= MAX_PRIMARY_FILES) break;
      if (
        !isTestLikeFilePath(context.scoredFile.filePath) &&
        !isDeprioritizedContextFilePath(context.scoredFile.filePath) &&
        !selected.includes(context)
      ) {
        selected.push(context);
      }
    }
    return selected;
  }

  const nonTestContexts = contexts.filter((context) => !isTestLikeFilePath(context.scoredFile.filePath));
  if (nonTestContexts.length > 0) {
    const selected = [...nonTestContexts];
    for (const context of contexts) {
      if (selected.length >= MAX_PRIMARY_FILES) break;
      if (isTestLikeFilePath(context.scoredFile.filePath)) {
        selected.push(context);
      }
    }
    return selected;
  }
  return contexts.slice(0, MAX_PRIMARY_FILES);
}

export function buildReviewClusters(scored: ScoredSnapshot): ReviewCluster[] {
  const contexts = buildFileContexts(scored);
  const contextByPath = new Map(contexts.map((context) => [context.scoredFile.filePath, context]));
  const candidates: ReviewCluster[] = [];

  for (const primary of selectPrimaryContexts(contexts)) {
    const relatedFiles = selectRelatedFiles(primary, contexts);
    const cluster: ReviewCluster = {
      id: createClusterId(primary.scoredFile.filePath),
      primaryFile: primary.scoredFile,
      relatedFiles,
      topFindings: collectTopFindings(primary, relatedFiles, contextByPath),
      providers: collectProviders(primary, relatedFiles, contextByPath),
      estimatedMonthlyCost: null,
      reviewQuestion: buildReviewQuestion(primary),
    };
    candidates.push(cluster);
  }

  const selected: ReviewCluster[] = [];
  for (const candidate of candidates) {
    const candidateFileSet = buildClusterFileSet(candidate);
    const overlappingCluster = selected.find((cluster) => getOverlapRatio(candidateFileSet, buildClusterFileSet(cluster)) > 0.5);
    if (!overlappingCluster) {
      selected.push(candidate);
      continue;
    }

    if (compareClusters(candidate, overlappingCluster) <= 0) continue;
    const existingIndex = selected.indexOf(overlappingCluster);
    selected.splice(existingIndex, 1, candidate);
  }

  return selected;
}
