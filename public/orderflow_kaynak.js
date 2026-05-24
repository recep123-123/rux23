/* RUx — Order Flow / CVD Kaynakları ayrı ekran */
import { el, testApiEndpoint } from './api.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { ICN, statCard, card, pageHead, tag } from './components.js?v=0.75.12-heatmap-premium-visual-pass-20260524';
import { getOrderflowScoreMode, orderflowScoreModeLabel } from './rux_settings.js?v=0.75.12-heatmap-premium-visual-pass-20260524';

const SOURCES = [
  { name: 'CVD / Delta Proxy', kind: 'Proxy', provider: 'Binance/Market OHLCV', path: '/api/market?symbol=BTCUSDT&tf=4h&limit=120', note: 'Hazır kurumsal footprint değil; taker/mum bazlı proxy.' },
  { name: 'Order Book / Depth', kind: 'Gerçek', provider: 'Public Depth', path: '/api/liquidity?symbol=BTCUSDT', note: 'Depth/likidite kaynağı; veri kalitesi bölgeye göre değişebilir.' },
  { name: 'Funding', kind: 'Gerçek', provider: 'Binance → Bybit → OKX fallback', path: '/api/funding-history?symbol=BTCUSDT', note: 'Funding fallback zinciri.' },
  { name: 'Open Interest', kind: 'Gerçek', provider: 'Futures / Hyperliquid', path: '/api/futures?symbol=BTCUSDT', note: 'OI ve türev bağlamı.' },
  { name: 'Hyperliquid L2 Context', kind: 'Gerçek', provider: 'Hyperliquid public info', path: '/api/hyperliquid?mode=derivatives&symbol=BTCUSDT', note: 'Mark, funding, OI ve L2 bağlamı.' },
  { name: 'Liquidation Proxy', kind: 'Proxy', provider: 'Public stream / proxy', path: '/api/liquidity?symbol=BTCUSDT&scope=liquidation', optional: true, note: 'Ücretsiz kaynaklarda eksik olabilir; şimdilik gözlem.' },
];

function scoreRow(r, result) {
  if (!result || !result.ok) return r.optional ? 45 : 25;
  let score = r.kind === 'Gerçek' ? 76 : 62;
  const latency = Number(result.latencyMs || 0);
  if (latency && latency < 700) score += 12;
  else if (latency && latency < 1600) score += 6;
  else if (latency > 3500) score -= 12;
  if (r.kind === 'Proxy') score -= 8;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function statusClass(score) {
  return score >= 75 ? 'green' : score >= 55 ? 'yellow' : 'red';
}

function buildTable(rows) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['KAYNAK','TÜR','SAĞLAYICI','DURUM','GECİKME','KALİTE','SKOR ETKİSİ','NOT'].map(h => el('th', {}, h))
  )));
  const tb = el('tbody', {});
  rows.forEach(r => tb.appendChild(el('tr', {},
    el('td', {}, el('div', { class: 'bold small' }, r.name), el('div', { class: 'tiny muted mono' }, r.path)),
    el('td', {}, tag(r.kind, r.kind === 'Gerçek' ? 'green' : r.kind === 'Proxy' ? 'yellow' : 'gray')),
    el('td', { class: 'small muted' }, r.provider),
    el('td', {}, tag(r.status || 'TEST BEKLİYOR', r.statusTone || 'gray')),
    el('td', { class: 'mono' }, Number.isFinite(Number(r.latencyMs)) ? Math.round(r.latencyMs) + 'ms' : '—'),
    el('td', { class: 'mono bold ' + (r.score >= 75 ? 'pos' : r.score >= 55 ? 'warn' : 'neg') }, Number.isFinite(Number(r.score)) ? Math.round(r.score) + '/100' : '—'),
    el('td', {}, tag(r.scoreIncluded ? 'AKTİF' : 'KAPALI', r.scoreIncluded ? 'cyan' : 'gray')),
    el('td', { class: 'small muted' }, r.note || r.error || '—')
  )));
  tbl.appendChild(tb);
  return tbl;
}

function summaryCards(rows, mode) {
  const ok = rows.filter(r => r.ok).length;
  const proxy = rows.filter(r => r.kind === 'Proxy').length;
  const avg = rows.length ? Math.round(rows.reduce((a,r) => a + (Number(r.score) || 0), 0) / rows.length) : 0;
  const scoreActive = mode !== 'off';
  const wrap = el('div', { class: 'stat-row cols-4 section' });
  wrap.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'cyan', label: 'KAYNAK DURUMU', value: `${ok}/${rows.length}`, sub: 'çalışan kaynak' }));
  wrap.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'yellow', label: 'PROXY VERİ', value: String(proxy), sub: 'CVD/likidasyon türetilmiş olabilir' }));
  wrap.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: avg >= 75 ? 'green' : 'yellow', label: 'ORT. KALİTE', value: avg + '/100', sub: 'kaynak kalite skoru' }));
  wrap.appendChild(statCard({ icon: ICN.cpu(18), iconColor: scoreActive ? 'cyan' : 'yellow', label: 'SKOR ETKİSİ', value: scoreActive ? orderflowScoreModeLabel(mode) : 'KAPALI', sub: scoreActive ? 'confirmation etkisi var' : 'gözlem modu' }));
  return wrap;
}

