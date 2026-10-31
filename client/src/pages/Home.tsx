import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  CircleCheck,
  Clock3,
  ExternalLink,
  Info,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  Minus,
  Phone,
  Plus,
  ShieldCheck,
  Smartphone,
  Ticket,
  X,
} from "lucide-react";
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

const ticketOptions: TicketOption[] = [
  {
    id: "north-stand",
    name: "North Stand",
    price: 1800,
    tag: "Matchday",
    note: "Upper tier · full-pitch view",
    accent: "orange",
  },
  {
    id: "east-stand",
    name: "East Stand",
    price: 3200,
    tag: "Closer to the action",
    note: "Lower tier · halfway line views",
    accent: "cream",
  },
  {
    id: "premium-sideline",
    name: "Premium Sideline",
    price: 7500,
    tag: "Best available",
    note: "Premium seating · hospitality details TBC",
    accent: "gold",
  },
];

const formatKes = (value: number) => `KES ${value.toLocaleString("en-KE")}`;

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
  const [paymentMessage, setPaymentMessage] = useState("");
  const [form, setForm] = useState({ buyerName: "", email: "", phone: "" });

  const selected = ticketOptions.find(ticket => ticket.id === selectedId) ?? ticketOptions[0];
  const subtotal = selected.price * quantity;
  const serviceFee = Math.round(subtotal * 0.04);
  const total = subtotal + serviceFee;

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const updateQuantity = (next: number) => setQuantity(Math.min(10, Math.max(1, next)));

  const resetCheckout = () => {
    setCheckoutOpen(false);
    setPaymentState("idle");
    setPaymentMessage("");
    setOrderCode(null);
    setTicketCode(null);
  };

  const startPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPaymentState("starting");
    setPaymentMessage("");
    try {
      const response = await fetch("/api/orders/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, category: selected.name, quantity, amount: total }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "We could not start the payment prompt.");
      setOrderCode(body.orderCode);
      setPaymentState("pending");
      setPaymentMessage("Check your phone and enter your M-Pesa PIN to approve the ticket order.");
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

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="header-inner">
          <button className="wordmark" onClick={() => scrollTo("top")} aria-label="Talanta Tix home">
            <TicketMark small />
            <span>TALANTA <em>TIX</em></span>
          </button>
          <nav className={`main-nav ${mobileOpen ? "main-nav-open" : ""}`}>
            <button onClick={() => scrollTo("match")}>The match</button>
            <button onClick={() => scrollTo("tickets")}>Tickets</button>
            <button onClick={() => scrollTo("venue")}>Venue</button>
            <button onClick={() => scrollTo("help")}>Help</button>
          </nav>
          <div className="header-actions">
            <span className="header-status"><span className="status-dot" /> Sales preview</span>
            <Button className="header-cta" onClick={() => scrollTo("tickets")}>Find a seat <ArrowUpRight size={16} /></Button>
          </div>
          <button className="mobile-menu" onClick={() => setMobileOpen(value => !value)} aria-label="Toggle menu">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero-section" id="match">
          <div className="hero-grid-lines" aria-hidden="true" />
          <div className="hero-content page-width">
            <div className="hero-copy">
              <div className="eyebrow light"><span className="eyebrow-line" /> Nairobi · Opening night 2027</div>
              <h1>Your seat to<br /><span>the opening night.</span></h1>
              <p className="hero-intro">Two European giants. One brand-new stadium. A matchday built for the whole city.</p>
              <div className="hero-matchup">
                <div className="club-card"><span className="club-initial bayern">F</span><span>FC Bayern</span></div>
                <span className="versus">VS</span>
                <div className="club-card"><span className="club-initial ajax">A</span><span>Ajax</span></div>
              </div>
              <button className="text-link light-link" onClick={() => scrollTo("tickets")}>Choose your ticket <ArrowUpRight size={16} /></button>
            </div>
            <div className="hero-date-rail">
              <div className="rail-label">Match date</div>
              <div className="date-number">05</div>
              <div className="date-month">JAN <span>2027</span></div>
              <div className="rail-rule" />
              <div className="rail-venue"><MapPin size={14} /> Raila Odinga International Stadium<br /><span>Talanta Sports City · Nairobi</span></div>
            </div>
          </div>
          <div className="hero-foot page-width">
            <span>Official event information, ticket sales and M-Pesa checkout in one place.</span>
            <span className="scroll-cue">Scroll to explore <ChevronDown size={16} /></span>
          </div>
        </section>

        <section className="trust-strip">
          <div className="page-width trust-grid">
            <div><ShieldCheck size={19} /><span><strong>Secure checkout</strong><small>Daraja STK Push, server verified</small></span></div>
            <div><CalendarDays size={19} /><span><strong>5 January 2027</strong><small>Match date confirmed by club announcement</small></span></div>
            <div><MapPin size={19} /><span><strong>Talanta Sports City</strong><small>Jamhuri Grounds · off Ngong Road</small></span></div>
          </div>
        </section>

        <section className="notice-section page-width">
          <div className="launch-notice"><Info size={20} /><div><strong>Launch-readiness notice</strong><p>This storefront is ready for configuration, but it should not accept live money until the organizer confirms the final seat map, exact ticket prices, kickoff time, official sales authorization, and refund policy. The ticket tiers below are clearly marked as preview values.</p></div><span className="notice-code">PRE-LAUNCH</span></div>
        </section>

        <section className="tickets-section page-width" id="tickets">
          <div className="section-heading split-heading">
            <div><div className="eyebrow"><span className="eyebrow-line dark" /> Select your view</div><h2>Make the<br /><em>matchday yours.</em></h2></div>
            <p>Choose a ticket tier, confirm your details, then approve the payment prompt on your M-Pesa phone. Tickets are issued after the Daraja callback confirms payment.</p>
          </div>
          <div className="ticket-layout">
            <div className="ticket-list">
              {ticketOptions.map(ticket => (
                <button key={ticket.id} className={`ticket-option ${selectedId === ticket.id ? "ticket-option-selected" : ""}`} onClick={() => setSelectedId(ticket.id)}>
                  <span className={`ticket-badge ticket-badge-${ticket.accent}`}><Ticket size={18} /></span>
                  <span className="ticket-details"><span className="ticket-tag">{ticket.tag}</span><strong>{ticket.name}</strong><small>{ticket.note}</small></span>
                  <span className="ticket-price"><small>Preview from</small>{formatKes(ticket.price)}<span className="availability"><span /> Available</span></span>
                  <span className={`radio-mark ${selectedId === ticket.id ? "radio-mark-on" : ""}`}>{selectedId === ticket.id && <Check size={13} />}</span>
                </button>
              ))}
              <div className="price-footnote"><Info size={14} /> Preview prices only — final amounts, seat allocation and taxes/fees are configurable by the authorized organizer.</div>
            </div>
            <aside className="order-card">
              <div className="order-card-top"><span className="eyebrow"><span className="eyebrow-line dark" /> Your order</span><span className="order-counter">01</span></div>
              <div className="order-ticket-visual"><div className="stub-notch stub-notch-left" /><div><span className="mini-label">TALANTA TIX / MATCHDAY</span><strong>{selected.name}</strong><span className="order-date">05 JAN 2027 · NAIROBI</span></div><TicketMark /></div>
              <div className="quantity-row"><span>Quantity</span><div className="quantity-control"><button onClick={() => updateQuantity(quantity - 1)} aria-label="Decrease quantity"><Minus size={15} /></button><strong>{quantity.toString().padStart(2, "0")}</strong><button onClick={() => updateQuantity(quantity + 1)} aria-label="Increase quantity"><Plus size={15} /></button></div></div>
              <div className="summary-lines"><div><span>{selected.name} × {quantity}</span><strong>{formatKes(subtotal)}</strong></div><div><span>Service fee <small>4%</small></span><strong>{formatKes(serviceFee)}</strong></div></div>
              <div className="total-row"><span>Total</span><strong>{formatKes(total)}</strong></div>
              <Button className="checkout-button" onClick={() => setCheckoutOpen(true)}>Continue to checkout <ArrowUpRight size={17} /></Button>
              <div className="secure-line"><LockKeyhole size={13} /> Your payment is handled by Safaricom M-Pesa</div>
            </aside>
          </div>
        </section>

        <section className="venue-section page-width" id="venue">
          <div className="venue-card">
            <div className="venue-card-copy"><div className="eyebrow light"><span className="eyebrow-line" /> The new home of Kenyan sport</div><h2>Raila Odinga<br /><em>International Stadium.</em></h2><p>A 60,000-seat national stadium at Talanta Sports City, off Ngong Road in Nairobi. This match is announced as the ceremonial opening of the new venue.</p><div className="venue-meta"><span><MapPin size={15} /> Jamhuri Grounds, Nairobi</span><span><Ticket size={15} /> 60,000-seat venue</span></div><a className="text-link light-link" href="https://www.google.com/maps/search/?api=1&query=Jamhuri+Grounds+Nairobi" target="_blank" rel="noreferrer">Open venue map <ExternalLink size={15} /></a></div>
            <div className="venue-mark" aria-hidden="true"><div className="venue-ring ring-one" /><div className="venue-ring ring-two" /><div className="venue-star">✦</div><span>TSC<br />NBO</span></div>
          </div>
        </section>

        <section className="details-section page-width">
          <div className="detail-column"><span className="detail-number">01</span><CalendarDays size={22} /><h3>A night in the diary</h3><p>Tuesday, 5 January 2027. Exact kickoff time is still a configurable production field and must be confirmed by the authorized organizer.</p></div>
          <div className="detail-column"><span className="detail-number">02</span><Smartphone size={22} /><h3>Pay on your phone</h3><p>Enter your Kenyan M-Pesa number. Daraja sends a secure prompt to your phone and the site waits for the server-side callback.</p></div>
          <div className="detail-column"><span className="detail-number">03</span><CircleCheck size={22} /><h3>Enter with confidence</h3><p>After payment is confirmed, your order reference and digital ticket code appear in the confirmation view.</p></div>
        </section>

        <section className="help-section page-width" id="help">
          <div className="help-heading"><div className="eyebrow"><span className="eyebrow-line dark" /> Before you buy</div><h2>Good to<br /><em>know.</em></h2></div>
          <div className="faq-list">
            <details open><summary>When will I receive my ticket? <ChevronDown size={18} /></summary><p>Once the Daraja callback confirms the payment, the order confirmation shows your unique reference and digital ticket code. The organizer may later connect this to email or a dedicated ticket wallet.</p></details>
            <details><summary>Can I cancel or transfer a ticket? <ChevronDown size={18} /></summary><p>Cancellation, transfer, and refund rules are controlled by the authorized organizer and must be published before live sales. This preview does not promise a refund policy that has not been confirmed.</p></details>
            <details><summary>What do I need at the gate? <ChevronDown size={18} /></summary><p>Bring the digital ticket code and the phone used for purchase. Final entry rules, ID requirements, gate opening times, and prohibited items remain subject to official organizer confirmation.</p></details>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="page-width footer-top"><div className="footer-brand"><button className="wordmark footer-wordmark" onClick={() => scrollTo("top")}><TicketMark small /><span>TALANTA <em>TIX</em></span></button><p>Your route to matchday in Nairobi.</p></div><div className="footer-links"><a href="mailto:hello@talantatix.example"><Mail size={15} /> hello@talantatix.example</a><a href="tel:+254700000000"><Phone size={15} /> +254 700 000 000</a></div><div className="footer-source"><span className="mini-label">EVENT SOURCE</span><a href="https://fcbayern.com/en/news/2026/10/special-match-in-nairobi-fc-bayern-to-take-on-ajax" target="_blank" rel="noreferrer">FC Bayern announcement <ExternalLink size={13} /></a></div></div>
        <div className="page-width footer-bottom"><span>© 2026 Talanta Tix · Independent ticketing interface</span><span>Final event terms and organizer details TBC</span></div>
      </footer>

      {checkoutOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) resetCheckout(); }}>
          <div className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <button className="modal-close" onClick={resetCheckout} aria-label="Close checkout"><X size={19} /></button>
            {paymentState === "idle" || paymentState === "starting" || paymentState === "failed" ? <>
              <div className="modal-kicker"><span className="eyebrow"><span className="eyebrow-line dark" /> Secure checkout</span><LockKeyhole size={18} /></div>
              <h2 id="checkout-title">Almost <em>there.</em></h2>
              <p className="modal-intro">We’ll send an M-Pesa prompt to the number you enter. Never share your M-Pesa PIN with anyone.</p>
              <div className="modal-order-line"><span>{selected.name} × {quantity}</span><strong>{formatKes(total)}</strong></div>
              <form onSubmit={startPayment} className="checkout-form">
                <label>Full name<input required minLength={2} value={form.buyerName} onChange={event => setForm({ ...form, buyerName: event.target.value })} placeholder="e.g. Amina Otieno" /></label>
                <label>Email for your receipt<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
                <label>M-Pesa phone number<div className="phone-input"><span>+254</span><input required inputMode="tel" value={form.phone.replace(/^\+?254/, "")} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="712 345 678" /></div><small>Use a Safaricom number registered for M-Pesa.</small></label>
                {paymentState === "failed" && <div className="form-error"><AlertCircle size={16} /> {paymentMessage}</div>}
                <Button type="submit" className="checkout-button" disabled={paymentState === "starting"}>{paymentState === "starting" ? "Starting M-Pesa prompt…" : "Send M-Pesa prompt"}<ArrowUpRight size={17} /></Button>
              </form>
              <div className="modal-footnote"><ShieldCheck size={14} /> Daraja credentials stay on the server. Payment confirmation comes from the Safaricom callback, not the browser.</div>
            </> : paymentState === "pending" ? <div className="payment-state payment-pending"><div className="state-icon"><Smartphone size={28} /></div><div className="eyebrow"><span className="eyebrow-line dark" /> Waiting for approval</div><h2>Check your <em>phone.</em></h2><p>{paymentMessage}</p><div className="pending-loader"><span /><span /><span /></div><div className="order-reference">Order reference <strong>{orderCode}</strong></div><button className="quiet-button" onClick={() => { setPaymentState("cancelled"); setPaymentMessage("The prompt was stopped on this screen. If you already approved it, wait for the callback or contact support with your reference."); }}>I didn’t approve</button></div> : paymentState === "paid" ? <div className="payment-state payment-success"><div className="state-icon success-icon"><Check size={30} /></div><div className="eyebrow"><span className="eyebrow-line dark" /> Payment confirmed</div><h2>See you at <em>Talanta.</em></h2><p>{paymentMessage}</p><div className="digital-ticket"><span className="mini-label">DIGITAL TICKET</span><strong>{ticketCode}</strong><span>{selected.name} · {quantity} ticket{quantity > 1 ? "s" : ""}</span><span>05 JAN 2027 · NAIROBI</span></div><div className="order-reference">Order reference <strong>{orderCode}</strong></div><Button className="checkout-button" onClick={resetCheckout}>Done</Button></div> : <div className="payment-state payment-cancelled"><div className="state-icon"><X size={28} /></div><div className="eyebrow"><span className="eyebrow-line dark" /> Payment not completed</div><h2>Still time to <em>join us.</em></h2><p>{paymentMessage}</p><Button className="checkout-button" onClick={() => { setPaymentState("idle"); setPaymentMessage(""); }}>Try again</Button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
