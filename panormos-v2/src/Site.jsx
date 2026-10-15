import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// panormosmedya.com ana sayfası (giriş yapılmamış ziyaretçinin gördüğü site).
// Tarz: geniş ve eğik büyük başlıklar, içi boş (çizgili) yazılar, numaralı bölümler, eğik kayan şeritler;
// her bölüm ayrı canlı bir renkte. Yazı tipleri index.html'de yüklenir (Unbounded + Manrope).

const ROTATOR = ["KONUŞTURURUZ", "BÜYÜTÜRÜZ", "PARLATIRIZ", "ÖNE ÇIKARIRIZ"];

const HIZMETLER = [
  { renk: "pembe", no: "01", baslik: "Sosyal Medya", metin: "Instagram, Facebook ve YouTube hesaplarını baştan sona yönetiyoruz. Düzenli paylaşım, story ve reels ile takipçini müşteriye dönüştürüyoruz.", etiket: ["Hesap yönetimi", "İçerik takvimi", "Reels & story", "Topluluk yönetimi"] },
  { renk: "mavi", no: "02", baslik: "Reklam & SEO", metin: "Meta reklamlarını doğru kitleye, doğru bütçeyle kurup yönetiyoruz. Google'da bulunman için SEO ve Google İşletme çalışması yapıyoruz.", etiket: ["Meta reklam", "Hedef kitle", "Google İşletme", "SEO"] },
  { renk: "turuncu", no: "03", baslik: "Prodüksiyon", metin: "Çekim ekibimiz işletmene gelir. Tanıtım filmi, ürün ve menü çekimi, mekân fotoğrafı ve havadan drone görüntüsü üretiyoruz.", etiket: ["Tanıtım filmi", "Ürün çekimi", "Menü & mekân", "Drone"] },
  { renk: "sari", no: "04", baslik: "Tasarım", metin: "Sosyal medya görsellerinden logoya, kurumsal kimlikten katalog ve afişe kadar markanı akılda bırakan tasarımlar hazırlıyoruz.", etiket: ["Grafik tasarım", "Logo", "Kurumsal kimlik", "Metin yazarlığı"] },
  { renk: "mor", no: "05", baslik: "Web & Yazılım", metin: "Telefonda kusursuz açılan kurumsal web siteleri, yönetim panelleri ve işine özel yazılımlar geliştiriyoruz.", etiket: ["Kurumsal site", "Yönetim paneli", "Özel yazılım", "Google'da görünürlük"] },
  { renk: "yesil", no: "06", baslik: "Baskı & Promosyon", metin: "Kartvizit, broşür, afiş ve tabeladan tişört, kupa ve çantaya kadar markanı taşıyan her şeyi basıma hazırlıyoruz.", etiket: ["Kartvizit & broşür", "Tabela", "Promosyon ürünleri", "Dijital baskı"] },
];

const ISLER = [
  {
    renk: "mavi", etiket: "Kendi yazılımımız", baslik: "Emlak Panelim", adres: "https://emlakpanelim.com", adresYazi: "emlakpanelim.com", gorsel: "/isler/emlakpanelim.jpg?v=2",
    metin: "Emlak ofisleri için sıfırdan geliştirdiğimiz bulut tabanlı yönetim paneli. İlan, mal sahibi, müşteri talebi, randevu, kira ve satış sözleşmesi tek ekranda; müşterinin aradığı mülk portföyde varsa sistem kendisi eşleştirir.",
    maddeler: ["Talep ile ilanı otomatik eşleştirme", "Sözleşme ve yenileme hatırlatmaları", "Kartla ödeme ve telefona bildirim", "Müşterinin kendisi alabildiği randevu linki"],
  },
  {
    renk: "sari", etiket: "Kurumsal web sitesi", baslik: "Edin Peynir", adres: "https://edinlergida.com.tr", adresYazi: "edinlergida.com.tr", gorsel: "/isler/edin-peynir.jpg?v=2",
    metin: "Bandırmalı beyaz peynir üreticisi Edinler Gıda için markanın renklerinden ve teneke tasarımlarından yola çıkarak hazırladığımız kurumsal site. Çiftlikten sofraya hikâyeyi anlatıyor, toptancıyı teklif formuna yönlendiriyor.",
    maddeler: ["Teneke ve paket ürün sayfaları", "ISO belgeleri ve marka tescilleri", "Toptan teklif ve öneri formları", "Kurumsal e-posta kurulumu"],
  },
  {
    renk: "pembe", etiket: "Kurumsal site ve bilgi portalı", baslik: "Ayaz Gayrimenkul", adres: "https://xn--ayazgayrmenkul-dgc.com", adresYazi: "ayazgayrımenkul.com", gorsel: "/isler/ayaz-gayrimenkul.jpg?v=2",
    metin: "Bandırmalı emlak ofisi Ayaz Gayrimenkul Danışmanlığı için ilan vitrini yerine bilgi veren bir emlak portalı kurduk. Rehberler, emlak sözlüğü ve hesaplayıcılarla güven veriyor; gelen talebi doğrudan ofisin paneline iletiyor.",
    maddeler: ["Otomatik kira artış oranı", "Bankaların güncel kredi oranları", "Canlı altın ve döviz", "Panelden yönetilen blog"],
  },
];

const SURECLER = [
  { baslik: "Tanışırız", metin: "İşletmeni, hedef kitleni ve rakiplerini dinleyip inceleriz. Ne istediğini ve neye ihtiyacın olduğunu netleştiririz." },
  { baslik: "Planlarız", metin: "İçerik takvimi, reklam planı ve çekim günlerini çıkarırız. Bütçen ve takvimin baştan bellidir." },
  { baslik: "Üretiriz", metin: "Çekeriz, tasarlarız, yazarız, yayınlarız. Markan her hafta düzenli olarak görünür olur." },
  { baslik: "Büyütürüz", metin: "Sonuçları ölçer, raporlar ve neyin işe yaradığına göre bir sonraki ayı daha iyi kurarız." },
];

const SERIT_1 = ["Sosyal medya", "Meta reklam", "Reels", "Tanıtım filmi", "Drone çekimi", "Logo", "Web sitesi", "SEO"];
const SERIT_2 = ["Ürün çekimi", "Kurumsal kimlik", "Yazılım", "İçerik üretimi", "Menü çekimi", "Baskı", "Promosyon", "Google İşletme"];

