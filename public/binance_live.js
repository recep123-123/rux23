/* RUx — Exchange Data Router Panel */
import { el, State, fmtPrice, fmtTime } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { fetchBinanceLive } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { buildUnifiedMarketData } from './rux_data_adapters.js?v=0.75.10-heatmap-fidelity-pass-20260524';

function pct(v, d = 3) { return v === null || v === undefined || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(d) + '%'; }
function num(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }
function tone(v, good = 80, warn = 60) { const n = Number(v || 0); return n >= good ? 'pos' : n >= warn ? 'warn' : 'neg'; }
function chip(text, toneName = 'muted') { return el('span', { class: 'rux-chip ' + toneName }, text); }
function card(title, value, sub = '', toneName = '') {
  return el('div', { class: 'rux-card' },
    el('div', { class: 'small muted' }, title),
    el('div', { class: 'metric ' + toneName }, value),
    el('div', { class: 'tiny muted' }, sub)
  );
}
function kv(label, value, toneName = '') {
  return el('div', { class: 'kv' }, el('span', {}, label), el('b', { class: toneName }, value));
}
function statusNote(payload) {
  const q = payload?.quality?.confidence || 0;
  const live = payload?.ok && /LIVE/.test(String(payload?.mode || ''));
  return el('div', { class: 'rux-note ' + (live && q >= 70 ? 'ok' : q >= 50 ? 'warn' : 'bad') },
    live ? `Exchange router canlı. Confidence ${Math.round(q)}/100.` : `Exchange router degraded/offline. Confidence ${Math.round(q)}/100; sinyal motoru bu etiketi görmeli.`
  );
}
function depthBox(title, d) {
  return el('div', { class: 'rux-card' },
    el('h3', {}, title),
    kv('Bid', d?.bidPx ? fmtPrice(d.bidPx) : '—'),
    kv('Ask', d?.askPx ? fmtPrice(d.askPx) : '—'),
    kv('Spread', d?.spreadBps !== null && d?.spreadBps !== undefined ? `${Number(d.spreadBps).toFixed(3)} bps` : '—'),
    kv('Top20 Depth', d?.depthUsd ? '$' + Math.round(d.depthUsd).toLocaleString('en-US') : '—'),
    kv('Levels', d?.levels ? `${d.levels.bids || 0}/${d.levels.asks || 0}` : '—')
  );
}

function quickGate(payload) {
  const c = Number(payload?.quality?.confidence || 0);
  if (!payload?.ok || c < 50) return { quality: payload?.quality || {}, gate: { label: 'SIGNAL FREEZE', freezeNewSignals: true, signalMode: 'FREEZE' } };
  if (c < 70) return { quality: payload.quality, gate: { label: 'WATCH ONLY', freezeNewSignals: false, signalMode: 'WATCH' } };
  if (c < 85) return { quality: payload.quality, gate: { label: 'TAGGED LIVE', freezeNewSignals: false, signalMode: 'TAGGED' } };
  return { quality: payload.quality, gate: { label: 'LIVE READY', freezeNewSignals: false, signalMode: 'NORMAL' } };
}

