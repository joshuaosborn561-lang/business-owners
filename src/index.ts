#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireApiKey, VERSION } from "./api.js";
import { createMcpServer } from "./server.js";

requireApiKey();

const server = createMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`PermitStack MCP server v${VERSION} running on stdio`);
