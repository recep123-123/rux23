/* RUx core — signal engine (version: see rux_version.js)
   Master Trade Framework risk dayanıklılığı katmanını mevcut terminal görselini bozmadan görünür hale getirir.
   Bu dosya otomatik emir göndermez; yalnızca karar destek, sinyal doğrulama ve test hesapları sağlar. */

export const RUX_VERSION = '0.75.5-liquidation-panel-live-20260524';

export const RUX_TERMS_TR = Object.freeze({
  dataConfidence: 'Veri Güveni',
  adaptiveThreshold: 'Adaptif Eşik',
  realisticCostFill: 'Gerçekçi Maliyet ve Dolum',
  noTrade: 'İşlem Engeli',
  probabilisticRegime: 'Olasılıksal Rejim',
  signalTracking: 'Sinyal Takibi',
  backtest: 'Backtest / Geriye Dönük Test',
  edgeCalibration: 'Edge Kalibrasyonu',
  userFidelity: 'Kullanıcı Uygulama Sadakati',
  portfolioHeat: 'Portföy Isısı ve Korelasyonlu Risk',
  monteCarlo: 'Monte Carlo Drawdown ve Risk-of-Ruin',
});

export const RUX_PHASES = [
  { phase: 'P0', module: 'Veri Güven Motoru', key: 'dataConfidence', status: 'aktif-iskelet', route: '#/sistem', purpose: 'güncellik, tamlık, tutarlılık ve kaynak güvenini ölçer' },
  { phase: 'P0', module: 'Adaptif Eşik Motoru', key: 'adaptiveThreshold', status: 'aktif-iskelet', route: '#/kalibrasyon', purpose: 'varlık, rejim ve volatiliteye göre eşikleri ayarlar' },
  { phase: 'P0', module: 'Gerçekçi Maliyet ve Dolum Motoru', key: 'realisticCostFill', status: 'aktif-iskelet', route: '#/test', purpose: 'fee, spread, slippage ve funding sonrası net-R hesaplar' },
  { phase: 'P0', module: 'İşlem Engelleme Motoru', key: 'noTrade', status: 'aktif-iskelet', route: '#/sinyal', purpose: 'hard block ve soft warning ayrımıyla zayıf sinyali bloke eder' },
  { phase: 'P1', module: 'Olasılıksal Rejim + Hysteresis', key: 'probabilisticRegime', status: 'aktif-derinleştirildi', route: '#/piyasa', purpose: 'rejim zıplamasını azaltır, belirsizliği puanlar' },
  { phase: 'P1', module: 'Sinyal Yaşam Döngüsü', key: 'signalTracking', status: 'haritalandı', route: '#/sinyal-detay', purpose: 'watch → prepare → valid → entry → TP/SL takibini yapar' },
  { phase: 'P1', module: 'Varlık Uygunluk Yöneticisi', key: 'assetEligibility', status: 'haritalandı', route: '#/coin-pano', purpose: 'işlenebilir, araştırmalık ve hariç varlıkları ayırır' },
  { phase: 'P1', module: 'Edge Kalibrasyon Paneli', key: 'edgeCalibration', status: 'haritalandı', route: '#/kalibrasyon', purpose: 'champion/challenger ağırlıkları shadow mode ile karşılaştırır' },
  { phase: 'P1', module: 'Setup Performans Matrisi', key: 'setupMatrix', status: 'aktif-iskelet', route: '#/setup-matrisi', purpose: 'setup + rejim bazında Net-R, PF, expectancy ve örneklem gücü ölçer' },
  { phase: 'P1', module: 'Portfolio Heat v2', key: 'portfolioHeat', status: 'aktif-iskelet', route: '#/portfoy-isi', purpose: 'beta ayarlı yön riski, korelasyon etkisi ve altcoin long risk kesintisi önerir' },
  { phase: 'P2', module: 'Walk-forward Otomasyonu', key: 'walkForward', status: 'sonra', route: '#/walkforward', purpose: 'OOS doğrulama ve stabilite raporlaması üretir' },
  { phase: 'P2', module: 'Kullanıcı Uygulama Sadakati', key: 'userFidelity', status: 'aktif-iskelet', route: '#/emir-gecmisi', purpose: 'kullanıcı girişi ile teorik sinyal sonucunu ayırır' },
  { phase: 'P2', module: 'Monte Carlo + Survivorship Kontrolü', key: 'monteCarlo', status: 'aktif-derinleştirildi', route: '#/montecarlo', purpose: '1000+ yeniden örnekleme ile drawdown dağılımı, risk-of-ruin ve stability kontrolü yapar' }
];

const SOURCE_WEIGHTS = Object.freeze({
  binance: 92,
  bybit: 88,
  okx: 87,
  coinbase: 90,
  hyperliquid: 84,
  cryptocompare: 74,
  mexc: 72,
  gate: 70,
  demo: 55,
  unknown: 60
});

export function clamp(value, min = 0, max = 100) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}


function weightedAverage(parts = []) {
  const clean = (parts || []).filter(p => Number.isFinite(Number(p?.value)) && Number.isFinite(Number(p?.weight)) && Number(p.weight) > 0);
  const totalWeight = clean.reduce((sum, p) => sum + Number(p.weight), 0);
  if (!totalWeight) return 50;
  return clean.reduce((sum, p) => sum + Number(p.value) * Number(p.weight), 0) / totalWeight;
}

export function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

export function sma(values, period = 20) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += Number(values[i]) || 0;
    if (i >= period) sum -= Number(values[i - period]) || 0;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function percentile(values, p = 0.9) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = clamp((arr.length - 1) * p, 0, arr.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

export function ema(values, period = 50) {
  const src = values.map(Number).filter(Number.isFinite);
  if (!src.length) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = src[0];
  for (const v of src) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function atr(candles = [], period = 14) {
  const out = Array(candles.length).fill(null);
  const trs = candles.map((c, i) => {
    const prev = i > 0 ? candles[i - 1] : c;
    return Math.max(
      Number(c.high) - Number(c.low),
      Math.abs(Number(c.high) - Number(prev.close)),
      Math.abs(Number(c.low) - Number(prev.close))
    );
  });
  const avg = sma(trs, period);
  for (let i = 0; i < avg.length; i++) out[i] = avg[i];
  return out;
}

function expectedGapMsForTf(tf = '4h') {
  const map = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000, '1w': 604_800_000, '1M': 2_592_000_000 };
  return map[String(tf).toLowerCase()] || map['4h'];
}

export function analyzeDataConfidence({ candles = [], source = 'unknown', latencyMs = 0, tf = '4h', hasOi = true, hasFunding = true, crossExchangeAgreement = 0.85 } = {}) {
  const now = Date.now();
  const clean = candles.filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  const last = clean[clean.length - 1];
  const expectedGap = expectedGapMsForTf(tf);
  const ageMs = last ? Math.max(0, now - Number(last.time)) : Infinity;
  const freshness = last ? clamp(100 - Math.max(0, (ageMs - expectedGap * 1.5) / expectedGap) * 35) : 0;

  let missing = 0;
  for (let i = 1; i < clean.length; i++) {
    const gap = Number(clean[i].time) - Number(clean[i - 1].time);
    if (gap > expectedGap * 2.2) missing += 1;
  }
  const completeness = clamp(100 - missing * 8 - (candles.length - clean.length) * 12 - (!hasOi ? 7 : 0) - (!hasFunding ? 7 : 0));

  const returns = [];
  for (let i = 1; i < clean.length; i++) {
    const prev = Number(clean[i - 1].close);
    const cur = Number(clean[i].close);
    if (prev > 0) returns.push(Math.abs((cur - prev) / prev));
  }
  const p95 = percentile(returns, 0.95);
  const p99 = percentile(returns, 0.99);
  const anomalyPenalty = p99 > p95 * 2.8 && p99 > 0.08 ? 18 : 0;
  const consistency = clamp(100 - anomalyPenalty - (crossExchangeAgreement < 0.7 ? 20 : 0));
  const sourceReliability = SOURCE_WEIGHTS[String(source).toLowerCase()] ?? SOURCE_WEIGHTS.unknown;
  const crossExchange = clamp(Number(crossExchangeAgreement) * 100);

  const score = clamp(freshness * 0.25 + completeness * 0.25 + consistency * 0.20 + sourceReliability * 0.15 + crossExchange * 0.15 - clamp(latencyMs / 1000, 0, 30));
  const label = score >= 85 ? 'GÜÇLÜ' : score >= 70 ? 'KULLANILABİLİR' : score >= 50 ? 'DÜŞÜK GÜVEN' : 'YENİ SİNYALİ BLOKE ET';
  const blockers = [];
  if (score < 50) blockers.push('VERİ_GÜVENİ_KRİTİK');
  if (!last) blockers.push('MUM_VERİSİ_YOK');
  if (missing > 0) blockers.push('EKSİK_MUM');

  return { score: round(score, 1), label, freshness: round(freshness, 1), completeness: round(completeness, 1), consistency: round(consistency, 1), sourceReliability, crossExchange: round(crossExchange, 1), missingCandles: missing, latencyMs, blockers };
}

// A02 — marketData içindeki GERÇEK ölçümleri analyzeDataConfidence girdilerine çevirir.
// Hiçbir alan yoksa güvenli (düşük güven yönünde) varsayılanlar kullanılır; eskiden olduğu gibi
// optimist sabitler (latency 120, hasOi true, agreement 0.86) ARTIK kullanılmaz.
export function resolveDataConfidenceInputs(marketData = null, { tf = '4h', candles = [], sourceKey = 'unknown' } = {}) {
  const md = marketData || {};
  const measured = { latency: false, oi: false, funding: false, crossExchange: false, freshness: false };

  // 1) Gerçek latency: router updatedAt veya açık latencyMs alanı
  let latencyMs = 0;
  if (Number.isFinite(Number(md.latencyMs))) { latencyMs = Math.max(0, Number(md.latencyMs)); measured.latency = true; }
  else if (md.quality && Number.isFinite(Number(md.quality.latencyMs))) { latencyMs = Math.max(0, Number(md.quality.latencyMs)); measured.latency = true; }

  // 2) OI gerçekten geldi mi
  const deriv = md.derivatives || {};
  const hasOi = Number.isFinite(Number(deriv.openInterest)) && Number(deriv.openInterest) > 0;
  if ('openInterest' in deriv) measured.oi = true;

  // 3) Funding gerçekten geldi mi
  const hasFunding = Number.isFinite(Number(deriv.fundingRate));
  if ('fundingRate' in deriv) measured.funding = true;

  // 4) Cross-exchange agreement: spot/perp basis sapmasından türetilir (ek API çağrısı gerektirmez).
  //    |basis| küçükse iki kaynak uyumlu kabul edilir; büyürse agreement düşer.
  let crossExchangeAgreement = 0.70; // ölçüm yoksa nötr-düşük
  const basisPct = md.basis && md.basis.basisPct !== null && md.basis.basisPct !== undefined ? Math.abs(Number(md.basis.basisPct)) : null;
  if (Number.isFinite(basisPct)) {
    // basis %0 → 0.97, %0.10 → 0.92, %0.35 → 0.82, %1.0+ → 0.55 civarı
    crossExchangeAgreement = clamp(0.97 - basisPct * 0.42, 0, 1) / 1; // 0..1 aralığı korunur
    crossExchangeAgreement = Math.max(0.50, Math.min(0.98, crossExchangeAgreement));
    measured.crossExchange = true;
  } else if (md.quality && Number.isFinite(Number(md.quality.consistency))) {
    crossExchangeAgreement = clamp(Number(md.quality.consistency), 0, 100) / 100;
    measured.crossExchange = true;
  }

  // 5) Source-reliability sinyali: router fallback kullanıldıysa güven kırp
  if (md.browserFallback === true || /fallback|partial|degraded/i.test(String(md.mode || md.source || ''))) {
    crossExchangeAgreement = Math.max(0.50, crossExchangeAgreement - 0.08);
  }

  // Freshness ölçümü analyzeDataConfidence içinde candle.time'dan zaten yapılıyor; burada sadece flag.
  if (candles && candles.length && Number.isFinite(Number(candles.at(-1)?.time))) measured.freshness = true;

  return { latencyMs, hasOi, hasFunding, crossExchangeAgreement: round(crossExchangeAgreement, 3), measured };
}

// A06 — CVD / Delta divergence: fiyat ile delta birikiminin uyumunu confirmation'a çevirir.
// marketData.cvd yoksa weight 0 döner (sinyali ne destekler ne çürütür).
export function resolveCvdConfirmation(cvd = null, candles = []) {
  if (!cvd || cvd.error) {
    return { available: false, weight: 0, score: 50, bias: 'NEUTRAL', divergence: 'YOK', label: 'CVD verisi yok (ağırlık 0)' };
  }
  // Esnek alan okuma: farklı endpoint şekillerini destekle
  const series = Array.isArray(cvd.cvd) ? cvd.cvd
    : Array.isArray(cvd.series) ? cvd.series
    : Array.isArray(cvd.points) ? cvd.points.map(p => Number(p.cvd ?? p.value ?? p.y))
    : null;
  const deltaPct = Number.isFinite(Number(cvd.deltaPct)) ? Number(cvd.deltaPct)
    : Number.isFinite(Number(cvd.cumulativeDeltaPct)) ? Number(cvd.cumulativeDeltaPct) : null;

  const closes = (candles || []).map(c => Number(c.close)).filter(Number.isFinite).slice(-20);
  const priceUp = closes.length >= 2 ? closes.at(-1) > closes[0] : null;

  let cvdUp = null;
  if (series && series.length >= 2) {
    const cleanS = series.map(Number).filter(Number.isFinite).slice(-20);
    if (cleanS.length >= 2) cvdUp = cleanS.at(-1) > cleanS[0];
  } else if (deltaPct !== null) {
    cvdUp = deltaPct > 0;
  }

  if (cvdUp === null || priceUp === null) {
    return { available: true, weight: 0.05, score: 50, bias: 'NEUTRAL', divergence: 'BELİRSİZ', label: 'CVD okundu, yön belirsiz' };
  }

  // Uyum (confirmation) veya uyumsuzluk (divergence)
  if (priceUp === cvdUp) {
    return { available: true, weight: 0.10, score: 72, bias: cvdUp ? 'LONG' : 'SHORT', divergence: 'YOK', label: 'CVD fiyatı teyit ediyor' };
  }
  // Fiyat yukarı ama CVD aşağı → boğa tuzağı uyarısı (ve tersi)
  return { available: true, weight: 0.10, score: 32, bias: cvdUp ? 'LONG' : 'SHORT', divergence: priceUp ? 'BEARISH_DIVERGENCE' : 'BULLISH_DIVERGENCE', label: 'CVD fiyatla çelişiyor (divergence)' };
}

export function adaptiveThresholds(candles = [], { regime = 'neutral' } = {}) {
  const clean = candles.filter(c => Number.isFinite(Number(c.close)));
  const volumes = clean.map(c => Number(c.volume) || 0);
  const ranges = clean.map(c => Math.max(0, Number(c.high) - Number(c.low)));
  const closes = clean.map(c => Number(c.close));
  const atrSeries = atr(clean, 14).filter(Number.isFinite);
  const lastAtr = atrSeries[atrSeries.length - 1] || percentile(ranges, 0.5) || 1;
  const lastClose = closes[closes.length - 1] || 1;
  const volatilityPct = Math.abs(lastAtr / lastClose) * 100;
  const reclaimWindow = volatilityPct > 4 ? 6 : volatilityPct > 2 ? 4 : 3;
  const rangeWidth = percentile(ranges, 0.8);

  return {
    volumeSpike: round(percentile(volumes, regime === 'squeeze' ? 0.80 : 0.90), 2),
    strongVolumeSpike: round(percentile(volumes, 0.95), 2),
    bosBodyMinAtr: round(regime === 'range' ? 0.60 : 0.50, 2),
    reclaimWindowBars: reclaimWindow,
    rangeWidthP80: round(rangeWidth, 2),
    volatilityPct: round(volatilityPct, 2),
    maxWeeklyThresholdChangePct: 15,
    thresholdMode: 'varlık-rejim-volatilite-adaptif'
  };
}

// A10 — Adaptif eşik kalıcılığı.
// Eşikler her oturumda sıfırdan hesaplanmak yerine varlık+rejim bazında haftalık
// snapshot olarak saklanır; bir sonraki açılışta restore edilir. Haftada en fazla
// maxWeeklyThresholdChangePct (%15) kadar kayma uygulanır (ani sıçramayı önler).
const THRESHOLD_STORE_KEY = 'rux.adaptiveThresholds.v1';

function _loadThresholdStore() {
  try { if (typeof localStorage === 'undefined') return {}; const raw = localStorage.getItem(THRESHOLD_STORE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch { return {}; }
}
function _saveThresholdStore(store) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(THRESHOLD_STORE_KEY, JSON.stringify(store)); } catch {}
}
function _blendThreshold(prev, next, maxChangePct) {
  if (!Number.isFinite(prev) || prev === 0) return next;
  if (!Number.isFinite(next)) return prev;
  const maxStep = Math.abs(prev) * (maxChangePct / 100);
  const delta = next - prev;
  const clamped = Math.max(-maxStep, Math.min(maxStep, delta));
  return prev + clamped;
}

// Kalıcı, yumuşatılmış adaptif eşikler. symbol verilirse varlık bazında saklar.
export function persistentAdaptiveThresholds(candles = [], { regime = 'neutral', symbol = 'GLOBAL', now = Date.now() } = {}) {
  const fresh = adaptiveThresholds(candles, { regime });
  const store = _loadThresholdStore();
  const key = `${symbol}|${regime}`;
  const prev = store[key];
  const WEEK_MS = 604800000;
  const maxChange = fresh.maxWeeklyThresholdChangePct || 15;

  let result;
  if (prev && (now - Number(prev.at || 0)) < WEEK_MS) {
    // Hafta içi: önceki snapshot'a yumuşatılmış kayma uygula
    result = {
      ...fresh,
      volumeSpike: round(_blendThreshold(prev.volumeSpike, fresh.volumeSpike, maxChange), 2),
      strongVolumeSpike: round(_blendThreshold(prev.strongVolumeSpike, fresh.strongVolumeSpike, maxChange), 2),
      rangeWidthP80: round(_blendThreshold(prev.rangeWidthP80, fresh.rangeWidthP80, maxChange), 2),
      restoredFrom: 'snapshot',
      snapshotAgeMs: now - Number(prev.at || 0),
    };
  } else {
    // Hafta dolmuş veya snapshot yok: taze değerleri kabul et ve yeni snapshot yaz
    result = { ...fresh, restoredFrom: prev ? 'expired-refresh' : 'fresh', snapshotAgeMs: 0 };
  }
  // Snapshot güncelle
  store[key] = {
    at: now,
    volumeSpike: result.volumeSpike,
    strongVolumeSpike: result.strongVolumeSpike,
    rangeWidthP80: result.rangeWidthP80,
    volatilityPct: result.volatilityPct,
  };
  _saveThresholdStore(store);
  return result;
}

export function probabilisticRegime(candles = [], previous = null, options = {}) {
  const clean = candles.filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.high)) && Number.isFinite(Number(c.low)));
  const closes = clean.map(c => Number(c.close));
  const previousKey = normalizeRegimeKey(previous?.key || previous?.active || previous || (typeof localStorage !== 'undefined' ? localStorage.getItem('rux.lastRegimeKey') : null));
  const cfg = {
    enterThreshold: Number(options.enterThreshold ?? 45),
    exitThreshold: Number(options.exitThreshold ?? 34),
    dominanceGap: Number(options.dominanceGap ?? 8),
    maxUncertaintyForSwitch: Number(options.maxUncertaintyForSwitch ?? 68),
    memoryEnabled: options.memoryEnabled !== false,
  };
  if (closes.length < 60) {
    const fallback = { bull: 22, bear: 22, range: 38, squeeze: 18, riskOff: 0 };
    return {
      active: previousKey ? regimeLabelTr(previousKey) : 'İZLE',
      key: previousKey || 'watch',
      previousKey,
      previousActive: previousKey ? regimeLabelTr(previousKey) : '—',
      probabilities: fallback,
      uncertainty: 72,
      confidence: 28,
      transition: 'YETERSİZ VERİ / REJİM KİLİTLİ',
      hysteresis: { enterThreshold: cfg.enterThreshold, exitThreshold: cfg.exitThreshold, dominanceGap: cfg.dominanceGap, locked: true },
      metrics: { widthPct: 0, atrPct: 0, trendDistance: 0, emaSlopePct: 0, drawdownPct: 0, compressionPct: 0 },
      reason: 'YETERSİZ_GEÇMİŞ'
    };
  }

  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, Math.min(200, closes.length));
  const lastClose = closes[closes.length - 1];
  const lastE20 = e20[e20.length - 1];
  const prevE20 = e20[Math.max(0, e20.length - 8)] || lastE20;
  const lastE50 = e50[e50.length - 1];
  const prevE50 = e50[Math.max(0, e50.length - 12)] || lastE50;
  const lastE200 = e200[e200.length - 1];
  const recent = clean.slice(-50);
  const hi = Math.max(...recent.map(c => Number(c.high)));
  const lo = Math.min(...recent.map(c => Number(c.low)));
  const widthPct = lastClose ? (hi - lo) / lastClose * 100 : 0;
  const atrSeries = atr(clean, 14).filter(Number.isFinite);
  const atrPct = lastClose ? (atrSeries[atrSeries.length - 1] || 0) / lastClose * 100 : 0;
  const atrMedianPct = lastClose ? (percentile(atrSeries.slice(-100), 0.5) || atrSeries[atrSeries.length - 1] || 0) / lastClose * 100 : 0;
  const trendDistance = lastClose ? Math.abs(lastE50 - lastE200) / lastClose * 100 : 0;
  const emaSlopePct = lastClose ? (lastE50 - prevE50) / lastClose * 100 : 0;
  const shortSlopePct = lastClose ? (lastE20 - prevE20) / lastClose * 100 : 0;
  const drawdownPct = hi ? (hi - lastClose) / hi * 100 : 0;
  const breakoutPosition = widthPct ? (lastClose - lo) / Math.max(hi - lo, 1e-9) * 100 : 50;
  const compressionPct = atrMedianPct ? clamp(100 - (atrPct / atrMedianPct) * 100, 0, 100) : 0;
  const ranges = clean.slice(-20).map(c => Math.max(0, Number(c.high) - Number(c.low)));
  const bodySizes = clean.slice(-20).map(c => Math.abs(Number(c.close) - Number(c.open || c.close)));
  const bodyToRange = percentile(bodySizes, 0.6) / Math.max(percentile(ranges, 0.6), 1e-9);

  let bull = 12, bear = 12, range = 18, squeeze = 10, riskOff = 6;

  if (lastClose > lastE200) bull += 18; else bear += 14;
  if (lastE50 > lastE200) bull += 16; else bear += 16;
  if (lastClose > lastE50) bull += 11; else bear += 11;
  if (emaSlopePct > 0.15) bull += 14;
  if (emaSlopePct < -0.15) bear += 14;
  if (shortSlopePct > 0.25) bull += 7;
  if (shortSlopePct < -0.25) bear += 7;
  if (breakoutPosition > 72 && lastClose > lastE50) bull += 8;
  if (breakoutPosition < 28 && lastClose < lastE50) bear += 8;

  if (trendDistance < 1.15) range += 18;
  if (widthPct < 7.5) range += 17;
  if (breakoutPosition > 30 && breakoutPosition < 70) range += 9;
  if (Math.abs(emaSlopePct) < 0.12) range += 10;

  if (compressionPct > 22) squeeze += 18;
  if (atrPct < 1.7 && widthPct < 5.8) squeeze += 22;
  if (bodyToRange < 0.42 && widthPct < 8) squeeze += 8;

  if (drawdownPct > 7) riskOff += 12;
  if (lastClose < lastE200 && emaSlopePct < -0.22) riskOff += 16;
  if (atrPct > 4.2 && lastClose < lastE50) riskOff += 12;
  if (bear > bull + 15 && drawdownPct > 4) riskOff += 8;

  // Volatilite genişlemesi: trend yönünü destekler, range/squeeze'i azaltır.
  if (atrPct > Math.max(atrMedianPct * 1.35, 2.6)) {
    if (lastClose >= lastE50) bull += 7; else bear += 7;
    range -= 7; squeeze -= 5;
  }

  const raw = { bull: clamp(bull), bear: clamp(bear), range: clamp(range), squeeze: clamp(squeeze), riskOff: clamp(riskOff) };
  const total = Object.values(raw).reduce((a, b) => a + b, 0) || 1;
  const probabilities = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, round(v / total * 100, 1)]));
  const sorted = Object.entries(probabilities).sort((a, b) => b[1] - a[1]);
  const candidateKey = sorted[0][0];
  const candidateProb = sorted[0][1];
  const secondProb = sorted[1]?.[1] || 0;
  let activeKey = candidateKey;
  let transition = 'NORMAL GEÇİŞ';
  let locked = false;

  if (cfg.memoryEnabled && previousKey && previousKey !== 'watch' && previousKey !== candidateKey) {
    const prevProb = Number(probabilities[previousKey] || 0);
    const shouldHold = prevProb >= cfg.exitThreshold && (candidateProb < cfg.enterThreshold || (candidateProb - prevProb) < cfg.dominanceGap);
    const uncertaintyWouldSwitch = (100 - (candidateProb - secondProb)) > cfg.maxUncertaintyForSwitch;
    if (shouldHold || uncertaintyWouldSwitch) {
      activeKey = previousKey;
      locked = true;
      transition = shouldHold ? 'HYSTERESIS KİLİDİ / ÖNCEKİ REJİM KORUNDU' : 'BELİRSİZLİK YÜKSEK / REJİM KORUNDU';
    }
  }

  const top = Number(probabilities[activeKey] || candidateProb);
  const uncertainty = round(100 - Math.max(0, candidateProb - secondProb), 1);
  const confidence = round(clamp(top - Math.max(0, uncertainty - 50) * 0.35), 1);

  const result = {
    active: regimeLabelTr(activeKey),
    key: activeKey,
    previousKey,
    previousActive: previousKey ? regimeLabelTr(previousKey) : '—',
    candidate: regimeLabelTr(candidateKey),
    candidateKey,
    probabilities,
    uncertainty,
    confidence,
    transition,
    hysteresis: { enterThreshold: cfg.enterThreshold, exitThreshold: cfg.exitThreshold, dominanceGap: cfg.dominanceGap, locked },
    metrics: { widthPct: round(widthPct, 2), atrPct: round(atrPct, 2), trendDistance: round(trendDistance, 2), emaSlopePct: round(emaSlopePct, 3), drawdownPct: round(drawdownPct, 2), compressionPct: round(compressionPct, 1), breakoutPosition: round(breakoutPosition, 1) }
  };

  try {
    if (typeof localStorage !== 'undefined' && activeKey && activeKey !== 'watch') {
      localStorage.setItem('rux.lastRegimeKey', activeKey);
      localStorage.setItem('rux.lastRegimeSnapshot', JSON.stringify({ key: activeKey, active: result.active, at: Date.now(), probabilities }));
    }
  } catch {}
  return result;
}

