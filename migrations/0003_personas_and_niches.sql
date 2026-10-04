-- migrations/0003_personas_and_niches.sql
-- Adds profile personas, niches table, profile niche assignment, and launch interval settings.

-- 1. Persona and niche on profiles
ALTER TABLE profiles ADD COLUMN persona TEXT NOT NULL DEFAULT 'casual';
ALTER TABLE profiles ADD COLUMN niche_id TEXT REFERENCES niches(id) ON DELETE SET NULL;

-- 2. Niches table
CREATE TABLE niches (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  keywords    TEXT NOT NULL DEFAULT '[]',
  seed_urls   TEXT NOT NULL DEFAULT '[]',
  tags        TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX idx_profiles_niche_id ON profiles(niche_id);

-- 3. Launch interval defaults in settings
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('launch_interval_min_sec', '10', strftime('%s','now')*1000),
  ('launch_interval_max_sec', '30', strftime('%s','now')*1000),
  ('default_concurrency', '3', strftime('%s','now')*1000);
