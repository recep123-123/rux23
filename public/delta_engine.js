/* RUx — Order Flow / Delta / CVD Engine
 * ──────────────────────────────────────────────────────────────
 * v0.50–v0.54 üzerine kurulu. Hacim ayrıştırması (buy vs sell aggression)
 * üzerinden delta, kümülatif delta (CVD), absorption ve climactic
 * hacim sinyallerini üretir. v0.50/v0.51/v0.52'nin tamamladığı SMC
 * narrative'ine "kim daha agresif?" boyutunu ekler.
 *
 * Kavramlar:
 *
 *   Delta (per candle):
 *     Bir mum içinde alıcı taker volume − satıcı taker volume.
 *       Δ = takerBuyVolume − takerSellVolume
 *           = takerBuyVolume − (totalVolume − takerBuyVolume)
 *           = 2 × takerBuyBase − totalVolume
 *     Pozitif Δ → agresif alıcı dominant; negatif → agresif satıcı.
 *
 *   CVD (Cumulative Volume Delta):
 *     ΣΔ — zaman içinde alıcı/satıcı baskısının net birikimi.
 *     Yön: yukarı eğilimli CVD = sürekli alıcı baskısı.
 *
 *   Delta Divergence:
 *     Fiyat yeni yüksek yaparken CVD yeni yüksek yapmıyor (negatif
 *     divergence — yükseliş zayıflıyor), veya tersi (positive).
 *     Çok güçlü reversal sinyali.
 *
 *   Absorption:
 *     Yüksek mutlak delta ama küçük fiyat hareketi. Büyük alıcı
 *     veya satıcı emirleri karşı tarafı emiyor demek.
 *
 *   Climactic Volume:
 *     Hacim normalden 2x+ yüksek. Trend exhaustion veya breakout
 *     başlangıcı sinyali olabilir.
 *
 * Veri katmanları:
 *   - GERÇEK delta: takerBuyBase varsa Binance kline'larından (api.js
 *     bu alanı çıkartıyor). Bu altın-standart.
 *   - PROXY delta: takerBuyBase yoksa tick rule kullanılır:
 *       close > open → buy aggression (Δ = +volume)
 *       close < open → sell aggression (Δ = −volume)
 *       close == open → kapanış pozisyonuna göre split
 *     Free Data Mode'da çalışır.
 *
 * No-repaint:
 *   - Delta yalnızca kapalı mumlardan hesaplanır
 *   - Divergence yalnızca confirmed swing pivot'larda
 *   - CVD'nin son değeri = son closed candle'ın cumulative değeri
 */

import { isClosedCandle, tfToMs } from './pa_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { findConfirmedPivots } from './structure_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';

/* ───────── Yardımcılar ───────── */
function num(x){ return Number.isFinite(Number(x)) ? Number(x) : NaN; }
function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }

/* ───────── Sabitler ───────── */
export const DELTA_CONST = Object.freeze({
  // Climactic volume threshold (×avg)
  CLIMACTIC_VOLUME_MULT: 2.0,
  // Absorption threshold: |delta| > avg×1.5 AND price move < avgRange×0.5
  ABSORPTION_DELTA_MULT: 1.5,
  ABSORPTION_MOVE_MULT: 0.5,
  // Divergence lookback (pivots arası)
  DIVERGENCE_LOOKBACK_PIVOTS: 3,
  // Sustained pressure: son N mumun delta'sı aynı işaretli ise
  SUSTAINED_BARS: 4,
  SUSTAINED_RATIO_MIN: 0.75, // 4'ten 3'ü aynı yön
});

/* ───────── Per-Candle Delta Hesabı ─────────
 *
 * Önce gerçek veriye bakar (takerBuyBase), yoksa tick-rule proxy.
 * Dönüş: { delta, source, buyVol, sellVol, totalVol, deltaPct }
 *   source: 'real' | 'proxy'
 */
