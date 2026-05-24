/* RUx — Ana Kokpit Live Retrofit */
import { State, fetchMarket, fetchNews, fmtPrice, fmtPct, fmtNum, el, fmtTime, coinShort, coinName, fmtTimeShort } from './api.js?v=0.75.5-liquidation-panel-live-20260524';
import { ICN, statCard, card, pageHead, ringGauge, sparkline, barbar, tag, coinPill, pager } from './components.js?v=0.75.5-liquidation-panel-live-20260524';
import { makeCandleChart, addEmaLine } from './charts.js?v=0.75.5-liquidation-panel-live-20260524';
import { makeRuxDecisionSnapshot, analyzeLiveMarketSignal, statusClass } from './rux_core.js?v=0.75.5-liquidation-panel-live-20260524';
import { getDashboardWidgets, removeDashboardWidget, getAlerts, formatLocalTime } from './rux_actions.js?v=0.75.5-liquidation-panel-live-20260524';
import { buildRuleBuilderReport } from './rux_rulebuilder.js?v=0.75.5-liquidation-panel-live-20260524';
import { makeForwardJournalReport, formatJournalR } from './rux_journal.js?v=0.75.5-liquidation-panel-live-20260524';

export async function renderKokpit(host) {
  host.innerHTML = '';
  host.appendChild(pageHead({
    title: 'RUx TRADE KOKPİTİ',
    subtitle: 'Manuel karar destek · Sinyal doğrulama · Net-R takibi · Otomatik emir yok',
    actions: [
      el('button', { class: 'select', title: 'Zaman dilimini üst bardan değiştir', on: { click: () => document.getElementById('ruxTfWrap')?.scrollIntoView?.({ block: 'nearest', inline: 'center' }) } }, el('span', { class: 'label' }, 'TF'), (State.tf || '4h') + ' ', ICN.chev(10)),
      el('button', { class: 'btn outline-yellow' }, ICN.pause(12), 'REST / BEKLEME'),
      el('button', { class: 'btn primary' }, ICN.refresh(12), 'YENİLE'),
    ]
  }));

  // ---- Stat row (8 cards): selected coin + selected timeframe live router ----
  const stats = el('div', { class: 'stat-row cols-8 section', 'data-live-symbol': State.symbol || 'BTCUSDT' });
  stats.appendChild(statCard({ icon: ICN.bitcoin(18), iconColor: 'yellow', label: 'FİYAT', value: 'Canlı veri…', sub: State.symbol || 'BTCUSDT' }));
  stats.appendChild(statCard({ icon: ICN.trend(18), iconColor: 'green', label: '24S DEĞİŞİM', value: '—', sub: 'Ticker bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.layers(18), iconColor: '', label: 'REJİM', value: el('span', { class: 'regime yatay' }, '—'), sub: 'Canlı rejim bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.target(18), iconColor: 'yellow', label: 'SİNYAL', value: el('span', { class: 'warn bold' }, '—'), sub: 'Plan bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.shield(18), iconColor: 'yellow', label: 'GÜVEN', value: '— / 100', sub: 'Canlı güven bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.bars(18), iconColor: 'green', label: 'GENİŞLİK', value: '—', sub: 'Mum katılımı bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.signal(18), iconColor: 'green', label: 'VERİ', value: '—', sub: 'Router bekleniyor' }));
  stats.appendChild(statCard({ icon: ICN.cpu(18), iconColor: 'purple', label: 'MOTOR', value: 'LIVE', sub: 'RUx analiz motoru' }));
  host.appendChild(stats);
  hydrateKokpitMarketStats(stats);

  // ---- Live News pulse bar ----
  const newsBar = el('div', { class: 'newsbar section live-newsbar' },
    el('span', { class: 'label live-news-label' }, el('i', { class: 'live-dot warn' }), 'CANLI HABER'),
    el('div', { class: 'scroll' },
      el('div', { class: 'scroll-inner' },
        ...newsItems(), ...newsItems()
      )
    ),
    el('button', { class: 'card-link live-news-refresh', title: 'Haber akışını canlı yenile' }, 'YENİLE'),
    el('button', { class: 'card-link', on: { click: () => window.OMNI?.navigate?.('haber') } }, 'TÜMÜNÜ GÖR ', ICN.externalLink(10))
  );
  host.appendChild(newsBar);

  // ---- Main grid: Opportunities (2/3) + Quick Decision (1/3) ----
  const grid = el('div', { class: 'row fr-2-1 section' });
  const opportunitiesCard = buildOpportunitiesCard();
  grid.appendChild(opportunitiesCard);
  const quickDecisionCard = buildQuickDecisionCard();
  grid.appendChild(quickDecisionCard);
  host.appendChild(grid);
  hydrateOpportunitiesCard(opportunitiesCard);
  hydrateQuickDecisionCard(quickDecisionCard);
  const quickTimer = setInterval(() => {
    if (!document.body.contains(quickDecisionCard)) { clearInterval(quickTimer); return; }
    if (!document.hidden) hydrateQuickDecisionCard(quickDecisionCard);
  }, 5_000);
  const oppTimer = setInterval(() => {
    if (!document.body.contains(opportunitiesCard)) { clearInterval(oppTimer); return; }
    if (!document.hidden) hydrateOpportunitiesCard(opportunitiesCard);
  }, 30_000);

  // ---- RUx compact decision strip (moved below main cockpit content) ----
  const ruxDecisionCard = buildRuxDecisionCard();
  host.appendChild(ruxDecisionCard);
  hydrateRuxDecisionCard(ruxDecisionCard);

  host.appendChild(buildActiveStrategyStatusCard());
  host.appendChild(buildLiveForwardPerformanceCard());

  const userWidgets = buildUserWidgetsCard();
  host.appendChild(userWidgets);

  // ---- Bottom row: alarms feed + today metrics + score gauge ----
  const bottom = el('div', { class: 'row fr-2-1 section' });
  bottom.appendChild(buildAlarmFeedCard());
  const todayCard = buildTodayCard();
  bottom.appendChild(todayCard);
  host.appendChild(bottom);
  hydrateTodayCard(todayCard);

  // Hydrate Kokpit news from live news-pulse engine.
  hydrateKokpitLiveNews(newsBar, { force: true });
  const refreshBtn = newsBar.querySelector('.live-news-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', () => hydrateKokpitLiveNews(newsBar, { force: true, manual: true }));
  const newsTimer = setInterval(() => {
    if (!document.body.contains(newsBar)) { clearInterval(newsTimer); return; }
    if (!document.hidden) hydrateKokpitLiveNews(newsBar, { force: false });
  }, 5_000);
}




function setKokpitStat(stats, label, value, sub, tone = '') {
  const cards = Array.from(stats.querySelectorAll('.stat-card'));
  const card = cards.find(c => (c.querySelector('.label')?.textContent || '').trim().toUpperCase() === String(label).toUpperCase());
  if (!card) return;
  const valEl = card.querySelector('.val');
  const subEl = card.querySelector('.sub');
  if (valEl) {
    valEl.innerHTML = '';
    if (value instanceof Node) valEl.appendChild(value);
    else valEl.textContent = value;
  }
  if (subEl) {
    subEl.textContent = sub || '';
    subEl.className = 'sub ' + (tone || '');
  }
  const iconBox = card.querySelector('.ic-box');
  if (iconBox && tone) {
    iconBox.classList.remove('green', 'red', 'yellow', 'purple', 'blue');
    if (tone === 'pos') iconBox.classList.add('green');
    if (tone === 'neg') iconBox.classList.add('red');
    if (tone === 'warn') iconBox.classList.add('yellow');
  }
}

function pctFromMarket(market) {
  const t = market?.ticker || market?.spot?.ticker || {};
  const candidates = [t.priceChangePercent, t.change, t.change24h, market?.change24h];
  for (const raw of candidates) {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  const candles = market?.candles || market?.ohlcv || [];
  const first = Number(candles[0]?.close), last = Number(candles.at?.(-1)?.close);
  return first ? ((last - first) / first) * 100 : null;
}

function absChangeFromMarket(market, price, pct) {
  const t = market?.ticker || market?.spot?.ticker || {};
  const direct = Number(t.priceChange ?? market?.priceChange);
  if (Number.isFinite(direct)) return direct;
  return Number.isFinite(price) && Number.isFinite(pct) ? price * pct / 100 : null;
}

function sourceBadge(market) {
  const ex = String(market?.activeExchange || '').toUpperCase();
  const mode = String(market?.mode || market?.source || '').replace(/_/g, ' ');
  return [ex, mode].filter(Boolean).join(' · ') || 'Live router';
}

function decisionTone(direction = '') {
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG') || d.includes('AL')) return 'pos';
  if (d.includes('SHORT') || d.includes('SAT')) return 'neg';
  return 'warn';
}

function cleanKokpitDirection(direction = '') {
  const d = String(direction || '').toUpperCase();
  if (d.includes('LONG')) return 'LONG / AL';
  if (d.includes('SHORT')) return 'SHORT / SAT';
  if (d.includes('BEKLE')) return 'BEKLE';
  return d || 'İZLE';
}

function candleBreadth(candles = []) {
  const last = candles.slice(-80).filter(c => Number.isFinite(Number(c.open)) && Number.isFinite(Number(c.close)));
  if (!last.length) return null;
  return Math.round((last.filter(c => Number(c.close) >= Number(c.open)).length / last.length) * 100);
}

async function hydrateKokpitMarketStats(stats) {
  let disposed = false;
  const tick = async () => {
    if (disposed || !document.body.contains(stats)) { disposed = true; return; }
    const sym = State.symbol || 'BTCUSDT';
    const tf = State.tf || '4h';
    stats.setAttribute('data-live-symbol', sym);
    try {
      const market = await fetchMarket(sym, tf, 500);
      const candles = Array.isArray(market?.candles) ? market.candles : [];
      const snap = candles.length ? analyzeLiveMarketSignal({ symbol: sym, tf, marketData: market }) : null;
      const price = Number(market?.ticker?.price ?? market?.spot?.ticker?.price ?? candles.at?.(-1)?.close);
      const pct = pctFromMarket(market);
      const abs = absChangeFromMarket(market, price, pct);
      const conf = Number(snap?.data?.score ?? snap?.final?.score ?? market?.quality?.confidence ?? 0);
      const breadth = candleBreadth(candles);
      const dir = cleanKokpitDirection(snap?.direction);
      const dirTone = decisionTone(snap?.direction);
      const regime = snap?.regime?.active || market?.gate || 'CANLI';
      const source = sourceBadge(market);

      setKokpitStat(stats, 'FİYAT', Number.isFinite(price) ? '$' + fmtPrice(price) : '—', sym + ' · ' + source, Number.isFinite(price) ? 'pos' : 'warn');
      setKokpitStat(stats, '24S DEĞİŞİM', Number.isFinite(pct) ? fmtPct(pct) : '—', Number.isFinite(abs) ? ((abs >= 0 ? '+ ' : '- ') + '$' + fmtPrice(Math.abs(abs))) : source, Number.isFinite(pct) && pct < 0 ? 'neg' : 'pos');
      setKokpitStat(stats, 'REJİM', regime, snap?.regime?.uncertainty != null ? 'Belirsizlik ' + Math.round(snap.regime.uncertainty) + '/100' : tf + ' canlı rejim', 'pos');
      setKokpitStat(stats, 'SİNYAL', dir, snap?.final?.label || 'Canlı karar motoru', dirTone);
      setKokpitStat(stats, 'GÜVEN', conf ? Math.round(conf) + ' / 100' : '— / 100', snap?.data?.label || market?.mode || 'Canlı güven', conf >= 70 ? 'pos' : conf >= 50 ? 'warn' : 'neg');
      setKokpitStat(stats, 'GENİŞLİK', breadth != null ? '%' + breadth : '—', breadth != null ? 'Son 80 mum yukarı kapanış oranı' : 'Mum verisi bekleniyor', breadth >= 55 ? 'pos' : breadth >= 45 ? 'warn' : 'neg');
      setKokpitStat(stats, 'VERİ', candles.length ? String(candles.length) + ' mum' : '—', source, candles.length >= 200 ? 'pos' : candles.length >= 60 ? 'warn' : 'neg');
      setKokpitStat(stats, 'MOTOR', snap?.final?.score != null ? 'RUx LIVE' : 'BLOKE', tf + ' · manuel karar desteği', snap ? 'pos' : 'warn');
    } catch {
      setKokpitStat(stats, 'VERİ', 'OFFLINE', 'Market router cevap vermedi', 'neg');
      setKokpitStat(stats, 'SİNYAL', 'BLOKE', 'Veri yokken rapor üretilmedi', 'neg');
    }
  };
  await tick();
  const timer = setInterval(() => {
    if (!document.body.contains(stats)) { disposed = true; clearInterval(timer); return; }
    if (!document.hidden) tick();
  }, 10_000);
}

function fmtRValue(n, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return (x >= 0 ? '+' : '') + x.toFixed(digits) + 'R';
}

function fmtScoreValue(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : '—';
}

function kokpitStrategyTone(scoreOrDecision) {
  const s = String(scoreOrDecision || '').toUpperCase();
  const n = Number(scoreOrDecision);
  if (Number.isFinite(n)) {
    if (n >= 78) return 'green';
    if (n >= 62) return 'yellow';
    return 'red';
  }
  if (s.includes('ONAY') || s.includes('AKTİF') || s.includes('GÜÇLÜ')) return 'green';
  if (s.includes('REVİZE') || s.includes('ZAYIF') || s.includes('RED')) return 'red';
  return 'yellow';
}

function buildActiveStrategyStatusCard() {
  let report = null;
  try { report = buildRuleBuilderReport(); } catch {}
  const rule = report?.active || report?.best || report?.sets?.[0] || null;
  const sc = rule?.scorecard || null;
  const wf = rule?.walkForward || sc?.walkForward || {};
  const metrics = rule?.metrics || {};
  const score = sc?.score ?? metrics.stability ?? 0;
  const grade = sc?.grade || (Number(score) >= 78 ? 'A' : Number(score) >= 68 ? 'B' : Number(score) >= 56 ? 'C' : 'D');
  const decision = sc?.decision || rule?.status || 'İZLEME / KALİBRASYON';
  const tone = kokpitStrategyTone(sc?.score ?? decision);

  const wrap = el('div', { class: 'card section rux-active-strategy-card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'AKTİF STRATEJİ DURUMU'),
    el('div', { class: 'flex gap-6' },
      tag(rule ? (sc ? 'Karne kayıtlı' : 'Karne bekliyor') : 'Kural yok', rule ? (sc ? tone : 'yellow') : 'gray'),
      el('a', { class: 'card-link', href: '#/strateji-karnesi' }, 'KARNEYE GİT ', ICN.externalLink(10))
    )
  ));

  if (!rule) {
    wrap.appendChild(el('div', { class: 'rux-empty-action' },
      el('div', { class: 'bold' }, 'Henüz aktif strateji yok'),
      el('div', { class: 'small muted mt-4' }, 'Strateji Üreticisi ekranında bir kural seti oluşturup aktif hale getirdiğinde Kokpit burada özet gösterecek.'),
      el('a', { class: 'btn primary mt-10', href: '#/strateji-uretici' }, ICN.plus(12), 'STRATEJİ ÜRETİCİSİ')
    ));
    return wrap;
  }

  const grid = el('div', { class: 'rux-active-strategy-grid' });
  grid.appendChild(el('div', { class: 'rux-grade-mini ' + tone },
    el('div', { class: 'tiny muted' }, 'KARNE'),
    el('div', { class: 'rux-grade-mini-letter' }, grade),
    el('div', { class: 'mono bold' }, fmtScoreValue(score) + '/100')
  ));
  grid.appendChild(el('div', { class: 'rux-strategy-main' },
    el('div', { class: 'bold' }, rule.name || 'Aktif Kural Seti'),
    el('div', { class: 'small muted mt-3' }, `${rule.setup || 'Setup'} · ${rule.direction || 'Yön'} · ${rule.regime || 'Rejim'}`),
    el('div', { class: 'flex gap-6 mt-8' },
      tag(decision, kokpitStrategyTone(decision)),
      tag(rule.active ? 'AKTİF' : (rule.status || 'Shadow'), rule.active ? 'green' : 'yellow'),
      tag('Otomatik emir yok', 'gray')
    )
  ));
  grid.appendChild(el('div', { class: 'rux-strategy-metrics' },
    ruxStrategyMetric('Backtest Net-R', fmtRValue(sc?.backtest?.netR ?? metrics.netR), sc?.backtest?.trades ? `${sc.backtest.trades} işlem` : 'son karne/fallback'),
    ruxStrategyMetric('Expectancy', fmtRValue(sc?.backtest?.expectancy ?? metrics.expectancy, 3), 'R başına beklenti'),
    ruxStrategyMetric('WF OOS Exp.', fmtRValue(wf.avgOosExpectancy, 3), wf.validatedAt || sc ? 'walk-forward' : 'WF bekliyor'),
    ruxStrategyMetric('Stability', String(wf.avgStability ?? metrics.stability ?? '—'), 'dayanıklılık')
  ));
  wrap.appendChild(grid);

  const note = sc?.decision
    ? `Son kaydedilen karne: ${sc.decision}. Karne tarihi: ${sc.savedAt ? formatLocalTime(sc.savedAt) : '—'}.`
    : 'Bu strateji için henüz kaydedilmiş karne yok. Strateji Karnesi ekranında KARNEYİ KAYDET dediğinde bu kart daha net skor gösterecek.';
  wrap.appendChild(el('div', { class: 'rux-compact-note muted' }, note));
  return wrap;
}

function ruxStrategyMetric(label, value, sub) {
  return el('div', { class: 'rux-strategy-metric' },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'mono bold mt-2' }, value),
    el('div', { class: 'tiny muted mt-2' }, sub || '')
  );
}

function buildLiveForwardPerformanceCard() {
  let report = null;
  try { report = makeForwardJournalReport(); } catch {}
  const summary = report?.summary || {};
  const tone = report?.tone || 'gray';
  const verdict = report?.verdict || 'KAYIT BEKLİYOR';
  const total = Number(summary.total || 0);
  const realized = Number(summary.realized || 0);
  const netR = Number(summary.netR || 0);
  const winRate = Number(summary.winRate || 0);
  const pf = Number(summary.profitFactor || 0);
  const dd = Number(summary.maxDrawdownR || 0);

  const wrap = el('div', { class: 'card section rux-forward-card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'CANLI FORWARD PERFORMANS'),
    el('div', { class: 'flex gap-6' },
      tag(verdict, tone),
      el('a', { class: 'card-link', href: '#/sinyal-gunlugu' }, 'SİNYAL GÜNLÜĞÜ ', ICN.externalLink(10))
    )
  ));

  if (!total) {
    wrap.appendChild(el('div', { class: 'rux-empty-action' },
      el('div', { class: 'bold' }, 'Henüz kaydedilmiş canlı sinyal yok'),
      el('div', { class: 'small muted mt-4' }, 'Sinyal Günlüğü ekranında CANLI SİNYALİ KAYDET dediğinde Kokpit burada forward performans özetini gösterecek.'),
      el('a', { class: 'btn primary mt-10', href: '#/sinyal-gunlugu' }, ICN.plus(12), 'SİNYAL GÜNLÜĞÜNE GİT')
    ));
    return wrap;
  }

  const grid = el('div', { class: 'rux-forward-grid' });
  grid.appendChild(el('div', { class: 'rux-grade-mini ' + (tone === 'green' ? 'green' : tone === 'red' ? 'red' : 'yellow') },
    el('div', { class: 'tiny muted' }, 'FORWARD'),
    el('div', { class: 'rux-grade-mini-letter' }, realized ? (netR >= 0 ? '+' : '−') : '•'),
    el('div', { class: 'mono bold' }, formatJournalR(netR))
  ));
  grid.appendChild(el('div', { class: 'rux-strategy-main' },
    el('div', { class: 'bold' }, verdict),
    el('div', { class: 'small muted mt-3' }, report?.note || 'Sinyal Günlüğü forward katmanı aktif.'),
    el('div', { class: 'flex gap-6 mt-8' },
      tag(`${total} kayıt`, 'cyan'),
      tag(`${realized} sonuçlandı`, realized ? 'green' : 'yellow'),
      tag(`${Number(summary.strategyOk || 0)} strateji uyumlu`, 'gray')
    )
  ));
  grid.appendChild(el('div', { class: 'rux-strategy-metrics' },
    ruxStrategyMetric('Forward Net-R', formatJournalR(netR), 'canlı kayıt'),
    ruxStrategyMetric('Win Rate', Number.isFinite(winRate) ? winRate.toFixed(1) + '%' : '—', `${Number(summary.wins || 0)}W / ${Number(summary.losses || 0)}L`),
    ruxStrategyMetric('Profit Factor', Number.isFinite(pf) ? pf.toFixed(2) : '—', 'gross win/loss'),
    ruxStrategyMetric('Max DD', formatJournalR(dd), 'journal drawdown')
  ));
  wrap.appendChild(grid);

  wrap.appendChild(el('div', { class: 'rux-compact-note muted' }, 'Bu kart sadece Sinyal Günlüğü’ne kaydedilen canlı/manuel takip kayıtlarını özetler; otomatik emir açmaz.'));
  return wrap;
}

function buildUserWidgetsCard() {
  const widgets = getDashboardWidgets();
  const alerts = getAlerts();
  const wrap = el('div', { class: 'card section rux-user-widgets' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx AKSİYON MERKEZİ'),
    el('span', { class: 'tag cyan' }, `${widgets.length} widget · ${alerts.length} alarm`)
  ));
  if (!widgets.length) {
    wrap.appendChild(el('div', { class: 'rux-empty-action' },
      el('div', { class: 'bold' }, 'Henüz kullanıcı widgetı yok'),
      el('div', { class: 'small muted mt-4' }, 'Coin Pano ekranındaki WIDGET EKLE butonuna basınca burada görünür. Alarm Yönetimi için Sistem > Alarm Yönetimi ekranını kullan.'),
      el('div', { class: 'flex gap-8 mt-10' },
        el('a', { class: 'btn primary', href: '#/coin-pano' }, ICN.plus(12), 'COIN PANOYA GİT'),
        el('a', { class: 'btn outline-yellow', href: '#/alarm' }, ICN.bell(12), 'ALARM YÖNETİMİ')
      )
    ));
    return wrap;
  }
  const grid = el('div', { class: 'rux-widget-grid' });
  widgets.slice(0, 8).forEach(w => {
    grid.appendChild(el('div', { class: 'rux-widget-tile' },
      el('div', { class: 'flex between gap-8' },
        el('div', {},
          el('div', { class: 'tiny muted' }, (w.type || 'widget').toUpperCase()),
          el('div', { class: 'bold mt-2' }, w.title || w.symbol || 'RUx Widget'),
          el('div', { class: 'small muted mt-3' }, w.subtitle || 'Kokpit hızlı takip')
        ),
        el('button', { class: 'btn tiny', title: 'Widgetı kaldır', on: { click: () => { removeDashboardWidget(w.id); window.OMNI?.navigate?.('kokpit'); } } }, 'KALDIR')
      ),
      w.symbol ? el('a', { class: 'card-link mt-8', href: '#/coin-pano?symbol=' + encodeURIComponent(w.symbol) }, w.symbol + ' aç ', ICN.externalLink(10)) : null
    ));
  });
  wrap.appendChild(grid);
  return wrap;
}

function buildRuxDecisionCard(snapshot = null) {
  const snap = snapshot || makeRuxDecisionSnapshot({ tf: State.tf || '4h', source: 'binance' });
  const wrap = el('div', { class: 'card section rux-decision-card rux-compact-card' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'RUx KARAR ÖZETİ'),
    el('span', { class: 'tag cyan' }, 'Türkçe Sistem Katmanı')
  ));

  const grid = el('div', { class: 'rux-compact-grid' });
  grid.appendChild(ruxMiniMetric('PİYASA MODU', snap.regime.active, 'Olasılıksal rejim', 'cyan'));
  grid.appendChild(ruxMiniMetric('SİNYAL DURUMU', snap.final.label, snap.direction, statusClass(snap.final.score)));
  grid.appendChild(ruxMiniMetric('VERİ GÜVENİ', snap.data.score + '/100', snap.data.label, statusClass(snap.data.score)));
  grid.appendChild(ruxMiniMetric('İŞLEM ENGELİ', snap.noTrade.score + '/100', snap.noTrade.label, statusClass(snap.noTrade.score, true)));
  grid.appendChild(ruxMiniMetric('NET-R', '+' + snap.cost.netR + 'R', 'Fee/spread/slippage sonrası', 'green'));
  grid.appendChild(ruxMiniMetric('EMİR MODU', 'KAPALI', 'Sadece manuel plan', 'yellow'));
  wrap.appendChild(grid);

  const pipe = el('div', { class: 'rux-pipeline mt-12' });
  snap.pipeline.forEach(([name, value, label]) => {
    const klass = name === 'İşlem Engeli' ? statusClass(value, true) : statusClass(value);
    pipe.appendChild(el('div', { class: 'rux-step ' + klass },
      el('div', { class: 'tiny muted' }, name),
      el('div', { class: 'mono bold' }, String(label)),
      typeof value === 'number' ? el('div', { class: 'rux-step-bar' }, el('i', { style: `width:${Math.min(100, Math.abs(value))}%` })) : null
    ));
  });
  wrap.appendChild(pipe);

  wrap.appendChild(el('div', { class: 'rux-compact-note muted' }, 'Kural: RUx emir göndermez; entry, stop ve hedefleri manuel işlem planı olarak gösterir.')); 
  return wrap;
}


async function hydrateRuxDecisionCard(cardEl) {
  try {
    const data = await fetchMarket(State.symbol || 'BTCUSDT', State.tf || '4h', 300);
    if (!data || !data.candles || !data.candles.length) return;
    const liveSnap = analyzeLiveMarketSignal({ symbol: State.symbol || 'BTCUSDT', tf: State.tf || '4h', marketData: data });
    const next = buildRuxDecisionCard(liveSnap);
    const headTag = next.querySelector('.card-head .tag');
    if (headTag) headTag.textContent = 'Canlı Veri Motoru';
    cardEl.replaceWith(next);
  } catch (err) {
    const note = cardEl.querySelector('.rux-compact-note');
    if (note) note.textContent = 'Canlı veri güncellenemedi; son güvenli snapshot gösteriliyor.';
  }
}

function ruxMiniMetric(label, value, sub, tone = '') {
  return el('div', { class: 'rux-mini ' + tone },
    el('div', { class: 'tiny muted' }, label),
    el('div', { class: 'rux-mini-value' }, value),
    el('div', { class: 'tiny muted mt-2' }, sub)
  );
}

function newsItems() {
  return [
    el('span', { class: 'item muted' }, el('span', { class: 'chip-cat haber' }, 'CANLI'), 'Türkçe haber akışı yükleniyor…'),
    el('span', { class: 'item muted' }, el('span', { class: 'chip-cat macro' }, 'FİLTRE'), 'LIQUIDATION / WHALE alertleri gizlenir'),
    el('span', { class: 'item muted' }, el('span', { class: 'chip-cat onchain' }, 'KAYNAK'), 'Telegram + News kaynakları taranıyor'),
  ];
}

function newsCategoryClass(it = {}) {
  const raw = String(it.category || it.sentiment_label || it.sentiment || it.provider || it.source || 'haber').toLowerCase();
  if (raw.includes('macro') || raw.includes('fed') || raw.includes('cpi') || raw.includes('fomc')) return 'macro';
  if (raw.includes('chain') || raw.includes('telegram') || raw.includes('wallet')) return 'onchain';
  if (raw.includes('fund') || raw.includes('oi')) return 'funding';
  if (raw.includes('market') || raw.includes('piyasa')) return 'piyasa';
  return 'haber';
}

function newsCategoryLabel(it = {}) {
  const source = String(it.provider || it.source || '').toLowerCase();
  if (source.includes('telegram')) return 'TG';
  const cls = newsCategoryClass(it);
  if (cls === 'macro') return 'MAKRO';
  if (cls === 'onchain') return 'ON-CHAIN';
  if (cls === 'funding') return 'FUNDING';
  if (cls === 'piyasa') return 'PİYASA';
  return 'HABER';
}

function formatKokpitNewsTime(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  if (diff >= 0 && diff < 60_000) return 'az önce';
  if (diff >= 0 && diff < 3_600_000) return Math.max(1, Math.floor(diff / 60_000)) + ' dk önce';
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function buildKokpitNewsNodes(items) {
  const safeItems = (items || [])
    .filter(it => String(it.title || it.headline || it.text || '').trim())
    .slice(0, 10);
  if (!safeItems.length) return newsItems();
  return safeItems.map(it => {
    const title = String(it.title_display || it.title_tr || it.title || it.headline || it.text || '').replace(/\s+/g, ' ').trim();
    const time = formatKokpitNewsTime(it.created_at || it.published_at || it.time || it.date);
    const text = time ? `${title} · ${time}` : title;
    const node = el('span', { class: 'item live-news-item', title: title },
      el('span', { class: 'chip-cat ' + newsCategoryClass(it) }, newsCategoryLabel(it)),
      text.length > 150 ? text.slice(0, 147) + '…' : text
    );
    if (it.url) node.addEventListener('click', () => window.open(it.url, '_blank', 'noopener,noreferrer'));
    return node;
  });
}

async function hydrateKokpitLiveNews(host, opts = {}) {
  const label = host.querySelector('.live-news-label');
  const inner = host.querySelector('.scroll-inner');
  if (!inner) return;
  try {
    if (label) label.innerHTML = '<i class="live-dot warn"></i> HABER YÜKLENİYOR';
    const data = await fetchNews(State.symbol, 'tr', 'global', { force: !!opts.force, limit: 24 });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) {
      if (label) label.innerHTML = '<i class="live-dot warn"></i> CANLI HABER';
      return;
    }
    inner.innerHTML = '';
    const nodes = buildKokpitNewsNodes(items);
    nodes.forEach(c => inner.appendChild(c));
    nodes.map(n => n.cloneNode(true)).forEach(c => inner.appendChild(c));

    const filtered = Number(data?.filter_policy?.filtered_alerts ?? data?.stats?.filtered_alerts ?? 0);
    const sourceText = data?.filter_policy?.telegram_sources?.length ? `TG:${data.filter_policy.telegram_sources.join(',')}` : (data?.provider || 'Canlı');
    if (label) label.innerHTML = '<i class="live-dot"></i> CANLI HABER';
    host.dataset.liveSource = sourceText;
    host.dataset.updatedAt = new Date().toISOString();

    const refreshBtn = host.querySelector('.live-news-refresh');
    if (refreshBtn) refreshBtn.textContent = opts.manual ? 'YENİLENDİ' : 'YENİLE';
    setTimeout(() => { const b = host.querySelector('.live-news-refresh'); if (b) b.textContent = 'YENİLE'; }, 1400);

    let meta = host.querySelector('.live-news-meta');
    if (!meta) {
      meta = el('span', { class: 'live-news-meta tiny muted' });
      host.appendChild(meta);
    }
    meta.textContent = `${items.length} haber · ${filtered} alert gizli · ${new Date().toLocaleTimeString('tr-TR', {hour:'2-digit', minute:'2-digit'})}`;
  } catch (err) {
    if (label) label.innerHTML = '<i class="live-dot warn"></i> HABER AKIŞI';
    let meta = host.querySelector('.live-news-meta');
    if (!meta) { meta = el('span', { class: 'live-news-meta tiny muted' }); host.appendChild(meta); }
    meta.textContent = 'Canlı haber alınamadı; güvenli akış korunuyor.';
  }
}

function kokpitWatchlist() {
  const base = Array.isArray(State.watchlist) && State.watchlist.length ? State.watchlist : ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','AVAXUSDT','LINKUSDT','ADAUSDT'];
  const current = State.symbol || 'BTCUSDT';
  return Array.from(new Set([current, ...base].map(x => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean))).slice(0, 10);
}

function buildOpportunitiesCard() {
  const head = el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'FIRSAT & ADAYLAR ', el('span', { class: 'info' }, '?')),
    el('div', { class: 'card-actions' },
      el('span', { class: 'tag cyan', 'data-opp-field': 'status' }, 'CANLI TARANIYOR'),
      el('button', { class: 'btn sm ghost', 'data-opp-field': 'refresh' }, ICN.refresh(12), 'Yenile')
    )
  );

  const tbl = el('table', { class: 'tbl', 'data-live-card': 'kokpit-opportunities' });
  tbl.appendChild(el('thead', {},
    el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'COIN'),
      el('th', {}, 'SİNYAL'),
      el('th', {}, 'GÜÇ'),
      el('th', {}, ''),
      el('th', {}, 'REJİM'),
      el('th', { class: 'r' }, 'FUNDING'),
      el('th', { class: 'r' }, 'DELTA'),
      el('th', { class: 'c' }, ''),
      el('th', { class: 'r' }, 'GÜVEN'),
      el('th', { class: 'c' }, ''),
    )
  ));
  tbl.appendChild(el('tbody', {},
    el('tr', {}, el('td', { colspan: 11, class: 'muted' }, 'Canlı fırsat taraması yükleniyor…'))
  ));

  const foot = el('div', { class: 'flex between mt-12', style: 'font-size:11px;color:var(--fg-3)' },
    el('span', { 'data-opp-field': 'updated' }, 'Son güncelleme: —'),
    el('span', { class: 'mono', 'data-opp-field': 'count' }, '0 sonuç'),
    el('span', { class: 'flex items-center gap-6' }, 'Otomatik güncelleme', el('span', { class: 'switch on' }, el('span', { class: 'track' })))
  );

  const c = card({ body: el('div', {}, head, el('div', { class: 'tbl-wrap' }, tbl), foot) });
  const refresh = c.querySelector('[data-opp-field="refresh"]');
  if (refresh) refresh.addEventListener('click', () => hydrateOpportunitiesCard(c, true));
  return c;
}