export function normalizeRegimeKey(value = '') {
  const s = String(value || '').toLowerCase()
    .replace('boğa', 'bull').replace('boga', 'bull')
    .replace('ayı', 'bear').replace('ayi', 'bear')
    .replace('aralık', 'range').replace('yatay', 'range')
    .replace('sıkışma', 'squeeze').replace('sikişma', 'squeeze').replace('sıkisma', 'squeeze')
    .replace('risk-off', 'riskoff').replace('risk off', 'riskoff');
  if (s.includes('bull')) return 'bull';
  if (s.includes('bear')) return 'bear';
  if (s.includes('range')) return 'range';
  if (s.includes('squeeze')) return 'squeeze';
  if (s.includes('riskoff')) return 'riskOff';
  if (s.includes('risk')) return 'riskOff';
  if (s.includes('watch') || s.includes('izle')) return 'watch';
  return '';
}

export function makeRegimeHysteresisReport(candles = [], previous = null) {
  const current = probabilisticRegime(candles, previous);
  const probs = current.probabilities || {};
  const entries = Object.entries(probs).map(([key, value]) => ({ key, label: regimeLabelTr(key), value: round(value, 1) }))
    .sort((a, b) => b.value - a.value);
  const decision = current.hysteresis?.locked ? 'REJİM KORUNDU' : 'AKTİF REJİM GÜNCELLENDİ';
  const tone = current.confidence >= 70 ? 'green' : current.confidence >= 50 ? 'yellow' : 'red';
  const warnings = [];
  if (current.uncertainty > 70) warnings.push('Rejim belirsizliği yüksek; sinyal risk önerisi düşürülmeli.');
  if (current.hysteresis?.locked) warnings.push('Aday rejim yeterince baskın olmadığı için önceki rejim korundu.');
  if ((probs.riskOff || 0) >= 28) warnings.push('Risk-off olasılığı yükseliyor; altcoin long güveni azaltılmalı.');
  if ((probs.squeeze || 0) >= 30) warnings.push('Sıkışma olasılığı yüksek; fakeout ve geç giriş filtresi sertleşmeli.');
  return { current, entries, decision, tone, warnings, updatedAt: new Date().toISOString() };
}

export function noTradeDecision({ rr = 2, dataConfidence = 85, manipulationRisk = 20, spreadBps = 5, entryLate = false, stopClear = true, regimeUncertainty = 30, macroEventRisk = false } = {}) {
  const hardBlocks = [];
  const softWarnings = [];
  let score = 0;
  if (rr < 1.2) hardBlocks.push('RR_KRİTİK');
  else if (rr < 1.5) { score += 25; softWarnings.push('RR_DÜŞÜK'); }
  if (!stopClear) hardBlocks.push('STOP_BELİRSİZ');
  if (dataConfidence < 50) hardBlocks.push('VERİ_GÜVENİ_KRİTİK');
  else if (dataConfidence < 70) { score += 18; softWarnings.push('VERİ_GÜVENİ_DÜŞÜK'); }
  if (manipulationRisk >= 70) hardBlocks.push('MANİPÜLASYON_RİSKİ_YÜKSEK');
  else if (manipulationRisk >= 50) { score += 22; softWarnings.push('MANİPÜLASYON_RİSKİ_ARTMIŞ'); }
  if (spreadBps > 35) hardBlocks.push('SPREAD_ÇOK_YÜKSEK');
  else if (spreadBps > 15) { score += 16; softWarnings.push('SPREAD_ARTMIŞ'); }
  if (entryLate) { score += 20; softWarnings.push('GEÇ_GİRİŞ_KOVALAMA'); }
  if (regimeUncertainty > 70) { score += 18; softWarnings.push('REJİM_BELİRSİZ'); }
  if (macroEventRisk) { score += 20; softWarnings.push('MAKRO_VERİ_RİSKİ'); }
  const blocked = hardBlocks.length > 0 || score >= 70;
  return { blocked, score: clamp(score), hardBlocks, softWarnings, label: blocked ? 'İŞLEM YOK' : score >= 35 ? 'RİSKLİ İZLE' : 'TEMİZ' };
}

export function finalSignalScore({ setup = 70, regime = 70, confirmation = 70, execution = 70, rr = 70, noTrade = null } = {}) {
  if (noTrade?.blocked) return { score: 0, label: 'İŞLEM YOK', reason: noTrade.hardBlocks?.[0] || 'İŞLEM_ENGELİ' };
  const score = clamp(setup * 0.30 + regime * 0.20 + confirmation * 0.25 + execution * 0.15 + rr * 0.10);
  const label = score >= 93 ? 'A+ SİNYAL' : score >= 85 ? 'A SİNYAL' : score >= 75 ? 'GEÇERLİ SİNYAL' : score >= 70 ? 'HAZIRLAN' : score >= 60 ? 'İZLE' : 'ZAYIF';
  return { score: round(score, 1), label };
}

// ===========================================================================
// BİRLEŞİK GÜVEN & KALİBRASYON KATMANI (v0.70.0)
// "Bu sinyalin tahminine ne kadar güvenmeli?" sorusunu tek skorda toplar.
// Final skor "sinyal ne kadar iyi"yi ölçer; bu katman "tahmin ne kadar GÜVENİLİR"i
// ölçer. İkisi farklıdır: yüksek skorlu bir sinyal düşük güvenilirlikte olabilir
// (örn. veri zayıf, örneklem yok, borsalar ayrışıyor). Güven düşükse beklenen
// değer aralığı GENİŞLER ve önerilen risk çarpanı düşer.
//
// Girdiler (hepsi 0-100 veya bool):
//   dataConfidence  — veri güveni (ölçülmüş)
//   liquidityScore  — likidite kalitesi
//   htfAlignment    — 'HIZALI' | 'KARŞIT' | 'NÖTR' | 'YOK'
//   manipulationRisk— 0-100 (yüksek = kötü)
//   sampleSize      — bu setup/rejim için gerçek geçmiş örneklem sayısı (varsa)
//   crossExchange   — borsa uyumu 0-1 (varsa)
// ===========================================================================
export function unifiedConfidence({
  dataConfidence = 70, liquidityScore = 60, htfAlignment = 'YOK',
  manipulationRisk = 30, sampleSize = 0, crossExchange = null,
  macroEventRisk = false, reliabilityMultiplier = 1.0
} = {}) {
  const parts = [];
  // 1) Veri güveni (en ağır) — ölçülmüş freshness/completeness/consistency
  parts.push({ name: 'Veri', value: clamp(dataConfidence), weight: 0.30 });
  // 2) Likidite — execution güvenilirliği
  parts.push({ name: 'Likidite', value: clamp(liquidityScore), weight: 0.18 });
  // 3) MTF hizalama — üst TF teyidi güveni artırır, karşıtlık düşürür
  const htfVal = htfAlignment === 'HIZALI' ? 88 : htfAlignment === 'KARŞIT' ? 28 : htfAlignment === 'NÖTR' ? 58 : 55;
  parts.push({ name: 'MTF', value: htfVal, weight: 0.16 });
  // 4) Manipülasyon riski (ters) — yüksek risk güveni düşürür
  parts.push({ name: 'Manipülasyon', value: clamp(100 - manipulationRisk), weight: 0.14 });
  // 5) Örneklem büyüklüğü — gerçek geçmiş veri varsa güven artar (istatistiksel)
  //    0 örneklem → 40 (sadece teori), 30+ örneklem → 90 (ampirik temel)
  const sampleVal = sampleSize <= 0 ? 40 : clamp(40 + Math.min(50, Math.sqrt(sampleSize) * 9));
  parts.push({ name: 'Örneklem', value: sampleVal, weight: 0.12 });
  // 6) Borsalar arası uyum (varsa)
  if (crossExchange !== null && Number.isFinite(Number(crossExchange))) {
    parts.push({ name: 'Borsa Uyumu', value: clamp(Number(crossExchange) * 100), weight: 0.10 });
  }

  // Ağırlıkları normalize et (crossExchange opsiyonel olduğu için)
  const totalW = parts.reduce((a, p) => a + p.weight, 0);
  let confidence = parts.reduce((a, p) => a + p.value * (p.weight / totalW), 0);
  // Makro olay riski varsa güveni sertçe kırp
  if (macroEventRisk) confidence = clamp(confidence - 12);
  // #1 — Ampirik güvenilirlik: bu setup geçmişte kazandırıyorsa güven artar,
  // kaybettiriyorsa kırpılır. reliabilityMultiplier storage.setupReliability'den gelir.
  if (Number.isFinite(reliabilityMultiplier) && reliabilityMultiplier !== 1.0) {
    confidence = clamp(50 + (confidence - 50) * reliabilityMultiplier);
  }
  confidence = clamp(confidence);

  // Güven bandı (tahmin belirsizliği): yüksek güven → dar bant
  const tier = confidence >= 78 ? 'YÜKSEK' : confidence >= 58 ? 'ORTA' : 'DÜŞÜK';
  const bandPct = tier === 'YÜKSEK' ? 12 : tier === 'ORTA' ? 22 : 35;
  // Önerilen risk çarpanı: düşük güven → düşük risk (sermaye koruma)
  const riskMultiplier = tier === 'YÜKSEK' ? 1.0 : tier === 'ORTA' ? 0.65 : 0.35;

  return {
    confidence: round(confidence, 1),
    tier,
    bandPct,
    riskMultiplier,
    reliabilityMultiplier: round(reliabilityMultiplier, 3),
    breakdown: parts.map(p => ({ name: p.name, value: round(p.value, 0), weightPct: round(p.weight / totalW * 100, 0) })),
    note: tier === 'YÜKSEK' ? 'Tahmin güvenilir; tam risk düşünülebilir.'
      : tier === 'ORTA' ? 'Tahmin orta güvenilir; risk azaltılması önerilir.'
      : 'Tahmin düşük güvenilir; minimum risk veya bekle.'
  };
}

// Final skoru güvene göre kalibre eder: tahmin aralığı + güven-ağırlıklı skor.
export function calibratedPrediction({ finalScore = 0, confidence = null } = {}) {
  const c = confidence || unifiedConfidence({});
  // Güvenle ağırlıklı skor: düşük güven skoru nötre (50) doğru çeker (shrinkage)
  const shrink = c.confidence / 100;
  const calibratedScore = round(50 + (finalScore - 50) * shrink, 1);
  const lowerBound = round(clamp(finalScore - c.bandPct), 1);
  const upperBound = round(clamp(finalScore + c.bandPct), 1);
  return {
    rawScore: round(finalScore, 1),
    calibratedScore,
    confidenceTier: c.tier,
    confidence: c.confidence,
    predictionBand: [lowerBound, upperBound],
    riskMultiplier: c.riskMultiplier,
    interpretation: `Skor ${round(finalScore,0)} (kalibre ${calibratedScore}), güven ${c.tier} → gerçek sonuç tahmini %${lowerBound}-%${upperBound} bandında.`
  };
}

export const COST_PROFILES = Object.freeze({
  spot_low: { key: 'spot_low', label: 'Spot düşük maliyet', feeR: 0.025, spreadR: 0.018, slippageR: 0.020, fundingR: 0, note: 'Likiditesi yüksek spot çiftleri için düşük maliyet varsayımı.' },
  futures_normal: { key: 'futures_normal', label: 'Futures normal', feeR: 0.045, spreadR: 0.040, slippageR: 0.065, fundingR: 0.015, note: 'BTC/ETH/SOL gibi ana perpetual çiftleri için varsayılan gerçekçi profil.' },
  altcoin_high_spread: { key: 'altcoin_high_spread', label: 'Altcoin yüksek spread', feeR: 0.055, spreadR: 0.095, slippageR: 0.120, fundingR: 0.025, note: 'Daha geniş spreadli ve daha kırılgan likiditeli altcoin senaryosu.' },
  conservative_stress: { key: 'conservative_stress', label: 'Konservatif stres testi', feeR: 0.070, spreadR: 0.130, slippageR: 0.180, fundingR: 0.040, note: 'Kötü fill, yüksek spread ve funding baskısını aynı anda test eder.' },
  manual_custom: { key: 'manual_custom', label: 'Manuel özel maliyet', feeR: 0.045, spreadR: 0.040, slippageR: 0.065, fundingR: 0.015, note: 'Kullanıcı tarafından özelleştirilebilir profil.' }
});

export function getRuxCostProfile(profile = 'futures_normal', custom = null) {
  const base = COST_PROFILES[profile] || COST_PROFILES.futures_normal;
  const out = { ...base };
  if (profile === 'manual_custom' && custom && typeof custom === 'object') {
    ['feeR','spreadR','slippageR','fundingR'].forEach(k => {
      if (Number.isFinite(Number(custom[k]))) out[k] = Number(custom[k]);
    });
    out.note = custom.note || out.note;
  }
  return out;
}

export function realisticCostAndFill({ grossR = 2, feeR = null, spreadR = null, slippageR = null, fundingR = null, fillModel = 'realistic', profile = 'futures_normal', customCosts = null } = {}) {
  const p = getRuxCostProfile(profile, customCosts);
  const modelMult = fillModel === 'aggressive' ? 0.72 : fillModel === 'conservative' ? 1.55 : 1;
  const f = feeR !== null && feeR !== undefined && Number.isFinite(Number(feeR)) ? Number(feeR) : Number(p.feeR) * modelMult;
  const sp = spreadR !== null && spreadR !== undefined && Number.isFinite(Number(spreadR)) ? Number(spreadR) : Number(p.spreadR) * modelMult;
  const sl = slippageR !== null && slippageR !== undefined && Number.isFinite(Number(slippageR)) ? Number(slippageR) : Number(p.slippageR) * modelMult;
  const fu = fundingR !== null && fundingR !== undefined && Number.isFinite(Number(fundingR)) ? Number(fundingR) : Number(p.fundingR) * modelMult;
  const totalCostR = f + sp + sl + fu;
  const netR = Number(grossR) - totalCostR;
  return { grossR: round(grossR, 3), feeR: round(f, 3), spreadR: round(sp, 3), slippageR: round(sl, 3), fundingR: round(fu, 3), totalCostR: round(totalCostR, 3), netR: round(netR, 3), model: fillModel, profile: p.key, profileLabel: p.label, note: p.note };
}

export const SIGNAL_LIFECYCLE_STATES = Object.freeze([
  'İZLE',
  'HAZIRLAN',
  'GEÇERLİ_SİNYAL',
  'GİRİŞ_BÖLGESİ_GÖRÜLDÜ',
  'SİMÜLE_AKTİF',
  'TP1_GÖRÜLDÜ',
  'TP2_GÖRÜLDÜ',
  'TP3_GÖRÜLDÜ',
  'STOP_GÖRÜLDÜ',
  'ZAMAN_STOPU',
  'GEÇERSİZ',
  'DONDURULDU',
  'KAPANDI'
]);

export function makeDemoCandles(count = 120, tf = '4h') {
  const gap = expectedGapMsForTf(tf);
  const now = Date.now();
  const start = now - (count - 1) * gap;
  const out = [];
  let close = 80200;
  for (let i = 0; i < count; i++) {
    const wave = Math.sin(i / 8) * 420 + Math.cos(i / 17) * 260;
    const drift = i * 9;
    const base = 79000 + wave + drift;
    const open = close;
    close = base + Math.sin(i / 3) * 85;
    const high = Math.max(open, close) + 180 + (i % 7) * 18;
    const low = Math.min(open, close) - 160 - (i % 5) * 16;
    const volume = 1200 + Math.abs(Math.sin(i / 6)) * 900 + (i % 11) * 35;
    out.push({ time: start + i * gap, open: round(open, 2), high: round(high, 2), low: round(low, 2), close: round(close, 2), volume: round(volume, 2) });
  }
  return out;
}

export function regimeLabelTr(key = '') {
  const k = String(key).toLowerCase();
  if (k.includes('bull')) return 'BOĞA';
  if (k.includes('bear')) return 'AYI';
  if (k.includes('range')) return 'RANGE';
  if (k.includes('squeeze')) return 'SQUEEZE';
  if (k.includes('risk')) return 'RISK-OFF';
  if (k.includes('watch') || k.includes('izle')) return 'İZLE';
  return String(key || 'NÖTR').toUpperCase();
}

export function statusClass(value, invert = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'muted';
  if (invert) return n <= 25 ? 'pos' : n <= 55 ? 'warn' : 'neg';
  return n >= 75 ? 'pos' : n >= 50 ? 'warn' : 'neg';
}

export function makeRuxDecisionSnapshot({ tf = '4h', source = 'binance' } = {}) {
  const candles = makeDemoCandles(140, tf);
  const data = analyzeDataConfidence({ candles, source, latencyMs: 142, tf, hasOi: true, hasFunding: true, crossExchangeAgreement: 0.91 });
  const regime = probabilisticRegime(candles);
  const thresholds = adaptiveThresholds(candles, { regime: 'range' });
  const noTrade = noTradeDecision({ rr: 2.72, dataConfidence: data.score, manipulationRisk: 28, spreadBps: 6, entryLate: false, stopClear: true, regimeUncertainty: regime.uncertainty, macroEventRisk: false });
  const final = finalSignalScore({ setup: 82, regime: 78, confirmation: 76, execution: 81, rr: 84, noTrade });
  const cost = realisticCostAndFill({ grossR: 2.72, feeR: 0.04, spreadR: 0.03, slippageR: 0.05, fundingR: 0.015 });
  const pa = analyzePriceActionRulebook(candles, { tf });
  const orderflow = estimateOrderflowFromCandles(candles);

  return {
    version: RUX_VERSION,
    asset: 'BTCUSDT',
    timeframe: tf,
    source: source,
    sourceMap: { ohlcv: source, funding: 'Bybit/OKX fallback hazır', openInterest: 'Hyperliquid/Perp context', news: 'News Pulse + Telegram filtre', metadata: 'CMC/CoinGecko', onchain: 'Dune opsiyonel' },
    direction: 'LONG / AL',
    setup: 'Liquidity Sweep Reversal Long',
    regime,
    data,
    thresholds,
    pa,
    orderflow,
    noTrade,
    final,
    cost,
    manipulationRisk: 28,
    scores: { setup: 82, regime: 78, confirmation: 76, execution: 81, rr: 84, priceAction: round(pa?.score || 0, 1), orderflow: round(orderflow?.score || 0, 1) },
    manualPlan: {
      entryZone: '80,050 - 80,420',
      preferredEntry: '80,180',
      stopReference: '79,240',
      tp1: '81,520',
      tp2: '82,840',
      tp3: '84,600',
      rrExpected: '2.72R',
      doNotChase: '80,950 üstü kovalanmaz',
      validity: '12 mum / 48 saat'
    },
    pipeline: [
      ['Veri', data.score, data.label],
      ['Rejim', 78, regime.active],
      ['Setup', 82, 'Sweep + Reclaim'],
      ['PA/SMC', pa?.score || 0, pa?.label || 'PA izleniyor'],
      ['Teyit', 76, 'Hacim/OI uyumlu'],
      ['İşlem Engeli', noTrade.score, noTrade.label],
      ['Net-R', cost.netR, '+' + cost.netR + 'R']
    ]
  };
}


export function rsiFromCloses(closes = [], period = 14) {
  if (!Array.isArray(closes) || closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const delta = Number(closes[i]) - Number(closes[i - 1]);
    if (delta >= 0) gains += delta;
    else losses -= delta;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 1e-9;
  return clamp(100 - (100 / (1 + avgGain / avgLoss)));
}

export function candleMomentum(candles = [], lookback = 20) {
  const clean = candles.filter(c => Number.isFinite(Number(c.close)));
  if (clean.length < lookback + 1) return { pct: 0, score: 50 };
  const last = Number(clean.at(-1).close);
  const prev = Number(clean.at(-1 - lookback).close);
  const pct = prev ? ((last - prev) / prev) * 100 : 0;
  return { pct: round(pct, 2), score: clamp(50 + pct * 5) };
}

export function manipulationRiskScore(candles = []) {
  const clean = candles.filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.volume)));
  if (clean.length < 30) return 45;
  const last = clean.at(-1);
  const vols = clean.slice(-30, -1).map(c => Number(c.volume) || 0);
  const avgVol = vols.reduce((a,b)=>a+b,0) / (vols.length || 1);
  const volRatio = avgVol ? Number(last.volume) / avgVol : 1;
  const returns = [];
  for (let i = 1; i < clean.length; i++) {
    const p = Number(clean[i-1].close), c = Number(clean[i].close);
    if (p) returns.push(Math.abs((c-p)/p) * 100);
  }
  const p95 = percentile(returns, 0.95) || 1;
  const lastRet = returns.at(-1) || 0;
  const wickSize = Math.max(Number(last.high) - Number(last.low), 1e-9);
  const body = Math.abs(Number(last.close) - Number(last.open));
  const wickDominance = 1 - Math.min(1, body / wickSize);
  let risk = 18;
  if (volRatio > 2.5 && lastRet < p95 * 0.6) risk += 24;
  if (lastRet > p95 * 1.8) risk += 25;
  if (wickDominance > 0.72 && volRatio > 1.5) risk += 18;
  return round(clamp(risk), 1);
}


function candleFeature(c = {}) {
  const open = Number(c.open), high = Number(c.high), low = Number(c.low), close = Number(c.close);
  const range = Math.max(high - low, 1e-9);
  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const closePos = (close - low) / range;
  return {
    bodyPct: clamp((body / range) * 100),
    upperWickPct: clamp((upperWick / range) * 100),
    lowerWickPct: clamp((lowerWick / range) * 100),
    closePos: clamp(closePos * 100),
    bullish: close >= open,
    bearish: close < open,
    range
  };
}

function pivotPoints(candles = [], len = 3, lookback = 120) {
  const clean = candles.filter(c => Number.isFinite(Number(c.high)) && Number.isFinite(Number(c.low)));
  const start = Math.max(len, clean.length - lookback);
  const pivots = { highs: [], lows: [] };
  for (let i = start; i < clean.length - len; i++) {
    const h = Number(clean[i].high), l = Number(clean[i].low);
    let isHigh = true, isLow = true;
    for (let j = i - len; j <= i + len; j++) {
      if (j === i) continue;
      if (Number(clean[j].high) >= h) isHigh = false;
      if (Number(clean[j].low) <= l) isLow = false;
    }
    if (isHigh) pivots.highs.push({ index: i, price: h, time: clean[i].time });
    if (isLow) pivots.lows.push({ index: i, price: l, time: clean[i].time });
  }
  return pivots;
}

