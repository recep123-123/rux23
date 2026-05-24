/* RUx — Alarm Yönetimi / Local manual alert center */
import { el, toast } from './api.js?v=0.75.7-liquidation-source-health-20260524';
import { ICN, statCard, pageHead, card } from './components.js?v=0.75.7-liquidation-source-health-20260524';
import { getAlerts, addAlert, removeAlert, toggleAlert, getWatchlist, addToWatchlist, getNotes, removeNote, formatLocalTime } from './rux_actions.js?v=0.75.7-liquidation-source-health-20260524';

export async function renderAlarm(host, params = {}) {
  host.innerHTML = '';
  const prefillSymbol = String(params?.symbol || 'BTCUSDT').toUpperCase();
  host.appendChild(pageHead({
    title: 'ALARM YÖNETİMİ',
    subtitle: 'Manuel takip alarmları · İzleme listesi · Not merkezi. Otomatik emir açmaz.',
    actions: [
      el('button', { class: 'btn primary', on: { click: () => openQuickAlert(host, prefillSymbol) } }, ICN.bell(12), 'YENİ ALARM'),
      el('button', { class: 'btn', on: { click: () => { localStorage.removeItem('rux.alerts.v1'); renderAlarm(host, params); toast('Alarm listesi temizlendi.', 'warn', 'RUx'); } } }, ICN.trash?.(12) || '🗑', 'TEMİZLE')
    ]
  }));

  renderBody(host, params);
}

function renderBody(host, params = {}) {
  const alerts = getAlerts();
  const active = alerts.filter(a => a.active !== false).length;
  const high = alerts.filter(a => a.priority === 'yüksek').length;
  const watch = getWatchlist();
  const notes = getNotes();

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.bell(18), iconColor: 'yellow', label: 'AKTİF ALARM', value: String(active), sub: alerts.length + ' toplam kayıt' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'YÜKSEK ÖNCELİK', value: String(high), sub: high ? 'Yakından izle' : 'Temiz' }));
  stats.appendChild(statCard({ icon: ICN.list(18), iconColor: 'cyan', label: 'İZLEME LİSTESİ', value: String(watch.length), sub: watch.slice(0,3).join(' · ') }));
  stats.appendChild(statCard({ icon: ICN.edit(18), iconColor: 'blue', label: 'NOT', value: String(notes.length), sub: 'Manuel karar notları' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'EMİR MODU', value: 'KAPALI', sub: 'Sadece alarm ve takip' }));
  stats.appendChild(statCard({ icon: ICN.cpu(18), iconColor: 'purple', label: 'KAYIT', value: 'LOCAL', sub: 'Tarayıcı belleği' }));
  host.appendChild(stats);

  const row = el('div', { class: 'row fr-2-1 section' });
  row.appendChild(buildAlertsTable(host, params));
  row.appendChild(buildManualCreateCard(host, params));
  host.appendChild(row);

  const row2 = el('div', { class: 'row cols-2 section' });
  row2.appendChild(buildWatchlistCard(host));
  row2.appendChild(buildNotesCard(host));
  host.appendChild(row2);
}

function buildAlertsTable(host, params) {
  const alerts = getAlerts();
  const tbl = el('table', { class: 'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'COIN'), el('th', {}, 'TÜR'), el('th', { class: 'r' }, 'EŞİK'), el('th', {}, 'ÖNCELİK'), el('th', {}, 'DURUM'), el('th', {}, 'KAYIT'), el('th', {}, 'İŞLEM')
  )));
  const tb = el('tbody', {});
  if (!alerts.length) {
    tb.appendChild(el('tr', {}, el('td', { colspan: 7, class: 'muted small' }, 'Henüz alarm yok. Coin Pano veya bu ekrandan yeni alarm oluşturabilirsin.')));
  }
  alerts.forEach(a => {
    const status = a.active === false ? 'PASİF' : 'AKTİF';
    tb.appendChild(el('tr', {},
      el('td', { class: 'bold' }, a.symbol),
      el('td', {}, a.type === 'price' ? 'Fiyat' : a.type),
      el('td', { class: 'r mono bold' }, a.threshold ? '$' + Number(a.threshold).toLocaleString('en-US', { maximumFractionDigits: 6 }) : '—'),
      el('td', {}, el('span', { class: 'tag ' + (a.priority === 'yüksek' ? 'red' : a.priority === 'düşük' ? 'cyan' : 'yellow') }, a.priority || 'orta')),
      el('td', {}, el('button', { class: 'btn tiny ' + (a.active === false ? '' : 'outline-green'), on: { click: () => { toggleAlert(a.id); toast('Alarm durumu güncellendi.', 'success', 'RUx'); rerender(host, params); } } }, status)),
      el('td', { class: 'mono small muted' }, formatLocalTime(a.createdAt)),
      el('td', {}, el('button', { class: 'btn tiny danger', on: { click: () => { removeAlert(a.id); toast('Alarm silindi.', 'warn', 'RUx'); rerender(host, params); } } }, 'SİL'))
    ));
  });
  tbl.appendChild(tb);
  return card({ title: 'RUx ALARM LİSTESİ', tag: 'Manuel takip', body: el('div', { class: 'tbl-wrap' }, tbl) });
}

