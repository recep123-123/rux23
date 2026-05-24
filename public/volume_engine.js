/* RUx — Volume Profile / VWAP / Auction Market Engine
 * ──────────────────────────────────────────────────────────────
 * v0.50/v0.51/v0.52/v0.53 üzerine kurulu. Hacim bazlı kurumsal
 * referans noktalarını üretir ve mevcut template'lere confluence
 * filtresi olarak entegre edilebilir.
 *
 * Kavramlar:
 *
 *  Volume Profile (VP):
 *    Mum dizisi üzerinde fiyat eksenini bin'lere bölüp her bin'de
 *    işlem gören toplam hacmi sayar. Çıktısı:
 *      - POC (Point of Control): En yüksek hacme sahip bin
 *      - VAH/VAL (Value Area High/Low): Toplam hacmin %70'inin
 *        yoğunlaştığı bölgenin üst/alt sınırları
 *      - HVN/LVN (High/Low Volume Nodes): yerel maks/minlar
 *    Tipleri:
 *      - Fixed Range VP: belirli candle aralığı (örn. son 50 mum)
 *      - Session VP: günlük seans bazında
 *      - Composite VP: tüm dizi
 *
 *  VWAP (Volume Weighted Average Price):
 *    Σ(typical_price × volume) / Σ(volume)
 *    typical_price = (high + low + close) / 3
 *    Anchor noktasına göre çeşitleri:
 *      - Session VWAP: günlük seans başlangıcı
 *      - Weekly VWAP: hafta başlangıcı
 *      - Anchored VWAP: kullanıcı tanımlı pivot
 *    Deviation bands: VWAP ± (kσ) standart sapma çarpanları
 *
 *  Auction Market Theory:
 *    Initial Balance (IB): seansın ilk 1 saat (veya 1/3) range'i
 *    Day Type classification:
 *      - Normal Day: IB ≥ %70 günün range'i (dengeli)
 *      - Trend Day: range IB'nin > 2x (tek yönlü)
 *      - Normal Variation: range IB'nin ~1.5x (orta)
 *      - Neutral Day: kapanış IB içinde
 *      - Trend Reversal: gün ortasında ters yön
 *
 * No-repaint:
 *   - VP yalnızca kapalı mumlardan hesaplanır
 *   - VWAP cumulative, son closed candle'a kadar
 *   - Day type yalnızca kapanmış seans için kesin
 */

import { isClosedCandle, tfToMs } from './pa_engine.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';

/* ───────── Yardımcılar ───────── */
function num(x){ return Number.isFinite(Number(x)) ? Number(x) : NaN; }
function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }
function sum(arr){ return arr.reduce((a,b)=>a+b, 0); }

/* ───────── Sabitler ───────── */
export const VOL_CONST = Object.freeze({
  // Volume Profile bin sayısı (fiyat ekseni)
  VP_BIN_COUNT_DEFAULT: 50,
  // Value Area yoğunluğu (toplam hacmin yüzdesi)
  VALUE_AREA_PCT: 70,
  // HVN/LVN tespit eşiği (avg volume relative)
  HVN_THRESHOLD_MULT: 1.5,    // bin volume ≥ avg × 1.5 → HVN
  LVN_THRESHOLD_MULT: 0.4,    // bin volume ≤ avg × 0.4 → LVN
  // VWAP deviation band sayısı
  VWAP_BAND_SIGMA_DEFAULT: [1, 2, 3],
  // Initial Balance: seansın ilk X mumu (default 6 = ilk 6 saat tipik 1h TF için)
  IB_BARS_DEFAULT: 6,
  // Day type oranları
  TREND_DAY_IB_MULT: 2.0,
  NORMAL_VAR_IB_MULT: 1.5,
  NORMAL_DAY_IB_PCT: 70,
});

/* ───────── Typical Price ───────── */
function typicalPrice(c) {
  return (num(c.high) + num(c.low) + num(c.close)) / 3;
}

/* ───────── Volume Profile ─────────
 *
 * Verilen mum aralığı için fiyat-hacim dağılımını üretir.
 * Bin boyutu adaptif: range / binCount.
 *
 * Dönüş: { bins, poc, vah, val, hvns, lvns, totalVolume, range }
 */
