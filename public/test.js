/* RUx — Backtest İşlem Günlüğü (version: see rux_version.js) */
import { el, State, fetchMarket, fmtPrice } from './api.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { canvasLineChart, canvasBarChart } from './charts.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { makeRuxBacktestSnapshot, COST_PROFILES, getRuxCostProfile } from './rux_core.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { buildRuleBuilderReport } from './rux_rulebuilder.js?v=0.75.6-liquidation-compact-trusted-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPctPlain(n, d = 1) {
  const v = Number(n || 0);
  return '%' + v.toFixed(d);
}
function valClass(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function statusTag(text) {
  const t = String(text || '').toUpperCase();
  const cls = t.includes('TP') || t.includes('SHADOW') ? 'green' : t.includes('STOP') || t.includes('RED') ? 'red' : 'yellow';
  return el('span', { class: 'tag ' + cls }, text);
}
function lineDataFromCurve(curve = []) {
  return curve.map((v, i) => ({ value: Number(v || 0), label: String(i + 1) }));
}
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, cls = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + cls }, v))));
  return box;
}

function shortDate(ts) {
  try { return new Date(Number(ts)).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch { return '—'; }
}

function tradeReason(row = {}) {
  const out = row.outcome || {};
  if (row.status === 'NO_TRADE_BLOCK' || row.blocked) {
    const r = row.snapshot?.noTrade?.reasons || row.snapshot?.noTrade?.hardBlocks || [];
    return (Array.isArray(r) && r.length) ? r.slice(0, 2).join(' · ') : 'No-Trade filtresi';
  }
  if (row.status === 'WATCH_ONLY') return 'Skor/eşik yetersiz veya kural dışı';
  if (row.status === 'NO_FILL') return 'Entry bölgesi görülmedi';
  if (String(out.status || row.status).includes('TP')) return 'Hedef bölgesi görüldü';
  if (String(out.status || row.status).includes('STOP')) return 'Stop referansı çalıştı';
  return out.firstOutcome || row.status || 'Simülasyon sonucu';
}

function buildDetailedBacktestJournal(rows = []) {
  const all = (rows || []).slice().sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
  const display = all.slice(0, 28);
  const tbl = el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {},
      ['#','Zaman','Yön','Setup / Rejim','Entry','Exit','Gross-R','Maliyet-R','Net-R','MFE/MAE','Durum','Neden'].map(h => el('th', { class: ['Gross-R','Maliyet-R','Net-R','MFE/MAE'].includes(h) ? 'r' : '' }, h))
    )),
    el('tbody', {}, ...display.map(r => {
      const out = r.outcome || {};
      const entryTxt = out.entry ? fmtPrice(out.entry) : (r.snapshot?.manualPlan?.entryZone || '—');
      const exitTxt = out.exitPrice ? fmtPrice(out.exitPrice) : '—';
      const status = r.status || out.status || '—';
      const isTrade = !!r.filled;
      return el('tr', { class: isTrade ? '' : 'muted' },
        el('td', { class: 'mono muted' }, String(r.id || '—')),
        el('td', { class: 'mono small' }, shortDate(r.time)),
        el('td', {}, el('span', { class: 'tag ' + (r.direction === 'LONG' ? 'green' : r.direction === 'SHORT' ? 'red' : 'yellow') }, r.direction || 'WATCH')),
        el('td', {},
          el('div', { class: 'small bold' }, r.setup || '—'),
          el('div', { class: 'tiny muted mt-2' }, r.regime || '—')
        ),
        el('td', { class: 'mono small' }, entryTxt),
        el('td', { class: 'mono small' }, exitTxt),
        el('td', { class: 'r mono ' + valClass(r.grossR) }, isTrade ? fmtR(r.grossR || 0) : '—'),
        el('td', { class: 'r mono neg' }, isTrade ? '-' + fmtR(Math.abs(r.totalCostR || 0)).replace('+','') : '—'),
        el('td', { class: 'r mono bold ' + valClass(r.netR) }, isTrade ? fmtR(r.netR || 0) : '—'),
        el('td', { class: 'r mono small' }, isTrade ? `${fmtR(out.mfeR || 0, 1)} / -${Number(out.maeR || 0).toFixed(1)}R` : '—'),
        el('td', {}, statusTag(status)),
        el('td', { class: 'small muted' }, tradeReason(r))
      );
    }))
  );
  return card({
    title: 'BACKTEST İŞLEM GÜNLÜĞÜ — DETAYLI',
    actions: [el('span', { class: 'tag cyan' }, `${display.length}/${all.length} kayıt`), el('span', { class: 'tag yellow' }, 'Net-R esas')],
    body: el('div', {},
      el('div', { class: 'rux-compact-note mb-10' }, 'Bu tablo her backtest adayını işlem seviyesinde gösterir: entry/exit, brüt R, maliyet, Net-R, MFE/MAE, No-Trade veya watch-only nedeni.'),
      el('div', { class: 'tbl-wrap' }, tbl)
    )
  });
}

function buildBacktestCostBreakdown(rows = []) {
  const trades = (rows || []).filter(r => r.filled);
  const fee = trades.reduce((a, r) => a + Number(r.feeR || 0), 0);
  const spread = trades.reduce((a, r) => a + Number(r.spreadR || 0), 0);
  const slip = trades.reduce((a, r) => a + Number(r.slippageR || 0), 0);
  const funding = trades.reduce((a, r) => a + Number(r.fundingR || 0), 0);
  const blocked = (rows || []).filter(r => r.blocked || r.status === 'NO_TRADE_BLOCK');
  const watch = (rows || []).filter(r => r.status === 'WATCH_ONLY');
  return card({
    title: 'İŞLEM GÜNLÜĞÜ MUHASEBESİ',
    body: kvRows([
      ['Filled işlem', String(trades.length)],
      ['No-Trade blok', String(blocked.length)],
      ['Watch-only', String(watch.length)],
      ['Fee toplamı', '-' + fmtR(Math.abs(fee)).replace('+',''), 'neg'],
      ['Spread toplamı', '-' + fmtR(Math.abs(spread)).replace('+',''), 'neg'],
      ['Slippage toplamı', '-' + fmtR(Math.abs(slip)).replace('+',''), 'neg'],
      ['Funding toplamı', '-' + fmtR(Math.abs(funding)).replace('+',''), 'neg'],
      ['Net maliyet', '-' + fmtR(Math.abs(fee + spread + slip + funding)).replace('+',''), 'neg']
    ])
  });
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

function getSelectedCostProfile() {
  try { return localStorage.getItem('rux.costProfile') || 'futures_normal'; } catch { return 'futures_normal'; }
}

function costProfileSelect(current, rerender) {
  const options = Object.values(COST_PROFILES || {});
  return el('select', { class: 'select rux-cost-select', value: current, on: { change: (ev) => {
    try { localStorage.setItem('rux.costProfile', ev.target.value); } catch {}
    rerender();
  }}}, options.map(p => el('option', { value: p.key, selected: p.key === current }, p.label)));
}

function ruleSetInfoBox(rule, snap) {
  if (!rule) return el('div', { class: 'rux-compact-note section' }, 'Kural seti seçilmedi; RUx varsayılan backtest eşiği kullanılıyor.');
  const th = rule.thresholds || {};
  return el('div', { class: 'rux-rule-link-note section' },
    el('div', { class: 'bold cyan' }, 'Aktif Test Kural Seti: ', rule.name),
    el('div', { class: 'small muted mt-4' },
      `${rule.setup} · ${rule.regime} · ${rule.direction} · Min skor ${th.minFinal ?? '—'} · Min RR ${th.minRR ?? '—'} · Min veri güveni ${th.minDataConfidence ?? '—'} · Maks. No-Trade ${th.maxNoTrade ?? '—'}`
    ),
    el('div', { class: 'small muted mt-4' }, snap?.metrics ? `Bu backtest, seçili kural setinin eşiklerine göre filtrelendi. Kaynak: ${snap.source} · ${snap.candles} mum.` : '')
  );
}



function oosValidationBox(v = {}) {
  const tone = v.tone || 'yellow';
  const gateTable = el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {}, ['Kapı','Değer','Durum','Not'].map(h => el('th', {}, h)))),
    el('tbody', {}, ...(v.gates || []).map(g => el('tr', {},
      el('td', {}, g.label),
      el('td', { class: 'mono' }, g.value),
      el('td', {}, el('span', { class: 'tag ' + (g.ok ? 'green' : 'red') }, g.ok ? 'GEÇTİ' : 'KALDI')),
      el('td', { class: 'small muted' }, g.note)
    )))
  );
  return card({
    title: 'OOS / BACKTEST DÜRÜSTLÜK KONTROLÜ',
    actions: [el('span', { class: 'tag ' + tone }, v.verdict || 'VERİ BEKLİYOR'), el('span', { class: 'tag yellow' }, 'Aktivasyon yok')],
    body: el('div', {},
      el('div', { class: 'row cols-5' },
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'IS Exp.'), el('div', { class: 'mono bold mt-2 ' + valClass(v.is?.expectancy) }, fmtR(v.is?.expectancy || 0, 3))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'OOS Exp.'), el('div', { class: 'mono bold mt-2 ' + valClass(v.oos?.expectancy) }, fmtR(v.oos?.expectancy || 0, 3))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Stability'), el('div', { class: 'mono bold mt-2 ' + (Number(v.stability||0) >= .8 ? 'pos' : Number(v.stability||0) >= .6 ? 'warn' : 'neg') }, String(v.stability ?? '—'))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'OOS İşlem'), el('div', { class: 'mono bold mt-2' }, String(v.oos?.totalTrades || 0))),
        el('div', { class: 'rux-rule-metric' }, el('div', { class: 'tiny muted' }, 'Overfit Riski'), el('div', { class: 'mono bold mt-2 ' + (Number(v.overfitScore||0) >= 60 ? 'neg' : Number(v.overfitScore||0) >= 35 ? 'warn' : 'pos') }, String(v.overfitScore ?? 0) + '/100'))
      ),
      el('div', { class: 'mt-10 tbl-wrap' }, gateTable),
      el('div', { class: 'rux-compact-note mt-10' }, v.note || 'OOS kontrolü, backtestin geçmişe aşırı uyum riskini ölçer.')
    )
  });
}

