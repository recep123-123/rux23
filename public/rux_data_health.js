/* RUx — Signal Replay & API Reliability Engine */
import { RUX_HEALTH_ENDPOINTS, testApiEndpoint, getRuxSourceLog, clearRuxSourceLog } from './api.js?v=0.75.6-liquidation-compact-trusted-20260524';
import { makeRuxDataConfidenceReport } from './rux_core.js?v=0.75.6-liquidation-compact-trusted-20260524';

export const RUX_DATA_HEALTH_VERSION = 'RUx v0.75.6-liquidation-compact-trusted-20260524';

export const RUX_SIGNAL_DATA_GATES = Object.freeze([
  { min: 85, label: 'NORMAL SIGNAL', action: 'Tam sinyal üretimi açık', multiplier: 1.00, tone: 'green' },
  { min: 70, label: 'CONFIDENCE TAG', action: 'Sinyal üretilebilir; veri etiketi göster', multiplier: 0.90, tone: 'cyan' },
  { min: 50, label: 'WATCH ONLY', action: 'Yeni valid sinyali zayıflat; yalnızca izle/prepare', multiplier: 0.65, tone: 'yellow' },
  { min: 0, label: 'FREEZE NEW SIGNALS', action: 'Yeni sinyal dondur; no-trade / data danger', multiplier: 0.00, tone: 'red' }
]);

export const RUX_DATA_SOURCE_POLICY = Object.freeze({
  criticalCategories: ['ohlcv', 'funding', 'openInterest', 'news', 'metadata', 'system', 'crossExchange'],
  optionalCategories: ['orderflow', 'liquidity', 'onchain', 'sentiment'],
  latencyWarningMs: 1500,
  latencyCriticalMs: 5000,
  staleWarningSec: 60,
  staleCriticalSec: 180,
  description: 'Kaynak eksikse sistem tahmin üretmez; confidence düşer veya yeni sinyal dondurulur.'
});

function suffixPath(path, force) {
  if (!force) return path;
  return path + (path.includes('?') ? '&' : '?') + 'refresh=' + Date.now();
}

function categoryLabel(cat = '') {
  const c = String(cat || '').toLowerCase();
  const map = {
    ohlcv: 'OHLCV', funding: 'FUNDING', openinterest: 'OI', openInterest: 'OI',
    orderflow: 'CVD/DELTA', liquidity: 'LİKİDİTE', news: 'HABER', metadata: 'METADATA',
    onchain: 'ON-CHAIN', sentiment: 'SENTIMENT', crossexchange: 'SPOT/PERP', system: 'SİSTEM'
  };
  return map[c] || map[cat] || String(cat || 'SİSTEM').toUpperCase();
}

function gateForScore(score) {
  const s = Number(score || 0);
  return RUX_SIGNAL_DATA_GATES.find(g => s >= g.min) || RUX_SIGNAL_DATA_GATES.at(-1);
}

function summarizeEndpoint(row = {}) {
  const ok = Boolean(row.ok);
  const optional = Boolean(row.optional);
  const latency = Number(row.latencyMs || 0);
  const fallback = String(row.source || row.provider || '').toLowerCase().includes('fallback');
  const empty = row.count === 0;
  const severity = ok
    ? latency > RUX_DATA_SOURCE_POLICY.latencyCriticalMs || empty ? 'warning' : fallback ? 'fallback' : 'ok'
    : optional ? 'optional-warning' : 'critical';
  return {
    ...row,
    categoryLabel: categoryLabel(row.category),
    fallback,
    empty,
    severity,
    impact: !ok && !optional ? 'Hard signal block adayı' : !ok ? 'Skor ağırlığı düşürülür' : fallback ? 'Canlı/fallback ayrımı gösterilir' : 'Normal',
    note: ok
      ? (fallback ? 'Fallback/proxy kaynak kullanılıyor' : empty ? 'Boş yanıt / veri sayısı 0' : 'Kaynak çalışıyor')
      : (row.error || 'Yanıt alınamadı')
  };
}

