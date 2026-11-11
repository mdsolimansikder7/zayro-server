const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { apiError } = require("../lib/errors");

async function requireAuth(request, _response, next) {
  const authorization = request.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return next(Object.assign(new Error("Authentication required."), { status: 401 }));

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(Object.assign(new Error("Invalid or expired token."), { status: 401 }));
  }

  const user = await User.findById(payload.sub).select("_id name email image role emailVerified authProvider");
  if (!user) return next(Object.assign(new Error("Authentication required."), { status: 401 }));
  if (user.emailVerified !== true && user.authProvider !== "google") {
    return next(Object.assign(new Error("Email verification required."), { status: 403 }));
  }
  request.user = user;
  return next();
}

function requireAdmin(request, _response, next) {
  const adminEmail = (process.env.ADMIN_EMAIL || "mdsolimansikder07@gmail.com")
    .trim()
    .toLowerCase();
  const userEmail = request.user?.email?.trim().toLowerCase();

  if (request.user?.role !== "admin" || userEmail !== adminEmail) {
    return next(apiError(403, "Admin access required."));
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
