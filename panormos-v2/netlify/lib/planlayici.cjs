// Paylaşım Planlayıcı: zamanı gelen paylaşımları Instagram Graph API ile yayınlar.
// Akış (her çalıştırmada bir adım; Netlify işlevleri kısa sürelidir):
//   bekliyor → kapsayıcı oluşturulur → hazirlaniyor → (video işlenince) yayınlanır → paylasildi
// Paylaşılınca publishes tablosuna kayıt yazılır; müşterinin aylık hakkı (quota_detail) bu kayıtlardan düşer.
// Gerekli ortam değişkenleri: SUPABASE_URL, SUPABASE_SERVICE_KEY, META_ERISIM_ANAHTARI
// (Panormos Business'taki sistem kullanıcısının anahtarı; müşteri hesapları bu portföyde olmalı).
const { veritabani } = require("./qr-abonelik.cjs");

const GRAPH = "https://graph.facebook.com/v23.0";
const ZAMAN_ASIMI_DK = 45; // video bu süre içinde işlenmezse hata sayılır
const ON_HAZIRLIK_DK = 10; // dosya, plan saatinden bu kadar önce Instagram'a yüklenip hazırlatılır; yayın tam saatinde yapılır

// Müşterinin bağlı Instagram hesapları: birincil (clients.ig_user_id) + ek hesaplar (clients.ig_ek_hesaplar)
function musteriHesaplari(m) {
  const liste = [];
  if (m?.ig_user_id) liste.push({ id: String(m.ig_user_id), kullanici: m.ig_kullanici_adi || null, birincil: true });
  const ek = Array.isArray(m?.ig_ek_hesaplar) ? m.ig_ek_hesaplar : [];
  for (const h of ek) if (h?.ig_user_id && !liste.find(x => x.id === String(h.ig_user_id))) liste.push({ id: String(h.ig_user_id), kullanici: h.ig_kullanici_adi || null, birincil: false });
  return liste;
}

// Müşteri satırlarını ek hesap sütunuyla okur; sütun henüz yoksa (SQL çalıştırılmadıysa) onsuz okur
async function musterileriOku(db, filtre) {
  try { return await db.oku(`clients?${filtre}&select=id,name,ig_user_id,ig_kullanici_adi,fb_sayfa_id,ig_ek_hesaplar`); }
  catch (e) { return db.oku(`clients?${filtre}&select=id,name,ig_user_id,ig_kullanici_adi,fb_sayfa_id`); }
}

function metaAnahtari() {
  const a = process.env.META_ERISIM_ANAHTARI || "";
  if (!a) throw new Error("Instagram bağlantısı kurulmamış (META_ERISIM_ANAHTARI eksik).");
  return a;
}

async function graph(yol, { method = "GET", govde } = {}) {
  const anahtar = metaAnahtari();
  const url = new URL(GRAPH + yol);
  let secenek = { method };
  if (method === "GET") url.searchParams.set("access_token", anahtar);
  else {
    const p = new URLSearchParams({ ...govde, access_token: anahtar });
    secenek = { method, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: p.toString() };
  }
  const r = await fetch(url, secenek);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error?.error_user_msg || j.error?.message || `Instagram yanıtı: ${r.status}`);
  return j;
}

