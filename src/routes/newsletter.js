const crypto = require("crypto");
const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const { z } = require("zod");
const { PromoCode, Subscriber } = require("../models");
const { apiError } = require("../lib/errors");
const {
  API_URL,
  FRONTEND_URL,
  confirmationEmail,
  sendEmail,
  welcomeEmail,
} = require("../lib/newsletter-email");

const router = Router();
const subscribeLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many subscription attempts. Please try again later." },
});
const sourceSchema = z.enum(["footer", "popup", "checkout"]).default("footer");

function token() {
  return crypto.randomBytes(32).toString("hex");
}

function normalizeSubscriber(subscriber) {
  let changed = false;
  if (!subscriber.status) {
    subscriber.status = "active";
    subscriber.confirmedAt = subscriber.confirmedAt || subscriber.subscribedAt || subscriber.createdAt || new Date();
    changed = true;
  }
  if (!subscriber.unsubscribeToken) {
    subscriber.unsubscribeToken = token();
    changed = true;
  }
  if (!subscriber.subscribedAt) {
    subscriber.subscribedAt = subscriber.createdAt || new Date();
    changed = true;
  }
  return changed;
}

async function sendConfirmation(subscriber) {
  const confirmUrl = `${API_URL}/api/newsletter/confirm?token=${encodeURIComponent(subscriber.confirmToken)}`;
  const email = confirmationEmail({ email: subscriber.email, confirmUrl });
  await sendEmail({
    to: subscriber.email,
    ...email,
    headers: {
      "List-Unsubscribe": `<${FRONTEND_URL}/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

async function subscribe(request, response, next) {
  const body = request.body || {};
  if (body.website) return response.status(202).json({ message: "Thanks for subscribing." });
  const parsed = z.object({
    email: z.string().trim().email().max(254),
    source: sourceSchema,
  }).safeParse(body);
  if (!parsed.success) return next(apiError(400, "Enter a valid email address."));

  try {
    const email = parsed.data.email.toLowerCase();
    let subscriber = await Subscriber.findOne({ email });
    if (!subscriber) {
      subscriber = new Subscriber({
        email,
        source: parsed.data.source,
        status: "pending",
        unsubscribeToken: token(),
        confirmToken: token(),
        subscribedAt: new Date(),
      });
    } else {
      const migrated = normalizeSubscriber(subscriber);
      if (subscriber.status === "active") {
        if (migrated) await subscriber.save();
        return response.json({ message: "You're already subscribed." });
      }
      subscriber.status = "pending";
      subscriber.source = parsed.data.source;
      subscriber.confirmToken = token();
      subscriber.unsubscribedAt = null;
      if (!subscriber.unsubscribeToken) subscriber.unsubscribeToken = token();
    }

    await subscriber.save();
    await sendConfirmation(subscriber);
    return response.status(202).json({ message: "Check your inbox to confirm your subscription." });
  } catch (error) {
    return next(error);
  }
}

router.post("/", subscribeLimit, subscribe);
router.post("/subscribe", subscribeLimit, subscribe);

router.get("/confirm", async (request, response, next) => {
  const parsed = z.string().min(20).safeParse(request.query.token);
  if (!parsed.success) return response.redirect(`${FRONTEND_URL}/newsletter/confirmed?status=invalid`);

  try {
    const subscriber = await Subscriber.findOne({ confirmToken: parsed.data });
    if (!subscriber) return response.redirect(`${FRONTEND_URL}/newsletter/confirmed?status=invalid`);
    normalizeSubscriber(subscriber);
    subscriber.status = "active";
    subscriber.confirmedAt = new Date();
    subscriber.confirmToken = null;
    subscriber.unsubscribedAt = null;
    await subscriber.save();

    const promo = await PromoCode.findOne({ code: "WELCOME10", active: true }).select("code").lean();
    const unsubscribeUrl = `${FRONTEND_URL}/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
    const email = welcomeEmail({ unsubscribeUrl, promoCode: promo?.code });
    await sendEmail({
      to: subscriber.email,
      ...email,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    return response.redirect(`${FRONTEND_URL}/newsletter/confirmed`);
  } catch (error) {
    return next(error);
  }
});

async function unsubscribe(request, response, next) {
  const parsed = z.string().min(20).safeParse(request.query.token || request.body?.token);
  if (!parsed.success) return response.status(400).json({ error: "Invalid unsubscribe link." });

  try {
    const subscriber = await Subscriber.findOne({ unsubscribeToken: parsed.data });
    if (subscriber) {
      normalizeSubscriber(subscriber);
      subscriber.status = "unsubscribed";
      subscriber.unsubscribedAt = subscriber.unsubscribedAt || new Date();
      subscriber.confirmToken = null;
      await subscriber.save();
    }
    if (request.method === "GET") return response.redirect(`${FRONTEND_URL}/unsubscribe?status=done`);
    return response.json({ message: "You have been unsubscribed." });
  } catch (error) {
    return next(error);
  }
}

router.get("/unsubscribe", unsubscribe);
router.post("/unsubscribe", unsubscribe);

module.exports = router;
