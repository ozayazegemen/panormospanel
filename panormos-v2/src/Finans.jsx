// ═══════════════ MUHASEBE: ÖZET / FİNANS / RAPORLAR / TANIMLAR ═══════════════
// Apsiyon'un finans düzeni örnek alınarak (27.10.2026) eklenen bölümler. Tablolar: supabase/finans-kurulum.sql
//  - Kasalar: bank_accounts (banka, kredi kartı, nakit kasa). Bakiye = açılış bakiyesi + bank_transactions.
//    Banka ve kart hesaplarının hareketleri ekstreden gelir; nakit kasanın hareketlerini panel kendisi yazar
//    (gider faturası ödemesi, kasa transferi). Böylece hiçbir para iki kez sayılmaz.
//  - Gider faturaları: kapalı (peşin) fatura işlem tarihinde, açık (vadeli) fatura ödeme planı satırı
//    "ödendi" işaretlenince gider olur (nakit esası). Tahakkuk esasında fatura tarihine yazılır.
import { useState, useEffect, Fragment } from "react";
import { supabase } from "./supabaseClient";
import { T } from "./theme";
import {
  Btn, Select, Input, Textarea, Modal, FormField, StatCard, ModalActions, fmtMoney, sumAmount, todayStr, ymdOf,
  TR_MONTHS, monthRefLabel, currentMonthRef, exportPerfectExcel, downloadPdfFromHTML, PRINT_STYLES, footerHTML,
  cariHesapla, muhasebeHareketleri, invoiceDueDate, printClientStatement, bankNorm, bankCatLabel, swalAlert, swalConfirm,
} from "./App.jsx";

const FIRMA_UNVAN = "Panormos Medya San. ve Tic. Ltd. Şti.";
const KASA_TURLERI = { banka: "Banka Hesabı", kredi_karti: "Kredi Kartı", nakit: "Nakit Kasa" };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const gunTR = (d) => { const p = String(d || "").slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : "—"; };
// "1.234,56" ve "1234,56" Türkçe yazım; virgül yoksa "1234.56" ondalık, "1.234" binlik sayılır
const sayi = (v) => {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  let s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
};
const gunEkle = (ymd, g) => { const d = new Date(ymd + "T00:00:00"); d.setDate(d.getDate() + g); return ymdOf(d); };
const HARFLER = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ".split("");
const ilkHarf = (ad) => String(ad || "").trim().charAt(0).toLocaleUpperCase("tr-TR");

// ───────────── Ortak veri ─────────────
// Muhasebenin bütün tabloları tek seferde; supabase tek istekte en çok 1000 satır verdiği için büyük tablolar sayfa sayfa
async function hepsiniOku(tablo, sec = "*", sira = "id") {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(tablo).select(sec).order(sira, { ascending: true }).range(from, from + 999);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < 1000) return { data: out, error: null };
  }
}
export function useFinVeri() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [kurulumYok, setKurulumYok] = useState(false);
  const yukle = async () => {
    const tablolar = {
      hesaplar: ["bank_accounts"], hareketler: ["bank_transactions"], musteriler: ["clients", "id,name,phone,email,deleted_at,source,agreement_date,payment_due_date,work_type,contract_end"],
      ucretler: ["client_finance", "client_id,monthly_fee", "client_id"], faturalar: ["client_invoices"], odemeler: ["client_payments"],
      giderler: ["company_expenses"], gelirler: ["company_incomes"], kayitlar: ["accounting_entries"], parcaIsler: ["piece_jobs"],
      kalemler: ["fin_kalemler"], cariler: ["fin_cariler"], gFaturalar: ["fin_gider_faturalari"], plan: ["fin_odeme_plani"],
      tekrar: ["fin_tekrarlanan"], transferler: ["fin_transferler"], borclandirma: ["fin_borclandirma"],
    };
    const anahtarlar = Object.keys(tablolar);
    const sonuc = await Promise.all(anahtarlar.map(k => hepsiniOku(...tablolar[k])));
    const veri = {}; const hatalar = []; let yok = false;
    sonuc.forEach((r, i) => {
      veri[anahtarlar[i]] = r.data || [];
      if (r.error) { if (tablolar[anahtarlar[i]][0].startsWith("fin_")) yok = true; else hatalar.push(`${tablolar[anahtarlar[i]][0]}: ${r.error.message}`); }
    });
    const ucret = Object.fromEntries(veri.ucretler.map(u => [u.client_id, Number(u.monthly_fee || 0)]));
    veri.musteriler = veri.musteriler.map(c => ({ ...c, monthlyFee: ucret[c.id] || 0 }));
    setKurulumYok(yok); setErr(hatalar.join(" · ")); setD(veri);
  };
  useEffect(() => { yukle(); }, []);
  return { d, err, kurulumYok, yukle };
}

function Uyarilar({ err, kurulumYok }) {
  return <>
    {kurulumYok && <div style={{ background: T.amberDim, color: T.amberText, padding: "12px 16px", borderRadius: 12, fontSize: 13, marginBottom: 14, lineHeight: 1.55 }}>
      <b>Finans tablolarının bir kısmı henüz kurulmamış.</b> Supabase SQL Editor'de <code>supabase/finans-kurulum.sql</code> ve <code>supabase/finans-kurulum-2.sql</code> dosyaları çalıştırılınca bütün bölümler açılır. O zamana kadar diğer bölümler eskisi gibi çalışır.
    </div>}
    {err && <div style={{ background: T.redDim, color: T.redText, padding: "10px 14px", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>Bazı kayıtlar okunamadı, toplamlar eksik olabilir: {err}</div>}
  </>;
}
const Yukleniyor = () => <div style={{ textAlign: "center", color: T.textMuted, padding: 30 }}>Yükleniyor...</div>;
const Kart = ({ baslik, sag, children, style }) => (
  <div style={{ background: T.bgCard, border: `1.5px solid ${T.cardBorder}`, borderRadius: 18, boxShadow: T.shadow, padding: "16px 18px", marginBottom: 18, ...style }}>
    {(baslik || sag) && <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: T.textPrimary, marginRight: "auto" }}>{baslik}</div>{sag}
    </div>}
    {children}
  </div>
);
const th = { textAlign: "left", padding: "8px 10px", fontSize: 10.5, color: T.textMuted, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };
const td = { padding: "8px 10px", fontSize: 13, color: T.textPrimary, borderTop: `1px solid ${T.border}` };
const sagTd = { ...td, textAlign: "right", whiteSpace: "nowrap" };
const sagTh = { ...th, textAlign: "right" };
const BosSatir = ({ n, metin = "Kayıt yok." }) => <tr><td colSpan={n} style={{ ...td, textAlign: "center", color: T.textMuted, padding: 20 }}>{metin}</td></tr>;
const Tablo = ({ children }) => <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table></div>;
const Sekmeler = ({ liste, aktif, sec }) => (
  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
    {liste.map(([id, ad]) => <button key={id} onClick={() => sec(id)} style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 9, cursor: "pointer", fontWeight: aktif === id ? 700 : 500, background: aktif === id ? T.amber : T.bgInput, color: aktif === id ? T.white : T.textSecondary, border: `1px solid ${aktif === id ? T.amber : T.border}` }}>{ad}</button>)}
  </div>
);
const HarfSuzgec = ({ harf, sec }) => (
  <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 10 }}>
    {["", ...HARFLER].map(h => <button key={h || "tumu"} onClick={() => sec(h)} style={{ fontSize: 11, minWidth: 24, padding: "4px 6px", borderRadius: 6, cursor: "pointer", background: harf === h ? T.amber : "transparent", color: harf === h ? T.white : T.textSecondary, border: `1px solid ${harf === h ? T.amber : T.border}` }}>{h || "Tümü"}</button>)}
  </div>
);

// ───────────── Ortak hesaplar ─────────────
const kalemAdi = (d, id) => d.kalemler.find(k => String(k.id) === String(id))?.ad || "";
const kalemGrubu = (d, id) => d.kalemler.find(k => String(k.id) === String(id))?.grup || "";
const cariAdi = (d, id) => d.cariler.find(c => String(c.id) === String(id))?.ad || "Tedarikçi yok";
const kasaAdi = (d, id) => d.hesaplar.find(a => String(a.id) === String(id))?.name || "—";
const faturaKalemi = (d, f) => { const k = (f.kalemler || [])[0]; return (k && kalemAdi(d, k.kalem_id)) || "Gider faturası"; };
const musteriAdi = (d, id) => d.musteriler.find(c => c.id === id)?.name || "Müşteri";

