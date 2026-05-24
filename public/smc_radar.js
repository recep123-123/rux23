/* RUx — SMC Radar Surgical Live */
import { State, fetchMarket, el, fmtPct, fmtPrice } from './api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { ICN, statCard, card, pageHead, checklist, ringGauge, barbar } from './components.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

function smcFmt(v, max = 6) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: max }) : '—';
}

function smcUsd(v, max = 6) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: max }) : '—';
}

function smcAvg(values = []) {
  const arr = values.map(Number).filter(Number.isFinite);
  return arr.length ? arr.reduce((s,x)=>s+x,0)/arr.length : null;
}

function smcLevels(candles = []) {
  const recent = candles.slice(-180);
  const highs = recent.map(c => Number(c.high)).filter(Number.isFinite);
  const lows = recent.map(c => Number(c.low)).filter(Number.isFinite);
  const close = Number(recent.at(-1)?.close);
  if (!highs.length || !lows.length || !Number.isFinite(close)) return {};
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const eq = (high + low) / 2;
  const oteLow = low + (high - low) * 0.618;
  const oteHigh = low + (high - low) * 0.79;
  return { high, low, eq, oteLow, oteHigh, premiumLow: eq, premiumHigh: high, discountLow: low, discountHigh: eq };
}

function smcStructure(candles = []) {
  const c = candles.slice(-60);
  if (c.length < 25) return { bias:'VERİ YOK', tone:'warn', score:0, bos:'—', choch:'—', detail:'Yetersiz mum' };
  const last = c.at(-1);
  const prevHigh = Math.max(...c.slice(0,-1).map(x=>Number(x.high)).filter(Number.isFinite));
  const prevLow = Math.min(...c.slice(0,-1).map(x=>Number(x.low)).filter(Number.isFinite));
  const firstClose = Number(c[0].close);
  const lastClose = Number(last.close);
  const slope = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : 0;
  if (lastClose > prevHigh) return { bias:'BULLISH BOS', tone:'pos', score:88, bos:smcUsd(prevHigh), choch:smcUsd(prevLow), detail:'Önceki tepe üstü kapanış' };
  if (lastClose < prevLow) return { bias:'BEARISH BOS', tone:'neg', score:88, bos:smcUsd(prevLow), choch:smcUsd(prevHigh), detail:'Önceki dip altı kapanış' };
  if (slope > 1) return { bias:'BULLISH', tone:'pos', score:74, bos:smcUsd(prevHigh), choch:smcUsd(prevLow), detail:'HH/HL eğilimi korunuyor' };
  if (slope < -1) return { bias:'BEARISH', tone:'neg', score:74, bos:smcUsd(prevLow), choch:smcUsd(prevHigh), detail:'LH/LL eğilimi baskın' };
  return { bias:'RANGE', tone:'warn', score:58, bos:smcUsd(prevHigh), choch:smcUsd(prevLow), detail:'Likidite aralığı / sıkışma' };
}

function smcFvg(candles = []) {
  let bull = 0, bear = 0;
  const zones = [];
  const c = candles.slice(-140);
  for (let i = 2; i < c.length; i++) {
    const a = c[i-2], b = c[i];
    if (Number(b.low) > Number(a.high)) {
      bull++;
      zones.push({ side:'BULL', low:Number(a.high), high:Number(b.low), time:Number(b.time) });
    }
    if (Number(b.high) < Number(a.low)) {
      bear++;
      zones.push({ side:'BEAR', low:Number(b.high), high:Number(a.low), time:Number(b.time) });
    }
  }
  return { bull, bear, total: bull + bear, zones: zones.slice(-6) };
}

function smcSweep(candles = []) {
  const c = candles.slice(-90);
  let count = 0;
  for (let i = 10; i < c.length; i++) {
    const prevHigh = Math.max(...c.slice(i-10, i).map(x=>Number(x.high)).filter(Number.isFinite));
    const prevLow = Math.min(...c.slice(i-10, i).map(x=>Number(x.low)).filter(Number.isFinite));
    if (Number(c[i].high) > prevHigh && Number(c[i].close) < prevHigh) count++;
    if (Number(c[i].low) < prevLow && Number(c[i].close) > prevLow) count++;
  }
  return Math.min(100, Math.round(count * 12));
}

