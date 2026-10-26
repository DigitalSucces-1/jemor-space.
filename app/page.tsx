'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/hooks/use-auth';
import { useVoiceRecorder } from '@/hooks/use-voice-recorder';
import { createClient } from '@/lib/supabase/client';
import { ALLOWED_MEDIA_TYPES, inspectMedia, mediaKind, MAX_UPLOAD_BYTES, uploadMedia, signedMediaUrl } from '@/lib/media';
import type { Comment, Post, PostMedia, Profile, Story } from '@/lib/types';
import { timeAgo } from '@/lib/types';
import { Camera, Clapperboard, FileAudio, Heart, ImagePlus, LoaderCircle, MessageCircle, Music2, Pause, Play, Plus, Send, Share2, Sparkles, Trash2, Upload, Video, X, Mic, Square, Check } from 'lucide-react';

type PostRow = Post & { group_id?: string | null };
type GroupProfile = Pick<Profile, 'id'|'username'|'full_name'|'avatar_url'>;

function validateMedia(file: File, allowAudio = false): string | null {
  const accepted = [...ALLOWED_MEDIA_TYPES];
  if (!accepted.includes(file.type)) return 'Format non pris en charge. Utilise une image, une vidéo' + (allowAudio ? ' ou un fichier audio' : '') + ' compatible.';
  if (!allowAudio && file.type.startsWith('audio/')) return 'Les publications acceptent des images et des vidéos. Ajoute la musique dans une story.';
  if (file.size > MAX_UPLOAD_BYTES) return 'Chaque fichier doit faire 50 Mo maximum.';
  return null;
}

