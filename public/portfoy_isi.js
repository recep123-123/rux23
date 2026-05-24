/* RUx — Portfolio Heat v2 ekranı */
import { el, State, fetchMarket, fmtPrice } from './api.js?v=0.75.7-liquidation-source-health-20260524';
import { ICN, statCard, card, pageHead, tag, barbar, donut } from './components.js?v=0.75.7-liquidation-source-health-20260524';
import { canvasBarChart, canvasHeatmap } from './charts.js?v=0.75.7-liquidation-source-health-20260524';
import { buildPortfolioHeatV2Report, portfolioHeatScenarioList, portfolioHeatScenarioLabel } from './rux_portfolio_heat.js?v=0.75.7-liquidation-source-health-20260524';

const TRACKED = ['BTCUSDT','ETHUSDT','SOLUSDT','AVAXUSDT','LINKUSDT','BNBUSDT','OPUSDT','ARBUSDT'];

function pct(n, d = 2) { return '%' + Number(n || 0).toFixed(d); }
function heatTxt(n, d = 3) { return Number(n || 0).toFixed(d); }
function money(n) {
  const v = Number(n || 0);
  return (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function toneHeat(v, limit = 1) {
  const n = Number(v || 0), l = Math.max(Number(limit || 1), 0.01);
  if (n >= l * 1.0) return 'neg';
  if (n >= l * 0.75) return 'warn';
  return 'pos';
}
function statusTag(s = {}) { return tag(s.label || '—', s.tone || 'gray'); }
function scenarioLinks(active = 'base') {
  return portfolioHeatScenarioList().map(s => el('a', { class: 'btn tiny ' + (s.id === active ? 'primary' : ''), href: '#/portfoy-isi?scenario=' + s.id }, s.label));
}
function safeScenario(id = 'base') {
  const ok = portfolioHeatScenarioList().some(s => s.id === id);
  return ok ? id : 'base';
}

async function loadMarkets(tf = '4h') {
  const settled = await Promise.allSettled(TRACKED.map(sym => fetchMarket(sym, tf, 260)));
  const bySymbol = {};
  settled.forEach((res, idx) => {
    if (res.status === 'fulfilled' && res.value?.candles?.length) bySymbol[TRACKED[idx]] = { ...res.value, symbol: TRACKED[idx] };
  });
  return { bySymbol, source: Object.keys(bySymbol).length ? 'multi-live' : 'fallback' };
}

function buildSummary(report) {
  const s = report.summary;
  const row = el('div', { class: 'stat-row cols-7 section' });
  row.appendChild(statCard({ icon: ICN.flame(18), iconColor: s.status?.tone || 'yellow', label: 'BETA HEAT', value: heatTxt(s.betaAdjustedHeat), sub: `${s.status?.label || '—'} · Limit ${s.totalLimit}`, subColor: toneHeat(s.betaAdjustedHeat, s.totalLimit) }));
  row.appendChild(statCard({ icon: ICN.trend(18), iconColor: toneHeat(s.longHeat, report.scenario.longLimit) === 'pos' ? 'green' : 'red', label: 'LONG HEAT', value: heatTxt(s.longHeat), sub: `Limit ${report.scenario.longLimit}`, subColor: toneHeat(s.longHeat, report.scenario.longLimit) }));
  row.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'cyan', label: 'SHORT HEAT', value: heatTxt(s.shortHeat), sub: `Limit ${report.scenario.shortLimit}` }));
  row.appendChild(statCard({ icon: ICN.warning(18), iconColor: toneHeat(s.altLongHeat, 0.95) === 'pos' ? 'green' : 'red', label: 'ALT LONG', value: heatTxt(s.altLongHeat), sub: 'High beta küme', subColor: toneHeat(s.altLongHeat, 0.95) }));
  row.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'yellow', label: 'RAW RİSK', value: pct(s.totalRawRisk), sub: `${s.openCount} manuel pozisyon` }));
  row.appendChild(statCard({ icon: ICN.target(18), iconColor: s.riskCutDelta > 0 ? 'green' : 'gray', label: 'ÖNERİLEN HEAT', value: heatTxt(s.suggestedTotalHeat), sub: s.riskCutDelta > 0 ? `${heatTxt(s.riskCutDelta)} heat azalt` : 'Kesinti yok', subColor: s.riskCutDelta > 0 ? 'pos' : '' }));
  row.appendChild(statCard({ icon: ICN.cpu(18), iconColor: 'blue', label: 'SENARYO', value: report.scenario.label, sub: `USDT.D ${report.scenario.usdtDominance}%` }));
  return row;
}

