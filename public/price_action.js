/* RUx — Price Action / PA (Full Feature Engine entegrasyonu) */
import { State, fetchMarket, fmtPrice, fmtPct, el } from './api.js?v=0.75.8-heatmap-panel-live-20260524';
import { ICN, statCard, card, pageHead, ringGauge, sparkline, coinPill, tfPills, checklist, tag, barbar } from './components.js?v=0.75.8-heatmap-panel-live-20260524';
import { makeCandleChart, addEmaLine, addVolumeHistogram, normalizeCandleInput } from './charts.js?v=0.75.8-heatmap-panel-live-20260524';
import { analyzePriceActionRulebook, statusClass } from './rux_core.js?v=0.75.8-heatmap-panel-live-20260524';
import { runFeatureEngine, aggregateMultiTf, PA_EVENT_LABEL_TR, PA_SUBTYPE_LABEL_TR } from './pa_engine.js?v=0.75.8-heatmap-panel-live-20260524';
import { runStructureEngine, STRUCT_EVENT_LABEL_TR, STRUCT_BIAS_LABEL_TR, STRUCT_SUBTYPE_LABEL_TR } from './structure_engine.js?v=0.75.8-heatmap-panel-live-20260524';
import { runOrderFlowEngine, OF_EVENT_LABEL_TR, OF_SUBTYPE_LABEL_TR, OF_STATUS_LABEL_TR } from './order_flow_engine.js?v=0.75.8-heatmap-panel-live-20260524';
import { runTemplateEngine, TPL_LABEL_TR, TPL_DESC_TR } from './template_engine.js?v=0.75.8-heatmap-panel-live-20260524';
import { runVolumeEngine, VOL_LABEL_TR } from './volume_engine.js?v=0.75.8-heatmap-panel-live-20260524';
import { runDeltaEngine, DELTA_EVENT_LABEL_TR, DELTA_SUBTYPE_LABEL_TR, DELTA_SOURCE_LABEL_TR } from './delta_engine.js?v=0.75.8-heatmap-panel-live-20260524';

async function loadPriceActionLiveContext() {
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  let data = null;
  try {
    data = await fetchMarket(symbol, tf, 800);
  } catch {}
  const candles = normalizeCandleInput(data?.ohlcv || data?.candles || data?.spot?.candles || []);
  if (!data || candles.length < 60) {
    return { ok: false, symbol, tf, data, candles, reason: candles.length ? `Yetersiz canlı mum: ${candles.length}/60` : 'Market router veri döndürmedi.' };
  }
  let pa = null;
  try { pa = analyzePriceActionRulebook(candles, { tf }); } catch {}
  const last = candles.at(-1) || {};
  const price = Number(data?.ticker?.price ?? data?.spot?.ticker?.price ?? last.close);
  const pct24 = paPctFromMarket(data, candles);
  const levels = paLevels(candles, price);
  const atr = paAtr(candles, 14);
  const structure = paStructure(candles);
  const momentum = paMomentum(candles);
  const volume = paVolumeRatio(candles);
  const quality = Math.round(Math.max(0, Math.min(100,
    Number(pa?.score || 0) * 0.45 +
    structure.score * 0.25 +
    momentum.score * 0.20 +
    Math.min(100, volume * 45) * 0.10
  )));
  const direction = paDirection(structure, momentum, pa);
  const plan = paPlan({ price, atr, levels, direction, quality });
  const breakout = Math.round(Math.max(0, Math.min(100, structure.score * 0.42 + momentum.score * 0.28 + Number(pa?.score || quality) * 0.30)));
  return { ok: true, symbol, tf, data, candles, pa, price, pct24, levels, atr, structure, momentum, volume, quality, direction, plan, breakout };
}

function paPctFromMarket(data = {}, candles = []) {
  const t = data?.ticker || data?.spot?.ticker || {};
  for (const raw of [t.priceChangePercent, t.change, t.change24h, data?.change24h]) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const first = Number(candles[0]?.close);
  const last = Number(candles.at(-1)?.close);
  return first ? ((last - first) / first) * 100 : null;
}

function paFmtUsd(v, max = 6) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: max }) + ' USDT' : '—';
}

function paFmtPlain(v, max = 6) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: max }) : '—';
}

function paAvg(values = []) {
  const arr = values.map(Number).filter(Number.isFinite);
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
}

function paAtr(candles = [], len = 14) {
  const clean = candles.filter(c => Number.isFinite(Number(c.high)) && Number.isFinite(Number(c.low)) && Number.isFinite(Number(c.close)));
  if (clean.length < 2) return null;
  const trs = [];
  for (let i = 1; i < clean.length; i++) {
    const h = Number(clean[i].high), l = Number(clean[i].low), pc = Number(clean[i - 1].close);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return paAvg(trs.slice(-len));
}

function paLevels(candles = [], price = null) {
  const recent = candles.slice(-160);
  const highs = recent.map(c => Number(c.high)).filter(Number.isFinite);
  const lows = recent.map(c => Number(c.low)).filter(Number.isFinite);
  const close = Number(price ?? recent.at(-1)?.close);
  if (!highs.length || !lows.length || !Number.isFinite(close)) return {};
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const localHighs = [];
  const localLows = [];
  for (let i = 2; i < recent.length - 2; i++) {
    const c = recent[i];
    const isHigh = Number(c.high) >= Math.max(Number(recent[i-1].high), Number(recent[i-2].high), Number(recent[i+1].high), Number(recent[i+2].high));
    const isLow = Number(c.low) <= Math.min(Number(recent[i-1].low), Number(recent[i-2].low), Number(recent[i+1].low), Number(recent[i+2].low));
    if (isHigh) localHighs.push(Number(c.high));
    if (isLow) localLows.push(Number(c.low));
  }
  const resistances = Array.from(new Set([high, r1, ...localHighs.filter(x => x > close).sort((a,b)=>a-b).slice(0, 4)])).slice(0, 5);
  const supports = Array.from(new Set([low, s1, ...localLows.filter(x => x < close).sort((a,b)=>b-a).slice(0, 4)])).slice(0, 5);
  return { high, low, pivot, r1, s1, resistances, supports, rangePct: close ? ((high - low) / close) * 100 : null };
}

function paStructure(candles = []) {
  const c = candles.slice(-50);
  if (c.length < 25) return { label: 'VERİ YOK', detail: 'Yetersiz mum', tone: 'warn', score: 0, short: '—' };
  const last = c.at(-1);
  const prevHigh = Math.max(...c.slice(0, -1).map(x => Number(x.high)).filter(Number.isFinite));
  const prevLow = Math.min(...c.slice(0, -1).map(x => Number(x.low)).filter(Number.isFinite));
  const slope = Number(c[0].close) ? ((Number(last.close) - Number(c[0].close)) / Number(c[0].close)) * 100 : 0;
  if (Number(last.close) > prevHigh) return { label: 'BOS Yukarı', detail: 'Önceki tepe üstü kapanış', tone: 'pos', score: 86, short: 'BOS ↑' };
  if (Number(last.close) < prevLow) return { label: 'BOS Aşağı', detail: 'Önceki dip altı kapanış', tone: 'neg', score: 86, short: 'BOS ↓' };
  if (slope > 1.0) return { label: 'HH / HL', detail: 'Boğa yapısı korunuyor', tone: 'pos', score: 72, short: 'HH/HL' };
  if (slope < -1.0) return { label: 'LH / LL', detail: 'Ayı yapısı baskın', tone: 'neg', score: 72, short: 'LH/LL' };
  return { label: 'Range / Sıkışma', detail: 'Net kırılım yok', tone: 'warn', score: 58, short: 'RANGE' };
}

function paMomentum(candles = []) {
  const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
  if (closes.length < 30) return { label: 'VERİ YOK', pct: null, tone: 'warn', score: 0 };
  const last = closes.at(-1);
  const prev = closes.at(-21) || closes[0];
  const pct = prev ? ((last - prev) / prev) * 100 : 0;
  const score = Math.round(Math.max(0, Math.min(100, 45 + Math.abs(pct) * 14)));
  if (pct > 0.6) return { label: 'Güçlü / Pozitif', pct, tone: 'pos', score };
  if (pct < -0.6) return { label: 'Güçlü / Negatif', pct, tone: 'neg', score };
  return { label: 'Nötr', pct, tone: 'warn', score: Math.max(45, Math.round(score * 0.75)) };
}

function paVolumeRatio(candles = []) {
  const vols = candles.map(c => Number(c.volume)).filter(Number.isFinite);
  if (vols.length < 50) return 0;
  const recent = paAvg(vols.slice(-20));
  const base = paAvg(vols.slice(-120, -20));
  return base ? recent / base : 0;
}

function paDirection(structure, momentum, pa) {
  const primary = String(pa?.primarySetup || '').toUpperCase();
  if (primary.includes('SHORT') || structure?.tone === 'neg' && momentum?.tone === 'neg') return 'SHORT';
  if (primary.includes('LONG') || structure?.tone === 'pos' && momentum?.tone === 'pos') return 'LONG';
  return 'WATCH';
}

function paPlan(ctx) {
  const price = Number(ctx.price);
  const atr = Number(ctx.atr || 0);
  if (!Number.isFinite(price) || !atr || ctx.quality < 35) {
    return { blocked: true, type: 'BLOKE', entry: '—', stop: '—', tp1: '—', tp2: '—', rr: '—', status: 'Veri yetersiz' };
  }
  const isShort = ctx.direction === 'SHORT';
  const entryA = price - (isShort ? -atr * 0.15 : atr * 0.15);
  const entryB = price - (isShort ? -atr * 0.45 : atr * 0.45);
  const stop = isShort ? price + atr * 1.25 : price - atr * 1.25;
  const tp1 = isShort ? price - atr * 1.55 : price + atr * 1.55;
  const tp2 = isShort ? price - atr * 2.45 : price + atr * 2.45;
  const risk = Math.abs(price - stop);
  const reward = Math.abs(tp2 - price);
  return {
    blocked: false,
    type: isShort ? 'SHORT' : ctx.direction === 'LONG' ? 'LONG' : 'WATCH',
    entry: `${paFmtUsd(Math.min(entryA, entryB))} — ${paFmtUsd(Math.max(entryA, entryB))}`,
    stop: paFmtUsd(stop),
    tp1: paFmtUsd(tp1),
    tp2: paFmtUsd(tp2),
    rr: risk ? '1 : ' + (reward / risk).toFixed(2) : '—',
    status: ctx.direction === 'WATCH' ? 'İzlemede' : 'Aktif aday',
  };
}

function paEmaLast(candles = [], len = 20) {
  const closes = candles.map(c => Number(c.close)).filter(Number.isFinite);
  if (closes.length < len) return null;
  const k = 2 / (len + 1);
  let ema = closes.slice(0, len).reduce((s, x) => s + x, 0) / len;
  for (const v of closes.slice(len)) ema = v * k + ema * (1 - k);
  return ema;
}

export async function renderPriceAction(host) {
  host.innerHTML = '';
  const live = await loadPriceActionLiveContext();
  const sym = live.symbol || State.symbol || 'BTCUSDT';
  const tf = live.tf || State.tf || '4h';

  host.appendChild(pageHead({
    title: 'PRICE ACTION / PA',
    fav: true,
    subtitle: `${sym} · ${tf} · Discretionary grafik analizi, piyasa yapısı, destek/direnç, trend, hacim ve formasyonlar.`,
    actions: [
      tfPills(tf, ['4h','1h','15m','5m']),
      el('button', { class: 'btn' }, ICN.bars(12), 'GÖSTERGELER'),
      el('button', { class: 'btn' }, ICN.layers(12), 'ŞABLONLAR'),
      el('button', { class: 'btn primary' }, ICN.plus(12), 'PLAN OLUŞTUR'),
      el('button', { class: 'btn ghost' }, ICN.gear(12)),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-5 section' });
  if (live.ok) {
    const trendScore = Math.round(Number(live.pa?.score || live.quality || 0));
    stats.appendChild(statCard({ icon: ringGauge({ value: trendScore, max: 100, size: 32, color: trendScore >= 70 ? '#10b981' : trendScore >= 50 ? '#f59e0b' : '#ef4444' }), iconColor: trendScore >= 70 ? 'green' : 'yellow', label: 'TREND SKORU', value: live.structure.label, sub: Number.isFinite(live.pct24) ? fmtPct(live.pct24) + ' 24s' : 'Canlı', subColor: live.structure.tone }));
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: live.structure.tone === 'pos' ? 'green' : live.structure.tone === 'neg' ? 'red' : 'yellow', label: 'YAPI (STRUCTURE)', value: live.structure.short, sub: live.structure.detail, subColor: live.structure.tone }));
    stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: live.momentum.tone === 'pos' ? 'green' : live.momentum.tone === 'neg' ? 'red' : 'yellow', label: 'MOMENTUM', value: live.momentum.label, sub: Number.isFinite(live.momentum.pct) ? fmtPct(live.momentum.pct) : '—', subColor: live.momentum.tone }));
    stats.appendChild(statCard({ icon: ICN.target(18), iconColor: live.breakout >= 70 ? 'green' : live.breakout >= 50 ? 'yellow' : 'red', label: 'KIRILIM OLASILIĞI', value: live.breakout + '%', sub: live.breakout >= 70 ? 'Yüksek' : live.breakout >= 50 ? 'Orta' : 'Düşük', subColor: live.breakout >= 70 ? 'pos' : live.breakout >= 50 ? 'warn' : 'neg' }));
    stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: live.quality >= 70 ? 'green' : live.quality >= 50 ? 'yellow' : 'red', label: 'SETUP KALİTESİ', value: live.quality + ' / 100', sub: live.candles.length + ' canlı mum' }));
  } else {
    stats.appendChild(statCard({ icon: ringGauge({ value: 0, max: 100, size: 32, color: '#ef4444' }), iconColor: 'red', label: 'TREND SKORU', value: 'BLOKE', sub: live.reason, subColor: 'neg' }));
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'red', label: 'YAPI (STRUCTURE)', value: 'VERİ YOK', sub: 'Demo gösterilmedi', subColor: 'neg' }));
    stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'yellow', label: 'MOMENTUM', value: '—', sub: 'Canlı mum bekleniyor', subColor: 'warn' }));
    stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'yellow', label: 'KIRILIM OLASILIĞI', value: '—', sub: 'Rapor yok', subColor: 'warn' }));
    stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'red', label: 'SETUP KALİTESİ', value: '0 / 100', sub: 'Bloke' }));
  }
  host.appendChild(stats);

  host.appendChild(buildTemplateEnginePanel());
  host.appendChild(buildFeatureEnginePanel());
  host.appendChild(buildStructureEnginePanel());
  host.appendChild(buildOrderFlowPanel());
  host.appendChild(buildVolumeEnginePanel());
  host.appendChild(buildDeltaEnginePanel());
  host.appendChild(buildRuxPaRulebookPanel());

  const row = el('div', { class: 'row fr-2-1 section' });
  row.appendChild(buildPaChart(live));
  row.appendChild(buildPaRightCol(live));
  host.appendChild(row);

  const row2 = el('div', { class: 'row cols-4 section' });
  row2.appendChild(buildTradePlan(live));
  row2.appendChild(buildScenarios(live));
  row2.appendChild(buildPaAlarms(live));
  row2.appendChild(buildConfluence(live));
  host.appendChild(row2);
}