async function hydrateOpportunitiesCard(cardEl, force = false) {
  const tbody = cardEl.querySelector('tbody');
  const status = cardEl.querySelector('[data-opp-field="status"]');
  const updated = cardEl.querySelector('[data-opp-field="updated"]');
  const count = cardEl.querySelector('[data-opp-field="count"]');
  if (!tbody) return;
  if (status) status.textContent = 'CANLI TARANIYOR';
  tbody.innerHTML = '<tr><td colspan="11" class="muted">Canlı watchlist taranıyor…</td></tr>';

  const symbols = kokpitWatchlist();
  const rows = [];
  for (const sym of symbols) {
    try {
      const market = await fetchMarket(sym, State.tf || '4h', force ? 500 : 320);
      const candles = Array.isArray(market?.candles) ? market.candles : [];
      if (!candles.length) continue;
      const snap = analyzeLiveMarketSignal({ symbol: sym, tf: State.tf || '4h', marketData: market });
      const price = Number(market?.ticker?.price ?? candles.at(-1)?.close);
      const pct = pctFromMarket(market);
      const finalScore = Number(snap?.final?.score ?? market?.quality?.confidence ?? 0);
      const funding = Number(market?.derivatives?.fundingRate);
      const deltaPct = Number(snap?.technicals?.deltaPct ?? snap?.orderflow?.deltaPct ?? pct);
      const signal = cleanKokpitDirection(snap?.direction);
      const sigClass = decisionTone(snap?.direction);
      rows.push({
        sym,
        name: coinName(sym),
        signal,
        sigClass,
        force: Math.round(finalScore || 0),
        regime: snap?.regime?.active || 'CANLI',
        funding,
        deltaPct,
        prob: Math.round(finalScore || 0),
        price,
        star: sym === (State.symbol || '').toUpperCase(),
        candles
      });
    } catch {}
  }

  rows.sort((a, b) => (b.prob || 0) - (a.prob || 0));
  tbody.innerHTML = '';
  if (!rows.length) {
    tbody.appendChild(el('tr', {}, el('td', { colspan: 11, class: 'muted' }, 'Canlı fırsat üretilemedi. Demo satır gösterilmedi.')));
    if (status) status.textContent = 'VERİ YOK';
    if (updated) updated.textContent = 'Son güncelleme: başarısız';
    if (count) count.textContent = '0 sonuç';
    return;
  }

  rows.slice(0, 8).forEach((r, i) => {
    const rejClass = 'regime ' + (String(r.regime).toUpperCase().includes('BIRIK') ? 'birikim' : String(r.regime).toUpperCase().includes('TREND') ? 'trend' : String(r.regime).toUpperCase().includes('DAG') ? 'dagilim' : 'yatay');
    const sparkVals = r.candles.slice(-40).map(c => Number(c.close)).filter(Number.isFinite);
    const tr = el('tr', { class: r.star ? 'starred' : '' },
      el('td', { class: 'muted' }, String(i + 1)),
      el('td', {}, coinPill(r.sym, r.name)),
      el('td', {}, el('span', { class: r.sigClass + ' bold' }, r.signal)),
      el('td', { class: 'mono bold' }, String(r.force)),
      el('td', {}, barbar(r.force)),
      el('td', {}, el('span', { class: rejClass }, r.regime)),
      el('td', { class: 'r mono ' + (r.funding >= 0 ? 'pos' : 'neg') }, Number.isFinite(r.funding) ? fmtPct(r.funding * 100, 4) : '—'),
      el('td', { class: 'r mono ' + (r.deltaPct >= 0 ? 'pos' : 'neg') }, Number.isFinite(r.deltaPct) ? fmtPct(r.deltaPct) : '—'),
      el('td', { class: 'c' }, sparkVals.length > 2 ? sparkline(sparkVals, 70, 18, r.deltaPct >= 0 ? '#10b981' : '#ef4444', 1) : el('span', { class: 'muted' }, '—')),
      el('td', { class: 'r mono bold' }, '%' + r.prob),
      el('td', { class: 'c' }, el('a', { class: 'card-link', href: '#/coin-pano?symbol=' + encodeURIComponent(r.sym) + '&tf=' + encodeURIComponent(State.tf || '4h') }, 'AÇ')),
    );
    tbody.appendChild(tr);
  });
  if (status) status.textContent = 'CANLI';
  if (updated) updated.textContent = 'Son güncelleme: ' + new Date().toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  if (count) count.textContent = rows.length + ' canlı sonuç';
}

