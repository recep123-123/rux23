/* RUx — Strateji Karnesi / Strategy Scorecard */
import { el, State, fetchMarket } from './api.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { ICN, statCard, card, pageHead, tag, progress, checklist } from './components.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { canvasLineChart, canvasBarChart } from './charts.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { makeRuxBacktestSnapshot, makeRuxOptimizerReport, makeWalkForwardReport } from './rux_core.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { buildRuleBuilderReport, updateRuleSet } from './rux_rulebuilder.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { makeForwardBreakdownReport } from './rux_journal.js?v=0.75.12-heatmap-premium-visual-pass-20260524';

function fmt(n, d = 2) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}
function fmtR(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) {
  const x = Number(n);
  return Number.isFinite(x) ? '%' + x.toFixed(d) : '—';
}
function cls(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function tone(score) {
  const s = Number(score || 0);
  if (s >= 75) return 'green';
  if (s >= 58) return 'yellow';
  return 'red';
}
function decisionTone(text = '') {
  const s = String(text).toUpperCase();
  if (s.includes('ONAY') || s.includes('UYGUN') || s.includes('GÜÇLÜ')) return 'green';
  if (s.includes('RED') || s.includes('REVİZE') || s.includes('ZAYIF')) return 'red';
  return 'yellow';
}
function currentRuleSet() {
  const report = buildRuleBuilderReport();
  let selectedId = '';
  try { selectedId = localStorage.getItem('rux.selectedRuleSetId') || ''; } catch {}
  const selected = report.sets.find(s => s.id === selectedId) || report.active || report.best || report.sets[0] || null;
  return { report, selected };
}
function setSelected(id) {
  try { localStorage.setItem('rux.selectedRuleSetId', id); } catch {}
}
function scorecardGrade(bt, opt, wf, rule, forward) {
  const m = bt?.metrics || {};
  const active = opt?.activeMetrics || {};
  const best = opt?.best?.metrics || {};
  const wfs = wf?.summary || {};
  const ruleMetrics = rule?.metrics || {};
  const fwd = forward?.summary || {};
  const stabilityRaw = Number(ruleMetrics.stability || 0);
  const forwardRealized = Number(fwd.realized || 0);
  const backtestPart = Math.max(0, Math.min(100,
    44 + Math.max(-18, Number(m.expectancy || 0) * 65)
    + Math.max(-15, (Number(m.profitFactor || 1) - 1) * 24)
    + Math.max(-18, Number(m.maxDrawdownR || 0) * 1.15)
    + Math.min(12, Number(m.totalTrades || 0) * 0.18)
  ));
  const optimizerDelta = Number(best.expectancy || 0) - Number(active.expectancy || 0);
  const optimizerPart = Math.max(0, Math.min(100, 55 + optimizerDelta * 95 + (Number(opt?.safeCandidates?.length || 0) * 2.5)));
  const wfPart = Math.max(0, Math.min(100,
    40 + Number(wfs.avgOosExpectancy || 0) * 95
    + Number(wfs.avgStability || 0) * 22
    + (Number(wfs.accepted || 0) - Number(wfs.rejected || 0)) * 5
  ));
  const forwardPart = forwardRealized
    ? Math.max(0, Math.min(100,
      42 + Number(fwd.avgR || 0) * 120
      + (Number(fwd.profitFactor || 1) - 1) * 18
      + Math.min(12, forwardRealized * 0.8)
      + Math.max(-12, Number(fwd.maxDD || 0) * 1.2)
    ))
    : 55;
  const rulePart = Math.max(0, Math.min(100, stabilityRaw));
  const score = Math.round(backtestPart * 0.28 + optimizerPart * 0.16 + wfPart * 0.26 + rulePart * 0.14 + forwardPart * 0.16);
  let grade = 'C';
  if (score >= 88) grade = 'A+';
  else if (score >= 78) grade = 'A';
  else if (score >= 68) grade = 'B';
  else if (score >= 56) grade = 'C';
  else grade = 'D';
  let decision = 'İZLEME';
  if (score >= 78 && Number(wfs.avgOosExpectancy || 0) > 0 && Number(wfs.avgStability || 0) >= 0.65) decision = 'SHADOW ONAY ADAYI';
  else if (score >= 62 && Number(m.expectancy || 0) > 0) decision = 'İZLEME / KALİBRASYON';
  else decision = 'REVİZE ET';
  return { score, grade, decision, parts: { backtestPart, optimizerPart, wfPart, rulePart, forwardPart } };
}
function metricCell(label, value, sub = '', toneClass = '') {
  return el('div', { class: 'rux-score-metric ' + toneClass },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, value),
    sub ? el('div', { class: 'tiny muted mt-2' }, sub) : null
  );
}
function compactTable(headers, rows) {
  return el('div', { class: 'tbl-wrap' },
    el('table', { class: 'tbl tbl-compact' },
      el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))),
      el('tbody', {}, ...rows)
    )
  );
}
function selectRuleControl(selected, sets) {
  const sel = el('select', { class: 'select rux-score-select' },
    ...sets.map(s => el('option', { value: s.id, selected: s.id === selected?.id ? 'selected' : null }, s.name))
  );
  sel.addEventListener('change', () => {
    setSelected(sel.value);
    location.hash = '#/strateji-karnesi';
    setTimeout(() => location.reload(), 20);
  });
  return sel;
}
function headerCards(rule, bt, opt, wf, grade, forward) {
  const m = bt.metrics || {};
  const wfs = wf.summary || {};
  const best = opt.best?.metrics || {};
  const active = opt.activeMetrics || {};
  const optDelta = Number(best.expectancy || 0) - Number(active.expectancy || 0);
  const row = el('div', { class: 'stat-row cols-6 section' });
  row.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: tone(grade.score), label: 'KARNE NOTU', value: `${grade.grade} / ${grade.score}`, sub: grade.decision, subColor: decisionTone(grade.decision) === 'green' ? 'pos' : decisionTone(grade.decision) === 'red' ? 'neg' : 'warn' }));
  row.appendChild(statCard({ icon: ICN.beaker(18), iconColor: 'cyan', label: 'BACKTEST NET-R', value: fmtR(m.netR), sub: `Exp ${fmtR(m.expectancy, 3)} · PF ${fmt(m.profitFactor, 2)}` }));
  row.appendChild(statCard({ icon: ICN.swap(18), iconColor: 'green', label: 'WALK-FORWARD', value: fmtR(wfs.totalOosR), sub: `OOS Exp ${fmtR(wfs.avgOosExpectancy, 3)} · Stability ${fmt(wfs.avgStability, 2)}` }));
  row.appendChild(statCard({ icon: ICN.cpu(18), iconColor: optDelta >= 0 ? 'green' : 'red', label: 'OPTIMIZER FARKI', value: fmtR(optDelta, 3), sub: `${opt.safeCandidates?.length || 0} güvenli aday` }));
  row.appendChild(statCard({ icon: ICN.pulse(18), iconColor: forward?.decision?.tone || 'yellow', label: 'FORWARD EVIDENCE', value: fmtR(forward?.summary?.netR), sub: `${forward?.summary?.realized || 0} sonuç · PF ${fmt(forward?.summary?.profitFactor, 2)}` }));
  row.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'yellow', label: 'KURAL SETİ', value: rule?.name || '—', sub: `${rule?.setup || '—'} · ${rule?.direction || '—'}` }));
  return row;
}
function gradePanel(rule, bt, opt, wf, grade) {
  const p = grade.parts || {};
  return card({
    title: 'STRATEJİ KARNESİ ÖZETİ',
    actions: [tag(grade.decision, decisionTone(grade.decision)), tag('Otomatik Emir Yok', 'gray')],
    body: el('div', { class: 'rux-scorecard-grid' },
      el('div', { class: 'rux-grade-box ' + tone(grade.score) },
        el('div', { class: 'tiny muted' }, 'GENEL NOT'),
        el('div', { class: 'rux-grade-letter' }, grade.grade),
        el('div', { class: 'mono bold' }, grade.score + '/100'),
        el('div', { class: 'small muted mt-6' }, 'Backtest + Optimizer + Walk-forward + kural stabilitesi birleşik puanı')
      ),
      el('div', {},
        el('div', { class: 'row cols-4' },
          metricCell('Backtest Katkısı', fmt(p.backtestPart, 0) + '/100', 'Net-R, PF, DD, örnek sayısı'),
          metricCell('Optimizer Katkısı', fmt(p.optimizerPart, 0) + '/100', 'Aday ağırlık farkı'),
          metricCell('WF Katkısı', fmt(p.wfPart, 0) + '/100', 'OOS expectancy/stability'),
          metricCell('Forward Katkısı', fmt(p.forwardPart, 0) + '/100', 'Canlı Sinyal Günlüğü'),
          metricCell('Kural Katkısı', fmt(p.rulePart, 0) + '/100', 'Rule Builder stabilitesi')
        ),
        el('div', { class: 'mt-12' },
          progress(grade.score, 100, tone(grade.score))
        ),
        el('div', { class: 'rux-note mt-12' },
          'Karne sonucu otomatik aktivasyon değildir. Canlıya alma kararı için önce shadow izleme, OOS doğrulama ve manuel değerlendirme gerekir.'
        )
      )
    )
  });
}
function evidencePanel(bt, opt, wf, rule, forward) {
  const m = bt.metrics || {};
  const best = opt.best?.metrics || {};
  const active = opt.activeMetrics || {};
  const wfs = wf.summary || {};
  const items = [
    {
      state: Number(m.expectancy || 0) > 0 ? 'ok' : 'warn',
      label: 'Backtest expectancy pozitif mi?',
      right: el('span', { class: 'mono ' + cls(m.expectancy) }, fmtR(m.expectancy, 3))
    },
    {
      state: Number(m.profitFactor || 0) >= 1.2 ? 'ok' : 'warn',
      label: 'Profit Factor yeterli mi?',
      right: el('span', { class: 'mono' }, fmt(m.profitFactor, 2))
    },
    {
      state: Number(best.expectancy || 0) >= Number(active.expectancy || 0) ? 'ok' : 'warn',
      label: 'Optimizer aktif ağırlığı iyileştiriyor mu?',
      right: el('span', { class: 'mono ' + cls(Number(best.expectancy || 0)-Number(active.expectancy || 0)) }, fmtR(Number(best.expectancy || 0)-Number(active.expectancy || 0), 3))
    },
    {
      state: Number(wfs.avgOosExpectancy || 0) > 0 ? 'ok' : 'miss',
      label: 'Walk-forward OOS expectancy pozitif mi?',
      right: el('span', { class: 'mono ' + cls(wfs.avgOosExpectancy) }, fmtR(wfs.avgOosExpectancy, 3))
    },
    {
      state: Number(wfs.avgStability || 0) >= 0.8 ? 'ok' : Number(wfs.avgStability || 0) >= 0.6 ? 'warn' : 'miss',
      label: 'Walk-forward stability yeterli mi?',
      right: el('span', { class: 'mono' }, fmt(wfs.avgStability, 2))
    },
    {
      state: rule?.walkForward?.validatedAt ? 'ok' : 'warn',
      label: 'Kural setinde kaydedilmiş WF doğrulaması var mı?',
      right: el('span', { class: 'mono' }, rule?.walkForward?.validatedAt ? 'Var' : 'Yok')
    },
    {
      state: Number(forward?.summary?.realized || 0) >= 8 ? (Number(forward?.summary?.avgR || 0) >= 0 ? 'ok' : 'miss') : 'warn',
      label: 'Canlı Sinyal Günlüğü forward evidence yeterli mi?',
      right: el('span', { class: 'mono ' + cls(forward?.summary?.avgR) }, `${forward?.summary?.realized || 0} sonuç · ${fmtR(forward?.summary?.avgR, 3)}`)
    }
  ];
  return card({ title: 'KARAR KANITLARI', body: checklist(items) });
}
function backtestPanel(bt) {
  const m = bt.metrics || {};
  const rows = [
    ['İşlem', String(m.totalTrades || 0), 'Toplam teorik fill'],
    ['Win Rate', fmtPct(m.winRate), 'Kazanan sinyal oranı'],
    ['Expectancy', fmtR(m.expectancy, 3), 'Ortalama Net-R'],
    ['Max DD', fmtR(m.maxDrawdownR), 'Tepe-dip R düşüşü'],
    ['Ardışık kayıp', String(m.maxConsecutiveLosses || 0), 'Psikolojik dayanıklılık']
  ];
  const chartHost = el('div', { class: 'chart-host short mt-12', style: 'height:150px' });
  setTimeout(() => {
    try {
      canvasLineChart(chartHost, [
        { values: (m.equityCurve || []).map(v => Number(v || 0)), color: '#10b981', width: 2, fill: true }
      ], { height: 150 });
    } catch (e) {
      chartHost.innerHTML = '<div class="empty small">Equity grafiği çizilemedi.</div>';
    }
  }, 60);
  return card({
    title: 'BACKTEST KARNESİ',
    actions: [tag(bt.source || 'kaynak', bt.source === 'demo-fallback' ? 'yellow' : 'green')],
    body: el('div', {},
      el('div', { class: 'row cols-5' }, ...rows.map(r => metricCell(r[0], r[1], r[2], r[1].startsWith('-') ? 'neg' : ''))),
      chartHost
    )
  });
}
function optimizerPanel(opt) {
  const best = opt.best || {};
  const active = opt.activeMetrics || {};
  const rows = [
    el('tr', {}, el('td', {}, 'Aktif'), el('td', { class: 'mono' }, fmtR(active.expectancy, 3)), el('td', { class: 'mono' }, fmt(active.profitFactor, 2)), el('td', { class: 'mono ' + cls(active.netR) }, fmtR(active.netR)), el('td', { class: 'mono neg' }, fmtR(active.maxDrawdownR))),
    el('tr', {}, el('td', {}, 'En iyi aday'), el('td', { class: 'mono' }, fmtR(best.metrics?.expectancy, 3)), el('td', { class: 'mono' }, fmt(best.metrics?.profitFactor, 2)), el('td', { class: 'mono ' + cls(best.metrics?.netR) }, fmtR(best.metrics?.netR)), el('td', { class: 'mono neg' }, fmtR(best.metrics?.maxDrawdownR)))
  ];
  return card({
    title: 'OPTIMIZER KARNESİ',
    actions: [tag(`${opt.testedCombinations || 0} kombinasyon`, 'gray'), tag(`${opt.safeCandidates?.length || 0} güvenli aday`, opt.safeCandidates?.length ? 'green' : 'yellow')],
    body: el('div', {},
      compactTable(['Set','Exp.','PF','Net-R','Max DD'], rows),
      el('div', { class: 'rux-note mt-12' }, 'Optimizer sonucu doğrudan aktif edilmez; önce Shadow ve Walk-forward doğrulaması gerekir.')
    )
  });
}
function walkforwardPanel(wf) {
  const s = wf.summary || {};
  const rows = (wf.windows || []).slice(0, 8).map(w => el('tr', {},
    el('td', { class: 'mono small' }, w.id),
    el('td', { class: 'mono ' + cls(w.oosExpectancy) }, fmtR(w.oosExpectancy, 3)),
    el('td', { class: 'mono' }, fmt(w.oosPF, 2)),
    el('td', { class: 'mono ' + cls(w.oosNetR) }, fmtR(w.oosNetR)),
    el('td', { class: 'mono' }, fmt(w.stability, 2)),
    el('td', {}, tag(w.decision, decisionTone(w.decision)))
  ));
  return card({
    title: 'WALK-FORWARD KARNESİ',
    actions: [tag(s.recommendation || '—', decisionTone(s.recommendation))],
    body: el('div', {},
      el('div', { class: 'row cols-4' },
        metricCell('OOS Net-R', fmtR(s.totalOosR), 'Tüm pencere toplamı', cls(s.totalOosR)),
        metricCell('OOS Exp.', fmtR(s.avgOosExpectancy, 3), 'Ortalama OOS expectancy'),
        metricCell('Stability', fmt(s.avgStability, 2), 'OOS/IS dayanıklılık'),
        metricCell('Pencere', `${s.accepted || 0}/${s.windowCount || 0}`, 'Onay / toplam')
      ),
      compactTable(['WF','OOS Exp.','OOS PF','OOS Net-R','Stability','Karar'], rows)
    )
  });
}
function setupPerformancePanel(bt) {
  const m = bt.metrics || {};
  const perf = m.setupPerformance || [];
  if (!perf.length) return card({ title: 'SETUP PERFORMANSI', body: el('div', { class: 'muted' }, 'Setup performansı için yeterli işlem yok.') });
  return card({
    title: 'SETUP PERFORMANSI',
    body: compactTable(
      ['Setup','İşlem','Win %','Exp.','PF','Net-R'],
      perf.slice(0, 8).map(p => el('tr', {},
        el('td', {}, p.setup),
        el('td', { class: 'mono' }, String(p.count)),
        el('td', { class: 'mono' }, fmtPct(p.winRate)),
        el('td', { class: 'mono ' + cls(p.expectancy) }, fmtR(p.expectancy, 2)),
        el('td', { class: 'mono' }, fmt(p.pf, 2)),
        el('td', { class: 'mono ' + cls(p.netR) }, fmtR(p.netR))
      ))
    )
  });
}

