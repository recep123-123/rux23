/* RUx — API & Ayarlar ekranı */
import { el, testApiEndpoint, toast } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, tag } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import {
  RUX_SETTING_SCHEMA,
  getRuxSettings,
  saveRuxSettings,
  clearSensitiveRuxSettings,
  maskSecret,
  settingsCompletionScore,
  exportSafeRuxSettings,
  getTelegramSourceList
} from './rux_settings.js?v=0.75.10-heatmap-fidelity-pass-20260524';

const SERVICE_TESTS = [
  { name: 'Market Data', category: 'Piyasa', path: '/api/market?symbol=BTCUSDT&tf=4h&limit=80', required: true },
  { name: 'CoinMarketCap', category: 'Piyasa', path: '/api/cmc?limit=20', required: false, key: 'cmcApiKey' },
  { name: 'Funding', category: 'Türev', path: '/api/funding-history?symbol=BTCUSDT', required: false },
  { name: 'Open Interest', category: 'Türev', path: '/api/futures?symbol=BTCUSDT', required: false },
  { name: 'Liquidity', category: 'Akış', path: '/api/liquidity?symbol=BTCUSDT', required: false },
  { name: 'News Pulse', category: 'Haber', path: '/api/news-pulse?symbol=BTCUSDT&lang=tr&limit=10', required: false },
  { name: 'Telegram News Filter', category: 'Haber', path: '/api/news-pulse?symbol=BTCUSDT&lang=tr&mode=global&limit=10', required: false, key: 'telegramNewsSource' },
  { name: 'Fear & Greed', category: 'Sentiment', path: '/api/feargreed', required: false },
  { name: 'Hyperliquid Context', category: 'Türev', path: '/api/hyperliquid?mode=derivatives&symbol=BTCUSDT', required: false },
  { name: 'Dune Stablecoin', category: 'On-chain', path: '/api/hyperliquid?mode=dune&slot=stablecoin&limit=25', required: false, key: 'duneApiKey' },
  { name: 'Dune Exchange Flow', category: 'On-chain', path: '/api/hyperliquid?mode=dune&slot=exchange_flow&limit=25', required: false, key: 'duneApiKey' },
  { name: 'Intel', category: 'Sistem', path: '/api/intel', required: true },
];

export async function renderWebhookApi(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'API & AYARLAR',
    subtitle: 'Kullanıcı tarafından girilecek API anahtarları, veri modu, risk tercihleri ve kaynak sağlık testi.',
    actions: [
      el('button', { class: 'btn outline', id: 'btnExportSettings' }, ICN.download(12), 'AYAR ÖZETİ'),
      el('button', { class: 'btn primary', id: 'btnTestSources' }, ICN.refresh(12), 'KAYNAKLARI TEST ET')
    ]
  }));

  const settings = getRuxSettings();
  const score = settingsCompletionScore(settings);
  const statRow = el('div', { class: 'stat-row cols-6 section' });
  statRow.appendChild(statCard({ icon: ICN.gear(18), iconColor: 'cyan', label: 'AYAR TAMLIĞI', value: score + '/100', sub: score >= 80 ? 'Sağlam' : 'Eksik var', subColor: score >= 80 ? 'pos' : 'warn' }));
  statRow.appendChild(statCard({ icon: ICN.globe(18), iconColor: 'blue', label: 'VERİ MODU', value: dataModeLabel(settings.dataMode), sub: 'Kaynak davranışı', subColor: 'pos' }));
  statRow.appendChild(statCard({ icon: ICN.exchange(18), iconColor: 'purple', label: 'ÖNCELİKLİ BORSA', value: String(settings.preferredExchange || 'binance').toUpperCase(), sub: 'Veri önceliği', subColor: 'muted' }));
  statRow.appendChild(statCard({ icon: ICN.refresh(18), iconColor: 'green', label: 'YENİLEME', value: settings.refreshSeconds + ' sn', sub: 'UI frekansı', subColor: 'pos' }));
  statRow.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'yellow', label: 'NO-TRADE', value: settings.strictNoTrade ? 'KATI' : 'NORMAL', sub: 'Risk filtresi', subColor: settings.strictNoTrade ? 'pos' : 'warn' }));
  statRow.appendChild(statCard({ icon: ICN.key ? ICN.key(18) : ICN.shieldcheck(18), iconColor: settings.duneApiKey ? 'green' : 'yellow', label: 'DUNE KEY', value: settings.duneApiKey ? 'TANIMLI' : 'YOK', sub: duneSlotSummary(settings), subColor: settings.duneApiKey ? 'pos' : 'warn' }));
  host.appendChild(statRow);

  const main = el('div', { class: 'row fr-2-2-1 section' });
  main.appendChild(buildSettingsForm(settings));
  main.appendChild(buildHealthPanel());
  main.appendChild(buildSecurityNotes(settings));
  host.appendChild(main);
  host.appendChild(buildIntelligenceLayer(settings));

  host.appendChild(buildSourceTable());

  document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
    const next = collectSettings(host);
    saveRuxSettings(next);
    toast('API ve sistem ayarları kaydedildi.', 'success', 'RUx');
    renderWebhookApi(host);
  });
  document.getElementById('btnClearKeys')?.addEventListener('click', () => {
    clearSensitiveRuxSettings();
    toast('Hassas API anahtarları temizlendi.', 'info', 'RUx');
    renderWebhookApi(host);
  });
  document.getElementById('btnResetRuntime')?.addEventListener('click', () => {
    toast('Runtime cache temizleme sinyali gönderildi. Yeni sayfa yüklemesinde önbellek tazelenecek.', 'info', 'RUx');
  });
  document.getElementById('btnExportSettings')?.addEventListener('click', async () => {
    const summary = JSON.stringify(exportSafeRuxSettings(), null, 2);
    try { await navigator.clipboard.writeText(summary); toast('Maskelenmiş ayar özeti panoya kopyalandı.', 'success', 'RUx'); }
    catch { toast(summary, 'info', 'Ayar Özeti'); }
  });
  document.getElementById('btnTestSources')?.addEventListener('click', () => runHealthChecks(host));
}

