// QR Menü: işletmenin kendi kendine kaydı (panormosmedya.com/menu-kayit)
// Giriş hesabı açar, işletmenin menüsünü 14 günlük denemeyle oluşturur ve hesaba bağlar; Panormos'a haber verir.
// Kötüye kullanıma karşı: gizli tuzak alanı, aynı adresten günde en çok 3 kayıt.
const { SITE, DENEME_GUN, YANIT, veritabani, bugunTr, gunEkle, epostaGonder, istemciIp } = require("../lib/qr-abonelik.cjs");

const sluglastir = (s) => String(s || "").toLocaleLowerCase("tr")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
// Panormos'un kendi demo ve sayfa adresleri işletmelere verilmez
const AYRILMIS = ["restoran", "cafe", "kafe", "burger", "lokanta", "bar", "demo", "ornek", "menu", "qr", "panormos", "admin", "test"];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return YANIT(405, { error: "Yalnızca POST" });
  let g;
  try { g = JSON.parse(event.body || "{}"); } catch { return YANIT(400, { error: "Geçersiz istek." }); }
  if (g.web_sitesi) return YANIT(200, { ok: true }); // tuzak alan doluysa bottur; sessizce geç

  const ad = String(g.isletme || "").trim().replace(/\s+/g, " ").slice(0, 80);
  const eposta = String(g.eposta || "").trim().toLocaleLowerCase("tr");
  const sifre = String(g.sifre || "");
  const telefon = String(g.telefon || "").trim().slice(0, 30);
  if (ad.length < 2) return YANIT(400, { error: "İşletme adını yazın." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) return YANIT(400, { error: "Geçerli bir e-posta yazın." });
  if (sifre.length < 8) return YANIT(400, { error: "Şifre en az 8 karakter olmalı." });
  if (String(telefon).replace(/\D/g, "").length < 10) return YANIT(400, { error: "Telefon numaranızı yazın." });
  if (!g.sozlesme) return YANIT(400, { error: "Devam etmek için abonelik koşullarını onaylamanız gerekir." });

  let db;
  try { db = veritabani(); } catch (e) { return YANIT(500, { error: e.message }); }
  const ip = istemciIp(event);
  try {
    if (ip) {
      const dun = new Date(Date.now() - 86400000).toISOString();
      const son = await db.oku(`qr_menuler?kayit_ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(dun)}&select=id`);
      if (son.length >= 3) return YANIT(429, { error: "Bu bağlantıdan bugün çok fazla kayıt yapıldı. Yarın tekrar deneyin ya da bize yazın." });
    }

    const hesap = await db.hesapAc(eposta, sifre, ad);
    if (hesap.varOlan) return YANIT(409, { error: "Bu e-posta ile zaten bir hesap var. Giriş yapın ya da şifrenizi sıfırlayın." });

    // Boş bir bağlantı adı bul: kahve-duragi, kahve-duragi-2 …
    let taban = sluglastir(ad) || "menu";
    if (AYRILMIS.includes(taban)) taban = `${taban}-menu`;
    let slug = taban;
    for (let i = 2; i < 50; i++) {
      const var_ = await db.oku(`qr_menuler?slug=eq.${encodeURIComponent(slug)}&select=id`);
      if (!var_.length) break;
      slug = `${taban}-${i}`;
    }

    let menu;
    try {
      [menu] = await db.yaz("qr_menuler", "POST", {
        ad, slug, aktif: true, sablon: "zarif",
        sahip_user_id: hesap.id, sahip_eposta: eposta, sahip_telefon: telefon,
        kendi_kaydi: true, abonelik_bitis: gunEkle(bugunTr(), DENEME_GUN), kayit_ip: ip,
      });
    } catch (e) {
      await db.hesapSil(hesap.id); // menü açılamadıysa yarım hesap kalmasın
      throw e;
    }
    // Hazır kategoriler: işletme düzenleyip silebilir
    const hazir = [["Kahvaltı", "Breakfast"], ["Yemekler", "Food"], ["Tatlılar", "Desserts"], ["İçecekler", "Drinks"]];
    await db.yaz("qr_kategoriler", "POST", hazir.map(([a, e], i) => ({ menu_id: menu.id, ad: a, ad_en: e, sira: i }))).catch(() => {});

    await epostaGonder("info@panormosmedya.com", `Yeni QR menü kaydı: ${ad}`,
      `Yeni bir işletme QR menüye kaydoldu.\n\nİşletme: ${ad}\nE-posta: ${eposta}\nTelefon: ${telefon}\nMenü: ${SITE}/m/${slug}\nDeneme bitişi: ${menu.abonelik_bitis}\n\nÜrün çekimi teklifi için arayabilirsiniz.`).catch(() => {});
    await epostaGonder(eposta, "QR menünüz hazır",
      `Merhaba,\n\n${ad} için QR menünüz açıldı. 14 gün boyunca ücretsiz kullanabilirsiniz.\n\nMenünüz: ${SITE}/m/${slug}\nDüzenlemek için: ${SITE}/menu-giris\n\nMenünüz için profesyonel ürün çekimi isterseniz bu e-postayı yanıtlamanız yeterli.\n\nPanormos Medya`).catch(() => {});

    return YANIT(200, { ok: true, slug });
  } catch (e) {
    console.log("QR menü kaydı başarısız:", e?.message || e);
    return YANIT(500, { error: "Kayıt tamamlanamadı. Lütfen biraz sonra tekrar deneyin." });
  }
};
