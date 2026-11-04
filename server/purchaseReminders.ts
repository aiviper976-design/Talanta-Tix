import mysql from "mysql2/promise";
import type { ResultSetHeader } from "mysql2/promise";
import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { createOrderResumeToken } from "./orderResume";

const REMINDER_DELAY_MS = 3 * 60 * 1000;
const REMINDER_INTERVAL_MS = 12 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 5 * 24 * 60 * 60 * 1000;
const MAX_REMINDER_NUMBER = Math.floor((REMINDER_WINDOW_MS - REMINDER_DELAY_MS) / REMINDER_INTERVAL_MS);
const OWNER_BCC = "ellyouku@gmail.com";
const SITE_URL = "https://talantatix-ofmdtqd7.manus.space";

function posterPath() {
  const candidates = [
    path.resolve(process.cwd(), "dist/public/assets/bayern-ajax-match.webp"),
    path.resolve(process.cwd(), "client/public/assets/bayern-ajax-match.webp"),
  ];
  const found = candidates.find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error("Bayern vs Ajax match poster is missing.");
  return found;
}

function formatMoney(amount: number) {
  return `KSh ${Number(amount).toLocaleString("en-KE")}`;
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Africa/Nairobi" }).format(new Date(value));
}

function createTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !password || !from) throw new Error("SMTP configuration is incomplete.");
  return {
    from: `TALANTA TICKETS <${from}>`,
    transporter: nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      requireTLS: true,
      auth: { user, pass: password },
      tls: { minVersion: "TLSv1.2" },
    }),
  };
}

function reminderText(order: any, reminderNumber: number) {
  const reminderLabel = reminderNumber === 0 ? "first reminder" : `reminder ${reminderNumber + 1}`;
  const resumeUrl = `${SITE_URL}/?resume=${encodeURIComponent(createOrderResumeToken(order.orderCode))}`;
  return [
    "Talanta Tix — complete your ticket purchase",
    "",
    `Hello ${order.buyerName || "there"},`,
    "",
    `This is your ${reminderLabel} about the ticket purchase you started. Your payment is not yet complete, and your ticket is not reserved until the M-Pesa payment is successfully confirmed.`,
    "",
    `Order reference: ${order.orderCode}`,
    `Ticket category: ${order.category}`,
    `Quantity: ${order.quantity}`,
    `Amount: ${formatMoney(order.amount)}`,
    `Attempt started: ${formatDate(order.createdAt)}`,
    `Current status: ${order.status}`,
    "",
    `Resume your checkout directly: ${resumeUrl}`,
    "",
    "Event: FC Bayern Munich vs AFC Ajax",
    "Venue: Raila Odinga International Stadium, Talanta Sports City, Nairobi",
    "Match date: 5 January 2027 · Kickoff 19:00 EAT · Gates 14:00",
    "",
    "The official match poster is attached for your reference.",
    "",
    "For help: 0713 443 577 | vipertechs@outlook.com",
    "",
    "Talanta Tix",
  ].join("\n");
}

async function sendReminder(order: any, reminderNumber: number) {
  const { transporter, from } = createTransport();
  const info = await transporter.sendMail({
    from,
    to: order.email,
    bcc: OWNER_BCC,
    subject: "Reminder: complete your Bayern vs Ajax ticket purchase",
    text: reminderText(order, reminderNumber),
    attachments: [{
      filename: "bayern-vs-ajax-match-poster.webp",
      path: posterPath(),
      contentType: "image/webp",
    }],
  });
  return info.messageId || null;
}

export async function runPurchaseReminderSweep(now = new Date()) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Database is not configured.");
  const db = await mysql.createConnection(databaseUrl);
  const nowMs = now.getTime();
  const minCreatedAt = new Date(nowMs - REMINDER_WINDOW_MS);
  const maxCreatedAt = new Date(nowMs - REMINDER_DELAY_MS);
  let scanned = 0;
  let sent = 0;
  let skipped = 0;

  try {
    await db.query("DELETE FROM purchaseReminders WHERE status = 'sending' AND claimedAt < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
    const [orders] = await db.query<any[]>(
      "SELECT orderCode,buyerName,email,category,quantity,amount,status,createdAt FROM orders WHERE status <> 'paid' AND category NOT LIKE 'TEST %' AND email <> '' AND createdAt >= ? AND createdAt <= ? ORDER BY createdAt ASC",
      [minCreatedAt, maxCreatedAt],
    );

    for (const order of orders) {
      scanned += 1;
      const ageMs = nowMs - new Date(order.createdAt).getTime();
      const dueReminderNumber = Math.min(MAX_REMINDER_NUMBER, Math.floor((ageMs - REMINDER_DELAY_MS) / REMINDER_INTERVAL_MS));
      const [lastRows] = await db.query<any[]>("SELECT MAX(reminderNumber) AS lastReminderNumber, MAX(sentAt) AS lastSentAt FROM purchaseReminders WHERE orderCode = ? AND status = 'sent'", [order.orderCode]);
      const nextReminderNumber = lastRows[0]?.lastReminderNumber == null ? 0 : Number(lastRows[0].lastReminderNumber) + 1;
      const lastSentAt = lastRows[0]?.lastSentAt ? new Date(lastRows[0].lastSentAt).getTime() : null;
      const dueFromLastSent = lastSentAt === null ? ageMs >= REMINDER_DELAY_MS : nowMs - lastSentAt >= REMINDER_INTERVAL_MS;
      if (!dueFromLastSent || nextReminderNumber > dueReminderNumber || nextReminderNumber > MAX_REMINDER_NUMBER) {
        skipped += 1;
        continue;
      }

      const [claim] = await db.query(
        "INSERT IGNORE INTO purchaseReminders (orderCode, reminderNumber, status, claimedAt) VALUES (?, ?, 'sending', NOW())",
        [order.orderCode, nextReminderNumber],
      ) as [ResultSetHeader, unknown];
      if (!claim.affectedRows) {
        skipped += 1;
        continue;
      }

      const [currentRows] = await db.query<any[]>("SELECT status FROM orders WHERE orderCode = ? LIMIT 1", [order.orderCode]);
      if (!currentRows[0] || currentRows[0].status === "paid") {
        await db.query("DELETE FROM purchaseReminders WHERE orderCode = ? AND reminderNumber = ? AND status = 'sending'", [order.orderCode, nextReminderNumber]);
        skipped += 1;
        continue;
      }

      try {
        const messageId = await sendReminder(order, nextReminderNumber);
        await db.query("UPDATE purchaseReminders SET status = 'sent', sentAt = NOW(), messageId = ? WHERE orderCode = ? AND reminderNumber = ?", [messageId, order.orderCode, nextReminderNumber]);
        sent += 1;
      } catch (error) {
        await db.query("DELETE FROM purchaseReminders WHERE orderCode = ? AND reminderNumber = ? AND status = 'sending'", [order.orderCode, nextReminderNumber]);
        throw error;
      }
    }

    return { scanned, sent, skipped, maxReminderNumber: MAX_REMINDER_NUMBER };
  } finally {
    await db.end();
  }
}

export async function purchaseReminderHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "Scheduled task authentication required." });
    const result = await runPurchaseReminderSweep();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error("[Purchase reminders] Sweep failed:", error instanceof Error ? error.message : error);
    return res.status(500).json({ ok: false, error: "Purchase reminder sweep failed." });
  }
}

export { MAX_REMINDER_NUMBER };
