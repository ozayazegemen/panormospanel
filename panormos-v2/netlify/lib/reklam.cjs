// Reklamlar: panelden Meta Marketing API ile Instagram/Facebook reklamı verme.
// Tüm müşterilerin reklamları Panormos Medya'nın reklam hesabından çıkar (ödeme Panormos kartı, müşteriden önden tahsil).
// Akış (her çağrıda birkaç adım; Netlify işlevleri kısa sürelidir):
//   olusturuluyor: kampanya → reklam_seti → medya (yeni dosya ise yükle) → kreatif → reklam → baslat → inceleme/aktif
// Sonuçlar (gösterim, erişim, tıklama, harcama) saatte bir Meta'dan tazelenir.
// Gerekli ortam değişkenleri: SUPABASE_URL, SUPABASE_SERVICE_KEY, META_ERISIM_ANAHTARI (ads_management, ads_read, business_management,
// pages_read_engagement, instagram_basic izinli sistem kullanıcısı jetonu); isteğe bağlı META_REKLAM_HESABI (varsayılan Panormos Medya).
const { veritabani } = require("./qr-abonelik.cjs");
const { imzaliBaglanti } = require("./planlayici.cjs");

const GRAPH = "https://graph.facebook.com/v23.0";
const HESAP = () => "act_" + String(process.env.META_REKLAM_HESABI || "1254894623405686").replace(/^act_/, "");
const ADIMLAR = ["kampanya", "reklam_seti", "medya", "kreatif", "reklam", "baslat"];
const VIDEO_BEKLEME_DK = 30;

const AMACLAR = {
  erisim: { ad: "Erişim (daha çok kişiye göster)", objective: "OUTCOME_AWARENESS", optimization_goal: "REACH", cta: "LEARN_MORE" },
  etkilesim: { ad: "Etkileşim (beğeni, yorum, kaydetme)", objective: "OUTCOME_ENGAGEMENT", optimization_goal: "POST_ENGAGEMENT", cta: "LEARN_MORE" },
  trafik: { ad: "Web sitesi trafiği", objective: "OUTCOME_TRAFFIC", optimization_goal: "LINK_CLICKS", destination_type: "WEBSITE", cta: "LEARN_MORE" },
  profil: { ad: "Instagram profil ziyareti", objective: "OUTCOME_TRAFFIC", optimization_goal: "VISIT_INSTAGRAM_PROFILE", destination_type: "INSTAGRAM_PROFILE", cta: "VIEW_INSTAGRAM_PROFILE" },
};

function metaAnahtari() {
  const a = process.env.META_ERISIM_ANAHTARI || "";
  if (!a) throw new Error("Meta bağlantısı kurulmamış (META_ERISIM_ANAHTARI eksik).");
  return a;
}

// İç içe değerler (targeting, creative…) JSON olarak gönderilir
async function graph(yol, { method = "GET", govde } = {}) {
  const anahtar = metaAnahtari();
  const url = new URL(GRAPH + yol);
  let secenek = { method };
  if (method === "GET") url.searchParams.set("access_token", anahtar);
  else {
    const p = new URLSearchParams();
    Object.entries(govde || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) p.set(k, typeof v === "string" ? v : JSON.stringify(v)); });
    p.set("access_token", anahtar);
    secenek = { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() };
  }
  const r = await fetch(url, secenek);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    const detay = e.error_user_msg || e.error_user_title || e.message || `Meta yanıtı: ${r.status}`;
    const alt = e.error_data?.blame_field_specs ? ` (${JSON.stringify(e.error_data.blame_field_specs)})` : "";
    throw new Error(detay + alt);
  }
  return j;
}

// Reklam hesabı özeti: para birimi, ödeme yöntemi, harcanan, en düşük günlük bütçe
async function hesapBilgi() {
  const h = await graph(`/${HESAP()}?fields=name,currency,account_status,funding_source_details,amount_spent,balance,spend_cap,disable_reason`);
  let minGunluk = null;
  try {
    const m = await graph(`/${HESAP()}/minimum_budgets`);
    const d = (m.data || []).find(x => x.currency === h.currency) || (m.data || [])[0];
    if (d) minGunluk = Math.max(d.min_daily_budget_imp || 0, d.min_daily_budget_low_freq || 0) / 100;
  } catch (e) { /* bilgi amaçlı */ }
  const DURUM = { 1: "Aktif", 2: "Devre dışı", 3: "Ödeme bekliyor", 7: "İnceleme bekliyor", 9: "Ödeme süresi geçti", 100: "Kapatma bekliyor", 101: "Kapalı" };
  return {
    id: HESAP(), ad: h.name, paraBirimi: h.currency, durum: DURUM[h.account_status] || String(h.account_status),
    odeme: h.funding_source_details?.display_string || null, odemeVar: !!h.funding_source_details,
    harcanan: Number(h.amount_spent || 0) / 100, bakiye: Number(h.balance || 0) / 100, minGunluk,
  };
}

