/* RUx — Portfolio Heat v2 Engine
   Beta-adjusted yön riski, korelasyon kümesi ve altcoin long risk kesintisi önerileri.
   Otomatik emir göndermez; manuel pozisyon/risk farkındalığı sağlar. */
import { calculatePortfolioHeat, makeOpenPositionsReport, round, clamp } from './rux_core.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';

const SCENARIOS = Object.freeze({
  base: {
    id: 'base',
    label: 'Normal Rejim',
    usdtDominance: 4.79,
    btcDominance: 53.4,
    riskOff: false,
    btcBear: false,
    altLongCut: 0,
    longLimit: 1.80,
    shortLimit: 1.60,
    totalLimit: 2.20,
    note: 'Standart portföy ısı limiti.'
  },
  usdt: {
    id: 'usdt',
    label: 'USDT.D Yükseliyor',
    usdtDominance: 5.45,
    btcDominance: 55.2,
    riskOff: true,
    btcBear: false,
    altLongCut: 50,
    longLimit: 1.30,
    shortLimit: 1.70,
    totalLimit: 1.85,
    note: 'Stablecoin dominance yükselirken altcoin long riski yarıya indirilir.'
  },
  riskoff: {
    id: 'riskoff',
    label: 'Makro Risk-Off',
    usdtDominance: 5.70,
    btcDominance: 56.1,
    riskOff: true,
    btcBear: false,
    altLongCut: 60,
    longLimit: 1.00,
    shortLimit: 1.90,
    totalLimit: 1.65,
    note: 'Makro risk-offta toplam long heat keskin biçimde sınırlanır.'
  },
  btcbear: {
    id: 'btcbear',
    label: 'BTC Bear Rejim',
    usdtDominance: 5.25,
    btcDominance: 57.4,
    riskOff: true,
    btcBear: true,
    altLongCut: 65,
    longLimit: 0.85,
    shortLimit: 2.00,
    totalLimit: 1.60,
    note: 'BTC bear rejimde altcoin long riskleri ana sistem tarafından cezalandırılır.'
  }
});

const FAMILY = Object.freeze({
  BTCUSDT: 'BTC Core',
  ETHUSDT: 'Large Cap',
  BNBUSDT: 'Large Cap',
  SOLUSDT: 'High Beta L1',
  AVAXUSDT: 'High Beta L1',
  LINKUSDT: 'Mid/Large Beta',
  OPUSDT: 'High Beta L2',
  ARBUSDT: 'High Beta L2'
});

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function upper(v = '') { return String(v || '').toUpperCase(); }
function isLong(p = {}) { return upper(p.direction).includes('LONG'); }
function isShort(p = {}) { return upper(p.direction).includes('SHORT'); }
function isBtc(p = {}) { return upper(p.asset || p.symbol).startsWith('BTC'); }
function isAltLong(p = {}) { return isLong(p) && !isBtc(p); }
function sym(p = {}) { return upper(p.asset || p.symbol || 'ASSET'); }

function scenarioById(id = 'base') { return SCENARIOS[id] || SCENARIOS.base; }

function statusForHeat(value, limit) {
  const v = n(value), l = Math.max(n(limit, 1), 0.01);
  if (v >= l * 1.15) return { label: 'BLOK', tone: 'red', action: 'Aynı yönde yeni risk açma.' };
  if (v >= l * 0.85) return { label: 'UYARI', tone: 'yellow', action: 'Yeni risk yalnızca A kalite sinyalde.' };
  return { label: 'NORMAL', tone: 'green', action: 'Limit içinde; yine de korelasyon izlenir.' };
}

