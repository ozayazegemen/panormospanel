import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { T } from "./theme";
import { Btn, Select, Input, Textarea, Modal, FormField, StatCard, swalAlert, swalConfirm, panelFetch } from "./App.jsx";

// Panel → Reklamlar: müşteriler için Instagram/Facebook reklamı verme (Meta Marketing API).
// Tüm reklamlar Panormos Medya'nın reklam hesabından çıkar; ödeme Panormos kartından yapılır, müşteriden önden tahsil edilir.
// Akış: müşteri → gönderi seç ya da yeni görsel/video → amaç → hedef kitle (il/ilçe, yaş, cinsiyet, ilgi) → bütçe/süre → başlat.
// Sunucu (netlify/functions/reklam.cjs) Meta'da kampanya + reklam seti + kreatif + reklamı oluşturur; sonuçlar saatte bir tazelenir.

const AMACLAR = [
  { id: "erisim", label: "Erişim", aciklama: "Mümkün olduğunca çok kişiye göster", ikon: "📣" },
  { id: "etkilesim", label: "Etkileşim", aciklama: "Beğeni, yorum, kaydetme", ikon: "❤️" },
  { id: "trafik", label: "Web sitesi", aciklama: "Siteye tıklama (bağlantı gerekir)", ikon: "🔗" },
  { id: "profil", label: "Profil ziyareti", aciklama: "Instagram profiline yönlendir", ikon: "👤" },
];
const amacAdi = (id) => AMACLAR.find(a => a.id === id)?.label || id;
const DURUM = {
  olusturuluyor: { l: "Oluşturuluyor", c: T.amberText || "#E8A100" },
  inceleme: { l: "Meta incelemesinde", c: T.blueText || "#4D8DFF" },
  aktif: { l: "Yayında", c: T.greenText || "#2DBE6C" },
  duraklatildi: { l: "Durduruldu", c: T.textMuted },
  bitti: { l: "Bitti", c: T.textMuted },
  reddedildi: { l: "Reddedildi", c: T.redText || "#E5484D" },
  hata: { l: "Hata", c: T.redText || "#E5484D" },
  iptal: { l: "İptal", c: T.textMuted },
};
const ADIM_ADI = { kampanya: "Kampanya açılıyor", reklam_seti: "Hedef kitle ve bütçe ayarlanıyor", medya: "Görsel/video Meta'ya yükleniyor", kreatif: "Reklam tasarımı hazırlanıyor", reklam: "Reklam oluşturuluyor", baslat: "Başlatılıyor" };
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const ikiHane = (n) => String(n).padStart(2, "0");
const gunYaz = (d) => { if (!d) return "—"; const x = new Date(d); return `${x.getDate()} ${AYLAR[x.getMonth()].slice(0, 3)} ${x.getFullYear()}`; };
const yerelGun = (d) => { const x = new Date(d); return `${x.getFullYear()}-${ikiHane(x.getMonth() + 1)}-${ikiHane(x.getDate())}`; };
const sayiYaz = (n) => (n === null || n === undefined || n === "") ? "—" : Number(n).toLocaleString("tr-TR");
const paraYaz = (n) => (n === null || n === undefined) ? "—" : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
const gunSayisi = (bas, bit) => bit ? Math.max(1, Math.round((new Date(bit) - new Date(bas)) / 86400000)) : null;
const guvenliAd = (ad) => ad.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);

function Rozet({ durum }) {
  const d = DURUM[durum] || DURUM.inceleme;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 7, color: d.c, background: d.c + "1F", whiteSpace: "nowrap" }}>{d.l}</span>;
}

