import type { ApiCallInput, EndpointRecord, Suggestion, ScanSummary } from "./analysis/types";
import type { LocalWasteFinding } from "./scanner/local-waste-detector";
import { classifyEndpointScope, detectEndpointProvider } from "./scanner/endpoint-classification";
import { lookupMethod } from "./scanner/fingerprints/registry";

export interface FinalScanResults {
  endpoints: EndpointRecord[];
  suggestions: Suggestion[];
  summary: ScanSummary;
}

const GENERIC_DYNAMIC_TOKENS = new Set(["endpoint", "url", "path", "uri", "route"]);
const OUTBOUND_LIBRARIES = new Set(["fetch", "axios", "got", "superagent", "ky", "requests", "http", "HttpClient", "$http", "openai"]);
const LOCAL_PRICING: Record<string, number> = {
  openai: 0.00015,
  anthropic: 0.00025,
  stripe: 0.59,
  paypal: 0.84,
  braintree: 0.75,
  square: 0.59,
  twilio: 0.0079,
  sendgrid: 0.0009,
  mailgun: 0.0018,
  postmark: 0.0015,
  "aws-s3": 0.0000004,
  "aws-api-gateway": 0.0000035,
  "aws-lambda": 0.0000002,
  "google-maps": 0.005,
  "google-translate": 0.010,
  "google-vision": 0.0015,
  "google-speech": 0.006,
  firestore: 0.0000003,
  auth0: 0.00023,
  okta: 0.00020,
  salesforce: 0.0025,
  mixpanel: 0.00028,
  segment: 0.00007,
  amplitude: 0.00049,
  datadog: 0.0000017,
  sentry: 0.000363,
  algolia: 0.0005,
  cloudinary: 0.000089,
  mux: 0.032,
  shipengine: 0.020,
  easypost: 0.020,
  cloudflare: 0.0000003,
  vercel: 0.0000006,
};
export function classifyPricing(
  costModels: (string | undefined)[]
): "paid" | "free" | "unknown" {
  const PAID = new Set(["per_token", "per_transaction", "per_request"]);
  let result: "paid" | "free" | "unknown" = "unknown";
  for (const model of costModels) {
    if (model && PAID.has(model)) return "paid";
    if (model === "free") result = "free";
  }
  return result;
}

const DEFAULT_PER_CALL_COST = 0.0001;
const FREQUENCY_SEVERITY: Record<string, number> = {
  polling: 6,
  "unbounded-loop": 5,
  parallel: 4,
  "bounded-loop": 3,
  conditional: 2,
  "cache-guarded": 1,
  single: 0,
};

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function mapStatusToSuggestionType(status: EndpointRecord["status"]): Suggestion["type"] | null {
  switch (status) {
    case "cacheable":
      return "cache";
    case "batchable":
      return "batch";
    case "redundant":
      return "redundancy";
    case "n_plus_one_risk":
      return "n_plus_one";
    case "rate_limit_risk":
      return "rate_limit";
    default:
      return null;
  }
}

function estimateLocalMonthlyCost(provider: string, callsPerDay: number, methodSignature?: string): number {
  if (methodSignature) {
    const fingerprint = lookupMethod(provider, methodSignature);
    if (fingerprint) {
      if (fingerprint.costModel === "free") return 0;
      if (fingerprint.costModel === "per_token") {
        const inputTokens = 500;
        const outputTokens = 200;
        const inputCost = (inputTokens / 1_000_000) * (fingerprint.inputPricePer1M ?? 0);
        const outputCost = (outputTokens / 1_000_000) * (fingerprint.outputPricePer1M ?? 0);
        return Math.round((inputCost + outputCost) * callsPerDay * 30 * 100) / 100;
      }
      if (fingerprint.costModel === "per_transaction") {
        const txValue = 50;
        const fee = (fingerprint.fixedFee ?? 0) + txValue * (fingerprint.percentageFee ?? 0);
        return Math.round(fee * callsPerDay * 30 * 100) / 100;
      }
      if (fingerprint.costModel === "per_request") {
        return Math.round((fingerprint.fixedFee ?? fingerprint.perRequestCostUsd ?? 0.0001) * callsPerDay * 30 * 100) / 100;
      }
    }
  }
  const perCall = LOCAL_PRICING[provider] ?? DEFAULT_PER_CALL_COST;
  return Math.round(callsPerDay * perCall * 30 * 100) / 100;
}

