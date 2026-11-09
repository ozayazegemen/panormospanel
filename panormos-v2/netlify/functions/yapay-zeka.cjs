// Yapay zekâ görsel/video üretimi — panelden çağrılır (oturumlu çalışan)
//   GET  ?islem=saglayicilar                 → hangi sağlayıcılar hazır (anahtarı tanımlı)
//   GET  ?islem=durum&is=<kimlik>            → işin durumu; bitince dosyalar + önizleme bağlantıları
//   POST { islem:"baslat", saglayici, istem, oran, sure, referansYolu, musteriAd } → işi arka plana verir, { is } döner
//   POST { islem:"istem", musteriAd, sektor, tur, konu }     → görsel istemi önerisi (Gemini)
//   POST { islem:"aciklama", musteriAd, sektor, tur, konu, istem } → Instagram açıklaması önerisi (Gemini)
const crypto = require("crypto");
const { yetkili } = require("../lib/auth.cjs");
const { saglayicilar, metinHazir, durumOku, durumYaz, isImzasi, istemOner, aciklamaOner, imzaliBaglanti, ORANLAR, MUSTERI_DEPO } = require("../lib/yapay-zeka.cjs");

const YANIT = (statusCode, govde) => ({ statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body: JSON.stringify(govde) });
const guvenliYol = (y) => typeof y === "string" && /^[A-Za-z0-9_./-]{1,300}$/.test(y) && !y.includes("..") ? y : null;

exports.handler = async (event) => {
  const red = await yetkili(event);
  if (red) return red;
  try {
    if (event.httpMethod === "GET") {
      const q = event.queryStringParameters || {};
      if (q.islem === "saglayicilar") return YANIT(200, { saglayicilar: saglayicilar(), metin: metinHazir(), oranlar: ORANLAR });
      if (q.islem === "durum") {
        if (!/^[0-9a-f-]{36}$/i.test(q.is || "")) return YANIT(400, { error: "Geçersiz iş kimliği" });
        const d = await durumOku(q.is);
        if (!d) return YANIT(200, { durum: "bekliyor" });
        if (d.durum === "tamam") {
          const onizleme = [];
          for (const f of d.dosyalar || []) { try { onizleme.push(await imzaliBaglanti(f.yol, f.depo)); } catch (e) { onizleme.push(null); } }
          return YANIT(200, { ...d, onizleme });
        }
        return YANIT(200, d);
      }
      return YANIT(400, { error: "Bilinmeyen işlem" });
    }
    let g = {};
    try { g = JSON.parse(event.body || "{}"); } catch (e) { return YANIT(400, { error: "Geçersiz istek" }); }

    if (g.islem === "istem") return YANIT(200, { metin: await istemOner(g) });
    if (g.islem === "aciklama") return YANIT(200, { metin: await aciklamaOner(g) });

    if (g.islem === "baslat") {
      const s = saglayicilar().find(x => x.id === g.saglayici);
      if (!s) return YANIT(400, { error: "Sağlayıcı seçin." });
      if (!s.hazir) return YANIT(400, { error: `${s.ad} için anahtar tanımlı değil (Netlify: ${s.anahtar}).` });
      const istem = String(g.istem || "").trim().slice(0, 2000);
      if (!istem && s.id !== "higgsfield_kling") return YANIT(400, { error: "Ne üretileceğini yazın." });
      const oran = ORANLAR.includes(g.oran) ? g.oran : "1:1";
      const hamRef = Array.isArray(g.referanslar) ? g.referanslar : (g.referansYolu ? [{ yol: g.referansYolu, depo: g.referansDepo }] : []);
      const referanslar = [];
      for (const r of hamRef.slice(0, 6)) { const yol = guvenliYol(r?.yol); if (!yol) return YANIT(400, { error: "Geçersiz dosya yolu" }); referanslar.push({ yol, depo: r.depo === MUSTERI_DEPO ? MUSTERI_DEPO : undefined }); }
      if (s.id === "higgsfield_kling" && !referanslar.length) return YANIT(400, { error: "Video için başlangıç görseli seçin." });
      const is = crypto.randomUUID();
      const clientId = /^[0-9a-f-]{36}$/i.test(String(g.clientId || "")) ? String(g.clientId) : null;
      const istek = { saglayici: s.id, istem, oran, sure: Number(g.sure) === 10 ? 10 : 5, referanslar, musteriAd: String(g.musteriAd || "").slice(0, 60), clientId };
      await durumYaz(is, { durum: "bekliyor", asama: "sıraya alındı", saglayici: s.id });
      // Arka plan işlevi: uzun sürebilir, hemen 202 döner. Çağrı iş kimliğiyle imzalanır.
      const kok = (process.env.URL || "https://panormosmedya.com").replace(/\/+$/, "");
      const r = await fetch(`${kok}/.netlify/functions/yapay-zeka-background`, { method: "POST", headers: { "Content-Type": "application/json", "x-is-imza": isImzasi(is) }, body: JSON.stringify({ is, istek }) });
      if (!(r.status === 202 || r.ok)) {
        await durumYaz(is, { durum: "hata", hata: `Arka plan işlevi başlatılamadı (${r.status}).` });
        return YANIT(500, { error: `Üretim başlatılamadı (${r.status}).` });
      }
      return YANIT(200, { is });
    }
    return YANIT(400, { error: "Bilinmeyen işlem" });
  } catch (e) {
    return YANIT(500, { error: e.message });
  }
};
