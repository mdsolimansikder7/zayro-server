const test = require("node:test");
const assert = require("node:assert/strict");
const { productForClient } = require("../src/lib/api-product");

test("product responses use the storefront's collection field", () => {
  const result = productForClient({
    slug: "demo-shirt",
    collectionName: "new",
    title: "Demo Shirt",
  });

  assert.equal(result.collection, "new");
  assert.equal("collectionName" in result, false);
});
