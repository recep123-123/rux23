/* RUx — Coin Pano Chart Entry & 2000 Candle Fix */
import { State, fetchMarket, fetchNews, el, fmtPrice, fmtPct, ema, toast } from './api.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { analyzeLiveMarketSignal, makeRuxDecisionSnapshot, manualRiskSuggestion, simulateSignalTracking, statusClass } from './rux_core.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { ICN, statCard, card, pageHead, sparkline } from './components.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { makeCandleChart, normalizeCandleInput } from './charts.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { subscribeLive, unsubscribeLive, isWebSocketAvailable } from './rux_ws.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';
import { triggerAddAlertFlow, addDashboardWidget, addToWatchlist, getAlerts, getDashboardWidgets } from './rux_actions.js?v=0.75.13-heatmap-spacing-premium-pass-20260524';

export async function renderCoinPano(host, params) {
  host.innerHTML = '';
  const sym = (params?.symbol || State.symbol || 'BTCUSDT').toUpperCase();
  const tf = (params?.tf || State.tf || '4h');
  if (State.symbol !== sym) State.setSymbol(sym);
  if (State.tf !== tf) State.setTf(tf);

  host.appendChild(pageHead({
    title: sym + ' COIN PANO',
    fav: false,
    actions: []
  }));

  const loading = el('div', { class: 'card section rux-live-loading' },
    el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'CANLI COIN VERİSİ'), el('span', { class: 'tag cyan' }, 'YÜKLENİYOR')),
    el('div', { class: 'small muted' }, sym + ' · ' + (State.tf || '4h') + ' canlı veri router kontrol ediliyor...')
  );
  host.appendChild(loading);

  const live = await loadCoinPanoLiveSnapshot(sym, State.tf || '4h');
  loading.remove();

  host.appendChild(buildLiveStatsRow(sym, live));

  // A15+A16 — Canlı WebSocket akışı kartı (Binance + Hyperliquid cross-check).
  host.appendChild(buildLiveWsCard(sym));

  const row = el('div', { class: 'row fr-3-1 section' });
  row.appendChild(buildChart(sym));
  row.appendChild(buildQuickLinks());
  host.appendChild(row);

  const row2 = el('div', { class: 'row fr-1-1-2 section' });
  row2.appendChild(buildTradePlan(sym, live));
  row2.appendChild(buildLadder(sym, live));
  row2.appendChild(buildNews(sym));
  host.appendChild(row2);

  host.appendChild(buildRuxCoinEngine(sym));
}

function normalizeLiveCandles(data) {
  return normalizeCandleInput(data?.candles || data?.ohlcv || data?.spot?.candles || [])
    .filter(c => Number.isFinite(Number(c.close)))
    .sort((a, b) => a.time - b.time);
}

async function loadCoinPanoLiveSnapshot(sym, tf) {
  let data = null;
  try { data = await fetchMarket(sym, tf, 360); } catch {}
  const candles = normalizeLiveCandles(data);
  const tickerPrice = Number(data?.ticker?.price || data?.spot?.ticker?.price || candles.at(-1)?.close || 0);
  const liveOk = Boolean(data && (candles.length >= 60 || tickerPrice));
  if (!liveOk || candles.length < 60) {
    return {
      ok: false,
      partial: Boolean(tickerPrice || candles.length),
      data,
      candles,
      price: tickerPrice || null,
      source: data?.source || data?.market || 'Canlı veri yok',
      reason: candles.length ? `Yetersiz mum: ${candles.length}/60` : 'OHLCV alınamadı',
    };
  }
  const normalized = { ...data, candles, ohlcv: candles };
  const snap = analyzeLiveMarketSignal({ symbol: sym, tf, marketData: normalized });
  // analyzeLiveMarketSignal normalde demo fallback üretebilir; Coin Pano'da demo sinyal istemiyoruz.
  if (!snap?.live) {
    return { ok: false, partial: true, data: normalized, candles, price: tickerPrice, source: normalized.source || 'Canlı veri kısıtlı', reason: snap?.warning || 'Sinyal için veri yetersiz' };
  }
  return { ok: true, data: normalized, candles, snap, price: snap.price || tickerPrice, source: normalized.source || 'Market Router' };
}

