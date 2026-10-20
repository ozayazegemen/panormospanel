import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Restoran ve barların dijital menüsü: panormosmedya.com/m/<slug>
// Masadaki QR kod buraya açılır. Giriş ekranında kategori düğmeleri, kategoriye girince ürünler, fiyatlar ve alerjenler.
// Menü panelden (QR Menü bölümü) yönetilir; fiyat değişince menü anında güncellenir, PDF gerekmez.

const YAZI_TIPLERI = {
  zarif: { baslik: "'DM Sans', sans-serif", urun: "'Lora', Georgia, serif", kbaslik: "'Cormorant Garamond', Georgia, serif", govde: "'DM Sans', sans-serif", link: "family=DM+Sans:wght@400;500;700&family=Lora:wght@500;600;700&family=Cormorant+Garamond:wght@500;600" },
  modern: { baslik: "'Manrope', sans-serif", urun: "'Manrope', sans-serif", kbaslik: "'Manrope', sans-serif", govde: "'Manrope', sans-serif", link: "family=Manrope:wght@400;500;600;700;800" },
  eglenceli: { baslik: "'Unbounded', sans-serif", urun: "'Manrope', sans-serif", kbaslik: "'Unbounded', sans-serif", govde: "'Manrope', sans-serif", link: "family=Unbounded:wght@600;800&family=Manrope:wght@400;500;600;700;800" },
};

const ALERJEN_ADLARI = { G: "Gluten", D: "Süt ürünleri", N: "Kuruyemiş", V: "Vejetaryen", VG: "Vegan", SF: "Kabuklu deniz ürünleri", ALC: "Alkol", SSM: "Susam" };

// Ölçü adlarının İngilizcesi (menüde EN seçilince)
const OLCU_EN = { tek: "Single", duble: "Double", kadeh: "Glass", şişe: "Bottle", sise: "Bottle", porsiyon: "Portion", küçük: "Small", büyük: "Large", orta: "Medium", yarım: "Half", tam: "Full" };
// Ürünün i. ölçüdeki fiyatı: yeni "fiyatlar" listesi, yoksa eski tek/çift fiyat alanları
const fiyatAl = (u, i) => { const f = (u.fiyatlar || [])[i]; return f !== undefined && f !== null ? f : i === 0 ? u.fiyat : i === 1 ? u.fiyat2 : null; };
const fiyatYaz = (n) => (n === null || n === undefined || n === "" ? "" : `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(n))}₺`);
// "0532 000 00 00" → "905320000000" (WhatsApp ve telefon bağlantısı için)
const telLink = (t) => { const d = String(t || "").replace(/\D/g, "").replace(/^0+/, ""); return d.startsWith("90") ? d : `90${d}`; };

