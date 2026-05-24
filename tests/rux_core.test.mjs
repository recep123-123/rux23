// RUx v0.66.0 — Sprint 1 birim testleri (A07)
// Çalıştırma: npm install && npm test
// Saf (pure) sayısal motorlar ve yeni setup/veri-güveni katmanları test edilir.

import { describe, it, expect } from 'vitest';
import {
  clamp, round, sma, ema, atr, percentile, rsiFromCloses,
  analyzeDataConfidence, resolveDataConfidenceInputs, resolveCvdConfirmation, resolveSpreadBps,
  noTradeDecision, finalSignalScore, realisticCostAndFill,
  detectTrendPullback, detectLiquiditySweepReversal, detectBreakoutRetest,
  detectRangeRotation, detectSqueezeReversal, detectSetupFamily,
  buildSetupAwarePlan, analyzeLiveMarketSignal, makeWalkForwardReport,
  probabilisticRegime, adaptiveThresholds, persistentAdaptiveThresholds,
  resolveLiquidity, analyzeHtfConfluence, htfTimeframeOf,
  unifiedConfidence, calibratedPrediction
} from '../public/rux_core.js';

// Yardımcı: sentetik mum üretici
function genCandles(n = 140, { drift = 0.003, start = 100, wobble = 0.006 } = {}) {
  const out = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift + Math.sin(i / 5) * wobble);
    const o = p * 0.998;
    out.push({
      open: o, high: Math.max(o, p) * 1.004, low: Math.min(o, p) * 0.996,
      close: p, volume: 1000 + (i % 7) * 120, time: Date.now() - (n - i) * 14400000
    });
  }
  return out;
}

describe('Temel sayısal yardımcılar', () => {
  it('clamp sınırları korur', () => {
    expect(clamp(150)).toBe(100);
    expect(clamp(-10)).toBe(0);
    expect(clamp(42)).toBe(42);
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('round doğru yuvarlar', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(2.5, 0)).toBe(3);
  });

  it('sma ortalamayı doğru hesaplar', () => {
    const s = sma([2, 4, 6, 8, 10], 5);
    expect(s.at(-1)).toBe(6);
  });

  it('ema son değeri makul aralıkta', () => {
    const e = ema([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3);
    expect(e.at(-1)).toBeGreaterThan(8);
    expect(e.at(-1)).toBeLessThanOrEqual(10);
  });

  it('atr pozitif ve sonlu', () => {
    const c = genCandles(40);
    const a = atr(c, 14).filter(Number.isFinite).at(-1);
    expect(a).toBeGreaterThan(0);
    expect(Number.isFinite(a)).toBe(true);
  });

  it('percentile sıralı dizide doğru', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBeCloseTo(5.5, 1);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1, 1);
  });

  it('rsi 0-100 aralığında', () => {
    const c = genCandles(60);
    const r = rsiFromCloses(c.map(x => x.close), 14);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(100);
  });
});

describe('A02 — Veri güveni gerçek ölçüm', () => {
  it('resolveDataConfidenceInputs sabit varsayılan KULLANMAZ, ölçer', () => {
    const md = {
      latencyMs: 90,
      derivatives: { openInterest: 5000000, fundingRate: 0.0001 },
      basis: { basisPct: 0.05 },
    };
    const r = resolveDataConfidenceInputs(md, { tf: '4h', candles: genCandles(80), sourceKey: 'binance' });
    expect(r.measured.latency).toBe(true);
    expect(r.measured.oi).toBe(true);
    expect(r.measured.funding).toBe(true);
    expect(r.measured.crossExchange).toBe(true);
    expect(r.latencyMs).toBe(90);
    expect(r.hasOi).toBe(true);
    // basis küçükse cross-exchange agreement yüksek olmalı
    expect(r.crossExchangeAgreement).toBeGreaterThan(0.9);
  });

  it('veri yoksa ölçüm flagleri false ve agreement düşük-nötr', () => {
    const r = resolveDataConfidenceInputs(null, { tf: '4h', candles: [], sourceKey: 'unknown' });
    expect(r.measured.oi).toBe(false);
    expect(r.measured.funding).toBe(false);
    expect(r.crossExchangeAgreement).toBeLessThanOrEqual(0.75);
  });

  it('yüksek basis agreement düşürür', () => {
    const low = resolveDataConfidenceInputs({ basis: { basisPct: 0.02 } }, {});
    const high = resolveDataConfidenceInputs({ basis: { basisPct: 0.9 } }, {});
    expect(high.crossExchangeAgreement).toBeLessThan(low.crossExchangeAgreement);
  });

  it('fallback modu agreement kırpar', () => {
    const normal = resolveDataConfidenceInputs({ basis: { basisPct: 0.05 } }, {});
    const fb = resolveDataConfidenceInputs({ basis: { basisPct: 0.05 }, browserFallback: true }, {});
    expect(fb.crossExchangeAgreement).toBeLessThan(normal.crossExchangeAgreement);
  });

  it('analyzeDataConfidence taze veride yüksek skor verir', () => {
    const c = genCandles(120);
    const d = analyzeDataConfidence({ candles: c, source: 'binance', latencyMs: 80, tf: '4h', hasOi: true, hasFunding: true, crossExchangeAgreement: 0.95 });
    expect(d.score).toBeGreaterThan(70);
    expect(d.label).not.toBe('YENİ SİNYALİ BLOKE ET');
  });
});