function buildManualCreateCard(host, params = {}) {
  const symbolInput = el('input', { class: 'input', value: String(params.symbol || 'BTCUSDT').toUpperCase(), placeholder: 'BTCUSDT' });
  const thresholdInput = el('input', { class: 'input', placeholder: 'Alarm fiyatı', type: 'number', step: '0.000001' });
  const prioritySelect = el('select', { class: 'input' },
    el('option', { value: 'orta' }, 'Orta'),
    el('option', { value: 'yüksek' }, 'Yüksek'),
    el('option', { value: 'düşük' }, 'Düşük')
  );
  const noteInput = el('textarea', { class: 'input textarea', placeholder: 'Kısa alarm notu / gerekçe' });
  const save = el('button', { class: 'btn primary w-full', on: { click: () => {
    const symbol = symbolInput.value.trim().toUpperCase();
    const threshold = Number(thresholdInput.value);
    if (!symbol || !Number.isFinite(threshold) || threshold <= 0) { toast('Coin ve geçerli alarm fiyatı gerekli.', 'error', 'RUx'); return; }
    addAlert({ symbol, threshold, priority: prioritySelect.value, message: noteInput.value || symbol + ' fiyat alarmı', source: 'Alarm Yönetimi' });
    addToWatchlist(symbol);
    toast(symbol + ' alarmı kaydedildi.', 'success', 'RUx');
    rerender(host, params);
  } } }, ICN.bell(12), 'ALARM KAYDET');
  return card({ title: 'HIZLI ALARM OLUŞTUR', tag: 'Local', body: el('div', { class: 'form-stack' },
    el('label', { class: 'field-label' }, 'Coin'), symbolInput,
    el('label', { class: 'field-label' }, 'Fiyat eşiği'), thresholdInput,
    el('label', { class: 'field-label' }, 'Öncelik'), prioritySelect,
    el('label', { class: 'field-label' }, 'Not'), noteInput,
    save,
    el('div', { class: 'small muted mt-8' }, 'Bu alarm tarayıcıda saklanır; otomatik emir açmaz/kapatmaz.')
  ) });
}

function buildWatchlistCard(host) {
  const list = getWatchlist();
  const input = el('input', { class: 'input', placeholder: 'Örn: ARBUSDT' });
  const chips = el('div', { class: 'chip-grid mt-10' }, list.map(s => el('span', { class: 'tag cyan' }, s)));
  return card({ title: 'İZLEME LİSTESİ', tag: list.length + ' coin', body: el('div', {},
    el('div', { class: 'flex gap-8' }, input, el('button', { class: 'btn', on: { click: () => { addToWatchlist(input.value); toast('İzleme listesi güncellendi.', 'success', 'RUx'); rerender(host, {}); } } }, ICN.plus(12), 'EKLE')),
    chips
  ) });
}

function buildNotesCard(host) {
  const notes = getNotes();
  const body = el('div', { class: 'note-list' });
  if (!notes.length) body.appendChild(el('div', { class: 'muted small' }, 'Henüz not yok. Sinyal/coin ekranlarından not ekleme aktif hale getirildi.'));
  notes.slice(0, 8).forEach(n => body.appendChild(el('div', { class: 'note-row' },
    el('div', {}, el('b', {}, n.symbol), el('span', { class: 'muted small' }, ' · ' + formatLocalTime(n.createdAt)), el('div', { class: 'small mt-2' }, n.text)),
    el('button', { class: 'btn tiny', on: { click: () => { removeNote(n.id); rerender(host, {}); } } }, 'SİL')
  )));
  return card({ title: 'NOT MERKEZİ', tag: String(notes.length), body });
}

function openQuickAlert(host, symbol) {
  const price = window.prompt(`${symbol} için alarm fiyatı gir:`);
  if (price == null) return;
  const threshold = Number(String(price).replace(',', '.'));
  if (!Number.isFinite(threshold) || threshold <= 0) { toast('Geçerli bir fiyat girmen gerekiyor.', 'error', 'RUx'); return; }
  addAlert({ symbol, threshold, priority: 'orta', message: symbol + ' hızlı alarm', source: 'Hızlı Alarm' });
  addToWatchlist(symbol);
  toast(symbol + ' hızlı alarmı eklendi.', 'success', 'RUx');
  rerender(host, { symbol });
}

function rerender(host, params) {
  host.innerHTML = '';
  renderAlarm(host, params);
}
