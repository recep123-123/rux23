/* RUx — Sinyal Günlüğü / Signal Outcome Journal */
import { State, fetchMarket, el, fmtPrice, toast } from './api.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { ICN, statCard, card, pageHead, tag, coinPill, checklist } from './components.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { analyzeLiveMarketSignal, simulateSignalTracking, buildSignalDataset, makeDemoCandles } from './rux_core.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { buildRuleBuilderReport } from './rux_rulebuilder.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { loadSignalJournal, saveSignalJournal, clearSignalJournal, updateJournalOutcomes, makeForwardBreakdownReport, formatJournalR } from './rux_journal.js?v=0.75.12-heatmap-premium-visual-pass-20260524';

const JOURNAL_KEY = 'rux.signalJournal.v1';
const FILTER_KEY = 'rux.signalJournal.filter';

function nowIso() { return new Date().toISOString(); }
function fmtDate(v) {
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}
function fmtR(n, d=2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(d) + 'R';
}
function safeJsonParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }
function loadManualJournal() { return loadSignalJournal(); }
function saveManualJournal(rows) { saveSignalJournal(rows); }
function getActiveRuleSet() {
  try {
    const rep = buildRuleBuilderReport();
    const saved = localStorage.getItem('rux.selectedRuleSetId');
    return rep.sets.find(r => r.id === saved) || rep.active || rep.best || rep.sets[0] || null;
  } catch { return null; }
}
function planValue(plan, key) { return plan?.[key] || '—'; }
function toneByState(state = '') {
  const s = String(state).toUpperCase();
  if (s.includes('TP') || s.includes('GÖRÜLDÜ') || s.includes('VALID') || s.includes('GEÇERLİ')) return 'green';
  if (s.includes('STOP') || s.includes('INVALID') || s.includes('DONDUR') || s.includes('BLOK')) return 'red';
  if (s.includes('TIME') || s.includes('EXPIRED') || s.includes('HAZIR') || s.includes('ENTRY')) return 'yellow';
  return 'gray';
}
function trState(state = '') {
  const s = String(state || '').toUpperCase();
  if (s === 'TP3') return 'TP3 GÖRÜLDÜ';
  if (s === 'TP2') return 'TP2 GÖRÜLDÜ';
  if (s === 'TP1') return 'TP1 GÖRÜLDÜ';
  if (s === 'STOP') return 'STOP GÖRÜLDÜ';
  if (s === 'NO_FILL') return 'ENTRY BEKLİYOR';
  if (s === 'NO_TRADE_BLOCK') return 'İŞLEM ENGELİ';
  if (s === 'WATCH_ONLY') return 'İZLEME';
  if (s.includes('GİRİŞ')) return 'ENTRY BÖLGESİ GÖRÜLDÜ';
  if (s.includes('GEÇERLİ')) return 'GEÇERLİ SİNYAL';
  if (s.includes('HAZIR')) return 'HAZIRLAN';
  return String(state || 'İZLE');
}
function strategyStatus(snapshot, rule) {
  if (!rule) return { label: 'KURAL YOK', tone: 'gray' };
  const th = rule.thresholds || {};
  const score = Number(snapshot.final?.score || snapshot.score || 0);
  const data = Number(snapshot.data?.score || snapshot.dataConfidence || 0);
  const noTrade = Number(snapshot.noTrade?.score || snapshot.noTradeScore || 0);
  const rr = parseFloat(String(snapshot.manualPlan?.rrExpected || '0').replace(',', '.')) || 0;
  const dir = String(snapshot.direction || '').toUpperCase();
  const ruleDir = String(rule.direction || '').toUpperCase();
  const dirOk = !ruleDir || ruleDir === 'ANY' || dir.includes(ruleDir);
  const ok = dirOk && score >= Number(th.minFinal ?? 70) && data >= Number(th.minDataConfidence ?? 65) && noTrade <= Number(th.maxNoTrade ?? 60) && rr >= Number(th.minRR ?? 1.5);
  if (ok) return { label: 'STRATEJİYE UYGUN', tone: 'green' };
  if (score >= Number(th.minFinal ?? 70) - 8 && data >= Number(th.minDataConfidence ?? 65) - 8) return { label: 'STRATEJİ İZLE', tone: 'yellow' };
  return { label: 'FİLTRE DIŞI', tone: 'red' };
}
function entryFromSnapshot(snapshot = {}, rule = null, source = 'Canlı') {
  const tracking = simulateSignalTracking(snapshot);
  const strat = strategyStatus(snapshot, rule);
  const plan = snapshot.manualPlan || {};
  return {
    id: 'sig_' + Math.random().toString(36).slice(2, 10),
    createdAt: nowIso(),
    time: nowIso(),
    asset: snapshot.asset || snapshot.symbol || State.symbol || 'BTCUSDT',
    tf: snapshot.tf || State.tf || '4h',
    direction: snapshot.direction || 'WATCH',
    setup: snapshot.setup || 'RUx Setup',
    regime: snapshot.regime?.active || snapshot.regime || 'NÖTR',
    finalScore: Number(snapshot.final?.score || 0),
    dataConfidence: Number(snapshot.data?.score || 0),
    noTradeScore: Number(snapshot.noTrade?.score || 0),
    strategyLabel: strat.label,
    strategyTone: strat.tone,
    ruleSetName: rule?.name || 'Varsayılan RUx',
    entryZone: planValue(plan, 'entryZone'),
    preferredEntry: planValue(plan, 'preferredEntry'),
    stop: planValue(plan, 'stopReference'),
    tp1: planValue(plan, 'tp1'),
    tp2: planValue(plan, 'tp2'),
    tp3: planValue(plan, 'tp3'),
    rr: planValue(plan, 'rrExpected'),
    state: tracking.state,
    stateLabel: trState(tracking.state),
    stateTone: toneByState(tracking.state),
    mfeR: Number(tracking.mfeR || 0),
    maeR: Number(tracking.maeR || 0),
    finalR: tracking.finalR || 'Açık',
    netR: null,
    source,
    note: tracking.tpProgress || 'Teorik takip aktif.'
  };
}
function entryFromDatasetRow(row = {}, rule = null) {
  const outcome = row.outcome || {};
  const snap = row.snapshot || {};
  const strat = strategyStatus(snap, rule);
  const ts = Number(row.time) > 1e12 ? Number(row.time) : Number(row.time) * 1000;
  const finalState = outcome.filled ? outcome.status : row.status;
  return {
    id: 'bt_' + (row.id || Math.random().toString(36).slice(2, 8)),
    createdAt: new Date(ts || Date.now()).toISOString(),
    time: new Date(ts || Date.now()).toISOString(),
    asset: row.asset || State.symbol || 'BTCUSDT',
    tf: row.tf || State.tf || '4h',
    direction: row.direction || 'WATCH',
    setup: row.setup || 'RUx Setup',
    regime: row.regime || 'NÖTR',
    finalScore: Number(row.score || 0),
    dataConfidence: Number(row.dataConfidence || 0),
    noTradeScore: Number(row.noTradeScore || 0),
    strategyLabel: strat.label,
    strategyTone: strat.tone,
    ruleSetName: row.ruleSetName || rule?.name || 'Varsayılan RUx',
    entryZone: snap.manualPlan?.entryZone || '—',
    preferredEntry: outcome.entry ? fmtPrice(outcome.entry) : (snap.manualPlan?.preferredEntry || '—'),
    stop: outcome.stop ? fmtPrice(outcome.stop) : (snap.manualPlan?.stopReference || '—'),
    tp1: snap.manualPlan?.tp1 || '—',
    tp2: snap.manualPlan?.tp2 || '—',
    tp3: snap.manualPlan?.tp3 || '—',
    rr: snap.manualPlan?.rrExpected || '—',
    state: finalState,
    stateLabel: trState(finalState),
    stateTone: toneByState(finalState),
    mfeR: Number(outcome.mfeR || 0),
    maeR: Number(outcome.maeR || 0),
    finalR: fmtR(outcome.netR || 0),
    netR: Number(outcome.netR || 0),
    source: 'Backtest / Forward sim.',
    note: outcome.firstOutcome || 'Simüle outcome'
  };
}
function summarize(rows = []) {
  const active = rows.filter(r => !['TP1 GÖRÜLDÜ','TP2 GÖRÜLDÜ','TP3 GÖRÜLDÜ','STOP GÖRÜLDÜ','İŞLEM ENGELİ'].includes(r.stateLabel)).length;
  const entry = rows.filter(r => String(r.stateLabel).includes('ENTRY')).length;
  const tp = rows.filter(r => String(r.stateLabel).includes('TP')).length;
  const stop = rows.filter(r => String(r.stateLabel).includes('STOP')).length;
  const net = rows.reduce((s, r) => s + (r.netR !== null && r.netR !== undefined && r.netR !== '' && Number.isFinite(Number(r.netR)) ? Number(r.netR) : 0), 0);
  const good = rows.filter(r => r.strategyLabel === 'STRATEJİYE UYGUN').length;
  return { total: rows.length, active, entry, tp, stop, net, good };
}
function rowView(r) {
  return el('tr', {},
    el('td', { class: 'mono small muted' }, fmtDate(r.time)),
    el('td', {}, coinPill(r.asset, r.source)),
    el('td', {}, tag(r.direction, String(r.direction).includes('SHORT') ? 'red' : String(r.direction).includes('LONG') ? 'green' : 'yellow')),
    el('td', {}, el('div', { class: 'bold' }, r.setup), el('div', { class: 'tiny muted' }, r.regime)),
    el('td', {}, tag(r.strategyLabel, r.strategyTone)),
    el('td', { class: 'mono small' }, String(r.entryZone || '—')),
    el('td', { class: 'mono small neg' }, String(r.stop || '—')),
    el('td', { class: 'mono small pos' }, [r.tp1, r.tp2, r.tp3].filter(Boolean).join(' / ')),
    el('td', {}, tag(r.stateLabel, r.stateTone)),
    el('td', { class: 'mono pos' }, fmtR(r.mfeR)),
    el('td', { class: 'mono neg' }, '-' + Math.abs(Number(r.maeR || 0)).toFixed(2) + 'R'),
    el('td', { class: 'mono ' + (Number(r.netR || 0) >= 0 ? 'pos' : 'neg') }, r.finalR),
    el('td', { class: 'small muted' }, r.note || '—')
  );
}


