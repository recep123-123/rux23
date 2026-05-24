/* RUx — App entry: router, navigation, shell */
import { State, fetchMarket, fmtPrice, fmtPct, $ } from './api.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { ICN } from './components.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { renderPage } from './pages_index.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { applyRuxVersionBadges, RUX_APP_VERSION, RUX_BUILD_ID } from './rux_version.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { scheduleCardDataAudit, startCardAuditObserver } from './rux_card_audit.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { scheduleFunctionalUiAudit, startFunctionalUiBridge } from './rux_ui_audit.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { initRuxGlobalControls, syncRuxGlobalControls } from './rux_global_controls.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { installErrorReporter } from './rux_storage.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';


/* =========================================================
   NAVIGATION TAXONOMY
   Top tabs map to multiple sidebar groups
   ========================================================= */
const TOP_TABS = [
  { id: 'kokpit',  label: 'Kokpit',  groups: ['kokpit'] },
  { id: 'piyasa',  label: 'Piyasa',  groups: ['piyasa'] },
  { id: 'coin',    label: 'Coin',    groups: ['coin'] },
  { id: 'sinyal',  label: 'Sinyal',  groups: ['sinyal'] },
  { id: 'turev',   label: 'Türev',   groups: ['turev'] },
  { id: 'analiz',  label: 'Analiz',  groups: ['analiz'] },
  { id: 'akis',    label: 'Akış',    groups: ['akis'] },
  { id: 'test',    label: 'Test',    groups: ['test'] },
  { id: 'risk',    label: 'Risk',    groups: ['risk'] },
  { id: 'haber',   label: 'Haber',   groups: ['haber'] },
  { id: 'sistem',  label: 'Sistem',  groups: ['sistem'] },
];

