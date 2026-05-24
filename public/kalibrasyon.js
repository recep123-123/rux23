/* RUx — Edge Kalibrasyon Paneli */
import { el, State, fetchMarket } from './api.js?v=0.75.7-liquidation-source-health-20260524';
import { ICN, statCard, card, pageHead, progress, tag } from './components.js?v=0.75.7-liquidation-source-health-20260524';
import { canvasLineChart, canvasBarChart } from './charts.js?v=0.75.7-liquidation-source-health-20260524';
import { makeEdgeCalibrationReport } from './rux_core.js?v=0.75.7-liquidation-source-health-20260524';
import { makeForwardBreakdownReport } from './rux_journal.js?v=0.75.7-liquidation-source-health-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function cls(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function weightLabel(w = {}) {
  return `Setup ${w.setup}% · Rejim ${w.regime}% · Teyit ${w.confirmation}% · Execution ${w.execution}% · RR ${w.rr}%`;
}
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, c = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + c }, v))));
  return box;
}
function gateRow(name, ok, value) {
  return el('div', { class: 'kv' },
    el('span', { class: 'k' }, name),
    el('span', { class: 'v mono ' + (ok ? 'pos' : 'warn') }, ok ? 'GEÇTİ' : 'İZLE', value ? ' · ' + value : '')
  );
}
function weightsTable(active, suggested, contrib) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Bileşen'), el('th', { class: 'r' }, 'Aktif'), el('th', { class: 'r' }, 'Öneri'), el('th', { class: 'r' }, 'Δ'), el('th', { class: 'r' }, 'Katkı')
  )));
  const tb = el('tbody', {});
  const names = { setup: 'Setup', regime: 'Rejim', confirmation: 'Teyit', execution: 'Execution', rr: 'Risk/RR' };
  ['setup','regime','confirmation','execution','rr'].forEach(k => {
    const d = Number(suggested[k] || 0) - Number(active[k] || 0);
    tb.appendChild(el('tr', {},
      el('td', {}, names[k]),
      el('td', { class: 'r mono' }, active[k] + '%'),
      el('td', { class: 'r mono cyan bold' }, suggested[k] + '%'),
      el('td', { class: 'r mono ' + cls(d) }, (d >= 0 ? '+' : '') + d + 'p'),
      el('td', { class: 'r mono ' + cls(contrib[k]) }, fmtR(contrib[k] || 0, 3))
    ));
  });
  tbl.appendChild(tb);
  return tbl;
}

