// Yapay zekâ ile görsel ve video üretimi (Paylaşım Planlayıcı → "Yapay zekâ ile oluştur").
// Sağlayıcılar (anahtar Netlify ortam değişkeninde tanımlıysa panelde görünür):
//   gemini            Nano Banana (Google Gemini görsel modeli)            GEMINI_API_KEY
//   openai            ChatGPT görseli (OpenAI gpt-image)                    OPENAI_API_KEY
//   higgsfield_soul   Higgsfield Soul (görsel)                              HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET
//   higgsfield_kling  Higgsfield Kling 2.6 (başlangıç görselinden video)    HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET
// Üretim uzun sürebildiği için arka plan işlevinde çalışır; durum ve sonuç "planlayici" deposunda
// ai/<is>/sonuc.json dosyasında tutulur, panel bunu sorar. Üretilen dosyalar ai/<is>/ altına yazılır ve
// planlı paylaşıma doğrudan eklenebilir (aynı depo).
const crypto = require("crypto");

const DEPO = "planlayici";          // iş durumu (ai/<is>/sonuc.json) ve planlayıcıdan üretilenler
const MUSTERI_DEPO = "client-media"; // müşteri sayfasından üretilenler: müşterinin Medya'sına gider
const ORANLAR = ["1:1", "4:5", "9:16", "16:9"];

function depoAyar() {
  const ADRES = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const ANAHTAR = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!ADRES || !ANAHTAR) throw new Error("Sunucu ayarı eksik (SUPABASE_URL / SUPABASE_SERVICE_KEY).");
  return { ADRES, ANAHTAR, basliklar: { apikey: ANAHTAR, Authorization: `Bearer ${ANAHTAR}` } };
}
const kodluYol = (yol) => yol.split("/").map(encodeURIComponent).join("/");

