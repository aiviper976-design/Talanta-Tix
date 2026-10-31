# TODO

## Lean match storefront
- [x] Present a sparse, reference-inspired match hero for Bayern Munich vs Ajax with the 5 January 2027 date, Raila Odinga International Stadium, supplied match artwork, crests, and one primary ticket CTA.
- [x] Remove the long venue, trust-strip, launch-notice, details, and FAQ sections so the page focuses on ticket selection and checkout.
- [x] Keep the footer compact while retaining the configured contact email and phone links.

## Early Bird flash sale
- [x] Add an Early Bird ticket option priced at KSh 500.
- [x] Mark Early Bird as a limited flash-sale allocation and display validity through 25 November 2026 in the hero ribbon, ticket list, and ticket metadata.
- [x] Keep North Stand, East Stand, and Premium Sideline available as regular KSh ticket tiers without incorrectly labeling them as flash-sale tickets.

## Ticket selection and order summary
- [x] Provide ticket categories with KSh prices, availability labels, quantities, subtotals, service fee, and a transparent total.
- [x] Provide a responsive order summary and a clear Pay action from selection to checkout.

## Daraja STK Push checkout
- [x] Collect purchaser name, email, and Kenyan M-Pesa phone number with client and server-side validation.
- [x] Initiate Daraja STK Push only on the server using protected credentials and never expose credentials in client code.
- [x] Receive the Daraja callback, reconcile the result against the correct order, and make callback state authoritative over browser-side state.
- [x] Show pending, success, cancellation, timeout, and failure states, including safe status polling for delayed callbacks.
- [x] Show a unique order reference and digital ticket details after successful payment.

## Production readiness
- [ ] Confirm the production Daraja callback value is the full public HTTPS endpoint ending in `/api/daraja/callback`.
- [ ] Confirm official ticket inventory, organizer authorization, final seat map, kickoff time, and final event policies before accepting live sales.