// Instagram hesabına bağlı Facebook sayfası (reklam kreatifi sayfa adına açılır)
async function sayfaBul(db, musteri) {
  if (musteri.fb_sayfa_id) return musteri.fb_sayfa_id;
  const j = await graph(`/me/accounts?fields=id,name,instagram_business_account&limit=200`);
  const s = (j.data || []).find(x => x.instagram_business_account?.id === musteri.ig_user_id);
  if (!s) throw new Error("Instagram hesabına bağlı Facebook sayfası bulunamadı (sayfa Panormos portföyünde ve sistem kullanıcısına atanmış olmalı).");
  try { await db.yaz(`clients?id=eq.${musteri.id}`, "PATCH", { fb_sayfa_id: s.id }); } catch (e) { /* bir dahaki sefere yine bulunur */ }
  return s.id;
}

// Müşterinin son Instagram gönderileri (öne çıkarmak için seçilir)
async function gonderiler(igId) {
  const j = await graph(`/${igId}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=30`);
  return (j.data || []).map(x => ({
    id: x.id, zaman: x.timestamp, tur: x.media_product_type === "REELS" ? "reels" : x.media_product_type === "STORY" ? "story" : x.media_type === "CAROUSEL_ALBUM" ? "carousel" : x.media_type === "VIDEO" ? "video" : "post",
    aciklama: [...(x.caption || "")].slice(0, 120).join(""), gorsel: x.thumbnail_url || (x.media_type === "VIDEO" ? null : x.media_url) || null, baglanti: x.permalink, begeni: x.like_count, yorum: x.comments_count,
  })).filter(x => x.tur !== "story");
}

// Hedef kitle aramaları
async function konumAra(q) {
  const j = await graph(`/search?type=adgeolocation&q=${encodeURIComponent(q)}&location_types=${encodeURIComponent(JSON.stringify(["city", "region", "country"]))}&country_code=TR&locale=tr_TR&limit=12`);
  return (j.data || []).map(x => ({ key: String(x.key), name: x.name, type: x.type, bolge: x.region || x.country_name || "" }));
}
async function ilgiAra(q) {
  const j = await graph(`/search?type=adinterest&q=${encodeURIComponent(q)}&locale=tr_TR&limit=12`);
  return (j.data || []).map(x => ({ id: String(x.id), name: x.name, kitle: x.audience_size_lower_bound || null, yol: (x.path || []).slice(0, -1).join(" › ") }));
}

// Panel hedefi → Meta targeting
function hedefleme(h = {}) {
  const geo = { countries: [], regions: [], cities: [] };
  for (const k of h.konumlar || []) {
    if (k.type === "country") geo.countries.push(k.key);
    else if (k.type === "region") geo.regions.push({ key: k.key });
    else geo.cities.push(k.yaricap ? { key: k.key, radius: Number(k.yaricap), distance_unit: "kilometer" } : { key: k.key });
  }
  Object.keys(geo).forEach(k => { if (!geo[k].length) delete geo[k]; });
  if (!Object.keys(geo).length) geo.countries = ["TR"];
  const t = {
    geo_locations: geo,
    age_min: Math.min(65, Math.max(18, parseInt(h.yas_min) || 18)),
    age_max: Math.min(65, Math.max(18, parseInt(h.yas_max) || 65)),
    targeting_automation: { advantage_audience: h.genisKitle ? 1 : 0 },
  };
  if (h.cinsiyet === "kadin") t.genders = [2]; else if (h.cinsiyet === "erkek") t.genders = [1];
  if ((h.ilgi || []).length) t.flexible_spec = [{ interests: h.ilgi.map(i => ({ id: i.id, name: i.name })) }];
  if (h.platform !== "hepsi") t.publisher_platforms = ["instagram"];
  return t;
}

