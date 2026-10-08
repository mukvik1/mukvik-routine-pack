# Storefront sign-in

The store opens dark dialogs for sign-in, registration, cart and account orders. Email registration is passwordless: `/api/v2/auth/code/start` sends an eight-digit code, `/api/v2/auth/code/verify` creates a 14-day revocable session after verification. Codes expire in ten minutes, permit five attempts, are stored only as salted hashes and are redeemed atomically. The account name falls back to email. Guest carts merge with the server cart on successful sign-in. Manual payment approval and private file delivery are unchanged.

## Provider setup required

OAuth handlers are implemented, but remain disabled until the owner creates provider applications and supplies the credentials as Railway secrets. Do not put credentials into chat, source, or Sites settings.

Use these exact callback URLs:

| Provider | Callback | Railway secret names |
| --- | --- | --- |
| Google | `https://mukvik-routine-pack-production.up.railway.app/api/v2/auth/oauth/google/callback` | `AUTH_GOOGLE_CLIENT_ID`, `AUTH_GOOGLE_CLIENT_SECRET` |
| Facebook | `https://mukvik-routine-pack-production.up.railway.app/api/v2/auth/oauth/facebook/callback` | `AUTH_FACEBOOK_CLIENT_ID`, `AUTH_FACEBOOK_CLIENT_SECRET` |
| Apple | `https://mukvik-routine-pack-production.up.railway.app/api/v2/auth/oauth/apple/callback` | `AUTH_APPLE_CLIENT_ID`, `AUTH_APPLE_CLIENT_SECRET` |

Google: create a Web application OAuth client in Google Cloud, configure the consent screen and the callback above. Request only openid, email and profile. Publish the consent app for customer use; testing mode only allows test users.

Facebook: create a Meta application with Facebook Login, enable email/public_profile and enter the exact valid OAuth redirect URI above. Complete required business/app verification and switch to Live for customers. An identity without a returned email is rejected and can use email verification instead.

Apple: an Apple Developer membership is required. Enable Sign in with Apple for an App ID and create an associated Services ID (the client ID). Register `mukvik-routine-pack-production.up.railway.app` and the exact return URL above. Generate an Apple client-secret JWT with the account's team ID, Services ID and Sign in with Apple key. Store that JWT in `AUTH_APPLE_CLIENT_SECRET` and rotate it before its expiry (maximum six months). The private signing key must stay in the owner's secret manager. Apple's verified private relay email is supported.

The backend stores one-use OAuth state and nonce with a ten-minute expiry, binds replies to a storefront origin allowlist, uses Google PKCE, and verifies Google/Apple signed identity tokens, audiences and nonce. The browser accepts messages only from the backend origin and its opened OAuth window. Provider buttons become active from `/api/v2/auth/providers` after the matching credentials are configured. Each provider still needs a real owner-controlled account smoke test before customer rollout.
