/* RUx — PA Template & No-Trade Integration
 * ─────────────────────────────────────────────────────────
 * v0.50 (PA Feature Engine) + v0.51 (Market Structure) + v0.52 (Order Flow)
 * üzerine kurulu. Aşağıdaki 4 SMC template'ini composite event olarak üretir,
 * her birini rux_core.noTradeDecision filtresinden geçirir.
 *
 * Template'ler:
 *
 *   1) SWEEP_REVERSAL
 *      Liquidity sweep + reclaim → CHoCH veya hızlı dönüş PA candle
 *      Trigger: LIQUIDITY_SWEEP event + son N mum içinde CHOCH ters yön
 *               veya güçlü engulfing/pin
 *      Entry: Sweep mumunun kapanış civarı; Stop: Sweep wick'inin ötesi
 *      Hedef: Son swing pivot veya açık FVG
 *
 *   2) TREND_PULLBACK
 *      BOS sonrası geri çekilme + OB midpoint touch
 *      Trigger: BOS event + sonrasında ORDER_BLOCK status=TESTED
 *               veya FVG status=PARTIAL/FILLED
 *      Entry: OB midpoint veya FVG kenarı; Stop: OB'nin ötesi
 *      Hedef: BOS displacement extension (1.0R, 2.0R)
 *
 *   3) BREAKOUT_RETEST
 *      BOS displacement + FVG → FVG retest
 *      Trigger: BOS event + aynı yönde FVG (open veya partial)
 *      Entry: FVG kenarı; Stop: FVG ortasının diğer tarafı
 *      Hedef: 1.0R, 2.0R extension
 *
 *   4) RANGE_ROTATION
 *      Equal high + equal low arasında range yapısı; mean reversion
 *      Trigger: Equal levels (high VE low) son lookback'te aktif,
 *               structure bias = RANGE veya NEUTRAL
 *      Entry: Range kenarına yakın; Stop: range dışına ufak
 *      Hedef: Range'in karşı kenarı
 *
 * Her template şu structure'da composite event döner:
 *   {
 *     type: 'TEMPLATE',
 *     subtype: 'SWEEP_REVERSAL' | 'TREND_PULLBACK' | 'BREAKOUT_RETEST' | 'RANGE_ROTATION',
 *     side: 'LONG' | 'SHORT',
 *     score: 0..100,
 *     plan: { entry, stop, target1, target2, riskR, rr },
 *     evidence: { triggers: [event...], structureBias, ... },
 *     noTrade: { blocked, label, hardBlocks, softWarnings, score },
 *     finalScore: { score, label },
 *     timestamp,
 *     noRepaint: true
 *   }
 *
 * No-repaint: tüm girdi event'ler zaten kapalı mum garantili; template
 * sadece composition yapar, kendi lookahead'i yok.
 */

import { isClosedCandle, tfToMs } from './pa_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { runStructureEngine } from './structure_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { runOrderFlowEngine } from './order_flow_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { runFeatureEngine } from './pa_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { noTradeDecision, finalSignalScore } from './rux_core.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { runVolumeEngine, priceLevelConfluence } from './volume_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { runDeltaEngine } from './delta_engine.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';

/* ───────── Yardımcılar ───────── */
function num(x){ return Number.isFinite(Number(x)) ? Number(x) : NaN; }
function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }

function computeAvgRange(candles, n=20) {
  const slice = candles.slice(-Math.min(n+1, candles.length), -1);
  const ranges = slice.map(c => num(c.high) - num(c.low)).filter(Number.isFinite);
  return ranges.length ? ranges.reduce((a,b)=>a+b,0)/ranges.length : 0;
}

/* ───────── Sabitler ───────── */
export const TPL_CONST = Object.freeze({
  // Sweep reversal: sweep'ten sonra confirm aramak için maksimum mum
  SWEEP_REVERSAL_CONFIRM_BARS: 4,
  // Trend pullback: BOS sonrası retracement araması penceresi
  TREND_PULLBACK_LOOKAHEAD: 25,
  // Breakout retest: BOS sonrası FVG retest araması
  BREAKOUT_RETEST_LOOKAHEAD: 20,
  // Range rotation: minimum range height (avgRange × bu kat)
  RANGE_MIN_HEIGHT_ATR: 2.0,
  // Risk-reward minimum (yoksa template invalid)
  MIN_RR: 1.3,
  // Default cost profile for net R calculation
  DEFAULT_COST_R: 0.20,
});

