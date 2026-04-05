import { db } from "../db/index.js";
import {
  riders,
  merchants,
  orders,
  riderEarnings,
  riderSessions,
  dailyPnl,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";

function fmtRs(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

// ── Rider settlement ───────────────────────────────────────

export async function runRiderSettlement(date: Date): Promise<void> {
  const dateStr = date.toISOString().split("T")[0];
  console.log(`[settlement] Running rider settlement for ${dateStr}`);

  const allRiders = await db.select().from(riders);

  for (const rider of allRiders) {
    // Get earnings for the day
    const earnings = await db
      .select()
      .from(riderEarnings)
      .where(and(eq(riderEarnings.riderId, rider.id), eq(riderEarnings.date, dateStr)));

    const totalEarned = earnings.reduce((s, e) => s + e.amountPaise, 0);

    // Calculate hours online from sessions
    const sessions = await db
      .select()
      .from(riderSessions)
      .where(eq(riderSessions.riderId, rider.id));

    let hoursOnline = 0;
    const dayStart = new Date(dateStr);
    const dayEnd = new Date(dayStart.getTime() + 86400000);

    for (const session of sessions) {
      const start = new Date(session.startedAt!);
      const end = session.endedAt ? new Date(session.endedAt) : dayEnd;

      // Clamp to the target day
      const effectiveStart = start < dayStart ? dayStart : start;
      const effectiveEnd = end > dayEnd ? dayEnd : end;

      if (effectiveStart < effectiveEnd) {
        hoursOnline += (effectiveEnd.getTime() - effectiveStart.getTime()) / 3600000;
      }
    }

    const guaranteeRatePaise = 12000; // ₹120/hr
    const guaranteed = Math.round(hoursOnline * guaranteeRatePaise);
    const topup = Math.max(0, guaranteed - totalEarned);

    if (topup > 0) {
      await db.insert(riderEarnings).values({
        riderId: rider.id,
        date: dateStr,
        amountPaise: topup,
        type: "guarantee_topup",
      });
    }

    const totalNet = totalEarned + topup;
    console.log(
      `[settlement] Rider ${rider.name}: ${fmtRs(totalEarned)} earned + ${fmtRs(topup)} topup = ${fmtRs(totalNet)} | ${hoursOnline.toFixed(1)}hr online`
    );
  }
}

// ── Restaurant settlement ──────────────────────────────────

export async function runRestaurantSettlement(date: Date): Promise<void> {
  const dateStr = date.toISOString().split("T")[0];
  console.log(`[settlement] Running restaurant settlement for ${dateStr}`);

  const allMerchants = await db.select().from(merchants);

  for (const merchant of allMerchants) {
    // Get delivered orders for the date
    const merchantOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.merchantId, merchant.id),
          eq(orders.status, "delivered")
        )
      );

    // Filter to target date
    const dayOrders = merchantOrders.filter((o) => {
      const d = o.updatedAt ? new Date(o.updatedAt).toISOString().split("T")[0] : "";
      return d === dateStr;
    });

    if (dayOrders.length === 0) continue;

    const gross = dayOrders.reduce((s, o) => s + o.subtotalPaise, 0);
    const commissionRate = merchant.commissionRate || 0.15;
    const commission = Math.round(gross * commissionRate);
    const gstOnCommission = Math.round(commission * 0.18);
    const tcs = Math.round(gross * 0.01);
    const net = gross - commission - gstOnCommission - tcs;

    console.log(
      `[settlement] Merchant ${merchant.name}: gross ${fmtRs(gross)} - commission ${fmtRs(commission)} - GST ${fmtRs(gstOnCommission)} - TCS ${fmtRs(tcs)} = net ${fmtRs(net)}`
    );
  }
}
