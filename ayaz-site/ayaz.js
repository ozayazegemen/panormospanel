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
// Döviz, altın ve otomatik kira artış oranı tek istekle gelir
let piyasaSozu = null
const piyasaVerisi = () => (piyasaSozu ??= fetch('/.netlify/functions/piyasa').then((r) => (r.ok ? r.json() : Promise.reject(new Error('alınamadı')))))
async function piyasaYukle() {
  const fiyatlar = $('#fiyatlar'), guncelleme = $('#guncelleme'), kaynak = $('#kaynak')
  if (!fiyatlar) return
  try {
    const v = await piyasaVerisi()
    if (!(v.doviz?.length || v.altin?.length)) throw new Error('boş')
    const kalemler = [...(v.doviz ?? []), ...(v.altin ?? [])]
    fiyatlar.innerHTML = kalemler.map((k) => `<div class="fiyat"><small>${kacis(k.ad)}</small><b>${para(k.satis)} ₺</b>${degisimYaz(k.degisim)}</div>`).join('')
    if (guncelleme && v.guncelleme) guncelleme.textContent = 'Son güncelleme: ' + v.guncelleme
    if (kaynak && v.kaynak) kaynak.textContent = ' Kaynak: ' + v.kaynak + '.'
  } catch (e) {
    fiyatlar.innerHTML = '<p class="not">Fiyatlar şu anda alınamıyor. Birkaç dakika sonra tekrar deneyin.</p>'
  }
}
piyasaYukle()

async function kiraOraniYukle() {
  const kutu = $('#kira-kutu')
  if (!kutu) return
  // Oran TÜİK verisinden kendiliğinden hesaplanır (sunucu işlevi); alınamazsa panelde elle girilen orana düşülür
  let oran = '', donem = '', not = ''
  try {
    const k = (await piyasaVerisi()).kira
    if (k && k.oran > 0) {
      oran = para(k.oran)
      donem = `(${k.uygulama})`
      not = `Yenileme ayı ${k.uygulama} olan konut kira sözleşmelerinde uygulanabilecek en yüksek artış oranı. TÜİK ${k.veri} TÜFE verisine göre on iki aylık ortalama değişim; her ay kendiliğinden güncellenir.`
    }
  } catch (e) { /* aşağıda elle girilen orana bakılır */ }
  if (!oran) {
    try {
      const p = (await sorgu('sistem_ayarlari?select=piyasa&id=eq.true'))[0]?.piyasa ?? {}
      oran = String(p.kira_artis ?? '').trim(); donem = p.kira_donem || ''; not = p.kira_not || ''
    } catch (e) { /* oran yoksa hesaplayıcı elle çalışır */ }
  }
  if (oran) {
    $('#kira-oran').textContent = '%' + oran
    $('#kira-donem').textContent = donem
    if (not) $('#kira-not').textContent = not
    $('#oran-gir').value = oran
    $('#kira-oran-alan').hidden = false
  }
  hesapla()
}
// Tutar kutularında nokta her zaman binlik ayıracıdır, kuruş virgülle yazılır: "18.500" → 18500, "1.8500" → 18500
const tutarOku = (v) => {
  const m = String(v ?? '').replace(/[^\d,]/g, '').replace(',', '.')
  const n = Number(m)
  return m && Number.isFinite(n) ? n : NaN
}
function sayiOku(v) {
  const m = String(v ?? '').replace(/[%\s₺]/g, '')
  const n = Number(m.includes(',') ? m.replace(/\./g, '').replace(',', '.') : m.replace(/\.(?=\d{3}(\D|$))/g, ''))
  return Number.isFinite(n) ? n : NaN
}
function hesapla() {
  const kira = tutarOku($('#kira-gir')?.value), oran = sayiOku($('#oran-gir')?.value), sonuc = $('#kira-sonuc')
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
  const ilk = new URLSearchParams(location.search).get('k') || ''
  if (ilk && filtre) filtre.querySelectorAll('button').forEach((x) => x.classList.toggle('aktif', x.dataset.k === ilk))
  ciz(yazilar.some((y) => y.kategori === ilk) ? ilk : '')
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
  }).join('').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
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

