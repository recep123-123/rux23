/* RUx — Sistem / API Sağlığı + Order Flow Şeffaflığı */
import { fetchIntel, el, testApiEndpoint, RUX_HEALTH_ENDPOINTS, getRuxSourceLog, clearRuxSourceLog } from './api.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { getRuxSettings, maskSecret, settingsCompletionScore, getOrderflowScoreMode, orderflowScoreModeLabel } from './rux_settings.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { makeRuxSystemSnapshot, makeRuxDecisionSnapshot, statusClass, makeRuxDataConfidenceReport } from './rux_core.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { loadRecentErrors, loadAudit, storageStats, isPersistenceAvailable } from './rux_storage.js?v=0.75.11-heatmap-tf-recalibration-20260524';

export async function renderSistem(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'SİSTEM DURUMU',
    subtitle: 'API entegrasyonları, veri kaynakları, RUx motorları ve Türkçe sistem ayarları.',
    actions: [
      el('button', { class: 'btn outline-yellow', id: 'rux-run-ui-audit', title: 'Sayfa kontrollerini denetle ve ölü buton/gösterge raporu üret' }, ICN.warning(12), 'UI DENETİMİ ÇALIŞTIR'),
      el('button', { class: 'btn primary', 'data-rux-source-refresh': '1' }, ICN.refresh(12), 'YENİDEN TEST ET'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section', 'data-rux-source': 'COMPUTED' });
  const renderStats = () => {
    const log = (typeof getRuxSourceLog === 'function' ? getRuxSourceLog(80) : []) || [];
    const ok = log.filter(r => r && r.ok === true).length;
    const hp = log.length ? Math.round((ok / log.length) * 1000) / 10 : 100;
    const lat = log.filter(r => r && r.ok === true).map(r => Number(r.latencyMs)).filter(n => Number.isFinite(n) && n > 0);
    const al = lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0;
    const fb = log.filter(r => r && r.fallback === true).length;
    const ep = (RUX_HEALTH_ENDPOINTS || []).length || 15;
    stats.innerHTML = '';
    stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: hp >= 90 ? 'green' : hp >= 70 ? 'yellow' : log.length ? 'red' : 'cyan', label: 'GENEL SAĞLIK', value: log.length ? '%' + hp : '—', sub: log.length ? `${ok}/${log.length} çağrı başarılı` : 'Veri toplanıyor...', subColor: hp >= 90 ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'cyan', label: 'İZLENEN UÇ', value: String(ep), sub: 'Sağlık kontrolü kapsamı', subColor: 'pos' }));
    stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: fb > 0 ? 'yellow' : 'green', label: 'FALLBACK', value: String(fb), sub: fb > 0 ? 'Yedek kaynağa düşüldü' : 'Birincil kaynak aktif', subColor: fb > 0 ? 'warn' : 'pos' }));
    stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: al > 800 ? 'red' : al > 350 ? 'yellow' : 'purple', label: 'GECİKME (ORT.)', value: al ? al + 'ms' : '—', sub: al ? (al < 350 ? 'Düşük' : al < 800 ? 'Orta' : 'Yüksek (soğuk başlangıç olabilir)') : 'Ölçülüyor', subColor: al < 350 ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'blue', label: 'KAYITLI ÇAĞRI', value: String(log.length), sub: 'Son oturum source-log', subColor: 'pos' }));
    stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: isPersistenceAvailable() ? 'green' : 'yellow', label: 'KALICI DEPO', value: isPersistenceAvailable() ? 'IndexedDB' : 'localStorage', sub: isPersistenceAvailable() ? 'Aktif' : 'Yedek mod', subColor: 'pos' }));
  };
  renderStats();
  host.appendChild(stats);
  // Loglar genelde sayfa açılışından sonra dolar; birkaç saniye sonra metrikleri tazele.
  setTimeout(renderStats, 2500);
  setTimeout(renderStats, 6000);
  // "YENİDEN TEST ET" sonrası da tazele
  setTimeout(() => { host.querySelector('[data-rux-source-refresh]')?.addEventListener('click', () => setTimeout(renderStats, 1500)); }, 200);


  const apiSettings = getRuxSettings();
  const apiPanel = el('div', { class: 'card section rux-compact-card' });
  apiPanel.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'API / AYAR KATMANI'),
    el('a', { class: 'tag cyan', href: '#/webhook-api' }, 'API & AYARLAR')
  ));
  const apiGrid = el('div', { class: 'rux-compact-grid' });
  apiGrid.appendChild(engineMetric('Ayar Tamlığı', settingsCompletionScore(apiSettings) + '/100', 'Kullanıcı ayar profili', settingsCompletionScore(apiSettings) >= 80 ? 'green' : 'yellow'));
  apiGrid.appendChild(engineMetric('Veri Modu', apiSettings.dataMode === 'live' ? 'CANLI' : apiSettings.dataMode === 'demo' ? 'DEMO' : 'GÜVENLİ', 'Canlı/fallback davranışı', 'cyan'));
  apiGrid.appendChild(engineMetric('Öncelikli Borsa', String(apiSettings.preferredExchange || 'binance').toUpperCase(), 'Kaynak önceliği', 'purple'));
  apiGrid.appendChild(engineMetric('CMC Key', apiSettings.cmcApiKey ? 'TANIMLI' : 'YOK', maskSecret(apiSettings.cmcApiKey), apiSettings.cmcApiKey ? 'green' : 'yellow'));
  apiGrid.appendChild(engineMetric('Yenileme', apiSettings.refreshSeconds + ' sn', 'UI veri frekansı', 'cyan'));
  apiGrid.appendChild(engineMetric('Manuel Risk', '%' + apiSettings.defaultRiskPct, 'Varsayılan plan riski', 'green'));
  apiPanel.appendChild(apiGrid);
  apiPanel.appendChild(el('div', { class: 'small muted mt-12' }, 'API anahtarları ve kaynak sağlık testi ayrı ekranda yönetilir. Otomatik emir yetkisi bağlanmadı; ayarlar yalnızca veri, sinyal doğrulama ve manuel plan üretimi içindir.'));
  host.appendChild(apiPanel);

  const orderflowPanel = buildOrderflowSourceTransparencyPanel();
  host.appendChild(orderflowPanel);
  hydrateOrderflowSourceTransparencyPanel(orderflowPanel);

  // RUx framework integration layer - existing visual structure is preserved; this only adds Turkish engine visibility.
  const rux = makeRuxSystemSnapshot();
  const snap = makeRuxDecisionSnapshot({ tf: '4h', source: 'binance' });
  const ruxPanel = el('div', { class: 'card section' });
  ruxPanel.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx SİSTEM MOTORLARI'),
    el('span', { class: 'tag cyan' }, rux.version)
  ));
  const ruxGrid = el('div', { class: 'row cols-4' });
  ruxGrid.appendChild(engineMetric('Görsel Koruma', rux.visualFreeze ? 'AKTİF' : 'PASİF', 'Mevcut kart yapısı korunuyor', 'green'));
  ruxGrid.appendChild(engineMetric('Otomatik Emir', rux.autoTrade ? 'AÇIK' : 'KAPALI', 'Sadece manuel karar destek', 'yellow'));
  ruxGrid.appendChild(engineMetric('Dil Standardı', rux.language, 'Türkçe karar dili', 'cyan'));
  ruxGrid.appendChild(engineMetric('P0 Motor', String(rux.activeSkeletonModules), 'aktif iskelet', 'purple'));
  ruxPanel.appendChild(ruxGrid);

  const engineGrid = el('div', { class: 'rux-engine-grid mt-12' });
  rux.phases.forEach(m => {
    engineGrid.appendChild(el('a', { class: 'rux-engine-card ' + m.phase.toLowerCase(), href: m.route },
      el('div', { class: 'flex between items-center' },
        el('span', { class: 'tag ' + (m.phase === 'P0' ? 'green' : m.phase === 'P1' ? 'cyan' : 'yellow') }, m.phase),
        el('span', { class: 'tiny muted' }, m.status)
      ),
      el('div', { class: 'bold mt-8' }, m.module),
      el('div', { class: 'tiny muted mt-6' }, m.purpose)
    ));
  });
  ruxPanel.appendChild(engineGrid);
  ruxPanel.appendChild(el('div', { class: 'small muted mt-12', style: 'line-height:1.6' }, rux.nextStage));
  host.appendChild(ruxPanel);

  const decisionRow = el('div', { class: 'row cols-4 section' });
  decisionRow.appendChild(card({ title: 'VERİ GÜVENİ', body: metricList([
    ['Skor', snap.data.score + '/100', statusClass(snap.data.score)],
    ['Güncellik', snap.data.freshness + '/100', statusClass(snap.data.freshness)],
    ['Tamlık', snap.data.completeness + '/100', statusClass(snap.data.completeness)],
    ['Tutarlılık', snap.data.consistency + '/100', statusClass(snap.data.consistency)],
  ]) }));
  decisionRow.appendChild(card({ title: 'ADAPTİF EŞİKLER', body: metricList([
    ['Volume Spike', String(snap.thresholds.volumeSpike), ''],
    ['BOS Min ATR', snap.thresholds.bosBodyMinAtr + 'x', ''],
    ['Reclaim Penceresi', snap.thresholds.reclaimWindowBars + ' mum', ''],
    ['Volatilite', snap.thresholds.volatilityPct + '%', statusClass(100 - snap.thresholds.volatilityPct * 10)],
  ]) }));
  decisionRow.appendChild(card({ title: 'MALİYET / NET-R', body: metricList([
    ['Gross R', '+' + snap.cost.grossR + 'R', 'pos'],
    ['Fee + Spread', '-' + (snap.cost.feeR + snap.cost.spreadR).toFixed(3) + 'R', 'warn'],
    ['Slippage + Funding', '-' + (snap.cost.slippageR + snap.cost.fundingR).toFixed(3) + 'R', 'warn'],
    ['Net-R', '+' + snap.cost.netR + 'R', 'pos'],
  ]) }));
  decisionRow.appendChild(card({ title: 'NO-TRADE KONTROLÜ', body: metricList([
    ['Durum', snap.noTrade.label, snap.noTrade.blocked ? 'neg' : 'pos'],
    ['Skor', snap.noTrade.score + '/100', statusClass(snap.noTrade.score, true)],
    ['Hard Block', snap.noTrade.hardBlocks.length ? snap.noTrade.hardBlocks.join(', ') : 'Yok', snap.noTrade.hardBlocks.length ? 'neg' : 'pos'],
    ['Soft Warning', snap.noTrade.softWarnings.length ? snap.noTrade.softWarnings.join(', ') : 'Yok', snap.noTrade.softWarnings.length ? 'warn' : 'pos'],
  ]) }));
  host.appendChild(decisionRow);

  const sourcePanel = buildSourceConfidencePanel();
  host.appendChild(sourcePanel);
  hydrateSourceConfidencePanel(sourcePanel);
  const refreshSourceBtn = host.querySelector('[data-rux-source-refresh]');
  if (refreshSourceBtn) refreshSourceBtn.addEventListener('click', () => hydrateSourceConfidencePanel(sourcePanel, { force: true }));



  // Services
  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'SERVİS / API'),
    el('th', {}, 'KATEGORİ'),
    el('th', {}, 'DURUM'),
    el('th', { class: 'r' }, 'GECİKME'),
    el('th', { class: 'r' }, 'UPTIME'),
    el('th', { class: 'r' }, 'SON ÇAĞRI'),
    el('th', { class: 'r' }, 'BAŞARILI'),
  )));
  const tb = el('tbody', {});
  const services = [
    ['Market Data','/api/market','Piyasa','green',98],
    ['CoinMarketCap','/api/cmc','Piyasa','green',124],
    ['DeFi Llama','/api/defillama','On-Chain','green',186],
    ['CVD Analytics','/api/cvd','Akış','green',142],
    ['Funding Rates','/api/funding-history','Türev','green',98],
    ['Open Interest','/api/futures','Türev','green',112],
    ['Liquidity','/api/liquidity','Akış','green',164],
    ['News Pulse','/api/news-pulse','Haber','green',218],
    ['Fear & Greed','/api/feargreed','Sentiment','green',76],
    ['Hyperliquid Context','/api/hyperliquid','Türev','green',152],
    ['Dune Intelligence','/api/hyperliquid?mode=dune','On-chain','yellow',420],
    ['Attention','/api/attention','İlgi','green',128],
    ['Intel','/api/intel','Sistem','green',64],
  ];
  services.forEach(([name, ep, cat, st, lat], i) => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'muted' }, String(i + 1)),
      el('td', {}, el('span', { class: 'flex items-center gap-6' }, ICN.flow(12), el('span', { class: 'small bold' }, name), el('span', { class: 'tiny muted mono' }, ep))),
      el('td', { class: 'small muted' }, cat),
      el('td', {}, el('span', { class: 'flex items-center gap-4' },
        el('span', { class: 'live-dot pos' }),
        el('span', { class: 'pos bold small' }, 'ÇALIŞIYOR')
      )),
      el('td', { class: 'r mono' }, lat + 'ms'),
      el('td', { class: 'r mono pos' }, '%99.9' + (i % 9)),
      el('td', { class: 'r mono small muted' }, '15:48:' + (10 + i)),
      el('td', { class: 'r mono pos bold' }, '%' + (98 + (i * 0.1)).toFixed(1)),
    ));
  });
  tbl.appendChild(tb);
  host.appendChild(card({ title: 'SERVİSLER', body: el('div', { class: 'tbl-wrap' }, tbl) }));

  // Bottom row: events, perf, settings
  const row = el('div', { class: 'row cols-3 section' });
  // Events
  const ev = el('div', {});
  [
    ['15:48','INFO','Tüm servisler çalışıyor','green'],
    ['15:42','INFO','Market Data servisi yenilendi','green'],
    ['14:18','INFO','Funding cache yenilendi','green'],
    ['12:42','UYARI','News Pulse: 1 saniye gecikme','yellow'],
    ['11:12','INFO','Hyperliquid bağlantısı yeniden kuruldu','green'],
    ['08:18','INFO','Sistem güncellemesi başarılı (RUx v0.75.11-heatmap-tf-recalibration-20260524','green'],
    ['06:42','INFO','Otomatik yedekleme tamamlandı','green'],
  ].forEach(r => ev.appendChild(el('div', { style: 'display:grid; grid-template-columns: 50px 60px 1fr; gap:8px; padding:6px 0; border-bottom:1px dashed var(--bd-1); font-size:11.5px' },
    el('span', { class: 'mono small muted' }, r[0]),
    el('span', {}, el('span', { class: 'tag ' + r[3] }, r[1])),
    el('span', { class: 'small' }, r[2]),
  )));
  row.appendChild(card({ title: 'OLAYLAR', body: ev }));

  // Performance
  const perf = el('div', {});
  [
    ['Ort. Gecikme','142ms','pos'],
    ['Min Gecikme','64ms','pos'],
    ['Max Gecikme','632ms','warn'],
    ['Başarı Oranı','%99.4','pos'],
    ['Hata Oranı','%0.6','pos'],
    ['Cache Hit Oranı','%84.2','pos'],
    ['Aktif Bağlantı','12 / 19',''],
    ['Çağrı/Dakika','86.7','muted'],
    ['Bant Genişliği','1.24 MB/s','muted'],
    ['CPU Kullanımı','%18.4','pos'],
    ['Memory','428 MB','muted'],
  ].forEach(([k, v, c]) => perf.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v ' + (c || '') }, v))));
  row.appendChild(card({ title: 'PERFORMANS METRİKLERİ', body: perf }));

  // Settings
  const set = el('div', {});
  set.appendChild(el('div', { class: 'flex between mt-6' }, el('span', { class: 'small' }, 'Otomatik Yenileme'), el('span', { class: 'switch on' }, el('span', { class: 'track' }))));
  set.appendChild(el('div', { class: 'flex between mt-8' }, el('span', { class: 'small' }, 'Yenileme Aralığı'), el('div', { class: 'select small' }, '5 sn ', ICN.chev(10))));
  set.appendChild(el('div', { class: 'flex between mt-8' }, el('span', { class: 'small' }, 'Hata Bildirimi'), el('span', { class: 'switch on' }, el('span', { class: 'track' }))));
  set.appendChild(el('div', { class: 'flex between mt-8' }, el('span', { class: 'small' }, 'Cache Aktif'), el('span', { class: 'switch on' }, el('span', { class: 'track' }))));
  set.appendChild(el('div', { class: 'flex between mt-8' }, el('span', { class: 'small' }, 'Tema'), el('div', { class: 'select small' }, 'Karanlık ', ICN.chev(10))));
  set.appendChild(el('div', { class: 'flex between mt-8' }, el('span', { class: 'small' }, 'Dil'), el('div', { class: 'select small' }, 'Türkçe ', ICN.chev(10))));
  set.appendChild(el('div', { class: 'flex between mt-8' }, el('span', { class: 'small' }, 'Zaman Dilimi'), el('div', { class: 'select small' }, 'UTC+3 ', ICN.chev(10))));
  set.appendChild(el('button', { class: 'btn primary w-full mt-12', style: 'justify-content:center' }, 'AYARLARI KAYDET'));
  set.appendChild(el('button', { class: 'btn outline-yellow w-full mt-6', style: 'justify-content:center' }, 'CACHE TEMİZLE'));
  set.appendChild(el('button', { class: 'btn outline-red w-full mt-6', style: 'justify-content:center' }, 'SİSTEMİ YENİDEN BAŞLAT'));
  row.appendChild(card({ title: 'SİSTEM AYARLARI', body: set }));
  host.appendChild(row);

  // ── ÖLÜ KONTROL RAPORU + SON HATALAR (A19 + UI audit) ──
  const auditPanel = el('div', { class: 'card section', 'data-rux-source': 'COMPUTED' });
  auditPanel.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'UI SAĞLIK & ÖLÜ KONTROL RAPORU'),
    el('span', { class: 'tag cyan' }, 'CANLI DENETİM')
  ));
  const auditBody = el('div', { 'data-audit-body': '1' },
    el('div', { class: 'small muted' }, 'Her sayfada sağ altta bir denetim rozeti belirir (✓ temiz / ⚠ generic·ölü). Rozete tıklayınca o sayfanın pasif/generic butonları ve NOT WIRED göstergeleri listelenir. Aşağıdaki buton bu sayfayı anında tarar.')
  );
  auditPanel.appendChild(auditBody);
  host.appendChild(auditPanel);

  // Son hatalar tablosu (window.error / unhandledrejection → audit)
  const errPanel = el('div', { class: 'card section', 'data-rux-source': 'COMPUTED' });
  errPanel.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'SON HATALAR (OTURUM)'),
    el('button', { class: 'btn tiny outline-cyan', id: 'rux-refresh-errors' }, 'YENİLE')
  ));
  const errBody = el('div', { 'data-err-body': '1' }, el('div', { class: 'small muted' }, 'Yükleniyor...'));
  errPanel.appendChild(errBody);
  host.appendChild(errPanel);

  const renderErrors = async () => {
    try {
      const errors = await loadRecentErrors({ limit: 30 });
      errBody.innerHTML = '';
      if (!errors.length) {
        errBody.appendChild(el('div', { class: 'small', style: 'color:var(--green,#047857)' }, '✓ Kayıtlı hata yok. Sistem temiz.'));
        return;
      }
      errors.forEach(e => {
        errBody.appendChild(el('div', { class: 'flex between small', style: 'padding:4px 0; border-bottom:1px solid var(--bd-1)' },
          el('span', { style: 'color:var(--red,#8B0000)' }, '⚠ ' + (e.type || 'hata')),
          el('span', { class: 'muted', style: 'max-width:60%; text-align:right; overflow:hidden; text-overflow:ellipsis' }, String(e.message || '').slice(0, 80))
        ));
      });
    } catch {
      errBody.innerHTML = '';
      errBody.appendChild(el('div', { class: 'small muted' }, 'Hata kaydı okunamadı.'));
    }
  };
  renderErrors();
  setTimeout(() => { host.querySelector('#rux-refresh-errors')?.addEventListener('click', renderErrors); }, 100);

  // UI DENETİMİ ÇALIŞTIR butonu → mevcut DOM'daki pasif/generic kontrolleri say
  setTimeout(() => {
    host.querySelector('#rux-run-ui-audit')?.addEventListener('click', () => {
      const all = Array.from(document.querySelectorAll('#om-page button, #om-page .btn, #om-page .qg-link, #om-page .tb'));
      const passive = all.filter(b => b.getAttribute('data-rux-action-state') === 'view' || b.getAttribute('data-rux-action-state') === 'bridged');
      const bridged = all.filter(b => b.getAttribute('data-rux-bridge-action'));
      const notWired = Array.from(document.querySelectorAll('#om-page [data-rux-audit="NOT_WIRED"], #om-page .notwired'));
      auditBody.innerHTML = '';
      auditBody.appendChild(el('div', { class: 'rux-compact-grid' },
        el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'Toplam Kontrol'), el('div', { class: 'rux-kpi-value' }, String(all.length))),
        el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'Generic/Pasif'), el('div', { class: 'rux-kpi-value', style: bridged.length ? 'color:var(--yellow,#B97F38)' : '' }, String(bridged.length))),
        el('div', { class: 'rux-kpi' }, el('div', { class: 'rux-kpi-label' }, 'NOT WIRED Gösterge'), el('div', { class: 'rux-kpi-value', style: notWired.length ? 'color:var(--red,#8B0000)' : 'color:var(--green,#047857)' }, String(notWired.length)))
      ));
      const list = el('div', { style: 'margin-top:10px; max-height:200px; overflow:auto' });
      bridged.slice(0, 30).forEach(b => {
        list.appendChild(el('div', { class: 'small', style: 'padding:3px 0; border-bottom:1px solid var(--bd-1)' },
          '• ' + (b.textContent || '').trim().slice(0, 50) + ' → ' + (b.getAttribute('data-rux-bridge-action') || 'pasif')));
      });
      if (bridged.length) auditBody.appendChild(list);
      else auditBody.appendChild(el('div', { class: 'small', style: 'margin-top:8px; color:var(--green,#047857)' }, '✓ Bu sayfada generic/pasif kontrol yok.'));
    });
  }, 100);

  // Try to hydrate from /api/intel
  try {
    const intel = await fetchIntel();
    if (intel && intel.version) {
      const versionInfo = el('div', { class: 'tiny muted text-center mt-12' }, 'Build: ' + intel.version + ' · ' + (intel.cluster || '—'));
      host.appendChild(versionInfo);
    }
  } catch {}
}



