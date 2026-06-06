import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { TaintFlowEngine } from "../core/taintflow-engine.js";

// ── Secret storage: reads from env + .env file ────────────────────────────────
class EnvSecretStorage {
  private dotenv: Record<string, string> = {};

  constructor() {
    const candidates = [
      path.join(process.cwd(), '.env'),
      path.join(path.dirname(path.dirname(__dirname)), '.env'), // dist/mcp-server -> root
      'D:\\TaintFlow+\\.env',
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          for (const line of content.split(/\r?\n/)) {
            const eq = line.indexOf('=');
            if (eq > 0) {
              const k = line.slice(0, eq).trim();
              const v = line.slice(eq + 1).trim();
              if (k && v) this.dotenv[k] = v;
            }
          }
          console.error(`[TaintFlow+ MCP] Loaded .env from ${p}`);
          break;
        }
      } catch {}
    }
  }

  async get(key: string): Promise<string | undefined> {
    const provider = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase();
    const names = [`TAINTFLOW_${provider}_API_KEY`, `${provider}_API_KEY`];
    for (const name of names) {
      const val = process.env[name] || this.dotenv[name];
      if (val && val.trim()) return val.trim();
    }
    return undefined;
  }

  async store(key: string, value: string): Promise<void> {
    const provider = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase();
    process.env[`TAINTFLOW_${provider}_API_KEY`] = value;
  }
}

// ── Settings: provider priorities ────────────────────────────────────────────
class EnvSettings {
  get<T>(key: string, defaultValue?: T): T {
    if (key === 'providers') return { google: true, groq: true, anthropic: true } as any;
    if (key === 'autoVerify') return true as any;
    if (key.endsWith('.priority')) {
      const provider = key.split('.')[0];
      if (provider === 'google') return 10 as any;
      if (provider === 'groq') return 20 as any;
      if (provider === 'anthropic') return 30 as any;
    }
    return defaultValue as T;
  }
}

const logger = { appendLine: (msg: string) => console.error(`[TaintFlow+ MCP] ${msg}`) };
const engine = new TaintFlowEngine(new EnvSecretStorage(), new EnvSettings(), logger);

engine.initialize().catch(err => console.error('[TaintFlow+ MCP] Init error:', err));

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "taintflow-mcp", version: "1.0.9" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "verify_code",
    description: "Verify AI-generated code for security vulnerabilities and code quality issues",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The source code to analyze" },
        filePath: { type: "string", description: "Optional file path (e.g. index.js) for context" }
      },
      required: ["code"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "verify_code") {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }
  const { code, filePath } = request.params.arguments as { code: string; filePath?: string };
  if (!code) throw new McpError(ErrorCode.InvalidParams, "Missing required argument 'code'");

  try {
    const findings = await engine.analyzeCode(code, filePath || "unnamed-file.ts");
    const summary = findings.length === 0 ? "✅ No vulnerabilities found." : `⚠️ Found ${findings.length} issue(s).`;
    return { content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(findings, null, 2)}` }] };
  } catch (error: any) {
    return { content: [{ type: "text", text: JSON.stringify({ error: error.message || String(error) }) }], isError: true };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TaintFlow+ MCP server v1.0.9 running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
