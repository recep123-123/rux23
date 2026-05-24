/* RUx — Sinyal Table Data Integrity Fix */
import { State, fetchMarket, fetchFutures, fetchCVD, el, fmtPct, fmtPrice, coinShort, coinName, toast } from './api.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { ICN, statCard, card, pageHead, coinPill, barbar, sparkline, checklist } from './components.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { makeRuxDecisionSnapshot, analyzeLiveMarketSignal, statusClass, makeSignalDataSourceTags, makeSignalExplainabilityReport, simulateManualPlanOutcome, htfTimeframeOf } from './rux_core.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { recordSignal, recordOutcome, recordAudit, resolvePendingOutcomes, setupPerformance, deploymentReport } from './rux_storage.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { currentMacroFlag } from './rux_macro.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { buildRuleBuilderReport } from './rux_rulebuilder.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { hydrateOrderflowSlot } from './rux_orderflow.js?v=0.75.6-liquidation-compact-trusted-20260524';

function getActiveRuleSetSafe() {
  try {
    const report = buildRuleBuilderReport();
    return report?.active || report?.best || null;
  } catch {
    return null;
  }
}

function parseRValue(value, fallback = 0) {
  const raw = String(value ?? '').replace(',', '.');
  const m = raw.match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : fallback;
}

function normalizeRuleText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

function strategyCompliance(scan = {}, ruleSet = null) {
  const rule = ruleSet || getActiveRuleSetSafe();
  if (!rule) return { label: 'KURAL YOK', tone: 'gray', score: 0, detail: 'Aktif kural seti yok.' };

  const thresholds = rule.thresholds || {};
  const direction = normalizeRuleText(scan.direction || '');
  const ruleDirection = normalizeRuleText(rule.direction || '');
  const setup = normalizeRuleText(scan.setup || '');
  const ruleSetup = normalizeRuleText(rule.setup || rule.name || '');
  const regime = normalizeRuleText(scan.regime?.active || scan.regime || '');
  const ruleRegime = normalizeRuleText(rule.regime || '');

  const finalScore = Number(scan.final?.score ?? scan.finalScore ?? 0);
  const dataScore = Number(scan.data?.score ?? scan.dataConfidence ?? 0);
  const noTradeScore = Number(scan.noTrade?.score ?? scan.noTradeScore ?? 100);
  const manipulationRisk = Number(scan.manipulationRisk ?? 50);
  const rr = parseRValue(scan.manualPlan?.rrExpected, Number(scan.rrExpected || 0));

  const checks = [];
  const add = (ok, label, weight = 1) => checks.push({ ok: !!ok, label, weight });

  const dirOk = !ruleDirection || ruleDirection.includes('any') ||
    (ruleDirection.includes('long') && direction.includes('long')) ||
    (ruleDirection.includes('short') && direction.includes('short'));
  add(dirOk, 'Yön uyumu', 2);

  const setupBase = ruleSetup.replace(/\blong\b|\bshort\b/g, '').trim();
  const setupOk = !setupBase || setup.includes(setupBase) || setupBase.split(' ').filter(Boolean).some(w => w.length > 4 && setup.includes(w));
  add(setupOk, 'Setup ailesi', 2);

  const regimeOk = !ruleRegime ||
    (ruleRegime.includes('bull') && regime.includes('boga')) ||
    (ruleRegime.includes('bear') && regime.includes('ayi')) ||
    (ruleRegime.includes('range') && (regime.includes('range') || regime.includes('squeeze'))) ||
    (ruleRegime.includes('squeeze') && (regime.includes('squeeze') || regime.includes('range'))) ||
    (ruleRegime.includes('expansion') && (regime.includes('boga') || regime.includes('ayi') || regime.includes('squeeze')));
  add(regimeOk, 'Rejim uyumu', 1.5);

  add(finalScore >= Number(thresholds.minFinal ?? 70), `Final ≥ ${thresholds.minFinal ?? 70}`, 2);
  add(dataScore >= Number(thresholds.minDataConfidence ?? 65), `Veri ≥ ${thresholds.minDataConfidence ?? 65}`, 1.5);
  add(noTradeScore <= Number(thresholds.maxNoTrade ?? 60), `No-Trade ≤ ${thresholds.maxNoTrade ?? 60}`, 1.5);
  add(manipulationRisk <= Number(thresholds.maxManipulation ?? 65), `Manip. ≤ ${thresholds.maxManipulation ?? 65}`, 1);
  add(rr >= Number(thresholds.minRR ?? 1.5), `RR ≥ ${thresholds.minRR ?? 1.5}`, 1.5);

  const totalWeight = checks.reduce((s, c) => s + c.weight, 0) || 1;
  const passedWeight = checks.filter(c => c.ok).reduce((s, c) => s + c.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);
  const hardFail = !dirOk || finalScore < Number(thresholds.minFinal ?? 70) || dataScore < Number(thresholds.minDataConfidence ?? 65);
  const label = score >= 82 && !hardFail ? 'STRATEJİYE UYGUN'
    : score >= 62 ? 'STRATEJİ İZLE'
    : 'FİLTRE DIŞI';
  const tone = label === 'STRATEJİYE UYGUN' ? 'green' : label === 'STRATEJİ İZLE' ? 'yellow' : 'red';
  const failed = checks.filter(c => !c.ok).map(c => c.label).slice(0, 3);
  return {
    label, tone, score,
    ruleName: rule.name || 'Aktif strateji',
    detail: failed.length ? failed.join(' · ') : 'Aktif kural setiyle uyumlu.',
    checks
  };
}

function strategyBadge(scan = {}, ruleSet = null) {
  const c = strategyCompliance(scan, ruleSet);
  return el('div', { class: 'rux-strategy-badge ' + c.tone, title: `${c.ruleName || ''}: ${c.detail}` },
    el('span', { class: 'bold' }, c.label),
    el('span', { class: 'mono' }, c.score + '/100')
  );
}

function sinyalWatchlist() {
  const base = Array.isArray(State.watchlist) && State.watchlist.length ? State.watchlist : ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','AVAXUSDT','LINKUSDT','ADAUSDT','DOTUSDT','NEARUSDT'];
  const current = State.symbol || 'BTCUSDT';
  return Array.from(new Set([current, ...base].map(x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean))).slice(0, 12);
}

function pctFromMarketLive(market) {
  const t = market?.ticker || market?.spot?.ticker || {};
  for (const raw of [t.priceChangePercent, t.change, t.change24h, market?.change24h]) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const candles = market?.candles || market?.ohlcv || [];
  const first = Number(candles[0]?.close), last = Number(candles.at?.(-1)?.close);
  return first ? ((last - first) / first) * 100 : null;
}

function cleanSignalLabel(direction = '', blocked = false) {
  if (blocked) return 'YOK';
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG')) return 'AL';
  if (d.includes('SHORT')) return 'SAT';
  return 'BEKLE';
}

function signalClass(sig) {
  return sig === 'AL' ? 'pos' : sig === 'SAT' || sig === 'YOK' ? 'neg' : 'warn';
}


function signalDataChip(label = 'LIVE', tone = 'live') {
  return el('span', { class: 'rux-data-chip ' + tone }, label);
}

function signalCell(value, chipLabel = 'LIVE', tone = 'live', cls = '') {
  return el('span', { class: 'rux-signal-cell ' + cls },
    el('span', { class: 'mono' }, value == null || value === '' ? '—' : String(value)),
    signalDataChip(chipLabel, tone)
  );
}

function formatInstantPrice(value) {
  const n = Number(value);
  return Number.isFinite(n) ? '$' + fmtPrice(n) : '—';
}

function getTickerPrice(market = {}, candles = []) {
  const n = Number(market?.ticker?.price ?? market?.spot?.ticker?.price ?? candles?.at?.(-1)?.close);
  return Number.isFinite(n) ? n : null;
}

function extractFundingRate(market = {}, futures = {}) {
  const n = Number(futures?.fundingRate ?? market?.derivatives?.fundingRate ?? market?.basis?.fundingRate);
  return Number.isFinite(n) ? n : null;
}

