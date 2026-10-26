'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { createClient } from '@/lib/supabase/client';
import { inspectMedia, mediaKind, MAX_UPLOAD_BYTES, uploadMedia, signedMediaUrl } from '@/lib/media';
import type { Profile } from '@/lib/types';
import { timeAgo } from '@/lib/types';
import { ArrowDownLeft, ArrowUpRight, Check, CheckCheck, FileAudio, ImagePlus, LoaderCircle, MessageCircle, MoreHorizontal, Music2, Paperclip, Pencil, Plus, Search, Send, Smile, Square, Trash2, Users, Video, X, Mic } from 'lucide-react';

type Member = { user_id: string; member_role: string; last_read_at: string | null; profile?: Profile };
type Conversation = { id: string; title: string | null; is_group: boolean; created_by: string; created_at: string; updated_at: string; group_visibility?: 'public'|'private'; description?: string; label: string; avatar?: string | null; members: Member[]; lastMessage?: Message | null };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; media_path: string | null; media_type: 'image'|'video'|'audio'|'file'|null; mime_type?: string | null; media_name?: string | null; media_size?: number | null; media_width?: number | null; media_height?: number | null; duration_seconds?: number | null; created_at: string; edited_at: string | null; deleted_at: string | null; media_url?: string | null };

const MAX_MESSAGE_BYTES = MAX_UPLOAD_BYTES;

