-- Keep notifications server-generated so the list stays consistent across devices.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type = ANY (ARRAY[
    'friend_request','friend_accepted','reaction','comment','message','story',
    'post','group_invite','group_join_request'
  ]::text[]));

CREATE OR REPLACE FUNCTION private.notify_friend_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
    VALUES (NEW.recipient_id, NEW.requester_id, 'friend_request', NEW.id, 't’a envoyé une demande d’amitié.');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
    VALUES (NEW.requester_id, NEW.recipient_id, 'friend_accepted', NEW.id, 'a accepté ta demande d’amitié.');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_friend_request_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_friend_request_notice ON public.friend_requests;
CREATE TRIGGER js_friend_request_notice
AFTER INSERT OR UPDATE ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION private.notify_friend_request_change();

CREATE OR REPLACE FUNCTION private.notify_new_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.visibility = 'private' THEN RETURN NEW; END IF;
  IF NEW.group_id IS NOT NULL THEN
    INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
    SELECT DISTINCT cm.user_id, NEW.author_id, 'post', NEW.id,
      CASE WHEN NEW.post_type = 'reel' THEN 'a publié un nouveau Réel dans un groupe.' ELSE 'a publié dans un groupe.' END
    FROM public.conversation_members cm
    WHERE cm.conversation_id = NEW.group_id AND cm.user_id <> NEW.author_id
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
    SELECT DISTINCT CASE WHEN fr.requester_id = NEW.author_id THEN fr.recipient_id ELSE fr.requester_id END,
      NEW.author_id, 'post', NEW.id,
      CASE WHEN NEW.post_type = 'reel' THEN 'a publié un nouveau Réel.' ELSE 'a publié une nouvelle publication.' END
    FROM public.friend_requests fr
    WHERE fr.status = 'accepted' AND (fr.requester_id = NEW.author_id OR fr.recipient_id = NEW.author_id)
      AND CASE WHEN fr.requester_id = NEW.author_id THEN fr.recipient_id ELSE fr.requester_id END <> NEW.author_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_new_post() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_new_post_notice ON public.posts;
CREATE TRIGGER js_new_post_notice AFTER INSERT ON public.posts
FOR EACH ROW EXECUTE FUNCTION private.notify_new_post();

CREATE OR REPLACE FUNCTION private.notify_new_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE post_author uuid;
BEGIN
  SELECT p.author_id INTO post_author FROM public.posts p WHERE p.id = NEW.post_id;
  IF post_author IS NOT NULL AND post_author <> NEW.author_id THEN
    INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
    VALUES (post_author, NEW.author_id, 'comment', NEW.post_id, 'a commenté ta publication.');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_new_comment() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_comment_notice ON public.comments;
CREATE TRIGGER js_comment_notice AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION private.notify_new_comment();

CREATE OR REPLACE FUNCTION private.notify_new_reaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE post_author uuid;
BEGIN
  SELECT p.author_id INTO post_author FROM public.posts p WHERE p.id = NEW.post_id;
  IF post_author IS NOT NULL AND post_author <> NEW.user_id THEN
    INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
    VALUES (post_author, NEW.user_id, 'reaction', NEW.post_id, 'a réagi à ta publication.');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_new_reaction() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_reaction_notice ON public.reactions;
CREATE TRIGGER js_reaction_notice AFTER INSERT ON public.reactions
FOR EACH ROW EXECUTE FUNCTION private.notify_new_reaction();

CREATE OR REPLACE FUNCTION private.notify_new_story()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.visibility <> 'public' AND NEW.visibility <> 'friends' THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
  SELECT DISTINCT CASE WHEN fr.requester_id = NEW.author_id THEN fr.recipient_id ELSE fr.requester_id END,
    NEW.author_id, 'story', NEW.id, 'a publié une nouvelle story.'
  FROM public.friend_requests fr
  WHERE fr.status = 'accepted' AND (fr.requester_id = NEW.author_id OR fr.recipient_id = NEW.author_id)
    AND CASE WHEN fr.requester_id = NEW.author_id THEN fr.recipient_id ELSE fr.requester_id END <> NEW.author_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_new_story() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_story_notice ON public.stories;
CREATE TRIGGER js_story_notice AFTER INSERT ON public.stories
FOR EACH ROW EXECUTE FUNCTION private.notify_new_story();

CREATE OR REPLACE FUNCTION private.notify_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE conversation_label text;
BEGIN
  SELECT c.title INTO conversation_label FROM public.conversations c WHERE c.id = NEW.conversation_id;
  INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
  SELECT cm.user_id, NEW.sender_id, 'message', NEW.conversation_id,
    CASE WHEN conversation_label IS NULL OR conversation_label = '' THEN 't’a envoyé un message.' ELSE 'a écrit dans « ' || left(conversation_label, 120) || ' ». ' END
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id <> NEW.sender_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_new_message() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_message_notice ON public.messages;
CREATE TRIGGER js_message_notice AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.notify_new_message();

CREATE OR REPLACE FUNCTION private.notify_group_join_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE group_name text;
BEGIN
  SELECT c.title INTO group_name FROM public.conversations c WHERE c.id = NEW.conversation_id;
  INSERT INTO public.notifications(recipient_id, actor_id, notification_type, entity_id, body)
  SELECT cm.user_id, NEW.requester_id, 'group_join_request', NEW.conversation_id,
    'a demandé à rejoindre le groupe « ' || coalesce(left(group_name, 120), 'Jémor Space') || ' ». '
  FROM public.conversation_members cm
  WHERE cm.conversation_id = NEW.conversation_id AND cm.member_role IN ('admin','owner') AND cm.user_id <> NEW.requester_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.notify_group_join_request() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS js_group_join_request_notice ON public.group_join_requests;
CREATE TRIGGER js_group_join_request_notice AFTER INSERT ON public.group_join_requests
FOR EACH ROW WHEN (NEW.status = 'pending') EXECUTE FUNCTION private.notify_group_join_request();
