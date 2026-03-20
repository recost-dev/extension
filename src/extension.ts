import * as vscode from "vscode";
import { getDefaultChatSelection, getProviderAdapter } from "./chat";
import type { KeyServiceId } from "./messages";
import { EcoSidebarProvider } from "./webview-provider";

async function getSelectedProviderId(context: vscode.ExtensionContext): Promise<string> {
  return context.globalState.get<string>("eco.selectedChatProvider") ?? getDefaultChatSelection().provider;
}

function toProviderServiceId(providerId: string): KeyServiceId | undefined {
  if (providerId === "eco") return undefined;
  return providerId as KeyServiceId;
}

export function activate(context: vscode.ExtensionContext) {
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
      await provider.saveManagedKey("ecoapi", value);
    }
  });

  context.subscriptions.push(openPanelCommand, scanCommand, clearApiKeyCommand, updateApiKeyCommand, setEcoApiKeyCommand);
}

export function deactivate() {}