function smcVolRatio(candles = []) {
  const vols = candles.map(c => Number(c.volume)).filter(Number.isFinite);
  if (vols.length < 50) return 0;
  const r = smcAvg(vols.slice(-20));
  const b = smcAvg(vols.slice(-140, -20));
  return b ? r / b : 0;
}

function smcOte(candles = [], lev = smcLevels(candles)) {
  const close = Number(candles.at(-1)?.close);
  if (!Number.isFinite(close) || !Number.isFinite(lev.low) || !Number.isFinite(lev.high) || lev.high <= lev.low) return 0;
  const pos = (close - lev.low) / (lev.high - lev.low);
  const dist = Math.min(Math.abs(pos - 0.618), Math.abs(pos - 0.79));
  return Math.round(Math.max(0, Math.min(100, 100 - dist * 220)));
}

async function loadSmcContext() {
  const sym = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  let market = null;
  try { market = await fetchMarket(sym, tf, 800); } catch {}
  const candles = normalizeCandleInput(market?.candles || market?.ohlcv || market?.spot?.candles || []);
  if (!market || candles.length < 60) return { ok:false, symbol:sym, tf, market, candles, reason: candles.length ? `Yetersiz canlı mum: ${candles.length}/60` : 'Market router veri döndürmedi.' };
  const structure = smcStructure(candles);
  const levels = smcLevels(candles);
  const fvg = smcFvg(candles);
  const sweep = smcSweep(candles);
  const ote = smcOte(candles, levels);
  const volR = smcVolRatio(candles);
  const obQuality = Math.round(Math.max(0, Math.min(100, structure.score * .45 + Math.min(100, volR * 42) * .35 + sweep * .20)));
  const setup = Math.round(Math.max(0, Math.min(100, structure.score * .34 + obQuality * .24 + sweep * .18 + ote * .16 + Math.min(100, fvg.total * 6) * .08)));
  return { ok:true, symbol:sym, tf, market, candles, structure, levels, fvg, sweep, ote, volR, obQuality, setup };
}

function kv(label, value, tone = '') {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v ' + tone }, value));
}

