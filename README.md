# ReCost - API Usage Analyzer

VSCode extension that scans your workspace for API call patterns using an AST-powered parsing engine, estimates costs, and generates optimization suggestions — all locally, no remote server required.

## Why This Exists

Developers often ship API-heavy features without visibility into:
- Monthly API spend risk
- Redundant or cacheable request patterns
- Rate-limit and N+1 hotspots

ReCost turns parsed API call data into actionable diagnostics:
- Cost analytics with per-endpoint breakdowns
- Endpoint-level risk/status and scope classification (internal vs external); internal routes suppressed from results automatically
- Optimization suggestions with estimated savings, bucketed by severity
- **Pricing classification badge** — each endpoint is tagged with its cost model (per-token, per-transaction, per-request, free)
- **AST-powered detection** — tree-sitter parses JS/TS/Python to find call frequency class, pricing model, batch/cache capability, and cross-file origins
- **Python waste detector** — dedicated AST-based waste detection for Python (N+1, unbounded loops, polling, missing cache guards)
- **Cost Simulator** — project API spend at scale; frequency class (polling, loops) auto-amplifies call volume; free endpoints always $0; save/compare scenarios, export CSV
- **Sustainability stats** — electricity (kWh), water (L), and CO2 (g) footprint estimated from API call volume, with AI vs non-AI breakdown
- **Local waste detection** — identifies N+1 patterns, unbounded loops, polling without exponential backoff, missing cache guards, and unbatched parallel calls without needing the remote API
- **`.recostignore`** — drop a `.recostignore` file in your repo root to exclude specific files or directories from scanning (same glob syntax as `.gitignore`)

## Tech Stack

- **TypeScript** — extension backend
- **React 18** — sidebar webview UI
- **Vite** + **esbuild** — bundlers
- **web-tree-sitter** — WASM-based AST parsing (JS/TS/Python); bundled into `dist/node_modules/` at build time for reliable VSIX installs; degrades gracefully to regex scanning if unavailable
- **TanStack Query v5**, **Tailwind CSS v4**, **Radix UI** — dashboard UI
- **Multi-provider AI chat** — ReCost AI (free, default), OpenAI, Anthropic, Gemini, xAI, Cohere, Mistral, Perplexity

## Project Structure

```
src/                        # Extension backend
  extension.ts              # Entry point
  api-client.ts             # HTTP client for remote ReCost API (rc- prefix key validation)
  webview-provider.ts       # Sidebar webview provider
  messages.ts               # IPC message types
  ast/
    parser-loader.ts        # web-tree-sitter WASM loader
    scanner.ts              # AST-based API call scanner
    frequency-analyzer.ts   # Call frequency classification (single, polling, loop, parallel, etc.)
    cross-file-resolver.ts  # Traces calls through helper functions to origin
    fingerprint-registry.ts # Per-method pricing fingerprints (costModel, per-call rates)
  chat/
    providers/              # Per-provider adapters (recost, openai, anthropic, gemini, xai, cohere, mistral, perplexity)
    provider-registry.ts    # Auth resolution (env var → SecretStorage)
    index.ts                # executeChat() dispatcher
  scanner/
    patterns/               # 16 provider-specific regex scanners (Firebase, GraphQL, OpenAI, Stripe, etc.)
    workspace-scanner.ts    # Orchestrates AST + regex scanning
    endpoint-classification.ts  # Classifies endpoints, detects 50+ providers
    local-waste-detector.ts # AST-signal waste detection (JS/TS)
    python-waste-detector.ts # AST-signal waste detection (Python)
    file-discovery.ts       # File discovery with .recostignore and DEFAULT_IGNORE_PATTERNS support
  simulator/                # Cost Simulator — pure computation, no side effects
    engine.ts               # runSimulation() — frequency multipliers, free zeroing, dynamic confidence
    static-source.ts        # EndpointRecord[] → SimulatorDataSource (passes frequencyClass + costModel)
    types.ts                # SimulatorInput, SimulatorResult, SavedScenario, scale presets
webview/                    # React sidebar UI
  src/
    components/
      ResultsPage.tsx        # Findings (Issues + Endpoints subtabs), Chat, Simulate tabs
      ChatPage.tsx           # AI chat — key-missing warning shown inline
      SimulatePage.tsx       # Cost Simulator tab
scripts/
  build-vsix.sh             # Build & package as .vsix (run in bash)
  run-scan.sh               # Run the local scanner CLI on a file or directory
  start-extension.sh        # Full dev setup (F5 workflow)
```

