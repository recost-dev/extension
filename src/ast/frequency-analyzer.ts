/**
 * ast/frequency-analyzer.ts — Structural frequency classification for AST call nodes.
 *
 * Walks the ancestor chain of a call expression node and classifies the call
 * frequency by the innermost structural context, using a priority ordering:
 *
 *   polling > parallel > unbounded-loop > bounded-loop
 *     > cache-guarded > conditional > single
 */
import type { SyntaxNode } from "./parser-loader";

// ── Public type ───────────────────────────────────────────────────────────────

export type FrequencyClass =
  | "single"
  | "bounded-loop"
  | "unbounded-loop"
  | "parallel"
  | "polling"
  | "conditional"
  | "cache-guarded";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Cache-related words that imply a guard condition, not a raw repeat. */
const CACHE_WORDS = /\b(cache|cached|memo|memoize|ttl|stale|etag|swr|queryClient|lru|memoized)\b/i;

/** Function names whose callbacks run on a recurring timer. */
const POLLING_CALLS = new Set(["setInterval", "setImmediate"]);

/** Method chains whose callbacks run in parallel (fan-out). */
const PARALLEL_CHAINS = new Set([
  "Promise.all",
  "Promise.allSettled",
  "Promise.race",
  "Promise.any",
]);

/** Array iteration methods that produce a bounded loop context. */
const ITERATION_METHODS = new Set([
  "forEach",
  "map",
  "flatMap",
  "filter",
  "reduce",
  "reduceRight",
  "find",
  "findIndex",
  "some",
  "every",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Flatten a `member_expression` (JS/TS) or `attribute` (Python) node into a
 * dot-separated chain string, e.g. `Promise.all` or `arr.map`.
 */
function getCallChain(fn: SyntaxNode): string {
  if (fn.type === "identifier") return fn.text;
  if (fn.type === "member_expression" || fn.type === "attribute") {
    const obj = fn.child(0);
    const prop = fn.child(fn.childCount - 1);
    if (obj && prop) return `${getCallChain(obj)}.${prop.text}`;
  }
  return fn.text;
}

/**
 * Distinguish Python `for x in y:` (bounded) from JS C-style `for(;;)` (unbounded).
 *
 * Both use node type `for_statement`. Python's variant has no semicolon children;
 * JS's always has two `;` children separating init / condition / update.
 */
function isPythonBoundedFor(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const c = node.child(i);
    if (c && c.type === ";") return false; // JS C-style
  }
  return true; // Python-style for…in (bounded)
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Walk all AST ancestors of `node` and return the highest-priority
 * `FrequencyClass` found.
 *
 * Priority (highest first):
 *   polling → parallel → unbounded-loop → bounded-loop
 *   → cache-guarded → conditional → single
 */
export function analyzeFrequency(node: SyntaxNode): FrequencyClass {
  let hasPolling = false;
  let hasParallel = false;
  let hasUnboundedLoop = false;
  let hasBoundedLoop = false;
  let hasCacheGuard = false;
  let hasConditional = false;

  let current: SyntaxNode | null = node.parent;
  while (current) {
    const t = current.type;

    // ── Call expressions: polling / parallel / iteration ─────────────────────
    if (t === "call_expression" || t === "call") {
      const fn = current.child(0);
      if (fn) {
        const chain = getCallChain(fn);
        if (POLLING_CALLS.has(chain)) hasPolling = true;
        if (PARALLEL_CHAINS.has(chain)) hasParallel = true;
        const parts = chain.split(".");
        const last = parts[parts.length - 1];
        if (ITERATION_METHODS.has(last) && parts.length >= 2) hasBoundedLoop = true;
      }
    }

    // ── Loop nodes ────────────────────────────────────────────────────────────
    if (t === "while_statement" || t === "do_statement") {
      hasUnboundedLoop = true;
    }
    if (t === "for_in_statement" || t === "for_of_statement") {
      hasBoundedLoop = true;
    }
    if (t === "for_statement") {
      if (isPythonBoundedFor(current)) hasBoundedLoop = true;
      else hasUnboundedLoop = true; // JS C-style for (may be unbounded)
    }

    // ── Conditional nodes ─────────────────────────────────────────────────────
    if (
      t === "if_statement" ||
      t === "else_clause" ||
      t === "ternary_expression" ||
      t === "conditional_expression"
    ) {
      // Use only the condition sub-node (child 1) to avoid reading the whole
      // statement body — which may be large.
      const condNode = current.child(1);
      const condText = condNode ? condNode.text : current.text.slice(0, 150);
      if (CACHE_WORDS.test(condText)) hasCacheGuard = true;
      else hasConditional = true;
    }

    current = current.parent;
  }

  // Priority resolution — highest wins
  if (hasPolling) return "polling";
  if (hasParallel) return "parallel";
  if (hasUnboundedLoop) return "unbounded-loop";
  if (hasBoundedLoop) return "bounded-loop";
  if (hasCacheGuard) return "cache-guarded";
  if (hasConditional) return "conditional";
  return "single";
}

/** Convenience: derive the legacy `loopContext` boolean from a FrequencyClass. */
export function frequencyToLoopContext(fc: FrequencyClass): boolean {
  return (
    fc === "bounded-loop" ||
    fc === "unbounded-loop" ||
    fc === "parallel" ||
    fc === "polling"
  );
}
