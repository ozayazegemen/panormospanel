import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import { T } from "./theme";
import { Btn, Select, Input, Textarea, Modal, FormField, StatCard, swalAlert, swalConfirm, panelFetch, downloadPdfFromHTML } from "./App.jsx";

// Panel → Planlayıcı: müşterilerin Reels, Post, Kaydırmalı ve Hikaye paylaşımları.
// Dosya yüklenir, tarih ve saat seçilir; sunucu her 5 dakikada zamanı geleni Instagram'a gönderir.
// Paylaşılınca "publishes" kaydı düşer, müşterinin o ayki hakkından (Aylık Paylaşım Anlaşması) eksilir.

const TURLER = [
  { id: "reels", label: "Reels", ikon: "🎬" },
  { id: "post", label: "Post", ikon: "📷" },
  { id: "carousel", label: "Kaydırmalı", ikon: "🖼️" },
  { id: "story", label: "Hikaye", ikon: "⭕" },
];
const turAdi = (id) => TURLER.find(t => t.id === id)?.label || id;
const DURUM = {
  bekliyor: { l: "Planlandı", c: T.blueText || "#4D8DFF" },
  hazirlaniyor: { l: "Instagram'a gönderiliyor", c: T.amberText || "#E8A100" },
  paylasildi: { l: "Paylaşıldı", c: T.greenText || "#2DBE6C" },
  hata: { l: "Hata", c: T.redText || "#E5484D" },
  iptal: { l: "İptal", c: T.textMuted },
};
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUNLER = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const ayAnahtari = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}`; };
const ikiHane = (n) => String(n).padStart(2, "0");
const yerelGun = (d) => { const x = new Date(d); return `${x.getFullYear()}-${ikiHane(x.getMonth() + 1)}-${ikiHane(x.getDate())}`; };
const yerelSaat = (d) => { const x = new Date(d); return `${ikiHane(x.getHours())}:${ikiHane(x.getMinutes())}`; };
const zamanYaz = (d) => { const x = new Date(d); return `${x.getDate()} ${AYLAR[x.getMonth()]} ${GUNLER[x.getDay()]} · ${yerelSaat(x)}`; };
const guvenliAd = (ad) => ad.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);

// Müşterinin seçilen aydaki Instagram hakkı: anlaşma, paylaşılan, planlanan, kalan
function hakHesapla(client, tur, tarih, planlar, haricId = null) {
  const hak = parseInt(client?.quotaDetail?.instagram?.[tur]) || 0;
  const ay = ayAnahtari(tarih);
  const paylasilan = (client?.publishesList || []).filter(p => p.platform === "instagram" && p.contentType === tur && p.publishedAt && ayAnahtari(p.publishedAt) === ay).reduce((s, p) => s + (p.quantity || 1), 0);
  const planlanan = planlar.filter(p => p.client_id === client?.id && p.icerik_turu === tur && p.id !== haricId && (p.durum === "bekliyor" || p.durum === "hazirlaniyor") && ayAnahtari(p.zaman) === ay).length;
  return { hak, paylasilan, planlanan, kalan: hak - paylasilan - planlanan };
}

function Rozet({ durum }) {
  const d = DURUM[durum] || DURUM.bekliyor;
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 7, color: d.c, background: d.c + "1F", whiteSpace: "nowrap" }}>{d.l}</span>;
}

export default function PlanlayiciPage({ clients, currentStaff }) {
  const [planlar, setPlanlar] = useState([]);
  const [igBag, setIgBag] = useState({}); // client_id → { ig_user_id, ig_kullanici_adi }
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sekme, setSekme] = useState("takvim");
  const [musteriFiltre, setMusteriFiltre] = useState("");
  const [haftaBasi, setHaftaBasi] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; });
  const [form, setForm] = useState(null);

  const yenile = async () => {
    const once = new Date(); once.setDate(once.getDate() - 75);
    const [{ data: p, error }, { data: c }] = await Promise.all([
      supabase.from("planli_paylasimlar").select("*").gte("zaman", once.toISOString()).order("zaman", { ascending: true }),
      supabase.from("clients").select("id,ig_user_id,ig_kullanici_adi"),
    ]);
    if (error) { setYukleniyor(false); swalAlert("Planlayıcı açılamadı: " + error.message + "\n\nSupabase'de supabase/planlayici-kurulum.sql dosyası çalıştırılmalı."); return; }
    setPlanlar(p || []);
    const m = {}; (c || []).forEach(x => { m[x.id] = x; }); setIgBag(m);
    setYukleniyor(false);
  };
  useEffect(() => { yenile(); const t = setInterval(yenile, 60000); return () => clearInterval(t); }, []);

  const aktifMusteriler = useMemo(() => (clients || []).filter(c => !c.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "tr")), [clients]);
  const musteriAdi = (id) => aktifMusteriler.find(c => c.id === id)?.name || "—";
  const gorunen = planlar.filter(p => !musteriFiltre || p.client_id === musteriFiltre);
  const yaklasan = gorunen.filter(p => p.durum === "bekliyor" || p.durum === "hazirlaniyor").length;
  const hatali = gorunen.filter(p => p.durum === "hata").length;
  const buAyPaylasilan = gorunen.filter(p => p.durum === "paylasildi" && ayAnahtari(p.paylasildi_at || p.zaman) === ayAnahtari(new Date())).length;

  const yeniAc = (gun) => {
    const d = gun ? new Date(gun) : new Date(Date.now() + 3600000);
    setForm({ id: null, client_id: musteriFiltre || "", icerik_turu: "reels", aciklama: "", gun: yerelGun(d), saat: gun ? "19:00" : yerelSaat(d), dosyalar: [], yeniDosyalar: [] });
  };
  const duzenle = (p) => setForm({ id: p.id, client_id: p.client_id, icerik_turu: p.icerik_turu, aciklama: p.aciklama || "", gun: yerelGun(p.zaman), saat: yerelSaat(p.zaman), dosyalar: p.dosyalar || [], yeniDosyalar: [], durum: p.durum });

  const simdiPaylas = async (p) => {
    if (!(await swalConfirm(`${musteriAdi(p.client_id)} için bu ${turAdi(p.icerik_turu)} şimdi Instagram'a gönderilsin mi?`))) return;
    if (p.durum === "hata") await supabase.from("planli_paylasimlar").update({ durum: "bekliyor", hata: null, meta: {}, updated_at: new Date().toISOString() }).eq("id", p.id);
    const r = await panelFetch("/.netlify/functions/planlayici", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ islem: "simdi", id: p.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) swalAlert("Gönderilemedi: " + (j.error || r.status));
    else swalAlert("Instagram'a gönderildi\n\nVideo ise Instagram'ın işlemesi birkaç dakika sürer; panel kendiliğinden tamamlar.");
    yenile();
  };
  const iptal = async (p) => {
    if (!(await swalConfirm("Bu planlı paylaşım iptal edilsin mi? (Dosyalar silinmez, tekrar planlanabilir.)"))) return;
    await supabase.from("planli_paylasimlar").update({ durum: "iptal", updated_at: new Date().toISOString() }).eq("id", p.id);
    yenile();
  };
  const sil = async (p) => {
    if (!(await swalConfirm("Bu planlı paylaşım ve yüklenen dosyaları kalıcı olarak silinsin mi?"))) return;
    const yollar = (p.dosyalar || []).map(d => d.yol).filter(Boolean);
    if (yollar.length) await supabase.storage.from("planlayici").remove(yollar);
    await supabase.from("planli_paylasimlar").delete().eq("id", p.id);
    yenile();
  };

  const kart = (p) => {
    const ilk = (p.dosyalar || [])[0];
    return <div key={p.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: T.textPrimary }}>{TURLER.find(t => t.id === p.icerik_turu)?.ikon} {musteriAdi(p.client_id)}</div>
        <Rozet durum={p.durum} />
      </div>
      <div style={{ fontSize: 11.5, color: T.textSecondary }}>{yerelSaat(p.zaman)} · {turAdi(p.icerik_turu)} · {(p.dosyalar || []).length} dosya{ilk?.tur === "video" ? " (video)" : ""}</div>
      {p.aciklama && <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.aciklama}</div>}
      {p.hata && <div style={{ fontSize: 11.5, color: DURUM.hata.c, marginTop: 4 }}>{p.hata}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {(p.durum === "bekliyor" || p.durum === "hata" || p.durum === "iptal") && <Btn onClick={() => duzenle(p)} style={{ fontSize: 11, padding: "4px 9px" }}>Düzenle</Btn>}
        {(p.durum === "bekliyor" || p.durum === "hata") && <Btn onClick={() => simdiPaylas(p)} style={{ fontSize: 11, padding: "4px 9px" }}>{p.durum === "hata" ? "Tekrar dene" : "Şimdi paylaş"}</Btn>}
        {p.durum === "bekliyor" && <Btn onClick={() => iptal(p)} style={{ fontSize: 11, padding: "4px 9px" }}>İptal</Btn>}
        {p.baglanti && <Btn onClick={() => window.open(p.baglanti, "_blank")} style={{ fontSize: 11, padding: "4px 9px" }}>Instagram'da aç</Btn>}
        {p.durum !== "hazirlaniyor" && <Btn onClick={() => sil(p)} style={{ fontSize: 11, padding: "4px 9px" }}>Sil</Btn>}
      </div>
    </div>;
  };

  const gunler = Array.from({ length: 7 }, (_, i) => { const d = new Date(haftaBasi); d.setDate(d.getDate() + i); return d; });
  const secili = aktifMusteriler.find(c => c.id === musteriFiltre);

  if (yukleniyor) return <div style={{ color: T.textMuted, padding: 20 }}>Yükleniyor…</div>;
  return <div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      {[["takvim", "📅 Haftalık takvim"], ["liste", "📋 Liste"], ["hesaplar", "🔗 Instagram hesapları"]].map(([id, l]) => <Btn key={id} variant={sekme === id ? "primary" : "ghost"} onClick={() => setSekme(id)}>{l}</Btn>)}
      <div style={{ flex: 1 }} />
      <div style={{ minWidth: 220 }}><Select value={musteriFiltre} onChange={e => setMusteriFiltre(e.target.value)}><option value="">Tüm müşteriler</option>{aktifMusteriler.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
      <Btn variant="primary" onClick={() => yeniAc(null)}>+ Yeni paylaşım planla</Btn>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
      <StatCard label="Sırada bekleyen" value={yaklasan} />
      <StatCard label="Bu ay otomatik paylaşılan" value={buAyPaylasilan} color={T.greenText} />
      <StatCard label="Hatalı" value={hatali} color={hatali ? T.redText : undefined} sub={hatali ? "Kartlarda nedeni yazıyor" : ""} />
    </div>

    {secili && <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 10 }}>{secili.name} · {AYLAR[new Date().getMonth()]} ayı Instagram hakları {igBag[secili.id]?.ig_kullanici_adi ? `· @${igBag[secili.id].ig_kullanici_adi}` : "· Instagram hesabı bağlı değil"}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {TURLER.map(t => { const h = hakHesapla(secili, t.id, new Date(), planlar); if (!h.hak && !h.paylasilan && !h.planlanan) return null;
          return <div key={t.id} style={{ padding: "8px 12px", borderRadius: 10, background: T.bgInput, fontSize: 12, color: T.textPrimary }}>
            <b>{t.ikon} {t.label}</b>: hak {h.hak} · paylaşılan {h.paylasilan} · planlanan {h.planlanan} · <b style={{ color: h.kalan < 0 ? T.redText : T.greenText }}>kalan {h.kalan}</b>
          </div>; })}
      </div>
    </div>}

    {sekme === "takvim" && <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <Btn onClick={() => { const d = new Date(haftaBasi); d.setDate(d.getDate() - 7); setHaftaBasi(d); }}>‹ Önceki hafta</Btn>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{gunler[0].getDate()} {AYLAR[gunler[0].getMonth()]} – {gunler[6].getDate()} {AYLAR[gunler[6].getMonth()]}</div>
        <Btn onClick={() => { const d = new Date(haftaBasi); d.setDate(d.getDate() + 7); setHaftaBasi(d); }}>Sonraki hafta ›</Btn>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
        {gunler.map(g => { const bugun = yerelGun(g) === yerelGun(new Date()); const o = gorunen.filter(p => yerelGun(p.zaman) === yerelGun(g));
          return <div key={g.toISOString()} style={{ background: T.bgSurface, border: `1.5px solid ${bugun ? T.amber : T.border}`, borderRadius: 14, padding: 10, minHeight: 140 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.textPrimary }}>{GUNLER[g.getDay()]} {g.getDate()}</div>
              <button onClick={() => yeniAc(g)} title="Bu güne planla" style={{ border: "none", background: "transparent", color: T.textMuted, cursor: "pointer", fontSize: 16 }}>+</button>
            </div>
            {o.map(kart)}
          </div>; })}
      </div>
    </div>}

    {sekme === "liste" && <div>
      {[["Sırada", gorunen.filter(p => p.durum === "bekliyor" || p.durum === "hazirlaniyor" || p.durum === "hata")], ["Paylaşılanlar ve iptaller", gorunen.filter(p => p.durum === "paylasildi" || p.durum === "iptal").reverse()]].map(([baslik, l]) =>
        <div key={baslik} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 8 }}>{baslik} ({l.length})</div>
          {l.length === 0 && <div style={{ fontSize: 12, color: T.textMuted }}>Kayıt yok.</div>}
          {l.map(p => <div key={p.id}><div style={{ fontSize: 11, color: T.textMuted, margin: "6px 0 3px" }}>{zamanYaz(p.zaman)}</div>{kart(p)}</div>)}
        </div>)}
    </div>}

    {sekme === "hesaplar" && <HesapEslestir musteriler={aktifMusteriler} igBag={igBag} onDegisti={yenile} />}

    {form && <PlanFormu form={form} setForm={setForm} musteriler={aktifMusteriler} planlar={planlar} igBag={igBag} currentStaff={currentStaff} onKaydedildi={() => { setForm(null); yenile(); }} />}
  </div>;
}

