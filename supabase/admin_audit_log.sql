-- Admin action audit log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES auth.users(id),
  action      text NOT NULL,
  target_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Only admins/owners can read; no one can update or delete via client
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON admin_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
    )
  );

-- Inserts are allowed only from the service role (server-side) or via a
-- security-definer function. Client-side inserts are blocked by default.
CREATE POLICY "No client inserts"
  ON admin_audit_log FOR INSERT
  WITH CHECK (false);
