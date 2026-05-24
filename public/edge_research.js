/* RUx — Edge Research Dashboard Consolidation ekranı */
import { el, State, fetchMarket } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, tag, barbar, progress } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { makeEdgeResearchDashboardReport } from './rux_edge_dashboard.js?v=0.75.10-heatmap-fidelity-pass-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function toneClass(tone) {
  if (tone === 'green') return 'pos';
  if (tone === 'red') return 'neg';
  if (tone === 'yellow') return 'warn';
  return '';
}
function scoreTone(score) {
  const s = Number(score || 0);
  if (s >= 80) return 'green';
  if (s >= 62) return 'yellow';
  if (s >= 45) return 'cyan';
  return 'red';
}
function scoreCardIcon(id) {
  const map = {
    setup: ICN.table(18), rules: ICN.scale(18), oos: ICN.swap(18), monteCarlo: ICN.flow(18),
    data: ICN.shieldcheck(18), calibration: ICN.gear(18), replay: ICN.play(18), fidelity: ICN.edit(18)
  };
  return map[id] || ICN.beaker(18);
}
function openBtn(route, text = 'Aç') {
  return el('a', { class: 'btn tiny', href: route }, text);
}
function kv(label, value, cls = '') {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v mono ' + cls }, value));
}
function moduleScorePill(score) {
  const s = Math.round(Number(score || 0));
  return el('div', { style: 'min-width:92px' }, el('div', { class: 'mono bold ' + (s >= 70 ? 'pos' : s < 45 ? 'neg' : 'warn') }, String(s) + '/100'), barbar(s, 100, scoreTone(s)));
}
function readinessStrip(report) {
  const items = Object.entries(report.moduleScores || {}).map(([k, v]) => ({ k, v }));
  const wrap = el('div', { class: 'rux-score-strip section' });
  items.forEach(x => {
    const label = ({ setup:'Setup', rules:'Rules', oos:'OOS', monteCarlo:'MC', data:'Data', calibration:'Calib', replay:'Replay', fidelity:'Fidelity' })[x.k] || x.k;
    wrap.appendChild(el('div', { class: 'mini-card' },
      el('div', { class: 'label' }, label),
      el('div', { class: 'val mono ' + (x.v >= 70 ? 'pos' : x.v < 50 ? 'neg' : 'warn') }, Math.round(x.v)),
      progress(x.v, 100, scoreTone(x.v))
    ));
  });
  return wrap;
}
function moduleTable(report) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Modül'), el('th', { class: 'r' }, 'Skor'), el('th', {}, 'Karar'), el('th', {}, 'Ana Metrik'), el('th', {}, 'Aksiyon'), el('th', { class: 'r' }, '')
  )));
  const tb = el('tbody', {});
  (report.modules || []).forEach(m => tb.appendChild(el('tr', {},
    el('td', {}, el('div', { class: 'bold' }, m.title), el('div', { class: 'small muted' }, m.note || '—')),
    el('td', { class: 'r' }, moduleScorePill(m.score)),
    el('td', {}, tag(m.verdict?.label || '—', m.verdict?.tone || 'gray')),
    el('td', { class: 'mono small' }, m.metric || '—'),
    el('td', { class: 'small muted' }, m.action || m.verdict?.action || '—'),
    el('td', { class: 'r' }, openBtn(m.route, 'Panele Git'))
  )));
  tbl.appendChild(tb);
  return card({
    title: 'ARAŞTIRMA MODÜLLERİ — TEK KOMUTA TABLOSU',
    info: 'Her satır ayrı panelin özet kararını ve deployment/readiness etkisini gösterir.',
    actions: [tag(`${report.modules?.length || 0} modül`, 'cyan'), tag(report.verdict?.label || '—', report.verdict?.tone || 'gray')],
    body: el('div', { class: 'tbl-wrap' }, tbl)
  });
}
function topEdgesTable(report) {
  const rows = report.topEdges || [];
  if (!rows.length) return card({ title: 'EN GÜÇLÜ EDGE ADAYLARI', actions: [tag('Veri bekliyor', 'gray')], body: el('div', { class: 'empty' }, 'Setup/kural adayı oluşması için sonuçlanmış sinyal gerekir.') });
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'Tür'), el('th', {}, 'Aday'), el('th', { class: 'r' }, 'Skor'), el('th', {}, 'Metrik'), el('th', { class: 'r' }, ''))));
  const tb = el('tbody', {});
  rows.forEach(r => tb.appendChild(el('tr', {},
    el('td', {}, tag(r.type, r.type === 'Setup' ? 'cyan' : 'yellow')),
    el('td', {}, el('div', { class: 'bold' }, r.name)),
    el('td', { class: 'r' }, moduleScorePill(r.score)),
    el('td', { class: 'mono small' }, r.metric),
    el('td', { class: 'r' }, openBtn(r.route, 'İncele'))
  )));
  tbl.appendChild(tb);
  return card({ title: 'EN GÜÇLÜ EDGE ADAYLARI', actions: [tag('Shadow adayı', 'green')], body: el('div', { class: 'tbl-wrap' }, tbl) });
}
function blockersCard(report) {
  const blockers = report.blockers || [];
  if (!blockers.length) return card({
    title: 'BLOCKER / RİSK KAPILARI',
    actions: [tag('Kritik blocker yok', 'green')],
    body: el('div', { class: 'rux-note' }, 'Şu an global panelde hard blocker görünmüyor. Bu otomatik aktivasyon anlamına gelmez; shadow/forward izleme disiplinini koru.')
  });
  const body = el('div', { class: 'rux-list' });
  blockers.forEach(b => body.appendChild(el('div', { class: 'rux-list-row' },
    el('div', {}, tag(b.severity === 'hard' ? 'HARD' : 'SOFT', b.severity === 'hard' ? 'red' : 'yellow'), ' ', el('span', { class: 'bold' }, b.label), el('div', { class: 'small muted mt-2' }, b.detail)),
    openBtn(b.route, 'Aç')
  )));
  return card({ title: 'BLOCKER / RİSK KAPILARI', actions: [tag(`${blockers.length} uyarı`, blockers.some(b => b.severity === 'hard') ? 'red' : 'yellow')], body });
}
function nextActionsCard(report) {
  const body = el('div', { class: 'rux-list' });
  (report.nextActions || []).forEach(a => body.appendChild(el('div', { class: 'rux-list-row' },
    el('div', {}, tag(a.priority, a.priority === 'P0' ? 'red' : a.priority === 'P1' ? 'yellow' : 'cyan'), ' ', el('span', { class: 'bold' }, a.title), el('div', { class: 'small muted mt-2' }, a.action)),
    openBtn(a.route, 'Git')
  )));
  return card({ title: 'SIRADAKİ AKSİYONLAR', actions: [tag('Önceliklendirilmiş', 'cyan')], body });
}
function calibrationCard(report) {
  const c = report.calibration || {};
  const weights = c.suggestedWeights || {};
  const body = el('div', {},
    el('div', { class: 'rux-note' }, c.reason || 'Kalibrasyon raporu bekleniyor.'),
    kv('Status', c.status || '—', toneClass(c.activationGate?.approved ? 'green' : 'yellow')),
    kv('Stability', String(c.stabilityScore ?? '—'), Number(c.stabilityScore || 0) >= 0.8 ? 'pos' : 'warn'),
    kv('Challenger PF', String(Number(c.challenger?.profitFactor || 0).toFixed(2)), Number(c.challenger?.profitFactor || 0) >= 1.2 ? 'pos' : 'warn'),
    kv('Exp iyileşme', fmtR(c.improvement?.expectancy || 0, 3), Number(c.improvement?.expectancy || 0) >= 0 ? 'pos' : 'neg'),
    el('div', { class: 'mt-10 small muted' }, `Suggested: Setup ${weights.setup || '—'} / Regime ${weights.regime || '—'} / Confirmation ${weights.confirmation || '—'} / Execution ${weights.execution || '—'} / RR ${weights.rr || '—'}`)
  );
  return card({ title: 'EDGE CALIBRATION ÖZETİ', actions: [tag(c.status || 'İzleme', c.activationGate?.approved ? 'green' : 'yellow')], body });
}
function oosMcCard(report) {
  const o = report.backtest?.oos || {};
  const mc = report.monteCarlo || {};
  const body = el('div', {},
    kv('OOS Verdict', o.verdict || '—', toneClass(o.tone || 'yellow')),
    kv('OOS Expectancy', fmtR(o.oos?.expectancy || 0, 3), Number(o.oos?.expectancy || 0) > 0 ? 'pos' : 'neg'),
    kv('Stability', String(o.stability ?? '—'), Number(o.stability || 0) >= 0.8 ? 'pos' : 'warn'),
    kv('Risk of Ruin', fmtPct(mc.summary?.riskOfRuin || 0), Number(mc.summary?.riskOfRuin || 0) < 10 ? 'pos' : 'neg'),
    kv('P90 Max DD', fmtR(mc.summary?.p90MaxDD ?? mc.drawdown?.p90 ?? 0, 2), 'neg'),
    kv('Risk önerisi', `%${mc.riskRecommendation?.suggestedRisk ?? '—'}`, Number(mc.riskRecommendation?.multiplier || 0) >= 0.75 ? 'pos' : 'warn')
  );
  return card({ title: 'OOS + MONTE CARLO ÖZETİ', actions: [tag(mc.riskBand?.label || 'Watch', mc.riskBand?.tone || 'yellow')], body });
}

