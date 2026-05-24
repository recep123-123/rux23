/* RUx — FVG / Order Block / Liquidity Sweep Engine
 * ─────────────────────────────────────────────────────────────
 * v0.50 PA Feature Engine + v0.51 Market Structure Engine'in üzerine
 * kuruludur. SMC (Smart Money Concepts) imbalance ve likidite mekaniği.
 *
 * Tanımlar:
 *
 *  FVG (Fair Value Gap / Imbalance):
 *    3-mum pencerede oluşan price gap. İki tipi var:
 *      - Bullish FVG: candle[i-1].high < candle[i+1].low
 *        (orta mumun altında kalan gap, alıcı imbalance)
 *      - Bearish FVG: candle[i-1].low > candle[i+1].high
 *        (orta mumun üstünde kalan gap, satıcı imbalance)
 *    FVG durumu zaman içinde değişir:
 *      - OPEN: hiçbir mum gap içine tam dokunmadı
 *      - PARTIAL: fitil gap'in içine girdi ama tam kapatmadı
 *      - FILLED: kapanış gap'in karşı kenarını geçti
 *
 *  Order Block (OB):
 *    Güçlü bir BOS hareketinden önceki son ters-yönlü mum.
 *      - Bullish OB: BOS LONG'dan önceki son bearish mum
 *      - Bearish OB: BOS SHORT'dan önceki son bullish mum
 *    Genelde retest hedefidir; smart money giriş bölgesi olarak
 *    yorumlanır.
 *
 *  Liquidity Sweep (Stop Hunt):
 *    Equal high/low veya swing seviyesinin ÜSTÜNE/ALTINA wick,
 *    sonra geri reclaim. İki tetikleyici:
 *      - Sell-side sweep (LONG yön): swing low veya equal-low'un
 *        altına fitil, ama kapanış üstte
 *      - Buy-side sweep (SHORT yön): swing high'un üstüne fitil,
 *        ama kapanış altta
 *
 * No-repaint:
 *   - FVG yalnızca 3-mum window'un kapandığı anda (i+1 closed) emit
 *   - OB yalnızca BOS confirmed olduktan sonra retroaktif işaretlenir
 *     ama emit timestamp'i BOS mum kapanışıdır (no lookahead leak)
 *   - Sweep yalnızca confirmed pivot + kapanmış sweep mumu üstünde
 */

import { isClosedCandle, tfToMs } from './pa_engine.js?v=0.75.2-funding-responsive-live-20260524';
import { findConfirmedPivots, runStructureEngine } from './structure_engine.js?v=0.75.2-funding-responsive-live-20260524';

/* ───────── Yardımcılar ───────── */
function num(x){ return Number.isFinite(Number(x)) ? Number(x) : NaN; }
function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }

/* ───────── Sabitler ───────── */
export const OF_CONST = Object.freeze({
  // FVG minimum size: avgRange'ın bu yüzdesi kadar olmalı (mikro gap'leri ele)
  FVG_MIN_SIZE_PCT: 15,        // avgRange × 0.15
  // FVG geçerlilik penceresi (mum sayısı) — bundan eski FVG'ler "expired" sayılır
  FVG_VALIDITY_BARS: 50,
  // Order block minimum body % (zayıf OB'leri ele)
  OB_MIN_BODY_PCT: 25,
  // Order block sonrası BOS body büyüklüğü minimum (avgRange × bu kat)
  OB_DISPLACEMENT_ATR_MULT: 1.0,
  // OB max lookback (BOS'tan önce kaç mum geriye bakılacak)
  OB_LOOKBACK_BARS: 12,
  // Equal high/low tolerance (avgRange × bu yüzdesi)
  EQ_LEVEL_TOLERANCE_PCT: 8,   // avgRange × 0.08
  // Equal high/low minimum touch count
  EQ_LEVEL_MIN_TOUCHES: 2,
  // Sweep wick minimum penetration (avgRange × bu yüzde)
  SWEEP_WICK_MIN_PCT: 10,
  // Sweep reclaim minimum close position
  SWEEP_RECLAIM_CLOSE_POS_MIN: 55,  // long sweep için: close ≥ %55 of range
  SWEEP_RECLAIM_CLOSE_POS_MAX: 45,  // short sweep için: close ≤ %45 of range
});

