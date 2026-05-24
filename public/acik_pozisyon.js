/* RUx — Açık Pozisyonlar / Coin bazlı manuel takip motoru */
import { el, fmtPrice, fetchMarket } from './api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { ICN, statCard, card, pageHead, coinPill, donut, barbar } from './components.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { canvasLineChart } from './charts.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { makeOpenPositionsReport } from './rux_core.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function pct(n) { return '%' + Number(n || 0).toFixed(2); }
function rTxt(n) { const v = Number(n || 0); return (v >= 0 ? '+' : '') + v.toFixed(2) + 'R'; }
function clsNum(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function heatCls(v) { return Number(v || 0) >= 0.55 ? 'neg' : Number(v || 0) >= 0.35 ? 'warn' : 'pos'; }

const TRACKED_POSITION_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','AVAXUSDT','LINKUSDT','BNBUSDT','OPUSDT','ARBUSDT'];
async function loadPositionMarkets(tf = '4h') {
  const settled = await Promise.allSettled(TRACKED_POSITION_SYMBOLS.map(sym => fetchMarket(sym, tf, 260)));
  const bySymbol = {};
  settled.forEach((r, i) => {
    const sym = TRACKED_POSITION_SYMBOLS[i];
    if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.candles) && r.value.candles.length) {
      bySymbol[sym] = { ...r.value, symbol: sym };
    }
  });
  return { bySymbol, source: Object.keys(bySymbol).length ? 'multi-live' : 'referans-fallback' };
}

