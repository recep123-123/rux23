/* RUx — Signal Replay page + Storage Telemetry */
import { el, fmtTime, getRuxSourceLog } from './api.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { runDataSourceHealthCheck, loadLastDataSourceHealthReport, clearDataSourceHealthLog, makeDataHealthExport } from './rux_data_health.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';
import { storageStats, loadAudit, isPersistenceAvailable, clearAllStorage } from './rux_storage.js?v=0.75.15-heatmap-chart-fidelity-side-density-20260524';

function tone(score) {
  const s = Number(score || 0);
  return s >= 85 ? 'green' : s >= 70 ? 'cyan' : s >= 50 ? 'yellow' : 'red';
}
function statusClass(score, invert = false) {
  const s = Number(score || 0);
  if (invert) return s >= 70 ? 'neg' : s >= 45 ? 'warn' : 'pos';
  return s >= 80 ? 'pos' : s >= 60 ? 'warn' : 'neg';
}
function mini(label, value, sub, t = '') {
  return el('div', { class: 'rux-mini ' + t },
    el('div', { class: 'tiny muted' }, String(label || '').toUpperCase()),
    el('div', { class: 'rux-mini-value' }, value),
    el('div', { class: 'tiny muted mt-2' }, sub)
  );
}
function tag(text, t='cyan') { return el('span', { class: 'tag ' + t }, text); }
function kv(k,v,c='') { return el('div', { class:'kv' }, el('span',{class:'k'}, k), el('span',{class:'v mono '+c}, v)); }

