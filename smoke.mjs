import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { makeApp } from './server.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// With no URL, test an ephemeral local server against the REAL public Universalis API.
const listener = process.env.MCP_URL ? null : makeApp().listen(0, '127.0.0.1');
if (listener) await new Promise(resolve => listener.once('listening', resolve));
const url = process.env.MCP_URL || `http://127.0.0.1:${listener.address().port}/mcp`;
const client = new Client({ name: 'hyperion-smoke', version: '1.0.0' });
const report = { testedAt: new Date().toISOString(), target: url, results: [] };
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const tools = await client.listTools();
  assert.equal(tools.tools.length, 3);
  report.tools = tools.tools.map(t => t.name);
  for (const [name, args] of [
    ['get_prices', { item_ids: [2, 3] }],
    ['get_listings', { item_id: 2, limit: 3 }],
    ['get_recent_sales', { item_id: 2, days: 7, limit: 100 }]
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    const data = result.structuredContent;
    assert.equal(data.world, 'Hyperion');
    if (name === 'get_prices') { assert.equal(data.items.length, 2); assert.ok(data.items.every(i => Number.isFinite(i.minUnitPrice))); }
    if (name === 'get_listings') { assert.ok(data.listings.length > 0 && data.listings.length <= 3); }
    if (name === 'get_recent_sales') { assert.ok(data.entries.length > 0); assert.ok(Number.isFinite(data.observedUnitsPerDay)); }
    report.results.push({ tool: name, arguments: args, data });
    console.log(`${name}: PASS`);
  }
  const invalid = await client.callTool({ name: 'get_listings', arguments: { item_id: '../tax-rates' } });
  assert.equal(invalid.isError, true);
  report.invalidInputRejected = true;
  await writeFile('smoke-result.json', JSON.stringify(report, null, 2));
} finally {
  await client.close();
  if (listener) await new Promise(resolve => listener.close(resolve));
}
