CREATE TABLE IF NOT EXISTS customer_news_preferences (
  customer_id uuid PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  opted_in boolean NOT NULL,
  consent_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
