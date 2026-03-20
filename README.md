# ReCost - API Usage Analyzer

VSCode extension that scans your workspace for API call patterns, estimates costs, and generates optimization suggestions — all locally, no remote server required.

## Why This Exists

Developers often ship API-heavy features without visibility into:
- Monthly API spend risk
- Redundant or cacheable request patterns
- Rate-limit and N+1 hotspots

ReCost turns parsed API call data into actionable diagnostics:
- Cost analytics with per-endpoint breakdowns
- Endpoint-level risk/status and scope classification (internal vs external)
- Optimization suggestions with estimated savings
- Interactive dependency graph visualization
- **Cost Simulator** — project API spend at scale with user-centric or volume-centric models, save/compare scenarios, export CSV
- **Sustainability stats** — electricity (kWh), water (L), and CO2 (g) footprint estimated from API call volume, with AI vs non-AI breakdown
- **Local waste detection** — identifies redundant patterns, missing caching, unbatched requests without needing the remote API

## Tech Stack

- **TypeScript** — extension backend
- **React 18** — sidebar webview UI
- **Vite** + **esbuild** — bundlers
- **TanStack Query v5**, **Tailwind CSS v4**, **D3.js**, **Radix UI** — dashboard UI
- **Multi-provider AI chat** — ReCost AI (free, default), OpenAI, Anthropic, Gemini, xAI, Cohere, Mistral, Perplexity

## Project Structure

```
src/                        # Extension backend
  extension.ts              # Entry point
  api-client.ts             # HTTP client for remote ReCost API
  local-server.ts           # Embedded server (dashboard + local analysis)
  webview-provider.ts       # Sidebar webview provider
  messages.ts               # IPC message types
  analysis/types.ts
  chat/
    prompts.ts              # AI prompt templates
    types.ts                # Shared chat types
    provider-registry.ts    # Provider registry & auth resolution
    index.ts                # executeChat() dispatcher
    errors.ts               # ChatAdapterError
    providers/              # Per-provider adapters (eco, openai, anthropic, gemini, xai, cohere, mistral, perplexity)
  scanner/
    patterns.ts             # API call detection regex
    patterns/               # 16 provider-specific pattern scanners (Firebase, GraphQL, OpenAI, Stripe, etc.)
    workspace-scanner.ts    # Workspace file scanner
    endpoint-classification.ts  # Classifies endpoints as internal/external, detects 50+ providers
    local-waste-detector.ts # Detects waste patterns locally (redundancy, missing cache, unbatched)
  simulator/                # Cost Simulator computation layer
    types.ts                # SimulatorInput, SimulatorResult, SavedScenario, scale presets
    engine.ts               # runSimulation() — scales endpoints, ±30% uncertainty, groups by provider
    static-source.ts        # StaticDataSource adapter (EndpointRecord[] → SimulatorDataSource)
    index.ts                # Barrel re-export
webview/                    # React sidebar UI
  src/
    App.tsx
    vscode.ts               # VSCode API bridge
    components/
      LandingPage.tsx
      ScanningPage.tsx
      ResultsPage.tsx        # Main results view with tabs
      ChatPage.tsx           # AI chat tab
      SimulatePage.tsx       # Cost Simulator tab
dashboard/                  # Full React dashboard (built into dashboard-dist/)
  src/
    pages/                  # Dashboard, Endpoints, Graph, Suggestions, Simulator
    lib/                    # API client, TanStack Query hooks, types
    components/             # ScenarioCompare, Select, animated-tree, particles
dashboard-dist/             # Built dashboard (generated — do not edit)
scripts/
  build-vsix.sh             # Build & package as .vsix (run in bash)
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

An API key is required to sync scan results with the ReCost API and unlock full cost estimates (provider pricing, per-endpoint breakdowns, monthly projections).

**Get a key:** [https://recost.dev/dashboard/account](https://recost.dev/dashboard/account)

**Set or change your key:**

1. Open the command palette: `Ctrl+Shift+P` (macOS: `Cmd+Shift+P`)
2. Run: **EcoAPI: Change API Key**
3. Paste your key — it is validated against the API before being saved, and stored in VS Code's encrypted secret storage (never in any file)

You can also click the **ReCost status bar item** (bottom-right of the VS Code window) to open the same prompt. On first launch, a notification appears automatically if no key is configured.

**Status bar states:**

| Text | Meaning |
|------|---------|
| `EcoAPI: Not Configured` | No key stored — click to configure |
| `EcoAPI: user@email.com` | Connected and authenticated |
| `EcoAPI: Connected` | Admin/dev key configured (auth endpoint not yet live) |
| `EcoAPI: Invalid Key` | Key rejected by server — run **EcoAPI: Change API Key** to update |
| `EcoAPI: Unreachable` | Network issue — check your connection |

**Dev mode / admin key:** Use **EcoAPI: Change API Key** to set any key, including an admin key for local development. If the `/auth/me` endpoint isn't deployed yet, the extension accepts the key and shows `EcoAPI: Connected`. No `eco-` prefix is required.

### AI Chat Keys (optional)

The Chat tab supports multiple AI providers. **ReCost AI is free and requires no key** — it is the default. For other providers, enter your API key via the extension UI when prompted, or set the corresponding environment variable:

| Provider | Environment variable |
|----------|---------------------|
| OpenAI | `OPENAI_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| xAI | `XAI_API_KEY` |
| Cohere | `COHERE_API_KEY` |
| Mistral | `MISTRAL_API_KEY` |
| Perplexity | `PPLX_API_KEY` |

Environment variables can be set in your shell profile or in a `.env` file in your project root. Keys entered via the UI are stored in VS Code's encrypted secret storage.

---

## API

The live ReCost API is available at **https://api.recost.dev** — no setup required for read operations.

Full API documentation: **https://recost.dev**

---

Licensed under the [GNU Affero General Public License v3.0](LICENSE) © 2026 Andres Lopez, Aslan Wang, Donggyu Yoon.
