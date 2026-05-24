/* RUx — Setup Performans Matrisi Engine
   Setup + rejim bazında backtest/forward edge ayrıştırması. Otomatik emir üretmez. */
import { clamp, round, summarizeBacktestRows } from './rux_core.js?v=0.75.14-heatmap-micro-polish-20260524';
import { loadSignalJournal, parseJournalR } from './rux_journal.js?v=0.75.14-heatmap-micro-polish-20260524';

const MIN_SAMPLE = 12;
const STRONG_SAMPLE = 30;

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanLabel(value, fallback = 'Belirsiz') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function canonicalRegime(value = '') {
  const raw = String(value || '').trim();
  const up = raw.toUpperCase();
  if (up.includes('BOĞA') || up.includes('BULL')) return 'Bull Trend';
  if (up.includes('AYI') || up.includes('BEAR')) return 'Bear Trend';
  if (up.includes('RANGE') || up.includes('YATAY')) return 'Range';
  if (up.includes('SQUEEZE') || up.includes('SIKIŞ')) return 'Squeeze';
  if (up.includes('RISK')) return 'Risk-Off';
  if (up.includes('WATCH') || up.includes('İZLE')) return 'Watch / Neutral';
  if (up.includes('NÖTR') || up.includes('NEUTRAL')) return 'Neutral';
  return raw || 'Neutral';
}

function calcMaxDrawdown(values = []) {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  const curve = [0];
  values.forEach(v => {
    equity = round(equity + asNumber(v), 4);
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity - peak);
    curve.push(equity);
  });
  return { maxDrawdownR: round(maxDD, 3), equityCurve: curve };
}