function buildRuxPaRulebookPanel() {
  const body = el('div', { class: 'rux-pa-rulebook' },
    el('div', { class: 'small muted' }, 'Canlı mumlar yükleniyor; BOS, CHoCH, sweep, reclaim, fitil/gövde kalitesi ve hacim teyidi hesaplanacak.')
  );
  const wrap = card({ title: 'RUx PA / SMC KURAL MOTORU', link: 'CANLI ANALİZ', body });
  setTimeout(async () => {
    try {
      const data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 250);
      const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
      const pa = analyzePriceActionRulebook(candles, { tf: State.tf || '4h' });
      body.innerHTML = '';
      const metrics = el('div', { class: 'row cols-5' },
        paMetric('PA Skoru', `${pa.score}/100`, statusClass(pa.score)),
        paMetric('Yapı', pa.structure || '—', ''),
        paMetric('Ana Setup', pa.primarySetup || '—', ''),
        paMetric('Konum', `%${pa.levels?.locationPct ?? '—'}`, ''),
        paMetric('Hacim', `x${pa.metrics?.volumeRatio ?? '—'}`, '')
      );
      body.appendChild(metrics);
      const events = el('div', { class: 'rux-pa-events mt-10' });
      (pa.events || []).slice(0, 6).forEach(ev => events.appendChild(el('div', { class: 'rux-pa-event ' + (ev.side === 'LONG' ? 'pos' : ev.side === 'SHORT' ? 'neg' : 'warn') },
        el('div', { class: 'flex between gap-8' },
          el('span', { class: 'bold small' }, ev.label),
          el('span', { class: 'mono tiny' }, `${Math.round(Number(ev.score || 0))}/100`)
        ),
        el('div', { class: 'tiny muted mt-3' }, ev.detail)
      )));
      if (!(pa.events || []).length) events.appendChild(el('div', { class: 'rux-note warn' }, 'Net PA/SMC olayı yok; sinyal watch seviyesinde kalmalı.'));
      body.appendChild(events);
      if ((pa.warnings || []).length) body.appendChild(el('div', { class: 'rux-note warn mt-10' }, pa.warnings.join(' · ')));
    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class: 'rux-note warn' }, 'PA/SMC canlı analiz yüklenemedi; demo analiz üretilmedi.'));
    }
  }, 80);
  return wrap;
}

function paMetric(label, value, tone = '') {
  return el('div', { class: 'rux-rule-metric ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, String(value))
  );
}

function buildPaChart(live = {}) {
  const wrap = el('div', { class: 'card' });
  const sym = live.symbol || State.symbol || 'BTCUSDT';
  const tf = live.tf || State.tf || '4h';
  const last = live.candles?.at?.(-1) || {};
  const first = live.candles?.[0] || {};
  const delta = Number(last.close) - Number(first.close);
  const pct = Number(first.close) ? (delta / Number(first.close)) * 100 : null;
  const ema20 = live.ok ? paEmaLast(live.candles, 20) : null;
  const ema50 = live.ok ? paEmaLast(live.candles, 50) : null;
  const ema200 = live.ok ? paEmaLast(live.candles, 200) : null;
  const vwapProxy = live.ok ? paAvg(live.candles.slice(-40).map(c => Number(c.close))) : null;
  wrap.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, sym.replace('USDT', '/USDT') + ' · ' + tf + ' · RUx'),
    el('span', { class: 'ohlc' }, ' A', el('span', { class: Number(last.open) >= Number(first.open) ? 'up' : 'dn' }, live.ok ? paFmtPlain(last.open) : '—'), ' Y', el('span', {}, live.ok ? paFmtPlain(last.high) : '—'), ' D', el('span', { class: 'dn' }, live.ok ? paFmtPlain(last.low) : '—'), ' K', el('span', { class: Number(last.close) >= Number(last.open) ? 'up' : 'dn' }, live.ok ? paFmtPlain(last.close) : '—'), el('span', { class: (delta >= 0 ? 'pos' : 'neg') + ' bold' }, live.ok && Number.isFinite(delta) ? ' ' + (delta >= 0 ? '+' : '') + paFmtPlain(delta) + ' (' + fmtPct(pct) + ')' : ' VERİ YOK')),
  ));
  const legend = el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#06b6d4' }), 'EMA 20 ', el('span', { class: 'v' }, paFmtPlain(ema20))),
    el('span', { class: 'lk' }, el('i', { style: 'background:#f97316' }), 'EMA 50 ', el('span', { class: 'v' }, paFmtPlain(ema50))),
    el('span', { class: 'lk' }, el('i', { style: 'background:#a78bfa' }), 'EMA 200 ', el('span', { class: 'v' }, paFmtPlain(ema200))),
    el('span', { class: 'lk' }, el('i', { style: 'background:#22d3ee' }), 'VWAP Proxy ', el('span', { class: 'v' }, paFmtPlain(vwapProxy))),
    el('span', { class: 'lk' }, el('i', { style: 'background:#94a3b8' }), live.ok ? 'Canlı mum' : 'NO DATA'),
  );
  wrap.appendChild(legend);
  const chartHost = el('div', { class: 'chart-host tall' });
  wrap.appendChild(chartHost);
  const volHost = el('div', { class: 'chart-host short mt-6', style: 'height:120px' });
  const lastVol = live.ok ? Number(last.volume || 0) : null;
  const avgVol = live.ok ? paAvg(live.candles.slice(-20).map(c => Number(c.volume || 0))) : null;
  wrap.appendChild(el('div', { class: 'flex between mt-8 small muted' },
    el('span', {}, 'Hacim (20) ', el('span', { class: 'mono cyan' }, Number.isFinite(avgVol) ? Math.round(avgVol).toLocaleString('en-US') : '—'), el('span', { class: (lastVol >= avgVol ? 'pos' : 'warn') + ' mono ml-8', style: 'margin-left:8px' }, Number.isFinite(lastVol) ? Math.round(lastVol).toLocaleString('en-US') : '—')),
    el('span', { class: 'mono' }, new Date().toLocaleTimeString('tr-TR') + ' (UTC+3)')
  ));
  wrap.appendChild(volHost);
  wrap.appendChild(el('div', { class: 'chart-bottom-bar' },
    ['1G','5G','1A','3A','6A','Bu sene','1Y','5Y','Tümü'].map(t => el('span', { class: 'pill' + (t === '1A' ? ' active' : '') }, t)),
    el('div', { class: 'right' }, el('span', {}, live.ok ? live.candles.length + ' mum' : 'NO DATA'), el('span', {}, 'log'), el('span', {}, 'otomatik')),
  ));

  setTimeout(async () => {
    await loadPaChart(chartHost, volHost, live);
  }, 60);
  return wrap;
}

