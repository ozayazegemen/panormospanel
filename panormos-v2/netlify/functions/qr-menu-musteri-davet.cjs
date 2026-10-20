// netlify/functions/qr-menu-musteri-davet.cjs
// QR Menü: restoran/bar sahibine kendi menüsünü düzenleyebileceği bir giriş hesabı açar.
// Hesap zaten varsa (başka bir menüde de kullanılıyor olabilir) yeniden davet göndermez, doğrudan bu menüye bağlar.
const { createClient } = require("@supabase/supabase-js");
const { yetkili } = require("../lib/auth.cjs");

const SITE = "https://panormosmedya.com";

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  const yanit = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
  if (event.httpMethod !== "POST") return yanit(405, { error: "POST bekleniyor" });

  const red = await yetkili(event, {});
  if (red) return { ...red, headers };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return yanit(500, { error: "SUPABASE_URL / SUPABASE_SERVICE_KEY tanımlı değil (Netlify > Environment variables)" });
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return yanit(400, { error: "Geçersiz JSON" }); }
  const { menuId, eposta } = body;
  if (!menuId || !eposta || !/^\S+@\S+\.\S+$/.test(eposta)) return yanit(400, { error: "Geçerli bir menuId ve e-posta gerekli." });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: menu, error: em } = await supabase.from("qr_menuler").select("id, ad").eq("id", menuId).maybeSingle();
    if (em) throw em;
    if (!menu) return yanit(404, { error: "Menü bulunamadı." });

    let userId = null, yeniHesap = false;
    const { data: davet, error: ed } = await supabase.auth.admin.inviteUserByEmail(eposta, {
      redirectTo: `${SITE}/menu-giris`,
      data: { qr_menu_ad: menu.ad },
    });
    if (ed) {
      // Bu e-posta zaten bir hesaba sahipse (başka menüde de kullanılıyor olabilir), yeniden davet göndermeden bağla
      if (/already.*registered|already.*exists/i.test(ed.message || "")) {
        let bulundu = null;
        for (let page = 1; page <= 10 && !bulundu; page++) {
          const { data: liste, error: el } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
          if (el) throw el;
          bulundu = (liste?.users || []).find((u) => (u.email || "").toLowerCase() === eposta.toLowerCase());
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

    const { error: eu } = await supabase.from("qr_menuler").update({ sahip_user_id: userId, sahip_eposta: eposta }).eq("id", menuId);
    if (eu) throw eu;

    return yanit(200, { ok: true, yeniHesap });
  } catch (err) {
    return yanit(500, { error: err.message || String(err) });
  }
};
