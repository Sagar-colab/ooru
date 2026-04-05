import { db } from "../../db/index.js";
import {
  orders,
  riders,
  neighbourhoodBcfs,
  riderEarnings,
  merchants,
} from "../../db/schema.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export interface HandlerResult {
  reply: string;
  intent: string;
  handled: boolean;
}

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// ── intent matchers ────────────────────────────────────────

const INTENT_PATTERNS: [RegExp, string][] = [
  [/(pulse|how\s*are\s*we|dashboard|stats)/i, "platform_pulse"],
  [/(fleet|riders?\s*status|who.?s\s*online)/i, "fleet_status"],
  [/(settlement|payout)/i, "settlement_status"],
  [/(alert|warning|violation|issue|problem)/i, "alerts"],
];

export function matchAdminIntent(message: string): string | null {
  const text = message.toLowerCase().trim();
  for (const [pattern, intent] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

// ── dispatch ───────────────────────────────────────────────

export async function handleAdminIntent(
  intent: string,
  _phone: string,
  _message: string
): Promise<HandlerResult> {
  switch (intent) {
    case "platform_pulse":
      return platformPulse();
    case "fleet_status":
      return fleetStatus();
    case "settlement_status":
      return settlementStatus();
    case "alerts":
      return checkAlerts();
    default:
      return { reply: "", intent: "", handled: false };
  }
}

// ── platform_pulse ─────────────────────────────────────────

async function platformPulse(): Promise<HandlerResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayOrders = await db.select().from(orders).where(gte(orders.createdAt, today));
  const gov = todayOrders.reduce((s, o) => s + o.totalPaise, 0);
  const delivered = todayOrders.filter((o) => o.status === "delivered").length;

  const online = await db.select().from(riders).where(eq(riders.isOnline, true));

  const bcfs = await db.select().from(neighbourhoodBcfs).where(eq(neighbourhoodBcfs.status, "reported"));

  const todayStr = today.toISOString().split("T")[0];
  const earnings = await db.select().from(riderEarnings).where(eq(riderEarnings.date, todayStr));
  const guaranteeBurn = earnings.filter((e) => e.type === "guarantee_topup").reduce((s, e) => s + e.amountPaise, 0);

  return {
    reply: `📊 *Platform Pulse*\n\nOrders today: ${todayOrders.length} (${delivered} delivered)\nGOV: ${fmtRs(gov)}\nRiders online: ${online.length}\nActive BCFs: ${bcfs.length}\nGuarantee burn: ${fmtRs(guaranteeBurn)}`,
    intent: "platform_pulse",
    handled: true,
  };
}

// ── fleet_status ───────────────────────────────────────────

async function fleetStatus(): Promise<HandlerResult> {
  const allRiders = await db.select().from(riders);
  const online = allRiders.filter((r) => r.isOnline);

  const zones = new Map<string, string[]>();
  for (const r of online) {
    const z = r.zone || r.neighbourhoodSlug || "unknown";
    const list = zones.get(z) || [];
    list.push(r.name);
    zones.set(z, list);
  }

  let reply = `🏍️ *Fleet Status*\n\nOnline: ${online.length}/${allRiders.length}\n`;
  for (const [zone, names] of zones) {
    reply += `\n${zone}: ${names.join(", ")}`;
  }

  if (online.length === 0) {
    reply += "\n⚠ No riders online!";
  }

  return { reply, intent: "fleet_status", handled: true };
}

// ── settlement_status ──────────────────────────────────────

async function settlementStatus(): Promise<HandlerResult> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().split("T")[0];

  const yEarnings = await db.select().from(riderEarnings).where(eq(riderEarnings.date, yStr));
  const riderTotal = yEarnings.reduce((s, e) => s + e.amountPaise, 0);
  const riderCount = new Set(yEarnings.map((e) => e.riderId)).size;

  const yOrders = await db.select().from(orders).where(eq(orders.status, "delivered"));
  const merchantTotal = yOrders.reduce((s, o) => s + o.subtotalPaise, 0);

  return {
    reply: `💰 *Settlement Status*\n\nYesterday:\nRiders: ${riderCount} settled, ${fmtRs(riderTotal)}\nMerchants: ${fmtRs(merchantTotal)} gross\n\nNext:\nRiders: Tonight 11 PM\nRestaurants: Tomorrow 6 AM`,
    intent: "settlement_status",
    handled: true,
  };
}

// ── alerts ─────────────────────────────────────────────────

async function checkAlerts(): Promise<HandlerResult> {
  const alerts: string[] = [];

  const online = await db.select().from(riders).where(eq(riders.isOnline, true));
  if (online.length === 0) {
    alerts.push("🔴 No riders online");
  }

  const lowRating = await db.select().from(riders).where(sql`${riders.ratingAvg} < 4.0`);
  for (const r of lowRating) {
    alerts.push(`⚠ Rider ${r.name}: ${r.ratingAvg}/5 rating`);
  }

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const oldBcfs = await db
    .select()
    .from(neighbourhoodBcfs)
    .where(and(eq(neighbourhoodBcfs.status, "reported"), sql`${neighbourhoodBcfs.createdAt} < ${weekAgo}`));
  if (oldBcfs.length > 0) {
    alerts.push(`⚠ ${oldBcfs.length} BCFs unresolved 7+ days`);
  }

  if (alerts.length === 0) {
    return { reply: "✅ No active alerts. All systems normal.", intent: "alerts", handled: true };
  }

  return {
    reply: `🚨 *Alerts (${alerts.length})*\n\n${alerts.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
    intent: "alerts",
    handled: true,
  };
}
