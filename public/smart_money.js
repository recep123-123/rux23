/* RUx — Smart Money Surgical Live */
import { State, fetchMarket, fmtPrice, fmtPct, el, fmtTime, toast, coinName } from './api.js?v=0.75.14-heatmap-micro-polish-20260524';
import { ICN, statCard, card, pageHead, sparkline, donut, coinPill } from './components.js?v=0.75.14-heatmap-micro-polish-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.14-heatmap-micro-polish-20260524';
import { addAlert, addToWatchlist } from './rux_actions.js?v=0.75.14-heatmap-micro-polish-20260524';
import { makeOrderflowCard } from './rux_orderflow.js?v=0.75.14-heatmap-micro-polish-20260524';

function fmtCompact(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  const abs = Math.abs(x);
  if (abs >= 1e12) return (x / 1e12).toFixed(d) + 'T';
  if (abs >= 1e9) return (x / 1e9).toFixed(d) + 'B';
  if (abs >= 1e6) return (x / 1e6).toFixed(d) + 'M';
  if (abs >= 1e3) return (x / 1e3).toFixed(d) + 'K';
  return x.toFixed(abs >= 100 ? 0 : d);
}

function smAvg(values = []) {
  const arr = values.map(Number).filter(Number.isFinite);
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
}

function pctFromMarket(data = {}, candles = []) {
  const t = data?.ticker || data?.spot?.ticker || {};
  for (const raw of [t.priceChangePercent, t.change, t.change24h, data?.change24h]) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const first = Number(candles[0]?.close);
  const last = Number(candles.at(-1)?.close);
  return first ? ((last - first) / first) * 100 : null;
}

function smVolumeRatio(candles = []) {
  const vols = candles.map(c => Number(c.volume)).filter(Number.isFinite);
  if (vols.length < 50) return 0;
  const recent = smAvg(vols.slice(-20));
  const base = smAvg(vols.slice(-140, -20));
  return base ? recent / base : 0;
}

function smDeltaProxy(candles = []) {
  return candles.slice(-96).reduce((s, c) => {
    const dir = Number(c.close) >= Number(c.open) ? 1 : -1;
    return s + dir * Number(c.volume || 0);
  }, 0);
}

function smWickAbsorption(candles = []) {
  const recent = candles.slice(-60);
  if (!recent.length) return 0;
  const values = recent.map(c => {
    const h = Number(c.high), l = Number(c.low), o = Number(c.open), cl = Number(c.close);
    const range = Math.max(1e-12, h - l);
    const body = Math.abs(cl - o);
    return 1 - Math.min(1, body / range);
  });
  return Math.max(0, Math.min(1, smAvg(values) || 0));
}

function smLevels(candles = []) {
  const recent = candles.slice(-160);
  const highs = recent.map(c => Number(c.high)).filter(Number.isFinite);
  const lows = recent.map(c => Number(c.low)).filter(Number.isFinite);
  const close = Number(recent.at(-1)?.close);
  if (!highs.length || !lows.length) return {};
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  return { high, low, mid: (high + low) / 2, rangePct: close ? ((high - low) / close) * 100 : null };
}

function smBigEvents(candles = [], price = 0) {
  const recent = candles.slice(-180);
  const base = smAvg(recent.map(c => Number(c.volume))) || 0;
  if (!base) return [];
  return recent
    .map(c => ({
      time: Number(c.time) * 1000,
      side: Number(c.close) >= Number(c.open) ? 'OUTFLOW PROXY' : 'INFLOW PROXY',
      vol: Number(c.volume || 0),
      close: Number(c.close || price),
      notional: Number(c.volume || 0) * Number(c.close || price),
      tone: Number(c.close) >= Number(c.open) ? 'pos' : 'neg'
    }))
    .filter(e => e.vol >= base * 1.65)
    .slice(-8)
    .reverse();
}

