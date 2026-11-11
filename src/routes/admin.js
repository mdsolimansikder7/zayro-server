const { Router } = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { z } = require("zod");
const { requireAdmin, requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/errors");
const { productForClient } = require("../lib/api-product");
const { uploadProductImage } = require("../lib/r2");
const { Cart, NewsletterUsage, Order, Product, Review, Subscriber, User } = require("../models");
const { campaignEmail, FRONTEND_URL, sendEmail } = require("../lib/newsletter-email");

const router = Router();
const collectionNames = ["new", "top", "detail", "related"];
const orderStatuses = ["placed", "processing", "shipped", "delivered", "cancelled"];
const normalizeCategory = (value) => value.trim().toLowerCase() === "t-shirts" ? "T-Shirts" : value.trim();

const productSchema = z.object({
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  image: z.string().trim().min(1).max(1000),
  images: z.array(z.string().trim().min(1).max(1000)).max(10).default([]),
  oldPrice: z.number().min(0).nullable().default(null),
  discount: z.number().min(0).max(100).nullable().default(null),
  collectionName: z.enum(collectionNames),
  category: z.string().trim().min(1).max(80).transform(normalizeCategory),
  brand: z.string().trim().min(1).max(80).default("Zayro"),
  styles: z.array(z.string().trim().min(1).max(80)).max(20).default(["Casual"]),
  description: z.string().trim().min(1).max(5000),
  price: z.number().min(0),
  colors: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  sizes: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
});

router.use(requireAuth, requireAdmin);

const campaignSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  body: z.string().trim().min(10).max(10000),
});
const NEWSLETTER_DAILY_CAP = 400;
const NEWSLETTER_BATCH_SIZE = 10;

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

