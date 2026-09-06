const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const MAX_PER_RUN = 25;

exports.handler = async () => {
  const client = new ImapFlow({
    host: "imap.secureserver.net",
    port: 993,
    secure: true,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
    logger: false,
  });

  try {
    // En son kaydedilen UID'yi bul
    const { data: last } = await supabase
      .from("received_mails")
      .select("uid")
      .order("uid", { ascending: false })
      .limit(1);
    const lastUid = last && last.length ? last[0].uid : 0;

    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    let inserted = 0;

    try {
      let uids = await client.search(
        lastUid > 0 ? { uid: `${lastUid + 1}:*` } : { all: true },
        { uid: true }
      );
      uids = (uids || []).filter((u) => u > lastUid);
      if (uids.length > MAX_PER_RUN) uids = uids.slice(-MAX_PER_RUN);

      const rows = [];
      for (const uid of uids) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!msg || !msg.source) continue;
        const parsed = await simpleParser(msg.source);
        const from = parsed.from && parsed.from.value && parsed.from.value[0];
        rows.push({
          uid,
          message_id: parsed.messageId || null,
          from_email: from ? (from.address || "").toLowerCase() : null,
          from_name: from ? from.name || null : null,
          to_email: parsed.to ? parsed.to.text : null,
          subject: parsed.subject || "(Konu yok)",
          body_text: parsed.text || null,
          body_html: parsed.html || null,
          has_attachments: !!(parsed.attachments && parsed.attachments.length),
          received_at: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
        });
      }

      if (rows.length) {
        // Gönderen adresi müşteri ise client_id eşle
        const emails = [...new Set(rows.map((r) => r.from_email).filter(Boolean))];
        const { data: clients } = await supabase
          .from("clients")
          .select("id,email")
          .in("email", emails);
        const map = {};
        (clients || []).forEach((c) => {
          if (c.email) map[c.email.toLowerCase()] = c.id;
        });
        rows.forEach((r) => {
          r.client_id = r.from_email ? map[r.from_email] || null : null;
        });

        const { error } = await supabase
          .from("received_mails")
          .upsert(rows, { onConflict: "uid", ignoreDuplicates: true });
        if (error) throw error;
        inserted = rows.length;
      }
    } finally {
      lock.release();
    }

    await client.logout();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, inserted }),
    };
  } catch (err) {
    try { await client.logout(); } catch (_) {}
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};
