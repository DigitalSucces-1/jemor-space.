'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Bell, CheckCheck, Heart, LoaderCircle, MessageCircle, UserPlus, Users, Sparkles, Newspaper } from 'lucide-react';
import { timeAgo } from '@/lib/types';

type Notice = { id: string; recipient_id: string; actor_id: string | null; notification_type: string; entity_id: string | null; body: string; read_at: string | null; created_at: string; actor?: { full_name: string; username: string; avatar_url: string | null } };

function noticeIcon(type: string) {
  if (type.startsWith('friend')) return <UserPlus size={17}/>;
  if (type === 'reaction') return <Heart size={17}/>;
  if (type === 'comment' || type === 'message') return <MessageCircle size={17}/>;
  if (type === 'post') return <Newspaper size={17}/>;
  if (type === 'group_join_request' || type === 'group_invite') return <Users size={17}/>;
  return <Sparkles size={17}/>;
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const supabase = createClient(); if (!supabase || !user) { setLoading(false); return; }
    setLoading(true);
    const readAt = new Date().toISOString();
    const { error: markError } = await supabase.from('notifications').update({ read_at: readAt }).eq('recipient_id', user.id).is('read_at', null);
    if (markError) setError(markError.message);
    const { data, error: loadError } = await supabase.from('notifications').select('id,recipient_id,actor_id,notification_type,entity_id,body,read_at,created_at').eq('recipient_id', user.id).order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    const rows = data ?? [];
    const actorIds = [...new Set(rows.map((n: any) => n.actor_id).filter(Boolean))];
    const { data: actors } = actorIds.length ? await supabase.from('profiles').select('id,full_name,username,avatar_url').in('id', actorIds) : { data: [] };
    const actorMap = new Map((actors ?? []).map((p: any) => [p.id, p]));
    setNotices(rows.map((n: any) => ({ ...n, actor: actorMap.get(n.actor_id) })) as Notice[]);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !user) return;
    const channel = supabase.channel(`notification-list-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, load]);

  async function markRead(notice: Notice) {
    if (notice.read_at) return;
    const supabase = createClient(); if (!supabase) return;
    const read_at = new Date().toISOString();
    const { error: updateError } = await supabase.from('notifications').update({ read_at }).eq('id', notice.id);
    if (updateError) setError(updateError.message); else setNotices(current => current.map(n => n.id === notice.id ? { ...n, read_at } : n));
  }

  async function markAllRead() {
    const supabase = createClient(); if (!supabase || !user) return;
    const read_at = new Date().toISOString();
    const { error: updateError } = await supabase.from('notifications').update({ read_at }).eq('recipient_id', user.id).is('read_at', null);
    if (updateError) setError(updateError.message); else setNotices(current => current.map(n => ({ ...n, read_at: n.read_at ?? read_at })));
  }

  async function openNotice(notice: Notice) {
    await markRead(notice);
    if (notice.notification_type.startsWith('friend')) router.push('/friends');
    else if (notice.notification_type === 'message' && notice.entity_id) router.push(`/messages?conversation=${encodeURIComponent(notice.entity_id)}`);
    else if (notice.notification_type.startsWith('group_')) router.push('/groups');
    else router.push('/');
  }

  const unread = notices.filter(n => !n.read_at).length;
  return <AppShell><div className="content-column">
    <div className="page-heading"><div><div className="eyebrow">LES NOUVELLES DE TON CERCLE</div><h1>Tes <span>notifications.</span></h1><p>Les interactions qui t’ont rapproché des autres.</p></div><div className="heading-icon"><Bell size={22}/></div></div>
    {error ? <div className="inline-alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div> : null}
    <section className="card-surface notification-panel"><div className="notification-panel-head"><div><strong>Activité récente</strong><span>{unread} non lue{unread === 1 ? '' : 's'}</span></div><button className="text-link" onClick={() => void markAllRead()} disabled={!unread}><CheckCheck size={15}/> Tout marquer comme lu</button></div>
      {loading ? <div className="loading-card"><LoaderCircle className="spin" size={22}/> Récupération des notifications…</div> : notices.length === 0 ? <div className="empty-state compact-empty"><div className="empty-illustration"><Bell size={27}/></div><h3>Tout est calme pour le moment.</h3><p>Quand il se passera quelque chose dans ton cercle, tu le verras ici.</p></div> : notices.map(n => <button key={n.id} className={`notification-row ${n.read_at ? '' : 'unread'}`} onClick={() => void openNotice(n)}><span className={`notification-type-icon type-${n.notification_type}`}>{noticeIcon(n.notification_type)}</span><Avatar src={n.actor?.avatar_url} name={n.actor?.full_name} size="md"/><span className="notification-copy"><strong>{n.actor?.full_name || 'Jémor Space'}</strong> {n.body || (n.notification_type === 'reaction' ? 'a réagi à ta publication.' : 'a interagi avec toi.')}<small>{timeAgo(n.created_at)}</small></span>{!n.read_at ? <i className="unread-dot"/> : null}</button>)}
    </section>
  </div></AppShell>;
}
