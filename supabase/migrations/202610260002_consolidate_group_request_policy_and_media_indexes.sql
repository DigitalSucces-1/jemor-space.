-- Performance and RLS policy cleanup for the Jémor Space media/group expansion.
DROP POLICY IF EXISTS group_join_requests_update_requester_retry ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_update_admin ON public.group_join_requests;
CREATE POLICY group_join_requests_update_admin ON public.group_join_requests
FOR UPDATE TO authenticated
USING (private.is_conversation_admin(conversation_id) OR (requester_id = (SELECT auth.uid()) AND status = 'rejected'))
WITH CHECK (private.is_conversation_admin(conversation_id) OR (requester_id = (SELECT auth.uid()) AND status = 'pending' AND private.can_request_private_group(conversation_id)));
CREATE INDEX IF NOT EXISTS group_join_requests_requester_idx ON public.group_join_requests(requester_id);
CREATE INDEX IF NOT EXISTS group_join_requests_reviewed_by_idx ON public.group_join_requests(reviewed_by);
CREATE INDEX IF NOT EXISTS message_hidden_for_user_idx ON public.message_hidden_for(user_id);
DROP INDEX IF EXISTS public.post_media_post_idx;