function PlanFormu({ form, setForm, musteriler, planlar, igBag, currentStaff, onKaydedildi }) {
  const [kaydediyor, setKaydediyor] = useState(false);
  const client = musteriler.find(c => c.id === form.client_id);
  const tarih = form.gun && form.saat ? new Date(`${form.gun}T${form.saat}`) : new Date();
  const h = client ? hakHesapla(client, form.icerik_turu, tarih, planlar, form.id) : null;
  const tumDosyalar = [...(form.dosyalar || []).map(d => ({ ...d, eski: true })), ...form.yeniDosyalar.map(f => ({ ad: f.name, tur: f.type.startsWith("video") ? "video" : "resim", dosya: f }))];
  const kabul = form.icerik_turu === "reels" ? "video/mp4,video/quicktime" : "image/jpeg,image/png,video/mp4,video/quicktime";

  const dosyaSec = (e) => {
    const yeni = [...e.target.files];
    e.target.value = "";
    setForm(f => ({ ...f, yeniDosyalar: f.icerik_turu === "carousel" ? [...f.yeniDosyalar, ...yeni].slice(0, 10 - (f.dosyalar || []).length) : yeni.slice(0, 1), dosyalar: f.icerik_turu === "carousel" ? f.dosyalar : [] }));
  };
  const cikar = (i) => {
    const eskiSayi = (form.dosyalar || []).length;
    if (i < eskiSayi) setForm(f => ({ ...f, dosyalar: f.dosyalar.filter((_, j) => j !== i) }));
    else setForm(f => ({ ...f, yeniDosyalar: f.yeniDosyalar.filter((_, j) => j !== i - eskiSayi) }));
  };

  const kaydet = async () => {
    if (!form.client_id) return swalAlert("Lütfen müşteri seçin");
    if (!form.gun || !form.saat) return swalAlert("Lütfen tarih ve saat seçin");
    if (tarih.getTime() < Date.now() - 60000) return swalAlert("Lütfen ileri bir tarih ve saat seçin");
    const n = tumDosyalar.length;
    if (!n) return swalAlert("Lütfen paylaşılacak dosyayı seçin");
    if (form.icerik_turu === "carousel" && n < 2) return swalAlert("Kaydırmalı paylaşım için en az 2 dosya seçin");
    if (form.icerik_turu === "reels" && tumDosyalar[0].tur !== "video") return swalAlert("Reels için video seçin");
    const buyuk = form.yeniDosyalar.find(f => f.size > 1024 * 1024 * 1024);
    if (buyuk) return swalAlert(`${buyuk.name} 1 GB'tan büyük; Instagram kabul etmez.`);
    if (!igBag[form.client_id]?.ig_user_id && !(await swalConfirm(`${client?.name} için Instagram hesabı henüz bağlı değil. Yine de planlansın mı? (Paylaşım saatine kadar "Instagram hesapları" sekmesinden bağlayın.)`))) return;
    if (h && h.kalan <= 0 && !(await swalConfirm(`${client?.name} müşterisinin ${AYLAR[tarih.getMonth()]} ayı ${turAdi(form.icerik_turu)} hakkı dolu (hak ${h.hak}, paylaşılan ${h.paylasilan}, planlanan ${h.planlanan}). Yine de planlansın mı?`))) return;

    setKaydediyor(true);
    try {
      const yuklenen = [];
      for (const f of form.yeniDosyalar) {
        const yol = `${form.client_id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${guvenliAd(f.name)}`;
        const { error } = await supabase.storage.from("planlayici").upload(yol, f, { contentType: f.type || undefined, upsert: false });
        if (error) throw new Error(`${f.name} yüklenemedi: ${error.message}${/size|large|exceed/i.test(error.message) ? " (dosya, depolama planının izin verdiği boyuttan büyük)" : ""}`);
        yuklenen.push({ yol, tur: f.type.startsWith("video") ? "video" : "resim", ad: f.name });
      }
      const kayit = {
        client_id: form.client_id, icerik_turu: form.icerik_turu, aciklama: form.icerik_turu === "story" ? "" : (form.aciklama || ""),
        dosyalar: [...(form.dosyalar || []), ...yuklenen], zaman: tarih.toISOString(), durum: "bekliyor", hata: null, meta: {}, updated_at: new Date().toISOString(),
      };
      const sorgu = form.id
        ? supabase.from("planli_paylasimlar").update(kayit).eq("id", form.id)
        : supabase.from("planli_paylasimlar").insert({ ...kayit, olusturan_id: currentStaff?.id || null, olusturan_ad: currentStaff?.name || null });
      const { error } = await sorgu;
      if (error) throw new Error(error.message);
      onKaydedildi();
    } catch (e) {
      swalAlert("Kaydedilemedi: " + e.message);
    }
    setKaydediyor(false);
  };

  return <Modal title={form.id ? "Planlı paylaşımı düzenle" : "Yeni paylaşım planla"} onClose={() => !kaydediyor && setForm(null)} width={560}>
    <FormField label="Müşteri"><Select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}><option value="">Seçin</option>{musteriler.map(c => <option key={c.id} value={c.id}>{c.name}{igBag[c.id]?.ig_kullanici_adi ? ` (@${igBag[c.id].ig_kullanici_adi})` : ""}</option>)}</Select></FormField>
    <FormField label="İçerik türü">
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TURLER.map(t => <Btn key={t.id} variant={form.icerik_turu === t.id ? "primary" : "ghost"} onClick={() => setForm(f => ({ ...f, icerik_turu: t.id, yeniDosyalar: t.id === "carousel" ? f.yeniDosyalar : f.yeniDosyalar.slice(0, 1), dosyalar: t.id === "carousel" ? f.dosyalar : (f.dosyalar || []).slice(0, 1) }))}>{t.ikon} {t.label}</Btn>)}
      </div>
    </FormField>
    {h && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 9, marginBottom: 14, background: h.kalan > 0 ? (T.greenDim || "rgba(45,190,108,.12)") : (T.redDim || "rgba(229,72,77,.12)"), color: h.kalan > 0 ? T.greenText : T.redText }}>
      {AYLAR[tarih.getMonth()]} ayı {turAdi(form.icerik_turu)} hakkı: {h.hak} · paylaşılan {h.paylasilan} · planlanan {h.planlanan} · <b>kalan {h.kalan}</b>{h.hak === 0 ? " (anlaşmada bu tür yok)" : ""}
    </div>}
    <FormField label={form.icerik_turu === "carousel" ? "Dosyalar (2–10 görsel ya da video, sırayla)" : form.icerik_turu === "reels" ? "Video (dikey 9:16, en çok 15 dk)" : form.icerik_turu === "story" ? "Görsel ya da video (dikey 9:16, video en çok 60 sn)" : "Görsel ya da video"}>
      <input type="file" accept={kabul} multiple={form.icerik_turu === "carousel"} onChange={dosyaSec} style={{ fontSize: 12.5, color: T.textSecondary }} />
      {tumDosyalar.length > 0 && <div style={{ marginTop: 8 }}>{tumDosyalar.map((d, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: T.textPrimary, padding: "5px 8px", background: T.bgInput, borderRadius: 7, marginBottom: 4 }}>
        <span>{i + 1}. {d.tur === "video" ? "🎬" : "🖼️"} {d.ad}{d.dosya ? ` · ${(d.dosya.size / 1048576).toFixed(1)} MB` : ""}</span>
        <button onClick={() => cikar(i)} style={{ border: "none", background: "transparent", color: T.textMuted, cursor: "pointer" }}>✕</button>
      </div>)}</div>}
    </FormField>
    {form.icerik_turu !== "story" && <FormField label="Açıklama ve etiketler"><Textarea value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Paylaşım metni, #etiketler" minHeight={100} /></FormField>}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <FormField label="Tarih"><Input type="date" value={form.gun} onChange={e => setForm(f => ({ ...f, gun: e.target.value }))} /></FormField>
      <FormField label="Saat"><Input type="time" value={form.saat} onChange={e => setForm(f => ({ ...f, saat: e.target.value }))} /></FormField>
    </div>
    <div style={{ fontSize: 11.5, color: T.textMuted, marginBottom: 6 }}>Paylaşım seçilen saatten sonraki 5 dakika içinde gönderilir. Paylaşılınca müşterinin aylık hakkından 1 {turAdi(form.icerik_turu)} düşer.</div>
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
      <Btn onClick={() => setForm(null)} disabled={kaydediyor}>Vazgeç</Btn>
      <Btn variant="primary" onClick={kaydet} disabled={kaydediyor}>{kaydediyor ? "Yükleniyor…" : (form.id ? "Kaydet" : "Planla")}</Btn>
    </div>
  </Modal>;
}

