/* RUx — API client / Multi-exchange data router utilities */
import { buildRuxApiHeaders, getRuxSettings } from './rux_settings.js?v=0.75.2-funding-responsive-live-20260524';

export const API_BASE = '';

/* ---- light cache (stale-while-revalidate) ---- */
const _cache = new Map();
const _sourceLog = [];
function _now() { return Date.now(); }

export const RUX_HEALTH_ENDPOINTS = Object.freeze([
  { name: 'Exchange Data Router', path: '/api/market-router?symbol=BTCUSDT&tf=4h&limit=160', category: 'multiMarket', critical: true },
  { name: 'Market Data', path: '/api/market?symbol=BTCUSDT&tf=4h&limit=160', category: 'ohlcv', critical: true },
  { name: 'Funding Rates', path: '/api/funding-history?symbol=BTCUSDT', category: 'funding', critical: true },
  { name: 'Open Interest', path: '/api/futures?symbol=BTCUSDT', category: 'openInterest', critical: true },
  { name: 'CVD / Delta', path: '/api/cvd?symbol=BTCUSDT&limit=500', category: 'orderflow', critical: false },
  { name: 'Order Book / Likidite', path: '/api/liquidity?symbol=BTCUSDT', category: 'liquidity', critical: false },
  { name: 'Hyperliquid Context', path: '/api/hyperliquid?mode=derivatives&symbol=BTC', category: 'openInterest', critical: false },
  { name: 'News Pulse', path: '/api/news-pulse?symbol=BTCUSDT&lang=tr&mode=global&limit=12', category: 'news', critical: true },
  { name: 'CoinMarketCap', path: '/api/cmc?limit=20', category: 'metadata', critical: true },
  { name: 'DeFi Llama', path: '/api/defillama', category: 'onchain', critical: false },
  { name: 'Dune Stablecoin', path: '/api/hyperliquid?mode=dune&slot=stablecoin&limit=10', category: 'onchain', critical: false },
  { name: 'Fear & Greed', path: '/api/feargreed', category: 'sentiment', critical: false },
  { name: 'Intel', path: '/api/intel', category: 'system', critical: true }
]);

function _routeCategory(path = '') {
  const p = String(path).toLowerCase();
  if (p.includes('binance-live') || p.includes('market-router')) return 'multiMarket';
  if (p.includes('market')) return 'ohlcv';
  if (p.includes('funding')) return 'funding';
  if (p.includes('cvd')) return 'orderflow';
  if (p.includes('liquidity')) return 'liquidity';
  if (p.includes('futures') || p.includes('hyperliquid')) return p.includes('dune') ? 'onchain' : 'openInterest';
  if (p.includes('news')) return 'news';
  if (p.includes('cmc') || p.includes('coingecko')) return 'metadata';
  if (p.includes('defillama') || p.includes('dune')) return 'onchain';
  if (p.includes('fear')) return 'sentiment';
  return 'system';
}

function _recordSourceLog(entry = {}) {
  try {
    const row = {
      time: Date.now(),
      path: entry.path || '',
      category: entry.category || _routeCategory(entry.path || ''),
      ok: Boolean(entry.ok),
      status: entry.status ?? null,
      latencyMs: entry.latencyMs ?? null,
      source: entry.source || '—',
      count: entry.count ?? null,
      error: entry.error || '',
      fallback: Boolean(entry.fallback)
    };
    _sourceLog.unshift(row);
    if (_sourceLog.length > 80) _sourceLog.length = 80;
    try { window.__RUX_SOURCE_LOG__ = _sourceLog; } catch {}
  } catch {}
}

export function getRuxSourceLog(limit = 40) { return _sourceLog.slice(0, Math.max(1, Number(limit) || 40)); }
export function clearRuxSourceLog() { _sourceLog.length = 0; try { window.__RUX_SOURCE_LOG__ = _sourceLog; } catch {} }


