import * as vscode from "vscode";
import * as path from "path";
import type { ApiCallInput } from "../analysis/types";
import type { LocalWasteFinding } from "./local-waste-detector";
import {
  scanFiles,
  detectLocalWastePatternsInFiles,
  type ScanFileAccess,
  type ScanInputFile,
  type ScanProgress,
} from "./core-scanner";
import { discoverFilesInDirectory, parseCsvGlobs } from "./file-discovery";
import { getOutputChannel } from "../output";

export type { ScanProgress };

async function readUriText(uri: vscode.Uri): Promise<string> {
  const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
  if (openDoc) {
    return openDoc.getText();
  }

  const content = await vscode.workspace.fs.readFile(uri);
  return Buffer.from(content).toString("utf-8");
}

async function createWorkspaceScanAccess(): Promise<ScanFileAccess> {
  const files = await getWorkspaceScanFiles();
  return {
    files,
    readFile: async (absolutePath: string) => readUriText(vscode.Uri.file(absolutePath)),
  };
}

export async function getWorkspaceScanFiles(): Promise<ScanInputFile[]> {
  const config = vscode.workspace.getConfiguration("recost");
  const { files, excludedCount } = await findScopedFiles(config);
  if (excludedCount > 0) {
    getOutputChannel().appendLine(`Files excluded by .recostignore: ${excludedCount}`);
  }
  return files;
}

async function findScopedFiles(
  config: vscode.WorkspaceConfiguration
): Promise<{ files: ScanInputFile[]; excludedCount: number }> {
  const includeGlob = config.get<string>("scanGlob", "**/*.{ts,tsx,js,jsx,py,go,java,rb}");
  const scopedInclude = parseCsvGlobs(config.get<string>("scanIncludeGlobs", ""));
  const configuredExclude = config.get<string>(
    "excludeGlob",
    "**/node_modules/**,**/dist/**,**/dist-test/**,**/build/**,**/.git/**,**/.next/**,**/vendor/**"
  );
  const hardExcludeGlob =
    "**/node_modules/**,**/docs/**,**/examples/**,**/dist/**,**/dist-test/**,**/build/**,**/coverage/**,**/.git/**,**/.next/**,**/vendor/**,**/venv/**,**/.venv/**,**/__pycache__/**";
  const includePatterns = scopedInclude.length > 0 ? scopedInclude : [includeGlob];
  const excludePatterns = parseCsvGlobs(configuredExclude ? `${configuredExclude},${hardExcludeGlob}` : hardExcludeGlob);
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const fileByPath = new Map<string, ScanInputFile>();
  let totalExcluded = 0;

  for (const folder of workspaceFolders) {
    const { files: discovered, excludedCount } = await discoverFilesInDirectory(folder.uri.fsPath, {
      includeGlobs: includePatterns,
      excludeGlobs: excludePatterns,
    });
    totalExcluded += excludedCount;

    for (const file of discovered) {
      const relativeToWorkspace = path.posix.join(folder.name, file.relativePath);
      fileByPath.set(file.absolutePath, {
        absolutePath: file.absolutePath,
        relativePath: workspaceFolders.length > 1 ? relativeToWorkspace : file.relativePath,
      });
    }
  }

  return {
    files: Array.from(fileByPath.values()).sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    excludedCount: totalExcluded,
  };
}

export async function countScopedWorkspaceFiles(): Promise<number> {
  return (await getWorkspaceScanFiles()).length;
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