async function loadPaChart(chartHost, volHost, live = {}) {
  let candles = Array.isArray(live.candles) ? live.candles : [];
  if (!candles.length) {
    try {
      const data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 800);
      candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
    } catch {}
  }
  if (candles.length < 10) {
    chartHost.innerHTML = '<div class="empty">Canlı mum yok. Demo/random mum çizilmedi.</div>';
    volHost.innerHTML = '<div class="empty">Hacim verisi yok.</div>';
    return;
  }
  const { chart, series } = makeCandleChart(chartHost);
  const visible = candles.slice(-420);
  series.setData(visible);
  addEmaLine(chart, candles, 20, '#06b6d4');
  addEmaLine(chart, candles, 50, '#f97316');
  addEmaLine(chart, candles, 200, '#a78bfa');
  if (Number.isFinite(live.levels?.supports?.[0])) series.createPriceLine({ price: live.levels.supports[0], color: '#10b981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Destek' });
  if (Number.isFinite(live.levels?.resistances?.[0])) series.createPriceLine({ price: live.levels.resistances[0], color: '#ef4444', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'Direnç' });
  chart.timeScale().fitContent();

  const vChart = window.LightweightCharts.createChart(volHost, {
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 10 },
    grid: { vertLines: { color: 'rgba(148,163,184,0.06)' }, horzLines: { color: 'rgba(148,163,184,0.06)' } },
    rightPriceScale: { borderColor: 'rgba(148,163,184,0.08)' },
    timeScale: { visible: false },
    autoSize: true,
  });
  const vSeries = vChart.addHistogramSeries({});
  vSeries.setData(visible.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(22,163,74,0.55)' : 'rgba(220,38,38,0.55)' })));
}

function buildPaRightCol(live = {}) {
  const col = el('div', {});
  const sym = live.symbol || State.symbol || 'BTCUSDT';
  const tf = live.tf || State.tf || '4h';

  const tblScanner = el('table', { class: 'tbl tbl-compact' });
  tblScanner.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'COIN'),
    el('th', {}, 'TF'),
    el('th', {}, 'SETUP'),
    el('th', { class: 'r' }, 'SKOR'),
    el('th', {}, 'DURUM'),
  )));
  const tbb = el('tbody', {});
  const setupName = live.ok ? (live.pa?.primarySetup || live.structure?.label || 'PA Watch') : 'Veri Yok';
  const setupScore = live.ok ? Math.round(Number(live.pa?.score || live.quality || 0)) : 0;
  const setupTone = setupScore >= 70 ? 'green' : setupScore >= 50 ? 'yellow' : 'red';
  const setupStatus = live.ok ? (setupScore >= 70 ? 'Onaylı' : setupScore >= 50 ? 'İzlemede' : 'Zayıf') : 'Bloke';
  [[sym, tf, setupName, setupScore, setupStatus, setupTone]].forEach(([s, tfv, setup, score, st, c]) => {
    tbb.appendChild(el('tr', {},
      el('td', {}, coinPill(s)),
      el('td', { class: 'mono small muted' }, tfv),
      el('td', { class: 'small' }, setup),
      el('td', { class: 'r mono bold' }, String(score)),
      el('td', {}, el('span', { class: 'tag ' + c }, st)),
    ));
  });
  tblScanner.appendChild(tbb);
  col.appendChild(card({ title: 'PA SCANNER', link: live.ok ? 'LIVE' : 'NO DATA', body: tblScanner }));

  const srTbl = el('table', { class: 'tbl tbl-compact mt-12' });
  srTbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'TÜR'),
    el('th', { class: 'r' }, 'FİYAT'),
    el('th', {}, 'GÜÇ'),
    el('th', { class: 'r' }, 'UZAKLIK'),
    el('th', { class: 'r' }, 'TEPKİ'),
  )));
  const stb = el('tbody', {});
  const price = Number(live.price);
  const srRows = live.ok ? [
    ...(live.levels.resistances || []).slice(0, 4).map((p, i) => ['Direnç', p, Math.max(2, 5 - i), Number.isFinite(price) ? ((p - price) / price) * 100 : null, Math.max(2, 6 - i), 'red']),
    ...(live.levels.supports || []).slice(0, 4).map((p, i) => ['Destek', p, Math.max(2, 5 - i), Number.isFinite(price) ? ((price - p) / price) * 100 : null, Math.max(2, 6 - i), 'green']),
  ] : [];
  if (!srRows.length) srRows.push(['Veri Yok', null, 0, null, 0, 'yellow']);
  srRows.forEach(([type, p, g, dist, react, c]) => {
    const bb = el('span', { class: 'barbar' });
    for (let i = 0; i < 5; i++) bb.appendChild(el('i', { class: i < g ? 'on' : '' }));
    bb.classList.add(c);
    stb.appendChild(el('tr', {},
      el('td', {}, el('span', { class: c === 'red' ? 'neg bold' : c === 'green' ? 'pos bold' : 'warn bold' }, type)),
      el('td', { class: 'r mono' }, Number.isFinite(Number(p)) ? paFmtPlain(p) : '—'),
      el('td', {}, bb),
      el('td', { class: 'r mono ' + (c === 'red' ? 'neg' : c === 'green' ? 'pos' : 'warn') }, Number.isFinite(Number(dist)) ? fmtPct(dist) : '—'),
      el('td', { class: 'r mono small muted' }, String(react || '—')),
    ));
  });
  srTbl.appendChild(stb);
  col.appendChild(card({ title: 'DESTEK / DİRENÇ HARİTASI', link: live.ok ? 'LIVE' : 'NO DATA', body: srTbl, klass: 'mt-12' }));

  const ptTbl = el('table', { class: 'tbl tbl-compact mt-12' });
  ptTbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'DESEN'),
    el('th', {}, 'TF'),
    el('th', { class: 'r' }, 'HEDEF'),
    el('th', { class: 'r' }, 'OLASILIK'),
    el('th', {}, 'DURUM'),
  )));
  const pb = el('tbody', {});
  const directionLong = live.direction === 'LONG';
  const patternRows = live.ok ? [
    [directionLong ? 'Kırılım Retest' : live.direction === 'SHORT' ? 'Breakdown Retest' : 'Range Watch', tf, directionLong ? live.plan.tp1 : live.direction === 'SHORT' ? live.plan.tp1 : paFmtUsd(live.levels.pivot), live.breakout, live.breakout >= 65 ? 'Aktif' : 'İzlemede', live.breakout >= 65 ? 'green' : 'yellow'],
    [live.structure.label, tf, live.direction === 'SHORT' ? paFmtUsd(live.levels.supports?.[0]) : paFmtUsd(live.levels.resistances?.[0]), live.structure.score, 'Canlı', live.structure.tone === 'pos' ? 'green' : live.structure.tone === 'neg' ? 'red' : 'yellow'],
  ] : [['Veri Yok', tf, '—', 0, 'Bloke', 'red']];
  patternRows.forEach(([d, tfv, h, p, st, c]) => {
    pb.appendChild(el('tr', {},
      el('td', { class: 'small' }, d),
      el('td', { class: 'mono small muted' }, tfv),
      el('td', { class: 'r mono' }, h),
      el('td', { class: 'r mono bold' }, p + '%'),
      el('td', {}, el('span', { class: 'tag ' + c }, st)),
    ));
  });
  ptTbl.appendChild(pb);
  col.appendChild(card({ title: 'DESEN / FORMASYON ALGILAMA', link: live.ok ? 'LIVE' : 'NO DATA', body: ptTbl, klass: 'mt-12' }));

  return col;
}

function buildTradePlan(live = {}) {
  const p = live.plan || {};
  const rows = [
    ['TİP', p.type || 'BLOKE', p.type === 'LONG' ? 'pos' : p.type === 'SHORT' ? 'neg' : 'warn'],
    ['GİRİŞ BÖLGESİ', p.entry || '—', ''],
    ['ZARAR DURDUR', p.stop || '—', 'neg'],
    ['HEDEF 1', p.tp1 || '—', 'pos'],
    ['HEDEF 2', p.tp2 || '—', 'pos'],
    ['POZİSYON BÜYÜKLÜĞÜ', p.blocked ? '—' : '%2.00 manuel risk', ''],
    ['RİSK / GETİRİ', p.rr || '—', 'cyan'],
    ['DURUM', p.status || (live.ok ? 'İzlemede' : 'Bloke'), live.ok ? 'pos' : 'neg'],
  ];
  const w = el('div', {});
  rows.forEach(([k, v, c]) => {
    w.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v)));
  });
  return card({ title: 'MEVCUT TRADE PLANI', actions: [el('span', { class: 'card-link' }, ICN.edit(12))], body: w });
}

