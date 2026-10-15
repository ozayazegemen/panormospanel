// Edinler Gıda — siteden gelen her form başvurusunu (toptan teklif, şikâyet/dilek/öneri) info@edinlergida.com.tr adresine e-postayla iletir.
// Netlify, doğrulanmış her form başvurusunda "submission-created" adlı bu işlevi kendiliğinden çalıştırır.
// E-posta, info@ hesabının kendi SMTP sunucusundan (mail.edinlergida.com.tr:587) gönderilir; hesabın şifresi Netlify'da
// EDIN_SMTP_SIFRE adlı gizli ortam değişkenindedir (koda yazılmaz). info@ adresine gelen mailin kopyası Ahmet Edin'e de gider.
// Ek paket kullanılmaz: kısa bir SMTP konuşması Node'un kendi net/tls modülleriyle yapılır.
const net = require('net')
const tls = require('tls')

const SUNUCU = 'mail.edinlergida.com.tr'
const PORT = 587
const ADRES = 'info@edinlergida.com.tr'

const FORM_ADLARI = { teklif: 'Toptan teklif talebi', gorus: 'Şikâyet, dilek ve öneri' }
const ALAN_ADLARI = {
  'ad-soyad': 'Ad soyad', firma: 'Firma', sehir: 'Şehir', telefon: 'Telefon', eposta: 'E-posta',
  urun: 'Ürün', tur: 'Konu türü', mesaj: 'Mesaj',
}
const ATLA = new Set(['form-name', 'bot-alani', 'ip', 'user_agent', 'referrer'])

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64')
const baslikKodla = (s) => `=?UTF-8?B?${b64(s)}?=`

// SMTP okuyucu: soketten gelen her şeyi baştan tamponlar (karşılama mesajı kaçmasın), "250-..." satırları sürer, "250 ..." ile biter
function okuyucu(soket) {
  let tampon = '', bekleyen = null
  const dene = () => {
    if (!bekleyen) return
    const satirlar = tampon.split('\r\n')
    for (let i = 0; i < satirlar.length - 1; i++) {
      if (/^\d{3} /.test(satirlar[i])) {
        const metin = satirlar.slice(0, i + 1).join('\r\n')
        tampon = satirlar.slice(i + 1).join('\r\n')
        const b = bekleyen; bekleyen = null; clearTimeout(b.zaman)
        b.coz({ kod: Number(satirlar[i].slice(0, 3)), metin })
        return
      }
    }
  }
  soket.on('data', (p) => { tampon += p.toString('utf8'); dene() })
  soket.on('error', (e) => { if (bekleyen) { const b = bekleyen; bekleyen = null; clearTimeout(b.zaman); b.reddet(e) } })
  return () => new Promise((coz, reddet) => {
    bekleyen = { coz, reddet, zaman: setTimeout(() => { bekleyen = null; reddet(new Error('SMTP yanıt vermedi')) }, 15000) }
    dene()
  })
}

async function komut(soket, oku, satir, beklenen) {
  if (satir !== null) soket.write(satir + '\r\n')
  const y = await oku()
  if (!beklenen.includes(y.kod)) throw new Error(`SMTP ${satir ? satir.split(' ')[0] : 'bağlantı'}: ${y.metin.trim().slice(0, 200)}`)
  return y
}

async function mailGonder({ konu, metin, yanitAdresi }) {
  const sifre = process.env.EDIN_SMTP_SIFRE
  if (!sifre) throw new Error('EDIN_SMTP_SIFRE tanımlı değil')
  let soket = net.connect({ host: SUNUCU, port: PORT })
  let oku = okuyucu(soket)
  await new Promise((coz, reddet) => { soket.once('connect', coz); soket.once('error', reddet) })
  try {
    await komut(soket, oku, null, [220])
    let ehlo = await komut(soket, oku, 'EHLO edinlergida.com.tr', [250])
    if (/STARTTLS/i.test(ehlo.metin)) {
      await komut(soket, oku, 'STARTTLS', [220])
      soket.removeAllListeners('data') // şifreli bağlantıya geçerken eski okuyucu ham baytları almasın
      soket = tls.connect({ socket: soket, servername: SUNUCU, rejectUnauthorized: false })
      oku = okuyucu(soket)
      await new Promise((coz, reddet) => { soket.once('secureConnect', coz); soket.once('error', reddet) })
      ehlo = await komut(soket, oku, 'EHLO edinlergida.com.tr', [250])
    }
    await komut(soket, oku, 'AUTH LOGIN', [334])
    await komut(soket, oku, b64(ADRES), [334])
    await komut(soket, oku, b64(sifre), [235])
    await komut(soket, oku, `MAIL FROM:<${ADRES}>`, [250])
    await komut(soket, oku, `RCPT TO:<${ADRES}>`, [250, 251])
    await komut(soket, oku, 'DATA', [354])
    const govde = b64(metin).replace(/.{76}/g, '$&\r\n')
    const ileti = [
      `From: ${baslikKodla('Edin web sitesi')} <${ADRES}>`,
      `To: <${ADRES}>`,
      ...(yanitAdresi ? [`Reply-To: <${yanitAdresi}>`] : []),
      `Subject: ${baslikKodla(konu)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@edinlergida.com.tr>`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      govde,
      '.',
    ].join('\r\n')
    await komut(soket, oku, ileti, [250])
    soket.write('QUIT\r\n')
  } finally {
    setTimeout(() => soket.destroy(), 500)
  }
}

exports.handler = async (event) => {
  try {
    const { payload } = JSON.parse(event.body || '{}')
    const form = payload?.form_name || payload?.data?.['form-name'] || 'form'
    const veri = payload?.data || {}
    const satirlar = Object.entries(veri)
      .filter(([k, v]) => !ATLA.has(k) && String(v ?? '').trim())
      .map(([k, v]) => `${ALAN_ADLARI[k] || k}: ${String(v).trim()}`)
    const ad = String(veri['ad-soyad'] || '').trim()
    const konu = `Edin web sitesi — ${FORM_ADLARI[form] || form}${ad ? ` (${ad})` : ''}`
    const metin = [
      `edinlergida.com.tr sitesinden yeni bir başvuru geldi.`,
      `Form: ${FORM_ADLARI[form] || form}`,
      `Tarih: ${new Date(payload?.created_at || Date.now()).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}`,
      '',
      ...satirlar,
      '',
      'Bu e-posta web sitesi tarafından otomatik gönderilmiştir.',
    ].join('\n')
    const eposta = String(veri.eposta || '').trim()
    await mailGonder({ konu, metin, yanitAdresi: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(eposta) ? eposta : '' })
    return { statusCode: 200, body: 'gönderildi' }
  } catch (e) {
    console.log('Form bildirimi gönderilemedi: ' + (e?.message || e))
    return { statusCode: 200, body: 'gönderilemedi' }
  }
}
