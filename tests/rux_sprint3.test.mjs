// RUx — Sprint 3: Makro takvim + Asset Universe testleri
import { describe, it, expect } from 'vitest';
import { evaluateMacroEventRisk, currentMacroFlag } from '../public/rux_macro.js';
import { classifyAsset, classifyUniverse, assetConfidenceMultiplier } from '../public/rux_universe.js';

describe('A14 — Makro takvim filtresi', () => {
  it('FOMC günü yakınında risk true', () => {
    // 2026-03-18 19:00 UTC FOMC; +1 saat
    const r = evaluateMacroEventRisk(new Date('2026-03-18T20:00:00Z').getTime());
    expect(r.macroEventRisk).toBe(true);
    expect(r.nearestEvent.type).toBe('FOMC');
  });

  it('sakin günde risk false', () => {
    const r = evaluateMacroEventRisk(new Date('2026-03-25T12:00:00Z').getTime());
    expect(r.macroEventRisk).toBe(false);
  });

  it('NFP (ilk Cuma) yakınında risk true', () => {
    // 2026 Mart ilk Cuma = 6 Mart 13:30 UTC
    const r = evaluateMacroEventRisk(new Date('2026-03-06T14:00:00Z').getTime());
    expect(r.macroEventRisk).toBe(true);
  });

  it('currentMacroFlag boolean döner', () => {
    expect(typeof currentMacroFlag()).toBe('boolean');
  });

  it('nearestEvent yapısı tutarlı', () => {
    const r = evaluateMacroEventRisk(Date.now());
    expect(r.nearestEvent).not.toBe(null);
    expect(r.nearestEvent).toHaveProperty('type');
    expect(r.nearestEvent).toHaveProperty('hoursAway');
  });
});

describe('A13 — Asset Universe Manager', () => {
  it('core major her zaman tradeable', () => {
    const a = classifyAsset({ symbol: 'BTCUSDT', volumeUsd: 1000, spreadBps: 100 });
    expect(a.bucket).toBe('TRADEABLE');
    expect(a.tier).toBe('CORE');
    expect(a.confidenceMultiplier).toBe(1.0);
  });

  it('yüksek hacim + dar spread → tradeable', () => {
    const a = classifyAsset({ symbol: 'AAAUSDT', volumeUsd: 100e6, spreadBps: 5 });
    expect(a.bucket).toBe('TRADEABLE');
  });

  it('düşük hacim → excluded, sinyal üretilmez', () => {
    const a = classifyAsset({ symbol: 'LOWUSDT', volumeUsd: 1e6, spreadBps: 8 });
    expect(a.bucket).toBe('EXCLUDED');
    expect(a.confidenceMultiplier).toBe(0.0);
  });

  it('geniş spread → excluded', () => {
    const a = classifyAsset({ symbol: 'WIDEUSDT', volumeUsd: 100e6, spreadBps: 60 });
    expect(a.bucket).toBe('EXCLUDED');
  });

  it('orta hacim → research, güven azaltılır', () => {
    const a = classifyAsset({ symbol: 'MIDUSDT', volumeUsd: 20e6, spreadBps: 10 });
    expect(a.bucket).toBe('RESEARCH');
    expect(a.confidenceMultiplier).toBeLessThan(1.0);
  });

  it('yeni listeleme → research', () => {
    const a = classifyAsset({ symbol: 'NEWUSDT', volumeUsd: 100e6, spreadBps: 5, listingAgeDays: 5 });
    expect(a.bucket).toBe('RESEARCH');
  });

  it('classifyUniverse kovaları doğru sayar', () => {
    const u = classifyUniverse([
      { symbol: 'BTCUSDT', volumeUsd: 30e9, spreadBps: 1 },
      { symbol: 'LOWUSDT', volumeUsd: 1e6, spreadBps: 8 },
      { symbol: 'MIDUSDT', volumeUsd: 20e6, spreadBps: 10 },
    ]);
    expect(u.summary.tradeable).toBe(1);
    expect(u.summary.research).toBe(1);
    expect(u.summary.excluded).toBe(1);
  });

  it('assetConfidenceMultiplier core için 1.0', () => {
    expect(assetConfidenceMultiplier('ETHUSDT')).toBe(1.0);
  });
});
