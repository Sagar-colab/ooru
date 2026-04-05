import { Router } from "express";
import { db } from "../db/index.js";
import {
  orders,
  riders,
  neighbourhoodBcfs,
  riderEarnings,
  merchants,
} from "../db/schema.js";
import { eq, and, gte, desc, sql } from "drizzle-orm";

const router = Router();

// GET /api/admin/metrics
router.get("/metrics", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayOrders = await db
    .select()
    .from(orders)
    .where(gte(orders.createdAt, today));

  const govToday = todayOrders.reduce((s, o) => s + o.totalPaise, 0);

  const onlineRiders = await db
    .select()
    .from(riders)
    .where(eq(riders.isOnline, true));

  const activeBcfs = await db
    .select()
    .from(neighbourhoodBcfs)
    .where(eq(neighbourhoodBcfs.status, "reported"));

  const todayStr = today.toISOString().split("T")[0];
  const todayEarnings = await db
    .select()
    .from(riderEarnings)
    .where(eq(riderEarnings.date, todayStr));
  const guaranteeBurn = todayEarnings
    .filter((e) => e.type === "guarantee_topup")
    .reduce((s, e) => s + e.amountPaise, 0);

  res.json({
    ordersToday: todayOrders.length,
    govTodayPaise: govToday,
    ridersOnline: onlineRiders.length,
    activeBcfs: activeBcfs.length,
    guaranteeBurnPaise: guaranteeBurn,
    timestamp: new Date().toISOString(),
  });
});

// GET /api/admin/orders/recent
router.get("/orders/recent", async (_req, res) => {
  const rows = await db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .limit(20);
  res.json(rows);
});

// GET /api/admin/fleet
router.get("/fleet", async (_req, res) => {
  const allRiders = await db.select().from(riders);
  const online = allRiders.filter((r) => r.isOnline);
  const zones = new Map<string, number>();
  for (const r of online) {
    const z = r.zone || r.neighbourhoodSlug || "unknown";
    zones.set(z, (zones.get(z) || 0) + 1);
  }

  res.json({
    totalRiders: allRiders.length,
    online: online.length,
    zones: Object.fromEntries(zones),
    riders: online.map((r) => ({
      id: r.id,
      name: r.name,
      zone: r.zone,
      lat: r.lat,
      lng: r.lng,
      rating: r.ratingAvg,
    })),
  });
});

// GET /api/admin/alerts
router.get("/alerts", async (_req, res) => {
  const alerts: { severity: string; message: string }[] = [];

  // Check riders with low rating
  const lowRating = await db.select().from(riders).where(sql`${riders.ratingAvg} < 4.0`);
  for (const r of lowRating) {
    alerts.push({ severity: "warning", message: `Rider ${r.name} rating ${r.ratingAvg}/5 — below threshold` });
  }

  // Check unresolved BCFs > 7 days
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const oldBcfs = await db
    .select()
    .from(neighbourhoodBcfs)
    .where(and(eq(neighbourhoodBcfs.status, "reported"), sql`${neighbourhoodBcfs.createdAt} < ${weekAgo}`));
  if (oldBcfs.length > 0) {
    alerts.push({ severity: "warning", message: `${oldBcfs.length} BCFs unresolved for 7+ days` });
  }

  // Check no riders online
  const online = await db.select().from(riders).where(eq(riders.isOnline, true));
  if (online.length === 0) {
    alerts.push({ severity: "critical", message: "No riders online — deliveries cannot be dispatched" });
  }

  res.json(alerts);
});

export default router;
