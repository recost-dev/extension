// =============================================================
// src/intelligence/types.ts
// =============================================================
// These interfaces are the contracts between all modules.
// Do NOT change these without syncing with the full team.
// =============================================================

// ----- Core Graph Nodes -----

/**
 * Represents a single file in the scanned repo.
 * Built by the builder from scanner output.
 */
export interface FileNode {
  /** Unique ID — use the relative file path */
  id: string;
  /** Relative path from repo root, e.g. "src/gateway/chat.ts" */
  filePath: string;
  /** Line count of the file */
  lineCount: number;
  /** IDs of FunctionNodes defined in this file */
  functionIds: string[];
  /** IDs of ApiCallNodes found in this file */
  apiCallIds: string[];
  /** IDs of FindingNodes attached to this file */
  findingIds: string[];
  /** Relative paths of files this file imports */
  imports: string[];
  /** Relative paths of files that import this file */
  importedBy: string[];
  /** Provider names this file interacts with (e.g. ["openai", "stripe"]) */
  providers: string[];
}

/**
 * Represents a function or method definition inside a file.
 */
export interface FunctionNode {
  /** Unique ID — e.g. "src/chat.ts::handleMessage" */
  id: string;
  /** Name of the function */
  name: string;
  /** File this function belongs to */
  fileId: string;
  /** Start line in the file */
  startLine: number;
  /** End line in the file */
  endLine: number;
  /** IDs of ApiCallNodes inside this function */
  apiCallIds: string[];
  /** IDs of FindingNodes inside this function */
  findingIds: string[];
  /** Whether this function is exported */
  isExported: boolean;
  /** Whether this function is async */
  isAsync: boolean;
}

/**
 * Represents a single API call to an external provider.
 */
export interface ApiCallNode {
  /** Unique ID — e.g. "src/chat.ts:42:openai-chat-completions" */
  id: string;
  /** File this call is in */
  fileId: string;
  /** Function this call is inside (null if top-level) */
  functionId: string | null;
  /** Line number */
  line: number;
  /** Column number */
  column: number;
  /** Provider name from fingerprint registry */
  provider: string;
  /** Endpoint name from fingerprint registry */
  endpoint: string;
  /** Estimated cost per call in USD (from fingerprint) */
  estimatedCostPerCall: number | null;
  /** The HTTP method if known */
  method: string | null;
  /** AST context flags */
  context: {
    /** Is this call inside a loop? */
    inLoop: boolean;
    /** Is this call inside a try/catch? */
    inTryCatch: boolean;
    /** Is this call inside a retry wrapper? */
    inRetry: boolean;
    /** Is there a cache check before this call? */
    hasCacheCheck: boolean;
    /** Estimated calls per month (heuristic) */
    estimatedCallsPerMonth: number | null;
  };
}

/**
 * Represents a single finding from the waste detectors.
 * This wraps the scanner's LocalWasteFinding with graph linkage.
 */
export interface FindingNode {
  /** Unique ID — e.g. "finding-0042" */
  id: string;
  /** File this finding is in */
  fileId: string;
  /** Function this finding is in (null if top-level) */
  functionId: string | null;
  /** ApiCallNode this finding relates to (null if general) */
  apiCallId: string | null;
  /** Which detector produced this */
  detector: string;
  /** Human-readable title */
  title: string;
  /** Human-readable description */
  description: string;
  /** "low" | "medium" | "high" | "critical" */
  severity: "low" | "medium" | "high" | "critical";
  /** 0.0 to 1.0 */
  confidence: number;
  /** Start line */
  line: number;
  /** End line (for multi-line findings) */
  endLine: number | null;
  /** Code snippet as evidence */
  evidence: string;
  /** Suggested fix */
  suggestion: string;
  /** Estimated monthly cost impact in USD (null if not applicable) */
  estimatedMonthlyCost: number | null;
}

/**
 * Aggregated info about a provider across the whole repo.
 */
export interface ProviderNode {
  /** Provider name, e.g. "openai" */
  name: string;
  /** All file IDs that use this provider */
  fileIds: string[];
  /** All ApiCallNode IDs for this provider */
  apiCallIds: string[];
  /** All FindingNode IDs related to this provider */
  findingIds: string[];
  /** Total estimated monthly cost across all calls */
  estimatedMonthlyCost: number | null;
  /** Distinct endpoints used */
  endpoints: string[];
}

// ----- Repo Snapshot (output of Step 4) -----

/**
 * The full in-memory model of the scanned repo.
 * This is the single source of truth after scanning.
 */
export interface RepoIntelligenceSnapshot {
  /** When this snapshot was created */
  createdAt: string;
  /** Root path of the scanned repo */
  repoRoot: string;
  /** Total files scanned */
  totalFilesScanned: number;
  /** All file nodes, keyed by file path */
  files: Record<string, FileNode>;
  /** All function nodes, keyed by ID */
  functions: Record<string, FunctionNode>;
  /** All API call nodes, keyed by ID */
  apiCalls: Record<string, ApiCallNode>;
  /** All finding nodes, keyed by ID */
  findings: Record<string, FindingNode>;
  /** All provider summaries, keyed by provider name */
  providers: Record<string, ProviderNode>;
}