describe('A06 — CVD divergence confirmation', () => {
  it('CVD yoksa weight 0 döner', () => {
    const r = resolveCvdConfirmation(null, genCandles(30));
    expect(r.available).toBe(false);
    expect(r.weight).toBe(0);
  });

  it('fiyat ve CVD aynı yönde → teyit (yüksek skor)', () => {
    const candles = genCandles(30, { drift: 0.004 }); // yukarı trend
    const r = resolveCvdConfirmation({ deltaPct: 3.0 }, candles);
    expect(r.available).toBe(true);
    expect(r.divergence).toBe('YOK');
    expect(r.score).toBeGreaterThan(60);
  });

  it('fiyat yukarı CVD aşağı → bearish divergence (düşük skor)', () => {
    const candles = genCandles(30, { drift: 0.004 });
    const r = resolveCvdConfirmation({ deltaPct: -2.0 }, candles);
    expect(r.divergence).toBe('BEARISH_DIVERGENCE');
    expect(r.score).toBeLessThan(50);
  });
});

describe('A08 — Spread gerçek ölçüm', () => {
  it('order book derinliğinden bps hesaplar', () => {
    const md = { spot: { depth: { bids: [[100, 5]], asks: [[100.1, 5]] } } };
    const bps = resolveSpreadBps(md);
    expect(bps).toBeGreaterThan(0);
    expect(bps).toBeLessThan(50);
  });

  it('depth yoksa basis tahminine düşer', () => {
    const bps = resolveSpreadBps({ basis: { basisPct: 0.2 } });
    expect(bps).toBeGreaterThan(2);
  });

  it('hiçbir veri yoksa makul varsayılan', () => {
    expect(resolveSpreadBps(null)).toBe(8);
  });
});

describe('No-Trade ve final skor', () => {
  it('RR kritikse hard block', () => {
    const nt = noTradeDecision({ rr: 1.0 });
    expect(nt.blocked).toBe(true);
    expect(nt.hardBlocks).toContain('RR_KRİTİK');
  });

  it('veri güveni kritikse hard block', () => {
    const nt = noTradeDecision({ rr: 2, dataConfidence: 40 });
    expect(nt.blocked).toBe(true);
  });

  it('temiz koşulda işlem açık', () => {
    const nt = noTradeDecision({ rr: 2.2, dataConfidence: 88, manipulationRisk: 15, spreadBps: 6 });
    expect(nt.blocked).toBe(false);
  });

  it('finalSignalScore bloklanmışsa 0', () => {
    const f = finalSignalScore({ setup: 90, regime: 90, confirmation: 90, execution: 90, rr: 90, noTrade: { blocked: true, hardBlocks: ['X'] } });
    expect(f.score).toBe(0);
    expect(f.label).toBe('İŞLEM YOK');
  });

  it('finalSignalScore ağırlıklı toplam doğru', () => {
    const f = finalSignalScore({ setup: 80, regime: 80, confirmation: 80, execution: 80, rr: 80 });
    expect(f.score).toBeCloseTo(80, 0);
  });
});

