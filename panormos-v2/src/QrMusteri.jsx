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
      </div>
    </Kabuk>
  );
}

export function QrMusteriPanelSayfa() {
  const [durum, setDurum] = useState("yukleniyor"); // yukleniyor | yok | tamam
  const [menu, setMenu] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: oturum } = await supabase.auth.getSession();
      if (!oturum?.session) { window.location.href = "/menu-giris"; return; }
      const { data } = await supabase.from("qr_menuler").select("id, ad").eq("sahip_user_id", oturum.session.user.id).maybeSingle();
      if (!data) { setDurum("yok"); return; }
      setMenu(data); setDurum("tamam");
    })();
  }, []);

  async function cikisYap() {
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
        <MenuDuzenle menuId={menu.id} clients={[]} musteriModu onGeri={cikisYap} />
      </div>
    </div>
  );
}
