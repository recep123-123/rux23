/* RUx — Türev Veri (Derivatives): Open Interest, Funding, CVD, Likidasyon, Heatmap.
   Tümü ücretsiz borsa API'lerinden (Binance ana, Bybit/OKX ek). Backend /api/derivs. */
import { State, fetchDerivs, fetchMarket, el, fmtPrice, fmtPct, fmtNum, toast } from './api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { ICN, statCard, card, pageHead, tag, sparkline } from './components.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

const PERIODS = ['5m', '15m', '1h', '4h'];
const GLOBAL_PERIODS = ['5m', '15m', '1h', '4h', '1d', '1w'];

// ═══════════ PROFESYONEL UI BİLEŞENLERİ ═══════════
// Üst durum şeridi: başlık + alt başlık + sağda durum rozetleri
function statusHeader(title, subtitle, badges = []) {
  const head = el('div', { class: 'derivs-header' });
  head.appendChild(el('div', { class: 'derivs-header-left' },
    el('div', { class: 'derivs-logo' }, 'RX'),
    el('div', {},
      el('div', { class: 'derivs-title' }, title),
      el('div', { class: 'derivs-subtitle' }, subtitle)
    )
  ));
  const badgeWrap = el('div', { class: 'derivs-badges' });
  badges.forEach(b => badgeWrap.appendChild(el('div', { class: 'derivs-badge' },
    el('div', { class: 'derivs-badge-label' }, b.label),
    el('div', { class: 'derivs-badge-value ' + (b.tone || '') }, b.dot ? el('span', { class: 'derivs-dot ' + (b.tone || '') }) : null, b.value)
  )));
  head.appendChild(badgeWrap);
  return head;
}

function scheduleOiViewportFit(shell, wrap) {
  if (!shell || !wrap) return;
  try {
    wrap.classList.remove('oi-fit-active');
    wrap.style.removeProperty('--oi-fit-scale');
    wrap.style.removeProperty('width');
    wrap.style.removeProperty('min-width');
    shell.style.height = 'auto';
  } catch {}
}

// KPI kartı: değer + mini sparkline + alt değişim
function kpiIcon(label = '') {
  const t = String(label).toLowerCase();
  if (t.includes('toplam') || t.includes('oi')) return '◈';
  if (t.includes('delta')) return '↕';
  if (t.includes('divergence')) return '⟂';
  if (t.includes('z-score')) return 'σ';
  if (t.includes('squeeze')) return '⚡';
  if (t.includes('rejim')) return '◎';
  return '•';
}
function kpiCard({ label, value, change, changeTone, spark, sparkColor, big }) {
  const c = el('div', { class: 'derivs-kpi ' + (changeTone || '') });
  c.appendChild(el('div', { class: 'derivs-kpi-top' },
    el('span', { class: 'derivs-kpi-icon ' + (changeTone || '') }, kpiIcon(label)),
    el('span', { class: 'derivs-kpi-label' }, label)
  ));
  const row = el('div', { class: 'derivs-kpi-row' });
  row.appendChild(el('div', { class: 'derivs-kpi-value ' + (big ? 'big ' : '') + (changeTone || '') }, value));
  if (spark && spark.length > 1) row.appendChild(sparkline(spark, 70, 30, sparkColor || '#22d3ee'));
  c.appendChild(row);
  if (change != null) c.appendChild(el('div', { class: 'derivs-kpi-change ' + (changeTone || '') }, change));
  return c;
}

// Donut grafik (borsa dağılımı)
function donutChart(items, { size = 150, centerLabel = '', centerValue = '' } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', String(size)); svg.setAttribute('height', String(size));
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - 14, sw = 22;
  let ang = -Math.PI / 2;
  const palette = ['#f59e0b', '#22d3ee', '#10b981', '#8b5cf6', '#ef4444', '#64748b', '#ec4899'];
  items.forEach((it, idx) => {
    const frac = it.value / total; const a2 = ang + frac * Math.PI * 2;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = frac > 0.5 ? 1 : 0;
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`);
    path.setAttribute('fill', 'none'); path.setAttribute('stroke', it.color || palette[idx % palette.length]); path.setAttribute('stroke-width', String(sw));
    svg.appendChild(path); ang = a2;
  });
  if (centerValue) {
    const t1 = document.createElementNS(ns, 'text'); t1.setAttribute('x', String(cx)); t1.setAttribute('y', String(cy - 2)); t1.setAttribute('text-anchor', 'middle'); t1.setAttribute('fill', '#e6edf6'); t1.setAttribute('font-size', '15'); t1.setAttribute('font-weight', '700'); t1.textContent = centerValue; svg.appendChild(t1);
    const t2 = document.createElementNS(ns, 'text'); t2.setAttribute('x', String(cx)); t2.setAttribute('y', String(cy + 14)); t2.setAttribute('text-anchor', 'middle'); t2.setAttribute('fill', '#94a3b8'); t2.setAttribute('font-size', '9'); t2.textContent = centerLabel; svg.appendChild(t2);
  }
  return svg;
}

// Yarım daire gauge (squeeze riski / crowding)
function gaugeChart(value, { min = 0, max = 100, label = '', leftLabel = '', rightLabel = '' } = {}) {
  const ns = 'http://www.w3.org/2000/svg'; const w = 200, h = 120;
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', '100%'); svg.setAttribute('height', String(h));
  const cx = w / 2, cy = h - 12, r = 80;
  // renkli yay (kırmızı→sarı→yeşil)
  const segs = [['#ef4444', Math.PI, Math.PI * 1.33], ['#f59e0b', Math.PI * 1.33, Math.PI * 1.66], ['#10b981', Math.PI * 1.66, Math.PI * 2]];
  segs.forEach(([col, a1, a2]) => {
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`); p.setAttribute('fill', 'none'); p.setAttribute('stroke', col); p.setAttribute('stroke-width', '12'); p.setAttribute('opacity', '0.85'); svg.appendChild(p);
  });
  // ibre
  const frac = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const na = Math.PI + frac * Math.PI;
  const nx = cx + (r - 6) * Math.cos(na), ny = cy + (r - 6) * Math.sin(na);
  const needle = document.createElementNS(ns, 'line'); needle.setAttribute('x1', String(cx)); needle.setAttribute('y1', String(cy)); needle.setAttribute('x2', String(nx)); needle.setAttribute('y2', String(ny)); needle.setAttribute('stroke', '#e6edf6'); needle.setAttribute('stroke-width', '2.5'); svg.appendChild(needle);
  const dot = document.createElementNS(ns, 'circle'); dot.setAttribute('cx', String(cx)); dot.setAttribute('cy', String(cy)); dot.setAttribute('r', '4'); dot.setAttribute('fill', '#e6edf6'); svg.appendChild(dot);
  const vt = document.createElementNS(ns, 'text'); vt.setAttribute('x', String(cx)); vt.setAttribute('y', String(cy - 24)); vt.setAttribute('text-anchor', 'middle'); vt.setAttribute('fill', '#e6edf6'); vt.setAttribute('font-size', '20'); vt.setAttribute('font-weight', '700'); vt.textContent = String(value); svg.appendChild(vt);
  if (label) { const lt = document.createElementNS(ns, 'text'); lt.setAttribute('x', String(cx)); lt.setAttribute('y', String(cy - 8)); lt.setAttribute('text-anchor', 'middle'); lt.setAttribute('fill', '#94a3b8'); lt.setAttribute('font-size', '9'); lt.textContent = label; svg.appendChild(lt); }
  const wrap = el('div', {});
  wrap.appendChild(svg);
  if (leftLabel || rightLabel) wrap.appendChild(el('div', { class: 'derivs-gauge-labels' }, el('span', { class: 'neg' }, leftLabel), el('span', { class: 'pos' }, rightLabel)));
  return wrap;
}

// "Tek Bakışta Yorum" paneli
function commentaryPanel(items) {
  const panel = el('div', { class: 'derivs-commentary' });
  panel.appendChild(el('div', { class: 'derivs-panel-title' }, 'TEK BAKIŞTA YORUM'));
  (items || []).forEach(it => panel.appendChild(el('div', { class: 'derivs-comment-row' },
    el('span', { class: 'derivs-comment-dot ' + (it.tone || '') }),
    el('span', { class: 'derivs-comment-text' }, it.text)
  )));
  return panel;
}


function oiDecisionInsightPanel(d) {
  const bias = d?.bias === 'BULLISH' ? 'BULLISH' : d?.bias === 'BEARISH' ? 'BEARISH' : 'NEUTRAL';
  const tone = bias === 'BULLISH' ? 'pos' : bias === 'BEARISH' ? 'neg' : 'warn';
  const squeezeProfile = oiSqueezeProfile(d);
  const squeezeHigh = squeezeProfile.maxRisk >= 65;
  const zHot = Math.abs(Number(d?.oiZScore || 0)) >= 1.5;
  const divBad = Number(d?.oiPriceDivergence || 0) < -0.4;
  const divGood = Number(d?.oiPriceDivergence || 0) > 0.4;
  const oiUp = Number(d?.oiDelta24hPct || 0) >= 0;
  const priceUp = Number(d?.priceChg24hPct || 0) >= 0;
  const dq = d?.dataQuality || {};
  const score = Math.max(0, Math.min(100,
    Math.round(
      (bias === 'BULLISH' ? 56 : bias === 'BEARISH' ? 44 : 50) +
      (oiUp && priceUp ? 12 : !oiUp && !priceUp ? -6 : 0) +
      (divGood ? 8 : divBad ? -8 : 0) +
      (zHot ? -4 : 4) +
      (squeezeHigh ? -6 : 4) +
      (dq.overall === 'LIVE' ? 6 : dq.overall === 'DEGRADED' ? -4 : -10)
    )
  ));

  const evidence = [];
  if (oiUp && priceUp) evidence.push({ tone: 'pos', title: 'Trend teyidi', text: 'Fiyat ve OI aynı yönde yükseliyor; yeni pozisyon girişi fiyatı destekliyor.' });
  else if (!oiUp && priceUp) evidence.push({ tone: 'warn', title: 'Zayıf yükseliş', text: 'Fiyat yükselirken OI azalıyor; hareket short-covering veya zayıf ivme olabilir.' });
  else if (oiUp && !priceUp) evidence.push({ tone: 'neg', title: 'Dağıtım baskısı', text: 'Fiyat düşerken OI artıyor; yeni short/hedge girişi veya agresif satış baskısı izlenmeli.' });
  else evidence.push({ tone: 'warn', title: 'Kapitülasyon olasılığı', text: 'Fiyat ve OI birlikte düşüyor; pozisyon kapanışı ve risk azaltma davranışı baskın.' });

  evidence.push({ tone: Number(d?.oiDelta24hPct || 0) >= 0 ? 'pos' : 'neg', title: 'OI Delta', text: `${Number(d?.oiDelta24hPct || 0) >= 0 ? '+' : ''}${Number(d?.oiDelta24hPct || 0).toFixed(2)}% 24s değişim; pozisyon yoğunluğu ${oiUp ? 'artıyor' : 'azalıyor'}.` });
  evidence.push({ tone: zHot ? 'warn' : 'pos', title: 'OI Z-Score', text: `${Number(d?.oiZScore || 0).toFixed(2)}; ${zHot ? 'kalabalıklaşma normal üstü, squeeze riski dikkate alınmalı.' : 'normal bantta, aşırı kalabalık sinyali sınırlı.'}` });

  const risks = [];
  if (squeezeHigh) risks.push({ tone: squeezeProfile.dominantTone, title: 'Squeeze riski', text: `${squeezeProfile.dominant}: Long ${squeezeProfile.longRisk}/100, Short ${squeezeProfile.shortRisk}/100. Ani fitil riski yükseldi.` });
  if (divBad || divGood) risks.push({ tone: divBad ? 'neg' : 'pos', title: 'Divergence', text: `OI/Fiyat ayrışması ${Number(d?.oiPriceDivergence || 0).toFixed(2)}%; ${divBad ? 'kısa vadeli düzeltme riski var.' : 'trend devamını destekleyen ayrışma var.'}` });
  if (dq.overall && dq.overall !== 'LIVE') risks.push({ tone: 'warn', title: 'Veri kalitesi', text: `Genel veri durumu ${dq.overall}; eksik kaynaklar karar ağırlığını düşürmeli.` });
  if (!risks.length) risks.push({ tone: 'pos', title: 'Risk durumu', text: 'Aşırı divergence veya kaynak kalitesi sorunu görünmüyor; yine de fiyat seviyesi teyidi gerekli.' });

  const panel = el('div', { class: 'derivs-decision-panel derivs-commentary-extended' });
  panel.appendChild(el('div', { class: 'derivs-decision-top' },
    el('div', {},
      el('div', { class: 'derivs-panel-title' }, 'TEK BAKIŞTA KARAR'),
      el('div', { class: 'derivs-decision-sub' }, 'OI rejimi, veri kalitesi, divergence ve squeeze birleşik yorumu')
    ),
    el('div', { class: 'derivs-decision-score ' + tone },
      el('span', { class: 'derivs-decision-score-value' }, String(score)),
      el('span', { class: 'derivs-decision-score-label' }, '/100')
    )
  ));

  panel.appendChild(el('div', { class: 'derivs-decision-badge ' + tone },
    el('span', { class: 'derivs-decision-bias' }, bias),
    el('span', { class: 'derivs-decision-regime' }, d?.regimeLabel || 'Rejim Yok')
  ));

  const matrix = el('div', { class: 'derivs-decision-matrix' });
  matrix.appendChild(el('div', { class: 'derivs-decision-cell ' + (oiUp ? 'pos' : 'neg') }, el('span', {}, 'OI'), el('strong', {}, oiUp ? '↑' : '↓'), el('small', {}, `${Number(d?.oiDelta24hPct || 0).toFixed(2)}%`)));
  matrix.appendChild(el('div', { class: 'derivs-decision-cell ' + (priceUp ? 'pos' : 'neg') }, el('span', {}, 'Fiyat'), el('strong', {}, priceUp ? '↑' : '↓'), el('small', {}, `${Number(d?.priceChg24hPct || 0).toFixed(2)}%`)));
  matrix.appendChild(el('div', { class: 'derivs-decision-cell ' + (zHot ? 'warn' : 'pos') }, el('span', {}, 'Z'), el('strong', {}, Number(d?.oiZScore || 0).toFixed(2)), el('small', {}, zHot ? 'Sıcak' : 'Normal')));
  matrix.appendChild(el('div', { class: 'derivs-decision-cell ' + (squeezeHigh ? squeezeProfile.dominantTone : 'pos') }, el('span', {}, 'Squeeze'), el('strong', {}, String(squeezeProfile.maxRisk)), el('small', {}, squeezeProfile.dominant)));
  matrix.appendChild(el('div', { class: 'derivs-decision-cell ' + (squeezeProfile.longRisk >= 70 ? 'neg' : 'pos') }, el('span', {}, 'Long SQ'), el('strong', {}, String(squeezeProfile.longRisk)), el('small', {}, 'Long risk')));
  matrix.appendChild(el('div', { class: 'derivs-decision-cell ' + (squeezeProfile.shortRisk >= 70 ? 'warn' : 'pos') }, el('span', {}, 'Short SQ'), el('strong', {}, String(squeezeProfile.shortRisk)), el('small', {}, 'Short risk')));
  panel.appendChild(matrix);

  panel.appendChild(el('div', { class: 'derivs-decision-section-title' }, 'Güçlü Kanıtlar'));
  evidence.slice(0, 3).forEach(item => panel.appendChild(el('div', { class: 'derivs-decision-row ' + item.tone },
    el('span', { class: 'derivs-comment-dot ' + item.tone }),
    el('div', {}, el('div', { class: 'derivs-decision-row-title' }, item.title), el('div', { class: 'derivs-decision-row-text' }, item.text))
  )));

  panel.appendChild(el('div', { class: 'derivs-decision-section-title danger' }, 'Risk / Geçersizleşme'));
  risks.slice(0, 3).forEach(item => panel.appendChild(el('div', { class: 'derivs-decision-row ' + item.tone },
    el('span', { class: 'derivs-comment-dot ' + item.tone }),
    el('div', {}, el('div', { class: 'derivs-decision-row-title' }, item.title), el('div', { class: 'derivs-decision-row-text' }, item.text))
  )));

  panel.appendChild(el('div', { class: 'derivs-decision-footer' },
    el('span', {}, 'Piyasa yorumu:'),
    el('strong', { class: tone }, bias === 'BULLISH' ? 'Yükseliş teyidi aranır' : bias === 'BEARISH' ? 'Düşüş baskısı teyidi aranır' : 'Nötr teyit beklenir')
  ));
  return panel;
}

// Alt canlı sinyal şeridi
function signalStrip(label, signals) {
  const strip = el('div', { class: 'derivs-signal-strip derivs-signal-strip-pro' });
  strip.appendChild(el('div', { class: 'derivs-strip-label-wrap' },
    el('div', { class: 'derivs-strip-label' }, label),
    el('div', { class: 'derivs-strip-label-sub' }, 'Zaman · Şiddet · Tetikleyen metrik')
  ));
  const row = el('div', { class: 'derivs-strip-row' });
  (signals || []).forEach(s => {
    const sev = Number.isFinite(s.severity) ? Math.max(0, Math.min(100, Math.round(s.severity))) : null;
    const card = el('div', { class: 'derivs-strip-card derivs-strip-card-pro ' + (s.tone || '') });
    card.appendChild(el('div', { class: 'derivs-strip-head' },
      el('span', { class: 'derivs-strip-name' }, s.name),
      el('span', { class: 'derivs-strip-time mono' }, s.time || '—')
    ));
    card.appendChild(el('div', { class: 'derivs-strip-sub' }, s.sub || ''));
    if (Array.isArray(s.spark) && s.spark.length > 2) {
      card.appendChild(el('div', { class: 'derivs-strip-spark' }, sparkline(s.spark.slice(-32), 188, 34, s.sparkColor || (s.tone === 'neg' ? '#f43f5e' : s.tone === 'warn' ? '#f59e0b' : '#22d3ee'))));
    }
    const meta = el('div', { class: 'derivs-strip-meta' });
    meta.appendChild(el('span', { class: 'derivs-strip-pill' }, s.metric || 'OI'));
    meta.appendChild(el('span', { class: 'derivs-strip-pill' }, s.trigger || 'rule'));
    if (s.symbol) meta.appendChild(el('span', { class: 'derivs-strip-pill symbol' }, s.symbol));
    card.appendChild(meta);
    if (sev != null) {
      card.appendChild(el('div', { class: 'derivs-severity-row' },
        el('span', { class: 'derivs-severity-label' }, 'Şiddet'),
        el('span', { class: 'derivs-severity-value mono ' + (sev >= 70 ? 'neg' : sev >= 45 ? 'warn' : 'pos') }, String(sev) + '/100')
      ));
      card.appendChild(el('div', { class: 'derivs-severity-track' },
        el('div', { class: 'derivs-severity-fill ' + (s.tone || ''), style: 'width:' + sev + '%' })
      ));
    }
    row.appendChild(card);
  });
  strip.appendChild(row);
  return strip;
}