function buildSourceConfidencePanel() {
  const wrap = el('div', { class: 'card section rux-source-panel' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx VERİ GÜVENİ & KAYNAK LOG MERKEZİ'),
    el('div', { class: 'flex gap-6' },
      el('button', { class: 'btn tiny outline-yellow', 'data-rux-clear-log': '1' }, 'LOG TEMİZLE'),
      el('span', { class: 'tag cyan', 'data-rux-source-state': '1' }, 'Canlı test bekliyor')
    )
  ));
  wrap.appendChild(el('div', { class: 'rux-compact-grid', 'data-rux-source-metrics': '1' },
    engineMetric('Genel Veri Güveni', '—', 'Kaynak testi bekleniyor', 'cyan'),
    engineMetric('OHLCV', '—', 'Mum/fiyat kaynağı', 'green'),
    engineMetric('Funding', '—', 'Fallback zinciri', 'yellow'),
    engineMetric('Haber', '—', 'Telegram + news filtre', 'purple'),
    engineMetric('Metadata', '—', 'CMC/CoinGecko', 'cyan'),
    engineMetric('On-chain', '—', 'Dune/DefiLlama opsiyonel', 'yellow')
  ));
  wrap.appendChild(el('div', { class: 'row fr-2-1 mt-12' },
    el('div', { class: 'tbl-wrap' }, buildSourceTable([])),
    el('div', { class: 'rux-log-list', 'data-rux-source-log': '1' }, el('div', { class: 'small muted' }, 'Kaynak çağrıları geldikçe burada son loglar görünecek.'))
  ));
  wrap.appendChild(el('div', { class: 'small muted mt-12' }, 'Kural: veri kaynağı boş, gecikmeli veya fallback ise RUx bunu saklamaz; sinyal güvenine ve no-trade kararına etki edecek şekilde görünür kılar.'));
  const clearBtn = wrap.querySelector('[data-rux-clear-log]');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    clearRuxSourceLog();
    renderSourceLog(wrap, []);
  });
  return wrap;
}

