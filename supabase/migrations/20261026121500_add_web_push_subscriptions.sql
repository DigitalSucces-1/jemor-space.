CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (char_length(endpoint) <= 3000),
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
DROP POLICY IF EXISTS push_subscriptions_read_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_read_own ON public.push_subscriptions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION private.dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, vault, net
AS $$
DECLARE
  all_subscriptions jsonb;
  actor_label text;
  push_secret text;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
    INTO all_subscriptions
  FROM public.push_subscriptions ps
  WHERE ps.user_id = NEW.recipient_id;
  IF all_subscriptions IS NULL OR jsonb_array_length(all_subscriptions) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(p.full_name, ''), CASE WHEN p.username IS NOT NULL THEN '@' || p.username END, 'Jémor Space')
    INTO actor_label
  FROM public.profiles p WHERE p.id = NEW.actor_id;
  actor_label := COALESCE(actor_label, 'Jémor Space');

  SELECT decrypted_secret INTO push_secret
  FROM vault.decrypted_secrets
  WHERE name = 'jemor_push_dispatch_secret'
  LIMIT 1;
  IF push_secret IS NULL OR push_secret = '' THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://jemor-space-jemor-digital-house.vercel.app/api/push/dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', push_secret),
    body := jsonb_build_object(
      'subscriptions', all_subscriptions,
      'notification', jsonb_build_object(
        'title', actor_label,
        'body', COALESCE(NULLIF(NEW.body, ''), 'Tu as une nouvelle activité sur Jémor Space.'),
        'url', '/notifications',
        'tag', 'jemor-' || NEW.id::text
      )
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Jémor Space push dispatch error: %', SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.dispatch_notification_push() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_notification_push_dispatch ON public.notifications;
CREATE TRIGGER js_notification_push_dispatch
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION private.dispatch_notification_push();
