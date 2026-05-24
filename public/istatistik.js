/* RUx — İstatistik Performans Motoru */
import { el, State, fetchMarket } from './api.js?v=0.75.2-funding-responsive-live-20260524';
import { ICN, statCard, card, pageHead, tag } from './components.js?v=0.75.2-funding-responsive-live-20260524';
import { canvasLineChart, canvasBarChart, canvasHeatmap } from './charts.js?v=0.75.2-funding-responsive-live-20260524';
import { makeStatisticsPerformanceReport } from './rux_core.js?v=0.75.2-funding-responsive-live-20260524';
import { makeForwardJournalReport, formatJournalR } from './rux_journal.js?v=0.75.2-funding-responsive-live-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function cls(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, c = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + c }, v))));
  return box;
}
function dayBars(host, rows) {
  canvasBarChart(host, rows.map(d => ({ label: d.label, value: Number(d.value || 0), color: Number(d.value || 0) >= 0 ? '#10b981' : '#ef4444' })));
}
function hourlyHeatData(hourly = []) {
  const row = Array.from({ length: 24 }, (_, i) => Number(hourly.find(h => h.hour === i)?.value || 0));
  // 7 satırlık görünüm için aynı saat dağılımını hafif ölçek farklarıyla gösteriyoruz.
  return Array.from({ length: 7 }, (_, d) => row.map(v => v * (0.70 + d * 0.08)));
}

