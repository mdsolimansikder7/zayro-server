const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateTotals } = require("../src/lib/pricing");

test("cart totals match the storefront discount and delivery fee", async () => {
  const result = await calculateTotals(
    [
      { product: { price: 120 }, quantity: 2 },
      { product: { price: 80 }, quantity: 1 },
    ],
    null,
    { shipping: { deliveryFee: 15, freeOver: null } },
  );

  assert.deepEqual(result, {
    subtotal: 320,
    discountAmount: 64,
    promoDiscount: 0,
    deliveryFee: 15,
    total: 271,
    promoCode: null,
  });
});

test("empty carts have no delivery fee", async () => {
  const result = await calculateTotals([], null, { shipping: { deliveryFee: 15, freeOver: null } });
  assert.equal(result.subtotal, 0);
  assert.equal(result.deliveryFee, 0);
  assert.equal(result.total, 0);
});
