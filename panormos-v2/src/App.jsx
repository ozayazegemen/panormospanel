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
  "😀","😃","😄","😁","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘",
  "😋","😛","😜","🤪","😎","🥳","🤩","🤗","🤔","🤭","🙄","😴","🥱","😷","🤒","🤕",
  "😢","😭","😤","😠","😡","🥺","😳","😱","😨","😰","😥","😔","😞","🙁","☹️","😖",
  "👍","👎","👌","✌️","🤞","🤟","👏","🙌","🙏","💪","👋","🤝","☝️","👇","👈","👉",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","💕","💯","🔥","⭐","🌟","✨","⚡",
  "✅","❌","❓","❗","💡","📌","📍","🎯","🏆","🥇","🎉","🎊","🎈","🎁","💰","💵",
  "📊","📈","📉","📅","📆","⏰","📷","🎥","📱","💻","✏️","📝","📎","🚀","☕","👀",
];

// Emoji seçici düğmesi — herhangi bir metin alanına emoji eklemek için
function EmojiButton({ onSelect, size = 18 }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: "none", border: "none", cursor: "pointer", fontSize: size,
          padding: "2px 4px", lineHeight: 1, opacity: 0.85,
        }}
        title="Emoji ekle"
      >😊</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 3000 }} />
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 3001,
            background: T.bgSurface, border: `1px solid ${T.borderLight}`, borderRadius: 12,
            padding: 10, width: 280, maxHeight: 220, overflowY: "auto",
            display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            {EMOJI_LIST.map((emoji, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { onSelect(emoji); setOpen(false); }}
                style={{
                  background: "none", border: "none", cursor: "pointer", fontSize: 20,
                  padding: 3, borderRadius: 6, transition: "background 0.1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = T.bgCardHover}
                onMouseLeave={e => e.currentTarget.style.background = "none"}
              >{emoji}</button>
            ))}
          </div>
        </>
      )}
    </div>
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
          const isToday = cell.currentMonth && cell.day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

          let bg = T.bgCard, borderCol = T.border;
          if (isPublish && isShoot) { bg = "rgba(168,85,247,0.12)"; borderCol = "#A855F7"; }
          else if (isPublish) { bg = "rgba(242,81,36,0.12)"; borderCol = `${T.amber}66`; }
          else if (isShoot) { bg = "rgba(236,72,153,0.12)"; borderCol = "#EC489966"; }

          return (
            <div key={i} onClick={()=>{ if(cell.currentMonth) setSelectedDay({day:cell.day, isPublish, isShoot, dayPosts, dateStr}); }} style={{
              minHeight: 66, borderRadius: 8, padding: "6px 7px", background: cell.currentMonth ? bg : "transparent",
              border: `1px solid ${isToday ? T.amber : (cell.currentMonth ? borderCol : "transparent")}`, opacity: cell.currentMonth ? 1 : 0.3,
              cursor: cell.currentMonth ? "pointer" : "default",
            }}>
              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? T.amberText : T.textSecondary, marginBottom: 3 }}>{cell.day}</div>
              {isPublish && <div style={{ fontSize: 8, fontWeight: 700, color: T.amberText, marginBottom: 1 }}>📅 Paylaşım</div>}
              {isShoot && <div style={{ fontSize: 8, fontWeight: 700, color: "#F9A8D4" }}>📷 Çekim</div>}
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
          {!selectedDay.isPublish && !selectedDay.isShoot && selectedDay.dayPosts.length === 0 ? (
            <div style={{ textAlign: "center", color: T.textMuted, fontSize: 13, padding: "30px 0" }}>Bu gün için plan yok 📭</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {selectedDay.isPublish && (
                <div style={{ padding: "14px 16px", background: "rgba(242,81,36,0.1)", borderRadius: 10, borderLeft: `3px solid ${T.amber}` }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.amberText, marginBottom: 6 }}>📅 Paylaşım Günü</div>
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
            // Kaydı Supabase'e de yaz (referans için)
            await supabase.from('media').insert({
              client_id: clientId,
              name: file.name,
              type: file.type.startsWith('video') ? 'video' : file.type.startsWith('image') ? 'image' : 'file',
              size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
              date: new Date().toLocaleDateString("tr-TR"),
              storage_path: driveFile.webViewLink || driveFile.id,
              storage_type: 'google_drive',
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
          });
        }
      } catch (err) {
        console.error("Yükleme hatası:", err);
      }
    }
    
    setUploading(false);
    setFiles([]);
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

