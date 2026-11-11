const { Router } = require("express");
const { Storefront } = require("../models");

const router = Router();

router.get("/", async (_request, response, next) => {
  try {
    const config = await Storefront.findOne({ key: "default" }).lean();
    if (!config) {
      return response.status(503).json({ error: "Storefront content has not been initialized." });
    }

    const { _id, key, __v, createdAt, updatedAt, ...content } = config;
    if (
      !Array.isArray(content.paymentMethods) ||
      content.paymentMethods.length === 0 ||
      (content.paymentMethods.length === 1 && content.paymentMethods[0].toLowerCase() === "cash on delivery")
    ) {
      content.paymentMethods = ["bKash", "Nagad", "Rocket", "Visa", "Mastercard"];
    }
    return response.json({ storefront: content });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
