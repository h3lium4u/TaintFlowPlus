#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Module = require('module');

// 1. Mock 'vscode' module before loading taintflow-core
const originalRequire = Module.prototype.require;
Module.prototype.require = function(id) {
  if (id === 'vscode') {
    return {
      workspace: {
        getConfiguration: (section) => ({
          get: (key, defaultValue) => {
            if (key === 'providers') return { google: false, groq: false, anthropic: false };
            if (key === 'mode') return 'local';
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

console.log('Compiling taintflow-core.ts...');
try {
  execSync('npx esbuild vscode-extension/src/taintflow-core.ts --bundle --platform=node --target=node18 --external:vscode --outfile=vscode-extension/out/taintflow-core.js', { stdio: 'inherit' });
} catch (err) {
  console.warn('Compilation failed.');
}


const { TaintFlowEngine } = require('../vscode-extension/out/taintflow-core.js');

const mockContext = {
  secrets: {
    get: async () => undefined,
    store: async () => {},
    delete: async () => {}
  }
};

const mockOutputChannel = {
  appendLine: (msg) => {}
};

// Instantiate engine
const engine = new TaintFlowEngine(mockContext, mockOutputChannel);

// Test files configuration
const testFiles = [
  { file: 'test.py', lang: 'python', minExpected: 5 },
  { file: 'test.js', lang: 'javascript', minExpected: 4 },
  { file: 'test.java', lang: 'java', minExpected: 4 },
  { file: 'test.php', lang: 'php', minExpected: 5 },
  { file: 'test.go', lang: 'go', minExpected: 2 },
  { file: 'test.sql', lang: 'sql', minExpected: 3 },
  { file: 'test.rb', lang: 'ruby', minExpected: 6 },
  { file: 'test.rs', lang: 'rust', minExpected: 2 },
  { file: 'test.cs', lang: 'csharp', minExpected: 3 },
  { file: 'test.html', lang: 'html', minExpected: 3 },
  { file: 'test.r', lang: 'r', minExpected: 3 },
  { file: 'test.yaml', lang: 'yaml', minExpected: 3 },
  { file: 'test.cpp', lang: 'cpp', minExpected: 4 },
  { file: 'Dockerfile', lang: 'dockerfile', minExpected: 4 }
];

let failed = false;

async function runTests() {
  console.log('\n==================================================');
  console.log('         TaintFlow+ Engine Unit Test Suite          ');
  console.log('==================================================\n');

  for (const t of testFiles) {
    const filePath = path.join(__dirname, '../test-files', t.file);
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Test file missing: ${filePath}`);
      failed = true;
      continue;
    }

    const code = fs.readFileSync(filePath, 'utf8');
    console.log(`Testing [${t.lang.toUpperCase()}] file: ${t.file}...`);
    
    // Analyze using static analysis engine
    const findings = engine.analyzeCodeStatic(code, filePath, t.lang);
    
    console.log(`  Found ${findings.length} findings (expected at least ${t.minExpected})`);

    // Verify findings structure
    findings.forEach((f, idx) => {
      if (!f.message || !f.severity || !f.lineStart || !f.lineEnd || !f.source) {
        console.error(`  ❌ Finding #${idx+1} has invalid structure:`, f);
        failed = true;
      }
      
      // Basic sanity check that rules don't report on "safe" lines.
      // Most safe patterns are in the second half of the test files (lines > 15).
      if (f.lineStart > 20 && t.lang !== 'ruby' && t.lang !== 'php') {
        // Warning if rules match safe code lines
        console.warn(`  ⚠️ Warning: Finding detected on potential safe section (Line ${f.lineStart}): ${f.message}`);
      }
    });

    if (findings.length < t.minExpected) {
      console.error(`  ❌ Error: Expected at least ${t.minExpected} findings, got ${findings.length}`);
      failed = true;
    } else {
      console.log(`  ✅ Passed ${t.lang.toUpperCase()} pattern matching.`);
    }
    console.log('--------------------------------------------------');
  }

  if (failed) {
    console.error('\n❌ Unit tests failed! Please check pattern regexes.');
    process.exit(1);
  } else {
    console.log('\n🎉 All unit tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner exception:', err);
  process.exit(1);
});