// Nakit esası = KASA HAREKETLERİ (Apsiyon mantığı): her kasa / banka hesabına giren ve çıkan para gelir-gider sayılır;
// böylece gelir − gider her zaman kasaların değişimiyle birebir tutar. Hesaplar arası transfer ve kart borcu ödemesi
// para yalnızca yer değiştirdiği için gelir-gider sayılmaz. Müşteri tahsilatı, gider faturası ödemesi gibi bağlı
// hareketler kendi adıyla gösterilir. sahip: "sirket" | "sahsi" | "hepsi"
const HARIC_KATEGORI = new Set(["kart_odeme", "transfer"]);
function kasaHareketleri(d, sahip = "sirket") {
  const hesap = Object.fromEntries(d.hesaplar.map(a => [a.id, a]));
  const odeme = Object.fromEntries(d.odemeler.map(p => [p.id, p]));
  const planFatura = (pid) => d.gFaturalar.find(f => f.id === d.plan.find(p => p.id === pid)?.fatura_id);
  return d.hareketler
    .filter(t => hesap[t.account_id] && (sahip === "hepsi" || (hesap[t.account_id].owner || "sirket") === sahip) && !HARIC_KATEGORI.has(t.category) && !/^transfer-/.test(t.eslesme || "") && Number(t.amount))
    .map(t => {
      const a = Number(t.amount);
      let type = bankCatLabel(t.category), grup = type, title = t.description || type;
      const m = String(t.eslesme || "").match(/^(fatura|plan|nakitplan):(\d+)$/);
      if (t.client_payment_id && odeme[t.client_payment_id]) { type = "Müşteri tahsilatı"; grup = "Müşteri Gelirleri"; title = musteriAdi(d, odeme[t.client_payment_id].client_id); }
      else if (m) {
        const f = m[1] === "fatura" ? d.gFaturalar.find(x => x.id === Number(m[2])) : planFatura(Number(m[2]));
        if (f) { type = faturaKalemi(d, f); grup = kalemGrubu(d, (f.kalemler || [])[0]?.kalem_id) || "Gider Faturaları"; title = cariAdi(d, f.cari_id); }
      }
      return { key: "k" + t.id, kind: a > 0 ? "gelir" : "gider", date: String(t.tx_date).slice(0, 10), type, grup, title, sub: kasaAdi(d, t.account_id), amount: Math.abs(a) };
    })
    .sort((x, y) => (y.date || "").localeCompare(x.date || ""));
}
// Tahakkuk esası: gelir fatura kesildiği gün, gider fatura / kayıt tarihine göre (ödenmiş olsun olmasın)
function tahakkukHareketleri(d) {
  const ayBasi = (ref) => (ref ? `${ref}-01` : "");
  const rows = [];
  d.faturalar.forEach(i => rows.push({ key: "ti" + i.id, kind: "gelir", date: String(i.invoice_date || i.uploaded_at || ayBasi(i.month_ref)).slice(0, 10), type: "Müşteri faturası", grup: "Müşteri Gelirleri", title: musteriAdi(d, i.client_id), sub: [i.invoice_no ? "Fatura " + i.invoice_no : "", i.month_ref ? monthRefLabel(i.month_ref) : ""].filter(Boolean).join(" · "), amount: Number(i.total || 0) }));
  d.gelirler.forEach(i => rows.push({ key: "tg" + i.id, kind: "gelir", date: i.income_date || "", type: "Diğer gelir", grup: "Diğer", title: i.title || i.source || "Gelir", sub: i.notes || "", amount: Number(i.amount || 0) }));
  d.parcaIsler.filter(j => j.status === "done").forEach(j => rows.push({ key: "tj" + j.id, kind: "gelir", date: j.due_date || ayBasi(j.month_ref), type: "Parça başı iş", grup: "Müşteri Gelirleri", title: musteriAdi(d, j.client_id), sub: j.title || "", amount: Number(j.amount || 0) }));
  d.giderler.forEach(x => rows.push({ key: "tx" + x.id, kind: "gider", date: x.expense_date || "", type: "Gider", grup: "Genel Giderler", title: x.title || "Gider", sub: x.notes || "", amount: Number(x.amount || 0) }));
  d.kayitlar.forEach(e => rows.push({ key: "te" + e.id, kind: "gider", date: e.due_date || ayBasi(e.month_ref), type: { sgk: "SGK", tax: "Vergi", salary: "Personel Maaşı" }[e.entry_type] || "Diğer gider", grup: "Personel ve Vergi", title: e.title || "", sub: e.month_ref ? monthRefLabel(e.month_ref) : "", amount: Number(e.amount || 0) }));
  d.gFaturalar.forEach(f => {
    const satirlar = (f.kalemler || []).filter(k => Number(k.tutar));
    (satirlar.length ? satirlar : [{ kalem_id: null, tutar: f.toplam }]).forEach((k, i) => rows.push({ key: `tf${f.id}-${i}`, kind: "gider", date: f.belge_tarihi || f.tarih, type: kalemAdi(d, k.kalem_id) || "Gider faturası", grup: kalemGrubu(d, k.kalem_id) || "Gider Faturaları", title: cariAdi(d, f.cari_id), sub: [f.belge_no ? "Belge " + f.belge_no : "", k.aciklama].filter(Boolean).join(" · "), amount: Number(k.tutar || 0) }));
  });
  return rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

// Kasa durumu: Devir (dönem öncesi) + Giren − Çıkan = Kalan
function kasaDurumu(d, bas, son, sahip = "hepsi") {
  return d.hesaplar.filter(a => sahip === "hepsi" || (a.owner || "sirket") === sahip).map(a => {
    const hs = d.hareketler.filter(t => t.account_id === a.id);
    const acilis = Number(a.acilis_bakiye || 0);
    const devir = acilis + sumAmount(hs.filter(t => t.tx_date < bas));
    const donem = hs.filter(t => t.tx_date >= bas && t.tx_date <= son);
    const giren = sumAmount(donem.filter(t => Number(t.amount) > 0));
    const cikan = -sumAmount(donem.filter(t => Number(t.amount) < 0));
    // Bankadaki gerçek bakiye (ekstreden ya da elle) ile panelin o güne kadarki bakiyesi karşılaştırılır
    const bankaVar = a.kind !== "nakit" && a.banka_bakiyesi != null && a.banka_bakiye_tarihi;
    const paneldeki = bankaVar ? acilis + sumAmount(hs.filter(t => t.tx_date <= a.banka_bakiye_tarihi)) : null;
    const fark = bankaVar ? Math.round((paneldeki - Number(a.banka_bakiyesi)) * 100) / 100 : null;
    return { hesap: a, devir, giren, cikan, kalan: devir + giren - cikan, bugun: acilis + sumAmount(hs.filter(t => t.tx_date <= todayStr())), fark };
  });
}

// Müşteri finansal durumu (cari kuralıyla): faturalanan, ödenen, borç; vadesi geçen faturalar
function musteriDurumlari(d) {
  const bugun = todayStr();
  const ids = new Set([...d.faturalar.map(i => i.client_id), ...d.odemeler.map(p => p.client_id)]);
  return d.musteriler.filter(c => !c.deleted_at || ids.has(c.id)).map(c => {
    const inv = d.faturalar.filter(i => i.client_id === c.id);
    const pay = d.odemeler.filter(p => p.client_id === c.id);
    const h = cariHesapla(pay, inv);
    const ayBorcu = Object.fromEntries(h.months.map(m => [m.m, m.debt]));
    const acik = inv.filter(i => i.status !== "paid" && (ayBorcu[i.month_ref || ""] || 0) > 0);
    const geciken = acik.filter(i => { const v = invoiceDueDate(i); return v && v < bugun; });
    const gecikmeTutari = geciken.reduce((s, i) => s + Math.min(Number(i.total || 0), ayBorcu[i.month_ref || ""] || 0), 0);
    const enEskiVade = geciken.map(invoiceDueDate).sort()[0] || "";
    const sonOdeme = pay.map(p => p.payment_date).filter(Boolean).sort().reverse()[0] || "";
    return { musteri: c, inv, pay, faturalanan: h.invoiced, odenen: h.paid, borc: h.balance, acik, geciken, gecikmeTutari, enEskiVade, sonOdeme, gecikmeGun: enEskiVade ? Math.round((new Date(bugun + "T00:00:00") - new Date(enEskiVade + "T00:00:00")) / 86400000) : 0 };
  }).sort((a, b) => b.borc - a.borc || a.musteri.name.localeCompare(b.musteri.name, "tr"));
}

// ───────────── Grafikler (bağımlılıksız SVG) ─────────────
const RENKLER = ["#F25124", "#6366F1", "#10B981", "#F59E0B", "#0EA5E9", "#EC4899", "#A855F7", "#14B8A6", "#EAB308", "#8A8F98"];
function Halka({ veriler, baslik }) {
  const toplam = sumAmount(veriler, "tutar");
  const R = 70, C = 2 * Math.PI * R;
  let bas = 0;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={baslik}>
        <circle cx="90" cy="90" r={R} fill="none" stroke={T.border} strokeWidth="26" />
        {toplam > 0 && veriler.map((v, i) => {
          const pay = v.tutar / toplam; const el = <circle key={v.ad} cx="90" cy="90" r={R} fill="none" stroke={RENKLER[i % RENKLER.length]} strokeWidth="26" strokeDasharray={`${pay * C} ${C}`} strokeDashoffset={-bas * C} transform="rotate(-90 90 90)" />;
          bas += pay; return el;
        })}
        <text x="90" y="84" textAnchor="middle" fontSize="11" fill={T.textMuted}>Toplam</text>
        <text x="90" y="102" textAnchor="middle" fontSize="13" fontWeight="800" fill={T.textPrimary}>{fmtMoney(toplam)}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 5 }}>
        {veriler.length === 0 && <div style={{ fontSize: 12.5, color: T.textMuted }}>Bu dönemde kayıt yok.</div>}
        {veriler.slice(0, 9).map((v, i) => (
          <div key={v.ad} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: RENKLER[i % RENKLER.length], flexShrink: 0 }} />
            <span style={{ color: T.textSecondary, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.ad}</span>
            <span style={{ color: T.textPrimary, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMoney(v.tutar)}</span>
            <span style={{ color: T.textMuted, width: 38, textAlign: "right" }}>%{toplam > 0 ? Math.round(v.tutar / toplam * 100) : 0}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
// Aylık tahsilat durumu: faturalanan tutarın tahsil edilen ve edilemeyen kısmı
function TahsilatGrafigi({ aylar }) {
  const enCok = Math.max(1, ...aylar.map(a => a.faturalanan));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 190, padding: "0 4px", borderBottom: `1px solid ${T.border}` }}>
        {aylar.map(a => {
          const tahsil = Math.min(a.tahsil, a.faturalanan);
          const yuk = (n) => `${Math.max(0, n / enCok * 160)}px`;
          return (
            <div key={a.m} title={`${monthRefLabel(a.m)}\nFaturalanan: ${fmtMoney(a.faturalanan)}\nTahsil edilen: ${fmtMoney(tahsil)}\nTahsil edilemeyen: ${fmtMoney(a.faturalanan - tahsil)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontSize: 9.5, color: T.textMuted, marginBottom: 3, whiteSpace: "nowrap" }}>{a.faturalanan ? Math.round(a.faturalanan / 1000) + "b" : ""}</div>
              <div style={{ width: "70%", maxWidth: 46, height: yuk(a.faturalanan - tahsil), background: "#F2A5A0", borderRadius: "4px 4px 0 0" }} />
              <div style={{ width: "70%", maxWidth: 46, height: yuk(tahsil), background: "#7CC4EA", borderRadius: a.faturalanan - tahsil > 0 ? 0 : "4px 4px 0 0" }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "6px 4px 0" }}>
        {aylar.map(a => <div key={a.m} style={{ flex: 1, textAlign: "center", fontSize: 10.5, color: T.textMuted }}>{TR_MONTHS[parseInt(a.m.slice(5)) - 1]?.slice(0, 3)}</div>)}
      </div>
      <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 10, fontSize: 12 }}>
        <span style={{ color: T.textSecondary }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#7CC4EA", marginRight: 5 }} />Tahsil edilen</span>
        <span style={{ color: T.textSecondary }}><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#F2A5A0", marginRight: 5 }} />Tahsil edilemeyen</span>
      </div>
    </div>
  );
}
const dagilim = (rows, alan = "type") => {
  const m = {}; rows.forEach(r => { const k = r[alan] || "Diğer"; m[k] = (m[k] || 0) + r.amount; });
  return Object.entries(m).map(([ad, tutar]) => ({ ad, tutar })).sort((a, b) => b.tutar - a.tutar);
};

// ═══════════════ ÖZET (Apsiyon düzeni) ═══════════════
export function FinansOzet({ goTab }) {
  const { d, err, kurulumYok } = useFinVeri();
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const [sahip, setSahip] = useState("sirket");
  if (!d) return <Yukleniyor />;
  const bugun = todayStr(), buAy = bugun.slice(0, 7);
  const bas = `${yil}-01-01`, son = `${yil}-12-31`;
  const kasalar = kasaDurumu(d, bas, son, sahip);
  const toplamKasa = { devir: sumAmount(kasalar, "devir"), giren: sumAmount(kasalar, "giren"), cikan: sumAmount(kasalar, "cikan"), kalan: sumAmount(kasalar, "kalan"), bugun: sumAmount(kasalar, "bugun") };
  const hareket = kasaHareketleri(d, sahip).filter(r => r.date >= bas && r.date <= son);
  const gelir = hareket.filter(r => r.kind === "gelir"), gider = hareket.filter(r => r.kind === "gider");
  const farkli = kasalar.filter(k => k.fark != null && Math.abs(k.fark) >= 0.01);
  // Kasaya bağlanmamış tahsilat: hangi hesaba geldiği seçilmemiş ödeme kasada görünmez
  const bagsiz = d.odemeler.filter(p => !p.bank_account_id);
  // Müşteri cari durumu: aylık borçlandırma (fatura ya da otomatik borç) ve tahsilat
  const durum = musteriDurumlari(d);
  const alacak = sumAmount(durum, "borc"), geciken = sumAmount(durum, "gecikmeTutari");
  const buAyBorc = sumAmount(d.faturalar.filter(i => i.month_ref === buAy), "total");
  const buAyTahsil = sumAmount(d.odemeler.filter(p => String(p.payment_date || "").slice(0, 7) === buAy));
  const sonTahsilat = [...d.odemeler].sort((a, b) => String(b.payment_date || "").localeCompare(String(a.payment_date || "")) || b.id - a.id).slice(0, 8);
  const aylar = [];
  for (let i = 9; i >= 0; i--) { const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - i); aylar.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`); }
  const ayVerisi = aylar.map(m => {
    const borc = d.faturalar.filter(i => i.month_ref === m);
    const ids = new Set(borc.map(i => i.client_id));
    return { m, faturalanan: sumAmount(borc, "total"), tahsil: sumAmount(d.odemeler.filter(p => p.month_ref === m && ids.has(p.client_id))) };
  });
  const odenecek = [
    ...d.plan.filter(p => !p.odendi).map(p => { const f = d.gFaturalar.find(x => x.id === p.fatura_id); return { key: "p" + p.id, vade: p.vade, ad: f ? cariAdi(d, f.cari_id) : "Gider faturası", alt: f ? [faturaKalemi(d, f), f.belge_no ? "Belge " + f.belge_no : ""].filter(Boolean).join(" · ") : "", tutar: Number(p.tutar || 0) }; }),
    ...d.kayitlar.filter(e => !e.is_paid).map(e => ({ key: "e" + e.id, vade: e.due_date || (e.month_ref ? e.month_ref + "-28" : ""), ad: e.title || "SGK / Vergi / Maaş", alt: e.month_ref ? monthRefLabel(e.month_ref) : "", tutar: Number(e.amount || 0) })),
  ].sort((a, b) => String(a.vade).localeCompare(String(b.vade)));
  const yillar = [...new Set([String(new Date().getFullYear()), ...d.hareketler.map(t => String(t.tx_date).slice(0, 4)), ...d.odemeler.map(p => String(p.payment_date || "").slice(0, 4))].filter(y => /^\d{4}$/.test(y)))].sort().reverse();
  const net = sumAmount(gelir) - sumAmount(gider);

  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ width: 110 }}><Select value={yil} onChange={e => setYil(e.target.value)}>{yillar.map(y => <option key={y} value={y}>{y}</option>)}</Select></div>
        <div style={{ width: 150 }}><Select value={sahip} onChange={e => setSahip(e.target.value)}><option value="sirket">Şirket hesapları</option><option value="sahsi">Şahsi hesaplar</option><option value="hepsi">Hepsi</option></Select></div>
        <Btn variant="primary" onClick={() => goTab("finans", "cari", true)}>+ Tahsilat</Btn>
        <Btn onClick={() => goTab("finans", "gfatura", true)}>+ Gider Faturası</Btn>
        <Btn onClick={() => goTab("finans", "transfer", true)}>+ Kasa Transferi</Btn>
        <Btn onClick={() => goTab("banka")}>Ekstre Yükle</Btn>
      </div>

      {farkli.length > 0 && <div style={{ background: T.redDim, color: T.redText, padding: "12px 16px", borderRadius: 12, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
        <b>Kasa ile banka tutmuyor:</b> {farkli.map(k => `${k.hesap.name} (fark ${fmtMoney(k.fark)})`).join(", ")}. Son ekstreyi yükleyin ve Banka Eşleştirme'de bekleyen hareketleri işleyin; fark kapanınca bu uyarı kalkar.
      </div>}
      {bagsiz.length > 0 && <div style={{ background: T.amberDim, color: T.amberText, padding: "12px 16px", borderRadius: 12, fontSize: 13, marginBottom: 14, lineHeight: 1.6 }}>
        <b>{bagsiz.length} tahsilat ({fmtMoney(sumAmount(bagsiz))}) hiçbir kasaya bağlı değil</b>, bu yüzden kasada görünmüyor. Tahsilat ve Müşteri Cari'de ödemenin "hangi hesaba geldi" kısmını seçin (nakitse Nakit Kasa).
        <Btn onClick={() => goTab("finans", "cari")} style={{ display: "inline-flex", marginLeft: 10, padding: "3px 10px", fontSize: 12 }}>Düzelt</Btn>
      </div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 18 }}>
        <StatCard label="Kasalarda Bugün" value={fmtMoney(toplamKasa.bugun)} color={T.indigoText || T.textPrimary} sub={farkli.length ? "Banka ile fark var" : "Banka ile tutuyor"} />
        <StatCard label={`Gelir · ${yil}`} value={fmtMoney(sumAmount(gelir))} color={T.greenText} sub="Kasalara giren" />
        <StatCard label={`Gider · ${yil}`} value={fmtMoney(sumAmount(gider))} color={T.redText} sub="Kasalardan çıkan" />
        <StatCard label={net >= 0 ? "Net Kâr" : "Net Zarar"} value={fmtMoney(net)} color={net >= 0 ? T.greenText : T.redText} sub="Gelir − gider" />
        <StatCard label="Müşterilerden Alacak" value={fmtMoney(alacak)} color={T.amberText} sub={geciken > 0 ? `${fmtMoney(geciken)} vadesi geçmiş` : "Vadesi geçen yok"} />
        <StatCard label="Ödenecekler" value={fmtMoney(sumAmount(odenecek, "tutar"))} color={T.redText} sub={`${odenecek.length} kayıt`} />
      </div>

      <Kart baslik={`Kasalar · ${gunTR(bas)} – ${gunTR(son)}`} sag={<Btn onClick={() => goTab("tanimlar", "kasa")}>Kasa ve Banka Tanımları</Btn>}>
        <Tablo>
          <thead><tr><th style={th}>Kasa / Banka</th><th style={sagTh}>Devir</th><th style={sagTh}>Giren</th><th style={sagTh}>Çıkan</th><th style={sagTh}>Kalan</th><th style={sagTh}>Bankadaki Bakiye</th></tr></thead>
          <tbody>
            <tr style={{ background: T.bgSurface }}><td style={{ ...td, fontWeight: 800 }}>₺ Toplam</td><td style={{ ...sagTd, fontWeight: 700 }}>{fmtMoney(toplamKasa.devir)}</td><td style={{ ...sagTd, color: T.greenText, fontWeight: 700 }}>+ {fmtMoney(toplamKasa.giren)}</td><td style={{ ...sagTd, color: T.redText, fontWeight: 700 }}>− {fmtMoney(toplamKasa.cikan)}</td><td style={{ ...sagTd, fontWeight: 800 }}>= {fmtMoney(toplamKasa.kalan)}</td><td style={sagTd} /></tr>
            {kasalar.length === 0 && <BosSatir n={6} metin="Henüz kasa ya da banka hesabı yok. Tanımlar > Kasa ve Banka'dan ekleyin." />}
            {kasalar.map(k => <tr key={k.hesap.id}>
              <td style={td}>{k.hesap.name}<div style={{ fontSize: 11, color: T.textMuted }}>{KASA_TURLERI[k.hesap.kind] || k.hesap.kind}{k.hesap.owner === "sahsi" ? " · Şahsi" : ""}</div></td>
              <td style={sagTd}>{fmtMoney(k.devir)}</td><td style={{ ...sagTd, color: T.greenText }}>+ {fmtMoney(k.giren)}</td><td style={{ ...sagTd, color: T.redText }}>− {fmtMoney(k.cikan)}</td><td style={{ ...sagTd, fontWeight: 700 }}>= {fmtMoney(k.kalan)}</td>
              <td style={sagTd}>{k.hesap.kind === "nakit" ? <span style={{ color: T.textMuted }}>—</span> : k.fark == null ? <span style={{ color: T.textMuted, fontSize: 12 }}>ekstre bekleniyor</span>
                : <>{fmtMoney(k.hesap.banka_bakiyesi)}<div style={{ fontSize: 11, color: Math.abs(k.fark) < 0.01 ? T.greenText : T.redText, fontWeight: 700 }}>{Math.abs(k.fark) < 0.01 ? "✓ tutuyor" : `fark ${fmtMoney(k.fark)}`} · {gunTR(k.hesap.banka_bakiye_tarihi)}</div></>}</td>
            </tr>)}
          </tbody>
        </Tablo>
        <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 8, lineHeight: 1.55 }}>Kasa bakiyesi = açılış bakiyesi + bütün giriş ve çıkışlar. Bankadaki bakiye son yüklenen ekstreden kendiliğinden alınır (ya da Tanımlar'dan elle girilir); panelin aynı tarihteki bakiyesiyle karşılaştırılır.</div>
      </Kart>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        <Kart baslik="Müşteri Cari Durumu" sag={<Btn onClick={() => goTab("finans", "durum")}>Tümü</Btn>} style={{ marginBottom: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 12 }}>
            {[["Bu ay borçlandırılan", buAyBorc, T.textPrimary], ["Bu ay tahsil edilen", buAyTahsil, T.greenText], ["Toplam alacak", alacak, T.amberText]].map(([l, v, c]) => <div key={l} style={{ background: T.bgSurface, borderRadius: 10, padding: "10px 12px" }}><div style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 700, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 16, fontWeight: 800, color: c }}>{fmtMoney(v)}</div></div>)}
          </div>
          <Tablo>
            <thead><tr><th style={th}>Borçlu müşteri</th><th style={sagTh}>Borç</th><th style={sagTh}>Vadesi geçen</th></tr></thead>
            <tbody>
              {durum.filter(s => s.borc > 0).length === 0 && <BosSatir n={3} metin="Borcu olan müşteri yok." />}
              {durum.filter(s => s.borc > 0).slice(0, 8).map(s => <tr key={s.musteri.id}><td style={{ ...td, fontWeight: 600 }}>{s.musteri.name}</td><td style={{ ...sagTd, color: T.redText, fontWeight: 700 }}>{fmtMoney(s.borc)}</td><td style={{ ...sagTd, color: s.gecikmeTutari > 0 ? T.redText : T.textMuted }}>{s.gecikmeTutari > 0 ? `${s.gecikmeGun} gün` : "—"}</td></tr>)}
            </tbody>
          </Tablo>
        </Kart>
        <Kart baslik="Son Tahsilatlar" sag={<Btn onClick={() => goTab("finans", "cari", true)}>+ Tahsilat</Btn>} style={{ marginBottom: 0 }}>
          <Tablo>
            <thead><tr><th style={th}>Tarih</th><th style={th}>Müşteri</th><th style={th}>Kasa</th><th style={sagTh}>Tutar</th></tr></thead>
            <tbody>
              {sonTahsilat.length === 0 && <BosSatir n={4} />}
              {sonTahsilat.map(p => <tr key={p.id}><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(p.payment_date)}</td><td style={td}>{musteriAdi(d, p.client_id)}</td><td style={{ ...td, color: p.bank_account_id ? T.textSecondary : T.amberText }}>{p.bank_account_id ? kasaAdi(d, p.bank_account_id) : "kasa seçilmemiş"}</td><td style={{ ...sagTd, color: T.greenText, fontWeight: 700 }}>{fmtMoney(p.amount)}</td></tr>)}
            </tbody>
          </Tablo>
        </Kart>
      </div>
      <div style={{ height: 18 }} />

      <Kart baslik="Aylık Tahsilat Durumu" sag={<span style={{ fontSize: 12, color: T.textMuted }}>Son 10 ay · borçlandırılan tutara göre</span>}>
        <TahsilatGrafigi aylar={ayVerisi} />
      </Kart>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        <Kart baslik={`Gider Dağılımı · ${yil}`} style={{ marginBottom: 0 }}><Halka veriler={dagilim(gider)} baslik="Gider dağılımı" /></Kart>
        <Kart baslik={`Gelir Dağılımı · ${yil}`} style={{ marginBottom: 0 }}><Halka veriler={dagilim(gelir, "title").slice(0, 9)} baslik="Gelir dağılımı" /></Kart>
      </div>
      <div style={{ height: 18 }} />

      <Kart baslik="Ödenecek Faturalar ve Giderler" sag={<Btn onClick={() => goTab("finans", "gfatura")}>Gider Faturaları</Btn>}>
        <Tablo>
          <thead><tr><th style={th}>Vade</th><th style={th}>Kime</th><th style={th}>Detay</th><th style={sagTh}>Tutar</th></tr></thead>
          <tbody>
            {odenecek.length === 0 && <BosSatir n={4} metin="Ödenecek fatura bulunmuyor." />}
            {odenecek.slice(0, 12).map(o => <tr key={o.key}><td style={{ ...td, whiteSpace: "nowrap", color: o.vade && o.vade < bugun ? T.redText : T.textPrimary, fontWeight: o.vade && o.vade < bugun ? 700 : 400 }}>{gunTR(o.vade)}{o.vade && o.vade < bugun ? " · gecikti" : ""}</td><td style={td}>{o.ad}</td><td style={{ ...td, color: T.textMuted }}>{o.alt}</td><td style={sagTd}>{fmtMoney(o.tutar)}</td></tr>)}
          </tbody>
        </Tablo>
      </Kart>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 18 }}>
        {[["Son Kasa Çıkışları", gider.slice(0, 8), T.redText], ["Son Kasa Girişleri", gelir.slice(0, 8), T.greenText]].map(([b, liste, renk]) => (
          <Kart key={b} baslik={b} style={{ marginBottom: 0 }}>
            <Tablo>
              <thead><tr><th style={th}>Tarih</th><th style={th}>Kim / Kalem</th><th style={sagTh}>Tutar</th></tr></thead>
              <tbody>
                {liste.length === 0 && <BosSatir n={3} />}
                {liste.map(r => <tr key={r.key}><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(r.date)}</td><td style={td}>{r.title}<div style={{ fontSize: 11, color: T.textMuted }}>{r.type} · {r.sub}</div></td><td style={{ ...sagTd, color: renk, fontWeight: 700 }}>{fmtMoney(r.amount)}</td></tr>)}
              </tbody>
            </Tablo>
          </Kart>
        ))}
      </div>
    </div>
  );
}