/* ───────── Ortalama Range Hesabı (ATR proxy) ───────── */
function computeAvgRange(candles, n = 20) {
  const ranges = candles.slice(-Math.min(n+1, candles.length), -1)
    .map(c => num(c.high) - num(c.low))
    .filter(Number.isFinite);
  return ranges.length ? ranges.reduce((a,b)=>a+b,0)/ranges.length : 0;
}

/* ───────── FVG Detector ─────────
 *
 * 3-mum kayan pencere. i-1, i, i+1 dizininde:
 *   Bullish FVG: high[i-1] < low[i+1]  →  gap [high[i-1], low[i+1]]
 *   Bearish FVG: low[i-1]  > high[i+1] →  gap [high[i+1], low[i-1]]
 *
 * Yalnızca i+1 closed olduğunda emit edilir.
 *
 * Dönüş: { events, openFvgs } — events kronolojik, openFvgs hala dolmamış olanlar
 */
export function detectFvgs(candles = [], opts = {}) {
  const minSizeAtrMult = opts.minSizeAtrMult ?? (OF_CONST.FVG_MIN_SIZE_PCT / 100);
  const validityBars = opts.validityBars ?? OF_CONST.FVG_VALIDITY_BARS;
  const avgRange = computeAvgRange(candles);
  const minSize = avgRange * minSizeAtrMult;

  const all = []; // tüm tespit edilen FVG'ler

  // i+1 dahil edilmeli — bu yüzden i ≤ length-2
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i-1];
    const next = candles[i+1];
    const c    = candles[i];
    if (!prev || !next || !c) continue;
    const pHigh = num(prev.high), pLow = num(prev.low);
    const nHigh = num(next.high), nLow = num(next.low);
    if (![pHigh,pLow,nHigh,nLow].every(Number.isFinite)) continue;

    // Bullish FVG: gap [pHigh, nLow]
    if (nLow > pHigh) {
      const gapSize = nLow - pHigh;
      if (gapSize >= minSize) {
        all.push({
          type: 'FVG',
          side: 'LONG',
          subtype: 'bullish_fvg',
          createdAtIndex: i+1,
          createdTimestamp: next.time ?? next.openTime ?? null,
          middleCandleIndex: i,
          top: round(nLow, 4),
          bottom: round(pHigh, 4),
          size: round(gapSize, 4),
          sizePctOfAtr: round(avgRange ? (gapSize/avgRange)*100 : 0, 1),
        });
      }
    }
    // Bearish FVG: gap [nHigh, pLow]
    if (pLow > nHigh) {
      const gapSize = pLow - nHigh;
      if (gapSize >= minSize) {
        all.push({
          type: 'FVG',
          side: 'SHORT',
          subtype: 'bearish_fvg',
          createdAtIndex: i+1,
          createdTimestamp: next.time ?? next.openTime ?? null,
          middleCandleIndex: i,
          top: round(pLow, 4),
          bottom: round(nHigh, 4),
          size: round(gapSize, 4),
          sizePctOfAtr: round(avgRange ? (gapSize/avgRange)*100 : 0, 1),
        });
      }
    }
  }

  // FVG state update: her FVG için PARTIAL/FILLED durumunu hesapla
  // FVG'den sonraki tüm mumları tara
  all.forEach(fvg => {
    let status = 'OPEN';
    let filledAtIndex = null, filledAtTimestamp = null;
    let partialAtIndex = null;
    for (let j = fvg.createdAtIndex + 1; j < candles.length; j++) {
      const cand = candles[j];
      const h = num(cand.high), l = num(cand.low), cl = num(cand.close);

      if (fvg.side === 'LONG') {
        // Bullish FVG: top'un altına inerse partial; bottom'un altına kapanırsa filled
        if (status === 'OPEN' && l <= fvg.top) {
          status = 'PARTIAL';
          partialAtIndex = j;
        }
        if (cl <= fvg.bottom) {
          status = 'FILLED';
          filledAtIndex = j;
          filledAtTimestamp = cand.time ?? cand.openTime ?? null;
          break;
        }
      } else {
        // Bearish FVG: bottom'un üstüne çıkarsa partial; top'un üstüne kapanırsa filled
        if (status === 'OPEN' && h >= fvg.bottom) {
          status = 'PARTIAL';
          partialAtIndex = j;
        }
        if (cl >= fvg.top) {
          status = 'FILLED';
          filledAtIndex = j;
          filledAtTimestamp = cand.time ?? cand.openTime ?? null;
          break;
        }
      }
    }
    // Validity expiry check
    const ageFromCreation = (candles.length - 1) - fvg.createdAtIndex;
    if (status !== 'FILLED' && ageFromCreation > validityBars) {
      status = 'EXPIRED';
    }
    fvg.status = status;
    fvg.filledAtIndex = filledAtIndex;
    fvg.filledAtTimestamp = filledAtTimestamp;
    fvg.partialAtIndex = partialAtIndex;
    fvg.ageBars = ageFromCreation;
  });

  const openFvgs = all.filter(f => f.status === 'OPEN' || f.status === 'PARTIAL');
  return { all, openFvgs };
}

