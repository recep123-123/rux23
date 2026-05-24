/* RUx — Chart helpers (Lightweight Charts) */
import { fmtPrice, ema } from './api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

const _LWC = () => (window.LightweightCharts || null);

function ensureChartHost(host, className = 'chart-host short') {
  if (host && typeof host.appendChild === 'function') return host;
  const div = document.createElement('div');
  div.className = className;
  div.style.height = '180px';
  return div;
}

function normalizeSeriesInput(series) {
  if (!Array.isArray(series)) return [];
  if (series.length && typeof series[0] === 'number') return [{ values: series }];
  if (series.length && series[0] && typeof series[0] === 'object' && 'value' in series[0]) {
    return [{ values: series.map(x => Number(x.value || 0)), color: '#10b981', width: 2, fill: true }];
  }
  return series;
}

export function makeCandleChart(host, opts = {}) {
  const LWC = _LWC();
  if (!LWC) {
    host.innerHTML = '<div class="empty">Grafik motoru yüklenemedi.</div>';
    return null;
  }
  host.innerHTML = '';
  const chart = LWC.createChart(host, {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#94a3b8',
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 10,
    },
    grid: {
      vertLines: { color: 'rgba(148,163,184,0.06)' },
      horzLines: { color: 'rgba(148,163,184,0.06)' },
    },
    rightPriceScale: { borderColor: 'rgba(148,163,184,0.08)', scaleMargins: { top: 0.1, bottom: 0.18 } },
    timeScale: { borderColor: 'rgba(148,163,184,0.08)', timeVisible: true, secondsVisible: false },
    crosshair: { mode: 1, vertLine: { color: 'rgba(34,211,238,0.45)', labelBackgroundColor: '#0891b2' }, horzLine: { color: 'rgba(34,211,238,0.45)', labelBackgroundColor: '#0891b2' } },
    autoSize: true,
    ...opts,
  });
  const series = chart.addCandlestickSeries({
    upColor: '#16a34a', downColor: '#dc2626',
    borderUpColor: '#16a34a', borderDownColor: '#dc2626',
    wickUpColor: '#16a34a', wickDownColor: '#dc2626',
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  });
  return { chart, series };
}



export function normalizeCandleInput(rows = []) {
  const out = [];
  for (const c of rows || []) {
    const isArr = Array.isArray(c);
    const rawTime = isArr ? c[0] : (c.time ?? c.t ?? c.timestamp ?? c.openTime);
    let t = Number(rawTime);
    if (!Number.isFinite(t)) continue;
    // Lightweight Charts accepts UNIX seconds; most APIs return ms. Normalize safely.
    if (t > 10_000_000_000) t = Math.floor(t / 1000);
    else t = Math.floor(t);
    const open = Number(isArr ? c[1] : (c.open ?? c.o));
    const high = Number(isArr ? c[2] : (c.high ?? c.h));
    const low = Number(isArr ? c[3] : (c.low ?? c.l));
    const close = Number(isArr ? c[4] : (c.close ?? c.c));
    const volume = Number(isArr ? (c[5] ?? 0) : (c.volume ?? c.v ?? 0));
    if (![open, high, low, close].every(Number.isFinite)) continue;
    out.push({ time: t, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 });
  }
  // Deduplicate/sort: invalid or duplicate times can make Lightweight Charts show "Invalid Date".
  const map = new Map();
  for (const c of out) map.set(c.time, c);
  return Array.from(map.values()).sort((a, b) => a.time - b.time);
}

export function addEmaLine(chart, candles, period, color) {
  const closes = candles.map(c => c.close);
  const e = ema(closes, period);
  const data = candles.map((c, i) => ({ time: c.time, value: e[i] })).filter(p => p.value != null && isFinite(p.value));
  const line = chart.addLineSeries({ color, lineWidth: 1.4, priceLineVisible: false, lastValueVisible: false });
  line.setData(data);
  return line;
}

export function addVolumeHistogram(chart, candles) {
  const vol = chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'vol',
    color: 'rgba(34,211,238,0.4)',
  });
  vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  vol.setData(candles.map(c => ({
    time: c.time,
    value: c.volume || 0,
    color: c.close >= c.open ? 'rgba(22,163,74,0.45)' : 'rgba(220,38,38,0.45)',
  })));
  return vol;
}

