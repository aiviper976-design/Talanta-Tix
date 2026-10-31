# Talanta Tix — implementation plan

## Product scope
Talanta Tix is a responsive event-ticketing storefront for the FC Bayern Munich vs AFC Ajax match on 5 January 2027 at Raila Odinga International Stadium at Talanta Sports City, Nairobi. The site presents verified event facts, makes unknown production details explicit, lets a buyer select ticket categories, and prepares a secure M-Pesa Daraja STK Push checkout with callback reconciliation and digital order confirmation.

## Implementation approach
- Frontend: React + TypeScript + Tailwind, single-page purchase experience with anchor navigation and an order drawer/modal.
- Backend: Express routes for STK Push initiation, callback receipt, and order-status polling. Daraja credentials are read only from server-side environment variables.
- Persistence: Drizzle/MySQL `orders` table when the managed database is available. An in-memory fallback keeps Preview usable without pretending a payment succeeded.
- Payments: Daraja OAuth token + Lipa na M-Pesa Online STK Push. The browser never decides payment success; it polls the order-status endpoint while the callback updates the authoritative order state.
- Deployment safeguards: `DARAJA_CALLBACK_URL`, shortcode, passkey, consumer key, and consumer secret remain protected configuration. The UI prominently labels ticket prices, seat map, kickoff time, organizer, and sales authorization as configurable until officially confirmed.

## Project structure
- `client/src/pages/Home.tsx` — landing page, ticket picker, checkout, payment states, help/terms content.
- `client/src/index.css` — visual system and responsive layout.
- `server/payments.ts` — order store, phone normalization, Daraja integration, callback reconciliation.
- `server/_core/index.ts` — Express route registration.
- `drizzle/schema.ts` — `orders` persistence model.
- `public/manus-routes.json` — route manifest for the managed website.

## Design

### Three possible styles
- **Night Matchday / stadium floodlight editorial** — 0.07 probability.
- **Civic modern / red-and-gold public event service** — 0.08 probability.
- **Continental sport-luxury / ink, cream and orange** — 0.06 probability.

### Chosen direction: Night Matchday / stadium floodlight editorial
- **Design Movement:** modern sports editorial with the atmosphere of a floodlit stadium, not a generic fintech checkout.
- **Core Principles:** confident hierarchy, high legibility, visible trust signals, and fast decision-making.
- **Color Philosophy:** deep ink and graphite create match-night focus; warm ivory keeps long-form content readable; orange-red acts as the owned energy color for CTAs and highlights.
- **Layout Paradigm:** asymmetrical split hero with an event rail, followed by generous editorial sections and a sticky ticket summary rather than a centered marketing grid.
- **Signature Elements:** a vertical match rail, oversized numerals for the date, and ticket stubs with perforation-like borders.
- **Interaction Philosophy:** every action confirms what happens next; selected tickets update the summary immediately and checkout makes the payment handoff explicit.
- **Animation:** restrained lift/fade on section entry, pulsing status dot only for pending payment, and no movement that competes with the CTA.
- **Typography System:** Space Grotesk for display/UI with IBM Plex Mono for metadata, references, ticket codes, and status labels.
- **Brand Essence:** the clearest route from Nairobi to matchday; direct, electric, accountable.
- **Brand Voice:** “Your seat to the opening night.” and “Pay on your phone. Enter with a ticket that’s yours.”
- **Wordmark & Logo:** a compact ticket-notch monogram: two opposing cuts around a small floodlight star, paired with the TALANTA TIX wordmark.
- **Signature Brand Color:** signal orange `#ff5a36`, used sparingly so it remains ownable.
