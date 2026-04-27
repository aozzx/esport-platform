-- ============================================================
-- match_submissions: captain result submissions per match
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Add scheduled_at to matches so admins can set match time
ALTER TABLE matches ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

-- Captain submissions table
CREATE TABLE IF NOT EXISTS match_submissions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid        NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  team_id         uuid        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  submitted_by    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claimed_winner_id uuid      NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  score_a         integer,
  score_b         integer,
  proof_url       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Each team can have exactly one submission per match
  UNIQUE (match_id, team_id)
);

ALTER TABLE match_submissions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read submissions (to see status in bracket)
DROP POLICY IF EXISTS "ms_select" ON match_submissions;
CREATE POLICY "ms_select" ON match_submissions
  FOR SELECT TO authenticated
  USING (true);

-- Only the captain of the team can insert their submission
-- Handles captains of multiple teams correctly: checks team_id specifically
DROP POLICY IF EXISTS "ms_insert" ON match_submissions;
CREATE POLICY "ms_insert" ON match_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );

-- Captain can update (resubmit) their own team's submission
DROP POLICY IF EXISTS "ms_update" ON match_submissions;
CREATE POLICY "ms_update" ON match_submissions
  FOR UPDATE TO authenticated
  USING (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM teams
      WHERE teams.id = team_id
        AND teams.captain_id = auth.uid()
    )
  );

-- Admins/owners can delete submissions (to reset a disputed match)
DROP POLICY IF EXISTS "ms_admin_delete" ON match_submissions;
CREATE POLICY "ms_admin_delete" ON match_submissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
    )
  );