/* ───────── Order Block Detector ─────────
 *
 * BOS event'i alındıktan sonra geriye dönük olarak son ters-yönlü mumu işaretler.
 * BOS olayını üretmek için runStructureEngine'in çıktısını kullanıyoruz.
 *
 * Bullish OB: BOS LONG'dan önce, OB_LOOKBACK_BARS içindeki son bearish mum
 * Bearish OB: BOS SHORT'dan önce, OB_LOOKBACK_BARS içindeki son bullish mum
 */
export function detectOrderBlocks(candles = [], structureResult = null, opts = {}) {
  const minBodyPct = opts.minBodyPct ?? OF_CONST.OB_MIN_BODY_PCT;
  const lookback = opts.lookback ?? OF_CONST.OB_LOOKBACK_BARS;
  const displacementMult = opts.displacementAtrMult ?? OF_CONST.OB_DISPLACEMENT_ATR_MULT;
  const avgRange = computeAvgRange(candles);

  if (!structureResult || !Array.isArray(structureResult.eventsChronological)) {
    return [];
  }

  const obs = [];
  // BOS event'lerini izole et (chronological)
  const bosEvents = structureResult.eventsChronological.filter(e => e.type === 'BOS');

  bosEvents.forEach(bos => {
    // BOS mumunu candles içinde bul (timestamp ile)
    const bosIdx = candles.findIndex(c =>
      (c.time ?? c.openTime) === bos.timestamp
    );
    if (bosIdx < 1) return;

    const bosCandle = candles[bosIdx];
    const bosBody = Math.abs(num(bosCandle.close) - num(bosCandle.open));
    if (bosBody < avgRange * displacementMult) return; // displacement zayıf

    // Geriye dön, son ters-yönlü kaliteli mumu bul
    const startScan = Math.max(0, bosIdx - lookback);
    let obCandidate = null, obIndex = -1;

    for (let j = bosIdx - 1; j >= startScan; j--) {
      const c = candles[j];
      const o = num(c.open), cl = num(c.close), h = num(c.high), l = num(c.low);
      const range = Math.max(h - l, 1e-9);
      const body = Math.abs(cl - o);
      const bodyPct = (body/range)*100;
      const isBullCandle = cl > o;
      const isBearCandle = cl < o;

      // BOS LONG için bullish OB = son bear mum
      if (bos.side === 'LONG' && isBearCandle && bodyPct >= minBodyPct) {
        obCandidate = c; obIndex = j; break;
      }
      // BOS SHORT için bearish OB = son bull mum
      if (bos.side === 'SHORT' && isBullCandle && bodyPct >= minBodyPct) {
        obCandidate = c; obIndex = j; break;
      }
    }

    if (!obCandidate) return;

    const obHigh = num(obCandidate.high);
    const obLow  = num(obCandidate.low);
    const obOpen = num(obCandidate.open);
    const obClose = num(obCandidate.close);

    // OB retest durumu: BOS sonrası fiyat OB'ye geri döndü mü?
    let retestStatus = 'PENDING';
    let retestAtIndex = null, retestAtTimestamp = null;
    let breakAfterRetest = false;

    for (let k = bosIdx + 1; k < candles.length; k++) {
      const c = candles[k];
      const h = num(c.high), l = num(c.low), cl = num(c.close);

      if (bos.side === 'LONG') {
        // Bullish OB: fiyat OB high'a temas etti mi?
        if (retestStatus === 'PENDING' && l <= obHigh) {
          retestStatus = 'TESTED';
          retestAtIndex = k;
          retestAtTimestamp = c.time ?? c.openTime ?? null;
        }
        if (cl < obLow) {
          retestStatus = 'INVALIDATED';
          breakAfterRetest = true;
          break;
        }
      } else {
        if (retestStatus === 'PENDING' && h >= obLow) {
          retestStatus = 'TESTED';
          retestAtIndex = k;
          retestAtTimestamp = c.time ?? c.openTime ?? null;
        }
        if (cl > obHigh) {
          retestStatus = 'INVALIDATED';
          breakAfterRetest = true;
          break;
        }
      }
    }

    obs.push({
      type: 'ORDER_BLOCK',
      side: bos.side, // bullish OB = LONG (alıcı bölge)
      subtype: bos.side === 'LONG' ? 'bullish_ob' : 'bearish_ob',
      createdAtIndex: obIndex,
      createdTimestamp: obCandidate.time ?? obCandidate.openTime ?? null,
      bosAtIndex: bosIdx,
      bosTimestamp: bos.timestamp,
      top: round(obHigh, 4),
      bottom: round(obLow, 4),
      open: round(obOpen, 4),
      close: round(obClose, 4),
      midpoint: round((obHigh + obLow)/2, 4),
      status: retestStatus, // PENDING | TESTED | INVALIDATED
      retestAtIndex,
      retestAtTimestamp,
      barsToRetest: retestAtIndex != null ? retestAtIndex - bosIdx : null,
      displacementAtrMult: round(avgRange ? bosBody/avgRange : 0, 2),
      ageBars: (candles.length - 1) - obIndex,
    });
  });

  return obs;
}

