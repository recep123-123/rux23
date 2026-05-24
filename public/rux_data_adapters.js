/* RUx — Multi-Exchange Live Data Router Layer */
import {
  fetchBinanceLive,
  fetchMarket,
  fetchFunding,
  fetchFutures,
  fetchCVD,
  fetchLiquidity,
  fetchNews,
  fetchCMC,
  fetchFearGreed,
  fetchDefiLlama,
  fetchHyperliquid,
  getRuxSourceLog,
  RUX_HEALTH_ENDPOINTS,
  testApiEndpoint
} from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';

export const RUX_DATA_ADAPTER_VERSION = 'RUx v0.75.10-heatmap-fidelity-pass-20260524';

export const RUX_UNIFIED_MARKET_SCHEMA = Object.freeze({
  symbol: 'string',
  timeframe: 'string',
  source: 'string',
  mode: 'LIVE | MOCK | FALLBACK | STALE | OFFLINE',
  binanceLive: '{spot, futures, derivatives, basis, activeExchange, fallbackChain}',
  timestamp: 'epoch ms',
  latencyMs: 'number',
  ohlcv: 'Array<{time, open, high, low, close, volume}>',
  ticker: '{price, change}',
  funding: '{rate, rows, source}',
  openInterest: '{value, source}',
  orderflow: '{cvd, buyQuote, sellQuote, source}',
  liquidity: '{spreadBps, depthUsd, liquidityScore, source}',
  metadata: '{items, provider}',
  news: '{items, provider}',
  quality: '{freshness, completeness, consistency, sourceReliability, confidence}',
  gate: '{label, freezeNewSignals, signalMode, multiplier}'
});

export const RUX_ADAPTERS = Object.freeze([
  { id: 'binanceLive', name: 'Exchange Data Router Adapter', kind: 'multiMarket', critical: true, fetcher: 'fetchBinanceLive', expected: ['spot', 'futures', 'derivatives'] },
  { id: 'market', name: 'Market OHLCV Adapter', kind: 'ohlcv', critical: true, fetcher: 'fetchMarket', expected: ['candles', 'ticker'] },
  { id: 'funding', name: 'Funding Adapter', kind: 'funding', critical: true, fetcher: 'fetchFunding', expected: ['rows', 'currentFundingRate'] },
  { id: 'futures', name: 'Open Interest Adapter', kind: 'openInterest', critical: true, fetcher: 'fetchFutures', expected: ['openInterest', 'fundingRate'] },
  { id: 'cvd', name: 'CVD / Delta Adapter', kind: 'orderflow', critical: false, fetcher: 'fetchCVD', expected: ['cvd', 'buckets'] },
  { id: 'liquidity', name: 'Liquidity / Order Book Adapter', kind: 'liquidity', critical: false, fetcher: 'fetchLiquidity', expected: ['liquidityScore', 'depth'] },
  { id: 'news', name: 'News Pulse Adapter', kind: 'news', critical: true, fetcher: 'fetchNews', expected: ['items', 'news'] },
  { id: 'metadata', name: 'Market Metadata Adapter', kind: 'metadata', critical: true, fetcher: 'fetchCMC', expected: ['items', 'top_movers'] },
  { id: 'sentiment', name: 'Fear & Greed Adapter', kind: 'sentiment', critical: false, fetcher: 'fetchFearGreed', expected: ['value'] },
  { id: 'onchain', name: 'DeFiLlama Adapter', kind: 'onchain', critical: false, fetcher: 'fetchDefiLlama', expected: ['chains', 'summary'] },
  { id: 'hyperliquid', name: 'Hyperliquid Context Adapter', kind: 'derivatives', critical: false, fetcher: 'fetchHyperliquid', expected: ['openInterest', 'funding'] }
]);

