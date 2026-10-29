// Paylaşım Planlayıcı: panelden çağrılır (oturumlu çalışan)
//   GET  ?islem=hesaplar         → bağlı Instagram işletme hesapları
//   GET  ?islem=istatistik&client=<id>&ay=YYYY-MM → müşterinin Instagram istatistikleri
//   POST { islem: "simdi", id }  → bir paylaşımı beklemeden ilerletir (Şimdi paylaş / Tekrar dene)
const { yetkili } = require("../lib/auth.cjs");
const { calistir, hesaplar, istatistik } = require("../lib/planlayici.cjs");
const { veritabani } = require("../lib/qr-abonelik.cjs");

const YANIT = (statusCode, govde) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(govde) });

exports.handler = async (event) => {
  const red = await yetkili(event);
  if (red) return red;
  try {
    if (event.httpMethod === "GET") {
      const islem = event.queryStringParameters?.islem;
      if (islem === "hesaplar") return YANIT(200, { hesaplar: await hesaplar() });
      if (islem === "istatistik") {
        const q = event.queryStringParameters || {};
        if (!/^[0-9a-f-]{36}$/i.test(q.client || "") || !/^\d{4}-\d{2}$/.test(q.ay || "")) return YANIT(400, { error: "Eksik bilgi" });
        const [m] = await veritabani().oku(`clients?id=eq.${q.client}&select=ig_user_id`);
        if (!m?.ig_user_id) return YANIT(200, { bagli: false });
        return YANIT(200, { bagli: true, ...(await istatistik(m.ig_user_id, q.ay)) });
      }
      return YANIT(400, { error: "Bilinmeyen işlem" });
    }
    const g = JSON.parse(event.body || "{}");
    if (g.islem === "simdi" && /^[0-9a-f-]{36}$/i.test(String(g.id || ""))) return YANIT(200, { sonuc: await calistir({ id: g.id }) });
    return YANIT(400, { error: "Bilinmeyen işlem" });
  } catch (e) {
    return YANIT(500, { error: e.message });
  }
};
