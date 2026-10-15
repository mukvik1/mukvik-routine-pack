-- Aggregate traffic by day and page section. The raw IP address and user agent are never stored.
CREATE TABLE IF NOT EXISTS site_traffic (
  visit_day DATE NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('home','packs','routines','free','about','legal')),
  views INTEGER NOT NULL DEFAULT 1 CHECK (views > 0),
  PRIMARY KEY (visit_day, visitor_hash, section)
);
CREATE INDEX IF NOT EXISTS site_traffic_day_idx ON site_traffic(visit_day);
