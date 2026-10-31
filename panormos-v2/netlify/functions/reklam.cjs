// Reklamlar: panelden çağrılır (oturumlu çalışan)
//   GET  ?islem=hesap                      → Panormos reklam hesabı özeti (para birimi, ödeme yöntemi, harcanan)
//   GET  ?islem=gonderiler&client=<id>     → müşterinin öne çıkarılabilecek Instagram gönderileri
//   GET  ?islem=konum&q=  | ?islem=ilgi&q= → hedef kitle aramaları (il/ilçe, ilgi alanı)
//   GET  ?islem=tahmin&hedef=<json>&amac=  → tahmini kitle büyüklüğü
//   POST { islem:"olustur", ... }          → yeni reklam (Meta'da kampanya + reklam seti + kreatif + reklam)
//   POST { islem:"ilerle"|"yenile"|"durdur"|"devam"|"bitir"|"sil"|"tekrar", id }
const { yetkili, panelKullanicisi } = require("../lib/auth.cjs");
const { hesapBilgi, gonderiler, konumAra, ilgiAra, kitleTahmin, olustur, islem } = require("../lib/reklam.cjs");
const { veritabani } = require("../lib/qr-abonelik.cjs");

const YANIT = (statusCode, govde) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(govde) });
const UUID = /^[0-9a-f-]{36}$/i;

exports.handler = async (event) => {
  const red = await yetkili(event);
  if (red) return red;
  try {
    const q = event.queryStringParameters || {};
    if (event.httpMethod === "GET") {
      if (q.islem === "hesap") return YANIT(200, await hesapBilgi());
      if (q.islem === "gonderiler") {
        if (!UUID.test(q.client || "")) return YANIT(400, { error: "Eksik bilgi" });
        const [m] = await veritabani().oku(`clients?id=eq.${q.client}&select=ig_user_id`);
        if (!m?.ig_user_id) return YANIT(200, { bagli: false, gonderiler: [] });
        return YANIT(200, { bagli: true, gonderiler: await gonderiler(m.ig_user_id) });
      }
      if (q.islem === "konum") return YANIT(200, { sonuc: String(q.q || "").trim().length < 2 ? [] : await konumAra(String(q.q).trim().slice(0, 60)) });
      if (q.islem === "ilgi") return YANIT(200, { sonuc: String(q.q || "").trim().length < 2 ? [] : await ilgiAra(String(q.q).trim().slice(0, 60)) });
      if (q.islem === "tahmin") {
        let hedef = {}; try { hedef = JSON.parse(q.hedef || "{}"); } catch (e) { /* boş hedef */ }
        return YANIT(200, await kitleTahmin(hedef, q.amac));
      }
      return YANIT(400, { error: "Bilinmeyen işlem" });
    }
    const g = JSON.parse(event.body || "{}");
    if (g.islem === "olustur") {
      if (!UUID.test(String(g.client_id || ""))) return YANIT(400, { error: "Müşteri seçin" });
      const kisi = await panelKullanicisi(event).catch(() => null);
      return YANIT(200, { reklam: await olustur(g, kisi) });
    }
    if (["ilerle", "yenile", "durdur", "devam", "bitir", "sil", "tekrar"].includes(g.islem) && UUID.test(String(g.id || ""))) return YANIT(200, { reklam: await islem(g.id, g.islem) });
    return YANIT(400, { error: "Bilinmeyen işlem" });
  } catch (e) {
    return YANIT(500, { error: e.message });
  }
};
