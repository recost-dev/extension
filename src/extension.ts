import * as vscode from "vscode";
import { getDefaultChatSelection, getProviderAdapter } from "./chat";
import { EcoSidebarProvider } from "./webview-provider";
import { validateApiKey } from "./api-client";

const ECO_API_KEY = "eco.ecoApiKey";
const GET_KEY_URL = "https://ecoapi.dev/dashboard/account";

async function getSelectedProviderId(context: vscode.ExtensionContext): Promise<string> {
  return context.globalState.get<string>("eco.selectedChatProvider") ?? getDefaultChatSelection().provider;
}

async function updateStatusBar(
  statusBar: vscode.StatusBarItem,
  context: vscode.ExtensionContext
): Promise<void> {
  const key = await context.secrets.get(ECO_API_KEY);
  if (!key) {
    statusBar.text = "$(key) EcoAPI: Not Configured";
    statusBar.tooltip = "Click to configure your EcoAPI key";
    return;
  }
  try {
    const user = await validateApiKey(key);
    if (user) {
      statusBar.text = `$(check) EcoAPI: ${user.email}`;
      statusBar.tooltip = `Connected as ${user.email}`;
    } else {
      // null = 404 = dev mode
      statusBar.text = "$(check) EcoAPI: Connected";
      statusBar.tooltip = "EcoAPI key configured";
    }
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 401) {
      statusBar.text = "$(warning) EcoAPI: Invalid Key";
      statusBar.tooltip = "EcoAPI key is invalid. Click to update.";
    } else {
      statusBar.text = "$(warning) EcoAPI: Unreachable";
      statusBar.tooltip = "Cannot reach EcoAPI. Check your connection.";
    }
  }
}

async function promptAndValidateKey(
  context: vscode.ExtensionContext,
  statusBar: vscode.StatusBarItem
): Promise<void> {
  const value = await vscode.window.showInputBox({
    prompt: "Enter your EcoAPI key",
    password: true,
    ignoreFocusOut: true,
    placeHolder: "Paste your API key here",
  });
  if (!value) return;
  const trimmed = value.trim();
  if (!trimmed) return;

  try {
    const user = await validateApiKey(trimmed);
    await context.secrets.store(ECO_API_KEY, trimmed);
    await updateStatusBar(statusBar, context);
    const msg = user ? `EcoAPI key saved. Connected as ${user.email}.` : "EcoAPI key saved.";
    vscode.window.showInformationMessage(msg);
  } catch (err: unknown) {
    const error = err as Error & { status?: number };
    if (error.status === 401) {
      vscode.window.showErrorMessage("Invalid EcoAPI key. Key was not saved.");
    } else {
      vscode.window.showErrorMessage(
        "Could not reach EcoAPI to validate key. Please check your connection and try again."
      );
    }
    // Do NOT store key on any failure
  }
}

export function activate(context: vscode.ExtensionContext) {
  // Status bar
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = "eco.changeApiKey";
  statusBar.text = "$(key) EcoAPI: Not Configured";
  statusBar.show();
  context.subscriptions.push(statusBar);

  const provider = new EcoSidebarProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(EcoSidebarProvider.viewType, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  const openPanelCommand = vscode.commands.registerCommand("eco.openPanel", () => {
    vscode.commands.executeCommand("eco.sidebarView.focus");
  });

  const scanCommand = vscode.commands.registerCommand("eco.scanWorkspace", () => {
    vscode.commands.executeCommand("eco.sidebarView.focus");
    provider.startScan();
  });

  const clearApiKeyCommand = vscode.commands.registerCommand("eco.clearApiKey", async () => {
    const providerId = await getSelectedProviderId(context);
    const adapter = getProviderAdapter(providerId);
    if (adapter.auth.secretStorageKey) {
      await context.secrets.delete(adapter.auth.secretStorageKey);
    }
    if (providerId === "openai") {
      await context.secrets.delete("eco.openaiApiKey");
    }
    provider.sendApiKeyCleared(providerId);
  });

  const updateApiKeyCommand = vscode.commands.registerCommand("eco.updateApiKey", async () => {
    const providerId = await getSelectedProviderId(context);
    const adapter = getProviderAdapter(providerId);
    if (!adapter.auth.required) {
      vscode.window.showInformationMessage(`${adapter.displayName} does not require an API key.`);
      return;
    }
    provider.sendNeedsApiKey(providerId);
  });

  const setEcoApiKeyCommand = vscode.commands.registerCommand("eco.setEcoApiKey", async () => {
    await promptAndValidateKey(context, statusBar);
  });

  const changeApiKeyCommand = vscode.commands.registerCommand("eco.changeApiKey", async () => {
    await promptAndValidateKey(context, statusBar);
  });

  // Re-validate status bar whenever the EcoAPI key changes in SecretStorage
  context.subscriptions.push(
    context.secrets.onDidChange(async (event) => {
      if (event.key === ECO_API_KEY) {
        await updateStatusBar(statusBar, context);
      }
    })
  );

  context.subscriptions.push(
    openPanelCommand, scanCommand, clearApiKeyCommand, updateApiKeyCommand,
    setEcoApiKeyCommand, changeApiKeyCommand
  );

  // Async init: update status bar on startup + show first-run notification if no key
  (async () => {
    await updateStatusBar(statusBar, context);
    const existingKey = await context.secrets.get(ECO_API_KEY);
    if (!existingKey) {
      const choice = await vscode.window.showInformationMessage(
        "EcoAPI key not configured. Enter your API key to enable scanning.",
        "Enter Key",
        "Get a key"
      );
      if (choice === "Enter Key") {
        await promptAndValidateKey(context, statusBar);
      } else if (choice === "Get a key") {
        await vscode.env.openExternal(vscode.Uri.parse(GET_KEY_URL));
      }
      // Dismissed → do nothing, extension continues normally
    }
  })().catch((err: unknown) => {
    console.error("EcoAPI: init error", err);
  });
}

export function deactivate() {}
