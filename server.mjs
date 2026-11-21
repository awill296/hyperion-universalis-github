import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { prices, listings, sales } from './market.mjs';
import { pathToFileURL } from 'node:url';

const item = z.number().int().min(1).max(2147483647);
export function makeServer() {
  const server = new McpServer({ name: 'hyperion-universalis', version: '1.0.0' });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  for (const [name, description, inputSchema, action] of [
    ['get_prices', 'Get asking-price summaries for 1–10 known FFXIV item IDs on Hyperion. No item-name search or profit forecast.',
      z.object({ item_ids: z.array(item).min(1).max(10).refine(ids => new Set(ids).size === ids.length, 'IDs must be unique') }).strict(), prices],
    ['get_listings', 'Get bounded current Hyperion listings, optionally NQ or HQ. Includes snapshot timestamps; not full supply.',
      z.object({ item_id: item, limit: z.number().int().min(1).max(50).default(20), quality: z.enum(['all', 'nq', 'hq']).default('all') }).strict(), listings],
    ['get_recent_sales', 'Get Hyperion sale history and observed units/transactions per day over a fixed window. Capped, crowdsourced; not guaranteed demand.',
      z.object({ item_id: item, days: z.number().int().min(1).max(30).default(7), limit: z.number().int().min(1).max(1000).default(500) }).strict(), sales]
  ]) {
    server.registerTool(name, { description, inputSchema, annotations }, async args => {
      try {
        const data = await action(args);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      } catch (error) {
        const message = error.name === 'TimeoutError' ? 'Universalis timed out after 10 seconds.' : error.message;
        return { isError: true, content: [{ type: 'text', text: message }] };
      }
    });
  }
  return server;
}

export function makeApp({ publicUrl = process.env.PUBLIC_URL } = {}) {
  const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  const allowedOrigins = new Set();
  if (publicUrl) {
    const u = new URL(publicUrl);
    if (u.protocol !== 'https:' || u.pathname !== '/' || u.username || u.password) throw new Error('PUBLIC_URL must be an HTTPS origin without path or credentials.');
    allowedHosts.add(u.hostname);
    allowedOrigins.add(u.origin);
  }
  const app = express();
  app.disable('x-powered-by');
  // Do not trust forwarded headers: host must be preserved by the hosting proxy.
  app.use((req, res, next) => {
    if (!allowedHosts.has(req.hostname)) return res.status(403).end('Host rejected');
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) return res.status(403).end('Origin rejected');
    next();
  });
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  let requests = [];
  let active = 0;
  app.use('/mcp', (req, res, next) => {
    const now = Date.now();
    requests = requests.filter(t => now - t < 60_000);
    if (requests.length >= 60 || active >= 8) return res.status(429).set('Retry-After', '60').end('Server busy; retry later');
    requests.push(now); active++;
    res.once('close', () => active--);
    next();
  });
  app.use(express.json({ limit: '16kb', strict: true }));
  app.post('/mcp', async (req, res) => {
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.once('close', () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
    }
  });
  app.all('/mcp', (_req, res) => res.status(405).set('Allow', 'POST').end());
  app.use((err, _req, res, _next) => res.status(err.status === 413 ? 413 : 400).json({ error: 'Invalid or oversized JSON body' }));
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const listener = makeApp().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('Hyperion MCP listening'));
  listener.requestTimeout = 15_000;
  listener.headersTimeout = 10_000;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => listener.close());
}
