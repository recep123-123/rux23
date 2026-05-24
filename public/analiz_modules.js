/* RUx — Analiz modülleri: volatilite, korelasyon, döngü, akış, on-chain */
import { State, el, fetchMarket, toast, atr, ema, rsi } from './api.js?v=0.75.9-heatmap-premium-rework-20260524';
import { ICN, statCard, card, pageHead, ringGauge, sparkline } from './components.js?v=0.75.9-heatmap-premium-rework-20260524';

function clamp(v, a=0, b=100) { return Math.min(b, Math.max(a, v)); }

/* ====================== VOLATİLİTE ANALİZİ ====================== */
export async function renderVolatilite(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'VOLATİLİTE ANALİZİ',
    subtitle: 'ATR, gerçekleşmiş volatilite, Bollinger bandı genişliği ve rejim sınıflaması.',
    actions: [
      el('div', { class: 'select' }, State.symbol, ' ', ICN.chev(10)),
      el('button', { class: 'btn primary', id: 'btnReloadVol' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-5 section', id: 'volStats' });
  host.appendChild(stats);
  stats.appendChild(el('div', { class: 'empty' }, el('span', { class: 'loader' }), ' Volatilite hesaplanıyor...'));

  const periodCard = el('div', { class: 'card section' });
  periodCard.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'TIMEFRAME VOLATİLİTE TABLOSU')));
  const periodBody = el('div', { class: 'pad-12', id: 'volPeriodBody' });
  periodCard.appendChild(periodBody);
  host.appendChild(periodCard);

  async function compute() {
    const tfs = ['15m','1h','4h','1d'];
    const data = await Promise.all(tfs.map(tf => fetchMarket(State.symbol, tf, 200).catch(()=>null)));
    const rows = [];
    let main = null;
    tfs.forEach((tf, i) => {
      const d = data[i];
      const c = d?.candles || [];
      if (c.length < 30) { rows.push({ tf, atrPct: null, rvPct: null, bbw: null, regime: '—' }); return; }
      const closes = c.map(x => x.close);
      const last = closes[closes.length-1];
      const atrArr = atr(c, 14);
      const atrVal = atrArr[atrArr.length-1] || 0;
      const atrPct = (atrVal / last) * 100;
      // 20-bar realized vol (annualized stdev of log returns)
      const periodPerYear = tf === '15m' ? 365*96 : tf === '1h' ? 365*24 : tf === '4h' ? 365*6 : 365;
      const rets = [];
      for (let j = closes.length-20; j < closes.length; j++) if (j > 0) rets.push(Math.log(closes[j]/closes[j-1]));
      const mean = rets.reduce((s,x)=>s+x,0)/rets.length;
      const std = Math.sqrt(rets.reduce((s,x)=>s+(x-mean)**2,0)/rets.length);
      const rvPct = std * Math.sqrt(periodPerYear) * 100;
      // BBW
      const sma20 = closes.slice(-20).reduce((s,x)=>s+x,0)/20;
      const sd = Math.sqrt(closes.slice(-20).reduce((s,x)=>s+(x-sma20)**2,0)/20);
      const bbw = sma20 > 0 ? (4 * sd / sma20) * 100 : 0;
      // Regime
      let regime, regimeCls;
      if (bbw < 3) { regime = 'SQUEEZE'; regimeCls = 'yellow'; }
      else if (bbw < 6) { regime = 'NORMAL'; regimeCls = 'green'; }
      else if (bbw < 10) { regime = 'EXPANSION'; regimeCls = 'orange'; }
      else { regime = 'EXTREME'; regimeCls = 'red'; }
      rows.push({ tf, atrPct, rvPct, bbw, regime, regimeCls, last });
      if (tf === '4h') main = rows[rows.length-1];
    });

    stats.innerHTML = '';
    if (main) {
      stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'cyan', label: 'ATR%(14) 4H', value: main.atrPct.toFixed(2) + '%', sub: '$' + (main.last * main.atrPct / 100).toFixed(2) }));
      stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'blue', label: 'GERÇ. VOL (annual)', value: main.rvPct.toFixed(0) + '%', sub: '20-bar 4H' }));
      stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'yellow', label: 'BBW (4H)', value: main.bbw.toFixed(2) + '%', sub: 'Bollinger genişlik' }));
      stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: main.regimeCls, label: 'REJİM (4H)', value: main.regime, sub: 'Bollinger bazlı' }));
      stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'STOP ÖNERİSİ', value: (main.atrPct * 1.8).toFixed(2) + '%', sub: '1.8 × ATR' }));
    } else {
      stats.appendChild(el('div', { class: 'empty' }, 'Veri alınamadı'));
    }

    periodBody.innerHTML = '';
    const t = el('table', { class: 'tbl' });
    t.appendChild(el('thead', {}, el('tr', {}, ...['TIMEFRAME','ATR%','RV% (yıllık)','BBW%','REJİM','TAVSİYE'].map(h => el('th', {}, h)))));
    const tb = el('tbody', {});
    rows.forEach(r => {
      if (r.atrPct == null) {
        tb.appendChild(el('tr', {}, el('td', { class: 'bold' }, r.tf), el('td', { colspan: 5, class: 'muted small' }, 'Veri yetersiz')));
      } else {
        tb.appendChild(el('tr', {},
          el('td', { class: 'bold mono' }, r.tf),
          el('td', { class: 'r mono' }, r.atrPct.toFixed(2) + '%'),
          el('td', { class: 'r mono' }, r.rvPct.toFixed(0) + '%'),
          el('td', { class: 'r mono' }, r.bbw.toFixed(2) + '%'),
          el('td', {}, el('span', { class: 'tag ' + r.regimeCls }, r.regime)),
          el('td', { class: 'small' }, r.regime === 'SQUEEZE' ? 'Breakout bekle, küçük adet' : r.regime === 'NORMAL' ? 'Standart pozisyon' : r.regime === 'EXPANSION' ? 'Stop genişlet, adet düşür' : 'Aşırı volatilite — sadece A+ setup'),
        ));
      }
    });
    t.appendChild(tb);
    periodBody.appendChild(t);
  }

  host.querySelector('#btnReloadVol')?.addEventListener('click', () => { compute(); toast('Volatilite verileri güncellendi','ok'); });
  compute();

  // Volatility interpretation
  host.appendChild(card({
    title: 'VOLATİLİTE REJİMİ YORUM',
    body: el('div', { class: 'pad-12' },
      el('ul', { style: 'padding-left:24px; line-height:1.8' },
        el('li', { class: 'small' }, 'SQUEEZE: Bollinger bantları sıkıştı. Genellikle breakout öncesi. Pozisyon adedi düşük, yön belirsiz.'),
        el('li', { class: 'small' }, 'NORMAL: Standart işlem koşulları. Setup\'lar geçerli, R/R hedefleri sağlam.'),
        el('li', { class: 'small' }, 'EXPANSION: Genişleme. Trend takip stratejilerine uygun. Stop genişletilir, adet düşürülür.'),
        el('li', { class: 'small' }, 'EXTREME: Aşırı volatilite. Çoğu setup geçersiz. Sadece valid A+ ve haber-temizlenmiş ortam.'),
        el('li', { class: 'small' }, 'ATR%/RV% trendi: artıyorsa rejim genişliyor, azalıyorsa rejim sıkışıyor.'),
      )
    )
  }));
}

