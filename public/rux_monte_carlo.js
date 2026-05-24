/* RUx — Monte Carlo Drawdown & Risk-of-Ruin wrapper
   Aynı sinyal Net-R dizisini farklı işlem sıralarıyla stres test eder.
   Emir göndermez; yalnızca araştırma ve risk dayanıklılığı raporu üretir. */
import { makeMonteCarloRiskReport, makeRuxBacktestSnapshot, makeWalkForwardReport } from './rux_core.js?v=0.75.12-heatmap-premium-visual-pass-20260524';

function round(n, d = 2) {
  const v = Number(n || 0);
  return Number.isFinite(v) ? Number(v.toFixed(d)) : 0;
}

function abs(n) { return Math.abs(Number(n || 0)); }

function riskBand({ riskOfRuin = 0, ddP90 = 0, stability = 0, oosExpectancy = 0 } = {}) {
  if (stability < 0.60 || riskOfRuin >= 20 || abs(ddP90) >= 25 || oosExpectancy <= 0) {
    return { status: 'YÜKSEK RİSK / CANLIYA UYGUN DEĞİL', tone: 'red', label: 'Reject' };
  }
  if (stability < 0.80 || riskOfRuin >= 10 || abs(ddP90) >= 18) {
    return { status: 'ORTA RİSK / SHADOW İZLE', tone: 'yellow', label: 'Watch' };
  }
  if (riskOfRuin <= 5 && abs(ddP90) <= 14 && stability >= 0.90) {
    return { status: 'DAYANIKLI / RİSK KONTROLLÜ', tone: 'green', label: 'Robust' };
  }
  return { status: 'KABUL EDİLEBİLİR / RİSK AZALT', tone: 'cyan', label: 'Acceptable' };
}

function riskRecommendation({ riskOfRuin = 0, ddP90 = 0, stability = 0, baseRisk = 0.5 } = {}) {
  let multiplier = 1.0;
  const reasons = [];
  if (stability < 0.60) { multiplier *= 0.35; reasons.push('Stability 0.60 altında; overfit riski yüksek.'); }
  else if (stability < 0.80) { multiplier *= 0.60; reasons.push('Stability 0.80 altında; risk azaltılmalı.'); }
  if (riskOfRuin >= 20) { multiplier *= 0.35; reasons.push('Risk-of-ruin kritik seviyede.'); }
  else if (riskOfRuin >= 10) { multiplier *= 0.65; reasons.push('Risk-of-ruin orta/yüksek.'); }
  if (abs(ddP90) >= 25) { multiplier *= 0.50; reasons.push('P90 kötü senaryo drawdown çok derin.'); }
  else if (abs(ddP90) >= 18) { multiplier *= 0.75; reasons.push('P90 drawdown psikolojik ve portföy limiti açısından ağır.'); }
  multiplier = Math.max(0.15, Math.min(1, multiplier));
  const suggestedRisk = round(baseRisk * multiplier, 2);
  return {
    baseRisk,
    multiplier: round(multiplier, 2),
    suggestedRisk,
    text: multiplier >= 0.9
      ? `Standart manuel risk korunabilir: yaklaşık %${baseRisk.toFixed(2)}.`
      : `Manuel risk yaklaşık %${suggestedRisk.toFixed(2)} seviyesine indirilmeli.`,
    reasons: reasons.length ? reasons : ['Monte Carlo dağılımı şu an standart risk için kabul edilebilir görünüyor.']
  };
}

export function makeMonteCarloStabilityReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h', iterations = 1000, seed = 128, ruinThresholdR = -10 } = {}) {
  const mcIterations = Math.max(1000, Number(iterations) || 1000);
  const mc = makeMonteCarloRiskReport({ marketData, symbol, tf, iterations: mcIterations, seed, ruinThresholdR });
  const backtest = makeRuxBacktestSnapshot({ marketData, symbol, tf, fillModel: 'realistic' });
  const wf = makeWalkForwardReport({ marketData, symbol, tf, windows: 6 });
  const oos = backtest.oosValidation || {};
  const summary = mc.summary || {};

  const stability = Number(oos.stability || wf.summary?.avgStability || 0);
  const oosExpectancy = Number(oos.oos?.expectancy || wf.summary?.avgOosExpectancy || 0);
  const isPF = Number(oos.is?.profitFactor || 0);
  const oosPF = Number(oos.oos?.profitFactor || 0);
  const ddP90 = Number(summary.p90MaxDD ?? summary.p95MaxDD ?? 0);
  const ddP95 = Number(summary.p95MaxDD ?? ddP90);
  const ruin = Number(summary.riskOfRuin || 0);
  const band = riskBand({ riskOfRuin: ruin, ddP90, stability, oosExpectancy });
  const rec = riskRecommendation({ riskOfRuin: ruin, ddP90, stability, baseRisk: 0.50 });

  const overfitFlag = stability < 0.80 || oosExpectancy <= 0;
  const gates = [
    { label: 'MC örneklem', value: `${mc.iterations} iterasyon`, ok: mc.iterations >= 1000, note: mc.iterations >= 1000 ? 'Minimum 1000 karıştırma koşulu sağlandı.' : 'Monte Carlo koşusu 1000 altında.' },
    { label: 'P90 Max DD', value: `${ddP90 >= 0 ? '+' : ''}${round(ddP90, 2)}R`, ok: abs(ddP90) <= 18, note: abs(ddP90) <= 18 ? 'Kötü senaryo drawdown yönetilebilir.' : 'Kötü senaryo drawdown ağır.' },
    { label: 'Risk-of-ruin', value: `%${round(ruin, 1)}`, ok: ruin < 10, note: ruin < 10 ? 'Ruin olasılığı düşük/orta.' : 'Ruin riski risk azaltımı gerektiriyor.' },
    { label: 'Stability Score', value: String(round(stability, 2)), ok: stability >= 0.80, note: stability >= 0.80 ? 'OOS/IS performans oranı kabul edilebilir.' : 'OOS tarafında performans korunmuyor.' },
    { label: 'OOS Expectancy', value: `${oosExpectancy >= 0 ? '+' : ''}${round(oosExpectancy, 3)}R`, ok: oosExpectancy > 0, note: oosExpectancy > 0 ? 'Görülmemiş dönemde pozitif edge var.' : 'Görülmemiş dönemde edge kırılıyor.' }
  ];

  return {
    ...mc,
    v42: true,
    iterations: mcIterations,
    riskBand: band,
    stability: {
      score: round(stability, 2),
      isPF: round(isPF, 2),
      oosPF: round(oosPF, 2),
      oosExpectancy: round(oosExpectancy, 3),
      overfitFlag,
      overfitLabel: overfitFlag ? 'Overfit Warning' : 'Stability OK',
      oosVerdict: oos.verdict || wf.summary?.recommendation || 'İzleme'
    },
    drawdown: {
      median: Number(summary.medianMaxDD || 0),
      p90: round(ddP90, 2),
      p95: round(ddP95, 2),
      worst: Number(summary.worstMaxDD || 0)
    },
    riskRecommendation: rec,
    gates,
    walkForward: wf.summary || {},
    oosValidation: oos,
    governance: {
      mc_iterations: mcIterations,
      dd_p90: round(ddP90, 2),
      stability_score: round(stability, 2),
      overfit_flag: overfitFlag,
      risk_recommendation: rec.text
    },
    note: 'v0.42 Monte Carlo paneli işlem sırası riskini, drawdown dağılımını, risk-of-ruin proxy’sini ve OOS stability skorunu birlikte gösterir; otomatik emir veya otomatik risk artırımı yapmaz.'
  };
}
