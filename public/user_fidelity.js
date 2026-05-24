/* RUx — User Execution Fidelity Tracker ekranı */
import { el, toast } from './api.js?v=0.75.2-funding-responsive-live-20260524';
import { ICN, statCard, card, pageHead, tag, barbar } from './components.js?v=0.75.2-funding-responsive-live-20260524';
import { canvasBarChart } from './charts.js?v=0.75.2-funding-responsive-live-20260524';
import {
  addUserExecution,
  buildExecutionFidelityReport,
  clearUserExecutions,
  loadUserExecutions,
  removeUserExecution,
  seedDemoExecutions
} from './rux_execution_fidelity.js?v=0.75.2-funding-responsive-live-20260524';
import { formatJournalR } from './rux_journal.js?v=0.75.2-funding-responsive-live-20260524';

function pct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function rtxt(n, d = 2) { return formatJournalR(Number(n || 0), d); }
function num(n, d = 2) { return Number(n || 0).toFixed(d); }
function dtLocal(iso) {
  try { return new Date(iso || Date.now()).toISOString().slice(0, 16); } catch { return new Date().toISOString().slice(0, 16); }
}
function shortTime(iso) {
  try { return new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; }
}
function toneScore(v) { if (v >= 85) return 'pos'; if (v >= 70) return 'cyan'; if (v >= 50) return 'warn'; return 'neg'; }
function tagByScore(v) { if (v >= 85) return 'green'; if (v >= 70) return 'cyan'; if (v >= 50) return 'yellow'; return 'red'; }

function buildSummary(report) {
  const s = report.summary || {};
  const row = el('div', { class: 'stat-row cols-7 section' });
  row.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: s.status?.tone || 'gray', label: 'FIDELITY', value: num(s.avgFidelity, 1), sub: s.status?.label || 'KAYIT BEKLİYOR', subColor: toneScore(s.avgFidelity) }));
  row.appendChild(statCard({ icon: ICN.signal(18), iconColor: Number(s.signalNetR || 0) >= 0 ? 'green' : 'red', label: 'SİNYAL NET-R', value: rtxt(s.signalNetR), sub: pct(s.signalWinRate) + ' sinyal WR' }));
  row.appendChild(statCard({ icon: ICN.edit(18), iconColor: Number(s.userNetR || 0) >= 0 ? 'green' : 'red', label: 'USER NET-R', value: rtxt(s.userNetR), sub: pct(s.userWinRate) + ' kullanıcı WR' }));
  row.appendChild(statCard({ icon: ICN.scale(18), iconColor: Number(s.deltaR || 0) >= 0 ? 'green' : 'red', label: 'EXECUTION DELTA', value: rtxt(s.deltaR), sub: 'user - signal', subColor: Number(s.deltaR || 0) >= 0 ? 'pos' : 'neg' }));
  row.appendChild(statCard({ icon: ICN.warning(18), iconColor: s.avgDelayMin > 45 ? 'red' : s.avgDelayMin > 15 ? 'yellow' : 'green', label: 'ORT. GECİKME', value: `${Number(s.avgDelayMin || 0).toFixed(0)} dk`, sub: `${s.lateCount || 0} geç giriş` }));
  row.appendChild(statCard({ icon: ICN.target(18), iconColor: s.avgSlippageR > 0.25 ? 'red' : s.avgSlippageR > 0.08 ? 'yellow' : 'green', label: 'ENTRY SLIP-R', value: rtxt(s.avgSlippageR, 3), sub: `${s.chaseCount || 0} kovalama` }));
  row.appendChild(statCard({ icon: ICN.pulse(18), iconColor: s.avgLossR > 0.5 ? 'red' : s.avgLossR > 0.15 ? 'yellow' : 'green', label: 'LEAK / TRADE', value: rtxt(s.avgLossR, 3), sub: `${s.leakCount || 0} edge sızıntısı` }));
  return row;
}