function signalTime() {
  try { return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

function currentSymbol() {
  return (State.symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
function normalizePeriod(raw, { allowGlobal = true } = {}) {
  const allowed = allowGlobal ? GLOBAL_PERIODS : PERIODS;
  const v = String(raw || '').trim();
  if (allowed.includes(v)) return v;
  return '15m';
}
function backendPeriod(raw) {
  const p = normalizePeriod(raw);
  return p === '1w' ? '1d' : p;
}
function periodLabel(raw) {
  const map = { '5m': '5 dk', '15m': '15 dk', '1h': '1 saat', '4h': '4 saat', '1d': '1 gün', '1w': '1 hafta' };
  return map[normalizePeriod(raw)] || normalizePeriod(raw);
}
function getPeriod() {
  try {
    return normalizePeriod(State.tf || localStorage.getItem('rux.global.timeframe.v1') || localStorage.getItem('rux.derivs.period') || '15m');
  } catch {
    return normalizePeriod(State.tf || '15m');
  }
}
function setPeriod(p) {
  const tf = normalizePeriod(p);
  try { localStorage.setItem('rux.derivs.period', tf); } catch {}
  try { localStorage.setItem('rux.global.timeframe.v1', tf); } catch {}
  State.tf = tf;
  try { State.emit?.('tf', tf); } catch {}
}


function oiControlPanel(host, d) {
  const panel = el('div', { class: 'derivs-oi-sidebar derivs-panel' });
  panel.appendChild(el('div', { class: 'derivs-panel-head' },
    el('div', { class: 'derivs-panel-title big' }, 'Kontrol Paneli'),
    el('button', { class: 'btn sm ghost', on: { click: () => renderDerivsOI(host) } }, ICN.refresh(11), 'Kaydet')
  ));

  const section = (label, body) => {
    panel.appendChild(el('div', { class: 'derivs-side-label' }, label));
    panel.appendChild(body);
  };

  const symbolBox = el('div', { class: 'derivs-side-value' }, currentSymbol() + ' Perp');
  section('Sembol', symbolBox);

  const exRow = el('div', { class: 'derivs-chip-row' });
  ['Tümü', 'Binance', 'Bybit', 'OKX'].forEach((name, idx) => exRow.appendChild(el('button', { class: 'btn xs ' + (idx === 0 ? 'outline-cyan' : 'ghost') }, name)));
  section('Borsa', exRow);

  const tfRow = el('div', { class: 'derivs-chip-row' });
  PERIODS.forEach(p => tfRow.appendChild(el('button', { class: 'btn xs ' + (getPeriod() === p ? 'outline-cyan' : 'ghost'), on: { click: () => { setPeriod(p); renderDerivsOI(host); } } }, p)));
  section('Zaman Dilimi', tfRow);

  panel.appendChild(el('div', { class: 'derivs-side-block-title' }, 'Gösterge Seçenekleri'));
  [
    'Açık Pozisyon (OI)',
    'Fiyat',
    'OI Delta',
    'Spot/Perp Karşılaştır',
    'Borsa Dağılımı',
    'OI Z-Score',
    'OI Momentum'
  ].forEach(name => {
    const row = el('div', { class: 'derivs-toggle-row' });
    row.appendChild(el('div', { class: 'derivs-toggle-name' }, name));
    row.appendChild(el('div', { class: 'derivs-toggle-switch on' }, el('span', { class: 'derivs-toggle-knob' })));
    panel.appendChild(row);
  });

  const smoothRow = el('div', { class: 'derivs-side-dual' });
  smoothRow.appendChild(el('div', { class: 'derivs-side-mini' }, el('div', { class: 'derivs-side-label mini' }, 'Smoothing'), el('div', { class: 'derivs-side-select' }, 'EMA')));
  smoothRow.appendChild(el('div', { class: 'derivs-side-mini' }, el('div', { class: 'derivs-side-label mini' }, 'Periyot'), el('div', { class: 'derivs-side-select mono' }, '21')));
  panel.appendChild(smoothRow);

  panel.appendChild(el('div', { class: 'derivs-side-label' }, 'OI Delta Görünümü'));
  const modeRow = el('div', { class: 'derivs-segment-row' });
  modeRow.appendChild(el('button', { class: 'btn xs ghost' }, 'Mutlak'));
  modeRow.appendChild(el('button', { class: 'btn xs outline-cyan' }, 'Yüzde (%)'));
  panel.appendChild(modeRow);

  panel.appendChild(el('div', { class: 'derivs-side-footer' },
    el('div', { class: 'derivs-refresh-state' }, el('span', { class: 'derivs-dot pos' }), 'Yenileme', ' ', el('span', { class: 'mono' }, 'Otomatik (5sn)')),
    el('div', { class: 'derivs-refresh-state right' }, d?.source ? oiStatusLabel(d.dataQuality || 'live') + ' · ' + d.source.toUpperCase() : 'Kaynak bekleniyor')
  ));
  return panel;
}

function oiSummaryCard(title, value, sub, tone = '') {
  return el('div', { class: 'derivs-summary-card' },
    el('div', { class: 'derivs-summary-title' }, title),
    el('div', { class: 'derivs-summary-value ' + tone }, value),
    el('div', { class: 'derivs-summary-sub' }, sub)
  );
}


function clampNum(v, min = 0, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function oiSqueezeProfile(d) {
  const z = Math.abs(Number(d?.oiZScore || 0));
  const oiDelta = Number(d?.oiDelta24hPct || 0);
  const priceDelta = Number(d?.priceChg24hPct || 0);
  const div = Number(d?.oiPriceDivergence || 0);
  const base = 28 + Math.min(28, z * 12) + Math.min(22, Math.abs(oiDelta) * 2.2) + Math.min(10, Math.abs(div) * 2.5);
  let longRisk = base;
  let shortRisk = base;

  if (priceDelta >= 0 && oiDelta >= 0) {
    shortRisk += 18;
    longRisk += z >= 1.5 ? 10 : -4;
  } else if (priceDelta < 0 && oiDelta >= 0) {
    longRisk += 22;
    shortRisk += z >= 1.5 ? 8 : -6;
  } else if (priceDelta >= 0 && oiDelta < 0) {
    shortRisk += 9;
    longRisk -= 8;
  } else {
    longRisk += 10;
    shortRisk -= 10;
  }

  if (d?.squeezeSide === 'long') longRisk += 4;
  if (d?.squeezeSide === 'short') shortRisk += 4;

  longRisk = Math.round(clampNum(longRisk));
  shortRisk = Math.round(clampNum(shortRisk));
  const net = shortRisk - longRisk;
  const dominant = Math.abs(net) < 8 ? 'Dengeli' : net > 0 ? 'Short Squeeze Baskısı' : 'Long Squeeze Baskısı';
  const dominantTone = Math.abs(net) < 8 ? 'warn' : net > 0 ? 'pos' : 'neg';
  const maxRisk = Math.max(longRisk, shortRisk);
  const maxLabel = maxRisk >= 70 ? 'YÜKSEK' : maxRisk >= 45 ? 'ORTA' : 'DÜŞÜK';
  return { longRisk, shortRisk, net, dominant, dominantTone, maxRisk, maxLabel };
}

function twoSidedSqueezePanel(profile) {
  const longTone = profile.longRisk >= 70 ? 'neg' : profile.longRisk >= 45 ? 'warn' : 'pos';
  const shortTone = profile.shortRisk >= 70 ? 'pos' : profile.shortRisk >= 45 ? 'warn' : 'neg';
  const row = (label, value, tone, sideText) => el('div', { class: 'derivs-sq-row ' + tone },
    el('div', { class: 'derivs-sq-row-head' }, el('span', {}, label), el('strong', {}, value + '/100')),
    el('div', { class: 'derivs-sq-bar-track' }, el('div', { class: 'derivs-sq-bar-fill', style: 'width:' + value + '%' })),
    el('div', { class: 'derivs-sq-note' }, sideText)
  );
  return el('div', { class: 'derivs-squeeze-dual' },
    el('div', { class: 'derivs-sq-dominant ' + profile.dominantTone },
      el('span', {}, 'Net Baskı'),
      el('strong', {}, profile.dominant),
      el('small', {}, 'Net: ' + (profile.net >= 0 ? '+' : '') + profile.net + ' puan')
    ),
    row('Long Squeeze Riski', profile.longRisk, longTone, 'Kalabalık longların aşağı fitilde zorunlu kapanma riski'),
    row('Short Squeeze Riski', profile.shortRisk, shortTone, 'Kalabalık shortların yukarı fitilde zorunlu kapanma riski'),
    el('div', { class: 'derivs-sq-balance' },
      el('span', { class: 'neg' }, 'Long'),
      el('div', { class: 'derivs-sq-balance-track' }, el('div', { class: 'derivs-sq-balance-pin', style: 'left:' + clampNum(50 + profile.net / 2) + '%' })),
      el('span', { class: 'pos' }, 'Short')
    )
  );
}


function oiActiveRegimeGuidePanel(d) {
  const regimes = [
    {
      key: 'TREND_TEYIDI', tone: 'pos', icon: '↑', title: 'Fiyat ↑ + OI ↑ = Trend Teyidi',
      desc: 'Yeni pozisyon girişi fiyat hareketini destekliyor.',
      action: 'Trend devamı için delta/funding teyidi ara.',
      invalidation: 'OI düşerken fiyatın yataylaşması teyidi zayıflatır.'
    },
    {
      key: 'ZAYIF_YUKSELIS', tone: 'warn', icon: '↗', title: 'Fiyat ↑ + OI ↓ = Zayıf Yükseliş',
      desc: 'Hareket short-covering veya pozisyon kapanışı kaynaklı olabilir.',
      action: 'Yeni OI girişi gelmeden agresif devam varsayma.',
      invalidation: 'OI tekrar yükselip fiyatı takip ederse trend teyidine döner.'
    },
    {
      key: 'DAGITIM', tone: 'neg', icon: '↓', title: 'Fiyat ↓ + OI ↑ = Dağıtım / Short Baskısı',
      desc: 'Düşüşe yeni pozisyon ekleniyor; satıcı baskısı güçlenebilir.',
      action: 'Long squeeze, funding ve likidasyon cluster riskini izle.',
      invalidation: 'Fiyat toparlanırken OI çözülürse baskı azalır.'
    },
    {
      key: 'KAPITULASYON', tone: 'warn', icon: '↘', title: 'Fiyat ↓ + OI ↓ = Kapitülasyon',
      desc: 'Pozisyonlar kapanıyor; risk azaltma ve dip arayışı davranışı baskın.',
      action: 'Volatilite sönümlenmesi ve OI stabilizasyonu bekle.',
      invalidation: 'OI tekrar hızla artarsa yeni trend fazına geçiş olabilir.'
    }
  ];
  const active = regimes.find(r => r.key === d?.regime) || regimes[0];
  const score = d?.regime === 'TREND_TEYIDI' ? 82 : d?.regime === 'DAGITIM' ? 76 : d?.regime === 'ZAYIF_YUKSELIS' ? 58 : 54;
  const card = el('div', { class: 'derivs-panel derivs-regime-pro-panel' });
  card.appendChild(el('div', { class: 'derivs-panel-title' }, 'Aktif OI Rejim Rehberi'));
  card.appendChild(el('div', { class: 'derivs-regime-active ' + active.tone },
    el('div', { class: 'derivs-regime-icon' }, active.icon),
    el('div', { class: 'derivs-regime-active-body' },
      el('div', { class: 'derivs-regime-active-label' }, 'AKTİF SENARYO'),
      el('div', { class: 'derivs-regime-active-title' }, active.title),
      el('div', { class: 'derivs-regime-active-desc' }, active.desc)
    ),
    el('div', { class: 'derivs-regime-score' }, el('strong', {}, String(score)), el('span', {}, '/100'))
  ));
  card.appendChild(el('div', { class: 'derivs-regime-action-grid' },
    el('div', { class: 'derivs-regime-action' }, el('span', {}, 'İzlenecek Teyit'), el('strong', {}, active.action)),
    el('div', { class: 'derivs-regime-action' }, el('span', {}, 'Geçersizleşme'), el('strong', {}, active.invalidation))
  ));
  const rows = el('div', { class: 'derivs-regime-pro-list' });
  regimes.forEach(r => rows.appendChild(el('div', { class: 'derivs-regime-pro-row ' + r.tone + (r.key === d?.regime ? ' active' : '') },
    el('span', { class: 'derivs-regime-pro-dot' }),
    el('div', {}, el('div', { class: 'derivs-regime-title' }, r.title), el('div', { class: 'derivs-regime-desc' }, r.desc)),
    el('span', { class: 'derivs-regime-state' }, r.key === d?.regime ? 'AKTİF' : 'PASİF')
  )));
  card.appendChild(rows);
  return card;
}


function oiStatusTone(status) {
  if (status === 'live') return 'pos';
  if (status === 'cache') return 'warn';
  if (status === 'degraded') return 'warn';
  return 'neg';
}
function oiStatusLabel(status) {
  return ({ live: 'LIVE', cache: 'CACHE', degraded: 'DEGRADED', offline: 'OFFLINE' })[status] || 'OFFLINE';
}
function buildOiFallbackStatus(d) {
  const errors = (d?.errors || []).join(' | ').toLowerCase();
  const has = (name) => (d?.source || '').toLowerCase().includes(name);
  const status = [];
  status.push({ label: 'Binance OI Geçmişi', provider: 'Binance Futures', status: (d?.series || []).length ? 'live' : 'offline', rows: (d?.series || []).length, impact: (d?.series || []).length ? 'decision-included' : 'excluded', note: (d?.series || []).length ? 'Ana OI serisi' : 'Seri yok' });
  status.push({ label: 'Fiyat Mumları', provider: 'Binance Futures', status: (d?.priceSeries || []).length ? 'live' : 'offline', rows: (d?.priceSeries || []).length, impact: (d?.priceSeries || []).length ? 'decision-included' : 'excluded', note: (d?.priceSeries || []).length ? 'Chart overlay' : 'Fiyat serisi yok' });
  status.push({ label: 'Bybit OI', provider: 'Bybit', status: has('bybit') ? 'live' : (errors.includes('bybit') ? 'offline' : 'degraded'), rows: has('bybit') ? 1 : 0, impact: has('bybit') ? 'exchange-split' : 'exchange-split-excluded', note: has('bybit') ? 'Dağılıma dahil' : 'Dağılım dışı' });
  status.push({ label: 'OKX OI', provider: 'OKX', status: has('okx') ? 'live' : (errors.includes('okx') ? 'offline' : 'degraded'), rows: has('okx') ? 1 : 0, impact: has('okx') ? 'exchange-split' : 'exchange-split-excluded', note: has('okx') ? 'Dağılıma dahil' : 'Dağılım dışı' });
  return status;
}
function oiDataQualityPanel(d) {
  const rows = (d?.dataStatus && d.dataStatus.length ? d.dataStatus : buildOiFallbackStatus(d));
  const live = rows.filter(r => r.status === 'live').length;
  const offline = rows.filter(r => r.status === 'offline').length;
  const q = d?.dataQuality || (!live ? 'offline' : offline ? 'degraded' : 'live');
  const panel = el('div', { class: 'derivs-panel derivs-data-quality-panel' });
  panel.appendChild(el('div', { class: 'derivs-panel-head' },
    el('div', {}, el('div', { class: 'derivs-panel-title' }, 'Veri Durumu / Karar Etkisi'), el('div', { class: 'small muted' }, 'Canlı, cache, bozuk ve karar dışı alanlar')),
    el('div', { class: 'derivs-quality-pill ' + oiStatusTone(q) }, oiStatusLabel(q))
  ));
  const grid = el('div', { class: 'derivs-data-quality-grid' });
  rows.forEach(r => {
    const tone = oiStatusTone(r.status);
    grid.appendChild(el('div', { class: 'derivs-data-quality-row ' + tone },
      el('div', { class: 'derivs-data-status-badge ' + tone }, oiStatusLabel(r.status)),
      el('div', { class: 'derivs-data-main' },
        el('div', { class: 'derivs-data-name' }, r.label || r.key || 'Veri'),
        el('div', { class: 'derivs-data-note' }, (r.provider || '—') + ' · ' + (r.note || r.impact || ''))
      ),
      el('div', { class: 'derivs-data-impact mono' }, r.impact || '—'),
      el('div', { class: 'derivs-data-rows mono' }, Number.isFinite(Number(r.rows)) ? String(r.rows) : '—')
    ));
  });
  const impact = d?.decisionImpact || {};
  panel.appendChild(grid);
  panel.appendChild(el('div', { class: 'derivs-impact-strip' },
    el('span', {}, 'OI: ', el('strong', {}, impact.oiSeries || ((d?.series || []).length ? 'included' : 'excluded'))),
    el('span', {}, 'Fiyat: ', el('strong', {}, impact.priceSeries || ((d?.priceSeries || []).length ? 'included' : 'excluded'))),
    el('span', {}, 'Borsa Dağılımı: ', el('strong', {}, impact.exchangeSplit || ((d?.distribution || []).length >= 2 ? 'included' : 'degraded'))),
    el('span', {}, 'Türev Metrikler: ', el('strong', {}, impact.derivedMetrics || 'included'))
  ));
  return panel;
}


function formatAxisTime(ts, period = getPeriod()) {
  const d = new Date(Number(ts || 0));
  if (!Number.isFinite(d.getTime())) return '';
  const p = normalizePeriod(period);
  const base = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }).replace('.', '');
  if (p === '5m' || p === '15m' || p === '1h') {
    const tm = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    return base + ' ' + tm;
  }
  return base;
}
function fmtMicroPrice(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1) return fmtPrice(v);
  if (v === 0) return '0.0000';
  const abs = Math.abs(v);
  const repr = abs.toFixed(18);
  const frac = repr.split('.')[1] || '';
  const m = frac.match(/^(0*)(\d+)/);
  const leadingZeros = m ? m[1].length : 0;
  const digitsNeeded = leadingZeros + 4;
  const decimals = Math.min(12, Math.max(4, digitsNeeded));
  return v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function candlestickOiOverlay(priceSeries = [], oiSeries = [], meta = {}) {
  const wrap = el('div', { class: 'derivs-candle-oi-wrap' });
  const prices = (priceSeries || []).filter(p => Number.isFinite(p?.open ?? p?.close) || Number.isFinite(p?.close)).slice(-90);
  const oi = (oiSeries || []).filter(s => Number.isFinite(s?.oiUsd)).slice(-90);
  const n = Math.min(prices.length, oi.length || prices.length);
  if (n < 8) {
    wrap.appendChild(dualLineChart((oiSeries || []).map(s => s.oiUsd), (priceSeries || []).map(p => p.close), { labelA: 'Açık Pozisyon (OI)', labelB: 'Fiyat' }));
    return wrap;
  }
  const ps = prices.slice(-n);
  const os = oi.length ? oi.slice(-n) : ps.map((p, i) => ({ oiUsd: i }));
  const w = 920, h = 228;
  const pad = { l: 54, r: 72, t: 18, b: 34 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const highs = ps.map(p => Number(p.high ?? p.close));
  const lows = ps.map(p => Number(p.low ?? p.close));
  const closes = ps.map(p => Number(p.close));
  const opens = ps.map(p => Number(p.open ?? p.close));
  const priceMin = Math.min(...lows);
  const priceMax = Math.max(...highs);
  const pricePad = (priceMax - priceMin || priceMax || 1) * 0.08;
  const pMin = priceMin - pricePad;
  const pMax = priceMax + pricePad;
  const oiVals = os.map(s => Number(s.oiUsd));
  const oiMin0 = Math.min(...oiVals), oiMax0 = Math.max(...oiVals);
  const oiPad = (oiMax0 - oiMin0 || oiMax0 || 1) * 0.10;
  const oMin = oiMin0 - oiPad;
  const oMax = oiMax0 + oiPad;
  const x = i => pad.l + (i / Math.max(1, n - 1)) * plotW;
  const yPrice = v => pad.t + (1 - ((v - pMin) / (pMax - pMin || 1))) * plotH;
  const yOi = v => pad.t + (1 - ((v - oMin) / (oMax - oMin || 1))) * plotH;
  const compact = v => {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(a >= 10e9 ? 1 : 2) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 10e6 ? 1 : 2) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(Math.round(v));
  };
  const prettyPrice = (v) => Math.abs(Number(v) || 0) < 1 ? fmtMicroPrice(v) : (fmtPrice ? fmtPrice(v) : Math.round(v).toLocaleString('en-US'));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '236');
  svg.setAttribute('preserveAspectRatio', 'none');
  const mk = (tag, attrs = {}, text = '') => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    if (text) node.textContent = text;
    return node;
  };
  const defs = mk('defs');
  const grad = mk('linearGradient', { id: 'oiAreaGrad', x1: '0', x2: '0', y1: '0', y2: '1' });
  grad.appendChild(mk('stop', { offset: '0%', 'stop-color': '#2bdcff', 'stop-opacity': '0.28' }));
  grad.appendChild(mk('stop', { offset: '100%', 'stop-color': '#2bdcff', 'stop-opacity': '0.02' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  for (let i = 0; i <= 4; i++) {
    const yy = pad.t + (i / 4) * plotH;
    svg.appendChild(mk('line', { x1: pad.l, x2: w - pad.r, y1: yy, y2: yy, stroke: 'rgba(148,163,184,.13)', 'stroke-width': '1' }));
    const pv = pMax - (i / 4) * (pMax - pMin);
    svg.appendChild(mk('text', { x: 8, y: yy + 4, fill: '#8fb7c9', 'font-size': '10' }, prettyPrice(pv)));
    const ov = oMax - (i / 4) * (oMax - oMin);
    svg.appendChild(mk('text', { x: w - pad.r + 10, y: yy + 4, fill: '#8fb7c9', 'font-size': '10' }, '$' + compact(ov)));
  }
  for (let i = 0; i <= 5; i++) {
    const xx = pad.l + (i / 5) * plotW;
    svg.appendChild(mk('line', { x1: xx, x2: xx, y1: pad.t, y2: h - pad.b, stroke: 'rgba(148,163,184,.06)', 'stroke-width': '1' }));
  }
  svg.appendChild(mk('text', { x: 8, y: 13, fill: '#7dd3fc', 'font-size': '10' }, 'Fiyat'));
  svg.appendChild(mk('text', { x: w - pad.r + 10, y: 13, fill: '#2bdcff', 'font-size': '10' }, 'OI'));

  const oiPts = oiVals.map((v, i) => `${x(i).toFixed(1)},${yOi(v).toFixed(1)}`);
  const area = mk('polygon', { points: `${pad.l},${h - pad.b} ${oiPts.join(' ')} ${w - pad.r},${h - pad.b}`, fill: 'url(#oiAreaGrad)' });
  svg.appendChild(area);
  svg.appendChild(mk('polyline', { points: oiPts.join(' '), fill: 'none', stroke: '#2bdcff', 'stroke-width': '2.4', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));

  const bodyW = Math.max(4, Math.min(10, (plotW / n) * 0.55));
  ps.forEach((p, i) => {
    const xx = x(i);
    const o = opens[i], c = closes[i], hi = highs[i], lo = lows[i];
    const up = c >= o;
    const col = up ? '#24e0a4' : '#ff4f86';
    svg.appendChild(mk('line', { x1: xx, x2: xx, y1: yPrice(hi), y2: yPrice(lo), stroke: col, 'stroke-width': '1.2', opacity: '.92' }));
    const y1 = yPrice(Math.max(o, c));
    const y2 = yPrice(Math.min(o, c));
    svg.appendChild(mk('rect', { x: xx - bodyW / 2, y: Math.min(y1, y2), width: bodyW, height: Math.max(2, Math.abs(y2 - y1)), rx: '1.5', fill: col, opacity: '.92' }));
  });

  const lastClose = closes.at(-1);
  const lastY = yPrice(lastClose);
  svg.appendChild(mk('line', { x1: pad.l, x2: w - pad.r, y1: lastY, y2: lastY, stroke: 'rgba(255,255,255,.34)', 'stroke-dasharray': '5 5', 'stroke-width': '1' }));
  svg.appendChild(mk('rect', { x: w - pad.r + 6, y: lastY - 11, width: 58, height: 20, rx: '5', fill: 'rgba(8, 24, 39, .96)', stroke: 'rgba(255,255,255,.22)' }));
  svg.appendChild(mk('text', { x: w - pad.r + 35, y: lastY + 4, fill: '#ffffff', 'font-size': '10', 'font-weight': '700', 'text-anchor': 'middle' }, prettyPrice(lastClose)));

  if (Math.abs(meta?.divergence || 0) > 0.35) {
    const label = (meta.divergence < 0 ? 'Bearish Divergence' : 'Bullish Divergence');
    const lx = pad.l + plotW * 0.62, ly = pad.t + 34;
    svg.appendChild(mk('rect', { x: lx, y: ly - 18, width: 130, height: 24, rx: '6', fill: meta.divergence < 0 ? 'rgba(255,79,134,.16)' : 'rgba(36,224,164,.14)', stroke: meta.divergence < 0 ? 'rgba(255,79,134,.45)' : 'rgba(36,224,164,.45)' }));
    svg.appendChild(mk('text', { x: lx + 65, y: ly - 2, fill: meta.divergence < 0 ? '#ff6e9f' : '#24e0a4', 'font-size': '10', 'font-weight': '700', 'text-anchor': 'middle' }, label));
    svg.appendChild(mk('line', { x1: lx + 20, x2: lx + 110, y1: ly + 16, y2: meta.divergence < 0 ? ly + 34 : ly + 0, stroke: meta.divergence < 0 ? '#ff4f86' : '#24e0a4', 'stroke-width': '1.3', 'stroke-dasharray': '4 4' }));
  }

  const tickCount = Math.min(6, n);
  const timeSeries = ps.map((p, i) => Number(p?.time ?? os[i]?.time ?? i));
  for (let i = 0; i < tickCount; i++) {
    const idx = Math.round((i / Math.max(1, tickCount - 1)) * (n - 1));
    const xx = x(idx);
    const label = formatAxisTime(timeSeries[idx], meta.period || getPeriod());
    svg.appendChild(mk('text', { x: xx, y: h - 10, fill: '#8fb7c9', 'font-size': '10', 'text-anchor': 'middle' }, label));
  }

  wrap.appendChild(svg);
  wrap.appendChild(el('div', { class: 'derivs-chart-legend derivs-candle-legend' },
    el('span', {}, el('span', { class: 'derivs-legend-dot', style: 'background:#24e0a4' }), ' Fiyat mumları'),
    el('span', {}, el('span', { class: 'derivs-legend-dot', style: 'background:#2bdcff' }), ' Açık Pozisyon (OI)'),
    el('span', { class: 'muted' }, 'Çift eksen · Sol fiyat / sağ OI')
  ));
  return wrap;
}


function oiClusterHeatmap(bands = [], priceSeries = [], meta = {}) {
  const wrap = el('div', { class: 'derivs-oi-heatmap-pro derivs-oi-band-overlay' });
  const cleanBands = (bands || [])
    .filter(b => Number.isFinite(b?.price) && Number.isFinite(b?.oiUsd))
    .map(b => ({ ...b, low: Number(b.low ?? b.price), high: Number(b.high ?? b.price), price: Number(b.price), oiUsd: Number(b.oiUsd || 0) }))
    .sort((a, b) => (b.price || 0) - (a.price || 0));

  const prices = (priceSeries || []).filter(p => Number.isFinite(p?.close) && Number.isFinite(p?.high) && Number.isFinite(p?.low)).slice(-90);
  if (!cleanBands.length || prices.length < 8) {
    wrap.appendChild(el('div', { class: 'small muted', style: 'padding:20px;text-align:center' }, 'OI küme verisi yok'));
    return wrap;
  }

  const current = Number.isFinite(meta.currentPrice) ? Number(meta.currentPrice) : Number(prices.at(-1)?.close || cleanBands[0].price);
  const major = cleanBands.reduce((a, b) => (b.oiUsd || 0) > (a.oiUsd || 0) ? b : a, cleanBands[0]);
  const near = cleanBands.reduce((a, b) => Math.abs((b.price || 0) - current) < Math.abs((a.price || 0) - current) ? b : a, cleanBands[0]);
  const maxOi = Math.max(...cleanBands.map(b => b.oiUsd || 0), 1);

  const w = 920, h = 290;
  const pad = { l: 56, r: 106, t: 16, b: 28 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const highs = prices.map(p => Number(p.high ?? p.close));
  const lows = prices.map(p => Number(p.low ?? p.close));
  const closes = prices.map(p => Number(p.close));
  const opens = prices.map(p => Number(p.open ?? p.close));
  const priceMin = Math.min(...lows, ...cleanBands.map(b => Number(b.low ?? b.price)), current);
  const priceMax = Math.max(...highs, ...cleanBands.map(b => Number(b.high ?? b.price)), current);
  const pricePad = Math.max((priceMax - priceMin) * 0.08, Math.abs(priceMax || 1) * 0.004, 1e-8);
  const pMin = priceMin - pricePad;
  const pMax = priceMax + pricePad;
  const x = i => pad.l + (i / Math.max(1, prices.length - 1)) * plotW;
  const yPrice = v => pad.t + (1 - ((v - pMin) / (pMax - pMin || 1))) * plotH;
  const prettyPrice = (v) => Math.abs(Number(v) || 0) < 1 ? fmtMicroPrice(v) : (fmtPrice ? fmtPrice(v) : Math.round(v).toLocaleString('en-US'));
  const compactUsd = (v) => '$' + fmtNum(v || 0);

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(h));
  svg.setAttribute('preserveAspectRatio', 'none');
  const mk = (tag, attrs = {}, txt = '') => {
    const n = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
    if (txt) n.textContent = txt;
    return n;
  };

  svg.appendChild(mk('rect', { x: pad.l, y: pad.t, width: plotW, height: plotH, rx: '12', fill: 'rgba(3,13,22,.58)', stroke: 'rgba(34,211,238,.11)' }));

  for (let i = 0; i <= 4; i++) {
    const yy = pad.t + (i / 4) * plotH;
    svg.appendChild(mk('line', { x1: pad.l, x2: w - pad.r, y1: yy, y2: yy, stroke: 'rgba(148,163,184,.09)', 'stroke-width': '1' }));
    const pv = pMax - (i / 4) * (pMax - pMin);
    svg.appendChild(mk('text', { x: 10, y: yy + 4, fill: '#8fb7c9', 'font-size': '10' }, prettyPrice(pv)));
  }
  for (let i = 0; i <= 5; i++) {
    const xx = pad.l + (i / 5) * plotW;
    svg.appendChild(mk('line', { x1: xx, x2: xx, y1: pad.t, y2: h - pad.b, stroke: 'rgba(148,163,184,.05)', 'stroke-width': '1' }));
  }

  cleanBands.forEach((b) => {
    const bandTop = yPrice(b.high ?? b.price);
    const bandBottom = yPrice(b.low ?? b.price);
    const bandY = Math.min(bandTop, bandBottom);
    const bandH = Math.max(14, Math.abs(bandBottom - bandTop));
    const intensity = Math.max(0.10, Math.min(1, (b.oiUsd || 0) / maxOi));
    const isNear = b === near;
    const isMajor = b === major;
    const above = (b.price || 0) >= current;
    const color = above ? '#ff5d97' : '#24e0a4';
    const fillOpacity = isMajor ? (0.20 + intensity * 0.18) : (0.10 + intensity * 0.16);
    const stroke = isMajor ? '#f8d568' : (isNear ? 'rgba(248,213,104,.60)' : 'rgba(255,255,255,.08)');

    svg.appendChild(mk('rect', {
      x: pad.l + 8,
      y: bandY,
      width: plotW - 16,
      height: bandH,
      rx: Math.min(10, bandH / 2),
      fill: color,
      'fill-opacity': String(fillOpacity),
      stroke,
      'stroke-width': isMajor ? '1.2' : '1'
    }));
    const innerW = Math.max(36, (plotW - 90) * intensity);
    svg.appendChild(mk('rect', {
      x: pad.l + 14,
      y: bandY + Math.max(2, bandH * 0.18),
      width: innerW,
      height: Math.max(4, bandH * 0.64),
      rx: Math.min(8, bandH / 3),
      fill: above ? 'rgba(255,124,164,.22)' : 'rgba(68,241,176,.24)',
      stroke: 'rgba(255,255,255,.04)',
      'stroke-width': '0.8'
    }));

    if (isMajor || isNear) {
      const lx = pad.l + plotW - 140;
      const ly = bandY + Math.max(14, bandH / 2 + 4);
      const label = isMajor ? 'YOĞUN KÜME' : 'GÜNCEL BANT';
      svg.appendChild(mk('rect', { x: lx, y: ly - 14, width: 102, height: 18, rx: '5', fill: isMajor ? 'rgba(245,158,11,.14)' : 'rgba(34,211,238,.12)', stroke: isMajor ? 'rgba(245,158,11,.38)' : 'rgba(34,211,238,.35)' }));
      svg.appendChild(mk('text', { x: lx + 51, y: ly - 2, fill: isMajor ? '#f8d568' : '#7dd3fc', 'font-size': '9', 'font-weight': '800', 'text-anchor': 'middle' }, label));
    }

    svg.appendChild(mk('text', { x: w - 8, y: bandY + Math.max(14, bandH / 2 + 4), fill: '#e6edf6', 'font-size': '10', 'font-weight': '700', 'text-anchor': 'end' }, compactUsd(b.oiUsd || 0)));
  });

  const bodyW = Math.max(4, Math.min(9, (plotW / prices.length) * 0.55));
  prices.forEach((p, i) => {
    const xx = x(i);
    const o = opens[i], c = closes[i], hi = highs[i], lo = lows[i];
    const up = c >= o;
    const col = up ? '#2df0b0' : '#ff6698';
    svg.appendChild(mk('line', { x1: xx, x2: xx, y1: yPrice(hi), y2: yPrice(lo), stroke: col, 'stroke-width': '1.2', opacity: '.94' }));
    const y1 = yPrice(Math.max(o, c));
    const y2 = yPrice(Math.min(o, c));
    svg.appendChild(mk('rect', { x: xx - bodyW / 2, y: Math.min(y1, y2), width: bodyW, height: Math.max(2, Math.abs(y2 - y1)), rx: '1.6', fill: col, opacity: '.96' }));
  });

  const lastY = yPrice(current);
  svg.appendChild(mk('line', { x1: pad.l, x2: w - pad.r, y1: lastY, y2: lastY, stroke: '#f8d568', 'stroke-width': '1.15', 'stroke-dasharray': '6 5', opacity: '.92' }));
  svg.appendChild(mk('rect', { x: w - pad.r + 8, y: lastY - 12, width: 90, height: 24, rx: '6', fill: 'rgba(248,213,104,.14)', stroke: 'rgba(248,213,104,.45)' }));
  svg.appendChild(mk('text', { x: w - pad.r + 53, y: lastY + 4, fill: '#fff3bf', 'font-size': '10', 'font-weight': '800', 'text-anchor': 'middle' }, prettyPrice(current)));

  const tickCount = Math.min(6, prices.length);
  const timeSeries = prices.map((p, i) => Number(p?.time ?? i));
  for (let i = 0; i < tickCount; i++) {
    const idx = Math.round((i / Math.max(1, tickCount - 1)) * (prices.length - 1));
    const xx = x(idx);
    svg.appendChild(mk('text', { x: xx, y: h - 9, fill: '#8fb7c9', 'font-size': '10', 'text-anchor': 'middle' }, formatAxisTime(timeSeries[idx], meta.period || getPeriod())));
  }

  wrap.appendChild(svg);
  wrap.appendChild(el('div', { class: 'derivs-oi-heat-meta compact' },
    el('div', {}, el('strong', {}, 'En yoğun küme: '), el('span', { class: 'mono' }, `${fmtMicroPrice(major.low ?? major.price)} – ${fmtMicroPrice(major.high ?? major.price)} · ${compactUsd(major.oiUsd || 0)}`)),
    el('div', {}, el('strong', {}, 'Güncel fiyat bandı: '), el('span', { class: 'mono' }, `${fmtMicroPrice(near.low ?? near.price)} – ${fmtMicroPrice(near.high ?? near.price)}`)),
    el('div', {}, el('strong', {}, 'Yorum: '), (major.price || 0) > current ? 'Üst tarafta yoğun OI kümesi var; direnç / short baskı bölgesi gibi izlenmeli.' : 'Alt tarafta yoğun OI kümesi var; destek / dip savunma bölgesi gibi izlenmeli.')
  ));
  return wrap;
}


// Ortak: bir SVG çizgi grafiği (zaman serisi). values: sayı dizisi.
function lineChart(values, { w = 760, h = 120, color = '#22d3ee', fill = true, zero = false } = {}) {
  const wrap = el('div', { class: 'derivs-chart', style: 'width:100%;overflow:hidden' });
  if (!values || values.length < 2) {
    wrap.appendChild(el('div', { class: 'small muted', style: 'padding:20px;text-align:center' }, 'Yeterli veri yok'));
    return wrap;
  }
  const min = Math.min(...values), max = Math.max(...values);
  const range = (max - min) || 1;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / range) * (h - 10) - 5;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(h));
  svg.setAttribute('preserveAspectRatio', 'none');
  if (zero && min < 0 && max > 0) {
    const zy = h - ((0 - min) / range) * (h - 10) - 5;
    const zl = document.createElementNS(ns, 'line');
    zl.setAttribute('x1', '0'); zl.setAttribute('x2', String(w));
    zl.setAttribute('y1', String(zy)); zl.setAttribute('y2', String(zy));
    zl.setAttribute('stroke', 'rgba(255,255,255,0.18)'); zl.setAttribute('stroke-width', '1');
    zl.setAttribute('stroke-dasharray', '4 4');
    svg.appendChild(zl);
  }
  if (fill) {
    const area = document.createElementNS(ns, 'polygon');
    area.setAttribute('points', `0,${h} ${pts.join(' ')} ${w},${h}`);
    area.setAttribute('fill', color); area.setAttribute('opacity', '0.12');
    svg.appendChild(area);
  }
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', pts.join(' '));
  line.setAttribute('fill', 'none'); line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2');
  svg.appendChild(line);
  wrap.appendChild(svg);
  return wrap;
}

// Histogram (funding/likidasyon için pozitif/negatif çubuklar)
function histChart(values, { w = 760, h = 120, timestamps = [], yFormatter = null, xFormatter = null, showAxes = false } = {}) {
  const wrap = el('div', { class: 'derivs-chart', style: 'width:100%;overflow:hidden' });
  if (!values || !values.length) {
    wrap.appendChild(el('div', { class: 'small muted', style: 'padding:20px;text-align:center' }, 'Veri yok'));
    return wrap;
  }
  const clean = values.map(v => Number(v)).filter(v => Number.isFinite(v));
  if (!clean.length) {
    wrap.appendChild(el('div', { class: 'small muted', style: 'padding:20px;text-align:center' }, 'Veri yok'));
    return wrap;
  }
  const maxAbs = Math.max(...clean.map(v => Math.abs(v))) || 1;
  const pad = showAxes ? { l: 56, r: 12, t: 10, b: 26 } : { l: 0, r: 0, t: 0, b: 0 };
  const plotW = w - pad.l - pad.r;
  const plotH = h - pad.t - pad.b;
  const n = clean.length;
  const bw = plotW / Math.max(1, n);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(h));
  svg.setAttribute('preserveAspectRatio', 'none');
  const mk = (tag, attrs = {}, text = '') => {
    const node = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    if (text) node.textContent = text;
    return node;
  };
  const mid = pad.t + plotH / 2;
  if (showAxes) {
    const yTicks = [maxAbs, maxAbs / 2, 0, -maxAbs / 2, -maxAbs];
    yTicks.forEach(v => {
      const yy = mid - (v / maxAbs) * (plotH / 2 - 3);
      svg.appendChild(mk('line', { x1: pad.l, x2: w - pad.r, y1: yy, y2: yy, stroke: 'rgba(148,163,184,.10)', 'stroke-width': '1' }));
      svg.appendChild(mk('text', { x: pad.l - 8, y: yy + 4, fill: '#8fb7c9', 'font-size': '10', 'text-anchor': 'end' }, yFormatter ? yFormatter(v) : String(Math.round(v))));
    });
    const xTicks = Math.min(5, n);
    for (let i = 0; i < xTicks; i++) {
      const idx = Math.round((i / Math.max(1, xTicks - 1)) * (n - 1));
      const xx = pad.l + idx * bw + bw * 0.5;
      svg.appendChild(mk('line', { x1: xx, x2: xx, y1: pad.t, y2: h - pad.b, stroke: 'rgba(148,163,184,.05)', 'stroke-width': '1' }));
      const label = xFormatter ? xFormatter(timestamps[idx], idx) : String(idx + 1);
      svg.appendChild(mk('text', { x: xx, y: h - 8, fill: '#8fb7c9', 'font-size': '10', 'text-anchor': 'middle' }, label));
    }
  }
  clean.forEach((v, i) => {
    const bh = (Math.abs(v) / maxAbs) * (plotH / 2 - 4);
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(pad.l + i * bw + 0.5));
    rect.setAttribute('width', String(Math.max(1, bw - 1.5)));
    rect.setAttribute('y', String(v >= 0 ? mid - bh : mid));
    rect.setAttribute('height', String(Math.max(1, bh)));
    rect.setAttribute('fill', v >= 0 ? '#22c55e' : '#ef4444');
    rect.setAttribute('opacity', '0.85');
    svg.appendChild(rect);
  });
  wrap.appendChild(svg);
  return wrap;
}

// Sayfa kabuğu: başlık + sembol/periyot kontrolleri + içerik host
function derivsShell(host, title, subtitle, onRefresh) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title, subtitle,
    actions: [
      el('button', { class: 'select', title: 'Sembolü üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest' }) } }, currentSymbol() + ' ', ICN.chev(10)),
      ...PERIODS.map(p => el('button', {
        class: 'btn sm ' + (getPeriod() === p ? 'outline-cyan' : ''),
        on: { click: () => { setPeriod(p); onRefresh(); } }
      }, p)),
      el('button', { class: 'btn primary', on: { click: () => onRefresh() } }, ICN.refresh(12), 'YENİLE'),
    ]
  }));
  const content = el('div', { 'data-derivs-content': '1' }, el('div', { class: 'small muted', style: 'padding:20px' }, 'Canlı türev veri yükleniyor...'));
  host.appendChild(content);
  return content;
}

