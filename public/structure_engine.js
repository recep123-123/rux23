/* RUx — Market Structure / BOS / CHoCH / MSS Engine
 * ─────────────────────────────────────────────────────────
 * v0.50 PA Feature Engine'in üzerine kurulu. Swing pivot tespiti + market
 * structure state machine. Tüm event'ler v0.50 schema'sına uyumlu.
 *
 * Tanımlar:
 *   - SWING HIGH: index i'deki mum, sağında `len` mum boyunca daha düşük
 *     high değerleri tarafından takip edilirse confirmed pivot olur.
 *     "Confirmed at" = i + len. Bu tarihten önce no-repaint güvencesi var.
 *   - SWING LOW: simetrik.
 *   - BOS (Break of Structure): mevcut bias yönündeki devam kırılımı.
 *     UP biasta refHigh'ı kapanışla kırma → bull BOS.
 *     DOWN biasta refLow'u kapanışla kırma → bear BOS.
 *   - CHoCH (Change of Character): bias'a ters yönde ILK kırılım.
 *     Erken dönüş sinyali. UP'tan DOWN'a veya tersi.
 *   - MSS (Market Structure Shift): CHoCH sonrası yeni yön strüktürünün
 *     ONAYLANMASI. Yeni yönde HH-HL veya LH-LL oluştuğunda tetiklenir.
 *     CHoCH "ihtimal", MSS "teyit".
 *
 * No-repaint garantisi:
 *   1) Pivot yalnızca i+len indeksindeki mum kapandığında emit edilir
 *   2) BOS/CHoCH yalnızca kapanmış mum üstünde kontrol edilir
 *   3) Geçmiş event'ler asla geri çekilmez — her event timestamp'i ile
 *      kayıtlıdır ve görüldüğü an itibariyle gerçek bilgi içerir
 *
 * Tüm fonksiyonlar saf (pure). Aynı input → aynı output. Lookahead yok.
 */

import { isClosedCandle, tfToMs } from './pa_engine.js?v=0.75.14-heatmap-micro-polish-20260524';

/* ───────── Saf yardımcılar ───────── */
function num(x){ return Number.isFinite(Number(x)) ? Number(x) : NaN; }
function clamp(x, lo=0, hi=100){ return Math.max(lo, Math.min(hi, x)); }
function round(x, d=2){ const p=10**d; return Math.round(Number(x)*p)/p; }

/* ───────── Sabitler ───────── */
export const STRUCT_CONST = Object.freeze({
  // Swing pivot teyit süresi (mum sayısı her iki yan için)
  PIVOT_LEN_DEFAULT: 3,
  // Geçmiş tarama derinliği
  HISTORY_LOOKBACK: 200,
  // BOS/CHoCH için minimum body / range oranı (mum kalitesi filtresi)
  BREAK_BODY_PCT_MIN: 30,
  // Kırılım onayı için fiyatın level'ı aşma yüzdesi (mikro-sweep eliminasyonu)
  // Range'in bu yüzdesi kadar üstüne / altına kapanmalı
  BREAK_BUFFER_PCT: 0.05,
});

/* ───────── Confirmed Pivot Tespiti ─────────
 *
 * Bir mumun pivot olarak teyit edilmesi için:
 *   - High: sağındaki ve solundaki `len` mum DAHA DÜŞÜK high'a sahip olmalı
 *   - Low: sağındaki ve solundaki `len` mum DAHA YÜKSEK low'a sahip olmalı
 *
 * Dönüş: { highs, lows } her biri kronolojik sıralı
 *   { index, price, time, confirmedAtIndex, confirmedAtTime }
 *
 * confirmedAtIndex = pivotIndex + len (no-repaint için kritik)
 */