function computeOperationalGates(report) {
  const rows = (report.rows || []).map(summarizeEndpoint);
  const criticalFailures = rows.filter(r => !r.ok && !r.optional);
  const optionalFailures = rows.filter(r => !r.ok && r.optional);
  const slowCritical = rows.filter(r => r.ok && !r.optional && Number(r.latencyMs || 0) > RUX_DATA_SOURCE_POLICY.latencyWarningMs);
  const fallbackRows = rows.filter(r => r.fallback);
  const emptyRows = rows.filter(r => r.empty);
  const gate = gateForScore(report.overall);
  const freezeNewSignals = report.overall < 50 || criticalFailures.some(r => ['ohlcv','funding','openInterest','news','metadata','system','crossExchange'].includes(r.category));
  const lowConfidence = !freezeNewSignals && (report.overall < 70 || slowCritical.length > 0 || optionalFailures.length > 1 || fallbackRows.length > 0);
  const mode = freezeNewSignals ? 'DATA DANGER / FREEZE' : lowConfidence ? 'DEGRADED / WATCH' : report.overall >= 85 ? 'LIVE READY' : 'USABLE / TAGGED';
  const recommendation = freezeNewSignals
    ? 'Yeni valid sinyal üretme. Var olan sinyalleri dondur ve veri kaynağını düzelt.'
    : lowConfidence
      ? 'Valid sinyal için confidence düşür; orderflow/on-chain gibi eksik katmanları karar skoruna bağlama.'
      : 'Normal sinyal akışı kullanılabilir; veri etiketi yine görünür kalmalı.';
  return {
    gate,
    mode,
    freezeNewSignals,
    lowConfidence,
    signalConfidenceMultiplier: gate.multiplier,
    criticalFailures,
    optionalFailures,
    slowCritical,
    fallbackRows,
    emptyRows,
    recommendation,
    deployment: freezeNewSignals ? 'REJECT / FIX DATA' : lowConfidence ? 'SHADOW OR WATCH' : 'DEPLOYABLE',
    rows
  };
}

export async function runDataSourceHealthCheck({ force = false } = {}) {
  const started = Date.now();
  const endpointChecks = await Promise.all(RUX_HEALTH_ENDPOINTS.map(async ep => {
    const res = await testApiEndpoint(suffixPath(ep.path, force), {
      timeoutMs: ep.critical ? 8500 : 6500,
      category: ep.category,
      optional: !ep.critical
    });
    return { ...res, name: ep.name, category: ep.category, optional: !ep.critical, critical: ep.critical };
  }));

  const market = endpointChecks.find(x => x.category === 'ohlcv');
  const derivatives = endpointChecks.find(x => x.name === 'Hyperliquid Context') || endpointChecks.find(x => x.category === 'openInterest');
  endpointChecks.push({
    name: 'Spot/Perp Cross-Check',
    path: 'OHLCV ↔ Perp Context',
    category: 'crossExchange',
    ok: Boolean(market?.ok && derivatives?.ok),
    optional: false,
    critical: true,
    latencyMs: Math.max(Number(market?.latencyMs || 0), Number(derivatives?.latencyMs || 0)),
    source: market?.ok && derivatives?.ok ? 'Cross-check hazır' : 'Kaynaklardan biri eksik',
    count: null,
    error: market?.ok && derivatives?.ok ? '' : 'Spot/perp doğrulama zayıf'
  });

  const report = makeRuxDataConfidenceReport(endpointChecks);
  const gates = computeOperationalGates(report);
  const finishedAt = Date.now();
  const payload = {
    version: RUX_DATA_HEALTH_VERSION,
    checkedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - started,
    report: { ...report, rows: gates.rows },
    gates,
    sourceLog: getRuxSourceLog(20),
    policy: RUX_DATA_SOURCE_POLICY
  };
  try { localStorage.setItem('rux.dataHealth.lastReport', JSON.stringify(payload)); } catch {}
  return payload;
}

export function loadLastDataSourceHealthReport() {
  try {
    const raw = localStorage.getItem('rux.dataHealth.lastReport');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearDataSourceHealthLog() {
  clearRuxSourceLog();
  try { localStorage.removeItem('rux.dataHealth.lastReport'); } catch {}
}

export function makeDataHealthExport(payload) {
  const p = payload || loadLastDataSourceHealthReport();
  if (!p) return '{}';
  const compact = {
    version: p.version,
    checkedAt: p.checkedAt,
    durationMs: p.durationMs,
    overall: p.report?.overall,
    label: p.report?.label,
    operationalMode: p.gates?.mode,
    deployment: p.gates?.deployment,
    signalConfidenceMultiplier: p.gates?.signalConfidenceMultiplier,
    criticalFailures: (p.gates?.criticalFailures || []).map(x => ({ name: x.name, path: x.path, error: x.error })),
    optionalFailures: (p.gates?.optionalFailures || []).map(x => ({ name: x.name, path: x.path, error: x.error })),
    fallbackRows: (p.gates?.fallbackRows || []).map(x => ({ name: x.name, source: x.source })),
    categories: p.report?.categories,
    rows: (p.report?.rows || []).map(x => ({ name: x.name, category: x.category, ok: x.ok, optional: x.optional, latencyMs: x.latencyMs, count: x.count, score: x.score, source: x.source, error: x.error }))
  };
  return JSON.stringify(compact, null, 2);
}