## Install from .vsix (recommended)

Run in a **bash terminal** (Git Bash / WSL on Windows — not PowerShell or CMD):

```bash
bash scripts/build-vsix.sh
```

Then install the generated file:

```bash
code --install-extension recost-api-analyzer-0.1.2.vsix
# or: Ctrl+Shift+P → "Extensions: Install from VSIX..."
```

Or install directly from the VS Code Marketplace:

```bash
code --install-extension recost.recost-api-analyzer
# or: search "ReCost" in the Extensions panel
```

Reload the window when prompted, then click the **ReCost leaf icon** in the Activity Bar.

---

## Using the Extension

### Sidebar toolbar buttons

The ReCost sidebar has five buttons in its title bar, left to right:

| Icon | Command | What it does |
|------|---------|--------------|
| Connection indicator | Status | Shows current API key state. Green check = connected and authenticated. Yellow warning = key stored but API unreachable or auth failed. Key icon = no key configured. Clicking always opens the Keys screen. |
| `$(key)` Key | Manage API Keys | Opens the Keys screen where you enter and validate your `rc-` ReCost API key and any AI chat provider keys (OpenAI, Anthropic, etc.). |
| `$(search)` Magnifying glass | Scan Workspace | Starts a full workspace scan. Replaced by a spinner while scanning is in progress. |
| `$(filter)` Filter | Edit Ignore Rules | Opens (or creates) `.recostignore` in your workspace root. Add glob patterns here to exclude files from scanning — same syntax as `.gitignore`. |
| `$(beaker)` Beaker | Toggle Fixture File | Toggles whether `recost-mock-calls.ts` (the reserved fixture file) is included in the next scan. Off by default. Useful for testing detection patterns without polluting real scan results. See [Testing ReCost with Mock API Patterns](#testing-recost-with-mock-api-patterns). |

### Status bar

A **ReCost** item appears in the bottom-right status bar at all times. It reflects your API key state and updates live when the key changes or the API becomes reachable/unreachable. Clicking it opens the Keys screen.

---

### After a scan — the results screen

Once a scan completes, the sidebar shows the results screen. The top of the webview has a tab bar:

**Findings** | **Simulate** | **Copy Context** | **Dashboard**

#### Findings tab

A summary bar across the top shows: total endpoints detected, total issues, estimated monthly spend, and quick-scan stats (high-risk count, free-tier endpoint count, endpoints detected inside loops).

> These are estimates based on static code analysis. Add the ReCost SDK to see real production costs.

Findings is split into two subtabs:

**Issues subtab**

Issues are first bucketed by pricing class:
- **Paid API Issues** — findings that affect paid external API calls and have direct cost impact
- **Free API Issues** — findings on free-tier APIs; no direct cost impact but may affect reliability
- **Unknown** — findings where pricing could not be determined

Within each bucket, issues are grouped by severity: **HIGH** (red), **MEDIUM** (yellow), **LOW** (grey). Each group is collapsible.

Each issue card shows:
- **Type badge** — the waste pattern detected (e.g. `n+1`, `cache`, `batch`, `redundancy`, `rate-limit`, `retry storm`)
- **Provider** — which API provider is affected
- **Pricing badge** — `paid` or `free`
- **Estimated monthly savings** — shown on the right if calculable

Clicking a card expands it to show:
- Full description of the problem
- Confidence percentage — how certain the detector is (green ≥ 80%, yellow ≥ 60%, red < 40%)
- Evidence items — specific signals the detector found (e.g. call site location, loop context)
- Affected file links — click any file path to jump to that location in the editor
- **Code fix** — when available, a code block with **Apply** (inserts fix directly into the file at the correct line) and **Copy** buttons

A **Type** dropdown filter appears above the list when multiple issue types are present, letting you narrow to a single type.

**Endpoints subtab**

Shows all detected external API endpoints, with a provider summary bar at the top listing each detected provider and its endpoint count.

Endpoints are grouped first by HTTP method (POST → GET → PUT → PATCH → DELETE → others), then within each method group by provider. Each endpoint row shows:
- The full URL or SDK call path
- The source file and line number as a clickable link that opens the file in the editor
- A small **red dot** on the right if the endpoint is at risk — hover it for a tooltip explaining why (e.g. "N+1 risk", "inside unbounded loop", "polling on timer", "cacheable but not cached")

---

#### Simulate tab

Projects your API costs at scale using the scan results. Set your expected daily active users (DAU) or total call volume and see estimated monthly cost broken down by provider and endpoint, with a ±30% confidence range.

Endpoints with `costModel: "free"` are always projected at $0. The simulator applies frequency-class multipliers automatically from AST data — polling endpoints count 8× their base volume, unbounded loops 10×, parallel/bounded loops 3×.

---

#### Copy Context button

Generates a structured markdown intelligence report from the most recent scan and copies it to the clipboard. The report is optimized for pasting into an AI coding agent (e.g. Claude, Copilot) — it includes a scored summary of API cost hotspots, clustered findings, and actionable context about which files and patterns need attention most.

The same output is available via the CLI with `--format context` and via the `recost.generateContext` command in the Command Palette, which additionally saves the output to `.recost-context.md` in your workspace root.

> **`.recost-context.md` is a generated file** — add it to your `.gitignore` if you don't want it committed. It is regenerated on every context copy or `generateContext` run.

---

#### Dashboard button

Opens the full ReCost dashboard at **recost.dev/dashboard** in your browser, where you can view historical scan data, endpoint trends, and scenario comparisons across projects.

---

## Quick Start (Dev)

For developing on the extension itself:

```bash
bash scripts/start-extension.sh
```

Then press **F5** in VSCode to launch the Extension Development Host.

If deps are already installed, rebuild and repackage with:

```bash
cd extension
npm run build && npm run package
```

## Scanner CLI

The CLI runs the same scanner as the extension, but from the terminal. It works against any file or directory — no VS Code required.

The bundle is at `dist/cli/scan.js` and is produced by `npm run build:ext`. It has no dependency on the VS Code API; it uses Node's `fs` directly.

### Usage

```
node dist/cli/scan.js <path> [--format json|summary|context]
```

Or via npm (builds must already exist):

```bash
npm run scan:cli -- <path> [--format summary|json|context]
```

Or via the helper script:

```bash
bash scripts/run-scan.sh <path> [summary|json|context]
```

### Formats

**`summary`** (default) — human-readable terminal report:

```
Target: /path/to/repo
Files scanned: 42
Mode: local-only
Endpoints found: 18
Issues found: 5
Monthly cost: $12.40
High-risk issues: 2

Endpoints:
  POST sdk://openai/chat.completions (src/api/chat.ts)
  GET  https://api.stripe.com/v1/charges (src/billing/charges.ts)

Issues:
  [high] n_plus_one: OpenAI embeddings called inside a loop — consider batching
  [medium] cache: Response is re-fetched on every request with no cache guard
```

**`json`** — full structured output. Top-level shape:

```jsonc
{
  "target": "/absolute/path/scanned",
  "scannedFileCount": 42,
  "mode": "local-only",          // or "remote-enriched" when RECOST_API_KEY is set
  "projectId": "local",
  "scanId": "local-1712345678901",
  "local": {
    "apiCalls": [...],            // raw ApiCallInput[] from AST/regex scanner
    "localWasteFindings": [...],  // LocalWasteFinding[] from waste detector
    "submittedRemoteApiCalls": [] // subset submitted to remote API (empty in local-only mode)
  },
  "remote": null,                 // populated when RECOST_API_KEY is set
  "endpoints": [...],             // final EndpointRecord[] (use this)
  "suggestions": [...],           // final Suggestion[] (use this)
  "summary": {
    "totalEndpoints": 18,
    "totalCallsPerDay": 240,
    "totalMonthlyCost": 12.40,
    "highRiskCount": 2
  }
}
```

`endpoints` and `suggestions` are aliases for `final.endpoints` / `final.suggestions` — always use those top-level fields. The `local.*` fields contain the raw pre-merge data.

**`context`** — structured markdown intelligence report, the same output as the **Copy Context** button in the sidebar. Optimized for pasting into an AI coding agent. Includes a scored summary of cost hotspots, clustered findings, and file-level risk signals. Progress is written to stderr so stdout stays clean for piping.

### Remote enrichment

By default the CLI runs entirely locally with no network calls. Set `RECOST_API_KEY` (or `RC_API_KEY`) to upload the scan to the ReCost API and get back remote-enriched endpoints and suggestions:

```bash
RECOST_API_KEY=rc-... node dist/cli/scan.js . --format json
```

In remote-enriched mode `mode` becomes `"remote-enriched"`, `remote` is populated with the API response, and `endpoints`/`suggestions` are the merged result of local + remote data.

## VSCode Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `recost.scanGlob` | `**/*.{ts,tsx,js,jsx,py,go,java,rb}` | Files to scan |
| `recost.scanIncludeGlobs` | `""` | Optional allowlist globs (comma-separated) |
| `recost.excludeGlob` | node_modules, dist, build, etc. | Files to exclude |
| `recost.aiReview.enabled` | `true` | Enable AI second-pass review |
| `recost.aiReview.minConfidence` | `0.7` | Min confidence for AI findings |
| `recost.aiReview.maxFiles` | `25` | Max files sent to AI review |
| `recost.aiReview.maxCharsPerFile` | `6000` | Max chars per file in AI context |
| `recost.aiReview.model` | `gpt-4.1-mini` | OpenAI model for AI review |
| `recost.pricingSyncIntervalHours` | `6` | How often (hours) to re-sync pricing from the ReCost backend |

## Testing ReCost with Mock API Patterns

To test how ReCost detects API cost issues without scanning a real codebase,
create a file named `recost-mock-calls.ts` (or `.js`, `.tsx`, `.jsx`) anywhere
in your repo.

This is ReCost's reserved fixture filename. Enable the fixture toggle (beaker
icon in the sidebar) to surface findings from this file. All other test files
remain filtered out regardless of toggle state.

