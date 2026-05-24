/* RUx — Risk modülleri: stop yönetimi, drawdown, portföy risk, korelasyon izleme, sermaye koruma, portföy backtest */
import { State, el, fmtPct, toast, fetchMarket, atr, ema } from './api.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { ICN, statCard, card, pageHead, ringGauge, sparkline } from './components.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';

/* ====================== STOP YÖNETİMİ ====================== */
export async function renderStop(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'STOP YÖNETİMİ',
    subtitle: 'ATR, structural, time-based ve break-even stop türleri için kural seti ve canlı durum.',
    actions: [
      el('a', { class: 'btn', href: '#/atr' }, ICN.bars(12), 'ATR YÖNETİMİ'),
      el('a', { class: 'btn primary', href: '#/pozisyon-buyuklugu' }, ICN.scale(12), 'POZ. BÜYÜKLÜĞÜ'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-4 section' });
  let last = 0, atrVal = 0, atrPct = 0;
  try {
    const d = await fetchMarket(State.symbol, '4h', 200);
    const candles = d?.candles || [];
    if (candles.length > 20) {
      last = candles[candles.length-1].close;
      const arr = atr(candles, 14);
      atrVal = arr[arr.length-1] || 0;
      atrPct = last > 0 ? (atrVal / last) * 100 : 0;
    }
  } catch {}

  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'cyan', label: 'ATR(14) 4H', value: '$' + atrVal.toFixed(2), sub: atrPct.toFixed(2) + '% / fiyat' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'red', label: 'STOP MESAFESİ', value: '1.8 × ATR', sub: '$' + (atrVal * 1.8).toFixed(2) }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'green', label: 'TP1 TRİGGER', value: '+1R', sub: 'Break-even sonrası' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'yellow', label: 'TIME STOP', value: '24 mum', sub: '4H için 4 gün' }));
  host.appendChild(stats);

  // Stop type table
  host.appendChild(card({
    title: 'STOP TÜRLERİ KARŞILAŞTIRMA',
    body: el('div', { class: 'pad-12' }, (() => {
      const t = el('table', { class: 'tbl' });
      t.appendChild(el('thead', {}, el('tr', {}, ...['TÜR','HESAPLAMA','AVANTAJ','RİSK','KULLANIM'].map(h => el('th', {}, h)))));
      const tb = el('tbody', {});
      [
        ['ATR Stop', 'Entry − (ATR × 1.5 - 2.0)', 'Volatiliteye uyumlu', 'Düşük vol\'da yakın stop', 'Trend pullback'],
        ['Structural Stop', 'Son swing low/high altında', 'PA logic ile uyumlu', 'Geniş stop, küçük adet', 'Sweep reversal, BOS'],
        ['Time Stop', 'X mum sonra invalidate', 'Trade tıkanmasını önler', 'Volatil koşulda erken çıkış', 'Range, squeeze'],
        ['Break-Even Stop', 'TP1 sonrası → entry', 'Kaybeden işleme dönüşü engel', 'TP1 sonrası squeeze riski', 'TP1 dolu pozisyon'],
        ['Trailing ATR', 'En son close − (ATR × N)', 'Trende ait kâr koruma', 'Geri çekilmede prematür kapanma', 'Trend takip']
      ].forEach(r => tb.appendChild(el('tr', {}, ...r.map((c, i) => el('td', { class: i === 0 ? 'bold' : i === 1 ? 'mono small' : 'small muted' }, c)))));
      t.appendChild(tb);
      return t;
    })())
  }));

  // Stop discipline rules
  host.appendChild(card({
    title: 'STOP DİSİPLİN KURALLARI',
    body: el('div', { class: 'pad-12' },
      el('ul', { style: 'padding-left:24px; line-height:1.8' },
        el('li', { class: 'small' }, 'Stop fiyatı emir öncesi belirlenir; piyasa hareketine göre değiştirilmez (yalnızca trailing ile sıkılaştırılabilir).'),
        el('li', { class: 'small' }, 'Stop genişletmek = işlemi başka bir işleme dönüştürmek demektir. Yapılmaz.'),
        el('li', { class: 'small' }, 'Stop yakınsa kısmi pozisyon kapatma değil, pozisyondan tamamen çık.'),
        el('li', { class: 'small' }, 'Aynı setup için son 3 işlem stop yedi → setup pasife alınır, ablation testi yapılır.'),
        el('li', { class: 'small' }, 'Slipaj > %0.5 → broker / borsa değişimi düşünülür.'),
        el('li', { class: 'small' }, 'TP1 dolduktan sonra stop break-even\'a alınır; bu kuralın ihlali sistemde fidelity gap olarak loglanır.'),
      )
    )
  }));
}

