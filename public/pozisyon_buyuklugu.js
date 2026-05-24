/* RUx — Pozisyon Büyüklüğü Hesaplayıcısı (real working calculator) */
import { State, el, toast, fetchMarket } from './api.js?v=0.75.8-heatmap-panel-live-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.8-heatmap-panel-live-20260524';

const LS_KEY = 'rux.posSize.v1';

function loadDefaults() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveDefaults(obj) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
}

function fmtUsd(n) {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n/1e3).toFixed(2) + 'K';
  return '$' + n.toFixed(2);
}

function calc(state) {
  const eq = Math.max(0, Number(state.equity) || 0);
  const riskPct = Math.max(0, Math.min(100, Number(state.riskPct) || 0));
  const entry = Math.max(0, Number(state.entry) || 0);
  const stop = Math.max(0, Number(state.stop) || 0);
  const direction = state.direction || 'LONG';
  const feeBp = Math.max(0, Number(state.feeBp) || 0);
  const slipBp = Math.max(0, Number(state.slipBp) || 0);
  const lev = Math.max(1, Number(state.leverage) || 1);
  const tp1R = Number(state.tp1R) || 1;
  const tp2R = Number(state.tp2R) || 2;
  const tp3R = Number(state.tp3R) || 3;

  const out = {
    valid: false,
    riskUsd: 0,
    stopDistPct: 0,
    stopDistAbs: 0,
    qty: 0,
    notional: 0,
    margin: 0,
    tp1: 0, tp2: 0, tp3: 0,
    feeUsd: 0, slipUsd: 0, totalCostUsd: 0,
    netRiskUsd: 0,
    breakEven: 0,
    warnings: []
  };

  if (eq <= 0) out.warnings.push('Hesap bakiyesi > 0 olmalı');
  if (entry <= 0) out.warnings.push('Giriş fiyatı > 0 olmalı');
  if (stop <= 0) out.warnings.push('Stop fiyatı > 0 olmalı');
  if (direction === 'LONG' && stop >= entry) out.warnings.push('LONG için stop, girişin altında olmalı');
  if (direction === 'SHORT' && stop <= entry) out.warnings.push('SHORT için stop, girişin üstünde olmalı');

  out.riskUsd = eq * (riskPct / 100);
  out.stopDistAbs = Math.abs(entry - stop);
  out.stopDistPct = entry > 0 ? (out.stopDistAbs / entry) * 100 : 0;

  if (eq > 0 && entry > 0 && stop > 0 && out.stopDistAbs > 0 && out.warnings.length === 0) {
    out.qty = out.riskUsd / out.stopDistAbs;
    out.notional = out.qty * entry;
    out.margin = out.notional / lev;

    if (direction === 'LONG') {
      out.tp1 = entry + out.stopDistAbs * tp1R;
      out.tp2 = entry + out.stopDistAbs * tp2R;
      out.tp3 = entry + out.stopDistAbs * tp3R;
      out.breakEven = entry * (1 + (feeBp + slipBp) / 10000);
    } else {
      out.tp1 = entry - out.stopDistAbs * tp1R;
      out.tp2 = entry - out.stopDistAbs * tp2R;
      out.tp3 = entry - out.stopDistAbs * tp3R;
      out.breakEven = entry * (1 - (feeBp + slipBp) / 10000);
    }

    // Fee + slippage cost across both legs (entry+exit)
    out.feeUsd = out.notional * (feeBp / 10000) * 2;
    out.slipUsd = out.notional * (slipBp / 10000) * 2;
    out.totalCostUsd = out.feeUsd + out.slipUsd;
    out.netRiskUsd = out.riskUsd + out.totalCostUsd;

    if (out.margin > eq) out.warnings.push('Marj, hesap bakiyesinden büyük. Kaldıracı arttır veya pozisyonu küçült.');
    if (riskPct > 5) out.warnings.push('Tek işlemde >%5 risk önerilmez');
    if (out.stopDistPct < 0.2) out.warnings.push('Stop mesafesi çok dar (%0.2 altı) — slipaj/manipülasyon riski');

    out.valid = out.warnings.length === 0;
  }

  return out;
}