/* ───────── Template 1: SWEEP_REVERSAL ─────────
 *
 * Mantık:
 *   - Lookback içinde LIQUIDITY_SWEEP event'i bul
 *   - Sweep'i takip eden mumlar içinde aynı yönde:
 *     * CHOCH event'i (structure flip), VEYA
 *     * Güçlü engulfing/pin/hammer/shooting_star (PA confirmation)
 *   - Bulunduysa setup üret
 *
 * Entry: Sweep mumunun close'u
 * Stop: Sweep mumunun wick uç noktası + 0.3 × ATR buffer
 * Target 1: 1R
 * Target 2: Son swing pivot (LONG için recentSwingHigh, SHORT için recentSwingLow)
 *           veya yoksa 2.5R
 */
export function detectSweepReversal({ candles, paResult, structResult, ofResult, opts={} }) {
  const confirmBars = opts.confirmBars ?? TPL_CONST.SWEEP_REVERSAL_CONFIRM_BARS;
  const avgRange = computeAvgRange(candles);
  const templates = [];

  // Sweep event'lerini structure'da bulamayız; ofResult.sweeps üzerinden gidiyoruz
  ofResult.sweeps.forEach(sw => {
    const sweepIdx = sw.sweepAtIndex;
    const sweepSide = sw.side; // LONG ya da SHORT

    // Sweep'ten sonraki confirm penceresi
    const confirmStart = sweepIdx + 1;
    const confirmEnd = Math.min(candles.length, sweepIdx + confirmBars + 1);

    // CHOCH veya kaliteli reversal candle ara
    let confirmation = null;

    // Structure events: CHOCH'u arar (structure flip)
    const chochInWindow = structResult.eventsChronological.find(e =>
      e.type === 'CHOCH' && e.side === sweepSide &&
      candles.findIndex(c => (c.time ?? c.openTime) === e.timestamp) >= confirmStart &&
      candles.findIndex(c => (c.time ?? c.openTime) === e.timestamp) < confirmEnd
    );
    if (chochInWindow) {
      confirmation = { kind: 'CHOCH', event: chochInWindow };
    }

    // PA reversal events: engulfing, hammer, pin, three_bar
    if (!confirmation) {
      const paInWindow = paResult.events.find(e => {
        if (e.side !== sweepSide) return false;
        const evIdx = candles.findIndex(c => (c.time ?? c.openTime) === e.timestamp);
        if (evIdx < confirmStart || evIdx >= confirmEnd) return false;
        return ['ENGULFING','HAMMER','SHOOTING_STAR','PIN_BAR','THREE_BAR_REVERSAL'].includes(e.type);
      });
      if (paInWindow) confirmation = { kind: 'PA', event: paInWindow };
    }

    if (!confirmation) return;

    // Setup'ı oluştur
    const entryCandle = candles[sweepIdx];
    const entry = num(entryCandle.close);
    const stopBuffer = avgRange * 0.3;
    const stop = sweepSide === 'LONG'
      ? num(entryCandle.low) - stopBuffer    // wick'in altı
      : num(entryCandle.high) + stopBuffer;  // wick'in üstü
    const stopDistance = Math.abs(entry - stop);
    if (stopDistance <= 0) return;

    const target1 = sweepSide === 'LONG' ? entry + stopDistance : entry - stopDistance;
    // Target 2: structure'daki son ters yön pivot
    const oppPivot = sweepSide === 'LONG'
      ? structResult.structure.lastSwingHigh
      : structResult.structure.lastSwingLow;
    let target2;
    if (oppPivot?.price) {
      target2 = oppPivot.price;
    } else {
      target2 = sweepSide === 'LONG' ? entry + stopDistance * 2.5 : entry - stopDistance * 2.5;
    }
    const target2Distance = Math.abs(target2 - entry);
    const rr = round(target2Distance / stopDistance, 2);

    // Setup skor: sweep penetration + confirmation skor + RR
    const setupScore = clamp(
      45 +
      sw.penetrationPctOfAtr * 0.3 +
      confirmation.event.score * 0.35 +
      Math.min(rr, 4) * 6
    );

    // No-trade kontrolü
    const noTrade = noTradeDecision({
      rr,
      dataConfidence: 80,
      manipulationRisk: sw.penetrationPctOfAtr > 50 ? 45 : 25, // büyük sweep daha riskli
      spreadBps: 6,
      entryLate: false,
      stopClear: true,
      regimeUncertainty: structResult.summary.bias === 'NEUTRAL' ? 60 : 30,
      macroEventRisk: false,
    });

    const final = finalSignalScore({
      setup: setupScore,
      regime: structResult.summary.bias === sweepSide ? 65 : 75, // sweep ters yönde olduğunda extra kredisi
      confirmation: confirmation.event.score,
      execution: 75,
      rr: clamp(rr * 18),
      noTrade,
    });

    templates.push({
      type: 'TEMPLATE',
      subtype: 'SWEEP_REVERSAL',
      side: sweepSide,
      score: round(setupScore, 1),
      candleIndex: candles.length - 1 - sweepIdx,
      timestamp: sw.sweepTimestamp,
      plan: {
        entry: round(entry, 4),
        stop: round(stop, 4),
        target1: round(target1, 4),
        target2: round(target2, 4),
        stopDistance: round(stopDistance, 4),
        rr,
      },
      evidence: {
        sweepType: sw.subtype,
        sweepTargetLevel: sw.targetLevel,
        sweepPenetrationPctAtr: sw.penetrationPctOfAtr,
        confirmation: {
          kind: confirmation.kind,
          eventType: confirmation.event.type,
          eventScore: confirmation.event.score,
          eventSubtype: confirmation.event.subtype,
        },
        structureBias: structResult.summary.bias,
      },
      noTrade,
      finalScore: final,
      noRepaint: true,
    });
  });

  return templates;
}

