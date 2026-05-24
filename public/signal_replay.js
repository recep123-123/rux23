/* RUx — Signal Replay & Trade Timeline Viewer UI */
import { el, State, fetchMarket } from './api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { ICN, statCard, card, pageHead, tag } from './components.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { canvasLineChart } from './charts.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { loadSignalJournal } from './rux_journal.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { makeSignalReplayReport } from './rux_signal_replay.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

function fmtR(n, d = 2) {
  const v = Number(n || 0);
  return (v >= 0 ? '+' : '') + v.toFixed(d) + 'R';
}
function fmtPct(n, d = 1) { return '%' + Number(n || 0).toFixed(d); }
function cls(n) { return Number(n || 0) >= 0 ? 'pos' : 'neg'; }
function tone(t = '') {
  const s = String(t).toLowerCase();
  if (s.includes('strong') || s.includes('confirmed') || s.includes('green')) return 'green';
  if (s.includes('failed') || s.includes('weak') || s.includes('red')) return 'red';
  if (s.includes('expired') || s.includes('watch') || s.includes('yellow')) return 'yellow';
  return 'gray';
}
function formatPrice(v) {
  const n = Number(v || 0);
  if (!Number.isFinite(n)) return '—';
  return n >= 1000 ? n.toLocaleString('en-US', { maximumFractionDigits: 0 }) : n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}