function safePctFromTicker(data, snap) {
  const candidates = [
    data?.ticker?.priceChangePercent,
    data?.ticker?.change,
    data?.spot?.ticker?.priceChangePercent,
    data?.spot?.ticker?.change,
    snap?.change24h,
    data?.change24h,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const price = Number(data?.ticker?.price ?? data?.spot?.ticker?.price);
  const prev = Number(data?.ticker?.openPrice ?? data?.ticker?.prevClosePrice ?? data?.spot?.ticker?.openPrice ?? data?.spot?.ticker?.prevClosePrice);
  if (Number.isFinite(price) && Number.isFinite(prev) && prev) return ((price - prev) / prev) * 100;
  return null;
}

function safeAbsUsdChange(data, price, pct) {
  const direct = [data?.ticker?.priceChange, data?.spot?.ticker?.priceChange, data?.priceChange];
  for (const raw of direct) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return Number.isFinite(price) && Number.isFinite(pct) ? price * pct / 100 : null;
}

function fmtCompact(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  const abs = Math.abs(x);
  if (abs >= 1e12) return (x / 1e12).toFixed(d) + 'T';
  if (abs >= 1e9) return (x / 1e9).toFixed(d) + 'B';
  if (abs >= 1e6) return (x / 1e6).toFixed(d) + 'M';
  if (abs >= 1e3) return (x / 1e3).toFixed(d) + 'K';
  return x.toFixed(abs >= 100 ? 0 : d);
}

function fmtUsd(n) {
  const x = Number(n);
  return Number.isFinite(x) ? '$' + fmtPrice(x) : '—';
}

function cleanDirection(direction = '') {
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG')) return 'LONG / AL';
  if (d.includes('SHORT')) return 'SHORT / SAT';
  if (d.includes('BEKLE')) return 'BEKLE';
  return d || '—';
}

function signalTone(direction = '') {
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG') || d.includes('AL')) return 'pos';
  if (d.includes('SHORT') || d.includes('SAT')) return 'neg';
  return 'warn';
}

function dataTone(score = 0, inverse = false) {
  const n = Number(score) || 0;
  if (inverse) return n >= 70 ? 'neg' : n >= 45 ? 'warn' : 'pos';
  if (n >= 75) return 'pos';
  if (n >= 50) return 'warn';
  return 'neg';
}

function hasActionableDirectionalPlan(snapshot) {
  if (!snapshot) return false;
  const direction = String(snapshot.direction || '').toUpperCase();
  const hasDirection = direction.includes('LONG') || direction.includes('SHORT');
  const score = Number(snapshot.final?.score);
  const noTradeScore = Number(snapshot.noTrade?.score ?? snapshot.filters?.noTradeScore ?? 0);
  const dataScore = Number(snapshot.data?.score ?? snapshot.dataConfidence ?? 100);
  const label = String(snapshot.final?.label || snapshot.signalLevel || '').toUpperCase();
  const blocked = label.includes('NO-TRADE') || label.includes('DANGER') || label.includes('BLOCK') || noTradeScore >= 70 || dataScore < 50;
  const statusOk = score >= 70 || label.includes('PREPARE') || label.includes('VALID') || label.includes('SIGNAL') || label.includes('HAZIR');
  return hasDirection && statusOk && !blocked;
}

function buildSignalStickerCard(direction = '', sub = '') {
  const tone = signalTone(direction);
  // Alt klasör (public/assets) GitHub yüklemesinde sorun çıkardığı için sticker
  // resimleri inline SVG ile değiştirildi. Artık public/ düz yapıda (alt klasör yok).
  const bull = `<svg viewBox="0 0 64 64" width="72" height="72" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14 38c0-8 6-14 14-14h8c8 0 14 6 14 14v6c0 4-3 7-7 7H21c-4 0-7-3-7-7z" fill="#22c55e" opacity="0.18"/><path d="M20 28l-6-8m30 8l6-8" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/><circle cx="25" cy="38" r="3" fill="#22c55e"/><circle cx="39" cy="38" r="3" fill="#22c55e"/><path d="M24 46c3 3 13 3 16 0" stroke="#22c55e" stroke-width="3" stroke-linecap="round"/></svg>`;
  const bear = `<svg viewBox="0 0 64 64" width="72" height="72" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="36" r="18" fill="#ef4444" opacity="0.18"/><circle cx="20" cy="22" r="5" fill="#ef4444" opacity="0.4"/><circle cx="44" cy="22" r="5" fill="#ef4444" opacity="0.4"/><circle cx="26" cy="34" r="3" fill="#ef4444"/><circle cx="38" cy="34" r="3" fill="#ef4444"/><path d="M40 44c-3-3-13-3-16 0" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/></svg>`;
  const artWrap = el('div', { class: 'rux-sticker-art' });
  artWrap.innerHTML = tone === 'neg' ? bear : bull;
  return el('div', { class: 'stat-card rux-sticker-card ' + tone },
    el('div', { class: 'rux-sticker-copy' },
      el('div', { class: 'label' }, 'SİNYAL'),
      el('div', { class: 'val ' + tone }, cleanDirection(direction)),
      el('div', { class: 'sub ' + tone }, sub || 'Plan yok')
    ),
    artWrap
  );
}

function buildConfidenceGauge(score = 0) {
  const s = Math.max(0, Math.min(100, Number(score) || 0));
  const tone = dataTone(s);
  const color = tone === 'pos' ? '#10b981' : tone === 'warn' ? '#f59e0b' : '#ef4444';
  const r = 14, c = 2 * Math.PI * r, offset = c * (1 - s / 100);
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('class', 'rux-score-gauge');
  const bg = document.createElementNS(svgNS, 'circle');
  bg.setAttribute('cx', '20'); bg.setAttribute('cy', '20'); bg.setAttribute('r', String(r));
  bg.setAttribute('fill', 'none'); bg.setAttribute('stroke', 'rgba(148,163,184,.18)'); bg.setAttribute('stroke-width', '4');
  const fg = document.createElementNS(svgNS, 'circle');
  fg.setAttribute('cx', '20'); fg.setAttribute('cy', '20'); fg.setAttribute('r', String(r));
  fg.setAttribute('fill', 'none'); fg.setAttribute('stroke', color); fg.setAttribute('stroke-width', '4');
  fg.setAttribute('stroke-linecap', 'round'); fg.setAttribute('stroke-dasharray', String(c)); fg.setAttribute('stroke-dashoffset', String(offset));
  fg.setAttribute('transform', 'rotate(-90 20 20)');
  const txt = document.createElementNS(svgNS, 'text');
  txt.setAttribute('x', '20'); txt.setAttribute('y', '23'); txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('fill', '#e6edf6'); txt.setAttribute('font-size', '10'); txt.setAttribute('font-weight', '800');
  txt.textContent = Math.round(s);
  svg.append(bg, fg, txt);
  return svg;
}

function buildConfidenceCard(score, sub = '') {
  const s = Number.isFinite(Number(score)) ? Number(score) : 0;
  const tone = dataTone(s);
  return el('div', { class: 'stat-card rux-confidence-card ' + tone },
    el('div', { class: 'rux-confidence-left' },
      el('div', { class: 'label' }, 'GÜVEN'),
      el('div', { class: 'val' }, Number.isFinite(s) ? Math.round(s) + ' / 100' : '—'),
      el('div', { class: 'sub ' + tone }, sub || 'Canlı güven yok')
    ),
    el('div', { class: 'rux-confidence-icon' }, buildConfidenceGauge(s))
  );
}

function wireLiveMiniRefresh(root, sym, refs) {
  const update = async () => {
    if (!root.isConnected) return;
    try {
      const d = await fetchMarket(sym, State.tf || '4h', 60);
      const price = Number(d?.ticker?.price ?? d?.spot?.ticker?.price ?? d?.candles?.at?.(-1)?.close);
      const pct = safePctFromTicker(d, null);
      const absMove = safeAbsUsdChange(d, price, pct);
      if (refs?.priceVal) refs.priceVal.textContent = Number.isFinite(price) ? fmtUsd(price) : '—';
      if (refs?.priceSub) refs.priceSub.textContent = d?.activeExchange || d?.source || 'Canlı ticker';
      if (refs?.pctVal) refs.pctVal.textContent = Number.isFinite(pct) ? fmtPct(pct) : '—';
      if (refs?.pctSub) refs.pctSub.textContent = Number.isFinite(absMove) ? ((absMove >= 0 ? '+ ' : '- ') + '$' + fmtPrice(Math.abs(absMove))) : 'Ticker bekleniyor';
      if (refs?.pctToneWrap) {
        refs.pctToneWrap.className = 'stat-card' + (Number.isFinite(pct) && pct < 0 ? ' tone-neg' : ' tone-pos');
        const iconBox = refs.pctToneWrap.querySelector('.ic-box');
        if (iconBox) {
          iconBox.classList.remove('green', 'red');
          iconBox.classList.add(Number.isFinite(pct) && pct < 0 ? 'red' : 'green');
        }
        const subEl = refs.pctToneWrap.querySelector('.sub');
        if (subEl) subEl.className = 'sub ' + (Number.isFinite(pct) && pct < 0 ? 'neg' : 'pos');
      }
    } catch {}
  };
  update();
  const timer = setInterval(() => { if (!document.hidden) update(); if (!root.isConnected) clearInterval(timer); }, 10000);
}

function buildLiveStatsRow(sym, live) {
  const snap = live?.snap;
  const data = live?.data;
  const price = Number(live?.price || snap?.price || data?.ticker?.price || data?.spot?.ticker?.price);
  const pct = safePctFromTicker(data, snap);
  const absMove = safeAbsUsdChange(data, price, pct);
  const funding = Number(data?.derivatives?.fundingRate);
  const markPrice = Number(data?.derivatives?.markPrice || data?.basis?.markPrice || price);
  const oiContracts = Number(data?.derivatives?.openInterest);
  const oiNotional = Number.isFinite(oiContracts) && Number.isFinite(markPrice) ? oiContracts * markPrice : null;
  const deltaPct = Number(snap?.technicals?.deltaPct ?? snap?.orderflow?.deltaPct);
  const cvdProxy = Number(snap?.orderflow?.cvdProxy);
  const finalScore = Number(snap?.final?.score);
  const dataScore = Number(snap?.data?.score ?? data?.quality?.confidence);

  const stats = el('div', { class: 'stat-row cols-8 section', 'data-live-symbol': sym });
  const refs = {};
  refs.priceVal = el('span', {}, Number.isFinite(price) ? fmtUsd(price) : '—');
  refs.priceSub = el('span', {}, live?.ok ? (data?.activeExchange || data?.source || 'Canlı ticker') : (live?.reason || 'Canlı veri yok'));
  stats.appendChild(statCard({ icon: ICN.bitcoin(18), iconColor: 'yellow', label: 'FİYAT', value: refs.priceVal, sub: refs.priceSub }));
  refs.pctVal = el('span', {}, Number.isFinite(pct) ? fmtPct(pct) : '—');
  refs.pctSub = el('span', {}, Number.isFinite(absMove) ? (absMove >= 0 ? '+ ' : '- ') + '$' + fmtPrice(Math.abs(absMove)) : 'Ticker bekleniyor');
  const pctCard = statCard({ icon: ICN.trend(18), iconColor: pct >= 0 ? 'green' : 'red', label: '24S DEĞİŞİM', value: refs.pctVal, sub: refs.pctSub, subColor: pct >= 0 ? 'pos' : 'neg' });
  pctCard.classList.add(pct >= 0 ? 'tone-pos' : 'tone-neg');
  refs.pctToneWrap = pctCard;
  stats.appendChild(pctCard);
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: '', label: 'REJİM', value: el('span', { class: 'regime birikim' }, snap?.regime?.active || '—'), sub: snap?.regime?.uncertainty != null ? 'Belirsizlik ' + Math.round(snap.regime.uncertainty) + '/100' : 'Canlı rejim yok' }));
  stats.appendChild(buildSignalStickerCard(snap?.direction, snap?.final?.label || 'Plan yok'));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: '', label: 'FUNDING', value: Number.isFinite(funding) ? fmtPct(funding * 100, 4) : '—', sub: Number.isFinite(funding) ? (funding >= 0 ? 'Pozitif / long maliyeti' : 'Negatif / short maliyeti') : 'Perp verisi yok', subColor: funding >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: deltaPct >= 0 ? 'green' : 'red', label: 'CVD / DELTA', value: Number.isFinite(deltaPct) ? fmtPct(deltaPct, 2) : (Number.isFinite(cvdProxy) ? fmtCompact(cvdProxy) : '—'), sub: snap?.orderflow?.label || 'CVD kaynağı yok', subColor: deltaPct >= 0 ? 'pos' : 'neg' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'cyan', label: 'OPEN INTEREST', value: Number.isFinite(oiNotional) ? '$' + fmtCompact(oiNotional, 2) : Number.isFinite(oiContracts) ? fmtCompact(oiContracts, 2) : '—', sub: Number.isFinite(oiContracts) ? 'Kontrat: ' + fmtCompact(oiContracts, 2) : 'OI verisi yok' }));
  stats.appendChild(buildConfidenceCard(Number.isFinite(finalScore) ? finalScore : dataScore, snap?.data?.label || live?.reason || 'Canlı güven yok'));
  wireLiveMiniRefresh(stats, sym, refs);
  return stats;
}