function HesapEslestir({ musteriler, igBag, onDegisti }) {
  const [hesaplar, setHesaplar] = useState(null);
  const [hata, setHata] = useState("");
  const getir = async () => {
    setHata(""); setHesaplar(null);
    const r = await panelFetch("/.netlify/functions/planlayici?islem=hesaplar");
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setHata(j.error || `Hata ${r.status}`); return; }
    setHesaplar(j.hesaplar || []);
  };
  useEffect(() => { getir(); }, []);
  const bagla = async (clientId, hesapId) => {
    const h = (hesaplar || []).find(x => x.id === hesapId);
    const { error } = await supabase.from("clients").update({ ig_user_id: h?.id || null, ig_kullanici_adi: h?.kullanici || null }).eq("id", clientId);
    if (error) return swalAlert("Kaydedilemedi: " + error.message);
    onDegisti();
  };
  return <div>
    <div style={{ fontSize: 12.5, color: T.textSecondary, marginBottom: 12, lineHeight: 1.6 }}>
      Her müşteriyi kendi Instagram işletme hesabıyla eşleştirin. Listede yalnızca Panormos Business portföyüne eklenmiş (Facebook sayfasına bağlı) Instagram işletme hesapları görünür.
    </div>
    {hata && <div style={{ fontSize: 12.5, color: T.redText, background: T.redDim || "rgba(229,72,77,.12)", padding: "10px 12px", borderRadius: 10, marginBottom: 12 }}>Instagram hesapları alınamadı: {hata}</div>}
    <Btn onClick={getir} style={{ marginBottom: 12 }}>Hesapları yenile</Btn>
    {hesaplar === null && !hata && <div style={{ fontSize: 12, color: T.textMuted }}>Hesaplar alınıyor…</div>}
    {musteriler.map(c => <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
      <div style={{ flex: 1, fontSize: 13, color: T.textPrimary }}>{c.name}</div>
      <div style={{ width: 300 }}>
        <Select value={igBag[c.id]?.ig_user_id || ""} onChange={e => bagla(c.id, e.target.value)}>
          <option value="">{igBag[c.id]?.ig_user_id ? "Bağlantıyı kaldır" : "Instagram hesabı seçin"}</option>
          {igBag[c.id]?.ig_user_id && !(hesaplar || []).find(h => h.id === igBag[c.id].ig_user_id) && <option value={igBag[c.id].ig_user_id}>@{igBag[c.id].ig_kullanici_adi || igBag[c.id].ig_user_id}</option>}
          {(hesaplar || []).map(h => <option key={h.id} value={h.id}>@{h.kullanici} ({h.sayfa})</option>)}
        </Select>
      </div>
    </div>)}
  </div>;
}

