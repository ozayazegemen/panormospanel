// Ayaz Gayrimenkul — bankaların güncel konut kredisi aylık faiz (katılım bankalarında kâr payı) oranları.
// Kaynak: hesapkurdu.com konut kredisi karşılaştırma sayfası (robots.txt bu sayfaya izin veriyor); sayfadaki
// gömülü veriden 1.000.000 TL ve 120 ay vade için listelenen oranlar okunur. Sonuç 6 saat önbellekte tutulur.
// Kaynak okunamazsa boş liste döner; sitedeki hesaplayıcı o zaman oranı elle yazdırır.

const KAYNAK = 'https://www.hesapkurdu.com/konut-kredisi'

const YANIT = (statusCode, govde, onbellek) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': onbellek ? 'public, max-age=1800, s-maxage=21600' : 'no-store',
  },
  body: JSON.stringify(govde),
})

function urunleriTopla(o, liste = []) {
  if (Array.isArray(o)) o.forEach((v) => urunleriTopla(v, liste))
  else if (o && typeof o === 'object') {
    if (o.productType === 1 && o.bankName && typeof o.interestRate === 'number' && o.interestRate > 0) liste.push(o)
    Object.values(o).forEach((v) => urunleriTopla(v, liste))
  }
  return liste
}

exports.handler = async () => {
  try {
    const r = await fetch(KAYNAK, { headers: { 'User-Agent': 'Mozilla/5.0 (ayazgayrimenkul)' }, signal: AbortSignal.timeout(10000) })
    if (!r.ok) throw new Error(`Kaynak yanıt vermedi (${r.status})`)
    const html = await r.text()
    // Eski sayfa yapısı: __NEXT_DATA__ içinde JSON. Yeni yapı (Ekim 2026): sayfaya gömülü akış verisinde
    // kaçışlı JSON; her ürün iç içe nesne içermeyen düz bir nesnedir, tek tek ayıklanır.
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    let urunler = m ? urunleriTopla(JSON.parse(m[1])) : []
    if (!urunler.length) {
      const duz = html.replace(/\\"/g, '"')
      for (const p of duz.match(/\{[^{}]*"bankName":"[^"]+"[^{}]*"interestRate":[\d.]+[^{}]*\}/g) ?? []) {
        try { urunleriTopla(JSON.parse(p), urunler) } catch (e) { /* bozuk parça atlanır */ }
      }
      // Karşılaştırma tablosundaki diğer bankalar: banka adı satırının hemen ardından "% 3,09" biçiminde oran
      for (const t of duz.matchAll(/"title":"([^"]+)","internalUrl":"[^"]*","followingUrl":"konut-kredisi","loanTitle":"[^"]*"\}\]\\n[0-9a-f]+:\["% ","([\d,]+)"\]/g)) {
        const oran = Number(t[2].replace(',', '.'))
        if (oran > 0) urunler.push({ productType: 1, bankName: t[1], interestRate: oran, bankType: /katılım/i.test(t[1]) ? 2 : 1 })
      }
    }
    if (!urunler.length) throw new Error('Veri bulunamadı')
    // Her bankadan en düşük oranlı konut ürünü
    const bankalar = {}
    urunler.forEach((u) => {
      const ad = String(u.bankName).trim()
      if (!bankalar[ad] || u.interestRate < bankalar[ad].oran) {
        bankalar[ad] = {
          banka: ad,
          oran: Math.round(u.interestRate * 100) / 100,
          katilim: u.bankType === 2,
          vade: u.maxMaturity || null,
        }
      }
    })
    const liste = Object.values(bankalar).sort((a, b) => a.oran - b.oran)
    if (!liste.length) throw new Error('Oran bulunamadı')
    return YANIT(200, { kaynak: 'hesapkurdu.com', tutar: 1000000, vade: 120, guncelleme: new Date().toISOString(), bankalar: liste }, true)
  } catch (e) {
    return YANIT(200, { bankalar: [], hata: 'Oranlar şu anda alınamıyor.' }, false)
  }
}
