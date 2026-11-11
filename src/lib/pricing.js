const { PromoCode, Storefront } = require("../models");

const BASE_DISCOUNT_RATE = 0.2;

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function calculateTotals(items, promoCode, storefrontConfig, { isFirstOrder = true } = {}) {
  const storefront = storefrontConfig ?? await Storefront.findOne({ key: "default" }).select("shipping").lean();
  const deliveryFee = items.length > 0 ? storefront?.shipping?.deliveryFee ?? 15 : 0;
  const freeOver = storefront?.shipping?.freeOver;
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
  );
  const discountAmount = isFirstOrder ? roundMoney(subtotal * BASE_DISCOUNT_RATE) : 0;
  const discountedSubtotal = roundMoney(subtotal - discountAmount);
  let promoDiscount = 0;
  let promo = null;

  if (promoCode) {
    promo = await PromoCode.findOne({
      code: promoCode,
      active: true,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    });
    if (!promo || subtotal < promo.minimumSubtotal) {
      return { error: "Promo code is invalid or does not meet the minimum order amount." };
    }

    promoDiscount =
      promo.type === "percent"
        ? roundMoney((discountedSubtotal * promo.value) / 100)
        : roundMoney(Math.min(promo.value, discountedSubtotal));
  }

  const finalDeliveryFee = items.length > 0 && freeOver && discountedSubtotal >= freeOver ? 0 : deliveryFee;
  return {
    subtotal,
    discountAmount,
    promoDiscount,
    deliveryFee: finalDeliveryFee,
    total: Math.max(0, roundMoney(discountedSubtotal - promoDiscount + finalDeliveryFee)),
    promoCode: promo?.code || null,
  };
}

module.exports = { BASE_DISCOUNT_RATE, calculateTotals, roundMoney };