function loadSmartContext() {
  return (async () => {
    const sym = State.symbol || 'BTCUSDT';
    const tf = State.tf || '4h';
    let market = null;
    try { market = await fetchMarket(sym, tf, 800); } catch {}
    const candles = normalizeCandleInput(market?.candles || market?.ohlcv || market?.spot?.candles || []);
    if (!market || candles.length < 60) return { ok: false, symbol: sym, tf, market, candles, reason: candles.length ? `Yetersiz canlı mum: ${candles.length}/60` : 'Market router veri döndürmedi.' };
    const price = Number(market?.ticker?.price ?? market?.spot?.ticker?.price ?? candles.at(-1)?.close);
    const change = pctFromMarket(market, candles);
    const vRatio = smVolumeRatio(candles);
    const delta = smDeltaProxy(candles);
    const absorption = smWickAbsorption(candles);
    const levels = smLevels(candles);
    const funding = Number(market?.derivatives?.fundingRate);
    const oi = Number(market?.derivatives?.openInterest);
    const mark = Number(market?.derivatives?.markPrice || market?.basis?.markPrice || price);
    const oiNotional = Number.isFinite(oi) && Number.isFinite(mark) ? oi * mark : null;
    const whaleScore = Math.round(Math.max(0, Math.min(100, 42 + Math.min(35, vRatio * 14) + Math.min(18, Math.abs(Number(change || 0)) * 3) + Math.min(12, absorption * 12))));
    const obDensity = Math.max(0, Math.min(1, (vRatio / 2.8) * 0.7 + absorption * 0.3));
    const confidence = Math.round(Math.max(0, Math.min(100, whaleScore * 0.42 + obDensity * 100 * 0.20 + absorption * 100 * 0.22 + (Number.isFinite(funding) || Number.isFinite(oi) ? 16 : 7))));
    const bias = delta >= 0 ? 'ALIM' : 'SATIŞ';
    const deltaTotal = candles.slice(-96).reduce((s, c) => s + Math.abs(Number(c.volume || 0)), 0);
    const biasPct = Math.round(Math.abs(delta) / Math.max(1, deltaTotal) * 100);
    const events = smBigEvents(candles, price);
    return { ok: true, symbol: sym, tf, market, candles, price, change, vRatio, delta, absorption, levels, funding, oi, oiNotional, whaleScore, obDensity, confidence, bias, biasPct, events };
  })();
}

function kv(label, value, tone = '') {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v mono ' + tone }, value));
}

