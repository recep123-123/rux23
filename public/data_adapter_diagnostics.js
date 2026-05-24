/* RUx — Adapter Diagnostics Panel */
import { el, State, fmtPrice, fmtTime } from './api.js?v=0.75.8-heatmap-panel-live-20260524';
import { runAdapterDiagnostics, loadLastUnifiedMarketData, exportAdapterDiagnostics, RUX_UNIFIED_MARKET_SCHEMA } from './rux_data_adapters.js?v=0.75.8-heatmap-panel-live-20260524';

const toneMap = { LIVE:'pos', FALLBACK:'warn', STALE:'warn', OFFLINE:'neg', OPTIONAL_OFFLINE:'muted' };
function clsForMode(mode) { return toneMap[String(mode||'').toUpperCase()] || 'muted'; }
function pct(v) { return Math.round(Number(v || 0)) + '/100'; }
function age(ms) {
  const n = Number(ms || 0);
  if (n < 1000) return n + 'ms';
  if (n < 60000) return Math.round(n/1000) + 'sn';
  if (n < 3600000) return Math.round(n/60000) + 'dk';
  return Math.round(n/3600000) + 'sa';
}
function chip(text, tone='muted') { return el('span', { class: 'rux-chip ' + tone }, text); }
function card(title, value, sub, tone='') {
  return el('div', { class:'rux-card' },
    el('div', { class:'small muted' }, title),
    el('div', { class:'metric ' + tone }, value),
    el('div', { class:'tiny muted' }, sub || '')
  );
}
function row(label, value, tone='') {
  return el('div', { class:'kv' }, el('span', {}, label), el('b', { class:tone }, value));
}
function metricGrid(payload) {
  const q = payload.quality || {};
  return el('div', { class:'rux-grid-4' },
    card('Adapter Confidence', pct(q.confidence), payload.gate?.label || '—', q.confidence >= 85 ? 'pos' : q.confidence >= 70 ? 'warn' : 'neg'),
    card('Veri Modu', payload.mode || '—', `${q.liveCount || 0} live · ${q.fallbackCount || 0} fallback`, clsForMode(payload.mode)),
    card('OHLCV Count', String(payload.ohlcv?.length || 0), `${payload.symbol} · ${payload.timeframe}`, payload.ohlcv?.length ? 'pos' : 'neg'),
    card('Signal Gate', payload.deployment || payload.gate?.signalMode || '—', `Çarpan: ${Number(payload.gate?.multiplier ?? 0).toFixed(2)}x`, payload.gate?.freezeNewSignals ? 'neg' : 'pos')
  );
}
function qualityBars(q = {}) {
  const items = [
    ['Freshness', q.freshness], ['Completeness', q.completeness], ['Consistency', q.consistency], ['Reliability', q.sourceReliability]
  ];
  return el('div', { class:'rux-card' },
    el('h3', {}, 'Unified Quality Breakdown'),
    ...items.map(([k,v]) => el('div', { class:'mt-10' },
      el('div', { class:'flex between small' }, el('span', {}, k), el('b', { class: Number(v)>=80?'pos':Number(v)>=60?'warn':'neg' }, pct(v))),
      el('div', { class:'rux-progress' }, el('i', { style:`width:${Math.max(0,Math.min(100,Number(v||0)))}%` }))
    ))
  );
}
function adapterTable(rows = []) {
  const table = el('table', { class:'rux-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Adapter'), el('th', {}, 'Mode'), el('th', {}, 'Source'), el('th', {}, 'Latency'), el('th', {}, 'Count'), el('th', {}, 'Confidence'), el('th', {}, 'Not')
    )),
    el('tbody', {})
  );
  const tb = table.querySelector('tbody');
  rows.forEach(r => tb.appendChild(el('tr', {},
    el('td', {}, el('div', { class:'bold' }, r.name), el('div', { class:'tiny muted' }, `${r.kind} · ${r.critical ? 'critical' : 'optional'}`)),
    el('td', {}, chip(r.mode || '—', clsForMode(r.mode))),
    el('td', { class:'small' }, r.source || '—'),
    el('td', { class:'mono small' }, `${Math.round(Number(r.latencyMs || 0))}ms`),
    el('td', { class:'mono small' }, String(r.count ?? '—')),
    el('td', { class: Number(r.quality?.confidence)>=80?'pos':Number(r.quality?.confidence)>=60?'warn':'neg' }, pct(r.quality?.confidence)),
    el('td', { class:'tiny muted' }, r.ok ? (r.normalized ? 'Normalize OK' : 'Ham veri var') : (r.error || 'Offline'))
  )));
  return table;
}
function endpointTable(rows = []) {
  const table = el('table', { class:'rux-table compact' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Endpoint'), el('th', {}, 'Durum'), el('th', {}, 'Kategori'), el('th', {}, 'Latency'), el('th', {}, 'Kaynak'))),
    el('tbody', {})
  );
  const tb = table.querySelector('tbody');
  rows.slice(0, 16).forEach(r => tb.appendChild(el('tr', {},
    el('td', { class:'tiny mono' }, String(r.path || '').replace('/api/','')),
    el('td', {}, chip(r.ok ? 'OK' : 'FAIL', r.ok ? 'pos' : (r.optional ? 'warn' : 'neg'))),
    el('td', { class:'small' }, r.category || 'system'),
    el('td', { class:'mono small' }, `${r.latencyMs ?? '—'}ms`),
    el('td', { class:'tiny muted' }, r.source || r.error || '—')
  )));
  return table;
}
function schemaBox() {
  return el('div', { class:'rux-card' },
    el('h3', {}, 'Unified Market Data Schema'),
    el('div', { class:'tiny muted mb-8' }, 'Sinyal motoruna veri artık tek sözleşmeyle verilecek. Mock/fallback/live ayrımı saklanmayacak.'),
    el('pre', { class:'rux-code' }, JSON.stringify(RUX_UNIFIED_MARKET_SCHEMA, null, 2))
  );
}
function sourceSummary(payload) {
  const last = payload.ohlcv?.at(-1);
  return el('div', { class:'rux-card' },
    el('h3', {}, 'Normalized Snapshot'),
    row('Symbol', payload.symbol || '—'),
    row('Timeframe', payload.timeframe || '—'),
    row('Ticker Price', payload.ticker?.price ? fmtPrice(payload.ticker.price) : '—'),
    row('Last Candle', last ? `${new Date(last.time).toLocaleString('tr-TR')} · ${fmtPrice(last.close)}` : '—', last ? 'pos' : 'neg'),
    row('Funding', Number(payload.funding?.rate ?? 0).toFixed(5), 'mono'),
    row('Open Interest', payload.openInterest?.value ? Math.round(payload.openInterest.value).toLocaleString('en-US') : '—'),
    row('Binance Basis', payload.binanceLive?.basis?.basisPct !== null && payload.binanceLive?.basis?.basisPct !== undefined ? Number(payload.binanceLive.basis.basisPct).toFixed(5) + '%' : '—'),
    row('Liquidity Score', payload.liquidity?.liquidityScore ? String(Math.round(payload.liquidity.liquidityScore)) : '—'),
    row('News Items', String(payload.news?.items?.length || 0)),
    row('Checked', fmtTime(payload.timestamp || Date.now()))
  );
}
function blockersBox(payload) {
  const hard = payload.hardBlocks || [];
  const rec = payload.recommendations || [];
  return el('div', { class:'rux-card' },
    el('h3', {}, 'Freshness Lock & Deployment Gate'),
    el('div', { class:'rux-note ' + (hard.length ? 'bad' : payload.gate?.freezeNewSignals ? 'bad' : payload.quality?.confidence >= 70 ? 'ok' : 'warn') },
      hard.length ? 'Yeni sinyal üretimi dondurulmalı.' : payload.gate?.freezeNewSignals ? 'Signal freeze aktif.' : 'Adapter katmanı sinyal akışına bağlanabilir.'
    ),
    el('div', { class:'mt-12' }, ...(hard.length ? hard : ['Hard block yok']).map(x => el('div', { class:'tiny ' + (hard.length ? 'neg' : 'pos') }, '• ' + x))),
    el('div', { class:'mt-12' }, ...rec.map(x => el('div', { class:'tiny muted' }, '• ' + x)))
  );
}

export async function renderDataAdapterDiagnostics(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const cached = loadLastUnifiedMarketData();
  const shell = el('div', { class:'page-wrap' },
    el('div', { class:'page-head' },
      el('div', {}, el('h1', {}, 'Exchange Data Router & Normalization'), el('p', { class:'muted' }, 'Canlı/mock/fallback/stale/offline kaynakları tek veri şemasına çevirir; v0.48 ile Binance erişim bloklarında Bybit/OKX fallback kullanan router katmanını doğrular.')),
      el('div', { class:'flex gap-8' },
        el('button', { class:'btn primary', id:'btnRunAdapter' }, 'Adapter Testi Çalıştır'),
        el('button', { class:'btn', id:'btnForceAdapter' }, 'Force Refresh'),
        el('button', { class:'btn', id:'btnExportAdapter' }, 'JSON Export'),
        el('button', { class:'btn', id:'btnBinanceLiveNav' }, 'Exchange Data Router')
      )
    ),
    el('div', { id:'adapterStatus', class:'rux-note warn' }, cached ? 'Son adapter raporu yüklendi. Güncel test için çalıştır.' : 'Henüz adapter testi çalıştırılmadı.'),
    el('div', { id:'adapterBody' })
  );
  host.appendChild(shell);
  const body = shell.querySelector('#adapterBody');
  async function draw(force = false) {
    body.innerHTML = '<div class="skeleton big"></div><div class="skeleton"></div>';
    shell.querySelector('#adapterStatus').textContent = force ? 'Force refresh ile adapter testleri çalışıyor...' : 'Adapter testleri çalışıyor...';
    const payload = await runAdapterDiagnostics({ symbol, tf, force });
    shell.querySelector('#adapterStatus').className = 'rux-note ' + (payload.gate?.freezeNewSignals ? 'bad' : payload.quality?.confidence >= 70 ? 'ok' : 'warn');
    shell.querySelector('#adapterStatus').textContent = `${payload.deployment} · ${payload.mode} · confidence ${pct(payload.quality?.confidence)} · ${payload.latencyMs}ms`;
    body.innerHTML = '';
    body.appendChild(metricGrid(payload));
    body.appendChild(el('div', { class:'rux-grid-2 mt-16' }, sourceSummary(payload), qualityBars(payload.quality)));
    body.appendChild(el('div', { class:'rux-card mt-16' }, el('h3', {}, 'Adapter Diagnostics'), adapterTable(payload.adapters || [])));
    body.appendChild(el('div', { class:'rux-grid-2 mt-16' }, blockersBox(payload), schemaBox()));
    body.appendChild(el('div', { class:'rux-card mt-16' }, el('h3', {}, 'Endpoint Cross-Check'), endpointTable(payload.endpointRows || [])));
  }
  shell.querySelector('#btnBinanceLiveNav').onclick = () => { location.hash = '#/binance-live'; };
  shell.querySelector('#btnRunAdapter').onclick = () => draw(false).catch(e => { shell.querySelector('#adapterStatus').textContent = e.message || String(e); shell.querySelector('#adapterStatus').className='rux-note bad'; });
  shell.querySelector('#btnForceAdapter').onclick = () => draw(true).catch(e => { shell.querySelector('#adapterStatus').textContent = e.message || String(e); shell.querySelector('#adapterStatus').className='rux-note bad'; });
  shell.querySelector('#btnExportAdapter').onclick = async () => {
    try { await navigator.clipboard.writeText(exportAdapterDiagnostics()); shell.querySelector('#adapterStatus').textContent = 'Adapter JSON panoya kopyalandı.'; } catch { alert(exportAdapterDiagnostics()); }
  };
  if (cached) {
    body.appendChild(el('div', { class:'rux-grid-4' },
      card('Son Rapor', cached.mode || '—', cached.symbol || symbol),
      card('Confidence', pct(cached.quality?.confidence), cached.gate?.label || '—'),
      card('OHLCV', String(cached.ohlcvCount || cached.ohlcv?.length || 0), 'normalized candles'),
      card('Gate', cached.gate?.signalMode || '—', cached.gate?.freezeNewSignals ? 'freeze' : 'active')
    ));
  }
}
