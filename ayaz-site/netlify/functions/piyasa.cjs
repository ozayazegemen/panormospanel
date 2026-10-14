// Ayaz Gayrimenkul — güncel döviz, altın ve gümüş fiyatları (ana sayfadaki "Piyasa" bölümü için).
// Tarayıcı bu adresi çağırır; kaynak siteye buradan bağlanılır, sonuç 5-10 dakika önbellekte tutulur.
// Asıl kaynak yanıt vermezse döviz için Merkez Bankası'nın günlük kurlarına düşülür (altın o gün gösterilmez).

const KAYNAK = 'https://finans.truncgil.com/v3/today.json'
const TCMB = 'https://www.tcmb.gov.tr/kurlar/today.xml'

const DOVIZ = [['USD', 'Dolar'], ['EUR', 'Euro'], ['GBP', 'Sterlin']]
const ALTIN = [
  ['gram-altin', 'Gram altın'], ['ceyrek-altin', 'Çeyrek altın'], ['yarim-altin', 'Yarım altın'],
  ['tam-altin', 'Tam altın'], ['cumhuriyet-altini', 'Cumhuriyet altını'], ['gumus', 'Gram gümüş'],
]

const YANIT = (statusCode, govde, onbellek) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': onbellek ? 'public, max-age=300, s-maxage=600' : 'no-store',
  },
  body: JSON.stringify(govde),
})

// Kaynak sayıları Türkçe yazımla verir: "6.490,84", "%-1,75", "$4.087,46"
const sayi = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const m = String(v ?? '').replace(/[%$\s]/g, '')
  const n = Number(m.includes(',') ? m.replace(/\./g, '').replace(',', '.') : m)
  return Number.isFinite(n) ? n : null
}

async function getir(adres) {
  const r = await fetch(adres, { headers: { 'User-Agent': 'Mozilla/5.0 (ayazgayrimenkul)' }, signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`Kaynak yanıt vermedi (${r.status})`)
  return r
}

function satirlar(veri, liste) {
  return liste.map(([kod, ad]) => {
    const k = veri?.[kod]
    const satis = sayi(k?.Selling)
    if (!satis || satis <= 0) return null
    return { kod, ad, alis: sayi(k?.Buying), satis, degisim: sayi(k?.Change) }
  }).filter(Boolean)
}

async function asilKaynak() {
  const veri = await (await getir(KAYNAK)).json()
  const doviz = satirlar(veri, DOVIZ)
  if (doviz.length === 0) throw new Error('Kur verisi boş')
  return { kaynak: 'Truncgil Finans', guncelleme: veri?.Update_Date ?? null, doviz, altin: satirlar(veri, ALTIN) }
}

async function merkezBankasi() {
  const xml = await (await getir(TCMB)).text()
  const tarih = (xml.match(/Tarih="([^"]+)"/) ?? [])[1] ?? null
  const doviz = DOVIZ.map(([kod, ad]) => {
    const blok = (xml.match(new RegExp(`<Currency[^>]*Kod="${kod}"[\\s\\S]*?</Currency>`)) ?? [])[0] ?? ''
    const alis = sayi((blok.match(/<ForexBuying>([^<]+)</) ?? [])[1])
    const satis = sayi((blok.match(/<ForexSelling>([^<]+)</) ?? [])[1])
    return satis ? { kod, ad, alis, satis, degisim: null } : null
  }).filter(Boolean)
  if (doviz.length === 0) throw new Error('Merkez Bankası kur verisi boş')
  return { kaynak: 'TCMB', guncelleme: tarih, doviz, altin: [] }
}

exports.handler = async () => {
  try {
    return YANIT(200, await asilKaynak(), true)
  } catch (e) {
    try {
      return YANIT(200, await merkezBankasi(), true)
    } catch (e2) {
      return YANIT(502, { error: 'Piyasa verisi şu anda alınamıyor.' }, false)
    }
  }
}
