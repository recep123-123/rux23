/* RUx — Risk Paneli (image 10) */
import { el } from './api.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { makeRuxPortfolioHeatSnapshot, statusClass } from './rux_core.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { ICN, statCard, card, pageHead, donut, ringGauge } from './components.js?v=0.75.10-heatmap-fidelity-pass-20260524';
import { canvasLineChart, correlMatrix } from './charts.js?v=0.75.10-heatmap-fidelity-pass-20260524';

export async function renderRisk(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'RİSK PANELİ',
    subtitle: 'Portföy riski, stres testleri, korelasyon ve risk uyarıları tek panelde.',
    actions: [
      el('div', { class: 'select' }, 'Tümü ', ICN.chev(10)),
      el('div', { class: 'select' }, 'Son 30 Gün ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow' }, ICN.bell(12), 'UYARI EKLE'),
      el('button', { class: 'btn primary' }, ICN.play(12), 'STRES TESTİ ÇALIŞTIR'),
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-7 section' });
  stats.appendChild(statCard({ icon: ringGauge({ value: 38, color: '#f59e0b', size: 32 }), iconColor: 'yellow', label: 'GENEL RİSK SKORU', value: '38 / 100', sub: 'Orta', subColor: 'warn' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'PORTFÖY VAR (95%)', value: '$2,418', sub: '%2.4', subColor: 'neg' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'green', label: 'BETA (BTC)', value: '0.84', sub: 'Düşük Korelasyon', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.scale(18), iconColor: 'cyan', label: 'SHARPE (30G)', value: '1.86', sub: 'İyi', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'KÂR / RİSK', value: '2.18', sub: 'İyi', subColor: 'pos' }));
  stats.appendChild(statCard({ icon: ICN.flow(18), iconColor: 'blue', label: 'AKTİF POZİSYON', value: '8', sub: '%64.2 toplam' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'red', label: 'MAX DRAWDOWN', value: '-%12.4', sub: '7-15 Mart 2024', subColor: 'neg' }));
  host.appendChild(stats);

  // Risk timeseries + asset risk donut
  const row = el('div', { class: 'row fr-2-1 section' });
  const c1 = el('div', { class: 'card' });
  c1.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RİSK SKORU ZAMAN SERİSİ'),
    el('div', { class: 'flex gap-6' },
      el('button', { class: 'btn tiny ghost' }, '7G'),
      el('button', { class: 'btn tiny outline-cyan' }, '30G'),
      el('button', { class: 'btn tiny ghost' }, '90G'),
      el('button', { class: 'btn tiny ghost' }, '1Y'),
    )
  ));
  const rsHost = el('div', { class: 'chart-host short mt-6' });
  c1.appendChild(rsHost);
  setTimeout(() => {
    const N = 60; const v = []; const var95 = [];
    for (let i = 0; i < N; i++) { v.push(30 + Math.sin(i/8)*8 + Math.random()*6); var95.push(50); }
    canvasLineChart(rsHost, [
      { values: var95, color: 'rgba(239,68,68,0.4)', width: 1, dash: [4,4] },
      { values: v, color: '#f59e0b', width: 2, fill: true },
    ]);
  }, 60);
  c1.appendChild(el('div', { class: 'flex gap-12 mt-6 small' },
    el('span', {}, el('span', { style: 'color:#f59e0b' }, '●'), ' Risk Skoru'),
    el('span', {}, el('span', { style: 'color: rgba(239,68,68,0.5)' }, '─'), ' Eşik (50)'),
  ));
  row.appendChild(c1);

  const c2 = el('div', { class: 'card' });
  c2.appendChild(el('div', { class: 'card-title' }, 'VARLIK RİSK DAĞILIMI'));
  c2.appendChild(el('div', { class: 'flex center mt-10' }, donut({
    data: [
      { value: 32, color: '#10b981' },
      { value: 24, color: '#06b6d4' },
      { value: 18, color: '#a78bfa' },
      { value: 14, color: '#f59e0b' },
      { value: 12, color: '#ef4444' },
    ], size: 160, thickness: 22, centerTitle: 'TOPLAM RİSK', centerValue: '38'
  })));
  const lg = el('div', { class: 'donut-legend mt-10' },
    el('div', { class: 'li' }, el('i', { style: 'background:#10b981' }), el('span', { class: 'nm' }, 'BTC'), el('span', { class: 'vl' }, '%32')),
    el('div', { class: 'li' }, el('i', { style: 'background:#06b6d4' }), el('span', { class: 'nm' }, 'ETH'), el('span', { class: 'vl' }, '%24')),
    el('div', { class: 'li' }, el('i', { style: 'background:#a78bfa' }), el('span', { class: 'nm' }, 'SOL'), el('span', { class: 'vl' }, '%18')),
    el('div', { class: 'li' }, el('i', { style: 'background:#f59e0b' }), el('span', { class: 'nm' }, 'AVAX'), el('span', { class: 'vl' }, '%14')),
    el('div', { class: 'li' }, el('i', { style: 'background:#ef4444' }), el('span', { class: 'nm' }, 'Diğer'), el('span', { class: 'vl' }, '%12')),
  );
  c2.appendChild(lg);
  row.appendChild(c2);
  host.appendChild(row);

  // Correlation matrix + risk contributors
  const row2 = el('div', { class: 'row cols-2 section' });
  const c3 = el('div', { class: 'card' });
  c3.appendChild(el('div', { class: 'card-title' }, 'KORELASYON MATRİSİ'));
  const cmHost = el('div', { class: 'chart-host short mt-6', style: 'height:240px' });
  c3.appendChild(cmHost);
  setTimeout(() => {
    const labels = ['BTC','ETH','SOL','AVAX','LINK','BNB','MATIC'];
    const N = labels.length;
    const data = labels.map((_, i) => labels.map((_, j) => i === j ? 1 : Math.random()*0.6 + 0.3));
    correlMatrix(cmHost, data, labels);
  }, 80);
  row2.appendChild(c3);

  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, '#'), el('th', {}, 'COIN'), el('th', { class: 'r' }, 'POZ. %'),
    el('th', { class: 'r' }, 'RİSK'), el('th', { class: 'r' }, 'VAR'),
    el('th', { class: 'r' }, 'BETA'),
  )));
  const tb = el('tbody', {});
  [
    [1,'BTC','%32','42','$884','1.00'],
    [2,'ETH','%24','38','$642','1.18'],
    [3,'SOL','%18','46','$524','1.42'],
    [4,'AVAX','%14','52','$408','1.62'],
    [5,'LINK','%6','38','$148','1.21'],
    [6,'BNB','%4','32','$84','0.98'],
    [7,'MATIC','%2','28','$42','1.08'],
  ].forEach(r => tb.appendChild(el('tr', {},
    el('td', { class: 'muted' }, String(r[0])),
    el('td', { class: 'small bold' }, r[1]),
    el('td', { class: 'r mono small' }, r[2]),
    el('td', { class: 'r mono ' + (parseInt(r[3]) > 45 ? 'warn bold' : '') }, r[3]),
    el('td', { class: 'r mono neg' }, r[4]),
    el('td', { class: 'r mono small' }, r[5]),
  )));
  tbl.appendChild(tb);
  row2.appendChild(card({ title: 'EN BÜYÜK RİSK KAYNAKLARI', body: tbl }));
  host.appendChild(row2);

  // Warnings + stress scenarios
  const row3 = el('div', { class: 'row cols-2 section' });
  const warns = el('div', {});
  [
    { state: 'warn', t: 'AVAX riski yükseliyor', msg: 'Pozisyon büyüklüğünü %14\'ten %10\'a düşürmeyi düşünün.' },
    { state: 'warn', t: 'BTC korelasyonu artıyor', msg: 'Portföy çeşitlendirmesi azaldı. Stable + altcoin oranını gözden geçirin.' },
    { state: 'ok', t: 'Likidite yeterli', msg: 'Portföyde %18 stable likidite mevcut.' },
    { state: 'ok', t: 'VaR sınırı altında', msg: 'Günlük VaR sınırı %3, mevcut %2.4.' },
    { state: 'warn', t: 'Aşırı yoğunlaşma riski', msg: 'BTC + ETH toplamı %56 - hedef %50.' },
    { state: 'ok', t: 'Stop loss kapsamı', msg: 'Tüm pozisyonlarda stop tanımlı.' },
  ].forEach(({ state, t, msg }) => {
    warns.appendChild(el('div', { style: 'display:grid; grid-template-columns: 24px 1fr; gap:10px; padding:10px 0; border-bottom:1px dashed var(--bd-1)' },
      el('span', { class: state === 'warn' ? 'warn' : 'pos' }, state === 'warn' ? ICN.warning(16) : ICN.check(16)),
      el('div', {},
        el('div', { class: 'small bold' }, t),
        el('div', { class: 'tiny muted mt-2', style: 'line-height:1.5' }, msg),
      )
    ));
  });
  row3.appendChild(card({ title: 'RİSK UYARILARI', body: warns }));

  // Stress scenarios
  const stbl = el('table', { class: 'tbl tbl-compact' });
  stbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'SENARYO'), el('th', { class: 'r' }, 'PORTFÖY ETKİSİ'),
    el('th', { class: 'r' }, 'OLASILIK'), el('th', {}, 'ÖNERİ'),
  )));
  const stb = el('tbody', {});
  [
    ['BTC -%20 Çakılma','-$8,420','%12','Stop loss güçlendir','red'],
    ['Altcoin -%30 Düşüş','-$6,148','%18','Pozisyon küçült','red'],
    ['ETH -%15','-$3,820','%24','Hedge düşün','warn'],
    ['Stablecoin Ayrışması','-$2,140','%4','Stable çeşitlendir','warn'],
    ['Likidite Krizi','-$5,420','%6','Stable artır','red'],
    ['Yatay Piyasa (3 ay)','-$1,240','%32','Beklenen','muted'],
  ].forEach(r => stb.appendChild(el('tr', {},
    el('td', { class: 'small bold' }, r[0]),
    el('td', { class: 'r mono ' + (r[4] || 'neg') }, r[1]),
    el('td', { class: 'r mono small' }, r[2]),
    el('td', { class: 'small ' + (r[4] === 'red' ? 'neg' : r[4] === 'warn' ? 'warn' : '') }, r[3]),
  )));
  stbl.appendChild(stb);
  row3.appendChild(card({ title: 'STRES SENARYOLARI', body: stbl }));
  host.appendChild(row3);

  // Aşama 4: PDF'teki beta-adjusted Portfolio Heat mantığını mevcut görsel yapıyı bozmadan alta bağla.
  host.appendChild(buildRuxPortfolioHeatPanel());
}

