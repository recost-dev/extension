// Minimal `vscode` shim for unit-test environments where the real Extension
// Host API is not available. Only stubs the surface that src/extension.ts and
// its eager imports touch at module-load time and during a no-op
// activate()/deactivate() sequence.

class Disposable {
  static from(..._disposables: { dispose: () => void }[]): Disposable {
    return new Disposable();
  }
  dispose(): void { /* noop */ }
}

class EventEmitter<T> {
  event = (_listener: (_e: T) => void) => new Disposable();
  fire(_data: T): void { /* noop */ }
  dispose(): void { /* noop */ }
}

class Uri {
  static file(p: string) { return new Uri(p); }
  static joinPath(_base: Uri, ..._segments: string[]) { return new Uri("joined"); }
  constructor(public readonly fsPath: string = "") {}
  toString() { return this.fsPath; }
}

const noop = () => undefined;
const asyncNoop = async () => undefined;

const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: noop,
    append: noop,
    clear: noop,
    show: noop,
    dispose: noop,
    hide: noop,
    replace: noop,
    name: _name,
  }),
  createStatusBarItem: () => ({
    text: "",
    tooltip: "",
    command: undefined,
    color: undefined,
    show: noop,
    hide: noop,
    dispose: noop,
  }),
  showInformationMessage: asyncNoop,
  showErrorMessage: asyncNoop,
  showWarningMessage: asyncNoop,
  registerWebviewViewProvider: () => new Disposable(),
  activeTextEditor: undefined,
};

const workspace = {
  workspaceFolders: [] as { uri: Uri; name: string; index: number }[],
  getConfiguration: () => ({
    get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
    update: asyncNoop,
    has: () => false,
    inspect: () => undefined,
  }),
  onDidChangeConfiguration: () => new Disposable(),
  onDidChangeWorkspaceFolders: () => new Disposable(),
  fs: {
    readFile: asyncNoop,
    writeFile: asyncNoop,
    stat: asyncNoop,
  },
  findFiles: async () => [] as Uri[],
};

const commands = {
  registerCommand: () => new Disposable(),
  executeCommand: asyncNoop,
};

const env = {
  clipboard: {
    writeText: asyncNoop,
    readText: async () => "",
  },
  openExternal: asyncNoop,
};

const StatusBarAlignment = { Left: 1, Right: 2 } as const;
const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 } as const;
const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;
const ThemeColor = class { constructor(public readonly id: string) {} };

export {
  Disposable,
  EventEmitter,
  Uri,
  window,
  workspace,
  commands,
  env,
  StatusBarAlignment,
  ViewColumn,
  ConfigurationTarget,
  ThemeColor,
};
