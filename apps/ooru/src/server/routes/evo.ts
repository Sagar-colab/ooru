import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db/index.js";
import {
  shopBusinesses,
  udharLedger,
  merchants,
  menuItems,
  orders,
  consumers,
  riders,
} from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

const apiKey = process.env.ANTHROPIC_API_KEY || undefined;
const client = apiKey ? new Anthropic({ apiKey }) : null;

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

async function loadShopOwnerContext(phone?: string) {
  const shops = phone
    ? await db.select().from(shopBusinesses).where(eq(shopBusinesses.phone, phone)).limit(1)
    : await db.select().from(shopBusinesses).limit(1);

  if (!shops.length) return { summary: "No shop found.", data: {} };

  const shop = shops[0];
  const ledger = await db
    .select()
    .from(udharLedger)
    .where(eq(udharLedger.shopBusinessId, shop.id));

  const totalCredit = ledger
    .filter((e) => e.transactionType === "credit")
    .reduce((sum, e) => sum + e.amountPaise, 0);
  const totalDebit = ledger
    .filter((e) => e.transactionType === "debit")
    .reduce((sum, e) => sum + e.amountPaise, 0);

  return {
    summary: `Shop: ${shop.businessName} (${shop.businessType}) in ${shop.neighbourhoodSlug || "unknown area"}.
Phone: ${shop.phone}. Active: ${shop.isActive}. Ooru delivery: ${shop.ooruDeliveryEnabled}.
Udhar ledger: ${ledger.length} entries. Outstanding credit: ₹${(totalCredit - totalDebit) / 100}.`,
    data: { shop, ledger },
  };
}

async function loadConsumerContext(phone?: string) {
  const allMerchants = await db.select().from(merchants).limit(10);
  const items = await db.select().from(menuItems).limit(30);

  const menuSummary = allMerchants
    .map((m) => {
      const mItems = items.filter((i) => i.merchantId === m.id);
      const itemList = mItems
        .map((i) => `${i.name} ₹${i.pricePaise / 100}${i.isVeg ? " (veg)" : ""}`)
        .join(", ");
      return `${m.name} [${(m.cuisine || []).join(", ")}]: ${itemList}`;
    })
    .join("\n");

  return {
    summary: `Nearby restaurants:\n${menuSummary}`,
    data: { merchants: allMerchants, menuItems: items },
  };
}

async function loadMerchantContext(phone?: string) {
  const ms = phone
    ? await db.select().from(merchants).where(eq(merchants.phone, phone)).limit(1)
    : await db.select().from(merchants).limit(1);

  if (!ms.length) return { summary: "No merchant found.", data: {} };

  const merchant = ms[0];
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.merchantId, merchant.id));
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchant.id));

  return {
    summary: `Restaurant: ${merchant.name} [${(merchant.cuisine || []).join(", ")}].
Phone: ${merchant.phone}. Open: ${merchant.isOpen}. Commission: ${(merchant.commissionRate || 0) * 100}%.
Menu items: ${items.length}. Total orders: ${allOrders.length}.
Today's revenue: ₹${allOrders.reduce((s, o) => s + o.totalPaise, 0) / 100}.`,
    data: { merchant, menuItems: items, orders: allOrders },
  };
}

async function loadRiderContext(phone?: string) {
  const rs = phone
    ? await db.select().from(riders).where(eq(riders.phone, phone)).limit(1)
    : await db.select().from(riders).limit(1);

  if (!rs.length)
    return {
      summary: "No rider found. You're a new rider — no deliveries yet.",
      data: {},
    };

  const rider = rs[0];
  return {
    summary: `Rider: ${rider.name}. Tier: ${rider.tier}. Online: ${rider.isOnline}.
Rating: ${rider.ratingAvg}/5. Total deliveries: ${rider.totalDeliveries}.
Today's earnings: ₹${(rider.earningsTodayPaise || 0) / 100}.`,
    data: { rider },
  };
}

const CONTEXT_LOADERS: Record<string, (phone?: string) => Promise<{ summary: string; data: unknown }>> = {
  shop_owner: loadShopOwnerContext,
  consumer: loadConsumerContext,
  merchant: loadMerchantContext,
  rider: loadRiderContext,
};

// ── GET /api/evo/test ──────────────────────────────────────

router.get("/test", async (req, res) => {
  const role = (req.query.role as string) || "";
  const msg = (req.query.msg as string) || "";
  const phone = req.query.phone as string | undefined;

  if (!role || !msg) {
    return res
      .status(400)
      .json({ error: "Missing required query params: role, msg" });
  }

  const persona = PERSONAS[role];
  if (!persona) {
    return res.status(400).json({
      error: `Unknown role: ${role}. Valid: ${Object.keys(PERSONAS).join(", ")}`,
    });
  }

  const loader = CONTEXT_LOADERS[role];
  const context = await loader(phone);

  const systemPrompt = `${persona}

--- LIVE DATA ---
${context.summary}
--- END DATA ---

Use the data above to answer the user's question. If the data doesn't cover what they're asking, say so honestly.`;

  if (!client) {
    return res.json({
      role,
      message: msg,
      reply: "[mock] ANTHROPIC_API_KEY not set. Context loaded successfully.",
      model: "mock",
      context_used: context.summary,
    });
  }

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: msg }],
    });

    const reply =
      response.content[0].type === "text" ? response.content[0].text : "";

    res.json({
      role,
      message: msg,
      reply,
      model: response.model,
      context_used: context.summary,
    });
  } catch (err: any) {
    console.error("[evo] Claude API error:", err.message);
    res.status(502).json({
      error: "Claude API call failed",
      detail: err.message,
    });
  }
});

export default router;
