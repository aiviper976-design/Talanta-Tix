import { describe, expect, it } from "vitest";
import { buyerTicketText, purchaseAttemptText } from "./purchaseNotifications";

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
    expect(text).toContain("Customer name: Amina Otieno");
    expect(text).toContain("Customer email: amina@example.com");
    expect(text).toContain("M-Pesa phone: 254712345678");
    expect(text).toContain("Ticket category: Early Bird");
    expect(text).toContain("Quantity: 2");
    expect(text).toContain("Amount: KSh 1,000");
  });

  it("formats a paid buyer ticket as plain text", () => {
    const text = buyerTicketText({
      ...attempt,
      status: "paid",
      ticketCode: "ENTRY-TT-TEST",
      receipt: "QAB123XYZ",
    });
    expect(text).toContain("Talanta Tix — your ticket is confirmed");
    expect(text).toContain("Hello Amina Otieno,");
    expect(text).toContain("Ticket code: ENTRY-TT-TEST");
    expect(text).toContain("M-Pesa receipt: QAB123XYZ");
    expect(text).not.toContain(".png");
    expect(text).not.toContain(".pdf");
  });
});