function sourceTag(source, errors, quality = 'live') {
  if (!source || source === 'none' || quality === 'offline') return tag('OFFLINE · VERİ YOK', 'red');
  if (quality === 'degraded') return tag('DEGRADED · ' + source.toUpperCase(), 'yellow');
  if (quality === 'cache') return tag('CACHE · ' + source.toUpperCase(), 'yellow');
  return tag('LIVE · ' + source.toUpperCase(), 'green');
}

function suppressOiOverhead(host) {
  const hide = () => {
    try {
      document.querySelectorAll('.rux-card-audit-summary,.rux-ui-audit-summary').forEach(el => { el.style.display = 'none'; });
    } catch {}
  };
  hide();
  [120, 450, 1200, 2600, 4200].forEach(ms => setTimeout(hide, ms));
  const root = document.getElementById('om-page') || host?.parentElement;
  if (root && !root.__oiOverheadObserver) {
    const obs = new MutationObserver(() => hide());
    obs.observe(root, { childList: true, subtree: true });
    root.__oiOverheadObserver = obs;
  }
}

// ───────── 1) OPEN INTEREST ─────────
export async function renderDerivsOI(host) {
  host.innerHTML = '';
  suppressOiOverhead(host);
  const fitShell = el('div', { class: 'derivs-oi-fit-shell' });
  const wrap = el('div', { class: 'derivs-dash derivs-oi-page derivs-oi-fit-target' });
  fitShell.appendChild(wrap);
  host.appendChild(fitShell);
  wrap.appendChild(el('div', { class: 'small muted', style: 'padding:20px' }, 'Açık pozisyon verisi yükleniyor...'));
  try {
    const viewPeriod = getPeriod();
    const d = await fetchDerivs('oi', currentSymbol(), backendPeriod(viewPeriod));
    wrap.innerHTML = '';
    if (!d.ok && (!d.series || !d.series.length)) {
      wrap.appendChild(el('div', { class: 'card', style: 'margin-top:14px' }, el('div', { class: 'small', style: 'color:var(--c-red);padding:16px' }, 'Açık pozisyon verisi alınamadı. ' + (d.errors || []).join('; ') + ' — Vercel\'de canlı veri gelir; yerel/kısıtlı ağda boş olabilir.')));
      return;
    }

    const oiSeries = (d.series || []).map(s => s.oiUsd).filter(v => Number.isFinite(v));
    const priceArr = (d.priceSeries || []).map(p => p.close).filter(v => Number.isFinite(v));
    const last = d.series?.at(-1);
    const tone = (v) => v >= 0 ? 'pos' : 'neg';
    const riskLabel = d.squeezeRisk >= 65 ? 'YÜKSEK' : d.squeezeRisk >= 40 ? 'ORTA' : 'DÜŞÜK';
    const riskTone = d.squeezeRisk >= 65 ? 'neg' : d.squeezeRisk >= 40 ? 'warn' : 'pos';
    const squeezeProfile = oiSqueezeProfile(d);
    const warningCount = [Math.abs(d.oiPriceDivergence) > 0.4, squeezeProfile.maxRisk >= 65, Math.abs(d.oiZScore) > 1.5].filter(Boolean).length;
    const generalBiasValue = d.bias === 'BULLISH' ? 72 : 28;
    const zSeries = oiSeries.length ? oiSeries.map((v, _, a) => {
      const slice = a.slice(Math.max(0, _ - 20), _ + 1);
      const mean = slice.reduce((s, x) => s + x, 0) / (slice.length || 1);
      const variance = slice.reduce((s, x) => s + ((x - mean) ** 2), 0) / Math.max(1, slice.length - 1);
      const std = Math.sqrt(variance) || 1;
      return (v - mean) / std;
    }) : [];
    const momentumSeries = oiSeries.length > 1 ? oiSeries.map((v, i, a) => i ? ((v - a[Math.max(0, i - 7)]) / (a[Math.max(0, i - 7)] || 1)) * 100 : 0) : [];
    const oiDeltaPctSeries = oiSeries.map((v, i, a) => i ? ((v - a[i - 1]) / (a[i - 1] || 1)) * 100 : 0);
    const squeezeTrendSeries = momentumSeries.map((v, i) => Math.max(0, Math.min(100, 50 + Math.abs(v || 0) * 5 + Math.abs(zSeries[i] || 0) * 14)));

    const oiDesktopMeta = { dataQuality: d.dataQuality || 'live', symbol: currentSymbol() + ' Perp', period: periodLabel(viewPeriod), regime: d.regimeLabel || '—', warnings: warningCount };
    wrap.dataset.oiMeta = JSON.stringify(oiDesktopMeta);

    const dqStatus = d.dataQuality || (!oiSeries.length ? 'offline' : 'live');
    const dqLabel = dqStatus === 'live' ? 'Gerçek Zamanlı' : oiStatusLabel(dqStatus);

    const layout = el('div', { class: 'derivs-oi-layout derivs-oi-layout-full' });

    const main = el('div', { class: 'derivs-oi-main derivs-oi-reference-main derivs-oi-main-full' });

    const kpis = el('div', { class: 'derivs-kpi-grid derivs-kpi-grid-oi', 'data-rux-source': 'LIVE' });
    kpis.appendChild(kpiCard({ label: 'Toplam OI', value: last?.oiUsd ? '$' + fmtNum(last.oiUsd) : '—', change: (d.oiDelta24hPct >= 0 ? '+' : '') + d.oiDelta24hPct.toFixed(2) + '% 24s', changeTone: tone(d.oiDelta24hPct), spark: oiSeries.slice(-40), sparkColor: '#3dd5f3', big: true }));
    kpis.appendChild(kpiCard({ label: '24s OI Delta', value: (d.oiDelta24hUsd >= 0 ? '+$' : '-$') + fmtNum(Math.abs(d.oiDelta24hUsd)), change: (d.oiDelta24hPct >= 0 ? '+' : '') + d.oiDelta24hPct.toFixed(2) + '%', changeTone: tone(d.oiDelta24hUsd), spark: oiSeries.slice(-40).map((v, i, a) => i ? v - a[i - 1] : 0), sparkColor: '#27e0a0', big: true }));
    kpis.appendChild(kpiCard({ label: 'OI / Price Divergence', value: (d.oiPriceDivergence >= 0 ? '+' : '') + d.oiPriceDivergence.toFixed(2) + '%', change: d.oiPriceDivergence >= 0 ? 'Boğa Divergence' : 'Ayı Divergence', changeTone: tone(d.oiPriceDivergence), spark: priceArr.slice(-40), sparkColor: '#ff5d97', big: true }));
    kpis.appendChild(kpiCard({ label: 'OI Z-Score', value: d.oiZScore.toFixed(2), change: Math.abs(d.oiZScore) > 1.5 ? 'Ilımlı Yüksek' : 'Normal', changeTone: Math.abs(d.oiZScore) > 1.5 ? 'warn' : 'pos', spark: zSeries.slice(-40), sparkColor: '#22e46f', big: true }));
    kpis.appendChild(kpiCard({ label: 'Net Squeeze', value: squeezeProfile.maxLabel, change: squeezeProfile.dominant, changeTone: squeezeProfile.dominantTone, spark: oiSeries.slice(-40), sparkColor: squeezeProfile.net >= 0 ? '#20e6a1' : '#ff4f8a', big: true }));
    kpis.appendChild(kpiCard({ label: 'Baskın Rejim', value: d.regimeLabel || '—', change: 'Fiyat ' + (d.priceChg24hPct >= 0 ? '↑' : '↓') + ' + OI ' + (d.oiDelta24hPct >= 0 ? '↑' : '↓'), changeTone: d.bias === 'BULLISH' ? 'pos' : 'neg', spark: priceArr.slice(-40), sparkColor: d.bias === 'BULLISH' ? '#21db82' : '#ff5c89', big: true }));
    main.appendChild(kpis);

    const topRow = el('div', { class: 'derivs-oi-top-grid' });
    const chartCard = el('div', { class: 'derivs-panel derivs-hero-card', 'data-rux-source': 'LIVE' });
    const chartHead = el('div', { class: 'derivs-panel-head' });
    chartHead.appendChild(el('div', { class: 'derivs-panel-title xl' }, 'Açık Pozisyon (OI) & Fiyat'));
    const chartActions = el('div', { class: 'derivs-inline-actions' });
    chartActions.appendChild(tag(periodLabel(viewPeriod), 'cyan'));
    if (normalizePeriod(viewPeriod) === '1w') chartActions.appendChild(tag('OI kaynağı 1gün eşlemeli', 'yellow'));
    chartActions.appendChild(sourceTag(d.source, d.errors, d.dataQuality));
    chartHead.appendChild(chartActions);
    chartCard.appendChild(chartHead);
    chartCard.appendChild(candlestickOiOverlay(d.priceSeries || [], d.series || [], { divergence: d.oiPriceDivergence, bias: d.bias, period: viewPeriod }));
    topRow.appendChild(chartCard);

    const insightStack = el('div', { class: 'derivs-oi-insight-stack' });
    const distCard = el('div', { class: 'derivs-panel' });
    distCard.appendChild(el('div', { class: 'derivs-panel-title' }, 'Borsa Dağılımı (OI)'));
    const distInner = el('div', { class: 'derivs-dist' });
    if (d.distribution?.length) {
      distInner.appendChild(donutChart(d.distribution.map(x => ({ value: x.oiUsd, label: x.exchange })), { centerValue: '$' + fmtNum(d.totalOiUsd), centerLabel: 'Toplam' }));
      const legend = el('div', { class: 'derivs-legend' });
      const palette = ['#20d6ee', '#3b82f6', '#f59e0b', '#f8c86d', '#ec4899', '#8b5cf6'];
      d.distribution.forEach((x, i) => legend.appendChild(el('div', { class: 'derivs-legend-row' },
        el('span', { class: 'derivs-legend-dot', style: 'background:' + palette[i % palette.length] }),
        el('span', { class: 'derivs-legend-name' }, x.exchange.toUpperCase()),
        el('span', { class: 'derivs-legend-pct' }, x.pct + '%'),
        el('span', { class: 'derivs-legend-val' }, '$' + fmtNum(x.oiUsd))
      )));
      distInner.appendChild(legend);
    } else {
      distInner.appendChild(el('div', { class: 'small muted' }, 'Borsa dağılımı yok'));
    }
    insightStack.appendChild(distCard);
    insightStack.appendChild(oiDataQualityPanel(d));

    const summaryCard = el('div', { class: 'derivs-panel derivs-summary-grid' });
    summaryCard.appendChild(oiSummaryCard('Baskın Rejim', d.regimeLabel || '—', 'Fiyat/OI kombinasyonu', d.bias === 'BULLISH' ? 'pos' : 'neg'));
    summaryCard.appendChild(oiSummaryCard('Net Squeeze', squeezeProfile.maxLabel, squeezeProfile.dominant, squeezeProfile.dominantTone));
    summaryCard.appendChild(oiSummaryCard('Bias', d.bias === 'BULLISH' ? 'BULLISH' : 'BEARISH', 'Genel eğilim', d.bias === 'BULLISH' ? 'pos' : 'neg'));
    summaryCard.appendChild(oiSummaryCard('Not', dqLabel, d.source ? d.source.toUpperCase() : 'Çoklu kaynak', ''));
    insightStack.appendChild(summaryCard);
    topRow.appendChild(insightStack);

    const commentCard = oiDecisionInsightPanel(d);
    topRow.appendChild(commentCard);
    main.appendChild(topRow);

    const midRow = el('div', { class: 'derivs-oi-mid-grid' });
    const deltaCard = el('div', { class: 'derivs-panel derivs-span-2' });
    deltaCard.appendChild(el('div', { class: 'derivs-panel-head' },
      el('div', { class: 'derivs-panel-title' }, 'OI Delta (24s, %)'),
      el('div', { class: 'derivs-panel-meta ' + tone(d.oiDelta24hPct) }, 'Mevcut: ' + (d.oiDelta24hPct >= 0 ? '+' : '') + d.oiDelta24hPct.toFixed(2) + '%')
    ));
    deltaCard.appendChild(histChart(oiDeltaPctSeries.slice(-60), {
      h: 168,
      showAxes: true,
      timestamps: (d.series || []).slice(-60).map(s => s.time),
      yFormatter: (v) => (v >= 0 ? '+' : '') + Number(v).toFixed(1) + '%',
      xFormatter: (ts) => formatAxisTime(ts, viewPeriod)
    }));
    midRow.appendChild(deltaCard);

    midRow.appendChild(oiActiveRegimeGuidePanel(d));

    const squeezeCard = el('div', { class: 'derivs-panel' });
    squeezeCard.appendChild(el('div', { class: 'derivs-panel-title' }, 'Çift Taraflı Squeeze Haritası'));
    squeezeCard.appendChild(twoSidedSqueezePanel(squeezeProfile));
    midRow.appendChild(squeezeCard);
    main.appendChild(midRow);

    const bottomRow = el('div', { class: 'derivs-oi-bottom-grid' });
    const heatCard = el('div', { class: 'derivs-panel derivs-span-2 derivs-oi-cluster-panel' });
    heatCard.appendChild(el('div', { class: 'derivs-panel-head' },
      el('div', {}, el('div', { class: 'derivs-panel-title' }, 'OI Isı Bantları (Fiyat Bazlı Kümeler)'), el('div', { class: 'small muted' }, 'Grafik üstü OI kümeleri · mumların üstünde fiyat bazlı yoğunluk bantları')),
      el('div', { class: 'derivs-panel-meta' }, 'Grafik Üstü Küme Katmanı')
    ));
    heatCard.appendChild(oiClusterHeatmap(d.heatBands || [], d.priceSeries || [], { currentPrice: priceArr.at(-1), squeezeRisk: d.squeezeRisk, period: viewPeriod }));
    bottomRow.appendChild(heatCard);

    const zCard = el('div', { class: 'derivs-panel' });
    zCard.appendChild(el('div', { class: 'derivs-panel-head' }, el('div', { class: 'derivs-panel-title' }, 'OI Z-Score (21)'), el('div', { class: 'derivs-panel-meta ' + (Math.abs(d.oiZScore) > 1.5 ? 'warn' : 'pos') }, d.oiZScore.toFixed(2))));
    zCard.appendChild(lineChart(zSeries.slice(-60), { h: 90, color: '#27e0a0', zero: true }));
    bottomRow.appendChild(zCard);

    const mCard = el('div', { class: 'derivs-panel' });
    mCard.appendChild(el('div', { class: 'derivs-panel-head' }, el('div', { class: 'derivs-panel-title' }, 'OI Momentum (21)'), el('div', { class: 'derivs-panel-meta ' + tone(d.oiMomentum || 0) }, (d.oiMomentum >= 0 ? '+' : '') + (d.oiMomentum || 0).toFixed(2) + '%')));
    mCard.appendChild(lineChart(momentumSeries.slice(-60), { h: 90, color: '#21db82', zero: true }));
    bottomRow.appendChild(mCard);
    main.appendChild(bottomRow);

    const sigTime = signalTime();
    const sigs = [];
    const spikeSeverity = Math.min(100, Math.round(Math.abs(d.oiZScore || 0) * 28 + Math.abs(d.oiDelta24hPct || 0) * 3));
    const flushSeverity = Math.min(100, Math.round(Math.abs(d.oiDelta24hPct || 0) * 8 + Math.max(0, -d.oiMomentum || 0) * 3));
    const divergenceSeverity = Math.min(100, Math.round(Math.abs(d.oiPriceDivergence || 0) * 22 + Math.abs(d.priceChg24hPct || 0) * 2));
    if (d.oiZScore > 1.5) sigs.push({ name: 'OI SPIKE', sub: currentSymbol() + ' · OI +' + d.oiDelta24hPct.toFixed(1) + '% (' + getPeriod() + ')', tone: 'pos', time: sigTime, severity: spikeSeverity, metric: 'OI Z-Score ' + d.oiZScore.toFixed(2), trigger: 'Z > 1.5', symbol: currentSymbol(), spark: zSeries, sparkColor: '#22c55e' });
    if (d.oiDelta24hPct < -3) sigs.push({ name: 'OI FLUSH', sub: currentSymbol() + ' · OI ' + d.oiDelta24hPct.toFixed(1) + '%', tone: 'neg', time: sigTime, severity: flushSeverity, metric: 'OI Delta ' + d.oiDelta24hPct.toFixed(1) + '%', trigger: 'Δ < -3%', symbol: currentSymbol(), spark: oiDeltaPctSeries, sparkColor: '#f43f5e' });
    if (squeezeProfile.longRisk >= 70) sigs.push({ name: 'CROWDED LONGS', sub: 'Long squeeze riski ' + squeezeProfile.longRisk + '/100', tone: 'neg', time: sigTime, severity: squeezeProfile.longRisk, metric: 'Long SQ', trigger: 'Risk ≥ 70', symbol: currentSymbol(), spark: squeezeTrendSeries, sparkColor: '#fb7185' });
    if (squeezeProfile.shortRisk >= 70) sigs.push({ name: 'CROWDED SHORTS', sub: 'Short squeeze riski ' + squeezeProfile.shortRisk + '/100', tone: 'warn', time: sigTime, severity: squeezeProfile.shortRisk, metric: 'Short SQ', trigger: 'Risk ≥ 70', symbol: currentSymbol(), spark: squeezeTrendSeries, sparkColor: '#f59e0b' });
    if (d.oiPriceDivergence < -0.5) sigs.push({ name: 'DIVERGENCE ALERT', sub: 'Fiyat / OI ' + d.oiPriceDivergence.toFixed(1) + '%', tone: 'neg', time: sigTime, severity: divergenceSeverity, metric: 'Divergence', trigger: 'Uyumsuzluk', symbol: currentSymbol(), spark: priceArr, sparkColor: '#f43f5e' });
    sigs.push({ name: 'REJİM', sub: d.regimeLabel + ' · ' + (d.bias === 'BULLISH' ? 'Boğa teyidi' : 'Ayı baskısı'), tone: d.bias === 'BULLISH' ? 'pos' : 'neg', time: sigTime, severity: Math.max(35, Math.min(100, Math.round(Math.abs(d.oiDelta24hPct || 0) * 4 + Math.abs(d.oiZScore || 0) * 18 + 45))), metric: 'Rejim', trigger: 'Fiyat/OI', symbol: currentSymbol(), spark: momentumSeries, sparkColor: d.bias === 'BULLISH' ? '#22c55e' : '#f43f5e' });
    main.appendChild(signalStrip('Son OI Sinyalleri', sigs));

    layout.appendChild(main);
    wrap.appendChild(layout);
    scheduleOiViewportFit(fitShell, wrap);
  } catch (e) {
    wrap.innerHTML = '';
    wrap.appendChild(el('div', { class: 'small muted', style: 'padding:16px' }, 'Hata: ' + (e?.message || e)));
  }
}