function buildPositionsTable(report) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['Coin','Aile','Yön','Risk','Beta','Beta Heat','Önerilen Risk','Kesinti','K/Z','Durum','Gerekçe'].map((h, i) => el('th', { class: i >= 3 && i <= 8 ? 'r' : '' }, h))
  )));
  const body = el('tbody', {});
  report.rows.forEach(r => {
    const isLong = String(r.direction || '').includes('LONG');
    const tone = r.exposureStatus.includes('KESKİN') ? 'red' : r.exposureStatus === 'AZALT' ? 'yellow' : r.exposureStatus === 'HAFİF AZALT' ? 'cyan' : 'green';
    body.appendChild(el('tr', {},
      el('td', {}, el('div', { class: 'bold' }, r.symbol.replace('USDT','/USDT')), el('div', { class: 'tiny muted mt-2' }, r.priceSource || 'market')),
      el('td', {}, tag(r.family || 'Crypto', Number(r.beta || 1) >= 1.2 ? 'yellow' : 'gray')),
      el('td', {}, tag(r.direction, isLong ? 'green' : 'red')),
      el('td', { class: 'r mono' }, pct(r.riskPct)),
      el('td', { class: 'r mono' }, Number(r.beta || 0).toFixed(2)),
      el('td', { class: 'r mono bold ' + toneHeat(r.adjustedHeat, 0.55) }, heatTxt(r.adjustedHeat)),
      el('td', { class: 'r mono pos' }, pct(r.suggestedRiskPct)),
      el('td', { class: 'r mono ' + (r.riskCutPct ? 'warn' : '') }, r.riskCutPct ? `%${r.riskCutPct}` : '—'),
      el('td', { class: 'r mono ' + (Number(r.pnl || 0) >= 0 ? 'pos' : 'neg') }, money(r.pnl)),
      el('td', {}, tag(r.exposureStatus, tone)),
      el('td', { class: 'small muted' }, r.cutReason || '—')
    ));
  });
  tbl.appendChild(body);
  return card({
    title: 'POZİSYON BAZLI BETA-AYARLI RİSK',
    info: 'Raw risk × beta_to_BTC ile aynı yönlü kripto riski görünür hale getirilir.',
    actions: [tag(`${report.rows.length} pozisyon`, 'gray'), statusTag(report.summary.status)],
    body: el('div', { class: 'tbl-wrap' }, tbl)
  });
}

function buildClusterCards(report) {
  const grid = el('div', { class: 'row cols-3 section' });
  report.clusters.forEach(c => {
    grid.appendChild(card({
      title: c.label.toUpperCase(),
      actions: [statusTag(c.status)],
      body: el('div', {},
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Pozisyon'), el('span', { class: 'v mono' }, String(c.count))),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Raw risk'), el('span', { class: 'v mono' }, pct(c.rawRisk))),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Beta heat'), el('span', { class: 'v mono ' + toneHeat(c.betaRisk, c.limit) }, heatTxt(c.betaRisk))),
        el('div', { class: 'kv' }, el('span', { class: 'k' }, 'Limit'), el('span', { class: 'v mono' }, heatTxt(c.limit))),
        el('div', { class: 'mt-8' }, barbar(Math.min(100, (Math.abs(Number(c.betaRisk || 0)) / Math.max(Number(c.limit || 1), 0.01)) * 100), 100, c.status?.tone === 'red' ? 'red' : c.status?.tone === 'yellow' ? 'yellow' : 'green')),
        el('div', { class: 'small muted mt-8' }, c.note || c.status?.action || '')
      )
    }));
  });
  return grid;
}