function buildActionVisibilityCard(sym) {
  const alertCount = getAlerts().filter(a => String(a.symbol || '').toUpperCase() === sym).length;
  const widgetCount = getDashboardWidgets().filter(w => String(w.symbol || '').toUpperCase() === sym).length;
  return el('div', { class: 'card section rux-action-status-card' },
    el('div', { class: 'card-head' },
      el('div', { class: 'card-title' }, 'RUx AKSİYON BAĞLANTILARI'),
      el('span', { class: 'tag green' }, 'AKTİF')
    ),
    el('div', { class: 'row cols-4' },
      el('div', { class: 'rux-action-mini' }, el('div', { class: 'tiny muted' }, 'ALERT OLUŞTUR'), el('div', { class: 'bold mt-2' }, alertCount + ' kayıt'), el('div', { class: 'small muted mt-2' }, 'Sistem > Alarm Yönetimi')), 
      el('div', { class: 'rux-action-mini' }, el('div', { class: 'tiny muted' }, 'WIDGET EKLE'), el('div', { class: 'bold mt-2' }, widgetCount + ' kayıt'), el('div', { class: 'small muted mt-2' }, 'Kokpit > RUx Aksiyon Merkezi')), 
      el('div', { class: 'rux-action-mini' }, el('div', { class: 'tiny muted' }, 'İZLEME LİSTESİ'), el('div', { class: 'bold mt-2' }, sym), el('div', { class: 'small muted mt-2' }, 'Alarm ile otomatik eklenir')), 
      el('div', { class: 'rux-action-mini' }, el('div', { class: 'tiny muted' }, 'EMİR MODU'), el('div', { class: 'bold mt-2 neg' }, 'KAPALI'), el('div', { class: 'small muted mt-2' }, 'Manuel takip'))
    )
  );
}

