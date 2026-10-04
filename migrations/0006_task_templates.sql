-- migrations/0006_task_templates.sql
-- Reusable Task Templates table for workflow presets, cookie warming, engagement, and anti-sybil variance.

CREATE TABLE IF NOT EXISTS task_templates (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'custom',
  description     TEXT NOT NULL DEFAULT '',
  definition      TEXT NOT NULL,
  is_builtin      INTEGER NOT NULL DEFAULT 0,
  tags            TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_templates_category ON task_templates(category);
CREATE INDEX IF NOT EXISTS idx_task_templates_builtin ON task_templates(is_builtin);
