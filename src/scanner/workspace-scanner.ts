import * as vscode from "vscode";
import * as path from "path";
import { ApiCallInput } from "../analysis/types";
import { matchLine, matchNormalizedLine, matchNormalizedRouteDefinitionLine, matchRouteDefinitionLine, isInsideLoop } from "./patterns";
import { detectLocalWasteFindingsInText, type LocalWasteFinding } from "./local-waste-detector";
import { scanFileWithAst, type AstCallMatch } from "../ast/ast-scanner";
import { getLanguageForExtension } from "../ast/parser-loader";
import { runCrossFileResolution, type PerFileResult } from "../ast/cross-file-resolver";
import { detectCacheWaste } from "../ast/waste/cache-detector";
import { detectBatchWaste } from "../ast/waste/batch-detector";
import { detectConcurrencyWaste } from "../ast/waste/concurrency-detector";
import { lookupMethod } from "./fingerprints/registry";
import { isHardExcludedPath } from "./path-excludes";

const MAX_FILES = 5000;
const HTTP_CALL_HINT =
  /\b(fetch|axios|got|superagent|ky|requests|http\.|\$http|openai|responses|completions|embeddings|moderations|vector_stores|vectorStores|assistants|threads|realtime|uploads|batches|containers|skills|videos|evals|images|audio|files|models|anthropic|claude|gemini|genai|bedrock|vertex|cohere|mistral|stripe|graphql|apollo|urql|relay|supabase|firebase|trpc|grpc)\b/i;
const GENERIC_TEMPLATE_SEGMENT = /\$\{\s*(endpoint|url|path|uri|route)\s*\}/i;
export interface ScanProgress {
  file: string;
  index: number;
  total: number;
  endpointsSoFar: number;
}

function isGenericDynamicUrl(url: string): boolean {
  const dynamic = url.match(/^<dynamic:([^>]+)>$/i);
  if (dynamic) {
    const token = dynamic[1].trim().toLowerCase();
    return ["endpoint", "url", "path", "uri", "route"].includes(token);
  }
  return false;
}

function isHighConfidenceUrl(url: string): boolean {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return true;
  if (url.startsWith("/")) return true;
  if (GENERIC_TEMPLATE_SEGMENT.test(url)) return false;
  if (/^<dynamic:/i.test(url)) {
    if (isGenericDynamicUrl(url)) return false;
    const token = (url.match(/^<dynamic:([^>]+)>$/i)?.[1] ?? "").toLowerCase();
    // A lone base URL variable is not an endpoint route.
    if (/base[_-]?url/.test(token)) return false;
    return true;
  }
  return false;
}

async function readUriText(uri: vscode.Uri): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (openDoc) {
    return openDoc.getText();
  }

  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString("utf-8");
}

function parseCsvGlobs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function findScopedUris(config: vscode.WorkspaceConfiguration): Promise<vscode.Uri[]> {
  const includeGlob = config.get<string>("scanGlob", "**/*.{ts,tsx,js,jsx,py,go,java,rb}");
  const scopedInclude = parseCsvGlobs(config.get<string>("scanIncludeGlobs", ""));
  const configuredExclude = config.get<string>(
    "excludeGlob",
    "**/node_modules/**,**/dist/**,**/dist-test/**,**/build/**,**/.git/**,**/.next/**,**/vendor/**"
  );
  const hardExcludeGlob =
    "**/node_modules/**,**/docs/**,**/examples/**,**/dist/**,**/dist-test/**,**/build/**,**/coverage/**,**/.git/**,**/.next/**,**/vendor/**,**/venv/**,**/.venv/**,**/__pycache__/**";
  const mergedExclude = configuredExclude ? `${configuredExclude},${hardExcludeGlob}` : hardExcludeGlob;

  const includePatterns = scopedInclude.length > 0 ? scopedInclude : [includeGlob];
  const uriByPath = new Map<string, vscode.Uri>();

  for (const pattern of includePatterns) {
    const uris = await vscode.workspace.findFiles(pattern, mergedExclude, MAX_FILES);
    for (const uri of uris) {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      if (isHardExcludedPath(relativePath)) continue;
      uriByPath.set(uri.toString(), uri);
    }
  }

  return Array.from(uriByPath.values());
}

export async function countScopedWorkspaceFiles(): Promise<number> {
  const config = vscode.workspace.getConfiguration("recost");
  const uris = await findScopedUris(config);
  return uris.length;
}

