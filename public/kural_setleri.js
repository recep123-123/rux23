/* RUx — Kural Setleri / Forward Durumu */
import { el } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, checklist, tag } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import {
  buildRuleBuilderReport,
  addRuleSet,
  activateRuleSet,
  updateRuleSet,
  deleteRuleSet,
  exportRuleSetsBlob
} from './rux_rulebuilder.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { loadSignalJournal, parseJournalR } from './rux_journal.js?v=0.75.10-heatmap-fidelity-pass-20260524';

function fmt(n, d=0) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}

function fmtR(n, d=2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(d) + 'R';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  } catch { return '—'; }
}

function wfTone(rule = {}) {
  const s = String(rule.status || '');
  const wf = rule.walkForward || {};
  if (s.includes('WF Shadow Onay')) return 'green';
  if (s.includes('WF İzleme')) return 'yellow';
  if (wf.validatedAt) return Number(wf.avgOosExpectancy || 0) > 0 ? 'green' : 'red';
  if (s.toLowerCase().includes('shadow')) return 'yellow';
  return 'gray';
}

function wfLabel(rule = {}) {
  const wf = rule.walkForward || {};
  if (!wf.validatedAt) return 'WF bekliyor';
  return `${fmtR(wf.avgOosExpectancy, 3)} · Stability ${wf.avgStability ?? '—'}`;
}

function wfSummary(rule = {}) {
  const wf = rule.walkForward || {};
  if (!wf.validatedAt) {
    return {
      label: 'Walk-forward yok',
      detail: 'Bu kural seti henüz OOS walk-forward doğrulamasından geçirilmedi.',
      recommendation: 'Önce Backtest/Optimizer, sonra Walk-forward doğrulaması çalıştır.'
    };
  }
  return {
    label: rule.status || 'WF İzleme',
    detail: `OOS Net-R ${fmtR(wf.totalOosR)} · Ortalama OOS Expectancy ${fmtR(wf.avgOosExpectancy, 3)} · Pencere ${wf.accepted ?? 0}/${Number(wf.accepted || 0) + Number(wf.rejected || 0)}`,
    recommendation: wf.recommendation || 'Doğrulama kaydı mevcut.'
  };
}

function ruleStatusTag(rule) {
  const status = rule.active ? 'AKTİF' : (rule.status || 'Shadow Test');
  const tone = rule.active ? 'green' : wfTone(rule);
  return tag(status, tone);
}

function isRealizedJournalRow(row = {}) {
  const hasNet = row.netR !== null && row.netR !== undefined && row.netR !== '' && Number.isFinite(Number(row.netR));
  const finalText = String(row.finalR || '').trim();
  return hasNet || /^[-+]?\d/.test(finalText);
}

function forwardEvidenceForRule(rule = {}, rows = loadSignalJournal()) {
  const list = Array.isArray(rows) ? rows : [];
  const ruleName = String(rule.name || '').trim();
  const ruleId = String(rule.id || '').trim();
  const matches = list.filter(row => {
    const rowRuleId = String(row.ruleSetId || row.ruleId || '').trim();
    const rowRuleName = String(row.ruleSetName || '').trim();
    return (ruleId && rowRuleId === ruleId) || (ruleName && rowRuleName === ruleName);
  });
  const realized = matches.filter(isRealizedJournalRow);
  const rValues = realized.map(parseJournalR);
  const netR = rValues.reduce((sum, value) => sum + value, 0);
  const wins = rValues.filter(v => v > 0).length;
  const losses = rValues.filter(v => v < 0).length;
  const grossWin = rValues.filter(v => v > 0).reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(rValues.filter(v => v < 0).reduce((sum, value) => sum + value, 0));
  const avgR = realized.length ? netR / realized.length : 0;
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? grossWin : 0);
  const strategyOk = matches.filter(r => String(r.strategyLabel || '').toUpperCase().includes('UYGUN')).length;
  let label = 'FORWARD VERİ YOK';
  let tone = 'gray';
  let note = 'Sinyal Günlüğü’nde bu kural setine bağlı canlı kayıt yok.';
  if (matches.length && realized.length < 5) {
    label = 'İZLEMEDE'; tone = 'yellow'; note = `${realized.length} sonuçlandı; karar için örnek az.`;
  } else if (realized.length >= 5 && avgR > 0.12 && pf >= 1.20) {
    label = 'FORWARD OLUMLU'; tone = 'green'; note = 'Canlı kayıtlar pozitif expectancy gösteriyor.';
  } else if (realized.length >= 5 && avgR >= 0 && pf >= 1.0) {
    label = 'İZLEMEDE'; tone = 'yellow'; note = 'Canlı sonuçlar nötr/pozitif; örnek büyüdükçe karar güçlenir.';
  } else if (realized.length >= 5) {
    label = 'FORWARD ZAYIF'; tone = 'red'; note = 'Canlı kayıtlar negatif/zayıf sonuç gösteriyor.';
  }
  return { matches, realized, total: matches.length, count: realized.length, netR, avgR, pf, wins, losses, strategyOk, label, tone, note };
}