export async function api(path, opts = {}) {
  const ttl = Number.isFinite(opts.ttl) ? opts.ttl : 30_000;
  const url = path.startsWith('http') ? path : (API_BASE + path);
  const userHeaders = opts.skipRuxHeaders ? {} : buildRuxApiHeaders(opts.headers || {});
  const key = url + ':' + (opts.tag || '') + ':' + (userHeaders['x-omni-cmc-key'] ? 'cmc-user' : 'cmc-env') + ':' + (userHeaders['x-dune-api-key'] ? 'dune-user' : 'dune-env') + ':' + (userHeaders['x-rux-telegram-source'] || 'telegram-none') + ':' + (userHeaders['x-rux-dune-stablecoin-query-id'] || '') + ':' + (userHeaders['x-rux-dune-exchange-flow-query-id'] || '') + ':' + (userHeaders['x-rux-dune-whale-query-id'] || '') + ':' + (userHeaders['x-rux-data-mode'] || 'safe');
  const cached = _cache.get(key);
  if (cached && (_now() - cached.t) < ttl) return cached.v;
  const started = Date.now();
  try {
    const r = await fetch(url, { method: opts.method || 'GET', cache: 'no-store', headers: userHeaders });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    _cache.set(key, { t: _now(), v: j });
    _recordSourceLog({
      path,
      ok: true,
      status: r.status,
      latencyMs: Date.now() - started,
      source: j?.source || j?.provider || j?.cluster || j?.market || '—',
      count: Array.isArray(j?.items) ? j.items.length : Array.isArray(j?.candles) ? j.candles.length : Array.isArray(j?.spot?.candles) ? j.spot.candles.length : Array.isArray(j?.news) ? j.news.length : Array.isArray(j?.rows) ? j.rows.length : (j?.summary?.rowCount ?? null),
      fallback: String(j?.source || j?.provider || '').toLowerCase().includes('fallback')
    });
    return j;
  } catch (e) {
    _recordSourceLog({ path, ok: false, status: 0, latencyMs: Date.now() - started, source: cached ? 'cache fallback' : '—', error: e?.message || String(e), fallback: Boolean(cached) });
    if (cached) return cached.v;
    return null;
  }
}

export async function testApiEndpoint(path, opts = {}) {
  const started = Date.now();
  const settings = getRuxSettings();
  const headers = buildRuxApiHeaders(opts.headers || {});
  const url = path.startsWith('http') ? path : (API_BASE + path);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutMs = Number(opts.timeoutMs || 6500);
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, { method: 'GET', cache: 'no-store', headers, signal: controller ? controller.signal : undefined });
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    const latencyMs = Date.now() - started;
    const bodyError = json?.error || json?.status?.error_message || json?.message || (json?.ok === false ? 'Endpoint ok=false' : '') || ''; 
    const ok = r.ok && !bodyError;
    const result = {
      path,
      ok,
      status: r.status,
      latencyMs,
      mode: settings.dataMode,
      source: json?.source || json?.provider || json?.cluster || json?.symbol || '—',
      count: Array.isArray(json?.items) ? json.items.length : Array.isArray(json?.candles) ? json.candles.length : Array.isArray(json?.spot?.candles) ? json.spot.candles.length : Array.isArray(json?.news) ? json.news.length : Array.isArray(json?.rows) ? json.rows.length : (json?.summary?.rowCount ?? null),
      error: ok ? '' : (bodyError || text.slice(0, 160) || ('HTTP ' + r.status)),
      checkedAt: new Date().toISOString(),
      category: opts.category || _routeCategory(path),
      optional: Boolean(opts.optional)
    };
    _recordSourceLog(result);
    return result;
  } catch (e) {
    const result = { path, ok:false, status:0, latencyMs: Date.now() - started, mode: settings.dataMode, source:'—', count:null, error: e?.name === 'AbortError' ? 'Zaman aşımı' : (e?.message || String(e)), checkedAt: new Date().toISOString(), category: opts.category || _routeCategory(path), optional: Boolean(opts.optional) };
    _recordSourceLog(result);
    return result;
  } finally {
    if(timer) clearTimeout(timer);
  }
}

