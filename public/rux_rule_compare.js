/* RUx — Rule Comparison & Optimization Engine
   Aynı sinyal seti üzerinde trade-management, TP dağılımı, time-stop,
   no-trade sertliği, confirmation ağırlığı ve risk modu varyantlarını karşılaştırır. */
import { clamp, round } from './rux_core.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function finiteR(v) { return Number.isFinite(Number(v)); }
function tradeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(r => r?.filled && finiteR(r.netR));
}
function allRows(rows = []) {
  return Array.isArray(rows) ? rows : [];
}
function maxDrawdown(values = []) {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  const curve = [0];
  for (const v of values) {
    equity = round(equity + num(v), 4);
    peak = Math.max(peak, equity);
    maxDD = Math.min(maxDD, equity - peak);
    curve.push(equity);
  }
  return { maxDD: round(maxDD, 3), curve };
}
function summarizeRValues(values = [], sourceRows = []) {
  const vals = (values || []).map(v => num(v)).filter(Number.isFinite);
  const wins = vals.filter(v => v > 0);
  const losses = vals.filter(v => v < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const winRate = vals.length ? wins.length / vals.length * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const lossRate = 100 - winRate;
  const expectancy = vals.length ? (winRate / 100 * avgWin) - (lossRate / 100 * avgLoss) : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const dd = maxDrawdown(vals);
  const mfeAvg = sourceRows.length ? sourceRows.reduce((s, r) => s + num(r.outcome?.mfeR ?? r.mfeR), 0) / sourceRows.length : 0;
  const maeAvg = sourceRows.length ? sourceRows.reduce((s, r) => s + num(r.outcome?.maeR ?? r.maeR), 0) / sourceRows.length : 0;
  return {
    count: vals.length,
    wins: wins.length,
    losses: losses.length,
    winRate: round(winRate, 1),
    avgWin: round(avgWin, 3),
    avgLoss: round(avgLoss, 3),
    expectancy: round(expectancy, 4),
    profitFactor: round(profitFactor, 2),
    netR: round(vals.reduce((a, b) => a + b, 0), 3),
    maxDrawdownR: dd.maxDD,
    equityCurve: dd.curve,
    mfeAvg: round(mfeAvg, 2),
    maeAvg: round(maeAvg, 2)
  };
}
function baseCost(row = {}) {
  return Math.min(0.45, Math.max(0.04, num(row.totalCostR ?? row.outcome?.totalCostR, 0.14)));
}
function safeMfe(row = {}) { return Math.max(0, num(row.outcome?.mfeR ?? row.mfeR, Math.max(0, num(row.netR)))); }
function safeMae(row = {}) { return Math.max(0, num(row.outcome?.maeR ?? row.maeR, Math.max(0, -num(row.netR)))); }
function baseR(row = {}) { return num(row.netR, 0); }
function clampTradeR(v) { return round(clamp(num(v), -1.5, 4.5), 3); }

function modelBreakEven(row = {}, mode = 'base') {
  const r = baseR(row);
  const mfe = safeMfe(row);
  const mae = safeMae(row);
  const cost = baseCost(row);
  if (mode === 'base') return r;
  if (mode === 'be1') {
    if (mfe >= 1 && r < 0) return clampTradeR(-cost * 0.35);
    return r;
  }
  if (mode === 'tp1-tech') {
    if (mfe >= 2 && r < 1) return clampTradeR(0.75 - cost);
    if (mfe >= 1 && r < 0.45) return clampTradeR(0.25 - cost);
    return r;
  }
  if (mode === 'structure') {
    if (mfe >= 3) return clampTradeR(Math.max(r, Math.min(3.4, mfe * 0.72) - cost));
    if (mfe >= 1.8 && mae < 0.9) return clampTradeR(Math.max(r, 1.15 - cost));
    return clampTradeR(r - (mae > 1.15 ? 0.08 : 0));
  }
  return r;
}

function modelTimeStop(row = {}, mode = 'base') {
  const r = baseR(row);
  const bars = num(row.outcome?.barsHeld ?? row.barsHeld, 0);
  const mfe = safeMfe(row);
  const cost = baseCost(row);
  if (mode === 'base') return r;
  if (mode === 'soft-24') {
    if (bars >= 6 && mfe < 0.5) return clampTradeR(Math.min(r, -0.18 - cost * 0.5));
    return r;
  }
  if (mode === 'strict-bars') {
    if (bars >= 10 && mfe < 0.8) return clampTradeR(Math.min(r, -0.32 - cost * 0.5));
    if (bars >= 14 && r < 0.25) return clampTradeR(Math.min(r, -0.12 - cost * 0.3));
    return r;
  }
  if (mode === 'none') {
    if (mfe >= 2.2 && r < 1.2) return clampTradeR(r + 0.18);
    if (mfe < 0.4 && r < 0) return clampTradeR(r - 0.08);
    return r;
  }
  return r;
}

function tpPoint(mfe, target, fallback) {
  return mfe >= target ? target : fallback;
}
function modelTpDistribution(row = {}, mode = 'balanced') {
  const r = baseR(row);
  const mfe = safeMfe(row);
  const cost = baseCost(row);
  if (r <= -0.95 && mfe < 1) return r;
  const live = clamp(num(r), -0.5, Math.min(4.2, Math.max(mfe, r)));
  const runner = clamp(Math.max(live, Math.min(4.2, mfe * 0.82)), -0.5, 4.2);
  const p1 = tpPoint(mfe, 1, live);
  const p2 = tpPoint(mfe, 2, live);
  const p3 = tpPoint(mfe, 3, live);
  let gross = r;
  if (mode === 'defensive') gross = p1 * 0.40 + p2 * 0.30 + p3 * 0.20 + runner * 0.10;
  else if (mode === 'balanced') gross = p1 * 0.25 + p2 * 0.25 + p3 * 0.25 + runner * 0.25;
  else if (mode === 'trend') gross = p1 * 0.20 + p2 * 0.20 + p3 * 0.20 + runner * 0.40;
  else if (mode === 'single-tp1') gross = mfe >= 1 ? 1 : r;
  return clampTradeR(gross - cost * 0.35);
}

function rowPassesFilter(row = {}, mode = 'medium') {
  const s = row.snapshot || {};
  const score = num(row.score ?? s.final?.score, 0);
  const data = num(row.dataConfidence ?? s.data?.score, 0);
  const noTrade = num(row.noTradeScore ?? s.noTrade?.score, 0);
  const manipulation = num(row.manipulationRisk ?? s.manipulationRisk, 0);
  const rr = parseFloat(String(s.manualPlan?.rrExpected || '0').replace('R','').replace(',','.')) || 0;
  if (!row.filled || !finiteR(row.netR)) return false;
  if (mode === 'strict') return score >= 76 && data >= 72 && noTrade <= 44 && manipulation <= 58 && rr >= 1.7;
  if (mode === 'medium') return score >= 70 && data >= 62 && noTrade <= 58 && manipulation <= 68 && rr >= 1.45;
  if (mode === 'flexible') return score >= 64 && data >= 52 && noTrade <= 72 && manipulation <= 78 && rr >= 1.2;
  return true;
}

function weightedScore(row = {}, preset = 'base') {
  const s = row.snapshot?.scores || {};
  const setup = num(s.setup ?? row.score, 55);
  const regime = num(s.regime, 60);
  const confirmation = num(s.confirmation, 58);
  const execution = num(s.execution, 58);
  const rr = num(s.rr, 55);
  const sets = {
    base: { setup: 0.30, regime: 0.20, confirmation: 0.25, execution: 0.15, rr: 0.10 },
    trend: { setup: 0.34, regime: 0.24, confirmation: 0.18, execution: 0.14, rr: 0.10 },
    range: { setup: 0.26, regime: 0.18, confirmation: 0.32, execution: 0.14, rr: 0.10 },
    execution: { setup: 0.24, regime: 0.16, confirmation: 0.22, execution: 0.28, rr: 0.10 }
  };
  const w = sets[preset] || sets.base;
  const raw = setup*w.setup + regime*w.regime + confirmation*w.confirmation + execution*w.execution + rr*w.rr;
  const noTradePenalty = Math.max(0, num(row.noTradeScore, 0) - 55) * 0.22;
  return round(clamp(raw - noTradePenalty), 1);
}
function rowsByWeight(rows = [], preset = 'base') {
  return tradeRows(rows).filter(r => weightedScore(r, preset) >= 70);
}

function modelRiskMode(rows = [], mode = 'fixed') {
  const out = [];
  let equity = 0;
  let peak = 0;
  for (const row of tradeRows(rows)) {
    const r = baseR(row);
    peak = Math.max(peak, equity);
    const dd = equity - peak;
    let mult = 1;
    if (mode === 'dd-adjusted') {
      if (dd <= -6) mult = 0.55;
      else if (dd <= -3) mult = 0.72;
      else if (dd <= -1.5) mult = 0.86;
    } else if (mode === 'score-scaled') {
      mult = clamp(num(row.score, 70) / 85, 0.55, 1.15);
    } else if (mode === 'vol-adjusted') {
      const mae = safeMae(row);
      mult = mae > 1.15 ? 0.72 : mae < 0.45 ? 1.08 : 0.94;
    }
    const v = round(r * mult, 3);
    out.push(v);
    equity = round(equity + v, 4);
  }
  return out;
}

function verdictFor(summary = {}, score = 0, minSample = 12) {
  if (!summary.count) return { label: 'VERİ YOK', tone: 'gray', action: 'Kayıt beklenir.' };
  if (summary.count < minSample) return { label: 'ÖRNEKLEM AZ', tone: 'yellow', action: 'Shadow izleme; karar motoruna bağlama.' };
  if (summary.expectancy > 0.22 && summary.profitFactor >= 1.45 && score >= 72) return { label: 'GÜÇLÜ KURAL', tone: 'green', action: 'Shadow challenger adayı.' };
  if (summary.expectancy > 0.08 && summary.profitFactor >= 1.15) return { label: 'İZLEMEDE', tone: 'cyan', action: 'Monte Carlo/Ruin ile doğrula.' };
  if (summary.expectancy >= 0 && summary.profitFactor >= 1.0) return { label: 'NÖTR', tone: 'yellow', action: 'Tek başına yeterli değil.' };
  return { label: 'RED / ZAYIF', tone: 'red', action: 'Aktif kurala alma.' };
}
function scoreSummary(summary = {}, baseline = {}, complexityPenalty = 0, minSample = 12) {
  const sampleScore = clamp((summary.count / Math.max(minSample, 1)) * 18, 0, 18);
  const pfScore = clamp((num(summary.profitFactor) - 1) * 22, -18, 30);
  const expScore = clamp(num(summary.expectancy) * 80, -30, 34);
  const ddPenalty = clamp(Math.abs(num(summary.maxDrawdownR)) * 1.4, 0, 18);
  const delta = num(summary.expectancy) - num(baseline.expectancy);
  const deltaScore = clamp(delta * 55, -18, 18);
  return round(clamp(50 + sampleScore + pfScore + expScore + deltaScore - ddPenalty - complexityPenalty), 1);
}
function makeCandidate({ id, category, model, description, values, rows, baseline, complexity = 0, minSample = 12 }) {
  const summary = summarizeRValues(values, rows);
  const score = scoreSummary(summary, baseline, complexity, minSample);
  const verdict = verdictFor(summary, score, minSample);
  return {
    id,
    category,
    model,
    description,
    summary,
    score,
    verdict,
    deltaExpectancy: round(num(summary.expectancy) - num(baseline.expectancy), 4),
    deltaNetR: round(num(summary.netR) - num(baseline.netR), 3),
    samplePenalty: summary.count < minSample,
    complexity
  };
}

export const RULE_COMPARISON_CATEGORIES = [
  { id: 'all', label: 'Tümü' },
  { id: 'break-even', label: 'Break-even' },
  { id: 'time-stop', label: 'Time Stop' },
  { id: 'tp-distribution', label: 'TP Dağılımı' },
  { id: 'no-trade', label: 'No-Trade' },
  { id: 'confirmation', label: 'Confirmation' },
  { id: 'risk-mode', label: 'Risk Modu' }
];

export function buildRuleComparisonReport({ rows = [], category = 'all', minSample = 12 } = {}) {
  const trades = tradeRows(rows);
  const baseline = summarizeRValues(trades.map(baseR), trades);
  const all = allRows(rows);
  const candidates = [];

  const add = (cfg) => candidates.push(makeCandidate({ baseline, minSample, ...cfg }));

  add({ id: 'be-base', category: 'break-even', model: 'Mevcut / BE yok', description: 'Mevcut sonuçları referans kabul eder.', rows: trades, values: trades.map(r => modelBreakEven(r, 'base')), complexity: 0 });
  add({ id: 'be-1r', category: 'break-even', model: '1R sonrası BE', description: '+1R MFE görüldükten sonra zarar eden işlemi break-even civarına taşır.', rows: trades, values: trades.map(r => modelBreakEven(r, 'be1')), complexity: 3 });
  add({ id: 'be-tp1-tech', category: 'break-even', model: 'TP1 sonrası teknik stop', description: 'TP1/TP2 sonrası stopu yapı arkasına taşır; kârı tamamen geri vermeyi azaltır.', rows: trades, values: trades.map(r => modelBreakEven(r, 'tp1-tech')), complexity: 6 });
  add({ id: 'be-structure', category: 'break-even', model: 'Structure trailing', description: 'MFE büyüdükçe yapısal takip stopu varsayar; trend runner koruması sağlar.', rows: trades, values: trades.map(r => modelBreakEven(r, 'structure')), complexity: 8 });

  add({ id: 'ts-base', category: 'time-stop', model: 'Mevcut time-stop', description: 'Mevcut backtest çıkış mantığı.', rows: trades, values: trades.map(r => modelTimeStop(r, 'base')), complexity: 0 });
  add({ id: 'ts-soft', category: 'time-stop', model: '24h +0.5R yoksa çık', description: 'Yeterli süre geçtiği halde +0.5R MFE üretmeyen işlemi erken kapatır.', rows: trades, values: trades.map(r => modelTimeStop(r, 'soft-24')), complexity: 4 });
  add({ id: 'ts-strict', category: 'time-stop', model: 'Katı mum sayısı stopu', description: 'Belirli mum sayısından sonra momentum üretmeyen işlemi daha sert keser.', rows: trades, values: trades.map(r => modelTimeStop(r, 'strict-bars')), complexity: 6 });
  add({ id: 'ts-none', category: 'time-stop', model: 'Time-stop yok', description: 'Trend devamına daha fazla alan verir; zayıf işlemlerde bekleme maliyeti artabilir.', rows: trades, values: trades.map(r => modelTimeStop(r, 'none')), complexity: 5 });

  add({ id: 'tp-defensive', category: 'tp-distribution', model: 'Defensive 40-30-20-10', description: 'TP1 ağırlığı yüksek; yatay/range piyasasında kârı erken kilitler.', rows: trades, values: trades.map(r => modelTpDistribution(r, 'defensive')), complexity: 5 });
  add({ id: 'tp-balanced', category: 'tp-distribution', model: 'Balanced 25-25-25-runner', description: 'Kâr realizasyonu ve runner arasında dengeli dağılım.', rows: trades, values: trades.map(r => modelTpDistribution(r, 'balanced')), complexity: 5 });
  add({ id: 'tp-trend', category: 'tp-distribution', model: 'Trend 20-20-20-40', description: 'Runner payı yüksek; trend rejiminde büyük hareket yakalamaya çalışır.', rows: trades, values: trades.map(r => modelTpDistribution(r, 'trend')), complexity: 7 });
  add({ id: 'tp-single', category: 'tp-distribution', model: 'Tek TP1 çıkışı', description: 'En savunmacı model; yüksek WR verebilir ama sağ kuyruk getiriyi budar.', rows: trades, values: trades.map(r => modelTpDistribution(r, 'single-tp1')), complexity: 3 });

  ['strict', 'medium', 'flexible'].forEach((m, ix) => {
    const filtered = all.filter(r => rowPassesFilter(r, m));
    const labels = { strict: 'Katı No-Trade', medium: 'Orta No-Trade', flexible: 'Esnek No-Trade' };
    const descriptions = {
      strict: 'Skor, veri güveni, no-trade ve manipulation eşiklerini sıkılaştırır; işlem sayısı azalır.',
      medium: 'Dengeli filtre seti; varsayılan RUx davranışına yakın durur.',
      flexible: 'Daha çok sinyale izin verir; edge ve drawdown birlikte kontrol edilmelidir.'
    };
    add({ id: 'nt-' + m, category: 'no-trade', model: labels[m], description: descriptions[m], rows: filtered, values: filtered.map(baseR), complexity: 4 + ix });
  });

  ['base', 'trend', 'range', 'execution'].forEach((m, ix) => {
    const filtered = rowsByWeight(all, m);
    const labels = { base: 'Mevcut ağırlık', trend: 'Trend ağırlıklı', range: 'Range/Squeeze teyit ağırlıklı', execution: 'Execution ağırlıklı' };
    const descriptions = {
      base: 'Setup 30 / Rejim 20 / Confirmation 25 / Execution 15 / RR 10 referans ağırlık seti.',
      trend: 'Trend rejimlerinde setup + rejim uyumunu daha fazla ödüllendirir.',
      range: 'Range/Squeeze koşullarında confirmation ve orderflow teyidine daha yüksek ağırlık verir.',
      execution: 'Entry kalitesi, geç kalmama ve execution skorunu öne çıkarır.'
    };
    add({ id: 'cw-' + m, category: 'confirmation', model: labels[m], description: descriptions[m], rows: filtered, values: filtered.map(baseR), complexity: ix === 0 ? 0 : 7 });
  });

  add({ id: 'risk-fixed', category: 'risk-mode', model: 'Fixed fractional risk', description: 'Her işlem eşit R ağırlığıyla ölçülür.', rows: trades, values: modelRiskMode(trades, 'fixed'), complexity: 0 });
  add({ id: 'risk-dd', category: 'risk-mode', model: 'Drawdown adjusted risk', description: 'Equity drawdown derinleştikçe işlem riskini azaltır.', rows: trades, values: modelRiskMode(trades, 'dd-adjusted'), complexity: 6 });
  add({ id: 'risk-score', category: 'risk-mode', model: 'Score scaled risk', description: 'Final skoru yüksek sinyale daha fazla, düşük sinyale daha az R ağırlığı verir.', rows: trades, values: modelRiskMode(trades, 'score-scaled'), complexity: 5 });
  add({ id: 'risk-vol', category: 'risk-mode', model: 'Volatility/MAE adjusted risk', description: 'MAE karakterine göre pozisyon riskini ayarlar.', rows: trades, values: modelRiskMode(trades, 'vol-adjusted'), complexity: 7 });

  const filtered = category && category !== 'all' ? candidates.filter(c => c.category === category) : candidates;
  const ranked = [...filtered].sort((a, b) => b.score - a.score || b.summary.expectancy - a.summary.expectancy);
  const best = ranked[0] || null;
  const worst = [...filtered].sort((a, b) => a.score - b.score || a.summary.expectancy - b.summary.expectancy)[0] || null;
  const categorySummary = RULE_COMPARISON_CATEGORIES.filter(c => c.id !== 'all').map(cat => {
    const list = candidates.filter(x => x.category === cat.id).sort((a, b) => b.score - a.score);
    return { ...cat, count: list.length, best: list[0] || null, avgScore: round(list.reduce((s, x) => s + x.score, 0) / (list.length || 1), 1) };
  });
  const activation = best && best.summary.count >= minSample && best.summary.expectancy > baseline.expectancy + 0.035 && best.summary.profitFactor >= 1.15 && best.score >= 64
    ? { label: 'SHADOW CHALLENGER ADAYI', tone: 'green', action: 'Aktife alma; önce OOS / walk-forward ile doğrula.' }
    : best && best.summary.count >= minSample
      ? { label: 'İZLEME / OOS GEREKİR', tone: 'yellow', action: 'Tek başına aktif kurala dönüşmesin.' }
      : { label: 'ÖRNEKLEM BEKLENİR', tone: 'gray', action: 'Daha fazla backtest/forward sonucu gerekir.' };

  return {
    category,
    minSample,
    sourceRows: all.length,
    tradeCount: trades.length,
    baseline,
    candidates: filtered,
    ranked,
    best,
    worst,
    categorySummary,
    activation,
    generatedAt: Date.now(),
    note: 'Rule Comparison aynı sinyal seti üzerinde kural varyantlarını karşılaştırır; otomatik emir veya otomatik aktivasyon yapmaz.'
  };
}

export function ruleComparisonCategoryLabel(id = 'all') {
  return RULE_COMPARISON_CATEGORIES.find(c => c.id === id)?.label || 'Tümü';
}

if (typeof window !== 'undefined') {
  window.RUX_RULE_COMPARE = { buildRuleComparisonReport, RULE_COMPARISON_CATEGORIES, ruleComparisonCategoryLabel };
}
