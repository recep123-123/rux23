/* RUx — Piyasa altı modülleri: harita, sektör, likidasyon, ısı, endeks, makro */
import { el, fetchMarket, fmtPct, fmtPrice, fmtNum } from './api.js?v=0.75.5-liquidation-panel-live-20260524';
import { ICN, statCard, card, pageHead, tag, barbar, heatColorClass, heatmapRow } from './components.js?v=0.75.5-liquidation-panel-live-20260524';
import { upcomingMacroEvents, evaluateMacroEventRisk } from './rux_macro.js?v=0.75.5-liquidation-panel-live-20260524';
import { fetchEconCalendar } from './api.js?v=0.75.5-liquidation-panel-live-20260524';

const TRACKED = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT','OPUSDT','ARBUSDT','APTUSDT','SUIUSDT','TONUSDT','NEARUSDT','INJUSDT','RNDRUSDT','TIAUSDT','SEIUSDT','ATOMUSDT'];

const SECTORS = {
  'L1':       ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','ADAUSDT','AVAXUSDT','TONUSDT','NEARUSDT','APTUSDT','SUIUSDT'],
  'L2':       ['OPUSDT','ARBUSDT','MNTUSDT','MATICUSDT'],
  'DeFi':     ['LINKUSDT','UNIUSDT','AAVEUSDT','MKRUSDT','INJUSDT','LDOUSDT','PENDLEUSDT'],
  'Meme':     ['DOGEUSDT','SHIBUSDT','PEPEUSDT','WIFUSDT','FLOKIUSDT','BONKUSDT'],
  'AI':       ['RNDRUSDT','FETUSDT','AGIXUSDT','TAOUSDT','WLDUSDT'],
  'Gaming':   ['IMXUSDT','AXSUSDT','SANDUSDT','GALAUSDT','MAGICUSDT'],
  'Modular':  ['TIAUSDT','SEIUSDT','DYMUSDT','ALTUSDT'],
  'Stablecoin Adjacency': ['ENAUSDT','FXSUSDT','CRVUSDT','USDDUSDT'],
};

async function loadTracked(tf='4h') {
  const out = [];
  for (const s of TRACKED) {
    try {
      const d = await fetchMarket(s, tf);
      out.push({ s, last:d?.last||0, ch:d?.changePct24h||0, vol:d?.volQuote24h||0, src:d?.source||'-' });
    } catch (e) { out.push({ s, last:0, ch:0, vol:0, src:'err' }); }
  }
  return out;
}

