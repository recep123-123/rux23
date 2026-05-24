/* RUx — Piyasa Özeti (image 3) */
import { State, fetchMarket, fetchCMC, fetchFearGreed, fetchNews, fetchTickers, el, fmtPrice, fmtPct, fmtNum, toast } from './api.js?v=0.75.14-heatmap-micro-polish-20260524';
import { ICN, statCard, card, pageHead, halfGauge, sparkline, donut, coinPill, heatColorClass } from './components.js?v=0.75.14-heatmap-micro-polish-20260524';
import { canvasLineChart } from './charts.js?v=0.75.14-heatmap-micro-polish-20260524';
import { addDashboardWidget } from './rux_actions.js?v=0.75.14-heatmap-micro-polish-20260524';
import { makeDemoCandles, makeRegimeHysteresisReport } from './rux_core.js?v=0.75.14-heatmap-micro-polish-20260524';

export async function renderPiyasa(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'PİYASA ÖZETİ',
    subtitle: 'Kripto para piyasalarının genel görünümü ve ana performans göstergeleri.',
    actions: [
      el('div', { class: 'select' }, '24h ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow', on: { click: () => { addDashboardWidget({ type: 'market-overview', title: 'Piyasa Özeti Widget', subtitle: 'Toplam piyasa, breadth ve risk takibi' }); toast('Piyasa özeti widgetı Kokpit’e eklendi.', 'success', 'RUx Widget'); } } }, ICN.plus(12), 'WIDGET EKLE'),
      el('button', { class: 'btn' }, ICN.gear(12), 'ÖZELLEŞTİR'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-8 section' });
  stats.appendChild(statCard({ icon: ICN.bitcoin(18), iconColor: 'yellow', label: 'BTC FİYATI', value: '$80,286.15', sub: '+0.88% ($698.24)', subColor: 'pos', sparkSeries: 1 }));
  stats.appendChild(statCard({ icon: ICN.cube(18), iconColor: 'purple', label: 'ETH FİYATI', value: '$2,592.31', sub: '+1.21% ($30.94)', subColor: 'pos', sparkSeries: 1 }));
  stats.appendChild(statCard({ icon: ICN.pie(18), iconColor: 'green', label: 'TOPLAM PİYASA DEĞERİ', value: '$2.53T', sub: '+0.67%', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'blue', label: 'ALTCOIN BREADTH', value: '62 / 100', sub: 'Nötr - Pozitif' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'yellow', label: 'KORKU & AÇGÖZLÜLÜK', value: '72', sub: 'Açgözlülük', subColor: 'warn' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: '', label: 'FUNDING REJİMİ', value: 'Nötr', sub: '0.010%' }));
  stats.appendChild(statCard({ icon: ICN.bitcoin(18), iconColor: 'yellow', label: 'BTC DOMINANCE', value: '54.21%', sub: '-0.21%', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'red', label: 'PİYASA VOLATİLİTESİ', value: '48.7', sub: 'Orta', subColor: 'warn' }));
  host.appendChild(stats);
  hydratePiyasaLiveStats(stats);
  host.appendChild(buildRuxRegimeHysteresisCard());

  // Main 3-column row
  const row = el('div', { class: 'row fr-2-1-1 section' });
  row.appendChild(buildLeadersCard());
  row.appendChild(buildHeatmapCard());
  row.appendChild(buildBreadthCard());
  host.appendChild(row);

  // Bottom row
  const row2 = el('div', { class: 'row fr-1-1-1 section', style: 'grid-template-columns:1fr 1fr 1fr' });
  row2.appendChild(buildNewsPulseCard());
  row2.appendChild(buildDominanceCard());
  row2.appendChild(buildFearGreedCard());
  host.appendChild(row2);
}



function setPiyasaStat(stats, label, value, sub, tone = '') {
  const card = Array.from(stats.querySelectorAll('.stat-card')).find(c => (c.querySelector('.label')?.textContent || '').trim().toUpperCase() === String(label).toUpperCase());
  if (!card) return;
  const valEl = card.querySelector('.val');
  const subEl = card.querySelector('.sub');
  if (valEl) valEl.textContent = value;
  if (subEl) { subEl.textContent = sub || ''; subEl.className = 'sub ' + (tone || ''); }
}
function marketPct(m) {
  const t = m?.ticker || {};
  const ch = Number(t.change ?? t.priceChangePercent ?? t.change24h);
  if (Number.isFinite(ch)) return ch;
  const candles = m?.candles || [];
  const first = candles[0]?.close, last = candles.at?.(-1)?.close;
  return first ? ((last - first) / first) * 100 : null;
}
async function hydratePiyasaLiveStats(stats) {
  let disposed = false;
  const tick = async () => {
    if (disposed || !document.body.contains(stats)) { disposed = true; return; }
    try {
      const [btc, eth] = await Promise.all([fetchMarket('BTCUSDT', '4h', 240), fetchMarket('ETHUSDT', '4h', 240)]);
      const bp = Number(btc?.ticker?.price ?? btc?.candles?.at?.(-1)?.close);
      const ep = Number(eth?.ticker?.price ?? eth?.candles?.at?.(-1)?.close);
      const bpct = marketPct(btc), epct = marketPct(eth);
      const ex = String(btc?.activeExchange || eth?.activeExchange || '').toUpperCase() || 'ROUTER';
      if (Number.isFinite(bp)) setPiyasaStat(stats, 'BTC FİYATI', '$' + fmtPrice(bp), Number.isFinite(bpct) ? fmtPct(bpct) + ' · ' + ex : ex, bpct >= 0 ? 'pos' : 'neg');
      if (Number.isFinite(ep)) setPiyasaStat(stats, 'ETH FİYATI', '$' + fmtPrice(ep), Number.isFinite(epct) ? fmtPct(epct) + ' · ' + ex : ex, epct >= 0 ? 'pos' : 'neg');
      const fr = Number(btc?.derivatives?.fundingRate);
      if (Number.isFinite(fr)) setPiyasaStat(stats, 'FUNDING REJİMİ', Math.abs(fr) < 0.0002 ? 'Nötr' : (fr > 0 ? 'Pozitif' : 'Negatif'), (fr * 100).toFixed(4) + '% · live', Math.abs(fr) < 0.0002 ? 'warn' : fr > 0 ? 'pos' : 'neg');
      // Korku & Açgözlülük — gerçek veri (Alternative.me, ücretsiz)
      try {
        const fg = await fetchFearGreed();
        const fgVal = Number(fg?.value);
        if (Number.isFinite(fgVal)) {
          const cls = fgVal >= 75 ? 'Aşırı Açgözlülük' : fgVal >= 55 ? 'Açgözlülük' : fgVal >= 45 ? 'Nötr' : fgVal >= 25 ? 'Korku' : 'Aşırı Korku';
          const tone = fgVal >= 55 ? 'warn' : fgVal >= 45 ? 'muted' : 'neg';
          setPiyasaStat(stats, 'KORKU & AÇGÖZLÜLÜK', String(fgVal), cls, tone);
          // Sayfadaki yarım gauge'ı da güncelle
          const gaugeHost = document.querySelector('[data-fg-gauge]');
          if (gaugeHost) {
            gaugeHost.innerHTML = '';
            gaugeHost.appendChild(halfGauge({ value: fgVal, label: cls.toUpperCase(), size: 200 }));
          }
        }
      } catch {}
      // BTC Dominance + Toplam Piyasa Değeri — gerçek global metrikler
      try {
        const cmc = await fetchCMC();
        const g = cmc?.global_metrics;
        if (g) {
          const total = Number(g.total_market_cap);
          const btcD = Number(g.btc_dominance);
          const totalChg = Number(g.total_market_cap_yesterday_percentage_change);
          if (Number.isFinite(total) && total > 0) {
            setPiyasaStat(stats, 'TOPLAM PİYASA DEĞERİ', '$' + (total / 1e12).toFixed(2) + 'T', Number.isFinite(totalChg) ? (totalChg >= 0 ? '+' : '') + totalChg.toFixed(2) + '%' : 'canlı', totalChg >= 0 ? 'pos' : 'neg');
          }
          if (Number.isFinite(btcD)) {
            setPiyasaStat(stats, 'BTC DOMINANCE', btcD.toFixed(2) + '%', 'CoinGecko', 'muted');
          }
        }
      } catch {}
    } catch {}
  };
  await tick();
  const timer = setInterval(() => {
    if (!document.body.contains(stats)) { disposed = true; clearInterval(timer); return; }
    if (!document.hidden) tick();
  }, 5_000);
}

function buildRuxRegimeHysteresisCard() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('rux.lastRegimeSnapshot') || 'null'); } catch {}
  const report = makeRegimeHysteresisReport(makeDemoCandles(260), saved?.key || saved?.active || null);
  const cur = report.current || {};
  const probs = report.entries || [];
  const toneClass = report.tone === 'green' ? 'pos' : report.tone === 'red' ? 'neg' : 'warn';
  const probGrid = el('div', { class: 'row cols-5 mt-10' }, ...probs.map(x => el('div', { class: 'rux-rule-metric' },
    el('div', { class: 'tiny muted' }, x.label),
    el('div', { class: 'mono bold mt-2 ' + (x.key === cur.key ? toneClass : '') }, x.value + '%'),
    el('div', { style: 'height:5px; background:rgba(148,163,184,.16); border-radius:999px; overflow:hidden; margin-top:7px;' },
      el('i', { style: `display:block;height:100%;width:${Math.max(3, Number(x.value)||0)}%;background:currentColor;border-radius:999px;opacity:.72;` })
    )
  )));
  const metrics = cur.metrics || {};
  const metricRow = el('div', { class: 'row cols-6 mt-10' },
    miniRegimeMetric('Belirsizlik', (cur.uncertainty ?? '—') + '/100', cur.uncertainty > 70 ? 'neg' : cur.uncertainty > 55 ? 'warn' : 'pos'),
    miniRegimeMetric('Güven', (cur.confidence ?? '—') + '/100', cur.confidence >= 70 ? 'pos' : cur.confidence >= 50 ? 'warn' : 'neg'),
    miniRegimeMetric('ATR %', (metrics.atrPct ?? '—') + '%'),
    miniRegimeMetric('Range Genişliği', (metrics.widthPct ?? '—') + '%'),
    miniRegimeMetric('EMA Eğimi', (metrics.emaSlopePct ?? '—') + '%'),
    miniRegimeMetric('Sıkışma', (metrics.compressionPct ?? '—') + '/100')
  );
  const warnings = (report.warnings || []).slice(0, 3);
  return card({
    title: 'RUx OLASILIKSAL REJİM + HYSTERESIS',
    actions: [el('span', { class: 'tag ' + (report.tone || 'yellow') }, report.decision || 'REJİM İZLE')],
    body: el('div', {},
      el('div', { class: 'flex between gap-12' },
        el('div', {},
          el('div', { class: 'tiny muted' }, 'AKTİF REJİM'),
          el('div', { class: 'bold mt-2 ' + toneClass, style: 'font-size:18px;' }, cur.active || 'NÖTR'),
          el('div', { class: 'small muted mt-4' }, `Aday: ${cur.candidate || '—'} · Önceki: ${cur.previousActive || '—'} · ${cur.transition || 'normal'}`)
        ),
        el('div', { class: 'rux-plan-cell' },
          el('div', { class: 'tiny muted' }, 'HYSTERESIS'),
          el('div', { class: 'mono bold mt-2' }, cur.hysteresis?.locked ? 'KİLİTLİ' : 'SERBEST'),
          el('div', { class: 'tiny muted mt-2' }, `Giriş ${cur.hysteresis?.enterThreshold ?? 45} · Çıkış ${cur.hysteresis?.exitThreshold ?? 34}`)
        )
      ),
      probGrid,
      metricRow,
      warnings.length ? el('div', { class: 'rux-note warn mt-10' }, warnings.join(' · ')) : el('div', { class: 'rux-note mt-10' }, 'Rejim geçişleri tek eşikle zıplatılmaz; aday rejim baskın değilse önceki rejim korunur.')
    )
  });
}

