/* RUx — Dönüştürücüler (real working converters) */
import { State, el, fetchMarket, toast } from './api.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.11-heatmap-tf-recalibration-20260524';

let liveBtcUsd = 0;
let liveEthUsd = 0;

async function refreshLive() {
  try {
    const [b, e] = await Promise.all([fetchMarket('BTCUSDT','4h',2), fetchMarket('ETHUSDT','4h',2)]);
    liveBtcUsd = Number(b?.ticker?.price ?? b?.candles?.at?.(-1)?.close) || liveBtcUsd;
    liveEthUsd = Number(e?.ticker?.price ?? e?.candles?.at?.(-1)?.close) || liveEthUsd;
  } catch {}
}

function num(v, def = 0) { const n = parseFloat(v); return isNaN(n) ? def : n; }

function makeConverter({ title, subtitle, inputs, compute }) {
  const card_ = el('div', { class: 'card' });
  card_.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, title)));
  if (subtitle) card_.appendChild(el('div', { class: 'pad-12 small muted', style: 'border-bottom:1px solid var(--surface-2)' }, subtitle));

  const state = {};
  inputs.forEach(i => state[i.key] = i.def);

  const body = el('div', { class: 'pad-12' });
  const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px' });
  inputs.forEach(i => {
    const lab = el('div', { class: 'small muted mb-2' }, i.label);
    const inp = el('input', { class: 'input mono', type: 'number', step: i.step || 'any', value: String(i.def) });
    inp.addEventListener('input', () => { state[i.key] = num(inp.value, i.def); refresh(); });
    grid.appendChild(el('div', {}, lab, inp));
  });
  body.appendChild(grid);

  const resultBox = el('div', {});
  body.appendChild(resultBox);
  card_.appendChild(body);

  function refresh() {
    resultBox.innerHTML = '';
    const rows = compute(state) || [];
    const t = el('table', { class: 'tbl tbl-compact' });
    const tb = el('tbody', {});
    rows.forEach(r => {
      tb.appendChild(el('tr', {},
        el('td', { class: 'small muted' }, r[0]),
        el('td', { class: 'r mono ' + (r[2] || '') }, r[1])
      ));
    });
    t.appendChild(tb);
    resultBox.appendChild(t);
  }
  refresh();
  return { node: card_, refresh };
}