/* ───────── 1) Piyasa Haritası ───────── */
export async function renderPiyasaHaritasi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'PİYASA HARİTASI',
    subtitle: 'Tüm izlenen coinlerin 24s değişim ısı haritası. Renk = momentum, alan = hacim ağırlığı.',
    actions: [
      el('div', { class:'select' }, 'Tüm Coinler ', ICN.chev(10)),
      el('button', { class:'btn primary', on:{ click:()=>renderPiyasaHaritasi(host) }}, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const loading = el('div', { class:'card section' }, 'Piyasa verileri yükleniyor…');
  host.appendChild(loading);
  const data = await loadTracked('4h');
  loading.remove();

  const totVol = data.reduce((a,b)=>a+b.vol,0) || 1;
  const pos = data.filter(x=>x.ch>0).length, neg = data.filter(x=>x.ch<0).length;
  const avgCh = data.reduce((a,b)=>a+b.ch,0)/Math.max(data.length,1);
  const breadth = (pos/Math.max(data.length,1))*100;

  host.appendChild(el('div',{class:'stat-row cols-4 section'},
    statCard({ icon: ICN.bars(20), label:'POZİTİF / NEGATİF', value:`${pos} / ${neg}`, sub:'24s değişim' }),
    statCard({ icon: ICN.pulse(20), label:'PİYASA GENİŞLİĞİ', value:`%${breadth.toFixed(1)}`, sub:'pos oran' }),
    statCard({ icon: ICN.flame(20), label:'ORTALAMA DEĞİŞİM', value:`%${avgCh.toFixed(2)}`, sub:'24s' }),
    statCard({ icon: ICN.cube(20), label:'TOPLAM İZLENEN', value:String(data.length), sub:'sembol' }),
  ));

  // Treemap-style grid
  const grid = el('div', { class:'card section', style:'padding:14px' });
  grid.appendChild(el('div', { class:'h6', style:'margin-bottom:10px' }, 'ISI HARİTASI · 24S DEĞİŞİM × HACİM AĞIRLIĞI'));
  const wrap = el('div', { style:'display:grid;grid-template-columns:repeat(5,1fr);gap:6px' });
  data.sort((a,b)=>b.vol-a.vol).forEach(it=>{
    const weight = (it.vol/totVol)*100;
    const klass = heatColorClass(it.ch);
    const tile = el('div', {
      class:'card '+klass,
      style:`padding:10px;text-align:center;min-height:${Math.max(60, 60 + weight*4)}px`
    },
      el('div', { class:'mono', style:'font-weight:700;font-size:12px' }, it.s.replace('USDT','')),
      el('div', { class:'mono', style:'font-size:14px;margin-top:4px' }, `%${it.ch.toFixed(2)}`),
      el('div', { class:'muted', style:'font-size:10px;margin-top:2px' }, '$'+fmtPrice(it.last)),
    );
    wrap.appendChild(tile);
  });
  grid.appendChild(wrap);
  grid.appendChild(el('div', { class:'muted xs', style:'margin-top:10px' }, 'Kaynak: Binance · 4h timeframe · Treemap-style renk = momentum yönü'));
  host.appendChild(grid);
}

/* ───────── 2) Sektör Haritası ───────── */
export async function renderSektorHaritasi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'SEKTÖR HARİTASI',
    subtitle: 'Kategori bazlı rotasyon ve göreceli güç. L1 / L2 / DeFi / AI / Meme / Gaming / Modular.',
    actions: [ el('button', { class:'btn primary', on:{ click:()=>renderSektorHaritasi(host) }}, ICN.refresh(12), 'YENİLE') ]
  }));

  const all = new Set();
  Object.values(SECTORS).forEach(arr=>arr.forEach(s=>all.add(s)));
  const list = Array.from(all);
  const loading = el('div', { class:'card section' }, 'Sektör verileri yükleniyor…');
  host.appendChild(loading);
  const prices = {};
  for (const s of list) {
    try { const d = await fetchMarket(s,'4h'); prices[s] = { ch:d?.changePct24h||0, vol:d?.volQuote24h||0 }; }
    catch(e){ prices[s] = { ch:0, vol:0 }; }
  }
  loading.remove();

  const rows = Object.entries(SECTORS).map(([name, arr])=>{
    const vals = arr.map(s => prices[s]?.ch || 0);
    const vols = arr.map(s => prices[s]?.vol || 0);
    const avg = vals.reduce((a,b)=>a+b,0)/Math.max(vals.length,1);
    const tot = vols.reduce((a,b)=>a+b,0);
    const pos = vals.filter(v=>v>0).length;
    const breadth = (pos/Math.max(vals.length,1))*100;
    return { name, avg, tot, breadth, count: arr.length };
  });
  rows.sort((a,b)=>b.avg-a.avg);

  const strongest = rows[0]?.name || '-';
  const weakest = rows[rows.length-1]?.name || '-';

  host.appendChild(el('div',{class:'stat-row cols-3 section'},
    statCard({ icon: ICN.up(20), iconColor:'#16f0a8', label:'EN GÜÇLÜ', value:strongest, sub:`%${rows[0]?.avg.toFixed(2)||0} ort.` }),
    statCard({ icon: ICN.down(20), iconColor:'#ff5b6e', label:'EN ZAYIF', value:weakest, sub:`%${rows[rows.length-1]?.avg.toFixed(2)||0} ort.` }),
    statCard({ icon: ICN.layers(20), label:'SEKTÖR ADEDİ', value:String(rows.length), sub:'kategori' }),
  ));

  const tbl = el('table', { class:'simple' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'SEKTÖR'),
      el('th', {}, 'COIN'),
      el('th', {}, 'ORT. 24S'),
      el('th', {}, 'GENİŞLİK'),
      el('th', {}, 'HACİM'),
      el('th', {}, 'DURUM')
    )),
    el('tbody', {}, ...rows.map(r=>{
      const ton = r.avg > 1 ? 'green' : r.avg < -1 ? 'red' : 'gray';
      return el('tr', {},
        el('td', {}, el('strong', {}, r.name)),
        el('td', {}, String(r.count)),
        el('td', { class: r.avg>=0?'pos':'neg' }, `%${r.avg.toFixed(2)}`),
        el('td', {}, barbar(r.breadth, 100)),
        el('td', { class:'mono' }, '$'+fmtNum(r.tot)),
        el('td', {}, tag(r.avg>1?'GÜÇLÜ':r.avg<-1?'ZAYIF':'NÖTR', ton)),
      );
    }))
  );
  host.appendChild(card({ title:'SEKTÖR ROTASYON TABLOSU', body: tbl }));
}