/* ───────── Template 2: TREND_PULLBACK ─────────
 *
 * Mantık:
 *   - BOS event'i bul (initial veya continuation)
 *   - BOS'tan sonra aynı yönde Order Block status=TESTED veya FVG status=PARTIAL/FILLED
 *   - Entry: OB midpoint (varsa) veya FVG kenarı
 *   - Stop: OB'nin altı/üstü + buffer
 *   - Target: BOS displacement * 1.0 ve * 2.0
 */
export function detectTrendPullback({ candles, paResult, structResult, ofResult, opts={} }) {
  const lookahead = opts.lookahead ?? TPL_CONST.TREND_PULLBACK_LOOKAHEAD;
  const avgRange = computeAvgRange(candles);
  const templates = [];

  // BOS event'leri al (yalnızca devam veya initial trend)
  const bosEvents = structResult.eventsChronological.filter(e => e.type === 'BOS');

  bosEvents.forEach(bos => {
    const bosIdx = candles.findIndex(c => (c.time ?? c.openTime) === bos.timestamp);
    if (bosIdx < 0) return;
    const bosCandle = candles[bosIdx];
    const bosBody = Math.abs(num(bosCandle.close) - num(bosCandle.open));
    const bosRange = num(bosCandle.high) - num(bosCandle.low);
    if (bosBody <= 0) return;

    // BOS'tan sonra aynı yönde retest aday'ı ara
    const obAfter = ofResult.orderBlocks.find(ob =>
      ob.bosTimestamp === bos.timestamp &&
      ob.side === bos.side &&
      (ob.status === 'TESTED' || ob.status === 'PENDING')
    );

    // FVG retest: aynı yönde, BOS'tan sonra oluşmuş, status PARTIAL
    const fvgAfter = ofResult.fvgs.all.find(f =>
      f.side === bos.side &&
      f.createdAtIndex > bosIdx &&
      f.createdAtIndex < bosIdx + lookahead &&
      (f.status === 'PARTIAL' || f.status === 'FILLED')
    );

    if (!obAfter && !fvgAfter) return;

    const useOb = !!obAfter;
    const entry = useOb ? obAfter.midpoint : (bos.side === 'LONG' ? fvgAfter.bottom : fvgAfter.top);
    const stopBuffer = avgRange * 0.4;
    const stop = bos.side === 'LONG'
      ? (useOb ? obAfter.bottom - stopBuffer : fvgAfter.bottom - stopBuffer)
      : (useOb ? obAfter.top + stopBuffer    : fvgAfter.top    + stopBuffer);
    const stopDistance = Math.abs(entry - stop);
    if (stopDistance <= 0) return;

    // Target: BOS displacement extension
    const bosClose = num(bosCandle.close);
    const target1 = bos.side === 'LONG'
      ? bosClose + bosBody * 1.0
      : bosClose - bosBody * 1.0;
    const target2 = bos.side === 'LONG'
      ? bosClose + bosBody * 2.0
      : bosClose - bosBody * 2.0;
    const target2Distance = Math.abs(target2 - entry);
    const rr = round(target2Distance / stopDistance, 2);

    const setupScore = clamp(
      50 +
      bos.score * 0.25 +
      (useOb ? 18 : 10) +
      Math.min(rr, 4) * 5
    );

    const noTrade = noTradeDecision({
      rr,
      dataConfidence: 80,
      manipulationRisk: 20,
      spreadBps: 6,
      entryLate: false,
      stopClear: true,
      regimeUncertainty: structResult.summary.bias === bos.side ? 25 : 55,
      macroEventRisk: false,
    });

    const final = finalSignalScore({
      setup: setupScore,
      regime: structResult.summary.bias === bos.side ? 85 : 60,
      confirmation: useOb ? 80 : 70,
      execution: 75,
      rr: clamp(rr * 18),
      noTrade,
    });

    templates.push({
      type: 'TEMPLATE',
      subtype: 'TREND_PULLBACK',
      side: bos.side,
      score: round(setupScore, 1),
      candleIndex: candles.length - 1 - bosIdx,
      timestamp: useOb ? obAfter.createdTimestamp : fvgAfter.createdTimestamp,
      plan: {
        entry: round(entry, 4),
        stop: round(stop, 4),
        target1: round(target1, 4),
        target2: round(target2, 4),
        stopDistance: round(stopDistance, 4),
        rr,
      },
      evidence: {
        bosScore: bos.score,
        bosSubtype: bos.subtype,
        retestSource: useOb ? 'ORDER_BLOCK' : 'FVG',
        retestStatus: useOb ? obAfter.status : fvgAfter.status,
        bosBody: round(bosBody, 4),
        structureBias: structResult.summary.bias,
      },
      noTrade,
      finalScore: final,
      noRepaint: true,
    });
  });

  return templates;
}