// Kendi ürettiğimiz kısa, neşeli bir müzik döngüsü (Web Audio ile çalınır; dosya ve telif yok).
// Tarayıcılar ses çalmayı ziyaretçi sayfaya en az bir kez tıklamadan başlatmaz:
// üstüne gelince çalar; hiç tıklanmamışsa plağa tıklamak yeter.
function muzikKur() {
  let ctx = null, ana = null, zaman = 0, adim = 0, iv = null, gurultu = null;
  const BPM = 118, ON6 = 60 / BPM / 4;
  const AKOR = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]; // La minör, Fa, Do, Sol
  const MELODI = [76, 0, 72, 0, 74, 76, 0, 79, 77, 0, 76, 0, 72, 0, 74, 0];
  const frek = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function nota(f, t, sure, tip, ses) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tip; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(ses, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + sure);
    o.connect(g); g.connect(ana); o.start(t); o.stop(t + sure + 0.05);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(ana); o.start(t); o.stop(t + 0.25);
  }
  function hihat(t, ses) {
    const k = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    k.buffer = gurultu; f.type = "highpass"; f.frequency.value = 7000;
    g.gain.setValueAtTime(ses, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    k.connect(f); f.connect(g); g.connect(ana); k.start(t); k.stop(t + 0.06);
  }
  function planla() {
    while (zaman < ctx.currentTime + 0.15) {
      const s = adim % 16, ak = AKOR[Math.floor(adim / 16) % 4];
      if (s % 4 === 0) kick(zaman);
      if (s % 2 === 1) hihat(zaman, s % 4 === 3 ? 0.18 : 0.08);
      if (s === 0 || s === 6 || s === 10) nota(frek(ak[0] - 24), zaman, ON6 * 3, "triangle", 0.45);
      if (s % 2 === 0) nota(frek(ak[(s / 2) % 3] + 12), zaman, ON6 * 1.6, "square", 0.045);
      if (s === 0 || s === 8) ak.forEach((m) => nota(frek(m), zaman, ON6 * 7, "sawtooth", 0.035));
      if (MELODI[s] && Math.floor(adim / 16) % 2 === 1) nota(frek(MELODI[s]), zaman, ON6 * 1.8, "triangle", 0.12);
      zaman += ON6; adim++;
    }
  }
  return {
    async baslat() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        const yumusat = ctx.createBiquadFilter(); yumusat.type = "lowpass"; yumusat.frequency.value = 5200;
        ana = ctx.createGain(); ana.gain.value = 0.0001; ana.connect(yumusat); yumusat.connect(ctx.destination);
        gurultu = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
        const v = gurultu.getChannelData(0); for (let i = 0; i < v.length; i++) v[i] = Math.random() * 2 - 1;
      }
      try { await ctx.resume(); } catch (e) {}
      if (ctx.state !== "running") return false;
      ana.gain.cancelScheduledValues(ctx.currentTime);
      ana.gain.setTargetAtTime(0.55, ctx.currentTime, 0.15);
      if (!iv) { zaman = ctx.currentTime + 0.05; adim = 0; iv = setInterval(planla, 25); }
      return true;
    },
    durdur() {
      if (!ctx || !iv) return;
      ana.gain.cancelScheduledValues(ctx.currentTime);
      ana.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
      const eski = iv; iv = null;
      setTimeout(() => clearInterval(eski), 600);
    },
  };
}

function Plak() {
  const muzik = useRef(null);
  const [caliyor, setCaliyor] = useState(false);
  const [tikla, setTikla] = useState(false);
  const al = () => { if (!muzik.current) muzik.current = muzikKur(); return muzik.current; };
  const baslat = async () => { const ok = await al().baslat(); setCaliyor(ok); setTikla(!ok); };
  const durdur = () => { al().durdur(); setCaliyor(false); };
  useEffect(() => () => muzik.current?.durdur(), []);
  return (
    <button
      type="button"
      className={`plak${caliyor ? " caliyor" : ""}`}
      aria-label={caliyor ? "Müziği durdur" : "Müzik dinle"}
      onMouseEnter={baslat}
      onMouseLeave={durdur}
      onClick={() => (caliyor ? durdur() : baslat())}
    >
      <span className="plak-disk">
        <svg className="don-disk" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="100" fill="#111116" />
          {[92, 86, 80, 74, 68, 62, 56, 50].map((r) => <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="1.2" />)}
          <circle cx="100" cy="100" r="38" fill="#F25124" />
          <path d="M100 62 A38 38 0 0 1 138 100 L100 100 Z" fill="#FF2E88" />
          <path d="M100 138 A38 38 0 0 1 62 100 L100 100 Z" fill="#FFD23F" />
          <text x="100" y="86" textAnchor="middle" fontFamily="Unbounded, sans-serif" fontWeight="800" fontSize="11" fill="#fff">panormos</text>
          <text x="100" y="122" textAnchor="middle" fontFamily="Unbounded, sans-serif" fontWeight="800" fontSize="11" fill="#0E0E14">medya</text>
          <circle cx="100" cy="100" r="5" fill="#FFF6EA" />
        </svg>
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <path d="M100 100 L40 12 A100 100 0 0 1 100 0 Z" fill="rgba(255,255,255,.10)" />
          <path d="M100 100 L160 188 A100 100 0 0 1 100 200 Z" fill="rgba(255,255,255,.08)" />
        </svg>
        <span className="nota" aria-hidden="true">♪</span><span className="nota n2" aria-hidden="true">♫</span><span className="nota n3" aria-hidden="true">♪</span>
      </span>
      <span className="plak-yazi">{caliyor ? "çalıyor ♪" : tikla ? "tıkla, dinle :)" : "dinle :)"}</span>
    </button>
  );
}

// İlk ekranda balon gibi uçuşan platform logoları (sade çizimler)
const BALONLAR = [
  { ad: "TikTok", sinif: "b1", ikon: (
    <svg viewBox="0 0 48 48"><g fill="none" strokeWidth="5" strokeLinecap="round"><path d="M27 9v22a7 7 0 1 1-7-7" stroke="#25F4EE" transform="translate(-1.5 -1.5)" /><path d="M27 9v22a7 7 0 1 1-7-7" stroke="#FE2C55" transform="translate(1.5 1.5)" /><path d="M27 9v22a7 7 0 1 1-7-7M27 9c1 5 5 8 10 8" stroke="#111" /></g></svg>
  ) },
  { ad: "Instagram", sinif: "b2", ikon: (
    <svg viewBox="0 0 48 48"><defs><linearGradient id="pm-ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#FEDA75" /><stop offset=".35" stopColor="#FA7E1E" /><stop offset=".6" stopColor="#D62976" /><stop offset="1" stopColor="#4F5BD5" /></linearGradient></defs><rect x="7" y="7" width="34" height="34" rx="10" fill="url(#pm-ig)" /><circle cx="24" cy="24" r="7.5" fill="none" stroke="#fff" strokeWidth="3.5" /><circle cx="33" cy="15" r="2.3" fill="#fff" /></svg>
  ) },
  { ad: "YouTube", sinif: "b3", ikon: (
    <svg viewBox="0 0 48 48"><rect x="5" y="11" width="38" height="26" rx="8" fill="#FF0000" /><path d="M20 17.5v13l11-6.5z" fill="#fff" /></svg>
  ) },
  { ad: "X", sinif: "b4", ikon: (
    <svg viewBox="0 0 48 48"><path d="M12 11h7l17 26h-7z" fill="#111" /><path d="M35 11 13 37" stroke="#111" strokeWidth="3.5" strokeLinecap="round" /></svg>
  ) },
  { ad: "Facebook", sinif: "b5", ikon: (
    <svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="#1877F2" /><path d="M26.5 40V27h4.2l.7-5h-4.9v-3.1c0-1.4.5-2.4 2.5-2.4h2.6v-4.4c-.5-.1-2-.2-3.8-.2-3.7 0-6.2 2.3-6.2 6.4V22h-4.2v5h4.2v13" fill="#fff" /></svg>
  ) },
  { ad: "Meta", sinif: "b6", ikon: (
    <svg viewBox="0 0 48 48"><defs><linearGradient id="pm-meta" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0064E0" /><stop offset="1" stopColor="#0082FB" /></linearGradient></defs><path d="M9 30c0-9 5-15 9.5-15 4 0 6.5 4 10.5 11s5.5 9 8 9c2.5 0 3.5-2.5 3.5-6 0-6-3-14-8-14-3.5 0-6 4-9.5 10S16 35 12.5 35C10 35 9 33 9 30Z" fill="none" stroke="url(#pm-meta)" strokeWidth="4.2" strokeLinejoin="round" /></svg>
  ) },
  { ad: "Google", sinif: "b7", ikon: (
    <svg viewBox="0 0 48 48"><g fill="none" strokeWidth="6.5"><path d="M36.5 15.5A15 15 0 0 0 10.7 17" stroke="#EA4335" /><path d="M10.7 17a15 15 0 0 0 0 14" stroke="#FBBC05" /><path d="M10.7 31a15 15 0 0 0 24.6 3.4" stroke="#34A853" /><path d="M35.3 34.4A15 15 0 0 0 39 24H24" stroke="#4285F4" /></g></svg>
  ) },
];

