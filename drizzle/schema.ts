import { int, mysqlEnum, mysqlTable, text, timestamp, unique, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  orderCode: varchar("orderCode", { length: 32 }).notNull().unique(),
  buyerName: varchar("buyerName", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 16 }).notNull(),
  whatsappOptIn: int("whatsappOptIn").default(0).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  quantity: int("quantity").notNull(),
  amount: int("amount").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "cancelled", "failed", "expired"]).default("pending").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 96 }).unique(),
  ticketToken: varchar("ticketToken", { length: 96 }).unique(),
  expiresAt: timestamp("expiresAt"),
  paidAt: timestamp("paidAt"),
  merchantRequestId: varchar("merchantRequestId", { length: 128 }),
  checkoutRequestId: varchar("checkoutRequestId", { length: 128 }),
  mpesaReceiptNumber: varchar("mpesaReceiptNumber", { length: 64 }),
  resultCode: int("resultCode"),
  resultDescription: text("resultDescription"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const purchaseReminders = mysqlTable("purchaseReminders", {
  id: int("id").autoincrement().primaryKey(),
  orderCode: varchar("orderCode", { length: 32 }).notNull(),
  reminderNumber: int("reminderNumber").notNull(),
  status: mysqlEnum("status", ["sending", "sent"]).default("sending").notNull(),
  claimedAt: timestamp("claimedAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
  messageId: varchar("messageId", { length: 255 }),
  whatsappMessageId: varchar("whatsappMessageId", { length: 255 }),
}, table => ({
  orderReminderUnique: unique("purchaseReminders_orderCode_reminderNumber_unique").on(table.orderCode, table.reminderNumber),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