function forwardCell(rule = {}, journalRows = []) {
  const f = forwardEvidenceForRule(rule, journalRows);
  return el('div', {},
    tag(f.label, f.tone),
    el('div', { class: 'tiny muted mt-3' }, f.count ? `${fmtR(f.netR)} · Exp ${fmtR(f.avgR, 3)} · PF ${fmt(f.pf, 2)}` : 'Kayıt yok'),
    el('div', { class: 'tiny muted mt-2' }, f.total ? `${f.count}/${f.total} sonuçlandı · ${f.strategyOk} strateji uyumlu` : 'Sinyal Günlüğü bekleniyor')
  );
}

function ruleRow(rule, refresh, journalRows = []) {
  const m = rule.metrics || {};
  const wf = rule.walkForward || {};
  const tr = el('tr', {},
    el('td', {},
      el('div', { class: 'bold' }, rule.name),
      el('div', { class: 'tiny muted' }, `${rule.setup} · ${rule.regime}`)
    ),
    el('td', {}, ruleStatusTag(rule)),
    el('td', { class: 'mono bold' }, fmt(m.stability) + '/100'),
    el('td', { class: 'mono ' + (m.expectancy > 0 ? 'pos' : 'neg') }, (m.expectancy >= 0 ? '+' : '') + fmt(m.expectancy, 3) + 'R'),
    el('td', { class: 'mono' }, fmt(m.pf, 2)),
    el('td', { class: 'mono neg' }, fmt(m.maxDD, 1) + 'R'),
    el('td', {},
      el('div', { class: 'small ' + (wf.validatedAt ? 'cyan' : 'muted') }, wfLabel(rule)),
      el('div', { class: 'tiny muted mt-2' }, wf.validatedAt ? `Son WF: ${fmtDate(wf.validatedAt)}` : 'OOS kaydı yok')
    ),
    el('td', {}, forwardCell(rule, journalRows)),
    el('td', { class: 'small muted' }, m.verdict),
    el('td', {}, el('div', { class: 'flex gap-6' },
      el('button', { class: 'btn tiny primary', on: { click: () => { activateRuleSet(rule.id); refresh(); } } }, 'AKTİF'),
      el('button', { class: 'btn tiny', on: { click: () => { updateRuleSet(rule.id, { status: 'Shadow Test' }); refresh(); } } }, 'SHADOW'),
      el('a', { class: 'btn tiny', href: '#/walkforward', on: { click: () => { try { localStorage.setItem('rux.selectedRuleSetId', rule.id); } catch {} } } }, 'WF'),
      el('button', { class: 'btn tiny danger', on: { click: () => { deleteRuleSet(rule.id); refresh(); } } }, 'SİL')
    ))
  );
  return tr;
}

function weightBox(label, value) {
  return el('div', { class: 'rux-rule-metric' },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, String(value) + '%')
  );
}


function wfDetailBlock(rule = {}) {
  const wf = rule.walkForward || {};
  const s = wfSummary(rule);
  return el('div', { class: 'rux-wf-detail mt-12' },
    el('div', { class: 'flex between gap-8' },
      el('div', {},
        el('div', { class: 'tiny muted' }, 'WALK-FORWARD DOĞRULAMA'),
        el('div', { class: 'bold mt-2' }, s.label),
        el('div', { class: 'small muted mt-4' }, s.detail)
      ),
      tag(wf.validatedAt ? 'OOS KAYITLI' : 'WF YOK', wf.validatedAt ? wfTone(rule) : 'gray')
    ),
    el('div', { class: 'row cols-4 mt-10' },
      weightBox('OOS Net-R', wf.validatedAt ? fmtR(wf.totalOosR) : '—'),
      weightBox('OOS Exp.', wf.validatedAt ? fmtR(wf.avgOosExpectancy, 3) : '—'),
      weightBox('Stability', wf.avgStability ?? '—'),
      weightBox('Pencere', wf.validatedAt ? `${wf.accepted ?? 0}/${Number(wf.accepted || 0) + Number(wf.rejected || 0)}` : '—')
    ),
    el('div', { class: 'rux-note mt-10' }, s.recommendation),
    el('div', { class: 'flex gap-6 mt-10' },
      el('a', { class: 'btn tiny primary', href: '#/walkforward', on: { click: () => { try { localStorage.setItem('rux.selectedRuleSetId', rule.id); } catch {} } } }, 'WF EKRANINDA AÇ'),
      wf.validatedAt ? el('button', { class: 'btn tiny', on: { click: () => { updateRuleSet(rule.id, { walkForward: null, status: rule.active ? 'Aktif' : 'Shadow Test' }); location.hash = '#/kural-setleri'; setTimeout(() => location.reload(), 10); } } }, 'WF KAYDINI TEMİZLE') : el('span', { class: 'tiny muted' }, 'Doğrulama sonucu kaydedilince burada görünür.')
    )
  );
}


