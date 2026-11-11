const { Router } = require("express");
const { z } = require("zod");
const { Product } = require("../models");
const { apiError } = require("../lib/errors");
const { productForClient } = require("../lib/api-product");

const router = Router();

router.get("/", async (request, response, next) => {
  const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    category: z.string().trim().min(1).optional(),
    brand: z.string().trim().min(1).optional(),
    style: z.string().trim().min(1).optional(),
    collection: z.enum(["new", "top", "detail", "related"]).optional(),
    size: z.string().trim().min(1).optional(),
    color: z.string().trim().min(1).optional(),
    q: z.string().trim().max(100).optional(),
    sort: z.enum(["popular", "newest", "price_asc", "price_desc"]).default("popular"),
  }).safeParse(request.query);
  if (!querySchema.success) return next(apiError(400, "Invalid product filters."));

  const { page, limit, minPrice, maxPrice, category, brand, style, collection, size, color, q, sort } = querySchema.data;
  const filter = {};
  if (category) filter.category = new RegExp(`^${category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (category?.toLowerCase() === "casual") {
    delete filter.category;
    filter.styles = /^casual$/i;
  }
  if (brand) filter.brand = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (style) filter.styles = new RegExp(`^${style.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (collection) filter.collectionName = collection;
  if (size) filter.sizes = size;
  if (color) filter.colors = color;
  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ title: new RegExp(escaped, "i") }, { description: new RegExp(escaped, "i") }];
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined) filter.price.$gte = minPrice;
    if (maxPrice !== undefined) filter.price.$lte = maxPrice;
  }

  const sortBy = {
    popular: { rating: -1, createdAt: -1 },
    newest: { createdAt: -1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
  }[sort];

  try {
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortBy).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
    return response.json({
      products: products.map(productForClient),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/categories", async (_request, response, next) => {
  try {
    const categories = await Product.distinct("category");
    return response.json({ categories: categories.sort() });
  } catch (error) {
    return next(error);
  }
});

router.get("/filters", async (_request, response, next) => {
  try {
    const [categories, sizes, colors, styles, priceRange] = await Promise.all([
      Product.distinct("category"),
      Product.distinct("sizes"),
      Product.distinct("colors"),
      Product.distinct("styles"),
      Product.aggregate([
        { $group: { _id: null, minPrice: { $min: "$price" }, maxPrice: { $max: "$price" } } },
      ]),
    ]);
    const range = priceRange[0] ?? { minPrice: 0, maxPrice: 300 };
    return response.json({
      categories: categories.sort(),
      sizes: sizes.sort(),
      colors: colors.sort(),
      styles: styles.sort(),
      minPrice: range.minPrice,
      maxPrice: range.maxPrice,
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:slug", async (request, response, next) => {
  try {
    const product = await Product.findOne({ slug: request.params.slug }).lean();
    if (!product) return next(apiError(404, "Product not found."));
    return response.json({ product: productForClient(product) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