router.post("/newsletter/campaign", async (request, response, next) => {
  const parsed = campaignSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a subject and campaign message."));

  try {
    const subscribers = await Subscriber.find({
      $or: [{ status: "active" }, { status: { $exists: false } }],
    }).sort({ subscribedAt: 1, createdAt: 1 });
    for (const subscriber of subscribers) {
      if (normalizeSubscriberForAdmin(subscriber)) await subscriber.save();
    }

    const recipients = subscribers.filter((subscriber) => subscriber.status === "active" && subscriber.unsubscribeToken);
    const usage = await NewsletterUsage.findOne({ day: dayKey() }).lean();
    const sentToday = usage?.count || 0;
    if (sentToday + recipients.length > NEWSLETTER_DAILY_CAP) {
      return next(apiError(
        409,
        `This campaign would send ${recipients.length} emails, but only ${Math.max(0, NEWSLETTER_DAILY_CAP - sentToday)} remain in today's ${NEWSLETTER_DAILY_CAP}-email safety cap.`,
      ));
    }

    await NewsletterUsage.findOneAndUpdate(
      { day: dayKey() },
      { $inc: { count: recipients.length }, $setOnInsert: { day: dayKey() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    let sent = 0;
    const failures = [];
    for (let index = 0; index < recipients.length; index += NEWSLETTER_BATCH_SIZE) {
      const batch = recipients.slice(index, index + NEWSLETTER_BATCH_SIZE);
      await Promise.all(batch.map(async (subscriber) => {
        const unsubscribeUrl = `${FRONTEND_URL}/unsubscribe?token=${encodeURIComponent(subscriber.unsubscribeToken)}`;
        const email = campaignEmail({
          subject: parsed.data.subject,
          body: parsed.data.body,
          unsubscribeUrl,
        });
        try {
          await sendEmail({
            to: subscriber.email,
            subject: parsed.data.subject,
            ...email,
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });
          sent += 1;
        } catch (error) {
          failures.push({ email: subscriber.email, error: error.message });
        }
      }));
      if (index + NEWSLETTER_BATCH_SIZE < recipients.length) await wait(250);
    }

    if (failures.length) {
      await NewsletterUsage.updateOne({ day: dayKey() }, { $inc: { count: -failures.length } });
    }
    return response.json({ sent, failed: failures.length, failures });
  } catch (error) {
    return next(error);
  }
});

function normalizeSubscriberForAdmin(subscriber) {
  let changed = false;
  if (!subscriber.status) {
    subscriber.status = "active";
    subscriber.confirmedAt = subscriber.confirmedAt || subscriber.subscribedAt || subscriber.createdAt || new Date();
    changed = true;
  }
  if (!subscriber.unsubscribeToken) {
    const crypto = require("crypto");
    subscriber.unsubscribeToken = crypto.randomBytes(32).toString("hex");
    changed = true;
  }
  if (!subscriber.subscribedAt) {
    subscriber.subscribedAt = subscriber.createdAt || new Date();
    changed = true;
  }
  return changed;
}

const productImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith("image/"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.post("/uploads", productImageUpload.array("images", 10), async (request, response, next) => {
  if (!request.files?.length) return next(apiError(400, "Choose at least one valid image file up to 5 MB."));
  try {
    const urls = await Promise.all(request.files.map((file) => uploadProductImage(file)));
    return response.status(201).json({ urls });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (_request, response, next) => {
  try {
    const [
      productCount,
      orderCount,
      userCount,
      subscriberCount,
      products,
      orders,
      users,
      subscribers,
      revenueResult,
    ] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      User.countDocuments(),
      Subscriber.countDocuments(),
      Product.find().sort({ createdAt: -1 }).limit(200).lean(),
      Order.find()
        .select("user items total status createdAt shippingAddress paymentMethod")
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      User.find().select("name email createdAt").sort({ createdAt: -1 }).limit(200).lean(),
      Subscriber.find().select("email status source subscribedAt confirmedAt unsubscribedAt createdAt").sort({ createdAt: -1 }).limit(200).lean(),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
    ]);

    return response.json({
      stats: {
        products: productCount,
        orders: orderCount,
        users: userCount,
        subscribers: subscriberCount,
        revenue: revenueResult[0]?.total ?? 0,
      },
      products: products.map((product) => ({
        ...productForClient(product),
        id: product._id.toString(),
      })),
      orders: orders.map((order) => ({
        id: order._id.toString(),
        customerName: order.user?.name ?? "Unknown customer",
        customerEmail: order.user?.email ?? "Unavailable",
        items: order.items,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
      })),
      users: users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })),
      subscribers: subscribers.map(({ email, status, source, subscribedAt, confirmedAt, unsubscribedAt, createdAt }) => ({
        email,
        status: status || "active",
        source: source || "footer",
        subscribedAt: subscribedAt || createdAt,
        confirmedAt: confirmedAt || createdAt,
        unsubscribedAt: unsubscribedAt || null,
        createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/products", async (request, response, next) => {
  const parsed = productSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide valid product details."));

  try {
    const product = await Product.create(parsed.data);
    return response.status(201).json({
      product: { ...productForClient(product), id: product.id },
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/products/:productId", async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.productId)) {
    return next(apiError(400, "Invalid product id."));
  }
  const parsed = productSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide valid product details."));

  try {
    const product = await Product.findByIdAndUpdate(
      request.params.productId,
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!product) return next(apiError(404, "Product not found."));
    return response.json({ product: { ...productForClient(product), id: product.id } });
  } catch (error) {
    return next(error);
  }
});

router.delete("/products/:productId", async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.productId)) {
    return next(apiError(400, "Invalid product id."));
  }

  try {
    const productId = new mongoose.Types.ObjectId(request.params.productId);
    const [orderReferences, cartReferences, reviews] = await Promise.all([
      Order.countDocuments({ "items.product": productId }),
      Cart.countDocuments({ "items.product": productId }),
      Review.countDocuments({ product: productId }),
    ]);
    if (orderReferences || cartReferences || reviews) {
      return next(apiError(409, "This product is used by an order, cart, or review and cannot be deleted."));
    }

    const product = await Product.findByIdAndDelete(productId);
    if (!product) return next(apiError(404, "Product not found."));
    return response.json({ deleted: true });
  } catch (error) {
    return next(error);
  }
});

router.patch("/orders/:orderId", async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.orderId)) {
    return next(apiError(400, "Invalid order id."));
  }
  const parsed = z.object({ status: z.enum(orderStatuses) }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a valid order status."));

  try {
    const order = await Order.findByIdAndUpdate(
      request.params.orderId,
      { $set: { status: parsed.data.status } },
      { new: true, runValidators: true },
    );
    if (!order) return next(apiError(404, "Order not found."));
    return response.json({ order: { id: order.id, status: order.status } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
