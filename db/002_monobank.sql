-- Monobank payment invoices. Run only after db/001_commerce.sql.
-- Prices remain USD cents on orders; each invoice has a locked UAH quote.
CREATE TABLE IF NOT EXISTS monobank_invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL UNIQUE,
  page_url TEXT NOT NULL,
  amount_kop INTEGER NOT NULL CHECK(amount_kop > 0),
  rate_uah NUMERIC(12,6) NOT NULL CHECK(rate_uah > 0),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK(status IN ('created','processing','success','failure','reversed','expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  modified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS monobank_invoices_order_idx
  ON monobank_invoices(order_id,created_at DESC);

-- Evidence that the buyer requested immediate supply of digital content.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS digital_delivery_consent_at TIMESTAMPTZ;

-- Owner receives durable payment and refund notifications in Telegram.
ALTER TABLE telegram_notifications DROP CONSTRAINT IF EXISTS telegram_notifications_kind_check;
ALTER TABLE telegram_notifications ADD CONSTRAINT telegram_notifications_kind_check
  CHECK(kind IN ('new_order','approved','monobank_paid','monobank_reversed'));


-- Hide unpaid cards without deleting payment/audit records. Late paid orders remain visible.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hidden_by_customer_at TIMESTAMPTZ;
-- Durable, hourly deduplicated owner alerts, separate from order-created notices.
CREATE TABLE IF NOT EXISTS payment_alerts (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id UUID NOT NULL REFERENCES orders(id),
 stage TEXT NOT NULL,
 error_code TEXT NOT NULL,
 period TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 attempts INTEGER NOT NULL DEFAULT 0,
 sent_at TIMESTAMPTZ,
 UNIQUE(order_id,stage,error_code,period)
);
