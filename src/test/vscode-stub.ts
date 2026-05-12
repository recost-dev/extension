// Minimal stub of the `vscode` module for unit tests that transitively load
// modules importing `vscode`. Only the surface area touched at module-load
// time needs to exist here; runtime-only API surface (e.g. window.show*) is
// left undefined intentionally.

export const window = {
  createOutputChannel: (_name: string) => ({
    appendLine: (_msg: string) => {},
    append: (_msg: string) => {},
    show: () => {},
    dispose: () => {},
  }),
  showErrorMessage: async (_msg: string) => undefined,
  showWarningMessage: async (_msg: string) => undefined,
  showInformationMessage: async (_msg: string) => undefined,
  showInputBox: async () => undefined,
  showOpenDialog: async () => undefined,
  showTextDocument: async () => ({}),
  activeTextEditor: undefined,
  withProgress: async (_opts: unknown, fn: (...args: never[]) => unknown) =>
    fn(undefined as never, undefined as never),
};

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: (_section?: string) => ({
    get: (_key: string, fallback?: unknown) => fallback,
    update: async () => undefined,
  }),
  openTextDocument: async () => ({}),
  fs: {
    readFile: async () => new Uint8Array(),
    writeFile: async () => undefined,
    stat: async () => ({ type: 0, ctime: 0, mtime: 0, size: 0 }),
  },
  onDidChangeConfiguration: () => ({ dispose: () => {} }),
};

export const commands = {
  executeCommand: async (..._args: unknown[]) => undefined,
  registerCommand: () => ({ dispose: () => {} }),
};

export const env = {
  clipboard: { writeText: async (_text: string) => undefined },
  openExternal: async () => true,
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, scheme: "file", path: p }),
  parse: (p: string) => ({ fsPath: p, scheme: "file", path: p }),
  joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
    fsPath: [base.fsPath, ...segments].join("/"),
    scheme: "file",
    path: [base.fsPath, ...segments].join("/"),
  }),
};

export class EventEmitter<T> {
  public event = (_listener: (e: T) => unknown) => ({ dispose: () => {} });
  public fire(_data: T): void {}
  public dispose(): void {}
}

export const ViewColumn = { One: 1, Two: 2, Three: 3 };

export const ProgressLocation = { Notification: 15, Window: 10, SourceControl: 1 };

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };

export const StatusBarAlignment = { Left: 1, Right: 2 };

export const ThemeColor = class { constructor(public id: string) {} };

export const RelativePattern = class {
  constructor(public base: unknown, public pattern: string) {}
};

export const Range = class {
  constructor(public start: unknown, public end: unknown) {}
};

export const Position = class {
  constructor(public line: number, public character: number) {}
};

export const Selection = class {
  constructor(public anchor: unknown, public active: unknown) {}
};

export default {};
