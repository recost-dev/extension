# C1 PR-2 — Tighten the `cache` waste detector

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan. PR-2 of issue #83. Builds on PR-1 (#106) which installed the per-detector measurement infrastructure.

**Goal:** Drop the `cache` detector's false-positive rate from 100% (7 FP / 0 TP on corpus v1) to 0%, without losing recall on real cache-miss patterns. The per-type benchmark gate (shipped in #106) measures this directly.

**Why this detector first:** `cache` has 0 false negatives on the corpus (recall is undefined-but-treated-as-100%). All 7 emissions are wrong. That means we can tighten aggressively — the corpus has no positive case to break. We're removing noise, not changing detector intent.

---

## Investigation (already done)

Ran the live scanner against all 7 corpus fixtures and captured every `cache` finding. The 7 FPs live in two distinct code paths:

### Mode 1 — Python detector flags chat-completion calls as "read-like" (6 FPs)

**Affected fixtures and lines:**

| Fixture | File | Line | Method chain | Note |
|---|---|---|---|---|
| flask-mixed-providers | `providers/anthropic_helper.py` | 11 | `_client.messages.create` | POST chat |
| flask-mixed-providers | `providers/cohere_helper.py`   | 30 | `requests.post`          | POST chat |
| flask-mixed-providers | `providers/openai_helper.py`   | 12 | `_client.chat.completions.create` | POST chat |
| openai-cookbook | `chat_completions_basic.py`         | 19 | `client.chat.completions.create` | POST chat |
| openai-cookbook | `chat_completions_function_calling.py` | 19 | `client.chat.completions.create` | POST chat |
| openai-cookbook | `streaming.py`                      | 17 | `client.chat.completions.create` | POST stream |

All emit at confidence 0.66, severity medium, with the same evidence string:
> `Read-like provider call appears without a nearby Python cache or memoization guard.`

**Root cause** — `src/scanner/python-waste-detector.ts` line 125–132:

```ts
function isReadLikeCall(match: AstCallMatch): boolean {
  if (match.cacheCapable) return true;                          // (bug: early return)
  const method = (match.method ?? "").toUpperCase();
  if (method === "GET") return true;
  const signature = [match.methodChain, match.endpoint].filter(Boolean).join(" ");
  if (PYTHON_WRITE_CALL.test(signature)) return false;           // would have caught "create"
  return PYTHON_READ_CALL.test(signature);
}
```

