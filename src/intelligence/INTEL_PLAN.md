# Intelligence Layer — Remaining Work

Sibling to `INTEL_CONTEXT.md`. Covers the four unimplemented spec items and the ecoapi → recost rename.

---

## What's Left

| Task | File(s) | Status |
|---|---|---|
| 1. Wire up cost estimation | `compression.ts`, `cost-utils.ts` | TODO |
| 2. Add `costLeaks` + `providerSummary` to export | `types.ts`, `export.ts` | TODO |
| 3. Token budget enforcement | `compression.ts` | TODO |
| 4. `recost pack` CLI subcommand | `src/cli/scan.ts` | TODO |
| 5. Docs rename (ecoapi → recost) | `CLAUDE.md`, `INTEL_CONTEXT.md` | TODO |

---

## Task 1 — Wire Up Cost Estimation

**Files:** `compression.ts`, `cost-utils.ts`

`estimateLocalMonthlyCost(provider, callsPerDay, methodSignature?)` exists in `cost-utils.ts` but is never called. `estimatedMonthlyCost` is hardcoded `null` throughout the pipeline.

### 1.1 — Add `estimateCallsPerDay()` helper in `compression.ts`

Convert `frequencyClass` to a daily call estimate using simulator-consistent multipliers:

| frequencyClass | Multiplier |
|---|---|
| `unbounded-loop` | ×10 |
| `polling` | ×8 |
| `parallel` | ×3 |
| `bounded-loop` | ×3 |
| `conditional` | ×0.5 |
| `cache-guarded` | ×0.1 |
| `single` / null | ×1 |

Base rate: 100 calls/day. Sum across all `ApiCallNode[]` in the file.

```typescript
function estimateCallsPerDay(calls: ApiCallNode[]): number {
  const FREQUENCY_MULTIPLIER: Record<string, number> = {
    "unbounded-loop": 10, polling: 8, parallel: 3, "bounded-loop": 3,
    conditional: 0.5, "cache-guarded": 0.1, single: 1,
  };
  return calls.reduce((sum, call) => {
    const mult = (call.frequencyClass ? FREQUENCY_MULTIPLIER[call.frequencyClass] : null) ?? 1;
    return sum + 100 * mult;
  }, 0);
}
```

### 1.2 — Call it in `buildFileSummary()`

Replace the hardcoded `estimatedMonthlyCost: null` (currently ~line 343 of `compression.ts`) with:

```typescript
const provider = context.providers[0] ?? null;
const callsPerDay = estimateCallsPerDay(context.apiCalls);
const methodSig = context.apiCalls[0]?.method ?? undefined;
estimatedMonthlyCost: provider ? (estimateLocalMonthlyCost(provider, callsPerDay, methodSig) ?? null) : null,
```

Import `estimateLocalMonthlyCost` from `"./cost-utils"`.

### 1.3 — Aggregate cluster-level cost in `compressClusters()`

Replace the hardcoded `estimatedMonthlyCost: null` at the cluster level (currently ~line 561) with:

```typescript
function sumCosts(summaries: Array<{ estimatedMonthlyCost: number | null }>): number | null {
  const values = summaries.map((s) => s.estimatedMonthlyCost).filter((v): v is number => v !== null);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
}
// in compressClusters():
estimatedMonthlyCost: sumCosts([primarySummary, ...relatedSummaries]),
```

Individual finding `estimatedMonthlyCost` stays `null` — no finding-level formula is defined.

---

## Task 2 — Add `costLeaks` + `providerSummary` to Export

**Files:** `types.ts`, `export.ts`

### 2a — Extend `ExportedContext` in `types.ts`

```typescript
export interface ExportedContext {
  meta: { ... };                  // unchanged
  summary: {
    topFiles: Array<{ filePath: string; whyItMatters: string }>;
    keyRisks: string[];
    costLeaks: Array<{            // NEW
      filePath: string;
      costLeakScore: number;
      reasons: string[];
    }>;
  };
  providerSummary: Array<{        // NEW — top-level
    provider: string;
    fileCount: number;
    callCount: number;
    findingCount: number;
    estimatedMonthlyCost: number | null;
  }>;
  clusters: CompressedCluster[];
}
```

### 2b — Populate in `buildExportContext()` (export.ts ~line 253)

**`costLeaks`:** Filter `scored.scoredFiles` where `scores.costLeak > 3`, sort by `costLeak` descending, cap at 5:
```typescript
const costLeaks = scored.scoredFiles
  .filter((f) => f.scores.costLeak > 3)
  .sort((a, b) => b.scores.costLeak - a.scores.costLeak)
  .slice(0, 5)
  .map((f) => ({ filePath: f.filePath, costLeakScore: f.scores.costLeak, reasons: f.reasons }));
```

**`providerSummary`:** For each entry in `snapshot.providers`, aggregate:
```typescript
const providerSummary = Object.values(snapshot.providers)
  .map((p) => {
    const clusterCost = clusters
      .filter((c) => c.providers.includes(p.name))
      .map((c) => c.estimatedMonthlyCost)
      .filter((v): v is number => v !== null);
    return {
      provider: p.name,
      fileCount: p.fileIds.length,
      callCount: p.apiCallIds.length,
      findingCount: p.findingIds.length,
      estimatedMonthlyCost: clusterCost.length > 0 ? clusterCost.reduce((a, b) => a + b, 0) : null,
    };
  })
  .sort((a, b) => b.callCount - a.callCount);
```

