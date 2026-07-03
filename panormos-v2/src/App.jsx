import { useState, useRef, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";

// ─────────────────────────────────────────────
// GOOGLE DRIVE AYARLARI
// ─────────────────────────────────────────────
const GOOGLE_CLIENT_ID = "443896142639-835q2tfpo4cr4tem933v5pkg1f3kk80r.apps.googleusercontent.com";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/drive.file";

let googleTokenClient = null;
let googleAccessToken = null;

// Google Identity Services script'ini yükle
function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google script yüklenemedi"));
    document.body.appendChild(script);
  });
}

// Google'a giriş yap ve access token al
function getGoogleAccessToken() {
  return new Promise(async (resolve, reject) => {
    try {
      await loadGoogleScript();

      if (!googleTokenClient) {
        googleTokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: GOOGLE_SCOPE,
          callback: (response) => {
            if (response.access_token) {
              googleAccessToken = response.access_token;
              resolve(response.access_token);
            } else {
              reject(new Error("Access token alınamadı"));
            }
          },
          error_callback: (err) => {
            reject(new Error("Google giriş iptal edildi veya hata oluştu"));
          },
        });
      } else {
        googleTokenClient.callback = (response) => {
          if (response.access_token) {
            googleAccessToken = response.access_token;
            resolve(response.access_token);
          } else {
            reject(new Error("Access token alınamadı"));
          }
        };
      }

      googleTokenClient.requestAccessToken({ prompt: googleAccessToken ? "" : "consent" });
    } catch (err) {
      reject(err);
    }
  });
}

// Panormos klasörünü bul veya oluştur, klasör ID'sini döndür
async function getPanormosFolder(token) {
  // Önce "Panormos Medya" adlı klasör var mı ara
  const searchRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=" +
      encodeURIComponent("name='Panormos Medya' and mimeType='application/vnd.google-apps.folder' and trashed=false") +
      "&fields=files(id,name)",
    { headers: { Authorization: "Bearer " + token } }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Yoksa oluştur
  const createRes = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Panormos Medya",
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const createData = await createRes.json();
  return createData.id;
}

// Dosyayı Google Drive'a yükle
async function uploadFileToGoogleDrive(token, file, folderId) {
  const metadata = {
    name: file.name,
    parents: folderId ? [folderId] : [],
  };

  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: form,
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error("Drive yükleme hatası: " + errText);
  }

  return await res.json();
}

const T = {
  bg: "#0D1219", bgCard: "#121A25", bgCardHover: "#172030", bgSurface: "#1A2535", bgInput: "#0A1018",
  border: "#1E2E42", borderLight: "#263B55",
  indigo: "#223A59", indigoDim: "#1A2D47", indigoGlow: "rgba(34,58,89,0.35)", indigoText: "#7DA4C7",
  amber: "#F25124", amberDim: "rgba(242,81,36,0.15)", amberText: "#F8906E",
  green: "#10B981", greenDim: "rgba(16,185,129,0.15)", greenText: "#6EE7B7",
  red: "#EF4444", redDim: "rgba(239,68,68,0.12)", redText: "#FCA5A5",
  violet: "#F25124", violetDim: "rgba(242,81,36,0.12)", violetText: "#F8906E",
  textPrimary: "#EEF3F9", textSecondary: "#7A9BB8", textMuted: "#405A73", white: "#FFFFFF",
};

const platformConfig = {
  ig: { label: "Instagram", color: "#E1306C", bg: "rgba(225,48,108,0.12)", icon: "IG" },
  tk: { label: "TikTok", color: "#69C9D0", bg: "rgba(105,201,208,0.12)", icon: "TK" },
  li: { label: "LinkedIn", color: "#0A66C2", bg: "rgba(10,102,194,0.15)", icon: "LI" },
  tw: { label: "Twitter/X", color: "#8B8B8B", bg: "rgba(139,139,139,0.12)", icon: "X" },
  yt: { label: "YouTube", color: "#FF0000", bg: "rgba(255,0,0,0.12)", icon: "YT" },
  fb: { label: "Facebook", color: "#1877F2", bg: "rgba(24,119,242,0.12)", icon: "FB" },
};

// Paylaşım (görevden) platformları ve içerik türleri — kota + paylaşım kaydı ortak kullanır
const PUBLISH_PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X (Twitter)" },
];
const PUBLISH_CONTENT_TYPES = [
  { id: "post", label: "Post" },
  { id: "reels", label: "Reels" },
  { id: "carousel", label: "Kaydırmalı" },
  { id: "story", label: "Hikaye" },
];
const platLabel = (id) => PUBLISH_PLATFORMS.find(p => p.id === id)?.label || platformConfig[id]?.label || id;
const typeLabel = (id) => PUBLISH_CONTENT_TYPES.find(t => t.id === id)?.label || id;

// Detaylı kota editörü — platform x içerik türü tablosu
function QuotaEditor({ value, onChange }) {
  const val = value || {};
  const setCell = (plat, type, num) => {
    const next = JSON.parse(JSON.stringify(val));
    if (!next[plat]) next[plat] = {};
    if (num > 0) next[plat][type] = num; else delete next[plat][type];
    if (Object.keys(next[plat]).length === 0) delete next[plat];
    onChange(next);
  };
  const inp = { width: "100%", background: "#0A1018", border: "1px solid #1E2E42", borderRadius: 6, padding: "6px 4px", color: "#EEF3F9", fontSize: 12, outline: "none", textAlign: "center", boxSizing: "border-box" };
  return (
    <div style={{ overflowX: "auto", border: "1px solid #1E2E42", borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
        <thead>
          <tr style={{ background: "#1A2535" }}>
            <th style={{ fontSize: 11, color: "#7A9BB8", fontWeight: 600, textAlign: "left", padding: "8px 10px" }}>Platform</th>
            {PUBLISH_CONTENT_TYPES.map(ct => <th key={ct.id} style={{ fontSize: 10, color: "#7A9BB8", fontWeight: 600, padding: "8px 4px", minWidth: 56 }}>{ct.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PUBLISH_PLATFORMS.map((p, i) => {
            const rowTotal = PUBLISH_CONTENT_TYPES.reduce((s, ct) => s + (val[p.id]?.[ct.id] || 0), 0);
            return (
              <tr key={p.id} style={{ borderTop: "1px solid #1E2E42", background: rowTotal > 0 ? "rgba(242,81,36,0.06)" : "transparent" }}>
                <td style={{ fontSize: 12, color: "#EEF3F9", fontWeight: rowTotal > 0 ? 600 : 400, padding: "6px 10px" }}>{p.label}</td>
                {PUBLISH_CONTENT_TYPES.map(ct => (
                  <td key={ct.id} style={{ padding: "5px 4px" }}>
                    <input type="number" min="0" placeholder="0" value={val[p.id]?.[ct.id] || ""} onChange={e => setCell(p.id, ct.id, parseInt(e.target.value) || 0)} style={inp} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CONTENT_TYPES = ["Reels", "Post", "Hikaye", "Kaydırmalı Post", "Yayına Alındı", "Yayından Kaldırıldı"];
const TR_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

const TASK_DELETE_REASONS = [
  { id: "completed", label: "Tamamlandı ve arşivlendi" },
  { id: "cancelled", label: "İptal edildi" },
  { id: "duplicate", label: "Tekrarlanan görev" },
  { id: "other", label: "Diğer" },
];

const CLIENT_DELETE_REASONS = [
  { id: "contract_ended", label: "Sözleşme süresi sona erdi" },
  { id: "business_closed", label: "İşletme kapatıldı" },
  { id: "non_payment", label: "Ödeme yapmamasından dolayı sonlandırıldı" },
];

// ─────────────────────────────────────────────
// EMOJİ SİSTEMİ
// ─────────────────────────────────────────────
const EMOJI_LIST = [
  "😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰",
  "😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳",
  "😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤",
  "😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫",
  "🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵",
  "🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠","😈","👿","👹","👺","🤡","💩",
  "👍","👎","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","✋",
  "🤚","🖐️","🖖","👋","🤝","👏","🙌","👐","🤲","🙏","💪","🦾","✍️","💅","👀","👁️",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖",
  "💘","💝","💯","💢","💥","💫","💦","💨","🔥","⭐","🌟","✨","⚡","☄️","💎","🎯",
  "✅","☑️","✔️","❌","❎","❓","❔","❗","❕","💡","📌","📍","🎉","🎊","🎈","🎁",
  "💰","💵","💴","💶","💷","🪙","📊","📈","📉","📅","📆","🗓️","⏰","⏱️","⌛","⏳",
  "📷","📸","🎥","🎬","📱","💻","🖥️","⌨️","🖱️","🖨️","✏️","📝","📎","📏","🔗","🚀",
  "☕","🍵","🍺","🍻","🥂","🍷","🎵","🎶","🔔","📢","📣","💬","💭","🗨️","👌","🆗",
];

// Emoji seçici düğmesi — herhangi bir metin alanına emoji eklemek için
function EmojiButton({ onSelect, size = 18 }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const pickerW = 300, pickerH = 260;
      let left = r.right - pickerW;              // butona sağ hizala
      if (left < 8) left = 8;
      let top = r.top - pickerH - 8;             // butonun üstünde aç
      if (top < 8) top = r.bottom + 8;           // yukarı sığmıyorsa altında aç
      setPos({ top, left });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        style={{
          background: "none", border: "none", cursor: "pointer", fontSize: size,
          padding: "2px 4px", lineHeight: 1, opacity: 0.85,
          fontFamily: "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif",
        }}
        title="Emoji ekle"
      >😊</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 3000 }} />
          <div style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 3001,
            background: T.bgSurface, border: `1px solid ${T.borderLight}`, borderRadius: 12,
            padding: 10, width: 300, height: 260, overflowY: "auto",
            display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4, alignContent: "start",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {EMOJI_LIST.map((emoji, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onSelect(emoji); setOpen(false); }}
                style={{
                  background: "none", border: "none", cursor: "pointer", fontSize: 22,
                  padding: 3, borderRadius: 6, transition: "background 0.1s", lineHeight: 1.2,
                  fontFamily: "'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif",
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgCardHover}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >{emoji}</button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// GÜN & SAAT SEÇİCİLER
// ─────────────────────────────────────────────
const DAYS_OF_WEEK = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

// Haftanın günlerini seçilebilir düğmeler olarak göster
function DaySelector({ selected = [], onChange, activeColor }) {
  const col = activeColor || T.amber;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {DAYS_OF_WEEK.map(day => {
        const sel = selected.includes(day);
        return (
          <span key={day} onClick={() => onChange(sel ? selected.filter(d => d !== day) : [...selected, day])}
            style={{
              fontSize: 12, fontWeight: sel ? 600 : 400, padding: "7px 12px", borderRadius: 8, cursor: "pointer",
              background: sel ? col : T.bgInput, color: sel ? T.white : T.textSecondary,
              border: `1px solid ${sel ? col : T.border}`, transition: "all 0.12s", userSelect: "none",
            }}>{day}</span>
        );
      })}
    </div>
  );
}

// Saatleri ekle/çıkar (HH:MM listesi)
function TimeSelector({ times = [], onChange }) {
  const [newTime, setNewTime] = useState("");
  const addTime = () => {
    if (newTime && !times.includes(newTime)) {
      onChange([...times, newTime].sort());
      setNewTime("");
    }
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: times.length > 0 ? 8 : 0 }}>
        <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)}
          style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: T.textPrimary, outline: "none" }} />
        <button type="button" onClick={addTime}
          style={{ background: T.indigo, color: "#A8C4DC", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Ekle</button>
      </div>
      {times.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {times.map(t => (
            <span key={t} onClick={() => onChange(times.filter(x => x !== t))}
              style={{ fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 6, cursor: "pointer", background: T.amberDim, color: T.amberText, border: `1px solid ${T.amber}44` }}
              title="Kaldırmak için tıkla">🕐 {t} ✕</span>
          ))}
        </div>
      )}
    </div>
  );
}

function getMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  let startWeekday = firstDay.getDay();
  startWeekday = startWeekday === 0 ? 6 : startWeekday - 1;

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ day: prevMonthLastDay - i, currentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const nextDay = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day: nextDay, currentMonth: false });
    if (cells.length >= 42) break;
  }
  return cells;
}

// Gün adını haftanın index'ine çevir (0=Pazartesi ... 6=Pazar)
function weekdayIndexOf(dayName) {
  const IDX = { Pazartesi: 0, Salı: 1, Çarşamba: 2, Perşembe: 3, Cuma: 4, Cumartesi: 5, Pazar: 6 };
  const map = {
    "pazartesi": "Pazartesi", "salı": "Salı", "sali": "Salı",
    "çarşamba": "Çarşamba", "carsamba": "Çarşamba",
    "perşembe": "Perşembe", "persembe": "Perşembe",
    "cuma": "Cuma", "cumartesi": "Cumartesi", "pazar": "Pazar",
  };
  const lower = (dayName || "").trim().toLocaleLowerCase("tr-TR");
  return IDX[map[lower] || (dayName || "").trim()];
}

// Müşteriye özel takvim (paylaşım/çekim günleri + paylaşımlar)
function ClientCalendar({ client }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  const cells = getMonthGrid(viewYear, viewMonth);
  const publishIdx = (client.publishDays || []).map(weekdayIndexOf).filter(i => i !== undefined);
  const shootIdx = (client.shootDays || []).map(weekdayIndexOf).filter(i => i !== undefined);
  const publishTimes = client.publishTimes || [];

  // Paylaşımları tarihe göre grupla (YYYY-MM-DD veya gün formatı)
  const postsByDate = {};
  (client.posts || []).forEach(p => {
    if (p.date) postsByDate[p.date] = (postsByDate[p.date] || []).concat(p);
  });

  // Gerçekleşen paylaşımları (görevden) tarihe göre grupla
  const publishesByDate = {};
  (client.publishesList || []).forEach(p => {
    if (p.publishedAt) {
      const d = new Date(p.publishedAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      publishesByDate[key] = (publishesByDate[key] || []).concat(p);
    }
  });

  const goPrev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const goNext = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const dayNames = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

  return (
    <div>
      {/* Özet üst bilgi */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160, background: "rgba(242,81,36,0.1)", border: `1px solid ${T.amber}44`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: T.amberText, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>📅 Paylaşım Günleri</div>
          <div style={{ fontSize: 13, color: T.textPrimary, fontWeight: 500 }}>{(client.publishDays || []).join(", ") || "Belirtilmemiş"}</div>
          {publishTimes.length > 0 && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>🕐 {publishTimes.join(", ")}</div>}
        </div>
        <div style={{ flex: 1, minWidth: 160, background: "rgba(236,72,153,0.1)", border: "1px solid #EC489944", borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#F9A8D4", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>📷 Çekim Günleri</div>
          <div style={{ fontSize: 13, color: T.textPrimary, fontWeight: 500 }}>{(client.shootDays || []).join(", ") || "Belirtilmemiş"}</div>
        </div>
      </div>

      {/* Takvim başlığı */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button onClick={goPrev} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", color: T.textSecondary, cursor: "pointer", fontSize: 14 }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, flex: 1 }}>{TR_MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={()=>printClientCalendar(client, viewYear, viewMonth, publishesByDate)} style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", color: T.textSecondary, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>🖨️ Yazdır</button>
        <button onClick={goToday} style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", color: T.amberText, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Bugün</button>
        <button onClick={goNext} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", color: T.textSecondary, cursor: "pointer", fontSize: 14 }}>›</button>
      </div>

      {/* Gün başlıkları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {dayNames.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: T.textMuted, padding: "4px 0" }}>{d}</div>)}
      </div>

      {/* Takvim hücreleri */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((cell, i) => {
          const weekday = i % 7;
          const isPublish = cell.currentMonth && publishIdx.includes(weekday);
          const isShoot = cell.currentMonth && shootIdx.includes(weekday);
          const dateStr = cell.currentMonth ? `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}` : null;
          const dayPosts = dateStr ? (postsByDate[dateStr] || []) : [];
          const dayPublishes = dateStr ? (publishesByDate[dateStr] || []) : [];
          const isToday = cell.currentMonth && cell.day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          let bg = T.bgCard, borderCol = T.border;
          if (isPublish && isShoot) { bg = "rgba(168,85,247,0.12)"; borderCol = "#A855F7"; }
          else if (isPublish) { bg = "rgba(242,81,36,0.12)"; borderCol = `${T.amber}66`; }
          else if (isShoot) { bg = "rgba(236,72,153,0.12)"; borderCol = "#EC489966"; }
          if (dayPublishes.length > 0) { bg = "rgba(16,185,129,0.14)"; borderCol = "#10B98188"; }

          return (
            <div key={i} onClick={()=>{ if(cell.currentMonth) setSelectedDay({day:cell.day, isPublish, isShoot, dayPosts, dayPublishes, dateStr}); }} style={{
              minHeight: 66, borderRadius: 8, padding: "6px 7px", background: cell.currentMonth ? bg : "transparent",
              border: `1px solid ${isToday ? T.amber : (cell.currentMonth ? borderCol : "transparent")}`, opacity: cell.currentMonth ? 1 : 0.3,
              cursor: cell.currentMonth ? "pointer" : "default",
            }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.amberText : T.textSecondary, marginBottom: 3 }}>{cell.day}</div>
              {isPublish && <div style={{ fontSize: 8, fontWeight: 700, color: T.amberText, marginBottom: 1 }}>📅 Paylaşım</div>}
              {isShoot && <div style={{ fontSize: 8, fontWeight: 700, color: "#F9A8D4" }}>📷 Çekim</div>}
              {dayPublishes.map((p, pi) => (
                <div key={"pub"+pi} style={{ fontSize: 8, fontWeight: 700, color: T.greenText, background: "rgba(16,185,129,0.18)", borderRadius: 4, padding: "1px 4px", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>✅ {new Date(p.publishedAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})} {p.contentType}</div>
              ))}
              {dayPosts.map((p, pi) => (
                <div key={pi} style={{ fontSize: 8, color: T.textPrimary, background: T.bgSurface, borderRadius: 4, padding: "1px 4px", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={p.title}>{platformConfig[p.platform]?.icon || "•"} {p.title}</div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Açıklama */}
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, color: T.textMuted, flexWrap: "wrap" }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "rgba(242,81,36,0.4)", marginRight: 5, verticalAlign: "middle" }} />Paylaşım günü</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "rgba(236,72,153,0.4)", marginRight: 5, verticalAlign: "middle" }} />Çekim günü</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "rgba(168,85,247,0.4)", marginRight: 5, verticalAlign: "middle" }} />İkisi birden</span>
      </div>

      {/* Gün Detay Modalı */}
      {selectedDay && (
        <Modal title={`${selectedDay.day} ${TR_MONTHS[viewMonth]} ${viewYear} — ${client.name}`} onClose={() => setSelectedDay(null)} width={520}>
          {!selectedDay.isPublish && !selectedDay.isShoot && selectedDay.dayPosts.length === 0 && (!selectedDay.dayPublishes || selectedDay.dayPublishes.length === 0) ? (
            <div style={{ textAlign: "center", color: T.textMuted, fontSize: 13, padding: "30px 0" }}>Bu gün için plan yok 📭</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {selectedDay.dayPublishes && selectedDay.dayPublishes.length > 0 && (
                <div style={{ padding: "14px 16px", background: "rgba(16,185,129,0.1)", borderRadius: 10, borderLeft: "3px solid #10B981" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.greenText, marginBottom: 8 }}>✅ Yapılan Paylaşımlar ({selectedDay.dayPublishes.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedDay.dayPublishes.map((p, pi) => {
                      const ctLabel = {post:"Post",reels:"Reels",carousel:"Kaydırmalı Post",story:"Hikaye"}[p.contentType]||p.contentType;
                      return (
                        <div key={pi} style={{ padding: "8px 12px", background: T.bgInput, borderRadius: 8, fontSize: 12 }}>
                          <div style={{ color: T.textPrimary, fontWeight: 600 }}>{platformConfig[p.platform]?.label || p.platform} · {ctLabel}</div>
                          <div style={{ color: T.textMuted, fontSize: 11, marginTop: 2 }}>🕐 {new Date(p.publishedAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {selectedDay.isPublish && (
                <div style={{ padding: "14px 16px", background: "rgba(242,81,36,0.1)", borderRadius: 10, borderLeft: `3px solid ${T.amber}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.amberText, marginBottom: 6 }}>📅 Paylaşım Günü (planlı)</div>
                  {client.publishTimes && client.publishTimes.length > 0 ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {client.publishTimes.map(t => <span key={t} style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: T.amberDim, color: T.amberText }}>🕐 {t}</span>)}
                    </div>
                  ) : <div style={{ fontSize: 12, color: T.textMuted }}>Saat belirtilmemiş</div>}
                  {client.platforms.length > 0 && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>Platformlar: {client.platforms.map(p => platformConfig[p]?.label).join(", ")}</div>}
                </div>
              )}
              {selectedDay.isShoot && (
                <div style={{ padding: "14px 16px", background: "rgba(236,72,153,0.1)", borderRadius: 10, borderLeft: "3px solid #EC4899" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#F9A8D4", marginBottom: 4 }}>📷 Çekim Günü</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>Bu gün {client.name} için çekim planlanmış</div>
                </div>
              )}
              {selectedDay.dayPosts.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 8 }}>📱 Bu Güne Planlanan Paylaşımlar</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedDay.dayPosts.map((p, pi) => (
                      <div key={pi} style={{ padding: "10px 12px", background: T.bgInput, borderRadius: 8, border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{platformConfig[p.platform]?.label || p.platform} · {p.type}</div>
                        <div style={{ fontSize: 12, color: T.textSecondary, marginTop: 2 }}>{p.title}</div>
                        {p.description && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{p.description}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

const ENC_KEY = "panormos-medya-2026-secure-key";
function encryptText(text) {
  if (!text) return "";
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(text.charCodeAt(i) ^ ENC_KEY.charCodeAt(i % ENC_KEY.length));
  }
  return btoa(unescape(encodeURIComponent(result)));
}

function decryptText(encoded) {
  if (!encoded) return "";
  try {
    const text = decodeURIComponent(escape(atob(encoded)));
    let result = "";
    for (let i = 0; i < text.length; i++) {
      result += String.fromCharCode(text.charCodeAt(i) ^ ENC_KEY.charCodeAt(i % ENC_KEY.length));
    }
    return result;
  } catch (e) {
    return "";
  }
}

// ─────────────────────────────────────────────
// KUSURSUZ EXCEL - Gerçek .xlsx (renkli, biçimli)
// ─────────────────────────────────────────────

// SheetJS (stil destekli ücretsiz sürüm) kütüphanesini dinamik yükle
function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Excel kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin."));
    document.head.appendChild(script);
  });
}

// Bir sayfayı (sheet) profesyonel biçimlendir: başlık satırı renkli, sütun genişliği otomatik
function styleWorksheet(XLSX, ws, headers, rows, titleText) {
  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Otomatik sütun genişliği (içeriğe göre)
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = String(h).length;
    rows.forEach(row => {
      const val = row[h] === null || row[h] === undefined ? "" : String(row[h]);
      if (val.length > maxLen) maxLen = val.length;
    });
    return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
  });
  ws["!cols"] = colWidths;

  // Satır yükseklikleri
  ws["!rows"] = [];
  for (let r = 0; r <= range.e.r; r++) {
    ws["!rows"][r] = { hpt: r === 0 ? 26 : 20 };
  }

  // Hücre stilleri
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellRef]) continue;

      if (R === 0) {
        // Başlık satırı — turuncu arka plan, beyaz kalın yazı
        ws[cellRef].s = {
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" },
          fill: { fgColor: { rgb: "F25124" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: {
            top: { style: "thin", color: { rgb: "D9D9D9" } },
            bottom: { style: "thin", color: { rgb: "D9D9D9" } },
            left: { style: "thin", color: { rgb: "D9D9D9" } },
            right: { style: "thin", color: { rgb: "D9D9D9" } },
          },
        };
      } else {
        // Veri satırları — zebra deseni (tek/çift satır)
        const isEven = R % 2 === 0;
        ws[cellRef].s = {
          font: { color: { rgb: "1A1A1A" }, sz: 10, name: "Calibri" },
          fill: { fgColor: { rgb: isEven ? "FEF0EB" : "FFFFFF" } },
          alignment: { horizontal: "left", vertical: "center", wrapText: false },
          border: {
            top: { style: "thin", color: { rgb: "EEEEEE" } },
            bottom: { style: "thin", color: { rgb: "EEEEEE" } },
            left: { style: "thin", color: { rgb: "EEEEEE" } },
            right: { style: "thin", color: { rgb: "EEEEEE" } },
          },
        };
      }
    }
  }
}

// Ana Excel oluşturma fonksiyonu
// sheets: [{ name, rows, title }]  → her biri ayrı sayfa olur
async function exportPerfectExcel(sheets, filename) {
  const validSheets = sheets.filter(s => s.rows && s.rows.length > 0);
  if (validSheets.length === 0) {
    alert("Dışa aktarılacak veri bulunamadı");
    return;
  }

  let XLSX;
  try {
    XLSX = await loadXLSX();
  } catch (err) {
    alert(err.message);
    return;
  }

  const wb = XLSX.utils.book_new();

  validSheets.forEach(sheet => {
    const headers = Object.keys(sheet.rows[0]);

    // Başlık metni için üstte boş satırlar bırak
    const titleRows = sheet.title ? 2 : 0;
    const ws = XLSX.utils.json_to_sheet(sheet.rows, {
      origin: titleRows > 0 ? `A${titleRows + 1}` : "A1",
    });

    // Başlık metnini ekle (varsa)
    if (sheet.title) {
      XLSX.utils.sheet_add_aoa(ws, [
        [sheet.title],
        ["İndirilme: " + new Date().toLocaleString("tr-TR")],
      ], { origin: "A1" });
    }

    styleWorksheet(XLSX, ws, headers, sheet.rows, sheet.title);

    // Başlık hücrelerini stille (üstteki 2 satır)
    if (sheet.title) {
      const titleCell = ws["A1"];
      if (titleCell) titleCell.s = { font: { bold: true, sz: 14, color: { rgb: "F25124" }, name: "Calibri" } };
      const dateCell = ws["A2"];
      if (dateCell) dateCell.s = { font: { italic: true, sz: 9, color: { rgb: "999999" }, name: "Calibri" } };
    }

    // Sayfa adı en fazla 31 karakter olabilir (Excel kuralı)
    const safeName = sheet.name.slice(0, 31).replace(/[:\\/?*\[\]]/g, "");
    XLSX.utils.book_append_sheet(wb, ws, safeName);
  });

  XLSX.writeFile(wb, filename);
}



// ─────────────────────────────────────────────
// YAZDIRMA FONKSİYONU - Yazıcıya gönderir
// ─────────────────────────────────────────────
function printData(title, rows) {
  if (!rows || rows.length === 0) {
    alert("Yazdırılacak veri bulunamadı");
    return;
  }

  const headers = Object.keys(rows[0]);
  const now = new Date().toLocaleString("tr-TR");

  const tableRows = rows.map(row =>
    "<tr>" + headers.map(h => {
      const val = row[h] === null || row[h] === undefined ? "—" : String(row[h]);
      return `<td>${val.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`;
    }).join("") + "</tr>"
  ).join("");

  const headerRow = "<tr>" + headers.map(h => `<th>${h}</th>`).join("") + "</tr>";

  const html = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1a1a1a; }
        .header { border-bottom: 3px solid #F25124; padding-bottom: 16px; margin-bottom: 20px; }
        .logo { font-size: 24px; font-weight: 700; }
        .logo .p { color: #1A2B3F; }
        .logo .m { color: #F25124; }
        h1 { font-size: 18px; margin-top: 8px; color: #333; }
        .meta { font-size: 12px; color: #888; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
        th { background: #1A2B3F; color: #fff; padding: 10px 8px; text-align: left; font-weight: 600; }
        td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) td { background: #f7f7f7; }
        .footer { margin-top: 24px; font-size: 11px; color: #aaa; text-align: center; border-top: 1px solid #e0e0e0; padding-top: 12px; }
        @media print {
          body { padding: 15px; }
          th { background: #1A2B3F !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          tr:nth-child(even) td { background: #f7f7f7 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo"><span class="p">panormos</span> <span class="m">medya.</span></div>
        <h1>${title}</h1>
        <div class="meta">Yazdırma Tarihi: ${now} · Toplam ${rows.length} kayıt</div>
      </div>
      <table>
        <thead>${headerRow}</thead>
        <tbody>${tableRows}</tbody>
      </table>
      <div class="footer">Panormos Medya Yönetim Paneli · panormosmedya.com</div>
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    alert("Yazdırma penceresi açılamadı. Tarayıcının pop-up engelleyicisini kapatın.");
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 300);
}

// Müşteri takvimini yazdır (aylık ızgara + planlı günler + yapılan paylaşımlar)
function printClientCalendar(client, year, month, publishesByDate) {
  const cells = getMonthGrid(year, month);
  const publishIdx = (client.publishDays || []).map(weekdayIndexOf).filter(i => i !== undefined);
  const shootIdx = (client.shootDays || []).map(weekdayIndexOf).filter(i => i !== undefined);
  const dayNames = ["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"];
  const typeLbl = {post:"Post",reels:"Reels",carousel:"Kaydırmalı",story:"Hikaye"};

  let cellsHtml = "";
  cells.forEach((cell, i) => {
    const weekday = i % 7;
    const isPub = cell.currentMonth && publishIdx.includes(weekday);
    const isShoot = cell.currentMonth && shootIdx.includes(weekday);
    const dateStr = cell.currentMonth ? `${year}-${String(month+1).padStart(2,"0")}-${String(cell.day).padStart(2,"0")}` : null;
    const pubs = dateStr ? (publishesByDate[dateStr] || []) : [];
    let inner = cell.currentMonth ? `<div class="daynum">${cell.day}</div>` : "";
    if (isPub) inner += `<div class="tag pub">Paylaşım Günü</div>`;
    if (isShoot) inner += `<div class="tag shoot">Çekim Günü</div>`;
    pubs.forEach(p => {
      const t = new Date(p.publishedAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});
      inner += `<div class="tag done">✓ ${t} ${typeLbl[p.contentType]||p.contentType}</div>`;
    });
    cellsHtml += `<td class="${cell.currentMonth ? "" : "empty"}">${inner}</td>`;
    if (weekday === 6) cellsHtml = cellsHtml; // satır sonu tablo tarafından yönetiliyor
  });
  // 7'li satırlara böl
  let rowsHtml = "";
  const tds = cellsHtml.match(/<td[\s\S]*?<\/td>/g) || [];
  for (let r = 0; r < tds.length; r += 7) {
    rowsHtml += "<tr>" + tds.slice(r, r+7).join("") + "</tr>";
  }

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${client.name} Takvim</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;padding:24px;color:#1a1a1a}
    .header{border-bottom:3px solid #F25124;padding-bottom:14px;margin-bottom:16px}
    .logo{font-size:22px;font-weight:700}.logo .p{color:#1A2B3F}.logo .m{color:#F25124}
    h1{font-size:16px;margin-top:6px;color:#333}
    .meta{font-size:12px;color:#888;margin-top:4px}
    .info{font-size:12px;color:#444;margin:10px 0;display:flex;gap:20px;flex-wrap:wrap}
    .info b{color:#F25124}
    table{width:100%;border-collapse:collapse;margin-top:12px;table-layout:fixed}
    th{background:#1A2B3F;color:#fff;padding:8px 4px;font-size:12px;border:1px solid #1A2B3F}
    td{border:1px solid #ddd;height:88px;vertical-align:top;padding:4px;font-size:10px}
    td.empty{background:#fafafa}
    .daynum{font-weight:700;font-size:12px;margin-bottom:3px}
    .tag{font-size:9px;border-radius:3px;padding:1px 4px;margin-bottom:2px;display:block}
    .tag.pub{background:#fde4dc;color:#c0392b}
    .tag.shoot{background:#fce4ec;color:#c2185b}
    .tag.done{background:#d4f5e4;color:#0a7a4a;font-weight:700}
    .footer{margin-top:20px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #e0e0e0;padding-top:10px}
    @media print{body{padding:12px}th{background:#1A2B3F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tag{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <div class="header">
      <div class="logo"><span class="p">panormos</span> <span class="m">medya.</span></div>
      <h1>${client.name} — ${TR_MONTHS[month]} ${year} Takvimi</h1>
      <div class="meta">Yazdırma Tarihi: ${new Date().toLocaleString("tr-TR")}</div>
    </div>
    <div class="info">
      <span>📅 Paylaşım Günleri: <b>${(client.publishDays||[]).join(", ")||"—"}</b></span>
      <span>📷 Çekim Günleri: <b>${(client.shootDays||[]).join(", ")||"—"}</b></span>
      ${client.publishTimes&&client.publishTimes.length?`<span>🕐 Saatler: <b>${client.publishTimes.join(", ")}</b></span>`:""}
    </div>
    <table>
      <thead><tr>${dayNames.map(d=>`<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="footer">Panormos Medya Yönetim Paneli · panormosmedya.com</div>
  </body></html>`;

  const w = window.open("", "_blank", "width=1000,height=750");
  if (!w) { alert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

// Müşteri detay sayfasını yazdır (tüm bilgiler + paylaşım sayımı)
function printClientDetail(client, perms) {
  const now = new Date();
  const thisMonthPub = (client.publishesList || []).filter(p => { if (!p.publishedAt) return false; const d = new Date(p.publishedAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  // Anlaşma karşılaştırması
  const quota = client.quotaDetail && Object.keys(client.quotaDetail).length > 0 ? client.quotaDetail : {};
  const actual = {};
  thisMonthPub.forEach(p => { if (!actual[p.platform]) actual[p.platform] = {}; actual[p.platform][p.contentType] = (actual[p.platform][p.contentType] || 0) + 1; });
  const platSet = new Set([...Object.keys(quota), ...Object.keys(actual)]);
  let compRowsHtml = "";
  platSet.forEach(plat => {
    const typeSet = new Set([...Object.keys(quota[plat] || {}), ...Object.keys(actual[plat] || {})]);
    typeSet.forEach(tp => {
      const q = quota[plat]?.[tp] || 0; const a = actual[plat]?.[tp] || 0; const over = a - q;
      const durum = over > 0 ? `+${over} fazla` : (q > 0 && a >= q ? "✓ tamam" : (q > 0 ? `${q - a} kaldı` : "—"));
      compRowsHtml += `<tr><td>${platLabel(plat)}</td><td>${typeLabel(tp)}</td><td class="c">${q || "—"}</td><td class="c b">${a}</td><td class="c">${durum}</td></tr>`;
    });
  });
  if (!compRowsHtml) compRowsHtml = `<tr><td colspan="5" style="text-align:center;color:#888">Anlaşma tanımlanmamış / bu ay paylaşım yok</td></tr>`;

  const totalInv = (client.invoices || []).reduce((s, i) => s + (i.total || 0), 0);
  const paidInv = (client.invoices || []).filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${client.name}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;padding:26px;color:#1a1a1a}
    .header{border-bottom:3px solid #F25124;padding-bottom:14px;margin-bottom:18px}
    .logo{font-size:22px;font-weight:700}.logo .p{color:#1A2B3F}.logo .m{color:#F25124}
    h1{font-size:18px;margin-top:8px;color:#222}
    .sub{font-size:13px;color:#777;margin-top:2px}
    .meta{font-size:11px;color:#aaa;margin-top:6px}
    .section{margin:18px 0}
    .section h2{font-size:13px;color:#F25124;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:5px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}
    .row{font-size:13px;padding:4px 0;display:flex;justify-content:space-between;border-bottom:1px dotted #eee}
    .row .k{color:#888}.row .v{color:#222;font-weight:600;text-align:right}
    table{width:100%;border-collapse:collapse;margin-top:6px;font-size:12px}
    th{background:#1A2B3F;color:#fff;padding:8px;text-align:left;font-size:11px}
    td{border:1px solid #e5e5e5;padding:7px 8px}
    td.c{text-align:center}td.b{font-weight:700}
    .cards{display:flex;gap:12px;margin-bottom:8px}
    .card{flex:1;background:#f7f7f9;border-radius:8px;padding:12px 14px;border-left:3px solid #F25124}
    .card .lbl{font-size:10px;color:#888;text-transform:uppercase}
    .card .val{font-size:18px;font-weight:700;color:#222;margin-top:2px}
    .footer{margin-top:24px;font-size:11px;color:#aaa;text-align:center;border-top:1px solid #e0e0e0;padding-top:10px}
    @media print{body{padding:14px}th{background:#1A2B3F!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
    <div class="header">
      <div class="logo"><span class="p">panormos</span> <span class="m">medya.</span></div>
      <h1>${client.name}</h1>
      <div class="sub">${client.category || ""}</div>
      <div class="meta">Yazdırma Tarihi: ${now.toLocaleString("tr-TR")}</div>
    </div>

    <div class="cards">
      ${perms && perms.finance ? `<div class="card"><div class="lbl">Aylık Paket</div><div class="val">${fmtMoney(client.monthlyFee)}</div></div>` : ""}
      <div class="card"><div class="lbl">Bu Ay Paylaşım</div><div class="val">${thisMonthPub.length}</div></div>
      <div class="card"><div class="lbl">Medya Dosyası</div><div class="val">${(client.media || []).length}</div></div>
      <div class="card"><div class="lbl">Sözleşme Başlangıç</div><div class="val">${client.contractStart || "—"}</div></div>
    </div>

    <div class="section">
      <h2>İşletme Bilgileri</h2>
      <div class="grid">
        <div class="row"><span class="k">Telefon</span><span class="v">${client.phone || "—"}</span></div>
        <div class="row"><span class="k">Sosyal Medya</span><span class="v">${client.socialMedia || "—"}</span></div>
        <div class="row"><span class="k">Sosyal Medya Şifresi</span><span class="v">${client.socialPassword || "—"}</span></div>
        <div class="row"><span class="k">Şehir / İlçe</span><span class="v">${client.city || "—"} ${client.district || ""}</span></div>
        <div class="row"><span class="k">Vergi No</span><span class="v">${client.taxNumber || "—"}</span></div>
        <div class="row"><span class="k">Vergi Dairesi</span><span class="v">${client.taxOffice || "—"}</span></div>
        <div class="row"><span class="k">Adres</span><span class="v">${client.address || "—"}</span></div>
        <div class="row"><span class="k">Paylaşım Günleri</span><span class="v">${(client.publishDays || []).join(", ") || "—"}</span></div>
        <div class="row"><span class="k">Çekim Günleri</span><span class="v">${(client.shootDays || []).join(", ") || "—"}</span></div>
        <div class="row"><span class="k">Paylaşım Saatleri</span><span class="v">${(client.publishTimes || []).join(", ") || "—"}</span></div>
      </div>
      ${client.description ? `<div style="margin-top:10px;font-size:12px"><span style="color:#888">Açıklama:</span> ${client.description}</div>` : ""}
    </div>

    <div class="section">
      <h2>Bu Ayki Paylaşım Sayımı (Anlaşma Karşılaştırması)</h2>
      <table>
        <thead><tr><th>Platform</th><th>İçerik</th><th style="text-align:center">Anlaşma</th><th style="text-align:center">Yapılan</th><th style="text-align:center">Durum</th></tr></thead>
        <tbody>${compRowsHtml}</tbody>
      </table>
    </div>

    ${perms && perms.finance ? `<div class="section">
      <h2>Mali Özet</h2>
      <div class="grid">
        <div class="row"><span class="k">Toplam Fatura</span><span class="v">${fmtMoney(totalInv)}</span></div>
        <div class="row"><span class="k">Tahsil Edilen</span><span class="v">${fmtMoney(paidInv)}</span></div>
        <div class="row"><span class="k">Kalan</span><span class="v">${fmtMoney(totalInv - paidInv)}</span></div>
      </div>
    </div>` : ""}

    <div class="footer">Panormos Medya Yönetim Paneli · panormosmedya.com</div>
  </body></html>`;

  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) { alert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

// Müşteriye gönderilecek AYLIK RAPOR (müşteri dostu — finans/şifre yok)
function printMonthlyReport(client) {
  const now = new Date();
  const monthName = TR_MONTHS[now.getMonth()];
  const year = now.getFullYear();
  const pubs = (client.publishesList || []).filter(p => { if (!p.publishedAt) return false; const d = new Date(p.publishedAt); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });

  // Platform ve tür kırılımı
  const byPlatform = {}; const byType = {};
  pubs.forEach(p => { byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1; byType[p.contentType] = (byType[p.contentType] || 0) + 1; });

  // Anlaşma
  const quota = client.quotaDetail && Object.keys(client.quotaDetail).length > 0 ? client.quotaDetail : {};
  const quotaTotal = Object.values(quota).reduce((s, pt) => s + Object.values(pt).reduce((a, b) => a + (b || 0), 0), 0);

  const platRows = Object.entries(byPlatform).map(([p, c]) => `<tr><td>${platLabel(p)}</td><td class="c b">${c}</td></tr>`).join("") || `<tr><td colspan="2" class="c" style="color:#999">Bu ay paylaşım yapılmadı</td></tr>`;
  const typeRows = Object.entries(byType).map(([t, c]) => `<tr><td>${typeLabel(t)}</td><td class="c b">${c}</td></tr>`).join("") || `<tr><td colspan="2" class="c" style="color:#999">—</td></tr>`;

  // Günlük paylaşım listesi
  const pubListRows = pubs.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)).map(p => {
    const d = new Date(p.publishedAt);
    return `<tr><td>${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</td><td>${platLabel(p.platform)}</td><td>${typeLabel(p.contentType)}</td></tr>`;
  }).join("") || `<tr><td colspan="3" class="c" style="color:#999">Kayıt yok</td></tr>`;

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${client.name} Aylık Rapor</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;padding:0;color:#1a1a1a}
    .page{max-width:800px;margin:0 auto;padding:30px}
    .hero{background:linear-gradient(135deg,#1A2B3F,#2d4a6b);color:#fff;border-radius:16px;padding:32px;margin-bottom:24px}
    .logo{font-size:20px;font-weight:700}.logo .m{color:#F25124}
    .hero h1{font-size:26px;margin-top:16px;font-weight:800}
    .hero .period{font-size:15px;opacity:0.85;margin-top:4px}
    .hero .big{font-size:48px;font-weight:800;margin-top:16px;color:#F8906E}
    .hero .biglbl{font-size:13px;opacity:0.8}
    .row2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
    .box{background:#f7f7f9;border-radius:12px;padding:18px;border-top:3px solid #F25124}
    .box h3{font-size:13px;color:#F25124;text-transform:uppercase;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    td{padding:7px 8px;border-bottom:1px solid #eaeaea}
    td.c{text-align:center}td.b{font-weight:700;color:#1A2B3F}
    .full{background:#fff;border:1px solid #eee;border-radius:12px;padding:18px;margin-bottom:20px}
    .full h3{font-size:13px;color:#1A2B3F;text-transform:uppercase;margin-bottom:12px}
    .full th{background:#1A2B3F;color:#fff;padding:8px;text-align:left;font-size:11px}
    .full td{border:1px solid #eee}
    .agree{background:#eef7f0;border-radius:12px;padding:16px 18px;margin-bottom:20px;font-size:14px;color:#0a7a4a;text-align:center;font-weight:600}
    .footer{text-align:center;font-size:12px;color:#999;margin-top:26px;padding-top:16px;border-top:1px solid #eee}
    .footer .co{color:#F25124;font-weight:700}
    @media print{.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.full th{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="page">
    <div class="hero">
      <div class="logo">panormos <span class="m">medya.</span></div>
      <h1>${client.name}</h1>
      <div class="period">${monthName} ${year} — Aylık Sosyal Medya Raporu</div>
      <div class="big">${pubs.length}</div>
      <div class="biglbl">bu ay yapılan toplam paylaşım</div>
    </div>

    ${quotaTotal > 0 ? `<div class="agree">📋 Anlaşma: Aylık ${quotaTotal} içerik · Bu ay ${pubs.length} içerik paylaşıldı ${pubs.length >= quotaTotal ? "✓ Hedef tamamlandı!" : `(${quotaTotal - pubs.length} kaldı)`}</div>` : ""}

    <div class="row2">
      <div class="box">
        <h3>📱 Platforma Göre</h3>
        <table><tbody>${platRows}</tbody></table>
      </div>
      <div class="box">
        <h3>🎬 İçerik Türüne Göre</h3>
        <table><tbody>${typeRows}</tbody></table>
      </div>
    </div>

    <div class="full">
      <h3>📅 Paylaşım Takvimi (${monthName})</h3>
      <table>
        <thead><tr><th>Tarih & Saat</th><th>Platform</th><th>İçerik Türü</th></tr></thead>
        <tbody>${pubListRows}</tbody>
      </table>
    </div>

    <div class="footer">
      Bu rapor <span class="co">Panormos Medya</span> tarafından hazırlanmıştır.<br>
      İş birliğiniz için teşekkür ederiz · panormosmedya.com
    </div>
  </div></body></html>`;

  const w = window.open("", "_blank", "width=1000,height=850");
  if (!w) { alert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

// Sosyal medya aylık raporu PDF (müşteriye gönderilir)
function printSocialReport(client, r, prev, monthLabel) {
  const metrics = [
    { key: "new_followers", label: "Yeni Takipçi", icon: "👥" },
    { key: "total_followers", label: "Toplam Takipçi", icon: "🫂" },
    { key: "reach", label: "Erişim", icon: "👁️" },
    { key: "impressions", label: "Gösterim / İzlenme", icon: "📊" },
    { key: "likes", label: "Beğeni", icon: "❤️" },
    { key: "comments", label: "Yorum", icon: "💬" },
    { key: "saves", label: "Kaydetme", icon: "🔖" },
    { key: "shares", label: "Paylaşım", icon: "📤" },
    { key: "profile_visits", label: "Profil Ziyareti", icon: "🔎" },
  ];
  const fmt = (n) => (n || 0).toLocaleString("tr-TR");
  const cards = metrics.map(m => {
    const val = r[m.key] || 0;
    const pv = prev ? (prev[m.key] || 0) : null;
    const diff = pv !== null ? val - pv : null;
    const pct = pv ? Math.round((diff / pv) * 100) : null;
    let badge = "";
    if (diff !== null && diff !== 0) {
      const up = diff > 0;
      badge = `<div class="diff ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${fmt(Math.abs(diff))}${pct !== null ? ` (%${Math.abs(pct)})` : ''}</div>`;
    }
    return `<div class="metric"><div class="mlbl">${m.icon} ${m.label}</div><div class="mval">${fmt(val)}</div>${badge}</div>`;
  }).join("");

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${client.name} Rapor</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;padding:0;color:#1a1a1a;background:#fff}
    .page{max-width:800px;margin:0 auto;padding:30px}
    .hero{background:linear-gradient(135deg,#1A2B3F,#3a2d6b);color:#fff;border-radius:18px;padding:34px;margin-bottom:24px;position:relative;overflow:hidden}
    .hero::after{content:"";position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(242,81,36,0.4),transparent 70%)}
    .logo{font-size:20px;font-weight:700;position:relative}.logo .m{color:#F8906E}
    .hero h1{font-size:26px;margin-top:14px;font-weight:800;position:relative}
    .hero .period{font-size:15px;opacity:0.85;margin-top:4px;position:relative}
    .metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px}
    .metric{background:#f7f7f9;border-radius:14px;padding:18px;border-top:3px solid #6366F1}
    .mlbl{font-size:12px;color:#888;margin-bottom:8px}
    .mval{font-size:26px;font-weight:800;color:#1A2B3F}
    .diff{font-size:12px;font-weight:700;margin-top:6px}
    .diff.up{color:#0a7a4a}.diff.down{color:#c0392b}
    .note{background:#eef2ff;border-radius:12px;padding:16px 18px;font-size:14px;color:#4338ca;margin-bottom:20px}
    .footer{text-align:center;font-size:12px;color:#999;margin-top:26px;padding-top:16px;border-top:1px solid #eee}
    .footer .co{color:#F25124;font-weight:700}
    @media print{.hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}.metric{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><div class="page">
    <div class="hero">
      <div class="logo">panormos <span class="m">medya.</span></div>
      <h1>${client.name}</h1>
      <div class="period">${monthLabel(r.month_ref)} — Aylık Sosyal Medya Performans Raporu</div>
    </div>
    <div class="metrics">${cards}</div>
    ${r.notes ? `<div class="note">📝 ${r.notes}</div>` : ""}
    <div class="footer">Bu rapor <span class="co">Panormos Medya</span> tarafından hazırlanmıştır.<br>İş birliğiniz için teşekkür ederiz · panormosmedya.com</div>
  </div></body></html>`;

  const w = window.open("", "_blank", "width=1000,height=850");
  if (!w) { alert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 300);
}

function MessagingPanel({clientId, clientName, onClose}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  
  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    
    const msg = {
      id: Date.now(),
      clientId,
      text: newMessage,
      timestamp: new Date().toLocaleString("tr-TR"),
      sender: "admin",
    };
    
    setMessages(prev => [...prev, msg]);
    
    await supabase.from('messages').insert({
      client_id: clientId,
      text: newMessage,
      sender: "admin",
      created_at: new Date().toISOString(),
    }).catch(err => console.error("Mesaj kaydedilemedi:", err));
    
    setNewMessage("");
  };
  
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,width:420,height:500,display:"flex",flexDirection:"column"}} onClick={e=>e.stopPropagation()}>
        <div style={{padding:"16px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{clientName}</div>
            <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>💬 Mesaj Geçmişi</div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer"}}>✕</button>
        </div>
        
        <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
          {messages.length === 0 && (
            <div style={{textAlign:"center",color:T.textMuted,fontSize:12,marginTop:"50px"}}>
              Henüz mesaj yok. İlk mesajı gönder!
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{
              background: msg.sender === "admin" ? T.amber : T.indigo,
              color: T.white,
              padding: "8px 12px",
              borderRadius: "10px",
              fontSize: 12,
              maxWidth: "80%",
              marginLeft: msg.sender === "admin" ? "auto" : 0,
              marginRight: msg.sender === "admin" ? 0 : "auto",
            }}>
              <div>{msg.text}</div>
              <div style={{fontSize:10,opacity:0.7,marginTop:4}}>{msg.timestamp}</div>
            </div>
          ))}
        </div>
        
        <div style={{padding:"12px",borderTop:`1px solid ${T.border}`,display:"flex",gap:8}}>
          <input
            value={newMessage}
            onChange={e=>setNewMessage(e.target.value)}
            onKeyDown={e=>e.key==="Enter" && handleSendMessage()}
            placeholder="Mesaj yaz..."
            style={{
              flex:1,background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,
              padding:"8px 12px",fontSize:12,color:T.textPrimary,outline:"none",
            }}
          />
          <button onClick={handleSendMessage} style={{
            background:T.amber,color:T.white,border:"none",borderRadius:8,
            padding:"8px 16px",fontSize:12,fontWeight:600,cursor:"pointer",
          }}>Gönder</button>
        </div>
      </div>
    </div>
  );
}

function FileUploadPanel({clientId, onClose, onUploadComplete}) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [useGoogleDrive, setUseGoogleDrive] = useState(false);
  
  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(prev => [...prev, ...selectedFiles]);
  };
  
  const handleDragDrop = (e) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    setFiles(prev => [...prev, ...droppedFiles]);
  };
  
  const handleUpload = async () => {
    if (files.length === 0) return;
    
    setUploading(true);

    // Yükleyen çalışanı bul (oturumdan) — her iki yöntemde de kullanılır
    let uploaderId = null, uploaderName = "";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: st } = await supabase.from('staff').select('id,name').eq('auth_id', user.id).limit(1);
        if (st && st[0]) { uploaderId = st[0].id; uploaderName = st[0].name; }
      }
    } catch(e) {}
    const nowIso = () => new Date().toISOString();
    
    if (useGoogleDrive) {
      try {
        // Google'a giriş yap
        const token = await getGoogleAccessToken();
        // Panormos klasörünü bul/oluştur
        const folderId = await getPanormosFolder(token);

        let successCount = 0;
        for (const file of files) {
          try {
            const driveFile = await uploadFileToGoogleDrive(token, file, folderId);
            const link = driveFile.webViewLink || driveFile.id;
            // Kaydı Supabase'e de yaz (referans için)
            await supabase.from('media').insert({
              client_id: clientId,
              name: file.name,
              type: file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'file',
              size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
              date: new Date().toLocaleDateString("tr-TR"),
              storage_path: link,
              storage_type: 'google_drive',
              uploader_id: uploaderId, uploader_name: uploaderName, uploaded_at: nowIso(),
            });
            // Ekip görünürlüğü için drive_files tablosuna da kaydet
            await supabase.from('drive_files').insert({
              name: file.name, link, file_id: driveFile.id,
              uploader_id: uploaderId, uploader_name: uploaderName,
              client_id: clientId, uploaded_at: nowIso(),
            });
            successCount++;
          } catch (err) {
            console.error("Dosya yüklenemedi:", file.name, err);
          }
        }

        setUploading(false);
        setFiles([]);
        alert(successCount + " dosya Google Drive'a yüklendi! (Panormos Medya klasörü)");
        onUploadComplete?.();
        return;
      } catch (err) {
        setUploading(false);
        alert("Google Drive hatası: " + err.message);
        return;
      }
    }
    
    // Supabase Storage'a yükle
    for (const file of files) {
      try {
        const fileName = `${clientId}-${Date.now()}-${file.name}`;
        const { data, error } = await supabase.storage
          .from('client-media')
          .upload(fileName, file);
        
        if (!error) {
          await supabase.from('media').insert({
            client_id: clientId,
            name: file.name,
            type: file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'file',
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            date: new Date().toLocaleDateString("tr-TR"),
            storage_path: data.path,
            storage_type: 'supabase',
            uploader_id: uploaderId, uploader_name: uploaderName, uploaded_at: nowIso(),
          });
          // Merkezi Dosyalar sayfasında da görünsün (public URL ile)
          let publicUrl = "";
          try { publicUrl = supabase.storage.from('client-media').getPublicUrl(data.path).data.publicUrl || ""; } catch(e) {}
          await supabase.from('drive_files').insert({
            name: file.name, link: publicUrl, file_id: data.path,
            uploader_id: uploaderId, uploader_name: uploaderName,
            client_id: clientId, uploaded_at: nowIso(),
          });
        }
      } catch (err) {
        console.error("Yükleme hatası:", err);
      }
    }
    
    setUploading(false);
    setFiles([]);
    alert(files.length + " dosya yüklendi!");
    onUploadComplete?.();
  };
  
  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };
  
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2500,backdropFilter:"blur(4px)"}} onClick={onClose}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,maxWidth:500,width:"90%"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontSize:15,fontWeight:600,color:T.textPrimary}}>📁 Dosya Yükle</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:18,cursor:"pointer"}}>✕</button>
        </div>
        
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <button onClick={()=>setUseGoogleDrive(false)} style={{flex:1,padding:"8px",fontSize:12,fontWeight:600,borderRadius:8,background:!useGoogleDrive?T.amber:T.bgSurface,color:!useGoogleDrive?T.white:T.textSecondary,border:`1px solid ${T.border}`,cursor:"pointer"}}>Supabase</button>
          <button onClick={()=>setUseGoogleDrive(true)} style={{flex:1,padding:"8px",fontSize:12,fontWeight:600,borderRadius:8,background:useGoogleDrive?T.amber:T.bgSurface,color:useGoogleDrive?T.white:T.textSecondary,border:`1px solid ${T.border}`,cursor:"pointer"}}>Google Drive</button>
        </div>
        
        <div
          onDragOver={e=>e.preventDefault()}
          onDrop={handleDragDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2px dashed ${T.amber}`,
            borderRadius:12,
            padding:"30px 20px",
            textAlign:"center",
            cursor:"pointer",
            background:`${T.amber}12`,
            marginBottom:16,
            transition:"all 0.2s",
          }}
        >
          <div style={{fontSize:32,marginBottom:8}}>📸</div>
          <div style={{fontSize:13,color:T.textPrimary,fontWeight:600,marginBottom:4}}>Dosya sürükle ve bırak</div>
          <div style={{fontSize:11,color:T.textMuted}}>veya tıklayarak dosya seç</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            style={{display:"none"}}
            accept="image/*,video/*"
          />
        </div>
        
        {files.length > 0 && (
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:8,fontWeight:500}}>Seçili Dosyalar ({files.length})</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {files.map((file, idx) => (
                <div key={idx} style={{
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  padding:"8px 12px",
                  background:T.bgSurface,
                  borderRadius:8,
                  border:`1px solid ${T.border}`,
                }}>
                  <span style={{fontSize:16}}>
                    {file.type.startsWith('image') ? '🖼' : file.type.startsWith('video') ? '🎥' : '📄'}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {file.name}
                    </div>
                    <div style={{fontSize:10,color:T.textMuted}}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                  <button
                    onClick={() => removeFile(idx)}
                    style={{
                      background:"none",
                      border:"none",
                      color:T.textMuted,
                      fontSize:14,
                      cursor:"pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div style={{
          fontSize:11,
          color:T.textMuted,
          background:T.bgSurface,
          padding:"8px 12px",
          borderRadius:8,
          marginBottom:16,
          border:`1px solid ${T.border}`,
        }}>
          💾 Supabase: 500 MB | Google Drive: 10 TB (Panormos Medya klasörüne yüklenir)
        </div>
        
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onClose} style={{fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",background:"transparent",color:T.textSecondary,border:`1px solid ${T.border}`}}>Vazgeç</button>
          <button 
            onClick={handleUpload}
            style={{
              fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",background:T.amber,color:T.white,border:"none",opacity: uploading ? 0.6 : 1, pointerEvents: uploading ? "none" : "auto"
            }}
          >
            {uploading ? "Yükleniyor..." : `Yükle (${files.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

const fmtMoney = n => n.toLocaleString("tr-TR") + " ₺";

const statusConfig = {
  done:{label:"Yayınlandı",color:T.green,bg:T.greenDim},
  planned:{label:"Planlandı",color:T.amber,bg:T.amberDim},
  in_progress:{label:"Hazırlanıyor",color:T.indigo,bg:T.indigoGlow},
  paid:{label:"Ödendi",color:T.green,bg:T.greenDim},
  pending:{label:"Bekliyor",color:T.amber,bg:T.amberDim},
  overdue:{label:"Gecikti",color:T.red,bg:T.redDim},
  deleted:{label:"Silindi",color:T.red,bg:T.redDim},
};

const priorityConfig = {
  high:{label:"Yüksek",color:T.red,bg:T.redDim},
  mid:{label:"Orta",color:T.amber,bg:T.amberDim},
  low:{label:"Düşük",color:T.green,bg:T.greenDim},
};

function Badge({status}) {
  const cfg = statusConfig[status] || statusConfig.planned;
  return <span style={{fontSize:11,fontWeight:500,padding:"3px 9px",borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}22`}}>{cfg.label}</span>;
}

function PlatformTag({id}) {
  const p = platformConfig[id]; if(!p) return null;
  return <span style={{fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:5,background:p.bg,color:p.color,letterSpacing:"0.04em"}}>{p.icon}</span>;
}

function Avatar({initials,color,size=36}) {
  return <div style={{width:size,height:size,borderRadius:"50%",flexShrink:0,background:`${color}22`,border:`1.5px solid ${color}55`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:size*0.32,fontWeight:600,color,letterSpacing:"0.02em"}}>{initials}</div>;
}

function Card({children,style={},onClick,hover=false}) {
  const [hov,setHov]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{background:hov&&hover?T.bgCardHover:T.bgCard,border:`1px solid ${hov&&hover?T.borderLight:T.border}`,borderRadius:12,transition:"all 0.15s ease",cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}

function StatCard({label,value,color,sub}) {
  return <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px"}}>
    <div style={{fontSize:11,color:T.textMuted,marginBottom:6,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</div>
    <div style={{fontSize:22,fontWeight:700,color:color||T.textPrimary,letterSpacing:"-0.02em"}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:T.textMuted,marginTop:4}}>{sub}</div>}
  </div>;
}

function Btn({children,onClick,variant="ghost",style={}}) {
  const [hov,setHov]=useState(false);
  const styles={
    primary:{background:T.amber,color:T.white,border:"none"},
    ghost:{background:hov?T.bgSurface:"transparent",color:T.textSecondary,border:`1px solid ${T.border}`},
  };
  return <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{fontSize:12,fontWeight:500,padding:"6px 14px",borderRadius:8,cursor:"pointer",display:"flex",alignItems:"center",gap:6,transition:"all 0.12s ease",...styles[variant],...style}}>{children}</button>;
}

function Modal({title,onClose,children,width=500}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(4px)"}} onClick={onClose}>
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:"90%",maxWidth:width,maxHeight:"85vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{fontSize:15,fontWeight:600,color:T.textPrimary}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:T.textMuted,fontSize:18,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}

function FormField({label,children}) {
  return <div style={{marginBottom:12}}>
    <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:5,fontWeight:500,letterSpacing:"0.04em",textTransform:"uppercase"}}>{label}</label>
    {children}
  </div>;
}

function Input({value,onChange,placeholder,type="text"}) {
  return <input value={value} onChange={onChange} placeholder={placeholder} type={type} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.textPrimary,outline:"none",boxSizing:"border-box"}} />;
}

function Textarea({value,onChange,placeholder,minHeight=80}) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.textPrimary,outline:"none",boxSizing:"border-box",minHeight,fontFamily:"inherit",resize:"vertical"}} />;
}

function Select({value,onChange,children}) {
  return <select value={value} onChange={onChange} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.textPrimary,outline:"none"}}>{children}</select>;
}

function ModalActions({onClose,onSave,saveLabel}) {
  return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
    <Btn onClick={onClose}>Vazgeç</Btn>
    <Btn variant="primary" onClick={onSave}>{saveLabel||"Kaydet"}</Btn>
  </div>;
}

// Yetki açma/kapama düğmesi
function PermToggle({label, checked, onChange}) {
  return <div onClick={onChange} style={{
    display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:8,cursor:"pointer",
    background:checked?T.amberDim:T.bgInput,border:`1px solid ${checked?T.amber+"66":T.border}`,transition:"all 0.12s",
  }}>
    <div style={{
      width:36,height:20,borderRadius:20,background:checked?T.amber:T.borderLight,position:"relative",transition:"all 0.2s",flexShrink:0,
    }}>
      <div style={{
        width:16,height:16,borderRadius:"50%",background:"#fff",position:"absolute",top:2,
        left:checked?18:2,transition:"all 0.2s",
      }} />
    </div>
    <span style={{fontSize:12,color:checked?T.textPrimary:T.textSecondary,fontWeight:checked?500:400}}>{label}</span>
  </div>;
}

// ─────────────────────────────────────────────
// CLIENTS PAGE
// ─────────────────────────────────────────────
function ClientsPage({clients,setClients,allClients,perms}) {
  const [open,setOpen]=useState(null);
  const [tab,setTab]=useState({});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("Tümü");
  const [filterPlatform, setFilterPlatform] = useState("Tümü");
  const [messagingClient, setMessagingClient] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [showAllClients, setShowAllClients] = useState(false);

  const totalRevenue=clients.reduce((s,c)=>s+c.invoices.reduce((ss,i)=>ss+i.total,0),0);
  const pendingRevenue=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status!=="paid").reduce((ss,i)=>ss+i.total,0),0);
  const overdueCount=clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status==="overdue").length,0);

  const categories = [...new Set(clients.map(c => c.category).filter(Boolean))];
  const filteredClients = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = filterCategory === "Tümü" || c.category === filterCategory;
    const matchPlatform = filterPlatform === "Tümü" || c.platforms.includes(filterPlatform);
    return matchSearch && matchCategory && matchPlatform;
  });

  const handleExportClients = async () => {
    const activeRows = filteredClients.map(c => {
      const publishDaysArr = c.publishDays || [];
      const shootDaysArr = c.shootDays || [];
      const toplamBakiye = c.invoices.reduce((s,i)=>s+i.total,0);
      const odenenBakiye = c.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);
      const kalanBakiye = toplamBakiye - odenenBakiye;
      return {
        "İşletme Adı": c.name,
        "Kategori": c.category || "—",
        "Sosyal Medya": c.socialMedia || "—",
        "Telefon": c.phone || "—",
        "Adres": c.address || "—",
        "İl": c.city || "—",
        "İlçe": c.district || "—",
        "Vergi Numarası": c.taxNumber || "—",
        "Vergi Dairesi": c.taxOffice || "—",
        "Platformlar": c.platforms.map(p=>platformConfig[p]?.label).join(", ") || "—",
        "Paylaşım Günleri": publishDaysArr.join(", ") || "—",
        "Çekim Günleri": shootDaysArr.join(", ") || "—",
        "Aylık Paylaşım Sayısı": publishDaysArr.length * 4,
        "Aylık Çekim Sayısı": shootDaysArr.length * 4,
        "Aylık Ücret (₺)": c.monthlyFee || 0,
        "Toplam Bakiye (₺)": toplamBakiye,
        "Ödenen Bakiye (₺)": odenenBakiye,
        "Kalan Bakiye (₺)": kalanBakiye,
        "Sözleşme Başlangıç": c.contractStart || "—",
      };
    });

    const deletedClients = (allClients.filter(c => c.deleted_at) || []).map(c => ({
      "İşletme Adı": c.name,
      "Kategori": c.category || "—",
      "Silme Sebebi": CLIENT_DELETE_REASONS.find(r => r.id === c.delete_reason)?.label || "—",
      "Bitiş Tarihi": c.deletion_date || "—",
      "Silme Tarihi": c.deleted_at ? new Date(c.deleted_at).toLocaleDateString("tr-TR") : "—",
    }));

    const sheets = [
      { name: "Aktif Müşteriler", rows: activeRows, title: "PANORMOS MEDYA — AKTİF MÜŞTERİ LİSTESİ" },
    ];
    if (deletedClients.length > 0) {
      sheets.push({ name: "Silinen Müşteriler", rows: deletedClients, title: "PANORMOS MEDYA — SİLİNEN MÜŞTERİLER" });
    }

    await exportPerfectExcel(sheets, `panormos-musteriler-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handlePrintClients = () => {
    const rows = filteredClients.map(c => ({
      "İşletme Adı": c.name,
      "Kategori": c.category,
      "Telefon": c.phone || "—",
      "Şehir": c.city || "—",
      "Vergi No": c.taxNumber || "—",
      "Platformlar": c.platforms.map(p=>platformConfig[p]?.label).join(", "),
      "Aylık Ücret": fmtMoney(c.monthlyFee),
    }));
    printData("Müşteri Listesi", rows);
  };

  const handleDeleteClient = async (clientId) => {
    if (!deleteModal.reason || !deleteModal.date) {
      alert("Lütfen silme sebebi ve bitiş tarihini seçin");
      return;
    }

    const { error } = await supabase.from('clients').update({
      deleted_at: new Date().toISOString(),
      delete_reason: deleteModal.reason,
      deletion_date: deleteModal.date,
    }).eq('id', clientId);

    if (error) {
      alert("HATA: Müşteri silinemedi!\n\n" + error.message + "\n\nSupabase'de gerekli sütunlar eksik olabilir. SQL kodunu çalıştırdığınızdan emin olun.");
      return;
    }

    setClients(clients.filter(c => c.id !== clientId));
    setDeleteModal(null);
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:perms.finance?"repeat(4,1fr)":"repeat(2,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Aktif Müşteri" value={filteredClients.length} sub={`Toplam: ${clients.length}`} />
      {perms.finance && <StatCard label="Toplam Ciro" value={fmtMoney(totalRevenue)} color={T.indigoText} sub="Tüm zamanlar" />}
      {perms.finance && <StatCard label="Tahsilat Bekleyen" value={fmtMoney(pendingRevenue)} color={T.amberText} sub={`${overdueCount} gecikmiş`} />}
      <StatCard label="Bu Ay Paylaşım" value={filteredClients.reduce((s,c)=>s+c.posts.filter(p=>p.status==="done").length,0)} color={T.greenText} sub="Yayınlanan" />
    </div>

    <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:200}}>
        <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:6,fontWeight:500,textTransform:"uppercase"}}>🔍 Ara</label>
        <Input placeholder="Müşteri adı ara..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} />
      </div>
      <div style={{minWidth:150}}>
        <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:6,fontWeight:500,textTransform:"uppercase"}}>Kategori</label>
        <Select value={filterCategory} onChange={e=>setFilterCategory(e.target.value)}>
          <option>Tümü</option>
          {categories.map(cat => <option key={cat}>{cat}</option>)}
        </Select>
      </div>
      <div style={{minWidth:150}}>
        <label style={{fontSize:11,color:T.textMuted,display:"block",marginBottom:6,fontWeight:500,textTransform:"uppercase"}}>Platform</label>
        <Select value={filterPlatform} onChange={e=>setFilterPlatform(e.target.value)}>
          <option>Tümü</option>
          {Object.entries(platformConfig).map(([id,p]) => <option key={id} value={id}>{p.label}</option>)}
        </Select>
      </div>
    </div>

    <div style={{display:"flex",gap:10,marginBottom:20}}>
      <div onClick={handleExportClients} style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
        padding:"14px 24px", background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:12,
        cursor:"pointer", minWidth:120,
      }}>
        <span style={{fontSize:20}}>📊</span>
        <span style={{fontSize:11,fontWeight:600,color:T.textSecondary}}>Excel'e Aktar</span>
      </div>
      <div onClick={handlePrintClients} style={{
        display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6,
        padding:"14px 24px", background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:12,
        cursor:"pointer", minWidth:120,
      }}>
        <span style={{fontSize:20}}>🖨️</span>
        <span style={{fontSize:11,fontWeight:600,color:T.textSecondary}}>Yazdır</span>
      </div>
      <Btn variant="primary" onClick={()=>{setModal("addClient");setForm({name:"",category:"",phone:"",address:"",city:"",district:"",taxNumber:"",taxOffice:"",monthlyFee:"",publishDays:[],shootDays:[],publishTimes:[],platforms:[]});}} style={{flex:1}}>+ Yeni müşteri ekle</Btn>
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      {(showAllClients ? filteredClients : filteredClients.slice(0,6)).map(client=>{
        const isOpen=open===client.id;
        const currentTab=tab[client.id]||"overview";
        return <div key={client.id}>
          <div onClick={()=>{setOpen(open===client.id?null:client.id);if(!tab[client.id])setTab(t=>({...t,[client.id]:"overview"}));}} style={{
            display:"flex",alignItems:"center",gap:14,padding:"14px 20px",
            background:isOpen?T.bgSurface:T.bgCard,
            border:`1px solid ${isOpen?T.borderLight:T.border}`,
            borderRadius:isOpen?"12px 12px 0 0":12, cursor:"pointer",
            transition:"all 0.15s ease", borderLeft:`3px solid ${client.accentColor}`,
          }}>
            <Avatar initials={client.initials} color={client.accentColor} size={40} />
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{client.name}</div>
              <div style={{fontSize:12,color:T.textMuted,marginTop:2}}>{client.category} • {client.phone}</div>
            </div>
            <div style={{display:"flex",gap:5}}>{client.platforms.map(p=><PlatformTag key={p} id={p}/>)}</div>
            {perms.finance && <div style={{textAlign:"right",minWidth:90}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{fmtMoney(client.monthlyFee)}</div>
              <div style={{fontSize:11,color:T.textMuted}}>aylık</div>
            </div>}
            <span style={{fontSize:13,color:T.textMuted,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
          </div>
          {isOpen&&<ClientDetail client={client} currentTab={currentTab} setTab={t=>setTab(prev=>({...prev,[client.id]:t}))} clients={clients} setClients={setClients} setModal={setModal} setForm={setForm} setMessagingClient={setMessagingClient} onDelete={()=>setDeleteModal({clientId:client.id,reason:"",date:""})} perms={perms} />}
        </div>;
      })}
      {filteredClients.length>6 && (
        <button onClick={()=>setShowAllClients(v=>!v)} style={{marginTop:8,padding:"11px",borderRadius:10,border:`1px dashed ${T.borderLight}`,background:"transparent",color:T.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>
          {showAllClients ? "▲ Daha az göster" : `▼ Tümünü göster (${filteredClients.length} müşteri)`}
        </button>
      )}
    </div>

    {modal==="addClient"&&<Modal title="Yeni müşteri ekle" onClose={()=>setModal(null)}>
      <FormField label="İşletme adı"><Input placeholder="Örn: Lezzet Durağı" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Input placeholder="Örn: Restoran & Cafe" value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="📱 Sosyal Medya Adı"><Input placeholder="Örn: @lezzetduragi" value={form.socialMedia||""} onChange={e=>setForm(f=>({...f,socialMedia:e.target.value}))} /></FormField>
      <FormField label="🔑 Sosyal Medya Şifresi"><Input placeholder="Hesap şifresi" value={form.socialPassword||""} onChange={e=>setForm(f=>({...f,socialPassword:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
      {perms.finance && <FormField label="Aylık ücret (₺)"><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>}
      <FormField label="📅 Paylaşım günleri"><DaySelector selected={Array.isArray(form.publishDays)?form.publishDays:[]} onChange={days=>setForm(f=>({...f,publishDays:days}))} activeColor={T.amber} /></FormField>
      <FormField label="🕐 Paylaşım saatleri"><TimeSelector times={form.publishTimes||[]} onChange={t=>setForm(f=>({...f,publishTimes:t}))} /></FormField>
      <FormField label="📷 Çekim günleri"><DaySelector selected={Array.isArray(form.shootDays)?form.shootDays:[]} onChange={days=>setForm(f=>({...f,shootDays:days}))} activeColor="#EC4899" /></FormField>
      <FormField label="Platformlar">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(platformConfig).map(([id,p])=>{const sel=(form.platforms||[]).includes(id);return <span key={id} onClick={()=>setForm(f=>({...f,platforms:sel?f.platforms.filter(x=>x!==id):[...(f.platforms||[]),id]}))} style={{fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:sel?p.bg:T.bgInput,color:sel?p.color:T.textMuted,border:`1px solid ${sel?p.color+"44":T.border}`}}>{p.label}</span>;})}
        </div>
      </FormField>
      <FormField label="📊 Aylık Paylaşım Anlaşması (nerede, ne kadar)"><QuotaEditor value={form.quotaDetail} onChange={q=>setForm(f=>({...f,quotaDetail:q}))} /></FormField>
      <FormField label="📝 Açıklama / Notlar"><Textarea placeholder="Müşteri hakkında notlar, özel istekler..." value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} minHeight={80} /></FormField>
      <FormField label="📆 Sözleşme Bitiş Tarihi (yenileme takibi için)"><Input type="date" value={form.contractEnd||""} onChange={e=>setForm(f=>({...f,contractEnd:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.name)return;
        const colors=["#6366F1","#EC4899","#10B981","#F59E0B","#F97316"];
        const initials = form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        const accentColor = colors[clients.length%colors.length];
        const publishDays = Array.isArray(form.publishDays)?form.publishDays:(form.publishDays?form.publishDays.split(",").map(s=>s.trim()):[]);
        const shootDays = Array.isArray(form.shootDays)?form.shootDays:(form.shootDays?form.shootDays.split(",").map(s=>s.trim()):[]);
        const publishTimes = form.publishTimes||[];
        const { data, error } = await supabase.from('clients').insert({
          name: form.name, category: form.category||"", initials, accent_color: accentColor,
          phone: form.phone||"", address: form.address||"", city: form.city||"", district: form.district||"",
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"", social_media: form.socialMedia||"",
          social_password: form.socialPassword||"", description: form.description||"", monthly_post_quota: parseInt(form.monthlyPostQuota)||0, quota_detail: form.quotaDetail||{},
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays, publish_times: publishTimes,
          monthly_fee: parseInt(form.monthlyFee)||0, contract_start: "Temmuz 2026", contract_end: form.contractEnd||null,
        }).select().single();
        if(error){ alert("HATA: Müşteri eklenemedi!\n\n"+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırıp yeni sütunları eklediğinizden emin olun."); return; }
        if(data){
          setClients(prev=>[...prev,{id:data.id,name:data.name,category:data.category,initials:data.initials,accentColor:data.accent_color,phone:data.phone,address:data.address,city:data.city,district:data.district,taxNumber:data.tax_number,taxOffice:data.tax_office,socialMedia:data.social_media||"",socialPassword:data.social_password||"",description:data.description||"",monthlyPostQuota:data.monthly_post_quota||0,quotaDetail:data.quota_detail||{},platforms:data.platforms||[],publishDays:data.publish_days||[],shootDays:data.shoot_days||[],publishTimes:data.publish_times||[],monthlyFee:data.monthly_fee,contractStart:data.contract_start,posts:[],publishesList:[],invoices:[],media:[],socialAccounts:[],calEvents:[]}]);
        }
        setModal(null);
      }} />
    </Modal>}

    {modal==="editClient"&&<Modal title="Müşteri Bilgilerini Düzenle" onClose={()=>setModal(null)}>
      <FormField label="İşletme adı"><Input placeholder="Örn: Lezzet Durağı" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Input placeholder="Örn: Restoran & Cafe" value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="📱 Sosyal Medya Adı"><Input placeholder="Örn: @lezzetduragi" value={form.socialMedia||""} onChange={e=>setForm(f=>({...f,socialMedia:e.target.value}))} /></FormField>
      <FormField label="🔑 Sosyal Medya Şifresi"><Input placeholder="Hesap şifresi" value={form.socialPassword||""} onChange={e=>setForm(f=>({...f,socialPassword:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
      {perms.finance && <FormField label="Aylık ücret (₺)"><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>}
      <FormField label="📅 Paylaşım günleri"><DaySelector selected={Array.isArray(form.publishDays)?form.publishDays:[]} onChange={days=>setForm(f=>({...f,publishDays:days}))} activeColor={T.amber} /></FormField>
      <FormField label="🕐 Paylaşım saatleri"><TimeSelector times={form.publishTimes||[]} onChange={t=>setForm(f=>({...f,publishTimes:t}))} /></FormField>
      <FormField label="📷 Çekim günleri"><DaySelector selected={Array.isArray(form.shootDays)?form.shootDays:[]} onChange={days=>setForm(f=>({...f,shootDays:days}))} activeColor="#EC4899" /></FormField>
      <FormField label="Platformlar">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(platformConfig).map(([id,p])=>{const sel=(form.platforms||[]).includes(id);return <span key={id} onClick={()=>setForm(f=>({...f,platforms:sel?f.platforms.filter(x=>x!==id):[...(f.platforms||[]),id]}))} style={{fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:sel?p.bg:T.bgInput,color:sel?p.color:T.textMuted,border:`1px solid ${sel?p.color+"44":T.border}`}}>{p.label}</span>;})}
        </div>
      </FormField>
      <FormField label="📊 Aylık Paylaşım Anlaşması (nerede, ne kadar)"><QuotaEditor value={form.quotaDetail} onChange={q=>setForm(f=>({...f,quotaDetail:q}))} /></FormField>
      <FormField label="📝 Açıklama / Notlar"><Textarea placeholder="Müşteri hakkında notlar, özel istekler..." value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} minHeight={80} /></FormField>
      <FormField label="📆 Sözleşme Bitiş Tarihi (yenileme takibi için)"><Input type="date" value={form.contractEnd||""} onChange={e=>setForm(f=>({...f,contractEnd:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.name)return;
        const initials = form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        const publishDays = Array.isArray(form.publishDays)?form.publishDays:[];
        const shootDays = Array.isArray(form.shootDays)?form.shootDays:[];
        const publishTimes = form.publishTimes||[];
        const { error } = await supabase.from('clients').update({
          name: form.name, category: form.category||"", initials,
          phone: form.phone||"", address: form.address||"", city: form.city||"", district: form.district||"",
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"", social_media: form.socialMedia||"",
          social_password: form.socialPassword||"", description: form.description||"", monthly_post_quota: parseInt(form.monthlyPostQuota)||0, quota_detail: form.quotaDetail||{},
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays, publish_times: publishTimes,
          monthly_fee: parseInt(form.monthlyFee)||0, contract_end: form.contractEnd||null,
        }).eq('id', form.id);
        if(error){ alert("HATA: Müşteri güncellenemedi!\n\n"+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırıp yeni sütunları eklediğinizden emin olun."); return; }
        setClients(clients.map(c=>c.id===form.id?{...c,name:form.name,category:form.category||"",initials,phone:form.phone||"",address:form.address||"",city:form.city||"",district:form.district||"",taxNumber:form.taxNumber||"",taxOffice:form.taxOffice||"",socialMedia:form.socialMedia||"",socialPassword:form.socialPassword||"",description:form.description||"",monthlyPostQuota:parseInt(form.monthlyPostQuota)||0,quotaDetail:form.quotaDetail||{},platforms:form.platforms||[],publishDays,shootDays,publishTimes,monthlyFee:parseInt(form.monthlyFee)||0,contractEnd:form.contractEnd||null}:c));
        setModal(null);
      }} />
    </Modal>}

    {modal==="addPost"&&<Modal title="Yeni paylaşım ekle" onClose={()=>setModal(null)}>
      <FormField label="Tarih"><Input type="date" value={form.date||""} onChange={e=>setForm(f=>({...f,date:e.target.value}))} /></FormField>
      <FormField label="Platform"><Select value={form.platform||"ig"} onChange={e=>setForm(f=>({...f,platform:e.target.value}))}>{Object.entries(platformConfig).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</Select></FormField>
      <FormField label="İçerik türü"><Select value={form.type||"Reels"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{CONTENT_TYPES.map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Başlık">
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <Input placeholder="İçerik başlığı" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
          <EmojiButton onSelect={(em)=>setForm(f=>({...f,title:(f.title||"")+em}))} size={20} />
        </div>
      </FormField>
      <FormField label="Açıklama">
        <div style={{position:"relative"}}>
          <Textarea placeholder="İçerik açıklaması" value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
          <div style={{position:"absolute",bottom:8,right:8}}><EmojiButton onSelect={(em)=>setForm(f=>({...f,description:(f.description||"")+em}))} size={20} /></div>
        </div>
      </FormField>
      <FormField label="Durum"><Select value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Planlandı</option><option value="in_progress">Hazırlanıyor</option><option value="done">Yayınlandı</option></Select></FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.title||!form.clientId)return;
        const { data, error } = await supabase.from('posts').insert({
          client_id: form.clientId, date: form.date||"—", platform: form.platform||"ig",
          type: form.type||"Reels", title: form.title, status: form.status||"planned", description: form.description||"", approval: 'pending', approval_note: '',
        }).select().single();
        if(!error && data){
          setClients(prev=>prev.map(c=>c.id===form.clientId?{...c,posts:[...c.posts,{id:data.id,date:data.date,platform:data.platform,type:data.type,title:data.title,status:data.status,description:data.description,approval:data.approval||'pending',approvalNote:data.approval_note||''}]}:c));
        }
        setModal(null);
      }} />
    </Modal>}

    {deleteModal && <Modal title="Müşteriyi Sil" onClose={()=>setDeleteModal(null)}>
      <FormField label="Silme Sebebi">
        <Select value={deleteModal.reason||""} onChange={e=>setDeleteModal({...deleteModal,reason:e.target.value})}>
          <option value="">Seç...</option>
          {CLIENT_DELETE_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </FormField>
      <FormField label="Bitiş Tarihi">
        <Input type="date" value={deleteModal.date||""} onChange={e=>setDeleteModal({...deleteModal,date:e.target.value})} />
      </FormField>
      <div style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px",marginBottom:16,fontSize:12,color:T.textMuted}}>
        ⚠️ Bu müşteri silindi olarak işaretlenecek ve Excel çıktısında görünecektir.
      </div>
      <ModalActions onClose={()=>setDeleteModal(null)} onSave={()=>handleDeleteClient(deleteModal.clientId)} />
    </Modal>}

    {messagingClient && <MessagingPanel clientId={messagingClient.id} clientName={messagingClient.name} onClose={()=>setMessagingClient(null)} />}
  </div>;
}

function ClientDetail({client,currentTab,setTab,clients,setClients,setModal,setForm,setMessagingClient,onDelete,perms}) {
  const [uploadPanel, setUploadPanel] = useState(false);
  
  // Faturalar sekmesi sadece finansal yetkisi olana görünür
  const baseTabs=[{id:"overview",lbl:"Özet"},{id:"posts",lbl:"Paylaşımlar"},{id:"calendar",lbl:"Takvim"},{id:"media",lbl:"Medya"}];
  const tabs = perms.finance ? [...baseTabs, {id:"invoices",lbl:"Faturalar"}] : baseTabs;

  // Yetkisi olmayan biri faturalar sekmesindeyse özete al
  const safeTab = (currentTab === "invoices" && !perms.finance) ? "overview" : currentTab;

  // Bu müşterinin TÜM bilgilerini Excel'e aktar (birden çok sayfa)
  const exportClientAll = async () => {
    const toplamBakiye = client.invoices.reduce((s,i)=>s+i.total,0);
    const odenenBakiye = client.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);

    // Sayfa 1: Genel bilgiler (dikey liste)
    const genelRows = [
      { "Alan": "İşletme Adı", "Bilgi": client.name },
      { "Alan": "Kategori", "Bilgi": client.category || "—" },
      { "Alan": "Sosyal Medya", "Bilgi": client.socialMedia || "—" },
      { "Alan": "Telefon", "Bilgi": client.phone || "—" },
      { "Alan": "Adres", "Bilgi": client.address || "—" },
      { "Alan": "İl", "Bilgi": client.city || "—" },
      { "Alan": "İlçe", "Bilgi": client.district || "—" },
      { "Alan": "Vergi Numarası", "Bilgi": client.taxNumber || "—" },
      { "Alan": "Vergi Dairesi", "Bilgi": client.taxOffice || "—" },
      { "Alan": "Platformlar", "Bilgi": client.platforms.map(p=>platformConfig[p]?.label).join(", ") || "—" },
      { "Alan": "Paylaşım Günleri", "Bilgi": (client.publishDays||[]).join(", ") || "—" },
      { "Alan": "Paylaşım Saatleri", "Bilgi": (client.publishTimes||[]).join(", ") || "—" },
      { "Alan": "Çekim Günleri", "Bilgi": (client.shootDays||[]).join(", ") || "—" },
      { "Alan": "Aylık Paylaşım Sayısı", "Bilgi": (client.publishDays||[]).length * 4 },
      { "Alan": "Aylık Çekim Sayısı", "Bilgi": (client.shootDays||[]).length * 4 },
      { "Alan": "Sözleşme Başlangıç", "Bilgi": client.contractStart || "—" },
    ];
    if (perms.finance) {
      genelRows.push(
        { "Alan": "Aylık Ücret (₺)", "Bilgi": client.monthlyFee || 0 },
        { "Alan": "Toplam Bakiye (₺)", "Bilgi": toplamBakiye },
        { "Alan": "Ödenen Bakiye (₺)", "Bilgi": odenenBakiye },
        { "Alan": "Kalan Bakiye (₺)", "Bilgi": toplamBakiye - odenenBakiye },
      );
    }

    const sheets = [{ name: "Genel Bilgiler", rows: genelRows, title: `${client.name.toLocaleUpperCase("tr-TR")} — MÜŞTERİ BİLGİLERİ` }];

    // Sayfa 2: Paylaşımlar
    if (client.posts.length > 0) {
      const postRows = client.posts.map(p => ({
        "Tarih": p.date || "—",
        "Platform": platformConfig[p.platform]?.label || p.platform || "—",
        "Tür": p.type || "—",
        "Başlık": p.title || "—",
        "Açıklama": p.description || "—",
        "Durum": p.status === "done" ? "Yayınlandı" : p.status === "in_progress" ? "Hazırlanıyor" : "Planlandı",
      }));
      sheets.push({ name: "Paylaşımlar", rows: postRows, title: `${client.name} — PAYLAŞIMLAR` });
    }

    // Sayfa 3: Faturalar (yetki varsa)
    if (perms.finance && client.invoices.length > 0) {
      const invRows = client.invoices.map(i => ({
        "Fatura No": i.no || "—",
        "Tarih": i.date || "—",
        "Tutar (₺)": i.amount || 0,
        "KDV (₺)": i.vat || 0,
        "Toplam (₺)": i.total || 0,
        "Durum": i.status === "paid" ? "Ödendi" : i.status === "overdue" ? "Gecikmiş" : "Bekliyor",
        "Açıklama": i.desc || "—",
      }));
      sheets.push({ name: "Faturalar", rows: invRows, title: `${client.name} — FATURALAR` });
    }

    // Sayfa 4: Medya listesi
    if (client.media.length > 0) {
      const mediaRows = client.media.map(m => ({
        "Dosya Adı": m.name,
        "Tür": m.type === "video" ? "Video" : m.type === "image" ? "Görsel" : "Dosya",
        "Boyut": m.size || "—",
        "Tarih": m.date || "—",
        "Konum": m.storageType === "google_drive" ? "Google Drive" : "Supabase",
      }));
      sheets.push({ name: "Medya", rows: mediaRows, title: `${client.name} — MEDYA DOSYALARI` });
    }

    await exportPerfectExcel(sheets, `${client.name.replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ]/g, "-")}-bilgileri.xlsx`);
  };

  return <div style={{background:T.bgSurface,border:`1px solid ${T.borderLight}`,borderTop:"none",borderRadius:"0 0 12px 12px",marginBottom:2}}>
    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 20px",gap:2,alignItems:"center",flexWrap:"wrap"}}>
      {tabs.map(t=>{const active=safeTab===t.id;return <button key={t.id} onClick={()=>setTab(t.id)} style={{fontSize:12,fontWeight:active?600:400,padding:"11px 16px",color:active?T.amberText:T.textMuted,background:"none",border:"none",borderBottom:`2px solid ${active?T.amber:"transparent"}`,cursor:"pointer",transition:"all 0.12s",whiteSpace:"nowrap"}}>{t.lbl}</button>;})}
      <div style={{marginLeft:"auto",display:"flex",gap:6}}>
        {safeTab==="posts"&&<Btn variant="primary" onClick={()=>{setModal("addPost");setForm({clientId:client.id});}} style={{fontSize:11,padding:"5px 10px"}}>+ Paylaşım</Btn>}
        {safeTab==="media"&&<Btn variant="primary" onClick={()=>setUploadPanel(true)} style={{fontSize:11,padding:"5px 10px"}}>⬆ Dosya Yükle</Btn>}
        <Btn onClick={exportClientAll} style={{fontSize:11,padding:"5px 10px",background:T.greenDim,color:T.greenText}}>📊 Excel'e Aktar</Btn>
        <Btn onClick={()=>printClientDetail(client, perms)} style={{fontSize:11,padding:"5px 10px"}}>🖨️ Yazdır</Btn>
        <Btn onClick={()=>printMonthlyReport(client)} style={{fontSize:11,padding:"5px 10px",background:T.indigoDim,color:T.indigoText}}>📄 Aylık Rapor</Btn>
        <Btn onClick={()=>setMessagingClient(client)} style={{fontSize:11,padding:"5px 10px"}}>💬 Mesaj</Btn>
        {perms.manageClients && <Btn onClick={()=>{setModal("editClient");setForm({id:client.id,name:client.name,category:client.category,phone:client.phone,address:client.address,city:client.city,district:client.district,taxNumber:client.taxNumber,taxOffice:client.taxOffice,socialMedia:client.socialMedia||"",socialPassword:client.socialPassword||"",description:client.description||"",monthlyPostQuota:client.monthlyPostQuota||"",quotaDetail:client.quotaDetail||{},contractEnd:client.contractEnd||"",monthlyFee:client.monthlyFee,publishDays:client.publishDays||[],shootDays:client.shootDays||[],publishTimes:client.publishTimes||[],platforms:client.platforms||[]});}} style={{fontSize:11,padding:"5px 10px"}}>✏️ Düzenle</Btn>}
        {perms.manageClients && <Btn onClick={onDelete} style={{fontSize:11,padding:"5px 10px",background:T.redDim,color:T.redText}}>🗑 Sil</Btn>}
      </div>
    </div>
    <div style={{padding:20}}>
      {safeTab==="overview"&&<ClientOverview client={client} perms={perms}/>}
      {safeTab==="posts"&&<ClientPosts client={client} setClients={setClients}/>}
      {safeTab==="calendar"&&<ClientCalendar client={client}/>}
      {safeTab==="media"&&<ClientMedia client={client}/>}
      {safeTab==="invoices"&&perms.finance&&<ClientInvoices client={client}/>}
    </div>
    
    {uploadPanel && <FileUploadPanel clientId={client.id} onClose={()=>setUploadPanel(false)} onUploadComplete={()=>{setUploadPanel(false);window.location.reload();}} />}
  </div>;
}

function ClientOverview({client, perms}) {
  const total=client.invoices.reduce((s,i)=>s+i.total,0);
  const paid=client.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);
  const pct=total>0?Math.round(paid/total*100):0;

  // Bu ayki gerçekleşen paylaşımlar (görevlerden)
  const now = new Date();
  const thisMonthPublishes = (client.publishesList||[]).filter(p=>{
    if(!p.publishedAt) return false;
    const d = new Date(p.publishedAt);
    return d.getFullYear()===now.getFullYear() && d.getMonth()===now.getMonth();
  });
  const totalThisMonth = thisMonthPublishes.length;

  // Gerçekleşen: platform+tür bazında say  actual[platform][type] = adet
  const actual = {};
  thisMonthPublishes.forEach(p=>{
    if(!actual[p.platform]) actual[p.platform]={};
    actual[p.platform][p.contentType] = (actual[p.platform][p.contentType]||0)+1;
  });

  // Anlaşma (detaylı kota)
  const quota = client.quotaDetail && Object.keys(client.quotaDetail).length>0 ? client.quotaDetail : {};
  const quotaTotal = Object.values(quota).reduce((s,pt)=>s+Object.values(pt).reduce((a,b)=>a+(b||0),0),0);
  const hasQuota = quotaTotal>0;

  // Karşılaştırma satırları: kota VEYA gerçekleşen olan tüm platform+tür kombinasyonları
  const compRows = [];
  const platSet = new Set([...Object.keys(quota), ...Object.keys(actual)]);
  platSet.forEach(plat=>{
    const typeSet = new Set([...Object.keys(quota[plat]||{}), ...Object.keys(actual[plat]||{})]);
    typeSet.forEach(tp=>{
      const q = quota[plat]?.[tp] || 0;
      const a = actual[plat]?.[tp] || 0;
      compRows.push({ plat, tp, q, a, over: a-q });
    });
  });
  compRows.sort((x,y)=> x.plat.localeCompare(y.plat) || x.tp.localeCompare(y.tp));
  const totalExcess = Math.max(0, totalThisMonth - quotaTotal);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:perms.finance?"repeat(4,1fr)":"repeat(3,1fr)",gap:10,marginBottom:20}}>
      {perms.finance && <StatCard label="Aylık Paket" value={fmtMoney(client.monthlyFee)} />}
      <StatCard label="Bu Ay Paylaşım" value={totalThisMonth} sub={hasQuota?`Anlaşma: ${quotaTotal}`:"Gerçekleşen"} color={totalExcess>0?T.amberText:undefined} />
      <StatCard label="Medya Dosyası" value={client.media.length} />
      {(()=>{
        if(!client.contractEnd) return <StatCard label="Sözleşme Başlangıç" value={client.contractStart} />;
        const end = new Date(client.contractEnd);
        const days = Math.ceil((end - new Date())/86400000);
        const col = days<0 ? T.redText : days<=30 ? T.amberText : T.greenText;
        const sub = days<0 ? `${Math.abs(days)} gün önce bitti` : days===0 ? "Bugün bitiyor" : `${days} gün kaldı`;
        return <StatCard label="Sözleşme Bitiş" value={end.toLocaleDateString("tr-TR")} sub={sub} color={col} />;
      })()}
    </div>

    {/* Paylaşım Sayımı — detaylı anlaşma karşılaştırması (madde 9) */}
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16,marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:11,color:T.textMuted,fontWeight:600,textTransform:"uppercase"}}>📊 Bu Ayki Paylaşım Sayımı (Anlaşma Karşılaştırması)</div>
        {hasQuota && (
          totalExcess>0
            ? <span style={{fontSize:12,fontWeight:700,padding:"4px 12px",borderRadius:8,background:T.amberDim,color:T.amberText}}>⚠️ Toplam {totalExcess} fazla paylaşım</span>
            : <span style={{fontSize:12,fontWeight:600,padding:"4px 12px",borderRadius:8,background:T.greenDim,color:T.greenText}}>✓ {totalThisMonth} / {quotaTotal} anlaşma içinde</span>
        )}
      </div>
      {compRows.length===0 ? (
        <div style={{fontSize:12,color:T.textMuted,textAlign:"center",padding:"16px 0"}}>Anlaşma tanımlanmamış ve bu ay paylaşım yok. (Müşteriyi düzenleyip anlaşma girin; görevleri "Paylaşım Yapıldı"ya taşıyınca sayılır)</div>
      ) : (
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:400}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${T.border}`}}>
                <th style={{textAlign:"left",fontSize:10,color:T.textMuted,fontWeight:600,padding:"6px 8px"}}>PLATFORM</th>
                <th style={{textAlign:"left",fontSize:10,color:T.textMuted,fontWeight:600,padding:"6px 8px"}}>İÇERİK</th>
                <th style={{textAlign:"center",fontSize:10,color:T.textMuted,fontWeight:600,padding:"6px 8px"}}>ANLAŞMA</th>
                <th style={{textAlign:"center",fontSize:10,color:T.textMuted,fontWeight:600,padding:"6px 8px"}}>YAPILAN</th>
                <th style={{textAlign:"center",fontSize:10,color:T.textMuted,fontWeight:600,padding:"6px 8px"}}>DURUM</th>
              </tr>
            </thead>
            <tbody>
              {compRows.map((r,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{fontSize:12,color:T.textPrimary,padding:"7px 8px"}}>{platLabel(r.plat)}</td>
                  <td style={{fontSize:12,color:T.textSecondary,padding:"7px 8px"}}>{typeLabel(r.tp)}</td>
                  <td style={{fontSize:12,color:T.textMuted,textAlign:"center",padding:"7px 8px"}}>{r.q||"—"}</td>
                  <td style={{fontSize:12,fontWeight:700,color:T.textPrimary,textAlign:"center",padding:"7px 8px"}}>{r.a}</td>
                  <td style={{textAlign:"center",padding:"7px 8px"}}>
                    {r.over>0
                      ? <span style={{fontSize:10,fontWeight:700,padding:"2px 8px",borderRadius:5,background:T.amberDim,color:T.amberText}}>+{r.over} fazla</span>
                      : r.q>0 && r.a>=r.q
                        ? <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:5,background:T.greenDim,color:T.greenText}}>✓ tamam</span>
                        : r.q>0
                          ? <span style={{fontSize:10,fontWeight:600,padding:"2px 8px",borderRadius:5,background:T.bgSurface,color:T.textMuted}}>{r.q-r.a} kaldı</span>
                          : <span style={{fontSize:10,color:T.textMuted}}>—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>

    <div style={{display:"grid",gridTemplateColumns:perms.finance?"1fr 1fr":"1fr",gap:16,marginBottom:16}}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:8,fontWeight:500,textTransform:"uppercase"}}>İşletme Bilgileri</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12}}>
          <div><span style={{color:T.textMuted}}>Telefon:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.phone||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Sosyal Medya:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.socialMedia||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Sosyal Medya Şifresi:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.socialPassword||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Şehir:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.city||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Vergi No:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.taxNumber||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Vergi Dairesi:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.taxOffice||"—"}</span></div>
          {client.description && <div style={{marginTop:4,paddingTop:8,borderTop:`1px solid ${T.border}`}}><span style={{color:T.textMuted}}>Açıklama:</span><div style={{color:T.textPrimary,marginTop:4,whiteSpace:"pre-wrap"}}>{client.description}</div></div>}
        </div>
      </div>
      {perms.finance && <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:8,fontWeight:500,textTransform:"uppercase"}}>Mali Özet</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div><div style={{fontSize:11,color:T.textMuted}}>Toplam</div><div style={{fontSize:18,fontWeight:700,color:T.textPrimary}}>{fmtMoney(total)}</div></div>
          <div><div style={{fontSize:11,color:T.textMuted}}>Tahsil Edilen</div><div style={{fontSize:14,fontWeight:700,color:T.green}}>{fmtMoney(paid)}</div></div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{flex:1,height:6,background:T.bgSurface,borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:T.amber,borderRadius:3}} />
            </div>
            <span style={{fontSize:11,color:T.textMuted}}>%{pct}</span>
          </div>
        </div>
      </div>}
    </div>
  </div>;
}

const APPROVAL_CFG = {
  pending: { label: "Beklemede", icon: "⏳", color: T.textMuted, bg: T.bgSurface },
  approved: { label: "Onaylandı", icon: "✅", color: T.greenText, bg: T.greenDim },
  revision: { label: "Revize İstendi", icon: "🔄", color: T.amberText, bg: T.amberDim },
};

function ClientPosts({client, setClients}) {
  const [noteModal, setNoteModal] = useState(null); // {postId, note}

  const setApproval = async (post, newApproval, note) => {
    const payload = { approval: newApproval, approval_note: note !== undefined ? note : (post.approvalNote || "") };
    const { error } = await supabase.from('posts').update(payload).eq('id', post.id);
    if (error) { alert("Güncellenemedi: " + error.message + "\n\nICERIK-ONAY-SQL kodunu çalıştırdığınızdan emin olun."); return; }
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, posts: c.posts.map(p => p.id === post.id ? { ...p, approval: newApproval, approvalNote: payload.approval_note } : p) } : c));
  };

  const openRevision = (post) => setNoteModal({ postId: post.id, note: post.approvalNote || "" });
  const saveRevision = async () => {
    const post = client.posts.find(p => p.id === noteModal.postId);
    if (post) await setApproval(post, "revision", noteModal.note);
    setNoteModal(null);
  };

  // Onay özeti
  const counts = { approved: 0, revision: 0, pending: 0 };
  client.posts.forEach(p => { counts[p.approval || "pending"]++; });

  return <div>
    {client.posts.length > 0 && (
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: T.greenDim, color: T.greenText, fontWeight: 600 }}>✅ {counts.approved} Onaylı</span>
        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: T.amberDim, color: T.amberText, fontWeight: 600 }}>🔄 {counts.revision} Revize</span>
        <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: T.bgSurface, color: T.textMuted, fontWeight: 600 }}>⏳ {counts.pending} Beklemede</span>
      </div>
    )}
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {client.posts.length === 0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:T.textMuted,fontSize:13}}>Henüz paylaşım eklenmemiş</div>
      )}
      {client.posts.map(p=>{
        const ap = APPROVAL_CFG[p.approval || "pending"];
        return (
        <div key={p.id} style={{padding:"12px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,borderLeft:`3px solid ${p.approval==="approved"?"#10B981":p.approval==="revision"?"#F25124":T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <PlatformTag id={p.platform}/>
            <span style={{fontSize:11,color:T.textMuted,minWidth:80}}>{p.date}</span>
            <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{p.type}</span>
            <span style={{fontSize:13,color:T.textPrimary,flex:1}}>{p.title}</span>
            <Badge status={p.status}/>
          </div>
          {/* Onay satırı */}
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,paddingTop:10,borderTop:`1px solid ${T.border}`,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:T.textMuted,fontWeight:600}}>Müşteri Onayı:</span>
            <span style={{fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:6,background:ap.bg,color:ap.color}}>{ap.icon} {ap.label}</span>
            <div style={{display:"flex",gap:5,marginLeft:"auto"}}>
              <button onClick={()=>setApproval(p,"approved")} style={{fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:6,background:p.approval==="approved"?"#10B981":T.bgInput,color:p.approval==="approved"?"#fff":T.textSecondary,border:`1px solid ${p.approval==="approved"?"#10B981":T.border}`,cursor:"pointer"}}>✅ Onaylandı</button>
              <button onClick={()=>openRevision(p)} style={{fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:6,background:p.approval==="revision"?"#F25124":T.bgInput,color:p.approval==="revision"?"#fff":T.textSecondary,border:`1px solid ${p.approval==="revision"?"#F25124":T.border}`,cursor:"pointer"}}>🔄 Revize</button>
              <button onClick={()=>setApproval(p,"pending","")} style={{fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:6,background:T.bgInput,color:T.textSecondary,border:`1px solid ${T.border}`,cursor:"pointer"}}>⏳ Beklet</button>
            </div>
          </div>
          {p.approval==="revision" && p.approvalNote && (
            <div style={{marginTop:8,padding:"8px 12px",background:T.amberDim,borderRadius:8,fontSize:12,color:T.amberText}}>🔄 <strong>Revize notu:</strong> {p.approvalNote}</div>
          )}
        </div>
      );})}
    </div>

    {noteModal && (
      <Modal title="🔄 Revize Notu" onClose={()=>setNoteModal(null)}>
        <FormField label="Müşteri neyin değişmesini istiyor?">
          <Textarea placeholder="Örn: Logo daha büyük olsun, arka plan mavi olsun..." value={noteModal.note} onChange={e=>setNoteModal(m=>({...m,note:e.target.value}))} minHeight={120} />
        </FormField>
        <ModalActions onClose={()=>setNoteModal(null)} onSave={saveRevision} saveLabel="Revize Olarak İşaretle" />
      </Modal>
    )}
  </div>;
}

function ClientMedia({client}) {
  const openMedia = (m) => {
    if (m.storageType === "google_drive" && m.storagePath) {
      window.open(m.storagePath, "_blank");
    } else if (m.storageType === "supabase" && m.storagePath) {
      const { data } = supabase.storage.from('client-media').getPublicUrl(m.storagePath);
      if (data?.publicUrl) window.open(data.publicUrl, "_blank");
    }
  };

  return <div>
    {client.media.length === 0 && (
      <div style={{textAlign:"center",padding:"40px 0",color:T.textMuted,fontSize:13}}>Henüz medya dosyası yüklenmemiş</div>
    )}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:12}}>
      {client.media.map(m=>(
        <div key={m.id} onClick={()=>openMedia(m)} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden",cursor:"pointer",transition:"all 0.15s ease"}}
          onMouseEnter={e=>e.currentTarget.style.borderColor=T.borderLight}
          onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>
          <div style={{height:80,display:"flex",alignItems:"center",justifyContent:"center",background:T.bgSurface,fontSize:28,position:"relative"}}>
            {m.type === "video" ? "🎥" : m.type === "image" ? "🖼" : "📄"}
            {m.storageType === "google_drive" && (
              <span style={{position:"absolute",top:6,right:6,fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:4,background:"rgba(66,133,244,0.9)",color:"#fff"}}>DRIVE</span>
            )}
            {m.storageType === "supabase" && (
              <span style={{position:"absolute",top:6,right:6,fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:4,background:"rgba(16,185,129,0.9)",color:"#fff"}}>SUPABASE</span>
            )}
          </div>
          <div style={{padding:"8px 10px"}}>
            <div style={{fontSize:11,fontWeight:500,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</div>
            <div style={{fontSize:10,color:T.textMuted,marginTop:2}}>{m.size} · Aç →</div>
            {(m.uploaderName || m.uploadedAt) && (
              <div style={{fontSize:9,color:T.textMuted,marginTop:4,paddingTop:4,borderTop:`1px solid ${T.border}`}}>
                {m.uploaderName && <div>👤 {m.uploaderName}</div>}
                {m.uploadedAt && <div style={{marginTop:1}}>🕐 {new Date(m.uploadedAt).toLocaleDateString("tr-TR")} {new Date(m.uploadedAt).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}</div>}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

function ClientInvoices({client}) {
  const total=client.invoices.reduce((s,i)=>s+i.total,0);
  const paid=client.invoices.filter(i=>i.status==="paid").reduce((s,i)=>s+i.total,0);

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
      <StatCard label="Toplam" value={fmtMoney(total)} />
      <StatCard label="Tahsil Edilen" value={fmtMoney(paid)} color={T.greenText} />
      <StatCard label="Bekleyen" value={fmtMoney(total-paid)} color={T.amberText} />
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {client.invoices.length === 0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:T.textMuted,fontSize:13}}>Henüz fatura eklenmemiş</div>
      )}
      {client.invoices.map(inv=>(
        <div key={inv.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500,color:T.textPrimary}}>{inv.desc}</div>
            <div style={{fontSize:11,color:T.textMuted}}>{inv.no} · {inv.date}</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:14,fontWeight:700,color:T.textPrimary}}>{fmtMoney(inv.total)}</div>
            <div style={{fontSize:10,color:T.textMuted}}>KDV dahil</div>
          </div>
          <Badge status={inv.status}/>
        </div>
      ))}
    </div>
  </div>;
}

// ─────────────────────────────────────────────
// IDEAS PAGE (YENİ)
// ─────────────────────────────────────────────
function IdeasPage() {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

  const load = async () => {
    const { data } = await supabase.from('ideas').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    const sorted = (data || []).sort((a,b)=>(a.title||"").localeCompare(b.title||"","tr",{sensitivity:"base"}));
    setIdeas(sorted);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveIdea = async () => {
    if (!form.title) return;
    const { error } = await supabase.from('ideas').insert({
      title: form.title, description: form.description || "", category: form.category || "", status: form.status || "planned",
    });
    if (error) { alert("Fikir kaydedilemedi: " + error.message + "\n\nDUZELTMELER-SQL kodunu Supabase'de çalıştırdığınızdan emin olun."); return; }
    setModal(false); setForm({});
    load();
  };

  const deleteIdea = async (id) => {
    if (!window.confirm("Bu fikir silinsin mi?")) return;
    await supabase.from('ideas').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Toplam Fikir" value={ideas.length} />
      <StatCard label="Devam Ediyor" value={ideas.filter(i=>i.status==="in_progress").length} color={T.amberText} />
      <StatCard label="Tamamlanan" value={ideas.filter(i=>i.status==="completed").length} color={T.greenText} />
    </div>

    <div style={{display:"flex",gap:10,marginBottom:20}}>
      <Btn variant="primary" onClick={()=>{setModal(true);setForm({title:"",description:"",status:"planned",category:""});}}>💡 Yeni Fikir Ekle</Btn>
      <Btn onClick={()=>{
        const statusLabels={planned:"Planlandı",in_progress:"Devam Ediyor",completed:"Tamamlandı"};
        const rows = ideas.map(i => ({
          "Başlık": i.title,
          "Açıklama": i.description || "—",
          "Kategori": i.category || "—",
          "Durum": statusLabels[i.status] || i.status,
        }));
        printData("Fikir Listesi", rows);
      }}>🖨️ Yazdır</Btn>
    </div>

    {loading ? (
      <div style={{textAlign:"center",color:T.textMuted,padding:40}}>Yükleniyor...</div>
    ) : ideas.length === 0 ? (
      <div style={{textAlign:"center",color:T.textMuted,padding:40}}>Henüz fikir yok. "💡 Yeni Fikir Ekle" ile başla!</div>
    ) : (
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
        {ideas.map(idea => (
          <Card key={idea.id} style={{padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,gap:8}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary,flex:1}}>{idea.title}</div>
              <Badge status={idea.status} />
            </div>
            <div style={{fontSize:12,color:T.textMuted,marginBottom:12,whiteSpace:"pre-wrap"}}>{idea.description}</div>
            <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"space-between"}}>
              {idea.category ? <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{idea.category}</span> : <span/>}
              <button onClick={()=>deleteIdea(idea.id)} style={{background:"none",border:"none",color:T.redText,cursor:"pointer",fontSize:13}}>🗑</button>
            </div>
          </Card>
        ))}
      </div>
    )}

    {modal && <Modal title="Yeni Fikir Ekle" onClose={()=>setModal(false)} width={700}>
      <FormField label="Başlık">
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <Input placeholder="Fikrin başlığı" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
          <EmojiButton onSelect={(em)=>setForm(f=>({...f,title:(f.title||"")+em}))} size={20} />
        </div>
      </FormField>
      <FormField label="Açıklama">
        <div style={{position:"relative"}}>
          <Textarea placeholder="Detaylı açıklama" value={form.description||""} onChange={e=>setForm(f=>({...f,description:e.target.value}))} minHeight={200} />
          <div style={{position:"absolute",bottom:8,right:8}}><EmojiButton onSelect={(em)=>setForm(f=>({...f,description:(f.description||"")+em}))} size={20} /></div>
        </div>
      </FormField>
      <FormField label="Kategori"><Input placeholder="Video, Social, Audio, vb." value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="Durum"><Select value={form.status||"planned"} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="planned">Planlandı</option><option value="in_progress">Devam Ediyor</option><option value="completed">Tamamlandı</option></Select></FormField>
      <ModalActions onClose={()=>setModal(false)} onSave={saveIdea} />
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// TASKS PAGE
// ─────────────────────────────────────────────
function TasksPage({tasks,setTasks,clients,staff,refreshData,currentStaff,perms}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({});
  const [selectedTask,setSelectedTask]=useState(null);
  const [deleteModal,setDeleteModal]=useState(null);
  const [editModal,setEditModal]=useState(false);        // görev düzenleme
  const [editForm,setEditForm]=useState({});
  const [publishModal,setPublishModal]=useState(null);   // paylaşım yapıldı modalı
  const [filterStaff,setFilterStaff]=useState("all");    // kişiye göre filtre
  const [reportModal,setReportModal]=useState(null);     // görev raporu
  const [columnModal,setColumnModal]=useState(null);     // kolon "tümünü gör" modalı
  const [approvalModal,setApprovalModal]=useState(null);  // onaya gönder (WhatsApp) modalı
  const [approvalUploading,setApprovalUploading]=useState(false);

  const cols=[
    {id:"todo",label:"Yapılacak",color:T.textMuted},
    {id:"inprogress",label:"Başlandı",color:"#7DA4C7"},
    {id:"review",label:"İncelemede",color:T.amber},
    {id:"done",label:"Tamamlandı",color:T.green},
    {id:"approval",label:"Onaya Gönderildi",color:"#25D366"},
    {id:"published",label:"Paylaşım Yapıldı",color:"#A855F7"},
  ];

  // Çalışana özel renk (kişiye göre ayırma)
  const STAFF_COLORS = ["#F25124","#6366F1","#10B981","#EC4899","#F59E0B","#8B5CF6","#06B6D4","#EF4444","#14B8A6","#A855F7"];
  const staffColor = (sid) => {
    if(!sid) return T.textMuted;
    const idx = staff.findIndex(s=>s.id===sid);
    return idx>=0 ? STAFF_COLORS[idx % STAFF_COLORS.length] : T.textMuted;
  };

  const fmtDateTime = (iso) => {
    if(!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("tr-TR") + " " + d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"});
  };

  const moveTask=async (id, newCol)=>{
    // "Paylaşım Yapıldı" kolonuna taşınıyorsa önce paylaşım bilgilerini sor
    if(newCol==="published"){
      const t = tasks.find(x=>x.id===id);
      setPublishModal({ taskId:id, client_id: t?.clientId||"", publisher_id: t?.assignedTo||"", platform:"instagram", content_type:"post" });
      return;
    }
    // "Onaya Gönderildi" kolonuna taşınıyorsa müşteri seç + WhatsApp
    if(newCol==="approval"){
      const t = tasks.find(x=>x.id===id);
      setApprovalModal({ taskId:id, client_id: t?.clientId||"", task:t });
      return;
    }
    setTasks(prev=>prev.map(t=>t.id===id?{...t,col:newCol}:t));
    if(selectedTask && selectedTask.id===id){ setSelectedTask({...selectedTask,col:newCol}); }
    await supabase.from('tasks').update({ col: newCol }).eq('id', id);
  };

  // Onaya gönder: görevi approval kolonuna taşı (müşteri seçili)
  const confirmApproval = async () => {
    const am = approvalModal;
    const cli = clients.find(c => c.id === am.client_id);
    await supabase.from('tasks').update({ col: "approval", client_id: am.client_id||null }).eq('id', am.taskId);
    setTasks(prev=>prev.map(t=>t.id===am.taskId?{...t,col:"approval",clientId:am.client_id||null,client:cli?.name||t.client}:t));
    if(selectedTask && selectedTask.id===am.taskId){ setSelectedTask({...selectedTask,col:"approval"}); }
    setApprovalModal(null);
  };

  // Paylaşımı onayla → publishes kaydı + görevi published yap
  const confirmPublish = async () => {
    const pm = publishModal;
    if(!pm.client_id){ alert("Lütfen paylaşım yapılan müşteriyi seçin"); return; }
    if(!pm.publisher_id){ alert("Lütfen paylaşımı yapan çalışanı seçin"); return; }
    const nowIso = new Date().toISOString();
    const { error } = await supabase.from('publishes').insert({
      task_id: pm.taskId, client_id: pm.client_id, publisher_id: pm.publisher_id,
      platform: pm.platform, content_type: pm.content_type, published_at: nowIso,
    });
    if(error){ alert("Paylaşım kaydedilemedi: "+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırın."); return; }
    await supabase.from('tasks').update({ col: "published" }).eq('id', pm.taskId);
    setTasks(prev=>prev.map(t=>t.id===pm.taskId?{...t,col:"published"}:t));
    if(selectedTask && selectedTask.id===pm.taskId){ setSelectedTask({...selectedTask,col:"published"}); }
    setPublishModal(null);
    // Müşteri verilerini yenile (takvim + paylaşım sayımı güncellensin)
    if(refreshData) await refreshData();
  };

  // Görevi yeniden ata (atama tarihini otomatik güncelle)
  const reassignTask = async (taskId, newAssignee) => {
    const val = newAssignee || null;
    const assignedAt = val ? new Date().toISOString() : null;
    await supabase.from('tasks').update({ assigned_to: val, assigned_at: assignedAt }).eq('id', taskId);
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t,assignedTo:val,assignedAt}:t));
    if(selectedTask && selectedTask.id===taskId){ setSelectedTask({...selectedTask,assignedTo:val,assignedAt}); }
  };

  // Görev düzenlemeyi kaydet
  const saveEdit = async () => {
    if(!editForm.title){ alert("Başlık boş olamaz"); return; }
    const cid = clients.find(c=>c.name===editForm.client)?.id || null;
    const { error } = await supabase.from('tasks').update({
      title: editForm.title, type: editForm.type, priority: editForm.priority,
      due_date: editForm.due||"—", client_id: cid,
    }).eq('id', editForm.id);
    if(error){ alert("Güncellenemedi: "+error.message); return; }
    setTasks(prev=>prev.map(t=>t.id===editForm.id?{...t,title:editForm.title,type:editForm.type,priority:editForm.priority,due:editForm.due,client:editForm.client,clientId:cid}:t));
    setSelectedTask(s=>s&&s.id===editForm.id?{...s,title:editForm.title,type:editForm.type,priority:editForm.priority,due:editForm.due,client:editForm.client,clientId:cid}:s);
    setEditModal(false);
  };

  const deleteTask = async (taskId) => {
    if (!deleteModal.reason || !deleteModal.note) {
      alert("Lütfen silme sebebini ve açıklamayı girin");
      return;
    }

    const { error } = await supabase.from('tasks').update({
      deleted_at: new Date().toISOString(),
      delete_reason: deleteModal.reason,
      delete_note: deleteModal.note,
    }).eq('id', taskId);

    if (error) {
      alert("HATA: Görev silinemedi!\n\n" + error.message + "\n\nSupabase'de gerekli sütunlar eksik olabilir. SQL kodunu çalıştırdığınızdan emin olun.");
      return;
    }

    setTasks(tasks.filter(t => t.id !== taskId));
    setDeleteModal(null);
    setSelectedTask(null);
  };

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.col === "done").length;
  const progressPercent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // ── Çalışan bazlı istatistikler ──
  const isAdminView = perms?.isAdmin;
  const allPublishes = clients.flatMap(c => (c.publishesList || []).map(p => ({ ...p, clientId: c.id })));
  const computeStats = (sid) => {
    const myTasks = tasks.filter(t => t.assignedTo === sid);
    const done = myTasks.filter(t => t.col === "done" || t.col === "published").length;
    const active = myTasks.filter(t => t.col === "inprogress" || t.col === "review").length;
    const todo = myTasks.filter(t => t.col === "todo").length;
    const published = myTasks.filter(t => t.col === "published").length;
    const publishCount = allPublishes.filter(p => p.publisherId === sid).length;
    const rate = myTasks.length > 0 ? Math.round(done / myTasks.length * 100) : 0;
    return { total: myTasks.length, done, active, todo, published, publishCount, rate };
  };
  // Yönetici herkesi görür; çalışan sadece kendini
  const visibleStaff = isAdminView ? staff : staff.filter(s => s.id === currentStaff?.id);
  // Üst özet çubuğu: yönetici=global, çalışan=kendi görevleri
  const viewTasks = isAdminView ? tasks : tasks.filter(t => t.assignedTo === currentStaff?.id);
  const viewDone = viewTasks.filter(t => t.col === "done" || t.col === "published").length;
  const viewPercent = viewTasks.length > 0 ? Math.round(viewDone / viewTasks.length * 100) : 0;

  const staffColorLocal = (sid) => {
    const idx = staff.findIndex(s => s.id === sid);
    const COLORS = ["#F25124","#6366F1","#10B981","#EC4899","#F59E0B","#8B5CF6","#06B6D4","#EF4444","#14B8A6","#A855F7"];
    return idx >= 0 ? COLORS[idx % COLORS.length] : T.textMuted;
  };

  // Görevin paylaşım tarihi (publishes'tan) — "Paylaşım Yapıldı" haftalık sıfırlama için
  const publishDateByTask = {};
  clients.forEach(c => (c.publishesList || []).forEach(p => {
    if (p.taskId) {
      if (!publishDateByTask[p.taskId] || new Date(p.publishedAt) > new Date(publishDateByTask[p.taskId])) {
        publishDateByTask[p.taskId] = p.publishedAt;
      }
    }
  }));
  // Bu haftanın başı (Pazartesi 00:00)
  const weekStart = (() => { const d = new Date(); const wd = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - wd); })();

  // Bir kolonun görevlerini getir (published kolonu sadece bu hafta gösterilir)
  const getColTasks = (colId) => {
    let list = tasks.filter(t => t.col === colId && (filterStaff === "all" || t.assignedTo === filterStaff));
    if (colId === "published") {
      list = list.filter(t => { const pd = publishDateByTask[t.id]; return pd && new Date(pd) >= weekStart; });
    }
    return list;
  };
  // Kolonun TÜM görevleri (hafta filtresi yok) — detay modalı için
  const getAllColTasks = (colId) => tasks.filter(t => t.col === colId && (filterStaff === "all" || t.assignedTo === filterStaff));

  // Tek görev kartı (hem kolonda hem modalda kullanılır)
  const taskCardEl = (task) => {
    const assignee = task.assignedTo ? staff.find(s => s.id === task.assignedTo) : null;
    const acolor = staffColor(task.assignedTo);
    return (
      <div key={task.id} onClick={() => { setSelectedTask(task); setColumnModal(null); }} style={{ background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 12px", cursor: "pointer", borderLeft: `3px solid ${acolor}`, transition: "all 0.12s" }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.textPrimary, marginBottom: 6 }}>{task.title}</div>
        {assignee && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: acolor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>{assignee.initials}</div>
            <span style={{ fontSize: 10, color: T.textSecondary }}>{assignee.name}</span>
          </div>
        )}
        {task.assignedAt && <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 5 }}>📌 {fmtDateTime(task.assignedAt)}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: priorityConfig[task.priority]?.bg, color: priorityConfig[task.priority]?.color }}>{priorityConfig[task.priority]?.label}</span>
          {task.client && <span style={{ fontSize: 9, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>{task.client}</span>}
        </div>
      </div>
    );
  };

  return <div>
    <div style={{marginBottom:16,padding:"16px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{isAdminView ? "Toplam Tamamlanma Oranı" : "Benim Tamamlanma Oranım"}</span>
        <span style={{fontSize:14,fontWeight:700,color:T.amber}}>{viewPercent}%</span>
      </div>
      <div style={{height:12,background:T.bgSurface,borderRadius:6,overflow:"hidden",border:`1px solid ${T.border}`}}>
        <div style={{height:"100%",width:`${viewPercent}%`,background:`linear-gradient(90deg, ${T.indigo}, ${T.amber}, ${T.green})`,borderRadius:6,transition:"width 0.6s ease",boxShadow:`0 0 20px ${T.amber}66`}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,color:T.textMuted}}>
        <span>✓ {viewTasks.filter(t => t.col === "done" || t.col === "published").length} tamamlandı</span>
        <span>→ {viewTasks.filter(t => t.col === "inprogress").length} başlandı</span>
        <span>◐ {viewTasks.filter(t => t.col === "review").length} incelemede</span>
        <span>○ {viewTasks.filter(t => t.col === "todo").length} yapılacak</span>
      </div>
    </div>

    {/* Çalışan İstatistikleri */}
    <div style={{marginBottom:20}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:700,color:T.textPrimary}}>📊 {isAdminView ? "Çalışan İstatistikleri" : "İstatistiklerim"}</span>
        {isAdminView && (
          <Btn onClick={()=>{
            const rows = staff.map(s=>{ const st=computeStats(s.id); return {
              "Çalışan": s.name, "Toplam Görev": st.total, "Tamamlanan": st.done, "Aktif": st.active,
              "Yapılacak": st.todo, "Paylaşım Yapıldı": st.publishCount, "Tamamlanma %": st.rate+"%",
            };});
            if(typeof exportPerfectExcel==="function") exportPerfectExcel([{name:"İstatistikler", rows, title:"PANORMOS MEDYA — ÇALIŞAN İSTATİSTİKLERİ"}], "calisan-istatistikleri.xlsx");
            else printData("Çalışan İstatistikleri", rows);
          }} style={{fontSize:11,padding:"5px 10px"}}>📊 Excel</Btn>
        )}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:12}}>
        {visibleStaff.map(s=>{
          const st = computeStats(s.id);
          const col = staffColorLocal(s.id);
          return (
            <div key={s.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:14,borderTop:`3px solid ${col}`}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff"}}>{s.initials}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                  <div style={{fontSize:10,color:T.textMuted}}>{s.role}</div>
                </div>
                <div style={{fontSize:18,fontWeight:800,color:col}}>{st.rate}%</div>
              </div>
              <div style={{height:6,background:T.bgSurface,borderRadius:3,overflow:"hidden",marginBottom:12}}>
                <div style={{height:"100%",width:`${st.rate}%`,background:col,borderRadius:3,transition:"width 0.5s"}} />
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{background:T.bgInput,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:18,fontWeight:700,color:T.textPrimary}}>{st.total}</div><div style={{fontSize:9,color:T.textMuted}}>TOPLAM GÖREV</div></div>
                <div style={{background:T.bgInput,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:18,fontWeight:700,color:T.greenText}}>{st.done}</div><div style={{fontSize:9,color:T.textMuted}}>TAMAMLANAN</div></div>
                <div style={{background:T.bgInput,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:18,fontWeight:700,color:"#7DA4C7"}}>{st.active}</div><div style={{fontSize:9,color:T.textMuted}}>AKTİF</div></div>
                <div style={{background:T.bgInput,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:18,fontWeight:700,color:"#A855F7"}}>{st.publishCount}</div><div style={{fontSize:9,color:T.textMuted}}>PAYLAŞIM</div></div>
              </div>
            </div>
          );
        })}
        {visibleStaff.length===0 && <div style={{fontSize:12,color:T.textMuted,padding:20}}>İstatistik için çalışan bulunamadı.</div>}
      </div>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <Btn variant="primary" onClick={()=>{setModal(true);setForm({title:"",client:clients[0]?.name||"",assignee:staff[0]?.initials||"",type:"Tasarım",priority:"mid",due:""});}}>+ Görev ekle</Btn>
      <Btn onClick={()=>{
        const colLabels={todo:"Yapılacak",inprogress:"Başlandı",review:"İncelemede",done:"Tamamlandı",approval:"Onaya Gönderildi",published:"Paylaşım Yapıldı"};
        const rows = tasks.map(t => ({
          "Görev": t.title,
          "Müşteri": t.client || "—",
          "Atanan": staff.find(s=>s.id===t.assignedTo)?.name || "—",
          "Atanma Tarihi": t.assignedAt ? fmtDateTime(t.assignedAt) : "—",
          "Durum": colLabels[t.col] || t.col,
          "Öncelik": priorityConfig[t.priority]?.label || "—",
          "Son Tarih": t.due || "—",
        }));
        printData("Görev Listesi", rows);
      }}>🖨️ Yazdır</Btn>
      {isAdminView && <Btn onClick={()=>setReportModal({period:"month"})}>📊 Rapor</Btn>}
    </div>

    {selectedTask && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setSelectedTask(null)}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:400}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:16,fontWeight:600,color:T.textPrimary}}>{selectedTask.title}</div>
            <button onClick={()=>setSelectedTask(null)} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Müşteri</div><div style={{fontSize:13,color:T.textPrimary}}>{selectedTask.client||"—"}</div></div>
            <div style={{display:"flex",gap:12}}>
              <div style={{flex:1}}><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Tür</div><div style={{fontSize:13,color:T.textPrimary}}>{selectedTask.type||"—"}</div></div>
              <div style={{flex:1}}><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Son Tarih</div><div style={{fontSize:13,color:T.textPrimary}}>{selectedTask.due||"—"}</div></div>
            </div>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>👤 Atanan Kişi</div>
              <Select value={selectedTask.assignedTo||""} onChange={e=>reassignTask(selectedTask.id, e.target.value)}>
                <option value="">Atanmadı</option>
                {staff.map(s=><option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </Select>
              {selectedTask.assignedAt && <div style={{fontSize:11,color:T.amberText,marginTop:6}}>📌 Atandı: {fmtDateTime(selectedTask.assignedAt)}</div>}
            </div>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Durum</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                {cols.map(c=>(
                  <button key={c.id} onClick={()=>moveTask(selectedTask.id, c.id)} style={{padding:"7px 4px",fontSize:10,fontWeight:600,borderRadius:6,background:selectedTask.col===c.id?T.amber:T.bgSurface,color:selectedTask.col===c.id?T.white:T.textMuted,border:`1px solid ${T.border}`,cursor:"pointer"}}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setDeleteModal({taskId:selectedTask.id,reason:"",note:""});}} style={{padding:"6px 12px",fontSize:12,fontWeight:600,borderRadius:8,background:T.redDim,color:T.redText,border:"none",cursor:"pointer"}}>🗑 Sil</button>
            <button onClick={()=>{setEditForm({id:selectedTask.id,title:selectedTask.title,client:selectedTask.client,type:selectedTask.type||"Tasarım",priority:selectedTask.priority||"mid",due:selectedTask.due||""});setEditModal(true);}} style={{padding:"6px 12px",fontSize:12,fontWeight:600,borderRadius:8,background:T.bgSurface,color:T.textSecondary,border:`1px solid ${T.border}`,cursor:"pointer"}}>✏️ Düzenle</button>
            <button onClick={()=>setSelectedTask(null)} style={{padding:"6px 12px",fontSize:12,fontWeight:600,borderRadius:8,background:T.amber,color:T.white,border:"none",cursor:"pointer"}}>Kapat</button>
          </div>
        </div>
      </div>
    )}

    {deleteModal && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1001}} onClick={()=>setDeleteModal(null)}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:420}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:600,color:T.textPrimary,marginBottom:16}}>Görevi Sil</div>
          <FormField label="Silme Sebebi">
            <Select value={deleteModal.reason} onChange={e=>setDeleteModal({...deleteModal,reason:e.target.value})}>
              <option value="">Seç...</option>
              {TASK_DELETE_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Açıklama">
            <Textarea placeholder="Neden silindi?" value={deleteModal.note} onChange={e=>setDeleteModal({...deleteModal,note:e.target.value})} />
          </FormField>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn onClick={()=>setDeleteModal(null)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={()=>deleteTask(deleteModal.taskId)}>Sil</Btn>
          </div>
        </div>
      </div>
    )}

    {/* Kişiye göre filtre */}
    <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
      <span style={{fontSize:11,color:T.textMuted,fontWeight:600,marginRight:4}}>Kişi:</span>
      <button onClick={()=>setFilterStaff("all")} style={{fontSize:11,fontWeight:filterStaff==="all"?600:400,padding:"5px 12px",borderRadius:8,background:filterStaff==="all"?T.amber:T.bgInput,color:filterStaff==="all"?"#fff":T.textSecondary,border:`1px solid ${filterStaff==="all"?T.amber:T.border}`,cursor:"pointer"}}>Tümü</button>
      {staff.map(s=>(
        <button key={s.id} onClick={()=>setFilterStaff(s.id)} style={{fontSize:11,fontWeight:filterStaff===s.id?600:400,padding:"5px 10px",borderRadius:8,background:filterStaff===s.id?staffColor(s.id):T.bgInput,color:filterStaff===s.id?"#fff":T.textSecondary,border:`1px solid ${filterStaff===s.id?staffColor(s.id):T.border}`,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>
          <span style={{width:10,height:10,borderRadius:"50%",background:staffColor(s.id),display:"inline-block"}} />{s.name}
        </button>
      ))}
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10}}>
      {cols.map(col=>{
        const colTasks = getColTasks(col.id);
        const allTasks = getAllColTasks(col.id);
        const shown = colTasks.slice(0, 6);
        // Gizli = (kolonda gösterilmeyenler) + (published'da eski haftalar)
        const hiddenCount = allTasks.length - shown.length;
        return (
        <div key={col.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:12,fontWeight:600,color:col.color}}>{col.label}{col.id==="published" && <span style={{fontSize:8,color:T.textMuted,marginLeft:4}}>(bu hafta)</span>}</span>
            <span style={{fontSize:10,background:T.bgSurface,color:T.textMuted,borderRadius:20,padding:"1px 8px"}}>{colTasks.length}</span>
          </div>
          {colTasks.length===0 && <div style={{fontSize:10,color:T.textMuted,textAlign:"center",padding:"12px 0"}}>—</div>}
          {shown.map(taskCardEl)}
          {hiddenCount>0 && (
            <button onClick={()=>setColumnModal({colId:col.id,label:col.label,color:col.color})} style={{marginTop:2,padding:"8px",borderRadius:8,border:`1px dashed ${T.borderLight}`,background:"transparent",color:T.textSecondary,fontSize:11,fontWeight:600,cursor:"pointer"}}>
              + {hiddenCount} tane daha (detay)
            </button>
          )}
        </div>
      );})}
    </div>

    {/* Kolon "Tümünü Gör" Modalı */}
    {columnModal && (()=>{
      const list = getAllColTasks(columnModal.colId);
      return (
        <Modal title={`${columnModal.label} — Tüm Görevler (${list.length})`} onClose={()=>setColumnModal(null)} width={560}>
          {columnModal.colId==="published" && <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>ℹ️ Tahtada sadece bu haftaki paylaşımlar gösterilir (her Pazartesi sıfırlanır). Burada <strong style={{color:T.textPrimary}}>tüm zamanların</strong> paylaşımları listelenir.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:480,overflowY:"auto"}}>
            {list.length===0 ? <div style={{textAlign:"center",color:T.textMuted,padding:30}}>Görev yok</div> : list.map(taskCardEl)}
          </div>
        </Modal>
      );
    })()}

    {/* Görev Raporu Modalı (günlük/haftalık/aylık) */}
    {reportModal && (()=>{
      const now = new Date();
      let start;
      if(reportModal.period==="day"){ start = new Date(now.getFullYear(),now.getMonth(),now.getDate()); }
      else if(reportModal.period==="week"){ const d=new Date(now); const wd=(d.getDay()+6)%7; start=new Date(d.getFullYear(),d.getMonth(),d.getDate()-wd); }
      else { start = new Date(now.getFullYear(),now.getMonth(),1); }
      const inPeriod = (iso)=>{ if(!iso) return false; const d=new Date(iso); return d>=start && d<=now; };
      // Dönemdeki paylaşımlar
      const periodPublishes = allPublishes.filter(p=>inPeriod(p.publishedAt));
      const periodLabel = reportModal.period==="day"?"Bugün":reportModal.period==="week"?"Bu Hafta":"Bu Ay";
      // Çalışan bazlı: dönemde yapılan paylaşım + genel görev durumu
      const staffReport = staff.map(s=>{
        const st = computeStats(s.id);
        const periodPub = periodPublishes.filter(p=>p.publisherId===s.id).length;
        return { name:s.name, role:s.role, periodPub, ...st };
      });
      const clientName = (cid)=>clients.find(c=>c.id===cid)?.name||"—";
      return (
      <Modal title={`📊 Görev Raporu — ${periodLabel}`} onClose={()=>setReportModal(null)} width={640}>
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {[{id:"day",l:"Günlük"},{id:"week",l:"Haftalık"},{id:"month",l:"Aylık"}].map(p=>(
            <button key={p.id} onClick={()=>setReportModal({period:p.id})} style={{flex:1,padding:"8px",borderRadius:8,border:`1px solid ${reportModal.period===p.id?T.amber:T.border}`,background:reportModal.period===p.id?T.amber:T.bgInput,color:reportModal.period===p.id?"#fff":T.textSecondary,fontWeight:600,fontSize:12,cursor:"pointer"}}>{p.l}</button>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          <div style={{background:T.bgInput,borderRadius:8,padding:"12px"}}><div style={{fontSize:22,fontWeight:800,color:"#A855F7"}}>{periodPublishes.length}</div><div style={{fontSize:10,color:T.textMuted}}>DÖNEMDE PAYLAŞIM</div></div>
          <div style={{background:T.bgInput,borderRadius:8,padding:"12px"}}><div style={{fontSize:22,fontWeight:800,color:T.greenText}}>{tasks.filter(t=>t.col==="done"||t.col==="published").length}</div><div style={{fontSize:10,color:T.textMuted}}>TOPLAM TAMAMLANAN</div></div>
          <div style={{background:T.bgInput,borderRadius:8,padding:"12px"}}><div style={{fontSize:22,fontWeight:800,color:"#7DA4C7"}}>{tasks.filter(t=>t.col==="inprogress"||t.col==="review").length}</div><div style={{fontSize:10,color:T.textMuted}}>DEVAM EDEN</div></div>
        </div>

        <div style={{fontSize:12,fontWeight:700,color:T.textSecondary,marginBottom:8}}>Çalışan Bazlı</div>
        <div style={{overflowX:"auto",marginBottom:16}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{borderBottom:`1px solid ${T.border}`}}>
              <th style={{textAlign:"left",padding:"6px 8px",fontSize:10,color:T.textMuted}}>ÇALIŞAN</th>
              <th style={{textAlign:"center",padding:"6px 8px",fontSize:10,color:T.textMuted}}>{periodLabel.toUpperCase()} PAYLAŞIM</th>
              <th style={{textAlign:"center",padding:"6px 8px",fontSize:10,color:T.textMuted}}>TOPLAM GÖREV</th>
              <th style={{textAlign:"center",padding:"6px 8px",fontSize:10,color:T.textMuted}}>TAMAMLANAN</th>
              <th style={{textAlign:"center",padding:"6px 8px",fontSize:10,color:T.textMuted}}>ORAN</th>
            </tr></thead>
            <tbody>
              {staffReport.map((r,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${T.border}`}}>
                  <td style={{padding:"7px 8px",color:T.textPrimary}}>{r.name}</td>
                  <td style={{padding:"7px 8px",textAlign:"center",fontWeight:700,color:"#A855F7"}}>{r.periodPub}</td>
                  <td style={{padding:"7px 8px",textAlign:"center",color:T.textSecondary}}>{r.total}</td>
                  <td style={{padding:"7px 8px",textAlign:"center",color:T.greenText,fontWeight:600}}>{r.done}</td>
                  <td style={{padding:"7px 8px",textAlign:"center",color:T.textPrimary}}>{r.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn onClick={()=>{
            const rows = staffReport.map(r=>({
              "Çalışan":r.name, "Pozisyon":r.role||"—",
              [`${periodLabel} Paylaşım`]:r.periodPub,
              "Toplam Görev":r.total, "Tamamlanan":r.done, "Aktif":r.active, "Yapılacak":r.todo, "Tamamlanma %":r.rate+"%",
            }));
            const pubRows = periodPublishes.map(p=>({
              "Tarih":new Date(p.publishedAt).toLocaleString("tr-TR"),
              "Müşteri":clientName(p.clientId||p.client_id),
              "Çalışan":staff.find(s=>s.id===p.publisherId)?.name||"—",
              "Platform":platLabel(p.platform), "İçerik":typeLabel(p.contentType),
            }));
            exportPerfectExcel([
              {name:"Çalışan Özeti", rows, title:`PANORMOS MEDYA — GÖREV RAPORU (${periodLabel})`},
              {name:"Paylaşım Detayı", rows:pubRows, title:`PAYLAŞIMLAR (${periodLabel})`},
            ], `gorev-raporu-${reportModal.period}-${new Date().toISOString().slice(0,10)}.xlsx`);
          }} style={{fontSize:12}}>📊 Excel'e Aktar</Btn>
          <Btn variant="primary" onClick={()=>setReportModal(null)}>Kapat</Btn>
        </div>
      </Modal>
      );
    })()}

    {/* Görev Düzenleme Modalı */}
    {editModal && <Modal title="Görevi Düzenle" onClose={()=>setEditModal(false)}>
      <FormField label="Başlık"><Input value={editForm.title||""} onChange={e=>setEditForm(f=>({...f,title:e.target.value}))} /></FormField>
      <FormField label="Müşteri"><Select value={editForm.client||""} onChange={e=>setEditForm(f=>({...f,client:e.target.value}))}><option value="">—</option>{clients.map(c=><option key={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField label="Tür"><Select value={editForm.type||"Tasarım"} onChange={e=>setEditForm(f=>({...f,type:e.target.value}))}>{["Tasarım","Video","Metin","Fotoğraf"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Öncelik"><Select value={editForm.priority||"mid"} onChange={e=>setEditForm(f=>({...f,priority:e.target.value}))}><option value="high">Yüksek</option><option value="mid">Orta</option><option value="low">Düşük</option></Select></FormField>
      <FormField label="Son tarih"><Input type="date" value={editForm.due||""} onChange={e=>setEditForm(f=>({...f,due:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setEditModal(false)} onSave={saveEdit} />
    </Modal>}

    {/* Onaya Gönder Modalı (basit — sadece müşteri seç ve taşı) */}
    {approvalModal && (()=>{
      return (
      <Modal title="📤 Onaya Gönderildi" onClose={()=>setApprovalModal(null)}>
        <div style={{fontSize:12,color:T.textMuted,marginBottom:14,lineHeight:1.5}}>İçerik müşteri onayına gönderildi olarak işaretlenecek. İçeriği (video/görsel) müşteriye WhatsApp'tan kendiniz iletin, onay gelince "Paylaşım Yapıldı"ya taşıyın.</div>
        <FormField label="İçerik (Görev)">
          <div style={{padding:"10px 12px",background:T.bgInput,borderRadius:8,fontSize:13,color:T.textPrimary}}>{approvalModal.task?.title||"—"}</div>
        </FormField>
        <FormField label="Müşteri">
          <Select value={approvalModal.client_id||""} onChange={e=>setApprovalModal(m=>({...m,client_id:e.target.value}))}>
            <option value="">Seç...</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </FormField>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
          <Btn onClick={()=>setApprovalModal(null)}>Vazgeç</Btn>
          <Btn variant="primary" onClick={confirmApproval}>✅ Onaya Gönderildi Olarak İşaretle</Btn>
        </div>
      </Modal>
      );
    })()}

    {/* Paylaşım Yapıldı Modalı */}
    {publishModal && <Modal title="📤 Paylaşım Yapıldı" onClose={()=>setPublishModal(null)}>
      <div style={{fontSize:12,color:T.textMuted,marginBottom:14,lineHeight:1.5}}>Paylaşım bilgilerini girin. Tarih ve saat <strong style={{color:T.amberText}}>otomatik</strong> kaydedilecek.</div>
      <FormField label="Paylaşım Yapılan Müşteri">
        <Select value={publishModal.client_id||""} onChange={e=>setPublishModal(m=>({...m,client_id:e.target.value}))}>
          <option value="">Seç...</option>
          {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </FormField>
      <FormField label="Paylaşımı Yapan Çalışan">
        <Select value={publishModal.publisher_id||""} onChange={e=>setPublishModal(m=>({...m,publisher_id:e.target.value}))}>
          <option value="">Seç...</option>
          {staff.map(s=><option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
        </Select>
      </FormField>
      <FormField label="Platform">
        <Select value={publishModal.platform} onChange={e=>setPublishModal(m=>({...m,platform:e.target.value}))}>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="linkedin">LinkedIn</option>
          <option value="x">X (Twitter)</option>
        </Select>
      </FormField>
      <FormField label="İçerik Türü">
        <Select value={publishModal.content_type} onChange={e=>setPublishModal(m=>({...m,content_type:e.target.value}))}>
          <option value="post">Post</option>
          <option value="reels">Reels</option>
          <option value="carousel">Kaydırmalı Post (Carousel)</option>
          <option value="story">Hikaye (Story)</option>
        </Select>
      </FormField>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
        <Btn onClick={()=>setPublishModal(null)}>Vazgeç</Btn>
        <Btn variant="primary" onClick={confirmPublish}>✅ Paylaşımı Kaydet</Btn>
      </div>
    </Modal>}

    {modal&&<Modal title="Yeni görev" onClose={()=>setModal(false)}>
      <FormField label="Başlık">
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <Input placeholder="Görev" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
          <EmojiButton onSelect={(em)=>setForm(f=>({...f,title:(f.title||"")+em}))} size={20} />
        </div>
      </FormField>
      <FormField label="Müşteri"><Select value={form.client||""} onChange={e=>setForm(f=>({...f,client:e.target.value}))}>{clients.map(c=><option key={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField label="👤 Kime Atanacak"><Select value={form.assignedTo||""} onChange={e=>setForm(f=>({...f,assignedTo:e.target.value}))}><option value="">Atanmadı</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}</Select></FormField>
      <FormField label="Tür"><Select value={form.type||"Tasarım"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Tasarım","Video","Metin","Fotoğraf"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Öncelik"><Select value={form.priority||"mid"} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}><option value="high">Yüksek</option><option value="mid">Orta</option><option value="low">Düşük</option></Select></FormField>
      <FormField label="Son tarih"><Input type="date" value={form.due||""} onChange={e=>setForm(f=>({...f,due:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setModal(false)} onSave={async()=>{
        if(!form.title)return;
        const cid = clients.find(c=>c.name===form.client)?.id || null;
        const assignedAt = form.assignedTo ? new Date().toISOString() : null;
        const { data, error } = await supabase.from('tasks').insert({
          title: form.title, type: form.type||"Tasarım",
          priority: form.priority||"mid", due_date: form.due||"—", col: "todo",
          assigned_to: form.assignedTo || null, assigned_at: assignedAt, client_id: cid,
        }).select().single();
        if(error){ alert("Görev eklenemedi: "+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırıp gerekli sütunları eklediğinizden emin olun."); return; }
        if(data){
          setTasks(prev=>[...prev,{id:data.id,title:data.title,client:form.client||"",clientId:cid,col:"todo",due:form.due,priority:form.priority||"mid",type:form.type||"Tasarım",assignedTo:form.assignedTo||null,assignedAt}]);
        }
        setModal(false);
      }} />
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// SOSYAL MEDYA RAPORLARI (Meta verileri elle girilir)
// ─────────────────────────────────────────────
const REPORT_METRICS = [
  { key: "new_followers", label: "Yeni Takipçi", icon: "👥", color: "#10B981" },
  { key: "total_followers", label: "Toplam Takipçi", icon: "🫂", color: "#6366F1" },
  { key: "reach", label: "Erişim", icon: "👁️", color: "#F25124" },
  { key: "impressions", label: "Gösterim / İzlenme", icon: "📊", color: "#EC4899" },
  { key: "likes", label: "Beğeni", icon: "❤️", color: "#EF4444" },
  { key: "comments", label: "Yorum", icon: "💬", color: "#8B5CF6" },
  { key: "saves", label: "Kaydetme", icon: "🔖", color: "#F59E0B" },
  { key: "shares", label: "Paylaşım", icon: "📤", color: "#06B6D4" },
  { key: "profile_visits", label: "Profil Ziyareti", icon: "🔎", color: "#14B8A6" },
];

function ReportsPage({ clients, perms }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selClient, setSelClient] = useState(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('social_reports').select('*').order('month_ref', { ascending: false });
    setReports(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const monthLabel = (ref) => {
    if (!ref) return "—";
    const [y, m] = ref.split("-");
    return `${TR_MONTHS[parseInt(m) - 1]} ${y}`;
  };
  const monthOptions = () => {
    const opts = []; const now = new Date();
    for (let i = 0; i < 18; i++) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`); }
    return opts;
  };

  const save = async () => {
    if (!form.client_id || !form.month_ref) { alert("Müşteri ve ay zorunlu"); return; }
    setSaving(true);
    const payload = { client_id: form.client_id, month_ref: form.month_ref, notes: form.notes || "" };
    REPORT_METRICS.forEach(m => { payload[m.key] = parseInt(form[m.key]) || 0; });
    // Aynı müşteri+ay varsa güncelle, yoksa ekle
    const existing = reports.find(r => r.client_id === form.client_id && r.month_ref === form.month_ref);
    let error;
    if (existing) { ({ error } = await supabase.from('social_reports').update(payload).eq('id', existing.id)); }
    else { ({ error } = await supabase.from('social_reports').insert(payload)); }
    setSaving(false);
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nRAPORLAMA-SQL kodunu çalıştırın."); return; }
    setModal(false); setForm({}); load();
  };

  const del = async (id) => { if (!window.confirm("Bu rapor silinsin mi?")) return; await supabase.from('social_reports').delete().eq('id', id); load(); };

  // Bir müşterinin raporları (tarihe göre, eskiden yeniye grafik için)
  const clientReports = (cid) => reports.filter(r => r.client_id === cid).sort((a, b) => a.month_ref.localeCompare(b.month_ref));

  // Müşteri seçilmişse detay göster
  if (selClient) {
    const c = clients.find(x => x.id === selClient);
    const list = clientReports(selClient); // eskiden yeniye
    const listDesc = [...list].reverse(); // yeniden eskiye (kart listesi)
    return (
      <div>
        <button onClick={() => setSelClient(null)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 13, marginBottom: 14 }}>← Tüm müşteriler</button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar initials={c?.initials} color={c?.accentColor} size={44} />
            <div><div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{c?.name}</div><div style={{ fontSize: 12, color: T.textMuted }}>{list.length} aylık rapor</div></div>
          </div>
          <Btn variant="primary" onClick={() => { setForm({ client_id: selClient, month_ref: monthOptions()[0] }); setModal(true); }}>+ Yeni Ay Ekle</Btn>
        </div>

        {list.length === 0 ? (
          <div style={{ textAlign: "center", color: T.textMuted, padding: 50 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>Henüz rapor yok</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Meta Business Suite'ten verileri alıp "Yeni Ay Ekle" ile girin.</div>
          </div>
        ) : (
          <>
            {/* Takipçi trend grafiği */}
            {list.length >= 2 && <ReportTrend list={list} monthLabel={monthLabel} />}

            {/* Aylık kartlar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
              {listDesc.map((r, i) => {
                const prev = list[list.length - 1 - i - 1]; // bir önceki ay
                return (
                  <div key={r.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>{monthLabel(r.month_ref)}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn onClick={() => { const f = { client_id: r.client_id, month_ref: r.month_ref, notes: r.notes }; REPORT_METRICS.forEach(m => f[m.key] = r[m.key]); setForm(f); setModal(true); }} style={{ fontSize: 11, padding: "4px 10px" }}>✏️ Düzenle</Btn>
                        <Btn onClick={() => printSocialReport(c, r, prev, monthLabel)} style={{ fontSize: 11, padding: "4px 10px", background: T.indigoDim, color: T.indigoText }}>📄 PDF</Btn>
                        <button onClick={() => del(r.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
                      {REPORT_METRICS.map(m => {
                        const val = r[m.key] || 0;
                        const pv = prev ? (prev[m.key] || 0) : null;
                        const diff = pv !== null ? val - pv : null;
                        const pct = pv ? Math.round((diff / pv) * 100) : null;
                        return (
                          <div key={m.key} style={{ background: T.bgInput, borderRadius: 10, padding: "10px 12px" }}>
                            <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 3 }}>{m.icon} {m.label}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: T.textPrimary }}>{val.toLocaleString("tr-TR")}</div>
                            {diff !== null && diff !== 0 && (
                              <div style={{ fontSize: 10, fontWeight: 600, color: diff > 0 ? T.greenText : T.redText, marginTop: 2 }}>
                                {diff > 0 ? "▲" : "▼"} {Math.abs(diff).toLocaleString("tr-TR")}{pct !== null ? ` (%${Math.abs(pct)})` : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {r.notes && <div style={{ marginTop: 12, fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>📝 {r.notes}</div>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {modal && <ReportFormModal form={form} setForm={setForm} onClose={() => setModal(false)} onSave={save} saving={saving} monthOptions={monthOptions} monthLabel={monthLabel} clients={clients} lockClient />}
      </div>
    );
  }

  // Müşteri listesi (kimin kaç raporu var)
  const withCounts = clients.map(c => ({ c, count: reports.filter(r => r.client_id === c.id).length, last: reports.filter(r => r.client_id === c.id).sort((a, b) => b.month_ref.localeCompare(a.month_ref))[0] }));
  const nowRef = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  const missingThisMonth = withCounts.filter(w => !reports.find(r => r.client_id === w.c.id && r.month_ref === nowRef)).length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Toplam Müşteri" value={clients.length} />
        <StatCard label="Toplam Rapor" value={reports.length} color={T.greenText} />
        <StatCard label="Bu Ay Girilmemiş" value={missingThisMonth} color={missingThisMonth > 0 ? T.amberText : T.greenText} />
      </div>

      {/* Nasıl yapılır rehberi */}
      <div style={{ background: "linear-gradient(135deg,rgba(99,102,241,0.08),rgba(139,92,246,0.08))", border: `1px solid ${T.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 18 }}>📖</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Rapor Nasıl Hazırlanır? (5 Adım)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {[
            { n: "1", t: "Meta'ya Gir", d: "Meta Business Suite'i aç, sol menüden \"İstatistikler\"e tıkla." },
            { n: "2", t: "Ayı Seç", d: "Tarih aralığını \"Son 30 gün\" (veya ilgili ay) olarak ayarla." },
            { n: "3", t: "Sayıları Not Al", d: "Takipçi, erişim, beğeni, kaydetme gibi rakamları kağıda/nota yaz." },
            { n: "4", t: "Panele Gir", d: "Aşağıdan müşteriyi seç → \"Yeni Ay Ekle\" → sayıları kutulara yaz → Kaydet." },
            { n: "5", t: "PDF Gönder", d: "Rapor otomatik oluşur. \"PDF\" butonuyla indir, müşteriye WhatsApp'tan gönder." },
          ].map(s => (
            <div key={s.n} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#6366F1,#8B5CF6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, marginBottom: 2 }}>{s.t}</div>
                <div style={{ fontSize: 11.5, color: T.textMuted, lineHeight: 1.5 }}>{s.d}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 11.5, color: T.textMuted }}>
          💡 <strong style={{ color: T.textSecondary }}>İpucu:</strong> Panel her ay geçen ayla otomatik karşılaştırır (örn. "Takipçi ▲ +340 %89"). Sadece doğru sayıları girmen yeterli — grafikleri ve karşılaştırmayı panel kendi yapar.
        </div>
      </div>

      <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 14 }}>👇 Rapor girmek için bir müşteri seçin.</div>

      <div style={{marginBottom:14}}>
        <input placeholder="🔍 Müşteri ara..." value={q} onChange={e=>{setQ(e.target.value);setShowAll(false);}} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px",fontSize:13,color:T.textPrimary,outline:"none",boxSizing:"border-box"}} />
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div> : (()=>{
        const filtered = withCounts.filter(w => !q || w.c.name.toLowerCase().includes(q.toLowerCase()));
        const shown = showAll ? filtered : filtered.slice(0,10);
        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length===0 && <div style={{textAlign:"center",color:T.textMuted,padding:30,fontSize:13}}>Müşteri bulunamadı</div>}
          {shown.map(w => {
            const hasThisMonth = reports.find(r => r.client_id === w.c.id && r.month_ref === nowRef);
            return (
              <div key={w.c.id} onClick={() => setSelClient(w.c.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", borderLeft: `3px solid ${w.c.accentColor}` }}>
                <Avatar initials={w.c.initials} color={w.c.accentColor} size={38} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{w.c.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{w.count > 0 ? `${w.count} rapor · son: ${monthLabel(w.last?.month_ref)}` : "Henüz rapor yok"}</div>
                </div>
                {hasThisMonth ? <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: T.greenDim, color: T.greenText }}>✓ Bu ay girildi</span>
                  : <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: T.amberDim, color: T.amberText }}>Bu ay bekliyor</span>}
                <span style={{ fontSize: 13, color: T.textMuted }}>›</span>
              </div>
            );
          })}
          {filtered.length>10 && (
            <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:4,padding:"11px",borderRadius:10,border:`1px dashed ${T.borderLight}`,background:"transparent",color:T.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {showAll ? "▲ Daha az göster" : `▼ Tümünü göster (${filtered.length} müşteri)`}
            </button>
          )}
        </div>
        );
      })()}

      {modal && <ReportFormModal form={form} setForm={setForm} onClose={() => setModal(false)} onSave={save} saving={saving} monthOptions={monthOptions} monthLabel={monthLabel} clients={clients} />}
    </div>
  );
}

// Rapor giriş formu (modal)
function ReportFormModal({ form, setForm, onClose, onSave, saving, monthOptions, monthLabel, clients, lockClient }) {
  return (
    <Modal title="📊 Aylık Rapor Verileri" onClose={onClose} width={620}>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, padding: "10px 12px", background: T.bgInput, borderRadius: 8 }}>
        💡 Verileri <strong>Meta Business Suite → İstatistikler</strong>'den son 30 günü seçerek alın ve aşağıya girin.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 8 }}>
        <FormField label="Müşteri">
          {lockClient ? <div style={{ padding: "10px 12px", background: T.bgInput, borderRadius: 8, fontSize: 13, color: T.textPrimary }}>{clients.find(c => c.id === form.client_id)?.name || "—"}</div>
            : <Select value={form.client_id || ""} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}><option value="">Seç...</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}
        </FormField>
        <FormField label="Ay">
          <Select value={form.month_ref || ""} onChange={e => setForm(f => ({ ...f, month_ref: e.target.value }))}>
            <option value="">Seç...</option>
            {monthOptions().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </Select>
        </FormField>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 8 }}>
        {REPORT_METRICS.map(m => (
          <FormField key={m.key} label={`${m.icon} ${m.label}`}>
            <Input type="number" placeholder="0" value={form[m.key] ?? ""} onChange={e => setForm(f => ({ ...f, [m.key]: e.target.value }))} />
          </FormField>
        ))}
      </div>
      <FormField label="📝 Not (isteğe bağlı)"><Input placeholder="Örn: Reels çok iyi performans gösterdi" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onClose}>Vazgeç</Btn>
        <Btn variant="primary" onClick={onSave} disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Btn>
      </div>
    </Modal>
  );
}

// Takipçi/erişim trend grafiği (basit SVG bar)
function ReportTrend({ list, monthLabel }) {
  const metric = "total_followers";
  const hasTotalFollowers = list.some(r => (r[metric] || 0) > 0);
  const useMetric = hasTotalFollowers ? "total_followers" : "reach";
  const useLabel = hasTotalFollowers ? "Toplam Takipçi" : "Erişim";
  const data = list.slice(-6);
  const max = Math.max(1, ...data.map(r => r[useMetric] || 0));
  const H = 130;
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 4 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 16 }}>📈 {useLabel} Trendi (son {data.length} ay)</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: H + 30 }}>
        {data.map((r, i) => (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.textSecondary }}>{(r[useMetric] || 0).toLocaleString("tr-TR")}</div>
            <div style={{ width: "60%", maxWidth: 40, height: `${Math.max(4, ((r[useMetric] || 0) / max) * H)}px`, background: "linear-gradient(180deg,#6366F1,#8B5CF6)", borderRadius: "6px 6px 0 0", transition: "height .4s" }} />
            <div style={{ fontSize: 9, color: T.textMuted, textAlign: "center" }}>{monthLabel(r.month_ref).split(" ")[0].slice(0, 3)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DOSYALAR - Google Drive ekip görünürlüğü (madde 10)
// ─────────────────────────────────────────────
function DriveFilesPage({ clients }) {
  const [filesList, setFilesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    const { data } = await supabase.from('drive_files').select('*').order('uploaded_at', { ascending: false });
    const sorted = (data || []).sort((a,b)=>(a.name||"").localeCompare(b.name||"","tr",{sensitivity:"base"}));
    setFilesList(sorted);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const clientName = (cid) => clients.find(c => c.id === cid)?.name || "—";
  const fileIcon = (name) => {
    const ext = (name || "").split(".").pop().toLowerCase();
    if (["jpg","jpeg","png","gif","webp","heic","svg"].includes(ext)) return "🖼️";
    if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "🎬";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc","docx"].includes(ext)) return "📝";
    if (["xls","xlsx","csv"].includes(ext)) return "📊";
    if (["zip","rar"].includes(ext)) return "🗜️";
    return "📎";
  };
  const fmtDT = (iso) => { if(!iso) return "—"; const d=new Date(iso); return d.toLocaleDateString("tr-TR")+" "+d.toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"}); };

  const filtered = filesList.filter(f =>
    !q || (f.name||"").toLowerCase().includes(q.toLowerCase()) ||
    (f.uploader_name||"").toLowerCase().includes(q.toLowerCase()) ||
    clientName(f.client_id).toLowerCase().includes(q.toLowerCase())
  );

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
      <StatCard label="Toplam Dosya" value={filesList.length} />
      <StatCard label="Bu Ay Yüklenen" value={filesList.filter(f=>{const d=new Date(f.uploaded_at);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length} color={T.greenText} />
      <StatCard label="Yükleyen Kişi" value={new Set(filesList.map(f=>f.uploader_name).filter(Boolean)).size} />
    </div>

    <div style={{marginBottom:16}}>
      <input placeholder="🔍 Dosya, kişi veya müşteri ara..." value={q} onChange={e=>setQ(e.target.value)} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:10,padding:"11px 14px",fontSize:13,color:T.textPrimary,outline:"none",boxSizing:"border-box"}} />
    </div>

    {loading ? (
      <div style={{textAlign:"center",color:T.textMuted,padding:40}}>Yükleniyor...</div>
    ) : filtered.length === 0 ? (
      <div style={{textAlign:"center",color:T.textMuted,padding:50}}>
        <div style={{fontSize:40,marginBottom:12}}>📁</div>
        <div style={{fontSize:14,color:T.textPrimary,fontWeight:600}}>Henüz dosya yok</div>
        <div style={{fontSize:12,marginTop:6}}>Müşteri → Medya sekmesinden Google Drive'a dosya yükleyince burada herkese görünür.</div>
      </div>
    ) : (
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        {filtered.map((f,i)=>(
          <div key={f.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderBottom:i<filtered.length-1?`1px solid ${T.border}`:"none"}}>
            <div style={{fontSize:24}}>{fileIcon(f.name)}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
              <div style={{fontSize:11,color:T.textMuted,marginTop:2}}>
                👤 {f.uploader_name||"—"} · 🏢 {clientName(f.client_id)} · 🕐 {fmtDT(f.uploaded_at)}
              </div>
            </div>
            {f.link && <a href={f.link} target="_blank" rel="noopener noreferrer" style={{fontSize:11,fontWeight:600,padding:"6px 14px",borderRadius:8,background:T.amber,color:"#fff",textDecoration:"none",whiteSpace:"nowrap"}}>Aç ↗</a>}
          </div>
        ))}
      </div>
    )}
  </div>;
}

// ─────────────────────────────────────────────
// CALENDAR PAGE
// ─────────────────────────────────────────────
function CalendarPage({clients}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null); // Tıklanan günün detayı

  const cells = getMonthGrid(viewYear, viewMonth);

  const goPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1); }
    else setViewMonth(m=>m-1);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1); }
    else setViewMonth(m=>m+1);
  };
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); };

  const isRealToday = (day, currentMonth) => currentMonth && viewYear===today.getFullYear() && viewMonth===today.getMonth() && day===today.getDate();
  const getWeekday = (cellIndex) => cellIndex % 7;
  
  const TR_WEEKDAY_INDEX = {Pazartesi:0,Salı:1,Çarşamba:2,Perşembe:3,Cuma:4,Cumartesi:5,Pazar:6};
  function getWeekdayIndex(dayName) {
    const map = {
      "pazartesi":"Pazartesi", "salı":"Salı", "sali":"Salı",
      "çarşamba":"Çarşamba", "carsamba":"Çarşamba",
      "perşembe":"Perşembe", "persembe":"Perşembe",
      "cuma":"Cuma", "cumartesi":"Cumartesi", "pazar":"Pazar",
    };
    const lower = dayName.trim().toLocaleLowerCase("tr-TR");
    const normalized = map[lower] || dayName.trim();
    return TR_WEEKDAY_INDEX[normalized];
  }

  return <div>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
      <button onClick={goPrevMonth} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>‹</button>
      <span style={{fontSize:15,fontWeight:600,color:T.textPrimary,flex:1}}>{TR_MONTHS[viewMonth]} {viewYear}</span>
      <button onClick={goToday} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.amberText,cursor:"pointer",fontSize:11,fontWeight:600}}>Bugün</button>
      <button onClick={()=>{
        const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
        const rows = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(viewYear, viewMonth, d);
          let wd = date.getDay(); wd = wd === 0 ? 6 : wd - 1;
          const pub = clients.filter(c => c.publishDays.some(dn => getWeekdayIndex(dn) === wd));
          const shoot = clients.filter(c => c.shootDays.some(dn => getWeekdayIndex(dn) === wd));
          if (pub.length > 0 || shoot.length > 0) {
            rows.push({
              "Tarih": `${d} ${TR_MONTHS[viewMonth]} ${viewYear}`,
              "Gün": ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"][wd],
              "Paylaşımlar": pub.map(c=>c.name).join(", ") || "—",
              "Çekimler": shoot.map(c=>c.name).join(", ") || "—",
            });
          }
        }
        if (rows.length === 0) { alert("Bu ayda planlanmış paylaşım/çekim yok"); return; }
        printData(`İçerik Takvimi - ${TR_MONTHS[viewMonth]} ${viewYear}`, rows);
      }} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:11,fontWeight:600}}>🖨️ Yazdır</button>
      <div style={{display:"flex",gap:12}}>
        {[{l:"Paylaşım",c:T.amberText},{l:"Çekim",c:"#F9A8D4"}].map(l=>(
          <div key={l.l} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textSecondary}}><div style={{width:8,height:8,borderRadius:2,background:l.c}}/>{l.l}</div>
        ))}
      </div>
      <button onClick={goNextMonth} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
      {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map(d=><div key={d} style={{fontSize:11,color:T.textMuted,textAlign:"center",padding:"4px 0",fontWeight:600,letterSpacing:"0.04em"}}>{d}</div>)}
      {cells.map((cell,i)=>{
        const weekday = getWeekday(i);
        const isToday = isRealToday(cell.day, cell.currentMonth);
        const publishClients = cell.currentMonth ? clients.filter(c => c.publishDays.some(d => getWeekdayIndex(d) === weekday)) : [];
        const shootClients = cell.currentMonth ? clients.filter(c => c.shootDays.some(d => getWeekdayIndex(d) === weekday)) : [];
        const hasContent = publishClients.length > 0 || shootClients.length > 0;
        return <div key={i} onClick={()=>{ if(cell.currentMonth) setSelectedDay({day:cell.day, weekday, publishClients, shootClients}); }} style={{
          minHeight:90,
          background:isToday?"rgba(34,58,89,0.4)":T.bgCard,
          border:`1px solid ${isToday?"#223A5988":T.border}`,
          borderRadius:10, padding:"6px 7px",
          opacity: cell.currentMonth ? 1 : 0.35,
          cursor: cell.currentMonth ? "pointer" : "default",
          transition:"all 0.12s",
        }}
        onMouseEnter={e=>{ if(cell.currentMonth) e.currentTarget.style.borderColor=T.borderLight; }}
        onMouseLeave={e=>{ if(cell.currentMonth) e.currentTarget.style.borderColor=isToday?"#223A5988":T.border; }}>
          <div style={{fontSize:12,fontWeight:isToday?700:400,color:isToday?T.indigoText:T.textSecondary,marginBottom:5}}>{cell.day}</div>
          {publishClients.slice(0,2).map((c,ci)=>(
            <div key={"p"+ci} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:"rgba(242,81,36,0.16)",color:T.amberText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${c.accentColor}`,fontWeight:600}}>{(c.publishTimes&&c.publishTimes.length>0)?c.publishTimes[0]+" ":""}{c.name}</div>
          ))}
          {shootClients.slice(0,2).map((c,ci)=>(
            <div key={"s"+ci} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:"rgba(236,72,153,0.16)",color:"#F9A8D4",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${c.accentColor}`,fontWeight:600}}>📷 {c.name}</div>
          ))}
          {(publishClients.length+shootClients.length)>4 && <div style={{fontSize:9,color:T.textMuted}}>+{publishClients.length+shootClients.length-4}</div>}
        </div>;
      })}
    </div>

    {/* Gün Detay Modalı */}
    {selectedDay && (
      <Modal title={`${selectedDay.day} ${TR_MONTHS[viewMonth]} ${viewYear} — ${["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"][selectedDay.weekday]}`} onClose={()=>setSelectedDay(null)} width={560}>
        {selectedDay.publishClients.length === 0 && selectedDay.shootClients.length === 0 ? (
          <div style={{textAlign:"center",color:T.textMuted,fontSize:13,padding:"30px 0"}}>Bu gün için planlanmış paylaşım veya çekim yok 📭</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Paylaşımlar */}
            {selectedDay.publishClients.length > 0 && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:T.amberText,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>📅 Paylaşım Günü ({selectedDay.publishClients.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {selectedDay.publishClients.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(242,81,36,0.1)",borderRadius:10,borderLeft:`3px solid ${c.accentColor}`}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:c.accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>{c.initials}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{c.name}</div>
                        <div style={{fontSize:11,color:T.textMuted}}>{c.category||"—"}{c.platforms.length>0?" · "+c.platforms.map(p=>platformConfig[p]?.label).join(", "):""}</div>
                      </div>
                      {c.publishTimes && c.publishTimes.length > 0 && (
                        <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end"}}>
                          {c.publishTimes.map(t=><span key={t} style={{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,background:T.amberDim,color:T.amberText}}>🕐 {t}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Çekimler */}
            {selectedDay.shootClients.length > 0 && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:"#F9A8D4",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>📷 Çekim Günü ({selectedDay.shootClients.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {selectedDay.shootClients.map(c=>(
                    <div key={c.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(236,72,153,0.1)",borderRadius:10,borderLeft:`3px solid ${c.accentColor}`}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:c.accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>{c.initials}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{c.name}</div>
                        <div style={{fontSize:11,color:T.textMuted}}>{c.category||"—"}{c.phone?" · "+c.phone:""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Yazdır butonu */}
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
              <Btn onClick={()=>{
                const rows=[];
                selectedDay.publishClients.forEach(c=>rows.push({"Tür":"📅 Paylaşım","Müşteri":c.name,"Kategori":c.category||"—","Saat":(c.publishTimes||[]).join(", ")||"—","Platform":c.platforms.map(p=>platformConfig[p]?.label).join(", ")||"—"}));
                selectedDay.shootClients.forEach(c=>rows.push({"Tür":"📷 Çekim","Müşteri":c.name,"Kategori":c.category||"—","Saat":"—","Platform":"—"}));
                printData(`${selectedDay.day} ${TR_MONTHS[viewMonth]} ${viewYear} Günü Planı`, rows);
              }} style={{fontSize:12,padding:"7px 14px"}}>🖨️ Bu Günü Yazdır</Btn>
            </div>
          </div>
        )}
      </Modal>
    )}
  </div>;
}

// ─────────────────────────────────────────────
// STAFF PAGE
// ─────────────────────────────────────────────

const DEPARTURE_REASONS = [
  { id: "resignation", label: "İstifa" },
  { id: "termination", label: "Fesih" },
  { id: "retirement", label: "Emekli" },
  { id: "contract_end", label: "Sözleşme Süresi Sona Erdi" },
  { id: "other", label: "Diğer" },
];

function StaffPage({staff,setStaff,allStaff,perms}) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [departureModal, setDepartureModal] = useState(null);
  const [uploadedDocs, setUploadedDocs] = useState([]);
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const fileInputRef = useRef(null);

  const handleAddStaff = async () => {
    if (!form.name || !form.role) {
      alert("Lütfen isim ve pozisyon seçin");
      return;
    }

    const colors = ["#6366F1", "#EC4899", "#10B981"];
    const initials = form.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const color = colors[staff.length % colors.length];

    const { data, error } = await supabase.from('staff').insert({
      name: form.name,
      role: form.role,
      type: form.type || "Tam zamanlı",
      email: form.email || "",
      phone: form.phone || "",
      start_date: form.startDate || new Date().toLocaleDateString("tr-TR"),
      is_admin: form.is_admin || false,
      perm_finance: form.perm_finance || false,
      perm_manage_clients: form.perm_manage_clients || false,
      perm_manage_staff: form.perm_manage_staff || false,
      perm_accounting: form.perm_accounting || false,
      perm_reports: form.perm_reports || false,
    }).select().single();

    if (error) {
      alert("HATA: Çalışan eklenemedi!\n\n" + error.message + "\n\nSupabase'de yetki sütunları eksik olabilir. SQL kodunu çalıştırın.");
      return;
    }

    if (data) {
      // Giriş hesabı oluştur (email + şifre verildiyse)
      if (form.email && form.password) {
        if (form.password.length < 6) {
          alert("Çalışan eklendi ancak GİRİŞ HESABI oluşturulamadı: Şifre en az 6 karakter olmalı. Düzenle'den şifre belirleyebilirsiniz.");
        } else {
          const { data: rpcData, error: rpcError } = await supabase.rpc('create_staff_login', { staff_email: form.email, staff_password: form.password });
          if (rpcError) {
            alert("Çalışan eklendi ANCAK giriş hesabı oluşturulamadı:\n\n" + rpcError.message + "\n\nCALISAN-SIFRE-SQL kodunu Supabase'de çalıştırdığınızdan emin olun. Sonra 'Düzenle'den şifre verebilirsiniz.");
          } else {
            alert("✅ Çalışan eklendi ve giriş hesabı oluşturuldu!\n\nÇalışana şu bilgileri verin:\nE-posta: " + form.email + "\nŞifre: " + form.password + "\n\nÇalışan 'Giriş Yap' ile bu bilgilerle girebilir.");
          }
        }
      }
      setStaff(prev => [...prev, {
        id: data.id,
        name: data.name,
        role: data.role,
        initials,
        color,
        type: data.type || "Tam zamanlı",
        email: data.email,
        phone: data.phone,
        start: data.start_date,
        is_admin: data.is_admin,
        perm_finance: data.perm_finance,
        perm_manage_clients: data.perm_manage_clients,
        perm_manage_staff: data.perm_manage_staff,
        perm_accounting: data.perm_accounting, perm_reports: data.perm_reports,
      }]);
    }

    setModal(false);
    setForm({});
  };

  const handleEditStaff = async () => {
    if (!editForm.name || !editForm.role) {
      alert("Lütfen isim ve pozisyon girin");
      return;
    }

    const initials = editForm.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

    const { error } = await supabase.from('staff').update({
      name: editForm.name,
      role: editForm.role,
      type: editForm.type || "Tam zamanlı",
      email: editForm.email || "",
      phone: editForm.phone || "",
      start_date: editForm.startDate || "",
      is_admin: editForm.is_admin || false,
      perm_finance: editForm.perm_finance || false,
      perm_manage_clients: editForm.perm_manage_clients || false,
      perm_manage_staff: editForm.perm_manage_staff || false,
      perm_accounting: editForm.perm_accounting || false,
      perm_reports: editForm.perm_reports || false,
    }).eq('id', editModal.id);

    if (error) {
      alert("HATA: Çalışan güncellenemedi!\n\n" + error.message);
      return;
    }

    setStaff(staff.map(s => s.id === editModal.id ? {
      ...s,
      name: editForm.name,
      role: editForm.role,
      initials,
      type: editForm.type || "Tam zamanlı",
      email: editForm.email || "",
      phone: editForm.phone || "",
      start: editForm.startDate || "",
      is_admin: editForm.is_admin,
      perm_finance: editForm.perm_finance,
      perm_manage_clients: editForm.perm_manage_clients,
      perm_manage_staff: editForm.perm_manage_staff,
      perm_accounting: editForm.perm_accounting, perm_reports: editForm.perm_reports,
    } : s));

    setEditModal(null);
    setEditForm({});
  };

  const handleDeparture = async () => {
    if (!departureModal.reason || !departureModal.date) {
      alert("Lütfen ayrılış nedenini ve tarihini seçin");
      return;
    }

    const { error } = await supabase.from('staff').update({
      deleted_at: new Date().toISOString(),
      departure_reason: departureModal.reason,
      departure_date: departureModal.date,
    }).eq('id', departureModal.staffId);

    if (error) {
      alert("HATA: Çalışan ayrılış işlemi yapılamadı!\n\n" + error.message + "\n\nSupabase'de gerekli sütunlar eksik olabilir. SQL kodunu çalıştırdığınızdan emin olun.");
      return;
    }

    setStaff(staff.filter(s => s.id !== departureModal.staffId));
    setDepartureModal(null);
    setUploadedDocs([]);
  };

  const handleDocUpload = (e) => {
    const files = Array.from(e.target.files || []);
    setUploadedDocs(prev => [...prev, ...files.map(f => ({
      name: f.name,
      size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
      file: f,
    }))]);
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
      <StatCard label="Toplam Çalışan" value={staff.length} />
      <StatCard label="Tam Zamanlı" value={staff.filter(s=>s.type==="Tam zamanlı").length} color={T.greenText} />
      <StatCard label="Part-time" value={staff.filter(s=>s.type==="Part-time").length} color={T.amberText} />
      <StatCard label="Serbest" value={staff.filter(s=>s.type==="Serbest").length} color={T.indigoText} />
    </div>

    <div style={{display:"flex",gap:10,marginBottom:20}}>
      <Btn variant="primary" onClick={()=>{setModal(true);setForm({name:"",role:"",type:"Tam zamanlı",email:"",phone:"",startDate:""});}}>+ Çalışan Ekle</Btn>
      <Btn onClick={()=>{
        const rows = staff.map(s => ({
          "Ad Soyad": s.name,
          "Pozisyon": s.role,
          "Çalışan Türü": s.type,
          "E-mail": s.email || "—",
          "Telefon": s.phone || "—",
          "Başlangıç Tarihi": s.start || "—",
        }));
        printData("Çalışan Listesi", rows);
      }}>🖨️ Yazdır</Btn>
    </div>

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
      {staff.map(s=>(
        <Card key={s.id} style={{padding:20}}>
          {/* Üst: Avatar + İsim + Pozisyon */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
            <Avatar initials={s.initials} color={s.color} size={52}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:15,fontWeight:600,color:T.textPrimary}}>{s.name}</div>
              <div style={{fontSize:12,color:T.amberText,fontWeight:500,marginTop:2}}>{s.role}</div>
              <div style={{display:"inline-block",fontSize:10,color:T.textMuted,marginTop:6,padding:"3px 8px",background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:4}}>{s.type}</div>
            </div>
          </div>

          {/* Alt: İletişim Bilgileri */}
          <div style={{display:"flex",flexDirection:"column",gap:10,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,width:18,textAlign:"center"}}>✉️</span>
              <span style={{fontSize:12,color:T.textSecondary,wordBreak:"break-all"}}>{s.email || "—"}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,width:18,textAlign:"center"}}>📱</span>
              <span style={{fontSize:12,color:T.textSecondary}}>{s.phone || "—"}</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,width:18,textAlign:"center"}}>📅</span>
              <span style={{fontSize:12,color:T.textSecondary}}>{s.start || "—"}</span>
            </div>
          </div>

          {/* Butonlar */}
          <div style={{marginTop:16,paddingTop:14,borderTop:`1px solid ${T.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn onClick={()=>{setEditModal(s);setEditForm({name:s.name,role:s.role,type:s.type,email:s.email,phone:s.phone,startDate:s.start,is_admin:s.is_admin,perm_finance:s.perm_finance,perm_manage_clients:s.perm_manage_clients,perm_manage_staff:s.perm_manage_staff,perm_accounting:s.perm_accounting,perm_reports:s.perm_reports});}} style={{fontSize:11,padding:"5px 10px"}}>✏️ Düzenle</Btn>
            <Btn onClick={()=>setDepartureModal({staffId:s.id,reason:"",date:""})} style={{fontSize:11,padding:"5px 10px",background:T.redDim,color:T.redText}}>🗑 Ayrılış</Btn>
          </div>
        </Card>
      ))}
    </div>

    {modal && <Modal title="Yeni Çalışan Ekle" onClose={()=>setModal(false)}>
      <FormField label="Ad Soyad"><Input placeholder="Örn: Ayaz Gayrimenkul" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Pozisyon"><Input placeholder="Örn: Video Editor" value={form.role||""} onChange={e=>setForm(f=>({...f,role:e.target.value}))} /></FormField>
      <FormField label="Çalışan Türü"><Select value={form.type||"Tam zamanlı"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}><option value="Tam zamanlı">Tam Zamanlı</option><option value="Part-time">Part-time</option><option value="Serbest">Serbest</option></Select></FormField>
      <FormField label="E-mail"><Input placeholder="mail@example.com" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></FormField>
      <FormField label="🔑 Giriş Şifresi (çalışan bununla girecek)"><Input type="text" placeholder="En az 6 karakter" value={form.password||""} onChange={e=>setForm(f=>({...f,password:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Başlangıç Tarihi"><Input type="date" value={form.startDate||""} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} /></FormField>

      <div style={{marginTop:16,marginBottom:12,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:T.amberText,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>🔐 Yetkiler</div>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Bu çalışanın neleri görebileceğini seç</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <PermToggle label="👑 Yönetici (her şeyi görür ve yönetir)" checked={form.is_admin} onChange={()=>setForm(f=>({...f,is_admin:!f.is_admin}))} />
          {!form.is_admin && <>
            <PermToggle label="💰 Finansal Bilgiler (ciro, faturalar, ödemeler, ücretler)" checked={form.perm_finance} onChange={()=>setForm(f=>({...f,perm_finance:!f.perm_finance}))} />
            <PermToggle label="🏢 Müşteri Yönetimi (ekleme, silme)" checked={form.perm_manage_clients} onChange={()=>setForm(f=>({...f,perm_manage_clients:!f.perm_manage_clients}))} />
            <PermToggle label="👥 Çalışan Yönetimi (ekleme, silme, yetki)" checked={form.perm_manage_staff} onChange={()=>setForm(f=>({...f,perm_manage_staff:!f.perm_manage_staff}))} />
            <PermToggle label="🧮 Muhasebe (cari, giderler, ödemeler, izinler)" checked={form.perm_accounting} onChange={()=>setForm(f=>({...f,perm_accounting:!f.perm_accounting}))} />
            <PermToggle label="📊 Raporlama (sosyal medya aylık raporları)" checked={form.perm_reports} onChange={()=>setForm(f=>({...f,perm_reports:!f.perm_reports}))} />
          </>}
        </div>
      </div>

      <ModalActions onClose={()=>setModal(false)} onSave={handleAddStaff} />
    </Modal>}

    {editModal && <Modal title="Çalışan Bilgilerini Düzenle" onClose={()=>setEditModal(null)}>
      <FormField label="Ad Soyad"><Input placeholder="Örn: Ayaz Gayrimenkul" value={editForm.name||""} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Pozisyon"><Input placeholder="Örn: Video Editor" value={editForm.role||""} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))} /></FormField>
      <FormField label="Çalışan Türü"><Select value={editForm.type||"Tam zamanlı"} onChange={e=>setEditForm(f=>({...f,type:e.target.value}))}><option value="Tam zamanlı">Tam Zamanlı</option><option value="Part-time">Part-time</option><option value="Serbest">Serbest</option></Select></FormField>
      <FormField label="E-mail"><Input placeholder="mail@example.com" value={editForm.email||""} onChange={e=>setEditForm(f=>({...f,email:e.target.value}))} /></FormField>
      <FormField label="🔑 Yeni Şifre Belirle (boş bırakırsan değişmez)">
        <div style={{display:"flex",gap:6}}>
          <Input type="text" placeholder="Yeni giriş şifresi" value={editForm.newPassword||""} onChange={e=>setEditForm(f=>({...f,newPassword:e.target.value}))} />
          <Btn onClick={async()=>{
            if(!editForm.email){ alert("Önce e-posta girin"); return; }
            if(!editForm.newPassword || editForm.newPassword.length<6){ alert("Şifre en az 6 karakter olmalı"); return; }
            const { error } = await supabase.rpc('create_staff_login', { staff_email: editForm.email, staff_password: editForm.newPassword });
            if(error){ alert("Şifre ayarlanamadı:\n\n"+error.message+"\n\nCALISAN-SIFRE-SQL kodunu çalıştırın."); return; }
            alert("✅ Şifre ayarlandı!\n\nÇalışana verin:\nE-posta: "+editForm.email+"\nŞifre: "+editForm.newPassword);
            setEditForm(f=>({...f,newPassword:""}));
          }} style={{fontSize:12,padding:"0 14px",whiteSpace:"nowrap",flexShrink:0}}>Şifreyi Ayarla</Btn>
        </div>
      </FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={editForm.phone||""} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Başlangıç Tarihi"><Input type="date" value={editForm.startDate||""} onChange={e=>setEditForm(f=>({...f,startDate:e.target.value}))} /></FormField>

      <div style={{marginTop:16,marginBottom:12,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:T.amberText,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>🔐 Yetkiler</div>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Bu çalışanın neleri görebileceğini seç</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <PermToggle label="👑 Yönetici (her şeyi görür ve yönetir)" checked={editForm.is_admin} onChange={()=>setEditForm(f=>({...f,is_admin:!f.is_admin}))} />
          {!editForm.is_admin && <>
            <PermToggle label="💰 Finansal Bilgiler (ciro, faturalar, ödemeler, ücretler)" checked={editForm.perm_finance} onChange={()=>setEditForm(f=>({...f,perm_finance:!f.perm_finance}))} />
            <PermToggle label="🏢 Müşteri Yönetimi (ekleme, silme)" checked={editForm.perm_manage_clients} onChange={()=>setEditForm(f=>({...f,perm_manage_clients:!f.perm_manage_clients}))} />
            <PermToggle label="👥 Çalışan Yönetimi (ekleme, silme, yetki)" checked={editForm.perm_manage_staff} onChange={()=>setEditForm(f=>({...f,perm_manage_staff:!f.perm_manage_staff}))} />
            <PermToggle label="🧮 Muhasebe (cari, giderler, ödemeler, izinler)" checked={editForm.perm_accounting} onChange={()=>setEditForm(f=>({...f,perm_accounting:!f.perm_accounting}))} />
            <PermToggle label="📊 Raporlama (sosyal medya aylık raporları)" checked={editForm.perm_reports} onChange={()=>setEditForm(f=>({...f,perm_reports:!f.perm_reports}))} />
          </>}
        </div>
      </div>

      <ModalActions onClose={()=>setEditModal(null)} onSave={handleEditStaff} />
    </Modal>}

    {departureModal && <Modal title="Çalışan Ayrılış İşlemi" onClose={()=>setDepartureModal(null)}>
      <FormField label="Ayrılış Nedeni">
        <Select value={departureModal.reason} onChange={e=>setDepartureModal({...departureModal,reason:e.target.value})}>
          <option value="">Seç...</option>
          {DEPARTURE_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </Select>
      </FormField>
      <FormField label="Çıkış Tarihi">
        <Input type="date" value={departureModal.date||""} onChange={e=>setDepartureModal({...departureModal,date:e.target.value})} />
      </FormField>
      <FormField label="İşten Çıkış Evrakları">
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{e.preventDefault();handleDocUpload({target:{files:e.dataTransfer.files}});}}
          style={{
            border:`2px dashed ${T.amber}`,
            borderRadius:10,
            padding:"20px",
            textAlign:"center",
            cursor:"pointer",
            background:`${T.amber}12`,
            marginBottom:10,
          }}
        >
          <div style={{fontSize:28,marginBottom:8}}>📄</div>
          <div style={{fontSize:12,color:T.textPrimary,fontWeight:600}}>Evrakları sürükle ve bırak</div>
          <div style={{fontSize:10,color:T.textMuted}}>veya tıklayarak dosya seç (PDF, JPG, PNG)</div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleDocUpload}
            style={{display:"none"}}
            accept=".pdf,.jpg,.jpeg,.png"
          />
        </div>
        {uploadedDocs.length > 0 && (
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {uploadedDocs.map((doc,idx) => (
              <div key={idx} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",background:T.bgSurface,borderRadius:8,border:`1px solid ${T.border}`}}>
                <span style={{fontSize:14}}>📄</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:11,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{doc.name}</div>
                  <div style={{fontSize:10,color:T.textMuted}}>{doc.size}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </FormField>
      <div style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"12px",marginBottom:16,fontSize:11,color:T.textMuted}}>
        ⚠️ Bu çalışan silindi olarak işaretlenecektir. Ayrılış bilgileri ve evraklar kaydedilecektir.
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
        <Btn onClick={()=>setDepartureModal(null)}>Vazgeç</Btn>
        <Btn variant="primary" onClick={handleDeparture}>Ayrılış İşlemini Tamamla</Btn>
      </div>
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// ANA SAYFA (DASHBOARD)
// ─────────────────────────────────────────────
function DashboardPage({clients, staff, tasks, setPage, perms, allClients, allStaff, refreshData}) {
  const totalRevenue = clients.reduce((s,c)=>s+c.invoices.reduce((ss,i)=>ss+i.total,0),0);
  const paidRevenue = clients.reduce((s,c)=>s+c.invoices.filter(i=>i.status==="paid").reduce((ss,i)=>ss+i.total,0),0);
  const pendingRevenue = totalRevenue - paidRevenue;
  const monthlyTotal = clients.reduce((s,c)=>s+c.monthlyFee,0);
  const totalPosts = clients.reduce((s,c)=>s+c.posts.filter(p=>p.status==="done").length,0);
  const doneTasks = tasks.filter(t=>t.col==="done").length;
  const activeTasks = tasks.filter(t=>t.col!=="done").length;
  const taskProgress = tasks.length > 0 ? Math.round((doneTasks/tasks.length)*100) : 0;

  // Bugünün paylaşım/çekim günleri
  const today = new Date();
  let wd = today.getDay(); wd = wd === 0 ? 6 : wd - 1;
  const TR_WD = {Pazartesi:0,Salı:1,Çarşamba:2,Perşembe:3,Cuma:4,Cumartesi:5,Pazar:6};
  const wdIndex = (dn) => {
    const map={"pazartesi":"Pazartesi","salı":"Salı","sali":"Salı","çarşamba":"Çarşamba","carsamba":"Çarşamba","perşembe":"Perşembe","persembe":"Perşembe","cuma":"Cuma","cumartesi":"Cumartesi","pazar":"Pazar"};
    return TR_WD[map[dn.trim().toLocaleLowerCase("tr-TR")] || dn.trim()];
  };
  const todayPublish = clients.filter(c => c.publishDays.some(d => wdIndex(d) === wd));
  const todayShoot = clients.filter(c => c.shootDays.some(d => wdIndex(d) === wd));
  const todayName = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"][wd];
  const [todayModal, setTodayModal] = useState(null); // "publish" | "shoot" | null

  const NavCard = ({icon,label,value,sub,color,target}) => (
    <div onClick={()=>setPage(target)} style={{
      background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px",
      cursor:"pointer",transition:"all 0.15s ease",
    }}
    onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderLight;e.currentTarget.style.background=T.bgCardHover;}}
    onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.bgCard;}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <span style={{fontSize:22}}>{icon}</span>
        <span style={{fontSize:13,fontWeight:600,color:T.textSecondary}}>{label}</span>
      </div>
      <div style={{fontSize:28,fontWeight:700,color:color||T.textPrimary,letterSpacing:"-0.02em"}}>{value}</div>
      {sub && <div style={{fontSize:12,color:T.textMuted,marginTop:6}}>{sub}</div>}
    </div>
  );

  return <div>
    {/* Karşılama */}
    <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
      <div>
        <div style={{fontSize:22,fontWeight:700,color:T.textPrimary}}>Hoş geldin 👋</div>
        <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>{today.toLocaleDateString("tr-TR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
      </div>
      <Btn onClick={()=>{
        const rows=[];
        if(perms.finance){
          rows.push({"Bölüm":"Finansal","Bilgi":"Toplam Ciro","Değer":fmtMoney(totalRevenue)});
          rows.push({"Bölüm":"Finansal","Bilgi":"Tahsil Edilen","Değer":fmtMoney(paidRevenue)});
          rows.push({"Bölüm":"Finansal","Bilgi":"Bekleyen Tahsilat","Değer":fmtMoney(pendingRevenue)});
          rows.push({"Bölüm":"Finansal","Bilgi":"Aylık Gelir","Değer":fmtMoney(monthlyTotal)});
        }
        rows.push({"Bölüm":"Genel","Bilgi":"Aktif Müşteri","Değer":clients.length});
        rows.push({"Bölüm":"Genel","Bilgi":"Çalışan Sayısı","Değer":staff.length});
        rows.push({"Bölüm":"Görev","Bilgi":"Tamamlanan","Değer":doneTasks});
        rows.push({"Bölüm":"Görev","Bilgi":"Devam Eden","Değer":activeTasks});
        rows.push({"Bölüm":"Görev","Bilgi":"İlerleme","Değer":"%"+taskProgress});
        todayPublish.forEach(c=>rows.push({"Bölüm":"Bugün ("+todayName+")","Bilgi":"📅 Paylaşım","Değer":c.name+((c.publishTimes&&c.publishTimes.length)?" ("+c.publishTimes.join(", ")+")":"")}));
        todayShoot.forEach(c=>rows.push({"Bölüm":"Bugün ("+todayName+")","Bilgi":"📷 Çekim","Değer":c.name}));
        printData("Ana Sayfa Özeti", rows);
      }} style={{fontSize:12,padding:"7px 14px",whiteSpace:"nowrap"}}>🖨️ Yazdır</Btn>
    </div>

    {/* Finansal Özet - sadece yetkili görür */}
    {perms.finance && (
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
      <div style={{background:`linear-gradient(135deg, ${T.bgCard}, ${T.indigoDim})`,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px"}}>
        <div style={{fontSize:11,color:T.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Toplam Ciro</div>
        <div style={{fontSize:26,fontWeight:700,color:T.textPrimary}}>{fmtMoney(totalRevenue)}</div>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px"}}>
        <div style={{fontSize:11,color:T.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Tahsil Edilen</div>
        <div style={{fontSize:26,fontWeight:700,color:T.greenText}}>{fmtMoney(paidRevenue)}</div>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px"}}>
        <div style={{fontSize:11,color:T.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Bekleyen Tahsilat</div>
        <div style={{fontSize:26,fontWeight:700,color:T.amberText}}>{fmtMoney(pendingRevenue)}</div>
      </div>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px"}}>
        <div style={{fontSize:11,color:T.textMuted,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:8}}>Aylık Gelir</div>
        <div style={{fontSize:26,fontWeight:700,color:T.indigoText}}>{fmtMoney(monthlyTotal)}</div>
      </div>
    </div>
    )}

    {/* Bugün */}
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px",marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:600,color:T.textPrimary,marginBottom:14}}>📅 Bugün ({todayName})</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div>
          <div style={{fontSize:11,color:T.amberText,fontWeight:600,marginBottom:8}}>PAYLAŞIM ({todayPublish.length})</div>
          {todayPublish.length === 0 ? (
            <div style={{fontSize:12,color:T.textMuted}}>Bugün paylaşım yok</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {todayPublish.slice(0,6).map(c=>(
                <div key={c.id} style={{fontSize:12,color:T.textPrimary,padding:"6px 10px",background:"rgba(242,81,36,0.12)",borderRadius:6,borderLeft:`2px solid ${c.accentColor}`}}>{c.name}</div>
              ))}
              {todayPublish.length>6 && (
                <button onClick={()=>setTodayModal("publish")} style={{marginTop:2,padding:"7px",borderRadius:6,border:`1px dashed ${T.borderLight}`,background:"transparent",color:T.textSecondary,fontSize:11,fontWeight:600,cursor:"pointer"}}>+ {todayPublish.length-6} tane daha (detay)</button>
              )}
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:11,color:"#F9A8D4",fontWeight:600,marginBottom:8}}>ÇEKİM ({todayShoot.length})</div>
          {todayShoot.length === 0 ? (
            <div style={{fontSize:12,color:T.textMuted}}>Bugün çekim yok</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {todayShoot.slice(0,6).map(c=>(
                <div key={c.id} style={{fontSize:12,color:T.textPrimary,padding:"6px 10px",background:"rgba(236,72,153,0.12)",borderRadius:6,borderLeft:`2px solid ${c.accentColor}`}}>📷 {c.name}</div>
              ))}
              {todayShoot.length>6 && (
                <button onClick={()=>setTodayModal("shoot")} style={{marginTop:2,padding:"7px",borderRadius:6,border:`1px dashed ${T.borderLight}`,background:"transparent",color:T.textSecondary,fontSize:11,fontWeight:600,cursor:"pointer"}}>+ {todayShoot.length-6} tane daha (detay)</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Bugün detay modalı */}
    {todayModal && (()=>{
      const list = todayModal==="publish" ? todayPublish : todayShoot;
      const isPublish = todayModal==="publish";
      return (
        <Modal title={`${isPublish?"📅 Paylaşım":"📷 Çekim"} — Bugün (${list.length})`} onClose={()=>setTodayModal(null)} width={480}>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:480,overflowY:"auto"}}>
            {list.map(c=>(
              <div key={c.id} onClick={()=>{setPage("clients");setTodayModal(null);}} style={{fontSize:13,color:T.textPrimary,padding:"9px 12px",background:isPublish?"rgba(242,81,36,0.12)":"rgba(236,72,153,0.12)",borderRadius:8,borderLeft:`3px solid ${c.accentColor}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>{isPublish?"":"📷 "}{c.name}</span>
                {c.publishTimes && c.publishTimes.length>0 && isPublish && <span style={{fontSize:11,color:T.amberText}}>{c.publishTimes.join(", ")}</span>}
              </div>
            ))}
          </div>
        </Modal>
      );
    })()}

    {/* Görev İlerlemesi */}
    <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"20px",marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
        <span style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>📋 Görev İlerlemesi</span>
        <span style={{fontSize:16,fontWeight:700,color:T.amber}}>{taskProgress}%</span>
      </div>
      <div style={{height:10,background:T.bgSurface,borderRadius:5,overflow:"hidden",border:`1px solid ${T.border}`}}>
        <div style={{height:"100%",width:`${taskProgress}%`,background:`linear-gradient(90deg, ${T.indigo}, ${T.amber}, ${T.green})`,borderRadius:5,transition:"width 0.6s ease"}} />
      </div>
      <div style={{display:"flex",gap:16,marginTop:10,fontSize:12,color:T.textMuted}}>
        <span>✓ {doneTasks} tamamlandı</span>
        <span>→ {activeTasks} devam ediyor</span>
      </div>
    </div>

    {/* Hızlı Erişim Kartları */}
    <div style={{fontSize:13,fontWeight:600,color:T.textSecondary,marginBottom:12}}>Hızlı Erişim</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
      <NavCard icon="🏢" label="Müşteriler" value={clients.length} sub="Aktif müşteri" color={T.textPrimary} target="clients" />
      <NavCard icon="👥" label="Çalışanlar" value={staff.length} sub="Ekip üyesi" color={T.textPrimary} target="staff" />
      <NavCard icon="📋" label="Görevler" value={activeTasks} sub="Aktif görev" color={T.amberText} target="tasks" />
      <NavCard icon="📅" label="Bu Ay Paylaşım" value={totalPosts} sub="Yayınlanan" color={T.greenText} target="calendar" />
    </div>

    {/* GELİR-GİDER GRAFİĞİ - sadece finansal yetki */}
    {perms.finance && <RevenueChart />}

    {/* AYRILAN MÜŞTERİLER & ÇALIŞANLAR */}
    <DepartedSection allClients={allClients} allStaff={allStaff} refreshData={refreshData} perms={perms} />
  </div>;
}

// ─────────────────────────────────────────────
// GELİR-GİDER GRAFİĞİ (son 6 ay, saf SVG)
// ─────────────────────────────────────────────
function RevenueChart() {
  const [payments, setPayments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: p } = await supabase.from('client_payments').select('amount,month_ref');
        setPayments(p || []);
        const { data: e } = await supabase.from('accounting_entries').select('amount,month_ref');
        setEntries(e || []);
        const { data: ex } = await supabase.from('company_expenses').select('amount,expense_date');
        setExpenses(ex || []);
        const { data: inc } = await supabase.from('company_incomes').select('amount,income_date');
        setIncomes(inc || []);
      } catch (err) { /* tablo yoksa boş */ }
      setLoading(false);
    })();
  }, []);

  // Son 6 ay
  const months = [];
  const base = new Date(); base.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const dd = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`);
  }
  const toMonthRef = (dateStr) => dateStr ? String(dateStr).slice(0, 7) : "";

  const data = months.map(m => {
    // Gelir = müşteri ödemeleri + diğer gelirler
    const income = payments.filter(p => p.month_ref === m).reduce((s, p) => s + Number(p.amount || 0), 0)
      + incomes.filter(i => toMonthRef(i.income_date) === m).reduce((s, i) => s + Number(i.amount || 0), 0);
    // Gider = SGK/vergi/maaş + kategorili giderler
    const expense = entries.filter(e => e.month_ref === m).reduce((s, e) => s + Number(e.amount || 0), 0)
      + expenses.filter(x => toMonthRef(x.expense_date) === m).reduce((s, x) => s + Number(x.amount || 0), 0);
    return { m, income, expense, net: income - expense };
  });

  const maxVal = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));
  const totalIncome = data.reduce((s, d) => s + d.income, 0);
  const totalExpense = data.reduce((s, d) => s + d.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const margin = totalIncome > 0 ? Math.round((totalNet / totalIncome) * 100) : 0;

  const chartH = 160;

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>📊 Gelir - Gider - Kâr/Zarar (Son 6 Ay)</div>
        <div style={{ display: "flex", gap: 16, fontSize: 12 }}>
          <span style={{ color: T.textMuted }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#10B981", marginRight: 5 }} />Gelir</span>
          <span style={{ color: T.textMuted }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#EF4444", marginRight: 5 }} />Gider</span>
        </div>
      </div>

      {/* Özet */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }}>
        <div><div style={{ fontSize: 11, color: T.textMuted }}>Toplam Gelir</div><div style={{ fontSize: 17, fontWeight: 700, color: T.greenText }}>{fmtMoney(totalIncome)}</div></div>
        <div><div style={{ fontSize: 11, color: T.textMuted }}>Toplam Gider</div><div style={{ fontSize: 17, fontWeight: 700, color: T.redText }}>{fmtMoney(totalExpense)}</div></div>
        <div><div style={{ fontSize: 11, color: T.textMuted }}>Net Kâr/Zarar</div><div style={{ fontSize: 17, fontWeight: 700, color: totalNet >= 0 ? T.greenText : T.redText }}>{fmtMoney(totalNet)}</div></div>
        <div><div style={{ fontSize: 11, color: T.textMuted }}>Kâr Marjı</div><div style={{ fontSize: 17, fontWeight: 700, color: margin >= 0 ? T.greenText : T.redText }}>%{margin}</div></div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30, fontSize: 13 }}>Yükleniyor...</div>
      ) : totalIncome === 0 && totalExpense === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30, fontSize: 13 }}>Henüz gelir/gider kaydı yok. Muhasebe sekmesinden ödeme/gider girdikçe grafik dolacak.</div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: chartH + 46 }}>
          {data.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: d.net >= 0 ? T.greenText : T.redText }}>{d.net !== 0 ? (d.net > 0 ? "+" : "") + (Math.abs(d.net) >= 1000 ? (d.net / 1000).toFixed(0) + "b" : d.net) : ""}</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: chartH, width: "100%", justifyContent: "center" }}>
                <div title={`Gelir: ${fmtMoney(d.income)}`} style={{ width: "38%", maxWidth: 26, height: `${Math.max(2, (d.income / maxVal) * chartH)}px`, background: "linear-gradient(180deg,#10B981,#059669)", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
                <div title={`Gider: ${fmtMoney(d.expense)}`} style={{ width: "38%", maxWidth: 26, height: `${Math.max(2, (d.expense / maxVal) * chartH)}px`, background: "linear-gradient(180deg,#EF4444,#DC2626)", borderRadius: "4px 4px 0 0", transition: "height 0.3s" }} />
              </div>
              <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", lineHeight: 1.3 }}>{TR_MONTHS[parseInt(d.m.split("-")[1]) - 1].slice(0, 3)}<br />{d.m.split("-")[0].slice(2)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Ayrılan müşteriler ve çalışanlar bölümü (geri aktifleştirme ile)
function DepartedSection({ allClients, allStaff, refreshData, perms }) {
  const [busy, setBusy] = useState(false);
  const departedClients = (allClients || []).filter(c => c.deleted_at);
  const departedStaff = (allStaff || []).filter(s => s.deleted_at);

  const restoreClient = async (id, name) => {
    if (!window.confirm(`"${name}" tekrar aktif müşteri olacak. Onaylıyor musunuz?`)) return;
    setBusy(true);
    const { error } = await supabase.from('clients').update({ deleted_at: null, delete_reason: null, deletion_date: null }).eq('id', id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    await refreshData();
    alert(`"${name}" tekrar aktif müşteri! Bilgilerini düzenlemek için Müşteriler sayfasına gidebilirsiniz.`);
  };

  const restoreStaff = async (id, name) => {
    if (!window.confirm(`"${name}" tekrar aktif çalışan olacak. Onaylıyor musunuz?`)) return;
    setBusy(true);
    const { error } = await supabase.from('staff').update({ deleted_at: null, departure_reason: null, departure_date: null }).eq('id', id);
    setBusy(false);
    if (error) { alert("Hata: " + error.message); return; }
    await refreshData();
    alert(`"${name}" tekrar aktif çalışan! Bilgilerini düzenlemek için Çalışanlar sayfasına gidebilirsiniz.`);
  };

  if (departedClients.length === 0 && departedStaff.length === 0) return null;

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Ayrılan Müşteriler */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>🚪 Ayrılan Müşteriler</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14 }}>Kayıtları saklanıyor · tekrar aktif yapılabilir</div>
          {departedClients.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "16px 0" }}>Ayrılan müşteri yok</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {departedClients.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bgInput, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.white, flexShrink: 0 }}>{c.initials || (c.name||"?").slice(0,2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{CLIENT_DELETE_REASONS.find(r => r.id === c.delete_reason)?.label || "Ayrıldı"}{c.deletion_date ? ` · ${c.deletion_date}` : ""}</div>
                  </div>
                  {perms.manageClients && <button disabled={busy} onClick={() => restoreClient(c.id, c.name)} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, background: T.greenDim, color: T.greenText, border: `1px solid ${T.green}44`, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>↩ Aktif Yap</button>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ayrılan Çalışanlar */}
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>🚪 Ayrılan Çalışanlar</div>
          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 14 }}>Kayıtları saklanıyor · tekrar aktif yapılabilir</div>
          {departedStaff.length === 0 ? (
            <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: "16px 0" }}>Ayrılan çalışan yok</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {departedStaff.map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bgInput, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.white, flexShrink: 0 }}>{(s.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{s.role || "—"}{s.departure_date ? ` · ${s.departure_date}` : ""}</div>
                  </div>
                  {perms.manageStaff && <button disabled={busy} onClick={() => restoreStaff(s.id, s.name)} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, background: T.greenDim, color: T.greenText, border: `1px solid ${T.green}44`, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>↩ Aktif Yap</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const NAV=[
  {id:"dashboard",label:"Ana Sayfa",icon:"🏠"},
  {id:"clients",label:"Müşteriler",icon:"🏢"},
  {id:"leads",label:"Soğuk Arama",icon:"📞"},
  {id:"pricing",label:"Fiyatlar",icon:"💰"},
  {id:"calendar",label:"Takvim",icon:"📅"},
  {id:"ideas",label:"Fikirler",icon:"💡"},
  {id:"tasks",label:"Görevler",icon:"📋"},
  {id:"reports",label:"Raporlar",icon:"📊"},
  {id:"files",label:"Dosyalar",icon:"📁"},
  {id:"messages",label:"Mesajlar",icon:"💬"},
  {id:"accounting",label:"Muhasebe",icon:"🧮"},
  {id:"staff",label:"Çalışanlar",icon:"👥"},
];

// ─────────────────────────────────────────────
// FİYATLANDIRMA - yazdırma yardımcıları
// ─────────────────────────────────────────────
function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) { alert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html);
  w.document.close();
  const doPrint = () => { try { w.focus(); w.print(); } catch (e) {} };
  w.onload = doPrint;
  setTimeout(doPrint, 600);
}

const PRINT_STYLES = `
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; color:#1F2937; padding:32px; }
  .head { background:#1A2B3F; border-radius:10px; padding:26px 28px; margin-bottom:24px; }
  .logo { font-size:17px; font-weight:800; color:#fff; margin-bottom:10px; }
  .logo .m { color:#F25124; }
  .head h1 { color:#fff; font-size:24px; margin-bottom:4px; }
  .head .sub { color:#C7CDD6; font-size:12px; }
  .intro { font-size:13px; line-height:1.6; margin-bottom:22px; color:#374151; }
  .pkgs { display:flex; gap:14px; margin-bottom:20px; }
  .pkg { flex:1; border:1px solid #E5E7EB; border-radius:10px; overflow:hidden; }
  .pkg.pop { border:2px solid #F25124; }
  .pkg .ph { background:#1A2B3F; color:#fff; padding:12px; text-align:center; }
  .pkg.pop .ph { background:#F25124; }
  .pkg .ph .tag { font-size:8px; letter-spacing:0.5px; opacity:0.9; }
  .pkg .ph .nm { font-size:14px; font-weight:800; margin:2px 0; }
  .pkg .ph .tl { font-size:9px; opacity:0.85; }
  .pkg .pb { padding:14px; }
  .pkg .price { font-size:24px; font-weight:800; text-align:center; color:#1A2B3F; }
  .pkg.pop .price { color:#F25124; }
  .pkg .pn { font-size:9px; color:#8A8F98; text-align:center; margin-bottom:12px; }
  .pkg ul { list-style:none; }
  .pkg li { font-size:10px; line-height:1.5; padding:3px 0; padding-left:16px; position:relative; }
  .pkg li:before { content:"✓"; color:#10B981; font-weight:800; position:absolute; left:0; }
  h2 { font-size:16px; color:#1A2B3F; margin:22px 0 12px; }
  table { width:100%; border-collapse:collapse; }
  th { background:#1A2B3F; color:#fff; padding:9px 12px; text-align:left; font-size:11px; }
  td { padding:8px 12px; border-bottom:1px solid #E5E7EB; font-size:11px; }
  tr:nth-child(even) td { background:#F5F6F8; }
  .footer { background:#F25124; color:#fff; border-radius:8px; padding:16px 20px; margin-top:22px; display:flex; justify-content:space-between; }
  .footer .t { font-weight:800; font-size:13px; margin-bottom:3px; }
  .footer .c { font-size:11px; line-height:1.7; }
  .terms { font-size:9px; color:#8A8F98; margin-top:14px; line-height:1.5; }
  @media print { body { padding:16px; } .head,.pkg.pop .ph,.pkg .ph,th,.footer { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
`;

function printPricingCatalog(packages, addons) {
  const now = new Date().toLocaleDateString("tr-TR");
  const pkgHTML = packages.map(p => `
    <div class="pkg ${p.is_popular ? 'pop' : ''}">
      <div class="ph">
        ${p.is_popular ? '<div class="tag">★ EN POPÜLER</div>' : '<div class="tag">&nbsp;</div>'}
        <div class="nm">${p.name}</div>
        <div class="tl">${p.tagline || ''}</div>
      </div>
      <div class="pb">
        <div class="price">${fmtMoney(Number(p.price))}</div>
        <div class="pn">${p.price_note || ''}</div>
        <ul>${(p.features || []).map(f => `<li>${f}</li>`).join("")}</ul>
      </div>
    </div>`).join("");
  const addonHTML = addons.length ? `
    <h2>Ek Hizmetler</h2>
    <table><thead><tr><th>Hizmet</th><th>Fiyat</th></tr></thead><tbody>
    ${addons.map(a => `<tr><td>${a.name}</td><td><strong>${a.price_text}</strong></td></tr>`).join("")}
    </tbody></table>` : "";
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Fiyat Listesi</title><style>${PRINT_STYLES}</style></head><body>
    <div class="head"><div class="logo">panormos <span class="m">medya.</span></div><h1>Sosyal Medya Yönetimi</h1><div class="sub">Hizmet Paketleri ve Fiyat Listesi · ${now}</div></div>
    <div class="intro">İşletmenizin sosyal medya hesaplarını profesyonel ekibimize emanet edin. İçerik üretiminden reklam yönetimine kadar tüm süreci sizin için yönetiyoruz.</div>
    <div class="pkgs">${pkgHTML}</div>
    ${addonHTML}
    <div class="footer"><div><div class="t">Teklifi beğendiniz mi?</div><div style="font-size:11px;">Hemen başlayalım, size özel paket için iletişime geçin.</div></div><div class="c"><strong>Tel:</strong> 0(5XX) XXX XX XX<br><strong>E-posta:</strong> info@panormosmedya.com<br><strong>Web:</strong> panormosmedya.com</div></div>
    <div class="terms">Fiyatlara KDV dahil değildir. · Reklam bütçeleri pakete dahil değildir. · Paketler ihtiyaca göre özelleştirilebilir.</div>
  </body></html>`;
  openPrintWindow(html);
}

function printQuote(quote, addonList) {
  const now = new Date().toLocaleDateString("tr-TR");
  const selectedAddons = (quote.addons || []);
  const addonHTML = selectedAddons.length ? `
    <h2>Eklenen Hizmetler</h2>
    <table><thead><tr><th>Hizmet</th><th>Fiyat</th></tr></thead><tbody>
    ${selectedAddons.map(name => { const a = addonList.find(x => x.name === name); return `<tr><td>${name}</td><td><strong>${a ? a.price_text : ''}</strong></td></tr>`; }).join("")}
    </tbody></table>` : "";
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Fiyat Teklifi - ${quote.business_name}</title><style>${PRINT_STYLES}</style></head><body>
    <div class="head"><div class="logo">panormos <span class="m">medya.</span></div><h1>Fiyat Teklifi</h1><div class="sub">${quote.business_name} · ${now}</div></div>
    <div class="intro">Sayın <strong>${quote.business_name}</strong> yetkilisi, işletmeniz için hazırladığımız sosyal medya yönetim teklifimiz aşağıdadır.</div>
    <div class="pkgs"><div class="pkg pop" style="max-width:340px;">
      <div class="ph"><div class="tag">SEÇİLEN PAKET</div><div class="nm">${quote.package_name || 'Özel Paket'}</div><div class="tl">&nbsp;</div></div>
      <div class="pb"><div class="price">${fmtMoney(Number(quote.price))}</div><div class="pn">aylık · KDV hariç</div>
      <ul>${(quote.features || []).map(f => `<li>${f}</li>`).join("")}</ul></div>
    </div></div>
    ${addonHTML}
    ${quote.note ? `<h2>Not</h2><div class="intro">${quote.note}</div>` : ''}
    <div class="footer"><div><div class="t">Onaylıyor musunuz?</div><div style="font-size:11px;">Başlamak için bizimle iletişime geçin.</div></div><div class="c"><strong>Tel:</strong> 0(5XX) XXX XX XX<br><strong>E-posta:</strong> info@panormosmedya.com<br><strong>Web:</strong> panormosmedya.com</div></div>
    <div class="terms">Fiyatlara KDV dahil değildir. · Minimum sözleşme süresi 3 aydır. · Reklam bütçeleri pakete dahil değildir. · Bu teklif 30 gün geçerlidir.</div>
  </body></html>`;
  openPrintWindow(html);
}

const QUOTE_STATUS = {
  draft: { label: "Taslak", color: T.textMuted, bg: T.bgSurface },
  sent: { label: "Gönderildi", color: T.indigoText, bg: T.indigoDim },
  accepted: { label: "Kabul Edildi", color: T.greenText, bg: T.greenDim },
  rejected: { label: "Reddedildi", color: T.redText, bg: T.redDim },
};

// ═══════════════ FİYATLAR ANA SAYFA ═══════════════
function PricingPage() {
  const [tab, setTab] = useState("packages");
  const [packages, setPackages] = useState([]);
  const [addons, setAddons] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data: p } = await supabase.from('pricing_packages').select('*').order('sort_order');
      setPackages(p || []);
      const { data: a } = await supabase.from('pricing_addons').select('*').order('sort_order');
      setAddons(a || []);
      const { data: q } = await supabase.from('pricing_quotes').select('*').order('created_at', { ascending: false });
      setQuotes(q || []);
    } catch (e) { /* tablo yoksa */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tabs = [
    { id: "packages", lbl: "📦 Paketler" },
    { id: "addons", lbl: "➕ Ek Hizmetler" },
    { id: "quotes", lbl: "📄 Teklifler" },
  ];

  if (loading) return <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Yükleniyor...</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, paddingBottom: 2 }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return <button key={t.id} onClick={() => setTab(t.id)} style={{ fontSize: 13, fontWeight: active ? 600 : 400, padding: "9px 16px", borderRadius: "8px 8px 0 0", color: active ? T.amberText : T.textMuted, background: active ? T.bgCard : "transparent", border: "none", borderBottom: `2px solid ${active ? T.amber : "transparent"}`, cursor: "pointer" }}>{t.lbl}</button>;
        })}
      </div>
      {tab === "packages" && <PricingPackages packages={packages} addons={addons} reload={load} />}
      {tab === "addons" && <PricingAddons addons={addons} reload={load} />}
      {tab === "quotes" && <PricingQuotes packages={packages} addons={addons} quotes={quotes} reload={load} />}
    </div>
  );
}

// ── Özellik listesi editörü ──
function FeatureEditor({ features, onChange }) {
  return (
    <div>
      {(features || []).map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <Input value={f} onChange={e => { const nf = [...features]; nf[i] = e.target.value; onChange(nf); }} placeholder="Özellik..." />
          <button onClick={() => onChange(features.filter((_, x) => x !== i))} style={{ background: T.redDim, color: T.redText, border: "none", borderRadius: 8, width: 36, cursor: "pointer", flexShrink: 0 }}>×</button>
        </div>
      ))}
      <Btn onClick={() => onChange([...(features || []), ""])} style={{ fontSize: 12, padding: "6px 12px" }}>+ Özellik Ekle</Btn>
    </div>
  );
}

// ═══════════════ PAKETLER ═══════════════
function PricingPackages({ packages, addons, reload }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);

  const openAdd = () => { setEditId(null); setForm({ name: "", tagline: "", price: "", price_note: "aylık · KDV hariç", features: [""], is_popular: false }); setModal(true); };
  const openEdit = (p) => { setEditId(p.id); setForm({ name: p.name, tagline: p.tagline, price: p.price, price_note: p.price_note, features: p.features || [], is_popular: p.is_popular }); setModal(true); };

  const save = async () => {
    if (!form.name) { alert("Paket adı zorunlu"); return; }
    const payload = {
      name: form.name, tagline: form.tagline || "", price: parseFloat(form.price) || 0,
      price_note: form.price_note || "", features: (form.features || []).filter(f => f.trim()), is_popular: !!form.is_popular,
    };
    let error;
    if (editId) ({ error } = await supabase.from('pricing_packages').update(payload).eq('id', editId));
    else { payload.sort_order = (packages.length ? Math.max(...packages.map(p => p.sort_order || 0)) : 0) + 1; ({ error } = await supabase.from('pricing_packages').insert(payload)); }
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nFIYATLANDIRMA-SQL kodunu çalıştırın."); return; }
    setModal(false); reload();
  };
  const del = async (id) => { if (!window.confirm("Bu paket silinsin mi?")) return; await supabase.from('pricing_packages').delete().eq('id', id); reload(); };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={openAdd}>+ Paket Ekle</Btn>
        <Btn onClick={() => printPricingCatalog(packages, addons)} style={{ background: T.indigoDim, color: T.indigoText }}>🖨️ Fiyat Listesini Yazdır</Btn>
      </div>

      {packages.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Henüz paket yok. "+ Paket Ekle" ile başla!</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 16 }}>
          {packages.map(p => (
            <div key={p.id} style={{ background: T.bgCard, border: `2px solid ${p.is_popular ? T.amber : T.border}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ background: p.is_popular ? T.amber : T.indigo, padding: "14px 16px", textAlign: "center" }}>
                {p.is_popular && <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, letterSpacing: "0.5px", marginBottom: 2 }}>★ EN POPÜLER</div>}
                <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{p.name}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.85)" }}>{p.tagline}</div>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: p.is_popular ? T.amberText : T.textPrimary, textAlign: "center" }}>{fmtMoney(Number(p.price))}</div>
                <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginBottom: 12 }}>{p.price_note}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                  {(p.features || []).map((f, i) => (
                    <div key={i} style={{ fontSize: 11.5, color: T.textSecondary, display: "flex", gap: 6 }}><span style={{ color: T.greenText, fontWeight: 700 }}>✓</span>{f}</div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn onClick={() => openEdit(p)} style={{ fontSize: 12, padding: "6px 12px", flex: 1 }}>✏️ Düzenle</Btn>
                  <Btn onClick={() => del(p.id)} style={{ fontSize: 12, padding: "6px 12px", background: T.redDim, color: T.redText }}>🗑</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <Modal title={editId ? "Paketi Düzenle" : "Yeni Paket"} onClose={() => setModal(false)} width={560}>
          <FormField label="Paket Adı"><Input placeholder="Örn: Profesyonel" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormField>
          <FormField label="Kısa Açıklama"><Input placeholder="Örn: En çok tercih edilen" value={form.tagline || ""} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Aylık Fiyat (₺)"><Input type="number" placeholder="0" value={form.price || ""} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></FormField>
            <FormField label="Fiyat Notu"><Input placeholder="aylık · KDV hariç" value={form.price_note || ""} onChange={e => setForm(f => ({ ...f, price_note: e.target.value }))} /></FormField>
          </div>
          <FormField label="Özellikler"><FeatureEditor features={form.features} onChange={fs => setForm(f => ({ ...f, features: fs }))} /></FormField>
          <div onClick={() => setForm(f => ({ ...f, is_popular: !f.is_popular }))} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bgInput, borderRadius: 8, cursor: "pointer", marginTop: 8 }}>
            <div style={{ width: 40, height: 22, borderRadius: 11, background: form.is_popular ? T.amber : T.border, position: "relative", transition: "0.2s" }}>
              <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: form.is_popular ? 20 : 2, transition: "0.2s" }} />
            </div>
            <span style={{ fontSize: 13, color: T.textPrimary }}>★ "En Popüler" olarak işaretle</span>
          </div>
          <ModalActions onClose={() => setModal(false)} onSave={save} />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ EK HİZMETLER ═══════════════
function PricingAddons({ addons, reload }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);

  const openAdd = () => { setEditId(null); setForm({ name: "", price_text: "" }); setModal(true); };
  const openEdit = (a) => { setEditId(a.id); setForm({ name: a.name, price_text: a.price_text }); setModal(true); };
  const save = async () => {
    if (!form.name) { alert("Hizmet adı zorunlu"); return; }
    const payload = { name: form.name, price_text: form.price_text || "" };
    let error;
    if (editId) ({ error } = await supabase.from('pricing_addons').update(payload).eq('id', editId));
    else { payload.sort_order = (addons.length ? Math.max(...addons.map(a => a.sort_order || 0)) : 0) + 1; ({ error } = await supabase.from('pricing_addons').insert(payload)); }
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setModal(false); reload();
  };
  const del = async (id) => { if (!window.confirm("Silinsin mi?")) return; await supabase.from('pricing_addons').delete().eq('id', id); reload(); };

  return (
    <div>
      <Btn variant="primary" onClick={openAdd} style={{ marginBottom: 18 }}>+ Ek Hizmet Ekle</Btn>
      {addons.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Henüz ek hizmet yok</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {addons.map(a => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{a.name}</div>
                <div style={{ fontSize: 12, color: T.amberText, fontWeight: 600 }}>{a.price_text}</div>
              </div>
              <Btn onClick={() => openEdit(a)} style={{ fontSize: 12, padding: "6px 12px" }}>✏️</Btn>
              <Btn onClick={() => del(a.id)} style={{ fontSize: 12, padding: "6px 12px", background: T.redDim, color: T.redText }}>🗑</Btn>
            </div>
          ))}
        </div>
      )}
      {modal && (
        <Modal title={editId ? "Ek Hizmeti Düzenle" : "Yeni Ek Hizmet"} onClose={() => setModal(false)}>
          <FormField label="Hizmet Adı"><Input placeholder="Örn: Logo tasarımı" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormField>
          <FormField label="Fiyat Metni"><Input placeholder="Örn: ₺6.500'den başlayan" value={form.price_text || ""} onChange={e => setForm(f => ({ ...f, price_text: e.target.value }))} /></FormField>
          <ModalActions onClose={() => setModal(false)} onSave={save} />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ TEKLİFLER ═══════════════
function PricingQuotes({ packages, addons, quotes, reload }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

  const openAdd = () => { setForm({ business_name: "", package_name: "", price: "", features: [], addons: [], note: "", status: "draft" }); setModal(true); };

  const selectPackage = (name) => {
    const p = packages.find(x => x.name === name);
    if (p) setForm(f => ({ ...f, package_name: p.name, price: p.price, features: [...(p.features || [])] }));
    else setForm(f => ({ ...f, package_name: name }));
  };

  const toggleAddon = (name) => setForm(f => ({ ...f, addons: (f.addons || []).includes(name) ? f.addons.filter(a => a !== name) : [...(f.addons || []), name] }));

  const save = async (thenPrint) => {
    if (!form.business_name) { alert("İşletme adı zorunlu"); return; }
    const payload = {
      business_name: form.business_name, package_name: form.package_name || "", price: parseFloat(form.price) || 0,
      features: (form.features || []).filter(f => f.trim()), addons: form.addons || [], note: form.note || "", status: form.status || "draft",
    };
    const { data, error } = await supabase.from('pricing_quotes').insert(payload).select().single();
    if (error) { alert("Kaydedilemedi: " + error.message); return; }
    setModal(false); reload();
    if (thenPrint && data) printQuote(data, addons);
  };

  const setStatus = async (id, status) => { await supabase.from('pricing_quotes').update({ status }).eq('id', id); reload(); };
  const del = async (id) => { if (!window.confirm("Bu teklif silinsin mi?")) return; await supabase.from('pricing_quotes').delete().eq('id', id); reload(); };

  return (
    <div>
      <Btn variant="primary" onClick={openAdd} style={{ marginBottom: 18 }}>+ Yeni Teklif Hazırla</Btn>
      {quotes.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Henüz teklif yok. Müşteriye özel teklif hazırlamak için "+ Yeni Teklif Hazırla".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {quotes.map(q => {
            const st = QUOTE_STATUS[q.status] || QUOTE_STATUS.draft;
            return (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", flexShrink: 0 }}>📄</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{q.business_name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{q.package_name || "Özel"} · {fmtMoney(Number(q.price))} · {new Date(q.created_at).toLocaleDateString("tr-TR")}</div>
                </div>
                <select value={q.status} onChange={e => setStatus(q.id, e.target.value)} style={{ fontSize: 11, fontWeight: 600, padding: "5px 8px", borderRadius: 6, background: st.bg, color: st.color, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                  {Object.entries(QUOTE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <Btn onClick={() => printQuote(q, addons)} style={{ fontSize: 12, padding: "6px 12px", background: T.indigoDim, color: T.indigoText }}>🖨️ Yazdır</Btn>
                <Btn onClick={() => del(q.id)} style={{ fontSize: 12, padding: "6px 12px", background: T.redDim, color: T.redText }}>🗑</Btn>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Yeni Teklif Hazırla" onClose={() => setModal(false)} width={600}>
          <FormField label="İşletme Adı"><Input placeholder="Teklif verilecek işletme" value={form.business_name || ""} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} /></FormField>
          <FormField label="Paket Seç (otomatik doldurur)">
            <Select value={form.package_name || ""} onChange={e => selectPackage(e.target.value)}>
              <option value="">Paket seçin veya özel hazırlayın...</option>
              {packages.map(p => <option key={p.id} value={p.name}>{p.name} — {fmtMoney(Number(p.price))}</option>)}
            </Select>
          </FormField>
          <FormField label="Teklif Fiyatı (₺)"><Input type="number" placeholder="0" value={form.price || ""} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></FormField>
          <FormField label="Paket İçeriği (düzenlenebilir)"><FeatureEditor features={form.features} onChange={fs => setForm(f => ({ ...f, features: fs }))} /></FormField>
          {addons.length > 0 && (
            <FormField label="Ek Hizmetler (isteğe bağlı)">
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {addons.map(a => {
                  const on = (form.addons || []).includes(a.name);
                  return (
                    <div key={a.id} onClick={() => toggleAddon(a.name)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: on ? T.amberDim : T.bgInput, borderRadius: 8, cursor: "pointer", border: `1px solid ${on ? T.amber + "66" : T.border}` }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, background: on ? T.amber : "transparent", border: `1px solid ${on ? T.amber : T.borderLight}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>{on ? "✓" : ""}</div>
                      <span style={{ fontSize: 12, color: T.textPrimary, flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: T.amberText, fontWeight: 600 }}>{a.price_text}</span>
                    </div>
                  );
                })}
              </div>
            </FormField>
          )}
          <FormField label="Özel Not (isteğe bağlı)"><Textarea placeholder="Müşteriye özel mesaj..." value={form.note || ""} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn onClick={() => save(false)}>Kaydet</Btn>
            <Btn variant="primary" onClick={() => save(true)}>Kaydet & Yazdır</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SOĞUK ARAMA / POTANSİYEL MÜŞTERİ SAYFASI
// ─────────────────────────────────────────────
const LEAD_STATUS = {
  potential: { label: "Potansiyel", color: T.indigoText, bg: T.indigoDim, dot: "#6366F1" },
  agreed: { label: "Anlaşıldı", color: T.greenText, bg: T.greenDim, dot: "#10B981" },
  lost: { label: "Kaybedildi", color: T.redText, bg: T.redDim, dot: "#EF4444" },
  converted: { label: "Müşteri Oldu", color: T.amberText, bg: T.amberDim, dot: "#F25124" },
};

function LeadsPage({ refreshData }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("active"); // active = potential+agreed
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    const sorted = (data || []).sort((a,b)=>(a.business_name||"").localeCompare(b.business_name||"","tr",{sensitivity:"base"}));
    setLeads(sorted);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditId(null); setForm({ status: "potential" }); setModal(true); };
  const openEdit = (l) => {
    setEditId(l.id);
    setForm({ business_name: l.business_name, city: l.city, district: l.district, address: l.address, phone: l.phone, email: l.email, social_media: l.social_media, offer1: l.offer1, offer2: l.offer2, offer3: l.offer3, agreed_price: l.agreed_price, status: l.status, notes: l.notes });
    setModal(true);
  };

  const saveLead = async () => {
    if (!form.business_name) { alert("İşletme adı zorunlu"); return; }
    const payload = {
      business_name: form.business_name,
      city: form.city || "", district: form.district || "", address: form.address || "",
      phone: form.phone || "", email: form.email || "", social_media: form.social_media || "",
      offer1: form.offer1 ? parseFloat(form.offer1) : null,
      offer2: form.offer2 ? parseFloat(form.offer2) : null,
      offer3: form.offer3 ? parseFloat(form.offer3) : null,
      agreed_price: form.agreed_price ? parseFloat(form.agreed_price) : null,
      status: form.status || "potential",
      notes: form.notes || "",
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from('leads').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('leads').insert(payload));
    }
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nSQL kodunu çalıştırdığınızdan emin olun."); return; }
    setModal(false); setForm({}); setEditId(null);
    load();
  };

  const deleteLead = async (id) => {
    if (!window.confirm("Bu kayıt silinsin mi?")) return;
    await supabase.from('leads').delete().eq('id', id);
    load();
  };

  // Aktif müşteriye taşı
  const convertToClient = async (lead) => {
    const price = lead.agreed_price || 0;
    if (!window.confirm(`"${lead.business_name}" aktif müşterilere taşınacak.\nAylık ücret: ${fmtMoney(price)}\n\nOnaylıyor musunuz?`)) return;
    const initials = (lead.business_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const now = new Date();
    const contractStart = `${TR_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const colors = ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#F97316"];
    const { error } = await supabase.from('clients').insert({
      name: lead.business_name,
      category: "",
      initials,
      accent_color: colors[Math.floor(Math.random() * colors.length)],
      phone: lead.phone || "", address: lead.address || "", city: lead.city || "", district: lead.district || "",
      tax_number: "", tax_office: "", social_media: lead.social_media || "",
      platforms: [], publish_days: [], shoot_days: [], publish_times: [],
      monthly_fee: Math.round(price), contract_start: contractStart,
    });
    if (error) { alert("Taşıma başarısız: " + error.message); return; }
    await supabase.from('leads').update({ status: 'converted' }).eq('id', lead.id);
    await load();
    if (refreshData) await refreshData();
    alert(`"${lead.business_name}" artık aktif müşteri! 🎉\nMüşteriler sekmesinden bilgilerini tamamlayabilirsiniz.`);
  };

  const filtered = leads.filter(l => {
    if (filter === "active") return l.status === "potential" || l.status === "agreed";
    if (filter === "all") return true;
    return l.status === filter;
  });

  const stats = {
    potential: leads.filter(l => l.status === "potential").length,
    agreed: leads.filter(l => l.status === "agreed").length,
    converted: leads.filter(l => l.status === "converted").length,
  };

  const printLeads = () => {
    const rows = filtered.map(l => ({
      "İşletme": l.business_name,
      "İl/İlçe": [l.city, l.district].filter(Boolean).join(" / ") || "—",
      "Telefon": l.phone || "—",
      "Mail": l.email || "—",
      "1. Teklif": l.offer1 ? fmtMoney(l.offer1) : "—",
      "2. Teklif": l.offer2 ? fmtMoney(l.offer2) : "—",
      "3. Teklif": l.offer3 ? fmtMoney(l.offer3) : "—",
      "Anlaşılan": l.agreed_price ? fmtMoney(l.agreed_price) : "—",
      "Durum": LEAD_STATUS[l.status]?.label || l.status,
    }));
    printData("Soğuk Arama Listesi", rows);
  };

  const exportLeads = async () => {
    const rows = filtered.map(l => ({
      "İşletme Adı": l.business_name,
      "İl": l.city || "—", "İlçe": l.district || "—", "Adres": l.address || "—",
      "Telefon": l.phone || "—", "Mail": l.email || "—", "Sosyal Medya": l.social_media || "—",
      "1. Teklif (₺)": l.offer1 || 0, "2. Teklif (₺)": l.offer2 || 0, "3. Teklif (₺)": l.offer3 || 0,
      "Anlaşılan Fiyat (₺)": l.agreed_price || 0,
      "Durum": LEAD_STATUS[l.status]?.label || l.status,
      "Not": l.notes || "—",
    }));
    await exportPerfectExcel([{ name: "Soğuk Arama", rows, title: "PANORMOS MEDYA — POTANSİYEL MÜŞTERİLER" }], `panormos-soguk-arama-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const FILTER_TABS = [
    { id: "active", l: "Aktif Takip" },
    { id: "potential", l: "Potansiyel" },
    { id: "agreed", l: "Anlaşıldı" },
    { id: "converted", l: "Müşteri Oldu" },
    { id: "lost", l: "Kaybedildi" },
    { id: "all", l: "Tümü" },
  ];

  return (
    <div>
      {/* Özet */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Potansiyel" value={stats.potential} color={T.indigoText} sub="Görüşülüyor" />
        <StatCard label="Anlaşıldı" value={stats.agreed} color={T.greenText} sub="Taşınmayı bekliyor" />
        <StatCard label="Müşteri Oldu" value={stats.converted} color={T.amberText} sub="Aktife taşındı" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant="primary" onClick={openAdd}>+ Potansiyel Müşteri Ekle</Btn>
        <Btn onClick={exportLeads} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel</Btn>
        <Btn onClick={printLeads}>🖨️ Yazdır</Btn>
      </div>

      {/* Durum filtreleri */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTER_TABS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{ fontSize: 12, fontWeight: filter === f.id ? 600 : 400, padding: "6px 12px", borderRadius: 8, background: filter === f.id ? T.amber : T.bgInput, color: filter === f.id ? T.white : T.textSecondary, border: `1px solid ${filter === f.id ? T.amber : T.border}`, cursor: "pointer" }}>{f.l}</button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
        : filtered.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Bu durumda kayıt yok. "+ Potansiyel Müşteri Ekle" ile başla!</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(l => {
                const st = LEAD_STATUS[l.status] || LEAD_STATUS.potential;
                const isOpen = expanded === l.id;
                return (
                  <div key={l.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <div onClick={() => setExpanded(isOpen ? null : l.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", borderLeft: `3px solid ${st.dot}` }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: st.dot, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#fff", flexShrink: 0 }}>📞</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{l.business_name}</div>
                        <div style={{ fontSize: 11, color: T.textMuted }}>{[l.city, l.district].filter(Boolean).join(" / ") || "—"}{l.phone ? " · " + l.phone : ""}</div>
                      </div>
                      {l.agreed_price ? <div style={{ textAlign: "right" }}><div style={{ fontSize: 14, fontWeight: 700, color: T.greenText }}>{fmtMoney(l.agreed_price)}</div><div style={{ fontSize: 10, color: T.textMuted }}>anlaşılan</div></div> : null}
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: st.bg, color: st.color }}>{st.label}</span>
                      <span style={{ fontSize: 13, color: T.textMuted, transform: isOpen ? "rotate(90deg)" : "none", transition: "0.2s" }}>›</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${T.border}` }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "14px 0" }}>
                          <div>
                            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>İletişim</div>
                            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.7 }}>
                              <div>📍 {l.address || "Adres yok"}</div>
                              <div>📞 {l.phone || "—"}</div>
                              <div>✉️ {l.email || "—"}</div>
                              <div>📱 {l.social_media || "—"}</div>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Teklifler</div>
                            <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.7 }}>
                              <div>1️⃣ {l.offer1 ? fmtMoney(l.offer1) : "—"}</div>
                              <div>2️⃣ {l.offer2 ? fmtMoney(l.offer2) : "—"}</div>
                              <div>3️⃣ {l.offer3 ? fmtMoney(l.offer3) : "—"}</div>
                              <div style={{ color: T.greenText, fontWeight: 600 }}>✅ Anlaşılan: {l.agreed_price ? fmtMoney(l.agreed_price) : "—"}</div>
                            </div>
                          </div>
                        </div>
                        {l.notes && <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12, padding: "8px 12px", background: T.bgInput, borderRadius: 8 }}>📝 {l.notes}</div>}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {l.status !== "converted" && <Btn variant="primary" onClick={() => convertToClient(l)} style={{ fontSize: 12, padding: "7px 14px", background: T.greenDim, color: T.greenText }}>✅ Aktif Müşteriye Taşı</Btn>}
                          <Btn onClick={() => openEdit(l)} style={{ fontSize: 12, padding: "7px 14px" }}>✏️ Düzenle</Btn>
                          <Btn onClick={() => deleteLead(l.id)} style={{ fontSize: 12, padding: "7px 14px", background: T.redDim, color: T.redText }}>🗑 Sil</Btn>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

      {/* Ekleme/Düzenleme modalı */}
      {modal && (
        <Modal title={editId ? "Potansiyel Müşteriyi Düzenle" : "Yeni Potansiyel Müşteri"} onClose={() => { setModal(false); setEditId(null); }} width={600}>
          <FormField label="İşletme Adı"><Input placeholder="Örn: Lezzet Durağı" value={form.business_name || ""} onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))} /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="İl"><Input placeholder="Bursa" value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></FormField>
            <FormField label="İlçe"><Input placeholder="Nilüfer" value={form.district || ""} onChange={e => setForm(f => ({ ...f, district: e.target.value }))} /></FormField>
          </div>
          <FormField label="Açık Adres"><Textarea placeholder="Açık adres" value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></FormField>
            <FormField label="Mail (varsa)"><Input placeholder="mail@ornek.com" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></FormField>
          </div>
          <FormField label="📱 Sosyal Medya Adı"><Input placeholder="Örn: @lezzetduragi" value={form.social_media || ""} onChange={e => setForm(f => ({ ...f, social_media: e.target.value }))} /></FormField>
          <div style={{ fontSize: 11, color: T.amberText, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", margin: "8px 0 4px" }}>💰 Teklifler</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <FormField label="1. Teklif (₺)"><Input type="number" placeholder="0" value={form.offer1 || ""} onChange={e => setForm(f => ({ ...f, offer1: e.target.value }))} /></FormField>
            <FormField label="2. Teklif (₺)"><Input type="number" placeholder="0" value={form.offer2 || ""} onChange={e => setForm(f => ({ ...f, offer2: e.target.value }))} /></FormField>
            <FormField label="3. Teklif (₺)"><Input type="number" placeholder="0" value={form.offer3 || ""} onChange={e => setForm(f => ({ ...f, offer3: e.target.value }))} /></FormField>
          </div>
          <FormField label="✅ Anlaşılan Fiyat (₺)"><Input type="number" placeholder="0" value={form.agreed_price || ""} onChange={e => setForm(f => ({ ...f, agreed_price: e.target.value }))} /></FormField>
          <FormField label="Durum">
            <Select value={form.status || "potential"} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="potential">Potansiyel (görüşülüyor)</option>
              <option value="agreed">Anlaşıldı</option>
              <option value="lost">Kaybedildi</option>
            </Select>
          </FormField>
          <FormField label="Notlar"><Textarea placeholder="Görüşme notları..." value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <ModalActions onClose={() => { setModal(false); setEditId(null); }} onSave={saveLead} />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MUHASEBE YARDIMCILARI
// ─────────────────────────────────────────────
function monthRefLabel(ref) {
  if (!ref) return "—";
  const [y, m] = String(ref).split("-");
  const mi = parseInt(m) - 1;
  return `${TR_MONTHS[mi] || m} ${y}`;
}
function currentMonthRef() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseContractStartToRef(cs) {
  if (!cs) return null;
  if (/^\d{4}-\d{2}$/.test(cs)) return cs;
  const parts = String(cs).trim().split(/\s+/);
  if (parts.length === 2) {
    const mi = TR_MONTHS.indexOf(parts[0]);
    const y = parseInt(parts[1]);
    if (mi >= 0 && !isNaN(y)) return `${y}-${String(mi + 1).padStart(2, "0")}`;
  }
  return null;
}
function generateMonthRange(startRef, endRef) {
  const result = [];
  let [y, m] = startRef.split("-").map(Number);
  const [ey, em] = endRef.split("-").map(Number);
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard < 240) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
    guard++;
  }
  return result;
}
function monthRefOptions() {
  const opts = [];
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  for (let i = 0; i < 30; i++) {
    opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return opts;
}

// ═══════════════ MUHASEBE ANA SAYFA ═══════════════
function AccountingPage({ clients, staff, perms }) {
  const [tab, setTab] = useState("cari");
  // Güvenlik: muhasebe yetkisi yoksa erişimi engelle
  if (!perms.accounting) {
    return <div style={{textAlign:"center",color:T.textMuted,padding:60}}>
      <div style={{fontSize:40,marginBottom:16}}>🔒</div>
      <div style={{fontSize:16,fontWeight:600,color:T.textPrimary}}>Bu bölüme erişim yetkiniz yok</div>
      <div style={{fontSize:13,marginTop:8}}>Muhasebe bilgileri yalnızca yetkili kişiler tarafından görülebilir.</div>
    </div>;
  }
  const tabs = [
    { id: "cari", lbl: "💳 Müşteri Cari" },
    { id: "harcamalar", lbl: "🧾 Giderler" },
    { id: "gelirler", lbl: "💵 Gelirler" },
    { id: "giderler", lbl: "🏛️ SGK / Vergi / Maaş" },
    { id: "izin", lbl: "🌴 Personel İzinleri" },
    { id: "takvim", lbl: "📅 Ödeme Takvimi" },
    { id: "belgeler", lbl: "📄 Belgeler" },
  ];
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, paddingBottom: 2 }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return <button key={t.id} onClick={() => setTab(t.id)} style={{
            fontSize: 13, fontWeight: active ? 600 : 400, padding: "9px 16px", borderRadius: "8px 8px 0 0",
            color: active ? T.amberText : T.textMuted, background: active ? T.bgCard : "transparent",
            border: "none", borderBottom: `2px solid ${active ? T.amber : "transparent"}`, cursor: "pointer", whiteSpace: "nowrap",
          }}>{t.lbl}</button>;
        })}
      </div>
      {tab === "cari" && <AccountingCari clients={clients} />}
      {tab === "harcamalar" && <AccountingSpending />}
      {tab === "gelirler" && <AccountingIncome />}
      {tab === "giderler" && <AccountingExpenses staff={staff} />}
      {tab === "izin" && <AccountingLeave staff={staff} />}
      {tab === "takvim" && <AccountingCalendar staff={staff} />}
      {tab === "belgeler" && <AccountingDocuments />}
    </div>
  );
}

// ═══════════════ GİDERLER (kategorili + belge) ═══════════════
const EXPENSE_CATEGORIES = [
  { id: "yakit", label: "⛽ Yakıt", color: "#F59E0B" },
  { id: "yemek", label: "🍽️ Yemek", color: "#EC4899" },
  { id: "kirtasiye", label: "✏️ Kırtasiye", color: "#6366F1" },
  { id: "ofis", label: "🏢 Ofis İçi Genel", color: "#10B981" },
  { id: "ekipman", label: "🎥 Ekipman", color: "#A855F7" },
];
const expCatLabel = (id) => EXPENSE_CATEGORIES.find(c => c.id === id)?.label || id;
const expCatColor = (id) => EXPENSE_CATEGORIES.find(c => c.id === id)?.color || "#8A8F98";

// Ortak belge yükleme (Supabase Storage → public URL)
async function uploadAccountingDoc(file, prefix) {
  const path = `${prefix}/${Date.now()}-${file.name}`;
  const { data, error } = await supabase.storage.from('client-media').upload(path, file);
  if (error) throw error;
  let url = "";
  try { url = supabase.storage.from('client-media').getPublicUrl(data.path).data.publicUrl || ""; } catch (e) {}
  return { url, name: file.name };
}

function AccountingSpending() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [filterCat, setFilterCat] = useState("all");

  const load = async () => {
    const { data } = await supabase.from('company_expenses').select('*').order('expense_date', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.category || !form.amount) { alert("Kategori ve tutar zorunlu"); return; }
    setUploading(true);
    let docUrl = "", docName = "";
    if (file) {
      try { const r = await uploadAccountingDoc(file, "giderler"); docUrl = r.url; docName = r.name; }
      catch (e) { setUploading(false); alert("Belge yüklenemedi: " + e.message); return; }
    }
    const { error } = await supabase.from('company_expenses').insert({
      category: form.category, title: form.title || "", amount: parseFloat(form.amount) || 0,
      expense_date: form.expense_date || new Date().toISOString().slice(0, 10),
      document_url: docUrl, document_name: docName, notes: form.notes || "",
    });
    setUploading(false);
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nGIDER-GELIR-SQL kodunu çalıştırın."); return; }
    setModal(false); setForm({}); setFile(null);
    load();
  };

  const del = async (id) => { if (!window.confirm("Bu gider silinsin mi?")) return; await supabase.from('company_expenses').delete().eq('id', id); load(); };

  const now = new Date();
  const filtered = filterCat === "all" ? items : items.filter(i => i.category === filterCat);
  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const thisMonth = items.filter(i => { const d = new Date(i.expense_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, i) => s + Number(i.amount || 0), 0);
  const byCat = {};
  items.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + Number(i.amount || 0); });

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Toplam Gider" value={fmtMoney(total)} color={T.amberText} />
        <StatCard label="Bu Ay" value={fmtMoney(thisMonth)} color={T.redText} />
      </div>

      {/* Kategori özet kartları */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
        {EXPENSE_CATEGORIES.map(c => (
          <div key={c.id} onClick={() => setFilterCat(filterCat === c.id ? "all" : c.id)} style={{ background: filterCat === c.id ? c.color + "22" : T.bgCard, border: `1px solid ${filterCat === c.id ? c.color : T.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", borderLeft: `3px solid ${c.color}` }}>
            <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>{fmtMoney(byCat[c.id] || 0)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={() => { setForm({ category: "yakit", expense_date: new Date().toISOString().slice(0, 10) }); setFile(null); setModal(true); }}>+ Gider Ekle</Btn>
        {filterCat !== "all" && <Btn onClick={() => setFilterCat("all")} style={{ fontSize: 12 }}>✕ Filtreyi Temizle ({expCatLabel(filterCat)})</Btn>}
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div> :
        filtered.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Gider kaydı yok</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map(i => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, borderLeft: `3px solid ${expCatColor(i.category)}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{i.title || expCatLabel(i.category)}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{expCatLabel(i.category)} · {i.expense_date}{i.notes ? " · " + i.notes : ""}</div>
                </div>
                {i.document_url && <a href={i.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: T.indigoDim, color: T.indigoText, textDecoration: "none" }}>📄 Belge</a>}
                <div style={{ fontSize: 15, fontWeight: 700, color: T.amberText, whiteSpace: "nowrap" }}>{fmtMoney(Number(i.amount))}</div>
                <button onClick={() => del(i.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}

      {modal && (
        <Modal title="Gider Ekle" onClose={() => setModal(false)}>
          <FormField label="Kategori">
            <Select value={form.category || "yakit"} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          </FormField>
          <FormField label="Açıklama"><Input placeholder="Örn: Benzin - Shell" value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FormField>
          <FormField label="Tutar (₺)"><Input type="number" placeholder="0" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></FormField>
          <FormField label="Tarih"><Input type="date" value={form.expense_date || ""} onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))} /></FormField>
          <FormField label="📄 Belge (PDF/Görsel — fatura, fiş vb.)">
            <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files[0])} style={{ width: "100%", fontSize: 12, color: T.textSecondary, padding: "8px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8 }} />
            {file && <div style={{ fontSize: 11, color: T.greenText, marginTop: 4 }}>✓ {file.name}</div>}
          </FormField>
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={save} disabled={uploading}>{uploading ? "Yükleniyor..." : "Kaydet"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ GELİRLER ═══════════════
function AccountingIncome() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('company_incomes').select('*').order('income_date', { ascending: false });
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.amount) { alert("Tutar zorunlu"); return; }
    setUploading(true);
    let docUrl = "", docName = "";
    if (file) {
      try { const r = await uploadAccountingDoc(file, "gelirler"); docUrl = r.url; docName = r.name; }
      catch (e) { setUploading(false); alert("Belge yüklenemedi: " + e.message); return; }
    }
    const { error } = await supabase.from('company_incomes').insert({
      source: form.source || "", title: form.title || "", amount: parseFloat(form.amount) || 0,
      income_date: form.income_date || new Date().toISOString().slice(0, 10),
      document_url: docUrl, document_name: docName, notes: form.notes || "",
    });
    setUploading(false);
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nGIDER-GELIR-SQL kodunu çalıştırın."); return; }
    setModal(false); setForm({}); setFile(null);
    load();
  };

  const del = async (id) => { if (!window.confirm("Bu gelir silinsin mi?")) return; await supabase.from('company_incomes').delete().eq('id', id); load(); };

  const now = new Date();
  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const thisMonth = items.filter(i => { const d = new Date(i.income_date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, i) => s + Number(i.amount || 0), 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Toplam Gelir" value={fmtMoney(total)} color={T.greenText} />
        <StatCard label="Bu Ay" value={fmtMoney(thisMonth)} color={T.greenText} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Btn variant="primary" onClick={() => { setForm({ income_date: new Date().toISOString().slice(0, 10) }); setFile(null); setModal(true); }}>+ Gelir Ekle</Btn>
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div> :
        items.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Gelir kaydı yok</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map(i => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, borderLeft: `3px solid ${T.green}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{i.title || i.source || "Gelir"}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{i.source ? i.source + " · " : ""}{i.income_date}{i.notes ? " · " + i.notes : ""}</div>
                </div>
                {i.document_url && <a href={i.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: T.indigoDim, color: T.indigoText, textDecoration: "none" }}>📄 Belge</a>}
                <div style={{ fontSize: 15, fontWeight: 700, color: T.greenText, whiteSpace: "nowrap" }}>{fmtMoney(Number(i.amount))}</div>
                <button onClick={() => del(i.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}

      {modal && (
        <Modal title="Gelir Ekle" onClose={() => setModal(false)}>
          <FormField label="Gelir Kaynağı"><Input placeholder="Örn: Reklam geliri, Ek proje" value={form.source || ""} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></FormField>
          <FormField label="Açıklama"><Input placeholder="Detay" value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FormField>
          <FormField label="Tutar (₺)"><Input type="number" placeholder="0" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></FormField>
          <FormField label="Tarih"><Input type="date" value={form.income_date || ""} onChange={e => setForm(f => ({ ...f, income_date: e.target.value }))} /></FormField>
          <FormField label="📄 Belge (PDF/Görsel — dekont, fatura vb.)">
            <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files[0])} style={{ width: "100%", fontSize: 12, color: T.textSecondary, padding: "8px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8 }} />
            {file && <div style={{ fontSize: 11, color: T.greenText, marginTop: 4 }}>✓ {file.name}</div>}
          </FormField>
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={save} disabled={uploading}>{uploading ? "Yükleniyor..." : "Kaydet"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ MÜŞTERİ CARİ ═══════════════
function AccountingCari({ clients }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    const { data } = await supabase.from('client_payments').select('*').order('payment_date', { ascending: false });
    setPayments(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const nowRef = currentMonthRef();
  const clientStats = clients.map(c => {
    const startRef = parseContractStartToRef(c.contractStart) || `${new Date().getFullYear()}-01`;
    const months = generateMonthRange(startRef, nowRef);
    const cPayments = payments.filter(p => p.client_id === c.id);
    const paidByMonth = {};
    cPayments.forEach(p => { if (p.month_ref) paidByMonth[p.month_ref] = (paidByMonth[p.month_ref] || 0) + Number(p.amount || 0); });
    const totalPaid = cPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const unpaidMonths = months.filter(m => (paidByMonth[m] || 0) < (c.monthlyFee || 0));
    const expected = months.length * (c.monthlyFee || 0);
    const balance = expected - totalPaid;
    return { client: c, months, cPayments, paidByMonth, totalPaid, unpaidMonths, expected, balance };
  });

  const totalExpected = clientStats.reduce((s, cs) => s + cs.expected, 0);
  const totalCollected = clientStats.reduce((s, cs) => s + cs.totalPaid, 0);
  const totalOutstanding = totalExpected - totalCollected;

  const savePayment = async () => {
    if (!form.client_id || !form.amount) { alert("Müşteri ve tutar zorunlu"); return; }
    const { error } = await supabase.from('client_payments').insert({
      client_id: form.client_id,
      amount: parseFloat(form.amount) || 0,
      payment_date: form.payment_date || new Date().toISOString().slice(0, 10),
      month_ref: form.month_ref || nowRef,
      method: form.method || "havale",
      notes: form.notes || "",
    });
    if (error) { alert("Ödeme kaydedilemedi: " + error.message + "\n\nSQL kodunu çalıştırdığınızdan emin olun."); return; }
    setModal(false); setForm({});
    load();
  };

  const deletePayment = async (id) => {
    if (!window.confirm("Bu ödeme kaydı silinsin mi?")) return;
    await supabase.from('client_payments').delete().eq('id', id);
    load();
  };

  const exportCari = async () => {
    // Sayfa 1: Cari özeti
    const summaryRows = clientStats.map(cs => ({
      "Müşteri": cs.client.name,
      "Aylık Ücret (₺)": cs.client.monthlyFee || 0,
      "Beklenen Toplam (₺)": cs.expected,
      "Tahsil Edilen (₺)": cs.totalPaid,
      "Kalan Bakiye (₺)": cs.balance,
      "Ödenmemiş Ay Sayısı": cs.unpaidMonths.length,
      "Durum": cs.balance <= 0 ? "Güncel" : "Borçlu",
    }));
    const sheets = [{ name: "Müşteri Cari", rows: summaryRows, title: "PANORMOS MEDYA — MÜŞTERİ CARİ ÖZETİ" }];

    // Sayfa 2: Ödenmemiş aylar
    const unpaidRows = [];
    clientStats.forEach(cs => {
      cs.unpaidMonths.forEach(m => {
        const paid = cs.paidByMonth[m] || 0;
        unpaidRows.push({
          "Müşteri": cs.client.name,
          "Ödenmemiş Ay": monthRefLabel(m),
          "Aylık Ücret (₺)": cs.client.monthlyFee || 0,
          "Ödenen (₺)": paid,
          "Eksik (₺)": (cs.client.monthlyFee || 0) - paid,
        });
      });
    });
    if (unpaidRows.length > 0) sheets.push({ name: "Ödenmemiş Aylar", rows: unpaidRows, title: "ÖDENMEMİŞ AYLAR" });

    // Sayfa 3: Tüm ödemeler
    const payRows = payments.map(p => ({
      "Müşteri": clients.find(c => c.id === p.client_id)?.name || "?",
      "Ödeme Tarihi": p.payment_date || "—",
      "Ait Olduğu Ay": monthRefLabel(p.month_ref),
      "Tutar (₺)": Number(p.amount || 0),
      "Yöntem": p.method || "—",
      "Not": p.notes || "—",
    }));
    if (payRows.length > 0) sheets.push({ name: "Tüm Ödemeler", rows: payRows, title: "TÜM TAHSİLATLAR" });

    await exportPerfectExcel(sheets, `panormos-musteri-cari-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      {/* Özet kartlar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Beklenen Toplam" value={fmtMoney(totalExpected)} color={T.indigoText} />
        <StatCard label="Tahsil Edilen" value={fmtMoney(totalCollected)} color={T.greenText} />
        <StatCard label="Kalan Alacak" value={fmtMoney(totalOutstanding)} color={T.amberText} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <Btn variant="primary" onClick={() => { setForm({ payment_date: new Date().toISOString().slice(0, 10), month_ref: nowRef, method: "havale" }); setModal(true); }}>+ Ödeme Kaydet</Btn>
        <Btn onClick={exportCari} style={{ background: T.greenDim, color: T.greenText }}>📊 Cari Excel</Btn>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
      ) : clientStats.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Müşteri yok</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(showAll ? clientStats : clientStats.slice(0,6)).map(cs => {
            const isOpen = expanded === cs.client.id;
            return (
              <div key={cs.client.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => setExpanded(isOpen ? null : cs.client.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", borderLeft: `3px solid ${cs.client.accentColor}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: cs.client.accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{cs.client.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{cs.client.name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>Aylık {fmtMoney(cs.client.monthlyFee)} · {cs.unpaidMonths.length} ay ödenmemiş</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: cs.balance > 0 ? T.amberText : T.greenText }}>{fmtMoney(cs.balance)}</div>
                    <div style={{ fontSize: 10, color: T.textMuted }}>{cs.balance > 0 ? "kalan borç" : "güncel"}</div>
                  </div>
                  <span style={{ fontSize: 13, color: T.textMuted, transform: isOpen ? "rotate(90deg)" : "none", transition: "0.2s" }}>›</span>
                </div>
                {isOpen && (
                  <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${T.border}` }}>
                    {/* Son ödeme tarihi + WhatsApp hatırlatma */}
                    <div style={{display:"flex",gap:10,alignItems:"flex-end",marginTop:14,flexWrap:"wrap",padding:"12px",background:T.bgInput,borderRadius:10}}>
                      <div style={{flex:1,minWidth:160}}>
                        <div style={{fontSize:10,color:T.textMuted,fontWeight:600,marginBottom:5,textTransform:"uppercase"}}>📆 Son Ödeme Tarihi</div>
                        <input type="date" defaultValue={cs.client.paymentDueDate||""} onChange={async(e)=>{
                          const val = e.target.value||null;
                          await supabase.from('clients').update({payment_due_date: val}).eq('id', cs.client.id);
                          cs.client.paymentDueDate = val;
                        }} style={{width:"100%",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 10px",color:T.textPrimary,fontSize:12,outline:"none",boxSizing:"border-box"}} />
                      </div>
                      <Btn onClick={()=>{
                        const c = cs.client;
                        const bakiye = cs.balance;
                        let msg = `Merhaba ${c.name},\n\n`;
                        msg += `📄 Bu aya ait faturanız oluşturulmuştur. 💰\n`;
                        msg += `Aylık Tutar: ${fmtMoney(c.monthlyFee||0)}\n`;
                        msg += `📊 Güncel Bakiye: ${fmtMoney(cs.totalPaid)}\n`;
                        if(bakiye>0) msg += `⚠️ Kalan Borç: ${fmtMoney(bakiye)}\n`;
                        if(c.paymentDueDate) msg += `📆 Son Ödeme Tarihi: ${new Date(c.paymentDueDate).toLocaleDateString("tr-TR")}\n`;
                        msg += `\nİyi çalışmalar dileriz.\n\nPanormos Medya Ekibi`;
                        const phone = (c.phone||"").replace(/\D/g,"").replace(/^0/,"90");
                        if(phone.length<10){ alert("Bu müşterinin kayıtlı telefonu yok. Müşteriyi düzenleyip telefon ekleyin."); return; }
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                      }} style={{background:"#25D366",color:"#fff",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>📱 WhatsApp Hatırlatma</Btn>
                      <Btn variant="primary" onClick={()=>{ setForm({ client_id: cs.client.id, amount: cs.client.monthlyFee || "", payment_date: new Date().toISOString().slice(0,10), month_ref: nowRef, method: "havale" }); setModal(true); }} style={{fontSize:11,whiteSpace:"nowrap"}}>+ Ödeme Ekle</Btn>
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, margin: "12px 0 8px", fontWeight: 600, textTransform: "uppercase" }}>Aylık Ödeme Durumu</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 6, marginBottom: 12 }}>
                      {cs.months.map(m => {
                        const paid = cs.paidByMonth[m] || 0;
                        const full = paid >= (cs.client.monthlyFee || 0);
                        const partial = paid > 0 && !full;
                        return (
                          <div key={m} style={{ padding: "8px 10px", borderRadius: 8, background: full ? T.greenDim : partial ? T.amberDim : T.bgInput, border: `1px solid ${full ? T.green + "44" : partial ? T.amber + "44" : T.border}` }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>{monthRefLabel(m)}</div>
                            <div style={{ fontSize: 10, color: full ? T.greenText : partial ? T.amberText : T.textMuted }}>{full ? "✓ Ödendi" : partial ? `Kısmi: ${fmtMoney(paid)}` : "Ödenmedi"}</div>
                          </div>
                        );
                      })}
                    </div>
                    {cs.cPayments.length > 0 && (
                      <>
                        <div style={{ fontSize: 11, color: T.textMuted, margin: "8px 0", fontWeight: 600, textTransform: "uppercase" }}>Ödeme Geçmişi</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {cs.cPayments.map(p => (
                            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.bgInput, borderRadius: 8, fontSize: 12 }}>
                              <span style={{ color: T.textPrimary, fontWeight: 600 }}>{fmtMoney(Number(p.amount))}</span>
                              <span style={{ color: T.textMuted }}>{p.payment_date}</span>
                              <span style={{ color: T.amberText, fontSize: 11 }}>{monthRefLabel(p.month_ref)}</span>
                              <span style={{ color: T.textMuted, fontSize: 11 }}>{p.method}</span>
                              <button onClick={() => deletePayment(p.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 13 }}>✕</button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {clientStats.length>6 && (
            <button onClick={()=>setShowAll(v=>!v)} style={{marginTop:4,padding:"11px",borderRadius:10,border:`1px dashed ${T.borderLight}`,background:"transparent",color:T.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>
              {showAll ? "▲ Daha az göster" : `▼ Tümünü göster (${clientStats.length} müşteri)`}
            </button>
          )}
        </div>
      )}

      {modal && (
        <Modal title="Müşteri Ödemesi Kaydet" onClose={() => setModal(false)}>
          <FormField label="Müşteri">
            <Select value={form.client_id || ""} onChange={e => { const cid = e.target.value; const c = clients.find(x => String(x.id) === cid); setForm(f => ({ ...f, client_id: cid, amount: f.amount || (c ? c.monthlyFee : "") })); }}>
              <option value="">Seç...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>
          <FormField label="Tutar (₺)"><Input type="number" placeholder="0" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></FormField>
          <FormField label="Hangi Aya Ait">
            <Select value={form.month_ref || nowRef} onChange={e => setForm(f => ({ ...f, month_ref: e.target.value }))}>
              {monthRefOptions().map(m => <option key={m} value={m}>{monthRefLabel(m)}</option>)}
            </Select>
          </FormField>
          <FormField label="Ödeme Tarihi"><Input type="date" value={form.payment_date || ""} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} /></FormField>
          <FormField label="Ödeme Yöntemi">
            <Select value={form.method || "havale"} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}>
              <option value="havale">Havale / EFT</option>
              <option value="nakit">Nakit</option>
              <option value="kredi kartı">Kredi Kartı</option>
              <option value="çek">Çek</option>
            </Select>
          </FormField>
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <ModalActions onClose={() => setModal(false)} onSave={savePayment} />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ SGK / VERGİ / MAAŞ (GİDERLER) ═══════════════
const EXPENSE_TYPES = {
  sgk: { label: "SGK Ödemesi", icon: "🏛️", color: "#6366F1" },
  tax: { label: "Vergi Dairesi", icon: "📋", color: "#F59E0B" },
  salary: { label: "Personel Maaşı", icon: "💰", color: "#10B981" },
  other: { label: "Diğer Gider", icon: "📌", color: "#8B8B8B" },
};

function AccountingExpenses({ staff }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ entry_type: "sgk" });
  const [filter, setFilter] = useState("all");

  const load = async () => {
    const { data } = await supabase.from('accounting_entries').select('*').order('due_date', { ascending: false });
    setEntries(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveEntry = async () => {
    if (!form.title && form.entry_type !== "salary") { alert("Başlık zorunlu"); return; }
    if (form.entry_type === "salary" && !form.staff_id) { alert("Maaş için çalışan seçin"); return; }
    if (!form.amount) { alert("Tutar zorunlu"); return; }
    const staffName = form.staff_id ? staff.find(s => String(s.id) === String(form.staff_id))?.name : null;
    const { error } = await supabase.from('accounting_entries').insert({
      entry_type: form.entry_type,
      title: form.entry_type === "salary" ? (`Maaş — ${staffName || ""}`) : form.title,
      amount: parseFloat(form.amount) || 0,
      due_date: form.due_date || null,
      month_ref: form.month_ref || currentMonthRef(),
      staff_id: form.staff_id ? parseInt(form.staff_id) : null,
      is_paid: false,
      notes: form.notes || "",
    });
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nSQL kodunu çalıştırın."); return; }
    setModal(false); setForm({ entry_type: "sgk" });
    load();
  };

  const togglePaid = async (entry) => {
    await supabase.from('accounting_entries').update({ is_paid: !entry.is_paid, paid_date: !entry.is_paid ? new Date().toISOString().slice(0, 10) : null }).eq('id', entry.id);
    load();
  };
  const deleteEntry = async (id) => {
    if (!window.confirm("Bu kayıt silinsin mi?")) return;
    await supabase.from('accounting_entries').delete().eq('id', id);
    load();
  };

  const filtered = filter === "all" ? entries : entries.filter(e => e.entry_type === filter);
  const totalUnpaid = entries.filter(e => !e.is_paid).reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPaid = entries.filter(e => e.is_paid).reduce((s, e) => s + Number(e.amount || 0), 0);

  const exportExpenses = async () => {
    const rows = entries.map(e => ({
      "Tür": EXPENSE_TYPES[e.entry_type]?.label || e.entry_type,
      "Başlık": e.title,
      "Tutar (₺)": Number(e.amount || 0),
      "Ait Olduğu Ay": monthRefLabel(e.month_ref),
      "Son Ödeme": e.due_date || "—",
      "Durum": e.is_paid ? "Ödendi" : "Bekliyor",
      "Ödeme Tarihi": e.paid_date || "—",
    }));
    await exportPerfectExcel([{ name: "Giderler", rows, title: "PANORMOS MEDYA — GİDER ÖDEMELERİ" }], `panormos-giderler-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Ödenmemiş Giderler" value={fmtMoney(totalUnpaid)} color={T.amberText} />
        <StatCard label="Ödenmiş Giderler" value={fmtMoney(totalPaid)} color={T.greenText} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant="primary" onClick={() => { setForm({ entry_type: "sgk", month_ref: currentMonthRef() }); setModal(true); }}>+ Gider Ekle</Btn>
        <Btn onClick={exportExpenses} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel</Btn>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {[{ id: "all", l: "Tümü" }, ...Object.entries(EXPENSE_TYPES).map(([id, v]) => ({ id, l: v.icon }))].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, background: filter === f.id ? T.amber : T.bgInput, color: filter === f.id ? T.white : T.textSecondary, border: `1px solid ${filter === f.id ? T.amber : T.border}`, cursor: "pointer" }}>{f.l}</button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
        : filtered.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Kayıt yok</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(e => {
                const type = EXPENSE_TYPES[e.entry_type] || EXPENSE_TYPES.other;
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, borderLeft: `3px solid ${type.color}`, opacity: e.is_paid ? 0.7 : 1 }}>
                    <span style={{ fontSize: 22 }}>{type.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: e.is_paid ? "line-through" : "none" }}>{e.title}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>{type.label} · {monthRefLabel(e.month_ref)}{e.due_date ? ` · Son: ${e.due_date}` : ""}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>{fmtMoney(Number(e.amount))}</div>
                    <button onClick={() => togglePaid(e)} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, background: e.is_paid ? T.greenDim : T.bgInput, color: e.is_paid ? T.greenText : T.textSecondary, border: `1px solid ${e.is_paid ? T.green + "44" : T.border}`, cursor: "pointer", whiteSpace: "nowrap" }}>{e.is_paid ? "✓ Ödendi" : "Öde"}</button>
                    <button onClick={() => deleteEntry(e.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}

      {modal && (
        <Modal title="Gider Ödemesi Ekle" onClose={() => setModal(false)}>
          <FormField label="Gider Türü">
            <Select value={form.entry_type} onChange={e => setForm(f => ({ ...f, entry_type: e.target.value }))}>
              {Object.entries(EXPENSE_TYPES).map(([id, v]) => <option key={id} value={id}>{v.icon} {v.label}</option>)}
            </Select>
          </FormField>
          {form.entry_type === "salary" ? (
            <FormField label="Çalışan">
              <Select value={form.staff_id || ""} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
                <option value="">Seç...</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
              </Select>
            </FormField>
          ) : (
            <FormField label="Başlık"><Input placeholder={form.entry_type === "sgk" ? "Örn: Ekim SGK Primi" : form.entry_type === "tax" ? "Örn: KDV Beyannamesi" : "Açıklama"} value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FormField>
          )}
          <FormField label="Tutar (₺)"><Input type="number" placeholder="0" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></FormField>
          <FormField label="Hangi Aya Ait">
            <Select value={form.month_ref || currentMonthRef()} onChange={e => setForm(f => ({ ...f, month_ref: e.target.value }))}>
              {monthRefOptions().map(m => <option key={m} value={m}>{monthRefLabel(m)}</option>)}
            </Select>
          </FormField>
          <FormField label="Son Ödeme Tarihi"><Input type="date" value={form.due_date || ""} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} /></FormField>
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <ModalActions onClose={() => setModal(false)} onSave={saveEntry} />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ PERSONEL İZİNLERİ ═══════════════
const LEAVE_TYPES = { "yıllık": "Yıllık İzin", "hastalık": "Hastalık İzni", "ücretsiz": "Ücretsiz İzin", "diğer": "Diğer" };

function AccountingLeave({ staff }) {
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ leave_type: "yıllık" });

  const load = async () => {
    const { data } = await supabase.from('staff_leave').select('*').order('start_date', { ascending: false });
    setLeaves(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const calcDays = (start, end) => {
    if (!start || !end) return 0;
    const d1 = new Date(start), d2 = new Date(end);
    return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
  };

  const saveLeave = async () => {
    if (!form.staff_id) { alert("Çalışan seçin"); return; }
    if (!form.start_date || !form.end_date) { alert("Başlangıç ve bitiş tarihi girin"); return; }
    const days = calcDays(form.start_date, form.end_date);
    const { error } = await supabase.from('staff_leave').insert({
      staff_id: parseInt(form.staff_id),
      start_date: form.start_date,
      end_date: form.end_date,
      days,
      leave_type: form.leave_type || "yıllık",
      notes: form.notes || "",
    });
    if (error) { alert("Kaydedilemedi: " + error.message + "\n\nSQL kodunu çalıştırın."); return; }
    setModal(false); setForm({ leave_type: "yıllık" });
    load();
  };
  const deleteLeave = async (id) => {
    if (!window.confirm("Bu izin kaydı silinsin mi?")) return;
    await supabase.from('staff_leave').delete().eq('id', id);
    load();
  };

  // Çalışan bazlı özet
  const byStaff = staff.map(s => {
    const sLeaves = leaves.filter(l => l.staff_id === s.id);
    const yearlyUsed = sLeaves.filter(l => l.leave_type === "yıllık").reduce((sum, l) => sum + (l.days || 0), 0);
    return { staff: s, leaves: sLeaves, yearlyUsed };
  }).filter(x => x.leaves.length > 0);

  const exportLeave = async () => {
    const rows = leaves.map(l => ({
      "Çalışan": staff.find(s => s.id === l.staff_id)?.name || "?",
      "İzin Türü": LEAVE_TYPES[l.leave_type] || l.leave_type,
      "Başlangıç": l.start_date || "—",
      "Bitiş": l.end_date || "—",
      "Gün Sayısı": l.days || 0,
      "Not": l.notes || "—",
    }));
    await exportPerfectExcel([{ name: "İzinler", rows, title: "PANORMOS MEDYA — PERSONEL İZİNLERİ" }], `panormos-izinler-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <Btn variant="primary" onClick={() => { setForm({ leave_type: "yıllık" }); setModal(true); }}>+ İzin Ekle</Btn>
        {leaves.length > 0 && <Btn onClick={exportLeave} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel</Btn>}
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
        : byStaff.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Henüz izin kaydı yok</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {byStaff.map(({ staff: s, leaves: sLeaves, yearlyUsed }) => (
                <div key={s.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff" }}>{s.initials}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: T.textMuted }}>{s.role}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.amberText }}>{yearlyUsed} gün</div>
                      <div style={{ fontSize: 10, color: T.textMuted }}>yıllık izin kullanıldı</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sLeaves.map(l => (
                      <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.bgInput, borderRadius: 8, fontSize: 12 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 5, background: T.indigoDim, color: T.indigoText, fontSize: 10, fontWeight: 600 }}>{LEAVE_TYPES[l.leave_type] || l.leave_type}</span>
                        <span style={{ color: T.textSecondary }}>{l.start_date} → {l.end_date}</span>
                        <span style={{ color: T.textPrimary, fontWeight: 600 }}>{l.days} gün</span>
                        {l.notes && <span style={{ color: T.textMuted, fontSize: 11 }}>· {l.notes}</span>}
                        <button onClick={() => deleteLeave(l.id)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 13 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

      {modal && (
        <Modal title="Personel İzni Ekle" onClose={() => setModal(false)}>
          <FormField label="Çalışan">
            <Select value={form.staff_id || ""} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))}>
              <option value="">Seç...</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </Select>
          </FormField>
          <FormField label="İzin Türü">
            <Select value={form.leave_type} onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}>
              {Object.entries(LEAVE_TYPES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </Select>
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <FormField label="Başlangıç"><Input type="date" value={form.start_date || ""} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></FormField>
            <FormField label="Bitiş"><Input type="date" value={form.end_date || ""} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></FormField>
          </div>
          {form.start_date && form.end_date && (
            <div style={{ fontSize: 12, color: T.amberText, marginBottom: 12, fontWeight: 600 }}>Toplam: {calcDays(form.start_date, form.end_date)} gün</div>
          )}
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <ModalActions onClose={() => setModal(false)} onSave={saveLeave} />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ ÖDEME TAKVİMİ ═══════════════
function AccountingCalendar({ staff }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [entries, setEntries] = useState([]);
  const [clientPays, setClientPays] = useState([]);

  useEffect(() => {
    (async () => {
      const { data: e } = await supabase.from('accounting_entries').select('*');
      setEntries(e || []);
      const { data: cp } = await supabase.from('client_payments').select('*');
      setClientPays(cp || []);
    })();
  }, []);

  const cells = getMonthGrid(viewYear, viewMonth);
  const goPrev = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); } else setViewMonth(m => m - 1); };
  const goNext = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); } else setViewMonth(m => m + 1); };

  const dateStrFor = (day) => `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <button onClick={goPrev} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", color: T.textSecondary, cursor: "pointer" }}>‹</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary, flex: 1 }}>{TR_MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={goNext} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "5px 12px", color: T.textSecondary, cursor: "pointer" }}>›</button>
      </div>
      <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 11, color: T.textMuted, flexWrap: "wrap" }}>
        <span>🔴 Gider son ödeme</span><span>🟢 Tahsilat</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: T.textMuted }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((cell, i) => {
          const ds = cell.currentMonth ? dateStrFor(cell.day) : null;
          const dueEntries = ds ? entries.filter(e => e.due_date === ds && !e.is_paid) : [];
          const dayPays = ds ? clientPays.filter(p => p.payment_date === ds) : [];
          const isToday = cell.currentMonth && cell.day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          return (
            <div key={i} style={{ minHeight: 80, borderRadius: 8, padding: "6px 7px", background: cell.currentMonth ? T.bgCard : "transparent", border: `1px solid ${isToday ? T.amber : (cell.currentMonth ? T.border : "transparent")}`, opacity: cell.currentMonth ? 1 : 0.3 }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.amberText : T.textSecondary, marginBottom: 3 }}>{cell.day}</div>
              {dueEntries.slice(0, 2).map((e, ei) => (
                <div key={"e" + ei} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, marginBottom: 2, background: "rgba(239,68,68,0.15)", color: T.redText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🔴 {fmtMoney(Number(e.amount))}</div>
              ))}
              {dayPays.slice(0, 2).map((p, pi) => (
                <div key={"p" + pi} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, marginBottom: 2, background: "rgba(16,185,129,0.15)", color: T.greenText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🟢 {fmtMoney(Number(p.amount))}</div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════ BELGELER (TARAMA/YÜKLEME) ═══════════════
const DOC_CATEGORIES = { "fatura": "Fatura", "makbuz": "Makbuz", "sgk": "SGK Belgesi", "vergi": "Vergi Belgesi", "sozlesme": "Sözleşme", "diğer": "Diğer" };

function AccountingDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState("fatura");
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const load = async () => {
    const { data } = await supabase.from('accounting_documents').select('*').order('created_at', { ascending: false });
    setDocs(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of files) {
      try {
        const fileName = `accounting/${Date.now()}-${file.name}`;
        const { data, error } = await supabase.storage.from('client-media').upload(fileName, file);
        if (!error && data) {
          await supabase.from('accounting_documents').insert({
            title: file.name,
            category,
            storage_path: data.path,
            storage_type: 'supabase',
            doc_date: new Date().toISOString().slice(0, 10),
          });
        } else if (error) {
          alert("Yükleme hatası: " + error.message);
        }
      } catch (err) { console.error(err); }
    }
    setUploading(false);
    load();
  };

  const openDoc = (doc) => {
    if (doc.storage_type === "supabase" && doc.storage_path) {
      const { data } = supabase.storage.from('client-media').getPublicUrl(doc.storage_path);
      if (data?.publicUrl) window.open(data.publicUrl, "_blank");
    }
  };
  const deleteDoc = async (doc) => {
    if (!window.confirm("Bu belge silinsin mi?")) return;
    if (doc.storage_path) await supabase.storage.from('client-media').remove([doc.storage_path]);
    await supabase.from('accounting_documents').delete().eq('id', doc.id);
    load();
  };

  return (
    <div>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>📄 Belge Tara / Yükle</div>
        <FormField label="Belge Kategorisi">
          <Select value={category} onChange={e => setCategory(e.target.value)}>
            {Object.entries(DOC_CATEGORIES).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
          </Select>
        </FormField>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFiles(Array.from(e.target.files || []))} />
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} onChange={e => handleFiles(Array.from(e.target.files || []))} />
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={() => cameraRef.current?.click()} disabled={uploading}>📷 Kamera ile Tara</Btn>
          <Btn onClick={() => fileRef.current?.click()} disabled={uploading}>📎 Dosya Seç</Btn>
        </div>
        {uploading && <div style={{ fontSize: 12, color: T.amberText, marginTop: 10 }}>Yükleniyor...</div>}
        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>💡 Telefonda "Kamera ile Tara" belgeyi fotoğraflayarak kaydeder.</div>
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
        : docs.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Henüz belge yok</div>
          : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
              {docs.map(doc => (
                <div key={doc.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div onClick={() => openDoc(doc)} style={{ height: 70, background: T.bgSurface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, cursor: "pointer" }}>📄</div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.title}</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: T.indigoDim, color: T.indigoText }}>{DOC_CATEGORIES[doc.category] || doc.category}</span>
                      <button onClick={() => deleteDoc(doc)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MESAJLAR SAYFASI (çalışanlar arası sohbet)
// ─────────────────────────────────────────────
function MessagesPage({ currentStaff, staff }) {
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [newChatModal, setNewChatModal] = useState(false);
  const [groupModal, setGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const otherStaff = staff.filter(s => s.id !== currentStaff.id);

  // Konuşmaları yükle
  const loadConversations = async () => {
    const { data: myMems } = await supabase
      .from('conversation_members').select('conversation_id').eq('staff_id', currentStaff.id);
    const convIds = (myMems || []).map(m => m.conversation_id);
    if (convIds.length === 0) { setConversations([]); setLoading(false); return; }

    const { data: convs } = await supabase.from('conversations').select('*').in('id', convIds);
    const { data: allMems } = await supabase.from('conversation_members').select('*').in('conversation_id', convIds);
    const { data: msgs } = await supabase.from('staff_messages').select('*').in('conversation_id', convIds).order('created_at', { ascending: true });

    const list = (convs || []).map(conv => {
      const memberIds = (allMems || []).filter(m => m.conversation_id === conv.id).map(m => m.staff_id);
      const memberNames = memberIds.map(id => staff.find(s => s.id === id)?.name || "?");
      const convMsgs = (msgs || []).filter(m => m.conversation_id === conv.id);
      const lastMsg = convMsgs[convMsgs.length - 1];
      // Özel sohbette isim: karşı tarafın adı
      let displayName = conv.name;
      if (!conv.is_group) {
        const otherId = memberIds.find(id => id !== currentStaff.id);
        displayName = staff.find(s => s.id === otherId)?.name || "Bilinmeyen";
      }
      return {
        id: conv.id, isGroup: conv.is_group, name: displayName,
        memberIds, memberNames, lastText: lastMsg?.text || "",
        lastTime: lastMsg?.created_at || conv.created_at,
      };
    });
    // Son mesaja göre sırala
    list.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
    setConversations(list);
    setLoading(false);
  };

  // Aktif konuşmanın mesajlarını yükle
  const loadMessages = async (convId) => {
    if (!convId) return;
    const { data } = await supabase
      .from('staff_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true });
    setMessages(data || []);
  };

  useEffect(() => { loadConversations(); }, []);

  // Aktif sohbet açıkken 3 saniyede bir yenile (canlı sohbet hissi)
  useEffect(() => {
    if (!activeConvId) return;
    loadMessages(activeConvId);
    const interval = setInterval(() => {
      loadMessages(activeConvId);
      loadConversations();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeConvId]);

  // Yeni mesaj gelince en alta kaydır
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConvId) return;
    const text = newMessage.trim();
    setNewMessage("");
    // Anında ekranda göster
    const temp = { id: "temp-" + Date.now(), conversation_id: activeConvId, sender_id: currentStaff.id, text, created_at: new Date().toISOString() };
    setMessages(prev => [...prev, temp]);

    const { error } = await supabase.from('staff_messages').insert({
      conversation_id: activeConvId,
      sender_id: currentStaff.id,
      text,
      created_at: new Date().toISOString(),
    });
    if (error) {
      alert("Mesaj gönderilemedi: " + error.message + "\n\nMesajlaşma tabloları eksik olabilir. SQL kodunu çalıştırın.");
    }
    loadMessages(activeConvId);
  };

  // Özel sohbet başlat (varsa aç, yoksa oluştur)
  const startPrivateChat = async (otherId) => {
    setNewChatModal(false);
    // Mevcut özel sohbet var mı kontrol et
    const existing = conversations.find(c => !c.isGroup && c.memberIds.length === 2 && c.memberIds.includes(otherId));
    if (existing) { setActiveConvId(existing.id); return; }

    const { data: conv, error } = await supabase.from('conversations').insert({
      name: null, is_group: false, created_by: currentStaff.id, created_at: new Date().toISOString(),
    }).select().single();
    if (error) { alert("Sohbet oluşturulamadı: " + error.message + "\n\nSQL kodunu çalıştırdığınızdan emin olun."); return; }

    await supabase.from('conversation_members').insert([
      { conversation_id: conv.id, staff_id: currentStaff.id },
      { conversation_id: conv.id, staff_id: otherId },
    ]);
    await loadConversations();
    setActiveConvId(conv.id);
  };

  // Grup oluştur
  const createGroup = async () => {
    if (!groupName.trim()) { alert("Grup adı girin"); return; }
    if (groupMembers.length === 0) { alert("En az bir üye seçin"); return; }
    setGroupModal(false);

    const { data: conv, error } = await supabase.from('conversations').insert({
      name: groupName.trim(), is_group: true, created_by: currentStaff.id, created_at: new Date().toISOString(),
    }).select().single();
    if (error) { alert("Grup oluşturulamadı: " + error.message); return; }

    const members = [currentStaff.id, ...groupMembers].map(id => ({ conversation_id: conv.id, staff_id: id }));
    await supabase.from('conversation_members').insert(members);

    setGroupName(""); setGroupMembers([]);
    await loadConversations();
    setActiveConvId(conv.id);
  };

  // Sohbet veya grubu sil
  const deleteConversation = async (conv) => {
    const isGroup = conv.isGroup;
    const msg = isGroup
      ? `"${conv.name}" grubunu silmek istediğinize emin misiniz?\n\nTüm mesajlar kalıcı olarak silinecek.`
      : `${conv.name} ile olan sohbeti silmek istediğinize emin misiniz?\n\nTüm mesajlar kalıcı olarak silinecek.`;
    if (!window.confirm(msg)) return;
    // Üyeler ve mesajlar CASCADE ile otomatik silinir; yine de garantiye alalım
    await supabase.from('staff_messages').delete().eq('conversation_id', conv.id);
    await supabase.from('conversation_members').delete().eq('conversation_id', conv.id);
    const { error } = await supabase.from('conversations').delete().eq('id', conv.id);
    if (error) { alert("Silinemedi: " + error.message); return; }
    setActiveConvId(null);
    setMessages([]);
    await loadConversations();
  };

  const activeConv = conversations.find(c => c.id === activeConvId);
  const fmtTime = (iso) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday = d.toDateString() === today.toDateString();
    return isToday ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
                   : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div style={{ display: "flex", gap: 16, height: "calc(100vh - 140px)" }}>
      {/* SOL: Sohbet listesi */}
      <div style={{ width: 300, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 10 }}>💬 Sohbetler</div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setNewChatModal(true)} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "7px", borderRadius: 8, background: T.amber, color: T.white, border: "none", cursor: "pointer" }}>＋ Özel</button>
            <button onClick={() => setGroupModal(true)} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "7px", borderRadius: 8, background: T.indigo, color: "#A8C4DC", border: "none", cursor: "pointer" }}>👥 Grup</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {loading && <div style={{ textAlign: "center", color: T.textMuted, fontSize: 12, marginTop: 20 }}>Yükleniyor...</div>}
          {!loading && conversations.length === 0 && (
            <div style={{ textAlign: "center", color: T.textMuted, fontSize: 12, marginTop: 30, padding: "0 16px" }}>Henüz sohbet yok.<br />"＋ Özel" veya "👥 Grup" ile başla!</div>
          )}
          {conversations.map(conv => {
            const active = conv.id === activeConvId;
            const initials = conv.isGroup ? "👥" : (conv.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase());
            return (
              <div key={conv.id} onClick={() => setActiveConvId(conv.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 2,
                background: active ? T.bgSurface : "transparent", border: `1px solid ${active ? T.borderLight : "transparent"}`,
              }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: conv.isGroup ? T.indigo : T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontSize: conv.isGroup ? 18 : 13, fontWeight: 700, color: T.white, flexShrink: 0 }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.isGroup ? `${conv.memberIds.length} üye · ` : ""}{conv.lastText || "Yeni sohbet"}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SAĞ: Aktif sohbet */}
      <div style={{ flex: 1, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!activeConv ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: T.textMuted }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <div style={{ fontSize: 14 }}>Sohbet etmek için soldan bir konuşma seç</div>
          </div>
        ) : (
          <>
            {/* Sohbet başlığı */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: activeConv.isGroup ? T.indigo : T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontSize: activeConv.isGroup ? 18 : 14, fontWeight: 700, color: T.white }}>
                {activeConv.isGroup ? "👥" : activeConv.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>{activeConv.name}</div>
                <div style={{ fontSize: 11, color: T.textMuted }}>{activeConv.isGroup ? activeConv.memberNames.join(", ") : "Özel sohbet"}</div>
              </div>
              <Btn onClick={()=>{
                if(messages.length===0){ alert("Yazdırılacak mesaj yok"); return; }
                const rows = messages.map(m=>({
                  "Tarih/Saat": new Date(m.created_at).toLocaleString("tr-TR"),
                  "Gönderen": staff.find(s=>s.id===m.sender_id)?.name || "?",
                  "Mesaj": m.text,
                }));
                printData(`Mesaj Geçmişi - ${activeConv.name}`, rows);
              }} style={{fontSize:11,padding:"6px 12px"}}>🖨️ Yazdır</Btn>
              <Btn onClick={()=>deleteConversation(activeConv)} style={{fontSize:11,padding:"6px 12px",background:T.redDim,color:T.redText}}>🗑 {activeConv.isGroup?"Grubu Sil":"Sohbeti Sil"}</Btn>
            </div>

            {/* Mesajlar */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: T.textMuted, fontSize: 12, marginTop: 30 }}>Henüz mesaj yok. İlk mesajı sen gönder! 👋</div>
              )}
              {messages.map(msg => {
                const mine = msg.sender_id === currentStaff.id;
                const senderName = staff.find(s => s.id === msg.sender_id)?.name || "?";
                return (
                  <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                    {activeConv.isGroup && !mine && (
                      <div style={{ fontSize: 10, color: T.amberText, fontWeight: 600, marginBottom: 2, marginLeft: 4 }}>{senderName}</div>
                    )}
                    <div style={{
                      background: mine ? T.amber : T.bgSurface, color: mine ? T.white : T.textPrimary,
                      padding: "9px 13px", borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                      fontSize: 13, maxWidth: "75%", wordBreak: "break-word", lineHeight: 1.4,
                      border: mine ? "none" : `1px solid ${T.border}`,
                    }}>
                      {msg.text}
                    </div>
                    <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2, marginLeft: mine ? 0 : 4, marginRight: mine ? 4 : 0 }}>{fmtTime(msg.created_at)}</div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Mesaj yazma alanı */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, alignItems: "center" }}>
              <EmojiButton onSelect={(e) => setNewMessage(prev => prev + e)} size={22} />
              <input
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Mesaj yaz..."
                style={{ flex: 1, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: T.textPrimary, outline: "none" }}
              />
              <button onClick={sendMessage} style={{ background: T.amber, color: T.white, border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Gönder</button>
            </div>
          </>
        )}
      </div>

      {/* Yeni özel sohbet modalı */}
      {newChatModal && (
        <Modal title="Yeni Özel Sohbet" onClose={() => setNewChatModal(false)}>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>Sohbet başlatmak istediğin kişiyi seç:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 300, overflowY: "auto" }}>
            {otherStaff.length === 0 && <div style={{ fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>Başka çalışan yok</div>}
            {otherStaff.map(s => (
              <div key={s.id} onClick={() => startPrivateChat(s.id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                background: T.bgInput, border: `1px solid ${T.border}`,
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = T.borderLight}
              onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: s.color || T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: T.white }}>{s.initials}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: T.textMuted }}>{s.role}</div>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Yeni grup modalı */}
      {groupModal && (
        <Modal title="Yeni Grup Oluştur" onClose={() => { setGroupModal(false); setGroupName(""); setGroupMembers([]); }}>
          <FormField label="Grup Adı">
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <Input placeholder="Örn: Tasarım Ekibi" value={groupName} onChange={e => setGroupName(e.target.value)} />
              <EmojiButton onSelect={(e) => setGroupName(prev => prev + e)} size={20} />
            </div>
          </FormField>
          <div style={{ fontSize: 12, color: T.textMuted, marginTop: 8, marginBottom: 8 }}>Üyeleri seç:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {otherStaff.map(s => {
              const selected = groupMembers.includes(s.id);
              return (
                <div key={s.id} onClick={() => setGroupMembers(prev => selected ? prev.filter(id => id !== s.id) : [...prev, s.id])} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                  background: selected ? T.amberDim : T.bgInput, border: `1px solid ${selected ? T.amber + "66" : T.border}`,
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: s.color || T.amber, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.white }}>{s.initials}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{s.role}</div>
                  </div>
                  {selected && <span style={{ color: T.amber, fontSize: 16 }}>✓</span>}
                </div>
              );
            })}
          </div>
          <ModalActions onClose={() => { setGroupModal(false); setGroupName(""); setGroupMembers([]); }} onSave={createGroup} />
        </Modal>
      )}
    </div>
  );
}

async function loadAllData() {
  const [
    { data: clientsRaw },
    { data: staffRaw },
    { data: tasksRaw },
    { data: postsRaw },
    { data: invoicesRaw },
    { data: mediaRaw },
    { data: publishesRaw },
  ] = await Promise.all([
    supabase.from('clients').select('*'),
    supabase.from('staff').select('*'),
    supabase.from('tasks').select('*'),
    supabase.from('posts').select('*'),
    supabase.from('invoices').select('*'),
    supabase.from('media').select('*'),
    supabase.from('publishes').select('*'),
  ]);

  const clients = (clientsRaw || []).filter(c => !c.deleted_at).map(c => ({
    id: c.id, name: c.name, category: c.category || "", initials: c.initials || "",
    accentColor: c.accent_color || "#6366F1", phone: c.phone || "", address: c.address || "",
    city: c.city || "", district: c.district || "", taxNumber: c.tax_number || "", taxOffice: c.tax_office || "",
    socialMedia: c.social_media || "", socialPassword: c.social_password || "", description: c.description || "", monthlyPostQuota: c.monthly_post_quota || 0, quotaDetail: c.quota_detail || {},
    platforms: c.platforms || [], publishDays: c.publish_days || [], shootDays: c.shoot_days || [],
    publishTimes: c.publish_times || [],
    monthlyFee: c.monthly_fee || 0, contractStart: c.contract_start || "", contractEnd: c.contract_end || null, paymentDueDate: c.payment_due_date || null,
    posts: (postsRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, date: p.date, platform: p.platform, type: p.type, title: p.title, status: p.status, description: p.description, approval: p.approval || 'pending', approvalNote: p.approval_note || '',
    })),
    publishesList: (publishesRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, taskId: p.task_id, publisherId: p.publisher_id, platform: p.platform, contentType: p.content_type, publishedAt: p.published_at,
    })),
    invoices: (invoicesRaw || []).filter(i => i.client_id === c.id).map(i => ({
      id: i.id, no: i.no, date: i.date, amount: i.amount, vat: i.vat, total: i.total, status: i.status, desc: i.description,
    })),
    media: (mediaRaw || []).filter(m => m.client_id === c.id).map(m => ({
      id: m.id, name: m.name, type: m.type, size: m.size, date: m.date,
      storagePath: m.storage_path, storageType: m.storage_type,
      uploaderName: m.uploader_name || "", uploadedAt: m.uploaded_at || null,
    })),
  }));

  const staff = (staffRaw || []).filter(s => !s.deleted_at).map(s => ({
    id: s.id, name: s.name, role: s.role || "", initials: s.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase(),
    color: ["#6366F1", "#EC4899", "#10B981"][s.id % 3], type: s.type || "Tam zamanlı",
    email: s.email, phone: s.phone || "", start: s.start_date || "",
    is_admin: s.is_admin, perm_finance: s.perm_finance, perm_manage_clients: s.perm_manage_clients, perm_manage_staff: s.perm_manage_staff, perm_accounting: s.perm_accounting, perm_reports: s.perm_reports,
  }));

  const tasks = (tasksRaw || []).filter(t => !t.deleted_at).map(t => ({
    id: t.id, title: t.title, client: clients.find(c => c.id === t.client_id)?.name || "", clientId: t.client_id || null,
    type: t.type || "", priority: t.priority || "mid", due: t.due_date || "", col: t.col || "todo", assignedTo: t.assigned_to || null, assignedAt: t.assigned_at || null,
  }));

  // Alfabetik sıralama (Türkçe) — tüm sayfalara yansır
  clients.sort((a,b)=>(a.name||"").localeCompare(b.name||"","tr",{sensitivity:"base"}));
  staff.sort((a,b)=>(a.name||"").localeCompare(b.name||"","tr",{sensitivity:"base"}));
  tasks.sort((a,b)=>(a.title||"").localeCompare(b.title||"","tr",{sensitivity:"base"}));

  return { clients, staff, tasks, allClients: clientsRaw || [], allStaff: staffRaw || [] };
}

// ─────────────────────────────────────────────
// BİLDİRİM ZİLİ - mevcut verilerden uyarı hesaplar
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// GLOBAL ARAMA - müşteri, potansiyel, görev, fikir
// ─────────────────────────────────────────────
function GlobalSearch({ clients, tasks, setPage }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const boxRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: l } = await supabase.from('leads').select('id,business_name,city,phone,status');
        setLeads(l || []);
      } catch (e) { setLeads([]); }
      try {
        const { data: i } = await supabase.from('ideas').select('id,title,description');
        setIdeas(i || []);
      } catch (e) { setIdeas([]); }
    })();
  }, []);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const term = q.trim().toLocaleLowerCase("tr-TR");
  const results = [];
  if (term.length >= 2) {
    clients.forEach(c => {
      if ((c.name || "").toLocaleLowerCase("tr-TR").includes(term) || (c.category || "").toLocaleLowerCase("tr-TR").includes(term) || (c.phone || "").includes(term) || (c.socialMedia || "").toLocaleLowerCase("tr-TR").includes(term)) {
        results.push({ type: "Müşteri", icon: "🏢", label: c.name, sub: c.category || c.phone || "", page: "clients", color: T.indigoText });
      }
    });
    leads.forEach(l => {
      if ((l.business_name || "").toLocaleLowerCase("tr-TR").includes(term) || (l.city || "").toLocaleLowerCase("tr-TR").includes(term) || (l.phone || "").includes(term)) {
        results.push({ type: "Soğuk Arama", icon: "📞", label: l.business_name, sub: l.city || l.phone || "", page: "leads", color: T.amberText });
      }
    });
    tasks.forEach(t => {
      if ((t.title || "").toLocaleLowerCase("tr-TR").includes(term) || (t.description || "").toLocaleLowerCase("tr-TR").includes(term)) {
        results.push({ type: "Görev", icon: "📋", label: t.title, sub: t.description || "", page: "tasks", color: T.greenText });
      }
    });
    ideas.forEach(i => {
      if ((i.title || "").toLocaleLowerCase("tr-TR").includes(term) || (i.description || "").toLocaleLowerCase("tr-TR").includes(term)) {
        results.push({ type: "Fikir", icon: "💡", label: i.title, sub: i.description || "", page: "ideas", color: "#F59E0B" });
      }
    });
  }
  const shown = results.slice(0, 12);

  return (
    <div ref={boxRef} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="🔍 Ara: müşteri, potansiyel, görev, fikir..."
        style={{ width: "100%", background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 14px", color: T.textPrimary, fontSize: 13, outline: "none" }}
      />
      {open && term.length >= 2 && (
        <div style={{ position: "absolute", top: 44, left: 0, right: 0, maxHeight: 400, overflowY: "auto", background: T.bgCard, border: `1px solid ${T.borderLight}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", zIndex: 1000 }}>
          {shown.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: T.textMuted, fontSize: 13 }}>"{q}" için sonuç yok</div>
          ) : (
            shown.map((r, i) => (
              <div key={i} onClick={() => { setPage(r.page); setOpen(false); setQ(""); }} style={{ display: "flex", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgCardHover}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 17 }}>{r.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</div>
                  {r.sub && <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</div>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: T.bgInput, color: r.color, flexShrink: 0 }}>{r.type}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell({ clients, tasks, perms, setPage, currentStaff }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState([]);
  const [payments, setPayments] = useState([]);
  const [agreedLeads, setAgreedLeads] = useState([]);
  const boxRef = useRef(null);
  // Kullanıcı bazlı okunmuş bildirimler (localStorage)
  const readStoreKey = `notifRead_${currentStaff?.id || "user"}`;
  const [readKeys, setReadKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem(readStoreKey) || "[]"); } catch (e) { return []; }
  });

  useEffect(() => {
    (async () => {
      if (perms.accounting || perms.finance) {
        const { data: e } = await supabase.from('accounting_entries').select('*');
        setEntries(e || []);
        const { data: p } = await supabase.from('client_payments').select('*');
        setPayments(p || []);
      }
      const { data: l } = await supabase.from('leads').select('*').eq('status', 'agreed');
      setAgreedLeads(l || []);
    })();
  }, []);

  // Dışına tıklayınca kapat
  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ── Bildirimleri hesapla ──
  const today = new Date();
  let wd = today.getDay(); wd = wd === 0 ? 6 : wd - 1;
  const todayStr = today.toISOString().slice(0, 10);
  const in7Str = new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10);

  const todayPublish = clients.filter(c => (c.publishDays || []).some(d => weekdayIndexOf(d) === wd));
  const todayShoot = clients.filter(c => (c.shootDays || []).some(d => weekdayIndexOf(d) === wd));

  // Revize istenen içerikler (aksiyon bekliyor)
  const revisionClients = clients.filter(c => (c.posts || []).some(p => p.approval === "revision"));

  const notifs = [];

  if (revisionClients.length) {
    const totalRev = clients.reduce((s, c) => s + (c.posts || []).filter(p => p.approval === "revision").length, 0);
    notifs.push({ icon: "🔄", title: `${totalRev} içerik revize bekliyor`, sub: revisionClients.map(c => c.name).join(", "), page: "clients", sev: "high" });
  }
  if (todayPublish.length) notifs.push({ icon: "📅", title: `Bugün ${todayPublish.length} paylaşım günü`, sub: todayPublish.map(c => c.name).join(", "), page: "calendar", sev: "info" });
  if (todayShoot.length) notifs.push({ icon: "📷", title: `Bugün ${todayShoot.length} çekim günü`, sub: todayShoot.map(c => c.name).join(", "), page: "calendar", sev: "info" });

  if (perms.finance) {
    const overdueInv = clients.filter(c => (c.invoices || []).some(i => i.status === "overdue"));
    if (overdueInv.length) notifs.push({ icon: "⚠️", title: `${overdueInv.length} müşterinin gecikmiş faturası`, sub: overdueInv.map(c => c.name).join(", "), page: "clients", sev: "high" });

    // Ödenmemiş ayı olan müşteriler
    const nowRef = currentMonthRef();
    const owing = clients.filter(c => {
      const startRef = parseContractStartToRef(c.contractStart) || `${new Date().getFullYear()}-01`;
      const months = generateMonthRange(startRef, nowRef);
      const cPay = payments.filter(p => p.client_id === c.id);
      const totalPaid = cPay.reduce((s, p) => s + Number(p.amount || 0), 0);
      const expected = months.length * (c.monthlyFee || 0);
      return expected - totalPaid > 0;
    });
    if (owing.length) notifs.push({ icon: "💰", title: `${owing.length} müşterinin ödenmemiş ayı var`, sub: owing.map(c => c.name).join(", "), page: "accounting", sev: "mid" });
  }

  if (perms.accounting || perms.finance) {
    const overdueExp = entries.filter(e => !e.is_paid && e.due_date && e.due_date < todayStr);
    const upcomingExp = entries.filter(e => !e.is_paid && e.due_date && e.due_date >= todayStr && e.due_date <= in7Str);
    if (overdueExp.length) notifs.push({ icon: "🔴", title: `${overdueExp.length} vadesi geçmiş gider ödemesi`, sub: overdueExp.map(e => e.title).join(", "), page: "accounting", sev: "high" });
    if (upcomingExp.length) notifs.push({ icon: "🏛️", title: `${upcomingExp.length} yaklaşan gider ödemesi (7 gün)`, sub: upcomingExp.map(e => `${e.title} · ${e.due_date}`).join(", "), page: "accounting", sev: "mid" });
  }

  if (agreedLeads.length) notifs.push({ icon: "✅", title: `${agreedLeads.length} anlaşılan potansiyel taşınmayı bekliyor`, sub: agreedLeads.map(l => l.business_name).join(", "), page: "leads", sev: "mid" });

  // ── Görev bazlı uyarılar ──
  // Teslim tarihi geçmiş, hâlâ tamamlanmamış görevler
  const overdueTasks = tasks.filter(t => {
    if (!t.due || t.due === "—" || t.due.length < 8) return false;
    if (t.col === "done" || t.col === "published") return false;
    return t.due < todayStr;
  });
  if (overdueTasks.length) notifs.push({ icon: "⏰", title: `${overdueTasks.length} görevin teslim tarihi geçti`, sub: overdueTasks.map(t => t.title).join(", "), page: "tasks", sev: "high" });

  // Bugün paylaşım günü olan ama bugün henüz paylaşım yapılmamış müşteriler
  const publishedTodayIds = new Set();
  clients.forEach(c => (c.publishesList || []).forEach(p => { if (p.publishedAt && String(p.publishedAt).slice(0, 10) === todayStr) publishedTodayIds.add(c.id); }));
  const pendingPublishToday = todayPublish.filter(c => !publishedTodayIds.has(c.id));
  if (pendingPublishToday.length) notifs.push({ icon: "🔔", title: `${pendingPublishToday.length} müşterinin bugünkü paylaşımı henüz yapılmadı`, sub: pendingPublishToday.map(c => c.name).join(", "), page: "tasks", sev: "mid" });

  // Sözleşmesi yaklaşan / biten müşteriler (yenileme)
  const expiredContracts = clients.filter(c => { if (!c.contractEnd) return false; return new Date(c.contractEnd) < today; });
  const soonContracts = clients.filter(c => { if (!c.contractEnd) return false; const d = new Date(c.contractEnd); const days = Math.ceil((d - today) / 86400000); return days >= 0 && days <= 30; });
  if (expiredContracts.length) notifs.push({ icon: "📛", title: `${expiredContracts.length} müşterinin sözleşmesi bitti (yenileme)`, sub: expiredContracts.map(c => c.name).join(", "), page: "clients", sev: "high" });
  if (soonContracts.length) notifs.push({ icon: "📆", title: `${soonContracts.length} müşterinin sözleşmesi 30 gün içinde bitiyor`, sub: soonContracts.map(c => `${c.name} (${new Date(c.contractEnd).toLocaleDateString("tr-TR")})`).join(", "), page: "clients", sev: "mid" });

  // Her bildirime benzersiz anahtar (içerik değişince yeniden uyarır)
  const keyOf = (n) => `${n.icon}|${n.title}`;
  const allKeys = notifs.map(keyOf);
  // Okunmamış = henüz okundu listesinde olmayanlar
  const unreadCount = notifs.filter(n => !readKeys.includes(keyOf(n))).length;
  const count = notifs.length;

  // Zil açılınca görünen tüm bildirimleri okundu say (rozet söner)
  const markAllRead = () => {
    const merged = Array.from(new Set([...readKeys, ...allKeys]));
    setReadKeys(merged);
    try { localStorage.setItem(readStoreKey, JSON.stringify(merged)); } catch (e) {}
  };
  const toggleOpen = () => {
    setOpen(o => {
      const next = !o;
      if (next) markAllRead(); // açarken okundu işaretle
      return next;
    });
  };

  const sevColor = (s) => s === "high" ? T.redText : s === "mid" ? T.amberText : T.indigoText;
  const sevBg = (s) => s === "high" ? T.redDim : s === "mid" ? T.amberDim : T.indigoDim;

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button onClick={toggleOpen} style={{ position: "relative", background: T.bgSurface, border: `1px solid ${T.border}`, borderRadius: 10, width: 40, height: 40, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
        🔔
        {unreadCount > 0 && <span style={{ position: "absolute", top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#EF4444", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount}</span>}
      </button>

      {open && (
        <div style={{ position: "absolute", top: 48, right: 0, width: 340, maxHeight: 440, overflowY: "auto", background: T.bgCard, border: `1px solid ${T.borderLight}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.4)", zIndex: 1000 }}>
          <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, color: T.textPrimary }}>🔔 Bildirimler {count > 0 && <span style={{ color: T.textMuted, fontWeight: 400 }}>({count})</span>}</div>
          {count === 0 ? (
            <div style={{ padding: "30px 16px", textAlign: "center", color: T.textMuted, fontSize: 13 }}>Şu an bekleyen bir şey yok 🎉</div>
          ) : (
            <div>
              {notifs.map((n, i) => (
                <div key={i} onClick={() => { setPage(n.page); setOpen(false); }} style={{ display: "flex", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer", transition: "background 0.12s" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.bgCardHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: sevBg(n.sev), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{n.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: sevColor(n.sev) }}>{n.title}</div>
                    {n.sub && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Bildirim sesi çal (harici dosya gerekmez, tarayıcıda üretilir)
function playNotificationSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const notes = [880, 1174.66]; // iki notalı hoş bir "ding"
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = freq;
      const start = ctx.currentTime + i * 0.12;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      o.start(start);
      o.stop(start + 0.36);
    });
  } catch (e) { /* ses çalınamazsa sessizce geç */ }
}

// ═══════════════════════════════════════════════════════════
// LANDING PAGE — Kurumsal tanıtım sitesi (giriş yapılmadan görünür)
// ═══════════════════════════════════════════════════════════
function LandingPage({ onEnter }) {
  useEffect(() => {
    // Panel body/html/#root'a taşma kilidi koymuş olabilir — site için kaydırmayı serbest bırak
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prev = {
      htmlH: html.style.height, htmlO: html.style.overflow,
      bodyH: body.style.height, bodyO: body.style.overflow, bodyP: body.style.position,
      rootH: root ? root.style.height : "", rootO: root ? root.style.overflow : "",
    };
    html.style.height = "auto"; html.style.overflow = "auto";
    body.style.height = "auto"; body.style.overflow = "auto"; body.style.position = "static";
    if (root) { root.style.height = "auto"; root.style.overflow = "visible"; }
    window.scrollTo(0, 0);

    const nav = document.getElementById('lp-nav');
    const onScroll = () => { if (nav) nav.classList.toggle('scrolled', window.scrollY > 20); };
    window.addEventListener('scroll', onScroll);

    const toggle = document.getElementById('lp-menuToggle');
    const links = document.getElementById('lp-navLinks');
    const onToggle = () => links && links.classList.toggle('open');
    if (toggle) toggle.addEventListener('click', onToggle);
    if (links) links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));

    const words = ['büyütürüz', 'parlatırız', 'öne taşırız', 'fark ettiririz', 'konuştururuz'];
    let wi = 0;
    const rot = document.getElementById('lp-rotator');
    const iv = setInterval(() => {
      wi = (wi + 1) % words.length;
      if (!rot) return;
      rot.style.opacity = '0'; rot.style.transition = 'opacity .3s';
      setTimeout(() => { rot.textContent = words[wi]; rot.style.opacity = '1'; }, 300);
    }, 2600);

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll('.lp .reveal').forEach((el, i) => { el.style.transitionDelay = ((i % 4) * 0.08) + 's'; io.observe(el); });

    return () => {
      window.removeEventListener('scroll', onScroll); if (toggle) toggle.removeEventListener('click', onToggle); clearInterval(iv); io.disconnect();
      // Panel stilini geri yükle
      html.style.height = prev.htmlH; html.style.overflow = prev.htmlO;
      body.style.height = prev.bodyH; body.style.overflow = prev.bodyO; body.style.position = prev.bodyP;
      if (root) { root.style.height = prev.rootH; root.style.overflow = prev.rootO; }
    };
  }, []);

  const css = `
  .lp{--bg:#0A0E16;--surface:#141B28;--line:#212C3E;--line2:#2C3A52;--text:#EEF3F9;--muted:#8B97A8;--muted2:#5F6C7E;--orange:#F25124;--pink:#EC4899;--violet:#8B5CF6;--cyan:#06B6D4;--grad:linear-gradient(100deg,#F25124 0%,#EC4899 38%,#8B5CF6 70%,#06B6D4 100%);--grad2:linear-gradient(135deg,#F25124,#EC4899);--grad3:linear-gradient(135deg,#8B5CF6,#06B6D4);font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased;min-height:100vh;position:relative;overflow-x:hidden}
  .lp *{margin:0;padding:0;box-sizing:border-box}
  .lp ::selection{background:var(--pink);color:#fff}
  .lp a{color:inherit;text-decoration:none;cursor:pointer}
  .lp .wrap{max-width:1200px;margin:0 auto;padding:0 24px}
  .lp .mesh{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
  .lp .orb{position:absolute;border-radius:50%;filter:blur(90px);opacity:0.5;animation:lpfloat 18s ease-in-out infinite}
  .lp .orb.a{width:520px;height:520px;background:#F25124;top:-160px;left:-120px}
  .lp .orb.b{width:460px;height:460px;background:#8B5CF6;top:10%;right:-140px;animation-delay:-6s}
  .lp .orb.c{width:400px;height:400px;background:#06B6D4;bottom:-120px;left:30%;animation-delay:-12s;opacity:0.35}
  @keyframes lpfloat{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-30px) scale(1.08)}66%{transform:translate(-30px,20px) scale(0.96)}}
  .lp nav{position:fixed;top:0;left:0;right:0;z-index:100;transition:all .3s ease;border-bottom:1px solid transparent}
  .lp nav.scrolled{background:rgba(10,14,22,0.82);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}
  .lp .nav-inner{display:flex;align-items:center;justify-content:space-between;height:74px}
  .lp .logo{font-family:'Space Grotesk';font-weight:700;font-size:24px;letter-spacing:-0.02em;display:flex;align-items:center;gap:2px}
  .lp .logo .m{background:var(--grad2);-webkit-background-clip:text;background-clip:text;color:transparent}
  .lp .logo .dot{color:var(--orange)}
  .lp .nav-links{display:flex;align-items:center;gap:34px}
  .lp .nav-links a.link{font-size:14px;color:var(--muted);font-weight:500;transition:color .2s;position:relative}
  .lp .nav-links a.link:hover{color:var(--text)}
  .lp .nav-links a.link::after{content:"";position:absolute;left:0;bottom:-6px;width:0;height:2px;background:var(--grad2);transition:width .25s}
  .lp .nav-links a.link:hover::after{width:100%}
  .lp .btn-login{font-family:'Space Grotesk';font-weight:600;font-size:14px;padding:10px 22px;border-radius:100px;background:var(--grad2);color:#fff;transition:transform .2s,box-shadow .2s;box-shadow:0 4px 20px rgba(242,81,36,0.3);border:none}
  .lp .btn-login:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(236,72,153,0.45)}
  .lp .menu-toggle{display:none;background:none;border:none;color:var(--text);cursor:pointer;font-size:24px}
  .lp header{position:relative;z-index:1;min-height:100vh;display:flex;align-items:center;padding-top:74px}
  .lp .hero{max-width:960px}
  .lp .eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:var(--muted);margin-bottom:28px;padding:8px 16px;border:1px solid var(--line2);border-radius:100px;background:rgba(255,255,255,0.02)}
  .lp .eyebrow .pulse{width:8px;height:8px;border-radius:50%;background:var(--orange);animation:lppulse 2s infinite}
  @keyframes lppulse{0%{box-shadow:0 0 0 0 rgba(242,81,36,0.6)}70%{box-shadow:0 0 0 12px rgba(242,81,36,0)}100%{box-shadow:0 0 0 0 rgba(242,81,36,0)}}
  .lp h1{font-family:'Space Grotesk';font-weight:700;font-size:clamp(44px,8vw,92px);line-height:1.02;letter-spacing:-0.03em;margin-bottom:28px}
  .lp .rotator{display:inline-block;background:var(--grad);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lpshine 6s linear infinite}
  @keyframes lpshine{to{background-position:200% center}}
  .lp .lead{font-size:clamp(17px,2.2vw,21px);color:var(--muted);max-width:600px;margin-bottom:40px}
  .lp .hero-cta{display:flex;gap:16px;flex-wrap:wrap}
  .lp .btn-primary{font-family:'Space Grotesk';font-weight:600;font-size:15px;padding:15px 32px;border-radius:100px;background:var(--grad2);color:#fff;transition:transform .2s,box-shadow .2s;box-shadow:0 6px 28px rgba(242,81,36,0.35);display:inline-flex;align-items:center;gap:10px;border:none}
  .lp .btn-primary:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(236,72,153,0.5)}
  .lp .btn-ghost{font-family:'Space Grotesk';font-weight:600;font-size:15px;padding:15px 32px;border-radius:100px;border:1px solid var(--line2);color:var(--text);transition:all .2s;display:inline-flex;align-items:center;gap:10px;background:none}
  .lp .btn-ghost:hover{border-color:var(--pink);background:rgba(236,72,153,0.08)}
  .lp .marquee{position:relative;z-index:1;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:22px 0;overflow:hidden;background:rgba(255,255,255,0.015);margin-top:20px}
  .lp .marquee-track{display:flex;gap:48px;white-space:nowrap;animation:lpscroll 28s linear infinite;width:max-content}
  .lp .marquee:hover .marquee-track{animation-play-state:paused}
  .lp .marquee-item{font-family:'Space Grotesk';font-weight:600;font-size:22px;color:var(--muted);display:flex;align-items:center;gap:48px}
  .lp .marquee-item .star{color:var(--orange);font-size:16px}
  @keyframes lpscroll{to{transform:translateX(-50%)}}
  .lp section{position:relative;z-index:1;padding:120px 0}
  .lp .sec-head{margin-bottom:64px;max-width:720px}
  .lp .sec-label{font-family:'Space Grotesk';font-size:14px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:transparent;background:var(--grad2);-webkit-background-clip:text;background-clip:text;margin-bottom:18px;display:block}
  .lp .sec-head h2{font-family:'Space Grotesk';font-weight:700;font-size:clamp(32px,5vw,52px);line-height:1.08;letter-spacing:-0.02em;margin-bottom:20px}
  .lp #lp-surec .sec-head h2{background:var(--grad);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lpshine 6s linear infinite}
  .lp .sec-head p{font-size:17px;color:var(--muted)}
  .lp .services-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
  .lp .service{position:relative;padding:32px;border-radius:22px;background:var(--surface);border:1px solid var(--line);overflow:hidden;transition:transform .3s,border-color .3s}
  .lp .service::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .4s}
  .lp .service:hover{transform:translateY(-6px);border-color:var(--line2)}
  .lp .service:hover::before{transform:scaleX(1)}
  .lp .service .icon{width:52px;height:52px;border-radius:15px;display:flex;align-items:center;justify-content:center;font-size:24px;margin-bottom:20px;background:var(--accent-soft);border:1px solid var(--accent-line)}
  .lp .service h3{font-family:'Space Grotesk';font-weight:600;font-size:21px;margin-bottom:11px;letter-spacing:-0.01em}
  .lp .service p{font-size:14.5px;color:var(--muted);line-height:1.6}
  .lp .s1{--accent:var(--grad2);--accent-soft:rgba(242,81,36,0.1);--accent-line:rgba(242,81,36,0.25)}
  .lp .s2{--accent:linear-gradient(135deg,#EC4899,#8B5CF6);--accent-soft:rgba(236,72,153,0.1);--accent-line:rgba(236,72,153,0.25)}
  .lp .s3{--accent:linear-gradient(135deg,#8B5CF6,#6366F1);--accent-soft:rgba(139,92,246,0.1);--accent-line:rgba(139,92,246,0.25)}
  .lp .s4{--accent:var(--grad3);--accent-soft:rgba(6,182,212,0.1);--accent-line:rgba(6,182,212,0.25)}
  .lp .s5{--accent:linear-gradient(135deg,#F25124,#F59E0B);--accent-soft:rgba(245,158,11,0.1);--accent-line:rgba(245,158,11,0.25)}
  .lp .s6{--accent:linear-gradient(135deg,#10B981,#06B6D4);--accent-soft:rgba(16,185,129,0.1);--accent-line:rgba(16,185,129,0.25)}
  .lp .s7{--accent:linear-gradient(135deg,#EC4899,#F25124);--accent-soft:rgba(236,72,153,0.1);--accent-line:rgba(236,72,153,0.25)}
  .lp .s8{--accent:linear-gradient(135deg,#6366F1,#06B6D4);--accent-soft:rgba(99,102,241,0.1);--accent-line:rgba(99,102,241,0.25)}
  .lp .s9{--accent:linear-gradient(135deg,#8B5CF6,#EC4899);--accent-soft:rgba(139,92,246,0.1);--accent-line:rgba(139,92,246,0.25)}
  .lp .s10{--accent:linear-gradient(135deg,#F25124,#EC4899);--accent-soft:rgba(242,81,36,0.1);--accent-line:rgba(242,81,36,0.25)}
  .lp .s11{--accent:linear-gradient(135deg,#06B6D4,#8B5CF6);--accent-soft:rgba(6,182,212,0.1);--accent-line:rgba(6,182,212,0.25)}
  .lp .s12{--accent:linear-gradient(135deg,#F59E0B,#EC4899);--accent-soft:rgba(245,158,11,0.1);--accent-line:rgba(245,158,11,0.25)}
  .lp .process{display:grid;grid-template-columns:repeat(4,1fr);gap:0}
  .lp .step{padding:32px 28px 32px 0;position:relative;border-top:1px solid var(--line2)}
  .lp .step .snum{font-family:'Space Grotesk';font-weight:700;font-size:15px;color:transparent;background:var(--grad2);-webkit-background-clip:text;background-clip:text;margin-bottom:16px;display:block}
  .lp .step h4{font-family:'Space Grotesk';font-weight:600;font-size:19px;margin-bottom:10px}
  .lp .step p{font-size:14px;color:var(--muted)}
  .lp .step::before{content:"";position:absolute;top:-1px;left:0;width:40px;height:3px;background:var(--grad2)}
  .lp .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;padding:56px 44px;border-radius:24px;background:linear-gradient(135deg,rgba(242,81,36,0.08),rgba(139,92,246,0.08));border:1px solid var(--line2)}
  .lp .stat .n{font-family:'Space Grotesk';font-weight:700;font-size:clamp(36px,5vw,52px);line-height:1;letter-spacing:-0.02em;background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:8px}
  .lp .stat .l{font-size:14px;color:var(--muted)}
  .lp .about{max-width:820px}
  .lp .about h2{font-family:'Space Grotesk';font-weight:700;font-size:clamp(30px,5vw,50px);line-height:1.1;letter-spacing:-0.02em;margin-bottom:28px}
  .lp .about-hl{background:var(--grad);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:lpshine 6s linear infinite}
  .lp .about-text p{font-size:17px;color:var(--muted);margin-bottom:20px;line-height:1.75}
  .lp .about-text p:last-child{margin-bottom:0}
  .lp .contact-card{border-radius:28px;background:var(--surface);border:1px solid var(--line);padding:64px;text-align:center;position:relative;overflow:hidden}
  .lp .contact-card::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 50% 0%,rgba(236,72,153,0.12),transparent 60%);pointer-events:none}
  .lp .contact-card h2{font-family:'Space Grotesk';font-weight:700;font-size:clamp(30px,5vw,48px);letter-spacing:-0.02em;margin-bottom:18px;position:relative}
  .lp .contact-card p{font-size:18px;color:var(--muted);margin-bottom:36px;position:relative}
  .lp .contact-methods{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;position:relative}
  .lp .cm{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;border-radius:100px;font-weight:600;font-size:15px;font-family:'Space Grotesk';transition:transform .2s}
  .lp .cm:hover{transform:translateY(-3px)}
  .lp .cm.wa{background:#25D366;color:#fff}
  .lp .cm.ig{background:var(--grad2);color:#fff}
  .lp .cm.line{border:1px solid var(--line2);color:var(--text)}
  .lp .contact-info{position:relative;margin-top:44px;padding-top:36px;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:20px;max-width:620px;margin-left:auto;margin-right:auto;text-align:left}
  .lp .ci-item{display:flex;gap:14px;align-items:flex-start}
  .lp .ci-ic{font-size:20px;flex-shrink:0;width:42px;height:42px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:12px}
  .lp .ci-lbl{font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted2);margin-bottom:3px}
  .lp .ci-val{font-size:15px;color:var(--text);line-height:1.5}
  .lp .ci-link{color:transparent;background:var(--grad2);-webkit-background-clip:text;background-clip:text;font-weight:600}
  .lp footer{position:relative;z-index:1;border-top:1px solid var(--line);padding:56px 0 40px}
  .lp .foot-inner{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:32px}
  .lp .foot-brand{max-width:320px}
  .lp .foot-brand .logo{margin-bottom:16px}
  .lp .foot-brand p{font-size:14px;color:var(--muted)}
  .lp .foot-col h5{font-family:'Space Grotesk';font-size:13px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--muted2);margin-bottom:16px}
  .lp .foot-col a{display:block;font-size:14px;color:var(--muted);margin-bottom:10px;transition:color .2s}
  .lp .foot-col a:hover{color:var(--text)}
  .lp .foot-bottom{margin-top:48px;padding-top:24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;font-size:13px;color:var(--muted2)}
  .lp .reveal{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease}
  .lp .reveal.in{opacity:1;transform:none}
  @media(max-width:900px){.lp .nav-links{position:fixed;top:74px;left:0;right:0;background:rgba(10,14,22,0.97);backdrop-filter:blur(16px);flex-direction:column;gap:0;padding:0;max-height:0;overflow:hidden;transition:max-height .3s;border-bottom:1px solid var(--line)}.lp .nav-links.open{max-height:400px;padding:16px 24px 24px}.lp .nav-links a.link{padding:14px 0;width:100%;border-bottom:1px solid var(--line)}.lp .nav-links .btn-login{width:100%;text-align:center;margin-top:12px}.lp .menu-toggle{display:block}.lp .services-grid{grid-template-columns:1fr 1fr}.lp .process{grid-template-columns:1fr 1fr}.lp .stats{grid-template-columns:1fr 1fr;padding:40px 28px}.lp .contact-card{padding:44px 24px}.lp section{padding:80px 0}}
  @media(max-width:640px){.lp .services-grid{grid-template-columns:1fr}}
  @media(max-width:520px){.lp .process{grid-template-columns:1fr}.lp .stats{grid-template-columns:1fr 1fr;gap:32px 16px}.lp .contact-methods{flex-direction:column}.lp .cm{justify-content:center}}
  @media(prefers-reduced-motion:reduce){.lp *{animation:none!important;transition:none!important}.lp .reveal{opacity:1;transform:none}}
  .lp :focus-visible{outline:2px solid var(--pink);outline-offset:3px;border-radius:4px}
  `;

  return (
    <div className="lp">
      <style>{css}</style>
      <div className="mesh" aria-hidden="true"><div className="orb a"></div><div className="orb b"></div><div className="orb c"></div></div>

      <nav id="lp-nav">
        <div className="wrap nav-inner">
          <a href="#lp-top" className="logo"><span className="p">panormos</span> <span className="m">medya</span><span className="dot">.</span></a>
          <div className="nav-links" id="lp-navLinks">
            <a href="#lp-hizmetler" className="link">Hizmetler</a>
            <a href="#lp-surec" className="link">Nasıl Çalışırız</a>
            <a href="#lp-hakkimizda" className="link">Hakkımızda</a>
            <a href="#lp-iletisim" className="link">İletişim</a>
            <button className="btn-login" onClick={onEnter}>Giriş Yap</button>
          </div>
          <button className="menu-toggle" id="lp-menuToggle" aria-label="Menü">☰</button>
        </div>
      </nav>

      <header id="lp-top">
        <div className="wrap">
          <div className="hero">
            <span className="eyebrow"><span className="pulse"></span>Markanı dijitalde büyüten ajans</span>
            <h1>Markanı<br /><span className="rotator" id="lp-rotator">büyütürüz</span></h1>
            <p className="lead">Instagram yönetiminden reklam kampanyalarına, içerik üretiminden tasarıma — markanı dijitalde fark edilir kılacak her şeyi tek çatı altında topluyoruz.</p>
            <div className="hero-cta">
              <a href="#lp-iletisim" className="btn-primary">Teklif Al →</a>
              <a href="#lp-hizmetler" className="btn-ghost">Hizmetleri Keşfet</a>
            </div>
          </div>
        </div>
      </header>

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          <span className="marquee-item">Sosyal Medya Yönetimi<span className="star">✦</span>Meta Reklam<span className="star">✦</span>SEO<span className="star">✦</span>Tanıtım Filmleri<span className="star">✦</span>Ürün Çekimi<span className="star">✦</span>Logo Tasarım<span className="star">✦</span>Kurumsal Kimlik<span className="star">✦</span>Dijital Baskı<span className="star">✦</span>Promosyon<span className="star">✦</span></span>
          <span className="marquee-item">Sosyal Medya Yönetimi<span className="star">✦</span>Meta Reklam<span className="star">✦</span>SEO<span className="star">✦</span>Tanıtım Filmleri<span className="star">✦</span>Ürün Çekimi<span className="star">✦</span>Logo Tasarım<span className="star">✦</span>Kurumsal Kimlik<span className="star">✦</span>Dijital Baskı<span className="star">✦</span>Promosyon<span className="star">✦</span></span>
        </div>
      </div>

      <section id="lp-hizmetler">
        <div className="wrap">
          <div className="sec-head reveal"><span className="sec-label">Hizmetlerimiz</span><h2>Markanı büyüten tüm hizmetler</h2><p>Sosyal medyadan reklama, çekimden tasarıma — dijitalde ihtiyacın olan her şey tek çatı altında.</p></div>
          <div className="services-grid">
            <div className="service s1 reveal"><div className="icon">📱</div><h3>Sosyal Medya Yönetimi</h3><p>Instagram, Facebook ve YouTube hesaplarını profesyonelce yönetiyor; düzenli paylaşım, story ve etkileşimle takipçini gerçek müşteriye dönüştürüyoruz.</p></div>
            <div className="service s2 reveal"><div className="icon">🎯</div><h3>Meta Reklam Kurulumu</h3><p>Facebook ve Instagram reklamlarını doğru hedef kitleye, doğru bütçeyle kurup yönetiyoruz. Satış ve bilinirliğini ölçülebilir şekilde artırıyoruz.</p></div>
            <div className="service s3 reveal"><div className="icon">🔍</div><h3>SEO & Google Optimizasyonu</h3><p>Web sitenin Google'da üst sıralarda çıkması için SEO çalışması ve Google İşletme kurulumu yaparak seni müşterilerine ulaştırıyoruz.</p></div>
            <div className="service s4 reveal"><div className="icon">🎬</div><h3>Tanıtım Filmleri</h3><p>Markanı en etkileyici şekilde anlatan profesyonel tanıtım ve reklam filmleri çekiyor, kurgusuyla birlikte teslim ediyoruz.</p></div>
            <div className="service s5 reveal"><div className="icon">📸</div><h3>Ürün Çekimleri</h3><p>Ürünlerini en iyi gösteren profesyonel fotoğraf çekimleri; e-ticaret ve sosyal medya için yüksek kaliteli görseller.</p></div>
            <div className="service s6 reveal"><div className="icon">🍽️</div><h3>Menü & Mekan Çekimleri</h3><p>Restoran, kafe ve işletmeler için iştah açan menü fotoğrafları ve mekanını en güzel yansıtan atmosfer çekimleri.</p></div>
            <div className="service s7 reveal"><div className="icon">🎨</div><h3>Grafik Tasarım</h3><p>Sosyal medya görselleri, afiş, katalog ve dijital tasarımlar — markanı yansıtan özgün ve akılda kalıcı çalışmalar.</p></div>
            <div className="service s8 reveal"><div className="icon">✍️</div><h3>İçerik & Metin Üretimi</h3><p>Markanın diline uygun etkili metinler, reklam sloganları ve sosyal medya içerikleriyle mesajını doğru iletiyoruz.</p></div>
            <div className="service s9 reveal"><div className="icon">🚁</div><h3>Drone & Özel Çekim</h3><p>Havadan drone çekimleri ve özel prodüksiyonlarla markana fark yaratan, sıra dışı görseller kazandırıyoruz.</p></div>
            <div className="service s10 reveal"><div className="icon">✨</div><h3>Logo & Kurumsal Kimlik</h3><p>Markanın karakterini yansıtan özgün logo tasarımı ve baştan sona kurumsal kimlik çalışmasıyla akılda kalıcı bir marka yaratıyoruz.</p></div>
            <div className="service s11 reveal"><div className="icon">🎁</div><h3>Promosyon Ürünler</h3><p>Kalem, tişört, kupa, çanta ve daha fazlası — markanı taşıyan özel tasarımlı promosyon ürünlerini hazırlıyoruz.</p></div>
            <div className="service s12 reveal"><div className="icon">🖨️</div><h3>Dijital Baskı</h3><p>Kartvizit, broşür, afiş, tabela ve tüm baskı işlerini yüksek kalitede tasarlayıp basıma hazır hale getiriyoruz.</p></div>
          </div>
        </div>
      </section>

      <section id="lp-surec">
        <div className="wrap">
          <div className="sec-head reveal"><span className="sec-label">Nasıl Çalışırız</span><h2>Fikirden sonuca, dört adımda</h2><p>Şeffaf ve düzenli bir süreçle her aşamada yanındayız.</p></div>
          <div className="process">
            <div className="step reveal"><span className="snum">Keşif & Analiz</span><h4>Markanı Tanıyoruz</h4><p>Hedef kitleni, rakiplerini ve sektörünü analiz ederek markana özel dijital büyüme stratejisi çıkarıyoruz.</p></div>
            <div className="step reveal"><span className="snum">Strateji & Kurgu</span><h4>Yol Haritanı Çiziyoruz</h4><p>Sosyal medya içerik takvimi, reklam planı ve SEO stratejisiyle büyümenin temelini atıyoruz.</p></div>
            <div className="step reveal"><span className="snum">Üretim & Yayın</span><h4>İçerikleri Hayata Geçiriyoruz</h4><p>Profesyonel çekim, tasarım ve içeriklerle markanı düzenli olarak dijitalde görünür kılıyoruz.</p></div>
            <div className="step reveal"><span className="snum">Ölçüm & Büyüme</span><h4>Sonuçları Büyütüyoruz</h4><p>Detaylı raporlar ve sürekli optimizasyonla etkileşimini, takipçini ve satışını artırıyoruz.</p></div>
          </div>
        </div>
      </section>

      <section id="lp-hakkimizda">
        <div className="wrap">
          <div className="about reveal">
            <span className="sec-label">Hakkımızda</span>
            <h2>Markanın dijitaldeki<br /><span className="about-hl">büyüme ortağı</span></h2>
            <div className="about-text">
              <p>Panormos Medya olarak, markaların dijital dünyada hak ettiği yeri almasını sağlıyoruz. Sosyal medya yönetiminden reklam kampanyalarına, profesyonel çekimlerden tasarıma kadar ihtiyacın olan tüm hizmetleri tek çatı altında sunuyoruz.</p>
              <p>Amacımız sadece içerik üretmek değil; markanı tanıyıp, hedef kitlenle gerçek bir bağ kuran, satışa ve bilinirliğe dönüşen stratejiler geliştirmek. Her markaya özel yaklaşımımız ve ölçülebilir sonuç odağımızla, dijitaldeki yolculuğunda güvenilir ortağın oluyoruz.</p>
              <p>İşini bilen ekibimiz, yaratıcı bakış açımız ve şeffaf çalışma prensibimizle; markanı büyütmek için buradayız.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="lp-iletisim">
        <div className="wrap">
          <div className="contact-card reveal">
            <h2>Markanı birlikte büyütelim</h2>
            <p>Ücretsiz keşif görüşmesi için bize ulaş, sana özel teklifini hazırlayalım.</p>
            <div className="contact-methods">
              <a href="https://wa.me/905364716012" className="cm wa" target="_blank" rel="noopener">💬 WhatsApp</a>
              <a href="https://instagram.com/panormosmedya" className="cm ig" target="_blank" rel="noopener">📷 Instagram</a>
              <a href="mailto:info@panormosmedya.com" className="cm line">✉️ info@panormosmedya.com</a>
            </div>
            <div className="contact-info">
              <div className="ci-item"><span className="ci-ic">🏢</span><div><div className="ci-lbl">Ünvan</div><div className="ci-val">Panormos Medya Sanayi ve Ticaret Limited Şirketi</div></div></div>
              <div className="ci-item"><span className="ci-ic">📍</span><div><div className="ci-lbl">Adres</div><div className="ci-val">Paşakent Mahallesi, Şehit Şener Köksal Caddesi No: 6/A, Pervin Sitesi, Bandırma / BALIKESİR</div></div></div>
              <div className="ci-item"><span className="ci-ic">📞</span><div><div className="ci-lbl">Telefon</div><a className="ci-val ci-link" href="tel:+905364716012">0 (536) 471 60 12</a></div></div>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="foot-inner">
            <div className="foot-brand"><a href="#lp-top" className="logo"><span className="p">panormos</span> <span className="m">medya</span><span className="dot">.</span></a><p>Panormos Medya Sanayi ve Ticaret Limited Şirketi — markanı dijitalde büyüten sosyal medya ve reklam ajansı.</p></div>
            <div className="foot-col"><h5>Hizmetler</h5><a href="#lp-hizmetler">Instagram Yönetimi</a><a href="#lp-hizmetler">İçerik Üretimi</a><a href="#lp-hizmetler">Reklam Yönetimi</a><a href="#lp-hizmetler">Grafik Tasarım</a></div>
            <div className="foot-col"><h5>Kurumsal</h5><a href="#lp-hakkimizda">Hakkımızda</a><a href="#lp-surec">Nasıl Çalışırız</a><a href="#lp-iletisim">İletişim</a><a onClick={onEnter}>Çalışan Girişi</a></div>
            <div className="foot-col"><h5>İletişim</h5><a href="tel:+905364716012">0 (536) 471 60 12</a><a href="mailto:info@panormosmedya.com">info@panormosmedya.com</a><a href="https://instagram.com/panormosmedya" target="_blank" rel="noopener">@panormosmedya</a><a href="#lp-iletisim">Paşakent Mah. Bandırma / Balıkesir</a></div>
          </div>
          <div className="foot-bottom"><span>© 2026 Panormos Medya. Tüm hakları saklıdır.</span><span>Markanı büyütmek için buradayız ✦</span></div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [showLogin, setShowLogin] = useState(() => {
    // Doğrudan giriş bağlantısıyla gelenler için (#giris veya #panel)
    const h = window.location.hash.replace('#','');
    return h === 'giris' || h === 'login' || h === 'panel';
  });
  const [currentStaff, setCurrentStaff] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authDenied, setAuthDenied] = useState(false);
  const [staffResolving, setStaffResolving] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);
  const knownMsgIdsRef = useRef(null);
  const pageRef = useRef("dashboard");
  const [dataLoading, setDataLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [page, setPage] = useState(() => {
    const validPages = ['dashboard', 'clients', 'leads', 'pricing', 'calendar', 'ideas', 'tasks', 'reports', 'files', 'messages', 'accounting', 'staff'];
    const hash = window.location.hash.replace('#', '');
    if (validPages.includes(hash)) return hash;
    const saved = localStorage.getItem('currentPage');
    if (validPages.includes(saved)) return saved;
    return 'dashboard';
  });
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [allStaff, setAllStaff] = useState([]);

  useEffect(() => {
    localStorage.setItem('currentPage', page);
    if (window.location.hash.replace('#', '') !== page) {
      window.location.hash = page;
    }
  }, [page]);

  // Tarayıcı geri/ileri butonlarını dinle
  useEffect(() => {
    const onHashChange = () => {
      const validPages = ['dashboard', 'clients', 'leads', 'pricing', 'calendar', 'ideas', 'tasks', 'reports', 'files', 'messages', 'accounting', 'staff'];
      const hash = window.location.hash.replace('#', '');
      if (validPages.includes(hash)) setPage(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // 30 dakika hareketsizlik sonrası otomatik çıkış
  useEffect(() => {
    if (!session) return;
    const TIMEOUT = 30 * 60 * 1000; // 30 dakika
    let timer;

    const logout = async () => {
      await supabase.auth.signOut();
      alert("30 dakika işlem yapılmadığı için oturumunuz kapatıldı. Lütfen tekrar giriş yapın.");
      window.location.reload();
    };

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, TIMEOUT);
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer(); // başlat

    return () => {
      clearTimeout(timer);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [session]);

  useEffect(() => {
    if (!session) { setAuthDenied(false); setStaffResolving(false); return; }
    setStaffResolving(true);
    (async () => {
      const uid = session.user.id;
      const email = (session.user.email || "").toLowerCase();
      // 1) auth_id ile eşleştir
      let { data: row } = await supabase.from('staff').select('*').eq('auth_id', uid).maybeSingle();
      // 2) bulunamazsa: email ile eşleştir ve auth_id'yi bağla (ilk girişte otomatik)
      if (!row && email) {
        const { data: matches } = await supabase.from('staff').select('*').ilike('email', email).is('deleted_at', null).limit(1);
        const byEmail = matches && matches[0];
        if (byEmail) {
          await supabase.from('staff').update({ auth_id: uid }).eq('id', byEmail.id);
          row = { ...byEmail, auth_id: uid };
        }
      }
      if (row) { setCurrentStaff(row); setAuthDenied(false); }
      else { setCurrentStaff(null); setAuthDenied(true); }
      setStaffResolving(false);
    })();
  }, [session]);

  const refreshData = async () => {
    setDataLoading(true);
    const { clients, staff, tasks, allClients, allStaff } = await loadAllData();
    setClients(clients);
    setStaff(staff);
    setTasks(tasks);
    setAllClients(allClients);
    setAllStaff(allStaff);
    setDataLoading(false);
  };

  useEffect(() => {
    if (session && currentStaff) refreshData();
  }, [session, currentStaff]);

  // Sayfa değişimini ref'te tut (dinleyici içinde okumak için)
  useEffect(() => { pageRef.current = page; }, [page]);
  // Mesajlar sayfasına gelince okunmamış sayacı sıfırla
  useEffect(() => { if (page === "messages") setUnreadMsgs(0); }, [page]);

  // Global yeni mesaj dinleyici — bildirim + ses
  useEffect(() => {
    if (!currentStaff) return;
    // Tarayıcı bildirim izni iste
    if ("Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch (e) {}
    }
    const check = async () => {
      try {
        const { data: members } = await supabase.from('conversation_members').select('conversation_id').eq('staff_id', currentStaff.id);
        const convIds = (members || []).map(m => m.conversation_id);
        if (convIds.length === 0) { knownMsgIdsRef.current = new Set(); return; }
        const { data: msgs } = await supabase
          .from('staff_messages').select('id,sender_id,text,conversation_id')
          .in('conversation_id', convIds).neq('sender_id', currentStaff.id)
          .order('created_at', { ascending: false }).limit(50);
        const list = msgs || [];
        const ids = new Set(list.map(m => m.id));
        if (knownMsgIdsRef.current === null) { knownMsgIdsRef.current = ids; return; } // ilk yükleme: baz al, bildirim yok
        const newMsgs = list.filter(m => !knownMsgIdsRef.current.has(m.id));
        knownMsgIdsRef.current = ids;
        if (newMsgs.length > 0) {
          playNotificationSound();
          if (pageRef.current !== "messages") {
            setUnreadMsgs(u => u + newMsgs.length);
            if ("Notification" in window && Notification.permission === "granted") {
              const latest = newMsgs[0];
              try { new Notification("💬 Yeni mesaj", { body: (latest.text || "").slice(0, 90) }); } catch (e) {}
            }
          }
        }
      } catch (e) { /* sessiz geç */ }
    };
    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, [currentStaff]);

  if (authLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Yükleniyor...</div>;
  if (!session) {
    if (showLogin) return <Login onLogin={() => {}} />;
    return <LandingPage onEnter={() => { setShowLogin(true); window.scrollTo(0,0); }} />;
  }

  // Giriş yapıldı ama çalışan kaydı çözülüyor
  if (staffResolving) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Hesap kontrol ediliyor...</div>;

  // Giriş yapıldı ama bu email çalışan listesinde yok → erişim reddedildi
  if (authDenied) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,padding:20}}>
      <div style={{maxWidth:440,textAlign:"center",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:"40px 32px"}}>
        <div style={{fontSize:44,marginBottom:16}}>🔒</div>
        <div style={{fontSize:20,fontWeight:700,color:T.textPrimary,marginBottom:10}}>Erişim Yetkiniz Yok</div>
        <div style={{fontSize:14,color:T.textSecondary,lineHeight:1.6,marginBottom:8}}>
          <strong style={{color:T.amberText}}>{session.user.email}</strong> hesabı sistemde kayıtlı bir çalışana bağlı değil.
        </div>
        <div style={{fontSize:13,color:T.textMuted,lineHeight:1.6,marginBottom:24}}>
          Yöneticinizden sizi <strong>bu e-posta adresiyle</strong> çalışan olarak eklemesini isteyin. Eklendikten sonra tekrar giriş yapın.
        </div>
        <Btn variant="primary" onClick={async()=>{await supabase.auth.signOut();window.location.reload();}}>Çıkış Yap ve Tekrar Dene</Btn>
      </div>
    </div>
  );

  if (!currentStaff) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Yükleniyor...</div>;

  if (dataLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Veriler yükleniyor...</div>;

  // Yetki hesaplama: Yönetici her şeyi görür, diğerleri sadece izinli olduklarını
  const isAdmin = currentStaff.is_admin === true;
  const perms = {
    isAdmin,
    finance: isAdmin || currentStaff.perm_finance === true,       // Finansal bilgiler, faturalar, ödemeler, ücretler
    manageClients: isAdmin || currentStaff.perm_manage_clients === true,  // Müşteri ekle/düzenle/sil
    manageStaff: isAdmin || currentStaff.perm_manage_staff === true,      // Çalışan ekle/düzenle/sil
    accounting: isAdmin || currentStaff.perm_accounting === true || currentStaff.perm_finance === true, // Muhasebe erişimi
    reports: isAdmin || currentStaff.perm_reports === true, // Sosyal medya raporlama
  };

  return <div style={{display:"flex",height:"100vh",background:T.bg,color:T.textPrimary,fontFamily:"'Inter',sans-serif",position:"relative"}}>
    {/* Mobilde drawer açıkken arka plan karartma */}
    {isMobile && drawerOpen && <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:90}} />}

    <div style={{
      width:220,background:T.bgCard,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",
      ...(isMobile ? {position:"fixed",top:0,left:0,bottom:0,zIndex:100,transform:drawerOpen?"translateX(0)":"translateX(-100%)",transition:"transform 0.25s ease",boxShadow:drawerOpen?"4px 0 24px rgba(0,0,0,0.4)":"none"} : {})
    }}>
      <div style={{padding:"16px 16px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{marginBottom:0}}>
          <div style={{fontSize:20,fontWeight:700,color:"#1A2B3F",letterSpacing:"-0.02em"}}>panormos</div>
          <div style={{fontSize:18,fontWeight:700,color:"#F25124",letterSpacing:"-0.02em"}}>medya.</div>
        </div>
        {isMobile && <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer",padding:4}}>✕</button>}
      </div>
      <div style={{flex:1,padding:"12px 8px",overflow:"auto"}}>
        {NAV.filter(item => (item.id !== 'staff' || perms.manageStaff) && (item.id !== 'accounting' || perms.accounting) && (item.id !== 'pricing' || perms.finance || perms.manageClients) && (item.id !== 'reports' || perms.reports)).map(item=>(
          <div key={item.id} onClick={()=>{setPage(item.id);setDrawerOpen(false);}} style={{
            display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,marginBottom:2,
            background:page===item.id?"rgba(34,58,89,0.45)":"transparent",
            border:`1px solid ${page===item.id?T.indigo+"88":"transparent"}`,
            color:page===item.id?"#A8C4DC":T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:page===item.id?600:400,transition:"all 0.12s",
          }}>
            <span style={{fontSize:15}}>{item.icon}</span>
            <span style={{flex:1}}>{item.label}</span>
            {item.id==="messages" && unreadMsgs>0 && (
              <span style={{minWidth:18,height:18,padding:"0 5px",borderRadius:9,background:"#EF4444",color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{unreadMsgs}</span>
            )}
          </div>
        ))}
      </div>

      {/* Kullanıcı bilgisi + Çıkış */}
      <div style={{padding:"12px",borderTop:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,padding:"4px 4px"}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:currentStaff.color||T.amber,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{currentStaff.initials||(currentStaff.name||"?").slice(0,2).toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:T.textPrimary,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{currentStaff.name}</div>
            <div style={{fontSize:10,color:T.textMuted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{perms.isAdmin?"Yönetici":currentStaff.role||"Çalışan"}</div>
          </div>
        </div>
        <button onClick={async()=>{ if(window.confirm("Çıkış yapmak istediğinize emin misiniz?")){ await supabase.auth.signOut(); window.location.reload(); } }} style={{
          width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          padding:"9px 12px",borderRadius:10,background:T.bgSurface,border:`1px solid ${T.border}`,
          color:T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:600,transition:"all 0.12s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.background=T.redDim;e.currentTarget.style.color=T.redText;e.currentTarget.style.borderColor=T.red+"66";}}
        onMouseLeave={e=>{e.currentTarget.style.background=T.bgSurface;e.currentTarget.style.color=T.textSecondary;e.currentTarget.style.borderColor=T.border;}}>
          <span style={{fontSize:15}}>🚪</span><span>Çıkış Yap</span>
        </button>
      </div>
    </div>

    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
      <div style={{padding:isMobile?"12px 14px":"14px 28px",borderBottom:`1px solid ${T.border}`,background:T.bgCard,display:"flex",alignItems:"center",justifyContent:"space-between",gap:isMobile?8:16}}>
        {isMobile && <button onClick={()=>setDrawerOpen(true)} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:T.textPrimary}}>☰</button>}
        <div style={{fontSize:isMobile?15:18,fontWeight:700,color:T.textPrimary,flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {page === 'dashboard' ? (isMobile?'🏠':'🏠 Ana Sayfa') : page === 'clients' ? (isMobile?'🏢':'🏢 Müşteriler') : page === 'leads' ? (isMobile?'📞':'📞 Soğuk Arama') : page === 'pricing' ? (isMobile?'💰':'💰 Fiyatlar') : page === 'calendar' ? (isMobile?'📅':'📅 İçerik Takvimi') : page === 'ideas' ? (isMobile?'💡':'💡 Fikirler') : page === 'tasks' ? (isMobile?'📋':'📋 Görevler') : page === 'reports' ? (isMobile?'📊':'📊 Raporlar') : page === 'files' ? (isMobile?'📁':'📁 Dosyalar') : page === 'messages' ? (isMobile?'💬':'💬 Mesajlar') : page === 'accounting' ? (isMobile?'🧮':'🧮 Muhasebe') : (isMobile?'👥':'👥 Çalışanlar')}
        </div>
        {!isMobile && <GlobalSearch clients={clients} tasks={tasks} setPage={setPage} />}
        <NotificationBell clients={clients} tasks={tasks} perms={perms} setPage={setPage} currentStaff={currentStaff} />
      </div>
      <div style={{flex:1,overflow:"auto",padding:isMobile?14:28}}>
        {page==="dashboard"&&<DashboardPage clients={clients} staff={staff} tasks={tasks} setPage={setPage} perms={perms} allClients={allClients} allStaff={allStaff} refreshData={refreshData}/>}
        {page==="clients"&&<ClientsPage clients={clients} setClients={setClients} allClients={allClients} perms={perms}/>}
        {page==="leads"&&<LeadsPage refreshData={refreshData}/>}
        {page==="pricing"&&<PricingPage/>}
        {page==="calendar"&&<CalendarPage clients={clients}/>}
        {page==="ideas"&&<IdeasPage/>}
        {page==="tasks"&&<TasksPage tasks={tasks} setTasks={setTasks} clients={clients} staff={staff} refreshData={refreshData} currentStaff={currentStaff} perms={perms}/>}
        {page==="files"&&<DriveFilesPage clients={clients}/>}
        {page==="reports"&&<ReportsPage clients={clients} perms={perms}/>}
        {page==="messages"&&<MessagesPage currentStaff={currentStaff} staff={staff}/>}
        {page==="accounting"&&<AccountingPage clients={clients} staff={staff} perms={perms}/>}
        {page==="staff"&&<StaffPage staff={staff} setStaff={setStaff} allStaff={allStaff} perms={perms}/>}
      </div>
    </div>
  </div>;
}
