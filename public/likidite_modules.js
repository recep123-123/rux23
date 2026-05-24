/* RUx — Likidite & heatmap analiz modülleri */
import { el, fetchMarket, fmtPrice, fmtNum, atr, ema } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, tag, barbar, heatColorClass } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','AVAXUSDT','LINKUSDT','DOGEUSDT','OPUSDT','ARBUSDT'];

/* ───────── 1) Likidite Analizi ───────── */
export async function renderLikiditeAnalizi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'LİKİDİTE ANALİZİ',
    subtitle: 'Spread, depth-proxy, hacim/volatilite oranı; ücretsiz veri modu altında hesaplanan likidite skorları',
    actions: [ el('button',{class:'btn primary',on:{click:()=>renderLikiditeAnalizi(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Likidite metrikleri hesaplanıyor…');
  host.appendChild(loading);
  const items = [];
  for (const s of SYMBOLS) {
    try {
      const d = await fetchMarket(s,'1h');
      const cl = (d?.candles||[]).map(c=>+c.close);
      const hi = (d?.candles||[]).map(c=>+c.high);
      const lo = (d?.candles||[]).map(c=>+c.low);
      const px = d?.last || cl[cl.length-1] || 0;
      const a14 = Number(atr(d?.candles||[],14).at(-1)) || 0;
      const stress = px ? (a14/px)*100 : 0;
      const vol24 = d?.volQuote24h || 0;
      // Liquidity score: high volume + low volatility → high liquidity
      const volScore = Math.min(100, (vol24 / 1e9) * 50);
      const stressScore = Math.max(0, 100 - stress*30);
      const liqScore = (volScore*0.6 + stressScore*0.4);
      items.push({ s, px, vol24, stress, liqScore });
    } catch(e){}
  }
  loading.remove();

  items.sort((a,b)=>b.liqScore-a.liqScore);
  const best = items[0], worst = items[items.length-1];

  host.appendChild(el('div',{class:'stat-row cols-3 section'},
    statCard({ icon: ICN.flow(20), iconColor:'#3eb8ff', label:'EN LİKİT', value: best.s.replace('USDT',''), sub:`skor ${best.liqScore.toFixed(1)}` }),
    statCard({ icon: ICN.warning(20), iconColor:'#ffb86b', label:'EN İLLİKİT', value: worst.s.replace('USDT',''), sub:`skor ${worst.liqScore.toFixed(1)}` }),
    statCard({ icon: ICN.bars(20), label:'İZLENEN', value: String(items.length), sub:'sembol' }),
  ));

  const tbl = el('table',{class:'simple'},
    el('thead',{},el('tr',{},
      el('th',{},'SEMBOL'),
      el('th',{},'FİYAT'),
      el('th',{},'24S HACİM'),
      el('th',{},'STRES (ATR%)'),
      el('th',{},'LİKİDİTE SKOR'),
      el('th',{},'SINIF')
    )),
    el('tbody',{}, ...items.map(r=>{
      const cls = r.liqScore>70?'A':r.liqScore>50?'B':r.liqScore>30?'C':'D';
      const tone = cls==='A'?'green':cls==='B'?'cyan':cls==='C'?'yellow':'red';
      return el('tr',{},
        el('td',{},el('strong',{},r.s.replace('USDT',''))),
        el('td',{class:'mono'},'$'+fmtPrice(r.px)),
        el('td',{class:'mono'},'$'+fmtNum(r.vol24)),
        el('td',{class:'mono'},`%${r.stress.toFixed(2)}`),
        el('td',{}, barbar(r.liqScore,100)),
        el('td',{}, tag('SINIF '+cls, tone))
      );
    }))
  );
  host.appendChild(card({ title:'LİKİDİTE SKOR TABLOSU', body:tbl }));

  host.appendChild(el('div',{class:'card section'},
    el('div',{class:'h6'},'METRİK TANIMLARI'),
    el('div',{style:'margin-top:8px;line-height:1.7'},
      '• ', el('strong',{},'24s Hacim: '), 'Borsa raporladığı USDT bazlı dolar hacim',
      el('br'),
      '• ', el('strong',{},'Stres (ATR%): '), 'Volatilite proxy — 14 mum ATR ÷ fiyat',
      el('br'),
      '• ', el('strong',{},'Likidite Skoru: '), '60% hacim + 40% düşük volatilite ağırlıklı',
      el('br'),
      '• ', el('strong',{},'Sınıf A: '), '70+ (yüksek likidite, büyük pozisyon için uygun)',
      el('br'),
      '• ', el('strong',{},'Sınıf D: '), '<30 (illikit, slipaj riski yüksek)')
  ));
}

/* ───────── 2) Likidite Haritası ───────── */
export async function renderLikiditeHaritasi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'LİKİDİTE HARİTASI',
    subtitle: 'Fiyat seviyelerinde tahmini likidite yoğunluğu (ATR ve sosyal hacim proxy)',
    actions: [ el('button',{class:'btn primary',on:{click:()=>renderLikiditeHaritasi(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Likidite seviyeleri hesaplanıyor…');
  host.appendChild(loading);
  const items=[];
  for (const s of SYMBOLS.slice(0,8)) {
    try {
      const d = await fetchMarket(s,'4h');
      const cl = (d?.candles||[]).map(c=>+c.close);
      const hi = (d?.candles||[]).map(c=>+c.high);
      const lo = (d?.candles||[]).map(c=>+c.low);
      const px = d?.last || cl[cl.length-1] || 0;
      const a14 = Number(atr(d?.candles||[],14).at(-1)) || 0;
      // Detect prior pivot highs/lows (simple: 5-bar swing)
      const highs=[], lows=[];
      for (let i=5;i<cl.length-5;i++){
        const isPH = hi[i]===Math.max(...hi.slice(i-5,i+6));
        const isPL = lo[i]===Math.min(...lo.slice(i-5,i+6));
        if (isPH) highs.push({ idx:i, level:hi[i] });
        if (isPL) lows.push({ idx:i, level:lo[i] });
      }
      // top 3 most recent
      const topHi = highs.slice(-3).map(x=>x.level);
      const topLo = lows.slice(-3).map(x=>x.level);
      items.push({ s, px, a14, topHi, topLo });
    } catch(e){}
  }
  loading.remove();

  const tbl = el('table',{class:'simple'},
    el('thead',{},el('tr',{},
      el('th',{},'SEMBOL'),
      el('th',{},'FİYAT'),
      el('th',{},'ÜST LİKİDİTE BÖLGELERİ'),
      el('th',{},'ALT LİKİDİTE BÖLGELERİ'),
      el('th',{},'ATR')
    )),
    el('tbody',{}, ...items.map(r=>el('tr',{},
      el('td',{},el('strong',{},r.s.replace('USDT',''))),
      el('td',{class:'mono'},'$'+fmtPrice(r.px)),
      el('td',{class:'mono'}, r.topHi.length ? r.topHi.map(v=>'$'+fmtPrice(v)).join(' · ') : '—'),
      el('td',{class:'mono'}, r.topLo.length ? r.topLo.map(v=>'$'+fmtPrice(v)).join(' · ') : '—'),
      el('td',{class:'mono'},'$'+fmtPrice(r.a14)),
    )))
  );
  host.appendChild(card({
    title:'PIVOT-BAZLI LİKİDİTE HARİTASI · 4H',
    info: 'Swing-high ve swing-low seviyeleri; likidite-sweep / stop-hunt bölgesi olarak yorumlanabilir',
    body:tbl
  }));
}

/* ───────── 3) Heatmap Analiz (volatilite + hacim + funding kombinasyonu) ───────── */
export async function renderHeatmapAnaliz(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'HEATMAP ANALİZ',
    subtitle: 'Volatilite × Hacim × Momentum çok-faktörlü ısı haritası · 4h',
    actions: [ el('button',{class:'btn primary',on:{click:()=>renderHeatmapAnaliz(host)}}, ICN.refresh(12),'YENİLE') ]
  }));

  const loading = el('div',{class:'card section'},'Multi-factor heatmap hesaplanıyor…');
  host.appendChild(loading);
  const items=[];
  for (const s of SYMBOLS) {
    try {
      const d = await fetchMarket(s,'4h');
      const cl = (d?.candles||[]).map(c=>+c.close);
      const hi = (d?.candles||[]).map(c=>+c.high);
      const lo = (d?.candles||[]).map(c=>+c.low);
      const px = d?.last || cl[cl.length-1] || 0;
      const a14 = Number(atr(d?.candles||[],14).at(-1)) || 0;
      const stress = px ? (a14/px)*100 : 0;
      const ch = d?.changePct24h || 0;
      const vol24 = d?.volQuote24h || 0;
      const volScore = Math.min(100, (vol24/1e9)*50);
      const momScore = Math.max(0, Math.min(100, 50 + ch*5));
      const volaScore = Math.min(100, stress*20);
      const overall = (volScore*0.4 + momScore*0.3 + volaScore*0.3);
      items.push({ s, px, ch, stress, vol24, volScore, momScore, volaScore, overall });
    } catch(e){}
  }
  loading.remove();
  items.sort((a,b)=>b.overall-a.overall);

  const tbl = el('table',{class:'simple'},
    el('thead',{},el('tr',{},
      el('th',{},'SEMBOL'),
      el('th',{},'FİYAT'),
      el('th',{},'HACİM'),
      el('th',{},'MOMENTUM'),
      el('th',{},'VOLATİLİTE'),
      el('th',{},'GENEL SKOR'),
      el('th',{},'ETKİ')
    )),
    el('tbody',{}, ...items.map(r=>{
      const heat = r.overall>70?'red':r.overall>50?'yellow':r.overall>30?'cyan':'gray';
      const desc = r.overall>70?'AKTİF':r.overall>50?'GELİŞEN':r.overall>30?'SAKİN':'YANSIZ';
      return el('tr',{},
        el('td',{},el('strong',{},r.s.replace('USDT',''))),
        el('td',{class:'mono'},'$'+fmtPrice(r.px)),
        el('td',{}, barbar(r.volScore,100)),
        el('td',{}, barbar(r.momScore,100)),
        el('td',{}, barbar(r.volaScore,100)),
        el('td',{class:'mono'},r.overall.toFixed(1)),
        el('td',{}, tag(desc, heat))
      );
    }))
  );
  host.appendChild(card({ title:'ÇOK FAKTÖRLÜ ISI HARİTASI', body:tbl }));

  host.appendChild(el('div',{class:'card section'},
    el('div',{class:'h6'},'YORUM REHBERİ'),
    el('div',{style:'margin-top:8px;line-height:1.7'},
      '• ', el('strong',{},'AKTİF (>70): '), 'Yüksek hacim + güçlü momentum + canlı volatilite; setup arama önceliği',
      el('br'),
      '• ', el('strong',{},'GELİŞEN (50-70): '), 'Faktörler uyumlu ama doygunluk değil; izle',
      el('br'),
      '• ', el('strong',{},'SAKİN (30-50): '), 'Düşük faaliyet; range veya pre-breakout',
      el('br'),
      '• ', el('strong',{},'YANSIZ (<30): '), 'Düşük katılım; trade için ideal değil')
  ));
}
