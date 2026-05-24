/* RUx — Haber Akışı / Telegram filtre motoru */
import { fetchNews, State, el, fmtTimeShort, toast } from './api.js?v=0.75.9-heatmap-premium-rework-20260524';
import { ICN, statCard, pageHead } from './components.js?v=0.75.9-heatmap-premium-rework-20260524';

let currentMode = 'global';
const NEWS_REFRESH_MS = 5_000;

export async function renderHaber(host, opts = {}) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'HABER AKIŞI',
    subtitle: 'Telegram ve haber kaynaklarından sadece gerçek haberleri gösterir; liquidation, whale ve transfer alarmlarını ayıklar.',
    actions: [
      el('div', { class: 'select' }, 'Türkçe Akış ', ICN.chev(10)),
      el('div', { class: 'select' }, 'Son 24s ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow' }, ICN.shieldcheck(12), 'ALERTLER FİLTRELİ'),
      el('button', { class: 'btn primary', id: 'btnRefreshNews' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section', id: 'newsStats' });
  buildStats(stats, [], { total: 0, filtered_alerts: 0, provider: 'Yükleniyor' });
  host.appendChild(stats);

  const filters = el('div', { class: 'flex gap-6 section', style: 'flex-wrap:wrap' });
  [
    ['global', 'Tüm Haberler'],
    ['coin', 'Coin Odaklı'],
    ['critical', 'Kritik'],
  ].forEach(([mode, label]) => {
    filters.appendChild(el('button', {
      class: 'btn sm ' + (currentMode === mode ? 'outline-cyan' : ''),
      on: { click: () => { currentMode = mode; renderHaber(host); } }
    }, label));
  });
  filters.appendChild(el('span', { class: 'tag green' }, 'SADECE HABER'));
  filters.appendChild(el('span', { class: 'tag yellow' }, 'LIQUIDATION / WHALE GİZLİ'));
  host.appendChild(filters);

  const info = el('div', { class: 'card section' },
    el('div', { class: 'flex between items-center gap-12', style: 'flex-wrap:wrap' },
      el('div', {},
        el('div', { class: 'small bold' }, 'RUx Haber Filtre Motoru'),
        el('div', { class: 'tiny muted mt-4' }, 'Telegram kanalları ayarlanmışsa /api/news-pulse içine header ile iletilir. Bot gibi emir/alert verileri bu ekranda haber akışına karışmaz.')
      ),
      el('div', { class: 'mono tiny muted', id: 'newsProviderNote' }, 'Kaynak bekleniyor...')
    )
  );
  host.appendChild(info);

  const list = el('div', { class: 'card', id: 'newsList' });
  list.appendChild(buildLoadingRow('Canlı Türkçe haber akışı yükleniyor…'));
  host.appendChild(list);

  host.querySelector('#btnRefreshNews')?.addEventListener('click', () => hydrateNews(host, list, stats, { force: true, manual: true }));

  await hydrateNews(host, list, stats, { ...opts, force: true });

  const timer = setInterval(() => {
    if (!document.body.contains(host)) { clearInterval(timer); return; }
    if (!document.hidden) hydrateNews(host, list, stats, { silent: true });
  }, NEWS_REFRESH_MS);
}

async function hydrateNews(host, list, stats, opts = {}){
  try {
    const data = await fetchNews(State.symbol, 'tr', currentMode, { force: !!opts.force, noCache: !!opts.noCache, limit: 32 });
    const items = normalizeApiItems(data?.items || []);
    if(items.length){
      const signature = items.slice(0, 8).map(x => `${x.time}|${x.title}`).join('§');
      if (list.dataset.signature !== signature) {
        list.innerHTML = '';
        items.slice(0, 32).forEach(it => list.appendChild(buildNewsRow(it)));
        list.dataset.signature = signature;
      }
      buildStats(stats, items, data?.stats || {}, data);
    } else if (!list.dataset.signature) {
      list.innerHTML = '';
      list.appendChild(buildLoadingRow('Canlı haber bulunamadı; kaynaklar yeniden deneniyor.'));
    }
    const note = host.querySelector('#newsProviderNote');
    if(note){
      const fp = data?.filter_policy || {};
      const src = fp.telegram_source ? `Telegram: ${fp.telegram_source}` : 'Telegram kaynağı yok';
      const fresh = data?.cached ? 'cache/5sn' : 'canlı/5sn';
      const tr = data?.translation_provider || 'tr-fallback';
      note.textContent = `${data?.provider || 'kaynak yok'} · ${src} · ${fresh} · çeviri:${tr} · gizlenen alert: ${fp.filtered_alerts ?? data?.stats?.filtered_alerts ?? 0}`;
    }
  } catch (e) {
    toast('Haber akışı alınamadı; güvenli örnek akış gösteriliyor.', 'warn', 'Haber');
  }
}

function buildStats(node, items, stats = {}, data = {}){
  node.innerHTML = '';
  const total = stats.total ?? items.length;
  const positive = stats.bullish ?? items.filter(x => x.sent === 'pos' || x.sentiment_label === 'bullish').length;
  const negative = stats.bearish ?? items.filter(x => x.sent === 'neg' || x.sentiment_label === 'bearish').length;
  const neutral = Math.max(0, total - positive - negative);
  const high = stats.high_impact ?? items.filter(x => (x.impact_score || 0) >= 82 || x.imp === 'Yüksek').length;
  const filtered = stats.filtered_alerts ?? data?.filter_policy?.filtered_alerts ?? 0;
  const providerCount = Array.isArray(data?.sources) ? data.sources.length : 0;
  node.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'cyan', label: 'HABER', value: String(total), sub: 'Filtrelenmiş akış' }));
  node.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'POZİTİF', value: String(positive), sub: total ? '%' + Math.round(positive/total*100) : '%0', subColor: 'pos' }));
  node.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'NEGATİF', value: String(negative), sub: total ? '%' + Math.round(negative/total*100) : '%0', subColor: 'neg' }));
  node.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'yellow', label: 'NÖTR', value: String(neutral), sub: 'Düşük yön etkisi' }));
  node.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'YÜKSEK ETKİ', value: String(high), sub: 'Öncelikli takip', subColor: high ? 'warn' : '' }));
  node.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'GİZLENEN ALERT', value: String(filtered), sub: providerCount ? providerCount + ' kaynak' : 'Liquidation/whale yok', subColor: filtered ? 'warn' : 'pos' }));
}

