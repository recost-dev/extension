/**
 * Import resolver for JavaScript and TypeScript source files.
 *
 * Walks a Tree-sitter AST and builds a map from variable names to npm package
 * names.  Handles ESM import, CommonJS require, constructor assignments, barrel
 * file re-exports (one level), and TypeScript typed function parameters.
 */
import * as path from "path";
import type { SyntaxNode, Tree } from "./parser-loader";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ResolvedImports {
  /**
   * Top-level variable (or imported name) → npm package (or resolved file path
   * for non-npm imports).
   *
   * @example
   * // import OpenAI from "openai"
   * // const client = new OpenAI()
   * importMap.get("OpenAI")  // → "openai"
   * importMap.get("client")  // → "openai"
   */
  importMap: Map<string, string>;

  /**
   * Function/method name → (parameter name → resolved package name).
   * Populated only for TypeScript files with type-annotated parameters whose
   * type name maps to a known provider client class.
   *
   * @example
   * // function helper(client: OpenAI) { ... }
   * parameterMaps.get("helper")?.get("client")  // → "openai"
   */
  parameterMaps: Map<string, Map<string, string>>;
}

/** Callback for reading file content during barrel-file resolution. */
export type FileReader = (absolutePath: string) => Promise<string | null>;

// ── Known client class names → package ───────────────────────────────────────

/**
 * Maps well-known SDK class/constructor names to their npm packages.
 * Derived from the fingerprint registry's supported providers.
 */
export const CLASS_TO_PACKAGE: Record<string, string> = {
  // OpenAI
  OpenAI: "openai",
  AzureOpenAI: "openai",
  // Anthropic
  Anthropic: "@anthropic-ai/sdk",
  AnthropicBedrock: "@anthropic-ai/sdk",
  AnthropicVertex: "@anthropic-ai/sdk",
  // Stripe
  Stripe: "stripe",
  // Supabase
  SupabaseClient: "@supabase/supabase-js",
  createClient: "@supabase/supabase-js", // factory function, not constructor
  // Firebase
  FirebaseApp: "firebase",
  // AWS Bedrock
  BedrockRuntimeClient: "@aws-sdk/client-bedrock-runtime",
  // Google Gemini / Vertex
  GoogleGenerativeAI: "@google/generative-ai",
  VertexAI: "@google-cloud/vertexai",
  // Cohere
  CohereClient: "cohere-ai",
  Cohere: "cohere-ai",
  // Mistral
  Mistral: "@mistralai/mistralai",
  MistralClient: "@mistralai/mistralai",
};

// ── Path utilities ────────────────────────────────────────────────────────────

/** Normalize a filesystem path to forward slashes (consistent on all platforms). */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

/**
 * Join a base directory with a relative path, preserving the original path
 * style (forward-slash paths on Unix/tests stay as forward-slash paths even
 * on Windows where `path.resolve` would add a drive letter).
 */