The AST scanner marks chat-completion endpoints as `cacheCapable: true` somewhere upstream (likely via the fingerprint registry's `costModel: "per_token"` defaulting cacheCapable). The early-return shortcuts the `PYTHON_WRITE_CALL` check on line 130, so the write verb "create" never gets a chance to disqualify the call.

**Conceptual issue beyond the ordering bug:** even when a method IS HTTP-cacheable in some technical sense, generative endpoints (chat completion, message generation, image generation, TTS, STT) produce non-deterministic output keyed by user input — caching them is almost always wrong. The fix should both (a) reorder the checks so WRITE verbs win, and (b) introduce an explicit generative-method denylist that overrides `cacheCapable`.

### Mode 2 — AST cache detector treats different `fetch()` URLs as "redundant" (1 FP)

**Affected fixture:** raw-fetch-elevenlabs, `src/tts-service.ts` line 30 (the `listVoices` GET call). The file contains three `fetch()` calls to three different URLs (`/v1/text-to-speech/...`, `/v1/speech-to-text`, `/v1/voices`).

Evidence text:
> `Same method chain (fetch) occurs 2× in this file without visible dedup.`

**Root cause** — `src/ast/waste/cache-detector.ts` line 150:

```ts
const occurrences = chainCount.get(match.methodChain) ?? 1;
const redundant = occurrences >= 2;
```

`chainCount` keys by `methodChain` only — for `fetch`, that's a single bucket across every URL in the file. Three different elevenlabs endpoints all collapse to the same chain `"fetch"` and trip `redundant`. The fix is to key the count by something more specific: `methodChain + endpoint/url`, or skip the redundancy heuristic entirely for universal HTTP method names (`fetch`, `axios`, `axios.get`, `axios.post`, etc.) where the chain carries no resource identity.

---

## Files relevant

- `src/scanner/python-waste-detector.ts` — `isReadLikeCall()` (line 125), `detectMissingCache()` (line 267)
- `src/ast/waste/cache-detector.ts` — `chainCount` build (search for the `for` loop populating it) and the `occurrences` lookup (line 150)
- `src/test/ast-cache-detector.test.ts` — existing AST cache-detector tests; verify no regressions
- `src/test/local-waste-detector.test.ts` — existing local detector tests; verify no regressions
- `src/test/fixtures/c1-pr2/` — new fixture directory (create)
- `src/test/c1-pr2-cache-tightening.test.ts` — new test file (create)
- `benchmark/baseline.json` — bump after measurement; the `cache` entry should collapse to TP=0/FP=0/FN=0 (or disappear entirely; either is acceptable per the runner's missing-type tolerance)

---

## Acceptance criteria for PR-2

- [ ] Python cache detector emits ZERO findings on the 6 listed FP call sites.
- [ ] AST cache detector emits ZERO findings on `raw-fetch-elevenlabs/src/tts-service.ts:30`.
- [ ] Synthetic positive-test fixtures still produce cache findings (the detector isn't broken outright):
  - Python: a `.list()` or `.retrieve()` call without a cache guard → finding emitted.
  - TS: two identical `fetch("/api/products/123")` calls in the same file → redundancy finding emitted.
- [ ] `npm test` passes 344/344 (or higher with new test cases).
- [ ] `npm run benchmark` exits 0; the per-type gate does NOT fail on `cache`. Global `findingPrecision` rises from 6.25% to ≥ 11% (1/9 instead of 1/16).
- [ ] `benchmark/baseline.json` updated with the new per-type entry (or `cache` removed when no longer emitted).

---

## Tasks

### Task C1-PR2.1 — Fix Python cache detector (TDD)

**Files:**
- Modify: `src/scanner/python-waste-detector.ts`
- Create: `src/test/fixtures/c1-pr2/python_chat_completion.py`
- Create: `src/test/fixtures/c1-pr2/python_real_read.py`
- Create: `src/test/c1-pr2-cache-tightening.test.ts` (start here; extended in Task C1-PR2.2)
- Modify: `package.json` `test:scanner` script

- [ ] **Step 1: Create the two Python fixtures**

`src/test/fixtures/c1-pr2/python_chat_completion.py`:

```python
"""Negative case: chat-completion calls must NOT trigger the cache detector."""
from openai import OpenAI

client = OpenAI()

def ask(prompt: str) -> str:
    r = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
    )
    return r.choices[0].message.content or ""
```

`src/test/fixtures/c1-pr2/python_real_read.py`:

```python
"""Positive case: a non-generative GET-shaped read SHOULD still trigger the cache detector."""
import stripe

def get_customer(customer_id: str):
    return stripe.Customer.retrieve(customer_id)
```

(`stripe.Customer.retrieve` is in `RAW_SDK_PROVIDERS` and matches `PYTHON_READ_CALL` for "retrieve". This call has no nearby cache guard, so the detector should fire on it — which is exactly the recall we want to preserve.)

- [ ] **Step 2: Write failing tests**

Create `src/test/c1-pr2-cache-tightening.test.ts`:

```ts
import assert from "node:assert/strict";
import * as path from "node:path";
import { scanWorkspace } from "../scanner/workspace-scanner";
import { realFilesystemAdapter } from "../cli/filesystem-adapter";

async function run(name: string, fn: () => void | Promise<void>): Promise<void> {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}`); throw err; }
}

(async () => {
  const fixtureDir = path.resolve(__dirname, "fixtures", "c1-pr2");

  await run("Python chat.completions.create does NOT trigger cache finding", async () => {
    const result = await scanWorkspace(realFilesystemAdapter(fixtureDir), {
      includeGlobs: ["python_chat_completion.py"],
      excludeGlobs: [],
    });
    const cacheFindings = result.suggestions.filter(s => s.type === "cache");
    assert.equal(
      cacheFindings.length, 0,
      `expected 0 cache findings on chat completion, got ${cacheFindings.length}: ${JSON.stringify(cacheFindings.map(f => ({ file: f.affectedFiles[0], line: f.targetLine })))}`
    );
  });

  await run("Python real GET-shaped read (stripe.Customer.retrieve) STILL triggers cache finding", async () => {
    const result = await scanWorkspace(realFilesystemAdapter(fixtureDir), {
      includeGlobs: ["python_real_read.py"],
      excludeGlobs: [],
    });
    const cacheFindings = result.suggestions.filter(s => s.type === "cache");
    assert.ok(
      cacheFindings.length >= 1,
      `expected at least 1 cache finding on stripe.Customer.retrieve, got ${cacheFindings.length}`
    );
  });
})().catch((err) => { console.error(err); process.exit(1); });
```

Verify the `scanWorkspace` / `realFilesystemAdapter` API by reading their current source (precedent in `src/test/a6-object-literal-fps.test.ts`). Adjust import paths if needed but keep the assertions intact.

- [ ] **Step 3: Wire test into `package.json`**

Append to `test:scanner`:

```
 && node dist-test/test/c1-pr2-cache-tightening.test.js
