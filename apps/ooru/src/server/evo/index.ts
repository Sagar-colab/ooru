import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/index.js";
import {
  consumers,
  merchants,
  riders,
  shopBusinesses,
  udharLedger,
  menuItems,
  orders,
} from "../db/schema.js";
import { eq } from "drizzle-orm";

const apiKey = process.env.ANTHROPIC_API_KEY || undefined;
const client = apiKey ? new Anthropic({ apiKey }) : null;

// ── noise filter ───────────────────────────────────────────

const NOISE_PATTERNS = /^(ok|okay|k|👍|🙏|thanks|thank you|hm|hmm|ha|haha|lol|bye|ya|yes|no|hi|hello)$/i;

export function isNoise(text: string): boolean {
  return NOISE_PATTERNS.test(text.trim());
}

// ── role detection ─────────────────────────────────────────

export type Role = "consumer" | "shop_owner" | "merchant" | "rider" | "new_user";

export async function detectRole(phone: string): Promise<Role> {
  // Check shop_businesses first (shop_owner)
  const [shop] = await db
    .select()
    .from(shopBusinesses)
    .where(eq(shopBusinesses.phone, phone))
    .limit(1);
  if (shop) return "shop_owner";

  // Check merchants
  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.phone, phone))
    .limit(1);
  if (merchant) return "merchant";

  // Check riders
  const [rider] = await db
    .select()
    .from(riders)
    .where(eq(riders.phone, phone))
    .limit(1);
  if (rider) return "rider";

  // Check consumers
  const [consumer] = await db
    .select()
    .from(consumers)
    .where(eq(consumers.phone, phone))
    .limit(1);
  if (consumer) return "consumer";

  return "new_user";
}

// ── persona prompts ────────────────────────────────────────

const PERSONAS: Record<string, string> = {
  shop_owner: `You are Ooru (ಊರು), a friendly WhatsApp assistant for small shop owners in Bengaluru neighbourhoods.
You speak in a warm, concise style — mixing English and Kannada words naturally.
You help shop owners track udhar (credit), manage inventory, view daily sales, and grow their business.
Always show money in ₹ (convert from paise by dividing by 100). Keep replies short — this is WhatsApp.`,

  consumer: `You are Ooru (ಊರು), a neighbourhood food & services assistant on WhatsApp for consumers in Bengaluru.
You help people discover nearby restaurants, browse menus, place orders, and find local services.
Be warm, brief, and helpful. Show prices in ₹. This is WhatsApp — keep it conversational and short.`,

  merchant: `You are Ooru (ಊರು), a restaurant operations assistant on WhatsApp for food merchants in Bengaluru.
You help merchants manage incoming orders, update menus, track daily revenue, and handle delivery logistics.
Be professional but friendly. Show money in ₹. Keep replies concise — WhatsApp style.`,

  rider: `You are Ooru (ಊರು), a delivery partner assistant on WhatsApp for riders in Bengaluru.
You help riders see assigned deliveries, navigate routes, track earnings, and manage their online status.
Be encouraging and brief. Show earnings in ₹. WhatsApp style — short and clear.`,
};

// ── context loaders ────────────────────────────────────────

async function loadContext(role: Role, phone: string): Promise<string> {
  switch (role) {
    case "shop_owner": {
      const [shop] = await db
        .select()
        .from(shopBusinesses)
        .where(eq(shopBusinesses.phone, phone))
        .limit(1);
      if (!shop) return "No shop found.";
      const ledger = await db
        .select()
        .from(udharLedger)
        .where(eq(udharLedger.shopBusinessId, shop.id));
      const credit = ledger
        .filter((e) => e.transactionType === "credit")
        .reduce((s, e) => s + e.amountPaise, 0);
      const debit = ledger
        .filter((e) => e.transactionType === "debit")
        .reduce((s, e) => s + e.amountPaise, 0);
      return `Shop: ${shop.businessName} (${shop.businessType}) in ${shop.neighbourhoodSlug || "unknown"}.
Phone: ${shop.phone}. Active: ${shop.isActive}. Ooru delivery: ${shop.ooruDeliveryEnabled}.
Udhar: ${ledger.length} entries, outstanding ₹${(credit - debit) / 100}.`;
    }
    case "consumer": {
      const ms = await db.select().from(merchants).limit(5);
      const items = await db.select().from(menuItems).limit(30);
      return ms
        .map((m) => {
          const mi = items
            .filter((i) => i.merchantId === m.id)
            .map((i) => `${i.name} ₹${i.pricePaise / 100}`)
            .join(", ");
          return `${m.name} [${(m.cuisine || []).join(", ")}]: ${mi}`;
        })
        .join("\n");
    }
    case "merchant": {
      const [m] = await db
        .select()
        .from(merchants)
        .where(eq(merchants.phone, phone))
        .limit(1);
      if (!m) return "No merchant found.";
      const ords = await db
        .select()
        .from(orders)
        .where(eq(orders.merchantId, m.id));
      return `Restaurant: ${m.name}. Open: ${m.isOpen}. Menu items: ${ords.length} orders. Revenue today: ₹${ords.reduce((s, o) => s + o.totalPaise, 0) / 100}.`;
    }
    case "rider": {
      const [r] = await db
        .select()
        .from(riders)
        .where(eq(riders.phone, phone))
        .limit(1);
      if (!r) return "No rider found.";
      return `Rider: ${r.name}. Tier: ${r.tier}. Online: ${r.isOnline}. Rating: ${r.ratingAvg}/5. Earnings today: ₹${(r.earningsTodayPaise || 0) / 100}.`;
    }
    default:
      return "";
  }
}

// ── runEvo ─────────────────────────────────────────────────

export interface EvoInput {
  role: Role;
  phone: string;
  message: string;
  mediaUrl?: string;
}

export interface EvoResult {
  reply: string;
  intent: string;
  model: string;
}

export async function runEvo(input: EvoInput): Promise<EvoResult> {
  const { role, phone, message } = input;

  if (isNoise(message)) {
    return { reply: "", intent: "noise", model: "none" };
  }

  const persona = PERSONAS[role];
  if (!persona) {
    return {
      reply: "I'm not sure how to help with that role yet.",
      intent: "unknown_role",
      model: "none",
    };
  }

  const context = await loadContext(role, phone);

  const systemPrompt = `${persona}

--- LIVE DATA ---
${context}
--- END DATA ---

Use the data above to answer the user's question. If the data doesn't cover what they're asking, say so honestly.
Respond in 1-3 short sentences. This is WhatsApp.`;

  if (!client) {
    return {
      reply: `[mock] Role: ${role}. Context loaded. Message: "${message}"`,
      intent: "mock",
      model: "mock",
    };
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: message }],
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    return { reply, intent: "evo", model: response.model };
  } catch (err: any) {
    console.error("[evo] Claude error:", err.message);
    return {
      reply: "Sorry, I'm having trouble right now. Please try again.",
      intent: "error",
      model: "error",
    };
  }
}
