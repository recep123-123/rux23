/* RUx — Rule Comparison & Optimization Paneli */
import { el, State, fetchMarket } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, tag, barbar } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { makeRuxBacktestSnapshot } from './rux_core.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { buildRuleComparisonReport, RULE_COMPARISON_CATEGORIES, ruleComparisonCategoryLabel } from './rux_rule_compare.js?v=0.75.10-heatmap-fidelity-pass-20260524';

function fmtR(n, d = 3) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function toneForDelta(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function safeCategory(value) {
  const v = String(value || '').toLowerCase();
  return RULE_COMPARISON_CATEGORIES.some(c => c.id === v) ? v : 'all';
}
function categoryActions(active) {
  return RULE_COMPARISON_CATEGORIES.map(c => el('a', { class: 'btn tiny ' + (c.id === active ? 'primary' : ''), href: '#/kural-karsilastirma?cat=' + c.id }, c.label));
}
function scoreCell(score) {
  const n = Number(score || 0);
  return el('div', { class: 'score-cell' }, el('div', { class: 'mono bold ' + (n >= 70 ? 'pos' : n < 45 ? 'neg' : '') }, String(Math.round(n))), barbar(n, 100, n >= 70 ? 'green' : n < 45 ? 'red' : 'yellow'));
}
function verdictTag(v = {}) { return tag(v.label || '—', v.tone || 'gray'); }
function emptyNote(text) { return el('div', { class: 'empty' }, text); }

function buildSummaryCards(report) {
  const base = report.baseline || {};
  const best = report.best;
  const worst = report.worst;
  const row = el('div', { class: 'stat-row cols-6' });
  row.appendChild(statCard({ icon: ICN.cpu(18), iconColor: 'cyan', label: 'PANEL', value: 'Rule Compare', sub: ruleComparisonCategoryLabel(report.category) }));
  row.appendChild(statCard({ icon: ICN.beaker(18), iconColor: 'cyan', label: 'REFERANS İŞLEM', value: String(base.count || 0), sub: `${report.sourceRows || 0} sinyal satırı` }));
  row.appendChild(statCard({ icon: ICN.scale(18), iconColor: base.expectancy >= 0 ? 'green' : 'red', label: 'BASE EXP', value: fmtR(base.expectancy), sub: `PF ${Number(base.profitFactor || 0).toFixed(2)}`, subColor: base.expectancy >= 0 ? 'pos' : 'neg' }));
  row.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: report.activation?.tone || 'yellow', label: 'AKTİVASYON', value: report.activation?.label || '—', sub: report.activation?.action || '—' }));
  row.appendChild(statCard({ icon: ICN.target(18), iconColor: best?.verdict?.tone || 'gray', label: 'EN İYİ KURAL', value: best ? String(best.score) : '—', sub: best ? best.model : 'Kayıt bekliyor' }));
  row.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'EN ZAYIF', value: worst ? String(worst.score) : '—', sub: worst ? worst.model : '—', subColor: worst ? 'neg' : '' }));
  return row;
}

