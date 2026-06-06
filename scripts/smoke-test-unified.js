const path = require('path');
const fs = require('fs');

// Import compiled taintflow-engine.js
const { TaintFlowEngine } = require('../vscode-extension/out/core/taintflow-engine.js');

const mockSecretStorage = {
  get: async (key) => {
    const cleanKey = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase() + '_API_KEY';
    return process.env[cleanKey] || process.env[cleanKey.replace('TAINTFLOW_', '')];
  },
  store: async (key, value) => {}
};

const mockSettings = {
  get: (key, defaultValue) => {
    if (key === 'providers') return { google: true, groq: true, anthropic: true };
    return defaultValue;
  }
};

const mockLogger = {
  appendLine: (msg) => console.log(`[Engine Log] ${msg}`)
};

async function run() {
  console.log("Initializing TaintFlow+ Engine...");
  const engine = new TaintFlowEngine(mockSecretStorage, mockSettings, mockLogger);
  await engine.initialize();

  const testCode = `
    const password = "my-secret-password-123";
    console.log(password); // hardcoded log
    
    const query = "SELECT * FROM users WHERE id = " + userId; // sql injection
    
    element.innerHTML = "<div>" + userInput + "</div>"; // xss
    
    eval("const test = 1;"); // eval usage
  `;

  console.log("\nRunning static analysis on Javascript code...");
  const staticFindings = engine.analyzeCodeStatic(testCode, 'smoke-test-file.js');
  console.log(`Static Findings found: ${staticFindings.length}`);
  staticFindings.forEach((f, idx) => {
    console.log(`[${idx + 1}] [${f.source}] ${f.severity.toUpperCase()}: ${f.message} (Line ${f.lineStart})`);
  });

  const pyCode = `
import os
def run_command(cmd):
    os.system("ping " + cmd)
    eval("print(1)")
  `;

  console.log("\nRunning static analysis on Python code...");
  const pyFindings = engine.analyzeCodeStatic(pyCode, 'smoke-test-file.py');
  console.log(`Python Findings found: ${pyFindings.length}`);
  pyFindings.forEach((f, idx) => {
    console.log(`[${idx + 1}] [${f.source}] ${f.severity.toUpperCase()}: ${f.message} (Line ${f.lineStart})`);
  });

  engine.dispose();
  console.log("\nSmoke test passed successfully!");
}

run().catch(err => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
