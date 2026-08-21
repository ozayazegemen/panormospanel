// netlify/functions/claude.js
// Panel -> bu fonksiyon -> Anthropic API. API anahtari tarayiciya hic gitmez.
exports.handler = async (event) => {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "POST bekleniyor" }) };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY tanimli degil (Netlify > Environment variables)" }) };

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "Gecersiz JSON" }) }; }

  const { prompt, system, messages, maxTokens } = body;
  const msgs = Array.isArray(messages) && messages.length ? messages : [{ role: "user", content: String(prompt || "") }];
  if (!msgs[0].content) return { statusCode: 400, headers, body: JSON.stringify({ error: "prompt bos" }) };

  const DEFAULT_SYSTEM = "Sen Panormos Medya adli bir sosyal medya ajansinin asistanisin. Turkce, net ve kisa yaz. Sosyal medya icerikleri, Instagram/Facebook stratejisi, raporlama ve musteri iletisimi konularinda yardim edersin.";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: Math.min(Number(maxTokens) || 1500, 4000),
        system: system || DEFAULT_SYSTEM,
        messages: msgs,
      }),
    });
    const data = await r.json();
    if (!r.ok) return { statusCode: r.status, headers, body: JSON.stringify({ error: data?.error?.message || "Anthropic hatasi" }) };
    const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
    return { statusCode: 200, headers, body: JSON.stringify({ text, usage: data.usage }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