function extractOpenInterest(market = {}, futures = {}) {
  const oi = Number(futures?.openInterest ?? market?.derivatives?.openInterest);
  const mark = Number(futures?.markPrice ?? market?.derivatives?.markPrice ?? market?.basis?.markPrice ?? market?.ticker?.price ?? market?.spot?.ticker?.price);
  if (!Number.isFinite(oi)) return { value: null, notional: null };
  return { value: oi, notional: Number.isFinite(mark) ? oi * mark : null };
}

function compactNumber(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  const abs = Math.abs(x);
  if (abs >= 1e12) return (x / 1e12).toFixed(d) + 'T';
  if (abs >= 1e9) return (x / 1e9).toFixed(d) + 'B';
  if (abs >= 1e6) return (x / 1e6).toFixed(d) + 'M';
  if (abs >= 1e3) return (x / 1e3).toFixed(d) + 'K';
  return x.toFixed(abs >= 100 ? 0 : d);
}

function cvdMetric(cvd = {}, scan = {}) {
  const buy = Number(cvd?.buyQuote);
  const sell = Number(cvd?.sellQuote);
  const total = Number(cvd?.totalQuote ?? (Number.isFinite(buy) && Number.isFinite(sell) ? buy + sell : NaN));
  const rawCvd = Number(cvd?.cvd);
  if (Number.isFinite(rawCvd) && Number.isFinite(total) && total > 0) {
    const pct = (rawCvd / total) * 100;
    return { value: fmtPct(pct, 2), label: 'LIVE', tone: 'live', cls: pct >= 0 ? 'pos' : 'neg', title: 'Binance taker buy/sell CVD' };
  }
  const momentum = Number(scan?.technicals?.momentumPct);
  if (Number.isFinite(momentum)) {
    return { value: 'MOM ' + fmtPct(momentum, 2), label: 'PROXY', tone: 'proxy', cls: momentum >= 0 ? 'pos' : 'neg', title: 'Gerçek CVD yok; momentum proxy' };
  }
  return { value: '—', label: 'NO DATA', tone: 'nodata', cls: 'muted', title: 'CVD verisi yok' };
}

function oiMetric(market = {}, futures = {}, scan = {}) {
  const oi = extractOpenInterest(market, futures);
  if (Number.isFinite(oi.notional)) {
    return { value: '$' + compactNumber(oi.notional), label: 'LIVE', tone: 'live', cls: 'cyan', title: 'Binance futures open interest notional' };
  }
  if (Number.isFinite(oi.value)) {
    return { value: compactNumber(oi.value), label: 'LIVE', tone: 'live', cls: 'cyan', title: 'Binance futures open interest contracts' };
  }
  const vol = Number(scan?.technicals?.volumeRatio);
  if (Number.isFinite(vol)) {
    const pct = (vol - 1) * 100;
    return { value: 'VOL ' + fmtPct(pct, 2), label: 'PROXY', tone: 'proxy', cls: pct >= 0 ? 'pos' : 'neg', title: 'Gerçek OI yok; volume ratio proxy' };
  }
  return { value: '—', label: 'NO DATA', tone: 'nodata', cls: 'muted', title: 'OI verisi yok' };
}

function fundingMetric(market = {}, futures = {}) {
  const funding = extractFundingRate(market, futures);
  if (Number.isFinite(funding)) {
    return { value: fmtPct(funding * 100, 4), label: 'LIVE', tone: 'live', cls: funding >= 0 ? 'pos' : 'neg', title: 'Gerçek futures funding' };
  }
  return { value: '—', label: 'NO DATA', tone: 'nodata', cls: 'muted', title: 'Funding verisi yok' };
}

function closeSeriesFromScan(scan = {}, fallbackScore = 50) {
  const vals = (scan._candles || []).slice(-60).map(c => Number(c.close)).filter(Number.isFinite);
  return vals.length > 2 ? vals : [42, 45, 44, 49, 51, 48, 55, fallbackScore];
}

function setSignalStat(stats, label, value, sub = '', tone = '') {
  const card = Array.from(stats.querySelectorAll('.stat-card')).find(c => (c.querySelector('.label')?.textContent || '').trim().toUpperCase() === String(label).toUpperCase());
  if (!card) return;
  const val = card.querySelector('.val');
  const subEl = card.querySelector('.sub');
  if (val) val.textContent = value;
  if (subEl) {
    subEl.textContent = sub;
    subEl.className = 'sub ' + (tone || '');
  }
}