function pct(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(1) + '%' : '—';
}
function pf(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
}
function groupTable(title, rows = [], empty = 'Kayıt yok') {
  const safe = Array.isArray(rows) ? rows.slice(0, 8) : [];
  const tbl = el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {}, ...['GRUP','ADET','NET-R','AVG-R','WR','PF'].map(h => el('th', {}, h)))),
    el('tbody', {}, ...(safe.length ? safe.map(r => el('tr', {},
      el('td', {}, el('div', { class: 'bold' }, r.name)),
      el('td', { class: 'mono' }, String(r.count || 0)),
      el('td', { class: 'mono ' + (Number(r.netR || 0) >= 0 ? 'pos' : 'neg') }, formatJournalR(r.netR || 0)),
      el('td', { class: 'mono ' + (Number(r.avgR || 0) >= 0 ? 'pos' : 'neg') }, formatJournalR(r.avgR || 0, 3)),
      el('td', { class: 'mono' }, pct(r.winRate || 0)),
      el('td', { class: 'mono' }, pf(r.profitFactor || 0))
    )) : [el('tr', {}, el('td', { colspan: 6, class: 'muted small' }, empty))]))
  );
  return card({ title, body: el('div', { class: 'tbl-wrap' }, tbl) });
}
function forwardReportPanel(rows = []) {
  const report = makeForwardBreakdownReport(rows);
  const s = report.summary || {};
  const decision = report.decision || { label: 'KAYIT BEKLİYOR', tone: 'gray', note: 'Kayıt yok.' };
  const top = el('div', { class: 'stat-row cols-6 mt-10' });
  top.appendChild(statCard({ icon: ICN.signal(18), iconColor: 'cyan', label: 'FORWARD KAYIT', value: String(s.total || 0), sub: `${report.realizedCount || 0} sonuçlandı` }));
  top.appendChild(statCard({ icon: ICN.trend(18), iconColor: Number(s.netR || 0) >= 0 ? 'green' : 'red', label: 'FORWARD NET-R', value: formatJournalR(s.netR || 0), sub: 'canlı günlük' }));
  top.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'WIN RATE', value: pct(s.winRate || 0), sub: `${s.wins || 0}W / ${s.losses || 0}L` }));
  top.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'yellow', label: 'PROFIT FACTOR', value: pf(s.profitFactor || 0), sub: 'gross win/loss' }));
  top.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'MAX DD', value: formatJournalR(s.maxDrawdownR || 0), sub: 'equity drawdown' }));
  top.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: decision.tone === 'green' ? 'green' : decision.tone === 'red' ? 'red' : 'yellow', label: 'FORWARD KARAR', value: decision.label, sub: 'outcome journal' }));

  const body = el('div', {},
    el('div', { class: 'flex between gap-10' },
      el('div', {},
        el('div', { class: 'tiny muted' }, 'CANLI FORWARD RAPORU'),
        el('div', { class: 'bold mt-2' }, decision.label),
        el('div', { class: 'small muted mt-4' }, decision.note)
      ),
      tag('Outcome Journal', decision.tone || 'gray')
    ),
    top,
    el('div', { class: 'row cols-4 mt-12' },
      groupTable('SETUP BAZLI FORWARD EDGE', report.bySetup),
      groupTable('REJİM BAZLI FORWARD EDGE', report.byRegime),
      groupTable('STRATEJİ UYUMU BAZLI SONUÇ', report.byStrategy),
      groupTable('VARLIK BAZLI SONUÇ', report.byAsset)
    ),
    el('div', { class: 'rux-note mt-12' }, `En iyi setup: ${report.bestSetup?.name || '—'} (${formatJournalR(report.bestSetup?.netR || 0)}) · En zayıf setup: ${report.worstSetup?.name || '—'} (${formatJournalR(report.worstSetup?.netR || 0)}). Açık kayıt: ${report.openCount || 0}.`)
  );
  return card({ title: 'FORWARD TEST RAPOR PANELİ', actions: [tag('Canlı günlük verisi', 'cyan'), tag('Otomatik emir yok', 'yellow')], body });
}

