// RUx v0.71.0 — Ampirik Edge testleri (#1 güven kalibrasyonu + #2 setup performansı)
import { describe, it, expect } from 'vitest';

const _store = {};
globalThis.localStorage = globalThis.localStorage || {
  getItem: k => _store[k] ?? null, setItem: (k, v) => { _store[k] = String(v); }, removeItem: k => { delete _store[k]; },
};

const st = await import('../public/rux_storage.js');
const { unifiedConfidence } = await import('../public/rux_core.js');

function seedSetup(family, idPrefix, wins, losses, winR = 1.6, lossR = -1.0) {
  let i = 0;
  for (; i < wins; i++) {
    const id = `${idPrefix}|${i}`;
    st.recordSignal({ id, time: 1000 + i, asset: 'BTCUSDT', timeframe: '4h', setupDetails: { family }, final: { score: 80 }, noTrade: { blocked: false }, price: 100, manualPlan: { preferredEntry: '100', stopReference: '97', tp1: '106' } });
    st.recordOutcome({ signalId: id, setupFamily: family, status: 'TP1', filled: true, netR: winR, grossR: winR });
  }
  for (let j = 0; j < losses; j++, i++) {
    const id = `${idPrefix}|${i}`;
    st.recordSignal({ id, time: 1000 + i, asset: 'BTCUSDT', timeframe: '4h', setupDetails: { family }, final: { score: 80 }, noTrade: { blocked: false }, price: 100, manualPlan: { preferredEntry: '100', stopReference: '97', tp1: '106' } });
    st.recordOutcome({ signalId: id, setupFamily: family, status: 'STOP', filled: true, netR: lossR, grossR: lossR });
  }
}

describe('#2 — Setup performansı (gerçek geçmiş)', () => {
  it('kazandıran setup pozitif EV ve yüksek PF gösterir', async () => {
    await st.clearAllStorage();
    seedSetup('Trend Pullback', 'TP', 7, 3);
    await st.flushQueue();
    const perf = await st.setupPerformance();
    const tp = perf.families.find(f => f.family === 'Trend Pullback');
    expect(tp.winRate).toBe(70);
    expect(tp.expectancy).toBeGreaterThan(0);
    expect(tp.profitFactor).toBeGreaterThan(1);
  });

  it('kaybettiren setup negatif EV gösterir', async () => {
    await st.clearAllStorage();
    seedSetup('Liquidity Sweep', 'LS', 2, 6);
    await st.flushQueue();
    const perf = await st.setupPerformance();
    const ls = perf.families.find(f => f.family === 'Liquidity Sweep');
    expect(ls.winRate).toBeLessThan(50);
    expect(ls.expectancy).toBeLessThan(0);
  });

  it('genel istatistik tüm çözülmüş sinyalleri toplar', async () => {
    await st.clearAllStorage();
    seedSetup('A', 'A', 5, 5);
    seedSetup('B', 'B', 3, 2);
    await st.flushQueue();
    const perf = await st.setupPerformance();
    expect(perf.totalResolved).toBe(15);
    expect(perf.overall.resolved).toBe(15);
  });
});