function buildForm(report, rerender) {
  const signals = report.signals || [];
  const select = el('select', { class: 'input' }, ...signals.map(s => el('option', { value: s.id }, `${s.asset} · ${s.direction} · ${s.setup} · ${rtxt(s.signalResultR)}`)));
  const picked = () => signals.find(s => String(s.id) === String(select.value)) || signals[0];
  const now = new Date();
  const entryInput = el('input', { class: 'input', type: 'number', step: 'any', placeholder: 'User entry' });
  const exitInput = el('input', { class: 'input', type: 'number', step: 'any', placeholder: 'User exit' });
  const entryTime = el('input', { class: 'input', type: 'datetime-local', value: dtLocal(now.toISOString()) });
  const exitTime = el('input', { class: 'input', type: 'datetime-local', value: dtLocal(new Date(now.getTime() + 60 * 60000).toISOString()) });
  const note = el('textarea', { class: 'input textarea', placeholder: 'Not: geç giriş, erken çıkış, TP öncesi kapama vb.' });
  const fillFromSignal = () => {
    const s = picked();
    entryInput.value = Number(s.signalEntry || 0).toFixed(s.asset === 'BTCUSDT' ? 0 : 3);
    const risk = Math.abs(Number(s.signalEntry || 0) - Number(s.stop || 0));
    const sampleExit = String(s.direction || '').includes('SHORT') ? Number(s.signalEntry) - risk * 0.8 : Number(s.signalEntry) + risk * 0.8;
    exitInput.value = Number(sampleExit || 0).toFixed(s.asset === 'BTCUSDT' ? 0 : 3);
  };
  select.addEventListener('change', fillFromSignal);
  setTimeout(fillFromSignal, 0);

  const saveBtn = el('button', { class: 'btn primary', type: 'button' }, ICN.plus(14), 'Manuel İşlemi Kaydet');
  saveBtn.addEventListener('click', () => {
    const s = picked();
    const userEntryPrice = Number(entryInput.value);
    const userExitPrice = Number(exitInput.value);
    if (!Number.isFinite(userEntryPrice) || !Number.isFinite(userExitPrice)) {
      toast('Entry ve exit fiyatı sayısal olmalı.', 'warning', 'Fidelity kaydı');
      return;
    }
    addUserExecution({ signalId: s.id, userEntryPrice, userExitPrice, userEntryTime: new Date(entryTime.value).toISOString(), userExitTime: new Date(exitTime.value).toISOString(), userNote: note.value || '' });
    toast('Manuel işlem kaydı eklendi.', 'success', 'User Fidelity');
    rerender();
  });

  const demoBtn = el('button', { class: 'btn outline-cyan', type: 'button' }, ICN.play(14), 'Demo Kayıt Doldur');
  demoBtn.addEventListener('click', () => { seedDemoExecutions(true); toast('Demo fidelity kayıtları yüklendi.', 'success', 'User Fidelity'); rerender(); });
  const clearBtn = el('button', { class: 'btn outline-red', type: 'button' }, ICN.trash(14), 'Kayıtları Temizle');
  clearBtn.addEventListener('click', () => { clearUserExecutions(); toast('User execution kayıtları temizlendi.', 'info', 'User Fidelity'); rerender(); });

  const body = el('div', { class: 'form-stack' },
    el('div', { class: 'field-label' }, 'Sinyal seç'), select,
    el('div', { class: 'row cols-2' },
      el('div', {}, el('div', { class: 'field-label' }, 'User entry price'), entryInput),
      el('div', {}, el('div', { class: 'field-label' }, 'User exit price'), exitInput)
    ),
    el('div', { class: 'row cols-2' },
      el('div', {}, el('div', { class: 'field-label' }, 'Entry zamanı'), entryTime),
      el('div', {}, el('div', { class: 'field-label' }, 'Exit zamanı'), exitTime)
    ),
    el('div', {}, el('div', { class: 'field-label' }, 'Not'), note),
    el('div', { class: 'flex gap-8 wrap' }, saveBtn, demoBtn, clearBtn)
  );
  return card({ title: 'MANUEL UYGULAMA KAYDI', info: 'Uygulama emir açmaz; kullanıcı isterse manuel işlemini buraya kaydeder.', actions: [tag(`${signals.length} sinyal`, 'gray')], body });
}

function buildExplanation(report) {
  const s = report.summary || {};
  return card({
    title: 'SİNYAL Mİ, UYGULAMA MI?',
    actions: [tag(s.status?.label || 'KAYIT BEKLİYOR', s.status?.tone || 'gray')],
    body: el('div', {},
      el('div', { class: 'small muted' }, 'Bu panel terminalin teorik sinyal sonucunu, kullanıcının manuel başka platformda yaptığı giriş/çıkıştan ayrı tutar. Böylece hata yanlış yerde aranmaz.'),
      el('div', { class: 'row cols-3 mt-12' },
        el('div', { class: 'mini-card' }, el('div', { class: 'label' }, 'Signal Performance'), el('div', { class: 'bold mt-4' }, 'Terminal planının teorik R sonucu'), el('div', { class: 'small muted mt-4' }, 'Entry / stop / TP planı ne üretti?')),
        el('div', { class: 'mini-card' }, el('div', { class: 'label' }, 'User Execution'), el('div', { class: 'bold mt-4' }, 'Manuel giriş-çıkış R sonucu'), el('div', { class: 'small muted mt-4' }, 'Kullanıcı geç mi girdi, erken mi çıktı?')),
        el('div', { class: 'mini-card' }, el('div', { class: 'label' }, 'Execution Delta'), el('div', { class: 'bold mt-4 ' + (Number(s.deltaR || 0) >= 0 ? 'pos' : 'neg') }, rtxt(s.deltaR)), el('div', { class: 'small muted mt-4' }, 'User R - Signal R'))
      ),
      el('div', { class: 'small muted mt-10' }, s.status?.note || 'Kayıt girildiğinde uygulama sadakati ölçümü oluşacak.')
    )
  });
}