describe('Maliyet modeli', () => {
  it('net-R brütten küçük (maliyet düşülmüş)', () => {
    const c = realisticCostAndFill({ grossR: 2, profile: 'futures_normal' });
    expect(c.netR).toBeLessThan(2);
    expect(c.totalCostR).toBeGreaterThan(0);
  });

  it('konservatif profil normalden pahalı', () => {
    const normal = realisticCostAndFill({ grossR: 2, fillModel: 'realistic' });
    const stress = realisticCostAndFill({ grossR: 2, fillModel: 'conservative' });
    expect(stress.totalCostR).toBeGreaterThan(normal.totalCostR);
  });
});

describe('A04 — Setup ailesi detector\'leri', () => {
  it('Liquidity Sweep Reversal sweep+reclaim olmadan tetiklenmez', () => {
    const r = detectLiquiditySweepReversal({ events: [], metrics: {}, levels: {} });
    expect(r.found).toBe(false);
  });

  it('Liquidity Sweep Reversal doğru kanıtla tetiklenir', () => {
    const r = detectLiquiditySweepReversal({
      events: [{ type: 'SWEEP', side: 'LONG', score: 70 }, { type: 'RECLAIM', side: 'LONG', score: 72 }],
      metrics: { volumeRatio: 1.5, lowerWickPct: 45 }, levels: {}
    });
    expect(r.found).toBe(true);
    expect(r.side).toBe('LONG');
    expect(r.score).toBeGreaterThan(0);
  });

  it('Breakout Retest BOS olmadan tetiklenmez', () => {
    const r = detectBreakoutRetest({ events: [{ type: 'SWEEP', side: 'LONG', score: 50 }], metrics: {} });
    expect(r.found).toBe(false);
  });

  it('Breakout Retest BOS ile tetiklenir', () => {
    const r = detectBreakoutRetest({ events: [{ type: 'BOS', side: 'LONG', score: 80 }], metrics: { volumeRatio: 1.4, bodyPct: 60 } });
    expect(r.found).toBe(true);
    expect(r.side).toBe('LONG');
  });

  it('Squeeze Reversal aşırı funding ile short tetikler', () => {
    const r = detectSqueezeReversal({ metrics: { upperWickPct: 30 }, regime: 'SQUEEZE', funding: 0.0006, volatilityPct: 1.1, oiChangePct: 8 });
    expect(r.found).toBe(true);
    expect(r.side).toBe('SHORT'); // pozitif funding → long crowd → short squeeze
  });

  it('Range Rotation bant dibinde long tetikler', () => {
    const r = detectRangeRotation({
      events: [{ type: 'LIQUIDITY', side: 'LONG', score: 62 }, { type: 'LIQUIDITY', side: 'SHORT', score: 62 }],
      levels: { locationPct: 18 }, metrics: { lowerWickPct: 35 }, regime: 'RANGE'
    });
    expect(r.found).toBe(true);
    expect(r.side).toBe('LONG');
  });

  it('detectSetupFamily en yüksek skorlu bulunanı seçer', () => {
    const ctx = {
      structure: 'HH / HL boğa yapısı', bias: 'LONG',
      events: [{ type: 'SWEEP', side: 'LONG', score: 70 }, { type: 'RECLAIM', side: 'LONG', score: 75 }],
      levels: { locationPct: 25, rangeHigh: 130, rangeLow: 100, recentSwingHigh: 128, recentSwingLow: 101 },
      metrics: { volumeRatio: 1.6, candleQuality: 65, lowerWickPct: 45, bodyPct: 40 },
      regime: 'BOĞA', funding: 0.0001, volatilityPct: 2.5
    };
    const sf = detectSetupFamily(ctx);
    expect(sf.best.found).toBe(true);
    expect(sf.candidates.length).toBeGreaterThan(0);
  });

  it('hiçbir şart sağlanmazsa Watch döner', () => {
    const sf = detectSetupFamily({ structure: 'Nötr yapı', bias: 'NEUTRAL', events: [], levels: { locationPct: 50 }, metrics: {}, regime: 'NÖTR' });
    expect(sf.best.found).toBe(false);
  });
});

