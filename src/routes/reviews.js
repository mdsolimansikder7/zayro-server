const { Router } = require("express");
const mongoose = require("mongoose");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/errors");
const { Product, Review } = require("../models");

const router = Router({ mergeParams: true });

router.get("/latest", async (request, response, next) => {
  const parsed = z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) })
    .safeParse(request.query);
  if (!parsed.success) return next(apiError(400, "Invalid review limit."));

  try {
    const reviews = await Review.find()
      .populate("user", "name")
      .populate("product", "slug title")
      .sort({ createdAt: -1 })
      .limit(parsed.data.limit)
      .lean();
    return response.json({
      reviews: reviews.map(({ _id, user, product, rating, title, text, createdAt }) => ({
        id: _id,
        author: user.name,
        productTitle: product.title,
        productSlug: product.slug,
        rating,
        title,
        text,
        createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.productId)) {
    return next(apiError(400, "Invalid product id."));
  }
  const parsed = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(6),
    sort: z.enum(["latest", "highest", "lowest"]).default("latest"),
  }).safeParse(request.query);
  if (!parsed.success) return next(apiError(400, "Invalid review filters."));

  try {
    const productExists = await Product.exists({ _id: request.params.productId });
    if (!productExists) return next(apiError(404, "Product not found."));
    const { page, limit, sort } = parsed.data;
    const sortBy = sort === "highest" ? { rating: -1, createdAt: -1 } : sort === "lowest" ? { rating: 1, createdAt: -1 } : { createdAt: -1 };
    const [reviews, total, aggregate] = await Promise.all([
      Review.find({ product: request.params.productId })
        .populate("user", "name")
        .sort(sortBy)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Review.countDocuments({ product: request.params.productId }),
      Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(request.params.productId) } },
        { $group: { _id: null, average: { $avg: "$rating" } } },
      ]),
    ]);
    return response.json({
      reviews: reviews.map(({ _id, user, rating, title, text, createdAt }) => ({
        id: _id,
        author: user.name,
        rating,
        title,
        text,
        createdAt,
      })),
      rating: aggregate[0] ? Math.round(aggregate[0].average * 10) / 10 : 0,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireAuth, async (request, response, next) => {
  if (!mongoose.isValidObjectId(request.params.productId)) {
    return next(apiError(400, "Invalid product id."));
  }
  const parsed = z.object({
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().min(1).max(100),
    text: z.string().trim().min(1).max(2000),
  }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a rating, title, and review text."));

  try {
    const product = await Product.findById(request.params.productId);
    if (!product) return next(apiError(404, "Product not found."));
    const review = await Review.create({
      product: product.id,
      user: request.user.id,
      ...parsed.data,
    });
    const aggregate = await Review.aggregate([
      { $match: { product: product._id } },
      { $group: { _id: null, average: { $avg: "$rating" } } },
    ]);
    product.rating = aggregate[0] ? Math.round(aggregate[0].average * 10) / 10 : 0;
    await product.save();
    return response.status(201).json({
      review: {
        id: review.id,
        author: request.user.name,
        rating: review.rating,
        title: review.title,
        text: review.text,
        createdAt: review.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