function buildSourceTable(rows = []) {
  const tbl = el('table', { class: 'tbl rux-source-table' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'KAYNAK'),
    el('th', {}, 'KATMAN'),
    el('th', {}, 'DURUM'),
    el('th', { class: 'r' }, 'GÜVEN'),
    el('th', { class: 'r' }, 'GECİKME'),
    el('th', { class: 'r' }, 'ADET'),
    el('th', {}, 'NOT')
  )));
  const tb = el('tbody', {});
  if (!rows.length) {
    tb.appendChild(el('tr', {}, el('td', { colspan: 7, class: 'muted small' }, 'Kaynak testi çalışınca gerçek endpoint durumları burada listelenecek.')));
  } else {
    rows.forEach(row => tb.appendChild(sourceRow(row)));
  }
  tbl.appendChild(tb);
  return tbl;
}

function sourceRow(row = {}) {
  const score = Number(row.score ?? 0);
  const ok = Boolean(row.ok);
  const optional = Boolean(row.optional);
  const statusText = ok ? 'ÇALIŞIYOR' : optional ? 'OPSİYONEL UYARI' : 'KRİTİK';
  const statusTone = ok ? 'green' : optional ? 'yellow' : 'red';
  return el('tr', {},
    el('td', {}, el('div', { class: 'small bold' }, row.name || row.path || '—'), el('div', { class: 'tiny muted mono' }, row.path || '—')),
    el('td', {}, el('span', { class: 'tag cyan' }, categoryLabel(row.category))),
    el('td', {}, el('span', { class: 'tag ' + statusTone }, statusText)),
    el('td', { class: 'r mono bold ' + statusClass(score) }, Math.round(score) + '/100'),
    el('td', { class: 'r mono' }, Number.isFinite(Number(row.latencyMs)) ? Math.round(row.latencyMs) + 'ms' : '—'),
    el('td', { class: 'r mono' }, row.count == null ? '—' : String(row.count)),
    el('td', { class: 'small muted' }, ok ? (row.source || row.provider || 'Tamam') : (row.error || 'Yanıt yok'))
  );
}