function chooseSeverity(status: EndpointRecord["status"], monthlyCost: number): Suggestion["severity"] {
  if (status === "n_plus_one_risk" || status === "redundant") return monthlyCost >= 100 ? "high" : "medium";
  if (status === "rate_limit_risk") return monthlyCost >= 50 ? "high" : "medium";
  return monthlyCost >= 100 ? "medium" : "low";
}

function estimateSavings(status: EndpointRecord["status"], monthlyCost: number): number {
  const multiplier =
    status === "redundant" ? 0.4 :
    status === "cacheable" ? 0.25 :
    status === "batchable" ? 0.2 :
    status === "n_plus_one_risk" ? 0.35 :
    status === "rate_limit_risk" ? 0.15 :
    0.1;
  return Number((monthlyCost * multiplier).toFixed(2));
}

function confidenceFromEndpointStatus(endpoint: EndpointRecord): number {
  const base =
    endpoint.status === "n_plus_one_risk" ? 0.78 :
    endpoint.status === "redundant" ? 0.72 :
    endpoint.status === "rate_limit_risk" ? 0.7 :
    endpoint.status === "cacheable" ? 0.66 :
    endpoint.status === "batchable" ? 0.66 :
    0.55;
  const perRequestBoost = endpoint.callSites.some((site) => site.frequency === "per-request") ? 0.07 : 0;
  return clampConfidence(base + perRequestBoost);
}

function buildAggressiveDescription(endpoint: EndpointRecord, type: Suggestion["type"]): string {
  const firstSite = endpoint.callSites[0];
  const location = firstSite ? ` (${firstSite.file}:${firstSite.line})` : "";
  switch (type) {
    case "cache":
      return `Potential caching opportunity detected for \`${endpoint.method} ${endpoint.url}\`${location}. This endpoint appears cacheable; consider adding response caching with explicit TTL and cache invalidation rules to reduce repeated requests and cost.`;
    case "batch":
      return `Potential batching opportunity detected for \`${endpoint.method} ${endpoint.url}\`${location}. This endpoint appears in a pattern that may benefit from request batching or bulk-fetch patterns to reduce request volume.`;
    case "redundancy":
      return `Potential redundant API usage detected for \`${endpoint.method} ${endpoint.url}\`${location}. Multiple call paths may be invoking equivalent requests; consider deduping in-flight requests and consolidating repeated fetches.`;
    case "n_plus_one":
      return `Potential N+1 API pattern detected for \`${endpoint.method} ${endpoint.url}\`${location}. Review loop-driven request behavior and replace with prefetch/batch patterns where possible.`;
    case "rate_limit":
      return `Potential rate-limit risk detected for \`${endpoint.method} ${endpoint.url}\`${location}. Add throttling/backoff and request coalescing to reduce burst frequency and avoid provider limits.`;
    default:
      return `Potential optimization opportunity detected for \`${endpoint.method} ${endpoint.url}\`${location}.`;
  }
}

