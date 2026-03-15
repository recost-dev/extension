import * as vscode from "vscode";
import { EcoSidebarProvider } from "./webview-provider";

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
    await context.secrets.delete("eco.openaiApiKey");
    provider.sendApiKeyCleared();
  });

  const updateApiKeyCommand = vscode.commands.registerCommand("eco.updateApiKey", () => {
    provider.sendNeedsApiKey();
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

  context.subscriptions.push(openPanelCommand, scanCommand, clearApiKeyCommand, updateApiKeyCommand, setEcoApiKeyCommand);
}

export function deactivate() {}
