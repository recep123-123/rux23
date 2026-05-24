/* RUx — Edge Research Dashboard Consolidation Engine
   v0.37-v0.44 araştırma panellerini tek karar destek özetinde birleştirir.
   Otomatik emir açmaz; deployment/readiness ve shadow-mode önerisi üretir. */
import {
  makeRuxBacktestSnapshot,
  makeWalkForwardReport,
  makeEdgeCalibrationReport,
  makeBacktestOosValidationReport,
  summarizeBacktestRows
} from './rux_core.js?v=0.75.7-liquidation-source-health-20260524';
import { buildSetupPerformanceMatrixReport, compareSetupMatrixMode } from './rux_setup_matrix.js?v=0.75.7-liquidation-source-health-20260524';
import { buildRuleComparisonReport } from './rux_rule_compare.js?v=0.75.7-liquidation-source-health-20260524';
import { makeMonteCarloStabilityReport } from './rux_monte_carlo.js?v=0.75.7-liquidation-source-health-20260524';
import { buildExecutionFidelityReport } from './rux_execution_fidelity.js?v=0.75.7-liquidation-source-health-20260524';
import { makeSignalReplayReport } from './rux_signal_replay.js?v=0.75.7-liquidation-source-health-20260524';
import { loadSignalJournal, makeForwardJournalReport } from './rux_journal.js?v=0.75.7-liquidation-source-health-20260524';
import { loadLastDataSourceHealthReport } from './rux_data_health.js?v=0.75.7-liquidation-source-health-20260524';

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function round(v, d = 2) { return Number(num(v).toFixed(d)); }
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, num(v))); }
function pct01(v) { return clamp(num(v), 0, 100); }
function posScore(value, good = 0.15, strong = 0.35) {
  const v = num(value);
  if (v <= 0) return 20;
  if (v >= strong) return 100;
  if (v >= good) return 70 + ((v - good) / Math.max(strong - good, 0.001)) * 30;
  return 40 + (v / Math.max(good, 0.001)) * 30;
}
function pfScore(pf = 0) {
  const p = num(pf);
  if (p <= 0) return 20;
  if (p >= 1.8) return 100;
  if (p >= 1.2) return 70 + ((p - 1.2) / 0.6) * 30;
  if (p >= 1.0) return 50 + ((p - 1.0) / 0.2) * 20;
  return 25 + p * 25;
}
function inverseRiskScore(value = 0, low = 5, high = 25) {
  const v = Math.abs(num(value));
  if (v <= low) return 100;
  if (v >= high) return 10;
  return 100 - ((v - low) / Math.max(high - low, 0.001)) * 90;
}
function dataScore(payload) {
  const score = num(payload?.report?.score ?? payload?.gates?.report?.score ?? payload?.dataConfidence, NaN);
  if (Number.isFinite(score)) return clamp(score);
  return 62; // veri paneli hiç çalışmadıysa nötr/uyarı seviyesi
}
function sourceLabel(marketData) {
  const src = String(marketData?.source || marketData?.provider || '').trim();
  if (!src) return 'demo/fallback';
  return src;
}
function ageLabel(ts) {
  const t = typeof ts === 'number' ? ts : Date.parse(ts || 0);
  if (!Number.isFinite(t) || t <= 0) return 'yok';
  const diff = Date.now() - t;
  if (diff < 60_000) return Math.max(1, Math.floor(diff / 1000)) + ' sn önce';
  if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' dk önce';
  if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' sa önce';
  return Math.floor(diff / 86_400_000) + ' gün önce';
}
function moduleVerdict({ score, sample = true, positive = true, hardRisk = false, name = 'Modül' }) {
  if (hardRisk) return { label: 'Riskli', tone: 'red', action: `${name}: önce risk/freeze nedenini çöz.` };
  if (!sample) return { label: 'Örneklem bekliyor', tone: 'gray', action: `${name}: karar için daha fazla kayıt gerekir.` };
  if (!positive || score < 45) return { label: 'Zayıf', tone: 'red', action: `${name}: aktifleştirme yok; filtre/kural yeniden incelenmeli.` };
  if (score >= 80) return { label: 'Sağlam', tone: 'green', action: `${name}: shadow/readiness tarafında güçlü.` };
  if (score >= 62) return { label: 'İzleme', tone: 'yellow', action: `${name}: shadow mode; otomatik aktivasyon yok.` };
  return { label: 'Dikkat', tone: 'yellow', action: `${name}: sonuç karışık; canlı/forward veri bekle.` };
}
function globalReadinessScore(parts = {}) {
  const weights = {
    setup: 0.17,
    rules: 0.13,
    oos: 0.18,
    monteCarlo: 0.16,
    data: 0.14,
    calibration: 0.12,
    replay: 0.05,
    fidelity: 0.05
  };
  return round(Object.entries(weights).reduce((sum, [k, w]) => sum + pct01(parts[k]) * w, 0), 1);
}
function globalVerdict(score, risks = {}) {
  if (risks.dataFreeze) return { label: 'DATA FREEZE', tone: 'red', action: 'Kritik veri kaynağı düzelmeden yeni sinyal üretimi dondurulmalı.' };
  if (risks.oosReject || risks.ruinHigh) return { label: 'REJECT / SHADOW ONLY', tone: 'red', action: 'Backtest iyi görünse bile OOS/Monte Carlo kapısı geçilmedi; canlı kullanım yok.' };
  if (score >= 82 && !risks.sampleWeak) return { label: 'RESEARCH READY', tone: 'green', action: 'Aktivasyon değil; shadow/forward izleme için güçlü aday.' };
  if (score >= 68) return { label: 'SHADOW MODE', tone: 'yellow', action: 'Karar motoruna bağlama; forward ve data health ile izle.' };
  if (score >= 52) return { label: 'WATCH / MORE DATA', tone: 'yellow', action: 'Edge haritası oluşuyor; örneklem ve canlı veri bekle.' };
  return { label: 'REBUILD FILTERS', tone: 'red', action: 'Setup/filtre veya veri kalitesi tarafı yeniden ele alınmalı.' };
}

export function makeEdgeResearchDashboardReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const backtest = makeRuxBacktestSnapshot({ marketData, symbol, tf, fillModel: 'realistic' });
  const rows = backtest.metrics?.rows || [];
  const btSummary = summarizeBacktestRows(rows);
  const setup = buildSetupPerformanceMatrixReport({ backtestRows: rows, mode: 'combined' });
  const setupDecision = compareSetupMatrixMode(setup);
  const rules = buildRuleComparisonReport({ rows, category: 'all', minSample: 12 });
  const oos = backtest.oosValidation || makeBacktestOosValidationReport({ rows });
  const walkForward = makeWalkForwardReport({ marketData, symbol, tf, windows: 6 });
  const mc = makeMonteCarloStabilityReport({ marketData, symbol, tf, iterations: 1000, ruinThresholdR: -10 });
  const calibration = makeEdgeCalibrationReport({ marketData, symbol, tf });
  const journalRows = loadSignalJournal();
  const forward = makeForwardJournalReport ? makeForwardJournalReport(journalRows) : { rows: journalRows };
  const fidelity = buildExecutionFidelityReport(journalRows);
  const replay = makeSignalReplayReport({ marketData, journalRows, symbol, tf });
  const dataHealth = loadLastDataSourceHealthReport();

  const setupScore = setup.summary?.count >= setup.minSample
    ? clamp((setup.best?.length || 0) * 18 + posScore(setup.summary.expectancy, 0.08, 0.24) * 0.42 + pfScore(setup.summary.profitFactor || btSummary.profitFactor) * 0.30 - (setup.sampleWarnings || 0) * 1.5)
    : clamp(35 + (setup.summary?.count || 0) * 2.5);
  const rulesScore = rules.best
    ? clamp((rules.best.score || 0) * 0.72 + pfScore(rules.best.summary?.profitFactor) * 0.18 + posScore(rules.best.summary?.expectancy, 0.05, 0.18) * 0.10)
    : 40;
  const oosScore = clamp(
    pfScore(oos.oos?.profitFactor) * 0.32 +
    posScore(oos.oos?.expectancy, 0.05, 0.18) * 0.32 +
    pct01(num(oos.stability) * 100) * 0.24 +
    inverseRiskScore(oos.oos?.maxDrawdownR, 4, 16) * 0.12 -
    (oos.overfitScore || 0) * 0.30
  );
  const mcScore = clamp(
    pct01(100 - num(mc.summary?.riskOfRuin || 0) * 3) * 0.32 +
    inverseRiskScore(mc.summary?.p90MaxDD ?? mc.drawdown?.p90, 6, 24) * 0.26 +
    pct01(num(mc.stability?.score || 0) * 100) * 0.26 +
    posScore(mc.stability?.oosExpectancy, 0.04, 0.18) * 0.16
  );
  const data = dataScore(dataHealth);
  const calibrationScore = clamp(
    (calibration.activationGate?.approved ? 90 : calibration.status === 'SHADOW MODE' ? 72 : 52) * 0.45 +
    pct01(num(calibration.stabilityScore || 0) * 100) * 0.30 +
    pfScore(calibration.challenger?.profitFactor) * 0.15 +
    posScore(calibration.improvement?.expectancy, 0.01, 0.06) * 0.10
  );
  const replayScore = clamp((replay.summary?.validReplayRatio ?? 70) || 70);
  const fidelityScore = fidelity.summary?.count
    ? clamp(fidelity.summary.avgFidelityScore ?? 55)
    : 55;

  const moduleScores = { setup: setupScore, rules: rulesScore, oos: oosScore, monteCarlo: mcScore, data, calibration: calibrationScore, replay: replayScore, fidelity: fidelityScore };
  const readiness = globalReadinessScore(moduleScores);
  const risks = {
    dataFreeze: dataHealth?.gates?.freezeNewSignals || data < 50,
    oosReject: oos.verdict === 'OVERFIT RİSKİ' || num(oos.stability) < 0.60 || num(oos.oos?.expectancy) <= 0,
    ruinHigh: num(mc.summary?.riskOfRuin || 0) >= 20 || num(mc.stability?.score || 0) < 0.60,
    sampleWeak: (setup.summary?.count || 0) < setup.minSample || (oos.oos?.totalTrades || 0) < (oos.minOosTrades || 20)
  };
  const verdict = globalVerdict(readiness, risks);

  const modules = [
    {
      id: 'setup', title: 'Setup Matrix', route: '#/setup-matrisi', score: round(setupScore),
      metric: `${setup.best?.length || 0} strong / ${setup.sampleWarnings || 0} düşük örnek`,
      verdict: moduleVerdict({ score: setupScore, sample: (setup.summary?.count || 0) >= 5, positive: setup.summary?.expectancy >= 0, name: 'Setup Matrix' }),
      note: setupDecision.label,
      action: setupDecision.tone === 'green' ? 'En iyi setup/rejim kombinasyonlarını shadow izle.' : 'Forward kayıt ve örneklem artır.'
    },
    {
      id: 'rules', title: 'Rule Comparison', route: '#/kural-karsilastirma', score: round(rulesScore),
      metric: rules.best ? `${rules.best.model} · ${round(rules.best.summary?.expectancy, 3)}R` : 'aday yok',
      verdict: moduleVerdict({ score: rulesScore, sample: rules.tradeCount >= 10, positive: rules.best?.summary?.expectancy >= rules.baseline?.expectancy, name: 'Rule Comparison' }),
      note: rules.activation?.label || 'İzleme',
      action: rules.activation?.action || 'Aday kuralı OOS paneline gönder.'
    },
    {
      id: 'oos', title: 'OOS / Walk-Forward', route: '#/walkforward', score: round(oosScore),
      metric: `Stability ${round(oos.stability, 2)} · OOS ${round(oos.oos?.expectancy, 3)}R`,
      verdict: moduleVerdict({ score: oosScore, sample: oos.sampleOk, positive: oos.oosPositive, hardRisk: risks.oosReject, name: 'OOS' }),
      note: `${walkForward.summary?.positiveWindowRatio || 0}% pozitif pencere`,
      action: oos.verdict === 'OOS SAĞLAM' ? 'Shadow test için uygun.' : 'Canlı karar motoruna bağlama.'
    },
    {
      id: 'mc', title: 'Monte Carlo / Ruin', route: '#/montecarlo', score: round(mcScore),
      metric: `Ruin %${round(mc.summary?.riskOfRuin, 1)} · P90 DD ${round(mc.summary?.p90MaxDD ?? mc.drawdown?.p90, 2)}R`,
      verdict: moduleVerdict({ score: mcScore, sample: true, positive: mc.stability?.oosExpectancy > 0, hardRisk: risks.ruinHigh, name: 'Monte Carlo' }),
      note: mc.riskBand?.status || 'Risk dağılımı',
      action: mc.riskRecommendation?.text || 'Risk çarpanını kontrol et.'
    },
    {
      id: 'data', title: 'Data Source Health', route: '#/data-kaynak-sagligi', score: round(data),
      metric: dataHealth ? `${round(data)} / 100 · ${ageLabel(dataHealth.checkedAt)}` : 'son test yok',
      verdict: moduleVerdict({ score: data, sample: Boolean(dataHealth), positive: data >= 50, hardRisk: risks.dataFreeze, name: 'Data Health' }),
      note: dataHealth?.gates?.deployment || 'Önce data health testi çalıştırılmalı',
      action: dataHealth ? (dataHealth.gates?.recommendation || 'Kaynak uyarılarını izle.') : 'Sistem > Data Source Health ekranında test çalıştır.'
    },
    {
      id: 'calibration', title: 'Edge Calibration', route: '#/kalibrasyon', score: round(calibrationScore),
      metric: `${calibration.status} · Stability ${round(calibration.stabilityScore, 2)}`,
      verdict: moduleVerdict({ score: calibrationScore, sample: calibration.activationGate?.softSampleOk, positive: calibration.improvement?.expectancy >= 0, name: 'Edge Calibration' }),
      note: calibration.reason,
      action: calibration.activationGate?.approved ? 'Aday ağırlık seti shadow aktivasyon kapısında.' : 'Ağırlıkları otomatik aktifleştirme.'
    },
    {
      id: 'replay', title: 'Signal Replay', route: '#/signal-replay', score: round(replayScore),
      metric: `${replay.candidates?.length || 0} replay adayı`,
      verdict: moduleVerdict({ score: replayScore, sample: (replay.candidates?.length || 0) > 0, positive: true, name: 'Signal Replay' }),
      note: replay.selected?.status || replay.status || 'Sinyal akışı izleniyor',
      action: 'Entry→TP/SL olay sırasını debug için kullan.'
    },
    {
      id: 'fidelity', title: 'User Fidelity', route: '#/user-fidelity', score: round(fidelityScore),
      metric: fidelity.summary?.count ? `${round(fidelity.summary.avgFidelityScore, 1)} ort. fidelity` : 'manuel kayıt yok',
      verdict: moduleVerdict({ score: fidelityScore, sample: fidelity.summary?.count > 0, positive: fidelityScore >= 55, name: 'User Fidelity' }),
      note: fidelity.summary?.count ? `${round(fidelity.summary.avgExecutionDeltaR, 2)}R uygulama delta` : 'Kullanıcı uygulama kaydı bekleniyor',
      action: fidelity.summary?.count ? 'En büyük execution leak kayıtlarını incele.' : 'Demo/manuel işlem kaydı girerek ölç.'
    }
  ];

  const topEdges = [
    ...(setup.best || []).slice(0, 4).map(x => ({ type: 'Setup', name: `${x.setup} / ${x.regime}`, score: x.edgeScore, metric: `${round(x.expectancy, 3)}R · PF ${round(x.profitFactor, 2)}`, route: '#/setup-matrisi' })),
    ...(rules.ranked || []).slice(0, 4).map(x => ({ type: 'Rule', name: x.model, score: x.score, metric: `${round(x.summary?.expectancy, 3)}R · PF ${round(x.summary?.profitFactor, 2)}`, route: '#/kural-karsilastirma' }))
  ].sort((a, b) => num(b.score) - num(a.score)).slice(0, 6);

  const blockers = [];
  if (risks.dataFreeze) blockers.push({ severity: 'hard', label: 'Data Freeze', detail: 'Veri güveni kritik; yeni sinyal dondurulmalı.', route: '#/data-kaynak-sagligi' });
  if (risks.oosReject) blockers.push({ severity: 'hard', label: 'OOS / Stability', detail: 'OOS expectancy veya stability kapısı geçilmedi.', route: '#/walkforward' });
  if (risks.ruinHigh) blockers.push({ severity: 'hard', label: 'Monte Carlo Risk', detail: 'Risk-of-ruin veya P90 drawdown kabul dışı.', route: '#/montecarlo' });
  if (risks.sampleWeak) blockers.push({ severity: 'soft', label: 'Sample Weak', detail: 'Setup/OOS örneklem sayısı karar için zayıf.', route: '#/setup-matrisi' });
  if (calibration.rejectedReasons?.length) blockers.push({ severity: 'soft', label: 'Calibration Gate', detail: calibration.rejectedReasons[0], route: '#/kalibrasyon' });

  const nextActions = [
    blockers[0] ? { priority: 'P0', title: blockers[0].label, action: blockers[0].detail, route: blockers[0].route } : { priority: 'P0', title: 'Forward Shadow', action: 'En iyi setup + kural adaylarını canlı/paper kayıtla izlemeye devam et.', route: '#/sinyal-gunlugu' },
    { priority: 'P1', title: 'Rule Candidate', action: rules.best ? `${rules.best.model} adayını OOS ve Monte Carlo kapısından geçir.` : 'Kural karşılaştırma için daha fazla sinyal sonucu üret.', route: '#/kural-karsilastirma' },
    { priority: 'P1', title: 'Data Health', action: dataHealth ? 'Kaynak gecikme/boş veri uyarılarını haftalık izle.' : 'Data Source Health testini çalıştır ve raporu kaydet.', route: '#/data-kaynak-sagligi' },
    { priority: 'P2', title: 'User Fidelity', action: 'Manuel giriş/çıkış kayıtlarını artır; edge kaybı sistem mi uygulama mı ayrışsın.', route: '#/user-fidelity' }
  ];

  return {
    version: '0.49.3-live-card-hydration',
    symbol,
    tf,
    source: sourceLabel(marketData),
    readiness,
    verdict,
    risks,
    moduleScores,
    modules,
    topEdges,
    blockers,
    nextActions,
    backtest: { summary: btSummary, rows: rows.length, oos },
    setup,
    rules,
    walkForward,
    monteCarlo: mc,
    calibration,
    fidelity,
    replay,
    dataHealth,
    forward,
    generatedAt: new Date().toISOString(),
    note: 'Edge Research Dashboard; setup, rule, OOS, Monte Carlo, data health, replay ve user fidelity çıktılarının tek komuta panelidir. Otomatik emir açmaz ve ağırlıkları otomatik aktifleştirmez.'
  };
}

if (typeof window !== 'undefined') {
  window.RUX_EDGE_DASHBOARD = { makeEdgeResearchDashboardReport };
}