function buildChart(sym) {
  const RANGE_CONFIGS = {
    '5dk': { tf: '5m', bars: 2000, label: '5 dakika' },
    '15dk': { tf: '15m', bars: 2000, label: '15 dakika' },
    '1S': { tf: '1h', bars: 2000, label: '1 saat' },
    '4S': { tf: '4h', bars: 2000, label: '4 saat' },
    '1G': { tf: '1d', bars: 2000, label: '1 gün' },
    '1H': { tf: '1w', bars: 2000, label: '1 hafta' },
    '1A': { tf: '1M', bars: 1200, label: '1 ay' },
  };
  const labels = Object.keys(RANGE_CONFIGS);
  let activeRange = tfToDefaultRange(State.tf || '4h');

  const wrap = el('div', { class: 'card' });
  const pairEl = el('span', { class: 'pair' }, sym + ' · ' + RANGE_CONFIGS[activeRange].tf + ' · RUx');
  const ohlcEl = el('span', { class: 'ohlc' }, ' Veri yükleniyor...');
  wrap.appendChild(el('div', { class: 'chart-toolbar' }, pairEl, ohlcEl));

  const legend = el('div', { class: 'chart-legend' });
  const legendRefs = {};
  [
    ['ema20', '#06b6d4', 'EMA 20'],
    ['ema50', '#f97316', 'EMA 50'],
    ['ema100', '#eab308', 'EMA 100'],
    ['ema200', '#a78bfa', 'EMA 200'],
    ['vwap', '#22d3ee', 'VWAP'],
    ['poc', '#10b981', 'POC'],
    ['r1', '#ef4444', 'R1'],
    ['s1', '#10b981', 'S1'],
    ['s2', '#0d9488', 'S2'],
  ].forEach(([key, color, label]) => {
    const v = el('span', { class: 'v' }, '—');
    legendRefs[key] = v;
    legend.appendChild(el('span', { class: 'lk' }, el('i', { style: 'background:' + color }), label + ' ', v));
  });
  wrap.appendChild(legend);

  const chartHost = el('div', { class: 'chart-host tall' });
  wrap.appendChild(chartHost);

  const rightStatus = el('div', { class: 'right' }, 'Yükleniyor...');
  const pills = labels.map(label => el('button', { type: 'button', class: 'pill' + (label === activeRange ? ' active' : ''), 'data-range': label }, label));
  const emaToggle = el('button', { type: 'button', class: 'pill active rux-ema-toggle' }, 'EMA');
  wrap.appendChild(el('div', { class: 'chart-bottom-bar' }, [...pills, emaToggle], rightStatus));

  const setActivePill = () => {
    pills.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-range') === activeRange));
  };

  const loadRange = async (rangeLabel) => {
    const cfg = RANGE_CONFIGS[rangeLabel] || RANGE_CONFIGS['4S'];
    activeRange = rangeLabel;
    State.setTf(cfg.tf);
    setActivePill();
    pairEl.textContent = sym + ' · ' + cfg.tf + ' · RUx';
    rightStatus.textContent = 'Yükleniyor...';
    chartHost.innerHTML = '<div class="empty"><span class="loader"></span> Grafik verisi alınıyor...</div>';

    let rawCandles = [];
    let source = 'fallback';
    let ticker = null;
    try {
      const d = await fetchMarket(sym, cfg.tf, Math.min(2000, cfg.bars));
      rawCandles = normalizeCandleInput(d?.candles || d?.ohlcv || []);
      source = d?.source || d?.market || 'canlı veri';
      ticker = d?.ticker || null;
    } catch {}
    if (rawCandles.length < 10) {
      chartHost.innerHTML = '<div class="empty">Canlı grafik verisi alınamadı. Demo mum üretilmedi.</div>';
      rightStatus.textContent = 'Canlı veri yok';
      return;
    }
    const fullCandles = rawCandles.slice().sort((a, b) => a.time - b.time);
    const candles = fullCandles.slice(-(cfg.bars || fullCandles.length));
    if (candles.length < 10) {
      chartHost.innerHTML = '<div class="empty">Grafik için yeterli mum verisi yok.</div>';
      rightStatus.textContent = 'Veri yetersiz';
      return;
    }

    const { chart, series } = makeCandleChart(chartHost, { rightPriceScale: { borderColor: 'rgba(148,163,184,0.10)', scaleMargins: { top: 0.07, bottom: 0.12 } } });
    series.setData(candles);
    const emaSeries = [];
    emaSeries.push(addEmaLineFromFull(chart, fullCandles, candles, 20, '#06b6d4', legendRefs.ema20));
    emaSeries.push(addEmaLineFromFull(chart, fullCandles, candles, 50, '#f97316', legendRefs.ema50));
    emaSeries.push(addEmaLineFromFull(chart, fullCandles, candles, 100, '#eab308', legendRefs.ema100));
    emaSeries.push(addEmaLineFromFull(chart, fullCandles, candles, 200, '#a78bfa', legendRefs.ema200));
    let emaVisible = true;
    const syncEmaVisibility = () => {
      emaToggle.classList.toggle('active', emaVisible);
      legend.classList.toggle('is-dimmed', !emaVisible);
      emaSeries.forEach(line => { try { line.applyOptions({ visible: emaVisible }); } catch {} });
    };
    emaToggle.onclick = () => { emaVisible = !emaVisible; syncEmaVisibility(); };
    syncEmaVisibility();

    const signalSnapshot = analyzeLiveMarketSignal({
      symbol: sym,
      tf: cfg.tf,
      marketData: { candles: fullCandles, ticker, source, market: source },
    });
    const chartOverlay = buildChartTradeOverlay(candles, signalSnapshot);
    addTradePriceLines(series, chartOverlay);

    const last = candles.at(-1);
    const first = candles[0];
    const delta = last.close - first.close;
    const pct = first.close ? delta / first.close * 100 : 0;
    ohlcEl.replaceChildren(
      ' A', el('span', { class: last.open >= first.open ? 'up' : 'dn' }, fmtPrice(last.open)),
      ' Y', el('span', {}, fmtPrice(last.high)),
      ' D', el('span', { class: 'dn' }, fmtPrice(last.low)),
      ' K', el('span', { class: last.close >= last.open ? 'up' : 'dn' }, fmtPrice(last.close)),
      el('span', { class: (delta >= 0 ? 'pos' : 'neg') + ' bold' }, ' ' + (delta >= 0 ? '+' : '') + fmtPrice(delta) + ' (' + fmtPct(pct) + ')')
    );

    const ind = computeChartLevels(candles);
    legendRefs.vwap.textContent = fmtPrice(ind.vwap);
    legendRefs.poc.textContent = fmtPrice(ind.poc);
    legendRefs.r1.textContent = fmtPrice(ind.r1);
    legendRefs.s1.textContent = fmtPrice(ind.s1);
    legendRefs.s2.textContent = fmtPrice(ind.s2);

    try {
      const priceLine = chart.addLineSeries({ color: '#ef4444', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      priceLine.setData(candles.map(c => ({ time: c.time, value: last.close })));
    } catch {}

    const redrawZones = () => drawChartZones(chartHost, series, chartOverlay);
    chart.timeScale().fitContent();
    setTimeout(redrawZones, 80);
    try { chart.timeScale().subscribeVisibleLogicalRangeChange(() => requestAnimationFrame(redrawZones)); } catch {}
    try { chart.timeScale().subscribeVisibleTimeRangeChange(() => requestAnimationFrame(redrawZones)); } catch {}
    try { chart.subscribeCrosshairMove(() => requestAnimationFrame(redrawZones)); } catch {}
    try { new ResizeObserver(() => requestAnimationFrame(redrawZones)).observe(chartHost); } catch {}
    ['wheel','mouseup','mouseleave'].forEach(evt => chartHost.addEventListener(evt, () => setTimeout(redrawZones, 20), { passive: true }));
    const ts = new Date(last.time * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const srcText = String(source).replace('LIVE ', '');
    rightStatus.textContent = ts + ' (UTC+3) · ' + cfg.label + ' · ' + candles.length + '/' + cfg.bars + ' mum · ' + srcText;
  };

  pills.forEach(btn => btn.addEventListener('click', () => loadRange(btn.getAttribute('data-range'))));
  setTimeout(() => loadRange(activeRange), 40);
  return wrap;
}

function tfToDefaultRange(tf) {
  if (tf === '5m') return '5dk';
  if (tf === '15m') return '15dk';
  if (tf === '1h') return '1S';
  if (tf === '4h') return '4S';
  if (tf === '1d') return '1G';
  if (tf === '1w') return '1H';
  if (tf === '1M') return '1A';
  return '4S';
}

function tfStepSeconds(tf) {
  return { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800, '1M': 2592000 }[tf] || 14400;
}

function makeFallbackCandles(tf = '4h', count = 300) {
  let p = 76000;
  const step = tfStepSeconds(tf);
  const now = Math.floor(Date.now()/1000);
  const candles = [];
  for (let i = 0; i < count; i++) {
    const drift = Math.sin(i / 19) * 80;
    const o = p;
    const c = Math.max(1, p + drift + (Math.random()-0.46)*700);
    candles.push({ time: now - (count-i)*step, open: o, high: Math.max(o,c) + Math.random()*200, low: Math.min(o,c) - Math.random()*200, close: c, volume: 1500+Math.random()*2000 });
    p = c;
  }
  return candles;
}

function addEmaLineFromFull(chart, fullCandles, visibleCandles, period, color, legendEl) {
  const closes = fullCandles.map(c => c.close);
  const values = ema(closes, period);
  const visibleTimes = new Set(visibleCandles.map(c => c.time));
  const data = fullCandles.map((c, i) => ({ time: c.time, value: values[i] }))
    .filter(p => visibleTimes.has(p.time) && p.value != null && Number.isFinite(p.value));
  const line = chart.addLineSeries({ color, lineWidth: period === 200 ? 1.2 : 1.5, priceLineVisible: false, lastValueVisible: false });
  line.setData(data);
  const latest = data.at(-1)?.value;
  if (legendEl) legendEl.textContent = latest ? fmtPrice(latest) : '—';
  return line;
}

function computeChartLevels(candles) {
  const sumVol = candles.reduce((s, c) => s + (c.volume || 0), 0);
  const vwap = sumVol ? candles.reduce((s, c) => s + (((c.high + c.low + c.close) / 3) * (c.volume || 0)), 0) / sumVol : candles.at(-1)?.close;
  const highs = candles.map(c => c.high).filter(Number.isFinite);
  const lows = candles.map(c => c.low).filter(Number.isFinite);
  const high = Math.max(...highs), low = Math.min(...lows), close = candles.at(-1)?.close || 0;
  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;
  const s2 = pivot - (high - low);
  return { vwap, poc: volumePoc(candles), r1, s1, s2 };
}

function volumePoc(candles) {
  const highs = candles.map(c => c.high).filter(Number.isFinite);
  const lows = candles.map(c => c.low).filter(Number.isFinite);
  const high = Math.max(...highs), low = Math.min(...lows);
  if (!Number.isFinite(high) || !Number.isFinite(low) || high <= low) return candles.at(-1)?.close || 0;
  const bins = 80;
  const step = (high - low) / bins;
  const hist = new Array(bins).fill(0);
  candles.forEach(c => {
    const price = (c.high + c.low + c.close) / 3;
    const idx = Math.max(0, Math.min(bins - 1, Math.floor((price - low) / step)));
    hist[idx] += c.volume || 1;
  });
  const maxIdx = hist.reduce((best, v, i) => v > hist[best] ? i : best, 0);
  return low + step * (maxIdx + 0.5);
}


function parsePrice(text) {
  const m = String(text ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function percentileLocal(values, p = 0.5) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = Math.min(arr.length - 1, Math.max(0, (arr.length - 1) * p));
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
}

function avgTrueRangeLocal(candles, period = 14) {
  const clean = candles.filter(c => Number.isFinite(c.high) && Number.isFinite(c.low) && Number.isFinite(c.close));
  if (clean.length < 2) return 0;
  const tr = clean.map((c, i) => {
    const p = i > 0 ? clean[i - 1] : c;
    return Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
  }).slice(-period);
  return tr.reduce((a, b) => a + b, 0) / (tr.length || 1);
}

function buildChartTradeOverlay(candles, snapshot) {
  const recent = candles.slice(-120);
  const last = candles.at(-1);
  const price = Number(snapshot?.price || last?.close || 0);
  const atrNow = avgTrueRangeLocal(recent, 14) || Math.max(1, price * 0.01);
  const zoneHalf = Math.max(atrNow * 0.32, price * 0.0014);
  const supportMid = percentileLocal(recent.map(c => c.low), 0.12);
  const resistanceMid = percentileLocal(recent.map(c => c.high), 0.88);
  const entryNums = String(snapshot?.manualPlan?.entryZone || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || [];
  const entryLow = Number(entryNums[0]);
  const entryHigh = Number(entryNums[1]);
  const direction = String(snapshot?.direction || '').toUpperCase();
  const longMode = direction.includes('LONG');
  const shortMode = direction.includes('SHORT');
  const showEntryZone = hasActionableDirectionalPlan(snapshot) && Number.isFinite(entryLow) && Number.isFinite(entryHigh) && (longMode || shortMode);
  const tp1 = showEntryZone ? parsePrice(snapshot?.manualPlan?.tp1) : null;
  const tp2 = showEntryZone ? parsePrice(snapshot?.manualPlan?.tp2) : null;
  const tp3 = showEntryZone ? parsePrice(snapshot?.manualPlan?.tp3) : null;
  const stop = showEntryZone ? parsePrice(snapshot?.manualPlan?.stopReference) : null;

  return {
    zones: [
      { type: 'resistance', label: 'DİRENÇ BÖLGESİ', top: resistanceMid + zoneHalf, bottom: resistanceMid - zoneHalf },
      { type: 'support', label: 'DESTEK BÖLGESİ', top: supportMid + zoneHalf, bottom: supportMid - zoneHalf },
      ...(showEntryZone ? [{ type: 'entry', label: longMode ? 'LONG ENTRY BÖLGESİ' : 'SHORT ENTRY BÖLGESİ', top: Math.max(entryLow, entryHigh), bottom: Math.min(entryLow, entryHigh) }] : []),
    ].filter(z => Number.isFinite(z.top) && Number.isFinite(z.bottom) && z.top > z.bottom),
    lines: [
      { key: 'tp1', title: 'TP1', price: tp1, color: '#22c55e' },
      { key: 'tp2', title: 'TP2', price: tp2, color: '#14b8a6' },
      { key: 'tp3', title: 'TP3', price: tp3, color: '#06b6d4' },
      { key: 'stop', title: 'STOP', price: stop, color: '#ef4444' },
    ].filter(x => Number.isFinite(x.price)),
  };
}

function addTradePriceLines(series, overlay) {
  if (!series || !overlay?.lines?.length || typeof series.createPriceLine !== 'function') return;
  overlay.lines.forEach(line => {
    try {
      series.createPriceLine({
        price: line.price,
        color: line.color,
        lineWidth: line.key === 'stop' ? 2 : 1,
        lineStyle: line.key === 'stop' ? 0 : 2,
        axisLabelVisible: true,
        title: line.title,
      });
    } catch {}
  });
}

function drawChartZones(chartHost, series, overlay) {
  if (!chartHost || !series || !overlay?.zones?.length || typeof series.priceToCoordinate !== 'function') return;
  chartHost.querySelectorAll('.rux-chart-zone-layer').forEach(n => n.remove());
  const layer = el('div', { class: 'rux-chart-zone-layer' });
  overlay.zones.forEach(zone => {
    const yTop = series.priceToCoordinate(zone.top);
    const yBottom = series.priceToCoordinate(zone.bottom);
    if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) return;
    const top = Math.min(yTop, yBottom);
    const height = Math.max(7, Math.abs(yBottom - yTop));
    const node = el('div', { class: 'rux-zone ' + zone.type, style: `top:${top}px;height:${height}px;` },
      el('span', {}, zone.label)
    );
    layer.appendChild(node);
  });
  chartHost.appendChild(layer);
}

function buildQuickLinks() {
  const links = {
    'PRICE ACTION / PA': [
      ['PA Scanner','#/pa'],['PA Kalite','#/pa'],['PA Detay','#/pa'],['PA MTF','#/pa'],
      ['PA Backtest','#/backtest'],
    ],
    'AKIŞ / TEYIT': [
      ['CVD / Likidite','#/akis-flow'],['Funding / OI','#/akis-flow'],['Hyperliquid','#/akis-flow'],['VPA','#/rvol'],
      ['Fakeout','#/akis-flow'],
    ],
    'SMART MONEY / SMC': [
      ['Smart Money','#/akis-smart'],['SMC Mini','#/smc'],['Formasyonlar','#/smc'],['Destek / Direnç','#/pa'],
      ['OTE / Fibonacci','#/ote-giris'],
    ],
    'PLAN / RİSK': [
      ['Trade Planı','#/risk'],['Risk Planı','#/risk'],['Senaryolar','#/pa'],['API Durumu','#/sistem'],
    ],
  };
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'card-title' }, 'HIZLI ERİŞİM'));
  const grid = el('div', { style: 'display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-top:10px;' });
  Object.entries(links).forEach(([sec, items]) => {
    const col = el('div', { class: 'qg-col' });
    col.appendChild(el('div', { class: 'qg-section' }, sec));
    items.forEach(([name, href]) => {
      const a = el('a', { href, class: 'qg-link' }, ICN.layers(11), el('span', {}, name), el('span', { class: 'arrow' }, ICN.chev(10, 'right')));
      col.appendChild(a);
    });
    grid.appendChild(col);
  });
  wrap.appendChild(grid);
  return wrap;
}

function buildTradePlan(sym, live) {
  const snap = live?.snap;
  const risk = snap ? manualRiskSuggestion({ finalScore: snap.final?.score, regime: snap.regime?.active, direction: snap.direction, dataConfidence: snap.data?.score, portfolioHeat: 0 }) : null;
  const source = live?.source || live?.data?.source || '—';
  const rows = snap ? [
    ['Coin', sym, ''],
    ['Yön', cleanDirection(snap.direction), signalTone(snap.direction)],
    ['Giriş Bölgesi', snap.manualPlan?.entryZone || '—', ''],
    ['Preferred Entry', snap.manualPlan?.preferredEntry || '—', ''],
    ['Zarar Durdurma', snap.manualPlan?.stopReference || '—', 'neg'],
    ['Ana Hedef (TP1)', snap.manualPlan?.tp1 || '—', 'pos'],
    ['Ana Hedef 2 (TP2)', snap.manualPlan?.tp2 || '—', 'pos'],
    ['Ana Hedef 3 (TP3)', snap.manualPlan?.tp3 || '—', 'pos'],
    ['Risk / Ödül', snap.manualPlan?.rrExpected || '—', ''],
    ['Tahmin Güveni', snap.confidence ? `${snap.confidence.tier} (${snap.confidence.score}/100)` : '—', snap.confidence?.tier === 'YÜKSEK' ? 'pos' : snap.confidence?.tier === 'DÜŞÜK' ? 'neg' : 'warn'],
    ['Güven Bandı', snap.calibrated ? `%${snap.calibrated.predictionBand[0]} - %${snap.calibrated.predictionBand[1]}` : '—', 'muted'],
    ['Önerilen Risk Çarpanı', snap.confidence ? '×' + snap.confidence.riskMultiplier : '—', snap.confidence?.riskMultiplier >= 1 ? 'pos' : 'warn'],
    ['Ampirik Edge', snap.empiricalEdge && snap.empiricalEdge.sampleSize > 0 ? `WR%${snap.empiricalEdge.winRate} · EV ${snap.empiricalEdge.expectancy >= 0 ? '+' : ''}${snap.empiricalEdge.expectancy}R · n=${snap.empiricalEdge.sampleSize}` : 'Geçmiş veri toplanıyor', snap.empiricalEdge?.expectancy > 0 ? 'pos' : snap.empiricalEdge?.expectancy < 0 ? 'neg' : 'muted'],
    ['Risk Önerisi', risk?.label || '—', risk?.maxPct > 0 ? 'pos' : 'warn'],
    ['Plan Durumu', snap.final?.label || '—', statusClass(snap.final?.score || 0)],
    ['Veri Kaynağı', source, 'muted'],
    ['Oluşturulma', new Date().toLocaleString('tr-TR'), 'muted'],
  ] : [
    ['Coin', sym, ''],
    ['Durum', 'CANLI VERİ YOK', 'neg'],
    ['Sebep', live?.reason || 'Market router cevap üretmedi', 'warn'],
    ['Veri Kaynağı', source, 'muted'],
    ['Plan', 'Üretilmedi', 'neg'],
  ];
  const w = el('div', { 'data-live-card': 'trade-plan', 'data-symbol': sym });
  rows.forEach(([k, v, c]) => w.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  return card({ title: 'TRADE PLANI', actions: [el('span', { class: 'tag ' + (snap ? 'green' : 'red') }, snap ? 'CANLI' : 'BLOKE')], body: w });
}

function buildLadder(sym, live) {
  const snap = live?.snap;
  const tbl = el('table', { class: 'tbl tbl-compact ladder-table', 'data-live-card': 'tp-sl-ladder', 'data-symbol': sym });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'HEDEF / STOP'),
    el('th', { class: 'r' }, 'FİYAT'),
    el('th', { class: 'r' }, 'MİKTAR (%)'),
    el('th', { class: 'r' }, 'KALAN (%)'),
    el('th', {}, 'DURUM'),
  )));
  const tb = el('tbody', {});
  if (!snap) {
    tb.appendChild(el('tr', {}, el('td', { colspan: 5, class: 'muted' }, 'Canlı sinyal planı yok. TP/SL merdiveni üretilmedi.')));
    tbl.appendChild(tb);
    return card({ title: 'TP / SL MERDİVENİ', actions: [el('span', { class: 'tag red' }, 'VERİ YOK')], body: tbl });
  }
  const rows = [
    ['SL', snap.manualPlan?.stopReference || '—', '—', '100.0%', 'AKTİF', 'red'],
    ['TP1', snap.manualPlan?.tp1 || '—', '30%', '70.0%', 'AKTİF', 'green'],
    ['TP2', snap.manualPlan?.tp2 || '—', '30%', '40.0%', 'AKTİF', 'green'],
    ['TP3', snap.manualPlan?.tp3 || '—', '25%', '15.0%', 'BEKLEMEDE', 'yellow'],
    ['Runner', snap.manualPlan?.doNotChase || '—', '15%', '0%', 'KOŞULLU', 'cyan'],
  ];
  rows.forEach(([k, p, m, kr, st, c]) => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'bold ' + (k === 'SL' ? 'neg' : 'pos') }, k),
      el('td', { class: 'r mono' }, p),
      el('td', { class: 'r mono' }, m),
      el('td', { class: 'r mono' }, kr),
      el('td', {}, el('span', { class: 'tag ' + c }, st)),
    ));
  });
  tbl.appendChild(tb);
  const progressPct = Math.max(0, Math.min(100, Math.round((Number(snap.final?.score || 0) / 100) * 35)));
  const prog = el('div', { class: 'mt-10' },
    el('div', { class: 'bar-h green', style: 'height:8px' }, el('i', { style: 'width:' + progressPct + '%' })),
    el('div', { class: 'flex between mt-6 small' }, el('span', { class: 'muted' }, 'Plan aktivasyon kalitesi: %' + progressPct), el('span', { class: 'muted mono' }, 'Entry: ' + (snap.manualPlan?.preferredEntry || '—')))
  );
  return card({ title: 'TP / SL MERDİVENİ', actions: [el('span', { class: 'tag green' }, 'CANLI PLAN')], body: el('div', {}, tbl, prog) });
}

