function productForClient(product) {
  const result = typeof product.toObject === "function" ? product.toObject() : { ...product };
  result.collection = result.collectionName;
  delete result.collectionName;
  return result;
}

module.exports = { productForClient };
