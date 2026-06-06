const { execSync } = require('child_process');
const Module = require('module');
const fs = require('fs');
const path = require('path');

// Intercept require('vscode') and return mock implementation
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      workspace: {
        getConfiguration: (section) => ({
          get: (key, defaultValue) => {
            const envKey = `TAINTFLOW_${section ? section.toUpperCase() + '_' : ''}${key.toUpperCase().replace(/\./g, '_')}`;
            const envVal = process.env[envKey];
            if (envVal !== undefined) {
              try { return JSON.parse(envVal); } catch { return envVal; }
            }
            if (key === 'providers') return ['openai', 'anthropic', 'google', 'groq'];
            return defaultValue;
          }
        })
      },
      commands: {
        executeCommand: async () => {}
      },
      window: {
        createOutputChannel: () => ({
          appendLine: () => {}
        })
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

// Compile taintflow-core.ts to CommonJS for script environment compatibility
try {
  execSync('npx tsc src/taintflow-core.ts --module CommonJS --outDir out --ignoreDeprecations 6.0 --ignoreConfig', { stdio: 'inherit' });
} catch (err) {
  // Ignored
}

const { TaintFlowEngine } = require('../out/taintflow-core.js');

const mockContext = {
  secrets: {
    get: async (key) => {
      const envKey = key.toUpperCase().replace(/\./g, '_');
      return process.env[envKey] || process.env[envKey.replace('TAINTFLOW_', '')];
    },
    store: async () => {},
    delete: async () => {}
  }
};

const mockOutputChannel = {
  appendLine: (value) => console.log(`[Engine Log] ${value}`)
};

async function run() {
  const engine = new TaintFlowEngine(mockContext, mockOutputChannel);
  await engine.initialize();

  // Read test-json.json
  const filePath = path.join(__dirname, '../test-json.json');
  const code = fs.readFileSync(filePath, 'utf-8');

  console.log("Running TaintFlow+ engine analysis on JSON file...");
  const findings = await engine.analyzeCode(code, 'package.json', 'json');
  
  console.log("\n--- Verification Report ---");
  if (findings.length === 0) {
    console.log("❌ No findings detected (Verify static analysis regexes in src/taintflow-core.ts)");
  } else {
    console.log(`✅ Success! Detected ${findings.length} findings:`);
    findings.forEach((f, idx) => {
      console.log(`[${idx + 1}] ${f.severity.toUpperCase()}: ${f.message}`);
      console.log(`    Lines: ${f.lineStart}-${f.lineEnd} | Source: ${f.source} | Confidence: ${f.confidence}`);
      if (f.suggestedFix) {
        console.log(`    Suggested Fix: ${f.suggestedFix}`);
      }
    });
  }
}

run().catch(console.error);
