
## Standalone Daraja library
- [x] Refactor Daraja STK Push and callback reconciliation into a standalone adapter with no game, room, player, ticket, or fixed-price references.
- [x] Support generic KES minor-unit requests, Kenyan phone normalization, OAuth token caching, PayBill/Buy Goods routing, provider request IDs, and callback amount/phone reconciliation.
- [x] Add comprehensive unit tests covering disabled configuration, validation, OAuth/STK payloads, token reuse, PayBill and Buy Goods modes, provider errors, malformed callbacks, successful callbacks, failed callbacks, mismatch rejection, and timestamp formatting.