### Example

```ts
// recost-mock-calls.ts
import OpenAI from "openai";

const client = new OpenAI();

// N+1: flagged as making one API call per loop iteration
async function embedDocuments(docs: string[]): Promise<void> {
  for (const doc of docs) {
    await client.embeddings.create({
      model: "text-embedding-3-small",
      input: doc,
    });
  }
}

// Batching opportunity: flagged as sequential calls that could use Promise.all
async function generateTwoCompletions(a: string, b: string): Promise<void> {
  const first = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: a }],
  });
  const second = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: b }],
  });
  console.log(first, second);
}
```

### Supported providers

OpenAI, Anthropic, Stripe, Supabase, Firebase, Gemini, Cohere, Mistral,
ElevenLabs, AWS Bedrock — any provider in the ReCost fingerprint registry.

### How it works

- **Toggle OFF** — `recost-mock-calls.ts` is excluded from scanning. Clean output.
- **Toggle ON** — `recost-mock-calls.ts` surfaces with full findings and cost
  estimates. All other test files remain suppressed.

---

## API Keys

### ReCost API Key

An API key (prefixed `rc-`) unlocks remote scan enrichment: your detected API calls are submitted to the ReCost API which returns enriched cost estimates, additional suggestions, and stores results in your dashboard.

Without a key, the extension still runs a full local scan using the AST engine and local waste detector — all features except remote enrichment work offline.

