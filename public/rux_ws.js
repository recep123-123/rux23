/* RUx — Birleşik WebSocket Canlı Akış Katmanı (Sprint 4, A15+A16)
   Binance (kline + aggTrades) ve Hyperliquid (trades + l2Book) canlı akışları.
   REST polling'i TAMAMEN değiştirmez; onun ÜZERİNE gerçek-zamanlı bir kanal ekler.
   WS yoksa/koparsa sessizce REST'e degrade olur (mevcut akış bozulmaz).

   Tasarım:
   - Tek seferde tek sembol abone olunur (terminal aktif coin). Abonelik değişince
     eski bağlantı kapatılır.
   - Otomatik yeniden bağlanma (exponential backoff, maks 30sn).
   - Son fiyat/delta/orderbook imbalance State.emit ile yayılır → UI tepki verir.
   - Binance WS ücretsiz (IP başına 5 bağlantı, 24s sonra reconnect gerekir).
   - Hyperliquid WS ücretsiz, perp DEX fiyat keşfi (cross-exchange teyit).
*/

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
const BINANCE_WS_FUT = 'wss://fstream.binance.com/ws';
const HYPERLIQUID_WS = 'wss://api.hyperliquid.xyz/ws';

const MAX_BACKOFF_MS = 30000;
const BASE_BACKOFF_MS = 1000;

function wsAvailable() {
  return typeof WebSocket !== 'undefined';
}

// ---- Tek sembol için canlı kanal yöneticisi ----
class LiveChannel {
  constructor({ onUpdate = null, onStatus = null } = {}) {
    this.onUpdate = onUpdate;
    this.onStatus = onStatus;
    this.symbol = null;
    this.tf = '1m';
    this._binance = null;
    this._hyper = null;
    this._backoff = BASE_BACKOFF_MS;
    this._closedByUser = false;
    this._lastState = {};
    this._reconnectTimers = [];
  }

  status(state, detail = '') {
    if (typeof this.onStatus === 'function') {
      try { this.onStatus({ state, detail, symbol: this.symbol, ts: Date.now(), binanceLive: this._binanceLive, hyperLive: this._hyperLive }); } catch {}
    }
  }

  emit(patch) {
    this._lastState = { ...this._lastState, ...patch, updatedAt: Date.now() };
    if (typeof this.onUpdate === 'function') {
      try { this.onUpdate(this._lastState); } catch {}
    }
  }

  // Bir sembole abone ol (öncekini kapatır).
  subscribe(symbol, tf = '1m') {
    if (!wsAvailable()) { this.status('unavailable', 'WebSocket tarayıcıda yok; REST modu sürüyor'); return false; }
    const sym = String(symbol || 'BTCUSDT').toUpperCase();
    if (this.symbol === sym && (this._binance || this._hyper)) return true; // zaten abone
    this.unsubscribe();
    this.symbol = sym;
    this.tf = tf;
    this._closedByUser = false;
    this._backoff = BASE_BACKOFF_MS;
    this._connectBinance();
    this._connectHyperliquid();
    this.status('connecting', sym);
    return true;
  }

  unsubscribe() {
    this._closedByUser = true;
    this._reconnectTimers.forEach(t => clearTimeout(t));
    this._reconnectTimers = [];
    [this._binance, this._hyper].forEach(ws => { try { ws && ws.close(); } catch {} });
    this._binance = null;
    this._hyper = null;
  }

  _scheduleReconnect(which) {
    if (this._closedByUser) return;
    const delay = Math.min(this._backoff, MAX_BACKOFF_MS);
    this._backoff = Math.min(this._backoff * 2, MAX_BACKOFF_MS);
    const t = setTimeout(() => {
      if (this._closedByUser) return;
      if (which === 'binance') this._connectBinance();
      else this._connectHyperliquid();
    }, delay);
    this._reconnectTimers.push(t);
  }

