CREATE TABLE IF NOT EXISTS standard_subscriptions (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  provider_id TEXT NOT NULL UNIQUE,
  callback_hash TEXT NOT NULL UNIQUE,
  checkout_url TEXT NOT NULL,
  amount_kop INTEGER NOT NULL CHECK (amount_kop > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checkout_expires_at TIMESTAMPTZ NOT NULL,
  paid_until TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  provider_status TEXT,
  checked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS standard_one_open_per_customer
  ON standard_subscriptions(customer_id) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS standard_access_by_customer ON standard_subscriptions(customer_id, paid_until);
CREATE TABLE IF NOT EXISTS standard_download_tickets (
  token_hash TEXT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  routine_slug TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS standard_download_ticket_expiry ON standard_download_tickets(expires_at);