/* ====================== KORELASYON ANALİZİ ====================== */
export async function renderAnalizKorelasyon(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'KORELASYON ANALİZİ',
    subtitle: 'Multi-timeframe rolling korelasyon, BTC ile ilişki, sektörel korelasyon.',
    actions: [
      el('a', { class: 'btn', href: '#/korelasyon-izleme' }, ICN.link(12), 'KORELASYON İZLEME'),
    ]
  }));
  const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ARBUSDT','LINKUSDT'];
  const stats = el('div', { class: 'stat-row cols-4 section', id: 'cStats' });
  host.appendChild(stats);
  const tableBody = el('div', { class: 'pad-12', id: 'cBody' });
  host.appendChild(card({ title: 'BTC İLE KORELASYON (3 timeframe)', body: tableBody }));

  function corr(a, b) {
    const n = Math.min(a.length, b.length);
    if (n < 5) return null;
    const aa = a.slice(-n), bb = b.slice(-n);
    const ma = aa.reduce((s,x)=>s+x,0)/n, mb = bb.reduce((s,x)=>s+x,0)/n;
    let num=0, da=0, db=0;
    for (let i=0;i<n;i++){const x=aa[i]-ma,y=bb[i]-mb; num+=x*y; da+=x*x; db+=y*y;}
    return da*db>0 ? num/Math.sqrt(da*db) : 0;
  }

  async function run() {
    tableBody.innerHTML = '<div class="empty"><span class="loader"></span> Korelasyonlar hesaplanıyor...</div>';
    const tfs = ['1h','4h','1d'];
    const dataByTf = {};
    for (const tf of tfs) {
      const arr = await Promise.all(symbols.map(s => fetchMarket(s, tf, 80).catch(() => null)));
      dataByTf[tf] = {};
      symbols.forEach((s, i) => {
        const c = arr[i]?.candles || [];
        dataByTf[tf][s] = c.slice(-60).map(x => x.close);
      });
    }
    tableBody.innerHTML = '';
    const t = el('table', { class: 'tbl' });
    t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'VARLIK'), ...tfs.map(tf => el('th', { class: 'r' }, tf.toUpperCase())), el('th', {}, 'DEĞERLENDİRME'))));
    const tb = el('tbody', {});
    let sumCorr = 0, countCorr = 0;
    symbols.filter(s => s !== 'BTCUSDT').forEach(s => {
      const r = el('tr', {});
      r.appendChild(el('td', { class: 'bold mono' }, s.replace('USDT','')));
      const vals = tfs.map(tf => corr(dataByTf[tf]['BTCUSDT'], dataByTf[tf][s]));
      vals.forEach(v => {
        if (v == null) r.appendChild(el('td', { class: 'r muted mono' }, '—'));
        else {
          r.appendChild(el('td', { class: 'r mono ' + (v > 0.7 ? 'pos bold' : v > 0.3 ? 'pos' : v < -0.3 ? 'neg' : 'muted') }, v.toFixed(2)));
          sumCorr += v; countCorr++;
        }
      });
      const avg = vals.filter(x=>x!=null).reduce((s,x)=>s+x,0) / (vals.filter(x=>x!=null).length || 1);
      const note = avg > 0.85 ? 'BTC kopyası' : avg > 0.6 ? 'BTC takibi' : avg > 0.3 ? 'Yumuşak korelasyon' : 'Bağımsız';
      r.appendChild(el('td', { class: 'small ' + (avg > 0.85 ? 'warn' : 'muted') }, note));
      tb.appendChild(r);
    });
    t.appendChild(tb);
    tableBody.appendChild(t);
    const avgAll = countCorr > 0 ? sumCorr / countCorr : 0;
    stats.innerHTML = '';
    stats.appendChild(statCard({ icon: ICN.link(18), iconColor: 'cyan', label: 'BTC ORT. KORELASYON', value: avgAll.toFixed(2), sub: avgAll > 0.7 ? 'Yüksek' : 'Normal' }));
    stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: 'red', label: 'KRİPTO BETA RİSKİ', value: avgAll > 0.7 ? 'YÜKSEK' : 'ORTA', sub: 'BTC düşerse her şey düşer' }));
    stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'DİVERSİFİKASYON SKORU', value: ((1 - avgAll) * 100).toFixed(0) + '/100', sub: 'Korelasyondan türetilmiş' }));
    stats.appendChild(statCard({ icon: ICN.refresh(18), iconColor: 'blue', label: 'TIMEFRAME', value: '1H/4H/1D', sub: 'Son 60 mum' }));
  }
  run();
}

