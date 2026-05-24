/* RUx — Hesaplayıcılar (real working calculators panel) */
import { State, el, toast, fetchMarket } from './api.js?v=0.75.14-heatmap-micro-polish-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.14-heatmap-micro-polish-20260524';

function num(v, def = 0) { const n = parseFloat(v); return isNaN(n) ? def : n; }
function fmtUsd(n) {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}
function fmtPct(n) { return isFinite(n) ? n.toFixed(2) + '%' : '—'; }

function makeCalc({ title, subtitle, inputs, compute, render, footnote }) {
  const state = {};
  inputs.forEach(i => state[i.key] = i.def);
  const card_ = el('div', { class: 'card' });
  card_.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, title)));
  const sub = el('div', { class: 'pad-12 small muted', style: 'border-bottom:1px solid var(--surface-2)' }, subtitle);
  card_.appendChild(sub);

  const grid = el('div', { class: 'pad-12', style: 'display:grid;grid-template-columns:1fr 1fr; gap:8px; border-bottom:1px solid var(--surface-2)' });
  inputs.forEach(i => {
    const lab = el('div', { class: 'small muted' }, i.label);
    const inp = el('input', { class: 'input', type: i.type || 'number', step: i.step || 'any', value: String(i.def) });
    inp.addEventListener('input', () => { state[i.key] = num(inp.value, i.def); refresh(); });
    grid.appendChild(el('div', {}, lab, inp));
  });
  card_.appendChild(grid);

  const out = el('div', { class: 'pad-12' });
  card_.appendChild(out);

  if (footnote) {
    card_.appendChild(el('div', { class: 'pad-12 tiny muted', style: 'border-top:1px solid var(--surface-2)' }, footnote));
  }

  function refresh() {
    out.innerHTML = '';
    const res = compute(state) || {};
    render(out, res, state);
  }
  refresh();
  return card_;
}

function row(k, v, cls = '') {
  return el('div', { class: 'flex between', style: 'padding:4px 0' },
    el('span', { class: 'small' }, k),
    el('span', { class: 'small mono ' + cls }, v)
  );
}