```

Compile (`npm test`) and confirm: test 1 FAILS (chat completion produces a cache finding today) — that's the bug we're fixing. Test 2 should PASS today (already produces a finding) — that's the recall we're preserving.

- [ ] **Step 4: Apply the fix**

Edit `src/scanner/python-waste-detector.ts`. Two changes in `isReadLikeCall()`:

1. **Move the write-call check before the `cacheCapable` shortcut.** This ensures explicit write verbs (`create`, `update`, `delete`, etc.) always win even when the fingerprint defaults the call to cacheCapable.

2. **Add a generative-method denylist** for endpoints whose response is non-deterministic and therefore not meaningfully cacheable. A small constant suffices:

```ts
const PYTHON_GENERATIVE_METHOD = /\b(chat\.completions|messages|responses|generate|generate_content|invoke|run|stream|images?\.generate|audio\.(speech|transcriptions)|tts|stt)\b/i;
```

Then:

```ts
function isReadLikeCall(match: AstCallMatch): boolean {
  const method = (match.method ?? "").toUpperCase();
  const signature = [match.methodChain, match.endpoint].filter(Boolean).join(" ");

  // Generative endpoints are conceptually non-cacheable even when the registry
  // marks them cacheCapable. Suppress before any other "read-like" inference.
  if (PYTHON_GENERATIVE_METHOD.test(signature)) return false;

  // Explicit write verbs always win — even over fingerprint cacheCapable.
  if (PYTHON_WRITE_CALL.test(signature)) return false;

  if (match.cacheCapable) return true;
  if (method === "GET") return true;
  return PYTHON_READ_CALL.test(signature);
}
```

- [ ] **Step 5: Verify**

```bash
cd /home/andresl/Projects/recost/extension-c1-pr2
npm test 2>&1 | grep -E "(PASS|FAIL).*(c1-pr2|cache)" | tail -10
```

Both new tests PASS. The existing `local-waste-detector.test.ts` / `ast-cache-detector.test.ts` suites still PASS.

---

### Task C1-PR2.2 — Fix AST cache detector's redundancy signal (TDD)

**Files:**
- Modify: `src/ast/waste/cache-detector.ts`
- Modify: `src/test/c1-pr2-cache-tightening.test.ts` (append cases)
- Create: `src/test/fixtures/c1-pr2/ts_diff_fetch_urls.ts`
- Create: `src/test/fixtures/c1-pr2/ts_same_fetch_url.ts`

- [ ] **Step 1: Create the two TS fixtures**

`src/test/fixtures/c1-pr2/ts_diff_fetch_urls.ts` — three fetches to three different paths, should NOT fire (mirrors elevenlabs):

```ts
export async function listProducts() {
  const r = await fetch("https://api.example.com/v1/products");
  return r.json();
}

export async function listCustomers() {
  const r = await fetch("https://api.example.com/v1/customers");
  return r.json();
}

export async function listOrders() {
  const r = await fetch("https://api.example.com/v1/orders");
  return r.json();
}
```

`src/test/fixtures/c1-pr2/ts_same_fetch_url.ts` — two fetches to the same URL with no dedup, SHOULD still fire (positive case):

```ts
export async function loadOnce() {
  const r = await fetch("https://api.example.com/v1/products/123");
  return r.json();
}

