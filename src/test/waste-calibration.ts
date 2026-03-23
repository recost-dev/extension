/**
 * Calibration runner for the AST-based waste detectors (Phase 3.4).
 *
 * Scans real files from the extension source, runs all three detectors,
 * and prints a structured calibration report for manual assessment.
 *
 * Usage:
 *   tsc -p tsconfig.scanner-tests.json && node dist-test/test/waste-calibration.js
 */
import * as fs from "fs";
import * as path from "path";
import { setWasmDir, getLanguageForExtension } from "../ast/parser-loader";
import { scanSourceWithAst } from "../ast/ast-scanner";
import { detectCacheWaste } from "../ast/waste/cache-detector";
import { detectBatchWaste } from "../ast/waste/batch-detector";
import { detectConcurrencyWaste } from "../ast/waste/concurrency-detector";
import type { AstCallMatch } from "../ast/ast-scanner";
import type { LocalWasteFinding } from "../scanner/local-waste-detector";

const ROOT = path.join(__dirname, "..", "..", "src");
const WASM_DIR = path.join(__dirname, "..", "..", "assets", "parsers");
setWasmDir(WASM_DIR);

// ── Files to scan ─────────────────────────────────────────────────────────────

const SCAN_FILES = [
  // Chat providers — single fetch() calls; should produce minimal waste findings
  "chat/providers/anthropic.ts",
  "chat/providers/openai.ts",
  "chat/providers/gemini.ts",
  "chat/providers/cohere.ts",
  "chat/providers/mistral.ts",
  // Chat dispatcher — streaming while-loop
  "chat/index.ts",
  // Remote API client — while(true) pagination loop calling apiFetch()
  "api-client.ts",
  // Synthetic calibration samples (appended below)
];

// ── Synthetic calibration samples ─────────────────────────────────────────────
// These represent archetypal real-world patterns for controlled calibration.

