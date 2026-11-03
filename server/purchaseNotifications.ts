import { readFile } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import sharp from "sharp";
import nodemailer from "nodemailer";
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
  ticketToken?: string | null;
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

function escapeXml(value: string): string {
  return value.replace(/[&<>\"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;", "'": "&apos;" })[character] ?? character);
}

async function createTicketAttachments(payment: PaymentStatusNotification): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || "https://talantatix-ofmdtqd7.manus.space";
  const verificationUrl = payment.ticketToken ? `${publicBaseUrl}/api/tickets/${encodeURIComponent(payment.ticketToken)}` : `${publicBaseUrl}/#verify`;
  const qrBuffer = await QRCode.toBuffer(verificationUrl, { width: 280, margin: 1, color: { dark: "#111111", light: "#ffffff" } });
  const assetCandidates = [
    path.resolve(process.cwd(), "dist/public/assets/bayern-ajax-match.webp"),
    path.resolve(process.cwd(), "client/public/assets/bayern-ajax-match.webp"),
  ];
  let artworkPath = assetCandidates[0];
  for (const candidate of assetCandidates) {
    try { await readFile(candidate); artworkPath = candidate; break; } catch { /* try the next deployment path */ }
  }
  const artwork = await sharp(artworkPath).resize(1200, 420, { fit: "cover" }).png().toBuffer();
  const buyer = escapeXml(payment.buyerName);
  const category = escapeXml(payment.category);
  const code = escapeXml(payment.ticketCode ?? "ENTRY-PENDING");
  const order = escapeXml(payment.orderCode);
  const receipt = escapeXml(payment.receipt ?? "Confirmed by Daraja callback");
  const detailsSvg = Buffer.from(`<svg width="1200" height="1080" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="1080" fill="#111111"/><rect y="0" width="1200" height="14" fill="#f2c335"/><text x="70" y="100" fill="#f2c335" font-family="Arial" font-size="25" font-weight="700">${code}</text><text x="70" y="175" fill="#ffffff" font-family="Arial" font-size="40" font-weight="700">${category} · ${payment.quantity} ticket${payment.quantity === 1 ? "" : "s"}</text><text x="70" y="235" fill="#ffffff" font-family="Arial" font-size="29" font-weight="700">Name: ${buyer}</text><text x="70" y="295" fill="#d7d7d7" font-family="Arial" font-size="25">Order ${order}</text><text x="70" y="345" fill="#d7d7d7" font-family="Arial" font-size="25">Total paid KSh ${payment.amountKsh.toLocaleString("en-KE")}</text><text x="70" y="395" fill="#f2c335" font-family="Arial" font-size="23">M-Pesa receipt: ${receipt}</text><text x="70" y="465" fill="#ffffff" font-family="Arial" font-size="22">Scan to verify this ticket</text><rect x="70" y="510" width="340" height="340" fill="#ffffff"/><text x="520" y="620" fill="#d7d7d7" font-family="monospace" font-size="24">DIGITAL ENTRY TICKET</text><text x="520" y="670" fill="#d7d7d7" font-family="monospace" font-size="21">5 JANUARY 2027 · NAIROBI</text><text x="520" y="720" fill="#d7d7d7" font-family="monospace" font-size="18">Raila Odinga International Stadium</text><text x="520" y="770" fill="#d7d7d7" font-family="monospace" font-size="18">Verified after Safaricom M-Pesa callback</text></svg>`);
  const heroSvg = Buffer.from(`<svg width="1200" height="420" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="420" fill="#111111" fill-opacity=".56"/><text x="70" y="260" fill="#ffffff" font-family="Arial" font-size="58" font-weight="700">BAYERN MUNICH VS AJAX</text><text x="70" y="320" fill="#f2c335" font-family="monospace" font-size="28" font-weight="700">5 JANUARY 2027 · NAIROBI</text><text x="70" y="365" fill="#ffffff" font-family="Arial" font-size="30" font-weight="700">RAILA ODINGA INTERNATIONAL STADIUM</text></svg>`);
  const png = await sharp({ create: { width: 1200, height: 1500, channels: 4, background: "#111111" } }).composite([{ input: artwork, top: 0, left: 0 }, { input: heroSvg, top: 0, left: 0 }, { input: detailsSvg, top: 420, left: 0 }, { input: qrBuffer, top: 990, left: 100 }]).png().toBuffer();
  const pdfChunks: Buffer[] = [];
  const document = new PDFDocument({ autoFirstPage: false, size: [600, 750], margin: 0 });
  document.on("data", chunk => pdfChunks.push(Buffer.from(chunk)));
  const pdfReady = new Promise<Buffer>((resolve, reject) => { document.on("end", () => resolve(Buffer.concat(pdfChunks))); document.on("error", reject); });
  document.addPage({ size: [600, 750], margin: 0 });
  document.image(png, 0, 0, { width: 600, height: 750 });
  document.end();
  const pdf = await pdfReady;
  const baseName = `talanta-tix-${payment.ticketCode}`;
  return [{ filename: `${baseName}.png`, content: png, contentType: "image/png" }, { filename: `${baseName}.pdf`, content: pdf, contentType: "application/pdf" }];
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
    const attachments = await createTicketAttachments(payment);
    await transporter.sendMail({
      from,
      to: payment.buyerEmail,
      subject: `Talanta Tix ticket confirmed — ${payment.orderCode}`,
      text: buyerTicketText(payment),
      attachments,
    });
    console.info("[Notifications] Plain-text ticket email with PNG and PDF sent", { orderCode: payment.orderCode, recipientDomain: payment.buyerEmail.split("@")[1] ?? "unknown" });
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