  _connectBinance() {
    if (!wsAvailable() || this._closedByUser) return;
    const sym = this.symbol.toLowerCase();
    // Spot kline_1m + aggTrade tek bağlantıda (combined stream alternatifi: tek tek)
    const streams = `${sym}@aggTrade/${sym}@kline_1m`;
    let ws;
    try { ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`); }
    catch { this.status('error', 'Binance WS açılamadı'); this._scheduleReconnect('binance'); return; }
    this._binance = ws;
    let cvdRunning = 0; // basit canlı CVD birikimi (oturum içi)

    ws.onopen = () => { this._backoff = BASE_BACKOFF_MS; this._binanceLive = true; this.status('live', 'Binance WS bağlı'); };
    ws.onmessage = (msg) => {
      let payload; try { payload = JSON.parse(msg.data); } catch { return; }
      const d = payload?.data || payload;
      if (!d) return;
      if (d.e === 'aggTrade') {
        const price = Number(d.p), qty = Number(d.q), isBuyerMaker = d.m;
        // m=true → alıcı maker → satış agresif; m=false → alış agresif
        const delta = isBuyerMaker ? -qty : qty;
        cvdRunning += delta;
        this.emit({ price, lastTrade: { price, qty, side: isBuyerMaker ? 'SELL' : 'BUY', ts: d.T }, liveCvd: cvdRunning, source: 'binance-ws' });
      } else if (d.e === 'kline') {
        const k = d.k;
        this.emit({
          price: Number(k.c),
          liveCandle: { open: Number(k.o), high: Number(k.h), low: Number(k.l), close: Number(k.c), volume: Number(k.v), closed: !!k.x, time: k.t },
          source: 'binance-ws'
        });
      }
    };
    ws.onerror = () => { this._binanceLive = false; this.status('error', 'Binance WS hata'); };
    ws.onclose = () => {
      this._binanceLive = false;
      if (this._binance === ws) this._binance = null;
      if (!this._closedByUser) {
        this._binanceRetries = (this._binanceRetries || 0) + 1;
        // Binance WS Türkiye gibi bazı bölgelerden engellenebilir. 3 başarısız denemeden
        // sonra ısrarı bırakıp REST/Hyperliquid moduna geç (sonsuz reconnect döngüsü olmasın).
        if (this._binanceRetries >= 3) {
          this.status('binance_blocked', 'Binance WS erişilemiyor; Hyperliquid + REST modu aktif');
        } else {
          this.status('reconnecting', 'Binance WS koptu');
          this._scheduleReconnect('binance');
        }
      }
    };
  }

  _connectHyperliquid() {
    if (!wsAvailable() || this._closedByUser) return;
    const coin = this.symbol.replace(/USDT$|USD$|PERP$/i, '');
    let ws;
    try { ws = new WebSocket(HYPERLIQUID_WS); }
    catch { this.status('error', 'Hyperliquid WS açılamadı'); this._scheduleReconnect('hyper'); return; }
    this._hyper = ws;

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'trades', coin } }));
        ws.send(JSON.stringify({ method: 'subscribe', subscription: { type: 'l2Book', coin } }));
      } catch {}
      this.status('live', 'Hyperliquid WS bağlı');
      this._hyperLive = true;
    };
    ws.onmessage = (msg) => {
      let payload; try { payload = JSON.parse(msg.data); } catch { return; }
      const ch = payload?.channel;
      if (ch === 'trades' && Array.isArray(payload.data)) {
        const last = payload.data[payload.data.length - 1];
        if (last) this.emit({ hlPrice: Number(last.px), hlLastTrade: { price: Number(last.px), size: Number(last.sz), side: last.side, ts: last.time }, source: 'hyperliquid-ws' });
      } else if (ch === 'l2Book' && payload.data) {
        const levels = payload.data.levels;
        if (Array.isArray(levels) && levels.length === 2) {
          const bids = levels[0] || [], asks = levels[1] || [];
          const bidUsd = bids.slice(0, 10).reduce((a, b) => a + Number(b.px) * Number(b.sz), 0);
          const askUsd = asks.slice(0, 10).reduce((a, b) => a + Number(b.px) * Number(b.sz), 0);
          const total = bidUsd + askUsd;
          const imbalance = total > 0 ? (bidUsd - askUsd) / total : 0;
          const bestBid = bids[0] ? Number(bids[0].px) : null;
          const bestAsk = asks[0] ? Number(asks[0].px) : null;
          const spreadBps = bestBid && bestAsk ? (bestAsk - bestBid) / ((bestBid + bestAsk) / 2) * 10000 : null;
          this.emit({ hlBook: { bidUsd: Math.round(bidUsd), askUsd: Math.round(askUsd), imbalance: Math.round(imbalance * 1000) / 1000, spreadBps: spreadBps != null ? Math.round(spreadBps * 100) / 100 : null }, source: 'hyperliquid-ws' });
        }
      }
    };
    ws.onerror = () => { this._hyperLive = false; this.status('error', 'Hyperliquid WS hata'); };
    ws.onclose = () => { this._hyperLive = false; if (this._hyper === ws) this._hyper = null; if (!this._closedByUser) { this.status('reconnecting', 'Hyperliquid WS koptu'); this._scheduleReconnect('hyper'); } };
  }

  // Cross-exchange teyit: Binance ve Hyperliquid fiyatları ne kadar uyumlu?
  crossExchangeCheck() {
    const s = this._lastState;
    if (Number.isFinite(s.price) && Number.isFinite(s.hlPrice) && s.price > 0) {
      const divergencePct = Math.abs(s.price - s.hlPrice) / s.price * 100;
      return {
        available: true,
        binancePrice: s.price,
        hyperliquidPrice: s.hlPrice,
        divergencePct: Math.round(divergencePct * 1000) / 1000,
        agreement: divergencePct < 0.1 ? 'YÜKSEK' : divergencePct < 0.35 ? 'ORTA' : 'DÜŞÜK',
        warning: divergencePct >= 0.35 ? 'Borsalar arası fiyat ayrışması yüksek; manipülasyon/likidite riski.' : null
      };
    }
    return { available: false };
  }

  snapshot() { return { ...this._lastState, crossExchange: this.crossExchangeCheck() }; }
}

// Singleton kanal (terminal aktif coin için)
let _channel = null;
export function getLiveChannel(opts = {}) {
  if (!_channel) _channel = new LiveChannel(opts);
  else {
    if (opts.onUpdate) _channel.onUpdate = opts.onUpdate;
    if (opts.onStatus) _channel.onStatus = opts.onStatus;
  }
  return _channel;
}

export function subscribeLive(symbol, tf = '1m', handlers = {}) {
  const ch = getLiveChannel(handlers);
  ch.subscribe(symbol, tf);
  return ch;
}

export function unsubscribeLive() {
  if (_channel) _channel.unsubscribe();
}

export function liveSnapshot() {
  return _channel ? _channel.snapshot() : null;
}

export function isWebSocketAvailable() { return wsAvailable(); }
export { LiveChannel };