const SYNTHETIC_FILES: Array<{ name: string; content: string }> = [
  {
    name: "synthetic/true-positive-loop.ts",
    content: `
import OpenAI from "openai";
const client = new OpenAI();
// TRUE POSITIVE — embeddings.create is batchCapable, called in a loop
async function embedAll(texts: string[]) {
  const results = [];
  for (const text of texts) {
    results.push(await client.embeddings.create({ model: "text-embedding-3-small", input: text }));
  }
  return results;
}
`,
  },
  {
    name: "synthetic/true-positive-polling.ts",
    content: `
import OpenAI from "openai";
const client = new OpenAI();
// TRUE POSITIVE — API call inside setInterval, no backoff
setInterval(async () => {
  const result = await client.chat.completions.create({ model: "gpt-4o", messages: [] });
  console.log(result);
}, 5000);
`,
  },
  {
    name: "synthetic/true-positive-parallel.ts",
    content: `
import OpenAI from "openai";
const client = new OpenAI();
// TRUE POSITIVE — Promise.all fan-out, no p-limit
async function processAll(prompts: string[]) {
  return Promise.all(
    prompts.map((p) => client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: p }] }))
  );
}
`,
  },
  {
    name: "synthetic/true-negative-guarded.ts",
    content: `
import OpenAI from "openai";
import pLimit from "p-limit";
const client = new OpenAI();
const limit = pLimit(5);
// TRUE NEGATIVE — guarded by p-limit, should NOT produce concurrency finding
async function processAll(prompts: string[]) {
  return Promise.all(
    prompts.map((p) => limit(() => client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: p }] })))
  );
}
`,
  },
  {
    name: "synthetic/true-negative-cache-guard.ts",
    content: `
import OpenAI from "openai";
const client = new OpenAI();
const cache = new Map<string, unknown>();
// TRUE NEGATIVE — cache guard present, should NOT produce cache finding
async function getEmbedding(text: string) {
  if (cache.has(text)) return cache.get(text);
  const result = await client.embeddings.create({ model: "text-embedding-3-small", input: text });
  cache.set(text, result);
  return result;
}
`,
  },
  {
    name: "synthetic/true-positive-sequential.ts",
    content: `
import OpenAI from "openai";
const client = new OpenAI();
// TRUE POSITIVE — two independent awaits that could be Promise.all'd
async function handle() {
  const summary = await client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "summarize" }] });
  const tags = await client.chat.completions.create({ model: "gpt-4o", messages: [{ role: "user", content: "tag" }] });
  return { summary, tags };
}
`,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

interface CalibrationResult {
  file: string;
  astMatches: AstCallMatch[];
  findings: LocalWasteFinding[];
}

async function scanFile(filePath: string, source: string): Promise<AstCallMatch[]> {
  const ext = path.extname(filePath);
  const lang = getLanguageForExtension(ext);
  if (!lang) return [];
  try {
    const result = await scanSourceWithAst(source, lang, filePath);
    return result.matches;
  } catch {
    return [];
  }
}

function runDetectors(
  matches: AstCallMatch[],
  source: string,
  filePath: string
): LocalWasteFinding[] {
  return [
    ...detectCacheWaste(matches, source, filePath),
    ...detectBatchWaste(matches, source, filePath),
    ...detectConcurrencyWaste(matches, source, filePath),
  ];
}

function printSeparator(char = "─", width = 80): void {
  console.log(char.repeat(width));
}

function printFinding(f: LocalWasteFinding, index: number): void {
  console.log(`  [${index + 1}] type=${f.type} severity=${f.severity} confidence=${f.confidence.toFixed(2)} line=${f.line ?? "?"}`);
  console.log(`      ${f.description}`);
  for (const e of f.evidence) {
    console.log(`      · ${e}`);
  }
}

async function main(): Promise<void> {
  const results: CalibrationResult[] = [];

  // Scan real source files
  for (const rel of SCAN_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.log(`[SKIP] ${rel} — file not found`);
      continue;
    }
    const source = fs.readFileSync(abs, "utf8");
    const matches = await scanFile(abs, source);
    const findings = runDetectors(matches, source, rel);
    results.push({ file: rel, astMatches: matches, findings });
  }

  // Scan synthetic files
  for (const { name, content } of SYNTHETIC_FILES) {
    const source = content.trim();
    const matches = await scanFile(name, source);
    const findings = runDetectors(matches, source, name);
    results.push({ file: name, astMatches: matches, findings });
  }

  // ── Report ──────────────────────────────────────────────────────────────────

  printSeparator("═");
  console.log("WASTE DETECTOR CALIBRATION REPORT");
  printSeparator("═");

  const totals = { cache: 0, batch: 0, n_plus_one: 0, rate_limit: 0, concurrency_control: 0, redundancy: 0 };
  const byConfidence: number[] = [];

  for (const { file, astMatches, findings } of results) {
    printSeparator();
    console.log(`FILE: ${file}`);
    console.log(`  AST matches detected: ${astMatches.length}`);
    if (astMatches.length > 0) {
      const providerCounts = new Map<string, number>();
      for (const m of astMatches) {
        const p = m.provider ?? m.kind;
        providerCounts.set(p, (providerCounts.get(p) ?? 0) + 1);
      }
      for (const [p, c] of providerCounts) {
        console.log(`    · ${p}: ${c} match(es)`);
      }
      const freqCounts = new Map<string, number>();
      for (const m of astMatches) {
        freqCounts.set(m.frequency, (freqCounts.get(m.frequency) ?? 0) + 1);
      }
      console.log(`  Frequency breakdown: ${[...freqCounts.entries()].map(([f, c]) => `${f}:${c}`).join(", ")}`);
    }
    console.log(`  Waste findings: ${findings.length}`);
    for (let i = 0; i < findings.length; i++) {
      printFinding(findings[i], i);
      totals[findings[i].type as keyof typeof totals] = (totals[findings[i].type as keyof typeof totals] ?? 0) + 1;
      byConfidence.push(findings[i].confidence);
    }
    if (findings.length === 0) {
      console.log("  (no findings)");
    }
  }

  printSeparator("═");
  console.log("SUMMARY");
  printSeparator("═");
  console.log("Findings by type:");
  for (const [type, count] of Object.entries(totals)) {
    if (count > 0) console.log(`  ${type}: ${count}`);
  }
  const total = byConfidence.length;
  if (total > 0) {
    const avg = byConfidence.reduce((a, b) => a + b, 0) / total;
    const above70 = byConfidence.filter((c) => c >= 0.7).length;
    const below50 = byConfidence.filter((c) => c < 0.5).length;
    console.log(`\nConfidence distribution (${total} findings):`);
    console.log(`  Mean: ${avg.toFixed(2)}`);
    console.log(`  ≥0.70 (high confidence): ${above70} (${Math.round(above70 / total * 100)}%)`);
    console.log(`  <0.50 (low confidence):  ${below50} (${Math.round(below50 / total * 100)}%)`);
  }
  printSeparator("═");
}

main().catch(console.error);
