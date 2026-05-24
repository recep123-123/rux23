/* RUx — Kalıcı Veri Katmanı (Sprint 2, A08)
   IndexedDB üzerinde signals / outcomes / audit tabloları.
   Amaç: üretilen her sinyali ve sonraki sonucunu KALICI olarak saklayıp
   gerçek out-of-sample (OOS) veri toplamak. localStorage'ın ~5MB sınırı
   ve senkron doğası yerine IndexedDB (~50MB+, async) kullanılır.

   Tasarım ilkeleri:
   - Tarayıcı yoksa / IndexedDB engelliyse sessizce localStorage'a düşer (degrade).
   - Tüm yazma işlemleri kuyruğa alınır ve toplu flush edilir (UI'ı bloklamaz).
   - Hiçbir şey atılmaz; sadece kayıt limiti (maxRows) aşılırsa en eski budanır.
*/

const DB_NAME = 'rux_terminal_db';
const DB_VERSION = 1;
const STORE_SIGNALS = 'signals';
const STORE_OUTCOMES = 'outcomes';
const STORE_AUDIT = 'audit';

const MAX_SIGNALS = 5000;
const MAX_OUTCOMES = 5000;
const MAX_AUDIT = 2000;

let _dbPromise = null;
let _idbAvailable = (typeof indexedDB !== 'undefined');

// ---- localStorage degrade yedeği (IndexedDB yoksa) ----
const LS_SIGNALS = 'rux.signals.v1';
const LS_OUTCOMES = 'rux.outcomes.v1';
const LS_AUDIT = 'rux.audit.v1';

function _lsRead(key, fallback = []) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function _lsWrite(key, rows) {
  try { localStorage.setItem(key, JSON.stringify(rows)); return true; } catch { return false; }
}

function openDb() {
  if (!_idbAvailable) return Promise.reject(new Error('IndexedDB yok'));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { _idbAvailable = false; return reject(e); }
    req.onupgradeneeded = (ev) => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(STORE_SIGNALS)) {
        const s = db.createObjectStore(STORE_SIGNALS, { keyPath: 'id' });
        s.createIndex('by_time', 'time', { unique: false });
        s.createIndex('by_symbol', 'symbol', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_OUTCOMES)) {
        const o = db.createObjectStore(STORE_OUTCOMES, { keyPath: 'signalId' });
        o.createIndex('by_time', 'fillTime', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIT)) {
        const a = db.createObjectStore(STORE_AUDIT, { keyPath: 'id', autoIncrement: true });
        a.createIndex('by_time', 'time', { unique: false });
      }
    };
    req.onsuccess = (ev) => resolve(ev.target.result);
    req.onerror = () => { _idbAvailable = false; reject(req.error || new Error('IndexedDB açılamadı')); };
  });
  return _dbPromise;
}

function _tx(db, store, mode = 'readonly') {
  return db.transaction(store, mode).objectStore(store);
}

function _reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---- Yazma kuyruğu (UI'ı bloklamadan toplu flush) ----
const _queue = { signals: [], outcomes: [], audit: [] };
let _flushTimer = null;

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; flushQueue(); }, 1200);
}

