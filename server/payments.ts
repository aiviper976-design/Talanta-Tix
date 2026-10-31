import { Router } from "express";
import { eq } from "drizzle-orm";
import { orders, type Order } from "../drizzle/schema";
import { getDb } from "./db";

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

export function normalizeKenyanPhone(input: string) {
  const digits = input.replace(/[\s()-]/g, "");
  if (/^07\d{8}$/.test(digits) || /^01\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  if (/^\+254[17]\d{8}$/.test(digits)) return digits.slice(1);
  return null;
}

function darajaConfig() {
  const isProduction = process.env.DARAJA_ENV === "production";
  return {
    baseUrl: isProduction ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke",
    consumerKey: process.env.DARAJA_CONSUMER_KEY,
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
    shortCode: process.env.DARAJA_SHORTCODE,
    passKey: process.env.DARAJA_PASSKEY,
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
  };
}

function assertDarajaConfig() {
  const config = darajaConfig();
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Daraja is not configured. Missing: ${missing.join(", ")}`);
  }
  return config as Required<typeof config>;
}

async function getAccessToken(config: Required<ReturnType<typeof darajaConfig>>) {
  const basic = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const response = await fetch(`${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  const body = await response.json() as { access_token?: string; errorMessage?: string };
  if (!response.ok || !body.access_token) throw new Error(body.errorMessage || "Unable to obtain a Daraja access token");
  return body.access_token;
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

function callbackMetadata(items: Array<{ Name: string; Value?: string | number }>) {
  return Object.fromEntries(items.map(item => [item.Name, item.Value]));
}

export const paymentsRouter = Router();

paymentsRouter.post("/orders/stk-push", async (req, res) => {
  try {
    const { buyerName, email, phone, category, quantity, amount } = req.body ?? {};
    const normalizedPhone = normalizeKenyanPhone(String(phone ?? ""));
    const safeQuantity = Number(quantity);
    const safeAmount = Number(amount);

    if (!buyerName || String(buyerName).trim().length < 2) return res.status(400).json({ error: "Enter the purchaser's full name." });
    if (!/^\S+@\S+\.\S+$/.test(String(email ?? ""))) return res.status(400).json({ error: "Enter a valid email address." });
    if (!normalizedPhone) return res.status(400).json({ error: "Enter a valid Kenyan M-Pesa number, such as 0712 345 678." });
    if (!category || !Number.isInteger(safeQuantity) || safeQuantity < 1 || safeQuantity > 10 || !Number.isInteger(safeAmount) || safeAmount < 1) {
      return res.status(400).json({ error: "Review the ticket selection and try again." });
    }

    const config = assertDarajaConfig();
    const order = await createOrder({ buyerName: String(buyerName).trim(), email: String(email).trim(), phone: normalizedPhone, category: String(category), quantity: safeQuantity, amount: safeAmount });
    const token = await getAccessToken(config);
    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    const password = Buffer.from(`${config.shortCode}${config.passKey}${timestamp}`).toString("base64");

    const response = await fetch(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: config.shortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: safeAmount,
        PartyA: normalizedPhone,
        PartyB: config.shortCode,
        PhoneNumber: normalizedPhone,
        CallBackURL: config.callbackUrl,
        AccountReference: order.orderCode,
        TransactionDesc: `Talanta Tix ${String(category).slice(0, 30)}`,
      }),
    });
    const body = await response.json() as { MerchantRequestID?: string; CheckoutRequestID?: string; ResponseCode?: string; ResponseDescription?: string; CustomerMessage?: string };
    if (!response.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) {
      await updateOrder(order.orderCode, { status: "failed", resultDescription: body.ResponseDescription || "STK Push was not accepted" });
      return res.status(502).json({ error: body.ResponseDescription || "M-Pesa could not start the payment prompt." });
    }

    await updateOrder(order.orderCode, { merchantRequestId: body.MerchantRequestID, checkoutRequestId: body.CheckoutRequestID });
    return res.json({ orderCode: order.orderCode, checkoutRequestId: body.CheckoutRequestID, status: "pending" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start payment.";
    console.error("[Daraja] STK Push error:", message);
    if (message.startsWith("Daraja is not configured")) return res.status(503).json({ error: "M-Pesa checkout is not configured yet. Add the protected Daraja settings before launch." });
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
    const orderCode = String(callback?.CallbackMetadata?.Item?.find?.((item: { Name: string }) => item.Name === "AccountReference")?.Value ?? req.body?.orderCode ?? "");
    const checkoutRequestId = callback?.CheckoutRequestID;
    const existing = checkoutRequestId ? await findOrderByCheckoutRequestId(checkoutRequestId) : undefined;
    const targetCode = existing?.orderCode || orderCode;
    if (targetCode) {
      const resultCode = Number(callback?.ResultCode);
      const items = Array.isArray(callback?.CallbackMetadata?.Item) ? callback.CallbackMetadata.Item : [];
      const metadata = callbackMetadata(items);
      await updateOrder(targetCode, {
        status: resultCode === 0 ? "paid" : resultCode === 1032 ? "cancelled" : "failed",
        resultCode,
        resultDescription: callback?.ResultDesc,
        mpesaReceiptNumber: metadata.MpesaReceiptNumber ? String(metadata.MpesaReceiptNumber) : undefined,
        checkoutRequestId,
      });
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
