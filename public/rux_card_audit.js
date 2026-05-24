/* RUx — Card Data Source Label, Stale Data & Live Binding Audit */

const LIVE_PAGES = new Set([
  'kokpit','piyasa','coin-pano','coin-bakis','coin-perf','coin-iliski','coin-likid','coin-heat',
  'sinyal','sinyal-detay','analiz-genel','analiz-fiyat','pa','smc','bugun','akis-smart','rvol',
  'atr','ote-giris','smart-money','price-action','smc-radar'
]);

const RESEARCH_PAGES = new Set([
  'test','backtest','setup-matrisi','kural-karsilastirma','user-fidelity','walkforward','montecarlo',
  'optimizer','kalibrasyon','no-trade-test','istatistik','strateji-karnesi','strateji-uretici',
  'edge-research','signal-replay','sinyal-gunlugu'
]);

const NEWS_PAGES = new Set(['haber','news-pulse']);
const SYSTEM_PAGES = new Set(['sistem','webhook-api','data-kaynak-sagligi','adapter-diagnostics','binance-live','orderflow-kaynak','alarm','hesaplayicilar','donusturuculer']);
const RISK_PAGES = new Set(['risk','acik-pozisyonlar','portfoy-isi','emir-gecmisi','kural-setleri','pozisyon-buyuklugu','stop','portfoy-risk','korelasyon-izleme','drawdown','sermaye-koruma']);

const LABEL_META = {
  LIVE:       { text:'LIVE',       cls:'live',     title:'Router-first canlı veri. 5 saniyelik canlı yenileme hedefi.' },
  CANDLE:     { text:'CANDLE',     cls:'candle',   title:'Mum/OHLC verisi. Anlık ticker fiyatıyla birebir aynı olması beklenmez.' },
  CACHE:      { text:'CACHE 5S',   cls:'cache',    title:'Kısa cache veya periyodik hydrate edilen veri. Canlıya yakın ama doğrudan tick değildir.' },
  COMPUTED:   { text:'COMPUTED',   cls:'computed', title:'Canlı veriden veya terminal motorlarından türetilmiş skor/yorum. Doğrudan fiyat tick’i değildir.' },
  RESEARCH:   { text:'RESEARCH',   cls:'research', title:'Araştırma/backtest/analiz sonucu. Sayfa açılışı veya manuel yenileme ile güncellenir.' },
  MOCK:       { text:'MOCK',       cls:'mock',     title:'Demo/örnek veri. Sinyal kararına doğrudan bağlanmamalıdır.' },
  STATIC:     { text:'STATIC',     cls:'static',   title:'Statik açıklama veya sabit referans kartı.' },
  FALLBACK:   { text:'FALLBACK',   cls:'fallback', title:'Birincil kaynak yerine fallback kaynağı kullanılıyor.' },
  DIAGNOSTIC: { text:'DIAGNOSTIC', cls:'diagnostic', title:'Sistem/adapter/sağlık kontrol bilgisi.' },
  DATA_GATE:  { text:'DATA GATE',  cls:'gate',     title:'Karar motoru için veri geçidi / sinyal izin politikası.' },
  OPTIONAL:   { text:'OPTIONAL',   cls:'optional', title:'Opsiyonel veri kaynağı. Eksikliği çekirdek canlı fiyat/sinyal hattını durdurmaz.' },
  OFFLINE:    { text:'OFFLINE',    cls:'offline',  title:'Kaynak çevrimdışı veya veri alınamıyor.' },
  NOT_WIRED:  { text:'NOT WIRED',  cls:'notwired', title:'Bu kart henüz canlı veri hattına bağlanmamış olabilir.' },
};

const KOKPIT_LIVE_LABELS = new Set(['BTC FİYATI','24S DEĞİŞİM','VERİ','BTC HIZLI KARAR']);
const KOKPIT_COMPUTED_LABELS = new Set(['REJİM','SİNYAL','GÜVEN','GENİŞLİK','MOTOR']);

function nowTime() {
  try { return new Date().toLocaleTimeString('tr-TR', { hour12:false }); } catch { return '--:--:--'; }
}