export function computeCandleDelta(c) {
  if (!c) return null;
  const totalVol = num(c.volume);
  if (!Number.isFinite(totalVol) || totalVol <= 0) {
    return { delta: 0, source: 'none', buyVol: 0, sellVol: 0, totalVol: 0, deltaPct: 0 };
  }

  // GERÇEK: takerBuyBase available
  const takerBuy = num(c.takerBuyBase);
  if (Number.isFinite(takerBuy) && takerBuy >= 0 && takerBuy <= totalVol) {
    const buyVol = takerBuy;
    const sellVol = totalVol - takerBuy;
    const delta = buyVol - sellVol;
    return {
      delta: round(delta, 4),
      source: 'real',
      buyVol: round(buyVol, 4),
      sellVol: round(sellVol, 4),
      totalVol: round(totalVol, 4),
      deltaPct: round((delta / totalVol) * 100, 2),
    };
  }

  // PROXY: tick rule
  const o = num(c.open), cl = num(c.close), h = num(c.high), l = num(c.low);
  if (![o, cl, h, l].every(Number.isFinite)) {
    return { delta: 0, source: 'none', buyVol: 0, sellVol: 0, totalVol, deltaPct: 0 };
  }
  let buyVol, sellVol;
  if (cl > o) {
    // Bull candle — assume buying dominant
    // Refine: % buyer pressure = (close - low) / (high - low)
    const range = Math.max(h - l, 1e-9);
    const buyRatio = (cl - l) / range;
    buyVol = totalVol * buyRatio;
    sellVol = totalVol * (1 - buyRatio);
  } else if (cl < o) {
    const range = Math.max(h - l, 1e-9);
    const buyRatio = (cl - l) / range;
    buyVol = totalVol * buyRatio;
    sellVol = totalVol * (1 - buyRatio);
  } else {
    // Doji: 50/50
    buyVol = totalVol / 2;
    sellVol = totalVol / 2;
  }
  const delta = buyVol - sellVol;
  return {
    delta: round(delta, 4),
    source: 'proxy',
    buyVol: round(buyVol, 4),
    sellVol: round(sellVol, 4),
    totalVol: round(totalVol, 4),
    deltaPct: round((delta / totalVol) * 100, 2),
  };
}

/* ───────── Cumulative Volume Delta ─────────
 *
 * Tüm closed candle'lar için cumulative delta serisi.
 * Dönüş: { series: [{ index, time, delta, cvd, source }], current: { cvd, delta, source } }
 */
export function computeCVD(candles = []) {
  if (!candles.length) return { series: [], current: null };
  let cvd = 0;
  let realCount = 0, proxyCount = 0;
  const series = candles.map((c, i) => {
    const d = computeCandleDelta(c);
    cvd += d.delta;
    if (d.source === 'real') realCount++;
    else if (d.source === 'proxy') proxyCount++;
    return {
      index: i,
      time: c.time ?? c.openTime ?? null,
      delta: d.delta,
      cvd: round(cvd, 4),
      source: d.source,
      buyVol: d.buyVol,
      sellVol: d.sellVol,
      totalVol: d.totalVol,
      deltaPct: d.deltaPct,
    };
  });

  const last = series[series.length - 1];
  return {
    series,
    current: last,
    sourceStats: { real: realCount, proxy: proxyCount, total: candles.length },
  };
}

/* ───────── Delta Divergence Detector ─────────
 *
 * Confirmed pivot high/low'ları üstünde çalışır. Fiyat HH yaparken
 * CVD HH yapmıyorsa → bearish divergence. Tersi → bullish divergence.
 *
 * Lookback: son N pivot çiftine bakılır.
 */
