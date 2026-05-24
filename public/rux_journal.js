/* RUx — Sinyal Günlüğü ortak veri katmanı */
const JOURNAL_KEY = 'rux.signalJournal.v1';

function safeParseJson(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}
function asNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function readLocalStorage(key, fallback = null) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch { return fallback; }
}
function writeLocalStorage(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch { return false; }
}

export function loadSignalJournal() {
  const rows = safeParseJson(readLocalStorage(JOURNAL_KEY, '[]'), []);
  return Array.isArray(rows) ? rows : [];
}

export function saveSignalJournal(rows = []) {
  return writeLocalStorage(JOURNAL_KEY, JSON.stringify((Array.isArray(rows) ? rows : []).slice(0, 300)));
}

export function clearSignalJournal() {
  return saveSignalJournal([]);
}

function _hasNumericNetR(row = {}) {
  return row.netR !== null && row.netR !== undefined && row.netR !== '' && Number.isFinite(Number(row.netR));
}

export function parseJournalR(row = {}) {
  if (_hasNumericNetR(row)) return Number(row.netR);
  if (Number.isFinite(Number(row.finalR))) return Number(row.finalR);
  const txt = String(row.finalR || '').replace('R', '').replace('+', '').replace(',', '.').trim();
  const n = Number(txt);
  return Number.isFinite(n) ? n : 0;
}