export async function renderDataKaynakSagligi(host) {
  host.innerHTML = '';
  host.appendChild(el('div', { class:'page-head' },
    el('div', {},
      el('div', { class:'page-kicker' }, 'RUx v0.75.15-heatmap-chart-fidelity-side-density-20260524 — BINANCE LIVE DATA HEALTH'),
      el('h1', {}, 'Data Source Health / API Reliability'),
      el('p', { class:'muted' }, 'Canlı veri gelmediğinde sistemi durduran, fallback/proxy ayrımını gösteren ve sinyal güvenini veri kalitesine bağlayan kontrol paneli.')
    ),
    el('div', { class:'flex gap-8' },
      el('button', { class:'btn primary', 'data-run-health':'1' }, 'KAYNAKLARI TEST ET'),
      el('button', { class:'btn outline-yellow', 'data-force-health':'1' }, 'FORCE REFRESH'),
      el('button', { class:'btn outline-red', 'data-clear-health':'1' }, 'LOG TEMİZLE'),
      el('a', { class:'btn', href:'#/adapter-diagnostics' }, 'ADAPTER DIAGNOSTICS')
    )
  ));

  const note = el('div', { class:'rux-note warn section' },
    'Canlı veri gelmemesi geliştirmeyi durdurmaz. Bu panel tam tersine, veri yokken terminalin sessizce sinyal üretmesini engellemek için eklendi. Canlı veri doğrulaması yoksa sonuçlar araştırma/mock/fallback modu olarak etiketlenir.'
  );
  host.appendChild(note);

  const state = el('div', { class:'card section' },
    el('div', { class:'card-head' },
      el('div', { class:'card-title' }, 'GENEL VERİ GÜVENİ'),
      tag('Hazırlanıyor', 'cyan')
    ),
    el('div', { class:'rux-compact-grid', 'data-health-metrics':'1' },
      mini('Overall', '—', 'Test bekleniyor', 'cyan'),
      mini('Operational Mode', '—', 'Veri modu', 'yellow'),
      mini('Signal Multiplier', '—', 'Skor etkisi', 'purple'),
      mini('Critical Fail', '—', 'Hard block adayı', 'red'),
      mini('Optional Warn', '—', 'Skor ağırlığı düşer', 'yellow'),
      mini('Fallback', '—', 'Proxy/fallback kullanımı', 'cyan')
    ),
    el('div', { class:'small muted mt-12', 'data-health-reco':'1' }, 'Kaynak testi çalışınca deployment ve sinyal önerisi burada görünecek.')
  );
  host.appendChild(state);

  const row = el('div', { class:'row fr-2-1 section' });
  const tableCard = el('div', { class:'card' },
    el('div', { class:'card-head' }, el('div', { class:'card-title' }, 'KAYNAK TEST MATRİSİ'), tag('endpoint bazlı', 'cyan')),
    el('div', { class:'tbl-wrap', 'data-health-table':'1' }, emptyTable())
  );
  const gateCard = el('div', { class:'card' },
    el('div', { class:'card-head' }, el('div', { class:'card-title' }, 'SIGNAL GATE'), tag('data → karar', 'yellow')),
    el('div', { 'data-health-gates':'1' }, gatePlaceholder())
  );
  row.appendChild(tableCard); row.appendChild(gateCard); host.appendChild(row);

  const row2 = el('div', { class:'row fr-1-1 section' });
  row2.appendChild(el('div', { class:'card' },
    el('div', { class:'card-head' }, el('div', { class:'card-title' }, 'KATEGORİ SKORLARI'), tag('confidence', 'cyan')),
    el('div', { class:'rux-compact-grid', 'data-health-cats':'1' }, mini('OHLCV','—','mum/fiyat','cyan'))
  ));
  row2.appendChild(el('div', { class:'card' },
    el('div', { class:'card-head' }, el('div', { class:'card-title' }, 'SON KAYNAK LOGU'), tag('runtime', 'purple')),
    el('div', { class:'rux-log-list', 'data-health-log':'1' }, el('div', { class:'small muted' }, 'Henüz kaynak testi çalışmadı.'))
  ));
  host.appendChild(row2);

  // ── Kalıcı Arşiv + Fallback Telemetrisi (Sprint 2) ──
  const telemetryCard = el('div', { class:'card section' },
    el('div', { class:'card-head' },
      el('div', { class:'card-title' }, 'KALICI ARŞİV & FALLBACK TELEMETRİSİ'),
      el('div', { class:'flex gap-8' },
        tag('IndexedDB', 'purple'),
        el('button', { class:'btn tiny outline-red', 'data-clear-storage':'1' }, 'ARŞİVİ TEMİZLE')
      )
    ),
    el('div', { class:'rux-compact-grid', 'data-storage-metrics':'1' },
      mini('Depo Modu', '—', 'kalıcılık', 'cyan'),
      mini('Sinyal', '—', 'arşiv', 'cyan'),
      mini('Outcome', '—', 'çözülmüş', 'green'),
      mini('Kapsama', '—', 'OOS oranı', 'purple'),
      mini('Fallback', '—', 'son 40 çağrı', 'yellow'),
      mini('Ort. Latency', '—', 'son 40 çağrı', 'cyan')
    ),
    el('div', { class:'small muted mt-12', 'data-storage-note':'1' }, 'Üretilen her sinyal ve sonradan oluşan sonucu burada toplanır; gerçek out-of-sample veri tabanı oluşur.')
  );
  host.appendChild(telemetryCard);

  // Telemetriyi doldur
  (async () => {
    try {
      const stats = await storageStats();
      const log = (typeof getRuxSourceLog === 'function' ? getRuxSourceLog(40) : []) || [];
      const fallbackCount = log.filter(r => /fallback|proxy|partial|degraded/i.test(JSON.stringify(r))).length;
      const fallbackRatio = log.length ? Math.round((fallbackCount / log.length) * 100) : 0;
      const latencies = log.map(r => Number(r.latencyMs || r.ms || 0)).filter(Number.isFinite);
      const avgLatency = latencies.length ? Math.round(latencies.reduce((a,b)=>a+b,0)/latencies.length) : 0;
      const grid = telemetryCard.querySelector('[data-storage-metrics]');
      if (grid) {
        grid.innerHTML = '';
        grid.appendChild(mini('Depo Modu', stats.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage', isPersistenceAvailable() ? 'kalıcı' : 'yedek', isPersistenceAvailable() ? 'green' : 'yellow'));
        grid.appendChild(mini('Sinyal', String(stats.signals), 'arşivlenmiş', 'cyan'));
        grid.appendChild(mini('Outcome', String(stats.outcomes), 'çözülmüş', 'green'));
        grid.appendChild(mini('Kapsama', '%' + stats.coveragePct, 'sinyal→sonuç', stats.coveragePct >= 60 ? 'green' : stats.coveragePct >= 30 ? 'yellow' : 'red'));
        grid.appendChild(mini('Fallback', '%' + fallbackRatio, fallbackCount + '/' + log.length + ' çağrı', fallbackRatio > 25 ? 'red' : fallbackRatio > 10 ? 'yellow' : 'green'));
        grid.appendChild(mini('Ort. Latency', avgLatency + ' ms', 'son ' + log.length + ' çağrı', avgLatency > 800 ? 'red' : avgLatency > 350 ? 'yellow' : 'green'));
      }
      const noteEl = telemetryCard.querySelector('[data-storage-note]');
      if (noteEl) {
        const span = stats.oldest ? `${new Date(stats.oldest).toLocaleDateString('tr-TR')} → ${new Date(stats.newest).toLocaleDateString('tr-TR')}` : 'henüz veri yok';
        noteEl.textContent = `Arşiv aralığı: ${span}. Kapsama %60'ı geçtiğinde Edge Kalibrasyon paneli gerçek veriyle çalışabilir.`;
      }
    } catch (e) {
      const noteEl = telemetryCard.querySelector('[data-storage-note]');
      if (noteEl) noteEl.textContent = 'Telemetri okunamadı: ' + String(e?.message || e);
    }
  })();

  // Arşivi temizle butonu
  telemetryCard.querySelector('[data-clear-storage]')?.addEventListener('click', async () => {
    if (!confirm('Tüm kalıcı sinyal/outcome arşivi silinecek. Emin misiniz?')) return;
    await clearAllStorage();
    renderDataKaynakSagligi(host);
  });

  const exportCard = el('div', { class:'card section' },
    el('div', { class:'card-head' },
      el('div', { class:'card-title' }, 'JSON EXPORT / DEBUG PAYLOAD'),
      el('button', { class:'btn tiny outline-yellow', 'data-copy-health':'1' }, 'KOPYALA')
    ),
    el('pre', { class:'mono small', style:'white-space:pre-wrap; max-height:240px; overflow:auto; padding:12px; border:1px solid var(--bd-1); border-radius:12px; background:rgba(0,0,0,.18);', 'data-health-json':'1' }, '{}')
  );
  host.appendChild(exportCard);

  const renderPayload = (payload) => renderHealthPayload(host, payload);
  const cached = loadLastDataSourceHealthReport();
  if (cached) renderPayload(cached);

  host.querySelector('[data-run-health]')?.addEventListener('click', async () => renderPayload(await guardedRun(host, false)));
  host.querySelector('[data-force-health]')?.addEventListener('click', async () => renderPayload(await guardedRun(host, true)));
  host.querySelector('[data-clear-health]')?.addEventListener('click', () => { clearDataSourceHealthLog(); renderHealthPayload(host, null); });
  host.querySelector('[data-copy-health]')?.addEventListener('click', async () => {
    const txt = host.querySelector('[data-health-json]')?.textContent || '{}';
    try { await navigator.clipboard.writeText(txt); toast(host, 'JSON kopyalandı'); } catch { toast(host, 'Kopyalama izni yok; metni elle seçebilirsin.'); }
  });

  // İlk açılışta panel gerçek durumu göstersin. Hata olursa boş kalmaz.
  setTimeout(async () => {
    if (!loadLastDataSourceHealthReport()) renderPayload(await guardedRun(host, false));
  }, 80);
}

async function guardedRun(host, force) {
  const headTag = host.querySelector('.card .card-head .tag');
  if (headTag) { headTag.textContent = force ? 'Force refresh çalışıyor…' : 'Kaynaklar test ediliyor…'; headTag.className = 'tag yellow'; }
  try { return await runDataSourceHealthCheck({ force }); }
  catch (err) {
    const payload = {
      version: 'RUx v0.75.15-heatmap-chart-fidelity-side-density-20260524', checkedAt: new Date().toISOString(), durationMs: 0,
      report: { overall: 0, label: 'SİNYALİ BLOKE ET', categories:{}, rows:[] },
      gates: { mode:'DATA HEALTH TEST FAILED', deployment:'REJECT / FIX DATA', signalConfidenceMultiplier:0, criticalFailures:[{name:'Health Runner', error:err?.message||String(err)}], optionalFailures:[], fallbackRows:[], recommendation:'Kaynak testi çalışmadı; yeni sinyal üretme.' },
      sourceLog: []
    };
    return payload;
  }
}

function renderHealthPayload(host, payload) {
  const metrics = host.querySelector('[data-health-metrics]');
  const reco = host.querySelector('[data-health-reco]');
  const table = host.querySelector('[data-health-table]');
  const gates = host.querySelector('[data-health-gates]');
  const cats = host.querySelector('[data-health-cats]');
  const log = host.querySelector('[data-health-log]');
  const json = host.querySelector('[data-health-json]');
  const headTag = host.querySelector('.card .card-head .tag');

  if (!payload) {
    if (metrics) metrics.innerHTML = [mini('Overall','—','Test bekleniyor','cyan'), mini('Mode','—','Veri modu','yellow')].map(x=>x.outerHTML).join('');
    if (table) { table.innerHTML=''; table.appendChild(emptyTable()); }
    if (gates) { gates.innerHTML=''; gates.appendChild(gatePlaceholder()); }
    if (cats) cats.innerHTML = '';
    if (log) log.innerHTML = '<div class="small muted">Log temizlendi.</div>';
    if (json) json.textContent = '{}';
    if (headTag) { headTag.textContent = 'Temiz'; headTag.className='tag cyan'; }
    return;
  }

  const report = payload.report || {};
  const gate = payload.gates || {};
  const rows = report.rows || [];
  if (headTag) { headTag.textContent = `${report.label || '—'} · ${Math.round(report.overall || 0)}/100`; headTag.className = 'tag ' + tone(report.overall); }
  if (metrics) {
    metrics.innerHTML = '';
    metrics.appendChild(mini('Overall Data Confidence', Math.round(report.overall || 0) + '/100', report.label || '—', tone(report.overall)));
    metrics.appendChild(mini('Operational Mode', gate.mode || '—', gate.deployment || '—', gate.freezeNewSignals ? 'red' : gate.lowConfidence ? 'yellow' : 'green'));
    metrics.appendChild(mini('Signal Multiplier', Number(gate.signalConfidenceMultiplier ?? 0).toFixed(2) + 'x', 'Karar skoruna veri etkisi', gate.signalConfidenceMultiplier >= .9 ? 'green' : gate.signalConfidenceMultiplier > 0 ? 'yellow' : 'red'));
    metrics.appendChild(mini('Critical Fail', String((gate.criticalFailures || []).length), 'Hard block adayı', (gate.criticalFailures || []).length ? 'red' : 'green'));
    metrics.appendChild(mini('Optional Warn', String((gate.optionalFailures || []).length), 'Karara bağlanmazsa güvenli', (gate.optionalFailures || []).length ? 'yellow' : 'green'));
    metrics.appendChild(mini('Fallback / Proxy', String((gate.fallbackRows || []).length), 'Canlı/fallback ayrımı', (gate.fallbackRows || []).length ? 'yellow' : 'green'));
    metrics.appendChild(mini('Latency Warn', String((gate.slowCritical || []).length), 'Kritik kaynak gecikmesi', (gate.slowCritical || []).length ? 'yellow' : 'green'));
    metrics.appendChild(mini('Check Time', fmtTime(payload.checkedAt), `${payload.durationMs || 0}ms`, 'cyan'));
  }
  if (reco) reco.textContent = gate.recommendation || '—';
  if (table) { table.innerHTML=''; table.appendChild(sourceTable(rows)); }
  if (gates) { gates.innerHTML=''; gates.appendChild(gateList(payload)); }
  if (cats) { cats.innerHTML=''; cats.appendChild(categoryGrid(report.categories || {})); }
  if (log) { log.innerHTML=''; log.appendChild(logList(payload.sourceLog || [])); }
  if (json) json.textContent = makeDataHealthExport(payload);
}

function emptyTable() {
  const tbl = el('table', { class:'tbl' });
  tbl.appendChild(el('tbody', {}, el('tr', {}, el('td', { class:'small muted' }, 'Test çalışınca endpoint matrisi burada görünecek.'))));
  return tbl;
}

function sourceTable(rows) {
  const tbl = el('table', { class:'tbl' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'KAYNAK'), el('th', {}, 'KATMAN'), el('th', {}, 'DURUM'),
    el('th', { class:'r' }, 'SKOR'), el('th', { class:'r' }, 'GECİKME'), el('th', { class:'r' }, 'ADET'), el('th', {}, 'ETKİ / NOT')
  )));
  const tb = el('tbody', {});
  rows.forEach(r => {
    const ok = Boolean(r.ok); const optional = Boolean(r.optional); const score = Number(r.score || 0);
    const t = ok ? (r.fallback ? 'yellow' : 'green') : optional ? 'yellow' : 'red';
    const st = ok ? (r.fallback ? 'FALLBACK' : 'OK') : optional ? 'OPSİYONEL' : 'KRİTİK';
    tb.appendChild(el('tr', {},
      el('td', {}, el('div', { class:'small bold' }, r.name || '—'), el('div', { class:'tiny muted mono' }, r.path || '—')),
      el('td', {}, tag(r.categoryLabel || r.category || 'SİSTEM', 'cyan')),
      el('td', {}, tag(st, t)),
      el('td', { class:'r mono bold ' + statusClass(score) }, Math.round(score) + '/100'),
      el('td', { class:'r mono' }, Number.isFinite(Number(r.latencyMs)) ? Math.round(r.latencyMs) + 'ms' : '—'),
      el('td', { class:'r mono' }, r.count == null ? '—' : String(r.count)),
      el('td', { class:'small muted' }, `${r.impact || '—'} · ${r.note || r.error || r.source || '—'}`)
    ));
  });
  if (!rows.length) tb.appendChild(el('tr', {}, el('td', { colspan:7, class:'small muted' }, 'Kayıt yok.')));
  tbl.appendChild(tb); return tbl;
}

