/* RUx — Katı PA Kuralları (image 19) */
import { State, fetchMarket, el } from './api.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { ICN, statCard, card, pageHead, checklist, ringGauge } from './components.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.11-heatmap-tf-recalibration-20260524';

export async function renderKatiPa(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'KATI PA KURALLARI',
    subtitle: 'Disiplinli Price Action: 10 katı kural ile setup teyidi.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxSymbolSelect')?.focus?.() } }, (State.symbol || 'BTCUSDT').replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, (State.tf || '4h') + ' ', ICN.chev(10)),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ringGauge({ value: 9, max: 10, size: 32, color: '#10b981' }), iconColor: 'green', label: 'GEÇEN KURAL', value: '9 / 10', sub: 'Yüksek Disiplin', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'GENEL UYUM', value: '%92', sub: 'Çok İyi', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'İHLALLER (24S)', value: '1', sub: 'Düşük Risk' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'ONAYLI SETUP', value: '14', sub: 'Tüm kurallar geçti', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'yellow', label: 'REDDEDİLEN', value: '6', sub: 'Filtrelendi' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'KURAL SAĞLAMLIĞI', value: '88 / 100', sub: 'Yüksek', subColor: 'pos' }));
  host.appendChild(stats);

  // Chart + 10 rule list
  const row = el('div', { class: 'row fr-2-1 section' });
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, 'BTC/USDT · 4s · RUx'),
    el('span', { class: 'ohlc' }, ' A', el('span', { class: 'up' }, '80,112.40'), ' Y', el('span', {}, '80,432.10'), ' D', el('span', { class: 'dn' }, '79,982.20'), ' K', el('span', { class: 'up' }, '80,286.15')),
  ));
  wrap.appendChild(el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'BOS Yukarı'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'CHoCH Aşağı'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#06b6d4' }), 'Giriş Bölgesi'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#f59e0b' }), 'Stop'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'Hedef'),
  ));
  const chartHost = el('div', { class: 'chart-host tall' });
  wrap.appendChild(chartHost);
  setTimeout(async () => {
    let candles = [];
    try {
      const d = await fetchMarket(State.symbol, '4h', 200);
      candles = normalizeCandleInput(d?.candles || d?.ohlcv || []);
    } catch {}
    if (candles.length < 10) {
      let p = 76000; const now = Math.floor(Date.now()/1000);
      for (let i = 0; i < 200; i++) {
        const o = p, c = p + (Math.random()-0.46)*700;
        candles.push({ time: now - (200-i)*14400, open: o, high: Math.max(o,c)+Math.random()*200, low: Math.min(o,c)-Math.random()*200, close: c, volume: 1500 });
        p = c;
      }
    }
    const { chart, series } = makeCandleChart(chartHost);
    series.setData(candles);
    addEmaLine(chart, candles, 20, '#06b6d4');
    addEmaLine(chart, candles, 50, '#f97316');
  }, 60);
  // Market structure box
  wrap.appendChild(el('div', { class: 'flex gap-12 mt-10 small', style: 'background: var(--bg-card-2); padding: 10px 14px; border-radius:10px;' },
    el('span', {}, el('span', { class: 'tiny muted' }, 'YAPI '), el('span', { class: 'pos bold' }, 'HH/HL')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'BOS '), el('span', { class: 'pos bold' }, 'YUKARI')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'GİRİŞ '), el('span', { class: 'mono cyan' }, '79,800-80,200')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'STOP '), el('span', { class: 'mono neg' }, '78,200')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'HEDEF '), el('span', { class: 'mono pos' }, '82,450 / 84,250')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'R:R '), el('span', { class: 'cyan bold' }, '1:2.3')),
  ));
  row.appendChild(wrap);

  // 10-rule check list
  const rules = [
    { state: 'ok', label: '1. Üst zaman dilimi yönü uyumlu', right: 'Bullish' },
    { state: 'ok', label: '2. Yapı netleşmiş (HH/HL)', right: 'HH/HL' },
    { state: 'ok', label: '3. BOS / CHoCH onayı var', right: 'BOS' },
    { state: 'ok', label: '4. Talep / Arz bölgesi tanımlı', right: 'OB Demand' },
    { state: 'ok', label: '5. Hacim onayı mevcut', right: '+%14' },
    { state: 'ok', label: '6. Likidite süpürmesi var', right: 'SSL' },
    { state: 'ok', label: '7. EMA dizilimi uyumlu', right: '20>50>200' },
    { state: 'ok', label: '8. Stop ve hedef seviyeleri net', right: 'OK' },
    { state: 'ok', label: '9. Risk-reward uygun (≥1:1.8)', right: '1:2.3' },
    { state: 'miss', label: '10. Önemli ekonomik veri saati değil', right: 'CPI 17:30' },
  ];
  row.appendChild(card({ title: '10 KATI KURAL', body: checklist(rules) }));
  host.appendChild(row);

  // Violation log + rule matrix + approved/rejected
  const row2 = el('div', { class: 'row cols-3 section' });
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'ZAMAN'), el('th', {}, 'COIN'), el('th', {}, 'KURAL'), el('th', {}, 'AÇIKLAMA'),
  )));
  const tb = el('tbody', {});
  [
    ['15:32','BTCUSDT','#10','CPI saatine 1 saat var'],
    ['14:18','SOLUSDT','#3','BOS onayı henüz yok'],
    ['12:42','AVAXUSDT','#9','R:R yetersiz (1:1.4)'],
    ['11:27','APTUSDT','#1','HTF yön uyumsuz'],
    ['10:05','ARBUSDT','#5','Hacim onayı yok'],
    ['08:41','MATICUSDT','#7','EMA50 üzerinde değil'],
  ].forEach(r => tb.appendChild(el('tr', {},
    el('td', { class: 'mono small muted' }, r[0]),
    el('td', { class: 'small mono' }, r[1]),
    el('td', {}, el('span', { class: 'tag yellow' }, r[2])),
    el('td', { class: 'small' }, r[3]),
  )));
  tbl.appendChild(tb);
  row2.appendChild(card({ title: 'İHLAL GÜNLÜĞÜ', body: tbl }));

  const matrix = el('div', {});
  ['1','2','3','4','5','6','7','8','9','10'].forEach((n, i) => {
    const total = 14 + (i % 3);
    const fail = i === 9 ? 1 : 0;
    const pass = total - fail;
    matrix.appendChild(el('div', { class: 'kv' },
      el('span', { class: 'k' }, 'KURAL #' + n),
      el('span', { class: 'v small flex gap-8' },
        el('span', { class: 'pos mono' }, pass + ' geçti'),
        el('span', { class: 'neg mono' }, fail + ' ihlal'),
      )
    ));
  });
  row2.appendChild(card({ title: 'KURAL MATRİSİ (24S)', body: matrix }));

  const ar = el('div', {});
  ar.appendChild(el('div', { class: 'flex between bold mt-2' }, el('span', { class: 'pos' }, 'ONAYLI SETUPLAR'), el('span', { class: 'pos mono' }, '14')));
  ['BTCUSDT 4h','ETHUSDT 4h','SOLUSDT 1h','LINKUSDT 4h','BNBUSDT 4h'].forEach(s => ar.appendChild(el('div', { class: 'small flex between', style: 'padding:5px 0; border-bottom:1px dashed var(--bd-1)' }, el('span', {}, s), el('span', { class: 'tag green' }, 'AL'))));
  ar.appendChild(el('div', { class: 'flex between bold mt-12' }, el('span', { class: 'neg' }, 'REDDEDİLEN SETUPLAR'), el('span', { class: 'neg mono' }, '6')));
  ['AVAXUSDT 4h #9','APTUSDT 1h #1','ARBUSDT 4h #5','MATICUSDT 1h #7'].forEach(s => ar.appendChild(el('div', { class: 'small flex between', style: 'padding:5px 0; border-bottom:1px dashed var(--bd-1)' }, el('span', {}, s.split(' #')[0]), el('span', { class: 'tag red' }, '#' + s.split(' #')[1]))));
  row2.appendChild(card({ title: 'ONAYLI / REDDEDİLEN SETUPLAR', body: ar }));
  host.appendChild(row2);
}
