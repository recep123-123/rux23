/* RUx — Kontrollü Optimizer + Rule Set Link */
import { el, State, fetchMarket } from './api.js?v=0.75.5-liquidation-panel-live-20260524';
import { ICN, statCard, card, pageHead, ringGauge, progress, tag } from './components.js?v=0.75.5-liquidation-panel-live-20260524';
import { canvasHeatmap, canvasLineChart } from './charts.js?v=0.75.5-liquidation-panel-live-20260524';
import { makeRuxOptimizerReport } from './rux_core.js?v=0.75.5-liquidation-panel-live-20260524';
import { buildRuleBuilderReport, updateRuleSet } from './rux_rulebuilder.js?v=0.75.5-liquidation-panel-live-20260524';

function fmtR(n, d = 2) { const v = Number(n || 0); return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R'; }
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function cls(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function weightText(w = {}) { return `S${w.setup}/R${w.regime}/T${w.confirmation}/E${w.execution}/RR${w.rr}`; }
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, c = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + c }, v))));
  return box;
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

function optimizerRuleNote(rule, rep) {
  const th = rule?.thresholds || {};
  return el('div', { class: 'rux-rule-link-note section' },
    el('div', { class: 'bold cyan' }, 'Optimizer Kural Seti: ', rule?.name || 'Varsayılan RUx'),
    el('div', { class: 'small muted mt-4' },
      `Aktif ağırlık başlangıcı: ${weightText(rep.activeWeights)} · Min skor ${th.minFinal ?? '—'} · Min RR ${th.minRR ?? '—'} · Min veri güveni ${th.minDataConfidence ?? '—'}`
    ),
    el('div', { class: 'small muted mt-4' }, 'Optimizer adayları bu kural setinin eşiklerinden ve ağırlıklarından başlar; otomatik aktif edilmez, önce shadow / walk-forward doğrulaması gerekir.')
  );
}


function candidatesTable(candidates = []) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'Ağırlık Seti'), el('th', { class: 'r' }, 'Net-R'),
    el('th', { class: 'r' }, 'PF'), el('th', { class: 'r' }, 'Exp'), el('th', { class: 'r' }, 'DD'),
    el('th', { class: 'r' }, 'Robust'), el('th', { class: 'r' }, 'Karar')
  )));
  const tb = el('tbody', {});
  candidates.slice(0, 10).forEach((c, idx) => {
    const m = c.metrics;
    const safe = m.expectancy > 0 && m.profitFactor >= 1.1 && c.robustness >= 60;
    tb.appendChild(el('tr', { class: idx === 0 ? 'starred' : '' },
      el('td', { class: 'muted' }, String(idx + 1)),
      el('td', { class: 'mono small' }, weightText(c.weights)),
      el('td', { class: 'r mono ' + cls(m.netR) }, fmtR(m.netR)),
      el('td', { class: 'r mono' }, String(m.profitFactor)),
      el('td', { class: 'r mono ' + cls(m.expectancy) }, fmtR(m.expectancy, 3)),
      el('td', { class: 'r mono neg' }, fmtR(m.maxDrawdownR)),
      el('td', { class: 'r mono ' + (c.robustness >= 70 ? 'pos' : 'warn') }, String(c.robustness)),
      el('td', { class: 'r' }, el('span', { class: 'tag ' + (safe ? 'green' : 'yellow') }, safe ? 'Shadow' : 'İzle'))
    ));
  });
  tbl.appendChild(tb);
  return tbl;
}