function forwardEvidencePanel(forward) {
  const s = forward?.summary || {};
  const rows = [
    ['Kayıt', String(s.total || 0), 'Toplam Sinyal Günlüğü kaydı'],
    ['Sonuçlanan', String(s.realized || 0), 'Net-R oluşmuş canlı sinyal'],
    ['Forward Net-R', fmtR(s.netR), 'Canlı sonuç toplamı'],
    ['Forward Exp.', fmtR(s.avgR, 3), 'Ortalama canlı R'],
    ['Forward PF', fmt(s.profitFactor, 2), 'Gross win / gross loss'],
    ['Max DD', fmtR(s.maxDD), 'Forward equity düşüşü']
  ];
  const setupRows = (forward?.bySetup || []).slice(0, 5).map(x => el('tr', {},
    el('td', {}, x.name),
    el('td', { class: 'mono' }, String(x.count)),
    el('td', { class: 'mono ' + cls(x.netR) }, fmtR(x.netR)),
    el('td', { class: 'mono ' + cls(x.avgR) }, fmtR(x.avgR, 3)),
    el('td', { class: 'mono' }, fmt(x.profitFactor, 2))
  ));
  return card({
    title: 'FORWARD EVIDENCE / CANLI SİNYAL GÜNLÜĞÜ',
    actions: [tag(forward?.decision?.label || 'KAYIT BEKLİYOR', forward?.decision?.tone || 'gray'), el('a', { class: 'btn tiny', href: '#/sinyal-gunlugu' }, 'SİNYAL GÜNLÜĞÜ')],
    body: el('div', {},
      el('div', { class: 'row cols-6' }, ...rows.map(r => metricCell(r[0], r[1], r[2], String(r[1]).startsWith('-') ? 'neg' : ''))),
      el('div', { class: 'rux-note mt-12' }, forward?.decision?.note || 'Sinyal Günlüğü kayıtları strateji karnesine forward evidence olarak dahil edilir.'),
      setupRows.length ? compactTable(['Setup','İşlem','Net-R','Avg-R','PF'], setupRows) : el('div', { class: 'small muted mt-12' }, 'Forward setup ayrıştırması için sonuçlanmış Sinyal Günlüğü kaydı yok.')
    )
  });
}

