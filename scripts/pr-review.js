const core = require('@actions/core');
const github = require('@actions/github');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

// Intercept require('vscode') and return mock implementation
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

// Ensure root typescript compilation is done before requiring core module
try {
  core.info('Compiling TypeScript files...');
  execSync('npx tsc src/veribuild-core.ts --module CommonJS --outDir out --ignoreDeprecations 6.0 --ignoreConfig', { stdio: 'inherit' });
} catch (err) {
  core.error('TypeScript compilation warning/error: ' + err.message);
}

async function run() {
  try {
    const { VeriBuildEngine } = require('../out/veribuild-core.js');
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      core.setFailed('Missing GITHUB_TOKEN environment variable');
      return;
    }
    const octokit = github.getOctokit(token);
    const context = github.context;
    
    if (!context.payload.pull_request) {
      core.setFailed('This action can only run on pull_request events');
      return;
    }

    const baseBranch = process.env.GITHUB_BASE_REF || 'main';
    core.info(`Base branch: ${baseBranch}`);

    // Get list of modified files
    const diffOutput = execSync(`git diff origin/${baseBranch}...HEAD --name-only`, { encoding: 'utf8' });
    const files = diffOutput.split('\n').map(f => f.trim()).filter(Boolean);
    core.info(`Modified files: ${files.join(', ')}`);

    // Filter to only include supported source code files
    const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.go', '.rs', '.java', '.cpp', '.h', '.cs', '.php'];
    const codeFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return supportedExtensions.includes(ext) && fs.existsSync(file);
    });

    if (codeFiles.length === 0) {
      core.info('No code files modified in this PR. Skipping analysis.');
      return;
    }

    // Mock VS Code Context for VeriBuildEngine
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
      appendLine: (value) => console.log(`[VeriBuildEngine] ${value}`)
    };

    const engine = new VeriBuildEngine(mockContext, mockOutputChannel);
    await engine.initialize();

    const allFindings = [];

    for (const file of codeFiles) {
      core.info(`Analyzing file: ${file}`);
      const content = fs.readFileSync(file, 'utf8');
      const findings = await engine.analyzeCode(content, file);
      
      for (const finding of findings) {
        allFindings.push({
          file,
          ...finding
        });
      }
    }

    core.info(`Analysis complete. Found ${allFindings.length} findings.`);

    // Build comment body
    let commentBody = '## 🔍 VeriBuild AI Code Quality and Security Analysis\n\n';
    if (allFindings.length === 0) {
      commentBody += '✅ No security or quality issues were identified in the changed files.';
    } else {
      commentBody += '⚠️ The following potential issues were identified:\n\n';
      commentBody += '| File | Line | Severity | Message | Confidence | Source |\n';
      commentBody += '| :--- | :--- | :--- | :--- | :--- | :--- |\n';
      
      for (const f of allFindings) {
        const severityEmoji = f.severity === 'critical' ? '🔴 **CRITICAL**' :
                             f.severity === 'high' ? '🟠 **HIGH**' :
                             f.severity === 'medium' ? '🟡 **MEDIUM**' : '🔵 **LOW**';
        commentBody += `| \`${f.file}\` | ${f.lineStart} | ${severityEmoji} | ${f.message} | \`${f.confidence}\` | \`${f.source}\` |\n`;
      }
      
      commentBody += '\n\n*Please review the findings and apply fixes if necessary.*';
    }

    // Post comment to PR
    const prNumber = context.payload.pull_request.number;
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: commentBody
    });

    core.info('Comment successfully posted on PR');
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