export function detectDeltaDivergences(candles, cvdSeries, opts = {}) {
  const lookbackPivots = opts.lookbackPivots ?? DELTA_CONST.DIVERGENCE_LOOKBACK_PIVOTS;
  const pivotLen = opts.pivotLen ?? 3;

  const pivots = findConfirmedPivots(candles, pivotLen);
  const events = [];

  // Helper: get CVD at a specific candle index
  const cvdAt = (idx) => cvdSeries[idx]?.cvd ?? null;

  // Bearish divergence: en son lookbackPivots high'a bak
  const recentHighs = (pivots.highs || []).slice(-lookbackPivots);
  for (let i = 1; i < recentHighs.length; i++) {
    const prev = recentHighs[i-1];
    const curr = recentHighs[i];
    const cvdPrev = cvdAt(prev.index);
    const cvdCurr = cvdAt(curr.index);
    if (cvdPrev == null || cvdCurr == null) continue;
    // Price HH but CVD LH → bearish divergence
    if (curr.price > prev.price && cvdCurr < cvdPrev) {
      const priceDelta = ((curr.price - prev.price) / prev.price) * 100;
      const cvdDelta = cvdPrev !== 0 ? ((cvdCurr - cvdPrev) / Math.abs(cvdPrev)) * 100 : 0;
      const strength = clamp(50 + Math.abs(cvdDelta) * 0.3 + priceDelta * 5);
      events.push({
        type: 'DELTA_DIVERGENCE',
        side: 'SHORT',
        subtype: 'bearish_divergence',
        score: round(strength, 1),
        candleIndex: candles.length - 1 - curr.index,
        timestamp: candles[curr.index]?.time ?? candles[curr.index]?.openTime ?? null,
        evidence: {
          firstPivotPrice: round(prev.price, 4),
          secondPivotPrice: round(curr.price, 4),
          firstCvd: round(cvdPrev, 2),
          secondCvd: round(cvdCurr, 2),
          priceDeltaPct: round(priceDelta, 2),
          cvdDeltaPct: round(cvdDelta, 2),
          pivotsApart: curr.index - prev.index,
        },
        noRepaint: true,
      });
    }
  }

  // Bullish divergence
  const recentLows = (pivots.lows || []).slice(-lookbackPivots);
  for (let i = 1; i < recentLows.length; i++) {
    const prev = recentLows[i-1];
    const curr = recentLows[i];
    const cvdPrev = cvdAt(prev.index);
    const cvdCurr = cvdAt(curr.index);
    if (cvdPrev == null || cvdCurr == null) continue;
    // Price LL but CVD HL → bullish divergence
    if (curr.price < prev.price && cvdCurr > cvdPrev) {
      const priceDelta = ((curr.price - prev.price) / prev.price) * 100;
      const cvdDelta = cvdPrev !== 0 ? ((cvdCurr - cvdPrev) / Math.abs(cvdPrev)) * 100 : 0;
      const strength = clamp(50 + Math.abs(cvdDelta) * 0.3 + Math.abs(priceDelta) * 5);
      events.push({
        type: 'DELTA_DIVERGENCE',
        side: 'LONG',
        subtype: 'bullish_divergence',
        score: round(strength, 1),
        candleIndex: candles.length - 1 - curr.index,
        timestamp: candles[curr.index]?.time ?? candles[curr.index]?.openTime ?? null,
        evidence: {
          firstPivotPrice: round(prev.price, 4),
          secondPivotPrice: round(curr.price, 4),
          firstCvd: round(cvdPrev, 2),
          secondCvd: round(cvdCurr, 2),
          priceDeltaPct: round(priceDelta, 2),
          cvdDeltaPct: round(cvdDelta, 2),
          pivotsApart: curr.index - prev.index,
        },
        noRepaint: true,
      });
    }
  }

  return events;
}

/* ───────── Absorption Detector ─────────
 *
 * |Δ| > avg×1.5 AND price move (|close − open|) < avgRange × 0.5
 * → büyük emir geliyor ama fiyat hareket etmiyor.
 *
 * Yön: aggressive side'a TERS — büyük alıcı emirleri varsa ama fiyat
 * yükselmiyorsa, satıcılar emirleri eziyor demek → SHORT setup.
 */