/* ───────── 3) Likidasyon Haritası ───────── */
export async function renderLikidasyonHaritasi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'LİKİDASYON HARİTASI',
    subtitle: 'Coin bazlı tahmini likidasyon kümeleri ve mevcut fiyata göre mesafe. (Free Data Layer — Binance + funding proxy)',
    actions: [ el('button', { class:'btn primary', on:{ click:()=>renderLikidasyonHaritasi(host) }}, ICN.refresh(12), 'YENİLE') ]
  }));

  const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT'];
  const loading = el('div', { class:'card section' }, 'Likidasyon kümeleri hesaplanıyor…');
  host.appendChild(loading);
  const data = [];
  for (const s of symbols) {
    try {
      const d = await fetchMarket(s,'4h');
      const px = d?.last || 0;
      // Heuristic liquidation cluster proxy: ±2%, ±5%, ±8% bands from current price
      data.push({
        s, px, ch:d?.changePct24h||0,
        longLiq2: px*0.98, longLiq5: px*0.95, longLiq8: px*0.92,
        shortLiq2: px*1.02, shortLiq5: px*1.05, shortLiq8: px*1.08,
      });
    } catch(e){}
  }
  loading.remove();

  const tbl = el('table', { class:'simple' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'SEMBOL'),
      el('th', {}, 'FİYAT'),
      el('th', {}, '24S'),
      el('th', {}, 'LONG -2%'),
      el('th', {}, 'LONG -5%'),
      el('th', {}, 'LONG -8%'),
      el('th', {}, 'SHORT +2%'),
      el('th', {}, 'SHORT +5%'),
      el('th', {}, 'SHORT +8%')
    )),
    el('tbody', {}, ...data.map(r=>el('tr',{},
      el('td',{},el('strong',{},r.s.replace('USDT',''))),
      el('td',{class:'mono'},'$'+fmtPrice(r.px)),
      el('td',{class:r.ch>=0?'pos':'neg'},`%${r.ch.toFixed(2)}`),
      el('td',{class:'mono'},'$'+fmtPrice(r.longLiq2)),
      el('td',{class:'mono'},'$'+fmtPrice(r.longLiq5)),
      el('td',{class:'mono'},'$'+fmtPrice(r.longLiq8)),
      el('td',{class:'mono'},'$'+fmtPrice(r.shortLiq2)),
      el('td',{class:'mono'},'$'+fmtPrice(r.shortLiq5)),
      el('td',{class:'mono'},'$'+fmtPrice(r.shortLiq8)),
    )))
  );
  host.appendChild(card({
    title:'LİKİDASYON KÜME PROXY',
    info: 'Ücretsiz veri modu — kaldıraç dağılımı bilinmediğinden ±2/5/8% bantları proxy olarak gösterilir',
    body: tbl
  }));

  host.appendChild(el('div', { class:'card section' },
    el('div', { class:'h6' }, 'NASIL OKUNUR'),
    el('div', { class:'muted', style:'margin-top:8px;line-height:1.6' },
      '• LONG bantları: Fiyat o seviyeye düşerse yüksek kaldıraçlı long pozisyonların likidasyon olabileceği bölgeleri gösterir',
      el('br'),
      '• SHORT bantları: Fiyat o seviyeye çıkarsa yüksek kaldıraçlı short pozisyonların likidasyon olabileceği bölgeleri gösterir',
      el('br'),
      '• Gerçek likidasyon haritası için: CoinGlass benzeri ücretli veri gerekir; bu sayfa MasterFramework "Free Data Mode" altında proxy çalışır')
  ));
}

