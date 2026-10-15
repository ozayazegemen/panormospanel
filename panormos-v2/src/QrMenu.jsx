import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// Restoran ve barların dijital menüsü: panormosmedya.com/m/<slug>
// Masadaki QR kod buraya açılır. Giriş ekranında kategori düğmeleri, kategoriye girince ürünler, fiyatlar ve alerjenler.
// Menü panelden (QR Menü bölümü) yönetilir; fiyat değişince menü anında güncellenir, PDF gerekmez.

const YAZI_TIPLERI = {
  zarif: { baslik: "'Barlow Condensed', 'Arial Narrow', sans-serif", urun: "'Lora', Georgia, serif", govde: "'Lora', Georgia, serif", link: "family=Barlow+Condensed:wght@600;700&family=Lora:ital,wght@0,400;0,500;0,600;1,400" },
  modern: { baslik: "'Manrope', sans-serif", urun: "'Manrope', sans-serif", govde: "'Manrope', sans-serif", link: "family=Manrope:wght@400;500;600;700;800" },
  eglenceli: { baslik: "'Unbounded', sans-serif", urun: "'Manrope', sans-serif", govde: "'Manrope', sans-serif", link: "family=Unbounded:wght@600;800&family=Manrope:wght@400;500;600;700;800" },
};