function buildQuickDecisionCard() {
  const sym = State.symbol || 'BTCUSDT';
  const wrap = el('div', { class: 'card', 'data-live-card': 'kokpit-quick-decision' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'flex items-center gap-8' },
      el('span', { class: 'coin-icon ' + coinShort(sym).toLowerCase().slice(0, 4) }, coinShort(sym).slice(0, 1)),
      el('div', {},
        el('div', { class: 'bold', style: 'font-size:13px', 'data-live-field': 'quick-title' }, sym + ' HIZLI KARAR'),
        el('div', { class: 'tiny muted', 'data-live-field': 'quick-subtitle' }, coinName(sym))
      )
    ),
    el('a', { class: 'card-link', href: '#/coin-pano?symbol=' + encodeURIComponent(sym) + '&tf=' + encodeURIComponent(State.tf || '4h') }, ICN.open(12))
  ));
  wrap.appendChild(el('div', { class: 'flex between items-center mt-8' },
    el('div', {},
      el('div', { class: 'mono bold', style: 'font-size:24px', 'data-live-field': 'quick-price' }, 'Canlı veri…'),
      el('div', { class: 'small muted mt-2' }, '24s Değişim'),
      el('div', { class: 'small bold', 'data-live-field': 'quick-change' }, 'Router bekleniyor')
    ),
    el('div', { 'data-live-field': 'quick-spark' }, el('span', { class: 'muted small' }, '—'))
  ));

  const grid3 = el('div', { class: 'row cols-3 mt-12' });
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'REJİM'), el('div', { class: 'regime yatay mt-2', style: 'font-size:13px', 'data-live-field': 'quick-regime' }, '—')));
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'SİNYAL'), el('div', { class: 'warn bold mt-2', style: 'font-size:13px', 'data-live-field': 'quick-signal' }, 'İZLE')));
  grid3.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'GÜVEN'), el('div', { class: 'bold mt-2', style: 'font-size:13px', 'data-live-field': 'quick-confidence' }, '—/100')));
  wrap.appendChild(grid3);

  const grid3b = el('div', { class: 'row cols-3 mt-12' });
  grid3b.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'DESTEK'), el('div', { class: 'mono bold mt-2', 'data-live-field': 'quick-support' }, '—')));
  grid3b.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'DİRENÇ'), el('div', { class: 'mono bold mt-2', 'data-live-field': 'quick-resistance' }, '—')));
  grid3b.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'STOP'), el('div', { class: 'mono bold mt-2 neg', 'data-live-field': 'quick-stop' }, '—')));
  wrap.appendChild(grid3b);

  const btnRow = el('div', { class: 'row cols-3 mt-12' });
  btnRow.appendChild(el('button', { class: 'btn', style: 'background:rgba(16,185,129,0.16); color:#10b981; border-color: rgba(16,185,129,0.3); justify-content:center;', on:{click:()=>window.OMNI?.navigate?.('coin-pano', { symbol: sym, tf: State.tf || '4h' })} }, 'AL ↑'));
  btnRow.appendChild(el('button', { class: 'btn outline-yellow', style: 'justify-content:center;' }, 'BEKLE ⏸'));
  btnRow.appendChild(el('button', { class: 'btn outline-red', style: 'justify-content:center;', on:{click:()=>window.OMNI?.navigate?.('coin-pano', { symbol: sym, tf: State.tf || '4h' })} }, 'SAT ↓'));
  wrap.appendChild(btnRow);

  const foot = el('div', { class: 'row cols-3 mt-12', style: 'border-top:1px solid var(--bd-1); padding-top:10px' });
  foot.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'Zaman Dilimi'), el('div', { class: 'small bold mt-2', 'data-live-field': 'quick-tf' }, State.tf || '4h')));
  foot.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'Veri'), el('div', { class: 'small bold mt-2 warn', 'data-live-field': 'quick-data' }, 'ROUTER')));
  foot.appendChild(el('div', {}, el('div', { class: 'tiny muted' }, 'Motor'), el('div', { class: 'small bold mt-2 cyan', 'data-live-field': 'quick-engine' }, 'RUx LIVE')));
  wrap.appendChild(foot);

  return wrap;
}


