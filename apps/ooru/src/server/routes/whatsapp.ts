import { Router } from "express";
import { db } from "../db/index.js";
import {
  messageLog,
  conversations,
  consumers,
  shopBusinesses,
  riders,
} from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { detectRole, runEvo, isNoise } from "../evo/index.js";
import { sendWhatsApp } from "../evo/gupshup.js";
import type { GupshupMessage } from "../../shared/types.js";

const router = Router();

// ── new user onboarding flow ───────────────────────────────

const WELCOME_MSG = `Hi! I'm Ooru — your neighbourhood on WhatsApp. ✨

Are you a:
1️⃣ Resident / Customer
2️⃣ Shop owner
3️⃣ Rider`;

const BIZ_TYPES = [
  "kirana",
  "salon",
  "pharmacy",
  "mobile_repair",
  "restaurant",
  "other",
];

async function handleNewUser(
  phone: string,
  text: string,
  convo: { id: number; state: any } | null
): Promise<string> {
  const state = convo?.state || {};

  // No state yet — send welcome
  if (!state.step) {
    if (convo) {
      await db
        .update(conversations)
        .set({ state: { step: "awaiting_role_selection" } })
        .where(eq(conversations.id, convo.id));
    } else {
      await db.insert(conversations).values({
        phone,
        role: "new_user",
        persona: "onboarding",
        state: { step: "awaiting_role_selection" },
      });
    }
    return WELCOME_MSG;
  }

  // Awaiting role selection
  if (state.step === "awaiting_role_selection") {
    const choice = text.trim();
    if (choice === "1") {
      await db.insert(consumers).values({ phone });
      await db
        .update(conversations)
        .set({ state: { step: "awaiting_consumer_name" } })
        .where(eq(conversations.id, convo!.id));
      return "Welcome to Ooru! 🎉 What's your name?";
    }
    if (choice === "2") {
      await db
        .update(conversations)
        .set({ state: { step: "awaiting_business_name" } })
        .where(eq(conversations.id, convo!.id));
      return "Great! What's your business name?";
    }
    if (choice === "3") {
      await db
        .update(conversations)
        .set({ state: { step: "awaiting_rider_name" } })
        .where(eq(conversations.id, convo!.id));
      return "Welcome, delivery partner! What's your name?";
    }
    return "Please reply 1, 2, or 3.";
  }

  // Consumer — awaiting name
  if (state.step === "awaiting_consumer_name") {
    await db
      .update(consumers)
      .set({ name: text.trim() })
      .where(eq(consumers.phone, phone));
    await db
      .update(conversations)
      .set({ state: { step: "awaiting_consumer_dietary" } })
      .where(eq(conversations.id, convo!.id));
    return `Nice to meet you, ${text.trim()}! Are you:\n1️⃣ Veg\n2️⃣ Non-veg\n3️⃣ Both`;
  }

  // Consumer — awaiting dietary
  if (state.step === "awaiting_consumer_dietary") {
    const dietMap: Record<string, string> = { "1": "veg", "2": "nonveg", "3": "both" };
    const dietary = dietMap[text.trim()] || "both";
    await db
      .update(consumers)
      .set({ dietary })
      .where(eq(consumers.phone, phone));
    await db
      .update(conversations)
      .set({
        role: "consumer",
        persona: "consumer",
        state: { step: "done" },
      })
      .where(eq(conversations.id, convo!.id));
    return "Great! Now tell me what you're hungry for, or ask about anything in Indiranagar. 🍽️";
  }

  // Shop owner — awaiting business name
  if (state.step === "awaiting_business_name") {
    await db
      .update(conversations)
      .set({
        state: { step: "awaiting_business_type", businessName: text.trim() },
      })
      .where(eq(conversations.id, convo!.id));
    return `Got it — "${text.trim()}". What type of business?

1️⃣ Kirana
2️⃣ Salon
3️⃣ Pharmacy
4️⃣ Mobile Repair
5️⃣ Restaurant
6️⃣ Other`;
  }

  // Shop owner — awaiting business type
  if (state.step === "awaiting_business_type") {
    const idx = parseInt(text.trim()) - 1;
    const bizType = BIZ_TYPES[idx] || "other";
    const bizName = state.businessName || "My Shop";

    await db.insert(shopBusinesses).values({
      phone,
      businessName: bizName,
      businessType: bizType,
    });
    await db
      .update(conversations)
      .set({
        role: "shop_owner",
        persona: "shop_owner",
        state: { step: "done" },
      })
      .where(eq(conversations.id, convo!.id));
    return `Done! "${bizName}" (${bizType}) is registered on Ooru. 🎉 Ask me about udhar tracking, inventory, or anything for your shop.`;
  }

  // Rider — awaiting name
  if (state.step === "awaiting_rider_name") {
    await db.insert(riders).values({
      phone,
      name: text.trim(),
      isOnline: false,
    });
    await db
      .update(conversations)
      .set({
        role: "rider",
        persona: "rider",
        state: { step: "done" },
      })
      .where(eq(conversations.id, convo!.id));
    return `Welcome ${text.trim()}! 🏍️ You're registered as a rider. You'll start getting delivery requests once activated.`;
  }

  return WELCOME_MSG;
}

