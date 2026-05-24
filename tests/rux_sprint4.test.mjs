// RUx — Sprint 4: WebSocket + Governance + Hata bildirimi testleri
import { describe, it, expect } from 'vitest';

// localStorage stub
const _store = {};
globalThis.localStorage = globalThis.localStorage || {
  getItem: k => _store[k] ?? null,
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: k => { delete _store[k]; },
};

const { LiveChannel, isWebSocketAvailable } = await import('../public/rux_ws.js');
const { versionRuleset, loadRulesetVersions, activeRulesetVersion, loadRecentErrors, recordAudit, flushQueue, clearAllStorage } = await import('../public/rux_storage.js');

describe('A15+A16 — WebSocket canlı kanal', () => {
  it('isWebSocketAvailable boolean döner', () => {
    expect(typeof isWebSocketAvailable()).toBe('boolean');
  });

  it('emit ile state birikir', () => {
    const ch = new LiveChannel();
    ch.symbol = 'BTCUSDT';
    ch.emit({ price: 42000 });
    ch.emit({ liveCvd: 1.5 });
    const s = ch.snapshot();
    expect(s.price).toBe(42000);
    expect(s.liveCvd).toBe(1.5);
  });

  it('cross-exchange düşük ayrışma → YÜKSEK uyum', () => {
    const ch = new LiveChannel();
    ch.symbol = 'BTCUSDT';
    ch.emit({ price: 42000, hlPrice: 42010 });
    const x = ch.crossExchangeCheck();
    expect(x.available).toBe(true);
    expect(x.agreement).toBe('YÜKSEK');
    expect(x.warning).toBe(null);
  });

  it('cross-exchange yüksek ayrışma → DÜŞÜK uyum + uyarı', () => {
    const ch = new LiveChannel();
    ch.symbol = 'BTCUSDT';
    ch.emit({ price: 42000, hlPrice: 42500 });
    const x = ch.crossExchangeCheck();
    expect(x.agreement).toBe('DÜŞÜK');
    expect(x.warning).not.toBe(null);
  });

  it('tek fiyat varsa cross-exchange unavailable', () => {
    const ch = new LiveChannel();
    ch.symbol = 'BTCUSDT';
    ch.emit({ price: 42000 });
    expect(ch.crossExchangeCheck().available).toBe(false);
  });

  it('onUpdate callback tetiklenir', () => {
    let count = 0;
    const ch = new LiveChannel({ onUpdate: () => count++ });
    ch.symbol = 'X';
    ch.emit({ price: 1 });
    ch.emit({ price: 2 });
    expect(count).toBe(2);
  });
});

describe('A20 — Governance / kural sürümleme', () => {
  it('ilk kural seti yeni sürüm açar', () => {
    const r = versionRuleset({ name: 'Test RS', setup: 'trend', thresholds: { minFinal: 75 } });
    expect(r.isNew).toBe(true);
    expect(r.version).toBeTruthy();
    expect(r.hash).toMatch(/^rs_/);
  });

  it('aynı içerik tekrar sürümlenmez', () => {
    const def = { name: 'Dup RS', setup: 'sweep', thresholds: { minFinal: 80 } };
    const a = versionRuleset(def);
    const b = versionRuleset(def);
    expect(b.isNew).toBe(false);
    expect(b.hash).toBe(a.hash);
  });

  it('farklı içerik yeni sürüm açar', () => {
    const a = versionRuleset({ name: 'Diff', thresholds: { minFinal: 70 } });
    const b = versionRuleset({ name: 'Diff', thresholds: { minFinal: 90 } });
    expect(b.hash).not.toBe(a.hash);
    expect(b.isNew).toBe(true);
  });

  it('activeRulesetVersion en son sürümü döner', () => {
    versionRuleset({ name: 'Latest', thresholds: { minFinal: 60 }, marker: Date.now() });
    const active = activeRulesetVersion();
    expect(active).not.toBe(null);
    expect(active.version).toBeTruthy();
  });
});

describe('A19 — Hata bildirim kanalı', () => {
  it('audit error kayıtları loadRecentErrors ile süzülür', async () => {
    await clearAllStorage();
    recordAudit({ type: 'js_error', message: 'test hata 1' });
    recordAudit({ type: 'unhandled_rejection', message: 'promise red' });
    recordAudit({ type: 'normal_event', message: 'hata değil' });
    await flushQueue();
    const errors = await loadRecentErrors();
    expect(errors.length).toBe(2);
    expect(errors.every(e => /error|rejection/.test(e.type))).toBe(true);
  });
});
