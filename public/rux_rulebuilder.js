/* RUx — Local Rule Builder Engine */
const LS_KEY = 'rux.ruleSets.v1';

export const RULE_TEMPLATES = Object.freeze({
  trendPullback: {
    name: 'Trend Pullback Long',
    setup: 'Trend Pullback',
    regime: 'Bull Trend',
    direction: 'LONG',
    weights: { setup: 30, regime: 20, confirmation: 25, execution: 15, rr: 10 },
    thresholds: { minFinal: 75, minDataConfidence: 70, maxNoTrade: 55, minRR: 1.8, maxManipulation: 60 },
    conditions: [
      { key: 'htfTrend', label: 'HTF trend bullish: EMA50 > EMA200 ve fiyat EMA200 üstünde', weight: 15, required: true },
      { key: 'structure', label: 'HH-HL yapı ve son BOS yukarı', weight: 15, required: true },
      { key: 'discount', label: 'Geri çekilme discount / destek / OB-FVG bölgesinde', weight: 15, required: true },
      { key: 'ltfTrigger', label: 'LTF bullish CHoCH/BOS oluşmuş', weight: 15, required: true },
      { key: 'volume', label: 'Geri çekilme hacmi zayıf, dönüş hacmi güçlü', weight: 10, required: false },
      { key: 'rr', label: 'RR >= 1.8R ve stop teknik olarak net', weight: 10, required: true }
    ]
  },
  sweepReversal: {
    name: 'Liquidity Sweep Reversal Long',
    setup: 'Liquidity Sweep Reversal',
    regime: 'Range / Squeeze',
    direction: 'LONG',
    weights: { setup: 28, regime: 18, confirmation: 30, execution: 14, rr: 10 },
    thresholds: { minFinal: 76, minDataConfidence: 72, maxNoTrade: 50, minRR: 2.0, maxManipulation: 58 },
    conditions: [
      { key: 'majorSupport', label: 'Major destek / range low / equal low bölgesinde', weight: 15, required: true },
      { key: 'sweep', label: 'Sell-side liquidity net alınmış', weight: 20, required: true },
      { key: 'reclaim', label: 'Sweep sonrası hızlı reclaim', weight: 15, required: true },
      { key: 'wick', label: 'Alt fitil threshold’u sağlanmış', weight: 10, required: false },
      { key: 'choch', label: 'LTF bullish CHoCH oluşmuş', weight: 15, required: true },
      { key: 'squeeze', label: 'Funding/OI short squeeze potansiyeli gösteriyor', weight: 10, required: false }
    ]
  },
  breakoutRetest: {
    name: 'Breakout Retest Long',
    setup: 'Breakout Retest',
    regime: 'Bull / Expansion',
    direction: 'LONG',
    weights: { setup: 32, regime: 20, confirmation: 22, execution: 16, rr: 10 },
    thresholds: { minFinal: 78, minDataConfidence: 75, maxNoTrade: 48, minRR: 1.7, maxManipulation: 55 },
    conditions: [
      { key: 'breakout', label: 'Direnç kapanışla kırıldı', weight: 20, required: true },
      { key: 'body', label: 'Kırılım gövdesi ATR normalize güçlü', weight: 15, required: true },
      { key: 'retest', label: 'Retestte eski direnç destek olarak çalışıyor', weight: 20, required: true },
      { key: 'volume', label: 'Kırılım hacmi SMA20 üstünde', weight: 15, required: false },
      { key: 'spot', label: 'Spot/perp teyidi sağlıklı', weight: 10, required: false },
      { key: 'rr', label: 'Kovalama yok; RR hâlâ yeterli', weight: 10, required: true }
    ]
  }
});

function uid() {
  return 'rs_' + Math.random().toString(36).slice(2, 9) + '_' + Date.now().toString(36);
}

function clone(x) { return JSON.parse(JSON.stringify(x)); }

export function getRuleSets() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {}
  const defaults = [
    makeRuleSetFromTemplate('trendPullback'),
    makeRuleSetFromTemplate('sweepReversal'),
    makeRuleSetFromTemplate('breakoutRetest')
  ];
  saveRuleSets(defaults);
  return defaults;
}

export function saveRuleSets(list = []) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
  return list;
}

export function makeRuleSetFromTemplate(templateKey = 'trendPullback', overrides = {}) {
  const t = clone(RULE_TEMPLATES[templateKey] || RULE_TEMPLATES.trendPullback);
  const now = new Date().toISOString();
  return {
    id: uid(),
    templateKey,
    status: 'Shadow Test',
    active: false,
    createdAt: now,
    updatedAt: now,
    notes: 'Otomatik emir açmaz; manuel sinyal ve backtest doğrulaması için kullanılır.',
    ...t,
    ...overrides,
  };
}

