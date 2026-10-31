
## Ticketing reliability and entry experience
- [x] Payment-status owner notifications cover STK initiation, paid, cancelled, failed, and expired transitions with Daraja IDs and receipts.
- [x] Pending orders expire after 15 minutes through database-backed timestamps and a guarded cleanup sweep.
- [x] Checkout requests require a client idempotency key and return the existing order instead of starting duplicate prompts.
- [x] Order records retain the purchase-attempt audit trail, payment timestamps, provider IDs, result codes, and secure ticket tokens.
- [x] Checkout attempts are rate-limited per client IP and normalized M-Pesa phone number.
- [x] Paid confirmation exposes only verified ticket data and the Daraja receipt after callback reconciliation.
- [x] Paid customers receive a QR-backed downloadable HTML ticket and a server verification link.