export function fmtNum(n, d = 2) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (Math.abs(n) >= 1e12) return (n/1e12).toFixed(d) + 'T';
  if (Math.abs(n) >= 1e9)  return (n/1e9).toFixed(d) + 'B';
  if (Math.abs(n) >= 1e6)  return (n/1e6).toFixed(d) + 'M';
  if (Math.abs(n) >= 1e3)  return (n/1e3).toFixed(d) + 'K';
  return Number(n).toFixed(d);
}
export function fmtPrice(n) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  if (n >= 0.01) return n.toLocaleString('en-US', { maximumFractionDigits: 5, minimumFractionDigits: 4 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 8, minimumFractionDigits: 6 });
}
export function fmtPct(n, d = 2) {
  if (n === null || n === undefined || !isFinite(n)) return '—';
  const s = n >= 0 ? '+' : '';
  return s + Number(n).toFixed(d) + '%';
}
export function fmtTime(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
export function fmtTimeShort(ts) {
  const d = ts instanceof Date ? ts : new Date(ts);
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(ms) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return Math.floor(diff/1000) + 's';
  if (diff < 3_600_000) return Math.floor(diff/60_000) + 'd';
  if (diff < 86_400_000) return Math.floor(diff/3_600_000) + 's';
  return Math.floor(diff/86_400_000) + 'g';
}

/* ---- API endpoints (preserving backend) ---- */
function _bnNum(v, d = null) { const x = Number(v); return Number.isFinite(x) ? x : d; }
function _bnRound(v, d = 4) { const p = Math.pow(10, d); return Math.round((_bnNum(v, 0)) * p) / p; }
function _bnKlines(rows) {
  return (Array.isArray(rows) ? rows : []).map(k => ({
    time: _bnNum(k[0]), open: _bnNum(k[1]), high: _bnNum(k[2]), low: _bnNum(k[3]), close: _bnNum(k[4]), volume: _bnNum(k[5], 0),
    quoteVolume: _bnNum(k[7], 0), trades: _bnNum(k[8], 0), takerBuyBase: _bnNum(k[9], 0), takerBuyQuote: _bnNum(k[10], 0)
  })).filter(x => Number.isFinite(x.time) && Number.isFinite(x.close));
}
async function _bnFetchJson(urls, timeoutMs = 7000) {
  const list = Array.isArray(urls) ? urls : [urls];
  const errors = [];
  for (const url of list) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    try {
      const r = await fetch(url, { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined, headers: { accept: 'application/json' } });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch { json = text; }
      if (!r.ok) throw new Error('HTTP ' + r.status + ': ' + (typeof json === 'string' ? json.slice(0, 120) : JSON.stringify(json).slice(0, 120)));
      return { data: json, host: new URL(url).origin };
    } catch (e) { errors.push((new URL(url)).host + ': ' + (e?.message || String(e))); }
    finally { if (timer) clearTimeout(timer); }
  }
  return { data: null, host: null, error: errors.join(' || ') };
}
async function fetchBinanceLiveBrowserFallback(symbol = 'BTCUSDT', tf = '4h', limit = 240, serverPayload = null) {
  const sym = String(symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20) || 'BTCUSDT';
  const interval = String(tf || '4h');
  const lim = Math.max(20, Math.min(2000, Number(limit) || 240));
  const q = `symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(interval)}&limit=${lim}`;
  const errors = [];
  const started = Date.now();
  const spotK = await _bnFetchJson([
    `https://data-api.binance.vision/api/v3/klines?${q}`,
    `https://api.binance.com/api/v3/klines?${q}`,
    `https://api1.binance.com/api/v3/klines?${q}`
  ], 6500);
  if (!spotK.data) errors.push('browser spot klines: ' + (spotK.error || 'failed'));
  const spotT = await _bnFetchJson([
    `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`,
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`,
    `https://api1.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(sym)}`
  ], 5000);
  if (!spotT.data) errors.push('browser spot ticker: ' + (spotT.error || 'failed'));
  const futQ = `symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(interval)}&limit=${lim}`;
  const futK = await _bnFetchJson([
    `https://fapi.binance.com/fapi/v1/klines?${futQ}`,
    `https://fapi1.binance.com/fapi/v1/klines?${futQ}`
  ], 6500);
  if (!futK.data) errors.push('browser futures klines: ' + (futK.error || 'failed'));
  const prem = await _bnFetchJson([
    `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(sym)}`,
    `https://fapi1.binance.com/fapi/v1/premiumIndex?symbol=${encodeURIComponent(sym)}`
  ], 5000);
  if (!prem.data) errors.push('browser premiumIndex: ' + (prem.error || 'failed'));
  const oi = await _bnFetchJson([
    `https://fapi.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(sym)}`,
    `https://fapi1.binance.com/fapi/v1/openInterest?symbol=${encodeURIComponent(sym)}`
  ], 5000);
  if (!oi.data) errors.push('browser openInterest: ' + (oi.error || 'failed'));
  const spotCandles = _bnKlines(spotK.data);
  const futuresCandles = _bnKlines(futK.data);
  const spotPrice = _bnNum(spotT.data?.lastPrice) || _bnNum(spotCandles.at(-1)?.close);
  const futuresLast = _bnNum(futuresCandles.at(-1)?.close);
  const markPrice = _bnNum(prem.data?.markPrice) || futuresLast;
  const basisPct = spotPrice && markPrice ? ((markPrice - spotPrice) / spotPrice) * 100 : null;
  const ok = spotCandles.length > 0 && futuresCandles.length > 0 && !!prem.data && !!oi.data;
  const partial = spotCandles.length || futuresCandles.length || prem.data || oi.data;
  const completeness = Math.min(100, (spotCandles.length ? 25 : 0) + (futuresCandles.length ? 25 : 0) + (spotT.data ? 10 : 0) + (prem.data ? 20 : 0) + (oi.data ? 15 : 0));
  const consistency = spotPrice && markPrice ? (Math.abs(basisPct) < 0.10 ? 92 : Math.abs(basisPct) < 0.35 ? 82 : 68) : 55;
  const freshness = spotCandles.length || futuresCandles.length ? 86 : 25;
  const reliability = ok ? 78 : partial ? 55 : 20;
  const confidence = _bnRound(freshness * .25 + completeness * .30 + consistency * .25 + reliability * .20, 1);
  return {
    ok,
    version: 'RUx v0.75.2-funding-responsive-live-20260524',
    source: ok ? 'BROWSER DIRECT BINANCE FALLBACK' : 'BROWSER DIRECT BINANCE PARTIAL',
    mode: ok ? 'LIVE_BROWSER_FALLBACK' : partial ? 'DEGRADED' : 'OFFLINE',
    symbol: sym,
    timeframe: interval,
    interval,
    latencyMs: Date.now() - started,
    updatedAt: Date.now(),
    errors: [...(serverPayload?.errors || []), ...errors].slice(0, 12),
    hosts: { spotKlines: spotK.host, spotTicker: spotT.host, futuresKlines: futK.host, premiumIndex: prem.host, openInterest: oi.host, serverFallbackFrom: serverPayload?.source || null },
    spot: { source: spotK.host || 'Browser Spot Missing', candles: spotCandles, ticker: spotT.data ? { price: spotPrice, change: _bnNum(spotT.data.priceChangePercent, 0), quoteVolume: _bnNum(spotT.data.quoteVolume, 0), count: _bnNum(spotT.data.count, 0) } : (spotPrice ? { price: spotPrice, change: 0, quoteVolume: null, count: null } : null), depth: serverPayload?.spot?.depth || null },
    futures: { source: futK.host || 'Browser Futures Missing', candles: futuresCandles, ticker: futuresLast ? { price: futuresLast, change: 0, quoteVolume: null, count: null } : null, depth: serverPayload?.futures?.depth || null },
    derivatives: { fundingRate: _bnNum(prem.data?.lastFundingRate, null), nextFundingTime: _bnNum(prem.data?.nextFundingTime, null), markPrice, indexPrice: _bnNum(prem.data?.indexPrice, null), openInterest: _bnNum(oi.data?.openInterest, null), openInterestTime: _bnNum(oi.data?.time, null), fundingRows: serverPayload?.derivatives?.fundingRows || [], oiHistory: serverPayload?.derivatives?.oiHistory || [] },
    basis: { basisPct: basisPct === null ? null : _bnRound(basisPct, 5), spotPrice, markPrice, futuresLast },
    quality: { freshness, completeness, consistency, sourceReliability: reliability, confidence, ageMs: null },
    normalized: true,
    browserFallback: true
  };
}

