const DEFAULT_GRAPH_VERSION = "v25.0";

export type WhatsAppReminder = {
  recipientPhone: string;
  buyerName: string;
  orderCode: string;
  category: string;
  quantity: number;
  amountKsh: number;
  resumeUrl: string;
};

type WhatsAppResponse = {
  messages?: Array<{ id?: string }>;
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
};

export function normalizeWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^0[17]\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^[17]\d{8}$/.test(digits)) return `254${digits}`;
  if (/^254[17]\d{8}$/.test(digits)) return digits;
  throw new Error("WhatsApp reminders require a valid Kenyan mobile number.");
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.WHATSAPP_TEMPLATE_NAME,
  );
}

export async function sendWhatsAppReminder(reminder: WhatsAppReminder): Promise<string | null> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";
  if (!accessToken || !phoneNumberId || !templateName) {
    console.info("[WhatsApp] Reminder skipped because Cloud API credentials or template are not configured.");
    return null;
  }

  const recipient = normalizeWhatsAppPhone(reminder.recipientPhone);
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const endpoint = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        language: { code: templateLanguage },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: reminder.buyerName || "there" },
              { type: "text", text: reminder.orderCode },
              { type: "text", text: reminder.category },
              { type: "text", text: String(reminder.quantity) },
              { type: "text", text: `KSh ${reminder.amountKsh.toLocaleString("en-KE")}` },
              { type: "text", text: reminder.resumeUrl },
            ],
          },
        ],
      },
    }),
  });

  const body = (await response.json()) as WhatsAppResponse;
  if (!response.ok || !body.messages?.[0]?.id) {
    const message = body.error?.message || `WhatsApp Cloud API failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return body.messages[0].id || null;
}
