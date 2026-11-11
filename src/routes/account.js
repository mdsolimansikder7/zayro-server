const { Router } = require("express");
const multer = require("multer");
const path = require("path");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/errors");
const { Product, User } = require("../models");
const { uploadR2Object } = require("../lib/r2");

const router = Router();
const addressSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(30),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(1).max(20),
  country: z.string().trim().min(1).max(100).transform(() => "Bangladesh"),
  isDefault: z.boolean(),
});

router.use(requireAuth);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_request, file, callback) => {
    callback(null, file.mimetype.startsWith("image/"));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get("/", async (request, response, next) => {
  try {
    const user = await User.findById(request.user.id).select("addresses wishlistSlugs").lean();
    return response.json({ addresses: user.addresses ?? [], wishlistSlugs: user.wishlistSlugs ?? [] });
  } catch (error) {
    return next(error);
  }
});

router.post("/avatar", avatarUpload.single("avatar"), async (request, response, next) => {
  if (!request.file) return next(apiError(400, "Choose a valid image up to 5 MB."));

  try {
    const extension = path.extname(request.file.originalname).toLowerCase() || ".jpg";
    const imageUrl = await uploadR2Object(
      `avatars/${request.user.id}/profile-${Date.now()}${extension}`,
      request.file.buffer,
      request.file.mimetype,
    );
    request.user.image = imageUrl;
    await request.user.save();
    return response.json({ user: { id: request.user.id, image: imageUrl } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/", async (request, response, next) => {
  const schema = z.object({
    addresses: z.array(addressSchema).max(30).optional(),
    wishlistSlugs: z.array(z.string().regex(/^[a-z0-9-]{1,120}$/i)).max(100).optional(),
  }).refine((value) => Object.keys(value).length > 0, "Provide account data to update.");
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide valid address or wishlist data."));
  if (parsed.data.addresses?.filter((address) => address.isDefault).length > 1) {
    return next(apiError(400, "Only one address can be the default."));
  }

  try {
    const updates = {};
    if (parsed.data.addresses) updates.addresses = parsed.data.addresses;
    if (parsed.data.wishlistSlugs) {
      const uniqueSlugs = [...new Set(parsed.data.wishlistSlugs)];
      const products = await Product.find({ slug: { $in: uniqueSlugs } }).distinct("slug");
      if (products.length !== uniqueSlugs.length) {
        return next(apiError(400, "Wishlist contains an unknown product."));
      }
      updates.wishlistSlugs = uniqueSlugs;
    }

    const user = await User.findByIdAndUpdate(request.user.id, { $set: updates }, { new: true })
      .select("addresses wishlistSlugs")
      .lean();
    return response.json({ addresses: user.addresses, wishlistSlugs: user.wishlistSlugs });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