function riskCutForPosition(p = {}, scenario = SCENARIOS.base, totalStatus = {}) {
  let cut = 0;
  let reason = 'Kesinti yok';
  if (isAltLong(p) && n(scenario.altLongCut) > 0) {
    cut = n(scenario.altLongCut);
    reason = scenario.btcBear ? 'BTC bear + altcoin long' : 'USDT.D/risk-off altcoin long';
  }
  if (isLong(p) && totalStatus.label === 'BLOK') {
    cut = Math.max(cut, isBtc(p) ? 25 : 60);
    reason = isBtc(p) ? 'Toplam heat blok seviyesi' : 'Toplam heat + korelasyon';
  } else if (isLong(p) && totalStatus.label === 'UYARI') {
    cut = Math.max(cut, isBtc(p) ? 10 : 35);
    reason = isBtc(p) ? 'Long heat sınıra yakın' : 'Altcoin heat sınıra yakın';
  }
  const riskPct = n(p.riskPct);
  const suggestedRiskPct = round(riskPct * (1 - cut / 100), 3);
  return { cutPct: round(cut, 0), suggestedRiskPct, reason };
}

function aggregate(rows = [], pred = () => true) {
  const list = rows.filter(pred);
  return {
    count: list.length,
    rawRisk: round(list.reduce((a, r) => a + n(r.riskPct), 0), 3),
    betaRisk: round(list.reduce((a, r) => a + n(r.adjustedHeat), 0), 3),
    notional: round(list.reduce((a, r) => a + n(r.notional), 0), 2),
    pnl: round(list.reduce((a, r) => a + n(r.pnl), 0), 2)
  };
}

function buildClusters(rows = [], scenario = SCENARIOS.base) {
  const long = aggregate(rows, isLong);
  const short = aggregate(rows, isShort);
  const altLong = aggregate(rows, isAltLong);
  const btcLong = aggregate(rows, (r) => isLong(r) && isBtc(r));
  const highBeta = aggregate(rows, (r) => n(r.beta) >= 1.2);
  const netDirectionalHeat = round(long.betaRisk - short.betaRisk, 3);
  return [
    { id: 'long', label: 'Crypto Long Heat', ...long, limit: scenario.longLimit, status: statusForHeat(long.betaRisk, scenario.longLimit), note: 'BTC/ETH/SOL/altcoin longlar tek yönlü risk kabul edilir.' },
    { id: 'short', label: 'Crypto Short Heat', ...short, limit: scenario.shortLimit, status: statusForHeat(short.betaRisk, scenario.shortLimit), note: 'Short taraf ayrı izlenir; long riskini otomatik hedge sayılmaz.' },
    { id: 'altLong', label: 'Altcoin Long Heat', ...altLong, limit: Math.min(0.95, scenario.longLimit * 0.62), status: statusForHeat(altLong.betaRisk, Math.min(0.95, scenario.longLimit * 0.62)), note: 'USDT.D yükselirken ilk kesilecek küme.' },
    { id: 'btcLong', label: 'BTC Core Long', ...btcLong, limit: Math.min(0.90, scenario.longLimit * 0.70), status: statusForHeat(btcLong.betaRisk, Math.min(0.90, scenario.longLimit * 0.70)), note: 'Ana yön riskini belirler.' },
    { id: 'highBeta', label: 'High Beta Kümesi', ...highBeta, limit: 0.85, status: statusForHeat(highBeta.betaRisk, 0.85), note: 'SOL/AVAX/OP/ARB gibi beta yüksek coinler.' },
    { id: 'net', label: 'Net Yön Heat', count: rows.length, rawRisk: round(long.rawRisk - short.rawRisk, 3), betaRisk: netDirectionalHeat, notional: round(long.notional - short.notional, 2), pnl: round(long.pnl + short.pnl, 2), limit: scenario.totalLimit, status: statusForHeat(Math.abs(netDirectionalHeat), scenario.totalLimit), note: 'Long heat - short heat farkı; hedge kalitesini yaklaşık gösterir.' }
  ];
}

