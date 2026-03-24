/**
 * AST parser loader using web-tree-sitter.
 *
 * Handles WASM initialization and language loading with caching so each
 * grammar is only loaded once per process.  Call setWasmDir() before any
 * parse if you need to override the default asset path (e.g. in tests).
 */
import * as path from "path";
import * as fs from "fs";

export type { Tree, Node as SyntaxNode } from "web-tree-sitter";

// Loaded at module init so the module doesn't crash when web-tree-sitter isn't
// installed (e.g. a VSIX with no node_modules). AST scanning degrades gracefully
// to regex scanning when these are null.
// eslint-disable-next-line @typescript-eslint/no-require-imports
let _Parser: (typeof import("web-tree-sitter"))["Parser"] | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
let _Language: (typeof import("web-tree-sitter"))["Language"] | null = null;
try {
  const mod = require("web-tree-sitter") as typeof import("web-tree-sitter");
  _Parser = mod.Parser;
  _Language = mod.Language;
  console.log("[BUNDLE] web-tree-sitter loaded OK. Parser:", typeof _Parser, "Language:", typeof _Language);
} catch (err) {
  console.error("[BUNDLE] web-tree-sitter NOT available — AST scanning disabled:", err);
}

// ── WASM asset directory ──────────────────────────────────────────────────────

// Compiled output lives in dist/extension.js — one level below the project root,
// so '../assets/parsers' resolves correctly.
let wasmDir = path.join(__dirname, "..", "assets", "parsers");
console.log("[BUNDLE] wasmDir:", wasmDir, "| exists:", fs.existsSync(wasmDir));

/** Override the directory containing the grammar WASM files.  Used in tests. */
export function setWasmDir(dir: string): void {
  wasmDir = dir;
  // Changing the WASM dir invalidates any cached state
  _initialized = false;
  _initPromise = null;
  _languageCache.clear();
}

// ── Init state ────────────────────────────────────────────────────────────────

let _initialized = false;
let _initPromise: Promise<void> | null = null;
const _languageCache = new Map<string, import("web-tree-sitter").Language>();

async function ensureInitialized(): Promise<void> {
  if (!_Parser || !_Language) throw new Error("web-tree-sitter not available");
  if (_initialized) return;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const runtimeWasm = path.join(wasmDir, "web-tree-sitter.wasm");
    console.log("[BUNDLE] Parser.init() — runtime WASM:", runtimeWasm, "| exists:", fs.existsSync(runtimeWasm));
    await _Parser!.init({
      // web-tree-sitter 0.26.x uses 'web-tree-sitter.wasm' as the runtime.
      // Older builds emit 'tree-sitter.wasm', so we handle both names.
      locateFile: (name: string) => {
        if (name === "tree-sitter.wasm" || name === "web-tree-sitter.wasm") {
          return path.join(wasmDir, "web-tree-sitter.wasm");
        }
        return path.join(wasmDir, name);
      },
    });
    _initialized = true;
    console.log("[BUNDLE] Parser.init() — success");
  })();

  return _initPromise;
}

// ── Language mapping ──────────────────────────────────────────────────────────

const EXT_TO_GRAMMAR: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
};

/**
 * Return the grammar name for a file extension, or `null` for unsupported types.
 *
 * @example
 * getLanguageForExtension(".ts")   // → "typescript"
 * getLanguageForExtension(".py")   // → null
 */
export function getLanguageForExtension(ext: string): string | null {
  return EXT_TO_GRAMMAR[ext.toLowerCase()] ?? null;
}

async function loadGrammar(langName: string): Promise<import("web-tree-sitter").Language> {
  const cached = _languageCache.get(langName);
  if (cached) return cached;

  const wasmPath = path.join(wasmDir, `tree-sitter-${langName}.wasm`);
  console.log("[BUNDLE] loadGrammar:", langName, "—", wasmPath, "| exists:", fs.existsSync(wasmPath));

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`Grammar file not found: ${wasmPath}`);
  }

  const lang = await _Language!.load(wasmPath);
  _languageCache.set(langName, lang);
  return lang;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a source string into a Tree-sitter syntax tree.
 *
 * @param source   Source code text.
 * @param language Grammar name, e.g. `"javascript"` or `"typescript"`.
 *                 Use {@link getLanguageForExtension} to derive from file ext.
 * @returns        The parsed Tree, or `null` on any error (initialization
 *                 failure, unsupported language, grammar file missing).
 *
 * Tree-sitter is error-tolerant: invalid syntax produces a tree with
 * error nodes rather than throwing.
 */
export async function parseFile(source: string, language: string): Promise<import("web-tree-sitter").Tree | null> {
  try {
    await ensureInitialized();
    const lang = await loadGrammar(language);
    const parser = new _Parser!();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    return tree;
  } catch (err) {
    console.error(`ReCost AST: failed to parse (${language}):`, err);
    return null;
  }
}