/* ───────── Equal High/Low Detector ─────────
 *
 * Yakın fiyat seviyelerinde toplanmış swing high veya low'ları bulur.
 * Likidite havuzu olarak işaretlenir.
 */
export function detectEqualLevels(candles = [], opts = {}) {
  const tolerancePct = opts.tolerancePct ?? OF_CONST.EQ_LEVEL_TOLERANCE_PCT;
  const minTouches = opts.minTouches ?? OF_CONST.EQ_LEVEL_MIN_TOUCHES;
  const pivotLen = opts.pivotLen ?? 3;
  const avgRange = computeAvgRange(candles);
  const tolerance = avgRange * (tolerancePct / 100);

  const pivots = findConfirmedPivots(candles, pivotLen);

  function clusterLevels(pivotsList, kind) {
    const clusters = [];
    pivotsList.forEach(p => {
      let attached = false;
      for (const cl of clusters) {
        if (Math.abs(p.price - cl.avgPrice) <= tolerance) {
          cl.members.push(p);
          cl.avgPrice = cl.members.reduce((s,m)=>s+m.price, 0) / cl.members.length;
          attached = true;
          break;
        }
      }
      if (!attached) clusters.push({ avgPrice: p.price, members: [p], kind });
    });
    return clusters.filter(c => c.members.length >= minTouches);
  }

  const highClusters = clusterLevels(pivots.highs || [], 'HIGH');
  const lowClusters  = clusterLevels(pivots.lows  || [], 'LOW');

  const out = [];
  highClusters.forEach(c => {
    out.push({
      type: 'EQUAL_LEVEL',
      side: 'SHORT', // equal high = buy-side liquidity above (short trigger)
      subtype: 'equal_highs',
      level: round(c.avgPrice, 4),
      touchCount: c.members.length,
      lastTouchIndex: Math.max(...c.members.map(m=>m.index)),
      lastTouchTimestamp: c.members.reduce((acc,m)=>!acc || (m.time||0) > acc ? m.time : acc, null),
      memberIndices: c.members.map(m=>m.index),
      toleranceUsed: round(tolerance, 4),
    });
  });
  lowClusters.forEach(c => {
    out.push({
      type: 'EQUAL_LEVEL',
      side: 'LONG', // equal low = sell-side liquidity below (long trigger)
      subtype: 'equal_lows',
      level: round(c.avgPrice, 4),
      touchCount: c.members.length,
      lastTouchIndex: Math.max(...c.members.map(m=>m.index)),
      lastTouchTimestamp: c.members.reduce((acc,m)=>!acc || (m.time||0) > acc ? m.time : acc, null),
      memberIndices: c.members.map(m=>m.index),
      toleranceUsed: round(tolerance, 4),
    });
  });
  return out;
}