function buildRiskCharts(report) {
  const grid = el('div', { class: 'row cols-2 section' });
  const barCard = el('div', { class: 'card' });
  barCard.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'RAW RİSK vs BETA HEAT'), el('div', { class: 'card-actions' }, tag('pozisyon', 'cyan'))));
  const barHost = el('div', { class: 'chart-host short mt-6' });
  barCard.appendChild(barHost);
  setTimeout(() => {
    canvasBarChart(barHost, report.rows.flatMap(r => [
      { label: r.symbol.replace('USDT',''), value: Number(r.riskPct || 0) },
      { label: '', value: Number(r.adjustedHeat || 0) }
    ]));
  }, 60);
  barCard.appendChild(el('div', { class: 'small muted mt-8' }, 'Her coin için raw risk ve beta-ayarlı heat yan yana düşünülmelidir; yüksek beta coinler küçük riskle bile portföyü ısıtır.'));
  grid.appendChild(barCard);

  const heatCard = el('div', { class: 'card' });
  heatCard.appendChild(el('div', { class: 'card-head' }, el('div', { class: 'card-title' }, 'KORELASYON MATRİSİ'), el('div', { class: 'card-actions' }, tag('proxy', 'yellow'))));
  const heatHost = el('div', { class: 'chart-host short mt-6' });
  heatCard.appendChild(heatHost);
  setTimeout(() => canvasHeatmap(heatHost, report.correlation.rows, { xLabels: report.correlation.labels }), 60);
  heatCard.appendChild(el('div', { class: 'small muted mt-8' }, 'Bu matristeki değerler beta/family/direction tabanlı proxy korelasyondur; gerçek borsa entegrasyonu olmadan manuel farkındalık katmanı olarak kullanılır.'));
  grid.appendChild(heatCard);
  return grid;
}

function buildCorrelationPairs(report) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Çift'), el('th', { class: 'r' }, 'Corr'), el('th', { class: 'r' }, 'Overlap Heat'), el('th', {}, 'Yön')
  )));
  const body = el('tbody', {});
  report.correlation.pairs.forEach(p => body.appendChild(el('tr', {},
    el('td', {}, `${p.a.replace('USDT','')} / ${p.b.replace('USDT','')}`),
    el('td', { class: 'r mono ' + (p.corr >= 0.7 ? 'warn' : p.corr < 0 ? 'pos' : '') }, Number(p.corr).toFixed(2)),
    el('td', { class: 'r mono ' + toneHeat(p.heatOverlap, 0.35) }, heatTxt(p.heatOverlap)),
    el('td', {}, tag(p.directionMix, p.directionMix === 'aynı yön' ? 'yellow' : 'cyan'))
  )));
  tbl.appendChild(body);
  return card({
    title: 'EN YOĞUN KORELASYONLU RİSK ÇİFTLERİ',
    info: 'Aynı yönde korelasyonlu coinler ayrı işlem gibi görünse de tek risk kümesine dönüşebilir.',
    body: el('div', { class: 'tbl-wrap' }, tbl)
  });
}

function buildStressTable(report) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['Senaryo','USDT.D','BTC.D','Long Heat','Total Heat','Limit','Alt Long Cut','Statü','Aksiyon'].map((h, i) => el('th', { class: i > 0 && i < 7 ? 'r' : '' }, h))
  )));
  const body = el('tbody', {});
  report.stress.forEach(s => body.appendChild(el('tr', { class: s.id === report.scenario.id ? 'active-row' : '' },
    el('td', {}, el('a', { href: '#/portfoy-isi?scenario=' + s.id, class: 'bold' }, s.label)),
    el('td', { class: 'r mono' }, pct(s.usdtDominance)),
    el('td', { class: 'r mono' }, pct(s.btcDominance)),
    el('td', { class: 'r mono ' + toneHeat(s.longHeat, 1.2) }, heatTxt(s.longHeat)),
    el('td', { class: 'r mono ' + toneHeat(s.totalHeat, s.limit) }, heatTxt(s.totalHeat)),
    el('td', { class: 'r mono' }, heatTxt(s.limit)),
    el('td', { class: 'r mono warn' }, s.altLongCut ? `%${s.altLongCut}` : '—'),
    el('td', {}, statusTag(s.status)),
    el('td', { class: 'small muted' }, s.action)
  )));
  tbl.appendChild(body);
  return card({
    title: 'SENARYO STRES TESTİ',
    info: 'USDT.D/BTC.D ve risk-off koşullarında portföy ısısının ne kadar sıkıştığını gösterir.',
    actions: [tag(report.scenario.label, 'cyan')],
    body: el('div', { class: 'tbl-wrap' }, tbl)
  });
}

