/* RUx — User Execution Fidelity Engine
   Signal Performance ile User Execution Performance ayrımı. */
import { loadSignalJournal, parseJournalR } from './rux_journal.js?v=0.75.6-liquidation-compact-trusted-20260524';

export const USER_EXECUTION_KEY = 'rux.userExecutions.v1';

function safeParseJson(text, fallback) { try { return JSON.parse(text); } catch { return fallback; } }
function readLocal(key, fallback = null) {
  try { if (typeof localStorage === 'undefined') return fallback; const v = localStorage.getItem(key); return v == null ? fallback : v; }
  catch { return fallback; }
}
function writeLocal(key, value) { try { if (typeof localStorage === 'undefined') return false; localStorage.setItem(key, value); return true; } catch { return false; } }
function n(v, fallback = 0) { const x = Number(v); return Number.isFinite(x) ? x : fallback; }
function clamp(v, min = 0, max = 100) { return Math.max(min, Math.min(max, n(v, 0))); }
function round(v, d = 2) { const m = 10 ** d; return Math.round(n(v, 0) * m) / m; }
function isLong(dir = '') { return String(dir || '').toUpperCase().includes('LONG'); }
function isShort(dir = '') { return String(dir || '').toUpperCase().includes('SHORT'); }

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const s = String(value ?? '').replace(/\s/g, '').replace(/[₺$]/g, '');
  if (!s || s === '—') return NaN;
  const matches = s.match(/-?\d+(?:[,.]\d+)?/g) || [];
  if (!matches.length) return NaN;
  const raw = matches[0].replace(/,/g, '');
  const x = Number(raw);
  return Number.isFinite(x) ? x : NaN;
}
function parseEntry(row = {}) {
  const direct = parsePrice(row.preferredEntry ?? row.signalEntry ?? row.entry ?? row.theoreticalEntry);
  if (Number.isFinite(direct)) return direct;
  const rangeText = String(row.entryZone || '').replace(/[–—]/g, '-');
  const nums = (rangeText.match(/\d+(?:[,.]\d+)?/g) || []).map(x => Number(String(x).replace(/,/g, ''))).filter(Number.isFinite);
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];
  return NaN;
}
function signalTime(row = {}) { return row.time || row.createdAt || row.signalTime || new Date().toISOString(); }
function minutesBetween(a, b) {
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.max(0, (tb - ta) / 60000);
}
function rResult(direction, entry, stop, exit) {
  const risk = Math.abs(n(entry) - n(stop));
  if (!risk) return 0;
  if (isShort(direction)) return (n(entry) - n(exit)) / risk;
  return (n(exit) - n(entry)) / risk;
}
function entrySlippageR(direction, signalEntry, userEntry, stop) {
  const risk = Math.abs(n(signalEntry) - n(stop));
  if (!risk) return 0;
  return isShort(direction) ? (n(signalEntry) - n(userEntry)) / risk : (n(userEntry) - n(signalEntry)) / risk;
}
function makeId(prefix = 'ux') { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }

export function loadUserExecutions() {
  const rows = safeParseJson(readLocal(USER_EXECUTION_KEY, '[]'), []);
  return Array.isArray(rows) ? rows : [];
}
export function saveUserExecutions(rows = []) { return writeLocal(USER_EXECUTION_KEY, JSON.stringify((Array.isArray(rows) ? rows : []).slice(0, 500))); }
export function addUserExecution(entry = {}) {
  const rows = loadUserExecutions();
  const row = { ...entry, id: entry.id || makeId(), createdAt: entry.createdAt || new Date().toISOString() };
  rows.unshift(row);
  saveUserExecutions(rows);
  return row;
}
export function clearUserExecutions() { return saveUserExecutions([]); }
export function removeUserExecution(id) { return saveUserExecutions(loadUserExecutions().filter(r => r.id !== id)); }

export function normalizeSignalForExecution(row = {}) {
  const signalEntry = parseEntry(row);
  const stop = parsePrice(row.stop ?? row.stopReference ?? row.invalidation);
  const signalR = Number.isFinite(Number(row.netR)) ? Number(row.netR) : parseJournalR(row);
  return {
    id: row.id || row.signalId || makeId('sig'),
    asset: row.asset || row.symbol || 'BTCUSDT',
    tf: row.tf || '4h',
    direction: row.direction || 'LONG',
    setup: row.setup || row.setupType || 'RUx Setup',
    regime: row.regime || 'NÖTR',
    signalTime: signalTime(row),
    signalEntry,
    stop,
    tp1: parsePrice(row.tp1),
    tp2: parsePrice(row.tp2),
    tp3: parsePrice(row.tp3),
    signalResultR: signalR,
    finalScore: n(row.finalScore ?? row.score, 0),
    source: row.source || 'Sinyal Günlüğü'
  };
}

