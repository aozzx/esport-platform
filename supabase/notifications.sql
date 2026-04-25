-- ============================================================
-- Notifications table + RLS + DB triggers
-- Run in Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,
  message    text        NOT NULL,
  is_read    boolean     NOT NULL DEFAULT false,
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_update_own" ON notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own" ON notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Inserts are handled exclusively via SECURITY DEFINER triggers below
CREATE POLICY "no_direct_insert" ON notifications
  FOR INSERT WITH CHECK (false);

-- Enable real-time streaming so the bell updates instantly
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ── Trigger 1: team invite received ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_on_team_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_team_name text;
BEGIN
  SELECT team_name INTO v_team_name FROM teams WHERE id = NEW.team_id;
  INSERT INTO notifications (user_id, type, message, metadata)
  VALUES (
    NEW.user_id,
    'team_invite',
    'You have been invited to join ' || COALESCE(v_team_name, 'a team'),
    jsonb_build_object('team_id', NEW.team_id, 'invite_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_team_invite ON team_invitations;
CREATE TRIGGER trg_notify_team_invite
  AFTER INSERT ON team_invitations
  FOR EACH ROW EXECUTE FUNCTION notify_on_team_invite();


-- ── Trigger 2: tournament registration approved / rejected ────────────────────

CREATE OR REPLACE FUNCTION notify_on_registration_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tournament_name text;
  v_captain_id      uuid;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  SELECT name      INTO v_tournament_name FROM tournaments WHERE id = NEW.tournament_id;
  SELECT captain_id INTO v_captain_id     FROM teams        WHERE id = NEW.team_id;
  IF v_captain_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO notifications (user_id, type, message, metadata)
  VALUES (
    v_captain_id,
    'registration_' || NEW.status,
    CASE NEW.status
      WHEN 'approved'
        THEN 'Your registration for ' || COALESCE(v_tournament_name, 'a tournament') || ' has been approved'
      ELSE     'Your registration for ' || COALESCE(v_tournament_name, 'a tournament') || ' has been rejected'
    END,
    jsonb_build_object('tournament_id', NEW.tournament_id, 'team_id', NEW.team_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_registration_status ON tournament_registrations;
CREATE TRIGGER trg_notify_registration_status
  AFTER UPDATE ON tournament_registrations
  FOR EACH ROW EXECUTE FUNCTION notify_on_registration_status();


-- ── Trigger 3: match scheduled → reminder for all team members ───────────────

CREATE OR REPLACE FUNCTION notify_on_match_scheduled()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tournament_name text;
  v_team_a_name     text;
  v_team_b_name     text;
BEGIN
  IF NEW.status <> 'scheduled' THEN RETURN NEW; END IF;
  IF NEW.team_b_id IS NULL     THEN RETURN NEW; END IF;  -- bye round

  SELECT name      INTO v_tournament_name FROM tournaments WHERE id = NEW.tournament_id;
  SELECT team_name INTO v_team_a_name     FROM teams        WHERE id = NEW.team_a_id;
  SELECT team_name INTO v_team_b_name     FROM teams        WHERE id = NEW.team_b_id;

  -- Notify every member of team A
  INSERT INTO notifications (user_id, type, message, metadata)
  SELECT tm.user_id,
    'match_reminder',
    'Match scheduled: ' || COALESCE(v_team_a_name, 'Your team') || ' vs ' ||
      COALESCE(v_team_b_name, 'opponent') || ' in ' || COALESCE(v_tournament_name, 'a tournament'),
    jsonb_build_object(
      'match_id',          NEW.id,
      'tournament_id',     NEW.tournament_id,
      'opponent_team_id',  NEW.team_b_id
    )
  FROM team_members tm WHERE tm.team_id = NEW.team_a_id;

  -- Notify every member of team B
  INSERT INTO notifications (user_id, type, message, metadata)
  SELECT tm.user_id,
    'match_reminder',
    'Match scheduled: ' || COALESCE(v_team_b_name, 'Your team') || ' vs ' ||
      COALESCE(v_team_a_name, 'opponent') || ' in ' || COALESCE(v_tournament_name, 'a tournament'),
    jsonb_build_object(
      'match_id',          NEW.id,
      'tournament_id',     NEW.tournament_id,
      'opponent_team_id',  NEW.team_a_id
    )
  FROM team_members tm WHERE tm.team_id = NEW.team_b_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_match_scheduled ON matches;
CREATE TRIGGER trg_notify_match_scheduled
  AFTER INSERT ON matches
  FOR EACH ROW EXECUTE FUNCTION notify_on_match_scheduled();