export async function renderSmcRadar(host) {
  host.innerHTML = '';
  const ctx = await loadSmcContext();
  const sym = ctx.symbol || State.symbol || 'BTCUSDT';
  const tf = ctx.tf || State.tf || '4h';
  host.appendChild(pageHead({
    title: 'SMC RADAR',
    fav: false,
    subtitle: sym + ' · ' + tf + ' · Smart Money Concepts taraması, yapısal analiz ve kurumsal akış teşhisi.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxCoinInput')?.focus?.() } }, sym.replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, tf + ' ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow' }, ICN.pause(12), 'REST / BEKLEME'),
      el('button', { class: 'btn primary', on:{ click:()=>window.OMNI?.navigate?.('smc-radar', { symbol:sym, tf }) } }, ICN.refresh(12), 'YENİLE'),
      el('button', { class: 'btn ghost' }, ICN.gear(12)),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  if (ctx.ok) {
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: ctx.structure.tone === 'pos' ? 'green' : ctx.structure.tone === 'neg' ? 'red' : 'yellow', label: 'YAPI BIASI', value: ctx.structure.bias, sub: ctx.structure.detail, subColor: ctx.structure.tone }));
    stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: ctx.obQuality >= 70 ? 'green' : 'yellow', label: 'OB KALİTESİ', value: ctx.obQuality + ' / 100', sub: 'Hacim + yapı proxy', subColor: ctx.obQuality >= 70 ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.cube(18), iconColor: 'purple', label: 'FVG SAYISI', value: String(ctx.fvg.total), sub: ctx.fvg.bull + ' bullish · ' + ctx.fvg.bear + ' bearish' }));
    stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: ctx.sweep >= 65 ? 'green' : 'blue', label: 'LİKİDİTE SÜPÜRME SKORU', value: ctx.sweep + ' / 100', sub: ctx.sweep >= 65 ? 'Yüksek' : 'Orta/Düşük', subColor: ctx.sweep >= 65 ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.target(18), iconColor: ctx.ote >= 70 ? 'cyan' : 'yellow', label: 'OTE HİZALAMA', value: ctx.ote + ' %', sub: '0.618 - 0.79 canlı mesafe' }));
    stats.appendChild(statCard({ icon: ICN.star(18, true), iconColor: ctx.setup >= 70 ? 'green' : 'yellow', label: 'SETUP GÜVENİ', value: ctx.setup + ' / 100', sub: ctx.candles.length + ' canlı mum' }));
  } else {
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'red', label: 'YAPI BIASI', value: 'BLOKE', sub: ctx.reason, subColor: 'neg' }));
    stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'yellow', label: 'OB KALİTESİ', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.cube(18), iconColor: 'purple', label: 'FVG SAYISI', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'LİKİDİTE SÜPÜRME SKORU', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'OTE HİZALAMA', value: '—', sub: 'NO DATA' }));
    stats.appendChild(statCard({ icon: ICN.star(18, true), iconColor: 'red', label: 'SETUP GÜVENİ', value: '0 / 100', sub: 'Bloke' }));
  }
  host.appendChild(stats);

  const row = el('div', { class: 'row fr-2-1 section' });
  row.appendChild(buildSmcChart(ctx));
  row.appendChild(buildRightPanel(ctx));
  host.appendChild(row);

  const row2 = el('div', { class: 'row cols-3 section' });
  row2.appendChild(buildSetupRanking(ctx));
  row2.appendChild(buildExecutionList(ctx));
  row2.appendChild(buildNarrative(ctx));
  host.appendChild(row2);
}

function buildSmcChart(ctx = {}) {
  const wrap = el('div', { class: 'card' });
  const sym = ctx.symbol || State.symbol || 'BTCUSDT';
  const tf = ctx.tf || State.tf || '4h';
  const last = ctx.candles?.at?.(-1) || {};
  const first = ctx.candles?.[0] || {};
  const delta = Number(last.close) - Number(first.close);
  const pct = Number(first.close) ? delta / Number(first.close) * 100 : null;
  wrap.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, sym.replace('USDT','/USDT') + ' · ' + tf + ' · RUx'),
    el('span', { class: 'ohlc' }, 'A', el('span', { class: delta >= 0 ? 'up' : 'dn' }, ctx.ok ? smcFmt(last.open) : '—'), ' Y', el('span', {}, ctx.ok ? smcFmt(last.high) : '—'), ' D', el('span', { class: 'dn' }, ctx.ok ? smcFmt(last.low) : '—'), ' K', el('span', { class: delta >= 0 ? 'up' : 'dn' }, ctx.ok ? smcFmt(last.close) : '—'), el('span', { class: (delta >= 0 ? 'pos' : 'neg') + ' bold' }, ctx.ok ? ' ' + (delta >= 0 ? '+' : '') + smcFmt(delta) + ' (' + fmtPct(pct) + ')' : ' NO DATA')),
  ));
  const legend = el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'BOS'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#f59e0b' }), 'CHOCH'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#06b6d4' }), 'ORDER BLOCK'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#a78bfa' }), 'FVG ' + (ctx.ok ? ctx.fvg.total : '—')),
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'LIQ. SWEEP ' + (ctx.ok ? ctx.sweep + '/100' : '—')),
    el('span', { class: 'lk' }, el('i', { style: 'background:#3b82f6' }), 'SESSION'),
  );
  wrap.appendChild(legend);
  const chartHost = el('div', { class: 'chart-host tall' });
  wrap.appendChild(chartHost);
  const ses = el('div', { class: 'flex between mt-8', style: 'background:rgba(59,130,246,0.10); border-radius:6px; padding:6px 10px; font-size:10px' },
    el('span', { class: 'flex items-center gap-6' }, el('span', { style: 'color:#06b6d4', class: 'bold' }, 'London'), el('span', { class: 'muted' }, '08:00 - 11:00')),
    el('span', { class: 'flex items-center gap-6' }, el('span', { style: 'color:#10b981', class: 'bold' }, 'New York AM'), el('span', { class: 'muted' }, '13:30 - 16:30')),
    el('span', { class: 'flex items-center gap-6' }, el('span', { style: 'color:#a78bfa', class: 'bold' }, 'New York PM'), el('span', { class: 'muted' }, '17:00 - 21:00')),
    el('span', { class: 'flex items-center gap-6' }, el('span', { style: 'color:#f59e0b', class: 'bold' }, 'Asian Range'), el('span', { class: 'muted' }, '00:00 - 08:00')),
  );
  wrap.appendChild(ses);
  wrap.appendChild(el('div', { class: 'chart-bottom-bar' },
    ['1G','5G','1A','3A','6A','Bu sene','1Y','5Y','Tümü'].map(t => el('span', { class: 'pill' + (t === '1A' ? ' active' : '') }, t)),
    el('div', { class: 'right' }, ctx.ok ? new Date().toLocaleTimeString('tr-TR') + ' · LIVE' : 'NO DATA')
  ));
  setTimeout(() => drawSmcChart(ctx, chartHost), 60);
  return wrap;
}

