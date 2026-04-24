-- Prevent duplicate team entries in standings for the same season
ALTER TABLE season_standings
  DROP CONSTRAINT IF EXISTS season_standings_season_team_unique,
  ADD CONSTRAINT season_standings_season_team_unique UNIQUE (season_id, team_id);

-- Prevent a team from entering the queue twice for the same season while waiting
CREATE UNIQUE INDEX IF NOT EXISTS scrim_queue_team_season_waiting_unique
  ON scrim_queue (team_id, season_id)
  WHERE status = 'waiting';
