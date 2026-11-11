# Standard rollout

Railway's existing commerce migration command creates the Standard tables. Keep the ordinary `MONOBANK_TOKEN` intact. Set the separate recurring integration token as `MONOBANK_SUBSCRIPTION_TOKEN` in the Routine Pack service.

- Token present and validated Drive mapping: Standard is shown publicly by default. Set `STANDARD_SUBSCRIPTIONS_ENABLED=pilot` for admin-only checkout.
- `STANDARD_SUBSCRIPTIONS_ENABLED=false`: keeps Standard checkout hidden.
- New one-time orders are closed. Former Packs links go to Routines, and prior purchases remain downloadable from the account. If checkout must be paused after launch, plan a separate checkout gate to avoid disabling access/status for existing subscribers.

For live payment verification, check the actual Monobank redirect and bank status after a controlled first charge, expiration/renewal on a provider test account, cancellation, and a ZIP download from each of the six original routines. Verify that the provider's summary and start date correctly represent paid entitlement after failed charges and refunds; the implementation intentionally does not grant access from the redirect or callback body. Test the old buyer's downloads separately. Review the subscription terms against the seller's existing public offer and refund policy.

The advertised USD price is $15 per month, presented as a fixed UAH 690 recurring charge before payment at the existing store rate (46 UAH/USD). Do not change the amount for existing subscriptions. The manifests match the existing private Drive IDs or unique filenames in the validated Pack configuration; do not publish Drive URLs or share credentials.