function buildAggressiveSuggestions(endpoints: EndpointRecord[], suggestions: Suggestion[]): Suggestion[] {
  const existing = new Set<string>();
  for (const suggestion of suggestions) {
    for (const endpointId of suggestion.affectedEndpoints) {
      existing.add(`${endpointId}:${suggestion.type}`);
    }
  }

  const extras: Suggestion[] = [];
  for (const endpoint of endpoints) {
    const type = mapStatusToSuggestionType(endpoint.status);
    if (!type) continue;
    const dedupeKey = `${endpoint.id}:${type}`;
    if (existing.has(dedupeKey)) continue;
    extras.push({
      id: `local-${endpoint.id}-${type}`,
      projectId: endpoint.projectId,
      scanId: endpoint.scanId,
      type,
      severity: chooseSeverity(endpoint.status, endpoint.monthlyCost),
      affectedEndpoints: [endpoint.id],
      affectedFiles: endpoint.files,
      estimatedMonthlySavings: estimateSavings(endpoint.status, endpoint.monthlyCost),
      description: buildAggressiveDescription(endpoint, type),
      codeFix: "",
      source: "local-rule",
      confidence: confidenceFromEndpointStatus(endpoint),
      evidence: endpoint.callSites.slice(0, 3).map((site) => `Observed callsite: ${site.file}:${site.line}`),
      pricingClass: classifyPricing([endpoint.costModel]),
    });
  }
  return [...suggestions, ...extras];
}

const PROXIMITY_THRESHOLD_LINES = 25;

/**
 * Find the endpoint whose call site is closest to the finding's line number.
 * Only considers call sites within PROXIMITY_THRESHOLD_LINES of the finding.
 * Falls back to null if no close match is found, allowing callers to use
 * file-level cost as a fallback.
 *
 * TODO: Replace line-proximity threshold with function-scope matching once
 * function boundary data is available at this point in the pipeline. Function
 * scope is semantically more accurate — a finding and its triggering call site
 * always share the same function body regardless of line distance.
 */
function findClosestEndpoint(
  finding: { affectedFile: string; line?: number },
  fileEndpoints: EndpointRecord[]
): EndpointRecord | null {
  if (!finding.line || fileEndpoints.length === 0) return null;

  let closest: EndpointRecord | null = null;
  let closestDistance = Infinity;

  for (const ep of fileEndpoints) {
    // Skip route-def endpoints — they have monthlyCost === 0 and would
    // produce misleading $0 savings estimates
    if (ep.monthlyCost === 0 && ep.callSites.every(s => s.library === "route-def")) continue;

    for (const site of ep.callSites) {
      if (site.file !== finding.affectedFile) continue;
      const distance = Math.abs(site.line - finding.line);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = ep;
      }
    }
  }

  return closestDistance <= PROXIMITY_THRESHOLD_LINES ? closest : null;
}

function mergeLocalWasteFindings(
  baseSuggestions: Suggestion[],
  localFindings: LocalWasteFinding[],
  endpoints: EndpointRecord[],
  totalMonthlyCost: number,
  projectId: string,
  scanId: string
): Suggestion[] {
  const existingByDescAndFile = new Set(baseSuggestions.map((s) => `${s.description}::${s.affectedFiles[0] ?? ""}`));
  const locals: Suggestion[] = [];
  for (const finding of localFindings) {
    const fileEndpoints = endpoints.filter((ep) => ep.files.includes(finding.affectedFile));
    console.log('[recost] fileEndpoints for', finding.affectedFile,
      fileEndpoints.map(ep => ({ scope: ep.scope, provider: ep.provider, costModel: ep.costModel }))
    );
    if (finding.confidence < 0.35) continue;
    const key = `${finding.description}::${finding.affectedFile}`;
    if (existingByDescAndFile.has(key)) continue;
    existingByDescAndFile.add(key);
    const closestEndpoint = findClosestEndpoint(finding, fileEndpoints);
    const directCost = closestEndpoint?.monthlyCost ?? 0;
    const fileMonthlyCost = fileEndpoints.reduce((sum, ep) => sum + ep.monthlyCost, 0);
    const baselineCost = directCost > 0
      ? directCost
      : fileMonthlyCost > 0
      ? fileMonthlyCost
      : totalMonthlyCost;
    const multiplier =
      finding.type === "redundancy" ? 0.4 :
      finding.type === "n_plus_one" ? 0.35 :
      finding.type === "cache" ? 0.25 :
      finding.type === "batch" ? 0.2 :
      finding.type === "concurrency_control" ? 0.22 :
      0.2;
    const severityWeight = finding.severity === "high" ? 1 : finding.severity === "medium" ? 0.75 : 0.5;
    const pricingClass = classifyPricing(fileEndpoints.map((ep) => ep.costModel));
    locals.push({
      id: finding.id,
      projectId,
      scanId,
      type: finding.type,
      severity: finding.severity,
      affectedEndpoints: fileEndpoints.map((ep) => ep.id),
      affectedFiles: [finding.affectedFile],
      targetLine: finding.line,
      estimatedMonthlySavings: Number((baselineCost * multiplier * severityWeight).toFixed(2)),
      description: finding.description,
      codeFix: "",
      source: "local-rule",
      confidence: finding.confidence,
      evidence: finding.evidence,
      pricingClass,
    });
  }
  return [...baseSuggestions, ...locals];
}

