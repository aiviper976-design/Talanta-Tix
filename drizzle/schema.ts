import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

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
  category: varchar("category", { length: 80 }).notNull(),
  quantity: int("quantity").notNull(),
  amount: int("amount").notNull(),
  status: mysqlEnum("status", ["pending", "paid", "cancelled", "failed", "expired"]).default("pending").notNull(),
  merchantRequestId: varchar("merchantRequestId", { length: 128 }),
  checkoutRequestId: varchar("checkoutRequestId", { length: 128 }),
  mpesaReceiptNumber: varchar("mpesaReceiptNumber", { length: 64 }),
  resultCode: int("resultCode"),
  resultDescription: text("resultDescription"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
