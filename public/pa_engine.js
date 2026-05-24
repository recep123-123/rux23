/* RUx — Full Price Action Feature Engine
 * ─────────────────────────────────────────────
 * Per-candle, typed, no-repaint price action feature extraction.
 *
 * Bu motor `rux_core.analyzePriceActionRulebook`'tan farklı olarak:
 *   - Her mum için ATOMİK pattern dedektörleri çalıştırır
 *   - Tipli PA Event nesneleri üretir (schema aşağıda)
 *   - Yalnızca KAPANMIŞ mumlarda tetiklenir (no-repaint guard)
 *   - Çoklu mum geçmişi üzerinde feature stream çıkarır
 *   - Multi-TF agrege edilebilir
 *
 * PA Event schema:
 *   {
 *     type: 'ENGULFING' | 'INSIDE_BAR' | 'OUTSIDE_BAR' | 'DOJI' | 'PIN_BAR'
 *         | 'HAMMER' | 'SHOOTING_STAR' | 'MARUBOZU' | 'THREE_BAR_REVERSAL',
 *     side: 'LONG' | 'SHORT' | 'NEUTRAL',
 *     score: 0..100,           // pattern kalitesi
 *     candleIndex: number,     // dizinin son indeksinden geriye
 *     timestamp: number|null,  // ms
 *     subtype?: string,        // ör. 'gravestone', 'dragonfly'
 *     evidence: { ... },       // detaylı metrikler
 *     noRepaint: true          // her zaman true; sadece kapalı mumlar için
 *   }
 *
 * Tüm dedektörler pure function — aynı input → aynı output. Lookahead yok.
 */

/* ───────── Sabitler ───────── */
export const PA_CONST = Object.freeze({
  // Doji body / range eşiği (% olarak)
  DOJI_BODY_MAX: 10,
  // Doji long-legged: alt+üst fitil toplamı ≥ %70
  DOJI_LONG_LEG_MIN: 70,
  // Gravestone: üst fitil ≥ %60, alt fitil ≤ %10
  DOJI_GRAVESTONE_UPPER_MIN: 60,
  DOJI_GRAVESTONE_LOWER_MAX: 10,
  // Dragonfly: alt fitil ≥ %60, üst fitil ≤ %10
  DOJI_DRAGONFLY_LOWER_MIN: 60,
  DOJI_DRAGONFLY_UPPER_MAX: 10,
  // Pin bar / rejection: wick ≥ body × 2 ve wick ≥ %50 range
  PIN_WICK_RATIO_MIN: 2.0,
  PIN_WICK_PCT_MIN: 50,
  // Hammer/shooting star: pin bar ek olarak close yönü
  HAMMER_CLOSE_POS_MIN: 60,      // alt fitil + close üstte
  SHOOT_STAR_CLOSE_POS_MAX: 40,  // üst fitil + close altta
  // Engulfing: body önceki body'nin ≥ %100'ü
  ENGULF_BODY_RATIO_MIN: 1.0,
  // Marubozu: body ≥ %92 range
  MARUBOZU_BODY_MIN: 92,
  // Volume spike confirmation
  VOLUME_SPIKE_RATIO: 1.5,
});

/* ───────── Yardımcılar ───────── */
function num(x){ return Number.isFinite(Number(x)) ? Number(x) : NaN; }
function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }

/** Bir mumun ham özelliklerini çıkarır (gövde/fitil yüzdeleri vs.) */
export function candleFeatures(c={}) {
  const open = num(c.open), high = num(c.high), low = num(c.low), close = num(c.close);
  if (!Number.isFinite(open+high+low+close)) return null;
  const range = Math.max(high - low, 1e-9);
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  return {
    open, high, low, close,
    range, body,
    upperWick, lowerWick,
    bodyPct: (body/range)*100,
    upperWickPct: (upperWick/range)*100,
    lowerWickPct: (lowerWick/range)*100,
    closePos: ((close - low)/range)*100,
    bullish: close > open,
    bearish: close < open,
    volume: num(c.volume) || 0,
    time: c.time ?? c.openTime ?? null,
    closeTime: c.closeTime ?? null,
  };
}

