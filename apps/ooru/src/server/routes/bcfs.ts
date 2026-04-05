import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { neighbourhoodBcfs } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { emitToMerchant } from "../socket.js";
import { getIO } from "../socket.js";

const router = Router();

const createBcfSchema = z.object({
  neighbourhoodSlug: z.string(),
  reporterPhoneHash: z.string().optional(),
  category: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  hexCell: z.string().optional(),
});

// GET /api/bcfs/:slug
router.get("/:slug", async (req, res) => {
  const rows = await db
    .select()
    .from(neighbourhoodBcfs)
    .where(eq(neighbourhoodBcfs.neighbourhoodSlug, req.params.slug))
    .orderBy(desc(neighbourhoodBcfs.createdAt))
    .limit(100);
  res.json(rows);
});

// POST /api/bcfs
router.post("/", async (req, res) => {
  const parsed = createBcfSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const [bcf] = await db.insert(neighbourhoodBcfs).values(parsed.data).returning();

  // Emit to map clients
  const io = getIO();
  if (io) {
    io.emit("bcf:new", bcf);
  }

  res.status(201).json(bcf);
});

// PATCH /api/bcfs/:id/upvote
router.patch("/:id/upvote", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });

  const [bcf] = await db
    .select()
    .from(neighbourhoodBcfs)
    .where(eq(neighbourhoodBcfs.id, id))
    .limit(1);
  if (!bcf) return res.status(404).json({ error: "BCF not found" });

  const [updated] = await db
    .update(neighbourhoodBcfs)
    .set({ upvotes: (bcf.upvotes || 0) + 1 })
    .where(eq(neighbourhoodBcfs.id, id))
    .returning();

  res.json(updated);
});

// PATCH /api/bcfs/:id/status
router.patch("/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  if (isNaN(id) || !status) return res.status(400).json({ error: "Invalid" });

  const [updated] = await db
    .update(neighbourhoodBcfs)
    .set({
      status,
      ...(status === "resolved" ? { resolvedAt: new Date() } : {}),
    })
    .where(eq(neighbourhoodBcfs.id, id))
    .returning();

  if (!updated) return res.status(404).json({ error: "BCF not found" });
  res.json(updated);
});

export default router;