export function computeVolumeProfile(candles = [], opts = {}) {
  const binCount = opts.binCount || VOL_CONST.VP_BIN_COUNT_DEFAULT;
  const valuePct = opts.valuePct || VOL_CONST.VALUE_AREA_PCT;

  const clean = candles.filter(c =>
    Number.isFinite(num(c.high)) && Number.isFinite(num(c.low)) && Number.isFinite(num(c.volume))
  );
  if (clean.length < 3) {
    return { bins: [], poc: null, vah: null, val: null, hvns: [], lvns: [], totalVolume: 0, range: null };
  }

  const overallHigh = Math.max(...clean.map(c => num(c.high)));
  const overallLow  = Math.min(...clean.map(c => num(c.low)));
  if (overallHigh <= overallLow) {
    return { bins: [], poc: null, vah: null, val: null, hvns: [], lvns: [], totalVolume: 0, range: null };
  }
  const binSize = (overallHigh - overallLow) / binCount;

  // Bin'leri başlat
  const bins = [];
  for (let i = 0; i < binCount; i++) {
    const lo = overallLow + i * binSize;
    const hi = lo + binSize;
    bins.push({ idx: i, low: lo, high: hi, mid: (lo + hi) / 2, volume: 0, candles: 0 });
  }

  // Her mumun hacmini, kestiği bin'lere dağıt (proportional by range overlap)
  clean.forEach(c => {
    const cHigh = num(c.high), cLow = num(c.low), cVol = num(c.volume);
    const cRange = Math.max(cHigh - cLow, binSize / 10); // küçük doji'leri tek bin'e ata
    bins.forEach(b => {
      const overlapLo = Math.max(b.low, cLow);
      const overlapHi = Math.min(b.high, cHigh);
      if (overlapHi > overlapLo) {
        const overlapFrac = (overlapHi - overlapLo) / cRange;
        b.volume += cVol * overlapFrac;
        b.candles += overlapFrac;
      }
    });
  });

  const totalVolume = sum(bins.map(b => b.volume));
  if (totalVolume <= 0) {
    return { bins, poc: null, vah: null, val: null, hvns: [], lvns: [], totalVolume: 0, range: { high: overallHigh, low: overallLow } };
  }

  // POC: En yüksek hacimli bin
  const pocBin = bins.reduce((max, b) => b.volume > max.volume ? b : max, bins[0]);

  // Value Area: POC'tan başlayarak yukarı/aşağı yayılır, toplam hacmin %70'ine ulaşana kadar
  const targetVA = totalVolume * (valuePct / 100);
  let vaVolume = pocBin.volume;
  let upIdx = pocBin.idx + 1;
  let downIdx = pocBin.idx - 1;
  const inVA = new Set([pocBin.idx]);
  while (vaVolume < targetVA && (upIdx < bins.length || downIdx >= 0)) {
    const upVol = upIdx < bins.length ? bins[upIdx].volume : -1;
    const downVol = downIdx >= 0 ? bins[downIdx].volume : -1;
    if (upVol >= downVol && upIdx < bins.length) {
      inVA.add(upIdx);
      vaVolume += upVol;
      upIdx++;
    } else if (downIdx >= 0) {
      inVA.add(downIdx);
      vaVolume += downVol;
      downIdx--;
    } else {
      break;
    }
  }
  const vaIndices = Array.from(inVA).sort((a,b)=>a-b);
  const vahBin = bins[vaIndices[vaIndices.length-1]];
  const valBin = bins[vaIndices[0]];

  // HVN / LVN
  const avgVol = totalVolume / binCount;
  const hvnThreshold = avgVol * VOL_CONST.HVN_THRESHOLD_MULT;
  const lvnThreshold = avgVol * VOL_CONST.LVN_THRESHOLD_MULT;
  const hvns = bins
    .filter(b => b.volume >= hvnThreshold && b.idx !== pocBin.idx)
    .map(b => ({ price: round(b.mid, 4), volume: round(b.volume, 2), volPct: round((b.volume/totalVolume)*100, 1) }));
  const lvns = bins
    .filter(b => b.volume <= lvnThreshold && b.volume > 0)
    .map(b => ({ price: round(b.mid, 4), volume: round(b.volume, 2), volPct: round((b.volume/totalVolume)*100, 1) }));

  return {
    bins: bins.map(b => ({
      idx: b.idx,
      low: round(b.low, 4),
      high: round(b.high, 4),
      mid: round(b.mid, 4),
      volume: round(b.volume, 2),
      volPct: round((b.volume/totalVolume)*100, 1),
    })),
    poc: { price: round(pocBin.mid, 4), volume: round(pocBin.volume, 2), volPct: round((pocBin.volume/totalVolume)*100, 1) },
    vah: { price: round(vahBin.high, 4), idx: vahBin.idx },
    val: { price: round(valBin.low, 4), idx: valBin.idx },
    valueAreaPct: round((vaVolume/totalVolume)*100, 1),
    hvns,
    lvns,
    totalVolume: round(totalVolume, 2),
    range: { high: round(overallHigh, 4), low: round(overallLow, 4), binSize: round(binSize, 4) },
    binCount,
  };
}