export async function fetchBinanceLive(symbol = 'BTCUSDT', tf = '4h', limit = 240) {
  const lim = Math.max(20, Math.min(1000, Number(limit)||240));
  const nonce = Date.now();
  const server = await api(`/api/market-router?symbol=${encodeURIComponent(symbol)}&tf=${encodeURIComponent(tf)}&limit=${lim}&_=${nonce}`, { ttl: 0, tag: 'market-router-v048-' + nonce });
  const serverHasRouterCore = server && (server?.spot?.ticker?.price || server?.spot?.candles?.length) && (server?.futures?.ticker?.price || server?.derivatives?.markPrice || server?.futures?.candles?.length);
  if (serverHasRouterCore) return server;
  try {
    const browser = await fetchBinanceLiveBrowserFallback(symbol, tf, limit, server);
    browser.source = browser.source || 'BROWSER DIRECT SPOT FALLBACK';
    browser.mode = browser.mode === 'LIVE_BROWSER_FALLBACK' ? 'BROWSER_SPOT_FALLBACK' : browser.mode;
    browser.version = 'RUx v0.75.2-funding-responsive-live-20260524';
    return browser;
  } catch (e) {
    if (server) {
      server.errors = [...(server.errors || []), 'browser fallback failed: ' + (e?.message || String(e))];
      return server;
    }
  }
  return { ok:false, mode:'OFFLINE', source:'Market Data Router unavailable', errors:['server router and browser fallback failed'], spot:{candles:[]}, futures:{candles:[]}, derivatives:{}, quality:{confidence:0,freshness:0,completeness:0,consistency:0,sourceReliability:0}, updatedAt:Date.now() };
}