function scanToTableRow(scan, n) {
  const sym = String(scan.asset || State.symbol || '').toUpperCase();
  const dir = String(scan.direction || 'BEKLE');
  const sig = cleanSignalLabel(dir, scan.noTrade?.blocked);
  const force = Math.round(scan.final?.score || 0);
  const regime = scan.regime?.active || 'İZLE';
  const conf = Math.round(scan.data?.score || 0);
  const prob = Math.round(scan.final?.score || 0);
  const rrText = '1 : ' + String(scan.manualPlan?.rrExpected || '—').replace('R','');
  const sigCls = signalClass(sig);
  const arrow = sig === 'AL' ? '↑' : sig === 'SAT' ? '↓' : '—';
  const regClass = String(regime).includes('BOĞA') || String(regime).includes('TREND') ? 'trend' : String(regime).includes('AYI') || String(regime).includes('DAĞ') ? 'dagilim' : String(regime).includes('RANGE') || String(regime).includes('BİRİ') ? 'birikim' : 'yatay';
  const sparkTone = sig === 'SAT' ? '#ef4444' : sig === 'AL' ? '#10b981' : '#f59e0b';
  const market = scan._market || {};
  const futures = scan._futures || {};
  const cvd = scan._cvd || {};
  const funding = fundingMetric(market, futures);
  const cvdInfo = cvdMetric(cvd, scan);
  const oiInfo = oiMetric(market, futures, scan);
  const price = Number(scan.price ?? getTickerPrice(market, scan._candles || []));
  const closeSeries = closeSeriesFromScan(scan, force);
  return el('tr', { 'data-symbol': sym },
    el('td', {}, el('span', { class: 'star-cell ' + (sym === State.symbol ? 'on' : '') }, ICN.star(13, sym === State.symbol))),
    el('td', {}, coinPill(sym, sym.replace(/USDT$|USDC$|USD$|BUSD$|TRY$/, ''))),
    el('td', { class: 'r mono' }, formatInstantPrice(price)),
    el('td', {}, el('span', { class: sigCls + ' bold' }, sig + ' ' + arrow)),
    el('td', { class: 'mono bold' }, String(force)),
    el('td', {}, barbar(force)),
    el('td', {}, el('span', { class: 'regime ' + regClass }, regime)),
    el('td', { class: 'mono small muted' }, scan.timeframe || State.tf || '4h'),
    el('td', { class: 'r ' + funding.cls, title: funding.title }, signalCell(funding.value, funding.label, funding.tone, funding.cls)),
    el('td', { class: 'r ' + cvdInfo.cls, title: cvdInfo.title }, signalCell(cvdInfo.value, cvdInfo.label, cvdInfo.tone, cvdInfo.cls)),
    el('td', {}, sparkline(closeSeries, 60, 14, sparkTone, 1)),
    el('td', { class: 'r ' + oiInfo.cls, title: oiInfo.title }, signalCell(oiInfo.value, oiInfo.label, oiInfo.tone, oiInfo.cls)),
    el('td', { class: 'r mono bold ' + statusClass(conf) }, String(conf)),
    el('td', { class: 'r mono ' + statusClass(prob) }, prob + '%'),
    el('td', { class: 'mono small' }, rrText),
    el('td', {}, strategyBadge(scan)),
    el('td', {}, el('a', { class: 'btn tiny ' + (sig === 'AL' ? 'outline-green' : sig === 'SAT' ? 'outline-red' : sig === 'YOK' ? 'outline-red' : 'outline-yellow'), href: '#/sinyal-detay?symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(State.tf || '4h') }, sig + ' ' + arrow)),
    el('td', {}, el('a', { class: 'om-icon-btn small', href: '#/coin-pano?symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(State.tf || '4h') }, ICN.open(11))),
  );
}


// ── OTOMATİK TARAMA (edge verisi biriktirme) ──
// Sayfa açıkken belirli aralıkla otomatik tarar ve güçlü sinyalleri kaydeder.
// Sekme/uygulama açık olmalı (tarayıcı web sayfasıdır; kapanınca durur).
const AUTOSCAN_KEY = 'rux.autoscan.enabled';
const AUTOSCAN_INTERVAL_MS = 15 * 60 * 1000; // 15 dakika
let _autoScanTimer = null;

function loadAutoScanPref() {
  try { return localStorage.getItem(AUTOSCAN_KEY) === '1'; } catch { return false; }
}
function saveAutoScanPref(on) {
  try { localStorage.setItem(AUTOSCAN_KEY, on ? '1' : '0'); } catch {}
}

function setupAutoScan(tbl, statusEl, statsEl) {
  if (_autoScanTimer) { clearInterval(_autoScanTimer); _autoScanTimer = null; }
  if (!loadAutoScanPref()) return;
  _autoScanTimer = setInterval(() => {
    // Sayfa hâlâ DOM'da mı? Değilse temizle (kullanıcı başka sayfaya geçti).
    if (!document.body.contains(tbl)) { clearInterval(_autoScanTimer); _autoScanTimer = null; return; }
    // Sekme gizliyse (arka planda) tarama yapma — gereksiz istek olmasın.
    if (document.hidden) return;
    try { hydrateLiveSignalTable(tbl, statusEl, statsEl); } catch {}
  }, AUTOSCAN_INTERVAL_MS);
}

function toggleAutoScan() {
  const on = !loadAutoScanPref();
  saveAutoScanPref(on);
  const btn = document.getElementById('rux-autoscan-btn');
  if (btn) {
    btn.textContent = '';
    btn.appendChild(ICN.scan(12));
    btn.appendChild(document.createTextNode(on ? ' OTO TARAMA: AÇIK' : ' OTO TARAMA: KAPALI'));
    btn.className = 'btn ' + (on ? 'outline-green' : '');
  }
  const tbl = document.querySelector('[data-rux-signal-table]');
  const statusEl = document.querySelector('[data-rux-live-status]');
  const statsEl = document.querySelector('[data-live-card="signal-stats"]');
  if (on && tbl) {
    setupAutoScan(tbl, statusEl, statsEl);
    try { toast('Otomatik tarama açık. Bu sekme açık kaldıkça her 15 dakikada bir tarayıp güçlü sinyalleri kaydeder.'); } catch {}
    // Hemen bir tarama yap
    if (tbl) hydrateLiveSignalTable(tbl, statusEl, statsEl);
  } else {
    if (_autoScanTimer) { clearInterval(_autoScanTimer); _autoScanTimer = null; }
    try { toast('Otomatik tarama kapalı. Yalnızca elle YENİLE ile taranır.'); } catch {}
  }
}

export async function renderSinyal(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'SİNYAL MERKEZİ',
    subtitle: 'Long/short/no-trade sinyallerini doğrulayın; entry, stop, hedef ve net-R planını manuel işlem için izleyin.',
    actions: [
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, (State.tf || '4h') + ' ', ICN.chev(10)),
      el('a', { class: 'btn', href: '#/sinyal-gunlugu' }, ICN.table(12), 'SİNYAL GÜNLÜĞÜ'),
      el('button', { class: 'btn outline-yellow' }, ICN.pause(12), 'REST / BEKLEME'),
      el('button', { id: 'rux-autoscan-btn', class: 'btn ' + (loadAutoScanPref() ? 'outline-green' : ''), title: 'Açıkken her 15 dakikada bir otomatik tarayıp güçlü sinyalleri kaydeder (edge verisi biriktirir). Sekme açık olmalı.', on: { click: () => toggleAutoScan() } }, ICN.scan(12), loadAutoScanPref() ? 'OTO TARAMA: AÇIK' : 'OTO TARAMA: KAPALI'),
      el('button', { class: 'btn primary', on: { click: () => { const t = document.querySelector('[data-rux-signal-table]'); const s = document.querySelector('[data-rux-live-status]'); const st = document.querySelector('[data-live-card="signal-stats"]'); if (t) hydrateLiveSignalTable(t, s, st); } } }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  // Stats row 8 — live watchlist summary
  const stats = el('div', { class: 'stat-row cols-8 section', 'data-live-card': 'signal-stats' });
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'cyan', label: 'TOPLAM SİNYAL', value: '—', sub: 'Canlı tarama bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.signal(18), iconColor: 'green', label: 'GÜÇLÜ AL', value: '—', sub: '—', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'GÜÇLÜ SAT', value: '—', sub: '—', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.pause(18), iconColor: 'yellow', label: 'BEKLE', value: '—', sub: '—', subColor: 'warn' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: '', label: 'ORT. GÜVEN', value: '— / 100', sub: 'Canlı güven' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'cyan', label: 'ORT. OLASILIK', value: '—', sub: 'Canlı olasılık' }));
  stats.appendChild(statCard({ icon: ICN.bell(18), iconColor: 'red', label: 'AKTİF UYARI', value: '0', sub: 'Kullanıcı alarmı' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'green', label: 'VERİ SAĞLIĞI', value: '—', sub: 'Router bekleniyor' }));
  host.appendChild(stats);

  // Filter strip
  const filters = el('div', { class: 'flex gap-8 section', style: 'flex-wrap:wrap' });
  ['Spot','Futures','Büyükler','Altcoin'].forEach((t,i) => filters.appendChild(el('button', { class: 'btn sm' + (i === 0 ? ' outline-cyan' : '') }, t)));
  filters.appendChild(el('span', { style: 'flex-basis:24px' }));
  ['Trend','Birikim','Dağılım'].forEach(t => filters.appendChild(el('button', { class: 'btn sm' }, t)));
  filters.appendChild(el('span', { style: 'flex-basis:24px' }));
  filters.appendChild(el('button', { class: 'btn sm outline-cyan' }, State.tf || '4h'));
  filters.appendChild(el('button', { class: 'btn sm' }, 'Üst bardan değiştir'));
  filters.appendChild(el('span', { class: 'flex-1' }));
  filters.appendChild(el('button', { class: 'btn sm' }, ICN.filter(12), 'Filtrele'));
  filters.appendChild(el('button', { class: 'btn sm' }, ICN.swap(12), 'Sırala'));
  host.appendChild(filters);

  // Big signal table
  const tbl = el('table', { class: 'tbl', 'data-rux-signal-table': '1' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'COIN'),
    el('th', { class: 'r' }, 'FİYAT'),
    el('th', {}, 'SİNYAL'),
    el('th', {}, 'GÜÇ'),
    el('th', {}, ''),
    el('th', {}, 'REJİM'),
    el('th', {}, 'ZAMAN DİLİMİ'),
    el('th', { class: 'r' }, 'FUNDING'),
    el('th', { class: 'r', title: 'Gerçek CVD varsa LIVE, yoksa momentum proxy gösterilir' }, 'CVD / MOM'),
    el('th', {}, ''),
    el('th', { class: 'r', title: 'Gerçek OI varsa LIVE, yoksa volume ratio proxy gösterilir' }, 'OI / VOL'),
    el('th', { class: 'r' }, 'GÜVEN'),
    el('th', { class: 'r' }, 'OLASILIK'),
    el('th', {}, 'RİSK / GETİRİ'),
    el('th', {}, 'STRATEJİ'),
    el('th', {}, 'HIZLI İŞLEM'),
    el('th', {}, ''),
  )));
  const tb = el('tbody', {});
  tb.appendChild(el('tr', {}, el('td', { colspan: 18, class: 'muted' }, 'Canlı sinyal taraması yükleniyor…')));
  tbl.appendChild(tb);
  const liveStatus = el('div', { class: 'small muted mt-8', 'data-rux-live-status': '1' }, 'RUx canlı tarama hazırlanıyor...');
  host.appendChild(card({ body: el('div', { class: 'tbl-wrap' }, tbl, liveStatus) }));
  hydrateLiveSignalTable(tbl, liveStatus, stats);
  // Otomatik tarama: tercih açıksa, sayfa açık kaldıkça periyodik tarar.
  setupAutoScan(tbl, liveStatus, stats);

  // RUx compact validation strip (moved below main signal list)
  const validationPanel = buildRuxValidationPanel();
  host.appendChild(validationPanel);
  hydrateRuxValidationPanel(validationPanel);

  // Bottom row: Selected signal summary + expanded explainability panel
  const bot = el('div', { class: 'row fr-1-2 section' });
  bot.appendChild(buildSignalSummary());
  const explainPanel = buildReasons();
  bot.appendChild(explainPanel);
  hydrateSignalExplainabilityPanel(explainPanel);
  host.appendChild(bot);

  // #3 — DAĞITIM ONAYI / EDGE KANITI paneli (canlı/OOS edge validasyonu)
  const deployPanel = el('div', { class: 'card section', 'data-rux-source': 'COMPUTED' });
  deployPanel.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'DAĞITIM ONAYI — EDGE KANITI'),
    el('span', { class: 'tag yellow' }, 'CANLI/OOS VALİDASYON')
  ));
  const deployBody = el('div', {}, el('div', { class: 'small muted' }, 'Yükleniyor...'));
  deployPanel.appendChild(deployBody);
  host.appendChild(deployPanel);
  hydrateDeploymentApproval(deployBody);

  // #2 — Setup performans paneli (gerçek geçmişten ampirik edge)
  const perfPanel = el('div', { class: 'card section', 'data-rux-source': 'COMPUTED' });
  perfPanel.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'SETUP PERFORMANSI (GERÇEK GEÇMİŞ)'),
    el('span', { class: 'tag cyan' }, 'AMPİRİK EDGE')
  ));
  const perfBody = el('div', { 'data-setup-perf-body': '1' }, el('div', { class: 'small muted' }, 'Yükleniyor...'));
  perfPanel.appendChild(perfBody);
  host.appendChild(perfPanel);
  hydrateSetupPerformance(perfBody);

  host.appendChild(el('div', { class: 'flex between small mt-12', style: 'color:var(--fg-4)' },
    el('span', {}, ''),
    el('span', { class: 'mono' }, 'RUx ampirik edge motoru aktif')
  ));
}

