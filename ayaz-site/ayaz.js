// Ayaz Gayrimenkul — sayfa davranışları.
// Blog yazıları ve kira artış oranı Emlak Panelim'in veritabanından okunur (Panel → Blog bölümünden
// "Ayaz Gayrimenkul" seçilerek yazılır). Aşağıdaki anahtar herkese açık okuma anahtarıdır; yalnızca
// yayındaki yazıları ve piyasa bilgilerini okuyabilir.
const VERI = 'https://pjkjeetcodqvwnwgmktt.supabase.co/rest/v1/'
const ANAHTAR = 'sb_publishable_E7p4PBeVosh5dny_7Yi7SA_zBLdS-Is'

const sorgu = (yol) => fetch(VERI + yol, { headers: { apikey: ANAHTAR } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
const para = (n, k = 2) => Number(n).toLocaleString('tr-TR', { minimumFractionDigits: k, maximumFractionDigits: k })
const tarihYaz = (t) => (t ? new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : '')
const kacis = (s) => String(s ?? '').replace(/[&<>"']/g, (h) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[h]))
const $ = (s, el = document) => el.querySelector(s)

// ---- Menü (telefonda) ----
const menuDugme = $('.menu-dugme')
if (menuDugme) menuDugme.addEventListener('click', () => {
  const acik = $('.menu').classList.toggle('acik')
  menuDugme.setAttribute('aria-expanded', acik)
})
document.querySelectorAll('.menu a').forEach((a) => a.addEventListener('click', () => $('.menu').classList.remove('acik')))

// ---- Görünürken belirme ----
function belirmeyiBaslat() {
  const izle = new IntersectionObserver((ogeler) => ogeler.forEach((o) => {
    if (o.isIntersecting) { o.target.classList.add('gorundu'); izle.unobserve(o.target) }
  }), { threshold: 0.12 })
  document.querySelectorAll('[data-belir]:not(.gorundu)').forEach((el) => izle.observe(el))
}
belirmeyiBaslat()

// ---- Piyasa: döviz, altın, gümüş (canlı) ve kira artış oranı (panelden) ----
function degisimYaz(d) {
  if (typeof d !== 'number' || d === 0) return ''
  return `<i class="${d > 0 ? 'arti' : 'eksi'}">${d > 0 ? '▲' : '▼'} %${para(Math.abs(d))}</i>`
}
async function piyasaYukle() {
  const serit = $('#serit'), fiyatlar = $('#fiyatlar'), guncelleme = $('#guncelleme'), kaynak = $('#kaynak')
  if (!serit && !fiyatlar) return
  try {
    const r = await fetch('/.netlify/functions/piyasa')
    if (!r.ok) throw new Error('alınamadı')
    const v = await r.json()
    const kalemler = [...(v.doviz ?? []), ...(v.altin ?? [])]
    if (serit) {
      const tek = kalemler.map((k) => `<span>${kacis(k.ad)}<b>${para(k.satis)} ₺</b></span>`).join('')
      serit.innerHTML = tek + tek // kesintisiz kayması için iki kez
    }
    if (fiyatlar) fiyatlar.innerHTML = kalemler.map((k) => `<div class="fiyat"><small>${kacis(k.ad)}</small><b>${para(k.satis)} ₺</b>${degisimYaz(k.degisim)}</div>`).join('')
    if (guncelleme && v.guncelleme) guncelleme.textContent = 'Son güncelleme: ' + v.guncelleme
    if (kaynak && v.kaynak) kaynak.textContent = ' Kaynak: ' + v.kaynak + '.'
  } catch (e) {
    if (fiyatlar) fiyatlar.innerHTML = '<p class="not">Fiyatlar şu anda alınamıyor. Birkaç dakika sonra tekrar deneyin.</p>'
    if (serit) serit.closest('.serit').hidden = true
  }
}
piyasaYukle()

async function kiraOraniYukle() {
  const kutu = $('#kira-kutu')
  if (!kutu) return
  let p = {}
  try { p = (await sorgu('sistem_ayarlari?select=piyasa&id=eq.true'))[0]?.piyasa ?? {} } catch (e) { /* oran yoksa hesaplayıcı elle çalışır */ }
  const oran = String(p.kira_artis ?? '').trim()
  if (oran) {
    $('#kira-oran').textContent = '%' + oran
    $('#kira-donem').textContent = p.kira_donem || ''
    if (p.kira_not) $('#kira-not').textContent = p.kira_not
    $('#oran-gir').value = oran
    $('#kira-oran-alan').hidden = false
  }
  hesapla()
}
function sayiOku(v) {
  const m = String(v ?? '').replace(/[%\s₺]/g, '')
  const n = Number(m.includes(',') ? m.replace(/\./g, '').replace(',', '.') : m.replace(/\.(?=\d{3}(\D|$))/g, ''))
  return Number.isFinite(n) ? n : NaN
}
function hesapla() {
  const kira = sayiOku($('#kira-gir')?.value), oran = sayiOku($('#oran-gir')?.value), sonuc = $('#kira-sonuc')
  if (!sonuc) return
  if (!(kira > 0) || !(oran >= 0)) { sonuc.innerHTML = 'Mevcut kirayı ve oranı yazın, yeni kira burada görünsün.'; return }
  const yeni = kira * (1 + oran / 100)
  sonuc.innerHTML = `Yeni kira en çok<b>${para(yeni, 0)} ₺</b><span style="font-weight:600;font-size:13px">Artış tutarı: ${para(yeni - kira, 0)} ₺</span>`
}
document.querySelectorAll('#kira-gir, #oran-gir').forEach((el) => el.addEventListener('input', hesapla))
kiraOraniYukle()

// ---- İlham galerisi ----
const GALERI = {
  salon: {
    ad: 'Salon',
    gorseller: [['salon-sari-koltuk', 'Tek bir renkli koltukla canlanan sade salon', 1], ['salon-dogal', 'Doğal ahşap ve deri dokular'], ['salon-acik-plan', 'Mutfağa açılan ferah yaşam alanı'], ['salon-bitkili', 'Bitkilerle yumuşayan köşeler'], ['salon-mavi', 'Beyaz zemin, mavi vurgu']],
    ipucu: [['Tek vurgu rengi seçin', 'Duvarlar sakin kalsın; rengi koltuk, yastık ya da halıyla getirin.'], ['Işığı katmanlayın', 'Tavan ışığına ek olarak bir lambader ve bir masa lambası kullanın.'], ['Bitki ekleyin', 'Bakımı kolay iki üç bitki, salonu bir anda canlandırır.']],
  },
  mutfak: {
    ad: 'Mutfak',
    gorseller: [['mutfak-genis', 'Adalı, beyaz dolaplı geniş mutfak', 1], ['mutfak-ada', 'Bar sandalyeli kahvaltı adası'], ['mutfak-beyaz', 'Mermer görünümlü tezgah ve beyaz dolaplar'], ['mutfak-tezgah', 'Düzenli tezgah, açık raf', 1]],
    ipucu: [['Üst dolabı tavana taşıyın', 'Tavana kadar uzanan dolap hem depolama kazandırır hem toz tutmaz.'], ['Tezgahı boş bırakın', 'Sık kullanmadığınız aletleri dolaba alın; küçük mutfak bile ferah görünür.'], ['Tezgah altına ışık', 'Dolap altı şerit aydınlatma, çalışırken gölgeyi ortadan kaldırır.']],
  },
  banyo: {
    ad: 'Banyo',
    gorseller: [['banyo-cam', 'Cam duşakabinli modern banyo'], ['banyo-kuvet', 'Serbest duran küvet ve sade çizgiler'], ['banyo-bitki', 'Doğal ışık alan, bitkili banyo']],
    ipucu: [['Cam duşakabin seçin', 'Perde yerine şeffaf cam, küçük banyoyu olduğundan büyük gösterir.'], ['Asma klozet ve lavabo', 'Zemin görünür kalır; temizlik kolaylaşır, alan geniş algılanır.'], ['Havalandırmayı unutmayın', 'Penceresiz banyoda iyi bir aspiratör küfün önüne geçer.']],
  },
  yatak: {
    ad: 'Yatak odası',
    gorseller: [['yatak-odasi', 'Doğal tonlarda, bitkili yatak odası'], ['salon-klasik', 'Simetrik yerleşimle huzurlu bir düzen'], ['salon-aydinlik', 'Geniş pencereli, aydınlık oturma köşesi']],
    ipucu: [['Yumuşak renkler', 'Kum, bej ve açık yeşil tonları dinlendirir.'], ['Karartma perde', 'Tül ile birlikte kalın bir perde, uykunun kalitesini artırır.'], ['Yatak başı aydınlatma', 'İki yanda simetrik aplikler okuma ışığını çözer, komodini boşaltır.']],
  },
  dis: {
    ad: 'Dış cephe',
    gorseller: [['dis-cephe-aksam', 'Ahşap ve siyah doğrama, akşam ışığında'], ['dis-cephe-ahsap', 'Ahşap kaplamalı modern cephe'], ['dis-cephe-havuz', 'Beyaz cepheli, havuzlu villa']],
    ipucu: [['Malzemeyi sınırlı tutun', 'İki ya da üç malzeme (sıva, ahşap, taş) cepheyi sade ve güçlü gösterir.'], ['Bahçe aydınlatması', 'Yürüyüş yolunu ve ağaçları alttan aydınlatın; ev geceleri de güzel görünür.'], ['Yalıtıma yatırım', 'İyi bir mantolama ısınma giderini düşürür ve evin değerini artırır.']],
  },
}
function galeriGoster(anahtar) {
  const g = GALERI[anahtar], alan = $('#galeri'), ipucu = $('#ipucu')
  if (!g || !alan) return
  document.querySelectorAll('.sekmeler button').forEach((b) => b.classList.toggle('aktif', b.dataset.k === anahtar))
  alan.innerHTML = g.gorseller.map(([dosya, yazi, genis]) => `<figure class="${genis ? 'genis' : ''}" data-belir><img src="/img/${dosya}.jpg" alt="${kacis(yazi)}" loading="lazy"><figcaption>${kacis(yazi)}</figcaption></figure>`).join('')
  ipucu.innerHTML = g.ipucu.map(([b, m]) => `<div><b>${kacis(b)}</b>${kacis(m)}</div>`).join('')
  belirmeyiBaslat()
}
if ($('#galeri')) {
  $('.sekmeler').innerHTML = Object.entries(GALERI).map(([k, v]) => `<button type="button" data-k="${k}">${v.ad}</button>`).join('')
  $('.sekmeler').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) galeriGoster(b.dataset.k) })
  galeriGoster('salon')
  const buyutec = $('#buyutec')
  $('#galeri').addEventListener('click', (e) => {
    const img = e.target.closest('figure')?.querySelector('img')
    if (!img) return
    buyutec.querySelector('img').src = img.src
    buyutec.querySelector('img').alt = img.alt
    buyutec.classList.add('acik')
  })
  buyutec.addEventListener('click', () => buyutec.classList.remove('acik'))
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') buyutec.classList.remove('acik') })
}

// ---- Blog ----
const kartYaz = (y) => `<a class="kart" href="/blog/${encodeURIComponent(y.slug)}" data-belir>
  ${y.kapak ? `<img src="${kacis(y.kapak)}" alt="" loading="lazy">` : ''}
  <div class="kart-ic"><span class="kategori">${kacis(y.kategori)}</span><h3>${kacis(y.baslik)}</h3>${y.ozet ? `<p>${kacis(y.ozet)}</p>` : ''}<span class="tarih">${tarihYaz(y.yayin_tarihi)} · Devamını oku →</span></div>
</a>`
async function yazilariYukle() {
  const alan = $('#yazilar')
  if (!alan) return
  const sinir = Number(alan.dataset.sinir || 0)
  let yazilar = []
  try {
    yazilar = await sorgu(`blog_yazilari?site=eq.ayaz&yayinda=eq.true&select=slug,baslik,ozet,kategori,kapak,yayin_tarihi&order=yayin_tarihi.desc${sinir ? '&limit=' + sinir : ''}`)
  } catch (e) { alan.innerHTML = '<p class="bos">Yazılar şu anda yüklenemedi. Biraz sonra tekrar deneyin.</p>'; return }
  if (!yazilar.length) { alan.innerHTML = '<p class="bos">Yakında burada ev, dekorasyon ve kira üzerine yazılarımız olacak.</p>'; return }
  const filtre = $('#filtre')
  const ciz = (k) => {
    alan.innerHTML = yazilar.filter((y) => !k || y.kategori === k).map(kartYaz).join('')
    belirmeyiBaslat()
  }
  if (filtre) {
    const kategoriler = [...new Set(yazilar.map((y) => y.kategori).filter(Boolean))]
    if (kategoriler.length > 1) {
      filtre.innerHTML = ['', ...kategoriler].map((k) => `<button type="button" data-k="${kacis(k)}" class="${k ? '' : 'aktif'}">${k ? kacis(k) : 'Tümü'}</button>`).join('')
      filtre.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return
        filtre.querySelectorAll('button').forEach((x) => x.classList.toggle('aktif', x === b))
        ciz(b.dataset.k)
      })
    }
  }
  ciz('')
}
yazilariYukle()

