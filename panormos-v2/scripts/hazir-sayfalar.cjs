// Yayın sırasında (vite build'den sonra) çalışır: herkese açık her sayfa için Google'ın doğrudan okuyacağı
// hazır bir index.html üretir. Sayfanın kendi başlığı, açıklaması, adresi (canonical), paylaşım bilgileri,
// yapılandırılmış verisi ve yazıları sayfaya gömülür; ziyaretçi için uygulama yine aynı şekilde açılır.
// Netlify önce gerçek dosyaya bakar (/qr-menu için qr-menu.html), yoksa index.html'e düşer.
// Herhangi bir hata yayını durdurmaz: o sayfa atlanır, site eskisi gibi çalışır.
const fs = require("fs");
const path = require("path");

const SITE = "https://panormosmedya.com";
const SUPABASE_URL = "https://kmxhsyjtyukrxrzoowag.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_8FkJ2hortwsLn57lLZMEwQ_vS29JgwT";
const KOK = path.join(__dirname, "..");
const DIST = path.join(KOK, "dist");

const kac = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const kisalt = (v, n = 158) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };

// Site.jsx'teki sabit listeler (hizmetler, işler, QR menü metinleri) buradan okunur; metinler tek yerde kalır
function listeOku(kaynak, ad) {
  const bas = kaynak.indexOf(`const ${ad} = [`);
  if (bas < 0) return [];
  const son = kaynak.indexOf("\n];", bas);
  if (son < 0) return [];
  try { return new Function(`return ${kaynak.slice(bas + `const ${ad} = `.length, son + 2)}`)(); } catch (e) { return []; }
}

// Blog yazısı metni: panelin kurallarıyla aynı ("## " başlık, "- " madde, ![açıklama](adres) görsel)
function blogHtml(metin) {
  return String(metin ?? "").replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.startsWith("## ")) return `<h2>${kac(b.slice(3))}</h2>`;
    const g = b.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/);
    if (g) return `<figure><img src="${kac(g[2])}" alt="${kac(g[1])}" loading="lazy"><figcaption>${kac(g[1])}</figcaption></figure>`;
    const s = b.split("\n");
    if (s.every((x) => /^[-•]\s+/.test(x))) return `<ul>${s.map((x) => `<li>${kac(x.replace(/^[-•]\s+/, ""))}</li>`).join("")}</ul>`;
    return `<p>${s.map(kac).join("<br>")}</p>`;
  }).join("\n");
}

function meta(sablon, ad, ozellik, deger) {
  const re = new RegExp(`<meta ${ozellik}="${ad}" content="[^"]*"\\s*/?>`);
  const yeni = `<meta ${ozellik}="${ad}" content="${kac(deger)}" />`;
  return re.test(sablon) ? sablon.replace(re, yeni) : sablon.replace("</head>", `    ${yeni}\n  </head>`);
}

