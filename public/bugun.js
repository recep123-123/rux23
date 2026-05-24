/* RUx — Bugün İşlem? (image 15) */
import { State, el, fmtPct } from './api.js?v=0.75.11-heatmap-tf-recalibration-20260524';
import { ICN, statCard, card, pageHead, ringGauge, coinPill, checklist, barbar } from './components.js?v=0.75.11-heatmap-tf-recalibration-20260524';

export async function renderBugun(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'BUGÜN İŞLEM?',
    subtitle: 'Piyasayı, sinyalleri ve risk ortamını tek bakışta değerlendirin.',
    actions: [
      el('div', { class: 'select' }, el('span', { class: 'label' }, 'Tarih'), '27 May 2025 ', ICN.chev(10)),
      el('div', { class: 'select' }, el('span', { class: 'label' }, 'Seans'), 'Tümü ', ICN.chev(10)),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  // Top: big decision card + 5 quality cards + general score
  const top = el('div', { class: 'row section', style: 'grid-template-columns: 1.2fr 3fr 1fr;' });
  // Decision
  const decision = el('div', { class: 'decision-card green' },
    el('div', { class: 'card-title' }, 'GÜNÜN KARARI'),
    el('div', { class: 'deciside-mega mt-8' }, 'AL ', el('span', { style: 'background:var(--c-green-soft); border:1px solid rgba(16,185,129,0.4); width:48px; height:48px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center;' }, ICN.check(28))),
    el('div', { class: 'deciside-sub mt-8 bold pos' }, 'İşlem için uygun bir gün.'),
    el('div', { class: 'small muted mt-8', style: 'line-height:1.5' }, 'Koşullar, kaliteli fırsatların yakalanması için destekleyici.'),
  );
  top.appendChild(decision);

  // 5 quality cards
  const stats = el('div', { style: 'display:grid; grid-template-columns: repeat(5, 1fr); gap:8px;' });
  const items = [
    { i: ICN.shieldcheck(18), c: 'green', l: 'PİYASA KALİTESİ', v: '82 / 100', s: 'Güçlü', sub: 'Trend net, likidite yeterli', col: 'pos' },
    { i: ICN.target(18), c: 'cyan', l: 'SETUP SAYISI', v: '14', s: 'İyi', sub: '≥ %60 kaliteye sahip', col: '' },
    { i: ICN.pulse(18), c: 'purple', l: 'VOLATİLİTE UYGUNLUĞU', v: '78 / 100', s: 'Uygun', sub: 'ATR, strateji aralığında', col: '' },
    { i: ICN.link(18), c: 'blue', l: 'SİNYAL UYUMU', v: '84 / 100', s: 'Güçlü', sub: 'Sinyaller aynı yönde', col: 'pos' },
    { i: ICN.warning(18), c: 'red', l: 'RİSK ORTAMI', v: '75 / 100', s: 'Kontrollü', sub: 'Makro riskler düşük', col: '' },
  ];
  items.forEach(it => stats.appendChild(statCard({ icon: it.i, iconColor: it.c, label: it.l, value: it.v, sub: it.s + ' · ' + it.sub, subColor: it.col })));
  top.appendChild(stats);

  // General score
  const gen = el('div', { class: 'card flex center', style: 'flex-direction:column; gap:8px' },
    el('div', { class: 'card-title' }, 'GENEL SKOR'),
    ringGauge({ value: 81, max: 100, color: '#10b981', size: 130 }),
    el('div', { class: 'pos bold mt-4' }, 'YÜKSEK'),
    el('div', { class: 'tiny muted text-center', style: 'line-height:1.4' }, 'İşlem yapmak için ideal bir gün.'),
  );
  top.appendChild(gen);

  host.appendChild(top);

  // Middle: opportunities (left), why/why not (mid), session timing (right)
  const mid = el('div', { class: 'row fr-1-1-1 section' });
  mid.appendChild(buildOpportunities());
  mid.appendChild(buildWhyWhyNot());
  mid.appendChild(buildSessions());
  host.appendChild(mid);

  // Bottom: top 3 setups + final checklist + day note
  const bottom = el('div', { class: 'row fr-2-1-1 section' });
  bottom.appendChild(buildTopSetups());
  bottom.appendChild(buildFinalChecklist());
  bottom.appendChild(buildDayNote());
  host.appendChild(bottom);
}

function buildOpportunities() {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'COIN'),
    el('th', {}, 'YÖN'),
    el('th', {}, 'SETUP'),
    el('th', { class: 'r' }, 'KALİTE'),
    el('th', {}, 'GÜÇ'),
    el('th', {}, 'ZAMANLAMA'),
  )));
  const rows = [
    ['1','BTCUSDT','LONG','Trend Devam (BOS)','87%','Mükemmel','green'],
    ['2','ETHUSDT','LONG','Bayrak Kırılımı','84%','İyi','green'],
    ['3','SOLUSDT','LONG','Yapı Dönüşü','80%','İyi','green'],
    ['4','AVAXUSDT','SHORT','Tepki (Premium)','76%','Uygun','yellow'],
    ['5','LINKUSDT','LONG','OB Onayı + BOS','74%','Uygun','yellow'],
  ];
  const tb = el('tbody', {});
  rows.forEach(([n, s, dir, setup, q, t, c]) => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'muted' }, n),
      el('td', {}, coinPill(s)),
      el('td', {}, el('span', { class: 'tag ' + (dir === 'LONG' ? 'green' : 'red') }, dir)),
      el('td', { class: 'small' }, setup),
      el('td', { class: 'r mono bold' }, q),
      el('td', {}, barbar(parseInt(q))),
      el('td', {}, el('span', { class: 'tag ' + c }, t)),
    ));
  });
  tbl.appendChild(tb);
  return card({ title: 'FIRSAT PANOSU (ÖNE ÇIKAN SETUPLAR)', body: el('div', {}, tbl, el('div', { class: 'card-link mt-10 text-center' }, 'TÜM FIRSATLARI GÖR →')) });
}

