import { useState } from 'react'
import { supabase } from './supabaseClient'

const T = {
  bg: "#0D1219", bgCard: "#121A25", border: "#1E2E42", bgInput: "#0A1018",
  indigo: "#223A59", amber: "#F25124", textPrimary: "#EEF3F9",
  textSecondary: "#7A9BB8", textMuted: "#405A73", white: "#FFFFFF", red: "#EF4444",
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError("E-posta veya şifre hatalı.")
      setLoading(false)
      return
    }

    // Fetch staff profile to know role
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('auth_id', data.user.id)
      .single()

    if (staffError || !staffData) {
      setError("Hesabınız sisteme tanımlı değil. Yöneticinizle iletişime geçin.")
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    setLoading(false)
    onLogin(staffData)
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      height: "100vh", background: T.bg, fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
        padding: 36, width: 360,
      }}>
        <div style={{ marginBottom: 28 }}>
          <svg viewBox="0 0 190 56" width="160" height="48">
            <text x="2" y="22" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="22" fill="#7DA4C7" letterSpacing="-0.5">panormos</text>
            <text x="2" y="50" fontFamily="Arial Black, sans-serif" fontWeight="900" fontSize="28" fill="#F25124" letterSpacing="-0.5">medya.</text>
          </svg>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>Ajans Yönetim Paneli</div>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, color: T.textMuted, display: "block", marginBottom: 5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>E-posta</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: "100%", background: T.bgInput, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.textPrimary,
                outline: "none", boxSizing: "border-box",
              }}
              placeholder="ornek@panormosmedya.com"
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 11, color: T.textMuted, display: "block", marginBottom: 5, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em" }}>Şifre</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%", background: T.bgInput, border: `1px solid ${T.border}`,
                borderRadius: 8, padding: "10px 12px", fontSize: 14, color: T.textPrimary,
                outline: "none", boxSizing: "border-box",
              }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: `1px solid ${T.red}44`,
              borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#FCA5A5",
              marginBottom: 16,
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading} style={{
            width: "100%", background: T.amber, color: T.white, border: "none",
            borderRadius: 9, padding: "11px", fontSize: 14, fontWeight: 600,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1,
          }}>
            {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  )
}