// Yazı gövdesi Emlak Panelim panelindeki biçimle aynıdır: boş satır paragrafı ayırır, "## " ara başlık,
// "- " madde listesi, tek başına "![açıklama](adres)" satırı görsel.
function icerikYaz(metin) {
  return String(metin ?? '').replace(/\r/g, '').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((b) => {
    if (b.startsWith('## ')) return `<h2>${kacis(b.slice(3))}</h2>`
    const g = b.match(/^!\[([^\]]*)\]\((https:\/\/[^\s)]+)\)$/)
    if (g) return `<figure><img src="${kacis(g[2])}" alt="${kacis(g[1])}" loading="lazy">${g[1] ? `<figcaption>${kacis(g[1])}</figcaption>` : ''}</figure>`
    const satirlar = b.split('\n')
    if (satirlar.every((s) => /^[-•]\s+/.test(s))) return `<ul>${satirlar.map((s) => `<li>${kacis(s.replace(/^[-•]\s+/, ''))}</li>`).join('')}</ul>`
    return `<p>${satirlar.map(kacis).join('<br>')}</p>`
  }).join('')
}
async function yaziYukle() {
  const alan = $('#yazi')
  if (!alan) return
  const slug = decodeURIComponent(location.pathname.replace(/^\/blog\//, '').replace(/\/+$/, ''))
  let y = null
  try { y = (await sorgu(`blog_yazilari?site=eq.ayaz&yayinda=eq.true&slug=eq.${encodeURIComponent(slug)}&select=*`))[0] ?? null } catch (e) { /* bulunamadı gibi davran */ }
  if (!y) {
    $('#yazi-baslik').textContent = 'Yazı bulunamadı'
    $('#yazi-bilgi').textContent = 'Aradığınız yazı kaldırılmış ya da adresi değişmiş olabilir.'
    alan.innerHTML = '<p><a class="btn btn-koyu" href="/blog">Tüm yazılar</a></p>'
    return
  }
  document.title = `${y.baslik} — Ayaz Gayrimenkul`
  const aciklama = y.ozet || y.baslik
  document.querySelector('meta[name="description"]')?.setAttribute('content', aciklama)
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', location.origin + '/blog/' + encodeURIComponent(y.slug))
  $('#yazi-baslik').textContent = y.baslik
  $('#yazi-bilgi').textContent = `${y.kategori} · ${tarihYaz(y.yayin_tarihi)}`
  alan.innerHTML = `${y.kapak ? `<img class="kapak" src="${kacis(y.kapak)}" alt="">` : ''}${y.ozet ? `<p class="ozet">${kacis(y.ozet)}</p>` : ''}${icerikYaz(y.icerik)}`
  const veri = document.createElement('script')
  veri.type = 'application/ld+json'
  veri.text = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BlogPosting', headline: y.baslik, description: aciklama, datePublished: y.yayin_tarihi, dateModified: y.guncellenme || y.yayin_tarihi, image: y.kapak || undefined, author: { '@type': 'Organization', name: 'Ayaz Gayrimenkul Danışmanlığı' }, publisher: { '@type': 'Organization', name: 'Ayaz Gayrimenkul Danışmanlığı' }, mainEntityOfPage: location.href })
  document.head.appendChild(veri)
}
yaziYukle()

const yil = $('#yil'); if (yil) yil.textContent = new Date().getFullYear()
