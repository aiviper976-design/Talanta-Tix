import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_MS = 5 * 24 * 60 * 60 * 1000;

function secret() {
  const value = process.env.ORDER_RESUME_SECRET || process.env.MANUS_JWT_SECRET;
  if (!value) throw new Error("Order resume signing secret is not configured.");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createOrderResumeToken(orderCode: string, expiresAt = Date.now() + TOKEN_TTL_MS) {
  const payload = `${orderCode}.${Math.floor(expiresAt / 1000)}`;
  return `${Buffer.from(payload).toString("base64url")}.${signature(payload)}`;
}

export function verifyOrderResumeToken(token: string) {
  const [encodedPayload, providedSignature] = token.split(".");
  if (!encodedPayload || !providedSignature) return null;
  try {
    const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
    const expectedSignature = signature(payload);
    const provided = Buffer.from(providedSignature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const separator = payload.lastIndexOf(".");
    const orderCode = payload.slice(0, separator);
    const expiresAt = Number(payload.slice(separator + 1)) * 1000;
    if (!orderCode || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return { orderCode, expiresAt };
  } catch {
    return null;
  }
}
