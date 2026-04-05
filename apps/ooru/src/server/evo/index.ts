import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
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
import {
  matchShopOwnerIntent,
  handleShopOwnerIntent,
} from "./handlers/shopOwner.js";
import {
  matchRestaurantIntent,
  handleRestaurantIntent,
} from "./handlers/restaurant.js";
import {
  matchConsumerIntent,
  handleConsumerIntent,
} from "./handlers/consumer.js";
import {
  matchRiderIntent,
  handleRiderIntent,
} from "./handlers/rider.js";

function getApiKey(): string | undefined {
  const sysKey = process.env.ANTHROPIC_API_KEY;
  if (sysKey && sysKey.trim().length > 10) return sysKey.trim();

  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(dir, "../../../.env");
    const content = readFileSync(envPath, "utf8");
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (match && match[1].trim().length > 10) return match[1].trim();
  } catch {}
  return undefined;
}

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (client) return client;
  const key = getApiKey();
  if (!key) {
    console.log("[evo] No ANTHROPIC_API_KEY found");
    return null;
  }
  client = new Anthropic({ apiKey: key });
  return client;
}

// ── noise filter ───────────────────────────────────────────

const NOISE_PATTERNS = /^(ok|okay|k|🙏|thanks|thank you|hm|hmm|ha|haha|lol|bye|ya|yes|no)$/i;

export function isNoise(text: string): boolean {
  return NOISE_PATTERNS.test(text.trim());
}

// ── role detection ─────────────────────────────────────────

export type Role = "consumer" | "shop_owner" | "merchant" | "rider" | "new_user";

export async function detectRole(phone: string): Promise<Role> {
  const [shop] = await db
    .select()
    .from(shopBusinesses)
    .where(eq(shopBusinesses.phone, phone))
    .limit(1);
  if (shop) return "shop_owner";

  const [merchant] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.phone, phone))
    .limit(1);
  if (merchant) return "merchant";

  const [rider] = await db
    .select()
    .from(riders)
    .where(eq(riders.phone, phone))
    .limit(1);
  if (rider) return "rider";

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

  rider: `You are Ooru (ಊರు), a delivery partner assistant on WhatsApp for riders in Bengaluru.
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
      return `Restaurant: ${m.name}. Open: ${m.isOpen}. Orders: ${ords.length}. Revenue today: ₹${ords.reduce((s, o) => s + o.totalPaise, 0) / 100}.`;
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

// ── intent classification (async, non-blocking) ────────────

const ROLE_INTENTS: Record<string, string[]> = {
  shop_owner: [
    "morning_brief", "check_revenue", "udhar_check", "udhar_add",
    "stock_check", "gst_query", "check_daily_pnl", "general_question",
  ],
  consumer: [
    "browse_restaurants", "view_menu", "place_order", "track_order",
    "find_service", "general_question",
  ],
  merchant: [
    "check_orders", "update_menu", "check_revenue", "toggle_open",
    "general_question",
  ],
  rider: [
    "check_deliveries", "go_online", "check_earnings", "general_question",
  ],
};

async function classifyIntent(role: string, message: string): Promise<string> {
  const c = getClient();
  if (!c) return "mock";

  const intents = ROLE_INTENTS[role] || ["general_question"];
  try {
    const response = await c.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system: `Classify this message into exactly one intent from this list. Return only the intent name, nothing else.\nIntents: ${intents.join(", ")}`,
      messages: [
        { role: "user", content: `Role: ${role}\nMessage: ${message}` },
      ],
    });
    const text = response.content[0].type === "text" ? response.content[0].text.trim() : "general_question";
    return intents.includes(text) ? text : "general_question";
  } catch {
    return "general_question";
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

  // 1. Try specific intent handlers first (pattern matching — fast)
  if (role === "shop_owner") {
    const intent = matchShopOwnerIntent(message);
    if (intent) {
      const result = await handleShopOwnerIntent(intent, phone, message);
      if (result.handled) {
        // Fire-and-forget: classify intent via LLM in background
        classifyIntent(role, message).catch(() => {});
        return { reply: result.reply, intent: result.intent, model: "handler" };
      }
    }
  }

  if (role === "merchant") {
    const intent = matchRestaurantIntent(message);
    if (intent) {
      const result = await handleRestaurantIntent(intent, phone, message);
      if (result.handled) {
        classifyIntent(role, message).catch(() => {});
        return { reply: result.reply, intent: result.intent, model: "handler" };
      }
    }
  }

  if (role === "consumer") {
    const intent = matchConsumerIntent(message);
    if (intent) {
      const result = await handleConsumerIntent(intent, phone, message);
      if (result.handled) {
        classifyIntent(role, message).catch(() => {});
        return { reply: result.reply, intent: result.intent, model: "handler" };
      }
    }
  }

  if (role === "rider") {
    const intent = matchRiderIntent(message);
    if (intent) {
      const result = await handleRiderIntent(intent, phone, message);
      if (result.handled) {
        classifyIntent(role, message).catch(() => {});
        return { reply: result.reply, intent: result.intent, model: "handler" };
      }
    }
  }

  // 2. Fall through to general Evo (LLM)
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

  const c = getClient();
  if (!c) {
    return {
      reply: `[mock] Role: ${role}. Context loaded. Message: "${message}"`,
      intent: "mock",
      model: "mock",
    };
  }

  try {
    // Run response generation and intent classification in parallel
    const [response, detectedIntent] = await Promise.all([
      c.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: "user", content: message }],
      }),
      classifyIntent(role, message),
    ]);

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    return { reply, intent: detectedIntent, model: response.model };
  } catch (err: any) {
    console.error("[evo] Claude error:", err.message);
    return {
      reply: "Sorry, I'm having trouble right now. Please try again.",
      intent: "error",
      model: "error",
    };
  }
}