function ruleSnapshotPanel(rule) {
  const th = rule.thresholds || {};
  const w = rule.weights || {};
  return card({
    title: 'KURAL SETİ SNAPSHOT',
    actions: [tag(rule.status || 'Shadow', rule.active ? 'green' : 'yellow')],
    body: el('div', {},
      el('div', { class: 'bold' }, rule.name),
      el('div', { class: 'small muted mt-3' }, `${rule.direction} · ${rule.setup} · ${rule.regime}`),
      el('div', { class: 'row cols-5 mt-12' },
        metricCell('Setup', String(w.setup ?? 0) + '%'),
        metricCell('Rejim', String(w.regime ?? 0) + '%'),
        metricCell('Teyit', String(w.confirmation ?? 0) + '%'),
        metricCell('Execution', String(w.execution ?? 0) + '%'),
        metricCell('RR', String(w.rr ?? 0) + '%')
      ),
      el('div', { class: 'row cols-5 mt-12' },
        metricCell('Min Final', String(th.minFinal ?? '—')),
        metricCell('Min RR', String(th.minRR ?? '—') + 'R'),
        metricCell('Min Veri', String(th.minDataConfidence ?? '—')),
        metricCell('Max NoTrade', String(th.maxNoTrade ?? '—')),
        metricCell('Max Manip.', String(th.maxManipulation ?? '—'))
      )
    )
  });
}
function saveScorecard(rule, grade, bt, opt, wf, forward) {
  if (!rule?.id) return;
  updateRuleSet(rule.id, {
    scorecard: {
      savedAt: new Date().toISOString(),
      grade: grade.grade,
      score: grade.score,
      decision: grade.decision,
      backtest: {
        netR: bt.metrics?.netR,
        expectancy: bt.metrics?.expectancy,
        pf: bt.metrics?.profitFactor,
        maxDD: bt.metrics?.maxDrawdownR,
        trades: bt.metrics?.totalTrades
      },
      optimizer: {
        bestExpectancy: opt.best?.metrics?.expectancy,
        activeExpectancy: opt.activeMetrics?.expectancy,
        safeCandidates: opt.safeCandidates?.length || 0
      },
      walkForward: wf.summary,
      forwardEvidence: {
        netR: forward?.summary?.netR,
        avgR: forward?.summary?.avgR,
        realized: forward?.summary?.realized,
        profitFactor: forward?.summary?.profitFactor,
        maxDD: forward?.summary?.maxDD,
        decision: forward?.decision?.label
      }
    }
  });
}