export default function QrMenu({ slug }) {
  const [menu, setMenu] = useState(undefined); // undefined: yükleniyor, null: bulunamadı
  const [kategoriler, setKategoriler] = useState([]);
  const [urunler, setUrunler] = useState([]);
  const [dil, setDil] = useState(() => {
    const q = new URLSearchParams(window.location.search).get("dil");
    if (q === "en" || q === "tr") return q;
    try { return localStorage.getItem("qrmenu_dil") || "tr"; } catch (e) { return "tr"; }
  });
  // ?genis=1: işletmenin web sitesinden açılınca bilgisayarda geniş düzen (telefonda ve QR koddan açılınca dar kalır)
  const genis = new URLSearchParams(window.location.search).get("genis") === "1";
  const [secili, setSecili] = useState(() => new URLSearchParams(window.location.search).get("k") || "");

  useEffect(() => {
    // Panel html/body'ye taşma kilidi koymuş olabilir: menü sayfası kaydırılabilsin
    const html = document.documentElement, body = document.body, root = document.getElementById("root");
    html.style.height = "auto"; html.style.overflow = "auto";
    body.style.height = "auto"; body.style.overflow = "auto"; body.style.position = "static";
    if (root) { root.style.height = "auto"; root.style.overflow = "visible"; }
    const geri = () => setSecili(new URLSearchParams(window.location.search).get("k") || "");
    window.addEventListener("popstate", geri);
    return () => window.removeEventListener("popstate", geri);
  }, []);

  useEffect(() => {
    let iptal = false;
    (async () => {
      const { data: m } = await supabase.from("qr_menuler").select("*").eq("slug", slug).eq("aktif", true).maybeSingle();
      if (iptal) return;
      if (!m) { setMenu(null); return; }
      const { data: k } = await supabase.from("qr_kategoriler").select("*").eq("menu_id", m.id).eq("aktif", true).order("sira").order("created_at");
      const ids = (k || []).map((x) => x.id);
      const { data: u } = ids.length
        ? await supabase.from("qr_urunler").select("*").in("kategori_id", ids).eq("aktif", true).order("sira").order("created_at")
        : { data: [] };
      if (iptal) return;
      setKategoriler(k || []); setUrunler(u || []); setMenu(m);
      document.title = `Menü | ${m.ad}`;
    })();
    return () => { iptal = true; };
  }, [slug]);

  const tip = YAZI_TIPLERI[menu?.yazi_tipi] || YAZI_TIPLERI.zarif;
  useEffect(() => {
    if (!menu) return;
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = `https://fonts.googleapis.com/css2?${tip.link}&display=swap`;
    document.head.appendChild(l);
    const t = document.querySelector('meta[name="theme-color"]'); const eski = t?.content;
    if (t) t.content = menu.zemin_renk;
    return () => { l.remove(); if (t && eski) t.content = eski; };
  }, [menu, tip.link]);

  const en = dil === "en" && menu?.iki_dil;
  const yaz = (tr, ing) => (en && ing ? ing : tr);
  const dilSec = (d) => { setDil(d); try { localStorage.setItem("qrmenu_dil", d); } catch (e) {} };
  const git = (id) => {
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("k", id); else u.searchParams.delete("k");
    window.history.pushState({}, "", u);
    setSecili(id);
    if (!id) window.scrollTo(0, 0);
  };
  // Seçilen kategorinin başlığına kay (bölümün ilk kategorisiyse sayfanın en üstü)
  useEffect(() => {
    if (!secili) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`k-${secili}`);
      if (!el) return;
      const ilk = el.parentElement?.querySelector(".qm-kb") === el;
      window.scrollTo({ top: ilk ? 0 : el.getBoundingClientRect().top + window.scrollY - 112, behavior: "smooth" });
    }, 30);
    return () => clearTimeout(t);
  }, [secili, menu]);
  const kategori = kategoriler.find((k) => k.id === secili);
  // Tasarım şablonu: zarif (kemerli kartlar + kâğıt menü), gece (zarif'in koyu zeminlisi),
  // klasik (tek sayfa liste + arama) ve fotografli (tek sayfa fotoğraflı kartlar)
  const sablon = ["zarif", "gece", "klasik", "fotografli"].includes(menu?.sablon) ? menu.sablon : "zarif";
  const tekSayfa = sablon === "klasik" || sablon === "fotografli";

  if (menu === undefined) return <div style={{ minHeight: "100vh", background: "#F3F1EC" }} />;
  if (menu === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F1EC", fontFamily: "Georgia, serif", color: "#3a3a3a", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 22, marginBottom: 8 }}>Menü bulunamadı</div><div style={{ fontSize: 14, opacity: .7 }}>Bağlantı değişmiş ya da menü yayından kaldırılmış olabilir.</div></div>
      </div>
    );
  }

  const ana = menu.ana_renk, zemin = menu.zemin_renk;
  const wa = menu.whatsapp ? `https://wa.me/${telLink(menu.whatsapp)}` : "";
  const rez = menu.rezervasyon ? (/^https?:/i.test(menu.rezervasyon) ? menu.rezervasyon : `tel:+${telLink(menu.rezervasyon)}`) : "";

  const olcuAdi = (e) => (en ? OLCU_EN[e.toLocaleLowerCase("tr")] || e : e);
  // Giriş sayfasında kategoriler bölüm adına göre gruplanır (ör. İçki Menüsü / Şarap Menüsü); bölümsüzler tek grup
  const bolumler = [];
  kategoriler.forEach((k, i) => {
    const ad = yaz(k.bolum || "", k.bolum_en || "");
    const son = bolumler[bolumler.length - 1];
    if (son && son.anahtar === (k.bolum || "")) son.kategoriler.push({ k, i });
    else bolumler.push({ anahtar: k.bolum || "", ad, kategoriler: [{ k, i }] });
  });
  const dilAnahtari = menu.iki_dil && (
    <div className="qm-dil" role="group" aria-label="Dil / Language">
      <button className={!en ? "secili" : ""} onClick={() => dilSec("tr")}>TR</button>
      <button className={en ? "secili" : ""} onClick={() => dilSec("en")}>EN</button>
    </div>
  );

  return (
    <div className={`qm qm-${sablon}${genis ? " qm-genis" : ""}`} lang={en ? "en" : "tr"} style={{ "--ana": ana, "--zemin": zemin, "--baslik": tip.baslik, "--urun": tip.urun, "--kbaslik": tip.kbaslik, "--govde": tip.govde }}>
      <style>{QM_CSS}</style>
      {tekSayfa && <style>{QT_CSS}</style>}

      {tekSayfa ? (
        <TekSayfa menu={menu} kategoriler={kategoriler} urunler={urunler} yaz={yaz} olcuAdi={olcuAdi} dilAnahtari={dilAnahtari} fotografli={sablon === "fotografli"} />
      ) : !kategori ? (
        <main className="qm-giris">
          <div className="qm-ust-cubuk">{dilAnahtari}</div>
          <Logo menu={menu} buyuk />
          <div className="qm-susleme" aria-hidden="true"><span />✦<span /></div>
          <h1 className="qm-hosgeldin">{yaz("Menümüze hoş geldiniz", "Welcome to our menu")}</h1>
          {bolumler.map((b) => (
            <section key={b.anahtar} className="qm-bolum">
              {b.ad && <h2 className="qm-bolum-baslik"><span />{b.ad}<span /></h2>}
              <nav className="qm-kartlar">
                {b.kategoriler.map(({ k, i }) => (
                  <button key={k.id} className="qm-kart" onClick={() => git(k.id)}>
                    <span className="qm-no">{String(i + 1).padStart(2, "0")}</span>
                    <strong>{yaz(k.ad, k.ad_en)}</strong>
                    {menu.iki_dil && k.ad_en && <small>{en ? k.ad : k.ad_en}</small>}
                    <span className="qm-ok" aria-hidden="true">→</span>
                  </button>
                ))}
              </nav>
            </section>
          ))}
          {kategoriler.length === 0 && <p className="qm-bos">{yaz("Menü hazırlanıyor.", "The menu is being prepared.")}</p>}
          <Alt menu={menu} yaz={yaz} />
        </main>
      ) : (
        <main className="qm-sayfa">
          <header className="qm-ust">
            <button className="qm-geri" onClick={() => git("")} aria-label={yaz("Menüye dön", "Back to menu")}>←</button>
            <Logo menu={menu} />
            {dilAnahtari || <span style={{ width: 40 }} />}
          </header>
          <div className="qm-sekmeler">
            {kategoriler.map((k, i) => (
              <span key={k.id} style={{ display: "contents" }}>
                {i > 0 && (k.bolum || "") !== (kategoriler[i - 1].bolum || "") && <i className="qm-sekme-ayrac" aria-hidden="true" />}
                <button className={k.id === secili ? "secili" : ""} onClick={() => git(k.id)}>{yaz(k.ad, k.ad_en)}</button>
              </span>
            ))}
          </div>
          {/* Olden'in kâğıt menüsündeki gibi: bölümdeki bütün kategoriler tek sayfada alt alta */}
          <div className="qm-kagit">
            {kategori.bolum && <div className="qm-kagit-bolum">{yaz(kategori.bolum, kategori.bolum_en)}</div>}
            {kategoriler.filter((k) => (k.bolum || "") === (kategori.bolum || "") && (k.id === secili || urunler.some((u) => u.kategori_id === k.id))).map((k) => {
              const et = String(k.fiyat_etiketleri || "").split(/[,|/]/).map((x) => x.trim()).filter(Boolean);
              const kUrunler = urunler.filter((u) => u.kategori_id === k.id);
              const sutunlu = et.length > 1;
              const cok = et.length > 2;
              const fiyatMetni = (f) => (f === null || f === undefined || f === "" ? "" : cok ? new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(f)) : fiyatYaz(f));
              const ikinci = menu.iki_dil && k.ad_en && k.ad_en.toLocaleLowerCase("en") !== k.ad.toLocaleLowerCase("tr") ? (en ? k.ad : k.ad_en) : "";
              return (
                <section key={k.id} id={`k-${k.id}`} className={`qm-kb${cok ? " cok" : ""}`} style={{ "--sutun": `${et.length <= 2 ? 74 : et.length <= 4 ? 50 : 37}px` }}>
                  <h2>
                    {yaz(k.ad, k.ad_en).toLocaleUpperCase(en ? "en" : "tr")}
                    {ikinci && <> - {ikinci.toLocaleUpperCase(en ? "tr" : "en")}</>}
                    {et.length === 1 && <small> {olcuAdi(et[0])}</small>}
                  </h2>
                  {yaz(k.aciklama, k.aciklama_en) && <p className="qm-kb-aciklama">{yaz(k.aciklama, k.aciklama_en)}</p>}
                  {sutunlu && (
                    <div className="qm-kb-olcu"><span className="bos">{cok ? "₺" : ""}</span>{et.map((e) => <span key={e}>{olcuAdi(e)}</span>)}</div>
                  )}
                  {kUrunler.map((u) => {
                    const fl = (et.length ? et : [""]).map((_, i) => fiyatMetni(fiyatAl(u, i)));
                    const var_ = fl.some(Boolean);
                    return (
                      <article key={u.id} className={`qm-u${u.tukendi ? " tukendi" : ""}`}>
                        {u.gorsel && <img src={u.gorsel} alt="" loading="lazy" />}
                        <div className="qm-u-metin">
                          <h3>
                            {yaz(u.ad, u.ad_en)}
                            {(u.alerjenler || []).length > 0 && <span className="qm-alerjen" title={(u.alerjenler || []).map((a) => ALERJEN_ADLARI[a] || a).join(", ")}>{u.alerjenler.join(" · ")}</span>}
                            {u.etiket && <em className="qm-etiket">{u.etiket}</em>}
                            {u.tukendi && <em className="qm-etiket tukendi">{yaz("Tükendi", "Sold out")}</em>}
                          </h3>
                          {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
                        </div>
                        {/* Ölçülü kategoride fiyat alanı her zaman ayrılır: fiyat girilmemiş olsa da yazı o sütunlara taşmaz */}
                        {(var_ || et.length > 0) && <div className={`qm-u-fiyat${et.length ? " sutunlu" : ""}`}>{fl.map((f, i) => <span key={i} className={f ? "" : "bos"}>{f || (sutunlu && var_ ? "–" : "")}</span>)}</div>}
                      </article>
                    );
                  })}
                  {kUrunler.length === 0 && <p className="qm-bos">{yaz("Bu bölümde henüz ürün yok.", "No items in this section yet.")}</p>}
                </section>
              );
            })}
            {yaz(menu.alerjen_notu, menu.alerjen_notu_en) && <p className="qm-alerjen-notu">{yaz(menu.alerjen_notu, menu.alerjen_notu_en)}</p>}
          </div>
          <Alt menu={menu} yaz={yaz} />
        </main>
      )}

      {(rez || wa) && (
        <div className="qm-alt-dugmeler">
          {rez && <a href={rez} target={rez.startsWith("http") ? "_blank" : undefined} rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>{yaz("Rezervasyon", "Reservation")}</a>}
          {wa && <a href={wa} target="_blank" rel="noopener" className="wa"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" /></svg>WhatsApp</a>}
        </div>
      )}
    </div>
  );
}

