// Netlify Function — çalışan davet e-postası gönderir (Resend API kullanır)
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { to, name, email, password, loginUrl } = JSON.parse(event.body);

    if (!to || !name) {
      return { statusCode: 400, body: JSON.stringify({ error: "Eksik bilgi" }) };
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 900; color: #223A59;">panormos</span><span style="font-size: 24px; font-weight: 900; color: #F25124;">medya.</span>
        </div>
        <h2 style="color: #0D1219;">Hoş geldin, ${name}!</h2>
        <p style="color: #444; line-height: 1.6;">Panormos Medya ajans yönetim paneline hesabın oluşturuldu. Aşağıdaki bilgilerle giriş yapabilirsin:</p>
        <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 4px 0;"><strong>E-posta:</strong> ${email}</p>
          <p style="margin: 4px 0;"><strong>Şifre:</strong> ${password}</p>
        </div>
        <a href="${loginUrl}" style="display: inline-block; background: #F25124; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Panele Giriş Yap</a>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">Güvenliğin için giriş yaptıktan sonra şifreni değiştirmen önerilir.</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Panormos Medya <onboarding@resend.dev>",
        to: [to],
        subject: "Panormos Medya Paneline Hoş Geldin",
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: data }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, data }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
