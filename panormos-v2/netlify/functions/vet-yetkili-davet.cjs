// netlify/functions/vet-yetkili-davet.cjs
// Veteriner Market: firmanın çalışanına kendi panelini (panormosmedya.com/vet-panel) yönetebileceği bir giriş hesabı açar ya da yetkisini kaldırır.
// Yalnızca Panormos yöneticisi çağırabilir. Hesap zaten varsa yeniden davet göndermez, doğrudan yetki verir.
const { createClient } = require("@supabase/supabase-js");
const { yetkili } = require("../lib/auth.cjs");

const SITE = "https://panormosmedya.com";

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const yanit = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return yanit(405, { error: "POST bekleniyor" });

  const red = await yetkili(event, { yonetici: true });
  if (red) return { ...red, headers };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return yanit(500, { error: "SUPABASE_URL / SUPABASE_SERVICE_KEY tanımlı değil (Netlify > Environment variables)" });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return yanit(400, { error: "Geçersiz JSON" }); }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    if (body.islem === "kaldir") {
      if (!body.userId) return yanit(400, { error: "Kullanıcı gerekli." });
      const { error } = await supabase.from("vet_yetkililer").delete().eq("user_id", body.userId);
      if (error) throw error;
      return yanit(200, { ok: true });
    }

    const eposta = String(body.eposta || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(eposta)) return yanit(400, { error: "Geçerli bir e-posta gerekli." });

    let userId = null, yeniHesap = false;
    const { data: davet, error: ed } = await supabase.auth.admin.inviteUserByEmail(eposta, { redirectTo: `${SITE}/vet-giris` });
    if (ed) {
      if (/already.*registered|already.*exists/i.test(ed.message || "")) {
        let bulundu = null;
        for (let page = 1; page <= 10 && !bulundu; page++) {
          const { data: liste, error: el } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
          if (el) throw el;
          bulundu = (liste?.users || []).find((u) => (u.email || "").toLowerCase() === eposta);
          if (!liste?.users?.length || liste.users.length < 1000) break;
        }
        if (!bulundu) throw ed;
        userId = bulundu.id;
      } else {
        throw ed;
      }
    } else {
      userId = davet.user.id; yeniHesap = true;
    }

    const { error: ey } = await supabase.from("vet_yetkililer").upsert({ user_id: userId, eposta });
    if (ey) throw ey;
    return yanit(200, { ok: true, yeniHesap });
  } catch (err) {
    return yanit(500, { error: err.message || String(err) });
  }
};
