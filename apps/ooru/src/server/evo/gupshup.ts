const GUPSHUP_URL = "https://api.gupshup.io/wa/api/v1/msg";
const GUPSHUP_SOURCE = "917411811702";
const GUPSHUP_APP_NAME = "nammplate";

export async function sendWhatsApp(
  phone: string,
  text: string,
  buttons?: string[]
): Promise<void> {
  const apiKey = process.env.GUPSHUP_API_KEY;

  if (!apiKey) {
    console.log(`[gupshup][mock] → ${phone}: ${text}`);
    return;
  }

  try {
    const message = JSON.stringify({ type: "text", text });

    const body = new URLSearchParams({
      channel: "whatsapp",
      source: GUPSHUP_SOURCE,
      destination: phone,
      message,
      "src.name": GUPSHUP_APP_NAME,
    });

    const res = await fetch(GUPSHUP_URL, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const responseText = await res.text();
    if (!res.ok) {
      console.error(`[gupshup] HTTP ${res.status}:`, responseText);
    } else {
      console.log(`[gupshup] Sent to ${phone}:`, responseText);
    }
  } catch (err: any) {
    console.error("[gupshup] Send failed:", err.message);
  }
}
