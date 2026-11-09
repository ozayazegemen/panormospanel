// Paylaşım Planlayıcı: panelden çağrılır (oturumlu çalışan)
//   GET  ?islem=hesaplar         → bağlı Instagram işletme hesapları
//   GET  ?islem=istatistik&client=<id>&ay=YYYY-MM[&ig=<hesap>] → müşterinin Instagram istatistikleri (ig: müşterinin ek hesaplarından biri; boşsa birincil)
//   GET  ?islem=ozet&client=<id>&ay=YYYY-MM&adet=6[&ig=<hesap>] → son aylar özeti (grafik, önceki aya göre değişim)
//   GET  ?islem=musteri-hesaplar&client=<id> → müşterinin bağlı hesapları (birincil + ek)
//   GET  ?islem=gorsel&url=<instagram görseli> → görseli base64 döndürür (PDF rapor için)
//   POST { islem: "simdi", id }  → bir paylaşımı beklemeden ilerletir (Şimdi paylaş / Tekrar dene)
const { yetkili } = require("../lib/auth.cjs");
const { calistir, hesaplar, istatistikOnbellekli, aylikOzet, musteriHesaplari, musterileriOku } = require("../lib/planlayici.cjs");
const { veritabani } = require("../lib/qr-abonelik.cjs");

const YANIT = (statusCode, govde) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(govde) });

exports.handler = async (event) => {
  const red = await yetkili(event);
  if (red) return red;
  try {
    if (event.httpMethod === "GET") {
      const islem = event.queryStringParameters?.islem;
      if (islem === "hesaplar") return YANIT(200, { hesaplar: await hesaplar() });
      // Rapor PDF'i için Instagram görselini base64 verir (tarayıcı CDN'den doğrudan çizemez)
      if (islem === "gorsel") {
        const u = String(event.queryStringParameters?.url || "");
        let host = ""; try { host = new URL(u).hostname; } catch (e) { return YANIT(400, { error: "Geçersiz adres" }); }
        if (!/^https:/.test(u) || !/(\.cdninstagram\.com|\.fbcdn\.net|\.instagram\.com)$/.test(host)) return YANIT(400, { error: "İzin verilmeyen kaynak" });
        const ctrl = new AbortController(); const zaman = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(u, { signal: ctrl.signal }).finally(() => clearTimeout(zaman));
        if (!r.ok) return YANIT(502, { error: "Görsel alınamadı" });
        const tip = r.headers.get("content-type") || "image/jpeg";
        if (!/^image\//.test(tip)) return YANIT(415, { error: "Görsel değil" });
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 3 * 1024 * 1024) return YANIT(413, { error: "Görsel çok büyük" });
        return YANIT(200, { veri: `data:${tip};base64,${buf.toString("base64")}` });
      }
      if (islem === "musteri-hesaplar") {
        const q = event.queryStringParameters || {};
        if (!/^[0-9a-f-]{36}$/i.test(q.client || "")) return YANIT(400, { error: "Eksik bilgi" });
        const [m] = await musterileriOku(veritabani(), `id=eq.${q.client}`);
        return YANIT(200, { hesaplar: musteriHesaplari(m) });
      }
      if (islem === "istatistik" || islem === "ozet") {
        const q = event.queryStringParameters || {};
        if (!/^[0-9a-f-]{36}$/i.test(q.client || "") || !/^\d{4}-\d{2}$/.test(q.ay || "")) return YANIT(400, { error: "Eksik bilgi" });
        const [m] = await musterileriOku(veritabani(), `id=eq.${q.client}`);
        const liste = musteriHesaplari(m);
        if (!liste.length) return YANIT(200, { bagli: false });
        // İstenen hesap müşteriye bağlı olmalı; verilmediyse birincil
        const secilen = q.ig ? liste.find(h => h.id === String(q.ig)) : liste[0];
        if (!secilen) return YANIT(400, { error: "Bu Instagram hesabı müşteriye bağlı değil." });
        if (islem === "ozet") return YANIT(200, { bagli: true, hesap_id: secilen.id, ...(await aylikOzet(q.client, secilen.id, q.ay, Math.min(12, parseInt(q.adet) || 6), !!secilen.birincil)) });
        return YANIT(200, { bagli: true, hesap_id: secilen.id, ...(await istatistikOnbellekli(q.client, secilen.id, q.ay, q.yenile === "1", !!secilen.birincil)) });
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