/* ====================== DRAWDOWN KONTROLÜ ====================== */
export async function renderDrawdown(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'DRAWDOWN KONTROLÜ',
    subtitle: 'Hesap drawdown durumu, peak-to-trough, recovery oranı ve max DD limit izleme.',
    actions: [
      el('a', { class: 'btn', href: '#/sermaye-koruma' }, ICN.shieldcheck(12), 'SERMAYE KORUMA'),
      el('a', { class: 'btn primary', href: '#/portfoy-isi' }, ICN.flame(12), 'PORTFÖY ISISI'),
    ]
  }));

  // Build a synthetic equity curve from journal storage if any
  let equityCurve = [];
  try {
    const raw = localStorage.getItem('rux.journal.runs') || '[]';
    const runs = JSON.parse(raw);
    let bal = 10000;
    equityCurve.push(bal);
    runs.forEach(r => { bal += (r.netR || 0) * 100; equityCurve.push(bal); });
  } catch {}
  if (equityCurve.length < 2) {
    // demo curve
    let bal = 10000;
    equityCurve = [bal];
    for (let i = 0; i < 60; i++) { bal *= 1 + (Math.random() - 0.46) * 0.04; equityCurve.push(bal); }
  }

  // Compute drawdown stats
  let peak = -Infinity, maxDD = 0, currentDD = 0, peakIdx = 0, troughIdx = 0;
  for (let i = 0; i < equityCurve.length; i++) {
    if (equityCurve[i] > peak) peak = equityCurve[i];
    const dd = peak > 0 ? (peak - equityCurve[i]) / peak * 100 : 0;
    if (dd > maxDD) { maxDD = dd; peakIdx = i - Math.floor(i/4); troughIdx = i; }
    currentDD = dd;
  }
  const stats = el('div', { class: 'stat-row cols-5 section' });
  stats.appendChild(statCard({ icon: ICN.dollar(18), iconColor: 'cyan', label: 'GÜNCEL BAKİYE', value: '$' + equityCurve[equityCurve.length-1].toFixed(0), sub: ((equityCurve[equityCurve.length-1] / equityCurve[0] - 1) * 100).toFixed(1) + '% toplam' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'PEAK BAKİYE', value: '$' + peak.toFixed(0), sub: 'Tepe noktası' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'MAX DRAWDOWN', value: '-' + maxDD.toFixed(1) + '%', sub: 'En kötü çekilme', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: 'yellow', label: 'MEVCUT DD', value: '-' + currentDD.toFixed(1) + '%', sub: peak > equityCurve[equityCurve.length-1] ? 'AKTİF' : 'TEMİZ', subColor: currentDD > 5 ? 'neg' : 'pos' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'LİMİT KONUMU', value: maxDD < 10 ? 'NORMAL' : maxDD < 20 ? 'UYARI' : 'KRİTİK', sub: 'Eşik: 20% hard stop', subColor: maxDD > 20 ? 'neg bold' : maxDD > 10 ? 'warn' : 'pos' }));
  host.appendChild(stats);

  // Drawdown rules
  const ruleCard = el('div', { class: 'card section' });
  ruleCard.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'DRAWDOWN ESKALATİF KURALLARI')));
  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {}, ...['DD SEVİYESİ','AKSİYON','POZ. BÜYÜKLÜĞÜ','YENİ İŞLEM POLİTİKASI'].map(h => el('th', {}, h)))));
  const tb = el('tbody', {});
  const stages = [
    [0, 5, 'NORMAL', '%100 standart', 'Tüm setup seviyeleri (A+/A/B)', 'green'],
    [5, 10, 'DİKKAT', '%75', 'Sadece A+ ve A setup', 'yellow'],
    [10, 15, 'KISITLI', '%50', 'Sadece A+ setup', 'orange'],
    [15, 20, 'KORUMA', '%25', 'Sadece A+ + valid regime', 'red'],
    [20, 100, 'STOP', '%0 (durdur)', 'YENİ İŞLEM YOK — review zorunlu', 'red']
  ];
  stages.forEach(s => {
    const isActive = currentDD >= s[0] && currentDD < s[1];
    tb.appendChild(el('tr', { class: isActive ? 'row-highlight' : '' },
      el('td', { class: 'bold' }, '-' + s[0] + '% → -' + s[1] + '%'),
      el('td', {}, el('span', { class: 'tag ' + s[5] }, s[2])),
      el('td', { class: 'mono' }, s[3]),
      el('td', { class: 'small' }, s[4]),
    ));
  });
  tbl.appendChild(tb);
  ruleCard.appendChild(el('div', { class: 'pad-12' }, tbl));
  host.appendChild(ruleCard);

  // Recovery analysis
  const recoveryReq = currentDD > 0 ? (100 / (100 - currentDD) - 1) * 100 : 0;
  host.appendChild(card({
    title: 'RECOVERY ANALİZİ',
    body: el('div', { class: 'pad-12' },
      el('div', { class: 'small mb-6' }, 'Mevcut drawdown\'dan çıkmak için gereken kazanç:'),
      el('div', { class: 'flex between' },
        el('span', { class: 'small' }, 'Gerekli Geri Kazanç'),
        el('span', { class: 'mono pos bold' }, '+' + recoveryReq.toFixed(2) + '%')
      ),
      el('div', { class: 'small muted mt-12' }, '50% drawdown → %100 geri kazanç gerektirir. Drawdown küçükken kontrol kritiktir.'),
      el('table', { class: 'tbl tbl-compact mt-12' },
        el('thead', {}, el('tr', {}, el('th', {}, 'DRAWDOWN'), el('th', {}, 'GEREKLİ KAZANÇ'))),
        el('tbody', {},
          ...[5, 10, 15, 20, 30, 40, 50].map(d => el('tr', {},
            el('td', { class: 'mono' }, '-' + d + '%'),
            el('td', { class: 'mono pos bold' }, '+' + (100/(100-d) - 1) * 100 >= 0 ? '+' + ((100/(100-d) - 1) * 100).toFixed(1) + '%' : '—')
          ))
        )
      )
    )
  }));
}