function gatePlaceholder() {
  const box = el('div', {});
  box.appendChild(kv('85+', 'Normal sinyal', 'pos'));
  box.appendChild(kv('70-84', 'Sinyal + veri etiketi', 'warn'));
  box.appendChild(kv('50-69', 'Watch only / confidence düşür', 'warn'));
  box.appendChild(kv('<50', 'Yeni sinyal dondur', 'neg'));
  return box;
}

function gateList(payload) {
  const gate = payload.gates || {}; const report = payload.report || {};
  const box = el('div', {});
  box.appendChild(kv('Karar', gate.deployment || '—', gate.freezeNewSignals ? 'neg' : gate.lowConfidence ? 'warn' : 'pos'));
  box.appendChild(kv('Mode', gate.mode || '—', gate.freezeNewSignals ? 'neg' : gate.lowConfidence ? 'warn' : 'pos'));
  box.appendChild(kv('Data Gate', gate.gate?.label || report.label || '—', tone(report.overall)));
  box.appendChild(kv('Skor Etkisi', Number(gate.signalConfidenceMultiplier ?? 0).toFixed(2) + 'x', gate.signalConfidenceMultiplier >= .9 ? 'pos' : gate.signalConfidenceMultiplier > 0 ? 'warn' : 'neg'));
  box.appendChild(el('div', { class:'rux-note mt-12 ' + (gate.freezeNewSignals ? 'bad' : gate.lowConfidence ? 'warn' : 'ok') }, gate.recommendation || '—'));
  const issues = [...(gate.criticalFailures || []), ...(gate.optionalFailures || [])];
  if (issues.length) {
    box.appendChild(el('div', { class:'small bold mt-12' }, 'Sorunlu Kaynaklar'));
    issues.slice(0,8).forEach(x => box.appendChild(el('div', { class:'tiny muted mt-6' }, `• ${x.name || x.path}: ${x.error || 'yanıt yok'}`)));
  }
  return box;
}

