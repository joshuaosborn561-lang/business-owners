import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createBusinessOwnersMcpServer, healthPayload } from './createServer.js';

/**
 * Optional shared-secret gate for /mcp. Off unless MCP_AUTH_TOKEN is set (existing behavior).
 * Accepts `Authorization: Bearer <token>` or `?key=<token>` (for connectors that only take a URL).
 * Table jobs spend vendor money and write to Supabase, so set it on any internet-facing deployment.
 */
export function mcpAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.MCP_AUTH_TOKEN?.trim();
  if (!expected) return next();
  const header = String(req.headers.authorization || '');
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  const q = typeof req.query.key === 'string' ? req.query.key : '';
  const ok = (given: string) => {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };
  if ((bearer && ok(bearer)) || (q && ok(q))) return next();
  res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null });
}

/**
 * Mount Streamable HTTP MCP at /mcp for Claude / Cursor remote connectors.
 * Stateful sessions (mcp-session-id) + GET SSE.
 */
export function mountMcpHttp(app: Express): void {
  const transports: Record<string, StreamableHTTPServerTransport> = {};

  const cleanupTransport = async (sessionId: string) => {
    const transport = transports[sessionId];
    if (!transport) return;
    delete transports[sessionId];
    try {
      await transport.close();
    } catch (err) {
      console.warn('[mcp http] transport close failed', sessionId, err);
    }
  };

  app.post('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const sessionIdHeader = req.headers['mcp-session-id'];
      const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

      let transport: StreamableHTTPServerTransport | undefined;

      if (sessionId && transports[sessionId]) {
        transport = transports[sessionId];
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (id) => {
            console.log('[mcp http] session initialized', id);
            transports[id] = transport!;
          },
        });

        transport.onclose = () => {
          const id = transport?.sessionId;
          if (id && transports[id]) {
            delete transports[id];
            console.log('[mcp http] session closed', id);
          }
        };

        const server = createBusinessOwnersMcpServer();
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided. Send initialize without mcp-session-id first.',
          },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('[mcp http] POST failed', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  app.get('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    if (!sessionId || !transports[sessionId]) {
      res.status(400).json({ error: 'Invalid or missing mcp-session-id for SSE stream' });
      return;
    }

    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      console.error('[mcp http] GET SSE failed', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'MCP SSE stream failed' });
      }
    }
  });

  app.delete('/mcp', mcpAuthMiddleware, async (req: Request, res: Response) => {
    const sessionIdHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionIdHeader) ? sessionIdHeader[0] : sessionIdHeader;

    if (!sessionId || !transports[sessionId]) {
      res.status(404).json({ error: 'Unknown session' });
      return;
    }

    try {
      await transports[sessionId].handleRequest(req, res);
    } catch (err) {
      console.error('[mcp http] DELETE failed', err);
    } finally {
      await cleanupTransport(sessionId);
    }
  });

  const health = (_req: Request, res: Response) => {
    res.json({
      ...healthPayload(),
      transport: 'streamable-http',
      path: '/mcp',
      authRequired: Boolean(process.env.MCP_AUTH_TOKEN?.trim()),
      sessionMode: 'stateful',
      supportsGetSse: true,
      enableJsonResponse: true,
      activeSessions: Object.keys(transports).length,
    });
  };

  app.get('/mcp/health', health);
}
