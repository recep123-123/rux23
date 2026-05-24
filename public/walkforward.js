/* RUx — Out-of-Sample & Walk-forward Validation Panel */
import { el, State, fetchMarket } from './api.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { canvasLineChart, canvasHeatmap } from './charts.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { makeWalkForwardReport, makeRuxBacktestSnapshot } from './rux_core.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { buildRuleBuilderReport, updateRuleSet } from './rux_rulebuilder.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { makeForwardJournalReport, formatJournalR } from './rux_journal.js?v=0.75.11-heatmap-tf-recalibration-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 0) {
  return '%' + (Number(n || 0) * 100).toFixed(d);
}
function valClass(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function decisionTag(d) {
  const s = String(d || '').toUpperCase();
  const cls = s.includes('SHADOW') ? 'green' : s.includes('RED') ? 'red' : 'yellow';
  return el('span', { class: 'tag ' + cls }, d);
}
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, cls = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + cls }, v))));
  return box;
}

function gateTag(ok) {
  return el('span', { class: 'tag ' + (ok ? 'green' : 'red') }, ok ? 'GEÇTİ' : 'KALDI');
}
function stabilityTone(v) {
  const n = Number(v || 0);
  return n >= 0.8 ? 'pos' : n >= 0.6 ? 'warn' : 'neg';
}
function oosSplitPanel(backtest) {
  const v = backtest?.oosValidation || {};
  const is = v.is || {};
  const oos = v.oos || {};
  const gates = Array.isArray(v.gates) ? v.gates : [];
  const fill = backtest?.fillModels || {};
  const wrap = el('div', { class: 'section' });
  wrap.appendChild(el('div', { class: 'stat-row cols-6' },
    statCard({ icon: ICN.beaker(18), iconColor: 'cyan', label: 'IS EXPECTANCY', value: fmtR(is.expectancy, 3), sub: `IS PF ${Number(is.profitFactor || 0).toFixed(2)} · ${is.totalTrades || 0} işlem`, subColor: valClass(is.expectancy) }),
    statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'OOS EXPECTANCY', value: fmtR(oos.expectancy, 3), sub: `OOS PF ${Number(oos.profitFactor || 0).toFixed(2)} · ${oos.totalTrades || 0} işlem`, subColor: valClass(oos.expectancy) }),
    statCard({ icon: ICN.scale(18), iconColor: 'purple', label: 'STABILITY SCORE', value: String(v.stability ?? '—'), sub: 'OOS PF / IS PF', subColor: stabilityTone(v.stability) }),
    statCard({ icon: ICN.warning(18), iconColor: v.tone === 'green' ? 'green' : v.tone === 'red' ? 'red' : 'yellow', label: 'OOS VERDICT', value: v.verdict || '—', sub: `Overfit ${Number(v.overfitScore || 0).toFixed(1)}/100` }),
    statCard({ icon: ICN.dollar(18), iconColor: 'green', label: 'REALISTIC NET-R', value: fmtR(fill.realistic?.netR || 0), sub: `PF ${Number(fill.realistic?.pf || 0).toFixed(2)} · DD ${fmtR(fill.realistic?.maxDD || 0)}`, subColor: valClass(fill.realistic?.netR) }),
    statCard({ icon: ICN.warning(18), iconColor: Number(fill.conservative?.netR || 0) >= 0 ? 'green' : 'red', label: 'CONSERVATIVE NET-R', value: fmtR(fill.conservative?.netR || 0), sub: 'Fill robustness kapısı', subColor: valClass(fill.conservative?.netR) })
  ));
  const gateTable = el('table', { class: 'tbl tbl-compact mt-10' });
  gateTable.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Gate'), el('th', {}, 'Durum'), el('th', {}, 'Değer'), el('th', {}, 'Yorum')
  )));
  const tb = el('tbody', {});
  gates.forEach(g => tb.appendChild(el('tr', {},
    el('td', {}, g.label || 'Gate'),
    el('td', {}, gateTag(Boolean(g.ok))),
    el('td', { class: 'mono' }, g.value ?? '—'),
    el('td', { class: 'small muted' }, g.note || '')
  )));
  gateTable.appendChild(tb);
  wrap.appendChild(card({ title: 'IS / OOS SPLIT VALIDATION GATES', info: 'Kural seti önce IS dönemde geliştirilir; OOS dönemde dokunulmadan doğrulanır.', body: gateTable }));
  return wrap;
}