**Get a key:** [https://recost.dev/dashboard/account](https://recost.dev/dashboard/account)

**Set or change your key:**

1. Click the **key icon** (`$(key)`) in the ReCost sidebar toolbar, or click the **ReCost status bar item** (bottom-right of VS Code)
2. Paste your `rc-` key into the input field — it is validated against the API before saving
3. Keys are stored in VS Code's encrypted secret storage (never in settings files)

The status bar item reflects key state live: green check = connected and authenticated, yellow warning = key stored but auth check failed or API unreachable, key icon = no key configured.

### Project ID

The **Project ID** is an optional per-workspace setting that ties scan uploads to a specific existing project in the ReCost dashboard instead of auto-creating one.

**Without a Project ID:** on first scan with a valid API key, the extension automatically creates a project named after your workspace folder and stores its ID internally. Subsequent scans reuse that same project.

**With a manual Project ID:** scans from this workspace are uploaded to the project you specify. This is useful when multiple people or machines work on the same codebase and you want all scans to accumulate under one project, or when you want to link to a project you already have in the dashboard.

Set it in the Keys screen (click the key icon → **Project ID** field). The ID is validated against the API immediately on save. The **Dashboard** button in the sidebar opens directly to that project's page when a valid Project ID is set.

Clear the field to remove the override — the extension will fall back to auto-managing the project ID.

### AI Chat Keys (optional)

**ReCost AI is free and requires no key** — it is the default. For other providers, enter your API key via the extension UI or set the corresponding environment variable:

| Provider | Environment variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| xAI | `XAI_API_KEY` |
| Cohere | `COHERE_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Perplexity | `PPLX_API_KEY` |

Keys entered via the UI are stored in VS Code's encrypted secret storage.

---

## API

The live ReCost API is available at **https://api.recost.dev** — no setup required for read operations.

Full API documentation: **https://recost.dev**

---

Licensed under the [MIT License](LICENSE) © 2026 Andres Lopez, Aslan Wang, Donggyu Yoon.
