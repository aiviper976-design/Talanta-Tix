# TODO

## Match landing page and verified event context
- [x] Present FC Bayern Munich vs AFC Ajax as the featured match, with the verified date of 5 January 2027 and venue name Raila Odinga International Stadium at Talanta Sports City, Nairobi.
- [x] Explain that the page is an independent ticketing interface and retain a prominent pre-launch notice that final seat maps, exact kickoff time, official organizer identity, and official sales authorization must be confirmed before production launch.

## Ticket selection and order summary
- [x] Provide configurable ticket categories with clearly labeled prices, availability labels, quantities, subtotals, and a transparent total.
- [x] Provide a responsive order summary and a clear path from selection to checkout.

## Daraja STK Push checkout
- [x] Collect purchaser name, email, and Kenyan M-Pesa phone number with client and server-side validation.
- [x] Initiate Daraja STK Push only on the server using protected credentials and never expose credentials in client code.
- [x] Receive the Daraja callback, reconcile the result against the correct order, and make callback state authoritative over browser-side state.
- [x] Show pending, success, cancellation, timeout, and failure states, including safe status polling for delayed callbacks.
- [x] Show a unique order reference and digital ticket details after successful payment.

## Support, terms, and launch readiness
- [x] Include contact/help guidance and clear cancellation, transfer, refund, and entry requirements.
- [x] Keep public ticket prices, seat map, kickoff time, organizer, and sales-authorization content configurable until officially confirmed.
- [ ] Add production Daraja environment values, public HTTPS callback URL, official ticket inventory, and final event policies before accepting live payments.