async function hydrateQuickDecisionCard(cardEl) {
  try {
    const sym = State.symbol || 'BTCUSDT';
    const tf = State.tf || '4h';
    const data = await fetchMarket(sym, tf, 500);
    const candles = Array.isArray(data?.candles) ? data.candles : [];
    if (!candles.length) throw new Error('no candles');
    const snap = analyzeLiveMarketSignal({ symbol: sym, tf, marketData: data });
    const last = candles.at(-1) || {};
    const price = Number(data?.ticker?.price ?? last.close);
    const change = pctFromMarket(data);
    const conf = Number(snap?.final?.score ?? snap?.data?.score ?? data?.quality?.confidence ?? 0);
    const highs = candles.slice(-80).map(c => Number(c.high)).filter(Number.isFinite);
    const lows = candles.slice(-80).map(c => Number(c.low)).filter(Number.isFinite);
    const support = lows.length ? Math.min(...lows) : null;
    const resistance = highs.length ? Math.max(...highs) : null;
    const atrProxy = highs.length && lows.length ? (resistance - support) / 8 : 0;
    const shortBias = String(snap?.direction || '').toUpperCase().includes('SHORT');
    const stop = Number.isFinite(price) && atrProxy ? (shortBias ? price + atrProxy : price - atrProxy) : null;
    const set = (field, value, cls='') => {
      const node = cardEl.querySelector(`[data-live-field="${field}"]`);
      if (!node) return;
      node.innerHTML = '';
      if (value instanceof Node) node.appendChild(value); else node.textContent = value;
      if (cls) node.className = node.className.replace(/\b(pos|neg|warn|cyan)\b/g, '').trim() + ' ' + cls;
    };
    set('quick-title', sym + ' HIZLI KARAR');
    set('quick-subtitle', coinName(sym) + ' · ' + tf);
    if (Number.isFinite(price)) set('quick-price', '$' + fmtPrice(price));
    if (Number.isFinite(change)) set('quick-change', fmtPct(change) + ' · ' + String(data?.activeExchange || data?.market || 'ROUTER').toUpperCase(), change >= 0 ? 'pos' : 'neg');
    set('quick-regime', snap?.regime?.active || data?.gate || 'CANLI');
    set('quick-signal', cleanKokpitDirection(snap?.direction), decisionTone(snap?.direction));
    set('quick-confidence', Number.isFinite(conf) && conf > 0 ? Math.round(conf) + '/100' : '—/100', conf >= 70 ? 'pos' : conf >= 50 ? 'warn' : 'neg');
    if (Number.isFinite(support)) set('quick-support', '$' + fmtPrice(support));
    if (Number.isFinite(resistance)) set('quick-resistance', '$' + fmtPrice(resistance));
    if (Number.isFinite(stop)) set('quick-stop', '$' + fmtPrice(stop), 'neg');
    set('quick-data', (String(data?.activeExchange || data?.market || 'ROUTER').toUpperCase()) + ' · ' + candles.length + ' mum', candles.length >= 200 ? 'pos' : 'warn');
    set('quick-tf', tf);
    set('quick-engine', snap?.live ? 'RUx LIVE' : 'RUx BLOKE', snap?.live ? 'cyan' : 'warn');
    const sparkHost = cardEl.querySelector('[data-live-field="quick-spark"]');
    if (sparkHost) {
      sparkHost.innerHTML = '';
      const vals = candles.slice(-60).map(c => Number(c.close)).filter(Number.isFinite);
      sparkHost.appendChild(vals.length > 2 ? sparkline(vals, 130, 36, change >= 0 ? '#10b981' : '#ef4444', 1) : el('span', { class: 'muted small' }, '—'));
    }
  } catch (err) {
    const node = cardEl.querySelector('[data-live-field="quick-data"]');
    if (node) {
      node.textContent = 'VERİ YOK';
      node.className = node.className.replace(/\b(pos|neg|warn|cyan)\b/g, '').trim() + ' neg';
    }
    const sig = cardEl.querySelector('[data-live-field="quick-signal"]');
    if (sig) sig.textContent = 'BLOKE';
  }
}

