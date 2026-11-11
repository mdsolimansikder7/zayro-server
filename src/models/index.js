const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false, select: false, default: null },
    authProvider: { type: String, enum: ["password", "google"], default: "password" },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: null },
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    addresses: {
      type: [
        new mongoose.Schema(
          {
            id: { type: String, required: true },
            label: { type: String, required: true, trim: true, maxlength: 40 },
            name: { type: String, required: true, trim: true, maxlength: 80 },
            phone: { type: String, required: true, trim: true, maxlength: 30 },
            addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
            addressLine2: { type: String, trim: true, maxlength: 200, default: "" },
            city: { type: String, required: true, trim: true, maxlength: 100 },
            postalCode: { type: String, required: true, trim: true, maxlength: 20 },
            country: { type: String, required: true, trim: true, maxlength: 100 },
            isDefault: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    wishlistSlugs: { type: [String], default: [] },
  },
  { timestamps: true },
);

const emailOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    attempts: { type: Number, required: true, min: 0, default: 0 },
    lastSentAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, trim: true },
    title: { type: String, required: true, trim: true },
    image: { type: String, required: true },
    images: { type: [String], default: [] },
    brand: { type: String, trim: true, default: "ZARA", index: true },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    oldPrice: { type: Number, min: 0, default: null },
    discount: { type: Number, min: 0, default: null },
    collectionName: { type: String, enum: ["new", "top", "detail", "related"], required: true },
    category: { type: String, required: true, index: true },
    styles: { type: [String], default: ["Casual"] },
    description: { type: String, required: true },
    price: { type: Number, min: 0, required: true },
    colors: { type: [String], default: [] },
    sizes: { type: [String], default: [] },
  },
  { timestamps: true },
);

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    quantity: { type: Number, min: 1, max: 99, required: true },
  },
  { _id: true },
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: { type: [cartItemSchema], default: [] },
    promoCode: { type: String, default: null },
  },
  { timestamps: true },
);

const addressSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true, default: "" },
    city: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    slug: { type: String, required: true },
    title: { type: String, required: true },
    image: { type: String, required: true },
    unitPrice: { type: Number, required: true },
    size: { type: String, required: true },
    color: { type: String, required: true },
    quantity: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    discountAmount: { type: Number, required: true },
    promoDiscount: { type: Number, required: true, default: 0 },
    deliveryFee: { type: Number, required: true },
    total: { type: Number, required: true },
    promoCode: { type: String, default: null },
    shippingAddress: { type: addressSchema, required: true },
    paymentMethod: { type: String, enum: ["cash_on_delivery"], default: "cash_on_delivery" },
    status: {
      type: String,
      enum: ["placed", "processing", "shipped", "delivered", "cancelled"],
      default: "placed",
    },
  },
  { timestamps: true },
);

const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    minimumSubtotal: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const subscriberSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    status: { type: String, enum: ["pending", "active", "unsubscribed"], default: "pending", index: true },
    source: { type: String, enum: ["footer", "popup", "checkout"], default: "footer" },
    unsubscribeToken: { type: String, unique: true, sparse: true, index: true },
    confirmToken: { type: String, unique: true, sparse: true, index: true },
    subscribedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date, default: null },
    unsubscribedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const newsletterUsageSchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true },
    count: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

const reviewSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);
reviewSchema.index({ product: 1, user: 1 }, { unique: true });

const storefrontSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    heroStats: {
      type: [{ value: { type: String, required: true }, label: { type: String, required: true } }],
      default: [],
    },
    brands: {
      type: [{ name: { type: String, required: true }, style: { type: String, default: "sans" } }],
      default: [],
    },
    navigation: {
      type: [{ label: { type: String, required: true }, href: { type: String, required: true } }],
      default: [],
    },
    faqs: {
      type: [{ question: { type: String, required: true }, answer: { type: String, required: true } }],
      default: [],
    },
    socialLinks: {
      type: [{ name: { type: String, required: true }, url: { type: String, required: true } }],
      default: [],
    },
    companyLinks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    helpLinks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    faqLinks: { type: [mongoose.Schema.Types.Mixed], default: [] },
    paymentMethods: { type: [String], default: ["bKash", "Nagad", "Rocket", "Visa", "Mastercard"] },
    brandDescription: { type: String, default: "" },
    copyrightText: { type: String, default: "" },
    hero: {
      title: { type: String, default: "" },
      description: { type: String, default: "" },
      ctaLabel: { type: String, default: "" },
      ctaUrl: { type: String, default: "" },
      image: { type: String, default: "" },
    },
    dressStyles: {
      type: [{
        name: { type: String, required: true },
        image: { type: String, required: true },
        span: { type: String, default: "" },
        flip: { type: Boolean, default: false },
      }],
      default: [],
    },
    announcement: {
      text: { type: String, default: "" },
      linkText: { type: String, default: "" },
      linkUrl: { type: String, default: "" },
    },
    shipping: {
      deliveryFee: { type: Number, default: 15 },
      freeOver: { type: Number, default: null },
      returnWindowDays: { type: Number, default: 7 },
      cityDeliveryDays: { type: String, default: "3-5 working days" },
      otherDeliveryDays: { type: String, default: "5-7 working days" },
    },
  },
  { timestamps: true },
);

module.exports = {
  Cart: mongoose.models.Cart || mongoose.model("Cart", cartSchema),
  EmailOtp: mongoose.models.EmailOtp || mongoose.model("EmailOtp", emailOtpSchema),
  Order: mongoose.models.Order || mongoose.model("Order", orderSchema),
  Product: mongoose.models.Product || mongoose.model("Product", productSchema),
  PromoCode: mongoose.models.PromoCode || mongoose.model("PromoCode", promoCodeSchema),
  NewsletterUsage: mongoose.models.NewsletterUsage || mongoose.model("NewsletterUsage", newsletterUsageSchema),
  Review: mongoose.models.Review || mongoose.model("Review", reviewSchema),
  Subscriber: mongoose.models.Subscriber || mongoose.model("Subscriber", subscriberSchema),
  Storefront: mongoose.models.Storefront || mongoose.model("Storefront", storefrontSchema),
  User: mongoose.models.User || mongoose.model("User", userSchema),
};
