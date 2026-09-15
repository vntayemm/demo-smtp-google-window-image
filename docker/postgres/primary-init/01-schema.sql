-- Demo DB bootstrap (primary). Standby node is a second instance for layout/HA practice.
CREATE TABLE IF NOT EXISTS email_deliveries (
  message_id   TEXT PRIMARY KEY,
  status       TEXT NOT NULL DEFAULT 'processing',
  recipient    TEXT NOT NULL,
  subject      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
