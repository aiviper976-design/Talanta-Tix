import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyPurchaseAttempt, purchaseAttemptText } from "./purchaseNotifications";

afterEach(() => vi.unstubAllEnvs());

describe("purchase notifications", () => {
  const attempt = {
    orderCode: "TT-TEST-123",
    buyerName: "Amina Otieno",
    buyerEmail: "amina@example.com",
    phoneNumber: "254712345678",
    category: "Early Bird",
    quantity: 2,
    amountKsh: 1000,
  };

  it("formats a plain-text purchase attempt with order, customer, and ticket details", () => {
    const text = purchaseAttemptText(attempt, new Date("2027-01-05T09:04:03.000Z"));
    expect(text).toContain("Talanta Tix — ticket purchase attempt");
    expect(text).toContain("Order reference: TT-TEST-123");
    expect(text).toContain("Attempted at: 2027-01-05T09:04:03.000Z");
    expect(text).toContain("Name: Amina Otieno");
    expect(text).toContain("Email: amina@example.com");
    expect(text).toContain("M-Pesa phone: 254712345678");
    expect(text).toContain("Category: Early Bird");
    expect(text).toContain("Quantity: 2");
    expect(text).toContain("Amount: KSh 1,000");
  });

  it("degrades safely when the Gmail app password is not configured", async () => {
    vi.stubEnv("PURCHASE_NOTIFICATION_GMAIL_APP_PASSWORD", "");
    await expect(notifyPurchaseAttempt(attempt)).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});