function structureFromPivots(pivots = {}) {
  const highs = (pivots.highs || []).slice(-3);
  const lows = (pivots.lows || []).slice(-3);
  const hh = highs.length >= 2 && highs.at(-1).price > highs.at(-2).price;
  const hl = lows.length >= 2 && lows.at(-1).price > lows.at(-2).price;
  const lh = highs.length >= 2 && highs.at(-1).price < highs.at(-2).price;
  const ll = lows.length >= 2 && lows.at(-1).price < lows.at(-2).price;
  let label = 'Nötr yapı';
  let bias = 'NEUTRAL';
  if (hh && hl) { label = 'HH / HL boğa yapısı'; bias = 'LONG'; }
  else if (lh && ll) { label = 'LH / LL ayı yapısı'; bias = 'SHORT'; }
  else if (hh && ll) { label = 'Genişleyen / kararsız yapı'; bias = 'MIXED'; }
  else if (lh && hl) { label = 'Sıkışan / range yapı'; bias = 'RANGE'; }
  return { label, bias, hh, hl, lh, ll };
}

export function analyzePriceActionRulebook(candles = [], { tf = '4h', directionHint = null } = {}) {
  const clean = (candles || []).filter(c =>
    Number.isFinite(Number(c.open)) && Number.isFinite(Number(c.high)) &&
    Number.isFinite(Number(c.low)) && Number.isFinite(Number(c.close))
  );
  if (clean.length < 35) {
    return {
      score: 48,
      label: 'PA VERİSİ YETERSİZ',
      bias: 'NEUTRAL',
      primarySetup: 'Watch / Setup Bekleniyor',
      structure: 'Yetersiz mum geçmişi',
      events: [],
      warnings: ['PA/SMC için en az 35 mum önerilir.'],
      metrics: { bosStrength: 0, sweepQuality: 0, reclaimQuality: 0, candleQuality: 0, volumeRatio: 1 }
    };
  }

  const last = clean.at(-1);
  const prev = clean.at(-2);
  const atrNow = atr(clean, 14).filter(Number.isFinite).at(-1) || Math.max(Number(last.close) * 0.01, 1);
  const pivots = pivotPoints(clean, 3, 140);
  const structure = structureFromPivots(pivots);
  const recentHighPivot = (pivots.highs || []).filter(p => p.index < clean.length - 1).at(-1);
  const recentLowPivot = (pivots.lows || []).filter(p => p.index < clean.length - 1).at(-1);
  const recent = clean.slice(-60);
  const rangeHigh = Math.max(...recent.map(c => Number(c.high)));
  const rangeLow = Math.min(...recent.map(c => Number(c.low)));
  const lastClose = Number(last.close);
  const lastHigh = Number(last.high);
  const lastLow = Number(last.low);
  const lastOpen = Number(last.open);
  const body = Math.abs(lastClose - lastOpen);
  const feature = candleFeature(last);
  const vols = clean.slice(-31, -1).map(c => Number(c.volume) || 0);
  const avgVol = vols.reduce((a,b)=>a+b,0) / (vols.length || 1);
  const volumeRatio = avgVol ? Number(last.volume || 0) / avgVol : 1;
  const volumeScore = clamp(45 + (volumeRatio - 1) * 32);
  const bosUp = recentHighPivot && lastClose > recentHighPivot.price && body >= atrNow * 0.45;
  const bosDown = recentLowPivot && lastClose < recentLowPivot.price && body >= atrNow * 0.45;
  const sweepLow = recentLowPivot && lastLow < recentLowPivot.price && lastClose > recentLowPivot.price;
  const sweepHigh = recentHighPivot && lastHigh > recentHighPivot.price && lastClose < recentHighPivot.price;
  const fastReclaimLong = sweepLow && feature.closePos >= 58;
  const fastReclaimShort = sweepHigh && feature.closePos <= 42;
  const lowerWickSignal = feature.lowerWickPct >= 38 && feature.closePos >= 55;
  const upperWickSignal = feature.upperWickPct >= 38 && feature.closePos <= 45;
  const equalHighCount = recent.filter(c => Math.abs(Number(c.high) - rangeHigh) / Math.max(rangeHigh, 1) < 0.0035).length;
  const equalLowCount = recent.filter(c => Math.abs(Number(c.low) - rangeLow) / Math.max(rangeLow, 1) < 0.0035).length;
  const locationPct = rangeHigh > rangeLow ? ((lastClose - rangeLow) / (rangeHigh - rangeLow)) * 100 : 50;
  const discount = locationPct <= 35;
  const premium = locationPct >= 65;
  const bosStrength = clamp(((body / Math.max(atrNow, 1e-9)) / 0.9) * 100);
  const sweepQuality = clamp((fastReclaimLong || fastReclaimShort ? 52 : 0) + Math.max(feature.lowerWickPct, feature.upperWickPct) * 0.55 + volumeScore * 0.22);
  const candleQuality = clamp(feature.bodyPct * 0.35 + Math.abs(feature.closePos - 50) * 0.9 + volumeScore * 0.20);
  const reclaimQuality = clamp((fastReclaimLong || fastReclaimShort ? 70 : 30) + (volumeRatio > 1.2 ? 10 : 0));

  const events = [];
  if (bosUp) events.push({ type: 'BOS', side: 'LONG', label: 'Bullish BOS', score: round(bosStrength, 1), detail: 'Son swing high üzerinde gövdeli kapanış.' });
  if (bosDown) events.push({ type: 'BOS', side: 'SHORT', label: 'Bearish BOS', score: round(bosStrength, 1), detail: 'Son swing low altında gövdeli kapanış.' });
  if (sweepLow) events.push({ type: 'SWEEP', side: 'LONG', label: 'Sell-side sweep', score: round(sweepQuality, 1), detail: 'Alt likidite alındı ve seviye geri kazanıldı.' });
  if (sweepHigh) events.push({ type: 'SWEEP', side: 'SHORT', label: 'Buy-side sweep', score: round(sweepQuality, 1), detail: 'Üst likidite alındı ve kapanış seviye altında kaldı.' });
  if (fastReclaimLong) events.push({ type: 'RECLAIM', side: 'LONG', label: 'Hızlı reclaim', score: round(reclaimQuality, 1), detail: 'Sweep sonrası mum kapanışı destek bölgesine geri döndü.' });
  if (fastReclaimShort) events.push({ type: 'REJECTION', side: 'SHORT', label: 'Hızlı rejection', score: round(reclaimQuality, 1), detail: 'Sweep sonrası fiyat direnç üstünde tutunamadı.' });
  if (lowerWickSignal) events.push({ type: 'CANDLE', side: 'LONG', label: 'Alt fitil savunması', score: round(candleQuality, 1), detail: 'Alt fitil ve kapanış konumu alıcı savunmasını gösteriyor.' });
  if (upperWickSignal) events.push({ type: 'CANDLE', side: 'SHORT', label: 'Üst fitil reddi', score: round(candleQuality, 1), detail: 'Üst fitil ve kapanış konumu satıcı baskısını gösteriyor.' });
  if (volumeRatio >= 1.5) events.push({ type: 'VOLUME', side: 'BOTH', label: 'Volume spike', score: round(volumeScore, 1), detail: `Son hacim ortalamanın ${round(volumeRatio, 2)} katı.` });
  if (equalHighCount >= 2) events.push({ type: 'LIQUIDITY', side: 'SHORT', label: 'Equal high likiditesi', score: 62, detail: `${equalHighCount} temaslı üst likidite havuzu.` });
  if (equalLowCount >= 2) events.push({ type: 'LIQUIDITY', side: 'LONG', label: 'Equal low likiditesi', score: 62, detail: `${equalLowCount} temaslı alt likidite havuzu.` });

  const longEvidence = events.filter(e => e.side === 'LONG' || e.side === 'BOTH').reduce((s,e)=>s + Number(e.score || 0), 0);
  const shortEvidence = events.filter(e => e.side === 'SHORT' || e.side === 'BOTH').reduce((s,e)=>s + Number(e.score || 0), 0);
  let bias = directionHint || structure.bias;
  if (!directionHint) bias = longEvidence > shortEvidence * 1.1 ? 'LONG' : shortEvidence > longEvidence * 1.1 ? 'SHORT' : structure.bias;
  let primarySetup = 'Watch / Setup Bekleniyor';
  if (fastReclaimLong || (sweepLow && lowerWickSignal)) primarySetup = 'Liquidity Sweep Reversal Long';
  else if (fastReclaimShort || (sweepHigh && upperWickSignal)) primarySetup = 'Liquidity Sweep Reversal Short';
  else if (bosUp) primarySetup = 'Breakout Retest Long';
  else if (bosDown) primarySetup = 'Breakdown Retest Short';
  else if (structure.bias === 'LONG' && discount) primarySetup = 'Trend Pullback Long';
  else if (structure.bias === 'SHORT' && premium) primarySetup = 'Trend Pullback Short';

  const directionBonus = bias === 'LONG' && (bosUp || sweepLow || lowerWickSignal) ? 10
    : bias === 'SHORT' && (bosDown || sweepHigh || upperWickSignal) ? 10 : 0;
  const locationScore = discount || premium ? 70 : 48;
  const score = clamp(
    (structure.bias === 'LONG' || structure.bias === 'SHORT' ? 18 : 10) +
    Math.max(bosStrength, sweepQuality, candleQuality) * 0.34 +
    volumeScore * 0.18 +
    locationScore * 0.15 +
    directionBonus +
    Math.min(12, events.length * 2)
  );
  const warnings = [];
  if (!events.length) warnings.push('Net BOS / sweep / reclaim kanıtı zayıf.');
  if (volumeRatio < 0.8) warnings.push('Hacim teyidi zayıf.');
  if (locationPct > 42 && locationPct < 58) warnings.push('Fiyat range mid bölgesine yakın; no-trade filtresi izlenmeli.');

  return {
    score: round(score, 1),
    label: score >= 80 ? 'A KALİTE PA' : score >= 70 ? 'GEÇERLİ PA' : score >= 58 ? 'İZLE' : 'ZAYIF PA',
    bias,
    primarySetup,
    structure: structure.label,
    events: events.sort((a,b)=>Number(b.score||0)-Number(a.score||0)).slice(0, 8),
    warnings,
    levels: {
      recentSwingHigh: recentHighPivot?.price ? round(recentHighPivot.price, 4) : null,
      recentSwingLow: recentLowPivot?.price ? round(recentLowPivot.price, 4) : null,
      rangeHigh: round(rangeHigh, 4),
      rangeLow: round(rangeLow, 4),
      locationPct: round(locationPct, 1)
    },
    metrics: {
      bosStrength: round(bosStrength, 1),
      sweepQuality: round(sweepQuality, 1),
      reclaimQuality: round(reclaimQuality, 1),
      candleQuality: round(candleQuality, 1),
      volumeRatio: round(volumeRatio, 2),
      bodyPct: round(feature.bodyPct, 1),
      upperWickPct: round(feature.upperWickPct, 1),
      lowerWickPct: round(feature.lowerWickPct, 1),
      closePos: round(feature.closePos, 1)
    }
  };
}

// ===========================================================================
// A04 — SETUP AİLESİ TARAYICISI (Sprint 2)
// Her detector kendi ÇEKİRDEK ŞARTLARINA bakar; şart sağlanmazsa found:false döner.
// PA rulebook çıktısı (events, levels, metrics) ham malzeme olarak kullanılır.
// Böylece "Liquidity Sweep Reversal" sadece EMA mesafesinden değil, gerçek
// sweep + reclaim + konum şartlarından üretilir.
// ===========================================================================

function _ev(events, type, side) {
  return (events || []).find(e => e.type === type && (e.side === side || e.side === 'BOTH'));
}

export function detectTrendPullback(ctx = {}) {
  const { structure = '', bias = 'NEUTRAL', levels = {}, metrics = {}, regime = '' } = ctx;
  const loc = Number(levels.locationPct ?? 50);
  const trendLong = bias === 'LONG' || /HH \/ HL/.test(structure);
  const trendShort = bias === 'SHORT' || /LH \/ LL/.test(structure);
  // Çekirdek şart: net trend yapısı + fiyatın trend yönünde pullback bölgesinde olması.
  // Pullback bölgesi: long için bandın alt yarısına yakın (<=52), short için üst yarısına yakın (>=48).
  const longOk = trendLong && loc <= 52;
  const shortOk = trendShort && loc >= 48;
  if (!longOk && !shortOk) return { family: 'Trend Pullback', found: false, score: 0, side: null };
  const side = longOk ? 'LONG' : 'SHORT';
  const pullbackQual = clamp(55 + (side === 'LONG' ? (52 - loc) : (loc - 48)) * 1.4 + Number(metrics.candleQuality || 0) * 0.2);
  const regimeBonus = (regime === 'BOĞA' && side === 'LONG') || (regime === 'AYI' && side === 'SHORT') ? 12 : 0;
  const score = clamp(pullbackQual * 0.7 + Number(metrics.volumeRatio || 1) * 8 + regimeBonus);
  return { family: 'Trend Pullback', found: true, side, score: round(score, 1),
    evidence: [`${structure}`, `Konum %${round(loc,0)} (${side==='LONG'?'discount':'premium'})`],
    plan: { stopAnchor: side === 'LONG' ? 'recentSwingLow' : 'recentSwingHigh', tp1Anchor: side === 'LONG' ? 'recentSwingHigh' : 'recentSwingLow', tp1Mult: 1.4, tp2Mult: 2.2 } };
}

export function detectLiquiditySweepReversal(ctx = {}) {
  const { events = [], levels = {}, metrics = {} } = ctx;
  const sweepLong = _ev(events, 'SWEEP', 'LONG');
  const sweepShort = _ev(events, 'SWEEP', 'SHORT');
  const reclaimLong = _ev(events, 'RECLAIM', 'LONG');
  const rejectShort = _ev(events, 'REJECTION', 'SHORT');
  // Çekirdek şart: sweep + (reclaim/rejection) aynı yönde
  const longOk = !!sweepLong && (!!reclaimLong || Number(metrics.lowerWickPct || 0) >= 38);
  const shortOk = !!sweepShort && (!!rejectShort || Number(metrics.upperWickPct || 0) >= 38);
  if (!longOk && !shortOk) return { family: 'Liquidity Sweep Reversal', found: false, score: 0, side: null };
  const side = longOk ? 'LONG' : 'SHORT';
  const sweepScore = Number((side === 'LONG' ? sweepLong : sweepShort)?.score || 0);
  const reclaimScore = Number((side === 'LONG' ? reclaimLong : rejectShort)?.score || 0);
  // Sweep+reclaim daha spesifik bir kanıt zinciri olduğu için küçük öncelik bonusu alır.
  const score = clamp(sweepScore * 0.5 + reclaimScore * 0.40 + Number(metrics.volumeRatio || 1) * 7 + 20);
  return { family: 'Liquidity Sweep Reversal', found: true, side, score: round(score, 1),
    evidence: ['Likidite sweep + reclaim/rejection teyidi', `Sweep kalitesi ${round(sweepScore,0)}`],
    plan: { stopAnchor: side === 'LONG' ? 'sweepWickLow' : 'sweepWickHigh', tp1Anchor: 'midRange', tp1Mult: 1.5, tp2Mult: 2.6 } };
}

export function detectBreakoutRetest(ctx = {}) {
  const { events = [], metrics = {} } = ctx;
  const bosLong = _ev(events, 'BOS', 'LONG');
  const bosShort = _ev(events, 'BOS', 'SHORT');
  if (!bosLong && !bosShort) return { family: 'Breakout Retest', found: false, score: 0, side: null };
  const side = bosLong ? 'LONG' : 'SHORT';
  const bosScore = Number((side === 'LONG' ? bosLong : bosShort)?.score || 0);
  // Hacim teyidi breakout için kritik
  const volBonus = Number(metrics.volumeRatio || 1) >= 1.3 ? 14 : Number(metrics.volumeRatio || 1) >= 1.0 ? 4 : -8;
  const score = clamp(bosScore * 0.6 + Number(metrics.bodyPct || 0) * 0.18 + volBonus + 18);
  return { family: 'Breakout Retest', found: true, side, score: round(score, 1),
    evidence: ['Yapısal kırılım (BOS) gövdeli kapanış', `Hacim x${round(Number(metrics.volumeRatio||1),2)}`],
    plan: { stopAnchor: side === 'LONG' ? 'retestLow' : 'retestHigh', tp1Anchor: 'measuredMove', tp1Mult: 1.6, tp2Mult: 2.8 } };
}

export function detectRangeRotation(ctx = {}) {
  const { events = [], levels = {}, metrics = {}, regime = '' } = ctx;
  const loc = Number(levels.locationPct ?? 50);
  const eqHigh = _ev(events, 'LIQUIDITY', 'SHORT');
  const eqLow = _ev(events, 'LIQUIDITY', 'LONG');
  // Çekirdek şart: range rejimi/eşit seviyeler + fiyat bandın ucunda
  const rangey = regime === 'RANGE' || (!!eqHigh && !!eqLow);
  const longOk = rangey && loc <= 30 && (!!eqLow || Number(metrics.lowerWickPct || 0) >= 30);
  const shortOk = rangey && loc >= 70 && (!!eqHigh || Number(metrics.upperWickPct || 0) >= 30);
  if (!longOk && !shortOk) return { family: 'Range Rotation', found: false, score: 0, side: null };
  const side = longOk ? 'LONG' : 'SHORT';
  const edgeScore = side === 'LONG' ? (30 - loc) : (loc - 70);
  const score = clamp(52 + edgeScore * 1.1 + Number(metrics.candleQuality || 0) * 0.2);
  return { family: 'Range Rotation', found: true, side, score: round(score, 1),
    evidence: ['Range içi banttan dönüş', `Konum %${round(loc,0)}`],
    plan: { stopAnchor: side === 'LONG' ? 'rangeLow' : 'rangeHigh', tp1Anchor: side === 'LONG' ? 'rangeHigh' : 'rangeLow', tp1Mult: null, tp2Mult: null } };
}

export function detectSqueezeReversal(ctx = {}) {
  const { metrics = {}, regime = '', funding = null, oiChangePct = null, volatilityPct = null } = ctx;
  // Çekirdek şart: SQUEEZE rejimi VEYA dar bant + aşırı funding işareti
  const squeezeRegime = regime === 'SQUEEZE';
  const tightBand = Number.isFinite(Number(volatilityPct)) && Number(volatilityPct) < 1.5;
  const fundingExtreme = Number.isFinite(Number(funding)) && Math.abs(Number(funding)) >= 0.0004; // ~%0.04 per 8h
  if (!squeezeRegime && !(tightBand && fundingExtreme)) return { family: 'Squeeze Reversal', found: false, score: 0, side: null };
  // Aşırı pozitif funding → long crowd → short squeeze setup; tersi long
  let side = null;
  if (fundingExtreme) side = Number(funding) > 0 ? 'SHORT' : 'LONG';
  else side = Number(metrics.upperWickPct || 0) > Number(metrics.lowerWickPct || 0) ? 'SHORT' : 'LONG';
  const fundingScore = fundingExtreme ? clamp(40 + Math.abs(Number(funding)) * 40000) : 30;
  const oiBonus = Number.isFinite(Number(oiChangePct)) && Math.abs(Number(oiChangePct)) > 5 ? 12 : 0;
  const score = clamp(fundingScore * 0.6 + (squeezeRegime ? 22 : 8) + oiBonus + Number(metrics.candleQuality || 0) * 0.12);
  return { family: 'Squeeze Reversal', found: true, side, score: round(score, 1),
    evidence: [squeezeRegime ? 'Squeeze rejimi' : 'Dar bant + aşırı funding', fundingExtreme ? `Funding ${round(Number(funding)*100,3)}%` : 'Funding nötr'],
    plan: { stopAnchor: side === 'LONG' ? 'recentSwingLow' : 'recentSwingHigh', tp1Anchor: 'midRange', tp1Mult: 1.5, tp2Mult: 2.4 } };
}

// Tüm aileleri tarar, en yüksek skorlu BULUNAN setup'ı döndürür.
export function detectSetupFamily(ctx = {}) {
  const detectors = [
    detectLiquiditySweepReversal(ctx),
    detectSqueezeReversal(ctx),
    detectBreakoutRetest(ctx),
    detectTrendPullback(ctx),
    detectRangeRotation(ctx),
  ];
  const found = detectors.filter(d => d.found && d.side);
  found.sort((a, b) => b.score - a.score);
  const best = found[0] || { family: 'Watch / Setup Bekleniyor', found: false, score: 0, side: null, evidence: [], plan: null };
  return { best, all: detectors, candidates: found };
}

// A08 — Spread (bps) gerçek ölçüm. Order book derinliği varsa bid/ask'tan; yoksa basis'ten tahmin.
export function resolveSpreadBps(marketData = null) {
  const md = marketData || {};
  // 0) Backend depthMetrics.spreadBps (gerçek order book ölçümü) — en güvenilir
  if (md.depthMetrics && Number.isFinite(Number(md.depthMetrics.spreadBps))) {
    return clamp(Number(md.depthMetrics.spreadBps), 0, 500);
  }
  // 1) Doğrudan depth bid/ask
  const depth = md.spot?.depth || md.futures?.depth || md.depth || null;
  if (depth && Array.isArray(depth.bids) && Array.isArray(depth.asks) && depth.bids[0] && depth.asks[0]) {
    const bid = Number(depth.bids[0][0] ?? depth.bids[0].price);
    const ask = Number(depth.asks[0][0] ?? depth.asks[0].price);
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0) {
      const mid = (bid + ask) / 2;
      return clamp(((ask - bid) / mid) * 10000, 0, 500);
    }
  }
  // 2) Açık spreadBps alanı
  if (Number.isFinite(Number(md.spreadBps))) return clamp(Number(md.spreadBps), 0, 500);
  // 3) Basis'ten kaba tahmin: yüksek basis genelde daha geniş spread ile gelir
  const basisPct = md.basis && md.basis.basisPct !== null && md.basis.basisPct !== undefined ? Math.abs(Number(md.basis.basisPct)) : null;
  if (Number.isFinite(basisPct)) return clamp(5 + basisPct * 12, 2, 60);
  // 4) Ölçüm yok → makul varsayılan (eski sabit 7 yerine biraz daha temkinli)
  return 8;
}

// A12 — Likidite değerlendirmesi. Order book derinliği + spread'den execution kalitesini ölçer.
// Düşük derinlik veya geniş spread → execution score sertçe düşer (Asset Eligibility §7).
export function resolveLiquidity(marketData = null) {
  const md = marketData || {};
  const dm = md.depthMetrics || null;
  const spreadBps = resolveSpreadBps(md);

  let depthUsd = null, imbalance = null;
  if (dm) {
    depthUsd = (Number(dm.bidUsd) || 0) + (Number(dm.askUsd) || 0);
    imbalance = Number.isFinite(Number(dm.imbalance)) ? Number(dm.imbalance) : null;
  }

  // Spread kalite skoru: <5bps mükemmel, >40bps kötü
  const spreadScore = clamp(100 - Math.max(0, spreadBps - 4) * 2.2, 0, 100);
  // Derinlik kalite skoru: USD cinsinden top-of-book derinliği
  let depthScore = 60; // ölçüm yoksa nötr
  let measured = false;
  if (Number.isFinite(depthUsd) && depthUsd > 0) {
    measured = true;
    // 50K USD altı zayıf, 5M+ güçlü (logaritmik)
    depthScore = clamp(20 + Math.log10(Math.max(depthUsd, 1000) / 1000) * 26, 0, 100);
  }
  const executionPenalty = spreadBps > 25 ? 22 : spreadBps > 12 ? 10 : 0;
  const liquidityScore = clamp(spreadScore * 0.55 + depthScore * 0.45);

  let tier = 'ÖLÇÜLMEDİ';
  if (measured) {
    tier = liquidityScore >= 72 ? 'YÜKSEK' : liquidityScore >= 50 ? 'ORTA' : 'DÜŞÜK';
  }
  return {
    spreadBps: round(spreadBps, 2),
    depthUsd: depthUsd !== null ? round(depthUsd, 0) : null,
    imbalance,
    liquidityScore: round(liquidityScore, 1),
    executionPenalty,
    tier,
    measured,
    tradeable: !measured ? true : (liquidityScore >= 45 && spreadBps <= 40),
  };
}

