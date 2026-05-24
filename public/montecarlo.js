/* RUx — Signal Replay & Trade Timeline Viewer */
import { el, State, fetchMarket } from './api.js?v=0.75.9-heatmap-premium-rework-20260524';
import { ICN, statCard, card, pageHead, tag } from './components.js?v=0.75.9-heatmap-premium-rework-20260524';
import { canvasLineChart, canvasBarChart } from './charts.js?v=0.75.9-heatmap-premium-rework-20260524';
import { makeMonteCarloStabilityReport } from './rux_monte_carlo.js?v=0.75.9-heatmap-premium-rework-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function cls(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function riskCls(n) { return Number(n || 0) <= 8 ? 'pos' : Number(n || 0) <= 15 ? 'warn' : 'neg'; }
function toneCls(tone) { return tone === 'green' ? 'pos' : tone === 'red' ? 'neg' : 'warn'; }
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, c = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + c }, v))));
  return box;
}
function tableFromBuckets(title, buckets, valueClassFn = null) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, title), el('th', { class: 'r' }, 'Frekans'))));
  const tb = el('tbody', {});
  buckets.forEach(b => tb.appendChild(el('tr', {},
    el('td', {}, b.label),
    el('td', { class: 'r mono ' + (valueClassFn ? valueClassFn(b) : '') }, String(b.value))
  )));
  tbl.appendChild(tb);
  return tbl;
}
function pathAverage(paths = []) {
  const maxLen = Math.max(0, ...paths.map(p => p.length));
  return Array.from({ length: maxLen }, (_, i) => {
    const vals = paths.map(p => Number(p[Math.min(i, p.length - 1)] || 0));
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });
}
function gateTable(gates = []) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Gate'), el('th', { class: 'r' }, 'Değer'), el('th', {}, 'Yorum'))));
  const tb = el('tbody', {});
  gates.forEach(g => tb.appendChild(el('tr', {},
    el('td', {}, g.ok ? tag('OK', 'green') : tag('UYARI', 'yellow'), ' ', g.label),
    el('td', { class: 'r mono ' + (g.ok ? 'pos' : 'warn') }, g.value),
    el('td', {}, g.note)
  )));
  tbl.appendChild(tb);
  return tbl;
}

