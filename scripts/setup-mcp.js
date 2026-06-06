#!/usr/bin/env node
/**
 * TaintFlow+ MCP Setup Script
 * Configures the single shared MCP server for ALL IDEs:
 *   - Antigravity (Google Gemini IDE)
 *   - Cursor
 *   - VS Code (MCP via settings.json)
 *   - Any other MCP-compatible IDE
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ─── Paths ────────────────────────────────────────────────────────────────────
const ROOT_DIR = path.resolve(__dirname, '..');
const MCP_SERVER_DIR = path.join(ROOT_DIR, 'mcp-server');
const MCP_SERVER_JS = path.join(MCP_SERVER_DIR, 'dist', 'mcp-server', 'index.js');
const ENV_FILE = path.join(ROOT_DIR, '.env');

// ─── Load API keys from .env ──────────────────────────────────────────────────
function loadEnvKeys() {
  const keys = {};
  if (!fs.existsSync(ENV_FILE)) {
    console.warn('  ⚠  .env file not found. API keys will be empty in MCP config.');
    return keys;
  }
  const lines = fs.readFileSync(ENV_FILE, 'utf-8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.+)\s*$/);
    if (match) {
      keys[match[1]] = match[2].trim();
    }
  }
  return keys;
}

// ─── Build MCP server if needed ──────────────────────────────────────────────
function buildMcpServer() {
  if (fs.existsSync(MCP_SERVER_JS)) {
    console.log('  ✔  MCP server already built.');
    return;
  }
  console.log('  ⚙  Building MCP server...');
  try {
    execSync('npm install', { cwd: MCP_SERVER_DIR, stdio: 'inherit' });
    execSync('npm run build', { cwd: MCP_SERVER_DIR, stdio: 'inherit' });
    console.log('  ✔  MCP server built successfully.');
  } catch (err) {
    console.error('  ✖  Failed to build MCP server:', err.message);
    console.error('     Run manually: cd mcp-server && npm install && npm run build');
    process.exit(1);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath, data) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

// ─── Shared MCP server entry ──────────────────────────────────────────────────
function makeMcpEntry(envKeys) {
  return {
    command: 'node',
    args: [MCP_SERVER_JS.replace(/\\/g, '/')],
    env: {
      GROQ_API_KEY: envKeys['GROQ_API_KEY'] || envKeys['TAINTFLOW_GROQ_API_KEY'] || '',
      TAINTFLOW_GROQ_API_KEY: envKeys['TAINTFLOW_GROQ_API_KEY'] || envKeys['GROQ_API_KEY'] || '',
      GOOGLE_API_KEY: envKeys['GOOGLE_API_KEY'] || envKeys['TAINTFLOW_GOOGLE_API_KEY'] || '',
      TAINTFLOW_GOOGLE_API_KEY: envKeys['TAINTFLOW_GOOGLE_API_KEY'] || envKeys['GOOGLE_API_KEY'] || '',
      ANTHROPIC_API_KEY: envKeys['ANTHROPIC_API_KEY'] || envKeys['TAINTFLOW_ANTHROPIC_API_KEY'] || '',
      TAINTFLOW_ANTHROPIC_API_KEY: envKeys['TAINTFLOW_ANTHROPIC_API_KEY'] || envKeys['ANTHROPIC_API_KEY'] || '',
    }
  };
}

// ─── 1. Antigravity ───────────────────────────────────────────────────────────
function configureAntigravity(envKeys) {
  const antigravityConfigDir = path.join(os.homedir(), '.gemini', 'antigravity');
  const configPath = path.join(antigravityConfigDir, 'mcp_config.json');

  const config = readJson(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  delete config.mcpServers['veribuild'];
  config.mcpServers['taintflow'] = makeMcpEntry(envKeys);

  writeJson(configPath, config);
  console.log(`  ✔  Antigravity: ${configPath}`);
}

// ─── 2. Cursor (project-scoped) ───────────────────────────────────────────────
function configureCursor(envKeys) {
  // Project-level .cursor/mcp.json
  const cursorDir = path.join(ROOT_DIR, '.cursor');
  const configPath = path.join(cursorDir, 'mcp.json');

  const config = readJson(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  delete config.mcpServers['veribuild'];
  config.mcpServers['taintflow'] = makeMcpEntry(envKeys);

  writeJson(configPath, config);
  console.log(`  ✔  Cursor (project): ${configPath}`);

  // Global ~/.cursor/mcp.json
  const globalCursorDir = path.join(os.homedir(), '.cursor');
  const globalConfigPath = path.join(globalCursorDir, 'mcp.json');

  const globalConfig = readJson(globalConfigPath);
  if (!globalConfig.mcpServers) globalConfig.mcpServers = {};
  delete globalConfig.mcpServers['veribuild'];
  globalConfig.mcpServers['taintflow'] = makeMcpEntry(envKeys);

  writeJson(globalConfigPath, globalConfig);
  console.log(`  ✔  Cursor (global): ${globalConfigPath}`);
}

// ─── 3. VS Code (workspace MCP via settings) ─────────────────────────────────
function configureVSCode(envKeys) {
  // VS Code 1.99+ supports MCP via .vscode/mcp.json
  const vscodeDir = path.join(ROOT_DIR, '.vscode');
  const configPath = path.join(vscodeDir, 'mcp.json');

  const config = readJson(configPath);
  if (!config.servers) config.servers = {};
  delete config.servers['veribuild'];
  // VS Code uses slightly different format ("servers" not "mcpServers")
  config.servers['taintflow'] = {
    type: 'stdio',
    command: 'node',
    args: [MCP_SERVER_JS.replace(/\\/g, '/')],
    env: makeMcpEntry(envKeys).env
  };

  writeJson(configPath, config);
  console.log(`  ✔  VS Code (MCP): ${configPath}`);
}

// ─── 4. Update project .cursor/mcp.json for Windsurf / generic MCP hosts ─────
function configureWindsurf(envKeys) {
  // Windsurf uses ~/.codeium/windsurf/mcp_config.json
  const windsurfDir = path.join(os.homedir(), '.codeium', 'windsurf');
  const configPath = path.join(windsurfDir, 'mcp_config.json');

  const config = readJson(configPath);
  if (!config.mcpServers) config.mcpServers = {};
  delete config.mcpServers['veribuild'];
  config.mcpServers['taintflow'] = makeMcpEntry(envKeys);

  writeJson(configPath, config);
  console.log(`  ✔  Windsurf: ${configPath}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('\n🔨 TaintFlow+ MCP Setup — Cross-IDE Configuration\n');
  console.log('  MCP Server:', MCP_SERVER_JS);
  console.log('');

  // Step 1: Build the server
  console.log('Step 1: Checking MCP server build...');
  buildMcpServer();
  console.log('');

  // Step 2: Load API keys
  console.log('Step 2: Loading API keys from .env...');
  const envKeys = loadEnvKeys();
  const keyNames = Object.keys(envKeys).filter(k => envKeys[k]);
  console.log(`  Found ${keyNames.length} key(s): ${keyNames.join(', ')}`);
  console.log('');

  // Step 3: Configure each IDE
  console.log('Step 3: Writing MCP configuration to all IDEs...');
  configureAntigravity(envKeys);
  configureCursor(envKeys);
  configureVSCode(envKeys);
  configureWindsurf(envKeys);
  console.log('');

  // Done
  console.log('✅ All IDEs configured! The SAME MCP server now serves:');
  console.log('   • Antigravity (Google Gemini IDE)');
  console.log('   • Cursor (project + global)');
  console.log('   • VS Code (workspace MCP)');
  console.log('   • Windsurf (if installed)');
  console.log('');
  console.log('📝 Next steps:');
  console.log('   1. Restart each IDE to pick up the new MCP config');
  console.log('   2. In Cursor: Settings → Tools & MCP → verify "taintflow" is green');
  console.log('   3. In Antigravity: MCP Store → verify "taintflow" is connected');
  console.log('   4. VS Code: install the .vsix for the sidebar/inline UI');
  console.log('');
  console.log('💡 To update API keys, edit .env and re-run: node scripts/setup-mcp.js');
}

main();
