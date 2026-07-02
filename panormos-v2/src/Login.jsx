import { useState } from "react";
import { supabase } from "./supabaseClient";

const T = {
  bg: "#0D1219", bgCard: "#121A25", bgInput: "#0A1018",
  border: "#1E2E42", borderLight: "#263B55",
  amber: "#F25124", amberText: "#F8906E",
  green: "#10B981", greenText: "#6EE7B7",
  red: "#EF4444", redText: "#FCA5A5",
  textPrimary: "#EEF3F9", textSecondary: "#7A9BB8", textMuted: "#405A73", white: "#FFFFFF",
};

// Supabase hatalarını Türkçe'ye çevir
function translateError(msg) {
  if (!msg) return "Bir hata oluştu.";
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-posta veya şifre hatalı.";
  if (m.includes("email not confirmed")) return "E-posta henüz onaylanmamış.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Bu e-posta zaten kayıtlı. 'Giriş Yap' sekmesinden girin.";
  if (m.includes("password should be at least")) return "Şifre en az 6 karakter olmalı.";
  if (m.includes("unable to validate email") || m.includes("invalid email")) return "Geçersiz e-posta adresi.";
  if (m.includes("rate limit") || m.includes("too many")) return "Çok fazla deneme yaptınız. Biraz bekleyin.";
  return msg;
}

export default function Login({ onLogin }) {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const reset = () => { setError(""); setInfo(""); };

  const handleLogin = async () => {
    reset();
    if (!email || !password) { setError("E-posta ve şifre girin."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setLoading(false);
    if (error) { setError(translateError(error.message)); return; }
    if (onLogin) onLogin();
  };

  const handleSignup = async () => {
    reset();
    const mail = email.trim().toLowerCase();
    if (!mail || !password) { setError("E-posta ve şifre girin."); return; }
    if (password.length < 6) { setError("Şifre en az 6 karakter olmalı."); return; }
    if (password !== password2) { setError("Şifreler eşleşmiyor."); return; }

    setLoading(true);
    // Güvenlik: sadece yöneticinin eklediği (staff tablosunda olan) e-postalar kayıt olabilir
    const { data: matches, error: qErr } = await supabase
      .from('staff').select('id,name').ilike('email', mail).is('deleted_at', null).limit(1);
    if (qErr) { setLoading(false); setError("Sistem kontrolü başarısız. Tekrar deneyin."); return; }
    if (!matches || matches.length === 0) {
      setLoading(false);
      setError("Bu e-posta sistemde kayıtlı değil. Yöneticinizden sizi bu e-posta ile eklemesini isteyin.");
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email: mail, password });
    setLoading(false);
    if (error) { setError(translateError(error.message)); return; }

    // E-posta onayı kapalıysa otomatik giriş yapılır (session döner)
    if (data.session) {
      if (onLogin) onLogin();
    } else {
      // E-posta onayı açık: kullanıcıya bilgi ver
      setInfo("Kaydınız oluşturuldu! Şimdi 'Giriş Yap' sekmesinden e-posta ve şifrenizle giriş yapabilirsiniz.");
      setMode("login");
      setPassword(""); setPassword2("");
    }
  };

  const submit = () => { mode === "login" ? handleLogin() : handleSignup(); };
  const onKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Inter',-apple-system,sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            <span style={{ color: "#7DA4C7" }}>panormos</span> <span style={{ color: T.amber }}>medya.</span>
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, marginTop: 6 }}>Sosyal Medya Yönetim Paneli</div>
        </div>

        {/* Kart */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28 }}>
          {/* Sekmeler */}
          <div style={{ display: "flex", background: T.bgInput, borderRadius: 10, padding: 4, marginBottom: 22 }}>
            {[{ id: "login", l: "Giriş Yap" }, { id: "signup", l: "Kayıt Ol" }].map(t => (
              <button key={t.id} onClick={() => { setMode(t.id); reset(); }} style={{
                flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600, transition: "0.15s",
                background: mode === t.id ? T.amber : "transparent",
                color: mode === t.id ? "#fff" : T.textSecondary,
              }}>{t.l}</button>
            ))}
          </div>

          {mode === "signup" && (
            <div style={{ fontSize: 12, color: T.textSecondary, background: "rgba(242,81,36,0.08)", border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 16, lineHeight: 1.5 }}>
              💡 Yöneticinizin sizi eklediği <strong style={{ color: T.amberText }}>e-posta adresi</strong> ile kayıt olun ve kendi şifrenizi belirleyin.
            </div>
          )}

          {/* Form */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600, display: "block", marginBottom: 6 }}>E-posta</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} placeholder="mail@ornek.com" autoComplete="email" style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600, display: "block", marginBottom: 6 }}>Şifre</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} placeholder={mode === "signup" ? "En az 6 karakter" : "Şifreniz"} autoComplete={mode === "signup" ? "new-password" : "current-password"} style={inputStyle} />
            </div>
            {mode === "signup" && (
              <div>
                <label style={{ fontSize: 12, color: T.textSecondary, fontWeight: 600, display: "block", marginBottom: 6 }}>Şifre (Tekrar)</label>
                <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} onKeyDown={onKey} placeholder="Şifrenizi tekrar girin" autoComplete="new-password" style={inputStyle} />
              </div>
            )}

            {error && <div style={{ fontSize: 12.5, color: T.redText, background: "rgba(239,68,68,0.1)", border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>⚠️ {error}</div>}
            {info && <div style={{ fontSize: 12.5, color: T.greenText, background: "rgba(16,185,129,0.1)", border: `1px solid rgba(16,185,129,0.3)`, borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>✓ {info}</div>}

            <button onClick={submit} disabled={loading} style={{
              marginTop: 4, padding: "12px 0", borderRadius: 10, border: "none",
              background: loading ? T.textMuted : T.amber, color: "#fff",
              fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", transition: "0.15s",
            }}>
              {loading ? "Lütfen bekleyin..." : mode === "login" ? "Giriş Yap" : "Kayıt Ol"}
            </button>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: 11, color: T.textMuted, marginTop: 20 }}>
          © 2026 Panormos Medya · Tüm hakları saklıdır
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10,
  padding: "11px 14px", color: "#EEF3F9", fontSize: 14, outline: "none", boxSizing: "border-box",
};