function miniRegimeMetric(label, value, tone = '') {
  return el('div', { class: 'rux-rule-metric' },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2 ' + tone }, String(value))
  );
}

function buildLeadersCard() {
  const tabs = el('div', { class: 'tab-strip' },
    el('button', { class: 'tb active' }, 'Tümü'),
    el('button', { class: 'tb' }, 'Büyükler'),
    el('button', { class: 'tb' }, 'Orta Ölçek'),
    el('button', { class: 'tb' }, 'Küçükler'),
    el('button', { class: 'tb' }, 'Yeni'),
  );

  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {},
    el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'COIN'),
      el('th', { class: 'r' }, 'FİYAT'),
      el('th', { class: 'r' }, '24S %'),
      el('th', { class: 'r' }, '7G %'),
      el('th', { class: 'r' }, 'PİYASA DEĞERİ'),
      el('th', { class: 'r' }, '24S HACİM'),
      el('th', { class: 'r' }, 'DOM.'),
    )
  ));
  const rows = [
    ['BTC','Bitcoin',80286.15,0.88,5.21,1.58,18.72,54.21],
    ['ETH','Ethereum',2592.31,1.21,6.87,312.24,8.36,10.74],
    ['USDT','Tether',1.00,0.01,0.01,112.23,31.52,3.84],
    ['XRP','XRP',0.5231,0.72,3.64,28.11,1.24,0.96],
    ['BNB','BNB',597.18,1.02,4.02,86.17,1.12,2.97],
    ['SOL','Solana',180.42,2.15,8.31,82.68,2.45,2.84],
    ['USDC','USD Coin',1.00,0.00,0.00,32.16,4.62,1.10],
    ['DOGE','Dogecoin',0.1793,0.45,2.17,25.79,0.98,0.88],
  ];
  const tbody = el('tbody', { 'data-leaders-body': '1' });
  rows.forEach(([sh, name, price, ch, ch7, mc, vol, dom], i) => {
    tbody.appendChild(el('tr', {},
      el('td', { class: 'muted' }, String(i+1)),
      el('td', {}, coinPill(sh + 'USDT', name)),
      el('td', { class: 'r mono' }, '$' + (price >= 1 ? price.toLocaleString() : price.toFixed(4))),
      el('td', { class: 'r mono ' + (ch >= 0 ? 'pos' : 'neg') }, fmtPct(ch)),
      el('td', { class: 'r mono ' + (ch7 >= 0 ? 'pos' : 'neg') }, fmtPct(ch7)),
      el('td', { class: 'r mono' }, '$' + mc.toFixed(2) + 'B'),
      el('td', { class: 'r mono muted' }, '$' + vol.toFixed(2) + 'B'),
      el('td', { class: 'r mono' }, dom.toFixed(2) + '%'),
    ));
  });
  tbl.appendChild(tbody);
  hydrateLeadersTable(tbody, rows);
  return card({
    title: 'PİYASA LİDERLERİ',
    actions: [tabs],
    body: el('div', { 'data-rux-source': 'LIVE' }, el('div', { class: 'tbl-wrap' }, tbl), el('div', { class: 'card-link mt-10 text-center', style: 'padding-top:8px; border-top:1px solid var(--bd-1)' }, 'TÜM PİYASALARI GÖR'))
  });
}

