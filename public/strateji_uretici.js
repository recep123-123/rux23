/* RUx — Strateji Üreticisi / Rule Builder */
import { el } from './api.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { ICN, statCard, card, pageHead, checklist, tag } from './components.js?v=0.75.6-liquidation-compact-trusted-20260524';
import {
  RULE_TEMPLATES,
  addRuleSet,
  updateRuleSet,
  activateRuleSet,
  deleteRuleSet,
  buildRuleBuilderReport,
  exportRuleSetsBlob,
  importRuleSetsJson
} from './rux_rulebuilder.js?v=0.75.6-liquidation-compact-trusted-20260524';

function fmt(n, d=0) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d) : '—';
}

function metricCell(label, value, tone = '') {
  return el('div', { class: 'rux-rule-metric ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, value)
  );
}

function buildRuleSetCard(rule, refresh) {
  const m = rule.metrics || {};
  const statusTone = rule.active ? 'green' : (String(rule.status).includes('Shadow') ? 'yellow' : 'gray');
  const wrap = el('div', { class: 'rux-rule-card ' + (rule.active ? 'active' : '') });

  wrap.appendChild(el('div', { class: 'flex between gap-10' },
    el('div', {},
      el('div', { class: 'bold' }, rule.name),
      el('div', { class: 'small muted mt-2' }, `${rule.setup} · ${rule.regime} · ${rule.direction}`)
    ),
    tag(rule.active ? 'AKTİF' : rule.status, statusTone)
  ));

  wrap.appendChild(el('div', { class: 'row cols-4 mt-10' },
    metricCell('STABİLİTE', fmt(m.stability) + '/100', m.stability >= 80 ? 'pos' : m.stability >= 65 ? 'warn' : 'neg'),
    metricCell('EXP.', (m.expectancy >= 0 ? '+' : '') + fmt(m.expectancy, 3) + 'R', m.expectancy > 0 ? 'pos' : 'neg'),
    metricCell('PF', fmt(m.pf, 2), m.pf >= 1.35 ? 'pos' : 'warn'),
    metricCell('MAX DD', fmt(m.maxDD, 1) + 'R', 'warn')
  ));

  const condList = (rule.conditions || []).slice(0, 5).map(c => ({
    state: c.required ? 'ok' : 'warn',
    label: c.label,
    right: el('span', { class: 'mono' }, `${c.weight}`)
  }));
  wrap.appendChild(el('div', { class: 'mt-10' }, checklist(condList)));

  wrap.appendChild(el('div', { class: 'small muted mt-10' }, m.verdict || ''));

  const actions = el('div', { class: 'flex gap-8 mt-10 wrap' },
    el('button', { class: 'btn tiny primary', on: { click: () => { activateRuleSet(rule.id); refresh(); } } }, 'AKTİF YAP'),
    el('button', { class: 'btn tiny', on: { click: () => { updateRuleSet(rule.id, { status: 'Shadow Test' }); refresh(); } } }, 'SHADOW TEST'),
    el('button', { class: 'btn tiny outline-yellow', on: { click: () => { updateRuleSet(rule.id, { status: 'Revizyon Bekliyor' }); refresh(); } } }, 'REVİZYON'),
    el('button', { class: 'btn tiny danger', on: { click: () => { deleteRuleSet(rule.id); refresh(); } } }, 'SİL')
  );
  wrap.appendChild(actions);
  return wrap;
}

function buildTemplateBuilder(refresh) {
  const templateSelect = el('select', { class: 'input' },
    ...Object.entries(RULE_TEMPLATES).map(([key, t]) => el('option', { value: key }, t.name))
  );
  const nameInput = el('input', { class: 'input', value: RULE_TEMPLATES.trendPullback.name + ' Custom' });
  const minFinal = el('input', { class: 'input', type: 'number', value: '76', min: '50', max: '95' });
  const minRR = el('input', { class: 'input', type: 'number', value: '2.0', step: '0.1', min: '1', max: '5' });
  const minData = el('input', { class: 'input', type: 'number', value: '72', min: '40', max: '100' });
  const maxNoTrade = el('input', { class: 'input', type: 'number', value: '55', min: '10', max: '90' });

  templateSelect.addEventListener('change', () => {
    const t = RULE_TEMPLATES[templateSelect.value];
    nameInput.value = t.name + ' Custom';
    minFinal.value = t.thresholds.minFinal;
    minRR.value = t.thresholds.minRR;
    minData.value = t.thresholds.minDataConfidence;
    maxNoTrade.value = t.thresholds.maxNoTrade;
  });

  return card({
    title: 'YENİ STRATEJİ / KURAL SETİ ÜRET',
    info: 'Bu alan otomatik emir üretmez; manuel sinyal ve backtest kural seti oluşturur.',
    body: el('div', {},
      el('div', { class: 'row cols-2' },
        el('label', { class: 'field' }, el('span', {}, 'Şablon'), templateSelect),
        el('label', { class: 'field' }, el('span', {}, 'Kural seti adı'), nameInput)
      ),
      el('div', { class: 'row cols-4 mt-10' },
        el('label', { class: 'field' }, el('span', {}, 'Min final skor'), minFinal),
        el('label', { class: 'field' }, el('span', {}, 'Min RR'), minRR),
        el('label', { class: 'field' }, el('span', {}, 'Min veri güveni'), minData),
        el('label', { class: 'field' }, el('span', {}, 'Max no-trade'), maxNoTrade)
      ),
      el('div', { class: 'rux-note mt-10' },
        el('b', {}, 'Kural: '),
        'Hard block kuralları optimizer tarafından gevşetilmez. Bu builder sadece test edilebilir kural seti üretir.'
      ),
      el('div', { class: 'flex gap-8 mt-12' },
        el('button', { class: 'btn primary', on: { click: () => {
          const key = templateSelect.value;
          addRuleSet(key, {
            name: nameInput.value || RULE_TEMPLATES[key].name,
            thresholds: {
              ...RULE_TEMPLATES[key].thresholds,
              minFinal: Number(minFinal.value),
              minRR: Number(minRR.value),
              minDataConfidence: Number(minData.value),
              maxNoTrade: Number(maxNoTrade.value)
            }
          });
          refresh();
        }}}, ICN.plus(13), 'KURAL SETİ OLUŞTUR'),
        el('a', { class: 'btn', href: '#/kural-setleri' }, ICN.list(13), 'KURAL SETLERİNİ AÇ')
      )
    )
  });
}

function buildImportExport(refresh) {
  const ta = el('textarea', { class: 'input', rows: 6, placeholder: 'JSON kural setini buraya yapıştır...' });
  return card({
    title: 'İÇE / DIŞA AKTAR',
    body: el('div', {},
      ta,
      el('div', { class: 'flex gap-8 mt-10 wrap' },
        el('button', { class: 'btn', on: { click: () => {
          const blob = new Blob([exportRuleSetsBlob()], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = el('a', { href: url, download: 'rux-rule-sets.json' });
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 500);
        }}}, ICN.download(13), 'DIŞA AKTAR'),
        el('button', { class: 'btn outline-yellow', on: { click: () => {
          try { importRuleSetsJson(ta.value); refresh(); }
          catch (e) { alert('İçe aktarım hatası: ' + (e.message || e)); }
        }}}, ICN.copy(13), 'İÇE AKTAR')
      )
    )
  });
}

export async function renderStratejiUretici(host) {
  function refresh() { renderStratejiUretici(host); }
  const report = buildRuleBuilderReport();
  host.innerHTML = '';

  host.appendChild(pageHead({
    title: 'STRATEJİ ÜRETİCİSİ',
    subtitle: 'Setup, eşik, ağırlık ve hard block kurallarını ölçülebilir kural setine çevirir.',
    actions: [
      el('a', { class: 'btn', href: '#/backtest' }, ICN.bars(13), 'BACKTESTE GİT'),
      el('a', { class: 'btn', href: '#/optimizer' }, ICN.cpu(13), 'OPTİMİZER'),
      el('button', { class: 'btn primary', on: { click: () => { addRuleSet('sweepReversal'); refresh(); } } }, ICN.plus(13), 'HIZLI SET EKLE')
    ]
  }));

  const stats = el('div', { class: 'stat-row cols-6 section' });
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: 'cyan', label: 'KURAL SETİ', value: String(report.total), sub: 'local builder' }));
  stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor: 'green', label: 'ORT. STABİLİTE', value: report.avgStability + '/100', sub: 'overfit kontrol' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: 'ORT. EXPECTANCY', value: (report.avgExpectancy >= 0 ? '+' : '') + report.avgExpectancy + 'R', sub: 'tahmini' }));
  stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor: 'yellow', label: 'SHADOW SET', value: String(report.shadowCount), sub: 'izlemede' }));
  stats.appendChild(statCard({ icon: ICN.check(18), iconColor: 'green', label: 'AKTİF SET', value: report.active?.name || '—', sub: 'manuel sinyal' }));
  stats.appendChild(statCard({ icon: ICN.warning(18), iconColor: 'red', label: 'EMİR MODU', value: 'KAPALI', sub: 'otomatik emir yok' }));
  host.appendChild(stats);

  host.appendChild(el('div', { class: 'row fr-1-1 section' },
    buildTemplateBuilder(refresh),
    card({
      title: 'EN GÜÇLÜ ADAY',
      body: report.best ? el('div', {},
        el('div', { class: 'bold' }, report.best.name),
        el('div', { class: 'small muted mt-4' }, `${report.best.setup} · ${report.best.regime}`),
        el('div', { class: 'row cols-2 mt-12' },
          metricCell('Stabilite', fmt(report.best.metrics.stability) + '/100', 'pos'),
          metricCell('Expectancy', (report.best.metrics.expectancy >= 0 ? '+' : '') + fmt(report.best.metrics.expectancy, 3) + 'R', 'pos')
        ),
        el('div', { class: 'rux-note mt-10' }, report.best.metrics.verdict),
        el('button', { class: 'btn primary mt-10', on: { click: () => { activateRuleSet(report.best.id); refresh(); } } }, 'BU SETİ AKTİF YAP')
      ) : el('div', { class: 'muted' }, 'Henüz set yok.')
    })
  ));

  const grid = el('div', { class: 'rux-rule-grid section' });
  report.sets.forEach(s => grid.appendChild(buildRuleSetCard(s, refresh)));
  host.appendChild(card({ title: 'KURAL SETİ ADAYLARI', body: grid }));

  host.appendChild(el('div', { class: 'row cols-2 section' },
    buildImportExport(refresh),
    card({
      title: 'RULE BUILDER NOTLARI',
      body: el('div', {},
        checklist([
          { state: 'ok', label: 'Her kural seti backtest/forward-test ile ölçülmelidir.' },
          { state: 'ok', label: 'No-Trade hard block kuralları optimizasyonla gevşetilmez.' },
          { state: 'warn', label: 'Ağırlık toplamı 100’den uzaklaşırsa stabilite cezası uygulanır.' },
          { state: 'warn', label: 'Bu modül otomatik emir açmaz; manuel karar destek içindir.' }
        ])
      )
    })
  ));
}
