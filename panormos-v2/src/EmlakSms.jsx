// ═══════════════ EMLAK PANELİM > SMS ═══════════════
// Apsiyon'un "SMS ile Bildirim / Şablonlar / Durum Raporu" düzeni (27.10.2026). Veri ve gönderim
// emlakpanelim-admin işlevi üzerinden: şablon ve rapor Emlak Panelim veritabanından okunur, SMS'i
// Emlak Panelim'in sms işlevi Netgsm ile gönderir (Netgsm bilgileri yalnızca Emlak Panelim Netlify'ında).
import { useState, useEffect, useRef } from "react";
import { T } from "./theme";
import { Btn, Select, Input, panelFetch, swalAlert, swalConfirm } from "./App.jsx";

const GRUPLAR = [
  ["hepsi", "Bütün firmalar"], ["deneme", "Denemedekiler"], ["aktif", "Abone olanlar"], ["kisitli", "Kısıtlananlar"],
  ["bitmis", "Süresi dolanlar"], ["izinli", "Duyuru / kutlama izni verenler"], ["elle", "Hiçbiri (elle seçeceğim)"],
];
const DEGISKENLER = [["{firma}", "Firma adı"], ["{bitis}", "Abonelik bitişi"], ["{kalan_gun}", "Kalan gün"], ["{cumhuriyet}", "Cumhuriyet yılı"]];
const DURUM_AD = { deneme: "Deneme", aktif: "Abone", kisitli: "Kısıtlı", donduruldu: "Donduruldu" };
const bugunStr = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const cepNo = (t) => { const r = String(t ?? "").replace(/\D/g, "").replace(/^90/, "").replace(/^0/, ""); return /^5\d{9}$/.test(r) ? r : null; };
const smsSayisi = (m) => (m.length <= 155 ? 1 : Math.ceil(m.length / 150));
const tarihSaat = (t) => new Date(t).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
// Emlak Panelim'deki metinDoldur ile aynı kural (önizleme için)
function metinDoldur(metin, f = {}) {
  const bitis = f.abonelik_bitis ? new Date(f.abonelik_bitis + "T00:00:00Z") : null;
  const d = {
    firma: f.ad || "", bitis: bitis ? bitis.toLocaleDateString("tr-TR", { timeZone: "UTC" }) : "",
    kalan_gun: bitis ? String(Math.round((bitis - new Date(bugunStr() + "T00:00:00Z")) / 86400000)) : "",
    cumhuriyet: String(new Date().getFullYear() - 1923),
  };
  return String(metin).replace(/\{(\w+)\}/g, (t, k) => (k in d ? d[k] : t)).replace(/\s+/g, " ").trim();
}
const grupUyar = (f, g) => {
  if (f.durum === "donduruldu" && g !== "hepsi") return false;
  if (g === "hepsi") return f.durum !== "donduruldu";
  if (g === "bitmis") return !!f.abonelik_bitis && f.abonelik_bitis < bugunStr();
  if (g === "izinli") return !!f.sms_izin;
  if (g === "elle") return false;
  return f.durum === g;
};