const SIDEBAR_GROUPS = {
  kokpit: {
    label: 'KOKPİT',
    items: [
      { id: 'kokpit',     label: 'Ana Kokpit',    icon: 'layout' },
      { id: 'piyasa',     label: 'Piyasa Özeti',  icon: 'pie' },
      { id: 'akis-smart', label: 'Smart Money',   icon: 'whale' },
      { id: 'pa',         label: 'Price Action / PA', icon: 'trend' },
      { id: 'smc',        label: 'SMC Radar',     icon: 'scan' },
      { id: 'bugun',      label: 'Bugün İşlem?',  icon: 'check' },
    ]
  },
  piyasa: {
    label: 'PİYASA',
    items: [
      { id: 'piyasa',           label: 'Piyasa Özeti',      icon: 'pie' },
      { id: 'piyasa-haritasi',  label: 'Piyasa Haritası',   icon: 'layout' },
      { id: 'sektor-haritasi',  label: 'Sektör Haritası',   icon: 'layers' },
      { id: 'likidasyon-haritasi', label: 'Likidasyon Haritası', icon: 'flow' },
      { id: 'isi-haritasi',     label: 'Isı Haritası',      icon: 'flame' },
      { id: 'global-endeksler', label: 'Global Endeksler',  icon: 'globe' },
      { id: 'makro-takvim',     label: 'Makro Takvim',      icon: 'flag' },
    ]
  },
  turev: {
    label: 'TÜREV VERİ',
    items: [
      { id: 'derivs-oi',      label: 'Açık Pozisyon (OI)',  icon: 'layers' },
      { id: 'derivs-funding', label: 'Fonlama (Funding)',   icon: 'scale' },
      { id: 'derivs-cvd',     label: 'Hacim Deltası (CVD)', icon: 'flow' },
      { id: 'derivs-liq',     label: 'Likidasyonlar',       icon: 'warning' },
      { id: 'derivs-heatmap', label: 'Likidasyon Haritası', icon: 'flame' },
    ]
  },
  coin: {
    label: 'COIN',
    items: [
      { id: 'coin-pano', label: 'Coin Pano', icon: 'cube' },
      { id: 'coin-bakis',label: 'Genel Bakış', icon: 'eye' },
      { id: 'coin-perf', label: 'Performans', icon: 'bars' },
      { id: 'coin-iliski',label: 'İlişkiler (Correlation)', icon: 'link' },
      { id: 'coin-likid',label: 'Likitasyon Haritası', icon: 'flow' },
      { id: 'coin-heat', label: 'Heatmap', icon: 'flame' },
      { id: 'coin-rapor',label: 'Raporlar', icon: 'newspaper' },
    ]
  },
  sinyal: {
    label: 'SİNYAL',
    items: [
      { id: 'sinyal',  label: 'Sinyal Merkezi', icon: 'signal' },
      { id: 'sinyal-gunlugu', label: 'Sinyal Günlüğü', icon: 'table' },
      { id: 'signal-replay', label: 'Signal Replay', icon: 'play' },
      { id: 'sinyal-detay', label: 'Sinyal Detay', icon: 'eye' },
    ]
  },
  analiz: {
    label: 'ANALİZ',
    items: [
      { id: 'analiz-genel', label: 'Genel Bakış', icon: 'eye' },
      { id: 'analiz-fiyat', label: 'Fiyat Analizi', icon: 'trend' },
      { id: 'analiz-zincir', label: 'Zincir Üstü', icon: 'cube' },
      { id: 'analiz-korelasyon', label: 'Korelasyon Analizi', icon: 'link' },
      { id: 'aralik-sapmasi', label: 'Aralık Sapması', icon: 'axe' },
      { id: 'volatilite', label: 'Volatilite Analizi', icon: 'pulse' },
      { id: 'akis-analizi', label: 'Akış Analizi', icon: 'flow' },
      { id: 'piyasa-dongu', label: 'Piyasa Döngüleri', icon: 'refresh' },
      { id: 'likidite-analizi', label: 'Likidite Analizi', icon: 'flow' },
      { id: 'rvol', label: 'Hacim-Fiyat / RVOL', icon: 'bars' },
      { id: 'likidite-haritasi', label: 'Likidite Haritası', icon: 'flow' },
      { id: 'heatmap-analiz', label: 'Heatmap', icon: 'flame' },
    ]
  },
  akis: {
    label: 'AKIŞ',
    items: [
      { id: 'akis-smart', label: 'Smart Money', icon: 'whale' },
      { id: 'akis-whale', label: 'Whale İşlemleri', icon: 'whale' },
      { id: 'akis-flow', label: 'Akış Analizi', icon: 'flow' },
    ]
  },
  test: {
    label: 'TEST & ARAŞTIRMA',
    items: [
      { id: 'test', label: 'Test ve Araştırma', icon: 'beaker' },
      { id: 'edge-research', label: 'Edge Research Dashboard', icon: 'cpu' },
      { id: 'backtest', label: 'Backtest', icon: 'beaker' },
      { id: 'setup-matrisi', label: 'Setup Matrisi', icon: 'table' },
      { id: 'kural-karsilastirma', label: 'Kural Karşılaştırma', icon: 'scale' },
      { id: 'user-fidelity', label: 'User Fidelity', icon: 'edit' },
      { id: 'signal-replay', label: 'Signal Replay / Timeline', icon: 'play' },
      { id: 'walkforward', label: 'OOS / Walk-Forward', icon: 'swap' },
      { id: 'montecarlo', label: 'Monte Carlo / Ruin', icon: 'flow' },
      { id: 'optimizer', label: 'Optimizer', icon: 'cpu' },
      { id: 'kalibrasyon', label: 'Kalibrasyon', icon: 'gear' },
      { id: 'no-trade-test', label: 'No-Trade Testi', icon: 'filter' },
      { id: 'istatistik', label: 'İstatistik', icon: 'bars' },
      { id: 'portfoy-bt', label: 'Portföy Backtest', icon: 'briefcase' },
      { id: 'strateji-karnesi', label: 'Strateji Karnesi', icon: 'shieldcheck' },
      { id: 'strateji-uretici', label: 'Strateji Üreticisi', icon: 'cpu' },
      { id: 'kati-pa-kurallari', label: 'Katı PA Kuralları', icon: 'shieldcheck' },
      { id: 'ote-giris', label: 'OTE Giriş', icon: 'target' },
    ]
  },
  risk: {
    label: 'RİSK YÖNETİMİ',
    items: [
      { id: 'risk', label: 'Risk Paneli', icon: 'shield' },
      { id: 'acik-pozisyonlar', label: 'Açık Pozisyonlar', icon: 'briefcase' },
      { id: 'portfoy-isi', label: 'Portföy Isısı v2', icon: 'flame' },
      { id: 'emir-gecmisi', label: 'Emir Geçmişi', icon: 'table' },
      { id: 'kural-setleri', label: 'Kural Setleri', icon: 'list' },
      { id: 'pozisyon-buyuklugu', label: 'Pozisyon Büyüklüğü', icon: 'scale' },
      { id: 'stop', label: 'Stop Yönetimi', icon: 'shield' },
      { id: 'atr', label: 'ATR Yönetimi', icon: 'bars' },
      { id: 'portfoy-risk', label: 'Portföy Risk', icon: 'briefcase' },
      { id: 'korelasyon-izleme', label: 'Korelasyon İzleme', icon: 'link' },
      { id: 'drawdown', label: 'Drawdown Kontrolü', icon: 'warning' },
      { id: 'sermaye-koruma', label: 'Sermaye Koruma', icon: 'shieldcheck' },
    ]
  },
  haber: {
    label: 'HABER',
    items: [
      { id: 'haber', label: 'Haber Akışı', icon: 'newspaper' },
      { id: 'news-pulse', label: 'News Pulse', icon: 'pulse' },
    ]
  },
  sistem: {
    label: 'SİSTEM',
    items: [
      { id: 'sistem', label: 'Sistem', icon: 'cpu' },
      { id: 'webhook-api', label: 'API & Ayarlar', icon: 'link' },
      { id: 'data-kaynak-sagligi', label: 'Data Source Health', icon: 'shieldcheck' },
      { id: 'adapter-diagnostics', label: 'Adapter Diagnostics', icon: 'scan' },
      { id: 'binance-live', label: 'Exchange Data Router', icon: 'link' },
      { id: 'orderflow-kaynak', label: 'Order Flow Kaynakları', icon: 'flow' },
      { id: 'alarm', label: 'Alarm Yönetimi', icon: 'bell' },
      { id: 'hesaplayicilar', label: 'Hesaplayıcılar', icon: 'cube' },
      { id: 'donusturuculer', label: 'Dönüştürücüler', icon: 'swap' },
    ]
  },
};