function categoryGrid(cats) {
  const wrap = el('div', { class:'rux-compact-grid' });
  const labels = [
    ['ohlcv','OHLCV','Mum/fiyat'], ['funding','Funding','Perp funding'], ['openInterest','Open Interest','OI/futures'],
    ['news','Haber','Event/news'], ['metadata','Metadata','CMC/Coin'], ['onchain','On-chain','Dune/DefiLlama'],
    ['sentiment','Sentiment','Fear & Greed'], ['crossExchange','Cross-Exchange','Spot/perp']
  ];
  labels.forEach(([k,l,s]) => wrap.appendChild(mini(l, Math.round(Number(cats[k] ?? 0)) + '/100', s, tone(cats[k]))));
  return wrap;
}

function logList(logs) {
  const box = el('div', {});
  if (!logs.length) return el('div', { class:'small muted' }, 'Henüz log yok.');
  logs.slice(0,14).forEach(l => box.appendChild(el('div', { class:'rux-log-row ' + (l.ok ? 'ok' : 'bad') },
    el('div', { class:'flex between gap-8' }, el('span', { class:'small bold mono' }, l.category || 'system'), el('span', { class:'tiny muted mono' }, fmtTime(l.time || Date.now()))),
    el('div', { class:'tiny muted mono' }, String(l.path || '').replace('/api/', '')),
    el('div', { class:'tiny ' + (l.ok ? 'pos' : 'neg') }, l.ok ? `OK · ${l.latencyMs ?? '—'}ms · ${l.source || '—'}` : `HATA · ${l.error || 'Yanıt yok'}`)
  )));
  return box;
}

function toast(host, text) {
  const t = el('div', { class:'toast' }, text);
  (document.getElementById('om-toast-host') || host).appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
