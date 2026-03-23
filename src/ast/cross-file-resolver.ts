/**
 * ast/cross-file-resolver.ts — Cross-file API call propagation (Phase 3.5).
 *
 * Takes per-file AST scan results and propagates API call metadata across file
 * boundaries so that waste detectors can see calls hidden behind:
 *
 *  1. Utility wrappers   — exported helper function wraps the SDK call
 *  2. Class services     — exported class method wraps the SDK call
 *  3. Middleware         — app.use(importedFn) → fn lives in another file
 *  4. Barrel re-exports  — import { fn } from '../utils' → utils/index.ts re-exports
 *  5. Callback refs      — items.map(importedFn) → fn lives in another file
 *
 * The main export is `runCrossFileResolution()`, which returns a map from
 * each file's relativePath to its augmented `AstCallMatch[]` (original matches
 * plus propagated matches from callees, with the caller's frequency context).
 */
import * as path from "path";
import type { AstCallMatch, AstScanResult } from "./ast-scanner";

// ── Public types ──────────────────────────────────────────────────────────────

export interface PerFileResult {
  /** Absolute path to the file. */
  filePath: string;
  /** Workspace-relative path (used as map key in output). */
  relativePath: string;
  /** Raw source text. */
  source: string;
  /** Output of scanFileWithAst() for this file. */
  result: AstScanResult;
}

// ── Internal types ────────────────────────────────────────────────────────────

/**
 * absoluteFilePath → exportedName → AstCallMatch[] inside that export.
 *
 * Built in the first pass over all PerFileResults.
 */
type ExportRegistry = Map<string, Map<string, AstCallMatch[]>>;

// ── Path utilities ─────────────────────────────────────────────────────────────

/** Normalize path separators to forward slashes for consistent matching. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Join a base directory with a relative specifier, handling both POSIX and
 * Windows absolute paths (mirrors import-resolver.ts joinPath logic).
 */
function joinPath(baseDir: string, relPath: string): string {
  if (baseDir.startsWith("/")) {
    return path.posix.resolve(baseDir, relPath);
  }
  return normalizePath(path.resolve(baseDir, relPath));
}

/**
 * Try several extensions/index variants and return the first that exists
 * in `knownFiles` (a Set of absolute paths we actually scanned).
 *
 * Tries: bare → .ts → .js → /index.ts → /index.js
 */
function resolveImportPath(
  fromFile: string,
  specifier: string,
  knownFiles: Set<string>
): string | null {
  // Only resolve relative imports — npm packages start without . or /
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;

  const dir = path.dirname(fromFile.startsWith("/") ? fromFile : fromFile.replace(/\\/g, "/"));
  const base = joinPath(dir, specifier);

  const candidates = [
    base,
    base + ".ts",
    base + ".tsx",
    base + ".js",
    base + ".jsx",
    joinPath(base, "index.ts"),
    joinPath(base, "index.tsx"),
    joinPath(base, "index.js"),
    joinPath(base, "index.jsx"),
  ];

  for (const c of candidates) {
    if (knownFiles.has(c)) return c;
  }
  return null;
}

// ── Export detection helpers ──────────────────────────────────────────────────

interface FunctionRange {
  name: string;
  startLine: number; // 1-based
  endLine: number;   // 1-based (inclusive), or Infinity if unknown
}

/**
 * Scan source text for exported function declarations and const arrow functions.
 * Returns name + approximate line range so we can assign matches to exports.
 *
 * Patterns handled:
 *   export function foo(
 *   export async function foo(
 *   export const foo = (
 *   export const foo = async (
 *   export const foo: T = (
 */
function findExportedFunctions(source: string): FunctionRange[] {
  const lines = source.split("\n");
  const ranges: FunctionRange[] = [];

  const EXPORT_FN = /^export\s+(async\s+)?function\s+(\w+)/;
  const EXPORT_CONST = /^export\s+const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*(async\s+)?\(/;

  // Track brace depth to approximate end of each function body.
  // Simple approach: find the opening { after the declaration, count braces.
  function findEndLine(startIdx: number): number {
    let depth = 0;
    let started = false;
    for (let i = startIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === "{") { depth++; started = true; }
        else if (ch === "}") { depth--; }
      }
      if (started && depth === 0) return i + 1; // 1-based
    }
    return lines.length;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fnMatch = EXPORT_FN.exec(line);
    if (fnMatch) {
      ranges.push({ name: fnMatch[2], startLine: i + 1, endLine: findEndLine(i) });
      continue;
    }
    const constMatch = EXPORT_CONST.exec(line);
    if (constMatch) {
      ranges.push({ name: constMatch[1], startLine: i + 1, endLine: findEndLine(i) });
    }
  }

  return ranges;
}

/**
 * Return the AstCallMatches whose lines fall within [start, end] (inclusive, 1-based).
 */
function matchesInRange(
  matches: AstCallMatch[],
  startLine: number,
  endLine: number
): AstCallMatch[] {
  return matches.filter((m) => m.line >= startLine && m.line <= endLine);
}

// ── Import extraction ─────────────────────────────────────────────────────────