function sayfaYaz(sablon, { yol, baslik, aciklama, govde, veri = [], resim = "", tur = "website", robots = "" }) {
  const adres = SITE + yol;
  let h = sablon.replace(/<title>[^<]*<\/title>/, `<title>${kac(baslik)}</title>`);
  h = meta(h, "description", "name", kisalt(aciklama));
  h = h.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${adres}" />`);
  h = meta(h, "og:url", "property", adres);
  h = meta(h, "og:title", "property", baslik);
  h = meta(h, "og:description", "property", kisalt(aciklama, 200));
  h = meta(h, "og:type", "property", tur);
  if (resim) { h = meta(h, "og:image", "property", resim); h = meta(h, "twitter:card", "name", "summary_large_image"); }
  if (robots) h = meta(h, "robots", "name", robots);
  // Şablondaki genel işletme bilgisi yerine her sayfaya aynı, daha ayrıntılı bilgi (site + işletme) konur
  h = h.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
  veri = [TEMEL_VERI, ...veri];
  if (veri.length) h = h.replace("</head>", veri.map((v) => `    <script type="application/ld+json">${JSON.stringify(v).replace(/</g, "\\u003c")}</script>`).join("\n") + "\n  </head>");
  // Yazılar #root'un içine gömülür; uygulama açılınca bunların yerini alır
  h = h.replace('<div id="root"></div>', `<div id="root"><div class="hazir-sayfa">\n${govde}\n</div></div>`);
  // /qr-menu → dist/qr-menu.html: Netlify bunu /qr-menu adresinde yönlendirmesiz sunar (klasör/index.html olsaydı /qr-menu/'e yönlendirirdi)
  const hedef = yol === "/" ? path.join(DIST, "index.html") : path.join(DIST, ...yol.split("/").filter(Boolean)) + ".html";
  fs.mkdirSync(path.dirname(hedef), { recursive: true });
  fs.writeFileSync(hedef, h);
  // Aynı sayfa sonunda eğik çizgiyle de (/qr-menu/) yönlendirmesiz açılsın; asıl adres canonical'da yazıyor.
  // (20.10.2026'daki bir ara sürüm tarayıcılara /qr-menu → /qr-menu/ yönlendirmesini kalıcı kaydettirdi; döngü olmasın)
  if (yol !== "/") {
    const klasor = path.join(DIST, ...yol.split("/").filter(Boolean));
    fs.mkdirSync(klasor, { recursive: true });
    fs.writeFileSync(path.join(klasor, "index.html"), h);
  }
  return hedef;
}

const ISLETME = {
  "@type": "ProfessionalService",
  "@id": `${SITE}/#isletme`,
  name: "Panormos Medya",
  url: `${SITE}/`,
  logo: `${SITE}/icons/apple-touch-icon.png`,
  image: `${SITE}/isler/qr-menu.jpg`,
  telephone: "+905364716012",
  email: "info@panormosmedya.com",
  address: { "@type": "PostalAddress", addressLocality: "Bandırma", addressRegion: "Balıkesir", addressCountry: "TR" },
  areaServed: [{ "@type": "City", name: "Bandırma" }, { "@type": "AdministrativeArea", name: "Balıkesir" }, { "@type": "Country", name: "Türkiye" }],
  sameAs: ["https://instagram.com/panormosmedya"],
};
const TEMEL_VERI = { "@context": "https://schema.org", "@graph": [{ "@type": "WebSite", "@id": `${SITE}/#site`, name: "Panormos Medya", alternateName: "Panormos", url: `${SITE}/`, inLanguage: "tr-TR" }, ISLETME] };
const altBilgi = `<footer><p>Panormos Medya · Bandırma / Balıkesir · <a href="tel:+905364716012">0536 471 60 12</a> · <a href="mailto:info@panormosmedya.com">info@panormosmedya.com</a></p>
<nav><a href="/">Ana sayfa</a> · <a href="/qr-menu">QR Menü</a> · <a href="/blog">Blog</a></nav></footer>`;

async function supabaseOku(yol) {
  if (typeof fetch !== "function") return [];
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${yol}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : [];
}