// ═══════════════ MÜŞTERİLERE GÖRE FİNANSAL DURUM ═══════════════
function ihtarYazisi(s) {
  const satir = s.geciken.map(i => `<tr><td>${esc(i.invoice_no || i.parasut_invoice_no || "—")}</td><td>${gunTR(i.invoice_date || i.uploaded_at)}</td><td>${monthRefLabel(i.month_ref)}</td><td>${gunTR(invoiceDueDate(i))}</td><td style="text-align:right">${fmtMoney(i.total)}</td></tr>`).join("");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>İhtar</title><style>${PRINT_STYLES} p.m { font-size:12px; line-height:1.7; margin:10px 0; } .imza { margin-top:40px; font-size:12px; }</style></head><body>
    <div class="head"><div class="logo">panormos <span class="m">medya.</span></div><h1>Ödeme İhtarı</h1><div class="sub">Tarih: ${gunTR(todayStr())}</div></div>
    <p class="m"><b>Sayın ${esc(s.musteri.name)},</b></p>
    <p class="m">Firmamız ile aranızdaki hizmet ilişkisi kapsamında düzenlenen ve aşağıda dökümü verilen faturaların vadesi geçmiş olmasına rağmen ödemesi yapılmamıştır. Vadesi geçmiş borcunuzun toplamı <b>${fmtMoney(s.gecikmeTutari)}</b>, toplam açık bakiyeniz <b>${fmtMoney(s.borc)}</b>'dir.</p>
    <table><tr><th>Fatura No</th><th>Fatura Tarihi</th><th>Dönem</th><th>Son Ödeme</th><th style="text-align:right">Tutar</th></tr>${satir}</table>
    <p class="m">İşbu yazının tarafınıza ulaşmasından itibaren <b>7 (yedi) gün</b> içinde borcunuzu ödemenizi; ödemenizi bu süre içinde yapmamanız halinde hizmetin durdurulabileceğini ve alacağımızın tahsili için yasal yollara başvurulacağını, doğacak masrafların tarafınıza ait olacağını bildiririz. Ödemeyi yaptıysanız bu yazıyı dikkate almayınız.</p>
    <div class="imza">${FIRMA_UNVAN}<br><br>Kaşe / İmza</div>
    ${footerHTML("Panormos Medya", "Ödeme ve sorularınız için bize ulaşın.")}
  </body></html>`;
  downloadPdfFromHTML(html, `Ihtar-${String(s.musteri.name).replace(/[^\wğüşıöçĞÜŞİÖÇ -]/g, "").trim()}-${todayStr()}.pdf`);
}
function borcsuzlukBelgesi(s) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Borçsuzluk</title><style>${PRINT_STYLES} p.m { font-size:12.5px; line-height:1.8; margin:14px 0; } .imza { margin-top:50px; font-size:12px; }</style></head><body>
    <div class="head"><div class="logo">panormos <span class="m">medya.</span></div><h1>Borçsuzluk Belgesi</h1><div class="sub">Tarih: ${gunTR(todayStr())}</div></div>
    <p class="m"><b>${esc(s.musteri.name)}</b>'in ${gunTR(todayStr())} tarihi itibarıyla ${FIRMA_UNVAN}'ne herhangi bir borcu bulunmamaktadır.</p>
    <p class="m">Bu belge ilgilinin talebi üzerine düzenlenmiştir. Kesilen faturalar toplamı ${fmtMoney(s.faturalanan)}, yapılan ödemeler toplamı ${fmtMoney(s.odenen)}'dir.</p>
    <div class="imza">${FIRMA_UNVAN}<br><br>Kaşe / İmza</div>
    ${footerHTML("Panormos Medya", "Bu belge panel kayıtlarından oluşturulmuştur.")}
  </body></html>`;
  downloadPdfFromHTML(html, `Borcsuzluk-${String(s.musteri.name).replace(/[^\wğüşıöçĞÜŞİÖÇ -]/g, "").trim()}-${todayStr()}.pdf`);
}

export function FinansDurum() {
  const { d, err, kurulumYok } = useFinVeri();
  const [harf, setHarf] = useState("");
  const [q, setQ] = useState("");
  const [suz, setSuz] = useState("hepsi"); // hepsi | borclu | geciken
  if (!d) return <Yukleniyor />;
  const liste = musteriDurumlari(d)
    .filter(s => !harf || ilkHarf(s.musteri.name) === harf)
    .filter(s => !q || bankNorm(s.musteri.name).includes(bankNorm(q)))
    .filter(s => suz === "hepsi" || (suz === "borclu" ? s.borc > 0 : s.gecikmeTutari > 0));
  const excel = () => exportPerfectExcel([{ name: "Finansal Durum", title: `MÜŞTERİLERE GÖRE FİNANSAL DURUM (${gunTR(todayStr())})`, rows: liste.map(s => ({ "Müşteri": s.musteri.name, "Aylık Ücret": s.musteri.monthlyFee || 0, "Faturalanan": s.faturalanan, "Ödenen": s.odenen, "Borç": s.borc, "Vadesi Geçen": s.gecikmeTutari, "En Eski Vade": gunTR(s.enEskiVade), "Gecikme (gün)": s.gecikmeGun || "", "Son Ödeme": gunTR(s.sonOdeme) })) }], `finansal-durum-${todayStr()}.xlsx`);
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12, marginBottom: 16 }}>
        <StatCard label="Faturalanan" value={fmtMoney(sumAmount(liste, "faturalanan"))} />
        <StatCard label="Ödenen" value={fmtMoney(sumAmount(liste, "odenen"))} color={T.greenText} />
        <StatCard label="Toplam Borç" value={fmtMoney(sumAmount(liste, "borc"))} color={T.amberText} sub={`${liste.filter(s => s.borc > 0).length} müşteri`} />
        <StatCard label="Vadesi Geçen" value={fmtMoney(sumAmount(liste, "gecikmeTutari"))} color={T.redText} sub={`${liste.filter(s => s.gecikmeTutari > 0).length} müşteri`} />
      </div>
      <Kart baslik="Müşterilere Göre Finansal Durum" sag={<>
        <div style={{ width: 200 }}><Input placeholder="Müşteri ara" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div style={{ width: 170 }}><Select value={suz} onChange={e => setSuz(e.target.value)}><option value="hepsi">Hepsi</option><option value="borclu">Borcu olanlar</option><option value="geciken">Vadesi geçenler</option></Select></div>
        <Btn onClick={excel} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel</Btn>
      </>}>
        <HarfSuzgec harf={harf} sec={setHarf} />
        <Tablo>
          <thead><tr><th style={th}>Müşteri</th><th style={sagTh}>Aylık Ücret</th><th style={sagTh}>Faturalanan</th><th style={sagTh}>Ödenen</th><th style={sagTh}>Borç</th><th style={sagTh}>Vadesi Geçen</th><th style={th}>Son Ödeme</th><th style={th}>B/A</th><th style={th}></th></tr></thead>
          <tbody>
            {liste.length === 0 && <BosSatir n={9} />}
            {liste.map(s => <tr key={s.musteri.id}>
              <td style={{ ...td, fontWeight: 600 }}>{s.musteri.name}{s.musteri.source === "emlakpanelim" && <span style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 400 }}> · Emlak Panelim</span>}{s.musteri.deleted_at && <span style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 400 }}> · ayrıldı</span>}</td>
              <td style={sagTd}>{s.musteri.monthlyFee ? fmtMoney(s.musteri.monthlyFee) : "—"}</td>
              <td style={sagTd}>{fmtMoney(s.faturalanan)}</td>
              <td style={sagTd}>{fmtMoney(s.odenen)}</td>
              <td style={{ ...sagTd, color: s.borc > 0 ? T.redText : T.greenText, fontWeight: 700 }}>{fmtMoney(s.borc)}</td>
              <td style={{ ...sagTd, color: s.gecikmeTutari > 0 ? T.redText : T.textMuted }}>{s.gecikmeTutari > 0 ? `${fmtMoney(s.gecikmeTutari)} · ${s.gecikmeGun} gün` : "—"}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(s.sonOdeme)}</td>
              <td style={td}>{s.borc > 0 ? "B" : "—"}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>
                <div style={{ display: "flex", gap: 5 }}>
                  <Btn title="Hesap ekstresi (PDF)" onClick={() => printClientStatement(s.musteri, s.inv, s.pay)} style={{ padding: "4px 9px", fontSize: 11.5 }}>Ekstre</Btn>
                  {s.gecikmeTutari > 0 && <Btn title="Vadesi geçen faturalar için ihtar yazısı (PDF)" onClick={() => ihtarYazisi(s)} style={{ padding: "4px 9px", fontSize: 11.5 }}>İhtar</Btn>}
                  {s.borc <= 0 && s.faturalanan > 0 && <Btn title="Borçsuzluk belgesi (PDF)" onClick={() => borcsuzlukBelgesi(s)} style={{ padding: "4px 9px", fontSize: 11.5 }}>Borçsuzluk</Btn>}
                </div>
              </td>
            </tr>)}
          </tbody>
        </Tablo>
        <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 8 }}>Borç, faturası kesilmiş aylarda fatura tutarından o aya yazılan ödemeler düşülerek hesaplanır. Vade = fatura tarihi + 10 gün. Ödeme girmek ve WhatsApp hatırlatması için Müşteri Cari sekmesini kullanın.</div>
      </Kart>
    </div>
  );
}