function buildScenarios(live = {}) {
  const list = el('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
  const sym = live.symbol || State.symbol || 'COIN';
  const longProb = live.ok ? Math.round(live.direction === 'LONG' ? Math.max(55, live.breakout) : live.direction === 'WATCH' ? 35 : 20) : 0;
  const shortProb = live.ok ? Math.round(live.direction === 'SHORT' ? Math.max(55, live.breakout) : live.direction === 'WATCH' ? 30 : 20) : 0;
  const rangeProb = live.ok ? Math.max(10, 100 - longProb - shortProb) : 0;
  const up = live.ok ? `${paFmtUsd(live.levels.resistances?.[0])} üstü kabul → ${live.plan.tp1}` : 'Canlı veri yok';
  const range = live.ok ? `${paFmtUsd(live.levels.supports?.[0])} — ${paFmtUsd(live.levels.resistances?.[0])} aralığı izlenir.` : 'Demo senaryo gösterilmedi.';
  const down = live.ok ? `${paFmtUsd(live.levels.supports?.[0])} altı kapanış → short risk artışı.` : 'Veri yok.';
  const scs = [
    ['Ana Senaryo (' + (live.direction === 'SHORT' ? 'Ayı' : 'Boğa') + ')', live.direction === 'SHORT' ? 'red' : 'green', live.direction === 'SHORT' ? shortProb : longProb, '● ' + (live.direction === 'SHORT' ? down : up)],
    ['Alternatif Senaryo (Yatay)', 'yellow', rangeProb, '● ' + range],
    ['Risk Senaryosu', live.direction === 'SHORT' ? 'green' : 'red', live.direction === 'SHORT' ? longProb : shortProb, '● ' + (live.direction === 'SHORT' ? up : down)],
  ];
  scs.forEach(([t, c, p, msg]) => {
    list.appendChild(el('div', { class: 'scenario ' + c },
      el('div', { class: 'flex between' }, el('span', { class: 'ttl' }, t), el('span', { class: 'pr' }, p + '%')),
      el('div', { class: 'small muted mt-4' }, msg)
    ));
  });
  return card({ title: 'SENARYO YOLLARI', body: list });
}

function buildPaAlarms(live = {}) {
  const sym = live.symbol || State.symbol || 'COIN';
  const tf = live.tf || State.tf || '4h';
  const now = new Date();
  const stamp = (mins) => new Date(now.getTime() - mins * 60000).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const data = live.ok ? [
    [stamp(2), live.structure.label, sym.replace('USDT','/USDT'), tf],
    [stamp(7), 'Momentum: ' + live.momentum.label, sym.replace('USDT','/USDT'), tf],
    [stamp(12), 'Direnç: ' + paFmtUsd(live.levels.resistances?.[0]), sym.replace('USDT','/USDT'), tf],
    [stamp(18), 'Destek: ' + paFmtUsd(live.levels.supports?.[0]), sym.replace('USDT','/USDT'), tf],
    [stamp(25), 'Hacim oranı: x' + (live.volume || 0).toFixed(2), sym.replace('USDT','/USDT'), tf],
  ] : [[stamp(0), 'Canlı PA alarmı üretilemedi', sym.replace('USDT','/USDT'), tf]];
  const w = el('div', {});
  data.forEach(([t, msg, symv, tfv]) => {
    w.appendChild(el('div', { style: 'display:grid; grid-template-columns:60px 1fr auto auto; gap:6px; padding:7px 0; border-bottom:1px dashed var(--bd-1); font-size:11.5px;' },
      el('span', { class: 'mono small muted' }, t),
      el('span', {}, msg),
      el('span', { class: 'tiny muted' }, symv),
      el('span', { class: 'tiny muted' }, tfv),
    ));
  });
  return card({ title: 'SON PA ALARMLARI', link: live.ok ? 'LIVE' : 'NO DATA', body: w });
}

function buildConfluence(live = {}) {
  const score = live.ok ? live.quality : 0;
  const left = checklist([
    { state: live.ok && live.structure.score >= 65 ? 'ok' : live.ok ? 'warn' : 'miss', label: 'Trend Yönü (HTF)', right: live.ok ? live.structure.label : 'Veri yok' },
    { state: live.ok && live.structure.tone === 'pos' ? 'ok' : live.ok && live.structure.tone === 'neg' ? 'miss' : 'warn', label: 'Yapı', right: live.ok ? live.structure.short : '—' },
    { state: live.ok && live.levels.supports?.length && live.levels.resistances?.length ? 'ok' : 'warn', label: 'Destek / Direnç', right: live.ok ? 'Canlı' : 'Yok' },
    { state: live.ok && live.volume >= 1 ? 'ok' : 'warn', label: 'Hacim Onayı', right: live.ok ? 'x' + (live.volume || 0).toFixed(2) : '—' },
    { state: live.ok && live.momentum.score >= 55 ? 'ok' : 'warn', label: 'Momentum', right: live.ok ? live.momentum.label : '—' },
    { state: live.ok && Number(live.pa?.score || 0) >= 55 ? 'ok' : 'warn', label: 'PA Rulebook', right: live.ok ? Math.round(Number(live.pa?.score || 0)) + '/100' : '—' },
    { state: live.ok && live.breakout >= 55 ? 'ok' : 'warn', label: 'Kırılım Potansiyeli', right: live.ok ? live.breakout + '%' : '—' },
    { state: live.ok ? 'ok' : 'miss', label: 'Veri Etiketi', right: live.ok ? 'LIVE' : 'NO DATA' },
  ]);
  const right = el('div', { class: 'flex center', style: 'flex-direction:column; gap:8px' },
    ringGauge({ value: score, max: 100, color: score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444', size: 100 }),
    el('div', { class: 'tiny muted text-center' }, 'KONFLUANS SKORU'),
    el('div', { class: score >= 70 ? 'pos bold' : score >= 50 ? 'warn bold' : 'neg bold' }, score >= 70 ? 'Yüksek' : score >= 50 ? 'Orta' : 'Zayıf'),
  );
  return card({
    title: 'KONFLUANS CHECKLIST', link: live.ok ? 'LIVE' : 'NO DATA',
    body: el('div', { class: 'row cols-2', style: 'gap:6px' }, left, right)
  });
}

/* ───────── v0.50 — Full Price Action Feature Engine paneli ─────────
 * Mevcut rulebook'tan farkı: tipli, no-repaint guard'lı, multi-TF feature stream
 */
function buildFeatureEnginePanel() {
  const body = el('div', { class: 'pa-engine-panel' },
    el('div', { class: 'small muted' }, 'Çoklu timeframe price action feature engine başlatılıyor… mumlar yükleniyor.')
  );
  const wrap = card({
    title: 'RUx PA FEATURE ENGINE v0.50',
    link: 'NO-REPAINT · MULTI-TF',
    body
  });

  setTimeout(async () => {
    try {
      const sym = State.symbol || 'BTCUSDT';
      const tfs = ['5m','15m','1h','4h'];
      const results = {};
      // Tüm TF'lerde paralel feature engine çalıştır
      await Promise.all(tfs.map(async tf => {
        try {
          const data = await fetchMarket(sym, tf, 200);
          const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
          results[tf] = runFeatureEngine(candles, { tf, lookback: 40, now: Date.now() });
        } catch (e) {
          results[tf] = null;
        }
      }));

      // Çoklu TF agregasyon
      const validResults = Object.fromEntries(Object.entries(results).filter(([_,v])=>v));
      const agg = aggregateMultiTf(validResults);

      body.innerHTML = '';

      // ── Üst: Özet kartlar ──
      const top = el('div', { class: 'row cols-4', style:'gap:8px' });
      top.appendChild(metricMini('GENEL BIAS', agg.bias, agg.bias==='LONG'?'pos':agg.bias==='SHORT'?'neg':'warn'));
      top.appendChild(metricMini('TF UYUMU', `%${agg.alignment}`, agg.alignment>=75?'pos':agg.alignment>=50?'warn':'neg'));
      const primary = results['4h'];
      top.appendChild(metricMini('4H TOP EVENT', primary?.summary?.topEvent?.type ? PA_EVENT_LABEL_TR[primary.summary.topEvent.type] : '—', ''));
      top.appendChild(metricMini('4H EVENT SAYISI', String(primary?.summary?.totalEvents || 0), ''));
      body.appendChild(top);

      // ── TF Matrisi ──
      const tfMatrix = el('table', { class:'tbl tbl-compact mt-10' });
      tfMatrix.appendChild(el('thead', {}, el('tr', {},
        el('th',{},'TF'),
        el('th',{},'BIAS'),
        el('th',{},'EVENT'),
        el('th',{},'TOP'),
        el('th',{},'GUARD'),
      )));
      const tbody = el('tbody');
      tfs.forEach(tf=>{
        const r = results[tf];
        if (!r) {
          tbody.appendChild(el('tr',{},
            el('td',{class:'mono'},tf.toUpperCase()),
            el('td',{colspan:'4', class:'muted small'}, 'veri alınamadı'),
          ));
          return;
        }
        const top = r.summary.topEvent;
        const guard = r.guard.skippedOpenCandle ? 'açık mum atlandı' : 'tüm mumlar kapalı';
        tbody.appendChild(el('tr',{},
          el('td',{class:'mono bold'},tf.toUpperCase()),
          el('td',{}, tag(r.summary.bias, r.summary.bias==='LONG'?'green':r.summary.bias==='SHORT'?'red':'gray')),
          el('td',{class:'mono'}, String(r.summary.totalEvents)),
          el('td',{}, top ? `${PA_EVENT_LABEL_TR[top.type]||top.type} · ${top.score}` : el('span',{class:'muted'},'—')),
          el('td',{class:'small muted'}, guard),
        ));
      });
      tfMatrix.appendChild(tbody);
      body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'Timeframe Matrisi'));
      body.appendChild(tfMatrix);

      // ── Aktif Event Listesi (4h öncelikli) ──
      const primaryEvents = (primary?.events || []).slice(0, 8);
      body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, `Tespit Edilen PA Olayları (4H · son ${primary?.summary?.lookback||40} mum)`));
      if (!primaryEvents.length) {
        body.appendChild(el('div', { class:'rux-note warn' }, '4H grafiğinde son lookback penceresinde belirgin PA olayı yok.'));
      } else {
        const evGrid = el('div', { class:'pa-event-grid', style:'display:grid;grid-template-columns:repeat(2,1fr);gap:6px' });
        primaryEvents.forEach(ev=>{
          const tone = ev.side==='LONG'?'pos':ev.side==='SHORT'?'neg':'warn';
          const subLabel = ev.subtype ? ` · ${PA_SUBTYPE_LABEL_TR[ev.subtype] || ev.subtype}` : '';
          const evidenceText = formatEvidence(ev.evidence);
          evGrid.appendChild(el('div', { class:'rux-pa-event '+tone, style:'padding:8px;border-radius:6px' },
            el('div', { class:'flex between gap-8' },
              el('span', { class:'bold small' }, (PA_EVENT_LABEL_TR[ev.type]||ev.type) + subLabel),
              el('span', { class:'mono tiny' }, `${ev.side} · ${ev.score}/100`)
            ),
            el('div', { class:'tiny muted mt-3' }, `Mum #-${ev.candleIndex} · ${evidenceText}`),
          ));
        });
        body.appendChild(evGrid);
      }

      // ── No-Repaint Guard durumu ──
      const guardOk = primary?.guard?.closedCount > 0;
      const guardBadge = el('div', { class:'rux-note '+(guardOk?'ok':'warn')+ ' mt-10' },
        el('span',{class:'bold'},'NO-REPAINT GUARD: '),
        guardOk ? `${primary.guard.closedCount} kapalı mum işlendi${primary.guard.skippedOpenCandle?' · son açık mum atlandı':' · son mum dahil'}` : 'Guard durumu doğrulanamadı'
      );
      body.appendChild(guardBadge);

    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class:'rux-note warn' }, 'Feature engine yüklenemedi: '+(err?.message||'bilinmeyen hata')));
    }
  }, 100);

  return wrap;
}

function metricMini(label, value, tone='') {
  return el('div', { class:'rux-rule-metric '+tone },
    el('div', { class:'tiny muted' }, label),
    el('div', { class:'mono bold mt-2' }, String(value))
  );
}

function formatEvidence(ev={}) {
  const parts = [];
  if (ev.bodyPct!=null) parts.push(`gövde ${ev.bodyPct}%`);
  if (ev.upperWickPct!=null) parts.push(`üst fitil ${ev.upperWickPct}%`);
  if (ev.lowerWickPct!=null) parts.push(`alt fitil ${ev.lowerWickPct}%`);
  if (ev.wickPct!=null) parts.push(`fitil ${ev.wickPct}%`);
  if (ev.closePos!=null) parts.push(`kapanış %${ev.closePos}`);
  if (ev.bodyRatio!=null) parts.push(`gövde oranı ${ev.bodyRatio}x`);
  if (ev.rangeRatio!=null) parts.push(`range oranı ${ev.rangeRatio}`);
  if (ev.recoveryPct!=null) parts.push(`telafi %${ev.recoveryPct}`);
  if (ev.volumeRatio!=null && ev.volumeRatio>1.1) parts.push(`hacim ${ev.volumeRatio}x`);
  if (ev.priorTrend) parts.push(`önceki trend ${ev.priorTrend.toLowerCase()}`);
  if (ev.direction) parts.push(ev.direction==='lower_wick'?'alt fitil':'üst fitil');
  return parts.slice(0,4).join(', ') || '—';
}