/* ───────── Template 3: BREAKOUT_RETEST ─────────
 *
 * Mantık:
 *   - BOS event'i bul
 *   - Aynı yönde, BOS sonrası oluşmuş açık FVG (status=OPEN)
 *   - Henüz retest olmamış (status=OPEN, partial değil)
 *   - Setup: fiyat FVG'ye geri dönerse uzun/short al
 *
 * Trend_pullback'ten farkı: bu pre-emptive — henüz retest olmamış, beklemede
 */
export function detectBreakoutRetest({ candles, paResult, structResult, ofResult, opts={} }) {
  const lookahead = opts.lookahead ?? TPL_CONST.BREAKOUT_RETEST_LOOKAHEAD;
  const avgRange = computeAvgRange(candles);
  const templates = [];

  const bosEvents = structResult.eventsChronological.filter(e => e.type === 'BOS');

  bosEvents.forEach(bos => {
    const bosIdx = candles.findIndex(c => (c.time ?? c.openTime) === bos.timestamp);
    if (bosIdx < 0) return;
    const bosCandle = candles[bosIdx];
    const bosBody = Math.abs(num(bosCandle.close) - num(bosCandle.open));

    // OPEN FVG aynı yönde, BOS sonrası
    const openFvg = ofResult.fvgs.all.find(f =>
      f.side === bos.side &&
      f.createdAtIndex >= bosIdx &&
      f.createdAtIndex < bosIdx + lookahead &&
      f.status === 'OPEN'
    );
    if (!openFvg) return;

    const entry = bos.side === 'LONG' ? openFvg.top : openFvg.bottom;
    const stopBuffer = avgRange * 0.3;
    const stop = bos.side === 'LONG'
      ? openFvg.bottom - stopBuffer
      : openFvg.top + stopBuffer;
    const stopDistance = Math.abs(entry - stop);
    if (stopDistance <= 0) return;

    const bosClose = num(bosCandle.close);
    const target1 = bos.side === 'LONG' ? bosClose + bosBody : bosClose - bosBody;
    const target2 = bos.side === 'LONG' ? bosClose + bosBody*2 : bosClose - bosBody*2;
    const target2Distance = Math.abs(target2 - entry);
    const rr = round(target2Distance / stopDistance, 2);

    const setupScore = clamp(
      48 +
      bos.score * 0.25 +
      openFvg.sizePctOfAtr * 0.3 +
      Math.min(rr, 4) * 5
    );

    const noTrade = noTradeDecision({
      rr,
      dataConfidence: 80,
      manipulationRisk: 20,
      spreadBps: 6,
      entryLate: false,
      stopClear: true,
      regimeUncertainty: structResult.summary.bias === bos.side ? 25 : 50,
      macroEventRisk: false,
    });

    const final = finalSignalScore({
      setup: setupScore,
      regime: structResult.summary.bias === bos.side ? 80 : 60,
      confirmation: clamp(50 + openFvg.sizePctOfAtr * 0.5),
      execution: 72,
      rr: clamp(rr * 18),
      noTrade,
    });

    templates.push({
      type: 'TEMPLATE',
      subtype: 'BREAKOUT_RETEST',
      side: bos.side,
      score: round(setupScore, 1),
      candleIndex: candles.length - 1 - openFvg.createdAtIndex,
      timestamp: openFvg.createdTimestamp,
      plan: {
        entry: round(entry, 4),
        stop: round(stop, 4),
        target1: round(target1, 4),
        target2: round(target2, 4),
        stopDistance: round(stopDistance, 4),
        rr,
      },
      evidence: {
        bosScore: bos.score,
        bosSubtype: bos.subtype,
        fvgTop: openFvg.top,
        fvgBottom: openFvg.bottom,
        fvgSizePctAtr: openFvg.sizePctOfAtr,
        fvgStatus: openFvg.status,
        structureBias: structResult.summary.bias,
      },
      noTrade,
      finalScore: final,
      noRepaint: true,
    });
  });

  return templates;
}

