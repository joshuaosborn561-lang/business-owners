import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { callPermitStack, requireApiKey, VERSION } from "./api.js";
import type { JsonSchema, OpsFile, ToolOp } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

function loadOps(): ToolOp[] {
  const raw = readFileSync(join(here, "openapi-ops.json"), "utf8");
  const parsed = JSON.parse(raw) as OpsFile;
  return parsed.ops;
}

export const TOOLS: ToolOp[] = loadOps();

function toInputSchema(op: ToolOp): {
  type: "object";
  properties: Record<string, JsonSchema>;
  required?: string[];
} {
  const properties: Record<string, JsonSchema> = {};
  for (const [name, schema] of Object.entries(op.properties)) {
    const copy: JsonSchema = { ...schema };
    if (!copy.type && !copy.enum && !copy.properties) {
      copy.type = "string";
    }
    properties[name] = copy;
  }
  const schema: {
    type: "object";
    properties: Record<string, JsonSchema>;
    required?: string[];
  } = { type: "object", properties };
  if (op.required.length) schema.required = op.required;
  return schema;
}

export function createMcpServer(): Server {
  const apiKey = requireApiKey();
  const server = new Server(
    { name: "permitstack", version: VERSION },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((op) => ({
      name: op.name,
      description: [
        op.alias_of ? `Alias of ${op.alias_of}. ` : "",
        op.description || op.summary,
        ` [${op.method} ${op.path}]`,
      ].join(""),
      inputSchema: toInputSchema(op),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    const result = await callPermitStack(
      tool,
      (args ?? {}) as Record<string, unknown>,
      apiKey
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}