/* ───────── v0.51 — Market Structure / BOS / CHoCH / MSS paneli ───────── */
function buildStructureEnginePanel() {
  const body = el('div', { class: 'pa-structure-panel' },
    el('div', { class: 'small muted' }, 'Market structure engine başlatılıyor… swing pivot tespiti yapılıyor.')
  );
  const wrap = card({
    title: 'MARKET STRUCTURE v0.51 · BOS / CHoCH / MSS',
    link: 'NO-REPAINT PIVOT GUARD',
    body
  });

  setTimeout(async () => {
    try {
      const sym = State.symbol || 'BTCUSDT';
      const tfs = ['1h', '4h']; // structure engine için 2 TF yeterli (yoğun hesap)
      const results = {};
      await Promise.all(tfs.map(async tf => {
        try {
          const data = await fetchMarket(sym, tf, 200);
          const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
          results[tf] = runStructureEngine(candles, {
            tf,
            pivotLen: 3,
            lookback: 60,
            now: Date.now(),
          });
        } catch (e) {
          results[tf] = null;
        }
      }));

      body.innerHTML = '';

      // ── Üst: Anahtar metrikler (4h öncelikli) ──
      const primary = results['4h'] || results['1h'];
      if (!primary) {
        body.appendChild(el('div', { class: 'rux-note warn' }, 'Structure engine veri alamadı.'));
        return;
      }

      const top = el('div', { class: 'row cols-4', style:'gap:8px' });
      top.appendChild(metricMini(
        'BIAS (4H)',
        STRUCT_BIAS_LABEL_TR[primary.summary.bias] || primary.summary.bias,
        primary.summary.bias==='UP'?'pos':primary.summary.bias==='DOWN'?'neg':'warn'
      ));
      top.appendChild(metricMini(
        'REF HIGH',
        primary.levels.refHigh ? '$'+fmtPrice(primary.levels.refHigh.price) : '—',
        primary.summary.bias==='UP'?'pos':''
      ));
      top.appendChild(metricMini(
        'REF LOW',
        primary.levels.refLow ? '$'+fmtPrice(primary.levels.refLow.price) : '—',
        primary.summary.bias==='DOWN'?'neg':''
      ));
      const mssBadge = primary.summary.awaitingMssBull ? 'MSS↑ bekleniyor'
        : primary.summary.awaitingMssBear ? 'MSS↓ bekleniyor'
        : 'MSS yok';
      top.appendChild(metricMini(
        'MSS DURUMU',
        mssBadge,
        primary.summary.awaitingMssBull?'pos':primary.summary.awaitingMssBear?'neg':''
      ));
      body.appendChild(top);

      // ── Olay sayım tablosu (TF × event tipi) ──
      const countTbl = el('table', { class:'tbl tbl-compact mt-10' });
      countTbl.appendChild(el('thead', {}, el('tr', {},
        el('th',{},'TF'),
        el('th',{},'BIAS'),
        el('th',{},'BOS'),
        el('th',{},'CHOCH'),
        el('th',{},'MSS'),
        el('th',{},'SWING'),
        el('th',{},'TOP EVENT'),
      )));
      const ctbody = el('tbody');
      tfs.forEach(tf => {
        const r = results[tf];
        if (!r) {
          ctbody.appendChild(el('tr', {},
            el('td',{class:'mono'},tf.toUpperCase()),
            el('td',{colspan:'6',class:'muted small'},'veri alınamadı')
          ));
          return;
        }
        const top = r.summary.topEvent;
        const biasTone = r.summary.bias==='UP'?'green':r.summary.bias==='DOWN'?'red':'gray';
        ctbody.appendChild(el('tr', {},
          el('td',{class:'mono bold'}, tf.toUpperCase()),
          el('td',{}, tag(STRUCT_BIAS_LABEL_TR[r.summary.bias]||r.summary.bias, biasTone)),
          el('td',{class:'mono'}, String(r.summary.bosCount)),
          el('td',{class:'mono'}, String(r.summary.chochCount)),
          el('td',{class:'mono'}, String(r.summary.mssCount)),
          el('td',{class:'mono'}, String(r.summary.swingCount)),
          el('td',{class:'small'}, top
            ? `${STRUCT_EVENT_LABEL_TR[top.type]||top.type} ${top.side} · ${top.score}`
            : el('span',{class:'muted'},'—'))
        ));
      });
      countTbl.appendChild(ctbody);
      body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'Yapı Olay Sayımı'));
      body.appendChild(countTbl);

      // ── Kronolojik event timeline (4h, son 6) ──
      const timeline = primary.eventsChronological.slice(-6).reverse();
      body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'Son Yapı Olayları (4H · kronolojik, en yeni üstte)'));
      if (!timeline.length) {
        body.appendChild(el('div', {class:'rux-note warn'}, '4H grafiğinde son lookback penceresinde yapı olayı yok.'));
      } else {
        const evGrid = el('div', { style:'display:grid;grid-template-columns:1fr;gap:6px' });
        timeline.forEach(ev => {
          const tone = ev.side==='LONG'?'pos':ev.side==='SHORT'?'neg':'warn';
          const subLabel = ev.subtype
            ? ` · ${STRUCT_SUBTYPE_LABEL_TR[ev.subtype] || ev.subtype}`
            : '';
          const evidence = formatStructureEvidence(ev);
          evGrid.appendChild(el('div', { class:'rux-pa-event '+tone, style:'padding:8px;border-radius:6px' },
            el('div', {class:'flex between gap-8'},
              el('span', {class:'bold small'},
                (STRUCT_EVENT_LABEL_TR[ev.type]||ev.type) + subLabel
              ),
              el('span', {class:'mono tiny'}, `${ev.side} · ${ev.score}/100 · #-${ev.candleIndex}`)
            ),
            el('div', {class:'tiny muted mt-3'}, evidence),
          ));
        });
        body.appendChild(evGrid);
      }

      // ── No-Repaint Guard durumu ──
      const guardOk = primary.guard.closedCount > 0;
      body.appendChild(el('div', { class:'rux-note '+(guardOk?'ok':'warn')+ ' mt-10' },
        el('span',{class:'bold'},'PIVOT GUARD: '),
        guardOk
          ? `${primary.guard.closedCount} kapalı mum · pivot teyit süresi ±${primary.guard.pivotLen} mum${primary.guard.skippedOpenCandle?' · son açık mum atlandı':''}`
          : 'Guard durumu doğrulanamadı'
      ));
    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class:'rux-note warn' },
        'Structure engine yüklenemedi: '+(err?.message||'bilinmeyen hata')));
    }
  }, 120);

  return wrap;
}

function formatStructureEvidence(ev = {}) {
  const e = ev.evidence || {};
  const parts = [];
  if (e.brokenLevel != null) parts.push(`seviye $${fmtPrice(e.brokenLevel)}`);
  if (e.closePrice != null) parts.push(`kapanış $${fmtPrice(e.closePrice)}`);
  if (e.distanceFromLevel != null) parts.push(`mesafe ${e.distanceFromLevel>=0?'+':''}${fmtPrice(e.distanceFromLevel)}`);
  if (e.bodyPct != null) parts.push(`gövde %${e.bodyPct}`);
  if (e.priorBias) parts.push(`önceki bias ${STRUCT_BIAS_LABEL_TR[e.priorBias]||e.priorBias}`);
  if (e.price != null) parts.push(`pivot $${fmtPrice(e.price)}`);
  if (e.barsToConfirm != null) parts.push(`teyit ${e.barsToConfirm} mum`);
  if (e.triggerLevel != null) parts.push(`tetik $${fmtPrice(e.triggerLevel)}`);
  if (e.detail) parts.push(e.detail);
  return parts.slice(0, 5).join(' · ') || '—';
}

/* ───────── v0.52 — Order Flow / SMC paneli ───────── */
function buildOrderFlowPanel() {
  const body = el('div', { class: 'pa-orderflow-panel' },
    el('div', { class: 'small muted' }, 'Order flow engine başlatılıyor… FVG / OB / Equal Level / Sweep taraması yapılıyor.')
  );
  const wrap = card({
    title: 'ORDER FLOW v0.52 · FVG / OB / EQ / SWEEP',
    link: 'SMC IMBALANCE & LIQUIDITY',
    body
  });

  setTimeout(async () => {
    try {
      const sym = State.symbol || 'BTCUSDT';
      const tfs = ['1h', '4h'];
      const results = {};
      await Promise.all(tfs.map(async tf => {
        try {
          const data = await fetchMarket(sym, tf, 250);
          const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
          results[tf] = runOrderFlowEngine(candles, {
            tf,
            pivotLen: 3,
            lookback: 60,
            now: Date.now(),
          });
        } catch (e) {
          results[tf] = null;
        }
      }));

      body.innerHTML = '';
      const primary = results['4h'] || results['1h'];
      if (!primary) {
        body.appendChild(el('div', { class: 'rux-note warn' }, 'Order flow engine veri alamadı.'));
        return;
      }

      // ── Üst: 4 metrik özet (4H) ──
      const top = el('div', { class: 'row cols-4', style:'gap:8px' });
      top.appendChild(metricMini(
        'OF BIAS (4H)',
        primary.summary.bias,
        primary.summary.bias === 'LONG' ? 'pos' : primary.summary.bias === 'SHORT' ? 'neg' : 'warn'
      ));
      top.appendChild(metricMini(
        'AÇIK FVG',
        `${primary.summary.openFvgCount} / ${primary.summary.fvgCount}`,
        primary.summary.openFvgCount > 0 ? '' : 'muted'
      ));
      top.appendChild(metricMini(
        'AKTİF OB',
        `${primary.summary.activeOrderBlockCount} / ${primary.summary.orderBlockCount}`,
        primary.summary.activeOrderBlockCount > 0 ? '' : 'muted'
      ));
      top.appendChild(metricMini(
        'SWEEP / EQ',
        `${primary.summary.sweepCount} / ${primary.summary.equalLevelCount}`,
        primary.summary.sweepCount > 0 ? '' : 'muted'
      ));
      body.appendChild(top);

      // ── TF sayım tablosu ──
      const countTbl = el('table', { class:'tbl tbl-compact mt-10' });
      countTbl.appendChild(el('thead', {}, el('tr', {},
        el('th',{},'TF'),
        el('th',{},'BIAS'),
        el('th',{},'FVG (aç/tüm)'),
        el('th',{},'OB (akt/tüm)'),
        el('th',{},'EQ'),
        el('th',{},'SWEEP'),
        el('th',{},'TOP'),
      )));
      const ctbody = el('tbody');
      tfs.forEach(tf => {
        const r = results[tf];
        if (!r) {
          ctbody.appendChild(el('tr', {},
            el('td',{class:'mono'},tf.toUpperCase()),
            el('td',{colspan:'6',class:'muted small'},'veri alınamadı')
          ));
          return;
        }
        const tone = r.summary.bias==='LONG'?'green':r.summary.bias==='SHORT'?'red':'gray';
        const topEv = r.summary.topEvent;
        ctbody.appendChild(el('tr', {},
          el('td',{class:'mono bold'}, tf.toUpperCase()),
          el('td',{}, tag(r.summary.bias, tone)),
          el('td',{class:'mono'}, `${r.summary.openFvgCount}/${r.summary.fvgCount}`),
          el('td',{class:'mono'}, `${r.summary.activeOrderBlockCount}/${r.summary.orderBlockCount}`),
          el('td',{class:'mono'}, String(r.summary.equalLevelCount)),
          el('td',{class:'mono'}, String(r.summary.sweepCount)),
          el('td',{class:'small'}, topEv
            ? `${OF_EVENT_LABEL_TR[topEv.type]||topEv.type} ${topEv.side} · ${topEv.score}`
            : el('span',{class:'muted'},'—'))
        ));
      });
      countTbl.appendChild(ctbody);
      body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'TF Karşılaştırma'));
      body.appendChild(countTbl);

      // ── Aktif yapı tablosu: Açık FVG'ler ──
      const openFvgs = primary.fvgs.open.slice(0, 6);
      if (openFvgs.length) {
        const fvgTbl = el('table', { class:'tbl tbl-compact mt-10' });
        fvgTbl.appendChild(el('thead', {}, el('tr', {},
          el('th',{},'TİP'),
          el('th',{},'ÜST'),
          el('th',{},'ALT'),
          el('th',{},'BOYUT'),
          el('th',{},'DURUM'),
          el('th',{},'YAŞ'),
        )));
        const ftb = el('tbody');
        openFvgs.forEach(f => {
          const tone = f.side==='LONG'?'green':'red';
          ftb.appendChild(el('tr',{},
            el('td',{}, tag(OF_SUBTYPE_LABEL_TR[f.subtype]||f.subtype, tone)),
            el('td',{class:'mono'}, '$'+fmtPrice(f.top)),
            el('td',{class:'mono'}, '$'+fmtPrice(f.bottom)),
            el('td',{class:'mono'}, `${f.sizePctOfAtr}% ATR`),
            el('td',{class:'small'}, OF_STATUS_LABEL_TR[f.status]||f.status),
            el('td',{class:'mono small muted'}, `${f.ageBars}b`),
          ));
        });
        fvgTbl.appendChild(ftb);
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, `Açık FVG Tablosu (4H · ${openFvgs.length} aktif)`));
        body.appendChild(fvgTbl);
      }

      // ── Aktif Order Block'lar ──
      const activeObs = primary.orderBlocks.filter(o => o.status !== 'INVALIDATED').slice(0, 4);
      if (activeObs.length) {
        const obTbl = el('table', { class:'tbl tbl-compact mt-10' });
        obTbl.appendChild(el('thead', {}, el('tr', {},
          el('th',{},'TİP'),
          el('th',{},'ÜST'),
          el('th',{},'ALT'),
          el('th',{},'ORTA'),
          el('th',{},'DURUM'),
          el('th',{},'DISP'),
        )));
        const otb = el('tbody');
        activeObs.forEach(o => {
          const tone = o.side==='LONG'?'green':'red';
          otb.appendChild(el('tr',{},
            el('td',{}, tag(OF_SUBTYPE_LABEL_TR[o.subtype]||o.subtype, tone)),
            el('td',{class:'mono'}, '$'+fmtPrice(o.top)),
            el('td',{class:'mono'}, '$'+fmtPrice(o.bottom)),
            el('td',{class:'mono'}, '$'+fmtPrice(o.midpoint)),
            el('td',{class:'small'}, OF_STATUS_LABEL_TR[o.status]||o.status),
            el('td',{class:'mono small'}, `${o.displacementAtrMult}x`),
          ));
        });
        obTbl.appendChild(otb);
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, `Aktif Order Block (4H · ${activeObs.length})`));
        body.appendChild(obTbl);
      }

      // ── Son olaylar timeline ──
      const timeline = primary.eventsChronological.slice(-5).reverse();
      if (timeline.length) {
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'Son Order Flow Olayları (4H · en yeni üstte)'));
        const evGrid = el('div', { style:'display:grid;grid-template-columns:1fr;gap:6px' });
        timeline.forEach(ev => {
          const tone = ev.side==='LONG'?'pos':ev.side==='SHORT'?'neg':'warn';
          const subLabel = ev.subtype ? ` · ${OF_SUBTYPE_LABEL_TR[ev.subtype] || ev.subtype}` : '';
          const evidence = formatOrderFlowEvidence(ev);
          evGrid.appendChild(el('div', { class:'rux-pa-event '+tone, style:'padding:8px;border-radius:6px' },
            el('div', {class:'flex between gap-8'},
              el('span', {class:'bold small'},
                (OF_EVENT_LABEL_TR[ev.type]||ev.type) + subLabel
              ),
              el('span', {class:'mono tiny'}, `${ev.side} · ${ev.score}/100 · #-${ev.candleIndex}`)
            ),
            el('div', {class:'tiny muted mt-3'}, evidence),
          ));
        });
        body.appendChild(evGrid);
      }

      // ── No-repaint guard ──
      body.appendChild(el('div', { class:'rux-note ok mt-10' },
        el('span',{class:'bold'},'ORDER FLOW GUARD: '),
        `${primary.guard.closedCount} kapalı mum · imbalance/OB/sweep tespiti yalnızca confirmed pivot ve closed candle üstünde`
        + (primary.guard.skippedOpenCandle ? ' · son açık mum atlandı' : '')
      ));
    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class:'rux-note warn' },
        'Order flow engine yüklenemedi: '+(err?.message||'bilinmeyen hata')));
    }
  }, 140);

  return wrap;
}