// Piyasa Liderleri tablosunu gerçek borsa fiyatlarıyla doldurur (canlı, 20sn TTL).
// 7G, piyasa değeri ve dominans için statik referansları korur (ticker bunları vermez),
// ama FİYAT ve 24S % gerçek canlı veriye geçer.
async function hydrateLeadersTable(tbody, fallbackRows) {
  const SYMS = fallbackRows.map(r => r[0]);
  const refMap = new Map(fallbackRows.map(r => [r[0], { name: r[1], ch7: r[4], mc: r[5], dom: r[7] }]));
  const fill = async () => {
    if (!document.body.contains(tbody)) return false;
    try {
      const res = await fetchTickers(SYMS);
      const list = res?.tickers;
      if (!Array.isArray(list) || !list.length) return true;
      // Piyasa değerine göre sırala (referans mc ile)
      const ordered = list.map(t => ({ ...t, ref: refMap.get(t.base) || {} }))
        .sort((a, b) => (b.ref.mc || 0) - (a.ref.mc || 0));
      tbody.innerHTML = '';
      ordered.forEach((t, i) => {
        const price = Number(t.price);
        const ref = t.ref;
        tbody.appendChild(el('tr', {},
          el('td', { class: 'muted' }, String(i + 1)),
          el('td', {}, coinPill(t.symbol, ref.name || t.base)),
          el('td', { class: 'r mono' }, '$' + (price >= 1 ? price.toLocaleString('en-US', { maximumFractionDigits: 2 }) : price.toFixed(4))),
          el('td', { class: 'r mono ' + (t.change24h >= 0 ? 'pos' : 'neg') }, fmtPct(t.change24h)),
          el('td', { class: 'r mono ' + ((ref.ch7 ?? 0) >= 0 ? 'pos' : 'neg') }, fmtPct(ref.ch7 ?? 0)),
          el('td', { class: 'r mono' }, ref.mc != null ? '$' + ref.mc.toFixed(2) + 'B' : '—'),
          el('td', { class: 'r mono muted' }, t.volumeUsd ? '$' + (t.volumeUsd / 1e9).toFixed(2) + 'B' : '—'),
          el('td', { class: 'r mono' }, ref.dom != null ? ref.dom.toFixed(2) + '%' : '—'),
        ));
      });
    } catch {}
    return true;
  };
  await fill();
  const timer = setInterval(async () => {
    const alive = await fill();
    if (!alive) clearInterval(timer);
  }, 20_000);
}

