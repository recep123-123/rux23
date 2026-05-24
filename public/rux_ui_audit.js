/* RUx — Functional UI Audit & Generic Action Bridge
   Purpose: make passive/demo buttons visible and provide safe generic actions for common controls. */
import { toast } from './api.js?v=0.75.11-heatmap-tf-recalibration-20260524';

const ACTION_WORDS = [
  'YENİLE','YENIDEN','YENİDEN','REFRESH','TEST','ÇALIŞTIR','CALISTIR','VALIDASYON',
  'FİLTRELE','FILTRELE','SIRALA','ÖZELLEŞTİR','OZELLESTIR','GÖSTERGELER','GOSTERGELER',
  'ŞABLONLAR','SABLONLAR','PLAN OLUŞTUR','PLAN OLUSTUR','REST','BEKLEME','POZİSYON AÇ','POZISYON AC'
];

function textOf(el){ return String(el?.innerText || el?.textContent || '').replace(/\s+/g,' ').trim(); }
function norm(s){ return String(s||'').toLocaleUpperCase('tr-TR').replace(/\s+/g,' ').trim(); }
function hasDataAttrs(el){ return Array.from(el.attributes||[]).some(a => a.name.startsWith('data-')); }
function pageId(){ return location.hash.replace(/^#\/?/,'').split('?')[0] || 'kokpit'; }
function refreshCurrentPage(){
  const page = pageId();
  const qs = new URLSearchParams((location.hash.split('?')[1]||''));
  qs.set('_refresh', String(Date.now()));
  location.hash = '#/' + page + '?' + qs.toString();
}
function isLikelyActionButton(btn){
  if (!btn || btn.disabled) return false;
  if (btn.closest('.rux-card-audit-summary,.rux-ui-audit-summary,.rux-source-footer')) return false;
  const t = norm(textOf(btn));
  if (!t && btn.classList.contains('om-icon-btn')) return true;
  return ACTION_WORDS.some(w => t.includes(norm(w))) || btn.classList.contains('tb') || btn.classList.contains('card-link');
}
function actionKind(btn){
  const t = norm(textOf(btn));
  if (btn.classList.contains('tb')) return 'tab-toggle';
  if (t.includes('YENİLE') || t.includes('YENIDEN') || t.includes('YENİDEN') || t.includes('REFRESH') || t.includes('TEST') || t.includes('ÇALIŞTIR') || t.includes('CALISTIR') || t.includes('VALIDASYON')) return 'refresh';
  if (t.includes('REST') || t.includes('BEKLEME')) return 'toggle-rest';
  if (t.includes('FİLTRE') || t.includes('FILTRE') || t.includes('SIRALA')) return 'local-filter';
  if (t.includes('ÖZELLEŞTİR') || t.includes('OZELLESTIR') || t.includes('GÖSTERGE') || t.includes('GOSTERGE') || t.includes('ŞABLON') || t.includes('SABLON') || t.includes('PLAN')) return 'planned';
  if (t.includes('POZİSYON') || t.includes('POZISYON')) return 'manual-execution';
  if (!t && (btn.title || btn.classList.contains('om-icon-btn'))) return 'icon-control';
  return 'passive';
}
function canTreatAsNativeBound(btn){
  if (btn.id || hasDataAttrs(btn) || btn.closest('a[href]') || btn.hasAttribute('href')) return true;
  if (btn.getAttribute('type') === 'submit') return true;
  return false;
}
function markButtons(host){
  const buttons = Array.from(host.querySelectorAll('button,.btn,.card-link,.tb,.om-icon-btn')).filter(b => !b.closest('.rux-ui-audit-summary,.rux-card-audit-summary,.rux-source-footer'));
  const counts = { total: buttons.length, native:0, bridged:0, passive:0, disabled:0 };
  for (const btn of buttons){
    if (btn.disabled){ counts.disabled++; btn.setAttribute('data-rux-action-state','disabled'); continue; }
    if (!isLikelyActionButton(btn)){ counts.passive++; btn.setAttribute('data-rux-action-state','view'); continue; }
    const nativeBound = canTreatAsNativeBound(btn);
    const kind = actionKind(btn);
    if (nativeBound){
      counts.native++;
      btn.setAttribute('data-rux-action-state','native');
      btn.title = btn.title || 'Bu kontrol kendi handler/route/data aksiyonuna bağlı.';
      continue;
    }
    counts.bridged++;
    btn.setAttribute('data-rux-action-state','bridged');
    btn.setAttribute('data-rux-bridge-action', kind);
    btn.classList.add('rux-bridged-action');
    btn.title = btn.title || `RUx v0.75.11-heatmap-tf-recalibration-20260524 generic bridge: ${kind}`;
  }
  return counts;
}
function ensureSummary(host, counts){
  if (!host) return;
  let box = host.querySelector(':scope > .rux-ui-audit-summary');
  const severity = counts.bridged ? 'warn' : 'ok';
  const html = `<div class="audit-left"><strong>UI İşlev Denetimi</strong><span>${counts.total} kontrol · native ${counts.native} · generic ${counts.bridged} · pasif/görsel ${counts.passive}${counts.disabled ? ' · disabled '+counts.disabled : ''}</span></div><div class="audit-right ${severity}">${counts.bridged ? counts.bridged + ' GENERIC BRIDGE' : 'Kontroller bağlı'}</div>`;
  if (!box){
    box = document.createElement('div');
    box.className = 'rux-ui-audit-summary';
    const after = host.querySelector(':scope > .rux-card-audit-summary');
    if (after?.nextSibling) host.insertBefore(box, after.nextSibling); else host.insertBefore(box, host.firstElementChild);
  }
  box.innerHTML = html;
  ensureFloatingBadge(counts);
}

// Her sayfada görünen sabit (floating) denetim rozeti.
// generic/notwired varsa sarı/kırmızı; temizse yeşil. Tıklayınca detay açar.
function ensureFloatingBadge(counts){
  if (typeof document === 'undefined') return;
  const page = pageId();
  const notWired = document.querySelectorAll('#om-page [data-rux-audit="NOT_WIRED"], #om-page .notwired').length;
  let badge = document.getElementById('rux-audit-badge');
  if (!badge){
    badge = document.createElement('div');
    badge.id = 'rux-audit-badge';
    badge.style.cssText = 'position:fixed; right:14px; bottom:54px; z-index:9998; font:600 11px/1.3 system-ui,sans-serif; padding:7px 11px; border-radius:10px; cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,.3); border:1px solid rgba(255,255,255,.12); transition:all .15s; user-select:none;';
    badge.title = 'UI denetimi: tıkla, bu sayfanın ölü/generic kontrollerini gör';
    badge.addEventListener('click', () => {
      const detail = document.getElementById('rux-audit-detail');
      if (detail){ detail.remove(); return; }
      showAuditDetail();
    });
    document.body.appendChild(badge);
  }
  const issues = (counts.bridged || 0) + notWired;
  const bg = issues > 0 ? (notWired > 0 ? 'rgba(139,0,0,.92)' : 'rgba(185,127,56,.92)') : 'rgba(4,120,87,.9)';
  badge.style.background = bg;
  badge.style.color = '#fff';
  badge.innerHTML = issues > 0
    ? `⚠ ${page}: ${counts.bridged||0} generic${notWired ? ' · '+notWired+' ölü' : ''}`
    : `✓ ${page}: temiz`;
  badge._counts = { ...counts, notWired, page };
}

function showAuditDetail(){
  const badge = document.getElementById('rux-audit-badge');
  const c = badge?._counts || {};
  const all = Array.from(document.querySelectorAll('#om-page button, #om-page .btn, #om-page .qg-link, #om-page .tb'));
  const bridged = all.filter(b => b.getAttribute('data-rux-bridge-action'));
  const notWiredEls = Array.from(document.querySelectorAll('#om-page [data-rux-audit="NOT_WIRED"], #om-page .notwired'));
  const panel = document.createElement('div');
  panel.id = 'rux-audit-detail';
  panel.style.cssText = 'position:fixed; right:14px; bottom:92px; z-index:9999; width:320px; max-height:380px; overflow:auto; background:#0f1729; color:#e2e8f0; border:1px solid rgba(255,255,255,.14); border-radius:12px; padding:12px 14px; box-shadow:0 8px 28px rgba(0,0,0,.5); font:12px/1.45 system-ui,sans-serif;';
  let html = `<div style="font-weight:700; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;"><span>Sayfa: ${c.page || '—'}</span><span style="cursor:pointer; opacity:.6;" onclick="document.getElementById('rux-audit-detail').remove()">✕</span></div>`;
  html += `<div style="color:#64748b; margin-bottom:8px;">Toplam ${c.total||0} kontrol · native ${c.native||0} · generic ${c.bridged||0} · pasif ${c.passive||0}</div>`;
  if (bridged.length){
    html += `<div style="color:#B97F38; font-weight:600; margin:6px 0;">GENERIC / PASİF BUTONLAR (${bridged.length})</div>`;
    bridged.slice(0,20).forEach(b => {
      html += `<div style="padding:3px 0; border-bottom:1px solid rgba(255,255,255,.06);">• ${(b.textContent||'').trim().slice(0,42) || '(ikon)'} <span style="color:#64748b;">→ ${b.getAttribute('data-rux-bridge-action')||'pasif'}</span></div>`;
    });
  }
  if (notWiredEls.length){
    html += `<div style="color:#ef4444; font-weight:600; margin:8px 0 6px;">NOT WIRED GÖSTERGELER (${notWiredEls.length})</div>`;
    notWiredEls.slice(0,20).forEach(e => {
      // Kart başlığını birden çok olası yerden dene: kart içi başlık, stat etiketi,
      // KPI etiketi, ya da ilk anlamlı metin satırı.
      let title = '';
      const titleEl = e.querySelector('.card-title, .rux-kpi-label, .stat-label, .statcard-label, h3, h4, .title');
      if (titleEl) title = titleEl.textContent.trim();
      if (!title) {
        // stat-card yapısı: genelde label bir üst/komşu div'de büyük harf metin
        const strong = e.querySelector('strong, b, .label, [class*="label"], [class*="title"]');
        if (strong) title = strong.textContent.trim();
      }
      if (!title) {
        // Son çare: kartın ilk kısa büyük-harf metin satırı
        const txt = (e.textContent || '').replace(/\s+/g, ' ').trim();
        title = txt.slice(0, 38);
      }
      title = title.replace(/NOT WIRED|no binding|upd \d.*$/gi, '').trim().slice(0, 42);
      html += `<div style="padding:3px 0; border-bottom:1px solid rgba(255,255,255,.06);">• ${title || '(adsız kart)'}</div>`;
    });
  }
  if (!bridged.length && !notWiredEls.length){
    html += `<div style="color:#047857; padding:8px 0;">✓ Bu sayfada generic/pasif buton veya NOT WIRED gösterge yok. Tüm kontroller bağlı.</div>`;
  }
  html += `<div style="color:#64748b; margin-top:8px; font-size:11px;">Not: "pasif/görsel" kontroller (etiket, badge) normaldir; sadece generic ve NOT WIRED düzeltme gerektirir.</div>`;
  panel.innerHTML = html;
  document.getElementById('rux-audit-detail')?.remove();
  document.body.appendChild(panel);
}
function handleBridgeClick(e){
  const btn = e.target.closest?.('[data-rux-bridge-action]');
  if (!btn || btn.disabled) return;
  const action = btn.getAttribute('data-rux-bridge-action');
  if (!action) return;
  // Delay allows any page-specific listener to run first if one exists.
  setTimeout(() => {
    if (!document.body.contains(btn)) return;
    if (action === 'refresh') {
      toast('Sayfa/veri yenilemesi tetiklendi.', 'info', 'RUx UI Bridge');
      refreshCurrentPage();
    } else if (action === 'tab-toggle' || action === 'local-filter') {
      const group = btn.parentElement;
      if (group) group.querySelectorAll('.active,.primary,.outline-cyan').forEach(x => {
        if (x !== btn && x.classList.contains('tb')) x.classList.remove('active');
      });
      if (btn.classList.contains('tb')) btn.classList.add('active');
      toast('Görünüm filtresi lokal olarak uygulandı. Bu kontrol karar motorunu değiştirmez.', 'info', 'RUx UI Bridge');
    } else if (action === 'toggle-rest') {
      btn.classList.toggle('outline-yellow'); btn.classList.toggle('primary');
      btn.setAttribute('aria-pressed', btn.classList.contains('primary') ? 'true' : 'false');
      toast('Rest/bekleme görünüm durumu değiştirildi. Otomatik emir yok.', 'warn', 'RUx UI Bridge');
    } else if (action === 'manual-execution') {
      toast('Terminal otomatik pozisyon açmaz. Manuel plan için Sinyal Detay / User Fidelity ekranını kullan.', 'warn', 'RUx');
      window.OMNI?.navigate?.('user-fidelity');
    } else {
      toast('Bu kontrol audit kapsamında pasif olarak işaretlendi; işlev gerekiyorsa hedefli bağlanacak.', 'warn', 'RUx UI Audit');
    }
  }, 0);
}

export function applyFunctionalUiAudit(){
  const host = document.getElementById('om-page');
  if (!host) return { total:0 };
  const counts = markButtons(host);
  ensureSummary(host, counts);
  return counts;
}
export function scheduleFunctionalUiAudit(){
  requestAnimationFrame(applyFunctionalUiAudit);
  setTimeout(applyFunctionalUiAudit, 400);
  setTimeout(applyFunctionalUiAudit, 1600);
}
export function startFunctionalUiBridge(){
  if (window.__RUX_UI_BRIDGE_STARTED__) return;
  document.addEventListener('click', handleBridgeClick, false);
  window.__RUX_UI_BRIDGE_STARTED__ = true;
}