function formatOrderFlowEvidence(ev = {}) {
  const e = ev.evidence || {};
  const parts = [];
  if (e.top != null && e.bottom != null) parts.push(`$${fmtPrice(e.bottom)} → $${fmtPrice(e.top)}`);
  if (e.midpoint != null) parts.push(`orta $${fmtPrice(e.midpoint)}`);
  if (e.level != null) parts.push(`seviye $${fmtPrice(e.level)}`);
  if (e.targetLevel != null) parts.push(`hedef $${fmtPrice(e.targetLevel)}`);
  if (e.closePrice != null) parts.push(`kapanış $${fmtPrice(e.closePrice)}`);
  if (e.sizePctOfAtr != null) parts.push(`boyut %${e.sizePctOfAtr} ATR`);
  if (e.penetrationPctOfAtr != null) parts.push(`penetrasyon %${e.penetrationPctOfAtr} ATR`);
  if (e.displacementAtrMult != null) parts.push(`disp ${e.displacementAtrMult}x`);
  if (e.status) parts.push(OF_STATUS_LABEL_TR[e.status] || e.status);
  if (e.touchCount != null) parts.push(`${e.touchCount} temas`);
  if (e.closePos != null) parts.push(`close %${e.closePos}`);
  return parts.slice(0, 5).join(' · ') || '—';
}

/* ───────── v0.53 — PA Template & No-Trade Integration paneli ───────── */
function buildTemplateEnginePanel() {
  const body = el('div', { class: 'pa-template-panel' },
    el('div', { class: 'small muted' }, 'Setup template motoru başlatılıyor… 4 SMC template no-trade filtresinden geçiriliyor.')
  );
  const wrap = card({
    title: 'SETUP TEMPLATE v0.53 · NO-TRADE FİLTRESİ',
    link: 'SWEEP REV · TREND PB · BREAKOUT RT · RANGE ROT',
    body
  });

  setTimeout(async () => {
    try {
      const sym = State.symbol || 'BTCUSDT';
      const tfs = ['1h', '4h'];
      const results = {};
      await Promise.all(tfs.map(async tf => {
        try {
          const data = await fetchMarket(sym, tf, 250);
          const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
          results[tf] = runTemplateEngine(candles, {
            tf, pivotLen: 3, lookback: 60, now: Date.now(),
          });
        } catch (e) {
          results[tf] = null;
        }
      }));

      body.innerHTML = '';
      const primary = results['4h'] || results['1h'];
      if (!primary) {
        body.appendChild(el('div', { class:'rux-note warn' }, 'Template engine veri alamadı.'));
        return;
      }

      // ── Üst: 4 metrik özet ──
      const topRow = el('div', { class:'row cols-4', style:'gap:8px' });
      topRow.appendChild(metricMini(
        'TOPLAM SETUP',
        String(primary.summary.totalTemplates),
        primary.summary.totalTemplates > 0 ? '' : 'muted'
      ));
      topRow.appendChild(metricMini(
        'AKTİF (TEMİZ)',
        String(primary.summary.activeCount),
        primary.summary.activeCount > 0 ? 'pos' : 'muted'
      ));
      topRow.appendChild(metricMini(
        'NO-TRADE ENGELLİ',
        String(primary.summary.blockedCount),
        primary.summary.blockedCount > 0 ? 'warn' : 'muted'
      ));
      const top = primary.summary.topTemplate;
      topRow.appendChild(metricMini(
        'EN İYİ SETUP',
        top ? `${TPL_LABEL_TR[top.subtype]||top.subtype} ${top.side}` : '—',
        top ? (top.side==='LONG'?'pos':'neg') : 'muted'
      ));
      body.appendChild(topRow);

      // ── Type breakdown ──
      const breakdownRow = el('div', { class:'row cols-4 mt-10', style:'gap:8px' });
      ['SWEEP_REVERSAL','TREND_PULLBACK','BREAKOUT_RETEST','RANGE_ROTATION'].forEach(sub => {
        const cnt = primary.summary.byType[sub] || 0;
        breakdownRow.appendChild(metricMini(
          TPL_LABEL_TR[sub] || sub,
          String(cnt),
          cnt > 0 ? '' : 'muted'
        ));
      });
      body.appendChild(breakdownRow);

      // ── Aktif setupları detaylı göster ──
      const activeList = primary.active.slice(0, 5);
      if (activeList.length) {
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'},
          `Aktif Setup'lar (4H · ${activeList.length} adet · finalScore ile sıralı)`));
        const grid = el('div', { style:'display:grid;grid-template-columns:1fr;gap:8px' });
        activeList.forEach(t => grid.appendChild(buildTemplateCard(t, false)));
        body.appendChild(grid);
      } else {
        body.appendChild(el('div', { class:'rux-note warn mt-12' },
          '4H grafiğinde aktif (no-trade filtresinden geçen) setup bulunmuyor.'));
      }

      // ── Blocked setupları kompakt göster (transparency için) ──
      if (primary.blocked.length > 0) {
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'},
          `No-Trade ile Engellenen Setup'lar (${primary.blocked.length} adet · transparency)`));
        const blockedGrid = el('div', { style:'display:grid;grid-template-columns:1fr;gap:4px' });
        primary.blocked.slice(0, 3).forEach(t => blockedGrid.appendChild(buildTemplateCard(t, true)));
        body.appendChild(blockedGrid);
      }

      // ── TF karşılaştırma tablosu ──
      const tfTbl = el('table', { class:'tbl tbl-compact mt-12' });
      tfTbl.appendChild(el('thead', {}, el('tr', {},
        el('th',{},'TF'),
        el('th',{},'TOPLAM'),
        el('th',{},'AKTİF'),
        el('th',{},'ENGELLİ'),
        el('th',{},'EN İYİ'),
        el('th',{},'FINAL SKOR'),
      )));
      const tbody = el('tbody');
      tfs.forEach(tf => {
        const r = results[tf];
        if (!r) {
          tbody.appendChild(el('tr', {},
            el('td',{class:'mono'}, tf.toUpperCase()),
            el('td',{colspan:'5',class:'muted small'}, 'veri alınamadı')
          ));
          return;
        }
        const tpName = r.summary.topTemplate
          ? `${TPL_LABEL_TR[r.summary.topTemplate.subtype]||r.summary.topTemplate.subtype} ${r.summary.topTemplate.side}`
          : '—';
        const finalScore = r.summary.topTemplate?.finalScore?.score ?? null;
        const tone = finalScore >= 85 ? 'pos' : finalScore >= 70 ? '' : finalScore != null ? 'warn' : 'muted';
        tbody.appendChild(el('tr', {},
          el('td',{class:'mono bold'}, tf.toUpperCase()),
          el('td',{class:'mono'}, String(r.summary.totalTemplates)),
          el('td',{class:'mono'}, String(r.summary.activeCount)),
          el('td',{class:'mono'}, String(r.summary.blockedCount)),
          el('td',{class:'small'}, tpName),
          el('td',{class:'mono '+tone}, finalScore != null ? finalScore.toFixed(1) : '—'),
        ));
      });
      tfTbl.appendChild(tbody);
      body.appendChild(tfTbl);

      // ── No-repaint guard ──
      body.appendChild(el('div', { class:'rux-note ok mt-10' },
        el('span',{class:'bold'},'TEMPLATE GUARD: '),
        `${primary.guard.closedCount} kapalı mum · 4 template motoru no-trade filtresinden geçirildi`
        + (primary.guard.skippedOpenCandle ? ' · son açık mum atlandı' : '')
      ));

    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class:'rux-note warn' },
        'Template engine yüklenemedi: '+(err?.message||'bilinmeyen hata')));
    }
  }, 160);

  return wrap;
}