/* ───────── VWAP + Deviation Bands ─────────
 *
 * Cumulative VWAP + standard deviation bands from anchor.
 *
 * Dönüş: { vwap[], bands[], anchorIndex, currentVwap, currentBands }
 *   bands[k] = { sigma: k, upper[], lower[] } for each k in sigmaBands
 */
export function computeVWAP(candles = [], opts = {}) {
  const sigmaBands = opts.sigmaBands || VOL_CONST.VWAP_BAND_SIGMA_DEFAULT;
  const anchorIndex = opts.anchorIndex ?? 0;

  if (!candles.length || anchorIndex >= candles.length) {
    return { vwap: [], bands: [], anchorIndex, currentVwap: null, currentBands: null };
  }

  const vwap = [];
  const upperBands = sigmaBands.map(() => []);
  const lowerBands = sigmaBands.map(() => []);

  let cumPV = 0;
  let cumV = 0;
  let cumPV2 = 0; // for variance: Σ(typical_price² × volume)

  for (let i = 0; i < candles.length; i++) {
    if (i < anchorIndex) {
      vwap.push(null);
      sigmaBands.forEach((_, k) => {
        upperBands[k].push(null);
        lowerBands[k].push(null);
      });
      continue;
    }
    const c = candles[i];
    const tp = typicalPrice(c);
    const v = num(c.volume);
    if (!Number.isFinite(tp) || !Number.isFinite(v) || v <= 0) {
      // hacim yoksa öncekinden devam
      vwap.push(cumV > 0 ? cumPV / cumV : null);
      sigmaBands.forEach((sig, k) => {
        const last = vwap[vwap.length-1];
        upperBands[k].push(last);
        lowerBands[k].push(last);
      });
      continue;
    }
    cumPV += tp * v;
    cumV += v;
    cumPV2 += tp * tp * v;
    const vwapValue = cumPV / cumV;
    // Variance = E[X²] - (E[X])²
    const variance = Math.max(0, (cumPV2 / cumV) - vwapValue * vwapValue);
    const sd = Math.sqrt(variance);
    vwap.push(vwapValue);
    sigmaBands.forEach((sig, k) => {
      upperBands[k].push(vwapValue + sig * sd);
      lowerBands[k].push(vwapValue - sig * sd);
    });
  }

  const bands = sigmaBands.map((sig, k) => ({
    sigma: sig,
    upper: upperBands[k].map(v => v == null ? null : round(v, 4)),
    lower: lowerBands[k].map(v => v == null ? null : round(v, 4)),
  }));

  const lastIdx = candles.length - 1;
  const currentVwap = vwap[lastIdx] != null ? round(vwap[lastIdx], 4) : null;
  const currentBands = bands.map(b => ({
    sigma: b.sigma,
    upper: b.upper[lastIdx],
    lower: b.lower[lastIdx],
  }));

  return {
    vwap: vwap.map(v => v == null ? null : round(v, 4)),
    bands,
    anchorIndex,
    currentVwap,
    currentBands,
  };
}

/* ───────── Session VWAP / Weekly VWAP ─────────
 *
 * Anchor noktasını seans/hafta sınırından otomatik hesaplar.
 * tfMs = timeframe milisecond cinsinden
 */