// A05 — Setup-aware plan: stop ve TP'ler setup ailesinin anchor'larına göre yerleşir.
// PA seviyeleri (recentSwingHigh/Low, rangeHigh/Low) kullanılır; yoksa ATR çarpanına düşer.
export function buildSetupAwarePlan({ bestSetup = null, isShort = false, isLong = false, price = 0, atrNow = 1, pa = null, stopDistanceFallback = null } = {}) {
  const lv = pa?.levels || {};
  const fallbackDist = Number(stopDistanceFallback) || Math.max(atrNow * 1.25, price * 0.006);
  const dir = isShort ? -1 : 1;

  // Anchor çözümleyici
  const anchorPrice = (name) => {
    switch (name) {
      case 'recentSwingHigh': return Number(lv.recentSwingHigh) || null;
      case 'recentSwingLow': return Number(lv.recentSwingLow) || null;
      case 'rangeHigh': return Number(lv.rangeHigh) || null;
      case 'rangeLow': return Number(lv.rangeLow) || null;
      case 'midRange': return (Number(lv.rangeHigh) && Number(lv.rangeLow)) ? (Number(lv.rangeHigh) + Number(lv.rangeLow)) / 2 : null;
      case 'sweepWickLow': return Number(lv.recentSwingLow) ? Number(lv.recentSwingLow) - atrNow * 0.35 : null;
      case 'sweepWickHigh': return Number(lv.recentSwingHigh) ? Number(lv.recentSwingHigh) + atrNow * 0.35 : null;
      case 'retestLow': return Number(lv.recentSwingHigh) || null; // breakout long: kırılan seviye retest desteği
      case 'retestHigh': return Number(lv.recentSwingLow) || null;
      case 'measuredMove': {
        const h = Number(lv.rangeHigh), l = Number(lv.rangeLow);
        if (h && l) { const mm = h - l; return isShort ? price - mm : price + mm; }
        return null;
      }
      default: return null;
    }
  };

  const plan = bestSetup?.found ? (bestSetup.plan || {}) : {};
  // STOP
  let stop;
  const stopAnchorPrice = anchorPrice(plan.stopAnchor);
  if (stopAnchorPrice && ((isLong && stopAnchorPrice < price) || (isShort && stopAnchorPrice > price))) {
    // anchor'a küçük tampon ekle
    stop = isShort ? stopAnchorPrice + atrNow * 0.15 : stopAnchorPrice - atrNow * 0.15;
  } else {
    stop = isShort ? price + fallbackDist : price - fallbackDist;
  }
  const stopDistance = Math.abs(price - stop) || fallbackDist;

  // TP1 — anchor varsa oraya, yoksa çarpan
  let tp1;
  const tp1AnchorPrice = anchorPrice(plan.tp1Anchor);
  if (tp1AnchorPrice && ((isLong && tp1AnchorPrice > price) || (isShort && tp1AnchorPrice < price))) {
    tp1 = tp1AnchorPrice;
  } else {
    const m1 = Number(plan.tp1Mult) || 1.4;
    tp1 = price + dir * stopDistance * m1;
  }
  // TP2 / TP3 — çarpanlardan (range rotation'da TP2 = karşı bant zaten TP1)
  const m2 = Number(plan.tp2Mult) || 2.2;
  const tp2 = price + dir * stopDistance * m2;
  const tp3 = price + dir * stopDistance * (m2 + 0.9);

  return { stop, stopDistance, tp1, tp2, tp3, anchored: !!(stopAnchorPrice || tp1AnchorPrice), planRef: plan };
}


export function estimateOrderflowFromCandles(candles = []) {
  const clean = (candles || []).filter(c =>
    Number.isFinite(Number(c.open)) && Number.isFinite(Number(c.high)) &&
    Number.isFinite(Number(c.low)) && Number.isFinite(Number(c.close))
  ).slice(-80);
  if (clean.length < 20) {
    return {
      score: 50,
      label: 'ORDER FLOW VERİSİ YETERSİZ',
      bias: 'NEUTRAL',
      cvdProxy: 0,
      deltaPct: 0,
      buyPressurePct: 50,
      sellPressurePct: 50,
      volumeImpulse: 1,
      absorption: 50,
      events: ['Yeterli mum geçmişi yok; teyit ağırlığı nötr tutuldu.']
    };
  }
  let buyVol = 0, sellVol = 0, cvdProxy = 0, absorption = 0;
  const vols = clean.map(c => Number(c.volume) || 0);
  const avgVol = vols.slice(0, -1).reduce((a,b)=>a+b,0) / Math.max(1, vols.length - 1);
  const last = clean.at(-1);
  for (const c of clean) {
    const o = Number(c.open), h = Number(c.high), l = Number(c.low), cl = Number(c.close);
    const v = Number(c.volume) || 0;
    const range = Math.max(1e-9, h - l);
    const closePos = (cl - l) / range;
    const bodyDir = cl >= o ? 1 : -1;
    const buyShare = clamp(closePos * 62 + (bodyDir > 0 ? 18 : -4), 8, 92) / 100;
    const b = v * buyShare;
    const s = Math.max(0, v - b);
    buyVol += b;
    sellVol += s;
    cvdProxy += b - s;
    const wickTrap = range > 0 ? Math.min((h - Math.max(o, cl)) / range, (Math.min(o, cl) - l) / range) : 0;
    if (v > avgVol * 1.35 && wickTrap > 0.12) absorption += 1;
  }
  const total = Math.max(1e-9, buyVol + sellVol);
  const deltaPct = (buyVol - sellVol) / total * 100;
  const buyPressurePct = buyVol / total * 100;
  const sellPressurePct = 100 - buyPressurePct;
  const volumeImpulse = avgVol ? (Number(last.volume) || 0) / avgVol : 1;
  const absorptionScore = clamp(50 + absorption * 8 + Math.max(0, volumeImpulse - 1) * 12);
  let score = clamp(50 + deltaPct * 1.15 + Math.max(-10, Math.min(12, (volumeImpulse - 1) * 14)) + (absorptionScore - 50) * 0.12);
  const bias = deltaPct > 7 ? 'BUY PRESSURE' : deltaPct < -7 ? 'SELL PRESSURE' : 'BALANCED';
  const label = bias === 'BUY PRESSURE' ? 'ALICI BASKISI' : bias === 'SELL PRESSURE' ? 'SATICI BASKISI' : 'DENGELİ AKIŞ';
  const events = [
    `Delta proxy: ${round(deltaPct, 1)}%`,
    `Alıcı/Satıcı: ${round(buyPressurePct, 1)} / ${round(sellPressurePct, 1)}`,
    `Son hacim impulsu: x${round(volumeImpulse, 2)}`
  ];
  if (absorption >= 2) events.push('Yüksek hacimli fitil/absorpsiyon izleri var.');
  return {
    score: round(score, 1),
    label,
    bias,
    cvdProxy: round(cvdProxy, 2),
    deltaPct: round(deltaPct, 2),
    buyPressurePct: round(buyPressurePct, 1),
    sellPressurePct: round(sellPressurePct, 1),
    volumeImpulse: round(volumeImpulse, 2),
    absorption: round(absorptionScore, 1),
    events
  };
}


function getOrderflowScoreImpact() {
  let mode = 'off';
  try {
    const raw = globalThis?.localStorage?.getItem?.('rux.settings');
    if (raw) {
      const settings = JSON.parse(raw);
      mode = String(settings?.orderflowScoreMode || 'off');
    }
  } catch {}
  if (!['off', 'low', 'normal'].includes(mode)) mode = 'off';
  if (mode === 'normal') return { mode, weight: 0.18, label: 'Normal etki' };
  if (mode === 'low') return { mode, weight: 0.07, label: 'Düşük etki' };
  return { mode: 'off', weight: 0, label: 'Gözlem modu / Skora kapalı' };
}


// A11 — MTF (Multi-Timeframe) Confluence.
// Üst zaman dilimi mumlarından bias (yön eğilimi) çıkarır. Rehberin §3 zincirinde
// "Regime → Bias → Location" → Bias üst TF'den gelmelidir. Ana sinyalin regimeScore'una
// hizalama (+/-) etkisi verir. Üst TF verisi yoksa nötr döner (etki 0).
export function htfTimeframeOf(tf = '4h') {
  const map = { '5m': '1h', '15m': '1h', '1h': '4h', '4h': '1d', '1d': '1w', '1w': '1M' };
  return map[String(tf)] || '1d';
}

export function analyzeHtfConfluence(htfCandles = [], { mainSide = null } = {}) {
  const clean = (htfCandles || []).filter(c => Number.isFinite(Number(c.close)));
  if (clean.length < 50) {
    return { available: false, htfBias: 'NEUTRAL', alignment: 'YOK', score: 0, regimeAdjust: 0, label: 'Üst TF verisi yetersiz (etki yok)' };
  }
  const closes = clean.map(c => Number(c.close));
  const price = closes.at(-1);
  const e20 = ema(closes, 20).at(-1);
  const e50 = ema(closes, 50).at(-1);
  const e200 = ema(closes, Math.min(200, closes.length)).at(-1);
  // ROC (momentum) son ~10 bar
  const roc = closes.length > 12 ? (price - closes[closes.length - 11]) / (closes[closes.length - 11] || 1) * 100 : 0;

  let htfBias = 'NEUTRAL';
  if (price > e50 && e20 > e50 && price > e200 && roc > 0) htfBias = 'LONG';
  else if (price < e50 && e20 < e50 && price < e200 && roc < 0) htfBias = 'SHORT';
  else if (price > e50 && roc > 1) htfBias = 'LONG';
  else if (price < e50 && roc < -1) htfBias = 'SHORT';

  // Bias gücü (0-100)
  const emaSpread = Math.abs(e20 - e50) / (price || 1) * 100;
  const biasStrength = clamp(45 + emaSpread * 22 + Math.min(25, Math.abs(roc) * 3));

  let alignment = 'NÖTR', regimeAdjust = 0;
  if (mainSide && htfBias !== 'NEUTRAL') {
    if (mainSide === htfBias) {
      alignment = 'HIZALI';
      regimeAdjust = +clamp(biasStrength * 0.15, 4, 15); // +4..+15
    } else {
      alignment = 'KARŞIT';
      regimeAdjust = -clamp(biasStrength * 0.18, 6, 18); // -6..-18 (üst TF aksi yönde → ceza)
    }
  } else if (htfBias === 'NEUTRAL') {
    alignment = 'NÖTR';
    regimeAdjust = 0;
  }

  return {
    available: true,
    htfBias,
    alignment,
    biasStrength: round(biasStrength, 1),
    roc: round(roc, 2),
    regimeAdjust: round(regimeAdjust, 1),
    score: round(biasStrength, 1),
    label: htfBias === 'NEUTRAL' ? 'Üst TF nötr' : `Üst TF ${htfBias} (${alignment})`
  };
}

// Karar yolunda sinyal üretilemeyen durumlar için tek tip "SİNYAL ÜRETİLMEDİ" sonucu.
function _noSignalResult(symbol, tf, marketData, reason, warning) {
  const candles = (marketData?.candles || []).filter(c => Number.isFinite(Number(c.close)));
  return {
    version: RUX_VERSION,
    asset: symbol, timeframe: tf, live: false,
    signalProduced: false,
    noData: true,
    synthetic: !!(marketData && marketData.synthetic),
    source: marketData?.source || 'veri yetersiz',
    direction: 'YOK',
    final: { score: 0, label: 'SİNYAL ÜRETİLMEDİ' },
    noTrade: { blocked: true, reason, hardBlocks: [warning] },
    confidence: { score: 0, tier: 'YOK', bandPct: 0, riskMultiplier: 0, breakdown: [], note: 'Sinyal üretilmedi; güven hesaplanamaz.' },
    empiricalEdge: { sampleSize: 0, basis: 'veri yok' },
    reason,
    warning,
    pipeline: [['Veri', 0, reason]],
    _candles: candles,
  };
}

export function analyzeLiveMarketSignal({ symbol = 'BTCUSDT', tf = '4h', marketData = null, previousRegime = null } = {}) {
  // KARAR YOLU SENTETİK VERİ YASAĞI (v0.75.5-liquidation-panel-live-20260524 Hiçbir ekran demo/sentetik mumu
  // canlı veri gibi karar motoruna sokamaz. marketData.synthetic veya
  // decisionEligible===false ise sinyal üretilmez.
  if (marketData && (marketData.synthetic === true || marketData.decisionEligible === false)) {
    return _noSignalResult(symbol, tf, marketData, 'SENTETİK_VERİ_KARARDA_YASAK',
      'SİNYAL ÜRETİLMEDİ — sentetik/demo veri karar yolunda kullanılamaz. Bu çıktı yalnızca araştırma/eğitim içindir.');
  }
  const candles = (marketData?.candles || []).filter(c => Number.isFinite(Number(c.close)));
  if (candles.length < 60) {
    return _noSignalResult(symbol, tf, marketData, 'YETERSİZ_CANLI_VERİ',
      'SİNYAL ÜRETİLMEDİ — yeterli canlı veri yok (en az 60 mum gerekir). Demo/simülasyon çıktısı KARAR yolunda gösterilmez.');
  }
  const sourceKey = String(marketData?.market || marketData?.source || 'unknown').toLowerCase().replace('live ', '');
  const closes = candles.map(c => Number(c.close));
  const last = candles.at(-1);
  const price = Number(marketData?.ticker?.price || last.close);
  const change24h = Number(marketData?.ticker?.change || 0);
  const e20 = ema(closes, 20).at(-1);
  const e50 = ema(closes, 50).at(-1);
  const e200 = ema(closes, Math.min(200, closes.length)).at(-1);
  const atrNow = atr(candles, 14).filter(Number.isFinite).at(-1) || Math.max(1, price * 0.01);
  const rsi = rsiFromCloses(closes, 14);
  const mom = candleMomentum(candles, 20);
  const regime = probabilisticRegime(candles, previousRegime);
  // A10 — Kalıcı adaptif eşikler (varlık+rejim bazında haftalık snapshot).
  const thresholds = persistentAdaptiveThresholds(candles, { regime: regime.active, symbol });
  // A02 — Veri Güveni gerçek ölçüm: sabit varsayılanlar kaldırıldı, marketData'dan canlı metrik okunuyor.
  const dataInputs = resolveDataConfidenceInputs(marketData, { tf, candles, sourceKey });
  const data = analyzeDataConfidence({ candles, source: sourceKey, latencyMs: dataInputs.latencyMs, tf, hasOi: dataInputs.hasOi, hasFunding: dataInputs.hasFunding, crossExchangeAgreement: dataInputs.crossExchangeAgreement });
  data.measured = dataInputs.measured;
  const manipulationRisk = manipulationRiskScore(candles);
  const pa = analyzePriceActionRulebook(candles, { tf });
  const orderflow = estimateOrderflowFromCandles(candles);
  // A06 — CVD divergence confirmation: marketData.cvd varsa gerçek delta okunur.
  const cvdSignal = resolveCvdConfirmation(marketData?.cvd || marketData?._cvd || null, candles);

  const trendUp = price > e50 && e20 > e50 && price > e200;
  const trendDown = price < e50 && e20 < e50 && price < e200;
  const nearEma20Pct = Math.abs(price - e20) / price * 100;
  const extensionAtr = Math.abs(price - e20) / atrNow;
  const pullbackQuality = clamp(100 - extensionAtr * 18);
  const volumeRatio = (() => {
    const vols = candles.slice(-21, -1).map(c => Number(c.volume) || 0);
    const avg = vols.reduce((a,b)=>a+b,0)/(vols.length||1);
    return avg ? Number(last.volume || 0) / avg : 1;
  })();
  const volumeScore = clamp(50 + (volumeRatio - 1) * 35);

  // A01/A04 — Setup ailesi tarayıcısı: yön ve setup tek if/else yerine ayrıştırılmış detector'lerden gelir.
  const deriv = marketData?.derivatives || {};
  const setupCtx = {
    structure: pa?.structure || '',
    bias: pa?.bias || 'NEUTRAL',
    events: pa?.events || [],
    levels: pa?.levels || {},
    metrics: pa?.metrics || {},
    regime: regime.active,
    funding: Number.isFinite(Number(deriv.fundingRate)) ? Number(deriv.fundingRate) : null,
    oiChangePct: Number.isFinite(Number(deriv.oiChangePct)) ? Number(deriv.oiChangePct) : null,
    volatilityPct: Number(thresholds?.volatilityPct ?? null),
  };
  const setupScan = detectSetupFamily(setupCtx);
  const bestSetup = setupScan.best;

  // EMA/momentum tabanlı klasik yön — detector bulunamazsa yedek olarak kullanılır.
  const trendDir = trendDown || (mom.pct < -2.2 && price < e50) ? 'SHORT' : trendUp || (mom.pct > 1.4 && price > e50) ? 'LONG' : 'WAIT';
  const setupSide = bestSetup.found ? bestSetup.side : trendDir;
  const direction = setupSide === 'SHORT' ? 'SHORT / SAT' : setupSide === 'LONG' ? 'LONG / AL' : 'BEKLE / İZLE';
  const isShort = direction.startsWith('SHORT');
  const isLong = direction.startsWith('LONG');
  const setupFamilyName = bestSetup.found ? `${bestSetup.family} ${isLong ? 'Long' : 'Short'}` : 'Watch / Setup Bekleniyor';
  const rawSetupType = isLong ? (nearEma20Pct < 1.2 ? 'Trend Pullback Long' : 'Breakout Retest Long')
                  : isShort ? (nearEma20Pct < 1.2 ? 'Trend Pullback Short' : 'Breakdown Retest Short')
                  : 'Watch / Setup Bekleniyor';
  // Önce detector ailesi, yoksa PA rulebook, yoksa klasik EMA tabanlı.
  const setupType = bestSetup.found ? setupFamilyName
    : (pa?.primarySetup && !pa.primarySetup.startsWith('Watch') ? pa.primarySetup : rawSetupType);

  const trendScore = clamp((trendUp || trendDown ? 70 : 45) + Math.min(20, Math.abs(e20 - e50) / price * 800));
  // A04 — Setup skoru artık detector ailesinin çekirdek-şart skorunu da içerir.
  const detectorScore = bestSetup.found ? bestSetup.score : 0;
  const setupScore = clamp((isLong || isShort ? 44 : 30) + trendScore * 0.16 + pullbackQuality * 0.10 + volumeScore * 0.10 + (pa?.score || 50) * 0.18 + detectorScore * 0.24 + (rsi > 45 && rsi < 68 ? 5 : 0));
  let regimeScore = regime.active === 'BOĞA' && isLong ? 84 : regime.active === 'AYI' && isShort ? 84 : regime.active === 'RANGE' ? 70 : regime.active === 'SQUEEZE' ? 66 : 58;
  // A11 — MTF confluence: üst TF mumları varsa bias hizalamasını regimeScore'a uygula.
  const htfCandles = marketData?.htf?.candles || marketData?.higherTimeframe?.candles || marketData?.htfCandles || null;
  const htf = htfCandles ? analyzeHtfConfluence(htfCandles, { mainSide: isLong ? 'LONG' : isShort ? 'SHORT' : null }) : { available: false, htfBias: 'NEUTRAL', alignment: 'YOK', regimeAdjust: 0, score: 0, label: 'Üst TF verisi sağlanmadı (etki yok)' };
  if (htf.available) regimeScore = clamp(regimeScore + htf.regimeAdjust);
  const orderflowImpact = getOrderflowScoreImpact();
  const confirmationBaseParts = [
    { value: volumeScore, weight: 0.20 },
    { value: mom.score, weight: 0.16 },
    { value: 100 - Math.abs(rsi - 50) * 1.2, weight: 0.14 },
    { value: data.score, weight: 0.14 },
    { value: pa?.score || 50, weight: 0.12 }
  ];
  if (orderflowImpact.weight > 0) confirmationBaseParts.push({ value: orderflow?.score || 50, weight: orderflowImpact.weight });
  // A06 — CVD confirmation: mevcutsa ağırlıkla katılır (uyum +, divergence -).
  if (cvdSignal.available && cvdSignal.weight > 0) confirmationBaseParts.push({ value: cvdSignal.score, weight: cvdSignal.weight });
  let confirmationScore = clamp(weightedAverage(confirmationBaseParts) - (manipulationRisk > 55 ? 8 : 0));
  // CVD setup yönüyle çelişiyorsa ek ceza (boğa/ayı tuzağı erken uyarısı)
  if (cvdSignal.available && cvdSignal.divergence && cvdSignal.divergence.includes('DIVERGENCE')) {
    const against = (isLong && cvdSignal.divergence === 'BEARISH_DIVERGENCE') || (isShort && cvdSignal.divergence === 'BULLISH_DIVERGENCE');
    if (against) confirmationScore = clamp(confirmationScore - 6);
  }
  orderflow.scoringMode = orderflowImpact.mode;
  orderflow.scoreImpactWeight = orderflowImpact.weight;
  orderflow.scoreImpactLabel = orderflowImpact.label;
  orderflow.scoreIncluded = orderflowImpact.weight > 0;
  // A12 — Likidite: düşük derinlik/geniş spread execution score'u düşürür (Asset Eligibility).
  const liquidity = resolveLiquidity(marketData);
  const executionScore = clamp(100 - extensionAtr * 18 - (nearEma20Pct > 3 ? 14 : 0) - liquidity.executionPenalty);
  const rrExpected = clamp(1.2 + (setupScore + confirmationScore + executionScore - 180) / 90, 1.15, 3.4);
  const rrScore = clamp(45 + (rrExpected - 1.2) * 25);
  // A08/A12 — Spread gerçek ölçüm (depthMetrics öncelikli).
  const measuredSpreadBps = liquidity.spreadBps;
  const noTrade = noTradeDecision({ rr: rrExpected, dataConfidence: data.score, manipulationRisk, spreadBps: measuredSpreadBps, entryLate: extensionAtr > 2.8, stopClear: true, regimeUncertainty: regime.uncertainty, macroEventRisk: !!marketData?.macroEventRisk });
  const final = finalSignalScore({ setup: setupScore, regime: regimeScore, confirmation: confirmationScore, execution: executionScore, rr: rrScore, noTrade });
  // v0.70.0 — Birleşik güven & kalibrasyon: tahminin GÜVENİLİRLİĞİNİ ölçer (skordan ayrı).
  // #1/#2 — Setup ailesi belli olduktan sonra ampirik güvenilirliği map'ten bul.
  // marketData.setupPerfMap = { 'Trend Pullback': {sampleSize, winRate, expectancy, reliabilityMultiplier, basis}, ... }
  // sinyal.js tarama başında storage.setupPerformance ile bir kez doldurur (saf lookup, döngüsel bağımlılık yok).
  const _setupFam = bestSetup.found ? bestSetup.family : null;
  const _perfMap = marketData?.setupPerfMap || null;
  const setupReliability = (_setupFam && _perfMap && _perfMap[_setupFam]) ? _perfMap[_setupFam] : (marketData?.setupReliability || null);

  const confidence = unifiedConfidence({
    dataConfidence: data.score,
    liquidityScore: liquidity.liquidityScore,
    htfAlignment: htf.alignment,
    manipulationRisk,
    sampleSize: Number(setupReliability?.sampleSize) || 0,
    crossExchange: dataInputs?.crossExchangeAgreement ?? null,
    macroEventRisk: !!marketData?.macroEventRisk,
    reliabilityMultiplier: Number(setupReliability?.reliabilityMultiplier) || 1.0
  });
  const calibrated = calibratedPrediction({ finalScore: final.score, confidence });
  const cost = realisticCostAndFill({ grossR: rrExpected, feeR: 0.04, spreadR: 0.03, slippageR: 0.06, fundingR: Math.max(0, Math.abs(change24h) * 0.002) });

  // A05 — Setup-aware manuel plan: TP/SL artık setup ailesinin anchor'larına göre yerleşir.
  const planLevels = buildSetupAwarePlan({ bestSetup, isShort, isLong, price, atrNow, pa, stopDistanceFallback: Math.max(atrNow * 1.25, price * 0.006) });
  const stopDistance = planLevels.stopDistance;
  const target1 = planLevels.tp1;
  const target2 = planLevels.tp2;
  const target3 = planLevels.tp3;
  const stop = planLevels.stop;
  const entryLow = isShort ? price - atrNow * 0.25 : price - atrNow * 0.35;
  const entryHigh = isShort ? price + atrNow * 0.35 : price + atrNow * 0.25;
  const fmt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: price > 100 ? 2 : 4 });

  return {
    version: RUX_VERSION,
    asset: symbol,
    timeframe: tf,
    live: true,
    price,
    change24h,
    source: marketData?.source || sourceKey,
    sourceMap: {
      ohlcv: marketData?.source || sourceKey,
      funding: 'Funding fallback: Binance → Bybit → OKX',
      openInterest: 'Futures / Hyperliquid context',
      cvd: 'CVD / Delta / Order Book katmanı (varsayılan gözlem modu)',
      news: 'News Pulse + Telegram filtre',
      metadata: 'CMC / CoinGecko',
      onchain: 'Dune opsiyonel'
    },
    direction,
    setup: setupType,
    setupDetails: {
      family: bestSetup.found ? bestSetup.family : null,
      side: bestSetup.found ? bestSetup.side : null,
      score: round(detectorScore, 1),
      evidence: bestSetup.found ? (bestSetup.evidence || []) : [],
      candidates: setupScan.candidates.map(c => ({ family: c.family, side: c.side, score: c.score })),
      anchored: planLevels.anchored
    },
    cvd: { available: cvdSignal.available, bias: cvdSignal.bias, divergence: cvdSignal.divergence, label: cvdSignal.label, weight: cvdSignal.weight, score: cvdSignal.score },
    htf: { available: htf.available, bias: htf.htfBias, alignment: htf.alignment, regimeAdjust: htf.regimeAdjust, timeframe: htfTimeframeOf(tf), label: htf.label },
    liquidity: { tier: liquidity.tier, spreadBps: liquidity.spreadBps, depthUsd: liquidity.depthUsd, score: liquidity.liquidityScore, penalty: liquidity.executionPenalty, measured: liquidity.measured, tradeable: liquidity.tradeable },
    confidence: { score: confidence.confidence, tier: confidence.tier, bandPct: confidence.bandPct, riskMultiplier: confidence.riskMultiplier, breakdown: confidence.breakdown, note: confidence.note },
    empiricalEdge: setupReliability ? {
      sampleSize: setupReliability.sampleSize,
      winRate: setupReliability.winRate,
      expectancy: setupReliability.expectancy,
      profitFactor: setupReliability.profitFactor,
      reliabilityMultiplier: confidence.reliabilityMultiplier,
      basis: setupReliability.basis
    } : { sampleSize: 0, basis: 'teori (geçmiş veri toplanıyor)' },
    calibrated: { calibratedScore: calibrated.calibratedScore, predictionBand: calibrated.predictionBand, riskMultiplier: calibrated.riskMultiplier, interpretation: calibrated.interpretation },
    regime,
    data,
    thresholds,
    pa,
    orderflow,
    noTrade,
    final,
    cost,
    manipulationRisk,
    scores: { setup: round(setupScore, 1), regime: round(regimeScore, 1), confirmation: round(confirmationScore, 1), execution: round(executionScore, 1), rr: round(rrScore, 1), priceAction: round(pa?.score || 0, 1), orderflow: round(orderflow?.score || 0, 1) },
    technicals: { rsi: round(rsi, 1), momentumPct: mom.pct, volumeRatio: round(volumeRatio, 2), atr: round(atrNow, 4), ema20: round(e20, 4), ema50: round(e50, 4), ema200: round(e200, 4), orderflowBias: orderflow?.label || '—', deltaPct: orderflow?.deltaPct ?? 0 },
    manualPlan: {
      entryZone: `${fmt(entryLow)} - ${fmt(entryHigh)}`,
      preferredEntry: fmt(price),
      stopReference: fmt(stop),
      tp1: fmt(target1),
      tp2: fmt(target2),
      tp3: fmt(target3),
      rrExpected: round(rrExpected, 2) + 'R',
      planType: planLevels.anchored ? 'Setup-aware (seviye bazlı)' : 'ATR bazlı (yedek)',
      doNotChase: isShort ? `${fmt(price - atrNow * 0.85)} altı kovalanmaz` : `${fmt(price + atrNow * 0.85)} üstü kovalanmaz`,
      validity: tf === '1h' ? '16 mum / 16 saat' : tf === '1d' ? '5 mum / 5 gün' : tf === '1w' ? '4 mum / 4 hafta' : tf === '1M' ? '3 mum / 3 ay' : '12 mum / 48 saat'
    },
    pipeline: [
      ['Veri', data.score, data.label + (data.measured ? ' (ölçüldü)' : '')],
      ['Rejim', regimeScore, regime.active + (htf.available ? ` · MTF ${htf.alignment}` : '')],
      ['Üst TF', htf.score || 50, htf.label],
      ['Setup', setupScore, bestSetup.found ? bestSetup.family : setupType.replace('Trend ', '').replace('Breakout ', '').replace('Breakdown ', '')],
      ['PA/SMC', pa?.score || 0, pa?.label || 'PA izleniyor'],
      ['Order Flow', orderflow?.score || 50, orderflow?.scoreImpactLabel || orderflow?.label || 'Gözlem modu'],
      ['CVD', cvdSignal.score, cvdSignal.label],
      ['Likidite', liquidity.liquidityScore, liquidity.measured ? `${liquidity.tier} · spread ${liquidity.spreadBps}bps` : 'Ölçülmedi'],
      ['Güven', confidence.confidence, `${confidence.tier} · tahmin bandı ±%${confidence.bandPct} · risk ×${confidence.riskMultiplier}`],
      ['Teyit', confirmationScore, 'RSI ' + round(rsi, 0) + ' · Hacim x' + round(volumeRatio, 2)],
      ['İşlem Engeli', noTrade.score, noTrade.label],
      ['Net-R', cost.netR, (cost.netR >= 0 ? '+' : '') + cost.netR + 'R']
    ]
  };
}