/* page → which top tab + which sidebar group it belongs to (for highlight)
   For pages that appear in multiple groups (e.g. 'piyasa'), we map to the primary tab. */
const PAGE_TO_TAB = {
  kokpit: 'kokpit', piyasa: 'piyasa', 'piyasa-haritasi': 'piyasa', 'sektor-haritasi': 'piyasa',
  'likidasyon-haritasi': 'piyasa', 'isi-haritasi': 'piyasa', 'global-endeksler': 'piyasa', 'makro-takvim': 'piyasa',
  'coin-pano': 'coin', 'coin-bakis': 'coin', 'coin-perf': 'coin', 'coin-iliski': 'coin', 'coin-likid': 'coin', 'coin-heat': 'coin', 'coin-rapor': 'coin',
  sinyal: 'sinyal', 'signal-replay': 'test',
  'derivs-oi': 'turev', 'derivs-funding': 'turev', 'derivs-cvd': 'turev', 'derivs-liq': 'turev', 'derivs-heatmap': 'turev',
  'analiz-genel': 'analiz', 'analiz-fiyat': 'analiz', 'analiz-zincir': 'analiz', 'analiz-korelasyon': 'analiz',
  'aralik-sapmasi': 'analiz', volatilite: 'analiz', 'akis-analizi': 'analiz', 'piyasa-dongu': 'analiz',
  'likidite-analizi': 'analiz', rvol: 'analiz', 'likidite-haritasi': 'analiz', 'heatmap-analiz': 'analiz',
  pa: 'kokpit', smc: 'kokpit', bugun: 'kokpit',
  'akis-smart': 'akis', 'akis-whale': 'akis', 'akis-flow': 'akis',
  test: 'test', 'edge-research': 'test', backtest: 'test', 'setup-matrisi': 'test', 'kural-karsilastirma': 'test', 'user-fidelity': 'test', walkforward: 'test', montecarlo: 'test', optimizer: 'test',
  kalibrasyon: 'test', 'no-trade-test': 'test', istatistik: 'test', 'portfoy-bt': 'test', 'strateji-karnesi': 'test', 'strateji-uretici': 'test',
  'kati-pa-kurallari': 'test', 'ote-giris': 'sinyal',
  risk: 'risk', 'acik-pozisyonlar': 'risk', 'portfoy-isi': 'risk', 'emir-gecmisi': 'risk', 'kural-setleri': 'risk', 'pozisyon-buyuklugu': 'risk', stop: 'risk', atr: 'risk',
  'portfoy-risk': 'risk', 'korelasyon-izleme': 'risk', drawdown: 'risk', 'sermaye-koruma': 'risk',
  haber: 'haber', 'news-pulse': 'haber',
  sistem: 'sistem', 'webhook-api': 'sistem', 'data-kaynak-sagligi': 'sistem', 'adapter-diagnostics': 'sistem', 'binance-live': 'sistem', 'orderflow-kaynak': 'sistem', alarm: 'sistem', hesaplayicilar: 'sistem', donusturuculer: 'sistem',
};