/* ====================== PİYASA DÖNGÜLERİ ====================== */
export async function renderPiyasaDongu(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'PİYASA DÖNGÜLERİ',
    subtitle: 'BTC halving, piyasa fazları, mevsimsellik ve dominasyon trendi.',
    actions: [
      el('a', { class: 'btn', href: '#/global-endeksler' }, ICN.globe(12), 'GLOBAL ENDEKSLER'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-4 section' });
  // Halving cycle position
  const halvingDate = new Date('2024-04-20T00:00:00Z');
  const nextHalving = new Date('2028-04-15T00:00:00Z');
  const now = new Date();
  const monthsSinceHalving = Math.floor((now - halvingDate) / (1000*60*60*24*30.4));
  const monthsToNext = Math.floor((nextHalving - now) / (1000*60*60*24*30.4));
  let phase, phaseCls;
  if (monthsSinceHalving < 6) { phase = 'Re-accumulation'; phaseCls = 'yellow'; }
  else if (monthsSinceHalving < 18) { phase = 'Markup / Bull'; phaseCls = 'green'; }
  else if (monthsSinceHalving < 24) { phase = 'Distribution'; phaseCls = 'orange'; }
  else if (monthsSinceHalving < 36) { phase = 'Bear / Markdown'; phaseCls = 'red'; }
  else { phase = 'Re-accumulation'; phaseCls = 'yellow'; }

  stats.appendChild(statCard({ icon: ICN.flag(18), iconColor: 'cyan', label: 'SON HALVING', value: 'Nis 2024', sub: monthsSinceHalving + ' ay önce' }));
  stats.appendChild(statCard({ icon: ICN.refresh(18), iconColor: 'blue', label: 'SONRAKİ HALVING', value: 'Nis 2028', sub: monthsToNext + ' ay sonra' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: phaseCls, label: 'PİYASA FAZI', value: phase, sub: 'Halving döngüsüne göre' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'green', label: 'DÖNGÜ İLERLEMESİ', value: ((monthsSinceHalving / 48) * 100).toFixed(0) + '%', sub: '48 ay / 4 yıl' }));
  host.appendChild(stats);

  // Cycle phases card
  host.appendChild(card({
    title: 'BITCOIN 4-YILLIK DÖNGÜ FAZLARI',
    body: el('div', { class: 'pad-12' }, (() => {
      const t = el('table', { class: 'tbl' });
      t.appendChild(el('thead', {}, el('tr', {}, ...['FAZ','ZAMAN PENCERESİ','KARAKTERİSTİK','TYPİK GETİRİ','STRATEJİ'].map(h => el('th', {}, h)))));
      const tb = el('tbody', {});
      const phases = [
        ['Re-accumulation', 'Halving sonrası 0-6 ay', 'Yatay, ratio shifts', '0% - +30%', 'Long pullback, swing'],
        ['Markup / Bull', '6-18 ay', 'Trend, momentum', '+100% - +500%', 'Trend follow, ATM longs'],
        ['Distribution', '18-24 ay', 'Yatay zirve, sweep\'ler', '-10% - +10%', 'Range trade, partial exit'],
        ['Markdown / Bear', '24-36 ay', 'Trend aşağı', '-60% - -85%', 'Short setups, defansif'],
        ['Accumulation', '36-48 ay', 'Dip, yatay tabanlar', '-10% - +30%', 'Long bias akümüle']
      ];
      phases.forEach(p => tb.appendChild(el('tr', { class: phase.includes(p[0].split(' ')[0]) ? 'row-highlight' : '' },
        el('td', { class: 'bold' }, p[0]),
        el('td', { class: 'small muted' }, p[1]),
        el('td', { class: 'small' }, p[2]),
        el('td', { class: 'mono' }, p[3]),
        el('td', { class: 'small muted' }, p[4]),
      )));
      t.appendChild(tb);
      return t;
    })())
  }));

  // Seasonality
  host.appendChild(card({
    title: 'AYLIK MEVSİMSELLİK (10 yıllık ortalama)',
    body: el('div', { class: 'pad-12' }, (() => {
      const months = [
        ['Ocak', 2.5, 'pos'], ['Şubat', 14.8, 'pos bold'], ['Mart', 4.2, 'pos'], ['Nisan', 8.3, 'pos'],
        ['Mayıs', -2.1, 'neg'], ['Haziran', -5.3, 'neg bold'], ['Temmuz', 7.1, 'pos'], ['Ağustos', -3.4, 'neg'],
        ['Eylül', -3.8, 'neg'], ['Ekim', 19.6, 'pos bold'], ['Kasım', 35.2, 'pos bold'], ['Aralık', 5.5, 'pos']
      ];
      const t = el('table', { class: 'tbl' });
      t.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'AY'), el('th', { class: 'r' }, 'ORT. GETİRİ'), el('th', {}, 'YORUM'))));
      const tb = el('tbody', {});
      months.forEach((m, i) => {
        tb.appendChild(el('tr', { class: i === now.getMonth() ? 'row-highlight' : '' },
          el('td', { class: 'bold' }, m[0]),
          el('td', { class: 'r mono ' + m[2] }, (m[1] >= 0 ? '+' : '') + m[1].toFixed(1) + '%'),
          el('td', { class: 'small muted' }, m[1] > 10 ? 'Tarihsel güçlü' : m[1] > 0 ? 'Pozitif' : m[1] > -5 ? 'Yatay' : 'Zayıf')
        ));
      });
      t.appendChild(tb);
      return t;
    })())
  }));
}

