/* RUx — Order Flow / CVD Kaynak Şeffaflığı */
import { el, fetchCVD, fetchLiquidity, fetchFutures } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { card, barbar, checklist, tag } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { getOrderflowScoreMode, orderflowScoreModeLabel } from './rux_settings.js?v=0.75.10-heatmap-fidelity-pass-20260524';

function num(v, d = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function clamp(v, min = 0, max = 100) {
  v = Number(v);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function round(v, d = 2) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}
function fmtUsd(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + 'B$';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M$';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K$';
  return n.toFixed(0) + '$';
}
function status(score) {
  score = Number(score) || 0;
  return score >= 75 ? 'pos' : score >= 55 ? 'warn' : 'neg';
}
function decision(score) {
  score = Number(score) || 0;
  if (score >= 78) return { label: 'GÜÇLÜ TEYİT', tone: 'green' };
  if (score >= 62) return { label: 'TEYİT VAR', tone: 'cyan' };
  if (score >= 45) return { label: 'NÖTR / İZLE', tone: 'yellow' };
  return { label: 'ZAYIF AKIŞ', tone: 'red' };
}
function cvdScore(cvd = {}) {
  const buy = num(cvd.buyQuote, 0);
  const sell = num(cvd.sellQuote, 0);
  const total = Math.max(1, num(cvd.totalQuote, buy + sell));
  const deltaPct = (buy - sell) / total * 100;
  const score = clamp(50 + deltaPct * 1.45);
  return {
    score: round(score, 1),
    deltaPct: round(deltaPct, 2),
    buyQuote: buy,
    sellQuote: sell,
    cvd: num(cvd.cvd, 0),
    totalQuote: total,
    label: deltaPct > 7 ? 'ALICI DELTA' : deltaPct < -7 ? 'SATICI DELTA' : 'DELTA NÖTR'
  };
}
function depthScore(liq = {}) {
  const s = liq.summary || {};
  const spreadBps = num(s.spreadBps, null);
  const imbalance = num(s.depthImbalance, num(s.depthRatio, 1) - 1);
  const depthRatio = num(s.depthRatio, null);
  let score = 50 + clamp(imbalance * 18, -22, 22);
  if (spreadBps !== null) score -= clamp((spreadBps - 4) * 2.0, 0, 24);
  const bidUsd = num(s.depthBidUsd, 0);
  const askUsd = num(s.depthAskUsd, 0);
  return {
    score: round(clamp(score), 1),
    spreadBps: spreadBps === null ? null : round(spreadBps, 2),
    imbalance: round(imbalance, 3),
    depthRatio: depthRatio === null ? null : round(depthRatio, 3),
    bidUsd,
    askUsd,
    label: imbalance > 0.12 ? 'BID DERİNLİĞİ' : imbalance < -0.12 ? 'ASK DERİNLİĞİ' : 'DEFTER DENGELİ'
  };
}
function derivativesScore(fut = {}, liq = {}) {
  const s = liq.summary || {};
  const fundingPct = num(fut.fundingRate, null) !== null ? num(fut.fundingRate) * 100 : num(s.lastFundingRatePct, 0);
  const oi = num(fut.openInterest, num(s.openInterestUsd, 0));
  const takerBias = num(s.takerBias, 0);
  const longShort = num(s.globalLongShort, 1);
  let crowdingPenalty = 0;
  if (Math.abs(fundingPct) > 0.04) crowdingPenalty += 10;
  if (Math.abs(takerBias) > 12) crowdingPenalty += 8;
  const score = clamp(62 - crowdingPenalty + clamp((1 - Math.abs((longShort || 1) - 1)) * 9, -8, 9));
  return {
    score: round(score, 1),
    fundingPct: round(fundingPct, 5),
    openInterest: oi,
    takerBias: round(takerBias, 2),
    longShort: round(longShort, 3),
    label: crowdingPenalty >= 14 ? 'KALABALIK TARAF RİSKİ' : 'TÜREV RİSKİ NORMAL'
  };
}
function liquidationProxy(depth = {}, deriv = {}) {
  const pressure = Math.abs(num(deriv.fundingPct, 0)) * 180 + Math.abs(num(deriv.takerBias, 0)) * 1.2 + Math.max(0, 8 - num(depth.spreadBps, 8)) * 1.4;
  const score = clamp(pressure, 0, 100);
  return {
    score: round(score, 1),
    label: score >= 70 ? 'SIKIŞMA / LİKİDASYON RİSKİ' : score >= 45 ? 'ORTA SIKIŞMA' : 'DÜŞÜK SIKIŞMA'
  };
}

export function makeOrderflowReport({ cvd = {}, liquidity = {}, futures = {}, symbol = 'BTCUSDT' } = {}) {
  const c = cvdScore(cvd);
  const d = depthScore(liquidity);
  const f = derivativesScore(futures, liquidity);
  const l = liquidationProxy(d, f);
  const score = round(clamp(c.score * 0.34 + d.score * 0.28 + f.score * 0.22 + (100 - l.score) * 0.16), 1);
  const verdict = decision(score);
  const warnings = [];
  if (d.spreadBps !== null && d.spreadBps > 12) warnings.push('Spread yüksek; fill kalitesi zayıflayabilir.');
  if (Math.abs(c.deltaPct) < 3) warnings.push('CVD/delta tarafında net agresif akış yok.');
  if (l.score >= 65) warnings.push('Kalabalık taraf / squeeze riski yüksek; no-trade filtresi sertleşmeli.');
  if (!cvd || cvd.error) warnings.push('CVD kaynağı zayıf veya kısmi veri.');
  return {
    ok: true,
    symbol,
    score,
    verdict: verdict.label,
    tone: verdict.tone,
    cvd: c,
    depth: d,
    derivatives: f,
    liquidation: l,
    warnings,
    source: [
      cvd?.source || 'CVD',
      liquidity?.source || 'Depth',
      futures?.source || 'Futures'
    ].filter(Boolean).join(' + '),
    updatedAt: Date.now()
  };
}

export async function fetchOrderflowSnapshot(symbol = 'BTCUSDT') {
  const [cvdRes, liqRes, futRes] = await Promise.allSettled([
    fetchCVD(symbol, 1000),
    fetchLiquidity(symbol),
    fetchFutures(symbol)
  ]);
  const cvd = cvdRes.status === 'fulfilled' ? cvdRes.value : { error: cvdRes.reason?.message || 'CVD alınamadı' };
  const liquidity = liqRes.status === 'fulfilled' ? liqRes.value : { error: liqRes.reason?.message || 'Likidite alınamadı' };
  const futures = futRes.status === 'fulfilled' ? futRes.value : { error: futRes.reason?.message || 'Futures alınamadı' };
  return makeOrderflowReport({ cvd, liquidity, futures, symbol });
}

function metric(label, value, sub = '', tone = '') {
  return el('div', { class: 'rux-of-metric ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, value),
    sub ? el('div', { class: 'tiny muted mt-2' }, sub) : null
  );
}

export function buildOrderflowMiniPanel(report = {}) {
  const mode = getOrderflowScoreMode();
  const modeLabel = orderflowScoreModeLabel(mode);
  const wrap = el('div', { class: 'rux-orderflow-mini mt-10' },
    el('div', { class: 'flex between gap-8' },
      el('div', {},
        el('div', { class: 'tiny muted' }, 'ORDER FLOW / CVD / DEFTER'),
        el('div', { class: 'bold mt-2' }, report.verdict || 'Akış bekleniyor')
      ),
      el('div', { class: 'flex gap-6 items-center' },
        tag(mode === 'off' ? 'GÖZLEM' : modeLabel.toUpperCase(), mode === 'off' ? 'gray' : 'cyan'),
        tag((report.score ?? 0) + '/100', report.tone || 'yellow')
      )
    ),
    el('div', { class: 'rux-of-grid mt-8' },
      metric('CVD Delta', (report.cvd?.deltaPct ?? 0) + '%', report.cvd?.label || '—', status(report.cvd?.score)),
      metric('Defter', report.depth?.depthRatio ?? '—', report.depth?.label || '—', status(report.depth?.score)),
      metric('Spread', report.depth?.spreadBps === null ? '—' : report.depth?.spreadBps + ' bps', 'Fill kalitesi', (report.depth?.spreadBps ?? 99) <= 8 ? 'pos' : 'warn'),
      metric('Squeeze', (report.liquidation?.score ?? 0) + '/100', report.liquidation?.label || '—', (report.liquidation?.score ?? 0) < 55 ? 'pos' : 'warn')
    ),
    el('div', { class: 'rux-note mt-8' }, 'Order Flow modu: ' + modeLabel + '. Varsayılan olarak karar skoruna etki etmez; Ayarlar’dan değiştirilebilir.'),
    report.warnings?.length ? el('div', { class: 'rux-note warn mt-8' }, report.warnings.slice(0,2).join(' · ')) : null
  );
  return wrap;
}

export async function hydrateOrderflowSlot(slot, symbol = 'BTCUSDT') {
  if (!slot) return;
  try {
    slot.innerHTML = '';
    slot.appendChild(el('div', { class: 'tiny muted' }, 'Order flow verisi alınıyor...'));
    const report = await fetchOrderflowSnapshot(symbol);
    slot.replaceWith(buildOrderflowMiniPanel(report));
  } catch (err) {
    slot.replaceWith(el('div', { class: 'rux-note warn mt-8' }, 'Order flow verisi alınamadı: ' + (err?.message || err)));
  }
}

export function makeOrderflowCard(symbol = 'BTCUSDT', title = 'RUx ORDER FLOW / CVD + DEFTER TEYİDİ') {
  const mode = getOrderflowScoreMode();
  const modeLabel = orderflowScoreModeLabel(mode);
  const body = el('div', { class: 'small muted' }, symbol + ' için CVD, order book, spread ve türev kalabalık verisi bekleniyor...');
  const wrap = card({
    title,
    actions: [tag(mode === 'off' ? 'GÖZLEM MODU' : modeLabel.toUpperCase(), mode === 'off' ? 'gray' : 'cyan')],
    body
  });
  setTimeout(async () => {
    try {
      const report = await fetchOrderflowSnapshot(symbol);
      body.replaceWith(el('div', {},
        el('div', { class: 'rux-of-hero' },
          el('div', {},
            el('div', { class: 'tiny muted' }, symbol + ' · ' + (report.source || 'multi-source')),
            el('div', { class: 'bold mt-2' }, report.verdict),
            el('div', { class: 'small muted mt-4' }, 'CVD/delta, defter derinliği, spread ve türev kalabalık izlenir. Mod: ' + modeLabel + '.')
          ),
          el('div', { class: 'rux-of-score ' + status(report.score) },
            el('span', { class: 'mono bold' }, report.score),
            el('small', {}, '/100')
          )
        ),
        el('div', { class: 'rux-of-grid mt-10' },
          metric('CVD', fmtUsd(report.cvd?.cvd), 'Delta ' + (report.cvd?.deltaPct ?? 0) + '%', status(report.cvd?.score)),
          metric('Buy / Sell', round(report.cvd?.buyQuote / Math.max(1, report.cvd?.totalQuote) * 100, 1) + '% / ' + round(report.cvd?.sellQuote / Math.max(1, report.cvd?.totalQuote) * 100, 1) + '%', 'Agresif akış', status(report.cvd?.score)),
          metric('Bid / Ask Depth', fmtUsd(report.depth?.bidUsd) + ' / ' + fmtUsd(report.depth?.askUsd), report.depth?.label || '—', status(report.depth?.score)),
          metric('Funding', (report.derivatives?.fundingPct ?? 0) + '%', report.derivatives?.label || '—', status(report.derivatives?.score))
        ),
        el('div', { class: 'mt-10' }, checklist([
          { state: report.score >= 62 ? 'ok' : 'warn', label: 'Order flow teyidi', right: report.verdict },
          { state: Math.abs(report.cvd?.deltaPct || 0) >= 5 ? 'ok' : 'warn', label: 'CVD / delta belirginliği', right: (report.cvd?.deltaPct || 0) + '%' },
          { state: (report.depth?.spreadBps ?? 99) <= 10 ? 'ok' : 'warn', label: 'Spread / fill kalitesi', right: report.depth?.spreadBps === null ? '—' : report.depth?.spreadBps + ' bps' },
          { state: (report.liquidation?.score || 0) < 65 ? 'ok' : 'warn', label: 'Likidasyon / squeeze riski', right: (report.liquidation?.score || 0) + '/100' }
        ])),
        report.warnings?.length ? el('div', { class: 'rux-note warn mt-10' }, report.warnings.join(' · ')) : null
      ));
    } catch (err) {
      body.replaceWith(el('div', { class: 'rux-note warn' }, 'Order flow katmanı alınamadı: ' + (err?.message || err)));
    }
  }, 80);
  return wrap;
}