// Klasik ve fotoğraflı şablonlar: bütün kategoriler tek sayfada alt alta, üstte arama ve kategori çubuğu
const fiyatEtiketleri = (k) => String(k.fiyat_etiketleri || "").split(/[,|/]/).map((x) => x.trim()).filter(Boolean);

function TekSayfa({ menu, kategoriler, urunler, yaz, olcuAdi, dilAnahtari, fotografli }) {
  const [ara, setAra] = useState("");
  const [aktif, setAktif] = useState(kategoriler[0]?.id || "");
  const q = ara.trim().toLocaleLowerCase("tr");
  const eslesir = (u) => !q || [u.ad, u.ad_en, u.aciklama, u.aciklama_en].filter(Boolean).join(" ").toLocaleLowerCase("tr").includes(q);
  const gorunen = kategoriler
    .map((k) => ({ k, liste: urunler.filter((u) => u.kategori_id === k.id && eslesir(u)) }))
    .filter((x) => x.liste.length > 0);
  const kapak = fotografli ? urunler.find((u) => u.gorsel)?.gorsel : "";

  const kay = (id) => {
    setAktif(id);
    const el = document.getElementById(`qt-${id}`);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 124, behavior: "smooth" });
  };
  // Kaydırdıkça üstteki kategori çubuğunda bulunulan kategori seçili görünsün
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const gozcu = new IntersectionObserver((girdiler) => {
      const g = girdiler.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (g) setAktif(g.target.dataset.id);
    }, { rootMargin: "-130px 0px -60% 0px" });
    document.querySelectorAll(".qt-kat").forEach((el) => gozcu.observe(el));
    return () => gozcu.disconnect();
  }, [gorunen.length, q]);
  useEffect(() => {
    const cubuk = document.querySelector(".qt-sekmeler"), sekme = document.getElementById(`qt-sekme-${aktif}`);
    if (cubuk && sekme) cubuk.scrollTo({ left: sekme.offsetLeft - cubuk.clientWidth / 2 + sekme.clientWidth / 2, behavior: "smooth" });
  }, [aktif]);

  const fiyatlar = (u, et) => (et.length ? et : [""]).map((e, i) => ({ e, f: fiyatAl(u, i) })).filter((x) => x.f !== null && x.f !== undefined && x.f !== "");
  const isaretler = (u) => (
    <>
      {u.etiket && <em className="qm-etiket">{u.etiket}</em>}
      {u.tukendi && <em className="qm-etiket tukendi">{yaz("Tükendi", "Sold out")}</em>}
      {(u.alerjenler || []).length > 0 && <span className="qm-alerjen" title={u.alerjenler.map((a) => ALERJEN_ADLARI[a] || a).join(", ")}>{u.alerjenler.join(" · ")}</span>}
    </>
  );

  let oncekiBolum = null;
  return (
    <main className={`qt${fotografli ? " qt-foto" : ""}`}>
      <header className="qt-kapak" style={kapak ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.62)),url(${kapak})` } : undefined}>
        <div className="qt-kapak-ust">{dilAnahtari}</div>
        <Logo menu={menu} buyuk />
        {menu.adres && <p className="qt-adres">{menu.adres}</p>}
      </header>

      <div className="qt-cubuk">
        <label className="qt-ara">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input type="search" value={ara} onChange={(e) => setAra(e.target.value)} placeholder={yaz("Menüde ara", "Search the menu")} />
        </label>
        <nav className="qt-sekmeler">
          {gorunen.map(({ k }) => (
            <button key={k.id} id={`qt-sekme-${k.id}`} className={k.id === aktif ? "secili" : ""} onClick={() => kay(k.id)}>{yaz(k.ad, k.ad_en)}</button>
          ))}
        </nav>
      </div>

      <div className="qt-govde">
        {gorunen.length === 0 && <p className="qm-bos">{q ? yaz("Aradığınız ürün bulunamadı.", "No items found.") : yaz("Menü hazırlanıyor.", "The menu is being prepared.")}</p>}
        {gorunen.map(({ k, liste }) => {
          const et = fiyatEtiketleri(k);
          const sutunlu = et.length > 1 && !fotografli;
          const bolumBasligi = (k.bolum || "") !== oncekiBolum && k.bolum ? yaz(k.bolum, k.bolum_en) : "";
          oncekiBolum = k.bolum || "";
          return (
            <section key={k.id} id={`qt-${k.id}`} data-id={k.id} className="qt-kat">
              {bolumBasligi && <div className="qt-bolum">{bolumBasligi}</div>}
              <h2>{yaz(k.ad, k.ad_en)}{et.length === 1 && <small> · {olcuAdi(et[0])}</small>}</h2>
              {yaz(k.aciklama, k.aciklama_en) && <p className="qt-kat-aciklama">{yaz(k.aciklama, k.aciklama_en)}</p>}
              {sutunlu && <div className="qt-olcu">{et.map((e) => <span key={e}>{olcuAdi(e)}</span>)}</div>}
              <div className={fotografli ? "qt-kartlar" : "qt-satirlar"}>
                {liste.map((u) => {
                  const fl = fiyatlar(u, et);
                  if (fotografli) {
                    return (
                      <article key={u.id} className={`qt-kart${u.tukendi ? " tukendi" : ""}`}>
                        <div className="qt-gorsel">{u.gorsel ? <img src={u.gorsel} alt="" loading="lazy" /> : <span>{(yaz(u.ad, u.ad_en) || "?").charAt(0)}</span>}</div>
                        <div className="qt-kart-metin">
                          <h3>{yaz(u.ad, u.ad_en)}</h3>
                          <div className="qt-isaret">{isaretler(u)}</div>
                          {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
                          <div className="qt-kart-fiyat">{fl.map((x) => <span key={x.e || "f"}>{x.e && et.length > 1 ? <small>{olcuAdi(x.e)}</small> : null}{fiyatYaz(x.f)}</span>)}</div>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article key={u.id} className={`qt-satir${u.tukendi ? " tukendi" : ""}`}>
                      {u.gorsel && <img src={u.gorsel} alt="" loading="lazy" />}
                      <div className="qt-satir-metin">
                        <div className="qt-satir-ust">
                          <h3>{yaz(u.ad, u.ad_en)}</h3>
                          {!sutunlu && <><i className="qt-nokta" aria-hidden="true" /><b className="qt-fiyat">{fl.map((x) => fiyatYaz(x.f)).join(" / ")}</b></>}
                          {sutunlu && <span className="qt-sutunlar">{et.map((e, i) => { const f = fiyatAl(u, i); return <b key={e}>{f === null || f === undefined || f === "" ? "–" : fiyatYaz(f)}</b>; })}</span>}
                        </div>
                        <div className="qt-isaret">{isaretler(u)}</div>
                        {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        {yaz(menu.alerjen_notu, menu.alerjen_notu_en) && <p className="qm-alerjen-notu">{yaz(menu.alerjen_notu, menu.alerjen_notu_en)}</p>}
      </div>
      <Alt menu={menu} yaz={yaz} />
    </main>
  );
}

function Logo({ menu, buyuk }) {
  return (
    <div className={`qm-logo${buyuk ? " buyuk" : ""}`}>
      {menu.logo ? <img src={menu.logo} alt={menu.ad} /> : (
        <>
          <span className="qm-logo-ad">{menu.ad}</span>
          {menu.alt_yazi && <span className="qm-logo-alt">{menu.alt_yazi}</span>}
        </>
      )}
    </div>
  );
}

function Alt({ menu, yaz }) {
  return (
    <footer className="qm-alt">
      {(menu.instagram || menu.adres || menu.telefon) && (
        <div className="qm-iletisim">
          {menu.instagram && <a href={`https://instagram.com/${menu.instagram.replace(/^@/, "")}`} target="_blank" rel="noopener">@{menu.instagram.replace(/^@/, "")}</a>}
          {menu.telefon && <a href={`tel:+${telLink(menu.telefon)}`}>{menu.telefon}</a>}
          {menu.adres && <span>{menu.adres}</span>}
        </div>
      )}
      <a className="qm-imza" href="https://panormosmedya.com" target="_blank" rel="noopener">{yaz("Dijital menü", "Digital menu")}: <b>panormos medya</b></a>
    </footer>
  );
}