function buildTable(report, rerender) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['Zaman','Coin','Setup / Rejim','Yön','Signal R','User R','Delta','Gecikme','Slip-R','Fidelity','Durum','Not',''].map((h, i) => el('th', { class: [4,5,6,7,8,9].includes(i) ? 'r' : '' }, h))
  )));
  const body = el('tbody', {});
  if (!report.rows.length) {
    body.appendChild(el('tr', {}, el('td', { colspan: 13, class: 'muted small' }, 'Henüz manuel işlem kaydı yok. Demo kayıt doldurabilir veya yukarıdan manuel kayıt ekleyebilirsin.')));
  } else {
    report.rows.forEach(r => {
      const del = el('button', { class: 'btn tiny ghost', title: 'Sil' }, ICN.trash(12));
      del.addEventListener('click', () => { removeUserExecution(r.id); rerender(); });
      body.appendChild(el('tr', {},
        el('td', { class: 'mono small muted' }, shortTime(r.userEntryTime || r.createdAt)),
        el('td', {}, el('div', { class: 'bold' }, String(r.asset || '').replace('USDT','/USDT')), el('div', { class: 'tiny muted' }, r.tf || '—')),
        el('td', {}, el('div', { class: 'bold' }, r.setup || '—'), el('div', { class: 'tiny muted' }, r.regime || '—')),
        el('td', {}, tag(r.direction || '—', String(r.direction || '').includes('SHORT') ? 'red' : 'green')),
        el('td', { class: 'r mono ' + (Number(r.signalResultR || 0) >= 0 ? 'pos' : 'neg') }, rtxt(r.signalResultR)),
        el('td', { class: 'r mono ' + (Number(r.userResultR || 0) >= 0 ? 'pos' : 'neg') }, rtxt(r.userResultR)),
        el('td', { class: 'r mono ' + (Number(r.executionDeltaR || 0) >= 0 ? 'pos' : 'neg') }, rtxt(r.executionDeltaR)),
        el('td', { class: 'r mono ' + (Number(r.entryDelayMin || 0) > 45 ? 'warn' : '') }, `${Number(r.entryDelayMin || 0).toFixed(0)} dk`),
        el('td', { class: 'r mono ' + (Number(r.entrySlippageR || 0) > 0.15 ? 'warn' : Number(r.entrySlippageR || 0) < 0 ? 'pos' : '') }, rtxt(r.entrySlippageR, 3)),
        el('td', { class: 'r mono bold ' + toneScore(r.fidelityScore) }, num(r.fidelityScore, 1)),
        el('td', {}, tag(r.verdict?.label || '—', r.verdict?.tone || 'gray')),
        el('td', { class: 'small muted' }, r.note || '—'),
        el('td', {}, del)
      ));
    });
  }
  tbl.appendChild(body);
  return card({ title: 'USER EXECUTION KAYITLARI', info: 'Signal R ile User R arasındaki fark burada görünür.', actions: [tag(`${report.rows.length} kayıt`, 'gray')], body: el('div', { class: 'tbl-wrap' }, tbl) });
}

function buildLeakCards(report) {
  const grid = el('div', { class: 'row cols-2 section' });
  const worst = report.worstLeaks || [];
  const best = report.bestExecutions || [];
  const listCard = (title, rows, key = 'executionLossR') => card({ title, body: el('div', { class: 'note-list' }, ...(rows.length ? rows.map(r => el('div', { class: 'note-row' },
    el('div', {}, el('div', { class: 'bold' }, `${r.asset} · ${r.setup}`), el('div', { class: 'small muted' }, `Signal ${rtxt(r.signalResultR)} / User ${rtxt(r.userResultR)} / ${Number(r.entryDelayMin || 0).toFixed(0)} dk`)),
    tag(key === 'fidelityScore' ? num(r.fidelityScore, 1) : rtxt(r.executionLossR), key === 'fidelityScore' ? tagByScore(r.fidelityScore) : (r.executionLossR > 0.5 ? 'red' : 'yellow'))
  )) : [el('div', { class: 'small muted' }, 'Kayıt yok.')])) });
  grid.appendChild(listCard('EN BÜYÜK EDGE SIZINTILARI', worst, 'executionLossR'));
  grid.appendChild(listCard('EN TEMİZ UYGULAMALAR', best, 'fidelityScore'));
  return grid;
}

