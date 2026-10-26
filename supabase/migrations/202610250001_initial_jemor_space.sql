-- Jémor Space schema baseline
-- Apply this to a fresh Supabase database. All exposed public tables use RLS.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  full_name text not null default '',
  bio text not null default '' check (char_length(bio) <= 500),
  avatar_url text,
  cover_url text,
  website text,
  city text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
create unique index if not exists friend_requests_unique_pair
  on public.friend_requests (least(requester_id, recipient_id), greatest(requester_id, recipient_id))
  where status in ('pending','accepted');
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_type text not null check (media_type in ('image','video')),
  storage_path text not null,
  alt_text text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null default 'like' check (reaction_type in ('like','love','haha','wow','sad','angry')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('admin','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 10000),
  media_path text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (char_length(body) > 0 or media_path is not null)
);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  notification_type text not null check (notification_type in ('friend_request','friend_accepted','reaction','comment','message','story')),
  entity_id uuid,
  body text not null default '' check (char_length(body) <= 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text,
  body text not null default '' check (char_length(body) <= 1000),
  visibility text not null default 'friends' check (visibility in ('public','friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (char_length(body) > 0 or media_path is not null)
);

create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists posts_feed_idx on public.posts (created_at desc);
create index if not exists post_media_post_idx on public.post_media (post_id, position);
create index if not exists comments_post_created_idx on public.comments (post_id, created_at);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists comments_parent_comment_idx on public.comments (parent_comment_id);
create index if not exists reactions_post_idx on public.reactions (post_id);
create index if not exists reactions_user_idx on public.reactions (user_id);
create index if not exists conversations_created_by_idx on public.conversations (created_by);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, joined_at desc);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id);
create index if not exists notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_actor_idx on public.notifications (actor_id);
create index if not exists stories_expiry_idx on public.stories (expires_at desc);
create index if not exists stories_author_idx on public.stories (author_id);
create index if not exists friend_requests_requester_idx on public.friend_requests (requester_id);
create index if not exists friend_requests_recipient_idx on public.friend_requests (recipient_id);

-- Profile creation on signup.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare base_username text; display_name text;
begin
  base_username := regexp_replace(lower(coalesce(nullif(new.raw_user_meta_data ->> 'username',''), nullif(split_part(coalesce(new.email,''),'@',1),''), 'member')), '[^a-z0-9_]', '', 'g');
  base_username := left(coalesce(nullif(base_username,''),'member'), 19) || '_' || left(replace(new.id::text,'-',''), 8);
  display_name := coalesce(nullif(new.raw_user_meta_data ->> 'full_name',''), nullif(new.raw_user_meta_data ->> 'name',''), nullif(split_part(coalesce(new.email,''),'@',1),''), 'Nouveau membre');
  insert into public.profiles (id, username, full_name) values (new.id, base_username, display_name) on conflict (id) do nothing;
  return new;
end; $$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_jemor_space on auth.users;
create trigger on_auth_user_created_jemor_space after insert on auth.users for each row execute function private.handle_new_user();

create or replace function private.guard_friend_request_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if new.requester_id is distinct from old.requester_id or new.recipient_id is distinct from old.recipient_id then raise exception 'Friend-request participants cannot be changed'; end if;
  if old.status <> 'pending' or new.status not in ('accepted','rejected') or (select auth.uid()) is distinct from old.recipient_id then raise exception 'Invalid friend-request transition'; end if;
  new.updated_at := now(); return new;
end; $$;
revoke all on function private.guard_friend_request_update() from public, anon, authenticated;
drop trigger if exists guard_friend_request_update on public.friend_requests;
create trigger guard_friend_request_update before update on public.friend_requests for each row execute function private.guard_friend_request_update();

-- Narrow helper functions prevent recursive RLS checks between conversation tables.
create or replace function private.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists(select 1 from public.conversation_members cm where cm.conversation_id = p_conversation_id and cm.user_id = auth.uid());
$$;
create or replace function private.is_conversation_creator(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog, public as $$
  select exists(select 1 from public.conversations c where c.id = p_conversation_id and c.created_by = auth.uid());
$$;
create or replace function private.guard_conversation_member_update()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  if (new.conversation_id is distinct from old.conversation_id or new.user_id is distinct from old.user_id or new.member_role is distinct from old.member_role)
    and not private.is_conversation_creator(old.conversation_id) then raise exception 'Only the conversation creator can change membership or roles'; end if;
  return new;
end; $$;
revoke all on function private.is_conversation_member(uuid) from public, anon, authenticated;
revoke all on function private.is_conversation_creator(uuid) from public, anon, authenticated;
revoke all on function private.guard_conversation_member_update() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;
grant execute on function private.is_conversation_creator(uuid) to authenticated;
drop trigger if exists guard_conversation_member_update on public.conversation_members;
create trigger guard_conversation_member_update before update on public.conversation_members for each row execute function private.guard_conversation_member_update();

alter table public.profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.stories enable row level security;

-- Policies on profiles and friend requests.
drop policy if exists profiles_select_signed_in on public.profiles;
create policy profiles_select_signed_in on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists friend_requests_select_involved on public.friend_requests;
create policy friend_requests_select_involved on public.friend_requests for select to authenticated using ((select auth.uid()) = requester_id or (select auth.uid()) = recipient_id);
drop policy if exists friend_requests_insert_requester on public.friend_requests;
create policy friend_requests_insert_requester on public.friend_requests for insert to authenticated with check (requester_id = (select auth.uid()) and status = 'pending' and requester_id <> recipient_id);
drop policy if exists friend_requests_update_recipient on public.friend_requests;
create policy friend_requests_update_recipient on public.friend_requests for update to authenticated using (recipient_id = (select auth.uid()) and status = 'pending') with check (recipient_id = (select auth.uid()) and status in ('accepted','rejected'));
drop policy if exists friend_requests_delete_involved on public.friend_requests;
create policy friend_requests_delete_involved on public.friend_requests for delete to authenticated using ((select auth.uid()) = requester_id or (select auth.uid()) = recipient_id);

-- Posts are public to signed-in members or visible to the author/friends according to visibility.
drop policy if exists posts_select_visible on public.posts;
create policy posts_select_visible on public.posts for select to authenticated using (
  author_id = (select auth.uid()) or visibility = 'public' or
  (visibility = 'friends' and exists (select 1 from public.friend_requests fr where fr.status = 'accepted' and
    ((fr.requester_id = posts.author_id and fr.recipient_id = (select auth.uid())) or (fr.recipient_id = posts.author_id and fr.requester_id = (select auth.uid()))))
);
drop policy if exists posts_insert_self on public.posts;
create policy posts_insert_self on public.posts for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists posts_update_self on public.posts;
create policy posts_update_self on public.posts for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists posts_delete_self on public.posts;
create policy posts_delete_self on public.posts for delete to authenticated using (author_id = (select auth.uid()));

-- Media and comments inherit visibility from the associated post.
drop policy if exists post_media_select_visible on public.post_media;
create policy post_media_select_visible on public.post_media for select to authenticated using (exists (select 1 from public.posts p where p.id = post_media.post_id));
drop policy if exists post_media_insert_post_owner on public.post_media;
create policy post_media_insert_post_owner on public.post_media for insert to authenticated with check (exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid())));
drop policy if exists post_media_delete_post_owner on public.post_media;
create policy post_media_delete_post_owner on public.post_media for delete to authenticated using (exists (select 1 from public.posts p where p.id = post_media.post_id and p.author_id = (select auth.uid())));
drop policy if exists comments_select_visible_posts on public.comments;
create policy comments_select_visible_posts on public.comments for select to authenticated using (exists (select 1 from public.posts p where p.id = comments.post_id));
drop policy if exists comments_insert_on_visible_posts on public.comments;
create policy comments_insert_on_visible_posts on public.comments for insert to authenticated with check (author_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = comments.post_id));
drop policy if exists comments_update_self on public.comments;
create policy comments_update_self on public.comments for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists comments_delete_self on public.comments;
create policy comments_delete_self on public.comments for delete to authenticated using (author_id = (select auth.uid()));
drop policy if exists reactions_select_visible_posts on public.reactions;
create policy reactions_select_visible_posts on public.reactions for select to authenticated using (exists (select 1 from public.posts p where p.id = reactions.post_id));
drop policy if exists reactions_insert_self on public.reactions;
create policy reactions_insert_self on public.reactions for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.posts p where p.id = reactions.post_id));
drop policy if exists reactions_delete_self on public.reactions;
create policy reactions_delete_self on public.reactions for delete to authenticated using (user_id = (select auth.uid()));