function lifecycleCard(rows) {
  const states = ['WATCH','PREPARE','VALID SIGNAL','ENTRY ZONE HIT','TP1 HIT','TP2 HIT','TP3 HIT','STOP HIT','TIME STOP','EXPIRED','INVALIDATED'];
  const map = {
    'WATCH': rows.filter(r => String(r.stateLabel).includes('İZLE')).length,
    'PREPARE': rows.filter(r => String(r.stateLabel).includes('HAZIR')).length,
    'VALID SIGNAL': rows.filter(r => String(r.stateLabel).includes('GEÇERLİ')).length,
    'ENTRY ZONE HIT': rows.filter(r => String(r.stateLabel).includes('ENTRY')).length,
    'TP1 HIT': rows.filter(r => String(r.stateLabel).includes('TP1')).length,
    'TP2 HIT': rows.filter(r => String(r.stateLabel).includes('TP2')).length,
    'TP3 HIT': rows.filter(r => String(r.stateLabel).includes('TP3')).length,
    'STOP HIT': rows.filter(r => String(r.stateLabel).includes('STOP')).length,
    'TIME STOP': rows.filter(r => String(r.state || '').includes('TIME')).length,
    'EXPIRED': rows.filter(r => String(r.state || '').includes('EXPIRED')).length,
    'INVALIDATED': rows.filter(r => String(r.state || '').includes('INVALID')).length,
  };
  return card({ title: 'SİNYAL YAŞAM DÖNGÜSÜ', body: el('div', { class: 'rux-lifecycle-grid' }, ...states.map(s => el('div', { class: 'rux-life-cell' },
    el('div', { class: 'tiny muted' }, s),
    el('div', { class: 'mono bold mt-2' }, String(map[s] || 0))
  ))) });
}

