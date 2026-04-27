-- ============================================================
-- RLS policies for the matches table.
-- Run in Supabase Dashboard → SQL Editor.
-- Required because the server-side Supabase client uses the
-- anon key (not service role), so RLS applies to all writes.
-- ============================================================

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read matches (bracket is public).
DROP POLICY IF EXISTS "matches_select" ON matches;
CREATE POLICY "matches_select" ON matches
  FOR SELECT TO authenticated
  USING (true);

-- Only admins and owners can insert (bracket generation).
DROP POLICY IF EXISTS "matches_insert" ON matches;
CREATE POLICY "matches_insert" ON matches
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Only admins and owners can update (set match winner).
DROP POLICY IF EXISTS "matches_update" ON matches;
CREATE POLICY "matches_update" ON matches
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );

-- Only admins and owners can delete (regenerate bracket).
DROP POLICY IF EXISTS "matches_delete" ON matches;
CREATE POLICY "matches_delete" ON matches
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'owner')
    )
  );