// Tahmini kitle büyüklüğü
async function kitleTahmin(hedef, amac = "erisim") {
  const t = hedefleme(hedef);
  const j = await graph(`/${HESAP()}/delivery_estimate?optimization_goal=${AMACLAR[amac]?.optimization_goal || "REACH"}&targeting_spec=${encodeURIComponent(JSON.stringify(t))}`);
  const d = (j.data || [])[0] || {};
  return { alt: d.estimate_mau_lower_bound || null, ust: d.estimate_mau_upper_bound || null, gunlukErisim: d.estimate_dau || null };
}

async function guncelle(db, id, alanlar) {
  const [r] = await db.yaz(`reklamlar?id=eq.${id}`, "PATCH", { ...alanlar, updated_at: new Date().toISOString() });
  return r;
}

const paraBirimiKurus = (tl) => String(Math.round(Number(tl) * 100));
const igProfil = (m) => `https://www.instagram.com/${m.ig_kullanici_adi || ""}/`;

// Bir reklamı bir adım ilerletir; güncel satırı döner
async function adimAt(db, r, musteri) {
  const meta = r.meta || {};
  const A = AMACLAR[r.amac] || AMACLAR.erisim;
  const adim = r.adim || ADIMLAR[0];
  const ad = `${musteri.name} · ${r.baslik || A.ad} · ${new Date(r.created_at).toLocaleDateString("tr-TR")}`;
  try {
    if (!musteri.ig_user_id) throw new Error("Müşterinin Instagram hesabı bağlı değil (Planlayıcı → Instagram hesapları).");
    const sayfaId = meta.sayfa_id || await sayfaBul(db, musteri);
    if (!meta.sayfa_id) meta.sayfa_id = sayfaId;

    if (adim === "kampanya") {
      const j = await graph(`/${HESAP()}/campaigns`, { method: "POST", govde: { name: ad, objective: A.objective, status: "PAUSED", special_ad_categories: [], buying_type: "AUCTION" } });
      return guncelle(db, r.id, { meta: { ...meta, kampanya_id: j.id }, adim: "reklam_seti", hata: null });
    }
    if (adim === "reklam_seti") {
      const g = {
        name: ad, campaign_id: meta.kampanya_id, status: "PAUSED",
        daily_budget: paraBirimiKurus(r.butce_gunluk), billing_event: "IMPRESSIONS", optimization_goal: A.optimization_goal, bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: hedefleme(r.hedef), start_time: new Date(r.baslangic).toISOString(),
      };
      if (r.bitis) g.end_time = new Date(r.bitis).toISOString();
      if (A.destination_type) g.destination_type = A.destination_type;
      if (A.destination_type === "INSTAGRAM_PROFILE") g.promoted_object = { page_id: sayfaId, instagram_profile_id: musteri.ig_user_id };
      else if (r.amac !== "trafik") g.promoted_object = { page_id: sayfaId };
      const j = await graph(`/${HESAP()}/adsets`, { method: "POST", govde: g });
      return guncelle(db, r.id, { meta: { ...meta, reklam_seti_id: j.id }, adim: "medya" });
    }
    if (adim === "medya") {
      if (r.kaynak !== "yeni" || !r.dosya?.yol) return guncelle(db, r.id, { adim: "kreatif" });
      if (r.dosya.tur === "video") {
        if (!meta.video_id) {
          const url = await imzaliBaglanti(r.dosya.yol);
          const j = await graph(`/${HESAP()}/advideos`, { method: "POST", govde: { file_url: url, name: r.dosya.ad || ad } });
          return guncelle(db, r.id, { meta: { ...meta, video_id: j.id, video_basladi: new Date().toISOString() } });
        }
        const v = await graph(`/${meta.video_id}?fields=status,thumbnails{uri,is_preferred}`);
        const s = v.status?.video_status;
        if (s === "error") throw new Error("Video Meta'da işlenemedi (biçim ya da süre uygun değil).");
        if (s !== "ready") {
          if ((Date.now() - new Date(meta.video_basladi || r.updated_at).getTime()) / 60000 > VIDEO_BEKLEME_DK) throw new Error("Video zamanında işlenemedi.");
          return r; // bir sonraki çalıştırmada tekrar bakılır
        }
        const k = (v.thumbnails?.data || []).find(x => x.is_preferred) || (v.thumbnails?.data || [])[0];
        return guncelle(db, r.id, { meta: { ...meta, kapak_url: k?.uri || null }, adim: "kreatif" });
      }
      const url = await imzaliBaglanti(r.dosya.yol);
      const j = await graph(`/${HESAP()}/adimages`, { method: "POST", govde: { url } });
      const hash = Object.values(j.images || {})[0]?.hash;
      if (!hash) throw new Error("Görsel Meta'ya yüklenemedi.");
      return guncelle(db, r.id, { meta: { ...meta, image_hash: hash }, adim: "kreatif" });
    }
    if (adim === "kreatif") {
      let g;
      const link = r.baglanti || igProfil(musteri);
      const cta = { type: A.cta, value: A.destination_type === "INSTAGRAM_PROFILE" ? {} : { link } };
      if (r.kaynak === "gonderi") {
        g = { name: ad, object_id: sayfaId, instagram_user_id: musteri.ig_user_id, source_instagram_media_id: r.ig_medya_id };
        if (r.amac === "trafik" && r.baglanti) g.call_to_action = cta;
      } else if (r.dosya?.tur === "video") {
        g = { name: ad, object_story_spec: { page_id: sayfaId, instagram_user_id: musteri.ig_user_id, video_data: { video_id: meta.video_id, image_url: meta.kapak_url || undefined, message: r.metin || "", call_to_action: cta } } };
      } else {
        g = { name: ad, object_story_spec: { page_id: sayfaId, instagram_user_id: musteri.ig_user_id, link_data: { image_hash: meta.image_hash, link, message: r.metin || "", call_to_action: cta } } };
      }
      const j = await graph(`/${HESAP()}/adcreatives`, { method: "POST", govde: g });
      return guncelle(db, r.id, { meta: { ...meta, kreatif_id: j.id }, adim: "reklam" });
    }
    if (adim === "reklam") {
      const j = await graph(`/${HESAP()}/ads`, { method: "POST", govde: { name: ad, adset_id: meta.reklam_seti_id, creative: { creative_id: meta.kreatif_id }, status: "ACTIVE" } });
      return guncelle(db, r.id, { meta: { ...meta, reklam_id: j.id }, adim: "baslat" });
    }
    if (adim === "baslat") {
      await graph(`/${meta.reklam_seti_id}`, { method: "POST", govde: { status: "ACTIVE" } });
      await graph(`/${meta.kampanya_id}`, { method: "POST", govde: { status: "ACTIVE" } });
      return guncelle(db, r.id, { durum: "inceleme", adim: null, hata: null });
    }
    return guncelle(db, r.id, { durum: "hata", hata: "Bilinmeyen adım: " + adim });
  } catch (e) {
    return guncelle(db, r.id, { durum: "hata", hata: String(e.message || e).slice(0, 600), meta });
  }
}

