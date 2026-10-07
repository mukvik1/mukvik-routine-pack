# Customer accounts and protected fulfillment (draft branch)

The public Sites storefront and Railway backend are separate deployments. This branch adds **server-side account and order infrastructure only**; no production migration or payment-mode switch is triggered by opening the branch. The old crypto API remains untouched until the migration has been tested and explicitly switched off.

## Before activation

1. Provision PostgreSQL and run `db/001_commerce.sql` against staging, then production only after staging tests pass. Keep backups and verify that repeated migration runs are harmless.
2. Create a private Drive folder that is **not** shared with anyone who has a link; copy original ZIPs into it. Share that folder only with a service account as reader. Its JSON credentials live in server-side `GOOGLE_SERVICE_ACCOUNT_JSON`, never in git/Sites source. Assign individual original files to product codes in server-side `COMMERCE_FILES_JSON`. Existing shared links must stay available for prior purchasers until their access is migrated, then remove their public permissions. Do not use the public folder as a protected source.
3. Configure SMTP and `ADMIN_EMAIL` to a verified owner mailbox. Registration is passwordless: requesting an email link creates a customer record; opening the link in /account/ signs in. Only that exact verified email gets admin routes. Don't infer this address from a connected Google account.
4. Set `WEB_ORIGIN`, deploy backend staging and the matching bilingual account/cart UI in the Sites source. The standalone legacy GitHub `web/` directory is not the current Sites frontend.
5. Only after email, migrations, file mapping and cross-origin UI work, set `COMMERCE_ENABLED=true` and roll out. An unconfigured service fails closed. Keep monobank disabled until merchant credentials exist.

## Intended API

POST /api/v2/auth/start {email} sends a sign-in link, POST /api/v2/auth/redeem {ticket} exchanges the one-time link for a bearer session; POST /api/v2/auth/logout revokes it.
GET /api/v2/catalog and GET/PUT /api/v2/cart expose allowed products; POST /api/v2/orders {idempotencyKey} creates a fixed-price order from the saved cart. GET /api/v2/me lists orders/entitlements. GET /api/v2/admin/orders and POST /api/v2/admin/orders/:id/approve are owner-only. POST /api/v2/orders/:id/files/:product/:index/ticket issues a one-use 60-second download ticket to an entitled logged-in buyer; GET /api/v2/download/:ticket streams a private Drive original. Users can request a replacement ticket if a download breaks.

Never show a success state or grant entitlements based on a redirect. Monobank confirmation must be a separate signed callback, an API status recheck, order amount/currency/reference validation, and one atomic idempotent entitlement transaction.

## Manual approval

The seller checks an actual payment out of band via Contact Mukvik, then approves the order in the admin panel. Database order row locking and unique entitlements make retries safe. A notification outbox sends the buyer a sign-in link and can retry a failed email. The email does not include a public file address.

## Security checks before rollout

Test simultaneous double approval, unverified login, expired/redeemed challenge and ticket, unauthorized account, wrong product, cancelled/refunded order, Drive permissions, retry after interrupted download, protected originals inaccessible by direct URL, both locales, mobile layout, and unchanged Contact Mukvik checkout. Verify legacy URLs already issued to buyers and migrate them intentionally. Run lint, tests, build, migration rollback rehearsal.
