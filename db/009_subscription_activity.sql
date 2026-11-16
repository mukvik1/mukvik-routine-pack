ALTER TABLE customer_activity DROP CONSTRAINT IF EXISTS customer_activity_kind_check;
ALTER TABLE customer_activity ADD CONSTRAINT customer_activity_kind_check
  CHECK (kind IN ('registered','cart_updated','subscription_paid'));
CREATE UNIQUE INDEX IF NOT EXISTS customer_activity_subscription_paid_idx
  ON customer_activity ((payload->>'subscription_id')) WHERE kind='subscription_paid';
