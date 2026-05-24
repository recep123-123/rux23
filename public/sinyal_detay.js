/* RUx — Sinyal Detay Live Retrofit */
import { State, fetchMarket, el, fmtPct, fmtPrice, coinName, toast } from './api.js?v=0.75.7-liquidation-source-health-20260524';
import { ICN, card, pageHead, ringGauge, checklist, barbar } from './components.js?v=0.75.7-liquidation-source-health-20260524';
import { makeCandleChart, addEmaLine, normalizeCandleInput } from './charts.js?v=0.75.7-liquidation-source-health-20260524';
import { analyzeLiveMarketSignal, statusClass } from './rux_core.js?v=0.75.7-liquidation-source-health-20260524';
import { triggerAddAlertFlow, addToWatchlist } from './rux_actions.js?v=0.75.7-liquidation-source-health-20260524';

function cleanDirection(direction = '', blocked = false) {
  if (blocked) return 'SİNYAL YOK / BLOKE';
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG')) return 'LONG / AL';
  if (d.includes('SHORT')) return 'SHORT / SAT';
  if (d.includes('BEKLE')) return 'BEKLE / İZLE';
  return d || 'İZLE';
}

function toneFromDirection(direction = '', blocked = false) {
  if (blocked) return 'neg';
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG') || d.includes('AL')) return 'pos';
  if (d.includes('SHORT') || d.includes('SAT')) return 'neg';
  return 'warn';
}

function pctFromMarket(market) {
  const t = market?.ticker || market?.spot?.ticker || {};
  for (const raw of [t.priceChangePercent, t.change, t.change24h, market?.change24h]) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const candles = market?.candles || market?.ohlcv || [];
  const first = Number(candles[0]?.close), last = Number(candles.at?.(-1)?.close);
  return first ? ((last - first) / first) * 100 : null;
}

function lastPrice(market, candles) {
  return Number(market?.ticker?.price ?? market?.spot?.ticker?.price ?? candles?.at?.(-1)?.close);
}

function valueOrDash(v) {
  return v == null || v === '' ? '—' : String(v);
}

function fmtCompact(n, d = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  const abs = Math.abs(x);
  if (abs >= 1e12) return (x / 1e12).toFixed(d) + 'T';
  if (abs >= 1e9) return (x / 1e9).toFixed(d) + 'B';
  if (abs >= 1e6) return (x / 1e6).toFixed(d) + 'M';
  if (abs >= 1e3) return (x / 1e3).toFixed(d) + 'K';
  return x.toFixed(abs >= 100 ? 0 : d);
}