function getSelectedRuleSet() {
  const rep = buildRuleBuilderReport();
  const saved = (() => { try { return localStorage.getItem('rux.selectedRuleSetId'); } catch { return ''; } })();
  const rule = rep.sets.find(r => r.id === saved) || rep.active || rep.sets[0] || null;
  return { rep, rule };
}

function ruleSetSelect(rule, sets, rerender) {
  return el('select', { class: 'select rux-rule-select', value: rule?.id || '', on: { change: (ev) => {
    try { localStorage.setItem('rux.selectedRuleSetId', ev.target.value); } catch {}
    rerender();
  }}}, sets.map(r => el('option', { value: r.id, selected: r.id === rule?.id }, r.name)));
}

function weightText(w = {}) {
  return `Setup ${w.setup ?? '—'} · Rejim ${w.regime ?? '—'} · Teyit ${w.confirmation ?? '—'} · Giriş ${w.execution ?? '—'} · RR ${w.rr ?? '—'}`;
}

function wfRuleNote(rule, report, rerender) {
  const th = rule?.thresholds || {};
  const s = report?.summary || {};
  const canSave = rule && report && report.windows && report.windows.length;
  return el('div', { class: 'rux-rule-link-note section' },
    el('div', { class: 'flex between gap-12' },
      el('div', {},
        el('div', { class: 'bold cyan' }, 'Walk-forward Kural Seti: ', rule?.name || 'Varsayılan RUx'),
        el('div', { class: 'small muted mt-4' }, `${rule?.setup || 'Tüm setup'} · ${rule?.regime || 'Tüm rejimler'} · ${rule?.direction || 'Çift yön'} · Min skor ${th.minFinal ?? '—'} · Min RR ${th.minRR ?? '—'} · Max No-Trade ${th.maxNoTrade ?? '—'}`),
        el('div', { class: 'small muted mt-4' }, report ? `OOS Net-R ${fmtR(s.totalOosR)} · Ortalama OOS expectancy ${fmtR(s.avgOosExpectancy, 3)} · Stability ${s.avgStability ?? '—'} · Karar: ${s.recommendation}` : 'Kural seti görülmemiş dönemlerde doğrulanmak üzere hazır.')
      ),
      el('button', { class: 'btn primary', disabled: !canSave, on: { click: () => {
        if (!canSave) return;
        updateRuleSet(rule.id, {
          status: s.accepted >= Math.ceil(Math.max(1, s.windowCount || 1) * 0.6) && Number(s.avgOosExpectancy || 0) > 0 ? 'WF Shadow Onay' : 'WF İzleme',
          walkForward: {
            validatedAt: new Date().toISOString(),
            symbol: report.symbol,
            tf: report.tf,
            totalOosR: s.totalOosR,
            avgOosExpectancy: s.avgOosExpectancy,
            avgStability: s.avgStability,
            accepted: s.accepted,
            rejected: s.rejected,
            recommendation: s.recommendation,
          },
          notes: 'Walk-forward sonucu kural setine işlendi. Otomatik aktivasyon yapılmadı.'
        });
        rerender();
      }}}, 'WF SONUCUNU KAYDET')
    ),
    el('div', { class: 'small muted mt-8' }, 'Bu kayıt yalnızca kural setinin doğrulama geçmişine işlenir; sistemi otomatik aktif etmez.')
  );
}