// ── POST /api/webhook/whatsapp ─────────────────────────────

router.post("/whatsapp", async (req, res) => {
  try {
    const body = req.body as GupshupMessage;

    // Ignore non-message events
    if (body.type !== "message") {
      return res.sendStatus(200);
    }

    const payload = body.payload;
    const phone = payload.sender.phone;
    const messageId = payload.id;
    const text = payload.payload?.text || "";
    const mediaUrl = payload.payload?.url;
    const mediaType = payload.type;

    // 1. Dedup — check message_log
    const [existing] = await db
      .select()
      .from(messageLog)
      .where(eq(messageLog.gupshupMsgId, messageId))
      .limit(1);

    if (existing) {
      console.log(`[webhook] Dedup: ${messageId} already processed`);
      return res.sendStatus(200);
    }

    // 2. Log inbound
    await db.insert(messageLog).values({
      gupshupMsgId: messageId,
      phoneLast4: phone.slice(-4),
      direction: "inbound",
      intent: "unknown",
    });

    // 3. Detect role
    const role = await detectRole(phone);

    // 4. Load conversation
    const [convo] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.phone, phone))
      .limit(1);

    // 5. Handle new user onboarding
    if (role === "new_user" && (!convo || convo.state?.step !== "done")) {
      const reply = await handleNewUser(phone, text, convo);
      await sendWhatsApp(phone, reply);

      // Log outbound
      await db.insert(messageLog).values({
        phoneLast4: phone.slice(-4),
        direction: "outbound",
        intent: "onboarding",
      });

      return res.sendStatus(200);
    }

    // 6. Noise filter
    if (isNoise(text)) {
      console.log(`[webhook] Noise: "${text}" from ...${phone.slice(-4)}`);
      return res.sendStatus(200);
    }

    // 7. Run Evo
    const evoResult = await runEvo({
      role: role as Exclude<typeof role, "new_user">,
      phone,
      message: text,
      mediaUrl,
    });

    if (evoResult.intent === "noise") {
      return res.sendStatus(200);
    }

    // 8. Send reply
    if (evoResult.reply) {
      await sendWhatsApp(phone, evoResult.reply);
    }

    // 9. Update conversation
    if (convo) {
      await db
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          state: { ...((convo.state as any) || {}), lastIntent: evoResult.intent },
        })
        .where(eq(conversations.id, convo.id));
    } else {
      await db.insert(conversations).values({
        phone,
        role,
        persona: role,
        state: { lastIntent: evoResult.intent },
      });
    }

    // 10. Log outbound
    if (evoResult.reply) {
      await db.insert(messageLog).values({
        phoneLast4: phone.slice(-4),
        direction: "outbound",
        intent: evoResult.intent,
      });
    }

    return res.sendStatus(200);
  } catch (err: any) {
    console.error("[webhook] Error:", err.message, err.stack);
    return res.sendStatus(200); // Always 200 for webhooks
  }
});

export default router;