function normalizeApiItems(items){
  return items.map(it => {
    const sentiment = it.sentiment_label || it.sentiment || 'neutral';
    const impact = Number(it.impact_score ?? it.impact ?? 50);
    return {
      time: formatItemTime(it.created_at || it.published_at || it.time),
      cat: categoryLabel(it),
      catCls: categoryClass(it),
      title: it.title_display || it.title_tr || it.title || '',
      summary: it.description_display || it.description_tr || it.summary || it.description || '',
      source: it.source || it.provider || 'Kaynak',
      imp: impact >= 82 ? 'Yüksek' : impact >= 64 ? 'Orta/Yüksek' : impact >= 45 ? 'Orta' : 'Düşük',
      impact_score: impact,
      sent: sentiment === 'bullish' ? 'pos' : sentiment === 'bearish' ? 'neg' : sentiment === 'macro-risk' ? 'warn' : 'neutral',
      url: it.url || '',
      coin_tags: it.coin_tags || [],
      source_count: it.source_count || 1
    };
  }).filter(x => x.title);
}

function categoryLabel(it){
  const t = `${it.title || ''} ${it.description || ''} ${it.title_display || ''} ${it.description_display || ''}`.toLowerCase();
  if(/fed|fomc|cpi|pce|inflation|treasury|dxy|rate|nasdaq/.test(t)) return 'MAKRO';
  if(/sec|etf|regulation|lawsuit|approval/.test(t)) return 'DÜZENLEME';
  if(/hack|exploit|breach|security|depeg/.test(t)) return 'GÜVENLİK';
  if(/stablecoin|exchange flow|on-chain|wallet|reserve/.test(t)) return 'ON-CHAIN';
  if((it.coin_tags || []).length) return 'COIN';
  return 'HABER';
}
function categoryClass(it){
  const label = categoryLabel(it);
  return ({ MAKRO:'macro', DÜZENLEME:'haber', GÜVENLİK:'funding', 'ON-CHAIN':'onchain', COIN:'piyasa', HABER:'haber' })[label] || 'haber';
}
function formatItemTime(v){
  const d = new Date(v || Date.now());
  return Number.isFinite(d.getTime()) ? fmtTimeShort(d) : '—';
}


