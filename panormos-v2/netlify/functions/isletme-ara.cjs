// netlify/functions/isletme-ara.cjs — "Yeni Müşteri Bul" için Google işletme araması (telefon ve web sitesiyle).
// Netlify ortam değişkeni GOOGLE_PLACES_KEY tanımlı değilse { yok: true } döner; panel o zaman ücretsiz harita verisine geçer.
const { yetkili } = require("../lib/auth.cjs");

const ALANLAR = [
  "places.displayName", "places.formattedAddress", "places.nationalPhoneNumber",
  "places.websiteUri", "places.location", "places.businessStatus", "nextPageToken",
].join(",");
const EN_COK_SAYFA = 3; // Google bir aramada en çok 60 sonuç verir (3 sayfa × 20)

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "POST bekleniyor" }) };
  const red = await yetkili(event);
  if (red) return { ...red, headers };

  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return { statusCode: 200, headers, body: JSON.stringify({ yok: true }) };

  let istek = {};
  try { istek = JSON.parse(event.body || "{}"); } catch (e) { istek = {}; }
  const sorgu = String(istek.sorgu || "").trim().slice(0, 200);
  if (!sorgu) return { statusCode: 400, headers, body: JSON.stringify({ error: "Arama metni boş" }) };

  try {
    const sonuc = [];
    let pageToken = "";
    for (let s = 0; s < EN_COK_SAYFA; s++) {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": ALANLAR },
        body: JSON.stringify({ textQuery: sorgu, languageCode: "tr", regionCode: "TR", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (s > 0) break; // ilk sayfa geldiyse eldekiyle yetin
        return { statusCode: 502, headers, body: JSON.stringify({ error: "Google araması başarısız: " + (d.error?.message || r.status) }) };
      }
      (d.places || []).forEach(p => {
        if (p.businessStatus === "CLOSED_PERMANENTLY") return;
        sonuc.push({
          name: p.displayName?.text || "", phone: p.nationalPhoneNumber || "", website: p.websiteUri || "",
          address: p.formattedAddress || "", lat: p.location?.latitude ?? null, lon: p.location?.longitude ?? null,
        });
      });
      pageToken = d.nextPageToken || "";
      if (!pageToken) break;
    }
    return { statusCode: 200, headers, body: JSON.stringify({ results: sonuc }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