function buildSettingsForm(settings){
  const form = el('div', { class: 'rux-settings-form' });
  const groups = [...new Set(RUX_SETTING_SCHEMA.map(x => x.category))];
  groups.forEach(group => {
    form.appendChild(el('div', { class: 'rux-form-group-title' }, group));
    RUX_SETTING_SCHEMA.filter(x => x.category === group).forEach(field => {
      form.appendChild(fieldControl(field, settings[field.id]));
    });
  });
  form.appendChild(el('div', { class: 'flex gap-8 flex-wrap mt-12' },
    el('button', { class: 'btn primary', id: 'btnSaveSettings' }, ICN.check(12), 'AYARLARI KAYDET'),
    el('button', { class: 'btn outline-yellow', id: 'btnClearKeys' }, ICN.trash(12), 'KEYLERİ TEMİZLE'),
    el('button', { class: 'btn outline', id: 'btnResetRuntime' }, ICN.refresh(12), 'CACHE SİNYALİ')
  ));
  return card({ title: 'KULLANICI API / SİSTEM AYARLARI', body: form });
}

function fieldControl(field, value){
  const desc = el('div', { class: 'tiny muted mt-4' }, field.description || '');
  let control;
  if(field.type === 'select'){
    control = el('select', { class: 'om-input', id: 'set_' + field.id });
    (field.options || []).forEach(([v, l]) => control.appendChild(el('option', { value: v, selected: value === v }, l)));
  } else if(field.type === 'boolean') {
    control = el('select', { class: 'om-input', id: 'set_' + field.id },
      el('option', { value: 'true', selected: !!value }, 'Açık'),
      el('option', { value: 'false', selected: !value }, 'Kapalı')
    );
  } else if(field.type === 'textarea') {
    control = el('textarea', {
      class: 'om-input',
      id: 'set_' + field.id,
      value: value ?? '',
      placeholder: field.placeholder || '',
      rows: 4,
      style: 'min-height:86px; resize:vertical; line-height:1.45; white-space:pre-wrap;',
      autocomplete: 'on'
    });
  } else {
    control = el('input', {
      class: 'om-input',
      id: 'set_' + field.id,
      type: field.type || 'text',
      value: value ?? '',
      placeholder: field.placeholder || '',
      min: field.min ?? undefined,
      max: field.max ?? undefined,
      step: field.step ?? undefined,
      autocomplete: field.sensitive ? 'off' : 'on'
    });
  }
  return el('label', { class: 'rux-field' },
    el('div', { class: 'flex between items-center gap-8' },
      el('span', { class: 'small bold' }, field.label),
      field.sensitive ? tag('HASSAS', 'yellow') : null
    ),
    control,
    desc
  );
}

function collectSettings(root){
  const next = {};
  RUX_SETTING_SCHEMA.forEach(field => {
    const node = root.querySelector('#set_' + field.id);
    if(!node) return;
    if(field.type === 'number') next[field.id] = Number(node.value);
    else if(field.type === 'boolean') next[field.id] = node.value === 'true';
    else next[field.id] = node.value;
  });
  return next;
}

