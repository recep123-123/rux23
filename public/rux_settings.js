/* RUx — Türkçe API / Ayarlar yönetimi
   Not: Bu dosya kullanıcı tarafında localStorage kullanır. Gizli anahtarlar frontend içinde
   kalıcı tutulduğunda tarayıcıya ait sayılır; yüksek güvenlik için Vercel Environment Variables önerilir. */

export const RUX_SETTINGS_STORAGE_KEY = 'rux_terminal_settings_v1';

export const RUX_SETTING_SCHEMA = [
  {
    id: 'cmcApiKey',
    label: 'CoinMarketCap API Key',
    type: 'password',
    placeholder: 'CMC Pro API anahtarı',
    header: 'x-omni-cmc-key',
    category: 'Piyasa Verisi',
    description: 'Top 100, global metrikler ve piyasa değeri sıralaması için kullanılır.',
    sensitive: true
  },
  {
    id: 'coinGeckoApiKey',
    label: 'CoinGecko API Key',
    type: 'password',
    placeholder: 'İsteğe bağlı CoinGecko anahtarı',
    header: 'x-omni-cg-key',
    category: 'Piyasa Verisi',
    description: 'İleride eklenecek alternatif piyasa veri fallback katmanı için ayrıldı.',
    sensitive: true
  },
  {
    id: 'duneApiKey',
    label: 'Dune API Key',
    type: 'password',
    placeholder: 'Dune Read API anahtarı',
    header: 'x-dune-api-key',
    category: 'On-chain / Dune',
    description: 'Dune query sonuçlarını çekmek için kullanılır. Ana hızlı veri kaynağı değil, on-chain istihbarat katmanıdır.',
    sensitive: true
  },
  {
    id: 'duneStablecoinQueryId',
    label: 'Stablecoin Query ID',
    type: 'text',
    placeholder: 'Örn: 1234567',
    category: 'On-chain / Dune',
    description: 'Stablecoin supply, mint/burn veya likidite query ID. Boşsa bu slot pasif kalır.',
    sensitive: false
  },
  {
    id: 'duneExchangeFlowQueryId',
    label: 'Exchange Flow Query ID',
    type: 'text',
    placeholder: 'Örn: 2345678',
    category: 'On-chain / Dune',
    description: 'Borsa giriş/çıkış, netflow veya rezerv query ID. Sinyal motoruna yavaş veri olarak katkı verir.',
    sensitive: false
  },
  {
    id: 'duneWhaleQueryId',
    label: 'Whale / Wallet Query ID',
    type: 'text',
    placeholder: 'Örn: 3456789',
    category: 'On-chain / Dune',
    description: 'Büyük cüzdan, smart money veya sektör bazlı zincir hareketleri için opsiyonel query ID.',
    sensitive: false
  },
  {
    id: 'telegramNewsSource',
    label: 'Telegram Haber Kanalları',
    type: 'textarea',
    placeholder: 'Her satıra bir kanal: tradermap_io veya https://t.me/tradermap_io',
    category: 'Haber',
    description: 'Birden fazla Telegram kanalını satır satır veya virgülle yazabilirsin. LIQUIDATION ALERT, WHALE ALERT ve transfer alarmı tipleri otomatik ayıklanır.',
    sensitive: false
  },
  {
    id: 'dataMode',
    label: 'Veri Modu',
    type: 'select',
    options: [
      ['live', 'Canlı veri öncelikli'],
      ['safe', 'Canlı + güvenli fallback'],
      ['demo', 'Demo/fallback modu']
    ],
    category: 'Genel',
    description: 'API boş dönerse terminalin nasıl davranacağını belirler.',
    sensitive: false
  },
  {
    id: 'preferredExchange',
    label: 'Öncelikli Borsa',
    type: 'select',
    options: [
      ['binance', 'Binance'],
      ['bybit', 'Bybit'],
      ['okx', 'OKX'],
      ['hyperliquid', 'Hyperliquid']
    ],
    category: 'Genel',
    description: 'Piyasa verisi kaynak önceliği. Bazı endpointler henüz Binance ağırlıklıdır.',
    sensitive: false
  },
  {
    id: 'refreshSeconds',
    label: 'Yenileme Aralığı',
    type: 'number',
    min: 3,
    max: 120,
    category: 'Genel',
    description: 'Canlı ekranlarda veri yenileme frekansı. Çok düşük değer API limitlerine takılabilir.',
    sensitive: false
  },
  {
    id: 'defaultRiskPct',
    label: 'Varsayılan Manuel Risk %',
    type: 'number',
    min: 0.05,
    max: 2,
    step: 0.05,
    category: 'Risk',
    description: 'Manuel işlem planı hesaplarında başlangıç risk referansı.',
    sensitive: false
  },
  {
    id: 'strictNoTrade',
    label: 'Katı İşlem Engeli',
    type: 'boolean',
    category: 'Risk',
    description: 'Açık olduğunda No-Trade soft warning etkisi daha güçlü değerlendirilir.',
    sensitive: false
  },
  {
    id: 'orderflowScoreMode',
    label: 'Order Flow Skor Etkisi',
    type: 'select',
    options: [
      ['off', 'Kapalı — gözlem modu'],
      ['low', 'Düşük etki'],
      ['normal', 'Normal etki']
    ],
    category: 'Veri / Order Flow',
    description: 'CVD, Delta, Order Book ve likidite katmanının karar skoruna etkisini belirler. Varsayılan Kapalıdır; veri kalitesi kanıtlanmadan skora bağlanmaz.',
    sensitive: false
  }
];

