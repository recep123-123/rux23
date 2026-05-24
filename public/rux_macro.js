/* RUx — Makro Takvim Filtresi (Sprint 3, A14)
   Yüksek etkili makro olaylar (FOMC, CPI, NFP) civarında sinyal güvenini düşürür.
   Ücretsiz/sıfır-API yaklaşım: tekrarlayan olayların yaklaşık takvimini istemci
   tarafında hesaplar. Kesin tarih/saat için ileride ücretsiz RSS (Trading Economics,
   FXEmpire) entegre edilebilir; bu modül o entegrasyona hazır arayüz sunar.

   Not: Bu YAKLAŞIK bir penceredir; kesin ekonomik takvim değildir. Amaç, bilinen
   yüksek-volatilite saatlerinde sistemin temkinli olmasıdır (rehber §13 No-Trade).
*/

// UTC bazlı. NFP: her ayın ilk Cuma'sı 13:30 UTC. CPI: ~ayın 10-15'i 13:30 UTC (değişken).
// FOMC: yılda 8 toplantı; tarihleri sabit değildir, bu yüzden yaklaşık aylık pencere kullanılır.

function firstFridayOfMonth(year, monthIndex) {
  const d = new Date(Date.UTC(year, monthIndex, 1));
  const day = d.getUTCDay(); // 0=Pazar, 5=Cuma
  const offset = (5 - day + 7) % 7;
  return new Date(Date.UTC(year, monthIndex, 1 + offset, 13, 30, 0));
}

// FOMC 2026 yaklaşık toplantı tarihleri (kamuya açık takvimden; karar günü 19:00 UTC).
// Bunlar yaklaşık tutulmuştur; kesin saat için RSS entegrasyonu önerilir.
const FOMC_2026_APPROX = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'
];

