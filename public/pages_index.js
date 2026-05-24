/* RUx — Pages registry (sayfa tamamlama) */
import { renderKokpit } from './kokpit.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderPiyasa } from './piyasa.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSmartMoney } from './smart_money.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderPriceAction } from './price_action.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSmcRadar } from './smc_radar.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderBugun } from './bugun.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderCoinPano } from './coin_pano.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSinyal } from './sinyal.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSinyalDetay } from './sinyal_detay.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSinyalGunlugu } from './sinyal_gunlugu.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderTest } from './test.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSetupMatrisi } from './setup_matrisi.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderKuralKarsilastirma } from './kural_karsilastirma.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderUserFidelity } from './user_fidelity.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSignalReplay } from './signal_replay.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderIstatistik } from './istatistik.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderKalibrasyon } from './kalibrasyon.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderOptimizer } from './optimizer.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderWalkforward } from './walkforward.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderMontecarlo } from './montecarlo.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderKatiPa } from './kati_pa.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderOteGiris } from './ote_giris.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderRvol } from './rvol.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderAralikSapmasi } from './aralik_sapmasi.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderRisk } from './risk.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderAtr } from './atr.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderKuralSetleri } from './kural_setleri.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderStratejiUretici } from './strateji_uretici.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderStratejiKarnesi } from './strateji_karnesi.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderNoTradeTest } from './no_trade_test.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderEmirGecmisi } from './emir_gecmisi.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderAcikPozisyon } from './acik_pozisyon.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderPortfoyIsi } from './portfoy_isi.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderHaber } from './haber.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderSistem } from './sistem.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderWebhookApi } from './webhook_api.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderOrderflowKaynak } from './orderflow_kaynak.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderDataKaynakSagligi } from './data_kaynak_sagligi.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderDataAdapterDiagnostics } from './data_adapter_diagnostics.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderBinanceLive } from './binance_live.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderAlarm } from './alarm.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderEdgeResearch } from './edge_research.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderGenericPage } from './generic.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

/* ── v0.49.4 yeni modüller ── */
import { renderPozisyonBuyuklugu } from './pozisyon_buyuklugu.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderHesaplayicilar } from './hesaplayicilar.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import { renderDonusturuculer } from './donusturuculer.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import {
  renderStop, renderDrawdown, renderPortfoyRisk,
  renderKorelasyonIzleme, renderSermayeKoruma, renderPortfoyBt
} from './risk_modules.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import {
  renderVolatilite, renderAnalizKorelasyon,
  renderPiyasaDongu, renderAkisAnalizi, renderAnalizZincir
} from './analiz_modules.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import {
  renderPiyasaHaritasi, renderSektorHaritasi, renderLikidasyonHaritasi,
  renderIsiHaritasi, renderGlobalEndeksler, renderMakroTakvim
} from './piyasa_modules.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import {
  renderCoinPerf, renderCoinIliski, renderCoinLikid,
  renderCoinHeat, renderCoinRapor
} from './coin_modules.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import {
  renderLikiditeAnalizi, renderLikiditeHaritasi, renderHeatmapAnaliz
} from './likidite_modules.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';
import {
  renderDerivsOI, renderDerivsFunding, renderDerivsCVD, renderDerivsLiq, renderDerivsHeatmap
} from './derivs.js?v=0.75.4-cvd-headerfix-overflowfix-20260524';

