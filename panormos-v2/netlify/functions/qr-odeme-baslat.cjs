// QR Menü: abonelik ödemesi
//   GET  → { kart, havale, fiyat }  kartla ödeme açık mı, havale bilgileri ve fiyatlar
//   POST { donem, sozlesme_onay } + Authorization: Bearer <oturum anahtarı> → { url } iyzico ödeme sayfası
// Tutar tarayıcıdan alınmaz; fiyat sunucuda sabit (lib/qr-abonelik.cjs).
const { SITE, FIYAT, KDV_ORANI, HAVALE, YANIT, veritabani, fiyatHesapla, iyzicoAyar, iyzicoIstek, para, gsm, oturumAnahtari, istemciIp } = require("../lib/qr-abonelik.cjs");

exports.handler = async (event) => {
  if (event.httpMethod === "GET") return YANIT(200, { kart: !!iyzicoAyar(), havale: HAVALE, fiyat: FIYAT, kdv: KDV_ORANI });
  if (event.httpMethod !== "POST") return YANIT(405, { error: "Yalnızca POST" });
  if (!iyzicoAyar()) return YANIT(503, { error: "Kartla ödeme henüz açık değil. Havale/EFT ile ödeyebilirsiniz." });

  let g;
  try { g = JSON.parse(event.body || "{}"); } catch { return YANIT(400, { error: "Geçersiz istek." }); }
  const donem = g.donem === "yillik" ? "yillik" : "aylik";
  if (!g.sozlesme_onay) return YANIT(400, { error: "Devam etmek için abonelik koşullarını onaylamanız gerekir." });

  try {
    const db = veritabani();
    const kullanici = await db.kullanici(oturumAnahtari(event));
    if (!kullanici?.id) return YANIT(401, { error: "Oturumunuz sona ermiş. Yeniden giriş yapın." });
    const [menu] = await db.oku(`qr_menuler?sahip_user_id=eq.${kullanici.id}&select=*`);
    if (!menu) return YANIT(400, { error: "Hesabınıza bağlı menü bulunamadı." });
    const fiyat = fiyatHesapla(donem);
    const ip = istemciIp(event) || "85.34.78.112";

    const [odeme] = await db.yaz("qr_odemeler", "POST", {
      menu_id: menu.id, olusturan_id: kullanici.id, donem, tutar: fiyat.tutar, toplam: fiyat.toplam,
      yontem: "kart", durum: "bekliyor", sozlesme_onay: true, sozlesme_ip: ip,
    });

    const adres = { contactName: menu.ad, city: "Türkiye", country: "Turkey", address: menu.adres || "Belirtilmedi" };
    const sonuc = await iyzicoIstek("/payment/iyzipos/checkoutform/initialize/auth/ecom", {
      locale: "tr",
      conversationId: odeme.id,
      price: para(fiyat.toplam),
      paidPrice: para(fiyat.toplam),
      currency: "TRY",
      basketId: odeme.id,
      paymentGroup: "SUBSCRIPTION",
      callbackUrl: `${SITE}/.netlify/functions/qr-odeme-sonuc`,
      enabledInstallments: [1],
      buyer: {
        id: kullanici.id, name: menu.ad, surname: "-", email: kullanici.email || menu.sahip_eposta || "info@panormosmedya.com",
        gsmNumber: gsm(menu.sahip_telefon || menu.telefon), identityNumber: "11111111111",
        registrationAddress: adres.address, city: adres.city, country: adres.country, ip,
      },
      billingAddress: adres,
      basketItems: [{ id: `qr-${donem}`, name: `QR Menü — ${donem === "yillik" ? "1 yıllık" : "1 aylık"} abonelik`, category1: "Yazılım aboneliği", itemType: "VIRTUAL", price: para(fiyat.toplam) }],
    });

    if (sonuc?.status !== "success" || !sonuc.paymentPageUrl) {
      await db.yaz(`qr_odemeler?id=eq.${odeme.id}`, "PATCH", { durum: "basarisiz", aciklama: String(sonuc?.errorMessage || "Ödeme formu açılamadı").slice(0, 300), sonuc_tarihi: new Date().toISOString() }).catch(() => {});
      return YANIT(502, { error: "Ödeme sayfası açılamadı: " + (sonuc?.errorMessage || "bilinmeyen hata") });
    }
    await db.yaz(`qr_odemeler?id=eq.${odeme.id}`, "PATCH", { iyzico_token: sonuc.token });
    return YANIT(200, { url: sonuc.paymentPageUrl });
  } catch (e) {
    console.log("QR ödeme başlatılamadı:", e?.message || e);
    return YANIT(500, { error: "Ödeme başlatılamadı. Lütfen biraz sonra tekrar deneyin." });
  }
};
