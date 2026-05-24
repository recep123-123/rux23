# RUx Trade Terminal

Kripto karar destek terminali (vanilla JS SPA + Vercel serverless backend).
Otomatik emir GÖNDERMEZ; manuel karar destek + araştırma ortamıdır.

## Test ve doğrulama

### Hızlı doğrulama (kurulum gerektirmez)
```bash
node smoke-test.mjs
```
93 kontrol: tüm JS dosyalarının gerçek ES import zinciri (boş-ekran üreten
kapanmamış-blok hatalarını yakalar), pages_index sayfa zinciri, **karar yolu
sentetik/demo veri yasağı**, versiyon tutarlılığı, backend CommonJS regresyonu.

### Tam test (vitest gerektirir)
```bash
npm install      # vitest devDependency'sini kurar
npm test         # 106 birim testi (vitest run)
npm run smoke    # standalone smoke testi
```

`installCommand` Vercel'de `echo No install required` olduğundan deploy sırasında
test KOŞMAZ. Deploy öncesi test için GitHub Actions önerilir (bkz. .github/workflows
örneği — P1).

## Edge verisi biriktirme (otomatik tarama)
Sistem, gerçek edge kanıtı için çözülmüş sinyal örneği biriktirir. İki adımda olur:
1. Sinyal sayfasında tarama yapılınca güçlü sinyaller (skor ≥ 60) otomatik kaydedilir.
2. Sonraki taramalarda eski sinyallerin sonucu (TP/stop) ölçülür = "çözülmüş örnek".

**Otomatik tarama modu:** Sinyal Merkezi sayfasındaki "OTO TARAMA" düğmesiyle açılır.
Açıkken, o sekme açık kaldığı sürece her 15 dakikada bir kendiliğinden tarar ve
kaydeder. Tercih localStorage'da saklanır (sayfa değişse de hatırlanır).
SINIR: Tarayıcı bir web sayfasıdır; sekme/uygulama KAPANINCA tarama durur. Gerçek
7/24 arka plan için sunucu tarafı (Vercel Cron + sunucu veritabanı) gerekir — bu
ayrı bir mimari adımdır, mevcut sürümde veri tarayıcıdaki IndexedDB'de tutulur.

## Mimari kuralları (kritik)

### Karar yolu sentetik veri yasağı (v0.72.1)
`analyzeLiveMarketSignal()` çekirdek motoru şu durumlarda **sinyal üretmez**
(`signalProduced: false`, `noTrade.blocked: true`):
- Canlı mum < 60
- `marketData.synthetic === true`
- `marketData.decisionEligible === false`

Hiçbir ekran demo/sentetik mumu karar motoruna canlı veri gibi sokamaz.
Demo veri yalnızca araştırma/backtest/eğitim ekranlarında, açık etiketle kullanılır.

### Sürüm tek kaynağı
Tüm görünür sürüm bilgisi `public/rux_version.js`'ten gelir. index.html, version.json,
package.json bununla senkron tutulur (smoke test bunu doğrular).

### Backend CommonJS
`api/rux.js` CommonJS'tir; `package.json`'da `type: "module"` ASLA olmamalı
(yoksa backend Vercel'de çöker). Smoke test bunu kontrol eder.

## Deploy
GitHub'a yükle → Vercel'de deploy. Statik SPA + `/api/rux.js` serverless fonksiyonu.
`vercel.json` route rewrite'ları her API ucunu `/api/rux.js?route=...`'a yönlendirir.

### ÖNEMLİ — GitHub'a yükleme notları
- **Klasör yapısı düz olmalı.** `public/` içinde ALT KLASÖR yoktur (v0.72.4'te
  `public/assets` kaldırıldı, sticker'lar inline SVG'ye çevrildi). GitHub web
  arayüzü iç içe klasör + 100 dosya/klasör sınırında takılır; bu sürümde sorun yok.
- **`.github` klasörü gizli olduğu için** GitHub web arayüzünden ("This file is
  hidden") yüklenemez. CI istiyorsan iki yol var:
  1. **git push ile yükle** (önerilen): `git init && git add -A && git commit -m "rux" && git push`
     — git tüm dosyaları (.github dahil) gönderir.
  2. **Web arayüzünden manuel oluştur:** GitHub repo → "Add file" → "Create new file"
     → dosya adına `.github/workflows/ci.yml` yaz (klasörler otomatik oluşur) →
     içeriği aşağıdaki `ci.yml`'den yapıştır. (CI olmadan da uygulama çalışır;
     CI sadece deploy öncesi otomatik test kapısıdır.)

### Boş ekran sorunu (troubleshooting)
Uygulama boş açılıyorsa neredeyse her zaman EKSİK DOSYA yüklemesidir:
- `public/` içindeki TÜM `.js` dosyaları ve `omni.css` yüklenmiş olmalı.
- `app.js` şu modülleri import eder; biri eksikse boş ekran olur: api, components,
  pages_index, rux_version, rux_card_audit, rux_storage, rux_ui_audit, rux_global_controls.
- Tarayıcı konsolunu (F12) aç; "404" veya "Failed to load module" görürsen o dosya
  yüklenmemiş demektir. `node smoke-test.mjs` ile yerel olarak doğrula (97 kontrol).

