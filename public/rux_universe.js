/* RUx — Asset Universe Manager (Sprint 3, A13)
   Coin'leri 3 kovaya ayırır: TRADEABLE / RESEARCH / EXCLUDED.
   Rehber §7 "Asset Eligibility": düşük hacim + geniş spread + yeni listeleme
   coinleri için sinyal güveni otomatik düşürülmeli veya hariç tutulmalı.

   Sınıflandırma kriterleri (ücretsiz veriden):
   - 24s hacim (USD)
   - spread (bps) — likidite ölçümünden
   - listeleme yaşı / borsa yaygınlığı (opsiyonel, varsa)
*/

const TRADEABLE_MIN_VOL_USD = 50_000_000;   // 50M$ üzeri → likit
const RESEARCH_MIN_VOL_USD = 5_000_000;     // 5M-50M arası → araştırma
const MAX_SPREAD_BPS_TRADEABLE = 12;
const MAX_SPREAD_BPS_RESEARCH = 35;

// Çekirdek major'lar her zaman tradeable (referans likidite)
const CORE_MAJORS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

function n(v, d = null) { const x = Number(v); return Number.isFinite(x) ? x : d; }

// Tek bir coin'i sınıflandırır.
export function classifyAsset({ symbol, volumeUsd = null, spreadBps = null, depthUsd = null, listingAgeDays = null } = {}) {
  const sym = String(symbol || '').toUpperCase();
  const vol = n(volumeUsd);
  const spread = n(spreadBps);
  const depth = n(depthUsd);

  const reasons = [];

  // Core major'lar → her zaman tradeable
  if (CORE_MAJORS.includes(sym)) {
    return { symbol: sym, bucket: 'TRADEABLE', tier: 'CORE', score: 100, reasons: ['Çekirdek major'], confidenceMultiplier: 1.0 };
  }

  // Yeni listeleme riski (< 30 gün)
  const isNew = Number.isFinite(listingAgeDays) && listingAgeDays < 30;
  if (isNew) reasons.push(`Yeni listeleme (${listingAgeDays}g)`);

  // Hacim değerlendirmesi
  let volBucket = 'UNKNOWN';
  if (vol !== null) {
    if (vol >= TRADEABLE_MIN_VOL_USD) volBucket = 'HIGH';
    else if (vol >= RESEARCH_MIN_VOL_USD) volBucket = 'MID';
    else volBucket = 'LOW';
    reasons.push(`Hacim ${formatUsd(vol)}`);
  }

  // Spread değerlendirmesi
  let spreadOk = true, spreadResearch = true;
  if (spread !== null) {
    spreadOk = spread <= MAX_SPREAD_BPS_TRADEABLE;
    spreadResearch = spread <= MAX_SPREAD_BPS_RESEARCH;
    reasons.push(`Spread ${spread}bps`);
  }

  // Karar mantığı
  let bucket, score, confidenceMultiplier;
  if (volBucket === 'LOW' || (spread !== null && !spreadResearch)) {
    bucket = 'EXCLUDED';
    score = 25;
    confidenceMultiplier = 0.0; // sinyal üretme
    reasons.push('Düşük likidite / geniş spread');
  } else if (volBucket === 'HIGH' && spreadOk && !isNew) {
    bucket = 'TRADEABLE';
    score = 88;
    confidenceMultiplier = 1.0;
  } else if (volBucket === 'MID' || isNew || (spread !== null && !spreadOk && spreadResearch)) {
    bucket = 'RESEARCH';
    score = 58;
    confidenceMultiplier = 0.6; // sinyal güveni düşürülür
    reasons.push('Araştırma kovası: güven azaltıldı');
  } else if (volBucket === 'UNKNOWN' && spread === null) {
    // Hiç veri yok → temkinli research
    bucket = 'RESEARCH';
    score = 50;
    confidenceMultiplier = 0.7;
    reasons.push('Veri yok; temkinli');
  } else {
    bucket = 'TRADEABLE';
    score = 75;
    confidenceMultiplier = 0.9;
  }

  return { symbol: sym, bucket, tier: volBucket, score, reasons, confidenceMultiplier };
}

// Bir liste için toplu sınıflandırma.
export function classifyUniverse(rows = []) {
  const out = (Array.isArray(rows) ? rows : []).map(classifyAsset);
  const buckets = { TRADEABLE: [], RESEARCH: [], EXCLUDED: [] };
  out.forEach(a => { (buckets[a.bucket] || buckets.RESEARCH).push(a); });
  return {
    assets: out,
    buckets,
    summary: {
      tradeable: buckets.TRADEABLE.length,
      research: buckets.RESEARCH.length,
      excluded: buckets.EXCLUDED.length,
      total: out.length,
    }
  };
}

// Sinyal güven çarpanını sembol için döndürür (sinyal motoru opsiyonel kullanabilir).
export function assetConfidenceMultiplier(symbol, universeMap = null) {
  const sym = String(symbol || '').toUpperCase();
  if (CORE_MAJORS.includes(sym)) return 1.0;
  if (universeMap && universeMap[sym]) return universeMap[sym].confidenceMultiplier ?? 0.7;
  return 0.85; // bilinmiyorsa hafif temkinli
}

function formatUsd(v) {
  if (v == null) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B$';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M$';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K$';
  return v.toFixed(0) + '$';
}

export const ASSET_UNIVERSE_THRESHOLDS = {
  TRADEABLE_MIN_VOL_USD, RESEARCH_MIN_VOL_USD,
  MAX_SPREAD_BPS_TRADEABLE, MAX_SPREAD_BPS_RESEARCH, CORE_MAJORS
};
