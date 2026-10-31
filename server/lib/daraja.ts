export type DarajaPaymentRequest = {
  phoneNumber: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
};

export type DarajaPaymentResult =
  | { enabled: false; status: "disabled"; message: string }
  | { enabled: true; status: "initiated"; providerRequestId: string; checkoutRequestId?: string };

export type DarajaCallbackResult =
  | { accepted: false; reason: string }
  | {
      accepted: true;
      providerRequestId: string;
      providerTransactionId?: string;
      status: "paid" | "failed";
      amountMinor: number;
      currency: "KES";
      phoneNumber?: string;
    };

export type DarajaConfig = {
  enabled?: boolean;
  baseUrl?: string;
  consumerKey?: string;
  consumerSecret?: string;
  shortcode?: string;
  passkey?: string;
  callbackUrl?: string;
  transactionType?: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  tillNumber?: string;
  fetchImpl?: typeof fetch;
};

type OAuthResponse = { access_token?: string; expires_in?: number; errorMessage?: string };
type StkResponse = {
  MerchantRequestID?: string;
  CheckoutRequestID?: string;
  ResponseCode?: string;
  ResponseDescription?: string;
  errorMessage?: string;
};
type CallbackItem = { Name?: unknown; Value?: unknown };

export const DEFAULT_BASE_URL = "https://sandbox.safaricom.co.ke";
export const DEFAULT_SANDBOX_SHORTCODE = "174379";
export const DEFAULT_SANDBOX_PASSKEY = "";
export const DISABLED_MESSAGE = "Daraja payment requests are disabled until the shortcode, customer till, callback URL, and production approval are configured.";

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new Error("Enter a valid Kenyan M-Pesa number beginning with 01 or 07.");
}

export function formatTimestamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}${parts.month}${parts.day}${parts.hour}${parts.minute}${parts.second}`;
}

async function readJson<T>(response: Response, operation: string): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) throw new Error(`${operation} returned an empty response (HTTP ${response.status}).`);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${operation} returned a non-JSON response (HTTP ${response.status}).`);
  }
}