async function hydrateDeploymentApproval(body) {
  try {
    const rep = await deploymentReport({ limit: 5000 });
    body.innerHTML = '';
    const sys = rep.system;
    const colorVar = sys.color === 'green' ? '#22c55e' : sys.color === 'red' ? '#ef4444' : sys.color === 'yellow' ? '#eab308' : '#94a3b8';

    // Sistem geneli büyük durum rozeti
    body.appendChild(el('div', { style: `border:2px solid ${colorVar}; border-radius:10px; padding:14px; margin-bottom:12px` },
      el('div', { class: 'flex between items-center' },
        el('div', { style: 'font-size:18px; font-weight:700; color:' + colorVar }, sys.statusLabel),
        el('span', { class: 'mono', style: 'font-size:13px; color:var(--fg-3)' }, `${sys.samples} çözülmüş örnek`)
      ),
      el('div', { class: 'small', style: 'margin-top:8px; line-height:1.6; color:var(--fg-3)' }, sys.honestNote)
    ));

    // Sistem metrikleri
    if (sys.samples > 0) {
      const m = sys.metrics;
      body.appendChild(el('div', { class: 'rux-compact-grid', style: 'margin-bottom:12px' },
        miniStat('Beklenen Değer', m.expectancy != null ? (m.expectancy >= 0 ? '+' : '') + m.expectancy + 'R' : '—', 'işlem başı', m.expectancy > 0 ? 'green' : 'red'),
        miniStat('Profit Factor', m.profitFactor != null ? String(m.profitFactor) : '—', 'kazanç/kayıp', m.profitFactor >= 1.2 ? 'green' : 'yellow'),
        miniStat('Maks Drawdown', m.maxDrawdownR != null ? m.maxDrawdownR + 'R' : '—', 'en derin düşüş', 'cyan'),
        miniStat('Tutarlılık', m.consistency != null ? String(m.consistency) : '—', 'Sharpe-benzeri', m.consistency > 0.3 ? 'green' : 'yellow')
      ));
      // Kriter kontrol listesi
      if (sys.checks && sys.checks.length) {
        const checkList = el('div', { style: 'margin-bottom:8px' });
        sys.checks.forEach(c => checkList.appendChild(
          el('div', { class: 'small', style: 'padding:3px 0; color:' + (c.pass ? '#22c55e' : '#ef4444') }, (c.pass ? '✓ ' : '✗ ') + c.label)
        ));
        body.appendChild(checkList);
      }
    }

    // Setup bazında dağıtım durumu (varsa)
    const provenFamilies = (rep.families || []).filter(f => f.samples > 0);
    if (provenFamilies.length) {
      const tbl = el('table', { class: 'tbl' });
      tbl.appendChild(el('thead', {}, el('tr', {},
        el('th', {}, 'SETUP'), el('th', { class: 'r' }, 'ÖRNEKLEM'), el('th', { class: 'r' }, 'EV (R)'),
        el('th', { class: 'r' }, 'PF'), el('th', {}, 'DURUM')
      )));
      const tb = el('tbody', {});
      provenFamilies.forEach(f => {
        const fc = f.color === 'green' ? 'pos' : f.color === 'red' ? 'neg' : 'muted';
        tb.appendChild(el('tr', {},
          el('td', {}, f.family),
          el('td', { class: 'r mono' }, String(f.samples)),
          el('td', { class: 'r mono ' + (f.metrics.expectancy > 0 ? 'pos' : 'neg') }, f.metrics.expectancy != null ? (f.metrics.expectancy >= 0 ? '+' : '') + f.metrics.expectancy : '—'),
          el('td', { class: 'r mono' }, f.metrics.profitFactor != null ? String(f.metrics.profitFactor) : '—'),
          el('td', { class: 'mono ' + fc }, f.status)
        ));
      });
      tbl.appendChild(tb);
      body.appendChild(el('div', { class: 'tbl-wrap' }, tbl));
    }

    body.appendChild(el('div', { class: 'small muted mt-10', style: 'line-height:1.6' },
      'Bu panel sistemin GERÇEK geçmiş sonuçlarını ölçer ve edge\'in kanıtlanıp kanıtlanmadığını dürüstçe raporlar. "KANITLANDI" için 100+ çözülmüş örnek ve tüm sert kriterlerin (pozitif beklenti, profit factor ≥ 1.2, kontrollü drawdown) geçmesi gerekir. Kanıt yoksa sistem bunu açıkça söyler — gelecek getiri hiçbir zaman garanti değildir.'));
  } catch (e) {
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'small muted' }, 'Dağıtım onayı okunamadı: ' + String(e?.message || e)));
  }
}

