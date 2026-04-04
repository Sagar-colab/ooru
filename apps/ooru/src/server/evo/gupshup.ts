const GUPSHUP_URL = "https://api.gupshup.io/sm/api/v1/msg";

export async function sendWhatsApp(
  phone: string,
  text: string,
  buttons?: string[]
): Promise<void> {
  const apiKey = process.env.GUPSHUP_API_KEY;
  const appName = process.env.GUPSHUP_APP_NAME || "ooru";

  if (!apiKey) {
    console.log(`[gupshup][mock] → ${phone}: ${text}`);
    if (buttons?.length) console.log(`[gupshup][mock] buttons:`, buttons);
    return;
  }

  try {
    let message: string;

    if (buttons && buttons.length > 0) {
      // Quick reply format (max 3 buttons)
      const quickReplyButtons = buttons.slice(0, 3).map((btn, i) => ({
        type: "reply",
        reply: { id: `btn_${i}`, title: btn.slice(0, 20) },
      }));
      message = JSON.stringify({
        type: "quick_reply",
        content: { type: "text", text },
        options: quickReplyButtons,
      });
    } else {
      message = JSON.stringify({ type: "text", text });
    }

    const body = new URLSearchParams({
      channel: "whatsapp",
      source: appName,
      destination: phone,
      message,
      "src.name": appName,
    });

    const res = await fetch(GUPSHUP_URL, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      console.error(`[gupshup] HTTP ${res.status}:`, await res.text());
    }
  } catch (err: any) {
    console.error("[gupshup] Send failed:", err.message);
  }
}