function _ruxNormalizeMarketRouterPayload(payload, { symbol = 'BTCUSDT', tf = '4h' } = {}) {
  if (!payload || typeof payload !== 'object') return null;
  const candlesRaw = Array.isArray(payload?.spot?.candles) && payload.spot.candles.length
    ? payload.spot.candles
    : (Array.isArray(payload?.candles) ? payload.candles : []);
  const tickerPrice = _bnNum(payload?.spot?.ticker?.price ?? payload?.basis?.spotPrice ?? payload?.ticker?.price, null);
  const ticker = payload?.spot?.ticker
    ? { ...payload.spot.ticker, price: tickerPrice, source: payload?.spot?.source || payload?.source || 'market-router' }
    : (tickerPrice ? { price: tickerPrice, change: _bnNum(payload?.ticker?.change, 0), quoteVolume: _bnNum(payload?.ticker?.quoteVolume, null), timestamp: Date.now(), source: payload?.source || 'market-router' } : null);
  const candles = (candlesRaw || []).map(c => ({ ...c })).filter(c => Number.isFinite(Number(c.close)));

  // Make the last candle behave like a live current candle when a fresher ticker exists.
  // This is only for display/signal freshness; raw router payload is preserved separately.
  if (candles.length && tickerPrice && Number.isFinite(tickerPrice)) {
    const last = { ...candles[candles.length - 1] };
    last.close = tickerPrice;
    last.high = Math.max(_bnNum(last.high, tickerPrice), tickerPrice);
    last.low = Math.min(_bnNum(last.low, tickerPrice), tickerPrice);
    last.livePatched = true;
    candles[candles.length - 1] = last;
  }

  const out = {
    ok: Boolean(payload.ok || candles.length || tickerPrice),
    symbol: payload.symbol || symbol,
    tf: payload.timeframe || payload.interval || tf,
    source: payload.source || payload.market || 'Market Data Router',
    market: payload.source || payload.market || 'Market Data Router',
    activeExchange: payload.activeExchange || payload.exchange || null,
    mode: payload.mode || 'UNKNOWN',
    latencyMs: payload.latencyMs ?? payload.routerLatencyMs ?? null,
    updatedAt: payload.updatedAt || Date.now(),
    candles,
    ohlcv: candles,
    ticker,
    spot: payload.spot || null,
    futures: payload.futures || null,
    derivatives: payload.derivatives || null,
    basis: payload.basis || null,
    quality: payload.quality || null,
    // A12 — Likidite/spread: backend depthMetrics (spreadBps, imbalance, bidUsd/askUsd) sinyal motoruna taşınır.
    depth: payload.depth || payload?.spot?.depth || payload?.futures?.depth || null,
    depthMetrics: payload.depthMetrics || null,
    spreadBps: payload?.depthMetrics?.spreadBps ?? null,
    errors: payload.errors || payload.allExchangeErrors || [],
    routerPayload: payload,
    normalizedBy: 'rux-global-live-data-bus-v0.56.0'
  };
  try {
    window.__RUX_LIVE_MARKET__ = window.__RUX_LIVE_MARKET__ || {};
    window.__RUX_LIVE_MARKET__[String(out.symbol).toUpperCase()] = out;
    State.liveMarket = out;
    State.emit('live-market', out);
  } catch {}
  return out;
}