// ---- Talep formu: ev arayan ya da mülkünü satmak / kiralamak isteyen ziyaretçi ----
// Talep Emlak Panelim'de Ayaz Gayrimenkul'ün Talepler sayfasına "yeni" olarak düşer.
const TALEP_ADRESI = 'https://emlakpanelim.com/.netlify/functions/site-talep'
const talepForm = $('#talep-form')
const formAcilis = Date.now()
function talepTuruAyarla() {
  if (!talepForm) return
  const tip = talepForm.querySelector('input[name="tip"]:checked')?.value
  const arayan = tip === 'alici' || tip === 'kiraci'
  $('#t-bolge-etiket').textContent = arayan ? 'Aradığınız bölge ya da mahalle' : 'Mülkünüzün yeri (mahalle)'
  $('#t-butce-etiket').textContent = arayan ? 'Bütçeniz' : 'Düşündüğünüz fiyat'
  $('#t-butce').placeholder = tip === 'kiraci' || tip === 'kiraya_veren' ? 'Örneğin 20.000 TL / ay' : 'Örneğin 3.500.000 TL'
  // "Fark etmez" yalnızca ev arayanlar için; satan ya da kiraya veren mülkünün oda sayısını bilir
  const farketmez = talepForm.querySelector('#t-oda option.arayana')
  farketmez.hidden = !arayan; farketmez.disabled = !arayan
  if (!arayan && $('#t-oda').value === farketmez.value) $('#t-oda').value = ''
}
function talepSec(tip) {
  const kutu = talepForm?.querySelector(`input[name="tip"][value="${tip}"]`)
  if (kutu) { kutu.checked = true; talepTuruAyarla() }
}
if (talepForm) {
  talepForm.addEventListener('change', (e) => { if (e.target.name === 'tip') talepTuruAyarla() })
  talepTuruAyarla()
  // Telefon: 0 (5XX) XXX XX XX biçiminde yazılır
  $('#t-tel').addEventListener('input', (e) => {
    let r = e.target.value.replace(/\D/g, '').slice(0, 11)
    if (r && r[0] !== '0') r = ('0' + r).slice(0, 11)
    const p = [r.slice(0, 4), r.slice(4, 7), r.slice(7, 9), r.slice(9, 11)].filter(Boolean)
    e.target.value = p.join(' ')
  })
  talepForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const sonuc = $('#talep-sonuc'), dugme = talepForm.querySelector('button[type="submit"]')
    const v = Object.fromEntries(new FormData(talepForm))
    sonuc.className = 'form-sonuc'
    if (String(v.ad_soyad || '').trim().length < 3) { sonuc.className += ' hata'; sonuc.textContent = 'Adınızı ve soyadınızı yazın.'; $('#t-ad').focus(); return }
    if (String(v.telefon || '').replace(/\D/g, '').length < 10) { sonuc.className += ' hata'; sonuc.textContent = 'Telefon numaranızı eksiksiz yazın.'; $('#t-tel').focus(); return }
    if (!v.onay) { sonuc.className += ' hata'; sonuc.textContent = 'Göndermek için onay kutusunu işaretleyin.'; return }
    dugme.disabled = true; dugme.textContent = 'Gönderiliyor…'
    try {
      const r = await fetch(TALEP_ADRESI, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...v, sure_ms: Date.now() - formAcilis }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || 'Talebiniz gönderilemedi.')
      talepForm.reset(); talepTuruAyarla()
      sonuc.className += ' tamam'; sonuc.textContent = 'Teşekkürler, talebiniz bize ulaştı. En kısa sürede sizi arayacağız.'
      try { localStorage.setItem('ayaz_talep_birakti', '1') } catch (h) { /* önemli değil */ }
    } catch (h) {
      sonuc.className += ' hata'; sonuc.textContent = h.message + ' İsterseniz 0536 471 60 12 numarasından bize ulaşabilirsiniz.'
    } finally { dugme.disabled = false; dugme.textContent = 'Talebimi gönder' }
  })
}
// "Ev arıyorum" / "Mülküm var" düğmeleri formu ilgili seçenekle açar
document.querySelectorAll('[data-talep]').forEach((a) => a.addEventListener('click', () => { talepSec(a.dataset.talep); $('#davet')?.setAttribute('hidden', '') }))

