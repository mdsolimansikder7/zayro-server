const { Router } = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/errors");
const { calculateTotals } = require("../lib/pricing");
const { productForClient } = require("../lib/api-product");
const { Cart, Order, Product } = require("../models");

const router = Router();
router.use(requireAuth);

async function getCart(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) cart = await Cart.create({ user: userId });
  return cart;
}

async function cartResponse(cart) {
  await cart.populate("items.product");
  const hasPreviousOrder = await Order.exists({ user: cart.user });
  let totals = await calculateTotals(cart.items, cart.promoCode, undefined, { isFirstOrder: !hasPreviousOrder });
  if (totals.error) {
    cart.promoCode = null;
    await cart.save();
    totals = await calculateTotals(cart.items, null, undefined, { isFirstOrder: !hasPreviousOrder });
  }
  return {
    cart: {
      id: cart.id,
      items: cart.items.map((item) => {
        const result = item.toObject();
        result.product = productForClient(item.product);
        return result;
      }),
      promoCode: totals.promoCode,
      ...totals,
    },
  };
}

router.get("/", async (request, response, next) => {
  try {
    return response.json(await cartResponse(await getCart(request.user.id)));
  } catch (error) {
    return next(error);
  }
});

router.post("/items", async (request, response, next) => {
  const parsed = z.object({
    productSlug: z.string().trim().min(1),
    size: z.string().trim().min(1),
    color: z.string().trim().min(1),
    quantity: z.number().int().min(1).max(99).default(1),
  }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a valid product, size, color, and quantity."));

  try {
    const { productSlug, size, color, quantity } = parsed.data;
    const product = await Product.findOne({ slug: productSlug });
    if (!product) return next(apiError(404, "Product not found."));
    if (!product.sizes.includes(size) || !product.colors.includes(color)) {
      return next(apiError(400, "That size or color is not available for this product."));
    }

    const cart = await getCart(request.user.id);
    const existing = cart.items.find(
      (item) => item.product.equals(product.id) && item.size === size && item.color === color,
    );
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + quantity);
    } else {
      cart.items.push({ product: product.id, size, color, quantity });
    }
    await cart.save();
    return response.status(201).json(await cartResponse(cart));
  } catch (error) {
    return next(error);
  }
});

router.patch("/items/:itemId", async (request, response, next) => {
  const parsed = z.object({ quantity: z.number().int().min(1).max(99) }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Quantity must be an integer between 1 and 99."));

  try {
    const cart = await getCart(request.user.id);
    const item = cart.items.id(request.params.itemId);
    if (!item) return next(apiError(404, "Cart item not found."));
    item.quantity = parsed.data.quantity;
    await cart.save();
    return response.json(await cartResponse(cart));
  } catch (error) {
    return next(error);
  }
});

router.delete("/items/:itemId", async (request, response, next) => {
  try {
    const cart = await getCart(request.user.id);
    const item = cart.items.id(request.params.itemId);
    if (!item) return next(apiError(404, "Cart item not found."));
    item.deleteOne();
    await cart.save();
    return response.json(await cartResponse(cart));
  } catch (error) {
    return next(error);
  }
});

router.delete("/", async (request, response, next) => {
  try {
    const cart = await getCart(request.user.id);
    cart.items = [];
    cart.promoCode = null;
    await cart.save();
    return response.json(await cartResponse(cart));
  } catch (error) {
    return next(error);
  }
});

router.post("/promo", async (request, response, next) => {
  const parsed = z.object({ code: z.string().trim().min(1).max(40) }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Enter a valid promo code."));

  try {
    const cart = await getCart(request.user.id);
    cart.promoCode = parsed.data.code.toUpperCase();
    const result = await cartResponse(cart);
    if (!result.cart.promoCode) return next(apiError(400, "Promo code is invalid or does not meet the minimum order amount."));
    await cart.save();
    return response.json(result);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