function buildGroupTables(report) {
  const table = (title, rows) => {
    const tbl = el('table', { class: 'tbl tbl-compact' },
      el('thead', {}, el('tr', {}, ...['Grup','Adet','Fidelity','Signal R','User R','Delta','Slip-R','Gecikme'].map((h, i) => el('th', { class: i > 0 ? 'r' : '' }, h)))),
      el('tbody', {}, ...(rows.length ? rows.slice(0, 8).map(r => el('tr', {},
        el('td', {}, el('div', { class: 'bold' }, r.name)),
        el('td', { class: 'r mono' }, String(r.count || 0)),
        el('td', { class: 'r mono ' + toneScore(r.avgFidelity) }, num(r.avgFidelity, 1)),
        el('td', { class: 'r mono ' + (r.signalNetR >= 0 ? 'pos' : 'neg') }, rtxt(r.signalNetR)),
        el('td', { class: 'r mono ' + (r.userNetR >= 0 ? 'pos' : 'neg') }, rtxt(r.userNetR)),
        el('td', { class: 'r mono ' + (r.deltaR >= 0 ? 'pos' : 'neg') }, rtxt(r.deltaR)),
        el('td', { class: 'r mono' }, rtxt(r.avgSlippageR, 3)),
        el('td', { class: 'r mono' }, `${Number(r.avgDelayMin || 0).toFixed(0)} dk`)
      )) : [el('tr', {}, el('td', { colspan: 8, class: 'muted small' }, 'Kayıt yok.'))]))
    );
    return card({ title, body: el('div', { class: 'tbl-wrap' }, tbl) });
  };
  return el('div', { class: 'row cols-2 section' }, table('SETUP BAZLI UYGULAMA SAPMASI', report.bySetup || []), table('REJİM BAZLI UYGULAMA SAPMASI', report.byRegime || []));
}

function buildDeltaChart(report) {
  const c = card({ title: 'SIGNAL R vs USER R', info: 'Aynı sinyalin teorik sonucu ve kullanıcı sonucu.', actions: [tag('R bazlı', 'cyan')], body: el('div', { class: 'chart-host short mt-6' }) });
  const host = c.querySelector('.chart-host');
  setTimeout(() => canvasBarChart(host, (report.rows || []).slice(0, 10).flatMap(r => [
    { label: String(r.asset || '').replace('USDT',''), value: Number(r.signalResultR || 0) },
    { label: '', value: Number(r.userResultR || 0) }
  ])), 50);
  return c;
}

export async function renderUserFidelity(host) {
  const rerender = () => renderUserFidelity(host);
  host.innerHTML = '';
  const report = buildExecutionFidelityReport(undefined, loadUserExecutions());
  host.appendChild(pageHead({
    title: 'User Execution Fidelity',
    subtitle: 'Teorik sinyal performansı ile kullanıcının manuel uygulama performansını ayrı ölçer.',
    actions: [
      el('a', { class: 'btn sm outline-cyan', href: '#/sinyal-gunlugu' }, ICN.table(14), 'Sinyal Günlüğü'),
      el('a', { class: 'btn sm outline-yellow', href: '#/portfoy-isi' }, ICN.flame(14), 'Portföy Isısı')
    ]
  }));
  host.appendChild(buildSummary(report));
  host.appendChild(el('div', { class: 'row cols-2 section' }, buildForm(report, rerender), buildExplanation(report)));
  host.appendChild(el('div', { class: 'row cols-2 section' }, buildDeltaChart(report), card({ title: 'FIDELITY FORMÜLÜ', actions: [tag('Shadow Metric', 'yellow')], body: el('div', {},
    el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Entry Slip-R'), el('span', { class: 'v mono' }, 'User Entry - Signal Entry / 1R')),
    el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Execution Delta'), el('span', { class: 'v mono' }, 'User R - Signal R')),
    el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Fidelity Score'), el('span', { class: 'v mono' }, '100 - slip/delay/exit leak penalty')),
    el('div', { class: 'mt-8' }, barbar(Number(report.summary.avgFidelity || 0), 100, tagByScore(report.summary.avgFidelity))),
    el('div', { class: 'small muted mt-8' }, 'Bu skor karar motoruna otomatik bağlanmaz; uygulama disiplinini ölçen ayrı bir kontrol panelidir.')
  ) }) ));
  host.appendChild(buildTable(report, rerender));
  host.appendChild(buildLeakCards(report));
  host.appendChild(buildGroupTables(report));
}
