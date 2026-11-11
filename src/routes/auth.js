const bcrypt = require("bcryptjs");
const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { User } = require("../models");
const { requireAuth } = require("../middleware/auth");
const { apiError } = require("../lib/errors");
const { sendEmailOtp, verifyEmailOtp } = require("../lib/email-otp");

const router = Router();
const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const otpSendLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const otpVerifyLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
const registrationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
});
const googleSchema = z.object({
  credential: z.string().min(1),
});
const otpSchema = z.object({
  email: z.string().trim().email().max(254),
  otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

function issueToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    emailVerified: user.emailVerified === true || user.authProvider === "google",
  };
}

function isConfiguredAdmin(email) {
  const adminEmail = (process.env.ADMIN_EMAIL || "mdsolimansikder07@gmail.com").trim().toLowerCase();
  return email.trim().toLowerCase() === adminEmail;
}

router.post("/register", authLimit, async (request, response, next) => {
  const parsed = registrationSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a name, valid email, and password (8+ characters, at most 72 UTF-8 bytes)."));

  try {
    const { name, email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      if (existing.emailVerified !== true && existing.authProvider !== "google") {
        await sendEmailOtp(normalizedEmail);
      }
      return response.status(202).json({
        message: "If this email can be verified, a verification code has been sent.",
        verificationRequired: existing.emailVerified !== true && existing.authProvider !== "google",
        email: normalizedEmail,
      });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role: isConfiguredAdmin(normalizedEmail) ? "admin" : "customer",
    });
    await sendEmailOtp(normalizedEmail);
    return response.status(202).json({
      message: "Check your email for a verification code.",
      verificationRequired: true,
      email: normalizedEmail,
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/login", authLimit, async (request, response, next) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide a valid email and password."));

  try {
    const user = await User.findOne({ email: parsed.data.email.toLowerCase() }).select("+passwordHash");
    if (!user || !user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      return next(apiError(401, "Invalid email or password."));
    }
    if (user.emailVerified !== true && user.authProvider !== "google") {
      try {
        await sendEmailOtp(user.email);
      } catch (error) {
        if (error.status !== 429) return next(error);
      }
      return response.status(403).json({
        error: "Email verification required.",
        verificationRequired: true,
        email: user.email,
      });
    }
    return response.json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/google", authLimit, async (request, response, next) => {
  const parsed = googleSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "A valid Google credential is required."));

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return next(apiError(503, "Google sign-in is not configured."));

  try {
    const googleResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(parsed.data.credential)}`,
    );
    const googleProfile = await googleResponse.json();
    if (
      !googleResponse.ok ||
      googleProfile.aud !== clientId ||
      !["accounts.google.com", "https://accounts.google.com"].includes(googleProfile.iss) ||
      googleProfile.email_verified !== "true" ||
      typeof googleProfile.email !== "string"
    ) {
      return next(apiError(401, "Google sign-in could not be verified."));
    }

    const email = googleProfile.email.toLowerCase();
    const name =
      typeof googleProfile.name === "string" && googleProfile.name.trim()
        ? googleProfile.name.trim().slice(0, 80)
        : email.split("@")[0].slice(0, 80);
    const image = typeof googleProfile.picture === "string" ? googleProfile.picture : null;
    let user = await User.findOne({ email }).select("+passwordHash");

    if (!user) {
      user = await User.create({
        name,
        email,
        image,
        authProvider: "google",
        emailVerified: true,
        role: isConfiguredAdmin(email) ? "admin" : "customer",
      });
    } else if (user.authProvider === "google" && (image && user.image !== image || user.emailVerified !== true)) {
      user.image = image || user.image;
      user.emailVerified = true;
      await user.save();
    }

    return response.json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/send-email-otp", otpSendLimit, async (request, response, next) => {
  const parsed = z.object({ email: z.string().trim().email().max(254) }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Enter a valid email address."));
  try {
    const email = parsed.data.email.toLowerCase();
    const user = await User.findOne({ email });
    if (!user || user.emailVerified === true || user.authProvider === "google") {
      return response.status(202).json({ message: "If verification is needed, a new code has been sent." });
    }
    await sendEmailOtp(email);
    return response.status(202).json({ message: "A new verification code has been sent." });
  } catch (error) {
    return next(error);
  }
});

router.post("/verify-email-otp", otpVerifyLimit, async (request, response, next) => {
  const parsed = otpSchema.safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Enter the 6-digit verification code."));
  try {
    const email = parsed.data.email.toLowerCase();
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || user.authProvider === "google") return next(apiError(400, "This verification request is invalid."));
    await verifyEmailOtp(email, parsed.data.otp);
    user.emailVerified = true;
    await user.save();
    return response.json({ user: publicUser(user), token: issueToken(user) });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, (request, response) => {
  response.json({ user: publicUser(request.user) });
});

router.patch("/me", requireAuth, async (request, response, next) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Name must be between 1 and 80 characters."));
  try {
    request.user.name = parsed.data.name;
    await request.user.save();
    return response.json({ user: publicUser(request.user) });
  } catch (error) {
    return next(error);
  }
});

router.post("/change-password", requireAuth, async (request, response, next) => {
  const parsed = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).refine((value) => Buffer.byteLength(value, "utf8") <= 72),
  }).safeParse(request.body);
  if (!parsed.success) return next(apiError(400, "Provide the current password and a valid new password."));

  try {
    const user = await User.findById(request.user.id).select("+passwordHash");
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return next(apiError(400, "Current password is incorrect."));
    }
    user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await user.save();
    return response.json({ message: "Password updated." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
