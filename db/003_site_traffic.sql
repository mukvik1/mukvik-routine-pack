-- Aggregate traffic by day and page section. The raw IP address and user agent are never stored.
CREATE TABLE IF NOT EXISTS site_traffic (
  visit_day DATE NOT NULL,
  visitor_hash CHAR(64) NOT NULL,
  section TEXT NOT NULL CHECK (section IN ('home','packs','routines','free','about','legal')),
  views INTEGER NOT NULL DEFAULT 1 CHECK (views > 0),
  PRIMARY KEY (visit_day, visitor_hash, section)
);
CREATE INDEX IF NOT EXISTS site_traffic_day_idx ON site_traffic(visit_day);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'site_traffic'::regclass AND conname = 'site_traffic_storefront_section_check'
  ) THEN
    ALTER TABLE site_traffic DROP CONSTRAINT IF EXISTS site_traffic_section_check;
    ALTER TABLE site_traffic ADD CONSTRAINT site_traffic_storefront_section_check
      CHECK (section IN ('home','packs','routines','free','about','legal','price'));
  END IF;
END
$$;
