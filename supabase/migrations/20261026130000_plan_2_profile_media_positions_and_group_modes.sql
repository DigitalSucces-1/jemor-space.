ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_position_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS avatar_position_y integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cover_position_x integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS cover_position_y integer NOT NULL DEFAULT 50;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_avatar_position_x_range,
  DROP CONSTRAINT IF EXISTS profiles_avatar_position_y_range,
  DROP CONSTRAINT IF EXISTS profiles_cover_position_x_range,
  DROP CONSTRAINT IF EXISTS profiles_cover_position_y_range;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_avatar_position_x_range CHECK (avatar_position_x BETWEEN 0 AND 100),
  ADD CONSTRAINT profiles_avatar_position_y_range CHECK (avatar_position_y BETWEEN 0 AND 100),
  ADD CONSTRAINT profiles_cover_position_x_range CHECK (cover_position_x BETWEEN 0 AND 100),
  ADD CONSTRAINT profiles_cover_position_y_range CHECK (cover_position_y BETWEEN 0 AND 100);

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS group_mode text NOT NULL DEFAULT 'community';

UPDATE public.conversations
SET group_mode = CASE WHEN group_visibility = 'private' THEN 'chat' ELSE 'community' END
WHERE is_group = true AND group_mode = 'community';

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_group_mode_check;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_group_mode_check
  CHECK (group_mode IN ('community', 'chat'));
