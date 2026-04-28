-- ============================================================
-- Multiple screenshots support for season match results
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE season_match_results
  ADD COLUMN IF NOT EXISTS team_a_screenshot_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS team_b_screenshot_urls text[] DEFAULT '{}';
