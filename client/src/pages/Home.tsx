import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
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

type PaymentState =
  | "idle"
  | "starting"
  | "pending"
  | "paid"
  | "cancelled"
  | "failed";
type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
};
type Tier = {
  id: string;
  name: string;
  price: number;
  gate: string;
  zone: string;
  tag: string;
  description: string;
  icon: string;
  status: string;
  accent: string;
  soldOut?: boolean;
};

const matchStartsAt = "2027-01-05T19:00:00+03:00";
const tiers: Tier[] = [
  {
    id: "section-416",
    name: "Level 3 · Section 416",
    price: 2500,
    gate: "South Stand",
    zone: "Level 3 · Section 416",
    tag: "Level 3",
    description: "Section 416 · This ticket allocation is sold out",
    icon: "○",
    status: "Sold Out",
    accent: "red",
    soldOut: true,
  },
  {
    id: "section-415",
    name: "Level 3 · Section 415",
    price: 3500,
    gate: "North Stand",
    zone: "Level 3 · Section 415",
    tag: "Level 3",
    description: "Section 415 · General admission seating",
    icon: "◉",
    status: "Available",
    accent: "cream",
  },
  {
    id: "sections-414-412",
    name: "Level 3 · Sections 414 & 412",
    price: 5000,
    gate: "East Stand",
    zone: "Level 3 · Sections 414 & 412",
    tag: "Level 3",
    description: "Sections 414 & 412 · Prime level 3 seating",
    icon: "◆",
    status: "Available",
    accent: "gold",
  },
  {
    id: "sections-207-214",
    name: "Level 2 · Sections 207–214",
    price: 20000,
    gate: "West Grandstand",
    zone: "Level 2 · Sections 207–214",
    tag: "Level 2",
    description: "Sections 207–214 · Premium lower-level seating",
    icon: "✦",
    status: "Available",
    accent: "gold",
  },
];
const formatKes = (value: number) => `KSh ${value.toLocaleString("en-KE")}`;
const getCountdown = (target: string): Countdown => {
  const total = Math.max(0, new Date(target).getTime() - Date.now());
  const seconds = Math.floor(total / 1000);
  return {
    total,
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
};
const pad = (n: number) => n.toString().padStart(2, "0");
const makeIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function Countdown({ value }: { value: Countdown }) {
  return (
    <div className="countdown-grid">
      {[
        [value.days, "Days"],
        [value.hours, "Hours"],
        [value.minutes, "Mins"],
        [value.seconds, "Secs"],
      ].map(([n, label]) => (
        <div className="countdown-unit" key={label as string}>
          <span className="unit-num">{pad(n as number)}</span>
          <span className="unit-text">{label}</span>
        </div>
      ))}
    </div>
  );
}
function TicketMark() {
  return (
    <span className="ticket-mark" aria-hidden="true">
      <span className="ticket-mark-star">✦</span>
    </span>
  );
}

export default function Home() {
  const [selectedId, setSelectedId] = useState("section-415");
  const [quantity, setQuantity] = useState(1);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [ticketToken, setTicketToken] = useState<string | null>(null);
  const [ticketQr, setTicketQr] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [form, setForm] = useState({ buyerName: "", email: "", phone: "" });
  const [matchCountdown, setMatchCountdown] = useState(() =>
    getCountdown(matchStartsAt)
  );
  const [mapZone, setMapZone] = useState("north");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const selected = useMemo(
    () => tiers.find(t => t.id === selectedId) ?? tiers[0],
    [selectedId]
  );
  const subtotal = selected.price * quantity;
  const serviceFee = Math.round(subtotal * 0.04);
  const total = subtotal + serviceFee;
  const mapInfo = {
    north: [
      "North Stand",
      "Level 3 · Section 415",
      "North Stand",
      "Level 3 seating along the northern side",
    ],
    south: [
      "South Stand",
      "Level 3 · Section 416",
      "South Stand",
      "This allocation is currently sold out",
    ],
    east: [
      "East Stand",
      "Level 3 · Sections 414 & 412",
      "East Stand",
      "Prime level 3 seating along the eastern side",
    ],
    west: [
      "West Grandstand",
      "Level 2 · Sections 207–214",
      "West Grandstand",
      "Premium level 2 seating and hospitality",
    ],
  }[mapZone] ?? [
    "North Stand",
    "Level 3 · Section 415",
    "North Stand",
    "Level 3 seating along the northern side",
  ];

  useEffect(() => {
    document.title =
      "FC Bayern Munich vs AFC Ajax Tickets | Talanta Sports City Nairobi | Talanta Tix";
  }, []);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("resume");
    if (!token) return;
    let active = true;
    fetch(`/api/orders/resume/${encodeURIComponent(token)}`)
      .then(async response => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(
            body.error || "This purchase link is no longer available."
          );
        return body;
      })
      .then(body => {
        if (!active) return;
        const tier = tiers.find(item => item.name === body.category);
        if (tier) setSelectedId(tier.id);
        setQuantity(Math.min(10, Math.max(1, Number(body.quantity) || 1)));
        setForm({
          buyerName: body.buyerName || "",
          email: body.email || "",
          phone: body.phone || "",
        });
        setIdempotencyKey(makeIdempotencyKey());
        setCheckoutOpen(true);
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      })
      .catch(error => {
        if (!active) return;
        setCheckoutOpen(true);
        setPaymentState("failed");
        setPaymentMessage(
          error instanceof Error
            ? error.message
            : "This purchase link is no longer available."
        );
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setMatchCountdown(getCountdown(matchStartsAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
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
          setPaymentMessage(
            body.receipt
              ? `M-Pesa receipt ${body.receipt}`
              : "Your payment has been confirmed."
          );
          window.clearInterval(timer);
        } else if (body.status === "cancelled") {
          setPaymentState("cancelled");
          setPaymentMessage(
            "The M-Pesa prompt was cancelled. You can try again when ready."
          );
          window.clearInterval(timer);
        } else if (["failed", "expired"].includes(body.status)) {
          setPaymentState("failed");
          setPaymentMessage(
            "The payment did not complete. Please try again or contact support."
          );
          window.clearInterval(timer);
        }
      } catch {
        /* next poll retries */
      }
    }, 3000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(timer);
      setPaymentState(current => (current === "pending" ? "failed" : current));
      setPaymentMessage(
        current =>
          current ||
          "We have not received a confirmation yet. Check M-Pesa and contact support with your order reference."
      );
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
    QRCode.toDataURL(`${window.location.origin}/api/tickets/${ticketToken}`, {
      width: 260,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    })
      .then(url => {
        if (active) setTicketQr(url);
      })
      .catch(() => setTicketQr(null));
    return () => {
      active = false;
    };
  }, [paymentState, ticketToken]);

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };
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
        body: JSON.stringify({
          ...form,
          category: selected.name,
          quantity,
          amount: total,
          idempotencyKey,
        }),
      });
      const contentType = response.headers.get("content-type") || "";
      const body = contentType.includes("application/json")
        ? await response.json()
        : {
            error: `The payment service returned an unexpected response (${response.status}). Refresh the page and try again.`,
          };
      if (!response.ok)
        throw new Error(body.error || "We could not start the payment prompt.");
      setOrderCode(body.orderCode);
      setTicketToken(body.ticketToken ?? null);
      if (body.status === "paid") {
        setTicketCode(body.ticketCode ?? null);
        setPaymentState("paid");
        setPaymentMessage(
          body.receipt
            ? `M-Pesa receipt ${body.receipt}`
            : "Your payment has been confirmed."
        );
      } else {
        setPaymentState("pending");
        setPaymentMessage(
          "Check your phone and enter your M-Pesa PIN to approve the ticket order."
        );
      }
    } catch (error) {
      setPaymentState("failed");
      setPaymentMessage(
        error instanceof Error
          ? error.message
          : "We could not start the payment prompt."
      );
    }
  };
  const lookupTicket = async (event: React.FormEvent) => {
    event.preventDefault();
    setLookupResult("Checking ticket…");
    try {
      const response = await fetch(`/api/orders/${lookupCode.trim()}`);
      const body = await response.json();
      setLookupResult(
        response.ok
          ? body.status === "paid"
            ? `Verified: ${body.ticketCode} · ${body.category} · ${body.quantity} ticket(s) · ${formatKes(body.amount)}`
            : `Order status: ${body.status}`
          : body.error || "Ticket not found."
      );
    } catch {
      setLookupResult("Unable to reach ticket verification right now.");
    }
  };
  const downloadTicket = async () => {
    if (!ticketQr || !ticketCode || !orderCode) return;
    const load = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
    const [matchImage, qrImage] = await Promise.all([
      load("/assets/bayern-ajax-match.webp"),
      load(ticketQr),
    ]);
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 1500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 1200, 1500);
    const scale = Math.max(1200 / matchImage.width, 420 / matchImage.height);
    const mw = matchImage.width * scale;
    const mh = matchImage.height * scale;
    ctx.drawImage(matchImage, (1200 - mw) / 2, (420 - mh) / 2, mw, mh);
    ctx.fillStyle = "rgba(17,17,17,.56)";
    ctx.fillRect(0, 0, 1200, 420);
    ctx.fillStyle = "#f2c335";
    ctx.fillRect(0, 0, 1200, 14);
    ctx.fillStyle = "#fff";
    ctx.font = "800 58px Arial";
    ctx.fillText("BAYERN MUNICH VS AJAX", 70, 260);
    ctx.font = "700 28px monospace";
    ctx.fillStyle = "#f2c335";
    ctx.fillText("5 JANUARY 2027 · NAIROBI", 70, 320);
    ctx.fillStyle = "#fff";
    ctx.font = "700 30px Arial";
    ctx.fillText("RAILA ODINGA INTERNATIONAL STADIUM", 70, 365);
    ctx.font = "700 28px monospace";
    ctx.fillStyle = "#f2c335";
    ctx.fillText(ticketCode, 70, 515);
    ctx.fillStyle = "#fff";
    ctx.font = "700 38px Arial";
    ctx.fillText(
      `${selected.name} · ${quantity} ticket${quantity > 1 ? "s" : ""}`,
      70,
      585
    );
    ctx.font = "700 30px Arial";
    ctx.fillText(`Name: ${form.buyerName}`, 70, 640);
    ctx.font = "28px Arial";
    ctx.fillStyle = "#d7d7d7";
    ctx.fillText(`Order ${orderCode}`, 70, 700);
    ctx.fillText(`Total paid ${formatKes(total)}`, 70, 750);
    ctx.fillText("Scan to verify this ticket", 70, 800);
    ctx.fillStyle = "#fff";
    ctx.fillRect(70, 860, 340, 340);
    ctx.drawImage(qrImage, 100, 890, 280, 280);
    ctx.fillStyle = "#d7d7d7";
    ctx.font = "24px monospace";
    ctx.fillText("DIGITAL ENTRY TICKET", 520, 970);
    ctx.fillText("Verified after M-Pesa callback", 520, 1020);
    const anchor = document.createElement("a");
    anchor.href = canvas.toDataURL("image/png");
    anchor.download = `talanta-tix-${ticketCode}.png`;
    anchor.click();
  };

  return (
    <div className="reference-site">
      <a className="skip-link" href="#tickets">
        Skip to ticket selection
      </a>
      <header className="site-header">
        <div className="page-width header-inner">
          <button className="wordmark" onClick={() => scrollTo("top")}>
            <TicketMark />
            <span>
              TALANTA <em>TIX</em>
            </span>
          </button>
          <nav className={mobileOpen ? "main-nav main-nav-open" : "main-nav"}>
            <a href="#top" onClick={() => setMobileOpen(false)}>
              Match
            </a>
            <a href="#tickets" onClick={() => setMobileOpen(false)}>
              Tickets
            </a>
            <a href="#stadium-map" onClick={() => setMobileOpen(false)}>
              Stadium Map
            </a>
            <a href="#schedule" onClick={() => setMobileOpen(false)}>
              Schedule
            </a>
            <a href="#venue" onClick={() => setMobileOpen(false)}>
              Venue
            </a>
            <a href="#faq" onClick={() => setMobileOpen(false)}>
              FAQ
            </a>
            <button
              className="nav-lookup-btn"
              onClick={() => setLookupOpen(true)}
            >
              Lookup Ticket
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="btn btn-primary header-cta"
              onClick={() => scrollTo("tickets")}
            >
              Buy Tickets <span>↗</span>
            </button>
            <button
              className="mobile-toggle"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="Toggle navigation"
            >
              <Menu />
            </button>
          </div>
        </div>
      </header>
      <main id="top">
        <section className="hero-section">
          <div className="hero-background-art" />
          <div className="hero-overlay-glow" />
          <div className="page-width hero-container">
            <div className="hero-content">
              <div className="venue-kicker">
                <span>Raila Odinga International Stadium</span>
                <span>Talanta Sports City · Nairobi, Kenya</span>
                <span className="event-badge">
                  Official International Matchday
                </span>
              </div>
              <div className="team-matchup-header">
                <div className="team-chip bayern-chip">
                  <span className="team-dot red" />
                  <strong>FC Bayern Munich</strong>
                  <small>Bundesliga</small>
                </div>
                <b className="matchup-vs">VS</b>
                <div className="team-chip ajax-chip">
                  <span className="team-dot white" />
                  <strong>AFC Ajax</strong>
                  <small>Eredivisie</small>
                </div>
              </div>
              <h1 className="hero-headline">
                BAYERN
                <br />
                MUNICH <b>VS</b>
                <br />
                <span>AJAX</span>
              </h1>
              <div className="match-meta-box">
                <div>
                  <small>MATCH DATE</small>
                  <strong>5TH JANUARY 2027</strong>
                </div>
                <i>|</i>
                <div>
                  <small>KICKOFF</small>
                  <strong>19:00 EAT (GATES 14:00)</strong>
                </div>
              </div>
              <div className="countdown-widget">
                <span>COUNTDOWN TO KICK-OFF</span>
                <Countdown value={matchCountdown} />
              </div>
              <div className="hero-cta-group">
                <button
                  className="btn btn-hero"
                  onClick={() => scrollTo("tickets")}
                >
                  Select Your Seat <span>↗</span>
                </button>
                <button
                  className="btn btn-outline"
                  onClick={() => scrollTo("stadium-map")}
                >
                  Explore Stadium Map
                </button>
              </div>
            </div>
            <figure className="hero-visual">
              <img
                src="/assets/bayern-ajax-match.webp"
                alt="FC Bayern Munich versus AFC Ajax official match poster"
              />
              <figcaption>
                Historic European Clash · Raila Odinga International Stadium
                2027
              </figcaption>
            </figure>
          </div>
        </section>
        <section className="overview-section">
          <div className="page-width overview-grid">
            <div>
              <span className="section-tag">Historical African Tour</span>
              <h2>
                European Giants Collide at Nairobi's 60,000-Seater Talanta
                Stadium
              </h2>
              <p>
                Football history arrives in East Africa. Multiple-time UEFA
                Champions League winners <strong>FC Bayern Munich</strong> face
                Dutch powerhouse <strong>AFC Ajax</strong> at the
                state-of-the-art{" "}
                <strong>Raila Odinga International Stadium</strong> in Talanta
                Sports City, Nairobi.
              </p>
              <p>
                With official ticketing powered by <strong>Talanta Tix</strong>{" "}
                and instantaneous{" "}
                <strong>Safaricom M-Pesa Daraja STK Push</strong> checkout,
                secure your official digital match entry in seconds with zero
                paper hassles and guaranteed entry validation.
              </p>
            </div>
            <div className="overview-stats">
              {[
                ["60,000", "Stadium Capacity"],
                ["100%", "M-Pesa Verified"],
                ["KSh 3,500", "Lowest Available"],
                ["5 JAN '27", "Matchday Date"],
              ].map(([n, l]) => (
                <div className="stat-card" key={l}>
                  <strong>{n}</strong>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="tickets-section" id="tickets">
          <div className="page-width">
            <div className="section-topline">
              <div>
                <span className="section-tag">Official Matchday Passes</span>
                <h2>
                  Choose Your <em>Seat.</em>
                </h2>
                <p>
                  Select your tier, specify quantity, and confirm instantly with
                  Safaricom M-Pesa STK Push.
                </p>
              </div>
            </div>
            <div className="ticket-booking-layout">
              <div className="ticket-tier-list">
                {tiers.map((tier, index) => (
                  <article
                    key={tier.id}
                    className={`ticket-card ${selectedId === tier.id ? "active" : ""} ${tier.soldOut ? "sold-out" : ""}`}
                    onClick={() => {
                      if (!tier.soldOut) setSelectedId(tier.id);
                    }}
                    role="radio"
                    aria-checked={selectedId === tier.id}
                    aria-disabled={tier.soldOut}
                    tabIndex={tier.soldOut ? -1 : 0}
                  >
                    <div className="ticket-card-header">
                      <div className={`tier-badge-icon badge-${tier.accent}`}>
                        {tier.icon}
                      </div>
                      <div className="tier-info">
                        <span
                          className={`tier-tag ${index > 2 ? "tag-gold" : ""}`}
                        >
                          {tier.tag}
                        </span>
                        <h3>{tier.name}</h3>
                        <p>{tier.description}</p>
                      </div>
                    </div>
                    <div className="ticket-card-meta">
                      <div className="tier-pricing">
                        <span>KSh</span>
                        <strong>{tier.price.toLocaleString("en-KE")}</strong>
                        <small
                          className={`availability-pill ${tier.soldOut ? "sold-out" : tier.status === "Limited Seats" ? "limited" : "in-stock"}`}
                        >
                          <i />
                          {tier.status}
                        </small>
                      </div>
                      <div className="radio-indicator">
                        {selectedId === tier.id && "✓"}
                      </div>
                    </div>
                  </article>
                ))}
                <p className="ticket-note">
                  Final seat allocation and event terms are set by the
                  authorized organizer.
                </p>
              </div>
              <aside className="order-summary">
                <span className="summary-kicker">ORDER SUMMARY</span>
                <span className="summary-step">STEP 01/02</span>
                <div className="summary-ticket">
                  <span>TALANTA TIX · OFFICIAL PASS</span>
                  <strong>{selected.name}</strong>
                  <small>FC BAYERN vs AJAX</small>
                  <small>05 JAN 2027 · TALANTA STADIUM NAIROBI</small>
                  <b>Assigned Entry: {selected.gate}</b>
                  <TicketMark />
                </div>
                <div className="quantity-row">
                  <span>Ticket Quantity</span>
                  <div>
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    >
                      <Minus />
                    </button>
                    <strong>{quantity.toString().padStart(2, "0")}</strong>
                    <button
                      onClick={() => setQuantity(Math.min(10, quantity + 1))}
                    >
                      <Plus />
                    </button>
                  </div>
                </div>
                <div className="breakdown">
                  <div>
                    <span>
                      {selected.name} × {quantity}
                    </span>
                    <strong>{formatKes(subtotal)}</strong>
                  </div>
                  <div>
                    <span>Service & M-Pesa Fee (4%)</span>
                    <strong>{formatKes(serviceFee)}</strong>
                  </div>
                </div>
                <div className="summary-total">
                  <span>Total Payable</span>
                  <strong>{formatKes(total)}</strong>
                </div>
                <button
                  className="btn btn-primary pay-button"
                  disabled={selected.soldOut}
                  onClick={() => setCheckoutOpen(true)}
                >
                  Proceed to M-Pesa STK Push <ArrowUpRight />
                </button>
                <small className="secure-line">
                  <LockKeyhole /> Instant STK prompt · 100% Verified Entry
                  Ticket
                </small>
              </aside>
            </div>
          </div>
        </section>
        <section className="stadium-map-section" id="stadium-map">
          <div className="page-width">
            <span className="section-tag">Venue Visualizer</span>
            <h2>Raila Odinga International Stadium Map</h2>
            <p>
              Click on any stadium stand to see the view, entrance gate, and
              corresponding ticket tier.
            </p>
            <div className="map-layout">
              <div className="stadium-map-art">
                <div
                  className="stand-zone zone-north"
                  onClick={() => setMapZone("north")}
                  data-active={mapZone === "north"}
                >
                  NORTH STAND
                  <br />
                  <small>(SECTION 415)</small>
                </div>
                <div
                  className="stand-zone zone-south"
                  onClick={() => setMapZone("south")}
                  data-active={mapZone === "south"}
                >
                  SOUTH STAND
                  <br />
                  <small>(SECTION 416 · SOLD OUT)</small>
                </div>
                <div
                  className="stand-zone zone-east"
                  onClick={() => setMapZone("east")}
                  data-active={mapZone === "east"}
                >
                  EAST STAND
                  <br />
                  <small>(SECTIONS 414 & 412)</small>
                </div>
                <div
                  className="stand-zone zone-west"
                  onClick={() => setMapZone("west")}
                  data-active={mapZone === "west"}
                >
                  WEST GRANDSTAND
                  <br />
                  <small>(LEVEL 2 · SECTIONS 207–214)</small>
                </div>
                <div className="pitch">
                  TALANTA
                  <br />
                  PITCH
                </div>
              </div>
              <div className="map-info">
                <span>SELECTED STAND ZONE</span>
                <h3>{mapInfo[0]}</h3>
                <dl>
                  <div>
                    <dt>Matched Ticket:</dt>
                    <dd>
                      {mapInfo[1]} (
                      {formatKes(
                        tiers.find(t => t.gate === mapInfo[2])?.price ?? 1800
                      )}
                      )
                    </dd>
                  </div>
                  <div>
                    <dt>Assigned Gate:</dt>
                    <dd>{mapInfo[2]}</dd>
                  </div>
                  <div>
                    <dt>Viewing Angle:</dt>
                    <dd>{mapInfo[3]}</dd>
                  </div>
                </dl>
                <button
                  className="btn btn-outline"
                  disabled={mapZone === "south"}
                  onClick={() => {
                    const id =
                      mapZone === "south"
                        ? "section-416"
                        : mapZone === "east"
                          ? "sections-414-412"
                          : mapZone === "west"
                            ? "sections-207-214"
                            : "section-415";
                    const tier = tiers.find(item => item.id === id);
                    if (!tier?.soldOut) setSelectedId(id);
                    scrollTo("tickets");
                  }}
                >
                  {mapZone === "south" ? "Sold Out" : "Select This Tier →"}
                </button>
              </div>
            </div>
          </div>
        </section>
        <section className="schedule-section" id="schedule">
          <div className="page-width">
            <span className="section-tag">Matchday Programme</span>
            <h2>Tuesday, 5th January 2027 Schedule</h2>
            <p>
              Plan your matchday arrival early to enjoy pre-match festivities
              and avoid security gate bottlenecks.
            </p>
            <div className="timeline">
              {[
                [
                  "14:00 EAT",
                  "GATES OPEN",
                  "Fan Zone & Gates Open",
                  "All stadium turnstiles, food villages, partner brand booths, and official club merchandise stores open.",
                ],
                [
                  "16:30 EAT",
                  "PRE-MATCH SHOW",
                  "Talanta Academy Football Showcase",
                  "East African youth academy all-star curtain raiser match and musical performances by top Kenyan artists.",
                ],
                [
                  "18:15 EAT",
                  "TEAM WARM-UP",
                  "FC Bayern & Ajax Pitch Arrival",
                  "First team squads take the pitch for official warm-ups, team anthems, and tactical drills.",
                ],
                [
                  "19:00 EAT",
                  "KICKOFF",
                  "FC Bayern Munich vs AFC Ajax",
                  "The historic 90-minute clash begins under the state-of-the-art Talanta stadium LED floodlights.",
                ],
                [
                  "20:45 EAT",
                  "CEREMONY",
                  "Trophy Presentation & Fan Lap",
                  "Talanta International Cup trophy presentation, player lap of honor, and celebratory fireworks.",
                ],
              ].map(([time, label, title, text]) => (
                <article className="timeline-card" key={time}>
                  <strong>{time}</strong>
                  <span>{label}</span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="venue-section" id="venue">
          <div className="page-width venue-grid">
            <div>
              <span className="section-tag">Directions & Stadium Guide</span>
              <h2>Raila Odinga International Stadium</h2>
              <p>
                Located in Talanta Sports City, Nairobi — built to FIFA & CAF
                Grade-A international standards.
              </p>
              <img
                src="/assets/talanta-stadium-aerial.webp"
                alt="Raila Odinga International Stadium aerial view"
              />
            </div>
            <div className="transport-list">
              <h3>Getting to Talanta Sports City</h3>
              {[
                [
                  "🚗",
                  "By Car / Nairobi Expressway",
                  "Take the Southern Bypass interchange directly into Jamhuri corridor. Dedicated event signage directs you to North & South parking zones.",
                ],
                [
                  "🚌",
                  "Public Transport & Matchday Shuttles",
                  "Special direct shuttle buses will operate from Nairobi CBD directly to the Talanta Sports City transport plaza from 13:30 onwards.",
                ],
                [
                  "🅿️",
                  "Stadium Parking Areas",
                  "Pre-booked parking available. VIP Presidential Suite ticket holders receive guaranteed VIP parking stickers included with their pass.",
                ],
              ].map(([icon, title, text]) => (
                <div className="transport-item" key={title}>
                  <span>{icon}</span>
                  <div>
                    <strong>{title}</strong>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
              <h3>Entry Guidelines & Prohibited Items</h3>
              <p>
                Bring your downloaded PNG digital ticket with scannable QR code
                on your smartphone. No glass bottles, canned drinks, or
                professional telephoto lens cameras without media accreditation.
                Children aged 3 and above require their own valid ticket.
              </p>
            </div>
          </div>
        </section>
        <section className="faq-section" id="faq">
          <div className="page-width">
            <span className="section-tag">Frequently Asked Questions</span>
            <h2>Everything You Need to Know</h2>
            <p>
              Find quick answers about tickets, M-Pesa STK push payments, entry
              gates, and venue amenities.
            </p>
            <div className="faq-accordion">
              {[
                [
                  "How do I receive my ticket after M-Pesa payment?",
                  "Immediately after entering your M-Pesa PIN and receiving Safaricom's confirmation SMS, the checkout screen updates to display your Digital Match Entry Ticket with a unique verification token, scannable QR code, and receipt number.",
                ],
                [
                  "What happens if the M-Pesa STK Push prompt does not pop up on my phone?",
                  "Confirm that your phone number is registered for M-Pesa, check your network connection, and try again. Never share your M-Pesa PIN with anyone.",
                ],
                [
                  "Can I purchase multiple tickets in one order?",
                  "Yes. Use the quantity controls in the order summary to purchase up to 10 tickets in one checkout.",
                ],
                [
                  "How do I get to Raila Odinga International Stadium?",
                  "The stadium is within Talanta Sports City, Nairobi. Matchday shuttles and event signage will guide fans from Nairobi CBD and the Southern Bypass.",
                ],
                [
                  "Are tickets refundable or transferable?",
                  "Review the authorized organizer's final event terms before purchase. Ticket validity is checked using the unique QR code and token.",
                ],
              ].map(([q, a], i) => (
                <div className="faq-item" key={q}>
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span>{q}</span>
                    <ChevronDown className={openFaq === i ? "rotate" : ""} />
                  </button>
                  {openFaq === i && <p>{a}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="lookup-section" id="verify">
          <div className="page-width lookup-card">
            <div>
              <span className="section-tag">Security & Validation</span>
              <h2>Already Bought a Ticket? Verify Your Pass</h2>
              <p>
                Enter your Talanta Tix order reference to verify authentication
                and check your digital entry ticket.
              </p>
            </div>
            <form onSubmit={lookupTicket}>
              <label>
                Order Reference
                <input
                  value={lookupCode}
                  onChange={e => setLookupCode(e.target.value)}
                  placeholder="TT-XXXXX-XXXXX"
                  required
                />
              </label>
              <button className="btn btn-primary" type="submit">
                Check Ticket →
              </button>
              {lookupResult && (
                <div className="lookup-result">{lookupResult}</div>
              )}
            </form>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="page-width footer-grid">
          <div>
            <button className="wordmark" onClick={() => scrollTo("top")}>
              <TicketMark />
              <span>
                TALANTA <em>TIX</em>
              </span>
            </button>
            <p>
              Official ticketing platform for FC Bayern Munich vs AFC Ajax at
              Raila Odinga International Stadium, Talanta Sports City, Nairobi.
            </p>
          </div>
          <div>
            <strong>Matchday</strong>
            <a href="#tickets">Tickets</a>
            <a href="#stadium-map">Stadium Map</a>
            <a href="#schedule">Schedule</a>
          </div>
          <div>
            <strong>Contact</strong>
            <a href="mailto:vipertechs@outlook.com">
              <Mail /> vipertechs@outlook.com
            </a>
            <a href="tel:+254713443577">
              <Phone /> 0713 443 577
            </a>
          </div>
        </div>
        <div className="page-width footer-bottom">
          © 2026 Talanta Tix · Safaricom Daraja Verified · All ticket terms
          subject to authorized organizer confirmation.
        </div>
      </footer>
      {checkoutOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) resetCheckout();
          }}
        >
          <div className="checkout-modal" role="dialog" aria-modal="true">
            <button className="modal-close" onClick={resetCheckout}>
              <X />
            </button>
            {["idle", "starting", "failed"].includes(paymentState) ? (
              <>
                <div className="modal-kicker">
                  <span>🔒 SECURE M-PESA CHECKOUT</span>
                  <small>Safaricom Daraja API</small>
                </div>
                <h2>
                  Pay for your <em>ticket.</em>
                </h2>
                <p>
                  Enter your name and Safaricom phone number to receive an
                  instant M-Pesa STK prompt.
                </p>
                <div className="modal-order-line">
                  <span>
                    {selected.name} × {quantity}
                  </span>
                  <strong>{formatKes(total)}</strong>
                </div>
                <form onSubmit={startPayment} className="checkout-form">
                  <label>
                    Full name
                    <input
                      required
                      minLength={2}
                      value={form.buyerName}
                      onChange={e =>
                        setForm({ ...form, buyerName: e.target.value })
                      }
                      placeholder="e.g. Amina Otieno"
                    />
                  </label>
                  <label>
                    Email for your receipt
                    <input
                      required
                      type="email"
                      value={form.email}
                      onChange={e =>
                        setForm({ ...form, email: e.target.value })
                      }
                      placeholder="you@example.com"
                    />
                  </label>
                  <label>
                    M-Pesa phone number
                    <div className="phone-input">
                      <span>+254</span>
                      <input
                        required
                        inputMode="tel"
                        value={form.phone.replace(/^\+?254/, "")}
                        onChange={e =>
                          setForm({ ...form, phone: e.target.value })
                        }
                        placeholder="712 345 678"
                      />
                    </div>
                  </label>
                  {paymentState === "failed" && (
                    <div className="form-error">
                      <AlertCircle /> {paymentMessage}
                    </div>
                  )}
                  <button
                    className="btn btn-primary pay-button"
                    type="submit"
                    disabled={paymentState === "starting"}
                  >
                    {paymentState === "starting" ? "Processing…" : "Pay"}{" "}
                    <ArrowUpRight />
                  </button>
                </form>
                <small className="modal-footnote">
                  <ShieldCheck /> Daraja credentials stay on the server.
                  Confirmation comes from the Safaricom callback.
                </small>
              </>
            ) : paymentState === "pending" ? (
              <div className="payment-state">
                <div className="state-icon">
                  <Smartphone />
                </div>
                <span>WAITING FOR APPROVAL</span>
                <h2>
                  Check your <em>phone.</em>
                </h2>
                <p>{paymentMessage}</p>
                <div className="pending-loader">
                  <i />
                  <i />
                  <i />
                </div>
                <strong>Order reference {orderCode}</strong>
                <button
                  className="text-button"
                  onClick={() => {
                    setPaymentState("cancelled");
                    setPaymentMessage("The prompt was stopped on this screen.");
                  }}
                >
                  I didn't approve
                </button>
              </div>
            ) : paymentState === "paid" ? (
              <div className="payment-state">
                <div className="state-icon success">
                  <Check />
                </div>
                <span>PAYMENT CONFIRMED</span>
                <h2>
                  See you at <em>Talanta.</em>
                </h2>
                <p>{paymentMessage}</p>
                <div className="digital-ticket-card">
                  <span>DIGITAL MATCH ENTRY</span>
                  <strong>{ticketCode}</strong>
                  <b>Name: {form.buyerName}</b>
                  <small>
                    {selected.name} · {quantity} ticket(s) · 05 JAN 2027
                  </small>
                  {ticketQr && (
                    <img src={ticketQr} alt="Ticket verification QR code" />
                  )}
                </div>
                <button
                  className="btn btn-primary pay-button"
                  onClick={downloadTicket}
                  disabled={!ticketQr}
                >
                  <Download /> Download PNG Ticket
                </button>
                {ticketToken && (
                  <a
                    className="verify-link"
                    href={`/api/tickets/${ticketToken}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify ticket
                  </a>
                )}
                <button className="text-button" onClick={resetCheckout}>
                  Done
                </button>
              </div>
            ) : (
              <div className="payment-state">
                <div className="state-icon">
                  <X />
                </div>
                <span>PAYMENT NOT COMPLETED</span>
                <h2>Try again.</h2>
                <p>{paymentMessage}</p>
                <button
                  className="btn btn-primary pay-button"
                  onClick={() => setPaymentState("idle")}
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {lookupOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={e => {
            if (e.target === e.currentTarget) setLookupOpen(false);
          }}
        >
          <div className="checkout-modal lookup-modal">
            <button
              className="modal-close"
              onClick={() => setLookupOpen(false)}
            >
              <X />
            </button>
            <span className="section-tag">SECURITY & VALIDATION</span>
            <h2>
              Verify Your <em>Pass.</em>
            </h2>
            <p>Enter your TT- order reference to check its status.</p>
            <form
              onSubmit={e => {
                setLookupOpen(false);
                lookupTicket(e);
              }}
              className="checkout-form"
            >
              <input
                value={lookupCode}
                onChange={e => setLookupCode(e.target.value)}
                placeholder="TT-XXXXX-XXXXX"
                required
              />
              <button className="btn btn-primary pay-button">
                Check Ticket →
              </button>
            </form>
            {lookupResult && (
              <div className="lookup-result">{lookupResult}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