export async function loadAgain() {
  const r = await fetch("https://api.example.com/v1/products/123");
  return r.json();
}
```

- [ ] **Step 2: Append failing tests**

Add to `src/test/c1-pr2-cache-tightening.test.ts`:

```ts
await run("TS three different fetch URLs do NOT trigger cache redundancy", async () => {
  const result = await scanWorkspace(realFilesystemAdapter(fixtureDir), {
    includeGlobs: ["ts_diff_fetch_urls.ts"],
    excludeGlobs: [],
  });
  const cacheFindings = result.suggestions.filter(s => s.type === "cache");
  assert.equal(
    cacheFindings.length, 0,
    `expected 0 cache findings on three different fetch URLs, got ${cacheFindings.length}: ${JSON.stringify(cacheFindings.map(f => ({ line: f.targetLine, ev: f.evidence ?? [] })))}`
  );
});

await run("TS two fetches to the same URL STILL trigger cache redundancy", async () => {
  const result = await scanWorkspace(realFilesystemAdapter(fixtureDir), {
    includeGlobs: ["ts_same_fetch_url.ts"],
    excludeGlobs: [],
  });
  const cacheFindings = result.suggestions.filter(s => s.type === "cache");
  assert.ok(
    cacheFindings.length >= 1,
    `expected at least 1 cache finding on duplicate fetch URLs, got ${cacheFindings.length}`
  );
});
```

Run them — case 3 fails today (the elevenlabs FP shape), case 4 should pass.

- [ ] **Step 3: Apply the fix**

In `src/ast/waste/cache-detector.ts`, locate the `chainCount` build (a `for` loop populating a `Map<string, number>` keyed by `match.methodChain`). The fix: include the request endpoint/url in the key for universal HTTP method names.

Define a helper:

```ts
const UNIVERSAL_HTTP_CHAIN = /^(?:fetch|axios(?:\.[a-z]+)?|got|ky|superagent(?:\.[a-z]+)?|requests(?:\.[a-z]+)?)$/i;