export async function readWorkspaceFileExcerpt(
  relativePath: string,
  options?: { centerLine?: number; contextLines?: number; maxChars?: number }
): Promise<{ content: string; startLine: number; endLine: number } | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return null;

  try {
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
    const text = await readUriText(fileUri);
    const lines = text.split("\n");
    const context = Math.max(options?.contextLines ?? 30, 5);
    const center = options?.centerLine ? Math.max(1, options.centerLine) : 1;
    const startLine = Math.max(1, center - context);
    const endLine = Math.min(lines.length, center + context);
    const selected = lines.slice(startLine - 1, endLine);
    let content = selected.join("\n");
    const maxChars = Math.max(options?.maxChars ?? 6000, 500);

    if (content.length > maxChars) {
      content = `${content.slice(0, maxChars)}\n/* ...truncated... */`;
    }

    return { content, startLine, endLine };
  } catch {
    return null;
  }
}

function astMatchToApiCallInput(match: AstCallMatch, file: string): ApiCallInput {
  const method = match.method ?? "CALL";
  const url =
    match.endpoint ??
    (match.provider
      ? `sdk://${match.provider}/${match.methodChain}`
      : `ast:${match.methodChain}`);
  const library =
    match.packageName ?? match.provider ?? match.methodChain.split(".")[0];
  const isHighFreq =
    match.isMiddleware ||
    match.frequency === "unbounded-loop" ||
    match.frequency === "polling" ||
    match.frequency === "parallel" ||
    match.frequency === "bounded-loop";
  const frequency = isHighFreq ? "per-request" : "daily";

  // Look up costModel from fingerprint registry
  let costModel: ApiCallInput["costModel"];
  if (match.provider && match.methodChain) {
    const fingerprint = lookupMethod(match.provider, match.methodChain);
    if (fingerprint) {
      costModel = fingerprint.costModel;
    }
  }

  // Cross-file origin: use methodChain as functionName proxy
  const crossFileOrigin =
    match.crossFile && match.sourceFile
      ? { file: match.sourceFile, functionName: match.methodChain }
      : null;

  return {
    file,
    line: match.line,
    method,
    url,
    library,
    frequency,
    frequencyClass: match.frequency,
    provider: match.provider,
    methodSignature: match.methodChain,
    costModel,
    batchCapable: match.batchCapable,
    cacheCapable: match.cacheCapable,
    streaming: match.streaming,
    isMiddleware: match.isMiddleware,
    crossFileOrigin,
  };
}

