import * as vscode from "vscode";
import type { ApiCallInput } from "../analysis/types";
import type { LocalWasteFinding } from "./local-waste-detector";
import {
  scanFiles,
  detectLocalWastePatternsInFiles,
  type ScanFileAccess,
  type ScanProgress,
} from "./core-scanner";

const MAX_FILES = 5000;
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

async function readUriText(uri: vscode.Uri): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (openDoc) {
    return openDoc.getText();
  }

  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString("utf-8");
}

async function createWorkspaceScanAccess(): Promise<ScanFileAccess> {
  const config = vscode.workspace.getConfiguration("recost");
  const uris = await findScopedUris(config);
  return {
    files: uris.map((uri) => ({
      absolutePath: uri.fsPath,
      relativePath: vscode.workspace.asRelativePath(uri, false),
    })),
    readFile: async (absolutePath: string) => readUriText(vscode.Uri.file(absolutePath)),
  };
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

  return Array.from(uriByPath.values()).sort((a, b) => {
    const left = vscode.workspace.asRelativePath(a, false).replace(/\\/g, "/");
    const right = vscode.workspace.asRelativePath(b, false).replace(/\\/g, "/");
    return left.localeCompare(right);
  });
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

export async function scanWorkspace(
  onProgress?: (progress: ScanProgress) => void
): Promise<ApiCallInput[]> {
  const access = await createWorkspaceScanAccess();
  return scanFiles(access, onProgress);
}

export async function detectLocalWastePatterns(): Promise<LocalWasteFinding[]> {
  const access = await createWorkspaceScanAccess();
  return detectLocalWastePatternsInFiles(access);
}