function buildWhyWhyNot() {
  return el('div', { class: 'row cols-2', style: 'gap: 12px' },
    card({ title: 'NEDEN İŞLEM YAPMALIYIM?', body: checklist([
      { state: 'ok', label: 'Trend yönü yukarı ve yapılar pozitif.' },
      { state: 'ok', label: 'Fiyat, önemli desteklerin üzerinde.' },
      { state: 'ok', label: 'Hacim akışı alım yönünde.' },
      { state: 'ok', label: 'Funding oranları nötr - aşırı değil.' },
      { state: 'ok', label: 'Likidite ve volatilite sağlıklı aralıkta.' },
    ]) }),
    card({ title: 'NEDEN İŞLEM YAPMAMALIYIM?', body: checklist([
      { state: 'miss', label: 'FOMC/önemli veri riski yok.' },
      { state: 'miss', label: 'Piyasa aşırı ısınmış değil.' },
      { state: 'miss', label: 'Spreader normal seviyede.' },
      { state: 'miss', label: 'Likidasyon kümeleri uzakta.' },
      { state: 'miss', label: 'Piyasa manipülasyon sinyali yok.' },
    ]) }),
  );
}

function buildSessions() {
  const w = el('div', { class: 'card' });
  w.appendChild(el('div', { class: 'card-title' }, 'SEANS ZAMANLAMASI'));
  const rows = [
    ['Asya','01:00 - 09:00','Orta','yellow'],
    ['Londra','09:00 - 17:00','Yüksek','pos'],
    ['New York','15:30 - 22:30','Yüksek','pos'],
    ['Overlap (LON/NY)','15:30 - 17:30','En Yüksek','cyan'],
  ];
  const list = el('div', { class: 'mt-8' });
  rows.forEach(([n, t, q, c]) => {
    list.appendChild(el('div', { class: 'flex between', style: 'padding:8px 0; border-bottom:1px dashed var(--bd-1); font-size:12px' },
      el('span', {}, n), el('span', { class: 'mono small muted' }, t), el('span', { class: c }, '● ' + q)
    ));
  });
  w.appendChild(list);
  w.appendChild(el('div', { style: 'padding:10px 14px; background:rgba(34,211,238,0.10); border-radius:10px; margin-top:14px;' },
    el('div', { class: 'flex items-center gap-8' }, ICN.target(14), el('span', { class: 'small bold cyan' }, 'En iyi işlem penceresi:')),
    el('div', { class: 'mono small mt-4' }, '15:30 - 17:30 (Londra / New York Kesişimi)'),
  ));
  return w;
}

