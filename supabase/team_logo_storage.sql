-- ============================================================
-- Storage bucket and policies for team logos
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Create public bucket (logos load via public URL with no auth headers)
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-logos', 'team-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Only the team captain can upload/replace their team's logo.
-- Path format enforced by the client: <team_id>/logo.<ext>
DROP POLICY IF EXISTS "team_logo_insert" ON storage.objects;
CREATE POLICY "team_logo_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.teams
      WHERE id::text = split_part(name, '/', 1)
        AND captain_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "team_logo_update" ON storage.objects;
CREATE POLICY "team_logo_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND EXISTS (
      SELECT 1 FROM public.teams
      WHERE id::text = split_part(name, '/', 1)
        AND captain_id = auth.uid()
    )
  );