function buildRuxPortfolioHeatPanel() {
  const heat = makeRuxPortfolioHeatSnapshot();
  const heatClass = heat.totalHeat >= 2.25 ? 'neg' : heat.totalHeat >= 1.5 ? 'warn' : 'pos';
  const wrap = el('div', { class: 'card rux-compact-card section' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx PORTFÖY ISI MOTORU'),
    el('span', { class: 'tag ' + (heatClass === 'pos' ? 'green' : heatClass === 'warn' ? 'yellow' : 'red') }, heat.label)
  ));

  const summary = el('div', { class: 'rux-compact-grid' },
    ruxRiskMetric('Beta Ayarlı Isı', heat.totalHeat.toFixed(2), 'Σ risk x BTC beta', heatClass),
    ruxRiskMetric('Long Heat', heat.longHeat.toFixed(2), 'Aynı yön kripto riski', statusClass(100 - heat.longHeat * 30)),
    ruxRiskMetric('Short Heat', heat.shortHeat.toFixed(2), 'Ters yön dengeleme', 'cyan'),
    ruxRiskMetric('USDT.D', '%' + heat.usdtDominance.toFixed(2), heat.riskOff ? 'Altcoin long azalt' : 'Normal', heat.riskOff ? 'warn' : 'pos'),
    ruxRiskMetric('Aksiyon', heat.action, 'Manuel risk kontrolü', heatClass),
    ruxRiskMetric('Emir Modu', 'Kapalı', 'Sadece karar destek', 'cyan')
  );

  const tbl = el('table', { class: 'tbl tbl-compact mt-10' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'VARLIK'), el('th', {}, 'YÖN'), el('th', { class: 'r' }, 'RİSK %'),
    el('th', { class: 'r' }, 'BTC BETA'), el('th', { class: 'r' }, 'ISI'), el('th', {}, 'DURUM')
  )));
  const tb = el('tbody', {});
  heat.rows.forEach((r) => tb.appendChild(el('tr', {},
    el('td', { class: 'bold small' }, String(r.symbol || '').replace('USDT','')),
    el('td', { class: String(r.direction || '').includes('SHORT') ? 'neg small' : 'pos small' }, r.direction),
    el('td', { class: 'r mono' }, r.riskPct.toFixed(2)),
    el('td', { class: 'r mono' }, r.beta.toFixed(2)),
    el('td', { class: 'r mono ' + (r.adjustedHeat >= 0.65 ? 'warn bold' : '') }, r.adjustedHeat.toFixed(3)),
    el('td', { class: 'small ' + (r.riskOffAdjusted ? 'warn' : 'muted') }, r.riskOffAdjusted ? 'Risk-off azaltıldı' : 'Normal')
  )));
  tbl.appendChild(tb);

  wrap.appendChild(summary);
  wrap.appendChild(tbl);
  wrap.appendChild(el('div', { class: 'rux-compact-note muted' }, 'Hesap: Beta-adjusted Portfolio Heat = Σ(risk_i × beta_to_BTC). Aynı yönde çoklu long sinyaller tek kripto riski gibi değerlendirilir.'));
  return wrap;
}

function ruxRiskMetric(label, value, sub = '', klass = '') {
  return el('div', { class: 'rux-mini ' + klass },
    el('div', { class: 'rux-mini-label' }, label),
    el('div', { class: 'rux-mini-value' }, String(value ?? '—')),
    sub ? el('div', { class: 'tiny muted mt-2' }, sub) : null
  );
}