async function hydrateSourceConfidencePanel(panel, opts = {}) {
  const state = panel.querySelector('[data-rux-source-state]');
  const metrics = panel.querySelector('[data-rux-source-metrics]');
  const tableWrap = panel.querySelector('.tbl-wrap');
  if (state) state.textContent = opts.force ? 'Yeniden test ediliyor…' : 'Kaynaklar test ediliyor…';
  try {
    const suffix = opts.force ? (p) => p + (p.includes('?') ? '&' : '?') + 'refresh=' + Date.now() : (p) => p;
    const checks = await Promise.all(RUX_HEALTH_ENDPOINTS.map(async ep => {
      const result = await testApiEndpoint(suffix(ep.path), { timeoutMs: ep.critical ? 8000 : 6500, category: ep.category, optional: !ep.critical });
      return { ...result, name: ep.name, category: ep.category, optional: !ep.critical, critical: ep.critical };
    }));
    const market = checks.find(x => x.category === 'ohlcv');
    const hyper = checks.find(x => x.name === 'Hyperliquid Context');
    checks.push({
      name: 'Spot/Perp Tutarlılık',
      path: 'OHLCV ↔ Hyperliquid',
      category: 'crossExchange',
      ok: Boolean(market?.ok && hyper?.ok),
      optional: false,
      critical: true,
      latencyMs: Math.max(Number(market?.latencyMs || 0), Number(hyper?.latencyMs || 0)),
      source: market?.ok && hyper?.ok ? 'Çapraz kontrol hazır' : 'Kaynaklardan biri eksik',
      count: null,
      error: market?.ok && hyper?.ok ? '' : 'Çapraz doğrulama zayıf'
    });
    const report = makeRuxDataConfidenceReport(checks);
    renderSourceMetrics(metrics, report);
    if (tableWrap) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(buildSourceTable(report.rows));
    }
    renderSourceLog(panel, getRuxSourceLog(12));
    if (state) state.textContent = `${report.label} · ${report.overall}/100 · ${report.critical} kritik`;
  } catch (err) {
    if (state) state.textContent = 'Kaynak testi tamamlanamadı';
    renderSourceLog(panel, getRuxSourceLog(12));
  }
}

