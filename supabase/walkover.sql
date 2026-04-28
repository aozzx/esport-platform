-- ============================================================
-- Walkover request columns on matches
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE matches ADD COLUMN IF NOT EXISTS walkover_requested_by uuid REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS walkover_requested_at timestamptz;
