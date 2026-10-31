import { useEffect, useState } from "react";
import { AlertCircle, Check, Download, LockKeyhole, Smartphone, X } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";

type PaymentState = "idle" | "starting" | "pending" | "paid" | "failed" | "cancelled";

const makeIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export default function TestCheckout() {
  const [state, setState] = useState<PaymentState>("idle");
  const [form, setForm] = useState({ buyerName: "Test Buyer", email: "", phone: "" });
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [ticketQr, setTicketQr] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);

  useEffect(() => {
    if (state !== "pending" || !orderCode) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/orders/${orderCode}`);
        if (!response.ok) return;
        const body = await response.json();
        if (body.status === "paid") {
          setState("paid");
          setTicketCode(body.ticketCode);
          setTicketToken(body.ticketToken);
          setMessage(body.receipt ? `Payment confirmed. M-Pesa receipt: ${body.receipt}` : "Payment confirmed.");
          window.clearInterval(timer);
        } else if (body.status === "cancelled") {
          setState("cancelled");
          setMessage("The test prompt was cancelled.");
          window.clearInterval(timer);
        } else if (body.status === "failed" || body.status === "expired") {
          setState("failed");
          setMessage(`The test payment is ${body.status}.`);
          window.clearInterval(timer);
        }
      } catch {
        // Continue polling; a delayed status response is safe.
      }
    }, 2500);
    const timeout = window.setTimeout(() => {
      window.clearInterval(timer);
      setState(current => current === "pending" ? "failed" : current);
      setMessage(current => current || "No callback received within the test window. Check the order reference.");
    }, 90_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [state, orderCode]);

  useEffect(() => {
    if (state !== "paid" || !ticketToken) {
      setTicketQr(null);
      return;
    }
    let active = true;
    QRCode.toDataURL(`${window.location.origin}/api/tickets/${ticketToken}`, { width: 280, margin: 1, color: { dark: "#111111", light: "#ffffff" } })
      .then(dataUrl => { if (active) setTicketQr(dataUrl); })
      .catch(() => { if (active) setTicketQr(null); });
    return () => { active = false; };
  }, [state, ticketToken]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setState("starting");
    setMessage("");
    try {
      const response = await fetch("/api/orders/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category: "TEST CHECKOUT", quantity: 1, amount: 1, idempotencyKey }),
      });
      const body = response.headers.get("content-type")?.includes("application/json") ? await response.json() : {};
      if (!response.ok) throw new Error(body.error || `Test checkout failed (${response.status}).`);
      setOrderCode(body.orderCode);
      setTicketToken(body.ticketToken ?? null);
      if (body.status === "paid") {
        setState("paid");
        setTicketCode(body.ticketCode ?? null);
        setMessage("Payment confirmed.");
      } else {
        setState("pending");
        setMessage("Check the test phone and enter the M-Pesa PIN to approve the KSh 1 prompt.");
      }
    } catch (error) {
      setState("failed");
      setIdempotencyKey(makeIdempotencyKey());
      setMessage(error instanceof Error ? error.message : "Test checkout failed.");
    }
  };

  const reset = () => {
    setState("idle");
    setMessage("");
    setOrderCode(null);
    setTicketCode(null);
    setTicketToken(null);
    setTicketQr(null);
    setIdempotencyKey(makeIdempotencyKey());
  };

  const downloadTicket = () => {
    if (!ticketQr || !ticketCode || !orderCode) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Talanta Tix test ticket ${ticketCode}</title><style>body{font-family:Arial,sans-serif;background:#f5f2ec;color:#111;padding:32px;max-width:520px;margin:auto}.ticket{background:#111;color:#fff;padding:28px;border-top:8px solid #f2c335}.code{font:700 22px monospace;color:#f2c335;margin:24px 0 8px}.qr{background:#fff;padding:14px;text-align:center;margin-top:24px}.qr img{width:220px;max-width:100%}.meta{border-top:1px solid #444;margin-top:20px;padding-top:14px;line-height:1.7;color:#ddd}</style></head><body><div class="ticket"><h1>Talanta Tix test ticket</h1><p>Test checkout · KSh 1</p><div class="code">${ticketCode}</div><div class="meta">Order: ${orderCode}<br>Scan the QR code to verify this ticket.</div><div class="qr"><img src="${ticketQr}" alt="Ticket verification QR code"></div></div></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `talanta-tix-test-${ticketCode}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="test-checkout-page">
      <section className="test-checkout-card">
        <div className="eyebrow"><span className="eyebrow-line dark" /> Temporary test page</div>
        <h1>Test a <em>KSh 1</em> ticket.</h1>
        <p className="test-copy">This page is temporary. It uses the live Daraja configuration, records a TEST CHECKOUT order, sends Manus owner notifications, and creates a downloadable QR ticket after the callback.</p>
        <div className="test-amount"><span>Fixed test amount</span><strong>KSh 1</strong></div>
        {state === "idle" || state === "starting" || state === "failed" ? <form onSubmit={submit} className="checkout-form">
          <label>Test buyer name<input required minLength={2} value={form.buyerName} onChange={event => setForm({ ...form, buyerName: event.target.value })} /></label>
          <label>Email recorded on the test order<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="your@email.com" /></label>
          <label>M-Pesa phone number<input required inputMode="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="0713 443 577 or +254 713 443 577" /><small>Use the number that should receive the live KSh 1 prompt.</small></label>
          {state === "failed" && <div className="form-error"><AlertCircle size={16} /> {message}</div>}
          <Button type="submit" className="checkout-button payment-submit-button" disabled={state === "starting"}>{state === "starting" ? "Starting prompt…" : "Send KSh 1 prompt"}</Button>
        </form> : state === "pending" ? <div className="test-state"><div className="state-icon"><Smartphone size={28} /></div><h2>Check your phone.</h2><p>{message}</p><div className="order-reference">Order reference <strong>{orderCode}</strong></div><div className="pending-loader"><span /><span /><span /></div></div> : state === "paid" ? <div className="test-state"><div className="state-icon success-icon"><Check size={30} /></div><h2>Test passed.</h2><p>{message}</p><div className="digital-ticket"><span className="mini-label">TEST DIGITAL TICKET</span><strong>{ticketCode}</strong>{ticketQr && <img className="ticket-qr" src={ticketQr} alt="QR code for ticket verification" />}</div><div className="order-reference">Order reference <strong>{orderCode}</strong></div><Button className="checkout-button" onClick={downloadTicket} disabled={!ticketQr}><Download size={16} /> Download test ticket</Button>{ticketToken && <a className="ticket-verify-link" href={`/api/tickets/${ticketToken}`} target="_blank" rel="noreferrer">Open verification response</a>}</div> : <div className="test-state"><div className="state-icon"><X size={28} /></div><h2>Test not completed.</h2><p>{message}</p><Button className="checkout-button" onClick={reset}>Try again</Button></div>}
        <div className="modal-footnote"><LockKeyhole size={14} /> This temporary page must be deleted after the test. No customer email is sent by this test mode.</div>
      </section>
    </main>
  );
}