async function istek(body) {
  const res = await panelFetch("/.netlify/functions/emlakpanelim-admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "İşlem başarısız");
  return data;
}

const kart = { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 };
const bolumBaslik = (no, metin) => <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 24, height: 24, borderRadius: 12, background: T.amber, color: T.white, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12.5 }}>{no}</span>{metin}</div>;
const etiket = { fontSize: 12, color: T.textSecondary, fontWeight: 600, marginBottom: 6, display: "block" };
const th = { textAlign: "left", padding: "7px 10px", fontSize: 10.5, color: T.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" };
const td = { padding: "7px 10px", fontSize: 13, color: T.textPrimary, borderTop: `1px solid ${T.border}` };

export default function EmlakSms() {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState("");
  const [sekme, setSekme] = useState("bildirim");
  const yukle = async () => {
    try { setVeri(await istek({ aksiyon: "sms_veri" })); setHata(""); } catch (e) { setHata(e.message); }
  };
  useEffect(() => { yukle(); }, []);
  if (hata) return <div style={{ color: T.redText, background: T.redDim, borderRadius: 10, padding: 16, fontSize: 13 }}>SMS bilgileri alınamadı: {hata}</div>;
  if (!veri) return <div style={{ textAlign: "center", color: T.textMuted, padding: 40 }}>Yükleniyor...</div>;
  if (veri.kurulumYok) return <div style={{ ...kart, color: T.amberText }}>Emlak Panelim'de SMS tabloları kurulmamış (supabase/sms-kurulum.sql).</div>;
  const buAy = veri.gonderimler.filter(g => g.durum === "gonderildi" && String(g.created_at).slice(0, 7) === bugunStr().slice(0, 7)).length;
  return (
    <div>
      <div style={{ ...kart, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
        <div><div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase" }}>SMS Durumu</div><div style={{ fontSize: 14, fontWeight: 700, color: veri.hazir ? T.greenText : T.amberText }}>{veri.hazir ? "Netgsm bağlı" : "Netgsm bilgileri girilmemiş"}</div></div>
        <div><div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Bu ay gönderilen</div><div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{buAy} SMS</div></div>
        <div><div style={{ fontSize: 11, color: T.textMuted, fontWeight: 700, textTransform: "uppercase" }}>Telefonu olan firma</div><div style={{ fontSize: 14, fontWeight: 700, color: T.textPrimary }}>{veri.firmalar.filter(f => cepNo(f.telefon)).length} / {veri.firmalar.length}</div></div>
        {!veri.hazir && <div style={{ flex: 1, minWidth: 260, fontSize: 12, color: T.textMuted }}>Netgsm hesabı açılınca API kullanıcısı, şifresi ve onaylı gönderen adı Emlak Panelim'in Netlify ayarlarına girilir (NETGSM_KULLANICI, NETGSM_SIFRE, NETGSM_BASLIK). O zamana kadar şablonları hazırlayabilirsiniz.</div>}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[["bildirim", "SMS ile Bildirim"], ["sablon", "SMS Şablonları"], ["rapor", "SMS Durum Raporu"]].map(([id, ad]) => <button key={id} onClick={() => setSekme(id)} style={{ fontSize: 12.5, padding: "7px 13px", borderRadius: 9, cursor: "pointer", fontWeight: sekme === id ? 700 : 500, background: sekme === id ? T.amber : T.bgInput, color: sekme === id ? T.white : T.textSecondary, border: `1px solid ${sekme === id ? T.amber : T.border}` }}>{ad}</button>)}
      </div>
      {sekme === "bildirim" && <SmsBildirim veri={veri} yukle={yukle} />}
      {sekme === "sablon" && <SmsSablonlari veri={veri} yukle={yukle} />}
      {sekme === "rapor" && <SmsRaporu veri={veri} />}
    </div>
  );
}

function SmsBildirim({ veri, yukle }) {
  const [grup, setGrup] = useState("hepsi");
  const [secili, setSecili] = useState(() => new Set(veri.firmalar.filter(f => grupUyar(f, "hepsi") && cepNo(f.telefon)).map(f => f.id)));
  const [ara, setAra] = useState("");
  const [sablonId, setSablonId] = useState("");
  const [metin, setMetin] = useState("");
  const [ticari, setTicari] = useState(true);
  const [onizlemeId, setOnizlemeId] = useState("");
  const [denemeTel, setDenemeTel] = useState(() => { try { return localStorage.getItem("sms_deneme_tel") || ""; } catch { return ""; } });
  const [bekle, setBekle] = useState(false);
  const alan = useRef(null);

  const grupSec = (g) => { setGrup(g); setSecili(new Set(veri.firmalar.filter(f => grupUyar(f, g) && cepNo(f.telefon)).map(f => f.id))); };
  const degistir = (id) => setSecili(s => { const y = new Set(s); y.has(id) ? y.delete(id) : y.add(id); return y; });
  const gorunen = veri.firmalar.filter(f => !ara || f.ad.toLocaleLowerCase("tr").includes(ara.toLocaleLowerCase("tr")) || String(f.telefon || "").includes(ara));
  const seciliFirmalar = veri.firmalar.filter(f => secili.has(f.id));
  const numaralar = new Set(seciliFirmalar.map(f => cepNo(f.telefon)).filter(Boolean));
  const ekle = (k) => {
    const el = alan.current;
    if (!el) { setMetin(m => m + k); return; }
    const bas = el.selectionStart ?? metin.length, son = el.selectionEnd ?? metin.length;
    setMetin(metin.slice(0, bas) + k + metin.slice(son));
    setTimeout(() => { el.focus(); el.setSelectionRange(bas + k.length, bas + k.length); }, 0);
  };
  const ornek = veri.firmalar.find(f => f.id === onizlemeId) || seciliFirmalar[0];

  const gonder = async () => {
    if (!metin.trim() || !numaralar.size) return;
    if (!await swalConfirm(`${numaralar.size} numaraya SMS gönderilecek (kişi başı ${smsSayisi(metinDoldur(metin, ornek))} SMS, toplam yaklaşık ${numaralar.size * smsSayisi(metinDoldur(metin, ornek))} SMS).\n\nGönderilsin mi?`)) return;
    setBekle(true);
    try {
      const j = await istek({ aksiyon: "sms_gonder", firma_idler: [...secili], metin, ticari });
      swalAlert(`${j.gonderilen} SMS gönderildi.${j.hatali ? `\n\n${j.hatali} SMS gönderilemedi: ${j.hata}` : ""}`);
      yukle();
    } catch (e) { swalAlert("Gönderilemedi: " + e.message); }
    setBekle(false);
  };
  const dene = async () => {
    if (!metin.trim()) return;
    if (!cepNo(denemeTel)) { swalAlert("Deneme için geçerli bir cep telefonu yazın."); return; }
    try { localStorage.setItem("sms_deneme_tel", denemeTel); } catch { /* önemli değil */ }
    setBekle(true);
    try { await istek({ aksiyon: "sms_deneme", telefon: denemeTel, firma_id: ornek?.id, metin, ticari }); swalAlert("Deneme SMS'i gönderildi."); yukle(); }
    catch (e) { swalAlert("Gönderilemedi: " + e.message); }
    setBekle(false);
  };

  return (
    <div>
      <div style={kart}>
        {bolumBaslik(1, "Kısa mesaj gönderilecek firmaları seçin")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 10 }}>
          <div><label style={etiket}>Gönderilecek grup</label><Select value={grup} onChange={e => grupSec(e.target.value)}>{GRUPLAR.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
          <div><label style={etiket}>Listede ara</label><Input placeholder="Firma adı ya da telefon" value={ara} onChange={e => setAra(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: T.textPrimary, fontWeight: 700 }}>{secili.size} firma seçili · {numaralar.size} numara</span>
          <Btn onClick={() => setSecili(s => new Set([...s, ...gorunen.filter(f => cepNo(f.telefon)).map(f => f.id)]))} style={{ padding: "4px 10px", fontSize: 12 }}>Listedekileri seç</Btn>
          <Btn onClick={() => setSecili(new Set())} style={{ padding: "4px 10px", fontSize: 12 }}>Seçimi temizle</Btn>
        </div>
        <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, background: T.bgCard }}><tr><th style={{ ...th, width: 30 }}></th><th style={th}>Firma</th><th style={th}>Cep telefonu</th><th style={th}>Durum</th><th style={th}>Bitiş</th><th style={th}>İzin</th></tr></thead>
            <tbody>
              {gorunen.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: T.textMuted }}>Firma yok.</td></tr>}
              {gorunen.map(f => {
                const no = cepNo(f.telefon);
                return <tr key={f.id} onClick={() => no && degistir(f.id)} style={{ cursor: no ? "pointer" : "default", opacity: no ? 1 : 0.55, background: secili.has(f.id) ? T.amberDim : "transparent" }}>
                  <td style={td}><input type="checkbox" checked={secili.has(f.id)} disabled={!no} onChange={() => degistir(f.id)} onClick={e => e.stopPropagation()} /></td>
                  <td style={{ ...td, fontWeight: 600 }}>{f.ad}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{f.telefon || "—"}{f.telefon && !no && <span style={{ color: T.redText, fontSize: 11 }}> · cep değil</span>}</td>
                  <td style={td}>{DURUM_AD[f.durum] || f.durum}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>{f.abonelik_bitis ? new Date(f.abonelik_bitis + "T00:00:00").toLocaleDateString("tr-TR") : "—"}</td>
                  <td style={td}>{f.sms_izin ? "Var" : "—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={kart}>
        {bolumBaslik(2, "Kısa mesaj içeriğini seçin")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 10 }}>
          <div><label style={etiket}>Gönderilecek mesaj</label>
            <Select value={sablonId} onChange={e => { setSablonId(e.target.value); const s = veri.sablonlar.find(x => String(x.id) === e.target.value); if (s) { setMetin(s.metin); setTicari(!!s.kutlama || !s.otomatik); } }}>
              <option value="">Şablon seçin ya da aşağıya yazın</option>
              {veri.sablonlar.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </Select>
          </div>
        </div>
        <label style={etiket}>Mesaj</label>
        <textarea ref={alan} value={metin} onChange={e => setMetin(e.target.value)} placeholder="Sayın {firma}, …" style={{ width: "100%", minHeight: 100, background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 9, padding: "10px 12px", fontSize: 13.5, color: T.textPrimary, fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" }} />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          {DEGISKENLER.map(([k, l]) => <button key={k} type="button" onClick={() => ekle(k)} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 7, cursor: "pointer", background: T.indigoDim, color: T.indigoText, border: "none", fontWeight: 600 }}>{l}</button>)}
          <span style={{ marginLeft: "auto", fontSize: 12, color: T.textMuted }}>{metin.length} karakter · {metin ? smsSayisi(metin) : 0} SMS</span>
        </div>
        <div style={{ fontSize: 12, color: T.textMuted, background: T.bgInput, borderRadius: 8, padding: "8px 12px", marginBottom: 10 }}>İpucu: Değişkenler her firmaya kendi bilgisiyle gider (ör. {"{firma}"} → firmanın adı). Türkçe karakterli SMS 155 karakteri geçince iki SMS sayılır.</div>
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: T.textSecondary, cursor: "pointer" }}>
          <input type="checkbox" checked={ticari} onChange={e => setTicari(e.target.checked)} />
          Ticari ileti (kutlama, duyuru, kampanya). İşaretli değilse yalnızca hesapla ilgili bilgilendirme sayılır.
        </label>
      </div>

      <div style={kart}>
        {bolumBaslik(3, "Ön izleme ve gönderim")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginBottom: 12 }}>
          <div><label style={etiket}>Firma seçin</label><Select value={onizlemeId || ornek?.id || ""} onChange={e => setOnizlemeId(e.target.value)}>{seciliFirmalar.length === 0 && <option value="">Önce firma seçin</option>}{seciliFirmalar.map(f => <option key={f.id} value={f.id}>{f.ad}</option>)}</Select></div>
          <div><label style={etiket}>Deneme numarası</label><Input placeholder="05xx xxx xx xx" value={denemeTel} onChange={e => setDenemeTel(e.target.value)} /></div>
        </div>
        <div style={{ background: T.bgInput, border: `1px dashed ${T.border}`, borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: metin ? T.textPrimary : T.textMuted, marginBottom: 14, whiteSpace: "pre-wrap" }}>
          {metin ? metinDoldur(metin, ornek) : "Mesaj yazınca, seçilen firmaya gidecek hâli burada görünür."}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={dene} disabled={bekle || !metin.trim() || !veri.hazir}>Deneme numarasına gönder</Btn>
          <Btn variant="primary" onClick={gonder} disabled={bekle || !metin.trim() || !numaralar.size || !veri.hazir}>{bekle ? "Gönderiliyor..." : `Gönder (${numaralar.size} numara)`}</Btn>
          <Btn onClick={async () => { const ad = window.prompt("Şablon adı:"); if (!ad?.trim()) return; try { await istek({ aksiyon: "sms_sablon_ekle", ad: ad.trim(), metin }); yukle(); } catch (e) { swalAlert(e.message); } }} disabled={!metin.trim()}>Şablon olarak kaydet</Btn>
        </div>
        {!veri.hazir && <div style={{ fontSize: 12, color: T.amberText, marginTop: 8 }}>Netgsm bilgileri girilince gönderim düğmeleri açılır.</div>}
      </div>
    </div>
  );
}

function SmsSablonlari({ veri, yukle }) {
  const [taslak, setTaslak] = useState({});
  const al = (s, k) => (taslak[s.id]?.[k] ?? s[k]);
  const yaz = (s, k, v) => setTaslak(t => ({ ...t, [s.id]: { ...t[s.id], [k]: v } }));
  const kaydet = async (s) => {
    try { await istek({ aksiyon: "sms_sablon_kaydet", id: s.id, alanlar: { ad: al(s, "ad"), metin: al(s, "metin"), aktif: !!al(s, "aktif"), tarih: al(s, "tarih") || null } }); setTaslak(t => { const y = { ...t }; delete y[s.id]; return y; }); yukle(); }
    catch (e) { swalAlert(e.message); }
  };
  const sil = async (s) => { if (!await swalConfirm(`"${s.ad}" şablonu silinsin mi?`)) return; try { await istek({ aksiyon: "sms_sablon_sil", id: s.id }); yukle(); } catch (e) { swalAlert(e.message); } };
  const gun = (s) => ["odeme_basarisiz", "kisitlandi"].includes(s.anahtar) ? "Olay olunca"
    : s.anahtar === "yildonumu" ? "İlk ödeme günü"
    : s.her_yil ? new Date(s.tarih + "T00:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long" })
    : <input type="date" value={al(s, "tarih") || ""} onChange={e => yaz(s, "tarih", e.target.value)} style={{ background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 7, padding: "5px 7px", color: T.textPrimary }} />;
  const tablo = (liste, otomatik) => (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>Ad</th>{otomatik && <th style={th}>Ne zaman</th>}<th style={{ ...th, minWidth: 320 }}>Metin</th>{otomatik && <th style={th}>Durum</th>}<th style={th}></th></tr></thead>
        <tbody>
          {liste.length === 0 && <tr><td colSpan={5} style={{ ...td, textAlign: "center", color: T.textMuted }}>Şablon yok.</td></tr>}
          {liste.map(s => <tr key={s.id}>
            <td style={{ ...td, fontWeight: 600, whiteSpace: "nowrap" }}>{s.ad}{otomatik && <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}>{s.kutlama ? "Kutlama · izin verenlere" : "Bilgilendirme · herkese"}</div>}</td>
            {otomatik && <td style={{ ...td, whiteSpace: "nowrap" }}>{gun(s)}</td>}
            <td style={td}><textarea value={al(s, "metin")} onChange={e => yaz(s, "metin", e.target.value)} rows={2} style={{ width: "100%", background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 8px", fontSize: 13, color: T.textPrimary, fontFamily: "inherit", boxSizing: "border-box" }} /><div style={{ fontSize: 11, color: T.textMuted }}>{String(al(s, "metin")).length} karakter</div></td>
            {otomatik && <td style={td}><label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, color: T.textPrimary, whiteSpace: "nowrap", cursor: "pointer" }}><input type="checkbox" checked={!!al(s, "aktif")} onChange={e => yaz(s, "aktif", e.target.checked)} />{al(s, "aktif") ? "Açık" : "Kapalı"}</label></td>}
            <td style={{ ...td, whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 5 }}>
              {taslak[s.id] && <Btn variant="primary" onClick={() => kaydet(s)} style={{ padding: "4px 10px", fontSize: 12 }}>Kaydet</Btn>}
              {!otomatik && <Btn onClick={() => sil(s)} style={{ padding: "4px 10px", fontSize: 12, color: T.redText }}>Sil</Btn>}
            </div></td>
          </tr>)}
        </tbody>
      </table>
    </div>
  );
  return (
    <div>
      <div style={kart}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>Otomatik mesajlar</div>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 12 }}>Açık olanlar kendiliğinden gider: ödeme mesajları ödeme alınamayan ilk gün ve abonelik kısıtlandığında; kutlamalar ilgili gün saat 10:30'da yalnızca izin veren firmalara. Ramazan ve Kurban Bayramı tarihini her yıl girin.</div>
        {tablo(veri.sablonlar.filter(s => s.otomatik), true)}
      </div>
      <div style={kart}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>Kayıtlı şablonlar</div>
        <div style={{ fontSize: 12.5, color: T.textMuted, marginBottom: 12 }}>"SMS ile Bildirim" ekranında yazdığınız mesajı "Şablon olarak kaydet" ile buraya eklersiniz.</div>
        {tablo(veri.sablonlar.filter(s => !s.otomatik), false)}
      </div>
    </div>
  );
}