/* ====================== PORTFÖY RİSK ====================== */
export async function renderPortfoyRisk(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'PORTFÖY RİSK',
    subtitle: 'Açık pozisyonların korelasyonuna göre net yön riski, beta-adjusted exposure ve toplam ısı durumu.',
    actions: [
      el('a', { class: 'btn', href: '#/portfoy-isi' }, ICN.flame(12), 'PORTFÖY ISISI'),
      el('a', { class: 'btn', href: '#/korelasyon-izleme' }, ICN.link(12), 'KORELASYON'),
    ]
  }));

  // Pull open positions from journal/localStorage if available
  let positions = [];
  try {
    const raw = localStorage.getItem('rux.openPositions') || '[]';
    positions = JSON.parse(raw);
  } catch {}
  if (!positions.length) {
    positions = [
      { symbol: 'BTCUSDT', dir: 'LONG', notional: 5000, riskUsd: 50, entry: 102500, beta: 1.0 },
      { symbol: 'ETHUSDT', dir: 'LONG', notional: 3500, riskUsd: 35, entry: 5450, beta: 1.2 },
      { symbol: 'SOLUSDT', dir: 'LONG', notional: 2000, riskUsd: 25, entry: 215.4, beta: 1.5 },
    ];
  }
  const totalRisk = positions.reduce((s,p) => s + (p.riskUsd || 0), 0);
  const totalNotional = positions.reduce((s,p) => s + (p.notional || 0), 0);
  const netBeta = positions.reduce((s,p) => s + (p.dir === 'LONG' ? 1 : -1) * (p.beta || 1) * (p.notional || 0), 0);
  const netBetaPct = totalNotional > 0 ? netBeta / totalNotional : 0;

  const stats = el('div', { class: 'stat-row cols-4 section' });
  stats.appendChild(statCard({ icon: ICN.briefcase(18), iconColor: 'cyan', label: 'AÇIK POZİSYON', value: String(positions.length), sub: '$' + totalNotional.toFixed(0) + ' notional' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'red', label: 'TOPLAM RİSK', value: '$' + totalRisk.toFixed(0), sub: ((totalRisk/10000)*100).toFixed(1) + '% bakiye varsayım', subColor: totalRisk > 500 ? 'neg' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'NET BETA EXPOSURE', value: (netBetaPct > 0 ? '+' : '') + netBetaPct.toFixed(2), sub: 'BTC eşdeğeri yön', subColor: Math.abs(netBetaPct) > 0.7 ? 'warn' : 'pos' }));
  stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: 'yellow', label: 'KORELASYON ISISI', value: positions.filter(p => p.dir === 'LONG').length === positions.length ? 'YÜKSEK' : 'KARIŞIK', sub: positions.filter(p => p.dir === 'LONG').length + ' LONG / ' + positions.filter(p => p.dir === 'SHORT').length + ' SHORT' }));
  host.appendChild(stats);

  // Position table
  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {}, ...['SYMBOL','YÖN','NOTIONAL','RİSK USD','RİSK %','BETA','BETA-ADJ EXPOSURE'].map(h => el('th', {}, h)))));
  const tb = el('tbody', {});
  positions.forEach(p => {
    const exposurePct = totalNotional > 0 ? (p.notional / totalNotional) * 100 : 0;
    const betaAdj = (p.dir === 'LONG' ? 1 : -1) * (p.beta || 1) * (p.notional || 0);
    tb.appendChild(el('tr', {},
      el('td', { class: 'bold mono' }, p.symbol),
      el('td', {}, el('span', { class: 'tag ' + (p.dir === 'LONG' ? 'green' : 'red') }, p.dir)),
      el('td', { class: 'r mono' }, '$' + p.notional.toFixed(0)),
      el('td', { class: 'r mono neg' }, '$' + (p.riskUsd || 0).toFixed(0)),
      el('td', { class: 'r mono' }, exposurePct.toFixed(1) + '%'),
      el('td', { class: 'r mono' }, (p.beta || 1).toFixed(2)),
      el('td', { class: 'r mono ' + (betaAdj >= 0 ? 'pos' : 'neg') }, (betaAdj >= 0 ? '+' : '') + betaAdj.toFixed(0)),
    ));
  });
  tbl.appendChild(tb);
  host.appendChild(card({ title: 'AÇIK POZİSYON DETAYI', body: el('div', { class: 'pad-12' }, tbl) }));

  // Portfolio rules
  host.appendChild(card({
    title: 'PORTFÖY RİSK KURALLARI',
    body: el('div', { class: 'pad-12' },
      el('ul', { style: 'padding-left:24px; line-height:1.8' },
        el('li', { class: 'small' }, 'Toplam aktif risk hesap bakiyesinin %6\'sını geçemez (3 işlem × %2 risk).'),
        el('li', { class: 'small' }, 'Yüksek korelasyonlu (BTC-ETH-SOL) pozisyonlar tek bir net pozisyon olarak sayılır.'),
        el('li', { class: 'small' }, 'Net beta-adjusted exposure |0.7| üstüyse yeni LONG/SHORT açma — mevcutu hedge\'le.'),
        el('li', { class: 'small' }, 'Tek bir varlığa toplam exposure %40\'ı geçmemeli.'),
        el('li', { class: 'small' }, 'Drawdown -10%\'a yaklaştıkça net exposure mekanik olarak küçültülür.'),
      )
    )
  }));
}

