// Ayaz Gayrimenkul — güncel döviz, altın ve gümüş fiyatları (ana sayfadaki "Piyasa" bölümü için).
// Tarayıcı bu adresi çağırır; kaynak siteye buradan bağlanılır, sonuç 5-10 dakika önbellekte tutulur.
// Asıl kaynak yanıt vermezse döviz için Merkez Bankası'nın günlük kurlarına düşülür (altın o gün gösterilmez).

const KAYNAK = 'https://finans.truncgil.com/v3/today.json'
// Kira artış oranı: TÜİK'in aylık TÜFE değişimleri Merkez Bankası'nın bu sayfasında yayımlanır
const TCMB_TUFE = 'https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri/Tuketici+Fiyatlari'
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
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

// Konut kira artış üst sınırı (TBK 344): TÜFE'nin on iki aylık ortalamalara göre değişimi.
// Aylık değişimlerden endeks zincirlenir; son 12 ayın ortalaması önceki 12 ayın ortalamasına bölünür.
// 2026'da TÜİK'in açıkladığı Ocak (%33,98), Mayıs (%32,24), Ağustos (%31,79) ve Eylül (%31,49) oranlarıyla birebir tuttuğu denendi.
async function kiraOrani() {
  const html = await (await getir(TCMB_TUFE)).text()
  const metin = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ')
  const satirlar = [...metin.matchAll(/(\d{2})-(\d{4})\s+(-?[\d.]+)\s+(-?[\d.]+)/g)]
    .map((m) => ({ ay: Number(m[1]), yil: Number(m[2]), aylik: Number(m[4]) }))
    .filter((r) => r.ay >= 1 && r.ay <= 12 && Number.isFinite(r.aylik))
    .sort((a, b) => a.yil - b.yil || a.ay - b.ay)
    .filter((r, i, d) => i === 0 || r.yil !== d[i - 1].yil || r.ay !== d[i - 1].ay) // aynı ay iki kez okunmasın
  if (satirlar.length < 24) throw new Error('TÜFE verisi eksik')
  // Son 24 ay kesintisiz ardışık olmalı; arada eksik ay varsa yanlış oran göstermek yerine hiç gösterme
  for (let i = satirlar.length - 23; i < satirlar.length; i++) {
    const o = satirlar[i - 1], r = satirlar[i]
    if ((r.yil - o.yil) * 12 + (r.ay - o.ay) !== 1) throw new Error('TÜFE serisinde eksik ay var')
  }
  let endeks = 100
  const seri = satirlar.map((r) => { endeks *= 1 + r.aylik / 100; return endeks })
  const n = seri.length
  const toplam = (a, b) => seri.slice(a, b).reduce((s, v) => s + v, 0)
  const oran = (toplam(n - 12, n) / toplam(n - 24, n - 12) - 1) * 100
  const son = satirlar[n - 1]
  const uygulama = son.ay === 12 ? { ay: 1, yil: son.yil + 1 } : { ay: son.ay + 1, yil: son.yil }
  return {
    oran: Math.round(oran * 100) / 100,
    veri: `${AYLAR[son.ay - 1]} ${son.yil}`,
    uygulama: `${AYLAR[uygulama.ay - 1]} ${uygulama.yil}`,
  }
}

exports.handler = async () => {
  const kira = kiraOrani().catch(() => null)
  let piyasa
  try {
    piyasa = await asilKaynak()
  } catch (e) {
    try { piyasa = await merkezBankasi() } catch (e2) { piyasa = null }
  }
  const k = await kira
  if (!piyasa && !k) return YANIT(502, { error: 'Piyasa verisi şu anda alınamıyor.' }, false)
  return YANIT(200, { ...(piyasa ?? { doviz: [], altin: [] }), kira: k }, true)
}
