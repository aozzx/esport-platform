-- ============================================================
-- Case-insensitive uniqueness for team_tag
-- Prevents "QHT" and "qht" from coexisting.
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop the old case-sensitive unique constraint
ALTER TABLE teams DROP CONSTRAINT IF EXISTS uq_teams_team_tag;

-- Replace with a unique index on LOWER(team_tag)
CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_team_tag_ci ON teams (LOWER(team_tag));
