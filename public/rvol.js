/* RUx — RVOL / Hacim-Fiyat (image 17) */
import { State, fetchMarket, el } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, coinPill, barbar } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.10-heatmap-fidelity-pass-20260524';

export async function renderRvol(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'HACİM-FİYAT / RVOL',
    subtitle: 'Volume Profile Visible Range, RVOL ve hacim teyitli kırılım analizi.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxSymbolSelect')?.focus?.() } }, (State.symbol || 'BTCUSDT').replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, (State.tf || '4h') + ' ', ICN.chev(10)),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'cyan', label: 'RVOL (5)', value: '1.84x', sub: 'Yüksek', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'green', label: 'POC SEVİYESİ', value: '79,650', sub: 'Point of Control' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'VAH / VAL', value: '81,200 / 78,400', sub: 'Value Area' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'KIRILIM ONAYI', value: 'EVET', sub: 'Hacimle teyit', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'FAKE BREAKOUT RİSK', value: 'Düşük', sub: '%18', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'HACİM KALİTESİ', value: '88 / 100', sub: 'Çok İyi', subColor: 'pos' }));
  host.appendChild(stats);

  // Chart with VPVR + RVOL subchart
  const c1 = el('div', { class: 'card section' });
  c1.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, 'BTC/USDT · 4s · RUx'),
    el('span', { class: 'ohlc' }, 'A', el('span', { class: 'up' }, '80,112.40'), ' Y', el('span', {}, '80,432.10'), ' D', el('span', { class: 'dn' }, '79,982.20'), ' K', el('span', { class: 'up' }, '80,286.15')),
  ));
  c1.appendChild(el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#f59e0b' }), 'POC'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'VAH/VAL'),
    el('span', { class: 'lk' }, el('i', { style: 'background:rgba(34,211,238,0.3)' }), 'Volume Profile'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'BREAKOUT'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'REJECTION'),
  ));
  const chartHost = el('div', { class: 'chart-host tall' });
  c1.appendChild(chartHost);
  // RVOL subchart
  const rvolHost = el('div', { class: 'chart-host short mt-6', style: 'height:120px' });
  c1.appendChild(el('div', { class: 'flex between mt-8 small muted' },
    el('span', {}, 'RVOL (5) ', el('span', { class: 'mono cyan bold' }, '1.84x')),
    el('span', { class: 'mono' }, '15:48:12 (UTC+3)')
  ));
  c1.appendChild(rvolHost);
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
        candles.push({ time: now - (200-i)*14400, open: o, high: Math.max(o,c)+Math.random()*200, low: Math.min(o,c)-Math.random()*200, close: c, volume: 1500+Math.random()*2000 });
        p = c;
      }
    }
    const { chart, series } = makeCandleChart(chartHost);
    series.setData(candles);
    addEmaLine(chart, candles, 20, '#06b6d4');
    addEmaLine(chart, candles, 50, '#f97316');
    // RVOL bars
    const w = rvolHost.clientWidth || 600, h = rvolHost.clientHeight || 120;
    const cv = document.createElement('canvas'); cv.width = w*2; cv.height = h*2; cv.style.width = w+'px'; cv.style.height = h+'px';
    rvolHost.appendChild(cv);
    const ctx = cv.getContext('2d'); ctx.scale(2,2);
    const N = candles.length;
    const cw = w / N;
    candles.forEach((c, i) => {
      const rvol = 0.5 + Math.random()*2;
      const bh = (rvol / 3) * (h - 10);
      ctx.fillStyle = rvol > 1.5 ? 'rgba(16,185,129,0.7)' : rvol > 1 ? 'rgba(34,211,238,0.6)' : 'rgba(148,163,184,0.4)';
      ctx.fillRect(i * cw + 0.5, h - bh - 4, Math.max(1, cw - 1), bh);
    });
    // Threshold line at 1.0
    ctx.strokeStyle = 'rgba(245,158,11,0.5)'; ctx.setLineDash([3,3]);
    const thr = h - (1/3)*(h-10) - 4;
    ctx.beginPath(); ctx.moveTo(0, thr); ctx.lineTo(w, thr); ctx.stroke();
  }, 60);
  host.appendChild(c1);

  // Bottom row: confirmation, fake risk, top RVOL, leaderboard, comment
  const row = el('div', { class: 'row cols-3 section' });
  // Confirmation
  const conf = el('div', {});
  [
    ['Hacim Artışı (RVOL)','+%84','pos'],
    ['Spike Sayısı','7','pos'],
    ['Süreklilik','%92','pos'],
    ['Yön Uyumu','Bullish','pos'],
    ['Direnç Kırılımı','Onaylı','pos'],
    ['POC Yukarısı','Onaylı','pos'],
    ['Hacim Skoru','88 / 100','pos'],
  ].forEach(([k, v, c]) => conf.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  row.appendChild(card({ title: 'HACİM TEYİT KRİTERLERİ', body: conf }));

  // Fake risk
  const fr = el('div', {});
  [
    ['Anormal Spike','Tespit Edilmedi','pos'],
    ['Wick / Body Oranı','Sağlıklı','pos'],
    ['Stop Hunt İhtimali','Düşük','pos'],
    ['Spread Genişlemesi','Normal','pos'],
    ['Likidasyon Yığılması','Uzakta','pos'],
    ['Manipülasyon Skoru','12 / 100','pos'],
  ].forEach(([k, v, c]) => fr.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  fr.appendChild(el('div', { class: 'kv mt-8' }, el('span', { class: 'k bold' }, 'GENEL FAKE RİSKİ'), el('span', { class: 'v pos bold' }, 'Düşük (%18)')));
  row.appendChild(card({ title: 'FAKE BREAKOUT RİSKİ', body: fr }));

  // Top RVOL candidates
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'COIN'), el('th', { class: 'r' }, 'RVOL'),
    el('th', {}, 'YÖN'), el('th', { class: 'r' }, 'KIRILIM'),
  )));
  const tb = el('tbody', {});
  [
    [1,'ETHUSDT',2.42,'LONG','+%2.4'],
    [2,'SOLUSDT',2.18,'LONG','+%3.8'],
    [3,'BTCUSDT',1.84,'LONG','+%0.9'],
    [4,'LINKUSDT',1.62,'LONG','+%1.4'],
    [5,'AVAXUSDT',1.41,'SHORT','-%1.2'],
    [6,'BNBUSDT',1.32,'LONG','+%1.0'],
    [7,'NEARUSDT',1.28,'LONG','+%2.2'],
  ].forEach(r => tb.appendChild(el('tr', {},
    el('td', { class: 'muted' }, String(r[0])),
    el('td', {}, coinPill(r[1])),
    el('td', { class: 'r mono bold cyan' }, r[2].toFixed(2) + 'x'),
    el('td', {}, el('span', { class: 'tag ' + (r[3] === 'LONG' ? 'green' : 'red') }, r[3])),
    el('td', { class: 'r mono ' + (r[4].startsWith('+') ? 'pos' : 'neg') }, r[4]),
  )));
  tbl.appendChild(tb);
  row.appendChild(card({ title: 'TOP RVOL ADAYLARI', body: tbl }));
  host.appendChild(row);

  // Leaderboard + comment
  const row2 = el('div', { class: 'row cols-2 section' });
  // Leaderboard
  const lb = el('table', { class: 'tbl tbl-compact' });
  lb.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'COIN'), el('th', { class: 'r' }, 'RVOL ORT (24S)'),
    el('th', {}, 'GÜÇ'), el('th', { class: 'r' }, '7G TUTARLILIK'),
  )));
  const ltb = el('tbody', {});
  [
    [1,'ETHUSDT',1.92,84,'%82'],
    [2,'BTCUSDT',1.74,78,'%76'],
    [3,'SOLUSDT',1.68,72,'%84'],
    [4,'LINKUSDT',1.52,68,'%72'],
    [5,'BNBUSDT',1.38,62,'%64'],
    [6,'AVAXUSDT',1.28,56,'%52'],
    [7,'ARBUSDT',1.18,48,'%48'],
    [8,'OPUSDT',1.12,44,'%42'],
  ].forEach(r => ltb.appendChild(el('tr', {},
    el('td', { class: 'muted' }, String(r[0])),
    el('td', {}, coinPill(r[1])),
    el('td', { class: 'r mono bold' }, r[2].toFixed(2) + 'x'),
    el('td', {}, barbar(r[3])),
    el('td', { class: 'r mono small' }, r[4]),
  )));
  lb.appendChild(ltb);
  row2.appendChild(card({ title: 'HACİM LİDER TABLOSU', body: lb }));

  // Analysis comment
  const comm = el('div', { class: 'small', style: 'color: var(--fg-2); line-height: 1.6' });
  comm.appendChild(el('div', { class: 'flex items-center gap-6 mt-4' }, ICN.bars(13), el('span', { class: 'cyan bold' }, 'BTC/USDT - Hacim Yorumu')));
  comm.appendChild(el('p', { style: 'margin-top:8px' }, 'BTC son 8 saatte RVOL 1.84x ile yüksek katılım gösterdi. POC seviyesi 79,650 civarında oluşmuş ve fiyat şu an Value Area Yüksek (VAH 81,200) altında, ancak üzerinde kapanış denemesi var. Hacim onaylı kırılım sinyali devam ediyor; spike sayısı 7 ve süreklilik %92 ile sağlıklı.'));
  comm.appendChild(el('p', { style: 'margin-top:8px' }, '81,200 üzerinde kapanış olursa kırılımın güçlenmesi ve 82,450 - 84,250 hedeflerinin tetiklenmesi olası. Aşağıda 78,400 (VAL) kritik destek; bu seviyenin altında hacimsiz düşüş riski oluşur.'));
  comm.appendChild(el('div', { class: 'mt-12 flex gap-12' },
    el('span', {}, el('span', { class: 'tiny muted' }, 'Volume Skoru: '), el('span', { class: 'pos bold' }, '88/100')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'Karar: '), el('span', { class: 'pos bold' }, 'AL (Hacim Onaylı)')),
    el('span', {}, el('span', { class: 'tiny muted' }, 'Risk: '), el('span', { class: 'warn bold' }, 'Orta')),
  ));
  row2.appendChild(card({ title: 'HACİM ANALİZİ YORUMU', body: comm }));
  host.appendChild(row2);
}