const TAB_DEFAULT_PAGE = {
  kokpit: 'kokpit', piyasa: 'piyasa', coin: 'coin-pano', sinyal: 'sinyal', analiz: 'analiz-genel',
  akis: 'akis-smart', test: 'test', risk: 'risk', haber: 'haber', sistem: 'sistem', turev: 'derivs-oi',
};

State.NAV = { TOP_TABS, SIDEBAR_GROUPS, PAGE_TO_TAB, TAB_DEFAULT_PAGE };

/* =========================================================
   ROUTING
   ========================================================= */
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'kokpit';
  const [page, qs] = h.split('?');
  const params = {};
  if (qs) qs.split('&').forEach(p => { const [k, v] = p.split('='); params[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
  return { page, params };
}
function navigate(page, params) {
  const qs = params ? '?' + Object.entries(params).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&') : '';
  location.hash = '#/' + page + qs;
}
window.OMNI = { navigate, State };

/* =========================================================
   RENDER SHELL
   ========================================================= */
function renderTopNav() {
  const host = document.getElementById('om-topnav');
  host.innerHTML = '';
  TOP_TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'om-tab';
    b.textContent = t.label;
    b.dataset.tab = t.id;
    b.addEventListener('click', () => navigate(TAB_DEFAULT_PAGE[t.id] || t.id));
    host.appendChild(b);
  });
}
function highlightTopNav(page) {
  const tab = PAGE_TO_TAB[page] || 'kokpit';
  document.querySelectorAll('#om-topnav .om-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

function renderSidebar(page) {
  const tab = PAGE_TO_TAB[page] || 'kokpit';
  const groups = (TOP_TABS.find(t => t.id === tab) || TOP_TABS[0]).groups;
  // Always include all primary groups for consistency in sidebar (some refs show multiple groups)
  // But filter to keep only the relevant top tab's group + a couple of always-visible cross-cut groups based on page references.
  const showGroups = pickSidebarGroups(page, tab);
  const host = document.getElementById('om-sidebar-list');
  host.innerHTML = '';
  showGroups.forEach(gid => {
    const g = SIDEBAR_GROUPS[gid];
    if (!g) return;
    const groupEl = document.createElement('div');
    groupEl.className = 'group';
    const lbl = document.createElement('div');
    lbl.className = 'group-label';
    lbl.innerHTML = `<span>${g.label}</span>`;
    const chev = document.createElement('span'); chev.className = 'chev';
    const sv = document.createElementNS('http://www.w3.org/2000/svg','svg');
    sv.setAttribute('viewBox','0 0 24 24'); sv.setAttribute('width','10'); sv.setAttribute('height','10');
    sv.setAttribute('fill','none'); sv.setAttribute('stroke','currentColor'); sv.setAttribute('stroke-width','2');
    const p = document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d','M6 9l6 6 6-6');
    sv.appendChild(p); chev.appendChild(sv); lbl.appendChild(chev);
    lbl.addEventListener('click', () => groupEl.classList.toggle('group-collapsed'));
    groupEl.appendChild(lbl);
    const items = document.createElement('div'); items.className = 'group-items';
    g.items.forEach(it => {
      const a = document.createElement('a');
      a.className = 'side-item' + (it.id === page ? ' active' : '');
      a.href = '#/' + it.id;
      const icSpan = document.createElement('span');
      icSpan.className = 'icon';
      const ico = (ICN[it.icon] || ICN.zap)(14);
      icSpan.appendChild(ico);
      a.appendChild(icSpan);
      a.appendChild(Object.assign(document.createElement('span'), { className: 'item-label', textContent: it.label }));
      items.appendChild(a);
    });
    groupEl.appendChild(items);
    host.appendChild(groupEl);
  });
}

/* Determine which sidebar groups to render based on current page so
   each main page shows the appropriate combination (matches references). */
function pickSidebarGroups(page, tab) {
  // Reference designs show multi-group sidebars for several pages — replicate.
  switch (tab) {
    case 'kokpit':
      // Kokpit/PA/SMC/etc → KOKPIT + PORTFÖY + SİNYAL & ANALİZ + TEST & STRATEJİ + RİSK YÖNETİMİ
      return ['kokpit','test','risk'];
    case 'piyasa':
      return ['piyasa','analiz'];
    case 'coin':
      return ['coin'];
    case 'sinyal':
      return ['sinyal','test','risk'];
    case 'analiz':
      return ['analiz','test'];
    case 'akis':
      return ['akis','kokpit','test'];
    case 'test':
      return ['kokpit','test'];
    case 'risk':
      return ['risk'];
    case 'haber':
      return ['haber'];
    case 'sistem':
      return ['sistem'];
    default:
      return [tab];
  }
}

/* =========================================================
   ROUTER MOUNT
   ========================================================= */
async function route() {
  const { page, params } = parseHash();
  State.currentPage = page;
  try { window.__RUX_CURRENT_PAGE__ = page; } catch {}
  if (params.symbol) State.symbol = params.symbol.toUpperCase();
  if (params.tf) State.tf = params.tf;
  syncRuxGlobalControls();
  highlightTopNav(page);
  renderSidebar(page);
  const main = document.getElementById('om-page');
  main.innerHTML = '<div class="empty"><span class="loader"></span> Yükleniyor...</div>';
  try {
    await renderPage(page, main, params);
    scheduleCardDataAudit(page);
    scheduleFunctionalUiAudit();
    startCardAuditObserver();
  } catch (e) {
    console.error('[OMNI] render error', e);
    main.innerHTML = `<div class="card"><div class="empty">Sayfa yüklenirken hata oluştu: ${e?.message || e}</div></div>`;
  }
  main.scrollTop = 0;
  setTimeout(() => { scheduleCardDataAudit(page); scheduleFunctionalUiAudit(); }, 50);
}

/* =========================================================
   STATUS BAR (live)
   ========================================================= */
function tickClock() {
  const d = new Date();
  const el = document.getElementById('stClock');
  if (el) el.textContent = d.toLocaleTimeString('tr-TR', { hour12: false });
}
async function refreshStatusBar() {
  // v0.56.0: bottom bar uses the same live market router as all pages.
  try {
    const [btcLive, ethLive] = await Promise.all([fetchMarket('BTCUSDT', '4h', 120), fetchMarket('ETHUSDT', '4h', 120)]);
    const bp = Number(btcLive?.ticker?.price ?? btcLive?.candles?.at?.(-1)?.close);
    const ep = Number(ethLive?.ticker?.price ?? ethLive?.candles?.at?.(-1)?.close);
    const conf = Math.round(Number(btcLive?.quality?.confidence ?? 0));
    const ex = String(btcLive?.activeExchange || '').toUpperCase();
    if (bp && ep) {
      const ethBtc = ep / bp;
      const stEthBtc = document.getElementById('stEthBtc');
      if (stEthBtc) stEthBtc.textContent = ethBtc.toFixed(5);
      // ETH/BTC 24s değişim: ~24s önceki orana göre (4h mum × 6 ≈ 24s)
      try {
        const bc = btcLive?.candles, ec = ethLive?.candles;
        if (Array.isArray(bc) && Array.isArray(ec) && bc.length > 6 && ec.length > 6) {
          const bp0 = Number(bc[bc.length - 7].close), ep0 = Number(ec[ec.length - 7].close);
          if (bp0 > 0 && ep0 > 0) {
            const prev = ep0 / bp0;
            const chg = ((ethBtc - prev) / prev) * 100;
            const stEthBtcChg = document.getElementById('stEthBtcChg');
            if (stEthBtcChg && Number.isFinite(chg)) {
              stEthBtcChg.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
              stEthBtcChg.className = chg >= 0 ? 'pos' : 'neg';
            }
          }
        }
      } catch {}
    }
    const stData = document.getElementById('stData');
    const stConn = document.getElementById('stConn');
    if (stData) {
      stData.textContent = conf >= 70 ? `CANLI · ${ex || 'ROUTER'}` : `DEGRADED · ${conf || 0}`;
      stData.className = 'om-val ' + (conf >= 70 ? 'ok' : conf >= 50 ? 'warn' : 'neg');
    }
    if (stConn) {
      stConn.textContent = conf >= 70 ? 'İyi' : conf >= 50 ? 'Kısıtlı' : 'Zayıf';
      stConn.className = 'om-val ' + (conf >= 70 ? 'ok' : conf >= 50 ? 'warn' : 'neg');
    }
  } catch {}
  // Global metrikler (BTC.D, USDT.D, TOTAL, ETH.D) — backend CoinGecko /global fallback ile gelir.
  try {
    const cmc = await (await fetch('/api/cmc?mode=context', { cache: 'no-store' })).json().catch(() => null);
    const g = cmc?.global_metrics || null;
    if (g) {
      const total = Number(g.total_market_cap) || 0;
      const btcD = Number(g.btc_dominance);
      const totalChg = Number(g.total_market_cap_yesterday_percentage_change);
      const stableMc = Number(g.stablecoin_market_cap) || 0;

      if (total > 0) {
        const stTotal = document.getElementById('stTotal');
        if (stTotal) stTotal.textContent = (total / 1e12).toFixed(2) + 'T';
        const stTotalChg = document.getElementById('stTotalChg');
        if (stTotalChg && Number.isFinite(totalChg)) {
          stTotalChg.textContent = (totalChg >= 0 ? '+' : '') + totalChg.toFixed(2) + '%';
          stTotalChg.className = totalChg >= 0 ? 'pos' : 'neg';
        }
        // USDT.D ≈ stablecoin (USDT ağırlıklı) piyasa değeri / toplam piyasa değeri
        if (stableMc > 0) {
          const usdtD = (stableMc / total) * 100;
          const stUsdtD = document.getElementById('stUsdtD');
          if (stUsdtD) stUsdtD.textContent = usdtD.toFixed(2) + '%';
        }
      }
      if (Number.isFinite(btcD)) {
        const stBtcD = document.getElementById('stBtcD');
        if (stBtcD) stBtcD.textContent = btcD.toFixed(2) + '%';
      }
    }
  } catch {}
}

/* =========================================================
   SIDEBAR INTERACTIONS
   ========================================================= */
function setupSidebarSearch() {
  const input = document.getElementById('sidebarSearch');
  if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    document.querySelectorAll('#om-sidebar-list .side-item').forEach(a => {
      const lbl = a.querySelector('.item-label')?.textContent.toLowerCase() || '';
      a.style.display = !q || lbl.includes(q) ? '' : 'none';
    });
    document.querySelectorAll('#om-sidebar-list .group').forEach(g => {
      const has = !!g.querySelector('.side-item:not([style*="display: none"])');
      g.style.display = has ? '' : 'none';
    });
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
  });
}