function now() { return Date.now(); }
function clamp(n, a = 0, b = 100) { return Math.max(a, Math.min(b, Number.isFinite(Number(n)) ? Number(n) : 0)); }
function round(n, d = 2) { const p = Math.pow(10, d); return Math.round((Number(n) || 0) * p) / p; }
function arr(v) { return Array.isArray(v) ? v : []; }
function isFallbackSource(s = '') { return /fallback|mock|cache|proxy|demo|safe/i.test(String(s || '')); }
function inferMode({ ok, source, ageMs = 0, staleMs = 120000, critical = false }) {
  if (!ok) return critical ? 'OFFLINE' : 'OPTIONAL_OFFLINE';
  if (isFallbackSource(source)) return 'FALLBACK';
  if (ageMs > staleMs) return 'STALE';
  if (/live/i.test(String(source || ''))) return 'LIVE';
  return 'LIVE';
}
function countPayload(payload) {
  if (!payload) return 0;
  if (Array.isArray(payload?.spot?.candles)) return payload.spot.candles.length + (Array.isArray(payload?.futures?.candles) ? payload.futures.candles.length : 0);
  if (Array.isArray(payload.candles)) return payload.candles.length;
  if (Array.isArray(payload.rows)) return payload.rows.length;
  if (Array.isArray(payload.items)) return payload.items.length;
  if (Array.isArray(payload.news)) return payload.news.length;
  if (Array.isArray(payload.buckets)) return payload.buckets.length;
  if (Array.isArray(payload.top_movers)) return payload.top_movers.length;
  if (payload.openInterest || payload.fundingRate || payload.liquidityScore || payload.value) return 1;
  return 0;
}
function sourceOf(payload, fallback = '—') {
  return payload?.source || payload?.provider || payload?.market || payload?.cluster || payload?.fallback_from || fallback;
}
function payloadOk(payload) {
  if (!payload) return false;
  if (payload.ok === false) return false;
  if (/OFFLINE/i.test(String(payload.mode || ''))) return false;
  if (payload.error || payload.status === 'error') return false;
  return true;
}
function updatedAtOf(payload) {
  const v = payload?.updatedAt || payload?.updated_at || payload?.timestamp || payload?.time || null;
  const n = Number(v);
  if (Number.isFinite(n) && n > 100000000000) return n;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (Number.isFinite(t)) return t;
  }
  const candles = arr(payload?.candles);
  if (candles.length) return Number(candles.at(-1)?.time || now());
  return now();
}
function freshnessScore(ageMs) {
  if (!Number.isFinite(ageMs)) return 50;
  if (ageMs <= 15000) return 96;
  if (ageMs <= 60000) return 86;
  if (ageMs <= 180000) return 70;
  if (ageMs <= 900000) return 48;
  return 25;
}
function completenessScore(payload, expected = []) {
  if (!payload) return 0;
  const cnt = countPayload(payload);
  let score = cnt > 0 ? 76 : 32;
  for (const key of expected || []) {
    const v = payload?.[key];
    if (v !== undefined && v !== null && (!Array.isArray(v) || v.length)) score += 7;
    else score -= 6;
  }
  if (Array.isArray(payload?.candles) && payload.candles.length >= 120) score += 10;
  if (Array.isArray(payload?.rows) && payload.rows.length >= 20) score += 6;
  return clamp(score);
}
function reliabilityScore({ ok, source, critical, count }) {
  if (!ok) return critical ? 20 : 54;
  let s = isFallbackSource(source) ? 68 : 90;
  if (!count) s -= 14;
  return clamp(s);
}
function consistencyScore(payload, kind) {
  if (!payload) return 0;
  if (kind === 'multiMarket') {
    const spot = arr(payload?.spot?.candles);
    const fut = arr(payload?.futures?.candles);
    if (!spot.length || !fut.length) return 42;
    const sp = Number(payload?.basis?.spotPrice || spot.at(-1)?.close || 0);
    const mp = Number(payload?.basis?.markPrice || fut.at(-1)?.close || 0);
    const basisAbs = sp && mp ? Math.abs((mp - sp) / sp * 100) : 0.2;
    return clamp(basisAbs < 0.10 ? 94 : basisAbs < 0.35 ? 84 : basisAbs < 0.75 ? 70 : 52);
  }
  if (kind === 'ohlcv') {
    const c = arr(payload.candles);
    if (c.length < 20) return 48;
    let bad = 0;
    for (const row of c.slice(-80)) {
      if (!(row.high >= Math.max(row.open, row.close) && row.low <= Math.min(row.open, row.close))) bad++;
      if (!Number.isFinite(Number(row.close))) bad++;
    }
    return clamp(96 - bad * 8);
  }
  if (kind === 'openInterest') return payload.openInterest ? 88 : 62;
  if (kind === 'funding') return (arr(payload.rows).length || payload.currentFundingRate || payload.fundingRate) ? 86 : 60;
  return countPayload(payload) ? 82 : 50;
}
function qualityFrom({ payload, adapter, latencyMs = 0, error = '' }) {
  const ok = payloadOk(payload) && !error;
  const updatedAt = updatedAtOf(payload);
  const ageMs = now() - updatedAt;
  const source = sourceOf(payload);
  const count = countPayload(payload);
  const freshness = freshnessScore(ageMs);
  const completeness = completenessScore(payload, adapter.expected);
  const consistency = consistencyScore(payload, adapter.kind);
  const sourceReliability = reliabilityScore({ ok, source, critical: adapter.critical, count });
  let confidence = round(freshness * .28 + completeness * .25 + consistency * .22 + sourceReliability * .20 + (latencyMs <= 1200 ? 5 : latencyMs <= 3500 ? 0 : -8), 1);
  if (adapter.critical && !ok) confidence = Math.min(confidence, 25);
  if (!adapter.critical && !ok) confidence = Math.min(confidence, 58);
  return {
    freshness: round(freshness, 1), completeness: round(completeness, 1), consistency: round(consistency, 1),
    sourceReliability: round(sourceReliability, 1), confidence: clamp(confidence), updatedAt, ageMs,
    stale: ageMs > 120000, fallback: isFallbackSource(source), count
  };
}
function gateForConfidence(confidence, criticalOffline = false) {
  const c = Number(confidence || 0);
  if (criticalOffline || c < 50) return { label: 'SIGNAL FREEZE', signalMode: 'FREEZE', freezeNewSignals: true, multiplier: 0, tone: 'red' };
  if (c < 70) return { label: 'WATCH ONLY', signalMode: 'WATCH', freezeNewSignals: false, multiplier: .55, tone: 'yellow' };
  if (c < 85) return { label: 'TAGGED LIVE', signalMode: 'TAGGED', freezeNewSignals: false, multiplier: .85, tone: 'cyan' };
  return { label: 'LIVE READY', signalMode: 'NORMAL', freezeNewSignals: false, multiplier: 1, tone: 'green' };
}