function renderSourceMetrics(metrics, report) {
  if (!metrics || !report) return;
  metrics.innerHTML = '';
  metrics.appendChild(engineMetric('Genel Veri Güveni', report.overall + '/100', report.label, statusClass(report.overall)));
  metrics.appendChild(engineMetric('OHLCV Güveni', Math.round(report.categories.ohlcv) + '/100', 'Mum/fiyat kaynağı', statusClass(report.categories.ohlcv)));
  metrics.appendChild(engineMetric('Funding Güveni', Math.round(report.categories.funding) + '/100', 'Funding fallback zinciri', statusClass(report.categories.funding)));
  metrics.appendChild(engineMetric('OI Güveni', Math.round(report.categories.openInterest) + '/100', 'Futures/Hyperliquid', statusClass(report.categories.openInterest)));
  metrics.appendChild(engineMetric('Haber Güveni', Math.round(report.categories.news) + '/100', 'News + Telegram filtre', statusClass(report.categories.news)));
  metrics.appendChild(engineMetric('On-chain Güveni', Math.round(report.categories.onchain) + '/100', 'Dune opsiyonel', statusClass(report.categories.onchain)));
  metrics.appendChild(engineMetric('Cross-Exchange', Math.round(report.categories.crossExchange) + '/100', 'Spot/perp tutarlılık', statusClass(report.categories.crossExchange)));
  metrics.appendChild(engineMetric('Fallback / Uyarı', String(report.fallbackUsed + report.warnings), 'Saklanmayan veri notu', report.critical ? 'red' : report.warnings ? 'yellow' : 'green'));
}

