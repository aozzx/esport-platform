-- ============================================================
-- Unique constraint to prevent duplicate team membership
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Prevents a user from being inserted into the same team twice,
-- even under a race condition (e.g. double-click or concurrent devices).
ALTER TABLE team_members
  ADD CONSTRAINT team_members_team_user_unique
  UNIQUE (team_id, user_id);