function calcStats(rows = []) {
  const list = rows.slice().sort((a, b) => asNumber(a.timeMs) - asNumber(b.timeMs));
  const rValues = list.map(r => asNumber(r.netR));
  const wins = rValues.filter(v => v > 0);
  const losses = rValues.filter(v => v < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const count = rValues.length;
  const winRate = count ? wins.length / count * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const lossRate = 100 - winRate;
  const expectancy = count ? ((winRate / 100) * avgWin - (lossRate / 100) * avgLoss) : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const netR = rValues.reduce((a, b) => a + b, 0);
  const mfeAvg = list.length ? list.reduce((s, r) => s + asNumber(r.mfeR), 0) / list.length : 0;
  const maeAvg = list.length ? list.reduce((s, r) => s + Math.abs(asNumber(r.maeR)), 0) / list.length : 0;
  const dd = calcMaxDrawdown(rValues);
  return {
    count,
    wins: wins.length,
    losses: losses.length,
    winRate: round(winRate, 1),
    avgWin: round(avgWin, 2),
    avgLoss: round(avgLoss, 2),
    expectancy: round(expectancy, 3),
    profitFactor: round(profitFactor, 2),
    netR: round(netR, 2),
    maxDrawdownR: dd.maxDrawdownR,
    mfeAvg: round(mfeAvg, 2),
    maeAvg: round(maeAvg, 2),
    equityCurve: dd.equityCurve
  };
}

export function setupMatrixEdgeScore(stats = {}) {
  const sampleScore = clamp((asNumber(stats.count) / STRONG_SAMPLE) * 100);
  const wrScore = clamp((asNumber(stats.winRate) - 35) / 35 * 100);
  const pfRaw = asNumber(stats.profitFactor);
  const pfScore = pfRaw >= 99 ? 100 : clamp((pfRaw - 0.80) / 1.20 * 100);
  const expScore = clamp((asNumber(stats.expectancy) + 0.10) / 0.55 * 100);
  const ddPenalty = clamp(Math.abs(asNumber(stats.maxDrawdownR)) / 8 * 100);
  const lowSamplePenalty = asNumber(stats.count) < MIN_SAMPLE ? (MIN_SAMPLE - asNumber(stats.count)) * 4.5 : 0;
  const score = clamp(
    wrScore * 0.20 +
    pfScore * 0.24 +
    expScore * 0.30 +
    sampleScore * 0.18 -
    ddPenalty * 0.10 -
    lowSamplePenalty
  );
  return round(score, 0);
}

export function setupMatrixVerdict(row = {}) {
  const score = asNumber(row.edgeScore);
  const count = asNumber(row.count);
  const exp = asNumber(row.expectancy);
  const pf = asNumber(row.profitFactor);
  if (count < 5) return { label: 'Örneklem yetersiz', tone: 'gray', action: 'Karar motoruna bağlama' };
  if (count < MIN_SAMPLE) return { label: 'Unstable', tone: 'yellow', action: 'Sadece izle' };
  if (score >= 78 && exp >= 0.20 && pf >= 1.45) return { label: 'Strong Edge', tone: 'green', action: 'Kural setine aday' };
  if (score >= 62 && exp > 0 && pf >= 1.15) return { label: 'Promising', tone: 'cyan', action: 'Shadow testte izle' };
  if (exp < 0 || pf < 1.0 || score < 38) return { label: 'Avoid', tone: 'red', action: 'Filtrele / pasife al' };
  return { label: 'Weak', tone: 'yellow', action: 'Ek filtre gerekir' };
}

function normalizeBacktestRow(row = {}) {
  if (!row?.filled) return null;
  const outcome = row.outcome || {};
  return {
    id: row.id,
    source: 'backtest',
    asset: cleanLabel(row.asset, 'BTCUSDT'),
    tf: cleanLabel(row.tf, '4h'),
    direction: cleanLabel(row.direction, 'WATCH'),
    setup: cleanLabel(row.setup, 'RUx Setup'),
    regime: canonicalRegime(row.regime),
    score: asNumber(row.score),
    netR: asNumber(row.netR),
    grossR: asNumber(row.grossR),
    mfeR: asNumber(outcome.mfeR ?? row.mfeR),
    maeR: asNumber(outcome.maeR ?? row.maeR),
    status: cleanLabel(outcome.status || row.status, 'FILLED'),
    timeMs: asNumber(row.time) > 1e12 ? asNumber(row.time) : asNumber(row.time) * 1000
  };
}

function isRealizedJournalRow(row = {}) {
  if (row.netR !== null && row.netR !== undefined && row.netR !== '') return Number.isFinite(Number(row.netR));
  return /^[-+]?\d/.test(String(row.finalR || '').replace('R','').trim());
}

function normalizeForwardRow(row = {}) {
  if (!isRealizedJournalRow(row)) return null;
  const ts = row.createdAt || row.time || Date.now();
  const timeMs = Number.isFinite(Number(ts)) ? Number(ts) : new Date(ts).getTime();
  return {
    id: row.id,
    source: 'forward',
    asset: cleanLabel(row.asset || row.symbol, 'BTCUSDT'),
    tf: cleanLabel(row.tf, '4h'),
    direction: cleanLabel(row.direction, 'WATCH'),
    setup: cleanLabel(row.setup, 'RUx Setup'),
    regime: canonicalRegime(row.regime),
    score: asNumber(row.finalScore),
    netR: parseJournalR(row),
    grossR: parseJournalR(row),
    mfeR: asNumber(row.mfeR),
    maeR: asNumber(row.maeR),
    status: cleanLabel(row.stateLabel || row.state, 'REALIZED'),
    timeMs: Number.isFinite(timeMs) ? timeMs : Date.now()
  };
}

function buildMatrixRows(normalized = [], sourceLabel = 'combined') {
  const matrixMap = new Map();
  const setupMap = new Map();
  const regimeMap = new Map();
  const push = (map, key, row) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  };
  normalized.forEach(row => {
    push(matrixMap, `${row.setup}|||${row.regime}`, row);
    push(setupMap, row.setup, row);
    push(regimeMap, row.regime, row);
  });
  const matrix = [...matrixMap.entries()].map(([key, rows]) => {
    const [setup, regime] = key.split('|||');
    const stats = calcStats(rows);
    const edgeScore = setupMatrixEdgeScore(stats);
    const verdict = setupMatrixVerdict({ ...stats, edgeScore });
    return { setup, regime, source: sourceLabel, ...stats, edgeScore, verdict, rows };
  }).sort((a, b) => b.edgeScore - a.edgeScore || b.netR - a.netR);
  const setupSummary = [...setupMap.entries()].map(([setup, rows]) => {
    const stats = calcStats(rows);
    const edgeScore = setupMatrixEdgeScore(stats);
    return { setup, ...stats, edgeScore, verdict: setupMatrixVerdict({ ...stats, edgeScore }) };
  }).sort((a, b) => b.edgeScore - a.edgeScore || b.netR - a.netR);
  const regimeSummary = [...regimeMap.entries()].map(([regime, rows]) => {
    const stats = calcStats(rows);
    const edgeScore = setupMatrixEdgeScore(stats);
    return { regime, ...stats, edgeScore, verdict: setupMatrixVerdict({ ...stats, edgeScore }) };
  }).sort((a, b) => b.edgeScore - a.edgeScore || b.netR - a.netR);
  return { matrix, setupSummary, regimeSummary };
}

