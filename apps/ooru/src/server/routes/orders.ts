import { Router } from "express";
import { db } from "../db/index.js";
import { orders } from "../db/schema.js";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  const status = req.query.status as string | undefined;
  if (status) {
    const rows = await db
      .select()
      .from(orders)
      .where(eq(orders.status, status));
    return res.json(rows);
  }
  const rows = await db.select().from(orders);
  res.json(rows);
});

export default router;