// İki seriyi (farklı ölçekli) normalize edip üst üste çizen grafik
function dualLineChart(seriesA, seriesB, { w = 720, h = 200, labelA = 'A', labelB = 'B' } = {}) {
  const wrap = el('div', { class: 'derivs-chart', style: 'width:100%;overflow:hidden' });
  const norm = (arr) => { if (!arr || arr.length < 2) return []; const mn = Math.min(...arr), mx = Math.max(...arr), r = (mx - mn) || 1; return arr.map(v => (v - mn) / r); };
  const a = norm(seriesA), b = norm(seriesB);
  if (!a.length && !b.length) { wrap.appendChild(el('div', { class: 'small muted', style: 'padding:20px;text-align:center' }, 'Yeterli veri yok')); return wrap; }
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', '100%'); svg.setAttribute('height', String(h)); svg.setAttribute('preserveAspectRatio', 'none');
  const toPts = (arr) => arr.map((v, i) => `${((i / (arr.length - 1)) * w).toFixed(1)},${(h - v * (h - 16) - 8).toFixed(1)}`).join(' ');
  [[b, '#3b82f6'], [a, '#22d3ee']].forEach(([arr, col]) => { if (arr.length > 1) { const pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', toPts(arr)); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', col); pl.setAttribute('stroke-width', '2'); svg.appendChild(pl); } });
  wrap.appendChild(svg);
  wrap.appendChild(el('div', { class: 'derivs-chart-legend' }, el('span', {}, el('span', { class: 'derivs-legend-dot', style: 'background:#22d3ee' }), ' ' + labelA), el('span', {}, el('span', { class: 'derivs-legend-dot', style: 'background:#3b82f6' }), ' ' + labelB)));
  return wrap;
}

