import type { Request } from "express";
import { and, eq, lt } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { Router } from "express";
import { orders, type Order } from "../drizzle/schema";
import { getDb } from "./db";
import {
  darajaPaymentAdapter,
  normalizePhone,
  type DarajaCallbackResult,
} from "./lib/daraja";
import { notifyPaymentStatus, notifyPurchaseAttempt } from "./purchaseNotifications";

export type TicketOrderStatus = "pending" | "paid" | "cancelled" | "failed" | "expired";

export type NewTicketOrder = {
  buyerName: string;
  email: string;
  phone: string;
  category: string;
  quantity: number;
  amount: number;
  idempotencyKey: string;
};

const memoryOrders = new Map<string, Order>();
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const ORDER_TTL_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;

function makeOrderCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TT-${stamp}-${random}`;
}

function makeTicketToken() {
  return randomBytes(32).toString("base64url");
}

function ticketCodeFor(order: Pick<Order, "orderCode" | "ticketToken">) {
  return `ENTRY-${(order.ticketToken || order.orderCode).slice(0, 10).toUpperCase()}`;
}

function getClientIp(req: Request) {
  const forwarded = req.get("x-forwarded-for");
  return (forwarded?.split(",")[0] || req.ip || "unknown").trim();
}

function rateLimitRetryAfter(key: string, now = Date.now()) {
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return 0;
  }
  if (bucket.count >= RATE_LIMIT) return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  bucket.count += 1;
  return 0;
}

function getRateLimitRetryAfter(req: Request, phone: string) {
  return Math.max(rateLimitRetryAfter(`ip:${getClientIp(req)}`), rateLimitRetryAfter(`phone:${phone}`));
}

function notifyStatus(order: Order, status: "stk_initiated" | "paid" | "cancelled" | "failed" | "expired", extra: Partial<Parameters<typeof notifyPaymentStatus>[0]> = {}) {
  void notifyPaymentStatus({
    orderCode: order.orderCode,
    buyerName: order.buyerName,
    buyerEmail: order.email,
    phoneNumber: order.phone,
    category: order.category,
    quantity: order.quantity,
    amountKsh: order.amount,
    status,
    providerRequestId: order.merchantRequestId,
    checkoutRequestId: order.checkoutRequestId,
    receipt: order.mpesaReceiptNumber,
    resultCode: order.resultCode,
    resultDescription: order.resultDescription,
    ticketCode: order.status === "paid" ? ticketCodeFor(order) : null,
    ...extra,
  }).catch(error => console.warn("[Notifications] Payment status notification failed:", error instanceof Error ? error.message : "unknown error"));
}

async function createOrder(input: NewTicketOrder): Promise<Order> {
  const orderCode = makeOrderCode();
  const now = new Date();
  const order = {
    orderCode,
    buyerName: input.buyerName,
    email: input.email,
    phone: input.phone,
    category: input.category,
    quantity: input.quantity,
    amount: input.amount,
    status: "pending" as const,
    idempotencyKey: input.idempotencyKey,
    ticketToken: makeTicketToken(),
    expiresAt: new Date(now.getTime() + ORDER_TTL_MS),
    createdAt: now,
    updatedAt: now,
  } satisfies Partial<Order>;

  const db = await getDb();
  if (db) {
    const result = await db.insert(orders).values(order as typeof orders.$inferInsert);
    const inserted = await db.select().from(orders).where(eq(orders.orderCode, orderCode)).limit(1);
    if (inserted[0]) return inserted[0];
    return { ...order, id: Number(result[0].insertId) } as Order;
  }

  const fallback = { ...order, id: memoryOrders.size + 1 } as Order;
  memoryOrders.set(orderCode, fallback);
  return fallback;
}

export async function findOrder(orderCode: string) {
  const db = await getDb();
  if (db) {
    const result = await db.select().from(orders).where(eq(orders.orderCode, orderCode)).limit(1);
    return result[0];
  }
  return memoryOrders.get(orderCode);
}

async function findOrderByIdempotencyKey(idempotencyKey: string) {
  const db = await getDb();
  if (db) {
    const result = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).limit(1);
    return result[0];
  }
  return Array.from(memoryOrders.values()).find(order => order.idempotencyKey === idempotencyKey);
}

async function findOrderByTicketToken(ticketToken: string) {
  const db = await getDb();
  if (db) {
    const result = await db.select().from(orders).where(eq(orders.ticketToken, ticketToken)).limit(1);
    return result[0];
  }
  return Array.from(memoryOrders.values()).find(order => order.ticketToken === ticketToken);
}

async function updateOrder(orderCode: string, patch: Partial<Order>) {
  const db = await getDb();
  if (db) {
    await db.update(orders).set({ ...patch, updatedAt: new Date() }).where(eq(orders.orderCode, orderCode));
    return findOrder(orderCode);
  }
  const current = memoryOrders.get(orderCode);
  if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: new Date() } as Order;
  memoryOrders.set(orderCode, next);
  return next;
}

async function expirePendingOrders() {
  const now = new Date();
  const db = await getDb();
  if (db) {
    const expired = await db.select().from(orders).where(and(eq(orders.status, "pending"), lt(orders.expiresAt, now)));
    if (expired.length) {
      await db.update(orders).set({ status: "expired", resultDescription: "Payment window expired.", updatedAt: now }).where(and(eq(orders.status, "pending"), lt(orders.expiresAt, now)));
      expired.forEach(order => notifyStatus({ ...order, status: "expired" }, "expired"));
    }
    return;
  }
  for (const order of memoryOrders.values()) {
    if (order.status === "pending" && order.expiresAt && order.expiresAt <= now) {
      const expired = await updateOrder(order.orderCode, { status: "expired", resultDescription: "Payment window expired." });
      if (expired) notifyStatus(expired, "expired");
    }
  }
}

const expiryTimer = setInterval(() => {
  void expirePendingOrders().catch(error => console.warn("[Orders] Expiry sweep failed:", error instanceof Error ? error.message : "unknown error"));
}, 60_000);
expiryTimer.unref?.();

async function expireIfNeeded(order: Order) {
  if (order.status === "pending" && order.expiresAt && order.expiresAt <= new Date()) {
    const expired = await updateOrder(order.orderCode, { status: "expired", resultDescription: "Payment window expired." });
    if (expired) notifyStatus(expired, "expired");
    return expired || { ...order, status: "expired" as const };
  }
  return order;
}

export const normalizeKenyanPhone = normalizePhone;
export const paymentsRouter = Router();

paymentsRouter.post("/orders/stk-push", async (req, res) => {
  let createdOrder: Order | undefined;
  try {
    const { buyerName, email, phone, category, quantity, amount } = req.body ?? {};
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(String(phone ?? ""));
    } catch {
      return res.status(400).json({ error: "Enter a valid Kenyan M-Pesa number, such as 712 345 678, 0712 345 678, 112 345 678, 0112 345 678, or +254 712 345 678." });
    }
    const safeQuantity = Number(quantity);
    const safeAmount = Number(amount);
    const idempotencyKey = String(req.body?.idempotencyKey ?? "").trim();

    if (!buyerName || String(buyerName).trim().length < 2) return res.status(400).json({ error: "Enter the purchaser's full name." });
    if (!/^\S+@\S+\.\S+$/.test(String(email ?? ""))) return res.status(400).json({ error: "Enter a valid email address." });
    if (!category || !Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 10 || !Number.isInteger(safeAmount) || safeAmount < 1) {
      return res.status(400).json({ error: "Review the ticket selection and try again." });
    }
    if (!/^[A-Za-z0-9_-]{16,96}$/.test(idempotencyKey)) return res.status(400).json({ error: "Refresh the checkout and try again." });

    const retryAfter = getRateLimitRetryAfter(req, normalizedPhone);
    if (retryAfter) {
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Too many checkout attempts. Please wait a few minutes before trying again." });
    }

    const existing = await findOrderByIdempotencyKey(idempotencyKey);
    if (existing) {
      const current = await expireIfNeeded(existing);
      if (current.status === "pending" || current.status === "paid") {
        return res.json({ orderCode: current.orderCode, checkoutRequestId: current.checkoutRequestId, status: current.status, ticketCode: current.status === "paid" ? ticketCodeFor(current) : null, ticketToken: current.status === "paid" ? current.ticketToken : null });
      }
      return res.status(409).json({ error: "This checkout attempt has already ended. Start a new payment attempt." });
    }

    createdOrder = await createOrder({ buyerName: String(buyerName).trim(), email: String(email).trim(), phone: normalizedPhone, category: String(category), quantity: safeQuantity, amount: safeAmount, idempotencyKey });
    void notifyPurchaseAttempt({
      orderCode: createdOrder.orderCode,
      buyerName: createdOrder.buyerName,
      buyerEmail: createdOrder.email,
      phoneNumber: createdOrder.phone,
      category: createdOrder.category,
      quantity: createdOrder.quantity,
      amountKsh: createdOrder.amount,
    }).catch(error => console.warn("[Notifications] Purchase attempt notification failed:", error instanceof Error ? error.message : "unknown error"));

    const result = await darajaPaymentAdapter.initiate({ phoneNumber: normalizedPhone, amountMinor: safeAmount * 100, currency: "KES", idempotencyKey: createdOrder.orderCode });
    if (result.status === "disabled") {
      const failed = await updateOrder(createdOrder.orderCode, { status: "failed", resultDescription: result.message });
      if (failed) notifyStatus(failed, "failed");
      return res.status(503).json({ error: "M-Pesa checkout is not configured yet. Add the protected Daraja settings before launch." });
    }

    const initiated = await updateOrder(createdOrder.orderCode, { merchantRequestId: result.providerRequestId, checkoutRequestId: result.checkoutRequestId });
    if (initiated) notifyStatus(initiated, "stk_initiated");
    return res.json({ orderCode: createdOrder.orderCode, checkoutRequestId: result.checkoutRequestId, status: "pending", expiresAt: initiated?.expiresAt ?? createdOrder.expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start payment.";
    console.error("[Daraja] STK Push error:", message);
    if (createdOrder) {
      const failed = await updateOrder(createdOrder.orderCode, { status: "failed", resultDescription: message });
      if (failed) notifyStatus(failed, "failed", { resultDescription: message });
    }
    if (message.startsWith("Daraja OAuth") || message.startsWith("Daraja STK Push")) return res.status(502).json({ error: message });
    if (message.includes("Daraja payments require") || message.includes("Daraja amount")) return res.status(400).json({ error: message });
    return res.status(502).json({ error: "We could not start the M-Pesa prompt. Please try again." });
  }
});

paymentsRouter.get("/orders/:orderCode", async (req, res) => {
  const found = await findOrder(req.params.orderCode);
  if (!found) return res.status(404).json({ error: "Order not found." });
  const order = await expireIfNeeded(found);
  return res.json({
    orderCode: order.orderCode,
    status: order.status,
    amount: order.amount,
    category: order.category,
    quantity: order.quantity,
    receipt: order.mpesaReceiptNumber ?? null,
    paidAt: order.paidAt ?? null,
    expiresAt: order.expiresAt ?? null,
    ticketCode: order.status === "paid" ? ticketCodeFor(order) : null,
    ticketToken: order.status === "paid" ? order.ticketToken : null,
  });
});

paymentsRouter.get("/tickets/:ticketToken", async (req, res) => {
  const order = await findOrderByTicketToken(req.params.ticketToken);
  if (!order || order.status !== "paid") return res.status(404).json({ error: "Verified ticket not found." });
  return res.json({
    valid: true,
    event: "FC Bayern Munich vs AFC Ajax",
    venue: "Raila Odinga International Stadium at Talanta Sports City, Nairobi",
    date: "5 January 2027",
    orderCode: order.orderCode,
    ticketCode: ticketCodeFor(order),
    category: order.category,
    quantity: order.quantity,
    amount: order.amount,
    receipt: order.mpesaReceiptNumber,
    paidAt: order.paidAt,
  });
});

paymentsRouter.post("/daraja/callback", async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    const merchantRequestId = typeof callback?.MerchantRequestID === "string" ? callback.MerchantRequestID : "";
    const checkoutRequestId = typeof callback?.CheckoutRequestID === "string" ? callback.CheckoutRequestID : "";
    const accountReference = String(callback?.CallbackMetadata?.Item?.find?.((item: { Name: string }) => item.Name === "AccountReference")?.Value ?? req.body?.orderCode ?? "");
    const located = (checkoutRequestId ? await findOrderByCheckoutRequestId(checkoutRequestId) : undefined) ??
      (merchantRequestId ? await findOrderByMerchantRequestId(merchantRequestId) : undefined) ??
      (accountReference ? await findOrder(accountReference) : undefined);
    if (!located || !merchantRequestId) return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const existing = await expireIfNeeded(located);
    if (existing.status === "expired") return res.json({ ResultCode: 0, ResultDesc: "Accepted" });

    const result: DarajaCallbackResult = darajaPaymentAdapter.reconcileCallback(req.body, {
      providerRequestId: merchantRequestId,
      amountMinor: existing.amount * 100,
      currency: "KES",
      phoneNumber: existing.phone,
    });
    if (result.accepted) {
      const nextStatus = result.status === "paid" ? "paid" : Number(callback?.ResultCode) === 1032 ? "cancelled" : "failed";
      const updated = await updateOrder(existing.orderCode, {
        status: nextStatus,
        paidAt: nextStatus === "paid" ? new Date() : existing.paidAt,
        resultCode: typeof callback?.ResultCode === "number" ? callback.ResultCode : Number(callback?.ResultCode),
        resultDescription: typeof callback?.ResultDesc === "string" ? callback.ResultDesc : undefined,
        mpesaReceiptNumber: result.providerTransactionId,
        checkoutRequestId: checkoutRequestId || existing.checkoutRequestId,
      });
      if (updated && existing.status !== nextStatus) notifyStatus(updated, nextStatus, { resultCode: updated.resultCode, resultDescription: updated.resultDescription });
    } else {
      notifyStatus(existing, "failed", { resultDescription: result.reason });
      console.warn("[Daraja] Callback reconciliation rejected", { orderCode: existing.orderCode, reason: result.reason });
    }
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("[Daraja] Callback error:", error);
    return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});

async function findOrderByCheckoutRequestId(checkoutRequestId: string) {
  const db = await getDb();
  if (db) {
    const result = await db.select().from(orders).where(eq(orders.checkoutRequestId, checkoutRequestId)).limit(1);
    return result[0];
  }
  return Array.from(memoryOrders.values()).find(order => order.checkoutRequestId === checkoutRequestId);
}

async function findOrderByMerchantRequestId(merchantRequestId: string) {
  const db = await getDb();
  if (db) {
    const result = await db.select().from(orders).where(eq(orders.merchantRequestId, merchantRequestId)).limit(1);
    return result[0];
  }
  return Array.from(memoryOrders.values()).find(order => order.merchantRequestId === merchantRequestId);
}

export function newIdempotencyKey() {
  return randomUUID();
}