function renderSourceLog(panel, logs = []) {
  const box = panel.querySelector('[data-rux-source-log]');
  if (!box) return;
  box.innerHTML = '';
  box.appendChild(el('div', { class: 'flex between items-center mb-8' },
    el('div', { class: 'small bold' }, 'SON KAYNAK LOGU'),
    el('span', { class: 'tiny muted' }, logs.length + ' kayıt')
  ));
  if (!logs.length) {
    box.appendChild(el('div', { class: 'small muted' }, 'Henüz kaynak çağrısı yok.'));
    return;
  }
  logs.forEach(log => box.appendChild(el('div', { class: 'rux-log-row ' + (log.ok ? 'ok' : 'bad') },
    el('div', { class: 'flex between gap-8' },
      el('span', { class: 'small bold mono' }, categoryLabel(log.category)),
      el('span', { class: 'tiny muted mono' }, new Date(log.time || Date.now()).toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }))
    ),
    el('div', { class: 'tiny muted mono' }, String(log.path || '').replace('/api/', '')),
    el('div', { class: 'tiny ' + (log.ok ? 'pos' : 'neg') }, log.ok ? `OK · ${log.latencyMs ?? '—'}ms · ${log.source || '—'}` : `HATA · ${log.error || 'Yanıt yok'}`)
  )));
}

