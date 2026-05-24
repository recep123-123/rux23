/* RUx — ATR Yönetimi (image 16) */
import { State, fetchMarket, el } from './api.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { ICN, statCard, card, pageHead, checklist } from './components.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.12-heatmap-premium-visual-pass-20260524';

export async function renderAtr(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'ATR YÖNETİMİ',
    subtitle: 'Average True Range bazlı stop, take profit ve pozisyon yönetimi.',
    actions: [
      el('button', { class: 'select', title: 'Coini üst bardan değiştir', on: { click: () => document.getElementById('ruxSymbolSelect')?.focus?.() } }, (State.symbol || 'BTCUSDT').replace('USDT','/USDT') + ' ', ICN.chev(10)),
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, (State.tf || '4h') + ' ', ICN.chev(10)),
      el('div', { class: 'select' }, 'ATR(14) ', ICN.chev(10)),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-5 section' });
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'cyan', label: 'ATR(14)', value: '$1,247', sub: '%1.55 (24S)' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'ATR ÇARPANI', value: '1.8x', sub: 'Stop için' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'red', label: 'STOP MESAFESİ', value: '$2,245', sub: '-%2.80', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'green', label: 'TP1 / TP2 / TP3', value: '$2,494 / $4,989 / $7,484', sub: '1R / 2R / 3R', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'POZİSYON DURUMU', value: 'AKTİF', sub: 'TP1 dolu', subColor: 'pos' }));
  host.appendChild(stats);

  // Chart with TP/SL labels
  const c1 = el('div', { class: 'card section' });
  c1.appendChild(el('div', { class: 'chart-toolbar' },
    el('span', { class: 'pair' }, 'BTC/USDT · 4s · RUx'),
    el('span', { class: 'ohlc' }, ' A', el('span', { class: 'up' }, '80,112.40'), ' Y', el('span', {}, '80,432.10'), ' D', el('span', { class: 'dn' }, '79,982.20'), ' K', el('span', { class: 'up' }, '80,286.15')),
  ));
  c1.appendChild(el('div', { class: 'chart-legend' },
    el('span', { class: 'lk' }, el('i', { style: 'background:#10b981' }), 'Bollinger Üst'),
    el('span', { class: 'lk' }, el('i', { style: 'background:rgba(16,185,129,0.6)' }), 'TP3 (+3R)'),
    el('span', { class: 'lk' }, el('i', { style: 'background:rgba(16,185,129,0.5)' }), 'TP2 (+2R)'),
    el('span', { class: 'lk' }, el('i', { style: 'background:rgba(16,185,129,0.4)' }), 'TP1 (+1R)'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#06b6d4' }), 'Giriş'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'SL (-1R)'),
    el('span', { class: 'lk' }, el('i', { style: 'background:#ef4444' }), 'Bollinger Alt'),
  ));
  const chartHost = el('div', { class: 'chart-host tall' });
  c1.appendChild(chartHost);
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
  host.appendChild(c1);

  // Bottom: scenario ladder + position management + stop rules + position status
  const row = el('div', { class: 'row cols-4 section' });
  // Scenario ladder
  const ld = el('table', { class: 'tbl tbl-compact ladder-table' });
  ld.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'TİP'),
    el('th', { class: 'r' }, 'FİYAT'),
    el('th', { class: 'r' }, 'ATR'),
    el('th', {}, 'DURUM'),
  )));
  const ltb = el('tbody', {});
  [
    ['TP3','$87,770','+6.0','BEKLEMEDE','yellow'],
    ['TP2','$85,275','+4.0','BEKLEMEDE','yellow'],
    ['TP1','$82,780','+2.0','DOLDU','green'],
    ['Giriş','$80,286','0','AKTİF','cyan'],
    ['SL','$78,041','-1.8','AKTİF','red'],
  ].forEach(r => ltb.appendChild(el('tr', {},
    el('td', { class: 'bold ' + (r[0] === 'SL' ? 'neg' : r[0] === 'Giriş' ? 'cyan' : 'pos') }, r[0]),
    el('td', { class: 'r mono' }, r[1]),
    el('td', { class: 'r mono small ' + (r[2].startsWith('+') ? 'pos' : r[2].startsWith('-') ? 'neg' : 'muted') }, r[2]),
    el('td', {}, el('span', { class: 'tag ' + r[4] }, r[3])),
  )));
  ld.appendChild(ltb);
  row.appendChild(card({ title: 'ATR SENARYO MERDİVENİ', body: ld }));

  // Pozisyon Yönetim Motoru
  const pm = el('div', {});
  [
    ['Stop Tipi','ATR Trail','muted'],
    ['ATR Çarpanı','1.8x','muted'],
    ['Trail Tetikleyici','+1R','muted'],
    ['Break-Even','TP1 dolduğunda','pos'],
    ['Risk per Trade','%2.0','muted'],
    ['Stop Sıklığı','Saatlik','muted'],
    ['Aktif Trail','EVET','pos'],
    ['Volatilite Modu','Genişleyen','warn'],
  ].forEach(([k, v, c]) => pm.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  row.appendChild(card({ title: 'POZİSYON YÖNETİM MOTORU', body: pm }));

  // Stop güncelleme kuralları
  const sr = checklist([
    { state: 'ok', label: 'TP1 dolduğunda BE\'ye çek', right: 'Aktif' },
    { state: 'ok', label: 'TP2 dolduğunda TP1\'e çek', right: 'Aktif' },
    { state: 'ok', label: 'ATR genişlediğinde stop sıkıştır', right: 'Aktif' },
    { state: 'ok', label: 'Yapısal kırılımda stop yenile', right: 'Aktif' },
    { state: 'miss', label: 'Haber öncesi stop sıkıştır', right: 'Pasif' },
    { state: 'ok', label: 'Karşıt CHoCH\'ta erken çıkış', right: 'Aktif' },
  ]);
  row.appendChild(card({ title: 'STOP GÜNCELLEME KURALLARI', body: sr }));

  // Pozisyon Durumu
  const ps = el('div', {});
  [
    ['Pozisyon ID','#48214','mono muted'],
    ['Coin','BTC/USDT',''],
    ['Yön','LONG','pos'],
    ['Giriş','$80,286.15','mono'],
    ['Güncel Fiyat','$80,286.15','mono'],
    ['Kar / Zarar','+$1,124 (+%1.40)','pos'],
    ['Açık Süre','18s 24dk','muted'],
    ['Risk','-$496 (kalan)',''],
    ['Net Reward','+$3,742 (TP3)','pos'],
  ].forEach(([k, v, c]) => ps.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  ps.appendChild(el('div', { class: 'flex gap-8 mt-12' },
    el('button', { class: 'btn outline-yellow flex-1', style: 'justify-content:center' }, 'KISMİ KAPAT'),
    el('button', { class: 'btn outline-red flex-1', style: 'justify-content:center' }, 'POZİSYON KAPAT'),
  ));
  row.appendChild(card({ title: 'POZİSYON DURUMU', body: ps }));
  host.appendChild(row);
}
