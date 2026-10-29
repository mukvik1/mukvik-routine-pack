# Free downloads

The live storefront is the Railway service on routinepack.download, not the
repository default branch or the old Sites publication. Preview pages and videos
remain public. Download clicks open registration/sign-in, and registration issues
a usable session only after the email code is confirmed. The frontend resumes the
selected download after login.

`POST /api/v2/free/:slug/download` requires a current, non-revoked bearer session
and `customers.email_verified_at`. It streams only allowlisted ZIPs, with private,
no-store caching. `/downloads/*` remains blocked by the static server, including
on the Railway origin. A copied URL does not authorize another visitor.

Migration `004_free_downloads.sql` adds a delivery journal with verified customer
email, routine slug/title, start/end dates and delivery status. Each request adds
one row before any bytes are sent; database failure prevents delivery. Completed
means the server finished sending bytes, not proof that a file was saved. Interrupted
transfers remain distinguishable; a process crash can leave a row as started.

`GET /api/v2/admin/free-downloads` is restricted to the configured admin email.
It returns the latest 100 events and up to 100 email/routine totals, including
attempted and completed delivery counts. Counts cover only deliveries after rollout.

The old Sites publication contains ZIP source assets consumed by the Railway
build. It must remain restricted to the owner, with server-only bypass access for
the build. Leaving that publication public allows direct downloads around the
storefront's session check. Do not publish its bypass token in the frontend.

Validation: `FREE_TEST_DATABASE_URL=<isolated local database> node --test
test/free-download-security.test.js` covers missing/forged/revoked sessions,
unconfirmed email, wrong/missing files, repeated authorized delivery, journal rows,
admin-only counts and repeat-safe migration. Live checks must also verify that
both public server origins refuse anonymous ZIP requests and that the old Sites
origin no longer serves ZIP bytes anonymously.