export async function renderPozisyonBuyuklugu(host) {
  host.innerHTML = '';
  const def = loadDefaults();
  const state = {
    equity: def.equity ?? 10000,
    riskPct: def.riskPct ?? 1.0,
    direction: def.direction ?? 'LONG',
    entry: def.entry ?? 0,
    stop: def.stop ?? 0,
    leverage: def.leverage ?? 5,
    feeBp: def.feeBp ?? 6,
    slipBp: def.slipBp ?? 5,
    tp1R: def.tp1R ?? 1,
    tp2R: def.tp2R ?? 2,
    tp3R: def.tp3R ?? 3,
  };

  host.appendChild(pageHead({
    title: 'POZİSYON BÜYÜKLÜĞÜ',
    subtitle: 'Risk bazlı pozisyon büyüklüğü hesaplayıcısı. Hesap bakiyesine, stop mesafesine ve risk yüzdesine göre adet, marj, TP seviyeleri ve net risk hesaplar.',
    actions: [
      el('button', { class: 'btn outline-yellow', id: 'btnResetSize' }, ICN.refresh(12), 'SIFIRLA'),
      el('button', { class: 'btn primary', id: 'btnFetchPrice' }, ICN.download(12), 'CANLI FİYAT'),
    ]
  }));

  // Top live result row
  const stats = el('div', { class: 'stat-row cols-5 section', id: 'sizeStats' });
  host.appendChild(stats);

  // Two-column layout: inputs / results
  const grid = el('div', { class: 'row cols-2 section' });

  // -- Inputs panel --
  const inp = el('div', { class: 'card' });
  inp.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'GİRİŞ PARAMETRELERİ')
  ));

  function inputRow(label, inputEl, hint = '') {
    return el('div', { class: 'form-row', style: 'display:grid;grid-template-columns: 200px 1fr;gap:8px;padding:8px 12px;border-bottom:1px solid var(--surface-2);align-items:center' },
      el('div', { class: 'small' }, label, hint ? el('div', { class: 'tiny muted' }, hint) : null),
      inputEl
    );
  }

  const eqIn = el('input', { class: 'input', type: 'number', step: 'any', value: String(state.equity) });
  eqIn.addEventListener('input', () => { state.equity = parseFloat(eqIn.value); refresh(); });
  inp.appendChild(inputRow('Hesap Bakiyesi (USD)', eqIn, 'Toplam kullanılabilir sermaye'));

  const riskIn = el('input', { class: 'input', type: 'number', step: '0.1', value: String(state.riskPct) });
  riskIn.addEventListener('input', () => { state.riskPct = parseFloat(riskIn.value); refresh(); });
  inp.appendChild(inputRow('İşlem Başına Risk (%)', riskIn, 'Bu işlemde stop tetiklenirse kaybedeceğin %'));

  const dirGroup = el('div', { class: 'flex gap-6' });
  ['LONG','SHORT'].forEach(d => {
    const b = el('button', { class: 'btn sm ' + (state.direction === d ? (d === 'LONG' ? 'primary' : 'danger') : 'outline-cyan') }, d);
    b.addEventListener('click', () => {
      state.direction = d;
      dirGroup.querySelectorAll('button').forEach(btn => {
        const t = btn.textContent;
        btn.className = 'btn sm ' + (t === d ? (d === 'LONG' ? 'primary' : 'danger') : 'outline-cyan');
      });
      refresh();
    });
    dirGroup.appendChild(b);
  });
  inp.appendChild(inputRow('Yön', dirGroup));

  const entryIn = el('input', { class: 'input mono', type: 'number', step: 'any', value: state.entry || '' });
  entryIn.addEventListener('input', () => { state.entry = parseFloat(entryIn.value); refresh(); });
  inp.appendChild(inputRow('Giriş Fiyatı', entryIn));

  const stopIn = el('input', { class: 'input mono', type: 'number', step: 'any', value: state.stop || '' });
  stopIn.addEventListener('input', () => { state.stop = parseFloat(stopIn.value); refresh(); });
  inp.appendChild(inputRow('Stop Fiyatı', stopIn, 'Pozisyonun geçersiz sayıldığı seviye'));

  const levIn = el('input', { class: 'input', type: 'number', step: '0.5', min: '1', value: String(state.leverage) });
  levIn.addEventListener('input', () => { state.leverage = parseFloat(levIn.value); refresh(); });
  inp.appendChild(inputRow('Kaldıraç (x)', levIn, 'Sadece marj hesabı için. Riske etki etmez.'));

  const feeIn = el('input', { class: 'input', type: 'number', step: '0.5', value: String(state.feeBp) });
  feeIn.addEventListener('input', () => { state.feeBp = parseFloat(feeIn.value); refresh(); });
  inp.appendChild(inputRow('Komisyon (bp)', feeIn, '1 bp = %0.01 (taker yaklaşık 6-10 bp)'));

  const slipIn = el('input', { class: 'input', type: 'number', step: '0.5', value: String(state.slipBp) });
  slipIn.addEventListener('input', () => { state.slipBp = parseFloat(slipIn.value); refresh(); });
  inp.appendChild(inputRow('Slipaj (bp)', slipIn, 'Gerçekleşmesi beklenen ortalama fiyat sapması'));

  // TP R values inline
  const tpWrap = el('div', { class: 'flex gap-6' });
  ['tp1R','tp2R','tp3R'].forEach((k, i) => {
    const inp2 = el('input', { class: 'input', type: 'number', step: '0.1', value: String(state[k]), style: 'width:70px' });
    inp2.addEventListener('input', () => { state[k] = parseFloat(inp2.value); refresh(); });
    tpWrap.appendChild(el('div', {}, el('span', { class: 'tiny muted' }, 'TP' + (i+1) + ' (R) '), inp2));
  });
  inp.appendChild(inputRow('TP Çarpanları (R)', tpWrap));

  grid.appendChild(inp);

  // -- Results panel --
  const res = el('div', { class: 'card', id: 'sizeResult' });
  res.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'HESAPLAMA SONUCU'),
    el('span', { class: 'tag green', id: 'sizeBadge' }, 'BEKLEMEDE')
  ));
  const resBody = el('div', { class: 'pad-12', id: 'sizeResultBody' });
  res.appendChild(resBody);

  grid.appendChild(res);
  host.appendChild(grid);

  // Quick presets card
  const presets = el('div', { class: 'card section' },
    el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'HIZLI PRESETLER')),
    el('div', { class: 'pad-12 flex gap-8', style: 'flex-wrap:wrap' },
      ...[
        { label: 'Konservatif (%0.5 risk)', vals: { riskPct: 0.5 } },
        { label: 'Standart (%1)', vals: { riskPct: 1.0 } },
        { label: 'Agresif (%2)', vals: { riskPct: 2.0 } },
        { label: 'Sadece A+ (%3)', vals: { riskPct: 3.0 } },
        { label: '1R-2R-3R TP', vals: { tp1R: 1, tp2R: 2, tp3R: 3 } },
        { label: '1.5R-3R-5R TP', vals: { tp1R: 1.5, tp2R: 3, tp3R: 5 } },
      ].map(p => {
        const b = el('button', { class: 'btn sm outline-cyan' }, p.label);
        b.addEventListener('click', () => {
          Object.assign(state, p.vals);
          riskIn.value = state.riskPct;
          tpWrap.querySelectorAll('input').forEach((q, i) => q.value = state[['tp1R','tp2R','tp3R'][i]]);
          refresh();
          toast('Preset uygulandı: ' + p.label, 'ok');
        });
        return b;
      })
    )
  );
  host.appendChild(presets);

  // Risk education card
  host.appendChild(card({
    title: 'RİSK YÖNETİMİ NOTLARI',
    body: el('ul', { class: 'pad-12', style: 'padding-left:30px; line-height: 1.7' },
      el('li', { class: 'small' }, 'Tek işlemde %1–%2 risk profesyonel standarttır. %5 üstü hesap riski hızla erir.'),
      el('li', { class: 'small' }, 'Risk = stop mesafesi × pozisyon büyüklüğü. Bu hesaplayıcı her zaman risk USD\'sini sabit tutar.'),
      el('li', { class: 'small' }, 'Kaldıraç risk değil marj hesabıdır. Pozisyonun zarar etme miktarı stop mesafesine göre belirlenir.'),
      el('li', { class: 'small' }, 'Komisyon+slipaj toplam maliyet net R sonucunu düşürür. Düşük R/R işlemler net negatif edge\'e dönebilir.'),
      el('li', { class: 'small' }, 'Stop mesafesi %0.2 altında → çoğu volatil coin\'de tetikleme normaldir, gerçek sinyal değildir.'),
    )
  }));

  // Reset button
  host.querySelector('#btnResetSize')?.addEventListener('click', () => {
    if (!confirm('Tüm değerler sıfırlanacak. Emin misin?')) return;
    Object.assign(state, { equity: 10000, riskPct: 1, direction: 'LONG', entry: 0, stop: 0, leverage: 5, feeBp: 6, slipBp: 5, tp1R: 1, tp2R: 2, tp3R: 3 });
    saveDefaults({});
    renderPozisyonBuyuklugu(host);
  });
  host.querySelector('#btnFetchPrice')?.addEventListener('click', async () => {
    try {
      const d = await fetchMarket(State.symbol, '4h', 60);
      const px = Number(d?.ticker?.price ?? d?.candles?.at?.(-1)?.close);
      if (px > 0) {
        state.entry = px;
        entryIn.value = px;
        refresh();
        toast(`${State.symbol} canlı fiyat: ${px}`, 'ok');
      } else {
        toast('Canlı fiyat alınamadı', 'warn');
      }
    } catch (e) {
      toast('Canlı fiyat hatası: ' + (e?.message || e), 'err');
    }
  });

  function refresh() {
    saveDefaults(state);
    const out = calc(state);
    // Stats
    stats.innerHTML = '';
    stats.appendChild(statCard({
      icon: ICN.shield(18), iconColor: 'red', label: 'RİSK',
      value: fmtUsd(out.riskUsd), sub: state.riskPct + '% bakiye', subColor: 'warn'
    }));
    stats.appendChild(statCard({
      icon: ICN.scale(18), iconColor: 'cyan', label: 'STOP MESAFESİ',
      value: out.stopDistPct.toFixed(2) + '%', sub: '$' + out.stopDistAbs.toFixed(2)
    }));
    stats.appendChild(statCard({
      icon: ICN.cube(18), iconColor: 'blue', label: 'POZİSYON ADEDİ',
      value: out.qty > 0 ? out.qty.toFixed(6) : '—', sub: fmtUsd(out.notional) + ' notional'
    }));
    stats.appendChild(statCard({
      icon: ICN.briefcase(18), iconColor: 'yellow', label: 'MARJ (lev. x' + state.leverage + ')',
      value: fmtUsd(out.margin), sub: out.margin > 0 ? ((out.margin / state.equity)*100).toFixed(1) + '% bakiye' : '—',
      subColor: out.margin > state.equity ? 'neg' : 'muted'
    }));
    stats.appendChild(statCard({
      icon: ICN.dollar(18), iconColor: 'green', label: 'NET RİSK (komisyon+slipaj)',
      value: fmtUsd(out.netRiskUsd), sub: '+' + fmtUsd(out.totalCostUsd) + ' maliyet', subColor: 'neg'
    }));

    // Result body
    resBody.innerHTML = '';
    const badge = host.querySelector('#sizeBadge');
    if (!badge) { /* nothing */ }
    else {
      badge.className = 'tag ' + (out.valid ? 'green' : out.warnings.length ? 'red' : 'gray');
      badge.textContent = out.valid ? 'GEÇERLİ PLAN' : (out.warnings.length ? 'GİRİŞ HATASI' : 'BEKLEMEDE');
    }

    if (!out.valid) {
      const wrap = el('div', { class: 'pad-12' });
      if (out.warnings.length) {
        wrap.appendChild(el('div', { class: 'tag red' }, 'EKSİK/HATA'));
        const ul = el('ul', { style: 'padding-left:24px; margin-top:8px' });
        out.warnings.forEach(w => ul.appendChild(el('li', { class: 'small' }, w)));
        wrap.appendChild(ul);
      } else {
        wrap.appendChild(el('div', { class: 'muted small' }, 'Giriş, stop ve bakiyeyi gir — hesaplama otomatik yapılacak.'));
      }
      resBody.appendChild(wrap);
      return;
    }

    // Valid: build summary table
    const tbl = el('table', { class: 'tbl tbl-compact' });
    tbl.appendChild(el('tbody', {},
      tr('Yön', el('span', { class: 'tag ' + (state.direction === 'LONG' ? 'green' : 'red') }, state.direction)),
      tr('Giriş', el('span', { class: 'mono' }, state.entry.toFixed(4))),
      tr('Stop', el('span', { class: 'mono' }, state.stop.toFixed(4))),
      tr('Break-Even (komisyon + slipaj)', el('span', { class: 'mono' }, out.breakEven.toFixed(4))),
      tr('TP1 (' + state.tp1R + 'R)', el('span', { class: 'mono pos' }, out.tp1.toFixed(4))),
      tr('TP2 (' + state.tp2R + 'R)', el('span', { class: 'mono pos' }, out.tp2.toFixed(4))),
      tr('TP3 (' + state.tp3R + 'R)', el('span', { class: 'mono pos' }, out.tp3.toFixed(4))),
      tr('Pozisyon adedi', el('span', { class: 'mono' }, out.qty.toFixed(6))),
      tr('Notional', el('span', { class: 'mono' }, fmtUsd(out.notional))),
      tr('Marj (' + state.leverage + 'x)', el('span', { class: 'mono' }, fmtUsd(out.margin))),
      tr('Risk USD (stop tetiklenirse)', el('span', { class: 'mono neg' }, fmtUsd(out.riskUsd))),
      tr('Komisyon (iki yön)', el('span', { class: 'mono neg' }, fmtUsd(out.feeUsd))),
      tr('Slipaj (iki yön)', el('span', { class: 'mono neg' }, fmtUsd(out.slipUsd))),
      tr('Toplam İşlem Maliyeti', el('span', { class: 'mono neg' }, fmtUsd(out.totalCostUsd))),
      tr('Net Risk (stop + maliyet)', el('span', { class: 'mono bold neg' }, fmtUsd(out.netRiskUsd))),
    ));
    resBody.appendChild(el('div', { class: 'pad-12' }, tbl));

    // R/R analysis
    const rrBox = el('div', { class: 'pad-12', style: 'border-top:1px solid var(--surface-2)' });
    rrBox.appendChild(el('div', { class: 'card-title small mb-6' }, 'R/R ANALİZİ'));
    [
      ['TP1 ile kâr', out.qty * (state.direction === 'LONG' ? (out.tp1 - state.entry) : (state.entry - out.tp1)) - out.totalCostUsd, state.tp1R],
      ['TP2 ile kâr', out.qty * (state.direction === 'LONG' ? (out.tp2 - state.entry) : (state.entry - out.tp2)) - out.totalCostUsd, state.tp2R],
      ['TP3 ile kâr', out.qty * (state.direction === 'LONG' ? (out.tp3 - state.entry) : (state.entry - out.tp3)) - out.totalCostUsd, state.tp3R],
    ].forEach(([label, profit, r]) => {
      rrBox.appendChild(el('div', { class: 'flex between', style: 'padding:4px 0' },
        el('span', { class: 'small' }, label + ' (' + r + 'R)'),
        el('span', { class: 'small mono pos bold' }, fmtUsd(profit))
      ));
    });
    resBody.appendChild(rrBox);
  }

  function tr(k, v) {
    return el('tr', {},
      el('td', { class: 'small muted' }, k),
      el('td', { class: 'r' }, v)
    );
  }

  refresh();
}
