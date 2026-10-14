// netlify/functions/sitemap.cjs — panormosmedya.com/sitemap.xml: Google'a ana sayfa, blog ve yayındaki blog yazılarını bildirir.
// Herkese açık okuma anahtarıyla yalnızca yayındaki yazıların adresini ve tarihini okur.
const { SUPABASE_URL, SUPABASE_ANON_KEY } = require("../lib/auth.cjs");
const SITE = "https://panormosmedya.com";

exports.handler = async () => {
  const adresler = [{ loc: SITE + "/" }, { loc: SITE + "/blog" }];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/blog_yazilari?yayinda=eq.true&select=slug,guncellenme&order=yayin_tarihi.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    const yazilar = r.ok ? await r.json() : [];
    (Array.isArray(yazilar) ? yazilar : []).forEach(y => {
      if (y.slug) adresler.push({ loc: `${SITE}/blog/${encodeURIComponent(y.slug)}`, lastmod: String(y.guncellenme || "").slice(0, 10) });
    });
  } catch (e) { /* blog okunamazsa ana adreslerle yetin */ }
  const govde = adresler.map(a => `  <url><loc>${a.loc}</loc>${a.lastmod ? `<lastmod>${a.lastmod}</lastmod>` : ""}</url>`).join("\n");
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${govde}\n</urlset>\n`,
  };
};
