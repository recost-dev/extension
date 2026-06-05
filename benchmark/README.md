# Benchmark

Hand-labeled accuracy gate for the scanner. Fails CI when an aggregate precision/recall metric — or a per-finding-type precision — drops > 1pp. Per-type precision drops only gate when both baseline and current emitted ≥ 3 findings of that type (small samples are too noisy to gate on).

## Quick start

```bash
# Smoke (no clone, fast):
npm run benchmark:smoke

# Full (requires extension-benchmark cloned as sibling dir):
git clone https://github.com/recost-dev/extension-benchmark.git ../extension-benchmark
npm run benchmark
```

## Layout

- `runner.ts` — orchestrates per-fixture scan + metric computation. Reads `--fixtures <dir>` (default `../extension-benchmark`).
- `metrics.ts` — pure precision/recall math, including per-finding-type TP/FP/FN counts (`findingMetricsByType`, e.g. `batch`, `n_plus_one`, `unbatched_parallel`).
- `schema.ts` — `expected.json` types + validator.
- `report.ts` — console + markdown report formatting.
- `baseline.json` — committed metric baseline (aggregate metrics + `findingMetricsByType`, keys sorted by name for stable diffs). Gate compares current run vs this.
- `_smoke/` — tiny in-repo fixture for runner development.

## CI

`.github/workflows/benchmark.yml` runs on every PR. It reads `.benchmark-fixtures-sha` (repo root), clones `extension-benchmark` at that SHA, then runs `npm run benchmark`.

## Adding a fixture

Fixtures live in `extension-benchmark`, not here. To add one:

1. Open a PR in `recost-dev/extension-benchmark` with a new `<slug>/src/...`, `<slug>/expected.json`, `<slug>/FIXTURE.md`.
2. Once merged, bump `.benchmark-fixtures-sha` in `extension`.
3. Run `npm run benchmark -- --update-baseline` locally and commit `baseline.json` if the new fixture changed it.

## Updating the baseline

When a PR legitimately improves accuracy:

```bash
npm run benchmark -- --update-baseline
git add benchmark/baseline.json
```

Commit the new baseline in the same PR as the code change. Explain why in the PR description.
