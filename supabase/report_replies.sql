-- ============================================================
-- report_replies table and RLS policies
-- Run in Supabase Dashboard → SQL Editor
-- Also enable Realtime for the "reports" table in
-- Database → Replication so the Navbar badge auto-updates.
-- ============================================================

CREATE TABLE IF NOT EXISTS report_replies (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid        NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body       text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_replies_report_id ON report_replies(report_id);

ALTER TABLE report_replies ENABLE ROW LEVEL SECURITY;

-- Admins and owners can read all replies;
-- complainants can read replies on their own reports.
DROP POLICY IF EXISTS "rr_select" ON report_replies;
CREATE POLICY "rr_select" ON report_replies
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
    OR EXISTS (SELECT 1 FROM public.reports WHERE id = report_id AND user_id = auth.uid())
  );

-- Admins and owners can always post a reply.
DROP POLICY IF EXISTS "rr_insert_admin" ON report_replies;
CREATE POLICY "rr_insert_admin" ON report_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','owner'))
  );

-- The complainant can reply exactly once, only after an admin has replied.
DROP POLICY IF EXISTS "rr_insert_complainant" ON report_replies;
CREATE POLICY "rr_insert_complainant" ON report_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    -- caller owns the report
    EXISTS (SELECT 1 FROM public.reports WHERE id = report_id AND user_id = auth.uid())
    -- at least one admin/owner reply already exists
    AND EXISTS (
      SELECT 1
      FROM   report_replies rr
      JOIN   public.profiles p ON p.id = rr.user_id AND p.role IN ('admin','owner')
      WHERE  rr.report_id = report_id
    )
    -- caller has not replied yet
    AND NOT EXISTS (
      SELECT 1
      FROM   report_replies rr2
      WHERE  rr2.report_id = report_id
        AND  rr2.user_id = auth.uid()
    )
  );
