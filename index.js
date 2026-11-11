require("dotenv").config();

const app = require("./src/app");
const { connectDatabase } = require("./src/config/database");

async function start() {
  const port = Number(process.env.PORT || 4000);
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure it.");
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters.");
  }

  await connectDatabase();
  app.listen(port, () => {
    console.log(`Zayro API listening on port ${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Failed to start Zayro API:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { start };