export async function renderHesaplayicilar(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'HESAPLAYICILAR',
    subtitle: 'Profesyonel trader için gerekli temel hesaplayıcılar — R/R, kâr/zarar, kaldıraç, ortalama maliyet, ATR stop ve daha fazlası.',
    actions: [
      el('a', { class: 'btn', href: '#/pozisyon-buyuklugu' }, ICN.scale(12), 'POZİSYON BÜYÜKLÜĞÜ'),
      el('a', { class: 'btn', href: '#/donusturuculer' }, ICN.swap(12), 'DÖNÜŞTÜRÜCÜLER'),
    ]
  }));

  const grid = el('div', { class: 'row cols-2 section' });

  // 1. R/R Calculator
  grid.appendChild(makeCalc({
    title: 'RİSK/ÖDÜL ORANI (R:R)',
    subtitle: 'Giriş, stop ve hedef seviyelerine göre R/R oranı, başabaş win rate ve net beklenti.',
    inputs: [
      { key: 'direction', label: 'Yön (1=LONG, -1=SHORT)', def: 1, step: 1 },
      { key: 'entry', label: 'Giriş', def: 100 },
      { key: 'stop', label: 'Stop', def: 95 },
      { key: 'target', label: 'Hedef (TP)', def: 115 },
      { key: 'winRate', label: 'Tahmini Win Rate (%)', def: 45 },
    ],
    compute: s => {
      const dir = s.direction >= 0 ? 1 : -1;
      const risk = Math.abs(s.entry - s.stop);
      const reward = Math.abs(s.target - s.entry);
      const rr = risk > 0 ? reward / risk : 0;
      const valid = dir === 1 ? (s.stop < s.entry && s.target > s.entry) : (s.stop > s.entry && s.target < s.entry);
      const breakEvenWR = rr > 0 ? (100 / (1 + rr)) : 0;
      const expectancy = (s.winRate/100) * rr - (1 - s.winRate/100);
      return { rr, valid, risk, reward, breakEvenWR, expectancy };
    },
    render: (out, r, s) => {
      if (!r.valid) {
        out.appendChild(el('div', { class: 'tag red' }, 'GEÇERSİZ KONFİGÜRASYON'));
        return;
      }
      out.appendChild(row('Risk (USD/birim)', r.risk.toFixed(4), 'neg'));
      out.appendChild(row('Ödül (USD/birim)', r.reward.toFixed(4), 'pos'));
      out.appendChild(row('R:R Oranı', '1 : ' + r.rr.toFixed(2), r.rr >= 2 ? 'pos bold' : r.rr >= 1 ? 'warn' : 'neg'));
      out.appendChild(row('Başabaş Win Rate', r.breakEvenWR.toFixed(1) + '%', 'muted'));
      out.appendChild(row('Beklenen R/işlem', r.expectancy.toFixed(3) + 'R', r.expectancy > 0 ? 'pos bold' : 'neg bold'));
      out.appendChild(el('div', { class: 'tiny muted mt-4' }, '100 işlemde tahmini sonuç: ' + (r.expectancy * 100).toFixed(0) + 'R'));
    },
    footnote: 'R:R ≥ 2 ve win rate ≥ %35 ise positive expectancy yakalanır. Asıl edge net beklenti formülüyle ölçülür: WR × R − (1−WR).'
  }));

  // 2. Average cost / DCA calculator
  grid.appendChild(makeCalc({
    title: 'ORTALAMA MALİYET (DCA)',
    subtitle: 'İki ayrı alımdan oluşan ortalama maliyet ve mevcut P/L durumu.',
    inputs: [
      { key: 'p1', label: 'Alım 1 Fiyatı', def: 100 },
      { key: 'q1', label: 'Alım 1 Miktarı', def: 1 },
      { key: 'p2', label: 'Alım 2 Fiyatı', def: 80 },
      { key: 'q2', label: 'Alım 2 Miktarı', def: 1 },
      { key: 'cur', label: 'Mevcut Fiyat', def: 90 },
    ],
    compute: s => {
      const totalQty = s.q1 + s.q2;
      const totalCost = s.p1 * s.q1 + s.p2 * s.q2;
      const avg = totalQty > 0 ? totalCost / totalQty : 0;
      const pl = (s.cur - avg) * totalQty;
      const plPct = avg > 0 ? ((s.cur / avg) - 1) * 100 : 0;
      return { totalQty, totalCost, avg, pl, plPct };
    },
    render: (out, r) => {
      out.appendChild(row('Toplam Miktar', r.totalQty.toFixed(6)));
      out.appendChild(row('Toplam Maliyet', fmtUsd(r.totalCost)));
      out.appendChild(row('Ortalama Maliyet', '$' + r.avg.toFixed(4), 'bold'));
      out.appendChild(row('Açık P/L', fmtUsd(r.pl), r.pl >= 0 ? 'pos bold' : 'neg bold'));
      out.appendChild(row('Açık P/L %', fmtPct(r.plPct), r.plPct >= 0 ? 'pos' : 'neg'));
    },
    footnote: 'DCA pozisyon büyütmek için kullanışlıdır; ancak trend aleyhinde DCA risk yönetiminin tersidir. Sadece valid setup ile kullanılmalıdır.'
  }));

  // 3. Leverage liquidation
  grid.appendChild(makeCalc({
    title: 'KALDIRAÇ LİKİDASYON FİYATI',
    subtitle: 'İzole margin kaldıraçlı pozisyonda yaklaşık likidasyon fiyatı (maintenance margin %0.5 varsayılır).',
    inputs: [
      { key: 'direction', label: 'Yön (1=LONG, -1=SHORT)', def: 1, step: 1 },
      { key: 'entry', label: 'Giriş Fiyatı', def: 100 },
      { key: 'lev', label: 'Kaldıraç (x)', def: 10 },
      { key: 'mm', label: 'Maintenance Margin %', def: 0.5 },
    ],
    compute: s => {
      const dir = s.direction >= 0 ? 1 : -1;
      if (s.lev <= 0 || s.entry <= 0) return { valid: false };
      // Approximate: liq when loss = initial margin - maintenance margin
      const liqPctMove = (1 / s.lev) - (s.mm / 100);
      const liq = dir === 1 ? s.entry * (1 - liqPctMove) : s.entry * (1 + liqPctMove);
      const buffer = Math.abs(s.entry - liq);
      const bufferPct = (buffer / s.entry) * 100;
      return { valid: true, liq, buffer, bufferPct, liqPctMove: liqPctMove * 100 };
    },
    render: (out, r) => {
      if (!r.valid) { out.appendChild(el('div', { class: 'tag red' }, 'GEÇERSİZ')); return; }
      out.appendChild(row('Likidasyon Fiyatı', '$' + r.liq.toFixed(4), 'neg bold'));
      out.appendChild(row('Buffer (USD)', '$' + r.buffer.toFixed(4)));
      out.appendChild(row('Buffer (%)', fmtPct(r.bufferPct), r.bufferPct < 2 ? 'neg' : r.bufferPct < 5 ? 'warn' : 'pos'));
      out.appendChild(row('Likidasyon Mesafesi', fmtPct(r.liqPctMove), 'muted'));
    },
    footnote: 'Bu yaklaşık değerdir. Funding ve PnL realized gibi unsurlar gerçek likidasyonu değiştirir. Borsanın likidasyon hesaplayıcısını da kontrol et.'
  }));

  // 4. ATR Stop
  grid.appendChild(makeCalc({
    title: 'ATR STOP HESAPLAYICISI',
    subtitle: 'ATR bazlı stop mesafesi, çarpan ve giriş fiyatına göre stop seviyesi.',
    inputs: [
      { key: 'direction', label: 'Yön (1=LONG, -1=SHORT)', def: 1, step: 1 },
      { key: 'entry', label: 'Giriş Fiyatı', def: 100 },
      { key: 'atr', label: 'ATR Değeri', def: 2.5 },
      { key: 'mult', label: 'ATR Çarpanı', def: 1.8, step: 0.1 },
    ],
    compute: s => {
      const dir = s.direction >= 0 ? 1 : -1;
      const dist = Math.max(0, s.atr * s.mult);
      const stop = dir === 1 ? s.entry - dist : s.entry + dist;
      const distPct = s.entry > 0 ? (dist / s.entry) * 100 : 0;
      return { stop, dist, distPct, dir };
    },
    render: (out, r) => {
      out.appendChild(row('Stop Mesafesi (USD)', r.dist.toFixed(4)));
      out.appendChild(row('Stop Mesafesi %', fmtPct(r.distPct), r.distPct > 5 ? 'warn' : r.distPct < 0.5 ? 'warn' : 'muted'));
      out.appendChild(row('Stop Fiyatı', '$' + r.stop.toFixed(4), 'neg bold'));
      out.appendChild(el('div', { class: 'tiny muted mt-4' }, 'TP1 (+1R): $' + (r.dir === 1 ? (parseFloat(out.parentElement.querySelector('input[step="any"]')?.value || 100) + r.dist) : (parseFloat(out.parentElement.querySelector('input[step="any"]')?.value || 100) - r.dist)).toFixed(4)));
    },
    footnote: 'Volatilite genişliyorsa çarpanı arttır (2.0-2.5x), sıkışıkta düşür (1.0-1.5x). ATR(14) çoğu zaman için varsayılan değerdir.'
  }));

  // 5. Compound growth
  grid.appendChild(makeCalc({
    title: 'BİRİKİM ETKİSİ (COMPOUND)',
    subtitle: 'Sabit aylık getiri ile bileşik büyüme hesabı.',
    inputs: [
      { key: 'start', label: 'Başlangıç Bakiyesi (USD)', def: 10000 },
      { key: 'monthlyPct', label: 'Aylık Getiri %', def: 5 },
      { key: 'months', label: 'Ay Sayısı', def: 24, step: 1 },
    ],
    compute: s => {
      const r = s.monthlyPct / 100;
      const end = s.start * Math.pow(1 + r, s.months);
      const profit = end - s.start;
      const annualizedPct = (Math.pow(end / s.start, 12 / Math.max(1, s.months)) - 1) * 100;
      return { end, profit, annualizedPct };
    },
    render: (out, r) => {
      out.appendChild(row('Final Bakiye', fmtUsd(r.end), 'pos bold'));
      out.appendChild(row('Toplam Kâr', fmtUsd(r.profit), 'pos'));
      out.appendChild(row('Yıllık Eşdeğer', fmtPct(r.annualizedPct), r.annualizedPct > 100 ? 'warn' : 'muted'));
    },
    footnote: 'Aylık %10 sürdürülebilir değildir (yıllık ~%213). Profesyonel hedef genellikle aylık %2-5\'tir.'
  }));

  // 6. Kelly fraction
  grid.appendChild(makeCalc({
    title: 'KELLY FRAKSİYONU',
    subtitle: 'Win rate ve R:R\'a göre optimal pozisyon büyüklüğü oranı.',
    inputs: [
      { key: 'winRate', label: 'Win Rate (%)', def: 50 },
      { key: 'rr', label: 'Ortalama R:R Oranı', def: 2 },
    ],
    compute: s => {
      const p = s.winRate / 100, q = 1 - p, b = s.rr;
      const f = b > 0 ? (b * p - q) / b : 0;
      const halfKelly = f / 2;
      const quarterKelly = f / 4;
      return { f: f * 100, halfKelly: halfKelly * 100, quarterKelly: quarterKelly * 100 };
    },
    render: (out, r) => {
      out.appendChild(row('Kelly %', fmtPct(r.f), r.f > 0 ? 'pos' : 'neg'));
      out.appendChild(row('1/2 Kelly (önerilen)', fmtPct(r.halfKelly), 'bold'));
      out.appendChild(row('1/4 Kelly (konservatif)', fmtPct(r.quarterKelly), 'muted'));
      if (r.f < 0) out.appendChild(el('div', { class: 'tag red mt-4' }, 'NEGATIVE EDGE — İşlem yapma'));
    },
    footnote: 'Full Kelly çok agresiftir; volatilitede hesap eritir. Profesyonel kullanımda 1/4 - 1/2 Kelly arası tercih edilir.'
  }));

  // 7. Funding cost over time
  grid.appendChild(makeCalc({
    title: 'FUNDING MALİYETİ',
    subtitle: 'Açık perp pozisyonun funding üzerinden uzun vade maliyeti.',
    inputs: [
      { key: 'notional', label: 'Notional (USD)', def: 10000 },
      { key: 'fundingPct', label: 'Funding Oranı % (8 saatte bir)', def: 0.01, step: 0.001 },
      { key: 'days', label: 'Tutuş Süresi (gün)', def: 7, step: 1 },
    ],
    compute: s => {
      const fundings = (s.days * 24) / 8; // 8h periods
      const total = s.notional * (s.fundingPct / 100) * fundings;
      const annual = (s.fundingPct / 100) * (365 * 3) * 100; // %annual
      return { total, fundings, annual };
    },
    render: (out, r) => {
      out.appendChild(row('Funding Sayısı', r.fundings.toFixed(0)));
      out.appendChild(row('Toplam Maliyet', fmtUsd(r.total), r.total > 0 ? 'neg' : 'pos'));
      out.appendChild(row('Yıllık Eşdeğer Oran', fmtPct(r.annual), Math.abs(r.annual) > 30 ? 'warn' : 'muted'));
    },
    footnote: 'Pozitif funding LONG ödüyor demek; negatif SHORT ödüyor. Yıllık %100 üzeri funding sürdürülemez kalabalığın işaretidir.'
  }));

  // 8. Win rate breakeven
  grid.appendChild(makeCalc({
    title: 'BAŞABAŞ HESAPLAYICI',
    subtitle: 'Verilen R:R oranı için pozitif kalmak için gereken minimum win rate.',
    inputs: [
      { key: 'rr', label: 'Ortalama R:R', def: 2 },
      { key: 'feeRoundtrip', label: 'Toplam Komisyon+Slipaj (% notional)', def: 0.12, step: 0.01 },
    ],
    compute: s => {
      const breakEven = s.rr > 0 ? 100 / (1 + s.rr) : 100;
      // adjusted for fees: assume fee reduces R by feePct of stop dist (approx)
      const adjusted = breakEven + s.feeRoundtrip * 2; // very simplified penalty
      return { breakEven, adjusted };
    },
    render: (out, r) => {
      out.appendChild(row('Teorik Başabaş WR', fmtPct(r.breakEven), 'muted'));
      out.appendChild(row('Komisyon dahil WR', fmtPct(r.adjusted), 'bold'));
      out.appendChild(el('div', { class: 'tiny muted mt-4' }, 'Gerçek WR bunun üstünde olmalı.'));
    },
    footnote: '1:1 R:R için %50, 1:2 için %33, 1:3 için %25. Yüksek R:R düşük WR\'a tolerans gösterir.'
  }));

  host.appendChild(grid);

  // Reference quick table
  host.appendChild(card({
    title: 'HIZLI REFERANS — R:R vs BAŞABAŞ WIN RATE',
    body: el('div', { class: 'pad-12' },
      (() => {
        const t = el('table', { class: 'tbl' });
        t.appendChild(el('thead', {}, el('tr', {}, ...['R:R','Başabaş WR','%30 WR Beklenti','%40 WR Beklenti','%50 WR Beklenti','%60 WR Beklenti'].map(h => el('th', {}, h)))));
        const tb = el('tbody', {});
        [0.5, 1, 1.5, 2, 2.5, 3, 4, 5].forEach(rr => {
          const be = (100 / (1 + rr)).toFixed(1) + '%';
          const exp = wr => ((wr/100)*rr - (1 - wr/100)).toFixed(2) + 'R';
          tb.appendChild(el('tr', {},
            el('td', { class: 'bold' }, '1:' + rr),
            el('td', {}, be),
            el('td', { class: (exp(30).includes('-') ? 'neg' : 'pos') }, exp(30)),
            el('td', { class: (exp(40).includes('-') ? 'neg' : 'pos') }, exp(40)),
            el('td', { class: (exp(50).includes('-') ? 'neg' : 'pos') }, exp(50)),
            el('td', { class: (exp(60).includes('-') ? 'neg' : 'pos') }, exp(60)),
          ));
        });
        t.appendChild(tb);
        return t;
      })()
    )
  }));
}
