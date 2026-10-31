import { notifyOwner } from "./_core/notification";

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