export async function renderOrderflowKaynak(host) {
  host.innerHTML = '';
  const mode = getOrderflowScoreMode();
  host.appendChild(pageHead({
    title: 'ORDER FLOW / CVD KAYNAK DURUMU',
    subtitle: 'CVD, delta, order book, funding, OI ve likidite kaynaklarının gerçek/proxy/fallback durumunu gösterir.',
    actions: [
      el('a', { class: 'btn', href: '#/webhook-api' }, ICN.link(13), 'AYARLAR'),
      el('button', { class: 'btn primary', 'data-of-refresh': '1' }, ICN.refresh(13), 'KAYNAKLARI TEST ET'),
    ]
  }));

  const initialRows = SOURCES.map(s => ({ ...s, status: 'TEST BEKLİYOR', statusTone: 'gray', score: s.kind === 'Proxy' ? 55 : 65, scoreIncluded: mode !== 'off' }));
  const summaryHost = el('div', { 'data-of-summary': '1' });
  summaryHost.appendChild(summaryCards(initialRows, mode));
  host.appendChild(summaryHost);

  host.appendChild(card({
    title: 'VERİ POLİTİKASI',
    actions: [tag(mode === 'off' ? 'GÖZLEM MODU' : orderflowScoreModeLabel(mode).toUpperCase(), mode === 'off' ? 'yellow' : 'cyan')],
    body: el('div', { class: 'small muted', style: 'line-height:1.7' },
      'Ücretsiz/public kaynaklar kullanılacağı için CVD ve likidasyon verisi bazı durumlarda proxy olarak hesaplanır. Varsayılan ayarda bu katman karar skoruna etki etmez; yalnızca gözlem ve teyit amaçlı gösterilir. Skor etkisi Sistem → API & Ayarlar ekranından sonradan değiştirilebilir.'
    )
  }));

  const tableHost = el('div', { class: 'card section', 'data-of-table-card': '1' },
    el('div', { class: 'card-head' },
      el('div', { class: 'card-title' }, 'KAYNAK TEST TABLOSU'),
      el('span', { class: 'tag gray' }, 'BEKLEMEDE')
    ),
    el('div', { class: 'tbl-wrap', 'data-of-table': '1' }, buildTable(initialRows))
  );
  host.appendChild(tableHost);

  const refresh = host.querySelector('[data-of-refresh]');
  if (refresh) refresh.addEventListener('click', () => runOrderflowSourceTest(host));
}

async function runOrderflowSourceTest(host) {
  const mode = getOrderflowScoreMode();
  const tableWrap = host.querySelector('[data-of-table]');
  const summaryHost = host.querySelector('[data-of-summary]');
  const badge = host.querySelector('[data-of-table-card] .card-head .tag');
  if (badge) { badge.textContent = 'TEST EDİLİYOR'; badge.className = 'tag cyan'; }
  const rows = [];
  for (const s of SOURCES) {
    try {
      const result = await testApiEndpoint(s.path + (s.path.includes('?') ? '&' : '?') + 'ofcheck=' + Date.now(), { timeoutMs: s.optional ? 6500 : 8500, optional: !!s.optional, category: 'orderflow' });
      const score = scoreRow(s, result);
      rows.push({ ...s, ...result, score, status: result.ok ? 'ÇALIŞIYOR' : s.optional ? 'OPSİYONEL' : 'SORUN', statusTone: result.ok ? 'green' : s.optional ? 'yellow' : 'red', scoreIncluded: mode !== 'off', note: result.ok ? s.note : (result.error || s.note) });
    } catch (err) {
      rows.push({ ...s, ok: false, score: s.optional ? 40 : 20, status: s.optional ? 'OPSİYONEL' : 'SORUN', statusTone: s.optional ? 'yellow' : 'red', latencyMs: null, scoreIncluded: mode !== 'off', error: err?.message || 'Test hatası' });
    }
  }
  if (tableWrap) { tableWrap.innerHTML = ''; tableWrap.appendChild(buildTable(rows)); }
  if (summaryHost) { summaryHost.innerHTML = ''; summaryHost.appendChild(summaryCards(rows, mode)); }
  if (badge) { badge.textContent = 'GÜNCEL'; badge.className = 'tag green'; }
}
