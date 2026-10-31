import { describe, expect, it, vi } from "vitest";
import {
  DarajaPaymentAdapter,
  DEFAULT_BASE_URL,
  DISABLED_MESSAGE,
  createDarajaPaymentAdapterFromEnv,
  formatTimestamp,
  normalizePhone,
} from "./daraja";

const baseConfig = {
  enabled: true,
  baseUrl: "https://daraja.test",
  consumerKey: "consumer-key",
  consumerSecret: "consumer-secret",
  shortcode: "123456",
  passkey: "pass-key",
  callbackUrl: "https://merchant.test/api/daraja/callback",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function makeAdapter(fetchImpl: typeof fetch) {
  return new DarajaPaymentAdapter({ ...baseConfig, fetchImpl });
}

describe("normalizePhone", () => {
  it.each([
    ["712 345 678", "254712345678"],
    ["0712 345 678", "254712345678"],
    ["112 345 678", "254112345678"],
    ["0112 345 678", "254112345678"],
    ["+254 712-345-678", "254712345678"],
    ["254712345678", "254712345678"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(["", "0612345678", "254612345678", "25471234567", "not-a-phone"])("rejects %s", input => {
    expect(() => normalizePhone(input)).toThrow("valid Kenyan M-Pesa number");
  });
});

describe("DarajaPaymentAdapter", () => {
  it("uses the sandbox endpoint by default", () => {
    expect(new DarajaPaymentAdapter({}).isConfigured()).toBe(false);
    expect(DEFAULT_BASE_URL).toBe("https://sandbox.safaricom.co.ke");
  });

  it("returns a disabled result when required configuration is missing", async () => {
    const adapter = new DarajaPaymentAdapter({ enabled: true });
    const result = await adapter.initiate({ phoneNumber: "0712345678", amountMinor: 123400, currency: "KES", idempotencyKey: "payment-1" });
    expect(result).toEqual({ enabled: false, status: "disabled", message: DISABLED_MESSAGE });
  });

  it("rejects unsupported currency and non-whole-KSh amounts before calling Daraja", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = makeAdapter(fetchImpl);
    await expect(adapter.initiate({ phoneNumber: "0712345678", amountMinor: 123400, currency: "USD", idempotencyKey: "payment-1" })).rejects.toThrow("require KES");
    await expect(adapter.initiate({ phoneNumber: "0712345678", amountMinor: 123450, currency: "KES", idempotencyKey: "payment-2" })).rejects.toThrow("positive whole KSh");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("initiates a generic PayBill STK Push and caches the OAuth token", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: "access-token", expires_in: 3600 }))
      .mockResolvedValueOnce(response({ MerchantRequestID: "merchant-1", CheckoutRequestID: "checkout-1", ResponseCode: "0" }))
      .mockResolvedValueOnce(response({ MerchantRequestID: "merchant-2", CheckoutRequestID: "checkout-2", ResponseCode: "0" }));
    const adapter = makeAdapter(fetchImpl);

    const first = await adapter.initiate({ phoneNumber: "+254 712 345 678", amountMinor: 123400, currency: "kes", idempotencyKey: "payment-123456789" });
    const second = await adapter.initiate({ phoneNumber: "0112345678", amountMinor: 987600, currency: "KES", idempotencyKey: "payment-2" });

    expect(first).toEqual({ enabled: true, status: "initiated", providerRequestId: "merchant-1", checkoutRequestId: "checkout-1" });
    expect(second).toMatchObject({ enabled: true, status: "initiated", providerRequestId: "merchant-2" });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[0][0]).toContain("/oauth/v1/generate?grant_type=client_credentials");
    expect(fetchImpl.mock.calls[0][1]?.headers).toMatchObject({ Authorization: `Basic ${Buffer.from("consumer-key:consumer-secret").toString("base64")}` });

    const stkRequest = fetchImpl.mock.calls[1][1];
    const payload = JSON.parse(String(stkRequest?.body));
    expect(fetchImpl.mock.calls[1][0]).toBe("https://daraja.test/mpesa/stkpush/v1/processrequest");
    expect(stkRequest?.headers).toMatchObject({ Authorization: "Bearer access-token", Accept: "application/json" });
    expect(payload).toMatchObject({
      BusinessShortCode: 123456,
      TransactionType: "CustomerPayBillOnline",
      Amount: 1234,
      PartyA: "254712345678",
      PartyB: 123456,
      PhoneNumber: "254712345678",
      CallBackURL: baseConfig.callbackUrl,
      AccountReference: "payment-1234",
    });
    expect(payload.Timestamp).toMatch(/^\d{14}$/);
    expect(Buffer.from(payload.Password, "base64").toString()).toMatch(/^123456pass-key\d{14}$/);
  });

  it("uses a till number for CustomerBuyGoodsOnline", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: "access-token" }))
      .mockResolvedValueOnce(response({ MerchantRequestID: "merchant-buy", ResponseCode: "0" }));
    const adapter = new DarajaPaymentAdapter({ ...baseConfig, transactionType: "CustomerBuyGoodsOnline", tillNumber: "998877", fetchImpl });
    await adapter.initiate({ phoneNumber: "0712345678", amountMinor: 50000, currency: "KES", idempotencyKey: "buy-1" });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({ TransactionType: "CustomerBuyGoodsOnline", PartyB: 998877 });
  });

  it("does not treat the shortcode as a customer till", async () => {
    const adapter = new DarajaPaymentAdapter({ ...baseConfig, transactionType: "CustomerBuyGoodsOnline" });
    const result = await adapter.initiate({ phoneNumber: "0712345678", amountMinor: 50000, currency: "KES", idempotencyKey: "buy-without-till" });
    expect(result).toEqual({ enabled: false, status: "disabled", message: DISABLED_MESSAGE });
  });

  it("defaults the environment factory to Buy Goods when no transaction type is supplied", async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: "access-token" }))
      .mockResolvedValueOnce(response({ MerchantRequestID: "merchant-env", ResponseCode: "0" }));
    const adapter = createDarajaPaymentAdapterFromEnv({
      DARAJA_CONSUMER_KEY: "consumer-key",
      DARAJA_CONSUMER_SECRET: "consumer-secret",
      DARAJA_SHORTCODE: "123456",
      DARAJA_PASSKEY: "pass-key",
      DARAJA_TILL_NUMBER: "998877",
      DARAJA_CALLBACK_URL: "https://merchant.test/api/daraja/callback",
      DARAJA_BASE_URL: "https://daraja.test",
    } as NodeJS.ProcessEnv, fetchImpl);
    const result = await adapter.initiate({ phoneNumber: "0712345678", amountMinor: 50000, currency: "KES", idempotencyKey: "env-buy" });
    expect(result).toMatchObject({ enabled: true, status: "initiated", providerRequestId: "merchant-env" });
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toMatchObject({ TransactionType: "CustomerBuyGoodsOnline", PartyB: 998877 });
  });

  it("reports provider rejection and non-JSON responses as errors", async () => {
    const rejected = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: "access-token" }))
      .mockResolvedValueOnce(response({ ResponseCode: "1032", ResponseDescription: "Request cancelled" }, 400));
    await expect(makeAdapter(rejected).initiate({ phoneNumber: "0712345678", amountMinor: 10000, currency: "KES", idempotencyKey: "payment-1" })).rejects.toThrow("Request cancelled");

    const nonJson = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ access_token: "access-token" }))
      .mockResolvedValueOnce(new Response("<html>gateway error</html>", { status: 502 }));
    await expect(makeAdapter(nonJson).initiate({ phoneNumber: "0712345678", amountMinor: 10000, currency: "KES", idempotencyKey: "payment-2" })).rejects.toThrow("non-JSON");
  });

  it("reconciles a successful callback with receipt, amount, and phone", () => {
    const adapter = makeAdapter(vi.fn<typeof fetch>());
    const result = adapter.reconcileCallback({ Body: { stkCallback: { MerchantRequestID: "merchant-1", ResultCode: 0, CallbackMetadata: { Item: [
      { Name: "Amount", Value: 1234 },
      { Name: "PhoneNumber", Value: "254712345678" },
      { Name: "MpesaReceiptNumber", Value: "RCP123" },
    ] } } } }, { providerRequestId: "merchant-1", amountMinor: 123400, currency: "KES", phoneNumber: "0712 345 678" });
    expect(result).toEqual({ accepted: true, providerRequestId: "merchant-1", providerTransactionId: "RCP123", status: "paid", amountMinor: 123400, currency: "KES", phoneNumber: "254712345678" });
  });

  it("accepts failed callbacks without payment metadata", () => {
    const adapter = makeAdapter(vi.fn<typeof fetch>());
    const result = adapter.reconcileCallback({ Body: { stkCallback: { MerchantRequestID: "merchant-1", ResultCode: 1032, ResultDesc: "Request cancelled" } } }, { providerRequestId: "merchant-1", amountMinor: 123400, currency: "KES", phoneNumber: "0712345678" });
    expect(result).toMatchObject({ accepted: true, status: "failed", providerRequestId: "merchant-1", amountMinor: 123400, currency: "KES" });
  });

  it.each([
    ["not-an-object", "payload is not an object"],
    [{}, "Missing Body.stkCallback"],
    [{ Body: { stkCallback: { MerchantRequestID: "other", ResultCode: 0 } } }, "does not match"],
    [{ Body: { stkCallback: { MerchantRequestID: "merchant-1" } } }, "Missing callback ResultCode"],
  ])("rejects malformed callback input", (payload, reason) => {
    const adapter = makeAdapter(vi.fn<typeof fetch>());
    const result = adapter.reconcileCallback(payload, { providerRequestId: "merchant-1", amountMinor: 123400, currency: "KES", phoneNumber: "0712345678" });
    expect(result).toEqual({ accepted: false, reason: expect.stringContaining(reason) });
  });

  it("rejects a paid callback when amount or phone does not reconcile", () => {
    const adapter = makeAdapter(vi.fn<typeof fetch>());
    const payload = { Body: { stkCallback: { MerchantRequestID: "merchant-1", ResultCode: 0, CallbackMetadata: { Item: [
      { Name: "Amount", Value: 999 },
      { Name: "PhoneNumber", Value: "254700000000" },
    ] } } } };
    const result = adapter.reconcileCallback(payload, { providerRequestId: "merchant-1", amountMinor: 123400, currency: "KES", phoneNumber: "0712345678" });
    expect(result).toEqual({ accepted: false, reason: "Successful callback amount or phone does not match the expected payment." });
  });

  it("formats Nairobi timestamps deterministically for a supplied date", () => {
    expect(formatTimestamp(new Date("2027-01-05T09:04:03.000Z"))).toMatch(/^20270105\d{6}$/);
  });
});
