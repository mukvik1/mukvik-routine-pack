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
