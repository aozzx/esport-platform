-- ============================================================
-- Security constraints
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Fix 1: Unique constraint to prevent duplicate tournament registrations at DB level
ALTER TABLE tournament_registrations
  ADD CONSTRAINT tournament_registrations_tournament_team_unique
  UNIQUE (tournament_id, team_id);

-- Fix 3: Atomic standing update function — eliminates read-modify-write races.
-- Each captain calls this independently; Postgres serializes the UPDATE atomically.
CREATE OR REPLACE FUNCTION update_standing_result(
  p_season_id uuid,
  p_team_id   uuid,
  p_won       boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_won THEN
    UPDATE season_standings
       SET points     = points + 3,
           wins       = wins + 1,
           updated_at = now()
     WHERE season_id = p_season_id
       AND team_id   = p_team_id;
  ELSE
    UPDATE season_standings
       SET losses     = losses + 1,
           updated_at = now()
     WHERE season_id = p_season_id
       AND team_id   = p_team_id;
  END IF;
END;
$$;