// ---- Davet kartı: sayfada bir süre gezinen ziyaretçiye bir kez gösterilir ----
const davet = $('#davet')
if (davet && talepForm) {
  let gosterilmez = false
  try {
    const kapandi = Number(localStorage.getItem('ayaz_davet_kapandi') || 0)
    gosterilmez = localStorage.getItem('ayaz_talep_birakti') === '1' || Date.now() - kapandi < 3 * 86400000
  } catch (h) { /* tarayıcı izin vermiyorsa yine gösterilebilir */ }
  const kapat = () => { davet.hidden = true; try { localStorage.setItem('ayaz_davet_kapandi', String(Date.now())) } catch (h) { /* önemli değil */ } }
  davet.querySelector('.davet-kapat').addEventListener('click', kapat)
  davet.querySelectorAll('a').forEach((a) => a.addEventListener('click', kapat))
  if (!gosterilmez) {
    let goster = () => {
      goster = () => {}
      // Ziyaretçi zaten formun başındaysa kartı gösterme
      const f = talepForm.getBoundingClientRect()
      if (f.top < innerHeight && f.bottom > 0) return
      davet.hidden = false
    }
    setTimeout(() => goster(), 20000)
    addEventListener('scroll', () => { if (scrollY > document.documentElement.scrollHeight * 0.35) goster() }, { passive: true })
  }
}

// ---- Üst şerit: giriş görselinin üstünde saydam, aşağı inince dolu ----
const ust = $('#ust')
if (ust && ust.classList.contains('saydam')) {
  const ayarla = () => ust.classList.toggle('dolu', scrollY > 40 || $('.menu').classList.contains('acik'))
  ayarla()
  addEventListener('scroll', ayarla, { passive: true })
  menuDugme?.addEventListener('click', ayarla)
}

// ---- Girişteki hızlı talep: seçimi forma taşır ----
const hizli = $('#hizli')
if (hizli && talepForm) {
  hizli.addEventListener('submit', (e) => {
    e.preventDefault()
    talepSec($('#h-tip').value)
    if ($('#h-bolge').value.trim()) $('#t-bolge').value = $('#h-bolge').value.trim()
    $('#talep').scrollIntoView({ behavior: 'smooth' })
    setTimeout(() => $('#t-ad').focus({ preventScroll: true }), 700)
  })
}

// ---- Portal: öne çıkanlar ve konu rehberleri ----
const KONULAR = [
  ['Satın alma', '🔑'], ['Satış', '🏷️'], ['Kiralama', '📄'], ['Arsa ve tarla', '🌾'],
  ['Tapu ve hukuk', '⚖️'], ['Kredi ve finans', '💳'], ['Ev tasarımı', '🛋️'], ['Piyasa', '📈'],
]
async function portalYukle() {
  const oneCikan = $('#one-cikan'), rehber = $('#rehber-izgara')
  if (!oneCikan && !rehber) return
  let yazilar = []
  try { yazilar = await sorgu('blog_yazilari?site=eq.ayaz&yayinda=eq.true&select=slug,baslik,ozet,kategori,kapak,yayin_tarihi&order=yayin_tarihi.desc') } catch (e) { /* aşağıda boş gösterilir */ }
  const adres = (y) => '/blog/' + encodeURIComponent(y.slug)
  if (oneCikan) {
    if (!yazilar.length) { oneCikan.innerHTML = '<p class="bos">Yazılar şu anda yüklenemedi.</p>'; return }
    const [m, ...digerleri] = yazilar
    oneCikan.innerHTML = `<a class="manset" href="${adres(m)}">${m.kapak ? `<img src="${kacis(m.kapak)}" alt="">` : ''}<div class="manset-ic"><span class="kategori">${kacis(m.kategori)}</span><h2>${kacis(m.baslik)}</h2>${m.ozet ? `<p>${kacis(m.ozet)}</p>` : ''}</div></a>
      <div class="yan-liste">${digerleri.slice(0, 4).map((y) => `<a class="yan-yazi" href="${adres(y)}">${y.kapak ? `<img src="${kacis(y.kapak)}" alt="" loading="lazy">` : '<span></span>'}<div><small>${kacis(y.kategori)}</small><b>${kacis(y.baslik)}</b></div></a>`).join('')}</div>`
  }
  if (rehber) {
    rehber.innerHTML = KONULAR.filter(([k]) => k !== 'Piyasa' || yazilar.some((y) => y.kategori === k)).slice(0, 6).map(([k, simge]) => {
      const liste = yazilar.filter((y) => y.kategori === k).slice(0, 3)
      return `<article class="rehber" data-belir><div class="rehber-bas"><span aria-hidden="true">${simge}</span><h3>${kacis(k)}</h3></div>
        ${liste.length ? `<ul>${liste.map((y) => `<li><a href="${adres(y)}">${kacis(y.baslik)}</a></li>`).join('')}</ul>` : '<p class="bos-not">Bu konuda yazılarımız hazırlanıyor.</p>'}
        <a class="rehber-tum" href="/blog?k=${encodeURIComponent(k)}">Tümünü gör →</a></article>`
    }).join('')
    belirmeyiBaslat()
  }
  // Ev fikirleri: "Ev tasarımı" yazıları görsel kartlar olarak; panelden yazılan her yeni fikir burada çıkar
  const fikirler = $('#fikirler')
  if (fikirler) {
    const liste = yazilar.filter((y) => y.kategori === 'Ev tasarımı').slice(0, 6)
    fikirler.innerHTML = liste.length ? liste.map((y, i) => `<a class="fikir${i === 0 ? ' genis' : ''}${liste.length % 3 === 2 && i === liste.length - 1 ? ' yatay' : ''}" href="${adres(y)}" data-belir>${y.kapak ? `<img src="${kacis(y.kapak)}" alt="" loading="lazy">` : ''}<div><b>${kacis(y.baslik)}</b>${i === 0 && y.ozet ? `<p>${kacis(y.ozet)}</p>` : ''}<span>Fikri oku →</span></div></a>`).join('') : '<p class="bos">Ev fikirleri yakında burada.</p>'
    belirmeyiBaslat()
  }
}
portalYukle()

