-- ============================================================
-- Add social media link columns to profiles
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS twitch_url  text,
  ADD COLUMN IF NOT EXISTS youtube_url text,
  ADD COLUMN IF NOT EXISTS x_url       text,
  ADD COLUMN IF NOT EXISTS tiktok_url  text;