function buildHeatmapCard() {
  const tabs = el('div', { class: 'tab-strip' },
    el('button', { class: 'tb' }, 'Piyasa Değeri'),
    el('button', { class: 'tb active' }, '24s %'),
    el('button', { class: 'tb' }, 'Sektör'),
  );
  const grid = el('div', { class: 'heatmap', style: 'grid-template-columns: 2fr 2fr 1fr;' });
  // Big BTC + ETH + many small
  const cells = [
    { sym: 'BTC', pct: 0.88, mc: '$1.58T', span: 'grid-row: span 2;' },
    { sym: 'ETH', pct: 1.21, mc: '$312B', span: 'grid-row: span 2;' },
    { sym: 'BNB', pct: 1.02, mc: '$86.2B' },
    { sym: 'SOL', pct: 2.15, mc: '$82.7B' },
    { sym: 'XRP', pct: 0.72, mc: '$28.1B' },
    { sym: 'DOGE', pct: 0.45, mc: '$25.8B' },
    { sym: 'ADA', pct: 0.88, mc: '$8.6B' },
    { sym: 'AVAX', pct: 1.31, mc: '$8.2B' },
    { sym: 'ATOM', pct: 0.69, mc: '$5.1B' },
    { sym: 'ARB', pct: 1.78, mc: '$4.4B' },
    { sym: 'OP', pct: 1.43, mc: '$3.7B' },
    { sym: 'MATIC', pct: 0.62, mc: '$3.4B' },
    { sym: 'UNI', pct: 2.21, mc: '$3.2B' },
    { sym: 'AAVE', pct: 0.84, mc: '$2.9B' },
    { sym: 'MKR', pct: 0.91, mc: '$2.7B' },
    { sym: 'SHIB', pct: -0.12, mc: '$11.4B' },
    { sym: 'PEPE', pct: 0.39, mc: '$8.1B' },
    { sym: 'BONK', pct: -0.35, mc: '$1.3B' },
  ];
  cells.forEach(c => {
    const cell = el('div', { class: 'heat-cell ' + heatColorClass(c.pct), style: c.span || '', 'data-heat-sym': c.sym });
    cell.appendChild(el('div', { class: 'nm' }, c.sym));
    cell.appendChild(el('div', { class: 'pc' }, fmtPct(c.pct)));
    cell.appendChild(el('div', { class: 'v' }, c.mc));
    grid.appendChild(cell);
  });
  hydrateHeatmap(grid, cells.map(c => c.sym));
  // legend
  const scale = el('div', { class: 'flex between mt-10', style: 'font-size:10px; color:var(--fg-4)' },
    el('span', {}, '-6%'), el('span', {}, '-3%'), el('span', {}, '-1%'), el('span', {}, '0%'), el('span', {}, '+1%'), el('span', {}, '+3%'), el('span', {}, '+6%')
  );
  return card({
    title: el('span', { class: 'flex items-center gap-6' }, 'PİYASA ISI HARİTASI ', el('span', { class: 'info' }, '?')),
    actions: [tabs],
    body: el('div', { 'data-rux-source': 'LIVE' }, grid, scale)
  });
}