async function autoUpdateSavedJournal(host = null, silent = true) {
  const saved = loadManualJournal();
  if (!saved.length) return { changed: 0, total: 0 };
  const grouped = new Map();
  saved.forEach(row => {
    const key = `${row.asset || State.symbol || 'BTCUSDT'}|${row.tf || State.tf || '4h'}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  });
  const updated = [];
  let changed = 0;
  for (const [key, rows] of grouped.entries()) {
    const [symbol, tf] = key.split('|');
    let candles = [];
    try {
      const market = await fetchMarket(symbol, tf || '4h', 520);
      candles = market?.candles || [];
    } catch {}
    if (!candles.length) {
      // Canlı veri yoksa outcome'u demo mumla ölçme (sahte sonuç olur). Atla.
      continue;
    }
    const result = updateJournalOutcomes(rows, candles, { timeStopBars: tf === '1w' ? 8 : tf === '1d' ? 12 : 48 });
    changed += result.changed || 0;
    updated.push(...(result.rows || rows));
  }
  updated.sort((a,b) => new Date(b.createdAt || b.time || 0) - new Date(a.createdAt || a.time || 0));
  if (changed > 0) saveManualJournal(updated);
  if (!silent) {
    try { toast(changed ? `${changed} sinyal kaydı güncellendi.` : 'Güncellenecek açık sinyal yok.'); } catch {}
    if (host) renderSinyalGunlugu(host);
  }
  return { changed, total: updated.length };
}

async function buildRows() {
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const rule = getActiveRuleSet();
  const manual = loadManualJournal();
  let market = null;
  try { market = await fetchMarket(symbol, tf, 520); } catch {}
  // KARAR YOLU: demo mum YASAK. Canlı veri yoksa motor "SİNYAL ÜRETİLMEDİ" döner.
  const candles = market?.candles?.length ? market.candles : [];
  const rows = [];
  try {
    const liveSnap = analyzeLiveMarketSignal({ symbol, tf, marketData: { candles, source: market?.source || 'veri yok' } });
    rows.push(entryFromSnapshot(liveSnap, rule, liveSnap.signalProduced === false ? 'Veri yok' : 'Canlı snapshot'));
  } catch {}
  try {
    // Backtest dataset'i ARAŞTIRMA amaçlıdır; canlı veri yoksa demo ile çalışabilir
    // ama açıkça araştırma etiketiyle (karar yolu değil).
    const researchCandles = candles.length ? candles : makeDemoCandles(520, tf);
    const isDemo = !candles.length;
    const dataset = buildSignalDataset(researchCandles, { symbol, tf, minScore: Number(rule?.thresholds?.minFinal || 58), step: Math.max(8, Math.floor(researchCandles.length / 28)), lookahead: tf === '1d' ? 12 : tf === '1w' ? 8 : 32, fillModel: 'realistic', ruleSet: rule });
    dataset.slice(-18).reverse().forEach(r => rows.push({ ...entryFromDatasetRow(r, rule), _research: isDemo }));
  } catch {}
  return { rows: [...manual, ...rows].slice(0, 80), rule, market };
}
async function saveCurrentSignal(host) {
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const rule = getActiveRuleSet();
  let market = null;
  try { market = await fetchMarket(symbol, tf, 300); } catch {}
  // KARAR YOLU: demo mum YASAK. Canlı veri yoksa kaydetme.
  if (!market?.candles?.length) {
    try { toast('Canlı veri yok; sinyal kaydedilmedi (demo veri karar yolunda kullanılamaz).'); } catch {}
    return;
  }
  const snap = analyzeLiveMarketSignal({ symbol, tf, marketData: { candles: market.candles, source: market?.source || 'live' } });
  if (snap.signalProduced === false) {
    try { toast('Sinyal üretilmedi (yetersiz/doğrulanmamış veri); kaydedilmedi.'); } catch {}
    return;
  }
  const row = entryFromSnapshot(snap, rule, 'Manuel kaydedildi');
  const all = [row, ...loadManualJournal()].slice(0, 250);
  saveManualJournal(all);
  try { toast('Sinyal günlüğe kaydedildi.'); } catch {}
  renderSinyalGunlugu(host);
}
function exportJournal() {
  const blob = new Blob([JSON.stringify(loadManualJournal(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'rux-sinyal-gunlugu.json' });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

export async function renderSinyalGunlugu(host) {
  host.innerHTML = '';
  const savedFilter = (() => { try { return localStorage.getItem(FILTER_KEY) || 'TÜMÜ'; } catch { return 'TÜMÜ'; } })();
  host.appendChild(pageHead({
    title: 'SİNYAL GÜNLÜĞÜ',
    subtitle: 'RUx sinyallerinin entry, TP, stop, time-stop, MFE/MAE ve Net-R outcome takibi. Otomatik emir açmaz.',
    actions: [
      el('a', { class: 'btn', href: '#/sinyal' }, ICN.signal(12), 'SİNYAL MERKEZİ'),
      el('button', { class: 'btn primary', on: { click: () => saveCurrentSignal(host) } }, ICN.plus(12), 'CANLI SİNYALİ KAYDET'),
      el('button', { class: 'btn', on: { click: () => autoUpdateSavedJournal(host, false) } }, ICN.refresh(12), 'TAKİBİ GÜNCELLE'),
      el('button', { class: 'btn', on: { click: exportJournal } }, ICN.download(12), 'DIŞARI AKTAR'),
      el('button', { class: 'btn danger', on: { click: () => { clearSignalJournal(); renderSinyalGunlugu(host); } } }, ICN.trash(12), 'MANUEL KAYITLARI TEMİZLE')
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'RUx sinyal outcome günlüğü hazırlanıyor…'));
  host.appendChild(loading);
  await autoUpdateSavedJournal(host, true);
  const { rows, rule, market } = await buildRows();
  loading.remove();

  const filtered = savedFilter === 'TÜMÜ' ? rows : rows.filter(r => {
    if (savedFilter === 'STRATEJİ') return r.strategyLabel === 'STRATEJİYE UYGUN';
    if (savedFilter === 'AÇIK') return !String(r.stateLabel).includes('TP') && !String(r.stateLabel).includes('STOP') && !String(r.stateLabel).includes('ENGEL');
    if (savedFilter === 'TP') return String(r.stateLabel).includes('TP');
    if (savedFilter === 'STOP') return String(r.stateLabel).includes('STOP');
    return true;
  });
  // Forward istatistiği SADECE canlı/manuel kayıtlardan beslenir.
  // Araştırma/backtest (_research) satırları forward özetine KARIŞMAZ.
  const liveRows = filtered.filter(r => !r._research);
  const researchRows = filtered.filter(r => r._research);
  const sum = summarize(liveRows);
  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ICN.signal(18), iconColor: 'cyan', label: 'TOPLAM KAYIT', value: String(sum.total), sub: `${State.symbol || 'BTCUSDT'} · ${State.tf || '4h'} · canlı/manuel` }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'yellow', label: 'AKTİF TAKİP', value: String(sum.active), sub: 'entry/TP bekliyor' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'ENTRY HIT', value: String(sum.entry), sub: 'bölge görüldü' }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'TP GÖREN', value: String(sum.tp), sub: 'TP1/2/3' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'STOP GÖREN', value: String(sum.stop), sub: 'risk gerçekleşti' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: sum.net >= 0 ? 'green' : 'red', label: 'NET-R', value: fmtR(sum.net), sub: 'canlı/manuel (araştırma hariç)' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'STRATEJİ UYUMLU', value: String(sum.good), sub: rule?.name || 'kural yok' }));
  host.appendChild(stats);

  const filters = el('div', { class: 'flex gap-8 section', style: 'flex-wrap:wrap' });
  ['TÜMÜ','STRATEJİ','AÇIK','TP','STOP'].forEach(f => filters.appendChild(el('button', { class: 'btn tiny ' + (savedFilter === f ? 'primary' : ''), on: { click: () => { try { localStorage.setItem(FILTER_KEY, f); } catch {}; renderSinyalGunlugu(host); } } }, f)));
  filters.appendChild(el('span', { class: 'small muted' }, `Aktif kural: ${rule?.name || '—'} · Kaynak: ${market?.source || 'veri yok'}`));
  host.appendChild(filters);

  // Forward rapor paneli SADECE canlı/manuel satırlardan
  host.appendChild(forwardReportPanel(liveRows));

  const tbl = el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {}, ...['ZAMAN','COIN','YÖN','SETUP/REJİM','STRATEJİ','ENTRY','STOP','TP','DURUM','MFE','MAE','FINAL R','NOT'].map(h => el('th', {}, h)))),
    el('tbody', {}, ...liveRows.map(rowView))
  );
  host.appendChild(card({ title: 'OUTCOME JOURNAL (CANLI / MANUEL)', actions: [tag('Manual execution only', 'yellow'), tag('Net-R takip', 'cyan')], body: el('div', { class: 'tbl-wrap' }, tbl) }));

  // Araştırma/backtest satırları AYRI bölümde, açık uyarıyla
  if (researchRows.length) {
    const rtbl = el('table', { class: 'tbl tbl-compact' },
      el('thead', {}, el('tr', {}, ...['ZAMAN','COIN','YÖN','SETUP/REJİM','STRATEJİ','ENTRY','STOP','TP','DURUM','MFE','MAE','FINAL R','NOT'].map(h => el('th', {}, h)))),
      el('tbody', {}, ...researchRows.map(rowView))
    );
    host.appendChild(card({
      title: 'ARAŞTIRMA / BACKTEST SİMÜLASYONU',
      actions: [tag('RESEARCH ONLY', 'red'), tag('Forward istatistiğe dahil DEĞİL', 'yellow')],
      body: el('div', {},
        el('div', { class: 'small', style: 'color:var(--red,#8B0000); padding:6px 0; font-weight:600' },
          'Bu satırlar gerçek canlı karar sinyali değildir. Canlı veri yokken üretilen backtest/simülasyon çıktısıdır. Forward Net-R, win-rate ve profit factor istatistiklerine DAHİL EDİLMEZ.'),
        el('div', { class: 'tbl-wrap' }, rtbl)
      )
    }));
  }

  host.appendChild(el('div', { class: 'row fr-2-1 section' },
    lifecycleCard(liveRows),
    card({ title: 'TAKİP PROTOKOLÜ', body: el('div', {},
      checklist([
        { state:'ok', label:'Entry bölgesi görülmeden trade sonucu kesinleşmez.', right: tag('ENTRY', 'cyan') },
        { state:'ok', label:'TP/Stop sonuçları Net-R olarak kaydedilir.', right: tag('NET-R', 'green') },
        { state:'warn', label:'Canlı kayıtlar tarayıcı belleğinde tutulur.', right: tag('LOCAL', 'yellow') },
        { state:'ok', label:'Otomatik emir açma/kapatma yoktur.', right: tag('MANUEL', 'red') },
      ]),
      el('div', { class: 'rux-note mt-10' }, 'Bu günlük artık Forward Test ve İstatistik ekranlarını besler; açık kayıtlar canlı mumlarla otomatik outcome takibine girer.')
    ) })
  ));
}
