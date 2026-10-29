// Paylaşım Planlayıcı: her 5 dakikada zamanı gelen paylaşımları Instagram'a gönderir (netlify.toml'da zamanlanmış)
const { calistir } = require("../lib/planlayici.cjs");

exports.handler = async () => {
  try {
    const sonuc = await calistir();
    if (sonuc.length) console.log("planlayıcı:", JSON.stringify(sonuc));
    return { statusCode: 200, body: JSON.stringify({ islenen: sonuc.length }) };
  } catch (e) {
    console.error("planlayıcı hatası:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