export function findSessionAnchor(candles = [], type = 'session', tfMs = 0) {
  if (!candles.length) return 0;
  const lastIdx = candles.length - 1;
  const lastTime = num(candles[lastIdx].time ?? candles[lastIdx].openTime);
  if (!Number.isFinite(lastTime)) return 0;

  if (type === 'session') {
    // UTC session: gün başlangıcı (00:00 UTC)
    const lastDate = new Date(lastTime);
    const sessionStart = Date.UTC(
      lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate()
    );
    for (let i = lastIdx; i >= 0; i--) {
      const t = num(candles[i].time ?? candles[i].openTime);
      if (t < sessionStart) return i + 1;
    }
    return 0;
  }
  if (type === 'weekly') {
    // Haftalık: en yakın Pazartesi 00:00 UTC
    const lastDate = new Date(lastTime);
    const dow = lastDate.getUTCDay(); // 0 = Sun, 1 = Mon, ...
    const daysSinceMon = (dow === 0) ? 6 : dow - 1;
    const weekStart = Date.UTC(
      lastDate.getUTCFullYear(), lastDate.getUTCMonth(), lastDate.getUTCDate() - daysSinceMon
    );
    for (let i = lastIdx; i >= 0; i--) {
      const t = num(candles[i].time ?? candles[i].openTime);
      if (t < weekStart) return i + 1;
    }
    return 0;
  }
  return 0;
}

/* ───────── Auction Market — Day Type Classification ─────────
 *
 * Kapalı bir günün IB (Initial Balance) ve range'ini hesaplayıp
 * day type'ı sınıflandırır.
 *
 * Dönüş: { type, label, ib: {high, low, range}, day: {high, low, range, close},
 *          ibExtension, closeInIb }
 */
export function classifyDayType(daySessionCandles = [], opts = {}) {
  const ibBars = opts.ibBars ?? VOL_CONST.IB_BARS_DEFAULT;
  if (daySessionCandles.length < ibBars + 1) {
    return {
      type: 'UNKNOWN', label: 'Yetersiz veri',
      ib: null, day: null, ibExtension: 0, closeInIb: null,
    };
  }
  const ibCandles = daySessionCandles.slice(0, ibBars);
  const ibHigh = Math.max(...ibCandles.map(c => num(c.high)));
  const ibLow  = Math.min(...ibCandles.map(c => num(c.low)));
  const ibRange = ibHigh - ibLow;

  const dayHigh = Math.max(...daySessionCandles.map(c => num(c.high)));
  const dayLow  = Math.min(...daySessionCandles.map(c => num(c.low)));
  const dayRange = dayHigh - dayLow;
  const dayClose = num(daySessionCandles[daySessionCandles.length-1].close);

  const ibExtensionRatio = ibRange > 0 ? dayRange / ibRange : 0;
  const ibPctOfDay = dayRange > 0 ? (ibRange / dayRange) * 100 : 0;
  const closeInIb = dayClose >= ibLow && dayClose <= ibHigh;

  let type = 'NORMAL_DAY', label = 'Normal Day';
  if (ibExtensionRatio >= VOL_CONST.TREND_DAY_IB_MULT) {
    type = 'TREND_DAY';
    label = dayClose > ibHigh ? 'Trend Day (yukarı)' : dayClose < ibLow ? 'Trend Day (aşağı)' : 'Trend Day (genişleyen)';
  } else if (ibExtensionRatio >= VOL_CONST.NORMAL_VAR_IB_MULT) {
    type = 'NORMAL_VARIATION';
    label = 'Normal Variation Day';
  } else if (ibPctOfDay >= VOL_CONST.NORMAL_DAY_IB_PCT) {
    type = 'NORMAL_DAY';
    label = 'Normal Day (dengeli)';
  }
  // Neutral day: kapanış IB içinde, ama IB extension makul
  if (closeInIb && (type === 'NORMAL_DAY' || type === 'NORMAL_VARIATION')) {
    type = 'NEUTRAL_DAY';
    label = 'Neutral Day (IB içi kapanış)';
  }

  return {
    type, label,
    ib: { high: round(ibHigh, 4), low: round(ibLow, 4), range: round(ibRange, 4) },
    day: { high: round(dayHigh, 4), low: round(dayLow, 4), range: round(dayRange, 4), close: round(dayClose, 4) },
    ibExtensionRatio: round(ibExtensionRatio, 2),
    ibPctOfDay: round(ibPctOfDay, 1),
    closeInIb,
  };
}