function corrScore(a = {}, b = {}) {
  const sa = sym(a), sb = sym(b);
  if (sa === sb) return 1;
  const ba = n(a.beta, 1), bb = n(b.beta, 1);
  let base = 0.55 + Math.min(ba, bb) * 0.12;
  if (FAMILY[sa] === FAMILY[sb]) base += 0.14;
  if (isLong(a) !== isLong(b)) base *= -0.55;
  if (sa.startsWith('BTC') || sb.startsWith('BTC')) base += isLong(a) === isLong(b) ? 0.08 : -0.04;
  return round(clamp(base, -0.85, 0.98), 2);
}

function buildCorrelationMatrix(rows = []) {
  const selected = rows.slice(0, 8);
  return {
    labels: selected.map(r => sym(r).replace('USDT','')),
    rows: selected.map(a => ({ label: sym(a).replace('USDT',''), values: selected.map(b => corrScore(a, b)) })),
    pairs: selected.flatMap((a, i) => selected.slice(i + 1).map(b => ({
      a: sym(a), b: sym(b), corr: corrScore(a, b),
      heatOverlap: round(Math.min(n(a.adjustedHeat), n(b.adjustedHeat)) * Math.abs(corrScore(a, b)), 3),
      directionMix: isLong(a) === isLong(b) ? 'aynı yön' : 'zıt yön'
    }))).sort((x, y) => y.heatOverlap - x.heatOverlap).slice(0, 8)
  };
}

function buildStress(rows = [], scenario = SCENARIOS.base) {
  const scenarios = Object.values(SCENARIOS).map(sc => {
    const heat = calculatePortfolioHeat(rows.map(r => ({ symbol: sym(r), direction: r.direction, riskPct: r.riskPct, beta: r.beta })), { usdtDominance: sc.usdtDominance, riskOff: sc.riskOff });
    const clusters = buildClusters(rows.map((r) => {
      const hRow = heat.rows.find(x => sym(x) === sym(r) && upper(x.direction) === upper(r.direction)) || {};
      return { ...r, adjustedHeat: n(hRow.adjustedHeat, r.adjustedHeat), riskOffAdjusted: Boolean(hRow.riskOffAdjusted) };
    }), sc);
    const long = clusters.find(c => c.id === 'long');
    const totalStatus = statusForHeat(heat.totalHeat, sc.totalLimit);
    return {
      id: sc.id,
      label: sc.label,
      usdtDominance: sc.usdtDominance,
      btcDominance: sc.btcDominance,
      longHeat: long?.betaRisk || 0,
      totalHeat: heat.totalHeat,
      limit: sc.totalLimit,
      altLongCut: sc.altLongCut,
      status: totalStatus,
      action: totalStatus.label === 'NORMAL' ? 'İzle' : (sc.altLongCut ? `%${sc.altLongCut} altcoin long kesintisi` : 'Yeni aynı yön risk açma')
    };
  });
  return scenarios;
}

function buildRiskBudget(rows = [], scenario = SCENARIOS.base, totalStatus = {}) {
  return rows.map(p => {
    const cut = riskCutForPosition(p, scenario, totalStatus);
    const afterHeat = round(cut.suggestedRiskPct * n(p.beta, 1), 3);
    const family = FAMILY[sym(p)] || 'Crypto Beta';
    return {
      ...p,
      symbol: sym(p),
      family,
      riskCutPct: cut.cutPct,
      suggestedRiskPct: cut.suggestedRiskPct,
      suggestedHeat: afterHeat,
      cutReason: cut.reason,
      exposureStatus: cut.cutPct >= 60 ? 'KESKİN AZALT' : cut.cutPct >= 35 ? 'AZALT' : cut.cutPct > 0 ? 'HAFİF AZALT' : 'NORMAL'
    };
  });
}

export function portfolioHeatScenarioList() {
  return Object.values(SCENARIOS).map(s => ({ id: s.id, label: s.label }));
}

export function portfolioHeatScenarioLabel(id = 'base') {
  return scenarioById(id).label;
}

