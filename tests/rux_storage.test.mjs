// RUx v0.67.0 — Kalıcı Veri Katmanı testleri (Sprint 2)
// IndexedDB test ortamında yok → localStorage degrade yolu test edilir.

import { describe, it, expect } from 'vitest';

// localStorage stub (her testten önce temiz)
const _store = {};
globalThis.localStorage = {
  getItem: k => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};

const {
  recordSignal, recordOutcome, recordAudit, flushQueue,
  loadSignals, loadOutcomes, loadAudit, loadJoinedHistory,
  storageStats, clearAllStorage, isPersistenceAvailable, resolvePendingOutcomes
} = await import('../public/rux_storage.js');
const { simulateManualPlanOutcome } = await import('../public/rux_core.js');

function sig(id, time, overrides = {}) {
  return {
    id, time, asset: 'BTCUSDT', timeframe: '4h', direction: 'LONG / AL',
    setup: 'Trend Pullback Long', setupDetails: { family: 'Trend Pullback' },
    regime: { active: 'BOĞA' }, final: { score: 82, label: 'GEÇERLİ SİNYAL' },
    scores: { setup: 80 }, data: { score: 90, measured: { oi: true } },
    manualPlan: { preferredEntry: '100', stopReference: '96', tp1: '108', tp2: '114', tp3: '120', rrExpected: '1.8R' },
    noTrade: { blocked: false }, price: 100, ...overrides
  };
}

describe('A08 — Kalıcı depo (localStorage degrade)', () => {
  it('Node ortamında IndexedDB yok → degrade', () => {
    expect(isPersistenceAvailable()).toBe(false);
  });

  it('sinyal kaydedip okuyabilir', async () => {
    await clearAllStorage();
    recordSignal(sig('A|4h|1000', 1000));
    recordSignal(sig('B|4h|2000', 2000, { asset: 'ETHUSDT' }));
    await flushQueue();
    const rows = await loadSignals();
    expect(rows.length).toBe(2);
    // en yeni önce
    expect(rows[0].time).toBe(2000);
  });

  it('aynı id tekrar yazılırsa duplicate olmaz (put)', async () => {
    await clearAllStorage();
    recordSignal(sig('SAME|4h|1000', 1000));
    await flushQueue();
    recordSignal(sig('SAME|4h|1000', 1000, { final: { score: 95 } }));
    await flushQueue();
    const rows = await loadSignals();
    expect(rows.length).toBe(1);
    expect(rows[0].finalScore).toBe(95);
  });

  it('symbol filtresi çalışır', async () => {
    await clearAllStorage();
    recordSignal(sig('A|4h|1000', 1000, { asset: 'BTCUSDT' }));
    recordSignal(sig('B|4h|1000', 1000, { asset: 'ETHUSDT' }));
    await flushQueue();
    const btc = await loadSignals({ symbol: 'BTCUSDT' });
    expect(btc.length).toBe(1);
    expect(btc[0].symbol).toBe('BTCUSDT');
  });

  it('outcome kaydedip okuyabilir', async () => {
    await clearAllStorage();
    recordOutcome({ signalId: 'X|4h|1000', status: 'TP1', netR: 1.7, fillTime: 5000 });
    await flushQueue();
    const out = await loadOutcomes();
    expect(out.length).toBe(1);
    expect(out[0].status).toBe('TP1');
  });

  it('audit log çalışır', async () => {
    await clearAllStorage();
    recordAudit({ type: 'test_event', message: 'merhaba' });
    await flushQueue();
    const a = await loadAudit();
    expect(a.length).toBe(1);
    expect(a[0].type).toBe('test_event');
  });

  it('storageStats kapsama oranı hesaplar', async () => {
    await clearAllStorage();
    recordSignal(sig('S1|4h|1000', 1000));
    recordSignal(sig('S2|4h|2000', 2000));
    recordOutcome({ signalId: 'S1|4h|1000', status: 'TP1', netR: 1.5, fillTime: 3000 });
    await flushQueue();
    const stats = await storageStats();
    expect(stats.signals).toBe(2);
    expect(stats.outcomes).toBe(1);
    expect(stats.coveragePct).toBe(50);
  });

  it('loadJoinedHistory sinyal+outcome birleştirir', async () => {
    await clearAllStorage();
    recordSignal(sig('J1|4h|1000', 1000));
    recordOutcome({ signalId: 'J1|4h|1000', status: 'TP1', netR: 2.0, fillTime: 3000 });
    await flushQueue();
    const joined = await loadJoinedHistory();
    expect(joined.length).toBe(1);
    expect(joined[0].outcome).not.toBe(null);
    expect(joined[0].outcome.netR).toBe(2.0);
  });
});

