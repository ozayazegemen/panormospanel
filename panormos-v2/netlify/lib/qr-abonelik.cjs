// QR Menü aboneliği: sunucu işlevlerinin ortak yardımcıları (Supabase, iyzico, fiyat, süre uzatma, e-posta)
// Ödeme kodu Emlak Panelim'deki (netlify/odeme-ortak.cjs) ile aynı yöntemle yazıldı.
const crypto = require("crypto");

const SITE = "https://panormosmedya.com";
const KDV_ORANI = 0.20;
const FIYAT = { aylik: 249, yillik: 2490 }; // KDV hariç TL
const DENEME_GUN = 14;
const KAPANMA_GUN = 7; // süre dolduktan sonra menünün açık kaldığı gün
const HAVALE = { banka: "Garanti BBVA", sahip: "Panormos Medya Sanayi ve Ticaret Limited Şirketi", iban: "TR200006200118800006295638" };

const YANIT = (statusCode, govde) => ({
  statusCode,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  body: JSON.stringify(govde),
});

function veritabani() {
  const ADRES = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const ANAHTAR = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!ADRES || !ANAHTAR) throw new Error("Sunucu ayarı eksik (SUPABASE_URL / SUPABASE_SERVICE_KEY).");
  const basliklar = { apikey: ANAHTAR, Authorization: `Bearer ${ANAHTAR}`, "Content-Type": "application/json" };
  const istek = (yol, secenek = {}) => fetch(`${ADRES}${yol}`, { ...secenek, headers: { ...basliklar, ...(secenek.headers || {}) } });
  const oku = async (yol) => {
    const r = await istek(`/rest/v1/${yol}`);
    if (!r.ok) throw new Error(`Okunamadı (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const yaz = async (yol, method, govde) => {
    const r = await istek(`/rest/v1/${yol}`, { method, headers: { Prefer: "return=representation" }, body: JSON.stringify(govde) });
    if (!r.ok) throw new Error(`Yazılamadı (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return r.json();
  };
  const kullanici = async (token) => {
    if (!token) return null;
    const r = await fetch(`${ADRES}/auth/v1/user`, { headers: { apikey: ANAHTAR, Authorization: `Bearer ${token}` } });
    return r.ok ? r.json() : null;
  };
  // Doğrulanmış (onaylı) yeni giriş hesabı açar; e-posta zaten kayıtlıysa { varOlan: true } döner
  const hesapAc = async (eposta, sifre, ad) => {
    const r = await istek("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({ email: eposta, password: sifre, email_confirm: true, user_metadata: { qr_menu_ad: ad } }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) return { id: j.id };
    if (r.status === 422 || /already|registered|exists/i.test(JSON.stringify(j))) return { varOlan: true };
    throw new Error(j.msg || j.message || `Hesap açılamadı (${r.status})`);
  };
  const hesapSil = (id) => istek(`/auth/v1/admin/users/${id}`, { method: "DELETE" }).catch(() => {});
  return { oku, yaz, kullanici, hesapAc, hesapSil };
}

// "Bugün" Türkiye saatine göre (UTC+3), YYYY-AA-GG
const bugunTr = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const gunEkle = (tarih, gun) => new Date(new Date(tarih + "T00:00:00Z").getTime() + gun * 86400000).toISOString().slice(0, 10);

function fiyatHesapla(donem) {
  const tutar = FIYAT[donem === "yillik" ? "yillik" : "aylik"];
  return { tutar, toplam: Math.round(tutar * (1 + KDV_ORANI) * 100) / 100, gun: donem === "yillik" ? 365 : 30 };
}

// Aboneliği uzatır: süre dolmadıysa mevcut bitişin üstüne, dolduysa bugünden başlar
async function abonelikUzat(db, menuId, donem) {
  const [menu] = await db.oku(`qr_menuler?id=eq.${encodeURIComponent(menuId)}&select=abonelik_bitis`);
  const bugun = bugunTr();
  const taban = menu?.abonelik_bitis && menu.abonelik_bitis > bugun ? menu.abonelik_bitis : bugun;
  const bitis = gunEkle(taban, donem === "yillik" ? 365 : 30);
  await db.yaz(`qr_menuler?id=eq.${encodeURIComponent(menuId)}`, "PATCH", { abonelik_bitis: bitis, abonelik_donem: donem, aktif: true });
  return bitis;
}

// ---- iyzico (Emlak Panelim ile aynı imza yöntemi) ----
function iyzicoAyar() {
  const apiKey = process.env.IYZICO_API_KEY || "";
  const secretKey = process.env.IYZICO_SECRET_KEY || "";
  const adres = (process.env.IYZICO_BASE_URL || "https://api.iyzipay.com").replace(/\/+$/, "");
  return apiKey && secretKey ? { apiKey, secretKey, adres } : null;
}
async function iyzicoIstek(yol, govde) {
  const ayar = iyzicoAyar();
  if (!ayar) throw new Error("iyzico anahtarları tanımlı değil");
  const metin = JSON.stringify(govde);
  const rastgele = `${Date.now()}${crypto.randomBytes(6).toString("hex")}`;
  const imza = crypto.createHmac("sha256", ayar.secretKey).update(rastgele + yol + metin).digest("hex");
  const yetki = Buffer.from(`apiKey:${ayar.apiKey}&randomKey:${rastgele}&signature:${imza}`).toString("base64");
  const r = await fetch(ayar.adres + yol, {
    method: "POST",
    headers: { Authorization: `IYZWSv2 ${yetki}`, "x-iyzi-rnd": rastgele, "Content-Type": "application/json", Accept: "application/json" },
    body: metin,
  });
  return r.json();
}
const para = (n) => Number(n).toFixed(2);
const gsm = (t) => { const r = String(t || "").replace(/\D/g, "").replace(/^(90|0)/, ""); return /^5\d{9}$/.test(r) ? "+90" + r : undefined; };

// info@panormosmedya.com üzerinden e-posta (MAIL_USER / MAIL_PASS tanımlı değilse sessizce atlanır)
async function epostaGonder(to, subject, text) {
  const user = process.env.MAIL_USER, pass = process.env.MAIL_PASS;
  if (!user || !pass || !to) return false;
  const nodemailer = require("nodemailer");
  const t = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtpout.secureserver.net",
    port: Number(process.env.MAIL_PORT || 465),
    secure: String(process.env.MAIL_PORT || 465) === "465",
    auth: { user, pass },
  });
  await t.sendMail({ from: `"Panormos Medya" <${user}>`, to, subject, text, replyTo: user });
  return true;
}

const oturumAnahtari = (event) => String(event.headers?.authorization || event.headers?.Authorization || "").replace(/^Bearer\s+/i, "");
const istemciIp = (event) => String(event.headers?.["x-nf-client-connection-ip"] || event.headers?.["client-ip"] || "").split(",")[0].trim();

module.exports = { SITE, KDV_ORANI, FIYAT, DENEME_GUN, KAPANMA_GUN, HAVALE, YANIT, veritabani, bugunTr, gunEkle, fiyatHesapla, abonelikUzat, iyzicoAyar, iyzicoIstek, para, gsm, epostaGonder, oturumAnahtari, istemciIp };