export async function renderKalibrasyon(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  host.appendChild(pageHead({
    title: 'EDGE KALİBRASYONU',
    subtitle: 'Karar ağırlıklarını sinyal geçmişi, Net-R, OOS ve stability ile ölçer. Otomatik aktivasyon yapmaz.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT','/USDT'), ' ', ICN.chev(10)),
      el('div', { class: 'select' }, tf, ' ', ICN.chev(10)),
      el('button', { class: 'btn primary', on: { click: () => renderKalibrasyon(host) } }, ICN.play(12), 'KALİBRASYONU ÇALIŞTIR'),
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'RUx Edge Calibration motoru çalışıyor…'));
  host.appendChild(loading);
  const market = await fetchMarket(symbol, tf, 520);
  const rep = makeEdgeCalibrationReport({ marketData: market, symbol, tf });
  const forward = makeForwardBreakdownReport();
  loading.remove();

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: rep.activationGate.approved ? 'green' : 'yellow', label: 'KALİBRASYON DURUMU', value: rep.status, sub: rep.source, subColor: rep.activationGate.approved ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'green', label: 'CHAMPION PF', value: String(rep.champion.profitFactor), sub: fmtR(rep.champion.expectancy, 3) + ' expectancy', subColor: cls(rep.champion.expectancy) }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'CHALLENGER PF', value: String(rep.challenger.profitFactor), sub: fmtR(rep.challenger.expectancy, 3) + ' expectancy', subColor: cls(rep.challenger.expectancy) }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: rep.improvement.netR >= 0 ? 'green' : 'red', label: 'NET-R FARKI', value: fmtR(rep.improvement.netR), sub: 'Challenger - Champion', subColor: cls(rep.improvement.netR) }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'STABILITY', value: String(rep.stabilityScore), sub: rep.stabilityScore >= 0.8 ? 'Kabul edilebilir' : 'İzlenmeli', subColor: rep.stabilityScore >= 0.8 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'purple', label: 'ÖRNEKLEM', value: String(rep.challenger.totalTrades), sub: `${rep.challenger.totalSignals} sinyal`, subColor: rep.activationGate.sampleOk ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: forward.decision?.tone || 'yellow', label: 'FORWARD EVIDENCE', value: fmtR(forward.summary?.netR), sub: `${forward.summary?.realized || 0} sonuç · PF ${Number(forward.summary?.profitFactor || 0).toFixed(2)}`, subColor: Number(forward.summary?.avgR || 0) >= 0 ? 'pos' : 'neg' }));
  host.appendChild(stats);

  host.appendChild(el('div', { class: 'rux-compact-note section' }, rep.reason, ' Hard block kuralları ağırlık optimizasyonundan bağımsız kalır.'));

  host.appendChild(card({
    title: 'FORWARD EVIDENCE / SİNYAL GÜNLÜĞÜ KATKISI',
    actions: [tag(forward.decision?.label || 'KAYIT BEKLİYOR', forward.decision?.tone || 'gray'), el('a', { class: 'btn tiny', href: '#/sinyal-gunlugu' }, 'SİNYAL GÜNLÜĞÜ')],
    body: el('div', {},
      el('div', { class: 'row cols-5' },
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Forward Net-R'), el('div', { class: 'mono bold mt-2 ' + cls(forward.summary?.netR) }, fmtR(forward.summary?.netR))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Sonuçlanan'), el('div', { class: 'mono bold mt-2' }, String(forward.summary?.realized || 0))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Forward Exp.'), el('div', { class: 'mono bold mt-2 ' + cls(forward.summary?.avgR) }, fmtR(forward.summary?.avgR, 3))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Forward PF'), el('div', { class: 'mono bold mt-2' }, Number(forward.summary?.profitFactor || 0).toFixed(2))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Karar'), el('div', { class: 'bold mt-2' }, forward.decision?.label || '—'))
      ),
      el('div', { class: 'small muted mt-10' }, forward.decision?.note || 'Canlı Sinyal Günlüğü sonuçları kalibrasyon kararında ek kanıt olarak izlenir; otomatik ağırlık aktivasyonu yapmaz.')
    )
  }));

  const row = el('div', { class: 'row cols-2 section' });
  row.appendChild(card({ title: 'AĞIRLIK SETİ: CHAMPION → CHALLENGER', body: weightsTable(rep.activeWeights, rep.suggestedWeights, rep.contribution) }));

  const cmp = el('table', { class: 'tbl tbl-compact' });
  cmp.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Metrik'), el('th', { class: 'r' }, 'Champion'), el('th', { class: 'r' }, 'Challenger'), el('th', { class: 'r' }, 'Fark'))));
  const tb = el('tbody', {});
  [
    ['Expectancy', fmtR(rep.champion.expectancy, 3), fmtR(rep.challenger.expectancy, 3), fmtR(rep.improvement.expectancy, 3), rep.improvement.expectancy],
    ['Profit Factor', rep.champion.profitFactor, rep.challenger.profitFactor, (rep.improvement.pf >= 0 ? '+' : '') + rep.improvement.pf, rep.improvement.pf],
    ['Net-R', fmtR(rep.champion.netR), fmtR(rep.challenger.netR), fmtR(rep.improvement.netR), rep.improvement.netR],
    ['Max DD', fmtR(rep.champion.maxDrawdownR), fmtR(rep.challenger.maxDrawdownR), fmtR(rep.improvement.dd), -rep.improvement.dd],
    ['Filled İşlem', rep.champion.totalTrades, rep.challenger.totalTrades, rep.challenger.totalTrades - rep.champion.totalTrades, rep.challenger.totalTrades - rep.champion.totalTrades],
  ].forEach(r => tb.appendChild(el('tr', {}, el('td', {}, r[0]), el('td', { class: 'r mono' }, String(r[1])), el('td', { class: 'r mono' }, String(r[2])), el('td', { class: 'r mono ' + cls(r[4]) }, String(r[3])))));
  cmp.appendChild(tb);
  row.appendChild(card({ title: 'CHAMPION / CHALLENGER KARŞILAŞTIRMA', body: cmp }));
  host.appendChild(row);

  const row2 = el('div', { class: 'row cols-2 section' });
  const gate = el('div', {});
  gate.appendChild(gateRow('Minimum örnek', rep.activationGate.sampleOk, rep.challenger.totalTrades + ' filled'));
  gate.appendChild(gateRow('OOS expectancy', rep.activationGate.oosOk, fmtR(rep.walkForward.avgOosExpectancy, 3)));
  gate.appendChild(gateRow('Stability ≥ 0.80', rep.activationGate.stabilityOk, String(rep.stabilityScore)));
  gate.appendChild(gateRow('Drawdown kötüleşmedi', rep.activationGate.drawdownOk, fmtR(rep.challenger.maxDrawdownR)));
  gate.appendChild(gateRow('Tek adım ±5 sınırı', rep.activationGate.deltaOk));
  gate.appendChild(gateRow('Hard block bağımsız', rep.activationGate.hardBlockIndependent));
  if (rep.rejectedReasons.length) {
    gate.appendChild(el('div', { class: 'mt-10 small muted' }, 'Not: ', rep.rejectedReasons.slice(0, 3).join(' · ')));
  }
  row2.appendChild(card({ title: 'AKTİVASYON KAPISI', body: gate }));

  const wbox = el('div', {});
  wbox.appendChild(el('div', { class: 'tiny muted' }, 'AKTİF AĞIRLIK'));
  wbox.appendChild(el('div', { class: 'mono bold mt-4' }, weightLabel(rep.activeWeights)));
  wbox.appendChild(el('div', { class: 'tiny muted mt-10' }, 'ÖNERİLEN AĞIRLIK'));
  wbox.appendChild(el('div', { class: 'mono bold cyan mt-4' }, weightLabel(rep.suggestedWeights)));
  wbox.appendChild(el('div', { class: 'flex gap-8 mt-12' },
    el('button', { class: 'btn primary flex-1', style: 'justify-content:center' }, 'SHADOW MODE’A AL'),
    el('button', { class: 'btn flex-1', style: 'justify-content:center' }, 'REDDET / İZLE')
  ));
  wbox.appendChild(el('div', { class: 'small muted mt-8' }, 'Butonlar şimdilik karar kaydı için arayüz hazırlığıdır; gerçek aktivasyon otomatik yapılmaz.'));
  row2.appendChild(card({ title: 'EYLEM / POLİTİKA', body: wbox }));
  host.appendChild(row2);

  const row3 = el('div', { class: 'row cols-2 section' });
  const eq = el('div', { class: 'card' });
  eq.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'CHAMPION vs CHALLENGER EQUITY'), el('div', { class: 'flex gap-6' }, tag('Net-R', 'green'), tag('Shadow', 'cyan'))));
  const eqHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  eq.appendChild(eqHost);
  row3.appendChild(eq);

  const bars = el('div', { class: 'card' });
  bars.appendChild(el('div', { class: 'card-title' }, 'FEATURE KATKI DAĞILIMI'));
  const barHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  bars.appendChild(barHost);
  row3.appendChild(bars);
  host.appendChild(row3);

  setTimeout(() => {
    canvasLineChart(eqHost, [
      { values: rep.champion.equityCurve, color: '#10b981', width: 2, fill: true },
      { values: rep.challenger.equityCurve, color: '#22d3ee', width: 2, fill: false },
    ]);
    const data = Object.entries(rep.contribution).map(([k, v]) => ({ label: k.slice(0, 4), value: Number(v || 0), color: v >= 0 ? '#10b981' : '#ef4444' }));
    canvasBarChart(barHost, data);
  }, 60);
}
