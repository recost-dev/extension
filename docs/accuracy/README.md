# Parser Accuracy Roadmap

This directory tracks the work to make the ReCost scanner correct, traceable, and trustworthy. Frequency / call-rate estimation is intentionally *not* covered here — runtime middleware handles that downstream. Static analysis exists to **find every call site, attribute it correctly, point users back to it, and produce defensible findings**.

## Framework

The work breaks into four layers. Each layer has one or more tracked issues backed by a design note in this directory.

| Layer | Goal | Issues | Doc |
|---|---|---|---|
| **A. Detection completeness** | Every real call site is detected. No silent misses. No false positives. | [#73](https://github.com/recost-dev/extension/issues/73) [#74](https://github.com/recost-dev/extension/issues/74) [#75](https://github.com/recost-dev/extension/issues/75) [#76](https://github.com/recost-dev/extension/issues/76) [#77](https://github.com/recost-dev/extension/issues/77) [#78](https://github.com/recost-dev/extension/issues/78) [#79](https://github.com/recost-dev/extension/issues/79) | [detection.md](detection.md) |
| **B. Traceability** | Every detection has a stable, precise, clickable source location. | [#80](https://github.com/recost-dev/extension/issues/80) [#81](https://github.com/recost-dev/extension/issues/81) [#82](https://github.com/recost-dev/extension/issues/82) | [traceability.md](traceability.md) |
| **C. Finding accuracy** | Issues surfaced to users are calibrated, deduped, and carry confidence. | [#83](https://github.com/recost-dev/extension/issues/83) [#84](https://github.com/recost-dev/extension/issues/84) [#85](https://github.com/recost-dev/extension/issues/85) | [findings.md](findings.md) |
| **D. Measurement** | Accuracy improvements are measured against ground truth, not vibes. | [#86](https://github.com/recost-dev/extension/issues/86) | [measurement.md](measurement.md) |

### Issue index

| ID | # | Title |
|---|---|---|
| A1 | [#73](https://github.com/recost-dev/extension/issues/73) | Multi-hop wrapper-function tracing |
| A2 | [#74](https://github.com/recost-dev/extension/issues/74) | Dynamic URL constant-folding for raw fetch/axios |
| A3 | [#75](https://github.com/recost-dev/extension/issues/75) | Audit barrel-file / re-export resolution |
| A4 | [#76](https://github.com/recost-dev/extension/issues/76) | AST ↔ regex parity audit and CI gate |
| A5 | [#77](https://github.com/recost-dev/extension/issues/77) | Aliased / DI / factory client tracking |
| A6 | [#78](https://github.com/recost-dev/extension/issues/78) | Filter object-literal false positives in AST scanner (replaces #66) |
| A7 | [#79](https://github.com/recost-dev/extension/issues/79) | URL-path → method fallback for raw fetch (replaces #72) |
| B1 | [#80](https://github.com/recost-dev/extension/issues/80) | Span-based source locations |
| B2 | [#81](https://github.com/recost-dev/extension/issues/81) | Dual locations for cross-file resolved calls |
| B3 | [#82](https://github.com/recost-dev/extension/issues/82) | Stable endpoint IDs across scans |
| C1 | [#83](https://github.com/recost-dev/extension/issues/83) | Calibrate the local waste detector |
| C2 | [#84](https://github.com/recost-dev/extension/issues/84) | Proper dedupe of AI + local-rule findings |
| C3 | [#85](https://github.com/recost-dev/extension/issues/85) | Confidence everywhere; severity derived from signals |
| D1 | [#86](https://github.com/recost-dev/extension/issues/86) | Labeled benchmark corpus + CI precision/recall gate |

## Sequencing

Items are not all equal priority. Suggested order:

1. **Foundation** — B1 (spans), B3 (stable IDs), A4 (parity audit), D1 (benchmark). Everything else is easier to verify once these land.
2. **Detection gaps** — A1 (wrapper depth), A2 (dynamic URL folding), A3 (barrel re-exports), A5 (aliased clients), A6 (object literal filter), A7 (URL-path fallback).
3. **Finding quality** — C1 (waste calibration), C2 (dedupe), C3 (signals refactor).
4. **Polish** — B2 (dual locations).

The benchmark in D1 is the *measurement device* for all of A and C. Without it, every other PR is a feel-good change.

## How to use these docs

- **Building an issue?** Each doc has anchor-linked sections per issue. The GitHub issue body summarizes; the doc has the longer context.
- **Adding a new accuracy concern?** Append a new section to the relevant doc, file an issue that links back to it, and add a row to the table above.
- **Closing an issue?** Update the doc to mark the item shipped (strike-through or "✅ landed in #PR").

## Out of scope here

- Frequency / call-rate prediction (handled by runtime middleware).
- Cost-model pricing accuracy (separate work — see `src/scanner/fingerprints/` and the pricing-sync backend).
- Cross-language SDK expansion (Go/Java/Ruby/Rust) — deferred until JS/TS/Python detection is fully benchmarked.