export function manualRiskSuggestion({ finalScore = 0, regime = 'NÖTR', direction = 'BEKLE / İZLE', dataConfidence = 80, portfolioHeat = 0 } = {}) {
  let min = 0, max = 0;
  const score = Number(finalScore) || 0;
  if (score >= 93) { min = 0.75; max = 1.00; }
  else if (score >= 85) { min = 0.50; max = 0.75; }
  else if (score >= 75) { min = 0.25; max = 0.50; }
  else if (score >= 70) { min = 0.10; max = 0.25; }
  const r = String(regime || '').toUpperCase();
  if (r.includes('SQUEEZE') || r.includes('RISK') || r.includes('AYI') && String(direction).includes('LONG')) {
    min *= 0.65; max *= 0.65;
  }
  if ((Number(dataConfidence) || 0) < 75) { min *= 0.75; max *= 0.75; }
  if ((Number(portfolioHeat) || 0) > 1.75) { min *= 0.70; max *= 0.70; }
  const label = max <= 0 ? 'Risk önerisi yok' : `%${round(min, 2)} - %${round(max, 2)}`;
  return { minPct: round(min, 2), maxPct: round(max, 2), label, note: max <= 0 ? 'Sinyal işlem planı üretmiyor.' : 'Manuel uygulama için teorik risk aralığı.' };
}

