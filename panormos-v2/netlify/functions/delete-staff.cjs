// netlify/functions/delete-staff.cjs
// Çalışanın giriş hesabını kaldırır; istenirse çalışan kaydını da tamamen siler.
// Giriş hesabını silmek servis anahtarı gerektirir; anahtar yalnızca burada, sunucu tarafında kullanılır.
const { createClient } = require("@supabase/supabase-js");
const { panelKullanicisi } = require("../lib/auth.cjs");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const yanit = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return yanit(405, { error: "POST bekleniyor" });

  // Yalnızca yönetici ya da "Çalışan Yönetimi" yetkisi olan çağırabilir
  let cagiran = null;
  try { cagiran = await panelKullanicisi(event); } catch (e) { cagiran = null; }
  if (!cagiran) return yanit(401, { error: "Oturum doğrulanamadı. Sayfayı yenileyip tekrar giriş yapın." });
  const yonetici = cagiran.is_admin === true;
  if (!yonetici && cagiran.perm_manage_staff !== true) return yanit(403, { error: "Bu işlem için yetkiniz yok." });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return yanit(500, { error: "SUPABASE_URL / SUPABASE_SERVICE_KEY tanımlı değil (Netlify > Environment variables)" });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return yanit(400, { error: "Geçersiz JSON" }); }
  const { staffId, kaydiSil } = body;
  if (!staffId) return yanit(400, { error: "staffId zorunlu" });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: hedef, error: e1 } = await supabase.from("staff").select("id,name,auth_id,is_admin,deleted_at").eq("id", staffId).maybeSingle();
    if (e1) throw e1;
    if (!hedef) return yanit(404, { error: "Çalışan bulunamadı" });
    if (hedef.id === cagiran.id) return yanit(400, { error: "Kendi hesabınızı silemezsiniz." });
    if (hedef.is_admin === true && !yonetici) return yanit(403, { error: "Yönetici kaydını yalnızca yönetici silebilir." });
    if (kaydiSil && !hedef.deleted_at) return yanit(400, { error: "Önce çalışanı ayrıldı olarak işaretleyin." });

    // 1) Giriş hesabı
    let girisSilindi = false;
    if (hedef.auth_id) {
      const { error: e2 } = await supabase.auth.admin.deleteUser(hedef.auth_id);
      if (e2 && !/not found/i.test(e2.message || "")) throw e2;
      girisSilindi = !e2;
    }

    // 2) Kayıt: tamamen sil ya da yalnızca giriş bağlantısını kopar
    if (kaydiSil) {
      await supabase.from("conversation_members").delete().eq("staff_id", staffId);
      const { error: e3 } = await supabase.from("staff").delete().eq("id", staffId);
      if (e3) throw e3;
    } else {
      const { error: e3 } = await supabase.from("staff").update({ auth_id: null }).eq("id", staffId);
      if (e3) throw e3;
    }
    return yanit(200, { ok: true, girisSilindi, kayitSilindi: !!kaydiSil });
  } catch (err) {
    return yanit(500, { error: err.message || String(err) });
  }
};