const QM_CSS = `
.qm{min-height:100vh;background:var(--zemin);color:#26211e;font-family:var(--govde);-webkit-font-smoothing:antialiased;padding-bottom:96px}
.qm *{box-sizing:border-box;margin:0;padding:0}
.qm button{font:inherit;cursor:pointer;background:none;border:none;color:inherit}
.qm a{color:inherit;text-decoration:none}

/* Dil anahtarı: TR | EN hap */
.qm-dil{display:inline-flex;padding:3px;border-radius:100px;border:1px solid color-mix(in srgb,var(--ana) 35%,transparent);background:rgba(255,255,255,.45)}
.qm-dil button{font-family:var(--govde);font-size:12px;font-weight:700;letter-spacing:.08em;padding:5px 11px;border-radius:100px;color:color-mix(in srgb,var(--ana) 70%,#555)}
.qm-dil button.secili{background:var(--ana);color:#fff}

/* Giriş */
.qm-giris{max-width:380px;margin:0 auto;padding:18px 18px 10px;display:flex;flex-direction:column;align-items:center}
.qm-ust-cubuk{width:100%;display:flex;justify-content:flex-end;min-height:34px;margin-bottom:22px}
.qm-logo{display:flex;flex-direction:column;align-items:center;color:var(--ana);text-align:center}
.qm-logo img{max-height:40px;max-width:140px;object-fit:contain}
.qm-logo.buyuk{width:132px;height:132px;border-radius:50%;justify-content:center;border:1.5px solid color-mix(in srgb,var(--ana) 45%,transparent);box-shadow:0 0 0 7px var(--zemin),0 0 0 8px color-mix(in srgb,var(--ana) 22%,transparent);background:rgba(255,255,255,.35)}
.qm-logo.buyuk img{max-height:92px;max-width:112px}
.qm-logo-ad{font-family:var(--urun);font-weight:600;font-size:18px;letter-spacing:.04em;line-height:1.05}
.qm-logo.buyuk .qm-logo-ad{font-size:26px;padding:0 10px}
.qm-logo-alt{font-family:var(--govde);font-size:10px;letter-spacing:.22em;text-transform:uppercase;margin-top:3px;opacity:.85}
.qm-logo.buyuk .qm-logo-alt{font-size:11px;margin-top:6px}
.qm-susleme{display:flex;align-items:center;gap:10px;color:var(--ana);font-size:12px;margin:26px 0 10px;opacity:.8}
.qm-susleme span{width:44px;height:1px;background:currentColor}
.qm-hosgeldin{font-family:var(--urun);font-weight:500;font-style:italic;font-size:16.5px;color:var(--ana);margin-bottom:22px;text-align:center}
.qm-kartlar{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qm .qm-kart{position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;min-height:98px;padding:13px 12px 12px;border-radius:60px 60px 12px 12px;background:rgba(255,255,255,.55);border:1px solid color-mix(in srgb,var(--ana) 22%,transparent);transition:transform .2s,background .2s,box-shadow .2s}
.qm .qm-kart:hover,.qm .qm-kart:active{transform:translateY(-3px);background:#fff;box-shadow:0 10px 24px -14px color-mix(in srgb,var(--ana) 80%,transparent)}
.qm-kart .qm-no{align-self:center;margin-bottom:10px}
.qm-no{font-family:var(--govde);font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--ana);opacity:.7}
.qm-kart strong{font-family:var(--urun);font-weight:600;font-size:16.5px;line-height:1.15;color:#26211e}
.qm-kart small{font-size:10.5px;letter-spacing:.06em;color:#7a716b;margin-top:3px}
.qm-ok{position:absolute;right:14px;bottom:12px;color:var(--ana);font-size:16px;transition:transform .2s}
.qm-kart:hover .qm-ok{transform:translateX(3px)}
.qm-kartlar .qm-bos{grid-column:1/-1}
.qm-bolum{width:100%;margin-bottom:26px}
.qm-bolum-baslik{display:flex;align-items:center;gap:12px;font-family:var(--govde);font-size:12px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--ana);margin:4px 0 14px}
.qm-bolum-baslik span{flex:1;height:1px;background:color-mix(in srgb,var(--ana) 25%,transparent)}
.qm-bos{text-align:center;color:#777;font-size:14px;padding:20px 0}

/* Kategori sayfası */
.qm-sayfa{max-width:430px;margin:0 auto}
.qm-ust{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;background:color-mix(in srgb,var(--zemin) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.qm-geri{width:40px;height:40px;border-radius:50%;border:1px solid color-mix(in srgb,var(--ana) 35%,transparent)!important;color:var(--ana)!important;font-size:18px}
.qm-sekmeler{display:flex;gap:18px;overflow-x:auto;padding:4px 20px 0;border-bottom:1px solid color-mix(in srgb,var(--ana) 15%,transparent);scrollbar-width:none;position:sticky;top:60px;z-index:4;background:color-mix(in srgb,var(--zemin) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.qm-sekmeler::-webkit-scrollbar{display:none}
.qm-sekmeler button{flex:0 0 auto;font-family:var(--govde);font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:10px 0 11px;color:#8b827c;border-bottom:2px solid transparent!important;white-space:nowrap}
.qm-sekme-ayrac{flex:0 0 1px;align-self:center;height:16px;background:color-mix(in srgb,var(--ana) 30%,transparent)}
.qm-sekmeler button.secili{color:var(--ana);border-bottom-color:var(--ana)!important}
.qm-kagit{padding:22px 24px 6px}
.qm-kagit-bolum{text-align:center;font-family:var(--kbaslik);font-weight:500;font-size:13px;letter-spacing:.32em;text-transform:uppercase;color:color-mix(in srgb,var(--ana) 75%,#777);margin:2px 0 22px}
.qm-kb{margin-bottom:30px}
.qm-kb h2{font-family:var(--kbaslik);font-weight:500;font-size:23px;line-height:1.1;letter-spacing:.01em;color:var(--ana);margin-bottom:14px}
.qm-kb h2 small{font-size:.7em;letter-spacing:.02em}
.qm-kb-aciklama{font-size:11.5px;color:#7a716b;margin:-8px 0 12px;font-style:italic}
.qm-kb-olcu{display:flex;justify-content:flex-end;margin:-4px 0 6px}
.qm-kb-olcu span{flex:0 0 var(--sutun);width:var(--sutun);padding-left:8px;box-sizing:border-box;text-align:right;font-family:var(--govde);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ana)}
.qm-kb-olcu span.bos{flex:1;text-align:left;font-weight:500;color:#9a918b}
.qm-u{display:flex;align-items:flex-start;gap:12px;padding:6px 0 7px}
.qm-u img{width:46px;height:46px;object-fit:cover;flex-shrink:0;border-radius:6px}
.qm-u-metin{flex:1;min-width:0}
.qm-u h3{font-family:var(--urun);font-weight:700;font-size:13.5px;line-height:1.3;color:var(--ana)}
.qm-u p{font-family:var(--govde);font-size:11px;line-height:1.4;color:color-mix(in srgb,var(--ana) 55%,#5a524d);margin-top:1px}
.qm-u-fiyat{display:flex;flex-shrink:0;font-family:var(--govde);font-size:13.5px;font-weight:500;color:var(--ana);padding-top:1px}
.qm-u-fiyat span{white-space:nowrap;text-align:right}
.qm-u-fiyat.sutunlu span{flex:0 0 var(--sutun);width:var(--sutun);font-size:13px;padding-left:8px;box-sizing:border-box}
.qm-u-fiyat span.bos{opacity:.35}
.qm-kb.cok .qm-kb-olcu span:not(.bos),.qm-kb.cok .qm-u-fiyat span{text-align:center;padding-left:0}
.qm-kb.cok .qm-kb-olcu span:not(.bos){font-size:8.5px;letter-spacing:0}
.qm-kb.cok .qm-u-fiyat span{font-size:11.5px;letter-spacing:-.02em}
.qm-u.tukendi h3,.qm-u.tukendi p,.qm-u.tukendi .qm-u-fiyat{opacity:.45}
.qm-alerjen{font-family:var(--govde);font-weight:500;font-size:9.5px;letter-spacing:.04em;color:color-mix(in srgb,var(--ana) 70%,#888);margin-left:6px;white-space:nowrap}
.qm-etiket{display:inline-block;font-style:normal;font-family:var(--govde);font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--ana);padding:2px 6px;border-radius:3px;margin-left:6px;vertical-align:2px}
.qm-etiket.tukendi{background:#9a9390}
.qm-alerjen-notu{margin-top:30px;padding-top:16px;border-top:1px solid color-mix(in srgb,var(--ana) 15%,transparent);font-size:11px;line-height:1.7;color:#8b827c;text-align:center}

/* Alt bilgi ve alttaki düğmeler */
.qm-alt{text-align:center;padding:30px 18px 10px;font-size:12px;color:#7a716b}
.qm-iletisim{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
.qm-iletisim a{color:var(--ana);font-weight:500}
.qm-imza{font-size:11px;opacity:.75;letter-spacing:.03em}
.qm-imza b{font-weight:700}
.qm-alt-dugmeler{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10;display:flex;gap:8px;padding:6px;border-radius:100px;background:color-mix(in srgb,var(--zemin) 80%,#fff);box-shadow:0 10px 30px -10px rgba(0,0,0,.35);border:1px solid color-mix(in srgb,var(--ana) 15%,transparent)}
.qm-alt-dugmeler a{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:100px;background:var(--ana);color:#fff;font-size:13px;font-weight:700;white-space:nowrap}
.qm-alt-dugmeler a.wa{background:#25D366}
.qm-alt-dugmeler svg{width:17px;height:17px}
.qm-giris,.qm-sayfa{background:var(--zemin)}
/* Gece şablonu: zarif düzen, koyu zemin (bar ve kokteyl mekânları); ana renk açık bir vurgu rengi olmalı (ör. altın) */
.qm-gece{color:#ece6df}
.qm-gece .qm-kart{background:rgba(255,255,255,.04)}
.qm-gece .qm-kart:hover,.qm-gece .qm-kart:active{background:rgba(255,255,255,.09)}
.qm-gece .qm-kart strong{color:#f4efe8}
.qm-gece .qm-kart small,.qm-gece .qm-bos,.qm-gece .qm-kb-aciklama,.qm-gece .qm-alt,.qm-gece .qm-alerjen-notu,.qm-gece .qm-kb-olcu span.bos{color:#a39a92}
.qm-gece .qm-u p{color:#b3aaa2}
.qm-gece .qm-sekmeler button{color:#9b928a}
.qm-gece .qm-dil,.qm-gece .qm-logo.buyuk{background:rgba(255,255,255,.05)}
.qm-gece .qm-dil button{color:#cfc6bd}
.qm-gece .qm-dil button.secili,.qm-gece .qm-etiket,.qm-gece .qm-alt-dugmeler a{color:#14110f}
.qm-gece .qm-alt-dugmeler a.wa{color:#fff}
.qm-gece .qm-alt-dugmeler{background:color-mix(in srgb,var(--zemin) 85%,#fff)}
@media (min-width:520px){
  .qm{background:color-mix(in srgb,var(--zemin) 88%,var(--ana))}
  .qm-giris,.qm-sayfa{min-height:100vh;box-shadow:0 0 0 1px color-mix(in srgb,var(--ana) 12%,transparent),0 20px 60px -30px rgba(0,0,0,.35)}
}
@media (min-width:1000px){
  .qm-genis .qm-giris{max-width:1000px}
  .qm-genis .qm-kartlar{grid-template-columns:repeat(4,1fr);gap:14px}
  .qm-genis .qm-kart strong{font-size:19px}
  .qm-genis .qm-sayfa{max-width:1180px}
  .qm-genis .qm-kagit{column-count:2;column-gap:64px;padding:34px 48px 10px}
  .qm-genis .qm-kagit-bolum{column-span:all}
  .qm-genis .qm-kb h2,.qm-genis .qm-kb-olcu{break-after:avoid}
  .qm-genis .qm-u{break-inside:avoid}
  .qm-genis .qm-alerjen-notu{column-span:all}
  .qm-genis .qm-sekmeler{justify-content:center;flex-wrap:wrap}
}
@media (max-width:360px){.qm-kartlar{grid-template-columns:1fr}.qm-alt-dugmeler a{padding:10px 12px;font-size:12px}}
`;

