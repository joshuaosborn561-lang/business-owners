#!/usr/bin/env node
/**
 * Streamable HTTP MCP server for Claude web / Claude Desktop custom connectors.
 *
 * Claude connector URL: https://<host>/mcp
 */
import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireApiKey, VERSION } from "./api.js";
import { createMcpServer, TOOLS } from "./server.js";

requireApiKey();

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const MCP_PATH = "/mcp";

function publicBase(req: Request): string {
  const proto = (req.get("x-forwarded-proto") || req.protocol || "https").split(",")[0];
  const host = req.get("x-forwarded-host") || req.get("host") || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function applyCors(req: Request, res: Response): void {
  const origin = req.get("origin");
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID"
  );
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "permitstack-mcp",
    version: VERSION,
    tools: TOOLS.length,
    mcp: MCP_PATH,
  });
});

app.get("/", (req, res) => {
  const base = publicBase(req);
  const mcpUrl = `${base}${MCP_PATH}`;
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PermitStack MCP</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; background: #0b1220; color: #e8eefc; }
    main { max-width: 720px; margin: 48px auto; padding: 0 24px; }
    a { color: #8cb4ff; }
    code, .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .url { display: block; background: #151d2e; border: 1px solid #2a3a5a; border-radius: 10px; padding: 14px 16px; word-break: break-all; }
    li { margin: 8px 0; }
  </style>
</head>
<body>
  <main>
    <h1>PermitStack MCP</h1>
    <p>Remote MCP for Claude web. ${TOOLS.length} tools covering every PermitStack API call.</p>
    <p>Paste this HTTPS URL into Claude → Customize → Connectors → Add custom connector:</p>
    <p class="url">${mcpUrl}</p>
    <ol>
      <li>Open <a href="https://claude.ai/settings/connectors">claude.ai/settings/connectors</a></li>
      <li>Click <strong>Add custom connector</strong></li>
      <li>Name it <code>PermitStack</code> and paste the URL above</li>
      <li>Click Add, then start a new chat and enable the connector</li>
    </ol>
    <p>Health: <a href="/health">/health</a></p>
  </main>
</body>
</html>`);
});

app.post(MCP_PATH, async (req, res) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP POST error:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get(MCP_PATH, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "This MCP server uses Streamable HTTP. POST JSON-RPC to /mcp.",
    },
    id: null,
  });
});

app.delete(MCP_PATH, (_req, res) => {
  res.status(405).end();
});

app.listen(PORT, HOST, () => {
  console.error(
    `PermitStack MCP v${VERSION} listening on http://${HOST}:${PORT}${MCP_PATH} (${TOOLS.length} tools)`
  );
});