function setupHeaderActions() {
  document.getElementById('btnTheme')?.addEventListener('click', () => {
    document.documentElement.classList.toggle('theme-light');
  });
  document.getElementById('btnCollapse')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
  });
  document.getElementById('btnSidebarToggle')?.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
  });
  document.getElementById('btnLang')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('rux:shell-action', { detail: { action: 'language-toggle' } }));
    try { window.OMNI?.State?.emit?.('shell-action', 'language-toggle'); } catch {}
    const host = document.getElementById('om-toast-host');
    if (host) {
      const t = document.createElement('div');
      t.className = 'toast info';
      t.innerHTML = '<div class="tt">RUx Dil</div><div class="tm">Dil altyapısı TR olarak aktif. Çoklu dil ayrı sayfa güncellemesinde bağlanacak.</div>';
      host.appendChild(t); setTimeout(() => t.remove(), 3200);
    }
  });
  document.getElementById('btnBell')?.addEventListener('click', () => navigate('alarm'));
  document.getElementById('btnUser')?.addEventListener('click', () => navigate('webhook-api'));
  document.getElementById('btnStatusFavorite')?.addEventListener('click', () => {
    document.getElementById('ruxFavToggle')?.click();
  });
}

/* =========================================================
   BOOT
   ========================================================= */
function boot() {
  renderTopNav();
  setupSidebarSearch();
  setupHeaderActions();
  initRuxGlobalControls();
  startFunctionalUiBridge();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.hash = '#/kokpit';
  route();
  tickClock(); setInterval(tickClock, 1000);
  refreshStatusBar(); setInterval(refreshStatusBar, 5_000);
}

boot();


// RUx v0.75.15-heatmap-chart-fidelity-side-density-20260524 — force visible version refresh after shell render
window.addEventListener('DOMContentLoaded', () => {
  try { installErrorReporter(); } catch {}
  applyRuxVersionBadges();
  setTimeout(applyRuxVersionBadges, 250);
  setTimeout(applyRuxVersionBadges, 1200);
});