export async function renderTest(host) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  const { rep: ruleReport, rule: activeRule } = getSelectedRuleSet();
  const selectedCostProfile = getSelectedCostProfile();
  const costProfile = getRuxCostProfile(selectedCostProfile);
  host.appendChild(pageHead({
    title: 'TEST / BACKTEST MOTORU',
    subtitle: 'RUx sinyal kayıtlarını Net-R, fill modeli, drawdown ve setup bazında ölçer. Otomatik emir açmaz.',
    actions: [
      el('div', { class: 'select' }, symbol.replace('USDT', '/USDT'), ' ', ICN.chev(10)),
      el('div', { class: 'select' }, tf, ' ', ICN.chev(10)),
      ruleSetSelect(activeRule, ruleReport.sets, () => renderTest(host)),
      costProfileSelect(selectedCostProfile, () => renderTest(host)),
      el('button', { class: 'btn primary', on: { click: () => renderTest(host) } }, ICN.play(12), 'TESTİ ÇALIŞTIR'),
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'card-title' }, 'RUx performans motoru hazırlanıyor…'));
  host.appendChild(loading);
  const market = await fetchMarket(symbol, tf, 520);
  const snap = makeRuxBacktestSnapshot({ marketData: market, symbol, tf, fillModel: 'realistic', ruleSet: activeRule, costProfile: selectedCostProfile });
  const m = snap.metrics;
  loading.remove();

  host.appendChild(ruleSetInfoBox(activeRule, snap));
  host.appendChild(el('div', { class: 'section' }, oosValidationBox(snap.oosValidation || {})));

  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'NET R SONUÇ', value: fmtR(m.netR), sub: `${m.totalTrades} filled / ${m.totalSignals} sinyal`, subColor: m.netR >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'KAZANMA ORANI', value: fmtPctPlain(m.winRate), sub: `${m.wins} kazanan / ${m.losses} kaybeden`, subColor: m.winRate >= 50 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'green', label: 'PROFIT FACTOR', value: String(m.profitFactor), sub: m.profitFactor >= 1.5 ? 'Güçlü' : 'İzlenmeli', subColor: m.profitFactor >= 1.5 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'EXPECTANCY', value: fmtR(m.expectancy, 3), sub: 'İşlem başına Net-R', subColor: m.expectancy >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'MAX DRAWDOWN', value: fmtR(m.maxDrawdownR), sub: `${m.maxConsecutiveLosses} ardışık kayıp`, subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'purple', label: 'BACKTEST GÜVENİ', value: fmtPctPlain(m.confidence), sub: `${snap.candles} mum · ${snap.source}` }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'cyan', label: 'BLOKLANAN', value: String(m.blockedSignals), sub: 'No-Trade filtreleri' }));
  host.appendChild(stats);

  const note = el('div', { class: 'rux-compact-note section' },
    'Ana rapor Realistic Fill ve seçili maliyet profili üzerinden Net-R hesaplar. Aggressive tek başına karar için yeterli değildir; Conservative model dayanıklılık kontrolü için gösterilir.'
  );
  host.appendChild(note);

  host.appendChild(card({ title: 'GERÇEKÇİ MALİYET & FILL PROFİLİ', actions: [el('span', { class: 'tag cyan' }, costProfile.label), el('span', { class: 'tag yellow' }, 'Net-R esas')], body: kvRows([
    ['Profil', costProfile.label],
    ['Fee-R / işlem', '-' + fmtR(costProfile.feeR).replace('+',''), 'neg'],
    ['Spread-R / işlem', '-' + fmtR(costProfile.spreadR).replace('+',''), 'neg'],
    ['Slippage-R / işlem', '-' + fmtR(costProfile.slippageR).replace('+',''), 'neg'],
    ['Funding-R baz', '-' + fmtR(costProfile.fundingR).replace('+',''), 'neg'],
    ['Not', costProfile.note || '—']
  ]) }));

  const row = el('div', { class: 'row fr-2-1 section' });
  const eqCard = el('div', { class: 'card' });
  eqCard.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'NET-R EQUITY CURVE'),
    el('div', { class: 'flex gap-6' },
      el('span', { class: 'tag green' }, 'Realistic'),
      el('span', { class: 'tag cyan' }, `${m.fillModel}`),
      el('span', { class: 'tag yellow' }, 'Otomatik emir yok')
    )
  ));
  const eqHost = el('div', { class: 'chart-host tall mt-6' });
  eqCard.appendChild(eqHost);
  row.appendChild(eqCard);

  const rCard = el('div', { class: 'card' });
  rCard.appendChild(el('div', { class: 'card-title' }, 'R DAĞILIMI'));
  const rHost = el('div', { class: 'chart-host short mt-6', style: 'height:200px' });
  rCard.appendChild(rHost);
  rCard.appendChild(kvRows([
    ['Ortalama Kazanç', fmtR(m.avgWin), 'pos'],
    ['Ortalama Kayıp', '-' + m.avgLoss.toFixed(2) + 'R', 'neg'],
    ['Stability Score', String(m.stabilityScore)],
  ]));
  row.appendChild(rCard);
  host.appendChild(row);
  setTimeout(() => {
    canvasLineChart(eqHost, [{ values: m.equityCurve, color: '#10b981', width: 2, fill: true }]);
    canvasBarChart(rHost, m.buckets.map(([label, value]) => ({ label, value, color: label.includes('-') || label.includes('≤') ? '#ef4444' : '#10b981' })));
  }, 50);

  const row2 = el('div', { class: 'row cols-2 section' });
  row2.appendChild(card({ title: 'PERFORMANS ÖZETİ', body: kvRows([
    ['Kural Seti', activeRule?.name || 'Varsayılan RUx'],
    ['Toplam Sinyal', String(m.totalSignals)],
    ['Filled İşlem', String(m.totalTrades)],
    ['No-Trade Blok', String(m.blockedSignals)],
    ['Watch Only', String(m.watchOnly)],
    ['Gross R', fmtR(m.grossR)],
    ['Fee-R', '-' + fmtR(Math.abs(m.feeR || 0)).replace('+',''), 'neg'],
    ['Spread-R', '-' + fmtR(Math.abs(m.spreadR || 0)).replace('+',''), 'neg'],
    ['Slippage-R', '-' + fmtR(Math.abs(m.slippageR || 0)).replace('+',''), 'neg'],
    ['Funding-R', '-' + fmtR(Math.abs(m.fundingR || 0)).replace('+',''), 'neg'],
    ['Toplam Maliyet', '-' + fmtR(Math.abs(m.totalCostR || 0)).replace('+',''), 'neg'],
    ['Net R', fmtR(m.netR), m.netR >= 0 ? 'pos' : 'neg'],
    ['Profit Factor', String(m.profitFactor), m.profitFactor >= 1.5 ? 'pos' : 'warn'],
    ['Expectancy', fmtR(m.expectancy, 3), m.expectancy >= 0 ? 'pos' : 'neg'],
    ['Max Drawdown', fmtR(m.maxDrawdownR), 'neg'],
  ]) }));

  const fm = snap.fillModels;
  const fillTable = el('table', { class: 'tbl tbl-compact' });
  fillTable.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Fill Model'), el('th', { class: 'r' }, 'Net R'), el('th', { class: 'r' }, 'PF'), el('th', { class: 'r' }, 'Expectancy'), el('th', { class: 'r' }, 'Max DD')
  )));
  const ftb = el('tbody', {});
  [['Aggressive', fm.aggressive], ['Realistic', fm.realistic], ['Conservative', fm.conservative]].forEach(([name, x]) => {
    ftb.appendChild(el('tr', {},
      el('td', {}, name),
      el('td', { class: 'r mono ' + (x.netR >= 0 ? 'pos' : 'neg') }, fmtR(x.netR)),
      el('td', { class: 'r mono' }, x.pf),
      el('td', { class: 'r mono ' + (x.expectancy >= 0 ? 'pos' : 'neg') }, fmtR(x.expectancy, 3)),
      el('td', { class: 'r mono neg' }, fmtR(x.maxDD))
    ));
  });
  fillTable.appendChild(ftb);
  row2.appendChild(card({ title: 'BACKTEST REALISM / FILL KARŞILAŞTIRMA', body: fillTable }));
  host.appendChild(row2);

  const row3 = el('div', { class: 'row cols-2 section' });
  const setupTable = el('table', { class: 'tbl tbl-compact' });
  setupTable.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Setup'), el('th', { class: 'r' }, 'İşlem'), el('th', { class: 'r' }, 'WR'), el('th', { class: 'r' }, 'PF'), el('th', { class: 'r' }, 'Exp'), el('th', { class: 'r' }, 'Net R')
  )));
  const stb = el('tbody', {});
  (m.setupPerformance.length ? m.setupPerformance : [{ setup: 'Yeterli filled işlem yok', count: 0, winRate: 0, pf: 0, expectancy: 0, netR: 0 }]).slice(0, 8).forEach(x => {
    stb.appendChild(el('tr', {},
      el('td', {}, x.setup),
      el('td', { class: 'r mono' }, x.count),
      el('td', { class: 'r mono' }, fmtPctPlain(x.winRate)),
      el('td', { class: 'r mono' }, x.pf),
      el('td', { class: 'r mono ' + (x.expectancy >= 0 ? 'pos' : 'neg') }, fmtR(x.expectancy)),
      el('td', { class: 'r mono ' + (x.netR >= 0 ? 'pos' : 'neg') }, fmtR(x.netR))
    ));
  });
  setupTable.appendChild(stb);
  row3.appendChild(card({ title: 'SETUP BAZLI EDGE', body: setupTable }));

  row3.appendChild(buildBacktestCostBreakdown(m.rows || []));
  host.appendChild(row3);

  host.appendChild(el('div', { class: 'section' }, buildDetailedBacktestJournal(m.rows || [])));
}