// ───────── 2) FUNDING ─────────
export async function renderDerivsFunding(host) {
  host.innerHTML = '';
  suppressOiOverhead(host);
  const root = el('div', { class: 'derivs-dash derivs-funding-page', 'data-rux-source': 'LIVE' });
  host.appendChild(root);
  root.appendChild(el('div', { class: 'funding-loading' }, 'Fonlama paneli canlı veriyle yükleniyor...'));

  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, Number(v) || 0));
  const num = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;
  const std = (arr) => { const m = avg(arr); return arr.length > 1 ? Math.sqrt(arr.reduce((s,x)=>s+(x-m)**2,0) / arr.length) : 0; };
  const fmtRate = (rate, digits = 4, plus = false) => {
    const n = Number(rate);
    if (!Number.isFinite(n)) return '—';
    const v = n * 100;
    const s = plus && v > 0 ? '+' : '';
    return s + v.toFixed(digits) + '%';
  };
  const fmtPctPlain = (pct, digits = 2, plus = false) => {
    const n = Number(pct);
    if (!Number.isFinite(n)) return '—';
    return (plus && n > 0 ? '+' : '') + n.toFixed(digits) + '%';
  };
  const fmtPriceCompact = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    if (Math.abs(n) >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
    if (Math.abs(n) >= 1) return '$' + n.toFixed(2);
    return '$' + n.toPrecision(4);
  };
  const movingAvg = (arr, win) => arr.map((_, i) => avg(arr.slice(Math.max(0, i - win + 1), i + 1)));
  const formatDateShort = (ts) => {
    try { return new Date(Number(ts)).toLocaleDateString('tr-TR', { day:'numeric', month:'short' }); } catch { return ''; }
  };
  const toneByRate = (r) => Number(r) >= 0 ? 'pos' : 'neg';
  const annualized = (r) => Number.isFinite(Number(r)) ? Number(r) * 365 * 3 * 100 : null;
  const fundingWindowSize = (tf) => ({ '5m': 18, '15m': 24, '1h': 36, '4h': 72, '1d': 126, '1w': 210 }[normalizePeriod(tf)] || 72);
  const priceWindowSize = (tf) => ({ '5m': 180, '15m': 180, '1h': 168, '4h': 150, '1d': 120, '1w': 104 }[normalizePeriod(tf)] || 150);
  const selectedTf = () => normalizePeriod(getPeriod());

  const mkSvg = (w, h, cls = '') => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(h));
    svg.setAttribute('preserveAspectRatio', 'none');
    if (cls) svg.setAttribute('class', cls);
    const n = (tag, attrs = {}, text = '') => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
      if (text !== '') node.textContent = String(text);
      return node;
    };
    return { svg, n };
  };

  const sparkSvg = (values = [], { w = 92, h = 26, color = '#17e8a6', zero = false } = {}) => {
    const vals = values.map(Number).filter(Number.isFinite);
    const wrap = el('span', { class: 'funding-spark' });
    if (vals.length < 2) return wrap;
    const { svg, n } = mkSvg(w, h);
    const mn = Math.min(...vals, zero ? 0 : Infinity);
    const mx = Math.max(...vals, zero ? 0 : -Infinity);
    const rg = (mx - mn) || 1;
    const pts = vals.map((v, i) => {
      const x = (i / Math.max(1, vals.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - mn) / rg) * (h - 5);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    svg.appendChild(n('polyline', { points: pts, fill: 'none', stroke: color, 'stroke-width': 1.7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    wrap.appendChild(svg);
    return wrap;
  };

  const panel = (className, ...children) => el('div', { class: 'funding-card ' + (className || '') }, ...children);
  const panelTitle = (title, sub = '', info = false) => el('div', { class: 'funding-card-head' },
    el('div', { class: 'funding-card-title-wrap' }, el('div', { class: 'funding-card-title' }, title, info ? el('span', { class: 'funding-info-dot' }, 'i') : null), sub ? el('div', { class: 'funding-card-sub' }, sub) : null)
  );
  const metricBlock = ({ label, value, sub, tone = 'pos', micro }) => el('div', { class: 'funding-metric ' + tone },
    el('div', { class: 'funding-metric-label' }, label),
    el('div', { class: 'funding-metric-value' }, value),
    el('div', { class: 'funding-metric-micro' }, micro || ''),
    el('div', { class: 'funding-metric-sub ' + tone }, sub || '')
  );
  const statusChip = ({ label, value, tone = '', icon = '' }) => el('div', { class: 'funding-status-chip ' + tone },
    el('div', { class: 'funding-status-label' }, label),
    el('div', { class: 'funding-status-value' }, icon ? el('span', { class: 'funding-status-icon' }, icon) : null, value)
  );

  const fundingHeader = ({ dataQuality, symbol, tf, regime, warnings }) => el('div', { class: 'funding-topbar' },
    el('div', { class: 'funding-titlebar' },
      el('div', { class: 'funding-rx-logo' }, 'RX'),
      el('div', {},
        el('div', { class: 'funding-page-title' }, 'Funding Paneli'),
        el('div', { class: 'funding-page-subtitle' }, 'Fonlama dengesi, aşırı kalabalık pozisyonlar ve yönsel baskı analizi')
      )
    )
  );

  const fundingHistoryChart = (hist, priceSeries, tf = selectedTf()) => {
    const hRows = (hist || []).filter(x => Number.isFinite(Number(x.rate))).slice(-fundingWindowSize(tf));
    const pRows = (priceSeries || []).filter(x => Number.isFinite(Number(x.close))).slice(-priceWindowSize(tf));
    const wrap = el('div', { class: 'funding-chart-wrap funding-history-chart' });
    if (hRows.length < 2) { wrap.appendChild(el('div', { class: 'funding-empty' }, 'Funding geçmişi için yeterli canlı veri yok.')); return wrap; }
    const W = 940, H = 238, pad = { l: 64, r: 58, t: 16, b: 30 };
    const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    const rates = hRows.map(x => Number(x.rate) * 100);
    const absMax = Math.max(0.04, ...rates.map(x => Math.abs(x))) * 1.45;
    const prices = pRows.length >= 2 ? pRows.map(x => Number(x.close)) : [];
    const pMin = prices.length ? Math.min(...prices) : 0;
    const pMax = prices.length ? Math.max(...prices) : 1;
    const pRg = (pMax - pMin) || 1;
    const { svg, n } = mkSvg(W, H);
    const x = i => pad.l + (i / Math.max(1, hRows.length - 1)) * plotW;
    const yRate = v => pad.t + (1 - ((v + absMax) / (absMax * 2))) * plotH;
    const yPrice = v => pad.t + (1 - ((v - pMin) / pRg)) * plotH;
    svg.appendChild(n('rect', { x: pad.l, y: pad.t, width: plotW, height: plotH, rx: 10, fill: 'rgba(2,16,27,.44)', stroke: 'rgba(0,225,255,.08)' }));
    [-absMax, -absMax/2, 0, absMax/2, absMax].forEach(v => {
      const yy = yRate(v);
      svg.appendChild(n('line', { x1: pad.l, x2: pad.l + plotW, y1: yy, y2: yy, stroke: v === 0 ? 'rgba(20,255,178,.55)' : 'rgba(111,170,190,.13)', 'stroke-width': v === 0 ? 1.2 : 1, 'stroke-dasharray': v === 0 ? '0' : '3 5' }));
      svg.appendChild(n('text', { x: pad.l - 10, y: yy + 4, fill: '#a8c4d1', 'font-size': 11, 'text-anchor': 'end' }, v.toFixed(3) + '%'));
    });
    [0.04, -0.04].forEach(v => svg.appendChild(n('line', { x1: pad.l, x2: pad.l + plotW, y1: yRate(v), y2: yRate(v), stroke: '#ff3d76', 'stroke-width': 1.2, 'stroke-dasharray': '6 4', opacity: .75 })));
    const bw = plotW / hRows.length;
    rates.forEach((v, i) => {
      const y0 = yRate(0), yv = yRate(v);
      svg.appendChild(n('rect', { x: x(i) - bw * .33, y: Math.min(y0, yv), width: Math.max(2, bw * .66), height: Math.max(1, Math.abs(y0 - yv)), rx: 1.5, fill: v >= 0 ? '#00dda0' : '#ff3d76', opacity: .9 }));
    });
    if (prices.length >= 2) {
      const aligned = prices.slice(-hRows.length);
      const pts = aligned.map((v, i) => `${x(i + (hRows.length - aligned.length)).toFixed(1)},${yPrice(v).toFixed(1)}`).join(' ');
      svg.appendChild(n('polyline', { points: pts, fill: 'none', stroke: '#238dff', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      [pMin, (pMin+pMax)/2, pMax].forEach(v => svg.appendChild(n('text', { x: W - 10, y: yPrice(v) + 4, fill: '#9cc3da', 'font-size': 11, 'text-anchor': 'end' }, Math.round(v/1000) + 'K')));
    }
    const ticks = Math.min(6, hRows.length);
    for (let i=0;i<ticks;i++) {
      const idx = Math.round((i / Math.max(1, ticks - 1)) * (hRows.length - 1));
      svg.appendChild(n('text', { x: x(idx), y: H - 8, fill: '#a8c4d1', 'font-size': 11, 'text-anchor': 'middle' }, formatDateShort(hRows[idx].time)));
    }
    const last = rates.at(-1);
    const lastY = yRate(last);
    svg.appendChild(n('rect', { x: W - 55, y: lastY - 12, width: 50, height: 22, rx: 6, fill: 'rgba(0,229,166,.16)', stroke: 'rgba(0,229,166,.55)' }));
    svg.appendChild(n('text', { x: W - 30, y: lastY + 4, fill: '#00f0ae', 'font-size': 11, 'font-weight': 800, 'text-anchor': 'middle' }, last.toFixed(4) + '%'));
    wrap.appendChild(svg);
    return wrap;
  };

  const cumulativeChart = (hist, tf = selectedTf()) => {
    const rows = (hist || []).filter(x => Number.isFinite(Number(x.rate))).slice(-Math.max(24, fundingWindowSize(tf)));
    const wrap = el('div', { class: 'funding-chart-wrap funding-cum-chart' });
    if (rows.length < 2) { wrap.appendChild(el('div', { class: 'funding-empty' }, 'Kümülatif hesap için yeterli veri yok.')); return wrap; }
    let c = 0;
    const cum = rows.map(x => (c += Number(x.rate) * 100));
    const ma = movingAvg(cum, 21);
    const W = 650, H = 142, pad = { l: 48, r: 48, t: 10, b: 24 };
    const plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    const mn = Math.min(-0.01, ...cum, ...ma), mx = Math.max(0.01, ...cum, ...ma);
    const rg = (mx - mn) || 1;
    const { svg, n } = mkSvg(W, H);
    const x = i => pad.l + (i / Math.max(1, rows.length - 1)) * plotW;
    const y = v => pad.t + (1 - ((v - mn) / rg)) * plotH;
    [mx, (mx+mn)/2, mn].forEach(v => { const yy=y(v); svg.appendChild(n('line',{x1:pad.l,x2:pad.l+plotW,y1:yy,y2:yy,stroke:'rgba(111,170,190,.13)','stroke-dasharray':'3 5'})); svg.appendChild(n('text',{x:pad.l-8,y:yy+4,fill:'#a8c4d1','font-size':10,'text-anchor':'end'},v.toFixed(1)+'%')); });
    const line = (arr, color) => svg.appendChild(n('polyline', { points: arr.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    line(cum, '#00e6aa'); line(ma, '#ffb000');
    const ticks = Math.min(6, rows.length);
    for (let i=0;i<ticks;i++) { const idx=Math.round((i/Math.max(1,ticks-1))*(rows.length-1)); svg.appendChild(n('text',{x:x(idx),y:H-6,fill:'#a8c4d1','font-size':10,'text-anchor':'middle'},formatDateShort(rows[idx].time))); }
    const label = (value, color, off=0) => { const yy=y(value)+off; svg.appendChild(n('rect',{x:W-45,y:yy-11,width:42,height:20,rx:5,fill:'rgba(3,18,30,.92)',stroke:color})); svg.appendChild(n('text',{x:W-24,y:yy+3,fill:color,'font-size':10,'font-weight':800,'text-anchor':'middle'},value.toFixed(2)+'%')); };
    label(cum.at(-1), '#00e6aa', -4); label(ma.at(-1), '#ffb000', 18);
    wrap.appendChild(svg); return wrap;
  };

  const donutPanel = (items, center) => {
    const clean = items.filter(x => Number.isFinite(Number(x.value)));
    const total = clean.reduce((s,x)=>s+Math.abs(x.value),0) || 1;
    const { svg, n } = mkSvg(176, 176, 'funding-donut-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    let a = -Math.PI / 2;
    const cx = 88, cy = 88, r = 58, sw = 28;
    clean.forEach((it) => {
      const frac = Math.max(0.035, Math.abs(it.value) / total);
      const a2 = a + frac * Math.PI * 2;
      const x1 = cx + r * Math.cos(a), y1 = cy + r * Math.sin(a), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      svg.appendChild(n('path', { d: `M ${x1} ${y1} A ${r} ${r} 0 ${frac > .5 ? 1 : 0} 1 ${x2} ${y2}`, fill: 'none', stroke: it.color, 'stroke-width': sw, 'stroke-linecap': 'butt' }));
      a = a2;
    });
    svg.appendChild(n('circle', { cx, cy, r: 39, fill: 'rgba(5,20,31,.94)', stroke: 'rgba(255,255,255,.05)' }));
    svg.appendChild(n('text', { x: cx, y: cy - 8, fill: '#b8ccd8', 'font-size': 12, 'text-anchor': 'middle' }, 'Ağırlıklı'));
    svg.appendChild(n('text', { x: cx, y: cy + 8, fill: '#b8ccd8', 'font-size': 12, 'text-anchor': 'middle' }, 'Funding'));
    svg.appendChild(n('text', { x: cx, y: cy + 28, fill: '#ffffff', 'font-size': 15, 'font-weight': 800, 'text-anchor': 'middle' }, center));
    const legend = el('div', { class: 'funding-exchange-legend' });
    clean.forEach(it => legend.appendChild(el('div', { class: 'funding-exchange-row' }, el('span', { class: 'funding-exchange-dot', style: 'background:' + it.color }), el('span', {}, it.label), el('b', {}, fmtRate(it.value, 4)))));
    return el('div', { class: 'funding-donut-layout' }, el('div', { class: 'funding-donut' }, svg), legend);
  };

  const gaugePanel = (score, label) => {
    const W = 280, H = 154, cx = 140, cy = 126, r = 96;
    const { svg, n } = mkSvg(W, H, 'funding-gauge-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const arc = (a1, a2, color) => {
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      svg.appendChild(n('path', { d: `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`, fill: 'none', stroke: color, 'stroke-width': 17, 'stroke-linecap': 'butt' }));
    };
    arc(Math.PI, Math.PI*1.36, '#ff496e'); arc(Math.PI*1.36, Math.PI*1.65, '#ffbd14'); arc(Math.PI*1.65, Math.PI*2, '#05d68d');
    for (let i=0;i<=24;i++) { const a=Math.PI+(i/24)*Math.PI; const rr=i%4===0?r+4:r+1; svg.appendChild(n('line',{x1:cx+(r-15)*Math.cos(a),y1:cy+(r-15)*Math.sin(a),x2:cx+rr*Math.cos(a),y2:cy+rr*Math.sin(a),stroke:i%4===0?'rgba(232,246,255,.75)':'rgba(232,246,255,.35)','stroke-width':i%4===0?1.4:1})); }
    const angle = Math.PI + clamp(score, -100, 100) / 200 * Math.PI + Math.PI / 2;
    const nx = cx + (r - 16) * Math.cos(angle), ny = cy + (r - 16) * Math.sin(angle);
    svg.appendChild(n('line', { x1: cx, y1: cy, x2: nx, y2: ny, stroke: '#eef7ff', 'stroke-width': 3, 'stroke-linecap': 'round' }));
    svg.appendChild(n('circle', { cx, cy, r: 5, fill: '#eef7ff' }));
    svg.appendChild(n('text',{x:cx,y:cy-4,fill:'#0bffac','font-size':25,'font-weight':800,'text-anchor':'middle'},String(Math.round(score))));
    svg.appendChild(n('text',{x:cx,y:cy+18,fill:'#0bffac','font-size':14,'font-weight':700,'text-anchor':'middle'},label));
    svg.appendChild(n('text',{x:cx-r+4,y:cy+7,fill:'#a8c4d1','font-size':12,'text-anchor':'middle'},'-100'));
    svg.appendChild(n('text',{x:cx,y:cy-r-7,fill:'#a8c4d1','font-size':12,'text-anchor':'middle'},'0'));
    svg.appendChild(n('text',{x:cx+r-4,y:cy+7,fill:'#a8c4d1','font-size':12,'text-anchor':'middle'},'100'));
    return svg;
  };

  const zoneTable = (z) => {
    const rows = [
      ['🔬', 'Aşırı Pozitif Funding (Z > 2)', 'Aşırı long kalabalığı, düzeltme riski yüksek', z > 2],
      ['🟡', 'Pozitif (0 < Z ≤ 2)', 'Long baskı mevcut, yön teyidi', z > 0 && z <= 2],
      ['🪶', 'Nötr (−1 ≤ Z ≤ 1)', 'Dengeli piyasa, yönsüz', z >= -1 && z <= 1],
      ['♆', 'Negatif (−2 ≤ Z < 0)', 'Short baskı mevcut, yön teyidi', z < 0 && z >= -2],
      ['🧬', 'Aşırı Negatif (Z < −2)', 'Aşırı short kalabalığı, short squeeze riski', z < -2],
    ];
    return el('div', { class: 'funding-zone-table' }, rows.map(r => el('div', { class: 'funding-zone-row ' + (r[3] ? 'active' : '') }, el('span', { class: 'funding-zone-icon' }, r[0]), el('b', {}, r[1]), el('span', {}, r[2]), el('em', {}, r[3] ? 'Aktif' : 'Aktif Değil'))));
  };

  const miniTerm = (label, rate, series, sub) => el('div', { class: 'funding-term-cell ' + toneByRate(rate) },
    el('div', { class: 'funding-term-label' }, label),
    el('div', { class: 'funding-term-value' }, fmtRate(rate, 4)),
    el('div', { class: 'funding-term-sub ' + toneByRate(rate) }, sub || (Number(rate) >= 0 ? 'Long öder' : 'Short öder')),
    sparkSvg(series, { w: 94, h: 24, color: Number(rate) >= 0 ? '#00e6aa' : '#ff4d78', zero: true })
  );
  const snapshotCell = (label, z, vals) => {
    const tone = z >= 1.8 ? 'neg' : z >= .75 ? 'pos' : z <= -.75 ? 'pos' : 'neutral';
    const text = z >= 1.8 ? 'Aşırı Pozitif' : z >= .75 ? 'Pozitif' : z <= -.75 ? 'Negatif' : 'Nötr';
    return el('div', { class: 'funding-snapshot-cell ' + tone },
      el('div', { class: 'funding-snapshot-label' }, label),
      el('div', { class: 'funding-snapshot-z' }, z.toFixed(2)),
      el('div', { class: 'funding-snapshot-sub' }, text),
      sparkSvg(vals, { w: 86, h: 24, color: tone === 'neg' ? '#ff4d78' : tone === 'pos' ? '#00e6aa' : '#a9ecff', zero: true })
    );
  };

  try {
    const tfNow = selectedTf();
    const d = await fetchDerivs('funding', currentSymbol(), backendPeriod(tfNow));
    root.innerHTML = '';
    const exchanges = d?.exchanges || {};
    const hist = (d?.history || []).map(x => ({ time: Number(x.time), rate: Number(x.rate ?? x.fundingRate) })).filter(x => Number.isFinite(x.rate));
    const priceSeries = (d?.priceSeries || []).map(x => ({ time: Number(x.time), close: Number(x.close) })).filter(x => Number.isFinite(x.close));
    const rates = hist.map(x => x.rate);
    const current = num(d?.currentFunding ?? exchanges.binance?.funding ?? rates.at(-1), null);
    if (!Number.isFinite(current) && !Object.keys(exchanges).length && hist.length < 2) {
      root.appendChild(el('div', { class: 'funding-error-card' }, 'Funding verisi alınamadı. ' + ((d?.errors || []).join('; ') || 'Canlı kaynaklar şu anda yanıt vermiyor.')));
      return;
    }
    const avg7 = Number.isFinite(Number(d?.avg7d)) ? Number(d.avg7d) : avg(rates.slice(-21));
    const avg24 = Number.isFinite(Number(d?.avg24h)) ? Number(d.avg24h) : avg(rates.slice(-3));
    const avg3d = Number.isFinite(Number(d?.avg3d)) ? Number(d.avg3d) : avg(rates.slice(-9));
    const z30 = Number.isFinite(Number(d?.zScore30d)) ? Number(d.zScore30d) : (() => { const r = rates.slice(-90); const s = std(r); return s ? (current - avg(r)) / s : 0; })();
    const annual = Number.isFinite(Number(d?.annualizedPct)) ? Number(d.annualizedPct) : annualized(current);
    const vol7 = Number.isFinite(Number(d?.vol7d)) ? Number(d.vol7d) : std(rates.slice(-21));
    const volRatio = (() => { const s7 = std(rates.slice(-21)); const s30 = std(rates.slice(-90)); return s30 ? s7 / s30 : 1; })();
    const priceChg = priceSeries.length > 5 ? ((priceSeries.at(-1).close - priceSeries.at(-7).close) / priceSeries.at(-7).close) * 100 : 0;
    const warnings = [Math.abs(z30) > 2, Math.abs(annual || 0) > 30, volRatio > 1.8, Math.abs(num(d?.basis?.indexPremiumPct, 0)) > 0.05].filter(Boolean).length;
    const longCrowded = current > 0 && z30 > .75;
    const shortCrowded = current < 0 && z30 < -.75;
    const regime = longCrowded && priceChg >= 0 ? 'Trend Teyidi' : shortCrowded && priceChg <= 0 ? 'Short Teyidi' : current > 0 ? 'Long Baskın' : current < 0 ? 'Short Baskın' : 'Nötr';
    const crowdScore = clamp(50 + z30 * 13 + Math.abs(annual || 0) * .28 + (current > 0 ? 8 : -8), -100, 100);
    const crowdLabel = current >= 0 ? 'Crowded Longs' : 'Crowded Shorts';
    const riskTitle = Math.abs(z30) >= 2 || volRatio >= 2 ? 'YÜKSEK' : Math.abs(z30) >= 1 ? 'ORTA' : 'DÜŞÜK';
    const riskTone = riskTitle === 'YÜKSEK' ? 'neg' : riskTitle === 'ORTA' ? 'warn' : 'pos';

    root.appendChild(fundingHeader({ dataQuality: d?.dataQuality || 'live', symbol: currentSymbol(), tf: getPeriod(), regime, warnings }));

    const kpiRow = el('div', { class: 'funding-kpi-row' });
    const kpiMain = panel('funding-kpi-main');
    kpiMain.append(
      metricBlock({ label: 'Mevcut Funding (8s)', value: fmtRate(current, 4), micro: '≈ ' + fmtPriceCompact((exchanges.binance?.markPrice || exchanges.binance?.indexPrice || priceSeries.at(-1)?.close || 0) * Math.abs(current)) + ' (Tahmini maliyet)', sub: current >= 0 ? 'Long öder' : 'Short öder', tone: toneByRate(current) }),
      metricBlock({ label: 'Ortalama Funding (7G)', value: fmtRate(avg7, 4), micro: '≈ ' + fmtPriceCompact((exchanges.binance?.markPrice || priceSeries.at(-1)?.close || 0) * Math.abs(avg7 || 0)), sub: avg7 >= 0 ? 'Long öder' : 'Short öder', tone: toneByRate(avg7) }),
      metricBlock({ label: 'Yıllıklandırılmış Funding', value: fmtPctPlain(annual, 2), micro: '% APR', sub: annual >= 0 ? 'Long öder' : 'Short öder', tone: toneByRate(current) }),
      metricBlock({ label: 'Funding Z-Score (30G)', value: z30.toFixed(2), micro: '', sub: z30 > 2 ? 'Aşırı Pozitif' : z30 < -2 ? 'Aşırı Negatif' : z30 >= 0 ? 'Pozitif' : 'Negatif', tone: Math.abs(z30) > 2 ? 'neg' : Math.abs(z30) > 1 ? 'warn' : 'pos' }),
      metricBlock({ label: 'Crowding Riski (IZI)', value: riskTitle, micro: '', sub: current >= 0 ? 'Long Crowded' : 'Short Crowded', tone: riskTone })
    );
    kpiRow.appendChild(kpiMain);
    kpiRow.appendChild(panel('funding-regime-card',
      el('div', {}, el('div', { class: 'funding-regime-label' }, 'Baskın Rejim'), el('div', { class: 'funding-regime-value ' + (current >= 0 ? 'pos' : 'neg') }, regime), el('div', { class: 'funding-regime-sub' }, current >= 0 ? 'Long baskın' : 'Short baskın')),
      el('div', { class: 'funding-regime-icon' }, '▰')
    ));
    root.appendChild(kpiRow);

    const exchangeItems = [
      ['Binance', exchanges.binance?.funding, '#ffb000'], ['Bybit', exchanges.bybit?.funding, '#2494ff'], ['OKX', exchanges.okx?.funding, '#f1f5f9'], ['Hyperliquid', exchanges.hyperliquid?.funding, '#22e0bb'], ['CME', exchanges.cme?.funding, '#a855f7']
    ].filter(x => Number.isFinite(Number(x[1]))).map(x => ({ label: x[0], value: Number(x[1]), color: x[2] }));

    const topGrid = el('div', { class: 'funding-top-grid' });
    const historyCard = panel('funding-history-card');
    historyCard.appendChild(el('div', { class: 'funding-card-head with-actions' }, panelTitle('Funding Rate Geçmişi').firstElementChild,
      el('div', { class: 'funding-chart-legend' }, el('span', { class: 'line green' }, 'Funding Rate (8s, Yıllıklandırılmış)'), el('span', { class: 'line blue' }, currentSymbol() + ' Fiyat')),
      el('div', { class: 'funding-chart-tabs' }, ['Çizgi','Alan','7G','30G','90G'].map(t => el('button', { class: t === '30G' ? 'active' : '' }, t)))
    ));
    historyCard.appendChild(fundingHistoryChart(hist, priceSeries, tfNow));
    topGrid.appendChild(historyCard);
    const donutCard = panel('funding-exchange-card', panelTitle('Borsa Karşılaştırması', '(Yıllıklandırılmış)', true), donutPanel(exchangeItems, fmtRate(current, 4)), el('div', { class: 'funding-exchange-total' }, el('span', {}, 'Toplam (Ağırlıklı)'), el('b', {}, fmtRate(current, 4))));
    topGrid.appendChild(donutCard);
    const comments = [
      { icon:'〽', text: current >= 0 ? 'Nötrden pozitife kayan güçlü long baskısı.' : 'Nötrden negatife kayan güçlü short baskısı.', tone: current >= 0 ? 'pos' : 'neg' },
      { icon:'●', text: 'Funding ' + (current >= 0 ? 'pozitif' : 'negatif') + ' ve Z-Score ' + (Math.abs(z30) > 1 ? 'yüksek.' : 'normal bölgede.'), tone: Math.abs(z30) > 1 ? 'pos' : 'neutral' },
      { icon:'●', text: exchangeItems.length > 1 ? 'Borsa verileri canlı akıştan derleniyor; CME sadece proxy.' : 'Borsa doğrulaması kısmi; ana kaynak Binance.', tone: 'warn' },
      { icon:'●', text: Math.abs(z30) > 1.5 ? 'Mean reversion riski artıyor; kısa vadede düzeltme olası.' : 'Mean reversion riski düşük/orta.', tone: 'neg' },
      { icon:'●', text: 'Spot/Perp farkı pozitifse long talebi daha baskın izlenir.', tone: 'pos' },
      { icon:'●', text: Math.abs(z30) > 2 ? 'Aşırı funding devam ederse squeeze riski yükselebilir.' : 'Aşırı funding eşiği henüz tam kırılmadı.', tone: 'warn' },
    ];
    topGrid.appendChild(panel('funding-comment-card', panelTitle('Tek Bakışta Yorum'), el('div', { class: 'funding-comment-list' }, comments.map(c => el('div', { class: 'funding-comment-item ' + c.tone }, el('span', {}, c.icon), el('p', {}, c.text))))));
    root.appendChild(topGrid);

    const midGrid = el('div', { class: 'funding-mid-grid' });
    const cumCard = panel('funding-cumulative-card', panelTitle('Kümülatif Funding Maliyeti', '(Yıllıklandırılmış)'), el('div', { class: 'funding-mini-legend' }, el('span', { class:'green' }, 'Kümülatif Funding'), el('span', { class:'yellow' }, '7G MA')), cumulativeChart(hist, tfNow));
    midGrid.appendChild(cumCard);
    midGrid.appendChild(panel('funding-zone-card', panelTitle('Extreme Zone / Rejim Rehberi', '', true), zoneTable(z30)));
    midGrid.appendChild(panel('funding-gauge-card', panelTitle('Crowding Göstergesi'), gaugePanel(crowdScore, crowdLabel)));
    root.appendChild(midGrid);

    const lowerGrid = el('div', { class: 'funding-lower-grid' });
    const recentRates = rates.slice(-28);
    const chunks = {
      h8: recentRates.slice(-10), h24: movingAvg(recentRates, 3).slice(-10), d3: movingAvg(recentRates, 9).slice(-10), d7: movingAvg(recentRates, 21).slice(-10)
    };
    lowerGrid.appendChild(panel('funding-term-card', panelTitle('Vade Yapısı', '(Yıllıklandırılmış) Funding'), el('div', { class: 'funding-term-grid' },
      miniTerm('8s (Mevcut)', current, chunks.h8), miniTerm('24s', avg24, chunks.h24), miniTerm('3G', avg3d, chunks.d3), miniTerm('7G', avg7, chunks.d7)
    ), el('div', { class: 'funding-term-footer' }, el('span', {}, 'Eğim: ' + (current > avg7 ? 'Yukarı' : 'Düzleşiyor')), el('span', {}, 'Yorum: ' + (current > avg7 ? 'Kısa vadede premium yüksek.' : 'Vade uzadıkça baskı azalıyor.')))));
    const zForWin = (win) => { const arr = rates.slice(-win); const s = std(arr); return s ? (current - avg(arr)) / s : 0; };
    lowerGrid.appendChild(panel('funding-snapshot-card', panelTitle('Zaman Dilimi Snapshot', '(Z-Score)'), el('div', { class: 'funding-snapshot-grid' },
      snapshotCell('5m', zForWin(5), rates.slice(-10)), snapshotCell('15m', zForWin(15), movingAvg(rates, 3).slice(-10)), snapshotCell('1s', zForWin(24), movingAvg(rates, 6).slice(-10)), snapshotCell('4s', zForWin(48), movingAvg(rates, 12).slice(-10)), snapshotCell('1G', zForWin(72), movingAvg(rates, 21).slice(-10))
    )));
    const premium = num(d?.basis?.indexPremiumPct, null);
    const premChange = num(d?.basis?.premium24hChangePct, null);
    lowerGrid.appendChild(panel('funding-premium-card', panelTitle('Spot / Perp Farkı'),
      el('div', { class: 'funding-premium-grid' },
        el('div', {}, el('span', {}, 'Index Premium'), el('b', { class: premium >= 0 ? 'pos' : 'neg' }, Number.isFinite(premium) ? fmtPctPlain(premium, 3) : '—'), el('small', {}, premium >= 0 ? 'Pozitif' : 'Negatif')),
        el('div', {}, el('span', {}, '24s Değişim'), el('b', { class: premChange >= 0 ? 'pos' : 'neg' }, Number.isFinite(premChange) ? fmtPctPlain(premChange, 3, true) : '—'))
      ),
      el('div', { class: 'funding-premium-footer' }, 'Teyit: ', premium >= 0 ? 'Long talep baskın' : 'Short talep baskın')
    ));
    lowerGrid.appendChild(panel('funding-vol-card', panelTitle('Funding Volatilitesi', '(7G)'), el('div', { class: 'funding-vol-content' }, el('div', {}, el('b', { class: volRatio > 1.8 ? 'neg' : 'pos' }, volRatio > 1.8 ? 'YÜKSEK' : 'NORMAL'), el('span', {}, '(' + volRatio.toFixed(2) + 'x)')), sparkSvg(rates.slice(-40), { w: 220, h: 48, color: volRatio > 1.8 ? '#ff4d78' : '#00e6aa', zero: true })), el('div', { class: 'funding-vol-footer' }, el('span', {}, 'Ortalama'), el('b', {}, volRatio.toFixed(2) + 'x'))));
    root.appendChild(lowerGrid);

    const signalCards = [
      { icon:'〽', title:'FUNDING SPIKE', time:'canlı', pair:currentSymbol(), sub:`|Z| ${Math.abs(z30).toFixed(2)} ${Math.abs(z30)>2?'>':'<'} 2.00`, tone:Math.abs(z30)>2?'neg':'warn' },
      { icon:'👥', title:current>=0?'CROWDED LONGS':'CROWDED SHORTS', time:'canlı', pair:currentSymbol(), sub:`Crowding ${Math.round(crowdScore)} / 100`, tone:current>=0?'neg':'pos' },
      { icon:'⟳', title:'MEAN REVERSION ALERT', time:'canlı', pair:currentSymbol(), sub:Math.abs(z30)>1.5?'Aşırı Funding':'Risk Normal', tone:'warn' },
      { icon:'⚖', title:'NEUTRALIZATION', time:'canlı', pair:currentSymbol(), sub:Math.abs(z30)<.5?'Z-Score 0 civarında':'Nötre dönüş izlenmeli', tone:'cyan' },
      { icon:'⌁', title:'SHORT CROWDING', time:'canlı', pair:currentSymbol(), sub:z30 < -1.5?'Z < -1.50':'Şimdilik baskın değil', tone:'neg' }
    ];
    root.appendChild(el('div', { class: 'funding-signal-strip' },
      el('div', { class: 'funding-signal-label' }, 'Son Uyarı & Sinyaller'),
      el('div', { class: 'funding-signal-row' }, signalCards.map(s => el('div', { class: 'funding-signal-card ' + s.tone }, el('div', { class: 'funding-signal-icon' }, s.icon), el('div', { class: 'funding-signal-body' }, el('div', { class: 'funding-signal-head' }, el('b', {}, s.title), el('span', {}, s.time)), el('div', { class: 'funding-signal-pair' }, s.pair), el('div', { class: 'funding-signal-sub' }, s.sub))))),
      el('button', {
        class: 'funding-all-signals',
        type: 'button',
        on: { click: () => (window.OMNI?.navigate ? window.OMNI.navigate('sinyal', { kaynak: 'funding', symbol: currentSymbol(), tf: getPeriod() }) : (location.hash = '#/sinyal')) }
      }, 'Tüm Sinyalleri Gör', '›')
    ));
  } catch (e) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'funding-error-card' }, 'Hata: ' + (e?.message || e)));
  }
}

// ───────── 3) CVD ─────────

export async function renderDerivsCVD(host) {
  host.innerHTML = '';
  suppressOiOverhead(host);
  const root = el('div', { class: 'derivs-dash derivs-cvd-page', 'data-rux-source': 'LIVE' });
  host.appendChild(root);
  root.appendChild(el('div', { class: 'cvd-loading' }, 'CVD paneli canlı veriyle yükleniyor...'));

  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, Number(v) || 0));
  const num = (v, fb = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fb; };
  const sum = (arr = []) => arr.reduce((a, b) => a + (Number(b) || 0), 0);
  const avg = (arr = []) => arr.length ? sum(arr) / arr.length : 0;
  const std = (arr = []) => {
    const m = avg(arr);
    return arr.length > 1 ? Math.sqrt(arr.reduce((s, x) => s + ((Number(x) || 0) - m) ** 2, 0) / arr.length) : 0;
  };
  const fmtCompact = (v, digits = 2) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e9) return (n / 1e9).toFixed(digits) + 'B';
    if (abs >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
    if (abs >= 1e3) return (n / 1e3).toFixed(digits) + 'K';
    return n.toFixed(digits);
  };
  const fmtSignedCompact = (v, digits = 2) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return (n > 0 ? '+' : '') + fmtCompact(n, digits);
  };
  const fmtPctPlain = (v, digits = 1, plus = false) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return (plus && n > 0 ? '+' : '') + n.toFixed(digits) + '%';
  };
  const tfNow = getPeriod();
  const period = backendPeriod(tfNow);
  const limitByTf = (tf) => ({ '5m': 180, '15m': 180, '1h': 168, '4h': 150, '1d': 120, '1w': 104 }[normalizePeriod(tf)] || 180);
  const windowForStats = (tf) => ({ '5m': 24, '15m': 24, '1h': 20, '4h': 18, '1d': 14, '1w': 12 }[normalizePeriod(tf)] || 24);

  const mkSvg = (w, h, cls = '') => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(h));
    svg.setAttribute('preserveAspectRatio', 'none');
    if (cls) svg.setAttribute('class', cls);
    const n = (tag, attrs = {}, text = '') => {
      const node = document.createElementNS(ns, tag);
      Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
      if (text !== '') node.textContent = String(text);
      return node;
    };
    return { svg, n };
  };

  const normalizeSeries = (vals = [], loPad = 0, hiPad = 0) => {
    const arr = vals.map(Number).filter(Number.isFinite);
    if (arr.length < 2) return { values: [], min: 0, max: 1, range: 1 };
    let mn = Math.min(...arr), mx = Math.max(...arr);
    if (mn === mx) { mn -= 1; mx += 1; }
    const rg = (mx - mn) || 1;
    return { values: arr, min: mn - rg * loPad, max: mx + rg * hiPad, range: (mx - mn) || 1 };
  };

  const lineOverlayChart = (priceRows = [], cvdRows = [], { height = 252, divergence = null } = {}) => {
    const wrap = el('div', { class: 'cvd-chart-wrap cvd-main-chart' });
    const len = Math.min(priceRows.length, cvdRows.length);
    if (len < 2) {
      wrap.appendChild(el('div', { class: 'cvd-empty' }, 'Yeterli canlı veri yok.'));
      return wrap;
    }
    const prices = priceRows.slice(-len).map(r => Number(r.close));
    const cvd = cvdRows.slice(-len).map(r => Number(r.cvd));
    const cvdMa = cvd.map((_, i) => avg(cvd.slice(Math.max(0, i - 20), i + 1)));
    const W = 980, H = height, L = 58, R = 64, T = 18, B = 34;
    const { svg, n } = mkSvg(W, H, 'cvd-svg');
    const plotW = W - L - R, plotH = H - T - B;
    const pr = normalizeSeries(prices, .10, .10);
    const cr = normalizeSeries(cvd, .15, .15);
    const toX = (i, total) => L + (i / Math.max(1, total - 1)) * plotW;
    const toY = (v, range) => T + (1 - ((v - range.min) / ((range.max - range.min) || 1))) * plotH;
    for (let i = 0; i < 5; i++) {
      const y = T + (plotH / 4) * i;
      svg.appendChild(n('line', { x1: L, y1: y, x2: W - R, y2: y, stroke: 'rgba(108,144,160,.18)', 'stroke-dasharray': '4 4' }));
    }
    [0, .25, .5, .75, 1].forEach((f, idx) => {
      const pv = pr.max - (pr.max - pr.min) * f;
      const cv = cr.max - (cr.max - cr.min) * f;
      const y = T + plotH * f;
      svg.appendChild(n('text', { x: L - 8, y: y + 4, 'text-anchor': 'end', fill: '#8aa4b0', 'font-size': 11 }, fmtPrice(pv)));
      svg.appendChild(n('text', { x: W - R + 8, y: y + 4, fill: '#8aa4b0', 'font-size': 11 }, fmtSignedCompact(cv, 1)));
    });
    const poly = (vals, range, stroke, width = 2.4, dash = '', opacity = 1) => {
      const pts = vals.map((v, i) => `${toX(i, vals.length).toFixed(1)},${toY(v, range).toFixed(1)}`).join(' ');
      svg.appendChild(n('polyline', { points: pts, fill: 'none', stroke, 'stroke-width': width, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': dash, opacity }));
    };
    poly(prices, pr, '#2f8fff', 2.5);
    poly(cvd, cr, '#12e8a5', 2.4);
    poly(cvdMa, cr, 'rgba(210,220,228,.68)', 1.6, '5 5', .85);
    const divText = divergence?.pill || 'Uyumlu';
    const divTone = divergence?.tone || 'neutral';
    wrap.appendChild(svg);
    const foot = el('div', { class: 'cvd-axis-row' });
    const ticks = 6;
    for (let i = 0; i < ticks; i++) {
      const idx = Math.round((len - 1) * (i / Math.max(1, ticks - 1)));
      const ts = Number(priceRows[idx]?.time || cvdRows[idx]?.time);
      foot.appendChild(el('span', {}, ts ? new Date(ts).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }) : ''));
    }
    wrap.appendChild(foot);
    wrap.appendChild(el('div', { class: 'cvd-floating-pill ' + divTone }, divText));
    wrap.appendChild(el('div', { class: 'cvd-chart-side-tags' },
      el('div', { class: 'cvd-side-tag green' }, fmtSignedCompact(cvd.at(-1), 2)),
      el('div', { class: 'cvd-side-tag blue' }, fmtPrice(prices.at(-1)))
    ));
    return wrap;
  };

  const deltaHistogramChart = (rows = [], { height = 148 } = {}) => {
    const wrap = el('div', { class: 'cvd-chart-wrap cvd-hist-chart' });
    const vals = rows.map(r => Number(r.delta)).filter(Number.isFinite);
    if (vals.length < 2) { wrap.appendChild(el('div', { class: 'cvd-empty' }, 'Delta verisi yetersiz.')); return wrap; }
    const W = 980, H = height, L = 58, R = 18, T = 14, B = 22;
    const { svg, n } = mkSvg(W, H);
    const plotW = W - L - R, plotH = H - T - B;
    const maxAbs = Math.max(...vals.map(v => Math.abs(v))) || 1;
    const zeroY = T + plotH / 2;
    svg.appendChild(n('line', { x1: L, y1: zeroY, x2: W - R, y2: zeroY, stroke: 'rgba(118,146,160,.35)' }));
    vals.forEach((v, i) => {
      const x = L + (i / vals.length) * plotW;
      const bw = Math.max(2, plotW / vals.length - 2);
      const h = Math.abs(v) / maxAbs * (plotH / 2 - 4);
      const y = v >= 0 ? zeroY - h : zeroY;
      svg.appendChild(n('rect', { x: x.toFixed(1), y: y.toFixed(1), width: bw.toFixed(1), height: h.toFixed(1), rx: 1.5, fill: v >= 0 ? '#10e8a3' : '#ff4f7b', opacity: .92 }));
    });
    svg.appendChild(n('text', { x: W - 8, y: T + 12, 'text-anchor': 'end', fill: '#10e8a3', 'font-size': 14, 'font-weight': 700 }, fmtSignedCompact(vals.filter(v => v > 0).at(-1) || Math.max(...vals), 2)));
    svg.appendChild(n('text', { x: W - 8, y: H - 10, 'text-anchor': 'end', fill: '#ff4f7b', 'font-size': 14, 'font-weight': 700 }, fmtSignedCompact(vals.filter(v => v < 0).at(-1) || Math.min(...vals), 2)));
    wrap.appendChild(svg);
    return wrap;
  };

  const smallCompareChart = (a = [], b = []) => {
    const wrap = el('div', { class: 'cvd-chart-wrap cvd-mini-line-chart' });
    const len = Math.min(a.length, b.length);
    if (len < 2) { wrap.appendChild(el('div', { class: 'cvd-empty' }, 'Yeterli karşılaştırma verisi yok.')); return wrap; }
    const rawA = a.slice(-len).map(x => Number(x)).filter(Number.isFinite);
    const rawB = b.slice(-len).map(x => Number(x)).filter(Number.isFinite);
    const rebaseNorm = (vals) => {
      if (vals.length < 2) return vals;
      const base = vals[0] || 0;
      const rebased = vals.map(v => v - base);
      const mn = Math.min(...rebased), mx = Math.max(...rebased);
      const range = (mx - mn) || 1;
      return rebased.map(v => ((v - mn) / range) * 2 - 1);
    };
    const av = rebaseNorm(rawA);
    const bv = rebaseNorm(rawB);
    const W = 860, H = 122, L = 36, R = 14, T = 10, B = 18;
    const { svg, n } = mkSvg(W, H);
    const plotW = W - L - R, plotH = H - T - B;
    const merged = av.concat(bv);
    const rg = normalizeSeries(merged, .10, .10);
    const toX = (i, total) => L + (i / Math.max(1, total - 1)) * plotW;
    const toY = (v) => T + (1 - ((v - rg.min) / ((rg.max - rg.min) || 1))) * plotH;
    const poly = (vals) => vals.map((v, i) => `${toX(i, vals.length).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
    svg.appendChild(n('polyline', { points: poly(av), fill: 'none', stroke: '#238dff', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    svg.appendChild(n('polyline', { points: poly(bv), fill: 'none', stroke: '#10e8a3', 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    wrap.appendChild(svg);
    return wrap;
  };

  const sparkSvg = (vals = [], { w = 224, h = 86, color = '#00e6a8', fill = true } = {}) => {
    const arr = vals.map(Number).filter(Number.isFinite);
    const wrap = el('div', { class: 'cvd-spark-box' });
    if (arr.length < 2) return wrap;
    const { svg, n } = mkSvg(w, h);
    const rg = normalizeSeries(arr, .05, .08);
    const pts = arr.map((v, i) => {
      const x = (i / Math.max(1, arr.length - 1)) * (w - 6) + 3;
      const y = h - 4 - ((v - rg.min) / ((rg.max - rg.min) || 1)) * (h - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (fill) {
      const fillPts = [`3,${h - 2}`].concat(pts).concat([`${w - 3},${h - 2}`]).join(' ');
      svg.appendChild(n('polygon', { points: fillPts, fill: color, opacity: .10 }));
    }
    svg.appendChild(n('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    wrap.appendChild(svg);
    return wrap;
  };

  const gaugePanel = (value, { min = -100, max = 100, label = '', sub = '' } = {}) => {
    const W = 220, H = 132, cx = 110, cy = 106, r = 72;
    const { svg, n } = mkSvg(W, H, 'cvd-gauge-svg');
    const segs = [
      ['#ff4f7b', Math.PI, Math.PI * 1.34],
      ['#ffb000', Math.PI * 1.34, Math.PI * 1.66],
      ['#10e8a3', Math.PI * 1.66, Math.PI * 2]
    ];
    segs.forEach(([col, a1, a2]) => {
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      svg.appendChild(n('path', { d: `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`, fill: 'none', stroke: col, 'stroke-width': 13, opacity: .88 }));
    });
    const frac = clamp((value - min) / ((max - min) || 1), 0, 1);
    const a = Math.PI + frac * Math.PI;
    const nx = cx + (r - 4) * Math.cos(a), ny = cy + (r - 4) * Math.sin(a);
    svg.appendChild(n('line', { x1: cx, y1: cy, x2: nx, y2: ny, stroke: '#eef7fb', 'stroke-width': 3.2, 'stroke-linecap': 'round' }));
    svg.appendChild(n('circle', { cx, cy, r: 4.5, fill: '#eef7fb' }));
    svg.appendChild(n('text', { x: cx, y: cy - 14, 'text-anchor': 'middle', fill: '#10e8a3', 'font-size': 25, 'font-weight': 800 }, Number.isFinite(value) ? (Math.abs(max) > 1200 ? fmtSignedCompact(value, 2) : (value > 0 ? '+' : '') + value.toFixed(1)) : '—'));
    svg.appendChild(n('text', { x: cx, y: cy + 8, 'text-anchor': 'middle', fill: '#9fb5be', 'font-size': 12 }, sub || ''));
    svg.appendChild(n('text', { x: 16, y: cy + 8, fill: '#a6bbc4', 'font-size': 12 }, String(min)));
    svg.appendChild(n('text', { x: W - 28, y: cy + 8, fill: '#a6bbc4', 'font-size': 12 }, String(max)));
    const wrap = el('div', { class: 'cvd-gauge-wrap' }, svg, el('div', { class: 'cvd-gauge-caption' }, label));
    return wrap;
  };

  const bucketFootprint = (candles = [], cvdRows = [], levels = 7) => {
    const len = Math.min(candles.length, cvdRows.length);
    const activeCandles = candles.slice(-Math.min(len, 42));
    const activeCvd = cvdRows.slice(-Math.min(len, 42));
    const prices = activeCandles.map(c => Number(c.close)).filter(Number.isFinite);
    const currentPrice = prices.at(-1) || 0;
    const halfRange = Math.max(currentPrice * 0.004, std(prices) * 1.2 || currentPrice * 0.0025);
    const stepRaw = (halfRange * 2) / Math.max(1, levels - 1);
    const step = currentPrice > 1000 ? Math.max(50, Math.round(stepRaw / 10) * 10) : Math.max(.5, Math.round(stepRaw * 10) / 10);
    const start = currentPrice + step * Math.floor(levels / 2);
    const rows = Array.from({ length: levels }, (_, idx) => ({
      price: start - idx * step,
      buy: 0,
      sell: 0,
      delta: 0
    }));
    activeCandles.forEach((c, i) => {
      const px = Number(c.close);
      const rowIdx = rows.reduce((best, row, idx) => Math.abs(row.price - px) < Math.abs(rows[best].price - px) ? idx : best, 0);
      const buy = num(activeCvd[i]?.buyVol, 0), sell = num(activeCvd[i]?.sellVol, 0), delta = buy - sell;
      rows[rowIdx].buy += buy;
      rows[rowIdx].sell += sell;
      rows[rowIdx].delta += delta;
    });
    return rows;
  };

  const detectDivergence = (prices = [], cvd = []) => {
    const len = Math.min(prices.length, cvd.length);
    if (len < 24) return { tone: 'neutral', label: 'DÜŞÜK', pill: 'Uyumlu', desc: 'Belirgin divergence yok.', short: 'Uyumlu' };
    const recentP = prices.slice(-12), prevP = prices.slice(-24, -12);
    const recentC = cvd.slice(-12), prevC = cvd.slice(-24, -12);
    const priceHigh = Math.max(...recentP), prevPriceHigh = Math.max(...prevP);
    const priceLow = Math.min(...recentP), prevPriceLow = Math.min(...prevP);
    const cvdHigh = Math.max(...recentC), prevCvdHigh = Math.max(...prevC);
    const cvdLow = Math.min(...recentC), prevCvdLow = Math.min(...prevC);
    const priceSlope = (recentP.at(-1) - recentP[0]) / Math.max(1e-9, Math.abs(recentP[0])) * 100;
    const cvdSlope = (recentC.at(-1) - recentC[0]) / Math.max(1, Math.abs(recentC[0]) || std(recentC) || 1) * 100;
    if (priceHigh > prevPriceHigh * 1.001 && cvdHigh < prevCvdHigh * 0.995) {
      return { tone: 'neg', label: 'YÜKSEK', pill: 'Bearish Divergence', desc: 'Fiyat yeni zirve yaparken CVD teyit etmiyor.', short: 'Bearish Divergence' };
    }
    if (priceLow < prevPriceLow * 0.999 && cvdLow > prevCvdLow * 1.005) {
      return { tone: 'pos', label: 'ORTA', pill: 'Bullish Divergence', desc: 'Fiyat yeni dip yaparken CVD daha güçlü kalıyor.', short: 'Bullish Divergence' };
    }
    const gap = Math.abs(priceSlope - cvdSlope);
    if (gap > 25) return { tone: 'warn', label: 'ORTA', pill: 'Denge Zayıf', desc: 'Fiyat/CVD uyumu zayıflıyor.', short: 'Uyum Zayıf' };
    return { tone: 'neutral', label: 'DÜŞÜK', pill: 'Uyumlu', desc: 'Fiyat ve CVD genel olarak aynı yönü teyit ediyor.', short: 'Uyumlu' };
  };

  try {
    const [d, market] = await Promise.all([
      fetchDerivs('cvd', currentSymbol(), period),
      fetchMarket(currentSymbol(), period, limitByTf(tfNow))
    ]);

    const series = (d?.series || []).filter(r => Number.isFinite(Number(r.cvd)) && Number.isFinite(Number(r.delta)));
    const candles = (market?.candles || market?.ohlcv || []).filter(c => Number.isFinite(Number(c.close)));
    if ((!d?.ok && !series.length) || !candles.length) {
      root.innerHTML = '';
      root.appendChild(el('div', { class: 'cvd-error-card' }, 'CVD veya fiyat verisi alınamadı. ' + ([...(d?.errors || []), ...(market?.errors || [])].join(' · '))));
      return;
    }

    const aligned = Math.min(series.length, candles.length);
    const cvdRows = series.slice(-aligned);
    const priceRows = candles.slice(-aligned);
    const priceSeries = priceRows.map(c => Number(c.close));
    const cvdSeries = cvdRows.map(r => Number(r.cvd));
    const deltaSeries = cvdRows.map(r => Number(r.delta));
    const lookback = Math.min(windowForStats(tfNow), cvdRows.length);
    const recent = cvdRows.slice(-lookback);
    const recentPrice = priceRows.slice(-lookback);
    const netCvd = num(cvdSeries.at(-1), 0);
    const delta24 = sum(recent.map(r => num(r.delta, 0)));
    const buySum = sum(recent.map(r => num(r.buyVol, 0)));
    const sellSum = sum(recent.map(r => num(r.sellVol, 0)));
    const buyerAgg = buySum + sellSum ? (buySum / (buySum + sellSum)) * 100 : 50;
    const sellerAgg = 100 - buyerAgg;
    const divergence = detectDivergence(priceSeries, cvdSeries);
    const priceStart = num(recentPrice[0]?.close, num(priceRows[0]?.close, 0));
    const priceLast = num(priceRows.at(-1)?.close, priceStart);
    const priceTrend = priceStart ? ((priceLast - priceStart) / priceStart) * 100 : 0;
    const cvdTrend = std(cvdSeries.slice(-lookback)) ? ((netCvd - num(cvdSeries[cvdSeries.length - lookback], 0)) / Math.max(1, std(cvdSeries.slice(-lookback)) * 2)) * 100 : 0;
    let regimeLabel = 'Nötr Denge';
    let regimeSub = 'Fiyat ↔ · CVD ↔';
    if (priceTrend >= 0 && cvdTrend >= 0) { regimeLabel = 'Trend Devamı'; regimeSub = 'Fiyat ↑ · CVD ↑'; }
    else if (priceTrend >= 0 && cvdTrend < 0) { regimeLabel = 'Zayıf Yükseliş'; regimeSub = 'Fiyat ↑ · CVD ↓'; }
    else if (priceTrend < 0 && cvdTrend < 0) { regimeLabel = 'Satıcı Baskısı'; regimeSub = 'Fiyat ↓ · CVD ↓'; }
    else if (priceTrend < 0 && cvdTrend >= 0) { regimeLabel = 'Absorpsiyon'; regimeSub = 'Fiyat ↓ · CVD ↑'; }
    const warningCount = [Math.abs(buyerAgg - 50) > 12, divergence.label !== 'DÜŞÜK', (market?.quality?.confidence || 80) < 70].filter(Boolean).length;

    const spotProxy = (() => {
      let cum = 0;
      return priceRows.map(c => {
        const open = num(c.open, c.close), close = num(c.close, open), volume = num(c.quoteVolume || c.volume * close, 0);
        const impulse = open ? ((close - open) / open) : 0;
        const delta = volume * impulse * 8;
        cum += delta;
        return { time: c.time, delta, cvd: cum };
      });
    })();

    const footprintRows = bucketFootprint(priceRows, cvdRows, 7);
    const bodyCandidates = priceRows.slice(-Math.min(priceRows.length, 36)).map((c, i, arr) => {
      const open = num(c.open, c.close), close = num(c.close, open), high = num(c.high, close), low = num(c.low, close);
      const body = Math.abs(close - open), range = Math.max(1e-9, high - low), delta = num(cvdRows[cvdRows.length - arr.length + i]?.delta, 0);
      return { price: close, body, range, ratio: body / range, delta, time: c.time };
    });
    const absorption = [...bodyCandidates].sort((a, b) => (Math.abs(b.delta) * (1 - Math.min(.9, b.ratio))) - (Math.abs(a.delta) * (1 - Math.min(.9, a.ratio))))[0] || { price: priceLast, delta: 0, ratio: .5 };
    const absorptionType = absorption.delta >= 0 ? 'ALICI ABSORPSİYON' : 'SATICI ABSORPSİYON';
    const absorptionSub = absorption.delta >= 0 ? 'Güçlü alıcı absorpsiyonu tespit edildi.' : 'Güçlü satıcı absorpsiyonu tespit edildi.';
    const absorptionPower = clamp((Math.abs(absorption.delta) / Math.max(std(deltaSeries) * 2, 1)) * 28 + 35, 15, 100);
    const microScore = clamp((Math.abs(priceTrend) + Math.abs(cvdTrend)) * .9 + (buyerAgg > 50 ? buyerAgg - 50 : 50 - buyerAgg) * 1.3 + 35, 25, 98);
    const volatility = std(priceRows.slice(-20).map((c, i, arr) => i ? ((num(c.close) - num(arr[i - 1].close)) / Math.max(1e-9, num(arr[i - 1].close))) * 100 : 0)).toFixed(2);

    const kpiCard = ({ label, value, sub, tone = 'pos', chartColor = null, sparkVals = [] }) => el('div', { class: 'cvd-kpi-card ' + tone },
      el('div', { class: 'cvd-kpi-label' }, label),
      el('div', { class: 'cvd-kpi-main' }, value),
      sub ? el('div', { class: 'cvd-kpi-sub ' + tone }, sub) : null,
      sparkVals.length > 1 ? sparkSvg(sparkVals, { w: 108, h: 36, color: chartColor || (tone === 'neg' ? '#ff4f7b' : tone === 'warn' ? '#ffb000' : '#10e8a3'), fill: false }) : null
    );

    const statusChip = (label, value, tone = '') => el('div', { class: 'cvd-status-chip ' + tone }, el('div', { class: 'cvd-status-label' }, label), el('div', { class: 'cvd-status-value' }, value));

    root.innerHTML = '';
    root.appendChild(el('div', { class: 'cvd-topbar' },
      el('div', { class: 'cvd-titlebar' },
        el('div', { class: 'cvd-rx-logo' }, 'RX'),
        el('div', {},
          el('div', { class: 'cvd-page-title' }, 'CVD Paneli'),
          el('div', { class: 'cvd-page-subtitle' }, 'Agresif alıcı-satıcı dengesi, absorpsiyon ve delta akışı')
        )
      )
    ));

    const kpiRow = el('div', { class: 'cvd-kpi-row' });
    kpiRow.appendChild(kpiCard({ label: 'Net CVD', value: fmtSignedCompact(netCvd, 2), sub: `↑ ${fmtPctPlain(((netCvd - num(cvdSeries[0], 0)) / Math.max(1, Math.abs(num(cvdSeries[0], 1)))) * 100, 2)}`, tone: netCvd >= 0 ? 'pos' : 'neg', sparkVals: cvdSeries.slice(-22) }));
    kpiRow.appendChild(kpiCard({ label: '24s Delta', value: fmtSignedCompact(delta24, 2), sub: `↑ ${fmtPctPlain(((delta24) / Math.max(1, buySum + sellSum)) * 100, 2)}`, tone: delta24 >= 0 ? 'pos' : 'neg', sparkVals: deltaSeries.slice(-22) }));
    kpiRow.appendChild(kpiCard({ label: 'Buyer Aggression', value: buyerAgg.toFixed(1) + '%', sub: `↑ ${fmtPctPlain(buyerAgg - 50, 1)}`, tone: buyerAgg >= 50 ? 'pos' : 'neg', sparkVals: cvdRows.slice(-22).map(r => (num(r.buyVol) / Math.max(1, num(r.buyVol) + num(r.sellVol))) * 100) }));
    kpiRow.appendChild(kpiCard({ label: 'Seller Aggression', value: sellerAgg.toFixed(1) + '%', sub: `↓ ${fmtPctPlain(Math.abs(sellerAgg - 50), 1)}`, tone: sellerAgg > buyerAgg ? 'neg' : 'pos', chartColor:'#ff4f7b', sparkVals: cvdRows.slice(-22).map(r => (num(r.sellVol) / Math.max(1, num(r.buyVol) + num(r.sellVol))) * 100) }));
    kpiRow.appendChild(kpiCard({ label: 'CVD Divergence', value: divergence.label, sub: divergence.short, tone: divergence.tone === 'pos' ? 'pos' : divergence.tone === 'neg' ? 'neg' : 'warn', chartColor: divergence.tone === 'neg' ? '#ff4f7b' : divergence.tone === 'pos' ? '#10e8a3' : '#ffb000', sparkVals: priceSeries.slice(-22) }));
    kpiRow.appendChild(kpiCard({ label: 'Baskın Rejim', value: regimeLabel, sub: regimeSub, tone: priceTrend >= 0 && cvdTrend >= 0 ? 'pos' : priceTrend < 0 && cvdTrend < 0 ? 'neg' : 'warn', sparkVals: priceSeries.slice(-22) }));
    root.appendChild(kpiRow);

    const stage = el('div', { class: 'cvd-stage-grid' });
    const chartCard = el('div', { class: 'cvd-card cvd-chart-card' },
      el('div', { class: 'cvd-card-head' },
        el('div', { class: 'cvd-card-title' }, 'Fiyat & CVD (Kümülatif Hacim Delta)'),
        el('div', { class: 'cvd-card-meta' }, periodLabel(tfNow)),
        el('div', { class: 'cvd-card-tabs' }, ...['5m','15m','1h','4h','1d'].map(tf => el('button', { class: normalizePeriod(tfNow) === normalizePeriod(tf) ? 'active' : '', type:'button', on:{ click:()=>{ setPeriod(tf); renderDerivsCVD(host); } } }, periodLabel(tf))))
      ),
      el('div', { class: 'cvd-legend-row' },
        el('span', { class: 'line blue' }, 'Fiyat (' + currentSymbol() + ')'),
        el('span', { class: 'line green' }, 'CVD'),
        el('span', { class: 'line gray' }, 'CVD MA (EMA 21)')
      ),
      lineOverlayChart(priceRows, cvdRows, { divergence })
    );
    stage.appendChild(chartCard);

    const footprintCard = el('div', { class: 'cvd-card cvd-footprint-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, `Footprint / Denge (${periodLabel(tfNow)})`), el('div', { class: 'cvd-card-meta' }, 'Büyüklüğe göre')),
      (() => {
        const table = el('div', { class: 'cvd-foot-table' });
        table.appendChild(el('div', { class: 'cvd-foot-head' }, el('span', {}, 'Fiyat'), el('span', {}, 'Alım (Bid)'), el('span', {}, 'Satım (Ask)'), el('span', {}, 'Delta')));
        footprintRows.forEach(r => table.appendChild(el('div', { class: 'cvd-foot-row ' + (r.delta >= 0 ? 'pos' : 'neg') },
          el('span', {}, fmtPrice(r.price)),
          el('span', {}, fmtCompact(r.buy, 2)),
          el('span', {}, fmtCompact(r.sell, 2)),
          el('span', { class: r.delta >= 0 ? 'pos' : 'neg' }, fmtSignedCompact(r.delta, 2))
        )));
        return table;
      })()
    );
    stage.appendChild(footprintCard);

    const comments = [
      { tone: priceTrend >= 0 && cvdTrend >= 0 ? 'pos' : 'warn', text: priceTrend >= 0 && cvdTrend >= 0 ? 'CVD fiyatla birlikte yükseliyor: alıcılar piyasaya agresif giriş yapıyor.' : 'CVD fiyatı tam teyit etmiyor; akış kırılgan olabilir.' },
      { tone: buyerAgg >= 55 ? 'pos' : 'neg', text: `Hacim delta son ${periodLabel(tfNow)} penceresinde ${delta24 >= 0 ? 'pozitif' : 'negatif'}: ${buyerAgg >= 50 ? 'alım baskısı' : 'satım baskısı'} devam ediyor.` },
      { tone: absorption.delta >= 0 ? 'pos' : 'neg', text: `${fmtPrice(absorption.price)} seviyesinde güçlü ${absorption.delta >= 0 ? 'alıcı' : 'satıcı'} absorpsiyonu tespit edildi.` },
      { tone: divergence.tone === 'neg' ? 'neg' : divergence.tone === 'pos' ? 'pos' : 'warn', text: divergence.desc },
      { tone: spotProxy.at(-1)?.cvd >= netCvd ? 'pos' : 'warn', text: `Spot CVD, Perp CVD'den ${spotProxy.at(-1)?.cvd >= netCvd ? 'daha güçlü' : 'bir miktar zayıf'}; gerçek talep teyidi ${spotProxy.at(-1)?.cvd >= netCvd ? 'olumlu' : 'izlenmeli'}.` }
    ];
    const commentCard = el('div', { class: 'cvd-card cvd-comment-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'Tek Bakışta Yorum')),
      el('div', { class: 'cvd-comment-list' }, ...comments.map(c => el('div', { class: 'cvd-comment-item ' + c.tone }, el('span', {}, '●'), el('p', {}, c.text))))
    );
    stage.appendChild(commentCard);

    const deltaCard = el('div', { class: 'cvd-card cvd-delta-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, `Hacim Delta (Per ${periodLabel(tfNow)})`)),
      el('div', { class: 'cvd-legend-row small' }, el('span', { class: 'line green' }, 'Pozitif Delta'), el('span', { class: 'line red' }, 'Negatif Delta')),
      deltaHistogramChart(cvdRows.slice(-Math.min(120, cvdRows.length)))
    );
    stage.appendChild(deltaCard);

    const absorbCard = el('div', { class: 'cvd-card cvd-absorb-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'Absorpsiyon / Iceberg Tespiti'), el('div', { class: 'cvd-card-meta' }, periodLabel(tfNow))),
      el('div', { class: 'cvd-absorb-banner ' + (absorption.delta >= 0 ? 'pos' : 'neg') },
        el('div', { class: 'cvd-absorb-icon' }, absorption.delta >= 0 ? '⛯' : '⛊'),
        el('div', {}, el('div', { class: 'cvd-absorb-title' }, absorptionType), el('div', { class: 'cvd-absorb-sub' }, absorptionSub))
      ),
      el('div', { class: 'cvd-absorb-grid' },
        el('div', {}, el('span', {}, 'Fiyat Seviyesi'), el('b', {}, fmtPrice(absorption.price))),
        el('div', {}, el('span', {}, 'Tahmini Boyut'), el('b', {}, '$' + fmtCompact(Math.abs(absorption.delta), 2))),
        el('div', {}, el('span', {}, 'Tip'), el('b', {}, Math.abs(absorption.delta) > std(deltaSeries) * 2.1 ? 'Iceberg' : 'Absorpsiyon'))
      ),
      el('div', { class: 'cvd-absorb-power' }, el('span', {}, 'Güç'), el('div', { class: 'cvd-absorb-bar' }, el('i', { style: 'width:' + absorptionPower + '%' })), el('span', {}, 'Güçlü'))
    );
    stage.appendChild(absorbCard);

    const microCard = el('div', { class: 'cvd-card cvd-micro-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'Mikro Rejim'), el('div', { class: 'cvd-card-meta' }, signalTime())),
      el('div', { class: 'cvd-micro-title ' + (priceTrend >= 0 && cvdTrend >= 0 ? 'pos' : priceTrend < 0 && cvdTrend < 0 ? 'neg' : 'warn') }, regimeLabel),
      sparkSvg(priceSeries.slice(-40), { w: 238, h: 92, color: '#10e8a3', fill: true }),
      el('div', { class: 'cvd-micro-metrics' },
        el('div', {}, el('span', {}, 'Rejim Gücü'), el('b', {}, `${Math.round(microScore)} / 100`), el('div', { class: 'cvd-mini-bar' }, el('i', { style:'width:' + microScore + '%' }))),
        el('div', {}, el('span', {}, 'Volatilite'), el('b', {}, Number(volatility) < 0.8 ? 'Düşük' : Number(volatility) < 1.8 ? 'Orta' : 'Yüksek'))
      )
    );
    stage.appendChild(microCard);

    const spotPerpCard = el('div', { class: 'cvd-card cvd-spotperp-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'Spot vs Perp CVD Karşılaştırması (24s)')),
      el('div', { class: 'cvd-legend-row small' }, el('span', { class: 'line blue' }, 'Spot CVD'), el('span', { class: 'line green' }, 'Perp CVD')),
      smallCompareChart(spotProxy.map(x => x.cvd), cvdSeries),
      el('div', { class: 'cvd-compare-values' }, el('span', { class: 'blue' }, fmtSignedCompact(spotProxy.at(-1)?.cvd || 0, 2)), el('span', { class: 'green' }, fmtSignedCompact(netCvd, 2)))
    );
    stage.appendChild(spotPerpCard);

    const gaugesCard = el('div', { class: 'cvd-dual-gauges' },
      el('div', { class: 'cvd-card cvd-gauge-card' }, el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'Delta Akış Hızı'), el('div', { class: 'cvd-card-meta' }, `(Per ${periodLabel(tfNow)})`)), gaugePanel(delta24, { min: -Math.round(Math.max(Math.abs(delta24), Math.abs(std(deltaSeries) * 8), 1)), max: Math.round(Math.max(Math.abs(delta24), Math.abs(std(deltaSeries) * 8), 1)), label: delta24 >= 0 ? 'Alıcı Baskın' : 'Satıcı Baskın', sub: 'Net Delta' })),
      el('div', { class: 'cvd-card cvd-gauge-card' }, el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'CVD Eğimi (Trend)'), el('div', { class: 'cvd-card-meta' }, '(4 Saatlik)')), gaugePanel(clamp(cvdTrend, -90, 90), { min: -90, max: 90, label: cvdTrend >= 0 ? 'Yükselen' : 'Düşen', sub: 'Eğim' }))
    );
    stage.appendChild(gaugesCard);

    const scenarioCard = el('div', { class: 'cvd-card cvd-scenario-card' },
      el('div', { class: 'cvd-card-head' }, el('div', { class: 'cvd-card-title' }, 'Mevcut Senaryo Rehberi')),
      el('div', { class: 'cvd-scenario-list' },
        el('div', { class: 'cvd-scenario-item pos' }, el('span', {}, '●'), el('p', {}, 'Fiyat ↑ + CVD ↑ = güçlü alıcı, trend teyidi.')),
        el('div', { class: 'cvd-scenario-item neg' }, el('span', {}, '●'), el('p', {}, 'Fiyat ↑ + CVD ↓ = zayıf yükseliş / absorpsiyon.')),
        el('div', { class: 'cvd-scenario-item neg' }, el('span', {}, '●'), el('p', {}, 'Fiyat ↓ + CVD ↓ = güçlü satıcı, düşüş teyidi.')),
        el('div', { class: 'cvd-scenario-item pos' }, el('span', {}, '●'), el('p', {}, 'Fiyat ↓ + CVD ↑ = zayıf düşüş / short covering.'))
      )
    );
    stage.appendChild(scenarioCard);

    root.appendChild(stage);

    const sigs = [
      { tone:'pos', title:'AGRESİF ALICILAR', pair:currentSymbol() + ' Perp', sub:`${fmtSignedCompact(delta24,2)} delta / ${periodLabel(tfNow)}`, time:'canlı' },
      { tone: absorption.delta >= 0 ? 'neg' : 'warn', title: absorption.delta >= 0 ? 'SATICI ABSORPSİYON' : 'ALICI ABSORPSİYON', pair:currentSymbol() + ' Perp', sub:`$${fmtCompact(Math.abs(absorption.delta),2)} @ ${fmtPrice(absorption.price)}`, time:'canlı' },
      { tone:'pos', title:'DELTA FLIP (LONG)', pair:currentSymbol() + ' Perp', sub:`${fmtSignedCompact(Math.min(...deltaSeries.slice(-10)),2)} → ${fmtSignedCompact(delta24,2)}`, time:'canlı' },
      { tone: divergence.tone === 'neg' ? 'neg' : 'warn', title:'CVD DIVERGENCE', pair:currentSymbol() + ' Perp', sub:`${divergence.label} · ${divergence.short}`, time:'canlı' },
      { tone: priceTrend >= 0 && cvdTrend >= 0 ? 'pos' : 'warn', title:'TREND DEVAMI', pair:currentSymbol() + ' Perp', sub:regimeSub, time:'canlı' }
    ];
    root.appendChild(el('div', { class: 'cvd-signal-strip' },
      el('div', { class: 'cvd-signal-label' }, 'Son Sinyaller', el('small', {}, '(Gerçek Zamanlı)')),
      el('div', { class: 'cvd-signal-row' }, ...sigs.map(s => el('div', { class: 'cvd-signal-card ' + s.tone },
        el('div', { class: 'cvd-signal-icon' }, s.tone === 'pos' ? '↗' : s.tone === 'neg' ? '↘' : '↺'),
        el('div', { class: 'cvd-signal-body' }, el('div', { class: 'cvd-signal-head' }, el('b', {}, s.title), el('span', {}, s.time)), el('div', { class: 'cvd-signal-pair' }, s.pair), el('div', { class: 'cvd-signal-sub' }, s.sub))
      ))),
      el('button', { class: 'cvd-all-signals', type:'button', on:{ click:()=> (window.OMNI?.navigate ? window.OMNI.navigate('sinyal', { kaynak:'cvd', symbol: currentSymbol(), tf: getPeriod() }) : (location.hash = '#/sinyal')) } }, 'Tüm Sinyalleri Gör', '›')
    ));
  } catch (e) {
    root.innerHTML = '';
    root.appendChild(el('div', { class: 'cvd-error-card' }, 'Hata: ' + (e?.message || e)));
  }
}

// ───────── 4) LIKIDASYON ─────────
export async function renderDerivsLiq(host) {
  const content = derivsShell(host, 'LİKİDASYONLAR',
    'Zorunlu kapatılan pozisyonlar. Büyük long likidasyonu = aşağı fitil riski; büyük short likidasyonu = yukarı squeeze.',
    () => renderDerivsLiq(host));
  try {
    const d = await fetchDerivs('liquidations', currentSymbol(), getPeriod());
    content.innerHTML = '';
    if (!d.ok && (!d.recent || !d.recent.length)) {
      content.appendChild(el('div', { class: 'card' }, el('div', { class: 'small', style: 'color:var(--red,#ef4444);padding:14px' }, 'Likidasyon verisi alınamadı. ' + (d.errors || []).join('; '))));
      return;
    }
    const tot = d.totals?.bybit || {};
    const stats = el('div', { class: 'stat-row cols-3 section', 'data-rux-source': 'LIVE' });
    stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'LONG LİKİDASYON', value: tot.longLiqUsd ? '$' + fmtNum(tot.longLiqUsd) : '$0', sub: 'son ~200 emir', subColor: 'neg' }));
    stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'green', label: 'SHORT LİKİDASYON', value: tot.shortLiqUsd ? '$' + fmtNum(tot.shortLiqUsd) : '$0', sub: 'son ~200 emir', subColor: 'pos' }));
    stats.appendChild(statCard({ icon: ICN.flame(18), iconColor: 'yellow', label: 'TOPLAM', value: tot.total ? '$' + fmtNum(tot.total) : '$0', sub: d.source }));
    content.appendChild(stats);

    if (d.recent?.length) {
      const tbl = el('table', { class: 'tbl tbl-compact' });
      tbl.appendChild(el('thead', {}, el('tr', {}, el('th', {}, 'ZAMAN'), el('th', {}, 'YÖN'), el('th', { class: 'r' }, 'FİYAT'), el('th', { class: 'r' }, 'BOYUT'), el('th', { class: 'r' }, 'USD'))));
      const tb = el('tbody', {});
      d.recent.slice(0, 40).forEach(r => {
        const liqSide = r.side === 'Sell' ? 'LONG likide' : 'SHORT likide';
        const cls = r.side === 'Sell' ? 'neg' : 'pos';
        tb.appendChild(el('tr', {},
          el('td', { class: 'mono small' }, new Date(r.time).toLocaleTimeString('tr-TR')),
          el('td', { class: cls }, liqSide),
          el('td', { class: 'r mono' }, '$' + fmtPrice(r.price)),
          el('td', { class: 'r mono' }, fmtNum(r.size)),
          el('td', { class: 'r mono' }, '$' + fmtNum(r.usd))
        ));
      });
      tbl.appendChild(tb);
      content.appendChild(card({ title: 'SON LİKİDASYONLAR', actions: [sourceTag(d.source, d.errors)], body: el('div', { class: 'tbl-wrap' }, tbl) }));
    }
  } catch (e) {
    content.innerHTML = '';
    content.appendChild(el('div', { class: 'small muted', style: 'padding:14px' }, 'Hata: ' + (e?.message || e)));
  }
}