const api = async (yol, govde) => {
  const r = await panelFetch(`/.netlify/functions/reklam${yol}`, govde ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Hata ${r.status}`);
  return j;
};

const hedefOzet = (h = {}) => {
  const p = [];
  p.push((h.konumlar || []).length ? h.konumlar.map(k => k.name).join(", ") : "Türkiye");
  p.push(`${h.yas_min || 18}-${h.yas_max || 65} yaş`);
  if (h.cinsiyet === "kadin") p.push("kadın"); else if (h.cinsiyet === "erkek") p.push("erkek");
  if ((h.ilgi || []).length) p.push(h.ilgi.map(i => i.name).join(", "));
  p.push(h.platform === "hepsi" ? "Instagram + Facebook" : "Instagram");
  return p.join(" · ");
};

export default function ReklamlarPage({ clients, currentStaff }) {
  const [reklamlar, setReklamlar] = useState([]);
  const [hesap, setHesap] = useState(null);
  const [hesapHata, setHesapHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);
  const [musteriFiltre, setMusteriFiltre] = useState("");
  const [durumFiltre, setDurumFiltre] = useState("");
  const [form, setForm] = useState(null);
  const [detay, setDetay] = useState(null);

  const aktifMusteriler = useMemo(() => (clients || []).filter(c => !c.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "tr")), [clients]);
  const musteriAdi = (id) => aktifMusteriler.find(c => c.id === id)?.name || (clients || []).find(c => c.id === id)?.name || "—";

  const yenile = async () => {
    const { data, error } = await supabase.from("reklamlar").select("*").order("created_at", { ascending: false }).limit(300);
    if (error) { setYukleniyor(false); swalAlert("Reklamlar açılamadı: " + error.message + "\n\nSupabase'de supabase/reklam-kurulum.sql dosyası çalıştırılmalı."); return; }
    setReklamlar(data || []);
    setYukleniyor(false);
  };
  const hesapGetir = async () => {
    try { setHesap(await api("?islem=hesap")); setHesapHata(""); } catch (e) { setHesapHata(e.message); }
  };
  useEffect(() => { yenile(); hesapGetir(); const t = setInterval(yenile, 60000); return () => clearInterval(t); }, []);

  // Oluşturulmakta olanları birkaç saniyede bir ilerlet
  const ilerliyor = useRef(false);
  useEffect(() => {
    const bekleyen = reklamlar.filter(r => r.durum === "olusturuluyor");
    if (!bekleyen.length) return;
    const t = setTimeout(async () => {
      if (ilerliyor.current) return; ilerliyor.current = true;
      try {
        for (const r of bekleyen.slice(0, 3)) {
          const j = await api("", { islem: "ilerle", id: r.id });
          if (j.reklam) setReklamlar(l => l.map(x => x.id === r.id ? j.reklam : x));
        }
      } catch (e) { /* bir sonraki turda tekrar */ }
      ilerliyor.current = false;
    }, 3500);
    return () => clearTimeout(t);
  }, [reklamlar]);

  const guncelle = (r) => { if (!r) return; if (r.silindi) setReklamlar(l => l.filter(x => x.id !== r.id)); else setReklamlar(l => l.map(x => x.id === r.id ? r : x)); if (detay?.id === r.id) setDetay(r.silindi ? null : r); };

  const islemYap = async (r, islem) => {
    const soru = { durdur: "Reklam durdurulsun mu? (Sonra devam ettirebilirsiniz.)", bitir: "Reklam tamamen bitirilsin mi?", sil: "Bu reklam kaydı silinsin mi?" }[islem];
    if (soru && !(await swalConfirm(soru))) return;
    try { const j = await api("", { islem, id: r.id }); guncelle(j.reklam); }
    catch (e) { swalAlert("İşlem yapılamadı: " + e.message); }
  };

  const liste = reklamlar.filter(r => (!musteriFiltre || r.client_id === musteriFiltre) && (!durumFiltre || (durumFiltre === "yayinda" ? ["inceleme", "aktif", "olusturuluyor"].includes(r.durum) : r.durum === durumFiltre)));
  const top = (k) => liste.reduce((s, r) => s + (Number(r.sonuc?.[k]) || 0), 0);
  const buAy = new Date(); buAy.setDate(1); buAy.setHours(0, 0, 0, 0);
  const buAyHarcama = reklamlar.filter(r => new Date(r.created_at) >= buAy).reduce((s, r) => s + (Number(r.sonuc?.harcama) || 0), 0);

  return <div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
      <div>
        <div className="pm-baslik" style={{ fontSize: 20, color: T.textPrimary }}>Reklamlar</div>
        <div style={{ fontSize: 12.5, color: T.textSecondary, marginTop: 2 }}>Müşteriler için Instagram ve Facebook reklamı verin; sonuçları buradan izleyin.</div>
      </div>
      <div style={{ flex: 1 }} />
      <Btn variant="primary" onClick={() => setForm({})}>+ Yeni reklam</Btn>
    </div>

    {hesapHata && <div style={{ fontSize: 12.5, color: T.redText, background: T.redDim || "rgba(229,72,77,.12)", padding: "10px 12px", borderRadius: 10, marginBottom: 12 }}>
      Reklam hesabına bağlanılamadı: {hesapHata}. Meta jetonunda reklam izinleri (ads_management) olmalı ve Panormos reklam hesabı sistem kullanıcısına atanmış olmalı.
    </div>}
    {hesap && !hesap.odemeVar && <div style={{ fontSize: 12.5, color: T.amberText || "#E8A100", background: "rgba(232,161,0,.12)", padding: "10px 12px", borderRadius: 10, marginBottom: 12 }}>
      Reklam hesabında kayıtlı ödeme yöntemi yok. Meta Reklam Yöneticisi → Faturalar ve ödemeler bölümünden Panormos kartını ekleyin; eklenmeden reklam yayına çıkmaz.
    </div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 16 }}>
      <StatCard label="Yayında" value={reklamlar.filter(r => r.durum === "aktif").length} sub={`${reklamlar.filter(r => r.durum === "inceleme").length} incelemede`} />
      <StatCard label="Bu ay harcama" value={paraYaz(buAyHarcama)} sub={hesap ? `Toplam ${paraYaz(hesap.harcanan)}` : ""} />
      <StatCard label="Erişim (listelenen)" value={sayiYaz(top("erisim"))} sub={`${sayiYaz(top("gosterim"))} gösterim`} />
      <StatCard label="Tıklama (listelenen)" value={sayiYaz(top("tiklama"))} sub={`${sayiYaz(top("etkilesim"))} etkileşim`} />
      <StatCard label="Ödeme" value={hesap ? (hesap.odeme || "Kart yok") : "—"} sub={hesap ? `${hesap.ad} · ${hesap.durum}` : ""} />
    </div>

    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
      <div style={{ width: 240 }}><Select value={musteriFiltre} onChange={e => setMusteriFiltre(e.target.value)}><option value="">Tüm müşteriler</option>{aktifMusteriler.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
      <div style={{ width: 200 }}><Select value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)}><option value="">Tüm durumlar</option><option value="yayinda">Yayında / incelemede</option><option value="duraklatildi">Durduruldu</option><option value="bitti">Bitti</option><option value="hata">Hata / reddedildi</option></Select></div>
      <Btn onClick={() => { yenile(); hesapGetir(); }}>Yenile</Btn>
    </div>

    <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 900 }}>
        <thead><tr style={{ background: T.bgSurface }}>{["Müşteri", "Reklam", "Amaç", "Tarih", "Bütçe", "Durum", "Erişim", "Tıklama", "Harcama", ""].map((b, i) => <th key={i} style={{ padding: "8px 8px", textAlign: i >= 6 && i <= 8 ? "right" : "left", color: T.textSecondary, fontSize: 11 }}>{b}</th>)}</tr></thead>
        <tbody>
          {yukleniyor && <tr><td colSpan={10} style={{ padding: 14, color: T.textMuted }}>Yükleniyor…</td></tr>}
          {!yukleniyor && liste.length === 0 && <tr><td colSpan={10} style={{ padding: 14, color: T.textMuted }}>Henüz reklam yok. "Yeni reklam" ile başlayın.</td></tr>}
          {liste.map(r => <tr key={r.id} style={{ borderTop: `1px solid ${T.border}`, cursor: "pointer" }} onClick={() => setDetay(r)}>
            <td style={{ padding: 8, color: T.textPrimary, fontWeight: 600, whiteSpace: "nowrap" }}>{musteriAdi(r.client_id)}</td>
            <td style={{ padding: 8, color: T.textPrimary, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.baslik || (r.kaynak === "gonderi" ? "Gönderi öne çıkarma" : "Yeni reklam")}</td>
            <td style={{ padding: 8, color: T.textSecondary, whiteSpace: "nowrap" }}>{amacAdi(r.amac)}</td>
            <td style={{ padding: 8, color: T.textSecondary, whiteSpace: "nowrap" }}>{gunYaz(r.baslangic)}{r.bitis ? ` – ${gunYaz(r.bitis)}` : " →"}</td>
            <td style={{ padding: 8, color: T.textSecondary, whiteSpace: "nowrap" }}>{paraYaz(r.butce_gunluk)}/gün{gunSayisi(r.baslangic, r.bitis) ? <span style={{ color: T.textMuted }}> · {paraYaz(r.butce_gunluk * gunSayisi(r.baslangic, r.bitis))}</span> : ""}</td>
            <td style={{ padding: 8 }}><Rozet durum={r.durum} />{r.durum === "olusturuluyor" && <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 3 }}>{ADIM_ADI[r.adim] || "…"}</div>}{(r.durum === "hata" || r.durum === "reddedildi") && r.hata && <div style={{ fontSize: 10.5, color: T.redText, marginTop: 3, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.hata}>{r.hata}</div>}</td>
            <td style={{ padding: 8, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{sayiYaz(r.sonuc?.erisim)}</td>
            <td style={{ padding: 8, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{sayiYaz(r.sonuc?.tiklama)}</td>
            <td style={{ padding: 8, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{r.sonuc ? paraYaz(r.sonuc.harcama) : "—"}</td>
            <td style={{ padding: 8, whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
              {(r.durum === "aktif" || r.durum === "inceleme") && <Btn onClick={() => islemYap(r, "durdur")} title="Durdur" style={{ padding: "4px 8px" }}>⏸</Btn>}
              {r.durum === "duraklatildi" && <Btn onClick={() => islemYap(r, "devam")} title="Devam et" style={{ padding: "4px 8px" }}>▶</Btn>}
              {r.durum === "hata" && <Btn onClick={() => islemYap(r, "tekrar")} title="Tekrar dene" style={{ padding: "4px 8px" }}>↻</Btn>}
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    {form && <ReklamFormu form={form} setForm={setForm} musteriler={aktifMusteriler} hesap={hesap} onOlustu={(r) => { setForm(null); setReklamlar(l => [r, ...l]); setDetay(r); }} />}
    {detay && <ReklamDetay r={reklamlar.find(x => x.id === detay.id) || detay} musteri={musteriAdi(detay.client_id)} onClose={() => setDetay(null)} onIslem={islemYap} />}
  </div>;
}

// ─────────────────────────────────────────────
// Yeni reklam formu
// ─────────────────────────────────────────────
function ReklamFormu({ form, setForm, musteriler, hesap, onOlustu }) {
  const bugun = yerelGun(new Date());
  const [f, setF] = useState(() => ({
    client_id: form.client_id || "", baslik: "", kaynak: "gonderi", ig_medya_id: form.ig_medya_id || "", dosya: null, metin: "", baglanti: "", amac: "erisim",
    hedef: { konumlar: [], yas_min: 18, yas_max: 65, cinsiyet: "hepsi", ilgi: [], platform: "instagram", genisKitle: false },
    butce_gunluk: "", baslangic: bugun, bitis: yerelGun(new Date(Date.now() + 7 * 86400000)),
  }));
  const [gonderiler, setGonderiler] = useState(null);
  const [gonderiHata, setGonderiHata] = useState("");
  const [tahmin, setTahmin] = useState(null);
  const [kaydediyor, setKaydediyor] = useState(false);
  const [ilerleme, setIlerleme] = useState(null);
  const degis = (k, v) => setF(x => ({ ...x, [k]: v }));
  const hedefDegis = (k, v) => setF(x => ({ ...x, hedef: { ...x.hedef, [k]: v } }));
  const musteri = musteriler.find(c => c.id === f.client_id);

  useEffect(() => {
    if (!f.client_id) { setGonderiler(null); return; }
    let iptal = false;
    setGonderiler(null); setGonderiHata("");
    api(`?islem=gonderiler&client=${f.client_id}`).then(j => { if (iptal) return; if (!j.bagli) setGonderiHata("Bu müşterinin Instagram hesabı bağlı değil (Paylaşım Planlayıcı → Instagram hesapları)."); setGonderiler(j.gonderiler || []); })
      .catch(e => { if (!iptal) { setGonderiHata(e.message); setGonderiler([]); } });
    return () => { iptal = true; };
  }, [f.client_id]);

  // Tahmini kitle (hedef değişince kısa gecikmeyle)
  useEffect(() => {
    const t = setTimeout(() => { api(`?islem=tahmin&amac=${f.amac}&hedef=${encodeURIComponent(JSON.stringify(f.hedef))}`).then(setTahmin).catch(() => setTahmin(null)); }, 900);
    return () => clearTimeout(t);
  }, [JSON.stringify(f.hedef), f.amac]);

  const gun = gunSayisi(f.baslangic, f.bitis);
  const toplam = gun && Number(f.butce_gunluk) ? gun * Number(f.butce_gunluk) : null;

  const dosyaSec = (e) => {
    const d = e.target.files?.[0]; e.target.value = "";
    if (!d) return;
    if (d.size > 1024 * 1024 * 1024) return swalAlert("Dosya 1 GB'tan büyük.");
    degis("dosya", { dosya: d, ad: d.name, tur: d.type.startsWith("video") ? "video" : "resim" });
  };

  const baslat = async () => {
    if (!f.client_id) return swalAlert("Müşteri seçin.");
    if (gonderiHata && f.kaynak === "gonderi") return swalAlert(gonderiHata);
    if (f.kaynak === "gonderi" && !f.ig_medya_id) return swalAlert("Öne çıkarılacak gönderiyi seçin.");
    if (f.kaynak === "yeni" && !f.dosya) return swalAlert("Görsel ya da video seçin.");
    if (f.amac === "trafik" && !/^https?:\/\//.test(f.baglanti)) return swalAlert("Web sitesi reklamı için bağlantı adresi girin (https://…).");
    const butce = Number(String(f.butce_gunluk).replace(",", "."));
    if (!(butce > 0)) return swalAlert("Günlük bütçe girin.");
    if (hesap?.minGunluk && butce < hesap.minGunluk) return swalAlert(`Meta'nın kabul ettiği en düşük günlük bütçe ${paraYaz(hesap.minGunluk)}.`);
    if (!gun || gun < 1) return swalAlert("Bitiş tarihi başlangıçtan en az 1 gün sonra olmalı.");
    if (hesap && !hesap.odemeVar && !(await swalConfirm("Reklam hesabında ödeme yöntemi görünmüyor; reklam yayına çıkmayabilir. Yine de oluşturulsun mu?"))) return;
    if (!(await swalConfirm(`${musteri?.name} için ${gun} gün, günlük ${paraYaz(butce)} (toplam ≈ ${paraYaz(toplam)}) reklam başlatılsın mı?\n\nÖdeme Panormos kartından çıkar; tutarı müşteriden önden tahsil etmeyi unutmayın.`))) return;

    setKaydediyor(true);
    try {
      let dosya = null;
      if (f.kaynak === "yeni") {
        setIlerleme("Dosya yükleniyor…");
        const yol = `${f.client_id}/reklam/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${guvenliAd(f.dosya.ad)}`;
        const { error } = await supabase.storage.from("planlayici").upload(yol, f.dosya.dosya, { contentType: f.dosya.dosya.type || undefined, upsert: false });
        if (error) throw new Error("Dosya yüklenemedi: " + error.message);
        dosya = { yol, tur: f.dosya.tur, ad: f.dosya.ad };
      }
      setIlerleme("Meta'da kampanya oluşturuluyor…");
      const basZaman = f.baslangic === bugun ? new Date(Date.now() + 5 * 60000) : new Date(f.baslangic + "T00:00:00");
      const bitZaman = f.bitis ? new Date(f.bitis + "T23:59:00") : null;
      const j = await api("", {
        islem: "olustur", client_id: f.client_id, baslik: f.baslik, kaynak: f.kaynak, ig_medya_id: f.ig_medya_id, dosya, metin: f.metin, baglanti: f.baglanti || null, amac: f.amac,
        hedef: f.hedef, butce_gunluk: butce, baslangic: basZaman.toISOString(), bitis: bitZaman ? bitZaman.toISOString() : null,
      });
      onOlustu(j.reklam);
    } catch (e) { swalAlert("Reklam oluşturulamadı: " + e.message); }
    setKaydediyor(false); setIlerleme(null);
  };

  const secili = (gonderiler || []).find(g => g.id === f.ig_medya_id);

  return <Modal title="Yeni reklam" onClose={() => !kaydediyor && setForm(null)} width={680}>
    <FormField label="Müşteri"><Select value={f.client_id} onChange={e => setF(x => ({ ...x, client_id: e.target.value, ig_medya_id: "" }))}><option value="">Seçin</option>{musteriler.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>
    <FormField label="Reklam adı (isteğe bağlı, raporlarda görünür)"><Input value={f.baslik} onChange={e => degis("baslik", e.target.value)} placeholder="Örn. Kasım kampanyası" /></FormField>

    <FormField label="Ne reklam edilecek?">
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <Btn variant={f.kaynak === "gonderi" ? "primary" : "ghost"} onClick={() => degis("kaynak", "gonderi")}>📷 Mevcut Instagram gönderisi</Btn>
        <Btn variant={f.kaynak === "yeni" ? "primary" : "ghost"} onClick={() => degis("kaynak", "yeni")}>🆕 Yeni görsel / video</Btn>
      </div>
      {f.kaynak === "gonderi" && <>
        {!f.client_id && <div style={{ fontSize: 12, color: T.textMuted }}>Önce müşteri seçin.</div>}
        {f.client_id && gonderiler === null && !gonderiHata && <div style={{ fontSize: 12, color: T.textMuted }}>Gönderiler alınıyor…</div>}
        {gonderiHata && <div style={{ fontSize: 12, color: T.redText }}>{gonderiHata}</div>}
        {gonderiler && gonderiler.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(96px,1fr))", gap: 8, maxHeight: 260, overflowY: "auto", padding: 2 }}>
          {gonderiler.map(g => <div key={g.id} onClick={() => degis("ig_medya_id", g.id)} title={g.aciklama} style={{ cursor: "pointer", borderRadius: 10, overflow: "hidden", border: `2px solid ${f.ig_medya_id === g.id ? T.amber : T.border}`, background: T.bgInput }}>
            {g.gorsel ? <img src={g.gorsel} alt="" style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} /> : <div style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{g.tur === "reels" || g.tur === "video" ? "🎬" : "🖼️"}</div>}
            <div style={{ fontSize: 10, color: T.textMuted, padding: "4px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{gunYaz(g.zaman)} · ♥ {sayiYaz(g.begeni)}</div>
          </div>)}
        </div>}
        {secili && <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 8 }}>Seçilen: {secili.aciklama || "(açıklamasız gönderi)"} · <a href={secili.baglanti} target="_blank" rel="noreferrer" style={{ color: T.textMuted }}>Instagram'da aç</a></div>}
      </>}
      {f.kaynak === "yeni" && <>
        <input type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime" onChange={dosyaSec} style={{ fontSize: 12.5, color: T.textSecondary }} />
        {f.dosya && <div style={{ fontSize: 12, color: T.textPrimary, marginTop: 6 }}>{f.dosya.tur === "video" ? "🎬" : "🖼️"} {f.dosya.ad} · {(f.dosya.dosya.size / 1048576).toFixed(1)} MB</div>}
        <div style={{ marginTop: 10 }}><Textarea value={f.metin} onChange={e => degis("metin", e.target.value)} placeholder="Reklam metni" minHeight={70} /></div>
      </>}
    </FormField>

    <FormField label="Amaç">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
        {AMACLAR.map(a => <div key={a.id} onClick={() => degis("amac", a.id)} style={{ cursor: "pointer", padding: "10px 12px", borderRadius: 10, border: `2px solid ${f.amac === a.id ? T.amber : T.border}`, background: T.bgInput }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{a.ikon} {a.label}</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{a.aciklama}</div>
        </div>)}
      </div>
    </FormField>
    {(f.amac === "trafik" || f.kaynak === "yeni") && <FormField label={f.amac === "trafik" ? "Bağlantı adresi (zorunlu)" : "Bağlantı adresi (boşsa Instagram profili açılır)"}><Input value={f.baglanti} onChange={e => degis("baglanti", e.target.value)} placeholder="https://…" /></FormField>}

    <FormField label="Hedef kitle">
      <AramaSecici etiket="Konum (il / ilçe)" yer="Örn. Bandırma, Balıkesir, Erdek" islem="konum" secili={f.hedef.konumlar} anahtar="key" onDegis={v => hedefDegis("konumlar", v)} goster={k => `${k.name}${k.bolge ? ` (${k.bolge})` : ""}`} bos="Konum seçilmezse tüm Türkiye hedeflenir." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
        <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Yaş (en az)</div><Select value={f.hedef.yas_min} onChange={e => hedefDegis("yas_min", Number(e.target.value))}>{Array.from({ length: 48 }, (_, i) => 18 + i).map(y => <option key={y} value={y}>{y}</option>)}</Select></div>
        <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Yaş (en çok)</div><Select value={f.hedef.yas_max} onChange={e => hedefDegis("yas_max", Number(e.target.value))}>{Array.from({ length: 48 }, (_, i) => 18 + i).map(y => <option key={y} value={y}>{y === 65 ? "65+" : y}</option>)}</Select></div>
        <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Cinsiyet</div><Select value={f.hedef.cinsiyet} onChange={e => hedefDegis("cinsiyet", e.target.value)}><option value="hepsi">Hepsi</option><option value="kadin">Kadın</option><option value="erkek">Erkek</option></Select></div>
      </div>
      <div style={{ marginTop: 10 }}>
        <AramaSecici etiket="İlgi alanları (isteğe bağlı)" yer="Örn. emlak, tatil, peynir, restoran" islem="ilgi" secili={f.hedef.ilgi} anahtar="id" onDegis={v => hedefDegis("ilgi", v)} goster={k => k.name} altYazi={k => k.yol} bos="" />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", fontSize: 12.5, color: T.textSecondary }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="radio" checked={f.hedef.platform !== "hepsi"} onChange={() => hedefDegis("platform", "instagram")} /> Yalnızca Instagram</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}><input type="radio" checked={f.hedef.platform === "hepsi"} onChange={() => hedefDegis("platform", "hepsi")} /> Instagram + Facebook</label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="Meta, seçtiğiniz kitlenin dışında da uygun kişilere gösterebilir"><input type="checkbox" checked={!!f.hedef.genisKitle} onChange={e => hedefDegis("genisKitle", e.target.checked)} /> Kitleyi Meta genişletebilsin</label>
      </div>
      {tahmin && (tahmin.alt || tahmin.ust) && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8 }}>Tahmini kitle: {sayiYaz(tahmin.alt)} – {sayiYaz(tahmin.ust)} kişi</div>}
    </FormField>

    <FormField label="Bütçe ve süre">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Günlük bütçe (₺)</div><Input type="number" value={f.butce_gunluk} onChange={e => degis("butce_gunluk", e.target.value)} placeholder={hesap?.minGunluk ? `en az ${hesap.minGunluk}` : "örn. 150"} /></div>
        <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Başlangıç</div><Input type="date" value={f.baslangic} onChange={e => degis("baslangic", e.target.value)} /></div>
        <div><div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>Bitiş</div><Input type="date" value={f.bitis} onChange={e => degis("bitis", e.target.value)} /></div>
      </div>
      {toplam !== null && <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 9, marginTop: 10, background: T.greenDim || "rgba(45,190,108,.12)", color: T.greenText }}>
        {gun} gün × {paraYaz(Number(f.butce_gunluk))} = <b>≈ {paraYaz(toplam)}</b> reklam harcaması (Meta, bazı günler %25'e kadar fazla ya da az harcayabilir). Müşteriden bu tutar + hizmet bedeli önden tahsil edilir.
      </div>}
    </FormField>

    {ilerleme && <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 10 }}>⏳ {ilerleme}</div>}
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Btn onClick={() => setForm(null)} disabled={kaydediyor}>Vazgeç</Btn>
      <Btn variant="primary" onClick={baslat} disabled={kaydediyor}>{kaydediyor ? "Oluşturuluyor…" : "Reklamı oluştur ve başlat"}</Btn>
    </div>
  </Modal>;
}

