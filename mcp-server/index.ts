import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from "@modelcontextprotocol/sdk/types.js";
import { VeriBuildEngine } from "../src/veribuild-core.js";

class MockSecretStorage {
  async get(key: string): Promise<string | undefined> {
    const envKey = key.toUpperCase().replace(/\./g, '_');
    return process.env[envKey] || process.env[envKey.replace('VERIBUILD_', '')];
  }
  async store(key: string, value: string): Promise<void> {}
  async delete(key: string): Promise<void> {}
}

const mockSecrets = new MockSecretStorage();
const mockContext: any = {
  secrets: mockSecrets
};

const mockOutputChannel: any = {
  appendLine: (value: string) => {
    console.error(`[VeriBuildEngine] ${value}`);
  }
};

const engine = new VeriBuildEngine(mockContext, mockOutputChannel);

const server = new Server(
  {
    name: "veribuild-mcp",
    version: "1.0.0",
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
  console.error("VeriBuild MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error running MCP server:", error);
  process.exit(1);
});
