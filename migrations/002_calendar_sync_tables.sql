-- Calendar event mappings for idempotent sync
CREATE TABLE IF NOT EXISTS calendar_event_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR NOT NULL,
  user_id VARCHAR NOT NULL,
  event_id VARCHAR NOT NULL,
  calendar_id VARCHAR DEFAULT 'primary',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for task_id + user_id (one event per task per user)
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_mappings_task_user 
ON calendar_event_mappings(task_id, user_id);

-- Individual indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_calendar_mappings_task_id 
ON calendar_event_mappings(task_id);

CREATE INDEX IF NOT EXISTS idx_calendar_mappings_user_id 
ON calendar_event_mappings(user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_mappings_event_id 
ON calendar_event_mappings(event_id);

-- Google OAuth tokens table with flexible owner types
CREATE TABLE IF NOT EXISTS google_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type VARCHAR NOT NULL CHECK (owner_type IN ('userId', 'teamMemberId')),
  owner_id VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  scope TEXT,
  token_type VARCHAR DEFAULT 'Bearer',
  expiry_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Unique constraint for owner_type + owner_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_google_tokens_owner 
ON google_tokens(owner_type, owner_id);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_google_tokens_email 
ON google_tokens(email);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_calendar_mappings_updated_at 
BEFORE UPDATE ON calendar_event_mappings 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_google_tokens_updated_at 
BEFORE UPDATE ON google_tokens 
FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();