interface ImportedName {
  localName: string;
  specifier: string; // import source string
}

/**
 * Extract relative imports from source text: both named and default imports.
 * Returns only entries whose specifier is a relative path (./ or ../).
 */
function extractRelativeImports(source: string): ImportedName[] {
  const results: ImportedName[] = [];
  // Match: import { A, B as C } from './path'   and  import D from './path'
  const IMPORT_RE = /^import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = IMPORT_RE.exec(source)) !== null) {
    const clause = m[1];
    const specifier = m[2];
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) continue;

    // Named imports: { A, B as C, ... }
    const namedMatch = /\{([^}]+)\}/.exec(clause);
    if (namedMatch) {
      for (const part of namedMatch[1].split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // "X as Y" → local name is Y
        const asMatch = /(\w+)\s+as\s+(\w+)/.exec(trimmed);
        if (asMatch) {
          results.push({ localName: asMatch[2], specifier });
        } else {
          const name = trimmed.match(/\w+/)?.[0];
          if (name) results.push({ localName: name, specifier });
        }
      }
    }

    // Default import: import Foo from './path' (clause has no braces)
    const defaultMatch = /^(\w+)$/.exec(clause.trim());
    if (defaultMatch) {
      results.push({ localName: defaultMatch[1], specifier });
    }
  }
  return results;
}

// ── Re-export detection ───────────────────────────────────────────────────────

interface ReExport {
  exportedName: string;
  specifier: string;
}

/**
 * Detect `export { foo } from './other'` and `export { foo as bar } from './other'` patterns.
 */
function extractReExports(source: string): ReExport[] {
  const results: ReExport[] = [];
  const RE_EXPORT = /^export\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/gm;
  let m: RegExpExecArray | null;
  while ((m = RE_EXPORT.exec(source)) !== null) {
    const clause = m[1];
    const specifier = m[2];
    if (!specifier.startsWith(".") && !specifier.startsWith("/")) continue;
    for (const part of clause.split(",")) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const asMatch = /(\w+)\s+as\s+(\w+)/.exec(trimmed);
      if (asMatch) {
        // export { foo as bar } from './other' → exported as "bar", original is "foo"
        results.push({ exportedName: asMatch[2], specifier });
      } else {
        const name = trimmed.match(/\w+/)?.[0];
        if (name) results.push({ exportedName: name, specifier });
      }
    }
  }
  return results;
}

// ── Export registry builder ───────────────────────────────────────────────────

/**
 * First pass: build ExportRegistry from all scanned files.
 *
 * For each file:
 *  - Find exported function line ranges, assign matches inside each range
 *  - For each class in classRegistry, expose ClassName.methodName → matches
 *  - Re-export stubs are NOT resolved here — they're followed lazily in the
 *    second pass (up to 2 hops).
 */
function buildExportRegistry(files: PerFileResult[]): ExportRegistry {
  const registry: ExportRegistry = new Map();

  for (const { filePath, source, result } of files) {
    const exports: Map<string, AstCallMatch[]> = new Map();

    // ── Direct exported functions ──────────────────────────────────────────
    const fnRanges = findExportedFunctions(source);
    for (const range of fnRanges) {
      const inside = matchesInRange(result.matches, range.startLine, range.endLine);
      if (inside.length > 0) {
        exports.set(range.name, inside);
      }
    }

    // ── Class methods ──────────────────────────────────────────────────────
    for (const [className, classInfo] of result.classRegistry) {
      for (const [methodName, methodMatches] of classInfo.methods) {
        if (methodMatches.length > 0) {
          exports.set(`${className}.${methodName}`, methodMatches);
          // Also expose under bare methodName for call-site matching
          const existing = exports.get(methodName) ?? [];
          exports.set(methodName, [...existing, ...methodMatches]);
        }
      }
    }

    registry.set(filePath, exports);
  }

  return registry;
}

// ── Clone with caller context ─────────────────────────────────────────────────

/**
 * Clone a callee AstCallMatch, overriding with the caller's execution context.
 * Preserves all provider/registry metadata from the callee.
 */
function cloneWithCallerContext(
  callee: AstCallMatch,
  callerLine: number,
  callerFrequency: AstCallMatch["frequency"],
  callerLoopContext: boolean,
  isMiddleware: boolean,
  calleeFilePath: string,
  callerFilePath: string
): AstCallMatch {
  return {
    ...callee,
    line: callerLine,
    frequency: isMiddleware ? "single" : callerFrequency,
    loopContext: isMiddleware ? false : callerLoopContext,
    isMiddleware: isMiddleware || callee.isMiddleware,
    crossFile: true,
    sourceFile: calleeFilePath,
  };
}

// ── Resolve re-export chain (up to 2 hops) ────────────────────────────────────

