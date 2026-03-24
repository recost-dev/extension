# ReCost - API Usage Analyzer

VSCode extension that scans your workspace for API call patterns using an AST-powered parsing engine, estimates costs, and generates optimization suggestions — all locally, no remote server required.

## Why This Exists

Developers often ship API-heavy features without visibility into:
- Monthly API spend risk
- Redundant or cacheable request patterns
- Rate-limit and N+1 hotspots

ReCost turns parsed API call data into actionable diagnostics:
- Cost analytics with per-endpoint breakdowns
- Endpoint-level risk/status and scope classification (internal vs external)
- Optimization suggestions with estimated savings
- **AST-powered detection** — tree-sitter parses JS/TS/Python to find call frequency class, pricing model, batch/cache capability, and cross-file origins
- **Cost Simulator** — project API spend at scale; frequency class (polling, loops) auto-amplifies call volume; free endpoints always $0; save/compare scenarios, export CSV
- **Sustainability stats** — electricity (kWh), water (L), and CO2 (g) footprint estimated from API call volume, with AI vs non-AI breakdown
- **Local waste detection** — identifies N+1 patterns, unbounded loops, polling without exponential backoff, missing cache guards, and unbatched parallel calls without needing the remote API

## Tech Stack

- **TypeScript** — extension backend
- **React 18** — sidebar webview UI
- **Vite** + **esbuild** — bundlers
- **web-tree-sitter** — WASM-based AST parsing (JS/TS/Python)
- **TanStack Query v5**, **Tailwind CSS v4**, **Radix UI** — dashboard UI
- **Multi-provider AI chat** — ReCost AI (free, default), OpenAI, Anthropic, Gemini, xAI, Cohere, Mistral, Perplexity

## Project Structure

```
src/                        # Extension backend
  extension.ts              # Entry point
  api-client.ts             # HTTP client for remote ReCost API (rc- prefix key validation)
  local-server.ts           # Embedded server (dashboard + local analysis)
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
    local-waste-detector.ts # AST-signal waste detection
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
dashboard/                  # Full React dashboard (built into dashboard-dist/)
  src/
    pages/                  # Dashboard, Endpoints, Suggestions, Simulator
    lib/                    # API client, TanStack Query hooks, format utilities
    components/             # ScenarioCompare, Select, animated-tree, particles
dashboard-dist/             # Built dashboard (generated — do not edit)
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
code --install-extension eco-api-analyzer-0.1.0.vsix
# or: Ctrl+Shift+P → "Extensions: Install from VSIX..."
```

Reload the window when prompted, then click the **ReCost leaf icon** in the Activity Bar.

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

You can run the local scanner from the terminal against either a single file or a whole directory.

Build the CLI bundle first:

```bash
npm run build:ext
```

Run it directly with npm:

```bash
npm run scan:cli -- src --format summary
npm run scan:cli -- src/scanner/workspace-scanner.ts --format summary
npm run scan:cli -- src --format json
```

Or use the helper wrapper:

```bash
bash scripts/run-scan.sh src summary
bash scripts/run-scan.sh src/scanner/workspace-scanner.ts summary
bash scripts/run-scan.sh src json
```

Notes:
- `summary` prints a readable terminal report.
- `json` prints structured output you can redirect or pipe elsewhere.
- The CLI currently reports local scan results only, not the remote-enriched sidebar results.

## VSCode Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `eco.scanGlob` | `**/*.{ts,tsx,js,jsx,py,go,java,rb}` | Files to scan |
| `eco.scanIncludeGlobs` | `""` | Optional allowlist globs (comma-separated) |
| `eco.excludeGlob` | node_modules, dist, build, etc. | Files to exclude |
| `eco.aiReview.enabled` | `true` | Enable AI second-pass review |
| `eco.aiReview.minConfidence` | `0.7` | Min confidence for AI findings |
| `eco.aiReview.maxFiles` | `25` | Max files sent to AI review |
| `eco.aiReview.maxCharsPerFile` | `6000` | Max chars per file in AI context |
| `eco.aiReview.model` | `gpt-4.1-mini` | OpenAI model for AI review |

## API Keys

### ReCost API Key

An API key (prefixed `rc-`) is required to sync scan results with the ReCost API and unlock full cost estimates.

**Get a key:** [https://recost.dev/dashboard/account](https://recost.dev/dashboard/account)

**Set or change your key:**

1. Open the command palette: `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)
2. Run: **EcoAPI: Change API Key**
3. Paste your `rc-` key — it is validated before saving and stored in VS Code's encrypted secret storage

You can also click the **ReCost status bar item** (bottom-right) to open the same prompt.

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

Licensed under the [GNU Affero General Public License v3.0](LICENSE) © 2026 Andres Lopez, Aslan Wang, Donggyu Yoon.