// ═══════════════ GİDER FATURALARI ═══════════════
const BOS_FATURA = () => ({ tarih: todayStr(), belge_tarihi: "", belge_no: "", cari_id: "", odeme_tipi: "acik", kasa_id: "", stopaj_orani: "0", aciklama: "", kalemler: [{ kalem_id: "", aciklama: "", tutar: "" }], plan: [] });
export function GiderFaturalari({ autoAdd = false }) {
  const { d, err, kurulumYok, yukle } = useFinVeri();
  const [form, setForm] = useState(autoAdd ? BOS_FATURA() : null);
  const [odeme, setOdeme] = useState(null); // { plan, tarih, kasa_id }
  const [suz, setSuz] = useState("hepsi");
  const [harf, setHarf] = useState("");
  const [busy, setBusy] = useState(false);
  if (!d) return <Yukleniyor />;
  const bugun = todayStr();
  const kalemTop = (f) => (f.kalemler || []).reduce((s, k) => s + sayi(k.tutar), 0);
  const planlari = (id) => d.plan.filter(p => p.fatura_id === id).sort((a, b) => String(a.vade).localeCompare(String(b.vade)));
  const kalanOf = (f) => f.odeme_tipi === "kapali" ? 0 : sumAmount(planlari(f.id).filter(p => !p.odendi), "tutar");
  const liste = [...d.gFaturalar].sort((a, b) => String(b.tarih).localeCompare(String(a.tarih)) || b.id - a.id)
    .filter(f => !harf || ilkHarf(cariAdi(d, f.cari_id)) === harf)
    .filter(f => suz === "hepsi" || (suz === "acik" ? kalanOf(f) > 0 : kalanOf(f) <= 0));

  const duzenle = (f) => setForm({ ...f, cari_id: f.cari_id ? String(f.cari_id) : "", kasa_id: f.kasa_id ? String(f.kasa_id) : "", stopaj_orani: String(f.stopaj_orani || 0), kalemler: (f.kalemler || []).map(k => ({ ...k, kalem_id: k.kalem_id ? String(k.kalem_id) : "", tutar: String(k.tutar) })), plan: planlari(f.id).map(p => ({ ...p, tutar: String(p.tutar) })) });
  const kaydet = async () => {
    if (busy) return;
    const toplam = kalemTop(form);
    if (!form.tarih || !(toplam > 0)) { swalAlert("Tarih ve en az bir kalem tutarı zorunlu."); return; }
    if (form.odeme_tipi === "kapali" && !form.kasa_id) { swalAlert("Peşin (kapalı) faturada paranın çıktığı kasayı seçin."); return; }
    // Açık faturada plan girilmediyse tek satır: vade = işlem tarihi
    let plan = form.odeme_tipi === "acik" ? form.plan.filter(p => sayi(p.tutar) > 0 && p.vade) : [];
    if (form.odeme_tipi === "acik" && plan.length === 0) plan = [{ vade: form.tarih, tutar: String(toplam), aciklama: "" }];
    const planTop = plan.reduce((s, p) => s + sayi(p.tutar), 0);
    if (form.odeme_tipi === "acik" && Math.abs(planTop - toplam) > 0.01) { swalAlert(`Ödeme planı toplamı (${fmtMoney(planTop)}) fatura toplamına (${fmtMoney(toplam)}) eşit olmalı.`); return; }
    setBusy(true);
    const kayit = {
      tarih: form.tarih, belge_tarihi: form.belge_tarihi || null, belge_no: form.belge_no || "", cari_id: form.cari_id ? Number(form.cari_id) : null,
      odeme_tipi: form.odeme_tipi, kasa_id: form.odeme_tipi === "kapali" && form.kasa_id ? Number(form.kasa_id) : null,
      stopaj_orani: sayi(form.stopaj_orani), aciklama: form.aciklama || "", toplam,
      kalemler: form.kalemler.filter(k => sayi(k.tutar) > 0).map(k => ({ kalem_id: k.kalem_id ? Number(k.kalem_id) : null, aciklama: k.aciklama || "", tutar: sayi(k.tutar) })),
    };
    const r = form.id ? await supabase.from('fin_gider_faturalari').update(kayit).eq('id', form.id).select().single() : await supabase.from('fin_gider_faturalari').insert(kayit).select().single();
    if (r.error) { setBusy(false); swalAlert("Fatura kaydedilemedi: " + r.error.message); return; }
    const id = r.data.id;
    // Ödeme planı: ödenmiş satırlar korunur, ödenmemişler yeniden yazılır
    await supabase.from('fin_odeme_plani').delete().eq('fatura_id', id).eq('odendi', false);
    const yeniPlan = plan.filter(p => !p.odendi).map(p => ({ fatura_id: id, vade: p.vade, tutar: sayi(p.tutar), aciklama: p.aciklama || "" }));
    if (yeniPlan.length) { const e = await supabase.from('fin_odeme_plani').insert(yeniPlan); if (e.error) swalAlert("Ödeme planı kaydedilemedi: " + e.error.message); }
    if (form.odeme_tipi === "kapali") await supabase.from('fin_odeme_plani').delete().eq('fatura_id', id);
    // Peşin faturanın parası nakit kasadan çıktıysa kasa hareketi yazılır (banka/kart ekstreden gelir)
    await kasaHareketiYaz(d, `fatura:${id}`, form.odeme_tipi === "kapali" ? form.kasa_id : null, form.tarih, -toplam, `Gider faturası · ${cariAdi(d, kayit.cari_id)}${kayit.belge_no ? " · " + kayit.belge_no : ""}`);
    setBusy(false); setForm(null); yukle();
  };
  const sil = async (f) => {
    if (!await swalConfirm(`${cariAdi(d, f.cari_id)} — ${fmtMoney(f.toplam)} gider faturası ve ödeme planı silinsin mi?`)) return;
    const e = await supabase.from('fin_gider_faturalari').delete().eq('id', f.id);
    if (e.error) { swalAlert("Silinemedi: " + e.error.message); return; }
    await supabase.from('bank_transactions').delete().eq('eslesme', `fatura:${f.id}`);
    await supabase.from('bank_transactions').delete().in('eslesme', planlari(f.id).map(p => `nakitplan:${p.id}`));
    yukle();
  };
  const odemeKaydet = async () => {
    const p = odeme.plan;
    const e = await supabase.from('fin_odeme_plani').update({ odendi: true, odeme_tarihi: odeme.tarih, kasa_id: odeme.kasa_id ? Number(odeme.kasa_id) : null }).eq('id', p.id);
    if (e.error) { swalAlert("Kaydedilemedi: " + e.error.message); return; }
    const f = d.gFaturalar.find(x => x.id === p.fatura_id);
    await kasaHareketiYaz(d, `nakitplan:${p.id}`, odeme.kasa_id, odeme.tarih, -Number(p.tutar), `Fatura ödemesi · ${f ? cariAdi(d, f.cari_id) : ""}`);
    setOdeme(null); yukle();
  };
  const odemeGeriAl = async (p) => {
    if (!await swalConfirm("Bu taksitin ödendi işareti kaldırılsın mı?")) return;
    await supabase.from('fin_odeme_plani').update({ odendi: false, odeme_tarihi: null, kasa_id: null }).eq('id', p.id);
    await supabase.from('bank_transactions').delete().eq('eslesme', `nakitplan:${p.id}`);
    await supabase.from('bank_transactions').update({ eslesme: null }).eq('eslesme', `plan:${p.id}`);
    yukle();
  };
  const f = form;
  const ft = f ? kalemTop(f) : 0;
  const kalemler = d.kalemler.filter(k => k.tur === "gider" && k.aktif !== false);
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <Kart baslik={`Gider Faturaları (${liste.length})`} sag={<>
        <div style={{ width: 170 }}><Select value={suz} onChange={e => setSuz(e.target.value)}><option value="hepsi">Hepsi</option><option value="acik">Ödenmemiş</option><option value="kapali">Ödenmiş</option></Select></div>
        <Btn onClick={() => exportPerfectExcel([{ name: "Gider Faturaları", title: "GİDER FATURALARI", rows: liste.map(x => ({ "İşlem Tarihi": gunTR(x.tarih), "Belge Tarihi": gunTR(x.belge_tarihi), "Belge No": x.belge_no || "", "Tedarikçi": cariAdi(d, x.cari_id), "Kalem": faturaKalemi(d, x), "Ödeme": x.odeme_tipi === "kapali" ? "Peşin" : "Vadeli", "Toplam": Number(x.toplam), "Kalan": kalanOf(x) })) }], `gider-faturalari-${todayStr()}.xlsx`)} style={{ background: T.greenDim, color: T.greenText }}>📊 Excel</Btn>
        <Btn variant="primary" onClick={() => setForm(BOS_FATURA())} disabled={kurulumYok}>+ Yeni Gider Faturası</Btn>
      </>}>
        <HarfSuzgec harf={harf} sec={setHarf} />
        <Tablo>
          <thead><tr><th style={th}>İşlem Tarihi</th><th style={th}>Belge</th><th style={th}>Tedarikçi</th><th style={th}>Gider</th><th style={th}>Ödeme</th><th style={sagTh}>Toplam</th><th style={sagTh}>Kalan</th><th style={th}></th></tr></thead>
          <tbody>
            {liste.length === 0 && <BosSatir n={8} metin="Henüz gider faturası yok." />}
            {liste.map(x => {
              const kalan = kalanOf(x); const plan = planlari(x.id);
              return <Fragment key={x.id}>
                <tr>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(x.tarih)}</td>
                  <td style={td}>{x.belge_no || "—"}<div style={{ fontSize: 11, color: T.textMuted }}>{x.belge_tarihi ? gunTR(x.belge_tarihi) : ""}</div></td>
                  <td style={{ ...td, fontWeight: 600 }}>{cariAdi(d, x.cari_id)}</td>
                  <td style={td}>{faturaKalemi(d, x)}{(x.kalemler || []).length > 1 ? ` +${x.kalemler.length - 1}` : ""}</td>
                  <td style={td}>{x.odeme_tipi === "kapali" ? `Peşin · ${kasaAdi(d, x.kasa_id)}` : "Vadeli"}</td>
                  <td style={sagTd}>{fmtMoney(x.toplam)}{Number(x.stopaj_orani) > 0 && <div style={{ fontSize: 11, color: T.textMuted }}>stopaj %{x.stopaj_orani}</div>}</td>
                  <td style={{ ...sagTd, color: kalan > 0 ? T.redText : T.greenText, fontWeight: 700 }}>{kalan > 0 ? fmtMoney(kalan) : "Ödendi"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 5 }}><Btn onClick={() => duzenle(x)} style={{ padding: "4px 9px", fontSize: 11.5 }}>Düzenle</Btn><Btn onClick={() => sil(x)} style={{ padding: "4px 9px", fontSize: 11.5, color: T.redText }}>Sil</Btn></div></td>
                </tr>
                {x.odeme_tipi === "acik" && plan.map(p => <tr key={"p" + p.id}>
                  <td style={{ ...td, borderTop: "none", paddingTop: 2 }} />
                  <td colSpan={4} style={{ ...td, borderTop: "none", paddingTop: 2, fontSize: 12, color: T.textSecondary }}>↳ Vade {gunTR(p.vade)}{p.aciklama ? " · " + p.aciklama : ""}{!p.odendi && p.vade < bugun ? <b style={{ color: T.redText }}> · gecikti</b> : ""}{p.odendi ? ` · ${gunTR(p.odeme_tarihi)} tarihinde ödendi${p.kasa_id ? " (" + kasaAdi(d, p.kasa_id) + ")" : ""}` : ""}</td>
                  <td style={{ ...sagTd, borderTop: "none", paddingTop: 2, fontSize: 12 }}>{fmtMoney(p.tutar)}</td>
                  <td colSpan={2} style={{ ...td, borderTop: "none", paddingTop: 2 }}>{p.odendi ? <Btn onClick={() => odemeGeriAl(p)} style={{ padding: "3px 8px", fontSize: 11 }}>Geri al</Btn> : <Btn variant="primary" onClick={() => setOdeme({ plan: p, tarih: todayStr(), kasa_id: "" })} style={{ padding: "3px 8px", fontSize: 11 }}>Ödendi</Btn>}</td>
                </tr>)}
              </Fragment>;
            })}
          </tbody>
        </Tablo>
      </Kart>

      {f && <Modal title={f.id ? "Gider Faturasını Düzenle" : "Yeni Gider Faturası"} onClose={() => setForm(null)} width={780}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: "0 14px" }}>
          <FormField label="İşlem tarihi *"><Input type="date" value={f.tarih} onChange={e => setForm({ ...f, tarih: e.target.value })} /></FormField>
          <FormField label="Belge tarihi"><Input type="date" value={f.belge_tarihi || ""} onChange={e => setForm({ ...f, belge_tarihi: e.target.value })} /></FormField>
          <FormField label="Belge no"><Input value={f.belge_no || ""} onChange={e => setForm({ ...f, belge_no: e.target.value })} /></FormField>
          <FormField label="Tedarikçi (cari)"><Select value={f.cari_id} onChange={e => setForm({ ...f, cari_id: e.target.value })}><option value="">Seçin</option>{d.cariler.filter(c => c.aktif !== false || String(c.id) === f.cari_id).map(c => <option key={c.id} value={c.id}>{c.ad}</option>)}</Select></FormField>
          <FormField label="Ödeme tipi"><Select value={f.odeme_tipi} onChange={e => setForm({ ...f, odeme_tipi: e.target.value })}><option value="acik">Açık fatura (vadeli, sonra ödenecek)</option><option value="kapali">Kapalı fatura (peşin ödendi)</option></Select></FormField>
          {f.odeme_tipi === "kapali" ? <FormField label="Paranın çıktığı kasa *"><Select value={f.kasa_id} onChange={e => setForm({ ...f, kasa_id: e.target.value })}><option value="">Seçin</option>{d.hesaplar.map(a => <option key={a.id} value={a.id}>{a.name} ({KASA_TURLERI[a.kind] || a.kind})</option>)}</Select></FormField>
            : <FormField label="Stopaj oranı"><Select value={f.stopaj_orani} onChange={e => setForm({ ...f, stopaj_orani: e.target.value })}>{["0", "10", "15", "20"].map(o => <option key={o} value={o}>{o === "0" ? "Stopaj yok" : "%" + o}</option>)}</Select></FormField>}
        </div>
        {d.cariler.length === 0 && <div style={{ fontSize: 12, color: T.amberText, marginBottom: 10 }}>Henüz tedarikçi yok; Tanımlar &gt; Tedarikçiler'den ekleyebilirsiniz (zorunlu değil).</div>}
        <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", margin: "4px 0 6px" }}>Kalemler</div>
        {f.kalemler.map((k, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 0.8fr auto", gap: 8, marginBottom: 6 }}>
          <Select value={k.kalem_id} onChange={e => setForm({ ...f, kalemler: f.kalemler.map((x, j) => j === i ? { ...x, kalem_id: e.target.value } : x) })}><option value="">Gider kalemi</option>{kalemler.map(x => <option key={x.id} value={x.id}>{x.kod ? x.kod + " · " : ""}{x.ad}</option>)}</Select>
          <Input placeholder="Açıklama" value={k.aciklama} onChange={e => setForm({ ...f, kalemler: f.kalemler.map((x, j) => j === i ? { ...x, aciklama: e.target.value } : x) })} />
          <Input placeholder="Tutar" value={k.tutar} onChange={e => setForm({ ...f, kalemler: f.kalemler.map((x, j) => j === i ? { ...x, tutar: e.target.value } : x) })} />
          <Btn onClick={() => setForm({ ...f, kalemler: f.kalemler.length > 1 ? f.kalemler.filter((_, j) => j !== i) : f.kalemler })} title="Satırı sil">✕</Btn>
        </div>)}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 14px" }}>
          <Btn onClick={() => setForm({ ...f, kalemler: [...f.kalemler, { kalem_id: "", aciklama: "", tutar: "" }] })}>+ Yeni satır</Btn>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.textPrimary }}>Toplam: {fmtMoney(ft)}{sayi(f.stopaj_orani) > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}> · stopaj {fmtMoney(ft * sayi(f.stopaj_orani) / 100)} · net ödenecek {fmtMoney(ft * (1 - sayi(f.stopaj_orani) / 100))}</span>}</div>
        </div>
        {f.odeme_tipi === "acik" && <>
          <div style={{ fontSize: 11, color: T.textSecondary, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", margin: "4px 0 6px" }}>Ödeme planı (boş bırakılırsa tek ödeme, vade = işlem tarihi)</div>
          {f.plan.map((p, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr 0.8fr auto", gap: 8, marginBottom: 6, opacity: p.odendi ? 0.6 : 1 }}>
            <Input type="date" value={p.vade || ""} onChange={e => !p.odendi && setForm({ ...f, plan: f.plan.map((x, j) => j === i ? { ...x, vade: e.target.value } : x) })} />
            <Input placeholder={p.odendi ? "Ödendi" : "Açıklama"} value={p.aciklama || ""} onChange={e => !p.odendi && setForm({ ...f, plan: f.plan.map((x, j) => j === i ? { ...x, aciklama: e.target.value } : x) })} />
            <Input placeholder="Tutar" value={p.tutar} onChange={e => !p.odendi && setForm({ ...f, plan: f.plan.map((x, j) => j === i ? { ...x, tutar: e.target.value } : x) })} />
            <Btn onClick={() => !p.odendi && setForm({ ...f, plan: f.plan.filter((_, j) => j !== i) })} disabled={!!p.odendi}>✕</Btn>
          </div>)}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <Btn onClick={() => setForm({ ...f, plan: [...f.plan, { vade: f.tarih, aciklama: "", tutar: "" }] })}>+ Taksit ekle</Btn>
            {[2, 3, 6].map(n => <Btn key={n} onClick={() => { const pay = Math.round(ft / n * 100) / 100; setForm({ ...f, plan: Array.from({ length: n }, (_, j) => ({ vade: (() => { const t = new Date(f.tarih + "T00:00:00"); t.setMonth(t.getMonth() + j + 1); return ymdOf(t); })(), aciklama: `${j + 1}. taksit`, tutar: String(j === n - 1 ? Math.round((ft - pay * (n - 1)) * 100) / 100 : pay) })) }); }} disabled={!(ft > 0)}>{n} aylık taksit</Btn>)}
          </div>
        </>}
        <FormField label="Açıklama"><Textarea value={f.aciklama || ""} onChange={e => setForm({ ...f, aciklama: e.target.value })} minHeight={60} /></FormField>
        <ModalActions onClose={() => setForm(null)} onSave={kaydet} saveLabel={busy ? "Kaydediliyor..." : "Kaydet"} />
      </Modal>}

      {odeme && <Modal title="Taksit Ödendi" onClose={() => setOdeme(null)} width={420}>
        <div style={{ fontSize: 13, color: T.textSecondary, marginBottom: 12 }}>{fmtMoney(odeme.plan.tutar)} · vade {gunTR(odeme.plan.vade)}</div>
        <FormField label="Ödeme tarihi"><Input type="date" value={odeme.tarih} onChange={e => setOdeme({ ...odeme, tarih: e.target.value })} /></FormField>
        <FormField label="Hangi kasadan"><Select value={odeme.kasa_id} onChange={e => setOdeme({ ...odeme, kasa_id: e.target.value })}><option value="">Belirtilmedi</option>{d.hesaplar.map(a => <option key={a.id} value={a.id}>{a.name} ({KASA_TURLERI[a.kind] || a.kind})</option>)}</Select></FormField>
        <div style={{ fontSize: 11.5, color: T.textMuted }}>Banka ya da karttan ödendiyse hareket ekstreyle gelir; Banka Eşleştirme'den bu taksitle eşleştirebilirsiniz.</div>
        <ModalActions onClose={() => setOdeme(null)} onSave={odemeKaydet} />
      </Modal>}
    </div>
  );
}

// Nakit kasanın hareketini yazar (banka ve kartlar ekstreden geldiği için onlara yazılmaz); anahtar ile eskisi silinir
async function kasaHareketiYaz(d, anahtar, kasaId, tarih, tutar, aciklama) {
  await supabase.from('bank_transactions').delete().eq('eslesme', anahtar);
  const kasa = d.hesaplar.find(a => String(a.id) === String(kasaId));
  if (!kasa || kasa.kind !== "nakit" || !tutar) return;
  const r = await supabase.from('bank_transactions').insert({ account_id: kasa.id, tx_date: tarih, description: aciklama, amount: Math.round(tutar * 100) / 100, category: tutar < 0 ? "diger" : "gelir", source_file: "panel", eslesme: anahtar });
  if (r.error) swalAlert("Kasa hareketi yazılamadı: " + r.error.message);
}