function candlesTable(title, rows = []) {
  const table = el('table', { class: 'rux-table compact' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Zaman'), el('th', {}, 'Open'), el('th', {}, 'High'), el('th', {}, 'Low'), el('th', {}, 'Close'), el('th', {}, 'Quote Vol'))),
    el('tbody', {})
  );
  const tb = table.querySelector('tbody');
  rows.slice(-8).reverse().forEach(c => tb.appendChild(el('tr', {},
    el('td', { class: 'tiny muted' }, new Date(c.time).toLocaleString('tr-TR')),
    el('td', { class: 'mono small' }, fmtPrice(c.open)),
    el('td', { class: 'mono small' }, fmtPrice(c.high)),
    el('td', { class: 'mono small' }, fmtPrice(c.low)),
    el('td', { class: 'mono small bold' }, fmtPrice(c.close)),
    el('td', { class: 'mono small' }, c.quoteVolume ? Math.round(c.quoteVolume).toLocaleString('en-US') : '—')
  )));
  return el('div', { class: 'rux-card' }, el('h3', {}, title), table);
}
function renderPayload(body, payload, unified) {
  const spot = payload.spot || {};
  const fut = payload.futures || {};
  const der = payload.derivatives || {};
  const basis = payload.basis || {};
  body.innerHTML = '';
  body.appendChild(statusNote(payload));
  body.appendChild(el('div', { class: 'rux-grid-4 mt-16' },
    card('Mode', payload.mode || '—', payload.source || '—', payload.ok ? 'pos' : 'warn'),
    card('Spot Live Price', spot.ticker?.price ? fmtPrice(spot.ticker.price) : '—', `${spot.candles?.length || 0} spot candle · ${spot.ticker?.timestamp ? "ticker " + new Date(spot.ticker.timestamp).toLocaleTimeString("tr-TR") : "poll"}`, spot.ticker?.price ? 'pos' : 'neg'),
    card('Mark / Futures', basis.markPrice ? fmtPrice(basis.markPrice) : fut.ticker?.price ? fmtPrice(fut.ticker.price) : '—', `${fut.candles?.length || 0} futures candle`, fut.candles?.length ? 'pos' : 'neg'),
    card('Basis', pct(basis.basisPct, 5), 'Mark - Spot', Math.abs(num(basis.basisPct) || 0) < .25 ? 'pos' : 'warn')
  ));
  body.appendChild(el('div', { class: 'rux-grid-4 mt-16' },
    card('Funding', der.fundingRate !== null && der.fundingRate !== undefined ? pct(Number(der.fundingRate) * 100, 5) : '—', der.nextFundingTime ? 'Next: ' + new Date(der.nextFundingTime).toLocaleString('tr-TR') : 'premiumIndex', der.fundingRate !== null && der.fundingRate !== undefined ? 'pos' : 'warn'),
    card('Open Interest', der.openInterest ? Math.round(der.openInterest).toLocaleString('en-US') : '—', 'USDT-M openInterest', der.openInterest ? 'pos' : 'warn'),
    card('Router Confidence', Math.round(payload.quality?.confidence || 0) + '/100', `Fresh ${Math.round(payload.quality?.freshness || 0)} · Comp ${Math.round(payload.quality?.completeness || 0)}`, tone(payload.quality?.confidence)),
    card('Unified Gate', unified?.gate?.label || '—', unified?.gate?.freezeNewSignals ? 'Signal freeze' : 'Signal enabled/tagged', unified?.gate?.freezeNewSignals ? 'neg' : 'pos')
  ));
  body.appendChild(el('div', { class: 'rux-grid-2 mt-16' },
    el('div', { class: 'rux-card' },
      el('h3', {}, 'Spot/Futures Normalized Snapshot'),
      kv('Symbol', payload.symbol || '—'),
      kv('Timeframe', payload.timeframe || '—'),
      kv('Active Exchange', (payload.activeExchange || '—').toUpperCase()),
      kv('Spot Source', spot.source || '—'),
      kv('Futures Source', fut.source || '—'),
      kv('Checked', fmtTime(payload.updatedAt || Date.now())),
      kv('Latency', `${payload.latencyMs || 0}ms`),
      kv('Errors', payload.errors?.length ? payload.errors.slice(0, 2).join(' | ') : 'Yok', payload.errors?.length ? 'warn' : 'pos'),
      kv('Fallback Chain', payload.fallbackChain?.length ? payload.fallbackChain.map(x => `${x.exchange}:${Math.round(x.confidence || 0)}`).join(' > ') : '—')
    ),
    el('div', { class: 'rux-card' },
      el('h3', {}, 'Data Binding Policy'),
      el('div', { class: 'tiny muted mb-8' }, 'v0.48 ile Multi-exchange router adapter katmanına doğrudan bağlandı. Bu panel otomatik emir açmaz; sadece live/missing/degraded ayrımını netleştirir.'),
      kv('Decision Binding', 'DATA GATE ONLY', 'warn'),
      kv('Live OHLCV', spot.candles?.length && fut.candles?.length ? 'OK' : 'MISSING', spot.candles?.length && fut.candles?.length ? 'pos' : 'neg'),
      kv('Derivatives', der.fundingRate !== null && der.openInterest ? 'OK' : 'PARTIAL', der.fundingRate !== null && der.openInterest ? 'pos' : 'warn'),
      kv('Fallback', payload.mode === 'LIVE' ? 'Kapalı' : 'Degraded', payload.mode === 'LIVE' ? 'pos' : 'warn')
    )
  ));
  body.appendChild(el('div', { class: 'rux-grid-2 mt-16' }, depthBox('Spot Depth', spot.depth), depthBox('Futures Depth', fut.depth)));
  body.appendChild(el('div', { class: 'rux-grid-2 mt-16' }, candlesTable('Spot Klines', spot.candles || []), candlesTable('Futures Klines', fut.candles || [])));
}

export async function renderBinanceLive(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const shell = el('div', { class: 'page-wrap' },
    el('div', { class: 'page-head' },
      el('div', {},
        el('h1', {}, 'Exchange Data Router — Binance / Bybit / OKX'),
        el('p', { class: 'muted' }, 'Binance bölgesel olarak bloklanırsa Bybit/OKX public fallback ile spot canlı fiyat, perp/mark, funding, OI ve basis tek router paketinde normalize edilir.')
      ),
      el('div', { class: 'flex gap-8' },
        el('button', { class: 'btn primary', id: 'btnBinanceLive' }, 'Router Live Test'),
        el('button', { class: 'btn', id: 'btnUnified' }, 'Unified Adapter ile Doğrula'),
        el('button', { class: 'btn', id: 'btnJson' }, 'JSON Kopyala')
      )
    ),
    el('div', { id: 'binanceStatus', class: 'rux-note warn' }, 'Henüz router canlı veri testi çalıştırılmadı. Panel açılınca otomatik 10 sn polling başlar.'),
    el('div', { id: 'binanceBody' })
  );
  host.appendChild(shell);
  const status = shell.querySelector('#binanceStatus');
  const body = shell.querySelector('#binanceBody');
  let lastPayload = null;
  let lastUnified = null;
  async function draw() {
    body.innerHTML = '<div class="skeleton big"></div><div class="skeleton"></div>';
    status.className = 'rux-note warn';
    status.textContent = 'Exchange router canlı veri kaynaklarını test ediyor...';
    const payload = await fetchBinanceLive(symbol, tf, 240);
    const unified = lastUnified || quickGate(payload);
    lastPayload = payload; lastUnified = unified;
    status.className = 'rux-note ' + (payload?.ok ? 'ok' : 'bad');
    status.textContent = payload?.ok ? `LIVE · ${payload.activeExchange || "router"} · ${payload.source} · ${payload.latencyMs}ms · auto 10s` : `DEGRADED · ${payload?.errors?.join(' | ') || 'Router canlı veri eksik'}`;
    renderPayload(body, payload || {}, unified || {});
  }
  shell.querySelector('#btnBinanceLive').onclick = () => draw().catch(e => { status.className='rux-note bad'; status.textContent=e.message || String(e); });
  shell.querySelector('#btnUnified').onclick = async () => {
    status.className='rux-note warn'; status.textContent='Unified adapter doğrulaması çalışıyor...';
    lastUnified = await buildUnifiedMarketData({ symbol, tf, force: true });
    status.className = 'rux-note ' + (lastUnified.gate?.freezeNewSignals ? 'bad' : 'ok');
    status.textContent = `${lastUnified.mode} · ${lastUnified.gate?.label} · confidence ${Math.round(lastUnified.quality?.confidence || 0)}/100`;
    if (lastPayload) renderPayload(body, lastPayload, lastUnified);
  };
  shell.querySelector('#btnJson').onclick = async () => {
    const txt = JSON.stringify({ routerLive: lastPayload, unified: lastUnified }, null, 2);
    try { await navigator.clipboard.writeText(txt); status.textContent = 'Router live JSON panoya kopyalandı.'; }
    catch { alert(txt); }
  };
  draw().catch(e => { status.className='rux-note bad'; status.textContent=e.message || String(e); });
  const pollId = setInterval(() => {
    if (location.hash !== '#/binance-live' || !document.body.contains(shell)) return clearInterval(pollId);
    draw().catch(() => {});
  }, 10000);
}