function ModalActions({onClose,onSave}) {
  return <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
    <Btn onClick={onClose}>Vazgeç</Btn>
    <Btn variant="primary" onClick={onSave}>Kaydet</Btn>
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
      {perms.manageClients && <Btn variant="primary" onClick={()=>{setModal("addClient");setForm({name:"",category:"",phone:"",address:"",city:"",district:"",taxNumber:"",taxOffice:"",monthlyFee:"",publishDays:[],shootDays:[],publishTimes:[],platforms:[]});}} style={{flex:1}}>+ Yeni müşteri ekle</Btn>}
    </div>

    <div style={{display:"flex",flexDirection:"column",gap:2}}>
      {filteredClients.map(client=>{
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
    </div>

    {modal==="addClient"&&<Modal title="Yeni müşteri ekle" onClose={()=>setModal(null)}>
      <FormField label="İşletme adı"><Input placeholder="Örn: Lezzet Durağı" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Input placeholder="Örn: Restoran & Cafe" value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
      <FormField label="Aylık ücret (₺)"><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>
      <FormField label="📅 Paylaşım günleri"><DaySelector selected={Array.isArray(form.publishDays)?form.publishDays:[]} onChange={days=>setForm(f=>({...f,publishDays:days}))} activeColor={T.amber} /></FormField>
      <FormField label="🕐 Paylaşım saatleri"><TimeSelector times={form.publishTimes||[]} onChange={t=>setForm(f=>({...f,publishTimes:t}))} /></FormField>
      <FormField label="📷 Çekim günleri"><DaySelector selected={Array.isArray(form.shootDays)?form.shootDays:[]} onChange={days=>setForm(f=>({...f,shootDays:days}))} activeColor="#EC4899" /></FormField>
      <FormField label="Platformlar">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(platformConfig).map(([id,p])=>{const sel=(form.platforms||[]).includes(id);return <span key={id} onClick={()=>setForm(f=>({...f,platforms:sel?f.platforms.filter(x=>x!==id):[...(f.platforms||[]),id]}))} style={{fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:sel?p.bg:T.bgInput,color:sel?p.color:T.textMuted,border:`1px solid ${sel?p.color+"44":T.border}`}}>{p.label}</span>;})}
        </div>
      </FormField>
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
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"",
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays, publish_times: publishTimes,
          monthly_fee: parseInt(form.monthlyFee)||0, contract_start: "Temmuz 2026",
        }).select().single();
        if(error){ alert("HATA: Müşteri eklenemedi!\n\n"+error.message+"\n\nSupabase'de publish_times sütunu eksik olabilir. SQL kodunu çalıştırın."); return; }
        if(data){
          setClients(prev=>[...prev,{id:data.id,name:data.name,category:data.category,initials:data.initials,accentColor:data.accent_color,phone:data.phone,address:data.address,city:data.city,district:data.district,taxNumber:data.tax_number,taxOffice:data.tax_office,platforms:data.platforms||[],publishDays:data.publish_days||[],shootDays:data.shoot_days||[],publishTimes:data.publish_times||[],monthlyFee:data.monthly_fee,contractStart:data.contract_start,posts:[],invoices:[],media:[],socialAccounts:[],calEvents:[]}]);
        }
        setModal(null);
      }} />
    </Modal>}

    {modal==="editClient"&&<Modal title="Müşteri Bilgilerini Düzenle" onClose={()=>setModal(null)}>
      <FormField label="İşletme adı"><Input placeholder="Örn: Lezzet Durağı" value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></FormField>
      <FormField label="Kategori"><Input placeholder="Örn: Restoran & Cafe" value={form.category||""} onChange={e=>setForm(f=>({...f,category:e.target.value}))} /></FormField>
      <FormField label="Telefon"><Input placeholder="05XX XXX XX XX" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} /></FormField>
      <FormField label="Adres"><Textarea placeholder="Açık adres" value={form.address||""} onChange={e=>setForm(f=>({...f,address:e.target.value}))} /></FormField>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <FormField label="İl"><Input placeholder="Istanbul" value={form.city||""} onChange={e=>setForm(f=>({...f,city:e.target.value}))} /></FormField>
        <FormField label="İlçe"><Input placeholder="Besiktas" value={form.district||""} onChange={e=>setForm(f=>({...f,district:e.target.value}))} /></FormField>
      </div>
      <FormField label="Vergi Numarası"><Input placeholder="12345678901" value={form.taxNumber||""} onChange={e=>setForm(f=>({...f,taxNumber:e.target.value}))} /></FormField>
      <FormField label="Vergi Dairesi"><Input placeholder="Istanbul Vergi Dairesi" value={form.taxOffice||""} onChange={e=>setForm(f=>({...f,taxOffice:e.target.value}))} /></FormField>
      <FormField label="Aylık ücret (₺)"><Input type="number" placeholder="0" value={form.monthlyFee||""} onChange={e=>setForm(f=>({...f,monthlyFee:e.target.value}))} /></FormField>
      <FormField label="📅 Paylaşım günleri"><DaySelector selected={Array.isArray(form.publishDays)?form.publishDays:[]} onChange={days=>setForm(f=>({...f,publishDays:days}))} activeColor={T.amber} /></FormField>
      <FormField label="🕐 Paylaşım saatleri"><TimeSelector times={form.publishTimes||[]} onChange={t=>setForm(f=>({...f,publishTimes:t}))} /></FormField>
      <FormField label="📷 Çekim günleri"><DaySelector selected={Array.isArray(form.shootDays)?form.shootDays:[]} onChange={days=>setForm(f=>({...f,shootDays:days}))} activeColor="#EC4899" /></FormField>
      <FormField label="Platformlar">
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {Object.entries(platformConfig).map(([id,p])=>{const sel=(form.platforms||[]).includes(id);return <span key={id} onClick={()=>setForm(f=>({...f,platforms:sel?f.platforms.filter(x=>x!==id):[...(f.platforms||[]),id]}))} style={{fontSize:11,fontWeight:700,padding:"5px 10px",borderRadius:6,cursor:"pointer",background:sel?p.bg:T.bgInput,color:sel?p.color:T.textMuted,border:`1px solid ${sel?p.color+"44":T.border}`}}>{p.label}</span>;})}
        </div>
      </FormField>
      <ModalActions onClose={()=>setModal(null)} onSave={async()=>{
        if(!form.name)return;
        const initials = form.name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
        const publishDays = Array.isArray(form.publishDays)?form.publishDays:[];
        const shootDays = Array.isArray(form.shootDays)?form.shootDays:[];
        const publishTimes = form.publishTimes||[];
        const { error } = await supabase.from('clients').update({
          name: form.name, category: form.category||"", initials,
          phone: form.phone||"", address: form.address||"", city: form.city||"", district: form.district||"",
          tax_number: form.taxNumber||"", tax_office: form.taxOffice||"",
          platforms: form.platforms||[], publish_days: publishDays, shoot_days: shootDays, publish_times: publishTimes,
          monthly_fee: parseInt(form.monthlyFee)||0,
        }).eq('id', form.id);
        if(error){ alert("HATA: Müşteri güncellenemedi!\n\n"+error.message+"\n\nSupabase'de publish_times sütunu eksik olabilir. SQL kodunu çalıştırın."); return; }
        setClients(clients.map(c=>c.id===form.id?{...c,name:form.name,category:form.category||"",initials,phone:form.phone||"",address:form.address||"",city:form.city||"",district:form.district||"",taxNumber:form.taxNumber||"",taxOffice:form.taxOffice||"",platforms:form.platforms||[],publishDays,shootDays,publishTimes,monthlyFee:parseInt(form.monthlyFee)||0}:c));
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
          type: form.type||"Reels", title: form.title, status: form.status||"planned", description: form.description||"",
        }).select().single();
        if(!error && data){
          setClients(prev=>prev.map(c=>c.id===form.clientId?{...c,posts:[...c.posts,{id:data.id,date:data.date,platform:data.platform,type:data.type,title:data.title,status:data.status,description:data.description}]}:c));
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
        <Btn onClick={()=>setMessagingClient(client)} style={{fontSize:11,padding:"5px 10px"}}>💬 Mesaj</Btn>
        {perms.manageClients && <Btn onClick={()=>{setModal("editClient");setForm({id:client.id,name:client.name,category:client.category,phone:client.phone,address:client.address,city:client.city,district:client.district,taxNumber:client.taxNumber,taxOffice:client.taxOffice,monthlyFee:client.monthlyFee,publishDays:client.publishDays||[],shootDays:client.shootDays||[],publishTimes:client.publishTimes||[],platforms:client.platforms||[]});}} style={{fontSize:11,padding:"5px 10px"}}>✏️ Düzenle</Btn>}
        {perms.manageClients && <Btn onClick={onDelete} style={{fontSize:11,padding:"5px 10px",background:T.redDim,color:T.redText}}>🗑 Sil</Btn>}
      </div>
    </div>
    <div style={{padding:20}}>
      {safeTab==="overview"&&<ClientOverview client={client} perms={perms}/>}
      {safeTab==="posts"&&<ClientPosts client={client}/>}
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
  return <div>
    <div style={{display:"grid",gridTemplateColumns:perms.finance?"repeat(4,1fr)":"repeat(3,1fr)",gap:10,marginBottom:20}}>
      {perms.finance && <StatCard label="Aylık Paket" value={fmtMoney(client.monthlyFee)} />}
      <StatCard label="Paylaşım" value={client.posts.filter(p=>p.status==="done").length} sub="Bu ay yayınlanan" />
      <StatCard label="Medya Dosyası" value={client.media.length} />
      <StatCard label="Sözleşme Başlangıç" value={client.contractStart} />
    </div>
    <div style={{display:"grid",gridTemplateColumns:perms.finance?"1fr 1fr":"1fr",gap:16,marginBottom:16}}>
      <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:16}}>
        <div style={{fontSize:11,color:T.textMuted,marginBottom:8,fontWeight:500,textTransform:"uppercase"}}>İşletme Bilgileri</div>
        <div style={{display:"flex",flexDirection:"column",gap:8,fontSize:12}}>
          <div><span style={{color:T.textMuted}}>Telefon:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.phone||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Şehir:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.city||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Vergi No:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.taxNumber||"—"}</span></div>
          <div><span style={{color:T.textMuted}}>Vergi Dairesi:</span> <span style={{color:T.textPrimary,fontWeight:500}}>{client.taxOffice||"—"}</span></div>
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