function buildAlarmFeedCard() {
  const alerts = getAlerts().slice(0, 8);
  const tbody = el('div', {});
  if (alerts.length) {
    alerts.forEach(a => {
      const row = el('div', { style: 'display:grid; grid-template-columns: 82px 80px 1fr 54px; gap:8px; padding:7px 0; border-bottom:1px dashed var(--bd-1); font-size:12px;' },
        el('span', { class: 'mono muted', style: 'font-size:11px' }, formatLocalTime(a.createdAt)),
        el('span', {}, el('span', { class: 'chip-cat sinyal' }, 'ALARM')),
        el('span', { style: 'color:var(--fg-2)' }, `${a.symbol} · ${a.threshold ? '$' + Number(a.threshold).toLocaleString('en-US') : a.message}`),
        el('a', { class: 'card-link text-right', href: '#/alarm' }, 'AÇ')
      );
      tbody.appendChild(row);
    });
  } else {
    tbody.appendChild(el('div', { class: 'rux-empty-action' },
      el('div', { class: 'bold' }, 'Kullanıcı alarmı yok'),
      el('div', { class: 'small muted mt-4' }, 'Demo ETH/SOL/BTC alarmı gösterilmedi. Canlı haber akışı üst barda, kullanıcı alarm yönetimi Sistem > Alarm Yönetimi ekranında.')
    ));
  }
  return card({
    title: el('span', { class: 'flex items-center gap-6' }, ICN.bell(13), 'KULLANICI ALARMLARI'),
    link: 'TÜMÜNÜ GÖR',
    body: tbody
  });
}