/** Bir mumun KAPANMIŞ olup olmadığını döndürür (no-repaint guard).
 *  closeTime varsa onu, yoksa time+tfMs'yi referans alır. */
export function isClosedCandle(candle, tfMs = 0, now = Date.now()) {
  if (!candle) return false;
  const ct = num(candle.closeTime);
  if (Number.isFinite(ct)) return now >= ct;
  const t = num(candle.time ?? candle.openTime);
  if (!Number.isFinite(t) || !tfMs) return true; // bilinmiyorsa kapalı varsay (geçmiş veri)
  return now >= (t + tfMs);
}

/** Timeframe ms süresine çevirir. */
export function tfToMs(tf='4h'){
  const m = { '1m':60_000, '3m':180_000, '5m':300_000, '15m':900_000, '30m':1_800_000,
              '1h':3_600_000, '2h':7_200_000, '4h':14_400_000, '6h':21_600_000,
              '8h':28_800_000, '12h':43_200_000, '1d':86_400_000, '3d':259_200_000,
              '1w':604_800_000 };
  return m[tf] || 0;
}

/* ───────── Atomik Dedektörler ─────────
 * Her dedektör mevcut mumun (c) ve önceki mumun (p) feature'larını alır,
 * eşleşirse Event nesnesi, eşleşmezse null döner.
 */

export function detectEngulfing(c, p, ctx={}) {
  if (!c || !p) return null;
  const sameDir = c.bullish === p.bullish;
  if (sameDir) return null;
  // Body engulfing: current body ≥ prev body, and prev body fits inside current body
  const bodyRatio = p.body>0 ? c.body / p.body : 0;
  if (bodyRatio < PA_CONST.ENGULF_BODY_RATIO_MIN) return null;
  const cBodyHi = Math.max(c.open, c.close);
  const cBodyLo = Math.min(c.open, c.close);
  const pBodyHi = Math.max(p.open, p.close);
  const pBodyLo = Math.min(p.open, p.close);
  if (!(cBodyHi >= pBodyHi && cBodyLo <= pBodyLo)) return null;

  const side = c.bullish ? 'LONG' : 'SHORT';
  const volBoost = ctx.volumeRatio >= PA_CONST.VOLUME_SPIKE_RATIO ? 10 : 0;
  const score = clamp(55 + (bodyRatio-1)*25 + c.bodyPct*0.20 + volBoost);
  return {
    type: 'ENGULFING', side,
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      bodyRatio: round(bodyRatio,2),
      currBodyPct: round(c.bodyPct,1),
      prevBodyPct: round(p.bodyPct,1),
      volumeRatio: round(ctx.volumeRatio||1,2),
    },
    noRepaint: true,
  };
}

export function detectInsideBar(c, p, ctx={}) {
  if (!c || !p) return null;
  if (!(c.high <= p.high && c.low >= p.low)) return null;
  // Inside bar = sıkışma; range küçük olmalı
  const rangeRatio = p.range>0 ? c.range / p.range : 1;
  if (rangeRatio > 0.85) return null;
  const side = 'NEUTRAL'; // breakout yönü açıklanmamıştır
  const score = clamp(50 + (1 - rangeRatio)*40 + (p.bodyPct>50 ? 8 : 0));
  return {
    type: 'INSIDE_BAR', side,
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      rangeRatio: round(rangeRatio,3),
      motherBarBodyPct: round(p.bodyPct,1),
    },
    noRepaint: true,
  };
}

export function detectOutsideBar(c, p, ctx={}) {
  if (!c || !p) return null;
  if (!(c.high > p.high && c.low < p.low)) return null;
  const rangeRatio = p.range>0 ? c.range / p.range : 1;
  if (rangeRatio < 1.15) return null;
  const side = c.bullish ? 'LONG' : c.bearish ? 'SHORT' : 'NEUTRAL';
  const volBoost = ctx.volumeRatio >= PA_CONST.VOLUME_SPIKE_RATIO ? 8 : 0;
  const score = clamp(50 + (rangeRatio-1)*30 + c.bodyPct*0.15 + volBoost);
  return {
    type: 'OUTSIDE_BAR', side,
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      rangeRatio: round(rangeRatio,2),
      closePos: round(c.closePos,1),
      volumeRatio: round(ctx.volumeRatio||1,2),
    },
    noRepaint: true,
  };
}