export function detectAbsorption(candles, cvdSeries, opts = {}) {
  const deltaMult = opts.deltaMult ?? DELTA_CONST.ABSORPTION_DELTA_MULT;
  const moveMult = opts.moveMult ?? DELTA_CONST.ABSORPTION_MOVE_MULT;
  const events = [];

  if (candles.length < 21) return events;

  // Average |delta| ve average range — son 20 mum
  const recentSlice = cvdSeries.slice(-21, -1);
  const recentDeltas = recentSlice.map(s => Math.abs(s.delta));
  const recentRanges = candles.slice(-21, -1).map(c => num(c.high) - num(c.low));
  const avgAbsDelta = recentDeltas.reduce((a,b)=>a+b,0) / Math.max(recentDeltas.length, 1);
  const avgRange = recentRanges.reduce((a,b)=>a+b,0) / Math.max(recentRanges.length, 1);

  // En son N mumda absorption tara
  const scanFrom = Math.max(20, candles.length - 30);
  for (let i = scanFrom; i < candles.length; i++) {
    const c = candles[i];
    const d = cvdSeries[i];
    if (!d || !c) continue;
    const absDelta = Math.abs(d.delta);
    const o = num(c.open), cl = num(c.close);
    const bodyMove = Math.abs(cl - o);

    if (absDelta >= avgAbsDelta * deltaMult && bodyMove <= avgRange * moveMult) {
      // Yüksek delta, küçük hareket → absorption
      // Aggressor side: delta > 0 → buyers aggressive
      // Absorbing side: opposite — satıcılar emiyor → SHORT setup
      const aggressorSide = d.delta > 0 ? 'BUYER' : 'SELLER';
      const setupSide = d.delta > 0 ? 'SHORT' : 'LONG';
      const score = clamp(55 + (absDelta / avgAbsDelta) * 8 + (1 - bodyMove/avgRange) * 15);
      events.push({
        type: 'ABSORPTION',
        side: setupSide,
        subtype: aggressorSide === 'BUYER' ? 'buy_absorption' : 'sell_absorption',
        score: round(score, 1),
        candleIndex: candles.length - 1 - i,
        timestamp: c.time ?? c.openTime ?? null,
        evidence: {
          delta: round(d.delta, 2),
          deltaPct: d.deltaPct,
          absDelta: round(absDelta, 2),
          absDeltaXavg: round(absDelta / avgAbsDelta, 2),
          bodyMove: round(bodyMove, 4),
          bodyMovePctAtr: round((bodyMove / avgRange) * 100, 1),
          aggressorSide,
          interpretation: aggressorSide === 'BUYER'
            ? 'Alıcılar agresif ama fiyat yükselmiyor — satıcılar emiyor'
            : 'Satıcılar agresif ama fiyat düşmüyor — alıcılar emiyor',
        },
        noRepaint: true,
      });
    }
  }

  return events;
}

/* ───────── Climactic Volume Detector ─────────
 *
 * Volume > avg × 2.0 → climactic.
 * Yön: mumun yönüne göre, ama context önemli:
 *   - Uptrend climactic up bar → exhaustion (SHORT)
 *   - Downtrend climactic down bar → exhaustion (LONG)
 *   - Range climactic → breakout başlangıcı (yön: bar yönü)
 */
export function detectClimacticVolume(candles, cvdSeries, opts = {}) {
  const mult = opts.mult ?? DELTA_CONST.CLIMACTIC_VOLUME_MULT;
  const events = [];

  if (candles.length < 21) return events;

  // Avg volume from last 20 closed candles excluding current
  const recentVols = candles.slice(-21, -1).map(c => num(c.volume)).filter(Number.isFinite);
  const avgVol = recentVols.reduce((a,b)=>a+b,0) / Math.max(recentVols.length, 1);

  const scanFrom = Math.max(20, candles.length - 20);
  for (let i = scanFrom; i < candles.length; i++) {
    const c = candles[i];
    const d = cvdSeries[i];
    if (!d || !c) continue;
    const v = num(c.volume);
    if (v < avgVol * mult) continue;
    const o = num(c.open), cl = num(c.close);
    const bullish = cl > o;
    const ratio = v / avgVol;

    // Prior trend (last 10 closes before this candle)
    const start = Math.max(0, i - 10);
    const priorCloses = candles.slice(start, i).map(c => num(c.close)).filter(Number.isFinite);
    let priorTrend = 'FLAT';
    if (priorCloses.length >= 5) {
      const first = priorCloses[0], lastP = priorCloses[priorCloses.length-1];
      const pct = ((lastP - first) / first) * 100;
      if (pct > 1.5) priorTrend = 'UP';
      else if (pct < -1.5) priorTrend = 'DOWN';
    }

    let interpretation, setupSide;
    if (priorTrend === 'UP' && bullish) {
      interpretation = 'Yükselen trendde climactic up bar → exhaustion (SHORT)';
      setupSide = 'SHORT';
    } else if (priorTrend === 'DOWN' && !bullish) {
      interpretation = 'Düşen trendde climactic down bar → exhaustion (LONG)';
      setupSide = 'LONG';
    } else {
      interpretation = priorTrend === 'FLAT'
        ? `Yatay piyasada climactic ${bullish?'up':'down'} bar → breakout başlangıcı`
        : `Trende karşı climactic bar — temkinli yorum`;
      setupSide = bullish ? 'LONG' : 'SHORT';
    }

    const score = clamp(55 + (ratio - 2) * 8);
    events.push({
      type: 'CLIMACTIC_VOLUME',
      side: setupSide,
      subtype: priorTrend === 'UP' && bullish ? 'climactic_up_exhaustion'
             : priorTrend === 'DOWN' && !bullish ? 'climactic_down_exhaustion'
             : `climactic_${bullish?'up':'down'}_breakout`,
      score: round(score, 1),
      candleIndex: candles.length - 1 - i,
      timestamp: c.time ?? c.openTime ?? null,
      evidence: {
        volume: round(v, 2),
        avgVolume: round(avgVol, 2),
        volumeMult: round(ratio, 2),
        delta: d.delta,
        priorTrend,
        candleDirection: bullish ? 'BULLISH' : 'BEARISH',
        interpretation,
      },
      noRepaint: true,
    });
  }

  return events;
}