function buildHealthPanel(){
  const body = el('div', { id: 'ruxHealthPanel' },
    el('div', { class: 'small muted', style: 'line-height:1.55' }, 'Kaynak testi aynı sayfa içinde çalışır. Kullanıcı API anahtarı varsa istekler header üzerinden backend endpointlerine iletilir; yoksa Vercel environment değişkenleri veya endpoint fallback davranışı kullanılır.'),
    el('div', { class: 'rux-health-summary mt-12' },
      miniStatus('Beklemede', 'Test başlatılmadı', 'yellow'),
      miniStatus('0 ms', 'Ortalama gecikme', 'cyan'),
      miniStatus('—', 'Kritik hata', 'muted')
    )
  );
  return card({ title: 'VERİ KAYNAĞI SAĞLIK TESTİ', body });
}

function buildSecurityNotes(settings){
  const body = el('div', {},
    el('div', { class: 'rux-note warn' }, 'Tarayıcıya girilen API anahtarı localStorage içinde saklanır. En güvenli yöntem hâlâ Vercel Environment Variables kullanmaktır.'),
    el('div', { class: 'rux-note mt-8' }, 'RUx otomatik emir göndermez. API ayarları veri çekme ve ekran doğrulama içindir; pozisyon açma/kapatma yetkisi bağlanmadı.'),
    el('div', { class: 'mt-12' }, metricList([
      ['CMC', maskSecret(settings.cmcApiKey), settings.cmcApiKey ? 'pos' : 'warn'],
      ['CoinGecko', maskSecret(settings.coinGeckoApiKey), settings.coinGeckoApiKey ? 'pos' : 'muted'],
      ['Dune', maskSecret(settings.duneApiKey), settings.duneApiKey ? 'pos' : 'muted'],
      ['Dune slot', duneSlotSummary(settings), hasAnyDuneSlot(settings) ? 'pos' : 'muted'],
      ['Telegram', telegramSummary(settings), settings.telegramNewsSource ? 'pos' : 'muted'],
      ['Son kayıt', settings.lastSavedAt ? new Date(settings.lastSavedAt).toLocaleString('tr-TR') : 'Henüz yok', 'muted']
    ]))
  );
  return card({ title: 'GÜVENLİK / KAPSAM', body });
}

function telegramSummary(settings){
  const list = getTelegramSourceList(settings);
  if(!list.length) return 'Tanımlı değil';
  if(list.length === 1) return list[0];
  return list.length + ' kanal: ' + list.slice(0, 2).join(', ') + (list.length > 2 ? '…' : '');
}

function hasAnyDuneSlot(settings){
  return !!(settings.duneStablecoinQueryId || settings.duneExchangeFlowQueryId || settings.duneWhaleQueryId);
}

function duneSlotSummary(settings){
  const n = ['duneStablecoinQueryId','duneExchangeFlowQueryId','duneWhaleQueryId'].filter(k => settings[k]).length;
  return n ? n + ' slot aktif' : 'Query ID yok';
}

function buildIntelligenceLayer(settings){
  const body = el('div', { class: 'row cols-2' });
  body.appendChild(el('div', { class: 'rux-note' },
    el('div', { class: 'bold pos' }, 'Hyperliquid Türev Katmanı'),
    el('div', { class: 'small muted mt-6', style: 'line-height:1.55' }, 'Funding, open interest, mark price, premium, L2 spread ve venue funding ayrışması için hızlı confirmation kaynağı. Ana grafik verisi değil; sinyal doğrulama motoruna türev bağlamı sağlar.'),
    el('div', { class: 'mt-8' }, metricList([
      ['Durum', 'Public endpoint', 'pos'],
      ['Kullanım', 'Confirmation / crowding', 'cyan'],
      ['Endpoint', '/api/hyperliquid?mode=derivatives', 'muted']
    ]))
  ));
  body.appendChild(el('div', { class: 'rux-note' },
    el('div', { class: 'bold warn' }, 'Dune On-chain İstihbarat'),
    el('div', { class: 'small muted mt-6', style: 'line-height:1.55' }, 'Dune hızlı mum/funding kaynağı değildir. Stablecoin arzı, exchange netflow ve whale/smart wallet query sonuçları için yavaş/orta hızlı bağlam katmanı olarak kullanılır.'),
    el('div', { class: 'mt-8' }, metricList([
      ['API Key', settings.duneApiKey ? 'Tanımlı' : 'Yok', settings.duneApiKey ? 'pos' : 'warn'],
      ['Query slotları', duneSlotSummary(settings), hasAnyDuneSlot(settings) ? 'pos' : 'warn'],
      ['Endpoint', '/api/hyperliquid?mode=dune&slot=stablecoin', 'muted']
    ]))
  ));
  return card({ title: 'VERİ KATMANI SINIFLANDIRMASI', body });
}

