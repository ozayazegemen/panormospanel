// Yapay zekâ üretiminin kendisi: Netlify arka plan işlevi (adı "-background" ile biter, 15 dakikaya kadar çalışır).
// yapay-zeka.cjs tarafından imzalı çağrılır; sonucu planlayici deposunda ai/<is>/sonuc.json'a yazar.
const crypto = require("crypto");
const { uret, durumYaz, isImzasi } = require("../lib/yapay-zeka.cjs");

exports.handler = async (event) => {
  let g = {};
  try { g = JSON.parse(event.body || "{}"); } catch (e) { return { statusCode: 400, body: "Geçersiz istek" }; }
  const is = String(g.is || "");
  const imza = String(event.headers?.["x-is-imza"] || "");
  if (!/^[0-9a-f-]{36}$/i.test(is)) return { statusCode: 400, body: "Geçersiz iş" };
  let beklenen = "";
  try { beklenen = isImzasi(is); } catch (e) { return { statusCode: 500, body: "Sunucu ayarı eksik" }; }
  const a = Buffer.from(imza), b = Buffer.from(beklenen);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { statusCode: 403, body: "İmza geçersiz" };
  try {
    const dosyalar = await uret(is, g.istek || {});
    console.log("yapay zekâ üretti:", is, dosyalar.map(d => d.yol).join(", "));
  } catch (e) {
    console.error("yapay zekâ hatası:", is, e.message);
    try { await durumYaz(is, { durum: "hata", hata: String(e.message || e).slice(0, 500) }); } catch (e2) { /* yazılamadı */ }
  }
  return { statusCode: 200, body: "tamam" };
};
