import { useEffect, useMemo, useState } from "react";
import { logoluQr, baskiCiz, tuvalPng, kartlariYazdir } from "./QrBaski";
import { supabase } from "./supabaseClient";
import { T, THEME } from "./theme";
import { excelOku, excelOkuDizi, sablonIndir } from "./excel";

// Panel → QR Menü: çalıştığımız restoran ve barların dijital menülerini yönetir.
// Her menü panormosmedya.com/m/<slug> adresinde yayınlanır; masadaki QR kod bu adrese açılır.
// Fiyat, ürün ya da kategori değişince menü anında güncellenir.

const SITE = "https://panormosmedya.com";
const ALERJENLER = [["G", "Gluten"], ["D", "Süt ürünleri"], ["N", "Kuruyemiş"], ["V", "Vejetaryen"], ["VG", "Vegan"], ["SF", "Kabuklu deniz ürünü"], ["ALC", "Alkol"], ["SSM", "Susam"]];
const TEMALAR = [
  { ad: "Bordo & krem", ana: "#5C1A1B", zemin: "#F3F1EC" },
  { ad: "Siyah & altın", ana: "#8A6A2F", zemin: "#F5F0E6" },
  { ad: "Zeytin yeşili", ana: "#3F5A2A", zemin: "#F1F0E8" },
  { ad: "Gece mavisi", ana: "#1F3557", zemin: "#EEF1F5" },
  { ad: "Kiremit", ana: "#B4472A", zemin: "#FBF3EA" },
  { ad: "Kömür", ana: "#222222", zemin: "#F4F4F2" },
  { ad: "Gece & altın (Gece şablonu)", ana: "#D4B26A", zemin: "#14110F" },
];
const SABLONLAR = [["zarif", "Zarif: kemerli kartlar, kâğıt menü düzeni"], ["klasik", "Klasik liste: tek sayfa, arama, kategori çubuğu"], ["fotografli", "Fotoğraflı kartlar: ürün fotoğraflarıyla"], ["gece", "Gece: koyu zemin (bar ve kokteyl)"]];
const YAZI_TIPLERI = [["zarif", "Zarif (restoran)"], ["modern", "Modern (kafe)"], ["eglenceli", "Eğlenceli (bar)"]];

const sluglastir = (s) => String(s || "").toLocaleLowerCase("tr")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const sayiOku = (v) => { const s = String(v ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); return s === "" ? null : Number(s); };
const fiyatYaz = (n) => (n === null || n === undefined ? "" : `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(n))} ₺`);

// Excel'den okunan metinleri eşleştirmek için: büyük/küçük harf ve Türkçe karakter farkı önemsiz
const sade = (s) => String(s ?? "").toLocaleLowerCase("tr")
  .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
  .replace(/[^a-z0-9]/g, "");
const evetMi = (v) => /^(evet|var|e|x|1|true)$/i.test(sade(v));

// Excel sütun adları esnek okunur: "Ürün Adı" = "urun adi" = "ad"
const URUN_ALANLARI = [
  ["kategori", "Kategori", ["kategori", "bolum", "menu"]],
  ["ad", "Ürün Adı", ["urun adi", "urun", "ad", "isim"]],
  ["ad_en", "Ürün Adı (EN)", ["urun adi en", "ingilizce ad", "ad en", "name"]],
  ["aciklama", "Açıklama", ["aciklama", "icindekiler", "detay"]],
  ["aciklama_en", "Açıklama (EN)", ["aciklama en", "description"]],
  ["fiyat", "Fiyat", ["fiyat", "fiyati", "tutar", "price"]],
  ["alerjenler", "Alerjenler", ["alerjenler", "alerjen"]],
  ["etiket", "Etiket", ["etiket", "not"]],
  ["tukendi", "Tükendi", ["tukendi", "stokta yok"]],
];
function excelSutunEsle(basliklar) {
  const esleme = {};
  const kullanilan = new Set();
  const sadeBasliklar = basliklar.map((b) => [b, sade(b)]);
  for (const tur of ["tam", "diger"]) {
    for (const [anahtar, ad, digerleri] of URUN_ALANLARI) {
      if (esleme[anahtar]) continue;
      const adaylar = tur === "tam" ? [sade(ad)] : digerleri.map(sade);
      for (const aday of adaylar) {
        const bulunan = sadeBasliklar.find(([b, s]) => s === aday && !kullanilan.has(b));
        if (bulunan) { esleme[anahtar] = bulunan[0]; kullanilan.add(bulunan[0]); break; }
      }
    }
  }
  return esleme;
}

// "Menü kartı" düzeni: ilanlarını kendileri hazırlayan restoranların Excel'i genelde tek sütunlu tablo değil,
// yan yana birkaç kategori bloğu şeklinde olur (ör. KAHVALTILAR | GÖZLEMELER | TATLILAR), her blok bir
// "ad" sütunu + hemen sağındaki "fiyat" sütunundan oluşur. Başlık satırında kategori adı yalnızca bloğun ilk
// sütununda yazar. Fiyatı boş olan bir satır (ör. "TOSTLAR") o bloktaki sonraki satırlar için yeni bir alt
// kategori adı sayılır, ürün olarak eklenmez.
function genisFormatSatirlariCikar(diziler) {
  if (!diziler || diziler.length < 2) return [];
  const basliklar = diziler[0] || [];
  const bloklar = [];
  basliklar.forEach((deger, sutun) => {
    const metin = String(deger ?? "").trim();
    if (metin) bloklar.push({ sutun, kategori: metin });
  });
  if (bloklar.length === 0) return [];
  const sonuc = [];
  for (const blok of bloklar) {
    let guncelKategori = blok.kategori;
    for (let i = 1; i < diziler.length; i++) {
      const satir = diziler[i] || [];
      const ad = String(satir[blok.sutun] ?? "").trim();
      if (!ad) continue;
      const fiyat = sayiOku(String(satir[blok.sutun + 1] ?? "").trim());
      if (fiyat === null) { guncelKategori = ad; continue; } // fiyatsız satır: alt başlık, ürün değil
      sonuc.push({ kategori: guncelKategori, ad, fiyat });
    }
  }
  return sonuc;
}

// ---- Küçük ortak parçalar (panelin görünümüyle uyumlu) ----
const kart = { background: T.bgCard, border: `1.5px solid ${T.cardBorder}`, borderRadius: 18, boxShadow: T.shadow, padding: 20, marginBottom: 18 };
const girdi = { width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 11px", fontSize: 13.5, color: T.textPrimary, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
function Dugme({ children, onClick, tur = "hayalet", disabled, style, title }) {
  const s = tur === "ana"
    ? { background: T.amber, color: "#fff", border: `1.5px solid ${THEME === "light" ? "#0E0E14" : T.amber}` }
    : tur === "tehlike"
      ? { background: "transparent", color: T.redText, border: `1px solid ${T.red}66` }
      : { background: "transparent", color: T.textSecondary, border: `1px solid ${T.border}` };
  return <button type="button" title={title} disabled={disabled} onClick={onClick} style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 10, cursor: disabled ? "default" : "pointer", opacity: disabled ? .55 : 1, fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", ...s, ...style }}>{children}</button>;
}
function Alan({ etiket, children, genis }) {
  return <label style={{ display: "block", gridColumn: genis ? "1 / -1" : undefined }}>
    <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: T.textSecondary, marginBottom: 5 }}>{etiket}</span>
    {children}
  </label>;
}
function Baslik({ children, sag }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
    <div className="pm-baslik" style={{ fontSize: 16, color: T.textPrimary }}>{children}</div>
    {sag && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{sag}</div>}
  </div>;
}
const izgara = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 };