function buildTodayCard() {
  const wrap = el('div', { class: 'card', 'data-live-card': 'kokpit-today' });
  wrap.appendChild(el('div', { class: 'card-head' },
    el('div', { class: 'card-title' }, 'BUGÜN İŞLEM? ', el('span', { class: 'info' }, '?')),
    el('button', { class: 'card-link', on: { click: () => hydrateTodayCard(wrap, true) } }, 'Yenile ', ICN.refresh(10))
  ));
  const grid = el('div', { class: 'row cols-2' });
  const left = el('div', { 'data-live-field': 'today-list' });
  const items = [
    ['SİNYAL DURUMU','Canlı veri…',null,ICN.layers(14),'warn'],
    ['ORT. OLASILIK','—',null,ICN.target(14),''],
    ['YÖN','—',null,ICN.signal(14),''],
    ['RİSK / GETİRİ','—',null,ICN.scale(14),''],
    ['VERİ GÜVENİ','—',null,ICN.shield(14),'warn'],
    ['NO-TRADE RİSKİ','—',null,ICN.warning(14),'warn'],
  ];
  items.forEach(([lbl, val, sub, ic, c]) => appendTodayItem(left, lbl, val, sub, ic, c));
  grid.appendChild(left);
  grid.appendChild(el('div', { class: 'flex center', style: 'flex-direction:column; gap:8px;', 'data-live-field': 'today-gauge' },
    ringGauge({ value: 0, max: 100, label: 'GÜNLÜK SKOR', sublabel: 'BEKLE', color: '#f59e0b', size: 140 }),
    el('div', { class: 'tiny muted text-center' }, 'Canlı veri bekleniyor')
  ));
  wrap.appendChild(grid);
  return wrap;
}

