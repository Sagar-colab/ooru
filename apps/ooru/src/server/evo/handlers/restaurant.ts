import { db } from "../../db/index.js";
import {
  merchants,
  menuItems,
  menuCategories,
  orders,
} from "../../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { fuzzyMatchItem } from "../utils/fuzzyMatch.js";

// ── handler result ─────────────────────────────────────────

export interface HandlerResult {
  reply: string;
  intent: string;
  handled: boolean;
}

const NOT_HANDLED: HandlerResult = { reply: "", intent: "", handled: false };

// ── helpers ────────────────────────────────────────────────

async function getMerchant(phone: string) {
  const [m] = await db
    .select()
    .from(merchants)
    .where(eq(merchants.phone, phone))
    .limit(1);
  return m;
}

async function getMenuItems(merchantId: number) {
  return db
    .select()
    .from(menuItems)
    .where(eq(menuItems.merchantId, merchantId));
}

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// ── intent matchers ────────────────────────────────────────

const INTENT_PATTERNS: [RegExp, string][] = [
  [/^86\s+/i, "toggle_item"],
  [/back\s*on$/i, "toggle_item"],
  [/(unavailable|out\s*of\s*stock|off\s*the\s*menu)/i, "toggle_item"],
  [/(change|update|set)\s+.*(price|to\s*₹?\s*\d+|to\s*rs)/i, "update_price"],
  [/(add|new)\s+(item|dish|menu)/i, "add_item"],
  [/(check|show|my)\s*(order|orders)/i, "check_orders"],
  [/(revenue|sales|earning|kamai|kitna)/i, "check_revenue"],
  [/(settlement|payout|payment\s*due)/i, "check_settlement"],
  [/(insight|top\s*seller|best\s*sell|slow|popular|busiest)/i, "insights"],
  [/(daily\s*special|today.?s?\s*special|special\s*of)/i, "daily_special"],
  [/(hours?|timing|open|close|opening|closing)/i, "hours_update"],
  [/(menu|ocr|extract|scan)/i, "menu_ocr"],
];

export function matchRestaurantIntent(message: string): string | null {
  const text = message.toLowerCase().trim();
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

// ── dispatch ───────────────────────────────────────────────

export async function handleRestaurantIntent(
  intent: string,
  phone: string,
  message: string
): Promise<HandlerResult> {
  const merchant = await getMerchant(phone);
  if (!merchant)
    return {
      reply: "I couldn't find your restaurant. Please register first.",
      intent,
      handled: true,
    };

  switch (intent) {
    case "toggle_item":
      return toggleItem(merchant, message);
    case "update_price":
      return updatePrice(merchant, message);
    case "add_item":
      return addItem(merchant, message);
    case "check_orders":
      return checkOrders(merchant);
    case "check_revenue":
      return checkRevenue(merchant);
    case "check_settlement":
      return checkSettlement(merchant);
    case "insights":
      return insights(merchant);
    case "daily_special":
      return dailySpecial(merchant, message);
    case "hours_update":
      return hoursUpdate(merchant, message);
    case "menu_ocr":
      return menuOcr();
    default:
      return NOT_HANDLED;
  }
}

// ── toggle_item ────────────────────────────────────────────

async function toggleItem(merchant: any, message: string): Promise<HandlerResult> {
  const items = await getMenuItems(merchant.id);
  const text = message.toLowerCase().trim();

  // "86 chicken biryani" → make unavailable
  const is86 = text.startsWith("86 ");
  // "chicken biryani back on" → make available
  const isBackOn = /back\s*on$/i.test(text);

  // Extract item name
  let searchTerm = text;
  if (is86) searchTerm = text.replace(/^86\s+/, "");
  if (isBackOn) searchTerm = text.replace(/\s*back\s*on$/i, "");
  searchTerm = searchTerm.replace(/(make|set|mark)\s+(unavailable|available|off)/gi, "").trim();

  const match = fuzzyMatchItem(items, searchTerm);
  if (!match) {
    return {
      reply: `Couldn't find "${searchTerm}" on your menu. Check the item name and try again.`,
      intent: "toggle_item",
      handled: true,
    };
  }

  const newAvailable = isBackOn ? true : is86 ? false : !match.isAvailable;

  await db
    .update(menuItems)
    .set({ isAvailable: newAvailable, updatedAt: new Date() })
    .where(eq(menuItems.id, match.id));

  const status = newAvailable ? "back on" : "now unavailable";
  return {
    reply: `${match.name} is ${status}.`,
    intent: "toggle_item",
    handled: true,
  };
}

// ── update_price ───────────────────────────────────────────

async function updatePrice(merchant: any, message: string): Promise<HandlerResult> {
  const items = await getMenuItems(merchant.id);

  // Parse: "change filter coffee to 35" or "set butter chicken price 260"
  const priceMatch = message.match(
    /(?:change|update|set)\s+(.+?)\s+(?:to|price|at)\s*₹?\s*(\d+)/i
  );
  if (!priceMatch) {
    return {
      reply: 'Please specify item and price. E.g.: "change Butter Chicken to 260"',
      intent: "update_price",
      handled: true,
    };
  }

  const searchTerm = priceMatch[1].replace(/\s*(price|to)\s*$/i, "").trim();
  const newPrice = parseInt(priceMatch[2]) * 100;

  const match = fuzzyMatchItem(items, searchTerm);
  if (!match) {
    return {
      reply: `Couldn't find "${searchTerm}" on your menu.`,
      intent: "update_price",
      handled: true,
    };
  }

  await db
    .update(menuItems)
    .set({ pricePaise: newPrice, updatedAt: new Date() })
    .where(eq(menuItems.id, match.id));

  return {
    reply: `${match.name} updated to ${fmtRs(newPrice)}.`,
    intent: "update_price",
    handled: true,
  };
}

// ── add_item ───────────────────────────────────────────────

async function addItem(merchant: any, message: string): Promise<HandlerResult> {
  // Parse: "add item Lamb Rogan Josh 380 to Curries non-veg"
  const addMatch = message.match(
    /(?:add|new)\s+(?:item|dish|menu)?\s*(.+?)(?:\s+(\d+))(?:\s+(?:to|in|under)\s+(.+?))?(?:\s+(veg|non-?veg))?\s*$/i
  );
  if (!addMatch) {
    return {
      reply: 'Format: "add item [name] [price] to [category] [veg/non-veg]"\nE.g.: "add item Lamb Rogan Josh 380 to Curries non-veg"',
      intent: "add_item",
      handled: true,
    };
  }

  const name = addMatch[1].trim();
  const pricePaise = parseInt(addMatch[2]) * 100;
  const categoryName = addMatch[3]?.trim() || "Menu";
  const isVeg = addMatch[4] ? !addMatch[4].toLowerCase().includes("non") : true;

  // Find or create category
  let [category] = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.merchantId, merchant.id),
        sql`lower(${menuCategories.name}) = ${categoryName.toLowerCase()}`
      )
    )
    .limit(1);

  if (!category) {
    [category] = await db
      .insert(menuCategories)
      .values({ merchantId: merchant.id, name: categoryName })
      .returning();
  }

  await db.insert(menuItems).values({
    merchantId: merchant.id,
    categoryId: category.id,
    name,
    pricePaise,
    isVeg,
  });

  return {
    reply: `Added ${name} ${fmtRs(pricePaise)} to ${categoryName}. ${isVeg ? "Veg" : "Non-veg"}.`,
    intent: "add_item",
    handled: true,
  };
}