export async function renderDonusturuculer(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'DÖNÜŞTÜRÜCÜLER',
    subtitle: 'BTC/USD, satoshi, gwei, persentil, ATR yüzdesi ve fiyat birim dönüştürücüleri.',
    actions: [
      el('button', { class: 'btn primary', id: 'btnRefreshConv' }, ICN.refresh(12), 'CANLI FİYATI ÇEK'),
      el('a', { class: 'btn', href: '#/hesaplayicilar' }, ICN.cube(12), 'HESAPLAYICILAR'),
    ]
  }));

  const liveStrip = el('div', { class: 'stat-row cols-3 section', id: 'liveStrip' });
  function paintLive() {
    liveStrip.innerHTML = '';
    liveStrip.appendChild(statCard({ icon: ICN.bitcoin(18), iconColor: 'cyan', label: 'BTC/USD CANLI', value: liveBtcUsd ? '$' + liveBtcUsd.toLocaleString() : '—', sub: 'Binance', subColor: 'muted' }));
    liveStrip.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'ETH/USD CANLI', value: liveEthUsd ? '$' + liveEthUsd.toLocaleString() : '—', sub: 'Binance', subColor: 'muted' }));
    liveStrip.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'green', label: 'ETH/BTC', value: liveBtcUsd > 0 ? (liveEthUsd / liveBtcUsd).toFixed(5) : '—', sub: 'ratio', subColor: 'muted' }));
  }
  host.appendChild(liveStrip);
  paintLive();

  host.querySelector('#btnRefreshConv')?.addEventListener('click', async () => {
    await refreshLive();
    paintLive();
    converters.forEach(c => c.refresh());
    toast('Canlı fiyatlar güncellendi', 'ok');
  });

  // Initial async fetch
  refreshLive().then(() => { paintLive(); converters.forEach(c => c.refresh()); });

  const grid = el('div', { class: 'row cols-2 section' });
  const converters = [];

  // 1. BTC/USD/Sat
  const c1 = makeConverter({
    title: 'BTC ↔ USD ↔ SATOSHI',
    subtitle: 'Bitcoin birim dönüştürücü (1 BTC = 100,000,000 sat).',
    inputs: [
      { key: 'usd', label: 'USD', def: 100 },
      { key: 'btc', label: 'BTC', def: 0 },
    ],
    compute: s => {
      const rate = liveBtcUsd > 0 ? liveBtcUsd : 100000; // fallback rate if no live
      let btc = s.btc;
      if (s.btc === 0 && s.usd > 0) btc = s.usd / rate;
      else if (s.btc > 0) btc = s.btc;
      const usd = btc * rate;
      const sats = btc * 1e8;
      const mbtc = btc * 1000;
      return [
        ['Mevcut Kur', '$' + rate.toLocaleString() + ' / BTC', 'muted'],
        ['USD', '$' + usd.toFixed(2)],
        ['BTC', btc.toFixed(8)],
        ['mBTC (mili)', mbtc.toFixed(5)],
        ['Satoshi', Math.round(sats).toLocaleString()],
        ['sats/USD', usd > 0 ? Math.round(sats / usd).toLocaleString() : '—'],
      ];
    }
  });
  converters.push(c1);
  grid.appendChild(c1.node);

  // 2. % ↔ ATR
  const c2 = makeConverter({
    title: 'YÜZDE ↔ ATR DÖNÜŞTÜRÜCÜ',
    subtitle: 'Fiyat yüzde değişimini ATR cinsinden ölçer ve tersi.',
    inputs: [
      { key: 'price', label: 'Mevcut Fiyat', def: 100 },
      { key: 'atr', label: 'ATR Değeri', def: 2 },
      { key: 'pct', label: 'Yüzde Değişim (%)', def: 3 },
    ],
    compute: s => {
      const abs = s.price * (s.pct / 100);
      const atrMult = s.atr > 0 ? abs / s.atr : 0;
      return [
        ['Yüzde Değişim', s.pct.toFixed(3) + '%', 'muted'],
        ['Mutlak Mesafe', '$' + abs.toFixed(4)],
        ['ATR Cinsinden', atrMult.toFixed(2) + ' × ATR', 'bold'],
        ['Eşdeğer ATR=1', '$' + s.atr.toFixed(4) + ' = ' + (s.price > 0 ? ((s.atr / s.price) * 100).toFixed(3) + '%' : '—'), 'muted'],
      ];
    }
  });
  converters.push(c2);
  grid.appendChild(c2.node);

  // 3. RR ↔ Fiyat
  const c3 = makeConverter({
    title: 'R/R ORANINA GÖRE TP HESAPLA',
    subtitle: 'Stop mesafesi ve R çarpanına göre hedef fiyat.',
    inputs: [
      { key: 'dir', label: 'Yön (1=LONG, -1=SHORT)', def: 1, step: 1 },
      { key: 'entry', label: 'Giriş', def: 100 },
      { key: 'stop', label: 'Stop', def: 95 },
      { key: 'r', label: 'R Çarpanı', def: 2, step: 0.1 },
    ],
    compute: s => {
      const dir = s.dir >= 0 ? 1 : -1;
      const dist = Math.abs(s.entry - s.stop);
      const tp = dir === 1 ? s.entry + dist * s.r : s.entry - dist * s.r;
      return [
        ['Stop Mesafesi (1R)', '$' + dist.toFixed(4) + ' / ' + ((dist/s.entry)*100).toFixed(2) + '%', 'muted'],
        ['Hedef Fiyat', '$' + tp.toFixed(4), 'pos bold'],
        ['Toplam Mesafe', '$' + (dist * (s.r + 1)).toFixed(4)],
        ['Yüzde Hareket (entry'+(dir===1?'→TP':'→SL')+')', ((Math.abs(tp - s.entry) / s.entry) * 100).toFixed(2) + '%'],
      ];
    }
  });
  converters.push(c3);
  grid.appendChild(c3.node);

  // 4. USD ↔ token quantity at price
  const c4 = makeConverter({
    title: 'TOKEN MİKTARI ↔ USD',
    subtitle: 'Verilen token fiyatına göre USD ↔ token miktar dönüşümü.',
    inputs: [
      { key: 'price', label: 'Token Fiyatı (USD)', def: 1.5 },
      { key: 'usd', label: 'USD Tutarı', def: 1000 },
    ],
    compute: s => {
      const qty = s.price > 0 ? s.usd / s.price : 0;
      return [
        ['Token Fiyatı', '$' + s.price],
        ['USD Tutarı', '$' + s.usd.toLocaleString()],
        ['Alınacak Adet', qty.toFixed(6) + ' token', 'bold'],
        ['1000 Adet', s.price > 0 ? '$' + (1000 * s.price).toLocaleString() : '—'],
        ['1 Milyon Adet', s.price > 0 ? '$' + (1e6 * s.price).toLocaleString() : '—'],
      ];
    }
  });
  converters.push(c4);
  grid.appendChild(c4.node);

  // 5. Gwei <-> ETH
  const c5 = makeConverter({
    title: 'ETH ↔ GWEI ↔ WEI',
    subtitle: 'Ethereum birim dönüştürücü (1 ETH = 10⁹ gwei = 10¹⁸ wei).',
    inputs: [
      { key: 'eth', label: 'ETH', def: 0.01 },
      { key: 'gwei', label: 'Gwei', def: 0 },
    ],
    compute: s => {
      let eth = s.eth;
      if (eth === 0 && s.gwei > 0) eth = s.gwei / 1e9;
      const gwei = eth * 1e9;
      const wei = eth * 1e18;
      const rate = liveEthUsd > 0 ? liveEthUsd : 3500;
      return [
        ['Mevcut Kur', '$' + rate.toLocaleString() + ' / ETH', 'muted'],
        ['ETH', eth.toFixed(8)],
        ['Gwei', gwei.toLocaleString()],
        ['Wei', wei.toExponential(3)],
        ['USD Karşılığı', '$' + (eth * rate).toFixed(2), 'pos'],
      ];
    }
  });
  converters.push(c5);
  grid.appendChild(c5.node);

  // 6. Percentile / volume context
  const c6 = makeConverter({
    title: 'PERSENTİL ↔ RVOL',
    subtitle: 'Volume / değişim persentili ↔ relatif volume ölçeği.',
    inputs: [
      { key: 'current', label: 'Mevcut Değer (örn. hacim)', def: 1500 },
      { key: 'average', label: 'Ortalama (örn. 20-bar SMA)', def: 1000 },
    ],
    compute: s => {
      const ratio = s.average > 0 ? s.current / s.average : 0;
      const pctSpike = (ratio - 1) * 100;
      const label = ratio < 0.5 ? 'Çok Düşük' : ratio < 0.8 ? 'Düşük' : ratio < 1.2 ? 'Normal' : ratio < 1.5 ? 'Yüksek' : ratio < 2.5 ? 'Spike' : 'Climax';
      const labelCls = ratio < 0.8 ? 'muted' : ratio < 1.2 ? '' : ratio < 1.5 ? 'warn' : ratio < 2.5 ? 'pos bold' : 'pos bold';
      return [
        ['RVOL Oranı', ratio.toFixed(2) + 'x', 'bold'],
        ['Spike %', (pctSpike >= 0 ? '+' : '') + pctSpike.toFixed(1) + '%', pctSpike > 0 ? 'pos' : 'neg'],
        ['Sınıf', label, labelCls],
        ['Volume Kuralı', ratio >= 1.5 ? 'BREAKOUT confirm edilebilir' : ratio < 0.8 ? 'NO-VOLUME no-trade işareti' : 'Normal aralık', 'muted'],
      ];
    }
  });
  converters.push(c6);
  grid.appendChild(c6.node);

  host.appendChild(grid);

  // Reference table
  host.appendChild(card({
    title: 'BİRİM REFERANS TABLOSU',
    body: el('div', { class: 'pad-12' },
      (() => {
        const t = el('table', { class: 'tbl' });
        t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'BIRIM'), el('th', {}, 'EŞDEĞER'), el('th', {}, 'NOT'))));
        const tb = el('tbody', {});
        [
          ['1 BTC', '100,000,000 satoshi', 'Bitcoin\'in en küçük birimi'],
          ['1 mBTC', '100,000 satoshi', 'Mili-BTC (1/1000 BTC)'],
          ['1 ETH', '10⁹ gwei = 10¹⁸ wei', 'Ethereum birimleri'],
          ['1 R', 'Stop mesafesi', 'Risk birimi (giriş→stop)'],
          ['1 bp (basis point)', '%0.01', 'Komisyon, slipaj, funding ölçümünde'],
          ['1 ATR', '14-bar mum ortalama true range', 'Volatilite ölçümünde'],
          ['1 RVOL', 'Mevcut hacim / SMA20 hacim', '>1.5 spike sayılır'],
          ['1 σ (standart sapma)', '%68 (Gaussian)', 'Bollinger bantları için'],
          ['2 σ', '%95 (Gaussian)', 'Standard Bollinger genişliği'],
        ].forEach(r => tb.appendChild(el('tr', {}, ...r.map((c, i) => el('td', { class: i === 0 ? 'bold mono' : i === 1 ? 'mono' : 'small muted' }, c)))));
        t.appendChild(tb);
        return t;
      })()
    )
  }));
}