function fallbackSignals() {
  const now = Date.now();
  return [
    { id:'demo_btc_1', asset:'BTCUSDT', tf:'4h', direction:'LONG', setup:'Liquidity Sweep Reversal Long', regime:'Range / Squeeze', signalTime:new Date(now-26*3600000).toISOString(), signalEntry:100180, stop:99250, tp1:101500, tp2:102800, tp3:104600, signalResultR:2.10, finalScore:82, source:'Demo / Fidelity' },
    { id:'demo_eth_1', asset:'ETHUSDT', tf:'1h', direction:'SHORT', setup:'Breakdown Retest Short', regime:'Bear Trend', signalTime:new Date(now-18*3600000).toISOString(), signalEntry:3620, stop:3675, tp1:3540, tp2:3470, tp3:3380, signalResultR:1.45, finalScore:78, source:'Demo / Fidelity' },
    { id:'demo_sol_1', asset:'SOLUSDT', tf:'1h', direction:'LONG', setup:'Trend Pullback Long', regime:'Bull Trend', signalTime:new Date(now-9*3600000).toISOString(), signalEntry:176.2, stop:171.6, tp1:181.0, tp2:186.5, tp3:193.0, signalResultR:-1.00, finalScore:74, source:'Demo / Fidelity' },
    { id:'demo_avax_1', asset:'AVAXUSDT', tf:'15m', direction:'LONG', setup:'Range Low Rotation Long', regime:'Range', signalTime:new Date(now-5*3600000).toISOString(), signalEntry:38.4, stop:37.2, tp1:39.6, tp2:40.8, tp3:42.6, signalResultR:0.72, finalScore:71, source:'Demo / Fidelity' }
  ];
}
export function availableExecutionSignals(rows = loadSignalJournal()) {
  const list = (Array.isArray(rows) ? rows : []).map(normalizeSignalForExecution).filter(s => Number.isFinite(s.signalEntry) && Number.isFinite(s.stop) && Math.abs(s.signalEntry - s.stop) > 0);
  return list.length ? list.slice(0, 80) : fallbackSignals();
}

// A09 — Kalıcı storage'daki gerçek sinyalleri fidelity için kullanılabilir hale getirir.
// rux_storage.loadJoinedHistory çıktısını normalize eder. Boşsa journal'a/demo'ya düşülür.
export function normalizeStoredSignalsForExecution(joined = []) {
  const list = (Array.isArray(joined) ? joined : []).map(s => {
    const entry = parsePrice(s.manualPlan?.preferredEntry);
    const stop = parsePrice(s.manualPlan?.stopReference);
    const signalR = Number.isFinite(Number(s.outcome?.netR)) ? Number(s.outcome.netR) : 0;
    return {
      id: s.id,
      asset: s.symbol || 'BTCUSDT',
      tf: s.tf || '4h',
      direction: s.direction || 'LONG',
      setup: s.setupFamily ? `${s.setupFamily}` : (s.setup || 'Setup'),
      regime: s.regime || '',
      signalTime: new Date(Number(s.time) || Date.now()).toISOString(),
      signalEntry: entry,
      stop,
      tp1: parsePrice(s.manualPlan?.tp1),
      tp2: parsePrice(s.manualPlan?.tp2),
      tp3: parsePrice(s.manualPlan?.tp3),
      signalResultR: round(signalR, 3),
      finalScore: n(s.finalScore, 0),
      hasOutcome: !!s.outcome,
      outcomeStatus: s.outcome?.status || null,
      source: 'Kalıcı Arşiv (IndexedDB)'
    };
  }).filter(s => Number.isFinite(s.signalEntry) && Number.isFinite(s.stop) && Math.abs(s.signalEntry - s.stop) > 0);
  return list.slice(0, 120);
}
export function seedDemoExecutions(force = false) {
  const current = loadUserExecutions();
  if (current.length && !force) return current;
  const sigs = fallbackSignals();
  const rows = [
    { signalId:sigs[0].id, userEntryPrice:100920, userEntryTime:new Date(Date.now()-25*3600000).toISOString(), userExitPrice:102050, userExitTime:new Date(Date.now()-21*3600000).toISOString(), userNote:'Geç giriş; TP2 öncesi manuel çıkış.' },
    { signalId:sigs[1].id, userEntryPrice:3602, userEntryTime:new Date(Date.now()-17*3600000).toISOString(), userExitPrice:3546, userExitTime:new Date(Date.now()-13*3600000).toISOString(), userNote:'Daha iyi giriş; hedef öncesi kontrollü çıkış.' },
    { signalId:sigs[2].id, userEntryPrice:178.1, userEntryTime:new Date(Date.now()-8*3600000).toISOString(), userExitPrice:172.5, userExitTime:new Date(Date.now()-7*3600000).toISOString(), userNote:'Kovalama nedeniyle stop kaybı büyüdü.' },
    { signalId:sigs[3].id, userEntryPrice:38.55, userEntryTime:new Date(Date.now()-4*3600000).toISOString(), userExitPrice:39.05, userExitTime:new Date(Date.now()-2*3600000).toISOString(), userNote:'Erken çıkış; sinyal R potansiyeli tam alınamadı.' }
  ].map(x => ({ ...x, id: makeId('ux'), createdAt: new Date().toISOString() }));
  saveUserExecutions(rows);
  return rows;
}

