// QR Menü: her sabah abonelik hatırlatması (netlify.toml'da zamanlanmış)
// Bitişe 3 gün ve 1 gün kala, bitiş günü ve süre dolduktan sonraki 7 gün boyunca her gün işletmeye e-posta gider.
// Süre dolalı 7 günü geçen menü kapanır (aktif = false); ödeme gelince yeniden açılır.
const { SITE, KAPANMA_GUN, veritabani, bugunTr, gunEkle, epostaGonder } = require("../lib/qr-abonelik.cjs");

const tarihYaz = (t) => new Date(t + "T00:00:00Z").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

exports.handler = async () => {
  const db = veritabani();
  const bugun = bugunTr();
  const menuler = await db.oku(`qr_menuler?abonelik_bitis=not.is.null&kendi_kaydi=eq.true&select=id,ad,slug,aktif,abonelik_bitis,abonelik_donem,sahip_eposta`);
  let gonderilen = 0, kapanan = 0;
  for (const m of menuler) {
    const kalan = Math.round((new Date(m.abonelik_bitis + "T00:00:00Z") - new Date(bugun + "T00:00:00Z")) / 86400000);
    const deneme = !m.abonelik_donem;
    let konu = "", metin = "";
    if (kalan === 3 || kalan === 1) {
      konu = `${deneme ? "Deneme süreniz" : "Aboneliğiniz"} ${kalan} gün sonra bitiyor`;
      metin = `${m.ad} QR menünüzün ${deneme ? "ücretsiz deneme süresi" : "aboneliği"} ${tarihYaz(m.abonelik_bitis)} tarihinde bitiyor. Menünüzün kesintisiz açık kalması için ödemenizi panelinizden yapabilirsiniz.`;
    } else if (kalan <= 0 && kalan > -KAPANMA_GUN) {
      const kapanis = gunEkle(m.abonelik_bitis, KAPANMA_GUN);
      konu = "QR menünüzün süresi doldu";
      metin = `${m.ad} QR menünüzün süresi ${tarihYaz(m.abonelik_bitis)} tarihinde doldu. Menünüzü şu an düzenleyemezsiniz; ödeme yapılmazsa ${tarihYaz(kapanis)} tarihinde menü misafirlerinize kapanır.`;
    } else if (kalan <= -KAPANMA_GUN && m.aktif) {
      await db.yaz(`qr_menuler?id=eq.${m.id}`, "PATCH", { aktif: false }).catch(() => {});
      kapanan++;
      konu = "QR menünüz kapatıldı";
      metin = `${m.ad} QR menünüz, süresi dolduğu ve ödeme yapılmadığı için kapatıldı. Ödemenizi yaptığınızda menünüz aynı adresle, bütün ürünleriyle yeniden açılır.`;
    }
    if (!konu || !m.sahip_eposta) continue;
    const ok = await epostaGonder(m.sahip_eposta, konu, `Merhaba,\n\n${metin}\n\nÖdeme ve menü paneli: ${SITE}/menu-giris\nMenünüz: ${SITE}/m/${m.slug}\n\nSorunuz olursa bu e-postayı yanıtlayabilirsiniz.\n\nPanormos Medya`).catch(() => false);
    if (ok) gonderilen++;
  }
  console.log(`QR abonelik hatırlatma: ${menuler.length} menü, ${gonderilen} e-posta, ${kapanan} kapanan`);
  return { statusCode: 200, body: "ok" };
};