async function timed(fn) {
  const started = now();
  try {
    const payload = await fn();
    return { payload, latencyMs: now() - started, error: '' };
  } catch (e) {
    return { payload: null, latencyMs: now() - started, error: e?.message || String(e) };
  }
}

async function runAdapter(adapter, { symbol = 'BTCUSDT', tf = '4h', force = false } = {}) {
  let out;
  switch (adapter.id) {
    case 'binanceLive': out = await timed(() => fetchBinanceLive(symbol, tf, force ? 720 : 320)); break;
    case 'market': out = await timed(() => fetchMarket(symbol, tf, force ? 720 : 320)); break;
    case 'funding': out = await timed(() => fetchFunding(symbol)); break;
    case 'futures': out = await timed(() => fetchFutures(symbol)); break;
    case 'cvd': out = await timed(() => fetchCVD(symbol, 500)); break;
    case 'liquidity': out = await timed(() => fetchLiquidity(symbol)); break;
    case 'news': out = await timed(() => fetchNews(symbol, 'tr', 'global', { limit: 12, force })); break;
    case 'metadata': out = await timed(() => fetchCMC(20)); break;
    case 'sentiment': out = await timed(() => fetchFearGreed()); break;
    case 'onchain': out = await timed(() => fetchDefiLlama()); break;
    case 'hyperliquid': out = await timed(() => fetchHyperliquid(String(symbol).replace(/USDT$/,''), 'derivatives')); break;
    default: out = await timed(() => Promise.resolve(null));
  }
  const logicalError = out.error || (out.payload?.ok === false ? (Array.isArray(out.payload.errors) ? out.payload.errors.slice(0, 3).join(' | ') : 'payload ok=false') : '');
  const q = qualityFrom({ payload: out.payload, adapter, latencyMs: out.latencyMs, error: logicalError });
  const source = sourceOf(out.payload, logicalError ? '—' : adapter.fetcher);
  const ok = payloadOk(out.payload) && !logicalError;
  let mode = inferMode({ ok, source, ageMs: q.ageMs, critical: adapter.critical });
  if (out.payload?.mode && /DEGRADED|PARTIAL/i.test(String(out.payload.mode))) mode = 'STALE';
  if (out.payload?.mode && /BROWSER_FALLBACK/i.test(String(out.payload.mode))) mode = 'FALLBACK';
  return {
    adapterId: adapter.id,
    name: adapter.name,
    kind: adapter.kind,
    critical: adapter.critical,
    fetcher: adapter.fetcher,
    ok,
    mode,
    source,
    latencyMs: out.latencyMs,
    count: q.count,
    updatedAt: q.updatedAt,
    ageMs: q.ageMs,
    error: logicalError,
    normalized: Boolean(out.payload) && !logicalError,
    quality: q,
    raw: out.payload
  };
}

function normalizeBinanceLive(payload) {
  if (!payload) return null;
  return {
    source: payload.source || '—',
    mode: payload.mode || '—',
    spot: payload.spot || null,
    futures: payload.futures || null,
    derivatives: payload.derivatives || null,
    basis: payload.basis || null,
    quality: payload.quality || null,
    errors: arr(payload.errors),
    updatedAt: payload.updatedAt || null
  };
}

