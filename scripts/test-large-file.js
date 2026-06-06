const fs = require('fs');
const path = require('path');
const Module = require('module');

// Read .env file for API testing
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

// Intercept require('vscode') for mockup
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
            return defaultValue;
          }
        })
      },
      commands: { executeCommand: async () => {} },
      window: {
        createOutputChannel: () => ({
          appendLine: (val) => console.log(`[VSCode Log] ${val}`)
        })
      }
    };
  }
  return originalRequire.apply(this, arguments);
};

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

// Generate 2500 lines of Javascript code
function generateLargeFile() {
  const lines = [];
  for (let i = 1; i <= 2500; i++) {
    if (i === 50) {
      lines.push('const secret = "password123"; // Vulnerability 1 (Hardcoded secret)');
    } else if (i === 950) {
      lines.push('const query = "SELECT * FROM users WHERE name = " + input; // Vulnerability 2 (SQL Injection)');
    } else if (i === 1950) {
      lines.push('exec("ping " + ip); // Vulnerability 3 (Command Injection)');
    } else {
      lines.push(`// Line ${i}: Standard safe placeholder code block.`);
    }
  }
  return lines.join('\n');
}

async function main() {
  console.log('==================================================');
  console.log('      TaintFlow+ Large File & Offline Tests        ');
  console.log('==================================================');

  const largeCode = generateLargeFile();

  // Test 1: Testing WITHOUT LLM (Ollama not running, API keys deleted)
  console.log('\n--- TEST 1: NO LLM / OFFLINE STATIC ANALYSIS FALLBACK ---');
  const engineStatic = new TaintFlowEngine(mockContext, mockOutputChannel);
  await engineStatic.initialize();
  
  // Force Mode to API but mock no keys/Ollama to verify static fallback
  engineStatic.getMode = () => 'api';
  engineStatic.orchestrator.callWithFallback = async () => { throw new Error('API Keys not configured / Network error'); };
  
  console.log('Running static-only analysis on 2,500 line file...');
  const t0 = Date.now();
  const staticFindings = await engineStatic.analyzeCode(largeCode, 'large-file.js', 'javascript');
  const t1 = Date.now();
  
  console.log(`Static analysis completed in ${t1 - t0}ms.`);
  console.log(`Findings detected: ${staticFindings.length}`);
  staticFindings.forEach((f, idx) => {
    console.log(`  [${idx + 1}] ${f.severity.toUpperCase()} (Line ${f.lineStart}-${f.lineEnd}): ${f.message}`);
  });

  // Test 2: Testing WITH API LLM (Google or Groq)
  console.log('\n--- TEST 2: ACTIVE API LLM (CHUNKING & OFFSET VERIFICATION) ---');
  if (!process.env.GOOGLE_API_KEY && !process.env.GROQ_API_KEY) {
    console.log('Skipping API test: No API keys configured in .env.');
    return;
  }
  
  const engineAPI = new TaintFlowEngine(mockContext, mockOutputChannel);
  await engineAPI.initialize();
  engineAPI.getMode = () => 'api';
  
  console.log('Running API code chunking analysis on 2,500 line file...');
  const t2 = Date.now();
  const apiFindings = await engineAPI.analyzeCode(largeCode, 'large-file.js', 'javascript');
  const t3 = Date.now();

  console.log(`API analysis completed in ${t3 - t2}ms.`);
  console.log(`Findings detected: ${apiFindings.length}`);
  apiFindings.forEach((f, idx) => {
    console.log(`  [${idx + 1}] ${f.severity.toUpperCase()} (Line ${f.lineStart}-${f.lineEnd}) [Source: ${f.source}]: ${f.message}`);
  });

  console.log('\n✅ Verification tests complete!');
}

main().catch(console.error);
