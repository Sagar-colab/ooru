import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { conversations, consumers } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { runEvo, type Role } from "../evo/index.js";

const router = Router();

const chatSchema = z.object({
  role: z.enum(["consumer", "shop_owner", "merchant", "rider", "admin"]),
  phone: z.string(),
  message: z.string().min(1),
});

// POST /api/demo/chat
router.post("/chat", async (req, res) => {
  const parsed = chatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { role, phone, message } = parsed.data;

  // Map admin to shop_owner for demo purposes
  const evoRole: Role = role === "admin" ? "shop_owner" : role;

  // Use a stable demo phone that maps to seeded data
  const demoPhone = getDemoPhone(evoRole);

  // Ensure demo consumer + conversation exists
  if (evoRole === "consumer") {
    const [existing] = await db
      .select()
      .from(consumers)
      .where(eq(consumers.phone, demoPhone))
      .limit(1);
    if (!existing) {
      await db.insert(consumers).values({
        phone: demoPhone,
        name: "Demo Consumer",
        neighbourhoodSlug: "indiranagar",
        dietary: "both",
      });
    }
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.phone, demoPhone))
      .limit(1);
    if (!convo) {
      await db.insert(conversations).values({
        phone: demoPhone,
        role: "consumer",
        persona: "consumer",
        state: { step: "done" },
      });
    }
  }

  const result = await runEvo({
    role: evoRole,
    phone: demoPhone,
    message,
  });

  res.json({
    reply: result.reply,
    intent: result.intent,
    persona: evoRole,
  });
});

// GET /api/demo/reset/:role
router.get("/reset/:role", async (req, res) => {
  const role = req.params.role;
  const phone = `demo-${role}`;

  await db
    .delete(conversations)
    .where(eq(conversations.phone, phone));

  res.json({ ok: true });
});

// Map demo roles to seeded phone numbers so context loaders find data
function getDemoPhone(role: Role): string {
  switch (role) {
    case "shop_owner":
      return "9900002001"; // Ramesh Kirana
    case "merchant":
      return "9900001001"; // Meghana Foods
    case "consumer":
      return "demo-consumer";
    case "rider":
      return "9900004001"; // Ravi Kumar
    default:
      return "demo-unknown";
  }
}

export default router;