// Oluşturma adımlarını süre bütçesi içinde ard arda atar (video işlenmesi gibi beklemelerde durur)
async function ilerle(db, r, musteri, sureMs = 6500) {
  const son = Date.now() + sureMs;
  let g = r;
  while (g.durum === "olusturuluyor" && Date.now() < son) {
    const onceki = `${g.adim}|${g.meta?.video_id || ""}`;
    g = await adimAt(db, g, musteri);
    if (g.durum === "olusturuluyor" && `${g.adim}|${g.meta?.video_id || ""}` === onceki) break; // bekleme (video işleniyor)
  }
  return g;
}

const DURUM_ESLE = { ACTIVE: "aktif", PENDING_REVIEW: "inceleme", IN_PROCESS: "inceleme", PREAPPROVED: "inceleme", PAUSED: "duraklatildi", CAMPAIGN_PAUSED: "duraklatildi", ADSET_PAUSED: "duraklatildi", DISAPPROVED: "reddedildi", WITH_ISSUES: "hata", ARCHIVED: "bitti", DELETED: "bitti" };

// Meta'dan durum ve sonuçları çek, kaydet
async function sonucTazele(db, r) {
  const meta = r.meta || {};
  if (!meta.reklam_id) return r;
  const guncelleme = { sonuc_guncellendi_at: new Date().toISOString() };
  try {
    const a = await graph(`/${meta.reklam_id}?fields=effective_status,status,ad_review_feedback{global}`);
    let durum = DURUM_ESLE[a.effective_status] || r.durum;
    if (r.bitis && new Date(r.bitis) < new Date() && (durum === "aktif" || durum === "duraklatildi" || durum === "inceleme")) durum = "bitti";
    if (r.durum === "bitti" && durum !== "bitti") durum = r.durum; // elle bitirilen öyle kalır
    guncelleme.durum = durum;
    if (durum === "reddedildi") {
      const g = a.ad_review_feedback?.global || {};
      guncelleme.hata = Object.entries(g).map(([k, v]) => `${k}: ${v}`).join(" · ").slice(0, 600) || "Meta reklamı onaylamadı.";
    } else if (durum !== "hata") guncelleme.hata = null;
  } catch (e) { /* durum alınamadı; sonuçları yine dene */ }
  try {
    const j = await graph(`/${meta.reklam_id}/insights?fields=impressions,reach,clicks,inline_link_clicks,spend,frequency,actions,cpm&date_preset=maximum`);
    const d = (j.data || [])[0] || {};
    const eylem = (tip) => Number((d.actions || []).find(x => x.action_type === tip)?.value || 0);
    guncelleme.sonuc = {
      gosterim: Number(d.impressions || 0), erisim: Number(d.reach || 0), tiklama: Number(d.clicks || 0), linkTiklama: Number(d.inline_link_clicks || 0),
      harcama: Number(d.spend || 0), siklik: Number(d.frequency || 0), bgm: Number(d.cpm || 0),
      etkilesim: eylem("post_engagement"), begeni: eylem("post_reaction") || eylem("like"), yorum: eylem("comment"), kaydetme: eylem("onsite_conversion.post_save"),
      videoIzleme: eylem("video_view"), profilZiyareti: eylem("instagram_profile_visit") || eylem("profile_visit"), mesaj: eylem("onsite_conversion.messaging_conversation_started_7d"),
    };
  } catch (e) { if (!guncelleme.durum) return r; }
  return guncelle(db, r.id, guncelleme);
}