/* ───────── Sustained Pressure Detector ─────────
 *
 * Son N (default 4) mumda delta hep aynı işaretli → sustained directional
 * pressure. Trend gücünü teyit eder.
 */
export function detectSustainedPressure(candles, cvdSeries, opts = {}) {
  const window = opts.window ?? DELTA_CONST.SUSTAINED_BARS;
  const ratioMin = opts.ratioMin ?? DELTA_CONST.SUSTAINED_RATIO_MIN;
  const events = [];

  if (cvdSeries.length < window + 1) return events;

  const lastN = cvdSeries.slice(-window);
  const posCount = lastN.filter(d => d.delta > 0).length;
  const negCount = lastN.filter(d => d.delta < 0).length;

  if (posCount / window >= ratioMin) {
    const totalDelta = lastN.reduce((s,d) => s + d.delta, 0);
    const lastIdx = cvdSeries.length - 1;
    events.push({
      type: 'SUSTAINED_PRESSURE',
      side: 'LONG',
      subtype: 'sustained_buy_pressure',
      score: clamp(round(55 + (posCount / window) * 25 + Math.abs(totalDelta / 1e6) * 2, 1)),
      candleIndex: 0,
      timestamp: candles[lastIdx]?.time ?? null,
      evidence: {
        windowBars: window,
        positiveBars: posCount,
        negativeBars: negCount,
        positiveRatio: round(posCount / window, 2),
        netDelta: round(totalDelta, 2),
      },
      noRepaint: true,
    });
  } else if (negCount / window >= ratioMin) {
    const totalDelta = lastN.reduce((s,d) => s + d.delta, 0);
    const lastIdx = cvdSeries.length - 1;
    events.push({
      type: 'SUSTAINED_PRESSURE',
      side: 'SHORT',
      subtype: 'sustained_sell_pressure',
      score: clamp(round(55 + (negCount / window) * 25 + Math.abs(totalDelta / 1e6) * 2, 1)),
      candleIndex: 0,
      timestamp: candles[lastIdx]?.time ?? null,
      evidence: {
        windowBars: window,
        positiveBars: posCount,
        negativeBars: negCount,
        negativeRatio: round(negCount / window, 2),
        netDelta: round(totalDelta, 2),
      },
      noRepaint: true,
    });
  }

  return events;
}

/* ───────── Ana API: runDeltaEngine ─────────
 *
 * Tek geçişte CVD + Divergence + Absorption + Climactic + Sustained.
 * Dönüş v0.50 schema-uyumlu event listesi + her component için raw data.
 */