// ─────────────────────────────────────────────
// Müşteri → Instagram sekmesi: aylık istatistikler ve PDF rapor
// ─────────────────────────────────────────────
const sayiYaz = (n) => (n === null || n === undefined) ? "—" : Number(n).toLocaleString("tr-TR");
const kacay = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return `${d.getFullYear()}-${ikiHane(d.getMonth() + 1)}`; };
const ayYaz = (a) => { const [y, m] = a.split("-").map(Number); return `${AYLAR[m - 1]} ${y}`; };
const kacis = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function InstagramIstatistik({ client }) {
  const [ay, setAy] = useState(kacay(0));
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  const getir = async (yenile = false) => {
    setYukleniyor(true); setHata("");
    try {
      const r = await panelFetch(`/.netlify/functions/planlayici?islem=istatistik&client=${client.id}&ay=${ay}${yenile ? "&yenile=1" : ""}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Hata ${r.status}`);
      setVeri(j);
    } catch (e) { setHata(e.message); setVeri(null); }
    setYukleniyor(false);
  };
  useEffect(() => { getir(); }, [client.id, ay]);

  const medya = veri?.medya || [];
  const top = (k) => medya.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const tk = veri?.takipci || {};
  const ozet = [
    ["Takipçi", veri?.hesap?.takipci], ["Yeni takipçi (ay)", tk.kayitVar ? tk.yeni : null], ["Bırakan (ay)", tk.kayitVar ? tk.ayrilan : null], ["Net değişim", tk.kayitVar ? (tk.net > 0 ? "+" + sayiYaz(tk.net) : sayiYaz(tk.net)) : null],
    ["Bu ay paylaşım", medya.length],
    ["Görüntülenme", veri?.genel?.views ?? top("goruntulenme")], ["Erişilen hesap", veri?.genel?.reach ?? top("erisim")],
    ["Beğeni", top("begeni")], ["Yorum", top("yorum")], ["Kaydetme", top("kaydetme")], ["Paylaşım (gönderim)", top("paylasim")],
    ["Profil ziyareti", veri?.genel?.profile_views ?? null],
  ];

  const pdf = () => {
    const satir = medya.map(x => `<tr><td>${kacis(zamanYaz(x.zaman))}</td><td>${kacis(turAdi(x.tur))}</td><td class="ac">${kacis(x.aciklama || "")}</td><td>${sayiYaz(x.goruntulenme)}</td><td>${sayiYaz(x.erisim)}</td><td>${sayiYaz(x.begeni)}</td><td>${sayiYaz(x.yorum)}</td><td>${sayiYaz(x.kaydetme)}</td><td>${sayiYaz(x.paylasim)}</td></tr>`).join("");
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>rapor</title><style>
      body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:28px}
      h1{font-size:20px;margin:0}.alt{color:#666;font-size:12px;margin:4px 0 18px}
      .kutular{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px}
      .k{border:1px solid #ddd;border-radius:10px;padding:10px 12px}.k b{display:block;font-size:20px;margin-top:4px}.k span{font-size:10px;color:#777;text-transform:uppercase;letter-spacing:.05em}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #e5e5e5;padding:6px 5px;text-align:right}th{background:#f6f6f6;font-weight:700}
      th:nth-child(-n+3),td:nth-child(-n+3){text-align:left}td.ac{max-width:220px;color:#444}
      .son{margin-top:18px;font-size:10px;color:#888}</style></head><body>
      <h1>${kacis(client.name)} · Instagram Raporu</h1>
      <div class="alt">@${kacis(veri?.hesap?.kullanici || "")} · ${ayYaz(ay)} · Hazırlayan: Panormos Medya</div>
      <div class="kutular">${ozet.map(([l, v]) => `<div class="k"><span>${l}</span><b>${typeof v === "string" ? v : sayiYaz(v)}</b></div>`).join("")}</div>
      ${tk.kayitVar && tk.gunler?.length ? `<div class="alt" style="margin-top:4px">Takipçi: ay başı ${sayiYaz(tk.baslangic)} → ay sonu ${sayiYaz(tk.bitis)}</div>` : ""}
      <table><thead><tr><th>Tarih</th><th>Tür</th><th>Açıklama</th><th>Görüntülenme</th><th>Erişim</th><th>Beğeni</th><th>Yorum</th><th>Kaydetme</th><th>Paylaşım</th></tr></thead><tbody>${satir || `<tr><td colspan="9">Bu ay paylaşım yok.</td></tr>`}</tbody></table>
      <div class="son">Veriler Instagram'dan ${new Date().toLocaleDateString("tr-TR")} tarihinde alındı.</div></body></html>`;
    downloadPdfFromHTML(html, `${client.name}-instagram-${ay}.pdf`, "landscape");
  };

  return <div>
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
      <div style={{ width: 180 }}><Select value={ay} onChange={e => setAy(e.target.value)}>{Array.from({ length: 12 }, (_, i) => kacay(i)).map(a => <option key={a} value={a}>{ayYaz(a)}</option>)}</Select></div>
      <Btn onClick={() => getir(true)} disabled={yukleniyor}>{yukleniyor ? "Alınıyor… (20-30 sn sürebilir)" : "Yenile"}</Btn>
      {veri?.onbellek && <span style={{ fontSize: 11, color: T.textMuted }}>Son güncelleme {new Date(veri.onbellek).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>}
      <div style={{ flex: 1 }} />
      {veri?.bagli && <Btn variant="primary" onClick={pdf} disabled={yukleniyor}>📄 PDF rapor</Btn>}
    </div>
    {hata && <div style={{ fontSize: 12.5, color: T.redText, background: T.redDim, padding: "10px 12px", borderRadius: 10, marginBottom: 12 }}>İstatistikler alınamadı: {hata}</div>}
    {veri && !veri.bagli && <div style={{ fontSize: 13, color: T.textSecondary, padding: 16, background: T.bgInput, borderRadius: 12 }}>Bu müşterinin Instagram hesabı henüz bağlı değil. Paylaşım Planlayıcı → Instagram hesapları sekmesinden bağlayın.</div>}
    {veri?.bagli && <>
      <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10 }}>@{veri.hesap?.kullanici} · {ayYaz(ay)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        {ozet.map(([l, v]) => <StatCard key={l} label={l} value={sayiYaz(v)} />)}
      </div>
      {tk.kayitVar ? <TakipciGrafik gunler={tk.gunler} /> : <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 14 }}>Takipçi hareketi (yeni / bırakan) her gece kaydedilir; ilk kayıttan sonra burada günlük grafik görünür.</div>}
      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
          <thead><tr style={{ background: T.bgSurface }}>{["", "Tarih", "Tür", "Açıklama", "Görüntülenme", "Erişim", "Beğeni", "Yorum", "Kaydetme", "Paylaşım"].map((b, i) => <th key={i} style={{ padding: "8px 8px", textAlign: i > 3 ? "right" : "left", color: T.textSecondary, fontSize: 11 }}>{b}</th>)}</tr></thead>
          <tbody>
            {medya.length === 0 && <tr><td colSpan={10} style={{ padding: 14, color: T.textMuted }}>Bu ay paylaşım yok.</td></tr>}
            {medya.map(x => <tr key={x.id} style={{ borderTop: `1px solid ${T.border}` }}>
              <td style={{ padding: 6 }}>{x.gorsel ? <img src={x.gorsel} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} /> : null}</td>
              <td style={{ padding: 6, whiteSpace: "nowrap", color: T.textPrimary }}>{zamanYaz(x.zaman)}</td>
              <td style={{ padding: 6, color: T.textPrimary }}>{turAdi(x.tur)}</td>
              <td style={{ padding: 6, color: T.textMuted, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.baglanti ? <a href={x.baglanti} target="_blank" rel="noreferrer" style={{ color: T.textMuted }}>{x.aciklama || "Paylaşımı aç"}</a> : x.aciklama}</td>
              {["goruntulenme", "erisim", "begeni", "yorum", "kaydetme", "paylasim"].map(k => <td key={k} style={{ padding: 6, textAlign: "right", color: T.textPrimary, fontWeight: 600 }}>{sayiYaz(x[k])}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    </>}
  </div>;
}

// Günlük yeni / bırakan takipçi çubukları (yeşil yukarı, kırmızı aşağı) ve toplam takipçi çizgisi
function TakipciGrafik({ gunler }) {
  const g = gunler || [];
  if (!g.length) return null;
  const W = 760, H = 150, pad = 28, n = g.length, bw = Math.max(4, (W - pad * 2) / n - 2);
  const maxBar = Math.max(1, ...g.map(x => Math.max(x.yeni || 0, x.ayrilan || 0)));
  const tks = g.filter(x => x.takipci != null);
  const tMin = tks.length ? Math.min(...tks.map(x => x.takipci)) : 0, tMax = tks.length ? Math.max(...tks.map(x => x.takipci)) : 1;
  const mid = H / 2;
  const x = (i) => pad + i * ((W - pad * 2) / n) + 1;
  const cizgi = tks.map(x0 => { const i = g.indexOf(x0); const y = tMax === tMin ? mid : (H - pad) - ((x0.takipci - tMin) / (tMax - tMin)) * (H - pad * 2); return `${x(i) + bw / 2},${y}`; }).join(" ");
  return <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 12, marginBottom: 14, background: T.bgCard }}>
    <div style={{ display: "flex", gap: 14, fontSize: 11, color: T.textSecondary, marginBottom: 6 }}>
      <span><span style={{ display: "inline-block", width: 10, height: 10, background: T.green || "#2DBE6C", borderRadius: 2, marginRight: 4 }} />Yeni takipçi</span>
      <span><span style={{ display: "inline-block", width: 10, height: 10, background: T.redText || "#E5484D", borderRadius: 2, marginRight: 4 }} />Bırakan</span>
      {tks.length > 1 && <span><span style={{ display: "inline-block", width: 14, height: 2, background: T.amber, marginRight: 4, verticalAlign: "middle" }} />Toplam takipçi ({sayiYaz(tMin)}–{sayiYaz(tMax)})</span>}
    </div>
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      <line x1={pad} y1={mid} x2={W - pad} y2={mid} stroke={T.border} />
      {g.map((d, i) => { const up = ((d.yeni || 0) / maxBar) * (mid - pad), dn = ((d.ayrilan || 0) / maxBar) * (mid - pad); return <g key={d.gun}>
        <title>{`${d.gun}: +${d.yeni ?? 0} / -${d.ayrilan ?? 0}${d.takipci != null ? ` · toplam ${d.takipci}` : ""}`}</title>
        <rect x={x(i)} y={mid - up} width={bw} height={up} fill={T.green || "#2DBE6C"} rx={1} />
        <rect x={x(i)} y={mid} width={bw} height={dn} fill={T.redText || "#E5484D"} rx={1} />
      </g>; })}
      {tks.length > 1 && <polyline points={cizgi} fill="none" stroke={T.amber} strokeWidth={2} />}
      <text x={pad} y={H - 4} fontSize={10} fill={T.textMuted}>{g[0].gun.slice(8)}.{g[0].gun.slice(5, 7)}</text>
      <text x={W - pad} y={H - 4} fontSize={10} fill={T.textMuted} textAnchor="end">{g[n - 1].gun.slice(8)}.{g[n - 1].gun.slice(5, 7)}</text>
    </svg>
  </div>;
}
