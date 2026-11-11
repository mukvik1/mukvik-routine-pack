ALTER TABLE standard_subscriptions
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'legacy'
  CHECK (tier IN ('legacy', 'standard', 'pro'));