function isHighConfidenceEndpointUrl(url: string): boolean {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return true;
  if (url.startsWith("/")) return true;
  if (/\$\{\s*(endpoint|url|path|uri|route)\s*\}/i.test(url)) return false;
  const dynamic = url.match(/^<dynamic:([^>]+)>$/i);
  if (!dynamic) return false;
  const token = dynamic[1].trim().toLowerCase();
  if (GENERIC_DYNAMIC_TOKENS.has(token)) return false;
  if (/base[_-]?url/.test(token)) return false;
  return /base[_-]?url|api|endpoint/i.test(token);
}

export function shouldSubmitRemote(call: ApiCallInput): boolean {
  if (!call.library || !OUTBOUND_LIBRARIES.has(call.library)) return false;
  return isHighConfidenceEndpointUrl(call.url);
}

function shouldIncludeSynthetic(call: ApiCallInput): boolean {
  if (!isHighConfidenceEndpointUrl(call.url)) return false;
  if (call.library === "route-def" || call.library === "api-helper") return call.url.startsWith("/");
  return true;
}

function normalizePathParams(url: string): string {
  return url.replace(/\$\{\s*[^}]+\s*\}/g, ":param").replace(/<[^>]+>/g, ":param").replace(/\{[^}]+\}/g, ":param");
}

function stripQueryAndHash(url: string): string {
  const queryIdx = url.indexOf("?");
  const hashIdx = url.indexOf("#");
  const cutAt = queryIdx >= 0 && hashIdx >= 0 ? Math.min(queryIdx, hashIdx) : queryIdx >= 0 ? queryIdx : hashIdx >= 0 ? hashIdx : -1;
  return cutAt >= 0 ? url.slice(0, cutAt) : url;
}

function canonicalizeEndpointUrl(url: string): string {
  return normalizePathParams(stripQueryAndHash(url.trim()));
}

function isDynamicPlaceholderUrl(url: string): boolean {
  return /^<dynamic:[^>]+>$/i.test(url.trim());
}

function buildEndpointKey(method: string, url: string): string {
  return `${method.toUpperCase()} ${canonicalizeEndpointUrl(url)}`;
}

function pickDisplayUrl(current: string, candidate: string): string {
  const currentCanonical = canonicalizeEndpointUrl(current);
  const candidateCanonical = canonicalizeEndpointUrl(candidate);
  const score = (value: string): number => {
    let s = 0;
    if (!isDynamicPlaceholderUrl(value)) s += 3;
    if (value === stripQueryAndHash(value)) s += 2;
    if (value.includes(":param")) s += 1;
    if (value.includes("/")) s += 1;
    return s;
  };
  return score(candidateCanonical) > score(currentCanonical) ? candidateCanonical : currentCanonical;
}

