const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const path = require("path");
const { rateLimit } = require("express-rate-limit");
const authRoutes = require("./routes/auth");
const accountRoutes = require("./routes/account");
const adminRoutes = require("./routes/admin");
const cartRoutes = require("./routes/cart");
const newsletterRoutes = require("./routes/newsletter");
const orderRoutes = require("./routes/orders");
const productRoutes = require("./routes/products");
const reviewRoutes = require("./routes/reviews");
const storefrontRoutes = require("./routes/storefront");

const app = express();
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS."));
    },
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "zayro-api" });
});
app.use("/api/auth", authRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/newsletter", newsletterRoutes);
app.use("/api/storefront", storefrontRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/products/:productId/reviews", reviewRoutes);

app.use((_request, response) => {
  response.status(404).json({ error: "Route not found." });
});

app.use((error, _request, response, _next) => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return response.status(413).json({ error: "Image files must be 5 MB or smaller." });
  }
  if (error.code === 11000) {
    return response.status(409).json({ error: "A record with that value already exists." });
  }
  if (error.name === "ValidationError" || error.name === "CastError") {
    return response.status(400).json({ error: "Invalid request data." });
  }
  if (error.code === "EAUTH" || error.code === "ECONNECTION" || error.code === "ETIMEDOUT") {
    return response.status(503).json({ error: "Newsletter email delivery is temporarily unavailable. Please try again later." });
  }
  if (error.message === "Origin is not allowed by CORS.") {
    return response.status(403).json({ error: error.message });
  }

  if (!error.status || error.status >= 500) console.error(error);
  return response.status(error.status || 500).json({
    error: error.status ? error.message : "Internal server error.",
  });
});

module.exports = app;
