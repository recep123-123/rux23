/* RUx — Coin altı modülleri: performans, ilişkiler, likidasyon, ısı, rapor */
import { el, fetchMarket, fmtPct, fmtPrice, fmtNum, atr, ema, rsi } from './api.js?v=0.75.9-heatmap-premium-rework-20260524';
import { ICN, statCard, card, pageHead, tag, barbar, heatColorClass, coinPill, sparkline } from './components.js?v=0.75.9-heatmap-premium-rework-20260524';

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT','OPUSDT','ARBUSDT','APTUSDT','SUIUSDT','TONUSDT','NEARUSDT','INJUSDT'];

async function loadAll(tf='4h'){
  const out=[];
  for (const s of SYMBOLS) {
    try { const d = await fetchMarket(s,tf); out.push({ s, ...d }); }
    catch(e){ out.push({ s, last:0, changePct24h:0, volQuote24h:0 }); }
  }
  return out;
}

/* ───────── 1) Coin Performans ───────── */
export async function renderCoinPerf(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'COİN PERFORMANS',
    subtitle: 'Çoklu zaman dilimi performans karşılaştırması · 24s / 7g / 30g',
    actions: [ el('button',{class:'btn primary', on:{click:()=>renderCoinPerf(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Performans verileri yükleniyor…');
  host.appendChild(loading);
  // We only have 24s from fetchMarket but we can compute 7g/30g from candle history if available
  const items=[];
  for (const s of SYMBOLS) {
    try {
      const d = await fetchMarket(s,'1d');
      const cl = (d?.candles||[]).map(c=>+c.close).filter(Number.isFinite);
      const lastPx = cl[cl.length-1] || d?.last || 0;
      const ch24 = d?.changePct24h || 0;
      const ch7 = cl.length>7 ? ((lastPx - cl[cl.length-8])/cl[cl.length-8])*100 : 0;
      const ch30 = cl.length>30 ? ((lastPx - cl[cl.length-31])/cl[cl.length-31])*100 : 0;
      const spark = cl.slice(-30);
      items.push({ s, lastPx, ch24, ch7, ch30, spark, vol: d?.volQuote24h||0 });
    } catch(e){ items.push({ s, lastPx:0, ch24:0, ch7:0, ch30:0, spark:[], vol:0 }); }
  }
  loading.remove();

  items.sort((a,b)=>b.ch7-a.ch7);
  const best7 = items[0], worst7 = items[items.length-1];

  host.appendChild(el('div',{class:'stat-row cols-3 section'},
    statCard({ icon: ICN.up(20), iconColor:'#16f0a8', label:'7G EN İYİ', value: best7.s.replace('USDT',''), sub:`%${best7.ch7.toFixed(2)}` }),
    statCard({ icon: ICN.down(20), iconColor:'#ff5b6e', label:'7G EN KÖTÜ', value: worst7.s.replace('USDT',''), sub:`%${worst7.ch7.toFixed(2)}` }),
    statCard({ icon: ICN.bars(20), label:'İZLENEN', value: String(items.length), sub:'sembol' }),
  ));

  const tbl = el('table',{class:'simple'},
    el('thead',{},el('tr',{},
      el('th',{},'SEMBOL'), el('th',{},'FİYAT'), el('th',{},'24S'), el('th',{},'7G'), el('th',{},'30G'), el('th',{},'TREND'), el('th',{},'HACİM')
    )),
    el('tbody',{}, ...items.map(r=>el('tr',{},
      el('td',{}, el('strong',{}, r.s.replace('USDT',''))),
      el('td',{class:'mono'},'$'+fmtPrice(r.lastPx)),
      el('td',{class: r.ch24>=0?'pos':'neg'},`%${r.ch24.toFixed(2)}`),
      el('td',{class: r.ch7>=0?'pos':'neg'},`%${r.ch7.toFixed(2)}`),
      el('td',{class: r.ch30>=0?'pos':'neg'},`%${r.ch30.toFixed(2)}`),
      el('td',{}, sparkline(r.spark, 80, 22, r.ch7>=0?'#16f0a8':'#ff5b6e')),
      el('td',{class:'mono'},'$'+fmtNum(r.vol)),
    )))
  );
  host.appendChild(card({ title:'PERFORMANS TABLOSU · 1D', body:tbl }));
}

/* ───────── 2) Coin İlişkileri (Correlation) ───────── */
export async function renderCoinIliski(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'COİN İLİŞKİLERİ',
    subtitle: 'BTC ve ETH ile 24s log-return Pearson korelasyonu · 4h timeframe',
    actions: [ el('button',{class:'btn primary', on:{click:()=>renderCoinIliski(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Korelasyon hesaplanıyor…');
  host.appendChild(loading);

  const series = {};
  for (const s of SYMBOLS) {
    try { const d = await fetchMarket(s,'4h'); series[s] = (d?.candles||[]).map(c=>+c.close).filter(Number.isFinite).slice(-50); }
    catch(e){ series[s]=[]; }
  }
  loading.remove();

  function logRets(arr){ const r=[]; for (let i=1;i<arr.length;i++) r.push(Math.log(arr[i]/arr[i-1])); return r; }
  function pearson(a,b){
    const n=Math.min(a.length,b.length); if(n<5) return 0;
    const A=a.slice(-n), B=b.slice(-n);
    const ma=A.reduce((x,y)=>x+y,0)/n, mb=B.reduce((x,y)=>x+y,0)/n;
    let num=0, da=0, db=0;
    for (let i=0;i<n;i++){ num += (A[i]-ma)*(B[i]-mb); da += (A[i]-ma)**2; db += (B[i]-mb)**2; }
    if (da<=0||db<=0) return 0;
    return num/Math.sqrt(da*db);
  }

  const btcR = logRets(series['BTCUSDT']||[]);
  const ethR = logRets(series['ETHUSDT']||[]);
  const rows = SYMBOLS.filter(s=>s!=='BTCUSDT').map(s=>{
    const r = logRets(series[s]||[]);
    return { s, btc: pearson(r, btcR), eth: pearson(r, ethR) };
  });
  rows.sort((a,b)=>b.btc-a.btc);

  const tbl = el('table',{class:'simple'},
    el('thead',{},el('tr',{},
      el('th',{},'SEMBOL'), el('th',{},'BTC İLE'), el('th',{},'ETH İLE'), el('th',{},'TİP')
    )),
    el('tbody',{}, ...rows.map(r=>{
      const tipi = r.btc>0.7 ? 'BTC GÖLGESİ' : r.btc<0.3 ? 'BAĞIMSIZ' : 'KISMEN BAĞIMLI';
      const tone = r.btc>0.7 ? 'gray' : r.btc<0.3 ? 'green' : 'cyan';
      return el('tr',{},
        el('td',{}, el('strong',{}, r.s.replace('USDT',''))),
        el('td',{class:'mono '+(r.btc>=0?'pos':'neg')}, r.btc.toFixed(3)),
        el('td',{class:'mono '+(r.eth>=0?'pos':'neg')}, r.eth.toFixed(3)),
        el('td',{}, tag(tipi, tone))
      );
    }))
  );
  host.appendChild(card({ title:'BTC / ETH KORELASYON', body:tbl }));

  host.appendChild(el('div',{class:'card section'},
    el('div',{class:'h6'},'YORUM'),
    el('div',{style:'margin-top:8px;line-height:1.6'},
      '• ', el('strong',{},'> 0.7: '), 'Coin BTC ile aynı yönde hareket eder; bağımsız trade ileri sürmek zor',
      el('br'),
      '• ', el('strong',{},'0.3 - 0.7: '), 'Kısmi bağımsızlık; idiosynkratik setup\'lar yakalanabilir',
      el('br'),
      '• ', el('strong',{},'< 0.3: '), 'Bağımsız hareket eder; portföy çeşitlendirme için uygun')
  ));
}

/* ───────── 3) Coin Likidasyon ───────── */
export async function renderCoinLikid(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'COİN LİKİDASYON HARİTASI',
    subtitle: 'Coin bazlı funding-stres ve likidite proxy göstergeleri',
    actions: [ el('button',{class:'btn primary', on:{click:()=>renderCoinLikid(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Likidasyon proxy hesaplanıyor…');
  host.appendChild(loading);
  const items = [];
  for (const s of SYMBOLS) {
    try {
      const d = await fetchMarket(s,'1h');
      const px = d?.last||0;
      const ch = d?.changePct24h||0;
      const vol = d?.volQuote24h||0;
      const candles = d?.candles || [];
      const atrArr = atr(candles, 14);
      const a14 = Number(atrArr.at(-1)) || 0;
      const stress = a14 && px ? (a14/px)*100 : 0;
      items.push({ s, px, ch, vol, stress, longBand: px*(1-stress/100*2), shortBand: px*(1+stress/100*2) });
    } catch(e){}
  }
  loading.remove();

  items.sort((a,b)=>b.stress-a.stress);

  const tbl = el('table',{class:'simple'},
    el('thead',{},el('tr',{},
      el('th',{},'SEMBOL'),
      el('th',{},'FİYAT'),
      el('th',{},'24S'),
      el('th',{},'ATR%'),
      el('th',{},'STRES'),
      el('th',{},'LONG BAND'),
      el('th',{},'SHORT BAND'),
    )),
    el('tbody',{}, ...items.map(r=>{
      const stress = r.stress;
      const tone = stress>3?'red':stress>1.5?'yellow':'green';
      return el('tr',{},
        el('td',{},el('strong',{},r.s.replace('USDT',''))),
        el('td',{class:'mono'},'$'+fmtPrice(r.px)),
        el('td',{class:r.ch>=0?'pos':'neg'},`%${r.ch.toFixed(2)}`),
        el('td',{class:'mono'},`%${r.stress.toFixed(2)}`),
        el('td',{},tag(stress>3?'YÜKSEK':stress>1.5?'ORTA':'DÜŞÜK',tone)),
        el('td',{class:'mono'},'$'+fmtPrice(r.longBand)),
        el('td',{class:'mono'},'$'+fmtPrice(r.shortBand)),
      );
    }))
  );
  host.appendChild(card({ title:'COİN LİKİDASYON STRES TABLOSU', body:tbl }));
}

/* ───────── 4) Coin Heatmap ───────── */
export async function renderCoinHeat(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'COİN HEATMAP',
    subtitle: 'Sembol × Timeframe momentum ısı matrisi',
    actions: [ el('button',{class:'btn primary', on:{click:()=>renderCoinHeat(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const tfs=['5m','15m','1h','4h','1d'];
  const loading = el('div',{class:'card section'},'Heatmap verisi yükleniyor…');
  host.appendChild(loading);
  const matrix = {};
  for (const s of SYMBOLS.slice(0,14)) {
    matrix[s]={};
    for (const tf of tfs) {
      try { const d = await fetchMarket(s, tf); matrix[s][tf] = d?.changePct24h||0; }
      catch(e){ matrix[s][tf]=0; }
    }
  }
  loading.remove();

  const tbl = el('table',{class:'simple'});
  tbl.appendChild(el('thead',{},el('tr',{},
    el('th',{},'SEMBOL'),
    ...tfs.map(tf=>el('th',{},tf.toUpperCase())),
    el('th',{},'ORT')
  )));
  const tbody = el('tbody');
  Object.entries(matrix).forEach(([s,row])=>{
    const tr = el('tr');
    tr.appendChild(el('td',{},el('strong',{},s.replace('USDT',''))));
    let sum=0;
    tfs.forEach(tf=>{
      const v = row[tf];
      sum += v;
      tr.appendChild(el('td',{class:'mono '+heatColorClass(v)},`%${v.toFixed(2)}`));
    });
    tr.appendChild(el('td',{class:'mono '+heatColorClass(sum/tfs.length)},`%${(sum/tfs.length).toFixed(2)}`));
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  host.appendChild(card({ title:'SEMBOL × TIMEFRAME ISI MATRISI', body:tbl }));
}

/* ───────── 5) Coin Raporlar ───────── */
export async function renderCoinRapor(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'COİN RAPORLARI',
    subtitle: 'Sembol bazlı otomatik teknik özet · RSI / EMA / ATR / Hacim · Master Framework çıktı formatı',
    actions: [ el('button',{class:'btn primary', on:{click:()=>renderCoinRapor(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Raporlar üretiliyor…');
  host.appendChild(loading);
  const reports = [];
  for (const s of SYMBOLS.slice(0,10)) {
    try {
      const d = await fetchMarket(s,'4h');
      const candles = d?.candles || [];
      const cl = candles.map(c=>+c.close);
      const px = d?.last||cl[cl.length-1]||0;
      const e20 = Number(ema(cl,20).at(-1)) || 0;
      const e50 = Number(ema(cl,50).at(-1)) || 0;
      const r14 = Number(rsi(cl,14).at(-1)) || 50;
      const a14 = Number(atr(candles,14).at(-1)) || 0;
      const stress = a14&&px ? (a14/px)*100 : 0;
      const trend = e20>e50 ? 'YUKARI' : e20<e50 ? 'AŞAĞI' : 'YATAY';
      const momentum = r14>70?'aşırı alım':r14<30?'aşırı satım':r14>55?'pozitif':r14<45?'negatif':'nötr';
      reports.push({ s, px, e20, e50, r14, a14, stress, trend, momentum, ch:d?.changePct24h||0 });
    } catch(e){}
  }
  loading.remove();

  const wrap = el('div',{style:'display:grid;grid-template-columns:repeat(2,1fr);gap:12px'});
  reports.forEach(r=>{
    const card_ = el('div',{class:'card'},
      el('div',{style:'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'},
        el('strong',{style:'font-size:16px'}, r.s.replace('USDT','')),
        tag(r.trend, r.trend==='YUKARI'?'green':r.trend==='AŞAĞI'?'red':'gray')
      ),
      el('div',{style:'display:grid;grid-template-columns:repeat(2,1fr);gap:4px;font-size:12px'},
        el('div',{class:'muted'},'Fiyat:'), el('div',{class:'mono'},'$'+fmtPrice(r.px)),
        el('div',{class:'muted'},'24s:'), el('div',{class:'mono '+(r.ch>=0?'pos':'neg')},`%${r.ch.toFixed(2)}`),
        el('div',{class:'muted'},'EMA20:'), el('div',{class:'mono'},'$'+fmtPrice(r.e20)),
        el('div',{class:'muted'},'EMA50:'), el('div',{class:'mono'},'$'+fmtPrice(r.e50)),
        el('div',{class:'muted'},'RSI14:'), el('div',{class:'mono'},`${r.r14.toFixed(1)} (${r.momentum})`),
        el('div',{class:'muted'},'ATR14%:'), el('div',{class:'mono'},`%${r.stress.toFixed(2)}`),
      ),
      el('div',{class:'muted xs',style:'margin-top:10px;font-style:italic'},
        `Özet: ${r.s.replace('USDT','')} 4h grafiğinde ${r.trend.toLowerCase()} yönlü hareket ediyor; momentum ${r.momentum}; volatilite ${r.stress>3?'yüksek':r.stress>1.5?'orta':'düşük'}.`
      )
    );
    wrap.appendChild(card_);
  });
  host.appendChild(card({ title:'OTOMATİK TEKNİK RAPORLAR · 4H', body:wrap }));
}