export function detectDoji(c, p, ctx={}) {
  if (!c) return null;
  if (c.bodyPct > PA_CONST.DOJI_BODY_MAX) return null;
  // Subtype classification
  let subtype = 'standard';
  if (c.upperWickPct >= PA_CONST.DOJI_GRAVESTONE_UPPER_MIN &&
      c.lowerWickPct <= PA_CONST.DOJI_GRAVESTONE_LOWER_MAX) subtype = 'gravestone';
  else if (c.lowerWickPct >= PA_CONST.DOJI_DRAGONFLY_LOWER_MIN &&
           c.upperWickPct <= PA_CONST.DOJI_DRAGONFLY_UPPER_MAX) subtype = 'dragonfly';
  else if ((c.upperWickPct + c.lowerWickPct) >= PA_CONST.DOJI_LONG_LEG_MIN) subtype = 'long_legged';

  let side = 'NEUTRAL';
  if (subtype === 'gravestone') side = 'SHORT';
  else if (subtype === 'dragonfly') side = 'LONG';

  const score = clamp(45 +
    (subtype === 'gravestone' || subtype === 'dragonfly' ? 15 : 0) +
    (subtype === 'long_legged' ? 8 : 0) +
    (10 - c.bodyPct)*1.5
  );
  return {
    type: 'DOJI', side,
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    subtype,
    evidence: {
      bodyPct: round(c.bodyPct,1),
      upperWickPct: round(c.upperWickPct,1),
      lowerWickPct: round(c.lowerWickPct,1),
    },
    noRepaint: true,
  };
}

export function detectPinBar(c, p, ctx={}) {
  if (!c) return null;
  // Pin bar: bir taraftaki fitil body'nin ≥ 2x ve range'in ≥ %50'si
  const isUpperPin = c.upperWick >= c.body * PA_CONST.PIN_WICK_RATIO_MIN &&
                     c.upperWickPct >= PA_CONST.PIN_WICK_PCT_MIN;
  const isLowerPin = c.lowerWick >= c.body * PA_CONST.PIN_WICK_RATIO_MIN &&
                     c.lowerWickPct >= PA_CONST.PIN_WICK_PCT_MIN;
  if (!isUpperPin && !isLowerPin) return null;
  if (isUpperPin && isLowerPin) return null; // bu doji → ayrı dedektör

  const side = isLowerPin ? 'LONG' : 'SHORT';
  const wickPct = isLowerPin ? c.lowerWickPct : c.upperWickPct;
  const closeFit = isLowerPin ? c.closePos : (100 - c.closePos);
  const score = clamp(50 + (wickPct - 50)*0.6 + (closeFit - 50)*0.5);
  return {
    type: 'PIN_BAR', side,
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      wickPct: round(wickPct,1),
      bodyPct: round(c.bodyPct,1),
      closePos: round(c.closePos,1),
      direction: isLowerPin ? 'lower_wick' : 'upper_wick',
    },
    noRepaint: true,
  };
}

export function detectHammer(c, p, ctx={}) {
  // Hammer = pin bar + close üstte + (opsiyonel) downtrend bağlamı
  if (!c) return null;
  const isLowerPin = c.lowerWick >= c.body * PA_CONST.PIN_WICK_RATIO_MIN &&
                     c.lowerWickPct >= PA_CONST.PIN_WICK_PCT_MIN;
  if (!isLowerPin) return null;
  if (c.closePos < PA_CONST.HAMMER_CLOSE_POS_MIN) return null;
  const trendBonus = ctx.priorTrend === 'DOWN' ? 12 : 0;
  const score = clamp(55 + (c.lowerWickPct - 50)*0.7 + (c.closePos - 60)*0.4 + trendBonus);
  return {
    type: 'HAMMER', side: 'LONG',
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      lowerWickPct: round(c.lowerWickPct,1),
      closePos: round(c.closePos,1),
      priorTrend: ctx.priorTrend || null,
    },
    noRepaint: true,
  };
}