export default function MessagesPage() {
  const { user } = useAuth();
  const [requestedConversation, setRequestedConversation] = useState<string | null>(null);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('conversation');
    if (value) setRequestedConversation(value);
  }, []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [people, setPeople] = useState<Profile[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [newSearch, setNewSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [workingPerson, setWorkingPerson] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [menuMessageId, setMenuMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const voice = useVoiceRecorder();

  const loadConversations = useCallback(async () => {
    const supabase = createClient(); if (!supabase || !user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data: memberships, error: memberError } = await supabase.from('conversation_members').select('conversation_id,user_id,member_role,last_read_at').eq('user_id', user.id);
      if (memberError) throw memberError;
      const ids = [...new Set((memberships ?? []).map((m: any) => m.conversation_id))];
      if (!ids.length) { setConversations([]); setSelectedId(null); setLoading(false); return; }
      const [{ data: convData, error: convError }, { data: membersData }] = await Promise.all([
        supabase.from('conversations').select('id,title,is_group,created_by,created_at,updated_at,group_visibility,description').in('id', ids).order('updated_at', { ascending: false }),
        supabase.from('conversation_members').select('conversation_id,user_id,member_role,last_read_at').in('conversation_id', ids),
      ]);
      if (convError) throw convError;
      const profileIds = [...new Set((membersData ?? []).map((m: any) => m.user_id))];
      const { data: profiles } = profileIds.length ? await supabase.from('profiles').select('id,username,full_name,avatar_url,cover_url,bio,city,country_name,country_flag,websites,website').in('id', profileIds) : { data: [] };
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p as Profile]));
      const memberMap = new Map<string, Member[]>();
      for (const m of membersData ?? []) memberMap.set(m.conversation_id, [...(memberMap.get(m.conversation_id) ?? []), { ...m, profile: profileMap.get(m.user_id) }]);
      const convIds = (convData ?? []).map((c: any) => c.id);
      const { data: latestMessages } = convIds.length ? await supabase.from('messages').select('id,conversation_id,sender_id,body,media_path,media_type,created_at,edited_at,deleted_at').in('conversation_id', convIds).order('created_at', { ascending: false }).limit(Math.min(convIds.length * 3, 120)) : { data: [] };
      const latestMap = new Map<string, Message>();
      for (const m of latestMessages ?? []) if (!latestMap.has(m.conversation_id)) latestMap.set(m.conversation_id, m as Message);
      const next = (convData ?? []).map((c: any) => {
        const members = memberMap.get(c.id) ?? [];
        const others = members.filter(m => m.user_id !== user.id).map(m => m.profile).filter(Boolean) as Profile[];
        return { ...c, members, label: c.title || others.map(p => p.full_name || p.username).join(', ') || (c.is_group ? 'Groupe Jémor' : 'Conversation'), avatar: others[0]?.avatar_url, lastMessage: latestMap.get(c.id) ?? null } as Conversation;
      });
      setConversations(next);
      setSelectedId(current => {
        if (current && next.some(c => c.id === current)) return current;
        if (requestedConversation && next.some(c => c.id === requestedConversation)) return requestedConversation;
        return next[0]?.id ?? null;
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de charger les conversations.'); }
    finally { setLoading(false); }
  }, [user?.id, requestedConversation]);

  const loadMessages = useCallback(async (conversationId: string, markRead = false) => {
    const supabase = createClient(); if (!supabase || !user) return;
    setLoadingMessages(true);
    const { data, error: messageError } = await supabase.from('messages').select('id,conversation_id,sender_id,body,media_path,media_type,mime_type,media_name,media_size,media_width,media_height,duration_seconds,created_at,edited_at,deleted_at').eq('conversation_id', conversationId).order('created_at', { ascending: true }).limit(300);
    if (messageError) setError(messageError.message); else {
      const enriched: Message[] = [];
      for (const row of data ?? []) enriched.push({ ...(row as Message), media_url: await signedMediaUrl(supabase, 'message-media', (row as Message).media_path) });
      setMessages(enriched);
    }
    if (markRead) {
      await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', conversationId).eq('user_id', user.id);
      await loadConversations();
    }
    setLoadingMessages(false);
  }, [user?.id, loadConversations]);

  useEffect(() => { void loadConversations(); }, [loadConversations]);
  useEffect(() => { if (selectedId) void loadMessages(selectedId, true); else setMessages([]); }, [selectedId, loadMessages]);
  useEffect(() => {
    const supabase = createClient(); if (!supabase || !selectedId) return;
    const channel = supabase.channel(`jemor-messages-${selectedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedId}` }, () => { void loadMessages(selectedId); void loadConversations(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${selectedId}` }, () => { void loadConversations(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedId, loadMessages, loadConversations]);

  useEffect(() => {
    const supabase = createClient(); if (!supabase || !user) return;
    let alive = true;
    const run = async () => {
      if (!newSearch.trim()) { if (alive) setPeople([]); return; }
      const { data } = await supabase.from('profiles').select('id,username,full_name,bio,avatar_url,cover_url,website,websites,city,country_name,country_flag').neq('id', user.id).or(`full_name.ilike.%${newSearch.trim()}%,username.ilike.%${newSearch.trim()}%`).limit(8);
      if (alive) setPeople((data ?? []) as Profile[]);
    };
    void run(); return () => { alive = false; };
  }, [newSearch, user?.id]);

  async function openOrCreate(person: Profile) {
    const supabase = createClient(); if (!supabase || !user) return;
    setWorkingPerson(person.id); setError('');
    try {
      const existing = conversations.find(c => !c.is_group && c.members.some(m => m.user_id === person.id) && c.members.some(m => m.user_id === user.id));
      if (existing) { setSelectedId(existing.id); setShowNew(false); setNewSearch(''); setWorkingPerson(null); return; }
      const { data: newConversation, error: createError } = await supabase.from('conversations').insert({ created_by: user.id, is_group: false, title: null, group_visibility: 'private' }).select('id').single();
      if (createError) throw createError;
      const { error: membersError } = await supabase.from('conversation_members').insert([{ conversation_id: newConversation.id, user_id: user.id, member_role: 'admin' }, { conversation_id: newConversation.id, user_id: person.id, member_role: 'member' }]);
      if (membersError) throw membersError;
      await loadConversations(); setSelectedId(newConversation.id); setShowNew(false); setNewSearch('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de démarrer la conversation.'); }
    setWorkingPerson(null);
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault(); const supabase = createClient();
    if (!supabase || !user || !selectedId || (!draft.trim() && !file && !voice.recordedBlob)) return;
    if (file && file.size > MAX_MESSAGE_BYTES) { setError('Les pièces jointes sont limitées à 50 Mo.'); return; }
    setSending(true); setError('');
    try {
      const outgoingFile = file || (voice.recordedBlob ? new File([voice.recordedBlob], `vocal-${Date.now()}.webm`, { type: voice.recordedBlob.type || 'audio/webm' }) : null);
      const kind = outgoingFile ? mediaKind(outgoingFile) : null;
      const body = draft.trim() || (kind === 'audio' ? 'Message vocal' : kind === 'video' ? 'Vidéo' : kind === 'image' ? 'Photo' : 'Pièce jointe');
      const details = outgoingFile ? await inspectMedia(outgoingFile) : { width: null, height: null, durationSeconds: null };
      const insertPayload: Record<string, any> = { conversation_id: selectedId, sender_id: user.id, body, media_type: kind, mime_type: outgoingFile?.type ?? null, media_name: outgoingFile instanceof File ? outgoingFile.name : null, media_size: outgoingFile?.size ?? null, media_width: details.width, media_height: details.height, duration_seconds: details.durationSeconds };
      if (outgoingFile) insertPayload.media_path = await uploadMedia(supabase, 'message-media', user.id, selectedId, outgoingFile, kind || 'attachment');
      const { error } = await supabase.from('messages').insert(insertPayload);
      if (error) throw error;
      setDraft(''); setFile(null); voice.clear(); await loadMessages(selectedId); await loadConversations();
    } catch (e) { setError(e instanceof Error ? e.message : 'Le message n’a pas été envoyé. Réessaie.'); }
    finally { setSending(false); }
  }

  async function saveEditedMessage(message: Message) {
    const supabase = createClient(); if (!supabase || !user) return;
    const body = editDraft.trim(); if (!body) { setError('Le message ne peut pas être vide.'); return; }
    const { error } = await supabase.from('messages').update({ body, edited_at: new Date().toISOString() }).eq('id', message.id).eq('sender_id', user.id).is('deleted_at', null);
    if (error) setError(error.message); else { setEditingMessageId(null); setEditDraft(''); if (selectedId) await loadMessages(selectedId); }
  }

  async function deleteForMe(message: Message) {
    const supabase = createClient(); if (!supabase || !user) return;
    const { error } = await supabase.from('message_hidden_for').insert({ message_id: message.id, user_id: user.id });
    if (error && error.code !== '23505') setError(error.message); else { setMenuMessageId(null); if (selectedId) await loadMessages(selectedId); }
  }

  async function deleteForEveryone(message: Message) {
    const supabase = createClient(); if (!supabase || !user) return;
    if (!window.confirm('Supprimer ce message pour tous les participants ?')) return;
    const { error } = await supabase.from('messages').update({ body: '', deleted_at: new Date().toISOString(), media_path: null, media_type: null, edited_at: new Date().toISOString() }).eq('id', message.id).eq('sender_id', user.id);
    if (error) setError(error.message); else {
      if (message.media_path) await supabase.storage.from('message-media').remove([message.media_path]);
      setMenuMessageId(null); if (selectedId) await loadMessages(selectedId); await loadConversations();
    }
  }

  const visibleConversations = useMemo(() => conversations.filter(c => c.label.toLowerCase().includes(search.toLowerCase())), [conversations, search]);
  const current = conversations.find(c => c.id === selectedId) ?? null;
  const otherMembers = current?.members.filter(m => m.user_id !== user?.id) ?? [];
  const readByEveryone = (m: Message) => otherMembers.length > 0 && otherMembers.every(member => !!member.last_read_at && new Date(member.last_read_at).getTime() >= new Date(m.created_at).getTime());

  return <AppShell><div className="content-column messages-page-column">
    <div className="page-heading"><div><div className="eyebrow">TOUJOURS À PORTÉE DE MOT</div><h1>Tes <span>conversations.</span></h1><p>Messages, photos, vidéos et vocaux, en privé ou en groupe.</p></div><div className="heading-icon"><MessageCircle size={22}/></div></div>
    {error ? <div className="inline-alert"><span>{error}</span><button onClick={() => setError('')}><X size={16}/></button></div> : null}
    <section className="messages-workspace card-surface"><aside className="conversation-sidebar"><div className="conversations-head"><div><h2>Messages</h2><span>{conversations.length} conversation{conversations.length === 1 ? '' : 's'}</span></div><button className="round-action" title="Nouveau message" onClick={() => setShowNew(v => !v)}>{showNew ? <X size={18}/> : <Plus size={19}/>}</button></div><div className="conversation-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"/></div>
      {showNew ? <div className="new-message-box"><label>Commencer une conversation</label><div className="conversation-search new-search"><Search size={15}/><input value={newSearch} onChange={e => setNewSearch(e.target.value)} placeholder="Nom ou pseudo…"/></div>{people.map(person => <button className="new-person" key={person.id} onClick={() => void openOrCreate(person)} disabled={workingPerson === person.id}><Avatar src={person.avatar_url} name={person.full_name} size="sm"/><span><b>{person.full_name || person.username}</b><small>@{person.username}</small></span>{workingPerson === person.id ? <LoaderCircle size={15} className="spin"/> : <ArrowUpRight size={16}/>}</button>)}</div> : null}
      <div className="conversation-list">{loading ? <div className="mini-loading"><LoaderCircle size={18} className="spin"/></div> : visibleConversations.length ? visibleConversations.map(conv => <button key={conv.id} className={`conversation-item ${selectedId === conv.id ? 'selected' : ''}`} onClick={() => { setSelectedId(conv.id); setMenuMessageId(null); setEditingMessageId(null); }}><Avatar src={conv.avatar} name={conv.label} size="lg"/><span className="conversation-label"><b>{conv.label}{conv.is_group ? ' · Groupe' : ''}</b><small>{conv.lastMessage ? `${conv.lastMessage.sender_id === user?.id ? 'Vous : ' : ''}${conv.lastMessage.deleted_at ? 'Message supprimé' : conv.lastMessage.body}` : 'Commencez à discuter'}</small></span><span className="conversation-time">{conv.lastMessage ? timeAgo(conv.lastMessage.created_at) : ''}</span></button>) : <div className="empty-conversations"><div className="empty-chat-icon"><MessageCircle size={22}/></div><strong>Pas encore de messages</strong><p>Choisis une personne avec le bouton + pour démarrer.</p></div>}</div>
    </aside><section className="chat-panel">{current ? <><header className="chat-header"><Avatar src={current.avatar} name={current.label} size="md"/><div className="chat-header-person"><strong>{current.label}</strong><span>{current.is_group ? `${current.members.length} participant(s)` : 'Conversation privée'}</span></div><div className="chat-header-tools"><span className="secure-indicator"><CheckCheck size={15}/> Privé</span></div></header><div className="chat-date-chip">Espace de conversation</div><div className="message-list">{loadingMessages ? <div className="mini-loading"><LoaderCircle size={18} className="spin"/> Chargement des messages…</div> : messages.length ? messages.map(msg => <div key={msg.id} className={`message-row ${msg.sender_id === user?.id ? 'mine' : 'theirs'}`}>{msg.sender_id !== user?.id ? <Avatar src={current.members.find(m => m.user_id === msg.sender_id)?.profile?.avatar_url} name={current.members.find(m => m.user_id === msg.sender_id)?.profile?.full_name} size="xs"/> : null}<div className="message-bubble">{editingMessageId === msg.id ? <form className="message-edit-form" onSubmit={e => { e.preventDefault(); void saveEditedMessage(msg); }}><textarea value={editDraft} onChange={e => setEditDraft(e.target.value)} maxLength={10000} rows={2}/><div><button type="button" className="button button-quiet button-small" onClick={() => { setEditingMessageId(null); setEditDraft(''); }}>Annuler</button><button type="submit" className="button button-primary button-small">Enregistrer</button></div></form> : msg.deleted_at ? <p className="deleted-message"><em>Ce message a été supprimé.</em></p> : <><p>{msg.body}</p>{msg.media_url && msg.media_type === 'image' ? <img className="message-media-image" src={msg.media_url} alt={msg.media_name || 'Photo reçue'}/> : null}{msg.media_url && msg.media_type === 'video' ? <video className="message-media-video" controls playsInline preload="metadata" src={msg.media_url} width={msg.media_width || undefined} height={msg.media_height || undefined} style={{ width:'100%', height:'auto', maxHeight:420, objectFit:'contain', aspectRatio:msg.media_width && msg.media_height ? `${msg.media_width}/${msg.media_height}` : undefined }}/> : null}{msg.media_url && msg.media_type === 'audio' ? <audio className="message-media-audio" controls src={msg.media_url}/> : null}{msg.media_url && msg.media_type === 'file' ? <a className="message-file-link" href={msg.media_url} target="_blank" rel="noreferrer"><Paperclip size={15}/>{msg.media_name || 'Ouvrir la pièce jointe'}</a> : null}</>}
          <div className="message-bubble-footer"><span>{new Intl.DateTimeFormat('fr-FR', { hour:'2-digit', minute:'2-digit' }).format(new Date(msg.created_at))}{msg.edited_at && !msg.deleted_at ? ' · modifié' : ''}{msg.sender_id === user?.id ? readByEveryone(msg) ? <CheckCheck size={13} className="read-receipt is-read" title="Vu"/> : <Check size={13} className="read-receipt" title="Envoyé, pas encore vu"/> : null}</span>{msg.sender_id === user?.id && !msg.deleted_at ? <div className="message-menu-wrap"><button type="button" className="message-menu-button" aria-label="Options du message" onClick={() => setMenuMessageId(menuMessageId === msg.id ? null : msg.id)}><MoreHorizontal size={15}/></button>{menuMessageId === msg.id ? <div className="message-menu"><button onClick={() => { setEditingMessageId(msg.id); setEditDraft(msg.body); setMenuMessageId(null); }}><Pencil size={14}/> Modifier</button><button onClick={() => void deleteForMe(msg)}><Trash2 size={14}/> Supprimer pour moi</button><button className="danger-option" onClick={() => void deleteForEveryone(msg)}><Trash2 size={14}/> Supprimer pour tous</button></div> : null}</div> : null}</div>
        </div></div>) : <div className="chat-empty"><div className="empty-chat-icon"><MessageCircle size={24}/></div><strong>Le premier mot est à toi.</strong><p>Écris un message, envoie une photo ou enregistre un vocal.</p></div>}</div>
      <form className="message-compose message-compose-extended" onSubmit={sendMessage}><div className="message-compose-input"><input value={draft} onChange={e => setDraft(e.target.value)} maxLength={10000} placeholder="Écrire un message…" aria-label="Écrire un message"/><button type="button" className="compose-emotion" title="Ajouter un emoji" onClick={() => setDraft(v => `${v} 😊`)}><Smile size={18}/></button><label className="compose-emotion file-attach" title="Joindre une photo, vidéo ou audio"><Paperclip size={18}/><input type="file" hidden accept="image/*,video/*,audio/*,application/pdf" onChange={e => { const selected = e.target.files?.[0]; if (selected) { if (selected.size > MAX_MESSAGE_BYTES) setError('Les pièces jointes sont limitées à 50 Mo.'); else setFile(selected); } e.currentTarget.value=''; }}/></label><button type="button" className={`compose-emotion ${voice.isRecording ? 'recording' : ''}`} title={voice.isRecording ? 'Arrêter le vocal' : 'Enregistrer un vocal'} onClick={() => voice.isRecording ? voice.stop() : void voice.start()}>{voice.isRecording ? <Square size={17}/> : <Mic size={18}/>}</button></div><button className="send-message-button" type="submit" aria-label="Envoyer" disabled={(!draft.trim() && !file && !voice.recordedBlob) || sending || voice.isRecording}>{sending ? <LoaderCircle size={18} className="spin"/> : <Send size={18}/>}</button></form>{file ? <div className="message-attachment-pending"><Paperclip size={14}/><span>{file.name}</span><button onClick={() => setFile(null)} type="button" aria-label="Retirer la pièce jointe"><X size={14}/></button></div> : null}{voice.recordedUrl ? <div className="message-attachment-pending"><Mic size={14}/><span>Message vocal prêt</span><audio controls src={voice.recordedUrl}/><button onClick={voice.clear} type="button" aria-label="Retirer le vocal"><X size={14}/></button></div> : null}{voice.error ? <p className="form-message error-message">{voice.error}</p> : null}</> : <div className="chat-empty welcome-chat"><div className="chat-art"><div className="chat-art-circle"><MessageCircle size={33}/></div><span className="floating-heart">♡</span><span className="floating-star">✦</span></div><h2>Chaque lien commence par un mot.</h2><p>Ouvre une conversation existante ou contacte une personne de ton cercle.</p><button className="button button-primary" onClick={() => setShowNew(true)}><Plus size={16}/> Nouveau message</button></div>}</section></section>
  </div></AppShell>;
}
