const nodemailer = require("nodemailer");

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CLIENT_ORIGIN || "http://localhost:3000").replace(/\/+$/, "");
const API_URL = (process.env.API_URL || "http://localhost:4000").replace(/\/+$/, "");
let transporter;

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    throw Object.assign(new Error("Email delivery is not configured."), { status: 503 });
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text, headers = {} }) {
  if (!to) throw Object.assign(new Error("Email recipient is required."), { status: 400 });
  return getTransporter().sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject,
    html,
    text,
    headers,
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function layout({ title, preheader, content, unsubscribeUrl }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f4f4f0;color:#171717;font-family:Arial,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
  <div style="padding:32px 16px">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden">
      <div style="padding:28px 32px;background:#171717;color:#fff;font-size:24px;font-weight:800;letter-spacing:3px">ZAYRO</div>
      <div style="padding:32px">${content}</div>
      <div style="padding:20px 32px;background:#f4f4f0;color:#6b6b6b;font-size:12px;line-height:1.6">
        You are receiving this because you subscribed to Zayro.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#171717">Unsubscribe</a>
      </div>
    </div>
  </div>
</body></html>`;
}

function confirmationEmail({ email, confirmUrl }) {
  const unsubscribeUrl = `${FRONTEND_URL}/unsubscribe?token=`;
  const content = `<h1 style="margin:0 0 16px;font-size:30px">Confirm your subscription</h1>
    <p style="font-size:16px;line-height:1.6;color:#555">Click below to confirm your Zayro newsletter subscription and receive new drops, style edits, and subscriber-only offers.</p>
    <p style="margin:28px 0"><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:14px 22px;background:#171717;color:#fff;text-decoration:none;border-radius:999px;font-weight:700">Confirm subscription</a></p>
    <p style="font-size:12px;color:#777">This link was requested for ${escapeHtml(email)}.</p>`;
  return {
    subject: "Confirm your Zayro newsletter subscription",
    html: layout({ title: "Confirm your subscription", preheader: "Confirm your Zayro newsletter subscription.", content, unsubscribeUrl }),
    text: `Confirm your Zayro newsletter subscription: ${confirmUrl}`,
  };
}

function welcomeEmail({ unsubscribeUrl, promoCode }) {
  const offer = promoCode
    ? `<p style="padding:18px;background:#f4f4f0;border-radius:12px"><strong>Your welcome code: ${escapeHtml(promoCode)}</strong><br>Use it at checkout on your first order.</p>`
    : "";
  const content = `<h1 style="margin:0 0 16px;font-size:30px">Welcome to Zayro</h1>
    <p style="font-size:16px;line-height:1.6;color:#555">You are officially on the list. We will keep your inbox filled with the best of Zayro, not noise.</p>
    ${offer}
    <p style="margin-top:28px"><a href="${escapeHtml(FRONTEND_URL)}" style="display:inline-block;padding:14px 22px;background:#171717;color:#fff;text-decoration:none;border-radius:999px;font-weight:700">Shop Zayro</a></p>`;
  return {
    subject: "Welcome to Zayro",
    html: layout({ title: "Welcome to Zayro", preheader: "Welcome to the Zayro edit.", content, unsubscribeUrl }),
    text: `Welcome to Zayro.${promoCode ? ` Your welcome code is ${promoCode}.` : ""} Shop: ${FRONTEND_URL}`,
  };
}

function campaignEmail({ subject, body, unsubscribeUrl }) {
  const content = `<h1 style="margin:0 0 16px;font-size:30px">${escapeHtml(subject)}</h1>
    <div style="font-size:16px;line-height:1.7;color:#555;white-space:pre-line">${escapeHtml(body)}</div>
    <p style="margin-top:28px"><a href="${escapeHtml(FRONTEND_URL)}" style="display:inline-block;padding:14px 22px;background:#171717;color:#fff;text-decoration:none;border-radius:999px;font-weight:700">Shop Zayro</a></p>`;
  return {
    html: layout({ title: subject, preheader: body.slice(0, 120), content, unsubscribeUrl }),
    text: `${body}\n\nShop Zayro: ${FRONTEND_URL}\nUnsubscribe: ${unsubscribeUrl}`,
  };
}

function verificationCodeEmail({ otp }) {
  const content = `<h1 style="margin:0 0 16px;font-size:30px">Verify your email</h1>
    <p style="font-size:16px;line-height:1.6;color:#555">Your Zayro verification code is:</p>
    <p style="margin:24px 0;font-size:38px;letter-spacing:10px;font-weight:800">${escapeHtml(otp)}</p>
    <p style="font-size:14px;line-height:1.6;color:#777">It expires in 5 minutes. If you did not request this code, you can safely ignore this email.</p>`;
  return {
    subject: "Your Zayro verification code",
    html: layout({
      title: "Verify your email",
      preheader: "Your Zayro verification code expires in 5 minutes.",
      content,
      unsubscribeUrl: FRONTEND_URL,
    }),
    text: `Your Zayro verification code is ${otp}. It expires in 5 minutes. If you did not request this, ignore this email.`,
  };
}

module.exports = {
  API_URL,
  FRONTEND_URL,
  campaignEmail,
  confirmationEmail,
  sendEmail,
  verificationCodeEmail,
  welcomeEmail,
};