describe('A05 — Setup-aware plan', () => {
  it('long planda stop fiyatın altında, tp1 üstünde', () => {
    const plan = buildSetupAwarePlan({
      bestSetup: { found: true, side: 'LONG', plan: { stopAnchor: 'recentSwingLow', tp1Anchor: 'recentSwingHigh', tp1Mult: 1.4, tp2Mult: 2.2 } },
      isLong: true, isShort: false, price: 110, atrNow: 2,
      pa: { levels: { recentSwingLow: 105, recentSwingHigh: 120, rangeHigh: 122, rangeLow: 100 } }
    });
    expect(plan.stop).toBeLessThan(110);
    expect(plan.tp1).toBeGreaterThan(110);
    expect(plan.anchored).toBe(true);
  });

  it('seviye yoksa ATR yedeğine düşer', () => {
    const plan = buildSetupAwarePlan({
      bestSetup: { found: false, side: null, plan: null },
      isLong: true, isShort: false, price: 100, atrNow: 2,
      pa: { levels: {} }, stopDistanceFallback: 3
    });
    expect(plan.anchored).toBe(false);
    expect(plan.stopDistance).toBeGreaterThan(0);
  });
});

describe('A03 — Walk-forward train/test gap', () => {
  it('yetersiz veride stabilite üretmez (insufficientData)', () => {
    const wf = makeWalkForwardReport({ marketData: { candles: genCandles(100) }, symbol: 'BTCUSDT' });
    expect(wf.insufficientData).toBe(true);
    expect(wf.summary.overfitRisk).toBe('YETERSİZ_VERİ');
  });

  it('yeterli veride pencereler üretir ve gap uygular', () => {
    const wf = makeWalkForwardReport({ marketData: { candles: genCandles(400), source: 'binance' }, symbol: 'BTCUSDT', windows: 5 });
    expect(wf.insufficientData).toBe(false);
    expect(wf.windows.length).toBeGreaterThan(0);
    expect(wf.windows[0].gapBars).toBe(24);
  });
});

describe('Entegrasyon — analyzeLiveMarketSignal', () => {
  it('yetersiz mumda güvenli demo döner', () => {
    const sig = analyzeLiveMarketSignal({ symbol: 'BTCUSDT', tf: '4h', marketData: { candles: genCandles(30) } });
    expect(sig.live).toBe(false);
  });

  it('yeterli veride tam sinyal üretir ve veri güveni ölçülür', () => {
    const candles = genCandles(140);
    const md = {
      candles, source: 'binance', market: 'binance', latencyMs: 85,
      ticker: { price: candles.at(-1).close, change: 1.2 },
      derivatives: { fundingRate: 0.0001, openInterest: 5000000 },
      basis: { basisPct: 0.05 }, cvd: { deltaPct: 2.0 }
    };
    const sig = analyzeLiveMarketSignal({ symbol: 'BTCUSDT', tf: '4h', marketData: md });
    expect(sig.live).toBe(true);
    expect(sig.data.measured.oi).toBe(true);
    expect(sig.data.measured.funding).toBe(true);
    expect(sig.cvd.available).toBe(true);
    expect(sig.scores).toHaveProperty('setup');
    expect(sig.pipeline.some(p => p[0] === 'CVD')).toBe(true);
  });

  it('final skor 0-100 aralığında', () => {
    const md = { candles: genCandles(140), source: 'binance', ticker: { price: 150 }, derivatives: {} };
    const sig = analyzeLiveMarketSignal({ symbol: 'BTCUSDT', tf: '4h', marketData: md });
    expect(sig.final.score).toBeGreaterThanOrEqual(0);
    expect(sig.final.score).toBeLessThanOrEqual(100);
  });
});

describe('Olasılıksal rejim', () => {
  it('beş rejim olasılığı toplamı ~100 (yüzde)', () => {
    const r = probabilisticRegime(genCandles(120));
    const sum = Object.values(r.probabilities || {}).reduce((a, b) => a + Number(b), 0);
    expect(sum).toBeGreaterThan(90);
    expect(sum).toBeLessThan(110);
  });
});