export function buildSetupPerformanceMatrixReport({ backtestRows = [], forwardRows = null, mode = 'combined' } = {}) {
  const backtest = (backtestRows || []).map(normalizeBacktestRow).filter(Boolean);
  const forward = (forwardRows ?? loadSignalJournal()).map(normalizeForwardRow).filter(Boolean);
  const normalized = mode === 'backtest' ? backtest : mode === 'forward' ? forward : [...backtest, ...forward];
  const summary = calcStats(normalized);
  const rows = buildMatrixRows(normalized, mode);
  const best = rows.matrix.filter(r => r.count >= MIN_SAMPLE && r.expectancy > 0).slice(0, 5);
  const worst = rows.matrix.slice().sort((a, b) => a.edgeScore - b.edgeScore || a.netR - b.netR).slice(0, 5);
  const sampleWarnings = rows.matrix.filter(r => r.count < MIN_SAMPLE).length;
  const sourceStats = {
    backtestTrades: backtest.length,
    forwardTrades: forward.length,
    combinedTrades: backtest.length + forward.length,
    activeMode: mode
  };
  return {
    version: '0.49.3-live-card-hydration',
    mode,
    normalized,
    summary,
    sourceStats,
    sampleWarnings,
    best,
    worst,
    matrix: rows.matrix,
    setupSummary: rows.setupSummary,
    regimeSummary: rows.regimeSummary,
    minSample: MIN_SAMPLE,
    strongSample: STRONG_SAMPLE,
    generatedAt: new Date().toISOString(),
    note: 'Setup Performans Matrisi setup + rejim kombinasyonlarını Net-R, expectancy, PF, drawdown ve örneklem gücüyle ölçer; otomatik emir açmaz.'
  };
}

export function compareSetupMatrixMode(report = {}) {
  const m = report.matrix || [];
  const strong = m.filter(r => r.verdict?.label === 'Strong Edge').length;
  const avoid = m.filter(r => r.verdict?.label === 'Avoid').length;
  const unstable = m.filter(r => r.count < MIN_SAMPLE).length;
  let label = 'Veri bekliyor';
  let tone = 'gray';
  if (report.summary?.count >= MIN_SAMPLE && strong > 0) { label = 'Edge haritası oluştu'; tone = 'green'; }
  else if (report.summary?.count >= 5) { label = 'Shadow izleme'; tone = 'yellow'; }
  if (avoid > strong && report.summary?.count >= MIN_SAMPLE) { label = 'Filtre sıkılaştır'; tone = 'red'; }
  return { label, tone, strong, avoid, unstable };
}

if (typeof window !== 'undefined') {
  window.RUX_SETUP_MATRIX = { buildSetupPerformanceMatrixReport, setupMatrixEdgeScore, setupMatrixVerdict, compareSetupMatrixMode };
}