export function detectShootingStar(c, p, ctx={}) {
  if (!c) return null;
  const isUpperPin = c.upperWick >= c.body * PA_CONST.PIN_WICK_RATIO_MIN &&
                     c.upperWickPct >= PA_CONST.PIN_WICK_PCT_MIN;
  if (!isUpperPin) return null;
  if (c.closePos > PA_CONST.SHOOT_STAR_CLOSE_POS_MAX) return null;
  const trendBonus = ctx.priorTrend === 'UP' ? 12 : 0;
  const score = clamp(55 + (c.upperWickPct - 50)*0.7 + (40 - c.closePos)*0.4 + trendBonus);
  return {
    type: 'SHOOTING_STAR', side: 'SHORT',
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      upperWickPct: round(c.upperWickPct,1),
      closePos: round(c.closePos,1),
      priorTrend: ctx.priorTrend || null,
    },
    noRepaint: true,
  };
}

export function detectMarubozu(c, p, ctx={}) {
  if (!c) return null;
  if (c.bodyPct < PA_CONST.MARUBOZU_BODY_MIN) return null;
  const side = c.bullish ? 'LONG' : 'SHORT';
  const volBoost = ctx.volumeRatio >= PA_CONST.VOLUME_SPIKE_RATIO ? 10 : 0;
  const score = clamp(60 + (c.bodyPct - 92)*1.5 + volBoost);
  return {
    type: 'MARUBOZU', side,
    score: round(score,1),
    candleIndex: ctx.candleIndex ?? 0,
    timestamp: c.time,
    evidence: {
      bodyPct: round(c.bodyPct,1),
      upperWickPct: round(c.upperWickPct,1),
      lowerWickPct: round(c.lowerWickPct,1),
      volumeRatio: round(ctx.volumeRatio||1,2),
    },
    noRepaint: true,
  };
}

/** 3-bar reversal: 2 yön A, 1 yön B (güçlü), kapanış 2'inci mumun gövdesinin ortasının üstünde/altında */
export function detectThreeBarReversal(c, p, pp, ctx={}) {
  if (!c || !p || !pp) return null;
  // Bull reversal: pp & p düşüş, c yükseliş ve pp+p toplam gövdesinin ≥ %50'sini geri alır
  const downStreak = pp.bearish && p.bearish;
  const upStreak = pp.bullish && p.bullish;
  const totalPriorBody = pp.body + p.body;
  if (!totalPriorBody) return null;

  if (downStreak && c.bullish && c.body >= totalPriorBody*0.5) {
    const ppMidBody = (pp.open + pp.close)/2;
    if (c.close > ppMidBody) {
      const score = clamp(55 + (c.body/totalPriorBody)*30 + c.closePos*0.15);
      return {
        type: 'THREE_BAR_REVERSAL', side: 'LONG',
        score: round(score,1),
        candleIndex: ctx.candleIndex ?? 0,
        timestamp: c.time,
        subtype: 'bullish_engulf_3bar',
        evidence: {
          priorTwoBodyTotal: round(totalPriorBody,2),
          currBody: round(c.body,2),
          recoveryPct: round((c.body/totalPriorBody)*100,1),
        },
        noRepaint: true,
      };
    }
  }
  if (upStreak && c.bearish && c.body >= totalPriorBody*0.5) {
    const ppMidBody = (pp.open + pp.close)/2;
    if (c.close < ppMidBody) {
      const score = clamp(55 + (c.body/totalPriorBody)*30 + (100-c.closePos)*0.15);
      return {
        type: 'THREE_BAR_REVERSAL', side: 'SHORT',
        score: round(score,1),
        candleIndex: ctx.candleIndex ?? 0,
        timestamp: c.time,
        subtype: 'bearish_engulf_3bar',
        evidence: {
          priorTwoBodyTotal: round(totalPriorBody,2),
          currBody: round(c.body,2),
          recoveryPct: round((c.body/totalPriorBody)*100,1),
        },
        noRepaint: true,
      };
    }
  }
  return null;
}