export class DarajaPaymentAdapter {
  private readonly config: Required<Pick<DarajaConfig, "enabled" | "baseUrl" | "fetchImpl">> & Omit<DarajaConfig, "enabled" | "baseUrl" | "fetchImpl">;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: DarajaConfig = {}) {
    this.config = {
      enabled: config.enabled ?? Boolean(config.consumerKey && config.consumerSecret && config.callbackUrl),
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      fetchImpl: config.fetchImpl ?? fetch,
      consumerKey: config.consumerKey,
      consumerSecret: config.consumerSecret,
      shortcode: config.shortcode ?? DEFAULT_SANDBOX_SHORTCODE,
      passkey: config.passkey ?? DEFAULT_SANDBOX_PASSKEY,
      callbackUrl: config.callbackUrl,
      transactionType: config.transactionType ?? "CustomerPayBillOnline",
      tillNumber: config.tillNumber,
    };
  }

  isConfigured(): boolean {
    const tillReady = this.config.transactionType !== "CustomerBuyGoodsOnline" || Boolean(this.config.tillNumber);
    return Boolean(
      this.config.enabled &&
        this.config.consumerKey &&
        this.config.consumerSecret &&
        this.config.callbackUrl &&
        this.config.shortcode &&
        this.config.passkey &&
        tillReady,
    );
  }

  async initiate(request: DarajaPaymentRequest): Promise<DarajaPaymentResult> {
    if (!this.isConfigured()) return { enabled: false, status: "disabled", message: DISABLED_MESSAGE };
    if (request.currency.toUpperCase() !== "KES") throw new Error("Daraja payments require KES.");
    if (!Number.isInteger(request.amountMinor) || request.amountMinor % 100 !== 0 || request.amountMinor <= 0) {
      throw new Error("Daraja amount must be a positive whole KSh amount.");
    }

    const phoneNumber = normalizePhone(request.phoneNumber);
    const accessToken = await this.getAccessToken();
    const timestamp = formatTimestamp();
    const password = Buffer.from(`${this.config.shortcode}${this.config.passkey}${timestamp}`).toString("base64");
    const partyB = this.config.transactionType === "CustomerBuyGoodsOnline" ? this.config.tillNumber! : this.config.shortcode;
    const response = await this.config.fetchImpl(`${this.config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        BusinessShortCode: Number(this.config.shortcode),
        Password: password,
        Timestamp: timestamp,
        TransactionType: this.config.transactionType,
        Amount: Math.round(request.amountMinor / 100),
        PartyA: phoneNumber,
        PartyB: Number(partyB),
        PhoneNumber: phoneNumber,
        CallBackURL: this.config.callbackUrl,
        AccountReference: request.idempotencyKey.slice(0, 12),
        TransactionDesc: `M-Pesa ${request.idempotencyKey}`.slice(0, 13),
      }),
    });
    const body = await readJson<StkResponse>(response, "Daraja STK Push");
    if (!response.ok || body.ResponseCode !== "0" || !body.MerchantRequestID) {
      throw new Error(body.errorMessage || body.ResponseDescription || `Daraja STK Push failed with HTTP ${response.status}.`);
    }
    return { enabled: true, status: "initiated", providerRequestId: body.MerchantRequestID, checkoutRequestId: body.CheckoutRequestID };
  }

  reconcileCallback(
    payload: unknown,
    expected: Pick<DarajaPaymentRequest, "amountMinor" | "currency" | "phoneNumber"> & { providerRequestId: string },
  ): DarajaCallbackResult {
    if (!payload || typeof payload !== "object") return { accepted: false, reason: "Daraja callback payload is not an object." };
    const root = payload as { Body?: { stkCallback?: Record<string, unknown> } };
    const callback = root.Body?.stkCallback;
    if (!callback) return { accepted: false, reason: "Missing Body.stkCallback." };
    const providerRequestId = typeof callback.MerchantRequestID === "string" ? callback.MerchantRequestID.trim() : "";
    if (!providerRequestId || providerRequestId !== expected.providerRequestId) return { accepted: false, reason: "Callback MerchantRequestID does not match the payment attempt." };
    if (expected.currency.toUpperCase() !== "KES") return { accepted: false, reason: "Daraja callbacks must use KES." };

    const resultCode = callback.ResultCode;
    const status = resultCode === 0 ? "paid" : resultCode === undefined ? null : "failed";
    if (!status) return { accepted: false, reason: "Missing callback ResultCode." };
    const items = Array.isArray((callback.CallbackMetadata as { Item?: unknown[] } | undefined)?.Item)
      ? ((callback.CallbackMetadata as { Item: unknown[] }).Item as CallbackItem[])
      : [];
    const item = (name: string) => items.find(entry => entry.Name === name)?.Value;
    const amount = Number(item("Amount"));
    const phone = item("PhoneNumber") === undefined ? undefined : String(item("PhoneNumber"));
    const expectedPhone = normalizePhone(expected.phoneNumber);
    if (status === "paid" && (amount !== Math.round(expected.amountMinor / 100) || phone !== expectedPhone)) {
      return { accepted: false, reason: "Successful callback amount or phone does not match the expected payment." };
    }
    const receipt = item("MpesaReceiptNumber");
    return { accepted: true, providerRequestId, providerTransactionId: receipt === undefined ? undefined : String(receipt), status, amountMinor: expected.amountMinor, currency: "KES", phoneNumber: phone };
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(`${this.config.consumerKey}:${this.config.consumerSecret}`).toString("base64");
    const response = await this.config.fetchImpl(`${this.config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    });
    const body = await readJson<OAuthResponse>(response, "Daraja OAuth");
    if (!response.ok || !body.access_token) throw new Error(body.errorMessage || `Daraja OAuth failed with HTTP ${response.status}.`);
    this.token = { value: body.access_token, expiresAt: Date.now() + Math.max(60, body.expires_in ?? 3600) * 1000 };
    return body.access_token;
  }
}

export function createDarajaPaymentAdapterFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): DarajaPaymentAdapter {
  const enabled = env.DARAJA_ENABLED === undefined ? undefined : env.DARAJA_ENABLED === "true";
  return new DarajaPaymentAdapter({
    enabled,
    baseUrl: env.DARAJA_BASE_URL ?? (env.DARAJA_ENV === "production" ? "https://api.safaricom.co.ke" : DEFAULT_BASE_URL),
    consumerKey: env.DARAJA_CONSUMER_KEY,
    consumerSecret: env.DARAJA_CONSUMER_SECRET,
    shortcode: env.DARAJA_SHORTCODE,
    passkey: env.DARAJA_PASSKEY,
    callbackUrl: env.DARAJA_CALLBACK_URL,
    transactionType: env.DARAJA_TRANSACTION_TYPE === "CustomerPayBillOnline" ? "CustomerPayBillOnline" : "CustomerBuyGoodsOnline",
    tillNumber: env.DARAJA_TILL_NUMBER,
    fetchImpl,
  });
}

export const darajaPaymentAdapter = createDarajaPaymentAdapterFromEnv();
export { DISABLED_MESSAGE as DARAJA_ADAPTER_DISABLED_MESSAGE };