export function findConfirmedPivots(candles = [], len = STRUCT_CONST.PIVOT_LEN_DEFAULT) {
  const clean = candles.filter(c =>
    Number.isFinite(num(c.high)) && Number.isFinite(num(c.low))
  );
  const highs = [], lows = [];
  const start = len;
  const end = clean.length - len; // sağda en az len mum olmalı

  for (let i = start; i < end; i++) {
    const h = num(clean[i].high);
    const l = num(clean[i].low);
    let isHigh = true, isLow = true;
    for (let j = i - len; j <= i + len; j++) {
      if (j === i) continue;
      if (num(clean[j].high) >= h) isHigh = false;
      if (num(clean[j].low)  <= l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) {
      highs.push({
        index: i,
        price: h,
        time: clean[i].time ?? clean[i].openTime ?? null,
        confirmedAtIndex: i + len,
        confirmedAtTime: clean[i + len]?.time ?? clean[i + len]?.openTime ?? null,
      });
    }
    if (isLow) {
      lows.push({
        index: i,
        price: l,
        time: clean[i].time ?? clean[i].openTime ?? null,
        confirmedAtIndex: i + len,
        confirmedAtTime: clean[i + len]?.time ?? clean[i + len]?.openTime ?? null,
      });
    }
  }
  return { highs, lows };
}

/* ───────── Pivot Sequence Classification ─────────
 *
 * Confirmed pivot'lardan oluşan diziyi kronolojik olarak okur, her swing'i
 * önceki aynı-tip pivot'la karşılaştırarak etiketler:
 *   - HH: Higher High
 *   - LH: Lower High
 *   - HL: Higher Low
 *   - LL: Lower Low
 *
 * Dönüş: pivots dizisi her elemana label eklenmiş şekilde, kronolojik sıralı.
 */
export function classifySwingSequence(pivots = { highs: [], lows: [] }) {
  // Tüm pivot'ları kronolojik sıraya al
  const all = [];
  (pivots.highs || []).forEach(p => all.push({ ...p, type: 'HIGH' }));
  (pivots.lows  || []).forEach(p => all.push({ ...p, type: 'LOW' }));
  all.sort((a, b) => a.index - b.index);

  let prevHigh = null, prevLow = null;
  return all.map(p => {
    let label = null;
    if (p.type === 'HIGH') {
      if (prevHigh != null) label = p.price > prevHigh.price ? 'HH' : 'LH';
      prevHigh = p;
    } else {
      if (prevLow != null) label = p.price > prevLow.price ? 'HL' : 'LL';
      prevLow = p;
    }
    return { ...p, label };
  });
}

/* ───────── Anlık Yapı Sınıflandırması ─────────
 *
 * Son K (default 4) confirmed pivot'a bakarak şu anki bias'ı çıkar.
 * Dönüş: { bias: 'UP'|'DOWN'|'RANGE'|'MIXED'|'NEUTRAL', label, lastSwingHigh, lastSwingLow }
 */
export function classifyCurrentStructure(pivots = {}, lookbackPivots = 4) {
  const sequence = classifySwingSequence(pivots);
  if (sequence.length < 2) return {
    bias: 'NEUTRAL', label: 'Yetersiz pivot',
    lastSwingHigh: null, lastSwingLow: null, sequence: []
  };
  const tail = sequence.slice(-lookbackPivots);
  const lastHigh = sequence.filter(p => p.type === 'HIGH').at(-1) || null;
  const lastLow  = sequence.filter(p => p.type === 'LOW').at(-1) || null;

  const labels = tail.map(p => p.label).filter(Boolean);
  const hhCount = labels.filter(l => l === 'HH').length;
  const hlCount = labels.filter(l => l === 'HL').length;
  const lhCount = labels.filter(l => l === 'LH').length;
  const llCount = labels.filter(l => l === 'LL').length;

  let bias = 'NEUTRAL', label = 'Karma yapı';
  if (hhCount >= 1 && hlCount >= 1 && llCount === 0)      { bias = 'UP';    label = 'HH / HL boğa yapısı'; }
  else if (lhCount >= 1 && llCount >= 1 && hhCount === 0) { bias = 'DOWN';  label = 'LH / LL ayı yapısı'; }
  else if (hhCount >= 1 && llCount >= 1)                  { bias = 'MIXED'; label = 'Genişleyen / kararsız yapı'; }
  else if (lhCount >= 1 && hlCount >= 1)                  { bias = 'RANGE'; label = 'Sıkışan / range yapısı'; }

  return { bias, label, lastSwingHigh: lastHigh, lastSwingLow: lastLow, sequence };
}

/* ───────── Ana Engine ─────────
 *
 * runStructureEngine: ham mum dizisi + opts alır, kronolojik olarak yürüyerek
 * BOS / CHoCH / MSS event'lerini emit eder. State machine yaklaşımı.
 *
 * State:
 *   bias: 'UP' | 'DOWN' | 'NEUTRAL'
 *   refHigh: { index, price, label } | null   ← son kırılmamış swing high
 *   refLow:  { index, price, label } | null   ← son kırılmamış swing low
 *   awaitMssBull: boolean  ← son CHoCH bullish'ti, MSS bekleniyor
 *   awaitMssBear: boolean  ← son CHoCH bearish'ti, MSS bekleniyor
 *
 * Dönüş: { events, structure, levels, summary, guard, warnings }
 */
export function runStructureEngine(candles = [], opts = {}) {
  const tf = opts.tf || '4h';
  const len = opts.pivotLen || STRUCT_CONST.PIVOT_LEN_DEFAULT;
  const lookback = Math.min(opts.lookback || STRUCT_CONST.HISTORY_LOOKBACK, candles.length);
  const now = opts.now ?? Date.now();
  const tfMs = tfToMs(tf);
  const debug = !!opts.debug;

  if (candles.length < len * 2 + 4) {
    return {
      events: [], structure: { bias:'NEUTRAL', label:'Yetersiz veri' },
      levels: { refHigh: null, refLow: null },
      summary: { bosCount:0, chochCount:0, mssCount:0, swingCount:0, topEvent:null, bias:'NEUTRAL' },
      guard: { closedCount: 0, skippedOpenCandle: false, tf, tfMs },
      warnings: ['Yetersiz mum verisi (min ' + (len*2+4) + ' mum gerekli).'],
    };
  }

  // No-repaint: açık mumu çıkar
  const lastRaw = candles[candles.length - 1];
  const lastClosed = isClosedCandle(lastRaw, tfMs, now);
  const closed = lastClosed ? candles : candles.slice(0, -1);
  const skipped = candles.length - closed.length;

  // Confirmed pivot'lar (yalnızca closed üstünde çalışıyoruz)
  const pivots = findConfirmedPivots(closed, len);
  const sequence = classifySwingSequence(pivots);

  // ATR proxy (range ortalaması) — break buffer için
  const recentRanges = closed.slice(-30).map(c => num(c.high) - num(c.low)).filter(Number.isFinite);
  const avgRange = recentRanges.length
    ? recentRanges.reduce((a,b)=>a+b,0) / recentRanges.length
    : 0;
  const buffer = avgRange * STRUCT_CONST.BREAK_BUFFER_PCT;

  // Kronolojik state machine yürüyüşü
  let bias = 'NEUTRAL';
  let refHigh = null, refLow = null;
  let awaitMssBull = false, awaitMssBear = false;
  const events = [];

  // Pivot'ları confirmedAt'a göre indekslemek — hangi candle index'inde available oldu
  const pivotsByConfirmedAt = new Map();
  sequence.forEach(p => {
    const k = p.confirmedAtIndex;
    if (!pivotsByConfirmedAt.has(k)) pivotsByConfirmedAt.set(k, []);
    pivotsByConfirmedAt.get(k).push(p);
  });

  // Lookback window (engine sadece son N mumda event arar ama state global)
  const startIdx = Math.max(len, closed.length - lookback);

  for (let i = 0; i < closed.length; i++) {
    const c = closed[i];
    const close = num(c.close);
    const high = num(c.high);
    const low  = num(c.low);
    const open = num(c.open);
    const range = Math.max(high - low, 1e-9);
    const body = Math.abs(close - open);
    const bodyPct = (body / range) * 100;
    const candleIndex = closed.length - 1 - i; // 0 = en güncel

    // 1) Bu index'te confirmed olan pivot var mı? Varsa state'e ekle
    if (pivotsByConfirmedAt.has(i)) {
      const newPivots = pivotsByConfirmedAt.get(i);
      newPivots.forEach(p => {
        // refHigh/refLow güncelle
        if (p.type === 'HIGH') {
          refHigh = { ...p };
        } else {
          refLow = { ...p };
        }

        // SWING event yayınla (lookback içindeyse)
        if (i >= startIdx) {
          events.push({
            type: p.type === 'HIGH' ? 'SWING_HIGH' : 'SWING_LOW',
            side: 'NEUTRAL',
            score: 50,
            candleIndex,
            timestamp: c.time ?? c.openTime ?? null,
            subtype: p.label || null,
            evidence: {
              price: round(p.price, 4),
              pivotIndex: p.index,
              confirmedAtIndex: p.confirmedAtIndex,
              barsToConfirm: p.confirmedAtIndex - p.index,
            },
            noRepaint: true,
          });
        }

        // MSS confirmation kontrolü
        if (awaitMssBull && p.type === 'LOW' && p.label === 'HL') {
          if (i >= startIdx) {
            events.push({
              type: 'MSS',
              side: 'LONG',
              score: 78,
              candleIndex,
              timestamp: c.time ?? c.openTime ?? null,
              subtype: 'bullish_confirmed',
              evidence: {
                triggerLevel: round(p.price, 4),
                newStructureLabel: 'HL after CHoCH',
                detail: 'CHoCH sonrası ilk HL oluştu → yeni yön yapısı teyit',
              },
              noRepaint: true,
            });
          }
          awaitMssBull = false;
        }
        if (awaitMssBear && p.type === 'HIGH' && p.label === 'LH') {
          if (i >= startIdx) {
            events.push({
              type: 'MSS',
              side: 'SHORT',
              score: 78,
              candleIndex,
              timestamp: c.time ?? c.openTime ?? null,
              subtype: 'bearish_confirmed',
              evidence: {
                triggerLevel: round(p.price, 4),
                newStructureLabel: 'LH after CHoCH',
                detail: 'CHoCH sonrası ilk LH oluştu → yeni yön yapısı teyit',
              },
              noRepaint: true,
            });
          }
          awaitMssBear = false;
        }
      });
    }

    // 2) BOS / CHoCH kontrolü — bu mum kapanışı bir reference level'ı kırdı mı?
    if (refHigh && close > refHigh.price + buffer && bodyPct >= STRUCT_CONST.BREAK_BODY_PCT_MIN) {
      // BOS: bias UP (devam) VEYA bias NEUTRAL (ilk yön tanımı)
      // CHOCH: bias DOWN (ters yön kırılımı)
      const isContinuation = bias === 'UP' || bias === 'NEUTRAL';
      const eventType = isContinuation ? 'BOS' : 'CHOCH';
      const eventScore = isContinuation
        ? clamp(60 + (bodyPct - 30) * 0.6)
        : clamp(70 + (bodyPct - 30) * 0.5);

      if (i >= startIdx) {
        events.push({
          type: eventType,
          side: 'LONG',
          score: round(eventScore, 1),
          candleIndex,
          timestamp: c.time ?? c.openTime ?? null,
          subtype: isContinuation
            ? (bias === 'UP' ? 'continuation_bull' : 'initial_trend_bull')
            : 'reversal_bull',
          evidence: {
            brokenLevel: round(refHigh.price, 4),
            closePrice: round(close, 4),
            bufferPct: round((buffer / refHigh.price) * 100, 3),
            bodyPct: round(bodyPct, 1),
            priorBias: bias,
            distanceFromLevel: round(close - refHigh.price, 4),
          },
          noRepaint: true,
        });
      }

      // State update
      if (eventType === 'CHOCH') {
        awaitMssBull = true;
        awaitMssBear = false;
      }
      bias = 'UP';
      refHigh = null;
    }

    if (refLow && close < refLow.price - buffer && bodyPct >= STRUCT_CONST.BREAK_BODY_PCT_MIN) {
      const isContinuation = bias === 'DOWN' || bias === 'NEUTRAL';
      const eventType = isContinuation ? 'BOS' : 'CHOCH';
      const eventScore = isContinuation
        ? clamp(60 + (bodyPct - 30) * 0.6)
        : clamp(70 + (bodyPct - 30) * 0.5);

      if (i >= startIdx) {
        events.push({
          type: eventType,
          side: 'SHORT',
          score: round(eventScore, 1),
          candleIndex,
          timestamp: c.time ?? c.openTime ?? null,
          subtype: isContinuation
            ? (bias === 'DOWN' ? 'continuation_bear' : 'initial_trend_bear')
            : 'reversal_bear',
          evidence: {
            brokenLevel: round(refLow.price, 4),
            closePrice: round(close, 4),
            bufferPct: round((buffer / refLow.price) * 100, 3),
            bodyPct: round(bodyPct, 1),
            priorBias: bias,
            distanceFromLevel: round(refLow.price - close, 4),
          },
          noRepaint: true,
        });
      }

      if (eventType === 'CHOCH') {
        awaitMssBear = true;
        awaitMssBull = false;
      }
      bias = 'DOWN';
      refLow = null;
    }
  }

  // Final structure özet
  const structure = classifyCurrentStructure(pivots);
  // Eğer state machine bir bias geliştirdiyse onu kullan, yoksa swing-based bias
  const effectiveBias = (bias !== 'NEUTRAL') ? bias : structure.bias;

  const bosCount = events.filter(e => e.type === 'BOS').length;
  const chochCount = events.filter(e => e.type === 'CHOCH').length;
  const mssCount = events.filter(e => e.type === 'MSS').length;
  const swingCount = events.filter(e => e.type === 'SWING_HIGH' || e.type === 'SWING_LOW').length;

  // Skora göre sırala (timeline için ayrı sürüm istenirse caller sıralayabilir)
  const sortedEvents = [...events].sort((a, b) => (b.score||0) - (a.score||0));

  return {
    events: sortedEvents,
    eventsChronological: events,
    structure: { ...structure, bias: effectiveBias, stateMachineBias: bias },
    levels: {
      refHigh: refHigh ? { price: round(refHigh.price,4), index: refHigh.index, label: refHigh.label } : null,
      refLow:  refLow  ? { price: round(refLow.price,4),  index: refLow.index,  label: refLow.label  } : null,
    },
    summary: {
      bias: effectiveBias,
      bosCount, chochCount, mssCount, swingCount,
      totalEvents: events.length,
      awaitingMssBull: awaitMssBull,
      awaitingMssBear: awaitMssBear,
      topEvent: sortedEvents[0] || null,
      lookback,
    },
    guard: {
      closedCount: closed.length,
      skippedOpenCandle: skipped > 0,
      tf, tfMs,
      pivotLen: len,
      lastClosedTimestamp: closed[closed.length-1]?.time ?? closed[closed.length-1]?.openTime ?? null,
      now,
    },
    warnings: [],
  };
}

/* ───────── Türkçe etiketler ───────── */
export const STRUCT_EVENT_LABEL_TR = Object.freeze({
  BOS:         'Yapı Kırılımı (BOS)',
  CHOCH:       'Karakter Değişimi (CHoCH)',
  MSS:         'Yapı Kayması (MSS)',
  SWING_HIGH:  'Swing High',
  SWING_LOW:   'Swing Low',
});

export const STRUCT_BIAS_LABEL_TR = Object.freeze({
  UP:      'Yükseliş',
  DOWN:    'Düşüş',
  RANGE:   'Yatay / Range',
  MIXED:   'Kararsız',
  NEUTRAL: 'Nötr',
});

export const STRUCT_SUBTYPE_LABEL_TR = Object.freeze({
  continuation_bull:  'boğa devam',
  continuation_bear:  'ayı devam',
  reversal_bull:      'boğa dönüş',
  reversal_bear:      'ayı dönüş',
  initial_trend_bull: 'ilk boğa yön',
  initial_trend_bear: 'ilk ayı yön',
  bullish_confirmed:  'boğa teyit',
  bearish_confirmed:  'ayı teyit',
  HH: 'Higher High',
  LH: 'Lower High',
  HL: 'Higher Low',
  LL: 'Lower Low',
});

export const STRUCTURE_ENGINE_VERSION = '0.56.0-live-controls-20260519';
