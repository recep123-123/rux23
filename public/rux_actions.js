/* RUx — Local action engine: alerts, widgets, watchlist, notes */
const KEYS = {
  alerts: 'rux.alerts.v1',
  widgets: 'rux.widgets.v1',
  watchlist: 'rux.watchlist.v1',
  notes: 'rux.notes.v1'
};

function uid(prefix='rux') {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('rux:actions-changed', { detail: { key } }));
  } catch {}
  return value;
}
function nowIso() { return new Date().toISOString(); }

export function getAlerts() { return read(KEYS.alerts, []); }
export function saveAlerts(list) { return write(KEYS.alerts, Array.isArray(list) ? list : []); }
export function addAlert(alert = {}) {
  const item = {
    id: alert.id || uid('alert'),
    createdAt: alert.createdAt || nowIso(),
    updatedAt: nowIso(),
    active: alert.active !== false,
    symbol: String(alert.symbol || 'BTCUSDT').toUpperCase(),
    source: alert.source || 'RUx Manuel',
    type: alert.type || 'price',
    side: alert.side || 'WATCH',
    condition: alert.condition || 'price_cross',
    threshold: Number(alert.threshold || alert.price || 0) || 0,
    message: alert.message || 'Manuel takip alarmı',
    priority: alert.priority || 'orta'
  };
  const list = getAlerts().filter(x => x.id !== item.id);
  list.unshift(item);
  saveAlerts(list.slice(0, 200));
  return item;
}
export function removeAlert(id) { return saveAlerts(getAlerts().filter(x => x.id !== id)); }
export function toggleAlert(id) {
  const list = getAlerts().map(x => x.id === id ? { ...x, active: !x.active, updatedAt: nowIso() } : x);
  saveAlerts(list);
  return list.find(x => x.id === id);
}

export function getDashboardWidgets() { return read(KEYS.widgets, []); }
export function addDashboardWidget(widget = {}) {
  const symbol = String(widget.symbol || '').toUpperCase();
  const type = widget.type || 'custom';
  const list = getDashboardWidgets();
  const exists = list.find(w => w.type === type && String(w.symbol || '').toUpperCase() === symbol);
  const item = exists ? { ...exists, updatedAt: nowIso() } : {
    id: uid('widget'),
    type,
    symbol,
    title: widget.title || (symbol ? symbol + ' Widget' : 'RUx Widget'),
    subtitle: widget.subtitle || 'Kullanıcı tarafından eklendi',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const next = [item, ...list.filter(w => w.id !== item.id)].slice(0, 12);
  write(KEYS.widgets, next);
  return item;
}
export function removeDashboardWidget(id) { return write(KEYS.widgets, getDashboardWidgets().filter(w => w.id !== id)); }

export function getWatchlist() { return read(KEYS.watchlist, ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT']); }
export function addToWatchlist(symbol) {
  const s = String(symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!s) return getWatchlist();
  const normalized = s.endsWith('USDT') ? s : s + 'USDT';
  const next = [normalized, ...getWatchlist().filter(x => x !== normalized)].slice(0, 50);
  return write(KEYS.watchlist, next);
}
export function removeFromWatchlist(symbol) { return write(KEYS.watchlist, getWatchlist().filter(x => x !== symbol)); }

export function getNotes() { return read(KEYS.notes, []); }
export function addNote(note = {}) {
  const item = {
    id: uid('note'),
    createdAt: nowIso(),
    symbol: String(note.symbol || 'GENEL').toUpperCase(),
    text: note.text || '',
    source: note.source || 'RUx Not'
  };
  const next = [item, ...getNotes()].slice(0, 200);
  write(KEYS.notes, next);
  return item;
}
export function removeNote(id) { return write(KEYS.notes, getNotes().filter(x => x.id !== id)); }

export function formatLocalTime(iso) {
  try { return new Date(iso).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }
  catch { return '—'; }
}

export function triggerAddAlertFlow({ symbol = 'BTCUSDT', side = 'WATCH', source = 'RUx', defaultPrice = '' } = {}) {
  const raw = window.prompt(`${symbol} için alarm fiyatı gir:`, defaultPrice || '');
  if (raw == null) return null;
  const threshold = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(threshold) || threshold <= 0) return null;
  return addAlert({ symbol, side, source, threshold, message: `${symbol} fiyat alarmı · ${threshold}` });
}

export function triggerAddNoteFlow({ symbol = 'GENEL', source = 'RUx' } = {}) {
  const text = window.prompt(`${symbol} için not yaz:`);
  if (!text || !text.trim()) return null;
  return addNote({ symbol, source, text: text.trim() });
}
