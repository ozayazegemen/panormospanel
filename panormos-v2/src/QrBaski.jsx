import QRCode from "qrcode";

// QR menü baskı malzemeleri: ortasında logo olan renkli QR kod, masa kartı (A6) ve afiş (A4).
// Hepsi tarayıcıda çizilir; PNG indirilir ya da yazdırma penceresinden PDF'e kaydedilir.
// Masa numarası verilirse QR adresine ?masa=N eklenir; menü siparişte masa numarasını kendisi bilir.

// Başka sitedeki görseli (logo, kapak) tuvale çizmek için önce indirilir; doğrudan çizilirse tuval "kirlenir" ve dışa aktarılamaz
async function gorselAc(adres) {
  if (!adres) return null;
  try {
    const r = await fetch(adres);
    if (!r.ok) return null;
    const url = URL.createObjectURL(await r.blob());
    return await new Promise((tamam) => {
      const img = new Image();
      img.onload = () => tamam(img);
      img.onerror = () => tamam(null);
      img.src = url;
    });
  } catch (e) { return null; }
}

function yuvarlak(c, x, y, en, boy, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + en, y, x + en, y + boy, r);
  c.arcTo(x + en, y + boy, x, y + boy, r);
  c.arcTo(x, y + boy, x, y, r);
  c.arcTo(x, y, x + en, y, r);
  c.closePath();
}

function kapla(c, img, x, y, en, boy) {
  const o = Math.max(en / img.width, boy / img.height);
  const g = img.width * o, h = img.height * o;
  c.drawImage(img, x + (en - g) / 2, y + (boy - h) / 2, g, h);
}

function sigdir(c, img, x, y, en, boy) {
  const o = Math.min(en / img.width, boy / img.height);
  const g = img.width * o, h = img.height * o;
  c.drawImage(img, x + (en - g) / 2, y + (boy - h) / 2, g, h);
}

// Ortasında logo (yoksa menü adının baş harfi) olan QR kod; yüksek hata düzeltme sayesinde ortası kapansa da okunur
export async function logoluQr(adres, { renk = "#111111", logo = "", ad = "", boyut = 1000 } = {}) {
  const tuval = document.createElement("canvas");
  await QRCode.toCanvas(tuval, adres, { width: boyut, margin: 2, errorCorrectionLevel: "H", color: { dark: renk, light: "#FFFFFF" } });
  const c = tuval.getContext("2d");
  const kutu = boyut * 0.22, x = (boyut - kutu) / 2;
  c.fillStyle = "#FFFFFF";
  yuvarlak(c, x, x, kutu, kutu, kutu * 0.22);
  c.fill();
  const img = await gorselAc(logo);
  if (img) {
    sigdir(c, img, x + kutu * 0.12, x + kutu * 0.12, kutu * 0.76, kutu * 0.76);
  } else {
    c.fillStyle = renk;
    c.font = `800 ${kutu * 0.5}px 'Manrope', system-ui, sans-serif`;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText((ad || "M").trim().charAt(0).toLocaleUpperCase("tr"), boyut / 2, boyut / 2 + kutu * 0.03);
  }
  return tuval;
}

