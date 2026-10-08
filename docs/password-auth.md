# Password accounts

The storefront has separate registration, sign-in, and recovery screens. A new
customer enters email, nickname, and a password of at least eight characters.
The server stores only a salted scrypt hash in a pending challenge. It creates
or upgrades the customer account after the eight-digit email code is verified.
The code expires after ten minutes and allows five attempts. Registration sends
an owner email through `registration_email_outbox` after confirmation; the email
contains email and nickname, never the password.

Later sign-ins require email and password. Recovery sends an email code, then
accepts a new password and revokes existing sessions. Existing accounts created
by the older email-code flow can set their first password through recovery.
The former email-only sign-in endpoints return HTTP 410. The standalone
Railway account page also uses password sign-in and links to the storefront
for registration and recovery.

Deploy the backend before the storefront. Railway's pre-deploy command runs the
repeatable `db/001_commerce.sql` migration, checks the new tables, and verifies
private delivery configuration. Then publish the matching Sites storefront.