// ═══════════════ TEKRARLANAN GİDERLER ═══════════════
// Her ayın belirlenen gününde açık gider faturası kendiliğinden oluşur (Muhasebe her açıldığında eksik aylar tamamlanır)
export async function tekrarlananlariOlustur() {
  const [{ data: kurallar, error }, { data: varOlan }] = await Promise.all([
    supabase.from('fin_tekrarlanan').select('*').eq('aktif', true),
    supabase.from('fin_gider_faturalari').select('tekrar_id,donem').not('tekrar_id', 'is', null),
  ]);
  if (error || !kurallar?.length) return 0;
  const bugun = todayStr();
  const olan = new Set((varOlan || []).map(x => `${x.tekrar_id}|${x.donem}`));
  let n = 0;
  for (const k of kurallar) {
    const [by, bm] = String(k.baslangic).split("-").map(Number);
    for (let y = by, m = bm, guard = 0; guard < 60; guard++) {
      const donem = `${y}-${String(m).padStart(2, "0")}`;
      const gun = `${donem}-${String(k.gun).padStart(2, "0")}`;
      if (gun > bugun || (k.bitis && gun > k.bitis)) break;
      if (gun >= k.baslangic && !olan.has(`${k.id}|${donem}`)) {
        const { data: f, error: e } = await supabase.from('fin_gider_faturalari').insert({ tarih: gun, cari_id: k.cari_id, odeme_tipi: "acik", toplam: Number(k.tutar), kalemler: [{ kalem_id: k.kalem_id, aciklama: k.ad, tutar: Number(k.tutar) }], aciklama: `${k.ad} · ${monthRefLabel(donem)} (tekrarlanan)`, tekrar_id: k.id, donem }).select().single();
        if (!e && f) { await supabase.from('fin_odeme_plani').insert({ fatura_id: f.id, vade: gunEkle(gun, Number(k.vade_gun || 0)), tutar: Number(k.tutar) }); n++; }
        olan.add(`${k.id}|${donem}`);
      }
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  return n;
}
export function Tekrarlananlar() {
  const { d, err, kurulumYok, yukle } = useFinVeri();
  const [form, setForm] = useState(null);
  if (!d) return <Yukleniyor />;
  const kaydet = async () => {
    if (!form.ad?.trim() || !(sayi(form.tutar) > 0) || !form.baslangic) { swalAlert("Ad, tutar ve başlangıç tarihi zorunlu."); return; }
    const kayit = { ad: form.ad.trim(), cari_id: form.cari_id ? Number(form.cari_id) : null, kalem_id: form.kalem_id ? Number(form.kalem_id) : null, tutar: sayi(form.tutar), gun: Math.min(28, Math.max(1, parseInt(form.gun) || 1)), vade_gun: Math.max(0, parseInt(form.vade_gun) || 0), baslangic: form.baslangic, bitis: form.bitis || null, aktif: form.aktif !== false };
    const r = form.id ? await supabase.from('fin_tekrarlanan').update(kayit).eq('id', form.id) : await supabase.from('fin_tekrarlanan').insert(kayit);
    if (r.error) { swalAlert("Kaydedilemedi: " + r.error.message); return; }
    const n = await tekrarlananlariOlustur();
    setForm(null); yukle();
    if (n > 0) swalAlert(`${n} gider faturası oluşturuldu.`);
  };
  const sil = async (k) => {
    if (!await swalConfirm(`"${k.ad}" tekrarlanan gideri silinsin mi? Daha önce oluşmuş faturalar kalır.`)) return;
    await supabase.from('fin_tekrarlanan').delete().eq('id', k.id); yukle();
  };
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <Kart baslik="Tekrarlanan Giderler" sag={<Btn variant="primary" disabled={kurulumYok} onClick={() => setForm({ ad: "", cari_id: "", kalem_id: "", tutar: "", gun: "1", vade_gun: "0", baslangic: currentMonthRef() + "-01", bitis: "", aktif: true })}>+ Yeni Tekrarlanan Gider</Btn>}>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 10 }}>Kira, internet, muhasebeci gibi her ay aynı olan giderler. Belirlenen gün gelince açık (vadeli) gider faturası kendiliğinden oluşur, Ödenecek Faturalar listesine düşer.</div>
        <Tablo>
          <thead><tr><th style={th}>Ad</th><th style={th}>Tedarikçi</th><th style={th}>Kalem</th><th style={th}>Her Ay</th><th style={th}>Başlangıç / Bitiş</th><th style={sagTh}>Tutar</th><th style={th}>Durum</th><th style={th}></th></tr></thead>
          <tbody>
            {d.tekrar.length === 0 && <BosSatir n={8} metin="Tanımlı tekrarlanan gider yok." />}
            {d.tekrar.map(k => <tr key={k.id}>
              <td style={{ ...td, fontWeight: 600 }}>{k.ad}</td><td style={td}>{cariAdi(d, k.cari_id)}</td><td style={td}>{kalemAdi(d, k.kalem_id) || "—"}</td>
              <td style={td}>Ayın {k.gun}. günü{k.vade_gun ? ` · ${k.vade_gun} gün vade` : ""}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(k.baslangic)} – {k.bitis ? gunTR(k.bitis) : "süresiz"}</td>
              <td style={sagTd}>{fmtMoney(k.tutar)}</td><td style={td}>{k.aktif ? "Aktif" : "Pasif"}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 5 }}><Btn onClick={() => setForm({ ...k, cari_id: k.cari_id ? String(k.cari_id) : "", kalem_id: k.kalem_id ? String(k.kalem_id) : "", tutar: String(k.tutar), gun: String(k.gun), vade_gun: String(k.vade_gun), bitis: k.bitis || "" })} style={{ padding: "4px 9px", fontSize: 11.5 }}>Düzenle</Btn><Btn onClick={() => sil(k)} style={{ padding: "4px 9px", fontSize: 11.5, color: T.redText }}>Sil</Btn></div></td>
            </tr>)}
          </tbody>
        </Tablo>
      </Kart>
      {form && <Modal title={form.id ? "Tekrarlanan Gideri Düzenle" : "Yeni Tekrarlanan Gider"} onClose={() => setForm(null)} width={560}>
        <FormField label="Ad *"><Input placeholder="Ör: Ofis kirası" value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} /></FormField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <FormField label="Tedarikçi"><Select value={form.cari_id} onChange={e => setForm({ ...form, cari_id: e.target.value })}><option value="">Seçin</option>{d.cariler.map(c => <option key={c.id} value={c.id}>{c.ad}</option>)}</Select></FormField>
          <FormField label="Gider kalemi"><Select value={form.kalem_id} onChange={e => setForm({ ...form, kalem_id: e.target.value })}><option value="">Seçin</option>{d.kalemler.filter(k => k.tur === "gider").map(k => <option key={k.id} value={k.id}>{k.ad}</option>)}</Select></FormField>
          <FormField label="Tutar (₺) *"><Input value={form.tutar} onChange={e => setForm({ ...form, tutar: e.target.value })} /></FormField>
          <FormField label="Her ayın kaçında (1–28)"><Input type="number" value={form.gun} onChange={e => setForm({ ...form, gun: e.target.value })} /></FormField>
          <FormField label="Kaç gün sonra ödenecek"><Input type="number" value={form.vade_gun} onChange={e => setForm({ ...form, vade_gun: e.target.value })} /></FormField>
          <FormField label="Durum"><Select value={form.aktif === false ? "0" : "1"} onChange={e => setForm({ ...form, aktif: e.target.value === "1" })}><option value="1">Aktif</option><option value="0">Pasif</option></Select></FormField>
          <FormField label="Başlangıç *"><Input type="date" value={form.baslangic} onChange={e => setForm({ ...form, baslangic: e.target.value })} /></FormField>
          <FormField label="Bitiş (boş = süresiz)"><Input type="date" value={form.bitis} onChange={e => setForm({ ...form, bitis: e.target.value })} /></FormField>
        </div>
        <ModalActions onClose={() => setForm(null)} onSave={kaydet} />
      </Modal>}
    </div>
  );
}

// ═══════════════ OTOMATİK BORÇLANDIRMA (Apsiyon'daki aidat borçlandırması) ═══════════════
// Her müşteriye her ay belirlenen günde aylık borç yazılır: client_invoices'a otomatik = true satırı (faturası henüz
// yüklenmemiş borç). O ayın gerçek faturası yüklenince otomatik borç kalkar (App.jsx saveDraft). Böylece cari, vade,
// hatırlatma ve ekstre hesapları değişmeden aylık borcu da görür. Muhasebe her açıldığında eksik aylar tamamlanır.
const sonGunu = (donem) => new Date(Number(donem.slice(0, 4)), Number(donem.slice(5, 7)), 0).getDate();
export async function borclandirmalariOlustur() {
  const { data: kurallar, error } = await supabase.from('fin_borclandirma').select('*').eq('aktif', true);
  if (error || !kurallar?.length) return 0;
  const { data: fat } = await supabase.from('client_invoices').select('client_id,month_ref').in('client_id', kurallar.map(k => k.client_id));
  const olan = new Set((fat || []).map(f => `${f.client_id}|${f.month_ref}`));
  const bugun = todayStr();
  const yeni = [];
  for (const k of kurallar) {
    let [y, m] = String(k.baslangic).split("-").map(Number);
    for (let guard = 0; guard < 36; guard++) {
      const donem = `${y}-${String(m).padStart(2, "0")}`;
      const gun = `${donem}-${String(Math.min(Number(k.gun) || 1, sonGunu(donem))).padStart(2, "0")}`;
      if (gun > bugun || (k.bitis && gun > k.bitis)) break;
      if (gun >= k.baslangic && !olan.has(`${k.client_id}|${donem}`)) {
        const toplam = Math.round(Number(k.tutar) * 100) / 100, tutar = Math.round(toplam / 1.2 * 100) / 100;
        yeni.push({ client_id: k.client_id, month_ref: donem, invoice_date: gun, amount: tutar, vat: Math.round((toplam - tutar) * 100) / 100, total: toplam, description: `Aylık hizmet bedeli · ${monthRefLabel(donem)} (otomatik borçlandırma)`, status: "pending", otomatik: true, file_name: "" });
        olan.add(`${k.client_id}|${donem}`);
      }
      m++; if (m > 12) { m = 1; y++; }
    }
  }
  if (!yeni.length) return 0;
  const { error: e } = await supabase.from('client_invoices').insert(yeni);
  return e ? 0 : yeni.length;
}

export function OtomatikBorclandirma() {
  const { d, err, kurulumYok, yukle } = useFinVeri();
  const [taslak, setTaslak] = useState({});
  const [busy, setBusy] = useState(false);
  if (!d) return <Yukleniyor />;
  const bugun = todayStr();
  // Bir sonraki anlaşma günü (bugün ya da sonrası): yeni kuralın başlangıcı
  const sonraki = (gun) => {
    const t = new Date(bugun + "T00:00:00");
    for (let k = 0; k < 2; k++) {
      const ay = new Date(t.getFullYear(), t.getMonth() + k, 1);
      const dn = `${ay.getFullYear()}-${String(ay.getMonth() + 1).padStart(2, "0")}`;
      const g = `${dn}-${String(Math.min(gun, sonGunu(dn))).padStart(2, "0")}`;
      if (g >= bugun) return g;
    }
    return bugun;
  };
  const musteriler = d.musteriler.filter(c => !c.deleted_at && (c.work_type || "monthly") !== "piece" && (!c.contract_end || c.contract_end >= bugun)).sort((a, b) => a.name.localeCompare(b.name, "tr"));
  const kural = (c) => d.borclandirma.find(k => String(k.client_id) === String(c.id));
  const varsayilan = (c) => { const gun = Math.min(28, Number(String(c.agreement_date || "").slice(8, 10)) || 1); return { aktif: true, tutar: String(Math.round(Number(c.monthlyFee || 0) * 1.2)), gun: String(gun), baslangic: sonraki(gun) }; };
  const al = (c, k) => taslak[c.id]?.[k] ?? (kural(c) ? String(kural(c)[k] ?? "") : varsayilan(c)[k]);
  const yaz = (c, k, v) => setTaslak(t => ({ ...t, [c.id]: { ...(t[c.id] || {}), [k]: v } }));
  const kaydet = async (liste) => {
    setBusy(true);
    for (const c of liste) {
      const kayit = { client_id: c.id, aktif: taslak[c.id]?.aktif ?? (kural(c) ? kural(c).aktif : true), tutar: sayi(al(c, "tutar")), gun: Math.min(28, Math.max(1, parseInt(al(c, "gun")) || 1)), baslangic: al(c, "baslangic") || bugun };
      if (!(kayit.tutar > 0)) continue;
      const r = kural(c) ? await supabase.from('fin_borclandirma').update(kayit).eq('id', kural(c).id) : await supabase.from('fin_borclandirma').insert(kayit);
      if (r.error) { swalAlert(`${c.name}: ${r.error.message}`); break; }
    }
    const n = await borclandirmalariOlustur();
    setTaslak({}); setBusy(false); yukle();
    if (n > 0) swalAlert(`${n} aylık borç cariye yazıldı.`);
  };
  const kapat = async (c) => { await supabase.from('fin_borclandirma').update({ aktif: false }).eq('id', kural(c).id); yukle(); };
  const ac = async (c) => { await supabase.from('fin_borclandirma').update({ aktif: true }).eq('id', kural(c).id); await borclandirmalariOlustur(); yukle(); };
  const kuralsiz = musteriler.filter(c => !kural(c) && Number(c.monthlyFee) > 0);
  const otoBorclar = d.faturalar.filter(i => i.otomatik);
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <Kart baslik="Otomatik Borçlandırma" sag={kuralsiz.length > 0 && <Btn variant="primary" disabled={busy || kurulumYok} onClick={() => kaydet(kuralsiz)}>Aylık ücreti olan {kuralsiz.length} müşterinin hepsini başlat</Btn>}>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 12, lineHeight: 1.6 }}>Apsiyon'daki aidat borçlandırması gibi: her ay belirlenen günde müşterinin cari hesabına aylık borç yazılır, Müşterilere Göre Durum ve Özet'te borç olarak görünür, vadesi geçince hatırlatma listesine düşer. O ayın faturasını yüklediğinizde otomatik borç kendiliğinden kalkar ve yerini fatura alır (aynı ay iki kez borçlanmaz). Tutar KDV dahildir; varsayılan aylık ücret + %20 KDV.</div>
        <Tablo>
          <thead><tr><th style={th}>Müşteri</th><th style={sagTh}>Aylık ücret</th><th style={th}>Aylık borç (KDV dahil)</th><th style={th}>Her ayın</th><th style={th}>İlk borç günü</th><th style={th}>Durum</th><th style={th}></th></tr></thead>
          <tbody>
            {musteriler.length === 0 && <BosSatir n={7} metin="Aylık çalışan müşteri yok." />}
            {musteriler.map(c => {
              const k = kural(c);
              return <tr key={c.id} style={{ opacity: k && !k.aktif ? 0.6 : 1 }}>
                <td style={{ ...td, fontWeight: 600 }}>{c.name}{c.source === "emlakpanelim" && <span style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 400 }}> · Emlak Panelim</span>}</td>
                <td style={sagTd}>{c.monthlyFee ? fmtMoney(c.monthlyFee) : "—"}</td>
                <td style={{ ...td, width: 130 }}><Input value={al(c, "tutar")} onChange={e => yaz(c, "tutar", e.target.value)} /></td>
                <td style={{ ...td, width: 90 }}><Input type="number" value={al(c, "gun")} onChange={e => yaz(c, "gun", e.target.value)} /></td>
                <td style={{ ...td, width: 160 }}><Input type="date" value={al(c, "baslangic")} onChange={e => yaz(c, "baslangic", e.target.value)} /></td>
                <td style={{ ...td, whiteSpace: "nowrap", color: k ? (k.aktif ? T.greenText : T.textMuted) : T.textMuted, fontWeight: 600 }}>{k ? (k.aktif ? "Açık" : "Kapalı") : "Başlatılmadı"}</td>
                <td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 5 }}>
                  {(!k || taslak[c.id]) && <Btn variant="primary" disabled={busy || kurulumYok} onClick={() => kaydet([c])} style={{ padding: "4px 10px", fontSize: 12 }}>{k ? "Kaydet" : "Başlat"}</Btn>}
                  {k && !taslak[c.id] && (k.aktif ? <Btn onClick={() => kapat(c)} style={{ padding: "4px 10px", fontSize: 12 }}>Durdur</Btn> : <Btn onClick={() => ac(c)} style={{ padding: "4px 10px", fontSize: 12 }}>Aç</Btn>)}
                </div></td>
              </tr>;
            })}
          </tbody>
        </Tablo>
      </Kart>
      <Kart baslik={`Faturası henüz yüklenmemiş otomatik borçlar (${otoBorclar.length})`}>
        <Tablo>
          <thead><tr><th style={th}>Müşteri</th><th style={th}>Dönem</th><th style={th}>Borç günü</th><th style={sagTh}>Tutar</th></tr></thead>
          <tbody>
            {otoBorclar.length === 0 && <BosSatir n={4} metin="Otomatik borç yok." />}
            {[...otoBorclar].sort((a, b) => String(b.month_ref).localeCompare(String(a.month_ref))).map(i => <tr key={i.id}><td style={{ ...td, fontWeight: 600 }}>{musteriAdi(d, i.client_id)}</td><td style={td}>{monthRefLabel(i.month_ref)}</td><td style={td}>{gunTR(i.invoice_date)}</td><td style={sagTd}>{fmtMoney(i.total)}</td></tr>)}
          </tbody>
        </Tablo>
      </Kart>
    </div>
  );
}