export async function renderEdgeResearch(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  host.appendChild(pageHead({
    title: 'EDGE RESEARCH DASHBOARD',
    subtitle: 'RUx v0.75.10-heatmap-fidelity-pass-20260524 setup matrisi, kural karşılaştırma, OOS, Monte Carlo, data health, Binance live wiring, replay ve user fidelity çıktılarını tek araştırma komuta panelinde birleştirir.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT','/USDT')),
      el('div', { class: 'select' }, tf),
      el('button', { class: 'btn primary', on: { click: () => renderEdgeResearch(host) } }, ICN.refresh(12), 'Yenile')
    ]
  }));
  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'Edge Research Dashboard hesaplanıyor…'), el('div', { class: 'small muted mt-6' }, 'Backtest, OOS, Monte Carlo ve setup/kural raporları aynı veri setinde konsolide ediliyor.'));
  host.appendChild(loading);

  const market = await fetchMarket(symbol, tf, 660).catch(() => null);
  const report = makeEdgeResearchDashboardReport({ marketData: market, symbol, tf });
  loading.remove();
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'EDGE RESEARCH DASHBOARD',
    subtitle: `${symbol} · ${tf} · Kaynak: ${report.source} · ${report.note}`,
    actions: [
      tag(report.verdict.label, report.verdict.tone),
      el('a', { class: 'btn tiny', href: '#/data-kaynak-sagligi' }, 'Data Health'),
      el('a', { class: 'btn tiny', href: '#/walkforward' }, 'OOS'),
      el('a', { class: 'btn tiny', href: '#/montecarlo' }, 'Monte Carlo')
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-8 section' });
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: report.verdict.tone === 'green' ? 'green' : report.verdict.tone === 'red' ? 'red' : 'yellow', label: 'READINESS', value: String(report.readiness), sub: report.verdict.label, subColor: toneClass(report.verdict.tone) }));
  stats.appendChild(statCard({ icon: ICN.beaker(18), iconColor: 'cyan', label: 'BT TRADE', value: String(report.backtest.rows || 0), sub: `Exp ${fmtR(report.backtest.summary?.expectancy || 0, 3)}`, subColor: Number(report.backtest.summary?.expectancy || 0) >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.table(18), iconColor: 'cyan', label: 'SETUP EDGE', value: String(report.setup.best?.length || 0), sub: `Strong aday` }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'yellow', label: 'RULE BEST', value: report.rules.best?.model || '—', sub: report.rules.activation?.label || '—' }));
  stats.appendChild(statCard({ icon: ICN.swap(18), iconColor: Number(report.backtest.oos?.stability || 0) >= 0.8 ? 'green' : 'yellow', label: 'OOS STABILITY', value: String(report.backtest.oos?.stability ?? '—'), sub: report.backtest.oos?.verdict || '—' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: Number(report.monteCarlo.summary?.riskOfRuin || 0) < 10 ? 'green' : 'red', label: 'RUIN', value: fmtPct(report.monteCarlo.summary?.riskOfRuin || 0), sub: report.monteCarlo.riskBand?.label || '—' }));
  stats.appendChild(statCard({ icon: ICN.cpu(18), iconColor: 'purple', label: 'CALIBRATION', value: report.calibration.status || '—', sub: `Stab ${report.calibration.stabilityScore || '—'}` }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: Number(report.moduleScores.data || 0) >= 70 ? 'green' : 'yellow', label: 'DATA', value: String(Math.round(report.moduleScores.data || 0)), sub: report.dataHealth ? 'son rapor var' : 'test bekliyor' }));
  host.appendChild(stats);

  host.appendChild(el('div', { class: 'rux-compact-note section' }, report.verdict.action));
  host.appendChild(readinessStrip(report));

  const firstRow = el('div', { class: 'row fr-2-1 section' });
  firstRow.appendChild(moduleTable(report));
  firstRow.appendChild(el('div', {}, blockersCard(report), el('div', { class: 'mt-12' }, nextActionsCard(report))));
  host.appendChild(firstRow);

  const secondRow = el('div', { class: 'row cols-3 section' });
  secondRow.appendChild(topEdgesTable(report));
  secondRow.appendChild(oosMcCard(report));
  secondRow.appendChild(calibrationCard(report));
  host.appendChild(secondRow);

  const bottom = el('div', { class: 'section rux-note' },
    'Not: Bu konsol tek başına hiçbir kuralı aktif etmez. Deployment/readiness etiketi yalnızca araştırma karar destek çıktısıdır; final karar için Data Health, OOS/Walk-Forward, Monte Carlo ve Forward Journal birlikte izlenmelidir.'
  );
  host.appendChild(bottom);
}
