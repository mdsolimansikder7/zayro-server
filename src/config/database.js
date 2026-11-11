const mongoose = require("mongoose");
const crypto = require("crypto");
const { seedCatalog } = require("../data/seed");
const models = require("../models");
const { Product, Storefront, Subscriber, User } = models;

async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.DATABASE_NAME || "zayrodb",
  });
  await Promise.all(Object.values(models).map((model) => model.init()));
  const legacySubscribers = await Subscriber.find({
    $or: [{ status: { $exists: false } }, { unsubscribeToken: { $exists: false } }],
  });
  for (const subscriber of legacySubscribers) {
    if (!subscriber.status) {
      subscriber.status = "active";
      subscriber.confirmedAt = subscriber.confirmedAt || subscriber.createdAt || new Date();
    }
    if (!subscriber.unsubscribeToken) subscriber.unsubscribeToken = crypto.randomBytes(32).toString("hex");
    if (!subscriber.subscribedAt) subscriber.subscribedAt = subscriber.createdAt || new Date();
    await subscriber.save();
  }
  const legacyBrands = ["VERSACE", "ZARA", "GUCCI", "PRADA", "Calvin Klein"];
  const productsNeedingBrand = await Product.find({
    $or: [
      { brand: { $exists: false } },
      { brand: "" },
      { brand: { $nin: legacyBrands } },
    ],
  }).select("_id slug").sort({ slug: 1 }).lean();
  if (productsNeedingBrand.length) {
    await Product.bulkWrite(productsNeedingBrand.map((product, index) => {
      return {
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { brand: legacyBrands[index % legacyBrands.length] } },
        },
      };
    }));
  }
  await Storefront.updateOne(
    { key: "default" },
    {
      $set: {
        brands: legacyBrands.map((name) => ({
          name,
          style: name === "ZARA" ? "serif-bold" : name === "Calvin Klein" ? "sans" : "serif",
        })),
      },
    },
  );
  await seedCatalog();
  const adminEmail = (process.env.ADMIN_EMAIL || "mdsolimansikder07@gmail.com").trim().toLowerCase();
  await User.updateOne({ email: adminEmail }, { $set: { role: "admin" } });
  console.log("Connected to MongoDB");
}

module.exports = { connectDatabase };