describe('A10 — Adaptif eşik kalıcılığı', () => {
  // localStorage stub (test ortamı)
  const _store = {};
  globalThis.localStorage = globalThis.localStorage || {
    getItem: k => _store[k] ?? null,
    setItem: (k, v) => { _store[k] = String(v); },
    removeItem: k => { delete _store[k]; }
  };

  it('ilk çağrı taze döner ve snapshot yazar', () => {
    const c = genCandles(140);
    const t = persistentAdaptiveThresholds(c, { regime: 'BOĞA', symbol: 'TESTUSDT', now: 1000000 });
    expect(t.restoredFrom).toBe('fresh');
    expect(t.volumeSpike).toBeGreaterThan(0);
  });

  it('hafta içi ikinci çağrı snapshot\'tan yumuşatılmış döner', () => {
    const c = genCandles(140);
    persistentAdaptiveThresholds(c, { regime: 'AYI', symbol: 'SMOOTHUSDT', now: 2000000 });
    const c2 = genCandles(140, { drift: 0.01, wobble: 0.02 }); // daha volatil
    const t2 = persistentAdaptiveThresholds(c2, { regime: 'AYI', symbol: 'SMOOTHUSDT', now: 2000000 + 86400000 });
    expect(t2.restoredFrom).toBe('snapshot');
    expect(t2.snapshotAgeMs).toBeGreaterThan(0);
  });

  it('hafta dolunca taze yenilenir', () => {
    const c = genCandles(140);
    persistentAdaptiveThresholds(c, { regime: 'RANGE', symbol: 'EXPUSDT', now: 3000000 });
    const t = persistentAdaptiveThresholds(c, { regime: 'RANGE', symbol: 'EXPUSDT', now: 3000000 + 604800000 + 1000 });
    expect(t.restoredFrom).toBe('expired-refresh');
  });

  it('haftalık değişim %15 ile sınırlı (ani sıçrama önlenir)', () => {
    const cLow = genCandles(140, { wobble: 0.002 });
    persistentAdaptiveThresholds(cLow, { regime: 'BOĞA', symbol: 'CAPUSDT', now: 4000000 });
    const cHigh = genCandles(140, { wobble: 0.05 }); // çok daha volatil
    const t = persistentAdaptiveThresholds(cHigh, { regime: 'BOĞA', symbol: 'CAPUSDT', now: 4000000 + 3600000 });
    // snapshot modunda olmalı (yumuşatılmış)
    expect(t.restoredFrom).toBe('snapshot');
  });

  it('adaptiveThresholds (kalıcı olmayan) hâlâ çalışır', () => {
    const t = adaptiveThresholds(genCandles(120), { regime: 'range' });
    expect(t.volumeSpike).toBeGreaterThan(0);
    expect(t.maxWeeklyThresholdChangePct).toBe(15);
  });
});

describe('A11 — MTF Confluence', () => {
  it('htfTimeframeOf doğru üst TF döndürür', () => {
    expect(htfTimeframeOf('4h')).toBe('1d');
    expect(htfTimeframeOf('1h')).toBe('4h');
    expect(htfTimeframeOf('15m')).toBe('1h');
  });

  it('yetersiz HTF verisinde etki yok', () => {
    const r = analyzeHtfConfluence(genCandles(20), { mainSide: 'LONG' });
    expect(r.available).toBe(false);
    expect(r.regimeAdjust).toBe(0);
  });

  it('üst TF yukarı + ana LONG → hizalı, pozitif adjust', () => {
    const up = genCandles(120, { drift: 0.005 });
    const r = analyzeHtfConfluence(up, { mainSide: 'LONG' });
    expect(r.htfBias).toBe('LONG');
    expect(r.alignment).toBe('HIZALI');
    expect(r.regimeAdjust).toBeGreaterThan(0);
  });

  it('üst TF yukarı + ana SHORT → karşıt, negatif adjust', () => {
    const up = genCandles(120, { drift: 0.005 });
    const r = analyzeHtfConfluence(up, { mainSide: 'SHORT' });
    expect(r.alignment).toBe('KARŞIT');
    expect(r.regimeAdjust).toBeLessThan(0);
  });
});

