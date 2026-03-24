import * as fs from "fs/promises";
import * as path from "path";
import type { ScanFileAccess, ScanInputFile } from "../scanner/core-scanner";

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rb"]);
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

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isHardExcludedPath(relativePath: string): boolean {
  return normalizePath(relativePath)
    .split("/")
    .some((segment) => HARD_EXCLUDED_SEGMENTS.has(segment));
}

async function collectFiles(rootDir: string, currentDir: string, results: ScanInputFile[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    if (isHardExcludedPath(relativePath)) continue;

    if (entry.isDirectory()) {
      await collectFiles(rootDir, absolutePath, results);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    results.push({ absolutePath, relativePath });
  }
}

export async function createFilesystemScanAccess(targetPath: string): Promise<ScanFileAccess> {
  const resolved = path.resolve(targetPath);
  const stat = await fs.stat(resolved);
  const files: ScanInputFile[] = [];

  if (stat.isFile()) {
    files.push({
      absolutePath: resolved,
      relativePath: path.basename(resolved),
    });
  } else if (stat.isDirectory()) {
    await collectFiles(resolved, resolved, files);
  } else {
    throw new Error(`Unsupported scan target: ${targetPath}`);
  }

  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    files,
    readFile: async (absolutePath: string) => fs.readFile(absolutePath, "utf-8"),
  };
}