// Isı haritası hücrelerini gerçek 24s % değişimle günceller (canlı).
async function hydrateHeatmap(grid, syms) {
  const fill = async () => {
    if (!document.body.contains(grid)) return false;
    try {
      const res = await fetchTickers(syms);
      const list = res?.tickers;
      if (!Array.isArray(list) || !list.length) return true;
      const map = new Map(list.map(t => [t.base, t]));
      grid.querySelectorAll('[data-heat-sym]').forEach(cell => {
        const t = map.get(cell.getAttribute('data-heat-sym'));
        if (!t) return;
        const pct = Number(t.change24h);
        cell.className = 'heat-cell ' + heatColorClass(pct) + (cell.style.gridRow ? '' : '');
        const pc = cell.querySelector('.pc');
        if (pc) pc.textContent = fmtPct(pct);
      });
    } catch {}
    return true;
  };
  await fill();
  const timer = setInterval(async () => { if (!(await fill())) clearInterval(timer); }, 20_000);
}

function buildBreadthCard() {
  const tabs = el('div', { class: 'tab-strip' },
    el('button', { class: 'tb active' }, 'Tümü'),
    el('button', { class: 'tb' }, 'Büyükler'),
    el('button', { class: 'tb' }, 'Orta Ölçek'),
    el('button', { class: 'tb' }, 'Küçükler'),
  );
  const dn = donut({ data: [
    { value: 1254, color: '#10b981' },
    { value: 396, color: '#f59e0b' },
    { value: 370, color: '#ef4444' },
  ], size: 150, thickness: 18, centerTitle: 'YÜKSELİŞTE', centerValue: '62%' });

  const legend = el('div', { class: 'donut-legend' },
    el('div', { class: 'li' }, el('i', { style: 'background:#10b981' }), el('span', { class: 'nm' }, 'Yükselen'), el('span', { class: 'vl' }, '1,254 (62%)')),
    el('div', { class: 'li' }, el('i', { style: 'background:#f59e0b' }), el('span', { class: 'nm' }, 'Yatay'), el('span', { class: 'vl' }, '396 (20%)')),
    el('div', { class: 'li' }, el('i', { style: 'background:#ef4444' }), el('span', { class: 'nm' }, 'Düşen'), el('span', { class: 'vl' }, '370 (18%)')),
  );

  const foot = el('div', { class: 'mt-12', style: 'border-top:1px solid var(--bd-1); padding-top:8px;' },
    el('div', { class: 'flex between small' }, el('span', { class: 'muted' }, '52 Haftalık Yeni Zirve'), el('span', { class: 'pos bold' }, '118')),
    el('div', { class: 'flex between small mt-4' }, el('span', { class: 'muted' }, '52 Haftalık Yeni Dip'), el('span', { class: 'neg bold' }, '23')),
    el('div', { class: 'flex mt-8', style: 'height:6px; gap:1px;' },
      el('div', { style: 'flex:62; background:#10b981; border-radius:3px 0 0 3px' }),
      el('div', { style: 'flex:20; background:#f59e0b' }),
      el('div', { style: 'flex:18; background:#ef4444; border-radius:0 3px 3px 0' }),
    )
  );
  return card({
    title: el('span', { class: 'flex items-center gap-6' }, 'PİYASA GENİŞLİĞİ ', el('span', { class: 'info' }, '?')),
    actions: [tabs],
    body: el('div', {}, el('div', { class: 'flex center mt-8' }, dn), legend, foot)
  });
}