async function hydrateSetupPerformance(body) {
  try {
    const perf = await setupPerformance({ limit: 2000 });
    body.innerHTML = '';
    if (!perf.totalResolved) {
      body.appendChild(el('div', { class: 'small muted', style: 'padding:8px 0' },
        'Henüz çözülmüş (sonucu ölçülmüş) sinyal yok. Sistem her tarama yaptıkça sinyalleri kaydeder ve sonraki mumlarla gerçek sonucu ölçer. Birkaç gün/hafta sonra her setup ailesinin gerçek win-rate, beklenen değer (EV) ve profit factor değeri burada görünür ve sinyal güvenini otomatik kalibre eder.'));
      return;
    }
    // Genel özet
    const o = perf.overall;
    body.appendChild(el('div', { class: 'rux-compact-grid', style: 'margin-bottom:12px' },
      miniStat('Çözülen Sinyal', String(o.resolved), 'gerçek sonuç', 'cyan'),
      miniStat('Win Rate', o.winRate != null ? '%' + o.winRate : '—', `${o.wins}K / ${o.losses}Z`, o.winRate >= 50 ? 'green' : 'yellow'),
      miniStat('Beklenen Değer', o.expectancy != null ? (o.expectancy >= 0 ? '+' : '') + o.expectancy + 'R' : '—', 'işlem başı', o.expectancy > 0 ? 'green' : 'red'),
      miniStat('Profit Factor', o.profitFactor != null ? String(o.profitFactor) : '—', 'kazanç/kayıp', o.profitFactor >= 1.3 ? 'green' : o.profitFactor >= 1 ? 'yellow' : 'red')
    ));
    // Setup ailesi tablosu
    const tbl = el('table', { class: 'tbl' });
    tbl.appendChild(el('thead', {}, el('tr', {},
      el('th', {}, 'SETUP'), el('th', { class: 'r' }, 'WR%'), el('th', { class: 'r' }, 'EV (R)'),
      el('th', { class: 'r' }, 'PF'), el('th', { class: 'r' }, 'ÖRNEKLEM'), el('th', { class: 'r' }, 'GÜVEN ETKİSİ')
    )));
    const tb = el('tbody', {});
    perf.families.forEach(f => {
      let mult = 1.0;
      if (f.resolved >= 8) { if (f.expectancy > 0.15) mult = 1.12; else if (f.expectancy > 0) mult = 1.05; else if (f.expectancy > -0.15) mult = 0.88; else mult = 0.7; }
      else if (f.resolved >= 3) mult = f.expectancy > 0 ? 1.03 : 0.94;
      const multLabel = mult > 1 ? '↑ ×' + mult : mult < 1 ? '↓ ×' + mult : '— nötr';
      tb.appendChild(el('tr', {},
        el('td', {}, f.family),
        el('td', { class: 'r mono ' + (f.winRate >= 50 ? 'pos' : 'neg') }, f.winRate != null ? '%' + f.winRate : '—'),
        el('td', { class: 'r mono ' + (f.expectancy > 0 ? 'pos' : 'neg') }, f.expectancy != null ? (f.expectancy >= 0 ? '+' : '') + f.expectancy : '—'),
        el('td', { class: 'r mono' }, f.profitFactor != null ? String(f.profitFactor) : '—'),
        el('td', { class: 'r mono muted' }, String(f.resolved) + (f.resolved < 8 ? ' (az)' : '')),
        el('td', { class: 'r mono ' + (mult > 1 ? 'pos' : mult < 1 ? 'neg' : 'muted') }, multLabel)
      ));
    });
    tbl.appendChild(tb);
    body.appendChild(el('div', { class: 'tbl-wrap' }, tbl));
    body.appendChild(el('div', { class: 'small muted mt-10' },
      'Pozitif beklenen değerli (EV) setup\'lar güveni artırır (↑), negatif olanlar kırpar (↓). 8+ örneklem "güçlü", 3-7 "zayıf" ampirik temeldir. Bu, sistemin teorik skordan kendi gerçek geçmişine dayalı edge\'e geçişidir.'));
  } catch (e) {
    body.innerHTML = '';
    body.appendChild(el('div', { class: 'small muted' }, 'Setup performansı okunamadı: ' + String(e?.message || e)));
  }
}

function miniStat(label, value, sub, color) {
  return el('div', { class: 'rux-kpi' },
    el('div', { class: 'rux-kpi-label' }, label),
    el('div', { class: 'rux-kpi-value', style: color ? `color:var(--${color === 'green' ? 'green' : color === 'red' ? 'red' : color === 'yellow' ? 'yellow' : 'cyan'},#22d3ee)` : '' }, value),
    el('div', { class: 'rux-kpi-sub muted' }, sub)
  );
}

async function hydrateLiveSignalTable(tbl, statusEl, statsEl = null) {
  const tb = tbl.querySelector('tbody');
  if (!tb) return;
  const symbols = sinyalWatchlist();
  try {
    if (statusEl) statusEl.textContent = 'RUx canlı tarama: OHLCV + futures + CVD veri bütünlüğü kontrol ediliyor...';
    // #1/#2 — Setup performans haritasını bir kez çek (gerçek geçmişten ampirik edge).
    let setupPerfMap = {};
    try {
      const perf = await setupPerformance({ limit: 2000 });
      (perf.families || []).forEach(f => {
        const n = f.resolved;
        let maxEffect = 0;
        if (n >= 500) maxEffect = 0.28; else if (n >= 250) maxEffect = 0.22;
        else if (n >= 100) maxEffect = 0.16; else if (n >= 50) maxEffect = 0.10;
        else if (n >= 20) maxEffect = 0.05;
        let mult = 1.0;
        if (maxEffect > 0 && f.expectancy != null) {
          if (f.expectancy > 0.15) mult = 1 + maxEffect;
          else if (f.expectancy > 0.02) mult = 1 + maxEffect * 0.5;
          else if (f.expectancy > -0.02) mult = 1.0;
          else if (f.expectancy > -0.15) mult = 1 - maxEffect * 0.6;
          else mult = 1 - maxEffect;
        }
        const tier = n < 20 ? 'teorik' : n < 50 ? 'izleme' : n < 100 ? 'ön kalibrasyon' : n < 250 ? 'kullanılabilir' : n < 500 ? 'güçlü' : 'profesyonel';
        setupPerfMap[f.family] = {
          sampleSize: n, winRate: f.winRate, expectancy: f.expectancy,
          profitFactor: f.profitFactor, reliabilityMultiplier: Math.round(mult * 1000) / 1000,
          basis: tier, usableForLiveSignal: n >= 100
        };
      });
    } catch {}
    const jobs = symbols.map(async (sym) => {
      const mainTf = State.tf || '4h';
      const upperTf = htfTimeframeOf(mainTf);
      const [marketRes, futuresRes, cvdRes, htfRes] = await Promise.allSettled([
        fetchMarket(sym, mainTf, 500),
        fetchFutures(sym),
        fetchCVD(sym, 1000),
        fetchMarket(sym, upperTf, 260),
      ]);
      const data = marketRes.status === 'fulfilled' ? marketRes.value : null;
      const futures = futuresRes.status === 'fulfilled' ? futuresRes.value : null;
      const cvd = cvdRes.status === 'fulfilled' ? cvdRes.value : null;
      const htfData = htfRes.status === 'fulfilled' ? htfRes.value : null;
      const candles = Array.isArray(data?.candles) ? data.candles : (Array.isArray(data?.ohlcv) ? data.ohlcv : []);
      if (!data || !candles.length) throw new Error(sym + ' market verisi yok');
      const htfCandles = Array.isArray(htfData?.candles) ? htfData.candles : (Array.isArray(htfData?.ohlcv) ? htfData.ohlcv : []);
      const merged = {
        ...data,
        cvd: cvd && !cvd.error ? cvd : null,
        htf: htfCandles.length ? { candles: htfCandles, tf: upperTf } : null,
        macroEventRisk: currentMacroFlag(),
        setupPerfMap,
        derivatives: {
          ...(data?.derivatives || {}),
          ...(futures?.ok ? {
            fundingRate: futures.fundingRate,
            markPrice: futures.markPrice,
            openInterest: futures.openInterest,
          } : {})
        }
      };
      const scan = analyzeLiveMarketSignal({ symbol: sym, tf: State.tf || '4h', marketData: merged });
      scan.asset = sym;
      scan.change24h = pctFromMarketLive(merged);
      scan.price = getTickerPrice(merged, candles);
      scan._market = merged;
      scan._futures = futures?.ok ? futures : null;
      scan._cvd = cvd && !cvd.error ? cvd : null;
      scan._candles = candles;
      // A08 — Otomatik sinyal kaydı: aynı mum tekrar taranırsa duplicate olmaması için
      // id = symbol|tf|sonMumZamanı. Sadece canlı, bloklanmamış ve izlenmeye değer sinyaller.
      try {
        const lastTime = Number(candles.at(-1)?.time) || Date.now();
        const sid = `${sym}|${State.tf || '4h'}|${lastTime}`;
        scan.id = sid;
        scan.time = lastTime;
        if (scan.live && !scan.noTrade?.blocked && Number(scan.final?.score || 0) >= 60) {
          recordSignal(scan);
        }
      } catch {}
      return scan;
    });
    const scans = (await Promise.allSettled(jobs))
      .filter(x => x.status === 'fulfilled' && x.value)
      .map(x => x.value)
      .sort((a,b) => (b.final?.score || 0) - (a.final?.score || 0));
    if (!scans.length) {
      tb.innerHTML = '';
      tb.appendChild(el('tr', {}, el('td', { colspan: 18, class: 'muted' }, 'Canlı sinyal üretilemedi. Demo tablo gösterilmedi.')));
      if (statusEl) statusEl.textContent = 'RUx canlı tarama: veri alınamadı; sinyal üretimi bloke.';
      if (statsEl) hydrateSignalStatsFromScans(statsEl, []);
      return;
    }
    tb.innerHTML = '';
    scans.forEach((scan, i) => tb.appendChild(scanToTableRow(scan, i + 1)));
    if (statusEl) statusEl.textContent = 'RUx canlı tarama: ' + scans.length + ' varlık analiz edildi · LIVE/PROXY/NO DATA etiketleri aktif.';
    if (statsEl) hydrateSignalStatsFromScans(statsEl, scans);
    // A09 — Geçmiş sinyallerin sonuçlarını güncel mumlarla çöz (gerçek OOS toplama).
    try {
      scans.forEach(scan => {
        if (scan?._candles && scan?.asset) {
          resolvePendingOutcomes({ symbol: scan.asset, tf: State.tf || '4h', candles: scan._candles, simulateFn: simulateManualPlanOutcome });
        }
      });
    } catch (e) { try { recordAudit({ type: 'outcome_resolution_error', message: String(e?.message || e) }); } catch {} }
  } catch (err) {
    tb.innerHTML = '';
    tb.appendChild(el('tr', {}, el('td', { colspan: 18, class: 'muted' }, 'Canlı bağlantı hatası. Demo tablo gösterilmedi.')));
    if (statusEl) statusEl.textContent = 'RUx canlı tarama: bağlantı hatası; sinyal üretimi bloke.';
    if (statsEl) hydrateSignalStatsFromScans(statsEl, []);
  }
}

