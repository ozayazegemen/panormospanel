// Sunucu işlevleri için oturum denetimi.
// İstekle gelen Supabase oturum anahtarını doğrular ve sahibinin aktif bir çalışan olduğunu kontrol eder.
// Buradaki adres ve anahtar tarayıcıdakiyle aynı, herkese açık değerlerdir; gizli anahtar kullanılmaz.
const SUPABASE_URL = "https://kmxhsyjtyukrxrzoowag.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8FkJ2hortwsLn57lLZMEwQ_vS29JgwT";

async function panelKullanicisi(event) {
  const h = event.headers || {};
  const raw = h.authorization || h.Authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!token) return null;
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };

  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers });
  if (!u.ok) return null;
  const user = await u.json();
  if (!user || !user.id) return null;

  const s = await fetch(
    `${SUPABASE_URL}/rest/v1/staff?auth_id=eq.${encodeURIComponent(user.id)}&deleted_at=is.null&select=id,name,is_admin,perm_manage_staff&limit=1`,
    { headers }
  );
  if (!s.ok) return null;
  const rows = await s.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// Yetkiliyse null döner; değilse işlevin doğrudan döndüreceği hata yanıtını verir.
// yonetici: true → yalnızca yönetici. calisanYonetir: true → yönetici ya da "Çalışan Yönetimi" yetkisi.
async function yetkili(event, { yonetici = false, calisanYonetir = false } = {}) {
  let staff = null;
  try { staff = await panelKullanicisi(event); } catch (e) { staff = null; }
  if (!staff) return { statusCode: 401, body: JSON.stringify({ error: "Oturum doğrulanamadı. Sayfayı yenileyip tekrar giriş yapın." }) };
  const admin = staff.is_admin === true;
  if (yonetici && !admin) return { statusCode: 403, body: JSON.stringify({ error: "Bu işlem yalnızca yöneticiye açık." }) };
  if (calisanYonetir && !admin && staff.perm_manage_staff !== true) return { statusCode: 403, body: JSON.stringify({ error: "Bu işlem için yetkiniz yok." }) };
  return null;
}

module.exports = { yetkili };