/* ───────── Template 4: RANGE_ROTATION ─────────
 *
 * Mantık:
 *   - Aktif equal_highs VE equal_lows (her ikisi de) varsa
 *   - Aralarındaki mesafe ≥ RANGE_MIN_HEIGHT_ATR × avgRange
 *   - Structure bias: RANGE veya NEUTRAL (trend dışı)
 *   - Fiyat range'in bir kenarına yakın → karşı kenara mean reversion
 */
export function detectRangeRotation({ candles, paResult, structResult, ofResult, opts={} }) {
  const minHeight = (opts.minHeightAtr ?? TPL_CONST.RANGE_MIN_HEIGHT_ATR) * computeAvgRange(candles);
  const templates = [];

  const eqHighs = ofResult.equalLevels.filter(eq => eq.subtype === 'equal_highs');
  const eqLows  = ofResult.equalLevels.filter(eq => eq.subtype === 'equal_lows');
  if (!eqHighs.length || !eqLows.length) return templates;

  // Best high/low cluster: en yüksek touch count, en yeni
  const bestHigh = eqHighs.sort((a,b)=>(b.touchCount-a.touchCount) || (b.lastTouchIndex-a.lastTouchIndex))[0];
  const bestLow  = eqLows.sort((a,b)=>(b.touchCount-a.touchCount)  || (b.lastTouchIndex-a.lastTouchIndex))[0];
  const rangeHeight = bestHigh.level - bestLow.level;
  if (rangeHeight < minHeight) return templates;

  // Structure izni
  if (structResult.summary.bias !== 'RANGE' &&
      structResult.summary.bias !== 'NEUTRAL' &&
      structResult.summary.bias !== 'MIXED') {
    // Trending environment — range rotation güvensiz; skip
    return templates;
  }

  // Fiyat şu an nerede?
  const lastClose = num(candles[candles.length-1].close);
  const distToHigh = Math.abs(bestHigh.level - lastClose);
  const distToLow  = Math.abs(lastClose - bestLow.level);
  const closerToLow  = distToLow < distToHigh;
  const closerToHigh = distToHigh < distToLow;
  const halfHeight = rangeHeight / 2;

  // Sadece kenarda mı kontrol et — en az %60'lık ilerleme bir tarafa yakın
  if (Math.min(distToHigh, distToLow) > halfHeight * 0.6) {
    return templates; // ortada → trade yok
  }

  // LONG setup: low'a yakın, hedef high
  if (closerToLow) {
    const entry = bestLow.level;
    const stop = bestLow.level - bestLow.toleranceUsed * 2;
    const stopDistance = entry - stop;
    if (stopDistance <= 0) return templates;
    const target1 = entry + rangeHeight * 0.5;
    const target2 = bestHigh.level;
    const rr = round((target2 - entry) / stopDistance, 2);

    const setupScore = clamp(
      45 +
      bestLow.touchCount * 8 +
      bestHigh.touchCount * 6 +
      Math.min(rr, 4) * 5
    );

    const noTrade = noTradeDecision({
      rr,
      dataConfidence: 75,
      manipulationRisk: 30,
      spreadBps: 8,
      entryLate: false,
      stopClear: true,
      regimeUncertainty: 50,
      macroEventRisk: false,
    });

    const final = finalSignalScore({
      setup: setupScore,
      regime: 60,
      confirmation: 65,
      execution: 70,
      rr: clamp(rr * 18),
      noTrade,
    });

    templates.push({
      type: 'TEMPLATE',
      subtype: 'RANGE_ROTATION',
      side: 'LONG',
      score: round(setupScore, 1),
      candleIndex: 0,
      timestamp: candles[candles.length-1].time ?? null,
      plan: {
        entry: round(entry, 4),
        stop: round(stop, 4),
        target1: round(target1, 4),
        target2: round(target2, 4),
        stopDistance: round(stopDistance, 4),
        rr,
      },
      evidence: {
        rangeHigh: bestHigh.level,
        rangeLow: bestLow.level,
        rangeHeight: round(rangeHeight, 4),
        highTouches: bestHigh.touchCount,
        lowTouches: bestLow.touchCount,
        structureBias: structResult.summary.bias,
      },
      noTrade,
      finalScore: final,
      noRepaint: true,
    });
  }

  // SHORT setup: high'a yakın, hedef low
  if (closerToHigh) {
    const entry = bestHigh.level;
    const stop = bestHigh.level + bestHigh.toleranceUsed * 2;
    const stopDistance = stop - entry;
    if (stopDistance <= 0) return templates;
    const target1 = entry - rangeHeight * 0.5;
    const target2 = bestLow.level;
    const rr = round((entry - target2) / stopDistance, 2);

    const setupScore = clamp(
      45 +
      bestHigh.touchCount * 8 +
      bestLow.touchCount * 6 +
      Math.min(rr, 4) * 5
    );

    const noTrade = noTradeDecision({
      rr,
      dataConfidence: 75,
      manipulationRisk: 30,
      spreadBps: 8,
      entryLate: false,
      stopClear: true,
      regimeUncertainty: 50,
      macroEventRisk: false,
    });

    const final = finalSignalScore({
      setup: setupScore,
      regime: 60,
      confirmation: 65,
      execution: 70,
      rr: clamp(rr * 18),
      noTrade,
    });

    templates.push({
      type: 'TEMPLATE',
      subtype: 'RANGE_ROTATION',
      side: 'SHORT',
      score: round(setupScore, 1),
      candleIndex: 0,
      timestamp: candles[candles.length-1].time ?? null,
      plan: {
        entry: round(entry, 4),
        stop: round(stop, 4),
        target1: round(target1, 4),
        target2: round(target2, 4),
        stopDistance: round(stopDistance, 4),
        rr,
      },
      evidence: {
        rangeHigh: bestHigh.level,
        rangeLow: bestLow.level,
        rangeHeight: round(rangeHeight, 4),
        highTouches: bestHigh.touchCount,
        lowTouches: bestLow.touchCount,
        structureBias: structResult.summary.bias,
      },
      noTrade,
      finalScore: final,
      noRepaint: true,
    });
  }

  return templates;
}

