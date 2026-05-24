/* RUx — Aralık Sapması (image 20) */
import { State, el } from './api.js?v=0.75.2-funding-responsive-live-20260524';
import { ICN, statCard, card, pageHead, halfGauge, coinPill } from './components.js?v=0.75.2-funding-responsive-live-20260524';
import { canvasLineChart } from './charts.js?v=0.75.2-funding-responsive-live-20260524';

export async function renderAralikSapmasi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'ARALIK SAPMASI',
    subtitle: 'Z-skor bantları ile aşırı sapma tespiti ve mean reversion fırsatları.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxSymbolSelect')?.focus?.() } }, (State.symbol || 'BTCUSDT').replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, (State.tf || '4h') + ' ', ICN.chev(10)),
      el('div', { class: 'select' }, 'Bollinger %20 ', ICN.chev(10)),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'cyan', label: 'Z-SKORU', value: '+1.84', sub: 'Üst Bant Yakını', subColor: 'warn' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'purple', label: 'BOLLINGER %B', value: '0.84', sub: 'Üst Bantta' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'STD. SAPMA', value: '$1,247', sub: '%1.55 (24S)' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'AŞIRI BÖLGEDE', value: 'EVET (Üst)', sub: '+1.84 σ', subColor: 'warn' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'MEAN REVERSION', value: '%68', sub: 'Olasılık', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'AÇIKLIK SKORU', value: '76 / 100', sub: 'Yüksek' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'VOLATİLİTE REJİMİ', value: 'Genişleyen', sub: '+%14 (24S)', subColor: 'warn' }));
  host.appendChild(stats);

  // Chart with bands + volatility subchart
  const c1 = el('div', { class: 'card section' });
  c1.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'Z-SKOR BANTLARI'),
    el('div', { class: 'flex gap-6' },
      el('button', { class: 'btn tiny outline-cyan' }, '20'),
      el('button', { class: 'btn tiny ghost' }, '50'),
      el('button', { class: 'btn tiny ghost' }, '100'),
      el('button', { class: 'btn tiny ghost' }, '200'),
    )
  ));
  const chHost = el('div', { class: 'chart-host tall mt-6' });
  c1.appendChild(chHost);
  setTimeout(() => {
    const N = 120;
    const price = []; const upper3 = []; const upper2 = []; const lower2 = []; const lower3 = []; const mean = [];
    let p = 78000;
    for (let i = 0; i < N; i++) {
      p += (Math.random()-0.45) * 800;
      price.push(p);
      mean.push(p - 200 + Math.sin(i/10)*150);
      upper2.push(mean[i] + 1500);
      upper3.push(mean[i] + 2500);
      lower2.push(mean[i] - 1500);
      lower3.push(mean[i] - 2500);
    }
    canvasLineChart(chHost, [
      { values: upper3, color: 'rgba(239,68,68,0.4)', width: 1, dash: [4,4] },
      { values: upper2, color: 'rgba(245,158,11,0.5)', width: 1, dash: [3,3] },
      { values: mean, color: 'rgba(148,163,184,0.6)', width: 1, dash: [2,4] },
      { values: lower2, color: 'rgba(16,185,129,0.5)', width: 1, dash: [3,3] },
      { values: lower3, color: 'rgba(59,130,246,0.4)', width: 1, dash: [4,4] },
      { values: price, color: '#06b6d4', width: 2 },
    ]);
  }, 60);
  c1.appendChild(el('div', { class: 'flex gap-12 mt-6 small' },
    el('span', {}, el('span', { style: 'color:#06b6d4' }, '●'), ' Fiyat'),
    el('span', {}, el('span', { style: 'color: rgba(148,163,184,0.6)' }, '─'), ' Mean'),
    el('span', {}, el('span', { style: 'color:#f59e0b' }, '─'), ' ±2σ'),
    el('span', {}, el('span', { style: 'color:#ef4444' }, '─'), ' ±3σ'),
  ));

  // Vol subchart
  const volHost = el('div', { class: 'chart-host short mt-8', style: 'height:120px' });
  c1.appendChild(el('div', { class: 'flex between mt-8 small muted' }, el('span', {}, 'Volatilite (ATR/Std) ', el('span', { class: 'mono cyan bold' }, '1.247')), el('span', { class: 'mono' }, '15:48:12 (UTC+3)')));
  c1.appendChild(volHost);
  setTimeout(() => {
    const v = []; for (let i = 0; i < 120; i++) v.push(0.5 + Math.abs(Math.sin(i/15))*1.2 + Math.random()*0.3);
    canvasLineChart(volHost, [{ values: v, color: '#a78bfa', width: 1.5, fill: true }]);
  }, 80);
  host.appendChild(c1);

  // Bottom: alarms + extreme zones gauge + mean reversion + ranking
  const row = el('div', { class: 'row fr-1-1-1-2 section', style: 'grid-template-columns: 1fr 1fr 1fr 2fr' });
  // Sapma alarmları
  const alarms = el('div', {});
  [
    ['+3.2σ','BTC','Üst','15:32','red'],
    ['+2.8σ','ETH','Üst','15:18','red'],
    ['+2.4σ','SOL','Üst','14:42','warn'],
    ['-2.1σ','AVAX','Alt','13:12','pos'],
    ['-1.8σ','APT','Alt','12:48','pos'],
    ['+1.6σ','LINK','Üst','11:24','warn'],
  ].forEach(([z, s, t, time, c]) => alarms.appendChild(el('div', { class: 'flex between', style: 'padding:6px 0; border-bottom:1px dashed var(--bd-1); font-size:11.5px' },
    el('span', { class: 'mono small ' + c }, z),
    el('span', { class: 'small mono' }, s),
    el('span', { class: 'small muted' }, t),
    el('span', { class: 'tiny mono muted' }, time),
  )));
  row.appendChild(card({ title: 'SAPMA ALARMLARI', body: alarms }));

  // Extreme zones gauge
  const ex = el('div', { class: 'flex center', style: 'flex-direction:column; gap:8px' });
  ex.appendChild(halfGauge({ value: 76, label: 'AÇIKLIK', size: 200 }));
  ex.appendChild(el('div', { class: 'warn bold mt-4' }, 'AŞIRI BÖLGEDE'));
  const exRows = [
    ['Aşırı Üst (>+2σ)','%18','warn'],
    ['Yukarı Bölge','%34','pos'],
    ['Nötr','%32',''],
    ['Aşağı Bölge','%12','pos'],
    ['Aşırı Alt (<-2σ)','%4','warn'],
  ];
  const exList = el('div', { style: 'width:100%' });
  exRows.forEach(([k, v, c]) => exList.appendChild(el('div', { class: 'kv small' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  ex.appendChild(exList);
  row.appendChild(card({ title: 'EKSTREM BÖLGELER', body: ex }));

  // Mean reversion scenarios
  const mr = el('div', { style: 'display:flex; flex-direction:column; gap:8px' });
  [
    ['Mean Reversion Boğa','green','55','Aşağı sapmada → mean bandına dönüş.'],
    ['Mean Reversion Ayı','red','25','Aşırı yukarı bölgede → mean bandına geri dönüş.'],
    ['Trend Devam','yellow','20','Bant dışında trend devam senaryosu.'],
  ].forEach(([t, c, p, msg]) => mr.appendChild(el('div', { class: 'scenario ' + c },
    el('div', { class: 'flex between' }, el('span', { class: 'ttl' }, t), el('span', { class: 'pr' }, p + '%')),
    el('div', { class: 'small mt-4 muted' }, msg),
  )));
  row.appendChild(card({ title: 'MEAN REVERSION SENARYOLARI', body: mr }));

  // Ranking + recent events
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'COIN'), el('th', { class: 'r' }, 'Z-SKOR'),
    el('th', { class: 'r' }, '%B'), el('th', {}, 'BÖLGE'),
    el('th', { class: 'r' }, 'OLASILIK'), el('th', {}, 'YÖN'),
  )));
  const tb = el('tbody', {});
  [
    [1,'BTCUSDT','+1.84','0.84','Üst','%68','MR-AŞAĞI','warn'],
    [2,'ETHUSDT','+2.21','0.92','Aşırı Üst','%76','MR-AŞAĞI','warn'],
    [3,'SOLUSDT','+1.68','0.78','Üst','%62','MR-AŞAĞI','warn'],
    [4,'AVAXUSDT','-2.04','0.12','Aşırı Alt','%72','MR-YUKARI','pos'],
    [5,'ARBUSDT','-1.42','0.21','Alt','%58','MR-YUKARI','pos'],
    [6,'LINKUSDT','+0.42','0.58','Nötr','—','—',''],
    [7,'OPUSDT','+1.12','0.68','Üst','%52','MR-AŞAĞI','warn'],
  ].forEach(r => tb.appendChild(el('tr', {},
    el('td', { class: 'muted' }, String(r[0])),
    el('td', {}, coinPill(r[1])),
    el('td', { class: 'r mono bold ' + (parseFloat(r[2]) > 1.5 ? 'warn' : parseFloat(r[2]) < -1.5 ? 'pos' : '') }, r[2]),
    el('td', { class: 'r mono small' }, r[3]),
    el('td', {}, el('span', { class: 'tag ' + (r[4].includes('Aşırı') ? 'red' : r[4] === 'Üst' ? 'yellow' : r[4] === 'Alt' ? 'green' : 'gray') }, r[4])),
    el('td', { class: 'r mono small' }, r[5]),
    el('td', {}, r[6] === '—' ? el('span', { class: 'muted' }, '—') : el('span', { class: 'tag ' + (r[6].includes('YUKARI') ? 'green' : 'yellow') }, r[6])),
  )));
  tbl.appendChild(tb);
  row.appendChild(card({ title: 'COIN BAZINDA SAPMA SIRALAMASI', body: tbl }));
  host.appendChild(row);
}
