"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectLocalWasteFindingsInText = detectLocalWasteFindingsInText;
const patterns_1 = require("./patterns");
const HTTP_CALL_HINT = /\b(fetch|axios|got|superagent|ky|requests|http\.|\$http|openai|responses|completions|embeddings|moderations|vector_stores|vectorStores|assistants|threads|realtime|uploads|batches|containers|skills|videos|evals|images|audio|files|models|anthropic|claude|gemini|genai|bedrock|vertex|cohere|mistral|stripe|graphql|apollo|urql|relay|supabase|firebase|trpc|grpc)\b/i;
const CACHE_GUARD = /\b(cache|memo|memoize|singleflight|dedupe|deduping|swr|react-query|queryClient|staleTime|ttl|etag|cache-control|cacheControl|persistedQuery|revalidate)\b/i;
const BATCH_GUARD = /\b(batch|batches|bulk|chunk|upsert|messageBatches|message_batches|flushQueue|enqueue)\b/i;
const CONCURRENCY_GUARD = /\b(p-limit|bottleneck|semaphore|mutex|queue|throttle|debounce|concurrency\s*:|limit\s*:|pool)\b/i;
const RETRY_GUARD = /\b(backoff|jitter|retryAfter|exponential|sleep\(|delay\(|retryDelay)\b/i;
const IDEMPOTENCY_GUARD = /\b(idempotency|idempotencyKey|requestId|correlationId|dedupeKey|uniqueKey)\b/i;
const EXPLICIT_GUARD = /\b(devOnly|NODE_ENV|featureFlag|maxItems|maxBatch|cap|guard|unsubscribe|teardown|cleanup)\b/i;
const HOT_PATH_PATTERN = /\b(router|app)\.(get|post|put|patch|delete)\(|@[\w.]+\.(get|post|put|patch|delete)\(|webhook|cron|schedule|queue|worker|useEffect|loader|action|onSnapshot|onValue|subscribe|requestSubscription|refetchInterval|setInterval\(/i;
const POLLING_PATTERN = /\b(setInterval|poll|polling|refetchInterval)\b/i;
const PROMISE_ALL_PATTERN = /\bPromise\.all(?:Settled)?\b/i;
const MAP_FANOUT_PATTERN = /\b(map|forEach|flatMap|reduce)\s*\(/i;
const ARRAY_FANOUT_PATTERN = /\bArray\.from\(\{\s*length\s*:\s*(\d+|[A-Za-z_]\w*)/i;
const RETRY_PATTERN = /\b(retry|attempt|retries|retrying)\b/i;
const AUTH_LOOKUP_PATTERN = /\b(getUser|getSession|auth\.|authorization|accessToken|session|refreshSession)\b/i;
const CONFIG_LOOKUP_PATTERN = /\b(getConfig|loadConfig|config\.|process\.env|featureFlag|flagClient|secret)\b/i;
const CLIENT_INIT_PATTERN = /new\s+(OpenAI|Anthropic|CohereClient|Mistral|Stripe|VertexAI|GoogleGenAI|Agent|ApolloClient|QueryClient)\s*\(/g;
const TEST_FILE_PATTERN = /(^|\/)(test|tests|spec|stories|storybook|fixtures?|examples?)\//i;
const STARTUP_FILE_PATTERN = /(^|\/)(scripts|bin|migrations?|seed|bootstrap|cli)\//i;
const SMALL_BOUNDED_PATTERN = /\b(length\s*:\s*[1-5]\b|<\s*[1-5]\b|slice\(\s*0\s*,\s*[1-5]\s*\))\b/i;
const CACHE_TYPES = new Set(["query", "select", "get", "retrieve", "list", "content", "download"]);
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_METHODS = new Set(["GET"]);
function clampConfidence(value) {
    if (value < 0)
        return 0;
    if (value > 1)
        return 1;
    return Number(value.toFixed(2));
}
function buildResourceKey(match) {
    return [
        match.provider ?? "unknown",
        match.resource ?? match.endpoint ?? "unknown",
        match.action ?? "",
        match.method ?? "",
    ].join("|");
}
function classifyCallKind(match) {
    const method = (match.method ?? "").toUpperCase();
    const action = (match.action ?? "").toLowerCase();
    const isSubscription = method === "SUBSCRIBE" || Boolean(match.streaming) || /subscription|listener/.test(action);
    if (isSubscription) {
        return { isRead: false, isWrite: false, isSubscription: true };
    }
    const isRead = READ_METHODS.has(method) ||
        CACHE_TYPES.has(action) ||
        Boolean(match.cacheCapable && !WRITE_METHODS.has(method));
    const isWrite = WRITE_METHODS.has(method) ||
        /create|insert|update|delete|submit|mutat|upload|stream|run|send/.test(action);
    return { isRead, isWrite, isSubscription: false };
}
function getWindow(lines, lineIndex, radius = 8) {
    const start = Math.max(0, lineIndex - radius);
    const end = Math.min(lines.length, lineIndex + radius + 1);
    return lines.slice(start, end).join("\n");
}
function extractCallSites(relativePath, lines) {
    const rawMatches = [];
    const seen = new Set();
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        let matches = (0, patterns_1.matchNormalizedLine)(line);
        if (matches.length === 0 && HTTP_CALL_HINT.test(line)) {
            const multiLine = lines.slice(lineIndex, Math.min(lines.length, lineIndex + 6)).join("\n");
            matches = (0, patterns_1.matchNormalizedLine)(multiLine);
        }
        for (const match of matches) {
            const key = `${lineIndex}:${match.provider ?? ""}:${match.endpoint ?? ""}:${match.action ?? ""}:${match.rawMatch ?? ""}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            rawMatches.push({ line: lineIndex + 1, match });
        }
    }
    const countByResource = new Map();
    for (const candidate of rawMatches) {
        const key = buildResourceKey(candidate.match);
        countByResource.set(key, (countByResource.get(key) ?? 0) + 1);
    }
    return rawMatches.map(({ line, match }) => {
        const windowText = getWindow(lines, line - 1);
        const callKind = classifyCallKind(match);
        return {
            line,
            match,
            windowText,
            loopDepth: (0, patterns_1.getLoopDepth)(lines, line - 1),
            promiseAll: PROMISE_ALL_PATTERN.test(windowText),
            mapFanout: MAP_FANOUT_PATTERN.test(windowText),
            arrayFanout: ARRAY_FANOUT_PATTERN.test(windowText),
            hotPath: HOT_PATH_PATTERN.test(windowText) || /(^|\/)(api|routes?|handlers?|pages|app)\//i.test(relativePath),
            polling: POLLING_PATTERN.test(windowText),
            retryNearby: RETRY_PATTERN.test(windowText),
            cacheGuard: CACHE_GUARD.test(windowText),
            batchGuard: BATCH_GUARD.test(windowText),
            concurrencyGuard: CONCURRENCY_GUARD.test(windowText),
            retryGuard: RETRY_GUARD.test(windowText),
            idempotencyGuard: IDEMPOTENCY_GUARD.test(windowText),
            explicitGuard: EXPLICIT_GUARD.test(windowText),
            authLookup: AUTH_LOOKUP_PATTERN.test(windowText),
            configLookup: CONFIG_LOOKUP_PATTERN.test(windowText),
            smallBounded: SMALL_BOUNDED_PATTERN.test(windowText),
            repeatedResourceCount: countByResource.get(buildResourceKey(match)) ?? 1,
            isTestLike: TEST_FILE_PATTERN.test(relativePath),
            isStartupLike: STARTUP_FILE_PATTERN.test(relativePath),
            ...callKind,
        };
    });
}
function baseScore(site) {
    let score = 1;
    if (site.loopDepth > 0)
        score += 2;
    if (site.loopDepth > 1)
        score += 1;
    if (site.promiseAll)
        score += 1;
    if (site.mapFanout || site.arrayFanout)
        score += 1;
    if (site.hotPath)
        score += 1;
    if (site.repeatedResourceCount >= 2)
        score += 1;
    if (site.retryNearby && !site.retryGuard)
        score += 1;
    if (site.isSubscription)
        score += 1;
    if (site.smallBounded)
        score -= 1;
    if (site.explicitGuard)
        score -= 1;
    if (site.isTestLike || site.isStartupLike)
        score -= 1;
    return score;
}
function scoreToSeverity(score) {
    if (score >= 5)
        return "high";
    if (score >= 3)
        return "medium";
    return "low";
}
function scoreToConfidence(score, site, matchedCapability = false) {
    let confidence = 0.48;
    confidence += Math.min(score, 5) * 0.07;
    if (matchedCapability)
        confidence += 0.08;
    if (site.cacheGuard || site.batchGuard || site.concurrencyGuard || site.retryGuard || site.idempotencyGuard)
        confidence -= 0.18;
    if (site.smallBounded)
        confidence -= 0.1;
    if (site.isTestLike || site.isStartupLike)
        confidence -= 0.1;
    return clampConfidence(confidence);
}
function pushEvidence(evidence, condition, message) {
    if (condition)
        evidence.push(message);
}
function makeFinding(relativePath, line, type, description, score, confidence, evidence) {
    if (confidence < 0.35)
        return null;
    return {
        id: `local-${type}-${relativePath}:${line}`,
        type,
        severity: scoreToSeverity(score),
        confidence,
        description,
        affectedFile: relativePath,
        line,
        evidence,
    };
}
function detectCacheFinding(relativePath, site) {
    if (!site.isRead || site.cacheGuard)
        return null;
    const queryWithoutPersisted = site.match.kind === "graphql" && !!site.match.inferredCostRisk?.includes("missing-persisted-query-hint");
    const repeatedLookup = site.authLookup || site.configLookup || site.repeatedResourceCount >= 2;
    if (!queryWithoutPersisted && !repeatedLookup && !site.hotPath && site.loopDepth === 0)
        return null;
    const evidence = [];
    pushEvidence(evidence, site.repeatedResourceCount >= 2, "Repeated reads hit the same provider/resource in this file.");
    pushEvidence(evidence, site.authLookup, "Auth/session lookup is near the outbound call.");
    pushEvidence(evidence, site.configLookup, "Config or feature-flag lookup is near the outbound call.");
    pushEvidence(evidence, site.hotPath, "Call appears inside a request/effect/subscription hot path.");
    pushEvidence(evidence, queryWithoutPersisted, "GraphQL query does not show persisted-query caching hints.");
    const score = baseScore(site) + (site.hotPath ? 1 : 0) + (queryWithoutPersisted ? 1 : 0) - (site.isWrite ? 2 : 0);
    const confidence = scoreToConfidence(score, site, Boolean(site.match.cacheCapable || queryWithoutPersisted || site.isRead));
    return makeFinding(relativePath, site.line, "cache", "Repeated read-like API work appears without nearby caching or request dedupe safeguards.", score, confidence, evidence);
}
function detectBatchFinding(relativePath, site) {
    const batchCapableHint = Boolean(site.match.batchCapable) ||
        /embed|embedding|responses|messages|generatecontent|select|query/i.test(site.match.action ?? "");
    if (site.batchGuard || !batchCapableHint)
        return null;
    if (!(site.loopDepth > 0 || site.promiseAll || site.mapFanout || site.repeatedResourceCount >= 3))
        return null;
    const evidence = [];
    pushEvidence(evidence, site.loopDepth > 0, "Call executes inside a loop.");
    pushEvidence(evidence, site.promiseAll || site.mapFanout, "Parallel collection fanout is nearby.");
    pushEvidence(evidence, site.repeatedResourceCount >= 3, "The same provider/resource is called repeatedly.");
    const score = baseScore(site) + 1 - (site.smallBounded ? 1 : 0) - (site.isWrite ? 1 : 0);
    const confidence = scoreToConfidence(score, site, batchCapableHint);
    return makeFinding(relativePath, site.line, "batch", "Repeated batch-capable API work appears inside loop or fanout code without visible bulk/batch handling.", score, confidence, evidence);
}
function detectRedundancyFinding(relativePath, site, clientInitCount) {
    const repeatedLookup = site.authLookup || site.configLookup;
    const clientChurn = clientInitCount >= 2 && site.hotPath;
    if (!repeatedLookup && !clientChurn && site.repeatedResourceCount < 3)
        return null;
    if (site.cacheGuard && site.repeatedResourceCount < 3 && !repeatedLookup)
        return null;
    const evidence = [];
    pushEvidence(evidence, repeatedLookup, "Auth/session/config work is repeated near outbound calls.");
    pushEvidence(evidence, clientChurn, "Multiple SDK or transport client initializations appear in a hot path.");
    pushEvidence(evidence, site.repeatedResourceCount >= 3, "The same provider/resource appears multiple times in one file.");
    const score = baseScore(site) + (clientChurn ? 1 : 0);
    const confidence = scoreToConfidence(score, site, repeatedLookup || clientChurn);
    return makeFinding(relativePath, site.line, "redundancy", "Repeated lookup or client setup work appears near outbound API calls and is likely causing avoidable duplicate effort.", score, confidence, evidence);
}
function detectNPlusOneFinding(relativePath, site) {
    if (site.batchGuard || site.concurrencyGuard)
        return null;
    if (!(site.loopDepth > 0 || (site.promiseAll && site.mapFanout)))
        return null;
    const evidence = [];
    pushEvidence(evidence, site.loopDepth > 0, "Outbound call occurs inside a loop.");
    pushEvidence(evidence, site.loopDepth > 1, "Nested loop context increases fanout risk.");
    pushEvidence(evidence, site.promiseAll && site.mapFanout, "Promise.all fanout over a collection is nearby.");
    pushEvidence(evidence, site.hotPath, "The fanout appears on a hot path.");
    const score = baseScore(site) + 1;
    const confidence = scoreToConfidence(score, site, true);
    return makeFinding(relativePath, site.line, "n_plus_one", "Loop-driven outbound API work appears likely to scale linearly with collection size.", score, confidence, evidence);
}
function detectRateLimitFinding(relativePath, site) {
    if (site.retryGuard && site.concurrencyGuard && !site.polling)
        return null;
    const bursty = site.polling || site.retryNearby || (site.hotPath && (site.promiseAll || site.mapFanout)) || site.isSubscription;
    if (!bursty)
        return null;
    const evidence = [];
    pushEvidence(evidence, site.polling, "Polling or timer-driven behavior is near the call.");
    pushEvidence(evidence, site.retryNearby, "Retry logic is near the call.");
    pushEvidence(evidence, site.isWrite, "Write-like operations are more sensitive to duplicate retries.");
    pushEvidence(evidence, site.isSubscription, "Subscription/listener patterns can multiply live traffic.");
    pushEvidence(evidence, site.retryGuard, "Backoff or retry pacing was detected, reducing confidence.");
    const score = baseScore(site) + (site.isWrite ? 1 : 0) + (site.polling ? 1 : 0) - (site.retryGuard ? 1 : 0) - (site.concurrencyGuard ? 1 : 0);
    const confidence = scoreToConfidence(score, site, bursty);
    return makeFinding(relativePath, site.line, "rate_limit", "Traffic amplification patterns suggest burst or retry behavior that may trigger provider rate limits.", score, confidence, evidence);
}
function detectConcurrencyFinding(relativePath, site) {
    if (site.concurrencyGuard)
        return null;
    const uncontrolled = (site.promiseAll && (site.mapFanout || site.arrayFanout || site.loopDepth > 0)) ||
        (site.isSubscription && site.repeatedResourceCount >= 2) ||
        (site.polling && site.hotPath);
    if (!uncontrolled)
        return null;
    const evidence = [];
    pushEvidence(evidence, site.promiseAll, "Promise.all is used near the outbound call.");
    pushEvidence(evidence, site.mapFanout || site.arrayFanout, "Collection fanout appears uncontrolled.");
    pushEvidence(evidence, site.isSubscription, "Listener/subscription registration can multiply concurrency.");
    pushEvidence(evidence, site.polling && site.hotPath, "Polling occurs on a hot path without visible concurrency controls.");
    const score = baseScore(site) + 1;
    const confidence = scoreToConfidence(score, site, true);
    return makeFinding(relativePath, site.line, "concurrency_control", "Outbound work appears to fan out without visible concurrency limits or queueing safeguards.", score, confidence, evidence);
}
function dedupeFindings(findings) {
    const deduped = new Map();
    for (const finding of findings) {
        if (!finding)
            continue;
        const key = `${finding.type}:${finding.affectedFile}:${finding.line ?? 0}`;
        const existing = deduped.get(key);
        if (!existing || finding.confidence > existing.confidence) {
            deduped.set(key, finding);
        }
    }
    return [...deduped.values()];
}
function detectLocalWasteFindingsInText(relativePath, text) {
    const lines = text.split("\n");
    const callSites = extractCallSites(relativePath, lines);
    const clientInitCount = (text.match(CLIENT_INIT_PATTERN) ?? []).length;
    const findings = [];
    for (const site of callSites) {
        findings.push(detectCacheFinding(relativePath, site));
        findings.push(detectBatchFinding(relativePath, site));
        findings.push(detectRedundancyFinding(relativePath, site, clientInitCount));
        findings.push(detectNPlusOneFinding(relativePath, site));
        findings.push(detectRateLimitFinding(relativePath, site));
        findings.push(detectConcurrencyFinding(relativePath, site));
    }
    return dedupeFindings(findings);
}
//# sourceMappingURL=local-waste-detector.js.map