const QT_CSS = `
.qt{max-width:480px;margin:0 auto;background:var(--zemin);min-height:100vh}
.qt-kapak{position:relative;display:flex;flex-direction:column;align-items:center;padding:14px 18px 26px;background:color-mix(in srgb,var(--ana) 9%,var(--zemin));background-size:cover;background-position:center}
.qt-kapak-ust{width:100%;display:flex;justify-content:flex-end;min-height:34px;margin-bottom:10px}
.qt-adres{margin-top:14px;font-size:12px;color:#7a716b;text-align:center}
.qt-foto .qt-kapak{padding:14px 18px 34px;color:#fff;background-color:var(--ana)}
.qt-foto .qt-kapak .qm-logo{color:#fff}
.qt-foto .qt-kapak .qm-logo.buyuk{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.6);box-shadow:none;backdrop-filter:blur(4px)}
.qt-foto .qt-adres{color:rgba(255,255,255,.85)}
.qt-foto .qm-dil{background:rgba(255,255,255,.85)}
.qt-cubuk{position:sticky;top:0;z-index:5;padding:10px 14px 0;background:color-mix(in srgb,var(--zemin) 94%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid color-mix(in srgb,var(--ana) 14%,transparent)}
.qt-ara{display:flex;align-items:center;gap:8px;padding:0 12px;height:40px;border-radius:12px;background:#fff;border:1px solid color-mix(in srgb,var(--ana) 18%,transparent);color:#8b827c}
.qt-ara svg{width:17px;height:17px;flex-shrink:0}
.qt-ara input{flex:1;min-width:0;border:none;outline:none;background:none;font:inherit;font-size:14px;color:#26211e}
.qt-sekmeler{display:flex;gap:8px;overflow-x:auto;padding:10px 0;scrollbar-width:none}
.qt-sekmeler::-webkit-scrollbar{display:none}
.qt .qt-sekmeler button{flex:0 0 auto;padding:8px 14px;border-radius:100px;font-size:13px;font-weight:700;white-space:nowrap;background:#fff;color:#5d5650;border:1px solid color-mix(in srgb,var(--ana) 16%,transparent)}
.qt .qt-sekmeler button.secili{background:var(--ana);color:#fff;border-color:var(--ana)}
.qt-govde{padding:6px 16px 4px}
.qt-kat{padding-top:18px}
.qt-bolum{margin:10px 0 4px;font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:color-mix(in srgb,var(--ana) 75%,#777)}
.qt-kat h2{font-family:var(--kbaslik);font-size:22px;font-weight:700;color:var(--ana);margin-bottom:10px}
.qt-kat h2 small{font-size:.6em;font-weight:600;color:#8b827c}
.qt-kat-aciklama{font-size:12px;color:#7a716b;margin:-6px 0 10px;font-style:italic}
.qt-isaret:empty{display:none}
.qt-isaret{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:3px}
.qt-isaret .qm-etiket,.qt-isaret .qm-alerjen{margin-left:0}
/* Klasik liste */
.qt-satirlar{display:flex;flex-direction:column}
.qt-satir{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed color-mix(in srgb,var(--ana) 18%,transparent)}
.qt-satir:last-child{border-bottom:none}
.qt-satir img{width:58px;height:58px;border-radius:10px;object-fit:cover;flex-shrink:0}
.qt-satir-metin{flex:1;min-width:0}
.qt-satir-ust{display:flex;align-items:baseline;gap:8px}
.qt-satir h3{font-family:var(--urun);font-size:15px;font-weight:700;color:#26211e;line-height:1.3}
.qt-nokta{flex:1;min-width:12px;border-bottom:2px dotted color-mix(in srgb,var(--ana) 30%,transparent);transform:translateY(-4px)}
.qt-fiyat{flex-shrink:0;font-size:15px;font-weight:800;color:var(--ana);white-space:nowrap}
.qt-satir p{font-size:12.5px;line-height:1.45;color:#7a716b;margin-top:3px}
.qt-olcu{display:flex;justify-content:flex-end;gap:0;margin:-4px 0 2px}
.qt-olcu span,.qt-sutunlar b{width:66px;text-align:right;flex-shrink:0}
.qt-olcu span{font-size:10px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--ana)}
.qt-sutunlar{display:flex;margin-left:auto}
.qt-sutunlar b{font-size:13.5px;font-weight:800;color:var(--ana);white-space:nowrap}
.qt-satir-ust:has(.qt-sutunlar) h3{flex:1}
.qt-satir.tukendi h3,.qt-satir.tukendi p,.qt-satir.tukendi .qt-fiyat,.qt-satir.tukendi img{opacity:.45}
/* Fotoğraflı kartlar */
.qt-kartlar{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.qt-kart{display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 6px 18px -12px rgba(0,0,0,.35);border:1px solid color-mix(in srgb,var(--ana) 10%,transparent)}
.qt-gorsel{aspect-ratio:4/3;background:color-mix(in srgb,var(--ana) 14%,#fff);display:flex;align-items:center;justify-content:center}
.qt-gorsel img{width:100%;height:100%;object-fit:cover;display:block}
.qt-gorsel span{font-family:var(--kbaslik);font-size:34px;font-weight:700;color:color-mix(in srgb,var(--ana) 55%,#fff)}
.qt-kart-metin{display:flex;flex-direction:column;flex:1;padding:10px 11px 12px}
.qt-kart h3{font-family:var(--urun);font-size:14px;font-weight:700;line-height:1.25;color:#26211e}
.qt-kart p{font-size:11.5px;line-height:1.4;color:#7a716b;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.qt-kart-fiyat{margin-top:auto;padding-top:8px;display:flex;flex-wrap:wrap;gap:4px 10px}
.qt-kart-fiyat span{font-size:15px;font-weight:800;color:var(--ana);white-space:nowrap}
.qt-kart-fiyat small{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8b827c;margin-right:4px}
.qt-kart.tukendi{opacity:.55}
@media (min-width:1000px){
  .qm-genis .qt{max-width:1100px}
  .qm-genis .qt-kartlar{grid-template-columns:repeat(4,1fr)}
  .qm-genis .qt-satirlar{display:grid;grid-template-columns:1fr 1fr;column-gap:48px}
}
`;
