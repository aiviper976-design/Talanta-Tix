import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Download,
  LockKeyhole,
  Mail,
  Menu,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  Smartphone,
  Ticket,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";

type TicketOption = {
  id: string;
  name: string;
  price: number;
  tag: string;
  note: string;
  accent: string;
};

type PaymentState = "idle" | "starting" | "pending" | "paid" | "cancelled" | "failed";

const saleDeadline = "25 NOV 2026";
const saleEndsAt = "2026-11-25T23:59:59+03:00";
const matchStartsAt = "2027-01-05T00:00:00+03:00";
const ticketOptions: TicketOption[] = [
  { id: "early-bird", name: "Early Bird", price: 500, tag: "Flash sale", note: `Limited allocation · valid till ${saleDeadline}`, accent: "orange" },
  { id: "north-stand", name: "North Stand", price: 1800, tag: "Matchday", note: "Upper tier · full-pitch view", accent: "orange" },
  { id: "east-stand", name: "East Stand", price: 3200, tag: "Matchday", note: "Lower tier · halfway line views", accent: "cream" },
  { id: "premium-sideline", name: "Premium Sideline", price: 7500, tag: "Premium", note: "Premium seating · hospitality details TBC", accent: "gold" },
];

const formatKes = (value: number) => `KSh ${value.toLocaleString("en-KE")}`;
const makeIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
type Countdown = { days: number; hours: number; minutes: number; seconds: number; total: number };
const getCountdown = (target: string): Countdown => {
  const total = Math.max(0, new Date(target).getTime() - Date.now());
  const seconds = Math.floor(total / 1000);
  return { total, days: Math.floor(seconds / 86400), hours: Math.floor((seconds % 86400) / 3600), minutes: Math.floor((seconds % 3600) / 60), seconds: seconds % 60 };
};
const pad = (value: number) => value.toString().padStart(2, "0");

function CountdownDigits({ value, includeDays = false }: { value: Countdown; includeDays?: boolean }) {
  const displayedHours = includeDays ? value.hours : Math.floor(value.total / 3600000);
  return <div className={`countdown-digits ${includeDays ? "countdown-match" : "countdown-sale"}`} aria-live="polite">
    {includeDays && <><strong>{value.days}</strong><small>days</small><span>:</span></>}
    <strong>{pad(displayedHours)}</strong><small>hours</small><span>:</span><strong>{pad(value.minutes)}</strong><small>minutes</small><span>:</span><strong>{pad(value.seconds)}</strong><small>seconds</small>
  </div>;
}

function TicketMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`ticket-mark ${small ? "ticket-mark-small" : ""}`} aria-hidden="true">
      <span className="ticket-mark-star">✦</span>
    </span>
  );
}