function pickMostSevereFrequency(a: string | undefined, b: string | undefined): string | undefined {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return (FREQUENCY_SEVERITY[a] ?? 0) >= (FREQUENCY_SEVERITY[b] ?? 0) ? a : b;
}

function tagRemoteSuggestions(suggestions: Suggestion[]): Suggestion[] {
  return suggestions.map((suggestion) => ({ ...suggestion, source: suggestion.source ?? "remote" }));
}

export function mergeRemoteAndLocalEndpoints(
  remote: EndpointRecord[],
  localCalls: ApiCallInput[],
  projectId: string,
  scanId: string
): EndpointRecord[] {
  const merged = remote.map((endpoint) => ({ ...endpoint, scope: endpoint.scope ?? classifyEndpointScope(endpoint.url) }));
  const byMethodUrl = new Map<string, EndpointRecord>();
  for (const endpoint of merged) {
    byMethodUrl.set(buildEndpointKey(endpoint.method, endpoint.url), endpoint);
  }

  const syntheticByMethodUrl = new Map<string, EndpointRecord>();
  for (const call of localCalls) {
    if (!shouldIncludeSynthetic(call)) continue;
    const key = buildEndpointKey(call.method, call.url);
    if (byMethodUrl.has(key)) {
      const endpoint = byMethodUrl.get(key)!;
      endpoint.url = pickDisplayUrl(endpoint.url, call.url);
      if (!endpoint.files.includes(call.file)) endpoint.files.push(call.file);
      const hasSite = endpoint.callSites.some((site) => site.file === call.file && site.line === call.line && site.library === call.library);
      if (!hasSite) {
        endpoint.callSites.push({
          file: call.file,
          line: call.line,
          library: call.library ?? "",
          frequency: call.frequency,
          frequencyClass: call.frequencyClass,
          crossFileOrigin: call.crossFileOrigin ?? null,
        });
      }
      if (!endpoint.methodSignature && call.methodSignature) endpoint.methodSignature = call.methodSignature;
      if (!endpoint.costModel && call.costModel) endpoint.costModel = call.costModel;
      endpoint.frequencyClass = pickMostSevereFrequency(endpoint.frequencyClass, call.frequencyClass);
      if (call.batchCapable) endpoint.batchCapable = true;
      if (call.cacheCapable) endpoint.cacheCapable = true;
      if (call.streaming) endpoint.streaming = true;
      if (call.isMiddleware) endpoint.isMiddleware = true;
      if (call.crossFileOrigin) {
        endpoint.crossFileOrigins = endpoint.crossFileOrigins ?? [];
        endpoint.crossFileOrigins.push(call.crossFileOrigin);
      }
      continue;
    }

    if (!syntheticByMethodUrl.has(key)) {
      const canonicalUrl = canonicalizeEndpointUrl(call.url);
      const provider = call.provider ?? detectEndpointProvider(canonicalUrl);
      const callsPerDay = call.frequency === "per-request" ? 100 : call.library === "route-def" ? 0 : 1;
      syntheticByMethodUrl.set(key, {
        id: `local-${scanId}-${syntheticByMethodUrl.size + 1}`,
        projectId,
        scanId,
        provider,
        method: call.method,
        url: canonicalUrl,
        scope: classifyEndpointScope(canonicalUrl),
        files: [call.file],
        callSites: [{
          file: call.file,
          line: call.line,
          library: call.library ?? "",
          frequency: call.frequency,
          frequencyClass: call.frequencyClass,
          crossFileOrigin: call.crossFileOrigin ?? null,
        }],
        callsPerDay,
        monthlyCost: estimateLocalMonthlyCost(provider, callsPerDay, call.methodSignature),
        status: call.frequency === "per-request" ? "n_plus_one_risk" : "normal",
        methodSignature: call.methodSignature,
        costModel: call.costModel,
        frequencyClass: call.frequencyClass,
        batchCapable: call.batchCapable,
        cacheCapable: call.cacheCapable,
        streaming: call.streaming,
        isMiddleware: call.isMiddleware,
        crossFileOrigins: call.crossFileOrigin ? [call.crossFileOrigin] : undefined,
      });
      continue;
    }

    const synthetic = syntheticByMethodUrl.get(key)!;
    synthetic.url = pickDisplayUrl(synthetic.url, call.url);
    synthetic.scope = classifyEndpointScope(synthetic.url);
    synthetic.provider = call.provider ?? detectEndpointProvider(synthetic.url);
    if (!synthetic.files.includes(call.file)) synthetic.files.push(call.file);
    const hasSite = synthetic.callSites.some((site) => site.file === call.file && site.line === call.line && site.library === call.library);
    if (!hasSite) {
      synthetic.callSites.push({
        file: call.file,
        line: call.line,
        library: call.library ?? "",
        frequency: call.frequency,
        frequencyClass: call.frequencyClass,
        crossFileOrigin: call.crossFileOrigin ?? null,
      });
    }
    if (call.frequency === "per-request") {
      synthetic.status = "n_plus_one_risk";
      synthetic.callsPerDay = Math.max(synthetic.callsPerDay, 100);
    }
    if (!synthetic.methodSignature && call.methodSignature) synthetic.methodSignature = call.methodSignature;
    if (!synthetic.costModel && call.costModel) synthetic.costModel = call.costModel;
    synthetic.frequencyClass = pickMostSevereFrequency(synthetic.frequencyClass, call.frequencyClass);
    if (call.batchCapable) synthetic.batchCapable = true;
    if (call.cacheCapable) synthetic.cacheCapable = true;
    if (call.streaming) synthetic.streaming = true;
    if (call.isMiddleware) synthetic.isMiddleware = true;
    if (call.crossFileOrigin) {
      synthetic.crossFileOrigins = synthetic.crossFileOrigins ?? [];
      synthetic.crossFileOrigins.push(call.crossFileOrigin);
    }
  }

  return [...merged, ...syntheticByMethodUrl.values()];
}

