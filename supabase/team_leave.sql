-- ============================================================
-- Functions for atomic captaincy transfer and team deletion.
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- transfer_captaincy: atomically reassigns captain_id on teams,
-- flips the old captain to "member", and the new one to "captain".
-- Caller must be the current captain; new captain must be a member.
CREATE OR REPLACE FUNCTION transfer_captaincy(p_team_id uuid, p_new_captain_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE id = p_team_id AND captain_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_captain';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM team_members WHERE team_id = p_team_id AND user_id = p_new_captain_id
  ) THEN
    RAISE EXCEPTION 'not_a_member';
  END IF;

  UPDATE team_members SET role = 'captain'
    WHERE team_id = p_team_id AND user_id = p_new_captain_id;

  UPDATE team_members SET role = 'member'
    WHERE team_id = p_team_id AND user_id = auth.uid();

  UPDATE teams SET captain_id = p_new_captain_id
    WHERE id = p_team_id;
END;
$$;

-- delete_team: deletes the team and its members.
-- Caller must be captain and the only remaining member.
CREATE OR REPLACE FUNCTION delete_team(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM teams WHERE id = p_team_id AND captain_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_captain';
  END IF;

  IF (SELECT COUNT(*) FROM team_members WHERE team_id = p_team_id) > 1 THEN
    RAISE EXCEPTION 'has_members';
  END IF;

  DELETE FROM team_members WHERE team_id = p_team_id;
  DELETE FROM teams WHERE id = p_team_id;
END;
$$;