const blogTarihi = (t) => (t ? new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : "");

function Serit({ kelimeler, sinif }) {
  const parca = kelimeler.map((k, i) => <span key={i}>{k}<i>✶</i></span>);
  return (
    <div className={`serit ${sinif}`} aria-hidden="true">
      <div className="serit-ic"><div>{parca}</div><div>{parca}</div></div>
    </div>
  );
}

export default function Site({ onEnter }) {
  const [menu, setMenu] = useState(false);
  const [kelime, setKelime] = useState(0);
  const [kaydi, setKaydi] = useState(false);
  const [yazilar, setYazilar] = useState([]);

  useEffect(() => {
    // Panel html/body/#root'a taşma kilidi koymuş olabilir: site için kaydırmayı serbest bırak
    const html = document.documentElement, body = document.body, root = document.getElementById("root");
    const once = { hh: html.style.height, ho: html.style.overflow, bh: body.style.height, bo: body.style.overflow, bp: body.style.position, rh: root?.style.height, ro: root?.style.overflow };
    html.style.height = "auto"; html.style.overflow = "auto";
    body.style.height = "auto"; body.style.overflow = "auto"; body.style.position = "static";
    if (root) { root.style.height = "auto"; root.style.overflow = "visible"; }
    window.scrollTo(0, 0);
    // Blogdan "/#lp-iletisim" gibi bir bağlantıyla gelindiyse o bölüme in
    const hedef = /^#lp-[a-z]+$/.test(window.location.hash) ? window.location.hash.slice(1) : "";
    const hz = hedef ? setTimeout(() => document.getElementById(hedef)?.scrollIntoView(), 150) : null;

    const kaydir = () => setKaydi(window.scrollY > 30);
    window.addEventListener("scroll", kaydir, { passive: true });
    const iv = setInterval(() => setKelime((k) => (k + 1) % ROTATOR.length), 2400);

    const io = new IntersectionObserver((g) => g.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("gor"); io.unobserve(e.target); } }), { threshold: 0.12 });
    const gozle = () => document.querySelectorAll(".pm-site .belir:not(.gor)").forEach((el) => io.observe(el));
    gozle();
    window.__pmGozle = gozle; // blog kartları sonradan gelince yeniden çağrılır

    supabase.from("blog_yazilari").select("id, slug, baslik, ozet, kategori, kapak, yayin_tarihi").eq("yayinda", true)
      .order("yayin_tarihi", { ascending: false }).limit(3)
      .then(({ data }) => setYazilar(data || []), () => {});

    return () => {
      window.removeEventListener("scroll", kaydir); clearInterval(iv); io.disconnect(); delete window.__pmGozle; if (hz) clearTimeout(hz);
      html.style.height = once.hh; html.style.overflow = once.ho; body.style.height = once.bh; body.style.overflow = once.bo; body.style.position = once.bp;
      if (root) { root.style.height = once.rh; root.style.overflow = once.ro; }
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "auto";
  }, [menu]);

  useEffect(() => { if (yazilar.length) window.__pmGozle?.(); }, [yazilar]);

  const kapat = () => setMenu(false);
  const ig = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" /></svg>
  );
  const wa = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" /></svg>
  );

  return (
    <div className="pm-site">
      <style>{SITE_CSS}</style>

      <nav className={`ust${kaydi ? " kaydi" : ""}${menu ? " menu-acik" : ""}`}>
        <a href="#lp-top" className="logo" onClick={kapat}>panormos<b>medya</b><i>.</i></a>
        <div className={`baglantilar${menu ? " acik" : ""}`}>
          <a href="#lp-hizmetler" onClick={kapat}>Hizmetler</a>
          <a href="#lp-isler" onClick={kapat}>İşlerimiz</a>
          <a href="#lp-surec" onClick={kapat}>Nasıl çalışırız</a>
          <a href="/blog" onClick={kapat}>Blog</a>
          <a href="#lp-iletisim" onClick={kapat}>İletişim</a>
          <a href="https://instagram.com/panormosmedya" target="_blank" rel="noopener" className="ig" aria-label="Instagram">{ig}<span> Instagram</span></a>
          <button type="button" className="giris" onClick={() => { kapat(); onEnter?.(); }}>Giriş yap</button>
          <a href="#lp-iletisim" className="dugme pembe" onClick={kapat}>Teklif al</a>
        </div>
        <button className={`hamburger${menu ? " acik" : ""}`} aria-label="Menü" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><span /><span /></button>
      </nav>

      {/* HERO */}
      <header id="lp-top" className="hero">
        <div className="sekil s1" aria-hidden="true" />
        <div className="sekil s2" aria-hidden="true" />
        <div className="kap">
          <span className="ust-etiket"><span className="nabiz" />Bandırma'dan dijital ajans</span>
          <h1>
            <span className="satir dolu">MARKANI</span>
            <span className="satir cizgi">DİJİTALDE</span>
            <span className="satir donen" key={kelime}><span>{ROTATOR[kelime]}</span></span>
          </h1>
          <div className="hero-alt">
            <p>Sosyal medya, reklam, çekim, tasarım ve yazılım tek çatı altında. Markanı görünür, aranır ve konuşulur yapan ekip.</p>
            <div className="dugmeler">
              <a href="#lp-iletisim" className="dugme pembe buyuk">Teklif al →</a>
              <a href="https://wa.me/905364716012" target="_blank" rel="noopener" className="dugme yesil-wa buyuk">{wa} WhatsApp'tan yaz</a>
            </div>
          </div>
        </div>
        <div className="balonlar" aria-hidden="true">
          {BALONLAR.map((b) => (
            <span key={b.ad} className={`balon ${b.sinif}`} title={b.ad}>
              <span className="balon-yuz">{b.ikon}</span>
              <svg className="balon-ip" viewBox="0 0 20 70"><path d="M10 0 C2 18 18 30 10 46 C4 58 14 64 10 70" /></svg>
            </span>
          ))}
        </div>
        <Plak />
      </header>

      <div className="seritler">
        <Serit kelimeler={SERIT_1} sinif="sari" />
        <Serit kelimeler={SERIT_2} sinif="pembe ters" />
      </div>

      {/* 01 BİZ KİMİZ */}
      <section className="bolum koyu" id="lp-hakkimizda">
        <div className="kap">
          <div className="no belir">01 — Biz kimiz?</div>
          <h2 className="dev belir"><span className="dolu">KÜÇÜK EKİP</span><span className="cizgi renkli">BÜYÜK İŞLER</span></h2>
          <div className="iki-sutun">
            <p className="belir">Panormos Medya, markaların dijitalde hak ettiği yeri alması için kuruldu. Aynı masada içerik üreten, çeken, tasarlayan ve kod yazan bir ekibiz. Bu yüzden işin bir parçasını başka yere taşımadan, her şeyi tek elden çıkarıyoruz.</p>
            <p className="belir">Amacımız güzel paylaşım yapmakla bitmiyor. Markanı tanıyıp hedef kitlenle bağ kuran, satışa ve bilinirliğe dönüşen işler çıkarıyoruz. Ne yaptığımızı her ay açıkça raporluyoruz.</p>
          </div>
          <div className="kartlar3">
            <div className="kutu turuncu belir"><strong>Tek çatı</strong><span>Sosyal medyadan yazılıma kadar bütün dijital işlerin tek ekipte.</span></div>
            <div className="kutu mavi belir"><strong>Yerinde çekim</strong><span>Çekim ekibimiz işletmene gelir; ürün, mekân ve tanıtım filmi.</span></div>
            <div className="kutu sari belir"><strong>Kendi yazılımımız</strong><span>Emlak Panelim'i sıfırdan biz geliştirdik; yazılımı da biliyoruz.</span></div>
          </div>
        </div>
      </section>

      {/* 02 HİZMETLER */}
      <section className="bolum krem" id="lp-hizmetler">
        <div className="kap">
          <div className="no belir">02 — Ne yapıyoruz?</div>
          <h2 className="dev koyu-yazi belir"><span className="dolu">HER ŞEY</span><span className="cizgi">TEK ÇATIDA</span></h2>
          <div className="hizmetler">
            {HIZMETLER.map((h) => (
              <article key={h.no} className={`hizmet ${h.renk} belir`}>
                <span className="h-no">{h.no}</span>
                <h3>{h.baslik}</h3>
                <p>{h.metin}</p>
                <div className="cipler">{h.etiket.map((e) => <span key={e}>{e}</span>)}</div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 03 İŞLER */}
      <section className="bolum beyaz" id="lp-isler">
        <div className="kap">
          <div className="no belir">03 — İşlerimiz</div>
          <h2 className="dev koyu-yazi belir"><span className="dolu">YAPTIK,</span><span className="cizgi">YAYINDA.</span></h2>
          <div className="isler">
            {ISLER.map((p, i) => (
              <article key={p.baslik} className={`is ${p.renk}${i % 2 ? " ters" : ""} belir`}>
                <a className="is-gorsel" href={p.adres} target="_blank" rel="noopener" aria-label={`${p.baslik} sitesini aç`}>
                  <img src={p.gorsel} alt={`${p.baslik}: bilgisayar ve telefon görünümü`} width="1600" height="1000" loading="lazy" />
                </a>
                <div className="is-metin">
                  <span className="is-etiket">{p.etiket}</span>
                  <h3>{p.baslik}</h3>
                  <p>{p.metin}</p>
                  <ul>{p.maddeler.map((m) => <li key={m}>{m}</li>)}</ul>
                  <a href={p.adres} target="_blank" rel="noopener" className="dugme koyu">{p.adresYazi} →</a>
                </div>
              </article>
            ))}
          </div>
          <div className="is-cta belir"><a href="#lp-iletisim" className="dugme turuncu buyuk">Sıradaki iş senin markan olsun →</a></div>
        </div>
      </section>

      {/* 04 SÜREÇ */}
      <section className="bolum elektrik" id="lp-surec">
        <div className="kap">
          <div className="no belir">04 — Nasıl çalışırız?</div>
          <h2 className="dev belir"><span className="dolu">DÖRT ADIM</span><span className="cizgi">NET SONUÇ</span></h2>
          <div className="surec">
            {SURECLER.map((s, i) => (
              <div key={s.baslik} className="adim belir">
                <span className="adim-no">0{i + 1}</span>
                <h3>{s.baslik}</h3>
                <p>{s.metin}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BLOG (yayında yazı varsa) */}
      {yazilar.length > 0 && (
        <section className="bolum krem" id="lp-blog">
          <div className="kap">
            <div className="no belir">05 — Blog</div>
            <h2 className="dev koyu-yazi belir"><span className="dolu">OKU,</span><span className="cizgi">UYGULA.</span></h2>
            <div className="bloglar">
              {yazilar.map((y, i) => (
                <a key={y.id} href={`/blog/${y.slug}`} className={`blog-kart ${["pembe", "mavi", "sari"][i % 3]} belir`}>
                  {y.kapak ? <img src={y.kapak} alt="" loading="lazy" /> : <div className="blog-bos" aria-hidden="true" />}
                  <div>
                    <span className="b-kat">{y.kategori}</span>
                    <h3>{y.baslik}</h3>
                    {y.ozet && <p>{y.ozet}</p>}
                    <span className="b-tarih">{blogTarihi(y.yayin_tarihi)} · Oku →</span>
                  </div>
                </a>
              ))}
            </div>
            <div className="is-cta belir"><a href="/blog" className="dugme koyu buyuk">Tüm yazılar →</a></div>
          </div>
        </section>
      )}

      {/* İLETİŞİM */}
      <section className="bolum iletisim" id="lp-iletisim">
        <div className="kap">
          <div className="no belir">{yazilar.length > 0 ? "06" : "05"} — İletişim</div>
          <h2 className="dev belir"><span className="dolu">HADİ</span><span className="cizgi">BAŞLAYALIM!</span></h2>
          <p className="ilet-giris belir">Ücretsiz tanışma görüşmesi için yaz ya da ara. İşletmeni dinleyelim, sana özel teklifini hazırlayalım.</p>
          <div className="ilet-dugmeler belir">
            <a href="https://wa.me/905364716012" target="_blank" rel="noopener" className="dugme beyaz-d buyuk">{wa} WhatsApp</a>
            <a href="tel:+905364716012" className="dugme koyu buyuk">0 (536) 471 60 12</a>
            <a href="https://instagram.com/panormosmedya" target="_blank" rel="noopener" className="dugme cizgili buyuk">{ig} @panormosmedya</a>
          </div>
          <div className="ilet-bilgi belir">
            <div><span>E-posta</span><a href="mailto:info@panormosmedya.com">info@panormosmedya.com</a></div>
            <div><span>Adres</span><p>Paşakent Mahallesi, Şehit Şener Köksal Caddesi No: 6/A, Pervin Sitesi, Bandırma / Balıkesir</p></div>
            <div><span>Ünvan</span><p>Panormos Medya Sanayi ve Ticaret Limited Şirketi</p></div>
          </div>
        </div>
      </section>

      <footer className="alt">
        <div className="kap">
          <div className="alt-ust">
            <a href="#lp-top" className="logo">panormos<b>medya</b><i>.</i></a>
            <div className="alt-linkler">
              <a href="#lp-hizmetler">Hizmetler</a>
              <a href="#lp-isler">İşlerimiz</a>
              <a href="#lp-surec">Nasıl çalışırız</a>
              <a href="/blog">Blog</a>
              <a href="#lp-iletisim">İletişim</a>
              <a onClick={onEnter} role="button" tabIndex={0}>Çalışan girişi</a>
            </div>
          </div>
        </div>
        <div className="alt-dev" aria-hidden="true">
          <div className="alt-dev-ic">
            {[0, 1].map((k) => (
              <div key={k}>
                <span className="d1">PANORMOS</span><span className="c">MEDYA</span><i>✶</i>
                <span className="d2">PANORMOS</span><span className="c">MEDYA</span><i>✶</i>
              </div>
            ))}
          </div>
        </div>
        <div className="kap">
          <div className="alt-son"><span>© {new Date().getFullYear()} Panormos Medya. Tüm hakları saklıdır.</span><span>Bandırma / Balıkesir</span></div>
        </div>
      </footer>

      <a href="https://wa.me/905364716012" target="_blank" rel="noopener" className="wa-sabit" aria-label="WhatsApp'tan yaz">{wa}</a>
    </div>
  );
}

const SITE_CSS = `
.pm-site{--murekkep:#0E0E14;--krem:#FFF6EA;--turuncu:#F25124;--pembe:#FF2E88;--mavi:#2D5BFF;--sari:#FFD23F;--mor:#7B3FF2;--yesil:#B5F23D;--gri:#5B5B6B;
  font-family:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--krem);color:var(--murekkep);line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden;min-height:100vh}
.pm-site *{box-sizing:border-box;margin:0;padding:0}
.pm-site a{color:inherit;text-decoration:none;cursor:pointer}
.pm-site ::selection{background:var(--pembe);color:#fff}
.pm-site .kap{max-width:1240px;margin:0 auto;padding:0 28px;position:relative}

/* Üst menü: yüzen hap */
.pm-site .ust{position:fixed;top:14px;left:14px;right:14px;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 12px 10px 22px;border-radius:22px;background:rgba(14,14,20,.88);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff;transition:top .3s,box-shadow .3s;max-width:1240px;margin:0 auto}
.pm-site .ust.kaydi{top:8px;box-shadow:0 10px 40px rgba(14,14,20,.25)}
.pm-site .ust.menu-acik{backdrop-filter:none;-webkit-backdrop-filter:none;background:var(--murekkep)}
.pm-site .logo{font-family:'Unbounded',sans-serif;font-weight:800;font-size:19px;letter-spacing:-.02em;white-space:nowrap}
.pm-site .logo b{color:var(--turuncu);font-weight:800;margin-left:4px}
.pm-site .logo i{color:var(--pembe);font-style:normal}
.pm-site .baglantilar{display:flex;align-items:center;gap:6px}
.pm-site .baglantilar>a{font-size:14px;font-weight:600;padding:9px 14px;border-radius:12px;transition:background .2s,color .2s}
.pm-site .baglantilar>a:hover{background:rgba(255,255,255,.1)}
.pm-site .baglantilar .ig{display:inline-flex;align-items:center;gap:6px}
.pm-site .baglantilar .giris{font-family:inherit;font-size:14px;font-weight:700;color:#fff;background:none;border:2px solid rgba(255,255,255,.35);border-radius:12px;padding:8px 14px;cursor:pointer;transition:border-color .2s,background .2s}
.pm-site .baglantilar .giris:hover{border-color:#fff;background:rgba(255,255,255,.1)}
.pm-site .baglantilar .ig span{display:none}
.pm-site .hamburger{display:none;width:46px;height:46px;border-radius:14px;border:none;background:var(--turuncu);cursor:pointer;position:relative}
.pm-site .hamburger span{position:absolute;left:13px;right:13px;height:3px;border-radius:2px;background:#fff;transition:transform .3s,top .3s}
.pm-site .hamburger span:first-child{top:17px}.pm-site .hamburger span:last-child{top:26px}
.pm-site .hamburger.acik span:first-child{top:21px;transform:rotate(45deg)}.pm-site .hamburger.acik span:last-child{top:21px;transform:rotate(-45deg)}

/* Düğmeler */
.pm-site .dugme{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-family:'Unbounded',sans-serif;font-weight:700;font-size:14px;padding:12px 20px;border-radius:14px;border:2px solid transparent;transition:transform .2s,box-shadow .2s,background .2s;white-space:nowrap}
.pm-site .dugme:hover{transform:translate(-2px,-2px);box-shadow:4px 4px 0 var(--murekkep)}
.pm-site .dugme.buyuk{font-size:15px;padding:17px 26px;border-radius:16px}
.pm-site .dugme.pembe{background:var(--pembe);color:#fff}
.pm-site .dugme.turuncu{background:var(--turuncu);color:#fff}
.pm-site .dugme.koyu{background:var(--murekkep);color:#fff}
.pm-site .dugme.yesil-wa{background:var(--yesil);color:var(--murekkep);border-color:var(--murekkep)}
.pm-site .dugme.beyaz-d{background:#fff;color:var(--murekkep)}
.pm-site .dugme.cizgili{border-color:#fff;color:#fff}
.pm-site .ust .dugme:hover{box-shadow:4px 4px 0 var(--sari)}

/* Ortak büyük başlık: geniş, eğik; ikinci satır içi boş */
.pm-site .dev,.pm-site h1{font-family:'Unbounded',sans-serif;font-weight:900;text-transform:none;letter-spacing:-.035em;line-height:.95}
.pm-site .dev{font-size:clamp(40px,8.2vw,124px);margin:18px 0 48px;color:#fff}
.pm-site .dev span{display:block;transform:skewX(-9deg);transform-origin:left}
/* İçi boş yazı: yazı tipindeki üst üste binen çizgiler görünmesin diye içi zemin rengiyle doldurulur, kontur arkada kalır */
.pm-site .cizgi{color:var(--zemin);-webkit-text-stroke:4px var(--murekkep);paint-order:stroke fill}
.pm-site .dev .cizgi{-webkit-text-stroke:4px #fff}
.pm-site .dev .cizgi.renkli{-webkit-text-stroke:4px var(--sari)}
.pm-site .koyu-yazi{color:var(--murekkep)}
.pm-site .koyu-yazi .cizgi{-webkit-text-stroke:4px var(--murekkep)}
.pm-site .hero,.pm-site .krem{--zemin:var(--krem)}
.pm-site .koyu,.pm-site .alt{--zemin:var(--murekkep)}
.pm-site .beyaz{--zemin:#fff}
.pm-site .elektrik{--zemin:var(--mavi)}
.pm-site .iletisim .dev .cizgi{color:var(--sari);-webkit-text-stroke:0}
.pm-site .no{font-family:'Unbounded',sans-serif;font-weight:700;font-size:13px;letter-spacing:.22em;text-transform:uppercase;display:flex;align-items:center;gap:14px}
.pm-site .no::after{content:"";flex:1;height:2px;background:currentColor;opacity:.25}

/* HERO */
.pm-site .hero{position:relative;min-height:100vh;padding:150px 0 110px;display:flex;align-items:center;overflow:hidden;background:var(--krem)}
.pm-site .hero .kap{width:100%;z-index:2}
.pm-site .ust-etiket{display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:13px;letter-spacing:.12em;text-transform:uppercase;background:var(--murekkep);color:#fff;padding:10px 16px;border-radius:100px;margin-bottom:28px}
.pm-site .nabiz{width:10px;height:10px;border-radius:50%;background:var(--yesil);box-shadow:0 0 0 0 rgba(181,242,61,.7);animation:pmNabiz 1.8s infinite}
@keyframes pmNabiz{70%{box-shadow:0 0 0 12px rgba(181,242,61,0)}100%{box-shadow:0 0 0 0 rgba(181,242,61,0)}}
.pm-site h1{font-size:clamp(38px,8vw,122px);margin-bottom:34px}
.pm-site h1 .satir{display:block;transform:skewX(-9deg);transform-origin:left}
.pm-site h1 .donen{margin:8px 0 0}
.pm-site h1 .donen span{display:inline-block;background:var(--turuncu);color:#fff;padding:0 .14em .04em;border-radius:.12em;animation:pmDon .5s cubic-bezier(.2,.9,.3,1.3)}
@keyframes pmDon{from{transform:translateY(40%) rotate(-4deg);opacity:0}to{transform:none;opacity:1}}
.pm-site h1 .cizgi{-webkit-text-stroke:5px var(--murekkep)}
.pm-site .hero-alt{display:flex;flex-direction:column;align-items:flex-start;gap:26px;max-width:640px}
.pm-site .hero-alt p{max-width:520px;font-size:clamp(17px,1.7vw,20px);font-weight:600;color:#33333f}
.pm-site .dugmeler{display:flex;flex-wrap:wrap;gap:12px}
.pm-site .sekil{position:absolute;border-radius:50%;z-index:0;filter:saturate(1.1)}
.pm-site .sekil.s1{width:420px;height:420px;background:var(--sari);top:-120px;right:-80px}
.pm-site .sekil.s2{width:260px;height:260px;background:var(--pembe);bottom:-90px;right:22%;border-radius:40% 60% 50% 50%}
.pm-site .sekil.s3{width:150px;height:150px;background:var(--mavi);top:30%;right:6%;border-radius:30px;transform:rotate(18deg)}
.pm-site .balonlar{position:absolute;inset:0;z-index:1;pointer-events:none}
.pm-site .balon{position:absolute;display:flex;flex-direction:column;align-items:center;animation:pmBalon 7s ease-in-out infinite;pointer-events:auto}
.pm-site .balon-yuz{width:78px;height:78px;border-radius:50%;background:#fff;border:3px solid var(--murekkep);box-shadow:5px 5px 0 var(--murekkep),inset -8px -10px 0 rgba(14,14,20,.06);display:flex;align-items:center;justify-content:center;transition:transform .25s}
.pm-site .balon-yuz svg{width:58%;height:58%}
.pm-site .balon:hover .balon-yuz{transform:scale(1.15) rotate(-8deg)}
.pm-site .balon-ip{width:14px;height:52px;margin-top:-2px}
.pm-site .balon-ip path{fill:none;stroke:var(--murekkep);stroke-width:2;stroke-linecap:round}
.pm-site .balon.b1{top:15%;right:35%;animation-delay:-1s}
.pm-site .balon.b2{top:28%;right:20%;animation-delay:-3.5s;animation-duration:8s}
.pm-site .balon.b3{top:13%;right:7%;animation-delay:-2s}
.pm-site .balon.b4{top:46%;right:4%;animation-delay:-5s;animation-duration:6.5s}
.pm-site .balon.b5{bottom:18%;right:43%;animation-delay:-4s;animation-duration:7.5s}
.pm-site .balon.b6{bottom:6%;right:31%;animation-delay:-6s}
.pm-site .balon.b7{top:12%;right:52%;animation-delay:-2.8s;animation-duration:8.5s}
.pm-site .balon.b2 .balon-yuz,.pm-site .balon.b6 .balon-yuz{width:92px;height:92px}
.pm-site .balon.b4 .balon-yuz,.pm-site .balon.b7 .balon-yuz{width:66px;height:66px}
@keyframes pmBalon{0%,100%{transform:translateY(0) rotate(-4deg)}25%{transform:translateY(-14px) rotate(3deg)}50%{transform:translateY(-26px) rotate(-2deg)}75%{transform:translateY(-10px) rotate(4deg)}}
.pm-site .plak{position:absolute;z-index:2;right:8%;bottom:9%;width:170px;display:flex;flex-direction:column;align-items:center;gap:10px;background:none;border:none;cursor:pointer;font-family:inherit;color:var(--murekkep);-webkit-tap-highlight-color:transparent}
.pm-site .plak-disk{position:relative;width:170px;height:170px;border-radius:50%;box-shadow:0 14px 30px rgba(14,14,20,.35),6px 6px 0 var(--murekkep);transition:transform .3s}
.pm-site .plak:hover .plak-disk{transform:scale(1.06)}
.pm-site .plak-disk svg{position:absolute;inset:0;width:100%;height:100%}
.pm-site .plak-disk .don-disk{animation:pmCevir 4s linear infinite}
.pm-site .plak.caliyor .plak-disk .don-disk{animation-duration:1.6s}
.pm-site .plak-yazi{font-family:'Unbounded',sans-serif;font-weight:800;font-size:15px;background:var(--sari);border:2px solid var(--murekkep);box-shadow:3px 3px 0 var(--murekkep);border-radius:100px;padding:6px 14px;transform:rotate(-4deg);white-space:nowrap}
.pm-site .plak.caliyor .plak-yazi{background:var(--yesil)}
.pm-site .plak .nota{position:absolute;font-size:22px;font-weight:900;opacity:0;pointer-events:none}
.pm-site .plak.caliyor .nota{animation:pmNota 1.8s ease-out infinite}
.pm-site .plak .nota.n2{animation-delay:.6s!important;left:10px}
.pm-site .plak .nota.n3{animation-delay:1.2s!important;right:6px}
@keyframes pmNota{0%{opacity:0;transform:translate(0,40px) rotate(-10deg)}20%{opacity:1}100%{opacity:0;transform:translate(14px,-50px) rotate(15deg)}}
@keyframes pmCevir{to{transform:rotate(360deg)}}

/* Eğik kayan şeritler */
.pm-site .seritler{position:relative;height:170px;margin:-40px 0 -30px;z-index:3;overflow:hidden}
.pm-site .serit{position:absolute;left:-5%;right:-5%;top:48px;padding:16px 0;border-top:3px solid var(--murekkep);border-bottom:3px solid var(--murekkep);overflow:hidden;transform:rotate(-3deg)}
.pm-site .serit.sari{background:var(--sari)}
.pm-site .serit.pembe{background:var(--pembe);color:#fff;transform:rotate(2.5deg);top:58px;z-index:-1}
.pm-site .serit-ic{display:flex;width:max-content;animation:pmKay 32s linear infinite}
.pm-site .serit.ters .serit-ic{animation-direction:reverse}
.pm-site .serit-ic>div{display:flex}
.pm-site .serit span{font-family:'Unbounded',sans-serif;font-weight:800;font-size:clamp(18px,2.4vw,30px);text-transform:uppercase;white-space:nowrap;display:flex;align-items:center}
.pm-site .serit i{font-style:normal;margin:0 28px;font-size:.8em}
@keyframes pmKay{to{transform:translateX(-50%)}}

/* Bölümler */
.pm-site .bolum{position:relative;padding:130px 0}
.pm-site .koyu{background:var(--murekkep);color:#fff}
.pm-site .krem{background:var(--krem)}
.pm-site .beyaz{background:#fff}
.pm-site .elektrik{background:var(--mavi);color:#fff}
.pm-site .iki-sutun{display:grid;grid-template-columns:1fr 1fr;gap:40px;font-size:18px;color:rgba(255,255,255,.82);margin-bottom:56px}
.pm-site .kartlar3{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.pm-site .kutu{border-radius:26px;padding:30px;display:flex;flex-direction:column;gap:10px;min-height:190px;justify-content:flex-end;transition:transform .3s}
.pm-site .kutu:hover{transform:rotate(-1.5deg) scale(1.02)}
.pm-site .kutu strong{font-family:'Unbounded',sans-serif;font-size:26px;line-height:1.1}
.pm-site .kutu span{font-weight:600;font-size:15px}
.pm-site .kutu.turuncu{background:var(--turuncu)}
.pm-site .kutu.mavi{background:var(--mavi)}
.pm-site .kutu.sari{background:var(--sari);color:var(--murekkep)}

/* Hizmet kartları */
.pm-site .hizmetler{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.pm-site .hizmet{position:relative;border-radius:28px;padding:34px 30px 30px;border:3px solid var(--murekkep);box-shadow:8px 8px 0 var(--murekkep);transition:transform .25s,box-shadow .25s;overflow:hidden;color:#fff}
.pm-site .hizmet:hover{transform:translate(-4px,-4px) rotate(-.6deg);box-shadow:12px 12px 0 var(--murekkep)}
.pm-site .hizmet.pembe{background:var(--pembe)}
.pm-site .hizmet.mavi{background:var(--mavi)}
.pm-site .hizmet.turuncu{background:var(--turuncu)}
.pm-site .hizmet.sari{background:var(--sari);color:var(--murekkep)}
.pm-site .hizmet.mor{background:var(--mor)}
.pm-site .hizmet.yesil{background:var(--yesil);color:var(--murekkep)}
.pm-site .h-no{position:absolute;top:10px;right:18px;font-family:'Unbounded',sans-serif;font-weight:900;font-size:78px;line-height:1;color:transparent;-webkit-text-stroke:2px currentColor;opacity:.45}
.pm-site .hizmet h3{font-family:'Unbounded',sans-serif;font-weight:800;font-size:26px;line-height:1.1;margin:44px 0 14px;transform:skewX(-6deg);transform-origin:left}
.pm-site .hizmet p{font-size:15.5px;font-weight:600;opacity:.92;margin-bottom:22px}
.pm-site .cipler{display:flex;flex-wrap:wrap;gap:7px}
.pm-site .cipler span{font-size:12.5px;font-weight:800;padding:6px 12px;border-radius:100px;background:rgba(255,255,255,.22);border:1.5px solid currentColor}

/* İşler */
.pm-site .isler{display:flex;flex-direction:column;gap:90px}
.pm-site .is{display:grid;grid-template-columns:1.25fr 1fr;gap:56px;align-items:center}
.pm-site .is.ters .is-gorsel{order:2}
.pm-site .is-gorsel{position:relative;display:block;border-radius:30px;padding:26px;transform:rotate(-1.5deg);transition:transform .35s}
.pm-site .is.ters .is-gorsel{transform:rotate(1.5deg)}
.pm-site .is-gorsel:hover{transform:rotate(0) scale(1.02)}
.pm-site .is.mavi .is-gorsel{background:var(--mavi)}
.pm-site .is.sari .is-gorsel{background:var(--sari)}
.pm-site .is.pembe .is-gorsel{background:var(--pembe)}
.pm-site .is-gorsel img{display:block;width:100%;height:auto;border-radius:16px}
.pm-site .is-etiket{display:inline-block;font-weight:800;font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;padding:7px 13px;border-radius:100px;border:2px solid var(--murekkep);margin-bottom:16px}
.pm-site .is.mavi .is-etiket{background:#dfe6ff}.pm-site .is.sari .is-etiket{background:#fff3c4}.pm-site .is.pembe .is-etiket{background:#ffd9ea}
.pm-site .is h3{font-family:'Unbounded',sans-serif;font-weight:900;font-size:clamp(30px,3.6vw,50px);line-height:1;letter-spacing:-.03em;margin-bottom:18px;transform:skewX(-8deg);transform-origin:left}
.pm-site .is p{font-size:16.5px;color:#3a3a46;margin-bottom:18px}
.pm-site .is ul{list-style:none;display:grid;gap:8px;margin-bottom:26px}
.pm-site .is li{font-weight:700;font-size:15px;display:flex;gap:10px;align-items:flex-start}
.pm-site .is li::before{content:"";flex:0 0 12px;height:12px;margin-top:6px;border-radius:4px;transform:rotate(45deg)}
.pm-site .is.mavi li::before{background:var(--mavi)}.pm-site .is.sari li::before{background:#e8b400}.pm-site .is.pembe li::before{background:var(--pembe)}
.pm-site .is-cta{margin-top:80px;text-align:center}

/* Süreç */
.pm-site .surec{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.pm-site .adim{background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.35);border-radius:26px;padding:28px 24px;transition:background .25s,transform .25s}
.pm-site .adim:hover{background:#fff;color:var(--murekkep);transform:translateY(-6px)}
.pm-site .adim-no{display:block;font-family:'Unbounded',sans-serif;font-weight:900;font-size:64px;line-height:1;color:transparent;-webkit-text-stroke:2px var(--sari);margin-bottom:20px}
.pm-site .adim:hover .adim-no{-webkit-text-stroke-color:var(--mavi)}
.pm-site .adim h3{font-family:'Unbounded',sans-serif;font-weight:800;font-size:22px;margin-bottom:10px}
.pm-site .adim p{font-size:15px;font-weight:600;opacity:.9}

/* Blog */
.pm-site .bloglar{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.pm-site .blog-kart{display:flex;flex-direction:column;border-radius:26px;overflow:hidden;border:3px solid var(--murekkep);background:#fff;box-shadow:6px 6px 0 var(--murekkep);transition:transform .25s,box-shadow .25s}
.pm-site .blog-kart:hover{transform:translate(-3px,-3px);box-shadow:10px 10px 0 var(--murekkep)}
.pm-site .blog-kart img,.pm-site .blog-bos{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;border-bottom:3px solid var(--murekkep)}
.pm-site .blog-kart.pembe .blog-bos{background:var(--pembe)}.pm-site .blog-kart.mavi .blog-bos{background:var(--mavi)}.pm-site .blog-kart.sari .blog-bos{background:var(--sari)}
.pm-site .blog-kart>div{padding:22px}
.pm-site .b-kat{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--turuncu)}
.pm-site .blog-kart h3{font-family:'Unbounded',sans-serif;font-weight:700;font-size:19px;line-height:1.25;margin:8px 0}
.pm-site .blog-kart p{font-size:14.5px;color:#4a4a56;margin-bottom:12px}
.pm-site .b-tarih{font-size:13px;font-weight:700;color:var(--gri)}

/* İletişim */
.pm-site .iletisim{background:linear-gradient(120deg,var(--turuncu) 0%,var(--pembe) 55%,var(--mor) 100%);color:#fff;overflow:hidden}
.pm-site .ilet-giris{font-size:clamp(18px,2vw,22px);font-weight:700;max-width:640px;margin-bottom:34px}
.pm-site .ilet-dugmeler{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:60px}
.pm-site .iletisim .dugme:hover{box-shadow:4px 4px 0 var(--murekkep)}
.pm-site .ilet-bilgi{display:grid;grid-template-columns:1fr 1.4fr 1.2fr;gap:18px}
.pm-site .ilet-bilgi>div{background:rgba(14,14,20,.22);border:2px solid rgba(255,255,255,.35);border-radius:22px;padding:22px}
.pm-site .ilet-bilgi span{display:block;font-family:'Unbounded',sans-serif;font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;opacity:.8;margin-bottom:6px}
.pm-site .ilet-bilgi a,.pm-site .ilet-bilgi p{font-weight:700;font-size:16px}

/* Alt bilgi */
.pm-site .alt{background:var(--murekkep);color:#fff;padding:70px 0 30px;overflow:hidden}
.pm-site .alt-ust{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:20px}
.pm-site .alt-linkler{display:flex;flex-wrap:wrap;gap:6px 22px}
.pm-site .alt-linkler a{font-weight:700;font-size:14.5px;opacity:.8}
.pm-site .alt-linkler a:hover{opacity:1;color:var(--sari)}
.pm-site .alt-dev{margin:48px 0 26px;overflow:hidden;font-family:'Unbounded',sans-serif;font-weight:900;font-size:clamp(46px,8vw,128px);line-height:1.05;letter-spacing:-.04em}
.pm-site .alt-dev-ic{display:flex;width:max-content;animation:pmKay 26s linear infinite}
.pm-site .alt-dev-ic>div{display:flex;align-items:center}
.pm-site .alt-dev span{display:inline-block;padding:0 .18em;transform:skewX(-9deg);white-space:nowrap}
.pm-site .alt-dev .d1{color:var(--turuncu)}
.pm-site .alt-dev .d2{color:var(--pembe)}
.pm-site .alt-dev .c{color:var(--murekkep);-webkit-text-stroke:4px #fff;paint-order:stroke fill}
.pm-site .alt-dev i{font-style:normal;color:var(--sari);font-size:.5em;padding:0 .3em}
.pm-site .alt-dev:hover .alt-dev-ic{animation-play-state:paused}
.pm-site .alt-son{display:flex;margin-top:6px;flex-wrap:wrap;justify-content:space-between;gap:10px;font-size:13px;opacity:.6}

/* Sabit WhatsApp */
.pm-site .wa-sabit{position:fixed;right:18px;bottom:18px;z-index:40;width:58px;height:58px;border-radius:18px;background:#25D366;color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid var(--murekkep);box-shadow:4px 4px 0 var(--murekkep);transition:transform .2s}
.pm-site .wa-sabit svg{width:28px;height:28px}
.pm-site .wa-sabit:hover{transform:translate(-2px,-2px) rotate(-6deg)}

/* Kaydırınca beliren öğeler */
.pm-site .belir{opacity:0;transform:translateY(40px);transition:opacity .7s ease,transform .7s cubic-bezier(.2,.8,.2,1)}
.pm-site .belir.gor{opacity:1;transform:none}
.pm-site .dev.belir.gor span{transform:skewX(-9deg)}

/* Tablet */
@media (max-width:1080px){
  .pm-site .hizmetler{grid-template-columns:repeat(2,1fr)}
  .pm-site .surec{grid-template-columns:repeat(2,1fr)}
  .pm-site .bloglar{grid-template-columns:1fr 1fr}
  .pm-site .balon.b7,.pm-site .balon.b1{display:none}
}
/* Telefon ve küçük tablet: menü tam ekran açılır */
@media (max-width:920px){
  .pm-site .hamburger{display:block}
  .pm-site .baglantilar{position:fixed;inset:0;z-index:-1;flex-direction:column;justify-content:center;align-items:stretch;gap:6px;padding:100px 28px 40px;background:var(--turuncu);opacity:0;pointer-events:none;transition:opacity .3s;border-radius:0}
  .pm-site .baglantilar.acik{opacity:1;pointer-events:auto}
  .pm-site .baglantilar>a{font-family:'Unbounded',sans-serif;font-weight:800;font-size:28px;padding:10px 0;transform:skewX(-8deg)}
  .pm-site .baglantilar>a:hover{background:none;color:var(--sari)}
  .pm-site .baglantilar .ig span{display:inline}
  .pm-site .baglantilar .dugme{margin-top:10px;font-size:18px;padding:18px;transform:none;background:var(--murekkep)}
  .pm-site .baglantilar .giris{margin-top:16px;font-size:17px;padding:15px;border-color:#fff}
  .pm-site .is,.pm-site .is.ters{grid-template-columns:1fr;gap:30px}
  .pm-site .is.ters .is-gorsel{order:0}
  .pm-site .iki-sutun{grid-template-columns:1fr;gap:18px}
  .pm-site .kartlar3{grid-template-columns:1fr}
  .pm-site .kutu{min-height:0}
  .pm-site .ilet-bilgi{grid-template-columns:1fr}
}
@media (max-width:640px){
  .pm-site .kap{padding:0 18px}
  .pm-site .alt-dev .c{-webkit-text-stroke-width:3px}
  .pm-site .ust{left:10px;right:10px;padding:8px 8px 8px 16px}
  .pm-site .logo{font-size:16px}
  .pm-site .hero{padding:130px 0 160px;min-height:auto}
  .pm-site .sekil.s1{width:260px;height:260px;top:-90px;right:-110px}
  .pm-site .sekil.s2{width:160px;height:160px;right:-40px;bottom:-60px}
  .pm-site .balon .balon-yuz{width:50px!important;height:50px!important;box-shadow:3px 3px 0 var(--murekkep)}
  .pm-site .balon-ip{height:30px;width:10px}
  .pm-site .balon.b1,.pm-site .balon.b7{display:flex}
  .pm-site .balon.b1{top:auto;bottom:3%;right:78%}
  .pm-site .balon.b2{top:auto;bottom:6%;right:58%}
  .pm-site .balon.b3{top:auto;bottom:2%;right:40%}
  .pm-site .balon.b4{top:auto;bottom:7%;right:22%}
  .pm-site .balon.b5{bottom:3%;right:4%}
  .pm-site .balon.b6,.pm-site .balon.b7{display:none}
  .pm-site .plak{right:8px;bottom:auto;top:80px;width:80px;gap:6px}
  .pm-site .plak-disk{width:80px;height:80px;box-shadow:0 8px 18px rgba(14,14,20,.3),4px 4px 0 var(--murekkep)}
  .pm-site .plak-yazi{font-size:12px;padding:4px 10px}
  .pm-site h1{font-size:clamp(30px,9.6vw,60px)}
  .pm-site h1 .donen{font-size:.84em}
  .pm-site h1 .cizgi,.pm-site .dev .cizgi,.pm-site .koyu-yazi .cizgi{-webkit-text-stroke-width:3px}
  .pm-site .dugmeler,.pm-site .ilet-dugmeler{flex-direction:column;align-items:stretch;width:100%}
  .pm-site .dugme.buyuk{white-space:normal}
  .pm-site .bolum{padding:90px 0}
  .pm-site .dev{margin-bottom:34px}
  .pm-site .hizmetler,.pm-site .surec,.pm-site .bloglar{grid-template-columns:1fr}
  .pm-site .hizmet{box-shadow:6px 6px 0 var(--murekkep)}
  .pm-site .seritler{height:130px;margin:-30px 0 -20px}
  .pm-site .serit{top:34px;padding:12px 0}.pm-site .serit.pembe{top:44px}
  .pm-site .is-gorsel{padding:14px;border-radius:22px}
  .pm-site .isler{gap:70px}
  .pm-site .wa-sabit{width:52px;height:52px;right:14px;bottom:14px}
}
@media (prefers-reduced-motion:reduce){
  .pm-site *{animation:none!important;transition:none!important}
  .pm-site .belir{opacity:1;transform:none}
}
`;