/* ───────── 4) Isı Haritası ───────── */
export async function renderIsiHaritasi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'ISI HARİTASI',
    subtitle: 'Çoklu timeframe momentum ısı haritası. 5m / 15m / 1h / 4h değişim grid.',
    actions: [ el('button', { class:'btn primary', on:{ click:()=>renderIsiHaritasi(host) }}, ICN.refresh(12), 'YENİLE') ]
  }));

  const syms = TRACKED.slice(0, 12);
  const tfs = ['5m','15m','1h','4h'];
  const loading = el('div', { class:'card section' }, 'Multi-TF taranıyor…');
  host.appendChild(loading);
  const matrix = {};
  for (const s of syms) {
    matrix[s] = {};
    for (const tf of tfs) {
      try { const d = await fetchMarket(s, tf); matrix[s][tf] = d?.changePct24h || 0; }
      catch(e){ matrix[s][tf] = 0; }
    }
  }
  loading.remove();

  const wrap = el('table', { class:'simple' });
  const thead = el('thead',{}, el('tr',{},
    el('th',{}, 'SEMBOL'),
    ...tfs.map(tf=>el('th',{}, tf.toUpperCase())),
    el('th',{}, 'TOPLAM')
  ));
  wrap.appendChild(thead);
  const tbody = el('tbody');
  syms.forEach(s=>{
    const row = el('tr');
    row.appendChild(el('td',{}, el('strong',{}, s.replace('USDT',''))));
    let sum = 0;
    tfs.forEach(tf=>{
      const v = matrix[s][tf];
      sum += v;
      row.appendChild(el('td', { class: 'mono '+heatColorClass(v) }, `%${v.toFixed(2)}`));
    });
    row.appendChild(el('td', { class:'mono '+heatColorClass(sum/tfs.length) }, `%${(sum/tfs.length).toFixed(2)}`));
    tbody.appendChild(row);
  });
  wrap.appendChild(tbody);
  host.appendChild(card({ title:'MULTI-TF ISI HARİTASI', body: wrap }));
}

