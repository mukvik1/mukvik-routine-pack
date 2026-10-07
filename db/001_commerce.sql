-- Apply once before enabling COMMERCE_ENABLED. Requires PostgreSQL 14+.
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL CHECK (email = lower(email)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (email)
);
CREATE TABLE IF NOT EXISTS login_challenges (
  token_hash TEXT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_challenges_customer_created_idx ON login_challenges(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_customer_idx ON sessions(customer_id);
CREATE TABLE IF NOT EXISTS cart_items (
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(customer_id, product_code)
);
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  idempotency_key UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_manual_review' CHECK(status IN ('awaiting_manual_review','approved','cancelled','refunded')),
  currency TEXT NOT NULL CHECK(currency = 'USD'),
  total_cents INTEGER NOT NULL CHECK(total_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES customers(id),
  UNIQUE(customer_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);
CREATE TABLE IF NOT EXISTS order_items (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_code TEXT NOT NULL,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  PRIMARY KEY(order_id, product_code)
);
CREATE TABLE IF NOT EXISTS entitlements (
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id),
  product_code TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(order_id, product_code),
  FOREIGN KEY(order_id, product_code) REFERENCES order_items(order_id, product_code)
);
CREATE INDEX IF NOT EXISTS entitlements_customer_idx ON entitlements(customer_id, product_code);
CREATE TABLE IF NOT EXISTS download_tickets (
  token_hash TEXT PRIMARY KEY,
  order_id UUID NOT NULL,
  product_code TEXT NOT NULL,
  file_index INTEGER NOT NULL CHECK(file_index >= 0),
  customer_id UUID NOT NULL REFERENCES customers(id),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  FOREIGN KEY(order_id, product_code) REFERENCES entitlements(order_id, product_code)
);
CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  actor_id UUID REFERENCES customers(id),
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id, created_at DESC);
CREATE TABLE IF NOT EXISTS notification_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  sent_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  UNIQUE(order_id, kind)
);

-- Telegram update IDs prevent repeated webhook processing. No token or payment data is stored.
CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id BIGINT PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telegram_notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL CHECK(kind IN ('new_order','approved')),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  UNIQUE(order_id,kind)
);

-- Confirmed registrations and actual cart changes; also a durable owner notification queue.
CREATE TABLE IF NOT EXISTS customer_activity (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id),
  kind TEXT NOT NULL CHECK(kind IN ('registered','cart_updated')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_activity_registration_idx
  ON customer_activity(customer_id) WHERE kind='registered';
CREATE INDEX IF NOT EXISTS customer_activity_pending_idx
  ON customer_activity(id) WHERE sent_at IS NULL;
