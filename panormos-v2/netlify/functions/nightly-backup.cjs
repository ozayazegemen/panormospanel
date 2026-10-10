// netlify/functions/nightly-backup.cjs — her gece kendiliğinden çalışır (zamanlama netlify.toml içinde).
// Tam yedeği "yedekler" deposuna yazar; haftada bir (pazar gecesi) kopyasını e-postayla da gönderir.
const { runBackup } = require("../lib/backup.cjs");

exports.handler = async () => {
  // 23:00 UTC = Türkiye saatiyle 02:00. Cumartesi 23:00 UTC, pazar gecesine denk gelir.
  const haftalik = new Date().getUTCDay() === 6;
  const sonuc = await runBackup({ email: haftalik });
  console.log("Gece yedeği:", JSON.stringify(sonuc));
  return { statusCode: sonuc.ok ? 200 : 500, body: JSON.stringify(sonuc) };
};