function drawSmcChart(ctx, chartHost) {
  const candles = ctx?.candles || [];
  if (!ctx.ok || candles.length < 10) {
    chartHost.innerHTML = '<div class="empty">Canlı mum yok. Demo/random mum çizilmedi.</div>';
    return;
  }
  const { chart, series } = makeCandleChart(chartHost);
  const visible = candles.slice(-360);
  series.setData(visible);
  addEmaLine(chart, candles, 20, '#06b6d4');
  addEmaLine(chart, candles, 50, '#f97316');
  if (Number.isFinite(ctx.levels?.high)) series.createPriceLine({ price: ctx.levels.high, color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Üst likidite' });
  if (Number.isFinite(ctx.levels?.low)) series.createPriceLine({ price: ctx.levels.low, color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Alt likidite' });
  if (Number.isFinite(ctx.levels?.oteLow)) series.createPriceLine({ price: ctx.levels.oteLow, color: '#a78bfa', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: 'OTE' });
  if (Number.isFinite(ctx.levels?.oteHigh)) series.createPriceLine({ price: ctx.levels.oteHigh, color: '#a78bfa', lineWidth: 1, lineStyle: 1, axisLabelVisible: false, title: 'OTE' });
  chart.timeScale().fitContent();
}

function buildRightPanel(ctx = {}) {
  const col = el('div', {});
  const rows = ctx.ok ? [
    ['Üst Zaman Dilimi Yönü', ctx.structure.bias, ctx.structure.tone],
    ['Mevcut Yapı', ctx.structure.detail, ''],
    ['Son BOS', ctx.structure.bos, ''],
    ['Son CHOCH', ctx.structure.choch, ''],
    ['Yapı Gücü', ctx.structure.score + '/100', ctx.structure.tone],
    ['Trend Devam Olasılığı', ctx.setup + '%', ctx.setup >= 70 ? 'pos' : 'warn'],
    ['Hedef Bölge (Likidite)', smcUsd(ctx.levels.high), ''],
    ['Geçersizleşme', smcUsd(ctx.levels.low), 'neg'],
  ] : [
    ['Üst Zaman Dilimi Yönü', 'NO DATA', 'neg'],
    ['Mevcut Yapı', ctx.reason || 'Veri yok', 'warn'],
    ['Son BOS', '—', ''],
    ['Son CHOCH', '—', ''],
    ['Yapı Gücü', '0/100', 'neg'],
    ['Trend Devam Olasılığı', '—', 'warn'],
    ['Hedef Bölge (Likidite)', '—', ''],
    ['Geçersizleşme', '—', 'neg'],
  ];
  const w = el('div', {});
  rows.forEach(([k, v, c]) => {
    w.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v)));
  });
  col.appendChild(card({ title: 'YAPI TEŞHİSİ', body: w }));

  const zones = el('div', { style: 'display:flex; flex-direction:column; gap:6px' });
  zones.appendChild(el('div', { class: 'flex between', style: 'padding:8px 10px; background:rgba(239,68,68,0.10); border-radius:6px; font-size:11.5px' },
    el('span', {}, 'Premium Zone'), el('span', { class: 'mono bold neg' }, ctx.ok ? smcUsd(ctx.levels.premiumLow) + ' - ' + smcUsd(ctx.levels.premiumHigh) : '—')));
  zones.appendChild(el('div', { class: 'flex between', style: 'padding:8px 10px; background:rgba(34,211,238,0.10); border-radius:6px; font-size:11.5px' },
    el('span', {}, 'Equilibrium (OTE)'), el('span', { class: 'mono bold cyan' }, ctx.ok ? smcUsd(ctx.levels.oteLow) + ' - ' + smcUsd(ctx.levels.oteHigh) : '—')));
  zones.appendChild(el('div', { class: 'flex between', style: 'padding:8px 10px; background:rgba(16,185,129,0.10); border-radius:6px; font-size:11.5px' },
    el('span', {}, 'Discount Zone'), el('span', { class: 'mono bold pos' }, ctx.ok ? smcUsd(ctx.levels.discountLow) + ' - ' + smcUsd(ctx.levels.discountHigh) : '—')));
  col.appendChild(card({ title: 'AKTİF BÖLGELER', body: zones, klass: 'mt-12' }));

  const lq = el('div', {});
  lq.appendChild(kv('Yukarı Likidite', ctx.ok ? smcUsd(ctx.levels.high) : '—'));
  lq.appendChild(kv('Aşağı Likidite', ctx.ok ? smcUsd(ctx.levels.low) : '—'));
  lq.appendChild(kv('Likidite Yoğunluğu', ctx.ok ? (ctx.sweep >= 65 ? 'Yüksek' : ctx.sweep >= 35 ? 'Orta' : 'Düşük') : 'NO DATA', ctx.ok && ctx.sweep >= 65 ? 'pos bold' : 'warn bold'));
  col.appendChild(card({ title: 'LİKİDİTE HARİTASI', body: lq, klass: 'mt-12' }));

  return col;
}

function buildSetupRanking(ctx = {}) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'SETUP'),
    el('th', {}, 'YÖN'),
    el('th', {}, 'KONUM'),
    el('th', { class: 'c' }, 'ONAY'),
    el('th', { class: 'r' }, 'R:R'),
    el('th', { class: 'r' }, 'GÜVEN'),
  )));
  const direction = ctx.ok && ctx.structure.tone === 'neg' ? 'SHORT' : 'LONG';
  const rows = ctx.ok ? [
    ['1','OB Rejection + FVG', direction, direction === 'LONG' ? 'Demand OB' : 'Supply OB', ctx.obQuality >= 60 ? '✓' : '○','1:2.4', String(ctx.obQuality)],
    ['2','BOS Continuation', direction, 'Breakout', ctx.structure.score >= 70 ? '✓' : '○','1:2.1', String(ctx.structure.score)],
    ['3','Liquidity Sweep + BOS', direction, 'Sweep', ctx.sweep >= 55 ? '✓' : '○','1:2.7', String(ctx.sweep)],
    ['4','CHoCH Confirmation', direction, 'EQ/OTE', ctx.ote >= 55 ? '✓' : '○','1:1.9', String(ctx.ote)],
    ['5','FVG Return', direction, 'Mitigation', ctx.fvg.total ? '○' : '—','1:1.6', String(Math.min(100, ctx.fvg.total * 12))],
  ] : [['1','NO DATA','—','—','—','—','0']];
  const tb = el('tbody', {});
  rows.forEach(([n, s, dir, loc, ok, rr, conf]) => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'muted' }, n),
      el('td', { class: 'small' }, s),
      el('td', {}, el('span', { class: 'tag ' + (dir === 'SHORT' ? 'red' : dir === 'LONG' ? 'green' : 'gray') }, dir)),
      el('td', { class: 'small muted' }, loc),
      el('td', { class: 'c bold ' + (ok === '✓' ? 'pos' : 'muted') }, ok),
      el('td', { class: 'r mono' }, rr),
      el('td', { class: 'r mono bold' }, conf),
    ));
  });
  tbl.appendChild(tb);
  return card({ title: 'SETUP SIRALAMASI', body: tbl });
}