export async function fetchMarket(symbol = 'BTCUSDT', tf = '4h', limit = 300) {
  const sym = String(symbol || 'BTCUSDT').toUpperCase();
  const lim = Math.max(20, Math.min(2000, Number(limit) || 300));
  const nonce = Date.now();
  // v0.56.0: all terminal pages use the multi-exchange router as the primary market source.
  const router = await api(`/api/market-router?symbol=${encodeURIComponent(sym)}&tf=${encodeURIComponent(tf)}&limit=${lim}&_=${nonce}`, { ttl: 0, tag: 'global-live-market-v0481-' + sym + '-' + nonce });
  const normalized = _ruxNormalizeMarketRouterPayload(router, { symbol: sym, tf });
  if (normalized?.candles?.length || normalized?.ticker?.price) return normalized;

  // Legacy fallback: keep older /api/market alive only if the router is completely unavailable.
  const legacy = await api(`/api/market?symbol=${encodeURIComponent(sym)}&tf=${tf}&limit=${lim}`, { ttl: 5_000, tag: 'legacy-market-fallback-v0481-' + sym });
  if (legacy) {
    const candles = Array.isArray(legacy.candles) ? legacy.candles : (Array.isArray(legacy.ohlcv) ? legacy.ohlcv : []);
    return { ...legacy, candles, ohlcv: candles, source: legacy.source || 'Legacy Market Fallback', market: legacy.market || 'legacy', normalizedBy: 'legacy-fallback-v0.56.0' };
  }
  return null;
}
export async function fetchNews(symbol = 'BTCUSDT', lang = 'tr', mode = 'global', opts = {}) {
  const settings = getRuxSettings();
  const params = new URLSearchParams({
    symbol: String(symbol || 'BTCUSDT'),
    lang: String(lang || 'tr'),
    mode: String(mode || 'global'),
    limit: String(opts.limit || 32)
  });
  if (settings.telegramNewsSource) params.set('telegram', settings.telegramNewsSource);
  if (opts.force || opts.noCache) params.set('refresh', String(Date.now()));
  return api(`/api/news-pulse?${params.toString()}`, { ttl: opts.force || opts.noCache ? 0 : 5_000, tag: opts.force ? 'force-news-v049' : 'news-v049' });
}
export async function fetchFearGreed() {
  return api('/api/feargreed', { ttl: 5*60_000 });
}
export async function fetchFunding(symbol = 'BTCUSDT') {
  return api(`/api/funding-history?symbol=${encodeURIComponent(symbol)}`, { ttl: 60_000 });
}
export async function fetchFutures(symbol = 'BTCUSDT') {
  return api(`/api/futures?symbol=${encodeURIComponent(symbol)}`, { ttl: 30_000 });
}
export async function fetchTickers(symbols = null) {
  const q = symbols && symbols.length ? `?symbols=${encodeURIComponent(symbols.join(','))}` : '';
  return api(`/api/tickers${q}`, { ttl: 20_000 });
}
export async function fetchEconCalendar(from = null, to = null) {
  const params = [];
  if (from) params.push('from=' + from);
  if (to) params.push('to=' + to);
  const q = params.length ? '?' + params.join('&') : '';
  return api(`/api/econ-calendar${q}`, { ttl: 30 * 60_000 });
}
export async function fetchDerivs(type = 'oi', symbol = 'BTCUSDT', period = '5m') {
  const q = `?type=${encodeURIComponent(type)}&symbol=${encodeURIComponent(symbol)}&period=${encodeURIComponent(period)}`;
  return api(`/api/derivs${q}`, { ttl: 30_000 });
}
export async function fetchLiquidity(symbol = 'BTCUSDT') {
  return api(`/api/liquidity?symbol=${encodeURIComponent(symbol)}`, { ttl: 30_000 });
}
export async function fetchAttention() {
  return api('/api/attention', { ttl: 90_000 });
}
export async function fetchIntel() {
  return api('/api/intel', { ttl: 60_000 });
}
export async function fetchCMC(limit = 50) {
  return api(`/api/cmc?limit=${limit}`, { ttl: 60_000 });
}
export async function fetchCVD(symbol = 'BTCUSDT', limit = 1000) {
  return api(`/api/cvd?symbol=${encodeURIComponent(symbol)}&limit=${Math.max(100, Math.min(1000, Number(limit)||1000))}`, { ttl: 30_000 });
}
export async function fetchDefiLlama() {
  return api('/api/defillama', { ttl: 5*60_000 });
}
export async function fetchHyperliquid(symbol = 'BTC', mode = 'derivatives') {
  return api(`/api/hyperliquid?mode=${encodeURIComponent(mode)}&symbol=${encodeURIComponent(symbol)}`, { ttl: 30_000 });
}
export async function fetchDune(slot = 'stablecoin', queryId = '', limit = 100) {
  const q = queryId ? `&queryId=${encodeURIComponent(queryId)}` : '';
  return api(`/api/hyperliquid?mode=dune&slot=${encodeURIComponent(slot)}&limit=${Math.max(1, Math.min(1000, Number(limit)||100))}${q}`, { ttl: 2*60_000 });
}

