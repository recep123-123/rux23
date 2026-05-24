/* RUx — Global Live Controls: input, timeframe, favorites */
import { State, fetchMarket, fmtPrice, fmtPct, el, toast, coinShort, coinName } from './api.js?v=0.75.14-heatmap-micro-polish-20260524';
import { ICN } from './components.js?v=0.75.14-heatmap-micro-polish-20260524';

const STORAGE = Object.freeze({
  symbol: 'rux.global.symbol.v1',
  timeframe: 'rux.global.timeframe.v1',
  favorites: 'rux.global.favorites.v1',
  lastPicker: 'rux.global.lastPicker.v1'
});

export const RUX_TIMEFRAMES = Object.freeze([
  { value: '5m', label: '5 dk' },
  { value: '15m', label: '15 dk' },
  { value: '1h', label: '1 saat' },
  { value: '4h', label: '4 saat' },
  { value: '1d', label: '1 gün' },
  { value: '1w', label: '1 hafta' }
]);

export const RUX_DEFAULT_SYMBOLS = Object.freeze([
  'BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','LINKUSDT','AVAXUSDT','DOGEUSDT','ADAUSDT','DOTUSDT','NEARUSDT','APTUSDT','SUIUSDT','ARBUSDT','OPUSDT','AAVEUSDT','UNIUSDT','INJUSDT','TIAUSDT','PEPEUSDT'
]);