// ── check_orders ───────────────────────────────────────────

async function checkOrders(merchant: any): Promise<HandlerResult> {
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchant.id));

  // Filter today's orders
  const today = new Date().toDateString();
  const todayOrders = allOrders.filter(
    (o) => o.createdAt && new Date(o.createdAt).toDateString() === today
  );

  if (todayOrders.length === 0) {
    return {
      reply: "No orders today yet. All quiet!",
      intent: "check_orders",
      handled: true,
    };
  }

  const byStatus = new Map<string, number>();
  let totalPaise = 0;
  for (const o of todayOrders) {
    byStatus.set(o.status || "unknown", (byStatus.get(o.status || "unknown") || 0) + 1);
    totalPaise += o.totalPaise;
  }

  const statusParts = Array.from(byStatus.entries())
    .map(([s, c]) => `${c} ${s}`)
    .join(", ");

  return {
    reply: `Today: ${statusParts}.\nTotal: ${fmtRs(totalPaise)}.`,
    intent: "check_orders",
    handled: true,
  };
}

// ── check_revenue ──────────────────────────────────────────

async function checkRevenue(merchant: any): Promise<HandlerResult> {
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchant.id));

  const now = new Date();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  let todayTotal = 0;
  let yesterdayTotal = 0;
  let weekTotal = 0;

  for (const o of allOrders) {
    const d = o.createdAt ? new Date(o.createdAt) : null;
    if (!d) continue;
    if (d.toDateString() === today) todayTotal += o.totalPaise;
    if (d.toDateString() === yesterday) yesterdayTotal += o.totalPaise;
    if (d >= weekAgo) weekTotal += o.totalPaise;
  }

  return {
    reply: `Today: ${fmtRs(todayTotal)} | Yesterday: ${fmtRs(yesterdayTotal)} | This week: ${fmtRs(weekTotal)}`,
    intent: "check_revenue",
    handled: true,
  };
}

// ── check_settlement ───────────────────────────────────────

async function checkSettlement(merchant: any): Promise<HandlerResult> {
  // Settlements would come from a separate table in production.
  // For now, estimate from commission rate and orders.
  const rate = merchant.commissionRate || 0.15;
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchant.id));

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekOrders = allOrders.filter(
    (o) => o.createdAt && new Date(o.createdAt) >= weekAgo
  );
  const weekRevenue = weekOrders.reduce((s, o) => s + o.totalPaise, 0);
  const settlement = Math.round(weekRevenue * (1 - rate));

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextDate = tomorrow.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return {
    reply: `Last settlement: ${fmtRs(settlement)} (est. after ${(rate * 100).toFixed(0)}% commission).\nNext: ${nextDate} 6 AM.`,
    intent: "check_settlement",
    handled: true,
  };
}