function hydrateSignalStatsFromScans(stats, scans = []) {
  const total = scans.length;
  const labels = scans.map(s => cleanSignalLabel(s.direction, s.noTrade?.blocked));
  const longCount = labels.filter(x => x === 'AL').length;
  const shortCount = labels.filter(x => x === 'SAT').length;
  const waitCount = labels.filter(x => x === 'BEKLE' || x === 'YOK').length;
  const avgConf = total ? Math.round(scans.reduce((sum, s) => sum + Number(s.data?.score || 0), 0) / total) : 0;
  const avgProb = total ? Math.round(scans.reduce((sum, s) => sum + Number(s.final?.score || 0), 0) / total) : 0;
  const health = total ? Math.round(scans.filter(s => Number(s.data?.score || 0) >= 60).length / total * 100) : 0;
  const pct = n => total ? '%' + Math.round(n / total * 100) : '—';
  setSignalStat(stats, 'TOPLAM SİNYAL', total ? String(total) : '0', total ? 'Canlı watchlist' : 'Veri yok', total ? 'pos' : 'neg');
  setSignalStat(stats, 'GÜÇLÜ AL', String(longCount), pct(longCount), 'pos');
  setSignalStat(stats, 'GÜÇLÜ SAT', String(shortCount), pct(shortCount), 'neg');
  setSignalStat(stats, 'BEKLE', String(waitCount), pct(waitCount), 'warn');
  setSignalStat(stats, 'ORT. GÜVEN', total ? avgConf + ' / 100' : '— / 100', total ? 'Canlı ortalama' : 'Bloke', avgConf >= 70 ? 'pos' : avgConf >= 50 ? 'warn' : 'neg');
  setSignalStat(stats, 'ORT. OLASILIK', total ? avgProb + '%' : '—', total ? 'Final skor ort.' : 'Bloke', avgProb >= 70 ? 'pos' : avgProb >= 50 ? 'warn' : 'neg');
  setSignalStat(stats, 'AKTİF UYARI', '0', 'Kullanıcı alarmı', 'warn');
  setSignalStat(stats, 'VERİ SAĞLIĞI', total ? health + '%' : '—', total ? 'Router veri kalitesi' : 'Veri alınamadı', health >= 70 ? 'pos' : health >= 50 ? 'warn' : 'neg');
}

function buildLiveSignalRow(scan, n) {
  const sym = String(scan.asset || '').toUpperCase();
  const short = sym.replace(/USDT$|USDC$|USD$|BUSD$|TRY$/, '');
  const dir = String(scan.direction || 'BEKLE');
  const sig = scan.noTrade?.blocked ? 'YOK' : dir.startsWith('LONG') ? 'AL' : dir.startsWith('SHORT') ? 'SAT' : 'BEKLE';
  const force = Math.round(scan.final?.score || 0);
  const regime = scan.regime?.active || 'İZLE';
  const conf = Math.round(scan.data?.score || 0);
  const prob = Math.round(scan.final?.score || 0);
  const rrText = '1 : ' + String(scan.manualPlan?.rrExpected || '—').replace('R','');
  const fundProxy = Number(scan.change24h || 0) / 1000;
  const cvdProxy = (Number(scan.technicals?.momentumPct || 0) >= 0 ? '+' : '') + Number(scan.technicals?.momentumPct || 0).toFixed(2) + '% mom';
  const oiProxy = Number(scan.technicals?.volumeRatio || 1) - 1;
  const sigClass = sig === 'AL' ? 'pos' : sig === 'SAT' ? 'neg' : sig === 'YOK' ? 'neg' : 'warn';
  const arrow = sig === 'AL' ? '↑' : sig === 'SAT' ? '↓' : '—';
  const regClass = regime.includes('BOĞA') ? 'trend' : regime.includes('AYI') ? 'dagilim' : regime.includes('RANGE') ? 'birikim' : 'yatay';
  const sparkTone = sig === 'SAT' ? '#ef4444' : sig === 'AL' ? '#10b981' : '#f59e0b';
  return el('tr', {},
    el('td', {}, el('span', { class: 'star-cell ' + (n <= 3 ? 'on' : '') }, ICN.star(13, n <= 3))),
    el('td', {}, coinPill(sym, short)),
    el('td', {}, el('span', { class: sigClass + ' bold' }, sig + ' ' + arrow)),
    el('td', { class: 'mono bold' }, String(force)),
    el('td', {}, barbar(force)),
    el('td', {}, el('span', { class: 'regime ' + regClass }, regime)),
    el('td', { class: 'mono small muted' }, scan.timeframe || State.tf || '4h'),
    el('td', { class: 'r mono ' + (fundProxy >= 0 ? 'pos' : 'neg') }, fmtPct(fundProxy, 3)),
    el('td', { class: 'r mono ' + (String(cvdProxy).startsWith('+') ? 'pos' : 'neg') }, cvdProxy),
    el('td', {}, sparkline([42,45,44,49,51,48,55,force], 60, 14, sparkTone, 1)),
    el('td', { class: 'r mono ' + (oiProxy >= 0 ? 'pos' : 'neg') }, fmtPct(oiProxy * 100, 2)),
    el('td', { class: 'r mono bold ' + statusClass(conf) }, String(conf)),
    el('td', { class: 'r mono ' + statusClass(prob) }, prob + '%'),
    el('td', { class: 'mono small' }, rrText),
    el('td', {}, strategyBadge(scan)),
    el('td', {}, el('button', { class: 'btn tiny ' + (sig === 'AL' ? 'outline-green' : sig === 'SAT' ? 'outline-red' : sig === 'YOK' ? 'outline-red' : 'outline-yellow') }, sig + ' ' + arrow)),
    el('td', {}, el('span', { class: 'flex gap-4' }, el('span', { class: 'om-icon-btn small' }, ICN.edit(11)), el('span', { class: 'om-icon-btn small' }, '⋯'))),
  );
}

