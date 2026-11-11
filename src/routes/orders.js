const { Router } = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/errors");
const { calculateTotals } = require("../lib/pricing");
const { Cart, Order } = require("../models");

const router = Router();
const shippingAddressSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(6).max(30),
  addressLine1: z.string().trim().min(3).max(200),
  addressLine2: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(2).max(20),
  country: z.literal("Bangladesh"),
});

router.use(requireAuth);

router.post("/", async (request, response, next) => {
  const parsed = z.object({ shippingAddress: shippingAddressSchema }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a complete and valid shipping address."));

  try {
    const cart = await Cart.findOne({ user: request.user.id }).populate("items.product");
    if (!cart || cart.items.length === 0) return next(apiError(400, "Your cart is empty."));

    const hasPreviousOrder = await Order.exists({ user: request.user.id });
    const totals = await calculateTotals(cart.items, cart.promoCode, undefined, { isFirstOrder: !hasPreviousOrder });
    if (totals.error) return next(apiError(400, totals.error));
    const order = await Order.create({
      user: request.user.id,
      items: cart.items.map((item) => ({
        product: item.product.id,
        slug: item.product.slug,
        title: item.product.title,
        image: item.product.image,
        unitPrice: item.product.price,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
      })),
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      promoDiscount: totals.promoDiscount,
      deliveryFee: totals.deliveryFee,
      total: totals.total,
      promoCode: totals.promoCode,
      shippingAddress: parsed.data.shippingAddress,
    });

    cart.items = [];
    cart.promoCode = null;
    await cart.save();
    return response.status(201).json({ order });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (request, response, next) => {
  const parsed = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }).safeParse(request.query);
  if (!parsed.success) return next(apiError(400, "Invalid pagination values."));

  try {
    const { page, limit } = parsed.data;
    const [orders, total] = await Promise.all([
      Order.find({ user: request.user.id })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments({ user: request.user.id }),
    ]);
    return response.json({ orders, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    return next(error);
  }
});

router.get("/:orderId", async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.orderId)) {
    return next(apiError(400, "Invalid order id."));
  }
  try {
    const order = await Order.findOne({ _id: request.params.orderId, user: request.user.id }).lean();
    if (!order) return next(apiError(404, "Order not found."));
    return response.json({ order });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