function buildExecutionList(ctx = {}) {
  return card({ title: 'YÜRÜTME KONTROL LİSTESİ', body: checklist([
    { state: ctx.ok ? 'ok' : 'miss', label: 'Canlı veri', right: ctx.ok ? ctx.candles.length + ' mum' : 'NO DATA' },
    { state: ctx.ok && ctx.structure.score >= 60 ? 'ok' : 'warn', label: 'Üst Zaman Dilimi Yönü', right: el('span', { class: 'tag ' + (ctx.structure?.tone === 'neg' ? 'red' : ctx.structure?.tone === 'pos' ? 'green' : 'yellow') }, ctx.structure?.bias || '—') },
    { state: ctx.ok && ctx.structure.score >= 70 ? 'ok' : 'warn', label: 'Yapısal BOS Onayı', right: ctx.ok ? ctx.structure.bos : '—' },
    { state: ctx.ok && ctx.obQuality >= 60 ? 'ok' : 'warn', label: 'OB Kalitesi', right: ctx.ok ? ctx.obQuality + '/100' : '—' },
    { state: ctx.ok && ctx.fvg.total > 0 ? 'ok' : 'warn', label: 'FVG Mevcut', right: ctx.ok ? String(ctx.fvg.total) : '—' },
    { state: ctx.ok && ctx.sweep >= 50 ? 'ok' : 'warn', label: 'Likidite Süpürme', right: ctx.ok ? ctx.sweep + '/100' : '—' },
    { state: ctx.ok && ctx.ote >= 50 ? 'ok' : 'warn', label: 'OTE Bölgesinde İşlem', right: ctx.ok ? ctx.ote + '%' : '—' },
    { state: 'warn', label: 'Emir modu', right: el('span', { class: 'tag yellow' }, 'MANUEL') },
  ]) });
}