export function evaluateExecution(signal = {}, execution = {}) {
  const dir = signal.direction || execution.direction || 'LONG';
  const signalEntry = n(signal.signalEntry, NaN);
  const stop = n(signal.stop, NaN);
  const userEntry = n(execution.userEntryPrice ?? execution.userEntry, NaN);
  const userExit = n(execution.userExitPrice ?? execution.userExit, NaN);
  const risk = Math.abs(signalEntry - stop);
  const signalR = n(signal.signalResultR, 0);
  const userR = Number.isFinite(userEntry) && Number.isFinite(userExit) && risk > 0 ? rResult(dir, userEntry, stop, userExit) : 0;
  const slipR = Number.isFinite(userEntry) && risk > 0 ? entrySlippageR(dir, signalEntry, userEntry, stop) : 0;
  const delayMin = minutesBetween(signal.signalTime, execution.userEntryTime || execution.entryTime || signal.signalTime);
  const deltaR = userR - signalR;
  const lossR = Math.max(0, signalR - userR);
  const favorableSlip = slipR < -0.05;
  const slipPenalty = clamp(Math.max(0, slipR) * 34, 0, 26);
  const delayPenalty = clamp(delayMin / 12, 0, 18);
  const exitPenalty = clamp(lossR * 16, 0, 28);
  const overRiskPenalty = clamp(Math.max(0, Math.abs(userR) - Math.abs(signalR) - 0.4) * 8, 0, 8);
  const score = clamp(100 - slipPenalty - delayPenalty - exitPenalty - overRiskPenalty + (favorableSlip ? 4 : 0), 0, 100);
  let label = 'PLAN UYUMLU', tone = 'green';
  if (score < 45) { label = 'UYGULAMA SAPMASI'; tone = 'red'; }
  else if (score < 70) { label = 'DİSİPLİN KAÇAĞI'; tone = 'yellow'; }
  else if (score < 85) { label = 'KABUL EDİLEBİLİR'; tone = 'cyan'; }
  return {
    signalId: signal.id,
    asset: signal.asset,
    tf: signal.tf,
    direction: dir,
    setup: signal.setup,
    regime: signal.regime,
    signalTime: signal.signalTime,
    userEntryTime: execution.userEntryTime || execution.entryTime || null,
    userExitTime: execution.userExitTime || execution.exitTime || null,
    signalEntry: round(signalEntry, 6),
    stop: round(stop, 6),
    userEntry: round(userEntry, 6),
    userExit: round(userExit, 6),
    signalResultR: round(signalR, 3),
    userResultR: round(userR, 3),
    executionDeltaR: round(deltaR, 3),
    executionLossR: round(lossR, 3),
    entryDelayMin: round(delayMin, 0),
    entrySlippageR: round(slipR, 3),
    exitEfficiency: signalR > 0 ? round((userR / signalR) * 100, 1) : (userR >= signalR ? 100 : 0),
    fidelityScore: round(score, 1),
    verdict: { label, tone },
    note: execution.userNote || execution.note || ''
  };
}