async function gorselYukle(dosya, klasor) {
  const uzanti = (dosya.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const yol = `${klasor}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uzanti}`;
  const { error } = await supabase.storage.from("qr-menu").upload(yol, dosya, { contentType: dosya.type, cacheControl: "31536000" });
  if (error) throw error;
  return supabase.storage.from("qr-menu").getPublicUrl(yol).data.publicUrl;
}

export default function QrMenuPage({ clients }) {
  const [menuler, setMenuler] = useState(null);
  const [acik, setAcik] = useState(null); // düzenlenen menünün id'si
  const [hata, setHata] = useState("");

  async function yukle() {
    const { data, error } = await supabase.from("qr_menuler").select("*").order("created_at", { ascending: false });
    if (error) setHata("Menüler okunamadı: " + error.message);
    setMenuler(data || []);
  }
  useEffect(() => { yukle(); }, []);

  async function yeniMenu() {
    const ad = window.prompt("Restoran / bar adı:");
    if (!ad || !ad.trim()) return;
    let slug = sluglastir(ad) || `menu-${Date.now().toString(36)}`;
    if ((menuler || []).some((m) => m.slug === slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
    const { data, error } = await supabase.from("qr_menuler").insert({ ad: ad.trim(), slug }).select().single();
    if (error) { setHata("Menü oluşturulamadı: " + error.message); return; }
    // Hazır kategoriler: düzenlenip silinebilir
    const hazir = [["Kahvaltı", "Breakfast"], ["Yemek", "Food"], ["Tatlı", "Dessert"], ["İçecek", "Beverage"]];
    await supabase.from("qr_kategoriler").insert(hazir.map(([a, e], i) => ({ menu_id: data.id, ad: a, ad_en: e, sira: i })));
    await yukle();
    setAcik(data.id);
  }

  if (acik) return <MenuDuzenle menuId={acik} clients={clients} onGeri={() => { setAcik(null); yukle(); }} />;

  return (
    <div>
      <div style={{ ...kart, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ maxWidth: 640 }}>
          <div className="pm-baslik" style={{ fontSize: 18, color: T.textPrimary, marginBottom: 6 }}>Restoran ve barlar için QR menü</div>
          <div style={{ fontSize: 13.5, color: T.textSecondary, lineHeight: 1.6 }}>
            Her menü <b>panormosmedya.com/m/…</b> adresinde yayınlanır. Masaya konan QR kod bu adrese açılır. Fiyatı ya da ürünü buradan değiştirdiğinizde menü anında güncellenir; PDF hazırlamaya gerek kalmaz.
          </div>
        </div>
        <Dugme tur="ana" onClick={yeniMenu}>+ Yeni menü</Dugme>
      </div>
      {hata && <div style={{ ...kart, color: T.redText, padding: 14 }}>{hata}</div>}
      {menuler === null ? <div style={{ color: T.textMuted }}>Yükleniyor…</div> : menuler.length === 0 ? (
        <div style={{ ...kart, textAlign: "center", color: T.textMuted }}>Henüz menü yok. "Yeni menü" ile başlayın.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {menuler.map((m) => (
            <div key={m.id} onClick={() => setAcik(m.id)} style={{ ...kart, marginBottom: 0, cursor: "pointer", borderTop: `6px solid ${m.ana_renk}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: m.zemin_renk, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", color: m.ana_renk, fontWeight: 800, fontFamily: "Georgia, serif" }}>
                  {m.logo ? <img src={m.logo} alt="" style={{ maxWidth: "90%", maxHeight: "90%", objectFit: "contain" }} /> : m.ad.slice(0, 1)}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: T.textPrimary }}>{m.ad}</div>
                  <div style={{ fontSize: 12, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>/m/{m.slug}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}>
                <span style={{ padding: "3px 9px", borderRadius: 20, fontWeight: 700, background: m.aktif ? T.greenDim : T.bgSurface, color: m.aktif ? T.greenText : T.textMuted }}>{m.aktif ? "Yayında" : "Yayında değil"}</span>
                {m.client_id && <span style={{ color: T.textMuted }}>{(clients || []).find((c) => c.id === m.client_id)?.name || ""}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Tasarım şablonu seçici: her şablonun küçük çizimi; tıklanınca seçilir
const SABLON_CIZIM = {
  zarif: (a, z) => (
    <svg viewBox="0 0 60 90" width="100%"><rect width="60" height="90" fill={z} /><circle cx="30" cy="17" r="9" fill="none" stroke={a} strokeWidth="1.2" />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M${6 + (i % 2) * 25} ${50 + Math.floor(i / 2) * 20} v-8 a11 11 0 0 1 22 0 v8 z`} fill="#fff" stroke={a} strokeWidth=".6" opacity=".9" />)}
      <rect x="18" y="31" width="24" height="2" rx="1" fill={a} opacity=".6" /></svg>
  ),
  klasik: (a, z) => (
    <svg viewBox="0 0 60 90" width="100%"><rect width="60" height="90" fill={z} /><rect width="60" height="20" fill={a} opacity=".18" /><rect x="5" y="24" width="50" height="5" rx="2.5" fill="#fff" />
      {[0, 1, 2, 3, 4, 5].map((i) => <g key={i}><rect x="5" y={36 + i * 8} width="22" height="2.4" rx="1" fill="#333" opacity=".7" /><line x1="29" y1={37.2 + i * 8} x2="47" y2={37.2 + i * 8} stroke={a} strokeDasharray="1 1.4" strokeWidth=".6" /><rect x="48" y={36 + i * 8} width="7" height="2.4" rx="1" fill={a} /></g>)}</svg>
  ),
  fotografli: (a, z) => (
    <svg viewBox="0 0 60 90" width="100%"><rect width="60" height="90" fill={z} /><rect width="60" height="22" fill={a} opacity=".55" />
      {[0, 1, 2, 3].map((i) => <g key={i}><rect x={5 + (i % 2) * 26} y={30 + Math.floor(i / 2) * 28} width="24" height="25" rx="3" fill="#fff" /><rect x={5 + (i % 2) * 26} y={30 + Math.floor(i / 2) * 28} width="24" height="14" rx="3" fill={a} opacity=".35" /><rect x={8 + (i % 2) * 26} y={47 + Math.floor(i / 2) * 28} width="12" height="2" rx="1" fill="#333" opacity=".6" /></g>)}</svg>
  ),
  gece: () => (
    <svg viewBox="0 0 60 90" width="100%"><rect width="60" height="90" fill="#14110F" /><circle cx="30" cy="17" r="9" fill="none" stroke="#D4B26A" strokeWidth="1.2" />
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M${6 + (i % 2) * 25} ${50 + Math.floor(i / 2) * 20} v-8 a11 11 0 0 1 22 0 v8 z`} fill="#211d1a" stroke="#D4B26A" strokeWidth=".6" />)}
      <rect x="18" y="31" width="24" height="2" rx="1" fill="#D4B26A" opacity=".7" /></svg>
  ),
};
function SablonSecici({ secili, sec, ana, zemin }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
      {SABLONLAR.map(([d, a]) => {
        const aktif = secili === d;
        return (
          <button key={d} type="button" onClick={() => sec(d)} title={a} style={{ padding: 6, borderRadius: 12, cursor: "pointer", background: T.bgInput, border: `2px solid ${aktif ? T.amber : T.border}`, boxShadow: aktif ? `0 0 0 3px ${T.amberDim || "rgba(242,81,36,.15)"}` : "none", fontFamily: "inherit", textAlign: "center" }}>
            <div style={{ borderRadius: 8, overflow: "hidden", lineHeight: 0 }}>{SABLON_CIZIM[d](ana || "#5C1A1B", zemin || "#F3F1EC")}</div>
            <div style={{ fontSize: 11.5, fontWeight: 800, color: aktif ? T.amberText || T.textPrimary : T.textPrimary, marginTop: 6 }}>{a.split(":")[0]}</div>
          </button>
        );
      })}
    </div>
  );
}

export function MenuDuzenle({ menuId, clients, onGeri, musteriModu }) {
  const [menu, setMenu] = useState(null);
  const [kategoriler, setKategoriler] = useState([]);
  const [urunler, setUrunler] = useState([]);
  const [kategori, setKategori] = useState("");
  const [bilgi, setBilgi] = useState("");
  const [hata, setHata] = useState("");
  const [bekle, setBekle] = useState(false);
  const [qr, setQr] = useState("");
  const [urunForm, setUrunForm] = useState(null);
  const [katForm, setKatForm] = useState(null);
  const [musteriEposta, setMusteriEposta] = useState("");
  const [musteriBekle, setMusteriBekle] = useState(false);
  const [masaSayisi, setMasaSayisi] = useState("");
  const [baskiBekle, setBaskiBekle] = useState("");
  const [onizlemeAnahtari, setOnizlemeAnahtari] = useState(0); // kaydedince canlı önizleme yenilensin

  async function yukle() {
    const [{ data: m }, { data: k }] = await Promise.all([
      supabase.from("qr_menuler").select("*").eq("id", menuId).single(),
      supabase.from("qr_kategoriler").select("*").eq("menu_id", menuId).order("sira").order("created_at"),
    ]);
    const ids = (k || []).map((x) => x.id);
    const { data: u } = ids.length ? await supabase.from("qr_urunler").select("*").in("kategori_id", ids).order("sira").order("created_at") : { data: [] };
    setMenu(m); setKategoriler(k || []); setUrunler(u || []);
    setKategori((s) => (s && (k || []).some((x) => x.id === s) ? s : (k || [])[0]?.id || ""));
  }
  useEffect(() => { yukle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [menuId]);

  const adres = menu ? `${SITE}/m/${menu.slug}` : "";
  // QR menünün ana renginde, ortasında logosuyla
  useEffect(() => {
    if (!adres) return;
    let iptal = false;
    logoluQr(adres, { renk: menu?.ana_renk || "#111111", logo: menu?.logo, ad: menu?.ad }).then((t) => { if (!iptal) setQr(tuvalPng(t)); }).catch(() => setQr(""));
    return () => { iptal = true; };
  }, [adres, menu?.ana_renk, menu?.logo, menu?.ad]);

  function pngIndir(veri, ad) {
    const a = document.createElement("a");
    a.href = veri; a.download = ad; document.body.appendChild(a); a.click(); a.remove();
  }
  async function baskiIndir(bicim) {
    setBaskiBekle(bicim);
    try { pngIndir(tuvalPng(await baskiCiz(menu, adres, { bicim })), `${bicim === "afis" ? "afis" : "masa-karti"}-${menu.slug}.png`); }
    catch (e) { setHata("Hazırlanamadı: " + (e?.message || e)); }
    setBaskiBekle("");
  }
  // Numaralı masa kartları: her kartın QR'ı ?masa=N ile açılır; menüden gelen siparişte masa numarası yazar
  async function masaKartlariYazdir() {
    const n = Math.min(60, Math.max(1, parseInt(masaSayisi, 10) || 0));
    if (!n) { setHata("Kaç masa olduğunu yazın."); return; }
    setBaskiBekle("masalar");
    try {
      const resimler = [];
      for (let i = 1; i <= n; i++) resimler.push(tuvalPng(await baskiCiz(menu, `${adres}?masa=${i}`, { bicim: "kart", masa: i })));
      if (!kartlariYazdir(resimler, "kart")) setHata("Yazdırma penceresi açılamadı; tarayıcının açılır pencere iznini verin.");
    } catch (e) { setHata("Hazırlanamadı: " + (e?.message || e)); }
    setBaskiBekle("");
  }

  const alan = (ad) => ({ value: menu?.[ad] ?? "", onChange: (e) => setMenu((m) => ({ ...m, [ad]: e.target.value })) });
  const bildir = (t) => { setBilgi(t); setTimeout(() => setBilgi(""), 2500); };

  async function ayarlariKaydet() {
    setHata("");
    const slug = sluglastir(menu.slug);
    if (!menu.ad?.trim()) { setHata("Menü adı boş olamaz."); return; }
    if (slug.length < 2) { setHata("Bağlantı adı en az 2 harf olmalı."); return; }
    setBekle(true);
    const { id, created_at, ...degerler } = menu;
    const { error } = await supabase.from("qr_menuler").update({ ...degerler, slug, client_id: menu.client_id || null }).eq("id", id);
    setBekle(false);
    if (error) { setHata(error.code === "23505" ? "Bu bağlantı adı başka bir menüde kullanılıyor." : "Kaydedilemedi: " + error.message); return; }
    setMenu((m) => ({ ...m, slug }));
    setOnizlemeAnahtari((x) => x + 1);
    bildir("Kaydedildi. Menü güncel.");
  }

  async function kapakSec(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { const url = await gorselYukle(f, `kapak/${menuId}`); setMenu((m) => ({ ...m, kapak: url })); bildir("Kapak fotoğrafı yüklendi; kaydetmeyi unutmayın."); }
    catch (err) { setHata("Kapak yüklenemedi: " + (err?.message || err)); }
  }
  async function kategoriGorselSec(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { const url = await gorselYukle(f, `kategori/${menuId}`); setKatForm((k) => ({ ...k, gorsel: url })); }
    catch (err) { setHata("Görsel yüklenemedi: " + (err?.message || err)); }
  }
  async function logoSec(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { const url = await gorselYukle(f, `logo/${menuId}`); setMenu((m) => ({ ...m, logo: url })); bildir("Logo yüklendi; kaydetmeyi unutmayın."); }
    catch (err) { setHata("Logo yüklenemedi: " + (err?.message || err)); }
  }

  async function menuSil() {
    if (!window.confirm(`"${menu.ad}" menüsü, bütün kategori ve ürünleriyle birlikte kalıcı olarak silinecek. QR kodu da çalışmaz hâle gelir. Emin misiniz?`)) return;
    const { error } = await supabase.from("qr_menuler").delete().eq("id", menuId);
    if (error) { setHata("Silinemedi: " + error.message); return; }
    onGeri();
  }

  // ---- Müşteri girişi (restoran/bar sahibinin kendi menüsünü düzenlemesi) ----
  async function musteriDavetGonder() {
    if (!/^\S+@\S+\.\S+$/.test(musteriEposta)) { setHata("Geçerli bir e-posta girin."); return; }
    setMusteriBekle(true); setHata("");
    try {
      const { data: oturum } = await supabase.auth.getSession();
      const r = await fetch("/.netlify/functions/qr-menu-musteri-davet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${oturum?.session?.access_token ?? ""}` },
        body: JSON.stringify({ menuId, eposta: musteriEposta.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setHata(j.error || "Giriş oluşturulamadı."); setMusteriBekle(false); return; }
      setMenu((m) => ({ ...m, sahip_user_id: "beklemede", sahip_eposta: musteriEposta.trim() }));
      await yukle();
      setMusteriEposta("");
      bildir(j.yeniHesap ? "Davet e-postası gönderildi." : "Bu e-posta zaten kayıtlıydı, menüye bağlandı.");
    } catch (err) { setHata("Giriş oluşturulamadı: " + (err?.message || err)); }
    setMusteriBekle(false);
  }
  async function musteriSifreGonder() {
    const { error } = await supabase.auth.resetPasswordForEmail(menu.sahip_eposta, { redirectTo: `${SITE}/menu-giris` });
    if (error) { setHata("Gönderilemedi: " + error.message); return; }
    bildir("Şifre belirleme bağlantısı yeniden gönderildi.");
  }
  async function musteriGirisiKaldir() {
    if (!window.confirm("Bu müşterinin menüyü kendi düzenlemesi kapatılsın mı? Giriş hesabı silinmez, sadece bu menüyle bağlantısı kesilir.")) return;
    const { error } = await supabase.from("qr_menuler").update({ sahip_user_id: null, sahip_eposta: null }).eq("id", menuId);
    if (error) { setHata("Kaldırılamadı: " + error.message); return; }
    await yukle();
  }

  // ---- Kategoriler ----
  async function kategoriKaydet() {
    const f = katForm;
    if (!f.ad?.trim()) return;
    const kayit = { ad: f.ad.trim(), ad_en: f.ad_en || "", aciklama: f.aciklama || "", aciklama_en: f.aciklama_en || "", fiyat_etiketleri: f.fiyat_etiketleri || "", bolum: (f.bolum || "").trim(), bolum_en: (f.bolum_en || "").trim(), aktif: f.aktif !== false };
    // Görsel sütunu olan kurulumlarda kategori görseli de kaydedilir
    if ("gorsel" in f || kategoriler.some((k) => "gorsel" in k)) kayit.gorsel = f.gorsel || "";
    const { error } = f.id
      ? await supabase.from("qr_kategoriler").update(kayit).eq("id", f.id)
      : await supabase.from("qr_kategoriler").insert({ ...kayit, menu_id: menuId, sira: kategoriler.length });
    if (error) { setHata("Kategori kaydedilemedi: " + error.message); return; }
    setKatForm(null); await yukle(); bildir("Kategori kaydedildi.");
  }
  async function kategoriSil(k) {
    const sayi = urunler.filter((u) => u.kategori_id === k.id).length;
    if (!window.confirm(`"${k.ad}" kategorisi${sayi ? ` ve içindeki ${sayi} ürün` : ""} kalıcı olarak silinecek. Emin misiniz?`)) return;
    const { error } = await supabase.from("qr_kategoriler").delete().eq("id", k.id);
    if (error) { setHata("Silinemedi: " + error.message); return; }
    await yukle();
  }
  async function sirala(tablo, liste, i, yon) {
    const j = i + yon;
    if (j < 0 || j >= liste.length) return;
    const yeni = [...liste]; [yeni[i], yeni[j]] = [yeni[j], yeni[i]];
    await Promise.all(yeni.map((x, s) => (x.sira === s ? null : supabase.from(tablo).update({ sira: s }).eq("id", x.id))).filter(Boolean));
    await yukle();
  }

  // ---- Ürünler ----
  const katUrunleri = useMemo(() => urunler.filter((u) => u.kategori_id === kategori), [urunler, kategori]);
  const seciliKat = kategoriler.find((k) => k.id === kategori);
  // Kategorideki ölçüler (Tek, Duble, 20 cl…): her biri için ayrı fiyat girilir
  const olculer = String(seciliKat?.fiyat_etiketleri || "").split(/[,|/]/).map((x) => x.trim()).filter(Boolean);
  const fiyatAl = (u, i) => { const f = (u.fiyatlar || [])[i]; return f !== undefined && f !== null ? f : i === 0 ? u.fiyat : i === 1 ? u.fiyat2 : null; };
  async function urunKaydet() {
    const f = urunForm;
    if (!f.ad?.trim()) { setHata("Ürün adı boş olamaz."); return; }
    const kayit = {
      ad: f.ad.trim(), ad_en: f.ad_en || "", aciklama: f.aciklama || "", aciklama_en: f.aciklama_en || "",
      ...(() => {
        // Ölçülü kategoride fiyatlar liste olarak; ilk ikisi eski alanlara da yazılır
        if (!olculer.length) return { fiyat: sayiOku(f.fiyat), fiyat2: null, fiyatlar: [] };
        const l = olculer.map((_, i) => sayiOku((f.olcuFiyat || [])[i]));
        return { fiyat: l[0] ?? null, fiyat2: l[1] ?? null, fiyatlar: l };
      })(),
      alerjenler: f.alerjenler || [], etiket: f.etiket || "",
      gorsel: f.gorsel || "", tukendi: !!f.tukendi, aktif: f.aktif !== false,
    };
    const { error } = f.id
      ? await supabase.from("qr_urunler").update(kayit).eq("id", f.id)
      : await supabase.from("qr_urunler").insert({ ...kayit, kategori_id: kategori, sira: katUrunleri.length });
    if (error) { setHata("Ürün kaydedilemedi: " + error.message); return; }
    setUrunForm(null); await yukle(); bildir("Ürün kaydedildi.");
  }
  async function urunDegistir(u, alanlar) {
    const { error } = await supabase.from("qr_urunler").update(alanlar).eq("id", u.id);
    if (error) { setHata("Kaydedilemedi: " + error.message); return; }
    setUrunler((l) => l.map((x) => (x.id === u.id ? { ...x, ...alanlar } : x)));
  }
  async function urunSil(u) {
    if (!window.confirm(`"${u.ad}" menüden kalıcı olarak silinecek. Geçici olarak gizlemek için "Gizle" de kullanabilirsiniz. Silinsin mi?`)) return;
    const { error } = await supabase.from("qr_urunler").delete().eq("id", u.id);
    if (error) { setHata("Silinemedi: " + error.message); return; }
    await yukle();
  }
  async function urunGorselSec(e) {
    const f = e.target.files?.[0]; e.target.value = "";
    if (!f) return;
    try { const url = await gorselYukle(f, `urun/${menuId}`); setUrunForm((x) => ({ ...x, gorsel: url })); }
    catch (err) { setHata("Fotoğraf yüklenemedi: " + (err?.message || err)); }
  }

  // ---- Excel ile toplu ürün yükleme ----
  function excelSablonIndir() {
    const basliklar = URUN_ALANLARI.map(([, ad]) => ad);
    sablonIndir(basliklar, [
      ["Kahvaltı", "Serpme Kahvaltı", "Village Breakfast", "Kaşar, zeytin, bal, kaymak…", "Cheese, olives, honey, clotted cream…", "450", "", "", ""],
      ["Şaraplar", "Kavaklıdere Çankaya", "", "", "", "650", "VG", "Şefin önerisi", ""],
    ], `qr-menu-sablon-${menu?.slug || "urunler"}`);
  }
  async function excelSec(e) {
    const dosya = e.target.files?.[0]; e.target.value = "";
    if (!dosya) return;
    setHata(""); setBekle(true);
    try {
      // 1) Önce bizim şablonumuzdaki gibi düz tablo mu diye bakılır ("Kategori", "Ürün Adı", "Fiyat" sütunları)
      const satirlar = await excelOku(dosya);
      const esleme = satirlar.length ? excelSutunEsle(Object.keys(satirlar[0])) : {};
      let normalListe;
      if (esleme.ad && satirlar.some((s) => String(s[esleme.ad] ?? "").trim())) {
        normalListe = satirlar.map((satir) => {
          const al = (anahtar) => String(satir[esleme[anahtar]] ?? "").trim();
          return {
            kategori: al("kategori"), ad: al("ad"), ad_en: al("ad_en"), aciklama: al("aciklama"), aciklama_en: al("aciklama_en"),
            fiyat: sayiOku(al("fiyat")), etiket: al("etiket"), tukendi: evetMi(al("tukendi")),
            alerjenler: al("alerjenler").split(/[,/،]/).map((x) => x.trim().toLocaleUpperCase("en")).filter((x) => ALERJENLER.some(([kod]) => kod === x)),
          };
        });
      } else {
        // 2) Düz tablo değilse: restoranların elle hazırladığı "menü kartı" düzeni denenir — yan yana birden
        // fazla kategori bloğu (her biri ad+fiyat sütunu), başlık satırında kategori adları. Fiyatsız bir
        // hücre o bloktaki alt başlık sayılır (ör. "TOSTLAR"), o noktadan sonraki ürünler o alt başlığa yazılır.
        const diziler = await excelOkuDizi(dosya);
        normalListe = genisFormatSatirlariCikar(diziler);
        if (normalListe.length === 0) { setHata('Excel okunamadı. Sütunlarda "Ürün Adı" ve "Fiyat" olmalı; menü kartı düzeniyse her kategori bir ad + fiyat sütunu olarak yan yana durmalı.'); setBekle(false); return; }
      }

      // Mevcut kategori/ürün listesinin çalışma kopyası: aynı dosya içinde tekrar eden kategoriler ikinci kez oluşturulmaz
      let katCalisma = kategoriler.map((k) => ({ ...k }));
      let urunCalisma = urunler.map((u) => ({ ...u }));
      let yeniKategori = 0, eklenen = 0, guncellenen = 0, atlanan = 0;

      for (const satir of normalListe) {
        const ad = satir.ad;
        if (!ad) { atlanan++; continue; }
        const katAdi = satir.kategori || seciliKat?.ad || katCalisma[0]?.ad || "";
        if (!katAdi) { atlanan++; continue; }

        let kat = katCalisma.find((k) => sade(k.ad) === sade(katAdi) || (k.ad_en && sade(k.ad_en) === sade(katAdi)));
        if (!kat) {
          const { data: yk, error: ek } = await supabase.from("qr_kategoriler").insert({ menu_id: menuId, ad: katAdi, sira: katCalisma.length, aktif: true }).select().single();
          if (ek) { atlanan++; continue; }
          kat = yk; katCalisma.push(kat); yeniKategori++;
        }

        const fiyat = satir.fiyat;
        const kayit = {
          ad, ad_en: satir.ad_en || "", aciklama: satir.aciklama || "", aciklama_en: satir.aciklama_en || "",
          fiyat, fiyat2: null, fiyatlar: fiyat !== null ? [fiyat] : [],
          alerjenler: satir.alerjenler || [], etiket: satir.etiket || "", tukendi: !!satir.tukendi, aktif: true,
        };

        const mevcutUrun = urunCalisma.find((u) => u.kategori_id === kat.id && sade(u.ad) === sade(ad));
        if (mevcutUrun) {
          const { error: eu } = await supabase.from("qr_urunler").update(kayit).eq("id", mevcutUrun.id);
          if (eu) { atlanan++; continue; }
          Object.assign(mevcutUrun, kayit); guncellenen++;
        } else {
          const sirasi = urunCalisma.filter((u) => u.kategori_id === kat.id).length;
          const { data: yu, error: eu } = await supabase.from("qr_urunler").insert({ ...kayit, kategori_id: kat.id, sira: sirasi }).select().single();
          if (eu) { atlanan++; continue; }
          urunCalisma.push(yu); eklenen++;
        }
      }

      await yukle();
      bildir(`Excel yüklendi: ${eklenen} yeni ürün, ${guncellenen} güncellendi${yeniKategori ? `, ${yeniKategori} yeni kategori` : ""}${atlanan ? `, ${atlanan} satır atlandı` : ""}.`);
    } catch (err) {
      setHata("Excel okunamadı: " + (err?.message || err));
    }
    setBekle(false);
  }

  if (!menu) return <div style={{ color: T.textMuted }}>Yükleniyor…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <Dugme onClick={onGeri}>{musteriModu ? "Çıkış yap" : "‹ Tüm menüler"}</Dugme>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a href={adres} target="_blank" rel="noopener" style={{ textDecoration: "none" }}><Dugme>Menüyü aç ↗</Dugme></a>
          <Dugme onClick={() => navigator.clipboard?.writeText(adres).then(() => bildir("Bağlantı kopyalandı."))}>Bağlantıyı kopyala</Dugme>
        </div>
      </div>
      {hata && <div style={{ ...kart, padding: 14, color: T.redText }} onClick={() => setHata("")}>{hata}</div>}
      {hata && <div onClick={() => setHata("")} style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 20, zIndex: 60, background: T.red, color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 12, boxShadow: T.shadow, cursor: "pointer", maxWidth: "90vw" }}>⚠️ {hata}</div>}
      {bilgi && <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 50, background: T.green, color: "#fff", fontWeight: 700, fontSize: 13, padding: "10px 16px", borderRadius: 12, boxShadow: T.shadow }}>{bilgi}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 18, alignItems: "start" }} className="qmp-ust">
        {/* Ayarlar */}
        <div style={kart}>
          <Baslik sag={<Dugme tur="ana" onClick={ayarlariKaydet} disabled={bekle}>{bekle ? "Kaydediliyor…" : "Kaydet"}</Dugme>}>Menü ayarları</Baslik>
          <div style={izgara}>
            <Alan etiket="Restoran / bar adı"><input style={girdi} {...alan("ad")} /></Alan>
            <Alan etiket="Adın altındaki yazı"><input style={girdi} placeholder="ör. 1772, Bandırma" {...alan("alt_yazi")} /></Alan>
            <Alan etiket="Bağlantı (panormosmedya.com/m/…)"><input style={girdi} {...alan("slug")} onBlur={() => setMenu((m) => ({ ...m, slug: sluglastir(m.slug) }))} /></Alan>
            {!musteriModu && (
              <Alan etiket="Müşteri (isteğe bağlı)">
                <select style={girdi} value={menu.client_id || ""} onChange={(e) => setMenu((m) => ({ ...m, client_id: e.target.value }))}>
                  <option value="">Seçilmedi</option>
                  {(clients || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Alan>
            )}
            <Alan etiket="Logo">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {menu.logo && <img src={menu.logo} alt="" style={{ height: 36, maxWidth: 90, objectFit: "contain", background: menu.zemin_renk, borderRadius: 6, padding: 3 }} />}
                <label style={{ cursor: "pointer" }}><span style={{ ...girdi, display: "inline-block", width: "auto", fontWeight: 700 }}>{menu.logo ? "Değiştir" : "Logo yükle"}</span><input type="file" accept="image/*" onChange={logoSec} style={{ display: "none" }} /></label>
                {menu.logo && <Dugme onClick={() => setMenu((m) => ({ ...m, logo: "" }))}>Kaldır</Dugme>}
              </div>
            </Alan>
            {"kapak" in menu && (
              <Alan etiket="Kapak fotoğrafı (menünün en üstü)">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {menu.kapak && <img src={menu.kapak} alt="" style={{ height: 36, width: 64, objectFit: "cover", borderRadius: 6 }} />}
                  <label style={{ cursor: "pointer" }}><span style={{ ...girdi, display: "inline-block", width: "auto", fontWeight: 700 }}>{menu.kapak ? "Değiştir" : "Fotoğraf yükle"}</span><input type="file" accept="image/*" onChange={kapakSec} style={{ display: "none" }} /></label>
                  {menu.kapak && <Dugme onClick={() => setMenu((m) => ({ ...m, kapak: "" }))}>Kaldır</Dugme>}
                </div>
              </Alan>
            )}
            {"duyuru" in menu && <Alan etiket="Duyuru şeridi (ör. Happy Hour 18.00–20.00)"><input style={girdi} placeholder="boş bırakılırsa görünmez" {...alan("duyuru")} /></Alan>}
            {"duyuru_en" in menu && menu.iki_dil && <Alan etiket="Duyuru (İngilizce)"><input style={girdi} {...alan("duyuru_en")} /></Alan>}
            {/* Şablon sütunu veritabanına eklenmeden önce açılmış menülerde seçici görünmez (kaydetme hata vermesin) */}
            {"sablon" in menu && (
              <Alan etiket="Tasarım şablonu" genis>
                <SablonSecici secili={menu.sablon || "zarif"} ana={menu.ana_renk} zemin={menu.zemin_renk} sec={(d) => setMenu((m) => ({ ...m, sablon: d, ...(d === "gece" && !/^#[0-3]/.test(m.zemin_renk || "") ? { ana_renk: "#D4B26A", zemin_renk: "#14110F" } : {}) }))} />
              </Alan>
            )}
            <Alan etiket="Yazı tipi">
              <select style={girdi} value={menu.yazi_tipi} onChange={(e) => setMenu((m) => ({ ...m, yazi_tipi: e.target.value }))}>
                {YAZI_TIPLERI.map(([d, a]) => <option key={d} value={d}>{a}</option>)}
              </select>
            </Alan>
            <Alan etiket="Renkler" genis>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {TEMALAR.map((t) => (
                  <button key={t.ad} type="button" title={t.ad} onClick={() => setMenu((m) => ({ ...m, ana_renk: t.ana, zemin_renk: t.zemin }))}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 5px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: T.textSecondary, background: "transparent", border: `1.5px solid ${menu.ana_renk === t.ana && menu.zemin_renk === t.zemin ? T.amber : T.border}` }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: `linear-gradient(135deg, ${t.zemin} 50%, ${t.ana} 50%)`, border: "1px solid rgba(0,0,0,.15)" }} />{t.ad}
                  </button>
                ))}
                <span style={{ fontSize: 12, color: T.textMuted, marginLeft: 6 }}>Özel:</span>
                <input type="color" value={menu.ana_renk} onChange={(e) => setMenu((m) => ({ ...m, ana_renk: e.target.value }))} title="Ana renk" style={{ width: 34, height: 30, border: "none", background: "none", cursor: "pointer" }} />
                <input type="color" value={menu.zemin_renk} onChange={(e) => setMenu((m) => ({ ...m, zemin_renk: e.target.value }))} title="Zemin rengi" style={{ width: 34, height: 30, border: "none", background: "none", cursor: "pointer" }} />
              </div>
            </Alan>
            <Alan etiket="WhatsApp"><input style={girdi} placeholder="0532 000 00 00" {...alan("whatsapp")} /></Alan>
            <Alan etiket="Rezervasyon (telefon ya da link)"><input style={girdi} placeholder="0266 … ya da https://…" {...alan("rezervasyon")} /></Alan>
            <Alan etiket="Instagram"><input style={girdi} placeholder="@hesap" {...alan("instagram")} /></Alan>
            <Alan etiket="Telefon"><input style={girdi} {...alan("telefon")} /></Alan>
            <Alan etiket="Adres" genis><input style={girdi} {...alan("adres")} /></Alan>
            <Alan etiket="Alerjen açıklaması (Türkçe)" genis><input style={girdi} {...alan("alerjen_notu")} /></Alan>
            {menu.iki_dil && <Alan etiket="Alerjen açıklaması (İngilizce)" genis><input style={girdi} {...alan("alerjen_notu_en")} /></Alan>}
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, fontSize: 13.5, color: T.textPrimary }}>
            <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={menu.iki_dil} onChange={(e) => setMenu((m) => ({ ...m, iki_dil: e.target.checked }))} /> Türkçe + İngilizce</label>
            <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }}><input type="checkbox" checked={menu.aktif} onChange={(e) => setMenu((m) => ({ ...m, aktif: e.target.checked }))} /> Yayında</label>
            {"whatsapp_siparis" in menu && (
              <label style={{ display: "flex", gap: 7, alignItems: "center", cursor: "pointer" }} title="Misafir ürünleri sepete ekler; sipariş, yukarıdaki WhatsApp numarasına hazır mesaj olarak gider">
                <input type="checkbox" checked={!!menu.whatsapp_siparis} onChange={(e) => setMenu((m) => ({ ...m, whatsapp_siparis: e.target.checked }))} /> WhatsApp'tan sipariş al (sepet)
              </label>
            )}
          </div>
        </div>

        {/* QR kod, baskı malzemeleri ve canlı önizleme (sağ sütun) */}
        <div>
        <div style={{ ...kart, textAlign: "center" }}>
          <Baslik>QR kod</Baslik>
          {qr ? <img src={qr} alt="Menü QR kodu" style={{ width: "100%", maxWidth: 220, borderRadius: 10, border: `1px solid ${T.border}` }} /> : <div style={{ color: T.textMuted, fontSize: 13 }}>Hazırlanıyor…</div>}
          <div style={{ fontSize: 12, color: T.textMuted, margin: "8px 0 12px", wordBreak: "break-all" }}>{adres}</div>
          {qr && <a href={qr} download={`qr-menu-${menu.slug}.png`} style={{ textDecoration: "none" }}><Dugme tur="ana" style={{ width: "100%", justifyContent: "center" }}>QR kodu indir (PNG)</Dugme></a>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <Dugme onClick={() => baskiIndir("kart")} disabled={!!baskiBekle} style={{ justifyContent: "center" }}>{baskiBekle === "kart" ? "Hazırlanıyor…" : "Masa kartı (A6)"}</Dugme>
            <Dugme onClick={() => baskiIndir("afis")} disabled={!!baskiBekle} style={{ justifyContent: "center" }}>{baskiBekle === "afis" ? "Hazırlanıyor…" : "Afiş (A4)"}</Dugme>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input style={{ ...girdi, width: 90 }} type="number" min="1" max="60" placeholder="Masa" value={masaSayisi} onChange={(e) => setMasaSayisi(e.target.value)} title="Kaç masa var? Her masaya kendi numaralı QR kartı" />
            <Dugme onClick={masaKartlariYazdir} disabled={!!baskiBekle} style={{ flex: 1, justifyContent: "center" }}>{baskiBekle === "masalar" ? "Hazırlanıyor…" : "Numaralı kartları yazdır"}</Dugme>
          </div>
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 10, lineHeight: 1.5 }}>Numaralı kartlarda QR kod masa numarasını bilir; WhatsApp siparişinde "Masa 4" kendiliğinden yazar. Bağlantı adını değiştirirseniz eski QR kodlar çalışmaz.</div>
        </div>
        <div style={{ ...kart, textAlign: "center" }}>
          <Baslik sag={<a href={adres} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.textMuted }}>Yeni sekmede aç ↗</a>}>Canlı önizleme</Baslik>
          <div style={{ width: 228, height: 456, margin: "0 auto", borderRadius: 24, border: `5px solid ${T.textPrimary}`, overflow: "hidden", position: "relative", background: "#fff" }}>
            <iframe key={onizlemeAnahtari} src={`/m/${menu.slug}`} title="Menü önizlemesi" style={{ position: "absolute", top: 0, left: 0, width: 390, height: 780, border: 0, transform: "scale(.5590)", transformOrigin: "0 0" }} />
          </div>
          <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 8 }}>Kaydettiğiniz değişiklikler burada görünür.</div>
        </div>
        </div>
      </div>

      {!musteriModu && (
        <div style={kart}>
          <Baslik>Müşteri girişi</Baslik>
          {menu.sahip_user_id ? (
            <div style={{ fontSize: 13.5, color: T.textPrimary }}>
              <div style={{ marginBottom: 10 }}>
                Açık — <b>{menu.sahip_eposta}</b> kendi menüsünü <code>panormosmedya.com/menu-giris</code> adresinden düzenleyebiliyor.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Dugme onClick={musteriSifreGonder}>Şifre bağlantısını yeniden gönder</Dugme>
                <Dugme tur="tehlike" onClick={musteriGirisiKaldir}>Girişi kaldır</Dugme>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 10 }}>
                Restoran/bar sahibi kendi ürün ve fiyatlarını düzenlesin isterseniz e-postasını girin; "şifreni belirle" bağlantısı gönderilir.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input style={{ ...girdi, maxWidth: 280 }} type="email" placeholder="ornek@eposta.com" value={musteriEposta} onChange={(e) => setMusteriEposta(e.target.value)} />
                <Dugme tur="ana" onClick={musteriDavetGonder} disabled={musteriBekle}>{musteriBekle ? "Gönderiliyor…" : "Giriş Oluştur"}</Dugme>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Kategoriler */}
      <div style={kart}>
        <Baslik sag={<Dugme tur="ana" onClick={() => setKatForm({ ad: "", ad_en: "", aktif: true, bolum: kategoriler[kategoriler.length - 1]?.bolum || "", bolum_en: kategoriler[kategoriler.length - 1]?.bolum_en || "" })}>+ Kategori</Dugme>}>Kategoriler</Baslik>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {kategoriler.map((k, i) => (
            <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 4px 4px 12px", borderRadius: 12, border: `1.5px solid ${k.id === kategori ? T.amber : T.border}`, background: k.id === kategori ? T.amberDim : "transparent", opacity: k.aktif ? 1 : .55 }}>
              <button type="button" onClick={() => setKategori(k.id)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 800, fontSize: 13, color: T.textPrimary, fontFamily: "inherit", padding: "4px 2px" }}>
                {k.ad} <span style={{ color: T.textMuted, fontWeight: 600 }}>({urunler.filter((u) => u.kategori_id === k.id).length})</span>
              </button>
              <button type="button" title="Sola al" onClick={() => sirala("qr_kategoriler", kategoriler, i, -1)} style={kucukDugme}>‹</button>
              <button type="button" title="Sağa al" onClick={() => sirala("qr_kategoriler", kategoriler, i, 1)} style={kucukDugme}>›</button>
              <button type="button" title="Düzenle" onClick={() => setKatForm({ ...k })} style={kucukDugme}>✎</button>
            </div>
          ))}
          {kategoriler.length === 0 && <div style={{ color: T.textMuted, fontSize: 13 }}>Kategori yok.</div>}
        </div>
        {katForm && (
          <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: T.bgSurface }}>
            <div style={izgara}>
              <Alan etiket="Kategori adı"><input style={girdi} autoFocus value={katForm.ad} onChange={(e) => setKatForm({ ...katForm, ad: e.target.value })} /></Alan>
              {menu.iki_dil && <Alan etiket="İngilizcesi"><input style={girdi} value={katForm.ad_en || ""} onChange={(e) => setKatForm({ ...katForm, ad_en: e.target.value })} /></Alan>}
              <Alan etiket="Kısa açıklama (isteğe bağlı)"><input style={girdi} value={katForm.aciklama || ""} onChange={(e) => setKatForm({ ...katForm, aciklama: e.target.value })} /></Alan>
              <Alan etiket="Bölüm (ör. Şarap Menüsü; aynı bölümdekiler birlikte görünür)"><input style={girdi} placeholder="boş bırakılabilir" value={katForm.bolum || ""} onChange={(e) => setKatForm({ ...katForm, bolum: e.target.value })} /></Alan>
              {menu.iki_dil && <Alan etiket="Bölüm (İngilizce)"><input style={girdi} placeholder="ör. Wine Menu" value={katForm.bolum_en || ""} onChange={(e) => setKatForm({ ...katForm, bolum_en: e.target.value })} /></Alan>}
              {("gorsel" in katForm || kategoriler.some((k) => "gorsel" in k)) && (
                <Alan etiket="Kategori görseli (isteğe bağlı)">
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {katForm.gorsel && <img src={katForm.gorsel} alt="" style={{ height: 36, width: 64, objectFit: "cover", borderRadius: 6 }} />}
                    <label style={{ cursor: "pointer" }}><span style={{ ...girdi, display: "inline-block", width: "auto", fontWeight: 700 }}>{katForm.gorsel ? "Değiştir" : "Görsel yükle"}</span><input type="file" accept="image/*" onChange={kategoriGorselSec} style={{ display: "none" }} /></label>
                    {katForm.gorsel && <Dugme onClick={() => setKatForm((k) => ({ ...k, gorsel: "" }))}>Kaldır</Dugme>}
                  </div>
                </Alan>
              )}
              <Alan etiket="Ölçüler (virgülle: Tek, Duble, 35 cl, 70 cl)"><input style={girdi} placeholder="boş bırakılırsa tek fiyat" value={katForm.fiyat_etiketleri || ""} onChange={(e) => setKatForm({ ...katForm, fiyat_etiketleri: e.target.value })} /></Alan>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
              <Dugme tur="ana" onClick={kategoriKaydet}>Kaydet</Dugme>
              <Dugme onClick={() => setKatForm(null)}>Vazgeç</Dugme>
              {katForm.id && <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: T.textPrimary, marginLeft: 6 }}><input type="checkbox" checked={katForm.aktif !== false} onChange={(e) => setKatForm({ ...katForm, aktif: e.target.checked })} /> Menüde görünsün</label>}
              {katForm.id && <Dugme tur="tehlike" style={{ marginLeft: "auto" }} onClick={() => { const k = katForm; setKatForm(null); kategoriSil(k); }}>Kategoriyi sil</Dugme>}
            </div>
          </div>
        )}
      </div>

      {/* Ürünler */}
      {seciliKat && (
        <div style={kart}>
          <Baslik sag={<>
            <Dugme onClick={excelSablonIndir}>Excel şablonu indir</Dugme>
            <label style={{ cursor: "pointer" }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: "7px 13px", borderRadius: 10, color: T.textSecondary, border: `1px solid ${T.border}`, display: "inline-flex", alignItems: "center" }}>{bekle ? "Yükleniyor…" : "Excel ile yükle"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={excelSec} style={{ display: "none" }} disabled={bekle} />
            </label>
            <Dugme tur="ana" onClick={() => setUrunForm({ ad: "", alerjenler: [], aktif: true })}>+ Ürün</Dugme>
          </>}>{seciliKat.ad} — ürünler</Baslik>
          <div style={{ fontSize: 11.5, color: T.textMuted, margin: "-6px 0 12px" }}>Excel'deki "Kategori" sütunu bu menüdeki bir kategoriyle eşleşirse oraya eklenir, eşleşmezse yeni kategori açılır. Aynı kategoride aynı isimli ürün varsa üzerine yazılır (fiyat günceller), tekrar oluşturmaz.</div>
          {katUrunleri.length === 0 && <div style={{ color: T.textMuted, fontSize: 13 }}>Bu kategoride ürün yok. "+ Ürün" ile ekleyin.</div>}
          {katUrunleri.map((u, i) => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? `1px solid ${T.border}` : "none", opacity: u.aktif ? 1 : .5 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <button type="button" title="Yukarı" onClick={() => sirala("qr_urunler", katUrunleri, i, -1)} style={kucukDugme}>▲</button>
                <button type="button" title="Aşağı" onClick={() => sirala("qr_urunler", katUrunleri, i, 1)} style={kucukDugme}>▼</button>
              </div>
              {u.gorsel && <img src={u.gorsel} alt="" style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 8 }} />}
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setUrunForm({ ...u, fiyat: u.fiyat ?? "", olcuFiyat: olculer.map((_, i) => fiyatAl(u, i) ?? "") })}>
                <div style={{ fontWeight: 800, fontSize: 14, color: T.textPrimary }}>
                  {u.ad} {(u.alerjenler || []).length > 0 && <span style={{ fontSize: 11, color: T.amberText, fontWeight: 700 }}>({u.alerjenler.join(", ")})</span>}
                  {u.etiket && <span style={{ fontSize: 10.5, marginLeft: 6, padding: "1px 7px", borderRadius: 10, background: T.violetDim, color: T.violetText }}>{u.etiket}</span>}
                  {u.tukendi && <span style={{ fontSize: 10.5, marginLeft: 6, padding: "1px 7px", borderRadius: 10, background: T.bgSurface, color: T.textMuted }}>Tükendi</span>}
                </div>
                {u.aciklama && <div style={{ fontSize: 12.5, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.aciklama}</div>}
              </div>
              <div style={{ fontWeight: 800, fontSize: 13, color: T.textPrimary, textAlign: "right", maxWidth: 220 }}>
                {olculer.length
                  ? olculer.map((o, j) => (fiyatAl(u, j) != null ? <span key={o} style={{ display: "inline-block", marginLeft: 8, whiteSpace: "nowrap" }}><span style={{ color: T.textMuted, fontWeight: 600 }}>{o}</span> {fiyatYaz(fiyatAl(u, j))}</span> : null))
                  : fiyatYaz(u.fiyat)}
                {olculer.length > 0 && !olculer.some((_, j) => fiyatAl(u, j) != null) && <span style={{ color: T.textMuted, fontWeight: 600 }}>Fiyat yok</span>}
              </div>
              <Dugme onClick={() => urunDegistir(u, { tukendi: !u.tukendi })} title="Tükendi olarak işaretle">{u.tukendi ? "Var" : "Tükendi"}</Dugme>
              <Dugme onClick={() => urunDegistir(u, { aktif: !u.aktif })}>{u.aktif ? "Gizle" : "Göster"}</Dugme>
            </div>
          ))}
        </div>
      )}

      {/* Ürün penceresi */}
      {urunForm && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setUrunForm(null); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="pm-modal" style={{ ...kart, width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto", marginBottom: 0 }}>
            <Baslik sag={<Dugme onClick={() => setUrunForm(null)}>✕</Dugme>}>{urunForm.id ? "Ürünü düzenle" : `${seciliKat?.ad}: yeni ürün`}</Baslik>
            <div style={izgara}>
              <Alan etiket="Ürün adı"><input style={girdi} autoFocus value={urunForm.ad} onChange={(e) => setUrunForm({ ...urunForm, ad: e.target.value })} /></Alan>
              {menu.iki_dil && <Alan etiket="İngilizcesi"><input style={girdi} value={urunForm.ad_en || ""} onChange={(e) => setUrunForm({ ...urunForm, ad_en: e.target.value })} /></Alan>}
              <Alan etiket="İçindekiler / açıklama" genis><textarea style={{ ...girdi, minHeight: 60, resize: "vertical" }} value={urunForm.aciklama || ""} onChange={(e) => setUrunForm({ ...urunForm, aciklama: e.target.value })} /></Alan>
              {menu.iki_dil && <Alan etiket="Açıklama (İngilizce)" genis><textarea style={{ ...girdi, minHeight: 50, resize: "vertical" }} value={urunForm.aciklama_en || ""} onChange={(e) => setUrunForm({ ...urunForm, aciklama_en: e.target.value })} /></Alan>}
              {!olculer.length && <Alan etiket="Fiyat (₺)"><input style={girdi} inputMode="decimal" value={urunForm.fiyat ?? ""} onChange={(e) => setUrunForm({ ...urunForm, fiyat: e.target.value })} /></Alan>}
              {olculer.length > 0 && (
                <Alan etiket="Fiyatlar (₺) — boş bırakılan ölçü menüde görünmez" genis>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
                    {olculer.map((o, i) => (
                      <label key={o} style={{ display: "block" }}>
                        <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: T.textMuted, marginBottom: 3 }}>{o}</span>
                        <input style={girdi} inputMode="decimal" value={(urunForm.olcuFiyat || [])[i] ?? ""} onChange={(e) => { const l = [...(urunForm.olcuFiyat || [])]; l[i] = e.target.value; setUrunForm({ ...urunForm, olcuFiyat: l }); }} />
                      </label>
                    ))}
                  </div>
                </Alan>
              )}
              <Alan etiket="Etiket (isteğe bağlı)"><input style={girdi} placeholder="Yeni, Şefin önerisi, Acı…" value={urunForm.etiket || ""} onChange={(e) => setUrunForm({ ...urunForm, etiket: e.target.value })} /></Alan>
              <Alan etiket="Alerjenler" genis>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ALERJENLER.map(([kod, ad]) => {
                    const var_ = (urunForm.alerjenler || []).includes(kod);
                    return <button key={kod} type="button" onClick={() => setUrunForm({ ...urunForm, alerjenler: var_ ? urunForm.alerjenler.filter((x) => x !== kod) : [...(urunForm.alerjenler || []), kod] })}
                      style={{ padding: "5px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: var_ ? T.amber : "transparent", color: var_ ? "#fff" : T.textSecondary, border: `1.5px solid ${var_ ? T.amber : T.border}` }}>{kod} · {ad}</button>;
                  })}
                </div>
              </Alan>
              <Alan etiket="Fotoğraf (isteğe bağlı)" genis>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {urunForm.gorsel && <img src={urunForm.gorsel} alt="" style={{ width: 54, height: 54, objectFit: "cover", borderRadius: 8 }} />}
                  <label style={{ cursor: "pointer" }}><span style={{ ...girdi, display: "inline-block", width: "auto", fontWeight: 700 }}>{urunForm.gorsel ? "Değiştir" : "Fotoğraf yükle"}</span><input type="file" accept="image/*" onChange={urunGorselSec} style={{ display: "none" }} /></label>
                  {urunForm.gorsel && <Dugme onClick={() => setUrunForm({ ...urunForm, gorsel: "" })}>Kaldır</Dugme>}
                </div>
              </Alan>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 13.5, color: T.textPrimary, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!urunForm.tukendi} onChange={(e) => setUrunForm({ ...urunForm, tukendi: e.target.checked })} /> Tükendi</label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={urunForm.aktif !== false} onChange={(e) => setUrunForm({ ...urunForm, aktif: e.target.checked })} /> Menüde görünsün</label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
              <Dugme tur="ana" onClick={urunKaydet}>Kaydet</Dugme>
              <Dugme onClick={() => setUrunForm(null)}>Vazgeç</Dugme>
              {urunForm.id && <Dugme tur="tehlike" style={{ marginLeft: "auto" }} onClick={() => { const u = urunForm; setUrunForm(null); urunSil(u); }}>Ürünü sil</Dugme>}
            </div>
          </div>
        </div>
      )}

      {!musteriModu && (
        <div style={{ textAlign: "right", marginTop: 6 }}>
          <Dugme tur="tehlike" onClick={menuSil}>Bu menüyü sil</Dugme>
        </div>
      )}
      <style>{`@media (max-width: 900px) { .qmp-ust { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

const kucukDugme = { width: 24, height: 22, border: "none", background: "transparent", color: T.textMuted, cursor: "pointer", fontSize: 12, borderRadius: 6, fontFamily: "inherit", lineHeight: 1 };
