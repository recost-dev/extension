import * as vscode from "vscode";
import { EcoSidebarProvider, collectLocalScanData } from "./webview-provider";
import { validateApiKey } from "./api-client";
import { syncPricingFromBackend } from "./scanner/fingerprints/registry";
import { buildSnapshot } from "./intelligence/builder";
import { scoreSnapshot } from "./intelligence/scorer";
import { buildReviewClusters } from "./intelligence/clusters";
import { compressClusters } from "./intelligence/compression";
import { buildExportContext, formatAsMarkdown } from "./intelligence/export";

const ECO_API_KEY = "recost.apiKey";
const GET_KEY_URL = "https://recost.dev/dashboard/account";
const PRICING_BACKEND_URL = "https://api.recost.dev";
const DEFAULT_SYNC_INTERVAL_HOURS = 6;

async function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  context: vscode.ExtensionContext
): Promise<void> {
  const key = await context.secrets.get(ECO_API_KEY);
  if (!key) {
    statusBar.text = "$(key) ReCost: Not Configured";
    statusBar.tooltip = "Click to manage your ReCost API keys";
    statusBar.color = undefined;
    await vscode.commands.executeCommand("setContext", "recost.keyOnline", false);
    return;
  }
  try {
    const user = await validateApiKey(key);
    if (user) {
      statusBar.text = `$(check) ReCost: ${user.email}`;
      statusBar.tooltip = `Connected as ${user.email}`;
    } else {
      statusBar.text = "$(check) ReCost: Connected";
      statusBar.tooltip = "ReCost API key configured";
    }
    statusBar.color = new vscode.ThemeColor("testing.iconPassed");
    await vscode.commands.executeCommand("setContext", "recost.keyOnline", true);
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 401) {
      statusBar.text = "$(warning) ReCost: Invalid Key";
      statusBar.tooltip = "ReCost API key is invalid. Click to manage keys.";
    } else {
      statusBar.text = "$(warning) ReCost: Unreachable";
      statusBar.tooltip = "Cannot reach ReCost. Check your connection.";
    }
    statusBar.color = new vscode.ThemeColor("statusBarItem.warningForeground");
    await vscode.commands.executeCommand("setContext", "recost.keyOnline", false);
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "recost.openKeys";
  statusBar.text = "$(key) ReCost: Not Configured";
  statusBar.show();
  context.subscriptions.push(statusBar);

  // Initialize context variable immediately so view/title when clauses work on first render
  vscode.commands.executeCommand("setContext", "recost.keyOnline", false);

  const provider = new EcoSidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(EcoSidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const openPanelCommand = vscode.commands.registerCommand("recost.openPanel", () => {
    vscode.commands.executeCommand("recost.sidebarView.focus");
  });

  const scanCommand = vscode.commands.registerCommand("recost.scanWorkspace", () => {
    vscode.commands.executeCommand("recost.sidebarView.focus");
    provider.startScan();
  });

  const openKeysCommand = vscode.commands.registerCommand("recost.openKeys", () => {
    vscode.commands.executeCommand("recost.sidebarView.focus");
    provider.openKeys();
  });

  const generateContextCommand = vscode.commands.registerCommand("recost.generateContext", async () => {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const { apiCalls, findings, totalFilesScanned } = await collectLocalScanData();
      console.info(
        `ReCost context scan collected ${apiCalls.length} apiCalls, ${findings.length} findings, and scanned ${totalFilesScanned} files`
      );
      const snapshot = buildSnapshot({
        apiCalls,
        findings,
        repoRoot: workspaceFolder?.uri.fsPath,
        totalFilesScanned,
      });
      const scored = scoreSnapshot(snapshot);
      const reviewClusters = buildReviewClusters(scored);
      const compressedClusters = compressClusters(reviewClusters, snapshot);
      const generatorVersion = String(context.extension.packageJSON.version ?? "");
      const exportContext = buildExportContext(compressedClusters, snapshot, scored, {
        generatorVersion: generatorVersion || undefined,
      });
      const markdown = formatAsMarkdown(exportContext);

      await vscode.env.clipboard.writeText(markdown);

      if (!workspaceFolder) {
        vscode.window.showInformationMessage("ReCost context generated: copied to clipboard");
        return;
      }

      const outputUri = vscode.Uri.joinPath(workspaceFolder.uri, ".recost-context.md");
      const bytes = new TextEncoder().encode(markdown);
      await vscode.workspace.fs.writeFile(outputUri, bytes);
      vscode.window.showInformationMessage(
        "ReCost context generated: copied to clipboard and saved to .recost-context.md"
      );

      // TODO: Add a parallel JSON export command if/when we expose formatAsJSON.
    } catch (err: unknown) {
      console.error("ReCost failed to generate context", err);
      vscode.window.showErrorMessage("ReCost failed to generate context");
    }
  });

  // Re-validate status bar whenever the ReCost API key changes in SecretStorage
  context.subscriptions.push(
    context.secrets.onDidChange(async (event) => {
      if (event.key === ECO_API_KEY) {
        await updateStatusBar(statusBar, context);
      }
    })
  );

  const statusOnlineCommand = vscode.commands.registerCommand("recost.statusOnline", () => {});
  const statusLocalCommand = vscode.commands.registerCommand("recost.statusLocal", () => {});

  context.subscriptions.push(
    openPanelCommand,
    scanCommand,
    openKeysCommand,
    generateContextCommand,
    statusOnlineCommand,
    statusLocalCommand
  );

  // Pricing sync: fire-and-forget on startup, then repeat on a configurable interval
  const syncPricing = () => {
    syncPricingFromBackend(PRICING_BACKEND_URL).catch((err: unknown) => {
      console.warn("ReCost: pricing sync error", err);
    });
  };
  syncPricing();

  const intervalHours =
    vscode.workspace
      .getConfiguration("recost")
      .get<number>("pricingSyncIntervalHours") ?? DEFAULT_SYNC_INTERVAL_HOURS;
  const syncIntervalId = setInterval(syncPricing, intervalHours * 60 * 60 * 1_000);
  context.subscriptions.push({ dispose: () => clearInterval(syncIntervalId) });

  // Async init: update status bar on startup + show first-run notification if no key
  (async () => {
    await updateStatusBar(statusBar, context);
    const existingKey = await context.secrets.get(ECO_API_KEY);
    if (!existingKey) {
      const choice = await vscode.window.showInformationMessage(
        "ReCost API key not configured. Open Keys to set up your API key.",
        "Open Keys",
        "Get a key"
      );
      if (choice === "Open Keys") {
        vscode.commands.executeCommand("recost.openKeys");
      } else if (choice === "Get a key") {
        await vscode.env.openExternal(vscode.Uri.parse(GET_KEY_URL));
      }
    }
  })().catch((err: unknown) => {
    console.error("ReCost: init error", err);
  });
}

export function deactivate() {}