/* ---- dom helpers ---- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class' || k === 'className') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'on' && typeof v === 'object') {
      for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    }
    else if (k.startsWith('data-')) e.setAttribute(k, v);
    else if (k in e) { try { e[k] = v; } catch { e.setAttribute(k, v); } }
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string' || typeof c === 'number') e.appendChild(document.createTextNode(String(c)));
    else e.appendChild(c);
  }
  return e;
}

export function svg(name, attrs = {}, ...children) {
  const ns = 'http://www.w3.org/2000/svg';
  const e = document.createElementNS(ns, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    e.setAttribute(k, String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

/* Toast notifications */
export function toast(msg, kind = 'info', title = '') {
  const host = document.getElementById('om-toast-host');
  if (!host) return;
  const t = el('div', { class: 'toast ' + kind });
  if (title) t.appendChild(el('div', { class: 'tt' }, title));
  t.appendChild(el('div', { class: 'tm' }, msg));
  host.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
}

/* simple seeded random for stable demo numbers */
export function seedRand(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

/* compute basic indicators on a closes array */
export function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (prev === null) prev = v;
    else prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return Array(closes.length).fill(null);
  const out = Array(closes.length).fill(null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i-1];
    if (d > 0) avgGain += d; else avgLoss += -d;
  }
  avgGain /= period; avgLoss /= period;
  out[period] = 100 - (100 / (1 + avgGain / (avgLoss || 1e-9)));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i-1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = 100 - (100 / (1 + avgGain / (avgLoss || 1e-9)));
  }
  return out;
}
export function atr(candles, period = 14) {
  if (candles.length < period + 1) return Array(candles.length).fill(null);
  const tr = [], out = Array(candles.length).fill(null);
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i], p = i > 0 ? candles[i-1] : c;
    tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
  }
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  out[period - 1] = sum / period;
  for (let i = period; i < candles.length; i++) {
    out[i] = (out[i-1] * (period - 1) + tr[i]) / period;
  }
  return out;
}

/* ---- App-wide state ---- */
export const State = {
  symbol: 'BTCUSDT',
  tf: '4h',
  theme: 'dark',
  watchlist: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','LINKUSDT','AVAXUSDT','ARBUSDT','MATICUSDT'],
  starred: new Set(),
  listeners: new Map(),
  on(ev, fn) { (this.listeners.get(ev) || this.listeners.set(ev, []).get(ev)).push(fn); },
  emit(ev, ...args) { (this.listeners.get(ev) || []).forEach(fn => { try { fn(...args); } catch {} }); },
  setSymbol(s) { this.symbol = s.toUpperCase(); this.emit('symbol', this.symbol); },
  setTf(tf) { this.tf = tf; this.emit('tf', tf); },
};

export function coinClass(symbol) {
  const s = String(symbol || '').toUpperCase().replace(/USDT$|USDC$|USD$|BUSD$|TRY$/, '');
  return s.toLowerCase();
}
export function coinShort(symbol) {
  return String(symbol || '').toUpperCase().replace(/USDT$|USDC$|USD$|BUSD$|TRY$/, '');
}
export function coinName(symbol) {
  const m = {
    BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', BNB: 'BNB',
    XRP: 'XRP', AVAX: 'Avalanche', ARB: 'Arbitrum', LINK: 'Chainlink',
    MATIC: 'Polygon', POL: 'Polygon', ADA: 'Cardano', DOT: 'Polkadot',
    DOGE: 'Dogecoin', SHIB: 'Shiba Inu', NEAR: 'NEAR Protocol',
    APT: 'Aptos', SUI: 'Sui', UNI: 'Uniswap', AAVE: 'Aave', MKR: 'Maker',
    OP: 'Optimism', ATOM: 'Cosmos', PEPE: 'PEPE', BONK: 'BONK', USDC: 'USD Coin', USDT: 'Tether',
  };
  return m[coinShort(symbol)] || coinShort(symbol);
}
