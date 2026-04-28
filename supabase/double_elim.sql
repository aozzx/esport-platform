-- ============================================================
-- Double Elimination support columns on matches
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Which bracket this match belongs to
ALTER TABLE matches ADD COLUMN IF NOT EXISTS bracket text DEFAULT 'winners';

-- Pointer to where the winner of this match goes next
-- (null if GF match — tournament over)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_winners_match_id uuid;

-- Pointer to where the loser of this match drops (WB only)
-- null for LB/GF matches (losers are eliminated)
ALTER TABLE matches ADD COLUMN IF NOT EXISTS next_losers_match_id uuid;