async function depoyaYaz(yol, govde, tip, depo = DEPO) {
  const { ADRES, basliklar } = depoAyar();
  const r = await fetch(`${ADRES}/storage/v1/object/${depo}/${kodluYol(yol)}`, { method: "POST", headers: { ...basliklar, "Content-Type": tip, "x-upsert": "true" }, body: govde });
  if (!r.ok) throw new Error(`Depoya yazılamadı (${r.status}): ${(await r.text()).slice(0, 200)}`);
}
async function depodanOku(yol, depo = DEPO) {
  const { ADRES, basliklar } = depoAyar();
  const r = await fetch(`${ADRES}/storage/v1/object/${depo}/${kodluYol(yol)}`, { headers: basliklar });
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`Depodan okunamadı (${r.status})`);
  return r;
}
// 3 saatlik imzalı bağlantı (önizleme ve Higgsfield'ın dosyayı indirmesi için)
async function imzaliBaglanti(yol, depo = DEPO) {
  const { ADRES, basliklar } = depoAyar();
  const r = await fetch(`${ADRES}/storage/v1/object/sign/${depo}/${kodluYol(yol)}`, { method: "POST", headers: { ...basliklar, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 3 * 3600 }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.signedURL) throw new Error("Dosya bağlantısı oluşturulamadı: " + (j.message || r.status));
  return `${ADRES}/storage/v1${j.signedURL}`;
}
const depoSec = (d) => d === MUSTERI_DEPO ? MUSTERI_DEPO : DEPO;

// İş durumu: ai/<is>/sonuc.json
const durumYolu = (is) => `ai/${is}/sonuc.json`;
async function durumYaz(is, durum) { await depoyaYaz(durumYolu(is), Buffer.from(JSON.stringify({ ...durum, guncellendi: new Date().toISOString() })), "application/json"); }
async function durumOku(is) {
  const r = await depodanOku(durumYolu(is));
  if (!r) return null;
  try { return await r.json(); } catch (e) { return null; }
}

// Arka plan işlevi çağrısının imzası: iş kimliği servis anahtarıyla imzalanır, dışarıdan üretilemez
function isImzasi(is) {
  const { ANAHTAR } = depoAyar();
  return crypto.createHmac("sha256", ANAHTAR).update("yapay-zeka:" + is).digest("hex");
}

function saglayicilar() {
  const hf = !!(process.env.HIGGSFIELD_KEY_ID && process.env.HIGGSFIELD_KEY_SECRET);
  return [
    { id: "gemini", ad: "Nano Banana (Gemini)", tur: "gorsel", hazir: !!process.env.GEMINI_API_KEY, anahtar: "GEMINI_API_KEY" },
    { id: "openai", ad: "ChatGPT görseli (OpenAI)", tur: "gorsel", hazir: !!process.env.OPENAI_API_KEY, anahtar: "OPENAI_API_KEY" },
    { id: "higgsfield_soul", ad: "Higgsfield Soul (görsel)", tur: "gorsel", hazir: hf, anahtar: "HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET" },
    { id: "higgsfield_kling", ad: "Higgsfield Kling 2.6 (görselden video)", tur: "video", hazir: hf, anahtar: "HIGGSFIELD_KEY_ID + HIGGSFIELD_KEY_SECRET" },
  ];
}
// Metin önerileri (istem, açıklama): Gemini varsa o, yoksa Panormos'ta zaten tanımlı Anthropic anahtarı
const metinHazir = () => !!(process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY);
async function anthropicMetin(istem) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_METIN_MODEL || "claude-haiku-5-5", max_tokens: 600, messages: [{ role: "user", content: istem }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Anthropic ${r.status}`);
  return (j.content || []).map(c => c.text || "").join("").trim();
}
async function metinUret(istem) {
  if (process.env.GEMINI_API_KEY) {
    try { return await geminiMetin(istem); } catch (e) { if (!process.env.ANTHROPIC_API_KEY) throw e; }
  }
  if (process.env.ANTHROPIC_API_KEY) return anthropicMetin(istem);
  throw new Error("Metin önerisi için GEMINI_API_KEY ya da ANTHROPIC_API_KEY gerekli.");
}

// ───────────── Gemini ─────────────
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";
async function geminiIstek(model, govde) {
  const r = await fetch(`${GEMINI}/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    let mesaj = j.error?.message || `Gemini ${r.status}`;
    // Google'ın uzun İngilizce kota mesajı yerine kısa Türkçe açıklama
    if (/quota|RESOURCE_EXHAUSTED/i.test(mesaj) && /free.?tier|limit: 0/i.test(mesaj)) mesaj = "Gemini görsel modeli bu projede ücretsiz katmanda kullanılamıyor: anahtarın ait olduğu Google projesinde faturalandırma (ön ödeme bakiyesi) açık olmalı. aistudio.google.com → Billing.";
    else if (/quota|RESOURCE_EXHAUSTED|429/i.test(mesaj)) mesaj = "Gemini kotası doldu ya da bakiye bitti; birkaç dakika sonra tekrar deneyin ya da aistudio.google.com → Billing'den bakiye ekleyin.";
    const e = new Error(mesaj); e.kod = r.status; throw e;
  }
  return j;
}
// Model adı değişebiliyor: ortam değişkeni, yoksa sırayla bilinen adlar denenir
async function geminiDene(modeller, govde) {
  let son = null;
  for (const m of modeller.filter(Boolean)) {
    try { return await geminiIstek(m, govde); }
    catch (e) { son = e; if (!(e.kod === 404 || /not found|not supported|unsupported/i.test(e.message))) throw e; }
  }
  throw son || new Error("Gemini modeli bulunamadı");
}
async function geminiGorsel({ istem, oran, referanslar = [] }) {
  const parts = [{ text: istem }];
  for (const ref of referanslar) parts.push({ inline_data: { mime_type: ref.tip, data: ref.veri.toString("base64") } });
  const j = await geminiDene([process.env.GEMINI_GORSEL_MODEL, "gemini-3.1-flash-image", "gemini-2.5-flash-image"], {
    contents: [{ parts }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: oran } },
  });
  const p = (j.candidates?.[0]?.content?.parts || []).find(x => x.inlineData || x.inline_data);
  const id = p?.inlineData || p?.inline_data;
  if (!id?.data) {
    const neden = j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || "";
    throw new Error("Gemini görsel üretmedi" + (neden ? ` (${neden})` : "") + ". İstemi değiştirip tekrar deneyin.");
  }
  return [{ veri: Buffer.from(id.data, "base64"), tip: id.mimeType || id.mime_type || "image/png" }];
}
async function geminiMetin(istem) {
  const j = await geminiDene([process.env.GEMINI_METIN_MODEL, "gemini-2.5-flash", "gemini-3-flash"], { contents: [{ parts: [{ text: istem }] }] });
  return (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim();
}

// ───────────── OpenAI ─────────────
async function openaiGorsel({ istem, oran }) {
  const boyut = oran === "16:9" ? "1536x1024" : oran === "1:1" ? "1024x1024" : "1024x1536"; // 4:5 ve 9:16 dikey
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: process.env.OPENAI_GORSEL_MODEL || "gpt-image-1", prompt: istem, size: boyut, n: 1, quality: process.env.OPENAI_GORSEL_KALITE || "medium" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenAI ${r.status}`);
  const d = j.data?.[0];
  if (d?.b64_json) return [{ veri: Buffer.from(d.b64_json, "base64"), tip: "image/png" }];
  if (d?.url) { const g = await fetch(d.url); return [{ veri: Buffer.from(await g.arrayBuffer()), tip: g.headers.get("content-type") || "image/png" }]; }
  throw new Error("OpenAI görsel döndürmedi.");
}

// ───────────── Higgsfield ─────────────
const HF = "https://api.higgsfield.ai";
function hfBasliklar() { return { "Content-Type": "application/json", Authorization: `Key ${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}` }; }
async function hfBaslat(yol, govde) {
  const r = await fetch(`${HF}/${yol}`, { method: "POST", headers: { ...hfBasliklar(), "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(govde) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.message || j.error || `Higgsfield ${r.status}`);
  if (!j.status_url) throw new Error("Higgsfield istek kabul etmedi.");
  return j;
}
// Bitene kadar bekler (en çok sureSn saniye); ilerlemeyi geri çağrıyla bildirir
async function hfBekle(statusUrl, sureSn, ilerleme) {
  const bitis = Date.now() + sureSn * 1000;
  let son = null;
  while (Date.now() < bitis) {
    const r = await fetch(statusUrl, { headers: hfBasliklar() });
    const j = await r.json().catch(() => ({}));
    son = j;
    const s = String(j.status || "").toLowerCase();
    if (s === "completed") return j;
    if (["failed", "error", "cancelled", "canceled", "nsfw", "rejected"].includes(s)) throw new Error("Higgsfield üretemedi" + (j.error || j.detail ? `: ${j.error || j.detail}` : ` (${s})`));
    if (ilerleme) await ilerleme(s || "bekliyor");
    await new Promise(res => setTimeout(res, 4000));
  }
  throw new Error("Higgsfield zamanında bitiremedi" + (son?.status ? ` (${son.status})` : ""));
}
async function indir(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Üretilen dosya indirilemedi (${r.status})`);
  return { veri: Buffer.from(await r.arrayBuffer()), tip: r.headers.get("content-type") || "application/octet-stream" };
}
async function higgsfieldSoul({ istem, oran, referansUrl, ilerleme }) {
  const hfOran = oran === "4:5" ? "3:4" : oran; // Soul 4:5 bilmez
  const g = { prompt: istem, aspect_ratio: hfOran, resolution: "1080p", batch_size: 1, enhance_prompt: true };
  if (referansUrl) g.image_reference_url = referansUrl;
  const b = await hfBaslat("higgsfield-ai/soul/standard", g);
  const s = await hfBekle(b.status_url, 600, ilerleme);
  const url = s.images?.[0]?.url;
  if (!url) throw new Error("Higgsfield görsel adresi döndürmedi.");
  const d = await indir(url);
  return [{ ...d, tip: /image\//.test(d.tip) ? d.tip : "image/png" }];
}
async function higgsfieldKling({ istem, oran, baslangicUrl, sure, ilerleme }) {
  if (!baslangicUrl) throw new Error("Video için bir başlangıç görseli seçin.");
  const g = { prompt: istem || "Doğal, akıcı, sinematik hareket", image_url: baslangicUrl, duration: sure === 10 ? 10 : 5, aspect_ratio: oran === "16:9" ? "16:9" : oran === "1:1" ? "1:1" : "9:16", sound: "off" };
  const b = await hfBaslat("kling-video/v2.6/pro/image-to-video", g);
  const s = await hfBekle(b.status_url, 840, ilerleme);
  const url = s.video?.url;
  if (!url) throw new Error("Higgsfield video adresi döndürmedi.");
  const d = await indir(url);
  return [{ ...d, tip: /video\//.test(d.tip) ? d.tip : "video/mp4" }];
}

// ───────────── Üretim (arka plan) ─────────────
const uzanti = (tip) => tip.includes("png") ? "png" : tip.includes("webp") ? "webp" : tip.includes("mp4") ? "mp4" : tip.includes("quicktime") ? "mov" : tip.includes("video") ? "mp4" : "jpg";

async function uret(is, istek) {
  const { saglayici, istem, oran = "1:1", sure = 5, musteriAd = "", clientId = null } = istek;
  // Referans görseller: [{ yol, depo }] — Gemini hepsini (en çok 6), Soul ve Kling ilkini kullanır
  const referanslar = (Array.isArray(istek.referanslar) ? istek.referanslar : (istek.referansYolu ? [{ yol: istek.referansYolu, depo: istek.referansDepo }] : [])).slice(0, 6).map(r => ({ yol: r.yol, depo: depoSec(r.depo) }));
  const ilkRef = referanslar[0] || null;
  if (!ORANLAR.includes(oran)) throw new Error("Geçersiz oran");
  const ilerleme = async (asama) => { try { await durumYaz(is, { durum: "calisiyor", asama }); } catch (e) { /* önemsiz */ } };
  await durumYaz(is, { durum: "calisiyor", asama: "başladı", saglayici });
  let ciktilar;
  if (saglayici === "gemini") {
    const gorseller = [];
    for (const ref of referanslar) { const r = await depodanOku(ref.yol, ref.depo); if (r) gorseller.push({ veri: Buffer.from(await r.arrayBuffer()), tip: r.headers.get("content-type") || "image/jpeg" }); }
    ciktilar = await geminiGorsel({ istem, oran, referanslar: gorseller });
  } else if (saglayici === "openai") {
    ciktilar = await openaiGorsel({ istem, oran });
  } else if (saglayici === "higgsfield_soul") {
    ciktilar = await higgsfieldSoul({ istem, oran, referansUrl: ilkRef ? await imzaliBaglanti(ilkRef.yol, ilkRef.depo) : null, ilerleme });
  } else if (saglayici === "higgsfield_kling") {
    ciktilar = await higgsfieldKling({ istem, oran, sure, baslangicUrl: ilkRef ? await imzaliBaglanti(ilkRef.yol, ilkRef.depo) : null, ilerleme });
  } else throw new Error("Bilinmeyen sağlayıcı");

  // Müşteri sayfasından üretildiyse dosya müşterinin Medya deposuna (client-media) gider; planlayıcıdan üretildiyse planlayici deposuna
  const dosyalar = [];
  for (let i = 0; i < ciktilar.length; i++) {
    const c = ciktilar[i];
    const video = /^video\//.test(c.tip);
    const ext = uzanti(c.tip);
    const ad = `${(musteriAd || "yapay-zeka").slice(0, 30)} ${video ? "video" : "görsel"} ${new Date().toLocaleDateString("tr-TR")}${ciktilar.length > 1 ? ` ${i + 1}` : ""}.${ext}`;
    const depo = clientId ? MUSTERI_DEPO : DEPO;
    const yol = clientId ? `${clientId}-ai-${Date.now()}-${i + 1}.${ext}` : `ai/${is}/${i + 1}.${ext}`;
    await depoyaYaz(yol, c.veri, c.tip, depo);
    dosyalar.push({ yol, depo, tur: video ? "video" : "resim", ad, boyut: c.veri.length, tip: c.tip });
  }
  await durumYaz(is, { durum: "tamam", saglayici, dosyalar });
  return dosyalar;
}

// İstem ve açıklama önerileri (Gemini metin)
async function istemOner({ musteriAd, sektor, tur, konu, kanal }) {
  const metin = await metinUret([
    "Sen bir sosyal medya görsel yönetmenisin. Aşağıdaki bilgilerle, görsel üreten yapay zekâya verilecek TEK bir istem (prompt) yaz.",
    "İstem İngilizce olsun (görsel modelleri İngilizce istemle daha iyi çalışır), 2-4 cümle, somut: sahne, ışık, kamera açısı, renk paleti, atmosfer. Metin ve logo isteme. Sadece istemi yaz, başka bir şey yazma.",
    `Marka / işletme: ${musteriAd || "-"}`, `Sektör: ${sektor || "-"}`, `İçerik türü: ${tur || "-"} (${kanal || "Instagram"})`, `Konu / istenen: ${konu || "markaya uygun dikkat çekici bir paylaşım görseli"}`,
  ].join("\n"));
  return metin.replace(/^["'`]+|["'`]+$/g, "");
}
async function aciklamaOner({ musteriAd, sektor, tur, konu, istem }) {
  const metin = await metinUret([
    "Sen Türkçe yazan bir sosyal medya metin yazarısın. Aşağıdaki paylaşım için Instagram açıklaması yaz.",
    "Kurallar: TDK yazımına uy, samimi ama profesyonel, 2-4 kısa cümle, sonunda 5-8 ilgili #etiket. Emoji kullanma. Sadece açıklamayı yaz.",
    `Marka / işletme: ${musteriAd || "-"}`, `Sektör: ${sektor || "-"}`, `İçerik türü: ${tur || "-"}`, `Konu: ${konu || "-"}`, istem ? `Görselin tarifi: ${istem}` : "",
  ].filter(Boolean).join("\n"));
  return metin;
}

module.exports = { saglayicilar, metinHazir, uret, durumOku, durumYaz, isImzasi, istemOner, aciklamaOner, imzaliBaglanti, ORANLAR, DEPO, MUSTERI_DEPO };
