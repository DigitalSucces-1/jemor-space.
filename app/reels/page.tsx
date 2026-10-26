'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { signedMediaUrl } from '@/lib/media';
import type { Comment, Profile } from '@/lib/types';
import { timeAgo } from '@/lib/types';
import { Clapperboard, Heart, LoaderCircle, MessageCircle, RefreshCw, Send, Share2, Sparkles, X } from 'lucide-react';

type Reel = { id: string; post_id: string; media_type: 'video'; url: string | null; width: number | null; height: number | null; duration_seconds: number | null; post: any; author?: Profile; comments: Comment[]; reacted: boolean; reactions_count: number };

export default function ReelsPage() {
  const { user, profile } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string,string>>({});
  const [busyComment, setBusyComment] = useState<string | null>(null);

  const loadReels = useCallback(async () => {
    const supabase = createClient(); if (!supabase || !user) { setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const { data: reelPosts, error: reelPostError } = await supabase.from('posts').select('id,author_id,body,visibility,post_type,created_at').eq('post_type','reel').order('created_at',{ascending:false}).limit(100);
      if (reelPostError) throw reelPostError;
      const reelPostIds = (reelPosts ?? []).map((p:any) => p.id);
      const { data: videos, error: mediaError } = reelPostIds.length ? await supabase.from('post_media').select('id,post_id,storage_path,width,height,duration_seconds,position').eq('media_type','video').in('post_id',reelPostIds).order('position',{ascending:true}) : { data: [], error: null };
      if (mediaError) throw mediaError;
      const postIds = [...new Set((videos ?? []).map((v:any) => v.post_id))];
      if (!postIds.length) { setReels([]); return; }
      const [{ data: posts, error: postError }, { data: reactions }, { data: comments }] = await Promise.all([
        Promise.resolve({ data: reelPosts, error: null }),
        supabase.from('reactions').select('post_id,user_id').in('post_id',postIds),
        supabase.from('comments').select('id,post_id,author_id,body,created_at').in('post_id',postIds).order('created_at',{ascending:true}),
      ]);
      if (postError) throw postError;
      const postMap = new Map((posts ?? []).map((p:any)=>[p.id,p]));
      const visibleVideos = (videos ?? []).filter((v:any)=>postMap.has(v.post_id));
      const authorIds = [...new Set((posts ?? []).map((p:any)=>p.author_id).concat((comments ?? []).map((c:any)=>c.author_id)))];
      const { data: profiles } = authorIds.length ? await supabase.from('profiles').select('id,username,full_name,avatar_url').in('id',authorIds) : {data:[]};
      const profileMap = new Map((profiles ?? []).map((p:any)=>[p.id,p as Profile]));
      const enriched: Reel[] = [];
      for (const video of visibleVideos as any[]) {
        const post:any = postMap.get(video.post_id);
        const postComments = (comments ?? []).filter((c:any)=>c.post_id===video.post_id).map((c:any)=>({...c,author:profileMap.get(c.author_id)}));
        const postReactions = (reactions ?? []).filter((r:any)=>r.post_id===video.post_id);
        enriched.push({ ...video, url: await signedMediaUrl(supabase,'post-media',video.storage_path), post, author: profileMap.get(post.author_id), comments: postComments, reactions_count: postReactions.length, reacted: postReactions.some((r:any)=>r.user_id===user.id) });
      }
      setReels(enriched);
    } catch (e) { setError(e instanceof Error ? e.message : 'Impossible de charger les Réels.'); }
    finally { setLoading(false); }
  }, [user?.id]);

  useEffect(()=>{void loadReels();},[loadReels]);

  async function toggleLike(reel: Reel) {
    const supabase=createClient(); if(!supabase||!user)return;
    const result = reel.reacted ? await supabase.from('reactions').delete().eq('post_id',reel.post_id).eq('user_id',user.id) : await supabase.from('reactions').insert({post_id:reel.post_id,user_id:user.id,reaction_type:'like'});
    if(result.error){setError(result.error.message);return;}
    setReels(old=>old.map(r=>r.post_id===reel.post_id?{...r,reacted:!r.reacted,reactions_count:Math.max(0,r.reactions_count+(r.reacted?-1:1))}:r));
  }
  async function addComment(e:FormEvent,postId:string){e.preventDefault();const supabase=createClient();const body=(drafts[postId]||'').trim();if(!supabase||!user||!body)return;setBusyComment(postId);const {error:e2}=await supabase.from('comments').insert({post_id:postId,author_id:user.id,body});if(e2)setError(e2.message);else{setDrafts(d=>({...d,[postId]:''}));await loadReels();}setBusyComment(null);}
  async function share(reel:Reel){const url=`${window.location.origin}/reels#${reel.post_id}`;try{if(navigator.share)await navigator.share({title:'Jémor Space · Réel',text:reel.post.body||'Regarde ce Réel',url});else{await navigator.clipboard.writeText(url);setError('Lien du Réel copié.');}}catch{}}

  return <AppShell><div className="content-column reels-page"><div className="page-heading"><div><div className="eyebrow">VIDÉOS DE LA COMMUNAUTÉ</div><h1>Les <span>Réels.</span></h1><p>Un espace réservé aux vidéos, sans les publications texte.</p></div><div className="heading-icon"><Clapperboard size={22}/></div></div>
    {error ? <div className="inline-alert"><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>:null}
    <div className="reels-toolbar"><span><Clapperboard size={15}/> {reels.length} vidéo(s)</span><button className="refresh-button" onClick={()=>void loadReels()} title="Actualiser"><RefreshCw size={16}/></button></div>
    {loading ? <div className="loading-card"><LoaderCircle size={22} className="spin"/> Chargement des Réels…</div> : reels.length ? reels.map(reel=><article className="reel-card card-surface" id={reel.post_id} key={reel.id}><div className="reel-video-stage"><video controls playsInline preload="metadata" src={reel.url || undefined} width={reel.width || undefined} height={reel.height || undefined} style={{width:'100%',height:'auto',maxHeight:720,objectFit:'contain',aspectRatio:reel.width&&reel.height?`${reel.width}/${reel.height}`:undefined}} aria-label="Vidéo de la communauté"/></div><div className="reel-info"><div className="post-header"><Avatar src={reel.author?.avatar_url} name={reel.author?.full_name} size="md"/><div className="post-author"><strong>{reel.author?.full_name||'Membre Jémor'}</strong><span>@{reel.author?.username||'membre'} · {timeAgo(reel.post.created_at)}</span></div></div>{reel.post.body?<p className="post-body">{reel.post.body}</p>:null}<div className="post-actions"><button className={reel.reacted?'post-action active':'post-action'} onClick={()=>void toggleLike(reel)}><Heart size={18} fill={reel.reacted?'currentColor':'none'}/> J’aime · {reel.reactions_count}</button><button className="post-action" onClick={()=>setOpenComments(openComments===reel.post_id?null:reel.post_id)}><MessageCircle size={18}/> Commenter · {reel.comments.length}</button><button className="post-action" onClick={()=>void share(reel)}><Share2 size={18}/> Partager</button></div>{openComments===reel.post_id?<div className="comments-area">{reel.comments.map((c:any)=><div className="comment-row" key={c.id}><Avatar src={c.author?.avatar_url} name={c.author?.full_name} size="sm"/><div className="comment-bubble"><strong>{c.author?.full_name||'Membre'}</strong><p>{c.body}</p><small>{timeAgo(c.created_at)}</small></div></div>)}<form className="comment-form" onSubmit={e=>void addComment(e,reel.post_id)}><Avatar src={profile?.avatar_url} name={profile?.full_name} size="sm"/><input value={drafts[reel.post_id]||''} onChange={e=>setDrafts(d=>({...d,[reel.post_id]:e.target.value}))} placeholder="Écrire un commentaire…"/><button type="submit" disabled={busyComment===reel.post_id||!(drafts[reel.post_id]||'').trim()} aria-label="Envoyer"><Send size={16}/></button></form></div>:null}</div></article>) : <div className="empty-state"><div className="empty-illustration"><Clapperboard size={28}/><Sparkles size={15}/></div><h3>Les premiers Réels arrivent bientôt.</h3><p>Publie une vidéo dans le fil : elle sera également proposée ici. Tu peux commencer dès maintenant.</p><Link className="button button-primary" href="/">Publier une vidéo</Link></div>}
  </div></AppShell>;
}