-- Conversations and chat messages.
drop policy if exists conversations_select_members_or_creator on public.conversations;
create policy conversations_select_members_or_creator on public.conversations for select to authenticated using (created_by = (select auth.uid()) or private.is_conversation_member(id));
drop policy if exists conversations_insert_creator on public.conversations;
create policy conversations_insert_creator on public.conversations for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists conversations_update_creator on public.conversations;
create policy conversations_update_creator on public.conversations for update to authenticated using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
drop policy if exists conversations_delete_creator on public.conversations;
create policy conversations_delete_creator on public.conversations for delete to authenticated using (created_by = (select auth.uid()));
drop policy if exists conversation_members_select_self on public.conversation_members;
create policy conversation_members_select_self on public.conversation_members for select to authenticated using (user_id = (select auth.uid()) or private.is_conversation_member(conversation_id));
drop policy if exists conversation_members_insert_creator_or_self on public.conversation_members;
create policy conversation_members_insert_creator_or_self on public.conversation_members for insert to authenticated with check (private.is_conversation_creator(conversation_id));
drop policy if exists conversation_members_update_creator_or_self on public.conversation_members;
create policy conversation_members_update_creator_or_self on public.conversation_members for update to authenticated using (user_id = (select auth.uid()) or private.is_conversation_creator(conversation_id)) with check (user_id = (select auth.uid()) or private.is_conversation_creator(conversation_id));
drop policy if exists conversation_members_delete_creator_or_self on public.conversation_members;
create policy conversation_members_delete_creator_or_self on public.conversation_members for delete to authenticated using (user_id = (select auth.uid()) or private.is_conversation_creator(conversation_id));
drop policy if exists messages_select_conversation_members on public.messages;
create policy messages_select_conversation_members on public.messages for select to authenticated using (private.is_conversation_member(conversation_id));
drop policy if exists messages_insert_conversation_members on public.messages;
create policy messages_insert_conversation_members on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and private.is_conversation_member(conversation_id));
drop policy if exists messages_update_sender on public.messages;
create policy messages_update_sender on public.messages for update to authenticated using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));
drop policy if exists messages_delete_sender on public.messages;
create policy messages_delete_sender on public.messages for delete to authenticated using (sender_id = (select auth.uid()));