/* ====================== KORELASYON İZLEME ====================== */
export async function renderKorelasyonIzleme(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'KORELASYON İZLEME',
    subtitle: 'BTC, ETH ve majör altcoin\'ler arasında rolling korelasyon, regime şift uyarıları.',
    actions: [
      el('a', { class: 'btn', href: '#/analiz-korelasyon' }, ICN.link(12), 'KORELASYON ANALİZİ'),
      el('button', { class: 'btn primary', id: 'btnReloadCor' }, ICN.refresh(12), 'YENİDEN HESAPLA'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-4 section', id: 'corStats' });
  host.appendChild(stats);

  const matrixCard = el('div', { class: 'card section' });
  matrixCard.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'KORELASYON MATRİSİ (Pearson, 4H closes, son 60 mum)')));
  const matrixBody = el('div', { class: 'pad-12', id: 'corMatrix' });
  matrixBody.appendChild(el('div', { class: 'empty' }, el('span', { class: 'loader' }), ' Hesaplanıyor...'));
  matrixCard.appendChild(matrixBody);
  host.appendChild(matrixCard);

  const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','LINKUSDT'];

  async function compute() {
    matrixBody.innerHTML = '';
    matrixBody.appendChild(el('div', { class: 'empty' }, el('span', { class: 'loader' }), ' Hesaplanıyor...'));
    const closesMap = {};
    await Promise.all(symbols.map(async sym => {
      try {
        const d = await fetchMarket(sym, '4h', 80);
        const candles = d?.candles || [];
        closesMap[sym] = candles.slice(-60).map(c => c.close);
      } catch { closesMap[sym] = []; }
    }));

    function corr(a, b) {
      const n = Math.min(a.length, b.length);
      if (n < 5) return null;
      const aa = a.slice(-n), bb = b.slice(-n);
      const ma = aa.reduce((s,x) => s+x, 0) / n;
      const mb = bb.reduce((s,x) => s+x, 0) / n;
      let num = 0, da = 0, db = 0;
      for (let i = 0; i < n; i++) {
        const x = aa[i] - ma, y = bb[i] - mb;
        num += x * y; da += x*x; db += y*y;
      }
      return da*db > 0 ? num / Math.sqrt(da*db) : 0;
    }

    function cell(v) {
      if (v == null) return el('td', { class: 'muted' }, '—');
      const abs = Math.abs(v);
      let cls = 'pos', txt = v.toFixed(2);
      if (v < -0.5) cls = 'neg';
      else if (v < 0) cls = 'warn';
      else if (v > 0.8) cls = 'pos bold';
      else cls = 'muted';
      return el('td', { class: 'r mono ' + cls, style: 'background: rgba(' + (v>0 ? '16,185,129' : '239,68,68') + ',' + (abs * 0.3).toFixed(2) + ')' }, txt);
    }

    matrixBody.innerHTML = '';
    const t = el('table', { class: 'tbl' });
    t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, ''), ...symbols.map(s => el('th', { class: 'r' }, s.replace('USDT',''))))));
    const tb = el('tbody', {});
    let avgCorr = 0, count = 0, maxC = -1, maxPair = '';
    symbols.forEach(s1 => {
      const r = el('tr', {});
      r.appendChild(el('td', { class: 'bold mono' }, s1.replace('USDT','')));
      symbols.forEach(s2 => {
        const c = s1 === s2 ? 1 : corr(closesMap[s1], closesMap[s2]);
        r.appendChild(cell(c));
        if (s1 < s2 && c != null) { avgCorr += c; count++; if (c > maxC) { maxC = c; maxPair = s1+'/'+s2; } }
      });
      tb.appendChild(r);
    });
    t.appendChild(tb);
    matrixBody.appendChild(t);

    avgCorr = count > 0 ? avgCorr / count : 0;
    stats.innerHTML = '';
    stats.appendChild(statCard({ icon: ICN.link(18), iconColor: 'cyan', label: 'ORTALAMA KORELASYON', value: avgCorr.toFixed(2), sub: avgCorr > 0.7 ? 'YÜKSEK ısı' : avgCorr > 0.4 ? 'ORTA' : 'DÜŞÜK', subColor: avgCorr > 0.7 ? 'warn' : 'pos' }));
    stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: 'red', label: 'EN YÜKSEK ÇİFT', value: maxC.toFixed(2), sub: maxPair.replace('USDT','').replace('USDT','') }));
    stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'DİVERSİFİKASYON', value: avgCorr < 0.5 ? 'İYİ' : avgCorr < 0.8 ? 'ZAYIF' : 'YOK', sub: 'Korelasyon bazlı' }));
    stats.appendChild(statCard({ icon: ICN.refresh(18), iconColor: 'blue', label: 'PERİYOT', value: '60 × 4H', sub: 'Son 10 gün' }));
  }

  host.querySelector('#btnReloadCor')?.addEventListener('click', () => {
    compute();
    toast('Korelasyon yeniden hesaplandı', 'ok');
  });

  compute();

  // Interpretation card
  host.appendChild(card({
    title: 'KORELASYON YORUM REHBERİ',
    body: el('div', { class: 'pad-12' },
      el('ul', { style: 'padding-left:24px; line-height:1.8' },
        el('li', { class: 'small' }, '>0.85: Aşırı yüksek korelasyon. Aynı sinyal varlıkları gibi davranır — diversifikasyon yanılsaması.'),
        el('li', { class: 'small' }, '0.65-0.85: Yüksek, kripto için normal. Risk paylaşımı sınırlı.'),
        el('li', { class: 'small' }, '0.3-0.65: Orta. Kısmi diversifikasyon var.'),
        el('li', { class: 'small' }, '-0.3 ile 0.3: Düşük korelasyon, gerçek diversifikasyon (BTC vs altcoin nadiren bu seviyede).'),
        el('li', { class: 'small' }, 'Negatif: Hedge fırsatı; ancak kripto evreninde nadiren sürdürülebilir.'),
      )
    )
  }));
}