function resolveExportedMatches(
  name: string,
  fromFile: string,
  registry: ExportRegistry,
  sourceByFile: Map<string, string>,
  knownFiles: Set<string>,
  depth: number
): AstCallMatch[] | null {
  if (depth > 2) return null;

  const fileExports = registry.get(fromFile);
  if (fileExports) {
    const direct = fileExports.get(name);
    if (direct && direct.length > 0) return direct;
  }

  // Not found directly — check re-exports in that file
  const source = sourceByFile.get(fromFile);
  if (!source) return null;

  const reExports = extractReExports(source);
  for (const re of reExports) {
    if (re.exportedName !== name) continue;
    const resolved = resolveImportPath(fromFile, re.specifier, knownFiles);
    if (!resolved) continue;
    const found = resolveExportedMatches(name, resolved, registry, sourceByFile, knownFiles, depth + 1);
    if (found) return found;
  }

  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run cross-file resolution over all per-file scan results.
 *
 * @returns Map from relativePath → augmented AstCallMatch[] (original + propagated).
 *          Files with no propagated matches still appear in the map with their
 *          original matches.
 */
export function runCrossFileResolution(
  files: PerFileResult[]
): Map<string, AstCallMatch[]> {
  const normalizedKnown = new Set(files.map((f) => normalizePath(f.filePath)));
  const sourceByFile = new Map(files.map((f) => [normalizePath(f.filePath), f.source]));

  // Normalize registry keys
  const rawRegistry = buildExportRegistry(files);
  const registry: ExportRegistry = new Map();
  for (const [k, v] of rawRegistry) registry.set(normalizePath(k), v);

  const output = new Map<string, AstCallMatch[]>();

  // Start with original matches for every file
  for (const f of files) {
    output.set(f.relativePath, [...f.result.matches]);
  }

  for (const caller of files) {
    const callerPath = normalizePath(caller.filePath);
    const augmented = output.get(caller.relativePath)!;

    // ── Regular import propagation ─────────────────────────────────────────
    const imports = extractRelativeImports(caller.source);

    for (const { localName, specifier } of imports) {
      const resolvedFile = resolveImportPath(callerPath, specifier, normalizedKnown);
      if (!resolvedFile) continue;

      // Find all call sites in this file that reference the imported name
      const callSites = caller.result.matches.filter((m) => {
        const chain = m.methodChain.toLowerCase();
        const local = localName.toLowerCase();
        return (
          chain === local ||
          chain.startsWith(local + ".") ||
          chain.includes("." + local + ".") ||
          chain.endsWith("." + local)
        );
      });

      // If no explicit call site found in matches, look for the name in source
      // as a bare invocation (call site might not be in matches because it has
      // no known provider — but the callee does).
      const callSiteLines = extractCallSiteLines(caller.source, localName);

      const calleeMatches = resolveExportedMatches(
        localName,
        resolvedFile,
        registry,
        sourceByFile,
        normalizedKnown,
        0
      );
      if (!calleeMatches || calleeMatches.length === 0) continue;

      if (callSites.length > 0) {
        // Propagate using AST-detected call site context
        for (const site of callSites) {
          for (const callee of calleeMatches) {
            augmented.push(
              cloneWithCallerContext(
                callee,
                site.line,
                site.frequency,
                site.loopContext,
                false,
                resolvedFile,
                callerPath
              )
            );
          }
        }
      } else if (callSiteLines.length > 0) {
        // Fallback: propagate at each source-detected call site line with "single" frequency
        for (const lineNum of callSiteLines) {
          for (const callee of calleeMatches) {
            augmented.push(
              cloneWithCallerContext(callee, lineNum, "single", false, false, resolvedFile, callerPath)
            );
          }
        }
      }
    }

    // ── Middleware propagation ─────────────────────────────────────────────
    for (const mwName of caller.result.middlewareQueue) {
      // Find where this name was imported from
      const imports2 = extractRelativeImports(caller.source);
      const importEntry = imports2.find((i) => i.localName === mwName);
      if (!importEntry) continue;

      const resolvedFile = resolveImportPath(callerPath, importEntry.specifier, normalizedKnown);
      if (!resolvedFile) continue;

      const calleeMatches = resolveExportedMatches(
        mwName,
        resolvedFile,
        registry,
        sourceByFile,
        normalizedKnown,
        0
      );
      if (!calleeMatches || calleeMatches.length === 0) continue;

      // Find where app.use(mwName) appears in source
      const useLine = findMiddlewareUseLine(caller.source, mwName);

      for (const callee of calleeMatches) {
        augmented.push(
          cloneWithCallerContext(
            callee,
            useLine ?? callee.line,
            "single",
            false,
            true,
            resolvedFile,
            callerPath
          )
        );
      }
    }
  }

  return output;
}

// ── Source text helpers ───────────────────────────────────────────────────────

/** Find lines where `name(` or `name.` appears in source (1-based). */
function extractCallSiteLines(source: string, name: string): number[] {
  const lines = source.split("\n");
  const re = new RegExp(`\\b${escapeRegex(name)}\\s*[.(]`);
  const result: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) result.push(i + 1);
  }
  return result;
}

/** Find line where `app.use(name)` or `.use(name)` appears (1-based). */
function findMiddlewareUseLine(source: string, name: string): number | null {
  const lines = source.split("\n");
  const re = new RegExp(`\\.use\\s*\\([^)]*\\b${escapeRegex(name)}\\b`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