function buildNarrative(ctx = {}) {
  const sym = ctx.symbol || State.symbol || 'COIN';
  const tf = ctx.tf || State.tf || '4h';
  const text = ctx.ok
    ? `${sym} ${tf} SMC radarı ${ctx.structure.bias} biası gösteriyor. Son BOS referansı ${ctx.structure.bos}, CHOCH referansı ${ctx.structure.choch}. FVG sayısı ${ctx.fvg.total}, likidite sweep skoru ${ctx.sweep}/100, OTE hizalama ${ctx.ote}%. Üst likidite ${smcUsd(ctx.levels.high)}, alt likidite ${smcUsd(ctx.levels.low)}.`
    : 'Canlı veri alınamadı. Demo SMC narratifi gösterilmedi.';
  const mainIdea = ctx.ok ? (ctx.structure.tone === 'neg' ? 'SHORT' : ctx.structure.tone === 'pos' ? 'LONG' : 'WATCH') : 'BLOKE';
  const meta = el('div', { class: 'kv-rows mt-10' },
    kv('Ana Fikir', mainIdea, mainIdea === 'LONG' ? 'pos bold' : mainIdea === 'SHORT' ? 'neg bold' : 'warn bold'),
    kv('Giriş Bölgesi', ctx.ok ? smcUsd(ctx.levels.oteLow) + ' - ' + smcUsd(ctx.levels.oteHigh) : '—'),
    kv('Hedef', ctx.ok ? smcUsd(ctx.levels.high) : '—', 'mono pos'),
    kv('İptal Seviyesi', ctx.ok ? smcUsd(ctx.levels.low) : '—', 'mono neg'),
  );
  const w = el('div', { class: 'small', style: 'color:var(--fg-2); line-height:1.55' }, text);
  return card({ title: 'NARRATIF ÖZET', body: el('div', {}, w, meta) });
}
