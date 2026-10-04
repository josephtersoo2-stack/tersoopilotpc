PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;

CREATE TABLE presets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  platform      TEXT NOT NULL CHECK (platform IN ('windows','macos','android')),
  bundle        TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE proxies (
  id                TEXT PRIMARY KEY,
  protocol          TEXT NOT NULL CHECK (protocol IN ('socks5','http','https')),
  host              TEXT NOT NULL,
  port              INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
  username          TEXT,
  password_ref      TEXT,
  geo_country       TEXT,
  geo_city          TEXT,
  geo_tz            TEXT,
  geo_isp           TEXT,
  geo_lat           REAL,
  geo_lng           REAL,
  exit_ip           TEXT,
  last_checked_at   INTEGER,
  last_latency_ms   INTEGER,
  status            TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (status IN ('unknown','healthy','slow','auth_error','dead')),
  status_reason     TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX idx_proxies_status ON proxies(status);
CREATE INDEX idx_proxies_country ON proxies(geo_country);

CREATE TABLE profiles (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  tags              TEXT NOT NULL DEFAULT '[]',
  preset_id         TEXT NOT NULL REFERENCES presets(id) ON DELETE RESTRICT,
  fingerprint_seed  TEXT NOT NULL,
  fingerprint_bundle TEXT NOT NULL,
  user_data_dir     TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'idle'
                    CHECK (state IN ('idle','running','paused','crashed','archived')),
  notes             TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  last_launched_at  INTEGER,
  UNIQUE (user_data_dir)
);
CREATE INDEX idx_profiles_state ON profiles(state);
CREATE INDEX idx_profiles_preset ON profiles(preset_id);

CREATE TABLE proxy_leases (
  id            TEXT PRIMARY KEY,
  proxy_id      TEXT NOT NULL REFERENCES proxies(id) ON DELETE CASCADE,
  profile_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state         TEXT NOT NULL CHECK (state IN ('active','released','expired')),
  acquired_at   INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  released_at   INTEGER,
  heartbeat_at  INTEGER NOT NULL
);
CREATE UNIQUE INDEX uq_lease_active_proxy
  ON proxy_leases(proxy_id) WHERE state = 'active';
CREATE UNIQUE INDEX uq_lease_active_profile
  ON proxy_leases(profile_id) WHERE state = 'active';
CREATE INDEX idx_lease_expiry ON proxy_leases(state, expires_at);

CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  schema_version  INTEGER NOT NULL DEFAULT 1,
  definition      TEXT NOT NULL,
  tags            TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE runs (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id      TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  state           TEXT NOT NULL CHECK (state IN
                    ('queued','starting','running','paused','succeeded','failed','cancelled')),
  idempotency_key TEXT,
  attempt         INTEGER NOT NULL DEFAULT 0,
  checkpoint      TEXT,
  error_class     TEXT,
  error_message   TEXT,
  started_at      INTEGER,
  finished_at     INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE (idempotency_key)
);
CREATE INDEX idx_runs_state ON runs(state);
CREATE INDEX idx_runs_task ON runs(task_id);
CREATE INDEX idx_runs_profile ON runs(profile_id);

CREATE TABLE step_runs (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_index    INTEGER NOT NULL,
  step_type     TEXT NOT NULL,
  state         TEXT NOT NULL CHECK (state IN
                  ('pending','running','succeeded','failed','skipped')),
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  artifacts     TEXT NOT NULL DEFAULT '{}',
  started_at    INTEGER,
  finished_at   INTEGER,
  UNIQUE (run_id, step_index)
);
CREATE INDEX idx_step_runs_run ON step_runs(run_id);

CREATE TABLE anchors (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL,
  profile_id    TEXT,
  anchor_key    TEXT NOT NULL,
  selector      TEXT NOT NULL,
  selector_type TEXT NOT NULL CHECK (selector_type IN ('xpath','css','role','text')),
  confidence    REAL NOT NULL DEFAULT 1.0,
  hit_count     INTEGER NOT NULL DEFAULT 0,
  miss_count    INTEGER NOT NULL DEFAULT 0,
  last_hit_at   INTEGER,
  ttl_at        INTEGER,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (task_id, profile_id, anchor_key)
);
CREATE INDEX idx_anchors_lookup ON anchors(task_id, profile_id, anchor_key);

CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ts            INTEGER NOT NULL,
  level         TEXT NOT NULL CHECK (level IN ('debug','info','warn','error','fatal')),
  scope         TEXT NOT NULL,
  event         TEXT NOT NULL,
  profile_id    TEXT,
  run_id        TEXT,
  step_run_id   TEXT,
  data          TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_events_ts ON events(ts DESC);
CREATE INDEX idx_events_scope ON events(scope, ts DESC);
CREATE INDEX idx_events_profile ON events(profile_id, ts DESC);
CREATE INDEX idx_events_run ON events(run_id, ts DESC);

CREATE TABLE audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  target    TEXT,
  meta      TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_audit_ts ON audit(ts DESC);