function appendTodayItem(host, lbl, val, sub, ic, c) {
  host.appendChild(el('div', { style: 'display:grid; grid-template-columns: 28px 1fr auto; gap:8px; align-items:center; padding:8px 0; border-bottom:1px dashed var(--bd-1)' },
    el('span', { class: 'ic-box ' + (c || ''), style: 'width:24px;height:24px;border-radius:6px;background:var(--bg-card-2)' }, ic),
    el('span', {}, el('div', { class: 'tiny muted' }, lbl), el('div', { class: 'small bold ' + (c || '') }, val)),
    sub ? el('span', { class: 'tiny muted' }, '(' + sub + ')') : el('span', {})
  ));
}

async function hydrateTodayCard(cardEl, force = false) {
  const list = cardEl.querySelector('[data-live-field="today-list"]');
  const gauge = cardEl.querySelector('[data-live-field="today-gauge"]');
  if (!list || !gauge) return;
  try {
    const sym = State.symbol || 'BTCUSDT';
    const data = await fetchMarket(sym, State.tf || '4h', force ? 500 : 320);
    const candles = Array.isArray(data?.candles) ? data.candles : [];
    if (!candles.length) throw new Error('no candles');
    const snap = analyzeLiveMarketSignal({ symbol: sym, tf: State.tf || '4h', marketData: data });
    const score = Math.max(0, Math.min(100, Number(snap?.final?.score ?? snap?.data?.score ?? data?.quality?.confidence ?? 0)));
    const direction = cleanKokpitDirection(snap?.direction);
    const tone = decisionTone(snap?.direction);
    const noTrade = Number(snap?.noTrade?.score ?? 0);
    const rr = snap?.manualPlan?.rrExpected || snap?.cost?.netR ? String(snap?.manualPlan?.rrExpected || ('Net ' + snap.cost.netR + 'R')) : '—';
    list.innerHTML = '';
    appendTodayItem(list, 'SİNYAL DURUMU', snap?.final?.label || 'Canlı', null, ICN.layers(14), statusClass(score));
    appendTodayItem(list, 'ORT. OLASILIK', '%' + Math.round(score), null, ICN.target(14), score >= 70 ? 'pos' : score >= 50 ? 'warn' : 'neg');
    appendTodayItem(list, 'YÖN', direction, null, ICN.signal(14), tone);
    appendTodayItem(list, 'RİSK / GETİRİ', rr, null, ICN.scale(14), '');
    appendTodayItem(list, 'VERİ GÜVENİ', Math.round(Number(snap?.data?.score ?? score)) + '/100', null, ICN.shield(14), Number(snap?.data?.score ?? score) >= 70 ? 'pos' : 'warn');
    appendTodayItem(list, 'NO-TRADE RİSKİ', Math.round(noTrade) + '/100', null, ICN.warning(14), noTrade >= 65 ? 'neg' : noTrade >= 45 ? 'warn' : 'pos');
    const color = score >= 70 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
    const label = score >= 70 ? 'İŞLEM UYGUN' : score >= 50 ? 'SEÇİCİ OL' : 'BEKLE';
    gauge.innerHTML = '';
    gauge.appendChild(ringGauge({ value: Math.round(score), max: 100, label: 'GÜNLÜK SKOR', sublabel: label, color, size: 140 }));
    gauge.appendChild(el('div', { class: 'tiny muted text-center' }, sym + ' · ' + (State.tf || '4h') + ' · ' + candles.length + ' mum'));
  } catch {
    list.innerHTML = '';
    appendTodayItem(list, 'DURUM', 'VERİ YOK', null, ICN.warning(14), 'neg');
    appendTodayItem(list, 'KURAL', 'Rapor üretilmedi', null, ICN.shield(14), 'warn');
    gauge.innerHTML = '';
    gauge.appendChild(ringGauge({ value: 0, max: 100, label: 'GÜNLÜK SKOR', sublabel: 'BLOKE', color: '#ef4444', size: 140 }));
    gauge.appendChild(el('div', { class: 'tiny muted text-center' }, 'Canlı veri alınamadı'));
  }
}

function makeRandomWalk(n, bias = 0.5) {
  const arr = []; let v = 50;
  for (let i = 0; i < n; i++) {
    v += (Math.random() - (1 - bias)) * 6;
    v = Math.max(0, Math.min(100, v));
    arr.push(v);
  }
  return arr;
}
