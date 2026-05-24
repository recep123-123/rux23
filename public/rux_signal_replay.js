/* RUx — Signal Replay & Trade Timeline Engine
   Purpose: replay theoretical signal outcome bar-by-bar without opening orders. */

function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function clamp(v, a = 0, b = 100) { return Math.max(a, Math.min(b, Number(v) || 0)); }
function asCandles(marketData = {}) {
  if (Array.isArray(marketData)) return marketData;
  if (Array.isArray(marketData.candles)) return marketData.candles;
  if (Array.isArray(marketData.data)) return marketData.data;
  return [];
}
function cTime(c = {}) {
  const raw = c.time ?? c.t ?? c.openTime ?? c.timestamp ?? c[0];
  const x = Number(raw);
  if (Number.isFinite(x)) return x > 1e12 ? x : x * 1000;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
}
function cHigh(c = {}) { return n(c.high ?? c.h ?? c.High ?? c[2], 0); }
function cLow(c = {}) { return n(c.low ?? c.l ?? c.Low ?? c[3], 0); }
function cClose(c = {}) { return n(c.close ?? c.c ?? c.Close ?? c[4], 0); }
function cOpen(c = {}) { return n(c.open ?? c.o ?? c.Open ?? c[1], cClose(c)); }
function mean(vals = []) { return vals.length ? vals.reduce((a,b)=>a+n(b),0)/vals.length : 0; }
function pct(a,b) { return b ? ((a-b)/b)*100 : 0; }
function fmtTime(ms) {
  try { return new Date(ms).toLocaleString('tr-TR', { hour12:false, day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch { return '—'; }
}
function parseMaybeR(v) {
  if (v === null || v === undefined || v === '') return null;
  const x = Number(String(v).replace('R','').replace('+','').replace(',','.').trim());
  return Number.isFinite(x) ? x : null;
}
function rowNumber(row = {}, keys = []) {
  for (const k of keys) {
    const raw = row[k];
    if (raw === null || raw === undefined || raw === '') continue;
    const x = Number(String(raw).replace(/,/g, ''));
    if (Number.isFinite(x)) return x;
  }
  return NaN;
}
function deriveTfMinutes(tf = '4h') {
  const s = String(tf || '').toLowerCase();
  const m = s.match(/(\d+)\s*(m|h|d|w)/);
  if (!m) return 240;
  const v = Number(m[1]);
  const unit = m[2];
  if (unit === 'm') return v;
  if (unit === 'h') return v * 60;
  if (unit === 'd') return v * 1440;
  if (unit === 'w') return v * 10080;
  return 240;
}

function syntheticSignal(candles = [], symbol = 'BTCUSDT', tf = '4h') {
  const list = candles.filter(c => cClose(c) > 0);
  const idx = Math.max(10, list.length - 52);
  const base = list[idx] || list[Math.max(0, list.length - 40)] || { close: 100000, high: 101000, low: 99000, time: Date.now() - 86400000 };
  const price = cClose(base) || 100000;
  const recent = list.slice(Math.max(0, idx - 20), idx + 1);
  const avgRange = mean(recent.map(c => Math.abs(cHigh(c) - cLow(c)) || price * 0.008)) || price * 0.01;
  const direction = (cClose(list[idx + 3] || base) >= price) ? 'LONG' : 'SHORT';
  const risk = Math.max(avgRange * 1.2, price * 0.006);
  const entry = direction === 'LONG' ? price - avgRange * 0.18 : price + avgRange * 0.18;
  const entryLow = direction === 'LONG' ? entry - avgRange * 0.22 : entry - avgRange * 0.08;
  const entryHigh = direction === 'LONG' ? entry + avgRange * 0.08 : entry + avgRange * 0.22;
  const stop = direction === 'LONG' ? entry - risk : entry + risk;
  const mult = direction === 'LONG' ? 1 : -1;
  return {
    id: 'demo-' + symbol + '-' + tf,
    symbol,
    tf,
    direction,
    setup: direction === 'LONG' ? 'Liquidity Sweep Reversal Long' : 'Breakdown Retest Short',
    regime: direction === 'LONG' ? 'Range / Squeeze' : 'Bear Trend / Expansion',
    signalLevel: direction === 'LONG' ? 'VALID LONG SIGNAL' : 'VALID SHORT SIGNAL',
    score: 82,
    confidence: 78,
    dataConfidence: 86,
    generatedAt: cTime(base),
    sourceIndex: idx,
    validityBars: 24,
    entryZoneLow: Math.min(entryLow, entryHigh),
    entryZoneHigh: Math.max(entryLow, entryHigh),
    preferredEntry: entry,
    stopReference: stop,
    tp1: entry + mult * risk * 1.0,
    tp2: entry + mult * risk * 2.0,
    tp3: entry + mult * risk * 3.0,
    doNotChase: entry + mult * risk * 0.70,
    source: 'OHLCV demo replay'
  };
}

function normalizeJournalSignal(row = {}, fallback = {}) {
  const direction = String(row.direction || row.side || row.signal || fallback.direction || 'LONG').toUpperCase().includes('SHORT') ? 'SHORT' : 'LONG';
  const entryLow = rowNumber(row, ['entryZoneLow','entry_zone_low','entryLow','entryLowPrice']);
  const entryHigh = rowNumber(row, ['entryZoneHigh','entry_zone_high','entryHigh','entryHighPrice']);
  const preferred = rowNumber(row, ['preferredEntry','preferred_entry','entry','entryPrice','signalEntry']);
  const stop = rowNumber(row, ['stopReference','stop_reference','stop','stopPrice']);
  const risk = Math.abs((Number.isFinite(preferred) ? preferred : fallback.preferredEntry) - (Number.isFinite(stop) ? stop : fallback.stopReference)) || Math.abs(fallback.preferredEntry - fallback.stopReference) || 100;
  const mult = direction === 'LONG' ? 1 : -1;
  const entry = Number.isFinite(preferred) ? preferred : n(fallback.preferredEntry, 0);
  return {
    ...fallback,
    id: row.id || row.signalId || fallback.id,
    symbol: row.asset || row.symbol || fallback.symbol,
    tf: row.tf || row.timeframe || fallback.tf,
    direction,
    setup: row.setup || row.setup_type || fallback.setup,
    regime: row.regime || fallback.regime,
    signalLevel: row.signalLevel || row.stateLabel || row.state || fallback.signalLevel,
    score: n(row.finalScore ?? row.score ?? fallback.score, fallback.score),
    confidence: n(row.confidence ?? row.confirmationScore ?? fallback.confidence, fallback.confidence),
    dataConfidence: n(row.dataConfidence ?? fallback.dataConfidence, fallback.dataConfidence),
    generatedAt: Date.parse(row.time || row.createdAt || row.timestamp || '') || fallback.generatedAt,
    validityBars: n(row.validityBars ?? row.signalValidityBars ?? fallback.validityBars, fallback.validityBars),
    entryZoneLow: Number.isFinite(entryLow) ? entryLow : n(fallback.entryZoneLow, entry - risk * 0.15),
    entryZoneHigh: Number.isFinite(entryHigh) ? entryHigh : n(fallback.entryZoneHigh, entry + risk * 0.15),
    preferredEntry: entry,
    stopReference: Number.isFinite(stop) ? stop : n(fallback.stopReference, entry - mult * risk),
    tp1: rowNumber(row, ['tp1','target1']) || entry + mult * risk,
    tp2: rowNumber(row, ['tp2','target2']) || entry + mult * risk * 2,
    tp3: rowNumber(row, ['tp3','target3']) || entry + mult * risk * 3,
    doNotChase: rowNumber(row, ['doNotChase','do_not_chase']) || entry + mult * risk * 0.7,
    source: 'Sinyal Günlüğü + OHLCV replay',
    userFinalR: parseMaybeR(row.netR ?? row.finalR)
  };
}

function scanReplay(signal = {}, candles = [], tf = '4h') {
  const list = candles.filter(c => cClose(c) > 0).sort((a,b) => cTime(a) - cTime(b));
  const signalTime = n(signal.generatedAt, list[0] ? cTime(list[0]) : Date.now());
  const startIdx = Math.max(0, list.findIndex(c => cTime(c) >= signalTime));
  const validBars = Math.max(4, n(signal.validityBars, 24));
  const window = list.slice(startIdx, Math.min(list.length, startIdx + validBars + 1));
  const dir = String(signal.direction).toUpperCase().includes('SHORT') ? 'SHORT' : 'LONG';
  const mult = dir === 'LONG' ? 1 : -1;
  const entryLow = Math.min(n(signal.entryZoneLow), n(signal.entryZoneHigh));
  const entryHigh = Math.max(n(signal.entryZoneLow), n(signal.entryZoneHigh));
  const entry = n(signal.preferredEntry, (entryLow + entryHigh) / 2);
  const stop = n(signal.stopReference, entry - mult * Math.max(Math.abs(entry - entryLow), 1));
  const risk = Math.max(Math.abs(entry - stop), Math.abs(entry) * 0.0005, 1e-9);
  const tp1 = n(signal.tp1, entry + mult * risk);
  const tp2 = n(signal.tp2, entry + mult * risk * 2);
  const tp3 = n(signal.tp3, entry + mult * risk * 3);
  const chase = n(signal.doNotChase, entry + mult * risk * 0.7);
  const events = [];
  const pushEvent = (type, label, candle, note, r = null, tone = 'gray') => {
    events.push({
      type, label, tone, note, r,
      time: candle ? cTime(candle) : signalTime,
      price: candle ? cClose(candle) : entry,
      bar: candle ? Math.max(0, list.indexOf(candle) - startIdx) : 0
    });
  };
  pushEvent('signal', 'Signal Generated', null, `${signal.signalLevel || dir} · ${signal.setup || 'Setup'} · ${signal.regime || 'Regime'}`, 0, 'cyan');
  let entryBar = null, fillPrice = entry, firstOutcome = null, finalStatus = 'OPEN / TRACKING', finalR = 0;
  let tpProgress = { tp1:false, tp2:false, tp3:false, stop:false };
  let mfe = 0, mae = 0;
  let highWater = 0, lowWater = 0;
  for (const candle of window) {
    const hi = cHigh(candle), lo = cLow(candle), cl = cClose(candle);
    const touchesEntry = hi >= entryLow && lo <= entryHigh;
    const stopHit = dir === 'LONG' ? lo <= stop : hi >= stop;
    const tp1Hit = dir === 'LONG' ? hi >= tp1 : lo <= tp1;
    const tp2Hit = dir === 'LONG' ? hi >= tp2 : lo <= tp2;
    const tp3Hit = dir === 'LONG' ? hi >= tp3 : lo <= tp3;
    const chaseHit = dir === 'LONG' ? hi >= chase : lo <= chase;
    if (!entryBar && touchesEntry) {
      entryBar = candle;
      fillPrice = Math.min(Math.max(entry, lo), hi);
      pushEvent('entry', 'Entry Zone Hit', candle, `Simulated fill: ${fillPrice.toFixed(2)} · model: preferred-entry within zone`, 0, 'green');
    }
    if (!entryBar && chaseHit) {
      pushEvent('warning', 'Do-Not-Chase Boundary', candle, 'Fiyat entry olmadan hedefe yaklaştı; manuel giriş tazeliği düşer.', null, 'yellow');
    }
    if (entryBar) {
      const fav = dir === 'LONG' ? (hi - fillPrice) / risk : (fillPrice - lo) / risk;
      const adv = dir === 'LONG' ? (lo - fillPrice) / risk : (fillPrice - hi) / risk;
      highWater = Math.max(highWater, fav);
      lowWater = Math.min(lowWater, adv);
      mfe = highWater; mae = lowWater;
      if (!tpProgress.stop && stopHit) {
        tpProgress.stop = true;
        if (!firstOutcome) firstOutcome = 'STOP before TP1';
        finalStatus = 'STOP REFERENCE HIT';
        finalR = -1;
        pushEvent('stop', 'Stop Reference Hit', candle, `First outcome: ${firstOutcome}`, -1, 'red');
        break;
      }
      if (!tpProgress.tp1 && tp1Hit) {
        tpProgress.tp1 = true;
        if (!firstOutcome) firstOutcome = 'TP1 before Stop';
        finalStatus = 'TP1 CONFIRMED';
        finalR = Math.max(finalR, 1);
        pushEvent('tp1', 'TP1 Hit', candle, `First outcome: ${firstOutcome}`, 1, 'green');
      }
      if (!tpProgress.tp2 && tp2Hit) {
        tpProgress.tp2 = true;
        finalStatus = 'TP2 CONFIRMED';
        finalR = Math.max(finalR, 2);
        pushEvent('tp2', 'TP2 Hit', candle, 'Partial continuation confirmed.', 2, 'green');
      }
      if (!tpProgress.tp3 && tp3Hit) {
        tpProgress.tp3 = true;
        finalStatus = 'TP3 / RUNNER CONFIRMED';
        finalR = Math.max(finalR, 3);
        pushEvent('tp3', 'TP3 Hit', candle, 'Full target path confirmed.', 3, 'green');
        break;
      }
      if (!tpProgress.tp1) {
        const currentR = mult * (cl - fillPrice) / risk;
        if (currentR < finalR || finalR === 0) finalR = currentR;
      }
    }
  }
  if (!entryBar) {
    const last = window[window.length - 1] || list[list.length - 1];
    finalStatus = 'EXPIRED WITHOUT ENTRY';
    finalR = 0;
    pushEvent('expired', 'Expired Without Entry', last, `Validity: ${validBars} bars. Entry zone görülmedi.`, 0, 'yellow');
  } else if (!tpProgress.stop && !tpProgress.tp3) {
    const last = window[window.length - 1] || entryBar;
    const currentR = mult * (cClose(last) - fillPrice) / risk;
    const stale = window.length >= validBars;
    finalR = tpProgress.tp2 ? Math.max(1.6, currentR) : tpProgress.tp1 ? Math.max(0.8, currentR) : currentR;
    if (stale && finalR < 0.5) {
      finalStatus = 'TIME STOP / LOW MOMENTUM';
      pushEvent('time_stop', 'Time Stop', last, `Validity penceresi içinde +0.5R ilerleme zayıf.`, finalR, 'yellow');
    } else {
      pushEvent('mark', 'Replay Mark-to-Market', last, `Window end current R: ${finalR.toFixed(2)}R`, finalR, finalR >= 0 ? 'green' : 'red');
    }
  }
  const leadBars = entryBar ? Math.max(0, list.indexOf(entryBar) - startIdx) : null;
  const tfMinutes = deriveTfMinutes(tf);
  const leadMinutes = leadBars === null ? null : leadBars * tfMinutes;
  const freshness = entryBar ? clamp(100 - leadBars * 5 - Math.max(0, Math.abs(pct(fillPrice, entry)) * 3), 0, 100) : 25;
  const replayQuality = clamp(55 + finalR * 12 + (tpProgress.tp1 ? 12 : 0) - (tpProgress.stop ? 35 : 0) + (entryBar ? 10 : -20) + (freshness - 50) * 0.25, 0, 100);
  const verdict = !entryBar ? 'EXPIRED' : tpProgress.stop ? 'FAILED' : finalR >= 2 ? 'STRONG CONFIRMATION' : finalR >= 1 ? 'CONFIRMED' : finalR >= 0 ? 'WATCH / PARTIAL' : 'WEAK / ADVERSE';
  const eventCounts = {
    total: events.length,
    favorable: events.filter(e => e.tone === 'green').length,
    warning: events.filter(e => e.tone === 'yellow').length,
    adverse: events.filter(e => e.tone === 'red').length
  };
  return {
    signal: { ...signal, direction: dir, preferredEntry: entry, stopReference: stop, tp1, tp2, tp3, doNotChase: chase, entryZoneLow: entryLow, entryZoneHigh: entryHigh },
    events,
    replayPath: window.map((c, i) => ({
      bar: i,
      time: cTime(c),
      close: cClose(c),
      r: entryBar ? mult * (cClose(c) - fillPrice) / risk : 0
    })),
    summary: {
      verdict,
      finalStatus,
      entryHit: Boolean(entryBar),
      firstOutcome: firstOutcome || 'No decisive outcome',
      finalR,
      mfe,
      mae,
      leadBars,
      leadMinutes,
      freshness,
      replayQuality,
      fillPrice,
      risk,
      tpProgress,
      eventCounts,
      expired: !entryBar,
      validityBars: validBars
    }
  };
}

export function buildReplayCandidates({ marketData, journalRows = [], symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const candles = asCandles(marketData);
  const fallback = syntheticSignal(candles, symbol, tf);
  const rows = Array.isArray(journalRows) ? journalRows : [];
  const candidates = rows.slice(0, 12).map((row, i) => normalizeJournalSignal(row, { ...fallback, id: 'journal-' + i })).filter(x => x.preferredEntry && x.stopReference);
  const demoSignals = [fallback];
  if (candles.length > 90) {
    demoSignals.push(syntheticSignal(candles.slice(0, Math.max(40, candles.length - 18)), symbol, tf));
    demoSignals[1].id = 'demo-older-' + symbol + '-' + tf;
    demoSignals[1].setup = 'Trend Pullback Long';
    demoSignals[1].regime = 'Bull Trend';
  }
  const out = [...candidates, ...demoSignals];
  return out.map((x, i) => ({ ...x, id: x.id || 'replay-' + i }));
}

export function makeSignalReplayReport({ marketData, journalRows = [], selectedSignalId = '', symbol = 'BTCUSDT', tf = '4h' } = {}) {
  const candles = asCandles(marketData);
  const candidates = buildReplayCandidates({ marketData, journalRows, symbol, tf });
  const selected = candidates.find(x => String(x.id) === String(selectedSignalId)) || candidates[0] || syntheticSignal(candles, symbol, tf);
  const replay = scanReplay(selected, candles, tf);
  const collection = candidates.slice(0, 10).map(s => {
    const r = scanReplay(s, candles, tf);
    return {
      id: s.id,
      symbol: s.symbol,
      setup: s.setup,
      regime: s.regime,
      direction: s.direction,
      finalR: r.summary.finalR,
      verdict: r.summary.verdict,
      entryHit: r.summary.entryHit,
      firstOutcome: r.summary.firstOutcome,
      mfe: r.summary.mfe,
      mae: r.summary.mae,
      freshness: r.summary.freshness
    };
  });
  const entryHitRate = collection.length ? collection.filter(x => x.entryHit).length / collection.length * 100 : 0;
  const avgFinalR = collection.length ? mean(collection.map(x => x.finalR)) : 0;
  const avgMfe = collection.length ? mean(collection.map(x => x.mfe)) : 0;
  const avgMae = collection.length ? mean(collection.map(x => x.mae)) : 0;
  return {
    version: 'RUx v0.75.6-liquidation-compact-trusted-20260524',
    generatedAt: new Date().toISOString(),
    source: (marketData && marketData.source) || 'market candles / fallback replay',
    symbol,
    tf,
    candidates,
    selectedId: selected.id,
    selected: replay.signal,
    events: replay.events,
    replayPath: replay.replayPath,
    summary: replay.summary,
    aggregate: {
      sampleCount: collection.length,
      entryHitRate,
      avgFinalR,
      avgMfe,
      avgMae,
      positiveRate: collection.length ? collection.filter(x => x.finalR > 0).length / collection.length * 100 : 0
    },
    collection,
    note: 'Signal Replay, teorik sinyal sonucunu bar-by-bar gösterir; emir açmaz, sadece takip ve debugging katmanı üretir.'
  };
}