export function runDeltaEngine(candles = [], opts = {}) {
  const tf = opts.tf || '4h';
  const tfMs = tfToMs(tf);
  const now = opts.now ?? Date.now();
  const lookback = opts.lookback || 60;

  if (candles.length < 21) {
    return {
      events: [], eventsChronological: [],
      cvd: { series: [], current: null, sourceStats: { real:0, proxy:0, total:0 } },
      divergences: [], absorptions: [], climactics: [], sustained: [],
      summary: {
        totalEvents: 0, bias: 'NEUTRAL',
        currentCvd: null, currentDelta: null, sourceMode: 'unknown',
      },
      guard: { closedCount: 0, skippedOpenCandle: false, tf, tfMs },
      warnings: ['Yetersiz mum verisi (min 21 mum gerekli).'],
    };
  }

  // No-repaint
  const lastRaw = candles[candles.length - 1];
  const lastClosed = isClosedCandle(lastRaw, tfMs, now);
  const closed = lastClosed ? candles : candles.slice(0, -1);
  const skipped = candles.length - closed.length;

  // CVD serisi
  const cvdResult = computeCVD(closed);
  const cvdSeries = cvdResult.series;

  // Dedektörleri çalıştır
  const divergences = detectDeltaDivergences(closed, cvdSeries, opts);
  const absorptions = detectAbsorption(closed, cvdSeries, opts);
  const climactics = detectClimacticVolume(closed, cvdSeries, opts);
  const sustained = detectSustainedPressure(closed, cvdSeries, opts);

  // Unified v0.50 event listesi (lookback filter)
  const startIdx = closed.length - lookback;
  const events = [...divergences, ...absorptions, ...climactics, ...sustained]
    .filter(ev => {
      // candleIndex 0 = en güncel; geçmişe doğru artar
      // closed.length - 1 - candleIndex = index in closed
      const closedIdx = closed.length - 1 - ev.candleIndex;
      return closedIdx >= startIdx;
    });

  const eventsChronological = [...events].sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
  events.sort((a,b) => (b.score||0) - (a.score||0));

  // Bias: yakın yüksek-skorlu event'ler
  const recent = events.filter(e => e.candleIndex <= 8).slice(0, 6);
  let bullScore = 0, bearScore = 0;
  recent.forEach(e => {
    if (e.side === 'LONG') bullScore += e.score;
    else if (e.side === 'SHORT') bearScore += e.score;
  });
  const bias = bullScore > bearScore * 1.15 ? 'LONG'
             : bearScore > bullScore * 1.15 ? 'SHORT'
             : 'NEUTRAL';

  // Source mode: çoğunluk gerçek mi proxy mi?
  const ss = cvdResult.sourceStats;
  const sourceMode = ss.real > ss.proxy ? 'real' : ss.proxy > ss.real ? 'proxy' : 'mixed';

  return {
    events,
    eventsChronological,
    cvd: cvdResult,
    divergences, absorptions, climactics, sustained,
    summary: {
      totalEvents: events.length,
      divergenceCount: divergences.length,
      absorptionCount: absorptions.length,
      climacticCount: climactics.length,
      sustainedCount: sustained.length,
      currentCvd: cvdResult.current?.cvd ?? null,
      currentDelta: cvdResult.current?.delta ?? null,
      sourceMode,
      sourceStats: ss,
      bullScore: round(bullScore, 1),
      bearScore: round(bearScore, 1),
      bias,
      topEvent: events[0] || null,
      lookback,
    },
    guard: {
      closedCount: closed.length,
      skippedOpenCandle: skipped > 0,
      tf, tfMs, now,
    },
    warnings: [],
  };
}

/* ───────── Türkçe etiketler ───────── */
export const DELTA_EVENT_LABEL_TR = Object.freeze({
  DELTA_DIVERGENCE: 'Delta Uyumsuzluğu',
  ABSORPTION: 'Soğurma (Absorption)',
  CLIMACTIC_VOLUME: 'Climactic Hacim',
  SUSTAINED_PRESSURE: 'Sürdürülen Baskı',
});

export const DELTA_SUBTYPE_LABEL_TR = Object.freeze({
  bullish_divergence: 'boğa uyumsuzluğu',
  bearish_divergence: 'ayı uyumsuzluğu',
  buy_absorption: 'alış soğurması',
  sell_absorption: 'satış soğurması',
  climactic_up_exhaustion: 'yukarı tükenme',
  climactic_down_exhaustion: 'aşağı tükenme',
  climactic_up_breakout: 'yukarı kırılım hacmi',
  climactic_down_breakout: 'aşağı kırılım hacmi',
  sustained_buy_pressure: 'sürdürülen alış baskısı',
  sustained_sell_pressure: 'sürdürülen satış baskısı',
});

export const DELTA_SOURCE_LABEL_TR = Object.freeze({
  real: 'Gerçek (Taker Buy)',
  proxy: 'Proxy (Tick Rule)',
  mixed: 'Karışık',
  unknown: 'Bilinmiyor',
});

export const DELTA_ENGINE_VERSION = '0.56.0-live-controls-20260519';