/* ───────── Liquidity Sweep Detector ─────────
 *
 * Bir swing seviyesinin (veya equal level'in) altına/üstüne wick yapan
 * ama kapanışta geri reclaim eden mumları bulur.
 *
 * Tetikleyiciler:
 *   - Sell-side sweep (LONG yön): wick swing low'un altına; close ≥ closePos %55
 *   - Buy-side sweep (SHORT yön): wick swing high'un üstüne; close ≤ closePos %45
 */
export function detectLiquiditySweeps(candles = [], opts = {}) {
  const pivotLen = opts.pivotLen ?? 3;
  const minWickPct = opts.minWickPct ?? OF_CONST.SWEEP_WICK_MIN_PCT;
  const reclaimMin = opts.reclaimMin ?? OF_CONST.SWEEP_RECLAIM_CLOSE_POS_MIN;
  const reclaimMax = opts.reclaimMax ?? OF_CONST.SWEEP_RECLAIM_CLOSE_POS_MAX;
  const avgRange = computeAvgRange(candles);
  const minWickAbs = avgRange * (minWickPct / 100);

  const pivots = findConfirmedPivots(candles, pivotLen);
  const allPivotHighs = pivots.highs;
  const allPivotLows = pivots.lows;

  const sweeps = [];

  for (let i = pivotLen + 1; i < candles.length; i++) {
    const c = candles[i];
    const h = num(c.high), l = num(c.low), cl = num(c.close);
    const o = num(c.open);
    const range = Math.max(h - l, 1e-9);
    const closePos = ((cl - l)/range) * 100;

    // Bu mumun zamanından önce confirmed olmuş pivot'ları al
    const availablePivotHighs = allPivotHighs.filter(p => p.confirmedAtIndex < i && p.index < i);
    const availablePivotLows = allPivotLows.filter(p => p.confirmedAtIndex < i && p.index < i);

    // Sell-side sweep: alt fitil, swing low altına geçti mi?
    const recentLow = availablePivotLows.at(-1);
    if (recentLow) {
      const penetration = recentLow.price - l;
      if (penetration >= minWickAbs && cl > recentLow.price && closePos >= reclaimMin) {
        sweeps.push({
          type: 'LIQUIDITY_SWEEP',
          side: 'LONG',
          subtype: 'sell_side_sweep',
          sweepAtIndex: i,
          sweepTimestamp: c.time ?? c.openTime ?? null,
          targetLevel: round(recentLow.price, 4),
          wickLow: round(l, 4),
          closePrice: round(cl, 4),
          penetration: round(penetration, 4),
          penetrationPctOfAtr: round(avgRange ? (penetration/avgRange)*100 : 0, 1),
          closePos: round(closePos, 1),
          targetPivotIndex: recentLow.index,
        });
      }
    }

    // Buy-side sweep: üst fitil, swing high üstüne çıktı mı?
    const recentHigh = availablePivotHighs.at(-1);
    if (recentHigh) {
      const penetration = h - recentHigh.price;
      if (penetration >= minWickAbs && cl < recentHigh.price && closePos <= reclaimMax) {
        sweeps.push({
          type: 'LIQUIDITY_SWEEP',
          side: 'SHORT',
          subtype: 'buy_side_sweep',
          sweepAtIndex: i,
          sweepTimestamp: c.time ?? c.openTime ?? null,
          targetLevel: round(recentHigh.price, 4),
          wickHigh: round(h, 4),
          closePrice: round(cl, 4),
          penetration: round(penetration, 4),
          penetrationPctOfAtr: round(avgRange ? (penetration/avgRange)*100 : 0, 1),
          closePos: round(closePos, 1),
          targetPivotIndex: recentHigh.index,
        });
      }
    }
  }

  return sweeps;
}

/* ───────── Ana API: runOrderFlowEngine ─────────
 *
 * Tek geçişte tüm FVG / OB / EQ / Sweep mekaniklerini çalıştırır.
 * Structure engine'i internal olarak çağırır (OB için BOS event'lerine ihtiyaç var).
 *
 * Dönüş: {
 *   events,              // unified v0.50 schema event listesi (skora göre sıralı)
 *   eventsChronological, // kronolojik
 *   fvgs: { all, open },
 *   orderBlocks,
 *   equalLevels,
 *   sweeps,
 *   summary, guard, warnings
 * }
 */