/* ───────── Confluence Helpers ─────────
 *
 * Bir fiyat seviyesi için VP/VWAP konfluans skoru üretir.
 * Bu skor v0.53 template'lerinin entry/stop/target seviyelerini
 * "güçlü" veya "zayıf" olarak işaretlemek için kullanılabilir.
 */
export function priceLevelConfluence(price, vpResult, vwapResult, opts = {}) {
  const atrTolerance = opts.atrTolerance ?? 0;
  const tolerance = atrTolerance > 0 ? atrTolerance : (vpResult.range?.binSize || price * 0.005);

  const hits = [];
  let score = 0;

  // POC yakınlığı
  if (vpResult.poc && Math.abs(vpResult.poc.price - price) <= tolerance) {
    hits.push({ ref: 'POC', refPrice: vpResult.poc.price, distance: Math.abs(vpResult.poc.price - price) });
    score += 30;
  }
  // VAH yakınlığı
  if (vpResult.vah && Math.abs(vpResult.vah.price - price) <= tolerance) {
    hits.push({ ref: 'VAH', refPrice: vpResult.vah.price, distance: Math.abs(vpResult.vah.price - price) });
    score += 18;
  }
  // VAL yakınlığı
  if (vpResult.val && Math.abs(vpResult.val.price - price) <= tolerance) {
    hits.push({ ref: 'VAL', refPrice: vpResult.val.price, distance: Math.abs(vpResult.val.price - price) });
    score += 18;
  }
  // HVN yakınlığı
  (vpResult.hvns || []).forEach(hvn => {
    if (Math.abs(hvn.price - price) <= tolerance) {
      hits.push({ ref: 'HVN', refPrice: hvn.price, distance: Math.abs(hvn.price - price) });
      score += 8;
    }
  });
  // LVN yakınlığı (LVN = düşük hacim = hızlı geçilen seviye)
  (vpResult.lvns || []).forEach(lvn => {
    if (Math.abs(lvn.price - price) <= tolerance) {
      hits.push({ ref: 'LVN', refPrice: lvn.price, distance: Math.abs(lvn.price - price) });
      score += 5; // LVN düşük ama kayda değer
    }
  });
  // VWAP yakınlığı
  if (vwapResult.currentVwap != null && Math.abs(vwapResult.currentVwap - price) <= tolerance) {
    hits.push({ ref: 'VWAP', refPrice: vwapResult.currentVwap, distance: Math.abs(vwapResult.currentVwap - price) });
    score += 22;
  }
  // VWAP bands yakınlığı
  (vwapResult.currentBands || []).forEach(b => {
    if (b.upper != null && Math.abs(b.upper - price) <= tolerance) {
      hits.push({ ref: `VWAP +${b.sigma}σ`, refPrice: b.upper, distance: Math.abs(b.upper - price) });
      score += 10;
    }
    if (b.lower != null && Math.abs(b.lower - price) <= tolerance) {
      hits.push({ ref: `VWAP -${b.sigma}σ`, refPrice: b.lower, distance: Math.abs(b.lower - price) });
      score += 10;
    }
  });

  return {
    score: clamp(round(score, 1)),
    hits,
    label: score >= 50 ? 'GÜÇLÜ' : score >= 25 ? 'ORTA' : score > 0 ? 'ZAYIF' : 'YOK',
  };
}

/* ───────── Ana API: runVolumeEngine ─────────
 *
 * Tek geçişte VP + VWAP (session ve weekly) + Day Type üretir.
 *
 * Dönüş: {
 *   compositeVP, sessionVP, weeklyVP,
 *   sessionVWAP, weeklyVWAP,
 *   dayType,
 *   summary, guard, warnings
 * }
 */