export async function renderSmartMoney(host) {
  host.innerHTML = '';
  const ctx = await loadSmartContext();
  const sym = ctx.symbol || State.symbol || 'BTCUSDT';
  const tf = ctx.tf || State.tf || '4h';
  host.appendChild(pageHead({
    title: 'SMART MONEY',
    subtitle: sym + ' · ' + tf + ' · Kurumsal akışlar, akıllı para hareketleri ve piyasa yapısı.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxCoinInput')?.focus?.() } }, sym.replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, tf + ' ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow', on: { click: () => { addAlert({ symbol: sym, source: 'Smart Money', type: 'smc', side: 'WATCH', message: 'Smart Money / SMC takip alarmı', priority: 'yüksek' }); addToWatchlist(sym); toast('Smart Money alarmı eklendi.', 'success', 'RUx Alarm'); } } }, ICN.bell(12), 'ALERT OLUŞTUR'),
      el('button', { class: 'btn primary', on: { click: () => window.OMNI?.navigate?.('smart-money', { symbol: sym, tf }) } }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  if (ctx.ok) {
    stats.appendChild(statCard({ icon: ICN.whale(18), iconColor: 'blue', label: 'WHALE SCORE', value: ctx.whaleScore + ' / 100', sub: 'Büyük hacim PROXY', subColor: ctx.whaleScore >= 70 ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'purple', label: 'ORDER BLOCK DENSITY', value: ctx.obDensity.toFixed(2), sub: 'Fitil + hacim proxy' }));
    stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: Number.isFinite(ctx.funding) && ctx.funding < 0 ? 'red' : 'green', label: 'LİKİDASYON BASKISI', value: Number.isFinite(ctx.funding) ? fmtPct(ctx.funding * 100, 4) : '—', sub: Number.isFinite(ctx.funding) ? 'Funding LIVE' : 'Funding NO DATA', subColor: Number.isFinite(ctx.funding) ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: '', label: 'ABSORPSİYON GÜCÜ', value: ctx.absorption.toFixed(2), sub: 'Fitil/gövde oranı' }));
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: ctx.delta >= 0 ? 'green' : 'red', label: 'CVD BIAS', value: ctx.bias, sub: '%' + ctx.biasPct + ' delta proxy', subColor: ctx.delta >= 0 ? 'pos' : 'neg' }));
    stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: ctx.confidence >= 70 ? 'green' : 'yellow', label: 'SMART MONEY CONFIDENCE', value: ctx.confidence + '%', sub: Number.isFinite(ctx.oi) ? 'OI LIVE' : 'LIVE/PROXY' }));
  } else {
    stats.appendChild(statCard({ icon: ICN.whale(18), iconColor: 'red', label: 'WHALE SCORE', value: 'BLOKE', sub: ctx.reason, subColor: 'neg' }));
    stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'yellow', label: 'ORDER BLOCK DENSITY', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'yellow', label: 'LİKİDASYON BASKISI', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: '', label: 'ABSORPSİYON GÜCÜ', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'yellow', label: 'CVD BIAS', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'red', label: 'SMART MONEY CONFIDENCE', value: '0%', sub: 'Bloke' }));
  }
  host.appendChild(stats);
  host.appendChild(el('div', { class: 'section' }, makeOrderflowCard(sym, 'RUx ORDER FLOW / CVD + DEFTER TEYİDİ')));

  const row = el('div', { class: 'row fr-2-1 section' });
  row.appendChild(buildSmcChartCard(ctx));
  row.appendChild(buildWhaleActivityCard(ctx));
  host.appendChild(row);

  const row2 = el('div', { class: 'row fr-1-1-2 section' });
  row2.appendChild(buildSpotPerpCard(ctx));
  row2.appendChild(buildExchangeFlowCard(ctx));
  row2.appendChild(buildHighInterestCard(ctx));
  host.appendChild(row2);
}

function buildSmcChartCard(ctx = {}) {
  const wrap = el('div', { class: 'card' });
  const sym = ctx.symbol || State.symbol || 'BTCUSDT';
  const tf = ctx.tf || State.tf || '4h';
  const last = ctx.candles?.at?.(-1) || {};
  const first = ctx.candles?.[0] || {};
  const delta = Number(last.close) - Number(first.close);
  const pct = Number(first.close) ? (delta / Number(first.close)) * 100 : null;
  wrap.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, sym.replace('USDT','/USDT') + ' · ' + tf + ' · RUx'),
    el('span', { class: 'ohlc' }, 'A', el('span', { class: delta >= 0 ? 'up' : 'dn' }, ctx.ok ? fmtPrice(last.open) : '—'), ' Y', el('span', {}, ctx.ok ? fmtPrice(last.high) : '—'), ' D', el('span', { class: 'dn' }, ctx.ok ? fmtPrice(last.low) : '—'), ' K', el('span', { class: delta >= 0 ? 'up' : 'dn' }, ctx.ok ? fmtPrice(last.close) : '—'), el('span', { class: (delta >= 0 ? 'pos' : 'neg') + ' bold' }, ctx.ok ? ' ' + (delta >= 0 ? '+' : '') + fmtPrice(delta) + ' (' + fmtPct(pct) + ')' : ' NO DATA')),
    el('div', { style: 'margin-left:auto; display:inline-flex; gap:6px' },
      el('button', { class: 'om-icon-btn small' }, ICN.gear(12)),
      el('button', { class: 'om-icon-btn small' }, ICN.open(12))
    )
  ));
  const legend = el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'Bullish Delta Proxy'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'Bearish Delta Proxy'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#3b82f6' }), 'Liquidity Zone'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#a78bfa' }), ctx.ok ? ctx.candles.length + ' canlı mum' : 'NO DATA')
  );
  wrap.appendChild(legend);
  const chartHost = el('div', { class: 'chart-host tall' });
  wrap.appendChild(chartHost);
  const cvdHost = el('div', { class: 'chart-host short mt-6', style: 'height:120px' });
  wrap.appendChild(cvdHost);
  wrap.appendChild(el('div', { class: 'chart-bottom-bar' },
    ['1G','5G','1A','3A','6A','Bu sene','1Y','5Y','Tümü'].map(t => el('span', { class: 'pill' + (t === '1A' ? ' active' : '') }, t)),
    el('div', { class: 'right' }, ctx.ok ? new Date().toLocaleTimeString('tr-TR') + ' · LIVE/PROXY' : 'NO DATA')
  ));
  setTimeout(() => drawSmartCharts(ctx, chartHost, cvdHost), 60);
  return wrap;
}

