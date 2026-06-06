import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";

import { TaintFlowEngine, SecretStorage, Settings } from "../core/taintflow-engine.js";

class EnvSecretStorage implements SecretStorage {
  async get(key: string): Promise<string | undefined> {
    const cleanKey = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase() + '_API_KEY';
    return process.env[cleanKey] || process.env[cleanKey.replace('TAINTFLOW_', '')];
  }
  async store(key: string, value: string): Promise<void> {
    const cleanKey = key.replace('taintflow.', '').replace('.api_key', '').toUpperCase() + '_API_KEY';
    process.env[cleanKey] = value;
  }
}

class EnvSettings implements Settings {
  get<T>(key: string, defaultValue?: T): T {
    const envValName = key.replace(/\./g, '_').toUpperCase();
    if (process.env[envValName] !== undefined) {
      return process.env[envValName] as any;
    }
    if (key === 'providers') {
      return { google: true, groq: true, anthropic: true } as any;
    }
    if (key.endsWith('.priority')) {
      const provider = key.split('.')[0];
      if (provider === 'google') return 10 as any;
      if (provider === 'groq') return 20 as any;
      if (provider === 'anthropic') return 30 as any;
    }
    return defaultValue as T;
  }
}

const loggerShim = {
  appendLine: (msg: string) => {
    console.error(`[TaintFlow+ MCP] ${msg}`);
  }
};

const engine = new TaintFlowEngine(new EnvSecretStorage(), new EnvSettings(), loggerShim);

const server = new Server(
  {
    name: "taintflow-mcp",
    version: "1.0.8",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "verify_code",
        description: "Verify AI-generated code for security vulnerabilities and code quality issues",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "The source code to analyze"
            },
            filePath: {
              type: "string",
              description: "Optional file path or name (e.g. index.js) to assist with context"
            }
          },
          required: ["code"]
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "verify_code") {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
  }

  const { code, filePath } = request.params.arguments as { code: string; filePath?: string };
  if (!code) {
    throw new McpError(ErrorCode.InvalidParams, "Missing required argument 'code'");
  }

  try {
    await engine.initialize();
    const findings = await engine.analyzeCode(code, filePath || "temporary-file.ts");

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(findings, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: error.message || String(error) }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("TaintFlow+ MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});