/* ───────── Çekirdek Çalıştırıcı ─────────
 * Tek bir mum üstünde tüm dedektörleri çalıştırır. Olası birden fazla event döner.
 */
export function detectAllForCandle(c, p, pp, ctx={}) {
  if (!c) return [];
  const out = [];
  const e1 = detectEngulfing(c, p, ctx); if (e1) out.push(e1);
  const e2 = detectInsideBar(c, p, ctx); if (e2) out.push(e2);
  const e3 = detectOutsideBar(c, p, ctx); if (e3) out.push(e3);
  const e4 = detectDoji(c, p, ctx); if (e4) out.push(e4);
  const e5 = detectPinBar(c, p, ctx); if (e5) out.push(e5);
  const e6 = detectHammer(c, p, ctx); if (e6) out.push(e6);
  const e7 = detectShootingStar(c, p, ctx); if (e7) out.push(e7);
  const e8 = detectMarubozu(c, p, ctx); if (e8) out.push(e8);
  const e9 = detectThreeBarReversal(c, p, pp, ctx); if (e9) out.push(e9);
  return out;
}

/* ───────── Ana API ─────────
 * runFeatureEngine: ham mum dizisi alır, tüm closed mumlar için event ve feature stream üretir.
 * Çıkış: { events, features, summary, guard }
 */
export function runFeatureEngine(rawCandles = [], opts = {}) {
  const tf = opts.tf || '4h';
  const lookback = Math.max(5, Math.min(opts.lookback || 50, rawCandles.length));
  const now = opts.now ?? Date.now();
  const tfMs = tfToMs(tf);

  // Feature haline getir
  const all = rawCandles.map(candleFeatures).filter(Boolean);
  if (all.length < 4) {
    return {
      events: [],
      features: [],
      summary: { totalEvents:0, bullish:0, bearish:0, neutral:0, topEvent:null, bias:'NEUTRAL' },
      guard: { closedCount:0, openCandidate:null, tf, tfMs },
      warnings: ['Yetersiz mum verisi (min 4 mum gerekli).'],
    };
  }

  // Last raw candle: kapalı mı? (no-repaint guard)
  const lastRaw = rawCandles[rawCandles.length-1];
  const lastClosed = isClosedCandle(lastRaw, tfMs, now);
  const closedSet = lastClosed ? all : all.slice(0, -1); // son mum açıksa dahil etme
  const skipped = all.length - closedSet.length;

  // Volume ortalama (son 20 closed mum)
  const recentVols = closedSet.slice(-21, -1).map(c=>c.volume);
  const avgVol = recentVols.length ? recentVols.reduce((a,b)=>a+b,0)/recentVols.length : 0;

  // Prior trend tespiti (close mumlar üstünde 10-bar son eğim)
  function priorTrendAt(idx){
    if (idx < 11) return null;
    const slice = closedSet.slice(idx-10, idx);
    const first = slice[0].close, last = slice[slice.length-1].close;
    if (!first || !last) return null;
    const pct = ((last-first)/first)*100;
    if (pct >  1.5) return 'UP';
    if (pct < -1.5) return 'DOWN';
    return 'FLAT';
  }

  // Feature stream (son N closed candle)
  const features = [];
  const events = [];
  const startIdx = Math.max(2, closedSet.length - lookback);
  for (let i = startIdx; i < closedSet.length; i++) {
    const c  = closedSet[i];
    const p  = closedSet[i-1];
    const pp = closedSet[i-2];
    const volumeRatio = avgVol>0 ? c.volume/avgVol : 1;
    const priorTrend = priorTrendAt(i);
    const ctx = {
      candleIndex: closedSet.length - 1 - i, // 0 = en güncel
      volumeRatio, priorTrend,
    };
    features.push({
      candleIndex: ctx.candleIndex,
      timestamp: c.time,
      bullish: c.bullish,
      bodyPct: round(c.bodyPct,1),
      upperWickPct: round(c.upperWickPct,1),
      lowerWickPct: round(c.lowerWickPct,1),
      closePos: round(c.closePos,1),
      volumeRatio: round(volumeRatio,2),
      priorTrend,
    });
    const found = detectAllForCandle(c, p, pp, ctx);
    events.push(...found);
  }

  // Skora göre sırala (en güçlü önce)
  events.sort((a,b)=>(b.score||0)-(a.score||0));

  // Bias hesabı: en son 3 yüksek-skorlu event
  const recent = events.filter(e=>e.candleIndex <= 5).slice(0,5);
  let bullish=0, bearish=0, neutral=0;
  recent.forEach(e=>{
    if (e.side==='LONG') bullish += e.score;
    else if (e.side==='SHORT') bearish += e.score;
    else neutral += e.score;
  });
  const bias = bullish > bearish*1.15 ? 'LONG'
             : bearish > bullish*1.15 ? 'SHORT'
             : 'NEUTRAL';

  return {
    events,
    features,
    summary: {
      totalEvents: events.length,
      bullishScore: round(bullish,1),
      bearishScore: round(bearish,1),
      neutralScore: round(neutral,1),
      topEvent: events[0] || null,
      bias,
      lookback,
    },
    guard: {
      closedCount: closedSet.length,
      skippedOpenCandle: skipped > 0,
      tf, tfMs,
      lastClosedTimestamp: closedSet[closedSet.length-1]?.time ?? null,
      now,
    },
    warnings: [],
  };
}