function normalizeOhlcv(market) {
  return arr(market?.candles).map(c => ({
    time: Number(c.time), open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), volume: Number(c.volume || 0)
  })).filter(c => Number.isFinite(c.time) && Number.isFinite(c.close));
}
function normalizeTicker(market) {
  const t = market?.ticker || {};
  return { price: Number(t.price ?? normalizeOhlcv(market).at(-1)?.close ?? 0) || null, change: Number(t.change ?? 0) || 0 };
}
function normalizeFunding(payload) {
  const rows = arr(payload?.rows).map(x => ({ time: Number(x.time || x.fundingTime || x.fundingRateTimestamp), rate: Number(x.fundingRate ?? x.rate ?? 0) })).filter(x => Number.isFinite(x.rate));
  return { rate: Number(payload?.currentFundingRate ?? payload?.fundingRate ?? rows.at(-1)?.rate ?? 0) || 0, rows, source: sourceOf(payload) };
}
function normalizeOpenInterest(payload) {
  return { value: Number(payload?.openInterest ?? payload?.oi ?? 0) || null, source: sourceOf(payload), fundingRate: Number(payload?.fundingRate ?? 0) || 0 };
}
function normalizeOrderflow(payload) {
  return { cvd: Number(payload?.cvd ?? 0) || 0, buyQuote: Number(payload?.buyQuote ?? 0) || 0, sellQuote: Number(payload?.sellQuote ?? 0) || 0, buckets: arr(payload?.buckets), source: sourceOf(payload) };
}
function normalizeLiquidity(payload) {
  const depth = payload?.depth || payload?.orderbook || null;
  const bidUsd = Number(payload?.bidUsd ?? payload?.depthUsdBid ?? 0) || 0;
  const askUsd = Number(payload?.askUsd ?? payload?.depthUsdAsk ?? 0) || 0;
  return {
    spreadBps: Number(payload?.spreadBps ?? payload?.impactSpreadPct ?? payload?.depth?.spreadBps ?? 0) || null,
    depthUsd: Number(payload?.depthUsd ?? (bidUsd + askUsd) ?? 0) || 0,
    liquidityScore: Number(payload?.liquidityScore ?? payload?.score ?? 0) || 0,
    source: sourceOf(payload), depth
  };
}

function computeUnifiedQuality(rows) {
  const critical = rows.filter(r => r.critical);
  const considered = rows.filter(r => r.critical || r.ok);
  const criticalOffline = critical.some(r => !r.ok || r.mode === 'OFFLINE');
  const weighted = considered.reduce((s, r) => s + r.quality.confidence * (r.critical ? 1.35 : .65), 0);
  const w = considered.reduce((s, r) => s + (r.critical ? 1.35 : .65), 0) || 1;
  const confidence = clamp(round(weighted / w, 1));
  return {
    freshness: round(rows.reduce((s,r)=>s+r.quality.freshness,0)/Math.max(1,rows.length),1),
    completeness: round(rows.reduce((s,r)=>s+r.quality.completeness,0)/Math.max(1,rows.length),1),
    consistency: round(rows.reduce((s,r)=>s+r.quality.consistency,0)/Math.max(1,rows.length),1),
    sourceReliability: round(rows.reduce((s,r)=>s+r.quality.sourceReliability,0)/Math.max(1,rows.length),1),
    confidence,
    criticalOffline,
    liveCount: rows.filter(r => r.mode === 'LIVE').length,
    fallbackCount: rows.filter(r => r.mode === 'FALLBACK').length,
    staleCount: rows.filter(r => r.mode === 'STALE').length,
    offlineCount: rows.filter(r => r.mode === 'OFFLINE' || r.mode === 'OPTIONAL_OFFLINE').length
  };
}