function formatTime(ms) {
  try { return new Date(ms).toLocaleString('tr-TR', { hour12:false, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch { return '—'; }
}
function kvRows(rows) {
  const box = el('div', {});
  rows.forEach(([k, v, c = '']) => box.appendChild(el('div', { class: 'kv' }, el('span', { class: 'k' }, k), el('span', { class: 'v mono ' + c }, v))));
  return box;
}
function replayTable(rows = [], onPick, selectedId) {
  const tbl = el('table', { class: 'tbl tbl-compact' });
  tbl.appendChild(el('thead', {}, el('tr', {},
    el('th', {}, 'Sinyal'), el('th', {}, 'Setup / Rejim'), el('th', { class:'r' }, 'Final R'), el('th', { class:'r' }, 'MFE / MAE'), el('th', {}, 'Durum'), el('th', { class:'r' }, 'Seç')
  )));
  const tb = el('tbody', {});
  rows.forEach(r => tb.appendChild(el('tr', { class: String(r.id) === String(selectedId) ? 'is-selected' : '' },
    el('td', {}, el('div', { class:'bold' }, `${r.symbol} ${r.direction}`), el('div', { class:'tiny muted mono' }, r.id)),
    el('td', {}, el('div', {}, r.setup || '—'), el('div', { class:'tiny muted' }, r.regime || '—')),
    el('td', { class:'r mono ' + cls(r.finalR) }, fmtR(r.finalR)),
    el('td', { class:'r mono' }, el('span', { class:'pos' }, fmtR(r.mfe)), ' / ', el('span', { class:'neg' }, fmtR(r.mae))),
    el('td', {}, tag(r.verdict, tone(r.verdict))),
    el('td', { class:'r' }, el('button', { class:'btn tiny', on:{ click: () => onPick(r.id) } }, 'Replay'))
  )));
  tbl.appendChild(tb);
  return tbl;
}
function eventTimeline(events = []) {
  const wrap = el('div', { class:'rux-timeline' });
  events.forEach(ev => {
    wrap.appendChild(el('div', { class:'rux-timeline-row ' + (ev.tone || 'gray') },
      el('div', { class:'rux-timeline-dot' }),
      el('div', { class:'rux-timeline-body' },
        el('div', { class:'flex between gap-8' },
          el('div', { class:'bold' }, ev.label),
          el('div', { class:'mono small ' + (ev.r == null ? '' : cls(ev.r)) }, ev.r == null ? '—' : fmtR(ev.r))
        ),
        el('div', { class:'tiny muted' }, `${formatTime(ev.time)} · Bar ${ev.bar ?? 0} · Price ${formatPrice(ev.price)}`),
        el('div', { class:'small mt-4' }, ev.note || '—')
      )
    ));
  });
  return wrap;
}
function planBox(s = {}) {
  const levels = [
    ['Entry Zone', `${formatPrice(s.entryZoneLow)} – ${formatPrice(s.entryZoneHigh)}`],
    ['Preferred Entry', formatPrice(s.preferredEntry)],
    ['Stop Ref', formatPrice(s.stopReference)],
    ['TP1 / TP2 / TP3', `${formatPrice(s.tp1)} / ${formatPrice(s.tp2)} / ${formatPrice(s.tp3)}`],
    ['Do-Not-Chase', formatPrice(s.doNotChase)],
    ['Validity', `${s.validityBars || 24} bar`],
  ];
  return kvRows(levels);
}

export async function renderSignalReplay(host, params = {}) {
  host.innerHTML = '';
  const symbol = State.symbol || 'BTCUSDT';
  const tf = State.tf || '4h';
  let selectedId = params?.signal || '';

  const rerender = async (newId = selectedId) => {
    selectedId = newId;
    host.innerHTML = '';
    host.appendChild(pageHead({
      title: 'SIGNAL REPLAY & TRADE TIMELINE',
      subtitle: 'RUx v0.44: sinyal üretiminden entry, TP/SL, MFE/MAE, time-stop ve expiration sonucuna kadar teorik trade yolunu bar-by-bar gösterir.',
      actions: [
        el('div', { class:'select' }, symbol.replace('USDT','/USDT'), ' ', ICN.chev(10)),
        el('div', { class:'select' }, tf, ' ', ICN.chev(10)),
        el('button', { class:'btn primary', on:{ click: () => rerender(selectedId) } }, ICN.refresh(12), 'REPLAY YENİLE'),
      ]
    }));
    const loading = el('div', { class:'card section' }, el('div', { class:'card-title' }, 'RUx v0.44 replay motoru çalışıyor…'));
    host.appendChild(loading);
    let market = null;
    try { market = await fetchMarket(symbol, tf, 720); } catch (e) { market = { source:'market fetch failed', candles:[] }; }
    const journal = loadSignalJournal();
    const report = makeSignalReplayReport({ marketData: market, journalRows: journal, selectedSignalId: selectedId, symbol, tf });
    selectedId = report.selectedId;
    loading.remove();
    const s = report.summary;
    const ag = report.aggregate;

    const stats = el('div', { class:'stat-row cols-8 section' });
    stats.appendChild(statCard({ icon: ICN.play(18), iconColor:'cyan', label:'VERDICT', value:s.verdict, sub:s.finalStatus, subColor: tone(s.verdict) === 'red' ? 'neg' : tone(s.verdict) === 'green' ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.target(18), iconColor:'green', label:'ENTRY HIT', value:s.entryHit ? 'EVET' : 'HAYIR', sub:`Lead: ${s.leadBars ?? '—'} bar`, subColor:s.entryHit ? 'pos' : 'warn' }));
    stats.appendChild(statCard({ icon: ICN.trend(18), iconColor:'green', label:'FINAL R', value:fmtR(s.finalR), sub:s.firstOutcome, subColor:cls(s.finalR) }));
    stats.appendChild(statCard({ icon: ICN.rocket(18), iconColor:'green', label:'MFE', value:fmtR(s.mfe), sub:'Maksimum olumlu R', subColor:'pos' }));
    stats.appendChild(statCard({ icon: ICN.warning(18), iconColor:'red', label:'MAE', value:fmtR(s.mae), sub:'Maksimum olumsuz R', subColor:'neg' }));
    stats.appendChild(statCard({ icon: ICN.pulse(18), iconColor:'cyan', label:'FRESHNESS', value:String(Math.round(s.freshness)), sub:'Signal decay skoru', subColor:s.freshness >= 70 ? 'pos' : s.freshness >= 40 ? 'warn' : 'neg' }));
    stats.appendChild(statCard({ icon: ICN.shieldcheck(18), iconColor:'blue', label:'REPLAY QUALITY', value:String(Math.round(s.replayQuality)), sub:`Events: ${s.eventCounts.total}`, subColor:s.replayQuality >= 70 ? 'pos' : s.replayQuality >= 45 ? 'warn' : 'neg' }));
    stats.appendChild(statCard({ icon: ICN.bars(18), iconColor:'purple', label:'ENTRY HIT RATE', value:fmtPct(ag.entryHitRate), sub:`${ag.sampleCount} sinyal örneği`, subColor:ag.entryHitRate >= 60 ? 'pos' : 'warn' }));
    host.appendChild(stats);

    host.appendChild(el('div', { class:'rux-compact-note section' }, report.note));

    const row = el('div', { class:'row fr-2-1 section' });
    const chartCard = el('div', { class:'card' });
    chartCard.appendChild(el('div', { class:'card-head' },
      el('div', { class:'card-title' }, 'REPLAY R PATH'),
      el('div', { class:'flex gap-6' }, tag(report.source || 'OHLCV', 'cyan'), tag(report.selected.direction, report.selected.direction === 'LONG' ? 'green' : 'red'), tag(report.selected.setup || 'setup', 'gray'))
    ));
    const chartHost = el('div', { class:'chart-host tall mt-6' });
    chartCard.appendChild(chartHost);
    row.appendChild(chartCard);
    row.appendChild(card({ title:'SİNYAL PLANI', body: el('div', {},
      el('div', { class:'flex gap-6 mb-8' }, tag(report.selected.signalLevel || 'VALID SIGNAL', 'cyan'), tag(report.selected.regime || 'Regime', 'gray')),
      planBox(report.selected)
    ) }));
    host.appendChild(row);

    setTimeout(() => {
      const values = report.replayPath.map(x => Number(x.r || 0));
      const eventPts = report.events.map(e => ({ x:e.bar || 0, y:e.r || 0 }));
      canvasLineChart(chartHost, [
        { values, color:'#22d3ee', width:2.5, fill:true },
        { values: values.map(()=>0), color:'#475569', width:1 },
        { values: values.map(()=>1), color:'#10b981', width:1 },
        { values: values.map(()=>-1), color:'#ef4444', width:1 },
      ], { points:eventPts });
    }, 60);

    const row2 = el('div', { class:'row cols-2 section' });
    row2.appendChild(card({ title:'TRADE TIMELINE', body:eventTimeline(report.events) }));
    row2.appendChild(card({ title:'REPLAY METRİKLERİ', body:kvRows([
      ['First Outcome', s.firstOutcome],
      ['Final Status', s.finalStatus],
      ['Fill Price', formatPrice(s.fillPrice)],
      ['Risk / 1R', formatPrice(s.risk)],
      ['Lead Time', s.leadMinutes == null ? '—' : `${s.leadMinutes} dk`],
      ['TP Progress', `${s.tpProgress.tp1 ? 'TP1✓' : 'TP1—'} / ${s.tpProgress.tp2 ? 'TP2✓' : 'TP2—'} / ${s.tpProgress.tp3 ? 'TP3✓' : 'TP3—'}`],
      ['Event Mix', `${s.eventCounts.favorable} olumlu · ${s.eventCounts.warning} uyarı · ${s.eventCounts.adverse} negatif`],
      ['Aggregate Avg R', fmtR(ag.avgFinalR), cls(ag.avgFinalR)],
      ['Aggregate Positive', fmtPct(ag.positiveRate), ag.positiveRate >= 50 ? 'pos' : 'warn'],
    ]) }));
    host.appendChild(row2);

    host.appendChild(card({ title:'REPLAY ADAY LİSTESİ', body:replayTable(report.collection, (id) => rerender(id), selectedId), klass:'section' }));

    const row3 = el('div', { class:'row cols-2 section' });
    row3.appendChild(card({ title:'DEBUG / AÇIKLAMA', body:el('div', {},
      el('p', { class:'muted' }, 'Bu ekran yanlış sinyal sonrası ilk bakılacak panellerden biridir: entry bölgesi görüldü mü, sinyal çok erken/geç mi geldi, önce TP mi stop mu çalıştı, MFE/MAE trade management için ne söylüyor?'),
      kvRows([
        ['Kaynak', report.source || '—'],
        ['Selected ID', report.selectedId],
        ['Data Confidence', String(report.selected.dataConfidence ?? '—')],
        ['Signal Score', String(report.selected.score ?? '—')],
        ['Confidence', String(report.selected.confidence ?? '—')],
      ])
    ) }));
    row3.appendChild(card({ title:'KARAR MOTORU ETKİSİ', body:el('div', {},
      el('p', { class:'muted' }, 'v0.44 ekranı izleme/debug katmanıdır; sinyal skorlarını otomatik değiştirmez. Sonraki sürümde Alert Quality + Signal Decay metriklerine girdi verebilir.'),
      el('div', { class:'rux-note ok mt-8' }, 'Otomatik emir yok. Otomatik pozisyon yönetimi yok. Sadece teorik sinyal yolunu ve uygulanabilirliği ölçer.')
    ) }));
    host.appendChild(row3);
  };

  await rerender(selectedId);
}