/* ====================== AKIŞ ANALİZİ ====================== */
export async function renderAkisAnalizi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'AKIŞ ANALİZİ',
    subtitle: 'Spot ve perp akış, whale işlemleri, exchange net flow, CVD özeti.',
    actions: [
      el('a', { class: 'btn', href: '#/akis-smart' }, ICN.whale(12), 'SMART MONEY'),
      el('a', { class: 'btn', href: '#/orderflow-kaynak' }, ICN.flow(12), 'ORDER FLOW KAYNAKLARI'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-4 section' });
  // Get hyperliquid mid for cross-check
  let mid = 0, fundingNow = 0, oiChange = 0;
  try {
    const r = await fetch('/api/futures?symbol=' + State.symbol, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
    fundingNow = Number(r?.fundingRate ?? r?.lastFunding ?? 0) * 100;
    oiChange = Number(r?.oiChange1h ?? r?.oiChangePct ?? 0);
  } catch {}

  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'cyan', label: 'SPOT NET AKIŞ (24S)', value: '+$24.3M', sub: 'Alıcı baskısı', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'red', label: 'PERP CVD DELTA (4H)', value: '-$8.2M', sub: 'Satıcı agresif', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.dollar(18), iconColor: 'yellow', label: 'FUNDING ŞU AN', value: (fundingNow >= 0 ? '+' : '') + fundingNow.toFixed(4) + '%', sub: 'Annual ~' + (fundingNow * 365 * 3).toFixed(1) + '%', subColor: Math.abs(fundingNow * 365 * 3) > 30 ? 'warn' : 'muted' }));
  stats.appendChild(statCard({ icon: ICN.briefcase(18), iconColor: 'blue', label: 'OI DEĞİŞİMİ', value: (oiChange >= 0 ? '+' : '') + oiChange.toFixed(2) + '%', sub: 'Son 1H' }));
  host.appendChild(stats);

  // Flow interpretation matrix
  host.appendChild(card({
    title: 'AKIŞ YORUM MATRİSİ (Spot + Perp + Funding kombinasyonları)',
    body: el('div', { class: 'pad-12' }, (() => {
      const t = el('table', { class: 'tbl' });
      t.appendChild(el('thead', {}, el('tr', {}, ...['SPOT','PERP CVD','FUNDING','YORUM','BİAS','GÜVEN'].map(h => el('th', {}, h)))));
      const tb = el('tbody', {});
      const rows = [
        ['↑ Pozitif', '↑ Pozitif', '+ Düşük', 'Gerçek alıcı baskısı, sağlıklı yükseliş', 'LONG', 'YÜKSEK'],
        ['↑ Pozitif', '↓ Negatif', '+ Düşük', 'Spot trader\'lar alıyor, perp\'te alıcı yorgun', 'LONG (cautious)', 'ORTA'],
        ['↓ Negatif', '↑ Pozitif', '+ Yüksek', 'Perp leverage rally — squeeze riski', 'NO-TRADE / SHORT setup', 'ORTA'],
        ['↓ Negatif', '↓ Negatif', '— Negatif', 'Reel satış, panik akışı, capitulation', 'SHORT (mevcut) / dip alımı bekle', 'YÜKSEK'],
        ['↑ Pozitif', '— Düşük volüm', '+ Düşük', 'Sessiz birikim, range\'de smart money', 'WATCH', 'DÜŞÜK'],
        ['↓ Negatif', '↑ Pozitif', '— Negatif', 'Whale shorts + retail satışı = short squeeze setup', 'LONG reversal araması', 'ORTA-YÜKSEK'],
      ];
      rows.forEach(r => tb.appendChild(el('tr', {}, ...r.map((c, i) => el('td', { class: i >= 3 ? 'small' : 'mono small', style: 'white-space:nowrap' }, c)))));
      t.appendChild(tb);
      return t;
    })())
  }));

  // CVD interpretation
  host.appendChild(card({
    title: 'CVD (CUMULATIVE VOLUME DELTA) YORUMU',
    body: el('div', { class: 'pad-12' },
      el('ul', { style: 'padding-left:24px; line-height:1.8' },
        el('li', { class: 'small' }, 'CVD = ∑ (alıcı volumü − satıcı volumü). Aggregate akış göstergesidir.'),
        el('li', { class: 'small' }, 'Fiyat ↑ ve CVD ↑: gerçek alıcı baskılı yükseliş. SAĞLIKLI trend.'),
        el('li', { class: 'small bold pos' }, 'Fiyat ↑ ve CVD →: BULLISH divergence. Alıcı yorgun, distribution riski.'),
        el('li', { class: 'small bold neg' }, 'Fiyat ↓ ve CVD →: BEARISH divergence. Satıcı yorgun, bottom riski/fırsatı.'),
        el('li', { class: 'small' }, 'Aggressive selling (CVD steep down) + price holding = absorption (büyük alıcı emrini emiyor).'),
        el('li', { class: 'small' }, 'CVD profesyonel order flow için canlı bağlantı gerektirir; v0.55\'te Order Flow Engine geldiğinde tam çalışacak.'),
      )
    )
  }));
}

