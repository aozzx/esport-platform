-- ============================================================
-- Role protection for the profiles table
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Step 1: Enable RLS on profiles if not already enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Step 2: Helper function — runs as postgres (SECURITY DEFINER) so the
-- internal SELECT bypasses RLS and avoids infinite recursion.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Step 3: Policy — authenticated users can update their own profile row,
-- but the role column must not change.
--   USING  : only their own row (id = auth.uid())
--   WITH CHECK : new role must equal current role (no self-promotion)
DROP POLICY IF EXISTS "users_update_own_profile" ON profiles;
CREATE POLICY "users_update_own_profile" ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = get_my_role()   -- new role must match existing role
  );

-- Step 4: Policy — owners can change another user's role, with constraints:
--   USING  : target is not the caller, target is not already an owner,
--            caller must be an owner
--   WITH CHECK : new role cannot be 'owner', caller must still be an owner,
--            target cannot be self
DROP POLICY IF EXISTS "owners_update_roles" ON profiles;
CREATE POLICY "owners_update_roles" ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    id          != auth.uid()          -- cannot target yourself
    AND role    != 'owner'             -- cannot target an owner (role = OLD value in USING)
    AND get_my_role() = 'owner'        -- caller must be owner
  )
  WITH CHECK (
    id          != auth.uid()          -- cannot target yourself
    AND role    != 'owner'             -- new role cannot be 'owner'
    AND get_my_role() = 'owner'        -- caller must still be owner
  );

-- ============================================================
-- What these two policies enforce together:
--
--  ✓  Regular users can update their own username, avatar, etc.
--  ✓  Owners can promote player → admin or demote admin → player
--  ✗  No one can assign the 'owner' role (blocked in WITH CHECK)
--  ✗  No one can change their own role (blocked in WITH CHECK of policy 1)
--  ✗  Owners cannot demote other owners (blocked in USING of policy 2)
--  ✗  Non-owners cannot change any role (blocked in USING of policy 2)
-- ============================================================