// Arama kutusu + seçilenler (konum, ilgi)
function AramaSecici({ etiket, yer, islem, secili, anahtar, onDegis, goster, altYazi, bos }) {
  const [q, setQ] = useState("");
  const [sonuc, setSonuc] = useState([]);
  const [ariyor, setAriyor] = useState(false);
  useEffect(() => {
    if (q.trim().length < 2) { setSonuc([]); return; }
    let iptal = false; setAriyor(true);
    const t = setTimeout(() => { api(`?islem=${islem}&q=${encodeURIComponent(q.trim())}`).then(j => { if (!iptal) setSonuc(j.sonuc || []); }).catch(() => { if (!iptal) setSonuc([]); }).finally(() => { if (!iptal) setAriyor(false); }); }, 400);
    return () => { iptal = true; clearTimeout(t); };
  }, [q]);
  const ekle = (k) => { if (!secili.find(s => s[anahtar] === k[anahtar])) onDegis([...secili, k]); setQ(""); setSonuc([]); };
  return <div>
    <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 4 }}>{etiket}</div>
    <div style={{ position: "relative" }}>
      <Input value={q} onChange={e => setQ(e.target.value)} placeholder={yer} />
      {(sonuc.length > 0 || ariyor) && q.trim().length >= 2 && <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 5, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: T.shadow, maxHeight: 220, overflowY: "auto" }}>
        {ariyor && !sonuc.length && <div style={{ padding: 10, fontSize: 12, color: T.textMuted }}>Aranıyor…</div>}
        {sonuc.map(k => <div key={k[anahtar]} onClick={() => ekle(k)} style={{ padding: "8px 12px", fontSize: 12.5, color: T.textPrimary, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}>
          {goster(k)}{altYazi && altYazi(k) ? <div style={{ fontSize: 10.5, color: T.textMuted }}>{altYazi(k)}</div> : null}
        </div>)}
      </div>}
    </div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      {secili.map(k => <span key={k[anahtar]} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 8, background: T.bgInput, color: T.textPrimary, border: `1px solid ${T.border}`, display: "inline-flex", gap: 6, alignItems: "center" }}>
        {goster(k)} <button onClick={() => onDegis(secili.filter(s => s[anahtar] !== k[anahtar]))} style={{ border: "none", background: "transparent", color: T.textMuted, cursor: "pointer", padding: 0 }}>✕</button>
      </span>)}
      {!secili.length && bos && <span style={{ fontSize: 11.5, color: T.textMuted }}>{bos}</span>}
    </div>
  </div>;
}