function ClientPosts({client}) {
  return <div>
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {client.posts.length === 0 && (
        <div style={{textAlign:"center",padding:"30px 0",color:T.textMuted,fontSize:13}}>Henüz paylaşım eklenmemiş</div>
      )}
      {client.posts.map(p=>(
        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10}}>
          <PlatformTag id={p.platform}/>
          <span style={{fontSize:11,color:T.textMuted,minWidth:80}}>{p.date}</span>
          <span style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{p.type}</span>
          <span style={{fontSize:13,color:T.textPrimary,flex:1}}>{p.title}</span>
          <Badge status={p.status}/>
        </div>
      ))}
    </div>
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
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({});

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

    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:16}}>
      {ideas.map(idea => (
        <Card key={idea.id} style={{padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>{idea.title}</div>
            <Badge status={idea.status} />
          </div>
          <div style={{fontSize:12,color:T.textMuted,marginBottom:12}}>{idea.description}</div>
          <div style={{display:"flex",gap:6}}>
            <span style={{fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:4,background:T.bgSurface,color:T.textMuted}}>{idea.category}</span>
          </div>
        </Card>
      ))}
    </div>

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
      <ModalActions onClose={()=>setModal(false)} onSave={()=>{
        if(!form.title) return;
        setIdeas([...ideas, {id:Date.now(),title:form.title,description:form.description,status:form.status,category:form.category}]);
        setModal(false);
      }} />
    </Modal>}
  </div>;
}