function drawSmartCharts(ctx, chartHost, cvdHost) {
  const candles = ctx?.candles || [];
  if (!ctx.ok || candles.length < 10) {
    chartHost.innerHTML = '<div class="empty">Canlı mum yok. Demo/random çizilmedi.</div>';
    cvdHost.innerHTML = '<div class="empty">Delta proxy yok.</div>';
    return;
  }
  const { chart, series } = makeCandleChart(chartHost);
  const visible = candles.slice(-360);
  series.setData(visible);
  addEmaLine(chart, candles, 20, '#06b6d4');
  addEmaLine(chart, candles, 50, '#f97316');
  if (Number.isFinite(ctx.levels?.high)) series.createPriceLine({ price: ctx.levels.high, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Üst likidite' });
  if (Number.isFinite(ctx.levels?.low)) series.createPriceLine({ price: ctx.levels.low, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Alt likidite' });
  chart.timeScale().fitContent();

  const cvd = [];
  let s = 0;
  for (const c of visible) {
    s += (Number(c.close) >= Number(c.open) ? 1 : -1) * Number(c.volume || 0);
    cvd.push(s);
  }
  drawCanvasLine(cvdHost, cvd, ctx.delta >= 0 ? '#10b981' : '#ef4444');
}

function drawCanvasLine(host, values, color = '#10b981') {
  const w = host.clientWidth || 400, h = host.clientHeight || 120;
  host.innerHTML = '';
  const cv = document.createElement('canvas');
  cv.width = w * 2; cv.height = h * 2; cv.style.width = w + 'px'; cv.style.height = h + 'px';
  host.appendChild(cv);
  const ctx = cv.getContext('2d'); ctx.scale(2, 2);
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(148,163,184,0.10)';
  ctx.beginPath();
  [0.25,0.5,0.75].forEach(t => { ctx.moveTo(0, h*t); ctx.lineTo(w, h*t); });
  ctx.stroke();
  const min = Math.min(...values), max = Math.max(...values);
  const span = Math.max(1, max - min);
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath();
  values.forEach((v, i) => {
    const x = values.length <= 1 ? 0 : (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 12) - 6;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function buildWhaleActivityCard(ctx = {}) {
  const c1 = el('div', { class: 'card' });
  c1.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'WHALE İŞLEMLERİ 24S'),
    el('span', { class: 'card-link' }, ctx.ok ? 'BÜYÜK HACİM PROXY' : 'NO DATA')
  ));
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'ZAMAN'),
    el('th', {}, 'COIN'),
    el('th', {}, 'TÜR'),
    el('th', { class: 'r' }, 'MİKTAR'),
    el('th', { class: 'r' }, 'DEĞER'),
    el('th', {}, 'KAYNAK')
  )));
  const tb = el('tbody', {});
  if (ctx.ok && ctx.events.length) {
    ctx.events.forEach(e => tb.appendChild(el('tr', {},
      el('td', { class: 'mono muted' }, new Date(e.time).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })),
      el('td', {}, ctx.symbol.replace('USDT','')),
      el('td', {}, el('span', { class: 'tag ' + (e.tone === 'pos' ? 'green' : 'red') }, e.side)),
      el('td', { class: 'r mono' }, fmtCompact(e.vol)),
      el('td', { class: 'r mono' }, '$' + fmtCompact(e.notional)),
      el('td', { class: 'small muted' }, ctx.market?.activeExchange || ctx.market?.source || 'LIVE')
    )));
  } else {
    tb.appendChild(el('tr', {}, el('td', { colspan: 6, class: 'muted' }, ctx.ok ? 'Büyük hacim eşiği aşan event yok.' : 'Canlı veri yok. Demo whale listesi gösterilmedi.')));
  }
  tbl.appendChild(tb);
  c1.appendChild(el('div', { class: 'tbl-wrap' }, tbl));

  const c2 = el('div', { class: 'card mt-12' });
  c2.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'BÜYÜK CÜZDAN AKIŞLARI'),
    el('span', { class: 'card-link' }, 'PROXY / CANLI MUM')
  ));
  const deltaAbs = Math.abs(Number(ctx.delta || 0));
  const inflow = ctx.delta < 0 ? deltaAbs : deltaAbs * 0.35;
  const outflow = ctx.delta >= 0 ? deltaAbs : deltaAbs * 0.35;
  const net = outflow - inflow;
  c2.appendChild(el('div', { class: 'row cols-2 mt-6' },
    el('div', {},
      el('div', { class: 'tiny muted' }, 'GİRİŞ PROXY'),
      el('div', { class: 'mono bold neg', style: 'font-size:18px' }, '$' + fmtCompact(inflow * Number(ctx.price || 1))),
      el('div', { class: 'tiny muted mt-10' }, 'ÇIKIŞ PROXY'),
      el('div', { class: 'mono bold pos', style: 'font-size:18px' }, '$' + fmtCompact(outflow * Number(ctx.price || 1))),
    ),
    el('div', { class: 'flex center' }, donut({ data: [
      { value: Math.max(1, outflow), color: '#10b981' },
      { value: Math.max(1, inflow), color: '#ef4444' },
    ], size: 120, thickness: 16, centerTitle: 'NET AKIŞ', centerValue: '$' + fmtCompact(net * Number(ctx.price || 1)) }))
  ));
  const wList = el('div', { class: 'mt-10' });
  const chunks = ctx.ok ? ctx.candles.slice(-5).reverse() : [];
  if (chunks.length) {
    chunks.forEach((c, i) => {
      const val = Number(c.volume || 0) * Number(c.close || ctx.price || 1);
      const tone = Number(c.close) >= Number(c.open) ? 'pos' : 'neg';
      wList.appendChild(el('div', { class: 'flex between small', style: 'padding:5px 0; border-bottom:1px dashed var(--bd-1)' },
        el('span', { class: 'mono muted' }, 'Mum #' + String(chunks.length - i).padStart(2,'0')),
        el('span', { class: 'mono ' + tone + ' bold' }, (tone === 'pos' ? '+' : '-') + '$' + fmtCompact(val))
      ));
    });
  } else {
    wList.appendChild(el('div', { class: 'small muted' }, 'Canlı akış üretilemedi.'));
  }
  c2.appendChild(wList);
  c2.appendChild(el('div', { class: 'card-link mt-8' }, 'VERİ ETİKETİ: ', ctx.ok ? 'LIVE/PROXY' : 'NO DATA'));

  return el('div', {}, c1, c2);
}