function buildTemplateCard(t, isBlocked) {
  const tone = isBlocked ? 'warn' : (t.side === 'LONG' ? 'pos' : 'neg');
  const headerBg = isBlocked ? 'rgba(255,184,107,0.06)'
                : t.side === 'LONG' ? 'rgba(22,240,168,0.06)'
                : 'rgba(255,91,110,0.06)';

  const header = el('div', { class:'flex between gap-8', style:'margin-bottom:6px' },
    el('div', { class:'flex gap-8' },
      el('span', { class:'bold' }, TPL_LABEL_TR[t.subtype] || t.subtype),
      el('span', { class:'tag '+tone }, t.side),
    ),
    el('div', { class:'flex gap-8' },
      el('span', { class:'mono small' }, `final: ${t.finalScore.score}`),
      el('span', { class:'tag '+(t.finalScore.score>=85?'green':t.finalScore.score>=75?'cyan':'yellow') },
        t.finalScore.label),
    )
  );

  const plan = t.plan;
  const planRow = el('div', { class:'row cols-5', style:'gap:6px;font-size:11px' },
    el('div', { class:'rux-rule-metric' },
      el('div', {class:'tiny muted'}, 'Giriş'),
      el('div', {class:'mono bold'}, '$'+fmtPrice(plan.entry))),
    el('div', { class:'rux-rule-metric neg' },
      el('div', {class:'tiny muted'}, 'Stop'),
      el('div', {class:'mono bold'}, '$'+fmtPrice(plan.stop))),
    el('div', { class:'rux-rule-metric' },
      el('div', {class:'tiny muted'}, 'T1 (1R)'),
      el('div', {class:'mono bold'}, '$'+fmtPrice(plan.target1))),
    el('div', { class:'rux-rule-metric pos' },
      el('div', {class:'tiny muted'}, 'T2'),
      el('div', {class:'mono bold'}, '$'+fmtPrice(plan.target2))),
    el('div', { class:'rux-rule-metric ' + (plan.rr >= 2 ? 'pos' : plan.rr >= 1.5 ? '' : 'warn') },
      el('div', {class:'tiny muted'}, 'R:R'),
      el('div', {class:'mono bold'}, `1:${plan.rr}`)),
  );

  const blocks = [];
  if (isBlocked && t.noTrade.hardBlocks?.length) {
    blocks.push(el('div', { class:'rux-note warn', style:'margin-top:6px;font-size:11px' },
      el('span', {class:'bold'}, 'ENGEL: '),
      t.noTrade.hardBlocks.join(' · ')
    ));
  } else if (t.noTrade.softWarnings?.length) {
    blocks.push(el('div', { class:'tiny muted', style:'margin-top:6px' },
      'Uyarılar: '+t.noTrade.softWarnings.join(', ')
    ));
  }

  const evParts = [];
  if (t.evidence?.bosSubtype) evParts.push(`BOS: ${t.evidence.bosSubtype}`);
  if (t.evidence?.sweepType) evParts.push(`Sweep: ${t.evidence.sweepType}`);
  if (t.evidence?.confirmation) evParts.push(`Confirm: ${t.evidence.confirmation.eventType}`);
  if (t.evidence?.retestSource) evParts.push(`Retest: ${t.evidence.retestSource}`);
  if (t.evidence?.fvgStatus) evParts.push(`FVG: ${OF_STATUS_LABEL_TR[t.evidence.fvgStatus]||t.evidence.fvgStatus}`);
  if (t.evidence?.rangeHeight) evParts.push(`Range height: ${t.evidence.rangeHeight}`);

  const evRow = evParts.length
    ? el('div', { class:'tiny muted', style:'margin-top:6px' }, evParts.join(' · '))
    : null;

  // v0.54: Confluence row
  let confRow = null;
  if (t.confluence && t.confluence.overall > 0) {
    const c = t.confluence;
    const confTone = c.label === 'GÜÇLÜ' ? 'green' : c.label === 'ORTA' ? 'cyan' : 'yellow';
    const hitsList = [
      ...c.entry.hits.map(h => `Entry:${h.ref}`),
      ...c.target.hits.map(h => `T2:${h.ref}`),
    ].slice(0, 5);
    confRow = el('div', { class:'tiny', style:'margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
      el('span', { class:'tag '+confTone }, `VP CONFLUENCE: ${c.label}`),
      el('span', { class:'mono muted' }, `${c.overall}/100`),
      ...(t.finalScore.confluenceBoost ? [el('span', { class:'tag pos' }, `+${t.finalScore.confluenceBoost} skor`)] : []),
      hitsList.length ? el('span', { class:'muted' }, hitsList.join(' · ')) : null,
      c.dayType && c.dayType !== 'UNKNOWN' ? el('span', { class:'tag gray' }, c.dayType.replace('_', ' ')) : null,
    );
  }

  // v0.55: Delta confirmation row
  let deltaRow = null;
  if (t.deltaConfirmation) {
    const dc = t.deltaConfirmation;
    const dTone = dc.aligned ? 'green' : dc.conflicted ? 'red' : 'gray';
    const dLabel = dc.aligned ? 'DELTA UYUMLU'
                 : dc.conflicted ? 'DELTA ÇATIŞMALI'
                 : 'DELTA NÖTR';
    const deltaBoost = t.finalScore.deltaBoost;
    const boostTag = deltaBoost
      ? el('span', { class:'tag '+(deltaBoost > 0 ? 'pos' : 'neg') },
          `${deltaBoost > 0 ? '+' : ''}${deltaBoost} skor`)
      : null;
    const eventsSummary = dc.supportingEvents.length || dc.opposingEvents.length
      ? `${dc.supportingEvents.length}supp · ${dc.opposingEvents.length}opp`
      : null;
    deltaRow = el('div', { class:'tiny', style:'margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
      el('span', { class:'tag '+dTone }, dLabel),
      el('span', { class:'mono muted' }, `bias: ${dc.bias}`),
      ...(boostTag ? [boostTag] : []),
      eventsSummary ? el('span', { class:'muted' }, eventsSummary) : null,
      dc.sourceMode ? el('span', { class:'tag '+(dc.sourceMode==='real'?'cyan':'yellow') },
        `${dc.sourceMode === 'real' ? 'gerçek Δ' : 'proxy Δ'}`) : null,
    );
  }

  return el('div', {
    class: 'card',
    style: `padding:10px;border-radius:6px;background:${headerBg};opacity:${isBlocked?'0.7':'1'}`
  }, header, planRow, ...(evRow ? [evRow] : []), ...(confRow ? [confRow] : []), ...(deltaRow ? [deltaRow] : []), ...blocks);
}

/* ───────── v0.54 — Volume Profile / VWAP / Auction Market paneli ───────── */
function buildVolumeEnginePanel() {
  const body = el('div', { class: 'pa-volume-panel' },
    el('div', { class: 'small muted' }, 'Volume profile motoru başlatılıyor… VP / VWAP / Day Type taraması yapılıyor.')
  );
  const wrap = card({
    title: 'VOLUME PROFILE v0.54 · VP / VWAP / DAY TYPE',
    link: 'AUCTION MARKET CONFLUENCE',
    body
  });

  setTimeout(async () => {
    try {
      const sym = State.symbol || 'BTCUSDT';
      const data = await fetchMarket(sym, '4h', 200);
      const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
      const r = runVolumeEngine(candles, { tf:'4h', binCount: 50, now: Date.now() });

      body.innerHTML = '';
      if (!r.compositeVP) {
        body.appendChild(el('div', { class:'rux-note warn' }, 'Volume engine veri alamadı veya yetersiz mum.'));
        return;
      }

      // ── Üst: 4 metrik özet ──
      const lastClose = r.summary.lastClose;
      const pocPrice = r.summary.poc?.price;
      const vwap = r.summary.currentVwap;
      const distToPoc = pocPrice ? round(((lastClose - pocPrice) / pocPrice) * 100, 2) : null;
      const vwapDelta = vwap ? round(((lastClose - vwap) / vwap) * 100, 2) : null;
      const topRow = el('div', { class:'row cols-4', style:'gap:8px' });
      topRow.appendChild(metricMini(
        'POC',
        pocPrice ? '$'+fmtPrice(pocPrice) : '—',
        distToPoc != null ? (Math.abs(distToPoc) < 1 ? 'warn' : '') : 'muted'
      ));
      topRow.appendChild(metricMini(
        'VWAP (SESSION)',
        vwap ? '$'+fmtPrice(vwap) : '—',
        vwapDelta != null ? (r.summary.aboveVwap ? 'pos' : 'neg') : 'muted'
      ));
      topRow.appendChild(metricMini(
        'KONUM',
        VOL_LABEL_TR[r.summary.location] || r.summary.location,
        r.summary.location === 'ABOVE_VA' ? 'pos' : r.summary.location === 'BELOW_VA' ? 'neg' : 'warn'
      ));
      topRow.appendChild(metricMini(
        'GÜN TİPİ',
        VOL_LABEL_TR[r.summary.dayType] || r.summary.dayTypeLabel || 'Bilinmiyor',
        r.summary.dayType === 'TREND_DAY' ? 'pos' : r.summary.dayType === 'NORMAL_DAY' ? 'warn' : 'muted'
      ));
      body.appendChild(topRow);

      // ── VAH/VAL/POC/HVN/LVN tablosu ──
      const levelsTbl = el('table', { class:'tbl tbl-compact mt-10' });
      levelsTbl.appendChild(el('thead', {}, el('tr', {},
        el('th',{},'TÜR'), el('th',{},'FİYAT'), el('th',{},'HACİM %'), el('th',{},'MESAFE %'),
      )));
      const ltb = el('tbody');
      const addLevel = (label, price, volPct, tone) => {
        const dist = price ? round(((lastClose - price) / lastClose) * 100, 2) : null;
        ltb.appendChild(el('tr', {},
          el('td',{}, el('span',{class:'tag '+tone}, label)),
          el('td',{class:'mono'}, price ? '$'+fmtPrice(price) : '—'),
          el('td',{class:'mono'}, volPct != null ? volPct+'%' : '—'),
          el('td',{class:'mono '+(dist > 0 ? 'pos' : dist < 0 ? 'neg' : '')}, dist != null ? `%${dist}` : '—'),
        ));
      };
      addLevel('POC', r.compositeVP.poc?.price, r.compositeVP.poc?.volPct, 'cyan');
      addLevel('VAH', r.compositeVP.vah?.price, null, 'green');
      addLevel('VAL', r.compositeVP.val?.price, null, 'red');
      r.compositeVP.hvns.slice(0, 4).forEach(hvn =>
        addLevel('HVN', hvn.price, hvn.volPct, 'gray')
      );
      r.compositeVP.lvns.slice(0, 3).forEach(lvn =>
        addLevel('LVN', lvn.price, lvn.volPct, 'yellow')
      );
      levelsTbl.appendChild(ltb);
      body.appendChild(el('div', {class:'small muted mt-12 mb-4'},
        `Volume Profile Seviyeleri (composite · ${r.compositeVP.binCount} bin · ${r.compositeVP.valueAreaPct}% VA)`));
      body.appendChild(levelsTbl);

      // ── VWAP bands ──
      if (r.summary.vwapBands?.length) {
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'VWAP Deviation Bands (session)'));
        const bandsTbl = el('table', { class:'tbl tbl-compact' });
        bandsTbl.appendChild(el('thead', {}, el('tr', {},
          el('th',{},'σ'), el('th',{},'ÜST'), el('th',{},'ALT'), el('th',{},'MESAFE %'),
        )));
        const btb = el('tbody');
        r.summary.vwapBands.forEach(b => {
          const upperDist = b.upper ? round(((lastClose - b.upper) / lastClose) * 100, 2) : null;
          const lowerDist = b.lower ? round(((lastClose - b.lower) / lastClose) * 100, 2) : null;
          btb.appendChild(el('tr', {},
            el('td',{class:'mono bold'}, `±${b.sigma}σ`),
            el('td',{class:'mono'}, b.upper ? '$'+fmtPrice(b.upper) : '—'),
            el('td',{class:'mono'}, b.lower ? '$'+fmtPrice(b.lower) : '—'),
            el('td',{class:'mono small muted'},
              `üst:${upperDist != null ? '%'+upperDist : '—'} alt:${lowerDist != null ? '%'+lowerDist : '—'}`
            ),
          ));
        });
        bandsTbl.appendChild(btb);
        body.appendChild(bandsTbl);
      }

      // ── Day Type detayı ──
      if (r.dayType && r.dayType.ib) {
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'}, 'Auction Market — Initial Balance'));
        const dayTbl = el('table', { class:'tbl tbl-compact' });
        dayTbl.appendChild(el('thead', {}, el('tr', {},
          el('th',{},'ALAN'), el('th',{},'YÜKSEK'), el('th',{},'DÜŞÜK'), el('th',{},'RANGE'),
        )));
        const dtb = el('tbody');
        dtb.appendChild(el('tr', {},
          el('td',{}, el('span',{class:'tag cyan'},'IB (Initial Balance)')),
          el('td',{class:'mono'}, '$'+fmtPrice(r.dayType.ib.high)),
          el('td',{class:'mono'}, '$'+fmtPrice(r.dayType.ib.low)),
          el('td',{class:'mono'}, '$'+fmtPrice(r.dayType.ib.range)),
        ));
        dtb.appendChild(el('tr', {},
          el('td',{}, el('span',{class:'tag green'},'Gün')),
          el('td',{class:'mono'}, '$'+fmtPrice(r.dayType.day.high)),
          el('td',{class:'mono'}, '$'+fmtPrice(r.dayType.day.low)),
          el('td',{class:'mono'}, '$'+fmtPrice(r.dayType.day.range)),
        ));
        dayTbl.appendChild(dtb);
        body.appendChild(dayTbl);
        body.appendChild(el('div', {class:'small muted mt-6'},
          `IB extension: ${r.dayType.ibExtensionRatio}x · IB / Day: %${r.dayType.ibPctOfDay} · Kapanış ${r.dayType.closeInIb ? 'IB içi' : 'IB dışı'}`));
      }

      // ── No-repaint guard ──
      body.appendChild(el('div', { class:'rux-note ok mt-10' },
        el('span',{class:'bold'},'VOLUME GUARD: '),
        `${r.guard.closedCount} kapalı mum · VP/VWAP yalnızca kapalı mumlardan, Day Type yalnızca tamamlanmış seans için`
        + (r.guard.skippedOpenCandle ? ' · son açık mum atlandı' : '')
      ));

    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class:'rux-note warn' },
        'Volume engine yüklenemedi: '+(err?.message||'bilinmeyen hata')));
    }
  }, 180);

  return wrap;
}

