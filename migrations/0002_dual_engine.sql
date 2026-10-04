-- migrations/0002_dual_engine.sql
-- Adds dual-engine support, LLM config, CAPTCHA tracking, and settings.

-- 1. Engine per profile
ALTER TABLE profiles ADD COLUMN engine TEXT NOT NULL DEFAULT 'apostate'
  CHECK (engine IN ('apostate', 'camoufox'));

-- 2. Action mode per profile (null = inherit)
ALTER TABLE profiles ADD COLUMN action_mode TEXT
  CHECK (action_mode IN ('scripted', 'llm') OR action_mode IS NULL);

-- 3. CAPTCHA counter (reset on launch)
ALTER TABLE profiles ADD COLUMN captcha_budget_used INTEGER NOT NULL DEFAULT 0;

-- 4. Engine config
CREATE TABLE engine_config (
  engine          TEXT PRIMARY KEY CHECK (engine IN ('apostate', 'camoufox')),
  action_mode     TEXT CHECK (action_mode IN ('scripted', 'llm') OR action_mode IS NULL),
  binary_path     TEXT,
  launch_options  TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

INSERT INTO engine_config (engine, action_mode, binary_path, launch_options, created_at, updated_at)
VALUES
  ('apostate', NULL, NULL, '{}', strftime('%s','now')*1000, strftime('%s','now')*1000),
  ('camoufox', NULL, NULL, '{}', strftime('%s','now')*1000, strftime('%s','now')*1000);

-- 5. LLM config (singleton row)
CREATE TABLE llm_config (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  provider        TEXT NOT NULL DEFAULT 'openrouter'
                  CHECK (provider IN ('openrouter','openai','gemini','deepseek')),
  text_model      TEXT NOT NULL DEFAULT 'deepseek/deepseek-chat',
  vision_model    TEXT DEFAULT 'deepseek/deepseek-v4-flash-vision-exp',
  api_key_ref     TEXT NOT NULL DEFAULT 'tersoopilot/llm/openrouter',
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  backoff_ms      TEXT NOT NULL DEFAULT '[1000,3000,9000]',
  vision_enabled  INTEGER NOT NULL DEFAULT 1,
  updated_at      INTEGER NOT NULL
);

INSERT INTO llm_config (id, updated_at) VALUES (1, strftime('%s','now')*1000);

-- 6. CAPTCHA events
CREATE TABLE captcha_events (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  detected_at     INTEGER NOT NULL,
  challenge_type  TEXT NOT NULL,
  solved_by       TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  outcome         TEXT NOT NULL CHECK (outcome IN ('solved','failed','aborted','unsolvable')),
  screenshot_path TEXT,
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_captcha_run ON captcha_events(run_id);
CREATE INDEX idx_captcha_profile ON captcha_events(profile_id);

-- 7. Settings (key-value)
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('engine_weights', '{"apostate":70,"camoufox":30}', strftime('%s','now')*1000),
  ('captcha_budget', '3', strftime('%s','now')*1000),
  ('humanization_seed_source', 'profile', strftime('%s','now')*1000);

-- 8. Backfill existing profiles
UPDATE profiles SET engine = 'apostate' WHERE engine IS NULL OR engine = '';
