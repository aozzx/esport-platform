-- ============================================================
-- RLS policies for teams, team_members, season_standings,
-- and team_invitations.
--
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- ── teams ────────────────────────────────────────────────────

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read any team (public profile pages, leaderboard)
DROP POLICY IF EXISTS "teams_select_authenticated" ON teams;
CREATE POLICY "teams_select_authenticated" ON teams
  FOR SELECT TO authenticated
  USING (true);

-- Only the team captain can update their team
DROP POLICY IF EXISTS "teams_update_captain" ON teams;
CREATE POLICY "teams_update_captain" ON teams
  FOR UPDATE TO authenticated
  USING  (captain_id = auth.uid())
  WITH CHECK (captain_id = auth.uid());

-- Only the team captain can delete their team
DROP POLICY IF EXISTS "teams_delete_captain" ON teams;
CREATE POLICY "teams_delete_captain" ON teams
  FOR DELETE TO authenticated
  USING (captain_id = auth.uid());

-- Any authenticated user can create a team (captain_id must be themselves)
DROP POLICY IF EXISTS "teams_insert_authenticated" ON teams;
CREATE POLICY "teams_insert_authenticated" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (captain_id = auth.uid());

-- ── team_members ─────────────────────────────────────────────

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read all memberships
DROP POLICY IF EXISTS "team_members_select_authenticated" ON team_members;
CREATE POLICY "team_members_select_authenticated" ON team_members
  FOR SELECT TO authenticated
  USING (true);

-- Only the team captain can add members (via invite flow)
DROP POLICY IF EXISTS "team_members_insert_captain" ON team_members;
CREATE POLICY "team_members_insert_captain" ON team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );

-- Captain can remove any member; a member can remove themselves
DROP POLICY IF EXISTS "team_members_delete_captain_or_self" ON team_members;
CREATE POLICY "team_members_delete_captain_or_self" ON team_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );

-- ── season_standings ──────────────────────────────────────────

ALTER TABLE season_standings ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read standings (leaderboard, team pages)
DROP POLICY IF EXISTS "season_standings_select_authenticated" ON season_standings;
CREATE POLICY "season_standings_select_authenticated" ON season_standings
  FOR SELECT TO authenticated
  USING (true);

-- Only admins/owners update standings (done via server-side API route with service role)
-- No client-side INSERT/UPDATE/DELETE policies needed — the set-winner API uses
-- the service role key which bypasses RLS entirely.

-- ── team_invitations ──────────────────────────────────────────

ALTER TABLE team_invitations ENABLE ROW LEVEL SECURITY;

-- Users can read invitations addressed to them, or sent by their team
DROP POLICY IF EXISTS "team_invitations_select_own" ON team_invitations;
CREATE POLICY "team_invitations_select_own" ON team_invitations
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );

-- Only the team captain can send invitations
DROP POLICY IF EXISTS "team_invitations_insert_captain" ON team_invitations;
CREATE POLICY "team_invitations_insert_captain" ON team_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );

-- Invitee can update status (accept/decline); captain can cancel
DROP POLICY IF EXISTS "team_invitations_update_own" ON team_invitations;
CREATE POLICY "team_invitations_update_own" ON team_invitations
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );
