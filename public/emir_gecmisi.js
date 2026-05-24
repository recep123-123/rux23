/* RUx — Emir Geçmişi / Coin bazlı kullanıcı uygulama sadakati */
import { el, fmtPrice, fetchMarket } from './api.js?v=0.75.7-liquidation-source-health-20260524';
import { ICN, statCard, card, pageHead, coinPill, donut, barbar } from './components.js?v=0.75.7-liquidation-source-health-20260524';
import { canvasLineChart } from './charts.js?v=0.75.7-liquidation-source-health-20260524';
import { makeOrderHistoryReport } from './rux_core.js?v=0.75.7-liquidation-source-health-20260524';

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function rTxt(n) { const v = Number(n || 0); return (v >= 0 ? '+' : '') + v.toFixed(2) + 'R'; }
function clsNum(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function timeLabel(ts) { try { return new Date(ts).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch { return '—'; } }

const TRACKED_ORDER_SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','AVAXUSDT','LINKUSDT','BNBUSDT','OPUSDT','ARBUSDT'];
async function loadOrderMarkets(tf = '4h') {
  const settled = await Promise.allSettled(TRACKED_ORDER_SYMBOLS.map(sym => fetchMarket(sym, tf, 260)));
  const bySymbol = {};
  settled.forEach((r, i) => {
    const sym = TRACKED_ORDER_SYMBOLS[i];
    if (r.status === 'fulfilled' && r.value && Array.isArray(r.value.candles) && r.value.candles.length) {
      bySymbol[sym] = { ...r.value, symbol: sym };
    }
  });
  return { bySymbol, source: Object.keys(bySymbol).length ? 'multi-live' : 'referans-fallback' };
}

export async function renderEmirGecmisi(host) {
  host.innerHTML = '';
  const tf = '4h';
  const markets = await loadOrderMarkets(tf);
  const rep = makeOrderHistoryReport({ marketData: markets, symbol: 'BTCUSDT', tf });
  const s = rep.summary;

  host.appendChild(pageHead({
    title: 'EMİR GEÇMİŞİ',
    subtitle: 'Manuel emirlerin RUx sinyal planına göre slippage, gecikme, Net-R ve uygulama sadakati analizi.',
    actions: [
      el('div', { class: 'select' }, 'Son sinyaller ', ICN.chev(10)),
      el('div', { class: 'select' }, 'Realistic Fill ', ICN.chev(10)),
      el('button', { class: 'btn outline-cyan' }, ICN.download(12), 'CSV İNDİR'),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'cyan', label: 'TOPLAM EMİR', value: String(s.totalOrders), sub: 'Manuel takip seti' }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'GERÇEKLEŞEN', value: String(s.filled), sub: `%${s.fillRate}`, subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: s.cancelled ? 'yellow' : 'green', label: 'İPTAL', value: String(s.cancelled), sub: 'Plan dışı değilse sorun yok', subColor: s.cancelled ? 'warn' : 'pos' }));
  stats.appendChild(statCard({ icon: ICN.bell(18), iconColor: s.rejected ? 'red' : 'green', label: 'REDDEDİLEN', value: String(s.rejected), sub: 'API/emir kalitesi', subColor: s.rejected ? 'neg' : 'pos' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'ORT. SLIPPAGE', value: `${s.avgSlippageBps} bps`, sub: `${s.avgLatencyMs} ms gecikme` }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: s.avgFidelity >= 70 ? 'green' : 'yellow', label: 'SADAKAT', value: `${s.avgFidelity}/100`, sub: 'Sinyal planına uyum', subColor: s.avgFidelity >= 70 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: s.executionLoss >= 0 ? 'green' : 'red', label: 'UYGULAMA FARKI', value: rTxt(s.executionLoss), sub: `Sinyal ${rTxt(s.signalNetR)} → Kullanıcı ${rTxt(s.userNetR)}`, subColor: clsNum(s.executionLoss) }));
  host.appendChild(stats);

  const tabs = el('div', { class: 'tab-strip section' },
    el('button', { class: 'tb active' }, `Tümü (${s.totalOrders})`),
    el('button', { class: 'tb' }, `Gerçekleşen (${s.filled})`),
    el('button', { class: 'tb' }, `İptal (${s.cancelled})`),
    el('button', { class: 'tb' }, `Reddedilen (${s.rejected})`),
    el('button', { class: 'tb' }, 'Plan Sapmalı'),
    el('button', { class: 'tb' }, 'TP / SL')
  );
  host.appendChild(tabs);

  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'ZAMAN'),
    el('th', {}, 'COIN'),
    el('th', {}, 'YÖN'),
    el('th', {}, 'TİP'),
    el('th', { class: 'r' }, 'FİYAT'),
    el('th', { class: 'r' }, 'TOPLAM'),
    el('th', { class: 'r' }, 'SLIPPAGE'),
    el('th', { class: 'r' }, 'PLAN R'),
    el('th', { class: 'r' }, 'KULL. R'),
    el('th', {}, 'SADAKAT'),
    el('th', {}, 'DURUM'),
    el('th', {}, 'NOT')
  )));
  const tb = el('tbody', {});
  rep.orders.slice(0, 26).forEach(o => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'muted' }, String(o.id)),
      el('td', { class: 'mono small' }, timeLabel(o.time)),
      el('td', {}, coinPill(o.asset)),
      el('td', {}, el('span', { class: 'tag ' + (o.direction === 'LONG' ? 'green' : 'red') }, o.direction)),
      el('td', {}, el('span', { class: 'tag gray' }, o.type)),
      el('td', { class: 'r mono' }, '$' + fmtPrice(o.price)),
      el('td', { class: 'r mono' }, '$' + Number(o.notional || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })),
      el('td', { class: 'r mono ' + (Number(o.slippageBps) <= 8 ? 'pos' : 'warn') }, `${o.slippageBps} bps`),
      el('td', { class: 'r mono ' + clsNum(o.plannedR) }, rTxt(o.plannedR)),
      el('td', { class: 'r mono bold ' + clsNum(o.userR) }, rTxt(o.userR)),
      el('td', {}, el('div', { style: 'min-width:100px' }, el('div', { class: 'small mono ' + (o.fidelity >= 70 ? 'pos' : 'warn') }, `${Number(o.fidelity).toFixed(1)}/100`), barbar(o.fidelity, 100, o.fidelity >= 70 ? 'green' : 'yellow'))),
      el('td', {}, el('span', { class: 'tag ' + o.statusClass }, o.status)),
      el('td', { class: 'small muted' }, o.note)
    ));
  });
  tbl.appendChild(tb);
  host.appendChild(card({ title: 'RUx MANUEL EMİR / PLAN SADAKAT KAYDI', body: el('div', { class: 'tbl-wrap' }, tbl) }));

  const row = el('div', { class: 'row cols-3 section' });
  const donutBox = el('div', {});
  donutBox.appendChild(el('div', { class: 'flex center mt-6' }, donut({
    data: [
      { value: s.filled, color: '#10b981' },
      { value: s.cancelled, color: '#f59e0b' },
      { value: s.rejected, color: '#ef4444' }
    ],
    size: 136, thickness: 18, centerTitle: 'FILL', centerValue: `%${s.fillRate}`
  })));
  donutBox.appendChild(el('div', { class: 'donut-legend mt-10' },
    el('div', { class: 'li' }, el('i', { style: 'background:#10b981' }), el('span', { class: 'nm' }, 'Gerçekleşen'), el('span', { class: 'vl' }, String(s.filled))),
    el('div', { class: 'li' }, el('i', { style: 'background:#f59e0b' }), el('span', { class: 'nm' }, 'İptal'), el('span', { class: 'vl' }, String(s.cancelled))),
    el('div', { class: 'li' }, el('i', { style: 'background:#ef4444' }), el('span', { class: 'nm' }, 'Reddedilen'), el('span', { class: 'vl' }, String(s.rejected)))
  ));
  row.appendChild(card({ title: 'YÜRÜTME DAĞILIMI', body: donutBox }));

  const chCard = el('div', { class: 'card' });
  chCard.appendChild(el('div', { class: 'card-title' }, 'SİNYAL R vs KULLANICI R'));
  const ch = el('div', { class: 'chart-host short mt-6' });
  chCard.appendChild(ch);
  setTimeout(() => {
    let sig = 0, usr = 0;
    const sigCurve = [0], usrCurve = [0];
    rep.fidelity.executions.forEach(e => { sig += Number(e.plannedR || 0); usr += Number(e.userR || 0); sigCurve.push(sig); usrCurve.push(usr); });
    canvasLineChart(ch, [
      { values: sigCurve, color: 'rgba(34,211,238,0.8)', width: 1.4 },
      { values: usrCurve, color: '#10b981', width: 2, fill: true }
    ]);
  }, 70);
  chCard.appendChild(el('div', { class: 'flex gap-12 mt-6 small' },
    el('span', {}, el('span', { style: 'color:#22d3ee' }, '●'), ' RUx teorik sinyal'),
    el('span', {}, el('span', { style: 'color:#10b981' }, '●'), ' Kullanıcı uygulaması')
  ));
  row.appendChild(chCard);

  const quality = el('div', {});
  [
    ['Yürütme Kalitesi', `${s.executionQuality}/100`, s.executionQuality >= 75 ? 'pos' : 'warn'],
    ['Ortalama Slippage', `${s.avgSlippageBps} bps`, s.avgSlippageBps <= 8 ? 'pos' : 'warn'],
    ['Ortalama Gecikme', `${s.avgLatencyMs} ms`, s.avgLatencyMs <= 250 ? 'pos' : 'warn'],
    ['Sinyal Net-R', rTxt(s.signalNetR), clsNum(s.signalNetR)],
    ['Kullanıcı Net-R', rTxt(s.userNetR), clsNum(s.userNetR)],
    ['Uygulama Kaybı/Kazancı', rTxt(s.executionLoss), clsNum(s.executionLoss)],
  ].forEach(([k,v,c]) => quality.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + c }, v))));
  row.appendChild(card({ title: 'UYGULAMA SADAKAT ÖZETİ', body: quality }));
  host.appendChild(row);
}