// Durdur / devam / bitir
async function durumDegistir(db, r, islem) {
  const meta = r.meta || {};
  if (!meta.kampanya_id) throw new Error("Bu reklam Meta'da henüz oluşmadı.");
  if (islem === "durdur") { await graph(`/${meta.kampanya_id}`, { method: "POST", govde: { status: "PAUSED" } }); return guncelle(db, r.id, { durum: "duraklatildi" }); }
  if (islem === "devam") {
    await graph(`/${meta.kampanya_id}`, { method: "POST", govde: { status: "ACTIVE" } });
    if (meta.reklam_seti_id) await graph(`/${meta.reklam_seti_id}`, { method: "POST", govde: { status: "ACTIVE" } });
    if (meta.reklam_id) await graph(`/${meta.reklam_id}`, { method: "POST", govde: { status: "ACTIVE" } });
    return guncelle(db, r.id, { durum: "inceleme" });
  }
  if (islem === "bitir") { await graph(`/${meta.kampanya_id}`, { method: "POST", govde: { status: "PAUSED" } }); return guncelle(db, r.id, { durum: "bitti", bitis: r.bitis && new Date(r.bitis) < new Date() ? r.bitis : new Date().toISOString() }); }
  if (islem === "sil") {
    if (!["hata", "reddedildi", "bitti", "olusturuluyor"].includes(r.durum)) throw new Error("Yayındaki reklam silinmez; önce bitirin.");
    try { await graph(`/${meta.kampanya_id}`, { method: "DELETE" }); } catch (e) { /* Meta'da zaten yoksa sorun değil */ }
    await db.yaz(`reklamlar?id=eq.${r.id}`, "DELETE", {});
    return { ...r, durum: "iptal", silindi: true };
  }
  throw new Error("Bilinmeyen işlem");
}

async function musteriGetir(db, clientId) {
  const [m] = await db.oku(`clients?id=eq.${clientId}&select=id,name,ig_user_id,ig_kullanici_adi,fb_sayfa_id`);
  if (!m) throw new Error("Müşteri bulunamadı.");
  return m;
}