export async function scanWorkspace(
  onProgress?: (progress: ScanProgress) => void
): Promise<ApiCallInput[]> {
  const config = vscode.workspace.getConfiguration("recost");
  const uris = await findScopedUris(config);
  const allCalls: ApiCallInput[] = [];
  const dedupe = new Set<string>();
  const uniqueEndpointKeys = new Set<string>();

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const relativePath = vscode.workspace.asRelativePath(uri, false);

    try {
      const text = await readUriText(uri);
      const lines = text.split("\n");

      // ── AST scan (JS/TS only) ──────────────────────────────────────────────
      const astCoveredLines = new Set<number>();
      const ext = path.extname(relativePath);
      if (getLanguageForExtension(ext)) {
        try {
          const absPath = uri.fsPath;
          const fileReader = async (fp: string): Promise<string | null> => {
            if (fp === absPath) return text;
            try { return await readUriText(vscode.Uri.file(fp)); } catch { return null; }
          };
          const astResult = await scanFileWithAst(absPath, fileReader);
          for (const match of astResult.matches) {
            const apiCall = astMatchToApiCallInput(match, relativePath);
            const key = `${relativePath}:${match.line}:${apiCall.method}:${apiCall.url}`;
            if (dedupe.has(key)) continue;
            dedupe.add(key);
            astCoveredLines.add(match.line);
            uniqueEndpointKeys.add(`${apiCall.method} ${apiCall.url}`);
            allCalls.push(apiCall);
          }
        } catch {
          // AST failed — fall through to regex-only for this file
        }
      }

      // ── Regex scan ────────────────────────────────────────────────────────
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineNum = lineIndex + 1;
        if (astCoveredLines.has(lineNum)) continue;

        const line = lines[lineIndex];
        const routeMatches = matchNormalizedRouteDefinitionLine(line);
        for (const route of routeMatches) {
          if (!route.method || !route.endpoint || !isHighConfidenceUrl(route.endpoint)) continue;
          const library = route.provider ?? route.sdk ?? route.kind;
          const key = `${relativePath}:${lineIndex + 1}:${route.method}:${route.endpoint}:${library}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          uniqueEndpointKeys.add(`${route.method} ${route.endpoint}`);
          allCalls.push({
            file: relativePath,
            line: lineIndex + 1,
            method: route.method,
            url: route.endpoint,
            library,
            provider: route.provider,
            batchCapable: Boolean(route.batchCapable),
            cacheCapable: Boolean(route.cacheCapable),
            streaming: Boolean(route.streaming),
            frequency: "daily",
          });
        }

        let matches = matchNormalizedLine(line);
        if (matches.length === 0 && HTTP_CALL_HINT.test(line)) {
          const multiLine = lines.slice(lineIndex, Math.min(lines.length, lineIndex + 6)).join("\n");
          matches = matchNormalizedLine(multiLine);
        }

        for (const match of matches) {
          if (!match.method || !match.endpoint || !isHighConfidenceUrl(match.endpoint)) continue;
          const library = match.provider ?? match.sdk ?? match.kind;
          const key = `${relativePath}:${lineIndex + 1}:${match.method}:${match.endpoint}:${library}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          uniqueEndpointKeys.add(`${match.method} ${match.endpoint}`);
          const inLoop = isInsideLoop(lines, lineIndex);
          allCalls.push({
            file: relativePath,
            line: lineIndex + 1,
            method: match.method,
            url: match.endpoint,
            library,
            provider: match.provider,
            batchCapable: Boolean(match.batchCapable),
            cacheCapable: Boolean(match.cacheCapable),
            streaming: Boolean(match.streaming),
            frequency: inLoop ? "per-request" : "daily",
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }

    onProgress?.({
      file: relativePath,
      index: i,
      total: uris.length,
      endpointsSoFar: uniqueEndpointKeys.size,
    });
  }

  return allCalls;
}

export async function detectLocalWastePatterns(): Promise<LocalWasteFinding[]> {
  const config = vscode.workspace.getConfiguration("recost");
  const uris = await findScopedUris(config);

  const perFileResults: PerFileResult[] = [];
  const nonAstFindings: LocalWasteFinding[] = [];

  // ── First pass: scan all files ───────────────────────────────────────────
  for (const uri of uris) {
    try {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const absPath = uri.fsPath;
      const text = await readUriText(uri);
      const ext = path.extname(relativePath);

      if (getLanguageForExtension(ext)) {
        // AST-capable file — accumulate for cross-file resolution
        try {
          const fileReader = async (fp: string): Promise<string | null> => {
            if (fp === absPath) return text;
            try { return await readUriText(vscode.Uri.file(fp)); } catch { return null; }
          };
          const result = await scanFileWithAst(absPath, fileReader);
          perFileResults.push({ filePath: absPath, relativePath, source: text, result });
        } catch {
          // AST failed — fall back to regex for this file
          nonAstFindings.push(...detectLocalWasteFindingsInText(relativePath, text));
        }
      } else {
        // Non-AST file (Python, Go, etc.) — use regex detector
        nonAstFindings.push(...detectLocalWasteFindingsInText(relativePath, text));
      }
    } catch {
      // Skip files that can't be read
    }
  }

  // ── Second pass: cross-file resolution + AST waste detection ────────────
  let augmented: Map<string, AstCallMatch[]>;
  try {
    augmented = runCrossFileResolution(perFileResults);
  } catch {
    // Cross-file resolution failed — fall back to per-file matches only
    augmented = new Map(perFileResults.map((pf) => [pf.relativePath, pf.result.matches]));
  }
  const astFindings: LocalWasteFinding[] = [];

  for (const pf of perFileResults) {
    const matches = augmented.get(pf.relativePath) ?? pf.result.matches;
    astFindings.push(...detectCacheWaste(matches, pf.source, pf.relativePath));
    astFindings.push(...detectBatchWaste(matches, pf.source, pf.relativePath));
    astFindings.push(...detectConcurrencyWaste(matches, pf.source, pf.relativePath));
  }

  // Deduplicate across all findings by (type, file, line)
  const seen = new Map<string, LocalWasteFinding>();
  for (const f of [...astFindings, ...nonAstFindings]) {
    const key = `${f.type}:${f.affectedFile}:${f.line ?? 0}`;
    const existing = seen.get(key);
    if (!existing || f.confidence > existing.confidence) seen.set(key, f);
  }
  return [...seen.values()];
}
