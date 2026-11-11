const crypto = require("crypto");
const { EmailOtp } = require("../models");
const { sendEmail, verificationCodeEmail } = require("./newsletter-email");

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function hashOtp(otp) {
  return crypto
    .createHash("sha256")
    .update(`${process.env.JWT_SECRET || "zayro"}:${otp}`)
    .digest("hex");
}

function otpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function sendEmailOtp(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await EmailOtp.findOne({ email: normalizedEmail });
  if (existing && Date.now() - existing.lastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw otpError(429, "Please wait 60 seconds before requesting another code.");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  await EmailOtp.findOneAndUpdate(
    { email: normalizedEmail },
    {
      $set: {
        codeHash: hashOtp(otp),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
        attempts: 0,
        lastSentAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  if (process.env.NODE_ENV !== "production") console.log(`Email OTP generated for ${normalizedEmail}`);
  try {
    await sendEmail({ to: normalizedEmail, ...verificationCodeEmail({ otp }) });
  } catch (error) {
    await EmailOtp.deleteOne({ email: normalizedEmail });
    throw error;
  }
}

async function verifyEmailOtp(email, otp) {
  const normalizedEmail = email.trim().toLowerCase();
  const record = await EmailOtp.findOne({ email: normalizedEmail });
  if (!record || record.expiresAt.getTime() <= Date.now()) {
    if (record) await EmailOtp.deleteOne({ _id: record._id });
    throw otpError(400, "That code has expired. Request a new code.");
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await EmailOtp.deleteOne({ _id: record._id });
    throw otpError(429, "Too many incorrect attempts. Request a new code.");
  }
  if (hashOtp(otp) !== record.codeHash) {
    record.attempts += 1;
    await record.save();
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await EmailOtp.deleteOne({ _id: record._id });
      throw otpError(429, "Too many incorrect attempts. Request a new code.");
    }
    throw otpError(400, "Incorrect verification code.");
  }
  await EmailOtp.deleteOne({ _id: record._id });
}

module.exports = { sendEmailOtp, verifyEmailOtp };