function buildSpotPerpCard(ctx = {}) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'SPOT vs PERP DENGESİ'),
    el('span', { class: 'card-link tiny' }, (ctx.symbol || State.symbol || 'BTCUSDT').replace('USDT','/USDT'))
  ));
  const spotProxy = ctx.ok ? Math.max(1, Math.abs(ctx.delta) * (ctx.delta >= 0 ? 0.58 : 0.42) * Number(ctx.price || 1)) : 0;
  const perpProxy = ctx.ok ? Math.max(1, Math.abs(ctx.delta) * (ctx.delta < 0 ? 0.58 : 0.42) * Number(ctx.price || 1)) : 0;
  const ratio = perpProxy ? spotProxy / perpProxy : null;
  wrap.appendChild(el('div', { class: 'row cols-3 mt-10', style: 'align-items:center; gap:8px' },
    el('div', {},
      el('div', { class: 'tiny muted' }, 'SPOT HACİM PROXY'),
      el('div', { class: 'mono bold pos' }, ctx.ok ? '$' + fmtCompact(spotProxy) : '—'),
      el('div', { class: 'tiny muted' }, ctx.ok ? '%'+Math.round(spotProxy/(spotProxy+perpProxy)*100) : 'NO DATA'),
    ),
    donut({ data: [{ value: spotProxy || 1, color: '#10b981' },{ value: perpProxy || 1, color: '#ef4444' }], size: 100, thickness: 14, centerValue: Number.isFinite(ratio) ? ratio.toFixed(2) : '—', centerTitle: 'DENGE' }),
    el('div', { class: 'text-right' },
      el('div', { class: 'tiny muted' }, 'PERP HACİM PROXY'),
      el('div', { class: 'mono bold neg' }, ctx.ok ? '$' + fmtCompact(perpProxy) : '—'),
      el('div', { class: 'tiny muted' }, ctx.ok ? (Number.isFinite(ctx.funding) ? 'Funding LIVE' : 'Funding NO DATA') : 'NO DATA'),
    )
  ));
  wrap.appendChild(el('div', { class: 'flex between small mt-10', style: 'border-top:1px solid var(--bd-1); padding-top:10px' },
    el('span', { class: 'muted' }, Number.isFinite(ratio) ? 'Spot / Perp Oranı ' + ratio.toFixed(2) : 'Veri yok'),
    el('span', { class: ctx.delta >= 0 ? 'pos bold' : 'neg bold' }, ctx.ok ? (ctx.delta >= 0 ? 'Alım Tarafı Baskın' : 'Satış Tarafı Baskın') : 'Bloke')
  ));
  return wrap;
}