function SmsRaporu({ veri }) {
  const [durum, setDurum] = useState("");
  const [tur, setTur] = useState("");
  const adOf = (t) => veri.sablonlar.find(s => s.anahtar === t)?.ad || { elle: "Toplu (elle)", deneme: "Deneme" }[t] || t;
  const firmaAdi = (id) => veri.firmalar.find(f => f.id === id)?.ad || "—";
  const liste = veri.gonderimler.filter(g => (!durum || g.durum === durum) && (!tur || g.tur === tur));
  const turler = [...new Set(veri.gonderimler.map(g => g.tur))];
  return (
    <div style={kart}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.textPrimary, marginRight: "auto" }}>Son {veri.gonderimler.length} gönderim · {veri.gonderimler.filter(g => g.durum === "gonderildi").length} başarılı, {veri.gonderimler.filter(g => g.durum !== "gonderildi").length} hatalı</div>
        <div style={{ width: 170 }}><Select value={tur} onChange={e => setTur(e.target.value)}><option value="">Bütün türler</option>{turler.map(t => <option key={t} value={t}>{adOf(t)}</option>)}</Select></div>
        <div style={{ width: 150 }}><Select value={durum} onChange={e => setDurum(e.target.value)}><option value="">Hepsi</option><option value="gonderildi">Gönderildi</option><option value="hata">Hatalı</option></Select></div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={th}>Tarih</th><th style={th}>Tür</th><th style={th}>Firma</th><th style={th}>Telefon</th><th style={th}>Mesaj</th><th style={th}>Durum</th></tr></thead>
          <tbody>
            {liste.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: T.textMuted }}>Henüz SMS gönderilmedi.</td></tr>}
            {liste.map(g => <tr key={g.id}>
              <td style={{ ...td, whiteSpace: "nowrap", fontSize: 12.5 }}>{tarihSaat(g.created_at)}</td>
              <td style={{ ...td, fontSize: 12.5 }}>{adOf(g.tur)}</td>
              <td style={{ ...td, fontSize: 12.5 }}>{g.firma_id ? firmaAdi(g.firma_id) : "—"}</td>
              <td style={{ ...td, fontSize: 12.5, whiteSpace: "nowrap" }}>{g.telefon}</td>
              <td style={{ ...td, fontSize: 12.5, maxWidth: 420 }}>{g.metin}</td>
              <td style={td}>{g.durum === "gonderildi" ? <span style={{ color: T.greenText, fontWeight: 700, fontSize: 12.5 }}>Gönderildi</span> : <span title={g.hata || ""} style={{ color: T.redText, fontWeight: 700, fontSize: 12.5 }}>Hata{g.hata ? `: ${g.hata.slice(0, 60)}` : ""}</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