// ─────────────────────────────────────────────
// Reklam detayı
// ─────────────────────────────────────────────
function ReklamDetay({ r, musteri, onClose, onIslem }) {
  const [tazeliyor, setTazeliyor] = useState(false);
  const s = r.sonuc || {};
  const gun = gunSayisi(r.baslangic, r.bitis);
  const tazele = async () => { setTazeliyor(true); await onIslem(r, "yenile"); setTazeliyor(false); };
  const kutular = [
    ["Erişim", sayiYaz(s.erisim)], ["Gösterim", sayiYaz(s.gosterim)], ["Tıklama", sayiYaz(s.tiklama)], ["Etkileşim", sayiYaz(s.etkilesim)],
    ["Harcama", r.sonuc ? paraYaz(s.harcama) : "—"], ["Bin gösterim maliyeti", s.bgm ? paraYaz(s.bgm) : "—"],
    ...(s.linkTiklama ? [["Bağlantı tıklaması", sayiYaz(s.linkTiklama)]] : []), ...(s.profilZiyareti ? [["Profil ziyareti", sayiYaz(s.profilZiyareti)]] : []),
    ...(s.videoIzleme ? [["Video izleme", sayiYaz(s.videoIzleme)]] : []), ...(s.siklik ? [["Kişi başı gösterim", Number(s.siklik).toFixed(1)]] : []),
  ];
  return <Modal title={`${musteri} · ${r.baslik || amacAdi(r.amac)}`} onClose={onClose} width={640}>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <Rozet durum={r.durum} />
      <span style={{ fontSize: 12.5, color: T.textSecondary }}>{amacAdi(r.amac)} · {gunYaz(r.baslangic)}{r.bitis ? ` – ${gunYaz(r.bitis)}` : ""} · {paraYaz(r.butce_gunluk)}/gün{gun ? ` (≈ ${paraYaz(r.butce_gunluk * gun)})` : ""}</span>
    </div>
    {r.durum === "olusturuluyor" && <div style={{ fontSize: 12.5, color: T.amberText || "#E8A100", marginBottom: 12 }}>⏳ {ADIM_ADI[r.adim] || "Hazırlanıyor"}… Bu pencere kendiliğinden güncellenir.</div>}
    {r.durum === "inceleme" && <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 12 }}>Meta reklamı inceliyor; genellikle 24 saat içinde yayına girer.</div>}
    {(r.durum === "hata" || r.durum === "reddedildi") && r.hata && <div style={{ fontSize: 12.5, color: T.redText, background: T.redDim || "rgba(229,72,77,.12)", padding: "10px 12px", borderRadius: 10, marginBottom: 12 }}>{r.hata}</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 14 }}>
      {kutular.map(([l, v]) => <div key={l} style={{ background: T.bgInput, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 10, color: T.textMuted, textTransform: "uppercase", letterSpacing: ".05em" }}>{l}</div><div style={{ fontSize: 18, fontWeight: 800, color: T.textPrimary, marginTop: 2 }}>{v}</div></div>)}
    </div>
    <div style={{ fontSize: 12.5, color: T.textSecondary, lineHeight: 1.7, marginBottom: 14 }}>
      <div><b style={{ color: T.textPrimary }}>Hedef kitle:</b> {hedefOzet(r.hedef)}</div>
      {r.kaynak === "yeni" && r.metin && <div><b style={{ color: T.textPrimary }}>Metin:</b> {r.metin}</div>}
      {r.baglanti && <div><b style={{ color: T.textPrimary }}>Bağlantı:</b> <a href={r.baglanti} target="_blank" rel="noreferrer" style={{ color: T.textSecondary }}>{r.baglanti}</a></div>}
      <div style={{ color: T.textMuted, fontSize: 11.5 }}>Oluşturan {r.olusturan_ad || "—"} · {gunYaz(r.created_at)}{r.sonuc_guncellendi_at ? ` · Sonuçlar ${new Date(r.sonuc_guncellendi_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} itibarıyla` : ""}{r.meta?.kampanya_id ? ` · Meta kampanya ${r.meta.kampanya_id}` : ""}</div>
    </div>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {r.meta?.reklam_id && <Btn onClick={tazele} disabled={tazeliyor}>{tazeliyor ? "Alınıyor…" : "Sonuçları yenile"}</Btn>}
      {(r.durum === "aktif" || r.durum === "inceleme") && <Btn onClick={() => onIslem(r, "durdur")}>⏸ Durdur</Btn>}
      {r.durum === "duraklatildi" && <Btn variant="primary" onClick={() => onIslem(r, "devam")}>▶ Devam et</Btn>}
      {["aktif", "inceleme", "duraklatildi"].includes(r.durum) && <Btn onClick={() => onIslem(r, "bitir")}>■ Bitir</Btn>}
      {r.durum === "hata" && <Btn variant="primary" onClick={() => onIslem(r, "tekrar")}>↻ Tekrar dene</Btn>}
      {["hata", "reddedildi", "bitti"].includes(r.durum) && <Btn onClick={() => onIslem(r, "sil")}>Sil</Btn>}
    </div>
  </Modal>;
}