export const RUX_DEFAULT_SETTINGS = {
  cmcApiKey: '',
  coinGeckoApiKey: '',
  duneApiKey: '',
  duneStablecoinQueryId: '',
  duneExchangeFlowQueryId: '',
  duneWhaleQueryId: '',
  telegramNewsSource: '',
  dataMode: 'safe',
  preferredExchange: 'binance',
  refreshSeconds: 15,
  defaultRiskPct: 0.5,
  strictNoTrade: true,
  orderflowScoreMode: 'off',
  lastSavedAt: null
};

function hasStorage(){
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

function normalizeTelegramSources(value){
  const seen = new Set();
  return String(value || '')
    .split(/[\n,;]+/)
    .map(x => String(x || '').trim())
    .filter(Boolean)
    .map(x => x.replace(/^@/, ''))
    .filter(x => {
      const key = x.toLowerCase();
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .join('\n');
}

export function getTelegramSourceList(settings = getRuxSettings()){
  return normalizeTelegramSources(settings.telegramNewsSource)
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function cleanSettings(raw = {}){
  const out = { ...RUX_DEFAULT_SETTINGS, ...(raw || {}) };
  out.cmcApiKey = String(out.cmcApiKey || '').trim();
  out.coinGeckoApiKey = String(out.coinGeckoApiKey || '').trim();
  out.duneApiKey = String(out.duneApiKey || '').trim();
  out.duneStablecoinQueryId = String(out.duneStablecoinQueryId || '').replace(/[^0-9]/g, '').slice(0, 24);
  out.duneExchangeFlowQueryId = String(out.duneExchangeFlowQueryId || '').replace(/[^0-9]/g, '').slice(0, 24);
  out.duneWhaleQueryId = String(out.duneWhaleQueryId || '').replace(/[^0-9]/g, '').slice(0, 24);
  out.telegramNewsSource = normalizeTelegramSources(out.telegramNewsSource);
  out.dataMode = ['live','safe','demo'].includes(out.dataMode) ? out.dataMode : 'safe';
  out.preferredExchange = ['binance','bybit','okx','hyperliquid'].includes(out.preferredExchange) ? out.preferredExchange : 'binance';
  out.refreshSeconds = Math.max(3, Math.min(120, Number(out.refreshSeconds) || 15));
  out.defaultRiskPct = Math.max(0.05, Math.min(2, Number(out.defaultRiskPct) || 0.5));
  out.strictNoTrade = !!out.strictNoTrade;
  out.orderflowScoreMode = ['off','low','normal'].includes(out.orderflowScoreMode) ? out.orderflowScoreMode : 'off';
  return out;
}

export function getRuxSettings(){
  if(!hasStorage()) return { ...RUX_DEFAULT_SETTINGS };
  try{
    const raw = window.localStorage.getItem(RUX_SETTINGS_STORAGE_KEY);
    if(!raw) return { ...RUX_DEFAULT_SETTINGS };
    return cleanSettings(JSON.parse(raw));
  }catch{ return { ...RUX_DEFAULT_SETTINGS }; }
}

export function saveRuxSettings(next){
  const clean = cleanSettings({ ...getRuxSettings(), ...(next || {}), lastSavedAt: new Date().toISOString() });
  if(hasStorage()) window.localStorage.setItem(RUX_SETTINGS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function updateRuxSetting(key, value){
  return saveRuxSettings({ [key]: value });
}

export function resetRuxSettings(){
  const clean = { ...RUX_DEFAULT_SETTINGS, lastSavedAt: new Date().toISOString() };
  if(hasStorage()) window.localStorage.setItem(RUX_SETTINGS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

export function clearSensitiveRuxSettings(){
  return saveRuxSettings({ cmcApiKey: '', coinGeckoApiKey: '', duneApiKey: '' });
}

export function buildRuxApiHeaders(extra = {}){
  const s = getRuxSettings();
  const headers = { ...(extra || {}) };
  if(s.cmcApiKey){
    headers['x-omni-cmc-key'] = s.cmcApiKey;
    headers['x-cmc-api-key'] = s.cmcApiKey;
  }
  if(s.coinGeckoApiKey) headers['x-omni-cg-key'] = s.coinGeckoApiKey;
  if(s.duneApiKey){
    headers['x-dune-api-key'] = s.duneApiKey;
    headers['x-omni-dune-key'] = s.duneApiKey;
  }
  if(s.duneStablecoinQueryId) headers['x-rux-dune-stablecoin-query-id'] = s.duneStablecoinQueryId;
  if(s.duneExchangeFlowQueryId) headers['x-rux-dune-exchange-flow-query-id'] = s.duneExchangeFlowQueryId;
  if(s.duneWhaleQueryId) headers['x-rux-dune-whale-query-id'] = s.duneWhaleQueryId;
  if(s.telegramNewsSource) headers['x-rux-telegram-source'] = s.telegramNewsSource;
  headers['x-rux-data-mode'] = s.dataMode;
  headers['x-rux-preferred-exchange'] = s.preferredExchange;
  return headers;
}

export function maskSecret(v){
  const s = String(v || '').trim();
  if(!s) return 'Tanımlı değil';
  if(s.length <= 8) return '••••' + s.slice(-2);
  return s.slice(0, 4) + '••••••••' + s.slice(-4);
}

export function settingsCompletionScore(settings = getRuxSettings()){
  let score = 55;
  if(settings.dataMode === 'safe') score += 10;
  if(settings.preferredExchange) score += 8;
  if(settings.refreshSeconds >= 5 && settings.refreshSeconds <= 30) score += 8;
  if(settings.defaultRiskPct > 0 && settings.defaultRiskPct <= 1) score += 8;
  if(settings.strictNoTrade) score += 6;
  if(['off','low','normal'].includes(settings.orderflowScoreMode)) score += 3;
  if(settings.cmcApiKey) score += 5;
  if(settings.duneApiKey && (settings.duneStablecoinQueryId || settings.duneExchangeFlowQueryId || settings.duneWhaleQueryId)) score += 8;
  if(settings.telegramNewsSource) score += 4;
  return Math.max(0, Math.min(100, Math.round(score)));
}


export function getOrderflowScoreMode(settings = getRuxSettings()){
  const mode = String(settings?.orderflowScoreMode || 'off');
  return ['off','low','normal'].includes(mode) ? mode : 'off';
}

export function orderflowScoreModeLabel(mode = getOrderflowScoreMode()){
  if(mode === 'normal') return 'Normal etki';
  if(mode === 'low') return 'Düşük etki';
  return 'Gözlem modu / Skora kapalı';
}

export function orderflowScoreImpactWeight(mode = getOrderflowScoreMode()){
  if(mode === 'normal') return 0.18;
  if(mode === 'low') return 0.07;
  return 0;
}

export function exportSafeRuxSettings(settings = getRuxSettings()){
  const clone = { ...settings };
  clone.cmcApiKey = settings.cmcApiKey ? '[MASKED]' : '';
  clone.coinGeckoApiKey = settings.coinGeckoApiKey ? '[MASKED]' : '';
  clone.duneApiKey = settings.duneApiKey ? '[MASKED]' : '';
  return clone;
}