function forwardDetailBlock(rule = {}) {
  const f = forwardEvidenceForRule(rule);
  return el('div', { class: 'rux-wf-detail mt-12' },
    el('div', { class: 'flex between gap-8' },
      el('div', {},
        el('div', { class: 'tiny muted' }, 'FORWARD EVIDENCE / CANLI SİNYAL GÜNLÜĞÜ'),
        el('div', { class: 'bold mt-2' }, f.label),
        el('div', { class: 'small muted mt-4' }, f.note)
      ),
      tag(f.label, f.tone)
    ),
    el('div', { class: 'row cols-5 mt-10' },
      weightBox('Forward Net-R', f.count ? fmtR(f.netR) : '—'),
      weightBox('Forward Exp.', f.count ? fmtR(f.avgR, 3) : '—'),
      weightBox('Forward PF', f.count ? fmt(f.pf, 2) : '—'),
      weightBox('Sonuç', `${f.count}/${f.total}`),
      weightBox('Strateji Uyum', String(f.strategyOk))
    ),
    el('div', { class: 'flex gap-6 mt-10' },
      el('a', { class: 'btn tiny primary', href: '#/sinyal-gunlugu' }, 'SİNYAL GÜNLÜĞÜNE GİT'),
      el('span', { class: 'tiny muted' }, 'Bu blok yalnızca bu kural setiyle kaydedilmiş canlı sinyal kayıtlarını okur.')
    )
  );
}

function selectedDetail(rule) {
  if (!rule) return card({ title: 'SEÇİLİ KURAL', body: el('div', { class: 'muted' }, 'Kural seti yok.') });
  const w = rule.weights || {};
  const th = rule.thresholds || {};
  return card({
    title: 'AKTİF KURAL SETİ DETAYI',
    actions: [tag(rule.active ? 'AKTİF' : rule.status, rule.active ? 'green' : 'yellow')],
    body: el('div', {},
      el('div', { class: 'bold' }, rule.name),
      el('div', { class: 'small muted mt-3' }, `${rule.direction} · ${rule.setup} · ${rule.regime}`),
      el('div', { class: 'row cols-5 mt-12' },
        weightBox('Setup', w.setup ?? 0),
        weightBox('Rejim', w.regime ?? 0),
        weightBox('Teyit', w.confirmation ?? 0),
        weightBox('Execution', w.execution ?? 0),
        weightBox('RR', w.rr ?? 0)
      ),
      el('div', { class: 'row cols-4 mt-12' },
        weightBox('Min Final', th.minFinal ?? 0),
        weightBox('Min Veri', th.minDataConfidence ?? 0),
        weightBox('Max NoTrade', th.maxNoTrade ?? 0),
        weightBox('Min RR', th.minRR ?? 0)
      ),
      wfDetailBlock(rule),
      forwardDetailBlock(rule),
      el('div', { class: 'mt-12' }, checklist((rule.conditions || []).map(c => ({
        state: c.required ? 'ok' : 'warn',
        label: c.label,
        right: el('span', { class: 'mono' }, `${c.weight}`)
      })))),
      el('div', { class: 'rux-note mt-12' }, 'Bu kural seti otomatik emir açmaz; sinyal kalitesi ve backtest/forward-test doğrulaması için kullanılır.')
    )
  });
}

