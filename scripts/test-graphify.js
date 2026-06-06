const fs = require('fs');
const path = require('path');
const Module = require('module');

// Register ts-node to parse TypeScript directly
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    esModuleInterop: true,
    target: 'es2022'
  }
});

// Intercept require('vscode') for mockup
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      workspace: {
        name: 'TaintFlow+-TestProject',
        workspaceFolders: [{ uri: { fsPath: path.resolve(__dirname, '..') } }],
        getConfiguration: () => ({
          get: (key, def) => def
        }),
        findFiles: async () => [
          { fsPath: path.join(__dirname, '../vscode-extension/src/extension.ts') },
          { fsPath: path.join(__dirname, '../vscode-extension/src/state.ts') },
          { fsPath: path.join(__dirname, '../vscode-extension/src/commands/index.ts') }
        ]
      },
      EventEmitter: class {
        constructor() { this.listeners = []; }
        get event() { return (cb) => this.listeners.push(cb); }
        fire(val) { this.listeners.forEach(cb => cb(val)); }
      },
      Disposable: class { dispose() {} }
    };
  }
  return originalRequire.apply(this, arguments);
};

const { RepositoryScanner } = require('../vscode-extension/src/graphify/repository-scanner');
const { ContextGenerator } = require('../vscode-extension/src/graphify/context-generator');
const { SecurityFlowAnalyzer } = require('../vscode-extension/src/graphify/security-flow');
const { GraphBuilder } = require('../vscode-extension/src/graphify/graph-builder');

async function run() {
  console.log('==================================================');
  console.log('            Graphify Integration Test             ');
  console.log('==================================================');

  const scanner = new RepositoryScanner();
  
  // Mock some indexed files in memory
  const memory = scanner.getMemory();
  memory.files = {
    'src/routes/user.ts': {
      id: 'src/routes/user.ts',
      name: 'user.ts',
      type: 'api',
      language: 'typescript',
      path: 'src/routes/user.ts',
      imports: ['../controllers/userController'],
      exports: ['registerUserRoute'],
      metadata: { linesCount: 45 }
    },
    'src/controllers/userController.ts': {
      id: 'src/controllers/userController.ts',
      name: 'userController.ts',
      type: 'service',
      language: 'typescript',
      path: 'src/controllers/userController.ts',
      imports: ['../services/userService'],
      exports: ['UserController'],
      metadata: { linesCount: 110 }
    },
    'src/services/userService.ts': {
      id: 'src/services/userService.ts',
      name: 'userService.ts',
      type: 'service',
      language: 'typescript',
      path: 'src/services/userService.ts',
      imports: ['../db/connection'],
      exports: ['UserService'],
      metadata: { linesCount: 220, isService: true }
    },
    'src/db/connection.ts': {
      id: 'src/db/connection.ts',
      name: 'connection.ts',
      type: 'database',
      language: 'typescript',
      path: 'src/db/connection.ts',
      imports: [],
      exports: ['dbConnection'],
      metadata: { linesCount: 20, isDatabase: true }
    }
  };

  // Build relationships / edges
  memory.edges = [
    { source: 'src/routes/user.ts', target: 'src/controllers/userController.ts', type: 'import' },
    { source: 'src/controllers/userController.ts', target: 'src/services/userService.ts', type: 'import' },
    { source: 'src/services/userService.ts', target: 'src/db/connection.ts', type: 'import' }
  ];

  console.log('\n--- 1. Context Generation Test ---');
  const summaryMarkdown = ContextGenerator.generateRepositorySummary(memory, 'markdown');
  console.log('Generated Repository Summary Markdown:');
  console.log(summaryMarkdown);

  const fileExplanation = ContextGenerator.explainFile(memory, 'src/controllers/userController.ts', 'text');
  console.log('Generated File Explanation:');
  console.log(fileExplanation);

  console.log('\n--- 2. Security Flow & Blast Radius Test ---');
  // Suppose vulnerability is in src/services/userService.ts (SQL injection)
  const attackPath = SecurityFlowAnalyzer.traceAttackPath(
    memory,
    'src/services/userService.ts',
    'SQL Injection',
    'critical',
    42
  );

  console.log('Attack Path Steps:');
  attackPath.steps.forEach((step, index) => {
    console.log(`  Step ${index + 1}: ${step.file} -> ${step.description} (Line: ${step.line || 'any'})`);
  });

  console.log('\nBlast Radius (Impacted Files that depend on service):');
  console.log(attackPath.impactRadius);

  console.log('\n--- 3. Graph Translation Test ---');
  const visualGraph = GraphBuilder.buildVisualGraph(memory, new Set(), ['src/routes/user.ts', 'src/controllers/userController.ts']);
  console.log(`Visual nodes generated: ${visualGraph.nodes.length}`);
  console.log(`Visual edges generated: ${visualGraph.edges.length}`);
  
  const highlightedEdge = visualGraph.edges.find(e => e.type === 'security-path');
  console.log(`Has security-path edge: ${!!highlightedEdge}`);

  console.log('\n✅ Graphify Integration Tests Complete!');
}

run().catch(console.error);
