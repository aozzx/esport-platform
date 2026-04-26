-- ============================================================
-- Fix: infinite recursion in rr_insert_complainant RLS policy
-- The old policy referenced report_replies inside itself,
-- causing PostgreSQL to recurse infinitely.
-- Solution: extract the subqueries into SECURITY DEFINER functions
-- that bypass RLS, then reference those functions in the policy.
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Step 1: Helper — does this report already have an admin/owner reply?
CREATE OR REPLACE FUNCTION has_admin_reply(p_report_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM report_replies rr
    JOIN profiles p ON p.id = rr.user_id
    WHERE rr.report_id = p_report_id AND p.role IN ('admin','owner')
  );
$$;

-- Step 2: Helper — has this user already replied to this report?
CREATE OR REPLACE FUNCTION complainant_has_replied(p_report_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM report_replies rr2
    WHERE rr2.report_id = p_report_id AND rr2.user_id = p_user_id
  );
$$;

-- Step 3: Recreate the policy using the helpers (no recursion)
DROP POLICY IF EXISTS "rr_insert_complainant" ON report_replies;
CREATE POLICY "rr_insert_complainant" ON report_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.reports WHERE id = report_id AND user_id = auth.uid())
    AND has_admin_reply(report_id)
    AND NOT complainant_has_replied(report_id, auth.uid())
  );