// ----- Scoring (output of Step 5) -----

/**
 * Score breakdown for a single file.
 */
export interface FileScores {
  /** Overall importance — how central is this file */
  importance: number;
  /** Cost leak — how much money might be wasted */
  costLeak: number;
  /** Reliability risk — how likely to cause incidents */
  reliabilityRisk: number;
  /** Composite AI review priority */
  aiReviewPriority: number;
}

/**
 * A scored file ready for ranking.
 */
export interface ScoredFile {
  /** The file path */
  filePath: string;
  /** The computed scores */
  scores: FileScores;
  /** Human-readable reasons explaining the scores */
  reasons: string[];
  /** Reference to the FileNode */
  fileId: string;
}

/**
 * Full scoring output for the repo.
 */
export interface ScoredSnapshot {
  /** Reference to the underlying snapshot */
  snapshot: RepoIntelligenceSnapshot;
  /** All scored files, sorted by aiReviewPriority descending */
  scoredFiles: ScoredFile[];
  /** Top providers by estimated cost */
  rankedProviders: ProviderNode[];
  /** Top findings by severity * confidence */
  rankedFindings: FindingNode[];
}

// ----- Clusters (output of Step 6) -----

/**
 * A group of related files centered on one high-priority file.
 * This is the unit of context you send to an AI.
 */
export interface ReviewCluster {
  /** Unique cluster ID */
  id: string;
  /** The primary file this cluster is about */
  primaryFile: ScoredFile;
  /** 2-5 related files providing context */
  relatedFiles: RelatedFile[];
  /** Top findings in this cluster */
  topFindings: FindingNode[];
  /** Providers involved in this cluster */
  providers: string[];
  /** Estimated total monthly cost exposure for this cluster */
  estimatedMonthlyCost: number | null;
  /** A focused question the AI should investigate */
  reviewQuestion: string;
}

/**
 * A related file within a cluster, with an explanation of why it's included.
 */
export interface RelatedFile {
  /** File path */
  filePath: string;
  /** Why this file is included — e.g. "imports the primary file", "shared OpenAI client" */
  relationship: string;
}

// ----- Compressed Summaries (output of Step 7) -----

/**
 * A compressed summary of a file for token-efficient export.
 */
export interface FileSummary {
  /** File path */
  filePath: string;
  /** 2-3 sentence description of what the file does */
  description: string;
  /** Providers it touches */
  providers: string[];
  /** Top risks in plain english */
  topRisks: string[];
  /** Estimated monthly cost exposure */
  estimatedMonthlyCost: number | null;
  /** Why this file matters — one sentence */
  whyItMatters: string;
}

/**
 * A compressed code snippet attached to a finding or cluster.
 */
export interface CompressedSnippet {
  /** File path */
  filePath: string;
  /** Start line of the snippet */
  startLine: number;
  /** End line of the snippet */
  endLine: number;
  /** The actual code lines */
  code: string;
  /** What this snippet shows — e.g. "API call inside loop" */
  label: string;
}

/**
 * A compressed review cluster ready for export.
 */
export interface CompressedCluster {
  /** Cluster ID */
  id: string;
  /** Summary of the primary file */
  primarySummary: FileSummary;
  /** Summaries of related files */
  relatedSummaries: FileSummary[];
  /** Key findings — title + severity + one-liner only */
  findings: Array<{
    title: string;
    severity: string;
    description: string;
    estimatedMonthlyCost: number | null;
  }>;
  /** Code snippets — only the relevant lines */
  snippets: CompressedSnippet[];
  /** Providers involved */
  providers: string[];
  /** Total cost exposure */
  estimatedMonthlyCost: number | null;
  /** The question the AI should investigate */
  reviewQuestion: string;
}

// ----- AI Review Pack (final output of Step 8) -----

/**
 * The final exported pack — this is the product.
 */
export interface AiReviewPack {
  /** Pack metadata */
  meta: {
    /** Repo name or root path */
    repo: string;
    /** When this pack was generated */
    generatedAt: string;
    /** Total files scanned */
    totalFilesScanned: number;
    /** Total findings */
    totalFindings: number;
    /** Total estimated monthly cost */
    totalEstimatedMonthlyCost: number | null;
  };
  /** Top 5 files ranked by AI review priority */
  topFiles: Array<{
    filePath: string;
    aiReviewPriorityScore: number;
    reasons: string[];
  }>;
  /** Top cost leak suspects */
  costLeaks: Array<{
    filePath: string;
    costLeakScore: number;
    estimatedMonthlyCost: number | null;
    reasons: string[];
  }>;
  /** Review clusters — the core unit of AI context */
  clusters: CompressedCluster[];
  /** Provider summary table */
  providerSummary: Array<{
    provider: string;
    fileCount: number;
    callCount: number;
    findingCount: number;
    estimatedMonthlyCost: number | null;
  }>;
}