/* Line chart (single series) */
export function makeLineChart(host, data, color = '#22d3ee', opts = {}) {
  const LWC = _LWC();
  if (!LWC) { host.innerHTML = '<div class="empty">Grafik motoru yüklenemedi.</div>'; return null; }
  host.innerHTML = '';
  const chart = LWC.createChart(host, {
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: '#94a3b8', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
    grid: { vertLines: { color: 'rgba(148,163,184,0.06)' }, horzLines: { color: 'rgba(148,163,184,0.06)' } },
    rightPriceScale: { borderColor: 'rgba(148,163,184,0.08)' },
    timeScale: { borderColor: 'rgba(148,163,184,0.08)', timeVisible: true },
    autoSize: true,
    ...opts,
  });
  const s = chart.addAreaSeries({ topColor: color + '55', bottomColor: color + '00', lineColor: color, lineWidth: 2, priceLineVisible: false });
  s.setData(data || []);
  return { chart, series: s };
}

/* Build synthetic candles from a list of closes / timestamps when missing */
export function synthCandlesFromCloses(closes, startTs, stepSec) {
  const out = [];
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    const o = i > 0 ? closes[i-1] : c;
    const h = Math.max(o, c) * (1 + Math.random() * 0.004);
    const l = Math.min(o, c) * (1 - Math.random() * 0.004);
    out.push({ time: Math.floor((startTs + i * stepSec) / 1) , open: o, high: h, low: l, close: c, volume: 1000 + Math.random()*1000 });
  }
  return out;
}

/* Bar/histogram (canvas) — for distributions etc. */
export function canvasBarChart(host, data, opts = {}) {
  host = ensureChartHost(host);
  data = Array.isArray(data) ? data : [];
  const w = host.clientWidth || 400, h = host.clientHeight || 220;
  host.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
  host.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  const padL = 28, padR = 8, padT = 8, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const max = Math.max(...data.map(d => d.value));
  const min = Math.min(0, Math.min(...data.map(d => d.value)));
  const rng = max - min || 1;
  const bw = innerW / data.length;
  // grid
  ctx.strokeStyle = 'rgba(148,163,184,0.10)'; ctx.lineWidth = 0.5;
  for (let g = 0; g < 5; g++) {
    const y = padT + (g/4) * innerH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + innerW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '9px JetBrains Mono';
    ctx.fillText(((max - (max-min)*g/4)).toFixed(0), 4, y+3);
  }
  // bars
  data.forEach((d, i) => {
    const x = padL + i * bw + 1;
    const yZero = padT + ((max - 0) / rng) * innerH;
    const yV = padT + ((max - d.value) / rng) * innerH;
    const top = Math.min(yZero, yV), bot = Math.max(yZero, yV);
    ctx.fillStyle = d.color || (d.value >= 0 ? '#16a34a' : '#dc2626');
    ctx.fillRect(x, top, Math.max(1, bw - 2), bot - top);
  });
  // labels
  ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.font = '9px Inter';
  data.forEach((d, i) => {
    if (d.label && (i % Math.ceil(data.length/8) === 0)) {
      const x = padL + i * bw + bw/2;
      ctx.fillText(d.label, x - 8, h - 6);
    }
  });
  return c;
}

/* Heatmap (cells grid) — canvas */
export function canvasHeatmap(host, rows, opts = {}) {
  host = ensureChartHost(host);
  rows = Array.isArray(rows) ? rows : [];
  const w = host.clientWidth || 400, h = host.clientHeight || 220;
  host.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
  host.appendChild(c);
  const ctx = c.getContext('2d'); ctx.scale(2, 2);
  const padL = 30, padR = 8, padT = 8, padB = 22;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const cols = rows[0]?.values?.length || 0;
  if (!cols) return c;
  const cellW = innerW / cols, cellH = innerH / rows.length;
  rows.forEach((r, ri) => {
    r.values.forEach((v, ci) => {
      const x = padL + ci * cellW, y = padT + ri * cellH;
      const t = Math.max(-1, Math.min(1, v));
      const col = t >= 0
        ? `rgba(22,163,74,${0.15 + 0.55 * t})`
        : `rgba(220,38,38,${0.15 + 0.55 * (-t)})`;
      ctx.fillStyle = col; ctx.fillRect(x+0.5, y+0.5, cellW-1, cellH-1);
    });
    ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.font = '9px Inter';
    ctx.fillText(r.label, 4, padT + ri * cellH + cellH/2 + 3);
  });
  // x labels
  ctx.fillStyle = 'rgba(148,163,184,0.7)'; ctx.font = '9px JetBrains Mono';
  if (opts.xLabels) {
    const step = Math.ceil(cols / 12);
    for (let i = 0; i < cols; i += step) {
      const x = padL + i * cellW + cellW/2;
      ctx.fillText(opts.xLabels[i] || '', x - 8, h - 6);
    }
  }
  return c;
}