const ALERJEN_ADLARI = { G: "Gluten", D: "Süt ürünleri", N: "Kuruyemiş", V: "Vejetaryen", VG: "Vegan", SF: "Kabuklu deniz ürünleri", ALC: "Alkol", SSM: "Susam" };

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
    setSecili(id); window.scrollTo(0, 0);
  };
  const kategori = kategoriler.find((k) => k.id === secili);
  const kategoriUrunleri = useMemo(() => urunler.filter((u) => u.kategori_id === secili), [urunler, secili]);

  if (menu === undefined) return <div style={{ minHeight: "100vh", background: "#F3F1EC" }} />;
  if (menu === null) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F3F1EC", fontFamily: "Georgia, serif", color: "#3a3a3a", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 22, marginBottom: 8 }}>Menü bulunamadı</div><div style={{ fontSize: 14, opacity: .7 }}>Bağlantı değişmiş ya da menü yayından kaldırılmış olabilir.</div></div>
      </div>
    );
  }

  const ana = menu.ana_renk, zemin = menu.zemin_renk;
  const etiketler = String(kategori?.fiyat_etiketleri || "").split(/[,|/]/).map((s) => s.trim()).filter(Boolean);
  const wa = menu.whatsapp ? `https://wa.me/${telLink(menu.whatsapp)}` : "";
  const rez = menu.rezervasyon ? (/^https?:/i.test(menu.rezervasyon) ? menu.rezervasyon : `tel:+${telLink(menu.rezervasyon)}`) : "";

  return (
    <div className="qm" style={{ "--ana": ana, "--zemin": zemin, "--baslik": tip.baslik, "--urun": tip.urun, "--govde": tip.govde }}>
      <style>{QM_CSS}</style>

      {!kategori ? (
        <main className="qm-giris">
          {menu.iki_dil && (
            <div className="qm-dil">
              <button className={dil !== "en" ? "secili" : ""} onClick={() => dilSec("tr")}><BayrakTR />Türkçe</button>
              <span aria-hidden="true">|</span>
              <button className={dil === "en" ? "secili" : ""} onClick={() => dilSec("en")}><BayrakEN />English</button>
            </div>
          )}
          <Logo menu={menu} buyuk />
          <h1 className="gizli">{yaz("Menü", "Menu")}</h1>
          <nav className="qm-kategoriler">
            {kategoriler.map((k) => (
              <button key={k.id} onClick={() => git(k.id)}>
                <strong>{yaz(k.ad, k.ad_en).toLocaleUpperCase(en ? "en" : "tr")}</strong>
                {menu.iki_dil && k.ad_en && <small>{(en ? k.ad : k.ad_en).toLocaleUpperCase(en ? "tr" : "en")}</small>}
              </button>
            ))}
            {kategoriler.length === 0 && <p className="qm-bos">{yaz("Menü hazırlanıyor.", "The menu is being prepared.")}</p>}
          </nav>
          <Alt menu={menu} yaz={yaz} />
        </main>
      ) : (
        <main className="qm-sayfa">
          <header className="qm-ust">
            <button className="qm-geri" onClick={() => git("")} aria-label={yaz("Menüye dön", "Back to menu")}>‹ <span>{yaz("Menü", "Menu")}</span></button>
            <Logo menu={menu} />
            {menu.iki_dil ? <button className="qm-dil-kucuk" onClick={() => dilSec(en ? "tr" : "en")}>{en ? "TR" : "EN"}</button> : <span style={{ width: 44 }} />}
          </header>
          <div className="qm-sekmeler">
            {kategoriler.map((k) => (
              <button key={k.id} className={k.id === secili ? "secili" : ""} onClick={() => git(k.id)}>{yaz(k.ad, k.ad_en)}</button>
            ))}
          </div>
          <section className="qm-kagit">
            <h2>{yaz(kategori.ad, kategori.ad_en).toLocaleUpperCase(en ? "en" : "tr")}</h2>
            {yaz(kategori.aciklama, kategori.aciklama_en) && <p className="qm-kat-aciklama">{yaz(kategori.aciklama, kategori.aciklama_en)}</p>}
            {etiketler.length > 1 && (
              <div className="qm-fiyat-baslik"><span />{etiketler.slice(0, 2).map((e) => <span key={e}>{e}</span>)}</div>
            )}
            {kategoriUrunleri.map((u) => (
              <article key={u.id} className={`qm-urun${u.tukendi ? " tukendi" : ""}`}>
                {u.gorsel && <img src={u.gorsel} alt="" loading="lazy" />}
                <div className="qm-urun-metin">
                  <h3>
                    {yaz(u.ad, u.ad_en)}
                    {(u.alerjenler || []).length > 0 && <span className="qm-alerjen" title={(u.alerjenler || []).map((a) => ALERJEN_ADLARI[a] || a).join(", ")}>{u.alerjenler.map((a) => `( ${a} )`).join(" ")}</span>}
                    {u.etiket && <em className="qm-etiket">{u.etiket}</em>}
                    {u.tukendi && <em className="qm-etiket tukendi">{yaz("Tükendi", "Sold out")}</em>}
                  </h3>
                  {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
                </div>
                <div className="qm-fiyatlar">
                  <span>{fiyatYaz(u.fiyat)}</span>
                  {(u.fiyat2 !== null && u.fiyat2 !== undefined && u.fiyat2 !== "") && <span>{fiyatYaz(u.fiyat2)}</span>}
                </div>
              </article>
            ))}
            {kategoriUrunleri.length === 0 && <p className="qm-bos">{yaz("Bu bölümde henüz ürün yok.", "No items in this section yet.")}</p>}
            {yaz(menu.alerjen_notu, menu.alerjen_notu_en) && <p className="qm-alerjen-notu">{yaz(menu.alerjen_notu, menu.alerjen_notu_en)}</p>}
          </section>
          <Alt menu={menu} yaz={yaz} />
        </main>
      )}

      {(rez || wa) && (
        <div className="qm-yan">
          {rez && <a href={rez} target={rez.startsWith("http") ? "_blank" : undefined} rel="noopener" aria-label={yaz("Rezervasyon", "Reservation")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg><span>{yaz("Rezervasyon", "Reservation")}</span></a>}
          {wa && <a href={wa} target="_blank" rel="noopener" aria-label="WhatsApp"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" /></svg><span>WhatsApp</span></a>}
        </div>
      )}
    </div>
  );
}

function BayrakTR() {
  return <svg className="bayrak" viewBox="0 0 30 20" aria-hidden="true"><rect width="30" height="20" fill="#E30A17" /><circle cx="11" cy="10" r="5" fill="#fff" /><circle cx="12.3" cy="10" r="4" fill="#E30A17" /><path d="M16.2 10l3.9-1.3-2.4 3.3V8l2.4 3.3z" fill="#fff" /></svg>;
}
function BayrakEN() {
  return <svg className="bayrak" viewBox="0 0 60 30" aria-hidden="true"><clipPath id="qm-uk"><path d="M0 0v30h60V0z" /></clipPath><g clipPath="url(#qm-uk)"><path d="M0 0v30h60V0z" fill="#012169" /><path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" /><path d="M0 0l60 30m0-30L0 30" stroke="#C8102E" strokeWidth="2.5" /><path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" /><path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" /></g></svg>;
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
.qm{min-height:100vh;background:var(--zemin);color:#2b2522;font-family:var(--govde);-webkit-font-smoothing:antialiased;padding-bottom:30px}
.qm *{box-sizing:border-box;margin:0;padding:0}
.qm button{font:inherit;cursor:pointer;background:none;border:none;color:inherit}
.qm a{color:inherit;text-decoration:none}
.qm .gizli{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}

/* Giriş: kategori düğmeleri */
.qm-giris{max-width:420px;margin:0 auto;padding:34px 22px 10px;display:flex;flex-direction:column;align-items:center}
.qm-dil{display:flex;align-items:center;gap:12px;font-family:var(--baslik);font-size:15px;color:#555;margin-bottom:28px}
.qm-dil button{display:inline-flex;align-items:center;gap:7px;opacity:.75}
.qm-dil button.secili{opacity:1;font-weight:700;color:var(--ana)}
.qm .bayrak{display:inline-block;width:20px;height:13px;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.08)}
.qm-logo{display:flex;flex-direction:column;align-items:center;color:var(--ana);text-align:center}
.qm-logo img{max-height:46px;max-width:150px;object-fit:contain}
.qm-logo.buyuk{margin-bottom:26px}
.qm-logo.buyuk img{max-height:96px;max-width:220px}
.qm-logo-ad{font-family:var(--urun);font-size:20px;letter-spacing:.06em;line-height:1.1}
.qm-logo.buyuk .qm-logo-ad{font-size:40px;letter-spacing:.08em}
.qm-logo-alt{font-family:var(--urun);font-size:12px;margin-top:2px}
.qm-logo.buyuk .qm-logo-alt{font-size:17px;margin-top:4px}
.qm-kategoriler{width:100%;max-width:260px;display:flex;flex-direction:column;gap:9px}
.qm-kategoriler button{display:flex;flex-direction:column;align-items:center;gap:2px;padding:13px 10px;border:1px solid color-mix(in srgb,var(--ana) 45%,#C9A46A);background:rgba(255,255,255,.35);transition:background .2s,color .2s}
.qm-kategoriler button strong{font-family:var(--baslik);font-weight:700;font-size:17px;letter-spacing:.02em;color:#2b2522}
.qm-kategoriler button small{font-size:11.5px;letter-spacing:.06em;color:#666;font-family:var(--govde)}
.qm-kategoriler button:hover,.qm-kategoriler button:active{background:var(--ana)}
.qm-kategoriler button:hover strong,.qm-kategoriler button:hover small,.qm-kategoriler button:active strong,.qm-kategoriler button:active small{color:#fff}
.qm-bos{text-align:center;color:#777;font-size:14px;padding:20px 0}

/* Kategori sayfası */
.qm-sayfa{max-width:560px;margin:0 auto}
.qm-ust{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;background:var(--zemin);border-bottom:1px solid color-mix(in srgb,var(--ana) 18%,transparent)}
.qm-geri{display:flex;align-items:center;gap:4px;font-size:26px;line-height:1;color:var(--ana);min-width:70px}
.qm-geri span{font-family:var(--baslik);font-size:14px;letter-spacing:.04em;text-transform:uppercase}
.qm-dil-kucuk{min-width:44px;height:30px;border:1px solid var(--ana)!important;color:var(--ana)!important;font-family:var(--baslik)!important;font-weight:700;font-size:13px;border-radius:2px}
.qm-sekmeler{display:flex;gap:8px;overflow-x:auto;padding:12px 16px;scrollbar-width:none}
.qm-sekmeler::-webkit-scrollbar{display:none}
.qm-sekmeler button{flex:0 0 auto;font-family:var(--baslik);font-size:14px;font-weight:600;letter-spacing:.02em;padding:7px 14px;border:1px solid color-mix(in srgb,var(--ana) 40%,#C9A46A);white-space:nowrap}
.qm-sekmeler button.secili{background:var(--ana);color:#fff;border-color:var(--ana)}
.qm-kagit{margin:4px 14px 0;background:color-mix(in srgb,var(--zemin) 70%,#fff);padding:28px 22px 26px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 10px 30px -18px rgba(0,0,0,.25)}
.qm-kagit h2{font-family:var(--urun);font-weight:500;font-size:15px;letter-spacing:.18em;color:var(--ana);margin-bottom:20px}
.qm-kat-aciklama{font-size:13px;color:#6b625c;margin:-10px 0 18px;font-style:italic}
.qm-fiyat-baslik{display:grid;grid-template-columns:1fr 64px 64px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ana);margin-bottom:8px;text-align:right}
.qm-urun{display:flex;gap:12px;align-items:flex-start;padding:10px 0 12px}
.qm-urun img{width:62px;height:62px;object-fit:cover;flex-shrink:0;border-radius:4px}
.qm-urun-metin{flex:1;min-width:0}
.qm-urun h3{font-family:var(--urun);font-weight:500;font-size:17px;line-height:1.3;color:#2b2522}
.qm-alerjen{font-family:var(--govde);font-size:10.5px;letter-spacing:.04em;color:var(--ana);margin-left:6px;white-space:nowrap}
.qm-etiket{display:inline-block;font-style:normal;font-family:var(--govde);font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#fff;background:var(--ana);padding:2px 7px;margin-left:6px;vertical-align:2px;border-radius:2px}
.qm-etiket.tukendi{background:#8a8a8a}
.qm-urun p{font-size:13.5px;line-height:1.45;color:#5a524d;margin-top:3px}
.qm-fiyatlar{display:flex;gap:10px;flex-shrink:0;font-family:var(--urun);font-size:15px;color:var(--ana);padding-top:2px}
.qm-fiyatlar span{min-width:54px;text-align:right}
.qm-urun.tukendi h3,.qm-urun.tukendi p,.qm-urun.tukendi .qm-fiyatlar{opacity:.5}
.qm-alerjen-notu{margin-top:26px;font-size:11px;line-height:1.6;color:var(--ana);text-align:center;opacity:.85}

/* Alt bilgi ve yan düğmeler */
.qm-alt{text-align:center;padding:30px 20px 10px;font-size:12.5px;color:#6b625c}
.qm-iletisim{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
.qm-iletisim a{color:var(--ana)}
.qm-imza{font-size:11px;opacity:.7;letter-spacing:.03em}
.qm-imza b{font-weight:700}
.qm-yan{position:fixed;left:0;bottom:22px;z-index:10;display:flex;flex-direction:column;gap:10px}
.qm-yan a{display:flex;align-items:center;gap:10px;height:44px;padding:0 12px 0 13px;border-radius:0 24px 24px 0;background:var(--ana);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.2);width:48px;overflow:hidden;transition:width .25s}
.qm-yan a svg{width:22px;height:22px;flex-shrink:0}
.qm-yan a span{font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;font-family:var(--baslik);opacity:0;transition:opacity .2s}
.qm-yan a:hover span{opacity:1}
.qm-yan a:hover{width:170px}
@media (min-width:700px){.qm-kagit{margin:8px auto 0;padding:40px 46px}}
`;
