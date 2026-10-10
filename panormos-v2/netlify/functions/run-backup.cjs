// netlify/functions/run-backup.cjs — panelden "Şimdi sunucu yedeği al" düğmesi; yalnızca yönetici çağırabilir.
const { yetkili } = require("../lib/auth.cjs");
const { runBackup } = require("../lib/backup.cjs");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "POST bekleniyor" }) };
  const red = await yetkili(event, { yonetici: true });
  if (red) return { ...red, headers };
  try {
    const sonuc = await runBackup({ email: false });
    return { statusCode: sonuc.ok ? 200 : 500, headers, body: JSON.stringify(sonuc) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ ok: false, error: e.message }) };
  }
};
