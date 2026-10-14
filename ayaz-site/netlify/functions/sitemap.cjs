// Ayaz Gayrimenkul — /sitemap.xml: Google'a ana sayfayı, blogu ve yayındaki yazıları bildirir.
// Yazılar Emlak Panelim veritabanında (site = 'ayaz'); herkese açık okuma anahtarıyla okunur.
const SITE = 'https://xn--ayazgayrmenkul-dgc.com'
const VERI = 'https://pjkjeetcodqvwnwgmktt.supabase.co/rest/v1/'
const ANAHTAR = 'sb_publishable_E7p4PBeVosh5dny_7Yi7SA_zBLdS-Is'

exports.handler = async () => {
  const adresler = [{ loc: SITE + '/' }, { loc: SITE + '/blog' }]
  try {
    const r = await fetch(`${VERI}blog_yazilari?site=eq.ayaz&yayinda=eq.true&select=slug,yayin_tarihi,guncellenme&order=yayin_tarihi.desc`, { headers: { apikey: ANAHTAR } })
    const yazilar = r.ok ? await r.json() : []
    ;(Array.isArray(yazilar) ? yazilar : []).forEach((y) => {
      if (y.slug) adresler.push({ loc: `${SITE}/blog/${encodeURIComponent(y.slug)}`, lastmod: String(y.guncellenme || y.yayin_tarihi || '').slice(0, 10) })
    })
  } catch (e) { /* yazılar okunamazsa sabit sayfalarla yetin */ }
  const govde = adresler.map((a) => `  <url><loc>${a.loc}</loc>${a.lastmod ? `<lastmod>${a.lastmod}</lastmod>` : ''}</url>`).join('\n')
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${govde}\n</urlset>\n`,
  }
}
