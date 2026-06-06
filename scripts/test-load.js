const Module = require('module');
const path = require('path');

// Mock vscode module
const mockVscode = {
  window: {
    createOutputChannel: () => ({ appendLine: console.log }),
    createStatusBarItem: () => ({ show: () => {} }),
    registerTreeDataProvider: () => {},
    onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
    visibleTextEditors: []
  },
  languages: {
    createDiagnosticCollection: () => ({ clear: () => {}, set: () => {} }),
    registerCodeActionsProvider: () => ({ dispose: () => {} })
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} })
  },
  workspace: {
    getConfiguration: () => ({
      get: (key, defaultValue) => defaultValue,
      update: () => Promise.resolve()
    }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidOpenTextDocument: () => ({ dispose: () => {} }),
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    textDocuments: []
  },
  EventEmitter: class {
    constructor() {
      this.event = () => {};
    }
    fire() {}
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Range: class {
    constructor(start, end) {
      this.start = start;
      this.end = end;
    }
  },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  StatusBarAlignment: { Right: 1, Left: 2 },
  ViewColumn: { One: 1, Two: 2 },
  CodeActionKind: { QuickFix: { value: 'quickfix' } },
  ThemeColor: class {},
  ThemeIcon: class {}
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

try {
  console.log('Attempting to load extension...');
  const ext = require('../vscode-extension/out/extension.js');
  console.log('Extension loaded successfully!');
  
  const mockContext = {
    subscriptions: [],
    secrets: {
      get: () => Promise.resolve(''),
      store: () => Promise.resolve(),
      delete: () => Promise.resolve()
    },
    asAbsolutePath: (p) => p,
    extensionPath: path.resolve(__dirname, '..')
  };
  
  console.log('Attempting to activate...');
  ext.activate(mockContext).then(() => {
    console.log('Extension activated successfully in mock!');
  }).catch(err => {
    console.error('Activation failed:', err);
  });
} catch (err) {
  console.error('Failed to load extension:', err);
}