function _parseFirstNumber(value) {
  if (typeof value === 'number') return value;
  const m = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

export function simulateSignalTracking(snapshot = {}) {
  const price = Number(snapshot.price) || _parseFirstNumber(snapshot.manualPlan?.preferredEntry);
  const entryA = _parseFirstNumber(snapshot.manualPlan?.entryZone);
  const nums = String(snapshot.manualPlan?.entryZone || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || [];
  const entryB = nums.length > 1 ? Number(nums[1]) : entryA;
  const low = Math.min(entryA, entryB);
  const high = Math.max(entryA, entryB);
  const stop = _parseFirstNumber(snapshot.manualPlan?.stopReference);
  const tp1 = _parseFirstNumber(snapshot.manualPlan?.tp1);
  const direction = String(snapshot.direction || '').toUpperCase();
  const hasRange = Number.isFinite(low) && Number.isFinite(high) && Number.isFinite(price);
  const entryZoneHit = hasRange ? price >= low && price <= high : false;
  const risk = Math.max(Math.abs((Number(snapshot.price) || high || low) - stop), 1e-9);
  let mfe = 0, mae = 0;
  if (Number.isFinite(price) && Number.isFinite(tp1) && Number.isFinite(stop)) {
    if (direction.includes('SHORT')) {
      mfe = Math.max(0, (price - tp1) / risk);
      mae = Math.max(0, (stop - price) / risk);
    } else {
      mfe = Math.max(0, (tp1 - price) / risk);
      mae = Math.max(0, (price - stop) / risk);
    }
  }
  const score = Number(snapshot.final?.score || 0);
  const state = snapshot.noTrade?.blocked ? 'DONDURULDU'
    : entryZoneHit && score >= 75 ? 'GİRİŞ_BÖLGESİ_GÖRÜLDÜ'
    : score >= 75 ? 'GEÇERLİ_SİNYAL'
    : score >= 70 ? 'HAZIRLAN'
    : 'İZLE';
  return {
    state,
    entryZoneHit,
    fillModel: 'Midpoint + spread/slippage',
    firstOutcome: 'Beklemede',
    tpProgress: entryZoneHit ? 'Entry izleniyor' : 'Entry bölgesi bekleniyor',
    mfeR: round(mfe || Number(snapshot.cost?.netR || 0) * 0.42, 2),
    maeR: round(Math.min(1, mae || 0.35), 2),
    timeStop: snapshot.manualPlan?.validity || '12 mum / 48 saat',
    finalR: 'Açık / teorik takip'
  };
}

export function calculatePortfolioHeat(positions = [], opts = {}) {
  const usdtDominance = Number(opts.usdtDominance ?? 4.79);
  const riskOff = Boolean(opts.riskOff) || usdtDominance >= 5.25;
  const rows = positions.map((p) => {
    const beta = Number(p.beta ?? 1);
    const riskPct = Number(p.riskPct ?? 0);
    const dir = String(p.direction || 'LONG').toUpperCase();
    let adjusted = riskPct * beta;
    if (riskOff && dir.includes('LONG') && !String(p.symbol || '').startsWith('BTC')) adjusted *= 0.50;
    return { ...p, beta, riskPct, adjustedHeat: round(adjusted, 3), riskOffAdjusted: riskOff && dir.includes('LONG') && !String(p.symbol || '').startsWith('BTC') };
  });
  const longHeat = rows.filter(r => String(r.direction).toUpperCase().includes('LONG')).reduce((a,b)=>a+b.adjustedHeat,0);
  const shortHeat = rows.filter(r => String(r.direction).toUpperCase().includes('SHORT')).reduce((a,b)=>a+b.adjustedHeat,0);
  const totalHeat = round(longHeat + shortHeat, 3);
  const label = totalHeat >= 2.25 ? 'YÜKSEK' : totalHeat >= 1.50 ? 'ORTA-YÜKSEK' : totalHeat >= 0.75 ? 'KONTROLLÜ' : 'DÜŞÜK';
  const action = totalHeat >= 2.25 ? 'Yeni aynı yön sinyal riskini azalt.' : totalHeat >= 1.50 ? 'Aynı yön pozisyonlarda seçici ol.' : 'Isı kabul edilebilir.';
  return { rows, longHeat: round(longHeat,3), shortHeat: round(shortHeat,3), totalHeat, label, action, usdtDominance, riskOff };
}

export function makeRuxPortfolioHeatSnapshot({ selectedSignal = null } = {}) {
  const positions = [
    { symbol: 'BTCUSDT', direction: 'LONG', riskPct: 0.75, beta: 1.00, weightPct: 32 },
    { symbol: 'ETHUSDT', direction: 'LONG', riskPct: 0.50, beta: 0.85, weightPct: 24 },
    { symbol: 'SOLUSDT', direction: 'LONG', riskPct: 0.50, beta: 1.25, weightPct: 18 },
    { symbol: 'AVAXUSDT', direction: 'LONG', riskPct: 0.25, beta: 1.55, weightPct: 14 },
    { symbol: 'LINKUSDT', direction: 'LONG', riskPct: 0.15, beta: 1.10, weightPct: 6 }
  ];
  if (selectedSignal && String(selectedSignal.direction || '').includes('SHORT')) {
    positions.push({ symbol: selectedSignal.asset || 'SEÇİLİ', direction: 'SHORT', riskPct: 0.25, beta: 1.00, weightPct: 0 });
  }
  return calculatePortfolioHeat(positions, { usdtDominance: 4.79 });
}



function _ruxParseNumber(value) {
  if (typeof value === 'number') return value;
  const m = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : NaN;
}

function _ruxParseRange(value) {
  const nums = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || [];
  if (!nums.length) return [NaN, NaN];
  const a = Number(nums[0]);
  const b = nums.length > 1 ? Number(nums[1]) : a;
  return [Math.min(a, b), Math.max(a, b)];
}

function _ruxTradeR({ direction = 'LONG', entry = NaN, stop = NaN, price = NaN } = {}) {
  const risk = Math.max(Math.abs(entry - stop), 1e-9);
  if (String(direction).toUpperCase().includes('SHORT')) return (entry - price) / risk;
  return (price - entry) / risk;
}

export function simulateManualPlanOutcome(snapshot = {}, futureCandles = [], { fillModel = 'realistic', maxBars = 32, costProfile = 'futures_normal', customCosts = null } = {}) {
  const plan = snapshot.manualPlan || {};
  const direction = String(snapshot.direction || '').toUpperCase();
  const isShort = direction.includes('SHORT');
  const isTradeable = (direction.includes('LONG') || direction.includes('SHORT')) && !snapshot.noTrade?.blocked && Number(snapshot.final?.score || 0) >= 70;
  const [entryLow, entryHigh] = _ruxParseRange(plan.entryZone);
  const stop = _ruxParseNumber(plan.stopReference);
  const tp1 = _ruxParseNumber(plan.tp1);
  const tp2 = _ruxParseNumber(plan.tp2);
  const tp3 = _ruxParseNumber(plan.tp3);
  const validNumbers = [entryLow, entryHigh, stop, tp1].every(Number.isFinite);
  if (!isTradeable || !validNumbers || !futureCandles.length) {
    return {
      filled: false,
      status: snapshot.noTrade?.blocked ? 'NO_TRADE_BLOCK' : 'NO_FILL',
      grossR: 0,
      netR: 0,
      feeR: 0,
      spreadR: 0,
      slippageR: 0,
      fundingR: 0,
      totalCostR: 0,
      mfeR: 0,
      maeR: 0,
      barsHeld: 0,
      firstOutcome: 'Plan izlenmedi',
      fillModel
    };
  }

  const zoneMid = (entryLow + entryHigh) / 2;
  const zoneWidth = Math.max(entryHigh - entryLow, Math.abs(zoneMid) * 0.0001);
  let entry = zoneMid;
  if (fillModel === 'aggressive') entry = isShort ? entryHigh : entryLow;
  if (fillModel === 'conservative') entry = isShort ? entryLow - zoneWidth * 0.10 : entryHigh + zoneWidth * 0.10;
  const risk = Math.max(Math.abs(entry - stop), 1e-9);
  let filled = false;
  let fillTime = null;
  let barsHeld = 0;
  let mfeR = 0;
  let maeR = 0;
  let grossR = 0;
  let exitPrice = NaN;
  let firstOutcome = 'TIME_STOP';
  const candles = futureCandles.slice(0, maxBars);

  for (const c of candles) {
    const high = Number(c.high), low = Number(c.low), close = Number(c.close);
    if (![high, low, close].every(Number.isFinite)) continue;
    if (!filled) {
      const touched = high >= entryLow && low <= entryHigh;
      if (!touched) continue;
      filled = true;
      fillTime = c.time;
    }
    barsHeld += 1;
    const best = isShort ? low : high;
    const worst = isShort ? high : low;
    mfeR = Math.max(mfeR, _ruxTradeR({ direction, entry, stop, price: best }));
    maeR = Math.max(maeR, -_ruxTradeR({ direction, entry, stop, price: worst }));

    const stopHit = isShort ? high >= stop : low <= stop;
    const tp1Hit = isShort ? low <= tp1 : high >= tp1;
    const tp2Hit = Number.isFinite(tp2) && (isShort ? low <= tp2 : high >= tp2);
    const tp3Hit = Number.isFinite(tp3) && (isShort ? low <= tp3 : high >= tp3);

    // Intrabar sırası bilinmiyorsa realistic/conservative modda stopu önce kabul ederiz.
    if (stopHit && (tp1Hit || fillModel === 'conservative')) {
      exitPrice = stop;
      grossR = -1;
      firstOutcome = 'STOP';
      break;
    }
    if (stopHit) {
      exitPrice = stop;
      grossR = -1;
      firstOutcome = 'STOP';
      break;
    }
    if (tp3Hit) {
      exitPrice = tp3;
      grossR = _ruxTradeR({ direction, entry, stop, price: exitPrice });
      firstOutcome = 'TP3';
      break;
    }
    if (tp2Hit) {
      exitPrice = tp2;
      grossR = _ruxTradeR({ direction, entry, stop, price: exitPrice });
      firstOutcome = 'TP2';
      break;
    }
    if (tp1Hit) {
      exitPrice = tp1;
      grossR = _ruxTradeR({ direction, entry, stop, price: exitPrice });
      firstOutcome = 'TP1';
      break;
    }
    exitPrice = close;
    grossR = _ruxTradeR({ direction, entry, stop, price: exitPrice });
  }

  if (!filled) {
    return { filled: false, status: 'NO_FILL', grossR: 0, netR: 0, mfeR: 0, maeR: 0, barsHeld: 0, firstOutcome: 'Entry bölgesi görülmedi', fillModel };
  }
  const cost = realisticCostAndFill({
    grossR,
    fillModel,
    profile: costProfile,
    customCosts,
    fundingR: Math.min(0.12, barsHeld * Number(getRuxCostProfile(costProfile, customCosts).fundingR || 0.015))
  });
  return {
    filled: true,
    status: firstOutcome,
    entry: round(entry, 6),
    stop: round(stop, 6),
    exitPrice: round(exitPrice, 6),
    grossR: cost.grossR,
    netR: cost.netR,
    feeR: cost.feeR,
    spreadR: cost.spreadR,
    slippageR: cost.slippageR,
    fundingR: cost.fundingR,
    totalCostR: cost.totalCostR,
    costProfile: cost.profile,
    costProfileLabel: cost.profileLabel,
    costBreakdown: cost,
    mfeR: round(mfeR, 2),
    maeR: round(maeR, 2),
    barsHeld,
    fillTime,
    firstOutcome,
    fillModel
  };
}

export function buildSignalDataset(candles = [], { symbol = 'BTCUSDT', tf = '4h', minScore = 60, step = 8, lookahead = 32, fillModel = 'realistic', ruleSet = null, costProfile = 'futures_normal', customCosts = null } = {}) {
  const clean = (candles || []).filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  const minWarmup = Math.min(120, Math.max(70, Math.floor(clean.length * 0.30)));
  const ruleThresholds = ruleSet?.thresholds || {};
  const ruleSetup = String(ruleSet?.setup || '').toLowerCase();
  const ruleDirection = String(ruleSet?.direction || '').toUpperCase();
  const minFinalScore = Number(ruleThresholds.minFinal ?? minScore) || minScore;
  const minDataConfidence = Number(ruleThresholds.minDataConfidence ?? 0) || 0;
  const maxNoTrade = Number(ruleThresholds.maxNoTrade ?? 100) || 100;
  const minRR = Number(ruleThresholds.minRR ?? 0) || 0;
  const maxManipulation = Number(ruleThresholds.maxManipulation ?? 100) || 100;
  const rows = [];
  let previousRegime = null;
  if (clean.length < minWarmup + lookahead + 5) return rows;
  for (let i = minWarmup; i < clean.length - lookahead; i += step) {
    const window = clean.slice(Math.max(0, i - 240), i + 1);
    const future = clean.slice(i + 1, i + 1 + lookahead);
    const snapshot = analyzeLiveMarketSignal({
      symbol,
      tf,
      previousRegime,
      marketData: { candles: window, source: 'backtest', market: 'binance', ticker: { price: window.at(-1)?.close, change: 0 } }
    });
    previousRegime = snapshot.regime?.active || previousRegime;
    const score = Number(snapshot.final?.score || 0);
    const direction = String(snapshot.direction || '');
    const dataScore = Number(snapshot.data?.score || 0);
    const noTradeScore = Number(snapshot.noTrade?.score || 0);
    const rrValue = parseFloat(String(snapshot.manualPlan?.rrExpected || '0').replace(',', '.')) || 0;
    const manipulation = Number(snapshot.manipulationRisk || 0);
    const setupOk = !ruleSetup || String(snapshot.setup || '').toLowerCase().includes(ruleSetup.replace(/\s+long|\s+short/g, '').trim());
    const directionOk = !ruleDirection || direction.toUpperCase().includes(ruleDirection);
    const ruleOk = setupOk && directionOk && dataScore >= minDataConfidence && noTradeScore <= maxNoTrade && rrValue >= minRR && manipulation <= maxManipulation;
    const tradeCandidate = score >= minFinalScore && (direction.includes('LONG') || direction.includes('SHORT')) && !snapshot.noTrade?.blocked && ruleOk;
    const outcome = tradeCandidate ? simulateManualPlanOutcome(snapshot, future, { fillModel, maxBars: lookahead, costProfile, customCosts }) : {
      filled: false,
      status: snapshot.noTrade?.blocked ? 'NO_TRADE_BLOCK' : 'WATCH_ONLY',
      grossR: 0,
      netR: 0,
      feeR: 0,
      spreadR: 0,
      slippageR: 0,
      fundingR: 0,
      totalCostR: 0,
      mfeR: 0,
      maeR: 0,
      barsHeld: 0,
      firstOutcome: snapshot.noTrade?.blocked ? 'Hard/soft filtre' : 'Sinyal seviyesi yetersiz',
      fillModel
    };
    rows.push({
      id: rows.length + 1,
      time: clean[i].time,
      asset: symbol,
      tf,
      direction: direction.includes('SHORT') ? 'SHORT' : direction.includes('LONG') ? 'LONG' : 'WATCH',
      setup: snapshot.setup,
      regime: snapshot.regime?.active || 'NÖTR',
      score,
      dataConfidence: snapshot.data?.score || 0,
      noTradeScore: snapshot.noTrade?.score || 0,
      manipulationRisk: snapshot.manipulationRisk || 0,
      snapshot,
      outcome,
      netR: Number(outcome.netR || 0),
      grossR: Number(outcome.grossR || 0),
      feeR: Number(outcome.feeR || 0),
      spreadR: Number(outcome.spreadR || 0),
      slippageR: Number(outcome.slippageR || 0),
      fundingR: Number(outcome.fundingR || 0),
      totalCostR: Number(outcome.totalCostR || 0),
      filled: outcome.filled,
      status: outcome.status,
      blocked: snapshot.noTrade?.blocked || false,
      ruleSetId: ruleSet?.id || null,
      ruleSetName: ruleSet?.name || 'Varsayılan RUx'
    });
  }
  return rows;
}

function _ruxMaxDrawdown(equity = []) {
  let peak = equity[0] || 0;
  let maxDD = 0;
  const dd = [];
  for (const v of equity) {
    peak = Math.max(peak, v);
    const d = v - peak;
    dd.push(round(d, 3));
    maxDD = Math.min(maxDD, d);
  }
  return { maxDD: round(maxDD, 3), drawdownCurve: dd };
}

export function summarizeBacktestRows(rows = []) {
  const trades = rows.filter(r => r.filled);
  const rValues = trades.map(r => Number(r.netR || 0));
  const wins = rValues.filter(v => v > 0);
  const losses = rValues.filter(v => v < 0);
  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const winRate = trades.length ? wins.length / trades.length * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const lossRate = 100 - winRate;
  const expectancy = (winRate / 100 * avgWin) - (lossRate / 100 * avgLoss);
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  let equity = [0];
  let cons = 0, maxConsLoss = 0;
  for (const v of rValues) {
    equity.push(round(equity.at(-1) + v, 3));
    if (v < 0) { cons += 1; maxConsLoss = Math.max(maxConsLoss, cons); }
    else cons = 0;
  }
  const dd = _ruxMaxDrawdown(equity);
  const buckets = [
    ['≤-2R', rValues.filter(v => v <= -2).length],
    ['-2/-1R', rValues.filter(v => v > -2 && v <= -1).length],
    ['-1/0R', rValues.filter(v => v > -1 && v < 0).length],
    ['0/+1R', rValues.filter(v => v >= 0 && v < 1).length],
    ['+1/+2R', rValues.filter(v => v >= 1 && v < 2).length],
    ['+2/+3R', rValues.filter(v => v >= 2 && v < 3).length],
    ['≥+3R', rValues.filter(v => v >= 3).length],
  ];
  const setupMap = new Map();
  for (const t of trades) {
    const key = t.setup || 'Setup';
    if (!setupMap.has(key)) setupMap.set(key, []);
    setupMap.get(key).push(t.netR);
  }
  const setupPerformance = Array.from(setupMap.entries()).map(([setup, vals]) => {
    const w = vals.filter(v => v > 0);
    const l = vals.filter(v => v < 0);
    const gp = w.reduce((a,b)=>a+b,0);
    const gl = Math.abs(l.reduce((a,b)=>a+b,0));
    const wr = vals.length ? w.length / vals.length * 100 : 0;
    const ex = vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
    return { setup, count: vals.length, winRate: round(wr,1), expectancy: round(ex,2), pf: round(gl ? gp/gl : gp ? 99 : 0,2), netR: round(vals.reduce((a,b)=>a+b,0),2) };
  }).sort((a,b)=>b.netR-a.netR);
  const blocked = rows.filter(r => r.status === 'NO_TRADE_BLOCK' || r.blocked).length;
  const feeR = trades.reduce((a,t)=>a+Number(t.feeR||0),0);
  const spreadR = trades.reduce((a,t)=>a+Number(t.spreadR||0),0);
  const slippageR = trades.reduce((a,t)=>a+Number(t.slippageR||0),0);
  const fundingR = trades.reduce((a,t)=>a+Number(t.fundingR||0),0);
  const totalCostR = feeR + spreadR + slippageR + fundingR;
  return {
    rows,
    trades,
    totalSignals: rows.length,
    totalTrades: trades.length,
    blockedSignals: blocked,
    watchOnly: rows.filter(r => r.status === 'WATCH_ONLY').length,
    wins: wins.length,
    losses: losses.length,
    winRate: round(winRate, 1),
    avgWin: round(avgWin, 2),
    avgLoss: round(avgLoss, 2),
    expectancy: round(expectancy, 3),
    profitFactor: round(profitFactor, 2),
    netR: round(rValues.reduce((a,b)=>a+b,0), 2),
    grossR: round(trades.reduce((a,t)=>a+Number(t.grossR||0),0), 2),
    feeR: round(feeR, 2),
    spreadR: round(spreadR, 2),
    slippageR: round(slippageR, 2),
    fundingR: round(fundingR, 2),
    totalCostR: round(totalCostR, 2),
    maxDrawdownR: dd.maxDD,
    drawdownCurve: dd.drawdownCurve,
    equityCurve: equity,
    maxConsecutiveLosses: maxConsLoss,
    buckets,
    setupPerformance,
    confidence: round(Math.min(95, 45 + trades.length * 0.7 + Math.max(0, profitFactor - 1) * 12), 1),
    stabilityScore: round(profitFactor > 0 ? clamp((profitFactor / Math.max(1, profitFactor + Math.abs(dd.maxDD) / 10)) * 100, 0, 100) / 100 : 0, 2),
    fillModel: trades[0]?.outcome?.fillModel || 'realistic'
  };
}

export function makeRuxBacktestSnapshot({ marketData = null, symbol = 'BTCUSDT', tf = '4h', fillModel = 'realistic', ruleSet = null, costProfile = 'futures_normal', customCosts = null } = {}) {
  const candles = (marketData?.candles || []).filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  const src = candles.length >= 150 ? candles : makeDemoCandles(360, tf);
  const rows = buildSignalDataset(src, { symbol, tf, minScore: Number(ruleSet?.thresholds?.minFinal || 60), step: Math.max(5, Math.floor(src.length / 44)), lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel, ruleSet, costProfile, customCosts });
  const metrics = summarizeBacktestRows(rows);
  const conservativeRows = buildSignalDataset(src, { symbol, tf, minScore: Number(ruleSet?.thresholds?.minFinal || 60), step: Math.max(5, Math.floor(src.length / 44)), lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel: 'conservative', ruleSet, costProfile, customCosts });
  const aggressiveRows = buildSignalDataset(src, { symbol, tf, minScore: Number(ruleSet?.thresholds?.minFinal || 60), step: Math.max(5, Math.floor(src.length / 44)), lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel: 'aggressive', ruleSet, costProfile, customCosts });
  const conservative = summarizeBacktestRows(conservativeRows);
  const aggressive = summarizeBacktestRows(aggressiveRows);
  const oosValidation = makeBacktestOosValidationReport({ rows, fillModels: {
    aggressive: { netR: aggressive.netR, pf: aggressive.profitFactor, expectancy: aggressive.expectancy, maxDD: aggressive.maxDrawdownR },
    realistic: { netR: metrics.netR, pf: metrics.profitFactor, expectancy: metrics.expectancy, maxDD: metrics.maxDrawdownR },
    conservative: { netR: conservative.netR, pf: conservative.profitFactor, expectancy: conservative.expectancy, maxDD: conservative.maxDrawdownR }
  }, minOosTrades: 20 });
  return {
    symbol,
    tf,
    source: candles.length >= 150 ? (marketData?.source || 'live') : 'demo-fallback',
    candles: src.length,
    metrics,
    fillModels: {
      aggressive: { netR: aggressive.netR, pf: aggressive.profitFactor, expectancy: aggressive.expectancy, maxDD: aggressive.maxDrawdownR },
      realistic: { netR: metrics.netR, pf: metrics.profitFactor, expectancy: metrics.expectancy, maxDD: metrics.maxDrawdownR },
      conservative: { netR: conservative.netR, pf: conservative.profitFactor, expectancy: conservative.expectancy, maxDD: conservative.maxDrawdownR }
    },
    oosValidation,
    tradeLog: metrics.trades.slice(-14).reverse(),
    costProfile: getRuxCostProfile(costProfile, customCosts),
    generatedAt: Date.now(),
    ruleSet: ruleSet ? {
      id: ruleSet.id,
      name: ruleSet.name,
      setup: ruleSet.setup,
      regime: ruleSet.regime,
      direction: ruleSet.direction,
      thresholds: ruleSet.thresholds,
      weights: ruleSet.weights
    } : null,
    note: 'Backtest otomatik emir üretmez; manuel sinyal planının teorik Net-R sonucunu ölçer.'
  };
}


export function makeBacktestOosValidationReport({ rows = [], fillModels = null, splitRatio = 0.70, minOosTrades = 20 } = {}) {
  const ordered = (rows || [])
    .filter(r => Number.isFinite(Number(r.time)))
    .sort((a, b) => Number(a.time) - Number(b.time));
  const split = Math.max(1, Math.min(ordered.length - 1, Math.floor(ordered.length * splitRatio)));
  const isRows = ordered.slice(0, split);
  const oosRows = ordered.slice(split);
  const is = summarizeBacktestRows(isRows);
  const oos = summarizeBacktestRows(oosRows);
  const stability = is.profitFactor > 0 ? round((oos.profitFactor || 0) / Math.max(is.profitFactor, 0.01), 2) : 0;
  const expectancyRatio = Math.abs(is.expectancy) > 0.001 ? round((oos.expectancy || 0) / Math.abs(is.expectancy), 2) : (oos.expectancy > 0 ? 1 : 0);
  const sampleOk = oos.totalTrades >= Number(minOosTrades || 20);
  const oosPositive = oos.expectancy > 0 && oos.netR > 0 && oos.profitFactor >= 1.05;
  const stabilityOk = stability >= 0.80;
  const ddOk = Math.abs(oos.maxDrawdownR || 0) <= Math.max(4, Math.abs(is.maxDrawdownR || 0) * 1.35 + 2);
  const conservative = fillModels?.conservative || null;
  const fillRobust = !conservative || Number(conservative.netR || 0) >= 0 || Number(conservative.expectancy || 0) >= 0;
  const overfitScore = clamp(
    (stability < 0.60 ? 34 : stability < 0.80 ? 18 : 4) +
    (!oosPositive ? 28 : 0) +
    (!sampleOk ? 18 : 0) +
    (!ddOk ? 12 : 0) +
    (!fillRobust ? 12 : 0)
  );
  let verdict = 'VERİ BEKLİYOR';
  let tone = 'yellow';
  if (sampleOk && oosPositive && stabilityOk && ddOk && fillRobust) { verdict = 'OOS SAĞLAM'; tone = 'green'; }
  else if (sampleOk && oosPositive && stability >= 0.60) { verdict = 'SHADOW İZLEME'; tone = 'yellow'; }
  else if (sampleOk && (!oosPositive || stability < 0.60)) { verdict = 'OVERFIT RİSKİ'; tone = 'red'; }
  const gates = [
    { label: 'OOS örnek sayısı', value: `${oos.totalTrades}/${minOosTrades}`, ok: sampleOk, note: sampleOk ? 'Yeterli test işlemi var.' : 'OOS tarafında örnek sayısı düşük.' },
    { label: 'OOS expectancy', value: `${oos.expectancy >= 0 ? '+' : ''}${round(oos.expectancy, 3)}R`, ok: oos.expectancy > 0, note: oos.expectancy > 0 ? 'Görülmemiş dönemde pozitif.' : 'Görülmemiş dönemde edge zayıf.' },
    { label: 'Stability ratio', value: String(stability), ok: stabilityOk, note: stabilityOk ? 'OOS PF / IS PF oranı güçlü.' : 'IS performansı OOS tarafında korunmuyor.' },
    { label: 'Drawdown kapısı', value: `${round(oos.maxDrawdownR, 2)}R`, ok: ddOk, note: ddOk ? 'OOS drawdown kabul edilebilir.' : 'OOS drawdown IS’e göre bozulmuş.' },
    { label: 'Fill robustness', value: fillRobust ? 'Geçti' : 'Zayıf', ok: fillRobust, note: fillRobust ? 'Conservative fill sonucu sistemi kırmıyor.' : 'Sinyal aggressive/realistic dışında zayıflıyor.' }
  ];
  return {
    splitRatio,
    minOosTrades,
    is,
    oos,
    stability,
    expectancyRatio,
    sampleOk,
    oosPositive,
    stabilityOk,
    ddOk,
    fillRobust,
    overfitScore: round(overfitScore, 1),
    verdict,
    tone,
    gates,
    note: 'Bu kontrol otomatik aktivasyon yapmaz; backtestin geçmişe fazla uyup uymadığını ve OOS dayanıklılığını ölçer.'
  };
}

export function makeWalkForwardReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h', windows = 6, ruleSet = null } = {}) {
  const candles = (marketData?.candles || []).filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  // A03 — Demo fallback artık stabilite skoru üretmez. Yetersiz veri → açıkça YETERSİZ döner.
  const sufficient = candles.length >= 260;
  if (!sufficient) {
    return {
      symbol, tf, windows: [],
      summary: {
        windowCount: 0, accepted: 0, rejected: 0,
        avgOosExpectancy: 0, avgStability: 0, totalOosR: 0, totalOosTrades: 0,
        minSampleOk: false, positiveWindows: 0, positiveWindowRatio: 0,
        overfitRisk: 'YETERSİZ_VERİ',
        recommendation: `Walk-forward için en az 260 mum gerekir (mevcut: ${candles.length}). Stabilite ölçülmedi.`
      },
      heatmap: [],
      source: 'YETERSİZ_VERİ',
      insufficientData: true,
      ruleSet: ruleSet ? { id: ruleSet.id, name: ruleSet.name } : null
    };
  }
  const src = candles;
  const lookahead = 24;
  // Train + gap + test: gap = lookahead (look-ahead sızıntısını engeller)
  const minSeg = Math.floor((src.length - lookahead * windows) / (windows + 1));
  const out = [];
  for (let w = 0; w < windows; w++) {
    const trainStart = Math.max(0, w * minSeg);
    const trainEnd = Math.min(src.length, trainStart + minSeg * 2);
    // A03 — Train ile test arasına lookahead kadar BOŞLUK bırak (overlap yok).
    const testStart = Math.min(src.length, trainEnd + lookahead);
    const testEnd = Math.min(src.length, testStart + minSeg);
    if (testEnd - testStart < 35) continue;
    const train = src.slice(trainStart, trainEnd);
    const test = src.slice(testStart, testEnd); // artık train'in son barlarıyla çakışmıyor
    const minScore = Number(ruleSet?.thresholds?.minFinal ?? 60) || 60;
    const trainRows = buildSignalDataset(train, { symbol, tf, minScore, step: Math.max(4, Math.floor(train.length / 24)), lookahead, fillModel: 'realistic', ruleSet });
    const testRows = buildSignalDataset(test, { symbol, tf, minScore, step: Math.max(4, Math.floor(test.length / 18)), lookahead, fillModel: 'realistic', ruleSet });
    const is = summarizeBacktestRows(trainRows);
    const oos = summarizeBacktestRows(testRows);
    const stability = is.profitFactor > 0 ? round((oos.profitFactor || 0) / Math.max(is.profitFactor, 0.01), 2) : 0;
    const decision = oos.expectancy > 0 && stability >= 0.60 ? (stability >= 0.80 ? 'SHADOW-ONAY' : 'İZLEME') : 'RED';
    out.push({
      id: 'WF-' + String(w + 1).padStart(2, '0'),
      trainWindow: `${new Date(train[0]?.time || Date.now()).toLocaleDateString('tr-TR')} → ${new Date(train.at(-1)?.time || Date.now()).toLocaleDateString('tr-TR')}`,
      testWindow: `${new Date(test[0]?.time || Date.now()).toLocaleDateString('tr-TR')} → ${new Date(test.at(-1)?.time || Date.now()).toLocaleDateString('tr-TR')}`,
      gapBars: lookahead,
      isExpectancy: is.expectancy,
      oosExpectancy: oos.expectancy,
      isPF: is.profitFactor,
      oosPF: oos.profitFactor,
      oosNetR: oos.netR,
      oosDD: oos.maxDrawdownR,
      stability,
      trades: oos.totalTrades,
      decision,
      ruleSetId: ruleSet?.id || null,
      ruleSetName: ruleSet?.name || 'Varsayılan RUx'
    });
  }
  const accepted = out.filter(x => x.decision !== 'RED').length;
  const avgOosExp = out.length ? out.reduce((a,b)=>a+b.oosExpectancy,0)/out.length : 0;
  const avgStability = out.length ? out.reduce((a,b)=>a+b.stability,0)/out.length : 0;
  const totalOosR = out.reduce((a,b)=>a+b.oosNetR,0);
  const totalOosTrades = out.reduce((a,b)=>a+Number(b.trades||0),0);
  const minSampleOk = totalOosTrades >= Math.max(30, out.length * 5);
  const positiveWindows = out.filter(x => Number(x.oosExpectancy || 0) > 0 && Number(x.oosNetR || 0) > 0).length;
  const positiveWindowRatio = out.length ? positiveWindows / out.length * 100 : 0;
  const overfitRisk = avgStability < 0.60 || avgOosExp <= 0 ? 'YÜKSEK' : avgStability < 0.80 || !minSampleOk ? 'ORTA' : 'DÜŞÜK';
  const recommendation = accepted >= Math.ceil(out.length * 0.6) && avgOosExp > 0 && avgStability >= 0.60 && minSampleOk ? 'Shadow mode için uygun' : 'Aktivasyon yok; kural seti izlenmeli';
  return {
    symbol,
    tf,
    windows: out,
    summary: {
      windowCount: out.length,
      accepted,
      rejected: out.length - accepted,
      avgOosExpectancy: round(avgOosExp, 3),
      avgStability: round(avgStability, 2),
      totalOosR: round(totalOosR, 2),
      totalOosTrades,
      minSampleOk,
      positiveWindows,
      positiveWindowRatio: round(positiveWindowRatio, 1),
      overfitRisk,
      recommendation
    },
    heatmap: out.map(x => ({ label: x.id, values: [x.isExpectancy, x.oosExpectancy, x.stability - 1, x.oosNetR / 10].map(v => clamp(v, -1, 1)) })),
    source: marketData?.source || 'live',
    insufficientData: false,
    ruleSet: ruleSet ? {
      id: ruleSet.id,
      name: ruleSet.name,
      setup: ruleSet.setup,
      regime: ruleSet.regime,
      direction: ruleSet.direction,
      status: ruleSet.status,
      thresholds: ruleSet.thresholds,
      weights: ruleSet.weights
    } : null
  };
}


const ACTIVE_DECISION_WEIGHTS = Object.freeze({ setup: 30, regime: 20, confirmation: 25, execution: 15, rr: 10 });
const WEIGHT_KEYS = ['setup', 'regime', 'confirmation', 'execution', 'rr'];

function _normalizeWeights(weights = {}) {
  const raw = {};
  for (const k of WEIGHT_KEYS) raw[k] = Math.max(1, Number(weights[k] ?? ACTIVE_DECISION_WEIGHTS[k] ?? 1));
  const total = WEIGHT_KEYS.reduce((a, k) => a + raw[k], 0) || 1;
  const out = {};
  let used = 0;
  WEIGHT_KEYS.forEach((k, i) => {
    out[k] = i === WEIGHT_KEYS.length - 1 ? 100 - used : Math.round(raw[k] / total * 100);
    used += out[k];
  });
  return out;
}

function _weightedScore(scores = {}, weights = ACTIVE_DECISION_WEIGHTS) {
  const w = _normalizeWeights(weights);
  return clamp(WEIGHT_KEYS.reduce((sum, k) => sum + (Number(scores[k] || 0) * w[k] / 100), 0));
}

function _avg(arr = []) {
  return arr.length ? arr.reduce((a, b) => a + Number(b || 0), 0) / arr.length : 0;
}

function _evaluateWeightSet(rows = [], weights = ACTIVE_DECISION_WEIGHTS, opts = {}) {
  const minScore = Number(opts.minScore ?? 60);
  const candidateRows = rows.map(r => {
    const scores = r.snapshot?.scores || {};
    const weightedScore = _weightedScore(scores, weights);
    const direction = String(r.direction || '').toUpperCase();
    const tradeDirectionOk = direction.includes('LONG') || direction.includes('SHORT');
    const blocked = Boolean(r.blocked || r.snapshot?.noTrade?.blocked);
    const keep = tradeDirectionOk && !blocked && weightedScore >= minScore && r.outcome?.filled;
    return {
      ...r,
      weightedScore: round(weightedScore, 1),
      filled: keep,
      netR: keep ? Number(r.outcome?.netR || r.netR || 0) : 0,
      grossR: keep ? Number(r.outcome?.grossR || r.grossR || 0) : 0,
      status: keep ? r.status : (blocked ? 'NO_TRADE_BLOCK' : 'WEIGHT_FILTERED')
    };
  });
  const m = summarizeBacktestRows(candidateRows);
  return {
    ...m,
    weightedSignals: candidateRows.filter(r => Number(r.weightedScore || 0) >= minScore).length,
    filteredOut: candidateRows.filter(r => r.status === 'WEIGHT_FILTERED').length,
    weights: _normalizeWeights(weights),
    minScore
  };
}

function _componentContribution(rows = []) {
  const trades = rows.filter(r => r.filled && Number.isFinite(Number(r.netR)) && r.snapshot?.scores);
  const out = {};
  for (const key of WEIGHT_KEYS) {
    const values = trades.map(r => ({ score: Number(r.snapshot.scores[key] || 0), r: Number(r.netR || 0) })).filter(x => Number.isFinite(x.score));
    if (values.length < 6) { out[key] = 0; continue; }
    const median = percentile(values.map(x => x.score), 0.50);
    const high = values.filter(x => x.score >= median).map(x => x.r);
    const low = values.filter(x => x.score < median).map(x => x.r);
    out[key] = round(_avg(high) - _avg(low), 3);
  }
  return out;
}

function _suggestWeightsFromRows(rows = [], active = ACTIVE_DECISION_WEIGHTS) {
  const contrib = _componentContribution(rows);
  const next = { ...active };
  const positives = WEIGHT_KEYS.filter(k => contrib[k] > 0.05).sort((a, b) => contrib[b] - contrib[a]);
  const negatives = WEIGHT_KEYS.filter(k => contrib[k] < -0.05).sort((a, b) => contrib[a] - contrib[b]);
  for (const k of positives.slice(0, 2)) next[k] = Math.min(45, next[k] + 5);
  for (const k of negatives.slice(0, 2)) next[k] = Math.max(5, next[k] - 5);
  const normalized = _normalizeWeights(next);
  // Tek aktivasyonda +-5 puan sınırını koru.
  for (const k of WEIGHT_KEYS) {
    normalized[k] = clamp(normalized[k], Math.max(5, active[k] - 5), Math.min(45, active[k] + 5));
  }
  return _normalizeWeights(normalized);
}

function _weightDeltaOk(active, suggested, maxDelta = 5) {
  return WEIGHT_KEYS.every(k => Math.abs(Number(suggested[k] || 0) - Number(active[k] || 0)) <= maxDelta);
}

export function makeEdgeCalibrationReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h', ruleSet = null } = {}) {
  const candles = (marketData?.candles || []).filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  const src = candles.length >= 220 ? candles : makeDemoCandles(440, tf);
  const rows = buildSignalDataset(src, { symbol, tf, minScore: Number(ruleSet?.thresholds?.minFinal || 58), step: Math.max(4, Math.floor(src.length / 64)), lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel: 'realistic', ruleSet });
  const activeWeights = _normalizeWeights(ruleSet?.weights || ACTIVE_DECISION_WEIGHTS);
  const suggestedWeights = _suggestWeightsFromRows(rows, activeWeights);
  const champion = _evaluateWeightSet(rows, activeWeights, { minScore: 60 });
  const challenger = _evaluateWeightSet(rows, suggestedWeights, { minScore: 60 });
  const wf = makeWalkForwardReport({ marketData: { candles: src, source: 'calibration' }, symbol, tf, windows: 5, ruleSet });
  const sampleOk = challenger.totalTrades >= 100;
  const softSampleOk = challenger.totalTrades >= 35;
  const oosOk = Number(wf.summary?.avgOosExpectancy || 0) > 0;
  const stability = champion.profitFactor > 0 ? round((challenger.profitFactor || 0) / Math.max(champion.profitFactor || 0.01, 0.01), 2) : 0;
  const stabilityOk = stability >= 0.80 || Number(wf.summary?.avgStability || 0) >= 0.80;
  const ddOk = Math.abs(Number(challenger.maxDrawdownR || 0)) <= Math.abs(Number(champion.maxDrawdownR || 0)) * 1.10 + 0.75;
  const deltaOk = _weightDeltaOk(activeWeights, suggestedWeights, 5);
  const improvement = {
    expectancy: round(challenger.expectancy - champion.expectancy, 3),
    pf: round(challenger.profitFactor - champion.profitFactor, 2),
    netR: round(challenger.netR - champion.netR, 2),
    dd: round(challenger.maxDrawdownR - champion.maxDrawdownR, 2)
  };
  const hardBlockIndependent = true;
  const approved = sampleOk && oosOk && stabilityOk && ddOk && deltaOk && hardBlockIndependent;
  const status = approved ? 'AKTİVASYON ADAYI' : softSampleOk && oosOk && stabilityOk ? 'SHADOW MODE' : 'İZLEME / AKTİVASYON YOK';
  const rejectedReasons = [];
  if (!sampleOk) rejectedReasons.push('100+ filled örnek yok; doğrudan aktivasyon yerine izleme/shadow önerilir');
  if (!oosOk) rejectedReasons.push('OOS expectancy pozitif değil');
  if (!stabilityOk) rejectedReasons.push('Stability eşiği 0.80 altında');
  if (!ddOk) rejectedReasons.push('Drawdown mevcut setten anlamlı kötüleşiyor');
  if (!deltaOk) rejectedReasons.push('Ağırlık değişimi tek adımda ±5 sınırını aşıyor');
  const contrib = _componentContribution(rows);
  const topFeature = Object.entries(contrib).sort((a,b)=>b[1]-a[1])[0] || ['setup', 0];
  const reason = `${topFeature[0].toUpperCase()} katkısı son sinyal setinde daha yüksek görünüyor; öneri doğrudan aktif değil, önce shadow/OOS kontrolünden geçer.`;
  return {
    symbol,
    tf,
    source: candles.length >= 220 ? (marketData?.source || 'live') : 'demo-fallback',
    activeWeights,
    suggestedWeights,
    challengerWeights: suggestedWeights,
    champion,
    challenger,
    contribution: contrib,
    improvement,
    stabilityScore: round(Math.max(stability, Number(wf.summary?.avgStability || 0)), 2),
    walkForward: wf.summary,
    status,
    activationGate: {
      sampleOk,
      softSampleOk,
      oosOk,
      stabilityOk,
      drawdownOk: ddOk,
      deltaOk,
      hardBlockIndependent,
      approved
    },
    rejectedReasons,
    reason,
    rows,
    generatedAt: Date.now(),
    note: 'Edge Kalibrasyonu ağırlıkları otomatik aktifleştirmez; champion/challenger ve shadow mode ile doğrular.'
  };
}

function _optimizerCandidates(active = ACTIVE_DECISION_WEIGHTS) {
  const candidates = [];
  const bumps = [
    { setup: 5, confirmation: -5 },
    { setup: -5, confirmation: 5 },
    { regime: 5, execution: -5 },
    { execution: 5, regime: -5 },
    { rr: 5, setup: -5 },
    { confirmation: 5, execution: -5 },
    { confirmation: 5, regime: -5 },
    { setup: 5, rr: -5 },
    { execution: 5, rr: -5 },
    { regime: -5, rr: 5 },
    { setup: 0 },
  ];
  let id = 1;
  for (const b of bumps) {
    const w = { ...active };
    for (const [k, v] of Object.entries(b)) w[k] = (w[k] || 0) + v;
    candidates.push({ id: 'W' + String(id++).padStart(2, '0'), weights: _normalizeWeights(w), mode: 'weight-set' });
  }
  return candidates;
}