// ═══════════════ KASA TRANSFERİ / VİRMAN ═══════════════
export function KasaTransfer({ autoAdd = false }) {
  const { d, err, kurulumYok, yukle } = useFinVeri();
  const [form, setForm] = useState(autoAdd ? { tarih: todayStr(), kaynak_id: "", hedef_id: "", tutar: "", aciklama: "" } : null);
  if (!d) return <Yukleniyor />;
  const kaydet = async () => {
    const tutar = sayi(form.tutar);
    if (!form.kaynak_id || !form.hedef_id || form.kaynak_id === form.hedef_id || !(tutar > 0)) { swalAlert("Farklı iki kasa ve tutar seçin."); return; }
    const r = await supabase.from('fin_transferler').insert({ tarih: form.tarih, kaynak_id: Number(form.kaynak_id), hedef_id: Number(form.hedef_id), tutar, aciklama: form.aciklama || "" }).select().single();
    if (r.error) { swalAlert("Kaydedilemedi: " + r.error.message); return; }
    const ac = `Kasa transferi #T${r.data.id} · ${kasaAdi(d, form.kaynak_id)} → ${kasaAdi(d, form.hedef_id)}${form.aciklama ? " · " + form.aciklama : ""}`;
    await kasaHareketiYaz(d, `transfer-c:${r.data.id}`, form.kaynak_id, form.tarih, -tutar, ac);
    await kasaHareketiYaz(d, `transfer-g:${r.data.id}`, form.hedef_id, form.tarih, tutar, ac);
    setForm(null); yukle();
  };
  const sil = async (t) => {
    if (!await swalConfirm("Bu transfer silinsin mi? Nakit kasaya yazılan hareketleri de silinir.")) return;
    await supabase.from('fin_transferler').delete().eq('id', t.id);
    await supabase.from('bank_transactions').delete().in('eslesme', [`transfer-c:${t.id}`, `transfer-g:${t.id}`]);
    yukle();
  };
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <Kart baslik="Kasa Transferi ve Virman" sag={<Btn variant="primary" disabled={kurulumYok} onClick={() => setForm({ tarih: todayStr(), kaynak_id: "", hedef_id: "", tutar: "", aciklama: "" })}>+ Yeni Transfer</Btn>}>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 10 }}>Bankadan nakit çekme, kasadaki nakdi bankaya yatırma ya da hesaplar arası para aktarma. Nakit kasanın bakiyesi buradan güncellenir; banka tarafı ekstreyle gelir (çift sayılmaz).</div>
        <Tablo>
          <thead><tr><th style={th}>Tarih</th><th style={th}>Kaynak</th><th style={th}>Hedef</th><th style={th}>Açıklama</th><th style={sagTh}>Tutar</th><th style={th}></th></tr></thead>
          <tbody>
            {d.transferler.length === 0 && <BosSatir n={6} metin="Henüz transfer yok." />}
            {[...d.transferler].reverse().map(t => <tr key={t.id}><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(t.tarih)}</td><td style={td}>{kasaAdi(d, t.kaynak_id)}</td><td style={td}>{kasaAdi(d, t.hedef_id)}</td><td style={{ ...td, color: T.textMuted }}>{t.aciklama || "—"}</td><td style={sagTd}>{fmtMoney(t.tutar)}</td><td style={td}><Btn onClick={() => sil(t)} style={{ padding: "4px 9px", fontSize: 11.5, color: T.redText }}>Sil</Btn></td></tr>)}
          </tbody>
        </Tablo>
      </Kart>
      {form && <Modal title="Yeni Kasa Transferi" onClose={() => setForm(null)} width={480}>
        <FormField label="Tarih"><Input type="date" value={form.tarih} onChange={e => setForm({ ...form, tarih: e.target.value })} /></FormField>
        <FormField label="Paranın çıktığı kasa"><Select value={form.kaynak_id} onChange={e => setForm({ ...form, kaynak_id: e.target.value })}><option value="">Seçin</option>{d.hesaplar.map(a => <option key={a.id} value={a.id}>{a.name} ({KASA_TURLERI[a.kind] || a.kind})</option>)}</Select></FormField>
        <FormField label="Paranın girdiği kasa"><Select value={form.hedef_id} onChange={e => setForm({ ...form, hedef_id: e.target.value })}><option value="">Seçin</option>{d.hesaplar.map(a => <option key={a.id} value={a.id}>{a.name} ({KASA_TURLERI[a.kind] || a.kind})</option>)}</Select></FormField>
        <FormField label="Tutar (₺)"><Input value={form.tutar} onChange={e => setForm({ ...form, tutar: e.target.value })} /></FormField>
        <FormField label="Açıklama"><Input value={form.aciklama} onChange={e => setForm({ ...form, aciklama: e.target.value })} /></FormField>
        <ModalActions onClose={() => setForm(null)} onSave={kaydet} />
      </Modal>}
    </div>
  );
}

// ═══════════════ BANKA HAREKETİ EŞLEŞTİRME ═══════════════
// Ekstreden gelen hareketlere öneri: giren para → müşteri tahsilatı, çıkan para → gider faturası taksiti
export function BankaEslestirme() {
  const { d, err, kurulumYok, yukle } = useFinVeri();
  const [gun, setGun] = useState("90");
  const [busy, setBusy] = useState(null);
  if (!d) return <Yukleniyor />;
  const sinir = gunEkle(todayStr(), -Number(gun));
  const hesap = (id) => d.hesaplar.find(a => a.id === id);
  const bekleyen = d.hareketler.filter(t => !t.eslesme && t.client_payment_id == null && t.tx_date >= sinir && hesap(t.account_id)?.kind !== "nakit" && !["kart_odeme", "transfer"].includes(t.category))
    .sort((a, b) => String(b.tx_date).localeCompare(String(a.tx_date)));
  const durum = musteriDurumlari(d);
  const adParcalari = (ad) => bankNorm(ad).split(/\s+/).filter(p => p.length >= 3 && !/^(LTD|STI|SAN|TIC|VE|AS|A\.S\.|LIMITED|SIRKETI|EMLAK|GAYRIMENKUL)$/.test(p));
  const oneriler = (t) => {
    const a = Number(t.amount), ac = bankNorm(t.description);
    if (a > 0) {
      return durum.map(s => {
        const parca = adParcalari(s.musteri.name); const isim = parca.filter(p => ac.includes(p)).length;
        const tutarUyar = s.acik.some(i => Math.abs(Number(i.total) - a) < 1) || Math.abs(s.borc - a) < 1 || (s.musteri.monthlyFee && Math.abs(s.musteri.monthlyFee - a) < 1);
        return { tur: "odeme", s, puan: isim * 3 + (tutarUyar ? 2 : 0) + (s.borc > 0 ? 1 : 0) };
      }).filter(o => o.puan >= 3).sort((x, y) => y.puan - x.puan).slice(0, 3);
    }
    return d.plan.filter(p => !p.odendi).map(p => {
      const f = d.gFaturalar.find(x => x.id === p.fatura_id); const cari = d.cariler.find(c => c.id === f?.cari_id);
      const isim = cari ? adParcalari(cari.ad).filter(x => ac.includes(x)).length : 0;
      const tutarUyar = Math.abs(Number(p.tutar) + a) < 1;
      return { tur: "plan", p, f, puan: isim * 3 + (tutarUyar ? 3 : 0) };
    }).filter(o => o.puan >= 3).sort((x, y) => y.puan - x.puan).slice(0, 3);
  };
  const tahsilatYaz = async (t, s) => {
    setBusy(t.id);
    // Ödeme, borcu olan en eski faturalı aya yazılır; borç yoksa hareketin ayına
    const h = cariHesapla(s.pay, s.inv); const ay = h.months.find(m => m.debt > 0 && m.m)?.m || String(t.tx_date).slice(0, 7);
    // Tahsilat ekstredeki hesaba bağlanır; veritabanı (cari_odeme_bankaya) o hesaba bağlı kasa hareketini kendisi yazar.
    // Ekstredeki satır aynı parayı ikinci kez saymasın diye silinir, açıklaması bağlı harekete taşınır.
    const r = await supabase.from('client_payments').insert({ client_id: s.musteri.id, amount: Number(t.amount), payment_date: t.tx_date, month_ref: ay, method: "havale", notes: `Banka: ${String(t.description).slice(0, 120)}`, bank_account_id: t.account_id }).select().single();
    if (r.error) { setBusy(null); swalAlert("Tahsilat kaydedilemedi: " + r.error.message); return; }
    const { data: bagli } = await supabase.from('bank_transactions').select('id').eq('client_payment_id', r.data.id);
    if (bagli?.length) {
      await supabase.from('bank_transactions').update({ description: t.description, tx_date: t.tx_date, eslesme: `odeme:${r.data.id}` }).eq('id', bagli[0].id);
      await supabase.from('bank_transactions').delete().eq('id', t.id);
    } else {
      await supabase.from('bank_transactions').update({ eslesme: `odeme:${r.data.id}`, category: "gelir", client_payment_id: r.data.id }).eq('id', t.id);
    }
    setBusy(null); yukle();
  };
  const taksitOde = async (t, p) => {
    setBusy(t.id);
    const e = await supabase.from('fin_odeme_plani').update({ odendi: true, odeme_tarihi: t.tx_date, kasa_id: t.account_id }).eq('id', p.id);
    if (e.error) { setBusy(null); swalAlert("Kaydedilemedi: " + e.error.message); return; }
    await supabase.from('bank_transactions').update({ eslesme: `plan:${p.id}` }).eq('id', t.id);
    setBusy(null); yukle();
  };
  const yoksay = async (t) => { await supabase.from('bank_transactions').update({ eslesme: "yok" }).eq('id', t.id); yukle(); };
  const eslesen = d.hareketler.filter(t => t.eslesme && t.eslesme !== "yok" && /^(odeme|plan):/.test(t.eslesme) && t.tx_date >= sinir).length;
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <Kart baslik={`Banka Hareketleri · eşleşmeyi bekleyen ${bekleyen.length}`} sag={<>
        <span style={{ fontSize: 12, color: T.textMuted }}>{eslesen} eşleşmiş</span>
        <div style={{ width: 150 }}><Select value={gun} onChange={e => setGun(e.target.value)}><option value="30">Son 30 gün</option><option value="90">Son 90 gün</option><option value="365">Son 1 yıl</option></Select></div>
      </>}>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 12 }}>Yüklediğiniz ekstrelerdeki hareketler. Giren para için müşteri, çıkan para için ödenmemiş gider faturası önerilir; tek tıkla tahsilat ya da ödeme olarak işlenir. Ekstre "Banka ve Ekstre" sekmesinden yüklenir.</div>
        {bekleyen.length === 0 && <div style={{ textAlign: "center", color: T.textMuted, padding: 24, fontSize: 13 }}>Eşleşmeyi bekleyen hareket yok.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bekleyen.slice(0, 60).map(t => {
            const o = kurulumYok && Number(t.amount) < 0 ? [] : oneriler(t);
            return <div key={t.id} style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 14px", background: T.bgSurface }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 11.5, color: T.textMuted }}>{gunTR(t.tx_date)} · {kasaAdi(d, t.account_id)} · {bankCatLabel(t.category)}</div>
                  <div style={{ fontSize: 13, color: T.textPrimary, marginTop: 2 }}>{t.description || "—"}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: Number(t.amount) > 0 ? T.greenText : T.redText, whiteSpace: "nowrap" }}>{Number(t.amount) > 0 ? "+" : "−"}{fmtMoney(Math.abs(Number(t.amount)))}</div>
                <Btn onClick={() => yoksay(t)} title="Bu hareket bir kayıtla eşleşmeyecek" disabled={kurulumYok} style={{ padding: "4px 9px", fontSize: 11.5 }}>Eşleşmesin</Btn>
              </div>
              {o.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <span style={{ fontSize: 11.5, color: T.textMuted, alignSelf: "center" }}>Öneri:</span>
                {o.map(x => x.tur === "odeme"
                  ? <Btn key={"o" + x.s.musteri.id} disabled={busy === t.id || kurulumYok} onClick={() => tahsilatYaz(t, x.s)} style={{ background: T.greenDim, color: T.greenText, fontSize: 12 }}>Tahsilat · {x.s.musteri.name}{x.s.borc > 0 ? ` (borç ${fmtMoney(x.s.borc)})` : ""}</Btn>
                  : <Btn key={"p" + x.p.id} disabled={busy === t.id} onClick={() => taksitOde(t, x.p)} style={{ background: T.redDim, color: T.redText, fontSize: 12 }}>Ödeme · {x.f ? cariAdi(d, x.f.cari_id) : "Fatura"} · vade {gunTR(x.p.vade)} · {fmtMoney(x.p.tutar)}</Btn>)}
              </div>}
            </div>;
          })}
        </div>
        {bekleyen.length > 60 && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 10 }}>İlk 60 hareket gösteriliyor; eşleştirdikçe sıradakiler gelir.</div>}
      </Kart>
    </div>
  );
}

