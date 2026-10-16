// Şehir Restaurant — ortak üst menü, alt bilgi, dil seçimi (TR/EN), fotoğraf görüntüleyici
(function () {
  var TEL = '0532 242 09 66', TEL_LINK = 'tel:+905322420966', WA = '905322420966';
  var ADRES = 'Hacıyusuf Mah. Cumhuriyet Cad. No: 49, Bandırma / Balıkesir';
  var IG = 'https://instagram.com/bandirmasehirrestourant';
  var MENU_LINK = '/m/sehir-restoran';
  var sayfa = document.body.dataset.sayfa || '';

  var linkler = [
    ['hikaye.html', 'Hikâyemiz', 'Our Story', 'hikaye'],
    ['mutfak.html', 'Mutfak', 'Kitchen', 'mutfak'],
    ['bar.html', 'Rakı & Şarap', 'Rakı & Wine', 'bar'],
    ['galeri.html', 'Galeri', 'Gallery', 'galeri'],
    ['iletisim.html', 'İletişim', 'Contact', 'iletisim'],
  ];
  var logo = '<a href="index.html" class="logo" aria-label="Şehir Restaurant"><i></i><b>ŞEHİR</b><small>Restaurant · Bandırma</small></a>';
  var igSvg = '<svg class="ig" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r=".7" fill="currentColor"/></svg>';

  var ust = document.createElement('header');
  ust.className = 'ust' + (document.body.dataset.ustDolu ? ' dolu' : '');
  ust.innerHTML = '<div class="kap ust-ic">' + logo +
    '<nav class="menu" id="menu">' + linkler.map(function (l) {
      return '<a href="' + l[0] + '" class="' + (l[3] === sayfa ? 'aktif' : '') + '" data-tr="' + l[1] + '" data-en="' + l[2] + '">' + l[1] + '</a>';
    }).join('') + '</nav>' +
    '<div class="ust-sag"><a href="' + IG + '" target="_blank" rel="noopener" aria-label="Instagram">' + igSvg + '</a>' +
    '<button class="dil" id="dil" aria-label="Dil / Language"><b>TR</b> | EN</button>' +
    '<a href="rezervasyon.html" class="dugme" data-tr="Rezervasyon" data-en="Book a table">Rezervasyon</a>' +
    '<button class="hamburger" id="hamburger" aria-label="Menü"><span></span><span></span></button></div></div>';
  document.body.prepend(ust);

  var alt = document.createElement('footer');
  alt.className = 'alt';
  alt.innerHTML = '<div class="kap">' + logo +
    '<div class="alt-menu">' + linkler.map(function (l) { return '<a href="' + l[0] + '" data-tr="' + l[1] + '" data-en="' + l[2] + '">' + l[1] + '</a>'; }).join('') +
    '<a href="rezervasyon.html" data-tr="Rezervasyon" data-en="Reservations">Rezervasyon</a></div>' +
    '<div class="alt-bilgi">' + ADRES + '<br><a href="' + TEL_LINK + '">' + TEL + '</a> · <a href="' + IG + '" target="_blank" rel="noopener">@bandirmasehirrestourant</a><br><a href="' + MENU_LINK + '" data-tr="Dijital menü" data-en="Digital menu">Dijital menü</a></div>' +
    '<div class="alt-son">© ' + new Date().getFullYear() + ' Şehir Restaurant · <span data-tr="Tasarım önizlemesi: Panormos Medya · Görseller temsilîdir" data-en="Design preview by Panormos Medya · Images are illustrative">Tasarım önizlemesi: Panormos Medya · Görseller temsilîdir</span></div></div>';
  document.body.appendChild(alt);

  var cubuk = document.createElement('div');
  cubuk.className = 'telefon-cubuk';
  cubuk.innerHTML = '<a href="' + TEL_LINK + '" data-tr="Ara" data-en="Call">Ara</a><a href="rezervasyon.html" data-tr="Rezervasyon" data-en="Book">Rezervasyon</a>';
  document.body.appendChild(cubuk);

  // Menü
  var menu = document.getElementById('menu'), ham = document.getElementById('hamburger');
  ham.onclick = function () { menu.classList.toggle('acik'); ham.classList.toggle('acik'); };
  addEventListener('scroll', function () { ust.classList.toggle('kaydi', scrollY > 40); }, { passive: true });

  // Dil: data-tr / data-en taşıyan her öğe
  var dil = 'tr';
  try { dil = localStorage.getItem('sehir_dil') || 'tr'; } catch (e) {}
  function dilUygula() {
    document.documentElement.lang = dil;
    document.querySelectorAll('[data-en]').forEach(function (el) {
      var v = el.getAttribute('data-' + dil);
      if (v === null) return;
      if (el.hasAttribute('data-ph')) el.placeholder = v; else if (el.hasAttribute('data-html')) el.innerHTML = v; else el.textContent = v;
    });
    document.getElementById('dil').innerHTML = dil === 'tr' ? '<b>TR</b> | EN' : 'TR | <b>EN</b>';
  }
  document.getElementById('dil').onclick = function () { dil = dil === 'tr' ? 'en' : 'tr'; try { localStorage.setItem('sehir_dil', dil); } catch (e) {} dilUygula(); };
  dilUygula();

  // Açılış slaytı
  var slaytlar = [].slice.call(document.querySelectorAll('.acilis .slayt')), s = 0, oynuyor = true, zam;
  function ileri() { slaytlar[s].classList.remove('aktif'); s = (s + 1) % slaytlar.length; slaytlar[s].classList.add('aktif'); }
  if (slaytlar.length > 1) {
    zam = setInterval(ileri, 6500);
    var dd = document.querySelector('.durdur');
    if (dd) dd.onclick = function () { oynuyor = !oynuyor; dd.textContent = oynuyor ? '❚❚' : '▶'; if (oynuyor) zam = setInterval(ileri, 6500); else clearInterval(zam); };
  }

  // Kayan şerit okları
  document.querySelectorAll('[data-serit]').forEach(function (k) {
    var serit = document.getElementById(k.dataset.serit);
    k.querySelector('.s-sol').onclick = function () { serit.scrollBy({ left: -serit.clientWidth * .7, behavior: 'smooth' }); };
    k.querySelector('.s-sag').onclick = function () { serit.scrollBy({ left: serit.clientWidth * .7, behavior: 'smooth' }); };
  });

  // Görünme efekti
  var io = new IntersectionObserver(function (g) { g.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('gor'); io.unobserve(e.target); } }); }, { threshold: .12 });
  document.querySelectorAll('.belir').forEach(function (el) { io.observe(el); });

  // Fotoğraf görüntüleyici: aynı kapsayıcıdaki fotoğraflar arasında oklarla gezilir
  var isik = document.createElement('div');
  isik.className = 'isik';
  isik.innerHTML = '<button class="kapat" aria-label="Kapat">✕</button><button class="sol" aria-label="Önceki">‹</button><img alt=""><button class="sag" aria-label="Sonraki">›</button><div class="sayac"></div>';
  document.body.appendChild(isik);
  var grup = [], i = 0, im = isik.querySelector('img');
  function goster() { im.src = grup[i]; isik.querySelector('.sayac').textContent = (i + 1) + ' / ' + grup.length; }
  function git(y) { i = (i + y + grup.length) % grup.length; goster(); }
  function kapat() { isik.classList.remove('acik'); document.body.style.overflow = ''; }
  isik.querySelector('.sol').onclick = function (e) { e.stopPropagation(); git(-1); };
  isik.querySelector('.sag').onclick = function (e) { e.stopPropagation(); git(1); };
  isik.querySelector('.kapat').onclick = kapat;
  isik.onclick = function (e) { if (e.target === isik) kapat(); };
  addEventListener('keydown', function (e) { if (!isik.classList.contains('acik')) return; if (e.key === 'ArrowLeft') git(-1); if (e.key === 'ArrowRight') git(1); if (e.key === 'Escape') kapat(); });
  var x0 = null;
  isik.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
  isik.addEventListener('touchend', function (e) { if (x0 === null) return; var d = e.changedTouches[0].clientX - x0; if (Math.abs(d) > 40) git(d < 0 ? 1 : -1); x0 = null; });
  document.querySelectorAll('[data-galeri]').forEach(function (kap) {
    var resimler = [].slice.call(kap.querySelectorAll('img'));
    var liste = resimler.map(function (r) { return r.getAttribute('src'); });
    resimler.forEach(function (r, n) { r.parentElement.onclick = function () { grup = liste; i = n; goster(); isik.classList.add('acik'); document.body.style.overflow = 'hidden'; }; });
  });

  // Rezervasyon formu: bilgiler WhatsApp mesajı olarak restorana gider
  var form = document.getElementById('rezForm');
  if (form) form.onsubmit = function (e) {
    e.preventDefault();
    var f = new FormData(form);
    var satir = [
      'Merhaba, Şehir Restaurant için rezervasyon talebi:',
      'Ad soyad: ' + (f.get('ad') || ''),
      'Telefon: ' + (f.get('tel') || ''),
      'Tarih: ' + (f.get('tarih') || '') + ' · Saat: ' + (f.get('saat') || ''),
      'Kişi sayısı: ' + (f.get('kisi') || ''),
      f.get('not') ? 'Not: ' + f.get('not') : '',
    ].filter(Boolean).join('\n');
    window.open('https://wa.me/' + WA + '?text=' + encodeURIComponent(satir), '_blank');
  };
})();
