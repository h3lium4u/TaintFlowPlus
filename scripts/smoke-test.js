const { execSync } = require('child_process');

try {
  execSync('npx tsc', { stdio: 'inherit' });
} catch (err) {
  console.warn('Compilation finished with warnings or errors.');
}

const { VeriBuildEngine } = require('../out/veribuild-core.js');

const mockContext = {
  secrets: {
    get: async () => undefined,
    store: async () => {},
    delete: async () => {}
  }
};

const mockOutputChannel = {
  appendLine: (value) => console.log(`[Log] ${value}`)
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
