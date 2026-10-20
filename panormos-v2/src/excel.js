import * as XLSX from 'xlsx'

// Seçilen Excel/CSV dosyasının ilk sayfasını satır listesi olarak okur: [{ 'Başlık': '...', ... }]
export async function excelOku(dosya) {
  const kitap = XLSX.read(await dosya.arrayBuffer(), { type: 'array' })
  const sayfa = kitap.Sheets[kitap.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sayfa, { defval: '', raw: false })
}

// Aynı dosyayı sütun konumuna göre (başlık eşlemesi olmadan) satır dizisi olarak okur: [[hücre, hücre, ...], ...]
// Yan yana birden fazla kategori bloğu içeren (menü kartı görünümündeki) tablolar için kullanılır.
export async function excelOkuDizi(dosya) {
  const kitap = XLSX.read(await dosya.arrayBuffer(), { type: 'array' })
  const sayfa = kitap.Sheets[kitap.SheetNames[0]]
  return XLSX.utils.sheet_to_json(sayfa, { header: 1, defval: '', raw: false })
}

// Başlıkları ve örnek satırları olan boş şablon indirir
export function sablonIndir(basliklar, ornekler, dosyaAdi) {
  const sayfa = XLSX.utils.aoa_to_sheet([basliklar, ...ornekler])
  sayfa['!cols'] = basliklar.map((b) => ({ wch: Math.max(14, b.length + 4) }))
  const kitap = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(kitap, sayfa, 'Liste')
  XLSX.writeFile(kitap, `${dosyaAdi}.xlsx`)
}