export async function flushQueue() {
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  const pending = {
    signals: _queue.signals.splice(0),
    outcomes: _queue.outcomes.splice(0),
    audit: _queue.audit.splice(0),
  };
  if (!pending.signals.length && !pending.outcomes.length && !pending.audit.length) return { ok: true, written: 0 };

  if (!_idbAvailable) {
    // localStorage degrade
    if (pending.signals.length) {
      const cur = _lsRead(LS_SIGNALS);
      // id bazlı dedup (IndexedDB put davranışıyla aynı): yeni gelen eskiyi günceller
      const map = new Map(cur.map(r => [r.id, r]));
      pending.signals.forEach(r => map.set(r.id, r));
      _lsWrite(LS_SIGNALS, Array.from(map.values()).slice(0, MAX_SIGNALS));
    }
    if (pending.outcomes.length) {
      const cur = _lsRead(LS_OUTCOMES);
      const map = new Map(cur.map(r => [r.signalId, r]));
      pending.outcomes.forEach(r => map.set(r.signalId, r));
      _lsWrite(LS_OUTCOMES, Array.from(map.values()).slice(0, MAX_OUTCOMES));
    }
    if (pending.audit.length) {
      const cur = _lsRead(LS_AUDIT);
      _lsWrite(LS_AUDIT, [...pending.audit, ...cur].slice(0, MAX_AUDIT));
    }
    return { ok: true, written: pending.signals.length + pending.outcomes.length + pending.audit.length, mode: 'localStorage' };
  }

  try {
    const db = await openDb();
    await Promise.all([
      _writeAll(db, STORE_SIGNALS, pending.signals),
      _writeAll(db, STORE_OUTCOMES, pending.outcomes),
      _writeAll(db, STORE_AUDIT, pending.audit),
    ]);
    // budama
    await _pruneStore(db, STORE_SIGNALS, MAX_SIGNALS);
    await _pruneStore(db, STORE_OUTCOMES, MAX_OUTCOMES);
    await _pruneStore(db, STORE_AUDIT, MAX_AUDIT);
    return { ok: true, written: pending.signals.length + pending.outcomes.length + pending.audit.length, mode: 'indexeddb' };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

function _writeAll(db, store, rows) {
  if (!rows.length) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    rows.forEach(r => { try { os.put(r); } catch {} });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _pruneStore(db, store, maxRows) {
  try {
    const os = _tx(db, store, 'readonly');
    const count = await _reqToPromise(os.count());
    if (count <= maxRows) return;
    const toDelete = count - maxRows;
    // en eski kayıtları sil (by_time index'i varsa kullan)
    const rw = db.transaction(store, 'readwrite').objectStore(store);
    let idx = null;
    try { idx = rw.index('by_time'); } catch {}
    const cursorReq = (idx || rw).openCursor();
    let deleted = 0;
    await new Promise((resolve) => {
      cursorReq.onsuccess = (ev) => {
        const cur = ev.target.result;
        if (cur && deleted < toDelete) { cur.delete(); deleted++; cur.continue(); }
        else resolve();
      };
      cursorReq.onerror = () => resolve();
    });
  } catch {}
}

// ======================= PUBLIC API =======================

// Sinyal kaydet (kuyruğa al). Aynı id tekrar gelirse put ile güncellenir.
export function recordSignal(signal = {}) {
  if (!signal || !signal.id) return false;
  _queue.signals.push(_compactSignal(signal));
  scheduleFlush();
  return true;
}

// Outcome kaydet/güncelle (signalId anahtar).
export function recordOutcome(outcome = {}) {
  if (!outcome || !outcome.signalId) return false;
  _queue.outcomes.push({ ...outcome, updatedAt: Date.now() });
  scheduleFlush();
  return true;
}

// Audit log (hata / olay kaydı).
export function recordAudit(entry = {}) {
  _queue.audit.push({ time: Date.now(), ...entry });
  scheduleFlush();
  return true;
}

// Sinyal nesnesini kompakt sakla (gereksiz büyük alt ağaçları atma).
function _compactSignal(sig = {}) {
  return {
    id: sig.id,
    time: sig.time || Date.now(),
    symbol: sig.asset || sig.symbol || 'BTCUSDT',
    tf: sig.timeframe || sig.tf || '4h',
    direction: sig.direction || '',
    setup: sig.setup || '',
    setupFamily: sig.setupDetails?.family || null,
    regime: sig.regime?.active || sig.regime || '',
    finalScore: Number(sig.final?.score ?? sig.finalScore ?? 0),
    finalLabel: sig.final?.label || '',
    scores: sig.scores || {},
    dataConfidence: Number(sig.data?.score ?? 0),
    dataMeasured: sig.data?.measured || null,
    cvd: sig.cvd ? { bias: sig.cvd.bias, divergence: sig.cvd.divergence, score: sig.cvd.score } : null,
    manualPlan: sig.manualPlan ? {
      preferredEntry: sig.manualPlan.preferredEntry,
      stopReference: sig.manualPlan.stopReference,
      tp1: sig.manualPlan.tp1, tp2: sig.manualPlan.tp2, tp3: sig.manualPlan.tp3,
      rrExpected: sig.manualPlan.rrExpected, planType: sig.manualPlan.planType,
    } : null,
    noTradeBlocked: !!sig.noTrade?.blocked,
    price: Number(sig.price ?? 0),
    source: sig.source || '',
  };
}

// Tüm sinyalleri oku (en yeni önce).
export async function loadSignals({ limit = 500, symbol = null } = {}) {
  if (!_idbAvailable) {
    let rows = _lsRead(LS_SIGNALS).sort((a, b) => Number(b.time) - Number(a.time));
    if (symbol) rows = rows.filter(r => r.symbol === symbol);
    return rows.slice(0, limit);
  }
  try {
    const db = await openDb();
    const os = _tx(db, STORE_SIGNALS);
    const all = await _reqToPromise(os.getAll());
    let rows = (all || []).sort((a, b) => Number(b.time) - Number(a.time));
    if (symbol) rows = rows.filter(r => r.symbol === symbol);
    return rows.slice(0, limit);
  } catch { return []; }
}

export async function loadOutcomes({ limit = 500 } = {}) {
  if (!_idbAvailable) return _lsRead(LS_OUTCOMES).slice(0, limit);
  try {
    const db = await openDb();
    const os = _tx(db, STORE_OUTCOMES);
    const all = await _reqToPromise(os.getAll());
    return (all || []).sort((a, b) => Number(b.fillTime || 0) - Number(a.fillTime || 0)).slice(0, limit);
  } catch { return []; }
}

export async function loadAudit({ limit = 100 } = {}) {
  if (!_idbAvailable) return _lsRead(LS_AUDIT).slice(0, limit);
  try {
    const db = await openDb();
    const os = _tx(db, STORE_AUDIT);
    const all = await _reqToPromise(os.getAll());
    return (all || []).sort((a, b) => Number(b.time) - Number(a.time)).slice(0, limit);
  } catch { return []; }
}

// Sinyal + outcome birleşik (gerçek OOS dataseti için).
export async function loadJoinedHistory({ limit = 500 } = {}) {
  const [signals, outcomes] = await Promise.all([loadSignals({ limit }), loadOutcomes({ limit })]);
  const oMap = new Map(outcomes.map(o => [o.signalId, o]));
  return signals.map(s => ({ ...s, outcome: oMap.get(s.id) || null }));
}

// ===========================================================================
// SETUP-BAZLI PERFORMANS (#2) — Her setup ailesinin GERÇEK geçmiş performansı.
// Joined history'den çözülmüş (outcome'u olan) sinyalleri setup ailesine göre
// gruplar; win-rate, ortalama net-R, profit factor, beklenen değer (EV) hesaplar.
// "Hangi setup gerçekten para kazandırıyor?" sorusunu ampirik olarak yanıtlar.
// ===========================================================================
function _aggregateOutcomes(items) {
  // items: [{ outcome: {netR, status, filled}, finalScore, ... }]
  const filled = items.filter(x => x.outcome && x.outcome.filled);
  const n = filled.length;
  if (!n) return { samples: items.length, resolved: 0, winRate: null, avgNetR: null, profitFactor: null, expectancy: null, wins: 0, losses: 0 };
  const rs = filled.map(x => Number(x.outcome.netR) || 0);
  const wins = rs.filter(r => r > 0);
  const losses = rs.filter(r => r <= 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const avgNetR = rs.reduce((a, b) => a + b, 0) / n;
  const winRate = wins.length / n;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  // Beklenen değer (R cinsinden): winRate*avgWin - (1-winRate)*avgLoss
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  // Maksimum drawdown (R cinsinden): kümülatif R eğrisinin en derin düşüşü.
  let cum = 0, peak = 0, maxDD = 0;
  for (const r of rs) { cum += r; if (cum > peak) peak = cum; const dd = peak - cum; if (dd > maxDD) maxDD = dd; }
  // Tutarlılık (Sharpe-benzeri): ortalama R / R standart sapması.
  const mean = avgNetR;
  const variance = rs.reduce((a, r) => a + (r - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const consistency = std > 0 ? mean / std : (mean > 0 ? 2 : 0);
  return {
    samples: items.length, resolved: n,
    winRate: Math.round(winRate * 1000) / 10,           // %
    avgNetR: Math.round(avgNetR * 1000) / 1000,
    profitFactor: profitFactor === Infinity ? 999 : Math.round(profitFactor * 100) / 100,
    expectancy: Math.round(expectancy * 1000) / 1000,    // R/işlem
    wins: wins.length, losses: losses.length,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    maxDrawdownR: Math.round(maxDD * 100) / 100,
    consistency: Math.round(consistency * 100) / 100,    // Sharpe-benzeri
    totalR: Math.round(cum * 100) / 100,
  };
}

export async function setupPerformance({ limit = 2000, minSamples = 1 } = {}) {
  const joined = await loadJoinedHistory({ limit });
  const resolved = joined.filter(x => x.outcome);
  const byFamily = {};
  resolved.forEach(x => {
    const fam = x.setupFamily || x.setup || 'Bilinmeyen';
    (byFamily[fam] = byFamily[fam] || []).push(x);
  });
  const families = Object.entries(byFamily)
    .map(([family, items]) => ({ family, ...(_aggregateOutcomes(items)) }))
    .filter(f => f.samples >= minSamples)
    .sort((a, b) => (b.expectancy ?? -99) - (a.expectancy ?? -99));
  const overall = _aggregateOutcomes(resolved);
  return { overall, families, totalResolved: resolved.length };
}

// ===========================================================================
// CANLI/OOS EDGE KANIT KATMANI (#3) — "deployment approval"
// Bir setup ailesinin (veya tüm sistemin) gerçek geçmiş kanıtını SERT kriterlerle
// değerlendirir ve dürüstçe raporlar: edge kanıtlandı mı, yoksa daha veri mi lazım?
// Bu, edge ÜRETMEZ; sadece biriken GERÇEK veriyi ölçer. Kanıt yoksa "deploy etme" der.
//
// Kademeler (örneklem + kalite birlikte):
//   < 30 örneklem            → KANIT_YOK (istatistiksel anlamlılık yok)
//   30-99 + pozitif beklenti → ÖN_KANIT (izleme, henüz dağıtma)
//   100+ + tüm eşikler geçer → KANITLANDI (dağıtım adayı)
//   herhangi bir negatif EV  → REDDEDİLDİ (kaybeden setup)
// ===========================================================================
export async function deploymentApproval(setupFamily = null, { limit = 5000, minExpectancy = 0.05, minProfitFactor = 1.2, maxDrawdownR = null } = {}) {
  const { overall, families } = await setupPerformance({ limit });
  const target = setupFamily
    ? (families.find(f => f.family === setupFamily) || { family: setupFamily, resolved: 0 })
    : { family: 'TÜM SİSTEM', ...overall };

  const n = target.resolved || 0;
  const ev = target.expectancy;
  const pf = target.profitFactor;
  const dd = target.maxDrawdownR;
  // Drawdown eşiği örneklem sayısıyla ölçeklenir: pozitif EV'li bir sistemde bile
  // doğal dalgalanma vardır. Tavan: beklenen toplam getirinin makul bir oranı + taban.
  const ddLimit = maxDrawdownR != null ? maxDrawdownR : Math.max(6, Math.ceil(n * 0.12));
  const checks = [];
  const fail = [];
  const c = (pass, label) => { checks.push({ pass, label }); if (!pass) fail.push(label); return pass; };

  let status, statusLabel, deployable = false, color;

  if (n < 30) {
    status = 'KANIT_YOK';
    statusLabel = 'EDGE KANITLANMADI — yetersiz örneklem';
    color = 'gray';
  } else {
    c(ev != null && ev >= minExpectancy, `Beklenen değer ≥ +${minExpectancy}R (gerçek: ${ev != null ? (ev >= 0 ? '+' : '') + ev + 'R' : '—'})`);
    c(pf != null && pf >= minProfitFactor, `Profit factor ≥ ${minProfitFactor} (gerçek: ${pf ?? '—'})`);
    c(dd == null || dd <= ddLimit, `Maks drawdown ≤ ${ddLimit}R (gerçek: ${dd ?? '—'}R)`);
    c(target.winRate != null && target.winRate >= 35, `Win-rate ≥ %35 (gerçek: %${target.winRate ?? '—'})`);

    const allPass = fail.length === 0;
    const negativeEdge = ev != null && ev < 0;

    if (negativeEdge) {
      status = 'REDDEDİLDİ';
      statusLabel = 'EDGE NEGATİF — bu setup gerçek geçmişte kaybettiriyor';
      color = 'red';
    } else if (n >= 100 && allPass) {
      status = 'KANITLANDI';
      statusLabel = 'EDGE KANITLANDI — dağıtım adayı (yine de risk yönetimiyle)';
      deployable = true;
      color = 'green';
    } else if (n >= 30 && ev != null && ev > 0) {
      status = 'ON_KANIT';
      statusLabel = `ÖN KANIT — pozitif eğilim ama yetersiz (${n}/100 örneklem${fail.length ? ', + kriter eksiği' : ''})`;
      color = 'yellow';
    } else {
      status = 'BELIRSIZ';
      statusLabel = 'BELİRSİZ — kriterler karşılanmadı, dağıtma';
      color = 'yellow';
    }
  }

  return {
    family: target.family,
    status, statusLabel, deployable, color,
    samples: n,
    samplesNeeded: Math.max(0, 100 - n),
    metrics: {
      expectancy: ev ?? null, profitFactor: pf ?? null,
      winRate: target.winRate ?? null, maxDrawdownR: dd ?? null,
      consistency: target.consistency ?? null, totalR: target.totalR ?? null,
    },
    checks, failedChecks: fail,
    thresholds: { minExpectancy, minProfitFactor, maxDrawdownR: ddLimit, minSamplesForProof: 100 },
    honestNote: n < 30
      ? `Sistem ${n} çözülmüş örnek topladı. İstatistiksel anlamlı edge kanıtı için en az 30 (tercihen 100+) gerçek/OOS örnek gerekir. Uygulamayı düzenli çalıştırdıkça bu sayı artar. O zamana kadar hiçbir setup "kanıtlanmış edge" sayılmaz.`
      : status === 'KANITLANDI'
        ? `${n} örnekle tüm sert kriterler geçildi. Bu, geçmiş performansın pozitif olduğunu gösterir; gelecek getiri garantisi DEĞİLDİR. Risk yönetimi şart.`
        : `${n} örnek mevcut. ${fail.length ? 'Karşılanmayan kriter: ' + fail.join('; ') + '. ' : ''}Kanıt için ${Math.max(0, 100 - n)} örnek daha ve tüm kriterlerin geçmesi gerekir.`,
  };
}

// Tüm setup aileleri için toplu deployment durumu (özet panel için).
export async function deploymentReport({ limit = 5000 } = {}) {
  const { families, totalResolved } = await setupPerformance({ limit });
  const system = await deploymentApproval(null, { limit });
  const perFamily = [];
  for (const f of families) {
    perFamily.push(await deploymentApproval(f.family, { limit }));
  }
  return { system, families: perFamily, totalResolved };
}

// Bir setup ailesi için gerçek örneklem sayısı + güvenilirlik çarpanı.
// unifiedConfidence'a beslenmek üzere (#1). Yetersiz örneklemde nötr (1.0) döner.
export async function setupReliability(setupFamily, { limit = 2000 } = {}) {
  if (!setupFamily) return { sampleSize: 0, winRate: null, expectancy: null, reliabilityMultiplier: 1.0, basis: 'teori' };
  const { families } = await setupPerformance({ limit });
  const f = families.find(x => x.family === setupFamily);
  if (!f || !f.resolved) return { sampleSize: 0, winRate: null, expectancy: null, reliabilityMultiplier: 1.0, basis: 'teori (geçmiş yok)', tier: 'teori' };
  // Güvenilirlik çarpanı + örneklem kademesi (v0.72.x — profesyonel eşikler).
  // 0-19 teorik/kullanılmaz (çarpan nötr 1.0), 20-49 izleme (hafif),
  // 50-99 ön kalibrasyon (orta), 100+ kullanılabilir, 250+ güçlü.
  // Düşük örneklemde overfit/erken iyimserlikten kaçınmak için çarpan etkisi
  // örneklem büyüdükçe kademeli açılır.
  const n = f.resolved;
  let tier, maxEffect;
  if (n < 20) { tier = 'teorik (yetersiz örneklem)'; maxEffect = 0.0; }
  else if (n < 50) { tier = 'izleme'; maxEffect = 0.05; }
  else if (n < 100) { tier = 'ön kalibrasyon'; maxEffect = 0.10; }
  else if (n < 250) { tier = 'kullanılabilir'; maxEffect = 0.16; }
  else if (n < 500) { tier = 'güçlü'; maxEffect = 0.22; }
  else { tier = 'profesyonel edge adayı'; maxEffect = 0.28; }

  // Beklenti yönüne göre çarpan; etki büyüklüğü örneklem kademesiyle sınırlı.
  let mult = 1.0;
  if (maxEffect > 0 && f.expectancy != null) {
    if (f.expectancy > 0.15) mult = 1 + maxEffect;
    else if (f.expectancy > 0.02) mult = 1 + maxEffect * 0.5;
    else if (f.expectancy > -0.02) mult = 1.0;
    else if (f.expectancy > -0.15) mult = 1 - maxEffect * 0.6;
    else mult = 1 - maxEffect;
  }
  mult = Math.round(mult * 1000) / 1000;
  return {
    sampleSize: n, winRate: f.winRate, expectancy: f.expectancy,
    profitFactor: f.profitFactor, maxDrawdownR: f.maxDrawdownR ?? null,
    reliabilityMultiplier: mult, basis: tier, tier,
    usableForLiveSignal: n >= 100,
  };
}

// İstatistik: kaç sinyal, kaç outcome, kapsama oranı.
export async function storageStats() {
  const [signals, outcomes, audit] = await Promise.all([
    loadSignals({ limit: MAX_SIGNALS }),
    loadOutcomes({ limit: MAX_OUTCOMES }),
    loadAudit({ limit: MAX_AUDIT }),
  ]);
  const resolved = signals.filter(s => outcomes.some(o => o.signalId === s.id)).length;
  return {
    mode: _idbAvailable ? 'indexeddb' : 'localStorage',
    signals: signals.length,
    outcomes: outcomes.length,
    audit: audit.length,
    coveragePct: signals.length ? Math.round((resolved / signals.length) * 100) : 0,
    oldest: signals.length ? new Date(Math.min(...signals.map(s => Number(s.time)))).toISOString() : null,
    newest: signals.length ? new Date(Math.max(...signals.map(s => Number(s.time)))).toISOString() : null,
  };
}

export async function clearAllStorage() {
  // Bekleyen kuyruğu ve zamanlayıcıyı da temizle (deterministik davranış)
  if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
  _queue.signals.length = 0; _queue.outcomes.length = 0; _queue.audit.length = 0;
  if (!_idbAvailable) { _lsWrite(LS_SIGNALS, []); _lsWrite(LS_OUTCOMES, []); _lsWrite(LS_AUDIT, []); return true; }
  try {
    const db = await openDb();
    await Promise.all([STORE_SIGNALS, STORE_OUTCOMES, STORE_AUDIT].map(store => new Promise((resolve) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    })));
    return true;
  } catch { return false; }
}

export function isPersistenceAvailable() { return _idbAvailable; }
export const RUX_STORAGE_KEYS = { STORE_SIGNALS, STORE_OUTCOMES, STORE_AUDIT };

// ===========================================================================
// A20 — GOVERNANCE / KURAL SÜRÜMLEME
// Aktif kural setlerinin hash + tarih ile sürümlenmesi. "Hangi kural ne zaman
// üretti" izlenebilirliği. localStorage'da saklanır (küçük, senkron yeterli).
// ===========================================================================
const RULESET_STORE_KEY = 'rux.rulesetVersions.v1';

// Basit deterministik hash (kural seti içeriğinden kimlik üretir).
function _stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(_stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _stableStringify(obj[k])).join(',') + '}';
}
function _hashRuleset(obj) {
  const str = _stableStringify(obj || {});
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return 'rs_' + (h >>> 0).toString(16).padStart(8, '0');
}

function _loadRulesetStore() {
  try { if (typeof localStorage === 'undefined') return []; const raw = localStorage.getItem(RULESET_STORE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function _saveRulesetStore(rows) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(RULESET_STORE_KEY, JSON.stringify(rows.slice(0, 50))); } catch {}
}

// Bir kural setini sürümle (aynı içerik tekrar gelirse yeni sürüm açmaz).
export function versionRuleset(ruleset = {}, { activatedBy = 'system', note = '' } = {}) {
  const hash = _hashRuleset(ruleset);
  const store = _loadRulesetStore();
  const existing = store.find(r => r.hash === hash);
  if (existing) {
    existing.lastSeenAt = Date.now();
    _saveRulesetStore(store);
    return { hash, version: existing.version, isNew: false, activatedAt: existing.activatedAt };
  }
  const version = `v${store.length + 1}.${String(Date.now()).slice(-5)}`;
  const entry = {
    hash, version, activatedAt: Date.now(), lastSeenAt: Date.now(),
    activatedBy, note,
    snapshot: { name: ruleset.name || null, setup: ruleset.setup || null, regime: ruleset.regime || null, thresholds: ruleset.thresholds || null, weights: ruleset.weights || null }
  };
  store.unshift(entry);
  _saveRulesetStore(store);
  recordAudit({ type: 'ruleset_versioned', hash, version, activatedBy, note });
  return { hash, version, isNew: true, activatedAt: entry.activatedAt };
}

export function loadRulesetVersions() { return _loadRulesetStore(); }

export function activeRulesetVersion() {
  const store = _loadRulesetStore();
  return store.length ? store[0] : null;
}

// ===========================================================================
// A19 — HATA BİLDİRİM KANALI
// window.error + unhandledrejection dinleyip audit tablosuna yazar.
// SİSTEM sayfasında "son N hata" görüntülenebilir. Sıfır maliyet, anında değer.
// ===========================================================================
let _errorHandlerInstalled = false;
export function installErrorReporter() {
  if (_errorHandlerInstalled || typeof window === 'undefined') return false;
  _errorHandlerInstalled = true;
  window.addEventListener('error', (ev) => {
    recordAudit({ type: 'js_error', message: String(ev?.message || 'bilinmeyen hata'), source: ev?.filename || '', line: ev?.lineno || 0, col: ev?.colno || 0 });
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason = ev?.reason;
    recordAudit({ type: 'unhandled_rejection', message: String(reason?.message || reason || 'promise reddi') });
  });
  return true;
}

// Son hataları getir (SİSTEM sayfası için).
export async function loadRecentErrors({ limit = 50 } = {}) {
  const audit = await loadAudit({ limit: 500 });
  return audit.filter(a => a.type === 'js_error' || a.type === 'unhandled_rejection' || /error|hata|fail/i.test(String(a.type))).slice(0, limit);
}

// ===========================================================================
// A09 — OUTCOME RESOLUTION KÖPRÜSÜ
// Bir sembol/tf için güncel mumlar geldiğinde, o sembolün henüz çözülmemiş
// (outcome'u olmayan) ve yeterince eskimiş sinyallerini bulup gerçek sonucu
// hesaplar. simulateFn = rux_core.simulateManualPlanOutcome enjekte edilir
// (modüller arası döngüsel bağımlılığı önlemek için).
// ===========================================================================
export async function resolvePendingOutcomes({ symbol, tf = '4h', candles = [], simulateFn = null, minBarsAfter = 8, maxBars = 48 } = {}) {
  if (!symbol || !Array.isArray(candles) || candles.length < 10 || typeof simulateFn !== 'function') {
    return { resolved: 0 };
  }
  const signals = await loadSignals({ limit: 1000, symbol });
  const outcomes = await loadOutcomes({ limit: 2000 });
  const resolvedIds = new Set(outcomes.map(o => o.signalId));
  let resolved = 0;

  for (const sig of signals) {
    if (resolvedIds.has(sig.id)) continue;
    const sigTime = Number(sig.time);
    if (!Number.isFinite(sigTime)) continue;
    // Sinyal mumundan SONRAKİ mumları al
    const future = candles.filter(c => Number(c.time) > sigTime);
    if (future.length < minBarsAfter) continue; // henüz olgunlaşmadı

    // simulateManualPlanOutcome snapshot şeklini bekler
    const snapshot = {
      direction: sig.direction,
      final: { score: sig.finalScore },
      noTrade: { blocked: sig.noTradeBlocked },
      manualPlan: {
        entryZone: sig.manualPlan?.preferredEntry ? `${sig.manualPlan.preferredEntry} - ${sig.manualPlan.preferredEntry}` : '',
        preferredEntry: sig.manualPlan?.preferredEntry,
        stopReference: sig.manualPlan?.stopReference,
        tp1: sig.manualPlan?.tp1, tp2: sig.manualPlan?.tp2, tp3: sig.manualPlan?.tp3,
      },
      price: sig.price,
    };
    let outcome;
    try { outcome = simulateFn(snapshot, future.slice(0, maxBars), { fillModel: 'realistic', maxBars }); }
    catch { continue; }
    if (!outcome) continue;
    recordOutcome({
      signalId: sig.id,
      symbol: sig.symbol,
      tf: sig.tf,
      setupFamily: sig.setupFamily,
      regime: sig.regime,
      finalScore: sig.finalScore,
      fillTime: Number(future[0]?.time) || Date.now(),
      exitTime: Number(future[Math.min(future.length - 1, maxBars - 1)]?.time) || Date.now(),
      status: outcome.status,
      filled: !!outcome.filled,
      grossR: Number(outcome.grossR || 0),
      netR: Number(outcome.netR || 0),
      mfeR: Number(outcome.mfeR || 0),
      maeR: Number(outcome.maeR || 0),
      barsHeld: Number(outcome.barsHeld || 0),
    });
    resolved++;
    resolvedIds.add(sig.id);
  }
  if (resolved) await flushQueue();
  return { resolved };
}
