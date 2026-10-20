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
  const [detay, setDetay] = useState(null); // dokunulan ürün: { u, k } (büyük fotoğraf ve açıklama penceresi)
  // WhatsApp siparişi: sepet bu sekmede saklanır (sayfa yenilense de kaybolmasın); masa numarası masadaki QR'dan (?masa=4) gelir
  const masa = String(new URLSearchParams(window.location.search).get("masa") || "").replace(/[^0-9A-Za-zğüşıöçĞÜŞİÖÇ -]/g, "").slice(0, 12);
  const sepetAnahtari = `qrsepet_${slug}`;
  const [sepet, setSepet] = useState(() => { try { return JSON.parse(sessionStorage.getItem(sepetAnahtari) || "[]"); } catch (e) { return []; } });
  const [sepetAcik, setSepetAcik] = useState(false);
  const [bildirim, setBildirim] = useState("");
  useEffect(() => { try { sessionStorage.setItem(sepetAnahtari, JSON.stringify(sepet)); } catch (e) {} }, [sepet, sepetAnahtari]);
  useEffect(() => { if (!bildirim) return; const t = setTimeout(() => setBildirim(""), 1600); return () => clearTimeout(t); }, [bildirim]);

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
  const siparisAcik = !!(menu?.whatsapp_siparis && menu?.whatsapp);
  // Tasarım şablonu: zarif (kemerli kartlar + kâğıt menü), gece (zarif'in koyu zeminlisi),
  // klasik (tek sayfa liste + arama) ve fotografli (tek sayfa fotoğraflı kartlar)
  const sablon = ["zarif", "gece", "klasik", "fotografli"].includes(menu?.sablon) ? menu.sablon : "zarif";
  const tekSayfa = sablon === "klasik" || sablon === "fotografli";

  if (menu === undefined) return <div style={{ minHeight: "100vh", background: "#F3F1EC" }} />;
  const kapali = menu?.kendi_kaydi && menu?.abonelik_bitis && Math.round((Date.now() + 3 * 3600000 - new Date(menu.abonelik_bitis + "T00:00:00Z").getTime()) / 86400000) > 7;
  if (menu === null || kapali) {
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
  // Sepete ekleme: ürün + ölçü (Tek/Duble, Kadeh/Şişe) aynı satırda toplanır
  const sepeteEkle = (u, k, i = 0, adet = 1) => {
    const et = fiyatEtiketleri(k);
    const fiyat = Number(fiyatAl(u, i));
    if (!siparisAcik || u.tukendi || !(fiyat > 0)) return;
    const anahtar = `${u.id}|${i}`;
    setSepet((s) => {
      const var_ = s.find((x) => x.anahtar === anahtar);
      if (var_) return s.map((x) => (x.anahtar === anahtar ? { ...x, adet: x.adet + adet } : x));
      return [...s, { anahtar, ad: yaz(u.ad, u.ad_en), olcu: et.length > 1 ? olcuAdi(et[i]) : "", fiyat, adet }];
    });
    setBildirim(yaz("Sepete eklendi", "Added to cart"));
  };
  // Tek fiyatlı ürün kartın üstündeki + ile doğrudan eklenir; çok ölçülüde önce ölçü seçilsin diye detay açılır
  const hizliEkle = (u, k) => {
    const dolu = (fiyatEtiketleri(k).length ? fiyatEtiketleri(k) : [""]).map((_, i) => fiyatAl(u, i)).filter((f) => Number(f) > 0);
    if (dolu.length > 1) setDetay({ u, k }); else sepeteEkle(u, k, (fiyatEtiketleri(k).length ? fiyatEtiketleri(k) : [""]).findIndex((_, i) => Number(fiyatAl(u, i)) > 0));
  };
  const sepetAdet = sepet.reduce((t, x) => t + x.adet, 0);
  const sepetToplam = sepet.reduce((t, x) => t + x.adet * x.fiyat, 0);
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
        <TekSayfa menu={menu} kategoriler={kategoriler} urunler={urunler} yaz={yaz} olcuAdi={olcuAdi} dilAnahtari={dilAnahtari} fotografli={sablon === "fotografli"} ac={setDetay} hizliEkle={siparisAcik ? hizliEkle : null} />
      ) : !kategori ? (
        <main className="qm-giris">
          {menu.kapak ? (
            <div className="qm-kapak" style={{ backgroundImage: `url(${menu.kapak})` }}><div className="qm-ust-cubuk">{dilAnahtari}</div></div>
          ) : <div className="qm-ust-cubuk">{dilAnahtari}</div>}
          <div className={menu.kapak ? "qm-logo-kapakli" : ""}><Logo menu={menu} buyuk /></div>
          <div className="qm-susleme" aria-hidden="true"><span />✦<span /></div>
          <h1 className="qm-hosgeldin">{yaz("Menümüze hoş geldiniz", "Welcome to our menu")}</h1>
          {yaz(menu.duyuru, menu.duyuru_en) && <p className="qm-duyuru">{yaz(menu.duyuru, menu.duyuru_en)}</p>}
          {bolumler.map((b) => (
            <section key={b.anahtar} className="qm-bolum">
              {b.ad && <h2 className="qm-bolum-baslik"><span />{b.ad}<span /></h2>}
              <nav className="qm-kartlar">
                {b.kategoriler.map(({ k, i }) => (
                  <button key={k.id} className={`qm-kart${k.gorsel ? " gorselli" : ""}`} style={{ "--i": i }} onClick={() => git(k.id)}>
                    {k.gorsel && <span className="qm-kart-gorsel" style={{ backgroundImage: `url(${k.gorsel})` }} aria-hidden="true" />}
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
                  {k.gorsel && <div className="qm-kb-gorsel" style={{ backgroundImage: `url(${k.gorsel})` }} aria-hidden="true" />}
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
                      <article key={u.id} className={`qm-u${u.tukendi ? " tukendi" : ""}`} role="button" tabIndex={0} onClick={() => setDetay({ u, k })} onKeyDown={(e) => e.key === "Enter" && setDetay({ u, k })}>
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

      {detay && <UrunDetay {...detay} yaz={yaz} olcuAdi={olcuAdi} kapat={() => setDetay(null)} ekle={siparisAcik ? (i, adet) => { sepeteEkle(detay.u, detay.k, i, adet); setDetay(null); } : null} />}
      {siparisAcik && sepetAdet > 0 && !sepetAcik && (
        <button className={`qs-cubuk${rez || wa ? " yukari" : ""}`} onClick={() => setSepetAcik(true)}>
          <span className="qs-adet">{sepetAdet}</span>{yaz("Sepeti gör", "View cart")}<b>{fiyatYaz(sepetToplam)}</b>
        </button>
      )}
      {sepetAcik && <Sepet menu={menu} sepet={sepet} setSepet={setSepet} toplam={sepetToplam} masa={masa} yaz={yaz} en={en} kapat={() => setSepetAcik(false)} />}
      {bildirim && <div className="qs-bildirim" role="status">{bildirim}</div>}

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

function TekSayfa({ menu, kategoriler, urunler, yaz, olcuAdi, dilAnahtari, fotografli, ac, hizliEkle }) {
  const ekleDugmesi = (u, k) => hizliEkle && !u.tukendi && (
    <button className="qs-ekle" aria-label={yaz("Sepete ekle", "Add to cart")} onClick={(e) => { e.stopPropagation(); hizliEkle(u, k); }}>+</button>
  );
  const [ara, setAra] = useState("");
  const [aktif, setAktif] = useState(kategoriler[0]?.id || "");
  const q = ara.trim().toLocaleLowerCase("tr");
  const eslesir = (u) => !q || [u.ad, u.ad_en, u.aciklama, u.aciklama_en].filter(Boolean).join(" ").toLocaleLowerCase("tr").includes(q);
  const gorunen = kategoriler
    .map((k) => ({ k, liste: urunler.filter((u) => u.kategori_id === k.id && eslesir(u)) }))
    .filter((x) => x.liste.length > 0);
  // Kapak: menüdeki ilk kategorinin fotoğraflı ilk ürünü (kafede kahve, burgercide burger)
  const kapak = menu.kapak || (fotografli ? kategoriler.map((k) => urunler.find((u) => u.kategori_id === k.id && u.gorsel)).find(Boolean)?.gorsel || "" : "");

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
    <main className={`qt${fotografli || kapak ? " qt-foto" : ""}`}>
      <header className="qt-kapak" style={kapak ? { backgroundImage: `linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.62)),url(${kapak})` } : undefined}>
        <div className="qt-kapak-ust">{dilAnahtari}</div>
        <Logo menu={menu} buyuk />
        {menu.adres && <p className="qt-adres">{menu.adres}</p>}
      </header>
      {yaz(menu.duyuru, menu.duyuru_en) && <p className="qm-duyuru qt-duyuru">{yaz(menu.duyuru, menu.duyuru_en)}</p>}

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
              {k.gorsel && <div className="qt-kat-gorsel" style={{ backgroundImage: `url(${k.gorsel})` }} aria-hidden="true" />}
              <h2>{yaz(k.ad, k.ad_en)}{et.length === 1 && <small> · {olcuAdi(et[0])}</small>}</h2>
              {yaz(k.aciklama, k.aciklama_en) && <p className="qt-kat-aciklama">{yaz(k.aciklama, k.aciklama_en)}</p>}
              {sutunlu && <div className="qt-olcu">{et.map((e) => <span key={e}>{olcuAdi(e)}</span>)}</div>}
              <div className={fotografli ? "qt-kartlar" : "qt-satirlar"}>
                {liste.map((u) => {
                  const fl = fiyatlar(u, et);
                  if (fotografli) {
                    return (
                      <article key={u.id} className={`qt-kart${u.tukendi ? " tukendi" : ""}`} role="button" tabIndex={0} onClick={() => ac({ u, k })} onKeyDown={(e) => e.key === "Enter" && ac({ u, k })}>
                        <div className="qt-gorsel">{u.gorsel ? <img src={u.gorsel} alt="" loading="lazy" /> : <span>{(yaz(u.ad, u.ad_en) || "?").charAt(0)}</span>}</div>
                        <div className="qt-kart-metin">
                          <h3>{yaz(u.ad, u.ad_en)}</h3>
                          <div className="qt-isaret">{isaretler(u)}</div>
                          {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
                          <div className="qt-kart-fiyat">{fl.map((x) => <span key={x.e || "f"}>{x.e && et.length > 1 ? <small>{olcuAdi(x.e)}</small> : null}{fiyatYaz(x.f)}</span>)}{ekleDugmesi(u, k)}</div>
                        </div>
                      </article>
                    );
                  }
                  return (
                    <article key={u.id} className={`qt-satir${u.tukendi ? " tukendi" : ""}`} role="button" tabIndex={0} onClick={() => ac({ u, k })} onKeyDown={(e) => e.key === "Enter" && ac({ u, k })}>
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
                      {ekleDugmesi(u, k)}
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

// Ürüne dokununca açılan pencere: büyük fotoğraf, açıklama, bütün ölçülerin fiyatı ve alerjenlerin açık adı
function UrunDetay({ u, k, yaz, olcuAdi, kapat, ekle }) {
  const [olcu, setOlcu] = useState(() => Math.max(0, (fiyatEtiketleri(k).length ? fiyatEtiketleri(k) : [""]).findIndex((_, i) => Number(fiyatAl(u, i)) > 0)));
  const [adet, setAdet] = useState(1);
  useEffect(() => {
    const tus = (e) => { if (e.key === "Escape") kapat(); };
    window.addEventListener("keydown", tus);
    const eski = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", tus); document.body.style.overflow = eski; };
  }, [kapat]);
  const et = fiyatEtiketleri(k);
  const fiyatlar = (et.length ? et : [""]).map((e, i) => ({ e, f: fiyatAl(u, i) })).filter((x) => x.f !== null && x.f !== undefined && x.f !== "");
  return (
    <div className="qd-arka" onClick={kapat}>
      <div className="qd" role="dialog" aria-modal="true" aria-label={yaz(u.ad, u.ad_en)} onClick={(e) => e.stopPropagation()}>
        <button className="qd-kapat" onClick={kapat} aria-label={yaz("Kapat", "Close")}>✕</button>
        {u.gorsel && <img className="qd-gorsel" src={u.gorsel.replace(/w=\d+&h=\d+/, "w=1000&h=750")} alt="" />}
        <div className="qd-metin">
          <small className="qd-kat">{yaz(k.ad, k.ad_en)}</small>
          <h3>{yaz(u.ad, u.ad_en)}</h3>
          {(u.etiket || u.tukendi) && (
            <div className="qd-etiketler">
              {u.etiket && <em className="qm-etiket">{u.etiket}</em>}
              {u.tukendi && <em className="qm-etiket tukendi">{yaz("Tükendi", "Sold out")}</em>}
            </div>
          )}
          {yaz(u.aciklama, u.aciklama_en) && <p>{yaz(u.aciklama, u.aciklama_en)}</p>}
          {fiyatlar.length > 0 && (
            <div className="qd-fiyatlar">
              {fiyatlar.map((x) => <div key={x.e || "f"}><span>{x.e ? olcuAdi(x.e) : yaz("Fiyat", "Price")}</span><b>{fiyatYaz(x.f)}</b></div>)}
            </div>
          )}
          {(u.alerjenler || []).length > 0 && <p className="qd-alerjen">{yaz("İçerik bilgisi", "Allergens")}: {u.alerjenler.map((a) => ALERJEN_ADLARI[a] || a).join(", ")}</p>}
          {ekle && !u.tukendi && fiyatlar.length > 0 && (
            <div className="qd-siparis">
              {et.length > 1 && (
                <div className="qd-olcuSec">
                  {et.map((e, i) => Number(fiyatAl(u, i)) > 0 && <button key={e} className={olcu === i ? "secili" : ""} onClick={() => setOlcu(i)}>{olcuAdi(e)}</button>)}
                </div>
              )}
              <div className="qd-ekle">
                <div className="qs-sayac"><button onClick={() => setAdet((a) => Math.max(1, a - 1))} aria-label="-">−</button><span>{adet}</span><button onClick={() => setAdet((a) => Math.min(50, a + 1))} aria-label="+">+</button></div>
                <button className="qd-sepete" onClick={() => ekle(olcu, adet)}>{yaz("Sepete ekle", "Add to cart")} · {fiyatYaz(Number(fiyatAl(u, olcu)) * adet)}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Sepet: adetler, sipariş türü ve not; "WhatsApp'tan gönder" siparişi işletmenin WhatsApp'ına hazır mesaj olarak açar
function Sepet({ menu, sepet, setSepet, toplam, masa, yaz, en, kapat }) {
  const [tur, setTur] = useState("masa");
  const [masaNo, setMasaNo] = useState(masa);
  const [adres, setAdres] = useState("");
  const [isim, setIsim] = useState("");
  const [not_, setNot] = useState("");
  const [gonderildi, setGonderildi] = useState(false);
  useEffect(() => {
    const tus = (e) => { if (e.key === "Escape") kapat(); };
    window.addEventListener("keydown", tus);
    return () => window.removeEventListener("keydown", tus);
  }, [kapat]);
  const degistir = (anahtar, fark) => setSepet((s) => s.map((x) => (x.anahtar === anahtar ? { ...x, adet: x.adet + fark } : x)).filter((x) => x.adet > 0));
  const eksik = tur === "masa" ? !masaNo.trim() : tur === "paket" ? !adres.trim() : false;
  function gonder() {
    const satirlar = sepet.map((x) => `${x.adet} x ${x.ad}${x.olcu ? ` (${x.olcu})` : ""} - ${fiyatYaz(x.adet * x.fiyat)}`);
    const turYazi = tur === "masa" ? yaz(`Masa ${masaNo.trim()}`, `Table ${masaNo.trim()}`) : tur === "paket" ? yaz(`Paket servis, adres: ${adres.trim()}`, `Delivery, address: ${adres.trim()}`) : yaz("Gel-al", "Pick-up");
    const metin = [
      yaz(`Merhaba, ${menu.ad} menüsünden sipariş vermek istiyorum.`, `Hello, I would like to order from the ${menu.ad} menu.`),
      "",
      ...satirlar,
      "",
      `${yaz("Toplam", "Total")}: ${fiyatYaz(toplam)}`,
      `${yaz("Sipariş", "Order")}: ${turYazi}`,
      isim.trim() ? `${yaz("İsim", "Name")}: ${isim.trim()}` : null,
      not_.trim() ? `${yaz("Not", "Note")}: ${not_.trim()}` : null,
    ].filter((x) => x !== null).join("\n");
    window.open(`https://wa.me/${telLink(menu.whatsapp)}?text=${encodeURIComponent(metin)}`, "_blank", "noopener");
    setGonderildi(true);
  }
  return (
    <div className="qd-arka" onClick={kapat}>
      <div className="qd qs" role="dialog" aria-modal="true" aria-label={yaz("Sepet", "Cart")} onClick={(e) => e.stopPropagation()}>
        <button className="qd-kapat" onClick={kapat} aria-label={yaz("Kapat", "Close")}>✕</button>
        <div className="qd-metin">
          <h3>{yaz("Sepetiniz", "Your cart")}</h3>
          {sepet.length === 0 ? <p>{yaz("Sepetiniz boş.", "Your cart is empty.")}</p> : (
            <>
              <div className="qs-liste">
                {sepet.map((x) => (
                  <div key={x.anahtar} className="qs-satir">
                    <div><b>{x.ad}</b>{x.olcu && <small>{x.olcu}</small>}</div>
                    <div className="qs-sayac"><button onClick={() => degistir(x.anahtar, -1)} aria-label="-">−</button><span>{x.adet}</span><button onClick={() => degistir(x.anahtar, 1)} aria-label="+">+</button></div>
                    <b className="qs-tutar">{fiyatYaz(x.adet * x.fiyat)}</b>
                  </div>
                ))}
              </div>
              <div className="qs-toplam"><span>{yaz("Toplam", "Total")}</span><b>{fiyatYaz(toplam)}</b></div>
              <div className="qd-olcuSec qs-tur">
                {[["masa", yaz("Masada", "At table")], ["paket", yaz("Paket servis", "Delivery")], ["gelal", yaz("Gel-al", "Pick-up")]].map(([d, a]) => <button key={d} className={tur === d ? "secili" : ""} onClick={() => setTur(d)}>{a}</button>)}
              </div>
              {tur === "masa" && <input className="qs-girdi" value={masaNo} onChange={(e) => setMasaNo(e.target.value)} placeholder={yaz("Masa numarası", "Table number")} inputMode="numeric" />}
              {tur === "paket" && <textarea className="qs-girdi" value={adres} onChange={(e) => setAdres(e.target.value)} placeholder={yaz("Teslimat adresi", "Delivery address")} rows={2} />}
              <input className="qs-girdi" value={isim} onChange={(e) => setIsim(e.target.value)} placeholder={yaz("Adınız (isteğe bağlı)", "Your name (optional)")} />
              <input className="qs-girdi" value={not_} onChange={(e) => setNot(e.target.value)} placeholder={yaz("Not: ör. az şekerli, acısız", "Note: e.g. no sugar")} />
              <button className="qs-gonder" disabled={eksik} onClick={gonder}>{yaz("WhatsApp'tan sipariş gönder", "Send order via WhatsApp")}</button>
              {eksik && <p className="qs-uyari">{tur === "masa" ? yaz("Masa numarasını yazın.", "Enter your table number.") : yaz("Teslimat adresini yazın.", "Enter the delivery address.")}</p>}
              {gonderildi && (
                <p className="qs-uyari tamam">
                  {yaz("WhatsApp açıldı. Mesajı gönderdiyseniz siparişiniz işletmeye ulaştı.", "WhatsApp opened. Once you send the message, your order is placed.")}{" "}
                  <button onClick={() => { setSepet([]); kapat(); }}>{yaz("Sepeti temizle", "Clear cart")}</button>
                </p>
              )}
            </>
          )}
        </div>
      </div>
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
/* Kapak fotoğrafı, duyuru şeridi, kategori görselleri, sıralı belirme */
.qm-kapak{width:calc(100% + 36px);margin:-18px -18px 0;height:210px;background-size:cover;background-position:center;position:relative;padding:14px 16px}
.qm-kapak::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,0) 40%,color-mix(in srgb,var(--zemin) 70%,transparent) 88%,var(--zemin))}
.qm-kapak .qm-ust-cubuk{position:relative;z-index:1;margin:0}
.qm-logo-kapakli{margin-top:-74px;position:relative;z-index:2}
.qm-logo-kapakli .qm-logo.buyuk{background:var(--zemin)}
.qm-duyuru{display:inline-flex;align-items:center;gap:8px;margin:-8px 0 22px;padding:9px 16px;border-radius:100px;background:var(--ana);color:#fff;font-family:var(--govde);font-size:12.5px;font-weight:700;letter-spacing:.02em;text-align:center;box-shadow:0 8px 22px -12px var(--ana);animation:qmNabiz 2.6s ease-in-out infinite}
.qm-duyuru::before{content:"✦";font-size:11px;opacity:.85}
@keyframes qmNabiz{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}
.qm-gece .qm-duyuru{color:#14110f}
.qm .qm-kart{animation:qmBelir .55s cubic-bezier(.2,.7,.3,1) both;animation-delay:calc(var(--i,0) * 55ms)}
@keyframes qmBelir{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.qm .qm-kart.gorselli{padding-top:0;overflow:hidden;min-height:150px}
.qm-kart-gorsel{display:block;width:calc(100% + 24px);margin:0 -12px 10px;height:84px;background-size:cover;background-position:center;border-radius:60px 60px 0 0;transition:transform .5s}
.qm-kart.gorselli:hover .qm-kart-gorsel{transform:scale(1.06)}
.qm-kart.gorselli .qm-no{margin-bottom:6px}
.qm-kb-gorsel{height:120px;border-radius:14px;background-size:cover;background-position:center;margin:0 0 14px;box-shadow:0 10px 24px -16px rgba(0,0,0,.5)}
.qm-u{cursor:pointer;border-radius:8px;transition:background .2s}
.qm-u:active{background:color-mix(in srgb,var(--ana) 7%,transparent)}
/* WhatsApp siparişi: sepet çubuğu, ekle düğmeleri, sepet penceresi */
.qs-cubuk{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:12;display:flex;align-items:center;gap:10px;padding:12px 18px 12px 12px;border-radius:100px;background:var(--ana)!important;color:#fff!important;font-family:var(--govde);font-size:14px;font-weight:800;box-shadow:0 14px 30px -10px rgba(0,0,0,.45);animation:qdAc .3s both;white-space:nowrap}
.qs-cubuk.yukari{bottom:78px}
.qs-cubuk b{margin-left:6px;padding-left:12px;border-left:1px solid rgba(255,255,255,.35)}
.qs-adet{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:28px;padding:0 6px;border-radius:100px;background:#fff;color:var(--ana);font-size:13px}
.qm-gece .qs-cubuk,.qm-gece .qs-gonder{color:#14110f!important}.qm-gece .qs-cubuk b{border-left-color:rgba(0,0,0,.25)}.qm-gece .qs-adet{background:#14110f;color:var(--ana)}
.qs-ekle{flex-shrink:0;align-self:center;width:32px;height:32px;border-radius:50%;background:var(--ana)!important;color:#fff!important;font-size:20px!important;font-weight:700;line-height:1;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 6px 14px -8px var(--ana);margin-left:auto}
.qt-kart-fiyat{align-items:center}
.qt-kart .qs-ekle{width:30px;height:30px}
.qs-bildirim{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:60;padding:10px 18px;border-radius:100px;background:#1f1b18;color:#fff;font-size:13px;font-weight:700;box-shadow:0 10px 24px -10px rgba(0,0,0,.5);animation:qdAc .25s both}
.qd-siparis{margin-top:16px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--ana) 15%,transparent)}
.qd-olcuSec{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.qd-olcuSec button{padding:8px 14px;border-radius:100px;font-size:13px;font-weight:700;border:1.5px solid color-mix(in srgb,var(--ana) 30%,transparent)!important;color:var(--ana)!important}
.qd-olcuSec button.secili{background:var(--ana)!important;color:#fff!important;border-color:var(--ana)!important}
.qm-gece .qd-olcuSec button.secili{color:#14110f!important}
.qd-ekle{display:flex;gap:10px;align-items:center}
.qs-sayac{display:inline-flex;align-items:center;border-radius:100px;border:1.5px solid color-mix(in srgb,var(--ana) 25%,transparent)}
.qs-sayac button{width:34px;height:34px;font-size:18px!important;font-weight:700;color:var(--ana)!important}
.qs-sayac span{min-width:22px;text-align:center;font-weight:800;color:var(--ana)}
.qd-sepete,.qs-gonder{flex:1;padding:13px 16px;border-radius:100px;background:var(--ana)!important;color:#fff!important;font-size:14.5px;font-weight:800;box-shadow:0 10px 22px -12px var(--ana)}
.qm-gece .qd-sepete{color:#14110f!important}
.qs .qd-metin{padding-top:22px}
.qs-liste{display:flex;flex-direction:column;gap:2px;margin:10px 0 6px}
.qs-satir{display:grid;grid-template-columns:1fr auto 74px;gap:10px;align-items:center;padding:10px 0;border-bottom:1px dashed color-mix(in srgb,var(--ana) 18%,transparent)}
.qs-satir b{font-size:14px;color:#26211e}.qs-satir small{display:block;font-size:11.5px;color:#8b827c}
.qm-gece .qs-satir b{color:#f4efe8}
.qs-tutar{text-align:right;color:var(--ana)!important}
.qs-sayac.kucuk button{width:28px;height:28px}
.qs-toplam{display:flex;justify-content:space-between;align-items:baseline;margin:10px 0 14px;font-weight:800;color:var(--ana)}
.qs-toplam b{font-size:20px}
.qs-tur{margin-bottom:8px}
.qs-girdi{width:100%;margin-bottom:8px;padding:11px 13px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ana) 20%,transparent);background:#fff;font:inherit;font-size:14px;color:#26211e;outline:none;resize:vertical}
.qs-gonder{width:100%;margin-top:4px;background:#25D366!important}
.qs-gonder:disabled{opacity:.5}
.qs-uyari{margin-top:10px;font-size:12.5px!important;color:#b4472a!important}
.qs-uyari.tamam{color:#2e7d4f!important}
.qs-uyari button{text-decoration:underline;font-weight:700;color:inherit!important}
/* Ürün detay penceresi */
.qd-arka{position:fixed;inset:0;z-index:50;background:rgba(10,8,6,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;animation:qdArka .2s both}
.qd{position:relative;width:100%;max-width:480px;max-height:88vh;overflow:auto;background:var(--zemin);border-radius:24px 24px 0 0;box-shadow:0 -20px 60px -20px rgba(0,0,0,.5);animation:qdAc .32s cubic-bezier(.2,.8,.3,1) both}
@keyframes qdArka{from{opacity:0}}
@keyframes qdAc{from{transform:translateY(40px);opacity:0}}
.qd-kapat{position:absolute;top:12px;right:12px;z-index:2;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.9)!important;color:#26211e!important;font-size:15px;box-shadow:0 4px 12px rgba(0,0,0,.2)}
.qd-gorsel{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
.qd-metin{padding:18px 22px 26px}
.qd-kat{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:color-mix(in srgb,var(--ana) 75%,#888)}
.qd h3{font-family:var(--urun);font-size:22px;font-weight:700;line-height:1.2;color:var(--ana);margin:4px 0 8px}
.qd-etiketler{display:flex;gap:6px;margin-bottom:10px}
.qd-etiketler .qm-etiket{margin-left:0}
.qd p{font-size:14px;line-height:1.55;color:#5d5650}
.qd-fiyatlar{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px;margin:16px 0 4px}
.qd-fiyatlar div{padding:10px 12px;border-radius:12px;background:color-mix(in srgb,var(--ana) 8%,transparent);border:1px solid color-mix(in srgb,var(--ana) 18%,transparent)}
.qd-fiyatlar span{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8b827c}
.qd-fiyatlar b{font-size:18px;font-weight:800;color:var(--ana)}
.qd-alerjen{margin-top:12px;font-size:12px!important;color:#8b827c!important}
.qm-gece .qd p{color:#c9c0b7}.qm-gece .qd-fiyatlar span,.qm-gece .qd-alerjen{color:#a39a92!important}
@media (min-width:520px){.qd-arka{align-items:center}.qd{border-radius:24px}}
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
.qt-kart,.qt-satir{cursor:pointer}
.qt-kart{transition:transform .2s,box-shadow .2s}
.qt-kart:active{transform:scale(.98)}
.qt-gorsel{overflow:hidden}
.qt-gorsel img{transition:transform .5s}
.qt-kart:hover .qt-gorsel img{transform:scale(1.06)}
.qt-duyuru{display:flex;justify-content:center;width:fit-content;max-width:calc(100% - 28px);margin:14px auto 0}
.qt-kat-gorsel{height:118px;border-radius:16px;background-size:cover;background-position:center;margin:4px 0 12px;box-shadow:0 10px 24px -16px rgba(0,0,0,.5)}
@media (min-width:1000px){
  .qm-genis .qt{max-width:1100px}
  .qm-genis .qt-kartlar{grid-template-columns:repeat(4,1fr)}
  .qm-genis .qt-satirlar{display:grid;grid-template-columns:1fr 1fr;column-gap:48px}
}
`;
