const BASE = 'https://universalis.app/api/v2/';
const cache = new Map();
let active = 0;
let calls = [];

export async function query(path, params, fetcher = fetch) {
  const url = new URL(path, BASE);
  url.search = new URLSearchParams(params).toString();
  const key = url.href;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.fetchedAt < 60_000) return { ...cached, cacheHit: true };
  calls = calls.filter(t => now - t < 60_000);
  if (active >= 2 || calls.length >= 20) throw new Error('Upstream budget reached; retry in 60 seconds.');
  calls.push(now);
  active++;
  try {
    const response = await fetcher(url, {
      signal: AbortSignal.timeout(10_000), redirect: 'error',
      headers: { 'User-Agent': 'HyperionReadOnlyMCP/1.0', Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Universalis HTTP ${response.status}; retry later (no automatic retries).`);
    // Bound decompressed response size as well as request parameters.
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 2_000_000) throw new Error('Universalis response too large.');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const result = { data, source: key, fetchedAt: now, cacheHit: false };
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
  } finally { active--; }
}

export function salesSummary(entries, days, limit, nowSeconds = Date.now() / 1000) {
  const rows = entries.filter(s => Number.isFinite(s.timestamp) && s.timestamp >= nowSeconds - days * 86400 && s.timestamp <= nowSeconds);
  const units = rows.reduce((n, s) => n + s.quantity, 0);
  const gil = rows.reduce((n, s) => n + s.quantity * s.pricePerUnit, 0);
  return {
    windowDays: days, returnedTransactions: rows.length, returnedUnits: units,
    observedTransactionsPerDay: rows.length / days, observedUnitsPerDay: units / days,
    quantityWeightedUnitPrice: units ? gil / units : null,
    possiblyTruncated: entries.length >= limit,
    interpretation: 'Observed uploaded sales divided by the full requested window, not a demand forecast. Missing uploads or the entry cap can undercount. A cap hit is only a truncation warning.'
  };
}

export async function prices({ item_ids }) {
  const r = await query(`Hyperion/${item_ids.join(',')}`, { listings: '1', entries: '0' });
  if (item_ids.length === 1 ? !Number.isInteger(r.data.itemID) : !r.data.items || typeof r.data.items !== 'object') throw new Error('Unexpected Universalis price response.');
  const items = item_ids.length === 1 ? [r.data] : Object.values(r.data.items ?? {});
  return { ...metadata(r), unresolvedItemIds: r.data.unresolvedItems ?? [], items: items.map(d => ({
    itemId: d.itemID, hasData: d.hasData, lastUploadTimeMs: d.lastUploadTime,
    minUnitPrice: d.minPrice, minUnitPriceNQ: d.minPriceNQ, minUnitPriceHQ: d.minPriceHQ,
    currentAverageUnitPrice: d.currentAveragePrice,
    note: 'Asking prices in gil; zero may mean no data. Average is Universalis-defined; not a completed-sale price.'
  })) };
}

function metadata(r) {
  return { world: 'Hyperion', worldId: 95, source: r.source,
    fetchedAt: new Date(r.fetchedAt).toISOString(), cacheHit: r.cacheHit,
    warning: 'Crowdsourced snapshots may be stale or incomplete. Retrieval time is not market update time. No fees or input costs deducted.' };
}

export async function listings({ item_id, limit = 20, quality = 'all' }) {
  const params = { listings: String(limit), entries: '0' };
  if (quality !== 'all') params.hq = String(quality === 'hq');
  const r = await query(`Hyperion/${item_id}`, params);
  if (r.data.itemID !== item_id || !Array.isArray(r.data.listings)) throw new Error('Unexpected Universalis listings response.');
  return { ...metadata(r), itemId: item_id, lastUploadTimeMs: r.data.lastUploadTime,
    quality, requestedLimit: limit,
    listings: (r.data.listings ?? []).map(s => ({ pricePerUnit: s.pricePerUnit, quantity: s.quantity, hq: s.hq,
      lastReviewTimeSeconds: s.lastReviewTime, total: s.total })),
    note: 'Returned listings are a bounded snapshot, not total market supply. Seller identities intentionally omitted.' };
}

export async function sales({ item_id, days = 7, limit = 500 }) {
  const r = await query(`history/Hyperion/${item_id}`, {
    entriesToReturn: String(limit), entriesWithin: String(days * 86400), statsWithin: String(days * 86400000)
  });
  if (r.data.itemID !== item_id || !Array.isArray(r.data.entries)) throw new Error('Unexpected Universalis sales response.');
  const entries = r.data.entries ?? [];
  return { ...metadata(r), itemId: item_id, lastUploadTimeMs: r.data.lastUploadTime,
    ...salesSummary(entries, days, limit, r.fetchedAt / 1000),
    upstreamVelocity: {
      regularSaleVelocity: r.data.regularSaleVelocity ?? null,
      nqSaleVelocity: r.data.nqSaleVelocity ?? null,
      hqSaleVelocity: r.data.hqSaleVelocity ?? null
    },
    upstreamVelocityNote: 'Universalis-defined statistic, separate from the explicit observed-unit calculation above.',
    entries: entries.map(s => ({ timestampSeconds: s.timestamp, pricePerUnit: s.pricePerUnit, quantity: s.quantity, hq: s.hq, total: s.total })) };
}