/* Donut on canvas (more flexible, multi-series) */
export function canvasDonut(host, data, opts = {}) {
  host = ensureChartHost(host);
  data = Array.isArray(data) ? data : [];
  const size = opts.size || Math.min(host.clientWidth || 200, host.clientHeight || 200);
  host.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = size * 2; c.height = size * 2; c.style.width = size + 'px'; c.style.height = size + 'px';
  host.appendChild(c);
  const ctx = c.getContext('2d'); ctx.scale(2,2);
  const cx = size/2, cy = size/2;
  const r = size/2 - 8;
  const thick = opts.thickness || 22;
  const total = data.reduce((s,d) => s + d.value, 0) || 1;
  let a0 = -Math.PI/2;
  data.forEach(d => {
    const a1 = a0 + (d.value/total) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1, false);
    ctx.lineWidth = thick;
    ctx.strokeStyle = d.color;
    ctx.stroke();
    a0 = a1;
  });
  if (opts.centerValue) {
    ctx.fillStyle = '#e6edf6'; ctx.font = '700 18px Inter'; ctx.textAlign = 'center';
    ctx.fillText(String(opts.centerValue), cx, cy + 4);
  }
  if (opts.centerTitle) {
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 10px Inter'; ctx.textAlign = 'center';
    ctx.fillText(opts.centerTitle, cx, cy + 22);
  }
  return c;
}

/* simple line/area canvas */
export function canvasLineChart(host, series, opts = {}) {
  const originalHost = host;
  host = ensureChartHost(host);
  series = normalizeSeriesInput(series || (Array.isArray(originalHost) ? originalHost : []));
  const w = host.clientWidth || 400, h = host.clientHeight || 200;
  host.innerHTML = '';
  const c = document.createElement('canvas');
  c.width = w * 2; c.height = h * 2; c.style.width = w + 'px'; c.style.height = h + 'px';
  host.appendChild(c);
  const ctx = c.getContext('2d'); ctx.scale(2, 2);
  const padL = 36, padR = 8, padT = 8, padB = 22;
  const allValues = series.flatMap(s => s.values);
  const max = Math.max(...allValues), min = Math.min(...allValues);
  const rng = (max - min) || 1;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  // grid
  ctx.strokeStyle = 'rgba(148,163,184,0.08)'; ctx.lineWidth = 0.5;
  for (let g = 0; g < 5; g++) {
    const y = padT + (g/4) * innerH;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + innerW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.6)'; ctx.font = '9px JetBrains Mono';
    ctx.fillText(((max - rng*g/4)).toFixed(rng < 5 ? 2 : 0), 4, y+3);
  }
  series.forEach(s => {
    ctx.beginPath();
    s.values.forEach((v, i) => {
      const x = padL + (i / (s.values.length-1)) * innerW;
      const y = padT + ((max - v) / rng) * innerH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.5;
    ctx.stroke();
    if (s.fill) {
      ctx.lineTo(padL + innerW, padT + innerH); ctx.lineTo(padL, padT + innerH); ctx.closePath();
      const grad = ctx.createLinearGradient(0,padT,0,padT+innerH);
      grad.addColorStop(0, s.color + '40');
      grad.addColorStop(1, s.color + '00');
      ctx.fillStyle = grad; ctx.fill();
    }
  });
  return c;
}

/* matrix (correlation) — render colored cells */
export function correlMatrix(host, headers, matrix) {
  host.innerHTML = '';
  const tbl = document.createElement('table');
  tbl.className = 'tbl matrix';
  tbl.style.width = '100%';
  const trh = document.createElement('tr');
  trh.appendChild(document.createElement('th'));
  headers.forEach(h => {
    const t = document.createElement('th'); t.textContent = h; trh.appendChild(t);
  });
  tbl.appendChild(trh);
  matrix.forEach((row, ri) => {
    const tr = document.createElement('tr');
    const th = document.createElement('th'); th.textContent = headers[ri]; tr.appendChild(th);
    row.forEach(v => {
      const td = document.createElement('td');
      td.textContent = v.toFixed(2);
      const a = Math.abs(v);
      if (v >= 0) td.style.background = `rgba(16,185,129,${0.15 + 0.4 * a})`;
      else td.style.background = `rgba(239,68,68,${0.15 + 0.4 * a})`;
      td.style.color = a > 0.5 ? '#fff' : '#cbd5e1';
      tr.appendChild(td);
    });
    tbl.appendChild(tr);
  });
  host.appendChild(tbl);
}
