-- 001_calendar_patch.sql
-- 1) Add per-assignment calendar event support
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS calendar_event_id TEXT,
  ADD COLUMN IF NOT EXISTS calendar_id TEXT DEFAULT 'primary';

-- 2) Optional: remove/stop using task-level event id
-- (keep the column for now to avoid breaking reads)
-- ALTER TABLE tasks DROP COLUMN google_calendar_event_id;

-- 3) Store OAuth tokens per user
CREATE TABLE IF NOT EXISTS oauth_tokens (
  user_id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry TIMESTAMPTZ NOT NULL,
  scopes TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