export async function renderKuralSetleri(host) {
  function refresh() { renderKuralSetleri(host); }
  const report = buildRuleBuilderReport();
  const journalRows = loadSignalJournal();
  host.innerHTML = '';

  host.appendChild(pageHead({
    title: 'KURAL SETLERİ',
    subtitle: 'Rule Builder strateji kuralları, shadow-test, Walk-forward ve canlı Forward Evidence görünürlüğü.',
    actions: [
      el('a', { class: 'btn', href: '#/strateji-uretici' }, ICN.cpu(13), 'STRATEJİ ÜRETİCİSİ'),
      el('button', { class: 'btn', on: { click: () => {
        const blob = new Blob([exportRuleSetsBlob()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: 'rux-rule-sets.json' });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 500);
      }}}, ICN.download(13), 'DIŞARI AKTAR'),
      el('button', { class: 'btn primary', on: { click: () => { addRuleSet('trendPullback'); refresh(); } } }, ICN.plus(13), 'YENİ SET')
    ]
  }));

  const wfApproved = report.sets.filter(s => String(s.status || '').includes('WF Shadow Onay')).length;
  const wfTracked = report.sets.filter(s => s.walkForward?.validatedAt).length;
  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'cyan', label: 'TOPLAM SET', value: String(report.total), sub: 'local kayıt' }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'AKTİF SET', value: report.active?.name || '—', sub: 'manual signal' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'yellow', label: 'SHADOW', value: String(report.shadowCount), sub: 'izlemede' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'WF ONAY', value: String(wfApproved), sub: `${wfTracked} set doğrulandı` }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'ORT. EXPECTANCY', value: (report.avgExpectancy >= 0 ? '+' : '') + report.avgExpectancy + 'R', sub: 'tahmini' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'EMİR', value: 'YOK', sub: 'otomatik kapalı' }));
  host.appendChild(stats);

  const tbl = el('table', { class: 'tbl' },
    el('thead', {}, el('tr', {},
      ['KURAL SETİ','DURUM','STABİLİTE','EXP.','PF','MAX DD','WF DURUM','FORWARD DURUMU','YORUM','İŞLEM'].map(h => el('th', {}, h))
    )),
    el('tbody', {}, ...report.sets.map(s => ruleRow(s, refresh, journalRows)))
  );

  host.appendChild(el('div', { class: 'section' },
    card({ title: 'KURAL SETİ LİSTESİ', body: el('div', { class: 'tbl-wrap' }, tbl) })
  ));

  host.appendChild(el('div', { class: 'section' }, selectedDetail(report.active || report.best)));
  host.appendChild(walkForwardHistoryPanel(report));
}

function walkForwardHistoryPanel(report) {
  const validated = report.sets.filter(s => s.walkForward?.validatedAt)
    .sort((a,b) => new Date(b.walkForward.validatedAt) - new Date(a.walkForward.validatedAt));
  if (!validated.length) {
    return card({
      title: 'WALK-FORWARD DOĞRULAMA GEÇMİŞİ',
      body: el('div', { class: 'rux-empty-note' },
        el('div', { class: 'bold' }, 'Henüz kayıtlı WF doğrulaması yok.'),
        el('div', { class: 'small muted mt-4' }, 'Walk-forward ekranında bir kural seti seçip “WF Sonucunu Kaydet” dediğinde sonuçlar burada listelenecek.')
      )
    });
  }
  const tbl = el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {},
      ['KURAL','WF STATÜ','OOS NET-R','OOS EXP.','STABILITY','PENCERE','TAVSİYE','TARİH'].map(h => el('th', {}, h))
    )),
    el('tbody', {}, ...validated.map(rule => {
      const wf = rule.walkForward || {};
      return el('tr', {},
        el('td', {}, el('div', { class: 'bold' }, rule.name), el('div', { class: 'tiny muted' }, `${rule.setup} · ${rule.direction}`)),
        el('td', {}, tag(rule.status || 'WF İzleme', wfTone(rule))),
        el('td', { class: 'mono ' + (Number(wf.totalOosR || 0) >= 0 ? 'pos' : 'neg') }, fmtR(wf.totalOosR)),
        el('td', { class: 'mono ' + (Number(wf.avgOosExpectancy || 0) >= 0 ? 'pos' : 'neg') }, fmtR(wf.avgOosExpectancy, 3)),
        el('td', { class: 'mono' }, wf.avgStability ?? '—'),
        el('td', { class: 'mono' }, `${wf.accepted ?? 0}/${Number(wf.accepted || 0) + Number(wf.rejected || 0)}`),
        el('td', { class: 'small muted' }, wf.recommendation || '—'),
        el('td', { class: 'mono small' }, fmtDate(wf.validatedAt))
      );
    }))
  );
  return card({ title: 'WALK-FORWARD DOĞRULAMA GEÇMİŞİ', body: el('div', { class: 'tbl-wrap' }, tbl) });
}