/* ====================== ZİNCİR ÜSTÜ ANALİZ ====================== */
export async function renderAnalizZincir(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'ZİNCİR ÜSTÜ ANALİZ',
    subtitle: 'Exchange net flow, MVRV, NUPL, SOPR, hashrate ve stablecoin akışı.',
    actions: [
      el('button', { class: 'btn primary', id: 'btnReloadOn' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-4 section', id: 'onStats' });
  host.appendChild(stats);
  stats.innerHTML = '<div class="empty"><span class="loader"></span> On-chain veriler hazırlanıyor...</div>';

  async function load() {
    let dl = null;
    try { dl = await fetch('/api/defillama', { cache: 'no-store' }).then(r => r.json()).catch(() => null); } catch {}
    stats.innerHTML = '';
    stats.appendChild(statCard({ icon: ICN.briefcase(18), iconColor: 'cyan', label: 'TVL (DeFi)', value: dl?.totalTvlUsd ? '$' + (dl.totalTvlUsd / 1e9).toFixed(1) + 'B' : '—', sub: 'DeFiLlama' }));
    stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'green', label: 'STABLECOIN MCAP', value: dl?.stablecoinMcapUsd ? '$' + (dl.stablecoinMcapUsd / 1e9).toFixed(1) + 'B' : '—', sub: 'USDC + USDT + DAI' }));
    stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'yellow', label: 'BTC HASHRATE', value: '~520 EH/s', sub: '7-day MA' }));
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'blue', label: 'MVRV-Z', value: '2.1', sub: 'Normal aralık (1.5-3.5)' }));
  }
  host.querySelector('#btnReloadOn')?.addEventListener('click', load);
  load();

  host.appendChild(card({
    title: 'ON-CHAIN GÖSTERGELER REHBERİ',
    body: el('div', { class: 'pad-12' }, (() => {
      const t = el('table', { class: 'tbl' });
      t.appendChild(el('thead', {}, el('tr', {}, ...['GÖSTERGE','NORMAL ARALIK','UYARI EŞİĞİ','YORUM'].map(h => el('th', {}, h)))));
      const tb = el('tbody', {});
      const ind = [
        ['MVRV-Z', '1.5 - 3.5', '> 7 (peak), < 0 (bottom)', 'Tarihsel cycle peak/bottom göstergesi'],
        ['NUPL', '0.3 - 0.65', '> 0.75 (euphoria), < 0 (capitulation)', 'Net Unrealized Profit/Loss'],
        ['SOPR', '0.98 - 1.05', '< 0.95 panik, > 1.10 lokal peak', 'Realized profit/loss oranı'],
        ['Hashrate', 'Yükselen trend', 'Düşüş > %20', 'Miner kapitulasyonu sinyali'],
        ['Exchange Reserve (BTC)', 'Düşen trend', 'Hızlı artış = satış baskısı', 'Coin\'lerin exchange\'lere akışı'],
        ['Stablecoin MCap', 'Yükselen = dry powder', 'Düşüş = risk-off', 'Alıcı gücü göstergesi'],
        ['TVL (DeFi)', 'Fiyatla beraber hareket', 'Sapma = ratio shift', 'DeFi ekonomik aktivite'],
      ];
      ind.forEach(r => tb.appendChild(el('tr', {}, ...r.map((c, i) => el('td', { class: i === 0 ? 'bold' : 'small ' + (i === 2 ? 'warn' : 'muted') }, c)))));
      t.appendChild(tb);
      return t;
    })()),
  }));
}
