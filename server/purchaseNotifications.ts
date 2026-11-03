import { notifyOwner } from "./_core/notification";
import nodemailer from "nodemailer";

const DEFAULT_NOTIFICATION_TITLE = "Talanta Tix — ticket purchase";

export type PurchaseAttempt = {
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  phoneNumber: string;
  category: string;
  quantity: number;
  amountKsh: number;
};

export type PaymentStatusNotification = PurchaseAttempt & {
  status: "stk_initiated" | "paid" | "cancelled" | "failed" | "expired";
  providerRequestId?: string | null;
  checkoutRequestId?: string | null;
  receipt?: string | null;
  resultCode?: number | null;
  resultDescription?: string | null;
  ticketCode?: string | null;
};

export type PurchaseNotificationResult = { sent: boolean };

function attemptLines(attempt: PurchaseAttempt): string[] {
  return [
    `Order reference: ${attempt.orderCode}`,
    `Customer name: ${attempt.buyerName}`,
    `Customer email: ${attempt.buyerEmail}`,
    `M-Pesa phone: ${attempt.phoneNumber}`,
    `Ticket category: ${attempt.category}`,
    `Quantity: ${attempt.quantity}`,
    `Amount: KSh ${attempt.amountKsh.toLocaleString("en-KE")}`,
  ];
}

export function purchaseAttemptText(attempt: PurchaseAttempt, attemptedAt = new Date()): string {
  return [
    "Talanta Tix — ticket purchase attempt",
    "",
    ...attemptLines(attempt),
    `Attempted at: ${attemptedAt.toISOString()}`,
    "",
    "Payment confirmation remains authoritative from the Daraja callback.",
  ].join("\n");
}

export function paymentStatusText(payment: PaymentStatusNotification, changedAt = new Date()): string {
  return [
    `Talanta Tix — payment status: ${payment.status}`,
    "",
    ...attemptLines(payment),
    `Status changed at: ${changedAt.toISOString()}`,
    payment.providerRequestId ? `Merchant request ID: ${payment.providerRequestId}` : "",
    payment.checkoutRequestId ? `Checkout request ID: ${payment.checkoutRequestId}` : "",
    payment.receipt ? `M-Pesa receipt: ${payment.receipt}` : "",
    payment.ticketCode ? `Ticket code: ${payment.ticketCode}` : "",
    payment.resultCode !== undefined && payment.resultCode !== null ? `Daraja result code: ${payment.resultCode}` : "",
    payment.resultDescription ? `Daraja description: ${payment.resultDescription}` : "",
  ].filter(Boolean).join("\n");
}

export function buyerTicketText(payment: PaymentStatusNotification): string {
  return [
    "Talanta Tix — your ticket is confirmed",
    "",
    `Hello ${payment.buyerName},`,
    "",
    "Your M-Pesa payment has been confirmed. Keep this plain-text ticket information for stadium entry:",
    "",
    "Event: FC Bayern Munich vs AFC Ajax",
    "Venue: Raila Odinga International Stadium, Talanta Sports City, Nairobi",
    "Match date: 5 January 2027 · Kickoff 19:00 EAT · Gates 14:00",
    `Ticket category: ${payment.category}`,
    `Quantity: ${payment.quantity}`,
    `Amount paid: KSh ${payment.amountKsh.toLocaleString("en-KE")}`,
    `Order reference: ${payment.orderCode}`,
    `Ticket code: ${payment.ticketCode ?? "Pending ticket code"}`,
    payment.receipt ? `M-Pesa receipt: ${payment.receipt}` : "",
    "",
    "Present your order reference and ticket code at the official validation desk. Keep the phone number used for M-Pesa available if requested.",
    "",
    "Talanta Tix Support",
    "0713 443 577",
    "vipertechs@outlook.com",
  ].filter(Boolean).join("\n");
}

async function sendBuyerTicketEmail(payment: PaymentStatusNotification): Promise<PurchaseNotificationResult> {
  if (payment.status !== "paid" || !payment.ticketCode) return { sent: false };
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !password || !from) {
    console.warn("[Notifications] Buyer email skipped because SMTP is not configured.");
    return { sent: false };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      requireTLS: true,
      auth: { user, pass: password },
      tls: { minVersion: "TLSv1.2" },
    });
    await transporter.sendMail({
      from,
      to: payment.buyerEmail,
      subject: `Talanta Tix ticket confirmed — ${payment.orderCode}`,
      text: buyerTicketText(payment),
    });
    console.info("[Notifications] Plain-text ticket email sent", { orderCode: payment.orderCode, recipientDomain: payment.buyerEmail.split("@")[1] ?? "unknown" });
    return { sent: true };
  } catch (error) {
    console.warn("[Notifications] Buyer ticket email failed:", error instanceof Error ? error.message : "unknown error");
    return { sent: false };
  }
}

async function sendOwnerNotification(title: string, content: string): Promise<PurchaseNotificationResult> {
  try {
    return { sent: await notifyOwner({ title, content }) };
  } catch (error) {
    console.warn("[Notifications] Manus owner notification failed:", error instanceof Error ? error.message : "unknown error");
    return { sent: false };
  }
}

export function notifyPurchaseAttempt(attempt: PurchaseAttempt): Promise<PurchaseNotificationResult> {
  return sendOwnerNotification(DEFAULT_NOTIFICATION_TITLE, purchaseAttemptText(attempt));
}

export function notifyPaymentStatus(payment: PaymentStatusNotification): Promise<PurchaseNotificationResult> {
  return sendOwnerNotification(`${DEFAULT_NOTIFICATION_TITLE} — ${payment.status}`, paymentStatusText(payment));
}

export function notifyBuyerTicketEmail(payment: PaymentStatusNotification): Promise<PurchaseNotificationResult> {
  return sendBuyerTicketEmail(payment);
}
