# Routine Pack — consolidated October release (draft, do not deploy)

Source: user instructions from 18–23 October 2026. This branch is separate from main to protect production.

## Visual / UI
- Keep all existing 3D transitions and 3D product cover; remove decorative vinyl record.
- Animate hero background with real video, autoplay muted, looped, dark overlay for text contrast, visible pause control, reduced-motion fallback. Do not replace video references with fabricated media.
- Replace sixth preview poster with an actual still from its corresponding video.
- English default; Українська mandatory; additionally German, Spanish, Thai, Arabic (RTL), Hindi, Italian, Portuguese (Brazil); do not add Chinese. Translate menus, cart, account, checkout, legal text while preserving song titles and Routine Pack brand.
- Responsive desktop two-column composition on Home and Packs, mobile single-column. No 'Coming soon' cards.

## Home copy cleanup
- Retain 'DJ Tools for Real DJs', 'Performance Ready / DJ Routine with Audio Files', Tracklist and Preview, Tutorial Preview, 'See in Action', Watch Performance, 'Full Collection / One Pack, Six Big Moments'.
- Remove the redundant 'Six routines in pack / MP3/video' intro, entire 'Find Your Next Move / Start Here' section, explanatory line below Watch the Performance, redundant 'Pack 1 brings the Performance...' text, and repeated checklist below One Pack, Six Big Moments.
- Remove descriptive labels under videos when redundant; clean logo cutout/transparent background and align footer.
- In Packs remove 'Watch the routines' copy.

## Product & pricing
- ROUTINE PACK VOLUME 1 is the only existing pack, priced at $49. Apply a 20% new-registration welcome discount to this product only: $39.20. Eligibility is based on a newly registered customer account and single-use welcome entitlement, not on adding other products to a cart. Enforce server-side and in the payment provider's final amount; prevent repeat use or account-based abuse. No discount applies to individual routines, Audio Bundle, or any future Volume 2.
- Audio Bundle $4.
- YEAH × LA VIDA ES UN CARNAVAL $4.
- MACARENA × CANDY SHOP $3.
- I KNOW YOU WANT ME × CHANDELIER $2.
- LEVITATION × CAN'T STOP × ROMPE $3.
- NOT LIKE US × CANDY SHOP $2.
- CALM DOWN × CRAZY IN LOVE is one standalone routine product for $1 (not $1 per track), with its own video preview and downloadable files (only after real assets are supplied and access verified).
- Show previews before prices; after Preview All 6 show composition / price; Previous and Next change video in same player.
- 'Get the Pack' without price opens a dedicated product details page, not a pop-up cart.
- Checkout amount and currency must match displayed prices. Merchant charge in UAH if required, with transparent conversion.
- No automatic delivery before authenticated verified provider status 'finished' and matching order, currency and sum. Test Monobank/IPN end-to-end before enabling.

## Free & accounts
- Separate preview video adjacent to each Free routine in list and on its detail page.
- Downloading Free requires completed registration; no direct file URLs exposed before authentication.
- Each preview is its own short file (up to 40 seconds), never a full lesson; EN/UA captions.
- On Instagram trigger 🙌🙌🙌🙌: public reply 'check your direct message', DM with Free routine URL; avoid duplicate replies; English only.

## Analytics / Telegram
- routinepack.download statistics: all-time (default) and last 7 days, available in Routine Pack owner Telegram bot, without deleting metrics after 90 days.
- Improve bot menus with modest emoji and meaningful labels. Keep admin commands authenticated.

## Release blockers and safety
- Production currently has separate Sites frontend and GitHub/Railway backend. Do not assume updating this repository updates the published Sites project.
- GitHub main has legacy NOWPayments / one-off delivery flow alongside a gated commerce implementation. Audit both before removing/changing paths. No generic enabling of COMMERCE_ENABLED or MONOBANK_ENABLED without verified credentials, migration and tests.
- Check current live Railway service IDs, deployment health, environment variable names (never print secret values), DB ownership, backups, GitHub CI. October 19 syntax-and-entrypoint workflow failure needs investigation.
- Rotate revoked/compromised Railway tokens; check GitHub + payment + Meta + Telegram tokens for exposure and rotate only when needed, coordinated with webhook reconfiguration.
- Database backup & tested restore; keep separate staging instance and production; changes through PR/tests, no direct push to main. Verify 200/4xx/5xx endpoints, mobile, desktop, checkout, login, links, Free gating, webhook signatures, idempotency.
- Never run production and standby Telegram polling simultaneously. For webhooks change provider callback address in controlled cutover, ensure one active processor.
- Oracle standby must use independent deploy and off-Railway storage/DB for true failover. Do not claim it is active yet.

## Release acceptance
1. All approved wording and media actually appear on routinepack.download on desktop and mobile.
2. Media renders, all previews are legitimate uploaded files, no fake placeholders.
3. Prices match server-side canonical catalog and provider invoices.
4. A newly registered account receives one 20% welcome discount exclusively for Routine Pack Volume 1: $49 -> $39.20; Audio Bundle and single routines remain full price. Enforce it atomically server-side and verify the resulting payment-provider total.
5. No file access pre-registration or pre-payment; refunds/failed/partial transactions do not unlock paid content.
6. All bots/webhooks send once with valid signatures; stats all-time & 7d match stored data.
7. Backups and rollback are tested prior to production deploy.
