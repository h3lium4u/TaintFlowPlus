const { execSync } = require('child_process');
const Module = require('module');

// 1. Intercept require('vscode') and return mock implementation
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      workspace: {
        getConfiguration: (section) => ({
          get: (key, defaultValue) => {
            const envKey = `VERIBUILD_${section ? section.toUpperCase() + '_' : ''}${key.toUpperCase().replace(/\./g, '_')}`;
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

// 2. Compile veribuild-core.ts to CommonJS for script environment compatibility
try {
  console.log('Compiling veribuild-core.ts...');
  execSync('npx tsc src/veribuild-core.ts --module CommonJS --outDir out --ignoreDeprecations 6.0 --ignoreConfig', { stdio: 'inherit' });
} catch (err) {
  console.warn('Compilation warnings/errors encountered.');
}

const { VeriBuildEngine } = require('../out/veribuild-core.js');

const mockContext = {
  secrets: {
    get: async (key) => {
      const envKey = key.toUpperCase().replace(/\./g, '_');
      return process.env[envKey] || process.env[envKey.replace('VERIBUILD_', '')];
    },
    store: async () => {},
    delete: async () => {}
  }
};

const mockOutputChannel = {
  appendLine: (value) => console.log(`[Engine Log] ${value}`)
};

async function run() {
  const engine = new VeriBuildEngine(mockContext, mockOutputChannel);
  await engine.initialize();

  const testCode = `
    const password = "my-secret-password-123";
    console.log(password); // hardcoded log
    
    const query = "SELECT * FROM users WHERE id = " + userId; // sql injection
    
    element.innerHTML = "<div>" + userInput + "</div>"; // xss
    
    eval("const test = 1;"); // eval usage
  `;

  console.log("Running VeriBuild engine analysis...");
  const findings = await engine.analyzeCode(testCode, 'smoke-test-file.js');
  
  console.log("\n--- Verification Report ---");
  if (findings.length === 0) {
    console.log("❌ No findings detected (Verify static analysis regexes in src/veribuild-core.ts)");
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
