import test from 'node:test';
import assert from 'node:assert/strict';
import { salesSummary, query } from './market.mjs';
import { makeApp } from './server.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import http from 'node:http';

test('velocity uses units and full window, excludes outside-window sales, warns at cap', () => {
  const now = 2_000_000;
  const r = salesSummary([
    { timestamp: now - 1, quantity: 10, pricePerUnit: 20 },
    { timestamp: now - 2, quantity: 2, pricePerUnit: 50 },
    { timestamp: now - 8 * 86400, quantity: 100, pricePerUnit: 1 }
  ], 7, 3, now);
  assert.equal(r.returnedUnits, 12);
  assert.equal(r.observedUnitsPerDay, 12 / 7);
  assert.equal(r.observedTransactionsPerDay, 2 / 7);
  assert.equal(r.quantityWeightedUnitPrice, 25);
  assert.equal(r.possiblyTruncated, true);
  assert.equal(salesSummary([], 7, 100, now).quantityWeightedUnitPrice, null);
});

test('upstream errors remain errors and successful requests cache', async () => {
  await assert.rejects(query('Hyperion/100001', {}, async () => new Response('', { status: 429 })), /429/);
  let count = 0;
  const fetcher = async () => { count++; return new Response('{"itemID":100002}'); };
  await query('Hyperion/100002', {}, fetcher);
  const r = await query('Hyperion/100002', {}, fetcher);
  assert.equal(count, 1);
  assert.equal(r.cacheHit, true);
  await assert.rejects(query('Hyperion/100003', {}, async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    throw new DOMException('Timed out', 'TimeoutError');
  }), /Timed out/);
  await assert.rejects(query('Hyperion/100004', {}, async () => new Response('x'.repeat(2_000_001))), /too large/);
});

test('MCP initializes, lists only read-only tools, rejects unsafe arguments and HTTP requests', async () => {
  const listener = makeApp().listen(0, '127.0.0.1');
  await new Promise(resolve => listener.once('listening', resolve));
  const base = `http://127.0.0.1:${listener.address().port}`;
  const client = new Client({ name: 'test', version: '1' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(base + '/mcp')));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 3);
    assert.ok(tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint));
    for (const [name, args] of [
      ['get_prices', { item_ids: [2, 2] }], ['get_prices', { item_ids: Array(11).fill(2) }],
      ['get_listings', { item_id: '../x' }], ['get_listings', { item_id: 2, limit: 51 }],
      ['get_recent_sales', { item_id: 2, days: 31 }], ['get_recent_sales', { item_id: 2, limit: 1001 }],
      ['get_listings', { item_id: 2, world: 'Other' }]
    ]) assert.equal((await client.callTool({ name, arguments: args })).isError, true, name);
    assert.equal((await fetch(base + '/mcp')).status, 405);
    assert.equal((await fetch(base + '/mcp', { method: 'POST', headers: { Origin: 'https://evil.example' } })).status, 403);
    const hostStatus = await new Promise((resolve, reject) => {
      const req = http.request(base + '/mcp', { method: 'POST', headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(hostStatus, 403);
    assert.equal((await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
    assert.equal((await fetch(base + '/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'x'.repeat(17000) }) })).status, 413);
    let status;
    for (let i = 0; i < 65; i++) status = (await fetch(base + '/mcp')).status;
    assert.equal(status, 429);
  } finally { await client.close(); await new Promise(resolve => listener.close(resolve)); }
});