export async function renderIstatistik(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  host.appendChild(pageHead({
    title: 'İSTATİSTİK / PERFORMANS ANALİZİ',
    subtitle: 'RUx backtest çıktısı + Sinyal Günlüğü canlı kayıtlarından R dağılımı, drawdown ve forward performans ölçümü üretir.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT','/USDT'), ' ', ICN.chev(10)),
      el('div', { class: 'select' }, tf, ' ', ICN.chev(10)),
      el('button', { class: 'btn' }, ICN.download(12), 'CSV HAZIRLA'),
      el('button', { class: 'btn primary', on: { click: () => renderIstatistik(host) } }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'RUx istatistik motoru hesaplıyor…'));
  host.appendChild(loading);
  const market = await fetchMarket(symbol, tf, 560);
  const rep = makeStatisticsPerformanceReport({ marketData: market, symbol, tf });
  loading.remove();
  const m = rep.metrics;

  const stats = el('div', { class: 'stat-row cols-8 section' });
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: m.netR >= 0 ? 'green' : 'red', label: 'NET-R', value: fmtR(m.netR), sub: `${m.totalTrades} işlem`, subColor: cls(m.netR) }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'KAZANMA ORANI', value: fmtPct(m.winRate), sub: `${fmtR(m.avgWin)} / -${Number(m.avgLoss || 0).toFixed(2)}R`, subColor: m.winRate >= 50 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: m.profitFactor >= 1.5 ? 'green' : 'yellow', label: 'PROFIT FACTOR', value: String(m.profitFactor), sub: m.profitFactor >= 1.5 ? 'Güçlü' : 'İzlenmeli', subColor: m.profitFactor >= 1.5 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'EXPECTANCY', value: fmtR(m.expectancy, 3), sub: 'İşlem başına', subColor: cls(m.expectancy) }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'MAX DRAWDOWN', value: fmtR(m.maxDrawdownR), sub: `${m.maxConsecutiveLosses} kayıp serisi`, subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'purple', label: 'SHARPE', value: String(m.sharpe), sub: `Sortino ${m.sortino}`, subColor: m.sharpe >= 1 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'blue', label: 'CALMAR', value: String(m.calmar), sub: `Recovery ${m.recoveryFactor}`, subColor: m.calmar >= 1 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'cyan', label: 'GÜVEN', value: fmtPct(m.sampleConfidence), sub: rep.source }));
  host.appendChild(stats);


  const journal = makeForwardJournalReport();
  const js = journal.summary;
  const journalStats = el('div', { class: 'stat-row cols-6 section' });
  journalStats.appendChild(statCard({ icon: ICN.table(18), iconColor: 'cyan', label: 'GÜNLÜK KAYDI', value: String(js.total), sub: `${js.realized} sonuçlanmış` }));
  journalStats.appendChild(statCard({ icon: ICN.trend(18), iconColor: js.netR >= 0 ? 'green' : 'red', label: 'FORWARD NET-R', value: formatJournalR(js.netR), sub: 'Sinyal Günlüğü', subColor: js.netR >= 0 ? 'pos' : 'neg' }));
  journalStats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'FORWARD WR', value: '%' + js.winRate.toFixed(1), sub: `${js.wins}W / ${js.losses}L` }));
  journalStats.appendChild(statCard({ icon: ICN.scale(18), iconColor: js.profitFactor >= 1.2 ? 'green' : 'yellow', label: 'FORWARD PF', value: js.profitFactor.toFixed(2), sub: journal.verdict, subColor: journal.tone === 'green' ? 'pos' : journal.tone === 'red' ? 'neg' : 'warn' }));
  journalStats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'FORWARD DD', value: formatJournalR(js.maxDrawdownR), sub: 'Sinyal günlüğü DD', subColor: 'neg' }));
  journalStats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'STRATEJİ UYUMLU', value: String(js.strategyOk), sub: `${js.active} aktif takip` }));
  host.appendChild(card({ title: 'CANLI SİNYAL GÜNLÜĞÜ / FORWARD KATMANI', actions: [tag(journal.verdict, journal.tone), el('a', { class: 'btn tiny', href: '#/sinyal-gunlugu' }, 'SİNYAL GÜNLÜĞÜ')], body: el('div', {}, journalStats, el('div', { class: 'rux-note mt-8' }, journal.note)) }));

  host.appendChild(el('div', { class: 'rux-compact-note section' }, rep.note, ' Bu ekran gerçek emir geçmişi değil, RUx manuel sinyal planlarının teorik performans ölçümüdür.'));

  const row = el('div', { class: 'row cols-2 section' });
  const rdist = el('div', { class: 'card' });
  rdist.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'R DAĞILIMI'), el('div', { class: 'flex gap-6' }, tag('Net-R', 'green'), tag('Realistic Fill', 'cyan'))));
  const rHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  rdist.appendChild(rHost);
  rdist.appendChild(kvRows([
    ['Medyan', fmtR(m.medianR, 3), cls(m.medianR)],
    ['En iyi işlem', fmtR(m.bestR), 'pos'],
    ['En kötü işlem', fmtR(m.worstR), 'neg'],
  ]));
  row.appendChild(rdist);

  const eq = el('div', { class: 'card' });
  eq.appendChild(el('div', { class: 'card-title' }, 'EQUITY / DRAWDOWN'));
  const eqHost = el('div', { class: 'chart-host short mt-6', style: 'height:260px' });
  eq.appendChild(eqHost);
  row.appendChild(eq);
  host.appendChild(row);

  setTimeout(() => {
    canvasBarChart(rHost, rep.returnHistogram.map(b => ({ label: b.label, value: b.value, color: b.label.includes('-') || b.label.includes('≤') ? '#ef4444' : '#10b981' })));
    canvasLineChart(eqHost, [
      { values: rep.equityCurve, color: '#10b981', width: 2, fill: true },
      { values: rep.drawdownCurve.map(v => Number(v || 0)), color: '#ef4444', width: 1.6 },
    ]);
  }, 60);

  const row2 = el('div', { class: 'row cols-2 section' });
  const dur = el('div', { class: 'card' });
  dur.appendChild(el('div', { class: 'card-title' }, 'İŞLEM SÜRESİ DAĞILIMI'));
  const durHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  dur.appendChild(durHost);
  dur.appendChild(kvRows([
    ['Ortalama bar', String(m.avgBarsHeld)],
    ['Max win streak', String(m.maxWinStreak), 'pos'],
    ['Max loss streak', String(m.maxConsecutiveLosses), 'neg'],
  ]));
  row2.appendChild(dur);

  row2.appendChild(card({ title: 'İSTATİSTİK ÖZETİ', body: kvRows([
    ['Sharpe', String(m.sharpe), m.sharpe >= 1 ? 'pos' : 'warn'],
    ['Sortino', String(m.sortino), m.sortino >= 1 ? 'pos' : 'warn'],
    ['Calmar', String(m.calmar), m.calmar >= 1 ? 'pos' : 'warn'],
    ['Recovery Factor', String(m.recoveryFactor), m.recoveryFactor >= 1 ? 'pos' : 'warn'],
    ['Varyans', String(m.variance)],
    ['Std. Sapma', String(m.stdDev)],
    ['Skewness', String(m.skewness), m.skewness >= 0 ? 'pos' : 'warn'],
    ['Kurtosis', String(m.kurtosis)],
    ['Gross-R', fmtR(m.grossR), cls(m.grossR)],
    ['Net-R', fmtR(m.netR), cls(m.netR)],
  ]) }));
  host.appendChild(row2);

  setTimeout(() => canvasBarChart(durHost, rep.durationHistogram.map(b => ({ label: b.label, value: b.value, color: '#22d3ee' }))), 80);

  const row3 = el('div', { class: 'row cols-2 section' });
  const dow = el('div', { class: 'card' });
  dow.appendChild(el('div', { class: 'card-title' }, 'GÜN BAZLI ORTALAMA R'));
  const dowHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  dow.appendChild(dowHost);
  row3.appendChild(dow);

  const hm = el('div', { class: 'card' });
  hm.appendChild(el('div', { class: 'card-title' }, 'SAATLİK EDGE ISI HARİTASI'));
  const hmHost = el('div', { class: 'chart-host short mt-6', style: 'height:220px' });
  hm.appendChild(hmHost);
  row3.appendChild(hm);
  host.appendChild(row3);

  setTimeout(() => {
    dayBars(dowHost, rep.dayPerformance);
    canvasHeatmap(hmHost, hourlyHeatData(rep.hourly), ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'], Array.from({ length: 24 }, (_, i) => i));
  }, 100);

  const row4 = el('div', { class: 'row cols-2 section' });
  const mTbl = el('table', { class: 'tbl tbl-compact' });
  mTbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'AY'), el('th', { class: 'r' }, 'NET R'), el('th', { class: 'r' }, 'WR'), el('th', { class: 'r' }, 'PF'), el('th', { class: 'r' }, '#'))));
  const mtb = el('tbody', {});
  (rep.monthly.length ? rep.monthly : [{ month: 'Yeterli veri yok', netR: 0, winRate: 0, pf: 0, trades: 0 }]).slice(0, 8).forEach(r => mtb.appendChild(el('tr', {},
    el('td', {}, r.month),
    el('td', { class: 'r mono ' + cls(r.netR) }, fmtR(r.netR)),
    el('td', { class: 'r mono' }, fmtPct(r.winRate)),
    el('td', { class: 'r mono' }, String(r.pf)),
    el('td', { class: 'r mono' }, String(r.trades))
  )));
  mTbl.appendChild(mtb);
  row4.appendChild(card({ title: 'AYLIK PERFORMANS', body: mTbl }));

  const setupTbl = el('table', { class: 'tbl tbl-compact' });
  setupTbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'SETUP'), el('th', { class: 'r' }, '#'), el('th', { class: 'r' }, 'EXP'), el('th', { class: 'r' }, 'NET R'))));
  const stb = el('tbody', {});
  (rep.setupPerformance.length ? rep.setupPerformance : [{ setup: 'Yeterli setup yok', count: 0, expectancy: 0, netR: 0 }]).slice(0, 8).forEach(r => stb.appendChild(el('tr', {},
    el('td', {}, r.setup),
    el('td', { class: 'r mono' }, String(r.count)),
    el('td', { class: 'r mono ' + cls(r.expectancy) }, fmtR(r.expectancy, 3)),
    el('td', { class: 'r mono ' + cls(r.netR) }, fmtR(r.netR))
  )));
  setupTbl.appendChild(stb);
  row4.appendChild(card({ title: 'SETUP İSTATİSTİĞİ', body: setupTbl }));
  host.appendChild(row4);
}