export async function renderMontecarlo(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  host.appendChild(pageHead({
    title: 'MONTE CARLO / RISK-OF-RUIN PANELİ',
    subtitle: 'RUx v0.75.9-heatmap-premium-rework-20260524 aynı Net-R işlem dizisini 1000+ farklı sırayla karıştırır; drawdown dağılımı, ruin riski ve stability skorunu birlikte ölçer.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT','/USDT'), ' ', ICN.chev(10)),
      el('div', { class: 'select' }, tf, ' ', ICN.chev(10)),
      el('div', { class: 'select' }, '1000 simülasyon ', ICN.chev(10)),
      el('button', { class: 'btn primary', on: { click: () => renderMontecarlo(host) } }, ICN.play(12), 'MONTE CARLO ÇALIŞTIR'),
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'RUx v0.75.9-heatmap-premium-rework-20260524 Monte Carlo motoru çalışıyor…'));
  host.appendChild(loading);
  const market = await fetchMarket(symbol, tf, 640);
  const rep = makeMonteCarloStabilityReport({ marketData: market, symbol, tf, iterations: 1000, ruinThresholdR: -10 });
  loading.remove();
  const s = rep.summary;
  const st = rep.stability;
  const dd = rep.drawdown;
  const rb = rep.riskBand;

  const stats = el('div', { class: 'stat-row cols-8 section' });
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: rb.tone === 'green' ? 'green' : rb.tone === 'red' ? 'red' : 'yellow', label: 'DURUM', value: rb.label, sub: rb.status, subColor: toneCls(rb.tone) }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'MEDYAN SONUÇ', value: fmtR(s.medianFinalR), sub: `Ortalama ${fmtR(s.avgFinalR)}`, subColor: cls(s.medianFinalR) }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'P90 MAX DD', value: fmtR(dd.p90), sub: `Worst ${fmtR(dd.worst)}`, subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'P95 MAX DD', value: fmtR(dd.p95), sub: `Medyan DD ${fmtR(dd.median)}`, subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: 'red', label: 'RUIN RİSKİ', value: fmtPct(s.riskOfRuin), sub: `${fmtR(rep.ruinThresholdR, 0)} altına iniş`, subColor: riskCls(s.riskOfRuin) }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'POZİTİF BİTİRME', value: fmtPct(s.probabilityPositive), sub: 'Final Net-R > 0', subColor: s.probabilityPositive >= 60 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'blue', label: 'STABILITY', value: String(st.score), sub: `IS PF ${st.isPF} · OOS PF ${st.oosPF}`, subColor: st.score >= 0.8 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'purple', label: 'RİSK ÇARPANI', value: String(rep.riskRecommendation.multiplier), sub: `Öneri: %${rep.riskRecommendation.suggestedRisk}`, subColor: rep.riskRecommendation.multiplier >= 0.75 ? 'pos' : 'warn' }));
  host.appendChild(stats);

  host.appendChild(el('div', { class: 'rux-compact-note section' }, rep.note, ' Bu panel risk araştırmasıdır; otomatik pozisyon açmaz, otomatik risk büyütmez.'));

  const row = el('div', { class: 'row fr-2-1 section' });
  const curveCard = el('div', { class: 'card' });
  curveCard.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'MONTE CARLO EQUITY YOLLARI'),
    el('div', { class: 'flex gap-6' }, tag('1000x Bootstrap', 'cyan'), tag('Net-R', 'green'), tag('Risk-of-Ruin', 'red'))
  ));
  const curveHost = el('div', { class: 'chart-host tall mt-6' });
  curveCard.appendChild(curveHost);
  row.appendChild(curveCard);

  const distCard = el('div', { class: 'card' });
  distCard.appendChild(el('div', { class: 'card-title' }, 'FİNAL NET-R DAĞILIMI'));
  const distHost = el('div', { class: 'chart-host short mt-6', style: 'height:200px' });
  distCard.appendChild(distHost);
  distCard.appendChild(kvRows([
    ['P05 kötü senaryo', fmtR(s.p05FinalR), cls(s.p05FinalR)],
    ['P50 medyan', fmtR(s.medianFinalR), cls(s.medianFinalR)],
    ['P95 iyi senaryo', fmtR(s.p95FinalR), cls(s.p95FinalR)],
    ['Standart sapma', fmtR(s.stdFinalR), ''],
    ['OOS Expectancy', fmtR(st.oosExpectancy, 3), cls(st.oosExpectancy)],
  ]));
  row.appendChild(distCard);
  host.appendChild(row);

  setTimeout(() => {
    const avgPath = pathAverage(rep.samplePaths);
    const lines = rep.samplePaths.slice(0, 14).map((p, i) => ({ values: p, color: i % 2 ? '#334155' : '#475569', width: 1 }));
    lines.push({ values: avgPath, color: '#22d3ee', width: 2.4, fill: true });
    lines.push({ values: rep.stress.original.curve, color: '#10b981', width: 2 });
    canvasLineChart(curveHost, lines);
    canvasBarChart(distHost, rep.histogram.map(b => ({ label: b.label, value: b.value, color: b.label.includes('-') || b.label.includes('≤') ? '#ef4444' : '#10b981' })));
  }, 60);

  const row2 = el('div', { class: 'row cols-2 section' });
  row2.appendChild(card({ title: 'MONTE CARLO ÖZETİ', body: kvRows([
    ['Sembol / TF', `${rep.symbol} · ${rep.tf}`],
    ['Kaynak', rep.source],
    ['Simülasyon', String(rep.iterations)],
    ['İşlem örneklemi', String(rep.tradeCount)],
    ['P90 Max DD', fmtR(dd.p90), 'neg'],
    ['Risk of Ruin', fmtPct(s.riskOfRuin), riskCls(s.riskOfRuin)],
    ['Stability Score', String(st.score), st.score >= 0.8 ? 'pos' : 'warn'],
    ['Overfit Flag', st.overfitFlag ? 'Evet' : 'Hayır', st.overfitFlag ? 'warn' : 'pos'],
  ]) }));
  row2.appendChild(card({ title: 'DRAWDOWN DAĞILIMI', body: tableFromBuckets('Max DD Aralığı', rep.drawdownHistogram, b => b.label.includes('≤') || b.label.includes('-20') ? 'neg' : '') }));
  host.appendChild(row2);

  const row3 = el('div', { class: 'row cols-2 section' });
  const stress = el('table', { class: 'tbl tbl-compact' });
  stress.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Stres Senaryosu'), el('th', { class: 'r' }, 'Final R'), el('th', { class: 'r' }, 'Max DD'))));
  const tb = el('tbody', {});
  [
    ['Orijinal sıra', rep.stress.original],
    ['Kayıplar önce', rep.stress.worstFirst],
    ['Kazançlar önce', rep.stress.bestFirst],
  ].forEach(([name, x]) => tb.appendChild(el('tr', {}, el('td', {}, name), el('td', { class: 'r mono ' + cls(x.finalR) }, fmtR(x.finalR)), el('td', { class: 'r mono neg' }, fmtR(x.maxDD)))));
  stress.appendChild(tb);
  row3.appendChild(card({ title: 'İŞLEM SIRASI STRES TESTİ', body: stress }));
  row3.appendChild(card({ title: 'BASE BACKTEST REFERANSI', body: kvRows([
    ['Net-R', fmtR(rep.baseMetrics.netR), cls(rep.baseMetrics.netR)],
    ['Expectancy', fmtR(rep.baseMetrics.expectancy, 3), cls(rep.baseMetrics.expectancy)],
    ['Profit Factor', String(rep.baseMetrics.profitFactor), rep.baseMetrics.profitFactor >= 1.5 ? 'pos' : 'warn'],
    ['Win Rate', fmtPct(rep.baseMetrics.winRate)],
    ['Max DD', fmtR(rep.baseMetrics.maxDrawdownR), 'neg'],
    ['Max kayıp serisi', String(rep.baseMetrics.maxConsecutiveLosses)],
  ]) }));
  host.appendChild(row3);

  const row4 = el('div', { class: 'row cols-2 section' });
  row4.appendChild(card({ title: 'VALIDATION GATE’LERİ', body: gateTable(rep.gates) }));
  row4.appendChild(card({ title: 'RİSK ÖNERİSİ', body: el('div', {},
    el('p', { class: 'muted' }, rep.riskRecommendation.text),
    kvRows([
      ['Baz risk', `%${rep.riskRecommendation.baseRisk.toFixed(2)}`],
      ['Risk çarpanı', String(rep.riskRecommendation.multiplier), rep.riskRecommendation.multiplier >= 0.75 ? 'pos' : 'warn'],
      ['Önerilen manuel risk', `%${rep.riskRecommendation.suggestedRisk.toFixed(2)}`, rep.riskRecommendation.multiplier >= 0.75 ? 'pos' : 'warn'],
      ['WF önerisi', rep.walkForward.recommendation || 'İzleme'],
    ]),
    el('div', { class: 'mini-list mt-8' }, ...rep.riskRecommendation.reasons.map(r => el('div', { class: 'mini-item' }, el('span', { class: 'dot warn' }), r)))
  ) }));
  host.appendChild(row4);
}