export function addRuleSet(templateKey, overrides = {}) {
  const list = getRuleSets();
  const item = makeRuleSetFromTemplate(templateKey, overrides);
  list.unshift(item);
  saveRuleSets(list);
  return item;
}

export function updateRuleSet(id, patch = {}) {
  const list = getRuleSets();
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...patch, updatedAt: new Date().toISOString() };
    saveRuleSets(list);
    return list[idx];
  }
  return null;
}

export function deleteRuleSet(id) {
  const list = getRuleSets().filter(x => x.id !== id);
  saveRuleSets(list);
  return list;
}

export function activateRuleSet(id) {
  const list = getRuleSets().map(x => ({ ...x, active: x.id === id, status: x.id === id ? 'Aktif' : x.status === 'Aktif' ? 'Shadow Test' : x.status }));
  saveRuleSets(list);
  return list.find(x => x.id === id);
}

export function scoreRuleSet(ruleSet = {}) {
  const weights = ruleSet.weights || {};
  const thresholds = ruleSet.thresholds || {};
  const conditions = Array.isArray(ruleSet.conditions) ? ruleSet.conditions : [];
  const totalCond = conditions.reduce((s,c) => s + (Number(c.weight) || 0), 0) || 1;
  const requiredWeight = conditions.filter(c => c.required).reduce((s,c) => s + (Number(c.weight) || 0), 0);
  const optionalWeight = Math.max(0, totalCond - requiredWeight);

  const sumWeights = Object.values(weights).reduce((s,v) => s + (Number(v) || 0), 0);
  const weightBalancePenalty = Math.abs(100 - sumWeights) * 0.55;
  const thresholdPenalty =
    (Number(thresholds.minDataConfidence) < 60 ? 8 : 0) +
    (Number(thresholds.minRR) < 1.5 ? 10 : 0) +
    (Number(thresholds.maxNoTrade) > 70 ? 7 : 0) +
    (Number(thresholds.maxManipulation) > 70 ? 7 : 0);

  const structureScore = Math.min(100, (requiredWeight / totalCond) * 72 + (optionalWeight / totalCond) * 18 + Math.min(10, conditions.length));
  const stability = Math.max(0, Math.min(100, structureScore - weightBalancePenalty - thresholdPenalty));

  const expectancy = Number(((stability - 58) / 100 + (Number(thresholds.minRR) || 1.5) * 0.035).toFixed(3));
  const pf = Number(Math.max(0.85, 1 + expectancy * 1.7).toFixed(2));
  const maxDD = Number((-(18 - stability * 0.09)).toFixed(1));
  const sample = 120 + conditions.length * 8;
  const verdict = stability >= 82 && expectancy > 0.18 ? 'Shadow Test için güçlü aday'
    : stability >= 70 ? 'İzlenebilir / küçük kalibrasyon gerekli'
    : 'Zayıf; canlıya alınmadan revize edilmeli';

  return { stability, expectancy, pf, maxDD, sample, verdict, sumWeights, requiredWeight, totalCond };
}

export function buildRuleBuilderReport() {
  const sets = getRuleSets();
  const scored = sets.map(s => ({ ...s, metrics: scoreRuleSet(s) }));
  const active = scored.find(s => s.active) || scored[0];
  const best = [...scored].sort((a,b) => (b.metrics.stability - a.metrics.stability))[0];
  return {
    sets: scored,
    active,
    best,
    total: scored.length,
    activeCount: scored.filter(s => s.active).length,
    shadowCount: scored.filter(s => String(s.status).toLowerCase().includes('shadow')).length,
    avgStability: scored.length ? Math.round(scored.reduce((a,s)=>a+s.metrics.stability,0)/scored.length) : 0,
    avgExpectancy: scored.length ? Number((scored.reduce((a,s)=>a+s.metrics.expectancy,0)/scored.length).toFixed(3)) : 0,
  };
}

export function exportRuleSetsBlob() {
  const payload = {
    exportedAt: new Date().toISOString(),
    source: 'RUx Rule Builder',
    ruleSets: getRuleSets()
  };
  return JSON.stringify(payload, null, 2);
}

export function importRuleSetsJson(text) {
  const parsed = JSON.parse(text);
  const incoming = Array.isArray(parsed) ? parsed : parsed.ruleSets;
  if (!Array.isArray(incoming)) throw new Error('Geçerli kural seti listesi bulunamadı.');
  const normalized = incoming.map(x => ({ ...x, id: x.id || uid(), updatedAt: new Date().toISOString() }));
  saveRuleSets(normalized);
  return normalized;
}