export async function renderWalkforward(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const { rep: ruleReport, rule: activeRule } = getSelectedRuleSet();
  host.appendChild(pageHead({
    title: 'OOS / WALK-FORWARD VALIDATION',
    subtitle: 'Backtest güzel görünüyor mu, yoksa geçmişe fazla mı uydurulmuş? IS/OOS split, rolling OOS ve stability score ile kontrol eder.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT', '/USDT'), ' ', ICN.chev(10)),
      el('div', { class: 'select' }, tf, ' ', ICN.chev(10)),
      ruleSetSelect(activeRule, ruleReport.sets, () => renderWalkforward(host)),
      el('div', { class: 'select' }, 'IS/OOS + 6 WF ', ICN.chev(10)),
      el('button', { class: 'btn primary', on: { click: () => renderWalkforward(host) } }, ICN.play(12), 'VALIDASYON ÇALIŞTIR'),
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'Walk-forward pencereleri hesaplanıyor…'));
  host.appendChild(loading);
  const market = await fetchMarket(symbol, tf, 620);
  const report = makeWalkForwardReport({ marketData: market, symbol, tf, windows: 6, ruleSet: activeRule });
  const backtest = makeRuxBacktestSnapshot({ marketData: market, symbol, tf, fillModel: 'realistic', ruleSet: activeRule });
  const s = report.summary;
  loading.remove();

  host.appendChild(wfRuleNote(activeRule, report, () => renderWalkforward(host)));
  host.appendChild(oosSplitPanel(backtest));


  const forwardJournal = makeForwardJournalReport();
  const fjs = forwardJournal.summary;
  const fjBox = el('div', { class: 'rux-rule-link-note section' },
    el('div', { class: 'flex between gap-12' },
      el('div', {},
        el('div', { class: 'bold cyan' }, 'Forward Test / Sinyal Günlüğü Bağlantısı'),
        el('div', { class: 'small muted mt-4' }, `Kayıt ${fjs.total} · Sonuçlanmış ${fjs.realized} · Net-R ${formatJournalR(fjs.netR)} · WR %${fjs.winRate.toFixed(1)} · PF ${fjs.profitFactor.toFixed(2)}`),
        el('div', { class: 'small muted mt-4' }, forwardJournal.note)
      ),
      el('a', { class: 'btn primary', href: '#/sinyal-gunlugu' }, ICN.table(12), 'SİNYAL GÜNLÜĞÜ')
    ),
    el('div', { class: 'row cols-4 mt-10' },
      el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Forward Net-R'), el('div', { class: 'mono bold mt-2 ' + (fjs.netR >= 0 ? 'pos' : 'neg') }, formatJournalR(fjs.netR))),
      el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Forward PF'), el('div', { class: 'mono bold mt-2' }, fjs.profitFactor.toFixed(2))),
      el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Forward DD'), el('div', { class: 'mono bold mt-2 neg' }, formatJournalR(fjs.maxDrawdownR))),
      el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Karar'), el('div', { class: 'mono bold mt-2' }, forwardJournal.verdict))
    )
  );
  host.appendChild(fjBox);

  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'OOS TOPLAM NET R', value: fmtR(s.totalOosR), sub: `${s.windowCount} pencere`, subColor: s.totalOosR >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'cyan', label: 'ORT. OOS EXPECTANCY', value: fmtR(s.avgOosExpectancy, 3), sub: 'Dokunulmamış test dönemi', subColor: s.avgOosExpectancy >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'green', label: 'STABILITY', value: String(s.avgStability), sub: 'OOS PF / IS PF', subColor: s.avgStability >= 0.8 ? 'pos' : s.avgStability >= 0.6 ? 'warn' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: s.overfitRisk === 'DÜŞÜK' ? 'green' : s.overfitRisk === 'ORTA' ? 'yellow' : 'red', label: 'OVERFIT RİSKİ', value: s.overfitRisk || '—', sub: `OOS işlem ${s.totalOosTrades || 0} · Pozitif pencere %${s.positiveWindowRatio || 0}` }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'ONAYLANAN', value: String(s.accepted), sub: 'Shadow / izleme' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'REDDEDİLEN', value: String(s.rejected), sub: 'OOS zayıf / overfit' }));
  stats.appendChild(statCard({ icon: ICN.cpu(18), iconColor: 'purple', label: 'ÖNERİ', value: s.accepted >= Math.ceil(Math.max(1, s.windowCount) * 0.6) ? 'SHADOW' : 'İZLE', sub: s.recommendation }));
  host.appendChild(stats);

  host.appendChild(el('div', { class: 'rux-compact-note section' },
    'Bu ekran otomatik aktivasyon yapmaz. Aday kural/ağırlık setleri önce in-sample geliştirilir, sonra out-of-sample dönemde dokunulmadan ölçülür. Stability < 0.60 ise sistem geçmişe fazla uyum riski taşır; 0.80+ shadow mode için daha sağlıklı kabul edilir.'
  ));

  const row = el('div', { class: 'row fr-2-1 section' });
  const curveCard = el('div', { class: 'card' });
  curveCard.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'ROLLING OOS EXPECTANCY'),
    el('div', { class: 'flex gap-6' }, el('span', { class: 'tag cyan' }, report.source), el('span', { class: 'tag green' }, report.ruleSet?.name || 'Varsayılan RUx'), el('span', { class: 'tag yellow' }, 'Aktivasyon yok'))
  ));
  const curveHost = el('div', { class: 'chart-host tall mt-6' });
  curveCard.appendChild(curveHost);
  row.appendChild(curveCard);

  const hmCard = el('div', { class: 'card' });
  hmCard.appendChild(el('div', { class: 'card-title' }, 'PENCERE ISI HARİTASI'));
  const hmHost = el('div', { class: 'chart-host short mt-6', style: 'height:240px' });
  hmCard.appendChild(hmHost);
  hmCard.appendChild(kvRows([
    ['IS → OOS', 'Beklenti bozulması izlenir'],
    ['Stability eşiği', '0.80 güçlü / 0.60 altı riskli'],
    ['Değişim limiti', 'Aynı anda max 3 parametre'],
  ]));
  row.appendChild(hmCard);
  host.appendChild(row);

  setTimeout(() => {
    const oosCurve = [];
    let acc = 0;
    report.windows.forEach(w => { acc += Number(w.oosNetR || 0); oosCurve.push(acc); });
    canvasLineChart(curveHost, [
      { values: oosCurve, color: '#22d3ee', width: 2, fill: true },
      { values: report.windows.map(w => Number(w.isExpectancy || 0) * 10), color: 'rgba(148,163,184,0.7)', width: 1.2 }
    ]);
    canvasHeatmap(hmHost, report.heatmap, { xLabels: ['IS Exp', 'OOS Exp', 'Stability', 'OOS R'] });
  }, 50);

  const table = el('table', { class: 'tbl tbl-compact' });
  table.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Pencere'),
    el('th', {}, 'Train'),
    el('th', {}, 'Test / OOS'),
    el('th', { class: 'r' }, 'IS Exp'),
    el('th', { class: 'r' }, 'OOS Exp'),
    el('th', { class: 'r' }, 'OOS PF'),
    el('th', { class: 'r' }, 'OOS R'),
    el('th', { class: 'r' }, 'Stability'),
    el('th', {}, 'Karar')
  )));
  const tb = el('tbody', {});
  report.windows.forEach(w => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'mono' }, w.id),
      el('td', { class: 'small' }, w.trainWindow),
      el('td', { class: 'small' }, w.testWindow),
      el('td', { class: 'r mono ' + valClass(w.isExpectancy) }, fmtR(w.isExpectancy, 3)),
      el('td', { class: 'r mono ' + valClass(w.oosExpectancy) }, fmtR(w.oosExpectancy, 3)),
      el('td', { class: 'r mono' }, w.oosPF),
      el('td', { class: 'r mono ' + valClass(w.oosNetR) }, fmtR(w.oosNetR)),
      el('td', { class: 'r mono ' + (w.stability >= 0.8 ? 'pos' : w.stability >= 0.6 ? 'warn' : 'neg') }, String(w.stability)),
      el('td', {}, decisionTag(w.decision))
    ));
  });
  table.appendChild(tb);
  host.appendChild(card({ title: 'ROLLING WALK-FORWARD PENCERE RAPORU', info: 'Her satırda train dönemi ile dokunulmamış OOS test dönemi ayrıdır.', body: table }));

  const protocol = el('div', { class: 'row cols-3 section' },
    card({ title: '1 · IN-SAMPLE', body: kvRows([['Amaç', 'Kural/eşik geliştirme'], ['Kullanım', 'Geliştirme seti'], ['Risk', 'Overfit']]) }),
    card({ title: '2 · OUT-OF-SAMPLE', body: kvRows([['Amaç', 'Görülmemiş dönem testi'], ['Şart', 'Pozitif expectancy'], ['Başarısızsa', 'Aktivasyon yok']]) }),
    card({ title: '3 · SHADOW MODE', body: kvRows([['Amaç', 'Canlı paper doğrulama'], ['Koşul', 'Stability ≥ 0.80'], ['Aktivasyon', 'Otomatik değil; sadece öneri']]) })
  );
  host.appendChild(protocol);
}