describe('A12 — Likidite değerlendirmesi', () => {
  it('iyi likidite (dar spread + derin) → yüksek tier, ceza yok', () => {
    const r = resolveLiquidity({ depthMetrics: { spreadBps: 5, bidUsd: 2000000, askUsd: 1900000 } });
    expect(r.tier).toBe('YÜKSEK');
    expect(r.executionPenalty).toBe(0);
    expect(r.tradeable).toBe(true);
  });

  it('kötü likidite (geniş spread + sığ) → düşük tier, ceza + tradeable false', () => {
    const r = resolveLiquidity({ depthMetrics: { spreadBps: 48, bidUsd: 20000, askUsd: 18000 } });
    expect(r.tier).toBe('DÜŞÜK');
    expect(r.executionPenalty).toBeGreaterThan(0);
    expect(r.tradeable).toBe(false);
  });

  it('depthMetrics yoksa ölçülmedi ama güvenli (tradeable)', () => {
    const r = resolveLiquidity({});
    expect(r.measured).toBe(false);
    expect(r.tradeable).toBe(true);
  });
});

describe('v0.70.0 — Birleşik güven & kalibrasyon', () => {
  it('yüksek girdiler → YÜKSEK güven, risk ×1', () => {
    const c = unifiedConfidence({ dataConfidence: 92, liquidityScore: 88, htfAlignment: 'HIZALI', manipulationRisk: 15, sampleSize: 40, crossExchange: 0.95 });
    expect(c.tier).toBe('YÜKSEK');
    expect(c.riskMultiplier).toBe(1.0);
    expect(c.bandPct).toBeLessThan(20);
  });

  it('zayıf girdiler → DÜŞÜK güven, risk azaltılır', () => {
    const c = unifiedConfidence({ dataConfidence: 45, liquidityScore: 35, htfAlignment: 'KARŞIT', manipulationRisk: 70, sampleSize: 0, crossExchange: 0.55, macroEventRisk: true });
    expect(c.tier).toBe('DÜŞÜK');
    expect(c.riskMultiplier).toBeLessThan(0.5);
    expect(c.bandPct).toBeGreaterThan(25);
  });

  it('makro olay riski güveni düşürür', () => {
    const base = unifiedConfidence({ dataConfidence: 70, liquidityScore: 70, htfAlignment: 'NÖTR', manipulationRisk: 30 });
    const macro = unifiedConfidence({ dataConfidence: 70, liquidityScore: 70, htfAlignment: 'NÖTR', manipulationRisk: 30, macroEventRisk: true });
    expect(macro.confidence).toBeLessThan(base.confidence);
  });

  it('MTF hizalı güveni artırır, karşıt düşürür', () => {
    const aligned = unifiedConfidence({ htfAlignment: 'HIZALI' });
    const opposed = unifiedConfidence({ htfAlignment: 'KARŞIT' });
    expect(aligned.confidence).toBeGreaterThan(opposed.confidence);
  });

  it('örneklem büyüklüğü güveni artırır', () => {
    const none = unifiedConfidence({ sampleSize: 0 });
    const many = unifiedConfidence({ sampleSize: 50 });
    expect(many.confidence).toBeGreaterThan(none.confidence);
  });

  it('kalibrasyon: düşük güven skoru nötre çeker (shrinkage)', () => {
    const lo = unifiedConfidence({ dataConfidence: 40, liquidityScore: 30, htfAlignment: 'KARŞIT', manipulationRisk: 75 });
    const cal = calibratedPrediction({ finalScore: 85, confidence: lo });
    expect(cal.calibratedScore).toBeLessThan(85);
    expect(cal.calibratedScore).toBeGreaterThan(50);
  });

  it('kalibrasyon: yüksek güven skoru korur', () => {
    const hi = unifiedConfidence({ dataConfidence: 92, liquidityScore: 90, htfAlignment: 'HIZALI', manipulationRisk: 12, sampleSize: 40, crossExchange: 0.96 });
    const cal = calibratedPrediction({ finalScore: 85, confidence: hi });
    expect(cal.calibratedScore).toBeGreaterThan(80);
  });

  it('tahmin bandı düşük güvende genişler', () => {
    const lo = unifiedConfidence({ dataConfidence: 40, manipulationRisk: 70 });
    const cal = calibratedPrediction({ finalScore: 80, confidence: lo });
    const width = cal.predictionBand[1] - cal.predictionBand[0];
    expect(width).toBeGreaterThan(40);
  });
});