export function buildLocalScanResults(
  apiCalls: ApiCallInput[],
  localWasteFindings: LocalWasteFinding[],
  projectId: string,
  scanId: string
): FinalScanResults {
  const endpoints = mergeRemoteAndLocalEndpoints([], apiCalls, projectId, scanId);
  const suggestions = mergeLocalWasteFindings([], localWasteFindings, endpoints, 0, projectId, scanId);
  return {
    endpoints,
    suggestions,
    summary: {
      totalEndpoints: endpoints.length,
      totalCallsPerDay: endpoints.reduce((sum, ep) => sum + ep.callsPerDay, 0),
      totalMonthlyCost: endpoints.reduce((sum, ep) => sum + ep.monthlyCost, 0),
      highRiskCount: suggestions.filter((s) => s.severity === "high").length,
    },
  };
}

export function buildRemoteScanResults(
  remoteEndpoints: EndpointRecord[],
  remoteSuggestions: Suggestion[],
  remoteSummary: ScanSummary,
  apiCalls: ApiCallInput[],
  localWasteFindings: LocalWasteFinding[],
  projectId: string,
  scanId: string
): FinalScanResults {
  const endpoints = mergeRemoteAndLocalEndpoints(remoteEndpoints, apiCalls, projectId, scanId);
  const suggestions = mergeLocalWasteFindings(
    buildAggressiveSuggestions(endpoints, tagRemoteSuggestions(remoteSuggestions)),
    localWasteFindings,
    endpoints,
    remoteSummary.totalMonthlyCost,
    projectId,
    scanId
  );
  return {
    endpoints,
    suggestions,
    summary: {
      ...remoteSummary,
      totalEndpoints: Math.max(remoteSummary.totalEndpoints, endpoints.length),
    },
  };
}