function buildLoadingRow(message = 'Yükleniyor…') {
  return el('div', { class: 'small muted', style: 'padding:18px; border-bottom: 1px solid var(--bd-1);' },
    el('span', { class: 'tag cyan' }, 'LIVE'), ' ', message
  );
}

function fallbackItems() {
  return [
    { time: '15:43', cat: 'HABER', catCls: 'haber', title: 'Spot BTC ETF girişleri piyasa iştahını destekliyor.', summary: 'ETF akışları ve spot talep güçlü kaldığında BTC tarafında risk iştahı korunur. Bu satır örnek güvenli haber akışıdır.', source: 'RUx Örnek', imp: 'Yüksek', sent: 'pos' },
    { time: '15:02', cat: 'MAKRO', catCls: 'macro', title: 'Fed üyeleri faiz indirimi için temkinli mesaj verdi.', summary: 'Makro haberler kripto risk iştahını etkileyebilir. Haberler karar motorunu otomatik değiştirmez; sadece ekranda gösterilir.', source: 'RUx Örnek', imp: 'Yüksek', sent: 'warn' },
    { time: '14:18', cat: 'GÜVENLİK', catCls: 'funding', title: 'Büyük borsa, cüzdan bakımını tamamladığını duyurdu.', summary: 'Operasyonel borsa haberleri özellikle kısa vadeli spread ve likidite davranışında izlenir.', source: 'RUx Örnek', imp: 'Orta', sent: 'neutral' }
  ];
}

function buildNewsRow(n) {
  const sentimentText = n.sent === 'pos' ? '↑ Pozitif' : n.sent === 'neg' ? '↓ Negatif' : n.sent === 'warn' ? '⚠ Makro/Risk' : '— Nötr';
  const sentimentClass = n.sent === 'pos' ? 'pos' : n.sent === 'neg' ? 'neg' : n.sent === 'warn' ? 'warn' : 'muted';
  return el('div', { style: 'display:grid; grid-template-columns: 60px 100px 1fr auto auto; gap:12px; padding:14px; border-bottom: 1px solid var(--bd-1); align-items:start;' },
    el('span', { class: 'mono small muted' }, n.time || '—'),
    el('span', {}, el('span', { class: 'chip-cat ' + (n.catCls || 'haber') }, n.cat || 'HABER')),
    el('div', {},
      el('div', { class: 'small bold' }, n.title),
      el('div', { class: 'tiny mt-2', style: 'color:var(--fg-3); line-height:1.5' }, n.summary || ''),
      el('div', { class: 'flex gap-12 mt-6', style: 'flex-wrap:wrap' },
        el('span', { class: 'tiny muted' }, 'Kaynak: ' + (n.source || 'External')),
        el('span', { class: 'tiny muted' }, 'Etki: ', el('span', { class: n.imp === 'Yüksek' ? 'warn bold' : '' }, n.imp || 'Orta')),
        n.source_count > 1 ? el('span', { class: 'tiny pos bold' }, n.source_count + ' kaynakta görüldü') : null,
        el('span', { class: 'tiny ' + sentimentClass + ' bold' }, sentimentText)
      )
    ),
    el('span', {}, el('span', { class: 'om-icon-btn small' }, ICN.bell(12))),
    el('span', {}, el('button', { class: 'om-icon-btn small', disabled: !n.url, title: n.url ? 'Kaynağı aç' : 'Kaynak linki yok', on: { click: () => n.url && window.open(n.url, '_blank', 'noopener,noreferrer') } }, ICN.externalLink(12))),
  );
}