export async function renderOptimizer(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const { rep: ruleReport, rule: activeRule } = getSelectedRuleSet();
  host.appendChild(pageHead({
    title: 'KONTROLLÜ OPTİMİZER',
    subtitle: 'Ağırlık/parametre adaylarını Net-R, expectancy, PF ve drawdown ile sıralar. Overfit riskini sınırlamak için dar aralıkta çalışır.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT','/USDT'), ' ', ICN.chev(10)),
      el('div', { class: 'select' }, tf, ' ', ICN.chev(10)),
      ruleSetSelect(activeRule, ruleReport.sets, () => renderOptimizer(host)),
      el('div', { class: 'select' }, 'Kısıtlı Grid ', ICN.chev(10)),
      el('button', { class: 'btn primary', on: { click: () => renderOptimizer(host) } }, ICN.play(12), 'OPTİMİZERİ ÇALIŞTIR'),
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'RUx Optimizer aday setleri test ediyor…'));
  host.appendChild(loading);
  const market = await fetchMarket(symbol, tf, 520);
  const rep = makeRuxOptimizerReport({ marketData: market, symbol, tf, ruleSet: activeRule });
  loading.remove();
  const best = rep.best;
  const bm = best.metrics;
  const active = rep.activeMetrics;
  const netDelta = Number(bm.netR || 0) - Number(active.netR || 0);
  const expDelta = Number(bm.expectancy || 0) - Number(active.expectancy || 0);

  host.appendChild(optimizerRuleNote(activeRule, rep));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'EN İYİ NET-R', value: fmtR(bm.netR), sub: fmtR(netDelta) + ' fark', subColor: cls(netDelta) }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'cyan', label: 'EN İYİ EXPECTANCY', value: fmtR(bm.expectancy, 3), sub: fmtR(expDelta, 3) + ' fark', subColor: cls(expDelta) }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'green', label: 'EN İYİ PF', value: String(bm.profitFactor), sub: bm.profitFactor >= 1.5 ? 'Güçlü' : 'İzlenmeli', subColor: bm.profitFactor >= 1.5 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'MAX DD', value: fmtR(bm.maxDrawdownR), sub: 'Best set drawdown', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'TEST EDİLEN SET', value: String(rep.testedCombinations), sub: 'Maks. 3 parametre sınırı' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: best.robustness >= 70 ? 'green' : 'yellow', label: 'ROBUSTNESS', value: String(best.robustness) + ' / 100', sub: best.robustness >= 70 ? 'Shadow adayı' : 'İzlenmeli', subColor: best.robustness >= 70 ? 'pos' : 'warn' }));
  host.appendChild(stats);

  host.appendChild(el('div', { class: 'rux-compact-note section' }, rep.warning, ' Başlangıçta aynı anda çok fazla eşik optimize edilmiyor; amaç güzel geçmiş sonucu değil, dayanıklı aday bulmak.'));

  const row = el('div', { class: 'row cols-2 section' });
  const hm = el('div', { class: 'card' });
  hm.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'EXPECTANCY ISI HARİTASI'), el('div', { class: 'flex gap-6' }, tag('Setup × Teyit', 'cyan'), tag('Net-R', 'green'))));
  const hmHost = el('div', { class: 'chart-host short mt-6', style: 'height:240px' });
  hm.appendChild(hmHost);
  row.appendChild(hm);
  row.appendChild(card({ title: 'TOP ADAY AĞIRLIK SETLERİ', body: candidatesTable(rep.candidates) }));
  host.appendChild(row);
  setTimeout(() => canvasHeatmap(hmHost, rep.heatmap.rows, { xLabels: rep.heatmap.xLabels }), 60);

  const row2 = el('div', { class: 'row cols-2 section' });
  const bestBox = el('div', {});
  bestBox.appendChild(el('div', { class: 'tiny muted' }, 'EN İYİ ADAY SET'));
  bestBox.appendChild(el('div', { class: 'mono bold cyan mt-4' }, weightText(best.weights)));
  bestBox.appendChild(el('div', { class: 'mt-10' }, progress(best.robustness, 100, best.robustness >= 70 ? 'green' : 'yellow')));
  bestBox.appendChild(kvRows([
    ['Net-R', fmtR(bm.netR), cls(bm.netR)],
    ['Expectancy', fmtR(bm.expectancy, 3), cls(bm.expectancy)],
    ['Profit Factor', String(bm.profitFactor), bm.profitFactor >= 1.5 ? 'pos' : 'warn'],
    ['Win Rate', fmtPct(bm.winRate), bm.winRate >= 50 ? 'pos' : 'warn'],
    ['Filled İşlem', String(bm.totalTrades)],
    ['Max Drawdown', fmtR(bm.maxDrawdownR), 'neg'],
  ]));
  bestBox.appendChild(el('div', { class: 'flex gap-8 mt-12' },
    el('button', { class: 'btn primary flex-1', style: 'justify-content:center', on: { click: () => {
      if (activeRule) {
        updateRuleSet(activeRule.id, { weights: best.weights, status: 'Shadow Test', notes: 'Optimizer önerisi kural setine shadow aday olarak işlendi.' });
        try { localStorage.setItem('rux.selectedRuleSetId', activeRule.id); } catch {}
        renderOptimizer(host);
      }
    }} }, 'SHADOW TESTE GÖNDER'),
    el('a', { class: 'btn flex-1', style: 'justify-content:center', href: '#/walkforward' }, 'WALK-FORWARD AÇ')
  ));
  row2.appendChild(card({ title: 'EN İYİ PARAMETRE / AĞIRLIK SETİ', body: bestBox }));

  const pol = el('div', {});
  pol.appendChild(kvRows([
    ['Kural Seti', activeRule?.name || 'Varsayılan RUx'],
    ['Aktif Set', weightText(rep.activeWeights)],
    ['Aktif Net-R', fmtR(active.netR), cls(active.netR)],
    ['Aktif PF', String(active.profitFactor)],
    ['Aktif Expectancy', fmtR(active.expectancy, 3), cls(active.expectancy)],
    ['Güvenli Aday', String(rep.safeCandidates.length)],
    ['Optimizasyon Sınırı', 'Maks. ' + rep.maxOptimizedParams + ' parametre'],
    ['Kaynak', rep.source],
  ]));
  pol.appendChild(el('div', { class: 'small muted mt-10' }, 'Optimizer çıktısı nihai karar değildir; Edge Kalibrasyon ve Walk-forward kapısından geçmeden aktif ağırlık yapılmaz.'));
  row2.appendChild(card({ title: 'KONTROL POLİTİKASI', body: pol }));
  host.appendChild(row2);

  const row3 = el('div', { class: 'row cols-2 section' });
  const eq = el('div', { class: 'card' });
  eq.appendChild(el('div', { class: 'card-title' }, 'AKTİF SET vs EN İYİ ADAY EQUITY'));
  const eqHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  eq.appendChild(eqHost);
  row3.appendChild(eq);

  const rb = el('div', { class: 'card flex center', style: 'flex-direction:column;gap:10px' });
  rb.appendChild(el('div', { class: 'card-title self-start', style: 'align-self:flex-start' }, 'ROBUSTNESS SKORU'));
  rb.appendChild(ringGauge({ value: Math.round(best.robustness || 0), color: best.robustness >= 70 ? '#10b981' : '#f59e0b', size: 130 }));
  rb.appendChild(el('div', { class: best.robustness >= 70 ? 'pos bold' : 'warn bold' }, best.robustness >= 70 ? 'SHADOW ADAYI' : 'İZLEMEDE'));
  rb.appendChild(kvRows([
    ['Overfit Riski', best.robustness >= 70 ? 'Kontrollü' : 'Orta'],
    ['Min. Örnek', bm.totalTrades >= 35 ? 'Yeterli' : 'Düşük', bm.totalTrades >= 35 ? 'pos' : 'warn'],
    ['DD Kontrol', Math.abs(bm.maxDrawdownR) <= Math.abs(active.maxDrawdownR) * 1.25 + 1 ? 'Geçti' : 'İzle', Math.abs(bm.maxDrawdownR) <= Math.abs(active.maxDrawdownR) * 1.25 + 1 ? 'pos' : 'warn'],
  ]));
  row3.appendChild(rb);
  host.appendChild(row3);
  setTimeout(() => {
    canvasLineChart(eqHost, [
      { values: active.equityCurve, color: '#10b981', width: 2, fill: true },
      { values: bm.equityCurve, color: '#22d3ee', width: 2, fill: false },
    ]);
  }, 80);
}