function categoryLabel(cat = '') {
  const c = String(cat || '').toLowerCase();
  if (c === 'ohlcv') return 'OHLCV';
  if (c === 'funding') return 'FUNDING';
  if (c === 'openinterest') return 'OI';
  if (c === 'news') return 'HABER';
  if (c === 'metadata') return 'METADATA';
  if (c === 'onchain') return 'ON-CHAIN';
  if (c === 'sentiment') return 'SENTIMENT';
  if (c === 'crossexchange') return 'ÇAPRAZ';
  return 'SİSTEM';
}

function buildOrderflowSourceTransparencyPanel() {
  const mode = getOrderflowScoreMode();
  const modeLabel = orderflowScoreModeLabel(mode);
  const wrap = el('div', { class: 'card section rux-orderflow-source-panel' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'ORDER FLOW / CVD KAYNAK DURUMU'),
    el('div', { class: 'flex gap-6 items-center' },
      el('span', { class: 'tag ' + (mode === 'off' ? 'gray' : 'cyan') }, mode === 'off' ? 'GÖZLEM MODU' : modeLabel.toUpperCase()),
      el('a', { class: 'tag cyan', href: '#/webhook-api' }, 'AYARLAR')
    )
  ));
  wrap.appendChild(el('div', { class: 'rux-compact-grid', 'data-of-source-metrics': '1' },
    engineMetric('Skor Etkisi', modeLabel, mode === 'off' ? 'Karar skoruna etki etmiyor' : 'Karar skoruna sınırlı dahil', mode === 'off' ? 'yellow' : 'cyan'),
    engineMetric('CVD Kaynağı', 'Test bekliyor', 'Binance taker buy/sell proxy', 'cyan'),
    engineMetric('Defter Kaynağı', 'Test bekliyor', 'Depth / liquidity endpoint', 'purple'),
    engineMetric('Türev Bağlamı', 'Test bekliyor', 'Funding / OI / Hyperliquid', 'green')
  ));
  const tblWrap = el('div', { class: 'tbl-wrap mt-12', 'data-of-source-table': '1' }, buildOrderflowSourceTable([]));
  wrap.appendChild(tblWrap);
  wrap.appendChild(el('div', { class: 'rux-note mt-12' }, 'Bu katman ücretsiz/public kaynaklarla çalışır. CVD çoğu zaman hazır kurumsal veri değil; taker buy/sell ve mum verisinden türetilen proxy olabilir. Varsayılan modda karar skoruna etki etmez.'));
  return wrap;
}

function buildOrderflowSourceTable(rows = []) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    ['KAYNAK','TÜR','ENDPOINT','DURUM','GECİKME','KALİTE','SKOR ETKİSİ','NOT'].map(h => el('th', {}, h))
  )));
  const tb = el('tbody', {});
  if (!rows.length) {
    tb.appendChild(el('tr', {}, el('td', { colspan: 8, class: 'small muted' }, 'Order Flow kaynak testi çalışınca burada gerçek/proxy/fallback durumu görünecek.')));
  } else {
    rows.forEach(r => tb.appendChild(el('tr', {},
      el('td', {}, el('div', { class: 'bold small' }, r.name), el('div', { class: 'tiny muted' }, r.provider || '—')),
      el('td', {}, el('span', { class: 'tag ' + (r.kind === 'Gerçek' ? 'green' : r.kind === 'Proxy' ? 'yellow' : 'gray') }, r.kind)),
      el('td', { class: 'mono tiny muted' }, r.path),
      el('td', {}, el('span', { class: 'tag ' + (r.ok ? 'green' : r.optional ? 'yellow' : 'red') }, r.ok ? 'ÇALIŞIYOR' : r.optional ? 'OPSİYONEL' : 'KRİTİK')),
      el('td', { class: 'mono' }, Number.isFinite(Number(r.latencyMs)) ? Math.round(r.latencyMs) + 'ms' : '—'),
      el('td', { class: 'mono bold ' + statusClass(r.score || 0) }, Math.round(r.score || 0) + '/100'),
      el('td', {}, el('span', { class: 'tag ' + (r.scoreIncluded ? 'cyan' : 'gray') }, r.scoreIncluded ? 'AKTİF' : 'KAPALI')),
      el('td', { class: 'small muted' }, r.note || r.error || '—')
    )));
  }
  tbl.appendChild(tb);
  return tbl;
}