describe('#1 — Setup reliability → güven kalibrasyonu', () => {
  it('güçlü pozitif geçmiş reliability >1.0 (20+ örneklem)', async () => {
    await st.clearAllStorage();
    seedSetup('Strong', 'S', 18, 6); // 24 örneklem → izleme kademesi
    await st.flushQueue();
    const rel = await st.setupReliability('Strong');
    expect(rel.sampleSize).toBe(24);
    expect(rel.reliabilityMultiplier).toBeGreaterThan(1.0);
    expect(rel.tier).toBeTruthy();
  });

  it('negatif geçmiş reliability <1.0 (20+ örneklem)', async () => {
    await st.clearAllStorage();
    seedSetup('Weak', 'W', 5, 19); // 24 örneklem, negatif beklenti
    await st.flushQueue();
    const rel = await st.setupReliability('Weak');
    expect(rel.reliabilityMultiplier).toBeLessThan(1.0);
  });

  it('düşük örneklem (<20) nötr çarpan (overfit koruması)', async () => {
    await st.clearAllStorage();
    seedSetup('Few', 'F', 8, 2); // 10 örneklem → teorik, etki yok
    await st.flushQueue();
    const rel = await st.setupReliability('Few');
    expect(rel.reliabilityMultiplier).toBe(1.0);
    expect(rel.tier).toContain('teorik');
  });

  it('geçmişi olmayan setup nötr (1.0)', async () => {
    await st.clearAllStorage();
    const rel = await st.setupReliability('Unknown');
    expect(rel.reliabilityMultiplier).toBe(1.0);
    expect(rel.sampleSize).toBe(0);
  });

  it('iyi geçmiş güveni artırır, kötü geçmiş düşürür', () => {
    const base = { dataConfidence: 75, liquidityScore: 70, htfAlignment: 'HIZALI', manipulationRisk: 25 };
    const neutral = unifiedConfidence({ ...base, reliabilityMultiplier: 1.0 });
    const good = unifiedConfidence({ ...base, sampleSize: 12, reliabilityMultiplier: 1.12 });
    const bad = unifiedConfidence({ ...base, sampleSize: 10, reliabilityMultiplier: 0.7 });
    expect(good.confidence).toBeGreaterThan(neutral.confidence);
    expect(bad.confidence).toBeLessThan(neutral.confidence);
  });

  it('reliability multiplier sonuçta raporlanır', () => {
    const c = unifiedConfidence({ dataConfidence: 70, reliabilityMultiplier: 1.12 });
    expect(c.reliabilityMultiplier).toBe(1.12);
  });
});

describe('#3 — Deployment approval (edge kanıt katmanı)', () => {
  it('veri yokken KANIT_YOK ve deployable:false', async () => {
    await st.clearAllStorage();
    const a = await st.deploymentApproval(null, {});
    expect(a.status).toBe('KANIT_YOK');
    expect(a.deployable).toBe(false);
  });

  it('az örneklemde (10) hâlâ KANIT_YOK', async () => {
    await st.clearAllStorage();
    seedSetup('Az', 'AZ', 7, 3);
    await st.flushQueue();
    const a = await st.deploymentApproval('Az', {});
    expect(a.status).toBe('KANIT_YOK');
    expect(a.deployable).toBe(false);
    expect(a.samplesNeeded).toBeGreaterThan(0);
  });

  it('negatif beklenti REDDEDİLDİ', async () => {
    await st.clearAllStorage();
    // 60 örnek, kaybeden (karışık değil ama EV negatif yeterli)
    for (let i = 0; i < 60; i++) {
      const id = 'NEG|' + i;
      st.recordSignal({ id, time: 1000 + i, asset: 'BTCUSDT', timeframe: '4h', setupDetails: { family: 'Neg' }, final: { score: 80 }, noTrade: { blocked: false }, price: 100, manualPlan: { preferredEntry: '100', stopReference: '97', tp1: '106' } });
      const win = (i * 7919 % 100) < 30; // %30 win, kaybeden
      st.recordOutcome({ signalId: id, setupFamily: 'Neg', status: win ? 'TP1' : 'STOP', filled: true, netR: win ? 1.4 : -1.0, grossR: win ? 1.4 : -1.0 });
    }
    await st.flushQueue();
    const a = await st.deploymentApproval('Neg', {});
    expect(a.status).toBe('REDDEDİLDİ');
    expect(a.deployable).toBe(false);
  });

  it('100+ güçlü pozitif KANITLANDI ve deployable', async () => {
    await st.clearAllStorage();
    for (let i = 0; i < 120; i++) {
      const id = 'STR|' + i;
      st.recordSignal({ id, time: 1000 + i, asset: 'BTCUSDT', timeframe: '4h', setupDetails: { family: 'Str' }, final: { score: 80 }, noTrade: { blocked: false }, price: 100, manualPlan: { preferredEntry: '100', stopReference: '97', tp1: '106' } });
      const win = (i * 7919 % 100) < 60; // %60 win, karışık sıra
      st.recordOutcome({ signalId: id, setupFamily: 'Str', status: win ? 'TP1' : 'STOP', filled: true, netR: win ? 1.6 : -1.0, grossR: win ? 1.6 : -1.0 });
    }
    await st.flushQueue();
    const a = await st.deploymentApproval('Str', {});
    expect(a.status).toBe('KANITLANDI');
    expect(a.deployable).toBe(true);
    expect(a.metrics.expectancy).toBeGreaterThan(0);
  });
});