function buildNewsPulseCard() {
  const items = [
    ['15:43','HABER','haber','BlackRock, Bitcoin ETF\'i üst üste 12. günde net giriş kaydetti.'],
    ['15:31','ON-CHAIN','onchain','Whale adresi 12,450 BTC\'yi borsalardan çekti.'],
    ['15:18','PİYASA','piyasa','ABD spot BTC ETF\'lerine toplamda +216M$ net giriş yaşandı.'],
    ['15:02','MAKRO','macro','Fed üyeleri faiz indirimi için temkinli konuştu.'],
    ['14:47','FUNDING','funding','SOL/USDT funding oranı nötr seviyeye geriledi.'],
  ];
  const list = el('div', {});
  items.forEach(([t, c, cls, m]) => {
    list.appendChild(el('div', { style: 'display:grid; grid-template-columns: 50px 80px 1fr; gap:6px; padding:7px 0; border-bottom: 1px dashed var(--bd-1); font-size:12px;' },
      el('span', { class: 'mono muted small' }, t),
      el('span', {}, el('span', { class: 'chip-cat ' + cls }, c)),
      el('span', { style: 'color:var(--fg-2)' }, m),
    ));
  });
  return card({
    title: el('span', { class: 'flex items-center gap-6' }, ICN.pulse(13), 'NEWS PULSE'),
    link: 'TÜMÜNÜ GÖR',
    body: list
  });
}