export function buildPortfolioHeatV2Report({ marketData = null, symbol = 'BTCUSDT', tf = '4h', scenarioId = 'base' } = {}) {
  const scenario = scenarioById(scenarioId);
  const baseReport = makeOpenPositionsReport({ marketData, symbol, tf });
  const basePositions = (baseReport.positions || []).map(p => ({
    ...p,
    symbol: sym(p),
    direction: upper(p.direction),
    riskPct: n(p.riskPct),
    beta: n(p.beta, 1),
    rawHeat: n(p.riskPct),
    adjustedHeat: round(n(p.riskPct) * n(p.beta, 1), 3),
    family: FAMILY[sym(p)] || 'Crypto Beta'
  }));

  const heat = calculatePortfolioHeat(basePositions.map(p => ({ symbol: p.symbol, direction: p.direction, riskPct: p.riskPct, beta: p.beta })), { usdtDominance: scenario.usdtDominance, riskOff: scenario.riskOff });
  const heatRows = basePositions.map(p => {
    const h = heat.rows.find(x => sym(x) === p.symbol && upper(x.direction) === p.direction) || {};
    return { ...p, adjustedHeat: n(h.adjustedHeat, p.adjustedHeat), riskOffAdjusted: Boolean(h.riskOffAdjusted) };
  });
  const clusters = buildClusters(heatRows, scenario);
  const totalStatus = statusForHeat(heat.totalHeat, scenario.totalLimit);
  const riskBudget = buildRiskBudget(heatRows, scenario, totalStatus);
  const correlation = buildCorrelationMatrix(heatRows);
  const stress = buildStress(basePositions, scenario);
  const longCluster = clusters.find(c => c.id === 'long') || {};
  const altCluster = clusters.find(c => c.id === 'altLong') || {};
  const shortCluster = clusters.find(c => c.id === 'short') || {};
  const suggestedTotalRisk = round(riskBudget.reduce((a, r) => a + n(r.suggestedRiskPct), 0), 3);
  const suggestedTotalHeat = round(riskBudget.reduce((a, r) => a + n(r.suggestedHeat), 0), 3);
  const warnings = [];
  if (totalStatus.label !== 'NORMAL') warnings.push(totalStatus.action);
  if (longCluster.status?.label !== 'NORMAL') warnings.push('Crypto long heat sınıra yakın veya üstünde.');
  if (altCluster.status?.label !== 'NORMAL') warnings.push('Altcoin long kümesi fazla ısınıyor.');
  if (scenario.altLongCut > 0) warnings.push(`Senaryo altcoin long riskini teorik olarak %${scenario.altLongCut} azaltır.`);
  if (!warnings.length) warnings.push('Portföy heat limiti içinde; yeni sinyal yine kalite filtresinden geçmeli.');

  return {
    version: '0.49.3-live-card-hydration',
    symbol,
    tf,
    scenario,
    source: baseReport?.source || 'positions-report',
    summary: {
      openCount: heatRows.length,
      totalRawRisk: round(heatRows.reduce((a, r) => a + n(r.riskPct), 0), 3),
      betaAdjustedHeat: heat.totalHeat,
      longHeat: round(longCluster.betaRisk || heat.longHeat, 3),
      shortHeat: round(shortCluster.betaRisk || heat.shortHeat, 3),
      altLongHeat: round(altCluster.betaRisk || 0, 3),
      totalLimit: scenario.totalLimit,
      suggestedTotalRisk,
      suggestedTotalHeat,
      riskCutDelta: round(heat.totalHeat - suggestedTotalHeat, 3),
      status: totalStatus,
      warnings
    },
    rows: riskBudget,
    clusters,
    correlation,
    stress,
    generatedAt: Date.now(),
    note: 'Portfolio Heat v2 otomatik emir açmaz; manuel pozisyon bilgisinden beta ayarlı yön riski ve risk azaltma önerisi üretir.'
  };
}