// Masa kartı (A6, 105×148 mm) ya da afiş (A4); 300 dpi'ye yakın çözünürlük
export async function baskiCiz(menu, adres, { bicim = "kart", masa = "" } = {}) {
  const [en, boy] = bicim === "afis" ? [2480, 3508] : [1240, 1748];
  const k = en / 1240; // ölçek
  const tuval = document.createElement("canvas");
  tuval.width = en; tuval.height = boy;
  const c = tuval.getContext("2d");
  const ana = menu.ana_renk || "#2b2b2b", zemin = menu.zemin_renk || "#F4EFE4";
  const yazi = (agirlik, piksel, aile = "'Manrope', system-ui, sans-serif") => { c.font = `${agirlik} ${piksel * k}px ${aile}`; };
  await document.fonts?.ready;

  c.fillStyle = zemin;
  c.fillRect(0, 0, en, boy);

  // Üst bant: kapak fotoğrafı varsa o, yoksa ana renk
  const bant = boy * 0.34;
  const kapak = await gorselAc(menu.kapak);
  if (kapak) {
    c.save(); c.beginPath(); c.rect(0, 0, en, bant); c.clip(); kapla(c, kapak, 0, 0, en, bant); c.restore();
    const g = c.createLinearGradient(0, 0, 0, bant);
    g.addColorStop(0, "rgba(0,0,0,.15)"); g.addColorStop(1, "rgba(0,0,0,.55)");
    c.fillStyle = g; c.fillRect(0, 0, en, bant);
  } else {
    c.fillStyle = ana; c.fillRect(0, 0, en, bant);
  }

  // Logo ya da ad (bandın içinde, ortada)
  const logo = await gorselAc(menu.logo);
  c.textAlign = "center"; c.textBaseline = "alphabetic";
  if (logo) {
    const kutu = 300 * k;
    c.fillStyle = "rgba(255,255,255,.94)";
    c.beginPath(); c.arc(en / 2, bant * 0.52, kutu / 2, 0, Math.PI * 2); c.fill();
    sigdir(c, logo, en / 2 - kutu * 0.34, bant * 0.52 - kutu * 0.34, kutu * 0.68, kutu * 0.68);
  } else {
    c.fillStyle = "#FFFFFF";
    yazi(800, 92, "'Unbounded', 'Manrope', sans-serif");
    c.fillText(String(menu.ad || "").toLocaleUpperCase("tr"), en / 2, bant * 0.52, en - 140 * k);
    if (menu.alt_yazi) { yazi(600, 36); c.globalAlpha = 0.9; c.fillText(String(menu.alt_yazi).toLocaleUpperCase("tr"), en / 2, bant * 0.52 + 70 * k, en - 140 * k); c.globalAlpha = 1; }
  }

  // Başlık
  let y = bant + 150 * k;
  c.fillStyle = ana;
  yazi(800, 76, "'Unbounded', 'Manrope', sans-serif");
  c.fillText("Menümüz için", en / 2, y);
  y += 92 * k;
  c.fillText("okutun", en / 2, y);
  if (menu.iki_dil) { y += 66 * k; yazi(600, 38); c.globalAlpha = 0.7; c.fillText("Scan for our menu", en / 2, y); c.globalAlpha = 1; }

  // QR: beyaz, köşeleri yuvarlak, ana renkte çerçeveli kutu
  const qrBoyut = 640 * k;
  const qx = (en - qrBoyut) / 2, qy = y + 60 * k;
  c.fillStyle = "#FFFFFF";
  c.shadowColor = "rgba(0,0,0,.18)"; c.shadowBlur = 40 * k; c.shadowOffsetY = 14 * k;
  yuvarlak(c, qx - 34 * k, qy - 34 * k, qrBoyut + 68 * k, qrBoyut + 68 * k, 48 * k); c.fill();
  c.shadowColor = "transparent";
  c.strokeStyle = ana; c.lineWidth = 8 * k;
  yuvarlak(c, qx - 34 * k, qy - 34 * k, qrBoyut + 68 * k, qrBoyut + 68 * k, 48 * k); c.stroke();
  const qr = await logoluQr(adres, { renk: ana, logo: menu.logo, ad: menu.ad, boyut: Math.round(qrBoyut) });
  c.drawImage(qr, qx, qy, qrBoyut, qrBoyut);

  // Masa numarası
  let altY = qy + qrBoyut + 130 * k;
  if (masa) {
    yazi(800, 44);
    const metin = `MASA ${masa}`;
    const g = c.measureText(metin).width + 90 * k;
    c.fillStyle = ana; yuvarlak(c, (en - g) / 2, altY - 62 * k, g, 88 * k, 44 * k); c.fill();
    c.fillStyle = "#FFFFFF"; c.textBaseline = "middle"; c.fillText(metin, en / 2, altY - 18 * k); c.textBaseline = "alphabetic";
    altY += 80 * k;
  }

  // Alt bilgi: Wi-Fi yerine adres ve menü bağlantısı
  c.fillStyle = ana; c.globalAlpha = 0.75; yazi(600, 30);
  c.fillText(adres.replace(/^https?:\/\//, "").replace(/\?.*$/, ""), en / 2, boy - 70 * k);
  c.globalAlpha = 1;
  return tuval;
}

export const tuvalPng = (t) => t.toDataURL("image/png");

// Kartları yazdırma penceresinde, her sayfaya bir kart gelecek şekilde açar (PDF olarak da kaydedilebilir)
export function kartlariYazdir(resimler, bicim = "kart") {
  const sayfa = bicim === "afis" ? "A4" : "105mm 148mm";
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR menü baskı</title><style>
@page{size:${sayfa};margin:0}html,body{margin:0;padding:0}img{display:block;width:100%;height:100vh;object-fit:contain;page-break-after:always;break-after:page}
@media screen{body{background:#555}img{width:auto;height:90vh;margin:20px auto;box-shadow:0 10px 30px rgba(0,0,0,.4)}}
</style></head><body>${resimler.map((r) => `<img src="${r}">`).join("")}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
  return true;
}
