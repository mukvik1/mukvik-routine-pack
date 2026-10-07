# Customer accounts and protected fulfillment (draft branch)

The public Sites storefront and Railway backend are separate deployments. This branch adds the server-side account and order infrastructure plus a bilingual standalone /account/ portal hosted by Railway when commerce is enabled. The current Sites storefront still needs its purchase links wired into this portal; no production migration or payment-mode switch is triggered by opening this branch. The old crypto API remains untouched until the migration has been tested and explicitly switched off.

## Before activation

1. Provision PostgreSQL and run `db/001_commerce.sql` against staging, then production only after staging tests pass. Keep backups and verify that repeated migration runs are harmless.
2. Create a private Drive folder that is **not** shared with anyone who has a link; copy original ZIPs into it. Share that folder only with a service account as reader. Its JSON credentials live in server-side `GOOGLE_SERVICE_ACCOUNT_JSON`, never in git/Sites source. Assign individual original files to product codes in server-side `COMMERCE_FILES_JSON`. Existing shared links must stay available for prior purchasers until their access is migrated, then remove their public permissions. Do not use the public folder as a protected source.
3. Configure SMTP and `ADMIN_EMAIL` to a verified owner mailbox (the owner has specified an address, already stored as a Railway variable). Registration is passwordless: requesting an email link creates a customer record; opening the link in /account/ signs in. Only that exact verified email gets admin routes. Don't infer this address from a connected Google account.
4. Set `WEB_ORIGIN`, deploy backend staging and the matching bilingual account/cart UI in the Sites source. The standalone legacy GitHub `web/` directory is not the current Sites frontend.
5. Only after email, migrations, file mapping and UI testing, set `COMMERCE_ENABLED=true` and roll out. If email sign-in links target the standalone Railway portal, set `WEB_ORIGIN` to its verified HTTPS origin. If they target Sites, install the matching /account/ page into the Sites source first. The current Sites source is distinct from this GitHub repository. An unconfigured service fails closed. Keep monobank disabled until merchant credentials exist.

## Intended API

POST /api/v2/auth/start {email} sends a sign-in link, POST /api/v2/auth/redeem {ticket} exchanges the one-time link for a bearer session; POST /api/v2/auth/logout revokes it.
GET /api/v2/catalog and GET/PUT /api/v2/cart expose allowed products; POST /api/v2/orders {idempotencyKey} creates a fixed-price order from the saved cart. GET /api/v2/me lists orders/entitlements. GET /api/v2/admin/orders and POST /api/v2/admin/orders/:id/approve are owner-only. POST /api/v2/orders/:id/files/:product/:index/ticket issues a one-use 60-second download ticket to an entitled logged-in buyer; GET /api/v2/download/:ticket streams a private Drive original. Users can request a replacement ticket if a download breaks.

Never show a success state or grant entitlements based on a redirect. Monobank confirmation must be a separate signed callback, an API status recheck, order amount/currency/reference validation, and one atomic idempotent entitlement transaction.

## Gmail delivery on Railway

The connected Gmail account matches the verified admin address `mukvik1@gmail.com`. The connected ChatGPT Gmail grant cannot be transferred to the Railway server. Use `MAIL_PROVIDER=gmail_api` (HTTPS) on Railway, with Gmail API enabled, an OAuth client with the narrow `gmail.send` scope, and an offline refresh token authorized by that mailbox. Put `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`, and `GMAIL_OAUTH_REFRESH_TOKEN` only in Railway secret variables. Never paste them into git, frontend source or an email. Send a real test message only after the authorization is configured and the sign-in page is reachable. Google's external app Testing mode expires offline consent after seven days; confirm an approved long-lived OAuth setup before customer launch. The optional SMTP path needs a Google app password and a Railway plan that permits outbound SMTP.

## Manual approval

The seller checks an actual payment out of band via Contact Mukvik, then approves the order in the admin panel. Database order row locking and unique entitlements make retries safe. A notification outbox sends the buyer a sign-in link and can retry a failed email. The email does not include a public file address.

## Security checks before rollout

Test simultaneous double approval, unverified login, expired/redeemed challenge and ticket, unauthorized account, wrong product, cancelled/refunded order, Drive permissions, retry after interrupted download, protected originals inaccessible by direct URL, both locales, mobile layout, and unchanged Contact Mukvik checkout. Verify legacy URLs already issued to buyers and migrate them intentionally. Run lint, tests, build, migration rollback rehearsal.

## Current operational state

A Railway PostgreSQL service and a private Google Drive staging folder have been created; approved product originals were copied privately and file IDs configured server-side. The previously issued public Drive URLs remain open until existing buyers are migrated. A Drive service account with reader permission on the private folder, SMTP credentials, production migration, and the Sites storefront link are still required. Never publish the server-side file IDs or service-account credentials in frontend HTML.