-- Personal notifications and expiring stories.
drop policy if exists notifications_select_recipient on public.notifications;
create policy notifications_select_recipient on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
drop policy if exists notifications_update_recipient on public.notifications;
create policy notifications_update_recipient on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
drop policy if exists notifications_insert_actor on public.notifications;
create policy notifications_insert_actor on public.notifications for insert to authenticated with check (actor_id = (select auth.uid()) and recipient_id <> (select auth.uid()));
drop policy if exists stories_select_unexpired_visible on public.stories;
create policy stories_select_unexpired_visible on public.stories for select to authenticated using (
 expires_at > now() and (author_id = (select auth.uid()) or visibility = 'public' or (visibility = 'friends' and exists (select 1 from public.friend_requests fr where fr.status='accepted' and ((fr.requester_id=stories.author_id and fr.recipient_id=(select auth.uid())) or (fr.recipient_id=stories.author_id and fr.requester_id=(select auth.uid())))))
);
drop policy if exists stories_insert_self on public.stories;
create policy stories_insert_self on public.stories for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists stories_update_self on public.stories;
create policy stories_update_self on public.stories for update to authenticated using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists stories_delete_self on public.stories;
create policy stories_delete_self on public.stories for delete to authenticated using (author_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- File buckets: avatar files are public; post and story files are private and checked against their parent record.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('profile-avatars','profile-avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/avif']),
 ('post-media','post-media',false,52428800,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']),
 ('story-media','story-media',false,52428800,array['image/jpeg','image/png','image/webp','image/avif','video/mp4','video/webm']) on conflict (id) do nothing;
drop policy if exists js_avatars_read on storage.objects;
create policy js_avatars_read on storage.objects for select to anon, authenticated using (bucket_id='profile-avatars');
drop policy if exists js_avatars_insert_own on storage.objects;
create policy js_avatars_insert_own on storage.objects for insert to authenticated with check (bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_avatars_update_own on storage.objects;
create policy js_avatars_update_own on storage.objects for update to authenticated using (bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text) with check (bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_avatars_delete_own on storage.objects;
create policy js_avatars_delete_own on storage.objects for delete to authenticated using (bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_post_media_read_visible on storage.objects;
create policy js_post_media_read_visible on storage.objects for select to authenticated using (bucket_id='post-media' and exists (select 1 from public.posts p where p.id::text=split_part(storage.objects.name,'/',2) and (p.author_id=(select auth.uid()) or p.visibility='public' or (p.visibility='friends' and exists (select 1 from public.friend_requests fr where fr.status='accepted' and ((fr.requester_id=p.author_id and fr.recipient_id=(select auth.uid())) or (fr.recipient_id=p.author_id and fr.requester_id=(select auth.uid()))))))));
drop policy if exists js_post_media_insert_own on storage.objects;
create policy js_post_media_insert_own on storage.objects for insert to authenticated with check (bucket_id='post-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_post_media_update_own on storage.objects;
create policy js_post_media_update_own on storage.objects for update to authenticated using (bucket_id='post-media' and split_part(name,'/',1)=(select auth.uid())::text) with check (bucket_id='post-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_post_media_delete_own on storage.objects;
create policy js_post_media_delete_own on storage.objects for delete to authenticated using (bucket_id='post-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_story_media_read_visible on storage.objects;
create policy js_story_media_read_visible on storage.objects for select to authenticated using (bucket_id='story-media' and exists (select 1 from public.stories s where s.id::text=split_part(storage.objects.name,'/',2) and s.expires_at>now() and (s.author_id=(select auth.uid()) or s.visibility='public' or (s.visibility='friends' and exists (select 1 from public.friend_requests fr where fr.status='accepted' and ((fr.requester_id=s.author_id and fr.recipient_id=(select auth.uid())) or (fr.recipient_id=s.author_id and fr.requester_id=(select auth.uid()))))))));
drop policy if exists js_story_media_insert_own on storage.objects;
create policy js_story_media_insert_own on storage.objects for insert to authenticated with check (bucket_id='story-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_story_media_update_own on storage.objects;
create policy js_story_media_update_own on storage.objects for update to authenticated using (bucket_id='story-media' and split_part(name,'/',1)=(select auth.uid())::text) with check (bucket_id='story-media' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists js_story_media_delete_own on storage.objects;
create policy js_story_media_delete_own on storage.objects for delete to authenticated using (bucket_id='story-media' and split_part(name,'/',1)=(select auth.uid())::text);

do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then alter publication supabase_realtime add table public.messages; end if;
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications; end if;
  end if;
end $$;