export function runVolumeEngine(candles = [], opts = {}) {
  const tf = opts.tf || '4h';
  const tfMs = tfToMs(tf);
  const now = opts.now ?? Date.now();

  if (candles.length < 10) {
    return {
      compositeVP: null, sessionVP: null, weeklyVP: null,
      sessionVWAP: null, weeklyVWAP: null,
      dayType: null,
      summary: { totalVolume: 0, poc: null, currentVwap: null, dayType: 'UNKNOWN' },
      guard: { closedCount: 0, skippedOpenCandle: false, tf, tfMs },
      warnings: ['Yetersiz mum verisi (min 10 mum gerekli).'],
    };
  }

  // No-repaint guard
  const lastRaw = candles[candles.length - 1];
  const lastClosed = isClosedCandle(lastRaw, tfMs, now);
  const closed = lastClosed ? candles : candles.slice(0, -1);
  const skipped = candles.length - closed.length;

  // Composite VP (tüm dizi)
  const compositeVP = computeVolumeProfile(closed, opts);

  // Session VP (son seans / gün)
  const sessionAnchor = findSessionAnchor(closed, 'session', tfMs);
  const sessionCandles = closed.slice(sessionAnchor);
  const sessionVP = sessionCandles.length >= 3 ? computeVolumeProfile(sessionCandles, opts) : null;

  // Weekly VP
  const weeklyAnchor = findSessionAnchor(closed, 'weekly', tfMs);
  const weeklyCandles = closed.slice(weeklyAnchor);
  const weeklyVP = weeklyCandles.length >= 3 ? computeVolumeProfile(weeklyCandles, opts) : null;

  // VWAP'lar
  const sessionVWAP = computeVWAP(closed, { ...opts, anchorIndex: sessionAnchor });
  const weeklyVWAP  = computeVWAP(closed, { ...opts, anchorIndex: weeklyAnchor });

  // Day type (session candles üzerinden)
  const dayType = sessionCandles.length >= VOL_CONST.IB_BARS_DEFAULT + 1
    ? classifyDayType(sessionCandles, opts)
    : null;

  const lastClose = num(closed[closed.length-1].close);
  const aboveVwap = sessionVWAP.currentVwap != null && lastClose > sessionVWAP.currentVwap;
  const aboveValueArea = compositeVP.vah && lastClose > compositeVP.vah.price;
  const belowValueArea = compositeVP.val && lastClose < compositeVP.val.price;

  let location = 'INSIDE_VA';
  if (aboveValueArea) location = 'ABOVE_VA';
  else if (belowValueArea) location = 'BELOW_VA';

  return {
    compositeVP,
    sessionVP,
    weeklyVP,
    sessionVWAP,
    weeklyVWAP,
    dayType,
    summary: {
      totalVolume: compositeVP.totalVolume,
      poc: compositeVP.poc,
      vah: compositeVP.vah,
      val: compositeVP.val,
      hvnCount: compositeVP.hvns.length,
      lvnCount: compositeVP.lvns.length,
      currentVwap: sessionVWAP.currentVwap,
      vwapBands: sessionVWAP.currentBands,
      lastClose,
      aboveVwap,
      location,                         // ABOVE_VA / INSIDE_VA / BELOW_VA
      dayType: dayType?.type || 'UNKNOWN',
      dayTypeLabel: dayType?.label || 'Bilinmiyor',
    },
    guard: {
      closedCount: closed.length,
      skippedOpenCandle: skipped > 0,
      tf, tfMs, now,
      sessionAnchor,
      weeklyAnchor,
    },
    warnings: [],
  };
}

/* ───────── Türkçe etiketler ───────── */
export const VOL_LABEL_TR = Object.freeze({
  POC: 'Kontrol Noktası (POC)',
  VAH: 'Değer Bölgesi Üstü (VAH)',
  VAL: 'Değer Bölgesi Altı (VAL)',
  HVN: 'Yüksek Hacim Düğümü (HVN)',
  LVN: 'Düşük Hacim Düğümü (LVN)',
  VWAP: 'Hacim Ağırlıklı Ort. (VWAP)',
  NORMAL_DAY: 'Normal Gün',
  NORMAL_VARIATION: 'Normal Varyasyon',
  TREND_DAY: 'Trend Günü',
  NEUTRAL_DAY: 'Nötr Gün',
  UNKNOWN: 'Bilinmiyor',
  ABOVE_VA: 'Değer Bölgesi Üstünde',
  INSIDE_VA: 'Değer Bölgesi İçinde',
  BELOW_VA: 'Değer Bölgesi Altında',
});

export const VOLUME_ENGINE_VERSION = '0.56.0-live-controls-20260519';
