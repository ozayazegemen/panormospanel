// netlify/functions/emlakpanelim-admin.cjs
// Panormos Panel -> bu fonksiyon -> Emlak Panelim'in Supabase projesi (service role ile).
// Servis anahtarı yalnızca burada, sunucu tarafında kullanılır; tarayıcıya hiç gitmez.
const { createClient } = require("@supabase/supabase-js");
const { yetkili } = require("../lib/auth.cjs");

const supabase = createClient(
  process.env.EMLAK_SUPABASE_URL,
  process.env.EMLAK_SUPABASE_SERVICE_KEY
);

// Emlak Panelim'in SMS işlevini sunucudan çağırır (yetki: Emlak Panelim servis anahtarı)
async function emlakSms(method, govde) {
  const site = (process.env.EMLAK_SITE_URL || "https://emlakpanelim.com").replace(/\/+$/, "");
  const r = await fetch(`${site}/.netlify/functions/sms`, {
    method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.EMLAK_SUPABASE_SERVICE_KEY}` },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j : { hata: j.error || `Emlak Panelim SMS işlevi yanıt vermedi (${r.status})` };
}

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  // Emlak Panelim yönetimi yalnızca Panormos paneline giriş yapmış yöneticiye açık
  const red = await yetkili(event, { yonetici: true });
  if (red) return { ...red, headers };

  if (!process.env.EMLAK_SUPABASE_URL || !process.env.EMLAK_SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "EMLAK_SUPABASE_URL / EMLAK_SUPABASE_SERVICE_KEY tanımlı değil (Netlify > Environment variables)" }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const [firmalarRes, ilanlarRes, musterilerRes, kiralarRes, satislarRes, talepRes, profillerRes, planlarRes, ayarRes, odemelerRes] = await Promise.all([
        supabase.from("firmalar").select("*").order("created_at", { ascending: false }),
        supabase.from("ilanlar").select("firma_id").is("silinme_tarihi", null),
        supabase.from("musteriler").select("firma_id").is("silinme_tarihi", null),
        supabase.from("kiralar").select("firma_id").is("silinme_tarihi", null),
        supabase.from("satislar").select("firma_id").is("silinme_tarihi", null),
        supabase.from("talepler").select("firma_id").is("silinme_tarihi", null),
        supabase.from("profiller").select("id, firma_id, ad_soyad, eposta, rol, onayli, created_at"),
        supabase.from("fiyat_planlari").select("*").order("sira", { ascending: true }),
        supabase.from("sistem_ayarlari").select("deneme_suresi_gun").eq("id", true).single(),
        supabase.from("odemeler").select("id, firma_id, plan_ad, donem, tutar, toplam, yontem, durum, sozlesme_onay, otomatik_odeme_onay, sozlesme_ip, otomatik_mi, created_at, sonuc_tarihi").order("created_at", { ascending: false }),
      ]);
      for (const r of [firmalarRes, ilanlarRes, musterilerRes, kiralarRes, satislarRes, talepRes, profillerRes, planlarRes, odemelerRes]) {
        if (r.error) throw r.error;
      }

      const say = (arr, id) => (arr || []).filter((x) => x.firma_id === id).length;
      const detay = {};
      for (const f of firmalarRes.data || []) {
        detay[f.id] = {
          ilan_sayisi: say(ilanlarRes.data, f.id),
          musteri_sayisi: say(musterilerRes.data, f.id),
          kira_sayisi: say(kiralarRes.data, f.id),
          satis_sayisi: say(satislarRes.data, f.id),
          talep_sayisi: say(talepRes.data, f.id),
          kullanicilar: (profillerRes.data || []).filter((p) => p.firma_id === f.id),
          odemeler: (odemelerRes.data || []).filter((o) => o.firma_id === f.id),
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ firmalar: firmalarRes.data, detay, planlar: planlarRes.data, denemeSuresiGun: ayarRes.data?.deneme_suresi_gun ?? 14 }) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { aksiyon } = body;

      if (aksiyon === "uzat") {
        const { data: f, error: ef } = await supabase.from("firmalar").select("abonelik_bitis").eq("id", body.firmaId).single();
        if (ef) throw ef;
        const taban = f.abonelik_bitis && new Date(f.abonelik_bitis + "T00:00:00") > new Date()
          ? new Date(f.abonelik_bitis + "T00:00:00") : new Date();
        taban.setDate(taban.getDate() + Number(body.gun));
        const yeni = taban.toISOString().slice(0, 10);
        const { error } = await supabase.from("firmalar").update({ abonelik_bitis: yeni, durum: "aktif" }).eq("id", body.firmaId);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (aksiyon === "durum") {
        const { error } = await supabase.from("firmalar").update({ durum: body.durum }).eq("id", body.firmaId);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (aksiyon === "fatura") {
        const { error } = await supabase.from("firmalar").update(body.alanlar).eq("id", body.firmaId);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (aksiyon === "plan_kaydet") {
        const { error } = await supabase.from("fiyat_planlari").update(body.alanlar).eq("id", body.id);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (aksiyon === "plan_sil") {
        const { error } = await supabase.from("fiyat_planlari").delete().eq("id", body.id);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (aksiyon === "plan_ekle") {
        const { error } = await supabase.from("fiyat_planlari").insert({
          sira: Number(body.sira) || 0, ad: "Yeni Paket", kim: "", aylik: 0, yillik: 0, one_cikan: false, kapsam: [],
        });
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      if (aksiyon === "deneme_suresi_kaydet") {
        const gun = Number(body.gun);
        if (!Number.isFinite(gun) || gun < 1) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Geçersiz gün sayısı" }) };
        }
        const { error } = await supabase.from("sistem_ayarlari").update({ deneme_suresi_gun: gun }).eq("id", true);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      // ── SMS (Emlak Panelim aboneleri) ──
      // Şablon ve rapor doğrudan Emlak Panelim veritabanından; gönderimi Emlak Panelim'in sms işlevi yapar
      // (Netgsm bilgileri yalnızca orada durur). O işlev bu sunucuyu servis anahtarıyla tanır.
      if (aksiyon === "sms_veri") {
        const [s1, s2, s3] = await Promise.all([
          supabase.from("sms_sablonlar").select("*").order("sira").order("id"),
          supabase.from("sms_gonderimler").select("*").order("created_at", { ascending: false }).limit(200),
          supabase.from("firmalar").select("id, ad, telefon, durum, abonelik_bitis, sms_izin, created_at").order("ad"),
        ]);
        if (s1.error) return { statusCode: 200, headers, body: JSON.stringify({ kurulumYok: true, hata: s1.error.message }) };
        const durum = await emlakSms("GET").catch((e) => ({ hata: e.message }));
        return { statusCode: 200, headers, body: JSON.stringify({ sablonlar: s1.data, gonderimler: s2.data || [], firmalar: s3.data || [], hazir: !!durum.hazir }) };
      }
      if (aksiyon === "sms_sablon_kaydet") {
        const a = body.alanlar || {};
        const alanlar = {};
        for (const k of ["ad", "metin", "aktif", "tarih"]) if (k in a) alanlar[k] = k === "tarih" ? (a.tarih || null) : a[k];
        const { error } = await supabase.from("sms_sablonlar").update(alanlar).eq("id", body.id);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      if (aksiyon === "sms_sablon_ekle") {
        const { error } = await supabase.from("sms_sablonlar").insert({ ad: String(body.ad || "Yeni şablon").slice(0, 80), metin: String(body.metin || ""), otomatik: false, sira: 100 });
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      if (aksiyon === "sms_sablon_sil") {
        const { error } = await supabase.from("sms_sablonlar").delete().eq("id", body.id).eq("otomatik", false);
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }
      if (aksiyon === "sms_gonder" || aksiyon === "sms_deneme") {
        const j = await emlakSms("POST", aksiyon === "sms_gonder"
          ? { islem: "gonder", firma_idler: body.firma_idler, metin: body.metin, ticari: !!body.ticari }
          : { islem: "deneme", telefon: body.telefon, firma_id: body.firma_id, metin: body.metin, ticari: !!body.ticari });
        return { statusCode: j.hata ? 502 : 200, headers, body: JSON.stringify(j.hata ? { error: j.hata } : j) };
      }

      if (aksiyon === "firma_sil") {
        const { error } = await supabase.rpc("admin_firma_sil", { hedef_firma_id: body.firmaId });
        if (error) throw error;
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: "Bilinmeyen aksiyon: " + aksiyon }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