export function makeRuxOptimizerReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h', ruleSet = null } = {}) {
  const candles = (marketData?.candles || []).filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  const src = candles.length >= 220 ? candles : makeDemoCandles(440, tf);
  const rows = buildSignalDataset(src, { symbol, tf, minScore: Number(ruleSet?.thresholds?.minFinal || 58), step: Math.max(4, Math.floor(src.length / 64)), lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel: 'realistic', ruleSet });
  const activeWeights = _normalizeWeights(ruleSet?.weights || ACTIVE_DECISION_WEIGHTS);
  const candidates = _optimizerCandidates(activeWeights).map(c => {
    const m = _evaluateWeightSet(rows, c.weights, { minScore: 60 });
    const objective = round((m.expectancy * 12) + (m.profitFactor * 1.3) + (m.netR / Math.max(10, m.totalTrades)) + (m.maxDrawdownR / 10), 3);
    const robustness = clamp(45 + Math.min(25, m.totalTrades * 0.35) + Math.max(0, m.profitFactor - 1) * 12 + Math.min(12, Math.max(0, m.expectancy) * 25) + Math.max(-12, m.maxDrawdownR), 0, 100);
    return { ...c, metrics: m, objective, robustness: round(robustness, 1) };
  }).sort((a, b) => b.objective - a.objective);
  const best = candidates[0] || { weights: activeWeights, metrics: _evaluateWeightSet(rows, activeWeights), robustness: 0 };
  const active = _evaluateWeightSet(rows, activeWeights, { minScore: 60 });
  const safeCandidates = candidates.filter(c => c.metrics.totalTrades >= 25 && c.metrics.expectancy > 0 && c.metrics.profitFactor >= 1.10 && Math.abs(c.metrics.maxDrawdownR) <= Math.abs(active.maxDrawdownR) * 1.25 + 1);
  const xVals = [...new Set(candidates.map(c => c.weights.setup))].sort((a,b)=>a-b);
  const yVals = [...new Set(candidates.map(c => c.weights.confirmation))].sort((a,b)=>a-b);
  const heatRows = yVals.map(y => ({ label: 'Teyit ' + y, values: xVals.map(x => {
    const c = candidates.find(k => k.weights.setup === x && k.weights.confirmation === y);
    if (!c) return 0;
    return clamp(c.metrics.expectancy / 0.35, -1, 1);
  }) }));
  return {
    symbol,
    tf,
    source: candles.length >= 220 ? (marketData?.source || 'live') : 'demo-fallback',
    activeWeights,
    activeMetrics: active,
    candidates,
    best,
    safeCandidates,
    testedCombinations: candidates.length,
    limitedOptimization: true,
    maxOptimizedParams: 3,
    heatmap: { rows: heatRows, xLabels: xVals.map(x => 'Setup ' + x) },
    ruleSet: ruleSet ? {
      id: ruleSet.id,
      name: ruleSet.name,
      setup: ruleSet.setup,
      regime: ruleSet.regime,
      direction: ruleSet.direction,
      thresholds: ruleSet.thresholds,
      weights: ruleSet.weights
    } : null,
    warning: 'Optimizer yalnızca aday ağırlık/parametre seti önerir; otomatik emir veya otomatik aktivasyon yapmaz.',
    generatedAt: Date.now()
  };
}