function buildProtocol(report) {
  const warnings = report.summary.warnings || [];
  const body = el('div', {},
    el('div', { class: 'rux-note' }, 'Portfolio Heat v2 sinyal üretmez ve emir göndermez. Görevi, manuel pozisyonlar üst üste bindiğinde “aslında kaç ayrı risk taşıyorum?” sorusunu cevaplamaktır. Aynı yöne yığılınca terminalin ateşi yükselir; ateş yükselince de vezir fanı açar.'),
    el('div', { class: 'checklist mt-10' },
      ...warnings.map((w, i) => el('div', { class: 'check ' + (i === 0 && report.summary.status?.tone === 'green' ? 'ok' : 'warn') }, i === 0 && report.summary.status?.tone === 'green' ? ICN.check(13) : '!', w)),
      el('div', { class: 'check ok' }, ICN.check(13), 'BTC, ETH ve altcoin long pozisyonları tek yönlü kripto riski olarak gruplanır.'),
      el('div', { class: 'check ok' }, ICN.check(13), 'USDT.D güçlü yükselirse altcoin long risk önerisi düşürülür.'),
      el('div', { class: 'check ok' }, ICN.check(13), 'Makro risk-off veya BTC bear rejimde toplam long heat limiti düşer.')
    )
  );
  return card({ title: 'PORTFÖY ISI PROTOKOLÜ', actions: [statusTag(report.summary.status)], body });
}

export async function renderPortfoyIsi(host, params = {}) {
  const scenarioId = safeScenario(params.scenario || (() => { try { return localStorage.getItem('rux.portfolioHeatScenario') || 'base'; } catch { return 'base'; } })());
  try { localStorage.setItem('rux.portfolioHeatScenario', scenarioId); } catch {}
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'Portfolio Heat v2',
    subtitle: 'Beta-adjusted yön riski, korelasyon kümeleri ve USDT.D/BTC.D senaryolarına göre manuel portföy ısısı.',
    actions: scenarioLinks(scenarioId)
  }));
  host.appendChild(el('div', { class: 'empty' }, el('span', { class: 'loader' }), ' Portföy heat hesaplanıyor...'));

  const tf = State.tf || '4h';
  const markets = await loadMarkets(tf).catch(() => ({ bySymbol: {}, source: 'fallback' }));
  const report = buildPortfolioHeatV2Report({ marketData: markets, symbol: State.symbol || 'BTCUSDT', tf, scenarioId });

  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'Portfolio Heat v2',
    subtitle: `${portfolioHeatScenarioLabel(scenarioId)} · ${tf} · Beta-adjusted risk, direction exposure ve korelasyonlu portföy ısısı.`,
    actions: scenarioLinks(scenarioId)
  }));
  host.appendChild(buildSummary(report));
  host.appendChild(buildPositionsTable(report));
  host.appendChild(buildClusterCards(report));
  host.appendChild(buildRiskCharts(report));
  const row = el('div', { class: 'row cols-2 section' });
  row.appendChild(buildCorrelationPairs(report));
  row.appendChild(buildStressTable(report));
  host.appendChild(row);
  const dist = el('div', { class: 'row cols-2 section' });
  const long = report.rows.filter(r => String(r.direction).includes('LONG')).length;
  const short = report.rows.filter(r => String(r.direction).includes('SHORT')).length;
  dist.appendChild(card({
    title: 'YÖN DAĞILIMI',
    body: el('div', { class: 'flex center mt-6' }, donut({ data: [{ value: long, color: '#10b981' }, { value: short, color: '#ef4444' }], size: 138, thickness: 18, centerTitle: 'LONG/SHORT', centerValue: `${long}/${short}` }))
  }));
  dist.appendChild(buildProtocol(report));
  host.appendChild(dist);
}