function readJson(key, fallback){
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function writeJson(key, value){
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  return value;
}
function normalizeSymbol(raw){
  const cleaned = String(raw || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return State.symbol || 'BTCUSDT';
  if (cleaned.endsWith('USDT') || cleaned.endsWith('USDC') || cleaned.endsWith('USD') || cleaned.endsWith('TRY')) return cleaned;
  return cleaned + 'USDT';
}
function normalizeTf(raw){
  const v = String(raw || State.tf || '4h');
  return RUX_TIMEFRAMES.some(t => t.value === v) ? v : '4h';
}
export function getRuxFavorites(){
  const stored = readJson(STORAGE.favorites, ['BTCUSDT','ETHUSDT','SOLUSDT']);
  return Array.from(new Set((Array.isArray(stored) ? stored : []).map(normalizeSymbol))).slice(0, 60);
}
function setRuxFavorites(list){
  const next = Array.from(new Set((Array.isArray(list) ? list : []).map(normalizeSymbol))).slice(0, 60);
  writeJson(STORAGE.favorites, next);
  State.starred = new Set(next);
  window.dispatchEvent(new CustomEvent('rux:favorites-changed', { detail: { favorites: next } }));
  return next;
}
function isFavorite(symbol){ return getRuxFavorites().includes(normalizeSymbol(symbol)); }
function symbolUniverse(){
  const stateList = Array.isArray(State.watchlist) ? State.watchlist : [];
  return Array.from(new Set([...getRuxFavorites(), ...stateList, ...RUX_DEFAULT_SYMBOLS].map(normalizeSymbol))).slice(0, 120);
}
function pageId(){ return location.hash.replace(/^#\/?/, '').split('?')[0] || 'kokpit'; }
function getParams(){
  const hash = location.hash || '#/kokpit';
  const qs = hash.includes('?') ? hash.split('?').slice(1).join('?') : '';
  return new URLSearchParams(qs);
}
function navigateWithState({ symbol = State.symbol, tf = State.tf, refresh = true } = {}){
  const page = pageId();
  const qs = getParams();
  qs.set('symbol', normalizeSymbol(symbol));
  qs.set('tf', normalizeTf(tf));
  if (refresh) qs.set('_', String(Date.now()));
  location.hash = '#/' + page + '?' + qs.toString();
}
function currentControls(){
  return document.getElementById('rux-global-controls');
}
function selectedLabel(symbol){ return coinShort(symbol) + '/USDT'; }
function favButtonState(btn, symbol){
  const fav = isFavorite(symbol);
  btn.classList.toggle('active', fav);
  btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
  btn.title = fav ? 'Favorilerden çıkar' : 'Favoriye al';
}
function updateFavoritePanel(panel){
  if (!panel) return;
  const favs = getRuxFavorites();
  panel.innerHTML = '';
  if (!favs.length) {
    panel.appendChild(el('div', { class: 'rux-fav-empty' }, 'Favori coin yok. Yıldız butonuyla ekle.'));
    return;
  }
  favs.forEach(sym => {
    const b = el('button', { class: 'rux-fav-item' + (normalizeSymbol(State.symbol) === sym ? ' active' : '') },
      el('span', { class: 'rux-fav-main' }, selectedLabel(sym)),
      el('span', { class: 'rux-fav-sub' }, coinName(sym))
    );
    b.addEventListener('click', () => setGlobalSymbol(sym));
    panel.appendChild(b);
  });
}
function renderSymbolOptions(select){
  const current = normalizeSymbol(State.symbol);
  const list = symbolUniverse();
  if (!list.includes(current)) list.unshift(current);
  select.innerHTML = '';
  list.forEach(sym => select.appendChild(el('option', { value: sym, selected: sym === current }, selectedLabel(sym))));
}
function applyStorageToState(){
  const params = getParams();
  const sym = normalizeSymbol(params.get('symbol') || localStorage.getItem(STORAGE.symbol) || State.symbol || 'BTCUSDT');
  const tf = normalizeTf(params.get('tf') || localStorage.getItem(STORAGE.timeframe) || State.tf || '4h');
  State.symbol = sym;
  State.tf = tf;
  State.starred = new Set(getRuxFavorites());
}
export function setGlobalSymbol(raw){
  const sym = normalizeSymbol(raw);
  try { localStorage.setItem(STORAGE.symbol, sym); } catch {}
  State.symbol = sym;
  navigateWithState({ symbol: sym, tf: State.tf, refresh: true });
  syncRuxGlobalControls();
  State.emit('symbol', sym);
  toast(`${sym} seçildi. Sayfa canlı veriyle yenileniyor.`, 'info', 'RUx Coin');
}
export function setGlobalTimeframe(raw){
  const tf = normalizeTf(raw);
  try { localStorage.setItem(STORAGE.timeframe, tf); } catch {}
  State.tf = tf;
  navigateWithState({ symbol: State.symbol, tf, refresh: true });
  syncRuxGlobalControls();
  State.emit('tf', tf);
  toast(`Zaman dilimi ${RUX_TIMEFRAMES.find(x => x.value === tf)?.label || tf} olarak seçildi.`, 'info', 'RUx TF');
}
function toggleCurrentFavorite(){
  const sym = normalizeSymbol(State.symbol);
  const favs = getRuxFavorites();
  const next = favs.includes(sym) ? favs.filter(x => x !== sym) : [sym, ...favs];
  setRuxFavorites(next);
  syncRuxGlobalControls();
  toast(favs.includes(sym) ? `${sym} favorilerden çıkarıldı.` : `${sym} favorilere eklendi.`, favs.includes(sym) ? 'warn' : 'info', 'RUx Favori');
}
function closePicker(){
  document.querySelectorAll('.rux-picker-pop.open').forEach(p => p.classList.remove('open'));
}
function buildControls(){
  const root = document.getElementById('rux-global-controls') || document.createElement('div');
  root.id = 'rux-global-controls';
  root.className = 'rux-global-controls';
  root.innerHTML = '';

  const coinInput = el('input', { id: 'ruxSymbolInput', class: 'rux-symbol-input', placeholder: 'Coin yaz', value: '', maxlength: 18, title: 'Örn: BTC veya BTCUSDT' });
  coinInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') setGlobalSymbol(coinInput.value);
  });
  const openBtn = el('button', { class: 'rux-ctl-btn', id: 'ruxCoinApply', title: 'Yazılan coini aç' }, ICN.open(12), 'Aç');
  openBtn.addEventListener('click', () => setGlobalSymbol(coinInput.value || State.symbol));

  const favBtn = el('button', { class: 'rux-ctl-icon', id: 'ruxFavToggle' }, '★');
  favButtonState(favBtn, State.symbol);
  favBtn.addEventListener('click', toggleCurrentFavorite);

  const favWrap = el('div', { class: 'rux-picker-wrap' });
  const favOpen = el('button', { class: 'rux-ctl-btn', id: 'ruxFavOpen', title: 'Favori coinleri göster' }, 'Favoriler', ICN.chev(10));
  const favPanel = el('div', { class: 'rux-picker-pop', id: 'ruxFavPanel' });
  updateFavoritePanel(favPanel);
  favOpen.addEventListener('click', e => { e.stopPropagation(); favPanel.classList.toggle('open'); });
  favWrap.append(favOpen, favPanel);

  const tfWrap = el('div', { class: 'rux-tf-wrap', id: 'ruxTfWrap' });
  RUX_TIMEFRAMES.forEach(tf => {
    const b = el('button', { class: 'rux-tf-btn', 'data-tf': tf.value, title: `Zaman dilimi: ${tf.label}` }, tf.label);
    b.addEventListener('click', () => setGlobalTimeframe(tf.value));
    tfWrap.appendChild(b);
  });

  const liveDot = el('span', { class: 'rux-live-dot', id: 'ruxGlobalLiveDot' });
  const price = el('span', { class: 'rux-live-price mono', id: 'ruxGlobalPrice' }, '—');
  const change = el('span', { class: 'rux-live-change', id: 'ruxGlobalChange' }, '—');
  const live = el('button', { class: 'rux-live-pill', id: 'ruxLiveRefresh', title: 'Seçili coin ve zaman dilimi için canlı veriyi yenile' }, liveDot, price, change);
  live.addEventListener('click', () => {
    navigateWithState({ symbol: State.symbol, tf: State.tf, refresh: true });
    refreshLiveMini(true);
  });

  root.append(
    el('div', { class: 'rux-symbol-box' }, coinInput, openBtn, favBtn, favWrap),
    tfWrap,
    live
  );
  document.addEventListener('click', closePicker);
  favPanel.addEventListener('click', e => e.stopPropagation());
  syncRuxGlobalControls();
  refreshLiveMini(true);
  return root;
}
export function initRuxGlobalControls(){
  applyStorageToState();
  let root = currentControls();
  if (!root) {
    const header = document.querySelector('.om-header');
    const nav = document.getElementById('om-topnav');
    root = buildControls();
    if (header && nav?.nextSibling) header.insertBefore(root, nav.nextSibling);
    else if (header) header.appendChild(root);
  } else {
    buildControls();
  }
  window.addEventListener('rux:favorites-changed', syncRuxGlobalControls);
  State.on('symbol', syncRuxGlobalControls);
  State.on('tf', syncRuxGlobalControls);
}
export function syncRuxGlobalControls(){
  applyStorageToState();
  const root = currentControls();
  if (!root) return;
  const favBtn = root.querySelector('#ruxFavToggle');
  const favPanel = root.querySelector('#ruxFavPanel');
  if (favBtn) favButtonState(favBtn, State.symbol);
  if (favPanel) updateFavoritePanel(favPanel);
  root.querySelectorAll('.rux-tf-btn').forEach(b => b.classList.toggle('active', b.dataset.tf === normalizeTf(State.tf)));
  const input = root.querySelector('#ruxSymbolInput');
  if (input && document.activeElement !== input) input.value = '';
}
async function refreshLiveMini(force = false){
  const root = currentControls();
  if (!root) return;
  const dot = root.querySelector('#ruxGlobalLiveDot');
  const priceEl = root.querySelector('#ruxGlobalPrice');
  const chEl = root.querySelector('#ruxGlobalChange');
  if (dot) dot.className = 'rux-live-dot warn';
  try {
    const data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 160);
    const price = Number(data?.ticker?.price ?? data?.candles?.at?.(-1)?.close);
    const first = Number(data?.candles?.at?.(0)?.close);
    const pct = Number(data?.ticker?.change ?? data?.ticker?.priceChangePercent ?? (first && price ? ((price - first) / first) * 100 : NaN));
    const conf = Number(data?.quality?.confidence ?? 0);
    if (priceEl) priceEl.textContent = Number.isFinite(price) ? '$' + fmtPrice(price) : '—';
    if (chEl) {
      chEl.textContent = Number.isFinite(pct) ? fmtPct(pct) : '—';
      chEl.className = 'rux-live-change ' + (pct >= 0 ? 'pos' : 'neg');
    }
    if (dot) dot.className = 'rux-live-dot ' + (conf >= 70 ? 'ok' : conf >= 50 ? 'warn' : 'bad');
  } catch {
    if (dot) dot.className = 'rux-live-dot bad';
    if (priceEl) priceEl.textContent = 'OFFLINE';
    if (chEl) chEl.textContent = '—';
  }
}
setInterval(() => {
  const root = currentControls();
  if (!root || document.hidden) return;
  refreshLiveMini(false);
}, 10000);
