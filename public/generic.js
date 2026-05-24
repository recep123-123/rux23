/* RUx — Generic fallback page */
import { el } from './api.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { ICN, statCard, card, pageHead } from './components.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';

export async function renderGenericPage(host, pageId) {
  host.innerHTML = '';
  const niceName = (pageId || 'sayfa').replace(/-/g, ' ').replace(/_/g, ' ').toUpperCase();
  host.appendChild(pageHead({
    title: niceName,
    subtitle: 'Bu modül geliştirme aşamasında veya kapsam dahilinde değil.',
    actions: [
      el('button', { class: 'btn outline-yellow' }, ICN.warning(12), 'GERİ BİLDİRİM'),
      el('a', { class: 'btn primary', href: '#/kokpit' }, ICN.bars(12), 'KOKPİTE DÖN'),
    ]
  }));

  // Placeholder card
  host.appendChild(el('div', { class: 'card section flex center', style: 'flex-direction:column; gap:12px; padding:60px 30px; text-align:center;' },
    el('div', { class: 'ic-box', style: 'width:80px;height:80px;border-radius:24px;background:rgba(34,211,238,0.10);display:flex;align-items:center;justify-content:center;color:#22d3ee' }, ICN.layers(40)),
    el('div', { class: 'card-title', style: 'font-size:20px' }, niceName),
    el('div', { class: 'small muted', style: 'max-width:520px; line-height:1.6' },
      'Bu sayfa modülü henüz oluşturulmadı. Sol menüden başka bir sayfaya geçebilir veya RUx Kokpit\'e dönerek diğer terminallere ulaşabilirsiniz.'
    ),
    el('div', { class: 'flex gap-12 mt-6' },
      el('a', { class: 'btn primary', href: '#/kokpit' }, ICN.bars(12), 'KOKPİT'),
      el('a', { class: 'btn', href: '#/piyasa' }, 'PİYASA ÖZETİ'),
      el('a', { class: 'btn', href: '#/sinyal' }, 'SİNYAL MERKEZİ'),
      el('a', { class: 'btn', href: '#/coin-pano' }, 'COİN PANO'),
    ),
  ));
}
