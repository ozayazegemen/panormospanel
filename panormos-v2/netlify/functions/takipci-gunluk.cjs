// Instagram takipçi arşivi: her gece bağlı müşterilerin takipçi sayısı ve günlük yeni/ayrılan (netlify.toml'da zamanlanmış)
const { takipciArsivle } = require("../lib/planlayici.cjs");

exports.handler = async () => {
  try {
    const sonuc = await takipciArsivle();
    console.log("takipçi arşivi:", JSON.stringify(sonuc));
    return { statusCode: 200, body: JSON.stringify({ islenen: sonuc.length, sonuc }) };
  } catch (e) {
    console.error("takipçi arşivi hatası:", e.message);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
