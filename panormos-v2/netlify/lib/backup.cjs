// Veritabanının tam yedeğini alır: tüm tabloları tek JSON dosyasında toplar, sıkıştırır ve
// dışarıya kapalı "yedekler" deposuna yazar. 30 günden eski yedekleri siler. İstenirse e-postayla da gönderir.
// Servis anahtarı yalnızca sunucu tarafında kullanılır.
const zlib = require("zlib");
const { createClient } = require("@supabase/supabase-js");

const TABLES = [
  "clients", "client_finance", "client_secrets", "staff", "tasks", "posts", "media", "publishes", "shoots", "shoot_plans",
  "leads", "ideas", "inventory", "social_reports", "social_accounts", "drive_files",
  "pricing_packages", "pricing_addons", "pricing_quotes", "panel_settings",
  "client_payments", "client_invoices", "invoices", "piece_jobs", "company_incomes", "company_expenses",
  "accounting_entries", "accounting_documents", "staff_leave", "bank_accounts", "bank_transactions",
  "conversations", "conversation_members", "staff_messages", "messages", "sent_mails", "received_mails", "mail_folders",
];
const BUCKET = "yedekler";
const SAKLAMA_GUN = 30;
// Türkiye saatiyle bugünün tarihi (YYYY-AA-GG)
const bugun = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function tabloyuAl(supabase, t) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(t).select("*").range(from, from + 999);
    if (error) return { rows: all, error: error.message };
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { rows: all };
}

async function runBackup({ email = false } = {}) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_KEY tanımlı değil (Netlify > Environment variables)" };
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

  const backup = { exportedAt: new Date().toISOString(), tur: "otomatik", tables: {} };
  const hatalar = [];
  let satir = 0;
  // Altışar altışar, paralel: işlev süresi sınırına takılmasın
  for (let i = 0; i < TABLES.length; i += 6) {
    const parti = TABLES.slice(i, i + 6);
    const sonuc = await Promise.all(parti.map(t => tabloyuAl(supabase, t)));
    parti.forEach((t, k) => {
      backup.tables[t] = sonuc[k].rows; satir += sonuc[k].rows.length;
      if (sonuc[k].error) hatalar.push(`${t}: ${sonuc[k].error}`);
    });
  }

  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(backup)));
  const name = `panormos-${bugun()}.json.gz`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(name, gz, { contentType: "application/gzip", upsert: true });
  if (upErr) return { ok: false, error: "Yedek depoya yazılamadı: " + upErr.message, hatalar };

  // Eski yedekleri temizle
  let silinen = 0;
  try {
    const { data: liste } = await supabase.storage.from(BUCKET).list("", { limit: 500 });
    const sinir = new Date(Date.now() - SAKLAMA_GUN * 86400000).toISOString().slice(0, 10);
    const eski = (liste || []).map(f => f.name).filter(n => { const m = n.match(/^panormos-(\d{4}-\d{2}-\d{2})\.json\.gz$/); return m && m[1] < sinir; });
    if (eski.length) { await supabase.storage.from(BUCKET).remove(eski); silinen = eski.length; }
  } catch (e) { hatalar.push("eski yedek temizliği: " + e.message); }

  // Haftalık kopya e-postayla (veritabanının dışında da bir kopya dursun)
  let emailed = false;
  if (email && process.env.MAIL_USER && process.env.MAIL_PASS && gz.length < 15 * 1024 * 1024) {
    try {
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST || "smtpout.secureserver.net",
        port: Number(process.env.MAIL_PORT || 465),
        secure: String(process.env.MAIL_PORT || 465) === "465",
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
      });
      await transporter.sendMail({
        from: `"Panormos Panel" <${process.env.MAIL_USER}>`, to: process.env.MAIL_USER,
        subject: `Panormos panel haftalık yedek — ${bugun()}`,
        text: `Panelin otomatik haftalık yedeği ektedir.\n\nKayıt sayısı: ${satir}\nDosya: ${name}\n\nBu dosyayı silmeyin; veritabanında bir sorun olursa veriler bu dosyadan geri yüklenir.`,
        attachments: [{ filename: name, content: gz, contentType: "application/gzip" }],
      });
      emailed = true;
    } catch (e) { hatalar.push("e-posta: " + e.message); }
  }

  return { ok: true, name, bytes: gz.length, rows: satir, tables: TABLES.length, silinen, emailed, hatalar };
}

module.exports = { runBackup };
