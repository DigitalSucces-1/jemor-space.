-- Jémor Space feature expansion (additive; preserve existing user content)
alter table public.profiles
  add column if not exists country_code text,
  add column if not exists country_name text,
  add column if not exists country_flag text,
  add column if not exists websites text[] not null default '{}'::text[];

alter table public.posts
  add column if not exists post_type text not null default 'post' check (post_type in ('post','reel')),
  add column if not exists group_id uuid references public.conversations(id) on delete set null;
alter table public.post_media
  add column if not exists mime_type text,
  add column if not exists original_filename text,
  add column if not exists byte_size bigint,
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists duration_seconds numeric,
  add column if not exists thumbnail_path text;
alter table public.stories
  add column if not exists media_type text not null default 'text' check (media_type in ('text','image','video')),
  add column if not exists mime_type text,
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists duration_seconds numeric,
  add column if not exists audio_path text,
  add column if not exists music_path text,
  add column if not exists music_title text;
alter table public.messages
  add column if not exists media_type text check (media_type is null or media_type in ('image','video','audio','file')),
  add column if not exists mime_type text,
  add column if not exists media_name text,
  add column if not exists media_size bigint,
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists duration_seconds numeric;
alter table public.conversations
  add column if not exists group_visibility text not null default 'private' check (group_visibility in ('public','private')),
  add column if not exists description text not null default '',
  add column if not exists cover_path text,
  add column if not exists join_approval boolean not null default true;

create table if not exists public.message_hidden_for (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id,user_id)
);
create table if not exists public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique(conversation_id,requester_id)
);
create index if not exists post_media_post_position_idx on public.post_media(post_id,position);
create index if not exists posts_group_created_idx on public.posts(group_id,created_at desc);
create index if not exists posts_type_created_idx on public.posts(post_type,created_at desc);
create index if not exists group_join_requests_group_status_idx on public.group_join_requests(conversation_id,status,created_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id,created_at desc);