/* ───────── Ana API: runTemplateEngine ─────────
 *
 * Tüm 4 template'i çalıştırır, no-trade filtresinden geçirir, sıralı döner.
 * Üç motoru (PA, Structure, OF) internal olarak çağırır (zaten ofResult.structure
 * pass-through eder).
 *
 * Dönüş: {
 *   templates: [...],       // skora göre sıralı, no-trade engellenmiş olanlar dahil
 *   active: [...],          // no-trade engellenmemiş olanlar
 *   blocked: [...],         // no-trade engellenmiş olanlar (transparency için)
 *   summary, guard, warnings
 * }
 */
export function runTemplateEngine(candles = [], opts = {}) {
  const tf = opts.tf || '4h';
  const lookback = opts.lookback || 60;
  const pivotLen = opts.pivotLen || 3;
  const now = opts.now ?? Date.now();
  const tfMs = tfToMs(tf);

  if (candles.length < 20) {
    return {
      templates: [], active: [], blocked: [],
      summary: { totalTemplates:0, activeCount:0, blockedCount:0, topTemplate:null },
      guard: { closedCount: 0, skippedOpenCandle: false, tf, tfMs },
      warnings: ['Yetersiz mum verisi (min 20 mum gerekli).'],
    };
  }

  // No-repaint guard
  const lastRaw = candles[candles.length - 1];
  const lastClosed = isClosedCandle(lastRaw, tfMs, now);
  const closed = lastClosed ? candles : candles.slice(0, -1);
  const skipped = candles.length - closed.length;

  // Üç motoru çalıştır
  const paResult = runFeatureEngine(closed, { tf, lookback, now });
  const ofResult = runOrderFlowEngine(closed, { tf, pivotLen, lookback, now });
  const structResult = ofResult.structure; // OF zaten structure'ı içeriyor

  // v0.54: Volume engine (VP + VWAP + Day Type)
  const volResult = runVolumeEngine(closed, { tf, binCount: 50, now });

  // v0.55: Delta engine (CVD, divergences, absorption, climactic, sustained)
  const deltaResult = runDeltaEngine(closed, { tf, lookback, now });

  // 4 template'i çalıştır
  const ctx = { candles: closed, paResult, structResult, ofResult, volResult, deltaResult, opts };
  const sweepRev   = detectSweepReversal(ctx);
  const trendPb    = detectTrendPullback(ctx);
  const brkRetest  = detectBreakoutRetest(ctx);
  const rangeRot   = detectRangeRotation(ctx);

  // Hepsini birleştir
  const all = [...sweepRev, ...trendPb, ...brkRetest, ...rangeRot];

  // v0.54: Her template için entry / target2 / stop seviyelerinde
  // VP/VWAP confluence ölç ve finalScore'a katkı yap.
  const atrTolerance = computeAvgRange(closed) * 0.25;
  all.forEach(t => {
    if (!volResult.compositeVP || !volResult.sessionVWAP) {
      t.confluence = null;
      return;
    }
    const entryConf  = priceLevelConfluence(t.plan.entry,   volResult.compositeVP, volResult.sessionVWAP, { atrTolerance });
    const targetConf = priceLevelConfluence(t.plan.target2, volResult.compositeVP, volResult.sessionVWAP, { atrTolerance });
    const stopConf   = priceLevelConfluence(t.plan.stop,    volResult.compositeVP, volResult.sessionVWAP, { atrTolerance });

    // Confluence skoru: entry önemli, target ikinci, stop bilgi amaçlı
    const overall = round(entryConf.score * 0.55 + targetConf.score * 0.35 + stopConf.score * 0.10, 1);
    t.confluence = {
      entry: entryConf,
      target: targetConf,
      stop: stopConf,
      overall,
      label: overall >= 50 ? 'GÜÇLÜ' : overall >= 25 ? 'ORTA' : overall > 0 ? 'ZAYIF' : 'YOK',
      dayType: volResult.summary.dayType,
      location: volResult.summary.location,
    };

    // FinalScore'a katkı: confluence'a göre +0..+15 puan
    if (t.confluence.overall > 0) {
      const boost = Math.min(15, t.confluence.overall * 0.3);
      const adjusted = clamp(t.finalScore.score + boost, 0, 100);
      t.finalScore = {
        ...t.finalScore,
        score: round(adjusted, 1),
        confluenceBoost: round(boost, 1),
        rawScore: t.finalScore.score,
      };
    }

    // Day Type filter: Trend Day'lerde RANGE_ROTATION otomatik soft-warning
    if (t.subtype === 'RANGE_ROTATION' && volResult.summary.dayType === 'TREND_DAY') {
      t.noTrade.softWarnings = [...(t.noTrade.softWarnings || []), 'TREND_DAY_RANGE_UYUMSUZ'];
      // Skoru düşür ama bloklama
      t.finalScore = {
        ...t.finalScore,
        score: round(clamp(t.finalScore.score - 12, 0, 100), 1),
        dayTypeAdjusted: true,
      };
    }

    // v0.55: Delta / CVD confirmation
    // Template'in side'ı ile delta bias uyumlu mu? Yakın divergence / absorption / climactic event'i var mı?
    if (deltaResult && deltaResult.summary) {
      const dBias = deltaResult.summary.bias;
      const aligned = dBias !== 'NEUTRAL' && dBias === t.side;
      const conflicted = dBias !== 'NEUTRAL' && dBias !== t.side;

      // Nearby supporting delta event aramak: timestamp template'ten geriye max 10 mum
      const tplTs = t.timestamp || 0;
      const nearbyEvents = (deltaResult.events || []).filter(de => {
        const tsOk = de.timestamp != null && tplTs != null
          && Math.abs(de.timestamp - tplTs) <= tfMs * 10;
        return tsOk && de.side === t.side;
      });
      const opposingEvents = (deltaResult.events || []).filter(de => {
        const tsOk = de.timestamp != null && tplTs != null
          && Math.abs(de.timestamp - tplTs) <= tfMs * 10;
        return tsOk && de.side !== t.side && de.side !== 'NEUTRAL';
      });

      const deltaSupportScore = nearbyEvents.reduce((s, e) => s + (e.score || 0), 0);
      const deltaOpposeScore = opposingEvents.reduce((s, e) => s + (e.score || 0), 0);
      const netDelta = deltaSupportScore - deltaOpposeScore;

      t.deltaConfirmation = {
        bias: dBias,
        aligned,
        conflicted,
        supportingEvents: nearbyEvents.map(e => ({
          type: e.type, subtype: e.subtype, score: e.score, candleIndex: e.candleIndex,
        })),
        opposingEvents: opposingEvents.map(e => ({
          type: e.type, subtype: e.subtype, score: e.score, candleIndex: e.candleIndex,
        })),
        netScore: round(netDelta, 1),
        sourceMode: deltaResult.summary.sourceMode,
        currentCvd: deltaResult.summary.currentCvd,
        currentDelta: deltaResult.summary.currentDelta,
      };

      // FinalScore'a katkı:
      //   - aligned bias: +5
      //   - supporting events: +0..+10 (capped)
      //   - conflicted bias: -8
      //   - opposing events: -0..-10 (capped)
      let deltaBoost = 0;
      if (aligned) deltaBoost += 5;
      if (conflicted) deltaBoost -= 8;
      deltaBoost += Math.min(10, deltaSupportScore * 0.05);
      deltaBoost -= Math.min(10, deltaOpposeScore * 0.05);
      deltaBoost = round(deltaBoost, 1);

      if (deltaBoost !== 0) {
        const before = t.finalScore.score;
        const adjusted = round(clamp(before + deltaBoost, 0, 100), 1);
        t.finalScore = {
          ...t.finalScore,
          score: adjusted,
          deltaBoost,
          preDeltaScore: before,
        };
      }
    }
  });

  // Skora göre sırala — finalScore.score öncelikli, sonra raw score
  all.sort((a,b) => {
    const fa = a.finalScore?.score ?? 0;
    const fb = b.finalScore?.score ?? 0;
    if (fa !== fb) return fb - fa;
    return (b.score || 0) - (a.score || 0);
  });

  const active = all.filter(t => !t.noTrade.blocked);
  const blocked = all.filter(t => t.noTrade.blocked);

  return {
    templates: all,
    active,
    blocked,
    summary: {
      totalTemplates: all.length,
      activeCount: active.length,
      blockedCount: blocked.length,
      byType: {
        SWEEP_REVERSAL: sweepRev.length,
        TREND_PULLBACK: trendPb.length,
        BREAKOUT_RETEST: brkRetest.length,
        RANGE_ROTATION: rangeRot.length,
      },
      topTemplate: active[0] || all[0] || null,
      lookback,
    },
    engines: { paResult, structResult, ofResult, volResult, deltaResult },
    guard: {
      closedCount: closed.length,
      skippedOpenCandle: skipped > 0,
      tf, tfMs, now,
    },
    warnings: [],
  };
}

/* ───────── Türkçe Etiketler ───────── */
export const TPL_LABEL_TR = Object.freeze({
  SWEEP_REVERSAL:  'Likidite Süpürme Dönüşü',
  TREND_PULLBACK:  'Trend Geri Çekilmesi',
  BREAKOUT_RETEST: 'Kırılım Geri Testi',
  RANGE_ROTATION:  'Range Rotasyonu',
});

export const TPL_DESC_TR = Object.freeze({
  SWEEP_REVERSAL:  'Likidite süpürme + reclaim + confirm (CHoCH veya PA rejection)',
  TREND_PULLBACK:  'BOS sonrası OB / FVG retest ile trend devamı',
  BREAKOUT_RETEST: 'BOS sonrası açık FVG\'ye geri test bekleniyor',
  RANGE_ROTATION:  'Equal high & low arasında range; karşı kenara mean reversion',
});

export const TEMPLATE_ENGINE_VERSION = '0.56.0-live-controls-20260519';
