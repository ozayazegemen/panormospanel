// netlify/functions/emlakpanelim-admin.cjs
// Panormos Panel -> bu fonksiyon -> EmlakPanelim'in Supabase projesi (service role ile).
// Servis anahtarı yalnızca burada, sunucu tarafında kullanılır; tarayıcıya hiç gitmez.
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.EMLAK_SUPABASE_URL,
  process.env.EMLAK_SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };

  if (!process.env.EMLAK_SUPABASE_URL || !process.env.EMLAK_SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "EMLAK_SUPABASE_URL / EMLAK_SUPABASE_SERVICE_KEY tanımlı değil (Netlify > Environment variables)" }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const [firmalarRes, ilanlarRes, musterilerRes, kiralarRes, satislarRes, talepRes, profillerRes, planlarRes] = await Promise.all([
        supabase.from("firmalar").select("*").order("created_at", { ascending: false }),
        supabase.from("ilanlar").select("firma_id").is("silinme_tarihi", null),
        supabase.from("musteriler").select("firma_id").is("silinme_tarihi", null),
        supabase.from("kiralar").select("firma_id").is("silinme_tarihi", null),
        supabase.from("satislar").select("firma_id").is("silinme_tarihi", null),
        supabase.from("talepler").select("firma_id").is("silinme_tarihi", null),
        supabase.from("profiller").select("id, firma_id, ad_soyad, eposta, rol, onayli, created_at"),
        supabase.from("fiyat_planlari").select("*").order("sira", { ascending: true }),
      ]);
      for (const r of [firmalarRes, ilanlarRes, musterilerRes, kiralarRes, satislarRes, talepRes, profillerRes, planlarRes]) {
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
        };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ firmalar: firmalarRes.data, detay, planlar: planlarRes.data }) };
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

      return { statusCode: 400, headers, body: JSON.stringify({ error: "Bilinmeyen aksiyon: " + aksiyon }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