### 2c — Render in `formatAsMarkdown()` (export.ts ~line 285)

After `## Key Risks`, add:
```markdown
## Cost Leak Suspects
| File | Score | Reasons |
|---|---|---|
| path/to/file.ts | 7.2 | Calls in loops, N+1 finding |
```
Omit section entirely if `costLeaks` is empty.

At the end, add:
```markdown
## Provider Summary
| Provider | Files | Calls | Findings | Est. Monthly Cost |
|---|---|---|---|---|
| openai | 3 | 8 | 4 | $12.40 |
```
Format cost as `$X.XX` or `—` if null.

---

## Task 3 — Token Budget Enforcement

**File:** `compression.ts`

Add at the top of the file:
```typescript
const MAX_EXPORT_TOKENS = 4000;
```

Add a trimming step at the end of `compressClusters()`:

```typescript
function estimateTokens(clusters: CompressedCluster[]): number {
  return Math.ceil(JSON.stringify(clusters).length / 4);
}

function trimToTokenBudget(clusters: CompressedCluster[]): CompressedCluster[] {
  if (estimateTokens(clusters) <= MAX_EXPORT_TOKENS) return clusters;

  // Pass 1: reduce snippets 5 → 3
  let trimmed = clusters.map((c) => ({ ...c, snippets: c.snippets.slice(0, 3) }));
  if (estimateTokens(trimmed) <= MAX_EXPORT_TOKENS) return trimmed;

  // Pass 2: reduce snippets 3 → 1
  trimmed = trimmed.map((c) => ({ ...c, snippets: c.snippets.slice(0, 1) }));
  if (estimateTokens(trimmed) <= MAX_EXPORT_TOKENS) return trimmed;

  // Pass 3: reduce findings 6 → 3
  trimmed = trimmed.map((c) => ({ ...c, findings: c.findings.slice(0, 3) }));
  if (estimateTokens(trimmed) <= MAX_EXPORT_TOKENS) return trimmed;

  // Pass 4: drop lowest-priority clusters (keep min 2)
  while (trimmed.length > 2 && estimateTokens(trimmed) > MAX_EXPORT_TOKENS) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}
```

Call `trimToTokenBudget(result)` before returning from `compressClusters()`.

---

## Task 4 — `recost pack` CLI Subcommand

**File:** `src/cli/scan.ts`

### 4.1 — Extend options parsing

Detect first positional arg `pack`:
```typescript
const subcommand = args[0] === "pack" ? "pack" : undefined;
const packFormat = getFlag(args, "--format") ?? "markdown";   // "markdown" | "json"
const outputPath = getFlag(args, "--output") ?? null;
const appendClaudeMd = args.includes("--append-claude-md");
```

### 4.2 — Add `runPackCommand()`

```typescript
async function runPackCommand(
  dir: string,
  format: "markdown" | "json",
  outputPath: string | null,
  appendClaudeMd: boolean,
  outputChannel: OutputChannel
): Promise<void> {
  // Existing full pipeline (already implemented in the context format handler)
  const { apiCalls, findings } = await scanFiles(dir, outputChannel);
  const snapshot = buildSnapshot({ apiCalls, findings, repoRoot: dir });
  const scored = scoreSnapshot(snapshot);
  const clusters = buildReviewClusters(scored);
  const compressed = compressClusters(clusters, snapshot);
  const context = buildExportContext(compressed, snapshot, scored);

  const content = format === "json" ? formatAsJSON(context) : formatAsMarkdown(context);

  if (outputPath) {
    fs.writeFileSync(path.resolve(dir, outputPath), content, "utf8");
  } else if (appendClaudeMd) {
    const claudeMdPath = path.resolve(dir, "CLAUDE.md");
    const block = `\n\n## ReCost Analysis\n\n${content}\n\n<!-- End ReCost Analysis -->`;
    fs.appendFileSync(claudeMdPath, block, "utf8");
  } else {
    process.stdout.write(content + "\n");
  }
}
```

### 4.3 — Wire into main dispatch

At the top of the main handler, before the existing format checks:
```typescript
if (subcommand === "pack") {
  await runPackCommand(dir, packFormat as "markdown" | "json", outputPath, appendClaudeMd, output);
  return;
}
```

---

## Task 5 — Docs Rename (ecoapi → recost)

**`CLAUDE.md` changes:**
- `eco-api-analyzer-*.vsix` → `recost-api-analyzer-*.vsix` (lines 124, 127)
- Update API key storage note: actual key is `recost.apiKey`, not `eco.ecoApiKey`
- `eco.changeApiKey` → `recost.openKeys`
- `serviceId === "ecoapi"` → `serviceId === "recost"`
- Update Known Gaps CLI note: `ecoapi` binary → `recost pack` subcommand (now implemented)

**`INTEL_CONTEXT.md` changes (Known gaps section):**
- Remove the "No `ecoapi` CLI wrapper" bullet — it's implemented after Task 4
- Update `estimatedMonthlyCost` bullet — no longer always null after Task 1
- Keep token budget bullet until Task 3 ships

**DO NOT change:**
- `eco.` prefixed VSCode setting keys — live stored keys needing migration outside this plan
- `package.json` GitHub org URL — separate concern