describe('A09 — Outcome resolution köprüsü', () => {
  it('olgunlaşmamış sinyal çözülmez', async () => {
    await clearAllStorage();
    recordSignal(sig('M|4h|1000', 1000));
    await flushQueue();
    // sadece 3 future bar (minBarsAfter=8'in altında)
    const future = Array.from({ length: 3 }, (_, i) => ({ open: 100, high: 102, low: 99, close: 101, volume: 1000, time: 1000 + (i + 1) * 14400000 }));
    const r = await resolvePendingOutcomes({ symbol: 'BTCUSDT', tf: '4h', candles: future, simulateFn: simulateManualPlanOutcome });
    expect(r.resolved).toBe(0);
  });

  it('olgunlaşmış sinyal gerçek sonuçla çözülür', async () => {
    await clearAllStorage();
    recordSignal(sig('R|4h|1000', 1000));
    await flushQueue();
    // giriş bölgesine değip TP'ye giden senaryo
    const prices = [99.5, 99, 100.5, 102, 104, 106, 108.5, 110, 109, 111];
    const future = prices.map((pp, i) => ({ open: pp * 0.999, high: pp * 1.005, low: pp * 0.995, close: pp, volume: 1000, time: 1000 + (i + 1) * 14400000 }));
    const r = await resolvePendingOutcomes({ symbol: 'BTCUSDT', tf: '4h', candles: future, simulateFn: simulateManualPlanOutcome, minBarsAfter: 5 });
    expect(r.resolved).toBe(1);
    const out = await loadOutcomes();
    expect(out.length).toBe(1);
    expect(out[0].filled).toBe(true);
  });

  it('zaten çözülmüş sinyal tekrar çözülmez', async () => {
    await clearAllStorage();
    recordSignal(sig('D|4h|1000', 1000));
    recordOutcome({ signalId: 'D|4h|1000', status: 'TP1', netR: 1.5, fillTime: 3000 });
    await flushQueue();
    const future = Array.from({ length: 12 }, (_, i) => ({ open: 100, high: 110, low: 99, close: 108, volume: 1000, time: 1000 + (i + 1) * 14400000 }));
    const r = await resolvePendingOutcomes({ symbol: 'BTCUSDT', tf: '4h', candles: future, simulateFn: simulateManualPlanOutcome, minBarsAfter: 5 });
    expect(r.resolved).toBe(0);
  });

  it('geçersiz girdilerde güvenli (0 döner)', async () => {
    const r = await resolvePendingOutcomes({ symbol: null, candles: [], simulateFn: null });
    expect(r.resolved).toBe(0);
  });
});

function genCandles(n = 140, { drift = 0.003, start = 100, wobble = 0.006 } = {}) {
  const out = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p = p * (1 + drift + Math.sin(i / 5) * wobble);
    const o = p * 0.998;
    out.push({ open: o, high: Math.max(o, p) * 1.004, low: Math.min(o, p) * 0.996, close: p, volume: 1000 + (i % 7) * 120, time: Date.now() - (n - i) * 14400000 });
  }
  return out;
}