export async function buildUnifiedMarketData({ symbol = 'BTCUSDT', tf = '4h', force = false } = {}) {
  const started = now();
  const adapters = await Promise.all(RUX_ADAPTERS.map(a => runAdapter(a, { symbol, tf, force })));
  const byId = Object.fromEntries(adapters.map(r => [r.adapterId, r]));
  const q = computeUnifiedQuality(adapters);
  const gate = gateForConfidence(q.confidence, q.criticalOffline);
  const binanceLive = byId.binanceLive?.raw;
  const market = binanceLive?.spot?.candles?.length ? { candles: binanceLive.spot.candles, ticker: binanceLive.spot.ticker, source: binanceLive.source, updatedAt: binanceLive.updatedAt } : byId.market?.raw;
  const payload = {
    version: RUX_DATA_ADAPTER_VERSION,
    symbol,
    timeframe: tf,
    source: byId.market?.source || '—',
    mode: gate.freezeNewSignals ? 'OFFLINE' : q.fallbackCount ? 'FALLBACK' : q.staleCount ? 'STALE' : 'LIVE',
    timestamp: now(),
    latencyMs: now() - started,
    binanceLive: normalizeBinanceLive(binanceLive),
    ohlcv: normalizeOhlcv(market),
    ticker: normalizeTicker(market),
    funding: normalizeFunding(byId.funding?.raw),
    openInterest: normalizeOpenInterest(byId.futures?.raw),
    orderflow: normalizeOrderflow(byId.cvd?.raw),
    liquidity: normalizeLiquidity(byId.liquidity?.raw),
    metadata: { items: arr(byId.metadata?.raw?.items || byId.metadata?.raw?.top_movers), provider: sourceOf(byId.metadata?.raw) },
    news: { items: arr(byId.news?.raw?.items || byId.news?.raw?.news), provider: sourceOf(byId.news?.raw) },
    sentiment: byId.sentiment?.raw || null,
    onchain: byId.onchain?.raw || null,
    quality: q,
    gate,
    adapters,
    sourceLog: getRuxSourceLog(25),
    schema: RUX_UNIFIED_MARKET_SCHEMA
  };
  try { localStorage.setItem('rux.adapter.lastUnified', JSON.stringify({ ...payload, adapters: adapters.map(({raw, ...x}) => x), rawDropped: true })); } catch {}
  return payload;
}

export async function runAdapterDiagnostics({ symbol = 'BTCUSDT', tf = '4h', force = false } = {}) {
  const unified = await buildUnifiedMarketData({ symbol, tf, force });
  const endpointRows = await Promise.all(RUX_HEALTH_ENDPOINTS.map(async ep => {
    const suffix = force ? (ep.path.includes('?') ? '&' : '?') + 'adapterCheck=' + Date.now() : '';
    return await testApiEndpoint(ep.path + suffix, { timeoutMs: ep.critical ? 8500 : 6500, category: ep.category, optional: !ep.critical });
  }));
  const hardBlocks = [];
  if (!unified.ohlcv.length) hardBlocks.push('OHLCV normalize edilemedi');
  if (unified.quality.criticalOffline) hardBlocks.push('Kritik adapter offline');
  if (unified.gate.freezeNewSignals) hardBlocks.push('Data confidence kritik eşik altında');
  const recommendations = [];
  if (unified.mode === 'FALLBACK') recommendations.push('Fallback/mock etiketi arayüzde açık kalmalı; canlı karar skoruna tam ağırlık verilmemeli.');
  if (unified.quality.staleCount) recommendations.push('Stale kaynaklar için freshness lock aktif olmalı.');
  if (unified.quality.offlineCount) recommendations.push('Offline opsiyonel kaynakların ağırlığı sıfıra yakın tutulmalı.');
  if (!hardBlocks.length && !recommendations.length) recommendations.push('Adapter seti normal sinyal akışına uygun görünüyor.');
  return {
    ...unified,
    endpointRows,
    hardBlocks,
    recommendations,
    deployment: hardBlocks.length ? 'DATA FREEZE' : unified.quality.confidence >= 85 ? 'LIVE READY' : unified.quality.confidence >= 70 ? 'LIVE TAGGED' : 'WATCH ONLY'
  };
}

export function loadLastUnifiedMarketData() {
  try { const raw = localStorage.getItem('rux.adapter.lastUnified'); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export function exportAdapterDiagnostics(payload) {
  const p = payload || loadLastUnifiedMarketData();
  if (!p) return '{}';
  const compact = {
    version: p.version,
    symbol: p.symbol,
    timeframe: p.timeframe,
    mode: p.mode,
    source: p.source,
    timestamp: p.timestamp,
    quality: p.quality,
    gate: p.gate,
    ohlcvCount: p.ohlcv?.length || 0,
    adapterRows: (p.adapters || []).map(x => ({ id: x.adapterId, name: x.name, kind: x.kind, critical: x.critical, ok: x.ok, mode: x.mode, source: x.source, latencyMs: x.latencyMs, count: x.count, confidence: x.quality?.confidence, error: x.error })),
    hardBlocks: p.hardBlocks || [],
    recommendations: p.recommendations || []
  };
  return JSON.stringify(compact, null, 2);
}