function buildRuxValidationPanel(snapshot = null) {
  const snap = snapshot || makeRuxDecisionSnapshot({ tf: State.tf || '4h', source: 'binance' });
  const wrap = el('div', { class: 'row fr-2-1 section rux-validation-wrap rux-compact-wrap' });

  const left = el('div', { class: 'card rux-validation-card rux-compact-card' });
  left.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx SİNYAL DOĞRULAMA'),
    el('span', { class: 'tag cyan' }, snap.final.label)
  ));
  const scoreGrid = el('div', { class: 'rux-score-strip' });
  Object.entries({
    'Setup': snap.scores.setup,
    'Rejim': snap.scores.regime,
    'Teyit': snap.scores.confirmation,
    'Execution': snap.scores.execution,
    'RR': snap.scores.rr,
  }).forEach(([k, v]) => scoreGrid.appendChild(el('div', { class: 'rux-score-box ' + statusClass(v) },
    el('div', { class: 'tiny muted' }, k),
    el('div', { class: 'mono bold' }, v + '/100'),
    barbar(v)
  )));
  left.appendChild(scoreGrid);
  left.appendChild(buildSignalSourceTags(snap));
  left.appendChild(el('div', { class: 'rux-orderflow-slot mt-8', 'data-rux-orderflow-slot': '1' }, el('div', { class: 'tiny muted' }, 'Order flow teyidi bekleniyor...')));

  const plan = el('div', { class: 'rux-plan-strip mt-8' });
  plan.appendChild(planCell('Giriş Bölgesi', snap.manualPlan.entryZone));
  plan.appendChild(planCell('Stop Referansı', snap.manualPlan.stopReference, 'neg'));
  plan.appendChild(planCell('TP1 / TP2 / TP3', `${snap.manualPlan.tp1} / ${snap.manualPlan.tp2} / ${snap.manualPlan.tp3}`, 'pos'));
  plan.appendChild(planCell('Kovalama Sınırı', snap.manualPlan.doNotChase, 'warn'));
  left.appendChild(plan);
  left.appendChild(el('div', { class: 'rux-compact-note muted' }, 'Sinyali emre çevirmez; manuel plan ve teorik takip üretir.')); 

  const right = el('div', { class: 'card rux-compact-card rux-block-card' });
  right.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'İŞLEM ENGELİ KONTROLÜ'),
    el('span', { class: 'tag ' + (snap.noTrade.blocked ? 'red' : 'green') }, snap.noTrade.label)
  ));
  right.appendChild(checklist([
    { state: snap.data.score >= 70 ? 'ok' : 'warn', label: 'Veri güveni yeterli', right: snap.data.score + '/100' },
    { state: snap.noTrade.hardBlocks.length ? 'miss' : 'ok', label: 'Hard block yok', right: snap.noTrade.hardBlocks.length ? snap.noTrade.hardBlocks[0] : 'Temiz' },
    { state: snap.manipulationRisk < 50 ? 'ok' : 'warn', label: 'Manipülasyon riski', right: snap.manipulationRisk + '/100' },
    { state: snap.cost.netR > 1.5 ? 'ok' : 'warn', label: 'Net-R yeterli', right: '+' + snap.cost.netR + 'R' },
  ]));
  right.appendChild(el('div', { class: 'kv mt-12' }, el('span', { class: 'k' }, 'Final Skor'), el('span', { class: 'v mono bold ' + statusClass(snap.final.score) }, snap.final.score + '/100')));
  right.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Geçerlilik'), el('span', { class: 'v mono' }, snap.manualPlan.validity)));
  const activeRule = getActiveRuleSetSafe();
  const compliance = strategyCompliance(snap, activeRule);
  right.appendChild(el('div', { class: 'rux-strategy-mini mt-10 ' + compliance.tone },
    el('div', { class: 'tiny muted' }, 'AKTİF STRATEJİ UYUMU'),
    el('div', { class: 'flex between mt-4' },
      el('span', { class: 'bold' }, compliance.label),
      el('span', { class: 'mono bold' }, compliance.score + '/100')
    ),
    el('div', { class: 'tiny muted mt-4' }, compliance.ruleName || 'Aktif kural seti'),
    el('div', { class: 'tiny mt-4' }, compliance.detail)
  ));
  wrap.appendChild(left);
  wrap.appendChild(right);
  return wrap;
}


async function hydrateOrderflowValidationPanel(panelEl) {
  try {
    const slot = panelEl?.querySelector?.('[data-rux-orderflow-slot]');
    if (slot) await hydrateOrderflowSlot(slot, State.symbol || 'BTCUSDT');
  } catch {}
}

async function hydrateRuxValidationPanel(panelEl) {
  try {
    const data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 300);
    if (!data || !data.candles || !data.candles.length) {
      await hydrateOrderflowValidationPanel(panelEl);
      return;
    }
    const liveSnap = analyzeLiveMarketSignal({ symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h', marketData: data });
    const next = buildRuxValidationPanel(liveSnap);
    const title = next.querySelector('.card-title');
    if (title) title.textContent = 'RUx CANLI SİNYAL DOĞRULAMA';
    panelEl.replaceWith(next);
    await hydrateOrderflowValidationPanel(next);
  } catch {
    await hydrateOrderflowValidationPanel(panelEl);
  }
}


function buildSignalSourceTags(snap = {}) {
  const tags = makeSignalDataSourceTags(snap);
  const wrap = el('div', { class: 'rux-source-tags mt-8' });
  tags.forEach(t => wrap.appendChild(el('div', { class: 'rux-source-chip ' + statusClass(t.score) },
    el('span', { class: 'tiny muted' }, t.label),
    el('span', { class: 'mono small bold' }, String(t.value || '—').slice(0, 34)),
    el('span', { class: 'tiny mono' }, Math.round(Number(t.score) || 0) + '/100')
  )));
  return wrap;
}

function planCell(label, value, tone = '') {
  return el('div', { class: 'rux-plan-cell ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, value)
  );
}

function buildSignalSummary() {
  const sym = State.symbol || 'BTCUSDT';
  const wrap = el('div', { class: 'card', 'data-live-card': 'signal-summary' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'SEÇİLİ SİNYAL ÖZETİ'),
    el('span', { class: 'help' }, '?')
  ));
  wrap.appendChild(el('div', { class: 'flex items-center gap-12 mt-6' },
    el('span', { class: 'coin-icon ' + coinShort(sym).toLowerCase().slice(0, 4), style: 'width:32px; height:32px; font-size:14px' }, coinShort(sym).slice(0,1)),
    el('div', {},
      el('div', { class: 'bold', 'data-live-field': 'summary-symbol' }, sym),
      el('div', { class: 'tiny muted', 'data-live-field': 'summary-name' }, coinName(sym))
    )
  ));
  const grid = el('div', { class: 'row cols-3 mt-12' });
  grid.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'SİNYAL'), el('div', { class: 'warn bold mt-2', style: 'font-size:14px', 'data-live-field':'summary-signal' }, '—')));
  grid.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'GÜÇ'), el('div', { class: 'mt-2 flex items-center gap-6' }, el('span', { class: 'mono bold', 'data-live-field':'summary-force' }, '—'), el('span', {'data-live-field':'summary-bar'}, barbar(0)))));
  grid.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'GÜVEN'), el('div', { class: 'bold mt-2', style: 'font-size:14px', 'data-live-field':'summary-conf' }, '— / 100')));
  wrap.appendChild(grid);

  const grid2 = el('div', { class: 'row cols-3 mt-12' });
  grid2.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'OLASILIK'), el('div', { class: 'mono bold mt-2', 'data-live-field':'summary-prob' }, '—')));
  grid2.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'ZAMAN DİLİMİ'), el('div', { class: 'mt-2 mono', 'data-live-field':'summary-tf' }, State.tf || '4h')));
  grid2.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'REJİM'), el('div', { class: 'cyan bold mt-2', 'data-live-field':'summary-regime' }, '—')));
  wrap.appendChild(grid2);

  const grid3 = el('div', { class: 'row cols-4 mt-12' });
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'FUNDING'), el('div', { class: 'mono mt-2', 'data-live-field':'summary-funding' }, '—')));
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'CVD / MOM'), el('div', { class: 'mono mt-2', 'data-live-field':'summary-cvd' }, '—')));
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'OI / VOL'), el('div', { class: 'mono mt-2', 'data-live-field':'summary-oi' }, '—')));
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'DESTEK'), el('div', { class: 'mono mt-2', 'data-live-field':'summary-support' }, '—')));
  wrap.appendChild(grid3);

  const grid4 = el('div', { class: 'row cols-4 mt-12' });
  grid4.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'GİRİŞ ARALIĞI'), el('div', { class: 'mono mt-2', 'data-live-field':'summary-entry' }, '—')));
  grid4.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'HEDEF 1'), el('div', { class: 'mono pos mt-2', 'data-live-field':'summary-tp1' }, '—')));
  grid4.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'HEDEF 2'), el('div', { class: 'mono pos mt-2', 'data-live-field':'summary-tp2' }, '—')));
  grid4.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'STOP'), el('div', { class: 'mono neg mt-2', 'data-live-field':'summary-stop' }, '—')));
  wrap.appendChild(grid4);
  setTimeout(() => hydrateSignalSummary(wrap), 20);
  return wrap;
}