function buildExchangeFlowCard(ctx = {}) {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'BORSALARA GİRİŞ / ÇIKIŞ (24S)'),
    el('span', { class: 'card-link tiny flex gap-8' }, ctx.ok ? 'Canlı mumdan PROXY' : 'NO DATA')
  ));
  const chartHost = el('div', { class: 'chart-host short mt-6' });
  wrap.appendChild(chartHost);
  setTimeout(() => drawExchangeBars(chartHost, ctx), 80);
  return wrap;
}

function drawExchangeBars(chartHost, ctx = {}) {
  const labels = ['Binance','Coinbase','OKX','Bybit','Kraken','KuCoin','HTX'];
  const w = chartHost.clientWidth || 400, h = chartHost.clientHeight || 200;
  chartHost.innerHTML = '';
  if (!ctx.ok) {
    chartHost.innerHTML = '<div class="empty">Canlı veri yok. Demo akış çizilmedi.</div>';
    return;
  }
  const cv = document.createElement('canvas');
  cv.width = w*2; cv.height = h*2; cv.style.width = w+'px'; cv.style.height = h+'px';
  chartHost.appendChild(cv);
  const g = cv.getContext('2d'); g.scale(2,2);
  const padL = 30, padR = 8, padT = 8, padB = 28;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const cellW = innerW / labels.length;
  const yZero = padT + innerH/2;
  g.strokeStyle = 'rgba(148,163,184,0.10)'; g.beginPath();
  [0, .25, .5, .75, 1].forEach(t => { g.moveTo(padL, padT + t*innerH); g.lineTo(padL+innerW, padT + t*innerH); }); g.stroke();
  const chunks = ctx.candles.slice(-labels.length * 8);
  const base = Math.max(1, smAvg(chunks.map(c => Number(c.volume))) || 1);
  labels.forEach((e, i) => {
    const part = chunks.slice(i*8, i*8+8);
    const signed = part.reduce((s,c)=>s+(Number(c.close)>=Number(c.open)?1:-1)*Number(c.volume||0),0);
    const total = part.reduce((s,c)=>s+Number(c.volume||0),0);
    const inflow = signed < 0 ? Math.abs(signed) : total * .36;
    const outflow = signed >= 0 ? Math.abs(signed) : total * .36;
    const max = base * 10;
    const x = padL + i * cellW + cellW*.15;
    const bw = cellW*.32;
    const inH = Math.min(innerH/2-2, (inflow/max) * (innerH/2-2));
    const outH = Math.min(innerH/2-2, (outflow/max) * (innerH/2-2));
    g.fillStyle = '#10b981'; g.fillRect(x, yZero - inH, bw, inH);
    g.fillStyle = '#ef4444'; g.fillRect(x + bw + 4, yZero, bw, outH);
    g.fillStyle = 'rgba(148,163,184,0.7)'; g.font = '9px Inter';
    g.fillText(e, padL + i*cellW + cellW/2 - 16, h - 14);
    g.fillStyle = outflow >= inflow ? '#10b981' : '#ef4444'; g.font = '700 9px JetBrains Mono';
    const net = outflow - inflow;
    g.fillText('Net ' + (net >= 0 ? '+' : '') + fmtCompact(net, 0), padL + i*cellW + cellW/2 - 24, h - 4);
  });
}

