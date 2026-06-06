const { execSync } = require('child_process');
const Module = require('module');
const fs = require('fs');
const path = require('path');

// Read .env file
const dotenvPath = path.join(__dirname, '../.env');
if (fs.existsSync(dotenvPath)) {
  const content = fs.readFileSync(dotenvPath, 'utf8');
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      process.env[key] = val;
    }
  });
}

// Current enabled provider list (mocked config)
let mockProviders = ['google', 'groq'];

// Intercept require('vscode')
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      workspace: {
        getConfiguration: (section) => ({
          get: (key, defaultValue) => {
            if (key === 'providers') return mockProviders;
            const envKey = `TAINTFLOW_${section ? section.toUpperCase() + '_' : ''}${key.toUpperCase().replace(/\./g, '_')}`;
            const envVal = process.env[envKey];
            if (envVal !== undefined) {
              try { return JSON.parse(envVal); } catch { return envVal; }
            }
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

// Compile core engine
try {
  execSync('npx tsc src/taintflow-core.ts --module CommonJS --outDir out --ignoreDeprecations 6.0 --ignoreConfig', { stdio: 'inherit' });
} catch (err) {}

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

const testCode = `
// Potential Vulnerability Test
const password = "my-secret-password-123";
console.log(password); // hardcoded secret log
const query = "SELECT * FROM users WHERE id = " + userId; // sql injection
`;

async function runTest(providerId) {
  console.log(`\n======================================================`);
  console.log(`Testing with Provider: ${providerId.toUpperCase()}`);
  console.log(`======================================================`);
  
  const engine = new TaintFlowEngine(mockContext, mockOutputChannel);
  await engine.initialize();
  
  // Stop reconnection check timer to avoid background processes running forever
  if (engine.apiCheckInterval) {
    clearInterval(engine.apiCheckInterval);
  }
  
  if (providerId === 'ollama') {
    engine.isCurrentlyUsingOllama = true;
  } else {
    mockProviders = [providerId];
    engine.isCurrentlyUsingOllama = false;
  }
  
  // Trigger active model update
  await engine.updateActiveModel();
  console.log(`Active Model Mode: ${engine.activeModel}`);
  
  try {
    const findings = await engine.analyzeCode(testCode, 'test-file.js');
    console.log(`\nFindings detected: ${findings.length}`);
    findings.forEach((f, idx) => {
      console.log(`  [${idx + 1}] ${f.severity.toUpperCase()}: ${f.message} (Line ${f.lineStart}) [Source: ${f.source}]`);
    });
  } catch (err) {
    console.error(`Error during analysis: ${err.message || err}`);
  }
}

async function run() {
  // Test Ollama
  await runTest('ollama');
  
  // Test Gemini (Google)
  await runTest('google');
  
  // Test Groq
  await runTest('groq');
}

run().catch(console.error);
