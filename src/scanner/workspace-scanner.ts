import * as vscode from "vscode";
import * as path from "path";
import { ApiCallInput } from "../analysis/types";
import { matchLine, matchRouteDefinitionLine, isInsideLoop } from "./patterns";
import { detectLocalWasteFindingsInText, type LocalWasteFinding } from "./local-waste-detector";
import { scanFileWithAst, type AstCallMatch } from "../ast/ast-scanner";
import { getLanguageForExtension } from "../ast/parser-loader";

const MAX_FILES = 5000;
const HTTP_CALL_HINT =
  /\b(fetch|axios|got|superagent|ky|requests|http\.|\$http|openai|responses|completions|embeddings|moderations|vector_stores|vectorStores|assistants|threads|realtime|uploads|batches|containers|skills|videos|evals|images|audio|files|models|anthropic|claude|gemini|genai|bedrock|vertex|cohere|mistral|stripe|graphql|apollo|urql|relay|supabase|firebase|trpc|grpc)\b/i;
const GENERIC_TEMPLATE_SEGMENT = /\$\{\s*(endpoint|url|path|uri|route)\s*\}/i;
const HARD_EXCLUDED_SEGMENTS = new Set([
  "node_modules",
  "docs",
  "examples",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  "vendor",
  "venv",
  ".venv",
  "__pycache__",
]);

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

function isHardExcludedPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.some((segment) => HARD_EXCLUDED_SEGMENTS.has(segment));
}

async function findScopedUris(config: vscode.WorkspaceConfiguration): Promise<vscode.Uri[]> {
  const includeGlob = config.get<string>("scanGlob", "**/*.{ts,tsx,js,jsx,py,go,java,rb}");
  const scopedInclude = parseCsvGlobs(config.get<string>("scanIncludeGlobs", ""));
  const configuredExclude = config.get<string>(
    "excludeGlob",
    "**/node_modules/**,**/dist/**,**/build/**,**/.git/**,**/.next/**,**/vendor/**"
  );
  const hardExcludeGlob =
    "**/node_modules/**,**/docs/**,**/examples/**,**/dist/**,**/build/**,**/coverage/**,**/.git/**,**/.next/**,**/vendor/**,**/venv/**,**/.venv/**,**/__pycache__/**";
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
  return { file, line: match.line, method, url, library, frequency };
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
        const routeMatches = matchRouteDefinitionLine(line);
        for (const route of routeMatches) {
          if (!isHighConfidenceUrl(route.url)) continue;
          const key = `${relativePath}:${lineIndex + 1}:${route.method}:${route.url}:${route.library}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          uniqueEndpointKeys.add(`${route.method} ${route.url}`);
          allCalls.push({
            file: relativePath,
            line: lineIndex + 1,
            method: route.method,
            url: route.url,
            library: route.library,
            frequency: "daily",
          });
        }

        let matches = matchLine(line);
        if (matches.length === 0 && HTTP_CALL_HINT.test(line)) {
          const multiLine = lines.slice(lineIndex, Math.min(lines.length, lineIndex + 6)).join("\n");
          matches = matchLine(multiLine);
        }

        for (const match of matches) {
          if (!isHighConfidenceUrl(match.url)) continue;
          const key = `${relativePath}:${lineIndex + 1}:${match.method}:${match.url}:${match.library}`;
          if (dedupe.has(key)) continue;
          dedupe.add(key);
          uniqueEndpointKeys.add(`${match.method} ${match.url}`);
          const inLoop = isInsideLoop(lines, lineIndex);
          allCalls.push({
            file: relativePath,
            line: lineIndex + 1,
            method: match.method,
            url: match.url,
            library: match.library,
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
  const findings: LocalWasteFinding[] = [];

  for (const uri of uris) {
    try {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const text = await readUriText(uri);
      findings.push(...detectLocalWasteFindingsInText(relativePath, text));
    } catch {
      // Skip files that can't be read
    }
  }

  return findings;
}
