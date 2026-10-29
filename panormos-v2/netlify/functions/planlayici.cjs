// Paylaşım Planlayıcı: panelden çağrılır (oturumlu çalışan)
//   GET  ?islem=hesaplar         → bağlı Instagram işletme hesapları
//   POST { islem: "simdi", id }  → bir paylaşımı beklemeden ilerletir (Şimdi paylaş / Tekrar dene)
const { yetkili } = require("../lib/auth.cjs");
const { calistir, hesaplar } = require("../lib/planlayici.cjs");

const YANIT = (statusCode, govde) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(govde) });

exports.handler = async (event) => {
  const red = await yetkili(event);
  if (red) return red;
  try {
    if (event.httpMethod === "GET") {
      const islem = event.queryStringParameters?.islem;
      if (islem === "hesaplar") return YANIT(200, { hesaplar: await hesaplar() });
      return YANIT(400, { error: "Bilinmeyen işlem" });
    }
    const g = JSON.parse(event.body || "{}");
    if (g.islem === "simdi" && /^[0-9a-f-]{36}$/i.test(String(g.id || ""))) return YANIT(200, { sonuc: await calistir({ id: g.id }) });
    return YANIT(400, { error: "Bilinmeyen işlem" });
  } catch (e) {
    return YANIT(500, { error: e.message });
  }
};