// Müşteri → Instagram sekmesinde: o müşterinin reklamları (özet)
export function MusteriReklamlari({ client, ay, onVeri }) {
  const [liste, setListe] = useState(null);
  useEffect(() => {
    supabase.from("reklamlar").select("id,baslik,amac,durum,baslangic,bitis,butce_gunluk,sonuc").eq("client_id", client.id).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setListe(data || []));
  }, [client.id]);
  const ayici = useMemo(() => {
    if (!liste) return [];
    if (!ay) return liste;
    const [y, m] = ay.split("-").map(Number); const ab = new Date(y, m - 1, 1), ae = new Date(y, m, 1);
    return liste.filter(r => { const b = new Date(r.baslangic), e = r.bitis ? new Date(r.bitis) : new Date(); return b < ae && e >= ab; });
  }, [liste, ay]);
  useEffect(() => { if (onVeri && liste) onVeri(ayici); }, [ayici]);
  if (!liste || !ayici.length) return null;
  const top = (k) => ayici.reduce((s, r) => s + (Number(r.sonuc?.[k]) || 0), 0);
  return <div style={{ marginTop: 18 }}>
    <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 8 }}>📣 Reklamlar · erişim {sayiYaz(top("erisim"))} · tıklama {sayiYaz(top("tiklama"))} · harcama {paraYaz(top("harcama"))}</div>
    <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 600 }}>
        <thead><tr style={{ background: T.bgSurface }}>{["Reklam", "Amaç", "Tarih", "Durum", "Erişim", "Tıklama", "Harcama"].map((b, i) => <th key={i} style={{ padding: "8px", textAlign: i >= 4 ? "right" : "left", color: T.textSecondary, fontSize: 11 }}>{b}</th>)}</tr></thead>
        <tbody>{ayici.map(r => <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
          <td style={{ padding: 7, color: T.textPrimary }}>{r.baslik || amacAdi(r.amac)}</td><td style={{ padding: 7, color: T.textSecondary }}>{amacAdi(r.amac)}</td>
          <td style={{ padding: 7, color: T.textSecondary, whiteSpace: "nowrap" }}>{gunYaz(r.baslangic)}{r.bitis ? ` – ${gunYaz(r.bitis)}` : ""}</td><td style={{ padding: 7 }}><Rozet durum={r.durum} /></td>
          <td style={{ padding: 7, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{sayiYaz(r.sonuc?.erisim)}</td><td style={{ padding: 7, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{sayiYaz(r.sonuc?.tiklama)}</td><td style={{ padding: 7, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{r.sonuc ? paraYaz(r.sonuc.harcama) : "—"}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export { amacAdi as reklamAmacAdi, paraYaz as reklamParaYaz };
