-- Migration 002: Group Gaming Experience
-- Adds Telegram Group support, group-linked matches, and announcement tracking

CREATE TABLE IF NOT EXISTS telegram_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id BIGINT UNIQUE NOT NULL,
  title VARCHAR(255),
  type VARCHAR(50) DEFAULT 'group',
  settings JSONB DEFAULT '{"allowGameCreation": true, "maxPlayers": 4, "announcements": true, "allowSpectators": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add group-linking columns to matches table
ALTER TABLE matches ADD COLUMN IF NOT EXISTS telegram_group_id BIGINT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_matches_telegram_group_id ON matches(telegram_group_id);
CREATE INDEX IF NOT EXISTS idx_telegram_groups_telegram_id ON telegram_groups(telegram_id);

CREATE TABLE IF NOT EXISTS group_announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_group_id BIGINT NOT NULL,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  announcement_type VARCHAR(50) NOT NULL,
  telegram_message_id BIGINT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_announcements_group_id ON group_announcements(telegram_group_id);

