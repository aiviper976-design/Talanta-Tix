# Talanta Tix — lean ticket storefront plan

## Product scope
Talanta Tix is a responsive ticket-first storefront for FC Bayern Munich vs AFC Ajax on 5 January 2027 at Raila Odinga International Stadium, Talanta Sports City, Nairobi. The redesign removes the long editorial and launch-promotion copy and focuses the page on the match, ticket choices, order summary, and secure M-Pesa checkout.

## Implementation approach
- Frontend: React + TypeScript single-page storefront with a compact hero, ticket selector, order card, and checkout modal.
- Backend: Keep the existing Express Daraja STK Push initiation, callback reconciliation, order polling, and digital ticket confirmation unchanged.
- Pricing: Show the supplied four-tier catalog: Level 3 Section 416 at KSh 2,500 marked sold out, Level 3 Section 415 at KSh 3,500, Level 3 Sections 414 & 412 at KSh 5,000, and Level 2 Sections 207–214 at KSh 20,000. Remove flash-sale banners, deadlines, and Early Bird copy.
- Trust and contact: Retain only short, necessary checkout safety copy and the configured contact email/phone in the footer.
- Assets: Reuse the user-supplied Bayern–Ajax artwork and stadium aerial image. Do not copy source code or proprietary assets from the external reference site.

## Project structure
- `client/src/pages/Home.tsx` — lean match hero, ticket options with a sold-out state, order summary, checkout, payment states, and compact footer.
- `client/src/index.css` — reference-inspired dark hero, compact ticket list with sold-out styling, responsive layout, and checkout styling.
- `server/payments.ts` — order store and Daraja integration.
- `server/_core/index.ts` — Express route registration and JSON API fallback.
- `drizzle/schema.ts` — order persistence model.
- `public/manus-routes.json` — managed route declaration.

## Design

### Reference cues
The public Talanta Sports City page uses a sparse event landing page: dark full-bleed hero, oversized match/date typography, crest treatment, one strong CTA, and a minimal footer. This implementation uses those high-level layout cues without copying code, text, or proprietary assets.

### Chosen direction: Minimal stadium-event storefront
- **Design Movement:** civic sports announcement meets premium match poster.
- **Core Principles:** immediate event recognition, one dominant ticket CTA, low copy density, and visible price/status hierarchy.
- **Color Philosophy:** black and stadium-night imagery establish event focus; yellow and red signal matchday energy and ticket status; ivory keeps ticket selection readable.
- **Layout Paradigm:** full-bleed hero followed directly by a two-column ticket list and sticky order card; no long-scroll marketing sections.
- **Signature Elements:** oversized uppercase match title, match countdown, and ticket-stub order card.
- **Interaction Philosophy:** select an available ticket, see the KSh total update, press Pay, and follow the existing server-verified M-Pesa states.
- **Animation:** restrained hover lift on CTAs and ticket rows; sold-out tickets remain visibly static and non-interactive.
- **Typography System:** Space Grotesk for the match title and controls with IBM Plex Mono for dates, price metadata, and payment references.
- **Brand Essence:** the fastest route from Nairobi to a seat; direct, electric, minimal.
- **Brand Voice:** “Pick your seat.” and “Secure your matchday pass.”
- **Wordmark & Logo:** compact ticket-notch monogram paired with the TALANTA TIX wordmark.
- **Signature Brand Color:** stadium yellow `#f2c335`.
