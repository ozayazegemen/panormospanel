// Paylaşım Planlayıcı: her 5 dakikada zamanı gelen paylaşımları Instagram'a gönderir (netlify.toml'da zamanlanmış)
// Aynı çalıştırmada reklamlar da ilerletilir (oluşturma adımları, saatlik sonuç tazeleme).
const { calistir } = require("../lib/planlayici.cjs");
const reklam = require("../lib/reklam.cjs");

exports.handler = async () => {
  try {
    const sonuc = await calistir();
    if (sonuc.length) console.log("planlayıcı:", JSON.stringify(sonuc));
    let reklamSonuc = [];
    try { reklamSonuc = await reklam.calistir(); if (reklamSonuc.length) console.log("reklam:", JSON.stringify(reklamSonuc)); }
    catch (e) { console.error("reklam hatası:", e.message); }
    return { statusCode: 200, body: JSON.stringify({ islenen: sonuc.length, reklam: reklamSonuc.length }) };
  } catch (e) {
    console.error("planlayıcı hatası:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