// ═══════════════ RAPORLAR ═══════════════
const raporPdf = (baslik, alt, govde, dosya) => downloadPdfFromHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(baslik)}</title><style>${PRINT_STYLES} td.r, th.r { text-align:right; white-space:nowrap; } tr.toplam td { font-weight:800; background:#EEF1F5 !important; border-top:2px solid #1A2B3F; } table { page-break-inside:auto; } tr { page-break-inside:avoid; } h2.g { font-size:13px; margin-top:16px; }</style></head><body>
  <div class="head"><div class="logo">panormos <span class="m">medya.</span></div><h1>${esc(baslik)}</h1><div class="sub">${esc(alt)} · Rapor tarihi: ${gunTR(todayStr())}</div></div>
  ${govde}${footerHTML("Panormos Medya", "Bu rapor panel kayıtlarından otomatik oluşturulmuştur.")}</body></html>`, dosya);

function GelirGiderRaporu({ d }) {
  const yilBasi = `${new Date().getFullYear()}-01-01`;
  const [f, setF] = useState({ bas: yilBasi, son: todayStr(), tip: "ikisi", esas: "nakit", gorunum: "detayli", grup: "", sahip: "sirket" });
  const [goster, setGoster] = useState(false);
  const kaynak = f.esas === "nakit" ? kasaHareketleri(d, f.sahip) : tahakkukHareketleri(d);
  const satirlar = kaynak.filter(r => r.date >= f.bas && r.date <= f.son && (f.tip === "ikisi" || r.kind === f.tip) && (!f.grup || (r.grup || r.type) === f.grup))
    .sort((a, b) => a.kind.localeCompare(b.kind) || (a.date || "").localeCompare(b.date || ""));
  const gruplar = [...new Set(kaynak.map(r => r.grup || r.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr"));
  const ozet = (kind) => dagilim(satirlar.filter(r => r.kind === kind), "type");
  const gelir = sumAmount(satirlar.filter(r => r.kind === "gelir")), gider = sumAmount(satirlar.filter(r => r.kind === "gider"));
  const etiket = `${gunTR(f.bas)} – ${gunTR(f.son)} · ${f.esas === "nakit" ? "Nakit esası" : "Tahakkuk esası"}`;
  const excel = () => exportPerfectExcel([
    { name: "Özet", title: `GELİR / GİDER RAPORU (${etiket})`, rows: [...["gelir", "gider"].flatMap(k => ozet(k).map(o => ({ "Tür": k === "gelir" ? "Gelir" : "Gider", "Kalem": o.ad, "Tutar": o.tutar }))), { "Tür": "", "Kalem": "Toplam Gelir", "Tutar": gelir }, { "Tür": "", "Kalem": "Toplam Gider", "Tutar": gider }, { "Tür": "", "Kalem": "Net", "Tutar": gelir - gider }] },
    { name: "Detay", title: `GELİR / GİDER HAREKETLERİ (${etiket})`, rows: satirlar.map(r => ({ "Tarih": gunTR(r.date), "Tür": r.kind === "gelir" ? "Gelir" : "Gider", "Kalem": r.type, "Grup": r.grup || "", "Kim": r.title, "Açıklama": r.sub || "", "Tutar": r.amount })) },
  ], `gelir-gider-raporu-${f.bas}-${f.son}.xlsx`);
  const pdf = () => {
    const ozetTablo = (k, b) => `<h2 class="g">${b}</h2><table><tr><th>Kalem</th><th class="r">Tutar</th><th class="r">Pay</th></tr>${ozet(k).map(o => `<tr><td>${esc(o.ad)}</td><td class="r">${fmtMoney(o.tutar)}</td><td class="r">%${(k === "gelir" ? gelir : gider) > 0 ? Math.round(o.tutar / (k === "gelir" ? gelir : gider) * 100) : 0}</td></tr>`).join("")}<tr class="toplam"><td>Toplam</td><td class="r">${fmtMoney(k === "gelir" ? gelir : gider)}</td><td></td></tr></table>`;
    const detay = f.gorunum === "detayli" ? `<h2 class="g">Hareketler</h2><table><tr><th>Tarih</th><th>Tür</th><th>Kalem</th><th>Kim</th><th>Açıklama</th><th class="r">Tutar</th></tr>${satirlar.map(r => `<tr><td>${gunTR(r.date)}</td><td>${r.kind === "gelir" ? "Gelir" : "Gider"}</td><td>${esc(r.type)}</td><td>${esc(r.title)}</td><td>${esc(r.sub || "")}</td><td class="r">${fmtMoney(r.amount)}</td></tr>`).join("")}</table>` : "";
    raporPdf("Gelir / Gider Raporu", etiket, `${f.tip !== "gider" ? ozetTablo("gelir", "Gelirler") : ""}${f.tip !== "gelir" ? ozetTablo("gider", "Giderler") : ""}<h2 class="g">Net (Gelir − Gider): ${fmtMoney(gelir - gider)}</h2>${detay}`, `Gelir-Gider-Raporu-${f.bas}-${f.son}.pdf`);
  };
  return (
    <Kart baslik="Gelir - Gider Raporu">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "0 12px" }}>
        <FormField label="İlk tarih"><Input type="date" value={f.bas} onChange={e => setF({ ...f, bas: e.target.value })} /></FormField>
        <FormField label="Son tarih"><Input type="date" value={f.son} onChange={e => setF({ ...f, son: e.target.value })} /></FormField>
        <FormField label="Rapor tipi"><Select value={f.tip} onChange={e => setF({ ...f, tip: e.target.value })}><option value="ikisi">Gelir ve gider</option><option value="gelir">Gelir</option><option value="gider">Gider</option></Select></FormField>
        <FormField label="Çalışma şekli"><Select value={f.esas} onChange={e => setF({ ...f, esas: e.target.value, grup: "" })}><option value="nakit">Nakit esası (kasa hareketleri)</option><option value="tahakkuk">Tahakkuk esası (fatura tarihi)</option></Select></FormField>
        <FormField label="Kalem / grup"><Select value={f.grup} onChange={e => setF({ ...f, grup: e.target.value })}><option value="">Hepsi</option>{gruplar.map(g => <option key={g} value={g}>{g}</option>)}</Select></FormField>
        {f.esas === "nakit" && <FormField label="Hesaplar"><Select value={f.sahip} onChange={e => setF({ ...f, sahip: e.target.value, grup: "" })}><option value="sirket">Şirket</option><option value="sahsi">Şahsi</option><option value="hepsi">Hepsi</option></Select></FormField>}
        <FormField label="Görünüm"><Select value={f.gorunum} onChange={e => setF({ ...f, gorunum: e.target.value })}><option value="detayli">Detaylı</option><option value="ozet">Özet</option></Select></FormField>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: goster ? 14 : 0 }}>
        <Btn variant="primary" onClick={() => setGoster(true)}>Göster</Btn>
        <Btn onClick={pdf}>PDF</Btn>
        <Btn onClick={excel} style={{ background: T.greenDim, color: T.greenText }}>Excel</Btn>
      </div>
      {goster && <>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
          <StatCard label="Gelir" value={fmtMoney(gelir)} color={T.greenText} sub={etiket} />
          <StatCard label="Gider" value={fmtMoney(gider)} color={T.redText} />
          <StatCard label="Net" value={fmtMoney(gelir - gider)} color={gelir - gider >= 0 ? T.greenText : T.redText} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
          {["gelir", "gider"].filter(k => f.tip === "ikisi" || f.tip === k).map(k => <div key={k}><div style={{ fontWeight: 700, color: T.textPrimary, marginBottom: 6 }}>{k === "gelir" ? "Gelirler" : "Giderler"}</div>
            <Tablo><thead><tr><th style={th}>Kalem</th><th style={sagTh}>Tutar</th></tr></thead><tbody>{ozet(k).length === 0 && <BosSatir n={2} />}{ozet(k).map(o => <tr key={o.ad}><td style={td}>{o.ad}</td><td style={sagTd}>{fmtMoney(o.tutar)}</td></tr>)}</tbody></Tablo></div>)}
        </div>
        {f.gorunum === "detayli" && <div style={{ marginTop: 14 }}><Tablo>
          <thead><tr><th style={th}>Tarih</th><th style={th}>Tür</th><th style={th}>Kalem</th><th style={th}>Kim</th><th style={th}>Açıklama</th><th style={sagTh}>Tutar</th></tr></thead>
          <tbody>{satirlar.length === 0 && <BosSatir n={6} />}{satirlar.slice(0, 500).map(r => <tr key={r.key}><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(r.date)}</td><td style={{ ...td, color: r.kind === "gelir" ? T.greenText : T.redText }}>{r.kind === "gelir" ? "Gelir" : "Gider"}</td><td style={td}>{r.type}</td><td style={td}>{r.title}</td><td style={{ ...td, color: T.textMuted }}>{r.sub}</td><td style={sagTd}>{fmtMoney(r.amount)}</td></tr>)}</tbody>
        </Tablo>{satirlar.length > 500 && <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>Ekranda ilk 500 satır; tamamı PDF ve Excel'de.</div>}</div>}
      </>}
    </Kart>
  );
}

function VadesiGecmisRaporu({ d }) {
  const liste = musteriDurumlari(d).filter(s => s.gecikmeTutari > 0).sort((a, b) => b.gecikmeGun - a.gecikmeGun);
  const satirlar = liste.flatMap(s => s.geciken.map(i => ({ s, i, vade: invoiceDueDate(i) })));
  const bugun = todayStr();
  const gecGun = (v) => Math.round((new Date(bugun + "T00:00:00") - new Date(v + "T00:00:00")) / 86400000);
  const pdf = () => raporPdf("Vadesi Geçmiş Borçlar", `${liste.length} müşteri · ${fmtMoney(sumAmount(liste, "gecikmeTutari"))}`, `<table><tr><th>Müşteri</th><th>Fatura No</th><th>Fatura Tarihi</th><th>Vade</th><th class="r">Gecikme</th><th class="r">Tutar</th></tr>${satirlar.map(x => `<tr><td>${esc(x.s.musteri.name)}</td><td>${esc(x.i.invoice_no || "—")}</td><td>${gunTR(x.i.invoice_date || x.i.uploaded_at)}</td><td>${gunTR(x.vade)}</td><td class="r">${gecGun(x.vade)} gün</td><td class="r">${fmtMoney(x.i.total)}</td></tr>`).join("")}<tr class="toplam"><td colspan="5">Toplam vadesi geçen</td><td class="r">${fmtMoney(sumAmount(liste, "gecikmeTutari"))}</td></tr></table>`, `Vadesi-Gecmis-Borclar-${bugun}.pdf`);
  return (
    <Kart baslik={`Vadesi Geçmiş Borçlar · ${fmtMoney(sumAmount(liste, "gecikmeTutari"))}`} sag={<><Btn onClick={pdf}>PDF</Btn><Btn onClick={() => exportPerfectExcel([{ name: "Vadesi Geçmiş", title: "VADESİ GEÇMİŞ BORÇLAR", rows: satirlar.map(x => ({ "Müşteri": x.s.musteri.name, "Fatura No": x.i.invoice_no || "", "Fatura Tarihi": gunTR(x.i.invoice_date || x.i.uploaded_at), "Vade": gunTR(x.vade), "Gecikme (gün)": gecGun(x.vade), "Tutar": Number(x.i.total) })) }], `vadesi-gecmis-${bugun}.xlsx`)} style={{ background: T.greenDim, color: T.greenText }}>Excel</Btn></>}>
      <Tablo>
        <thead><tr><th style={th}>Müşteri</th><th style={th}>Fatura</th><th style={th}>Vade</th><th style={sagTh}>Gecikme</th><th style={sagTh}>Tutar</th><th style={th}></th></tr></thead>
        <tbody>
          {satirlar.length === 0 && <BosSatir n={6} metin="Vadesi geçmiş borç yok." />}
          {satirlar.map(x => <tr key={x.i.id}><td style={{ ...td, fontWeight: 600 }}>{x.s.musteri.name}</td><td style={td}>{x.i.invoice_no || "—"}<div style={{ fontSize: 11, color: T.textMuted }}>{gunTR(x.i.invoice_date || x.i.uploaded_at)}</div></td><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(x.vade)}</td><td style={{ ...sagTd, color: T.redText, fontWeight: 700 }}>{gecGun(x.vade)} gün</td><td style={sagTd}>{fmtMoney(x.i.total)}</td><td style={td}><Btn onClick={() => ihtarYazisi(x.s)} style={{ padding: "4px 9px", fontSize: 11.5 }}>İhtar</Btn></td></tr>)}
        </tbody>
      </Tablo>
    </Kart>
  );
}

// Ekstre: seçilen kasa ya da tedarikçinin hareketleri, yürüyen bakiye ile
function EkstreRaporu({ d, tur }) {
  const [id, setId] = useState("");
  const [bas, setBas] = useState(`${new Date().getFullYear()}-01-01`);
  const [son, setSon] = useState(todayStr());
  const secenekler = tur === "kasa" ? d.hesaplar.map(a => [a.id, `${a.name} (${KASA_TURLERI[a.kind] || a.kind})`]) : d.cariler.map(c => [c.id, c.ad]);
  let devir = 0, satirlar = [];
  if (id && tur === "kasa") {
    const a = d.hesaplar.find(x => String(x.id) === id);
    const hs = d.hareketler.filter(t => String(t.account_id) === id).sort((x, y) => String(x.tx_date).localeCompare(String(y.tx_date)) || x.id - y.id);
    devir = Number(a?.acilis_bakiye || 0) + sumAmount(hs.filter(t => t.tx_date < bas));
    satirlar = hs.filter(t => t.tx_date >= bas && t.tx_date <= son).map(t => ({ tarih: t.tx_date, aciklama: t.description, alt: bankCatLabel(t.category), giris: Number(t.amount) > 0 ? Number(t.amount) : 0, cikis: Number(t.amount) < 0 ? -Number(t.amount) : 0 }));
  } else if (id) {
    // Tedarikçi: fatura = borcumuz artar (alacak), ödeme = azalır (borç)
    const fs = d.gFaturalar.filter(f => String(f.cari_id) === id);
    const hepsi = [
      ...fs.map(f => ({ tarih: f.tarih, aciklama: `Gider faturası${f.belge_no ? " " + f.belge_no : ""}`, alt: faturaKalemi(d, f), giris: Number(f.toplam), cikis: 0 })),
      ...fs.filter(f => f.odeme_tipi === "kapali").map(f => ({ tarih: f.tarih, aciklama: "Peşin ödeme", alt: kasaAdi(d, f.kasa_id), giris: 0, cikis: Number(f.toplam) })),
      ...d.plan.filter(p => p.odendi && fs.some(f => f.id === p.fatura_id)).map(p => ({ tarih: p.odeme_tarihi || p.vade, aciklama: "Ödeme", alt: p.kasa_id ? kasaAdi(d, p.kasa_id) : "", giris: 0, cikis: Number(p.tutar) })),
    ].sort((x, y) => String(x.tarih).localeCompare(String(y.tarih)));
    devir = hepsi.filter(h => h.tarih < bas).reduce((s, h) => s + h.giris - h.cikis, 0);
    satirlar = hepsi.filter(h => h.tarih >= bas && h.tarih <= son);
  }
  let bakiye = devir;
  const yuruyen = satirlar.map(s => { bakiye += s.giris - s.cikis; return { ...s, bakiye }; });
  const [gAd, cAd] = tur === "kasa" ? ["Giren", "Çıkan"] : ["Fatura", "Ödeme"];
  const ad = secenekler.find(s => String(s[0]) === id)?.[1] || "";
  const pdf = () => raporPdf(tur === "kasa" ? "Kasa Ekstresi" : "Tedarikçi Ekstresi", `${ad} · ${gunTR(bas)} – ${gunTR(son)}`, `<table><tr><th>Tarih</th><th>Açıklama</th><th>Detay</th><th class="r">${gAd}</th><th class="r">${cAd}</th><th class="r">Bakiye</th></tr><tr><td colspan="5"><b>Devir</b></td><td class="r"><b>${fmtMoney(devir)}</b></td></tr>${yuruyen.map(s => `<tr><td>${gunTR(s.tarih)}</td><td>${esc(s.aciklama)}</td><td>${esc(s.alt)}</td><td class="r">${s.giris ? fmtMoney(s.giris) : ""}</td><td class="r">${s.cikis ? fmtMoney(s.cikis) : ""}</td><td class="r">${fmtMoney(s.bakiye)}</td></tr>`).join("")}<tr class="toplam"><td colspan="3">Toplam</td><td class="r">${fmtMoney(sumAmount(yuruyen, "giris"))}</td><td class="r">${fmtMoney(sumAmount(yuruyen, "cikis"))}</td><td class="r">${fmtMoney(bakiye)}</td></tr></table>`, `${tur === "kasa" ? "Kasa" : "Tedarikci"}-Ekstresi-${todayStr()}.pdf`);
  return (
    <Kart baslik={tur === "kasa" ? "Kasa / Banka Ekstresi" : "Tedarikçi (Cari) Ekstresi"} sag={id && <><Btn onClick={pdf}>PDF</Btn><Btn onClick={() => exportPerfectExcel([{ name: "Ekstre", title: `${tur === "kasa" ? "KASA" : "TEDARİKÇİ"} EKSTRESİ — ${ad} (${gunTR(bas)} – ${gunTR(son)})`, rows: [{ "Tarih": "", "Açıklama": "Devir", "Detay": "", [gAd]: "", [cAd]: "", "Bakiye": devir }, ...yuruyen.map(s => ({ "Tarih": gunTR(s.tarih), "Açıklama": s.aciklama, "Detay": s.alt, [gAd]: s.giris || "", [cAd]: s.cikis || "", "Bakiye": s.bakiye }))] }], `ekstre-${todayStr()}.xlsx`)} style={{ background: T.greenDim, color: T.greenText }}>Excel</Btn></>}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0 12px" }}>
        <FormField label={tur === "kasa" ? "Kasa / banka" : "Tedarikçi"}><Select value={id} onChange={e => setId(e.target.value)}><option value="">Seçin</option>{secenekler.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></FormField>
        <FormField label="İlk tarih"><Input type="date" value={bas} onChange={e => setBas(e.target.value)} /></FormField>
        <FormField label="Son tarih"><Input type="date" value={son} onChange={e => setSon(e.target.value)} /></FormField>
      </div>
      {id && <Tablo>
        <thead><tr><th style={th}>Tarih</th><th style={th}>Açıklama</th><th style={th}>Detay</th><th style={sagTh}>{gAd}</th><th style={sagTh}>{cAd}</th><th style={sagTh}>Bakiye</th></tr></thead>
        <tbody>
          <tr style={{ background: T.bgSurface }}><td style={td} colSpan={5}><b>Devir</b></td><td style={{ ...sagTd, fontWeight: 700 }}>{fmtMoney(devir)}</td></tr>
          {yuruyen.length === 0 && <BosSatir n={6} metin="Bu aralıkta hareket yok." />}
          {yuruyen.slice(-500).map((s, i) => <tr key={i}><td style={{ ...td, whiteSpace: "nowrap" }}>{gunTR(s.tarih)}</td><td style={td}>{s.aciklama}</td><td style={{ ...td, color: T.textMuted }}>{s.alt}</td><td style={{ ...sagTd, color: T.greenText }}>{s.giris ? fmtMoney(s.giris) : ""}</td><td style={{ ...sagTd, color: T.redText }}>{s.cikis ? fmtMoney(s.cikis) : ""}</td><td style={{ ...sagTd, fontWeight: 600 }}>{fmtMoney(s.bakiye)}</td></tr>)}
        </tbody>
      </Tablo>}
    </Kart>
  );
}

// Dönemsel bakiye: müşteri × ay tablosu (faturalanan − ödenen)
function DonemselBakiye({ d }) {
  const [yil, setYil] = useState(String(new Date().getFullYear()));
  const aylar = Array.from({ length: 12 }, (_, i) => `${yil}-${String(i + 1).padStart(2, "0")}`);
  const satirlar = musteriDurumlari(d).filter(s => s.inv.length || s.pay.length).map(s => {
    const h = cariHesapla(s.pay, s.inv); const by = Object.fromEntries(h.months.map(m => [m.m, m]));
    return { ad: s.musteri.name, hucre: aylar.map(m => by[m] ? { f: by[m].invoiced, o: by[m].paid, b: by[m].debt } : null), borc: s.borc };
  }).filter(r => r.hucre.some(Boolean));
  const excel = () => exportPerfectExcel([{ name: "Dönemsel Bakiye", title: `DÖNEMSEL BAKİYE ${yil} (her ay: kalan borç)`, rows: satirlar.map(r => ({ "Müşteri": r.ad, ...Object.fromEntries(aylar.map((m, i) => [TR_MONTHS[i], r.hucre[i] ? r.hucre[i].b : ""])), "Toplam Borç": r.borc })) }], `donemsel-bakiye-${yil}.xlsx`);
  return (
    <Kart baslik="Dönemsel Bakiye" sag={<><div style={{ width: 110 }}><Select value={yil} onChange={e => setYil(e.target.value)}>{[0, 1, 2].map(k => String(new Date().getFullYear() - k)).map(y => <option key={y} value={y}>{y}</option>)}</Select></div><Btn onClick={excel} style={{ background: T.greenDim, color: T.greenText }}>Excel</Btn></>}>
      <div style={{ fontSize: 12, color: T.textMuted, marginBottom: 8 }}>Her hücre o ayın kalan borcu; üzerine gelince faturalanan ve ödenen tutar görünür. Yeşil: kapandı, kırmızı: borç var.</div>
      <Tablo>
        <thead><tr><th style={th}>Müşteri</th>{aylar.map((m, i) => <th key={m} style={sagTh}>{TR_MONTHS[i].slice(0, 3)}</th>)}<th style={sagTh}>Borç</th></tr></thead>
        <tbody>
          {satirlar.length === 0 && <BosSatir n={14} metin="Bu yıl kayıt yok." />}
          {satirlar.map(r => <tr key={r.ad}><td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{r.ad}</td>{r.hucre.map((h, i) => <td key={i} title={h ? `Faturalanan ${fmtMoney(h.f)} · Ödenen ${fmtMoney(h.o)}` : ""} style={{ ...sagTd, fontSize: 12, color: !h ? T.textMuted : h.b > 0 ? T.redText : T.greenText }}>{!h ? "·" : h.b > 0 ? fmtMoney(h.b) : "✓"}</td>)}<td style={{ ...sagTd, fontWeight: 700, color: r.borc > 0 ? T.redText : T.greenText }}>{fmtMoney(r.borc)}</td></tr>)}
        </tbody>
      </Tablo>
    </Kart>
  );
}

export function FinansRaporlar() {
  const { d, err, kurulumYok } = useFinVeri();
  const [alt, setAlt] = useState("gelirgider");
  if (!d) return <Yukleniyor />;
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      <Sekmeler liste={[["gelirgider", "Gelir - Gider Raporu"], ["vadesi", "Vadesi Geçmiş Borçlar"], ["donemsel", "Dönemsel Bakiye"], ["kasa", "Kasa / Banka Ekstresi"], ["cari", "Tedarikçi Ekstresi"]]} aktif={alt} sec={setAlt} />
      {alt === "gelirgider" && <GelirGiderRaporu d={d} />}
      {alt === "vadesi" && <VadesiGecmisRaporu d={d} />}
      {alt === "donemsel" && <DonemselBakiye d={d} />}
      {alt === "kasa" && <EkstreRaporu key="kasa" d={d} tur="kasa" />}
      {alt === "cari" && <EkstreRaporu key="cari" d={d} tur="cari" />}
      <div style={{ fontSize: 12, color: T.textMuted }}>Müşteri hesap ekstresi, ihtar yazısı ve borçsuzluk belgesi: Finans &gt; Müşterilere Göre Durum listesindeki düğmelerden.</div>
    </div>
  );
}

// ═══════════════ TANIMLAR ═══════════════
function KasaTanimlari({ d, yukle }) {
  const [form, setForm] = useState(null);
  const kaydet = async () => {
    if (!form.name?.trim()) { swalAlert("Ad zorunlu."); return; }
    const kayit = { name: form.name.trim(), bank: form.bank || "", kind: form.kind || "banka", owner: form.owner || "sirket", iban: form.iban || "", note: form.note || "", acilis_bakiye: sayi(form.acilis_bakiye), acilis_tarihi: form.acilis_tarihi || null };
    // Bankadaki güncel bakiye elle girildiyse (ekstre yüklenince kendiliğinden de güncellenir)
    if (String(form.banka_bakiyesi ?? "").trim() !== "") { kayit.banka_bakiyesi = sayi(form.banka_bakiyesi); kayit.banka_bakiye_tarihi = form.banka_bakiye_tarihi || todayStr(); }
    const r = form.id ? await supabase.from('bank_accounts').update(kayit).eq('id', form.id) : await supabase.from('bank_accounts').insert(kayit);
    if (r.error) { swalAlert("Kaydedilemedi: " + r.error.message + (/acilis|kind/.test(r.error.message) ? "\n\nfinans-kurulum.sql çalıştırılmalı." : "")); return; }
    setForm(null); yukle();
  };
  return (
    <Kart baslik="Kasa ve Banka Tanımları" sag={<Btn variant="primary" onClick={() => setForm({ name: "", bank: "", kind: "nakit", owner: "sirket", iban: "", acilis_bakiye: "", acilis_tarihi: "" })}>+ Yeni Kasa / Hesap</Btn>}>
      <Tablo>
        <thead><tr><th style={th}>Ad</th><th style={th}>Tip</th><th style={th}>Banka</th><th style={th}>Sahibi</th><th style={th}>IBAN</th><th style={sagTh}>Açılış Bakiyesi</th><th style={th}></th></tr></thead>
        <tbody>
          {d.hesaplar.length === 0 && <BosSatir n={7} />}
          {d.hesaplar.map(a => <tr key={a.id}><td style={{ ...td, fontWeight: 600 }}>{a.name}</td><td style={td}>{KASA_TURLERI[a.kind] || a.kind}</td><td style={td}>{a.bank || "—"}</td><td style={td}>{a.owner === "sahsi" ? "Şahsi" : "Şirket"}</td><td style={{ ...td, fontSize: 12 }}>{a.iban || "—"}</td><td style={sagTd}>{fmtMoney(a.acilis_bakiye || 0)}{a.acilis_tarihi ? <div style={{ fontSize: 11, color: T.textMuted }}>{gunTR(a.acilis_tarihi)}</div> : ""}</td><td style={td}><Btn onClick={() => setForm({ ...a, acilis_bakiye: String(a.acilis_bakiye || ""), acilis_tarihi: a.acilis_tarihi || "", banka_bakiyesi: a.banka_bakiyesi == null ? "" : String(a.banka_bakiyesi), banka_bakiye_tarihi: a.banka_bakiye_tarihi || "" })} style={{ padding: "4px 9px", fontSize: 11.5 }}>Düzenle</Btn></td></tr>)}
        </tbody>
      </Tablo>
      <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 8 }}>Hesap silme ve ekstre yükleme "Banka ve Ekstre" sekmesinde. Açılış bakiyesi: hesabın panele ilk ekstreden önceki bakiyesi (nakit kasada kasadaki para).</div>
      {form && <Modal title={form.id ? "Kasa / Hesap Düzenle" : "Yeni Kasa / Hesap"} onClose={() => setForm(null)} width={520}>
        <FormField label="Ad *"><Input placeholder="Ör: Ofis Kasası" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></FormField>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          <FormField label="Tip"><Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>{Object.entries(KASA_TURLERI).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FormField>
          <FormField label="Sahibi"><Select value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })}><option value="sirket">Şirket</option><option value="sahsi">Şahsi</option></Select></FormField>
          <FormField label="Banka"><Input value={form.bank || ""} onChange={e => setForm({ ...form, bank: e.target.value })} /></FormField>
          <FormField label="IBAN"><Input value={form.iban || ""} onChange={e => setForm({ ...form, iban: e.target.value })} /></FormField>
          <FormField label="Açılış bakiyesi (₺)"><Input value={form.acilis_bakiye} onChange={e => setForm({ ...form, acilis_bakiye: e.target.value })} /></FormField>
          <FormField label="Açılış tarihi"><Input type="date" value={form.acilis_tarihi} onChange={e => setForm({ ...form, acilis_tarihi: e.target.value })} /></FormField>
          {form.kind !== "nakit" && <FormField label="Bankadaki güncel bakiye (₺)"><Input placeholder="Ekstreden otomatik gelir" value={form.banka_bakiyesi ?? ""} onChange={e => setForm({ ...form, banka_bakiyesi: e.target.value })} /></FormField>}
          {form.kind !== "nakit" && <FormField label="Bu bakiyenin tarihi"><Input type="date" value={form.banka_bakiye_tarihi || ""} onChange={e => setForm({ ...form, banka_bakiye_tarihi: e.target.value })} /></FormField>}
        </div>
        <ModalActions onClose={() => setForm(null)} onSave={kaydet} />
      </Modal>}
    </Kart>
  );
}

function CariTanimlari({ d, yukle }) {
  const [form, setForm] = useState(null);
  const [harf, setHarf] = useState("");
  const bakiye = (c) => { const fs = d.gFaturalar.filter(f => f.cari_id === c.id); return sumAmount(fs.filter(f => f.odeme_tipi === "acik").flatMap(f => d.plan.filter(p => p.fatura_id === f.id && !p.odendi)), "tutar"); };
  const kaydet = async () => {
    if (!form.ad?.trim()) { swalAlert("Ad zorunlu."); return; }
    const { id, created_at, ...kayit } = { ...form, ad: form.ad.trim() };
    const r = id ? await supabase.from('fin_cariler').update(kayit).eq('id', id) : await supabase.from('fin_cariler').insert({ ...kayit, kod: kayit.kod || `C${String(d.cariler.length + 1).padStart(4, "0")}` });
    if (r.error) { swalAlert("Kaydedilemedi: " + r.error.message); return; }
    setForm(null); yukle();
  };
  const sil = async (c) => { if (!await swalConfirm(`"${c.ad}" silinsin mi? Faturalarında tedarikçi boş kalır.`)) return; await supabase.from('fin_cariler').delete().eq('id', c.id); yukle(); };
  const liste = d.cariler.filter(c => !harf || ilkHarf(c.ad) === harf).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  return (
    <Kart baslik="Tedarikçiler (Cariler)" sag={<Btn variant="primary" onClick={() => setForm({ kod: "", ad: "", vergi_dairesi: "", vergi_no: "", yetkili: "", telefon: "", eposta: "", adres: "", iban: "", notlar: "", aktif: true })}>+ Yeni Tedarikçi</Btn>}>
      <HarfSuzgec harf={harf} sec={setHarf} />
      <Tablo>
        <thead><tr><th style={th}>Kod</th><th style={th}>Ad</th><th style={th}>Vergi Dairesi / No</th><th style={th}>Yetkili</th><th style={th}>Telefon</th><th style={sagTh}>Ödenecek</th><th style={th}></th></tr></thead>
        <tbody>
          {liste.length === 0 && <BosSatir n={7} metin="Henüz tedarikçi yok." />}
          {liste.map(c => <tr key={c.id}><td style={td}>{c.kod || "—"}</td><td style={{ ...td, fontWeight: 600 }}>{c.ad}{c.aktif === false ? <span style={{ color: T.textMuted, fontWeight: 400 }}> · pasif</span> : ""}</td><td style={td}>{[c.vergi_dairesi, c.vergi_no].filter(Boolean).join(" / ") || "—"}</td><td style={td}>{c.yetkili || "—"}</td><td style={td}>{c.telefon || "—"}</td><td style={{ ...sagTd, color: bakiye(c) > 0 ? T.redText : T.textMuted }}>{fmtMoney(bakiye(c))}</td><td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 5 }}><Btn onClick={() => setForm({ ...c })} style={{ padding: "4px 9px", fontSize: 11.5 }}>Düzenle</Btn><Btn onClick={() => sil(c)} style={{ padding: "4px 9px", fontSize: 11.5, color: T.redText }}>Sil</Btn></div></td></tr>)}
        </tbody>
      </Tablo>
      {form && <Modal title={form.id ? "Tedarikçi Düzenle" : "Yeni Tedarikçi"} onClose={() => setForm(null)} width={620}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 12px" }}>
          <FormField label="Kod"><Input placeholder="Otomatik" value={form.kod || ""} onChange={e => setForm({ ...form, kod: e.target.value })} /></FormField>
          <FormField label="Ad / Unvan *"><Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} /></FormField>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
          {[["vergi_dairesi", "Vergi dairesi"], ["vergi_no", "Vergi / TC kimlik no"], ["yetkili", "Yetkili"], ["telefon", "Telefon"], ["eposta", "E-posta"], ["iban", "IBAN"]].map(([k, l]) => <FormField key={k} label={l}><Input value={form[k] || ""} onChange={e => setForm({ ...form, [k]: e.target.value })} /></FormField>)}
        </div>
        <FormField label="Adres"><Input value={form.adres || ""} onChange={e => setForm({ ...form, adres: e.target.value })} /></FormField>
        <FormField label="Not"><Textarea value={form.notlar || ""} onChange={e => setForm({ ...form, notlar: e.target.value })} minHeight={50} /></FormField>
        <FormField label="Durum"><Select value={form.aktif === false ? "0" : "1"} onChange={e => setForm({ ...form, aktif: e.target.value === "1" })}><option value="1">Aktif</option><option value="0">Pasif</option></Select></FormField>
        <ModalActions onClose={() => setForm(null)} onSave={kaydet} />
      </Modal>}
    </Kart>
  );
}

function KalemTanimlari({ d, yukle }) {
  const [tur, setTur] = useState("gider");
  const [form, setForm] = useState(null);
  const liste = d.kalemler.filter(k => k.tur === tur).sort((a, b) => String(a.grup || "").localeCompare(String(b.grup || ""), "tr") || String(a.kod || "").localeCompare(String(b.kod || "")));
  const gruplar = [...new Set(d.kalemler.filter(k => k.tur === tur).map(k => k.grup).filter(Boolean))];
  const kaydet = async () => {
    if (!form.ad?.trim()) { swalAlert("Ad zorunlu."); return; }
    const { id, created_at, ...kayit } = { ...form, ad: form.ad.trim(), tur };
    const r = id ? await supabase.from('fin_kalemler').update(kayit).eq('id', id) : await supabase.from('fin_kalemler').insert(kayit);
    if (r.error) { swalAlert("Kaydedilemedi: " + r.error.message); return; }
    setForm(null); yukle();
  };
  const sil = async (k) => { if (!await swalConfirm(`"${k.ad}" kalemi silinsin mi? Kullanıldığı faturalarda kalem adı boş görünür; silmek yerine pasif yapabilirsiniz.`)) return; await supabase.from('fin_kalemler').delete().eq('id', k.id); yukle(); };
  return (
    <Kart baslik="Gelir ve Gider Kalemleri" sag={<>
      <Sekmeler liste={[["gider", "Gider Kalemleri"], ["gelir", "Gelir Kalemleri"]]} aktif={tur} sec={setTur} />
      <Btn variant="primary" onClick={() => setForm({ kod: "", ad: "", grup: "", aciklama: "", aktif: true })}>+ Yeni Kalem</Btn>
    </>}>
      <Tablo>
        <thead><tr><th style={th}>Kod</th><th style={th}>Ad</th><th style={th}>Grup</th><th style={th}>Açıklama</th><th style={th}>Durum</th><th style={th}></th></tr></thead>
        <tbody>
          {liste.length === 0 && <BosSatir n={6} />}
          {liste.map(k => <tr key={k.id}><td style={td}>{k.kod || "—"}</td><td style={{ ...td, fontWeight: 600 }}>{k.ad}</td><td style={td}>{k.grup || "—"}</td><td style={{ ...td, color: T.textMuted }}>{k.aciklama || ""}</td><td style={td}>{k.aktif === false ? "Pasif" : "Aktif"}</td><td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 5 }}><Btn onClick={() => setForm({ ...k })} style={{ padding: "4px 9px", fontSize: 11.5 }}>Düzenle</Btn><Btn onClick={() => sil(k)} style={{ padding: "4px 9px", fontSize: 11.5, color: T.redText }}>Sil</Btn></div></td></tr>)}
        </tbody>
      </Tablo>
      {form && <Modal title={form.id ? "Kalem Düzenle" : `Yeni ${tur === "gider" ? "Gider" : "Gelir"} Kalemi`} onClose={() => setForm(null)} width={480}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0 12px" }}>
          <FormField label="Kod"><Input value={form.kod || ""} onChange={e => setForm({ ...form, kod: e.target.value })} /></FormField>
          <FormField label="Ad *"><Input value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} /></FormField>
        </div>
        <FormField label="Grup"><Input placeholder="Ör: Faturalar" value={form.grup || ""} onChange={e => setForm({ ...form, grup: e.target.value })} /></FormField>
        {gruplar.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: -8, marginBottom: 12 }}>{gruplar.map(g => <button key={g} onClick={() => setForm({ ...form, grup: g })} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.bgInput, color: T.textSecondary, cursor: "pointer" }}>{g}</button>)}</div>}
        <FormField label="Açıklama"><Input value={form.aciklama || ""} onChange={e => setForm({ ...form, aciklama: e.target.value })} /></FormField>
        <FormField label="Durum"><Select value={form.aktif === false ? "0" : "1"} onChange={e => setForm({ ...form, aktif: e.target.value === "1" })}><option value="1">Aktif</option><option value="0">Pasif</option></Select></FormField>
        <ModalActions onClose={() => setForm(null)} onSave={kaydet} />
      </Modal>}
    </Kart>
  );
}

export function FinansTanimlar({ alt }) {
  const { d, err, kurulumYok, yukle } = useFinVeri();
  if (!d) return <Yukleniyor />;
  return (
    <div>
      <Uyarilar err={err} kurulumYok={kurulumYok} />
      {alt === "kasa" && <KasaTanimlari d={d} yukle={yukle} />}
      {alt === "cari" && (kurulumYok ? null : <CariTanimlari d={d} yukle={yukle} />)}
      {alt === "kalem" && (kurulumYok ? null : <KalemTanimlari d={d} yukle={yukle} />)}
    </div>
  );
}