/* ====================== SERMAYE KORUMA ====================== */
export async function renderSermayeKoruma(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'SERMAYE KORUMA',
    subtitle: 'Hesap bakiyesi koruma katmanları: max risk, max DD, position freezing kuralları.',
    actions: [
      el('a', { class: 'btn', href: '#/drawdown' }, ICN.warning(12), 'DRAWDOWN'),
      el('a', { class: 'btn primary', href: '#/risk' }, ICN.shield(12), 'RİSK PANELİ'),
    ]
  }));

  // Layers
  host.appendChild(card({
    title: 'SERMAYE KORUMA KATMANLARI',
    body: el('div', { class: 'pad-12' }, (() => {
      const layers = [
        { name: 'KATMAN 1: İşlem Riski', rule: 'Tek işlem en fazla %2 hesap riski', trigger: 'Otomatik (pos. sizing)', action: 'Pozisyon büyüklüğü matematik olarak sınırlanır', cls: 'green' },
        { name: 'KATMAN 2: Toplam Aktif Risk', rule: 'Tüm açık pozisyonlar toplamı en fazla %6', trigger: 'Açık pozisyon tablosu', action: 'Yeni işlem otomatik bloke (no-trade)', cls: 'green' },
        { name: 'KATMAN 3: Günlük Loss Cap', rule: 'Günlük max kayıp %4 ise gün kapatılır', trigger: 'Realized loss kontrolü', action: 'Yeni işlem 24 saat blokajı + review', cls: 'yellow' },
        { name: 'KATMAN 4: DD Eskalasyon', rule: '-10% DD\'de pozisyon büyüklüğü %50, -15%\'te %25', trigger: 'Equity curve monitörü', action: 'Sistematik risk azaltma', cls: 'orange' },
        { name: 'KATMAN 5: Hard Stop', rule: '-20% DD → tüm aktiviteye DUR', trigger: 'Equity guard', action: 'Hesap dondurulur, full review zorunlu', cls: 'red' },
      ];
      const t = el('table', { class: 'tbl' });
      t.appendChild(el('thead', {}, el('tr', {}, ...['KATMAN','KURAL','TETİKLEYİCİ','AKSİYON'].map(h => el('th', {}, h)))));
      const tb = el('tbody', {});
      layers.forEach(l => tb.appendChild(el('tr', {},
        el('td', {}, el('span', { class: 'tag ' + l.cls }, l.name)),
        el('td', { class: 'small bold' }, l.rule),
        el('td', { class: 'small muted' }, l.trigger),
        el('td', { class: 'small' }, l.action),
      )));
      t.appendChild(tb);
      return t;
    })())
  }));

  // Capital reset rules
  host.appendChild(card({
    title: 'REVİZYON & RESET KURALLARI',
    body: el('div', { class: 'pad-12' },
      el('ul', { style: 'padding-left:24px; line-height:1.8' },
        el('li', { class: 'small' }, 'Hard stop tetiklenirse: 7 gün full işlem yok, log analizi, kural setinin yeniden test edilmesi.'),
        el('li', { class: 'small' }, 'Setup bazlı consecutive 3 stop: setup pasife alınır, walk-forward testi yapılır.'),
        el('li', { class: 'small' }, 'Aylık kazanç %15+: pozisyon büyüklüğü 1 ay sabit kalır (greed disipliıni).'),
        el('li', { class: 'small' }, 'Açık pozisyonun günlük kontrolü: stop seviyesinin gerçek olduğundan emin ol (broker stop iptal etmemiş mi?).'),
        el('li', { class: 'small' }, 'Tatil/seyahat: sermaye en az %30 azaltılır, sadece A+ setup\'lar.'),
      )
    )
  }));
}

