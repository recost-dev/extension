import * as fs from "fs/promises";
import * as path from "path";
import type { ScanInputFile } from "./core-scanner";

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".java", ".rb"]);

export const HARD_EXCLUDED_SEGMENTS = new Set([
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

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function parseCsvGlobs(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function isHardExcludedPath(relativePath: string): boolean {
  return normalizePath(relativePath)
    .split("/")
    .some((segment) => HARD_EXCLUDED_SEGMENTS.has(segment));
}

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match) return [pattern];
  const [token, body] = match;
  return body.split(",").flatMap((part) => expandBraces(pattern.replace(token, part)));
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*") {
      if (next === "*") {
        source += ".*";
        index++;
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      source += ".";
      continue;
    }

    source += escapeRegex(char);
  }

  source += "$";
  return new RegExp(source);
}

function buildGlobMatchers(patterns: string[]): RegExp[] {
  return patterns.flatMap((pattern) => expandBraces(normalizePath(pattern)).map(globToRegExp));
}

function matchesAny(relativePath: string, matchers: RegExp[]): boolean {
  if (matchers.length === 0) return false;
  return matchers.some((matcher) => matcher.test(relativePath));
}

async function collectFiles(
  rootDir: string,
  currentDir: string,
  includeMatchers: RegExp[],
  excludeMatchers: RegExp[],
  results: ScanInputFile[]
): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = normalizePath(path.relative(rootDir, absolutePath));
    if (isHardExcludedPath(relativePath) || matchesAny(relativePath, excludeMatchers)) continue;

    if (entry.isDirectory()) {
      await collectFiles(rootDir, absolutePath, includeMatchers, excludeMatchers, results);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!ALLOWED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    if (includeMatchers.length > 0 && !matchesAny(relativePath, includeMatchers)) continue;
    results.push({ absolutePath, relativePath });
  }
}

export async function discoverFilesInDirectory(
  rootDir: string,
  options?: {
    includeGlobs?: string[];
    excludeGlobs?: string[];
  }
): Promise<ScanInputFile[]> {
  const includeMatchers = buildGlobMatchers(options?.includeGlobs ?? []);
  const excludeMatchers = buildGlobMatchers(options?.excludeGlobs ?? []);
  const results: ScanInputFile[] = [];

  await collectFiles(path.resolve(rootDir), path.resolve(rootDir), includeMatchers, excludeMatchers, results);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}