const REGISTRY = {
  /* ── temel ── */
  kokpit: renderKokpit,
  piyasa: renderPiyasa,
  'akis-smart': renderSmartMoney,
  'akis-whale': renderSmartMoney,
  'akis-flow': renderSmartMoney,
  pa: renderPriceAction,
  'analiz-fiyat': renderPriceAction,
  smc: renderSmcRadar,
  bugun: renderBugun,
  'coin-pano': renderCoinPano,
  'coin-bakis': renderCoinPano,
  sinyal: renderSinyal,
  'sinyal-detay': renderSinyalDetay,
  'sinyal-gunlugu': renderSinyalGunlugu,
  'analiz-genel': renderSinyalDetay,
  test: renderTest,
  backtest: renderTest,
  'setup-matrisi': renderSetupMatrisi,
  'kural-karsilastirma': renderKuralKarsilastirma,
  'user-fidelity': renderUserFidelity,
  'signal-replay': renderSignalReplay,
  'edge-research': renderEdgeResearch,
  istatistik: renderIstatistik,
  kalibrasyon: renderKalibrasyon,
  optimizer: renderOptimizer,
  walkforward: renderWalkforward,
  montecarlo: renderMontecarlo,
  'kati-pa-kurallari': renderKatiPa,
  'ote-giris': renderOteGiris,
  rvol: renderRvol,
  'aralik-sapmasi': renderAralikSapmasi,
  risk: renderRisk,
  atr: renderAtr,
  'kural-setleri': renderKuralSetleri,
  'strateji-uretici': renderStratejiUretici,
  'strateji-karnesi': renderStratejiKarnesi,
  'no-trade-test': renderNoTradeTest,
  'emir-gecmisi': renderEmirGecmisi,
  'acik-pozisyonlar': renderAcikPozisyon,
  'portfoy-isi': renderPortfoyIsi,
  haber: renderHaber,
  'news-pulse': renderHaber,
  sistem: renderSistem,
  'webhook-api': renderWebhookApi,
  'orderflow-kaynak': renderOrderflowKaynak,
  'data-kaynak-sagligi': renderDataKaynakSagligi,
  'adapter-diagnostics': renderDataAdapterDiagnostics,
  'binance-live': renderBinanceLive,
  alarm: renderAlarm,
  'alarm-yonetimi': renderAlarm,

  /* ── v0.49.4 yeni rotalar ── */
  /* Risk grubu */
  'pozisyon-buyuklugu': renderPozisyonBuyuklugu,
  stop: renderStop,
  drawdown: renderDrawdown,
  'portfoy-risk': renderPortfoyRisk,
  'korelasyon-izleme': renderKorelasyonIzleme,
  'sermaye-koruma': renderSermayeKoruma,
  'portfoy-bt': renderPortfoyBt,

  /* Sistem grubu */
  hesaplayicilar: renderHesaplayicilar,
  donusturuculer: renderDonusturuculer,

  /* Analiz grubu */
  volatilite: renderVolatilite,
  'analiz-korelasyon': renderAnalizKorelasyon,
  'piyasa-dongu': renderPiyasaDongu,
  'akis-analizi': renderAkisAnalizi,
  'analiz-zincir': renderAnalizZincir,

  /* Piyasa grubu */
  'piyasa-haritasi': renderPiyasaHaritasi,
  'sektor-haritasi': renderSektorHaritasi,
  'likidasyon-haritasi': renderLikidasyonHaritasi,
  'isi-haritasi': renderIsiHaritasi,
  'global-endeksler': renderGlobalEndeksler,
  'makro-takvim': renderMakroTakvim,
  'derivs-oi': renderDerivsOI,
  'derivs-funding': renderDerivsFunding,
  'derivs-cvd': renderDerivsCVD,
  'derivs-liq': renderDerivsLiq,
  'derivs-heatmap': renderDerivsHeatmap,

  /* Coin grubu */
  'coin-perf': renderCoinPerf,
  'coin-iliski': renderCoinIliski,
  'coin-likid': renderCoinLikid,
  'coin-heat': renderCoinHeat,
  'coin-rapor': renderCoinRapor,

  /* Likidite & heatmap */
  'likidite-analizi': renderLikiditeAnalizi,
  'likidite-haritasi': renderLikiditeHaritasi,
  'heatmap-analiz': renderHeatmapAnaliz,
};

export async function renderPage(pageId, host, params) {
  const fn = REGISTRY[pageId] || ((h) => renderGenericPage(h, pageId));
  await fn(host, params);
}
