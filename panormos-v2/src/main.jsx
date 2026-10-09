import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// Beklenmeyen bir ekran hatasında boş sayfa yerine açıklama ve yenileme düğmesi gösterir
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Panel hatası:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    const light = document.documentElement.getAttribute("data-theme") === "light";
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: light ? "#F3F5F9" : "#0A111D", fontFamily: "'Inter',-apple-system,'Segoe UI',sans-serif" }}>
        <div style={{ maxWidth: 460, textAlign: "center", background: light ? "#FFFFFF" : "#101927", border: `1px solid ${light ? "#DFE5EE" : "#1D2A3F"}`, borderRadius: 16, padding: "36px 28px" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: light ? "#0F1B2D" : "#F1F5FA", marginBottom: 10 }}>Bu ekran açılırken bir sorun oluştu</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, color: light ? "#44556B" : "#A2B4C9", marginBottom: 8 }}>Verileriniz güvende. Sayfayı yenilemek çoğu zaman sorunu giderir; devam ederse Ana Sayfa'ya dönün.</div>
          <div style={{ fontSize: 11.5, color: light ? "#728196" : "#6C8098", marginBottom: 22, wordBreak: "break-word" }}>Hata: {String(this.state.error?.message || this.state.error)}</div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: "#F25124", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Sayfayı Yenile</button>
            <button onClick={() => { try { localStorage.setItem("currentPage", "dashboard"); } catch (e) {} window.location.hash = "dashboard"; window.location.reload(); }} style={{ padding: "10px 18px", borderRadius: 9, border: `1px solid ${light ? "#C5CFDD" : "#2B3B55"}`, background: "transparent", color: light ? "#44556B" : "#A2B4C9", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Ana Sayfa'ya Dön</button>
          </div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>)