create or replace function private.is_conversation_admin(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$ select exists (select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=auth.uid() and cm.member_role in ('admin','owner')); $$;
create or replace function private.can_join_group(p_conversation_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$ select p_user_id=auth.uid() and exists (select 1 from public.conversations c where c.id=p_conversation_id and c.is_group=true and (c.group_visibility='public' or exists (select 1 from public.group_join_requests r where r.conversation_id=c.id and r.requester_id=p_user_id and r.status='approved'))); $$;
create or replace function private.can_request_private_group(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public
as $$ select exists (select 1 from public.conversations c where c.id=p_conversation_id and c.is_group=true and c.group_visibility='private') and not exists (select 1 from public.conversation_members cm where cm.conversation_id=p_conversation_id and cm.user_id=auth.uid()); $$;
revoke all on function private.is_conversation_admin(uuid) from public,anon;
revoke all on function private.can_join_group(uuid,uuid) from public,anon;
revoke all on function private.can_request_private_group(uuid) from public,anon;
grant execute on function private.is_conversation_admin(uuid) to authenticated;
grant execute on function private.can_join_group(uuid,uuid) to authenticated;
grant execute on function private.can_request_private_group(uuid) to authenticated;

-- Public groups are discoverable; the visibility of private-group posts still depends on membership.
drop policy if exists conversations_select_members_or_creator on public.conversations;
create policy conversations_select_members_or_creator on public.conversations for select to authenticated using (created_by=(select auth.uid()) or private.is_conversation_member(id) or is_group=true);
drop policy if exists conversations_update_creator on public.conversations;
create policy conversations_update_creator on public.conversations for update to authenticated using (created_by=(select auth.uid()) or private.is_conversation_admin(id)) with check (created_by=(select auth.uid()) or private.is_conversation_admin(id));
drop policy if exists conversation_members_insert_creator_or_self on public.conversation_members;
create policy conversation_members_insert_creator_or_self on public.conversation_members for insert to authenticated with check (private.is_conversation_creator(conversation_id) or private.is_conversation_admin(conversation_id) or (user_id=(select auth.uid()) and private.can_join_group(conversation_id,user_id)));
drop policy if exists conversation_members_update_creator_or_self on public.conversation_members;
create policy conversation_members_update_creator_or_self on public.conversation_members for update to authenticated using (user_id=(select auth.uid()) or private.is_conversation_creator(conversation_id) or private.is_conversation_admin(conversation_id)) with check (user_id=(select auth.uid()) or private.is_conversation_creator(conversation_id) or private.is_conversation_admin(conversation_id));
create or replace function private.guard_conversation_member_update() returns trigger language plpgsql set search_path=pg_catalog,public as $$ begin if (new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id or new.member_role is distinct from old.member_role) and not private.is_conversation_creator(old.conversation_id) and not private.is_conversation_admin(old.conversation_id) then raise exception 'Only a group creator or administrator can change membership or roles'; end if; return new; end; $$;

alter table public.message_hidden_for enable row level security;
drop policy if exists message_hidden_select_own on public.message_hidden_for;
create policy message_hidden_select_own on public.message_hidden_for for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists message_hidden_insert_own on public.message_hidden_for;
create policy message_hidden_insert_own on public.message_hidden_for for insert to authenticated with check (user_id=(select auth.uid()) and exists (select 1 from public.messages m where m.id=message_id and private.is_conversation_member(m.conversation_id)));
drop policy if exists message_hidden_delete_own on public.message_hidden_for;
create policy message_hidden_delete_own on public.message_hidden_for for delete to authenticated using (user_id=(select auth.uid()));
drop policy if exists messages_select_conversation_members on public.messages;
create policy messages_select_conversation_members on public.messages for select to authenticated using (private.is_conversation_member(conversation_id) and not exists (select 1 from public.message_hidden_for h where h.message_id=messages.id and h.user_id=(select auth.uid())));

alter table public.group_join_requests enable row level security;
drop policy if exists group_join_requests_select_requester_or_admin on public.group_join_requests;
create policy group_join_requests_select_requester_or_admin on public.group_join_requests for select to authenticated using (requester_id=(select auth.uid()) or private.is_conversation_admin(conversation_id));
drop policy if exists group_join_requests_insert_self on public.group_join_requests;
create policy group_join_requests_insert_self on public.group_join_requests for insert to authenticated with check (requester_id=(select auth.uid()) and private.can_request_private_group(conversation_id) and status='pending');
drop policy if exists group_join_requests_update_admin on public.group_join_requests;
drop policy if exists group_join_requests_update_requester_retry on public.group_join_requests;
create policy group_join_requests_update_admin on public.group_join_requests for update to authenticated
using (private.is_conversation_admin(conversation_id) or (requester_id=(select auth.uid()) and status='rejected'))
with check (private.is_conversation_admin(conversation_id) or (requester_id=(select auth.uid()) and status='pending' and private.can_request_private_group(conversation_id)));

drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible on public.posts for select to authenticated using (
  author_id=(select auth.uid())
  or (group_id is null and (visibility='public' or (visibility='friends' and exists (select 1 from public.friend_requests fr where fr.status='accepted' and ((fr.requester_id=posts.author_id and fr.recipient_id=(select auth.uid())) or (fr.recipient_id=posts.author_id and fr.requester_id=(select auth.uid())))))))
  or (group_id is not null and exists (select 1 from public.conversations c where c.id=posts.group_id and c.is_group=true and ((c.group_visibility='public' and posts.visibility='public') or private.is_conversation_member(c.id))))
);
drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts for insert to authenticated with check (author_id=(select auth.uid()) and (group_id is null or exists (select 1 from public.conversations c where c.id=group_id and c.is_group=true and (c.group_visibility='public' or private.is_conversation_member(c.id)))));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('message-media','message-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/aac','application/pdf']) on conflict (id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists js_message_media_insert_own on storage.objects;
create policy js_message_media_insert_own on storage.objects for insert to authenticated with check (bucket_id='message-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_message_media_update_own on storage.objects;
create policy js_message_media_update_own on storage.objects for update to authenticated using (bucket_id='message-media' and split_part(name,'/',1)=(select auth.uid())::text) with check (bucket_id='message-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_message_media_delete_own on storage.objects;
create policy js_message_media_delete_own on storage.objects for delete to authenticated using (bucket_id='message-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_message_media_read_members on storage.objects;
create policy js_message_media_read_members on storage.objects for select to authenticated using (bucket_id='message-media' and private.is_conversation_member(split_part(name,'/',2)::uuid));
update storage.buckets set file_size_limit=52428800,allowed_mime_types=array['image/jpeg','image/png','image/webp','image/gif','image/avif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/mp4','audio/webm','audio/ogg','audio/wav','audio/aac'] where id in ('post-media','story-media');
revoke execute on function public.rls_auto_enable() from public,anon,authenticated;