export default function Home() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(ticketOptions[0].id);
  const [quantity, setQuantity] = useState(1);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [ticketQr, setTicketQr] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [form, setForm] = useState({ buyerName: "", email: "", phone: "" });
  const [saleCountdown, setSaleCountdown] = useState(() => getCountdown(saleEndsAt));
  const [matchCountdown, setMatchCountdown] = useState(() => getCountdown(matchStartsAt));

  useEffect(() => {
    const updateCountdowns = () => {
      setSaleCountdown(getCountdown(saleEndsAt));
      setMatchCountdown(getCountdown(matchStartsAt));
    };
    const timer = window.setInterval(updateCountdowns, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selected = ticketOptions.find(ticket => ticket.id === selectedId) ?? ticketOptions[0];
  const subtotal = selected.price * quantity;
  const serviceFee = Math.round(subtotal * 0.04);
  const total = subtotal + serviceFee;

  const scrollToTickets = () => {
    setMobileOpen(false);
    document.getElementById("tickets")?.scrollIntoView({ behavior: "smooth" });
  };

  const updateQuantity = (next: number) => setQuantity(Math.min(10, Math.max(1, next)));

  const resetCheckout = () => {
    setCheckoutOpen(false);
    setPaymentState("idle");
    setPaymentMessage("");
    setOrderCode(null);
    setTicketCode(null);
    setTicketToken(null);
    setTicketQr(null);
    setIdempotencyKey(makeIdempotencyKey());
  };

  const startPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPaymentState("starting");
    setPaymentMessage("");
    try {
      const response = await fetch("/api/orders/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category: selected.name, quantity, amount: total, idempotencyKey }),
      });
      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : { error: `The payment service returned an unexpected response (${response.status}). Refresh the page and try again.` };
      if (!response.ok) throw new Error(body.error || "We could not start the payment prompt.");
      setOrderCode(body.orderCode);
      setTicketToken(body.ticketToken ?? null);
      if (body.status === "paid") {
        setTicketCode(body.ticketCode ?? null);
        setPaymentState("paid");
        setPaymentMessage(body.receipt ? `M-Pesa receipt ${body.receipt}` : "Your payment has been confirmed.");
      } else {
        setPaymentState("pending");
        setPaymentMessage("Check your phone and enter your M-Pesa PIN to approve the ticket order.");
      }
    } catch (error) {
      setPaymentState("failed");
      setPaymentMessage(error instanceof Error ? error.message : "We could not start the payment prompt.");
    }
  };

  useEffect(() => {
    if (paymentState !== "pending" || !orderCode) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/orders/${orderCode}`);
        if (!response.ok) return;
        const body = await response.json();
        if (body.status === "paid") {
          setPaymentState("paid");
          setTicketCode(body.ticketCode);
          setTicketToken(body.ticketToken);
          setPaymentMessage(body.receipt ? `M-Pesa receipt ${body.receipt}` : "Your payment has been confirmed.");
          window.clearInterval(timer);
        }
        if (body.status === "cancelled") {
          setPaymentState("cancelled");
          setPaymentMessage("The M-Pesa prompt was cancelled. You can try again when ready.");
          window.clearInterval(timer);
        }
        if (body.status === "failed" || body.status === "expired") {
          setPaymentState("failed");
          setPaymentMessage("The payment did not complete. Please try again or contact support.");
          window.clearInterval(timer);
        }
      } catch {
        // A delayed status response is safe; the next poll can reconcile it.
      }
    }, 3000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(timer);
      setPaymentState(current => current === "pending" ? "failed" : current);
      setPaymentMessage(current => current || "We have not received a confirmation yet. Check M-Pesa and contact support with your order reference.");
    }, 90000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [paymentState, orderCode]);

  useEffect(() => {
    if (paymentState !== "paid" || !ticketToken) {
      setTicketQr(null);
      return;
    }
    let active = true;
    QRCode.toDataURL(`${window.location.origin}/api/tickets/${ticketToken}`, { width: 260, margin: 1, color: { dark: "#111111", light: "#ffffff" } })
      .then(dataUrl => { if (active) setTicketQr(dataUrl); })
      .catch(() => { if (active) setTicketQr(null); });
    return () => { active = false; };
  }, [paymentState, ticketToken]);

  const downloadTicket = async () => {
    if (!ticketQr || !ticketCode || !orderCode) return;
    const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
    const [matchImage, qrImage] = await Promise.all([loadImage("/assets/bayern-ajax-match.webp"), loadImage(ticketQr)]);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#111111";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const matchScale = Math.max(canvas.width / matchImage.width, 420 / matchImage.height);
    const matchWidth = matchImage.width * matchScale;
    const matchHeight = matchImage.height * matchScale;
    context.drawImage(matchImage, (canvas.width - matchWidth) / 2, (420 - matchHeight) / 2, matchWidth, matchHeight);
    context.fillStyle = "rgba(17,17,17,.56)";
    context.fillRect(0, 0, canvas.width, 420);
    context.fillStyle = "#f2c335";
    context.fillRect(0, 0, canvas.width, 14);
    context.fillStyle = "#ffffff";
    context.font = "800 58px Arial";
    context.fillText("BAYERN MUNICH VS AJAX", 70, 260);
    context.font = "700 28px monospace";
    context.fillStyle = "#f2c335";
    context.fillText("5 JANUARY 2027 · NAIROBI", 70, 320);
    context.fillStyle = "#ffffff";
    context.font = "700 30px Arial";
    context.fillText("RAILA ODINGA INTERNATIONAL STADIUM", 70, 365);
    context.font = "700 28px monospace";
    context.fillStyle = "#f2c335";
    context.fillText(ticketCode, 70, 515);
    context.fillStyle = "#ffffff";
    context.font = "700 38px Arial";
    context.fillText(`${selected.name} · ${quantity} ticket${quantity > 1 ? "s" : ""}`, 70, 585);
    context.font = "700 30px Arial";
    context.fillText(`Name: ${form.buyerName}`, 70, 640);
    context.font = "28px Arial";
    context.fillStyle = "#d7d7d7";
    context.fillText(`Order ${orderCode}`, 70, 700);
    context.fillText(`Total paid ${formatKes(total)}`, 70, 750);
    context.fillText("Scan to verify this ticket", 70, 800);
    context.fillStyle = "#ffffff";
    context.fillRect(70, 860, 340, 340);
    context.drawImage(qrImage, 100, 890, 280, 280);
    context.fillStyle = "#d7d7d7";
    context.font = "24px monospace";
    context.fillText("DIGITAL ENTRY TICKET", 520, 970);
    context.fillText("Verified after M-Pesa callback", 520, 1020);
    const url = canvas.toDataURL("image/png");
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `talanta-tix-${ticketCode}.png`;
    anchor.click();
  };

  return (
    <div className="site-shell lean-site">
      <header className="site-header lean-header">
        <div className="header-inner">
          <button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Talanta Tix home">
            <TicketMark small />
            <span>TALANTA <em>TIX</em></span>
          </button>
          <nav className={`main-nav ${mobileOpen ? "main-nav-open" : ""}`}>
            <button onClick={scrollToTickets}>Tickets</button>
            <a href="mailto:vipertechs@outlook.com">Contact</a>
          </nav>
          <Button className="header-cta" onClick={scrollToTickets}>Buy tickets <ArrowUpRight size={16} /></Button>
          <button className="mobile-menu" onClick={() => setMobileOpen(value => !value)} aria-label="Toggle menu">
            {mobileOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="lean-hero">
          <div className="lean-hero-glow" aria-hidden="true" />
          <div className="lean-hero-inner page-width">
            <div className="lean-hero-copy">
              <div className="reference-kicker">RAILA ODINGA INTERNATIONAL STADIUM<br /><span>AT TALANTA SPORTS CITY</span><small>NAIROBI · KENYA</small></div>
              <h1>BAYERN<br />MUNICH <b>VS</b><br /><span>AJAX</span></h1>
              <div className="lean-date">5TH JANUARY 2027</div>
              <div className="hero-countdown"><span>Match starts in</span><CountdownDigits value={matchCountdown} includeDays /></div>
              <p>EARLY BIRD TICKETS FROM KSh 500</p>
              <button className="hero-buy" onClick={scrollToTickets}>Get tickets <ArrowUpRight size={18} /></button>
            </div>
            <figure className="lean-match-art">
              <img src="/assets/bayern-ajax-match.webp" alt="Bayern Munich versus Ajax match artwork" />
            </figure>
          </div>
          <div className="flash-ribbon"><span>FLASH SALE</span><strong>Early birds from KSh 500</strong><div className="flash-countdown"><small>Ends in</small><CountdownDigits value={saleCountdown} /></div><small>Valid till {saleDeadline}</small></div>
        </section>

        <section className="lean-tickets page-width" id="tickets">
          <div className="tickets-topline">
            <div><span className="section-eyebrow">Tickets on sale now</span><h2>Pick your<br /><em>seat.</em></h2></div>
            <div className="match-countdown-card"><span>COUNTDOWN TO MATCH</span><CountdownDigits value={matchCountdown} includeDays /></div>
            <div className="sale-note"><strong>EARLY BIRD · KSh 500</strong><span>Limited allocation · valid till {saleDeadline}</span></div>
          </div>
          <div className="lean-ticket-layout">
            <div className="ticket-list">
              {ticketOptions.map(ticket => (
                <button key={ticket.id} className={`ticket-option ${selectedId === ticket.id ? "ticket-option-selected" : ""}`} onClick={() => setSelectedId(ticket.id)}>
                  <span className={`ticket-badge ticket-badge-${ticket.accent}`}><Ticket size={17} /></span>
                  <span className="ticket-details"><span className="ticket-tag">{ticket.tag}</span><strong>{ticket.name}</strong><small>{ticket.note}</small></span>
                  <span className="ticket-price"><small>KSh</small>{ticket.price.toLocaleString("en-KE")}<span className="availability"><span /> Available</span></span>
                  <span className={`radio-mark ${selectedId === ticket.id ? "radio-mark-on" : ""}`}>{selectedId === ticket.id && <Check size={13} />}</span>
                </button>
              ))}
              <p className="lean-footnote">Limited flash-sale allocation. Final seat allocation and event terms are set by the authorized organizer.</p>
            </div>
            <aside className="order-card lean-order-card">
              <div className="order-card-top"><span className="order-label">Your ticket</span><span className="order-counter">01</span></div>
              <div className="order-ticket-visual"><div className="stub-notch stub-notch-left" /><div><span className="mini-label">TALANTA TIX / MATCHDAY</span><strong>{selected.name}</strong><span className="order-date">05 JAN 2027 · NAIROBI</span></div><TicketMark /></div>
              <div className="quantity-row"><span>Quantity</span><div className="quantity-control"><button onClick={() => updateQuantity(quantity - 1)} aria-label="Decrease quantity"><Minus size={15} /></button><strong>{quantity.toString().padStart(2, "0")}</strong><button onClick={() => updateQuantity(quantity + 1)} aria-label="Increase quantity"><Plus size={15} /></button></div></div>
              <div className="summary-lines"><div><span>{selected.name} × {quantity}</span><strong>{formatKes(subtotal)}</strong></div><div><span>Service fee <small>4%</small></span><strong>{formatKes(serviceFee)}</strong></div></div>
              <div className="total-row"><span>Total</span><strong>{formatKes(total)}</strong></div>
              <Button className="checkout-button" onClick={() => setCheckoutOpen(true)}>Pay <ArrowUpRight size={17} /></Button>
              <div className="secure-line"><LockKeyhole size={13} /> Secure M-Pesa checkout</div>
            </aside>
          </div>
        </section>
      </main>

      <footer className="lean-footer">
        <div className="page-width lean-footer-inner"><span>Talanta Tix · Bayern Munich vs Ajax</span><span className="footer-contact"><a href="mailto:vipertechs@outlook.com"><Mail size={14} /> vipertechs@outlook.com</a><a href="tel:+254713443577"><Phone size={14} /> 0713 443 577</a></span></div>
      </footer>

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) resetCheckout(); }}>
          <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <button className="modal-close" onClick={resetCheckout} aria-label="Close checkout"><X size={19} /></button>
            {paymentState === "idle" || paymentState === "starting" || paymentState === "failed" ? <>
              <div className="modal-kicker"><span className="eyebrow"><span className="eyebrow-line dark" /> Secure checkout</span><LockKeyhole size={18} /></div>
              <h2 id="checkout-title">Pay for your <em>ticket.</em></h2>
              <p className="modal-intro">We’ll send an M-Pesa prompt to the number you enter. Never share your M-Pesa PIN with anyone.</p>
              <div className="modal-order-line"><span>{selected.name} × {quantity}</span><strong>{formatKes(total)}</strong></div>
              <form onSubmit={startPayment} className="checkout-form">
                <label>Full name<input required minLength={2} value={form.buyerName} onChange={event => setForm({ ...form, buyerName: event.target.value })} placeholder="e.g. Amina Otieno" /></label>
                <label>Email for your receipt<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
                <label>M-Pesa phone number<div className="phone-input"><span>+254</span><input required inputMode="tel" value={form.phone.replace(/^\+?254/, "")} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="712 345 678" /></div><small>Use a Safaricom number registered for M-Pesa.</small></label>
                {paymentState === "failed" && <div className="form-error"><AlertCircle size={16} /> {paymentMessage}</div>}
                <Button type="submit" className="checkout-button payment-submit-button" disabled={paymentState === "starting"}>{paymentState === "starting" ? "Processing…" : "Pay"}<ArrowUpRight size={17} /></Button>
              </form>
              <div className="modal-footnote"><ShieldCheck size={14} /> Daraja credentials stay on the server. Confirmation comes from the Safaricom callback.</div>
            </> : paymentState === "pending" ? <div className="payment-state payment-pending"><div className="state-icon"><Smartphone size={28} /></div><div className="eyebrow"><span className="eyebrow-line dark" /> Waiting for approval</div><h2>Check your <em>phone.</em></h2><p>{paymentMessage}</p><div className="pending-loader"><span /><span /><span /></div><div className="order-reference">Order reference <strong>{orderCode}</strong></div><button className="quiet-button" onClick={() => { setPaymentState("cancelled"); setPaymentMessage("The prompt was stopped on this screen. If you already approved it, wait for the callback or contact support with your reference."); }}>I didn’t approve</button></div> : paymentState === "paid" ? <div className="payment-state payment-success"><div className="state-icon success-icon"><Check size={30} /></div><div className="eyebrow"><span className="eyebrow-line dark" /> Payment confirmed</div><h2>See you at <em>Talanta.</em></h2><p>{paymentMessage}</p><div className="digital-ticket"><img className="ticket-match-image" src="/assets/bayern-ajax-match.webp" alt="Bayern Munich versus Ajax match artwork" /><span className="mini-label">DIGITAL TICKET</span><strong>{ticketCode}</strong><span className="ticket-buyer-name">Name: {form.buyerName}</span><span>{selected.name} · {quantity} ticket{quantity > 1 ? "s" : ""}</span><span>05 JAN 2027 · NAIROBI</span>{ticketQr && <img className="ticket-qr" src={ticketQr} alt="QR code for ticket verification" />}</div><div className="order-reference">Order reference <strong>{orderCode}</strong></div><div className="ticket-actions"><Button className="checkout-button" onClick={downloadTicket} disabled={!ticketQr}><Download size={16} /> Download PNG ticket</Button>{ticketToken && <a className="ticket-verify-link" href={`/api/tickets/${ticketToken}`} target="_blank" rel="noreferrer">Verify ticket</a>}</div><Button className="quiet-button" onClick={resetCheckout}>Done</Button></div> : <div className="payment-state payment-cancelled"><div className="state-icon"><X size={28} /></div><div className="eyebrow"><span className="eyebrow-line dark" /> Payment not completed</div><h2>Try again.</h2><p>{paymentMessage}</p><Button className="checkout-button" onClick={() => { setPaymentState("idle"); setPaymentMessage(""); setIdempotencyKey(makeIdempotencyKey()); }}>Try again</Button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