/* ───────── Multi-TF Agregasyon ─────────
 * Her TF için runFeatureEngine sonuçlarını alır, ortak bias çıkarır.
 */
export function aggregateMultiTf(byTf = {}) {
  const tfs = Object.keys(byTf);
  if (!tfs.length) return { bias:'NEUTRAL', alignment:0, votes:{}, perTf:{} };
  const votes = { LONG:0, SHORT:0, NEUTRAL:0 };
  const perTf = {};
  tfs.forEach(tf=>{
    const r = byTf[tf];
    const b = r?.summary?.bias || 'NEUTRAL';
    votes[b] = (votes[b]||0) + 1;
    perTf[tf] = { bias:b, topEvent:r?.summary?.topEvent || null, totalEvents:r?.summary?.totalEvents||0 };
  });
  const dominant = Object.entries(votes).sort((a,b)=>b[1]-a[1])[0];
  const alignment = round((dominant[1] / tfs.length) * 100, 1);
  return { bias: dominant[0], alignment, votes, perTf, tfs };
}

/* ───────── Event tipi → Türkçe açıklama ───────── */
export const PA_EVENT_LABEL_TR = Object.freeze({
  ENGULFING: 'Sarmalama (Engulfing)',
  INSIDE_BAR: 'İçerideki Mum (Inside Bar)',
  OUTSIDE_BAR: 'Dışarıdaki Mum (Outside Bar)',
  DOJI: 'Doji',
  PIN_BAR: 'Pin Bar',
  HAMMER: 'Çekiç (Hammer)',
  SHOOTING_STAR: 'Yıldız Kayması (Shooting Star)',
  MARUBOZU: 'Marubozu',
  THREE_BAR_REVERSAL: 'Üç Mum Dönüşü',
});

export const PA_SUBTYPE_LABEL_TR = Object.freeze({
  standard: 'standart',
  gravestone: 'mezar taşı (gravestone)',
  dragonfly: 'yusufçuk (dragonfly)',
  long_legged: 'uzun bacaklı',
  bullish_engulf_3bar: 'boğa 3-mum sarmalama',
  bearish_engulf_3bar: 'ayı 3-mum sarmalama',
});

/* ───────── Versiyon ───────── */
export const PA_ENGINE_VERSION = '0.56.0-live-controls-20260519';