export function runOrderFlowEngine(candles = [], opts = {}) {
  const tf = opts.tf || '4h';
  const lookback = opts.lookback || 60;
  const now = opts.now ?? Date.now();
  const tfMs = tfToMs(tf);

  if (candles.length < 10) {
    return {
      events: [], eventsChronological: [],
      fvgs: { all: [], open: [] }, orderBlocks: [], equalLevels: [], sweeps: [],
      summary: { totalEvents:0, bias:'NEUTRAL' },
      guard: { closedCount: 0, skippedOpenCandle: false, tf, tfMs },
      warnings: ['Yetersiz mum verisi (min 10 mum gerekli).'],
    };
  }

  // No-repaint guard: açık mumu çıkar
  const lastRaw = candles[candles.length - 1];
  const lastClosed = isClosedCandle(lastRaw, tfMs, now);
  const closed = lastClosed ? candles : candles.slice(0, -1);
  const skipped = candles.length - closed.length;

  // Structure engine'i çalıştır (OB için BOS gerekli)
  const structure = runStructureEngine(closed, {
    tf, pivotLen: opts.pivotLen || 3, lookback, now,
  });

  // Detectorları çalıştır
  const fvgResult = detectFvgs(closed, opts);
  const orderBlocks = detectOrderBlocks(closed, structure, opts);
  const equalLevels = detectEqualLevels(closed, opts);
  const sweeps = detectLiquiditySweeps(closed, opts);

  // Unified v0.50 event schema'sına dönüştür
  const events = [];

  // FVG events (yalnızca lookback içinde olanlar)
  const startIdx = closed.length - lookback;
  fvgResult.all.forEach(fvg => {
    if (fvg.createdAtIndex < startIdx) return;
    const sizeScore = clamp(45 + fvg.sizePctOfAtr * 0.4);
    const statusBonus = fvg.status === 'OPEN' ? 12 : fvg.status === 'PARTIAL' ? 6 : -5;
    events.push({
      type: 'FVG',
      side: fvg.side,
      score: round(clamp(sizeScore + statusBonus), 1),
      candleIndex: closed.length - 1 - fvg.createdAtIndex,
      timestamp: fvg.createdTimestamp,
      subtype: fvg.subtype,
      evidence: {
        top: fvg.top,
        bottom: fvg.bottom,
        size: fvg.size,
        sizePctOfAtr: fvg.sizePctOfAtr,
        status: fvg.status,
        ageBars: fvg.ageBars,
      },
      noRepaint: true,
    });
  });

  // Order Block events
  orderBlocks.forEach(ob => {
    if (ob.createdAtIndex < startIdx) return;
    const dispScore = clamp(50 + ob.displacementAtrMult * 12);
    const statusBonus = ob.status === 'TESTED' ? 10 : ob.status === 'PENDING' ? 5 : -15;
    events.push({
      type: 'ORDER_BLOCK',
      side: ob.side,
      score: round(clamp(dispScore + statusBonus), 1),
      candleIndex: closed.length - 1 - ob.createdAtIndex,
      timestamp: ob.createdTimestamp,
      subtype: ob.subtype,
      evidence: {
        top: ob.top,
        bottom: ob.bottom,
        midpoint: ob.midpoint,
        status: ob.status,
        displacementAtrMult: ob.displacementAtrMult,
        barsToRetest: ob.barsToRetest,
        bosTimestamp: ob.bosTimestamp,
      },
      noRepaint: true,
    });
  });

  // Equal Level events (yalnızca son lookback içinde son temasla)
  equalLevels.forEach(eq => {
    if (eq.lastTouchIndex < startIdx) return;
    const touchScore = clamp(45 + (eq.touchCount - 2) * 15);
    events.push({
      type: 'EQUAL_LEVEL',
      side: eq.side,
      score: round(touchScore, 1),
      candleIndex: closed.length - 1 - eq.lastTouchIndex,
      timestamp: eq.lastTouchTimestamp,
      subtype: eq.subtype,
      evidence: {
        level: eq.level,
        touchCount: eq.touchCount,
        toleranceUsed: eq.toleranceUsed,
      },
      noRepaint: true,
    });
  });

  // Liquidity Sweep events
  sweeps.forEach(sw => {
    if (sw.sweepAtIndex < startIdx) return;
    const wickScore = clamp(55 + sw.penetrationPctOfAtr * 0.5);
    const closeScore = clamp(
      sw.side === 'LONG' ? (sw.closePos - 50)*1.2 : (50 - sw.closePos)*1.2
    );
    events.push({
      type: 'LIQUIDITY_SWEEP',
      side: sw.side,
      score: round(clamp(wickScore*0.6 + closeScore*0.4), 1),
      candleIndex: closed.length - 1 - sw.sweepAtIndex,
      timestamp: sw.sweepTimestamp,
      subtype: sw.subtype,
      evidence: {
        targetLevel: sw.targetLevel,
        penetration: sw.penetration,
        penetrationPctOfAtr: sw.penetrationPctOfAtr,
        closePos: sw.closePos,
        closePrice: sw.closePrice,
      },
      noRepaint: true,
    });
  });

  // Kronolojik kopya
  const eventsChronological = [...events].sort((a,b) => (a.timestamp||0) - (b.timestamp||0));
  // Skora göre sırala
  events.sort((a,b) => (b.score||0) - (a.score||0));

  // Bias hesabı: yakındaki yüksek-skorlu event'ler
  const recent = events.filter(e => e.candleIndex <= 8).slice(0, 8);
  let bullScore = 0, bearScore = 0;
  recent.forEach(e => {
    if (e.side === 'LONG') bullScore += e.score;
    else if (e.side === 'SHORT') bearScore += e.score;
  });
  const bias = bullScore > bearScore * 1.15 ? 'LONG'
             : bearScore > bullScore * 1.15 ? 'SHORT'
             : 'NEUTRAL';

  return {
    events,
    eventsChronological,
    fvgs: { all: fvgResult.all, open: fvgResult.openFvgs },
    orderBlocks,
    equalLevels,
    sweeps,
    structure, // pass-through for downstream consumers
    summary: {
      totalEvents: events.length,
      fvgCount: fvgResult.all.length,
      openFvgCount: fvgResult.openFvgs.length,
      orderBlockCount: orderBlocks.length,
      activeOrderBlockCount: orderBlocks.filter(o=>o.status==='PENDING' || o.status==='TESTED').length,
      equalLevelCount: equalLevels.length,
      sweepCount: sweeps.length,
      bullScore: round(bullScore, 1),
      bearScore: round(bearScore, 1),
      bias,
      topEvent: events[0] || null,
      lookback,
    },
    guard: {
      closedCount: closed.length,
      skippedOpenCandle: skipped > 0,
      tf, tfMs,
      now,
      lastClosedTimestamp: closed[closed.length-1]?.time ?? null,
    },
    warnings: [],
  };
}

