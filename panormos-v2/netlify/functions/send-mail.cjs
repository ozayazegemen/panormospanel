// netlify/functions/send-mail.js — info@panormosmedya.com üzerinden SMTP ile e-posta gönderir (GoDaddy Kurumsal E-posta)
const nodemailer = require("nodemailer");

exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "POST bekleniyor" }) };

  const user = process.env.MAIL_USER, pass = process.env.MAIL_PASS;
  if (!user || !pass) return { statusCode: 500, headers, body: JSON.stringify({ error: "MAIL_USER / MAIL_PASS tanımlı değil (Netlify > Environment variables)" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Geçersiz JSON" }) }; }
  const { to, subject, text, html, attachment } = body;
  if (!to || !subject || !(text || html)) return { statusCode: 400, headers, body: JSON.stringify({ error: "to, subject ve text zorunlu" }) };

  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtpout.secureserver.net",
    port: Number(process.env.MAIL_PORT || 465),
    secure: String(process.env.MAIL_PORT || 465) === "465",
    auth: { user, pass },
  });

  const mail = {
    from: `"Panormos Medya" <${user}>`,
    to, subject,
    text: text || undefined,
    html: html || undefined,
    replyTo: user,
  };
  if (attachment?.base64 && attachment?.filename) {
    mail.attachments = [{ filename: attachment.filename, content: Buffer.from(attachment.base64, "base64"), contentType: attachment.contentType || undefined }];
  }

  try {
    const info = await transporter.sendMail(mail);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, id: info.messageId }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
