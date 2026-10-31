import nodemailer from "nodemailer";

const DEFAULT_NOTIFICATION_EMAIL = "ellyouku@gmail.com";

type PurchaseAttempt = {
  orderCode: string;
  buyerName: string;
  buyerEmail: string;
  phoneNumber: string;
  category: string;
  quantity: number;
  amountKsh: number;
};

export type PurchaseNotificationResult =
  | { sent: true; messageId?: string }
  | { sent: false; reason: "not_configured" };

function purchaseAttemptText(attempt: PurchaseAttempt, attemptedAt = new Date()): string {
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
  const password = process.env.PURCHASE_NOTIFICATION_GMAIL_APP_PASSWORD;
  if (!password) return { sent: false, reason: "not_configured" };

  const recipient = process.env.PURCHASE_NOTIFICATION_EMAIL || DEFAULT_NOTIFICATION_EMAIL;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: recipient, pass: password },
  });
  const result = await transporter.sendMail({
    from: recipient,
    to: recipient,
    subject: `Ticket purchase attempt — ${attempt.orderCode}`,
    text: purchaseAttemptText(attempt),
  });
  return { sent: true, messageId: result.messageId };
}

export { purchaseAttemptText };
