/* RUx — No-Trade Validation / Filtre Testi */
import { el, State, fetchMarket, fmtNum } from './api.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { ICN, card, pageHead, statCard, tag } from './components.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { makeDemoCandles, analyzeLiveMarketSignal, simulateManualPlanOutcome } from './rux_core.js?v=0.75.6-liquidation-compact-trusted-20260524';

function round(n, d = 2) {
  const x = Number(n);
  return Number.isFinite(x) ? Number(x.toFixed(d)) : 0;
}
function fmtR(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(d) + 'R';
}
function pct(n, d = 1) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) + '%' : '—';
}
function safeTime(t) {
  try {
    const d = new Date(Number(t));
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}
function reasonText(snapshot = {}) {
  const hard = Array.isArray(snapshot.noTrade?.hardBlocks) ? snapshot.noTrade.hardBlocks : [];
  const soft = Array.isArray(snapshot.noTrade?.softWarnings) ? snapshot.noTrade.softWarnings : [];
  const all = [...hard, ...soft].filter(Boolean);
  if (all.length) return all.slice(0, 2).join(' · ');
  const score = Math.round(Number(snapshot.noTrade?.score || 0));
  if (score >= 60) return 'No-Trade soft warning yoğunluğu yüksek.';
  return 'Filtre düşük/orta uyarı üretti.';
}
function reasonKey(snapshot = {}) {
  const txt = reasonText(snapshot).toLowerCase();
  if (txt.includes('rr')) return 'RR / Risk-Ödül';
  if (txt.includes('spread') || txt.includes('slippage')) return 'Spread / Slippage';
  if (txt.includes('data') || txt.includes('veri')) return 'Veri Güveni';
  if (txt.includes('manip')) return 'Manipülasyon';
  if (txt.includes('entry') || txt.includes('geç')) return 'Geç Entry';
  if (txt.includes('rejim') || txt.includes('belirsiz')) return 'Rejim Belirsizliği';
  return 'Diğer No-Trade';
}

function analyzeNoTradeValidation(candles, { symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const clean = (candles || []).filter(c => Number.isFinite(Number(c.close)) && Number.isFinite(Number(c.time)));
  const src = clean.length >= 260 ? clean : makeDemoCandles(520, tf);
  const lookahead = tf === '1d' ? 12 : tf === '1w' ? 8 : 32;
  const step = Math.max(5, Math.floor(src.length / 72));
  const minWarmup = Math.min(140, Math.max(80, Math.floor(src.length * 0.28)));
  let previousRegime = null;
  const rows = [];

  for (let i = minWarmup; i < src.length - lookahead; i += step) {
    const window = src.slice(Math.max(0, i - 260), i + 1);
    const future = src.slice(i + 1, i + 1 + lookahead);
    const snapshot = analyzeLiveMarketSignal({
      symbol,
      tf,
      previousRegime,
      marketData: { candles: window, source: 'no-trade-validation', market: 'binance', ticker: { price: window.at(-1)?.close, change: 0 } }
    });
    previousRegime = snapshot.regime?.active || previousRegime;
    const direction = String(snapshot.direction || '');
    const tradeLike = direction.includes('LONG') || direction.includes('SHORT');
    const score = Number(snapshot.final?.score || 0);
    const noTradeScore = Number(snapshot.noTrade?.score || 0);
    const blocked = Boolean(snapshot.noTrade?.blocked || noTradeScore >= 70);
    const candidate = tradeLike && score >= 55;
    if (!candidate && noTradeScore < 50) continue;
    const hypothetical = tradeLike ? simulateManualPlanOutcome(snapshot, future, { fillModel: 'realistic', maxBars: lookahead }) : { filled: false, netR: 0, status: 'WATCH_ONLY' };
    const netR = Number(hypothetical.netR || 0);
    let label = 'İZLEME';
    if (blocked && hypothetical.filled && netR < 0) label = 'DOĞRU BLOK';
    else if (blocked && hypothetical.filled && netR > 0) label = 'KAÇAN EDGE';
    else if (blocked && !hypothetical.filled) label = 'NÖTR BLOK';
    else if (!blocked && hypothetical.filled && netR < 0) label = 'GEÇEN KÖTÜ';
    else if (!blocked && hypothetical.filled && netR > 0) label = 'GEÇEN İYİ';

    rows.push({
      id: rows.length + 1,
      time: src[i].time,
      asset: symbol,
      tf,
      direction: direction.includes('SHORT') ? 'SHORT' : direction.includes('LONG') ? 'LONG' : 'WATCH',
      setup: snapshot.setup || 'Setup',
      regime: snapshot.regime?.active || 'NÖTR',
      score: round(score, 1),
      noTradeScore: round(noTradeScore, 1),
      blocked,
      filled: Boolean(hypothetical.filled),
      netR: round(netR, 3),
      status: hypothetical.status || hypothetical.firstOutcome || '—',
      reason: reasonText(snapshot),
      reasonKey: reasonKey(snapshot),
      label
    });
  }

  const blockedRows = rows.filter(r => r.blocked);
  const blockedBad = blockedRows.filter(r => r.filled && r.netR < 0);
  const blockedGood = blockedRows.filter(r => r.filled && r.netR > 0);
  const blockedNeutral = blockedRows.filter(r => !r.filled || r.netR === 0);
  const passedRows = rows.filter(r => !r.blocked && r.filled);
  const passedBad = passedRows.filter(r => r.netR < 0);
  const passedGood = passedRows.filter(r => r.netR > 0);
  const badAvoidedR = blockedBad.reduce((a, r) => a + Math.abs(Number(r.netR || 0)), 0);
  const missedEdgeR = blockedGood.reduce((a, r) => a + Number(r.netR || 0), 0);
  const netBenefitR = badAvoidedR - missedEdgeR;
  const classified = blockedBad.length + blockedGood.length;
  const overFilteringRatio = classified ? blockedGood.length / classified * 100 : 0;
  const blockedBadRatio = classified ? blockedBad.length / classified * 100 : 0;
  const passedNetR = passedRows.reduce((a, r) => a + Number(r.netR || 0), 0);

  const reasonMap = new Map();
  for (const r of blockedRows) {
    if (!reasonMap.has(r.reasonKey)) reasonMap.set(r.reasonKey, []);
    reasonMap.get(r.reasonKey).push(r);
  }
  const reasonRows = Array.from(reasonMap.entries()).map(([reason, list]) => {
    const good = list.filter(r => r.filled && r.netR > 0);
    const bad = list.filter(r => r.filled && r.netR < 0);
    const neutral = list.length - good.length - bad.length;
    const avoided = bad.reduce((a,r)=>a+Math.abs(r.netR),0);
    const missed = good.reduce((a,r)=>a+r.netR,0);
    return {
      reason,
      count: list.length,
      good: good.length,
      bad: bad.length,
      neutral,
      netBenefitR: round(avoided - missed, 2),
      overFilteringRatio: (good.length + bad.length) ? round(good.length / (good.length + bad.length) * 100, 1) : 0
    };
  }).sort((a,b)=>b.count-a.count);

  let verdict = 'VERİ BEKLİYOR';
  let tone = 'gray';
  let note = 'No-Trade filtresi için yeterli karşılaştırılabilir örnek henüz yok.';
  if (blockedRows.length >= 10) {
    if (netBenefitR > 2 && overFilteringRatio <= 35) { verdict = 'FİLTRE FAYDALI'; tone = 'green'; note = 'No-Trade engelleri kötü sonuçları iyi ayıklıyor; mevcut eşikler korunabilir.'; }
    else if (netBenefitR > 0 && overFilteringRatio <= 50) { verdict = 'FİLTRE İZLEMEDE'; tone = 'yellow'; note = 'Filtre net fayda sağlıyor ama kaçan edge maliyeti izlenmeli.'; }
    else if (overFilteringRatio > 55 || netBenefitR < 0) { verdict = 'AŞIRI FİLTRELEME'; tone = 'red'; note = 'No-Trade çok sayıda iyi fırsatı engelliyor olabilir; eşikler ve hard/soft ayrımı gözden geçirilmeli.'; }
    else { verdict = 'KARIŞIK SONUÇ'; tone = 'yellow'; note = 'Filtre etkisi net değil; daha fazla forward/backtest örneği gerekiyor.'; }
  }

  return {
    symbol,
    tf,
    source: clean.length >= 260 ? 'live/market' : 'demo-fallback',
    verdict,
    tone,
    note,
    rows,
    reasonRows,
    metrics: {
      samples: rows.length,
      blocked: blockedRows.length,
      blockedBad: blockedBad.length,
      blockedGood: blockedGood.length,
      blockedNeutral: blockedNeutral.length,
      passedGood: passedGood.length,
      passedBad: passedBad.length,
      badAvoidedR: round(badAvoidedR, 2),
      missedEdgeR: round(missedEdgeR, 2),
      netBenefitR: round(netBenefitR, 2),
      overFilteringRatio: round(overFilteringRatio, 1),
      blockedBadRatio: round(blockedBadRatio, 1),
      passedNetR: round(passedNetR, 2),
      blockedRate: rows.length ? round(blockedRows.length / rows.length * 100, 1) : 0
    },
    generatedAt: Date.now()
  };
}

function metricCell(label, value, sub = '', tone = '') {
  return el('div', { class: 'rux-rule-metric ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, value),
    sub ? el('div', { class: 'tiny muted mt-2' }, sub) : null
  );
}

function reportStats(report) {
  const m = report.metrics || {};
  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: report.tone === 'green' ? 'green' : report.tone === 'red' ? 'red' : 'yellow', label: 'FİLTRE KARARI', value: report.verdict, sub: report.source }));
  stats.appendChild(statCard({ icon: ICN.filter(18), iconColor: 'cyan', label: 'BLOK ORANI', value: pct(m.blockedRate), sub: `${m.blocked}/${m.samples} örnek` }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'ENGELLENEN KÖTÜ', value: String(m.blockedBad), sub: fmtR(m.badAvoidedR) + ' koruma' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'KAÇAN EDGE', value: String(m.blockedGood), sub: fmtR(m.missedEdgeR) + ' maliyet' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: m.netBenefitR >= 0 ? 'green' : 'red', label: 'NET FİLTRE FAYDASI', value: fmtR(m.netBenefitR), sub: 'blocked bad - missed edge' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: m.overFilteringRatio > 50 ? 'red' : 'yellow', label: 'OVER-FILTERING', value: pct(m.overFilteringRatio), sub: 'iyi fırsat engeli' }));
  return stats;
}