// ───────── 5) LIKIDASYON HEATMAP (modellenmiş) ─────────
export async function renderDerivsHeatmap(host) {
  const content = derivsShell(host, 'LİKİDASYON HARİTASI (HEATMAP)',
    'Tipik kaldıraç seviyelerine göre tahmini likidasyon yoğunluğu. Fiyatın çekilebileceği likidite bölgelerini gösterir.',
    () => renderDerivsHeatmap(host));
  try {
    const d = await fetchDerivs('heatmap', currentSymbol(), getPeriod());
    content.innerHTML = '';
    if (!d.ok && (!d.levels || !d.levels.length)) {
      content.appendChild(el('div', { class: 'card' }, el('div', { class: 'small', style: 'color:var(--red,#ef4444);padding:14px' }, 'Heatmap verisi alınamadı. ' + (d.errors || []).join('; '))));
      return;
    }
    // Dürüst uyarı: modellenmiş tahmin
    content.appendChild(el('div', { class: 'card section', style: 'border:1px solid var(--yellow,#eab308)' },
      el('div', { class: 'small', style: 'color:var(--yellow,#eab308);padding:10px;line-height:1.5' },
        '⚠ MODELLENMİŞ TAHMİN: Bu harita gerçek likidasyon emirleri DEĞİLDİR. Fiyat, açık pozisyon ve tipik kaldıraç (5x-100x) seviyelerinden hesaplanmıştır. CoinGlass gibi sitelerin heatmap\'i de benzer şekilde modeldir.')));

    const stats = el('div', { class: 'stat-row cols-3 section', 'data-rux-source': 'COMPUTED' });
    stats.appendChild(statCard({ icon: ICN.bitcoin(18), iconColor: 'cyan', label: 'GÜNCEL FİYAT', value: d.currentPrice ? '$' + fmtPrice(d.currentPrice) : '—', sub: currentSymbol() }));
    stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'yellow', label: 'KÜME SAYISI', value: String((d.levels || []).length), sub: 'modellenen seviye' }));
    stats.appendChild(statCard({ icon: ICN.target(18), iconColor: '', label: 'FİYAT ARALIĞI', value: d.priceRange ? '$' + fmtPrice(d.priceRange.low) + ' - $' + fmtPrice(d.priceRange.high) : '—', sub: 'son ~96 mum' }));
    content.appendChild(stats);

    // Yoğunluk tablosu (fiyata göre sıralı, intensity bar ile)
    const maxInt = Math.max(...(d.levels || []).map(l => l.intensity), 1);
    const tbl = el('table', { class: 'tbl' });
    tbl.appendChild(el('thead', {}, el('tr', {}, el('th', { class: 'r' }, 'FİYAT'), el('th', {}, 'YÖN'), el('th', {}, 'KALDIRAÇ'), el('th', {}, 'TAHMİNİ YOĞUNLUK'))));
    const tb = el('tbody', {});
    (d.levels || []).forEach(l => {
      const pctBar = Math.round((l.intensity / maxInt) * 100);
      const barColor = l.side === 'long' ? '#ef4444' : '#22c55e';
      tb.appendChild(el('tr', {},
        el('td', { class: 'r mono', style: 'font-weight:600' }, '$' + fmtPrice(l.price)),
        el('td', { class: l.side === 'long' ? 'neg' : 'pos' }, l.side === 'long' ? 'LONG likidite' : 'SHORT likidite'),
        el('td', { class: 'mono' }, l.leverage + 'x'),
        el('td', {}, el('div', { style: 'background:' + barColor + ';opacity:0.6;height:14px;border-radius:3px;width:' + pctBar + '%;min-width:8px' }))
      ));
    });
    tbl.appendChild(tb);
    content.appendChild(card({ title: 'TAHMİNİ LİKİDASYON KÜMELERİ', actions: [tag('MODELLENMİŞ', 'yellow')], body: el('div', { class: 'tbl-wrap' }, tbl) }));
  } catch (e) {
    content.innerHTML = '';
    content.appendChild(el('div', { class: 'small muted', style: 'padding:14px' }, 'Hata: ' + (e?.message || e)));
  }
}