async function calistir() {
  const sablon = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
  const site = fs.readFileSync(path.join(KOK, "src", "Site.jsx"), "utf8");
  const HIZMETLER = listeOku(site, "HIZMETLER"), ISLER = listeOku(site, "ISLER");
  const QR_DEMOLAR = listeOku(site, "QR_DEMOLAR"), QR_OZELLIKLER = listeOku(site, "QR_OZELLIKLER"), QR_ADIMLAR = listeOku(site, "QR_ADIMLAR"), QR_SSS = listeOku(site, "QR_SSS");
  const uretilen = [];
  const dene = (ad, f) => { try { uretilen.push(f()); } catch (e) { console.log(`hazır sayfa atlandı (${ad}): ${e.message}`); } };

  // Ana sayfa
  dene("ana sayfa", () => sayfaYaz(sablon, {
    yol: "/",
    baslik: "Panormos Medya — Bandırma Sosyal Medya ve Dijital Reklam Ajansı",
    aciklama: "Bandırma merkezli dijital ajans: Instagram ve sosyal medya yönetimi, Meta reklamları, SEO, tanıtım filmi ve drone çekimi, tasarım, web sitesi ve QR menü.",
    resim: `${SITE}/isler/qr-menu.jpg`,
    govde: `<header><h1>Panormos Medya: Bandırma Sosyal Medya ve Dijital Reklam Ajansı</h1>
<p>Bandırma ve Balıkesir'deki işletmeler için sosyal medya yönetimi, reklam, içerik üretimi, tasarım ve yazılım hizmeti veriyoruz.</p></header>
<section><h2>Hizmetler</h2>
${HIZMETLER.map((h) => `<article><h3>${kac(h.baslik)}</h3><p>${kac(h.metin)}</p><ul>${(h.etiket || []).map((e) => `<li>${kac(e)}</li>`).join("")}</ul></article>`).join("\n")}</section>
<section><h2>İşlerimiz</h2>
${ISLER.map((p) => `<article><h3>${kac(p.baslik)}</h3><p>${kac(p.metin)}</p><ul>${(p.maddeler || []).map((m) => `<li>${kac(m)}</li>`).join("")}</ul><a href="${kac(p.baslik === "QR Menü" ? "/qr-menu" : p.adres)}">${kac(p.baslik === "QR Menü" ? "QR Menü sayfası" : p.adresYazi)}</a></article>`).join("\n")}</section>
${altBilgi}`,
  }));

  // QR Menü satış sayfası
  dene("qr-menu", () => sayfaYaz(sablon, {
    yol: "/qr-menu",
    baslik: "QR Menü: Restoran, Kafe ve Barlar için Dijital Menü | Panormos Medya",
    aciklama: "Masadaki QR koddan açılan, fiyatı anında güncellenen dijital menü. Türkçe ve İngilizce, dört tasarım, rakı ve şarap sütunları. Restoran, kafe, lokanta ve bar demolarını inceleyin.",
    resim: `${SITE}/isler/qr-menu.jpg`,
    veri: [
      { "@context": "https://schema.org", "@type": "Service", name: "QR Menü", serviceType: "Dijital QR menü", provider: { "@id": `${SITE}/#isletme`, name: "Panormos Medya" }, areaServed: "Türkiye", url: `${SITE}/qr-menu`, description: "Restoran, kafe, lokanta ve barlar için QR koddan açılan, panelden anında güncellenen dijital menü." },
      { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: QR_SSS.map(([s, c]) => ({ "@type": "Question", name: s, acceptedAnswer: { "@type": "Answer", text: c } })) },
      { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Panormos Medya", item: `${SITE}/` }, { "@type": "ListItem", position: 2, name: "QR Menü", item: `${SITE}/qr-menu` }] },
    ],
    govde: `<header><h1>QR Menü: restoran, kafe, lokanta ve barlar için dijital menü</h1>
<p>Masadaki QR koddan açılan dijital menü. Fiyatı panelden değiştirdiğiniz anda menü güncellenir; baskı ve PDF derdi biter.</p></header>
<section><h2>Demo menüler</h2><ul>${QR_DEMOLAR.map((d) => `<li><a href="/m/${kac(d.slug)}">${kac(d.tur)}: ${kac(d.ad)} (${kac(d.sablon)})</a> — ${kac(d.metin)}</li>`).join("")}</ul></section>
<section><h2>Özellikler</h2>${QR_OZELLIKLER.map(([b, m]) => `<h3>${kac(b)}</h3><p>${kac(m)}</p>`).join("")}</section>
<section><h2>Nasıl başlarız?</h2><ol>${QR_ADIMLAR.map(([b, m]) => `<li><strong>${kac(b)}</strong>: ${kac(m)}</li>`).join("")}</ol></section>
<section><h2>Sık sorulanlar</h2>${QR_SSS.map(([s, c]) => `<h3>${kac(s)}</h3><p>${kac(c)}</p>`).join("")}</section>
${altBilgi}`,
  }));

  // Blog: liste ve her yazı
  const yazilar = await supabaseOku("blog_yazilari?yayinda=eq.true&select=slug,baslik,ozet,kategori,kapak,icerik,yayin_tarihi,guncellenme&order=yayin_tarihi.desc").catch(() => []);
  dene("blog", () => sayfaYaz(sablon, {
    yol: "/blog",
    baslik: "Blog — Panormos Medya",
    aciklama: "Sosyal medya, reklam, SEO, web sitesi ve yazılım üzerine Panormos Medya ekibinin işinize hemen yarayacak notları.",
    veri: [{ "@context": "https://schema.org", "@type": "Blog", name: "Panormos Medya Blog", url: `${SITE}/blog`, publisher: { "@id": `${SITE}/#isletme`, name: "Panormos Medya" } }],
    govde: `<header><h1>Panormos Medya Blog</h1><p>Sosyal medya, reklam, web sitesi ve yazılım üzerine notlar.</p></header>
<ul>${yazilar.map((y) => `<li><a href="/blog/${encodeURIComponent(y.slug)}">${kac(y.baslik)}</a>${y.ozet ? ` — ${kac(y.ozet)}` : ""}</li>`).join("")}</ul>
${altBilgi}`,
  }));
  for (const y of yazilar) {
    // Yalnızca sade adresler (harf, rakam, tire) için dosya üretilir; diğerleri uygulamadan açılmaya devam eder
    if (!/^[a-z0-9-]+$/.test(y.slug || "")) continue;
    dene(`blog/${y.slug}`, () => sayfaYaz(sablon, {
      yol: `/blog/${y.slug}`,
      baslik: `${y.baslik} — Panormos Medya`,
      aciklama: y.ozet || String(y.icerik || "").replace(/[#!\[\]()*-]/g, " "),
      tur: "article",
      resim: y.kapak || "",
      veri: [{ "@context": "https://schema.org", "@type": "BlogPosting", headline: y.baslik, description: kisalt(y.ozet || ""), image: y.kapak ? [y.kapak] : undefined, datePublished: y.yayin_tarihi, dateModified: y.guncellenme || y.yayin_tarihi, inLanguage: "tr-TR", mainEntityOfPage: `${SITE}/blog/${encodeURIComponent(y.slug)}`, author: { "@type": "Organization", name: "Panormos Medya", url: `${SITE}/` }, publisher: { "@id": `${SITE}/#isletme`, name: "Panormos Medya" } }],
      govde: `<article><p><a href="/blog">← Tüm yazılar</a></p><h1>${kac(y.baslik)}</h1>${y.ozet ? `<p><strong>${kac(y.ozet)}</strong></p>` : ""}
${y.kapak ? `<img src="${kac(y.kapak)}" alt="">` : ""}
${blogHtml(y.icerik)}</article>
${altBilgi}`,
    }));
  }

  // QR menüler: işletmenin adıyla başlık (müşterinin adı aratılınca menüsü bulunsun)
  const menuler = await supabaseOku("qr_menuler?aktif=eq.true&select=slug,ad,alt_yazi,adres,logo").catch(() => []);
  for (const m of menuler) {
    if (!/^[a-z0-9-]+$/.test(m.slug || "")) continue;
    const ad = [m.ad, m.alt_yazi].filter(Boolean).join(" — ");
    dene(`m/${m.slug}`, () => sayfaYaz(sablon, {
      yol: `/m/${m.slug}`,
      baslik: `Menü | ${ad}`,
      aciklama: `${m.ad} dijital menüsü: güncel ürünler ve fiyatlar.${m.adres ? ` ${m.adres}` : ""}`,
      resim: m.logo || "",
      govde: `<h1>${kac(ad)} menüsü</h1>${m.adres ? `<p>${kac(m.adres)}</p>` : ""}<p>Dijital menü: <a href="/">Panormos Medya</a></p>`,
    }));
  }
  console.log(`hazır sayfa: ${uretilen.length} sayfa üretildi`);
}

calistir().catch((e) => console.log("hazır sayfalar üretilemedi, site eskisi gibi yayınlanıyor:", e && e.message));