// ── insights ───────────────────────────────────────────────

async function insights(merchant: any): Promise<HandlerResult> {
  const allOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.merchantId, merchant.id));

  const items = await getMenuItems(merchant.id);

  if (allOrders.length === 0) {
    return {
      reply: `No order data yet for ${merchant.name}. Insights will appear once you get orders through Ooru.`,
      intent: "insights",
      handled: true,
    };
  }

  // Count items from order JSONB
  const itemCounts = new Map<string, number>();
  const hourCounts = new Map<number, number>();

  for (const o of allOrders) {
    const orderItems = (o.items as any[]) || [];
    for (const oi of orderItems) {
      const name = oi.name || "Unknown";
      itemCounts.set(name, (itemCounts.get(name) || 0) + (oi.quantity || 1));
    }
    if (o.createdAt) {
      const hour = new Date(o.createdAt).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    }
  }

  const sorted = [...itemCounts.entries()].sort((a, b) => b[1] - a[1]);
  const top3 = sorted.slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ");
  const slow2 = sorted.slice(-2).map(([n, c]) => `${n} (${c})`).join(", ");

  const busiestHour = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const busiestStr = busiestHour
    ? `${busiestHour[0]}:00-${busiestHour[0] + 1}:00`
    : "N/A";

  let reply = `Top sellers: ${top3 || "N/A"}`;
  if (slow2) reply += `\nSlowest: ${slow2}`;
  reply += `\nBusiest hour: ${busiestStr}`;

  return { reply, intent: "insights", handled: true };
}

// ── daily_special ──────────────────────────────────────────

async function dailySpecial(merchant: any, message: string): Promise<HandlerResult> {
  // Parse: "daily special Lamb Shank 450 until 10pm"
  const match = message.match(
    /special\s+(.+?)\s+(\d+)(?:\s+(?:until|till|by)\s+(\d{1,2}\s*(?:am|pm)?))?/i
  );
  if (!match) {
    return {
      reply: 'Format: "daily special [name] [price] until [time]"\nE.g.: "daily special Lamb Shank 450 until 10 PM"',
      intent: "daily_special",
      handled: true,
    };
  }

  const name = match[1].trim();
  const pricePaise = parseInt(match[2]) * 100;
  const endTime = match[3] || "10 PM";

  // Find or create "Specials" category
  let [cat] = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.merchantId, merchant.id),
        sql`lower(${menuCategories.name}) = 'specials'`
      )
    )
    .limit(1);

  if (!cat) {
    [cat] = await db
      .insert(menuCategories)
      .values({ merchantId: merchant.id, name: "Specials", sortOrder: 99 })
      .returning();
  }

  await db.insert(menuItems).values({
    merchantId: merchant.id,
    categoryId: cat.id,
    name: `[Special] ${name}`,
    pricePaise,
    isVeg: true,
    isAvailable: true,
    description: `Today's special until ${endTime}`,
  });

  return {
    reply: `Set! ${name} ${fmtRs(pricePaise)} as today's special until ${endTime}.`,
    intent: "daily_special",
    handled: true,
  };
}

// ── hours_update ───────────────────────────────────────────

async function hoursUpdate(merchant: any, message: string): Promise<HandlerResult> {
  // Parse: "open 8am to 11pm" or "hours 8:00 to 23:00"
  const match = message.match(
    /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i
  );
  if (!match) {
    return {
      reply: `Current hours: ${(merchant.config as any)?.hours?.open || "not set"} – ${(merchant.config as any)?.hours?.close || "not set"}.\nTo update: "open 8am to 11pm"`,
      intent: "hours_update",
      handled: true,
    };
  }

  let openHour = parseInt(match[1]);
  if (match[3]?.toLowerCase() === "pm" && openHour < 12) openHour += 12;
  if (match[3]?.toLowerCase() === "am" && openHour === 12) openHour = 0;
  const openMin = match[2] || "00";

  let closeHour = parseInt(match[4]);
  if (match[6]?.toLowerCase() === "pm" && closeHour < 12) closeHour += 12;
  if (match[6]?.toLowerCase() === "am" && closeHour === 12) closeHour = 0;
  const closeMin = match[5] || "00";

  const open = `${String(openHour).padStart(2, "0")}:${openMin}`;
  const close = `${String(closeHour).padStart(2, "0")}:${closeMin}`;

  const config = { ...((merchant.config as any) || {}), hours: { open, close } };
  await db
    .update(merchants)
    .set({ config, updatedAt: new Date() })
    .where(eq(merchants.id, merchant.id));

  return {
    reply: `Hours updated: ${open} – ${close}.`,
    intent: "hours_update",
    handled: true,
  };
}

// ── menu_ocr (stub) ────────────────────────────────────────

async function menuOcr(): Promise<HandlerResult> {
  return {
    reply: "Send a photo of your menu and I'll extract the items. Just snap a picture and send it here!",
    intent: "menu_ocr",
    handled: true,
  };
}