function buildSourceTable(){
  const table = el('table', { class: 'tbl', id: 'sourceHealthTable' });
  table.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'KAYNAK'), el('th', {}, 'KATEGORİ'), el('th', {}, 'ENDPOINT'), el('th', {}, 'DURUM'),
    el('th', { class: 'r' }, 'GECİKME'), el('th', { class: 'r' }, 'KAYIT'), el('th', {}, 'AÇIKLAMA')
  )));
  const tb = el('tbody', {});
  SERVICE_TESTS.forEach(s => tb.appendChild(sourceRow(s)));
  table.appendChild(tb);
  return card({ title: 'KAYNAK LİSTESİ', body: el('div', { class: 'tbl-wrap' }, table) });
}

function sourceRow(s, result = null){
  const ok = result?.ok;
  const tested = !!result;
  const tone = !tested ? 'yellow' : ok ? 'green' : (s.required ? 'red' : 'yellow');
  const statusText = !tested ? 'BEKLEMEDE' : ok ? 'ÇALIŞIYOR' : (s.required ? 'KRİTİK' : 'UYARI');
  return el('tr', { 'data-source': s.name },
    el('td', {}, el('span', { class: 'small bold' }, s.name), s.required ? el('span', { class: 'tag red ml-8' }, 'KRİTİK') : null),
    el('td', { class: 'small muted' }, s.category),
    el('td', { class: 'mono tiny muted' }, s.path),
    el('td', {}, el('span', { class: 'flex items-center gap-6' }, el('span', { class: 'live-dot ' + (tone === 'green' ? 'pos' : tone === 'red' ? 'neg' : 'warn') }), el('span', { class: tone === 'green' ? 'pos bold small' : tone === 'red' ? 'neg bold small' : 'warn bold small' }, statusText))),
    el('td', { class: 'r mono' }, tested ? result.latencyMs + 'ms' : '—'),
    el('td', { class: 'r mono small muted' }, tested ? new Date(result.checkedAt).toLocaleTimeString('tr-TR') : '—'),
    el('td', { class: 'small muted' }, tested ? (ok ? ('OK' + (result.count != null ? ' · ' + result.count + ' kayıt' : '')) : result.error) : 'Kaynak testi yapılmadı')
  );
}

async function runHealthChecks(host){
  const panel = host.querySelector('#ruxHealthPanel');
  const tbody = host.querySelector('#sourceHealthTable tbody');
  if(panel) panel.innerHTML = el('div', { class: 'small warn' }, 'Kaynaklar test ediliyor...').outerHTML;
  if(tbody) tbody.innerHTML = '';
  const results = [];
  for(const svc of SERVICE_TESTS){
    const res = await testApiEndpoint(svc.path, { timeoutMs: 7000 });
    results.push({ svc, res });
    if(tbody) tbody.appendChild(sourceRow(svc, res));
  }
  const okCount = results.filter(x => x.res.ok).length;
  const criticalFails = results.filter(x => x.svc.required && !x.res.ok).length;
  const avgLatency = Math.round(results.reduce((a,b) => a + (b.res.latencyMs || 0), 0) / Math.max(1, results.length));
  if(panel){
    panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'rux-health-summary' },
      miniStatus(okCount + '/' + results.length, 'Çalışan kaynak', criticalFails ? 'yellow' : 'green'),
      miniStatus(avgLatency + ' ms', 'Ortalama gecikme', avgLatency > 1000 ? 'yellow' : 'cyan'),
      miniStatus(String(criticalFails), 'Kritik hata', criticalFails ? 'red' : 'green')
    ));
    panel.appendChild(el('div', { class: 'small muted mt-12' }, criticalFails ? 'Kritik kaynak hatası var. Yeni sinyal üretiminde veri güveni düşürülmeli.' : 'Kritik kaynaklar çalışıyor. Opsiyonel kaynak hataları fallback ile yönetilebilir.'));
  }
}

function miniStatus(value, label, tone){
  return el('div', { class: 'rux-health-mini ' + (tone || '') },
    el('div', { class: 'bold mono' }, value),
    el('div', { class: 'tiny muted' }, label)
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

function dataModeLabel(mode){
  return ({ live:'CANLI', safe:'GÜVENLİ', demo:'DEMO' })[mode] || 'GÜVENLİ';
}