function buildNews(sym) {
  const list = el('div', { 'data-live-card': 'coin-news', 'data-symbol': sym },
    el('div', { class: 'small muted' }, sym + ' haberleri canlı kaynaktan yükleniyor...')
  );
  const c = card({ title: 'COIN HABERLERİ', actions: [el('button', { class: 'btn sm ghost', on: { click: () => hydrateCoinPanoNews(list, sym, true) } }, ICN.refresh(12), 'YENİLE')], body: list });
  setTimeout(() => hydrateCoinPanoNews(list, sym, false), 30);
  return c;
}

function newsClass(it = {}) {
  const raw = String(it.category || it.sentiment_label || it.sentiment || it.provider || it.source || '').toLowerCase();
  if (raw.includes('macro') || raw.includes('fed') || raw.includes('cpi') || raw.includes('fomc')) return 'macro';
  if (raw.includes('chain') || raw.includes('telegram') || raw.includes('wallet')) return 'onchain';
  if (raw.includes('fund') || raw.includes('oi')) return 'funding';
  if (raw.includes('market') || raw.includes('piyasa')) return 'piyasa';
  return 'haber';
}

function newsLabel(it = {}) {
  const source = String(it.provider || it.source || '').toLowerCase();
  if (source.includes('telegram')) return 'TG';
  const cls = newsClass(it);
  if (cls === 'macro') return 'MAKRO';
  if (cls === 'onchain') return 'ON-CHAIN';
  if (cls === 'funding') return 'FUNDING';
  if (cls === 'piyasa') return 'PİYASA';
  return 'HABER';
}