// Depodaki dosyaya 3 saatlik imzalı bağlantı (Instagram dosyayı bu adresten indirir)
async function imzaliBaglanti(yol) {
  const ADRES = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const ANAHTAR = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const kodlu = yol.split("/").map(encodeURIComponent).join("/");
  const r = await fetch(`${ADRES}/storage/v1/object/sign/planlayici/${kodlu}`, {
    method: "POST",
    headers: { apikey: ANAHTAR, Authorization: `Bearer ${ANAHTAR}`, "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3 * 3600 }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.signedURL) throw new Error("Dosya bağlantısı oluşturulamadı: " + (j.message || r.status));
  return `${ADRES}/storage/v1${j.signedURL}`;
}

// Tek bir dosya için kapsayıcı
async function kapsayici(igId, dosya, { tur, aciklama, kaydirmaParcasi = false }) {
  const url = await imzaliBaglanti(dosya.yol);
  const video = dosya.tur === "video";
  const g = {};
  if (kaydirmaParcasi) {
    g.is_carousel_item = "true";
    if (video) { g.media_type = "VIDEO"; g.video_url = url; } else g.image_url = url;
  } else if (tur === "story") {
    g.media_type = "STORIES";
    if (video) g.video_url = url; else g.image_url = url;
  } else if (video) {
    // Instagram'da akıştaki her video Reels olarak yayınlanır
    g.media_type = "REELS"; g.video_url = url; g.share_to_feed = "true"; g.caption = aciklama || "";
  } else {
    g.image_url = url; g.caption = aciklama || "";
  }
  const j = await graph(`/${igId}/media`, { method: "POST", govde: g });
  return j.id;
}

async function durumu(kapId) {
  const j = await graph(`/${kapId}?fields=status_code,status`);
  return j.status_code || "FINISHED"; // görsellerde alan dönmeyebilir
}

async function guncelle(db, id, alanlar) {
  await db.yaz(`planli_paylasimlar?id=eq.${id}`, "PATCH", { ...alanlar, updated_at: new Date().toISOString() });
}

// Bir paylaşımı bir adım ilerletir. Dönen metin günlük içindir.
// zorla: "Şimdi paylaş" — plan saatini beklemeden yayınla
async function ilerlet(db, p, musteri, zorla = false) {
  // Paylaşım hangi hesaba gidecek: planda seçilen hesap (müşteriye bağlı olmalı), yoksa müşterinin birincil hesabı
  const hesaplarim = musteriHesaplari(musteri);
  let igId = null;
  if (p.ig_user_id) {
    if (!hesaplarim.find(h => h.id === String(p.ig_user_id))) { await guncelle(db, p.id, { durum: "hata", hata: "Planda seçilen Instagram hesabı artık bu müşteriye bağlı değil (Planlayıcı → Instagram hesapları)." }); return "hesap uyuşmuyor"; }
    igId = String(p.ig_user_id);
  } else igId = musteri?.ig_user_id;
  if (!igId) { await guncelle(db, p.id, { durum: "hata", hata: "Müşterinin Instagram hesabı bağlı değil (Planlayıcı → Hesaplar)." }); return "hesap yok"; }
  const dosyalar = Array.isArray(p.dosyalar) ? p.dosyalar : [];
  if (!dosyalar.length) { await guncelle(db, p.id, { durum: "hata", hata: "Yüklenmiş dosya yok." }); return "dosya yok"; }
  const meta = p.meta || {};

  try {
    // 1) Kapsayıcıları oluştur
    if (p.durum === "bekliyor") {
      if (p.icerik_turu === "carousel") {
        if (dosyalar.length < 2) throw new Error("Kaydırmalı paylaşım için en az 2 dosya gerekir.");
        const parcalar = [];
        for (const d of dosyalar.slice(0, 10)) parcalar.push(await kapsayici(igId, d, { kaydirmaParcasi: true }));
        await guncelle(db, p.id, { durum: "hazirlaniyor", meta: { parcalar, basladi: new Date().toISOString() }, hata: null });
      } else {
        const kap = await kapsayici(igId, dosyalar[0], { tur: p.icerik_turu, aciklama: p.aciklama });
        await guncelle(db, p.id, { durum: "hazirlaniyor", meta: { kap, basladi: new Date().toISOString() }, hata: null });
      }
      return "kapsayıcı oluşturuldu";
    }

    // 2) İşlenmeyi bekle, sonra yayınla
    if (p.durum === "hazirlaniyor") {
      const gecen = (Date.now() - new Date(meta.basladi || p.updated_at).getTime()) / 60000;
      let kap = meta.kap;
      if (p.icerik_turu === "carousel" && !kap) {
        for (const c of meta.parcalar || []) {
          const s = await durumu(c);
          if (s === "ERROR") throw new Error("Kaydırmalı paylaşımdaki bir dosya Instagram'da işlenemedi.");
          if (s !== "FINISHED") { if (gecen > ZAMAN_ASIMI_DK) throw new Error("Dosyalar zamanında işlenemedi."); return "parçalar işleniyor"; }
        }
        const j = await graph(`/${igId}/media`, { method: "POST", govde: { media_type: "CAROUSEL", children: (meta.parcalar || []).join(","), caption: p.aciklama || "" } });
        kap = j.id;
        await guncelle(db, p.id, { meta: { ...meta, kap } });
      }
      const s = await durumu(kap);
      if (s === "ERROR") throw new Error("Dosya Instagram'da işlenemedi (biçim, süre ya da boyut uygun değil).");
      if (s !== "FINISHED") { if (gecen > ZAMAN_ASIMI_DK) throw new Error("Video zamanında işlenemedi."); return "işleniyor"; }
      // Hazır; plan saati gelmediyse bekle (tam saatinde yayınlanır)
      if (!zorla && new Date(p.zaman).getTime() > Date.now() + 20000) {
        if (!meta.hazir) await guncelle(db, p.id, { meta: { ...meta, hazir: new Date().toISOString() } });
        return "hazır, saat bekleniyor";
      }

      const yayin = await graph(`/${igId}/media_publish`, { method: "POST", govde: { creation_id: kap } });
      let baglanti = null;
      try { baglanti = (await graph(`/${yayin.id}?fields=permalink`)).permalink || null; } catch (e) { /* hikayelerde olmayabilir */ }
      const simdi = new Date().toISOString();
      // Müşterinin hakkından düş: paylaşım kaydı
      let publishId = null;
      try {
        const kayit = await db.yaz("publishes", "POST", { client_id: p.client_id, publisher_id: p.olusturan_id || null, platform: "instagram", content_type: p.icerik_turu, quantity: 1, published_at: simdi });
        publishId = kayit?.[0]?.id || null;
      } catch (e) { /* paylaşım yapıldı; kayıt hatası ayrıca yazılır */ }
      // publishes.id sayı; planli_paylasimlar.publish_id uuid sütunu → numara meta'ya yazılır (uuid ise sütuna da)
      const uuidMi = /^[0-9a-f-]{36}$/i.test(String(publishId || ""));
      const bitti = { durum: "paylasildi", ig_medya_id: yayin.id, baglanti, paylasildi_at: simdi, meta: { ...meta, publish_kayit: publishId }, hata: publishId ? null : "Paylaşıldı ama hak kaydı yazılamadı; müşterinin Paylaşımlar sekmesinden elle ekleyin." };
      if (uuidMi) bitti.publish_id = publishId;
      try { await guncelle(db, p.id, bitti); }
      catch (e) { await guncelle(db, p.id, { durum: "paylasildi", ig_medya_id: yayin.id, paylasildi_at: simdi, hata: null }); } // yayın yapıldı; kayıt hatası "hata" göstermesin
      return "paylaşıldı";
    }
    return "atlandı";
  } catch (e) {
    await guncelle(db, p.id, { durum: "hata", hata: String(e.message || e).slice(0, 500) });
    return "hata: " + e.message;
  }
}

// Zamanı gelen (ya da hazırlanan) paylaşımları işler; id verilirse yalnızca onu
async function calistir({ id = null } = {}) {
  const db = veritabani();
  const simdi = new Date().toISOString();
  const esik = new Date(Date.now() + ON_HAZIRLIK_DK * 60000).toISOString(); // 10 dk içinde yayınlanacaklar hazırlığa alınır
  // İki ayrı sorgu: hazırlık zamanı gelen bekleyenler + hazırlanmakta olanlar (or() içindeki tırnaklı tarih yazımına güvenmemek için)
  const liste = id
    ? await db.oku(`planli_paylasimlar?id=eq.${id}&durum=in.(bekliyor,hazirlaniyor)&select=*&limit=1`)
    : [
      ...await db.oku(`planli_paylasimlar?durum=eq.bekliyor&zaman=lte.${encodeURIComponent(esik)}&select=*&order=zaman.asc&limit=20`),
      ...await db.oku(`planli_paylasimlar?durum=eq.hazirlaniyor&select=*&order=zaman.asc&limit=20`),
    ];
  if (!id) console.log(`planlayıcı kontrol ${simdi}: ${liste.length} paylaşım sırada`);
  if (!liste.length) return [];
  const idler = [...new Set(liste.map(p => p.client_id))];
  const musteriler = await musterileriOku(db, `id=in.(${idler.join(",")})`);
  const sonuc = [];
  const bekle = (ms) => new Promise(r => setTimeout(r, ms));
  for (const p of liste) {
    const m = musteriler.find(x => x.id === p.client_id);
    let adim = await ilerlet(db, p, m, !!id);
    // Kapsayıcı yeni oluştuysa hemen devam et (saati geldiyse yayınlanır; gelmediyse "hazır, saat bekleniyor")
    if (adim === "kapsayıcı oluşturuldu") {
      await bekle(2500);
      const [g] = await db.oku(`planli_paylasimlar?id=eq.${p.id}&select=*`);
      if (g && g.durum === "hazirlaniyor") adim += " → " + await ilerlet(db, g, m, !!id);
    }
    sonuc.push({ id: p.id, musteri: m?.name, sonuc: adim });
  }
  return sonuc;
}

// Anahtarın eriştiği Instagram işletme hesapları (müşteri eşleştirmesi için)
async function hesaplar() {
  const j = await graph(`/me/accounts?fields=name,instagram_business_account{id,username,profile_picture_url}&limit=200`);
  return (j.data || []).filter(s => s.instagram_business_account).map(s => ({
    sayfa: s.name, id: s.instagram_business_account.id, kullanici: s.instagram_business_account.username, foto: s.instagram_business_account.profile_picture_url || null,
  }));
}

// Müşterinin Instagram istatistikleri: hesap özeti + seçilen aydaki paylaşımların sayıları
// ay: "YYYY-MM". Gerekli izin: instagram_manage_insights
async function istatistik(igId, ay) {
  const [y, m] = String(ay || "").split("-").map(Number);
  const bas = new Date(Date.UTC(y, m - 1, 1)), son = new Date(Date.UTC(y, m, 1));
  const hesap = await graph(`/${igId}?fields=username,name,followers_count,follows_count,media_count,profile_picture_url`);
  // Paylaşımlar (yeniden eskiye; ay başından eskiye inince dur)
  const medya = [];
  let yol = `/${igId}/media?fields=id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,thumbnail_url,media_url&limit=50`;
  for (let sayfa = 0; sayfa < 6 && yol; sayfa++) {
    const j = await graph(yol);
    let eskiyeIndi = false;
    for (const x of j.data || []) {
      const t = new Date(x.timestamp);
      if (t < bas) { eskiyeIndi = true; break; }
      if (t < son) medya.push(x);
    }
    if (eskiyeIndi || !j.paging?.next) break;
    const n = new URL(j.paging.next); n.searchParams.delete("access_token");
    yol = n.pathname.replace(/^\/v[0-9.]+/, "") + n.search;
  }
  // Her paylaşımın görüntülenme / erişim / kaydetme / paylaşım sayıları
  const sayilar = async (x) => {
    for (const metrik of ["views,reach,saved,shares,total_interactions", "reach,saved,shares,total_interactions", "reach,saved"]) {
      try {
        const j = await graph(`/${x.id}/insights?metric=${metrik}`);
        const o = {}; (j.data || []).forEach(d => { o[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? 0; });
        return o;
      } catch (e) { /* bu tür için desteklenmeyen ölçü; daha azıyla dene */ }
    }
    return {};
  };
  for (let i = 0; i < medya.length; i += 8) {
    const grup = medya.slice(i, i + 8);
    const s = await Promise.all(grup.map(sayilar));
    grup.forEach((x, k) => { x.olcu = s[k]; });
  }
  // Hesap geneli (ayın günleri; Instagram en çok 30 günlük aralık verir)
  let genel = {};
  try {
    const bitis = new Date(Math.min(son.getTime(), Date.now()));
    const baslangic = new Date(Math.max(bas.getTime(), bitis.getTime() - 30 * 86400000));
    const j = await graph(`/${igId}/insights?metric=reach,views,profile_views,accounts_engaged,total_interactions&metric_type=total_value&period=day&since=${Math.floor(baslangic / 1000)}&until=${Math.floor(bitis / 1000)}`);
    (j.data || []).forEach(d => { genel[d.name] = d.total_value?.value ?? 0; });
  } catch (e) { genel = { hata: e.message }; }
  return {
    hesap: { kullanici: hesap.username, ad: hesap.name, takipci: hesap.followers_count, takip: hesap.follows_count, paylasim: hesap.media_count, foto: hesap.profile_picture_url || null },
    genel,
    medya: medya.map(x => ({ id: x.id, zaman: x.timestamp, tur: x.media_product_type === "REELS" ? "reels" : x.media_type === "CAROUSEL_ALBUM" ? "carousel" : x.media_product_type === "STORY" ? "story" : "post", aciklama: [...(x.caption || "")].slice(0, 160).join(""), baglanti: x.permalink, gorsel: x.thumbnail_url || x.media_url || null, begeni: x.like_count || 0, yorum: x.comments_count || 0, goruntulenme: x.olcu?.views ?? null, erisim: x.olcu?.reach ?? null, kaydetme: x.olcu?.saved ?? null, paylasim: x.olcu?.shares ?? null, etkilesim: x.olcu?.total_interactions ?? null })),
  };
}

// Çakışmada güncelle: önce güncelle (PATCH), satır yoksa ekle (POST)
async function yazVeyaGuncelle(db, tablo, anahtarFiltre, satir) {
  const guncel = await db.yaz(`${tablo}?${anahtarFiltre}`, "PATCH", satir).catch(() => []);
  if (Array.isArray(guncel) && guncel.length) return guncel;
  return db.yaz(tablo, "POST", satir);
}

// Günlük takipçi hareketi: Instagram'ın verdiği yeni/ayrılan sayıları (son 30 gün) + bugünkü toplam.
// since/until Unix saniye. Dönen: [{gun:'YYYY-MM-DD', yeni, ayrilan}]
async function takipciHareketi(igId, sinceSn, untilSn) {
  const gunler = {};
  const ekle = (ad, j) => { for (const d of j.data || []) for (const v of d.values || []) { const g = String(v.end_time || "").slice(0, 10); if (!g) continue; gunler[g] = gunler[g] || {}; gunler[g][ad] = v.value ?? 0; } };
  // Yeni sürüm metrikleri (follows/unfollows), olmazsa eski follower_count
  try { ekle("yeni", await graph(`/${igId}/insights?metric=follows_and_unfollows&metric_type=total_value&breakdown=follow_type&period=day&since=${sinceSn}&until=${untilSn}`)); } catch (e) { /* desteklenmeyebilir */ }
  if (!Object.keys(gunler).length) {
    try { ekle("yeni", await graph(`/${igId}/insights?metric=follower_count&period=day&since=${sinceSn}&until=${untilSn}`)); } catch (e) { /* 100 takipçi altı hesaplarda yok */ }
  }
  return Object.keys(gunler).sort().map(g => ({ gun: g, yeni: gunler[g].yeni ?? null, ayrilan: gunler[g].ayrilan ?? null }));
}

// Gece işi: bağlı her müşterinin takipçi sayısını ve son 30 günün hareketini ig_takipci_gunluk'a yazar
async function takipciArsivle() {
  const db = veritabani();
  const musteriler = await db.oku(`clients?ig_user_id=not.is.null&deleted_at=is.null&select=id,name,ig_user_id`);
  const simdi = new Date(); const bugun = simdi.toISOString().slice(0, 10);
  const sonuc = [];
  for (const m of musteriler) {
    try {
      const hesap = await graph(`/${m.ig_user_id}?fields=followers_count`);
      const until = Math.floor(simdi / 1000), since = until - 29 * 86400;
      const hareket = await takipciHareketi(m.ig_user_id, since, until);
      const satirlar = hareket.map(h => ({ client_id: m.id, gun: h.gun, yeni: h.yeni, ayrilan: h.ayrilan }));
      // Bugünün toplamı (hareket satırı yoksa da yaz)
      const bugunku = satirlar.find(x => x.gun === bugun);
      if (bugunku) bugunku.takipci = hesap.followers_count; else satirlar.push({ client_id: m.id, gun: bugun, takipci: hesap.followers_count });
      // Eski günlerin toplamını bozmamak için takipci yalnız bugüne yazılır; diğerlerinde alan yok → merge'de dokunulmaz
      for (const r of satirlar) await yazVeyaGuncelle(db, "ig_takipci_gunluk", `client_id=eq.${m.id}&gun=eq.${r.gun}`, r);
      sonuc.push({ musteri: m.name, takipci: hesap.followers_count, gun: satirlar.length });
    } catch (e) { sonuc.push({ musteri: m.name, hata: e.message }); }
  }
  return sonuc;
}

// Önbellekli istatistik: 1 saat içinde tekrar sorulursa Instagram'a gitmez (zorla=true ile yenilenir)
// birincil=false: müşterinin ek hesabı → önbellek anahtarı "YYYY-MM#<hesap>" olur, takipçi arşivi (yalnız birincil hesap için tutulur) eklenmez
async function istatistikOnbellekli(clientId, igId, ay, zorla = false, birincil = true) {
  const db = veritabani();
  const anahtar = birincil ? ay : `${ay}#${igId}`;
  if (!zorla) {
    try {
      const [c] = await db.oku(`ig_istatistik_onbellek?client_id=eq.${clientId}&ay=eq.${encodeURIComponent(anahtar)}&select=veri,guncellendi_at`);
      // İçinde bulunulan ay 1 saat, geçmiş aylar 30 gün saklanır (geçmiş ayın sayıları artık pek değişmez)
      const gecmisAy = ay < new Date().toISOString().slice(0, 7);
      if (c && Date.now() - new Date(c.guncellendi_at).getTime() < (gecmisAy ? 30 * 24 : 1) * 60 * 60 * 1000) return { ...c.veri, onbellek: c.guncellendi_at };
    } catch (e) { /* tablo yoksa doğrudan çek */ }
  }
  const veri = await istatistik(igId, ay);
  // Takipçi arşivinden o ayın hareketi (yalnız birincil hesap arşivlenir)
  try {
    if (!birincil) throw new Error("ek hesap");
    const [y, mo] = ay.split("-").map(Number);
    const bas = `${y}-${String(mo).padStart(2, "0")}-01`, son = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
    const g = await db.oku(`ig_takipci_gunluk?client_id=eq.${clientId}&gun=gte.${bas}&gun=lte.${son}&select=gun,takipci,yeni,ayrilan&order=gun.asc`);
    const yeni = g.reduce((s, x) => s + (x.yeni || 0), 0), ayrilan = g.reduce((s, x) => s + (x.ayrilan || 0), 0);
    const ilk = g.find(x => x.takipci != null), sonT = [...g].reverse().find(x => x.takipci != null);
    veri.takipci = { gunler: g, yeni, ayrilan, net: (ilk && sonT && ilk !== sonT) ? sonT.takipci - ilk.takipci : (yeni - ayrilan), baslangic: ilk?.takipci ?? null, bitis: sonT?.takipci ?? null, kayitVar: g.length > 0 };
  } catch (e) { veri.takipci = { kayitVar: false }; }
  try {
    // jsonb, \u0000 ve tek başına kalmış vekil (surrogate) karakterleri kabul etmez; açıklamalardaki emojileri temizle
    const temiz = JSON.parse(JSON.stringify(veri).replace(/\\u0000/g, "").replace(/[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g, "$1"));
    await yazVeyaGuncelle(db, "ig_istatistik_onbellek", `client_id=eq.${clientId}&ay=eq.${encodeURIComponent(anahtar)}`, { client_id: clientId, ay: anahtar, veri: temiz, guncellendi_at: new Date().toISOString() });
  } catch (e) { veri.onbellekHatasi = String(e.message || e).slice(0, 300); }
  return veri;
}

// Bir ayın özet sayıları (grafik ve önceki aya göre karşılaştırma için)
function ayOzeti(ay, v) {
  const medya = v?.medya || [];
  const top = (k) => medya.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const tk = v?.takipci || {};
  return {
    ay, veriVar: !!v, paylasim: medya.length,
    goruntulenme: v?.genel?.views ?? top("goruntulenme"), erisim: v?.genel?.reach ?? top("erisim"), profil: v?.genel?.profile_views ?? null,
    begeni: top("begeni"), yorum: top("yorum"), kaydetme: top("kaydetme"), paylasimSayisi: top("paylasim"),
    etkilesim: top("begeni") + top("yorum") + top("kaydetme") + top("paylasim"),
    // geçmiş ayda günlük arşiv yoksa takipçi bilinmez (hesap sayısı bugünkü değer olurdu)
    takipci: tk.kayitVar ? (tk.bitis ?? null) : (ay === new Date().toISOString().slice(0, 7) ? (v?.hesap?.takipci ?? null) : null), takipciGuncel: !tk.kayitVar, yeniTakipci: tk.kayitVar ? tk.yeni : null, ayrilan: tk.kayitVar ? tk.ayrilan : null,
  };
}

// Son N ayın özeti. Önbellekte olmayan aylardan her çağrıda en çok 1 tanesi hesaplanır (işlev süresi kısa);
// eksik kalan varsa "eksik" sayısı döner, panel tekrar çağırır.
async function aylikOzet(clientId, igId, ay, adet = 6, birincil = true) {
  const db = veritabani();
  const [y, m] = ay.split("-").map(Number);
  const aylar = Array.from({ length: adet }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return d.toISOString().slice(0, 7); }).reverse();
  const anahtar = (a) => birincil ? a : `${a}#${igId}`;
  let onbellek = [];
  try {
    const ham = await db.oku(`ig_istatistik_onbellek?client_id=eq.${clientId}&ay=in.(${aylar.map(a => encodeURIComponent(anahtar(a))).join(",")})&select=ay,veri,guncellendi_at`);
    onbellek = ham.map(c => ({ ...c, ay: String(c.ay).split("#")[0] })); // anahtarı aya indirge
  } catch (e) { /* tablo yok */ }
  const buAy = new Date().toISOString().slice(0, 7);
  const bul = (a) => onbellek.find(c => c.ay === a && (a < buAy ? Date.now() - new Date(c.guncellendi_at).getTime() < 30 * 24 * 3600e3 : Date.now() - new Date(c.guncellendi_at).getTime() < 3600e3 * 6));
  const eksikler = aylar.filter(a => !bul(a)).reverse(); // en yeniden eskiye
  let hesaplanan = null;
  if (eksikler.length) { hesaplanan = eksikler[0]; try { const v = await istatistikOnbellekli(clientId, igId, hesaplanan, false, birincil); onbellek.push({ ay: hesaplanan, veri: v, guncellendi_at: new Date().toISOString() }); } catch (e) { /* bir sonraki çağrıda */ } }
  return { aylar: aylar.map(a => ayOzeti(a, (onbellek.find(c => c.ay === a) || {}).veri || null)), eksik: Math.max(0, eksikler.length - (hesaplanan ? 1 : 0)) };
}

module.exports = { calistir, hesaplar, istatistik, istatistikOnbellekli, aylikOzet, takipciArsivle, imzaliBaglanti, graph, musteriHesaplari, musterileriOku };
