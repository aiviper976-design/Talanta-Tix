import { Router } from "express";
import { eq } from "drizzle-orm";
import { orders, type Order } from "../drizzle/schema";
import { getDb } from "./db";
import {
  darajaPaymentAdapter,
  normalizePhone,
  type DarajaCallbackResult,
} from "./lib/daraja";
import { notifyPurchaseAttempt } from "./purchaseNotifications";

export type TicketOrderStatus = "pending" | "paid" | "cancelled" | "failed" | "expired";

export type NewTicketOrder = {
  buyerName: string;
  email: string;
  phone: string;
  category: string;
  quantity: number;
  amount: number;
};

const memoryOrders = new Map<string, Order>();

function makeOrderCode() {
  const stamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `TT-${stamp}-${random}`;
}

export const normalizeKenyanPhone = normalizePhone;

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

export const paymentsRouter = Router();

paymentsRouter.post("/orders/stk-push", async (req, res) => {
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

    if (!buyerName || String(buyerName).trim().length < 2) return res.status(400).json({ error: "Enter the purchaser's full name." });
    if (!/^\S+@\S+\.\S+$/.test(String(email ?? ""))) return res.status(400).json({ error: "Enter a valid email address." });
    if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid Kenyan M-Pesa number, such as 712 345 678, 0712 345 678, 112 345 678, 0112 345 678, or +254 712 345 678." });
    if (!category || !Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 10 || !Number.isInteger(safeAmount) || safeAmount < 1) {
      return res.status(400).json({ error: "Review the ticket selection and try again." });
    }

    const order = await createOrder({ buyerName: String(buyerName).trim(), email: String(email).trim(), phone: normalizedPhone, category: String(category), quantity: safeQuantity, amount: safeAmount });
    void notifyPurchaseAttempt({
      orderCode: order.orderCode,
      buyerName: order.buyerName,
      buyerEmail: order.email,
      phoneNumber: order.phone,
      category: order.category,
      quantity: order.quantity,
      amountKsh: order.amount,
    }).then(result => {
      if (!result.sent) console.info("[Notifications] Purchase email is not configured.");
    }).catch(error => {
      console.warn("[Notifications] Purchase email failed:", error instanceof Error ? error.message : "unknown error");
    });
    const result = await darajaPaymentAdapter.initiate({
      phoneNumber: normalizedPhone,
      amountMinor: safeAmount * 100,
      currency: "KES",
      idempotencyKey: order.orderCode,
    });
    if (result.status === "disabled") {
      await updateOrder(order.orderCode, { status: "failed", resultDescription: result.message });
      return res.status(503).json({ error: "M-Pesa checkout is not configured yet. Add the protected Daraja settings before launch." });
    }

    await updateOrder(order.orderCode, { merchantRequestId: result.providerRequestId, checkoutRequestId: result.checkoutRequestId });
    return res.json({ orderCode: order.orderCode, checkoutRequestId: result.checkoutRequestId, status: "pending" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start payment.";
    console.error("[Daraja] STK Push error:", message);
    if (message.startsWith("Daraja OAuth") || message.startsWith("Daraja STK Push")) return res.status(502).json({ error: message });
    if (message.includes("Daraja payments require") || message.includes("Daraja amount")) return res.status(400).json({ error: message });
    return res.status(502).json({ error: "We could not start the M-Pesa prompt. Please try again." });
  }
});

paymentsRouter.get("/orders/:orderCode", async (req, res) => {
  const order = await findOrder(req.params.orderCode);
  if (!order) return res.status(404).json({ error: "Order not found." });
  return res.json({ orderCode: order.orderCode, status: order.status, amount: order.amount, category: order.category, quantity: order.quantity, receipt: order.mpesaReceiptNumber ?? null, ticketCode: order.status === "paid" ? `ENTRY-${order.orderCode.replace("TT-", "")}` : null });
});

paymentsRouter.post("/daraja/callback", async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    const merchantRequestId = typeof callback?.MerchantRequestID === "string" ? callback.MerchantRequestID : "";
    const checkoutRequestId = typeof callback?.CheckoutRequestID === "string" ? callback.CheckoutRequestID : "";
    const accountReference = String(callback?.CallbackMetadata?.Item?.find?.((item: { Name: string }) => item.Name === "AccountReference")?.Value ?? req.body?.orderCode ?? "");
    const existing = (checkoutRequestId ? await findOrderByCheckoutRequestId(checkoutRequestId) : undefined) ??
      (merchantRequestId ? await findOrderByMerchantRequestId(merchantRequestId) : undefined) ??
      (accountReference ? await findOrder(accountReference) : undefined);

    if (existing && merchantRequestId) {
      const result: DarajaCallbackResult = darajaPaymentAdapter.reconcileCallback(req.body, {
        providerRequestId: merchantRequestId,
        amountMinor: existing.amount * 100,
        currency: "KES",
        phoneNumber: existing.phone,
      });
      if (result.accepted) {
        await updateOrder(existing.orderCode, {
          status: result.status === "paid" ? "paid" : Number(callback?.ResultCode) === 1032 ? "cancelled" : "failed",
          resultCode: typeof callback?.ResultCode === "number" ? callback.ResultCode : Number(callback?.ResultCode),
          resultDescription: typeof callback?.ResultDesc === "string" ? callback.ResultDesc : undefined,
          mpesaReceiptNumber: result.providerTransactionId,
          checkoutRequestId: checkoutRequestId || existing.checkoutRequestId,
        });
      } else {
        console.warn("[Daraja] Callback reconciliation rejected", { orderCode: existing.orderCode, reason: result.reason });
      }
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
