/* RUx — Setup Performans Matrisi ekranı */
import { el, State, fetchMarket } from './api.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { ICN, statCard, card, pageHead, tag, barbar } from './components.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { makeRuxBacktestSnapshot } from './rux_core.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { buildSetupPerformanceMatrixReport, compareSetupMatrixMode } from './rux_setup_matrix.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function valClass(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function modeLabel(mode) {
  if (mode === 'backtest') return 'Backtest';
  if (mode === 'forward') return 'Forward';
  return 'Combined';
}
function safeMode(value) {
  const v = String(value || '').toLowerCase();
  return ['backtest','forward','combined'].includes(v) ? v : 'combined';
}
function modeActions(active) {
  return ['combined','backtest','forward'].map(m => el('a', { class: 'btn tiny ' + (m === active ? 'primary' : ''), href: '#/setup-matrisi?mode=' + m }, modeLabel(m)));
}
function verdictTag(v = {}) {
  return tag(v.label || '—', v.tone || 'gray');
}
function scoreCell(score) {
  const n = Number(score || 0);
  return el('div', { class: 'score-cell' }, el('div', { class: 'mono bold ' + (n >= 70 ? 'pos' : n < 38 ? 'neg' : '') }, String(Math.round(n))), barbar(n, 100, n >= 70 ? 'green' : n < 38 ? 'red' : 'yellow'));
}
function emptyNote(text) {
  return el('div', { class: 'empty' }, text);
}
function shortRows(rows = [], keyA = 'setup', keyB = 'regime') {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, keyA === 'setup' ? 'Setup' : 'Rejim'),
    keyB ? el('th', {}, keyB === 'regime' ? 'Rejim' : 'Setup') : null,
    el('th', { class: 'r' }, '#'),
    el('th', { class: 'r' }, 'Exp'),
    el('th', { class: 'r' }, 'PF'),
    el('th', { class: 'r' }, 'Edge')
  )));
  const body = el('tbody', {});
  (rows.length ? rows : []).forEach(r => body.appendChild(el('tr', {},
    el('td', {}, r[keyA] || '—'),
    keyB ? el('td', { class: 'small muted' }, r[keyB] || '—') : null,
    el('td', { class: 'r mono' }, String(r.count || 0)),
    el('td', { class: 'r mono ' + valClass(r.expectancy) }, fmtR(r.expectancy, 3)),
    el('td', { class: 'r mono' }, Number(r.profitFactor || 0).toFixed(2)),
    el('td', { class: 'r' }, scoreCell(r.edgeScore))
  )));
  tbl.appendChild(body);
  return rows.length ? el('div', { class: 'tbl-wrap' }, tbl) : emptyNote('Henüz yeterli satır yok.');
}

function buildMatrixTable(report) {
  const rows = report.matrix || [];
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['Setup','Rejim','Kaynak','#','WR','Avg W/L','Exp','PF','Max DD','MFE/MAE','Edge','Karar','Aksiyon'].map((h, i) => el('th', { class: i >= 3 && i <= 10 ? 'r' : '' }, h))
  )));
  const body = el('tbody', {});
  rows.forEach(r => body.appendChild(el('tr', { class: r.count < report.minSample ? 'muted' : '' },
    el('td', {}, el('div', { class: 'bold' }, r.setup || '—'), r.count < report.minSample ? el('div', { class: 'tiny muted mt-2' }, 'Örneklem düşük') : null),
    el('td', {}, r.regime || '—'),
    el('td', {}, tag(modeLabel(report.mode), report.mode === 'forward' ? 'cyan' : report.mode === 'backtest' ? 'yellow' : 'gray')),
    el('td', { class: 'r mono' }, String(r.count || 0)),
    el('td', { class: 'r mono' }, fmtPct(r.winRate)),
    el('td', { class: 'r mono small' }, `${fmtR(r.avgWin, 1)} / -${Number(r.avgLoss || 0).toFixed(1)}R`),
    el('td', { class: 'r mono bold ' + valClass(r.expectancy) }, fmtR(r.expectancy, 3)),
    el('td', { class: 'r mono ' + (Number(r.profitFactor || 0) >= 1.2 ? 'pos' : Number(r.profitFactor || 0) < 1 ? 'neg' : '') }, Number(r.profitFactor || 0).toFixed(2)),
    el('td', { class: 'r mono neg' }, fmtR(r.maxDrawdownR)),
    el('td', { class: 'r mono small' }, `${fmtR(r.mfeAvg, 1)} / -${Number(r.maeAvg || 0).toFixed(1)}R`),
    el('td', { class: 'r' }, scoreCell(r.edgeScore)),
    el('td', {}, verdictTag(r.verdict)),
    el('td', { class: 'small muted' }, r.verdict?.action || '—')
  )));
  tbl.appendChild(body);
  return card({
    title: 'SETUP x REJİM PERFORMANS MATRİSİ',
    info: 'Setup ve piyasa rejimi birlikte ölçülür; tek başına win rate karar değildir.',
    actions: [tag(`${rows.length} kombinasyon`, rows.length ? 'cyan' : 'gray'), tag(`Min örnek ${report.minSample}`, 'yellow')],
    body: rows.length ? el('div', { class: 'tbl-wrap' }, tbl) : emptyNote('Bu modda sonuçlanmış işlem yok. Backtest veya Sinyal Günlüğü kaydı oluşunca tablo dolar.')
  });
}

