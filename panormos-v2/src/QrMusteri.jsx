import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { T, THEME } from "./theme";
import { MenuDuzenle } from "./QrMenuPanel.jsx";

// QR Menü — restoran/bar sahibinin kendi menüsünü düzenlediği, panel personelinden tamamen ayrı giriş.
// /menu-giris: giriş yapar ya da (davet/şifre bağlantısından geldiyse) ilk şifresini belirler.
// /menu-panel: giriş yapmış sahibin kendi menüsünü (QrMenuPanel.jsx'teki aynı düzenleme ekranı) gösterir.

function translateError(msg) {
  if (!msg) return "Bir hata oluştu.";
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (m.includes("password should be at least")) return "Şifre en az 6 karakter olmalı.";
  if (m.includes("same_password") || m.includes("different from the old")) return "Yeni şifre eskisiyle aynı olamaz.";
  return msg;
}

const inputStyle = {
  width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10,
  padding: "12px 14px", color: T.textPrimary, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box",
};

function Kabuk({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(900px 500px at 50% -10%, ${T.indigoGlow}, transparent 70%), ${T.bg}`, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            <span style={{ color: T.textPrimary }}>panormos</span> <span style={{ color: T.amber }}>medya.</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, marginTop: 8, letterSpacing: "0.14em", textTransform: "uppercase" }}>QR Menü — Müşteri Girişi</div>
        </div>
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: 30, boxShadow: THEME === "light" ? "0 24px 60px -28px rgba(16,24,40,0.35)" : "0 24px 60px -20px rgba(0,0,0,0.7)" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
function Hata({ children }) { return <div style={{ fontSize: 12.5, color: T.redText, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>⚠️ {children}</div>; }
function Bilgi({ children }) { return <div style={{ fontSize: 12.5, color: T.greenText, background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>✓ {children}</div>; }
function Dugme({ children, onClick, loading }) {
  return <button onClick={onClick} disabled={loading} style={{ marginTop: 4, padding: "12px 0", borderRadius: 10, border: "none", background: loading ? T.textMuted : T.amber, color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: "inherit", cursor: loading ? "default" : "pointer", boxShadow: "0 8px 20px -10px rgba(242,81,36,0.8)" }}>{loading ? "Lütfen bekleyin…" : children}</button>;
}
function Etiket({ children }) { return <label style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600, display: "block", marginBottom: 6 }}>{children}</label>; }

export function QrMusteriGiris() {
  // Davet ya da şifre sıfırlama bağlantısıyla geldiyse Supabase oturumu otomatik kurar; o zaman "yeni şifre belirle" gösterilir
  const [sifreBelirleModu] = useState(() => /type=invite|type=recovery/.test(window.location.hash));
  const [unutuModu, setUnutuModu] = useState(false);
  const [eposta, setEposta] = useState("");
  const [sifre, setSifre] = useState("");
  const [sifre2, setSifre2] = useState("");
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState("");
  const [bilgi, setBilgi] = useState("");

  useEffect(() => {
    if (sifreBelirleModu) return;
    // Zaten girişliyse (daha önce şifre belirlemiş/giriş yapmışsa) doğrudan panele gönder
    supabase.auth.getSession().then(({ data }) => { if (data?.session) window.location.href = "/menu-panel"; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function girisYap() {
    setHata(""); setBilgi("");
    if (!eposta || !sifre) { setHata("E-posta ve şifre girin."); return; }
    setBekle(true);
    const { error } = await supabase.auth.signInWithPassword({ email: eposta.trim().toLocaleLowerCase("tr"), password: sifre });
    setBekle(false);
    if (error) { setHata(translateError(error.message)); return; }
    window.location.href = "/menu-panel";
  }
  async function sifreBelirle() {
    setHata(""); setBilgi("");
    if (sifre.length < 6) { setHata("Şifre en az 6 karakter olmalı."); return; }
    if (sifre !== sifre2) { setHata("Şifreler uyuşmuyor."); return; }
    setBekle(true);
    const { error } = await supabase.auth.updateUser({ password: sifre });
    setBekle(false);
    if (error) { setHata(translateError(error.message)); return; }
    window.location.href = "/menu-panel";
  }
  async function sifremiUnuttum() {
    setHata(""); setBilgi("");
    if (!eposta) { setHata("E-posta girin."); return; }
    setBekle(true);
    const { error } = await supabase.auth.resetPasswordForEmail(eposta.trim(), { redirectTo: `${window.location.origin}/menu-giris` });
    setBekle(false);
    if (error) { setHata(translateError(error.message)); return; }
    setBilgi("E-postanıza bir bağlantı gönderdik.");
  }
  const onKey = (e, fn) => { if (e.key === "Enter") fn(); };

  if (sifreBelirleModu) {
    return (
      <Kabuk>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 16 }}>Hoş geldiniz — yeni şifrenizi belirleyin</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><Etiket>Yeni şifre</Etiket><input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => onKey(e, sifreBelirle)} placeholder="En az 6 karakter" autoComplete="new-password" style={inputStyle} /></div>
          <div><Etiket>Yeni şifre (tekrar)</Etiket><input type="password" value={sifre2} onChange={(e) => setSifre2(e.target.value)} onKeyDown={(e) => onKey(e, sifreBelirle)} autoComplete="new-password" style={inputStyle} /></div>
          {hata && <Hata>{hata}</Hata>}
          <Dugme onClick={sifreBelirle} loading={bekle}>Şifreyi belirle ve devam et</Dugme>
        </div>
      </Kabuk>
    );
  }
  if (unutuModu) {
    return (
      <Kabuk>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 16 }}>Şifremi unuttum</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><Etiket>E-posta</Etiket><input type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} onKeyDown={(e) => onKey(e, sifremiUnuttum)} placeholder="mail@ornek.com" autoComplete="email" style={inputStyle} /></div>
          {hata && <Hata>{hata}</Hata>}
          {bilgi && <Bilgi>{bilgi}</Bilgi>}
          <Dugme onClick={sifremiUnuttum} loading={bekle}>Bağlantı gönder</Dugme>
          <button onClick={() => setUnutuModu(false)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>‹ Girişe dön</button>
        </div>
      </Kabuk>
    );
  }
  return (
    <Kabuk>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 16 }}>Menünüzü düzenlemek için giriş yapın</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div><Etiket>E-posta</Etiket><input type="email" value={eposta} onChange={(e) => setEposta(e.target.value)} onKeyDown={(e) => onKey(e, girisYap)} placeholder="mail@ornek.com" autoComplete="email" style={inputStyle} /></div>
        <div><Etiket>Şifre</Etiket><input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} onKeyDown={(e) => onKey(e, girisYap)} autoComplete="current-password" style={inputStyle} /></div>
        {hata && <Hata>{hata}</Hata>}
        <Dugme onClick={girisYap} loading={bekle}>Giriş yap</Dugme>
        <button onClick={() => setUnutuModu(true)} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>Şifremi unuttum</button>
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, textAlign: "center", fontSize: 13, color: T.textSecondary }}>
          Hesabınız yok mu? <a href="/menu-kayit" style={{ color: T.amber, fontWeight: 700, textDecoration: "none" }}>14 gün ücretsiz deneyin →</a>
        </div>
      </div>
    </Kabuk>
  );
}

// İşletmenin kendi kendine kaydı: hesap ve menü açılır, 14 gün ücretsiz deneme başlar
export function QrMusteriKayit() {
  const [f, setF] = useState({ isletme: "", telefon: "", eposta: "", sifre: "", sozlesme: false, web_sitesi: "" });
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState("");
  const alan = (ad) => ({ value: f[ad], onChange: (e) => setF((x) => ({ ...x, [ad]: e.target.value })) });
  async function kaydol() {
    setHata("");
    if (!f.isletme.trim() || !f.eposta.trim() || !f.telefon.trim()) { setHata("İşletme adı, telefon ve e-posta zorunlu."); return; }
    if (f.sifre.length < 8) { setHata("Şifre en az 8 karakter olmalı."); return; }
    if (!f.sozlesme) { setHata("Abonelik koşullarını onaylayın."); return; }
    setBekle(true);
    try {
      const r = await fetch("/.netlify/functions/qr-menu-kayit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setHata(j.error || "Kayıt tamamlanamadı."); setBekle(false); return; }
      const { error } = await supabase.auth.signInWithPassword({ email: f.eposta.trim().toLocaleLowerCase("tr"), password: f.sifre });
      if (error) { setHata("Hesabınız açıldı; giriş sayfasından giriş yapabilirsiniz."); setBekle(false); return; }
      window.location.href = "/menu-panel";
    } catch (e) { setHata("Bağlantı hatası. Tekrar deneyin."); setBekle(false); }
  }
  const onKey = (e) => { if (e.key === "Enter") kaydol(); };
  return (
    <Kabuk>
      <div style={{ fontSize: 16, fontWeight: 800, color: T.textPrimary, marginBottom: 4 }}>QR menünüzü 14 gün ücretsiz deneyin</div>
      <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 16, lineHeight: 1.5 }}>Kart bilgisi istenmez. Sonra aylık 249 ₺ ya da yıllık 2.490 ₺ (+KDV).</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Etiket>İşletme adı</Etiket><input {...alan("isletme")} onKeyDown={onKey} placeholder="ör. Kahve Durağı" style={inputStyle} /></div>
        <div><Etiket>Telefon</Etiket><input {...alan("telefon")} onKeyDown={onKey} placeholder="0532 000 00 00" inputMode="tel" autoComplete="tel" style={inputStyle} /></div>
        <div><Etiket>E-posta</Etiket><input type="email" {...alan("eposta")} onKeyDown={onKey} placeholder="mail@ornek.com" autoComplete="email" style={inputStyle} /></div>
        <div><Etiket>Şifre</Etiket><input type="password" {...alan("sifre")} onKeyDown={onKey} placeholder="En az 8 karakter" autoComplete="new-password" style={inputStyle} /></div>
        {/* Botlar için tuzak: insanlar görmez ve doldurmaz */}
        <input {...alan("web_sitesi")} tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: T.textSecondary, lineHeight: 1.5, cursor: "pointer" }}>
          <input type="checkbox" checked={f.sozlesme} onChange={(e) => setF((x) => ({ ...x, sozlesme: e.target.checked }))} style={{ marginTop: 3 }} />
          <span><a href="/qr-menu#kosullar" target="_blank" rel="noopener" style={{ color: T.amber }}>Abonelik koşullarını</a> okudum, kabul ediyorum.</span>
        </label>
        {hata && <Hata>{hata}</Hata>}
        <Dugme onClick={kaydol} loading={bekle}>{bekle ? "Menünüz hazırlanıyor…" : "Ücretsiz başla"}</Dugme>
        <div style={{ textAlign: "center", fontSize: 13, color: T.textSecondary }}>Hesabınız var mı? <a href="/menu-giris" style={{ color: T.amber, fontWeight: 700, textDecoration: "none" }}>Giriş yapın</a></div>
      </div>
    </Kabuk>
  );
}

// ---- Abonelik: kalan süre, ödeme (kart / havale) ----
const KDV = 0.2;
const tl = (n) => `${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)} ₺`;
const bugunTr = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const gunFarki = (a, b) => Math.round((new Date(a + "T00:00:00Z") - new Date(b + "T00:00:00Z")) / 86400000);
const tarihYaz = (t) => new Date(t + "T00:00:00Z").toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function abonelikDurumu(menu) {
  if (!menu?.abonelik_bitis) return null;
  const kalan = gunFarki(menu.abonelik_bitis, bugunTr());
  return { kalan, doldu: kalan < 0, deneme: !menu.abonelik_donem, kapanis: kalan < 0 ? 7 + kalan : null };
}

function Abonelik({ menu, kullaniciId, yenile }) {
  const [ayar, setAyar] = useState(null); // { kart, havale, fiyat }
  const [donem, setDonem] = useState("yillik");
  const [onay, setOnay] = useState(false);
  const [havaleAcik, setHavaleAcik] = useState(false);
  const [odemeler, setOdemeler] = useState([]);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState("");
  const d = abonelikDurumu(menu);
  const fiyat = ayar?.fiyat || { aylik: 249, yillik: 2490 };
  const tutar = fiyat[donem], toplam = Math.round(tutar * (1 + KDV) * 100) / 100;
  const bekleyen = odemeler.find((o) => o.durum === "bekliyor" && o.yontem === "havale");

  async function yukle() {
    fetch("/.netlify/functions/qr-odeme-baslat").then((r) => r.json()).then(setAyar).catch(() => setAyar({ kart: false }));
    const { data } = await supabase.from("qr_odemeler").select("*").eq("menu_id", menu.id).order("created_at", { ascending: false }).limit(10);
    setOdemeler(data || []);
  }
  useEffect(() => { yukle(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [menu.id]);

  async function kartlaOde() {
    setHata("");
    if (!onay) { setHata("Abonelik koşullarını onaylayın."); return; }
    setBekle(true);
    const { data: o } = await supabase.auth.getSession();
    const r = await fetch("/.netlify/functions/qr-odeme-baslat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${o?.session?.access_token || ""}` }, body: JSON.stringify({ donem, sozlesme_onay: true }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { setHata(j.error || "Ödeme başlatılamadı."); setBekle(false); return; }
    window.location.href = j.url;
  }
  async function havaleBildir() {
    setHata("");
    if (!onay) { setHata("Abonelik koşullarını onaylayın."); return; }
    setBekle(true);
    const { error } = await supabase.from("qr_odemeler").insert({ menu_id: menu.id, olusturan_id: kullaniciId, donem, tutar, toplam, yontem: "havale", durum: "bekliyor", sozlesme_onay: true });
    setBekle(false);
    if (error) { setHata("Bildirim gönderilemedi: " + error.message); return; }
    yukle(); yenile?.();
  }

  const renk = d?.doldu ? "#ef4444" : d && d.kalan <= 3 ? "#f59e0b" : "#10b981";
  return (
    <div style={{ background: T.bgCard, border: `1.5px solid ${d?.doldu ? "rgba(239,68,68,.5)" : T.border}`, borderRadius: 18, padding: 20, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: renk, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: T.textPrimary }}>
            {!d ? "Abonelik" : d.doldu ? "Abonelik süreniz doldu" : d.deneme ? `Ücretsiz deneme: ${d.kalan} gün kaldı` : `Aboneliğiniz aktif: ${d.kalan} gün kaldı`}
          </div>
          <div style={{ fontSize: 12.5, color: T.textMuted, marginTop: 2 }}>
            {d && (d.doldu
              ? (d.kapanis > 0 ? `Menünüzü şu an düzenleyemezsiniz. Ödeme yapılmazsa menünüz ${d.kapanis} gün sonra misafirlerinize kapanır.` : "Menünüz misafirlerinize kapalı. Ödeme yapınca aynı adresle yeniden açılır.")
              : `Bitiş: ${tarihYaz(menu.abonelik_bitis)}`)}
          </div>
        </div>
      </div>

      {bekleyen ? (
        <div style={{ fontSize: 13.5, color: T.textPrimary, background: "rgba(16,185,129,.1)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.55 }}>
          Havale bildiriminiz alındı ({bekleyen.donem === "yillik" ? "yıllık" : "aylık"}, {tl(Number(bekleyen.toplam))}). Ödeme hesabımıza ulaşınca onaylanır ve süreniz uzar; genellikle aynı iş günü.
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[["aylik", "Aylık", fiyat.aylik, ""], ["yillik", "Yıllık", fiyat.yillik, "2 ay bedava"]].map(([k, ad, t, not_]) => (
              <button key={k} type="button" onClick={() => setDonem(k)} style={{ textAlign: "left", padding: "12px 14px", borderRadius: 14, cursor: "pointer", fontFamily: "inherit", background: donem === k ? "rgba(242,81,36,.12)" : T.bgInput, border: `2px solid ${donem === k ? T.amber : T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted }}>{ad}{not_ && <span style={{ marginLeft: 6, color: T.amber }}>· {not_}</span>}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: T.textPrimary }}>{tl(t)} <span style={{ fontSize: 11.5, fontWeight: 600, color: T.textMuted }}>+ KDV</span></div>
              </button>
            ))}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: T.textSecondary, lineHeight: 1.5, cursor: "pointer", marginBottom: 12 }}>
            <input type="checkbox" checked={onay} onChange={(e) => setOnay(e.target.checked)} style={{ marginTop: 3 }} />
            <span><a href="/qr-menu#kosullar" target="_blank" rel="noopener" style={{ color: T.amber }}>Abonelik koşullarını</a> okudum, kabul ediyorum. Ödenecek tutar: <b style={{ color: T.textPrimary }}>{tl(toplam)}</b> (KDV dahil)</span>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {ayar?.kart && <button type="button" onClick={kartlaOde} disabled={bekle} style={{ flex: "1 1 160px", padding: "12px 14px", borderRadius: 12, border: "none", background: T.amber, color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{bekle ? "Yönlendiriliyor…" : "Kartla öde"}</button>}
            <button type="button" onClick={() => setHavaleAcik((x) => !x)} style={{ flex: "1 1 160px", padding: "12px 14px", borderRadius: 12, background: ayar?.kart ? T.bgInput : T.amber, color: ayar?.kart ? T.textPrimary : "#fff", border: ayar?.kart ? `1px solid ${T.border}` : "none", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Havale / EFT ile öde</button>
          </div>
          {havaleAcik && ayar?.havale && (
            <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 14, background: T.bgInput, border: `1px solid ${T.border}`, fontSize: 13.5, color: T.textPrimary, lineHeight: 1.7 }}>
              <div><span style={{ color: T.textMuted }}>Banka:</span> {ayar.havale.banka}</div>
              <div><span style={{ color: T.textMuted }}>Alıcı:</span> {ayar.havale.sahip}</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><span style={{ color: T.textMuted }}>IBAN:</span> <b style={{ letterSpacing: ".02em" }}>{ayar.havale.iban.replace(/(.{4})/g, "$1 ").trim()}</b>
                <button type="button" onClick={() => navigator.clipboard?.writeText(ayar.havale.iban)} style={{ fontSize: 11.5, padding: "3px 9px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.bgCard, color: T.textSecondary, cursor: "pointer" }}>Kopyala</button></div>
              <div><span style={{ color: T.textMuted }}>Tutar:</span> <b>{tl(toplam)}</b> · <span style={{ color: T.textMuted }}>Açıklama:</span> <b>QR {menu.slug}</b></div>
              <button type="button" onClick={havaleBildir} disabled={bekle} style={{ marginTop: 10, width: "100%", padding: "11px 14px", borderRadius: 12, border: "none", background: "#10b981", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{bekle ? "Gönderiliyor…" : "Ödemeyi yaptım, bildir"}</button>
            </div>
          )}
        </>
      )}
      {hata && <div style={{ marginTop: 10 }}><Hata>{hata}</Hata></div>}
    </div>
  );
}

// İşletmeye profesyonel ürün çekimini hatırlatır; teklif isteği Panormos'un WhatsApp'ına hazır mesajla gelir
const PANORMOS_WA = "905364716012";
const cekimTeklifi = (ad) => `https://wa.me/${PANORMOS_WA}?text=${encodeURIComponent(`Merhaba, ${ad || "işletmem"} menüsü için profesyonel ürün çekimi teklifi almak istiyorum.`)}`;

function HosGeldin({ ad, kapat }) {
  return (
    <div onClick={kapat} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(8,10,14,.62)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 460, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 22, overflow: "hidden", boxShadow: "0 30px 80px -30px rgba(0,0,0,.6)" }}>
        <div style={{ height: 150, background: "url(https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&h=320&fit=crop&q=70&auto=format) center/cover", position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.55))" }} />
          <div style={{ position: "absolute", left: 22, bottom: 16, color: "#fff", fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Hoş geldiniz{ad ? `, ${ad}` : ""}</div>
        </div>
        <div style={{ padding: "20px 22px 22px" }}>
          <p style={{ fontSize: 14.5, lineHeight: 1.6, color: T.textPrimary, margin: "0 0 8px", fontWeight: 600 }}>Menünüzü buradan düzenleyebilirsiniz: ürün, fiyat, açıklama ve fotoğraf eklemek birkaç saniye sürer.</p>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, color: T.textSecondary, margin: "0 0 18px" }}>Menünüz için <b style={{ color: T.amber }}>profesyonel ürün çekimi</b> yaptırmak için bizden teklif almayı unutmayın. İyi çekilmiş fotoğraflar menüyü iştah açıcı gösterir ve siparişi artırır.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href={cekimTeklifi(ad)} target="_blank" rel="noopener" style={{ flex: "1 1 180px", textAlign: "center", padding: "12px 14px", borderRadius: 12, background: "#25D366", color: "#fff", fontWeight: 800, fontSize: 14, textDecoration: "none" }}>Çekim teklifi al</a>
            <button onClick={kapat} style={{ flex: "1 1 140px", padding: "12px 14px", borderRadius: 12, background: T.bgInput, color: T.textPrimary, border: `1px solid ${T.border}`, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Menüme geç</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function QrMusteriPanelSayfa() {
  const [durum, setDurum] = useState("yukleniyor"); // yukleniyor | yok | tamam
  const [menu, setMenu] = useState(null);
  const [kullaniciId, setKullaniciId] = useState("");
  const odemeSonucu = new URLSearchParams(window.location.search).get("odeme");
  // Hoş geldin penceresi her girişte bir kez (aynı oturumda sayfa yenilenince tekrar çıkmaz)
  const [hosGeldin, setHosGeldin] = useState(() => { try { return !sessionStorage.getItem("qr_hosgeldin_goruldu"); } catch (e) { return true; } });
  const hosGeldinKapat = () => { setHosGeldin(false); try { sessionStorage.setItem("qr_hosgeldin_goruldu", "1"); } catch (e) {} };

  useEffect(() => {
    (async () => {
      const { data: oturum } = await supabase.auth.getSession();
      if (!oturum?.session) { window.location.href = "/menu-giris"; return; }
      setKullaniciId(oturum.session.user.id);
      await menuYukle(oturum.session.user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function menuYukle(uid) {
    const { data } = await supabase.from("qr_menuler").select("*").eq("sahip_user_id", uid || kullaniciId).maybeSingle();
    if (!data) { setDurum("yok"); return; }
    setMenu(data); setDurum("tamam");
  }

  async function cikisYap() {
    try { sessionStorage.removeItem("qr_hosgeldin_goruldu"); } catch (e) {}
    await supabase.auth.signOut();
    window.location.href = "/menu-giris";
  }

  if (durum === "yukleniyor") return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, color: T.textMuted, fontFamily: "'Inter',-apple-system,sans-serif" }}>Yükleniyor…</div>;
  if (durum === "yok") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, padding: 20, fontFamily: "'Inter',-apple-system,sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: "center", color: T.textSecondary }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary, marginBottom: 10 }}>Hesabınıza bağlı bir menü bulunamadı</div>
          <p style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 18 }}>Bu durumda genellikle bağlantı henüz kurulmamıştır. Panormos Medya ile iletişime geçin.</p>
          <button onClick={cikisYap} style={{ background: "none", border: `1px solid ${T.border}`, color: T.textSecondary, borderRadius: 10, padding: "9px 16px", cursor: "pointer", fontFamily: "inherit" }}>Çıkış yap</button>
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: "100vh", background: T.bg, padding: "20px 16px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 14 }}>QR Menü — <b style={{ color: T.textPrimary }}>{menu.ad}</b></div>
        <a href={cekimTeklifi(menu.ad)} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, padding: "12px 16px", borderRadius: 14, textDecoration: "none", background: "linear-gradient(110deg, rgba(242,81,36,.16), rgba(242,81,36,.05))", border: `1px solid rgba(242,81,36,.35)` }}>
          <span style={{ fontSize: 13.5, color: T.textPrimary, lineHeight: 1.45, flex: 1 }}><b>Profesyonel ürün çekimi</b> ile menünüz daha iştah açıcı görünsün. Panormos Medya'dan teklif alın.</span>
          <span style={{ flexShrink: 0, fontSize: 13, fontWeight: 800, color: T.amber }}>Teklif al →</span>
        </a>
        {odemeSonucu && (
          <div style={{ marginBottom: 14 }}>
            {odemeSonucu === "basarili" ? <Bilgi>Ödemeniz alındı, aboneliğiniz uzatıldı. Teşekkür ederiz.</Bilgi> : <Hata>Ödeme tamamlanamadı. Kart bilgilerinizi kontrol edip tekrar deneyin ya da havale ile ödeyin.</Hata>}
          </div>
        )}
        {(menu.kendi_kaydi || menu.abonelik_bitis) && <Abonelik menu={menu} kullaniciId={kullaniciId} yenile={() => menuYukle()} />}
        {abonelikDurumu(menu)?.doldu ? (
          <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 18, padding: 28, textAlign: "center", color: T.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
            Abonelik süreniz dolduğu için menünüzü şu an düzenleyemezsiniz.<br />Ödemeniz onaylanınca ürünleriniz ve ayarlarınız olduğu gibi geri gelir.
            <div style={{ marginTop: 12 }}><a href={`/m/${menu.slug}`} target="_blank" rel="noopener" style={{ color: T.amber, fontWeight: 700 }}>Menünüzü görüntüleyin ↗</a></div>
          </div>
        ) : (
          <MenuDuzenle menuId={menu.id} clients={[]} musteriModu onGeri={cikisYap} />
        )}
        {hosGeldin && <HosGeldin ad={menu.ad} kapat={hosGeldinKapat} />}
      </div>
    </div>
  );
}