export default function FeedPage() {
  const { user, profile } = useAuth();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [draft, setDraft] = useState('');
  const [postFiles, setPostFiles] = useState<File[]>([]);
  const [storyDraft, setStoryDraft] = useState('');
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyMusic, setStoryMusic] = useState<File | null>(null);
  const [storyVisibility, setStoryVisibility] = useState<'public'|'friends'>('friends');
  const [storyModal, setStoryModal] = useState(false);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [previewImage, setPreviewImage] = useState<{src:string;label:string}|null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [expandedComments, setExpandedComments] = useState<string | null>(null);
  const [busyPost, setBusyPost] = useState(false);
  const [busyStory, setBusyStory] = useState(false);
  const [busyComment, setBusyComment] = useState<string | null>(null);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState('');
  const voice = useVoiceRecorder();

  const loadFeed = useCallback(async () => {
    const supabase = createClient();
    if (!supabase || !user) { setLoadingFeed(false); return; }
    setLoadingFeed(true); setFeedError('');
    try {
      const [{ data: rawPosts, error: postError }, { data: rawStories, error: storyError }] = await Promise.all([
        supabase.from('posts').select('id,author_id,body,visibility,post_type,group_id,created_at').order('created_at', { ascending: false }).limit(40),
        supabase.from('stories').select('id,author_id,body,media_path,media_type,mime_type,media_width,media_height,duration_seconds,audio_path,music_path,music_title,visibility,created_at,expires_at').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(30),
      ]);
      if (postError) throw postError;
      if (storyError) throw storyError;
      const postRows = rawPosts ?? [];
      const storyRows = rawStories ?? [];
      const postIds = postRows.map((p: any) => p.id as string);
      let rawComments: any[] = [];
      let rawReactions: any[] = [];
      let rawMedia: any[] = [];
      if (postIds.length) {
        const [commentsResult, reactionsResult, mediaResult] = await Promise.all([
          supabase.from('comments').select('id,post_id,author_id,body,created_at').in('post_id', postIds).order('created_at', { ascending: true }),
          supabase.from('reactions').select('post_id,user_id').in('post_id', postIds),
          supabase.from('post_media').select('id,post_id,media_type,storage_path,mime_type,original_filename,byte_size,width,height,duration_seconds,position').in('post_id', postIds).order('position', { ascending: true }),
        ]);
        if (mediaResult.error) throw mediaResult.error;
        rawComments = commentsResult.data ?? [];
        rawReactions = reactionsResult.data ?? [];
        rawMedia = mediaResult.data ?? [];
      }
      const ids = [...new Set([...postRows.map((p: any) => p.author_id), ...storyRows.map((s: any) => s.author_id), ...rawComments.map((c: any) => c.author_id)])];
      const { data: profiles } = ids.length ? await supabase.from('profiles').select('id,username,full_name,avatar_url,cover_url').in('id', ids) : { data: [] };
      const authorMap = new Map((profiles ?? []).map((p: any) => [p.id, p as GroupProfile]));
      const mediaByPost = new Map<string, PostMedia[]>();
      for (const row of rawMedia) {
        const url = await signedMediaUrl(supabase, 'post-media', row.storage_path);
        const list = mediaByPost.get(row.post_id) ?? [];
        list.push({ ...row, url }); mediaByPost.set(row.post_id, list);
      }
      const commentsByPost = new Map<string, Comment[]>();
      for (const c of rawComments) {
        const list = commentsByPost.get(c.post_id) ?? [];
        list.push({ ...c, author: authorMap.get(c.author_id) }); commentsByPost.set(c.post_id, list);
      }
      const reactionsByPost = new Map<string, any[]>();
      for (const reaction of rawReactions) {
        const list = reactionsByPost.get(reaction.post_id) ?? [];
        list.push(reaction); reactionsByPost.set(reaction.post_id, list);
      }
      setPosts(postRows.map((p: any) => {
        const reactions = reactionsByPost.get(p.id) ?? [];
        const media = mediaByPost.get(p.id) ?? [];
        return { ...p, post_type: p.post_type || (media.some(m => m.media_type === 'video') ? 'reel' : 'post'), author: authorMap.get(p.author_id), media, comments: commentsByPost.get(p.id) ?? [], reactions_count: reactions.length, reacted: reactions.some((r: any) => r.user_id === user.id) } as PostRow;
      }));
      const enrichedStories: Story[] = [];
      for (const row of storyRows as any[]) {
        enrichedStories.push({
          ...row,
          author: authorMap.get(row.author_id),
          media_url: await signedMediaUrl(supabase, 'story-media', row.media_path),
          audio_url: await signedMediaUrl(supabase, 'story-media', row.audio_path),
          music_url: await signedMediaUrl(supabase, 'story-media', row.music_path),
        });
      }
      setStories(enrichedStories);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Impossible de charger le fil d’actualité.');
    } finally { setLoadingFeed(false); }
  }, [user?.id]);

  useEffect(() => { void loadFeed(); }, [loadFeed]);

  function choosePostFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const invalid = incoming.map(file => validateMedia(file)).find(Boolean);
    if (invalid) { setFeedError(invalid); return; }
    setFeedError('');
    setPostFiles(current => [...current, ...incoming].slice(0, 10));
  }

  async function publishPost(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim(); const supabase = createClient();
    if ((!body && !postFiles.length) || !user || !supabase) return;
    setBusyPost(true); setFeedError('');
    try {
      const isReel = postFiles.some(f => f.type.startsWith('video/')) && postFiles.length === 1;
      const { data: post, error } = await supabase.from('posts').insert({ author_id: user.id, body, visibility: 'public', post_type: isReel ? 'reel' : 'post' }).select('id').single();
      if (error) throw error;
      const mediaRows = [];
      for (let i = 0; i < postFiles.length; i++) {
        const file = postFiles[i];
        const details = await inspectMedia(file);
        const path = await uploadMedia(supabase, 'post-media', user.id, post.id, file, 'post');
        mediaRows.push({ post_id: post.id, media_type: mediaKind(file), storage_path: path, mime_type: file.type, original_filename: file.name, byte_size: file.size, width: details.width, height: details.height, duration_seconds: details.durationSeconds, position: i });
      }
      if (mediaRows.length) {
        const { error: mediaError } = await supabase.from('post_media').insert(mediaRows);
        if (mediaError) throw mediaError;
      }
      setDraft(''); setPostFiles([]); await loadFeed();
    } catch (e) { setFeedError(e instanceof Error ? e.message : 'La publication n’a pas pu être envoyée. Réessaie.'); }
    finally { setBusyPost(false); }
  }

  async function publishStory(event: FormEvent) {
    event.preventDefault(); const supabase = createClient();
    if (!user || !supabase || (!storyDraft.trim() && !storyFile && !storyMusic && !voice.recordedBlob)) return;
    if (storyFile) { const invalid = validateMedia(storyFile); if (invalid) { setFeedError(invalid); return; } }
    if (storyMusic && (!storyMusic.type.startsWith('audio/') || storyMusic.size > MAX_UPLOAD_BYTES)) { setFeedError('La musique doit être un fichier audio de 50 Mo maximum.'); return; }
    setBusyStory(true); setFeedError('');
    try {
      const details = storyFile ? await inspectMedia(storyFile) : { width: null, height: null, durationSeconds: null };
      const type = storyFile ? mediaKind(storyFile) : 'text';
      const { data: story, error } = await supabase.from('stories').insert({ author_id: user.id, body: storyDraft.trim(), visibility: storyVisibility, media_type: type, mime_type: storyFile?.type ?? null, media_width: details.width, media_height: details.height, duration_seconds: details.durationSeconds, music_title: storyMusic?.name ?? null }).select('id').single();
      if (error) throw error;
      const update: Record<string, any> = {};
      if (storyFile) update.media_path = await uploadMedia(supabase, 'story-media', user.id, story.id, storyFile, 'story');
      if (voice.recordedBlob) {
        const voiceFile = new File([voice.recordedBlob], `voice-${Date.now()}.webm`, { type: voice.recordedBlob.type || 'audio/webm' });
        update.audio_path = await uploadMedia(supabase, 'story-media', user.id, story.id, voiceFile, 'voice');
      }
      if (storyMusic) update.music_path = await uploadMedia(supabase, 'story-media', user.id, story.id, storyMusic, 'music');
      if (Object.keys(update).length) {
        const { error: updateError } = await supabase.from('stories').update(update).eq('id', story.id);
        if (updateError) throw updateError;
      }
      setStoryDraft(''); setStoryFile(null); setStoryMusic(null); setStoryVisibility('friends'); voice.clear(); setStoryModal(false); await loadFeed();
    } catch (e) { setFeedError(e instanceof Error ? e.message : 'La story n’a pas pu être publiée.'); }
    finally { setBusyStory(false); }
  }

  async function toggleReaction(post: PostRow) {
    const supabase = createClient(); if (!supabase || !user) return;
    if (post.reacted) {
      const { error } = await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', user.id);
      if (error) { setFeedError(error.message); return; }
    } else {
      const { error } = await supabase.from('reactions').insert({ post_id: post.id, user_id: user.id, reaction_type: 'like' });
      if (error) { setFeedError(error.message); return; }
    }
    setPosts(current => current.map(p => p.id === post.id ? { ...p, reacted: !p.reacted, reactions_count: Math.max(0, p.reactions_count + (p.reacted ? -1 : 1)) } : p));
  }

  async function addComment(event: FormEvent, postId: string) {
    event.preventDefault(); const body = (commentDrafts[postId] ?? '').trim(); const supabase = createClient();
    if (!body || !user || !supabase) return;
    setBusyComment(postId);
    const { error } = await supabase.from('comments').insert({ post_id: postId, author_id: user.id, body });
    if (error) setFeedError(error.message);
    else { setCommentDrafts(current => ({ ...current, [postId]: '' })); setExpandedComments(postId); await loadFeed(); }
    setBusyComment(null);
  }

  async function sharePost(post: PostRow) {
    const url = `${window.location.origin}/#post-${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Jémor Space', text: post.body.slice(0, 140), url });
      else { await navigator.clipboard.writeText(url); setFeedError('Lien de la publication copié.'); }
    } catch { /* Share dialog canceled. */ }
  }

  function openStory(story: Story) { setActiveStory(story); }

  const displayStories = useMemo(() => stories.filter(s => s.author_id !== user?.id), [stories, user?.id]);

  return <AppShell><div className="content-column">
    <div className="page-heading feed-heading"><div><div className="eyebrow">TON CERCLE, TON QUOTIDIEN</div><h1>Le fil <span>des moments.</span></h1><p>Textes, photos et vidéos de ta communauté.</p></div><div className="heading-icon"><Sparkles size={22}/></div></div>

    <section className="stories-section"><div className="section-line"><div><h2>Les stories</h2><span className="muted tiny-copy">Photos, vidéos, musique, texte et vocaux</span></div><button className="text-link" onClick={() => setStoryModal(true)}>Créer une story <Plus size={15}/></button></div><div className="stories-row"><button className="story-create" onClick={() => setStoryModal(true)}><span className="story-add"><Plus size={20}/></span><span><b>Ta story</b><small>Partager un instant</small></span></button>{displayStories.map(story => <button key={story.id} className="story-bubble" onClick={() => openStory(story)}><span className="story-avatar-ring"><Avatar src={story.author?.avatar_url} name={story.author?.full_name} size="md"/></span><b>{story.author?.full_name?.split(' ')[0] || 'Membre'}</b></button>)}{displayStories.length === 0 && <span className="muted tiny-copy">Les stories de tes amis apparaîtront ici.</span>}</div></section>

    <section className="composer card-surface"><div className="composer-head"><Avatar src={profile?.avatar_url} name={profile?.full_name || user?.email} size="lg"/><div><strong>Quoi de neuf, {profile?.full_name?.split(' ')[0] || 'toi'} ?</strong><span>Écris, partage une photo ou publie une vidéo.</span></div></div><form onSubmit={publishPost}><textarea className="composer-input" placeholder="Une idée, un moment, une bonne nouvelle…" value={draft} onChange={e => setDraft(e.target.value)} maxLength={10000} rows={3}/><div className="media-file-list">{postFiles.map((f,i)=><span className="media-file-chip" key={`${f.name}-${i}`}><span>{f.type.startsWith('video/') ? <Video size={14}/> : <ImagePlus size={14}/>} {f.name}</span><button type="button" onClick={() => setPostFiles(old => old.filter((_,j) => j !== i))} aria-label={`Retirer ${f.name}`}><X size={14}/></button></span>)}</div><div className="composer-bottom"><div className="composer-tools"><label className="media-picker-button"><ImagePlus size={17}/> Photo / vidéo<input type="file" accept="image/*,video/*" multiple hidden onChange={e => { choosePostFiles(e.target.files); e.currentTarget.value = ''; }}/></label><span className="visibility-label"><span className="visibility-dot"/> Public</span></div><button type="submit" className="button button-primary" disabled={(!draft.trim() && !postFiles.length) || busyPost}>{busyPost ? <LoaderCircle size={16} className="spin"/> : <Send size={16}/>} Publier</button></div><p className="tiny-copy muted composer-help">Jusqu’à 10 fichiers par publication, 50 Mo maximum par fichier. Les vidéos gardent leur cadrage d’origine.</p></form></section>

    {feedError ? <div className="inline-alert" role="status"><span>{feedError}</span><button onClick={() => setFeedError('')} aria-label="Fermer"><X size={16}/></button></div> : null}
    <div className="feed-list-heading"><h2>À découvrir</h2><span className="feed-count">{posts.length} publication{posts.length === 1 ? '' : 's'}</span></div>
    {loadingFeed ? <div className="loading-card"><LoaderCircle className="spin" size={23}/><span>On rassemble les dernières nouvelles…</span></div> : posts.length === 0 ? <div className="empty-state"><div className="empty-illustration"><MessageCircle size={30}/><Sparkles size={16}/></div><h3>Le début de ton histoire.</h3><p>Il n’y a pas encore de publication visible. Partage le premier moment pour lancer la conversation.</p></div> : posts.map(post => <article className="post-card card-surface" id={`post-${post.id}`} key={post.id}>
      <div className="post-header"><button type="button" className="avatar-preview-button" onClick={() => post.author?.avatar_url && setPreviewImage({src:post.author.avatar_url,label:`Photo de ${post.author.full_name || post.author.username}`})} aria-label="Agrandir la photo de l’auteur" disabled={!post.author?.avatar_url}><Avatar src={post.author?.avatar_url} name={post.author?.full_name} size="lg"/></button><div className="post-author"><strong>{post.author?.full_name || 'Membre Jémor'}</strong><span>@{post.author?.username || 'membre'} · {timeAgo(post.created_at)}{post.post_type === 'reel' ? ' · Réel' : ''}</span></div>{post.post_type === 'reel' ? <span className="content-type-badge"><Clapperboard size={13}/> Réel</span> : null}</div>
      {post.body ? <p className="post-body">{post.body}</p> : null}
      {post.media?.length ? <div className={`post-media-grid ${post.media.length > 1 ? 'multiple' : ''}`}>{post.media.map(item => <div className="post-media-item" key={item.id}>{item.media_type === 'video' ? <video controls playsInline preload="metadata" src={item.url || undefined} width={item.width || undefined} height={item.height || undefined} style={{ width: '100%', height: 'auto', maxHeight: 640, objectFit: 'contain', aspectRatio: item.width && item.height ? `${item.width}/${item.height}` : undefined }} aria-label={item.original_filename || 'Vidéo publiée'}/> : item.media_type === 'image' ? <img src={item.url || ''} alt={item.original_filename || 'Photo publiée'} style={{ width: '100%', height: 'auto', maxHeight: 640, objectFit: 'contain' }}/> : null}</div>)}</div> : null}
      <div className="post-stats"><span><span className="tiny-reaction"><Heart size={11} fill="currentColor"/></span> {post.reactions_count} réaction{post.reactions_count === 1 ? '' : 's'}</span><button onClick={() => setExpandedComments(expandedComments === post.id ? null : post.id)}>{post.comments.length} commentaire{post.comments.length === 1 ? '' : 's'}</button></div>
      <div className="post-actions"><button className={post.reacted ? 'post-action active' : 'post-action'} onClick={() => void toggleReaction(post)}><Heart size={18} fill={post.reacted ? 'currentColor' : 'none'}/><span>J’aime</span></button><button className="post-action" onClick={() => setExpandedComments(expandedComments === post.id ? null : post.id)}><MessageCircle size={18}/><span>Commenter</span></button><button className="post-action" onClick={() => void sharePost(post)}><Share2 size={18}/><span>Partager</span></button></div>
      {expandedComments === post.id ? <div className="comments-area">{post.comments.map(comment => <div className="comment-row" key={comment.id}><button type="button" className="avatar-preview-button" onClick={() => comment.author?.avatar_url && setPreviewImage({src:comment.author.avatar_url,label:`Photo de ${comment.author.full_name || comment.author.username}`})} aria-label="Agrandir la photo" disabled={!comment.author?.avatar_url}><Avatar src={comment.author?.avatar_url} name={comment.author?.full_name} size="sm"/></button><div className="comment-bubble"><strong>{comment.author?.full_name || 'Membre'}</strong><p>{comment.body}</p><small>{timeAgo(comment.created_at)}</small></div></div>)}<form className="comment-form" onSubmit={e => void addComment(e, post.id)}><Avatar src={profile?.avatar_url} name={profile?.full_name} size="sm"/><input value={commentDrafts[post.id] ?? ''} onChange={e => setCommentDrafts(old => ({ ...old, [post.id]: e.target.value }))} placeholder="Écrire un commentaire…" maxLength={3000}/><button type="submit" disabled={busyComment === post.id || !(commentDrafts[post.id] ?? '').trim()} aria-label="Envoyer le commentaire">{busyComment === post.id ? <LoaderCircle size={16} className="spin"/> : <Send size={16}/>}</button></form></div> : null}
    </article>)}
    <div className="feed-end"><span/><span>Tu es à jour</span><span/></div>
  </div>

  {storyModal ? <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) { setStoryModal(false); voice.clear(); } }}><section className="modal-card story-modal" role="dialog" aria-modal="true" aria-labelledby="story-title"><div className="modal-heading"><div><div className="eyebrow">UN INSTANT À PARTAGER</div><h2 id="story-title">Créer une story</h2></div><button className="icon-button" onClick={() => { setStoryModal(false); voice.clear(); }} aria-label="Fermer"><X size={19}/></button></div><form onSubmit={publishStory}><p className="muted small-copy">Ta story disparaît automatiquement après 24 heures.</p><textarea className="story-textarea" value={storyDraft} onChange={e => setStoryDraft(e.target.value)} maxLength={1000} placeholder="Raconte un petit moment de ta journée…" rows={3}/><label className="media-picker-wide"><ImagePlus size={18}/><span><b>{storyFile ? storyFile.name : 'Ajouter une photo ou une vidéo'}</b><small>Les formats verticaux, carrés et horizontaux sont conservés.</small></span><input type="file" accept="image/*,video/*" onChange={e => { const file = e.target.files?.[0] || null; if (file) { const invalid = validateMedia(file); if (invalid) setFeedError(invalid); else setStoryFile(file); } e.currentTarget.value = ''; }}/></label>{storyFile ? <button type="button" className="remove-media-link" onClick={() => setStoryFile(null)}><X size={14}/> Retirer le média</button> : null}
      <label className="media-picker-wide"><Music2 size={18}/><span><b>{storyMusic ? storyMusic.name : 'Ajouter une musique'}</b><small>Choisis un fichier audio pour accompagner la photo ou la vidéo.</small></span><input type="file" accept="audio/*" onChange={e => { setStoryMusic(e.target.files?.[0] || null); e.currentTarget.value = ''; }}/></label>{storyMusic ? <button type="button" className="remove-media-link" onClick={() => setStoryMusic(null)}><X size={14}/> Retirer la musique</button> : null}
      <div className="voice-record-card"><div className="voice-record-head"><Mic size={17}/><div><b>Message vocal</b><small>Enregistre ta voix pour cette story.</small></div>{voice.isRecording ? <button type="button" className="button button-danger button-small" onClick={voice.stop}><Square size={14}/> Arrêter</button> : <button type="button" className="button button-quiet button-small" onClick={() => void voice.start()}><Mic size={14}/> Enregistrer</button>}</div>{voice.recordedUrl ? <div className="voice-preview"><audio controls src={voice.recordedUrl}/><button type="button" className="icon-button" onClick={voice.clear} aria-label="Supprimer le vocal"><Trash2 size={16}/></button></div> : null}{voice.error ? <p className="form-message error-message">{voice.error}</p> : null}</div>
      <label className="story-visibility-field">Qui peut voir ta story ?<select value={storyVisibility} onChange={e => setStoryVisibility(e.target.value as 'public'|'friends')}><option value="friends">Mes amis</option><option value="public">Tous les membres connectés</option></select></label>
      {feedError ? <div className="form-message error-message">{feedError}</div> : null}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => { setStoryModal(false); voice.clear(); }}>Annuler</button><button type="submit" className="button button-primary" disabled={busyStory || (!storyDraft.trim() && !storyFile && !storyMusic && !voice.recordedBlob) || voice.isRecording}>{busyStory ? <LoaderCircle size={16} className="spin"/> : <Send size={16}/>} Publier la story</button></div></form></section></div> : null}

  {activeStory ? <div className="modal-backdrop story-view-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setActiveStory(null); }}><section className="story-viewer" role="dialog" aria-modal="true" aria-label="Story"><header><Avatar src={activeStory.author?.avatar_url} name={activeStory.author?.full_name} size="sm"/><div><b>{activeStory.author?.full_name || 'Membre Jémor'}</b><small>{timeAgo(activeStory.created_at)}</small></div><button className="icon-button" onClick={() => setActiveStory(null)} aria-label="Fermer"><X size={20}/></button></header><div className="story-view-content">{activeStory.media_url && activeStory.media_type === 'video' ? <video controls autoPlay playsInline src={activeStory.media_url} style={{ maxWidth: '100%', maxHeight: '58vh', width: 'auto', height: 'auto', objectFit: 'contain' }}/> : activeStory.media_url && activeStory.media_type === 'image' ? <img src={activeStory.media_url} alt="Story" style={{ maxWidth: '100%', maxHeight: '58vh', width: 'auto', height: 'auto', objectFit: 'contain' }}/> : null}{activeStory.body ? <p>{activeStory.body}</p> : null}</div><div className="story-audio-list">{activeStory.audio_url ? <label><Mic size={15}/> Vocal <audio controls src={activeStory.audio_url}/></label> : null}{activeStory.music_url ? <label><Music2 size={15}/> {activeStory.music_title || 'Musique'} <audio controls src={activeStory.music_url}/></label> : null}</div></section></div> : null}
  </AppShell>;
}
