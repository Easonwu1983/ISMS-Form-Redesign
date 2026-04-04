-- 008-notifications.sql
-- Notification center: in-app notifications for users

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  link VARCHAR(255),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(username, read, created_at DESC);