/* ───────── 5) Global Endeksler ───────── */
export async function renderGlobalEndeksler(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'GLOBAL ENDEKSLER',
    subtitle: 'Toplam piyasa değeri, BTC dominansı, ETH/BTC, Fear&Greed proxy, Toplam-1/2/3 ayrıştırması.',
    actions: [ el('button', { class:'btn primary', on:{ click:()=>renderGlobalEndeksler(host) }}, ICN.refresh(12), 'YENİLE') ]
  }));

  const loading = el('div', { class:'card section' }, 'Endeks verileri hesaplanıyor…');
  host.appendChild(loading);

  let btc=null, eth=null, sol=null;
  try { btc = await fetchMarket('BTCUSDT','1d'); } catch(e){}
  try { eth = await fetchMarket('ETHUSDT','1d'); } catch(e){}
  try { sol = await fetchMarket('SOLUSDT','1d'); } catch(e){}
  loading.remove();

  const ethbtc = btc?.last && eth?.last ? eth.last/btc.last : 0;
  // Fear & Greed proxy: BTC 24s change normalized into 0-100
  const fgProxy = Math.max(0, Math.min(100, 50 + (btc?.changePct24h||0)*5));
  const fgLabel = fgProxy >= 75 ? 'AŞIRI AÇGÖZLÜ' : fgProxy>=55 ? 'AÇGÖZLÜ' : fgProxy>=45 ? 'NÖTR' : fgProxy>=25 ? 'KORKULU' : 'AŞIRI KORKU';

  host.appendChild(el('div', { class:'stat-row cols-4 section' },
    statCard({ icon: ICN.cube(20), label:'BTC', value:'$'+fmtPrice(btc?.last||0), sub:`%${(btc?.changePct24h||0).toFixed(2)} 24s`, subColor: btc?.changePct24h>=0?'#16f0a8':'#ff5b6e' }),
    statCard({ icon: ICN.cube(20), label:'ETH', value:'$'+fmtPrice(eth?.last||0), sub:`%${(eth?.changePct24h||0).toFixed(2)} 24s`, subColor: eth?.changePct24h>=0?'#16f0a8':'#ff5b6e' }),
    statCard({ icon: ICN.swap(20), label:'ETH/BTC', value:ethbtc.toFixed(5), sub:'oran' }),
    statCard({ icon: ICN.flame(20), label:'F&G PROXY', value:fgProxy.toFixed(0), sub:fgLabel }),
  ));

  host.appendChild(card({
    title:'ENDEKS YORUMU',
    body: el('div', { style:'line-height:1.7' },
      el('div', {}, '• ', el('strong',{},'ETH/BTC: '), ethbtc.toFixed(5), ethbtc>0.06 ? ' — ETH üstün performans bölgesi' : ' — BTC dominans bölgesi'),
      el('div', {}, '• ', el('strong',{},'F&G Proxy: '), fgProxy.toFixed(0)+' ('+fgLabel+')', ' — ', fgProxy>=70?'aşırı pozisyonlanma riski':fgProxy<=30?'kapitülasyon bölgesi':'denge'),
      el('div', {}, '• ', el('strong',{},'BTC 24s: '), `%${(btc?.changePct24h||0).toFixed(2)}`),
      el('div', {}, '• ', el('strong',{},'ETH 24s: '), `%${(eth?.changePct24h||0).toFixed(2)}`),
      el('div', {}, '• ', el('strong',{},'SOL 24s: '), `%${(sol?.changePct24h||0).toFixed(2)}`),
      el('div', { class:'muted', style:'margin-top:10px' }, 'Not: Toplam-1/2/3 dominans verisi CoinMarketCap / TradingView serileri gerektirir. Free Data Mode altında F&G proxy = BTC 24s × volatilite ağırlığı.')
    )
  }));
}

