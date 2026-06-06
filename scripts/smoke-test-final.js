const { spawn } = require('child_process');

const server = spawn('node', ['mcp-server/dist/mcp-server/index.js'], {
  env: { 
    ...process.env, 
    GROQ_API_KEY: process.env.GROQ_API_KEY || '',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || ''
  },
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: 'D:\\TaintFlow+'
});

let stderr = '';
server.stderr.on('data', d => { stderr += d.toString(); });

// MCP initialize
const initMsg = JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '1.0' } }
}) + '\n';
server.stdin.write(initMsg);

// List tools
setTimeout(() => {
  server.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
}, 500);

let output = '';
server.stdout.on('data', d => { output += d.toString(); });

setTimeout(() => {
  server.kill();
  console.log('=== Engine logs (stderr) ===');
  console.log(stderr.trim());
  console.log('\n=== MCP responses (stdout) ===');
  console.log(output.trim());
  const ok = output.includes('verify_code');
  console.log('\n' + (ok ? '✅ MCP server WORKING — verify_code tool is live!' : '❌ verify_code NOT found'));
}, 3000);
