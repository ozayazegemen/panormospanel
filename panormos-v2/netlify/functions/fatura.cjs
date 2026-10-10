// netlify/functions/fatura.cjs — müşteriye gönderilen fatura bağlantısı: panormosmedya.com/f/<anahtar>
// Giriş gerektirmez; tahmin edilemez anahtarla yalnızca o faturanın dosyasını açar.
// Dosya deposu dışarıya kapalıdır: her açılışta 5 dakikalık imzalı bağlantı üretilip oraya yönlendirilir.
const { createClient } = require("@supabase/supabase-js");

const sayfa = (statusCode, mesaj) => ({
  statusCode,
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  body: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Panormos Medya</title></head><body style="font-family:-apple-system,Segoe UI,Arial,sans-serif;background:#F3F5F9;color:#0F1B2D;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;"><div style="max-width:420px;text-align:center;background:#fff;border:1px solid #DFE5EE;border-radius:16px;padding:32px 26px;"><div style="font-size:20px;font-weight:800;margin-bottom:14px;">panormos <span style="color:#F25124;">medya.</span></div><div style="font-size:14px;line-height:1.6;color:#44556B;">${mesaj}</div></div></body></html>`,
});

exports.handler = async (event) => {
  // Anahtar: /f/<anahtar> yolunun son parçası ya da ?k=<anahtar>
  const yol = String(event.path || "").split("/").filter(Boolean);
  const k = String((event.queryStringParameters || {}).k || yol[yol.length - 1] || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return sayfa(404, "Bu fatura bağlantısı geçersiz. Lütfen size gönderilen bağlantıyı eksiksiz açın.");
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return sayfa(500, "Fatura şu anda açılamıyor. Lütfen daha sonra tekrar deneyin.");

  try {
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: inv, error } = await supabase.from("client_invoices").select("file_url,file_name").eq("share_key", k).maybeSingle();
    if (error) throw error;
    if (!inv || !inv.file_url) return sayfa(404, "Bu faturanın dosyası bulunamadı. Lütfen Panormos Medya ile iletişime geçin.");

    // Depo içindeki dosya: imzalı bağlantıya yönlendir. Depo dışı bağlantı (ör. e-fatura portalı): doğrudan yönlendir.
    const marker = "/object/public/client-media/";
    const ref = String(inv.file_url);
    if (!ref.includes(marker)) {
      if (/^https:\/\//i.test(ref)) return { statusCode: 302, headers: { Location: ref, "Cache-Control": "no-store" }, body: "" };
      return sayfa(404, "Bu faturanın dosyası bulunamadı. Lütfen Panormos Medya ile iletişime geçin.");
    }
    let path = ref.split(marker)[1].split("?")[0];
    try { path = decodeURIComponent(path); } catch (e) {}
    const { data: s, error: e2 } = await supabase.storage.from("client-media").createSignedUrl(path, 300);
    if (e2 || !s || !s.signedUrl) return sayfa(404, "Bu faturanın dosyası bulunamadı. Lütfen Panormos Medya ile iletişime geçin.");
    return { statusCode: 302, headers: { Location: s.signedUrl, "Cache-Control": "no-store" }, body: "" };
  } catch (err) {
    return sayfa(500, "Fatura şu anda açılamıyor. Lütfen daha sonra tekrar deneyin.");
  }
};