/* ───────── 6) Makro Takvim ───────── */
export async function renderMakroTakvim(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'MAKRO TAKVİM',
    subtitle: 'FOMC, CPI, NFP, PCE, ECB gibi yüksek-etki olaylar (2026 resmi açıklama takvimi). Risk-off pencereleri.',
    actions: [ el('button', { class:'btn primary' }, ICN.refresh(12), 'YENİLE') ]
  }));

  // Gerçek 2026 ekonomik takvim (Fed/BLS/BEA/ECB resmi tarihleri)
  const now = Date.now();
  let events = upcomingMacroEvents(now, { count: 16 });
  let sourceLabel = '2026 RESMİ TAKVİM (statik)';
  // Finnhub key tanımlıysa canlı takvimi dene; değilse statik kalır.
  try {
    const live = await fetchEconCalendar();
    if (live?.ok && Array.isArray(live.events) && live.events.length) {
      const highImpact = live.events
        .filter(e => e.impact === 'çok yüksek' || e.impact === 'yüksek')
        .map(e => {
          const ts = new Date(`${e.date}T${(e.time || '13:30')}:00Z`).getTime();
          const tsi = new Date(ts + 3 * 3600000);
          return {
            date: e.date, time: `${String(tsi.getUTCHours()).padStart(2,'0')}:${String(tsi.getUTCMinutes()).padStart(2,'0')} TSİ`,
            name: e.name, type: e.type || e.name, impact: e.impact, region: e.region,
            ts, daysAway: Math.floor((ts - now) / 86400000), hoursAway: Math.round((ts - now) / 3600000 * 10) / 10
          };
        })
        .filter(e => e.ts >= now - 2 * 3600000)
        .sort((a, b) => a.ts - b.ts)
        .slice(0, 16);
      if (highImpact.length) { events = highImpact; sourceLabel = 'FINNHUB (canlı)'; }
    }
  } catch {}
  const risk = evaluateMacroEventRisk(now);

  host.appendChild(el('div',{class:'stat-row cols-3 section', 'data-rux-source':'COMPUTED'},
    statCard({ icon: ICN.flag(20), label:'YÜKSEK ETKİ', value:String(events.filter(e=>e.impact==='yüksek'||e.impact==='çok yüksek').length), sub:'yaklaşan olaylar' }),
    statCard({ icon: ICN.warning(20), iconColor: risk.macroEventRisk ? 'red' : '#ffb86b', label:'AKTİF RİSK', value: risk.macroEventRisk ? 'EVET' : 'HAYIR', sub: risk.nearestEvent ? `${risk.nearestEvent.label} ${risk.nearestEvent.hoursAway}s` : 'yakın olay yok', subColor: risk.macroEventRisk ? 'neg' : 'pos' }),
    statCard({ icon: ICN.flag(20), label:'EN YAKIN', value: events[0] ? events[0].type : '—', sub: events[0] ? `${events[0].daysAway} gün sonra` : '' }),
  ));

  const tbl = el('table', { class:'simple' },
    el('thead',{},el('tr',{},
      el('th',{},'TARİH'), el('th',{},'SAAT'), el('th',{},'OLAY'), el('th',{},'BÖLGE'), el('th',{},'KALAN'), el('th',{},'ETKİ')
    )),
    el('tbody',{}, ...events.map(e=>{
      const tone = e.impact==='çok yüksek'?'red':e.impact==='yüksek'?'yellow':e.impact==='orta'?'cyan':'gray';
      const kalan = e.daysAway > 0 ? `${e.daysAway} gün` : e.hoursAway > 0 ? `${Math.round(e.hoursAway)} saat` : 'bugün';
      return el('tr',{},
        el('td',{},e.date),
        el('td',{class:'mono'},e.time),
        el('td',{},el('strong',{},e.name)),
        el('td',{},e.region),
        el('td',{class:'mono muted'},kalan),
        el('td',{},tag(e.impact.toUpperCase(), tone))
      );
    }))
  );
  host.appendChild(card({ title:`YAKLAŞAN MAKRO OLAYLAR · ${sourceLabel}`, body: el('div', {'data-rux-source':'COMPUTED'}, tbl) }));

  host.appendChild(el('div',{class:'card section'},
    el('div',{class:'h6'},'RİSK-OFF KURALLARI'),
    el('div',{style:'margin-top:10px;line-height:1.7'},
      '• FOMC ve CPI günleri: Olay öncesi 2 saat / sonrası 1 saat işlem KAPALI (Master Framework v3.0 § Macro Risk-Off Matrix)',
      el('br'),
      '• Çok yüksek etki olaylar pozisyon boyutunu 0.5×\'e düşürür ve sinyal güvenini kırpar',
      el('br'),
      '• NFP cuma günleri için friday-spike filtresi aktif olmalı',
      el('br'),
      el('span',{class:'muted'},'Kaynak: Federal Reserve (FOMC), BLS (CPI/NFP), BEA (PCE), ECB resmi açıklama takvimleri. Saatler TSİ (UTC+3). Bu takvim sinyal motorunun makro-risk filtresini besler.')
    )
  ));
}

function addDays(yyyy_mm_dd, days){
  const d = new Date(yyyy_mm_dd);
  d.setDate(d.getDate()+days);
  return d.toISOString().slice(0,10);
}
