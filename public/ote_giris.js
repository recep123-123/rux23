/* RUx — OTE Giriş (image 18) */
import { State, fetchMarket, el } from './api.js?v=0.75.14-heatmap-micro-polish-20260524';
import { ICN, statCard, card, pageHead, checklist } from './components.js?v=0.75.14-heatmap-micro-polish-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.14-heatmap-micro-polish-20260524';

export async function renderOteGiris(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'OTE GİRİŞ',
    subtitle: 'Optimal Trade Entry: 0.618 - 0.79 Fibonacci geri çekilmesi ile akıllı para girişi.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxSymbolSelect')?.focus?.() } }, (State.symbol || 'BTCUSDT').replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, (State.tf || '4h') + ' ', ICN.chev(10)),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'OTE BÖLGESİNDE', value: 'EVET', sub: '0.705 Fib seviyesi', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'GİRİŞ KALİTESİ', value: '88 / 100', sub: 'Yüksek', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'green', label: 'R:R ORANI', value: '1 : 2.6', sub: 'Mükemmel', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'ONAY SAYISI', value: '6 / 7', sub: '%85.7' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'İPTAL MESAFESİ', value: '-2.4%', sub: '78,200 USDT' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'yellow', label: 'GÜVEN SKORU', value: '82 / 100', sub: 'Yüksek', subColor: 'pos' }));
  host.appendChild(stats);

  const row = el('div', { class: 'row fr-2-1 section' });
  // Chart with fib levels
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, 'BTC/USDT · 4s · RUx'),
    el('span', { class: 'ohlc' }, ' A', el('span', { class: 'up' }, '80,112.40'), ' Y', el('span', {}, '80,432.10'), ' D', el('span', { class: 'dn' }, '79,982.20'), ' K', el('span', { class: 'up' }, '80,286.15')),
  ));
  wrap.appendChild(el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'Fib 1.000'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#f59e0b' }), 'Fib 0.786'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'Fib 0.705 (OTE)'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'Fib 0.618 (OTE)'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#06b6d4' }), 'Fib 0.500'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#a78bfa' }), 'Fib 0.382'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#94a3b8' }), 'Fib 0.236'),
  ));
  const chartHost = el('div', { class: 'chart-host tall' });
  wrap.appendChild(chartHost);
  // Levels block
  wrap.appendChild(el('div', { class: 'flex gap-12 mt-10 small flex-wrap', style: 'background: var(--bg-card-2); padding: 10px 14px; border-radius:10px;' },
    el('span', {}, el('span', { class: 'tiny muted' }, '0.236 '), el('span', { class: 'mono' }, '83,420')),
    el('span', {}, el('span', { class: 'tiny muted' }, '0.382 '), el('span', { class: 'mono' }, '82,240')),
    el('span', {}, el('span', { class: 'tiny muted' }, '0.500 '), el('span', { class: 'mono' }, '81,000')),
    el('span', {}, el('span', { class: 'tiny muted' }, '0.618 '), el('span', { class: 'mono pos bold' }, '79,650 (OTE)')),
    el('span', {}, el('span', { class: 'tiny muted' }, '0.705 '), el('span', { class: 'mono pos bold' }, '79,062 (Optimal)')),
    el('span', {}, el('span', { class: 'tiny muted' }, '0.786 '), el('span', { class: 'mono pos bold' }, '78,580 (OTE)')),
    el('span', {}, el('span', { class: 'tiny muted' }, '1.000 '), el('span', { class: 'mono neg bold' }, '77,250 (İptal)')),
  ));
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
  }, 60);
  row.appendChild(wrap);

  // Right: Giriş hazır mı + Onaylar/iptal
  const right = el('div', {});
  // Big YES
  const ready = el('div', { class: 'card decision-card green' });
  ready.appendChild(el('div', { class: 'card-title' }, 'GİRİŞ HAZIR MI?'));
  ready.appendChild(el('div', { class: 'flex center mt-8' },
    el('div', { style: 'font-size:42px; font-weight:800; color:#10b981' }, 'EVET'),
  ));
  ready.appendChild(el('div', { class: 'small bold pos text-center mt-2' }, 'OTE bölgesinde · 6/7 onay'));
  right.appendChild(ready);

  // Onaylar checklist
  const onaylar = checklist([
    { state: 'ok', label: 'OTE bölgesinde mi?', right: 'EVET' },
    { state: 'ok', label: 'BOS / CHoCH onayı', right: 'BOS' },
    { state: 'ok', label: 'OB / FVG var mı?', right: 'OB + FVG' },
    { state: 'ok', label: 'Likidite süpürmesi', right: 'SSL' },
    { state: 'ok', label: 'Hacim onayı', right: '+%18' },
    { state: 'ok', label: 'R:R uygun mu?', right: '1:2.6' },
    { state: 'miss', label: 'CPI / FOMC riski', right: '17:30' },
  ]);
  right.appendChild(card({ title: 'ONAYLAR', body: onaylar, klass: 'mt-12' }));

  // İptal kriterleri
  const iptal = checklist([
    { state: 'miss', label: '0.786 altında kapanış (78,580)', right: 'Aktif' },
    { state: 'miss', label: 'BOS yapısı bozulursa', right: 'Aktif' },
    { state: 'miss', label: 'CHoCH aşağı oluşursa', right: 'Aktif' },
    { state: 'miss', label: 'CPI volatilitesi setup\'ı bozarsa', right: 'Bekle' },
    { state: 'miss', label: 'Hacim onayı kaybolursa', right: 'Aktif' },
  ]);
  right.appendChild(card({ title: 'İPTAL KRİTERLERİ', body: iptal, klass: 'mt-12' }));

  row.appendChild(right);
  host.appendChild(row);

  // Bottom: TP/SL + recent OTE signals + scenarios
  const row2 = el('div', { class: 'row cols-3 section' });
  // TP/SL
  const ladder = el('table', { class: 'tbl tbl-compact ladder-table' });
  ladder.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'TİP'), el('th', { class: 'r' }, 'FİYAT'),
    el('th', { class: 'r' }, 'MİKTAR'), el('th', { class: 'r' }, 'R:R'),
  )));
  const ltb = el('tbody', {});
  [
    ['SL','77,250','100%','-1.0'],
    ['Giriş','79,062','100%','—'],
    ['TP1','81,000','30%','+1.0'],
    ['TP2','82,240','30%','+1.7'],
    ['TP3','83,420','20%','+2.4'],
    ['TP4','85,200','20%','+3.4'],
  ].forEach(r => ltb.appendChild(el('tr', {},
    el('td', { class: 'bold ' + (r[0] === 'SL' ? 'neg' : r[0] === 'Giriş' ? 'cyan' : 'pos') }, r[0]),
    el('td', { class: 'r mono' }, r[1]),
    el('td', { class: 'r mono' }, r[2]),
    el('td', { class: 'r mono ' + (r[3].startsWith('+') ? 'pos' : r[3].startsWith('-') ? 'neg' : '') }, r[3]),
  )));
  ladder.appendChild(ltb);
  row2.appendChild(card({ title: 'TP / SL MERDİVENİ', body: ladder }));

  // Recent OTE signals
  const oteTbl = el('table', { class: 'tbl tbl-compact' });
  oteTbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'TARİH'), el('th', {}, 'COIN'), el('th', {}, 'YÖN'),
    el('th', { class: 'r' }, 'GİRİŞ'), el('th', { class: 'r' }, 'SONUÇ'),
  )));
  const otb = el('tbody', {});
  [
    ['12.05','BTC','LONG','78,420','+2.4R','pos'],
    ['11.05','ETH','LONG','2,420','+1.8R','pos'],
    ['09.05','SOL','LONG','168.2','-1.0R','neg'],
    ['08.05','LINK','LONG','14.62','+2.1R','pos'],
    ['06.05','BNB','SHORT','612.4','+1.6R','pos'],
  ].forEach(r => otb.appendChild(el('tr', {},
    el('td', { class: 'mono small' }, r[0]),
    el('td', { class: 'small mono' }, r[1]),
    el('td', {}, el('span', { class: 'tag ' + (r[2] === 'LONG' ? 'green' : 'red') }, r[2])),
    el('td', { class: 'r mono small' }, r[3]),
    el('td', { class: 'r mono ' + r[5] }, r[4]),
  )));
  oteTbl.appendChild(otb);
  row2.appendChild(card({ title: 'SON OTE SİNYALLERİ', body: oteTbl }));

  // Scenarios
  const scs = el('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
  [
    ['Boğa Senaryosu','green','60','OTE bölgesinden tepki + 81,000 üzeri kapanış → 82,240 hedefi.'],
    ['Yatay Senaryo','yellow','25','OTE bölgesinde sıkışma → 79,650 - 80,500 arasında konsolidasyon.'],
    ['Risk Senaryosu','red','15','78,580 altı kapanış → 77,250 iptal seviyesi test edilir.'],
  ].forEach(([t, c, p, msg]) => scs.appendChild(el('div', { class: 'scenario ' + c },
    el('div', { class: 'flex between' }, el('span', { class: 'ttl' }, t), el('span', { class: 'pr' }, p + '%')),
    el('div', { class: 'small mt-4 muted' }, msg),
  )));
  row2.appendChild(card({ title: 'SENARYOLAR', body: scs }));
  host.appendChild(row2);
}
