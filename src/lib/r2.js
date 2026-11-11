const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const crypto = require("crypto");
const path = require("path");

let client;
const maxAttempts = 3;

function getR2Client() {
  if (client) return client;

  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.");
  }

  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return client;
}

function getR2Bucket() {
  const bucket = process.env.R2_BUCKET?.trim();
  if (!bucket) throw new Error("Cloudflare R2 is not configured. Set R2_BUCKET.");
  return bucket;
}

function getPublicUrl(key) {
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!publicUrl) throw new Error("Cloudflare R2 is not configured. Set R2_PUBLIC_URL.");
  return `${publicUrl}/${key}`;
}

async function uploadProductImage(file) {
  const extension = path.extname(file.originalname).toLowerCase() || ".jpg";
  const key = `products/${crypto.randomUUID()}${extension}`;
  return uploadR2Object(key, file.buffer, file.mimetype);
}

async function uploadR2Object(key, body, contentType = "application/octet-stream") {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await getR2Client().send(new PutObjectCommand({
        Bucket: getR2Bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }));
      return getPublicUrl(key);
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError;
}

module.exports = { uploadProductImage, uploadR2Object };