async function hydrateSignalSummary(wrap) {
  try {
    const sym = State.symbol || 'BTCUSDT';
    const data = await fetchMarket(sym, State.tf || '4h', 500);
    const scan = analyzeLiveMarketSignal({ symbol: sym, tf: State.tf || '4h', marketData: data });
    const candles = Array.isArray(data?.candles) ? data.candles : [];
    const lows = candles.slice(-80).map(c=>Number(c.low)).filter(Number.isFinite);
    const support = lows.length ? Math.min(...lows) : null;
    const set = (k,v,cls='') => {
      const n = wrap.querySelector(`[data-live-field="${k}"]`);
      if(!n) return;
      n.innerHTML = '';
      if(v instanceof Node) n.appendChild(v); else n.textContent = v;
      if(cls) n.className = n.className.replace(/\b(pos|neg|warn|cyan)\b/g,'').trim() + ' ' + cls;
    };
    const sig = cleanSignalLabel(scan.direction, scan.noTrade?.blocked);
    const cls = signalClass(sig);
    const force = Math.round(scan.final?.score || 0);
    set('summary-symbol', sym);
    set('summary-name', coinName(sym));
    set('summary-signal', sig + (sig === 'AL' ? ' ↑' : sig === 'SAT' ? ' ↓' : ''), cls);
    set('summary-force', String(force));
    set('summary-bar', barbar(force));
    set('summary-conf', Math.round(scan.data?.score || 0) + ' / 100', statusClass(scan.data?.score || 0));
    set('summary-prob', Math.round(scan.final?.score || 0) + '%');
    set('summary-tf', State.tf || '4h');
    set('summary-regime', scan.regime?.active || '—');
    set('summary-funding', Number.isFinite(Number(data?.derivatives?.fundingRate)) ? fmtPct(Number(data.derivatives.fundingRate)*100, 4) : '—');
    set('summary-cvd', Number.isFinite(Number(scan.technicals?.momentumPct)) ? fmtPct(Number(scan.technicals.momentumPct), 2) : '—', Number(scan.technicals?.momentumPct) >= 0 ? 'pos' : 'neg');
    set('summary-oi', Number.isFinite(Number(scan.technicals?.volumeRatio)) ? fmtPct((Number(scan.technicals.volumeRatio)-1)*100, 2) : '—');
    set('summary-support', Number.isFinite(support) ? String(support.toLocaleString('en-US',{maximumFractionDigits:6})) : '—');
    set('summary-entry', scan.manualPlan?.entryZone || '—');
    set('summary-tp1', scan.manualPlan?.tp1 || '—');
    set('summary-tp2', scan.manualPlan?.tp2 || '—');
    set('summary-stop', scan.manualPlan?.stopReference || '—');
  } catch {
    const sig = wrap.querySelector('[data-live-field="summary-signal"]');
    if(sig) sig.textContent = 'VERİ YOK';
  }
}

function buildReasons(snapshot = null) {
  const snap = snapshot || makeRuxDecisionSnapshot({ tf: State.tf || '4h', source: 'binance' });
  const report = makeSignalExplainabilityReport(snap);
  const wrap = el('div', { class: 'card rux-explain-card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'BU SİNYAL NEDEN GELDİ?'),
    el('span', { class: 'tag ' + (report.tone || 'yellow') }, report.verdict)
  ));

  wrap.appendChild(el('div', { class: 'rux-explain-hero' },
    el('div', {},
      el('div', { class: 'tiny muted' }, `${report.asset} · ${report.direction}`),
      el('div', { class: 'rux-explain-headline' }, report.headline),
      el('div', { class: 'small muted mt-4' }, report.action)
    ),
    el('div', { class: 'rux-explain-score ' + statusClass(report.finalScore) },
      el('span', { class: 'mono bold' }, report.finalScore),
      el('small', {}, '/100')
    )
  ));

  const coreList = report.primary.slice(0, 6).map(r => ({
    state: r.state,
    label: r.title,
    right: el('span', {}, r.value)
  }));
  wrap.appendChild(el('div', { class: 'mt-10' }, checklist(coreList)));

  const detailGrid = el('div', { class: 'rux-explain-detail-grid mt-10' });
  report.primary.slice(0, 4).forEach(r => {
    detailGrid.appendChild(el('div', { class: 'rux-explain-detail ' + (r.state === 'ok' ? 'pos' : r.state === 'warn' ? 'warn' : 'neg') },
      el('div', { class: 'tiny muted' }, r.title),
      el('div', { class: 'small mt-3' }, r.detail)
    ));
  });
  wrap.appendChild(detailGrid);

  const planStrip = el('div', { class: 'rux-explain-plan mt-10' });
  report.plan.forEach(p => planStrip.appendChild(el('div', { class: 'rux-plan-cell' },
    el('div', { class: 'tiny muted' }, p.label),
    el('div', { class: 'mono bold mt-2' }, p.value)
  )));
  wrap.appendChild(planStrip);

  if (report.warnings.length || report.blockers.length) {
    wrap.appendChild(el('div', { class: 'rux-note warn mt-10' },
      el('b', {}, report.blockers.length ? 'Hard block: ' : 'Uyarı: '),
      (report.blockers.length ? report.blockers : report.warnings).join(' · ')
    ));
  }

  return wrap;
}

async function hydrateSignalExplainabilityPanel(panelEl) {
  try {
    const data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 300);
    if (!data || !data.candles || !data.candles.length) return;
    const liveSnap = analyzeLiveMarketSignal({ symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h', marketData: data });
    const next = buildReasons(liveSnap);
    panelEl.replaceWith(next);
  } catch {}
}


function buildQuickActions() {
  const wrap = el('div', { class: 'card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'HIZLI İŞLEMLER'),
    el('span', { class: 'help' }, '?')
  ));
  const list = el('div', { class: 'qa-list mt-6' },
    el('a', { class: 'qa primary', href: '#/coin-pano?symbol=' + encodeURIComponent(State.symbol || 'BTCUSDT') + '&tf=' + encodeURIComponent(State.tf || '4h') }, ICN.open(14), 'COIN PANO AÇ'),
    el('a', { class: 'qa', href: '#/risk' }, ICN.dollar(14), 'AL EMRİ HAZIRLA'),
    el('a', { class: 'qa', href: '#/alarm' }, ICN.bell(14), 'ALERT OLUŞTUR'),
    el('a', { class: 'qa', href: '#/sistem' }, ICN.list(14), 'İZLEME LİSTESİNE EKLE'),
    el('a', { class: 'qa', href: '#/sistem' }, ICN.edit(14), 'NOT EKLE'),
  );
  wrap.appendChild(list);
  return wrap;
}
