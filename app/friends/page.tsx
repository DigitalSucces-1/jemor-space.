'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { ImageLightbox } from '@/components/image-lightbox';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import { Check, Clock3, LoaderCircle, MessageCircle, Search, UserCheck, UserPlus, UserRoundX, Users } from 'lucide-react';

 type FriendRequest = { id: string; requester_id: string; recipient_id: string; status: 'pending'|'accepted'|'rejected'; created_at: string };

export default function FriendsPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [previewImage, setPreviewImage] = useState<{src:string;label:string}|null>(null);

  const reload = useCallback(async () => {
    const supabase = createClient(); if (!supabase || !user) { setLoading(false); return; }
    setLoading(true);
    const [{ data: peopleData, error: peopleError }, { data: requestData, error: requestError }] = await Promise.all([
      supabase.from('profiles').select('id,username,full_name,bio,avatar_url,cover_url,website,city').neq('id', user.id).order('full_name').limit(100),
      supabase.from('friend_requests').select('id,requester_id,recipient_id,status,created_at').or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`).order('created_at', { ascending: false }),
    ]);
    if (peopleError) setError(peopleError.message);
    if (requestError) setError(requestError.message);
    const allPeople = (peopleData ?? []) as Profile[];
    const map = new Map(allPeople.map(p => [p.id, p]));
    setPeople(allPeople); setRequests((requestData ?? []) as FriendRequest[]); setProfiles(map); setLoading(false);
  }, [user?.id]);

  useEffect(() => { void reload(); }, [reload]);

  async function sendRequest(person: Profile) {
    const supabase = createClient(); if (!supabase || !user) return;
    setWorkingId(person.id); setError(''); setNotice('');
    const { error: requestError } = await supabase.from('friend_requests').insert({ requester_id: user.id, recipient_id: person.id, status: 'pending' });
    if (requestError) setError(requestError.code === '23505' ? 'Une demande existe déjà pour cette personne.' : requestError.message);
    else {
      setNotice(`Demande envoyée à ${person.full_name || person.username}.`); await reload();
    }
    setWorkingId(null);
  }

  async function respond(request: FriendRequest, accept: boolean) {
    const supabase = createClient(); if (!supabase || !user) return;
    setWorkingId(request.id); setError(''); setNotice('');
    const { error: updateError } = await supabase.from('friend_requests').update({ status: accept ? 'accepted' : 'rejected' }).eq('id', request.id);
    if (updateError) setError(updateError.message);
    else {
      setNotice(accept ? 'Vous êtes maintenant amis !' : 'Demande refusée.'); await reload();
    }
    setWorkingId(null);
  }

  const filteredPeople = people.filter(p => `${p.full_name} ${p.username} ${p.city ?? ''}`.toLowerCase().includes(query.toLowerCase()));
  const incoming = requests.filter(r => r.status === 'pending' && r.recipient_id === user?.id);
  const friends = requests.filter(r => r.status === 'accepted');

  function relationFor(person: Profile) {
    return requests.find(r => (r.requester_id === person.id && r.recipient_id === user?.id) || (r.requester_id === user?.id && r.recipient_id === person.id));
  }

  return <AppShell><div className="content-column">
    <div className="page-heading"><div><div className="eyebrow">LE PLAISIR D’ÊTRE ENSEMBLE</div><h1>Ton <span>cercle.</span></h1><p>Retrouve des personnes et fais grandir ta communauté.</p></div><div className="heading-icon"><Users size={22}/></div></div>
    {notice ? <div className="inline-alert success-alert"><span>{notice}</span><button onClick={() => setNotice('')}>×</button></div> : null}{error ? <div className="inline-alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div> : null}
    <section className="card-surface friends-search"><div className="search-box"><Search size={18}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un nom, un pseudo ou une ville…" aria-label="Rechercher des personnes"/></div><div className="search-meta"><span>{filteredPeople.length} personne{filteredPeople.length === 1 ? '' : 's'} dans les résultats</span><span className="search-meta-icon"><UserPlus size={15}/> Découvrir</span></div></section>
    {incoming.length > 0 ? <section className="friends-section"><div className="section-title-row"><div><h2>Demandes reçues</h2><p>Des personnes souhaitent rejoindre ton cercle.</p></div><span className="count-badge">{incoming.length}</span></div><div className="people-list">{incoming.map(req => { const person = profiles.get(req.requester_id); if (!person) return null; return <article className="person-row" key={req.id}><button type="button" className="avatar-preview-button" aria-label="Agrandir la photo" onClick={() => person.avatar_url && setPreviewImage({src:person.avatar_url,label:`Photo de ${person.full_name || person.username}`})} disabled={!person.avatar_url}><Avatar src={person.avatar_url} name={person.full_name} size="lg"/></button><div className="person-details"><strong>{person.full_name || person.username}</strong><span>@{person.username}{person.city ? ` · ${person.city}` : ''}</span></div><div className="person-actions"><button className="button button-primary button-small" disabled={workingId === req.id} onClick={() => void respond(req, true)}>{workingId === req.id ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} Accepter</button><button className="icon-button" title="Refuser" disabled={workingId === req.id} onClick={() => void respond(req, false)}><UserRoundX size={18}/></button></div></article>; })}</div></section> : null}
    {friends.length > 0 ? <section className="friends-section"><div className="section-title-row"><div><h2>Ton cercle</h2><p>Les personnes avec qui tu es connecté.</p></div><span className="count-badge neutral-count">{friends.length}</span></div><div className="people-grid">{friends.map(req => { const friendId = req.requester_id === user?.id ? req.recipient_id : req.requester_id; const person = profiles.get(friendId); if (!person) return null; return <article className="friend-card" key={req.id}><button type="button" className="avatar-preview-button" aria-label="Agrandir la photo" onClick={() => person.avatar_url && setPreviewImage({src:person.avatar_url,label:`Photo de ${person.full_name || person.username}`})} disabled={!person.avatar_url}><Avatar src={person.avatar_url} name={person.full_name} size="xl"/></button><strong>{person.full_name || person.username}</strong><span>@{person.username}</span><button className="button button-soft button-small" onClick={() => window.location.href = '/messages'}><MessageCircle size={15}/> Envoyer un message</button></article>; })}</div></section> : null}
    <section className="friends-section"><div className="section-title-row"><div><h2>{query ? 'Résultats' : 'Personnes à découvrir'}</h2><p>De nouvelles rencontres commencent parfois par un bonjour.</p></div></div>{loading ? <div className="loading-card"><LoaderCircle size={22} className="spin"/> Recherche des membres…</div> : filteredPeople.length === 0 ? <div className="empty-state compact-empty"><div className="empty-illustration"><Search size={26}/></div><h3>Aucun résultat pour le moment.</h3><p>Essaie un autre nom ou pseudo.</p></div> : <div className="people-grid">{filteredPeople.map(person => { const relationship = relationFor(person); const incomingPending = relationship?.status === 'pending' && relationship.recipient_id === user?.id; return <article className="friend-card" key={person.id}><button type="button" className="avatar-preview-button" aria-label="Agrandir la photo" onClick={() => person.avatar_url && setPreviewImage({src:person.avatar_url,label:`Photo de ${person.full_name || person.username}`})} disabled={!person.avatar_url}><Avatar src={person.avatar_url} name={person.full_name} size="xl"/></button><strong>{person.full_name || person.username}</strong><span>@{person.username}</span>{person.city ? <small><span>⌖</span> {person.city}</small> : <small className="person-bio">{person.bio || 'Membre de Jémor Space'}</small>}{relationship?.status === 'accepted' ? <button className="button button-soft button-small" disabled><UserCheck size={15}/> Déjà amis</button> : incomingPending ? <button className="button button-primary button-small" onClick={() => void respond(relationship, true)} disabled={workingId === relationship.id}><Check size={15}/> Accepter</button> : relationship?.status === 'pending' ? <button className="button button-quiet button-small" disabled><Clock3 size={15}/> En attente</button> : <button className="button button-outline button-small" onClick={() => void sendRequest(person)} disabled={workingId === person.id}>{workingId === person.id ? <LoaderCircle size={15} className="spin"/> : <UserPlus size={15}/>} Ajouter</button>}</article>; })}</div>}</section>
  {previewImage ? <ImageLightbox src={previewImage.src} label={previewImage.label} onClose={() => setPreviewImage(null)} /> : null}
  </div></AppShell>;
}