function buildTopSetups() {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'),
    el('th', {}, 'COIN'),
    el('th', {}, 'YÖN'),
    el('th', {}, 'SETUP'),
    el('th', {}, 'ZAMAN DİLİMİ'),
    el('th', {}, 'GİRİŞ BÖLGESİ'),
    el('th', {}, 'HEDEF'),
    el('th', {}, 'ZARAR DURDUR'),
    el('th', { class: 'r' }, 'RR'),
    el('th', { class: 'r' }, 'KALİTE'),
    el('th', { class: 'r' }, 'GÜVEN'),
  )));
  const rows = [
    ['1','BTCUSDT','LONG','Trend Devamı (BOS)','4h','$106,200 - $106,600','$110,500 / $113,400','$104,200','1.9','87%','Yüksek','pos'],
    ['2','ETHUSDT','LONG','Bayrak Kırılımı','4h','$2,580 - $2,610','$2,820 / $2,950','$2,470','2.1','84%','Yüksek','pos'],
    ['3','SOLUSDT','LONG','Yapı Dönüşü','4h','$168 - $169.5','$182.5 / $190.0','$162.0','2.0','80%','Orta-Yüksek','warn'],
  ];
  const tb = el('tbody', {});
  rows.forEach(([n, s, dir, setup, tf, ent, hed, sl, rr, q, conf, c]) => {
    tb.appendChild(el('tr', {},
      el('td', { class: 'muted' }, n),
      el('td', {}, coinPill(s)),
      el('td', {}, el('span', { class: 'tag ' + (dir === 'LONG' ? 'green' : 'red') }, dir)),
      el('td', { class: 'small' }, setup),
      el('td', { class: 'mono small muted' }, tf),
      el('td', { class: 'mono small' }, ent),
      el('td', { class: 'mono small pos' }, hed),
      el('td', { class: 'mono small neg' }, sl),
      el('td', { class: 'r mono' }, rr),
      el('td', { class: 'r mono bold' }, q),
      el('td', { class: 'r ' + c, style: 'font-weight:700' }, conf),
    ));
  });
  tbl.appendChild(tb);
  return card({ title: 'EN İYİ 3 SETUP', body: el('div', {}, tbl, el('div', { class: 'mt-10 small muted' }, '● Fırsatlar kalite puanına göre sıralanmıştır. Her zaman planınıza sadık kalın.')) });
}

function buildFinalChecklist() {
  return card({ title: 'FİNAL KONTROL LİSTESİ', body: checklist([
    { state: 'ok', label: 'İşlem planım hazır.', right: 'EVET' },
    { state: 'ok', label: 'Riski tanımladım (%1-2).', right: 'EVET' },
    { state: 'ok', label: 'Giriş, çıkış ve senaryolar net.', right: 'EVET' },
    { state: 'ok', label: 'Zarar durdur seviyem belirlendi.', right: 'EVET' },
    { state: 'ok', label: 'Disiplin ve duygusal kontrolüm yerinde.', right: 'EVET' },
    { state: 'ok', label: 'Piyasayı ve haber akışını kontrol ettim.', right: 'EVET' },
  ]) });
}

function buildDayNote() {
  return card({
    title: el('span', { class: 'flex items-center gap-6' }, ICN.flame(13), 'GÜNÜN NOTU'),
    body: el('div', {},
      el('div', { class: 'small', style: 'color:var(--fg-2); line-height:1.55' },
        'Planlı kal, disiplinli ol, fırsatlar hep olacak. Bugün kaliteli fırsatları sabırla yakala.'),
      el('div', { class: 'mono cyan bold mt-12 text-right' }, '— RUx')
    )
  });
}