function buildHighInterestCard(ctx = {}) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {},
    el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'COIN'),
      el('th', { class: 'r' }, 'İLGİ SKORU'),
      el('th', { class: 'r' }, '24S DEĞİŞİM'),
      el('th', {}, 'WHALE BİRİKİMİ'),
      el('th', {}, 'CVD BIAS'),
      el('th', { class: 'c' }, 'TREND'),
    )
  ));
  const tbody = el('tbody', {});
  const row = [
    (ctx.symbol || State.symbol || 'BTCUSDT').replace(/USDT$|USDC$|USD$|BUSD$|TRY$/,''),
    coinName(ctx.symbol || State.symbol || 'BTCUSDT'),
    ctx.ok ? ctx.confidence : 0,
    Number.isFinite(ctx.change) ? ctx.change : null,
    ctx.ok ? (ctx.whaleScore >= 70 ? 'Yüksek' : ctx.whaleScore >= 50 ? 'Orta' : 'Düşük') : 'NO DATA',
    ctx.ok ? ctx.bias : '—',
    ctx.ok ? (ctx.change >= 0 ? '↑' : '↓') : '—'
  ];
  const [sh, name, score, ch, w, b, tr] = row;
  tbody.appendChild(el('tr', {},
    el('td', { class: 'muted' }, '1'),
    el('td', {}, coinPill(sh+'USDT', name)),
    el('td', { class: 'r mono bold' }, String(score)),
    el('td', { class: 'r mono ' + (ch >= 0 ? 'pos' : 'neg') }, Number.isFinite(ch) ? (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%' : '—'),
    el('td', {}, el('span', { class: 'tag ' + (w === 'Yüksek' ? 'green' : w === 'Orta' ? 'yellow' : w === 'NO DATA' ? 'red' : 'gray') }, w)),
    el('td', {}, el('span', { class: 'tag ' + (b === 'ALIM' ? 'green' : b === 'SATIŞ' ? 'red' : 'yellow') }, b)),
    el('td', { class: 'c ' + (tr === '↑' ? 'pos' : tr === '↓' ? 'neg' : 'muted') }, tr),
  ));
  tbl.appendChild(tbody);
  return card({
    title: 'SMART MONEY İLGİSİ EN YÜKSEK VARLIKLAR',
    body: el('div', {}, el('div', { class: 'tbl-wrap' }, tbl), el('div', { class: 'card-link mt-10 text-center' }, ctx.ok ? 'VERİ ETİKETİ: LIVE/PROXY' : 'NO DATA'))
  });
}
