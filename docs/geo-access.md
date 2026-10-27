# Geographic access policy — 27 October 2026

Requests identified as RU by the local GeoLite2 country database receive HTTP 403 before storefront files, registration, login, checkout, session access and downloads are handled. This includes already authenticated visitors and direct file/API requests. Email domain and browser language are not nationality or location checks and are not used. Existing customer data is not deleted.

Railway public HTTP ingress supplies the authoritative X-Real-IP header. Only that header is used on Railway; CF-IPCountry, CF-Connecting-IP and X-Forwarded-For are ignored. Other hosting uses the socket peer. No visitor IP is sent to an external geolocation service. Unknown locations remain allowed to prevent an outage for unclassified networks. VPNs/proxies in allowed countries can change the apparent country.

Exact POST Telegram and payment-provider webhook routes are exempt, and retain their existing signature/authentication checks. No customer or OAuth route is exempt. Responses are not cacheable. The X-Access-Policy header identifies the deployed policy version.

Geolocation data attribution: This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com/. The geoip-country distribution includes its database license/EULA and software license. Refresh the pinned dependency regularly for current country data.