function buildDominanceCard() {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'DOMİNANCE GRAFİĞİ'),
    el('div', { class: 'card-actions' },
      el('button', { class: 'btn tiny ghost' }, '7G'),
      el('button', { class: 'btn tiny' , style: 'background:rgba(34,211,238,0.14); color:var(--c-cyan)'}, '30G'),
      el('button', { class: 'btn tiny ghost' }, '90G'),
      el('button', { class: 'btn tiny ghost' }, '1Y'),
    )
  ));
  const legend = el('div', { class: 'flex gap-12 small mt-6' },
    el('span', {}, '● ', el('span', { style: 'color:#f59e0b' }, 'BTC.D 54.21%')),
    el('span', {}, '● ', el('span', { style: 'color:#06b6d4' }, 'ETH.D 10.74%')),
    el('span', {}, '● ', el('span', { style: 'color:#10b981' }, 'OTHERS.D 35.05%')),
  );
  wrap.appendChild(legend);
  const chartHost = el('div', { class: 'chart-host short mt-6' });
  wrap.appendChild(chartHost);
  setTimeout(() => {
    const N = 60;
    const btc = [], eth = [], oth = [];
    for (let i = 0; i < N; i++) {
      btc.push(54 + Math.sin(i/8)*1.2 + Math.random()*0.4);
      eth.push(10.5 + Math.cos(i/10)*0.6 + Math.random()*0.2);
      oth.push(100 - btc[i] - eth[i]);
    }
    canvasLineChart(chartHost, [
      { values: btc, color: '#f59e0b', width: 1.6 },
      { values: eth, color: '#06b6d4', width: 1.6 },
      { values: oth, color: '#10b981', width: 1.6 },
    ]);
  }, 50);
  return wrap;
}

function buildFearGreedCard() {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'KORKU & AÇGÖZLÜLÜK'),
    el('span', { class: 'card-link' }, ICN.refresh(12))
  ));
  wrap.appendChild(el('div', { class: 'flex center mt-10', 'data-fg-gauge': '1' }, halfGauge({ value: 50, label: 'YÜKLENİYOR', size: 200 })));
  wrap.appendChild(el('div', { class: 'flex between small mt-10', style: 'border-top:1px solid var(--bd-1); padding-top:10px' },
    el('span', { class: 'muted' }, 'Dün: 68'),
    el('span', { class: 'muted' }, 'Geçen Hafta: 65'),
  ));
  const narr = el('div', { class: 'card mt-10', style: 'background:var(--bg-card-2)' });
  narr.appendChild(el('div', { class: 'flex between' },
    el('div', { class: 'card-title' }, 'PİYASA NARATİFİ'),
    el('span', { class: 'tiny muted' }, '15:48:12 (UTC+3)')
  ));
  narr.appendChild(el('div', { class: 'small mt-8', style: 'color:var(--fg-2); display:flex; gap:6px' }, ICN.bitcoin(14), 'Bitcoin 80K üzerinde güçlü kalmaya devam ediyor. Spot talep artışı ve ETF girişleri destekliyor.'));
  narr.appendChild(el('div', { class: 'small mt-6', style: 'color:var(--fg-2); display:flex; gap:6px' }, ICN.cube(14), 'Ethereum\'da staking çıkışları azalıyor. Shapella sonrası en düşük seviye.'));
  narr.appendChild(el('div', { class: 'small mt-6', style: 'color:var(--fg-2); display:flex; gap:6px' }, ICN.bars(14), 'Altcoin piyasasında seçici yükseliş eğilimi. L1 ve AI temalı projelerde hacim artışı var.'));
  narr.appendChild(el('div', { class: 'small mt-6', style: 'color:var(--fg-2); display:flex; gap:6px' }, ICN.pulse(14), 'Funding oranları nötr bölgeye geriledi. Aşırı kaldıraç riski azaldı.'));
  narr.appendChild(el('div', { class: 'card-link mt-10', style: 'text-align:right' }, 'TÜM NARATİFİ GÖR ', ICN.externalLink(10)));
  wrap.appendChild(narr);
  return wrap;
}