function newsTime(it = {}) {
  const d = new Date(it.created_at || it.published_at || it.time || it.date || Date.now());
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

async function hydrateCoinPanoNews(list, sym, force = false) {
  list.innerHTML = '<div class="small muted">Canlı haber akışı alınıyor...</div>';
  try {
    const data = await fetchNews(sym, 'tr', 'global', { force, limit: 12 });
    const items = (Array.isArray(data?.items) ? data.items : []).filter(it => String(it.title_display || it.title_tr || it.title || it.headline || it.text || '').trim()).slice(0, 6);
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(el('div', { class: 'small muted' }, 'Bu coin için canlı haber bulunamadı. Demo haber gösterilmedi.'));
      return;
    }
    items.forEach(it => {
      const title = String(it.title_display || it.title_tr || it.title || it.headline || it.text || '').replace(/\s+/g, ' ').trim();
      const row = el('div', { style: 'display:grid; grid-template-columns:50px 1fr auto; gap:8px; padding:8px 0; border-bottom: 1px dashed var(--bd-1); font-size:12px;' },
        el('span', { class: 'mono small muted' }, newsTime(it)),
        el('div', {},
          el('div', { class: 'flex items-center gap-6' }, el('span', { class: 'chip-cat ' + newsClass(it) }, newsLabel(it)), el('span', {}, title.length > 120 ? title.slice(0, 117) + '…' : title)),
          el('div', { class: 'tiny muted mt-2' }, 'Kaynak: ' + (it.provider || it.source || data.provider || 'News Pulse'))
        ),
        el('span', { class: 'card-link' }, ICN.chev(10, 'right')),
      );
      if (it.url) row.addEventListener('click', () => window.open(it.url, '_blank', 'noopener,noreferrer'));
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = '';
    list.appendChild(el('div', { class: 'small muted' }, 'Canlı haber alınamadı. Demo BTC haberleri gösterilmedi.'));
  }
}


function buildRuxCoinEngine(sym) {
  const wrap = el('div', { class: 'card rux-compact-card section', 'data-rux-coin-engine': '1' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx COIN PLAN / TAKİP MOTORU'),
    el('span', { class: 'tag cyan' }, 'CANLI OHLCV')
  ));
  const body = el('div', { class: 'tiny muted' }, sym + ' için canlı veri bekleniyor...');
  wrap.appendChild(body);

  setTimeout(async () => {
    let snap;
    try {
      const data = await fetchMarket(sym, State.tf || '4h', 220);
      const candles = normalizeLiveCandles(data);
      if (candles.length < 60) throw new Error('Canlı OHLCV yetersiz: ' + candles.length + '/60');
      snap = analyzeLiveMarketSignal({ symbol: sym, tf: State.tf || '4h', marketData: { ...data, candles, ohlcv: candles } });
      if (!snap?.live) throw new Error(snap?.warning || 'RUx canlı snapshot üretmedi');
    } catch (err) {
      body.replaceChildren(
        el('div', { class: 'rux-compact-note neg' }, 'Canlı veri yetersiz olduğu için RUx Coin Motoru demo rapor üretmedi.'),
        el('div', { class: 'tiny muted mt-2' }, err?.message || 'Market router cevap vermedi')
      );
      return;
    }
    const risk = manualRiskSuggestion({ finalScore: snap.final?.score, regime: snap.regime?.active, direction: snap.direction, dataConfidence: snap.data?.score, portfolioHeat: 1.80 });
    const track = simulateSignalTracking(snap);
    body.replaceWith(renderRuxCoinEngineBody(snap, risk, track));
  }, 80);
  return wrap;
}

function ruxMetric(label, value, sub = '', klass = '') {
  return el('div', { class: 'rux-mini ' + klass },
    el('div', { class: 'rux-mini-label' }, label),
    el('div', { class: 'rux-mini-value' }, String(value ?? '—')),
    sub ? el('div', { class: 'tiny muted mt-2' }, sub) : null
  );
}

function planCell(label, value, klass = '') {
  return el('div', { class: 'rux-plan-cell ' + klass },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, String(value || '—'))
  );
}

function renderRuxCoinEngineBody(snap, risk, track) {
  const scoreClass = statusClass(snap.final?.score || 0);
  const noTradeClass = statusClass(snap.noTrade?.score || 0, true);
  const grid = el('div', { class: 'rux-compact-grid' },
    ruxMetric('Sinyal', snap.final?.label || '—', snap.direction || '', scoreClass),
    ruxMetric('Final Skor', (snap.final?.score ?? 0) + '/100', 'Setup + rejim + teyit', scoreClass),
    ruxMetric('Rejim', snap.regime?.active || '—', 'Olasılıksal mod', 'cyan'),
    ruxMetric('Veri Güveni', (snap.data?.score ?? 0) + '/100', snap.data?.label || '', statusClass(snap.data?.score || 0)),
    ruxMetric('İşlem Engeli', (snap.noTrade?.score ?? 0) + '/100', snap.noTrade?.label || '', noTradeClass),
    ruxMetric('PA/SMC Etkisi', (snap.pa?.score ?? snap.scores?.priceAction ?? 0) + '/100', snap.pa?.primarySetup || snap.pa?.label || 'Kural motoru', statusClass(snap.pa?.score ?? snap.scores?.priceAction ?? 0)),
    ruxMetric('Order Flow Etkisi', (snap.orderflow?.score ?? snap.scores?.orderflow ?? 0) + '/100', (snap.orderflow?.scoreImpactLabel ? snap.orderflow.scoreImpactLabel + ' · ' : '') + (snap.orderflow?.label || 'CVD/Delta proxy'), statusClass(snap.orderflow?.score ?? snap.scores?.orderflow ?? 0)),
    ruxMetric('Net-R', (snap.cost?.netR >= 0 ? '+' : '') + (snap.cost?.netR ?? '—') + 'R', 'Fee/spread/slippage sonrası', snap.cost?.netR >= 0 ? 'green' : 'neg')
  );

  const plan = el('div', { class: 'rux-plan-strip mt-10' },
    planCell('Entry Bölgesi', snap.manualPlan?.entryZone, 'cyan'),
    planCell('Preferred Entry', snap.manualPlan?.preferredEntry, 'cyan'),
    planCell('Stop Reference', snap.manualPlan?.stopReference, 'neg'),
    planCell('TP1 / TP2 / TP3', [snap.manualPlan?.tp1, snap.manualPlan?.tp2, snap.manualPlan?.tp3].filter(Boolean).join(' / '), 'pos'),
    planCell('RR Beklentisi', snap.manualPlan?.rrExpected, 'pos'),
    planCell('Kovalama Sınırı', snap.manualPlan?.doNotChase, 'warn'),
    planCell('Geçerlilik', snap.manualPlan?.validity, ''),
    planCell('Risk Önerisi', risk.label, risk.maxPct > 0 ? 'pos' : 'warn')
  );

  const trackBox = el('div', { class: 'rux-score-strip mt-10' },
    planCell('Lifecycle', track.state, track.state === 'DONDURULDU' ? 'neg' : 'cyan'),
    planCell('Entry Hit', track.entryZoneHit ? 'Evet' : 'Bekliyor', track.entryZoneHit ? 'pos' : 'warn'),
    planCell('Fill Model', track.fillModel, ''),
    planCell('MFE / MAE', `${track.mfeR}R / -${track.maeR}R`, ''),
    planCell('Time Stop', track.timeStop, '')
  );

  return el('div', {},
    grid,
    plan,
    trackBox,
    el('div', { class: 'rux-compact-note muted' }, 'Not: PA/SMC setup/teyit planına katkı verir. Order Flow varsayılan olarak gözlem modundadır; Ayarlar’dan skora bağlanabilir. RUx emir göndermez; manuel karar desteği üretir.')
  );
}

// A15+A16 — Canlı WebSocket akış kartı (Binance + Hyperliquid).
// WS yoksa/koparsa kart "REST modu" gösterir; mevcut akış bozulmaz.
function buildLiveWsCard(sym) {
  const wsAvail = isWebSocketAvailable();
  const priceEl = el('div', { class: 'rux-kpi-value', 'data-ws-price': '1' }, '—');
  const cvdEl = el('div', { class: 'rux-kpi-value', 'data-ws-cvd': '1' }, '—');
  const hlEl = el('div', { class: 'rux-kpi-value', 'data-ws-hl': '1' }, '—');
  const xEl = el('div', { class: 'rux-kpi-value', 'data-ws-cross': '1' }, '—');
  const statusTag = el('span', { class: 'tag ' + (wsAvail ? 'cyan' : 'yellow'), 'data-ws-status': '1' }, wsAvail ? 'BAĞLANIYOR' : 'REST MODU');

  const card = el('div', { class: 'card section', 'data-rux-source': 'LIVE' },
    el('div', { class: 'card-head' },
      el('div', { class: 'card-title' }, 'CANLI AKIŞ (WEBSOCKET)'),
      el('div', { class: 'flex gap-8' }, statusTag, el('span', { class: 'tag' }, 'Binance + Hyperliquid'))
    ),
    el('div', { class: 'rux-compact-grid' },
      el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'Binance Fiyat'), priceEl, el('div', { class: 'rux-kpi-sub muted' }, 'canlı tick')),
      el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'Canlı CVD'), cvdEl, el('div', { class: 'rux-kpi-sub muted' }, 'oturum içi delta')),
      el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'Hyperliquid Fiyat'), hlEl, el('div', { class: 'rux-kpi-sub muted' }, 'perp DEX')),
      el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'Borsa Uyumu'), xEl, el('div', { class: 'rux-kpi-sub muted' }, 'cross-exchange'))
    ),
    el('div', { class: 'rux-compact-note muted', 'data-ws-note': '1' }, wsAvail ? 'WebSocket bağlantısı kuruluyor; canlı tick verileri birazdan akacak.' : 'Tarayıcıda WebSocket yok; REST polling devrede.')
  );

  if (!wsAvail) return card;

  const fmtP = (v) => v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: v > 100 ? 2 : 5 });
  let lastRender = 0;
  const onUpdate = (s) => {
    const now = Date.now();
    if (now - lastRender < 250) return; // throttle UI
    lastRender = now;
    if (Number.isFinite(s.price)) priceEl.textContent = fmtP(s.price);
    if (Number.isFinite(s.liveCvd)) { cvdEl.textContent = (s.liveCvd >= 0 ? '+' : '') + s.liveCvd.toFixed(2); cvdEl.style.color = s.liveCvd >= 0 ? 'var(--green, #047857)' : 'var(--red, #8B0000)'; }
    if (Number.isFinite(s.hlPrice)) hlEl.textContent = fmtP(s.hlPrice);
    // Borsa uyumu: hem Binance hem HL fiyat varsa cross-check; yoksa tek kaynak göster
    const x = s.crossExchange;
    if (x && x.available) {
      xEl.textContent = x.agreement + ' (%' + x.divergencePct + ')';
      xEl.style.color = x.agreement === 'YÜKSEK' ? 'var(--green, #047857)' : x.agreement === 'ORTA' ? 'var(--yellow, #B97F38)' : 'var(--red, #8B0000)';
    } else if (Number.isFinite(s.hlPrice) && !Number.isFinite(s.price)) {
      xEl.textContent = 'Sadece HL';
      xEl.style.color = 'var(--muted, #64748B)';
    }
  };
  const onStatus = (st) => {
    const map = {
      live: ['LIVE', 'cyan'], connecting: ['BAĞLANIYOR', 'yellow'],
      reconnecting: ['YENİDEN BAĞLANIYOR', 'yellow'], error: ['HATA', 'red'],
      unavailable: ['REST MODU', 'yellow'],
      binance_blocked: ['HYPERLIQUID + REST', 'cyan']
    };
    const [txt, cls] = map[st.state] || ['—', 'cyan'];
    statusTag.textContent = txt;
    statusTag.className = 'tag ' + cls;
    const noteEl = card.querySelector('[data-ws-note]');
    if (st.state === 'binance_blocked' && noteEl) {
      noteEl.textContent = 'Binance WebSocket bu konumdan erişilemiyor (Türkiye kısıtı olabilir). Hyperliquid canlı + Binance REST devrede; veri akışı sürüyor.';
      // Binance fiyat slotunu REST son fiyatıyla doldur
      try {
        const restPrice = State.liveMarket?.ticker?.price || State.liveMarket?.[sym]?.ticker?.price;
        if (restPrice) priceEl.textContent = fmtP(restPrice) + ' (REST)';
      } catch {}
    } else if ((st.binanceLive || st.hyperLive) && noteEl) {
      noteEl.textContent = 'Canlı akış aktif. Binance: ' + (st.binanceLive ? 'bağlı' : 'kapalı') + ' · Hyperliquid: ' + (st.hyperLive ? 'bağlı' : 'kapalı') + '.';
    }
  };

  try {
    const ch = subscribeLive(sym, '1m', { onUpdate, onStatus });
    // Sayfa değişince aboneliği temizle (basit gözlemci)
    const cleanup = () => {
      if (!document.body.contains(card)) { try { unsubscribeLive(); } catch {}; obs.disconnect(); }
    };
    const obs = new MutationObserver(cleanup);
    obs.observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    statusTag.textContent = 'HATA';
    statusTag.className = 'tag red';
  }

  return card;
}
