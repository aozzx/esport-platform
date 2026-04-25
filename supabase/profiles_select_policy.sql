-- ============================================================
-- Allow all authenticated users to read any profile row.
-- Required for public profile pages, leaderboard, team pages, etc.
-- Run in Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles
  FOR SELECT TO authenticated
  USING (true);