function summarizeEvaluations(rows = []) {
  const count = rows.length;
  const sum = (key) => rows.reduce((s, r) => s + n(r[key], 0), 0);
  const avg = (key) => count ? sum(key) / count : 0;
  const signalNetR = sum('signalResultR');
  const userNetR = sum('userResultR');
  const deltaR = userNetR - signalNetR;
  const wins = rows.filter(r => r.userResultR > 0).length;
  const plannedWins = rows.filter(r => r.signalResultR > 0).length;
  const late = rows.filter(r => r.entryDelayMin >= 45).length;
  const chase = rows.filter(r => r.entrySlippageR > 0.25).length;
  const leakRows = rows.filter(r => r.executionLossR > 0.25).length;
  const avgScore = avg('fidelityScore');
  let status = { label:'KAYIT BEKLİYOR', tone:'gray', note:'Manuel işlem kaydı yok.' };
  if (count) {
    if (avgScore >= 85 && deltaR >= -0.25) status = { label:'UYGULAMA GÜÇLÜ', tone:'green', note:'Manuel uygulama sinyal planına yüksek oranda uyuyor.' };
    else if (avgScore >= 70) status = { label:'KABUL EDİLEBİLİR', tone:'cyan', note:'Sapma var ama sistem-sinyal analizi bozulacak düzeyde değil.' };
    else if (avgScore >= 50) status = { label:'DİSİPLİN KAÇAĞI', tone:'yellow', note:'Geç giriş / erken çıkış sinyal edge’ini zayıflatıyor.' };
    else status = { label:'UYGULAMA RİSKİ', tone:'red', note:'Kayıpların önemli bölümü sinyalden değil uygulama sapmasından geliyor olabilir.' };
  }
  return {
    count,
    signalNetR: round(signalNetR, 2),
    userNetR: round(userNetR, 2),
    deltaR: round(deltaR, 2),
    avgFidelity: round(avgScore, 1),
    avgDelayMin: round(avg('entryDelayMin'), 0),
    avgSlippageR: round(avg('entrySlippageR'), 3),
    avgLossR: round(avg('executionLossR'), 3),
    userWinRate: count ? round((wins / count) * 100, 1) : 0,
    signalWinRate: count ? round((plannedWins / count) * 100, 1) : 0,
    lateCount: late,
    chaseCount: chase,
    leakCount: leakRows,
    status
  };
}
function groupBy(rows = [], key = 'setup') {
  const map = new Map();
  rows.forEach(r => { const k = String(r[key] || 'Belirsiz'); if (!map.has(k)) map.set(k, []); map.get(k).push(r); });
  return [...map.entries()].map(([name, list]) => {
    const s = summarizeEvaluations(list);
    return { name, count:list.length, avgFidelity:s.avgFidelity, signalNetR:s.signalNetR, userNetR:s.userNetR, deltaR:s.deltaR, avgDelayMin:s.avgDelayMin, avgSlippageR:s.avgSlippageR, tone:s.status.tone };
  }).sort((a,b) => a.deltaR - b.deltaR);
}
export function buildExecutionFidelityReport(signalRows = loadSignalJournal(), executionRows = loadUserExecutions()) {
  const signals = availableExecutionSignals(signalRows);
  const byId = new Map([...signals, ...fallbackSignals()].map(s => [String(s.id), s]));
  const evaluations = (Array.isArray(executionRows) ? executionRows : []).map(x => {
    const sig = byId.get(String(x.signalId)) || signals[0] || fallbackSignals()[0];
    return { ...x, ...evaluateExecution(sig, x) };
  }).sort((a,b) => new Date(b.userEntryTime || b.createdAt || 0) - new Date(a.userEntryTime || a.createdAt || 0));
  const summary = summarizeEvaluations(evaluations);
  const worstLeaks = evaluations.slice().sort((a,b) => b.executionLossR - a.executionLossR).slice(0, 5);
  const bestExecutions = evaluations.slice().sort((a,b) => b.fidelityScore - a.fidelityScore).slice(0, 5);
  return {
    version: '0.49.3-live-card-hydration',
    signals,
    rows: evaluations,
    summary,
    worstLeaks,
    bestExecutions,
    bySetup: groupBy(evaluations, 'setup'),
    byRegime: groupBy(evaluations, 'regime'),
    generatedAt: new Date().toISOString()
  };
}
