-- Add registration opens date and game image to tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS registration_opens_at timestamptz;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS game_image_url text;

-- Add platform type to tournaments
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS platform text DEFAULT 'Cross Platform';