function txt(el) {
  if (!el) return '';
  try {
    const c = el.cloneNode(true);
    c.querySelectorAll?.('.rux-source-footer,.rux-card-audit-summary,.rux-ui-audit-summary').forEach(x => x.remove());
    return String(c.innerText || c.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
  } catch {
    return String(el?.innerText || el?.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
  }
}

function firstLabel(card) {
  try {
    const c = card.cloneNode(true);
    c.querySelectorAll?.('.rux-source-footer,.rux-card-audit-summary,.rux-ui-audit-summary').forEach(x => x.remove());
    const node = c.querySelector(':scope .label, :scope .card-title, :scope h1, :scope h2, :scope h3');
    return String(node?.textContent || '').replace(/\s+/g,' ').trim().toUpperCase();
  } catch {
    const node = card.querySelector(':scope .label, :scope .card-title, :scope h1, :scope h2, :scope h3');
    return String(node?.textContent || '').replace(/\s+/g,' ').trim().toUpperCase();
  }
}

function explicitSource(card) {
  const raw = card.getAttribute('data-rux-source') || card.getAttribute('data-source') || card.getAttribute('data-rux-binding');
  const key = String(raw || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return LABEL_META[key] ? key : null;
}

function hasLiveRouterClues(t) {
  return /\b(live_multi_exchange|multi exchange|okx|bybit|binance|router live|canlı\s*·|canli\s*·|live router|live price|spot live|ticker|funding|open interest|basis|mark\s*\/\s*futures|depth|bid|ask|spread)\b/.test(t);
}

function hasMoneyOrPercentMetric(t) {
  // Para, yüzde, skor (x/100), oran (1:2.6), çarpan (1.84x), R/R (+2.4R), durum sözcükleri.
  return /\$\s?\d/.test(t)
    || /\b\d{1,3}[,.]\d{1,2}\s?%/.test(t)
    || /\b\d{1,3}\s?\/\s?100\b/.test(t)
    || /\b\d+(\.\d+)?\s?x\b/.test(t)
    || /\b\d+\s?:\s?\d/.test(t)
    || /\b\d+\s?\/\s?\d/.test(t)
    || /[+\-]?\d+(\.\d+)?\s?r\b/.test(t)
    || /\b\d{2,}/.test(t) // herhangi bir 2+ haneli sayı (skor, fiyat, sayım)
    || /\b\d\b/.test(t);   // tek haneli sayım (TOPLAM 9, GÜÇLÜ AL 0 gibi watchlist sayıları)
}

// Bir kartta gerçek bir KPI/değer gösterimi var mı? (boş/iskelet kart değil)
function hasKpiValue(card) {
  try {
    // statCard '.val', miniStat '.rux-kpi-value', diğerleri çeşitli value class'ları.
    const v = card.querySelector('.val, .rux-kpi-value, .stat-value, .statcard-value, .value, .big, [class*="value"]');
    if (v) {
      const txt = String(v.textContent || '').trim();
      // Anlamlı değer: en az bir rakam (0 ve 9 dahil) ya da skor/yüzde işareti.
      // Sadece '—' veya boş ise henüz hidrate olmamış iskelet sayılır.
      if (txt.length && txt !== '—' && /\d|%|\$/.test(txt)) return true;
    }
  } catch {}
  return false;
}

function classifyCard(card, page) {
  const explicit = explicitSource(card);
  if (explicit) return { key: explicit, reason:'Kart üzerinde açık data-rux-source etiketi var' };

  const t = txt(card);
  const label = firstLabel(card);
  const cls = String(card.className || '').toLowerCase();

  if (!t && cls.includes('chart')) return { key:'CANDLE', reason:'Grafik / mum görselleştirme' };

  if (/offline|all hosts rejected|http 451|signal freeze|kaynak yok|veri yok/.test(t)) return { key:'OFFLINE', reason:'Kaynak yok / veri eksik' };
  if (/mock|demo|placeholder|örnek veri|sample data|simulated sample/.test(t)) return { key:'MOCK', reason:'Demo/mock içerik işareti' };
  if (/fallback|degraded/.test(t)) return { key:'FALLBACK', reason:'Fallback/degraded kaynak' };
  if (/data binding policy|decision binding|data gate|unified gate|signal gate|freshness lock/.test(t)) return { key:'DATA_GATE', reason:'Karar/veri geçidi' };

  if (page === 'kokpit') {
    if (card.classList.contains('live-newsbar')) return { key:'CACHE', reason:'Kokpit canlı haber cache/hydrate barı' };
    if (KOKPIT_LIVE_LABELS.has(label) || /btc hızlı karar|btc hizli karar|spot live price|canlı fiyat|canli fiyat/.test(t)) return { key:'LIVE', reason:'Kokpit canlı/router bağlı kart' };
    if (KOKPIT_COMPUTED_LABELS.has(label)) return { key:'COMPUTED', reason:'Kokpit canlı veriden türetilmiş skor/yorum' };
    if (/fırsat\s*&\s*adaylar|firsat\s*&\s*adaylar|olasilik|olasılık|güç|rejim|cvd|funding/.test(t)) return { key:'COMPUTED', reason:'Kokpit aday/sinyal hesap kartı' };
    if (/aktif strateji|forward performans|karne|sinyal günlüğü/.test(t)) return { key:'RESEARCH', reason:'Kokpit araştırma/kayıt özeti' };
  }

  if (/cvd|delta|order book|orderflow|likidite|liquidation|heatmap|on-chain|defillama|dune|whale/.test(t) && !/okx|bybit|binance|ticker|spot live/.test(t)) return { key:'OPTIONAL', reason:'Opsiyonel order-flow/on-chain/sentiment veri kaynağı' };

  if (/kline|klines|ohlc|ohlcv|open high low close|zaman open high low close|mum|candle|4h|1h|timeframe/.test(t)) return { key:'CANDLE', reason:'Mum/OHLC tabanlı veri' };
  if (hasLiveRouterClues(t)) return { key:'LIVE', reason:'Canlı router/ticker/türev veri işareti' };
  if (/haber|news|telegram|sentiment|duyarlılık|akış|headline/.test(t) || NEWS_PAGES.has(page)) return { key:'CACHE', reason:'Haber/sentiment kısa cache ile hydrate edilir' };
  if (/backtest|walk-forward|walk forward|monte carlo|risk-of-ruin|setup matrisi|setup matrix|rule comparison|kural karşılaştırma|edge research|expectancy|profit factor|oos|in-sample|out-of-sample|replay|timeline|fidelity|calibration|kalibrasyon|optimizer|optimizasyon/.test(t)) return { key:'RESEARCH', reason:'Araştırma/backtest sonucu' };
  if (/adapter|api|health|kaynak sağlığı|diagnostic|diagnostics|endpoint|latency|status|vercel|router confidence/.test(t) || SYSTEM_PAGES.has(page)) return { key:'DIAGNOSTIC', reason:'Sistem/adapter tanılama' };
  if (/açık pozisyon|portfolio heat|portföy ısısı|risk|drawdown|position sizing|pozisyon|heat|exposure|korelasyon/.test(t) || RISK_PAGES.has(page)) return { key:'RESEARCH', reason:'Risk/portföy analizi' };
  if (hasMoneyOrPercentMetric(t) && LIVE_PAGES.has(page)) return { key:'COMPUTED', reason:'Canlı sayfada sayısal/türetilmiş metrik; açık canlı kaynak etiketi yok' };

  if (RESEARCH_PAGES.has(page)) return { key:'RESEARCH', reason:'Araştırma sayfası' };
  // Canlı sayfada bir kartın gerçek KPI değeri varsa, kaynağı net olmasa bile
  // bu canlı veriden türetilmiş bir göstergedir → NOT_WIRED yerine COMPUTED.
  // NOT_WIRED yalnızca gerçekten boş/iskelet kartlar için saklanır.
  if (LIVE_PAGES.has(page)) {
    if (hasKpiValue(card) || hasMoneyOrPercentMetric(t)) return { key:'COMPUTED', reason:'Canlı sayfada KPI/değer gösteren türetilmiş kart' };
    return { key:'NOT_WIRED', reason:'Canlı sayfada değer göstermeyen kart (iskelet/boş)' };
  }
  if (SYSTEM_PAGES.has(page)) return { key:'DIAGNOSTIC', reason:'Sistem sayfası' };
  return { key:'STATIC', reason:'Statik içerik veya açıklama kartı' };
}

function createBadge(meta, reason) {
  const b = document.createElement('span');
  b.className = `rux-data-badge ${meta.cls}`;
  b.textContent = meta.text;
  b.title = `${meta.title}\n${reason ? 'Tespit: ' + reason + '\n' : ''}Updated: ${nowTime()}`;
  return b;
}

function ensureFooter(card) {
  // v0.56.0: badge/stamp now live in a layout footer instead of absolute overlay.
  let footer = card.querySelector(':scope > .rux-source-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.className = 'rux-source-footer';
    card.appendChild(footer);
  }
  return footer;
}

function ensureBadge(card, classification) {
  const meta = LABEL_META[classification.key] || LABEL_META.STATIC;
  card.setAttribute('data-rux-source-label', classification.key);
  card.setAttribute('data-rux-source-reason', classification.reason || '');
  card.classList.add('rux-audited-card');

  // Remove old v0.56.0 overlay nodes if the browser kept them during SPA hydration.
  for (const old of Array.from(card.children)) {
    if ((old.classList?.contains('rux-data-badge') || old.classList?.contains('rux-data-stamp')) && !old.closest('.rux-source-footer')) old.remove();
  }

  const footer = ensureFooter(card);
  let badge = footer.querySelector(':scope > .rux-data-badge');
  if (!badge) {
    badge = createBadge(meta, classification.reason);
    footer.appendChild(badge);
  } else {
    badge.className = `rux-data-badge ${meta.cls}`;
    badge.textContent = meta.text;
    badge.title = `${meta.title}\n${classification.reason ? 'Tespit: ' + classification.reason + '\n' : ''}Updated: ${nowTime()}`;
  }

  let stamp = footer.querySelector(':scope > .rux-data-stamp');
  if (!stamp) {
    stamp = document.createElement('span');
    stamp.className = 'rux-data-stamp';
    footer.appendChild(stamp);
  }
  stamp.textContent = classification.key === 'LIVE' || classification.key === 'CACHE'
    ? `upd ${nowTime()}`
    : classification.key === 'NOT_WIRED'
      ? 'no binding'
      : classification.key.toLowerCase();
}

function ensureSummary(host, page, counts, total) {
  if (!host) return;
  const existing = host.querySelector(':scope > .rux-card-audit-summary');
  const order = ['LIVE','COMPUTED','CANDLE','CACHE','RESEARCH','OPTIONAL','FALLBACK','MOCK','STATIC','DIAGNOSTIC','DATA_GATE','OFFLINE','NOT_WIRED'];
  const parts = order.filter(k => counts[k]).map(k => `${LABEL_META[k]?.text || k}: ${counts[k]}`);
  const notWired = counts.NOT_WIRED || 0;
  const offline = counts.OFFLINE || 0;
  const mock = counts.MOCK || 0;
  const severity = offline || notWired ? 'warn' : mock ? 'soft' : 'ok';
  const html = `
    <div class="audit-left">
      <strong>Kart Veri Denetimi</strong>
      <span>${total} kart tarandı · ${parts.join(' · ') || 'etiket yok'}</span>
    </div>
    <div class="audit-right ${severity}">${notWired ? `${notWired} NOT WIRED` : offline ? `${offline} OFFLINE` : 'Kaynak etiketleri aktif'}</div>
  `;
  if (existing) { existing.innerHTML = html; return; }
  const box = document.createElement('div');
  box.className = 'rux-card-audit-summary';
  box.innerHTML = html;
  const first = host.firstElementChild;
  if (first) host.insertBefore(box, first); else host.appendChild(box);
}

export function applyCardDataAudit(page = '') {
  const host = document.getElementById('om-page');
  if (!host) return { total:0, counts:{} };
  const cards = Array.from(host.querySelectorAll('.card,.stat-card,.chart-card,.decision-card,.rux-decision-card,.rux-validation-card,.rux-engine-card,.rux-compact-card'))
    .filter(c => !c.classList.contains('rux-card-audit-summary') && !c.closest('.rux-card-audit-summary'));
  const counts = {};
  for (const card of cards) {
    const c = classifyCard(card, page);
    counts[c.key] = (counts[c.key] || 0) + 1;
    ensureBadge(card, c);
  }
  ensureSummary(host, page, counts, cards.length);
  return { total:cards.length, counts };
}

export function scheduleCardDataAudit(page = '') {
  requestAnimationFrame(() => applyCardDataAudit(page));
  setTimeout(() => applyCardDataAudit(page), 350);
  setTimeout(() => applyCardDataAudit(page), 1500);
  setTimeout(() => applyCardDataAudit(page), 3200);
}

export function startCardAuditObserver() {
  const host = document.getElementById('om-page');
  if (!host || host.__ruxAuditObserver) return;
  let t = null;
  const obs = new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => {
      const page = (location.hash.replace(/^#\/?/, '').split('?')[0] || 'kokpit');
      applyCardDataAudit(page);
    }, 250);
  });
  obs.observe(host, { childList:true, subtree:true, characterData:true });
  host.__ruxAuditObserver = obs;
}