// ── GERÇEK 2026 EKONOMİK TAKVİM (kamuya açık resmi açıklama tarihleri) ──
// Kaynak: Federal Reserve (FOMC), BLS (CPI/NFP), BEA (PCE), ECB.
// Saatler UTC. CPI/NFP/PCE: 13:30 UTC (08:30 ET). FOMC karar: 19:00 UTC. ECB: ~13:15 UTC.
const MACRO_CALENDAR_2026 = [
  // FOMC kararları (Federal Reserve resmi takvimi)
  { date: '2026-01-28', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-03-18', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-04-29', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-06-17', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-07-29', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-09-16', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-10-28', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-12-09', time: '19:00', type: 'FOMC', name: 'Fed Faiz Kararı (FOMC)', impact: 'çok yüksek', region: 'US' },
  // CPI / TÜFE (BLS resmi açıklama takvimi)
  { date: '2026-01-13', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Aralık)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-02-11', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Ocak)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-03-11', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Şubat)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-04-10', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Mart)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-05-13', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Nisan)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-06-10', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Mayıs)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-07-14', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Haziran)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-08-12', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Temmuz)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-09-11', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Ağustos)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-10-13', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Eylül)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-11-13', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Ekim)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-12-10', time: '13:30', type: 'CPI', name: 'TÜFE / CPI (Kasım)', impact: 'çok yüksek', region: 'US' },
  // NFP (her ayın ilk Cuma'sı, BLS)
  { date: '2026-01-09', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-02-06', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-03-06', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-04-03', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-05-08', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-06-05', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-07-02', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-08-07', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-09-04', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-10-02', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-11-06', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  { date: '2026-12-04', time: '13:30', type: 'NFP', name: 'Tarım Dışı İstihdam (NFP)', impact: 'çok yüksek', region: 'US' },
  // ECB Faiz Kararları
  { date: '2026-01-29', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-03-12', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-04-16', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-06-04', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-07-23', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-09-10', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-10-29', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  { date: '2026-12-17', time: '13:15', type: 'ECB', name: 'ECB Faiz Kararı', impact: 'yüksek', region: 'EU' },
  // PCE Çekirdek Enflasyon (BEA, Fed'in tercih ettiği gösterge)
  { date: '2026-01-30', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-02-27', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-03-27', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-04-30', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-05-29', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-06-26', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-07-31', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-08-28', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-09-25', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-10-30', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-11-25', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
  { date: '2026-12-23', time: '13:30', type: 'PCE', name: 'PCE Çekirdek Enflasyon', impact: 'yüksek', region: 'US' },
];

// Yaklaşan makro olayları döndürür (Makro Takvim sayfası için).
// Şimdiden itibaren ileriye doğru, en yakın N olay. TSİ saati UTC+3 olarak hesaplanır.
export function upcomingMacroEvents(now = Date.now(), { count = 12, region = null } = {}) {
  const list = MACRO_CALENDAR_2026
    .map(ev => {
      const utc = new Date(`${ev.date}T${ev.time}:00Z`).getTime();
      return { ...ev, ts: utc };
    })
    .filter(ev => ev.ts >= now - 2 * 3600000) // 2 saat öncesine kadar (devam eden)
    .filter(ev => !region || ev.region === region)
    .sort((a, b) => a.ts - b.ts)
    .slice(0, count)
    .map(ev => {
      const d = new Date(ev.ts);
      // TSİ (UTC+3)
      const tsi = new Date(ev.ts + 3 * 3600000);
      const hh = String(tsi.getUTCHours()).padStart(2, '0');
      const mm = String(tsi.getUTCMinutes()).padStart(2, '0');
      const hoursAway = Math.round(((ev.ts - now) / 3600000) * 10) / 10;
      return {
        date: ev.date, time: `${hh}:${mm} TSİ`, name: ev.name, type: ev.type,
        impact: ev.impact, region: ev.region, ts: ev.ts, hoursAway,
        daysAway: Math.floor((ev.ts - now) / 86400000),
      };
    });
  return list;
}

function hoursBetween(a, b) { return Math.abs(a - b) / 3600000; }

// Bir zaman damgası için makro olay riskini değerlendirir.
// windowHours: olaydan kaç saat önce/sonra "riskli" sayılacağı.
export function evaluateMacroEventRisk(now = Date.now(), { windowHours = 4 } = {}) {
  // Gerçek 2026 takvimini kullan (yaklaşık hesap yerine). Takvim biterse yaklaşığa düş.
  let events = MACRO_CALENDAR_2026.map(ev => ({
    type: ev.type, label: ev.name, impact: ev.impact,
    time: new Date(`${ev.date}T${ev.time}:00Z`).getTime()
  }));

  // Takvim kapsamı dışındaysa (örn. 2027) yaklaşık hesaba düş
  if (!events.length || now > Math.max(...events.map(e => e.time)) + 86400000) {
    const d = new Date(now);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    events = [];
    for (const m of [month - 1, month, month + 1]) {
      const yy = year + Math.floor(m / 12);
      const mm = ((m % 12) + 12) % 12;
      const nfp = firstFridayOfMonth(yy, mm);
      events.push({ type: 'NFP', label: 'Tarım Dışı İstihdam (NFP)', time: nfp.getTime(), impact: 'çok yüksek' });
      const cpi = new Date(Date.UTC(yy, mm, 12, 13, 30, 0));
      events.push({ type: 'CPI', label: 'TÜFE / Enflasyon (CPI)', time: cpi.getTime(), impact: 'çok yüksek' });
    }
    for (const ds of FOMC_2026_APPROX) {
      events.push({ type: 'FOMC', label: 'Fed Faiz Kararı (FOMC)', time: new Date(ds + 'T19:00:00Z').getTime(), impact: 'çok yüksek' });
    }
  }

  // En yakın olayı bul
  let nearest = null, nearestHours = Infinity;
  for (const ev of events) {
    const h = hoursBetween(now, ev.time);
    if (h < nearestHours) { nearestHours = h; nearest = ev; }
  }

  const inWindow = nearest && nearestHours <= windowHours;
  const fomcWindow = nearest?.type === 'FOMC' && nearestHours <= windowHours * 1.5;
  const atRisk = !!(inWindow || fomcWindow);
  return {
    macroEventRisk: atRisk,
    nearestEvent: nearest ? {
      type: nearest.type, label: nearest.label, impact: nearest.impact,
      hoursAway: Math.round(nearestHours * 10) / 10,
      direction: nearest.time >= now ? 'yaklaşıyor' : 'geçti',
      at: new Date(nearest.time).toISOString(),
    } : null,
    windowHours,
    note: atRisk
      ? `${nearest.label} ${nearest.time >= now ? 'yaklaşıyor' : 'yakın zamanda geçti'} (${Math.round(nearestHours * 10) / 10} saat). Sinyal güveni düşürülmeli.`
      : 'Yakın makro olay yok.',
    approximate: false,
  };
}

// Sinyal motoruna geçirilecek basit bayrak (marketData.macroEventRisk).
export function currentMacroFlag(now = Date.now()) {
  return evaluateMacroEventRisk(now).macroEventRisk;
}