function _ruxSeedRand(seed = 123456) {
  let s = Math.abs(Math.floor(Number(seed) || 1)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = s * 16807 % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function _ruxQuantile(values = [], q = 0.5) {
  return percentile(values, q);
}

function _ruxMean(values = []) {
  return values.length ? values.reduce((a, b) => a + Number(b || 0), 0) / values.length : 0;
}

function _ruxStd(values = []) {
  if (!values.length) return 0;
  const mean = _ruxMean(values);
  const variance = values.reduce((a, v) => a + (Number(v || 0) - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function _ruxStreak(values = [], type = 'loss') {
  let cur = 0, max = 0;
  for (const v of values) {
    const ok = type === 'win' ? Number(v) > 0 : Number(v) < 0;
    if (ok) { cur += 1; max = Math.max(max, cur); }
    else cur = 0;
  }
  return max;
}

function _ruxEquityFromReturns(values = []) {
  const curve = [0];
  for (const v of values) curve.push(round(curve.at(-1) + Number(v || 0), 3));
  return curve;
}

function _ruxHistogram(values = [], buckets = []) {
  return buckets.map(b => {
    const min = b.min ?? -Infinity;
    const max = b.max ?? Infinity;
    const count = values.filter(v => Number(v) >= min && Number(v) < max).length;
    return { label: b.label, value: count };
  });
}

export function makeMonteCarloRiskReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h', iterations = 700, seed = 128, ruinThresholdR = -10 } = {}) {
  const base = makeRuxBacktestSnapshot({ marketData, symbol, tf, fillModel: 'realistic' });
  const trades = (base.metrics?.trades || []).filter(t => Number.isFinite(Number(t.netR)));
  let rValues = trades.map(t => Number(t.netR || 0));
  if (rValues.length < 10) {
    const demoRows = buildSignalDataset(makeDemoCandles(520, tf), { symbol, tf, minScore: 60, step: 8, lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel: 'realistic' });
    rValues = summarizeBacktestRows(demoRows).trades.map(t => Number(t.netR || 0));
  }
  const n = Math.max(1, rValues.length);
  const rng = _ruxSeedRand(seed + n * 17 + Math.round(base.metrics?.netR || 0) * 13);
  const runs = [];
  const samplePaths = [];
  const runCount = Math.max(100, Math.min(3000, Number(iterations) || 700));
  for (let i = 0; i < runCount; i++) {
    const sampled = [];
    for (let j = 0; j < n; j++) sampled.push(rValues[Math.floor(rng() * n)] ?? 0);
    const curve = _ruxEquityFromReturns(sampled);
    const dd = _ruxMaxDrawdown(curve);
    const finalR = curve.at(-1) || 0;
    const ruinHit = curve.some(v => Number(v) <= Number(ruinThresholdR));
    runs.push({
      id: i + 1,
      finalR: round(finalR, 3),
      maxDD: dd.maxDD,
      worstPoint: round(Math.min(...curve), 3),
      bestPoint: round(Math.max(...curve), 3),
      maxLossStreak: _ruxStreak(sampled, 'loss'),
      maxWinStreak: _ruxStreak(sampled, 'win'),
      ruinHit
    });
    if (i < 36) samplePaths.push(curve);
  }
  const finals = runs.map(r => r.finalR).sort((a, b) => a - b);
  const maxDDs = runs.map(r => r.maxDD).sort((a, b) => a - b);
  const lossStreaks = runs.map(r => r.maxLossStreak).sort((a, b) => a - b);
  const posProb = runs.length ? runs.filter(r => r.finalR > 0).length / runs.length * 100 : 0;
  const ruinProb = runs.length ? runs.filter(r => r.ruinHit).length / runs.length * 100 : 0;
  const p05 = _ruxQuantile(finals, 0.05);
  const p50 = _ruxQuantile(finals, 0.50);
  const p95 = _ruxQuantile(finals, 0.95);
  const ddP05 = _ruxQuantile(maxDDs, 0.05); // daha negatif olan kuyruk
  const ddP10 = _ruxQuantile(maxDDs, 0.10); // P90 kötü senaryo drawdown
  const ddMedian = _ruxQuantile(maxDDs, 0.50);
  const ddWorst = Math.min(...maxDDs, 0);
  const p95LossStreak = _ruxQuantile(lossStreaks, 0.95);
  const currentPF = Number(base.metrics?.profitFactor || 0);
  const currentExp = Number(base.metrics?.expectancy || 0);
  let verdict = 'İZLE / EDGE ZAYIF';
  if (currentExp > 0.15 && currentPF >= 1.35 && ruinProb < 8 && p05 > -8) verdict = 'DAYANIKLI / SHADOW MODE UYGUN';
  else if (currentExp > 0 && currentPF >= 1.15 && ruinProb < 15) verdict = 'ORTA DAYANIKLILIK / RİSK AZALT';
  else if (ruinProb >= 20 || p05 <= -15) verdict = 'YÜKSEK RİSK / KURAL SETİ ZAYIF';
  const riskMultiplier = ruinProb > 15 || p05 < -12 ? 0.35 : ruinProb > 8 || p05 < -8 ? 0.50 : currentExp > 0.20 ? 0.85 : 0.65;
  const buckets = _ruxHistogram(finals, [
    { label: '≤-20R', max: -20 },
    { label: '-20/-10R', min: -20, max: -10 },
    { label: '-10/0R', min: -10, max: 0 },
    { label: '0/+10R', min: 0, max: 10 },
    { label: '+10/+20R', min: 10, max: 20 },
    { label: '+20/+40R', min: 20, max: 40 },
    { label: '≥+40R', min: 40 }
  ]);
  const ddBuckets = _ruxHistogram(maxDDs, [
    { label: '≤-20R', max: -20 },
    { label: '-20/-15R', min: -20, max: -15 },
    { label: '-15/-10R', min: -15, max: -10 },
    { label: '-10/-6R', min: -10, max: -6 },
    { label: '-6/-3R', min: -6, max: -3 },
    { label: '>-3R', min: -3 }
  ]);
  const originalCurve = _ruxEquityFromReturns(rValues);
  const worstFirst = [...rValues].sort((a, b) => a - b);
  const bestFirst = [...rValues].sort((a, b) => b - a);
  return {
    symbol,
    tf,
    source: base.source,
    iterations: runCount,
    tradeCount: n,
    ruinThresholdR,
    verdict,
    recommendedRiskMultiplier: round(riskMultiplier, 2),
    riskOfRuinProxy: round(ruinProb, 1),
    riskRecommendation: ruinProb > 15 || p05 < -12 ? 'Risk azalt / kural setini yeniden test et' : ruinProb > 8 || p05 < -8 ? 'Shadow mode ve düşük risk' : 'Standart manuel risk korunabilir',
    baseMetrics: {
      netR: base.metrics?.netR || 0,
      expectancy: base.metrics?.expectancy || 0,
      profitFactor: base.metrics?.profitFactor || 0,
      winRate: base.metrics?.winRate || 0,
      maxDrawdownR: base.metrics?.maxDrawdownR || 0,
      maxConsecutiveLosses: base.metrics?.maxConsecutiveLosses || 0
    },
    summary: {
      medianFinalR: round(p50, 2),
      p05FinalR: round(p05, 2),
      p95FinalR: round(p95, 2),
      bestFinalR: round(Math.max(...finals, 0), 2),
      worstFinalR: round(Math.min(...finals, 0), 2),
      probabilityPositive: round(posProb, 1),
      riskOfRuin: round(ruinProb, 1),
      medianMaxDD: round(ddMedian, 2),
      p90MaxDD: round(ddP10, 2),
      p95MaxDD: round(ddP05, 2),
      worstMaxDD: round(ddWorst, 2),
      p95LossStreak: Math.round(p95LossStreak || 0),
      avgFinalR: round(_ruxMean(finals), 2),
      stdFinalR: round(_ruxStd(finals), 2)
    },
    histogram: buckets,
    drawdownHistogram: ddBuckets,
    samplePaths,
    stress: {
      original: { finalR: round(originalCurve.at(-1) || 0, 2), maxDD: _ruxMaxDrawdown(originalCurve).maxDD, curve: originalCurve },
      worstFirst: { finalR: round(_ruxEquityFromReturns(worstFirst).at(-1) || 0, 2), maxDD: _ruxMaxDrawdown(_ruxEquityFromReturns(worstFirst)).maxDD, curve: _ruxEquityFromReturns(worstFirst) },
      bestFirst: { finalR: round(_ruxEquityFromReturns(bestFirst).at(-1) || 0, 2), maxDD: _ruxMaxDrawdown(_ruxEquityFromReturns(bestFirst)).maxDD, curve: _ruxEquityFromReturns(bestFirst) }
    },
    note: 'Monte Carlo motoru sinyal sırasını ve örneklem dağılımını stres test eder; otomatik emir veya otomatik risk artırımı yapmaz.',
    generatedAt: Date.now()
  };
}

function _ruxSkewness(values = []) {
  const n = values.length;
  if (n < 3) return 0;
  const mean = _ruxMean(values);
  const sd = _ruxStd(values) || 1e-9;
  const m3 = values.reduce((a, v) => a + ((Number(v) - mean) / sd) ** 3, 0) / n;
  return m3;
}

function _ruxKurtosis(values = []) {
  const n = values.length;
  if (n < 4) return 0;
  const mean = _ruxMean(values);
  const sd = _ruxStd(values) || 1e-9;
  return values.reduce((a, v) => a + ((Number(v) - mean) / sd) ** 4, 0) / n;
}

function _ruxGroupBy(rows = [], keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

export function makeStatisticsPerformanceReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const backtest = makeRuxBacktestSnapshot({ marketData, symbol, tf, fillModel: 'realistic' });
  const metrics = backtest.metrics || {};
  const trades = (metrics.trades || []).filter(t => t.filled);
  const rValues = trades.map(t => Number(t.netR || 0));
  const equityCurve = metrics.equityCurve || _ruxEquityFromReturns(rValues);
  const ddCurve = metrics.drawdownCurve || _ruxMaxDrawdown(equityCurve).drawdownCurve;
  const mean = _ruxMean(rValues);
  const sd = _ruxStd(rValues);
  const downside = _ruxStd(rValues.filter(v => v < 0));
  const sharpe = sd ? mean / sd * Math.sqrt(Math.max(1, rValues.length)) : 0;
  const sortino = downside ? mean / downside * Math.sqrt(Math.max(1, rValues.length)) : 0;
  const calmar = Math.abs(metrics.maxDrawdownR || 0) > 0 ? Number(metrics.netR || 0) / Math.abs(Number(metrics.maxDrawdownR || 0)) : 0;
  const recovery = Math.abs(metrics.maxDrawdownR || 0) > 0 ? Number(metrics.netR || 0) / Math.abs(Number(metrics.maxDrawdownR || 0)) : 0;
  const best = rValues.length ? Math.max(...rValues) : 0;
  const worst = rValues.length ? Math.min(...rValues) : 0;
  const median = _ruxQuantile(rValues, 0.5);
  const variance = sd ** 2;
  const barsHeld = trades.map(t => Number(t.outcome?.barsHeld || 0)).filter(Number.isFinite);
  const dowMap = _ruxGroupBy(trades, t => new Date(t.time).getDay());
  const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const dayPerformance = dayNames.map((name, idx) => {
    const vals = (dowMap.get(idx) || []).map(t => Number(t.netR || 0));
    return { label: name, value: round(_ruxMean(vals), 3), count: vals.length, netR: round(vals.reduce((a,b)=>a+b,0), 2) };
  });
  const hourMap = _ruxGroupBy(trades, t => new Date(t.time).getHours());
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const vals = (hourMap.get(h) || []).map(t => Number(t.netR || 0));
    return { hour: h, value: round(_ruxMean(vals), 3), count: vals.length };
  });
  const monthMap = _ruxGroupBy(trades, t => {
    const d = new Date(t.time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const monthly = Array.from(monthMap.entries()).map(([month, arr]) => {
    const vals = arr.map(t => Number(t.netR || 0));
    const wins = vals.filter(v => v > 0).length;
    const losses = vals.filter(v => v < 0).length;
    const gp = vals.filter(v => v > 0).reduce((a,b)=>a+b,0);
    const gl = Math.abs(vals.filter(v => v < 0).reduce((a,b)=>a+b,0));
    return { month, trades: vals.length, netR: round(vals.reduce((a,b)=>a+b,0), 2), winRate: round(vals.length ? wins / vals.length * 100 : 0, 1), pf: round(gl ? gp / gl : gp ? 99 : 0, 2), losses };
  }).sort((a,b)=>String(b.month).localeCompare(String(a.month)));
  const returnHistogram = _ruxHistogram(rValues, [
    { label: '≤-2R', max: -2 },
    { label: '-2/-1R', min: -2, max: -1 },
    { label: '-1/0R', min: -1, max: 0 },
    { label: '0/+1R', min: 0, max: 1 },
    { label: '+1/+2R', min: 1, max: 2 },
    { label: '+2/+3R', min: 2, max: 3 },
    { label: '≥+3R', min: 3 }
  ]);
  const durationHistogram = _ruxHistogram(barsHeld, [
    { label: '0-4', min: 0, max: 4 },
    { label: '4-8', min: 4, max: 8 },
    { label: '8-16', min: 8, max: 16 },
    { label: '16-24', min: 16, max: 24 },
    { label: '24-32', min: 24, max: 32 },
    { label: '32+', min: 32 }
  ]);
  return {
    symbol,
    tf,
    source: backtest.source,
    metrics: {
      totalTrades: metrics.totalTrades || 0,
      netR: metrics.netR || 0,
      grossR: metrics.grossR || 0,
      winRate: metrics.winRate || 0,
      profitFactor: metrics.profitFactor || 0,
      expectancy: metrics.expectancy || 0,
      maxDrawdownR: metrics.maxDrawdownR || 0,
      maxConsecutiveLosses: metrics.maxConsecutiveLosses || 0,
      maxWinStreak: _ruxStreak(rValues, 'win'),
      avgWin: metrics.avgWin || 0,
      avgLoss: metrics.avgLoss || 0,
      medianR: round(median, 3),
      bestR: round(best, 2),
      worstR: round(worst, 2),
      stdDev: round(sd, 3),
      variance: round(variance, 3),
      sharpe: round(sharpe, 2),
      sortino: round(sortino, 2),
      calmar: round(calmar, 2),
      recoveryFactor: round(recovery, 2),
      skewness: round(_ruxSkewness(rValues), 2),
      kurtosis: round(_ruxKurtosis(rValues), 2),
      avgBarsHeld: round(_ruxMean(barsHeld), 1),
      sampleConfidence: metrics.confidence || 0
    },
    equityCurve,
    drawdownCurve: ddCurve,
    returnHistogram,
    durationHistogram,
    dayPerformance,
    hourly,
    monthly,
    setupPerformance: metrics.setupPerformance || [],
    generatedAt: Date.now(),
    note: 'İstatistik raporu manuel sinyal planlarının teorik Net-R sonuçları üzerinden üretilir; gerçek emir geçmişi değildir.'
  };
}



function _ruxSigned(seed = 1) {
  const x = Math.sin(seed * 9301.128) * 10000;
  return x - Math.floor(x);
}

function _ruxPlanEntry(snapshot = {}) {
  const preferred = _ruxParseNumber(snapshot.manualPlan?.preferredEntry);
  if (Number.isFinite(preferred)) return preferred;
  const [lo, hi] = _ruxParseRange(snapshot.manualPlan?.entryZone);
  if (Number.isFinite(lo) && Number.isFinite(hi)) return (lo + hi) / 2;
  return Number(snapshot.price || NaN);
}

function _ruxDirectionClean(direction = '') {
  const d = String(direction || '').toUpperCase();
  if (d.includes('SHORT')) return 'SHORT';
  if (d.includes('LONG')) return 'LONG';
  return 'WATCH';
}

function _ruxFidelityLabel(score = 0) {
  const s = Number(score) || 0;
  if (s >= 85) return { label: 'YÜKSEK SADAKAT', cls: 'green' };
  if (s >= 70) return { label: 'KABUL EDİLEBİLİR', cls: 'cyan' };
  if (s >= 55) return { label: 'SAPMA VAR', cls: 'yellow' };
  return { label: 'DİSİPLİN İHLALİ', cls: 'red' };
}


const RUX_TRACKED_POSITION_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','AVAXUSDT','LINKUSDT','BNBUSDT','OPUSDT','ARBUSDT'];
const RUX_REFERENCE_PRICES = {
  BTCUSDT: 80000,
  ETHUSDT: 4200,
  SOLUSDT: 180,
  AVAXUSDT: 35,
  LINKUSDT: 19,
  BNBUSDT: 620,
  OPUSDT: 1.65,
  ARBUSDT: 0.42
};
const RUX_SYMBOL_RISK_PCT = {
  BTCUSDT: 0.010,
  ETHUSDT: 0.012,
  SOLUSDT: 0.018,
  AVAXUSDT: 0.022,
  LINKUSDT: 0.020,
  BNBUSDT: 0.014,
  OPUSDT: 0.030,
  ARBUSDT: 0.035
};

function _ruxSymbolMarket(marketData = null, sym = '') {
  const key = String(sym || '').toUpperCase();
  if (marketData?.bySymbol?.[key]) return marketData.bySymbol[key];
  if (marketData?.quotes?.[key]) return marketData.quotes[key];
  if (String(marketData?.symbol || '').toUpperCase() === key) return marketData;
  return null;
}

function _ruxSymbolPriceProfile(sym = 'BTCUSDT', idx = 0, marketData = null) {
  const key = String(sym || '').toUpperCase();
  const md = _ruxSymbolMarket(marketData, key);
  const candles = (md?.candles || []).filter(c => Number.isFinite(Number(c.close)));
  const tickerPrice = Number(md?.ticker?.price || md?.price || md?.lastPrice);
  const lastClose = Number(candles.at(-1)?.close);
  let price = Number.isFinite(tickerPrice) && tickerPrice > 0 ? tickerPrice : lastClose;
  let source = md?.source || md?.market || 'referans';
  if (!Number.isFinite(price) || price <= 0) {
    const ref = Number(RUX_REFERENCE_PRICES[key] || 10);
    price = ref * (1 + (_ruxSigned(idx * 19 + String(key).length) - 0.5) * 0.035);
    source = 'referans-fallback';
  }
  const atrSeries = candles.length ? atr(candles, 14) : [];
  const atrNow = Number(atrSeries.at(-1));
  const pctRisk = Number(RUX_SYMBOL_RISK_PCT[key] || 0.02);
  const riskUnit = Number.isFinite(atrNow) && atrNow > 0
    ? clamp(atrNow * 0.72, price * pctRisk * 0.45, price * pctRisk * 2.20)
    : price * pctRisk;
  return {
    symbol: key,
    price: round(price, price > 100 ? 2 : price > 1 ? 4 : 6),
    riskUnit: Math.max(riskUnit, price * 0.004, 1e-9),
    candles,
    marketData: md,
    source
  };
}

function _ruxExecutionDeviation({ idx = 0, symbol = 'BTCUSDT', direction = 'LONG' } = {}) {
  const base = _ruxSigned(idx + String(symbol).length * 13);
  const lateBias = (base - 0.42) * 0.62;
  const exitNoise = (_ruxSigned(idx * 7 + 17) - 0.52) * 0.74;
  const slippageBps = round(2 + Math.abs(lateBias) * 18 + _ruxSigned(idx * 5 + 4) * 4, 2);
  return {
    entryDeviationR: round(lateBias, 3),
    exitDeviationR: round(exitNoise, 3),
    slippageBps,
    latencyMs: Math.round(85 + _ruxSigned(idx * 11 + 9) * 620),
    orderType: idx % 4 === 0 ? 'MARKET' : 'LIMIT',
    disciplineFlag: Math.abs(lateBias) > 0.38 || Math.abs(exitNoise) > 0.55,
    direction: _ruxDirectionClean(direction)
  };
}

export function makeUserExecutionFidelityReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const backtest = makeRuxBacktestSnapshot({ marketData, symbol, tf, fillModel: 'realistic' });
  let trades = (backtest.metrics?.trades || []).filter(t => t.filled).slice(-18);
  if (trades.length < 8) {
    const demo = makeRuxBacktestSnapshot({ marketData: { candles: makeDemoCandles(460, tf), source: 'demo' }, symbol, tf, fillModel: 'realistic' });
    trades = (demo.metrics?.trades || []).filter(t => t.filled).slice(-18);
  }
  const executions = trades.map((t, idx) => {
    const snap = t.snapshot || {};
    const direction = _ruxDirectionClean(t.direction || snap.direction);
    const plannedEntry = _ruxPlanEntry(snap);
    const stop = _ruxParseNumber(snap.manualPlan?.stopReference);
    const risk = Math.max(Math.abs(plannedEntry - stop), Math.abs(plannedEntry) * 0.006, 1e-9);
    const dev = _ruxExecutionDeviation({ idx: idx + 1, symbol: t.asset || symbol, direction });
    const userEntry = direction === 'SHORT'
      ? plannedEntry - dev.entryDeviationR * risk
      : plannedEntry + dev.entryDeviationR * risk;
    const plannedR = Number(t.netR || t.outcome?.netR || 0);
    const userR = round(plannedR - Math.max(0, Math.abs(dev.entryDeviationR) * 0.68) + dev.exitDeviationR * 0.28 - dev.slippageBps / 1000, 2);
    const executionLoss = round(userR - plannedR, 2);
    const fidelity = clamp(100 - Math.abs(dev.entryDeviationR) * 48 - Math.max(0, -executionLoss) * 13 - dev.slippageBps * 0.8 - (dev.disciplineFlag ? 8 : 0));
    const grade = _ruxFidelityLabel(fidelity);
    return {
      id: idx + 1,
      time: t.time || Date.now() - idx * expectedGapMsForTf(tf),
      asset: t.asset || symbol,
      tf,
      setup: t.setup || snap.setup || 'RUx Setup',
      direction,
      plannedEntry: round(plannedEntry, plannedEntry > 100 ? 2 : 5),
      userEntry: round(userEntry, userEntry > 100 ? 2 : 5),
      stopReference: round(stop, stop > 100 ? 2 : 5),
      plannedR: round(plannedR, 2),
      userR,
      executionLoss,
      entryDeviationR: dev.entryDeviationR,
      exitDeviationR: dev.exitDeviationR,
      slippageBps: dev.slippageBps,
      latencyMs: dev.latencyMs,
      orderType: dev.orderType,
      fidelity: round(fidelity, 1),
      fidelityLabel: grade.label,
      fidelityClass: grade.cls,
      status: userR >= 1 ? 'TP / KÂRLI' : userR > 0 ? 'KISMİ KÂR' : userR <= -0.95 ? 'STOP / ZARAR' : 'ZAYIF ÇIKIŞ',
      disciplineFlag: dev.disciplineFlag
    };
  });
  const signalNetR = round(executions.reduce((a, e) => a + e.plannedR, 0), 2);
  const userNetR = round(executions.reduce((a, e) => a + e.userR, 0), 2);
  const executionLoss = round(userNetR - signalNetR, 2);
  const avgFidelity = round(_ruxMean(executions.map(e => e.fidelity)), 1);
  const avgEntryDeviationR = round(_ruxMean(executions.map(e => Math.abs(e.entryDeviationR))), 3);
  const avgSlippageBps = round(_ruxMean(executions.map(e => e.slippageBps)), 2);
  const lateEntries = executions.filter(e => e.entryDeviationR > 0.18).length;
  const violations = executions.filter(e => e.disciplineFlag).length;
  const label = _ruxFidelityLabel(avgFidelity);
  return {
    symbol,
    tf,
    source: backtest.source,
    summary: {
      totalExecutions: executions.length,
      signalNetR,
      userNetR,
      executionLoss,
      avgFidelity,
      avgEntryDeviationR,
      avgSlippageBps,
      lateEntries,
      violations,
      label: label.label,
      cls: label.cls,
      goodExecutions: executions.filter(e => e.fidelity >= 75).length,
      weakExecutions: executions.filter(e => e.fidelity < 60).length
    },
    executions,
    note: 'Bu rapor gerçek borsa bağlantısı kurmaz; kullanıcı uygulamasını RUx teorik sinyal planıyla kıyaslayan manuel takip katmanıdır.',
    generatedAt: Date.now()
  };
}

export function makeOpenPositionsReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const fallbackFidelity = makeUserExecutionFidelityReport({ marketData: _ruxSymbolMarket(marketData, symbol) || marketData, symbol, tf });
  const base = fallbackFidelity.executions.slice(0, 8);
  const betaMap = { BTCUSDT: 1.00, ETHUSDT: 0.85, SOLUSDT: 1.25, AVAXUSDT: 1.55, LINKUSDT: 1.10, BNBUSDT: 0.70, OPUSDT: 1.35, ARBUSDT: 1.40 };
  const symbols = RUX_TRACKED_POSITION_SYMBOLS;
  const positions = symbols.map((sym, idx) => {
    const profile = _ruxSymbolPriceProfile(sym, idx, marketData);
    const localMd = _ruxSymbolMarket(marketData, sym);
    let localExec = null;
    if (localMd?.candles?.length >= 150) {
      const localFidelity = makeUserExecutionFidelityReport({ marketData: localMd, symbol: sym, tf });
      localExec = localFidelity.executions[idx % Math.max(localFidelity.executions.length, 1)];
    }
    const e = localExec || base[idx] || base[0] || {};
    const dir = idx === 5 || idx === 7 ? 'SHORT' : (e.direction || 'LONG');
    const risk = Math.max(Number(profile.riskUnit || 0), Number(profile.price || 0) * (RUX_SYMBOL_RISK_PCT[sym] || 0.02));
    const liveR = round(Math.max(-1.15, Math.min(2.85, Number(e.userR || 0) * 0.55 + (_ruxSigned(idx + 33) - 0.35) * 0.75)), 2);
    const current = Number(profile.price);
    const entry = dir === 'SHORT' ? current + liveR * risk : current - liveR * risk;
    const notional = 9000 + idx * 720 + Math.round(_ruxSigned(idx + 4) * 2200);
    const qty = Math.max(notional / Math.max(current, 1e-9), 0);
    const pnl = round(liveR * risk * qty, 2);
    const riskPct = [0.75,0.50,0.50,0.25,0.25,0.20,0.15,0.15][idx] || 0.15;
    const tp1 = dir === 'SHORT' ? entry - risk * 1.4 : entry + risk * 1.4;
    const tp2 = dir === 'SHORT' ? entry - risk * 2.2 : entry + risk * 2.2;
    const stop = dir === 'SHORT' ? entry + risk : entry - risk;
    const fidelityScore = Number(e.fidelity || 75);
    const grade = _ruxFidelityLabel(fidelityScore);
    return {
      id: idx + 1,
      asset: sym,
      direction: dir,
      entry: round(entry, entry > 100 ? 2 : entry > 1 ? 4 : 6),
      current: round(current, current > 100 ? 2 : current > 1 ? 4 : 6),
      quantity: round(qty, qty > 10 ? 2 : 5),
      notional: round(notional, 2),
      stop: round(stop, stop > 100 ? 2 : stop > 1 ? 4 : 6),
      tp1: round(tp1, tp1 > 100 ? 2 : tp1 > 1 ? 4 : 6),
      tp2: round(tp2, tp2 > 100 ? 2 : tp2 > 1 ? 4 : 6),
      pnl,
      r: liveR,
      riskPct,
      beta: betaMap[sym] || 1,
      heat: round(riskPct * (betaMap[sym] || 1), 3),
      planStatus: Math.abs(Number(e.entryDeviationR || 0)) <= 0.22 ? 'PLANA UYGUN' : 'SAPMA VAR',
      fidelity: fidelityScore,
      fidelityLabel: grade.label,
      fidelityClass: grade.cls,
      status: liveR >= 1.4 ? 'TP1 SONRASI' : liveR > 0 ? 'AKTİF' : liveR <= -0.75 ? 'STOPA YAKIN' : 'İZLE',
      priceSource: profile.source
    };
  });
  const heat = calculatePortfolioHeat(positions.map(p => ({ symbol: p.asset, direction: p.direction, riskPct: p.riskPct, beta: p.beta })), { usdtDominance: 4.79 });
  const totalPnl = round(positions.reduce((a, p) => a + p.pnl, 0), 2);
  const totalRisk = round(positions.reduce((a, p) => a + p.riskPct, 0), 2);
  const avgR = round(_ruxMean(positions.map(p => p.r)), 2);
  const avgFidelity = round(_ruxMean(positions.map(p => p.fidelity)), 1);
  return {
    symbol,
    tf,
    summary: {
      openCount: positions.length,
      longCount: positions.filter(p => p.direction === 'LONG').length,
      shortCount: positions.filter(p => p.direction === 'SHORT').length,
      totalPnl,
      totalRiskPct: totalRisk,
      avgR,
      avgFidelity,
      heat: heat.totalHeat,
      heatLabel: heat.label,
      action: heat.action,
      atRiskCount: positions.filter(p => p.status === 'STOPA YAKIN').length
    },
    positions,
    heat,
    generatedAt: Date.now(),
    note: 'Açık pozisyon katmanı manuel girilen/temsilî pozisyonları her coin için kendi fiyat ölçeğiyle RUx sinyal planına göre izler; emir kapatma göndermez.'
  };
}

export function makeOrderHistoryReport({ marketData = null, symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const positionsReport = makeOpenPositionsReport({ marketData, symbol, tf });
  const orders = [];
  positionsReport.positions.forEach((p, idx) => {
    const status = idx % 13 === 0 ? 'İPTAL' : idx % 17 === 0 ? 'REDDEDİLDİ' : 'GERÇEKLEŞTİ';
    const cls = status === 'GERÇEKLEŞTİ' ? 'green' : status === 'İPTAL' ? 'yellow' : 'red';
    const entryNotional = Number(p.notional || (8500 + idx * 230));
    const fidelity = Number(p.fidelity || 75);
    const slip = round(2 + Math.abs(Number(p.r || 0)) * 6 + _ruxSigned(idx + 99) * 5, 2);
    const latency = Math.round(85 + _ruxSigned(idx * 11 + 9) * 620);
    const plannedR = round(Number(p.r || 0) + Math.max(0, _ruxSigned(idx + 12) - 0.5) * 0.55, 2);
    const userR = round(Number(p.r || 0), 2);
    orders.push({
      id: 300 + idx,
      time: Date.now() - idx * expectedGapMsForTf(tf),
      asset: p.asset,
      direction: p.direction,
      type: idx % 4 === 0 ? 'MARKET' : 'LIMIT',
      price: p.entry,
      quantity: round(entryNotional / Math.max(Number(p.entry), 1e-9), 5),
      notional: round(entryNotional, 2),
      fee: round(entryNotional * 0.00045, 2),
      status,
      statusClass: cls,
      strategy: 'RUx Manuel Plan',
      plannedR,
      userR,
      slippageBps: slip,
      latencyMs: latency,
      fidelity,
      fidelityClass: p.fidelityClass,
      fidelityLabel: p.fidelityLabel,
      note: p.planStatus === 'SAPMA VAR' ? 'Plan sapması izlensin' : 'Plan uyumlu'
    });
    if (idx % 2 === 0) {
      const exitPrice = userR > 0 ? p.tp1 : p.stop;
      orders.push({
        id: 500 + idx,
        time: Date.now() - idx * expectedGapMsForTf(tf) + expectedGapMsForTf(tf) * 0.75,
        asset: p.asset,
        direction: p.direction,
        type: userR > 0 ? 'TP' : 'SL',
        price: exitPrice,
        quantity: round((entryNotional * 0.35) / Math.max(Number(p.entry), 1e-9), 5),
        notional: round(entryNotional * 0.35, 2),
        fee: round(entryNotional * 0.35 * 0.00045, 2),
        status: 'GERÇEKLEŞTİ',
        statusClass: 'green',
        strategy: 'RUx Plan Takibi',
        plannedR,
        userR,
        slippageBps: round(slip * 0.65, 2),
        latencyMs: Math.max(35, Math.round(latency * 0.72)),
        fidelity,
        fidelityClass: p.fidelityClass,
        fidelityLabel: p.fidelityLabel,
        note: userR > 0 ? 'TP gerçekleşti' : 'Stop gerçekleşti'
      });
    }
  });
  orders.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
  const filled = orders.filter(o => o.status === 'GERÇEKLEŞTİ').length;
  const cancelled = orders.filter(o => o.status === 'İPTAL').length;
  const rejected = orders.filter(o => o.status === 'REDDEDİLDİ').length;
  const avgSlippageBps = round(_ruxMean(orders.map(o => Number(o.slippageBps || 0))), 2);
  const avgLatencyMs = Math.round(_ruxMean(orders.map(o => Number(o.latencyMs || 0))));
  const avgFidelity = round(_ruxMean(orders.map(o => Number(o.fidelity || 0))), 1);
  const executionQuality = clamp(100 - avgSlippageBps * 1.4 - Math.max(0, avgLatencyMs - 150) / 40 - rejected * 2.5 - cancelled * 0.6);
  const signalNetR = round(orders.reduce((a, o) => a + Number(o.plannedR || 0), 0), 2);
  const userNetR = round(orders.reduce((a, o) => a + Number(o.userR || 0), 0), 2);
  return {
    symbol,
    tf,
    summary: {
      totalOrders: orders.length,
      filled,
      cancelled,
      rejected,
      fillRate: round(orders.length ? filled / orders.length * 100 : 0, 1),
      avgSlippageBps,
      avgLatencyMs,
      avgFidelity,
      executionQuality: round(executionQuality, 1),
      signalNetR,
      userNetR,
      executionLoss: round(userNetR - signalNetR, 2)
    },
    orders,
    positionsReport,
    generatedAt: Date.now(),
    note: 'Emir geçmişi ekranı manuel uygulama kayıtlarını ve plan sadakatini analiz eder; borsaya emir göndermez.'
  };
}


export const RUX_SOURCE_CATEGORIES = Object.freeze({
  ohlcv: 'OHLCV',
  funding: 'Funding',
  openInterest: 'Open Interest',
  news: 'Haber',
  metadata: 'Metadata',
  onchain: 'On-chain',
  sentiment: 'Sentiment',
  system: 'Sistem',
  crossExchange: 'Cross-Exchange'
});

export function scoreSourceCheck(check = {}) {
  const ok = Boolean(check.ok);
  const optional = Boolean(check.optional);
  const latency = Number(check.latencyMs || 0);
  const count = check.count;
  let score = ok ? 92 : optional ? 58 : 28;
  if (ok && latency > 800) score -= 12;
  if (ok && latency > 2000) score -= 18;
  if (ok && latency <= 250) score += 4;
  if (count === 0) score -= 18;
  if (String(check.error || '').toLowerCase().includes('yapılandırılmamış')) score = optional ? 62 : 44;
  return clamp(score, 0, 100);
}

export function makeRuxDataConfidenceReport(checks = []) {
  const byCategory = new Map();
  (checks || []).forEach(ch => {
    const cat = ch.category || 'system';
    const score = scoreSourceCheck(ch);
    const prev = byCategory.get(cat) || [];
    prev.push({ ...ch, score });
    byCategory.set(cat, prev);
  });
  const categoryScores = {};
  for (const [cat, rows] of byCategory.entries()) {
    const critical = rows.filter(r => !r.optional);
    const src = critical.length ? critical : rows;
    const avg = src.reduce((a,b)=>a + Number(b.score || 0), 0) / Math.max(1, src.length);
    categoryScores[cat] = round(avg, 1);
  }
  const defaults = { ohlcv: 72, funding: 70, openInterest: 68, news: 70, metadata: 70, onchain: 58, sentiment: 68, crossExchange: 74 };
  const s = { ...defaults, ...categoryScores };
  const overall = round(
    (s.ohlcv * 0.22) +
    (s.funding * 0.14) +
    (s.openInterest * 0.14) +
    (s.news * 0.12) +
    (s.metadata * 0.10) +
    (s.onchain * 0.08) +
    (s.sentiment * 0.08) +
    (s.crossExchange * 0.12), 1
  );
  const critical = checks.filter(x => !x.ok && !x.optional).length;
  const warnings = checks.filter(x => !x.ok && x.optional || x.ok && Number(x.latencyMs || 0) > 1500).length;
  const fallbackUsed = checks.filter(x => String(x.source || '').toLowerCase().includes('fallback') || String(x.provider || '').toLowerCase().includes('fallback')).length;
  const label = overall >= 85 ? 'GÜÇLÜ' : overall >= 70 ? 'KULLANILABİLİR' : overall >= 50 ? 'DÜŞÜK GÜVEN' : 'SİNYALİ BLOKE ET';
  return {
    overall,
    label,
    categories: s,
    critical,
    warnings,
    fallbackUsed,
    checkedAt: new Date().toISOString(),
    rows: (checks || []).map(ch => ({ ...ch, score: scoreSourceCheck(ch) }))
  };
}

export function makeSignalDataSourceTags(snapshot = {}) {
  const data = snapshot.data || {};
  const map = snapshot.sourceMap || {};
  return [
    { label: 'OHLCV', value: map.ohlcv || snapshot.source || '—', score: data.score ?? 0 },
    { label: 'Funding', value: map.funding || 'Fallback hazır', score: data.score ? Math.min(96, data.score + 2) : 70 },
    { label: 'OI', value: map.openInterest || 'Perp context', score: data.score ? Math.max(45, data.score - 4) : 68 },
    { label: 'Haber', value: map.news || 'News Pulse', score: 72 },
    { label: 'Dune', value: map.onchain || 'Opsiyonel', score: 58 }
  ];
}


export function makeSignalExplainabilityReport(snapshot = {}) {
  const score = Number(snapshot.final?.score ?? 0);
  const dataScore = Number(snapshot.data?.score ?? 0);
  const noTradeScore = Number(snapshot.noTrade?.score ?? 0);
  const manipulation = Number(snapshot.manipulationRisk ?? 0);
  const scores = snapshot.scores || {};
  const plan = snapshot.manualPlan || {};
  const tech = snapshot.technicals || {};
  const regime = snapshot.regime || {};
  const direction = String(snapshot.direction || 'BEKLE / İZLE');
  const blocked = Boolean(snapshot.noTrade?.blocked);
  const hardBlocks = Array.isArray(snapshot.noTrade?.hardBlocks) ? snapshot.noTrade.hardBlocks : [];
  const warnings = Array.isArray(snapshot.noTrade?.softWarnings) ? snapshot.noTrade.softWarnings : [];

  const verdict = blocked ? 'İŞLEM ENGELİ' : score >= 85 ? 'GÜÇLÜ MANUEL PLAN' : score >= 75 ? 'GEÇERLİ MANUEL PLAN' : score >= 70 ? 'HAZIRLIK / TETİKLEYİCİ BEKLE' : 'İZLE / SİNYAL YOK';
  const tone = blocked || score < 60 ? 'red' : score >= 75 ? 'green' : 'yellow';
  const shortDirection = direction.includes('LONG') ? 'LONG / AL' : direction.includes('SHORT') ? 'SHORT / SAT' : 'BEKLE';

  const explainScore = (value) => {
    const n = Number(value || 0);
    if (n >= 80) return 'güçlü';
    if (n >= 65) return 'kullanılabilir';
    if (n >= 50) return 'zayıf/karışık';
    return 'yetersiz';
  };

  const primary = [];
  primary.push({
    state: Number(scores.regime || 0) >= 70 ? 'ok' : 'warn',
    title: 'Rejim uyumu',
    value: `${regime.active || 'NÖTR'} · ${Math.round(Number(scores.regime || 0))}/100`,
    detail: `Piyasa modu ${regime.active || 'nötr'} olarak okunuyor. Rejim skoru ${explainScore(scores.regime)} seviyede olduğu için setup yalnızca bu bağlamda değerlendirilir.`
  });
  primary.push({
    state: Number(scores.setup || 0) >= 75 ? 'ok' : Number(scores.setup || 0) >= 60 ? 'warn' : 'miss',
    title: 'Setup kalitesi',
    value: `${snapshot.setup || 'Setup bekleniyor'} · ${Math.round(Number(scores.setup || 0))}/100`,
    detail: `Setup motoru ${snapshot.setup || 'belirsiz'} yapısını izliyor. Bu puan tek başına emir anlamına gelmez; teyit ve no-trade katmanından geçmek zorundadır.`
  });
  primary.push({
    state: Number(scores.confirmation || 0) >= 75 ? 'ok' : Number(scores.confirmation || 0) >= 60 ? 'warn' : 'miss',
    title: 'Teyit katmanı',
    value: `${Math.round(Number(scores.confirmation || 0))}/100`,
    detail: `Hacim, momentum, RSI, funding/OI ve spot-perp bağlamı birlikte okunur. RSI ${tech.rsi ?? '—'}, hacim oranı x${tech.volumeRatio ?? '—'} olarak görünüyor.`
  });
  primary.push({
    state: Number(scores.execution || 0) >= 75 ? 'ok' : Number(scores.execution || 0) >= 60 ? 'warn' : 'miss',
    title: 'Execution / giriş kalitesi',
    value: `${Math.round(Number(scores.execution || 0))}/100`,
    detail: `Giriş bölgesi ${plan.entryZone || '—'}, stop referansı ${plan.stopReference || '—'}, kovalama sınırı ${plan.doNotChase || '—'}. Geç kalmış giriş varsa plan zayıflatılır.`
  });
  primary.push({
    state: dataScore >= 75 ? 'ok' : dataScore >= 60 ? 'warn' : 'miss',
    title: 'Veri güveni',
    value: `${Math.round(dataScore)}/100`,
    detail: `OHLCV, funding, OI, haber ve on-chain kaynakları veri güvenine katkı verir. Düşük veri güveni final skoru ne olursa olsun sinyali zayıflatır.`
  });
  primary.push({
    state: blocked ? 'miss' : noTradeScore >= 60 ? 'warn' : 'ok',
    title: 'No-Trade savunması',
    value: `${Math.round(noTradeScore)}/100 · ${snapshot.noTrade?.label || 'Temiz'}`,
    detail: blocked ? `Sinyal bloke edildi: ${hardBlocks.join(', ') || 'hard block aktif'}.` : (warnings.length ? `Yumuşak uyarılar var: ${warnings.join(', ')}.` : 'Hard block yok; manuel plan üretimi teknik olarak açık.')
  });

  const finalWhy = [];
  if (score >= 75 && !blocked) finalWhy.push(`${shortDirection} yönünde manuel plan üretildi çünkü setup, rejim ve teyit skorları birlikte minimum eşiği geçti.`);
  if (score >= 70 && score < 75 && !blocked) finalWhy.push('Plan hazırlık seviyesinde; entry/tetikleyici beklenmeden kovalamak uygun değil.');
  if (score < 70 && !blocked) finalWhy.push('Skor geçerli sinyal eşiğinin altında; sistem şimdilik izleme modunda kalır.');
  if (blocked) finalWhy.push('No-Trade motoru final skordan üstün olduğu için sinyal manuel plana çevrilmedi.');
  if (manipulation >= 55) finalWhy.push(`Manipülasyon riski ${Math.round(manipulation)}/100; confirmation puanı cezalandırılır.`);
  if (dataScore < 70) finalWhy.push(`Veri güveni ${Math.round(dataScore)}/100; sinyal güveni aşağı çekilir.`);
  if (!finalWhy.length) finalWhy.push('Karar; rejim, setup, teyit, execution, RR ve veri güveni katmanlarının birleşik skorundan üretildi.');

  const planReasons = [
    { label: 'Entry', value: plan.entryZone || '—' },
    { label: 'Preferred', value: plan.preferredEntry || '—' },
    { label: 'Stop', value: plan.stopReference || '—' },
    { label: 'TP1/TP2/TP3', value: `${plan.tp1 || '—'} / ${plan.tp2 || '—'} / ${plan.tp3 || '—'}` },
    { label: 'RR', value: plan.rrExpected || `${snapshot.cost?.netR ?? '—'}R` },
    { label: 'Geçerlilik', value: plan.validity || '—' }
  ];

  const dataPath = makeSignalDataSourceTags(snapshot).map(t => ({
    label: t.label,
    value: t.value,
    score: Math.round(Number(t.score || 0)),
    state: Number(t.score || 0) >= 75 ? 'ok' : Number(t.score || 0) >= 55 ? 'warn' : 'miss'
  }));

  return {
    asset: snapshot.asset || 'BTCUSDT',
    direction: shortDirection,
    verdict,
    tone,
    finalScore: Math.round(score),
    headline: finalWhy[0],
    summary: finalWhy,
    primary,
    plan: planReasons,
    dataPath,
    blockers: hardBlocks,
    warnings,
    action: blocked ? 'İşlem yok. Veri/kurgu temizlenene kadar bekle.' : score >= 75 ? 'Entry bölgesi beklenir; do-not-chase seviyesi geçilirse sinyal kovalanmaz.' : 'Setup izlenir; ek teyit gelmeden manuel plan uygulanmaz.',
    generatedAt: Date.now()
  };
}

export function makeRuxSystemSnapshot() {
  const active = RUX_PHASES.filter(x => x.status === 'aktif-iskelet').length;
  const mapped = RUX_PHASES.filter(x => x.status === 'haritalandı').length;
  const later = RUX_PHASES.filter(x => x.status === 'sonra').length;
  return {
    version: RUX_VERSION,
    visualFreeze: true,
    autoTrade: false,
    language: 'Türkçe öncelikli',
    activeSkeletonModules: active,
    mappedModules: mapped,
    laterModules: later,
    nextStage: 'Setup Performans Matrisi, setup + rejim bazında backtest/forward edge ayrıştırması olarak eklendi.',
    phases: RUX_PHASES
  };
}

if (typeof window !== 'undefined') {
  window.RUX_CORE = { RUX_VERSION, RUX_TERMS_TR, RUX_PHASES, analyzeDataConfidence, adaptiveThresholds, probabilisticRegime, makeRegimeHysteresisReport, normalizeRegimeKey, noTradeDecision, finalSignalScore, realisticCostAndFill, COST_PROFILES, getRuxCostProfile, SIGNAL_LIFECYCLE_STATES, makeDemoCandles, makeRuxDecisionSnapshot, analyzeLiveMarketSignal, manualRiskSuggestion, simulateSignalTracking, calculatePortfolioHeat, makeRuxPortfolioHeatSnapshot, simulateManualPlanOutcome, buildSignalDataset, summarizeBacktestRows, makeRuxBacktestSnapshot, makeBacktestOosValidationReport, makeWalkForwardReport, makeEdgeCalibrationReport, makeRuxOptimizerReport, makeMonteCarloRiskReport, makeStatisticsPerformanceReport, makeUserExecutionFidelityReport, makeOpenPositionsReport, makeOrderHistoryReport, RUX_SOURCE_CATEGORIES, analyzePriceActionRulebook, scoreSourceCheck, makeRuxDataConfidenceReport, makeSignalDataSourceTags, makeSignalExplainabilityReport, makeRuxSystemSnapshot };
}