export function summarizeSignalJournal(rows = loadSignalJournal()) {
  const list = Array.isArray(rows) ? rows : [];
  const realized = list.filter(r => _hasNumericNetR(r) || /^[-+]?\d/.test(String(r.finalR || '')));
  const netR = realized.reduce((s, r) => s + parseJournalR(r), 0);
  const wins = realized.filter(r => parseJournalR(r) > 0).length;
  const losses = realized.filter(r => parseJournalR(r) < 0).length;
  const flat = Math.max(0, realized.length - wins - losses);
  const active = list.filter(r => !/TP|STOP|ENGEL|INVALID|EXPIRED/i.test(String(r.stateLabel || r.state || ''))).length;
  const strategyOk = list.filter(r => String(r.strategyLabel || '').toUpperCase().includes('UYGUN')).length;
  const tp = list.filter(r => /TP/i.test(String(r.stateLabel || r.state || ''))).length;
  const stop = list.filter(r => /STOP/i.test(String(r.stateLabel || r.state || ''))).length;
  const entry = list.filter(r => /ENTRY/i.test(String(r.stateLabel || r.state || ''))).length;
  const rValues = realized.map(parseJournalR);
  const avgR = realized.length ? netR / realized.length : 0;
  const equity = [];
  rValues.reduce((acc, v) => { const n = acc + v; equity.push(n); return n; }, 0);
  const grossWin = rValues.filter(v => v > 0).reduce((s, v) => s + v, 0);
  const grossLoss = Math.abs(rValues.filter(v => v < 0).reduce((s, v) => s + v, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0);
  let peak = 0, maxDD = 0;
  equity.forEach(v => { peak = Math.max(peak, v); maxDD = Math.min(maxDD, v - peak); });
  const last = list[0]?.time || list[0]?.createdAt || null;
  return {
    total: list.length,
    realized: realized.length,
    active,
    entry,
    tp,
    stop,
    strategyOk,
    wins,
    losses,
    flat,
    winRate: realized.length ? (wins / realized.length) * 100 : 0,
    netR,
    avgR,
    profitFactor,
    maxDrawdownR: maxDD,
    equity,
    rValues,
    last,
    source: 'Sinyal Günlüğü / localStorage'
  };
}

export function makeForwardJournalReport(rows = loadSignalJournal()) {
  const s = summarizeSignalJournal(rows);
  let verdict = 'KAYIT BEKLİYOR';
  let tone = 'gray';
  if (s.realized >= 20 && s.avgR > 0 && s.profitFactor >= 1.2) { verdict = 'FORWARD POZİTİF'; tone = 'green'; }
  else if (s.realized >= 10 && s.avgR >= 0) { verdict = 'İZLEMEDE'; tone = 'yellow'; }
  else if (s.realized >= 8 && s.avgR < 0) { verdict = 'FORWARD ZAYIF'; tone = 'red'; }
  return {
    summary: s,
    verdict,
    tone,
    note: s.total
      ? 'Sinyal Günlüğü kayıtları Forward Test ve İstatistik ekranlarında canlı kullanıcı/veri katmanı olarak kullanılıyor.'
      : 'Henüz kaydedilmiş canlı sinyal yok. Sinyal Günlüğü ekranından kayıt alındığında bu panel dolacak.'
  };
}

export function formatJournalR(n, d = 2) {
  const v = asNumber(n, 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}


/* RUx — Forward rapor / ayrıştırma motoru */
function _journalKey(row = {}, field = 'setup') {
  const v = String(row[field] ?? '').trim();
  return v || 'Belirsiz';
}
function _journalRealizedRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter(r => _hasNumericNetR(r) || /^[-+]?\d/.test(String(r.finalR || '')));
}
function _journalGroup(rows = [], field = 'setup') {
  const map = new Map();
  _journalRealizedRows(rows).forEach(row => {
    const key = _journalKey(row, field);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.entries()].map(([name, group]) => {
    const rValues = group.map(parseJournalR);
    const netR = rValues.reduce((s, v) => s + v, 0);
    const wins = rValues.filter(v => v > 0).length;
    const losses = rValues.filter(v => v < 0).length;
    const grossWin = rValues.filter(v => v > 0).reduce((s, v) => s + v, 0);
    const grossLoss = Math.abs(rValues.filter(v => v < 0).reduce((s, v) => s + v, 0));
    return {
      name,
      count: group.length,
      netR,
      avgR: group.length ? netR / group.length : 0,
      winRate: group.length ? (wins / group.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0),
      wins,
      losses
    };
  }).sort((a,b) => b.netR - a.netR);
}
function _journalDecision(summary = {}) {
  if (!summary.total) return { label: 'KAYIT BEKLİYOR', tone: 'gray', note: 'Sinyal Günlüğü’ne kayıt alındığında forward raporu oluşacak.' };
  if (summary.realized < 8) return { label: 'ÖRNEK AZ', tone: 'yellow', note: 'Forward karar için daha fazla sonuçlanmış sinyal gerekir.' };
  if (summary.avgR > 0.12 && summary.profitFactor >= 1.35) return { label: 'FORWARD EDGE POZİTİF', tone: 'green', note: 'Canlı kayıtlar pozitif expectancy ve kabul edilebilir profit factor gösteriyor.' };
  if (summary.avgR >= 0 && summary.profitFactor >= 1.0) return { label: 'İZLEMEDE', tone: 'yellow', note: 'Forward sonuçlar nötr/pozitif; örnek büyüdükçe karar güçlenir.' };
  return { label: 'FORWARD ZAYIF', tone: 'red', note: 'Canlı kayıtlar negatif expectancy gösteriyor; kural seti veya no-trade filtresi gözden geçirilmeli.' };
}
export function makeForwardBreakdownReport(rows = loadSignalJournal()) {
  const list = Array.isArray(rows) ? rows : [];
  const summary = summarizeSignalJournal(list);
  const decision = _journalDecision(summary);
  const realized = _journalRealizedRows(list);
  const bySetup = _journalGroup(list, 'setup');
  const byRegime = _journalGroup(list, 'regime');
  const byStrategy = _journalGroup(realized.map(r => ({ ...r, strategyBucket: String(r.strategyLabel || '').toUpperCase().includes('UYGUN') ? 'Stratejiye Uygun' : String(r.strategyLabel || '').toUpperCase().includes('İZLE') ? 'Strateji İzle' : 'Filtre Dışı' })), 'strategyBucket');
  const byAsset = _journalGroup(list, 'asset');
  const tpRows = list.filter(r => /TP/i.test(String(r.stateLabel || r.state || ''))).length;
  const stopRows = list.filter(r => /STOP/i.test(String(r.stateLabel || r.state || ''))).length;
  const openRows = list.filter(r => !_hasNumericNetR(r) && !/^[-+]?\d/.test(String(r.finalR || ''))).length;
  return {
    summary,
    decision,
    realizedCount: realized.length,
    openCount: openRows,
    tpCount: tpRows,
    stopCount: stopRows,
    bySetup,
    byRegime,
    byStrategy,
    byAsset,
    bestSetup: bySetup[0] || null,
    worstSetup: bySetup[bySetup.length - 1] || null,
    generatedAt: new Date().toISOString()
  };
}


/* RUx — Sinyal Günlüğü otomatik outcome takip motoru */
function _journalNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const s = String(value ?? '').trim();
  if (!s || s === '—') return NaN;
  const matches = s.replace(/\s/g, '').match(/-?\d+(?:[,.]\d+)?/g) || [];
  if (!matches.length) return NaN;
  // RUx fiyatları çoğunlukla 100,250 veya 2,850 formatında. Virgülü binlik ayırıcı kabul et.
  const raw = matches[0].replace(/,/g, '');
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function _journalRange(value) {
  const nums = String(value ?? '').replace(/[–—]/g, '-').match(/\d+(?:[,.]\d+)?/g) || [];
  const parsed = nums.map(x => Number(String(x).replace(/,/g, ''))).filter(Number.isFinite);
  if (!parsed.length) return [NaN, NaN];
  if (parsed.length === 1) return [parsed[0], parsed[0]];
  return [Math.min(parsed[0], parsed[1]), Math.max(parsed[0], parsed[1])];
}

function _candleTimeMs(c) {
  const raw = c?.time ?? c?.t ?? c?.openTime ?? c?.timestamp;
  const n = Number(raw);
  if (Number.isFinite(n)) return n > 1e12 ? n : n * 1000;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}
function _candleHigh(c) { return Number(c?.high ?? c?.h ?? c?.High ?? c?.[2]); }
function _candleLow(c) { return Number(c?.low ?? c?.l ?? c?.Low ?? c?.[3]); }
function _candleClose(c) { return Number(c?.close ?? c?.c ?? c?.Close ?? c?.[4]); }

function _isJournalFinal(row = {}) {
  const label = String(row.stateLabel || row.state || '').toUpperCase();
  if (_hasNumericNetR(row)) return true;
  return /TP\d|STOP|TIME STOP|EXPIRED|INVALID|İŞLEM ENGELİ|ENGEL/.test(label);
}
function _direction(row = {}) {
  const d = String(row.direction || '').toUpperCase();
  if (d.includes('SHORT') || d.includes('SAT')) return 'SHORT';
  return 'LONG';
}
function _stateTr(state) {
  if (state === 'TP3') return 'TP3 GÖRÜLDÜ';
  if (state === 'TP2') return 'TP2 GÖRÜLDÜ';
  if (state === 'TP1') return 'TP1 GÖRÜLDÜ';
  if (state === 'STOP') return 'STOP GÖRÜLDÜ';
  if (state === 'TIME_STOP') return 'TIME STOP';
  if (state === 'ENTRY') return 'ENTRY BÖLGESİ GÖRÜLDÜ';
  if (state === 'NO_FILL') return 'ENTRY BEKLİYOR';
  return state || 'İZLE';
}
function _tone(state) {
  if (/TP/.test(state)) return 'green';
  if (/STOP|INVALID|EXPIRED/.test(state)) return 'red';
  if (/ENTRY|TIME|NO_FILL/.test(state)) return 'yellow';
  return 'gray';
}
function _r(entry, stop, target, dir) {
  const risk = Math.max(Math.abs(entry - stop), 1e-9);
  return dir === 'SHORT' ? (entry - target) / risk : (target - entry) / risk;
}

export function updateJournalOutcomes(rows = [], candles = [], opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const bars = (Array.isArray(candles) ? candles : [])
    .filter(c => Number.isFinite(_candleHigh(c)) && Number.isFinite(_candleLow(c)))
    .sort((a,b) => _candleTimeMs(a) - _candleTimeMs(b));
  if (!bars.length) return { rows: list, changed: 0, updatedAt: new Date().toISOString() };
  const now = new Date().toISOString();
  let changed = 0;
  const timeStopBars = Number(opts.timeStopBars || 48);

  const next = list.map(row => {
    if (!row || _isJournalFinal(row)) return row;
    const [entryLo, entryHi] = _journalRange(row.entryZone);
    const preferred = _journalNumber(row.preferredEntry);
    const entry = Number.isFinite(preferred) ? preferred : ((entryLo + entryHi) / 2);
    const stop = _journalNumber(row.stop);
    const tp1 = _journalNumber(row.tp1);
    const tp2 = _journalNumber(row.tp2);
    const tp3 = _journalNumber(row.tp3);
    if (![entryLo, entryHi, entry, stop].every(Number.isFinite)) return row;

    const createdMs = (() => {
      const d = new Date(row.createdAt || row.time || 0);
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    })();
    const scan = bars.filter(c => _candleTimeMs(c) >= createdMs - 60_000);
    if (!scan.length) return row;
    const dir = _direction(row);
    const entryIdx = scan.findIndex(c => _candleHigh(c) >= entryLo && _candleLow(c) <= entryHi);
    if (entryIdx < 0) {
      const patched = {
        ...row,
        state: 'NO_FILL',
        stateLabel: 'ENTRY BEKLİYOR',
        stateTone: 'yellow',
        updatedAt: now,
        note: 'Otomatik takip: entry bölgesi henüz görülmedi.'
      };
      changed += JSON.stringify(patched) !== JSON.stringify(row) ? 1 : 0;
      return patched;
    }

    const after = scan.slice(entryIdx);
    let mfeR = 0;
    let maeR = 0;
    let state = 'ENTRY';
    let finalR = null;
    let firstOutcome = 'Entry görüldü; TP/Stop izleniyor.';

    for (const c of after) {
      const hi = _candleHigh(c), lo = _candleLow(c);
      const favorable = dir === 'SHORT' ? entry - lo : hi - entry;
      const adverse = dir === 'SHORT' ? hi - entry : entry - lo;
      const risk = Math.max(Math.abs(entry - stop), 1e-9);
      mfeR = Math.max(mfeR, favorable / risk);
      maeR = Math.max(maeR, adverse / risk);

      // Aynı mumda hem TP hem stop varsa konservatif yaklaşım: stop önce sayılır.
      const stopHit = dir === 'SHORT' ? hi >= stop : lo <= stop;
      const tp3Hit = Number.isFinite(tp3) && (dir === 'SHORT' ? lo <= tp3 : hi >= tp3);
      const tp2Hit = Number.isFinite(tp2) && (dir === 'SHORT' ? lo <= tp2 : hi >= tp2);
      const tp1Hit = Number.isFinite(tp1) && (dir === 'SHORT' ? lo <= tp1 : hi >= tp1);
      if (stopHit) { state = 'STOP'; finalR = -1; firstOutcome = 'Stop referansı önce görüldü.'; break; }
      if (tp3Hit) { state = 'TP3'; finalR = _r(entry, stop, tp3, dir); firstOutcome = 'TP3 önce görüldü.'; break; }
      if (tp2Hit) { state = 'TP2'; finalR = _r(entry, stop, tp2, dir); firstOutcome = 'TP2 önce görüldü.'; break; }
      if (tp1Hit) { state = 'TP1'; finalR = _r(entry, stop, tp1, dir); firstOutcome = 'TP1 önce görüldü.'; break; }
    }

    if (state === 'ENTRY' && after.length >= timeStopBars && mfeR < 0.5) {
      const last = _candleClose(after[after.length - 1]);
      if (Number.isFinite(last)) {
        state = 'TIME_STOP';
        finalR = _r(entry, stop, last, dir);
        firstOutcome = `Time stop: ${timeStopBars} mum içinde +0.5R ilerleme yok.`;
      }
    }

    const patched = {
      ...row,
      state,
      stateLabel: _stateTr(state),
      stateTone: _tone(state),
      entryHitAt: row.entryHitAt || new Date(_candleTimeMs(scan[entryIdx]) || Date.now()).toISOString(),
      mfeR: Number.isFinite(mfeR) ? Number(mfeR.toFixed(2)) : Number(row.mfeR || 0),
      maeR: Number.isFinite(maeR) ? Number(maeR.toFixed(2)) : Number(row.maeR || 0),
      finalR: finalR == null ? 'Açık / otomatik takip' : formatJournalR(finalR),
      netR: finalR == null ? null : Number(finalR.toFixed(3)),
      updatedAt: now,
      note: `Otomatik takip: ${firstOutcome}`
    };
    changed += JSON.stringify(patched) !== JSON.stringify(row) ? 1 : 0;
    return patched;
  });
  return { rows: next, changed, updatedAt: now };
}
