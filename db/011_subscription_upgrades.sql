ALTER TABLE standard_subscriptions
  ADD COLUMN IF NOT EXISTS period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_tier TEXT CHECK (next_tier IN ('standard','pro')),
  ADD COLUMN IF NOT EXISTS ultra_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS standard_upgrade_invoices (
  id UUID PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES standard_subscriptions(id),
  period_end TIMESTAMPTZ NOT NULL,
  amount_kop INTEGER NOT NULL CHECK (amount_kop > 0),
  invoice_id TEXT NOT NULL UNIQUE,
  checkout_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS standard_one_payable_upgrade_per_period
  ON standard_upgrade_invoices(subscription_id, period_end)
  WHERE status NOT IN ('failure','expired','reversed');