/* ───────── Türkçe Etiketler ───────── */
export const OF_EVENT_LABEL_TR = Object.freeze({
  FVG: 'Fair Value Gap (Imbalance)',
  ORDER_BLOCK: 'Order Block (OB)',
  EQUAL_LEVEL: 'Eşit Seviye (Likidite Havuzu)',
  LIQUIDITY_SWEEP: 'Likidite Süpürmesi (Sweep)',
});

export const OF_SUBTYPE_LABEL_TR = Object.freeze({
  bullish_fvg: 'boğa imbalance',
  bearish_fvg: 'ayı imbalance',
  bullish_ob: 'boğa OB',
  bearish_ob: 'ayı OB',
  equal_highs: 'eşit highs (üst likidite)',
  equal_lows:  'eşit lows (alt likidite)',
  sell_side_sweep: 'sell-side süpürme',
  buy_side_sweep:  'buy-side süpürme',
});

export const OF_STATUS_LABEL_TR = Object.freeze({
  OPEN: 'açık',
  PARTIAL: 'kısmen dolu',
  FILLED: 'doldu',
  EXPIRED: 'süresi geçti',
  PENDING: 'test bekleniyor',
  TESTED: 'test edildi',
  INVALIDATED: 'geçersiz',
});

export const ORDERFLOW_ENGINE_VERSION = '0.56.0-live-controls-20260519';