async function renderLoading(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'STRATEJİ KARNESİ',
    subtitle: 'Backtest, Optimizer ve Walk-forward sonuçlarını tek strateji değerlendirme ekranında birleştirir.',
    fav: true
  }));
  host.appendChild(card({ title: 'HESAPLANIYOR', body: el('div', { class: 'muted' }, 'RUx strateji karnesi için canlı/veri fallback hesapları çalışıyor...') }));
}

export async function renderStratejiKarnesi(host) {
  await renderLoading(host);
  const { report, selected } = currentRuleSet();
  const rule = selected;
  let marketData = null;
  try {
    marketData = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 520);
  } catch {}

  const bt = makeRuxBacktestSnapshot({ marketData, symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h', ruleSet: rule });
  const opt = makeRuxOptimizerReport({ marketData, symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h', ruleSet: rule });
  const wf = makeWalkForwardReport({ marketData, symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h', ruleSet: rule });
  const forward = makeForwardBreakdownReport();
  const grade = scorecardGrade(bt, opt, wf, rule, forward);

  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'STRATEJİ KARNESİ',
    subtitle: 'Backtest, Optimizer ve Walk-forward çıktıları tek karar panelinde birleşir. Otomatik emir açmaz.',
    fav: true,
    actions: [
      selectRuleControl(rule, report.sets),
      el('button', { class: 'btn primary', on: { click: () => { saveScorecard(rule, grade, bt, opt, wf, forward); alert('Strateji karnesi kural setine kaydedildi.'); } } }, ICN.save ? ICN.save(13) : ICN.check(13), 'KARNEYİ KAYDET'),
      el('a', { class: 'btn', href: '#/kural-setleri' }, ICN.list(13), 'KURAL SETLERİ')
    ]
  }));

  host.appendChild(headerCards(rule, bt, opt, wf, grade, forward));
  host.appendChild(el('div', { class: 'row fr-2-1 section' },
    gradePanel(rule, bt, opt, wf, grade),
    evidencePanel(bt, opt, wf, rule, forward)
  ));
  host.appendChild(el('div', { class: 'row cols-2 section' },
    backtestPanel(bt),
    walkforwardPanel(wf)
  ));
  host.appendChild(el('div', { class: 'section' }, forwardEvidencePanel(forward)));
  host.appendChild(el('div', { class: 'row cols-2 section' },
    optimizerPanel(opt),
    ruleSnapshotPanel(rule)
  ));
  host.appendChild(setupPerformancePanel(bt));
}
