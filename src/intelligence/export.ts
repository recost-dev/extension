import path from "node:path";

import type { CompressedCluster, ExportedContext, RepoIntelligenceSnapshot, ScoredSnapshot } from "./types";
import { isDeprioritizedContextFilePath, isTestLikeFilePath } from "./file-signals";
import { filterRealProviders, normalizeProviderId } from "./provider-normalization";

const MAX_TOP_FILES = 5;
const MAX_KEY_RISKS = 5;
const RISK_PRIORITY = [
  "Unbounded loop API calls",
  "Parallel API fanout",
  "Polling API traffic",
  "Repeated endpoint calls",
  "Rate-limit risk",
  "Missing caching on hot path",
] as const;
const DISPLAY_PROVIDER_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Gemini",
  cohere: "Cohere",
  mistral: "Mistral",
  xai: "xAI",
  perplexity: "Perplexity",
  openrouter: "OpenRouter",
  groq: "Groq",
  deepseek: "DeepSeek",
  stripe: "Stripe",
  paypal: "PayPal",
  aws: "AWS",
  "aws-bedrock": "AWS Bedrock",
  "aws-s3": "AWS S3",
  "aws-api-gateway": "AWS API Gateway",
  "aws-lambda": "AWS Lambda",
  "vertex-ai": "Vertex AI",
  supabase: "Supabase",
};
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".ts": "ts",
  ".tsx": "tsx",
  ".js": "js",
  ".jsx": "jsx",
  ".py": "py",
  ".go": "go",
  ".java": "java",
  ".rb": "rb",
};
const CHAT_PROVIDER_FILE_PATTERN = /^src\/chat\/providers\/([^/]+)\.ts$/;
const SCANNER_PROVIDER_FILE_PATTERN = /^src\/scanner\/patterns\/provider-([^/]+)\.ts$/;

