CREATE TABLE IF NOT EXISTS subscription_checkout_errors (
  id BIGSERIAL PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('standard', 'pro')),
  error_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_checkout_errors_recent
  ON subscription_checkout_errors(created_at DESC);
