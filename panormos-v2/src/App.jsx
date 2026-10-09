import { useState, useRef, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";
import Login from "./Login";
import { T, THEME, toggleTheme } from "./theme";


// ─────────────────────────────────────────────
// SWEETALERT2 UYARI / ONAY PENCERELERİ (tarayıcı alert/confirm yerine)
// ─────────────────────────────────────────────
const SWAL_TEMA = { background: T.bgCard, color: T.textPrimary, confirmButtonColor: T.amber, cancelButtonColor: "#64748B" };
function swalTur(m) {
  const t = String(m || "").toLocaleLowerCase("tr");
  if (/hata|edilemedi|olamadı|oluşturulamadı|yazılamadı|gönderilemedi|taşınamadı|güncellenemedi|silinemedi|kaydedilemedi|kaydedilemed|okunamadı|yüklenemedi|açılamadı|başarısız|bulunamadı|sorun/.test(t)) return "error";
  if (/gerekli|zorunlu|lütfen|girin|seçin/.test(t)) return "warning";
  if (/yüklendi|kaydedildi|eklendi|gönderildi|tamamlandı|başarılı|silindi|güncellendi/.test(t)) return "success";
  return "info";
}
function swalAlert(mesaj) {
  const metin = String(mesaj ?? "");
  if (typeof window === "undefined" || !window.Swal) { window.alert(metin); return Promise.resolve(); }
  const [baslik, ...kalan] = metin.split("\n\n");
  const tur = swalTur(metin);
  return window.Swal.fire({
    ...SWAL_TEMA,
    icon: tur,
    title: kalan.length ? baslik : undefined,
    html: (kalan.length ? kalan.join("\n\n") : baslik).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"),
    confirmButtonText: "Tamam",
  });
}
async function swalConfirm(mesaj) {
  const metin = String(mesaj ?? "");
  if (typeof window === "undefined" || !window.Swal) return window.confirm(metin);
  const r = await window.Swal.fire({
    ...SWAL_TEMA,
    icon: "question",
    html: metin.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>"),
    showCancelButton: true,
    confirmButtonText: "Evet",
    cancelButtonText: "Vazgeç",
    focusCancel: /sil|kaldır/i.test(metin),
    reverseButtons: true,
  });
  return !!r.isConfirmed;
}

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
  const inp = { width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 4px", color: T.textPrimary, fontSize: 12, outline: "none", textAlign: "center", boxSizing: "border-box" };
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
        <thead>
          <tr style={{ background: T.bgSurface }}>
            <th style={{ fontSize: 11, color: T.textSecondary, fontWeight: 600, textAlign: "left", padding: "8px 10px" }}>Platform</th>
            {PUBLISH_CONTENT_TYPES.map(ct => <th key={ct.id} style={{ fontSize: 10, color: T.textSecondary, fontWeight: 600, padding: "8px 4px", minWidth: 56 }}>{ct.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {PUBLISH_PLATFORMS.map((p, i) => {
            const rowTotal = PUBLISH_CONTENT_TYPES.reduce((s, ct) => s + (val[p.id]?.[ct.id] || 0), 0);
            return (
              <tr key={p.id} style={{ borderTop: `1px solid ${T.border}`, background: rowTotal > 0 ? "rgba(242,81,36,0.06)" : "transparent" }}>
                <td style={{ fontSize: 12, color: T.textPrimary, fontWeight: rowTotal > 0 ? 600 : 400, padding: "6px 10px" }}>{p.label}</td>
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
          <div style={{ fontSize: 10, color: T.pinkText, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>📷 Çekim Günleri</div>
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
          const isExtraShoot = dateStr ? (client.extraShoots||[]).some(s=>s.date===dateStr) : false;
          const extraShootTitle = isExtraShoot ? (client.extraShoots||[]).find(s=>s.date===dateStr)?.title : "";
          const isToday = cell.currentMonth && cell.day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          let bg = T.bgCard, borderCol = T.border;
          if (isPublish && isShoot) { bg = "rgba(168,85,247,0.12)"; borderCol = "#A855F7"; }
          else if (isPublish) { bg = "rgba(242,81,36,0.12)"; borderCol = `${T.amber}66`; }
          else if (isShoot) { bg = "rgba(236,72,153,0.12)"; borderCol = "#EC489966"; }
          if (isExtraShoot) { bg = "rgba(168,85,247,0.18)"; borderCol = "#A855F7"; }
          if (dayPublishes.length > 0) { bg = "rgba(16,185,129,0.14)"; borderCol = "#10B98188"; }

          return (
            <div key={i} onClick={()=>{ if(cell.currentMonth) setSelectedDay({day:cell.day, isPublish, isShoot, dayPosts, dayPublishes, dateStr, isExtraShoot, extraShootTitle}); }} style={{
              minHeight: 66, borderRadius: 8, padding: "6px 7px", background: cell.currentMonth ? bg : "transparent",
              border: `1px solid ${isToday ? T.amber : (cell.currentMonth ? borderCol : "transparent")}`, opacity: cell.currentMonth ? 1 : 0.3,
              cursor: cell.currentMonth ? "pointer" : "default",
            }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.amberText : T.textSecondary, marginBottom: 3 }}>{cell.day}</div>
              {isExtraShoot && <div style={{ fontSize: 8, fontWeight: 700, color: T.purpleText, marginBottom: 1 }}>📸 Ek Çekim</div>}
              {isPublish && <div style={{ fontSize: 8, fontWeight: 700, color: T.amberText, marginBottom: 1 }}>📅 Paylaşım</div>}
              {isShoot && <div style={{ fontSize: 8, fontWeight: 700, color: T.pinkText }}>📷 Çekim</div>}
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.greenText, marginBottom: 8 }}>✅ Yapılan Paylaşımlar ({selectedDay.dayPublishes.reduce((s,p)=>s+(p.quantity||1),0)})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedDay.dayPublishes.map((p, pi) => {
                      const ctLabel = {post:"Post",reels:"Reels",carousel:"Kaydırmalı Post",story:"Hikaye",video:"Video"}[p.contentType]||p.contentType;
                      return (
                        <div key={pi} style={{ padding: "8px 12px", background: T.bgInput, borderRadius: 8, fontSize: 12 }}>
                          <div style={{ color: T.textPrimary, fontWeight: 600 }}>{(p.quantity||1)>1?`${p.quantity}× `:""}{platformConfig[p.platform]?.label || p.platform} · {ctLabel}</div>
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.pinkText, marginBottom: 4 }}>📷 Çekim Günü</div>
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
    swalAlert("Dışa aktarılacak veri bulunamadı");
    return;
  }

  let XLSX;
  try {
    XLSX = await loadXLSX();
  } catch (err) {
    swalAlert(err.message);
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
    swalAlert("Yazdırılacak veri bulunamadı");
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
    swalAlert("Yazdırma penceresi açılamadı. Tarayıcının pop-up engelleyicisini kapatın.");
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
  if (!w) { swalAlert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
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
  thisMonthPub.forEach(p => { if (!actual[p.platform]) actual[p.platform] = {}; actual[p.platform][p.contentType] = (actual[p.platform][p.contentType] || 0) + (p.quantity||1); });
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
      <div class="card"><div class="lbl">Bu Ay Paylaşım</div><div class="val">${thisMonthPub.reduce((s,p)=>s+(p.quantity||1),0)}</div></div>
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
  if (!w) { swalAlert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
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
  pubs.forEach(p => { const q=p.quantity||1; byPlatform[p.platform] = (byPlatform[p.platform] || 0) + q; byType[p.contentType] = (byType[p.contentType] || 0) + q; });

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
      <div class="big">${pubs.reduce((s,p)=>s+(p.quantity||1),0)}</div>
      <div class="biglbl">bu ay yapılan toplam paylaşım</div>
    </div>

    ${quotaTotal > 0 ? `<div class="agree">📋 Anlaşma: Aylık ${quotaTotal} içerik · Bu ay ${pubs.reduce((s,p)=>s+(p.quantity||1),0)} içerik paylaşıldı ${pubs.reduce((s,p)=>s+(p.quantity||1),0) >= quotaTotal ? "✓ Hedef tamamlandı!" : `(${quotaTotal - pubs.reduce((s,p)=>s+(p.quantity||1),0)} kaldı)`}</div>` : ""}

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
  if (!w) { swalAlert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
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
  if (!w) { swalAlert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
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
        swalAlert(successCount + " dosya Google Drive'a yüklendi! (Panormos Medya klasörü)");
        onUploadComplete?.();
        return;
      } catch (err) {
        setUploading(false);
        swalAlert("Google Drive hatası: " + err.message);
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
    swalAlert(files.length + " dosya yüklendi!");
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

const fmtMoney = n => (Number(n) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 }) + " ₺";

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
  return <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:600,padding:"3px 10px",borderRadius:20,background:cfg.bg,color:cfg.color,border:`1px solid ${cfg.color}33`,whiteSpace:"nowrap"}}><span style={{width:5,height:5,borderRadius:"50%",background:cfg.color}}/>{cfg.label}</span>;
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
  return <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{background:hov&&hover?T.bgCardHover:T.bgCard,border:`1px solid ${hov&&hover?T.borderLight:T.border}`,borderRadius:14,boxShadow:T.shadow,transition:"all 0.15s ease",cursor:onClick?"pointer":"default",...style}}>{children}</div>;
}

function StatCard({label,value,color,sub}) {
  return <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",boxShadow:T.shadow}}>
    <div style={{fontSize:10.5,color:T.textMuted,marginBottom:8,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase"}}>{label}</div>
    <div style={{fontSize:23,fontWeight:700,color:color||T.textPrimary,letterSpacing:"-0.02em",lineHeight:1.15}}>{value}</div>
    {sub&&<div style={{fontSize:11.5,color:T.textMuted,marginTop:6}}>{sub}</div>}
  </div>;
}

function Btn({children,onClick,variant="ghost",style={},disabled=false,title}) {
  const [hov,setHov]=useState(false);
  const styles={
    primary:{background:T.amber,color:T.white,border:"1px solid transparent",boxShadow:"0 1px 2px rgba(0,0,0,0.3), 0 6px 16px -8px rgba(242,81,36,0.7)"},
    ghost:{background:hov?T.bgSurface:"transparent",color:hov?T.textPrimary:T.textSecondary,border:`1px solid ${hov?T.borderLight:T.border}`},
  };
  return <button onClick={onClick} disabled={disabled} title={title} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{fontSize:12.5,fontWeight:600,padding:"7px 14px",borderRadius:9,cursor:disabled?"default":"pointer",opacity:disabled?0.55:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all 0.12s ease",...styles[variant],...style}}>{children}</button>;
}

function Modal({title,onClose,children,width=500}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,backdropFilter:"blur(6px)"}} onMouseDown={e=>{ if(e.target===e.currentTarget) e.currentTarget.dataset.closing="1"; else delete e.currentTarget.dataset.closing; }} onClick={e=>{ if(e.target===e.currentTarget && e.currentTarget.dataset.closing==="1") onClose(); delete e.currentTarget.dataset.closing; }}>
    <div className="pm-modal" style={{background:T.bgCard,border:`1px solid ${T.borderLight}`,borderRadius:18,padding:24,width:"90%",maxWidth:width,maxHeight:"85vh",overflowY:"auto",boxShadow:"0 24px 70px -12px rgba(0,0,0,0.75)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontSize:16,fontWeight:700,color:T.textPrimary,letterSpacing:"-0.01em"}}>{title}</div>
        <button onClick={onClose} aria-label="Kapat" className="pm-icon-btn" style={{background:"transparent",border:"none",color:T.textMuted,fontSize:15,cursor:"pointer",lineHeight:1,width:30,height:30,borderRadius:8,flexShrink:0}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}

function FormField({label,children}) {
  return <div style={{marginBottom:14}}>
    <label style={{fontSize:11,color:T.textSecondary,display:"block",marginBottom:6,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase"}}>{label}</label>
    {children}
  </div>;
}

function Input({value,onChange,placeholder,type="text"}) {
  return <input value={value} onChange={onChange} placeholder={placeholder} type={type} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 12px",fontSize:13.5,color:T.textPrimary,outline:"none",boxSizing:"border-box"}} />;
}

function Textarea({value,onChange,placeholder,minHeight=80}) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 12px",fontSize:13.5,color:T.textPrimary,outline:"none",boxSizing:"border-box",minHeight,fontFamily:"inherit",resize:"vertical"}} />;
}

function Select({value,onChange,children}) {
  return <select value={value} onChange={onChange} style={{width:"100%",background:T.bgInput,border:`1px solid ${T.border}`,borderRadius:9,padding:"10px 12px",fontSize:13.5,color:T.textPrimary,outline:"none"}}>{children}</select>;
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
function ClientsPage({clients,setClients,allClients,perms,currentStaff}) {
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
      swalAlert("Lütfen silme sebebi ve bitiş tarihini seçin");
      return;
    }
    if (!await swalConfirm("Bu müşteri silinecek (ayrılan müşteriler listesine taşınır).\n\nOnaylıyor musunuz?")) return;

    const { error } = await supabase.from('clients').update({
      deleted_at: new Date().toISOString(),
      delete_reason: deleteModal.reason,
      deletion_date: deleteModal.date,
    }).eq('id', clientId);

    if (error) {
      swalAlert("HATA: Müşteri silinemedi!\n\n" + error.message + "\n\nSupabase'de gerekli sütunlar eksik olabilir. SQL kodunu çalıştırdığınızdan emin olun.");
      return;
    }

    setClients(clients.filter(c => c.id !== clientId));
    setDeleteModal(null);
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:perms.companyFinance?"repeat(4,1fr)":"repeat(2,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Aktif Müşteri" value={filteredClients.length} sub={`Toplam: ${clients.length}`} />
      {perms.companyFinance && <StatCard label="Toplam Ciro" value={fmtMoney(totalRevenue)} color={T.indigoText} sub="Tüm zamanlar" />}
      {perms.companyFinance && <StatCard label="Tahsilat Bekleyen" value={fmtMoney(pendingRevenue)} color={T.amberText} sub={`${overdueCount} gecikmiş`} />}
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
      <Btn variant="primary" onClick={()=>{setModal("addClient");setForm({name:"",category:"",phone:"",address:"",city:"",district:"",taxNumber:"",taxOffice:"",monthlyFee:"",workType:"monthly",publishDays:[],shootDays:[],publishTimes:[],platforms:[]});}} style={{flex:1}}>+ Yeni müşteri ekle</Btn>
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
            {(()=>{const sp=setupProgress(client);return sp.done<sp.total?<div title="Meta / Instagram kurulumu eksik" style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6,background:T.amberDim,color:T.amberText,whiteSpace:"nowrap"}}>🛠️ Kurulum {sp.done}/{sp.total}</div>:null;})()}
            <div style={{display:"flex",gap:5}}>{client.platforms.map(p=><PlatformTag key={p} id={p}/>)}</div>
            {perms.finance && <div style={{textAlign:"right",minWidth:90}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{fmtMoney(client.monthlyFee)}</div>
              <div style={{fontSize:11,color:T.textMuted}}>aylık</div>
            </div>}
            <span style={{fontSize:13,color:T.textMuted,transition:"transform 0.2s",transform:isOpen?"rotate(90deg)":"rotate(0deg)"}}>›</span>
          </div>
          {isOpen&&<ClientDetail currentStaff={currentStaff} client={client} currentTab={currentTab} setTab={t=>setTab(prev=>({...prev,[client.id]:t}))} clients={clients} setClients={setClients} setModal={setModal} setForm={setForm} setMessagingClient={setMessagingClient} onDelete={()=>setDeleteModal({clientId:client.id,reason:"",date:""})} perms={perms} />}
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
      <FormField label="📧 E-posta"><Input placeholder="ornek@firma.com" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
      <FormField label="💼 Çalışma Tipi"><div style={{display:"flex",gap:8}}>{[{v:"monthly",l:"Aylık Paket"},{v:"piece",l:"Parça Başı"},{v:"both",l:"İkisi"}].map(o=>(<button key={o.v} type="button" onClick={()=>setForm(f=>({...f,workType:o.v}))} style={{flex:1,padding:"9px",borderRadius:8,border:`1px solid ${(form.workType||"monthly")===o.v?T.indigo:T.border}`,background:(form.workType||"monthly")===o.v?T.indigoDim:T.bgInput,color:(form.workType||"monthly")===o.v?T.indigoText:T.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>{o.l}</button>))}</div></FormField>
      {perms.finance && <FormField label={(form.workType||"monthly")==="piece" ? "Anlaşılan Toplam Ücret (₺)" : "Aylık ücret (₺)"}><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>}
      {(form.workType==="piece"||form.workType==="both") && <FormField label="🧩 Parça Başı İşler (isteğe bağlı — sonra detaydan da eklenebilir)"><PieceJobsFormEditor jobs={form.pieceJobsNew||[]} onChange={list=>setForm(f=>({...f,pieceJobsNew:list}))} showAmount={perms.finance} /></FormField>}
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
          phone: form.phone||"", email: form.email||"", address: form.address||"", city: form.city||"", district: form.district||"",
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"", social_media: form.socialMedia||"",
          description: form.description||"", monthly_post_quota: parseInt(form.monthlyPostQuota)||0, quota_detail: form.quotaDetail||{},
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays, publish_times: publishTimes,
          work_type: form.workType||"monthly", contract_start: "Temmuz 2026", contract_end: form.contractEnd||null,
        }).select().single();
        if(data){
          // Aylık ücret ve sosyal medya şifresi müşteri kaydında değil, korumalı tablolarda durur
          const gizli = await saveClientPrivate(data.id, { monthlyFee: parseInt(form.monthlyFee)||0, socialPassword: form.socialPassword||"", yeni: true });
          if(gizli) swalAlert("Müşteri eklendi ancak ücret / şifre bilgisi kaydedilemedi: "+gizli);
          data.monthly_fee = parseInt(form.monthlyFee)||0; data.social_password = form.socialPassword||"";
        }
        if(error){ swalAlert("HATA: Müşteri eklenemedi!\n\n"+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırıp yeni sütunları eklediğinizden emin olun."); return; }
        if(data){
          // Formda eklenen parça başı işleri kaydet
          let savedJobs = [];
          if((form.pieceJobsNew||[]).length>0){
            const rows = form.pieceJobsNew.map(j=>({ client_id:data.id, title:j.title, quantity:j.quantity, amount:j.amount, due_date:j.dueDate||null, status:j.status||"pending", month_ref: j.dueDate?String(j.dueDate).slice(0,7):(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;})() }));
            const { data:jobData } = await supabase.from('piece_jobs').insert(rows).select();
            savedJobs = (jobData||[]).map(j=>({id:j.id,title:j.title,quantity:j.quantity,amount:Number(j.amount||0),dueDate:j.due_date,status:j.status,monthRef:j.month_ref}));
          }
          setClients(prev=>[...prev,{id:data.id,name:data.name,category:data.category,initials:data.initials,accentColor:data.accent_color,phone:data.phone,email:data.email||"",address:data.address,city:data.city,district:data.district,taxNumber:data.tax_number,taxOffice:data.tax_office,socialMedia:data.social_media||"",socialPassword:data.social_password||"",description:data.description||"",monthlyPostQuota:data.monthly_post_quota||0,quotaDetail:data.quota_detail||{},platforms:data.platforms||[],publishDays:data.publish_days||[],shootDays:data.shoot_days||[],publishTimes:data.publish_times||[],monthlyFee:data.monthly_fee,workType:data.work_type||"monthly",pieceJobs:savedJobs,contractStart:data.contract_start,posts:[],publishesList:[],invoices:[],media:[],socialAccounts:[],calEvents:[],setupChecklist:{}}]);
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
      <FormField label="📧 E-posta"><Input placeholder="ornek@firma.com" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
      <FormField label="💼 Çalışma Tipi"><div style={{display:"flex",gap:8}}>{[{v:"monthly",l:"Aylık Paket"},{v:"piece",l:"Parça Başı"},{v:"both",l:"İkisi"}].map(o=>(<button key={o.v} type="button" onClick={()=>setForm(f=>({...f,workType:o.v}))} style={{flex:1,padding:"9px",borderRadius:8,border:`1px solid ${(form.workType||"monthly")===o.v?T.indigo:T.border}`,background:(form.workType||"monthly")===o.v?T.indigoDim:T.bgInput,color:(form.workType||"monthly")===o.v?T.indigoText:T.textSecondary,fontSize:12,fontWeight:600,cursor:"pointer"}}>{o.l}</button>))}</div></FormField>
      {perms.finance && <FormField label={(form.workType||"monthly")==="piece" ? "Anlaşılan Toplam Ücret (₺)" : "Aylık ücret (₺)"}><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>}
      {(form.workType==="piece"||form.workType==="both") && <FormField label="🧩 Parça Başı İşler (isteğe bağlı — sonra detaydan da eklenebilir)"><PieceJobsFormEditor jobs={form.pieceJobsNew||[]} onChange={list=>setForm(f=>({...f,pieceJobsNew:list}))} showAmount={perms.finance} /></FormField>}
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
          phone: form.phone||"", email: form.email||"", address: form.address||"", city: form.city||"", district: form.district||"",
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"", social_media: form.socialMedia||"",
          description: form.description||"", monthly_post_quota: parseInt(form.monthlyPostQuota)||0, quota_detail: form.quotaDetail||{},
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays, publish_times: publishTimes,
          work_type: form.workType||"monthly", contract_end: form.contractEnd||null,
        }).eq('id', form.id);
        if(error){ swalAlert("HATA: Müşteri güncellenemedi!\n\n"+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırıp yeni sütunları eklediğinizden emin olun."); return; }
        {
          // Ücreti yalnızca finans yetkisi olan değiştirir; şifre korumalı tabloya yazılır
          const gizli = await saveClientPrivate(form.id, { monthlyFee: perms.finance ? (parseInt(form.monthlyFee)||0) : undefined, socialPassword: form.socialPassword||"" });
          if(gizli){ swalAlert("Müşteri güncellendi ancak ücret / şifre bilgisi kaydedilemedi: "+gizli); }
        }
        // Formda eklenen yeni parça başı işleri kaydet (varsa)
        let addedJobs = [];
        if((form.pieceJobsNew||[]).length>0){
          const rows = form.pieceJobsNew.map(j=>({ client_id:form.id, title:j.title, quantity:j.quantity, amount:j.amount, due_date:j.dueDate||null, status:j.status||"pending", month_ref: j.dueDate?String(j.dueDate).slice(0,7):(()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;})() }));
          const { data:jobData } = await supabase.from('piece_jobs').insert(rows).select();
          addedJobs = (jobData||[]).map(j=>({id:j.id,title:j.title,quantity:j.quantity,amount:Number(j.amount||0),dueDate:j.due_date,status:j.status,monthRef:j.month_ref}));
        }
        setClients(clients.map(c=>c.id===form.id?{...c,name:form.name,category:form.category||"",initials,phone:form.phone||"",email:form.email||"",address:form.address||"",city:form.city||"",district:form.district||"",taxNumber:form.taxNumber||"",taxOffice:form.taxOffice||"",socialMedia:form.socialMedia||"",socialPassword:form.socialPassword||"",description:form.description||"",monthlyPostQuota:parseInt(form.monthlyPostQuota)||0,quotaDetail:form.quotaDetail||{},platforms:form.platforms||[],publishDays,shootDays,publishTimes,monthlyFee:parseInt(form.monthlyFee)||0,workType:form.workType||"monthly",contractEnd:form.contractEnd||null,pieceJobs:[...addedJobs,...(c.pieceJobs||[])]}:c));
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

function ClientDetail({client,currentTab,setTab,clients,setClients,setModal,setForm,setMessagingClient,onDelete,perms,currentStaff}) {
  const [uploadPanel, setUploadPanel] = useState(false);
  const [mailModal, setMailModal] = useState(false);
  
  // Faturalar sekmesi sadece finansal yetkisi olana görünür
  const baseTabs=[{id:"overview",lbl:"Özet"},{id:"posts",lbl:"Paylaşımlar"},{id:"calendar",lbl:"Takvim"},{id:"media",lbl:"Medya"},{id:"setup",lbl:"Kurulum"},{id:"ai",lbl:"✨ Asistan"}];
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
        {perms.accounting && <Btn onClick={()=>openClientStatement(client)} style={{fontSize:11,padding:"5px 10px",background:T.greenDim,color:T.greenText}}>📑 Hesap Raporu</Btn>}
        <Btn onClick={()=>setMessagingClient(client)} style={{fontSize:11,padding:"5px 10px"}}>💬 Mesaj</Btn>
        <Btn onClick={()=>setMailModal(true)} style={{fontSize:11,padding:"5px 10px",background:T.indigoDim,color:T.indigoText}}>📧 E-posta</Btn>
        {perms.manageClients && <Btn onClick={()=>{setModal("editClient");setForm({id:client.id,name:client.name,category:client.category,phone:client.phone,email:client.email||"",address:client.address,city:client.city,district:client.district,taxNumber:client.taxNumber,taxOffice:client.taxOffice,socialMedia:client.socialMedia||"",socialPassword:client.socialPassword||"",description:client.description||"",monthlyPostQuota:client.monthlyPostQuota||"",quotaDetail:client.quotaDetail||{},contractEnd:client.contractEnd||"",workType:client.workType||"monthly",monthlyFee:client.monthlyFee,publishDays:client.publishDays||[],shootDays:client.shootDays||[],publishTimes:client.publishTimes||[],platforms:client.platforms||[]});}} style={{fontSize:11,padding:"5px 10px"}}>✏️ Düzenle</Btn>}
        {perms.manageClients && <Btn onClick={onDelete} style={{fontSize:11,padding:"5px 10px",background:T.redDim,color:T.redText}}>🗑 Sil</Btn>}
      </div>
    </div>
    <div style={{padding:20}}>
      {safeTab==="overview"&&<ClientOverview client={client} perms={perms}/>}
      {safeTab==="posts"&&<ClientPosts client={client} setClients={setClients}/>}
      {safeTab==="calendar"&&<ClientCalendar client={client}/>}
      {safeTab==="media"&&<ClientMedia client={client}/>}
      {safeTab==="setup"&&<ClientSetup client={client} setClients={setClients}/>}
      {safeTab==="ai"&&<ClientAI client={client}/>}
      {safeTab==="invoices"&&perms.finance&&<ClientInvoices client={client}/>}
    </div>
    
    {mailModal && <ClientMailModal client={client} currentStaff={currentStaff} onClose={()=>setMailModal(false)} />}
    {uploadPanel && <FileUploadPanel clientId={client.id} onClose={()=>setUploadPanel(false)} onUploadComplete={()=>{setUploadPanel(false);window.location.reload();}} />}
  </div>;
}

// Formda parça başı iş ekleme (DB'ye yazmaz, listeyi parent'a döner)
const PIECE_CATEGORIES = ["Tasarım", "Menü Çekimi", "Video Çekimi", "Drone Çekimi", "Kurumsal Kimlik", "Video Kurgu"];
function PieceJobsFormEditor({ jobs, onChange, showAmount }) {
  const [draft, setDraft] = useState({ title: "", quantity: 1, amount: "", dueDate: "" });
  const add = () => {
    if (!draft.title) { swalAlert("İş adı seçin veya yazın"); return; }
    onChange([...jobs, { ...draft, quantity: parseInt(draft.quantity) || 1, amount: parseFloat(draft.amount) || 0, status: "pending" }]);
    setDraft({ title: "", quantity: 1, amount: "", dueDate: "" });
  };
  const remove = (i) => onChange(jobs.filter((_, idx) => idx !== i));

  return (
    <div style={{ background: T.bgInput, borderRadius: 10, padding: 12 }}>
      {/* Eklenen işler */}
      {jobs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {jobs.map((j, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: T.bgCard, borderRadius: 8, borderLeft: `3px solid ${T.amber}` }}>
              <span style={{ flex: 1, fontSize: 13, color: T.textPrimary }}>{j.quantity > 1 ? `${j.quantity}× ` : ""}{j.title}{showAmount && j.amount > 0 ? ` · ${fmtMoney(j.amount)}` : ""}{j.dueDate ? ` · 📅 ${new Date(j.dueDate).toLocaleDateString("tr-TR")}` : ""}</span>
              <button type="button" onClick={() => remove(i)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {/* Kategori butonları */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {PIECE_CATEGORIES.map(cat => (
          <button key={cat} type="button" onClick={() => setDraft(d => ({ ...d, title: cat }))} style={{ padding: "6px 12px", borderRadius: 100, border: `1px solid ${draft.title === cat ? T.indigo : T.border}`, background: draft.title === cat ? T.indigoDim : T.bgCard, color: draft.title === cat ? T.indigoText : T.textSecondary, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{cat}</button>
        ))}
      </div>
      {/* Giriş alanları */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="İş adı" value={draft.title} onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} style={{ flex: 2, minWidth: 120, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.textPrimary, fontSize: 12, outline: "none" }} />
        <input type="number" placeholder="Adet" value={draft.quantity} onChange={e => setDraft(d => ({ ...d, quantity: e.target.value }))} style={{ width: 60, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.textPrimary, fontSize: 12, outline: "none" }} />
        {showAmount && <input type="number" placeholder="₺" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} style={{ width: 80, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.textPrimary, fontSize: 12, outline: "none" }} />}
        <input type="date" value={draft.dueDate} onChange={e => setDraft(d => ({ ...d, dueDate: e.target.value }))} style={{ width: 130, background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", color: T.textPrimary, fontSize: 12, outline: "none" }} />
        <button type="button" onClick={add} style={{ background: T.indigo, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Ekle</button>
      </div>
    </div>
  );
}

function PieceJobsSection({ client, perms }) {
  const [jobs, setJobs] = useState(client.pieceJobs || []);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  const curMonthRef = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();

  const reload = async () => {
    const { data } = await supabase.from('piece_jobs').select('*').eq('client_id', client.id).order('due_date', { ascending: false });
    setJobs((data || []).map(j => ({ id: j.id, title: j.title, quantity: j.quantity, amount: Number(j.amount || 0), dueDate: j.due_date, status: j.status || "pending", monthRef: j.month_ref })));
  };

  const save = async () => {
    if (!form.title) { swalAlert("İş adı gerekli"); return; }
    setSaving(true);
    const monthRef = form.dueDate ? String(form.dueDate).slice(0, 7) : curMonthRef;
    const payload = { client_id: client.id, title: form.title, quantity: parseInt(form.quantity) || 1, amount: parseFloat(form.amount) || 0, due_date: form.dueDate || null, status: form.status || "pending", month_ref: monthRef };
    let error;
    if (form.id) { ({ error } = await supabase.from('piece_jobs').update(payload).eq('id', form.id)); }
    else { ({ error } = await supabase.from('piece_jobs').insert(payload)); }
    setSaving(false);
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nPARCA-BASI-SQL kodunu çalıştırın."); return; }
    setModal(false); setForm({}); reload();
  };
  const del = async (id) => { if (!await swalConfirm("Bu iş silinsin mi?")) return; await supabase.from('piece_jobs').delete().eq('id', id); reload(); };
  const toggle = async (job) => { const ns = job.status === "done" ? "pending" : "done"; await supabase.from('piece_jobs').update({ status: ns }).eq('id', job.id); reload(); };

  const totalAmount = jobs.reduce((s, j) => s + j.amount, 0);
  const doneAmount = jobs.filter(j => j.status === "done").reduce((s, j) => s + j.amount, 0);
  const pendingCount = jobs.filter(j => j.status === "pending").length;

  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase" }}>🧩 Parça Başı İşler</div>
        <Btn variant="primary" onClick={() => { setForm({ status: "pending", quantity: 1, dueDate: "" }); setModal(true); }} style={{ fontSize: 11, padding: "5px 12px" }}>+ İş Ekle</Btn>
      </div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: "20px 0", fontSize: 13 }}>Henüz parça başı iş yok. "İş Ekle" ile ekleyin (örn: 2 Video, 3 Tasarım).</div>
      ) : (
        <>
          {perms.finance && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: T.bgInput, color: T.textSecondary, fontWeight: 600 }}>Toplam: {fmtMoney(totalAmount)}</span>
              <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: T.greenDim, color: T.greenText, fontWeight: 600 }}>✓ Tamamlanan: {fmtMoney(doneAmount)}</span>
              {pendingCount > 0 && <span style={{ fontSize: 12, padding: "5px 12px", borderRadius: 8, background: T.amberDim, color: T.amberText, fontWeight: 600 }}>⏳ {pendingCount} bekleyen iş</span>}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {jobs.map(j => {
              const done = j.status === "done";
              return (
                <div key={j.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: T.bgInput, borderRadius: 10, borderLeft: `3px solid ${done ? T.green : T.amber}` }}>
                  <button onClick={() => toggle(j)} title={done ? "Bekliyor yap" : "Tamamlandı yap"} style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `2px solid ${done ? T.green : T.borderLight}`, background: done ? T.green : "transparent", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>{done ? "✓" : ""}</button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{j.quantity > 1 ? `${j.quantity}× ` : ""}{j.title}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{j.dueDate ? `📅 ${new Date(j.dueDate).toLocaleDateString("tr-TR")}` : "Tarihsiz"}{perms.finance && j.amount > 0 ? ` · 💰 ${fmtMoney(j.amount)}` : ""}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: done ? T.greenDim : T.amberDim, color: done ? T.greenText : T.amberText }}>{done ? "Bitti" : "Bekliyor"}</span>
                  <button onClick={() => { setForm({ id: j.id, title: j.title, quantity: j.quantity, amount: j.amount, dueDate: j.dueDate || "", status: j.status }); setModal(true); }} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 13 }}>✏️</button>
                  <button onClick={() => del(j.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal && (
        <Modal title={form.id ? "Parça Başı İş Düzenle" : "Yeni Parça Başı İş"} onClose={() => setModal(false)} width={480}>
          <FormField label="Hazır Kategoriler (tıkla seç)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {["Tasarım", "Menü Çekimi", "Video Çekimi", "Drone Çekimi", "Kurumsal Kimlik", "Video Kurgu"].map(cat => (
                <button key={cat} type="button" onClick={() => setForm(f => ({ ...f, title: cat }))} style={{ padding: "7px 14px", borderRadius: 100, border: `1px solid ${form.title === cat ? T.indigo : T.border}`, background: form.title === cat ? T.indigoDim : T.bgInput, color: form.title === cat ? T.indigoText : T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{cat}</button>
              ))}
            </div>
          </FormField>
          <FormField label="İş Adı"><Input placeholder="Örn: Tanıtım Videosu, Logo Tasarımı" value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: perms.finance ? "1fr 1fr" : "1fr", gap: 12 }}>
            <FormField label="Adet"><Input type="number" placeholder="1" value={form.quantity ?? ""} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></FormField>
            {perms.finance && <FormField label="Tutar (₺)"><Input type="number" placeholder="0" value={form.amount ?? ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></FormField>}
          </div>
          <FormField label="📅 Teslim Tarihi (isteğe bağlı)"><Input type="date" value={form.dueDate || ""} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></FormField>
          <FormField label="Durum">
            <div style={{ display: "flex", gap: 8 }}>
              {[{ v: "pending", l: "⏳ Bekliyor" }, { v: "done", l: "✓ Tamamlandı" }].map(o => (
                <button key={o.v} type="button" onClick={() => setForm(f => ({ ...f, status: o.v }))} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${(form.status || "pending") === o.v ? T.indigo : T.border}`, background: (form.status || "pending") === o.v ? T.indigoDim : T.bgInput, color: (form.status || "pending") === o.v ? T.indigoText : T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.l}</button>
              ))}
            </div>
          </FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Kaydediliyor..." : "Kaydet"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MÜŞTERİ KURULUM KONTROL LİSTESİ (Meta / Instagram)
// ─────────────────────────────────────────────
const SETUP_CHECKLIST_ITEMS = [
  { id: "fb_page", label: "Facebook işletme sayfası açıldı", tip: "Kişisel profil değil, işletme SAYFASI. Konum etiketi buradan doğar." },
  { id: "fb_address", label: "Sayfaya açık adres girildi", tip: "Sayfa → Hakkında → İletişim ve temel bilgiler → Adres. İl, ilçe ve sokak eksiksiz." },
  { id: "fb_physical", label: "\"Fiziksel adresi var\" ayarı açıldı", tip: "Adresin altındaki 'Bu sayfanın fiziksel bir adresi var' / 'Müşteriler ziyaret edebilir' kutusu işaretli olmalı. Bu kapalıysa konum OLUŞMAZ." },
  { id: "fb_details", label: "Kategori, telefon ve çalışma saatleri girildi", tip: "Kategori doğru seçilmeli (Restoran, Kafe, Kuaför vb.)." },
  { id: "ig_business", label: "Instagram hesabı İşletme hesabına çevrildi", tip: "Ayarlar → Hesap türü → İşletme hesabına geç." },
  { id: "ig_link", label: "Instagram, Facebook sayfasına bağlandı", tip: "Instagram → Ayarlar → Hesap Merkezi → Facebook sayfasını bağla." },
  { id: "ig_profile", label: "Instagram profili tamamlandı (bio, adres, telefon, buton)", tip: "Profili düzenle → İletişim seçenekleri → Adres." },
  { id: "bm_portfolio", label: "Sayfa Panormos Business Portföyüne eklendi", tip: "Meta Business Suite → Ayarlar → Sayfalar → Ekle. Böylece tek yerden yönetilir." },
  { id: "ig_location", label: "Konum Instagram'da arandığında çıkıyor ✅", tip: "Hikaye → Konum etiketi → işletme adını ara. Ayarlar doğruysa 1-3 gün içinde görünür." },
  { id: "google", label: "Google İşletme Profili açıldı (isteğe bağlı)", tip: "Haritalarda çıkması için. Meta ile ilgisi yok ama müşteri için değerli." },
];
const SETUP_REQUIRED_IDS = SETUP_CHECKLIST_ITEMS.filter(i => i.id !== "google").map(i => i.id);
function setupProgress(client) {
  const cl = client.setupChecklist || {};
  const done = SETUP_REQUIRED_IDS.filter(id => cl[id]?.done).length;
  return { done, total: SETUP_REQUIRED_IDS.length, pct: Math.round(done / SETUP_REQUIRED_IDS.length * 100) };
}

function ClientSetup({ client, setClients }) {
  const [saving, setSaving] = useState(null);
  const checklist = client.setupChecklist || {};
  const prog = setupProgress(client);

  const toggle = async (id) => {
    const cur = checklist[id]?.done;
    const next = { ...checklist, [id]: cur ? { done: false } : { done: true, at: new Date().toISOString() } };
    setSaving(id);
    const { error } = await supabase.from('clients').update({ setup_checklist: next }).eq('id', client.id);
    setSaving(null);
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nKURULUM-SQL kodunu (setup_checklist sütunu) çalıştırdığınızdan emin olun."); return; }
    setClients(prev => prev.map(c => c.id === client.id ? { ...c, setupChecklist: next } : c));
  };

  const allDone = prog.done === prog.total;
  return (
    <div>
      <div style={{ background: allDone ? T.greenDim : T.bgCard, border: `1px solid ${allDone ? T.green + "66" : T.border}`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{allDone ? "✅ Kurulum tamamlandı" : "🛠️ Meta / Instagram Kurulumu"}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: allDone ? T.greenText : T.amberText }}>{prog.done} / {prog.total} · %{prog.pct}</div>
        </div>
        <div style={{ height: 8, background: T.bgSurface, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${prog.pct}%`, background: allDone ? T.green : T.amber, borderRadius: 4, transition: "width .4s" }} />
        </div>
        {!allDone && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 8 }}>Konum etiketinin Instagram hikayesinde çıkması için 1–3 ve 5–6. maddeler şart. Sırayla ilerleyin.</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SETUP_CHECKLIST_ITEMS.map((item, idx) => {
          const st = checklist[item.id] || {};
          const done = !!st.done;
          const busy = saving === item.id;
          return (
            <div key={item.id} onClick={() => !busy && toggle(item.id)} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 14px", background: done ? "rgba(16,185,129,0.08)" : T.bgCard, border: `1px solid ${done ? T.green + "55" : T.border}`, borderRadius: 10, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
              <div style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: `2px solid ${done ? T.green : T.borderLight}`, background: done ? T.green : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, marginTop: 1 }}>{done ? "✓" : idx + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, textDecoration: done ? "line-through" : "none", opacity: done ? 0.75 : 1 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, lineHeight: 1.5 }}>{item.tip}</div>
                {done && st.at && <div style={{ fontSize: 10, color: T.greenText, marginTop: 4 }}>✓ {new Date(st.at).toLocaleDateString("tr-TR")}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CLAUDE ASİSTAN (Netlify Function üzerinden)
// ─────────────────────────────────────────────
// Sunucu işlevlerine oturum anahtarıyla istek atar (işlevler girişsiz çağrıyı reddeder)
async function panelFetch(path, opts = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return fetch(path, { ...opts, headers: { ...(opts.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
}

async function askClaude({ prompt, system, messages, maxTokens }) {
  const r = await panelFetch("/.netlify/functions/claude", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, system, messages, maxTokens }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data.text || "";
}
function clientContextText(client) {
  const recent = (client.posts || []).slice(-8).map(p => `- ${p.date || ""} ${p.platform || ""} ${p.type || ""}: ${p.title || ""}`).join("\n");
  return [
    `İşletme adı: ${client.name}`,
    client.category ? `Sektör/Kategori: ${client.category}` : "",
    (client.city || client.district) ? `Konum: ${[client.district, client.city].filter(Boolean).join(" / ")}` : "",
    client.platforms?.length ? `Platformlar: ${client.platforms.map(p => platformConfig[p]?.label || p).join(", ")}` : "",
    client.socialMedia ? `Sosyal medya: ${client.socialMedia}` : "",
    client.description ? `Açıklama/notlar: ${client.description}` : "",
    recent ? `Son paylaşımlar:\n${recent}` : "",
  ].filter(Boolean).join("\n");
}
const AI_QUICK = [
  { id: "caption", lbl: "✍️ Paylaşım metni", prompt: "Bu işletme için Instagram gönderi açıklaması yaz. 3 farklı alternatif ver: biri kısa ve vurucu, biri samimi/hikayeli, biri kampanya odaklı. Her birine uygun 8-10 Türkçe hashtag ekle. Emoji ölçülü olsun." },
  { id: "ideas", lbl: "💡 İçerik fikirleri", prompt: "Bu işletme için önümüzdeki 2 hafta için 10 içerik fikri öner. Her fikir için: format (Reels / tekil görsel / carousel / hikaye), kısa açıklama ve çekim notu. Yerel (Bandırma ve çevresi) müşteriye hitap etsin." },
  { id: "story", lbl: "📱 Hikaye metni", prompt: "Bu işletme için 5 Instagram hikayesi metni yaz (her biri 1-2 cümle, ekrana yazılacak). Etkileşim alacak bir anket veya soru etiketi önerisi de ekle." },
  { id: "review", lbl: "🔍 Hesap önerileri", prompt: "Bu işletmenin son paylaşımlarına ve bilgilerine bakarak sosyal medya stratejisinde görünen 5 iyileştirme önerisi ver. Somut ve uygulanabilir olsun; genel tavsiye verme." },
];
// Görsel/video -> Claude'a gönderilecek küçük JPEG kareler (base64)
function fileToImageBlocks(file, maxSide = 1200) {
  return new Promise((resolve, reject) => {
    const isVideo = file.type.startsWith("video/");
    const url = URL.createObjectURL(file);
    const toBlock = (canvas) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.82).split(",")[1] } });
    const fit = (w, h) => { const r = Math.min(1, maxSide / Math.max(w, h)); return [Math.round(w * r), Math.round(h * r)]; };
    if (!isVideo) {
      const img = new Image();
      img.onload = () => { const [w, h] = fit(img.width, img.height); const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); resolve({ blocks: [toBlock(c)], previews: [c.toDataURL("image/jpeg", 0.6)] }); };
      img.onerror = () => reject(new Error("Görsel okunamadı")); img.src = url; return;
    }
    const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.preload = "auto"; v.src = url;
    v.onerror = () => reject(new Error("Video okunamadı (format desteklenmiyor olabilir)"));
    v.onloadedmetadata = async () => {
      const dur = v.duration || 0, n = 4, blocks = [], previews = [];
      const [w, h] = fit(v.videoWidth, v.videoHeight); const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d");
      const seek = (t) => new Promise(res => { v.onseeked = () => res(); v.currentTime = Math.min(t, Math.max(0, dur - 0.1)); });
      try {
        for (let i = 0; i < n; i++) { await seek(dur * (i + 0.5) / n); ctx.drawImage(v, 0, 0, w, h); blocks.push(toBlock(c)); previews.push(c.toDataURL("image/jpeg", 0.5)); }
        URL.revokeObjectURL(url); resolve({ blocks, previews, isVideo: true, duration: dur });
      } catch (e) { reject(e); }
    };
  });
}

function ClientAI({ client }) {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [attach, setAttach] = useState(null); // {blocks, previews, name, isVideo, duration}
  const [attachBusy, setAttachBusy] = useState(false);
  const fileRef = useRef(null);
  const onPickFile = async (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    if (f.size > 200 * 1024 * 1024) { setErr("Dosya çok büyük (200 MB üstü)"); return; }
    setAttachBusy(true); setErr("");
    try { const r = await fileToImageBlocks(f); setAttach({ ...r, name: f.name }); } catch (ex) { setErr(ex.message); }
    setAttachBusy(false);
  };
  const system = `Sen Panormos Medya adlı sosyal medya ajansının içerik asistanısın. Türkçe yaz. Aşağıdaki işletme için çalışıyorsun; cevaplarını bu işletmeye özel yap, genel geçer tavsiye verme. DÜZ METİN yaz: markdown kullanma (kare işaretli başlık, çift yıldızla kalın, ters tırnak ve --- çizgi YASAK). Bölümleri büyük harfli kısa başlık ve boş satırla ayır; listelerde "1." veya "-" kullan. Gereksiz giriş cümlesi yazma.\n\n${clientContextText(client)}`;

  const send = async (text) => {
    let t = (text || input).trim();
    if (!t && attach) t = attach.isVideo ? "Bu videodan alınan karelere bakarak Instagram Reels açıklaması yaz. 3 alternatif ver, her birine 8-10 Türkçe hashtag ekle." : "Bu görsel için Instagram gönderi açıklaması yaz. 3 alternatif ver, her birine 8-10 Türkçe hashtag ekle.";
    if (!t || busy) return;
    const userMsg = { role: "user", content: t, previews: attach?.previews, attachName: attach?.name, apiContent: attach ? [...attach.blocks, { type: "text", text: (attach.isVideo ? `[Ekte bir videodan alınmış ${attach.blocks.length} kare var, süre ~${Math.round(attach.duration || 0)} sn] ` : "[Ekte bir görsel var] ") + t }] : t };
    const next = [...msgs, userMsg];
    setMsgs(next); setInput(""); setAttach(null); setBusy(true); setErr("");
    try {
      const reply = await askClaude({ system, messages: next.map(m => ({ role: m.role, content: m.apiContent || m.content })), maxTokens: 1800 });
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch (e) { setErr(e.message); setMsgs(msgs); }
    setBusy(false);
  };
  const copy = (t) => { navigator.clipboard?.writeText(t); };

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {AI_QUICK.map(q => <button key={q.id} disabled={busy} onClick={() => send(q.prompt)} style={{ fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8, background: T.indigoDim, color: T.indigoText, border: `1px solid ${T.border}`, cursor: busy ? "wait" : "pointer" }}>{q.lbl}</button>)}
        {msgs.length > 0 && <button onClick={() => { setMsgs([]); setErr(""); }} style={{ fontSize: 12, padding: "7px 12px", borderRadius: 8, background: "none", color: T.textMuted, border: `1px solid ${T.border}`, cursor: "pointer", marginLeft: "auto" }}>🗑 Temizle</button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, maxHeight: 520, overflowY: "auto" }}>
        {msgs.length === 0 && <div style={{ fontSize: 12, color: T.textMuted, padding: 16, textAlign: "center", border: `1px dashed ${T.border}`, borderRadius: 10 }}>Yukarıdan hazır bir istek seç veya aşağıya kendi sorunu yaz. Asistan {client.name} için cevap verir.</div>}
        {msgs.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "stretch", maxWidth: m.role === "user" ? "80%" : "100%", background: m.role === "user" ? T.amberDim : T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", position: "relative" }}>
            {m.previews?.length > 0 && <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>{m.previews.map((src, k) => <img key={k} src={src} alt="" style={{ height: 72, borderRadius: 6, objectFit: "cover" }} />)}</div>}
            <div style={{ fontSize: 13, color: T.textPrimary, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{m.content}</div>
            {m.role === "assistant" && <button onClick={() => copy(m.content)} style={{ marginTop: 8, fontSize: 11, padding: "4px 10px", borderRadius: 6, background: T.bgSurface, color: T.textMuted, border: `1px solid ${T.border}`, cursor: "pointer" }}>📋 Kopyala</button>}
          </div>
        ))}
        {busy && <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 14px" }}>✨ Yazıyor…</div>}
        {err && <div style={{ fontSize: 12, color: T.redText, background: T.redDim, padding: "8px 14px", borderRadius: 8 }}>Hata: {err}</div>}
      </div>
      {(attach || attachBusy) && <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8 }}>
        {attachBusy ? <span style={{ fontSize: 12, color: T.textMuted }}>Dosya hazırlanıyor…</span> : <>
          {attach.previews.map((src, k) => <img key={k} src={src} alt="" style={{ height: 48, borderRadius: 4, objectFit: "cover" }} />)}
          <span style={{ fontSize: 12, color: T.textMuted, flex: 1 }}>{attach.isVideo ? `🎬 ${attach.name} (${attach.blocks.length} kare)` : `🖼️ ${attach.name}`}</span>
          <button onClick={() => setAttach(null)} style={{ fontSize: 12, background: "none", border: "none", color: T.textMuted, cursor: "pointer" }}>✕</button>
        </>}
      </div>}
      <div style={{ display: "flex", gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: "none" }} onChange={onPickFile} />
        <button title="Görsel veya video ekle" disabled={busy || attachBusy} onClick={() => fileRef.current?.click()} style={{ alignSelf: "flex-end", fontSize: 18, width: 42, height: 42, borderRadius: 8, background: T.bgCard, color: T.textMuted, border: `1px solid ${T.border}`, cursor: "pointer" }}>📎</button>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={attach ? "İsteğe bağlı: ne istediğini yaz (boş bırakırsan paylaşım metni yazar)…" : "Örn: Ramazan kampanyası için 3 gönderi metni yaz… (📎 ile görsel/video ekleyebilirsin)"} rows={2} style={{ flex: 1, fontSize: 13, padding: "10px 12px", borderRadius: 8, background: T.bgInput, color: T.textPrimary, border: `1px solid ${T.border}`, resize: "vertical", fontFamily: "inherit" }} />
        <Btn variant="primary" onClick={() => send()} disabled={busy || attachBusy || (!input.trim() && !attach)} style={{ alignSelf: "flex-end" }}>Gönder</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MÜŞTERİYE E-POSTA (info@panormosmedya.com üzerinden, Netlify send-mail)
// ─────────────────────────────────────────────
async function sendMailViaPanel({ to, subject, text, attachment }) {
  const r = await panelFetch("/.netlify/functions/send-mail", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, subject, text, attachment }) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ("HTTP " + r.status));
  return data;
}
function MailModal({ title, to: initialTo = "", subject: initialSubject = "", body: initialBody = "", aiContext = "", clientId = null, leadId = null, onSent, currentStaff, onClose }) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const signature = `\n\nSaygılarımızla,\n${currentStaff?.name || "Panormos Medya"}\nPanormos Medya\ninfo@panormosmedya.com`;

  const writeWithAI = async () => {
    if (!aiPrompt.trim()) { swalAlert("Claude'a ne yazmasını istediğini kısaca söyle (örn: Ağustos raporunu gönderdiğimizi belirten kibar bir mail)."); return; }
    setAiBusy(true);
    try {
      const text = await askClaude({
        system: `Sen Panormos Medya (Bandırma, sosyal medya ajansı) adına e-posta yazan asistansın. Türkçe, kibar, kısa ve net yaz. DÜZ METİN yaz, markdown kullanma. İmza ekleme (panel ekleyecek). Cevabı şu formatta ver:\nKONU: <konu satırı>\n---\n<mail metni>${aiContext ? "\n\n" + aiContext : ""}`,
        prompt: aiPrompt, maxTokens: 800,
      });
      const m = text.match(/KONU:\s*(.+?)\s*\n-{2,}\s*\n([\s\S]+)/i);
      if (m) { setSubject(m[1].trim()); setBody(m[2].trim()); } else { setBody(text.trim()); }
    } catch (e) { swalAlert("Yazılamadı: " + e.message); }
    setAiBusy(false);
  };

  const send = async () => {
    if (!to.trim() || !/\S+@\S+\.\S+/.test(to)) { swalAlert("Geçerli bir alıcı e-postası girin"); return; }
    if (!subject.trim() || !body.trim()) { swalAlert("Konu ve mesaj zorunlu"); return; }
    setBusy(true);
    try {
      let attachment = null;
      if (file) {
        if (file.size > 4 * 1024 * 1024) throw new Error("Ek 4 MB'dan büyük olamaz");
        attachment = { filename: file.name, contentType: file.type || "application/octet-stream", base64: await fileToBase64(file) };
      }
      await sendMailViaPanel({ to: to.trim(), subject: subject.trim(), text: body.trim() + signature, attachment });
      try { await supabase.from('sent_mails').insert({ client_id: clientId, lead_id: leadId, to_email: to.trim(), subject: subject.trim(), body: body.trim(), attachment_name: file?.name || "", sent_by: currentStaff?.name || "" }); } catch (e) {}
      if (onSent) { try { await onSent(to.trim()); } catch (e) {} }
      swalAlert("✅ E-posta gönderildi: " + to.trim());
      onClose();
    } catch (e) { swalAlert("Gönderilemedi: " + e.message); }
    setBusy(false);
  };

  return (
    <Modal title={title || "📧 E-posta"} onClose={onClose} width={640}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12, padding: 10, background: T.indigoDim, borderRadius: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.indigoText, fontWeight: 700, marginBottom: 4 }}>✨ Claude ile yaz</div>
          <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter") writeWithAI(); }} placeholder="Örn: Sosyal medya yönetimi hizmetimizi tanıtan kısa bir ilk temas maili" style={{ width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: T.textPrimary, outline: "none", boxSizing: "border-box" }} />
        </div>
        <Btn variant="primary" onClick={writeWithAI} disabled={aiBusy} style={{ whiteSpace: "nowrap" }}>{aiBusy ? "Yazıyor…" : "Yaz"}</Btn>
      </div>
      <FormField label="Alıcı"><Input type="email" placeholder="ornek@firma.com" value={to} onChange={e => setTo(e.target.value)} /></FormField>
      <FormField label="Konu"><Input value={subject} onChange={e => setSubject(e.target.value)} /></FormField>
      <FormField label="Mesaj"><Textarea minHeight={180} value={body} onChange={e => setBody(e.target.value)} placeholder="Mesajınız… (imza otomatik eklenir)" /></FormField>
      <FormField label="📎 Ek (isteğe bağlı, PDF/görsel, en fazla 4 MB)">
        <input type="file" onChange={e => setFile(e.target.files[0] || null)} style={{ width: "100%", fontSize: 12, color: T.textSecondary, padding: "8px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8 }} />
        {file && <div style={{ fontSize: 11, color: T.greenText, marginTop: 4 }}>✓ {file.name}</div>}
      </FormField>
      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Gönderen: info@panormosmedya.com · İmza: {currentStaff?.name || "Panormos Medya"}</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onClose}>Vazgeç</Btn>
        <Btn variant="primary" onClick={send} disabled={busy}>{busy ? "Gönderiliyor…" : "📧 Gönder"}</Btn>
      </div>
    </Modal>
  );
}
function ClientMailModal({ client, currentStaff, onClose }) {
  return <MailModal
    title={`📧 E-posta — ${client.name}`}
    to={client.email || ""}
    aiContext={`Müşteri: ${client.name}${client.category ? " (" + client.category + ")" : ""}`}
    clientId={client.id}
    currentStaff={currentStaff}
    onClose={onClose}
    onSent={async (to) => { if (to !== (client.email || "")) { await supabase.from('clients').update({ email: to }).eq('id', client.id); } }}
  />;
}
function LeadMailModal({ lead, currentStaff, onClose, onSent }) {
  return <MailModal
    title={`📧 E-posta — ${lead.business_name}`}
    to={lead.email || ""}
    aiContext={`Bu bir potansiyel müşteri (henüz müşterimiz değil, soğuk arama listesinden). İşletme: ${lead.business_name}${lead.city ? " — " + [lead.district, lead.city].filter(Boolean).join(" / ") : ""}. Amaç: hizmetlerimizi tanıtmak ve görüşme/teklif için kapı açmak.`}
    leadId={lead.id}
    currentStaff={currentStaff}
    onClose={onClose}
    onSent={async (to) => { if (to !== (lead.email || "")) { await supabase.from('leads').update({ email: to }).eq('id', lead.id); } if (onSent) await onSent(); }}
  />;
}

// ─────────────────────────────────────────────
// E-POSTA SAYFASI — Gelen (IMAP → received_mails) + Giden (sent_mails)
// ─────────────────────────────────────────────
function MailPage({ clients, currentStaff, onUnreadChange }) {
  const FIXED_FOLDERS = [
    { id: "inbox", label: "📥 Gelen" },
    { id: "important", label: "⭐ Önemli" },
    { id: "efatura", label: "🧾 E-Fatura" },
    { id: "trash", label: "🗑 Çöp" },
  ];
  const [tab, setTab] = useState("inbox"); // klasör id'si veya "sent"
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [leads, setLeads] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(null);
  const [compose, setCompose] = useState(null);
  const [search, setSearch] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: s }, { data: l }, { data: f }] = await Promise.all([
      supabase.from('received_mails').select('id,uid,from_email,from_name,to_email,subject,body_text,has_attachments,attachments,received_at,is_read,client_id,folder').order('received_at', { ascending: false }).limit(300),
      supabase.from('sent_mails').select('*').order('sent_at', { ascending: false }).limit(200),
      supabase.from('leads').select('id,business_name,email'),
      supabase.from('mail_folders').select('*').order('created_at'),
    ]);
    setInbox(r || []); setSent(s || []); setLeads(l || []); setFolders(f || []);
    setLoading(false);
    if (onUnreadChange) onUnreadChange();
  };
  // Sayfa açılınca: önce kayıtlıları göster, sonra sessizce yeni mailleri çek
  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      try {
        setSyncing(true);
        const r = await panelFetch("/.netlify/functions/fetch-mails");
        const d = await r.json().catch(() => ({}));
        if (alive && r.ok && d.ok && d.inserted > 0) await load();
      } catch (e) {}
      if (alive) setSyncing(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { setSelected([]); setBulkMoveOpen(false); }, [tab]);

  const allFolders = [...FIXED_FOLDERS.slice(0, 3), ...folders.map(f => ({ id: "custom:" + f.id, label: "📁 " + f.name, custom: true, raw: f })), FIXED_FOLDERS[3]];
  const folderLabel = (id) => (allFolders.find(f => f.id === id) || FIXED_FOLDERS[0]).label;

  const sync = async () => {
    setSyncing(true);
    try {
      const r = await panelFetch("/.netlify/functions/fetch-mails");
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) throw new Error(d.error || ("HTTP " + r.status));
      await load();
    } catch (e) { swalAlert("Mailler çekilemedi: " + e.message); }
    setSyncing(false);
  };

  const whoIs = (email, clientId, leadId) => {
    const e = (email || "").toLowerCase();
    const c = clientId ? (clients || []).find(x => x.id === clientId) : (clients || []).find(x => (x.email || "").toLowerCase() === e && e);
    if (c) return { label: c.name, kind: "client" };
    const l = leadId ? leads.find(x => x.id === leadId) : leads.find(x => (x.email || "").toLowerCase() === e && e);
    if (l) return { label: l.business_name, kind: "lead", id: l.id };
    return null;
  };

  const fmt = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const same = d.toDateString() === new Date().toDateString();
    return same ? d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" }) + " " + d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  };
  const fmtSize = (b) => b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";

  const openMail = async (m, kind) => {
    let full = m;
    if (kind === "inbox") {
      const { data } = await supabase.from('received_mails').select('body_html').eq('id', m.id).single();
      full = { ...m, body_html: data?.body_html || null };
    }
    setOpen({ ...full, _kind: kind });
    setMoveOpen(false);
    if (kind === "inbox" && !m.is_read) {
      setInbox(list => list.map(x => x.id === m.id ? { ...x, is_read: true } : x));
      try { await supabase.from('received_mails').update({ is_read: true }).eq('id', m.id); } catch (e) {}
      if (onUnreadChange) onUnreadChange();
    }
  };

  const toggleRead = async (m) => {
    const v = !m.is_read;
    setInbox(list => list.map(x => x.id === m.id ? { ...x, is_read: v } : x));
    setOpen(o => o ? { ...o, is_read: v } : o);
    try { await supabase.from('received_mails').update({ is_read: v }).eq('id', m.id); } catch (e) {}
    if (onUnreadChange) onUnreadChange();
  };

  const moveTo = async (m, folder) => {
    setInbox(list => list.map(x => x.id === m.id ? { ...x, folder } : x));
    setOpen(null); setMoveOpen(false);
    const { error } = await supabase.from('received_mails').update({ folder }).eq('id', m.id);
    if (error) { swalAlert("Taşınamadı: " + error.message); load(); }
    if (onUnreadChange) onUnreadChange();
  };

  const deleteForever = async (m) => {
    if (!await swalConfirm("Bu mail panelden kalıcı olarak silinecek (GoDaddy'deki kopyası kalır). Emin misin?")) return;
    try {
      const paths = (m.attachments || []).map(a => a.path).filter(Boolean);
      if (paths.length) await supabase.storage.from('mail-attachments').remove(paths);
    } catch (e) {}
    const { error } = await supabase.from('received_mails').delete().eq('id', m.id);
    if (error) { swalAlert("Silinemedi: " + error.message); return; }
    setInbox(list => list.filter(x => x.id !== m.id));
    setOpen(null);
  };

  const emptyTrash = async () => {
    const items = inbox.filter(m => m.folder === "trash");
    if (!items.length) return;
    if (!await swalConfirm(`Çöpteki ${items.length} mail kalıcı olarak silinecek. Emin misin?`)) return;
    try {
      const paths = items.flatMap(m => (m.attachments || []).map(a => a.path)).filter(Boolean);
      if (paths.length) await supabase.storage.from('mail-attachments').remove(paths);
    } catch (e) {}
    await supabase.from('received_mails').delete().in('id', items.map(m => m.id));
    load();
  };

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const bulkMove = async (folder) => {
    if (!selected.length) return;
    const ids = selected;
    setInbox(list => list.map(x => ids.includes(x.id) ? { ...x, folder } : x));
    setSelected([]); setBulkMoveOpen(false);
    const { error } = await supabase.from('received_mails').update({ folder }).in('id', ids);
    if (error) { swalAlert("Taşınamadı: " + error.message); load(); }
    if (onUnreadChange) onUnreadChange();
  };
  const bulkRead = async (v) => {
    if (!selected.length) return;
    const ids = selected;
    setInbox(list => list.map(x => ids.includes(x.id) ? { ...x, is_read: v } : x));
    setSelected([]);
    await supabase.from('received_mails').update({ is_read: v }).in('id', ids);
    if (onUnreadChange) onUnreadChange();
  };
  const bulkDeleteForever = async () => {
    if (!selected.length) return;
    if (!await swalConfirm(`Seçili ${selected.length} mail kalıcı olarak silinecek. Emin misin?`)) return;
    const items = inbox.filter(m => selected.includes(m.id));
    try {
      const paths = items.flatMap(m => (m.attachments || []).map(a => a.path)).filter(Boolean);
      if (paths.length) await supabase.storage.from('mail-attachments').remove(paths);
    } catch (e) {}
    const { error } = await supabase.from('received_mails').delete().in('id', selected);
    if (error) { swalAlert("Silinemedi: " + error.message); return; }
    setInbox(list => list.filter(x => !selected.includes(x.id)));
    setSelected([]);
  };

  const downloadAttachment = async (a) => {
    try {
      const { data, error } = await supabase.storage.from('mail-attachments').createSignedUrl(a.path, 300, { download: a.name });
      if (error || !data?.signedUrl) throw new Error(error?.message || "Bağlantı oluşturulamadı");
      window.open(data.signedUrl, "_blank");
    } catch (e) { swalAlert("Ek indirilemedi: " + e.message); }
  };

  const addFolder = async () => {
    const name = window.prompt("Yeni klasör adı:");
    if (!name || !name.trim()) return;
    const { error } = await supabase.from('mail_folders').insert({ name: name.trim() });
    if (error) { swalAlert("Klasör eklenemedi: " + error.message); return; }
    load();
  };

  const deleteFolder = async (f) => {
    const count = inbox.filter(m => m.folder === "custom:" + f.id).length;
    if (!await swalConfirm(`"${f.name}" klasörü silinecek${count ? `; içindeki ${count} mail Gelen'e taşınacak` : ""}. Emin misin?`)) return;
    await supabase.from('received_mails').update({ folder: "inbox" }).eq('folder', "custom:" + f.id);
    await supabase.from('mail_folders').delete().eq('id', f.id);
    if (tab === "custom:" + f.id) setTab("inbox");
    load();
  };

  const reply = (m) => {
    const quoted = (m.body_text || "").split("\n").map(l => "> " + l).join("\n");
    const who = whoIs(m.from_email, m.client_id, null);
    setOpen(null);
    setCompose({
      title: `↩️ Yanıtla — ${m.from_name || m.from_email}`,
      to: m.from_email || "",
      subject: /^re:/i.test(m.subject || "") ? m.subject : "Re: " + (m.subject || ""),
      body: `\n\n---\n${m.from_name || m.from_email} yazdı (${fmt(m.received_at)}):\n${quoted}`,
      clientId: who?.kind === "client" ? m.client_id : null,
      leadId: who?.kind === "lead" ? who.id : null,
      aiContext: `Bu mail, gelen şu maile yanıt olarak yazılıyor:\nKONU: ${m.subject || ""}\n${(m.body_text || "").slice(0, 1500)}`,
    });
  };

  const q = search.trim().toLowerCase();
  const matches = (m, fields) => !q || fields.some(v => (v || "").toLowerCase().includes(q));
  const inboxList = inbox.filter(m => (m.folder || "inbox") === tab && matches(m, [m.from_name, m.from_email, m.subject, m.body_text]));
  const sentList = sent.filter(m => matches(m, [m.to_email, m.subject, m.body, m.sent_by]));
  const unread = inbox.filter(m => !m.is_read && m.folder !== "trash").length;
  const countIn = (id) => inbox.filter(m => (m.folder || "inbox") === id).length;
  const unreadIn = (id) => inbox.filter(m => (m.folder || "inbox") === id && !m.is_read).length;

  const Tag = ({ who }) => who ? <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: who.kind === "client" ? T.greenDim : T.amberDim, color: who.kind === "client" ? T.greenText : T.amberText, whiteSpace: "nowrap" }}>{who.kind === "client" ? "🏢 " : "📞 "}{who.label}</span> : null;

  const tabBtn = (id, label, extra) => {
    const active = tab === id;
    return <button key={id} onClick={() => setTab(id)} style={{ fontSize: 12, fontWeight: active ? 600 : 400, padding: "6px 12px", borderRadius: 8, background: active ? T.amber : T.bgInput, color: active ? T.white : T.textSecondary, border: `1px solid ${active ? T.amber : T.border}`, cursor: "pointer", display: "flex", gap: 6, alignItems: "center" }}>{label}{extra}</button>;
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Okunmamış" value={unread} color={unread ? T.amberText : T.textPrimary} sub="Çöp hariç" />
        <StatCard label="E-Fatura" value={countIn("efatura")} color={T.indigoText} sub="Otomatik ayrılan" />
        <StatCard label="Giden" value={sent.length} color={T.greenText} sub="Panelden gönderilen" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant="primary" onClick={() => setCompose({ title: "📧 Yeni E-posta" })}>+ Yeni E-posta</Btn>
        <Btn onClick={sync} disabled={syncing} style={{ background: T.indigoDim, color: T.indigoText }}>{syncing ? "Çekiliyor…" : "🔄 Gelenleri Yenile"}</Btn>
        <Btn onClick={addFolder}>📁 Yeni Klasör</Btn>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara: gönderen, konu, içerik…" style={{ flex: 1, minWidth: 180, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: T.textPrimary, outline: "none" }} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {allFolders.map(f => tabBtn(f.id, f.label, unreadIn(f.id) > 0 && f.id !== "trash" ? <span style={{ fontSize: 10, fontWeight: 700, background: tab === f.id ? "rgba(255,255,255,0.25)" : T.amberDim, color: tab === f.id ? T.white : T.amberText, padding: "1px 6px", borderRadius: 10 }}>{unreadIn(f.id)}</span> : null))}
        <span style={{ width: 1, height: 22, background: T.border, margin: "0 4px" }} />
        {tabBtn("sent", "📤 Giden")}
        {tab === "trash" && countIn("trash") > 0 && <Btn onClick={emptyTrash} style={{ marginLeft: "auto", background: T.redDim, color: T.redText }}>🗑 Çöpü Boşalt</Btn>}
        {tab.startsWith("custom:") && <Btn onClick={() => deleteFolder(allFolders.find(f => f.id === tab).raw)} style={{ marginLeft: "auto", background: T.redDim, color: T.redText }}>Klasörü Sil</Btn>}
      </div>

      {tab !== "sent" && inboxList.length > 0 && (
        <div style={{ position: "relative", display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSecondary, cursor: "pointer" }}>
            <input type="checkbox" checked={selected.length > 0 && inboxList.every(m => selected.includes(m.id))} onChange={e => setSelected(e.target.checked ? inboxList.map(m => m.id) : [])} style={{ width: 16, height: 16, cursor: "pointer" }} />
            {selected.length ? `${selected.length} seçili` : "Tümünü seç"}
          </label>
          {selected.length > 0 && <>
            {tab === "trash"
              ? <>
                <Btn onClick={() => bulkMove("inbox")} style={{ fontSize: 11, padding: "5px 10px" }}>↩️ Geri Al</Btn>
                <Btn onClick={bulkDeleteForever} style={{ fontSize: 11, padding: "5px 10px", background: T.redDim, color: T.redText }}>Kalıcı Sil ({selected.length})</Btn>
              </>
              : <>
                <Btn onClick={() => bulkRead(true)} style={{ fontSize: 11, padding: "5px 10px" }}>Okundu</Btn>
                <Btn onClick={() => bulkRead(false)} style={{ fontSize: 11, padding: "5px 10px" }}>Okunmadı</Btn>
                {tab !== "important" && <Btn onClick={() => bulkMove("important")} style={{ fontSize: 11, padding: "5px 10px" }}>⭐ Önemli</Btn>}
                <Btn onClick={() => setBulkMoveOpen(v => !v)} style={{ fontSize: 11, padding: "5px 10px" }}>📁 Taşı ▾</Btn>
                <Btn onClick={() => bulkMove("trash")} style={{ fontSize: 11, padding: "5px 10px", background: T.redDim, color: T.redText }}>🗑 Sil ({selected.length})</Btn>
              </>}
            <Btn onClick={() => setSelected([])} style={{ fontSize: 11, padding: "5px 10px" }}>Vazgeç</Btn>
          </>}
          {bulkMoveOpen && selected.length > 0 && (
            <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 6, minWidth: 200, zIndex: 5, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
              {allFolders.filter(f => f.id !== tab && f.id !== "trash").map(f => (
                <div key={f.id} onClick={() => bulkMove(f.id)} style={{ padding: "8px 12px", fontSize: 13, color: T.textPrimary, cursor: "pointer", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = T.bgInput} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{f.label}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div> : tab !== "sent" ? (
        inboxList.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>{tab === "inbox" ? 'Gelen kutusu boş. "🔄 Gelenleri Yenile" ile info@panormosmedya.com\'daki mailleri çek.' : "Bu klasörde mail yok."}</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inboxList.map(m => {
              const who = whoIs(m.from_email, m.client_id, null);
              return (
                <div key={m.id} onClick={() => openMail(m, "inbox")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: selected.includes(m.id) ? T.amberDim : T.bgCard, border: `1px solid ${selected.includes(m.id) ? T.amber : T.border}`, borderLeft: `3px solid ${m.is_read ? T.border : T.amber}`, borderRadius: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={selected.includes(m.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(m.id)} style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: m.is_read ? T.bgInput : T.amberDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{m.has_attachments ? "📎" : "✉️"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: m.is_read ? 500 : 700, color: T.textPrimary }}>{m.from_name || m.from_email}</span>
                      <Tag who={who} />
                    </div>
                    <div style={{ fontSize: 12, color: m.is_read ? T.textSecondary : T.textPrimary, fontWeight: m.is_read ? 400 : 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.subject}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(m.body_text || "").replace(/\s+/g, " ").slice(0, 120)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: T.textMuted, whiteSpace: "nowrap" }}>{fmt(m.received_at)}</span>
                    {m.folder !== "trash"
                      ? <button title="Çöpe taşı" onClick={e => { e.stopPropagation(); moveTo(m, "trash"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: T.textMuted, padding: 4 }}>🗑</button>
                      : <button title="Gelen'e geri al" onClick={e => { e.stopPropagation(); moveTo(m, "inbox"); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: T.textMuted, padding: 4 }}>↩️</button>}
                  </div>
                </div>
              );
            })}
          </div>
      ) : (
        sentList.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Panelden henüz mail gönderilmedi.</div>
          : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sentList.map(m => {
              const who = whoIs(m.to_email, m.client_id, m.lead_id);
              return (
                <div key={m.id} onClick={() => openMail(m, "sent")} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderLeft: `3px solid ${T.greenText}`, borderRadius: 10, cursor: "pointer" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: T.greenDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{m.attachment_name ? "📎" : "📤"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.textPrimary }}>{m.to_email}</span>
                      <Tag who={who} />
                    </div>
                    <div style={{ fontSize: 12, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.subject}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>{m.sent_by ? "Gönderen: " + m.sent_by : ""}</div>
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, whiteSpace: "nowrap" }}>{fmt(m.sent_at || m.created_at)}</div>
                </div>
              );
            })}
          </div>
      )}

      {open && (
        <Modal title={open._kind === "inbox" ? `✉️ ${open.subject || "(Konu yok)"}` : `📤 ${open.subject || "(Konu yok)"}`} onClose={() => setOpen(null)} width={760}>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.7, marginBottom: 12, padding: "10px 14px", background: T.bgInput, borderRadius: 8 }}>
            {open._kind === "inbox" ? <>
              <div><b>Kimden:</b> {open.from_name ? `${open.from_name} <${open.from_email}>` : open.from_email} <Tag who={whoIs(open.from_email, open.client_id, null)} /></div>
              <div><b>Kime:</b> {open.to_email || "info@panormosmedya.com"}</div>
              <div><b>Tarih:</b> {open.received_at ? new Date(open.received_at).toLocaleString("tr-TR") : ""} · <b>Klasör:</b> {folderLabel(open.folder || "inbox")}</div>
            </> : <>
              <div><b>Kime:</b> {open.to_email} <Tag who={whoIs(open.to_email, open.client_id, open.lead_id)} /></div>
              <div><b>Gönderen:</b> {open.sent_by || "—"} · info@panormosmedya.com</div>
              <div><b>Tarih:</b> {(open.sent_at || open.created_at) ? new Date(open.sent_at || open.created_at).toLocaleString("tr-TR") : ""}</div>
              {open.attachment_name && <div>📎 {open.attachment_name}</div>}
            </>}
          </div>

          {open._kind === "inbox" && (open.attachments || []).length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {open.attachments.map((a, i) => (
                <button key={i} onClick={() => downloadAttachment(a)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, cursor: "pointer", color: T.textPrimary, fontSize: 12 }}>
                  <span style={{ fontSize: 16 }}>{/pdf/i.test(a.type) || /\.pdf$/i.test(a.name) ? "📄" : /xml/i.test(a.type) || /\.xml$/i.test(a.name) ? "🧾" : /image/i.test(a.type) ? "🖼️" : "📎"}</span>
                  <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                  <span style={{ color: T.textMuted, fontSize: 11 }}>{fmtSize(a.size || 0)}</span>
                  <span style={{ color: T.indigoText, fontSize: 11 }}>⬇ İndir</span>
                </button>
              ))}
            </div>
          )}
          {open._kind === "inbox" && open.has_attachments && !(open.attachments || []).length && <div style={{ fontSize: 11, color: T.amberText, marginBottom: 10 }}>📎 Bu mailde ek var ama panel ekleri kaydetmeye başlamadan önce çekilmiş; eki GoDaddy webmail'den açabilirsin.</div>}

          {open._kind === "inbox" && open.body_html
            ? <iframe title="mail" sandbox="" srcDoc={`<base target="_blank"><style>body{font-family:system-ui,sans-serif;font-size:14px;color:#222;background:#fff;padding:12px;margin:0;word-break:break-word}img{max-width:100%}</style>` + open.body_html} style={{ width: "100%", height: 400, border: `1px solid ${T.border}`, borderRadius: 8, background: "#fff" }} />
            : <div style={{ whiteSpace: "pre-wrap", fontSize: 13, color: T.textPrimary, lineHeight: 1.6, padding: "12px 14px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 400, overflowY: "auto" }}>{open._kind === "inbox" ? (open.body_text || "(İçerik yok)") : (open.body || "")}</div>}

          {open._kind === "inbox" && (
            <div style={{ position: "relative", display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, flexWrap: "wrap" }}>
              {open.folder === "trash"
                ? <>
                  <Btn onClick={() => moveTo(open, "inbox")}>↩️ Gelen'e Geri Al</Btn>
                  <Btn onClick={() => deleteForever(open)} style={{ background: T.redDim, color: T.redText }}>Kalıcı Sil</Btn>
                </>
                : <>
                  <Btn onClick={() => toggleRead(open)}>{open.is_read ? "Okunmadı işaretle" : "Okundu işaretle"}</Btn>
                  {open.folder !== "important" && <Btn onClick={() => moveTo(open, "important")}>⭐ Önemli</Btn>}
                  <Btn onClick={() => setMoveOpen(v => !v)}>📁 Taşı ▾</Btn>
                  <Btn onClick={() => moveTo(open, "trash")} style={{ background: T.redDim, color: T.redText }}>🗑 Sil</Btn>
                  <Btn variant="primary" onClick={() => reply(open)}>↩️ Yanıtla</Btn>
                </>}
              {moveOpen && (
                <div style={{ position: "absolute", right: 0, bottom: "calc(100% + 6px)", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, padding: 6, minWidth: 200, zIndex: 5, boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}>
                  {allFolders.filter(f => f.id !== (open.folder || "inbox") && f.id !== "trash").map(f => (
                    <div key={f.id} onClick={() => moveTo(open, f.id)} style={{ padding: "8px 12px", fontSize: 13, color: T.textPrimary, cursor: "pointer", borderRadius: 6 }} onMouseEnter={e => e.currentTarget.style.background = T.bgInput} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{f.label}</div>
                  ))}
                  <div onClick={() => { setMoveOpen(false); addFolder(); }} style={{ padding: "8px 12px", fontSize: 12, color: T.indigoText, cursor: "pointer", borderTop: `1px solid ${T.border}`, marginTop: 4 }}>+ Yeni klasör…</div>
                </div>
              )}
            </div>
          )}
          {open._kind === "sent" && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}><Btn onClick={() => setOpen(null)}>Kapat</Btn></div>}
        </Modal>
      )}

      {compose && <MailModal {...compose} currentStaff={currentStaff} onClose={() => setCompose(null)} onSent={async () => { await load(); setTab("sent"); }} />}
    </div>
  );
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
  const totalThisMonth = thisMonthPublishes.reduce((s,p)=>s+(p.quantity||1),0);

  // Gerçekleşen: platform+tür bazında say  actual[platform][type] = adet (quantity toplanır)
  const actual = {};
  thisMonthPublishes.forEach(p=>{
    if(!actual[p.platform]) actual[p.platform]={};
    actual[p.platform][p.contentType] = (actual[p.platform][p.contentType]||0)+(p.quantity||1);
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
      {perms.finance && (client.workType!=="piece" ? <StatCard label="Aylık Paket" value={fmtMoney(client.monthlyFee)} /> : <StatCard label="Çalışma Tipi" value="Parça Başı" color={T.indigoText} />)}
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

    {/* Parça başı işler (sadece parça başı / ikisi tipinde) */}
    {(client.workType==="piece"||client.workType==="both") && <PieceJobsSection client={client} perms={perms} />}

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
    if (error) { swalAlert("Güncellenemedi: " + error.message + "\n\nICERIK-ONAY-SQL kodunu çalıştırdığınızdan emin olun."); return; }
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
      openStoredFile(m.storagePath);
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
function IdeasPage({ currentStaff, clients }) {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [filterClient, setFilterClient] = useState("all");

  const load = async () => {
    const { data } = await supabase.from('ideas').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    const sorted = (data || []).sort((a,b)=>(a.title||"").localeCompare(b.title||"","tr",{sensitivity:"base"}));
    setIdeas(sorted);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveIdea = async () => {
    if (!form.title) return;
    if (form.id) {
      // Düzenleme
      const { error } = await supabase.from('ideas').update({
        title: form.title, description: form.description || "", category: form.category || "", status: form.status || "planned",
        client_name: form.client_name || "",
      }).eq('id', form.id);
      if (error) { swalAlert("Fikir güncellenemedi: " + error.message); return; }
    } else {
      // Yeni ekleme
      const { error } = await supabase.from('ideas').insert({
        title: form.title, description: form.description || "", category: form.category || "", status: form.status || "planned",
        created_by: currentStaff?.name || "", client_name: form.client_name || "",
      });
      if (error) { swalAlert("Fikir kaydedilemedi: " + error.message + "\n\nFIKIRLER-DUZELT-SQL kodunu Supabase'de çalıştırdığınızdan emin olun."); return; }
    }
    setModal(false); setForm({});
    load();
  };

  const editIdea = (idea) => {
    setForm({ id: idea.id, title: idea.title || "", description: idea.description || "", category: idea.category || "", status: idea.status || "planned", client_name: idea.client_name || "" });
    setModal(true);
  };

  const deleteIdea = async (id) => {
    if (!await swalConfirm("Bu fikir silinsin mi?")) return;
    await supabase.from('ideas').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  return <div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
      <StatCard label="Toplam Fikir" value={ideas.length} />
      <StatCard label="Devam Ediyor" value={ideas.filter(i=>i.status==="in_progress").length} color={T.amberText} />
      <StatCard label="Tamamlanan" value={ideas.filter(i=>i.status==="completed").length} color={T.greenText} />
    </div>

    <div style={{display:"flex",gap:10,marginBottom:20,flexWrap:"wrap",alignItems:"center"}}>
      <Btn variant="primary" onClick={()=>{setModal(true);setForm({title:"",description:"",status:"planned",category:"",client_name:""});}}>💡 Yeni Fikir Ekle</Btn>
      <Btn onClick={()=>{
        const statusLabels={planned:"Planlandı",in_progress:"Devam Ediyor",completed:"Tamamlandı"};
        const rows = ideas.map(i => ({
          "Başlık": i.title,
          "Müşteri": i.client_name || "Genel",
          "Açıklama": i.description || "—",
          "Kategori": i.category || "—",
          "Ekleyen": i.created_by || "—",
          "Durum": statusLabels[i.status] || i.status,
        }));
        printData("Fikir Listesi", rows);
      }}>🖨️ Yazdır</Btn>
      <div style={{flex:1}} />
      <Select value={filterClient} onChange={e=>setFilterClient(e.target.value)} style={{maxWidth:220}}>
        <option value="all">🏢 Tüm Müşteriler</option>
        <option value="__none__">Genel (müşterisiz)</option>
        {(clients||[]).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
      </Select>
    </div>

    {loading ? (
      <div style={{textAlign:"center",color:T.textMuted,padding:40}}>Yükleniyor...</div>
    ) : ideas.length === 0 ? (
      <div style={{textAlign:"center",color:T.textMuted,padding:40}}>Henüz fikir yok. "💡 Yeni Fikir Ekle" ile başla!</div>
    ) : (
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
        {ideas.filter(idea => filterClient==="all" || (filterClient==="__none__" ? !idea.client_name : idea.client_name===filterClient)).map(idea => (
          <Card key={idea.id} style={{padding:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,gap:8}}>
              <div style={{fontSize:13,fontWeight:600,color:T.textPrimary,flex:1}}>{idea.title}</div>
              <Badge status={idea.status} />
            </div>
            {idea.client_name && <div style={{display:"inline-block",fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:6,background:T.indigoDim,color:T.indigoText,marginBottom:10}}>🏢 {idea.client_name}</div>}
            <div style={{fontSize:12,color:T.textMuted,marginBottom:12,whiteSpace:"pre-wrap"}}>{idea.description}</div>
            {idea.created_by && <div style={{fontSize:11,color:T.textMuted,marginBottom:10,fontWeight:600}}>👤 {idea.created_by}{idea.created_at?` · ${new Date(idea.created_at).toLocaleDateString("tr-TR")}`:""}</div>}
            <div style={{display:"flex",gap:6,alignItems:"center",justifyContent:"space-between"}}>
              {idea.category ? <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{idea.category}</span> : <span/>}
              <div style={{display:"flex",gap:10,alignItems:"center"}}>
                <button onClick={()=>editIdea(idea)} title="Düzenle" style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:13}}>✏️</button>
                <button onClick={()=>deleteIdea(idea.id)} title="Sil" style={{background:"none",border:"none",color:T.redText,cursor:"pointer",fontSize:13}}>🗑</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )}

    {modal && <Modal title={form.id ? "✏️ Fikri Düzenle" : "Yeni Fikir Ekle"} onClose={()=>setModal(false)} width={700}>
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
      <FormField label="🏢 Hangi Müşteri İçin? (isteğe bağlı)">
        <Select value={form.client_name||""} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))}>
          <option value="">Genel / Müşteri seçilmedi</option>
          {(clients||[]).map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
        </Select>
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
// ── Aylık görev performansı ──
// Görev hangi aya ait: son tarihi varsa o ay; yoksa atandığı, o da yoksa oluşturulduğu ay.
const taskMonth = (t) => /^\d{4}-\d{2}/.test(t.due || "") ? t.due.slice(0, 7) : localDay(t.assignedAt || t.createdAt).slice(0, 7);
const taskIsDone = (t) => t.col === "done" || t.col === "published";
function localDay(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
// Zamanında mı tamamlandı? true / false; son tarih ya da tamamlanma anı bilinmiyorsa null
const taskOnTime = (t) => (!taskIsDone(t) || !t.completedAt || !/^\d{4}-\d{2}-\d{2}/.test(t.due || "")) ? null : localDay(t.completedAt) <= t.due.slice(0, 10);
const monthName = (ref) => { const p = String(ref).split("-"); return `${TR_MONTHS[parseInt(p[1]) - 1] || ""} ${p[0]}`; };
const shiftMonth = (ref, n) => { const p = String(ref).split("-").map(Number); const d = new Date(p[0], p[1] - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };

// Bir çalışanın o aydaki performansı
function staffPerformance(sid, monthTasks, monthPublishes, month) {
  const mine = monthTasks.filter(t => t.assignedTo === sid);
  const bugun = todayStr();
  const done = mine.filter(taskIsDone);
  const onTime = done.filter(t => taskOnTime(t) === true).length;
  const lateDone = done.filter(t => taskOnTime(t) === false).length;
  const overdue = mine.filter(t => !taskIsDone(t) && /^\d{4}-\d{2}-\d{2}/.test(t.due || "") && t.due.slice(0, 10) < bugun).length;
  return {
    total: mine.length, done: done.length,
    active: mine.filter(t => t.col === "inprogress" || t.col === "review" || t.col === "approval").length,
    todo: mine.filter(t => t.col === "todo").length,
    revision: mine.filter(t => t.col === "revision").length,
    revised: mine.filter(t => localDay(t.revisionAt).slice(0, 7) === month).length,
    published: mine.filter(t => t.col === "published").length,
    publishCount: monthPublishes.filter(p => p.publisherId === sid).length,
    onTime, lateDone, overdue,
    rate: mine.length > 0 ? Math.round(done.length / mine.length * 100) : 0,
    tasks: mine,
  };
}

const TASK_COL_LABELS = { todo: "Yapılacak", inprogress: "Başlandı", review: "İncelemede", done: "Tamamlandı", revision: "Revize", approval: "Onaya Gönderildi", published: "Paylaşım Yapıldı" };

// Ay sonu çalışan performans raporu (PDF)
function printPerformanceReport(month, staff, monthTasks, monthPublishes) {
  const esc = (x) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const gun = (d) => { const p = String(d || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "—"; };
  const rows = staff.map(st => ({ st, p: staffPerformance(st.id, monthTasks, monthPublishes, month) })).filter(r => r.p.total > 0 || r.p.publishCount > 0);
  const toplam = monthTasks.length, biten = monthTasks.filter(taskIsDone).length;
  const durum = (t) => { const o = taskOnTime(t); if (taskIsDone(t)) return o === false ? '<span class="gec">Geç tamamlandı</span>' : '<span class="ok">Tamamlandı' + (o === true ? " (zamanında)" : "") + "</span>"; return (/^\d{4}-\d{2}-\d{2}/.test(t.due || "") && t.due.slice(0, 10) < todayStr()) ? '<span class="gec">Gecikti — ' + esc(TASK_COL_LABELS[t.col] || t.col) + "</span>" : esc(TASK_COL_LABELS[t.col] || t.col); };
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Performans Raporu</title><style>${PRINT_STYLES}
    .ozet { display:flex; gap:10px; margin-bottom:6px; }
    .ozet .k { flex:1; border:1px solid #E5E7EB; border-radius:9px; padding:10px 12px; }
    .ozet .k .l { font-size:9px; color:#6B7280; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:3px; }
    .ozet .k .v { font-size:16px; font-weight:800; color:#1A2B3F; }
    td.c, th.c { text-align:center; white-space:nowrap; }
    h2.kisi { font-size:15px; border-bottom:2px solid #F25124; padding-bottom:4px; margin-top:20px; page-break-after:avoid; }
    .kisi-ozet { font-size:10.5px; color:#374151; margin:6px 0 8px; }
    .ok { color:#0A7A4A; font-weight:700; } .gec { color:#C2410C; font-weight:700; }
    table { page-break-inside:auto; } tr { page-break-inside:avoid; }
  </style></head><body>
    <div class="head">
      <div class="logo">panormos <span class="m">medya.</span></div>
      <h1>Çalışan Performans Raporu</h1>
      <div class="sub">${monthName(month)} · Rapor tarihi: ${new Date().toLocaleDateString("tr-TR")}</div>
    </div>
    <div class="ozet">
      <div class="k"><div class="l">Aydaki Görev</div><div class="v">${toplam}</div></div>
      <div class="k"><div class="l">Tamamlanan</div><div class="v">${biten}</div></div>
      <div class="k"><div class="l">Tamamlanma Oranı</div><div class="v">%${toplam > 0 ? Math.round(biten / toplam * 100) : 0}</div></div>
      <div class="k"><div class="l">Paylaşım</div><div class="v">${monthPublishes.length}</div></div>
    </div>
    <h2>Çalışan Özeti</h2>
    <table>
      <tr><th>Çalışan</th><th class="c">Görev</th><th class="c">Tamamlanan</th><th class="c">Oran</th><th class="c">Zamanında</th><th class="c">Geç Tamamlanan</th><th class="c">Geciken (açık)</th><th class="c">Revize Alan</th><th class="c">Paylaşım</th></tr>
      ${rows.map(r => `<tr><td><strong>${esc(r.st.name)}</strong><br><span style="color:#6B7280">${esc(r.st.role || "")}</span></td><td class="c">${r.p.total}</td><td class="c">${r.p.done}</td><td class="c"><strong>%${r.p.rate}</strong></td><td class="c">${r.p.onTime}</td><td class="c">${r.p.lateDone}</td><td class="c">${r.p.overdue}</td><td class="c">${r.p.revised}</td><td class="c">${r.p.publishCount}</td></tr>`).join("") || '<tr><td colspan="9" style="text-align:center;color:#8A8F98;padding:12px;">Bu ayda görev yok</td></tr>'}
    </table>
    ${rows.map(r => `<h2 class="kisi">${esc(r.st.name)}</h2>
      <div class="kisi-ozet">${r.p.total} görevden ${r.p.done} tanesi tamamlandı (%${r.p.rate}). Zamanında: ${r.p.onTime} · Geç tamamlanan: ${r.p.lateDone} · Hâlâ açık ve gecikmiş: ${r.p.overdue} · Revize alan: ${r.p.revised} · Paylaşım: ${r.p.publishCount}</div>
      <table><tr><th>Görev</th><th>Müşteri</th><th>Son Tarih</th><th>Tamamlanma</th><th>Durum</th></tr>
      ${[...r.p.tasks].sort((a, b) => String(a.due).localeCompare(String(b.due))).map(t => `<tr><td>${esc(t.title)}</td><td>${esc(t.client || "—")}</td><td>${/^\d{4}/.test(t.due || "") ? gun(t.due) : "—"}</td><td>${t.completedAt ? gun(localDay(t.completedAt)) : "—"}</td><td>${durum(t)}</td></tr>`).join("") || '<tr><td colspan="5">Görev yok</td></tr>'}
      </table>`).join("")}
    <div class="terms">Görev, son tarihinin bulunduğu aya sayılır (son tarihi yoksa atandığı aya). Oran her ay sıfırdan hesaplanır. "Zamanında / geç" bilgisi, tamamlanma anı kaydedilen görevler için hesaplanır; bu özellik eklenmeden önce tamamlanan görevlerde tamamlanma tarihi boş görünür.</div>
  </body></html>`;
  downloadPdfFromHTML(html, `Performans-Raporu-${month}.pdf`);
}

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
  const [perfMonth,setPerfMonth]=useState(()=>currentMonthRef());  // performansı gösterilen ay (oran her ay sıfırlanır)
  const [columnModal,setColumnModal]=useState(null);     // kolon "tümünü gör" modalı
  const [approvalModal,setApprovalModal]=useState(null);  // onaya gönder (WhatsApp) modalı
  const [revisionModal,setRevisionModal]=useState(null);  // revize modalı
  const [approvalUploading,setApprovalUploading]=useState(false);

  const cols=[
    {id:"todo",label:"Yapılacak",color:T.textMuted},
    {id:"inprogress",label:"Başlandı",color:T.indigoText},
    {id:"review",label:"İncelemede",color:T.amber},
    {id:"done",label:"Tamamlandı",color:T.green},
    {id:"revision",label:"Revize",color:"#EF4444"},
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
      setPublishModal({ taskId:id, client_id: t?.clientId||"", publisher_id: t?.assignedTo||"", platform:"instagram", counts:{} });
      return;
    }
    // "Onaya Gönderildi" kolonuna taşınıyorsa müşteri seç + WhatsApp
    if(newCol==="approval"){
      const t = tasks.find(x=>x.id===id);
      setApprovalModal({ taskId:id, client_id: t?.clientId||"", task:t });
      return;
    }
    // Tamamlanma anı: ilk kez "Tamamlandı / Paylaşım Yapıldı" olduğunda yazılır, geri alınırsa silinir
    const onceki = tasks.find(x=>x.id===id);
    const bitti = newCol==="done" || newCol==="published";
    const completedAt = bitti ? (onceki?.completedAt || new Date().toISOString()) : null;
    setTasks(prev=>prev.map(t=>t.id===id?{...t,col:newCol,completedAt}:t));
    if(selectedTask && selectedTask.id===id){ setSelectedTask({...selectedTask,col:newCol,completedAt}); }
    await supabase.from('tasks').update({ col: newCol, completed_at: completedAt }).eq('id', id);
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
    if(!pm.client_id){ swalAlert("Lütfen paylaşım yapılan müşteriyi seçin"); return; }
    if(!pm.publisher_id){ swalAlert("Lütfen paylaşımı yapan çalışanı seçin"); return; }
    const counts = pm.counts || {};
    const total = Object.values(counts).reduce((s,n)=>s+(n||0),0);
    if(total < 1){ swalAlert("Lütfen en az 1 içerik adedi girin (örn: 3 Post)"); return; }
    const nowIso = new Date().toISOString();
    // Her içerik türü için, adedi kadar quantity ile bir kayıt oluştur
    const rows = Object.entries(counts).filter(([k,n])=>(n||0)>0).map(([content_type,qty])=>({
      task_id: pm.taskId, client_id: pm.client_id, publisher_id: pm.publisher_id,
      platform: pm.platform, content_type, quantity: qty, published_at: nowIso,
    }));
    const { error } = await supabase.from('publishes').insert(rows);
    if(error){ swalAlert("Paylaşım kaydedilemedi: "+error.message+"\n\nPAYLASIM-ADET-SQL kodunu çalıştırın."); return; }
    const pubCompletedAt = tasks.find(x=>x.id===pm.taskId)?.completedAt || nowIso;
    await supabase.from('tasks').update({ col: "published", completed_at: pubCompletedAt }).eq('id', pm.taskId);
    setTasks(prev=>prev.map(t=>t.id===pm.taskId?{...t,col:"published",completedAt:pubCompletedAt}:t));
    if(selectedTask && selectedTask.id===pm.taskId){ setSelectedTask({...selectedTask,col:"published"}); }
    setPublishModal(null);
    // Müşteri verilerini yenile (takvim + paylaşım sayımı güncellensin)
    if(refreshData) await refreshData();
  };

  // Görevi yeniden ata (atama tarihini otomatik güncelle)
  // Revize al: görevi "revision" kolonuna taşı + kim/ne zaman/açıklama kaydet
  const confirmRevision = async () => {
    const rm = revisionModal;
    if(!rm.note || !rm.note.trim()){ swalAlert("Lütfen revize açıklaması yazın"); return; }
    const nowIso = new Date().toISOString();
    const by = currentStaff?.name || "Bilinmeyen";
    const { error } = await supabase.from('tasks').update({ col: "revision", revision_note: rm.note.trim(), revision_by: by, revision_at: nowIso }).eq('id', rm.taskId);
    if(error){ swalAlert("Revize kaydedilemedi: "+error.message+"\n\nREVIZE-SQL kodunu çalıştırın."); return; }
    setTasks(prev=>prev.map(t=>t.id===rm.taskId?{...t,col:"revision",revisionNote:rm.note.trim(),revisionBy:by,revisionAt:nowIso}:t));
    if(selectedTask && selectedTask.id===rm.taskId){ setSelectedTask({...selectedTask,col:"revision",revisionNote:rm.note.trim(),revisionBy:by,revisionAt:nowIso}); }
    setRevisionModal(null);
  };

  const reassignTask = async (taskId, newAssignee) => {
    const val = newAssignee || null;
    const assignedAt = val ? new Date().toISOString() : null;
    await supabase.from('tasks').update({ assigned_to: val, assigned_at: assignedAt }).eq('id', taskId);
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t,assignedTo:val,assignedAt}:t));
    if(selectedTask && selectedTask.id===taskId){ setSelectedTask({...selectedTask,assignedTo:val,assignedAt}); }
  };

  // Görev düzenlemeyi kaydet
  const saveEdit = async () => {
    if(!editForm.title){ swalAlert("Başlık boş olamaz"); return; }
    const cid = clients.find(c=>c.name===editForm.client)?.id || null;
    const { error } = await supabase.from('tasks').update({
      title: editForm.title, type: editForm.type, priority: editForm.priority,
      due_date: editForm.due||"—", client_id: cid,
    }).eq('id', editForm.id);
    if(error){ swalAlert("Güncellenemedi: "+error.message); return; }
    setTasks(prev=>prev.map(t=>t.id===editForm.id?{...t,title:editForm.title,type:editForm.type,priority:editForm.priority,due:editForm.due,client:editForm.client,clientId:cid}:t));
    setSelectedTask(s=>s&&s.id===editForm.id?{...s,title:editForm.title,type:editForm.type,priority:editForm.priority,due:editForm.due,client:editForm.client,clientId:cid}:s);
    setEditModal(false);
  };

  const deleteTask = async (taskId) => {
    if (!deleteModal.reason || !deleteModal.note) {
      swalAlert("Lütfen silme sebebini ve açıklamayı girin");
      return;
    }
    if (!await swalConfirm("Bu görev silinecek.\n\nOnaylıyor musunuz?")) return;

    const { error } = await supabase.from('tasks').update({
      deleted_at: new Date().toISOString(),
      delete_reason: deleteModal.reason,
      delete_note: deleteModal.note,
    }).eq('id', taskId);

    if (error) {
      swalAlert("HATA: Görev silinemedi!\n\n" + error.message + "\n\nSupabase'de gerekli sütunlar eksik olabilir. SQL kodunu çalıştırdığınızdan emin olun.");
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
  // Performans seçilen aya göre hesaplanır; yeni ay başlayınca oran sıfırdan başlar
  const monthTasks = tasks.filter(t => taskMonth(t) === perfMonth);
  const monthPublishes = allPublishes.filter(p => localDay(p.publishedAt).slice(0, 7) === perfMonth);
  const computeStats = (sid) => staffPerformance(sid, monthTasks, monthPublishes, perfMonth);
  // Yönetici herkesi görür; çalışan sadece kendini
  const visibleStaff = isAdminView ? staff : staff.filter(s => s.id === currentStaff?.id);
  // Üst özet çubuğu: yönetici=global, çalışan=kendi görevleri
  const viewTasks = isAdminView ? monthTasks : monthTasks.filter(t => t.assignedTo === currentStaff?.id);
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

  // ── Paylaşım tarih grupları (bugün / dün / son 7 gün / 2 hafta / 1 ay) ──
  const PUBLISH_BUCKETS = [
    { key: "today", label: "Bugün", icon: "🔥", max: 0 },
    { key: "yest", label: "Dün", icon: "🕐", max: 1 },
    { key: "week", label: "Son 7 Gün", icon: "📆", max: 7 },
    { key: "week2", label: "Son 2 Hafta", icon: "🗓️", max: 14 },
    { key: "month", label: "Son 1 Ay", icon: "📁", max: 30 },
    { key: "older", label: "Daha Eski", icon: "🗄️", max: Infinity },
  ];
  const daysAgoOf = (dateStr) => {
    if (!dateStr) return Infinity;
    const d = new Date(dateStr), n = new Date();
    const d0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const n0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((n0 - d0) / 86400000);
  };
  const bucketOfTask = (taskId) => {
    const diff = daysAgoOf(publishDateByTask[taskId]);
    return PUBLISH_BUCKETS.find(b => diff <= b.max) || PUBLISH_BUCKETS[PUBLISH_BUCKETS.length - 1];
  };
  const groupPublished = (list) => {
    const sorted = [...list].sort((a, b) => {
      const da = publishDateByTask[a.id] ? new Date(publishDateByTask[a.id]).getTime() : 0;
      const db = publishDateByTask[b.id] ? new Date(publishDateByTask[b.id]).getTime() : 0;
      return db - da; // yeniden eskiye
    });
    return PUBLISH_BUCKETS.map(b => ({ ...b, items: sorted.filter(t => bucketOfTask(t.id).key === b.key) })).filter(g => g.items.length);
  };

  // Bir kolonun görevlerini getir (published kolonu son 30 gün gösterilir)
  const getColTasks = (colId) => {
    let list = tasks.filter(t => t.col === colId && (filterStaff === "all" || t.assignedTo === filterStaff));
    if (colId === "published") {
      list = list.filter(t => daysAgoOf(publishDateByTask[t.id]) <= 30);
      list.sort((a, b) => {
        const da = publishDateByTask[a.id] ? new Date(publishDateByTask[a.id]).getTime() : 0;
        const db = publishDateByTask[b.id] ? new Date(publishDateByTask[b.id]).getTime() : 0;
        return db - da;
      });
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
        {task.col==="published" && publishDateByTask[task.id] && <div style={{ fontSize: 9, color: T.purpleText, marginBottom: 5, fontWeight: 600 }}>✅ {fmtDateTime(publishDateByTask[task.id])}</div>}
        {task.col==="revision" && task.revisionNote && <div style={{ fontSize: 9, color: T.redText, marginBottom: 5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🔄 {task.revisionNote}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: priorityConfig[task.priority]?.bg, color: priorityConfig[task.priority]?.color }}>{priorityConfig[task.priority]?.label}</span>
          {task.client && <span style={{ fontSize: 9, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 80 }}>{task.client}</span>}
        </div>
      </div>
    );
  };

  return <div>
    <div style={{marginBottom:16,padding:"16px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:12}}>
        <button onClick={()=>setPerfMonth(m=>shiftMonth(m,-1))} title="Önceki ay" style={{width:30,height:30,borderRadius:8,background:T.bgSurface,border:`1px solid ${T.border}`,color:T.textSecondary,cursor:"pointer",fontSize:14}}>‹</button>
        <div style={{fontSize:14,fontWeight:700,color:T.textPrimary,minWidth:110,textAlign:"center"}}>{monthName(perfMonth)}</div>
        <button onClick={()=>setPerfMonth(m=>shiftMonth(m,1))} disabled={perfMonth>=currentMonthRef()} title="Sonraki ay" style={{width:30,height:30,borderRadius:8,background:T.bgSurface,border:`1px solid ${T.border}`,color:T.textSecondary,cursor:perfMonth>=currentMonthRef()?"default":"pointer",opacity:perfMonth>=currentMonthRef()?0.4:1,fontSize:14}}>›</button>
        {perfMonth!==currentMonthRef() && <Btn onClick={()=>setPerfMonth(currentMonthRef())} style={{fontSize:11,padding:"5px 10px"}}>Bu Ay</Btn>}
        <div style={{flex:1}} />
        {isAdminView && <Btn onClick={()=>{ if(!monthTasks.length && !monthPublishes.length){ swalAlert("Bu ayda görev ya da paylaşım yok."); return; } printPerformanceReport(perfMonth, staff, monthTasks, monthPublishes); }} style={{fontSize:12,background:T.indigoDim,color:T.indigoText}}>📑 Performans Raporu (PDF)</Btn>}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{isAdminView ? "Aylık Tamamlanma Oranı" : "Bu Ayki Tamamlanma Oranım"} <span style={{fontWeight:400,color:T.textMuted}}>· {viewTasks.length} görev</span></span>
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
        <span style={{fontSize:13,fontWeight:700,color:T.textPrimary}}>📊 {isAdminView ? "Çalışan Performansı" : "Performansım"} <span style={{fontWeight:500,color:T.textMuted}}>· {monthName(perfMonth)}</span></span>
        {isAdminView && (
          <Btn onClick={()=>{
            const rows = staff.map(s=>{ const st=computeStats(s.id); return {
              "Çalışan": s.name, "Ay": monthName(perfMonth), "Toplam Görev": st.total, "Tamamlanan": st.done, "Tamamlanma %": st.rate+"%",
              "Zamanında": st.onTime, "Geç Tamamlanan": st.lateDone, "Geciken (açık)": st.overdue, "Revize Alan": st.revised,
              "Aktif": st.active, "Yapılacak": st.todo, "Paylaşım": st.publishCount,
            };});
            const detay = monthTasks.map(t=>({ "Çalışan": staff.find(x=>x.id===t.assignedTo)?.name||"—", "Görev": t.title, "Müşteri": t.client||"—", "Son Tarih": t.due||"—", "Tamamlanma": t.completedAt?localDay(t.completedAt):"—", "Durum": TASK_COL_LABELS[t.col]||t.col, "Zamanında": taskOnTime(t)===true?"Evet":taskOnTime(t)===false?"Hayır":"—" }));
            if(typeof exportPerfectExcel==="function") exportPerfectExcel([{name:"Performans", rows, title:`PANORMOS MEDYA — ÇALIŞAN PERFORMANSI (${monthName(perfMonth)})`},{name:"Görevler", rows:detay, title:`GÖREVLER (${monthName(perfMonth)})`}], `calisan-performansi-${perfMonth}.xlsx`);
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
                <div style={{background:T.bgInput,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:18,fontWeight:700,color:T.indigoText}}>{st.active}</div><div style={{fontSize:9,color:T.textMuted}}>AKTİF</div></div>
                <div style={{background:T.bgInput,borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:18,fontWeight:700,color:"#A855F7"}}>{st.publishCount}</div><div style={{fontSize:9,color:T.textMuted}}>PAYLAŞIM</div></div>
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:10,fontSize:11,color:T.textMuted}}>
                <span>Zamanında <b style={{color:T.greenText}}>{st.onTime}</b></span>
                <span>Geç <b style={{color:T.amberText}}>{st.lateDone}</b></span>
                <span>Geciken <b style={{color:st.overdue>0?T.redText:T.textSecondary}}>{st.overdue}</b></span>
                <span>Revize <b style={{color:T.textSecondary}}>{st.revised}</b></span>
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
        const colLabels={todo:"Yapılacak",inprogress:"Başlandı",review:"İncelemede",done:"Tamamlandı",revision:"Revize",approval:"Onaya Gönderildi",published:"Paylaşım Yapıldı"};
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
            {selectedTask.revisionNote && (
              <div style={{background:"rgba(239,68,68,0.1)",border:`1px solid rgba(239,68,68,0.3)`,borderRadius:10,padding:"12px 14px"}}>
                <div style={{fontSize:11,color:T.redText,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>🔄 Revize Talebi</div>
                <div style={{fontSize:13,color:T.textPrimary,marginBottom:8,lineHeight:1.5}}>{selectedTask.revisionNote}</div>
                <div style={{fontSize:11,color:T.textMuted}}>✍️ {selectedTask.revisionBy||"—"}{selectedTask.revisionAt?` · ${fmtDateTime(selectedTask.revisionAt)}`:""}</div>
              </div>
            )}
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
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
            <button onClick={()=>{setDeleteModal({taskId:selectedTask.id,reason:"",note:""});}} style={{padding:"6px 12px",fontSize:12,fontWeight:600,borderRadius:8,background:T.redDim,color:T.redText,border:"none",cursor:"pointer"}}>🗑 Sil</button>
            <button onClick={()=>setRevisionModal({taskId:selectedTask.id,note:""})} style={{padding:"6px 12px",fontSize:12,fontWeight:600,borderRadius:8,background:"rgba(239,68,68,0.15)",color:T.redText,border:"none",cursor:"pointer"}}>🔄 Revize</button>
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

    {/* Revize Modalı */}
    {revisionModal && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1001}} onClick={()=>setRevisionModal(null)}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:440}} onClick={e=>e.stopPropagation()}>
          <div style={{fontSize:15,fontWeight:700,color:T.textPrimary,marginBottom:6}}>🔄 Revize Al</div>
          <div style={{fontSize:12,color:T.textMuted,marginBottom:16,lineHeight:1.5}}>Görev "Revize" kolonuna taşınacak. Revizeyi <strong style={{color:T.textPrimary}}>{currentStaff?.name}</strong> olarak, şu an ({new Date().toLocaleDateString("tr-TR")} {new Date().toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}) kaydedilecek.</div>
          <FormField label="Revize Açıklaması (ne değişmeli?)">
            <Textarea placeholder="Örn: Logo daha büyük olsun, arka plan mavi yapılsın..." value={revisionModal.note} onChange={e=>setRevisionModal({...revisionModal,note:e.target.value})} minHeight={90} />
          </FormField>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
            <Btn onClick={()=>setRevisionModal(null)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={confirmRevision} style={{background:"#EF4444",border:"none"}}>🔄 Revize Olarak İşaretle</Btn>
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

    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:6}}>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(150px,1fr))",gap:10,minWidth:7*150+60}}>
      {cols.map(col=>{
        const colTasks = getColTasks(col.id);
        const allTasks = getAllColTasks(col.id);
        const shown = colTasks.slice(0, 5);
        // Gizli = (kolonda gösterilmeyenler) + (published'da eski kayıtlar)
        const hiddenCount = allTasks.length - shown.length;
        return (
        <div key={col.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:12,fontWeight:600,color:col.color}}>{col.label}{col.id==="published" && <span style={{fontSize:8,color:T.textMuted,marginLeft:4}}>(son 30 gün)</span>}</span>
            <span style={{fontSize:10,background:T.bgSurface,color:T.textMuted,borderRadius:20,padding:"1px 8px"}}>{colTasks.length}</span>
          </div>
          {colTasks.length===0 && <div style={{fontSize:10,color:T.textMuted,textAlign:"center",padding:"12px 0"}}>—</div>}
          {col.id==="published"
            ? groupPublished(shown).map(g=>(
                <div key={g.key}>
                  <div style={{fontSize:9,fontWeight:700,color:T.textMuted,margin:"2px 0 6px",textTransform:"uppercase",letterSpacing:"0.04em"}}>{g.icon} {g.label} ({g.items.length})</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>{g.items.map(taskCardEl)}</div>
                </div>
              ))
            : shown.map(taskCardEl)}
          {hiddenCount>0 && (
            <button onClick={()=>setColumnModal({colId:col.id,label:col.label,color:col.color})} style={{marginTop:4,padding:"9px",borderRadius:8,border:`1px solid ${col.color}55`,background:`${col.color}18`,color:col.color,fontSize:11,fontWeight:700,cursor:"pointer"}}>
              📋 Tümünü Gör ({allTasks.length})
            </button>
          )}
        </div>
      );})}
    </div>
    </div>

    {/* Kolon "Tümünü Gör" Modalı */}
    {columnModal && (()=>{
      const list = getAllColTasks(columnModal.colId);
      return (
        <Modal title={`${columnModal.label} — Tüm Görevler (${list.length})`} onClose={()=>setColumnModal(null)} width={560}>
          {columnModal.colId==="published" && <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>ℹ️ Tahtada son 30 günün paylaşımları gösterilir. Burada <strong style={{color:T.textPrimary}}>tüm zamanların</strong> paylaşımları tarihe göre gruplanır.</div>}
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:480,overflowY:"auto"}}>
            {list.length===0 ? <div style={{textAlign:"center",color:T.textMuted,padding:30}}>Görev yok</div>
              : columnModal.colId==="published"
                ? groupPublished(list).map(g=>(
                    <div key={g.key}>
                      <div style={{fontSize:11,fontWeight:700,color:T.textSecondary,margin:"6px 0 8px",paddingBottom:6,borderBottom:`1px solid ${T.border}`}}>{g.icon} {g.label} <span style={{color:T.textMuted,fontWeight:400}}>({g.items.length})</span></div>
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>{g.items.map(taskCardEl)}</div>
                    </div>
                  ))
                : list.map(taskCardEl)}
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
          <div style={{background:T.bgInput,borderRadius:8,padding:"12px"}}><div style={{fontSize:22,fontWeight:800,color:T.indigoText}}>{tasks.filter(t=>t.col==="inprogress"||t.col==="review").length}</div><div style={{fontSize:10,color:T.textMuted}}>DEVAM EDEN</div></div>
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
      <FormField label="İçerik Türü ve Adedi (kaç tane paylaşıldı?)">
        <div style={{fontSize:11,color:T.textMuted,marginBottom:8}}>Bir görevde birden fazla içerik olabilir. Her türden kaç adet paylaşıldıysa sayıyı girin.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[{k:"post",l:"📷 Post"},{k:"reels",l:"🎬 Reels"},{k:"carousel",l:"🖼️ Carousel"},{k:"story",l:"⭕ Hikaye"},{k:"video",l:"🎥 Video"}].map(ct=>{
            const counts = publishModal.counts||{};
            return (
              <div key={ct.k} style={{display:"flex",alignItems:"center",gap:8,background:T.bgInput,borderRadius:8,padding:"7px 10px"}}>
                <span style={{flex:1,fontSize:12,color:T.textPrimary}}>{ct.l}</span>
                <button type="button" onClick={()=>setPublishModal(m=>({...m,counts:{...(m.counts||{}),[ct.k]:Math.max(0,((m.counts||{})[ct.k]||0)-1)}}))} style={{width:24,height:24,borderRadius:6,border:`1px solid ${T.border}`,background:T.bgCard,color:T.textSecondary,cursor:"pointer",fontSize:14,fontWeight:700,padding:0}}>−</button>
                <span style={{minWidth:20,textAlign:"center",fontSize:14,fontWeight:700,color:(counts[ct.k]||0)>0?T.amberText:T.textMuted}}>{counts[ct.k]||0}</span>
                <button type="button" onClick={()=>setPublishModal(m=>({...m,counts:{...(m.counts||{}),[ct.k]:((m.counts||{})[ct.k]||0)+1}}))} style={{width:24,height:24,borderRadius:6,border:`1px solid ${T.border}`,background:T.bgCard,color:T.textSecondary,cursor:"pointer",fontSize:14,fontWeight:700,padding:0}}>+</button>
              </div>
            );
          })}
        </div>
        {(()=>{ const c=publishModal.counts||{}; const tot=Object.values(c).reduce((s,n)=>s+(n||0),0); return <div style={{marginTop:10,fontSize:12,fontWeight:600,color:tot>0?T.greenText:T.textMuted,textAlign:"right"}}>Toplam: {tot} paylaşım</div>; })()}
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
      <div style={{background:T.bgInput,borderRadius:10,padding:"12px 14px",marginBottom:4}}>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
          <input type="checkbox" checked={form.isExtraShoot||false} onChange={e=>setForm(f=>({...f,isExtraShoot:e.target.checked}))} style={{width:17,height:17,accentColor:"#EC4899",cursor:"pointer"}} />
          <span style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>📷 Bu bir ek çekim (belirli tarih)</span>
        </label>
        {form.isExtraShoot && (
          <div style={{marginTop:10}}>
            <div style={{fontSize:11,color:T.textMuted,marginBottom:5}}>Çekim tarihi — müşteri takvimine, genel takvime ve "bugün" listesine eklenir</div>
            <Input type="date" value={form.shootDate||""} onChange={e=>setForm(f=>({...f,shootDate:e.target.value}))} />
          </div>
        )}
      </div>
      <ModalActions onClose={()=>setModal(false)} onSave={async()=>{
        if(!form.title)return;
        const cid = clients.find(c=>c.name===form.client)?.id || null;
        const assignedAt = form.assignedTo ? new Date().toISOString() : null;
        const { data, error } = await supabase.from('tasks').insert({
          title: form.title, type: form.type||"Tasarım",
          priority: form.priority||"mid", due_date: form.due||"—", col: "todo",
          assigned_to: form.assignedTo || null, assigned_at: assignedAt, client_id: cid,
        }).select().single();
        if(error){ swalAlert("Görev eklenemedi: "+error.message+"\n\nYENI-OZELLIKLER-SQL kodunu çalıştırıp gerekli sütunları eklediğinizden emin olun."); return; }
        if(data){
          setTasks(prev=>[...prev,{id:data.id,title:data.title,client:form.client||"",clientId:cid,col:"todo",due:form.due,priority:form.priority||"mid",type:form.type||"Tasarım",assignedTo:form.assignedTo||null,assignedAt}]);
          // Ek çekim ise müşterinin ek çekimlerine ekle (her yere yansısın)
          if(form.isExtraShoot && form.shootDate && cid){
            const cl = clients.find(c=>c.id===cid);
            const newShoots = [...(cl?.extraShoots||[]), { date: form.shootDate, title: form.title, taskId: data.id }];
            await supabase.from('clients').update({ extra_shoots: newShoots }).eq('id', cid);
            if(refreshData) refreshData();
          }
        }
        setModal(false);
      }} />
    </Modal>}
  </div>;
}

// Haftalık çekim programı yazdırma
function printShootWeek(weekDays, wdNames, shoots, clients, staff, weekLabel, asPdf) {
  const cName = (id) => clients.find(c => c.id === id)?.name || "—";
  const sName = (id) => staff.find(s => s.id === id)?.name || "";
  const cellRows = weekDays.map((d, i) => {
    const list = shoots.filter(s => s.shoot_date === d.str).sort((a, b) => (a.shoot_time || "").localeCompare(b.shoot_time || ""));
    const items = list.length
      ? list.map(s => `<div class="it ${s.status === 'done' ? 'done' : ''}">
          ${s.shoot_time ? `<span class="tm">${s.shoot_time}</span>` : ""}
          <strong>${s.title}</strong><br>
          <span class="cl">${cName(s.client_id)}</span>
          ${s.assigned_to ? `<br><span class="st">👤 ${sName(s.assigned_to)}</span>` : ""}
          ${s.location ? `<br><span class="st">📍 ${s.location}</span>` : ""}
        </div>`).join("")
      : `<div class="empty">—</div>`;
    return `<td><div class="dh">${wdNames[i]}<br><span class="dn">${d.date.getDate()}.${String(d.date.getMonth() + 1).padStart(2, "0")}</span></div>${items}</td>`;
  }).join("");

  const total = weekDays.reduce((s, d) => s + shoots.filter(x => x.shoot_date === d.str).length, 0);

  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>Haftalık Çekim Programı</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;padding:0;color:#1a1a1a}
    .hero{background:linear-gradient(135deg,#1A2B3F,#3a2d6b);color:#fff;border-radius:12px;padding:16px 22px;margin-bottom:14px}
    .logo{font-size:16px;font-weight:700}.logo .m{color:#F8906E}
    .hero h1{font-size:19px;margin-top:7px;font-weight:800}
    .hero .p{font-size:12px;opacity:.85;margin-top:3px}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    td{border:1px solid #E2E5EA;vertical-align:top;padding:6px;width:14.28%}
    .dh{background:#1A2B3F;color:#fff;font-size:10px;font-weight:700;text-align:center;border-radius:5px;padding:5px 2px;margin-bottom:6px}
    .dh .dn{font-size:14px;font-weight:800}
    .it{background:#F5F6F8;border-left:3px solid #EC4899;border-radius:5px;padding:5px 7px;margin-bottom:5px;font-size:9.5px;line-height:1.4}
    .it.done{opacity:.55;border-left-color:#10B981}
    .it .tm{display:inline-block;background:#F25124;color:#fff;border-radius:4px;padding:1px 5px;font-size:8.5px;font-weight:700;margin-bottom:3px}
    .it .cl{color:#4a5568}
    .it .st{color:#8A8F98;font-size:9px}
    .empty{text-align:center;color:#c3c8d0;font-size:10px;padding:6px 0}
    .foot{margin-top:14px;font-size:9.5px;color:#8A8F98;text-align:center;border-top:1px solid #eee;padding-top:10px}
    .foot .co{color:#F25124;font-weight:700}
    @media print{body{padding:0}.hero,.dh,.it,.it .tm{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    @page{size:A4 landscape;margin:8mm}
  </style></head><body>
    <div class="hero">
      <div class="logo">panormos <span class="m">medya.</span></div>
      <h1>Haftalık Çekim Programı</h1>
      <div class="p">${weekLabel} · Toplam ${total} çekim</div>
    </div>
    <table><tr>${cellRows}</tr></table>
    <div class="foot"><span class="co">Panormos Medya</span> · panormosmedya.com</div>
  </body></html>`;

  if (asPdf) { downloadPdfFromHTML(html, `Haftalik-Cekim-Programi-${new Date().toISOString().slice(0,10)}.pdf`, "landscape"); return; }
  const w = window.open("", "_blank", "width=1200,height=820");
  if (!w) { swalAlert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 400);
}

// ─────────────────────────────────────────────
// ÇEKİM PLANLAMA (tüm çalışanlar kullanabilir)
// ─────────────────────────────────────────────
const SHOOT_REPEAT = [
  { v: "once", l: "Tek Seferlik" },
  { v: "daily", l: "Günlük" },
  { v: "weekly", l: "Haftalık" },
  { v: "monthly", l: "Aylık" },
];
const SHOOT_PRESETS = ["Menü Çekimi", "Ürün Çekimi", "Mekan Çekimi", "Video Çekimi", "Drone Çekimi", "Tanıtım Filmi", "Reels Çekimi"];

// ─────────────────────────────────────────────
// HAVA DURUMU (Open-Meteo — ücretsiz, API anahtarsız)
// ─────────────────────────────────────────────
const WEATHER_CITIES = [
  { name: "Bandırma", lat: 40.3517, lon: 27.9769 },
  { name: "Balıkesir", lat: 39.6484, lon: 27.8826 },
  { name: "Erdek", lat: 40.3967, lon: 27.7975 },
  { name: "Gönen", lat: 40.1050, lon: 27.6539 },
  { name: "İstanbul", lat: 41.0082, lon: 28.9784 },
  { name: "İzmir", lat: 38.4237, lon: 27.1428 },
  { name: "Bursa", lat: 40.1826, lon: 29.0665 },
  { name: "Çanakkale", lat: 40.1553, lon: 26.4142 },
  { name: "Ankara", lat: 39.9334, lon: 32.8597 },
  { name: "Antalya", lat: 36.8969, lon: 30.7133 },
];

// WMO hava kodu → etiket + ikon
function weatherInfo(code) {
  if (code === 0) return { icon: "☀️", label: "Açık / Güneşli" };
  if (code === 1) return { icon: "🌤️", label: "Az Bulutlu" };
  if (code === 2) return { icon: "⛅", label: "Parçalı Bulutlu" };
  if (code === 3) return { icon: "☁️", label: "Kapalı / Bulutlu" };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Sisli" };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Çisenti" };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Yağmurlu" };
  if (code >= 71 && code <= 77) return { icon: "❄️", label: "Karlı" };
  if (code >= 80 && code <= 82) return { icon: "🌧️", label: "Sağanak Yağış" };
  if (code >= 85 && code <= 86) return { icon: "🌨️", label: "Kar Sağanağı" };
  if (code >= 95) return { icon: "⛈️", label: "Gök Gürültülü Fırtına" };
  return { icon: "🌡️", label: "—" };
}

function WeatherWidget({ compact, mini }) {
  const [expanded, setExpanded] = useState(false); // mini modda: tek satır ↔ tam detay
  const [cityIdx, setCityIdx] = useState(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("weatherCity") : null;
    const i = WEATHER_CITIES.findIndex(c => c.name === saved);
    return i >= 0 ? i : 0;
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [selDay, setSelDay] = useState(0); // seçili gün indexi (0 = bugün)

  const city = WEATHER_CITIES[cityIdx];

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(false);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,precipitation_probability_max,sunrise,sunset,relative_humidity_2m_max&timezone=Europe%2FIstanbul&forecast_days=7`;
    fetch(url)
      .then(r => r.json())
      .then(j => { if (alive) { setData(j); setLoading(false); } })
      .catch(() => { if (alive) { setErr(true); setLoading(false); } });
    return () => { alive = false; };
  }, [cityIdx]);

  const changeCity = (i) => {
    setCityIdx(i);
    setSelDay(0);
    try { localStorage.setItem("weatherCity", WEATHER_CITIES[i].name); } catch (e) {}
  };

  const citySelect = (
    <select value={cityIdx} onChange={e => changeCity(parseInt(e.target.value))}
      style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 600, outline: "none", cursor: "pointer" }}>
      {WEATHER_CITIES.map((c, i) => <option key={i} value={i} style={{ color: "#1a1a1a" }}>{c.name}</option>)}
    </select>
  );

  const wrap = (children) => (
    <div style={{ background: "linear-gradient(135deg, #2563EB, #0EA5E9)", borderRadius: 14, padding: compact ? "14px 16px" : "18px 20px", color: "#fff", boxShadow: "0 4px 14px rgba(37,99,235,0.25)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9, textTransform: "uppercase", letterSpacing: "0.04em" }}>🌤️ Hava Durumu</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {citySelect}
          {mini && <button onClick={() => setExpanded(false)} style={miniBtnStyle}>Küçült ▴</button>}
        </div>
      </div>
      {children}
    </div>
  );

  const miniBtnStyle = { background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, padding: "5px 10px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };

  // Mini mod (Ana Sayfa): tek satırlık özet şerit; "Detay" ile tam görünüm açılır
  if (mini && !expanded) {
    const bar = (children, canExpand) => (
      <div style={{ background: "linear-gradient(135deg, #2563EB, #0EA5E9)", borderRadius: 12, padding: "8px 14px", color: "#fff", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {children}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {citySelect}
          {canExpand && <button onClick={() => setExpanded(true)} style={miniBtnStyle}>Detay ▾</button>}
        </div>
      </div>
    );
    if (loading) return bar(<div style={{ fontSize: 12.5, opacity: 0.85 }}>🌤️ Hava durumu yükleniyor...</div>, false);
    if (err || !data?.current) return bar(<div style={{ fontSize: 12.5, opacity: 0.85 }}>🌤️ Hava durumu alınamadı</div>, false);
    const c = data.current, dd = data.daily, info = weatherInfo(dd.weather_code[0]);
    return bar(
      <>
        <div style={{ fontSize: 24, lineHeight: 1 }}>{info.icon}</div>
        <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{Math.round(c.temperature_2m)}°</div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{info.label}</div>
        <div style={{ fontSize: 11.5, opacity: 0.92 }}>🔺 {Math.round(dd.temperature_2m_max[0])}° · 🔻 {Math.round(dd.temperature_2m_min[0])}° · 💨 {Math.round(c.wind_speed_10m)} km/s · 💧 %{c.relative_humidity_2m}</div>
      </>, true);
  }

  if (loading) return wrap(<div style={{ fontSize: 13, opacity: 0.85, padding: "10px 0" }}>Yükleniyor...</div>);
  if (err || !data?.current) return wrap(<div style={{ fontSize: 13, opacity: 0.85, padding: "10px 0" }}>Hava durumu alınamadı (internet?). Tekrar deneyin.</div>);

  const cur = data.current;
  const daily = data.daily;
  const TR_DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
  const TR_DAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
  const hm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const addMin = (iso, m) => { const d = new Date(new Date(iso).getTime() + m * 60000); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

  // Seçili günün bilgileri
  const dInfo = weatherInfo(daily.weather_code[selDay]);
  const isTodaySel = selDay === 0;
  const selDate = new Date(daily.time[selDay] + "T00:00:00");
  const dayTitle = isTodaySel ? "Bugün" : selDate.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
  const sr = daily.sunrise?.[selDay], ss = daily.sunset?.[selDay];
  // Şu an gösterilecek sıcaklık: bugünse anlık, değilse günün max'ı
  const bigTemp = isTodaySel ? Math.round(cur.temperature_2m) : Math.round(daily.temperature_2m_max[selDay]);

  return wrap(
    <>
      {/* Seçili günün büyük detayı */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.95, marginBottom: 8 }}>{dayTitle}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: compact ? 42 : 52, lineHeight: 1 }}>{dInfo.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: compact ? 30 : 38, fontWeight: 800, lineHeight: 1 }}>{bigTemp}°</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{dInfo.label}</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 11.5, opacity: 0.92, lineHeight: 1.7 }}>
            <div>🔺 Yük {Math.round(daily.temperature_2m_max[selDay])}° · 🔻 Düş {Math.round(daily.temperature_2m_min[selDay])}°</div>
            {isTodaySel && <div>🌡️ Hissedilen {Math.round(cur.apparent_temperature)}°</div>}
            <div>💨 Rüzgar {Math.round(isTodaySel ? cur.wind_speed_10m : daily.wind_speed_10m_max[selDay])} km/s</div>
            <div>💧 {isTodaySel ? `Nem %${cur.relative_humidity_2m}` : `Yağış %${daily.precipitation_probability_max[selDay] || 0}`}</div>
          </div>
        </div>
      </div>

      {/* Gün doğumu / batımı / altın saat */}
      {sr && ss && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          <div style={{ background: "rgba(255,255,255,0.14)", borderRadius: 10, padding: "9px 12px" }}>
            <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 600 }}>🌅 Gün Doğumu · {hm(sr)}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>✨ Altın Saat</div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{hm(sr)} – {addMin(sr, 60)}</div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.14)", borderRadius: 10, padding: "9px 12px" }}>
            <div style={{ fontSize: 11, opacity: 0.9, fontWeight: 600 }}>🌇 Gün Batımı · {hm(ss)}</div>
            <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>✨ Altın Saat</div>
            <div style={{ fontSize: 12, fontWeight: 800 }}>{addMin(ss, -60)} – {hm(ss)}</div>
          </div>
        </div>
      )}

      {/* 7 günlük şerit — tıklanabilir */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 10 }}>
        <div style={{ fontSize: 10, opacity: 0.75, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em" }}>7 Günlük Tahmin · güne tıkla</div>
        <div style={{ display: "flex", gap: 5, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 2 }}>
          {daily.time.map((t, i) => {
            const di = weatherInfo(daily.weather_code[i]);
            const d = new Date(t + "T00:00:00");
            const active = i === selDay;
            return (
              <button key={i} onClick={() => setSelDay(i)} style={{
                flex: "1 0 auto", minWidth: 52, textAlign: "center", borderRadius: 10, padding: "8px 4px", cursor: "pointer",
                background: active ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.06)",
                border: active ? "1px solid rgba(255,255,255,0.6)" : "1px solid transparent", color: "#fff",
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.95 }}>{i === 0 ? "Bugün" : TR_DAYS_SHORT[d.getDay()]}</div>
                <div style={{ fontSize: 20, margin: "4px 0" }}>{di.icon}</div>
                <div style={{ fontSize: 11, fontWeight: 800 }}>{Math.round(daily.temperature_2m_max[i])}°</div>
                <div style={{ fontSize: 9.5, opacity: 0.72 }}>{Math.round(daily.temperature_2m_min[i])}°</div>
                {daily.precipitation_probability_max[i] > 20 && <div style={{ fontSize: 8.5, opacity: 0.9, marginTop: 2 }}>💧{daily.precipitation_probability_max[i]}%</div>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function ShootsPage({ clients, staff, currentStaff, refreshData }) {
  const [shoots, setShoots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [view, setView] = useState("week");      // "week" | "list"
  const [weekOffset, setWeekOffset] = useState(0);

  const load = async () => {
    const { data } = await supabase.from('shoots').select('*').order('shoot_date', { ascending: true });
    setShoots(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const todayStr = new Date().toISOString().slice(0, 10);

  const openAdd = (presetDate) => {
    setForm({ client_id: "", title: "", shoot_date: presetDate || todayStr, shoot_time: "10:00", location: "", assigned_to: currentStaff?.id || "", repeat_type: "once", repeat_count: 4, note: "" });
    setModal(true);
  };
  const openEdit = (s) => {
    setForm({ id: s.id, client_id: s.client_id || "", title: s.title || "", shoot_date: s.shoot_date || "", shoot_time: s.shoot_time || "", location: s.location || "", assigned_to: s.assigned_to || "", repeat_type: "once", note: s.note || "", status: s.status || "planned" });
    setModal(true);
  };

  // Tekrarlı çekimler için tarih listesi üret
  const buildDates = (startStr, type, count) => {
    const list = [startStr];
    if (type === "once") return list;
    const n = Math.min(Math.max(parseInt(count) || 1, 1), 24);
    const base = new Date(startStr + "T00:00:00");
    for (let i = 1; i < n; i++) {
      const d = new Date(base);
      if (type === "daily") d.setDate(base.getDate() + i);
      else if (type === "weekly") d.setDate(base.getDate() + i * 7);
      else if (type === "monthly") d.setMonth(base.getMonth() + i);
      list.push(d.toISOString().slice(0, 10));
    }
    return list;
  };

  const save = async () => {
    if (!form.client_id) { swalAlert("Lütfen müşteri seçin"); return; }
    if (!form.title) { swalAlert("Lütfen çekim adı girin veya hazır olanlardan seçin"); return; }
    if (!form.shoot_date) { swalAlert("Lütfen tarih seçin"); return; }
    setSaving(true);
    // Düzenleme: tek kaydı güncelle
    if (form.id) {
      const { error } = await supabase.from('shoots').update({
        client_id: form.client_id, title: form.title, shoot_date: form.shoot_date, shoot_time: form.shoot_time || "",
        location: form.location || "", assigned_to: form.assigned_to || null, note: form.note || "", status: form.status || "planned",
      }).eq('id', form.id);
      setSaving(false);
      if (error) { swalAlert("Güncellenemedi: " + error.message); return; }
      setModal(false); setForm({}); load();
      if (refreshData) refreshData();
      return;
    }
    const dates = buildDates(form.shoot_date, form.repeat_type, form.repeat_count);
    const rows = dates.map(d => ({
      client_id: form.client_id, title: form.title, shoot_date: d, shoot_time: form.shoot_time || "",
      location: form.location || "", assigned_to: form.assigned_to || null, repeat_type: form.repeat_type || "once",
      note: form.note || "", status: "planned", created_by: currentStaff?.name || "",
    }));
    const { error } = await supabase.from('shoots').insert(rows);
    setSaving(false);
    if (error) { swalAlert("Çekim kaydedilemedi: " + error.message + "\n\nCEKIM-PLANLAMA-SQL kodunu Supabase'de çalıştırın."); return; }
    setModal(false); setForm({});
    load();
    if (refreshData) refreshData();
  };

  const toggleDone = async (s) => {
    const ns = s.status === "done" ? "planned" : "done";
    await supabase.from('shoots').update({ status: ns }).eq('id', s.id);
    load();
  };
  const del = async (id) => {
    if (!await swalConfirm("Bu çekim silinsin mi?")) return;
    await supabase.from('shoots').delete().eq('id', id);
    load(); if (refreshData) refreshData();
  };

  const clientName = (id) => clients.find(c => c.id === id)?.name || "—";
  const clientOf = (id) => clients.find(c => c.id === id);
  const staffName = (id) => staff.find(s => s.id === id)?.name || "";

  // Filtrele + grupla
  const filtered = shoots.filter(s => {
    if (!showPast && s.shoot_date < todayStr && s.status !== "planned") return false;
    if (!showPast && s.shoot_date < todayStr) return false;
    if (!q) return true;
    const term = q.toLocaleLowerCase("tr-TR");
    return (s.title || "").toLocaleLowerCase("tr-TR").includes(term) || clientName(s.client_id).toLocaleLowerCase("tr-TR").includes(term);
  });

  const dayLabel = (dStr) => {
    const d = new Date(dStr + "T00:00:00"); const n = new Date();
    const diff = Math.round((d - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
    if (diff === 0) return "🔥 Bugün";
    if (diff === 1) return "☀️ Yarın";
    if (diff < 0) return "🗄️ Geçmiş";
    if (diff <= 7) return "📆 Bu Hafta";
    if (diff <= 30) return "🗓️ Bu Ay";
    return "📁 Sonraki";
  };
  const groups = {};
  filtered.forEach(s => { const g = dayLabel(s.shoot_date); (groups[g] = groups[g] || []).push(s); });
  const order = ["🗄️ Geçmiş", "🔥 Bugün", "☀️ Yarın", "📆 Bu Hafta", "🗓️ Bu Ay", "📁 Sonraki"];

  const todayCount = shoots.filter(s => s.shoot_date === todayStr && s.status === "planned").length;
  const weekCount = shoots.filter(s => { const d = new Date(s.shoot_date + "T00:00:00"); const n = new Date(); const diff = Math.round((d - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000); return diff >= 0 && diff <= 7 && s.status === "planned"; }).length;

  // ── Haftalık takvim ──
  const weekDays = (() => {
    const n = new Date();
    const wd = (n.getDay() + 6) % 7; // Pazartesi = 0
    const monday = new Date(n.getFullYear(), n.getMonth(), n.getDate() - wd + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      return { date: d, str: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` };
    });
  })();
  const WD_NAMES = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
  const shootsOfDay = (dStr) => shoots.filter(s => s.shoot_date === dStr).sort((a, b) => (a.shoot_time || "").localeCompare(b.shoot_time || ""));
  const weekLabel = `${weekDays[0].date.toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} – ${weekDays[6].date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}`;
  const weekTotal = weekDays.reduce((s, d) => s + shootsOfDay(d.str).length, 0);

  return (
    <div>
      <div style={{ marginBottom: 18 }}><WeatherWidget compact /></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 18 }}>
        <StatCard label="Bugünkü Çekim" value={todayCount} color={todayCount > 0 ? T.amberText : undefined} />
        <StatCard label="Bu Hafta" value={weekCount} color={T.indigoText} />
        <StatCard label="Toplam Planlı" value={shoots.filter(s => s.status === "planned").length} />
      </div>

      {/* Görünüm seçici */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, background: T.bgInput, borderRadius: 10, padding: 4 }}>
          {[{ v: "week", l: "🗓️ Haftalık Takvim" }, { v: "list", l: "📋 Liste" }].map(o => (
            <button key={o.v} onClick={() => setView(o.v)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: view === o.v ? T.bgCard : "transparent", color: view === o.v ? T.textPrimary : T.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {view === "week" && <Btn onClick={() => printShootWeek(weekDays, WD_NAMES, shoots, clients, staff, weekLabel)} style={{ fontSize: 12 }}>🖨️ Yazdır</Btn>}
        {view === "week" && <Btn onClick={() => printShootWeek(weekDays, WD_NAMES, shoots, clients, staff, weekLabel, true)} style={{ fontSize: 12 }}>📥 PDF İndir</Btn>}
        <Btn variant="primary" onClick={() => openAdd()}>+ Yeni Çekim</Btn>
      </div>

      {/* HAFTALIK TAKVİM */}
      {view === "week" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
            <Btn onClick={() => setWeekOffset(w => w - 1)} style={{ fontSize: 12 }}>◀ Önceki Hafta</Btn>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary }}>{weekLabel}</div>
              <div style={{ fontSize: 11, color: T.textMuted }}>{weekTotal} çekim{weekOffset === 0 ? " · bu hafta" : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {weekOffset !== 0 && <Btn onClick={() => setWeekOffset(0)} style={{ fontSize: 12 }}>Bugün</Btn>}
              <Btn onClick={() => setWeekOffset(w => w + 1)} style={{ fontSize: 12 }}>Sonraki Hafta ▶</Btn>
            </div>
          </div>

          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 6 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(150px,1fr))", gap: 8, minWidth: 7 * 150 + 50 }}>
              {weekDays.map((d, i) => {
                const list = shootsOfDay(d.str);
                const isToday = d.str === todayStr;
                return (
                  <div key={i} style={{ background: isToday ? "rgba(236,72,153,0.08)" : T.bgCard, border: `1px solid ${isToday ? "#EC489966" : T.border}`, borderRadius: 12, padding: 10, minHeight: 170, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ paddingBottom: 8, borderBottom: `1px solid ${T.border}`, marginBottom: 2 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isToday ? T.pinkText : T.textSecondary }}>{WD_NAMES[i]}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? T.pinkText : T.textPrimary }}>{d.date.getDate()}</div>
                    </div>
                    {list.length === 0 && <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", padding: "10px 0" }}>—</div>}
                    {list.map(s => {
                      const cli = clientOf(s.client_id);
                      const done = s.status === "done";
                      return (
                        <div key={s.id} style={{ background: T.bgInput, borderRadius: 8, padding: "7px 9px", borderLeft: `3px solid ${done ? T.green : (cli?.accentColor || "#EC4899")}`, opacity: done ? 0.65 : 1, position: "relative" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                            <button onClick={(e) => { e.stopPropagation(); toggleDone(s); }} title={done ? "Planlıya al" : "Tamamlandı işaretle"} style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 5, border: `2px solid ${done ? T.green : T.borderLight}`, background: done ? T.green : "transparent", color: "#fff", cursor: "pointer", fontSize: 10, padding: 0, marginTop: 1 }}>{done ? "✓" : ""}</button>
                            <div onClick={() => openEdit(s)} title="Düzenlemek için tıkla" style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                              {s.shoot_time && <div style={{ fontSize: 10, fontWeight: 700, color: done ? T.green : T.amberText }}>🕐 {s.shoot_time}</div>}
                              <div style={{ fontSize: 11.5, fontWeight: 600, color: T.textPrimary, textDecoration: done ? "line-through" : "none" }}>{s.title}</div>
                              <div style={{ fontSize: 10, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clientName(s.client_id)}</div>
                              {s.assigned_to && <div style={{ fontSize: 9, color: T.textMuted, marginTop: 2 }}>👤 {staffName(s.assigned_to)}</div>}
                              {done && <div style={{ fontSize: 9, color: T.green, fontWeight: 700, marginTop: 2 }}>✓ Çekildi</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => openAdd(d.str)} style={{ marginTop: "auto", padding: "6px", borderRadius: 8, border: `1px dashed ${T.borderLight}`, background: "transparent", color: T.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ Ekle</button>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>💡 Çekime tıklayarak düzenleyebilirsin. Gün altındaki "+ Ekle" ile o güne hızlı çekim ekle.</div>
        </div>
      )}

      {/* LİSTE GÖRÜNÜMÜ */}
      {view === "list" && <>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input placeholder="🔍 Çekim veya müşteri ara..." value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 180, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13, color: T.textPrimary, outline: "none" }} />
        <Btn onClick={() => setShowPast(v => !v)} style={{ fontSize: 12 }}>{showPast ? "Geçmişi Gizle" : "Geçmişi Göster"}</Btn>
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Yükleniyor...</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: T.textMuted, padding: 50 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
            <div style={{ fontSize: 14, color: T.textPrimary, fontWeight: 600 }}>Planlı çekim yok</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>"+ Yeni Çekim" ile müşteri seçip çekim planlayın.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {order.filter(g => groups[g]).map(g => (
              <div key={g}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textSecondary, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>{g} <span style={{ color: T.textMuted, fontWeight: 400 }}>({groups[g].length})</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {groups[g].map(s => {
                    const cli = clientOf(s.client_id);
                    const done = s.status === "done";
                    return (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, borderLeft: `3px solid ${done ? T.green : (cli?.accentColor || "#EC4899")}`, opacity: done ? 0.65 : 1 }}>
                        <button onClick={() => toggleDone(s)} title={done ? "Planlıya al" : "Tamamlandı yap"} style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: `2px solid ${done ? T.green : T.borderLight}`, background: done ? T.green : "transparent", color: "#fff", cursor: "pointer", fontSize: 12, padding: 0 }}>{done ? "✓" : ""}</button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, textDecoration: done ? "line-through" : "none" }}>📷 {s.title}</div>
                          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                            {clientName(s.client_id)} · {new Date(s.shoot_date + "T00:00:00").toLocaleDateString("tr-TR")}{s.shoot_time ? ` · 🕐 ${s.shoot_time}` : ""}
                            {s.location ? ` · 📍 ${s.location}` : ""}
                            {s.assigned_to ? ` · 👤 ${staffName(s.assigned_to)}` : ""}
                          </div>
                          {s.note && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3, fontStyle: "italic" }}>📝 {s.note}</div>}
                        </div>
                        {cli?.phone && <a href={`https://wa.me/${(cli.phone || "").replace(/\D/g, "").replace(/^0/, "90")}`} target="_blank" rel="noopener" style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#25D366", padding: "5px 10px", borderRadius: 6, textDecoration: "none" }}>WhatsApp</a>}
                        <button onClick={() => openEdit(s)} style={{ background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 14 }}>✏️</button>
                        <button onClick={() => del(s.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 15 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </>}

      {modal && (
        <Modal title={form.id ? "✏️ Çekimi Düzenle" : "📷 Yeni Çekim Planla"} onClose={() => setModal(false)} width={540}>
          <FormField label="Müşteri">
            <Select value={form.client_id || ""} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
              <option value="">Seç...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </FormField>

          <FormField label="Çekim Türü (hazır seçenekler)">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SHOOT_PRESETS.map(p => (
                <button key={p} type="button" onClick={() => setForm(f => ({ ...f, title: p }))} style={{ padding: "6px 12px", borderRadius: 100, border: `1px solid ${form.title === p ? T.indigo : T.border}`, background: form.title === p ? T.indigoDim : T.bgInput, color: form.title === p ? T.indigoText : T.textSecondary, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>{p}</button>
              ))}
            </div>
          </FormField>
          <FormField label="Çekim Adı"><Input placeholder="Örn: Menü Çekimi" value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FormField>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="📅 Tarih"><Input type="date" value={form.shoot_date || ""} onChange={e => setForm(f => ({ ...f, shoot_date: e.target.value }))} /></FormField>
            <FormField label="🕐 Saat"><Input type="time" value={form.shoot_time || ""} onChange={e => setForm(f => ({ ...f, shoot_time: e.target.value }))} /></FormField>
          </div>

          {!form.id && <FormField label="🔁 Tekrar">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {SHOOT_REPEAT.map(r => (
                <button key={r.v} type="button" onClick={() => setForm(f => ({ ...f, repeat_type: r.v }))} style={{ flex: 1, minWidth: 90, padding: "9px", borderRadius: 8, border: `1px solid ${(form.repeat_type || "once") === r.v ? T.indigo : T.border}`, background: (form.repeat_type || "once") === r.v ? T.indigoDim : T.bgInput, color: (form.repeat_type || "once") === r.v ? T.indigoText : T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{r.l}</button>
              ))}
            </div>
          </FormField>}
          {!form.id && form.repeat_type && form.repeat_type !== "once" && (
            <FormField label="Kaç kez tekrarlansın? (en fazla 24)">
              <Input type="number" min="1" max="24" value={form.repeat_count ?? 4} onChange={e => setForm(f => ({ ...f, repeat_count: e.target.value }))} />
            </FormField>
          )}

          <FormField label="📍 Yer (isteğe bağlı)"><Input placeholder="Örn: İşletme adresi" value={form.location || ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></FormField>
          <FormField label="👤 Sorumlu Çalışan">
            <Select value={form.assigned_to || ""} onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
              <option value="">Seç...</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </FormField>
          <FormField label="📝 Not (isteğe bağlı)"><Input placeholder="Özel istekler, ekipman notu..." value={form.note || ""} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></FormField>
          {form.id && (
            <FormField label="Durum">
              <div style={{ display: "flex", gap: 8 }}>
                {[{ v: "planned", l: "📷 Planlandı" }, { v: "done", l: "✓ Çekildi (Tamamlandı)" }].map(o => (
                  <button key={o.v} type="button" onClick={() => setForm(f => ({ ...f, status: o.v }))} style={{ flex: 1, padding: "9px", borderRadius: 8, border: `1px solid ${(form.status || "planned") === o.v ? (o.v === "done" ? T.green : T.indigo) : T.border}`, background: (form.status || "planned") === o.v ? (o.v === "done" ? T.greenDim : T.indigoDim) : T.bgInput, color: (form.status || "planned") === o.v ? (o.v === "done" ? T.greenText : T.indigoText) : T.textSecondary, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{o.l}</button>
                ))}
              </div>
            </FormField>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Kaydediliyor..." : (form.id ? "💾 Güncelle" : "📷 Çekimi Planla")}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
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
    if (!form.client_id || !form.month_ref) { swalAlert("Müşteri ve ay zorunlu"); return; }
    setSaving(true);
    const payload = { client_id: form.client_id, month_ref: form.month_ref, notes: form.notes || "" };
    REPORT_METRICS.forEach(m => { payload[m.key] = parseInt(form[m.key]) || 0; });
    // Aynı müşteri+ay varsa güncelle, yoksa ekle
    const existing = reports.find(r => r.client_id === form.client_id && r.month_ref === form.month_ref);
    let error;
    if (existing) { ({ error } = await supabase.from('social_reports').update(payload).eq('id', existing.id)); }
    else { ({ error } = await supabase.from('social_reports').insert(payload)); }
    setSaving(false);
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nRAPORLAMA-SQL kodunu çalıştırın."); return; }
    setModal(false); setForm({}); load();
  };

  const del = async (id) => { if (!await swalConfirm("Bu rapor silinsin mi?")) return; await supabase.from('social_reports').delete().eq('id', id); load(); };

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
            {f.link && <a {...storedFileLink(f.link)} target="_blank" rel="noopener noreferrer" style={{fontSize:11,fontWeight:600,padding:"6px 14px",borderRadius:8,background:T.amber,color:"#fff",textDecoration:"none",whiteSpace:"nowrap"}}>Aç ↗</a>}
          </div>
        ))}
      </div>
    )}
  </div>;
}

// ─────────────────────────────────────────────
// CALENDAR PAGE
// ─────────────────────────────────────────────
function CalendarPage({clients, staff, setPage}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(null); // Tıklanan günün tarihi (YYYY-MM-DD)
  const [shoots, setShoots] = useState([]);

  // Takvim, Çekimler sayfasındaki planlı çekimleri gösterir (müşteri paylaşım günlerinden bağımsız)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('shoots').select('*').order('shoot_date', { ascending: true });
      setShoots((data || []).filter(s => s.status !== "cancelled"));
    })();
  }, []);

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
  const WD_NAMES = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi","Pazar"];
  const dateStrOf = (day) => `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  const weekdayOf = (dStr) => (new Date(dStr + "T00:00:00").getDay() + 6) % 7; // Pazartesi = 0

  const clientOf = (id) => clients.find(c => c.id === id);
  const staffName = (id) => (staff || []).find(s => s.id === id)?.name || "";
  const shootsOfDay = (dStr) => shoots.filter(s => s.shoot_date === dStr).sort((a, b) => (a.shoot_time || "").localeCompare(b.shoot_time || ""));
  // Görevlerden eklenen ek çekimler (Çekimler sayfasında kaydı olmayanlar)
  const taskShootsOfDay = (dStr) => clients.flatMap(c => (c.extraShoots || []).filter(s => s.date === dStr && !s.shootId).map(s => ({ client: c, title: s.title })));

  const selShoots = selectedDate ? shootsOfDay(selectedDate) : [];
  const selTaskShoots = selectedDate ? taskShootsOfDay(selectedDate) : [];
  const selTitle = selectedDate ? `${parseInt(selectedDate.slice(8))} ${TR_MONTHS[viewMonth]} ${viewYear} — ${WD_NAMES[weekdayOf(selectedDate)]}` : "";
  const shootRow = (s) => ({ "Saat": s.shoot_time || "—", "Müşteri": clientOf(s.client_id)?.name || "—", "Çekim": s.title || "—", "Konum": s.location || "—", "Sorumlu": staffName(s.assigned_to) || "—", "Durum": s.status === "done" ? "Tamamlandı" : "Planlı" });
  const taskShootRow = (x) => ({ "Saat": "—", "Müşteri": x.client.name, "Çekim": x.title || "Ek çekim", "Konum": "—", "Sorumlu": "—", "Durum": "Görevden" });

  return <div>
    <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <button onClick={goPrevMonth} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>‹</button>
      <span style={{fontSize:15,fontWeight:600,color:T.textPrimary,flex:1}}>{TR_MONTHS[viewMonth]} {viewYear}</span>
      <button onClick={goToday} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.amberText,cursor:"pointer",fontSize:11,fontWeight:600}}>Bugün</button>
      <button onClick={()=>{
        const daysInMonth = new Date(viewYear, viewMonth+1, 0).getDate();
        const rows = [];
        for (let d = 1; d <= daysInMonth; d++) {
          const dStr = dateStrOf(d);
          const head = { "Tarih": `${d} ${TR_MONTHS[viewMonth]} ${viewYear}`, "Gün": WD_NAMES[weekdayOf(dStr)] };
          shootsOfDay(dStr).forEach(s => rows.push({ ...head, ...shootRow(s) }));
          taskShootsOfDay(dStr).forEach(x => rows.push({ ...head, ...taskShootRow(x) }));
        }
        if (rows.length === 0) { swalAlert("Bu ayda planlanmış çekim yok"); return; }
        printData(`Çekim Takvimi - ${TR_MONTHS[viewMonth]} ${viewYear}`, rows);
      }} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:11,fontWeight:600}}>🖨️ Yazdır</button>
      {setPage && <button onClick={()=>setPage("shoots")} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:11,fontWeight:600}}>📷 Çekimleri Yönet</button>}
      <div style={{display:"flex",gap:12}}>
        {[{l:"Çekim",c:T.pinkText},{l:"Tamamlandı",c:T.greenText},{l:"Görevden",c:T.purpleText}].map(l=>(
          <div key={l.l} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.textSecondary}}><div style={{width:8,height:8,borderRadius:2,background:l.c}}/>{l.l}</div>
        ))}
      </div>
      <button onClick={goNextMonth} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 12px",color:T.textSecondary,cursor:"pointer",fontSize:14}}>›</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
      {["Pzt","Sal","Çar","Per","Cum","Cmt","Paz"].map(d=><div key={d} style={{fontSize:11,color:T.textMuted,textAlign:"center",padding:"4px 0",fontWeight:600,letterSpacing:"0.04em"}}>{d}</div>)}
      {cells.map((cell,i)=>{
        const isToday = isRealToday(cell.day, cell.currentMonth);
        const dateStr = cell.currentMonth ? dateStrOf(cell.day) : "";
        const dayShoots = cell.currentMonth ? shootsOfDay(dateStr) : [];
        const dayTaskShoots = cell.currentMonth ? taskShootsOfDay(dateStr) : [];
        const total = dayShoots.length + dayTaskShoots.length;
        return <div key={i} onClick={()=>{ if(cell.currentMonth) setSelectedDate(dateStr); }} style={{
          minHeight:90,
          background:isToday?T.indigoGlow:T.bgCard,
          border:`1px solid ${isToday?(T.indigo+"88"):T.border}`,
          borderRadius:10, padding:"6px 7px",
          opacity: cell.currentMonth ? 1 : 0.35,
          cursor: cell.currentMonth ? "pointer" : "default",
          transition:"all 0.12s",
        }}
        onMouseEnter={e=>{ if(cell.currentMonth) e.currentTarget.style.borderColor=T.borderLight; }}
        onMouseLeave={e=>{ if(cell.currentMonth) e.currentTarget.style.borderColor=isToday?(T.indigo+"88"):T.border; }}>
          <div style={{fontSize:12,fontWeight:isToday?700:400,color:isToday?T.indigoText:T.textSecondary,marginBottom:5}}>{cell.day}</div>
          {dayShoots.slice(0,3).map(s=>{
            const done = s.status === "done";
            return <div key={s.id} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:done?"rgba(16,185,129,0.16)":"rgba(236,72,153,0.16)",color:done?T.greenText:T.pinkText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid ${clientOf(s.client_id)?.accentColor||"#EC4899"}`,fontWeight:600}}>{done?"✓ ":"📷 "}{s.shoot_time?s.shoot_time+" ":""}{clientOf(s.client_id)?.name||s.title}</div>;
          })}
          {dayTaskShoots.slice(0,Math.max(0,3-dayShoots.length)).map((x,xi)=>(
            <div key={"t"+xi} style={{fontSize:9,padding:"2px 5px",borderRadius:3,marginBottom:2,background:"rgba(168,85,247,0.2)",color:T.purpleText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",borderLeft:`2px solid #A855F7`,fontWeight:600}}>📸 {x.client.name}</div>
          ))}
          {total>3 && <div style={{fontSize:9,color:T.textMuted}}>+{total-3}</div>}
        </div>;
      })}
    </div>

    {/* Gün Detay Modalı */}
    {selectedDate && (
      <Modal title={selTitle} onClose={()=>setSelectedDate(null)} width={560}>
        {selShoots.length === 0 && selTaskShoots.length === 0 ? (
          <div style={{textAlign:"center",color:T.textMuted,fontSize:13,padding:"30px 0"}}>Bu gün için planlanmış çekim yok 📭</div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {selShoots.length > 0 && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:T.pinkText,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>📷 Çekimler ({selShoots.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {selShoots.map(s=>{
                    const c = clientOf(s.client_id);
                    const done = s.status === "done";
                    return (
                      <div key={s.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:done?"rgba(16,185,129,0.1)":"rgba(236,72,153,0.1)",borderRadius:10,borderLeft:`3px solid ${c?.accentColor||"#EC4899"}`}}>
                        <div style={{width:38,height:38,borderRadius:"50%",background:c?.accentColor||"#EC4899",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>{c?.initials||"📷"}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{c?.name||"—"}</div>
                          <div style={{fontSize:11,color:T.textMuted}}>{[s.title, s.location && "📍 "+s.location, staffName(s.assigned_to) && "👤 "+staffName(s.assigned_to)].filter(Boolean).join(" · ")}</div>
                          {s.note && <div style={{fontSize:11,color:T.textSecondary,marginTop:3}}>{s.note}</div>}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                          {s.shoot_time && <span style={{fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,background:T.amberDim,color:T.amberText}}>🕐 {s.shoot_time}</span>}
                          {done && <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:6,background:T.greenDim,color:T.greenText}}>✓ Tamamlandı</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Görevlerden eklenen ek çekimler */}
            {selTaskShoots.length > 0 && (
              <div>
                <div style={{fontSize:12,fontWeight:700,color:T.purpleText,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.04em"}}>📸 Görevden Ek Çekim ({selTaskShoots.length})</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {selTaskShoots.map((x,xi)=>(
                    <div key={xi} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"rgba(168,85,247,0.12)",borderRadius:10,borderLeft:`3px solid #A855F7`}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:x.client.accentColor,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff",flexShrink:0}}>{x.client.initials}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600,color:T.textPrimary}}>{x.client.name}</div>
                        <div style={{fontSize:11,color:T.textMuted}}>{x.title || "Ek çekim"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}>
          {(selShoots.length > 0 || selTaskShoots.length > 0) && <Btn onClick={()=>printData(`${selTitle} Çekim Planı`, [...selShoots.map(shootRow), ...selTaskShoots.map(taskShootRow)])} style={{fontSize:12,padding:"7px 14px"}}>🖨️ Bu Günü Yazdır</Btn>}
          {setPage && <Btn variant="primary" onClick={()=>setPage("shoots")} style={{fontSize:12,padding:"7px 14px"}}>📷 Çekimler Sayfasına Git</Btn>}
        </div>
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
      swalAlert("Lütfen isim ve pozisyon seçin");
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
      swalAlert("HATA: Çalışan eklenemedi!\n\n" + error.message + "\n\nSupabase'de yetki sütunları eksik olabilir. SQL kodunu çalıştırın.");
      return;
    }

    if (data) {
      // Giriş hesabı oluştur (email + şifre verildiyse)
      if (form.email && form.password) {
        if (form.password.length < 6) {
          swalAlert("Çalışan eklendi ancak GİRİŞ HESABI oluşturulamadı: Şifre en az 6 karakter olmalı. Düzenle'den şifre belirleyebilirsiniz.");
        } else {
          const { data: rpcData, error: rpcError } = await supabase.rpc('create_staff_login', { staff_email: form.email, staff_password: form.password });
          if (rpcError) {
            swalAlert("Çalışan eklendi ANCAK giriş hesabı oluşturulamadı:\n\n" + rpcError.message + "\n\nCALISAN-SIFRE-SQL kodunu Supabase'de çalıştırdığınızdan emin olun. Sonra 'Düzenle'den şifre verebilirsiniz.");
          } else {
            swalAlert("✅ Çalışan eklendi ve giriş hesabı oluşturuldu!\n\nÇalışana şu bilgileri verin:\nE-posta: " + form.email + "\nŞifre: " + form.password + "\n\nÇalışan 'Giriş Yap' ile bu bilgilerle girebilir.");
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
      swalAlert("Lütfen isim ve pozisyon girin");
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
      swalAlert("HATA: Çalışan güncellenemedi!\n\n" + error.message);
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
      swalAlert("Lütfen ayrılış nedenini ve tarihini seçin");
      return;
    }
    if (!await swalConfirm("Bu çalışan ayrıldı olarak işaretlenecek (ayrılan çalışanlar listesine taşınır).\n\nOnaylıyor musunuz?")) return;

    const { error } = await supabase.from('staff').update({
      deleted_at: new Date().toISOString(),
      departure_reason: departureModal.reason,
      departure_date: departureModal.date,
    }).eq('id', departureModal.staffId);

    if (error) {
      swalAlert("HATA: Çalışan ayrılış işlemi yapılamadı!\n\n" + error.message + "\n\nSupabase'de gerekli sütunlar eksik olabilir. SQL kodunu çalıştırdığınızdan emin olun.");
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
        <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Bu çalışanın neleri görebileceğini seç. Muhasebe, E-posta ve şirket gelir/gider/kâr bilgilerini yalnızca Yönetici görür.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <PermToggle label="👑 Yönetici (her şeyi görür ve yönetir)" checked={form.is_admin} onChange={()=>setForm(f=>({...f,is_admin:!f.is_admin}))} />
          {!form.is_admin && <>
            <PermToggle label="💰 Müşteri Ücretleri (aylık paket, müşteri faturaları)" checked={form.perm_finance} onChange={()=>setForm(f=>({...f,perm_finance:!f.perm_finance}))} />
            <PermToggle label="🏢 Müşteri Yönetimi (ekleme, silme)" checked={form.perm_manage_clients} onChange={()=>setForm(f=>({...f,perm_manage_clients:!f.perm_manage_clients}))} />
            <PermToggle label="👥 Çalışan Yönetimi (ekleme, silme, yetki)" checked={form.perm_manage_staff} onChange={()=>setForm(f=>({...f,perm_manage_staff:!f.perm_manage_staff}))} />
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
            if(!editForm.email){ swalAlert("Önce e-posta girin"); return; }
            if(!editForm.newPassword || editForm.newPassword.length<6){ swalAlert("Şifre en az 6 karakter olmalı"); return; }
            const { error } = await supabase.rpc('create_staff_login', { staff_email: editForm.email, staff_password: editForm.newPassword });
            if(error){ swalAlert("Şifre ayarlanamadı:\n\n"+error.message+"\n\nCALISAN-SIFRE-SQL kodunu çalıştırın."); return; }
            swalAlert("✅ Şifre ayarlandı!\n\nÇalışana verin:\nE-posta: "+editForm.email+"\nŞifre: "+editForm.newPassword);
            setEditForm(f=>({...f,newPassword:""}));
          }} style={{fontSize:12,padding:"0 14px",whiteSpace:"nowrap",flexShrink:0}}>Şifreyi Ayarla</Btn>
        </div>
      </FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={editForm.phone||""} onChange={e=>setEditForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Başlangıç Tarihi"><Input type="date" value={editForm.startDate||""} onChange={e=>setEditForm(f=>({...f,startDate:e.target.value}))} /></FormField>

      <div style={{marginTop:16,marginBottom:12,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
        <div style={{fontSize:11,color:T.amberText,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.04em",marginBottom:4}}>🔐 Yetkiler</div>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:12}}>Bu çalışanın neleri görebileceğini seç. Muhasebe, E-posta ve şirket gelir/gider/kâr bilgilerini yalnızca Yönetici görür.</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <PermToggle label="👑 Yönetici (her şeyi görür ve yönetir)" checked={editForm.is_admin} onChange={()=>setEditForm(f=>({...f,is_admin:!f.is_admin}))} />
          {!editForm.is_admin && <>
            <PermToggle label="💰 Müşteri Ücretleri (aylık paket, müşteri faturaları)" checked={editForm.perm_finance} onChange={()=>setEditForm(f=>({...f,perm_finance:!f.perm_finance}))} />
            <PermToggle label="🏢 Müşteri Yönetimi (ekleme, silme)" checked={editForm.perm_manage_clients} onChange={()=>setEditForm(f=>({...f,perm_manage_clients:!f.perm_manage_clients}))} />
            <PermToggle label="👥 Çalışan Yönetimi (ekleme, silme, yetki)" checked={editForm.perm_manage_staff} onChange={()=>setEditForm(f=>({...f,perm_manage_staff:!f.perm_manage_staff}))} />
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
// ─── Ana sayfa karşılama ───
// 08:30–10:00 arası "Günaydın", diğer saatlerde "Hoş geldin"; yanında giriş yapan kişinin adı.
// Motive edici cümle gün içinde değişir (günün saatine göre seçilir).
const MOTIVATION_LINES = [
  "Güne taze başlıyoruz; ilk görevi bitirmek günün ritmini belirler.",
  "Her paylaşım bir müşterinin hikâyesi. Bugün kimin hikâyesini anlatıyoruz?",
  "Küçük adımlar büyük markalar kurar.",
  "Detaylar markayı yapar; bugün dokunduğun her şey fark ediliyor.",
  "En zor işi önce hallet, gerisi kolay gelir.",
  "İyi bir gün, iyi bir paylaşımla başlar.",
  "Bugün ilerlemen dünkü hâlinden daha ileride. Devam.",
  "Yorulmak normal, bırakmak değil.",
  "Bitmeyenleri topla, yarına temiz başla.",
  "Emeğin görünür oluyor. Bugün de fark yaratıyoruz.",
  "Liste kısalıyor, müşteriler mutlu. Böyle devam.",
  "Bir paylaşım daha, bir müşteri daha mutlu.",
];
function dashboardGreeting(name, now = new Date()) {
  const t = now.getHours() * 60 + now.getMinutes();
  const isMorning = t >= 8 * 60 + 30 && t < 10 * 60;
  const first = (name || "").trim();
  const salute = isMorning ? "Günaydın" : "Hoş geldin";
  const seed = now.getFullYear() * 1000 + (now.getMonth() + 1) * 40 + now.getDate() + now.getHours();
  return { title: first ? `${salute}, ${first}` : salute, line: MOTIVATION_LINES[seed % MOTIVATION_LINES.length] };
}

function DashboardPage({clients, staff, tasks, setPage, perms, allClients, allStaff, refreshData, currentStaff}) {
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
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
  const todayExtraShoot = clients.filter(c => (c.extraShoots||[]).some(s => s.date === todayStr)).map(c => ({ ...c, _shootTitle: (c.extraShoots||[]).find(s=>s.date===todayStr)?.title }));
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
        {(() => { const g = dashboardGreeting(currentStaff?.name, today); return <>
          <div style={{fontSize:22,fontWeight:700,color:T.textPrimary}}>{g.title}</div>
          <div style={{fontSize:13,color:T.textSecondary,marginTop:6,fontStyle:"italic"}}>{g.line}</div>
          <div style={{fontSize:13,color:T.textMuted,marginTop:4}}>{today.toLocaleDateString("tr-TR",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</div>
        </>; })()}
      </div>
      <Btn onClick={()=>{
        const rows=[];
        if(perms.companyFinance){
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

    {/* ☀️ Bugünün Özeti (sabah özeti panosu) */}
    {(()=>{
      const dueToday = tasks.filter(t=>t.due===todayStr && t.col!=="done" && t.col!=="published");
      const overdue = tasks.filter(t=>t.due && t.due!=="—" && t.due.length>=8 && t.due<todayStr && t.col!=="done" && t.col!=="published");
      const inRevision = tasks.filter(t=>t.col==="revision");
      const pendingApproval = tasks.filter(t=>t.col==="approval");
      const items = [
        {icon:"📅",label:"Bugün Paylaşım",val:todayPublish.length,color:T.amberText,page:"clients"},
        {icon:"📷",label:"Bugün Çekim",val:todayShoot.length+todayExtraShoot.length,color:T.pinkText,page:"calendar"},
        {icon:"⏰",label:"Bugün Teslim",val:dueToday.length,color:T.indigoText,page:"tasks"},
        {icon:"🔴",label:"Geciken Görev",val:overdue.length,color:T.redText,page:"tasks"},
        {icon:"🔄",label:"Revizede",val:inRevision.length,color:T.redText,page:"tasks"},
        {icon:"📤",label:"Onay Bekleyen",val:pendingApproval.length,color:"#25D366",page:"tasks"},
      ];
      const greeting = (()=>{ const h=today.getHours(); if(h<12) return "Günaydın ☀️"; if(h<18) return "İyi çalışmalar 👋"; return "İyi akşamlar 🌙"; })();
      return (
        <div style={{background:`linear-gradient(135deg, ${T.bgCard}, rgba(99,102,241,0.08))`,border:`1px solid ${T.border}`,borderRadius:14,padding:"16px 18px",marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:700,color:T.textPrimary,marginBottom:12}}>{greeting} — İşte bugünün özeti:</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))",gap:10}}>
            {items.map((it,i)=>(
              <div key={i} onClick={()=>setPage(it.page)} style={{background:T.bgInput,borderRadius:10,padding:"12px 14px",cursor:"pointer",transition:"transform .15s",display:"flex",flexDirection:"column",gap:3}}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                <div style={{fontSize:22,fontWeight:800,color:it.val>0?it.color:T.textMuted,lineHeight:1}}>{it.val}</div>
                <div style={{fontSize:11,color:T.textMuted}}>{it.icon} {it.label}</div>
              </div>
            ))}
          </div>
        </div>
      );
    })()}

    {/* Hava Durumu */}
    <div style={{marginBottom:16}}><WeatherWidget mini /></div>

    {/* Finansal Özet - sadece yönetici görür */}
    {perms.companyFinance && (
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
          <div style={{fontSize:11,color:T.pinkText,fontWeight:600,marginBottom:8}}>ÇEKİM ({todayShoot.length})</div>
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
      {/* Bugünkü ek çekimler (belirli tarihli) */}
      {todayExtraShoot.length > 0 && (
        <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
          <div style={{fontSize:11,color:T.purpleText,fontWeight:600,marginBottom:8}}>📸 EK ÇEKİM ({todayExtraShoot.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {todayExtraShoot.map(c=>(
              <div key={c.id} onClick={()=>setPage("clients")} style={{fontSize:12,color:T.textPrimary,padding:"8px 10px",background:"rgba(168,85,247,0.14)",borderRadius:6,borderLeft:`2px solid #A855F7`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>📸 <strong>{c.name}</strong>{c._shootTitle?` — ${c._shootTitle}`:""}</span>
                <span style={{fontSize:10,color:T.purpleText,fontWeight:600}}>Ek Çekim</span>
              </div>
            ))}
          </div>
        </div>
      )}
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
      <NavCard icon="📅" label="Bu Ay Paylaşım" value={totalPosts} sub="Yayınlanan" color={T.greenText} target="clients" />
    </div>

    {/* GELİR-GİDER GRAFİĞİ - sadece yönetici */}
    {perms.companyFinance && <RevenueChart />}

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
  const [pieceJobs, setPieceJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: p } = await supabase.from('client_payments').select('id,amount,month_ref,payment_date');
        setPayments(p || []);
        const { data: e } = await supabase.from('accounting_entries').select('id,amount,month_ref,is_paid,paid_date,due_date');
        setEntries(e || []);
        const { data: ex } = await supabase.from('company_expenses').select('id,amount,expense_date');
        setExpenses(ex || []);
        const { data: inc } = await supabase.from('company_incomes').select('id,amount,income_date');
        setIncomes(inc || []);
        const { data: pj } = await supabase.from('piece_jobs').select('id,amount,month_ref,status,due_date');
        setPieceJobs(pj || []);
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

  // Muhasebe > Özet ile aynı kural: para hangi gün girdi/çıktıysa o ayda sayılır
  const hareketler = muhasebeHareketleri({ payments, incomes, expenses, entries, pieceJobs });
  const data = months.map(m => {
    const ay = hareketler.filter(r => toMonthRef(r.date) === m);
    const income = sumAmount(ay.filter(r => r.kind === "gelir"));
    const expense = sumAmount(ay.filter(r => r.kind === "gider"));
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
  const [allModal, setAllModal] = useState(null); // "clients" | "staff"
  const departedClients = (allClients || []).filter(c => c.deleted_at).sort((x, y) => new Date(y.deleted_at) - new Date(x.deleted_at)); // en son silinen en üstte
  const departedStaff = (allStaff || []).filter(s => s.deleted_at).sort((x, y) => new Date(y.deleted_at) - new Date(x.deleted_at));

  const restoreClient = async (id, name) => {
    if (!await swalConfirm(`"${name}" tekrar aktif müşteri olacak. Onaylıyor musunuz?`)) return;
    setBusy(true);
    const { error } = await supabase.from('clients').update({ deleted_at: null, delete_reason: null, deletion_date: null }).eq('id', id);
    setBusy(false);
    if (error) { swalAlert("Hata: " + error.message); return; }
    await refreshData();
    swalAlert(`"${name}" tekrar aktif müşteri! Bilgilerini düzenlemek için Müşteriler sayfasına gidebilirsiniz.`);
  };

  const restoreStaff = async (id, name) => {
    if (!await swalConfirm(`"${name}" tekrar aktif çalışan olacak. Onaylıyor musunuz?`)) return;
    setBusy(true);
    const { error } = await supabase.from('staff').update({ deleted_at: null, departure_reason: null, departure_date: null }).eq('id', id);
    setBusy(false);
    if (error) { swalAlert("Hata: " + error.message); return; }
    await refreshData();
    swalAlert(`"${name}" tekrar aktif çalışan! Bilgilerini düzenlemek için Çalışanlar sayfasına gidebilirsiniz.`);
  };

  if (departedClients.length === 0 && departedStaff.length === 0) return null;

  const clientRow = (c) => (
    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bgInput, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.white, flexShrink: 0 }}>{c.initials || (c.name||"?").slice(0,2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
        <div style={{ fontSize: 10, color: T.textMuted }}>{CLIENT_DELETE_REASONS.find(r => r.id === c.delete_reason)?.label || "Ayrıldı"}{c.deletion_date ? ` · ${c.deletion_date}` : ""}{c.deleted_at ? ` · Silindi: ${new Date(c.deleted_at).toLocaleDateString("tr-TR")}` : ""}</div>
      </div>
      {perms.manageClients && <button disabled={busy} onClick={() => restoreClient(c.id, c.name)} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, background: T.greenDim, color: T.greenText, border: `1px solid ${T.green}44`, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>↩ Aktif Yap</button>}
    </div>
  );

  const staffRow = (s) => (
    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bgInput, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.textMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: T.white, flexShrink: 0 }}>{(s.name||"?").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
        <div style={{ fontSize: 10, color: T.textMuted }}>{s.role || "—"}{s.departure_date ? ` · ${s.departure_date}` : ""}{s.deleted_at ? ` · Silindi: ${new Date(s.deleted_at).toLocaleDateString("tr-TR")}` : ""}</div>
      </div>
      {perms.manageStaff && <button disabled={busy} onClick={() => restoreStaff(s.id, s.name)} style={{ fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, background: T.greenDim, color: T.greenText, border: `1px solid ${T.green}44`, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap" }}>↩ Aktif Yap</button>}
    </div>
  );

  const moreBtn = (count, onClick) => (
    <button onClick={onClick} style={{ marginTop: 4, padding: "9px", borderRadius: 8, border: `1px solid ${T.borderLight}`, background: T.bgSurface, color: T.textSecondary, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
      📋 Tümünü Gör ({count})
    </button>
  );

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
              {departedClients.slice(0, 4).map(clientRow)}
              {departedClients.length > 4 && moreBtn(departedClients.length, () => setAllModal("clients"))}
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
              {departedStaff.slice(0, 4).map(staffRow)}
              {departedStaff.length > 4 && moreBtn(departedStaff.length, () => setAllModal("staff"))}
            </div>
          )}
        </div>
      </div>

      {/* Tümünü gör modalı */}
      {allModal && (
        <Modal
          title={allModal === "clients" ? `🚪 Ayrılan Müşteriler (${departedClients.length})` : `🚪 Ayrılan Çalışanlar (${departedStaff.length})`}
          onClose={() => setAllModal(null)} width={520}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 460, overflowY: "auto" }}>
            {allModal === "clients" ? departedClients.map(clientRow) : departedStaff.map(staffRow)}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ ENVANTER ═══════════════
const INVENTORY_CATEGORIES = [
  { id: "kamera", label: "📷 Kamera" }, { id: "lens", label: "🔭 Lens" }, { id: "isik", label: "💡 Işık" },
  { id: "ses", label: "🎙️ Ses" }, { id: "gimbal", label: "🎥 Gimbal / Tripod" }, { id: "drone", label: "🚁 Drone" },
  { id: "bilgisayar", label: "💻 Bilgisayar / Tablet" }, { id: "depolama", label: "💾 Hafıza / Disk" },
  { id: "aksesuar", label: "🔋 Batarya / Aksesuar" }, { id: "ofis", label: "🏢 Ofis Eşyası" }, { id: "diger", label: "📦 Diğer" },
];
const INVENTORY_STATUS = { aktif: { label: "Aktif", color: T.greenText }, arizali: { label: "Arızalı", color: T.redText }, serviste: { label: "Serviste", color: T.amberText }, kayip: { label: "Kayıp", color: "#9CA3AF" }, satildi: { label: "Satıldı", color: "#9CA3AF" } };
const invCatLabel = (id) => INVENTORY_CATEGORIES.find(c => c.id === id)?.label || id;

function InventoryPage({ perms }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from('inventory').select('*').is('deleted_at', null).order('category').order('name');
    if (error) swalAlert("Envanter yüklenemedi: " + error.message + "\n\nENVANTER-SQL kodunu çalıştırın.");
    setItems(data || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.name) { swalAlert("Ekipman adı zorunlu"); return; }
    const row = { name: form.name, category: form.category || "diger", brand_model: form.brand_model || "", quantity: parseInt(form.quantity) || 1, serial_no: form.serial_no || "", status: form.status || "aktif", purchase_date: form.purchase_date || null, value: parseFloat(form.value) || 0, notes: form.notes || "" };
    const { error } = form.id ? await supabase.from('inventory').update(row).eq('id', form.id) : await supabase.from('inventory').insert(row);
    if (error) { swalAlert("Kaydedilemedi: " + error.message); return; }
    setModal(false); setForm({}); load();
  };
  const del = async (id) => { if (!await swalConfirm("Bu ekipman envanterden silinsin mi?")) return; await supabase.from('inventory').update({ deleted_at: new Date().toISOString() }).eq('id', id); load(); };
  const quickQty = async (it, delta) => { const q = Math.max(0, (it.quantity || 0) + delta); await supabase.from('inventory').update({ quantity: q }).eq('id', it.id); setItems(prev => prev.map(x => x.id === it.id ? { ...x, quantity: q } : x)); };

  const filtered = items.filter(i => (filterCat === "all" || i.category === filterCat) && (!search || `${i.name} ${i.brand_model} ${i.serial_no} ${i.notes}`.toLowerCase().includes(search.toLowerCase())));
  const totalQty = items.filter(i => i.status === "aktif").reduce((s, i) => s + (i.quantity || 0), 0);
  const totalValue = items.reduce((s, i) => s + (Number(i.value) || 0) * (i.quantity || 0), 0);
  const broken = items.filter(i => i.status === "arizali" || i.status === "serviste").length;
  const byCat = {}; filtered.forEach(i => { (byCat[i.category] = byCat[i.category] || []).push(i); });

  const exportExcel = async () => {
    const rows = items.map(i => ({ "Ekipman": i.name, "Kategori": invCatLabel(i.category).replace(/^[^\w]+\s/, ""), "Marka / Model": i.brand_model, "Adet": i.quantity, "Seri No": i.serial_no, "Durum": INVENTORY_STATUS[i.status]?.label || i.status, "Alış Tarihi": i.purchase_date || "", "Birim Değer (₺)": Number(i.value) || 0, "Toplam Değer (₺)": (Number(i.value) || 0) * (i.quantity || 0), "Not": i.notes }));
    await exportPerfectExcel([{ name: "Envanter", rows, title: "PANORMOS MEDYA — EKİPMAN ENVANTERİ" }], `panormos-envanter-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 16 }}>
        <StatCard label="Toplam Ekipman (aktif)" value={totalQty} />
        <StatCard label="Kalem Sayısı" value={items.length} />
        <StatCard label="Arızalı / Serviste" value={broken} color={broken ? T.redText : T.greenText} />
        {perms.finance && <StatCard label="Toplam Değer" value={fmtMoney(totalValue)} color={T.indigoText} />}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={() => { setForm({ category: "kamera", status: "aktif", quantity: 1 }); setModal(true); }}>+ Ekipman Ekle</Btn>
        <Btn onClick={exportExcel} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel'e Aktar</Btn>
        <div style={{ flex: 1 }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Ara…" style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, color: T.textPrimary, outline: "none", width: 180 }} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: T.textPrimary }}>
          <option value="all">Tüm kategoriler</option>
          {INVENTORY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </div>
      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
        : filtered.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 40, border: `1px dashed ${T.border}`, borderRadius: 12 }}>Henüz ekipman eklenmemiş. "+ Ekipman Ekle" ile başlayın.</div>
        : INVENTORY_CATEGORIES.filter(c => byCat[c.id]).map(c => (
          <div key={c.id} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.textMuted, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{c.label} <span style={{ color: T.textMuted, fontWeight: 400 }}>· {byCat[c.id].reduce((s, i) => s + (i.quantity || 0), 0)} adet</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {byCat[c.id].map(it => {
                const st = INVENTORY_STATUS[it.status] || INVENTORY_STATUS.aktif;
                return (
                  <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, borderLeft: `3px solid ${st.color}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{it.name}{it.brand_model ? <span style={{ color: T.textMuted, fontWeight: 400 }}> · {it.brand_model}</span> : null}</div>
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{[it.serial_no && `SN: ${it.serial_no}`, it.purchase_date && `Alış: ${it.purchase_date}`, perms.finance && Number(it.value) > 0 && fmtMoney(it.value) + " / adet", it.notes].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: st.color + "22", color: st.color }}>{st.label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button onClick={() => quickQty(it, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgSurface, color: T.textSecondary, cursor: "pointer" }}>−</button>
                      <div style={{ minWidth: 36, textAlign: "center", fontSize: 15, fontWeight: 700, color: T.textPrimary }}>{it.quantity}</div>
                      <button onClick={() => quickQty(it, 1)} style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgSurface, color: T.textSecondary, cursor: "pointer" }}>+</button>
                    </div>
                    <Btn onClick={() => { setForm({ ...it }); setModal(true); }} style={{ fontSize: 11, padding: "5px 10px" }}>✏️</Btn>
                    <button onClick={() => del(it.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      {modal && (
        <Modal title={form.id ? "Ekipmanı Düzenle" : "Ekipman Ekle"} onClose={() => setModal(false)} width={560}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <FormField label="Ekipman Adı *"><Input placeholder="Örn: Sony A7 IV" value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></FormField>
            <FormField label="Kategori"><Select value={form.category || "diger"} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{INVENTORY_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
            <FormField label="Marka / Model"><Input value={form.brand_model || ""} onChange={e => setForm(f => ({ ...f, brand_model: e.target.value }))} /></FormField>
            <FormField label="Adet"><Input type="number" value={form.quantity ?? 1} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></FormField>
            <FormField label="Seri No"><Input value={form.serial_no || ""} onChange={e => setForm(f => ({ ...f, serial_no: e.target.value }))} /></FormField>
            <FormField label="Durum"><Select value={form.status || "aktif"} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{Object.entries(INVENTORY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></FormField>
            <FormField label="Alış Tarihi"><Input type="date" value={form.purchase_date || ""} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} /></FormField>
            <FormField label="Birim Değer (₺)"><Input type="number" value={form.value || ""} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} /></FormField>
          </div>
          <FormField label="Not"><Input placeholder="Örn: Çantada 2 yedek batarya ile" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <ModalActions onClose={() => setModal(false)} onSave={save} />
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ EMLAKPANELIM YÖNETİMİ (ayrı Supabase projesi, güvenli köprü fonksiyonu üzerinden) ═══════════════
function EmlakPanelimPage() {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState("");
  const [acikFirma, setAcikFirma] = useState(null);
  const [taslaklar, setTaslaklar] = useState({});
  const [planTaslaklari, setPlanTaslaklari] = useState({});
  const [bekle, setBekle] = useState(null);
  const [denemeTaslak, setDenemeTaslak] = useState("14");
  const [denemeBekle, setDenemeBekle] = useState(false);

  async function yukle() {
    setHata("");
    try {
      const res = await panelFetch("/.netlify/functions/emlakpanelim-admin");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Yüklenemedi");
      setVeri(data);
      const t = {};
      for (const f of data.firmalar) t[f.id] = { ...f };
      setTaslaklar(t);
      const pt = {};
      for (const p of data.planlar) pt[p.id] = { ...p, kapsamMetni: (p.kapsam || []).join("\n") };
      setPlanTaslaklari(pt);
      setDenemeTaslak(String(data.denemeSuresiGun ?? 14));
    } catch (e) {
      setHata(e.message);
    }
  }
  useEffect(() => { yukle(); }, []);

  async function gonder(body) {
    const res = await panelFetch("/.netlify/functions/emlakpanelim-admin", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "İşlem başarısız");
    return data;
  }

  async function denemeSuresiKaydet() {
    const gun = Number(denemeTaslak);
    if (!Number.isFinite(gun) || gun < 1) { swalAlert("Geçerli bir gün sayısı girin."); return; }
    setDenemeBekle(true);
    try { await gonder({ aksiyon: "deneme_suresi_kaydet", gun }); await yukle(); }
    catch (e) { swalAlert(e.message); }
    setDenemeBekle(false);
  }

  async function uzat(f, gun) {
    setBekle(f.id + "-uzat");
    try { await gonder({ aksiyon: "uzat", firmaId: f.id, gun }); await yukle(); }
    catch (e) { swalAlert(e.message); }
    setBekle(null);
  }
  async function durumDegistir(f, durum) {
    try { await gonder({ aksiyon: "durum", firmaId: f.id, durum }); await yukle(); }
    catch (e) { swalAlert(e.message); }
  }
  async function firmaSil(f) {
    const onay = window.prompt(
      `"${f.ad}" firmasını ve TÜM verilerini (ilanlar, müşteriler, mal sahipleri, sözleşmeler, ekip hesapları) KALICI olarak sileceksiniz. Bu işlem GERİ ALINAMAZ.\n\nOnaylamak için firma adını tam olarak yazın:`
    );
    if (onay !== f.ad) {
      if (onay !== null) swalAlert("Firma adı eşleşmedi, silme iptal edildi.");
      return;
    }
    setBekle(f.id + "-sil");
    try { await gonder({ aksiyon: "firma_sil", firmaId: f.id }); await yukle(); }
    catch (e) { swalAlert(e.message); }
    setBekle(null);
  }
  async function faturaKaydet(f) {
    const t = taslaklar[f.id];
    setBekle(f.id + "-fatura");
    try {
      await gonder({
        aksiyon: "fatura", firmaId: f.id, alanlar: {
          fatura_unvani: t.fatura_unvani || null, vergi_dairesi: t.vergi_dairesi || null,
          vergi_no: t.vergi_no || null, fatura_adresi: t.fatura_adresi || null,
        },
      });
      await yukle();
    } catch (e) { swalAlert(e.message); }
    setBekle(null);
  }
  async function planKaydet(id) {
    const t = planTaslaklari[id];
    setBekle("plan-" + id);
    try {
      const kapsam = t.kapsamMetni.split("\n").map((s) => s.trim()).filter(Boolean);
      await gonder({
        aksiyon: "plan_kaydet", id, alanlar: {
          sira: Number(t.sira) || 0, ad: t.ad, kim: t.kim, aylik: Number(t.aylik) || 0, yillik: Number(t.yillik) || 0,
          one_cikan: !!t.one_cikan, kapsam,
        },
      });
      await yukle();
    } catch (e) { swalAlert(e.message); }
    setBekle(null);
  }
  async function planSil(id) {
    if (!await swalConfirm("Bu paket silinecek ve EmlakPanelim fiyat sayfasından kalkacak. Emin misiniz?")) return;
    try { await gonder({ aksiyon: "plan_sil", id }); await yukle(); } catch (e) { swalAlert(e.message); }
  }
  async function planEkle() {
    try { await gonder({ aksiyon: "plan_ekle", sira: (veri?.planlar?.length || 0) + 1 }); await yukle(); } catch (e) { swalAlert(e.message); }
  }

  if (hata) return (
    <div style={{ color: T.redText, background: T.redDim, borderRadius: 10, padding: 16, fontSize: 13 }}>
      Hata: {hata}<br />
      <span style={{ fontSize: 12, color: T.textMuted }}>Netlify ortam değişkenlerini (EMLAK_SUPABASE_URL, EMLAK_SUPABASE_SERVICE_KEY) kontrol edin.</span>
    </div>
  );
  if (!veri) return <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Yükleniyor...</div>;

  const bugun = new Date(new Date().toDateString());
  const kalan = (f) => Math.round((new Date(f.abonelik_bitis + "T00:00:00") - bugun) / 86400000);
  const durumEtiket = { deneme: "Deneme", aktif: "Aktif", donduruldu: "Donduruldu" };

  const toplamKullanici = Object.values(veri.detay).reduce((t, d) => t + (d.kullanicilar?.length || 0), 0);
  const toplamMusteri = Object.values(veri.detay).reduce((t, d) => t + (d.musteri_sayisi || 0), 0);
  const toplamIlan = Object.values(veri.detay).reduce((t, d) => t + (d.ilan_sayisi || 0), 0);
  const toplamSatis = Object.values(veri.detay).reduce((t, d) => t + (d.satis_sayisi || 0), 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        {[["Toplam Firma", veri.firmalar.length], ["Kullanıcı", toplamKullanici], ["Müşteri Kaydı", toplamMusteri], ["Portföy", toplamIlan], ["Satış", toplamSatis]].map(([lbl, val]) => (
          <div key={lbl} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.textPrimary }}>{val}</div>
            <div style={{ fontSize: 11, color: T.textMuted }}>{lbl}</div>
          </div>
        ))}
      </div>

      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 20, maxWidth: 420 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>Ücretsiz deneme süresi</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 10 }}>
          Yeni kaydolan firmalara tanınan varsayılan süre. Sadece bundan sonraki kayıtları etkiler.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Input type="number" style={{ width: 80 }} value={denemeTaslak} onChange={(e) => setDenemeTaslak(e.target.value)} />
          <span style={{ fontSize: 13, color: T.textMuted }}>gün</span>
          <Btn variant="primary" onClick={denemeSuresiKaydet}>{denemeBekle ? "Kaydediliyor..." : "Kaydet"}</Btn>
        </div>
      </div>

      <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 10 }}>Abone Firmalar</div>
      <div style={{ display: "grid", gap: 10, marginBottom: 28 }}>
        {veri.firmalar.map((f) => {
          const g = kalan(f);
          const acik = acikFirma === f.id;
          const d = veri.detay[f.id] || {};
          const t = taslaklar[f.id] || f;
          return (
            <div key={f.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{f.ad}</div>
                  <div style={{ fontSize: 12, color: T.textMuted }}>{f.eposta} · {f.telefon || "—"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 6, background: f.durum === "aktif" ? T.greenDim : f.durum === "deneme" ? T.indigoDim : T.redDim, color: f.durum === "aktif" ? T.greenText : f.durum === "deneme" ? T.indigoText : T.redText }}>{durumEtiket[f.durum]}</span>
                  <span style={{ fontSize: 11, color: g < 0 ? T.redText : g <= 5 ? T.amberText : T.textMuted }}>{g < 0 ? `${-g} gün geçti` : `${g} gün kaldı`}</span>
                  <Btn onClick={() => setAcikFirma(acik ? null : f.id)}>{acik ? "Kapat" : "Detay"}</Btn>
                  <Btn onClick={() => uzat(f, 30)}>{bekle === f.id + "-uzat" ? "..." : "+1 ay"}</Btn>
                  <Btn onClick={() => uzat(f, 365)}>+1 yıl</Btn>
                  {f.durum !== "donduruldu"
                    ? <Btn onClick={() => durumDegistir(f, "donduruldu")} style={{ color: T.redText }}>Dondur</Btn>
                    : <Btn onClick={() => durumDegistir(f, "aktif")}>Aç</Btn>}
                  <Btn onClick={() => firmaSil(f)} style={{ color: T.redText }}>{bekle === f.id + "-sil" ? "..." : "Sil"}</Btn>
                </div>
              </div>

              {acik && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: T.textSecondary, marginBottom: 14 }}>
                    <span>İlan: {d.ilan_sayisi ?? 0}</span><span>Müşteri: {d.musteri_sayisi ?? 0}</span>
                    <span>Kira: {d.kira_sayisi ?? 0}</span><span>Satış: {d.satis_sayisi ?? 0}</span><span>Talep: {d.talep_sayisi ?? 0}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Kullanıcılar</div>
                  <div style={{ marginBottom: 16 }}>
                    {(d.kullanicilar || []).map((k, i) => (
                      <div key={i} style={{ fontSize: 12, color: T.textSecondary, padding: "4px 0" }}>{k.ad_soyad || "-"} · {k.eposta} · {k.rol === "yonetici" ? "Yönetici" : "Danışman"} · {k.onayli ? "Açık" : "Kapalı"}</div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Fatura Bilgileri</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                    <FormField label="Fatura Unvanı"><Input value={t.fatura_unvani || ""} onChange={(e) => setTaslaklar((ts) => ({ ...ts, [f.id]: { ...ts[f.id], fatura_unvani: e.target.value } }))} /></FormField>
                    <FormField label="Vergi Dairesi"><Input value={t.vergi_dairesi || ""} onChange={(e) => setTaslaklar((ts) => ({ ...ts, [f.id]: { ...ts[f.id], vergi_dairesi: e.target.value } }))} /></FormField>
                    <FormField label="Vergi No / TC Kimlik No"><Input value={t.vergi_no || ""} onChange={(e) => setTaslaklar((ts) => ({ ...ts, [f.id]: { ...ts[f.id], vergi_no: e.target.value } }))} /></FormField>
                    <FormField label="Fatura Adresi"><Input value={t.fatura_adresi || ""} onChange={(e) => setTaslaklar((ts) => ({ ...ts, [f.id]: { ...ts[f.id], fatura_adresi: e.target.value } }))} /></FormField>
                  </div>
                  <Btn variant="primary" onClick={() => faturaKaydet(f)}>{bekle === f.id + "-fatura" ? "Kaydediliyor..." : "Fatura Bilgilerini Kaydet"}</Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Fiyat Planları (emlakpanelim.com/fiyatlar)</div>
        <Btn onClick={planEkle}>+ Yeni Paket</Btn>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {(veri.planlar || []).map((p) => {
          const t = planTaslaklari[p.id] || { ...p, kapsamMetni: (p.kapsam || []).join("\n") };
          return (
            <div key={p.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 10, marginBottom: 10 }}>
                <FormField label="Sıra"><Input type="number" value={t.sira ?? 0} onChange={(e) => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], sira: e.target.value } }))} /></FormField>
                <FormField label="Paket Adı"><Input value={t.ad || ""} onChange={(e) => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], ad: e.target.value } }))} /></FormField>
                <FormField label="Kimin İçin"><Input value={t.kim || ""} onChange={(e) => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], kim: e.target.value } }))} /></FormField>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10, alignItems: "end" }}>
                <FormField label="Aylık Fiyat (₺)"><Input type="number" value={t.aylik ?? 0} onChange={(e) => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], aylik: e.target.value } }))} /></FormField>
                <FormField label="Yıllık Fiyat (₺)"><Input type="number" value={t.yillik ?? 0} onChange={(e) => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], yillik: e.target.value } }))} /></FormField>
                <PermToggle label="Öne çıkan" checked={!!t.one_cikan} onChange={() => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], one_cikan: !t.one_cikan } }))} />
              </div>
              <FormField label="Kapsam (her satıra bir madde)"><Textarea minHeight={100} value={t.kapsamMetni || ""} onChange={(e) => setPlanTaslaklari((pt) => ({ ...pt, [p.id]: { ...pt[p.id], kapsamMetni: e.target.value } }))} /></FormField>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="primary" onClick={() => planKaydet(p.id)}>{bekle === "plan-" + p.id ? "Kaydediliyor..." : "Kaydet"}</Btn>
                <Btn onClick={() => planSil(p.id)} style={{ color: T.redText }}>Sil</Btn>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Yetki hesaplama: Yönetici her şeyi görür, diğerleri sadece izinli olduklarını
function getPerms(s) {
  const isAdmin = s.is_admin === true;
  return {
    isAdmin,
    finance: isAdmin || s.perm_finance === true,       // Müşteri bazlı ücretler ve faturalar
    manageClients: isAdmin || s.perm_manage_clients === true,  // Müşteri ekle/düzenle/sil
    manageStaff: isAdmin || s.perm_manage_staff === true,      // Çalışan ekle/düzenle/sil
    accounting: isAdmin,      // Muhasebe: sadece yönetici
    companyFinance: isAdmin,  // Şirket geliri, gideri, kârı, ciro: sadece yönetici
    mail: isAdmin,            // E-posta kutusu: sadece yönetici
    reports: isAdmin || s.perm_reports === true, // Sosyal medya raporlama
  };
}

// Menüde görünürlük ve sayfanın açılabilmesi (URL/hash ile gelinse bile) aynı kurala bağlı
function canAccessPage(id, perms) {
  if (id === 'staff') return perms.manageStaff;
  if (id === 'pricing') return perms.finance || perms.manageClients;
  if (id === 'reports') return perms.reports;
  if (id === 'accounting') return perms.accounting;
  if (id === 'mail') return perms.mail;
  if (id === 'yearly' || id === 'emlakpanelim') return perms.isAdmin;
  return true;
}

const NAV=[
  {id:"dashboard",label:"Ana Sayfa",icon:"🏠"},
  {id:"clients",label:"Müşteriler",icon:"🏢"},
  {id:"leads",label:"Soğuk Arama",icon:"📞"},
  {id:"pricing",label:"Fiyatlar",icon:"💰"},
  {id:"calendar",label:"Takvim",icon:"📅"},
  {id:"shoots",label:"Çekimler",icon:"📷"},
  {id:"ideas",label:"Fikirler",icon:"💡"},
  {id:"tasks",label:"Görevler",icon:"📋"},
  {id:"reports",label:"Raporlar",icon:"📊"},
  {id:"files",label:"Dosyalar",icon:"📁"},
  {id:"messages",label:"Mesajlar",icon:"💬"},
  {id:"mail",label:"E-posta",icon:"📧"},
  {id:"accounting",label:"Muhasebe",icon:"🧮"},
  {id:"inventory",label:"Envanter",icon:"🎒"},
  {id:"yearly",label:"Yıllık Özet",icon:"📊"},
  {id:"staff",label:"Çalışanlar",icon:"👥"},
  {id:"emlakpanelim",label:"EmlakPanelim",icon:"🏘️"},
];

// Menü bölümleri (sırası ve başlıkları)
const NAV_GROUPS = [
  { label: "", ids: ["dashboard"] },
  { label: "İş Takibi", ids: ["clients", "leads", "calendar", "shoots", "tasks", "ideas"] },
  { label: "İçerik ve İletişim", ids: ["reports", "files", "messages", "mail"] },
  { label: "Finans", ids: ["pricing", "accounting", "yearly"] },
  { label: "Yönetim", ids: ["inventory", "staff", "emlakpanelim"] },
];
const PAGE_TITLES = { calendar: "Çekim Takvimi" };

// Menü ikonları: tek tip, ince çizgili
const NAV_ICON_PATHS = {
  dashboard: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  clients: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M9 8h1M14 8h1M9 12h1M14 12h1M10 21v-4h4v4" /></>,
  leads: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" />,
  pricing: <><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  shoots: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  ideas: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />,
  tasks: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="m8 12 2.5 2.5L16 9" /></>,
  reports: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  files: <path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  messages: <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-9l-5 4v-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  accounting: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" /></>,
  inventory: <><path d="M3 8l9-5 9 5v8l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  yearly: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  staff: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  emlakpanelim: <path d="M3 21V9l6-4v16M9 21V11l6-3 6 3v10M3 21h18M13 13h.01M17 13h.01M13 17h.01M17 17h.01" />,
};
function NavIcon({ id, size = 17 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{NAV_ICON_PATHS[id] || <circle cx="12" cy="12" r="8" />}</svg>;
}

// ─────────────────────────────────────────────
// FİYATLANDIRMA - yazdırma yardımcıları
// ─────────────────────────────────────────────
function openPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) { swalAlert("Yazdırma penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  w.document.write(html);
  w.document.close();
  const doPrint = () => { try { w.focus(); w.print(); } catch (e) {} };
  w.onload = doPrint;
  setTimeout(doPrint, 600);
}

// ── PDF olarak indirme (html2pdf CDN'den yüklenir) ──
async function ensureHtml2Pdf() {
  if (window.html2pdf) return true;
  return new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    s.onload = () => resolve(!!window.html2pdf);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

async function downloadPdfFromHTML(html, filename, orientation = "portrait") {
  // En güvenilir yöntem: yazdırma penceresi aç, kullanıcı "PDF olarak kaydet" desin.
  // (html2pdf bazı tarayıcılarda boş çıkıyor; tarayıcı motoru şaşmaz.)
  const w = window.open("", "_blank");
  if (!w) { swalAlert("PDF penceresi açılamadı. Pop-up engelleyiciyi kapatın."); return; }
  // Başlığı dosya adı yap (yazdırırken önerilen ad olur)
  const titled = html.replace(/<title>.*?<\/title>/i, `<title>${filename.replace(/\.pdf$/i, "")}</title>`);
  w.document.write(titled);
  w.document.close();
  w.focus();
  // İçerik ve fontlar yüklensin, sonra yazdır (kullanıcı Hedef: PDF seçer)
  setTimeout(() => { try { w.print(); } catch (e) {} }, 500);
}

const PRINT_STYLES = `
  @page { size: A4 portrait; margin: 0; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,'Segoe UI',Arial,sans-serif; color:#1F2937; padding:32px; }
  .head { background:#1A2B3F; border-radius:10px; padding:18px 22px; margin-bottom:14px; }
  .logo { font-size:15px; font-weight:800; color:#fff; margin-bottom:7px; }
  .logo .m { color:#F25124; }
  .head h1 { color:#fff; font-size:20px; margin-bottom:3px; }
  .head .sub { color:#C7CDD6; font-size:11px; }
  .intro { font-size:11.5px; line-height:1.5; margin-bottom:13px; color:#374151; }
  .pkgs { display:flex; gap:10px; margin-bottom:12px; }
  .pkg { flex:1; border:1px solid #E5E7EB; border-radius:9px; overflow:hidden; page-break-inside:avoid; }
  .pkg.pop { border:2px solid #F25124; }
  .pkg .ph { background:#1A2B3F; color:#fff; padding:9px; text-align:center; }
  .pkg.pop .ph { background:#F25124; }
  .pkg .ph .tag { font-size:7.5px; letter-spacing:0.5px; opacity:0.9; }
  .pkg .ph .nm { font-size:13px; font-weight:800; margin:2px 0; }
  .pkg .ph .tl { font-size:8.5px; opacity:0.85; }
  .pkg .pb { padding:11px; }
  .pkg .price { font-size:20px; font-weight:800; text-align:center; color:#1A2B3F; }
  .pkg.pop .price { color:#F25124; }
  .pkg .pn { font-size:8.5px; color:#8A8F98; text-align:center; margin-bottom:3px; }
  .pkg .vat { font-size:10px; color:#0A7A4A; font-weight:800; text-align:center; margin-bottom:9px; background:#EAF7F0; border-radius:5px; padding:3px 5px; }
  .pkg ul { list-style:none; }
  .pkg li { font-size:9px; line-height:1.42; padding:2px 0; padding-left:13px; position:relative; }
  .pkg li:before { content:"✓"; color:#10B981; font-weight:800; position:absolute; left:0; }
  h2 { font-size:14px; color:#1A2B3F; margin:13px 0 8px; }
  table { width:100%; border-collapse:collapse; page-break-inside:avoid; }
  th { background:#1A2B3F; color:#fff; padding:6px 10px; text-align:left; font-size:10px; }
  td { padding:5px 10px; border-bottom:1px solid #E5E7EB; font-size:10px; }
  tr:nth-child(even) td { background:#F5F6F8; }
  .footer { background:#F25124; color:#fff; border-radius:8px; padding:12px 16px; margin-top:13px; display:flex; justify-content:space-between; page-break-inside:avoid; }
  .footer .t { font-weight:800; font-size:12px; margin-bottom:2px; }
  .footer .c { font-size:10px; line-height:1.6; }
  .terms { font-size:8px; color:#8A8F98; margin-top:8px; line-height:1.45; page-break-inside:avoid; }
  @media print {
    html, body { height:auto; }
    body { padding:12mm 11mm; }
    .head,.pkg.pop .ph,.pkg .ph,.pkg .vat,th,tr:nth-child(even) td,.footer { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
`;

// ── Teklif / fiyat listesi ayarları (panelden düzenlenir) ──
const QUOTE_SETTINGS = {
  phone: "0 (536) 471 60 12",
  email: "info@panormosmedya.com",
  web: "panormosmedya.com",
  vat_rate: 20,
  list_footer_title: "Teklifimizi incelediğiniz için teşekkür ederiz",
  list_footer_text: "Size özel paket için bizimle iletişime geçin.",
  quote_footer_title: "Teklifimizi incelediğiniz için teşekkür ederiz",
  quote_footer_text: "Başlamak için bizimle iletişime geçin.",
};
async function loadQuoteSettings() {
  try {
    const { data } = await supabase.from('panel_settings').select('*');
    (data || []).forEach(r => {
      if (r.key === 'vat_rate') QUOTE_SETTINGS.vat_rate = Number(r.value) || 20;
      else if (r.key in QUOTE_SETTINGS) QUOTE_SETTINGS[r.key] = r.value || "";
    });
  } catch (e) { /* tablo yoksa varsayılanlar kullanılır */ }
}
// KDV dahil tutar
const withVat = (n) => Number(n || 0) * (1 + (QUOTE_SETTINGS.vat_rate || 20) / 100);
// Eski "KDV hariç" ifadesini nottan temizle
const cleanPriceNote = (s) => String(s || "").replace(/[·\-|]?\s*KDV\s*hari[çc]/gi, "").replace(/[\s·\-|]+$/,"").trim();
// PDF alt bilgi kutusu
const footerHTML = (title, text) => `<div class="footer"><div><div class="t">${title}</div><div style="font-size:11px;">${text}</div></div><div class="c"><strong>Tel:</strong> ${QUOTE_SETTINGS.phone}<br><strong>E-posta:</strong> ${QUOTE_SETTINGS.email}<br><strong>Web:</strong> ${QUOTE_SETTINGS.web}</div></div>`;

function printPricingCatalog(packages, addons, asPdf) {
  const now = new Date().toLocaleDateString("tr-TR");
  const pkgHTML = packages.map(p => `
    <div class="pkg ${p.is_popular ? 'pop' : ''}">
      <div class="ph">
        ${p.is_popular ? '<div class="tag">★ EN POPÜLER</div>' : '<div class="tag">&nbsp;</div>'}
        <div class="nm">${p.name}</div>
        <div class="tl">${p.tagline || ''}</div>
      </div>
      <div class="pb">
        <div class="price">${fmtMoney(Number(p.price))} <span style="font-size:13px;font-weight:700;">+ KDV</span></div>
        <div class="pn">${cleanPriceNote(p.price_note)}</div>
        <div class="vat">KDV Dahil Toplam: ${fmtMoney(withVat(p.price))}</div>
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
    ${footerHTML(QUOTE_SETTINGS.list_footer_title, QUOTE_SETTINGS.list_footer_text)}
    <div class="terms">Belirtilen paket fiyatlarına %${QUOTE_SETTINGS.vat_rate} KDV eklenmiştir; toplam tutarlar KDV dahildir. · Reklam bütçeleri pakete dahil değildir. · Paketler ihtiyaca göre özelleştirilebilir.</div>
  </body></html>`;
  if (asPdf) { downloadPdfFromHTML(html, `Panormos-Fiyat-Listesi-${new Date().toISOString().slice(0,10)}.pdf`); return; }
  openPrintWindow(html);
}

function printQuote(quote, addonList, asPdf) {
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
      <div class="pb"><div class="price">${fmtMoney(Number(quote.price))} <span style="font-size:13px;font-weight:700;">+ KDV</span></div><div class="pn">aylık</div>
      <div class="vat">KDV Dahil Toplam: ${fmtMoney(withVat(quote.price))}</div>
      <ul>${(quote.features || []).map(f => `<li>${f}</li>`).join("")}</ul></div>
    </div></div>
    ${addonHTML}
    ${quote.note ? `<h2>Not</h2><div class="intro">${quote.note}</div>` : ''}
    ${footerHTML(QUOTE_SETTINGS.quote_footer_title, QUOTE_SETTINGS.quote_footer_text)}
    <div class="terms">Belirtilen fiyata %${QUOTE_SETTINGS.vat_rate} KDV eklenmiştir; toplam tutar KDV dahildir. · Minimum sözleşme süresi 3 aydır. · Reklam bütçeleri pakete dahil değildir. · Bu teklif 30 gün geçerlidir.</div>
  </body></html>`;
  if (asPdf) { downloadPdfFromHTML(html, `Teklif-${(quote.client_name || "Musteri").replace(/[^\wğüşıöçĞÜŞİÖÇ -]/g, "")}-${new Date().toISOString().slice(0,10)}.pdf`); return; }
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
      await loadQuoteSettings();
    } catch (e) { /* tablo yoksa */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tabs = [
    { id: "packages", lbl: "📦 Paketler" },
    { id: "addons", lbl: "➕ Ek Hizmetler" },
    { id: "quotes", lbl: "📄 Teklifler" },
    { id: "settings", lbl: "⚙️ Teklif Ayarları" },
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
      {tab === "settings" && <QuoteSettingsTab reload={load} />}
    </div>
  );
}

// ═══════════════ TEKLİF AYARLARI (PDF alt bilgisi, telefon, KDV) ═══════════════
function QuoteSettingsTab({ reload }) {
  const [form, setForm] = useState({ ...QUOTE_SETTINGS });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const rows = Object.entries(form).map(([key, value]) => ({ key, value: String(value) }));
    const { error } = await supabase.from('panel_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nTEKLIF-AYARLARI-SQL kodunu Supabase'de çalıştırın."); return; }
    Object.assign(QUOTE_SETTINGS, { ...form, vat_rate: Number(form.vat_rate) || 20 });
    setSaved(true); setTimeout(() => setSaved(false), 2500);
    if (reload) reload();
  };

  const priceSample = 20000;
  const sampleTotal = priceSample * (1 + (Number(form.vat_rate) || 20) / 100);

  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 18, lineHeight: 1.6, background: T.bgInput, borderRadius: 10, padding: "12px 14px" }}>
        Buradaki bilgiler <strong style={{ color: T.textPrimary }}>fiyat listesi ve teklif PDF'lerinde</strong> görünür. İstediğin zaman değiştirebilirsin.
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>📞 İletişim Bilgileri</div>
      <FormField label="Telefon"><Input placeholder="0 (536) 471 60 12" value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></FormField>
      <FormField label="E-posta"><Input placeholder="info@panormosmedya.com" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></FormField>
      <FormField label="Web Sitesi"><Input placeholder="panormosmedya.com" value={form.web || ""} onChange={e => setForm(f => ({ ...f, web: e.target.value }))} /></FormField>

      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", margin: "22px 0 10px" }}>🧾 KDV</div>
      <FormField label="KDV Oranı (%)">
        <Input type="number" placeholder="20" value={form.vat_rate ?? ""} onChange={e => setForm(f => ({ ...f, vat_rate: e.target.value }))} />
      </FormField>
      <div style={{ fontSize: 12, color: T.greenText, background: T.greenDim, borderRadius: 8, padding: "10px 12px", marginBottom: 18 }}>
        Örnek: <strong>{fmtMoney(priceSample)} + KDV</strong> → KDV Dahil Toplam: <strong>{fmtMoney(sampleTotal)}</strong>
      </div>

      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", margin: "22px 0 10px" }}>📄 Fiyat Listesi Alt Yazısı</div>
      <FormField label="Başlık"><Input placeholder="Teklifimizi incelediğiniz için teşekkür ederiz" value={form.list_footer_title || ""} onChange={e => setForm(f => ({ ...f, list_footer_title: e.target.value }))} /></FormField>
      <FormField label="Açıklama"><Input placeholder="Size özel paket için bizimle iletişime geçin." value={form.list_footer_text || ""} onChange={e => setForm(f => ({ ...f, list_footer_text: e.target.value }))} /></FormField>

      <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", margin: "22px 0 10px" }}>📝 Teklif Alt Yazısı</div>
      <FormField label="Başlık"><Input placeholder="Teklifimizi incelediğiniz için teşekkür ederiz" value={form.quote_footer_title || ""} onChange={e => setForm(f => ({ ...f, quote_footer_title: e.target.value }))} /></FormField>
      <FormField label="Açıklama"><Input placeholder="Başlamak için bizimle iletişime geçin." value={form.quote_footer_text || ""} onChange={e => setForm(f => ({ ...f, quote_footer_text: e.target.value }))} /></FormField>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20 }}>
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Kaydediliyor..." : "💾 Ayarları Kaydet"}</Btn>
        {saved && <span style={{ fontSize: 12, color: T.greenText, fontWeight: 600 }}>✓ Kaydedildi</span>}
      </div>
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

  const openAdd = () => { setEditId(null); setForm({ name: "", tagline: "", price: "", price_note: "aylık", features: [""], is_popular: false }); setModal(true); };
  const openEdit = (p) => { setEditId(p.id); setForm({ name: p.name, tagline: p.tagline, price: p.price, price_note: p.price_note, features: p.features || [], is_popular: p.is_popular }); setModal(true); };

  const save = async () => {
    if (!form.name) { swalAlert("Paket adı zorunlu"); return; }
    const payload = {
      name: form.name, tagline: form.tagline || "", price: parseFloat(form.price) || 0,
      price_note: form.price_note || "", features: (form.features || []).filter(f => f.trim()), is_popular: !!form.is_popular,
    };
    let error;
    if (editId) ({ error } = await supabase.from('pricing_packages').update(payload).eq('id', editId));
    else { payload.sort_order = (packages.length ? Math.max(...packages.map(p => p.sort_order || 0)) : 0) + 1; ({ error } = await supabase.from('pricing_packages').insert(payload)); }
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nFIYATLANDIRMA-SQL kodunu çalıştırın."); return; }
    setModal(false); reload();
  };
  const del = async (id) => { if (!await swalConfirm("Bu paket silinsin mi?")) return; await supabase.from('pricing_packages').delete().eq('id', id); reload(); };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <Btn variant="primary" onClick={openAdd}>+ Paket Ekle</Btn>
        <Btn onClick={() => printPricingCatalog(packages, addons)} style={{ background: T.indigoDim, color: T.indigoText }}>🖨️ Yazdır</Btn>
        <Btn onClick={() => printPricingCatalog(packages, addons, true)} style={{ background: T.greenDim, color: T.greenText }}>📥 PDF İndir</Btn>
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
                <div style={{ fontSize: 24, fontWeight: 800, color: p.is_popular ? T.amberText : T.textPrimary, textAlign: "center" }}>{fmtMoney(Number(p.price))} <span style={{fontSize:13,fontWeight:700}}>+ KDV</span></div>
                <div style={{ fontSize: 10, color: T.textMuted, textAlign: "center", marginBottom: 4 }}>{cleanPriceNote(p.price_note)}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.greenText, textAlign: "center", marginBottom: 12 }}>KDV Dahil: {fmtMoney(withVat(p.price))}</div>
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
            <FormField label="Fiyat Notu"><Input placeholder="aylık" value={form.price_note || ""} onChange={e => setForm(f => ({ ...f, price_note: e.target.value }))} /></FormField>
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
    if (!form.name) { swalAlert("Hizmet adı zorunlu"); return; }
    const payload = { name: form.name, price_text: form.price_text || "" };
    let error;
    if (editId) ({ error } = await supabase.from('pricing_addons').update(payload).eq('id', editId));
    else { payload.sort_order = (addons.length ? Math.max(...addons.map(a => a.sort_order || 0)) : 0) + 1; ({ error } = await supabase.from('pricing_addons').insert(payload)); }
    if (error) { swalAlert("Kaydedilemedi: " + error.message); return; }
    setModal(false); reload();
  };
  const del = async (id) => { if (!await swalConfirm("Silinsin mi?")) return; await supabase.from('pricing_addons').delete().eq('id', id); reload(); };

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

  const [pageNo, setPageNo] = useState(0);
  const PER_PAGE = 7;
  const pageCount = Math.max(1, Math.ceil(quotes.length / PER_PAGE));
  const curPage = Math.min(pageNo, pageCount - 1); // silme sonrası son sayfa boşalırsa geri çek
  const shownQuotes = quotes.slice(curPage * PER_PAGE, (curPage + 1) * PER_PAGE);

  const openAdd = () => { setForm({ business_name: "", package_name: "", price: "", features: [], addons: [], note: "", status: "draft" }); setModal(true); };

  const selectPackage = (name) => {
    const p = packages.find(x => x.name === name);
    if (p) setForm(f => ({ ...f, package_name: p.name, price: p.price, features: [...(p.features || [])] }));
    else setForm(f => ({ ...f, package_name: name }));
  };

  const toggleAddon = (name) => setForm(f => ({ ...f, addons: (f.addons || []).includes(name) ? f.addons.filter(a => a !== name) : [...(f.addons || []), name] }));

  const save = async (thenPrint) => {
    if (!form.business_name) { swalAlert("İşletme adı zorunlu"); return; }
    const payload = {
      business_name: form.business_name, package_name: form.package_name || "", price: parseFloat(form.price) || 0,
      features: (form.features || []).filter(f => f.trim()), addons: form.addons || [], note: form.note || "", status: form.status || "draft",
    };
    const { data, error } = await supabase.from('pricing_quotes').insert(payload).select().single();
    if (error) { swalAlert("Kaydedilemedi: " + error.message); return; }
    setModal(false); setPageNo(0); reload();
    if (thenPrint && data) printQuote(data, addons);
  };

  const setStatus = async (id, status) => { await supabase.from('pricing_quotes').update({ status }).eq('id', id); reload(); };
  const del = async (id) => { if (!await swalConfirm("Bu teklif silinsin mi?")) return; await supabase.from('pricing_quotes').delete().eq('id', id); reload(); };

  return (
    <div>
      <Btn variant="primary" onClick={openAdd} style={{ marginBottom: 18 }}>+ Yeni Teklif Hazırla</Btn>
      {quotes.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Henüz teklif yok. Müşteriye özel teklif hazırlamak için "+ Yeni Teklif Hazırla".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shownQuotes.map(q => {
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
                <Btn onClick={() => printQuote(q, addons, true)} style={{ fontSize: 12, padding: "6px 12px", background: T.greenDim, color: T.greenText }}>📥 PDF</Btn>
                <Btn onClick={() => del(q.id)} style={{ fontSize: 12, padding: "6px 12px", background: T.redDim, color: T.redText }}>🗑</Btn>
              </div>
            );
          })}
          {pageCount > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
              <Btn onClick={() => curPage > 0 && setPageNo(curPage - 1)} style={{ fontSize: 12, padding: "7px 14px", opacity: curPage > 0 ? 1 : 0.4, cursor: curPage > 0 ? "pointer" : "default" }}>← Geri</Btn>
              <div style={{ fontSize: 12, color: T.textMuted }}>Sayfa {curPage + 1} / {pageCount} · {quotes.length} teklif</div>
              <Btn onClick={() => curPage < pageCount - 1 && setPageNo(curPage + 1)} style={{ fontSize: 12, padding: "7px 14px", opacity: curPage < pageCount - 1 ? 1 : 0.4, cursor: curPage < pageCount - 1 ? "pointer" : "default" }}>İleri →</Btn>
            </div>
          )}
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

// ── Yeni müşteri bulma: sektör ve bölgeye göre işletme listesi (OpenStreetMap açık verisi, ücretsiz) ──
const LEAD_SECTORS = [
  { id: "kafe", label: "Kafe / Restoran", q: ['["amenity"~"^(cafe|restaurant|fast_food|bar|pub)$"]'] },
  { id: "pastane", label: "Pastane / Fırın", q: ['["shop"~"^(bakery|pastry|confectionery)$"]'] },
  { id: "guzellik", label: "Kuaför / Güzellik", q: ['["shop"~"^(hairdresser|beauty|cosmetics)$"]'] },
  { id: "saglik", label: "Diş / Klinik / Sağlık", q: ['["amenity"~"^(dentist|clinic|doctors|veterinary)$"]', '["healthcare"]'] },
  { id: "emlak", label: "Emlak Ofisi", q: ['["office"="estate_agent"]', '["shop"="estate_agent"]'] },
  { id: "otel", label: "Otel / Konaklama", q: ['["tourism"~"^(hotel|guest_house|motel|hostel|apartment)$"]'] },
  { id: "giyim", label: "Giyim / Mağaza", q: ['["shop"~"^(clothes|shoes|boutique|jewelry|bag|fashion_accessories)$"]'] },
  { id: "spor", label: "Spor Salonu / Stüdyo", q: ['["leisure"~"^(fitness_centre|sports_centre|dance)$"]'] },
  { id: "oto", label: "Oto Galeri / Servis", q: ['["shop"~"^(car|car_repair|car_parts|motorcycle)$"]'] },
  { id: "mobilya", label: "Mobilya / Ev Dekorasyon", q: ['["shop"~"^(furniture|interior_decoration|kitchen|houseware)$"]'] },
  { id: "egitim", label: "Kurs / Özel Okul", q: ['["amenity"~"^(school|language_school|driving_school|kindergarten|music_school|college)$"]'] },
  { id: "optik", label: "Optik / Eczane", q: ['["shop"="optician"]', '["amenity"="pharmacy"]'] },
  { id: "ofis", label: "Avukat / Muhasebe / Sigorta", q: ['["office"~"^(lawyer|accountant|insurance|tax_advisor)$"]'] },
  { id: "cicek", label: "Çiçekçi / Hediyelik", q: ['["shop"~"^(florist|gift)$"]'] },
];
// Açık harita sunucuları zaman zaman yanıt vermez; sırayla denenir (tarayıcıdan sınandı: ilki POST, ikincisi GET ile çalışıyor)
const OVERPASS_ATTEMPTS = [
  { url: "https://overpass-api.de/api/interpreter", method: "POST" },
  { url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter", method: "GET" },
  { url: "https://overpass-api.de/api/interpreter", method: "GET" },
  { url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter", method: "POST" },
];

async function findBusinesses({ city, district, sectorId }) {
  const sector = LEAD_SECTORS.find(x => x.id === sectorId) || LEAD_SECTORS[0];
  const temiz = (x) => String(x || "").trim().replace(/["\\]/g, "");
  const il = temiz(city), ilce = temiz(district);
  if (!il && !ilce) throw new Error("İl ya da ilçe yazın");
  const alan = il && ilce
    ? `area["name"="${il}"]["admin_level"="4"]->.il;rel(area.il)["name"="${ilce}"]["boundary"="administrative"];map_to_area->.a;`
    : `area["name"="${il || ilce}"]["boundary"="administrative"]->.a;`;
  const query = `[out:json][timeout:25];${alan}(${sector.q.map(f => `nwr${f}["name"](area.a);`).join("")});out center tags 200;`;
  let sonHata = null;
  for (const { url, method } of OVERPASS_ATTEMPTS) {
    const ctl = new AbortController();
    const zaman = setTimeout(() => ctl.abort(), 35000);
    try {
      const r = method === "GET"
        ? await fetch(url + "?data=" + encodeURIComponent(query), { signal: ctl.signal })
        : await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: ctl.signal });
      if (!r.ok) { sonHata = new Error("sunucu meşgul (" + r.status + ")"); continue; }
      const d = await r.json();
      const gorulen = new Set();
      return (d.elements || []).map(e => {
        const t = e.tags || {};
        const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
        return {
          name: t.name, phone: t.phone || t["contact:phone"] || t["contact:mobile"] || "",
          website: t.website || t["contact:website"] || "", instagram: t["contact:instagram"] || "",
          address: [t["addr:street"], t["addr:housenumber"], t["addr:neighbourhood"] || t["addr:suburb"]].filter(Boolean).join(" "),
          lat, lon, sector: sector.label,
        };
      }).filter(b => { const k = (b.name || "").toLocaleLowerCase("tr-TR"); if (!k || gorulen.has(k)) return false; gorulen.add(k); return true; })
        .sort((a, b) => (b.phone ? 1 : 0) - (a.phone ? 1 : 0) || a.name.localeCompare(b.name, "tr"));
    } catch (e) { sonHata = e.name === "AbortError" ? new Error("sunucu yanıt vermedi") : e; }
    finally { clearTimeout(zaman); }
  }
  throw new Error("İşletme listesi alınamadı (" + (sonHata?.message || "bağlantı") + "). Biraz sonra tekrar deneyin.");
}

const LEAD_CONTACT_TYPES = { telefon: "📞 Telefon", whatsapp: "💬 WhatsApp", eposta: "📧 E-posta", yuzyuze: "🤝 Yüz yüze", diger: "📝 Diğer" };
const leadWaPhone = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^0/, "90"); return d.length >= 11 ? d : ""; };
const leadFollowDue = (l) => !!l.next_contact_at && String(l.next_contact_at).slice(0, 10) <= todayStr() && (l.status === "potential" || l.status === "agreed");

function LeadsPage({ refreshData, currentStaff }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("active"); // active = potential+agreed
  const [expanded, setExpanded] = useState(null);
  const [mailLead, setMailLead] = useState(null);
  const [finder, setFinder] = useState(null);       // işletme bulucu: { city, district, sectorId, results, busy, added }
  const [contactModal, setContactModal] = useState(null); // görüşme kaydı: { lead, type, note, next }
  const [waModal, setWaModal] = useState(null);     // WhatsApp mesajı: { lead, text, busy }

  // Görüşmeyi kaydeder: geçmişe ekler, son görüşme ve sonraki takip tarihini yazar
  const logContact = async (lead, { type, note, next }) => {
    const kayit = { at: new Date().toISOString(), type, note: note || "", by: currentStaff?.name || "" };
    const contacts = [kayit, ...(Array.isArray(lead.contacts) ? lead.contacts : [])].slice(0, 50);
    const { error } = await supabase.from('leads').update({ contacts, last_contact_at: kayit.at, next_contact_at: next || null }).eq('id', lead.id);
    if (error) { swalAlert("Görüşme kaydedilemedi: " + error.message); return false; }
    await load();
    return true;
  };
  const waDefault = (l) => `Merhaba, ben Panormos Medya'dan ${currentStaff?.name || ""}.\n\n${l.business_name} için sosyal medya yönetimi, çekim ve reklam hizmetlerimiz hakkında kısaca bilgi vermek isterim. Uygun olduğunuz bir zamanda 5 dakikanızı rica edebilir miyim?\n\nİyi çalışmalar.`;
  const waAi = async () => {
    const l = waModal.lead;
    setWaModal(m => ({ ...m, busy: true }));
    try {
      const text = await askClaude({ system: "Sen Panormos Medya adlı sosyal medya ajansı için yazan bir satış asistanısın. WhatsApp'tan ilk kez yazılacak, kısa (en çok 70 kelime), samimi ama kurumsal, baskı yapmayan Türkçe bir tanışma mesajı yaz. Emoji en fazla bir tane. Sadece mesaj metnini döndür.", prompt: `İşletme: ${l.business_name}. Sektör: ${l.sector || "bilinmiyor"}. Konum: ${[l.district, l.city].filter(Boolean).join(" / ") || "bilinmiyor"}. Yazan kişi: ${currentStaff?.name || "Panormos Medya"}. Notlar: ${l.notes || "yok"}.`, maxTokens: 400 });
      setWaModal(m => m ? { ...m, text: (text || "").trim() || m.text, busy: false } : m);
    } catch (e) { setWaModal(m => m ? { ...m, busy: false } : m); swalAlert("Mesaj hazırlanamadı: " + e.message); }
  };
  const waSend = async () => {
    const tel = leadWaPhone(waModal.lead.phone);
    if (!tel) { swalAlert("Bu kayıtta geçerli bir cep telefonu yok. Düzenle'den telefon ekleyin."); return; }
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(waModal.text || "")}`, "_blank");
    const l = waModal.lead; setWaModal(null);
    setContactModal({ lead: l, type: "whatsapp", note: "WhatsApp mesajı gönderildi", next: "" });
  };

  // İşletme bulucu
  const runFinder = async () => {
    setFinder(f => ({ ...f, busy: true, results: null, error: "" }));
    try {
      const results = await findBusinesses({ city: finder.city, district: finder.district, sectorId: finder.sectorId });
      setFinder(f => f ? { ...f, busy: false, results } : f);
    } catch (e) { setFinder(f => f ? { ...f, busy: false, error: e.message } : f); }
  };
  const inLeads = (name) => leads.some(l => (l.business_name || "").toLocaleLowerCase("tr-TR") === (name || "").toLocaleLowerCase("tr-TR"));
  const addFound = async (list) => {
    const rows = list.filter(b => !inLeads(b.name)).map(b => ({
      business_name: b.name, city: finder.city || "", district: finder.district || "", address: b.address || "",
      phone: b.phone || "", email: "", social_media: b.instagram || "", website: b.website || "", sector: b.sector, source: "harita",
      status: "potential", notes: "",
    }));
    if (!rows.length) return;
    const { error } = await supabase.from('leads').insert(rows);
    if (error) { swalAlert("Listeye eklenemedi: " + error.message); return; }
    await load();
  };

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
    setForm({ business_name: l.business_name, city: l.city, district: l.district, address: l.address, phone: l.phone, email: l.email, social_media: l.social_media, offer1: l.offer1, offer2: l.offer2, offer3: l.offer3, agreed_price: l.agreed_price, status: l.status, notes: l.notes, sector: l.sector, website: l.website, next_contact_at: l.next_contact_at });
    setModal(true);
  };

  const saveLead = async () => {
    if (!form.business_name) { swalAlert("İşletme adı zorunlu"); return; }
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
      sector: form.sector || "", website: form.website || "", next_contact_at: form.next_contact_at || null,
    };
    let error;
    if (editId) {
      ({ error } = await supabase.from('leads').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('leads').insert(payload));
    }
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nSQL kodunu çalıştırdığınızdan emin olun."); return; }
    setModal(false); setForm({}); setEditId(null);
    load();
  };

  const deleteLead = async (id) => {
    if (!await swalConfirm("Bu kayıt silinsin mi?")) return;
    await supabase.from('leads').delete().eq('id', id);
    load();
  };

  // Aktif müşteriye taşı
  const convertToClient = async (lead) => {
    const price = lead.agreed_price || 0;
    if (!await swalConfirm(`"${lead.business_name}" aktif müşterilere taşınacak.\nAylık ücret: ${fmtMoney(price)}\n\nOnaylıyor musunuz?`)) return;
    const initials = (lead.business_name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    const now = new Date();
    const contractStart = `${TR_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
    const colors = ["#6366F1", "#EC4899", "#10B981", "#F59E0B", "#F97316"];
    const { data: yeni, error } = await supabase.from('clients').insert({
      name: lead.business_name,
      category: "",
      initials,
      accent_color: colors[Math.floor(Math.random() * colors.length)],
      phone: lead.phone || "", address: lead.address || "", city: lead.city || "", district: lead.district || "",
      tax_number: "", tax_office: "", social_media: lead.social_media || "",
      platforms: [], publish_days: [], shoot_days: [], publish_times: [],
      contract_start: contractStart,
    }).select('id').single();
    if (error) { swalAlert("Taşıma başarısız: " + error.message); return; }
    if (yeni?.id) await saveClientPrivate(yeni.id, { monthlyFee: Math.round(price), yeni: true });
    await supabase.from('leads').update({ status: 'converted' }).eq('id', lead.id);
    await load();
    if (refreshData) await refreshData();
    swalAlert(`"${lead.business_name}" artık aktif müşteri! 🎉\nMüşteriler sekmesinden bilgilerini tamamlayabilirsiniz.`);
  };

  const filtered = leads.filter(l => {
    if (filter === "takip") return leadFollowDue(l);
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

  const takipSayisi = leads.filter(leadFollowDue).length;
  const FILTER_TABS = [
    { id: "takip", l: `🔔 Bugün Aranacak (${takipSayisi})` },
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Bugün Aranacak" value={takipSayisi} color={takipSayisi > 0 ? T.redText : undefined} sub="Takip zamanı gelen" />
        <StatCard label="Potansiyel" value={stats.potential} color={T.indigoText} sub="Görüşülüyor" />
        <StatCard label="Anlaşıldı" value={stats.agreed} color={T.greenText} sub="Taşınmayı bekliyor" />
        <StatCard label="Müşteri Oldu" value={stats.converted} color={T.amberText} sub="Aktife taşındı" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant="primary" onClick={() => setFinder({ city: "Balıkesir", district: "Bandırma", sectorId: "kafe", results: null, busy: false, error: "" })}>🔎 Yeni Müşteri Bul</Btn>
        <Btn onClick={openAdd}>+ Elle Ekle</Btn>
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
                        <div style={{ fontSize: 11, color: T.textMuted }}>{[l.sector, [l.city, l.district].filter(Boolean).join(" / ")].filter(Boolean).join(" · ") || "—"}{l.phone ? " · " + l.phone : ""}</div>
                      </div>
                      {l.next_contact_at && (l.status === "potential" || l.status === "agreed") && <span style={{ fontSize: 10, fontWeight: 600, padding: "4px 9px", borderRadius: 6, whiteSpace: "nowrap", background: leadFollowDue(l) ? T.redDim : T.bgInput, color: leadFollowDue(l) ? T.redText : T.textMuted }}>🔔 {new Date(l.next_contact_at + "T00:00:00").toLocaleDateString("tr-TR")}</span>}
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
                              {l.website && <div>🌐 <a href={/^https?:/i.test(l.website) ? l.website : "https://" + l.website} target="_blank" rel="noopener noreferrer" style={{ color: T.indigoText }}>{l.website}</a></div>}
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
                        {/* İletişim: ara / yaz / görüşmeyi kaydet */}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {l.phone && <a href={`tel:${String(l.phone).replace(/[^0-9+]/g, "")}`} style={{ textDecoration: "none" }}><Btn style={{ fontSize: 12, padding: "7px 14px", background: T.greenDim, color: T.greenText }}>📞 Ara</Btn></a>}
                          <Btn onClick={() => setWaModal({ lead: l, text: waDefault(l), busy: false })} style={{ fontSize: 12, padding: "7px 14px", background: "#25D366", color: "#fff", border: "1px solid transparent" }}>💬 WhatsApp</Btn>
                          <Btn onClick={() => setContactModal({ lead: l, type: "telefon", note: "", next: "" })} style={{ fontSize: 12, padding: "7px 14px", background: T.amberDim, color: T.amberText }}>📝 Görüşme Kaydet</Btn>
                          <a href={`https://www.google.com/search?q=${encodeURIComponent([l.business_name, l.district, l.city].filter(Boolean).join(" "))}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><Btn style={{ fontSize: 12, padding: "7px 14px" }}>🔍 Google'da Bak</Btn></a>
                        </div>
                        {(l.last_contact_at || (Array.isArray(l.contacts) && l.contacts.length > 0)) && (
                          <div style={{ marginBottom: 12, padding: "10px 12px", background: T.bgInput, borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", marginBottom: 6 }}>Görüşme Geçmişi{l.next_contact_at ? ` · Sonraki takip: ${new Date(l.next_contact_at + "T00:00:00").toLocaleDateString("tr-TR")}` : ""}</div>
                            {(Array.isArray(l.contacts) ? l.contacts : []).slice(0, 6).map((k, ki) => (
                              <div key={ki} style={{ fontSize: 12, color: T.textSecondary, padding: "3px 0" }}>
                                <span style={{ color: T.textMuted }}>{new Date(k.at).toLocaleDateString("tr-TR")}</span> · {LEAD_CONTACT_TYPES[k.type] || k.type}{k.by ? ` · ${k.by}` : ""}{k.note ? ` — ${k.note}` : ""}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {l.status !== "converted" && <Btn variant="primary" onClick={() => convertToClient(l)} style={{ fontSize: 12, padding: "7px 14px", background: T.greenDim, color: T.greenText }}>✅ Aktif Müşteriye Taşı</Btn>}
                          <Btn onClick={() => setMailLead(l)} style={{ fontSize: 12, padding: "7px 14px", background: T.indigoDim, color: T.indigoText }}>📧 E-posta Gönder</Btn>
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

      {mailLead && <LeadMailModal lead={mailLead} currentStaff={currentStaff} onClose={() => setMailLead(null)} onSent={async () => { await logContact(mailLead, { type: "eposta", note: "E-posta gönderildi", next: mailLead.next_contact_at || null }); }} />}

      {/* Görüşme kaydı */}
      {contactModal && (
        <Modal title={`Görüşme Kaydet — ${contactModal.lead.business_name}`} onClose={() => setContactModal(null)} width={480}>
          <FormField label="Nasıl Görüşüldü"><Select value={contactModal.type} onChange={e => setContactModal(m => ({ ...m, type: e.target.value }))}>{Object.entries(LEAD_CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FormField>
          <FormField label="Ne Konuşuldu"><Textarea placeholder="Örn: İlgilendi, fiyat teklifi istedi" value={contactModal.note} onChange={e => setContactModal(m => ({ ...m, note: e.target.value }))} /></FormField>
          <FormField label="Sonraki Takip Tarihi (isteğe bağlı)"><Input type="date" value={contactModal.next || ""} onChange={e => setContactModal(m => ({ ...m, next: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
            {[{ l: "Yarın", n: 1 }, { l: "3 gün sonra", n: 3 }, { l: "1 hafta sonra", n: 7 }, { l: "1 ay sonra", n: 30 }].map(o => (
              <button key={o.n} onClick={() => { const d = new Date(); d.setDate(d.getDate() + o.n); setContactModal(m => ({ ...m, next: localDay(d.toISOString()) })); }} style={{ fontSize: 11.5, padding: "5px 10px", borderRadius: 8, background: T.bgInput, border: `1px solid ${T.border}`, color: T.textSecondary, cursor: "pointer" }}>{o.l}</button>
            ))}
          </div>
          <ModalActions onClose={() => setContactModal(null)} onSave={async () => { if (await logContact(contactModal.lead, contactModal)) setContactModal(null); }} />
        </Modal>
      )}

      {/* WhatsApp mesajı */}
      {waModal && (
        <Modal title={`WhatsApp — ${waModal.lead.business_name}`} onClose={() => setWaModal(null)} width={520}>
          <FormField label={`Mesaj${waModal.lead.phone ? " · " + waModal.lead.phone : " · telefon yok"}`}><Textarea minHeight={170} value={waModal.text} onChange={e => setWaModal(m => ({ ...m, text: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap", marginTop: 6 }}>
            <Btn onClick={waAi} disabled={waModal.busy} style={{ fontSize: 12, background: T.indigoDim, color: T.indigoText }}>{waModal.busy ? "Yazılıyor..." : "✨ Bu işletmeye özel yaz"}</Btn>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn onClick={() => setWaModal(null)}>Vazgeç</Btn>
              <Btn onClick={waSend} style={{ background: "#25D366", color: "#fff", border: "1px solid transparent" }}>WhatsApp'ta Aç</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Yeni müşteri bul */}
      {finder && (
        <Modal title="Yeni Müşteri Bul" onClose={() => setFinder(null)} width={780}>
          <div style={{ fontSize: 12.5, color: T.textMuted, lineHeight: 1.55, marginBottom: 12 }}>Bölge ve sektör seçin; o bölgedeki işletmeleri listeleyeyim. Uygun gördüklerinizi takip listesine ekleyin. Liste açık harita verisinden gelir: işletme adları güvenilirdir, telefon çoğunda yoktur; "Google'da Bak" ile telefonu ve Instagram'ı hızlıca bulabilirsiniz.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr auto", gap: 10, alignItems: "end" }}>
            <FormField label="İl"><Input placeholder="Balıkesir" value={finder.city} onChange={e => setFinder(f => ({ ...f, city: e.target.value }))} /></FormField>
            <FormField label="İlçe"><Input placeholder="Bandırma" value={finder.district} onChange={e => setFinder(f => ({ ...f, district: e.target.value }))} /></FormField>
            <FormField label="Sektör"><Select value={finder.sectorId} onChange={e => setFinder(f => ({ ...f, sectorId: e.target.value }))}>{LEAD_SECTORS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></FormField>
            <div style={{ marginBottom: 14 }}><Btn variant="primary" onClick={runFinder} disabled={finder.busy} style={{ padding: "10px 18px" }}>{finder.busy ? "Aranıyor..." : "Ara"}</Btn></div>
          </div>
          {finder.error && <div style={{ fontSize: 12.5, color: T.redText, background: T.redDim, borderRadius: 9, padding: "10px 12px" }}>{finder.error}</div>}
          {finder.results && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "4px 0 10px", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textPrimary }}>{finder.results.length} işletme bulundu · {finder.results.filter(b => b.phone).length} tanesinin telefonu var · {finder.results.filter(b => inLeads(b.name)).length} tanesi zaten listenizde</div>
                {finder.results.some(b => b.phone && !inLeads(b.name)) && <Btn onClick={() => addFound(finder.results.filter(b => b.phone))} style={{ fontSize: 12, background: T.greenDim, color: T.greenText }}>Telefonu Olanların Hepsini Ekle</Btn>}
              </div>
              {finder.results.length === 0 ? (
                <div style={{ textAlign: "center", color: T.textMuted, fontSize: 13, padding: 24 }}>Bu bölge ve sektörde kayıt bulunamadı. İl / ilçe adını Türkçe karakterlerle, tam yazdığınızdan emin olun ya da başka bir sektör deneyin.</div>
              ) : (
                <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  {finder.results.map((b, bi) => {
                    const var_ = inLeads(b.name);
                    const ara = encodeURIComponent([b.name, finder.district, finder.city].filter(Boolean).join(" "));
                    return (
                      <div key={bi} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderTop: bi ? `1px solid ${T.border}` : "none" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.name}</div>
                          <div style={{ fontSize: 11, color: T.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[b.phone && "📞 " + b.phone, b.address, b.website && "🌐 site var", b.instagram && "📱 " + b.instagram].filter(Boolean).join(" · ") || "İletişim bilgisi yok"}</div>
                        </div>
                        <a href={`https://www.google.com/search?q=${ara}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: T.indigoText, textDecoration: "none", whiteSpace: "nowrap" }}>Google'da Bak</a>
                        {b.lat && <a href={`https://www.google.com/maps/search/?api=1&query=${ara}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: T.indigoText, textDecoration: "none", whiteSpace: "nowrap" }}>Harita</a>}
                        {var_ ? <span style={{ fontSize: 11, fontWeight: 600, color: T.greenText, whiteSpace: "nowrap", padding: "0 6px" }}>✓ Listede</span>
                          : <Btn onClick={() => addFound([b])} style={{ fontSize: 11.5, padding: "5px 10px", whiteSpace: "nowrap" }}>+ Listeye Ekle</Btn>}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </Modal>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <FormField label="Sektör"><Input placeholder="Örn: Kafe" value={form.sector || ""} onChange={e => setForm(f => ({ ...f, sector: e.target.value }))} /></FormField>
            <FormField label="Web Sitesi"><Input placeholder="ornek.com" value={form.website || ""} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} /></FormField>
            <FormField label="Sonraki Takip"><Input type="date" value={form.next_contact_at || ""} onChange={e => setForm(f => ({ ...f, next_contact_at: e.target.value }))} /></FormField>
          </div>
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

// ═══════════════ MUHASEBE ORTAK HESAPLAR ═══════════════
// Bugünün tarihi kullanıcının saatine göre (toISOString gece 00:00–03:00 arası bir önceki günü verir)
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sumAmount = (list, key = "amount") => list.reduce((s, x) => s + Number(x[key] || 0), 0);

// ─────────────────────────────────────────────
// MÜŞTERİ HESAP RAPORU (PDF) — fatura girişleri ve ödemeler, gün gün
// ─────────────────────────────────────────────
function printClientStatement(client, cInvoices, cPayments) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const gun = (d) => { if (!d) return "—"; const x = new Date(String(d).length <= 10 ? d + "T00:00:00" : d); return isNaN(x) ? "—" : x.toLocaleDateString("tr-TR"); };
  const donem = (m) => { const p = String(m || "").split("-"); return p.length === 2 && TR_MONTHS[parseInt(p[1]) - 1] ? `${TR_MONTHS[parseInt(p[1]) - 1]} ${p[0]}` : "—"; };
  const YONTEM = { "havale": "Havale / EFT", "nakit": "Nakit", "kredi kartı": "Kredi Kartı", "çek": "Çek" };
  const yontem = (m) => YONTEM[m] || m || "—";
  const faturaNo = (i) => i.invoice_no || i.parasut_invoice_no || "—";

  const cari = cariHesapla(cPayments, cInvoices);
  const ayBorcu = {};
  cari.months.forEach(m => { ayBorcu[m.m] = m.debt; });
  const odendi = (i) => i.status === "paid" || (ayBorcu[i.month_ref || ""] || 0) <= 0;

  // Gün gün hesap hareketleri (fatura: fatura tarihi, yoksa panele giriş günü; ödeme: ödeme günü)
  const hareketler = [
    ...cInvoices.map(i => ({ tarih: String(i.invoice_date || i.uploaded_at || "").slice(0, 10), tur: "Fatura", belge: faturaNo(i), aciklama: i.description || i.file_name || "", donem: i.month_ref, fatura: Number(i.total || 0), odeme: 0 })),
    ...cPayments.map(p => ({ tarih: String(p.payment_date || p.created_at || "").slice(0, 10), tur: "Ödeme", belge: yontem(p.method), aciklama: p.notes || "", donem: p.month_ref, fatura: 0, odeme: Number(p.amount || 0) })),
  ].sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.tur === "Fatura" ? -1 : 1));

  const faturalar = [...cInvoices].sort((a, b) => String(a.invoice_date || a.uploaded_at || "").localeCompare(String(b.invoice_date || b.uploaded_at || "")));
  const odemeler = [...cPayments].sort((a, b) => String(a.payment_date || "").localeCompare(String(b.payment_date || "")));
  const bos = (n) => `<tr><td colspan="${n}" style="text-align:center;color:#8A8F98;padding:12px;">Kayıt yok</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hesap Raporu</title><style>${PRINT_STYLES}
    .ozet { display:flex; gap:10px; margin-bottom:6px; }
    .ozet .k { flex:1; border:1px solid #E5E7EB; border-radius:9px; padding:10px 12px; }
    .ozet .k .l { font-size:9px; color:#6B7280; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:3px; }
    .ozet .k .v { font-size:16px; font-weight:800; color:#1A2B3F; }
    .ozet .k.borc .v { color:#F25124; } .ozet .k.tamam .v { color:#0A7A4A; }
    td.r, th.r { text-align:right; white-space:nowrap; }
    tr.toplam td { font-weight:800; background:#EEF1F5 !important; border-top:2px solid #1A2B3F; }
    table { page-break-inside:auto; } tr { page-break-inside:avoid; }
    .fatura { color:#1A2B3F; font-weight:700; } .odeme { color:#0A7A4A; font-weight:700; }
    @media print { tr.toplam td { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body>
    <div class="head">
      <div class="logo">panormos <span class="m">medya.</span></div>
      <h1>Müşteri Hesap Raporu</h1>
      <div class="sub">${esc(client.name)} · Rapor tarihi: ${new Date().toLocaleDateString("tr-TR")}${hareketler.length ? ` · Dönem: ${gun(hareketler[0].tarih)} – ${gun(hareketler[hareketler.length - 1].tarih)}` : ""}</div>
    </div>

    <div class="ozet">
      <div class="k"><div class="l">Kesilen Fatura (${cInvoices.length} adet)</div><div class="v">${fmtMoney(cari.invoiced)}</div></div>
      <div class="k"><div class="l">Yapılan Ödeme (${cPayments.length} adet)</div><div class="v">${fmtMoney(cari.paid)}</div></div>
      <div class="k ${cari.balance > 0 ? "borc" : "tamam"}"><div class="l">Kalan Borç</div><div class="v">${fmtMoney(cari.balance)}</div></div>
    </div>

    <h2>Hesap Hareketleri (gün gün)</h2>
    <table>
      <tr><th>Tarih</th><th>İşlem</th><th>Fatura No / Ödeme Yöntemi</th><th>Açıklama</th><th>Ait Olduğu Ay</th><th class="r">Fatura</th><th class="r">Ödeme</th></tr>
      ${hareketler.map(h => `<tr><td>${gun(h.tarih)}</td><td class="${h.tur === "Fatura" ? "fatura" : "odeme"}">${h.tur}</td><td>${esc(h.belge)}</td><td>${esc(h.aciklama) || "—"}</td><td>${donem(h.donem)}</td><td class="r">${h.fatura ? fmtMoney(h.fatura) : ""}</td><td class="r">${h.odeme ? fmtMoney(h.odeme) : ""}</td></tr>`).join("") || bos(7)}
      ${hareketler.length ? `<tr class="toplam"><td colspan="5">Toplam</td><td class="r">${fmtMoney(cari.invoiced)}</td><td class="r">${fmtMoney(cari.paid)}</td></tr>` : ""}
    </table>

    <h2>Fatura Detayları</h2>
    <table>
      <tr><th>Fatura No</th><th>Fatura Tarihi</th><th>Panele Giriş</th><th>Ait Olduğu Ay</th><th class="r">Tutar</th><th class="r">KDV</th><th class="r">Toplam</th><th>Durum</th><th>Ödenme Tarihi</th></tr>
      ${faturalar.map(i => `<tr><td><strong>${esc(faturaNo(i))}</strong></td><td>${gun(i.invoice_date)}</td><td>${gun(i.uploaded_at)}</td><td>${donem(i.month_ref)}</td><td class="r">${fmtMoney(i.amount)}</td><td class="r">${fmtMoney(i.vat)}</td><td class="r"><strong>${fmtMoney(i.total)}</strong></td><td>${odendi(i) ? "Ödendi" : "Bekliyor"}</td><td>${gun(i.paid_at)}</td></tr>`).join("") || bos(9)}
    </table>

    <h2>Ödeme Detayları</h2>
    <table>
      <tr><th>Ödeme Tarihi</th><th>Panele Giriş</th><th>Ait Olduğu Ay</th><th>Yöntem</th><th>Not</th><th class="r">Tutar</th></tr>
      ${odemeler.map(p => `<tr><td>${gun(p.payment_date)}</td><td>${gun(p.created_at)}</td><td>${donem(p.month_ref)}</td><td>${esc(yontem(p.method))}</td><td>${esc(p.notes) || "—"}</td><td class="r"><strong>${fmtMoney(p.amount)}</strong></td></tr>`).join("") || bos(6)}
    </table>

    <div class="terms">Kalan borç, faturası kesilmiş aylarda fatura tutarından o aya yazılan ödemeler düşülerek hesaplanır. Faturası olmayan bir aya girilen ödeme "Yapılan Ödeme" toplamına dahildir ancak başka bir ayın borcunu kapatmaz.</div>
    ${footerHTML("Panormos Medya", "Bu rapor panel kayıtlarından otomatik oluşturulmuştur.")}
  </body></html>`;
  downloadPdfFromHTML(html, `Hesap-Raporu-${String(client.name || "Musteri").replace(/[^\wğüşıöçĞÜŞİÖÇ -]/g, "").trim()}-${todayStr()}.pdf`);
}

// Müşterinin fatura ve ödemelerini çekip hesap raporunu açar (muhasebe verisi yalnızca yöneticiye döner)
async function openClientStatement(client) {
  const [{ data: inv, error: e1 }, { data: pay, error: e2 }] = await Promise.all([
    supabase.from('client_invoices').select('*').eq('client_id', client.id),
    supabase.from('client_payments').select('*').eq('client_id', client.id),
  ]);
  if (e1 || e2) { swalAlert("Hesap raporu hazırlanamadı: " + (e1 || e2).message); return; }
  printClientStatement(client, inv || [], pay || []);
}

// Bir müşterinin carisi, ay ay: o aya kesilen faturalar ve o aya yazılan ödemeler.
// Borç yalnızca faturası kesilmiş aydan doğar; faturasız aya girilen ödeme tahsilat sayılır ama başka ayın borcunu kapatmaz.
function cariHesapla(cPayments, cInvoices) {
  const byMonth = {};
  const ay = (m) => (byMonth[m || ""] = byMonth[m || ""] || { m: m || "", invoiced: 0, paid: 0 });
  cInvoices.forEach(i => { ay(i.month_ref).invoiced += Number(i.total || 0); });
  cPayments.forEach(p => { ay(p.month_ref).paid += Number(p.amount || 0); });
  const months = Object.values(byMonth).sort((a, b) => a.m.localeCompare(b.m)).map(x => ({ ...x, debt: Math.max(0, x.invoiced - x.paid) }));
  return { months, invoiced: sumAmount(months, "invoiced"), paid: sumAmount(months, "paid"), balance: sumAmount(months, "debt") };
}

// Bütün para hareketleri tek listede. Para hangi gün girdi/çıktıysa o tarihle sayılır;
// SGK/vergi/maaş kayıtları ancak "ödendi" işaretlenince gider olur. Özet sekmesi ve Ana Sayfa grafiği bunu kullanır.
function muhasebeHareketleri({ payments = [], incomes = [], expenses = [], entries = [], pieceJobs = [], clientName = () => "Müşteri" }) {
  const ayBasi = (ref) => (ref ? `${ref}-01` : "");
  const rows = [];
  payments.forEach(p => rows.push({ key: "p" + p.id, kind: "gelir", date: p.payment_date || ayBasi(p.month_ref), type: "Müşteri ödemesi", title: clientName(p.client_id), sub: [p.month_ref ? `${monthRefLabel(p.month_ref)} ayına ait` : "", p.method, p.notes].filter(Boolean).join(" · "), amount: Number(p.amount || 0) }));
  incomes.forEach(i => rows.push({ key: "i" + i.id, kind: "gelir", date: i.income_date || "", type: "Diğer gelir", title: i.title || i.source || "Gelir", sub: [i.title ? i.source : "", i.notes].filter(Boolean).join(" · "), amount: Number(i.amount || 0) }));
  pieceJobs.filter(j => j.status === "done").forEach(j => rows.push({ key: "j" + j.id, kind: "gelir", date: j.due_date || ayBasi(j.month_ref), type: "Parça başı iş", title: [clientName(j.client_id), j.title].filter(Boolean).join(" — "), sub: "", amount: Number(j.amount || 0) }));
  expenses.forEach(x => rows.push({ key: "x" + x.id, kind: "gider", date: x.expense_date || "", type: expCatLabel(x.category), title: x.title || expCatLabel(x.category), sub: x.notes || "", amount: Number(x.amount || 0) }));
  entries.filter(e => e.is_paid).forEach(e => rows.push({ key: "e" + e.id, kind: "gider", date: e.paid_date || e.due_date || ayBasi(e.month_ref), type: EXPENSE_TYPES[e.entry_type]?.label || "Diğer gider", title: e.title || "", sub: e.month_ref ? `${monthRefLabel(e.month_ref)} ayına ait` : "", amount: Number(e.amount || 0) }));
  return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// ═══════════════ MUHASEBE ÖZET ═══════════════
function AccountingOverview({ clients, goTab }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState(currentMonthRef());
  const [kind, setKind] = useState("all");

  useEffect(() => {
    (async () => {
      const tables = ["client_payments", "company_incomes", "company_expenses", "accounting_entries", "piece_jobs", "client_invoices"];
      const res = await Promise.all([...tables.map(t => supabase.from(t).select('*')), supabase.from('clients').select('id,name')]);
      setErr(res.map((r, i) => (r.error ? `${tables[i] || "clients"}: ${r.error.message}` : "")).filter(Boolean).join(" · "));
      const [payments, incomes, expenses, entries, pieceJobs, invoices, names] = res.map(r => r.data || []);
      setD({ payments, incomes, expenses, entries, pieceJobs, invoices, names: Object.fromEntries(names.map(c => [c.id, c.name])) });
    })();
  }, []);

  if (!d) return <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>;

  const clientName = (id) => d.names[id] || clients.find(c => c.id === id)?.name || "Müşteri";
  const all = muhasebeHareketleri({ ...d, clientName });
  const ayi = (r) => (r.date || "").slice(0, 7);
  const toplam = (rows, k) => sumAmount(rows.filter(r => r.kind === k));
  const inPeriod = period === "all" ? all : all.filter(r => ayi(r) === period);
  const income = toplam(inPeriod, "gelir");
  const expense = toplam(inPeriod, "gider");
  const net = income - expense;
  const shown = kind === "all" ? inPeriod : inPeriod.filter(r => r.kind === kind);
  const periodLabel = period === "all" ? "Tüm zamanlar" : monthRefLabel(period);

  // Müşterilerden alacak ve ödenmeyi bekleyen giderler dönemden bağımsızdır
  const ids = [...new Set([...d.payments, ...d.invoices].map(x => x.client_id))];
  const receivable = ids.reduce((s, id) => s + cariHesapla(d.payments.filter(p => p.client_id === id), d.invoices.filter(i => i.client_id === id)).balance, 0);
  const unpaidEntries = d.entries.filter(e => !e.is_paid);

  const nowRef = currentMonthRef();
  const periodOptions = [...new Set([nowRef, ...all.map(ayi).filter(Boolean)])].sort().reverse();
  const lastMonths = [];
  for (let i = 0; i < 6; i++) { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - i); lastMonths.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`); }

  const exportRows = async () => {
    const rows = shown.map(r => ({ "Tarih": r.date || "—", "Tür": r.kind === "gelir" ? "Gelir" : "Gider", "Kalem": r.type, "Açıklama": r.title, "Detay": r.sub || "—", "Tutar (₺)": r.kind === "gelir" ? r.amount : -r.amount }));
    await exportPerfectExcel([{ name: "Hareketler", rows, title: `PANORMOS MEDYA — GELİR / GİDER HAREKETLERİ (${periodLabel})` }], `panormos-hareketler-${period === "all" ? "tumu" : period}.xlsx`);
  };

  const th = { textAlign: "right", padding: "6px 10px", fontSize: 11, color: T.textMuted, fontWeight: 600 };
  const td = { textAlign: "right", padding: "7px 10px", fontSize: 13, borderTop: `1px solid ${T.border}`, whiteSpace: "nowrap" };

  return (
    <div>
      {err && <div style={{ background: T.redDim, color: T.redText, padding: "10px 14px", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>Bazı kayıtlar okunamadı, toplamlar eksik olabilir: {err}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ width: 190 }}>
          <Select value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="all">Tüm zamanlar</option>
            {periodOptions.map(m => <option key={m} value={m}>{monthRefLabel(m)}{m === nowRef ? " (bu ay)" : ""}</option>)}
          </Select>
        </div>
        <Btn variant="primary" onClick={() => goTab("cari")}>+ Müşteri Ödemesi</Btn>
        <Btn onClick={() => goTab("harcamalar")}>+ Gider</Btn>
        <Btn onClick={() => goTab("gelirler")}>+ Diğer Gelir</Btn>
        <Btn onClick={() => goTab("giderler")}>+ SGK / Vergi / Maaş</Btn>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 18 }}>
        <StatCard label="Gelir" value={fmtMoney(income)} color={T.greenText} sub={periodLabel} />
        <StatCard label="Gider" value={fmtMoney(expense)} color={T.redText} sub={periodLabel} />
        <StatCard label={net >= 0 ? "Net Kâr" : "Net Zarar"} value={fmtMoney(net)} color={net >= 0 ? T.greenText : T.redText} sub={periodLabel} />
        <StatCard label="Müşterilerden Alacak" value={fmtMoney(receivable)} color={T.amberText} sub="Ödenmemiş faturalar" />
        <StatCard label="Bekleyen Ödemeler" value={fmtMoney(sumAmount(unpaidEntries))} color={T.amberText} sub={`${unpaidEntries.length} kayıt · SGK / vergi / maaş`} />
      </div>

      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 8px", marginBottom: 18, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ ...th, textAlign: "left" }}>SON 6 AY</th><th style={th}>GELİR</th><th style={th}>GİDER</th><th style={th}>NET</th></tr></thead>
          <tbody>
            {lastMonths.map(m => {
              const rows = all.filter(r => ayi(r) === m);
              const g = toplam(rows, "gelir"), x = toplam(rows, "gider");
              return (
                <tr key={m} onClick={() => setPeriod(m)} style={{ cursor: "pointer", background: m === period ? T.bgSurface : "transparent" }}>
                  <td style={{ ...td, textAlign: "left", color: T.textPrimary, fontWeight: 600 }}>{monthRefLabel(m)}</td>
                  <td style={{ ...td, color: T.greenText }}>{fmtMoney(g)}</td>
                  <td style={{ ...td, color: T.redText }}>{fmtMoney(x)}</td>
                  <td style={{ ...td, color: g - x >= 0 ? T.greenText : T.redText, fontWeight: 700 }}>{fmtMoney(g - x)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginRight: "auto" }}>Tüm Hareketler · {periodLabel} ({shown.length})</div>
        {[["all", "Tümü"], ["gelir", "Gelir"], ["gider", "Gider"]].map(([id, l]) => (
          <button key={id} onClick={() => setKind(id)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, background: kind === id ? T.amber : T.bgInput, color: kind === id ? T.white : T.textSecondary, border: `1px solid ${kind === id ? T.amber : T.border}`, cursor: "pointer" }}>{l}</button>
        ))}
        <Btn onClick={exportRows} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel</Btn>
      </div>
      {shown.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>{periodLabel} için kayıt yok. Başka bir dönem seçin ya da yukarıdaki düğmelerle kayıt ekleyin.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map(r => (
            <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, borderLeft: `3px solid ${r.kind === "gelir" ? T.green : T.red}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title || r.type}</div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{r.type} · {r.date ? new Date(r.date + "T00:00:00").toLocaleDateString("tr-TR") : "tarih yok"}{r.sub ? " · " + r.sub : ""}</div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: r.kind === "gelir" ? T.greenText : T.redText, whiteSpace: "nowrap" }}>{r.kind === "gelir" ? "+" : "−"}{fmtMoney(r.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════ MUHASEBE ANA SAYFA ═══════════════
function AccountingPage({ clients, staff, perms }) {
  const [tab, setTab] = useState("ozet");
  // Güvenlik: muhasebe yetkisi yoksa erişimi engelle
  if (!perms.accounting) {
    return <div style={{textAlign:"center",color:T.textMuted,padding:60}}>
      <div style={{fontSize:40,marginBottom:16}}>🔒</div>
      <div style={{fontSize:16,fontWeight:600,color:T.textPrimary}}>Bu bölüme erişim yetkiniz yok</div>
      <div style={{fontSize:13,marginTop:8}}>Muhasebe bilgileri yalnızca yetkili kişiler tarafından görülebilir.</div>
    </div>;
  }
  const tabs = [
    { id: "ozet", lbl: "📊 Özet" },
    { id: "cari", lbl: "💳 Müşteri Cari" },
    { id: "banka", lbl: "🏦 Banka ve Ekstre" },
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
      {tab === "ozet" && <AccountingOverview clients={clients} goTab={setTab} />}
      {tab === "cari" && <AccountingCari clients={clients} />}
      {tab === "banka" && <AccountingBank />}
      {tab === "harcamalar" && <AccountingSpending />}
      {tab === "gelirler" && <AccountingIncome />}
      {tab === "giderler" && <AccountingExpenses staff={staff} />}
      {tab === "izin" && <AccountingLeave staff={staff} />}
      {tab === "takvim" && <AccountingCalendar staff={staff} />}
      {tab === "belgeler" && <AccountingDocuments />}
    </div>
  );
}

// ═══════════════ BANKA VE EKSTRE (şirket / şahsi ayrı gelir-gider) ═══════════════
const BANK_CATEGORIES = [
  { id: "gelir", label: "Gelir / Tahsilat" },
  { id: "iade", label: "İade" },
  { id: "yakit", label: "Yakıt" },
  { id: "yemek", label: "Yemek / Restoran" },
  { id: "market", label: "Market" },
  { id: "alisveris", label: "Alışveriş" },
  { id: "yazilim", label: "Yazılım / Abonelik" },
  { id: "reklam", label: "Reklam" },
  { id: "fatura", label: "Elektrik / Su / İnternet / Telefon" },
  { id: "kira", label: "Kira" },
  { id: "ekipman", label: "Ekipman" },
  { id: "ulasim", label: "Ulaşım / Seyahat" },
  { id: "vergi", label: "Vergi / SGK" },
  { id: "maas", label: "Maaş / Personel" },
  { id: "banka", label: "Banka Masrafı / Faiz" },
  { id: "saglik", label: "Sağlık" },
  { id: "nakit", label: "Nakit Çekim" },
  { id: "kart_odeme", label: "Kart Borcu Ödemesi (hesaba katılmaz)", excluded: true },
  { id: "transfer", label: "Hesaplar Arası Transfer (hesaba katılmaz)", excluded: true },
  { id: "diger", label: "Diğer" },
];
const bankCat = (id) => BANK_CATEGORIES.find(c => c.id === id) || BANK_CATEGORIES[BANK_CATEGORIES.length - 1];
const bankCatLabel = (id) => bankCat(id).label.replace(" (hesaba katılmaz)", "");
const BANK_OWNERS = { sirket: "Şirket", sahsi: "Şahsi" };
const BANK_KINDS = { banka: "Banka Hesabı", kredi_karti: "Kredi Kartı" };

// Açıklamadan kategori tahmini (sıra önemli: ilk eşleşen kazanır)
const BANK_RULES = [
  [/KREDI KARTI.*ODE|KART BORC|EKSTRE ODE|KK ODEME|ODEME.*TESEKKUR|ODEMENIZ ICIN/, "kart_odeme"],
  [/VIRMAN|KENDI HESAB|HESAPLAR ARASI/, "transfer"],
  [/KOMISYON|MASRAF|BSMV|KKDF|FAIZ|HESAP ISLETIM|YILLIK UCRET|KART AIDAT/, "banka"],
  [/VERGI|\bSGK\b|\bGIB\b|BAGKUR|\bMTV\b|\bKDV\b|STOPAJ/, "vergi"],
  [/MAAS|BORDRO/, "maas"],
  [/OPET|SHELL|\bBP\b|PETROL|AYTEMIZ|AKARYAKIT|TOTAL ?ENERJ|LUKOIL|ALPET|\bPO\b/, "yakit"],
  [/FACEBK|FACEBOOK|META ?ADS|GOOGLE ?ADS|TIKTOK ?ADS|REKLAM/, "reklam"],
  [/ADOBE|CANVA|GOOGLE|APPLE\.COM|MICROSOFT|OPENAI|ANTHROPIC|NETFLIX|SPOTIFY|YOUTUBE|HOSTING|GODADDY|NETLIFY|SUPABASE|CAPCUT|ENVATO|PARASUT/, "yazilim"],
  [/ELEKTRIK|DOGALGAZ|TURK TELEKOM|TURKCELL|VODAFONE|SUPERONLINE|TURKNET|INTERNET|UEDAS|ENERJISA|\bSU FATURA|FATURA ODE/, "fatura"],
  [/\bKIRA\b/, "kira"],
  [/RESTORAN|RESTAURANT|CAFE|KAFE|LOKANTA|BURGER|PIZZA|STARBUCKS|YEMEKSEPETI|GETIR ?YEMEK|KEBAP|DONER|PASTANE|FIRIN|KAHVE/, "yemek"],
  [/MIGROS|\bBIM\b|A101|\bSOK\b|CARREFOUR|MARKET|GETIR|MACRO ?CENTER|FILE MARKET/, "market"],
  [/\bTHY\b|PEGASUS|TURKISH AIR|OTOPARK|\bHGS\b|\bOGS\b|TAKSI|UBER|BITAKSI|OTOBUS|BILET|\bOTEL\b|HOTEL|BOOKING|\bIDO\b|FERIBOT|BUDO/, "ulasim"],
  [/ECZANE|HASTANE|SAGLIK|KLINIK|DIS HEKIM/, "saglik"],
  [/\bATM\b|PARA CEKME|NAKIT AVANS/, "nakit"],
  [/TEKNOSA|MEDIA ?MARKT|VATAN BILG|HEPSIBURADA|TRENDYOL|AMAZON|\bN11\b|LC WAIKIKI|ZARA|KOTON|DEFACTO|\bMAVI\b|IKEA|KOCTAS/, "alisveris"],
];
const bankNorm = (s) => String(s || "").toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ş/g, "S").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ö/g, "O").replace(/Ç/g, "C");
function bankGuessCategory(description, amount, kind) {
  const d = bankNorm(description);
  if (amount > 0) {
    // Giren para: yalnızca "hesaba katılmaz" kuralları (kart ödemesi, transfer) denenir; gider kategorisi verilmez
    if (/\bIADE\b/.test(d)) return "iade";
    for (const [re, id] of BANK_RULES) if (bankCat(id).excluded && re.test(d)) return id;
    return kind === "kredi_karti" ? "kart_odeme" : "gelir"; // karta giren para borç ödemesidir
  }
  for (const [re, id] of BANK_RULES) if (re.test(d)) return id;
  return "diger";
}

// "1.234,56 TL", "-1,234.56", "(250,00)", "1.234,56-" gibi yazımları sayıya çevirir
function bankParseAmount(v) {
  if (typeof v === "number") return isFinite(v) ? v : NaN;
  let s = String(v ?? "").trim();
  if (!s) return NaN;
  let neg = /^\(.*\)$/.test(s) || /-\s*$/.test(s) || /^\s*-/.test(s);
  if (/\(B\)|\bBORC\b/i.test(s)) neg = true;
  s = s.replace(/[^0-9.,]/g, "");
  if (!s) return NaN;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    s = /,\d{1,2}$/.test(s) ? s.replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "") : s.replace(/,/g, "");
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ""); // 1.234 → bin ayırıcı
  }
  const n = parseFloat(s);
  return isFinite(n) ? (neg ? -n : n) : NaN;
}

// Excel seri numarası ya da "31.12.2026", "31/12/26 14:05", "2026-12-31" → "2026-12-31"
function bankParseDate(v) {
  const pad = (n) => String(n).padStart(2, "0");
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  return "";
}

// Başlık satırını ve sütunları bulur (bankadan bankaya değişir; kullanıcı ekranda düzeltebilir)
function bankDetectColumns(aoa) {
  let headerRow = 0, best = 0;
  for (let r = 0; r < Math.min(aoa.length, 40); r++) {
    const cells = (aoa[r] || []).map(bankNorm);
    const score = cells.filter(c => /TARIH|ACIKLAMA|TUTAR|BORC|ALACAK|BAKIYE|ISLEM/.test(c)).length;
    if (score > best) { best = score; headerRow = r; }
  }
  const heads = (aoa[headerRow] || []).map(bankNorm);
  const find = (...tests) => { for (const t of tests) { const i = heads.findIndex(h => h && t(h)); if (i >= 0) return i; } return -1; };
  return {
    headerRow,
    map: {
      date: find(h => /ISLEM TARIH/.test(h), h => /TARIH/.test(h)),
      desc: find(h => /ACIKLAMA/.test(h), h => /DETAY|ISLEM ADI|ISLEM TIPI/.test(h), h => /ISLEM/.test(h) && !/TARIH|TUTAR/.test(h)),
      amount: find(h => /TUTAR/.test(h) && !/BAKIYE|TAKSIT/.test(h), h => /MIKTAR/.test(h)),
      debit: find(h => /BORC|CIKAN|HARCAMA/.test(h) && !/BAKIYE/.test(h)),
      credit: find(h => /ALACAK|GIREN|YATAN/.test(h) && !/BAKIYE/.test(h)),
    },
  };
}

// Dosya satırlarını hareketlere çevirir. flip: tek tutar sütununda artı yazılanlar harcamadır (kredi kartı ekstreleri)
function bankBuildRows(aoa, headerRow, map, flip) {
  const out = [];
  const useSplit = map.amount < 0 && (map.debit >= 0 || map.credit >= 0);
  for (let r = headerRow + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const tx_date = bankParseDate(row[map.date]);
    if (!tx_date) continue;
    let amount;
    if (useSplit) {
      const borc = map.debit >= 0 ? Math.abs(bankParseAmount(row[map.debit]) || 0) : 0;
      const alacak = map.credit >= 0 ? Math.abs(bankParseAmount(row[map.credit]) || 0) : 0;
      amount = alacak - borc;
    } else {
      amount = bankParseAmount(row[map.amount]);
      if (flip) amount = -amount;
    }
    if (!isFinite(amount) || amount === 0) continue;
    out.push({ tx_date, description: String(row[map.desc] ?? "").replace(/\s+/g, " ").trim(), amount: Math.round(amount * 100) / 100 });
  }
  return out;
}

// Gelir / gider özeti. "Hesaba katılmaz" kategoriler (kart borcu ödemesi, hesaplar arası transfer) toplamlara girmez.
function bankOzet(list) {
  let gelir = 0, gider = 0, haric = 0;
  const byCat = {}, byMonth = {};
  list.forEach(t => {
    const a = Number(t.amount || 0);
    if (bankCat(t.category).excluded) { haric += Math.abs(a); return; }
    const m = String(t.tx_date).slice(0, 7);
    const ay = (byMonth[m] = byMonth[m] || { m, gelir: 0, gider: 0 });
    if (a > 0) { gelir += a; ay.gelir += a; }
    else {
      gider += -a; ay.gider += -a;
      const c = (byCat[t.category] = byCat[t.category] || { id: t.category, tutar: 0, adet: 0 });
      c.tutar += -a; c.adet += 1;
    }
  });
  return {
    gelir, gider, net: gelir - gider, haric, adet: list.length,
    byCat: Object.values(byCat).sort((a, b) => b.tutar - a.tutar),
    byMonth: Object.values(byMonth).sort((a, b) => a.m.localeCompare(b.m)),
  };
}
const bankAyAdi = (m) => { const p = String(m).split("-"); return `${TR_MONTHS[parseInt(p[1]) - 1] || ""} ${p[0]}`; };
const bankGun = (d) => { const p = String(d || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "—"; };

// Rapor verisi: şirket ve şahsi ayrı; kredi kartı kalemleri kart kart
function bankRaporVerisi(accounts, txs) {
  const accOf = (id) => accounts.find(a => a.id === id);
  const bolum = (owner) => {
    const list = txs.filter(t => accOf(t.account_id)?.owner === owner).sort((a, b) => String(a.tx_date).localeCompare(String(b.tx_date)));
    return { owner, baslik: BANK_OWNERS[owner], list, ozet: bankOzet(list) };
  };
  const kartlar = accounts.filter(a => a.kind === "kredi_karti").map(a => {
    const list = txs.filter(t => t.account_id === a.id).sort((x, y) => String(x.tx_date).localeCompare(String(y.tx_date)));
    return { hesap: a, list, ozet: bankOzet(list) };
  }).filter(k => k.list.length > 0);
  return { bolumler: [bolum("sirket"), bolum("sahsi")], kartlar, accOf };
}

async function bankExcelRapor(accounts, txs, donemEtiketi) {
  const { bolumler, kartlar, accOf } = bankRaporVerisi(accounts, txs);
  const satir = (t) => ({ "Tarih": bankGun(t.tx_date), "Hesap": accOf(t.account_id)?.name || "—", "Açıklama": t.description, "Kategori": bankCatLabel(t.category), "Gelir": t.amount > 0 ? Number(t.amount) : "", "Gider": t.amount < 0 ? -Number(t.amount) : "", "Not": bankCat(t.category).excluded ? "Hesaba katılmaz" : (t.note || "") });
  const sheets = [];
  bolumler.forEach(b => {
    const o = b.ozet;
    const ozetRows = [
      { "Kalem": "Toplam Gelir", "Tutar": o.gelir, "Adet": "" },
      { "Kalem": "Toplam Gider", "Tutar": o.gider, "Adet": "" },
      { "Kalem": "Net (Gelir − Gider)", "Tutar": o.net, "Adet": "" },
      { "Kalem": "Hesaba katılmayan (kart ödemesi / transfer)", "Tutar": o.haric, "Adet": "" },
      { "Kalem": "", "Tutar": "", "Adet": "" },
      { "Kalem": "GİDER KATEGORİLERİ", "Tutar": "", "Adet": "" },
      ...o.byCat.map(c => ({ "Kalem": bankCatLabel(c.id), "Tutar": c.tutar, "Adet": c.adet })),
      { "Kalem": "", "Tutar": "", "Adet": "" },
      { "Kalem": "AYLARA GÖRE (Gelir / Gider)", "Tutar": "", "Adet": "" },
      ...o.byMonth.flatMap(m => [{ "Kalem": `${bankAyAdi(m.m)} — Gelir`, "Tutar": m.gelir, "Adet": "" }, { "Kalem": `${bankAyAdi(m.m)} — Gider`, "Tutar": m.gider, "Adet": "" }]),
    ];
    sheets.push({ name: `${b.baslik} Özet`, title: `${b.baslik.toLocaleUpperCase("tr-TR")} GELİR / GİDER ÖZETİ (${donemEtiketi})`, rows: ozetRows });
    if (b.list.length) sheets.push({ name: `${b.baslik} Hareketler`, title: `${b.baslik.toLocaleUpperCase("tr-TR")} HESAP HAREKETLERİ (${donemEtiketi})`, rows: b.list.map(satir) });
  });
  kartlar.forEach(k => {
    sheets.push({ name: `Kart ${k.hesap.name}`.replace(/[\\/?*[\]:]/g, " ").slice(0, 31), title: `KREDİ KARTI KALEMLERİ — ${k.hesap.name} (${donemEtiketi})`, rows: k.list.map(satir) });
  });
  await exportPerfectExcel(sheets, `gelir-gider-raporu-${todayStr()}.xlsx`);
}

function bankPdfRapor(accounts, txs, donemEtiketi) {
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const { bolumler, kartlar, accOf } = bankRaporVerisi(accounts, txs);
  const hareketTablosu = (list, hesapSutunu) => `<table>
      <tr><th>Tarih</th>${hesapSutunu ? "<th>Hesap</th>" : ""}<th>Açıklama</th><th>Kategori</th><th class="r">Gelir</th><th class="r">Gider</th></tr>
      ${list.map(t => `<tr${bankCat(t.category).excluded ? ' class="haric"' : ""}><td>${bankGun(t.tx_date)}</td>${hesapSutunu ? `<td>${esc(accOf(t.account_id)?.name || "—")}</td>` : ""}<td>${esc(t.description) || "—"}</td><td>${esc(bankCatLabel(t.category))}</td><td class="r">${t.amount > 0 ? fmtMoney(t.amount) : ""}</td><td class="r">${t.amount < 0 ? fmtMoney(-t.amount) : ""}</td></tr>`).join("")}
    </table>`;
  const ozetKutulari = (o) => `<div class="ozet">
      <div class="k tamam"><div class="l">Toplam Gelir</div><div class="v">${fmtMoney(o.gelir)}</div></div>
      <div class="k borc"><div class="l">Toplam Gider</div><div class="v">${fmtMoney(o.gider)}</div></div>
      <div class="k ${o.net >= 0 ? "tamam" : "borc"}"><div class="l">Net</div><div class="v">${fmtMoney(o.net)}</div></div>
    </div>`;
  const bolumHTML = bolumler.map(b => {
    const o = b.ozet;
    if (!b.list.length) return `<h2 class="bolum">${b.owner === "sirket" ? "Şirket Hesapları" : "Şahsi Hesaplar"}</h2><div class="terms">Bu dönemde ${b.baslik.toLocaleLowerCase("tr-TR")} hesaplarında hareket yok.</div>`;
    return `<h2 class="bolum">${b.owner === "sirket" ? "Şirket Hesapları" : "Şahsi Hesaplar"}</h2>
      ${ozetKutulari(o)}
      <div class="iki">
        <div><h2>Gider Kategorileri</h2><table><tr><th>Kategori</th><th class="r">Adet</th><th class="r">Tutar</th><th class="r">Pay</th></tr>
          ${o.byCat.map(c => `<tr><td>${esc(bankCatLabel(c.id))}</td><td class="r">${c.adet}</td><td class="r">${fmtMoney(c.tutar)}</td><td class="r">%${o.gider > 0 ? Math.round(c.tutar / o.gider * 100) : 0}</td></tr>`).join("") || '<tr><td colspan="4">Gider yok</td></tr>'}
        </table></div>
        <div><h2>Aylara Göre</h2><table><tr><th>Ay</th><th class="r">Gelir</th><th class="r">Gider</th><th class="r">Net</th></tr>
          ${o.byMonth.map(m => `<tr><td>${bankAyAdi(m.m)}</td><td class="r">${fmtMoney(m.gelir)}</td><td class="r">${fmtMoney(m.gider)}</td><td class="r">${fmtMoney(m.gelir - m.gider)}</td></tr>`).join("")}
        </table></div>
      </div>
      <h2>${b.baslik} Hesap Hareketleri (${b.list.length} kalem)</h2>
      ${hareketTablosu(b.list, true)}
      ${o.haric > 0 ? `<div class="terms">Gri satırlar (kart borcu ödemesi, hesaplar arası transfer; toplam ${fmtMoney(o.haric)}) gelir-gider toplamına katılmaz; aynı para iki kez sayılmasın diye.</div>` : ""}`;
  }).join("");
  const kartHTML = kartlar.map(k => `<h2 class="bolum">Kredi Kartı — ${esc(k.hesap.name)} (${BANK_OWNERS[k.hesap.owner]})</h2>
      <div class="terms" style="margin:0 0 8px">${esc(k.hesap.bank || "")} · ${k.list.length} kalem · Harcama toplamı ${fmtMoney(k.ozet.gider)}</div>
      ${hareketTablosu(k.list, false)}`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Gelir Gider Raporu</title><style>${PRINT_STYLES}
    .ozet { display:flex; gap:10px; margin-bottom:6px; }
    .ozet .k { flex:1; border:1px solid #E5E7EB; border-radius:9px; padding:10px 12px; }
    .ozet .k .l { font-size:9px; color:#6B7280; text-transform:uppercase; letter-spacing:0.4px; margin-bottom:3px; }
    .ozet .k .v { font-size:16px; font-weight:800; }
    .ozet .k.borc .v { color:#F25124; } .ozet .k.tamam .v { color:#0A7A4A; }
    .iki { display:flex; gap:14px; } .iki > div { flex:1; }
    h2.bolum { font-size:17px; border-bottom:2px solid #F25124; padding-bottom:5px; margin-top:22px; page-break-after:avoid; }
    td.r, th.r { text-align:right; white-space:nowrap; }
    table { page-break-inside:auto; } tr { page-break-inside:avoid; }
    tr.haric td { color:#9CA3AF; }
  </style></head><body>
    <div class="head">
      <div class="logo">panormos <span class="m">medya.</span></div>
      <h1>Gelir / Gider Raporu</h1>
      <div class="sub">Dönem: ${esc(donemEtiketi)} · Rapor tarihi: ${new Date().toLocaleDateString("tr-TR")} · Kaynak: yüklenen banka ve kredi kartı ekstreleri</div>
    </div>
    ${bolumHTML}
    ${kartHTML}
  </body></html>`;
  downloadPdfFromHTML(html, `Gelir-Gider-Raporu-${todayStr()}.pdf`);
}

function AccountingBank() {
  const [accounts, setAccounts] = useState([]);
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [scope, setScope] = useState("sirket");            // sirket | sahsi | all
  const [accountId, setAccountId] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState("");                  // "" = tüm yıl
  const [q, setQ] = useState("");
  const [pageNo, setPageNo] = useState(0);
  const [accModal, setAccModal] = useState(null);          // hesap formu
  const [imp, setImp] = useState(null);                    // ekstre yükleme durumu
  const [txModal, setTxModal] = useState(null);            // elle hareket formu
  const [busy, setBusy] = useState(false);
  const PER_PAGE = 50;

  const load = async () => {
    const { data: acc, error: e1 } = await supabase.from('bank_accounts').select('*').order('created_at');
    // Supabase tek istekte en çok 1000 satır döndürür; hepsini sayfa sayfa al
    const all = []; let e2 = null;
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('bank_transactions').select('*').order('tx_date', { ascending: false }).order('id', { ascending: false }).range(from, from + 999);
      if (error) { e2 = error; break; }
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    setErr([e1, e2].filter(Boolean).map(e => e.message).join(" · "));
    setAccounts(acc || []); setTxs(all); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPageNo(0); }, [scope, accountId, year, month, q]);

  const accOf = (id) => accounts.find(a => a.id === id);
  const years = [...new Set([String(new Date().getFullYear()), ...txs.map(t => String(t.tx_date).slice(0, 4))])].sort().reverse();
  const inPeriod = (t) => (year === "all" || String(t.tx_date).startsWith(year)) && (!month || String(t.tx_date).slice(5, 7) === month);
  const periodTxs = txs.filter(inPeriod);
  const donemEtiketi = year === "all" ? "Tüm zamanlar" : month ? `${TR_MONTHS[parseInt(month) - 1]} ${year}` : `${year} yılı`;
  const term = q.toLocaleLowerCase("tr-TR");
  const shown = periodTxs.filter(t => {
    const a = accOf(t.account_id);
    if (scope !== "all" && a?.owner !== scope) return false;
    if (accountId && String(t.account_id) !== String(accountId)) return false;
    if (term && !(t.description || "").toLocaleLowerCase("tr-TR").includes(term) && !bankCatLabel(t.category).toLocaleLowerCase("tr-TR").includes(term)) return false;
    return true;
  });
  const ozet = bankOzet(shown);
  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const curPage = Math.min(pageNo, pageCount - 1);
  const pageRows = shown.slice(curPage * PER_PAGE, (curPage + 1) * PER_PAGE);
  const scopeAccounts = accounts.filter(a => scope === "all" || a.owner === scope);

  // ── Hesap ekle / düzenle / sil ──
  const saveAccount = async () => {
    if (!accModal.name?.trim()) { swalAlert("Lütfen hesap adı girin"); return; }
    const payload = { name: accModal.name.trim(), bank: accModal.bank || "", kind: accModal.kind || "banka", owner: accModal.owner || "sirket", iban: accModal.iban || "", note: accModal.note || "" };
    const { error } = accModal.id ? await supabase.from('bank_accounts').update(payload).eq('id', accModal.id) : await supabase.from('bank_accounts').insert(payload);
    if (error) { swalAlert("Hesap kaydedilemedi: " + error.message); return; }
    setAccModal(null); load();
  };
  const deleteAccount = async (a) => {
    const n = txs.filter(t => t.account_id === a.id).length;
    if (!await swalConfirm(`"${a.name}" hesabı${n ? ` ve içindeki ${n} hareket` : ""} silinsin mi? Bu işlem geri alınamaz.`)) return;
    const { error } = await supabase.from('bank_accounts').delete().eq('id', a.id);
    if (error) { swalAlert("Hesap silinemedi: " + error.message); return; }
    if (String(accountId) === String(a.id)) setAccountId("");
    load();
  };

  // ── Ekstre dosyası oku ──
  const readFile = async (file, account_id) => {
    if (!file) return;
    try {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      // En çok satırı olan sayfayı al
      let aoa = [];
      wb.SheetNames.forEach(n => { const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }); if (rows.length > aoa.length) aoa = rows; });
      if (aoa.length < 2) { swalAlert("Dosya okunamadı ya da boş görünüyor."); return; }
      const det = bankDetectColumns(aoa);
      const acc = accOf(Number(account_id));
      setImp({ account_id, fileName: file.name, aoa, headerRow: det.headerRow, map: det.map, flip: acc?.kind === "kredi_karti" });
    } catch (e) { swalAlert("Dosya okunamadı: " + e.message + "\n\nBankadan Excel (.xlsx / .xls) ya da CSV olarak indirdiğiniz ekstreyi seçin."); }
  };
  const impRows = imp ? bankBuildRows(imp.aoa, imp.headerRow, imp.map, imp.flip) : [];
  const impHeads = imp ? (imp.aoa[imp.headerRow] || []).map((h, i) => ({ i, label: String(h || "").trim() || `Sütun ${i + 1}` })) : [];
  const impUsesSplit = imp ? imp.map.amount < 0 && (imp.map.debit >= 0 || imp.map.credit >= 0) : false;

  const doImport = async () => {
    const acc = accOf(Number(imp.account_id));
    if (!acc) { swalAlert("Lütfen hesap seçin"); return; }
    if (!impRows.length) { swalAlert("Aktarılacak hareket bulunamadı. Sütun eşleştirmesini kontrol edin."); return; }
    setBusy(true);
    // Aynı hareket daha önce yüklendiyse tekrar ekleme (aynı gün, açıklama ve tutar)
    const key = (t) => `${String(t.tx_date).slice(0, 10)}|${(t.description || "").trim()}|${Number(t.amount).toFixed(2)}`;
    const mevcut = {};
    txs.filter(t => t.account_id === acc.id).forEach(t => { mevcut[key(t)] = (mevcut[key(t)] || 0) + 1; });
    const batch_id = `${Date.now()}`;
    const yeni = [];
    impRows.forEach(r => {
      const k = key(r);
      if (mevcut[k] > 0) { mevcut[k] -= 1; return; }
      yeni.push({ account_id: acc.id, tx_date: r.tx_date, description: r.description, amount: r.amount, category: bankGuessCategory(r.description, r.amount, acc.kind), batch_id, source_file: imp.fileName });
    });
    let hata = null;
    for (let i = 0; i < yeni.length && !hata; i += 500) {
      const { error } = await supabase.from('bank_transactions').insert(yeni.slice(i, i + 500));
      if (error) hata = error;
    }
    setBusy(false);
    if (hata) { swalAlert("Hareketler kaydedilemedi: " + hata.message); load(); return; }
    const atlanan = impRows.length - yeni.length;
    setImp(null);
    await load();
    swalAlert(`✅ ${yeni.length} hareket eklendi${atlanan ? `, ${atlanan} hareket daha önce yüklendiği için atlandı` : ""}.\n\nKategoriler açıklamadan tahmin edildi; listeden tek tek düzeltebilirsiniz.`);
  };

  // ── Hareket işlemleri ──
  const setCategory = async (t, category) => {
    setTxs(prev => prev.map(x => x.id === t.id ? { ...x, category } : x));
    const { error } = await supabase.from('bank_transactions').update({ category }).eq('id', t.id);
    if (error) { swalAlert("Kategori güncellenemedi: " + error.message); load(); }
  };
  const deleteTx = async (t) => {
    if (!await swalConfirm("Bu hareket silinsin mi?")) return;
    const { error } = await supabase.from('bank_transactions').delete().eq('id', t.id);
    if (error) { swalAlert("Hareket silinemedi: " + error.message); return; }
    setTxs(prev => prev.filter(x => x.id !== t.id));
  };
  const saveTx = async () => {
    const tutar = Math.abs(bankParseAmount(txModal.amount));
    if (!txModal.account_id) { swalAlert("Lütfen hesap seçin"); return; }
    if (!txModal.tx_date || !isFinite(tutar) || tutar === 0) { swalAlert("Lütfen tarih ve tutar girin"); return; }
    const amount = txModal.yon === "gelir" ? tutar : -tutar;
    const acc = accOf(Number(txModal.account_id));
    const { error } = await supabase.from('bank_transactions').insert({ account_id: acc.id, tx_date: txModal.tx_date, description: txModal.description || "", amount, category: txModal.category || bankGuessCategory(txModal.description, amount, acc.kind), source_file: "elle" });
    if (error) { swalAlert("Hareket kaydedilemedi: " + error.message); return; }
    setTxModal(null); load();
  };
  // Son yüklemeyi geri al: aynı dosyadan gelen satırları siler
  const batches = Object.values(txs.reduce((m, t) => { if (t.batch_id) { const b = (m[t.batch_id] = m[t.batch_id] || { id: t.batch_id, file: t.source_file, account_id: t.account_id, n: 0, at: t.created_at }); b.n += 1; } return m; }, {})).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
  const undoBatch = async (b) => {
    if (!await swalConfirm(`"${b.file}" dosyasından yüklenen ${b.n} hareket silinsin mi?`)) return;
    const { error } = await supabase.from('bank_transactions').delete().eq('batch_id', b.id);
    if (error) { swalAlert("Yükleme silinemedi: " + error.message); return; }
    load();
  };

  const selStyle = { background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 9, padding: "8px 10px", color: T.textPrimary, fontSize: 12.5, outline: "none" };
  if (loading) return <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Yükleniyor...</div>;

  return (
    <div>
      {err && <div style={{ fontSize: 12.5, color: T.redText, background: T.redDim, borderRadius: 9, padding: "10px 12px", marginBottom: 14 }}>Veriler okunamadı: {err}</div>}

      {/* Hesaplar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>Hesaplar ve Kartlar</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => setAccModal({ name: "", bank: "", kind: "banka", owner: "sirket", iban: "", note: "" })}>+ Hesap / Kart Ekle</Btn>
          <Btn variant="primary" onClick={() => { if (!accounts.length) { swalAlert("Önce bir hesap ya da kart ekleyin."); return; } setImp({ account_id: accountId || accounts[0].id, pick: true }); }}>⬆ Ekstre Yükle</Btn>
        </div>
      </div>
      {accounts.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: "28px 16px", border: `1px dashed ${T.borderLight}`, borderRadius: 14, marginBottom: 20, fontSize: 13, lineHeight: 1.6 }}>
          Henüz hesap yok. Önce "+ Hesap / Kart Ekle" ile şirket hesabınızı, şahsi hesabınızı ve kredi kartlarınızı tanımlayın; sonra her biri için bankadan indirdiğiniz Excel ekstreyi yükleyin.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 10, marginBottom: 20 }}>
          {accounts.map(a => {
            const list = periodTxs.filter(t => t.account_id === a.id);
            const o = bankOzet(list);
            return (
              <div key={a.id} style={{ background: T.bgCard, border: `1px solid ${String(accountId) === String(a.id) ? T.amber : T.border}`, borderRadius: 14, padding: "14px 16px", boxShadow: T.shadow }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: T.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{[a.bank, BANK_KINDS[a.kind]].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: a.owner === "sirket" ? T.indigoDim : T.amberDim, color: a.owner === "sirket" ? T.indigoText : T.amberText, whiteSpace: "nowrap" }}>{BANK_OWNERS[a.owner]}</span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12 }}>
                  <div><div style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gelir</div><div style={{ color: T.greenText, fontWeight: 700 }}>{fmtMoney(o.gelir)}</div></div>
                  <div><div style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Gider</div><div style={{ color: T.redText, fontWeight: 700 }}>{fmtMoney(o.gider)}</div></div>
                  <div><div style={{ color: T.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Kalem</div><div style={{ color: T.textPrimary, fontWeight: 700 }}>{list.length}</div></div>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                  <Btn onClick={() => setImp({ account_id: a.id, pick: true })} style={{ fontSize: 11, padding: "5px 9px" }}>⬆ Ekstre</Btn>
                  <Btn onClick={() => { setScope("all"); setAccountId(String(accountId) === String(a.id) ? "" : a.id); }} style={{ fontSize: 11, padding: "5px 9px" }}>{String(accountId) === String(a.id) ? "Süzgeci Kaldır" : "Hareketler"}</Btn>
                  <Btn onClick={() => setAccModal({ ...a })} style={{ fontSize: 11, padding: "5px 9px" }}>Düzenle</Btn>
                  <Btn onClick={() => deleteAccount(a)} style={{ fontSize: 11, padding: "5px 9px", background: T.redDim, color: T.redText }}>Sil</Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Süzgeçler + rapor */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 4, background: T.bgInput, borderRadius: 10, padding: 4 }}>
          {[{ v: "sirket", l: "Şirket" }, { v: "sahsi", l: "Şahsi" }, { v: "all", l: "Tümü" }].map(o => (
            <button key={o.v} onClick={() => { setScope(o.v); setAccountId(""); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: scope === o.v ? T.bgCard : "transparent", color: scope === o.v ? T.textPrimary : T.textMuted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: scope === o.v ? T.shadow : "none" }}>{o.l}</button>
          ))}
        </div>
        <select value={accountId} onChange={e => setAccountId(e.target.value)} style={selStyle}>
          <option value="">Tüm hesaplar</option>
          {scopeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={selStyle}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
          <option value="all">Tüm zamanlar</option>
        </select>
        <select value={month} onChange={e => setMonth(e.target.value)} style={selStyle} disabled={year === "all"}>
          <option value="">Tüm aylar</option>
          {TR_MONTHS.map((m, i) => <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Açıklamada ara..." style={{ ...selStyle, flex: 1, minWidth: 140 }} />
        <Btn onClick={() => { if (!accounts.length) { swalAlert("Önce bir hesap ekleyin."); return; } setTxModal({ account_id: accountId || scopeAccounts[0]?.id || accounts[0].id, tx_date: todayStr(), yon: "gider", amount: "", description: "", category: "" }); }}>+ Elle Hareket</Btn>
        <Btn onClick={() => { if (!periodTxs.length) { swalAlert("Bu dönemde hareket yok."); return; } bankExcelRapor(accounts, periodTxs, donemEtiketi); }} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel Rapor</Btn>
        <Btn onClick={() => { if (!periodTxs.length) { swalAlert("Bu dönemde hareket yok."); return; } bankPdfRapor(accounts, periodTxs, donemEtiketi); }} style={{ background: T.indigoDim, color: T.indigoText }}>📑 PDF Rapor</Btn>
      </div>

      {/* Özet */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label={`${scope === "all" ? "Toplam" : BANK_OWNERS[scope]} Gelir`} value={fmtMoney(ozet.gelir)} color={T.greenText} sub={donemEtiketi} />
        <StatCard label={`${scope === "all" ? "Toplam" : BANK_OWNERS[scope]} Gider`} value={fmtMoney(ozet.gider)} color={T.redText} sub={donemEtiketi} />
        <StatCard label="Net" value={fmtMoney(ozet.net)} color={ozet.net >= 0 ? T.greenText : T.redText} sub="Gelir − Gider" />
        <StatCard label="Hesaba Katılmayan" value={fmtMoney(ozet.haric)} sub="Kart ödemesi / transfer" />
      </div>

      {/* Kategori dağılımı */}
      {ozet.byCat.length > 0 && (
        <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, marginBottom: 16, boxShadow: T.shadow }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 12 }}>Gider Kategorileri</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ozet.byCat.map(c => (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px,220px) 1fr auto", gap: 12, alignItems: "center", fontSize: 12.5 }}>
                <div style={{ color: T.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bankCatLabel(c.id)} <span style={{ color: T.textMuted }}>· {c.adet}</span></div>
                <div style={{ height: 8, background: T.bgInput, borderRadius: 6, overflow: "hidden" }}><div style={{ width: `${ozet.gider > 0 ? Math.max(2, c.tutar / ozet.byCat[0].tutar * 100) : 0}%`, height: "100%", background: T.amber, borderRadius: 6 }} /></div>
                <div style={{ color: T.textPrimary, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMoney(c.tutar)} <span style={{ color: T.textMuted, fontWeight: 500 }}>%{ozet.gider > 0 ? Math.round(c.tutar / ozet.gider * 100) : 0}</span></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hareketler */}
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, overflow: "hidden", boxShadow: T.shadow }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.textPrimary }}>Hareketler <span style={{ color: T.textMuted, fontWeight: 500 }}>· {shown.length} kalem</span></div>
        {shown.length === 0 ? (
          <div style={{ textAlign: "center", color: T.textMuted, padding: 30, fontSize: 13 }}>Bu süzgeçte hareket yok.</div>
        ) : (
          <div className="pm-scroll-x" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 720 }}>
              <thead><tr style={{ background: T.bgSurface }}>
                {["Tarih", "Hesap", "Açıklama", "Kategori", "Tutar", ""].map((h, i) => <th key={i} style={{ fontSize: 10.5, color: T.textMuted, textTransform: "uppercase", textAlign: i === 4 ? "right" : "left", padding: "9px 12px", whiteSpace: "nowrap" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {pageRows.map(t => {
                  const a = accOf(t.account_id);
                  const haric = bankCat(t.category).excluded;
                  return (
                    <tr key={t.id} style={{ borderTop: `1px solid ${T.border}`, opacity: haric ? 0.6 : 1 }}>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, color: T.textSecondary, whiteSpace: "nowrap" }}>{bankGun(t.tx_date)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: T.textMuted, whiteSpace: "nowrap" }}>{a?.name || "—"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, color: T.textPrimary }}>{t.description || "—"}</td>
                      <td style={{ padding: "6px 12px" }}>
                        <select value={t.category} onChange={e => setCategory(t, e.target.value)} style={{ ...selStyle, padding: "5px 8px", fontSize: 12, maxWidth: 190 }}>
                          {BANK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "8px 12px", fontSize: 13, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", color: t.amount > 0 ? T.greenText : T.redText }}>{t.amount > 0 ? "+" : "−"}{fmtMoney(Math.abs(t.amount))}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}><button onClick={() => deleteTx(t)} className="pm-icon-btn" title="Sil" style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", width: 28, height: 28, borderRadius: 7 }}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 18px", borderTop: `1px solid ${T.border}` }}>
            <Btn onClick={() => setPageNo(curPage - 1)} disabled={curPage === 0} style={{ fontSize: 12 }}>← Geri</Btn>
            <div style={{ fontSize: 12, color: T.textMuted }}>Sayfa {curPage + 1} / {pageCount}</div>
            <Btn onClick={() => setPageNo(curPage + 1)} disabled={curPage >= pageCount - 1} style={{ fontSize: 12 }}>İleri →</Btn>
          </div>
        )}
      </div>

      {/* Son yüklemeler */}
      {batches.length > 0 && (
        <div style={{ marginTop: 14, fontSize: 12, color: T.textMuted }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Son yüklenen ekstreler</div>
          {batches.map(b => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.file} · {accOf(b.account_id)?.name || "—"} · {b.n} kalem</span>
              <button onClick={() => undoBatch(b)} style={{ background: "transparent", border: "none", color: T.redText, cursor: "pointer", fontSize: 12 }}>Yüklemeyi sil</button>
            </div>
          ))}
        </div>
      )}

      {/* Hesap formu */}
      {accModal && (
        <Modal title={accModal.id ? "Hesabı Düzenle" : "Hesap / Kart Ekle"} onClose={() => setAccModal(null)} width={480}>
          <FormField label="Hesap Adı"><Input placeholder="Örn: Garanti Şirket TL, Şahsi Bonus Kart" value={accModal.name || ""} onChange={e => setAccModal(f => ({ ...f, name: e.target.value }))} /></FormField>
          <FormField label="Banka"><Input placeholder="Örn: Garanti BBVA" value={accModal.bank || ""} onChange={e => setAccModal(f => ({ ...f, bank: e.target.value }))} /></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Kime Ait"><Select value={accModal.owner} onChange={e => setAccModal(f => ({ ...f, owner: e.target.value }))}><option value="sirket">Şirket</option><option value="sahsi">Şahsi</option></Select></FormField>
            <FormField label="Tür"><Select value={accModal.kind} onChange={e => setAccModal(f => ({ ...f, kind: e.target.value }))}><option value="banka">Banka Hesabı</option><option value="kredi_karti">Kredi Kartı</option></Select></FormField>
          </div>
          <FormField label="IBAN / Kart Son 4 Hane (isteğe bağlı)"><Input placeholder="TR.. ya da 1234" value={accModal.iban || ""} onChange={e => setAccModal(f => ({ ...f, iban: e.target.value }))} /></FormField>
          <FormField label="Not (isteğe bağlı)"><Input value={accModal.note || ""} onChange={e => setAccModal(f => ({ ...f, note: e.target.value }))} /></FormField>
          <ModalActions onClose={() => setAccModal(null)} onSave={saveAccount} />
        </Modal>
      )}

      {/* Ekstre yükleme */}
      {imp && (
        <Modal title="Ekstre Yükle" onClose={() => { if (!busy) setImp(null); }} width={760}>
          <FormField label="Hangi Hesap / Kart"><Select value={imp.account_id} onChange={e => { const a = accOf(Number(e.target.value)); setImp(f => ({ ...f, account_id: e.target.value, flip: f.aoa ? f.flip : a?.kind === "kredi_karti" })); }}>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {BANK_OWNERS[a.owner]} · {BANK_KINDS[a.kind]}</option>)}
          </Select></FormField>
          <FormField label="Ekstre Dosyası (Excel ya da CSV)">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => readFile(e.target.files?.[0], imp.account_id)} style={{ fontSize: 13, color: T.textSecondary }} />
          </FormField>
          {imp.aoa && (
            <>
              <div style={{ fontSize: 12, color: T.textMuted, margin: "4px 0 10px", lineHeight: 1.5 }}>Sütunları otomatik buldum. Aşağıdaki önizleme yanlış görünüyorsa eşleştirmeyi düzeltin.</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
                {[{ k: "date", l: "Tarih sütunu" }, { k: "desc", l: "Açıklama sütunu" }, { k: "amount", l: "Tutar sütunu" }, { k: "debit", l: "Borç / çıkan sütunu" }, { k: "credit", l: "Alacak / giren sütunu" }].map(f => (
                  <FormField key={f.k} label={f.l}>
                    <Select value={imp.map[f.k]} onChange={e => setImp(s => ({ ...s, map: { ...s.map, [f.k]: Number(e.target.value) } }))}>
                      <option value={-1}>— yok —</option>
                      {impHeads.map(h => <option key={h.i} value={h.i}>{h.label}</option>)}
                    </Select>
                  </FormField>
                ))}
              </div>
              {!impUsesSplit && (
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: T.textSecondary, margin: "2px 0 12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={!!imp.flip} onChange={e => setImp(s => ({ ...s, flip: e.target.checked }))} />
                  Bu dosyada artı yazılan tutarlar harcamadır (kredi kartı ekstrelerinde genelde böyledir)
                </label>
              )}
              <div style={{ fontSize: 12.5, color: T.textPrimary, fontWeight: 600, marginBottom: 8 }}>
                {impRows.length} hareket bulundu · Gelir {fmtMoney(sumAmount(impRows.filter(r => r.amount > 0)))} · Gider {fmtMoney(-sumAmount(impRows.filter(r => r.amount < 0)))}
              </div>
              <div className="pm-scroll-x" style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 10, maxHeight: 230 }}>
                <table style={{ width: "100%" }}>
                  <tbody>
                    {impRows.slice(0, 12).map((r, i) => (
                      <tr key={i} style={{ borderTop: i ? `1px solid ${T.border}` : "none" }}>
                        <td style={{ padding: "6px 10px", fontSize: 12, color: T.textSecondary, whiteSpace: "nowrap" }}>{bankGun(r.tx_date)}</td>
                        <td style={{ padding: "6px 10px", fontSize: 12, color: T.textPrimary }}>{r.description || "—"}</td>
                        <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, textAlign: "right", whiteSpace: "nowrap", color: r.amount > 0 ? T.greenText : T.redText }}>{r.amount > 0 ? "+" : "−"}{fmtMoney(Math.abs(r.amount))}</td>
                      </tr>
                    ))}
                    {impRows.length === 0 && <tr><td style={{ padding: 14, fontSize: 12.5, color: T.textMuted, textAlign: "center" }}>Hareket bulunamadı. Tarih ve tutar sütunlarını yukarıdan seçin.</td></tr>}
                  </tbody>
                </table>
              </div>
              {impRows.length > 12 && <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 6 }}>İlk 12 hareket gösteriliyor.</div>}
            </>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
            <Btn onClick={() => setImp(null)} disabled={busy}>Vazgeç</Btn>
            <Btn variant="primary" onClick={doImport} disabled={busy || !imp.aoa || impRows.length === 0}>{busy ? "Aktarılıyor..." : `${impRows.length || ""} Hareketi İçe Aktar`}</Btn>
          </div>
        </Modal>
      )}

      {/* Elle hareket */}
      {txModal && (
        <Modal title="Elle Hareket Ekle" onClose={() => setTxModal(null)} width={480}>
          <FormField label="Hesap / Kart"><Select value={txModal.account_id} onChange={e => setTxModal(f => ({ ...f, account_id: e.target.value }))}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name} — {BANK_OWNERS[a.owner]}</option>)}</Select></FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <FormField label="Tarih"><Input type="date" value={txModal.tx_date} onChange={e => setTxModal(f => ({ ...f, tx_date: e.target.value }))} /></FormField>
            <FormField label="Tür"><Select value={txModal.yon} onChange={e => setTxModal(f => ({ ...f, yon: e.target.value }))}><option value="gider">Gider</option><option value="gelir">Gelir</option></Select></FormField>
            <FormField label="Tutar (₺)"><Input placeholder="0,00" value={txModal.amount} onChange={e => setTxModal(f => ({ ...f, amount: e.target.value }))} /></FormField>
          </div>
          <FormField label="Açıklama"><Input value={txModal.description} onChange={e => setTxModal(f => ({ ...f, description: e.target.value }))} /></FormField>
          <FormField label="Kategori"><Select value={txModal.category} onChange={e => setTxModal(f => ({ ...f, category: e.target.value }))}><option value="">Otomatik (açıklamadan tahmin et)</option>{BANK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></FormField>
          <ModalActions onClose={() => setTxModal(null)} onSave={saveTx} />
        </Modal>
      )}
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
  { id: "kira", label: "🏠 Kira", color: "#0EA5E9" },
  { id: "fatura", label: "💡 Elektrik / Su / İnternet", color: "#EAB308" },
  { id: "yazilim", label: "💻 Yazılım / Abonelik", color: "#14B8A6" },
  { id: "reklam", label: "📣 Reklam", color: "#F97316" },
  { id: "diger", label: "📌 Diğer", color: "#8A8F98" },
];
const expCatLabel = (id) => EXPENSE_CATEGORIES.find(c => c.id === id)?.label || id;
const expCatColor = (id) => EXPENSE_CATEGORIES.find(c => c.id === id)?.color || "#8A8F98";

// Ortak belge yükleme (Supabase Storage → public URL)
// ═══════════════ FATURA OKUMA (Claude) ═══════════════
function fileToBase64(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Dosya okunamadı")); r.readAsDataURL(file); });
}
// Resimleri (JPG/PNG/WEBP/HEIC…) yapay zekaya göndermeden önce küçültüp JPEG'e çevirir; böylece büyük telefon fotoğrafları da okunur
async function resmiHazirla(file, enBuyuk = 1800) {
  const kaynak = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Resim açılamadı. JPG veya PNG olarak kaydedip tekrar deneyin.")); i.src = kaynak; });
    const oran = Math.min(1, enBuyuk / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * oran)); c.height = Math.max(1, Math.round(img.naturalHeight * oran));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);   // şeffaf PNG'ler siyah kalmasın
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88).split(",")[1];
  } finally { URL.revokeObjectURL(kaynak); }
}
async function extractInvoiceWithAI(file, kind, clientName) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPdf && file.size > 4 * 1024 * 1024) throw new Error("PDF 4 MB'dan büyük; daha küçük bir PDF yükleyin veya faturanın fotoğrafını/ekran görüntüsünü yükleyin.");
  if (!isPdf && file.size > 25 * 1024 * 1024) throw new Error("Resim 25 MB'dan büyük.");
  const block = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: await fileToBase64(file) } }
    : { type: "image", source: { type: "base64", media_type: "image/jpeg", data: await resmiHazirla(file) } };
  const ask = kind === "expense"
    ? `Bu bir GİDER faturası/fişi (Panormos Medya satın almış). Şu alanları JSON olarak çıkar:
{"vendor":"satıcı/firma adı","invoice_no":"fatura/fiş no","date":"YYYY-MM-DD","amount":KDV hariç tutar (sayı),"vat":KDV tutarı (sayı),"total":KDV dahil genel toplam (sayı),"category":"${EXPENSE_CATEGORIES.map(c => c.id).join("|")} (kira=işyeri kirası, fatura=elektrik/su/internet/telefon, yazilim=yazılım ve abonelik, reklam=reklam harcaması, diger=hiçbiri uymuyorsa)","description":"kısa açıklama (ne alınmış)"}`
    : `Bu Panormos Medya'nın ${clientName ? `"${clientName}" adlı müşterisine` : "bir müşterisine"} kestiği SATIŞ faturası. Şu alanları JSON olarak çıkar:
{"invoice_no":"fatura no","date":"YYYY-MM-DD","amount":KDV hariç tutar (sayı),"vat":KDV tutarı (sayı),"total":KDV dahil genel toplam (sayı),"month_ref":"hizmetin ait olduğu ay YYYY-MM (faturada dönem yazıyorsa onu, yoksa fatura tarihinin ayını kullan)","description":"hizmet açıklaması kısa"}`;
  const text = await askClaude({
    system: "Sen bir muhasebe asistanısın. Türk faturalarını okursun. SADECE geçerli JSON döndür; açıklama, markdown, kod bloğu yazma. Bulamadığın alanı boş string veya 0 yap. Tutarları nokta ondalıklı sayı olarak ver (1.234,56 -> 1234.56).",
    messages: [{ role: "user", content: [block, { type: "text", text: ask }] }],
    maxTokens: 600,
  });
  const clean = text.replace(/```json|```/g, "").trim();
  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Fatura okunamadı (JSON yok): " + clean.slice(0, 120));
  const j = JSON.parse(m[0]);
  const num = (v) => { if (typeof v === "number") return v; const t = String(v || "").replace(/[^\d,.\-]/g, ""); if (!t) return 0; return parseFloat(t.includes(",") && !t.includes(".") ? t.replace(",", ".") : t.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")) || 0; };
  j.amount = num(j.amount); j.vat = num(j.vat); j.total = num(j.total);
  if (!j.total && j.amount) j.total = j.amount + j.vat;
  if (!j.amount && j.total) j.amount = j.total - j.vat;
  return j;
}

// Depodaki dosyayı kısa süreli imzalı bağlantıyla açar (depo dışarıya kapalıdır; bağlantı 10 dakika geçerlidir).
// ref: depo yolu ya da eskiden kaydedilmiş açık bağlantı. Depo dışı bağlantılar (Google Drive vb.) doğrudan açılır.
async function openStoredFile(ref) {
  if (!ref) return;
  const marker = "/object/public/client-media/";
  let path = null;
  if (String(ref).includes(marker)) {
    const raw = String(ref).split(marker)[1].split("?")[0];
    try { path = decodeURIComponent(raw); } catch (e) { path = raw; }
  } else if (!/^https?:/i.test(ref)) path = ref;
  if (!path) { window.open(ref, "_blank", "noopener"); return; }
  const w = window.open("", "_blank"); // pencereyi önce aç: tarayıcı açılır pencereyi engellemesin
  const { data, error } = await supabase.storage.from('client-media').createSignedUrl(path, 600);
  if (error || !data?.signedUrl) {
    if (w) w.close();
    swalAlert("Dosya açılamadı: " + (error?.message || "bağlantı oluşturulamadı"));
    return;
  }
  if (w) w.location.href = data.signedUrl; else window.location.href = data.signedUrl;
}
const storedFileLink = (ref) => ({ href: ref, onClick: (e) => { e.preventDefault(); openStoredFile(ref); } });

async function uploadAccountingDoc(file, prefix) {
  const safeName = file.name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // aksanları kaldır
    .replace(/ğ/gi,"g").replace(/ü/gi,"u").replace(/ş/gi,"s")
    .replace(/ı/gi,"i").replace(/ö/gi,"o").replace(/ç/gi,"c")
    .replace(/[^a-zA-Z0-9._-]/g, "_");                  // boşluk ve özel karakterleri _ yap
  const path = `${prefix}/${Date.now()}-${safeName}`;
  const { data, error } = await supabase.storage.from('client-media').upload(path, file);
  if (error) throw error;
  let url = "";
  try { url = supabase.storage.from('client-media').getPublicUrl(data.path).data.publicUrl || ""; } catch (e) {}
  return { url, name: file.name };
}

// Müşteri carisine fatura yükleme + AI okuma + ödendi işaretleme
function ClientInvoiceUpload({ clientId, clientName, onPaid, monthInfo = {} }) {
  const [invoices, setInvoices] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState("");
  const [draft, setDraft] = useState(null); // {file, url, name, fields}
  const fileRef = useRef(null);

  const load = async () => {
    const { data } = await supabase.from('client_invoices').select('*').eq('client_id', clientId).order('uploaded_at', { ascending: false });
    setInvoices(data || []);
  };
  useEffect(() => { load(); }, [clientId]);

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setUploading(true);
    try {
      setStage("Yükleniyor…");
      const r = await uploadAccountingDoc(file, "faturalar");
      setStage("Fatura okunuyor…");
      let fields = {};
      try { fields = await extractInvoiceWithAI(file, "sale", clientName); } catch (ex) { swalAlert("Fatura otomatik okunamadı, bilgileri elle girin.\n" + ex.message); }
      const d = new Date();
      setDraft({ url: r.url, name: r.name, fields: {
        invoice_no: fields.invoice_no || "", invoice_date: fields.date || todayStr(),
        amount: fields.amount || "", vat: fields.vat || "", total: fields.total || "",
        month_ref: fields.month_ref || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        description: fields.description || "",
      }});
    } catch (err) { swalAlert("Yükleme hatası: " + err.message + "\n\nSTORAGE-POLITIKA-SQL kodunu çalıştırın."); }
    setUploading(false); setStage("");
  };

  const saveDraft = async () => {
    const f = draft.fields;
    const total = parseFloat(f.total) || 0;
    if (!total) { swalAlert("Toplam tutar zorunlu"); return; }
    const { error } = await supabase.from('client_invoices').insert({
      client_id: clientId, file_url: draft.url, file_name: draft.name,
      invoice_no: f.invoice_no || "", invoice_date: f.invoice_date || null,
      amount: parseFloat(f.amount) || 0, vat: parseFloat(f.vat) || 0, total,
      month_ref: f.month_ref || null, description: f.description || "", status: "pending",
    });
    if (error) { swalAlert("Fatura kaydedilemedi: " + error.message + "\n\nFATURA-SQL (client_invoices sütunları) kodunu çalıştırdığınızdan emin olun."); return; }
    setDraft(null); load();
  };

  // Fatura, kendi "ödendi" işaretiyle ya da o aya girilmiş ödemeler tutarını karşılıyorsa ödenmiş sayılır
  const ayBilgisi = (inv) => monthInfo[inv.month_ref || ""];
  const odemeyleKapali = (inv) => { const x = ayBilgisi(inv); return !!x && x.invoiced > 0 && x.debt === 0; };
  const odendi = (inv) => inv.status === "paid" || odemeyleKapali(inv);

  const markPaid = async (inv) => {
    // O aya daha önce kısmi ödeme girildiyse yalnızca kalan tutar için ödeme kaydı açılır
    const x = ayBilgisi(inv);
    const tutar = x ? Math.min(Number(inv.total || 0), x.debt) : Number(inv.total || 0);
    if (!await swalConfirm(`${inv.invoice_no || inv.file_name} — ${fmtMoney(tutar)} ödendi olarak işaretlensin ve cariye ödeme kaydı düşülsün mü?`)) return;
    const today = todayStr();
    const { data: pay, error: e1 } = await supabase.from('client_payments').insert({
      client_id: clientId, amount: tutar, payment_date: today,
      month_ref: inv.month_ref || today.slice(0, 7), method: "havale", notes: `Fatura ${inv.invoice_no || ""}`.trim(),
    }).select().single();
    if (e1) { swalAlert("Ödeme kaydı oluşturulamadı: " + e1.message); return; }
    const { error: e2 } = await supabase.from('client_invoices').update({ status: "paid", paid_at: today, payment_id: pay?.id || null }).eq('id', inv.id);
    if (e2) {
      if (pay?.id != null) await supabase.from('client_payments').delete().eq('id', pay.id);
      swalAlert("Fatura güncellenemedi: " + e2.message);
      return;
    }
    load(); onPaid && onPaid();
  };

  const markUnpaid = async (inv) => {
    if (!inv.payment_id && odemeyleKapali(inv)) { swalAlert("Bu fatura, aşağıdaki Ödeme Geçmişi'nde kayıtlı ödemelerle kapanmış.\n\nÖdendi işaretini kaldırmak için ilgili ödemeyi Ödeme Geçmişi'nden silin."); return; }
    if (!await swalConfirm("Ödendi işareti kaldırılsın mı? (Bağlı ödeme kaydı da silinir)")) return;
    if (inv.payment_id) await supabase.from('client_payments').delete().eq('id', inv.payment_id);
    await supabase.from('client_invoices').update({ status: "pending", paid_at: null, payment_id: null }).eq('id', inv.id);
    load(); onPaid && onPaid();
  };

  const del = async (inv) => {
    if (!await swalConfirm("Bu fatura silinsin mi?" + (inv.payment_id ? " (Bağlı ödeme kaydı da silinir)" : ""))) return;
    if (inv.payment_id) await supabase.from('client_payments').delete().eq('id', inv.payment_id);
    await supabase.from('client_invoices').delete().eq('id', inv.id); load(); onPaid && onPaid();
  };

  const pending = invoices.filter(i => !odendi(i)).reduce((s, i) => s + Number(i.total || 0), 0);
  const F = draft?.fields;
  const setF = (k, v) => setDraft(d => ({ ...d, fields: { ...d.fields, [k]: v } }));

  return (
    <div style={{ marginTop: 12, padding: "12px", background: T.bgInput, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: invoices.length ? 10 : 0, flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 600, textTransform: "uppercase" }}>🧾 Faturalar ({invoices.length}){pending > 0 && <span style={{ color: T.amberText, marginLeft: 8 }}>· Bekleyen {fmtMoney(pending)}</span>}</div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={onFile} style={{ display: "none" }} />
          <Btn variant="primary" onClick={() => !uploading && fileRef.current && fileRef.current.click()} style={{ fontSize: 11, padding: "6px 12px", opacity: uploading ? 0.7 : 1 }}>{uploading ? `⏳ ${stage}` : "📎 Fatura Yükle (PDF / JPG / PNG) → otomatik oku"}</Btn>
        </div>
      </div>
      {invoices.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {invoices.map(inv => {
            const paid = odendi(inv);
            return (
            <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: T.bgCard, borderRadius: 8, borderLeft: `3px solid ${paid ? T.green : T.amber}` }}>
              <span style={{ fontSize: 16 }}>🧾</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a {...storedFileLink(inv.file_url)} target="_blank" rel="noopener" style={{ fontSize: 13, color: T.indigoText, fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{inv.invoice_no ? `Fatura ${inv.invoice_no}` : inv.file_name}{inv.description ? ` · ${inv.description}` : ""}</a>
                <div style={{ fontSize: 10, color: T.textMuted }}>{inv.invoice_date || (inv.uploaded_at ? new Date(inv.uploaded_at).toLocaleDateString("tr-TR") : "")}{inv.month_ref ? ` · ${monthRefLabel(inv.month_ref)}` : ""}{paid && inv.paid_at ? ` · ✓ ${inv.paid_at} ödendi` : ""}</div>
              </div>
              {Number(inv.total) > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{fmtMoney(inv.total)}</div>{Number(inv.vat) > 0 && <div style={{ fontSize: 10, color: T.textMuted }}>KDV {fmtMoney(inv.vat)}</div>}</div>}
              {Number(inv.total) > 0 && (paid
                ? <button onClick={() => markUnpaid(inv)} title="Ödendi işaretini kaldır" style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, background: T.greenDim, color: T.greenText, border: "none", cursor: "pointer" }}>✓ Ödendi</button>
                : <button onClick={() => markPaid(inv)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 6, background: T.amber, color: "#fff", border: "none", cursor: "pointer" }}>Ödendi İşaretle</button>)}
              <button onClick={() => del(inv)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>);
          })}
        </div>
      )}
      {draft && (
        <Modal title={`Fatura Kontrol — ${clientName}`} onClose={() => setDraft(null)} width={560}>
          <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>Faturadan okunan bilgiler aşağıda. Kontrol edip Kaydet'e basın. <a {...storedFileLink(draft.url)} target="_blank" rel="noopener" style={{ color: T.indigoText }}>📄 Faturayı aç</a></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <FormField label="Fatura No"><Input value={F.invoice_no} onChange={e => setF("invoice_no", e.target.value)} /></FormField>
            <FormField label="Fatura Tarihi"><Input type="date" value={F.invoice_date} onChange={e => setF("invoice_date", e.target.value)} /></FormField>
            <FormField label="KDV Hariç (₺)"><Input type="number" value={F.amount} onChange={e => setF("amount", e.target.value)} /></FormField>
            <FormField label="KDV (₺)"><Input type="number" value={F.vat} onChange={e => setF("vat", e.target.value)} /></FormField>
            <FormField label="Genel Toplam (₺)"><Input type="number" value={F.total} onChange={e => setF("total", e.target.value)} /></FormField>
            <FormField label="Ait Olduğu Ay"><Select value={F.month_ref} onChange={e => setF("month_ref", e.target.value)}>{[...new Set([F.month_ref, ...monthRefOptions()])].filter(Boolean).map(m => <option key={m} value={m}>{monthRefLabel(m)}</option>)}</Select></FormField>
          </div>
          <FormField label="Açıklama"><Input value={F.description} onChange={e => setF("description", e.target.value)} /></FormField>
          <ModalActions onClose={() => setDraft(null)} onSave={saveDraft} saveLabel="Kaydet (Bekliyor)" />
        </Modal>
      )}
    </div>
  );
}

function AccountingSpending() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [aiBusy, setAiBusy] = useState(false);
  const aiFileRef = useRef(null);
  const onAiFile = async (e) => {
    const f = e.target.files[0]; if (aiFileRef.current) aiFileRef.current.value = ""; if (!f) return;
    setAiBusy(true);
    try {
      const j = await extractInvoiceWithAI(f, "expense");
      const cat = EXPENSE_CATEGORIES.find(c => c.id === j.category) ? j.category : "ofis";
      setForm({ category: cat, title: [j.vendor, j.description].filter(Boolean).join(" - "), amount: j.total || j.amount || "", expense_date: j.date || todayStr(), notes: j.invoice_no ? `Fatura no: ${j.invoice_no}` : "", vendor: j.vendor || "", invoice_no: j.invoice_no || "" });
      setFile(f); setModal(true);
    } catch (ex) { swalAlert("Fatura okunamadı: " + ex.message); }
    setAiBusy(false);
  };

  const [err, setErr] = useState("");
  const [period, setPeriod] = useState("all");
  const load = async () => {
    const { data, error } = await supabase.from('company_expenses').select('*').order('expense_date', { ascending: false }).order('id', { ascending: false });
    setErr(error ? error.message : "");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (uploading) return;
    if (!form.category || !form.amount) { swalAlert("Kategori ve tutar zorunlu"); return; }
    setUploading(true);
    let doc = null;
    if (file) {
      try { doc = await uploadAccountingDoc(file, "giderler"); }
      catch (e) { setUploading(false); swalAlert("Belge yüklenemedi: " + e.message); return; }
    }
    const row = {
      category: form.category, title: form.title || "", amount: parseFloat(form.amount) || 0,
      expense_date: form.expense_date || todayStr(), notes: form.notes || "",
      vendor: form.vendor || "", invoice_no: form.invoice_no || "",
    };
    // Düzenlemede yeni belge seçilmediyse eski belge korunur
    if (doc || !form.id) { row.document_url = doc?.url || ""; row.document_name = doc?.name || ""; }
    const { error } = form.id
      ? await supabase.from('company_expenses').update(row).eq('id', form.id)
      : await supabase.from('company_expenses').insert(row);
    setUploading(false);
    if (error) { swalAlert("Kaydedilemedi: " + error.message); return; }
    // Yeni kayıt, seçili dönem ya da kategori süzgeci yüzünden listede gizli kalmasın
    setPeriod(pr => (pr === "all" || pr === row.expense_date.slice(0, 7) ? pr : "all"));
    setFilterCat(fc => (fc === "all" || fc === row.category ? fc : "all"));
    setModal(false); setForm({}); setFile(null);
    load();
  };

  const del = async (id) => { if (!await swalConfirm("Bu gider silinsin mi?")) return; await supabase.from('company_expenses').delete().eq('id', id); load(); };

  const now = new Date();
  const ayi = (i) => String(i.expense_date || "").slice(0, 7);
  const inPeriod = period === "all" ? items : items.filter(i => ayi(i) === period);
  const filtered = filterCat === "all" ? inPeriod : inPeriod.filter(i => i.category === filterCat);
  const total = sumAmount(items);
  const thisMonth = sumAmount(items.filter(i => ayi(i) === currentMonthRef()));
  const periodOptions = [...new Set([currentMonthRef(), ...items.map(ayi).filter(Boolean)])].sort().reverse();
  const byCat = {};
  inPeriod.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + Number(i.amount || 0); });

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Toplam Gider" value={fmtMoney(total)} color={T.amberText} />
        <StatCard label="Bu Ay" value={fmtMoney(thisMonth)} color={T.redText} />
      </div>
      {err && <div style={{ background: T.redDim, color: T.redText, padding: "10px 14px", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>Giderler okunamadı: {err}</div>}

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
        <Btn variant="primary" onClick={() => { setForm({ category: "yakit", expense_date: todayStr() }); setFile(null); setModal(true); }}>+ Gider Ekle</Btn>
        <input ref={aiFileRef} type="file" accept=".pdf,image/*" onChange={onAiFile} style={{ display: "none" }} />
        <Btn onClick={() => !aiBusy && aiFileRef.current?.click()} style={{ background: T.indigoDim, color: T.indigoText, opacity: aiBusy ? 0.7 : 1 }}>{aiBusy ? "⏳ Fatura okunuyor…" : "📄 Faturadan Gider Ekle (PDF / JPG / PNG, otomatik oku)"}</Btn>
        {filterCat !== "all" && <Btn onClick={() => setFilterCat("all")} style={{ fontSize: 12 }}>✕ Filtreyi Temizle ({expCatLabel(filterCat)})</Btn>}
        <div style={{ width: 170, marginLeft: "auto" }}>
          <Select value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="all">Tüm zamanlar</option>
            {periodOptions.map(m => <option key={m} value={m}>{monthRefLabel(m)}</option>)}
          </Select>
        </div>
      </div>
      {(period !== "all" || filterCat !== "all") && <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 10 }}>Listelenen: {filtered.length} kayıt · {fmtMoney(sumAmount(filtered))}</div>}

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div> :
        filtered.length === 0 ? <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Gider kaydı yok</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map(i => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, borderLeft: `3px solid ${expCatColor(i.category)}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{i.title || expCatLabel(i.category)}</div>
                  <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{expCatLabel(i.category)} · {i.expense_date}{i.notes ? " · " + i.notes : ""}</div>
                </div>
                {i.document_url && <a {...storedFileLink(i.document_url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: T.indigoDim, color: T.indigoText, textDecoration: "none" }}>📄 Belge</a>}
                <div style={{ fontSize: 15, fontWeight: 700, color: T.amberText, whiteSpace: "nowrap" }}>{fmtMoney(Number(i.amount))}</div>
                <button onClick={() => { setForm({ ...i }); setFile(null); setModal(true); }} title="Düzenle" style={{ background: "none", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 14 }}>✎</button>
                <button onClick={() => del(i.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}

      {modal && (
        <Modal title={form.id ? "Gider Düzenle" : "Gider Ekle"} onClose={() => setModal(false)}>
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
            {!file && form.id && form.document_name && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Kayıtlı belge: {form.document_name} (yeni dosya seçmezseniz korunur)</div>}
          </FormField>
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={save} style={{ opacity: uploading ? 0.6 : 1 }}>{uploading ? "Kaydediliyor..." : "Kaydet"}</Btn>
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

  const [err, setErr] = useState("");
  const load = async () => {
    const { data, error } = await supabase.from('company_incomes').select('*').order('income_date', { ascending: false }).order('id', { ascending: false });
    setErr(error ? error.message : "");
    setItems(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (uploading) return;
    if (!form.amount) { swalAlert("Tutar zorunlu"); return; }
    setUploading(true);
    let doc = null;
    if (file) {
      try { doc = await uploadAccountingDoc(file, "gelirler"); }
      catch (e) { setUploading(false); swalAlert("Belge yüklenemedi: " + e.message); return; }
    }
    const row = {
      source: form.source || "", title: form.title || "", amount: parseFloat(form.amount) || 0,
      income_date: form.income_date || todayStr(), notes: form.notes || "",
    };
    // Düzenlemede yeni belge seçilmediyse eski belge korunur
    if (doc || !form.id) { row.document_url = doc?.url || ""; row.document_name = doc?.name || ""; }
    const { error } = form.id
      ? await supabase.from('company_incomes').update(row).eq('id', form.id)
      : await supabase.from('company_incomes').insert(row);
    setUploading(false);
    if (error) { swalAlert("Kaydedilemedi: " + error.message); return; }
    setModal(false); setForm({}); setFile(null);
    load();
  };

  const del = async (id) => { if (!await swalConfirm("Bu gelir silinsin mi?")) return; await supabase.from('company_incomes').delete().eq('id', id); load(); };

  const now = new Date();
  const total = sumAmount(items);
  const thisMonth = sumAmount(items.filter(i => String(i.income_date || "").slice(0, 7) === currentMonthRef()));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12, marginBottom: 16 }}>
        <StatCard label="Diğer Gelirler Toplamı" value={fmtMoney(total)} color={T.greenText} />
        <StatCard label="Bu Ay" value={fmtMoney(thisMonth)} color={T.greenText} />
      </div>
      <div style={{ fontSize: 12, color: T.textSecondary, marginBottom: 14 }}>Burası müşteri ödemeleri dışındaki gelirler içindir. Müşteri ödemeleri Müşteri Cari sekmesinde girilir; bütün gelirlerin toplamı Özet sekmesindedir.</div>
      {err && <div style={{ background: T.redDim, color: T.redText, padding: "10px 14px", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>Gelirler okunamadı: {err}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <Btn variant="primary" onClick={() => { setForm({ income_date: todayStr() }); setFile(null); setModal(true); }}>+ Gelir Ekle</Btn>
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
                {i.document_url && <a {...storedFileLink(i.document_url)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6, background: T.indigoDim, color: T.indigoText, textDecoration: "none" }}>📄 Belge</a>}
                <div style={{ fontSize: 15, fontWeight: 700, color: T.greenText, whiteSpace: "nowrap" }}>{fmtMoney(Number(i.amount))}</div>
                <button onClick={() => { setForm({ ...i }); setFile(null); setModal(true); }} title="Düzenle" style={{ background: "none", border: "none", color: T.textSecondary, cursor: "pointer", fontSize: 14 }}>✎</button>
                <button onClick={() => del(i.id)} style={{ background: "none", border: "none", color: T.redText, cursor: "pointer", fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}

      {modal && (
        <Modal title={form.id ? "Gelir Düzenle" : "Gelir Ekle"} onClose={() => setModal(false)}>
          <FormField label="Gelir Kaynağı"><Input placeholder="Örn: Reklam geliri, Ek proje" value={form.source || ""} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} /></FormField>
          <FormField label="Açıklama"><Input placeholder="Detay" value={form.title || ""} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></FormField>
          <FormField label="Tutar (₺)"><Input type="number" placeholder="0" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></FormField>
          <FormField label="Tarih"><Input type="date" value={form.income_date || ""} onChange={e => setForm(f => ({ ...f, income_date: e.target.value }))} /></FormField>
          <FormField label="📄 Belge (PDF/Görsel — dekont, fatura vb.)">
            <input type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files[0])} style={{ width: "100%", fontSize: 12, color: T.textSecondary, padding: "8px", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8 }} />
            {file && <div style={{ fontSize: 11, color: T.greenText, marginTop: 4 }}>✓ {file.name}</div>}
            {!file && form.id && form.document_name && <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>Kayıtlı belge: {form.document_name} (yeni dosya seçmezseniz korunur)</div>}
          </FormField>
          <FormField label="Not"><Input placeholder="İsteğe bağlı" value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></FormField>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <Btn onClick={() => setModal(false)}>Vazgeç</Btn>
            <Btn variant="primary" onClick={save} style={{ opacity: uploading ? 0.6 : 1 }}>{uploading ? "Kaydediliyor..." : "Kaydet"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ MÜŞTERİ CARİ ═══════════════
// EmlakPanelim'e kayıt olan her firmayı muhasebede "EmlakPanelim müşterisi" olarak açar; ad / telefon / e-posta ve
// fatura bilgilerini güncel tutar. Yalnızca yönetici çağırabilir (sunucu işlevi yönetici oturumu ister).
async function syncEmlakClients() {
  const res = await panelFetch("/.netlify/functions/emlakpanelim-admin");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { added: 0, error: data.error || ("HTTP " + res.status) };
  const firmalar = (data.firmalar || []).filter(f => (f.ad || "").trim() && !/^demo$/i.test((f.ad || "").trim()));
  const planOf = {}; (data.planlar || []).forEach(pl => { planOf[pl.id] = pl; });
  const { data: mevcut, error } = await supabase.from('clients').select('id,name,phone,email,address,tax_number,tax_office,description,emlak_firma_id,deleted_at').not('emlak_firma_id', 'is', null);
  if (error) return { added: 0, error: error.message };
  const byFirma = {}; (mevcut || []).forEach(c => { byFirma[c.emlak_firma_id] = c; });
  let added = 0;
  for (const f of firmalar) {
    const alanlar = {
      name: f.ad.trim(), phone: f.telefon || "", email: f.eposta || "", address: f.fatura_adresi || f.adres || "",
      tax_number: f.vergi_no || "", tax_office: f.vergi_dairesi || "",
      description: ["EmlakPanelim abonesi", f.fatura_unvani && "Fatura unvanı: " + f.fatura_unvani, planOf[f.plan_id]?.ad && "Paket: " + planOf[f.plan_id].ad, f.durum && "Durum: " + ({ deneme: "Deneme", aktif: "Aktif", donduruldu: "Donduruldu" }[f.durum] || f.durum), f.abonelik_bitis && "Abonelik bitişi: " + new Date(f.abonelik_bitis + "T00:00:00").toLocaleDateString("tr-TR")].filter(Boolean).join(" · "),
    };
    const var_ = byFirma[f.id];
    if (var_) {
      // Müşteri cariden kaldırıldıysa geri getirilmez; duruyorsa bilgileri güncellenir
      if (!var_.deleted_at && Object.keys(alanlar).some(k => (var_[k] || "") !== alanlar[k])) await supabase.from('clients').update(alanlar).eq('id', var_.id);
      continue;
    }
    const { data: yeni, error: e2 } = await supabase.from('clients').insert({
      ...alanlar, category: "EmlakPanelim", initials: alanlar.name.split(" ").map(w => w[0]).join("").slice(0, 2).toLocaleUpperCase("tr-TR"),
      accent_color: "#0EA5E9", city: "", district: "", social_media: "", platforms: [], publish_days: [], shoot_days: [], publish_times: [],
      work_type: "monthly", contract_start: f.created_at ? `${TR_MONTHS[new Date(f.created_at).getMonth()]} ${new Date(f.created_at).getFullYear()}` : "",
      source: "emlakpanelim", emlak_firma_id: f.id,
    }).select('id').single();
    if (e2 || !yeni) continue;
    await saveClientPrivate(yeni.id, { monthlyFee: Number(planOf[f.plan_id]?.aylik || 0), yeni: true });
    added++;
  }
  return { added, total: firmalar.length };
}

function AccountingCari({ clients }) {
  const [payments, setPayments] = useState([]);
  const [clientInvoices, setClientInvoices] = useState([]);
  const [allClientsRaw, setAllClientsRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [kind, setKind] = useState("all");            // all | sosyal | emlak
  const [emlakNote, setEmlakNote] = useState("");
  const emlakSynced = useRef(false);
  const load = async () => {
    // Sayfa ilk açıldığında yeni EmlakPanelim abonelerini cariye ekle
    if (!emlakSynced.current) {
      emlakSynced.current = true;
      try { const r = await syncEmlakClients(); if (r.added > 0) setEmlakNote(`${r.added} yeni EmlakPanelim abonesi cariye eklendi.`); else if (r.error) setEmlakNote("EmlakPanelim aboneleri alınamadı: " + r.error); } catch (e) { setEmlakNote("EmlakPanelim aboneleri alınamadı: " + e.message); }
    }
    const [{ data: payData, error: e1 }, { data: invData, error: e2 }, { data: allCRaw, error: e3 }, { data: feeData }] = await Promise.all([
      supabase.from('client_payments').select('*').order('payment_date', { ascending: false }),
      supabase.from('client_invoices').select('*'),
      supabase.from('clients').select('id,name,initials,accent_color,contract_start,payment_due_date,deleted_at,source,phone,email,address,tax_number,tax_office,description'),
      supabase.from('client_finance').select('client_id,monthly_fee'),
    ]);
    const feeOf = {}; (feeData || []).forEach(f => { feeOf[f.client_id] = Number(f.monthly_fee || 0); });
    const allCData = (allCRaw || []).map(c => ({ ...c, monthly_fee: feeOf[c.id] || 0 }));
    setErr([e1, e2, e3].filter(Boolean).map(e => e.message).join(" · "));
    setPayments(payData || []);
    setClientInvoices(invData || []);
    setAllClientsRaw(allCData || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Aktif müşteriler + sözleşmesi bitmiş ama alacaklı olduğumuz müşteriler
  const mergedClients = useMemo(() => {
    const activeIds = new Set(clients.map(c => c.id));
    // Silinmiş/pasif müşterilerden faturası ya da ödemesi olanları ekle
    const departed = (allClientsRaw || [])
      .filter(c => c.deleted_at && !activeIds.has(c.id))
      .filter(c => clientInvoices.some(i => i.client_id === c.id) || payments.some(p => p.client_id === c.id))
      .map(c => ({
        id: c.id, name: c.name, initials: (c.initials || ""), accentColor: c.accent_color || "#9CA3AF",
        monthlyFee: c.monthly_fee || 0, contractStart: c.contract_start || "",
        paymentDueDate: c.payment_due_date || null, phone: "", email: "",
        _departed: true,
      }));
    // EmlakPanelim aboneleri: sosyal medya müşterisi değil, yalnızca cari hesapta görünür
    const emlak = (allClientsRaw || [])
      .filter(c => c.source === 'emlakpanelim' && !c.deleted_at)
      .map(c => ({
        id: c.id, name: c.name, initials: (c.initials || ""), accentColor: c.accent_color || "#0EA5E9",
        monthlyFee: c.monthly_fee || 0, contractStart: c.contract_start || "",
        paymentDueDate: c.payment_due_date || null, phone: c.phone || "", email: c.email || "",
        address: c.address || "", taxNumber: c.tax_number || "", taxOffice: c.tax_office || "", description: c.description || "",
        _emlak: true,
      }));
    return [...clients.filter(c => !emlak.some(e => e.id === c.id)), ...departed.filter(c => !emlak.some(e => e.id === c.id)), ...emlak];
  }, [clients, allClientsRaw, clientInvoices, payments]);

  const nowRef = currentMonthRef();
  // Borçlular üstte; girilen her ödeme, faturası olsun olmasın tahsilata sayılır
  const clientStats = mergedClients.filter(c => kind === "all" || (kind === "emlak") === !!c._emlak).map(c => {
    const cPayments = payments.filter(p => p.client_id === c.id);
    const cInvoices = clientInvoices.filter(i => i.client_id === c.id);
    const h = cariHesapla(cPayments, cInvoices);
    return {
      client: c, cPayments, cInvoices, months: h.months,
      monthInfo: Object.fromEntries(h.months.map(x => [x.m, x])),
      totalPaid: h.paid, expected: h.invoiced, balance: h.balance,
      unpaidMonths: h.months.filter(x => x.debt > 0).map(x => x.m),
    };
  }).sort((a, b) => (b.balance - a.balance) || (b.totalPaid - a.totalPaid));

  const totalExpected = sumAmount(clientStats, "expected");
  const totalCollected = sumAmount(clientStats, "totalPaid");
  const totalOutstanding = sumAmount(clientStats, "balance");
  // Açık olan müşteri, ilk 6'nın dışında kalsa da listede görünür
  const visibleStats = showAll ? clientStats : clientStats.filter((cs, i) => i < 6 || cs.client.id === expanded);

  // Ödeme penceresi: müşterinin en eski ödenmemiş faturalı ayı ve kalan borcu hazır gelir
  const payDefaults = (clientId) => {
    const cs = clientStats.find(x => String(x.client.id) === String(clientId));
    const borc = cs?.months.find(x => x.debt > 0 && x.m);
    return { client_id: clientId || "", amount: borc ? borc.debt : (cs?.client.monthlyFee || ""), month_ref: borc?.m || nowRef };
  };
  const openPay = (clientId) => { setForm({ ...payDefaults(clientId), payment_date: todayStr(), method: "havale" }); setModal(true); };

  const savePayment = async () => {
    if (saving) return;
    if (!form.client_id || !form.amount) { swalAlert("Müşteri ve tutar zorunlu"); return; }
    setSaving(true);
    const { error } = await supabase.from('client_payments').insert({
      client_id: form.client_id,
      amount: parseFloat(form.amount) || 0,
      payment_date: form.payment_date || todayStr(),
      month_ref: form.month_ref || nowRef,
      method: form.method || "havale",
      notes: form.notes || "",
    });
    setSaving(false);
    if (error) { swalAlert("Ödeme kaydedilemedi: " + error.message); return; }
    // Kaydedilen ödeme hemen görünsün diye müşterinin kartı açılır
    setExpanded(mergedClients.find(c => String(c.id) === String(form.client_id))?.id ?? form.client_id);
    setModal(false); setForm({});
    load();
  };

  // Silinen ödemeye bağlı fatura varsa "ödendi" işareti de kalkar
  const removePayments = async (ids) => {
    if (!ids.length) return;
    const { error } = await supabase.from('client_payments').delete().in('id', ids);
    if (error) { swalAlert("Ödeme silinemedi: " + error.message); return; }
    await supabase.from('client_invoices').update({ status: "pending", paid_at: null, payment_id: null }).in('payment_id', ids);
    load();
  };
  const deletePayment = async (id) => {
    if (!await swalConfirm("Bu ödeme kaydı silinsin mi?")) return;
    await removePayments([id]);
  };

  const exportCari = async () => {
    // Sayfa 1: Cari özeti
    const summaryRows = clientStats.map(cs => ({
      "Müşteri": cs.client.name,
      "Aylık Ücret (₺)": cs.client.monthlyFee || 0,
      "Faturalanan (₺)": cs.expected,
      "Tahsil Edilen (₺)": cs.totalPaid,
      "Kalan Bakiye (₺)": cs.balance,
      "Ödenmemiş Ay Sayısı": cs.unpaidMonths.length,
      "Durum": cs.balance <= 0 ? "Güncel" : "Borçlu",
    }));
    const sheets = [{ name: "Müşteri Cari", rows: summaryRows, title: "PANORMOS MEDYA — MÜŞTERİ CARİ ÖZETİ" }];

    // Sayfa 2: Ödenmemiş aylar
    const unpaidRows = [];
    clientStats.forEach(cs => {
      cs.months.filter(x => x.debt > 0).forEach(x => {
        unpaidRows.push({
          "Müşteri": cs.client.name,
          "Ödenmemiş Ay": monthRefLabel(x.m),
          "Fatura (₺)": x.invoiced,
          "Ödenen (₺)": x.paid,
          "Eksik (₺)": x.debt,
        });
      });
    });
    if (unpaidRows.length > 0) sheets.push({ name: "Ödenmemiş Aylar", rows: unpaidRows, title: "ÖDENMEMİŞ AYLAR" });

    // Sayfa 3: Tüm ödemeler
    const payRows = payments.map(p => ({
      "Müşteri": mergedClients.find(c => c.id === p.client_id)?.name || "?",
      "Ödeme Tarihi": p.payment_date || "—",
      "Ait Olduğu Ay": monthRefLabel(p.month_ref),
      "Tutar (₺)": Number(p.amount || 0),
      "Yöntem": p.method || "—",
      "Not": p.notes || "—",
    }));
    if (payRows.length > 0) sheets.push({ name: "Tüm Ödemeler", rows: payRows, title: "TÜM TAHSİLATLAR" });

    await exportPerfectExcel(sheets, `panormos-musteri-cari-${todayStr()}.xlsx`);
  };

  return (
    <div>
      {/* Özet kartlar */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Faturalanan" value={fmtMoney(totalExpected)} color={T.indigoText} sub="Yüklenen faturalar" />
        <StatCard label="Tahsil Edilen" value={fmtMoney(totalCollected)} color={T.greenText} sub="Girilen bütün ödemeler" />
        <StatCard label="Kalan Alacak" value={fmtMoney(totalOutstanding)} color={T.amberText} sub="Ödenmemiş faturalar" />
      </div>
      {err && <div style={{ background: T.redDim, color: T.redText, padding: "10px 14px", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>Cari kayıtları okunamadı: {err}</div>}

      {emlakNote && <div style={{ background: emlakNote.includes("alınamadı") ? T.amberDim : T.greenDim, color: emlakNote.includes("alınamadı") ? T.amberText : T.greenText, padding: "10px 14px", borderRadius: 10, fontSize: 12.5, marginBottom: 14 }}>{emlakNote}</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        <Btn variant="primary" onClick={() => openPay("")}>+ Ödeme Kaydet</Btn>
        <Btn onClick={exportCari} style={{ background: T.greenDim, color: T.greenText }}>📊 Cari Excel</Btn>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4, background: T.bgInput, borderRadius: 10, padding: 4 }}>
          {[{ v: "all", l: "Tümü" }, { v: "sosyal", l: "Sosyal Medya" }, { v: "emlak", l: `EmlakPanelim (${mergedClients.filter(c => c._emlak).length})` }].map(o => (
            <button key={o.v} onClick={() => { setKind(o.v); setShowAll(false); }} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: kind === o.v ? T.bgCard : "transparent", color: kind === o.v ? T.textPrimary : T.textMuted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", boxShadow: kind === o.v ? T.shadow : "none" }}>{o.l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>
      ) : clientStats.length === 0 ? (
        <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Müşteri yok</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visibleStats.map(cs => {
            const isOpen = expanded === cs.client.id;
            return (
              <div key={cs.client.id} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => setExpanded(isOpen ? null : cs.client.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer", borderLeft: `3px solid ${cs.client.accentColor}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: "50%", background: cs.client.accentColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{cs.client.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary }}>{cs.client.name}{cs.client._emlak && <span style={{ marginLeft: 6, fontSize: 10, background: "rgba(14,165,233,0.15)", color: T.indigoText, borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>EmlakPanelim</span>}{cs.client._departed && <span style={{ marginLeft: 6, fontSize: 10, background: T.bgInput, color: T.textMuted, borderRadius: 4, padding: "1px 5px", fontWeight: 500 }}>Ayrıldı</span>}</div>
                    <div style={{ fontSize: 11, color: T.textMuted }}>Aylık {fmtMoney(cs.client.monthlyFee)} · Tahsil edilen {fmtMoney(cs.totalPaid)}{cs.unpaidMonths.length > 0 ? ` · ${cs.unpaidMonths.length} ay ödenmemiş` : ""}</div>
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
                        if(phone.length<10){ swalAlert("Bu müşterinin kayıtlı telefonu yok. Müşteriyi düzenleyip telefon ekleyin."); return; }
                        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, "_blank");
                      }} style={{background:"#25D366",color:"#fff",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>📱 WhatsApp Hatırlatma</Btn>
                      <Btn onClick={() => printClientStatement(cs.client, clientInvoices.filter(i => i.client_id === cs.client.id), payments.filter(p => p.client_id === cs.client.id))} style={{background:T.greenDim,color:T.greenText,fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>📑 Hesap Raporu (PDF)</Btn>
                      <Btn variant="primary" onClick={() => openPay(cs.client.id)} style={{fontSize:11,whiteSpace:"nowrap"}}>+ Ödeme Ekle</Btn>
                    </div>
                    {/* EmlakPanelim abonesi: iletişim ve fatura bilgileri */}
                    {cs.client._emlak && (
                      <div style={{ marginTop: 12, padding: "12px 14px", background: T.bgInput, borderRadius: 10, fontSize: 12.5, color: T.textSecondary, lineHeight: 1.7 }}>
                        <div style={{ fontSize: 10, color: T.textMuted, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>İletişim ve Fatura Bilgileri</div>
                        <div>📞 {cs.client.phone ? <a href={`tel:${String(cs.client.phone).replace(/[^0-9+]/g, "")}`} style={{ color: T.indigoText, textDecoration: "none" }}>{cs.client.phone}</a> : "—"} · ✉️ {cs.client.email ? <a href={`mailto:${cs.client.email}`} style={{ color: T.indigoText, textDecoration: "none" }}>{cs.client.email}</a> : "—"}</div>
                        <div>Vergi Dairesi: <b style={{ color: T.textPrimary }}>{cs.client.taxOffice || "—"}</b> · Vergi No / TCKN: <b style={{ color: T.textPrimary }}>{cs.client.taxNumber || "—"}</b></div>
                        <div>Fatura Adresi: {cs.client.address || "—"}</div>
                        {cs.client.description && <div style={{ color: T.textMuted }}>{cs.client.description}</div>}
                      </div>
                    )}
                    {/* Fatura yükleme */}
                    <ClientInvoiceUpload clientId={cs.client.id} clientName={cs.client.name} onPaid={load} monthInfo={cs.monthInfo} />
                    <div style={{ fontSize: 11, color: T.textMuted, margin: "12px 0 8px", fontWeight: 600, textTransform: "uppercase" }}>Aylara Göre Durum</div>
                    {cs.months.length === 0 ? (
                      <div style={{ fontSize: 12, color: T.textMuted, padding: "10px 0 8px" }}>Henüz fatura ya da ödeme yok. Fatura yüklediğinizde veya ödeme kaydettiğinizde burada görünür.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 6, marginBottom: 12 }}>
                        {cs.months.map(x => {
                          const noInv = x.invoiced === 0;
                          const full = !noInv && x.debt === 0;
                          const partial = x.debt > 0 && x.paid > 0;
                          const ok = full || (noInv && x.paid > 0);
                          return (
                            <div key={x.m || "ay-yok"} style={{ position: "relative", padding: "8px 10px", borderRadius: 8, background: ok ? T.greenDim : partial ? T.amberDim : T.bgInput, border: `1px solid ${ok ? T.green + "44" : partial ? T.amber + "44" : T.border}` }}>
                              {x.paid > 0 && (
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!await swalConfirm(`${x.m ? monthRefLabel(x.m) : "Ayı belirtilmemiş"} ayına ait tüm ödemeler silinsin mi?`)) return;
                                  await removePayments(cs.cPayments.filter(p => (p.month_ref || "") === x.m).map(p => p.id));
                                }} style={{ position: "absolute", top: 4, right: 4, background: "none", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 11, lineHeight: 1, padding: "1px 3px", borderRadius: 4 }} title="Bu ayın ödemelerini sil">✕</button>
                              )}
                              <div style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>{x.m ? monthRefLabel(x.m) : "Ay belirtilmemiş"}</div>
                              <div style={{ fontSize: 10, color: T.textMuted, marginBottom: 2 }}>{noInv ? "Fatura yüklenmemiş" : `Fatura ${fmtMoney(x.invoiced)}`}</div>
                              <div style={{ fontSize: 10, color: ok ? T.greenText : partial ? T.amberText : T.redText, fontWeight: 500 }}>{noInv ? (x.paid > 0 ? `✓ Tahsil edildi: ${fmtMoney(x.paid)}` : "Fatura tutarı girilmemiş") : full ? "✓ Ödendi" : partial ? `Kısmi: ${fmtMoney(x.paid)} · kalan ${fmtMoney(x.debt)}` : "⚠ Ödenmedi"}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
            <Select value={form.client_id || ""} onChange={e => { const cid = e.target.value; setForm(f => ({ ...f, ...payDefaults(cid) })); }}>
              <option value="">Seç...</option>
              {mergedClients.map(c => <option key={c.id} value={c.id}>{c.name}{c._departed ? " (ayrıldı)" : ""}</option>)}
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
          <ModalActions onClose={() => setModal(false)} onSave={savePayment} saveLabel={saving ? "Kaydediliyor..." : "Kaydet"} />
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
    const { data, error } = await supabase.from('accounting_entries').select('*').order('due_date', { ascending: false });
    if (error) swalAlert("Kayıtlar okunamadı: " + error.message);
    setEntries(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveEntry = async () => {
    if (!form.title && form.entry_type !== "salary") { swalAlert("Başlık zorunlu"); return; }
    if (form.entry_type === "salary" && !form.staff_id) { swalAlert("Maaş için çalışan seçin"); return; }
    if (!form.amount) { swalAlert("Tutar zorunlu"); return; }
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
    if (error) { swalAlert("Kaydedilemedi: " + error.message); return; }
    setFilter(fl => (fl === "all" || fl === form.entry_type ? fl : "all"));
    setModal(false); setForm({ entry_type: "sgk" });
    load();
  };

  const togglePaid = async (entry) => {
    await supabase.from('accounting_entries').update({ is_paid: !entry.is_paid, paid_date: !entry.is_paid ? todayStr() : null }).eq('id', entry.id);
    load();
  };
  const deleteEntry = async (id) => {
    if (!await swalConfirm("Bu kayıt silinsin mi?")) return;
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
    await exportPerfectExcel([{ name: "Giderler", rows, title: "PANORMOS MEDYA — GİDER ÖDEMELERİ" }], `panormos-giderler-${todayStr()}.xlsx`);
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
    if (!form.staff_id) { swalAlert("Çalışan seçin"); return; }
    if (!form.start_date || !form.end_date) { swalAlert("Başlangıç ve bitiş tarihi girin"); return; }
    const days = calcDays(form.start_date, form.end_date);
    const { error } = await supabase.from('staff_leave').insert({
      staff_id: parseInt(form.staff_id),
      start_date: form.start_date,
      end_date: form.end_date,
      days,
      leave_type: form.leave_type || "yıllık",
      notes: form.notes || "",
    });
    if (error) { swalAlert("Kaydedilemedi: " + error.message + "\n\nSQL kodunu çalıştırın."); return; }
    setModal(false); setForm({ leave_type: "yıllık" });
    load();
  };
  const deleteLeave = async (id) => {
    if (!await swalConfirm("Bu izin kaydı silinsin mi?")) return;
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
          swalAlert("Yükleme hatası: " + error.message);
        }
      } catch (err) { console.error(err); }
    }
    setUploading(false);
    load();
  };

  const openDoc = (doc) => {
    if (doc.storage_type === "supabase" && doc.storage_path) {
      openStoredFile(doc.storage_path);
    }
  };
  const deleteDoc = async (doc) => {
    if (!await swalConfirm("Bu belge silinsin mi?")) return;
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
      swalAlert("Mesaj gönderilemedi: " + error.message + "\n\nMesajlaşma tabloları eksik olabilir. SQL kodunu çalıştırın.");
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
    if (error) { swalAlert("Sohbet oluşturulamadı: " + error.message + "\n\nSQL kodunu çalıştırdığınızdan emin olun."); return; }

    await supabase.from('conversation_members').insert([
      { conversation_id: conv.id, staff_id: currentStaff.id },
      { conversation_id: conv.id, staff_id: otherId },
    ]);
    await loadConversations();
    setActiveConvId(conv.id);
  };

  // Grup oluştur
  const createGroup = async () => {
    if (!groupName.trim()) { swalAlert("Grup adı girin"); return; }
    if (groupMembers.length === 0) { swalAlert("En az bir üye seçin"); return; }
    setGroupModal(false);

    const { data: conv, error } = await supabase.from('conversations').insert({
      name: groupName.trim(), is_group: true, created_by: currentStaff.id, created_at: new Date().toISOString(),
    }).select().single();
    if (error) { swalAlert("Grup oluşturulamadı: " + error.message); return; }

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
    if (!await swalConfirm(msg)) return;
    // Üyeler ve mesajlar CASCADE ile otomatik silinir; yine de garantiye alalım
    await supabase.from('staff_messages').delete().eq('conversation_id', conv.id);
    await supabase.from('conversation_members').delete().eq('conversation_id', conv.id);
    const { error } = await supabase.from('conversations').delete().eq('id', conv.id);
    if (error) { swalAlert("Silinemedi: " + error.message); return; }
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
                if(messages.length===0){ swalAlert("Yazdırılacak mesaj yok"); return; }
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

// Müşterinin korumalı bilgilerini kaydeder: aylık ücret (client_finance) ve sosyal medya şifresi (şifreli).
// Hata olursa mesajını döndürür, yoksa null. monthlyFee undefined ise ücrete dokunulmaz.
async function saveClientPrivate(clientId, { monthlyFee, socialPassword, yeni = false }) {
  const hatalar = [];
  if (monthlyFee !== undefined) {
    const row = { client_id: clientId, monthly_fee: monthlyFee, updated_at: new Date().toISOString() };
    const { error } = yeni ? await supabase.from('client_finance').insert(row) : await supabase.from('client_finance').upsert(row, { onConflict: 'client_id' });
    if (error) hatalar.push(error.message);
  }
  if (socialPassword !== undefined && !(yeni && !socialPassword)) {
    const { error } = await supabase.rpc('panel_sifre_yaz', { p_client_id: clientId, p_sifre: socialPassword });
    if (error) hatalar.push(error.message);
  }
  return hatalar.length ? hatalar.join(" · ") : null;
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
    { data: pieceJobsRaw },
    { data: shootsRaw },
    { data: financeRaw },
    { data: secretsRaw },
  ] = await Promise.all([
    supabase.from('clients').select('*'),
    supabase.from('staff').select('*'),
    supabase.from('tasks').select('*'),
    supabase.from('posts').select('*'),
    supabase.from('invoices').select('*'),
    supabase.from('media').select('*'),
    supabase.from('publishes').select('*'),
    supabase.from('piece_jobs').select('*'),
    supabase.from('shoots').select('*'),
    supabase.from('client_finance').select('client_id,monthly_fee'),   // yalnızca finans yetkisi olana satır döner
    supabase.rpc('panel_sifreler'),                                    // şifreler şifreli saklanır, işlevle çözülür
  ]);
  const feeOf = {}; (financeRaw || []).forEach(f => { feeOf[f.client_id] = Number(f.monthly_fee || 0); });
  const sifreOf = {}; (secretsRaw || []).forEach(x => { sifreOf[x.client_id] = x.sifre || ""; });

  // EmlakPanelim aboneleri yalnızca muhasebede (Müşteri Cari) görünür; sosyal medya müşterisi değildir
  const socialRaw = (clientsRaw || []).filter(c => c.source !== 'emlakpanelim');
  const clients = socialRaw.filter(c => !c.deleted_at).map(c => ({
    id: c.id, name: c.name, category: c.category || "", initials: c.initials || "",
    accentColor: c.accent_color || "#6366F1", phone: c.phone || "", email: c.email || "", address: c.address || "",
    city: c.city || "", district: c.district || "", taxNumber: c.tax_number || "", taxOffice: c.tax_office || "",
    socialMedia: c.social_media || "", socialPassword: sifreOf[c.id] || "", description: c.description || "", setupChecklist: c.setup_checklist || {}, monthlyPostQuota: c.monthly_post_quota || 0, quotaDetail: c.quota_detail || {},
    platforms: c.platforms || [], publishDays: c.publish_days || [], shootDays: c.shoot_days || [],
    publishTimes: c.publish_times || [],
    monthlyFee: feeOf[c.id] || 0, contractStart: c.contract_start || "", contractEnd: c.contract_end || null, paymentDueDate: c.payment_due_date || null,
    workType: c.work_type || "monthly",
    extraShoots: [
      ...(Array.isArray(c.extra_shoots) ? c.extra_shoots : []),
      ...((shootsRaw || []).filter(s => s.client_id === c.id && s.status !== "cancelled").map(s => ({ date: s.shoot_date, title: s.title + (s.shoot_time ? ` (${s.shoot_time})` : ""), shootId: s.id }))),
    ],
    pieceJobs: (pieceJobsRaw || []).filter(j => j.client_id === c.id).map(j => ({
      id: j.id, title: j.title, quantity: j.quantity, amount: Number(j.amount || 0), dueDate: j.due_date, status: j.status || "pending", monthRef: j.month_ref,
    })).sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || "")),
    posts: (postsRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, date: p.date, platform: p.platform, type: p.type, title: p.title, status: p.status, description: p.description, approval: p.approval || 'pending', approvalNote: p.approval_note || '',
    })),
    publishesList: (publishesRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, taskId: p.task_id, publisherId: p.publisher_id, platform: p.platform, contentType: p.content_type, quantity: p.quantity || 1, publishedAt: p.published_at,
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
    revisionNote: t.revision_note || "", revisionBy: t.revision_by || "", revisionAt: t.revision_at || null,
    createdAt: t.created_at || null, completedAt: t.completed_at || null,
  }));

  // Alfabetik sıralama (Türkçe) — tüm sayfalara yansır
  clients.sort((a,b)=>(a.name||"").localeCompare(b.name||"","tr",{sensitivity:"base"}));
  staff.sort((a,b)=>(a.name||"").localeCompare(b.name||"","tr",{sensitivity:"base"}));
  tasks.sort((a,b)=>(a.title||"").localeCompare(b.title||"","tr",{sensitivity:"base"}));

  return { clients, staff, tasks, allClients: socialRaw, allStaff: staffRaw || [] };
}

// ─────────────────────────────────────────────
// BİLDİRİM ZİLİ - mevcut verilerden uyarı hesaplar
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// GLOBAL ARAMA - müşteri, potansiyel, görev, fikir
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// YILLIK ÖZET + YEDEKLEME (yönetici)
// ─────────────────────────────────────────────
function YearlyBackupPage({ clients, staff, tasks, perms }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [payments, setPayments] = useState([]);
  const [pieceJobs, setPieceJobs] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [p, pj, inc, ex, en] = await Promise.all([
          supabase.from('client_payments').select('amount,month_ref'),
          supabase.from('piece_jobs').select('amount,month_ref,status'),
          supabase.from('company_incomes').select('amount,income_date'),
          supabase.from('company_expenses').select('amount,expense_date'),
          supabase.from('accounting_entries').select('amount,month_ref'),
        ]);
        setPayments(p.data || []); setPieceJobs(pj.data || []); setIncomes(inc.data || []); setExpenses(ex.data || []); setEntries(en.data || []);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const yStr = String(year);
  const monthInYear = (ref) => ref && ref.startsWith(yStr);
  const dateInYear = (d) => d && String(d).startsWith(yStr);

  // Aylık gelir/gider (12 ay)
  const months = Array.from({ length: 12 }, (_, i) => `${yStr}-${String(i + 1).padStart(2, "0")}`);
  const monthData = months.map(m => {
    const income = payments.filter(p => p.month_ref === m).reduce((s, p) => s + Number(p.amount || 0), 0)
      + incomes.filter(i => String(i.income_date || "").slice(0, 7) === m).reduce((s, i) => s + Number(i.amount || 0), 0)
      + pieceJobs.filter(j => j.status === "done" && j.month_ref === m).reduce((s, j) => s + Number(j.amount || 0), 0);
    const expense = entries.filter(e => e.month_ref === m).reduce((s, e) => s + Number(e.amount || 0), 0)
      + expenses.filter(x => String(x.expense_date || "").slice(0, 7) === m).reduce((s, x) => s + Number(x.amount || 0), 0);
    return { m, income, expense, net: income - expense };
  });
  const totalIncome = monthData.reduce((s, d) => s + d.income, 0);
  const totalExpense = monthData.reduce((s, d) => s + d.expense, 0);
  const totalNet = totalIncome - totalExpense;
  const bestMonth = monthData.reduce((best, d) => d.income > (best?.income || 0) ? d : best, null);
  const maxInc = Math.max(1, ...monthData.map(d => d.income));

  // Tüm veriyi yedekle (JSON indir)
  const backupAll = async () => {
    setBacking(true);
    try {
      const tables = ['clients', 'staff', 'tasks', 'leads', 'ideas', 'posts', 'media', 'shoots', 'publishes', 'social_reports', 'inventory', 'pricing_packages', 'pricing_addons', 'pricing_quotes', 'panel_settings', 'client_payments', 'client_invoices', 'invoices', 'piece_jobs', 'company_incomes', 'company_expenses', 'accounting_entries', 'accounting_documents', 'staff_leave', 'bank_accounts', 'bank_transactions', 'client_finance', 'conversations', 'conversation_members', 'staff_messages', 'messages', 'sent_mails'];
      const backup = { exportedAt: new Date().toISOString(), tables: {} };
      for (const t of tables) {
        // Tek istekte en çok 1000 satır gelir; tablonun tamamını sayfa sayfa al
        const all = [];
        try {
          for (let from = 0; ; from += 1000) {
            const { data, error } = await supabase.from(t).select('*').range(from, from + 999);
            if (error || !data) break;
            all.push(...data);
            if (data.length < 1000) break;
          }
        } catch (e) {}
        backup.tables[t] = all;
      }
      // Sosyal medya şifreleri veritabanında şifreli durur; yedekten geri yüklenebilsin diye çözülmüş hâliyle eklenir
      try { const { data: sifreler } = await supabase.rpc('panel_sifreler'); backup.tables.client_passwords = sifreler || []; } catch (e) { backup.tables.client_passwords = []; }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `panormos-yedek-${new Date().toISOString().slice(0, 10)}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { swalAlert("Yedekleme hatası: " + e.message); }
    setBacking(false);
  };

  // Excel'e aktar (özet)
  const exportExcel = () => {
    const sheets = [
      { name: "Aylık Özet", title: `${year} Aylık Gelir-Gider`, rows: monthData.map(d => ({ "Ay": TR_MONTHS[parseInt(d.m.split("-")[1]) - 1], "Gelir": d.income, "Gider": d.expense, "Net Kâr/Zarar": d.net })) },
      { name: "Müşteriler", title: "Müşteri Listesi", rows: clients.map(c => ({ "Müşteri": c.name, "Kategori": c.category || "", "Telefon": c.phone || "", "Aylık Ücret": c.monthlyFee || 0, "Çalışma Tipi": c.workType === "piece" ? "Parça Başı" : c.workType === "both" ? "İkisi" : "Aylık" })) },
    ];
    exportPerfectExcel(sheets, `panormos-ozet-${year}.xlsx`);
  };

  const availableYears = [];
  for (let y = new Date().getFullYear(); y >= 2024; y--) availableYears.push(y);

  return (
    <div>
      {/* Yedekleme kartı */}
      <div style={{ background: `linear-gradient(135deg, ${T.bgCard}, rgba(16,185,129,0.06))`, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>💾 Yedekleme & Dışa Aktarma</div>
        <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 16, lineHeight: 1.5 }}>Tüm verilerini (müşteriler, ödemeler, görevler, raporlar...) tek dosyada yedekle. Düzenli yedek almanı öneririz. Yedek dosyası müşteri sosyal medya şifrelerini de içerir; güvenli bir yerde sakla.</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn variant="primary" onClick={backupAll} disabled={backing} style={{ background: "#10B981", border: "none" }}>{backing ? "Yedekleniyor..." : "💾 Tam Yedek Al (JSON)"}</Btn>
          <Btn onClick={exportExcel}>📊 Excel Özet İndir</Btn>
        </div>
      </div>

      {/* Yıllık özet */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.textPrimary }}>📊 {year} Yıllık Özet</div>
        <select value={year} onChange={e => setYear(parseInt(e.target.value))} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.textPrimary, fontSize: 13, outline: "none" }}>
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Yükleniyor...</div> : (
        <>
          {/* Özet kartları */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Aktif Müşteri" value={clients.length} />
            <StatCard label="Çalışan" value={staff.length} />
            {perms.companyFinance && <StatCard label={`${year} Toplam Gelir`} value={fmtMoney(totalIncome)} color={T.greenText} />}
            {perms.companyFinance && <StatCard label={`${year} Toplam Gider`} value={fmtMoney(totalExpense)} color={T.redText} />}
            {perms.companyFinance && <StatCard label={`${year} Net Kâr/Zarar`} value={fmtMoney(totalNet)} color={totalNet >= 0 ? T.greenText : T.redText} />}
            {perms.companyFinance && bestMonth && bestMonth.income > 0 && <StatCard label="En İyi Ay" value={TR_MONTHS[parseInt(bestMonth.m.split("-")[1]) - 1]} sub={fmtMoney(bestMonth.income)} color={T.indigoText} />}
          </div>

          {/* Aylık gelir grafiği */}
          {perms.companyFinance && totalIncome > 0 && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary, marginBottom: 18 }}>📈 {year} Aylık Gelir Dağılımı</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 180 }}>
                {monthData.map((d, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: T.textSecondary }}>{d.income >= 1000 ? (d.income / 1000).toFixed(0) + "b" : (d.income || "")}</div>
                    <div title={`${TR_MONTHS[i]}: ${fmtMoney(d.income)}`} style={{ width: "70%", maxWidth: 32, height: `${Math.max(2, (d.income / maxInc) * 150)}px`, background: "linear-gradient(180deg,#10B981,#059669)", borderRadius: "4px 4px 0 0", transition: "height .4s" }} />
                    <div style={{ fontSize: 9, color: T.textMuted }}>{TR_MONTHS[i].slice(0, 3)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GlobalSearch({ clients, tasks, setPage, allStaff }) {
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
    (allStaff || []).forEach(s => {
      if ((s.name || "").toLocaleLowerCase("tr-TR").includes(term) || (s.role || "").toLocaleLowerCase("tr-TR").includes(term)) {
        results.push({ type: "Çalışan", icon: "👤", label: s.name, sub: s.role || "", page: "staff", color: "#14B8A6" });
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
  const [followLeads, setFollowLeads] = useState([]);
  const boxRef = useRef(null);
  // Kullanıcı bazlı okunmuş bildirimler (localStorage)
  const readStoreKey = `notifRead_${currentStaff?.id || "user"}`;
  const [readKeys, setReadKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem(readStoreKey) || "[]"); } catch (e) { return []; }
  });

  useEffect(() => {
    (async () => {
      if (perms.accounting) {
        const { data: e } = await supabase.from('accounting_entries').select('*');
        setEntries(e || []);
        const { data: p } = await supabase.from('client_payments').select('*');
        setPayments(p || []);
      }
      const { data: l } = await supabase.from('leads').select('*').in('status', ['agreed', 'potential']);
      setAgreedLeads((l || []).filter(x => x.status === 'agreed'));
      setFollowLeads((l || []).filter(leadFollowDue));
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
  if (todayPublish.length) notifs.push({ icon: "📅", title: `Bugün ${todayPublish.length} paylaşım günü`, sub: todayPublish.map(c => c.name).join(", "), page: "clients", sev: "info" });
  if (todayShoot.length) notifs.push({ icon: "📷", title: `Bugün ${todayShoot.length} çekim günü`, sub: todayShoot.map(c => c.name).join(", "), page: "clients", sev: "info" });

  if (perms.finance) {
    const overdueInv = clients.filter(c => (c.invoices || []).some(i => i.status === "overdue"));
    if (overdueInv.length) notifs.push({ icon: "⚠️", title: `${overdueInv.length} müşterinin gecikmiş faturası`, sub: overdueInv.map(c => c.name).join(", "), page: "clients", sev: "high" });
  }

  if (perms.accounting) {
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

  if (perms.accounting) {
    const overdueExp = entries.filter(e => !e.is_paid && e.due_date && e.due_date < todayStr);
    const upcomingExp = entries.filter(e => !e.is_paid && e.due_date && e.due_date >= todayStr && e.due_date <= in7Str);
    if (overdueExp.length) notifs.push({ icon: "🔴", title: `${overdueExp.length} vadesi geçmiş gider ödemesi`, sub: overdueExp.map(e => e.title).join(", "), page: "accounting", sev: "high" });
    if (upcomingExp.length) notifs.push({ icon: "🏛️", title: `${upcomingExp.length} yaklaşan gider ödemesi (7 gün)`, sub: upcomingExp.map(e => `${e.title} · ${e.due_date}`).join(", "), page: "accounting", sev: "mid" });
  }

  if (followLeads.length) notifs.push({ icon: "📞", title: `${followLeads.length} potansiyel müşteri bugün aranacak`, sub: followLeads.map(l => l.business_name).join(", "), page: "leads", sev: "mid" });
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

// ═══════════════════════════════════════════════════════════
// TELEFON / TABLET UYUMU — genel responsive kurallar
// ═══════════════════════════════════════════════════════════
// Panelin tamamına uygulanan temel görünüm (yazı tipi, odak halkası, kaydırma çubuğu, düğme geçişleri)
const BASE_CSS = `
:root { color-scheme: ${THEME}; }
.pm-app, .pm-app button, .pm-app input, .pm-app select, .pm-app textarea {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.pm-app { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; font-feature-settings: "tnum" 1, "cv11" 1; line-height: 1.45; }
.pm-app ::selection { background: rgba(242,81,36,0.35); color: #fff; }

/* Form alanları: belirgin odak, okunaklı yer tutucu */
.pm-app input, .pm-app select, .pm-app textarea { transition: border-color .12s ease, box-shadow .12s ease, background-color .12s ease; }
.pm-app input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):focus,
.pm-app select:focus, .pm-app textarea:focus { border-color: #F25124 !important; box-shadow: 0 0 0 3px rgba(242,81,36,0.16); }
.pm-app input::placeholder, .pm-app textarea::placeholder { color: ${T.placeholder}; opacity: 1; }
.pm-app select option { background: ${T.bgCard}; color: ${T.textPrimary}; }
.pm-app input[type="checkbox"], .pm-app input[type="radio"] { accent-color: #F25124; }

/* Düğmeler: yumuşak geçiş, basış hissi, klavye odağı */
.pm-app button { transition: background-color .12s ease, border-color .12s ease, color .12s ease, filter .12s ease, transform .06s ease, box-shadow .12s ease; }
.pm-app button:not(:disabled):hover { filter: brightness(${THEME === "light" ? "0.96" : "1.1"}); }
.pm-app button:not(:disabled):active { transform: translateY(1px); }
.pm-app button:disabled { cursor: default; }
.pm-app button:focus-visible, .pm-app a:focus-visible { outline: 2px solid #F25124; outline-offset: 2px; }
.pm-app .pm-icon-btn:hover { background: ${T.hover} !important; color: ${T.textPrimary} !important; }
.pm-app .pm-nav:hover { background: ${T.hover}; color: ${T.textPrimary} !important; }

/* Tablolar */
.pm-app table { border-collapse: collapse; }
.pm-app th { font-weight: 600; letter-spacing: 0.03em; }

/* İnce, koyu kaydırma çubukları */
.pm-app, .pm-app * { scrollbar-width: thin; scrollbar-color: ${T.scrollThumb} transparent; }
.pm-app ::-webkit-scrollbar { width: 10px; height: 10px; }
.pm-app ::-webkit-scrollbar-track { background: transparent; }
.pm-app ::-webkit-scrollbar-thumb { background: ${T.scrollThumb}; border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
.pm-app ::-webkit-scrollbar-thumb:hover { background: ${T.scrollThumbHover}; background-clip: content-box; border: 2px solid transparent; }

/* Pencere açılışı */
@keyframes pmModalIn { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: none; } }
.pm-app .pm-modal { animation: pmModalIn .16s ease-out; }
@media (prefers-reduced-motion: reduce) { .pm-app .pm-modal { animation: none; } .pm-app button { transition: none; } }
`;

const RESPONSIVE_CSS = `
/* ---------- TABLET (≤1024px) ---------- */
@media (max-width: 1024px) {
  [style*="repeat(6, 1fr)"] { grid-template-columns: repeat(3, 1fr) !important; }
  [style*="repeat(5, 1fr)"] { grid-template-columns: repeat(3, 1fr) !important; }
  [style*="repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
}

/* ---------- TELEFON (≤760px) ---------- */
@media (max-width: 760px) {
  [style*="repeat(6, 1fr)"],
  [style*="repeat(5, 1fr)"],
  [style*="repeat(4, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
  [style*="repeat(3, 1fr)"] { grid-template-columns: 1fr !important; }
  [style*="repeat(2, 1fr)"] { grid-template-columns: 1fr !important; }
  [style*="grid-template-columns: 1fr 1fr"] { grid-template-columns: 1fr !important; }

  /* Takvim hücreleri daralsın (7 kolon korunur) */
  [style*="repeat(7, 1fr)"] { gap: 3px !important; }

  /* Modallar tam ekrana yakın, rahat okunur */
  .pm-modal { width: 96% !important; max-width: 96% !important; padding: 18px 16px !important; max-height: 90vh !important; }

  /* iOS'ta yazarken otomatik yakınlaşmayı engelle */
  input, select, textarea { font-size: 16px !important; }

  /* Tablolar taşmasın */
  table { font-size: 11px !important; }

  /* Uzun içerikler yatay kaydırılabilsin */
  .pm-scroll-x { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }

  /* Butonlar parmakla rahat basılsın */
  button { min-height: 34px; }
}

/* ---------- KÜÇÜK TELEFON (≤430px) ---------- */
@media (max-width: 430px) {
  [style*="repeat(4, 1fr)"],
  [style*="repeat(5, 1fr)"],
  [style*="repeat(6, 1fr)"] { grid-template-columns: repeat(2, 1fr) !important; }
  .pm-modal { padding: 14px 12px !important; }
}
`;

// ─── PWA: "Ana ekrana ekle" şeridi (sadece mobil tarayıcıda, uygulama olarak açılmamışsa) ───
function InstallBanner() {
  const [show, setShow] = useState(false);
  const [promptEvt, setPromptEvt] = useState(null);
  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
    const dismissed = localStorage.getItem("pwa_banner_dismissed");
    if (standalone || dismissed) return;
    setShow(true);
    const h = (e) => { e.preventDefault(); setPromptEvt(e); };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);
  if (!show) return null;
  const dismiss = () => { localStorage.setItem("pwa_banner_dismissed", "1"); setShow(false); };
  const install = async () => { if (!promptEvt) return; promptEvt.prompt(); const r = await promptEvt.userChoice; if (r?.outcome === "accepted") dismiss(); };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.amberDim, borderBottom: `1px solid ${T.amber}55`, fontSize: 12, color: T.textPrimary }}>
      <img src="/icons/icon-192.png" alt="" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ flex: 1, lineHeight: 1.4 }}>
        <div style={{ fontWeight: 700 }}>Paneli telefonuna uygulama olarak ekle</div>
        {isIOS
          ? <div style={{ color: T.textSecondary }}>Safari'de alttaki <strong>Paylaş</strong> simgesine bas → <strong>Ana Ekrana Ekle</strong></div>
          : promptEvt ? <div style={{ color: T.textSecondary }}>Tek dokunuşla yükle, tam ekran açılır.</div>
          : <div style={{ color: T.textSecondary }}>Chrome menüsü (⋮) → <strong>Ana ekrana ekle</strong></div>}
      </div>
      {promptEvt && !isIOS && <button onClick={install} style={{ fontSize: 12, fontWeight: 700, padding: "7px 12px", borderRadius: 8, background: T.amber, color: "#fff", border: "none", cursor: "pointer" }}>Yükle</button>}
      <button onClick={dismiss} style={{ background: "none", border: "none", color: T.textMuted, fontSize: 16, cursor: "pointer" }}>✕</button>
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
  const [unreadMails, setUnreadMails] = useState(0);
  const refreshUnreadMails = async () => {
    try {
      const { count } = await supabase.from('received_mails').select('id', { count: 'exact', head: true }).eq('is_read', false).neq('folder', 'trash');
      setUnreadMails(count || 0);
    } catch (e) {}
  };
  useEffect(() => {
    if (currentStaff?.is_admin !== true) return; // e-posta sadece yöneticiye açık
    refreshUnreadMails();
    const t = setInterval(refreshUnreadMails, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [currentStaff]);
  const knownMsgIdsRef = useRef(null);
  const pageRef = useRef("dashboard");
  const [dataLoading, setDataLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 1000);
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1000);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [rawPage, setPage] = useState(() => {
    const validPages = NAV.map(n => n.id);
    const hash = window.location.hash.replace('#', '');
    if (validPages.includes(hash)) return hash;
    const saved = localStorage.getItem('currentPage');
    if (validPages.includes(saved)) return saved;
    return 'dashboard';
  });
  const perms = currentStaff ? getPerms(currentStaff) : null;
  // Yetkisi olmayan sayfa açılmaz, Ana Sayfa gösterilir
  const page = !perms || canAccessPage(rawPage, perms) ? rawPage : 'dashboard';
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
      const validPages = NAV.map(n => n.id);
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
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(prev => {
        // Sekme değişiminde token yenilenir; aynı kullanıcıysa mevcut oturumu KORU
        // (böylece panel yeniden yüklenmez, bulunduğun sayfada kalırsın)
        if (prev && newSession && prev.user?.id === newSession.user?.id) return prev;
        return newSession;
      });
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  // Günlük oturum: giriş yapılan gün boyunca açık kalır; yeni gün başlayınca (04:00 sonrası) tekrar giriş ister
  useEffect(() => {
    if (!session) return;
    const dayKey = (d = new Date()) => { const x = new Date(d.getTime() - 4 * 60 * 60 * 1000); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; };
    const stored = localStorage.getItem("panormos_login_day");
    if (!stored) { localStorage.setItem("panormos_login_day", dayKey()); }

    const check = async () => {
      const d = localStorage.getItem("panormos_login_day");
      if (d && d !== dayKey()) {
        localStorage.removeItem("panormos_login_day");
        await supabase.auth.signOut();
        window.location.reload();
      }
    };
    check();
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 5 * 60 * 1000);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", check); clearInterval(timer); };
  }, [session]);

  useEffect(() => {
    if (!session) { setAuthDenied(false); setStaffResolving(false); return; }
    setStaffResolving(true);
    (async () => {
      const uid = session.user.id;
      const email = (session.user.email || "").toLowerCase();
      let row = null;
      // Oturumu çalışan kaydına sunucu tarafında bağla (ilk girişte e-posta ile eşleştirir)
      const { data: linked, error: linkErr } = await supabase.rpc('panel_hesap_bagla');
      if (!linkErr) row = linked || null;
      // İşlev henüz kurulu değilse eski yöntem: 1) auth_id ile eşleştir
      if (linkErr) ({ data: row } = await supabase.from('staff').select('*').eq('auth_id', uid).maybeSingle());
      // 2) bulunamazsa: email ile eşleştir ve auth_id'yi bağla
      if (linkErr && !row && email) {
        const { data: matches } = await supabase.from('staff').select('*').ilike('email', email).is('deleted_at', null).limit(1);
        const byEmail = matches && matches[0];
        if (byEmail) {
          await supabase.from('staff').update({ auth_id: uid }).eq('id', byEmail.id);
          row = { ...byEmail, auth_id: uid };
        }
      }
      if (row && row.deleted_at) row = null; // ayrılan çalışan giremez
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
    let sonDenetim = 0;
    const check = async () => {
      // Sekme arka plandayken sunucuyu gereksiz yormamak için 20 saniyede bir denetle
      if (document.hidden && Date.now() - sonDenetim < 20000) return;
      sonDenetim = Date.now();
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

  return <div className="pm-app" style={{display:"flex",height:"100vh",background:T.bg,color:T.textPrimary,fontFamily:"'Inter',-apple-system,'Segoe UI',sans-serif",position:"relative"}}>
    <style>{BASE_CSS + RESPONSIVE_CSS}</style>
    {/* Mobilde drawer açıkken arka plan karartma */}
    {isMobile && drawerOpen && <div onClick={()=>setDrawerOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:90}} />}

    <div style={{
      width:236,flexShrink:0,background:T.sidebarBg,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",
      ...(isMobile ? {position:"fixed",top:0,left:0,bottom:0,zIndex:100,transform:drawerOpen?"translateX(0)":"translateX(-100%)",transition:"transform 0.25s ease",boxShadow:drawerOpen?"4px 0 24px rgba(0,0,0,0.4)":"none"} : {})
    }}>
      <div style={{padding:"20px 20px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:19,fontWeight:800,letterSpacing:"-0.03em",lineHeight:1.1}}><span style={{color:T.textPrimary}}>panormos</span> <span style={{color:T.amber}}>medya.</span></div>
          <div style={{fontSize:10,fontWeight:600,color:T.textMuted,letterSpacing:"0.14em",textTransform:"uppercase",marginTop:5}}>Yönetim Paneli</div>
        </div>
        {isMobile && <button onClick={()=>setDrawerOpen(false)} style={{background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer",padding:4}}>✕</button>}
      </div>
      <div style={{flex:1,padding:"4px 12px 12px",overflow:"auto"}}>
        {[...NAV_GROUPS, { label: "Diğer", ids: NAV.map(n => n.id).filter(id => !NAV_GROUPS.some(g => g.ids.includes(id))) }].map(g => {
          const items = g.ids.map(id => NAV.find(n => n.id === id)).filter(item => item && canAccessPage(item.id, perms));
          if (!items.length) return null;
          return <div key={g.label || "ana"} style={{marginBottom:14}}>
            {g.label && <div style={{fontSize:10,fontWeight:700,color:T.textMuted,letterSpacing:"0.1em",textTransform:"uppercase",padding:"0 10px",marginBottom:6}}>{g.label}</div>}
            {items.map(item => {
              const active = page === item.id;
              return (
                <div key={item.id} className="pm-nav" onClick={()=>{setPage(item.id);setDrawerOpen(false);}} style={{
                  position:"relative",display:"flex",alignItems:"center",gap:11,padding:"8px 10px",borderRadius:9,marginBottom:1,
                  ...(active ? {background:T.amberDim} : {}),
                  color:active?T.textPrimary:T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:active?600:500,transition:"background 0.12s, color 0.12s",
                }}>
                  {active && <span style={{position:"absolute",left:-12,top:7,bottom:7,width:3,borderRadius:"0 3px 3px 0",background:T.amber}} />}
                  <span style={{display:"flex",color:active?T.amber:T.textMuted}}><NavIcon id={item.id} /></span>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label}</span>
                  {item.id==="messages" && unreadMsgs>0 && (
                    <span style={{minWidth:18,height:18,padding:"0 5px",borderRadius:9,background:T.amber,color:"#fff",fontSize:10.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{unreadMsgs}</span>
                  )}
                  {item.id==="mail" && unreadMails>0 && (
                    <span style={{minWidth:18,height:18,padding:"0 5px",borderRadius:9,background:T.amber,color:"#fff",fontSize:10.5,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{unreadMails}</span>
                  )}
                </div>
              );
            })}
          </div>;
        })}
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
        <button onClick={async()=>{ if(await swalConfirm("Çıkış yapmak istediğinize emin misiniz?")){ localStorage.removeItem("panormos_login_day"); await supabase.auth.signOut(); window.location.reload(); } }} style={{
          width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,
          padding:"9px 12px",borderRadius:10,background:T.bgSurface,border:`1px solid ${T.border}`,
          color:T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:600,transition:"all 0.12s",
        }}
        onMouseEnter={e=>{e.currentTarget.style.background=T.redDim;e.currentTarget.style.color=T.redText;e.currentTarget.style.borderColor=T.red+"66";}}
        onMouseLeave={e=>{e.currentTarget.style.background=T.bgSurface;e.currentTarget.style.color=T.textSecondary;e.currentTarget.style.borderColor=T.border;}}>
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" /></svg><span>Çıkış Yap</span>
        </button>
      </div>
    </div>

    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
      {isMobile && <InstallBanner />}
      <div style={{padding:isMobile?"12px 14px":"14px 32px",borderBottom:`1px solid ${T.border}`,background:T.headerBg,backdropFilter:"blur(10px)",display:"flex",alignItems:"center",justifyContent:"space-between",gap:isMobile?8:16}}>
        {isMobile && <button onClick={()=>setDrawerOpen(true)} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,width:38,height:38,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:T.textPrimary}}>☰</button>}
        <div style={{fontSize:isMobile?16:19,fontWeight:700,color:T.textPrimary,letterSpacing:"-0.02em",flexShrink:isMobile?1:0,minWidth:0,flex:isMobile?1:"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {PAGE_TITLES[page] || NAV.find(n => n.id === page)?.label || "Panel"}
        </div>
        {!isMobile && <GlobalSearch clients={clients} tasks={tasks} setPage={setPage} allStaff={staff} />}
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <button onClick={toggleTheme} title={THEME==="light"?"Koyu moda geç":"Açık moda geç"} aria-label={THEME==="light"?"Koyu moda geç":"Açık moda geç"} style={{width:38,height:38,borderRadius:10,background:T.bgSurface,border:`1px solid ${T.border}`,color:T.textSecondary,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {THEME==="light"
                ? <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
                : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
            </svg>
          </button>
          <NotificationBell clients={clients} tasks={tasks} perms={perms} setPage={setPage} currentStaff={currentStaff} />
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:isMobile?14:"28px 32px"}}>
        {page==="dashboard"&&<DashboardPage clients={clients} staff={staff} tasks={tasks} setPage={setPage} perms={perms} allClients={allClients} allStaff={allStaff} refreshData={refreshData} currentStaff={currentStaff}/>}
        {page==="clients"&&<ClientsPage clients={clients} setClients={setClients} allClients={allClients} perms={perms} currentStaff={currentStaff}/>}
        {page==="leads"&&<LeadsPage refreshData={refreshData} currentStaff={currentStaff}/>}
        {page==="pricing"&&<PricingPage/>}
        {page==="calendar"&&<CalendarPage clients={clients} staff={staff} setPage={setPage}/>}
        {page==="shoots"&&<ShootsPage clients={clients} staff={staff} currentStaff={currentStaff} refreshData={refreshData}/>}
        {page==="ideas"&&<IdeasPage currentStaff={currentStaff} clients={clients}/>}
        {page==="tasks"&&<TasksPage tasks={tasks} setTasks={setTasks} clients={clients} staff={staff} refreshData={refreshData} currentStaff={currentStaff} perms={perms}/>}
        {page==="files"&&<DriveFilesPage clients={clients}/>}
        {page==="reports"&&<ReportsPage clients={clients} perms={perms}/>}
        {page==="yearly"&&<YearlyBackupPage clients={clients} staff={staff} tasks={tasks} perms={perms}/>}
        {page==="messages"&&<MessagesPage currentStaff={currentStaff} staff={staff}/>}
        {page==="mail"&&<MailPage clients={allClients||clients} currentStaff={currentStaff} onUnreadChange={refreshUnreadMails}/>}
        {page==="accounting"&&<AccountingPage clients={clients} staff={staff} perms={perms}/>}
        {page==="inventory"&&<InventoryPage perms={perms}/>}
        {page==="staff"&&<StaffPage staff={staff} setStaff={setStaff} allStaff={allStaff} perms={perms}/>}
        {page==="emlakpanelim"&&<EmlakPanelimPage/>}
      </div>
    </div>
  </div>;
}