function joinPath(baseDir: string, relPath: string): string {
  // If baseDir is a POSIX-style absolute path (starts with /), use posix join.
  if (baseDir.startsWith("/")) {
    return path.posix.resolve(baseDir, relPath);
  }
  return normalizePath(path.resolve(baseDir, relPath));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the inner string value from a `string` AST node. */
function stringValue(node: SyntaxNode): string {
  // string node text includes quotes; strip them
  return node.text.replace(/^['"`]|['"`]$/g, "");
}

/** Find the first child of `node` with the given type. */
function childOfType(node: SyntaxNode, type: string): SyntaxNode | null {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.type === type) return c;
  }
  return null;
}

// ── ESM import handling ───────────────────────────────────────────────────────

function processImportStatement(node: SyntaxNode, importMap: Map<string, string>): void {
  // The `from "..."` string is the last string child
  const source = childOfType(node, "string");
  if (!source) return;
  const pkg = stringValue(source);

  const clause = childOfType(node, "import_clause");
  if (!clause) return;

  for (let i = 0; i < clause.childCount; i++) {
    const child = clause.child(i);
    if (!child) continue;

    switch (child.type) {
      case "identifier": {
        // import openai from "openai"  → default import, local name = child.text
        importMap.set(child.text, pkg);
        break;
      }
      case "named_imports": {
        // import { OpenAI }        from "openai"
        // import { OpenAI as AI } from "openai"
        for (let j = 0; j < child.childCount; j++) {
          const spec = child.child(j);
          if (!spec || spec.type !== "import_specifier") continue;

          const identifiers: string[] = [];
          for (let k = 0; k < spec.childCount; k++) {
            const s = spec.child(k);
            if (s && s.type === "identifier") identifiers.push(s.text);
          }
          // identifiers[0] is the original name; identifiers[1] is the alias (if any)
          const localName = identifiers[identifiers.length - 1];
          if (localName) importMap.set(localName, pkg);
        }
        break;
      }
      case "namespace_import": {
        // import * as stripe from "stripe"  → the identifier after 'as'
        const ident = childOfType(child, "identifier");
        if (ident) importMap.set(ident.text, pkg);
        break;
      }
    }
  }
}

// ── CJS require handling ──────────────────────────────────────────────────────

/** Return the string argument of a `require(...)` call, or null. */
function requireSource(callNode: SyntaxNode): string | null {
  if (callNode.type !== "call_expression") return null;
  const fn = callNode.child(0);
  if (!fn || fn.text !== "require") return null;
  const args = childOfType(callNode, "arguments");
  if (!args) return null;
  const strNode = childOfType(args, "string");
  return strNode ? stringValue(strNode) : null;
}

function processVariableDeclarator(node: SyntaxNode, importMap: Map<string, string>): void {
  // node is a `variable_declarator`
  if (node.childCount < 3) return;
  const lhs = node.child(0);
  const rhs = node.child(2); // skip `=` at index 1
  if (!lhs || !rhs) return;

  // ── const x = require("pkg") ─────────────────────────────────────────────
  if (rhs.type === "call_expression") {
    const pkg = requireSource(rhs);
    if (pkg !== null) {
      if (lhs.type === "identifier") {
        // const openai = require("openai")
        importMap.set(lhs.text, pkg);
      } else if (lhs.type === "object_pattern") {
        // const { OpenAI } = require("openai")
        // const { OpenAI: OpenAIAlias } = require("openai")
        for (let i = 0; i < lhs.childCount; i++) {
          const member = lhs.child(i);
          if (!member) continue;
          if (member.type === "shorthand_property_identifier_pattern" || member.type === "identifier") {
            importMap.set(member.text, pkg);
          } else if (member.type === "pair_pattern") {
            // { original: alias } — the alias is the local name
            const valueIdent = member.child(2); // skip ':' at index 1
            if (valueIdent && valueIdent.type === "identifier") {
              importMap.set(valueIdent.text, pkg);
            }
          }
        }
      }
      return;
    }

    // ── const client = new OpenAI() ────────────────────────────────────────
    // handled in processNewExpression; skip here
  }

  if (rhs.type === "new_expression") {
    processNewExpression(lhs, rhs, importMap);
  }
}

function processNewExpression(
  lhs: SyntaxNode,
  newExpr: SyntaxNode,
  importMap: Map<string, string>
): void {
  if (lhs.type !== "identifier") return;
  const constructor = newExpr.child(1); // 'new' at index 0, constructor at index 1
  if (!constructor) return;
  const ctorName = constructor.text;

  // Resolve via CLASS_TO_PACKAGE or via the import map (if class was imported)
  const pkg = CLASS_TO_PACKAGE[ctorName] ?? importMap.get(ctorName);
  if (pkg) {
    importMap.set(lhs.text, pkg);
  }
}

// ── TypeScript typed parameter handling ───────────────────────────────────────

function processFunctionParams(
  fnNode: SyntaxNode,
  importMap: Map<string, string>,
  parameterMaps: Map<string, Map<string, string>>
): void {
  // Works for function_declaration, method_definition, arrow_function, etc.
  const nameNode = childOfType(fnNode, "identifier");
  const fnName = nameNode?.text ?? "<anonymous>";

  const params = childOfType(fnNode, "formal_parameters");
  if (!params) return;

  const paramMap = new Map<string, string>();

  for (let i = 0; i < params.childCount; i++) {
    const param = params.child(i);
    if (!param) continue;
    if (param.type !== "required_parameter" && param.type !== "optional_parameter") continue;

    const nameNode = param.child(0);
    const typeAnnotation = childOfType(param, "type_annotation");
    if (!nameNode || !typeAnnotation) continue;

    // type_annotation is `: TypeName` — the type identifier is the second child
    // (index 0 = ':')
    const typeIdent = typeAnnotation.child(1);
    if (!typeIdent) continue;

    const typeName = typeIdent.text;
    const pkg = CLASS_TO_PACKAGE[typeName] ?? importMap.get(typeName);
    if (pkg) {
      paramMap.set(nameNode.text, pkg);
    }
  }

  if (paramMap.size > 0) {
    parameterMaps.set(fnName, paramMap);
  }
}

// ── Barrel file / re-export handling ─────────────────────────────────────────

interface ExportEntry {
  /** Exported name (or null for `export *`) */
  exportedName: string | null;
  /** Relative source path (the `from "..."` string) */
  sourcePath: string;
}

function collectExports(tree: Tree): ExportEntry[] {
  const entries: ExportEntry[] = [];
  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const stmt = tree.rootNode.child(i);
    if (!stmt || stmt.type !== "export_statement") continue;

    const source = childOfType(stmt, "string");
    if (!source) continue; // export without `from` — not a re-export
    const sourcePath = stringValue(source);
    if (!sourcePath.startsWith(".")) continue; // skip non-relative (npm re-exports)

    const exportClause = childOfType(stmt, "export_clause");
    if (exportClause) {
      // export { foo, bar as baz } from "./lib"
      for (let j = 0; j < exportClause.childCount; j++) {
        const spec = exportClause.child(j);
        if (!spec || spec.type !== "export_specifier") continue;
        const ident = spec.child(0); // original name
        if (ident) entries.push({ exportedName: ident.text, sourcePath });
      }
    } else {
      // export * from "./providers"
      entries.push({ exportedName: null, sourcePath });
    }
  }
  return entries;
}