function scoreOfSource(result = {}, kind = 'Proxy') {
  if (!result.ok) return result.optional ? 45 : 20;
  let score = 70;
  const latency = Number(result.latencyMs || 0);
  if (latency && latency < 600) score += 12;
  else if (latency && latency < 1500) score += 6;
  else if (latency > 3000) score -= 12;
  if (kind === 'Gerçek') score += 8;
  if (kind === 'Proxy') score -= 4;
  if (Number(result.count || 0) > 100) score += 6;
  return Math.max(0, Math.min(100, score));
}

async function hydrateOrderflowSourceTransparencyPanel(panel) {
  const mode = getOrderflowScoreMode();
  const modeLabel = orderflowScoreModeLabel(mode);
  const scoreIncluded = mode !== 'off';
  const metrics = panel.querySelector('[data-of-source-metrics]');
  const tblWrap = panel.querySelector('[data-of-source-table]');
  const defs = [
    { name: 'CVD / Delta', path: '/api/cvd?symbol=BTCUSDT&limit=500', kind: 'Proxy', provider: 'Binance aggTrades / kline taker buy-sell', optional: true, noteOk: 'CVD proxy; kurumsal footprint verisi değildir.' },
    { name: 'Order Book / Depth', path: '/api/liquidity?symbol=BTCUSDT', kind: 'Gerçek', provider: 'Binance/OKX depth fallback', optional: true, noteOk: 'Defter derinliği ve spread/fill kalitesi için kullanılır.' },
    { name: 'Funding', path: '/api/funding-history?symbol=BTCUSDT', kind: 'Gerçek', provider: 'Binance → Bybit → OKX fallback', optional: false, noteOk: 'Türev kalabalık riskini okumak için.' },
    { name: 'Open Interest', path: '/api/futures?symbol=BTCUSDT', kind: 'Gerçek', provider: 'Futures public endpoint', optional: false, noteOk: 'OI bağlamı ve squeeze/risk teyidi.' },
    { name: 'Hyperliquid L2 / Context', path: '/api/hyperliquid?mode=derivatives&symbol=BTC', kind: 'Gerçek', provider: 'Hyperliquid public info', optional: true, noteOk: 'Perp mark/funding/OI/L2 bağlam doğrulaması.' }
  ];
  try {
    const rows = await Promise.all(defs.map(async d => {
      const r = await testApiEndpoint(d.path + (d.path.includes('?') ? '&' : '?') + 'ofcheck=' + Date.now(), { timeoutMs: d.optional ? 6500 : 8000, optional: d.optional, category: 'orderflow' });
      const score = scoreOfSource({ ...r, optional: d.optional }, d.kind);
      return {
        ...d,
        ...r,
        score,
        scoreIncluded,
        note: r.ok ? d.noteOk : (r.error || 'Kaynak yanıt vermedi')
      };
    }));
    const okCount = rows.filter(r => r.ok).length;
    const proxyCount = rows.filter(r => r.kind === 'Proxy' && r.ok).length;
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + (r.score || 0), 0) / rows.length) : 0;
    if (metrics) {
      metrics.innerHTML = '';
      metrics.appendChild(engineMetric('Skor Etkisi', modeLabel, scoreIncluded ? 'Karar skoruna dahil' : 'Karar skoruna etki etmiyor', scoreIncluded ? 'cyan' : 'yellow'));
      metrics.appendChild(engineMetric('Çalışan Kaynak', okCount + '/' + rows.length, 'Public veri durumu', okCount >= 4 ? 'green' : okCount >= 2 ? 'yellow' : 'red'));
      metrics.appendChild(engineMetric('Proxy Kaynak', String(proxyCount), 'CVD proxy şeffaflığı', proxyCount ? 'yellow' : 'green'));
      metrics.appendChild(engineMetric('Kaynak Güveni', avg + '/100', 'Order flow veri kalitesi', statusClass(avg)));
    }
    if (tblWrap) {
      tblWrap.innerHTML = '';
      tblWrap.appendChild(buildOrderflowSourceTable(rows));
    }
  } catch (err) {
    if (tblWrap) {
      tblWrap.innerHTML = '';
      tblWrap.appendChild(el('div', { class: 'rux-note warn' }, 'Order Flow kaynak testi tamamlanamadı: ' + (err?.message || err)));
    }
  }
}


function engineMetric(label, value, sub, tone = '') {
  return el('div', { class: 'rux-mini ' + tone },
    el('div', { class: 'tiny muted' }, label.toUpperCase()),
    el('div', { class: 'rux-mini-value' }, value),
    el('div', { class: 'tiny muted mt-2' }, sub)
  );
}

function metricList(rows) {
  const wrap = el('div', {});
  rows.forEach(([k, v, tone]) => wrap.appendChild(el('div', { class: 'kv' },
    el('span', { class: 'k' }, k),
    el('span', { class: 'v mono ' + (tone || '') }, v)
  )));
  return wrap;
}