// ---- Hesaplama araçları ----
document.querySelectorAll('.arac-sekmeler button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.arac-sekmeler button').forEach((x) => x.classList.toggle('aktif', x === b))
  document.querySelectorAll('[data-arac-govde]').forEach((g) => { g.hidden = g.dataset.aracGovde !== b.dataset.arac })
}))
function tapuHesapla() {
  const bedel = tutarOku($('#tapu-bedel')?.value), alan = $('#tapu-sonuc')
  if (!alan) return
  if (!(bedel > 0)) { alan.innerHTML = 'Satış bedelini yazın.'; return }
  const harc = bedel * 0.02
  alan.innerHTML = `Alıcının ödeyeceği harç<b>${para(harc, 0)} ₺</b><span>Satıcı da ayrıca ${para(harc, 0)} ₺ öder. Toplam harç: ${para(harc * 2, 0)} ₺</span>`
}
function krediHesapla() {
  const tutar = tutarOku($('#kredi-tutar')?.value), faiz = sayiOku($('#kredi-faiz')?.value) / 100, vade = Math.round(sayiOku($('#kredi-vade')?.value)), alan = $('#kredi-sonuc')
  if (!alan) return
  if (!(tutar > 0) || !(faiz >= 0) || !(vade > 0)) { alan.innerHTML = 'Tutar, faiz ve vadeyi yazın.'; return }
  const taksit = faiz === 0 ? tutar / vade : tutar * faiz / (1 - Math.pow(1 + faiz, -vade))
  alan.innerHTML = `Aylık taksit<b>${para(taksit, 0)} ₺</b><span>Toplam geri ödeme: ${para(taksit * vade, 0)} ₺ · Toplam faiz: ${para(taksit * vade - tutar, 0)} ₺</span>`
}
$('#tapu-bedel')?.addEventListener('input', tapuHesapla)
document.querySelectorAll('#kredi-tutar, #kredi-faiz, #kredi-vade').forEach((el) => el.addEventListener('input', krediHesapla))

// ---- Sözlükte arama ----
const sozlukAra = $('#sozluk-ara')
if (sozlukAra) sozlukAra.addEventListener('input', () => {
  const q = sozlukAra.value.trim().toLocaleLowerCase('tr')
  document.querySelectorAll('#sozluk-liste > div').forEach((d) => d.classList.toggle('gizli', !!q && !d.textContent.toLocaleLowerCase('tr').includes(q)))
})

// ---- Tutar kutuları: yazarken binlik nokta konur (15000 → 15.000; kuruş virgülle: 15.000,50) ----
function tutarBicimle(el) {
  const once = el.value, imlecSagi = once.length - (el.selectionStart ?? once.length)
  let [tam, ...kesir] = once.replace(/[^\d,]/g, '').split(',')
  tam = tam.replace(/^0+(?=\d)/, '')
  let yeni = tam.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (kesir.length) yeni += ',' + kesir.join('').slice(0, 2)
  if (yeni === once) return
  el.value = yeni
  const yer = Math.max(0, yeni.length - imlecSagi)
  try { el.setSelectionRange(yer, yer) } catch (e) { /* bazı kutu türleri imleç konumunu desteklemez */ }
}
document.querySelectorAll('#kira-gir, #tapu-bedel, #kredi-tutar, #t-butce').forEach((el) => {
  el.addEventListener('input', () => tutarBicimle(el))
  tutarBicimle(el)
})

const yil = $('#yil'); if (yil) yil.textContent = new Date().getFullYear()