function reasonTable(report) {
  const rows = report.reasonRows || [];
  if (!rows.length) return el('div', { class: 'small muted' }, 'Henüz yeterli no-trade nedeni oluşmadı.');
  return el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {}, ['NEDEN','BLOK','DOĞRU BLOK','KAÇAN EDGE','NÖTR','NET FAYDA','OVER-FILTER'].map(h => el('th', {}, h)))),
    el('tbody', {}, ...rows.map(r => el('tr', {},
      el('td', { class: 'bold' }, r.reason),
      el('td', { class: 'mono' }, String(r.count)),
      el('td', { class: 'mono pos' }, String(r.bad)),
      el('td', { class: 'mono neg' }, String(r.good)),
      el('td', { class: 'mono muted' }, String(r.neutral)),
      el('td', { class: 'mono ' + (r.netBenefitR >= 0 ? 'pos' : 'neg') }, fmtR(r.netBenefitR)),
      el('td', { class: 'mono' }, pct(r.overFilteringRatio))
    )))
  ));
}

function sampleTable(report) {
  const rows = (report.rows || []).filter(r => r.blocked || r.filled).slice(-18).reverse();
  if (!rows.length) return el('div', { class: 'small muted' }, 'Henüz örnek yok.');
  return el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl tbl-compact' },
    el('thead', {}, el('tr', {}, ['ZAMAN','YÖN','SETUP','REJİM','NO-TRADE','KARŞI-OLGU R','ETİKET','NEDEN'].map(h => el('th', {}, h)))),
    el('tbody', {}, ...rows.map(r => {
      const tone = r.label === 'DOĞRU BLOK' ? 'green' : r.label === 'KAÇAN EDGE' || r.label === 'GEÇEN KÖTÜ' ? 'red' : r.label === 'NÖTR BLOK' ? 'gray' : 'yellow';
      return el('tr', {},
        el('td', { class: 'mono small' }, safeTime(r.time)),
        el('td', { class: 'mono bold' }, r.direction),
        el('td', {}, r.setup),
        el('td', {}, r.regime),
        el('td', { class: 'mono' }, Math.round(r.noTradeScore) + '/100'),
        el('td', { class: 'mono ' + (r.netR >= 0 ? 'pos' : 'neg') }, r.filled ? fmtR(r.netR) : 'Fill yok'),
        el('td', {}, tag(r.label, tone)),
        el('td', { class: 'small muted' }, r.reason)
      );
    }))
  ));
}

