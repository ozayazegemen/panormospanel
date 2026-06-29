# Panormos Medya — Ajans Yönetim Paneli

Sosyal medya ajansı için müşteri, görev, takvim ve fatura yönetim sistemi.  
Claude Sonnet 4.6 ile AI destekli içerik üretimi.

---

## Vercel ile Yayına Alma (Önerilen)

### 1. GitHub'a yükleyin
1. [github.com](https://github.com) adresine gidin ve ücretsiz hesap açın
2. Sağ üstteki **+** butonuna tıklayın → **New repository**
3. İsim verin: `panormos-panel` → **Create repository**
4. Bu klasördeki tüm dosyaları yeni repository'ye yükleyin

### 2. Vercel'e bağlayın
1. [vercel.com](https://vercel.com) adresine gidin
2. **Continue with GitHub** ile giriş yapın
3. **New Project** → `panormos-panel` repository'sini seçin
4. **Environment Variables** bölümüne şunu ekleyin:
   - Key: `VITE_ANTHROPIC_API_KEY`
   - Value: Anthropic API key'iniz
5. **Deploy** butonuna basın — 2 dakikada hazır!

### 3. Kullanıma alın
- Vercel size `panormos-panel.vercel.app` gibi bir link verir
- Bu linki ekibinizle paylaşın
- Telefonda "Ana Ekrana Ekle" diyerek uygulama gibi kullanabilirsiniz

---

## Anthropic API Key Nasıl Alınır?

1. [console.anthropic.com](https://console.anthropic.com) adresine gidin
2. Hesap oluşturun ve kredi kartı ekleyin
3. **API Keys** → **Create Key** 
4. Oluşturulan key'i Vercel'deki environment variable'a yapıştırın

> AI özellikleri (caption üretimi, analiz, raporlar) bu key olmadan çalışmaz.  
> Aylık kullanıma göre ücretlendirilir — normal kullanımda çok düşük çıkar.

---

## Bilgisayarda Çalıştırma

```bash
# Node.js gerekli — nodejs.org adresinden indirin
npm install
npm run dev
# Tarayıcıda: http://localhost:5173
```

---

## Özellikler

- **Müşteriler** — İşletme profili, paylaşım/çekim günleri, platform yönetimi
- **Faturalar** — Fatura takibi, ödeme durumu, tahsilat raporu
- **Medya arşivi** — Müşteri bazında dosya yönetimi
- **İçerik takvimi** — Tüm müşterilerin paylaşım planı
- **Görev takibi** — Kanban panosu, öncelik ve atama
- **Fikir havuzu** — Platform bazlı içerik fikirleri
- **Çalışanlar** — Ekip profilleri ve müşteri atamaları
- **AI Asistan** — Caption üretimi, müşteri analizi, finansal rapor, görev önerisi

---

Panormos Medya San. ve Tic. Ltd. Şti.
