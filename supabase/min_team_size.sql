-- ============================================================
-- Enforce minimum 4 team members before registration
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Shared trigger function used by both tables.
-- Raises an exception (rolls back the insert) if the team has
-- fewer than 4 members at the moment of registration.
CREATE OR REPLACE FUNCTION check_min_team_size()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member_count integer;
BEGIN
  SELECT COUNT(*) INTO member_count
    FROM team_members
   WHERE team_id = NEW.team_id;

  IF member_count < 4 THEN
    RAISE EXCEPTION
      'Team must have at least 4 members to register (currently %).',
      member_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on tournament_registrations
DROP TRIGGER IF EXISTS trg_min_team_size_tournament ON tournament_registrations;
CREATE TRIGGER trg_min_team_size_tournament
  BEFORE INSERT ON tournament_registrations
  FOR EACH ROW EXECUTE FUNCTION check_min_team_size();

-- Trigger on scrim_queue (season queue)
DROP TRIGGER IF EXISTS trg_min_team_size_scrim_queue ON scrim_queue;
CREATE TRIGGER trg_min_team_size_scrim_queue
  BEFORE INSERT ON scrim_queue
  FOR EACH ROW EXECUTE FUNCTION check_min_team_size();