function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }

/* ───────── v0.55 — Order Flow / Delta / CVD paneli ───────── */
function buildDeltaEnginePanel() {
  const body = el('div', { class: 'pa-delta-panel' },
    el('div', { class: 'small muted' }, 'Delta motoru başlatılıyor… CVD / Divergence / Absorption / Climactic taraması yapılıyor.')
  );
  const wrap = card({
    title: 'DELTA / CVD v0.55 · ORDER FLOW INTERNALS',
    link: 'AGRESYON ANALİZİ',
    body
  });

  setTimeout(async () => {
    try {
      const sym = State.symbol || 'BTCUSDT';
      const data = await fetchMarket(sym, '4h', 200);
      const candles = normalizeCandleInput(data?.ohlcv || data?.candles || []);
      const r = runDeltaEngine(candles, { tf:'4h', lookback: 60, now: Date.now() });

      body.innerHTML = '';
      if (!r.cvd || r.cvd.series.length === 0) {
        body.appendChild(el('div', { class:'rux-note warn' }, 'Delta engine veri alamadı veya yetersiz mum.'));
        return;
      }

      // ── 4 metrik özet ──
      const topRow = el('div', { class:'row cols-4', style:'gap:8px' });
      topRow.appendChild(metricMini(
        'KAYNAK',
        DELTA_SOURCE_LABEL_TR[r.summary.sourceMode] || r.summary.sourceMode,
        r.summary.sourceMode === 'real' ? 'pos' : r.summary.sourceMode === 'proxy' ? 'warn' : 'muted'
      ));
      topRow.appendChild(metricMini(
        'BIAS',
        r.summary.bias,
        r.summary.bias === 'LONG' ? 'pos' : r.summary.bias === 'SHORT' ? 'neg' : 'muted'
      ));
      topRow.appendChild(metricMini(
        'CVD',
        r.summary.currentCvd != null ? fmtNumberShort(r.summary.currentCvd) : '—',
        r.summary.currentCvd > 0 ? 'pos' : r.summary.currentCvd < 0 ? 'neg' : 'muted'
      ));
      topRow.appendChild(metricMini(
        'SON Δ',
        r.summary.currentDelta != null ? fmtNumberShort(r.summary.currentDelta) : '—',
        r.summary.currentDelta > 0 ? 'pos' : r.summary.currentDelta < 0 ? 'neg' : 'muted'
      ));
      body.appendChild(topRow);

      // ── Event sayım tablosu ──
      const countTbl = el('table', { class:'tbl tbl-compact mt-10' });
      countTbl.appendChild(el('thead', {}, el('tr', {},
        el('th',{},'TİP'), el('th',{},'SAYI'), el('th',{},'EN İYİ'),
      )));
      const ctb = el('tbody');
      const eventTypes = [
        { key: 'divergenceCount', label: 'DELTA_DIVERGENCE', subkey: 'divergences' },
        { key: 'absorptionCount', label: 'ABSORPTION', subkey: 'absorptions' },
        { key: 'climacticCount', label: 'CLIMACTIC_VOLUME', subkey: 'climactics' },
        { key: 'sustainedCount', label: 'SUSTAINED_PRESSURE', subkey: 'sustained' },
      ];
      eventTypes.forEach(et => {
        const cnt = r.summary[et.key] || 0;
        const list = r[et.subkey] || [];
        const top = list.length ? list.reduce((m, e) => (e.score > (m.score||0)) ? e : m, {}) : null;
        ctb.appendChild(el('tr', {},
          el('td',{}, DELTA_EVENT_LABEL_TR[et.label] || et.label),
          el('td',{class:'mono'}, String(cnt)),
          el('td',{class:'small'}, top
            ? `${DELTA_SUBTYPE_LABEL_TR[top.subtype] || top.subtype} ${top.side} · ${top.score}`
            : el('span',{class:'muted'},'—')),
        ));
      });
      countTbl.appendChild(ctb);
      body.appendChild(countTbl);

      // ── Son delta event'leri ──
      const recentEvents = r.eventsChronological.slice(-5).reverse();
      if (recentEvents.length) {
        body.appendChild(el('div', {class:'small muted mt-12 mb-4'},
          `Son Delta Olayları (4H · en yeni üstte)`));
        const evGrid = el('div', { style:'display:grid;grid-template-columns:1fr;gap:6px' });
        recentEvents.forEach(ev => {
          const tone = ev.side==='LONG'?'pos':ev.side==='SHORT'?'neg':'warn';
          const subLabel = ev.subtype
            ? ` · ${DELTA_SUBTYPE_LABEL_TR[ev.subtype] || ev.subtype}`
            : '';
          const interpretation = ev.evidence?.interpretation;
          const evParts = [];
          if (ev.evidence?.priorTrend) evParts.push(`önceki: ${ev.evidence.priorTrend.toLowerCase()}`);
          if (ev.evidence?.volumeMult) evParts.push(`hacim ${ev.evidence.volumeMult}x`);
          if (ev.evidence?.deltaPct != null) evParts.push(`Δ %${ev.evidence.deltaPct}`);
          if (ev.evidence?.priceDeltaPct != null) evParts.push(`fiyat %${ev.evidence.priceDeltaPct}`);
          if (ev.evidence?.cvdDeltaPct != null) evParts.push(`CVD %${ev.evidence.cvdDeltaPct}`);
          if (ev.evidence?.absDeltaXavg != null) evParts.push(`|Δ| ${ev.evidence.absDeltaXavg}x`);
          evGrid.appendChild(el('div', { class:'rux-pa-event '+tone, style:'padding:8px;border-radius:6px' },
            el('div', {class:'flex between gap-8'},
              el('span', {class:'bold small'},
                (DELTA_EVENT_LABEL_TR[ev.type]||ev.type) + subLabel),
              el('span', {class:'mono tiny'}, `${ev.side} · ${ev.score}/100 · #-${ev.candleIndex}`)
            ),
            el('div', {class:'tiny muted mt-3'}, evParts.join(' · ') || '—'),
            ...(interpretation ? [el('div', {class:'tiny mt-3', style:'font-style:italic'}, interpretation)] : []),
          ));
        });
        body.appendChild(evGrid);
      }

      // ── Veri kaynağı bilgi notu ──
      const ss = r.summary.sourceStats || {};
      body.appendChild(el('div', {class:'small muted mt-10'},
        `Veri kaynağı dağılımı: ${ss.real || 0} mum gerçek (taker buy) · ${ss.proxy || 0} mum proxy (tick rule)`
        + (r.summary.sourceMode === 'proxy' ? ' · Proxy modu: tahmin doğruluğu sınırlı' : '')
      ));

      // ── No-repaint ──
      body.appendChild(el('div', { class:'rux-note ok mt-6' },
        el('span',{class:'bold'},'DELTA GUARD: '),
        `${r.guard.closedCount} kapalı mum · CVD ve event'ler yalnızca kapalı mumlardan`
        + (r.guard.skippedOpenCandle ? ' · son açık mum atlandı' : '')
      ));

    } catch (err) {
      body.innerHTML = '';
      body.appendChild(el('div', { class:'rux-note warn' },
        'Delta engine yüklenemedi: '+(err?.message||'bilinmeyen hata')));
    }
  }, 200);

  return wrap;
}

function fmtNumberShort(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v/1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return (v/1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return (v/1e3).toFixed(2) + 'K';
  return v.toFixed(2);
}