function buildScoreFormulaCard(report) {
  const decision = compareSetupMatrixMode(report);
  return card({
    title: 'EDGE SKOR MANTIĞI',
    actions: [tag(decision.label, decision.tone)],
    body: el('div', {},
      el('div', { class: 'rux-note' }, 'Edge skoru: Win Rate + Profit Factor + Expectancy + örneklem güveni - drawdown cezası - düşük örneklem cezası. Üç işlemde %100 başarıya hemen taç takmıyoruz; kral çıplaksa matris söyler.'),
      el('div', { class: 'kv mt-10' }, el('span', { class: 'k' }, 'Strong Edge'), el('span', { class: 'v mono pos' }, String(decision.strong))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Avoid'), el('span', { class: 'v mono neg' }, String(decision.avoid))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Unstable / düşük örneklem'), el('span', { class: 'v mono warn' }, String(decision.unstable))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Backtest işlem'), el('span', { class: 'v mono' }, String(report.sourceStats.backtestTrades))),
      el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Forward işlem'), el('span', { class: 'v mono' }, String(report.sourceStats.forwardTrades)))
    )
  });
}

function buildSummaryCards(report) {
  const s = report.summary || {};
  const best = report.best?.[0];
  const worst = report.worst?.[0];
  const decision = compareSetupMatrixMode(report);
  const row = el('div', { class: 'stat-row cols-6' });
  row.appendChild(statCard({ icon: ICN.table(18), iconColor: 'cyan', label: 'MOD', value: modeLabel(report.mode), sub: report.note }));
  row.appendChild(statCard({ icon: ICN.beaker(18), iconColor: 'cyan', label: 'İŞLEM', value: String(s.count || 0), sub: `${report.sourceStats.backtestTrades} BT / ${report.sourceStats.forwardTrades} FW` }));
  row.appendChild(statCard({ icon: ICN.target(18), iconColor: s.winRate >= 50 ? 'green' : 'yellow', label: 'GENEL WR', value: fmtPct(s.winRate), sub: `${s.wins || 0}W / ${s.losses || 0}L` }));
  row.appendChild(statCard({ icon: ICN.scale(18), iconColor: s.expectancy >= 0 ? 'green' : 'red', label: 'EXPECTANCY', value: fmtR(s.expectancy, 3), sub: 'Net-R ortalaması', subColor: s.expectancy >= 0 ? 'pos' : 'neg' }));
  row.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: decision.tone === 'green' ? 'green' : decision.tone === 'red' ? 'red' : 'yellow', label: 'MATRİS KARARI', value: decision.label, sub: best ? `${best.setup} / ${best.regime}` : 'Kayıt bekliyor' }));
  row.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'EN ZAYIF', value: worst ? String(worst.edgeScore) : '—', sub: worst ? `${worst.setup} / ${worst.regime}` : '—', subColor: worst ? 'neg' : '' }));
  return row;
}

export async function renderSetupMatrisi(host, params = {}) {
  const mode = safeMode(params.mode || (() => { try { return localStorage.getItem('rux.setupMatrixMode'); } catch { return ''; } })());
  try { localStorage.setItem('rux.setupMatrixMode', mode); } catch {}
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'Setup Performans Matrisi',
    subtitle: 'Backtest ve forward sonuçlarını setup + rejim bazında ayırır: hangi setup hangi piyasa modunda gerçekten edge üretiyor?',
    actions: modeActions(mode)
  }));
  host.appendChild(el('div', { class: 'empty' }, el('span', { class: 'loader' }), ' Setup matrisi hesaplanıyor...'));

  const market = await fetchMarket(State.symbol, State.tf, 420).catch(() => null);
  const bt = makeRuxBacktestSnapshot({ marketData: market, symbol: State.symbol, tf: State.tf, fillModel: 'realistic' });
  const report = buildSetupPerformanceMatrixReport({ backtestRows: bt.metrics?.rows || [], mode });
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'Setup Performans Matrisi',
    subtitle: `${State.symbol} · ${State.tf} · ${modeLabel(mode)} · Net-R, PF, expectancy, drawdown ve örneklem güveniyle ölçüm.`,
    actions: modeActions(mode)
  }));
  host.appendChild(buildSummaryCards(report));

  const topBottom = el('div', { class: 'row cols-2 section' });
  topBottom.appendChild(card({
    title: 'EN İYİ 5 KOMBİNASYON',
    actions: [tag('Aday Edge', 'green')],
    body: shortRows(report.best || [], 'setup', 'regime')
  }));
  topBottom.appendChild(card({
    title: 'EN ZAYIF 5 KOMBİNASYON',
    actions: [tag('Filtre Adayı', 'red')],
    body: shortRows(report.worst || [], 'setup', 'regime')
  }));
  host.appendChild(topBottom);

  host.appendChild(el('div', { class: 'section' }, buildMatrixTable(report)));

  const summaries = el('div', { class: 'row cols-3 section' });
  summaries.appendChild(card({ title: 'SETUP ÖZETİ', body: shortRows((report.setupSummary || []).slice(0, 8), 'setup', null) }));
  summaries.appendChild(card({ title: 'REJİM ÖZETİ', body: shortRows((report.regimeSummary || []).slice(0, 8), 'regime', null) }));
  summaries.appendChild(buildScoreFormulaCard(report));
  host.appendChild(summaries);

  const detail = el('div', { class: 'section rux-note' },
    'Not: Bu ekran karar motorunu şimdilik değiştirmez; setup/rejim edge ölçüm katmanıdır. Backtest sonuçları realistic fill + maliyet sonrası Net-R üzerinden, forward sonuçları Sinyal Günlüğü kayıtlarından okunur.'
  );
  host.appendChild(detail);
}
