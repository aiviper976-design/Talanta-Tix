import { notifyOwner } from "./_core/notification";

const DEFAULT_NOTIFICATION_TITLE = "Talanta Tix — ticket purchase attempt";

export type PurchaseAttempt = {
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  phoneNumber: string;
  category: string;
  quantity: number;
  amountKsh: number;
};

export type PurchaseNotificationResult = { sent: boolean };

export function purchaseAttemptText(attempt: PurchaseAttempt, attemptedAt = new Date()): string {
  return [
    "Talanta Tix — ticket purchase attempt",
    "",
    `Order reference: ${attempt.orderCode}`,
    `Attempted at: ${attemptedAt.toISOString()}`,
    "",
    "Customer details",
    `Name: ${attempt.buyerName}`,
    `Email: ${attempt.buyerEmail}`,
    `M-Pesa phone: ${attempt.phoneNumber}`,
    "",
    "Ticket details",
    `Category: ${attempt.category}`,
    `Quantity: ${attempt.quantity}`,
    `Amount: KSh ${attempt.amountKsh.toLocaleString("en-KE")}`,
    "",
    "This message confirms that a purchase attempt was submitted. Final payment status is determined by the Daraja callback.",
  ].join("\n");
}

export async function notifyPurchaseAttempt(attempt: PurchaseAttempt): Promise<PurchaseNotificationResult> {
  try {
    const sent = await notifyOwner({ title: DEFAULT_NOTIFICATION_TITLE, content: purchaseAttemptText(attempt) });
    return { sent };
  } catch (error) {
    console.warn("[Notifications] Purchase attempt notification failed:", error instanceof Error ? error.message : "unknown error");
    return { sent: false };
  }
}
