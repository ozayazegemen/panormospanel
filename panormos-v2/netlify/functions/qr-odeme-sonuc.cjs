// QR Menü: kartla ödeme sonucu (iyzico, ödeme bitince işletmeyi buraya gönderir)
// iyzico yalnızca bir "token" yollar; ödemenin gerçekten başarılı olduğu sunucudan iyzico'ya sorularak doğrulanır.
const { SITE, veritabani, iyzicoIstek, abonelikUzat } = require("../lib/qr-abonelik.cjs");

const yonlendir = (durum) => ({ statusCode: 303, headers: { Location: `${SITE}/menu-panel?odeme=${durum}`, "Cache-Control": "no-store" }, body: "" });

exports.handler = async (event) => {
  try {
    const ham = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    const token = new URLSearchParams(ham).get("token") || event.queryStringParameters?.token || "";
    if (!/^[A-Za-z0-9-]{10,100}$/.test(token)) return yonlendir("basarisiz");

    const db = veritabani();
    const [odeme] = await db.oku(`qr_odemeler?iyzico_token=eq.${encodeURIComponent(token)}&select=*`);
    if (!odeme) return yonlendir("basarisiz");
    if (odeme.durum === "odendi") return yonlendir("basarili");

    const sonuc = await iyzicoIstek("/payment/iyzipos/checkoutform/auth/ecom/detail", { locale: "tr", conversationId: odeme.id, token });
    const basarili = sonuc?.status === "success" && sonuc.paymentStatus === "SUCCESS"
      && Math.abs(Number(sonuc.paidPrice) - Number(odeme.toplam)) < 0.01
      && (!sonuc.basketId || sonuc.basketId === odeme.id);

    // Yalnızca hâlâ "bekliyor" olan kayıt işlenir; aynı ödeme iki kez süre uzatamaz
    const guncellenen = await db.yaz(`qr_odemeler?id=eq.${odeme.id}&durum=eq.bekliyor`, "PATCH", {
      durum: basarili ? "odendi" : "basarisiz",
      iyzico_odeme_no: sonuc?.paymentId ? String(sonuc.paymentId) : null,
      aciklama: basarili ? "" : String(sonuc?.errorMessage || sonuc?.paymentStatus || "Ödeme tamamlanmadı").slice(0, 300),
      sonuc_tarihi: new Date().toISOString(),
    });
    if (basarili && guncellenen.length) await abonelikUzat(db, odeme.menu_id, odeme.donem);
    return yonlendir(basarili ? "basarili" : "basarisiz");
  } catch (e) {
    console.log("QR ödeme sonucu işlenemedi:", e?.message || e);
    return yonlendir("hata");
  }
};
