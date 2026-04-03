import * as vscode from "vscode";

let _channel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel("ReCost Status");
  }
  return _channel;
}
