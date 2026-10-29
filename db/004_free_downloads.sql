-- Server-side delivery journal. "Completed" means bytes were streamed by the
-- server, not that the visitor saved the file on their device.
CREATE TABLE IF NOT EXISTS free_downloads (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 customer_id UUID NOT NULL REFERENCES customers(id),
 email TEXT NOT NULL,
 routine_slug TEXT NOT NULL,
 routine_name TEXT NOT NULL,
 started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 finished_at TIMESTAMPTZ,
 status TEXT NOT NULL DEFAULT 'started' CHECK(status IN ('started','completed','interrupted'))
);
CREATE INDEX IF NOT EXISTS free_downloads_customer_routine_idx ON free_downloads(customer_id,routine_slug,started_at DESC);
