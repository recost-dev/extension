# ReCost - API Usage Analyzer (VSCode Extension)

VSCode extension that scans your workspace for API call patterns, estimates costs, shows diagnostics, and opens a full dashboard locally. Multi-provider AI chat and optional AI code review.

## Tech Stack

- **TypeScript** — extension backend (strict mode)
- **esbuild** — bundler for extension and webview
- **React 18** — sidebar webview UI
- **Vite** — dashboard bundler
- **Multi-provider AI chat** — ReCost AI (free, default), OpenAI, Anthropic, Gemini, xAI, Cohere, Mistral, Perplexity
- **OpenAI SDK** — AI review (optional, `gpt-4.1-mini` default)

## Project Structure

```
src/
  extension.ts            # Extension entry point
  api-client.ts           # HTTP client for remote ReCost API
  local-server.ts         # Embedded HTTP server (serves dashboard + proxies local analysis)
  webview-provider.ts     # Sidebar webview provider (IPC handling, local pricing table for 40+ providers, cost estimation algorithm)
  messages.ts             # IPC message types (extension ↔ webview)
  analysis/
    types.ts              # Analysis type definitions
  chat/
    prompts.ts            # AI prompt templates
    types.ts              # Shared chat types
    provider-registry.ts  # Provider registry & auth resolution (env var → SecretStorage fallback)
    index.ts              # executeChat() dispatcher
    errors.ts             # ChatAdapterError
    providers/            # Per-provider adapters (eco, openai, anthropic, gemini, xai, cohere, mistral, perplexity)
  scanner/
    patterns.ts           # API call detection regex patterns
    patterns/             # 16 provider-specific pattern scanners (Firebase, GraphQL, OpenAI, Stripe, Anthropic, Bedrock, etc.)
    workspace-scanner.ts  # Workspace file scanner
    endpoint-classification.ts  # Classifies endpoints as internal/external, detects 50+ provider hosts
    local-waste-detector.ts     # Detects waste patterns locally (redundancy, missing cache, unbatched)
  simulator/              # Cost Simulator computation layer
    types.ts              # SimulatorInput, SimulatorResult, SavedScenario, scale presets (1K–100K)
    engine.ts             # Pure runSimulation() function (no side effects)
    static-source.ts      # StaticDataSource adapter (EndpointRecord[] → SimulatorDataSource)
    index.ts              # Barrel re-export
webview/                  # React sidebar UI
  src/
    App.tsx               # 3 screens: landing → scanning → results
    main.tsx
    types.ts
    vscode.ts             # VSCode API bridge
    components/
      LandingPage.tsx
      ScanningPage.tsx
      ResultsPage.tsx     # Main results view with tabs for Chat and Simulate
      ChatPage.tsx        # AI chat tab (in results)
      SimulatePage.tsx    # Cost Simulator tab (in results)
      Markdown.tsx
      LeafIcon.tsx
    styles/
      index.css
dashboard/                # React SPA (full dashboard)
  src/
    App.tsx               # Root component with routing
    theme-context.tsx
    themes.ts
    components/
      ScenarioCompare.tsx # Side-by-side scenario comparison modal
      Select.tsx / animated-tree.tsx / particles.tsx
    layout/
    lib/
      api.ts              # REST client
      queries.ts          # TanStack Query hooks
      types.ts
    pages/
      Dashboard.tsx
      Endpoints.tsx
      Graph.tsx
      Suggestions.tsx
      Simulator.tsx       # Cost Simulator page with scenario management
    styles/
  vite.config.ts
  package.json
dashboard-dist/           # Built dashboard (output of npm run build:dashboard)
scripts/
  build-vsix.sh           # Build & package as .vsix (run in bash)
  start-extension.sh      # Full dev setup (install + build + open VSCode)
esbuild.mjs               # esbuild config for extension + webview
package.json
tsconfig.json
```

## Commands

Run from the root (`extension/`) directory:

| Command | Description |
|---------|-------------|
| `npm run build` | Full build: dashboard + webview + extension |
| `npm run build:ext` | Build extension backend only |
| `npm run build:webview` | Build React sidebar webview |
| `npm run build:dashboard` | Build dashboard and copy to `dashboard-dist/` |
| `npm run watch:ext` | Watch extension backend |
| `npm run watch:webview` | Watch webview |
| `npm run package` | Package as `.vsix` |

## Local Install (VSIX)

Use the build script — it installs all deps, builds everything, and packages the `.vsix`.
Confirmed compatible with **macOS**, **Windows** (Git Bash / WSL), and **Linux**. The setup scripts require bash — run in a bash terminal, not PowerShell or CMD:

```bash
bash scripts/build-vsix.sh
# → outputs eco-api-analyzer-*.vsix in extension/

# Install
code --install-extension eco-api-analyzer-*.vsix
# or: Ctrl+Shift+P → "Extensions: Install from VSIX..."
```

One-liner after dependencies are already installed:
```bash
npm run build && npm run package
```

## Dev Setup

Run in a bash terminal (Git Bash / WSL on Windows):

```bash
bash scripts/start-extension.sh
```

Then press **F5** in VSCode to launch the Extension Development Host.

## Architecture Notes

- The extension embeds a local HTTP server (`local-server.ts`) that serves the built dashboard and handles analysis requests without any remote API
- Webview ↔ extension IPC uses typed messages defined in `messages.ts`
- The workspace scanner (`workspace-scanner.ts`) uses regex patterns from `patterns.ts` and `patterns/` to detect API calls across supported file types
- `endpoint-classification.ts` classifies detected endpoints as internal/external and identifies 50+ provider hosts (GitHub, Stripe, AWS, Google, Twilio, etc.)
- `local-waste-detector.ts` detects waste patterns (redundancy, missing cache, unbatched) locally without the remote API
- AI review is optional: prompts live in `chat/prompts.ts`, calls go through `openai` SDK; key is stored in VSCode SecretStorage
- AI review validation (`webview-provider.ts`) checks findings against allowed types, severity, file existence, and confidence threshold
- `dashboard-dist/` must exist (built) before the extension can serve the dashboard — `build:dashboard` handles this

### Local Server Endpoints

The embedded server (`local-server.ts`) exposes:
- `GET /projects/local/sustainability` — electricity, water, CO2 footprint by provider
- `GET /projects/local/cost/by-provider` — cost breakdown grouped by provider
- `POST /api/projects/local/simulator/run` — run cost simulation
- `GET/POST/DELETE /api/projects/local/simulator/scenarios` — scenario CRUD
- `GET /api/projects/local/simulator/scenarios/export` — CSV export of scenarios

### Auth / API Key System

Two separate key systems coexist:

**ReCost API key** (for scanning/remote API) — managed entirely in `extension.ts`:
- Stored in `context.secrets` under `"eco.ecoApiKey"`
- `validateApiKey()` in `api-client.ts` calls `GET /auth/me` with `Authorization: Bearer <key>` to validate; returns `null` on 404 (dev mode — endpoint not deployed), throws on 401 (invalid) or network error
- Status bar item in `extension.ts` reflects auth state (Not Configured / email / Invalid Key / Unreachable); clicking it runs `eco.changeApiKey`
- `eco.changeApiKey` command validates before storing; key is never saved on failure
- `context.secrets.onDidChange` listener keeps status bar live without reload

**Chat provider keys** (OpenAI, Anthropic, etc.) — managed in `webview-provider.ts` + `chat/provider-registry.ts`:
- Stored per-provider in `context.secrets` under provider-specific keys (e.g., `eco.providerApiKey.openai`)
- Resolved via env var → SecretStorage fallback in `resolveProviderAuth()`
- Default provider: "eco" with "eco-ai" model (free, no key required)

### Cost Estimation

- `webview-provider.ts` contains a hard-coded per-call cost table for 40+ providers (OpenAI, Anthropic, Stripe, AWS, Google, Twilio, SendGrid, etc.)
- Suggestion savings are estimated using base multipliers by type (redundancy 0.35, n_plus_one 0.3, cache 0.2, batch 0.18, default 0.12) × severity multiplier (high 1.0, medium 0.75, low 0.5)
- Suggestions can have `source: "local-rule"` (from local waste detection) or `source: "remote"` (from API)

### Cost Simulator

The Cost Simulator (`src/simulator/`) is a pure computation layer (no Node/browser/VSCode deps) that projects API costs at scale:

- **Engine** (`engine.ts`): `runSimulation(dataSource, input)` scales each endpoint proportionally, applies ±30% uncertainty range, groups by provider
- **Input modes**: "user-centric" (DAU × calls/user) or "volume-centric" (total calls/day)
- **Scale presets**: 1K, 10K, 50K, 100K (both DAU and volume variants)
- **Data source abstraction** (`SimulatorDataSource` interface): allows static scan data (v1) or future live telemetry to be swapped in without UI changes
- **VS Code sidebar**: "Simulate" tab in `ResultsPage`, rendered by `SimulatePage.tsx`. Sends `runSimulation` IPC message; receives `simulationResult`
- **Dashboard**: `/simulator` route with full scenario management (save, compare 2, export CSV)
- **Scenario persistence**: Saved scenarios stored in `vscode.globalState` under `eco.simulatorScenarios`, passed to local server via `onScenariosChanged` callback

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