export async function renderNoTradeTest(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'NO-TRADE FİLTRE TESTİ',
    subtitle: 'Engellenen sinyaller gerçekten kötü müydü, yoksa sistem iyi fırsatları fazla mı süzdü? Hard/soft filtrelerin R bazlı muhasebesi.',
    actions: [
      el('button', { class: 'btn', on: { click: () => renderNoTradeTest(host) } }, ICN.refresh(13), 'YENİLE'),
      el('a', { class: 'btn', href: '#/backtest' }, ICN.beaker(13), 'BACKTEST'),
      el('a', { class: 'btn primary', href: '#/kalibrasyon' }, ICN.gear(13), 'KALİBRASYON')
    ]
  }));

  const loading = el('div', { class: 'card section' }, el('div', { class: 'small muted' }, 'No-Trade validasyon örnekleri hazırlanıyor...'));
  host.appendChild(loading);
  let data = null;
  try { data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 520); } catch {}
  const candles = data?.candles || [];
  const report = analyzeNoTradeValidation(candles, { symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h' });
  loading.remove();

  host.appendChild(reportStats(report));
  host.appendChild(el('div', { class: 'row fr-2-1 section' },
    card({ title: 'FİLTRE MUHASEBESİ', actions: [tag(report.verdict, report.tone)], body: el('div', {},
      el('div', { class: 'rux-note' }, report.note),
      el('div', { class: 'row cols-4 mt-12' },
        metricCell('Doğru Blok', String(report.metrics.blockedBad), fmtR(report.metrics.badAvoidedR) + ' zarar engeli', 'pos'),
        metricCell('Kaçan Edge', String(report.metrics.blockedGood), fmtR(report.metrics.missedEdgeR) + ' fırsat maliyeti', 'neg'),
        metricCell('Nötr Blok', String(report.metrics.blockedNeutral), 'Fill yok / etkisiz', 'warn'),
        metricCell('Net Fayda', fmtR(report.metrics.netBenefitR), 'koruma - maliyet', report.metrics.netBenefitR >= 0 ? 'pos' : 'neg')
      ),
      el('div', { class: 'small muted mt-12' }, 'Karşı-olgu R: No-Trade filtresi devre dışı bırakılsaydı teorik manuel planın üreteceği sonuçtur. Gerçek emir açmaz.')
    ) }),
    card({ title: 'OPERASYON KARARI', body: el('div', {},
      metricCell('Over-filtering', pct(report.metrics.overFilteringRatio), 'iyi fırsat engeli'),
      metricCell('Kötü Sinyal Yakalama', pct(report.metrics.blockedBadRatio), 'bloklanan örneklerde kötü oran'),
      metricCell('Geçen Kötü Sinyal', String(report.metrics.passedBad), 'filtre kaçırdı'),
      el('div', { class: 'rux-note warn mt-12' }, 'Bu panel eşikleri otomatik değiştirmez. Sonuçlar Kural Setleri, Kalibrasyon ve No-Trade eşik revizyonu için kanıt üretir.')
    ) })
  ));
  host.appendChild(el('div', { class: 'row fr-1-1 section' },
    card({ title: 'NO-TRADE NEDEN BAZLI SONUÇ', body: reasonTable(report) }),
    card({ title: 'SON ÖRNEKLER / KARŞI-OLGU GÜNLÜĞÜ', body: sampleTable(report) })
  ));
}