function buildCandidateTable(report) {
  const rows = report.ranked || [];
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['Kategori','Kural Modeli','#','WR','Exp','PF','Net-R','Max DD','ΔExp','ΔNet-R','Skor','Karar','Aksiyon'].map((h, i) => el('th', { class: i >= 2 && i <= 10 ? 'r' : '' }, h))
  )));
  const body = el('tbody', {});
  rows.forEach(r => body.appendChild(el('tr', { class: r.samplePenalty ? 'muted' : '' },
    el('td', {}, tag(ruleComparisonCategoryLabel(r.category), r.category === 'no-trade' ? 'yellow' : r.category === 'risk-mode' ? 'cyan' : 'gray')),
    el('td', {}, el('div', { class: 'bold' }, r.model), el('div', { class: 'tiny muted mt-2' }, r.description || '—')),
    el('td', { class: 'r mono' }, String(r.summary.count || 0)),
    el('td', { class: 'r mono' }, fmtPct(r.summary.winRate)),
    el('td', { class: 'r mono bold ' + toneForDelta(r.summary.expectancy) }, fmtR(r.summary.expectancy)),
    el('td', { class: 'r mono ' + (Number(r.summary.profitFactor || 0) >= 1.2 ? 'pos' : Number(r.summary.profitFactor || 0) < 1 ? 'neg' : '') }, Number(r.summary.profitFactor || 0).toFixed(2)),
    el('td', { class: 'r mono ' + toneForDelta(r.summary.netR) }, fmtR(r.summary.netR, 2)),
    el('td', { class: 'r mono neg' }, fmtR(r.summary.maxDrawdownR, 2)),
    el('td', { class: 'r mono ' + toneForDelta(r.deltaExpectancy) }, fmtR(r.deltaExpectancy)),
    el('td', { class: 'r mono ' + toneForDelta(r.deltaNetR) }, fmtR(r.deltaNetR, 2)),
    el('td', { class: 'r' }, scoreCell(r.score)),
    el('td', {}, verdictTag(r.verdict)),
    el('td', { class: 'small muted' }, r.verdict?.action || '—')
  )));
  tbl.appendChild(body);
  return card({
    title: 'KURAL KARŞILAŞTIRMA TABLOSU',
    info: 'Aynı sinyal seti üzerinde kuralların net-R, expectancy, PF ve drawdown etkisi karşılaştırılır.',
    actions: [tag(`${rows.length} model`, rows.length ? 'cyan' : 'gray'), tag(`Min örnek ${report.minSample}`, 'yellow')],
    body: rows.length ? el('div', { class: 'tbl-wrap' }, tbl) : emptyNote('Bu kategoride karşılaştırılacak sonuç yok.')
  });
}

function buildBestWorst(report) {
  const best = (report.ranked || []).slice(0, 5);
  const worst = [...(report.ranked || [])].sort((a, b) => a.score - b.score).slice(0, 5);
  const miniTable = (rows, positive = true) => {
    const tbl = el('table', { class: 'tbl tbl-compact' });
    tbl.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'Model'), el('th', { class: 'r' }, 'Exp'), el('th', { class: 'r' }, 'PF'), el('th', { class: 'r' }, 'Skor'), el('th', {}, 'Karar')
    )));
    const body = el('tbody', {});
    rows.forEach(r => body.appendChild(el('tr', {},
      el('td', {}, el('div', { class: 'bold' }, r.model), el('div', { class: 'tiny muted' }, ruleComparisonCategoryLabel(r.category))),
      el('td', { class: 'r mono ' + toneForDelta(r.summary.expectancy) }, fmtR(r.summary.expectancy)),
      el('td', { class: 'r mono' }, Number(r.summary.profitFactor || 0).toFixed(2)),
      el('td', { class: 'r' }, scoreCell(r.score)),
      el('td', {}, verdictTag(r.verdict))
    )));
    tbl.appendChild(body);
    return rows.length ? el('div', { class: 'tbl-wrap' }, tbl) : emptyNote('Kayıt yok.');
  };
  const grid = el('div', { class: 'row cols-2 section' });
  grid.appendChild(card({ title: 'EN İYİ 5 KURAL ADAYI', actions: [tag('Challenger', 'green')], body: miniTable(best, true) }));
  grid.appendChild(card({ title: 'EN ZAYIF 5 KURAL', actions: [tag('Risk', 'red')], body: miniTable(worst, false) }));
  return grid;
}

function buildCategoryCards(report) {
  const grid = el('div', { class: 'row cols-3 section' });
  (report.categorySummary || []).forEach(c => {
    const b = c.best;
    grid.appendChild(card({
      title: c.label.toUpperCase(),
      actions: [tag(`${c.count} model`, 'gray')],
      body: el('div', {},
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'En iyi'), el('span', { class: 'v' }, b?.model || '—')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Skor'), el('span', { class: 'v mono ' + (c.avgScore >= 65 ? 'pos' : c.avgScore < 45 ? 'neg' : '') }, String(c.avgScore))),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Exp'), el('span', { class: 'v mono ' + toneForDelta(b?.summary?.expectancy) }, b ? fmtR(b.summary.expectancy) : '—')),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'PF'), el('span', { class: 'v mono' }, b ? Number(b.summary.profitFactor || 0).toFixed(2) : '—')),
        b ? el('div', { class: 'mt-8' }, verdictTag(b.verdict)) : null
      )
    }));
  });
  return grid;
}

