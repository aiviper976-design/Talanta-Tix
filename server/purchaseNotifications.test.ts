import { describe, expect, it } from "vitest";
import { purchaseAttemptText } from "./purchaseNotifications";

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
});