/**
 * Try to resolve a relative import `from "./barrel"` to an actual package name
 * by reading the barrel file and inspecting what it re-exports.
 *
 * Only follows ONE level of re-exports (A → B → stop).
 */
async function resolveBarrelImport(
  importedNames: string[],
  sourceRelPath: string,
  currentFilePath: string,
  readFile: FileReader,
  parseTreeFn: (src: string) => Promise<Tree | null>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const dir = path.posix.dirname(normalizePath(currentFilePath));
  const barrelPath = joinPath(dir, sourceRelPath);

  // Try common extensions if no extension provided
  const candidates = barrelPath.endsWith(".ts") || barrelPath.endsWith(".js")
    ? [barrelPath]
    : [barrelPath + ".ts", barrelPath + ".js", barrelPath + "/index.ts", barrelPath + "/index.js"];

  let barrelContent: string | null = null;
  let resolvedBarrelPath = barrelPath;
  for (const candidate of candidates) {
    barrelContent = await readFile(candidate);
    if (barrelContent !== null) {
      resolvedBarrelPath = candidate;
      break;
    }
  }
  if (barrelContent === null) return result;

  const barrelTree = await parseTreeFn(barrelContent);
  if (!barrelTree) return result;

  const barrelExports = collectExports(barrelTree);

  for (const name of importedNames) {
    // Find a matching export in the barrel
    for (const entry of barrelExports) {
      if (entry.exportedName === name || entry.exportedName === null) {
        // This barrel re-exports `name` from `entry.sourcePath` — resolve it
        if (!entry.sourcePath.startsWith(".")) {
          // Re-exported from an npm package — this IS the package
          result.set(name, entry.sourcePath);
        } else {
          // One more level: read the source file and look for the actual export
          const srcDir = path.posix.dirname(resolvedBarrelPath);
          const srcPath = joinPath(srcDir, entry.sourcePath);
          const srcCandidates = srcPath.endsWith(".ts") || srcPath.endsWith(".js")
            ? [srcPath]
            : [srcPath + ".ts", srcPath + ".js"];

          for (const candidate of srcCandidates) {
            const content = await readFile(candidate);
            if (content === null) continue;
            const tree = await parseTreeFn(content);
            if (!tree) continue;

            // Look for the npm package this file imports `name` from
            const { importMap: fileImports } = await resolveImportsCore(tree, candidate, undefined, parseTreeFn);
            const pkg = fileImports.get(name);
            if (pkg) {
              result.set(name, pkg);
              break;
            }
          }
        }
        break; // found export entry for this name
      }
    }
  }

  return result;
}

