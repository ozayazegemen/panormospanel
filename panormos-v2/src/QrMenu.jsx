import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

// Restoran ve barların dijital menüsü: panormosmedya.com/m/<slug>
// Masadaki QR kod buraya açılır. Giriş ekranında kategori düğmeleri, kategoriye girince ürünler, fiyatlar ve alerjenler.
// Menü panelden (QR Menü bölümü) yönetilir; fiyat değişince menü anında güncellenir, PDF gerekmez.

const YAZI_TIPLERI = {
  zarif: { baslik: "'DM Sans', sans-serif", urun: "'Playfair Display', Georgia, serif", govde: "'DM Sans', sans-serif", link: "family=DM+Sans:wght@400;500;700&family=Playfair+Display:wght@500;600;700" },
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

  const dilAnahtari = menu.iki_dil && (
    <div className="qm-dil" role="group" aria-label="Dil / Language">
      <button className={!en ? "secili" : ""} onClick={() => dilSec("tr")}>TR</button>
      <button className={en ? "secili" : ""} onClick={() => dilSec("en")}>EN</button>
    </div>
  );

  return (
    <div className="qm" lang={en ? "en" : "tr"} style={{ "--ana": ana, "--zemin": zemin, "--baslik": tip.baslik, "--urun": tip.urun, "--govde": tip.govde }}>
      <style>{QM_CSS}</style>

      {!kategori ? (
        <main className="qm-giris">
          <div className="qm-ust-cubuk">{dilAnahtari}</div>
          <Logo menu={menu} buyuk />
          <div className="qm-susleme" aria-hidden="true"><span />✦<span /></div>
          <h1 className="qm-hosgeldin">{yaz("Menümüze hoş geldiniz", "Welcome to our menu")}</h1>
          <nav className="qm-kartlar">
            {kategoriler.map((k, i) => (
              <button key={k.id} className="qm-kart" onClick={() => git(k.id)}>
                <span className="qm-no">{String(i + 1).padStart(2, "0")}</span>
                <strong>{yaz(k.ad, k.ad_en)}</strong>
                {menu.iki_dil && k.ad_en && <small>{en ? k.ad : k.ad_en}</small>}
                <span className="qm-ok" aria-hidden="true">→</span>
              </button>
            ))}
            {kategoriler.length === 0 && <p className="qm-bos">{yaz("Menü hazırlanıyor.", "The menu is being prepared.")}</p>}
          </nav>
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
            {kategoriler.map((k) => (
              <button key={k.id} className={k.id === secili ? "secili" : ""} onClick={() => git(k.id)}>{yaz(k.ad, k.ad_en)}</button>
            ))}
          </div>
          <section className="qm-liste">
            <div className="qm-kat-baslik">
              <span className="qm-no">{String(kategoriler.findIndex((k) => k.id === secili) + 1).padStart(2, "0")}</span>
              <h2>{yaz(kategori.ad, kategori.ad_en)}</h2>
              {yaz(kategori.aciklama, kategori.aciklama_en) && <p>{yaz(kategori.aciklama, kategori.aciklama_en)}</p>}
            </div>
            {etiketler.length > 1 && (
              <div className="qm-fiyat-baslik">{etiketler.slice(0, 2).map((e) => <span key={e}>{e}</span>)}</div>
            )}
            {kategoriUrunleri.map((u) => (
              <article key={u.id} className={`qm-urun${u.tukendi ? " tukendi" : ""}`}>
                {u.gorsel && <img src={u.gorsel} alt="" loading="lazy" />}
                <div className="qm-urun-metin">
                  <div className="qm-satir">
                    <h3>{yaz(u.ad, u.ad_en)}</h3>
                    <span className="qm-nokta" aria-hidden="true" />
                    <span className="qm-fiyatlar">
                      <span>{fiyatYaz(u.fiyat)}</span>
                      {(u.fiyat2 !== null && u.fiyat2 !== undefined && u.fiyat2 !== "") && <span>{fiyatYaz(u.fiyat2)}</span>}
                    </span>
                  </div>
                  {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
                  {((u.alerjenler || []).length > 0 || u.etiket || u.tukendi) && (
                    <div className="qm-rozetler">
                      {u.etiket && <em className="qm-etiket">{u.etiket}</em>}
                      {u.tukendi && <em className="qm-etiket tukendi">{yaz("Tükendi", "Sold out")}</em>}
                      {(u.alerjenler || []).map((a) => <span key={a} className="qm-alerjen" title={ALERJEN_ADLARI[a] || a}>{a}</span>)}
                    </div>
                  )}
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
        <div className="qm-alt-dugmeler">
          {rez && <a href={rez} target={rez.startsWith("http") ? "_blank" : undefined} rel="noopener"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>{yaz("Rezervasyon", "Reservation")}</a>}
          {wa && <a href={wa} target="_blank" rel="noopener" className="wa"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" /></svg>WhatsApp</a>}
        </div>
      )}
    </div>
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
.qm-giris{max-width:460px;margin:0 auto;padding:18px 20px 10px;display:flex;flex-direction:column;align-items:center}
.qm-ust-cubuk{width:100%;display:flex;justify-content:flex-end;min-height:34px;margin-bottom:22px}
.qm-logo{display:flex;flex-direction:column;align-items:center;color:var(--ana);text-align:center}
.qm-logo img{max-height:40px;max-width:140px;object-fit:contain}
.qm-logo.buyuk{width:150px;height:150px;border-radius:50%;justify-content:center;border:1.5px solid color-mix(in srgb,var(--ana) 45%,transparent);box-shadow:0 0 0 7px var(--zemin),0 0 0 8px color-mix(in srgb,var(--ana) 22%,transparent);background:rgba(255,255,255,.35)}
.qm-logo.buyuk img{max-height:92px;max-width:112px}
.qm-logo-ad{font-family:var(--urun);font-weight:600;font-size:18px;letter-spacing:.04em;line-height:1.05}
.qm-logo.buyuk .qm-logo-ad{font-size:30px;padding:0 10px}
.qm-logo-alt{font-family:var(--govde);font-size:10px;letter-spacing:.22em;text-transform:uppercase;margin-top:3px;opacity:.85}
.qm-logo.buyuk .qm-logo-alt{font-size:11px;margin-top:6px}
.qm-susleme{display:flex;align-items:center;gap:10px;color:var(--ana);font-size:12px;margin:26px 0 10px;opacity:.8}
.qm-susleme span{width:44px;height:1px;background:currentColor}
.qm-hosgeldin{font-family:var(--urun);font-weight:500;font-style:italic;font-size:19px;color:var(--ana);margin-bottom:22px;text-align:center}
.qm-kartlar{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.qm .qm-kart{position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;min-height:112px;padding:16px 14px 14px;border-radius:70px 70px 14px 14px;background:rgba(255,255,255,.55);border:1px solid color-mix(in srgb,var(--ana) 22%,transparent);transition:transform .2s,background .2s,box-shadow .2s}
.qm .qm-kart:hover,.qm .qm-kart:active{transform:translateY(-3px);background:#fff;box-shadow:0 10px 24px -14px color-mix(in srgb,var(--ana) 80%,transparent)}
.qm-kart .qm-no{align-self:center;margin-bottom:14px}
.qm-no{font-family:var(--govde);font-size:11px;font-weight:700;letter-spacing:.14em;color:var(--ana);opacity:.7}
.qm-kart strong{font-family:var(--urun);font-weight:600;font-size:19px;line-height:1.15;color:#26211e}
.qm-kart small{font-size:11.5px;letter-spacing:.06em;color:#7a716b;margin-top:3px}
.qm-ok{position:absolute;right:14px;bottom:12px;color:var(--ana);font-size:16px;transition:transform .2s}
.qm-kart:hover .qm-ok{transform:translateX(3px)}
.qm-kartlar .qm-bos{grid-column:1/-1}
.qm-bos{text-align:center;color:#777;font-size:14px;padding:20px 0}

/* Kategori sayfası */
.qm-sayfa{max-width:620px;margin:0 auto}
.qm-ust{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;background:color-mix(in srgb,var(--zemin) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.qm-geri{width:40px;height:40px;border-radius:50%;border:1px solid color-mix(in srgb,var(--ana) 35%,transparent)!important;color:var(--ana)!important;font-size:18px}
.qm-sekmeler{display:flex;gap:22px;overflow-x:auto;padding:4px 20px 0;border-bottom:1px solid color-mix(in srgb,var(--ana) 15%,transparent);scrollbar-width:none;position:sticky;top:60px;z-index:4;background:color-mix(in srgb,var(--zemin) 92%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.qm-sekmeler::-webkit-scrollbar{display:none}
.qm-sekmeler button{flex:0 0 auto;font-family:var(--govde);font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:10px 0 11px;color:#8b827c;border-bottom:2px solid transparent!important;white-space:nowrap}
.qm-sekmeler button.secili{color:var(--ana);border-bottom-color:var(--ana)!important}
.qm-liste{padding:28px 22px 10px}
.qm-kat-baslik{text-align:center;margin-bottom:26px}
.qm-kat-baslik h2{font-family:var(--urun);font-weight:600;font-size:32px;line-height:1.1;color:var(--ana);margin-top:6px}
.qm-kat-baslik p{font-size:13.5px;color:#7a716b;margin-top:8px;font-style:italic}
.qm-fiyat-baslik{display:flex;justify-content:flex-end;gap:10px;font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--ana);margin-bottom:4px}
.qm-fiyat-baslik span{min-width:58px;text-align:right}
.qm-urun{display:flex;gap:14px;align-items:flex-start;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--ana) 9%,transparent)}
.qm-urun:last-of-type{border-bottom:none}
.qm-urun img{width:68px;height:68px;object-fit:cover;flex-shrink:0;border-radius:50%;border:2px solid #fff;box-shadow:0 4px 12px -6px rgba(0,0,0,.4)}
.qm-urun-metin{flex:1;min-width:0}
.qm-satir{display:flex;align-items:baseline;gap:8px}
.qm-urun h3{font-family:var(--urun);font-weight:600;font-size:17.5px;line-height:1.25;color:#26211e}
.qm-nokta{flex:1;min-width:16px;border-bottom:2px dotted color-mix(in srgb,var(--ana) 30%,transparent);transform:translateY(-4px)}
.qm-fiyatlar{display:flex;gap:10px;flex-shrink:0;font-family:var(--govde);font-weight:700;font-size:15px;color:var(--ana)}
.qm-fiyatlar span{min-width:58px;text-align:right}
.qm-urun p{font-size:13.5px;line-height:1.5;color:#6d645e;margin-top:4px}
.qm-rozetler{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px;align-items:center}
.qm-alerjen{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 5px;border-radius:12px;font-size:9.5px;font-weight:700;letter-spacing:.03em;color:var(--ana);border:1px solid color-mix(in srgb,var(--ana) 35%,transparent);background:rgba(255,255,255,.5)}
.qm-etiket{font-style:normal;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--ana);padding:4px 9px;border-radius:12px}
.qm-etiket.tukendi{background:#9a9390}
.qm-urun.tukendi h3,.qm-urun.tukendi p,.qm-urun.tukendi .qm-fiyatlar{opacity:.45;text-decoration:line-through;text-decoration-thickness:1px}
.qm-alerjen-notu{margin-top:30px;padding-top:16px;border-top:1px solid color-mix(in srgb,var(--ana) 15%,transparent);font-size:11px;line-height:1.7;color:#8b827c;text-align:center}

/* Alt bilgi ve alttaki düğmeler */
.qm-alt{text-align:center;padding:34px 20px 10px;font-size:12.5px;color:#7a716b}
.qm-iletisim{display:flex;flex-direction:column;gap:4px;margin-bottom:16px}
.qm-iletisim a{color:var(--ana);font-weight:500}
.qm-imza{font-size:11px;opacity:.75;letter-spacing:.03em}
.qm-imza b{font-weight:700}
.qm-alt-dugmeler{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10;display:flex;gap:8px;padding:6px;border-radius:100px;background:color-mix(in srgb,var(--zemin) 80%,#fff);box-shadow:0 10px 30px -10px rgba(0,0,0,.35);border:1px solid color-mix(in srgb,var(--ana) 15%,transparent)}
.qm-alt-dugmeler a{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:100px;background:var(--ana);color:#fff;font-size:13px;font-weight:700;white-space:nowrap}
.qm-alt-dugmeler a.wa{background:#25D366}
.qm-alt-dugmeler svg{width:17px;height:17px}
@media (max-width:360px){.qm-kartlar{grid-template-columns:1fr}.qm-alt-dugmeler a{padding:10px 12px;font-size:12px}}
`;