/* ====================== PORTFÖY BACKTEST ====================== */
export async function renderPortfoyBt(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'PORTFÖY BACKTEST',
    subtitle: 'Çoklu varlık ve setup üzerinden portföy seviyesinde performans simülasyonu.',
    actions: [
      el('a', { class: 'btn', href: '#/walkforward' }, ICN.swap(12), 'WALK-FORWARD'),
      el('a', { class: 'btn', href: '#/montecarlo' }, ICN.flow(12), 'MONTE CARLO'),
    ]
  }));

  // Build aggregate stats from journal
  let runs = [];
  try { runs = JSON.parse(localStorage.getItem('rux.journal.runs') || '[]'); } catch {}
  if (!runs.length) {
    // demo runs
    for (let i = 0; i < 80; i++) {
      const win = Math.random() < 0.48;
      const netR = win ? 1.5 + Math.random() * 1.5 : -1 - Math.random() * 0.2;
      runs.push({ symbol: ['BTCUSDT','ETHUSDT','SOLUSDT'][i%3], setup: ['SweepReversal','TrendPullback','BreakoutRetest'][i%3], netR, win });
    }
  }
  const wins = runs.filter(r => r.netR > 0).length;
  const wr = runs.length ? (wins / runs.length) * 100 : 0;
  const totalR = runs.reduce((s,r) => s + r.netR, 0);
  const avgR = runs.length ? totalR / runs.length : 0;
  const grossWin = runs.filter(r => r.netR > 0).reduce((s,r) => s + r.netR, 0);
  const grossLoss = Math.abs(runs.filter(r => r.netR < 0).reduce((s,r) => s + r.netR, 0));
  const pf = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? 99 : 0);

  const stats = el('div', { class: 'stat-row cols-5 section' });
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'cyan', label: 'TOPLAM İŞLEM', value: String(runs.length), sub: 'Backtest evreni' }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'WIN RATE', value: wr.toFixed(1) + '%', sub: wins + ' kazanç', subColor: wr > 50 ? 'pos' : 'warn' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'blue', label: 'ORTALAMA R', value: avgR.toFixed(2) + 'R', sub: 'Beklenti', subColor: avgR > 0 ? 'pos bold' : 'neg bold' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'yellow', label: 'PROFIT FACTOR', value: pf.toFixed(2), sub: pf > 1.5 ? 'İYİ' : pf > 1.0 ? 'ZAYIF' : 'NEGATİF', subColor: pf > 1.5 ? 'pos' : pf > 1 ? 'warn' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.dollar(18), iconColor: 'green', label: 'TOPLAM R', value: totalR.toFixed(1) + 'R', sub: '100 işlemde tahmini', subColor: totalR > 0 ? 'pos bold' : 'neg' }));
  host.appendChild(stats);

  // Per-setup breakdown
  const bySetup = {};
  runs.forEach(r => {
    if (!bySetup[r.setup]) bySetup[r.setup] = { count: 0, wins: 0, totalR: 0 };
    bySetup[r.setup].count++;
    if (r.netR > 0) bySetup[r.setup].wins++;
    bySetup[r.setup].totalR += r.netR;
  });
  const t1 = el('table', { class: 'tbl' });
  t1.appendChild(el('thead', {}, el('tr', {}, ...['SETUP','İŞLEM','WIN RATE','ORT. R','TOPLAM R','EDGE'].map(h => el('th', {}, h)))));
  const tb1 = el('tbody', {});
  Object.entries(bySetup).forEach(([setup, s]) => {
    const wr2 = s.count ? (s.wins / s.count) * 100 : 0;
    const avg = s.count ? s.totalR / s.count : 0;
    tb1.appendChild(el('tr', {},
      el('td', { class: 'bold' }, setup),
      el('td', { class: 'r mono' }, String(s.count)),
      el('td', { class: 'r mono ' + (wr2 > 50 ? 'pos' : 'muted') }, wr2.toFixed(1) + '%'),
      el('td', { class: 'r mono ' + (avg > 0 ? 'pos' : 'neg') }, avg.toFixed(2) + 'R'),
      el('td', { class: 'r mono ' + (s.totalR > 0 ? 'pos bold' : 'neg') }, s.totalR.toFixed(1) + 'R'),
      el('td', {}, el('span', { class: 'tag ' + (avg > 0.3 ? 'green' : avg > 0 ? 'yellow' : 'red') }, avg > 0.3 ? 'STRONG' : avg > 0 ? 'WEAK' : 'NEGATIVE')),
    ));
  });
  t1.appendChild(tb1);
  host.appendChild(card({ title: 'SETUP BAZINDA PERFORMANS', body: el('div', { class: 'pad-12' }, t1) }));

  // Per-symbol breakdown
  const bySym = {};
  runs.forEach(r => {
    if (!bySym[r.symbol]) bySym[r.symbol] = { count: 0, wins: 0, totalR: 0 };
    bySym[r.symbol].count++;
    if (r.netR > 0) bySym[r.symbol].wins++;
    bySym[r.symbol].totalR += r.netR;
  });
  const t2 = el('table', { class: 'tbl' });
  t2.appendChild(el('thead', {}, el('tr', {}, ...['VARLIK','İŞLEM','WIN RATE','TOPLAM R'].map(h => el('th', {}, h)))));
  const tb2 = el('tbody', {});
  Object.entries(bySym).forEach(([sym, s]) => {
    const wr2 = s.count ? (s.wins / s.count) * 100 : 0;
    tb2.appendChild(el('tr', {},
      el('td', { class: 'bold mono' }, sym),
      el('td', { class: 'r mono' }, String(s.count)),
      el('td', { class: 'r mono ' + (wr2 > 50 ? 'pos' : 'muted') }, wr2.toFixed(1) + '%'),
      el('td', { class: 'r mono ' + (s.totalR > 0 ? 'pos' : 'neg') }, s.totalR.toFixed(1) + 'R'),
    ));
  });
  t2.appendChild(tb2);
  host.appendChild(card({ title: 'VARLIK BAZINDA PERFORMANS', body: el('div', { class: 'pad-12' }, t2) }));
}