function chainKey(match: AstCallMatch): string {
  if (UNIVERSAL_HTTP_CHAIN.test(match.methodChain)) {
    // For raw HTTP methods, the chain alone carries no resource identity.
    // Key by chain + endpoint so two different URLs don't collapse into one bucket.
    return `${match.methodChain}::${match.endpoint ?? match.url ?? ""}`;
  }
  return match.methodChain;
}
```

Replace `match.methodChain` with `chainKey(match)` in both the `chainCount` build (the place that populates the Map) AND the lookup `chainCount.get(...)` near line 150. The evidence string at line 184 should keep showing `match.methodChain` (humans don't want to read the bucketing key); change only the bucketing logic, not the rendered text.

If `match.endpoint`/`match.url` is undefined for a given fetch (e.g. dynamic URL not yet resolved by A2's constant-folding), the key collapses back to the chain name. That's an acceptable failure mode — A2 already folds same-file consts, so most realistic cases will have a resolved endpoint.

- [ ] **Step 4: Verify**

```bash
npm test 2>&1 | grep -E "(PASS|FAIL).*c1-pr2" | tail -10
```

All 4 PASS. Existing `ast-cache-detector.test.ts` still PASSES.

---

### Task C1-PR2.3 — Measure on the corpus + update baseline

- [ ] **Step 1: Full benchmark run**

```bash
cd /home/andresl/Projects/recost/extension-c1-pr2
npm run benchmark 2>&1 | tee /tmp/c1-pr2-before-update.log
```

Expected: `cache` row now shows TP=0 / FP=0 (or disappears entirely). Global `findingPrecision` rises from 6.25% to ~11% (1/9). No metrics drop > 1pp.

If `cache` STILL emits non-zero FPs, the fix is incomplete — go back to Task C1-PR2.1 or C1-PR2.2 and check the actual call site that escaped. Confirm by spot-running the CLI directly against the fixture:

```bash
node dist/cli/scan.js ../extension-benchmark/flask-mixed-providers/src --format json | python3 -c 'import json,sys;d=json.load(sys.stdin);print([s for s in d["suggestions"] if s["type"]=="cache"])'
```

- [ ] **Step 2: Update baseline**

```bash
npm run benchmark -- --update-baseline 2>&1 | tail -30
git diff benchmark/baseline.json
```

The diff should show:
- `findingPrecision` rises (~6% → ~11%)
- `findingMetricsByType.cache` either removed (no emissions, no expected) or zeroed out
- Other metrics unchanged

- [ ] **Step 3: Self-test the gate**

Hand-edit `benchmark/baseline.json` to artificially set `cache` to TP=5/FP=0/precision=1.0, save, re-run `npm run benchmark` (no `--update-baseline`). Confirm it fails with a per-type drop message if the current run is below that. Restore.

This step verifies that future regressions are caught.

---

### Task C1-PR2.4 — Commit, push, open PR

- [ ] Run full `npm test` (344+ PASS) and `npm run benchmark` (exit 0) one final time.
- [ ] Stage:
  - `src/scanner/python-waste-detector.ts`
  - `src/ast/waste/cache-detector.ts`
  - `src/test/c1-pr2-cache-tightening.test.ts`
  - `src/test/fixtures/c1-pr2/*` (4 files)
  - `package.json` (test script extension)
  - `benchmark/baseline.json`
  - `docs/superpowers/plans/2026-05-13-c1-pr2-cache-detector-tightening.md`
- [ ] Commit message: `fix(detection): C1 PR-2 — tighten cache detector (closes part 2 of #83)`. Mention both Python (write-verb ordering + generative denylist) and AST (URL-aware redundancy key) in the body. Include the D1 measurement table.
- [ ] Push `claude/c1-pr2-cache-detector` and open PR. Body should include:
  - Two FP modes captured (Python chat-completion / TS raw fetch).
  - Before/after measurement table (global finding precision: 6.25% → ~11%).
  - Per-detector table showing `cache` collapsing from 7 FPs to 0.
  - Acceptance-criteria checklist mapping to issue #83.

---

## Self-review (controller)

**Spec coverage (issue #83 part 2):**

| Acceptance criterion | Covered by | Status |
|---|---|---|
| No detector with FPR > 30% | This PR drops `cache` from 100% to 0% | Partial — `batch`, `rate_limit` remain |
| Each detector has FPR documented | Already done in PR-1 (`docs/accuracy/findings.md`); baseline numbers refresh here | ✓ |
| Per-detector regressions fail the build | Per-type gate live since PR-1 | ✓ |
| Documented exceptions for by-design conservative detectors | N/A — the `cache` detector wasn't conservative, it was wrong. No exception needed. | ✓ |

**Two distinct code paths to fix** — the plan explicitly addresses both because the prior session's per-detector data confirmed they're independent emitters. Implementer should not assume one file fix is enough.

**Recall preservation** — both task families include a positive test (real `*.retrieve()` for Python, same-URL `fetch()` twice for TS). If the implementer's fix breaks these, the detector is over-tightened.

**Out of scope (PR-3+ in C1):**
- `batch` detector (same shape: 7 FPs / 0 TPs / 1 FN). Different ownership in code, similar conceptual fixes. Separate PR.
- `rate_limit` detector (1 FP, 0 TPs). Tiny sample — defer until corpus has rate-limit positive cases.
- `unbatched_parallel` ↔ `concurrency_control` corpus terminology mismatch. Corpus follow-up.

**Risks:**

1. The Python `PYTHON_GENERATIVE_METHOD` regex must be precise — too broad and we suppress legitimate retrieves, too narrow and chat completions still leak through. The fixture set includes both sides (chat completion suppressed, `stripe.Customer.retrieve` still triggers) to keep the implementer honest.

2. The AST `chainKey` change must not break the existing `ast-cache-detector.test.ts` cases (which exercise SDK chains like `openai.embeddings.create`, never `fetch`). The `UNIVERSAL_HTTP_CHAIN` regex must match only the raw HTTP method names.

3. Baseline diff: if `cache` disappears entirely from `findingMetricsByType` after the fix, the runner reader has been verified (in PR-1) to default missing types to `{}` — backwards compatible.

**Sequencing within PR:** Task C1-PR2.1 and C1-PR2.2 can be done in either order; both fix one mode each. Doing 2.1 first matches the higher impact (6/7 FPs) and lets the implementer ship a partial fix if the AST work runs into trouble. The plan keeps them as separate tasks so the implementer can stop after either if needed.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-05-13-c1-pr2-cache-detector-tightening.md`. Worktree: `/home/andresl/Projects/recost/extension-c1-pr2` on branch `claude/c1-pr2-cache-detector` (branched from `origin/main` post-#106 and #107). `npm ci` complete; `npm run build:ext` clean.

Subagent-driven execution: one implementer dispatch per task (4 dispatches total, or 2 combined if the AST and Python fixes feel small enough). Spec-compliance + code-quality reviewers between each. Controller commits + opens the PR at the end.