export async function renderAcikPozisyon(host) {
  host.innerHTML = '';
  const tf = '4h';
  const markets = await loadPositionMarkets(tf);
  const rep = makeOpenPositionsReport({ marketData: markets, symbol: 'BTCUSDT', tf });
  const s = rep.summary;

  host.appendChild(pageHead({
    title: 'AÇIK POZİSYONLAR',
    subtitle: 'Manuel açık pozisyonların RUx sinyal planına göre risk, R ve uygulama sadakati takibi.',
    actions: [
      el('div', { class: 'select' }, 'Manuel takip ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow' }, ICN.bell(12), 'UYARI KUR'),
      el('button', { class: 'btn outline-cyan' }, ICN.download(12), 'RAPOR AL'),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'cyan', label: 'AÇIK POZİSYON', value: String(s.openCount), sub: `${s.longCount} LONG / ${s.shortCount} SHORT` }));
  stats.appendChild(statCard({ icon: ICN.dollar(18), iconColor: s.totalPnl >= 0 ? 'green' : 'red', label: 'TOPLAM K/Z', value: money(s.totalPnl), sub: rTxt(s.avgR), subColor: clsNum(s.avgR) }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'yellow', label: 'TOPLAM RİSK', value: pct(s.totalRiskPct), sub: 'Manuel risk toplamı' }));
  stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: s.heat >= 1.5 ? 'red' : 'green', label: 'PORTFÖY ISISI', value: String(s.heat), sub: s.heatLabel, subColor: s.heat >= 1.5 ? 'warn' : 'pos' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'SADAKAT', value: `${s.avgFidelity}/100`, sub: 'Plan uyumu', subColor: s.avgFidelity >= 70 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: s.atRiskCount ? 'red' : 'green', label: 'STOPA YAKIN', value: String(s.atRiskCount), sub: s.atRiskCount ? 'Yakından izle' : 'Temiz', subColor: s.atRiskCount ? 'warn' : 'pos' }));
  stats.appendChild(statCard({ icon: ICN.briefcase(18), iconColor: 'blue', label: 'MOTOR', value: 'MANUEL', sub: 'Otomatik emir yok' }));
  host.appendChild(stats);

  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'COIN'),
    el('th', {}, 'YÖN'),
    el('th', { class: 'r' }, 'GİRİŞ'),
    el('th', { class: 'r' }, 'GÜNCEL'),
    el('th', { class: 'r' }, 'STOP'),
    el('th', { class: 'r' }, 'TP1 / TP2'),
    el('th', { class: 'r' }, 'K/Z'),
    el('th', { class: 'r' }, 'R'),
    el('th', { class: 'r' }, 'RİSK'),
    el('th', {}, 'PLAN'),
    el('th', {}, 'SADAKAT'),
    el('th', {}, 'DURUM')
  )));
  const tb = el('tbody', {});
  rep.positions.forEach(p => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'muted' }, String(p.id)),
      el('td', {}, coinPill(p.asset)),
      el('td', {}, el('span', { class: 'tag ' + (p.direction === 'LONG' ? 'green' : 'red') }, p.direction)),
      el('td', { class: 'r mono' }, '$' + fmtPrice(p.entry)),
      el('td', { class: 'r mono bold ' + clsNum(p.r) }, '$' + fmtPrice(p.current)),
      el('td', { class: 'r mono small neg' }, '$' + fmtPrice(p.stop)),
      el('td', { class: 'r mono small pos' }, '$' + fmtPrice(p.tp1) + ' / $' + fmtPrice(p.tp2)),
      el('td', { class: 'r mono bold ' + clsNum(p.pnl) }, money(p.pnl)),
      el('td', { class: 'r mono bold ' + clsNum(p.r) }, rTxt(p.r)),
      el('td', { class: 'r mono ' + heatCls(p.heat) }, pct(p.riskPct)),
      el('td', {}, el('span', { class: 'tag ' + (p.planStatus === 'PLANA UYGUN' ? 'green' : 'yellow') }, p.planStatus)),
      el('td', {}, el('div', { style: 'min-width:95px' }, el('div', { class: 'small mono ' + (p.fidelity >= 70 ? 'pos' : 'warn') }, `${p.fidelity.toFixed(1)}/100`), barbar(p.fidelity, 100, p.fidelity >= 70 ? 'green' : 'yellow'))),
      el('td', {}, el('span', { class: 'tag ' + (p.status === 'STOPA YAKIN' ? 'red' : p.status === 'TP1 SONRASI' ? 'green' : 'cyan') }, p.status))
    ));
  });
  tbl.appendChild(tb);
  host.appendChild(card({ title: 'RUx MANUEL POZİSYON TAKİBİ', info: 'Pozisyonlar sinyal planına göre R, risk ve sadakat açısından izlenir.', body: el('div', { class: 'tbl-wrap' }, tbl) }));

  const row = el('div', { class: 'row cols-3 section' });
  const dist = el('div', {});
  dist.appendChild(el('div', { class: 'flex center mt-6' }, donut({
    data: [{ value: s.longCount, color: '#10b981' }, { value: s.shortCount, color: '#ef4444' }],
    size: 132, thickness: 18, centerTitle: 'YÖN', centerValue: `${s.longCount}/${s.shortCount}`
  })));
  dist.appendChild(el('div', { class: 'donut-legend mt-10' },
    el('div', { class: 'li' }, el('i', { style: 'background:#10b981' }), el('span', { class: 'nm' }, 'LONG'), el('span', { class: 'vl' }, String(s.longCount))),
    el('div', { class: 'li' }, el('i', { style: 'background:#ef4444' }), el('span', { class: 'nm' }, 'SHORT'), el('span', { class: 'vl' }, String(s.shortCount)))
  ));
  row.appendChild(card({ title: 'YÖN DAĞILIMI', body: dist }));

  const heat = el('div', {});
  rep.heat.rows.forEach(r => heat.appendChild(el('div', { class: 'kv' },
    el('span', { class: 'k' }, `${r.symbol} · ${r.direction}`),
    el('span', { class: 'v ' + heatCls(r.adjustedHeat) }, `${r.adjustedHeat} heat`)
  )));
  heat.appendChild(el('div', { class: 'divider' }));
  heat.appendChild(el('div', { class: 'small muted' }, rep.heat.action));
  row.appendChild(card({ title: 'BETA-AYARLI PORTFÖY ISISI', body: heat }));

  const chartCard = el('div', { class: 'card' });
  chartCard.appendChild(el('div', { class: 'card-title' }, 'POZİSYON R EĞRİSİ'));
  const ch = el('div', { class: 'chart-host short mt-6' });
  chartCard.appendChild(ch);
  setTimeout(() => {
    let acc = 0;
    const curve = [0, ...rep.positions.map(p => (acc += Number(p.r || 0)))];
    canvasLineChart(ch, [{ values: curve, color: '#10b981', width: 2, fill: true }]);
  }, 60);
  chartCard.appendChild(el('div', { class: 'small muted mt-8' }, 'Açık pozisyonların teorik R toplamı; emir kapatma göndermez.'));
  row.appendChild(chartCard);
  host.appendChild(row);
}