function buildProtocolCard(report) {
  return card({
    title: 'AKTİVASYON PROTOKOLÜ',
    actions: [tag(report.activation?.label || '—', report.activation?.tone || 'gray')],
    body: el('div', {},
      el('div', { class: 'rux-note' }, 'Bu panel bir kuralı otomatik aktif etmez. İyi görünen aday önce OOS, walk-forward ve forward kayıtlarında dayanıklılık göstermeli. Yoksa optimizer yine geçmişe makyaj yapar; terminal değil, Hollywood fragmanı olur.'),
      el('div', { class: 'checklist mt-10' },
        el('div', { class: 'check ok' }, ICN.check(13), 'Minimum örnek sayısı sağlanmalı.'),
        el('div', { class: 'check ok' }, ICN.check(13), 'Expectancy ve PF baseline’dan anlamlı iyi olmalı.'),
        el('div', { class: 'check ok' }, ICN.check(13), 'Max drawdown kötüleşmemeli.'),
        el('div', { class: 'check ok' }, ICN.check(13), 'No-Trade hard block kuralları gevşetilmemeli.'),
        el('div', { class: 'check ok' }, ICN.check(13), 'Aday önce shadow challenger olarak izlenmeli.')
      )
    )
  });
}

export async function renderKuralKarsilastirma(host, params = {}) {
  const category = safeCategory(params.cat || (() => { try { return localStorage.getItem('rux.ruleCompareCategory'); } catch { return ''; } })());
  try { localStorage.setItem('rux.ruleCompareCategory', category); } catch {}
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'Rule Comparison & Optimization',
    subtitle: 'Break-even, time-stop, TP dağılımı, no-trade sertliği, confirmation ağırlığı ve risk modlarını aynı sinyal setinde karşılaştırır.',
    actions: categoryActions(category)
  }));
  host.appendChild(el('div', { class: 'empty' }, el('span', { class: 'loader' }), ' Kural karşılaştırmaları hesaplanıyor...'));

  const market = await fetchMarket(State.symbol, State.tf, 420).catch(() => null);
  const bt = makeRuxBacktestSnapshot({ marketData: market, symbol: State.symbol, tf: State.tf, fillModel: 'realistic' });
  const report = buildRuleComparisonReport({ rows: bt.metrics?.rows || [], category, minSample: 10 });

  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'Rule Comparison & Optimization',
    subtitle: `${State.symbol} · ${State.tf} · ${ruleComparisonCategoryLabel(category)} · Aynı sinyal seti, farklı kural sonuçları.`,
    actions: categoryActions(category)
  }));
  host.appendChild(buildSummaryCards(report));
  host.appendChild(buildBestWorst(report));
  host.appendChild(el('div', { class: 'section' }, buildCandidateTable(report)));
  host.appendChild(buildCategoryCards(report));
  const bottom = el('div', { class: 'row cols-2 section' });
  bottom.appendChild(buildProtocolCard(report));
  bottom.appendChild(card({
    title: 'REFERANS / BASELINE',
    actions: [tag('Realistic fill', 'cyan')],
    body: el('div', {},
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'İşlem'), el('span', { class: 'v mono' }, String(report.baseline.count || 0))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Win Rate'), el('span', { class: 'v mono' }, fmtPct(report.baseline.winRate))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Expectancy'), el('span', { class: 'v mono ' + toneForDelta(report.baseline.expectancy) }, fmtR(report.baseline.expectancy))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Profit Factor'), el('span', { class: 'v mono' }, Number(report.baseline.profitFactor || 0).toFixed(2))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Net-R'), el('span', { class: 'v mono ' + toneForDelta(report.baseline.netR) }, fmtR(report.baseline.netR, 2))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Max DD'), el('span', { class: 'v mono neg' }, fmtR(report.baseline.maxDrawdownR, 2))),
      el('div', { class: 'rux-note mt-10' }, report.note)
    )
  }));
  host.appendChild(bottom);
}