// ── Core resolution logic ─────────────────────────────────────────────────────

async function resolveImportsCore(
  tree: Tree,
  filePath: string,
  readFile: FileReader | undefined,
  parseTreeFn: (src: string) => Promise<Tree | null>
): Promise<ResolvedImports> {
  const importMap = new Map<string, string>();
  const parameterMaps = new Map<string, Map<string, string>>();

  // Collect relative imports to potentially resolve via barrel files
  const relativeImports = new Map<string, string[]>(); // relative path → local names

  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const stmt = tree.rootNode.child(i);
    if (!stmt) continue;

    switch (stmt.type) {
      case "import_statement": {
        const source = childOfType(stmt, "string");
        if (!source) break;
        const pkg = stringValue(source);

        if (!pkg.startsWith(".")) {
          // npm import — resolve directly
          processImportStatement(stmt, importMap);
        } else {
          // Relative import — always record the imported names in importMap (with
          // the relative path as the value) so callers can test `importMap.has(name)`.
          // If readFile is provided, also attempt barrel-file package resolution.
          const clause = childOfType(stmt, "import_clause");
          if (!clause) break;
          const names: string[] = [];
          for (let j = 0; j < clause.childCount; j++) {
            const child = clause.child(j);
            if (!child) continue;
            if (child.type === "identifier") {
              names.push(child.text);
              importMap.set(child.text, pkg);
            } else if (child.type === "named_imports") {
              for (let k = 0; k < child.childCount; k++) {
                const spec = child.child(k);
                if (!spec || spec.type !== "import_specifier") continue;
                const idents: string[] = [];
                for (let m = 0; m < spec.childCount; m++) {
                  const s = spec.child(m);
                  if (s && s.type === "identifier") idents.push(s.text);
                }
                const local = idents[idents.length - 1];
                if (local) {
                  names.push(local);
                  importMap.set(local, pkg);
                }
              }
            }
          }
          if (readFile && names.length > 0) {
            const existing = relativeImports.get(pkg) ?? [];
            relativeImports.set(pkg, [...existing, ...names]);
          }
        }
        break;
      }

      case "lexical_declaration":
      case "variable_declaration": {
        // Walk all variable_declarator children
        for (let j = 0; j < stmt.childCount; j++) {
          const child = stmt.child(j);
          if (child && child.type === "variable_declarator") {
            processVariableDeclarator(child, importMap);
          }
        }
        break;
      }

      case "function_declaration": {
        processFunctionParams(stmt, importMap, parameterMaps);
        break;
      }
    }
  }

  // Also do a second pass for new_expression assignments that appear after the
  // class was imported (so importMap is populated by the time we resolve them).
  // The first pass already handles new_expression, but only for items seen in
  // order. Re-run to catch cases where the constructor name is resolved via
  // CLASS_TO_PACKAGE (which doesn't need prior import state).

  // Resolve barrel file imports
  if (readFile && relativeImports.size > 0) {
    for (const [relPath, names] of relativeImports) {
      const resolved = await resolveBarrelImport(names, relPath, filePath, readFile, parseTreeFn);
      for (const [name, pkg] of resolved) {
        importMap.set(name, pkg);
      }
    }
  }

  return { importMap, parameterMaps };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve all variable-to-package mappings in a parsed TypeScript/JavaScript
 * file.
 *
 * @param tree      Parsed Tree-sitter tree for the file.
 * @param filePath  Absolute path to the file (used for barrel resolution).
 * @param readFile  Optional async file reader.  When omitted, barrel file
 *                  resolution is skipped.
 *
 * @returns `importMap` (variable → package) and `parameterMaps`
 *          (function → param → package for TS typed parameters).
 */
export async function resolveImports(
  tree: Tree,
  filePath: string,
  readFile?: FileReader
): Promise<ResolvedImports> {
  // We need a parse function for barrel file resolution.
  // Lazy-load the parser to avoid a circular dependency at module load time.
  const parseTreeFn = async (src: string): Promise<Tree | null> => {
    const ext = path.extname(filePath);
    const { parseFile, getLanguageForExtension } = await import("./parser-loader");
    const lang = getLanguageForExtension(ext) ?? "javascript";
    return parseFile(src, lang);
  };

  return resolveImportsCore(tree, filePath, readFile, parseTreeFn);
}
