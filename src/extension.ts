import * as vscode from "vscode";
import { getDefaultChatSelection, getProviderAdapter } from "./chat";
import type { KeyServiceId } from "./messages";
import { EcoSidebarProvider } from "./webview-provider";
import { validateApiKey } from "./api-client";

const ECO_API_KEY = "eco.ecoApiKey";
const GET_KEY_URL = "https://ecoapi.dev/dashboard/account";

async function getSelectedProviderId(context: vscode.ExtensionContext): Promise<string> {
  return context.globalState.get<string>("eco.selectedChatProvider") ?? getDefaultChatSelection().provider;
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
      await provider.clearManagedKey(toProviderServiceId(providerId) ?? "openai");
    } else {
      vscode.window.showInformationMessage(`${adapter.displayName} does not require an API key.`);
    }
  });

  const updateApiKeyCommand = vscode.commands.registerCommand("eco.updateApiKey", async () => {
    const providerId = await getSelectedProviderId(context);
    const adapter = getProviderAdapter(providerId);
    if (!adapter.auth.required) {
      vscode.window.showInformationMessage(`${adapter.displayName} does not require an API key.`);
      return;
    }
    provider.openKeys(toProviderServiceId(providerId));
  });

  const setEcoApiKeyCommand = vscode.commands.registerCommand("eco.setEcoApiKey", async () => {
    const value = await vscode.window.showInputBox({
      prompt: "Enter your EcoAPI Admin API Key",
      password: true,
      ignoreFocusOut: true,
    });
    if (value) {
      await context.secrets.store("eco.ecoApiKey", value);
    }
  });

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