function formatProvider(provider: string): string {
  const normalized = normalizeProviderId(provider) ?? provider;
  return DISPLAY_PROVIDER_NAMES[normalized] ?? normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getProjectName(snapshot: RepoIntelligenceSnapshot): string {
  const projectName = path.basename(snapshot.repoRoot ?? process.cwd()).trim();
  return projectName || "Unknown Project";
}

function normalizeFallbackReason(reason: string, filePath: string): string {
  const subject = isTestLikeFilePath(filePath) ? "This test file is prioritized because" : "This file is prioritized because";
  if (/unbounded-loop/i.test(reason)) {
    return `${subject} it contains unbounded-loop traffic.`;
  }
  if (/parallel/i.test(reason)) {
    return `${subject} it contains parallel API traffic.`;
  }
  if (/polling/i.test(reason)) {
    return `${subject} it contains polling API traffic.`;
  }
  if (/cache/i.test(reason)) {
    return `${subject} it has cache-related review signals.`;
  }
  if (/repeated/i.test(reason)) {
    return `${subject} it repeats endpoint usage in one file.`;
  }
  if (/reliability/i.test(reason)) {
    return `${subject} it raises reliability risk.`;
  }
  return `${subject} ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
}

function buildWhyItMattersByFile(clusters: CompressedCluster[]): Map<string, string> {
  const whyByFile = new Map<string, string>();

  for (const cluster of clusters) {
    whyByFile.set(cluster.primarySummary.filePath, cluster.primarySummary.whyItMatters);
    for (const summary of cluster.relatedSummaries) {
      if (!whyByFile.has(summary.filePath)) {
        whyByFile.set(summary.filePath, summary.whyItMatters);
      }
    }
  }

  return whyByFile;
}

function toPotentialRiskLabel(risk: string): string {
  return `Potential ${risk.charAt(0).toLowerCase()}${risk.slice(1)}`;
}

function normalizeRisk(risk: string): { label: string; isPotential: boolean } | null {
  const isPotential = /^Potential\s+/i.test(risk);
  const unprefixed = risk.replace(/^Potential\s+/i, "").trim();
  const normalized = unprefixed.toLowerCase();
  if (normalized === "unbounded loop api calls") return { label: "Unbounded loop API calls", isPotential };
  if (normalized === "parallel api fanout") return { label: "Parallel API fanout", isPotential };
  if (normalized === "polling api traffic") return { label: "Polling API traffic", isPotential };
  if (normalized === "repeated endpoint calls" || normalized === "repeated api pattern") {
    return { label: "Repeated endpoint calls", isPotential };
  }
  if (normalized === "rate-limit risk") return { label: "Rate-limit risk", isPotential };
  if (normalized === "missing caching on hot path" || normalized === "missing caching") {
    return { label: "Missing caching on hot path", isPotential };
  }
  if (normalized === "relevant api path") return null;
  return null;
}

function aggregateKeyRisks(clusters: CompressedCluster[]): string[] {
  const counts = new Map<string, { count: number; hasConfirmedEvidence: boolean }>();
  const runtimeClusters = clusters.filter((cluster) =>
    !isTestLikeFilePath(cluster.primarySummary.filePath) &&
    !isDeprioritizedContextFilePath(cluster.primarySummary.filePath)
  );
  const sourceClusters = runtimeClusters.length > 0 ? runtimeClusters : clusters;

  const pushRisk = (risk: string): void => {
    const normalized = normalizeRisk(risk);
    if (!normalized) return;
    const existing = counts.get(normalized.label) ?? { count: 0, hasConfirmedEvidence: false };
    existing.count += 1;
    existing.hasConfirmedEvidence ||= !normalized.isPotential;
    counts.set(normalized.label, existing);
  };

  for (const cluster of sourceClusters) {
    for (const risk of cluster.primarySummary.topRisks) pushRisk(risk);
    for (const summary of cluster.relatedSummaries) {
      for (const risk of summary.topRisks) pushRisk(risk);
    }
    for (const finding of cluster.findings) {
      pushRisk(finding.title);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => {
      const priorityA = RISK_PRIORITY.indexOf(a[0] as (typeof RISK_PRIORITY)[number]);
      const priorityB = RISK_PRIORITY.indexOf(b[0] as (typeof RISK_PRIORITY)[number]);
      return b[1].count - a[1].count || priorityA - priorityB || a[0].localeCompare(b[0]);
    })
    .slice(0, MAX_KEY_RISKS)
    .map(([risk, state]) => (state.hasConfirmedEvidence ? risk : toPotentialRiskLabel(risk)));
}

function getTopFiles(clusters: CompressedCluster[], scored: ScoredSnapshot): ExportedContext["summary"]["topFiles"] {
  const whyByFile = buildWhyItMattersByFile(clusters);
  const preferredFiles = scored.scoredFiles.filter((file) =>
    !isTestLikeFilePath(file.filePath) &&
    !isDeprioritizedContextFilePath(file.filePath)
  );
  const nonTestFiles = scored.scoredFiles.filter((file) => !isTestLikeFilePath(file.filePath));
  const selectedFiles = (preferredFiles.length > 0 ? preferredFiles : nonTestFiles.length > 0 ? nonTestFiles : scored.scoredFiles)
    .slice(0, MAX_TOP_FILES);

  return selectedFiles.map((file) => ({
    filePath: file.filePath,
    whyItMatters: whyByFile.get(file.filePath) ?? normalizeFallbackReason(file.reasons[0] ?? "it is high priority", file.filePath),
  }));
}

function getAllProviders(clusters: CompressedCluster[]): string[] {
  return filterRealProviders(clusters.flatMap((cluster) => cluster.providers));
}

function getProvidersFromSnapshot(snapshot: RepoIntelligenceSnapshot): string[] {
  return filterRealProviders([
    ...Object.keys(snapshot.providers),
    ...Object.values(snapshot.apiCalls).map((apiCall) => apiCall.provider),
  ]);
}

function formatProviderList(providers: string[]): string {
  if (providers.length === 0) return "None";
  return providers.map(formatProvider).join(", ");
}

function inferContextProviderFromFilePath(filePath: string): string | null {
  const match = filePath.match(CHAT_PROVIDER_FILE_PATTERN) ?? filePath.match(SCANNER_PROVIDER_FILE_PATTERN);
  if (!match) return null;
  return filterRealProviders([normalizeProviderId(match[1])])[0] ?? null;
}

function collectRenderedContextProviders(
  topFiles: ExportedContext["summary"]["topFiles"],
  clusters: CompressedCluster[]
): string[] {
  const visibleFilePaths = new Set<string>();

  for (const file of topFiles) {
    visibleFilePaths.add(file.filePath);
  }
  for (const cluster of clusters) {
    visibleFilePaths.add(cluster.primarySummary.filePath);
    for (const summary of cluster.relatedSummaries) {
      visibleFilePaths.add(summary.filePath);
    }
  }

  return filterRealProviders(
    Array.from(visibleFilePaths)
      .map((filePath) => inferContextProviderFromFilePath(filePath))
      .filter((provider): provider is string => provider !== null)
  );
}

function haveSameProviderSet(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((provider, index) => provider === right[index]);
}

function formatClusterProviders(cluster: CompressedCluster): string[] {
  const clusterProviders = filterRealProviders(cluster.providers);
  const primaryProviders = filterRealProviders(cluster.primarySummary.providers);
  const primaryFileIdentity = inferContextProviderFromFilePath(cluster.primarySummary.filePath);

  if (clusterProviders.length === 0 && primaryProviders.length === 0 && !primaryFileIdentity) {
    return ["None"];
  }

  const relatedOnly = clusterProviders.filter((provider) => !primaryProviders.includes(provider));
  const effectiveClusterProviders = clusterProviders.length > 0 ? clusterProviders : primaryProviders;
  const lines = [
    `Detected in cluster: ${formatProviderList(effectiveClusterProviders)}`,
    `Detected in primary file: ${formatProviderList(primaryProviders)}`,
  ];

  if (relatedOnly.length > 0) {
    lines.push(`Added by related files: ${formatProviderList(relatedOnly)}`);
  }
  if (primaryFileIdentity && !primaryProviders.includes(primaryFileIdentity)) {
    lines.push(`Primary file identity: ${formatProviderList([primaryFileIdentity])} (from file path only)`);
  }

  return lines;
}

function detectFenceLanguage(filePath: string): string {
  return LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? "";
}

export function buildExportContext(
  clusters: CompressedCluster[],
  snapshot: RepoIntelligenceSnapshot,
  scored: ScoredSnapshot,
  options?: { generatorVersion?: string }
): ExportedContext {
  const topFiles = getTopFiles(clusters, scored);
  const detectedProviders = (() => {
    const snapshotProviders = getProvidersFromSnapshot(snapshot);
    if (snapshotProviders.length > 0) return snapshotProviders;
    return getAllProviders(clusters);
  })();
  const contextProviders = collectRenderedContextProviders(topFiles, clusters);

  return {
    meta: {
      projectName: getProjectName(snapshot),
      generatedAt: new Date().toISOString(),
      generatorVersion: options?.generatorVersion,
      totalFiles: snapshot.totalFilesScanned,
      totalClusters: clusters.length,
      providers: detectedProviders,
      ...(contextProviders.length > 0 ? { contextProviders } : {}),
    },
    summary: {
      topFiles,
      keyRisks: aggregateKeyRisks(clusters),
    },
    clusters,
  };
}

export function formatAsMarkdown(context: ExportedContext): string {
  const lines: string[] = [];

  lines.push(`# ReCost Scan — ${context.meta.projectName}`);
  lines.push("");
  lines.push("## Summary");
  if (context.meta.generatorVersion) {
    lines.push(`- Generator: ReCost ${context.meta.generatorVersion}`);
  }
  lines.push(`- Files scanned: ${context.meta.totalFiles}`);
  lines.push(`- Clusters: ${context.meta.totalClusters}`);
  lines.push(`- Detected providers: ${formatProviderList(context.meta.providers)}`);
  if (
    context.meta.contextProviders &&
    context.meta.contextProviders.length > 0 &&
    !haveSameProviderSet(context.meta.providers, context.meta.contextProviders)
  ) {
    lines.push(`- Provider-related files in rendered context: ${formatProviderList(context.meta.contextProviders)}`);
  }
  lines.push("");
  lines.push("## Key Risks");
  if (context.summary.keyRisks.length === 0) {
    lines.push("- None");
  } else {
    for (const risk of context.summary.keyRisks) {
      lines.push(`- ${risk}`);
    }
  }
  lines.push("");
  lines.push("## Top Files");
  if (context.summary.topFiles.length === 0) {
    lines.push("- None");
  } else {
    for (const file of context.summary.topFiles) {
      const why = file.whyItMatters.endsWith(".") ? file.whyItMatters.slice(0, -1) : file.whyItMatters;
      lines.push(`- ${file.filePath} — ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
    }
  }

  context.clusters.forEach((cluster, index) => {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## Cluster ${index + 1} — ${cluster.primarySummary.filePath}`);
    lines.push("");
    lines.push("### Why this matters");
    lines.push(cluster.primarySummary.whyItMatters);
    lines.push("");
    lines.push("### Providers");
    for (const providerLine of formatClusterProviders(cluster)) {
      lines.push(providerLine);
    }
    lines.push("");
    lines.push("### Top Risks");
    if (cluster.primarySummary.topRisks.length === 0) {
      lines.push("- None");
    } else {
      for (const risk of cluster.primarySummary.topRisks) {
        lines.push(`- ${risk}`);
      }
    }
    lines.push("");
    lines.push("### Findings");
    if (cluster.findings.length === 0) {
      lines.push("- None");
    } else {
      for (const finding of cluster.findings) {
        const description = finding.description.endsWith(".") ? finding.description.slice(0, -1) : finding.description;
        lines.push(`- ${finding.title} — ${description}`);
      }
    }
    lines.push("");
    lines.push("### Related Files");
    if (cluster.relatedSummaries.length === 0) {
      lines.push("- None");
    } else {
      for (const summary of cluster.relatedSummaries) {
        const why = summary.whyItMatters.endsWith(".") ? summary.whyItMatters.slice(0, -1) : summary.whyItMatters;
        lines.push(`- ${summary.filePath} — ${why.charAt(0).toLowerCase()}${why.slice(1)}`);
      }
    }
    lines.push("");
    lines.push("### Snippets");
    if (cluster.snippets.length === 0) {
      lines.push("None");
    } else {
      for (const snippet of cluster.snippets) {
        const language = detectFenceLanguage(snippet.filePath);
        lines.push(`${language ? `\`\`\`${language}` : "```"}`);
        lines.push(`// ${snippet.label}`);
        lines.push(snippet.code);
        lines.push("```");
        lines.push("");
      }
      if (lines[lines.length - 1] === "") {
        lines.pop();
      }
    }
  });

  return lines.join("\n");
}

export function formatAsJSON(context: ExportedContext): string {
  return JSON.stringify(context, null, 2);
}