// ─────────────────────────────────────────────
// TASKS PAGE
// ─────────────────────────────────────────────
function TasksPage({tasks,setTasks,clients,staff}) {
  const [modal,setModal]=useState(false);
  const [form,setForm]=useState({});
  const [selectedTask,setSelectedTask]=useState(null);
  const [deleteModal,setDeleteModal]=useState(null);

  const cols=[
    {id:"todo",label:"Yapılacak",color:T.textMuted},
    {id:"inprogress",label:"Devam Ediyor",color:"#7DA4C7"},
    {id:"review",label:"İncelemede",color:T.amber},
    {id:"done",label:"Tamamlandı",color:T.green},
  ];

  const moveTask=async (id, newCol)=>{
    setTasks(prev=>prev.map(t=>t.id===id?{...t,col:newCol}:t));
    if(selectedTask && selectedTask.id===id){
      setSelectedTask({...selectedTask,col:newCol});
    }
    await supabase.from('tasks').update({ col: newCol }).eq('id', id);
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

  return <div>
    <div style={{marginBottom:20,padding:"16px",background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <span style={{fontSize:13,fontWeight:600,color:T.textPrimary}}>Toplam Tamamlanma Oranı</span>
        <span style={{fontSize:14,fontWeight:700,color:T.amber}}>{progressPercent}%</span>
      </div>
      <div style={{height:12,background:T.bgSurface,borderRadius:6,overflow:"hidden",border:`1px solid ${T.border}`}}>
        <div style={{height:"100%",width:`${progressPercent}%`,background:`linear-gradient(90deg, ${T.indigo}, ${T.amber}, ${T.green})`,borderRadius:6,transition:"width 0.6s ease",boxShadow:`0 0 20px ${T.amber}66`}} />
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:8,fontSize:11,color:T.textMuted}}>
        <span>✓ {doneTasks}</span>
        <span>→ {tasks.filter(t => t.col === "inprogress").length}</span>
        <span>◐ {tasks.filter(t => t.col === "review").length}</span>
        <span>○ {tasks.filter(t => t.col === "todo").length}</span>
      </div>
    </div>

    <div style={{display:"flex",gap:8,marginBottom:16}}>
      <Btn variant="primary" onClick={()=>{setModal(true);setForm({title:"",client:clients[0]?.name||"",assignee:staff[0]?.initials||"",type:"Tasarım",priority:"mid",due:""});}}>+ Görev ekle</Btn>
      <Btn onClick={()=>{
        const colLabels={todo:"Yapılacak",inprogress:"Devam Ediyor",review:"İncelemede",done:"Tamamlandı"};
        const rows = tasks.map(t => ({
          "Görev": t.title,
          "Müşteri": t.client || "—",
          "Durum": colLabels[t.col] || t.col,
          "Öncelik": priorityConfig[t.priority]?.label || "—",
          "Son Tarih": t.due || "—",
        }));
        printData("Görev Listesi", rows);
      }}>🖨️ Yazdır</Btn>
    </div>

    {selectedTask && (
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={()=>setSelectedTask(null)}>
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:16,padding:24,width:400}} onClick={e=>e.stopPropagation()}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <div style={{fontSize:16,fontWeight:600,color:T.textPrimary}}>{selectedTask.title}</div>
            <button onClick={()=>setSelectedTask(null)} style={{background:"none",border:"none",color:T.textMuted,fontSize:20,cursor:"pointer"}}>✕</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Müşteri</div><div style={{fontSize:13,color:T.textPrimary}}>{selectedTask.client}</div></div>
            <div><div style={{fontSize:10,color:T.textMuted,marginBottom:4,textTransform:"uppercase"}}>Durum</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                {cols.map(c=>(
                  <button key={c.id} onClick={()=>moveTask(selectedTask.id, c.id)} style={{padding:"6px",fontSize:10,fontWeight:600,borderRadius:6,background:selectedTask.col===c.id?T.amber:T.bgSurface,color:selectedTask.col===c.id?T.white:T.textMuted,border:`1px solid ${T.border}`,cursor:"pointer"}}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button onClick={()=>{setDeleteModal({taskId:selectedTask.id,reason:"",note:""});}} style={{padding:"6px 12px",fontSize:12,fontWeight:600,borderRadius:8,background:T.redDim,color:T.redText,border:"none",cursor:"pointer"}}>🗑 Sil</button>
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

    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
      {cols.map(col=>(
        <div key={col.id} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:12,padding:12,display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4,paddingBottom:10,borderBottom:`1px solid ${T.border}`}}>
            <span style={{fontSize:12,fontWeight:600,color:col.color}}>{col.label}</span>
            <span style={{fontSize:10,background:T.bgSurface,color:T.textMuted,borderRadius:20,padding:"1px 8px"}}>{tasks.filter(t=>t.col===col.id).length}</span>
          </div>
          {tasks.filter(t=>t.col===col.id).map(task=>(
            <div key={task.id} onClick={()=>setSelectedTask(task)} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",borderLeft:`3px solid ${priorityConfig[task.priority]?.color}`,transition:"all 0.12s"}}>
              <div style={{fontSize:12,fontWeight:500,color:T.textPrimary,marginBottom:6}}>{task.title}</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:6}}>
                <span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:priorityConfig[task.priority]?.bg,color:priorityConfig[task.priority]?.color}}>{priorityConfig[task.priority]?.label}</span>
                <span style={{fontSize:10,color:T.textMuted}}>{task.due}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>

    {modal&&<Modal title="Yeni görev" onClose={()=>setModal(false)}>
      <FormField label="Başlık">
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <Input placeholder="Görev" value={form.title||""} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
          <EmojiButton onSelect={(em)=>setForm(f=>({...f,title:(f.title||"")+em}))} size={20} />
        </div>
      </FormField>
      <FormField label="Müşteri"><Select value={form.client||""} onChange={e=>setForm(f=>({...f,client:e.target.value}))}>{clients.map(c=><option key={c.id}>{c.name}</option>)}</Select></FormField>
      <FormField label="Tür"><Select value={form.type||"Tasarım"} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>{["Tasarım","Video","Metin","Fotoğraf"].map(t=><option key={t}>{t}</option>)}</Select></FormField>
      <FormField label="Öncelik"><Select value={form.priority||"mid"} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}><option value="high">Yüksek</option><option value="mid">Orta</option><option value="low">Düşük</option></Select></FormField>
      <FormField label="Son tarih"><Input type="date" value={form.due||""} onChange={e=>setForm(f=>({...f,due:e.target.value}))} /></FormField>
      <ModalActions onClose={()=>setModal(false)} onSave={async()=>{
        if(!form.title)return;
        const { data, error } = await supabase.from('tasks').insert({
          title: form.title, type: form.type||"Tasarım",
          priority: form.priority||"mid", due_date: form.due||"—", col: "todo",
        }).select().single();
        if(!error && data){
          setTasks(prev=>[...prev,{id:data.id,title:data.title,client:form.client||"",col:"todo",due:form.due}]);
        }
        setModal(false);
      }} />
    </Modal>}
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
    }).select().single();

    if (error) {
      alert("HATA: Çalışan eklenemedi!\n\n" + error.message + "\n\nSupabase'de yetki sütunları eksik olabilir. SQL kodunu çalıştırın.");
      return;
    }

    if (data) {
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
        perm_accounting: data.perm_accounting,
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
      perm_accounting: editForm.perm_accounting,
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
            <Btn onClick={()=>{setEditModal(s);setEditForm({name:s.name,role:s.role,type:s.type,email:s.email,phone:s.phone,startDate:s.start,is_admin:s.is_admin,perm_finance:s.perm_finance,perm_manage_clients:s.perm_manage_clients,perm_manage_staff:s.perm_manage_staff,perm_accounting:s.perm_accounting});}} style={{fontSize:11,padding:"5px 10px"}}>✏️ Düzenle</Btn>
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
              {todayPublish.map(c=>(
                <div key={c.id} style={{fontSize:12,color:T.textPrimary,padding:"6px 10px",background:"rgba(242,81,36,0.12)",borderRadius:6,borderLeft:`2px solid ${c.accentColor}`}}>{c.name}</div>
              ))}
            </div>
          )}
        </div>
        <div>
          <div style={{fontSize:11,color:"#F9A8D4",fontWeight:600,marginBottom:8}}>ÇEKİM ({todayShoot.length})</div>
          {todayShoot.length === 0 ? (
            <div style={{fontSize:12,color:T.textMuted}}>Bugün çekim yok</div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {todayShoot.map(c=>(
                <div key={c.id} style={{fontSize:12,color:T.textPrimary,padding:"6px 10px",background:"rgba(236,72,153,0.12)",borderRadius:6,borderLeft:`2px solid ${c.accentColor}`}}>📷 {c.name}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

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

    {/* AYRILAN MÜŞTERİLER & ÇALIŞANLAR */}
    <DepartedSection allClients={allClients} allStaff={allStaff} refreshData={refreshData} perms={perms} />
  </div>;
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
  {id:"calendar",label:"Takvim",icon:"📅"},
  {id:"ideas",label:"Fikirler",icon:"💡"},
  {id:"tasks",label:"Görevler",icon:"📋"},
  {id:"messages",label:"Mesajlar",icon:"💬"},
  {id:"accounting",label:"Muhasebe",icon:"🧮"},
  {id:"staff",label:"Çalışanlar",icon:"👥"},
];

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
  const tabs = [
    { id: "cari", lbl: "💳 Müşteri Cari" },
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
      {tab === "giderler" && <AccountingExpenses staff={staff} />}
      {tab === "izin" && <AccountingLeave staff={staff} />}
      {tab === "takvim" && <AccountingCalendar staff={staff} />}
      {tab === "belgeler" && <AccountingDocuments />}
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
      client_id: parseInt(form.client_id),
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
          {clientStats.map(cs => {
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
  ] = await Promise.all([
    supabase.from('clients').select('*'),
    supabase.from('staff').select('*'),
    supabase.from('tasks').select('*'),
    supabase.from('posts').select('*'),
    supabase.from('invoices').select('*'),
    supabase.from('media').select('*'),
  ]);

  const clients = (clientsRaw || []).filter(c => !c.deleted_at).map(c => ({
    id: c.id, name: c.name, category: c.category || "", initials: c.initials || "",
    accentColor: c.accent_color || "#6366F1", phone: c.phone || "", address: c.address || "",
    city: c.city || "", district: c.district || "", taxNumber: c.tax_number || "", taxOffice: c.tax_office || "",
    platforms: c.platforms || [], publishDays: c.publish_days || [], shootDays: c.shoot_days || [],
    publishTimes: c.publish_times || [],
    monthlyFee: c.monthly_fee || 0, contractStart: c.contract_start || "",
    posts: (postsRaw || []).filter(p => p.client_id === c.id).map(p => ({
      id: p.id, date: p.date, platform: p.platform, type: p.type, title: p.title, status: p.status, description: p.description,
    })),
    invoices: (invoicesRaw || []).filter(i => i.client_id === c.id).map(i => ({
      id: i.id, no: i.no, date: i.date, amount: i.amount, vat: i.vat, total: i.total, status: i.status, desc: i.description,
    })),
    media: (mediaRaw || []).filter(m => m.client_id === c.id).map(m => ({
      id: m.id, name: m.name, type: m.type, size: m.size, date: m.date,
      storagePath: m.storage_path, storageType: m.storage_type,
    })),
  }));

  const staff = (staffRaw || []).filter(s => !s.deleted_at).map(s => ({
    id: s.id, name: s.name, role: s.role || "", initials: s.name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase(),
    color: ["#6366F1", "#EC4899", "#10B981"][s.id % 3], type: s.type || "Tam zamanlı",
    email: s.email, phone: s.phone || "", start: s.start_date || "",
    is_admin: s.is_admin, perm_finance: s.perm_finance, perm_manage_clients: s.perm_manage_clients, perm_manage_staff: s.perm_manage_staff, perm_accounting: s.perm_accounting,
  }));

  const tasks = (tasksRaw || []).filter(t => !t.deleted_at).map(t => ({
    id: t.id, title: t.title, client: clients.find(c => c.id === t.client_id)?.name || "",
    type: t.type || "", priority: t.priority || "mid", due: t.due_date || "", col: t.col || "todo",
  }));

  return { clients, staff, tasks, allClients: clientsRaw || [], allStaff: staffRaw || [] };
}

export default function App() {
  const [session, setSession] = useState(null);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [page, setPage] = useState(() => {
    const validPages = ['dashboard', 'clients', 'calendar', 'ideas', 'tasks', 'messages', 'accounting', 'staff'];
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
      const validPages = ['dashboard', 'clients', 'calendar', 'ideas', 'tasks', 'messages', 'accounting', 'staff'];
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
    if (!session) return;
    supabase.from('staff').select('*').eq('auth_id', session.user.id).single()
      .then(({ data }) => setCurrentStaff(data));
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

  if (authLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Yükleniyor...</div>;
  if (!session || !currentStaff) return <Login onLogin={() => {}} />;

  if (dataLoading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.textMuted}}>Veriler yükleniyor...</div>;

  // Yetki hesaplama: Yönetici her şeyi görür, diğerleri sadece izinli olduklarını
  const isAdmin = currentStaff.is_admin === true;
  const perms = {
    isAdmin,
    finance: isAdmin || currentStaff.perm_finance === true,       // Finansal bilgiler, faturalar, ödemeler, ücretler
    manageClients: isAdmin || currentStaff.perm_manage_clients === true,  // Müşteri ekle/düzenle/sil
    manageStaff: isAdmin || currentStaff.perm_manage_staff === true,      // Çalışan ekle/düzenle/sil
    accounting: isAdmin || currentStaff.perm_accounting === true || currentStaff.perm_finance === true, // Muhasebe erişimi
  };

  return <div style={{display:"flex",height:"100vh",background:T.bg,color:T.textPrimary,fontFamily:"'Inter',sans-serif"}}>
    <div style={{width:220,background:T.bgCard,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"16px 16px 14px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{marginBottom:6}}>
          <div style={{fontSize:20,fontWeight:700,color:"#1A2B3F",letterSpacing:"-0.02em"}}>panormos</div>
          <div style={{fontSize:18,fontWeight:700,color:"#F25124",letterSpacing:"-0.02em"}}>medya.</div>
        </div>
      </div>
      <div style={{flex:1,padding:"12px 8px"}}>
        {NAV.filter(item => (item.id !== 'staff' || perms.manageStaff) && (item.id !== 'accounting' || perms.accounting)).map(item=>(
          <div key={item.id} onClick={()=>setPage(item.id)} style={{
            display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:10,marginBottom:2,
            background:page===item.id?"rgba(34,58,89,0.45)":"transparent",
            border:`1px solid ${page===item.id?T.indigo+"88":"transparent"}`,
            color:page===item.id?"#A8C4DC":T.textSecondary,cursor:"pointer",fontSize:13,fontWeight:page===item.id?600:400,transition:"all 0.12s",
          }}>
            <span style={{fontSize:15}}>{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>

    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{padding:"14px 28px",borderBottom:`1px solid ${T.border}`,background:T.bgCard}}>
        <div style={{fontSize:18,fontWeight:700,color:T.textPrimary}}>
          {page === 'dashboard' ? '🏠 Ana Sayfa' : page === 'clients' ? '🏢 Müşteriler' : page === 'calendar' ? '📅 İçerik Takvimi' : page === 'ideas' ? '💡 Fikirler' : page === 'tasks' ? '📋 Görevler' : page === 'messages' ? '💬 Mesajlar' : page === 'accounting' ? '🧮 Muhasebe' : '👥 Çalışanlar'}
        </div>
      </div>
      <div style={{flex:1,overflow:"auto",padding:28}}>
        {page==="dashboard"&&<DashboardPage clients={clients} staff={staff} tasks={tasks} setPage={setPage} perms={perms} allClients={allClients} allStaff={allStaff} refreshData={refreshData}/>}
        {page==="clients"&&<ClientsPage clients={clients} setClients={setClients} allClients={allClients} perms={perms}/>}
        {page==="calendar"&&<CalendarPage clients={clients}/>}
        {page==="ideas"&&<IdeasPage/>}
        {page==="tasks"&&<TasksPage tasks={tasks} setTasks={setTasks} clients={clients} staff={staff}/>}
        {page==="messages"&&<MessagesPage currentStaff={currentStaff} staff={staff}/>}
        {page==="accounting"&&<AccountingPage clients={clients} staff={staff} perms={perms}/>}
        {page==="staff"&&<StaffPage staff={staff} setStaff={setStaff} allStaff={allStaff} perms={perms}/>}
      </div>
    </div>
  </div>;
}
