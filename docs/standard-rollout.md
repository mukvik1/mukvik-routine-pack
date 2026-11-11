# Standard rollout

Railway's existing commerce migration command creates the Standard tables. Keep the ordinary `MONOBANK_TOKEN` intact. Set the separate recurring integration token as `MONOBANK_SUBSCRIPTION_TOKEN` in the Routine Pack service.

- Token present, `STANDARD_SUBSCRIPTIONS_ENABLED` unset: only the verified site admin can access the pilot from Routines → Standard. The public plan stays Coming Soon and pack sales continue.
- `STANDARD_SUBSCRIPTIONS_ENABLED=true`: open Standard to customers after the bank test has passed.
- `STANDARD_SUBSCRIPTION_ONLY=true`: with public Standard enabled, stop new one-time orders and invoice creation, hide the Packs and cart links, and redirect the old collection and purchase pages to Routines. Previously approved downloads remain available. If checkout must be paused after public launch, do not disable access/status for existing subscribers; plan a separate checkout gate.

Before opening public subscriptions, verify the actual Monobank redirect and bank status after a controlled first charge, expiration/renewal on a provider test account, cancellation, and a ZIP download from each of the six original routines. Verify that the provider's summary and start date correctly represent paid entitlement after failed charges and refunds; the implementation intentionally does not grant access from the redirect or callback body. Test the old buyer's downloads separately. Review the subscription terms against the seller's existing public offer and refund policy.

The advertised USD price is $15 per month, presented as a fixed UAH 690 recurring charge before payment at the existing store rate (46 UAH/USD). Do not change the amount for existing subscriptions. The manifests use hashes of the existing private Drive IDs; do not publish Drive URLs or share credentials.