function metric(label, value, tone = '', sub = '') {
  return el('div', { class: 'rux-mini ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'rux-mini-value' }, value),
    sub ? el('div', { class: 'tiny muted mt-2' }, sub) : null
  );
}

function kv(label, value, tone = '') {
  return el('div', { class: 'kv' }, el('span', { class: 'k' }, label), el('span', { class: 'v mono bold ' + tone }, value));
}

function calcLevels(candles = []) {
  const clean = candles.filter(c => Number.isFinite(Number(c.high)) && Number.isFinite(Number(c.low)) && Number.isFinite(Number(c.close)));
  if (!clean.length) return {};
  const recent = clean.slice(-120);
  const highs = recent.map(c => Number(c.high));
  const lows = recent.map(c => Number(c.low));
  const close = Number(recent.at(-1).close);
  const high = Math.max(...highs);
  const low = Math.min(...lows);
  const pivot = (high + low + close) / 3;
  return {
    support: low,
    resistance: high,
    pivot,
    r1: 2 * pivot - low,
    s1: 2 * pivot - high
  };
}

function buildBlockedPage(host, sym, reason = 'Canlı OHLCV verisi alınamadı.') {
  host.appendChild(pageHead({
    title: sym + ' SİNYAL DETAY',
    subtitle: 'Canlı veri yokken demo sinyal üretilmedi.',
    actions: [
      el('a', { class: 'btn', href: '#/sinyal' }, ICN.list(12), 'SİNYAL MERKEZİ'),
      el('a', { class: 'btn primary', href: '#/coin-pano?symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(State.tf || '4h') }, ICN.open(12), 'COIN PANO')
    ]
  }));
  host.appendChild(card({
    title: 'SİNYAL BLOKE',
    body: el('div', { class: 'rux-note warn' },
      el('b', {}, 'Rapor üretilmedi: '),
      reason,
      el('div', { class: 'small muted mt-8' }, 'Kural: Veri yoksa sistem sinyal, hedef veya risk/getiri raporu üretmez.')
    )
  }));
}

export async function renderSinyalDetay(host, params = {}) {
  host.innerHTML = '';
  const sym = (params?.symbol || State.symbol || 'BTCUSDT').toUpperCase();
  const tf = params?.tf || State.tf || '4h';
  if (State.symbol !== sym) State.setSymbol(sym);
  if (State.tf !== tf) State.setTf(tf);

  let data = null;
  try { data = await fetchMarket(sym, tf, 800); } catch {}
  const candles = normalizeCandleInput(data?.candles || data?.ohlcv || data?.spot?.candles || []);
  if (!data || candles.length < 30) {
    buildBlockedPage(host, sym, candles.length ? `Yetersiz mum: ${candles.length}/30` : 'Canlı market router veri döndürmedi.');
    return;
  }

  const snap = analyzeLiveMarketSignal({ symbol: sym, tf, marketData: { ...data, candles, ohlcv: candles } });
  const price = lastPrice(data, candles);
  const pct = pctFromMarket(data);
  const score = Math.round(Number(snap?.final?.score ?? 0));
  const dataScore = Math.round(Number(snap?.data?.score ?? data?.quality?.confidence ?? 0));
  const noTrade = Math.round(Number(snap?.noTrade?.score ?? 0));
  const blocked = Boolean(snap?.noTrade?.blocked || dataScore < 35);
  const direction = cleanDirection(snap?.direction, blocked);
  const dirTone = toneFromDirection(snap?.direction, blocked);
  const levels = calcLevels(candles);
  const funding = Number(data?.derivatives?.fundingRate);
  const oiContracts = Number(data?.derivatives?.openInterest);
  const markPrice = Number(data?.derivatives?.markPrice || data?.basis?.markPrice || price);
  const oiNotional = Number.isFinite(oiContracts) && Number.isFinite(markPrice) ? oiContracts * markPrice : null;

  host.appendChild(pageHead({
    title: sym + ' SİNYAL DETAY',
    subtitle: coinName(sym) + ' · ' + tf + ' · canlı router/RUx motor çıktısı',
    actions: [
      el('a', { class: 'btn', href: '#/sinyal' }, ICN.list(12), 'SİNYAL MERKEZİ'),
      el('a', { class: 'btn', href: '#/coin-pano?symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(tf) }, ICN.open(12), 'COIN PANO'),
      el('button', { class: 'btn outline-yellow', on: { click: () => { const a = triggerAddAlertFlow({ symbol: sym, source: 'Sinyal Detay' }); if (a) { addToWatchlist(sym); toast(sym + ' alarmı oluşturuldu.', 'success', 'RUx Alarm'); } } } }, ICN.bell(12), 'ALERT')
    ]
  }));

  const header = el('div', { class: 'card section rux-signal-detail-head' },
    el('div', { class: 'rux-compact-grid' },
      metric('SİNYAL', direction, dirTone, snap?.final?.label || 'Canlı karar'),
      metric('REJİM', snap?.regime?.active || '—', 'cyan', snap?.regime?.uncertainty != null ? 'Belirsizlik ' + Math.round(snap.regime.uncertainty) + '/100' : ''),
      metric('GÜVEN', score + ' / 100', statusClass(score), 'Final skor'),
      metric('VERİ', dataScore + ' / 100', statusClass(dataScore), candles.length + ' mum'),
      metric('FUNDING', Number.isFinite(funding) ? fmtPct(funding * 100, 4) : '—', Number.isFinite(funding) && funding < 0 ? 'neg' : 'pos'),
      metric('OPEN INTEREST', Number.isFinite(oiNotional) ? '$' + fmtCompact(oiNotional) : Number.isFinite(oiContracts) ? fmtCompact(oiContracts) : '—', 'cyan')
    )
  );
  host.appendChild(header);

  const top = el('div', { class: 'row cols-4 section' });

  top.appendChild(card({
    title: '1. SİNYAL ÖZETİ',
    body: el('div', { class: 'flex gap-12 mt-4', style: 'align-items:center' },
      ringGauge({ value: score, color: dirTone === 'pos' ? '#10b981' : dirTone === 'neg' ? '#ef4444' : '#f59e0b', size: 86, label: direction }),
      el('div', { class: 'flex-1' },
        kv('Final skor', score + '/100', statusClass(score)),
        kv('Veri güveni', dataScore + '/100', statusClass(dataScore)),
        kv('No-trade riski', noTrade + '/100', statusClass(noTrade, true)),
        kv('Yön', direction, dirTone),
        kv('Net-R', valueOrDash(snap?.cost?.netR ? '+' + snap.cost.netR + 'R' : null), Number(snap?.cost?.netR) >= 1.5 ? 'pos' : 'warn')
      )
    )
  }));

  const chartHost = el('div', { class: 'chart-host short mt-10' });
  const priceCard = card({
    title: '2. FİYAT HAREKETİ ÖZETİ',
    actions: [el('span', { class: 'tag cyan' }, tf)],
    body: el('div', {},
      el('div', { class: 'flex between' },
        el('div', {},
          el('div', { class: 'mono bold', style: 'font-size:22px' }, Number.isFinite(price) ? '$' + fmtPrice(price) : '—'),
          el('div', { class: (pct >= 0 ? 'pos' : 'neg') + ' small mt-2' }, Number.isFinite(pct) ? fmtPct(pct) : '—')
        ),
        el('div', { class: 'small text-right' },
          kv('Direnç', Number.isFinite(levels.resistance) ? '$' + fmtPrice(levels.resistance) : '—'),
          kv('Destek', Number.isFinite(levels.support) ? '$' + fmtPrice(levels.support) : '—'),
          kv('Pivot', Number.isFinite(levels.pivot) ? '$' + fmtPrice(levels.pivot) : '—')
        )
      ),
      chartHost
    )
  });
  top.appendChild(priceCard);

  setTimeout(() => {
    try {
      const { chart, series } = makeCandleChart(chartHost);
      series.setData(candles.slice(-180));
      addEmaLine(chart, candles.slice(-220), 20, '#06b6d4');
      addEmaLine(chart, candles.slice(-260), 50, '#f97316');
      chart.timeScale().fitContent();
    } catch {
      chartHost.innerHTML = '<div class="empty">Grafik çizilemedi.</div>';
    }
  }, 40);

  top.appendChild(card({
    title: '3. SMART MONEY / TEYİT',
    body: el('div', {},
      checklist([
        { state: dataScore >= 60 ? 'ok' : 'warn', label: 'Veri güveni yeterli', right: dataScore + '/100' },
        { state: Number(snap?.technicals?.volumeRatio || 0) >= 1 ? 'ok' : 'warn', label: 'Hacim teyidi', right: Number(snap?.technicals?.volumeRatio || 0).toFixed(2) + 'x' },
        { state: Math.abs(Number(snap?.technicals?.momentumPct || 0)) > 0.2 ? 'ok' : 'warn', label: 'Momentum netliği', right: fmtPct(Number(snap?.technicals?.momentumPct || 0), 2) },
        { state: blocked ? 'miss' : 'ok', label: 'Hard block', right: blocked ? 'Var' : 'Yok' },
        { state: Number(snap?.manipulationRisk || 0) < 65 ? 'ok' : 'warn', label: 'Manipülasyon riski', right: Math.round(Number(snap?.manipulationRisk || 0)) + '/100' },
      ]),
      kv('SMC/teyit skoru', Math.round(Number(snap?.scores?.confirmation ?? score)) + '/100', statusClass(Number(snap?.scores?.confirmation ?? score)))
    )
  }));

  top.appendChild(card({
    title: '4. NİHAİ KARAR',
    klass: 'decision-card ' + (dirTone === 'pos' ? 'green' : dirTone === 'neg' ? 'red' : 'yellow'),
    body: el('div', {},
      el('div', { class: 'decision-text ' + dirTone }, blocked ? 'SİNYAL BLOKE' : direction),
      el('div', { class: 'small muted mt-4' }, snap?.final?.label || 'Canlı karar motoru'),
      el('div', { class: 'kv-rows mt-12', style: 'font-size:11px' },
        kv('Entry', blocked ? '—' : valueOrDash(snap?.manualPlan?.entryZone)),
        kv('Stop', blocked ? '—' : valueOrDash(snap?.manualPlan?.stopReference), 'neg'),
        kv('TP1', blocked ? '—' : valueOrDash(snap?.manualPlan?.tp1), 'pos'),
        kv('TP2', blocked ? '—' : valueOrDash(snap?.manualPlan?.tp2), 'pos'),
        kv('Geçerlilik', valueOrDash(snap?.manualPlan?.validity))
      )
    )
  }));

  host.appendChild(top);

  const mid = el('div', { class: 'row fr-1-1-1 section' });
  mid.appendChild(card({
    title: 'RİSK / REWARD ANALİZİ',
    body: el('div', {},
      kv('Beklenen RR', valueOrDash(snap?.manualPlan?.rrExpected)),
      kv('Fee / spread / slip sonrası', snap?.cost?.netR != null ? '+' + snap.cost.netR + 'R' : '—', Number(snap?.cost?.netR) >= 1.5 ? 'pos' : 'warn'),
      kv('Kovalama sınırı', valueOrDash(snap?.manualPlan?.doNotChase), 'warn'),
      kv('No-trade', snap?.noTrade?.label || '—', blocked ? 'neg' : 'pos')
    )
  }));
  mid.appendChild(card({
    title: 'TÜREV PİYASASI ÖZETİ',
    body: el('div', {},
      kv('Funding', Number.isFinite(funding) ? fmtPct(funding * 100, 4) : '—', Number.isFinite(funding) && funding < 0 ? 'neg' : 'pos'),
      kv('OI kontrat', Number.isFinite(oiContracts) ? fmtCompact(oiContracts) : '—'),
      kv('OI notional', Number.isFinite(oiNotional) ? '$' + fmtCompact(oiNotional) : '—'),
      kv('Kaynak', data?.activeExchange || data?.source || 'Market router')
    )
  }));
  mid.appendChild(card({
    title: 'LİKİDİTE / SEVİYE HARİTASI',
    body: el('div', {},
      kv('R1', Number.isFinite(levels.r1) ? '$' + fmtPrice(levels.r1) : '—', 'neg'),
      kv('S1', Number.isFinite(levels.s1) ? '$' + fmtPrice(levels.s1) : '—', 'pos'),
      kv('Destek', Number.isFinite(levels.support) ? '$' + fmtPrice(levels.support) : '—', 'pos'),
      kv('Direnç', Number.isFinite(levels.resistance) ? '$' + fmtPrice(levels.resistance) : '—', 'neg')
    )
  }));
  host.appendChild(mid);

  host.appendChild(card({
    title: 'STRATEJİ ÖZETİ',
    body: el('div', {},
      el('div', { class: 'rux-note ' + (blocked ? 'warn' : '') },
        blocked ? 'Veri veya no-trade filtresi nedeniyle işlem planı bloke edildi.' :
          `${sym} için ${tf} zaman diliminde ${direction} senaryosu izleniyor. Emir otomatik gönderilmez; entry/stop/hedef sadece manuel plan referansıdır.`
      ),
      el('div', { class: 'rux-source-tags mt-10' },
        metric('Mum', candles.length + ' adet', candles.length >= 200 ? 'green' : 'yellow'),
        metric('Router', data?.activeExchange || data?.source || 'Canlı', 'cyan'),
        metric('Güncelleme', new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' }), '')
      )
    )
  }));
}