// Yeni reklam kaydı oluşturur ve hemen ilerletmeye başlar
async function olustur(g, olusturan) {
  const db = veritabani();
  const m = await musteriGetir(db, g.client_id);
  if (!m.ig_user_id) throw new Error(`${m.name} için Instagram hesabı bağlı değil.`);
  if (!AMACLAR[g.amac]) throw new Error("Amaç seçin.");
  if (g.kaynak === "gonderi" && !g.ig_medya_id) throw new Error("Öne çıkarılacak gönderiyi seçin.");
  if (g.kaynak === "yeni" && !g.dosya?.yol) throw new Error("Görsel ya da video yükleyin.");
  if (g.amac === "trafik" && !/^https?:\/\//.test(g.baglanti || "")) throw new Error("Web sitesi trafiği için bağlantı adresi gerekir (https://…).");
  const butce = Number(g.butce_gunluk);
  if (!(butce > 0)) throw new Error("Günlük bütçe girin.");
  const bas = new Date(g.baslangic || Date.now());
  const bit = g.bitis ? new Date(g.bitis) : null;
  if (bit && bit <= bas) throw new Error("Bitiş, başlangıçtan sonra olmalı.");
  if (bit && bit.getTime() - bas.getTime() < 23 * 3600e3) throw new Error("Reklam en az 1 gün sürmeli.");
  const satir = {
    client_id: m.id, baslik: String(g.baslik || "").slice(0, 120), amac: g.amac, kaynak: g.kaynak === "yeni" ? "yeni" : "gonderi",
    ig_medya_id: g.kaynak === "gonderi" ? String(g.ig_medya_id) : null, dosya: g.kaynak === "yeni" ? { yol: String(g.dosya.yol), tur: g.dosya.tur === "video" ? "video" : "resim", ad: String(g.dosya.ad || "") } : null,
    metin: String(g.metin || "").slice(0, 2000), baglanti: g.baglanti ? String(g.baglanti).slice(0, 500) : null,
    hedef: { konumlar: (g.hedef?.konumlar || []).slice(0, 25), yas_min: g.hedef?.yas_min || 18, yas_max: g.hedef?.yas_max || 65, cinsiyet: g.hedef?.cinsiyet || "hepsi", ilgi: (g.hedef?.ilgi || []).slice(0, 25), platform: g.hedef?.platform === "hepsi" ? "hepsi" : "instagram", genisKitle: !!g.hedef?.genisKitle },
    butce_gunluk: butce, baslangic: bas.toISOString(), bitis: bit ? bit.toISOString() : null,
    durum: "olusturuluyor", adim: "kampanya", meta: {}, olusturan_id: olusturan?.id || null, olusturan_ad: olusturan?.name || null,
  };
  const [r] = await db.yaz("reklamlar", "POST", satir);
  return ilerle(db, r, m);
}

// Panelden: belirli bir reklamı ilerlet / tazele / durum değiştir
async function islem(id, tur) {
  const db = veritabani();
  const [r] = await db.oku(`reklamlar?id=eq.${id}&select=*`);
  if (!r) throw new Error("Reklam bulunamadı.");
  const m = await musteriGetir(db, r.client_id);
  if (tur === "ilerle") return r.durum === "olusturuluyor" ? ilerle(db, r, m) : r;
  if (tur === "yenile") return sonucTazele(db, r);
  if (tur === "tekrar") { if (r.durum !== "hata") return r; const g = await guncelle(db, r.id, { durum: "olusturuluyor", hata: null, adim: r.adim || "kampanya" }); return ilerle(db, g, m); }
  return durumDegistir(db, r, tur);
}

// Zamanlanmış: oluşturulmakta olanları ilerlet, yayındakilerin sonuçlarını saatte bir tazele
async function calistir() {
  const db = veritabani();
  const sonuc = [];
  const bekleyen = await db.oku(`reklamlar?durum=eq.olusturuluyor&select=*&order=created_at.asc&limit=5`);
  for (const r of bekleyen) {
    try { const m = await musteriGetir(db, r.client_id); const g = await ilerle(db, r, m, 4000); sonuc.push({ id: r.id, durum: g.durum, adim: g.adim }); }
    catch (e) { sonuc.push({ id: r.id, hata: e.message }); }
  }
  const esik = new Date(Date.now() - 60 * 60e3).toISOString();
  const yayinda = await db.oku(`reklamlar?durum=in.(inceleme,aktif,duraklatildi)&or=(sonuc_guncellendi_at.is.null,sonuc_guncellendi_at.lt."${esik}")&select=*&order=sonuc_guncellendi_at.asc.nullsfirst&limit=8`);
  for (const r of yayinda) {
    try { const g = await sonucTazele(db, r); sonuc.push({ id: r.id, durum: g.durum, tazelendi: true }); } catch (e) { sonuc.push({ id: r.id, hata: e.message }); }
  }
  return sonuc;
}

module.exports = { AMACLAR, hesapBilgi, gonderiler, konumAra, ilgiAra, kitleTahmin, olustur, islem, calistir };
