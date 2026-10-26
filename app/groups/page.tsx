'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Avatar } from '@/components/avatar';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { signedMediaUrl, uploadMedia, inspectMedia, MAX_UPLOAD_BYTES } from '@/lib/media';
import type { Profile, Post } from '@/lib/types';
import { timeAgo } from '@/lib/types';
import { Check, CheckCheck, Globe, LoaderCircle, LockKeyhole, MessageCircle, Plus, Search, Send, ShieldCheck, Users, UserRoundCog, X, ImagePlus } from 'lucide-react';

type GroupRow = { id:string; title:string|null; description:string; group_visibility:'public'|'private'; group_mode:'community'|'chat'; join_approval:boolean; created_by:string; created_at:string; members:Member[]; mine?:Member|null; request?:JoinRequest|null; posts:GroupPost[] };
type Member = { user_id:string; member_role:string; joined_at:string; profile?:Profile };
type JoinRequest = { id:string; conversation_id:string; requester_id:string; status:'pending'|'approved'|'rejected'; created_at:string; profile?:Profile };
type GroupPost = Post & { media_path?:string|null; media_type?:'image'|'video'|null; media_url?:string|null };

export default function GroupsPage(){
 const {user,profile}=useAuth();
 const [groups,setGroups]=useState<GroupRow[]>([]); const [selectedId,setSelectedId]=useState<string|null>(null);
 const [search,setSearch]=useState(''); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
 const [showCreate,setShowCreate]=useState(false); const [groupName,setGroupName]=useState(''); const [groupDescription,setGroupDescription]=useState(''); const [groupVisibility,setGroupVisibility]=useState<'public'|'private'>('public'); const [groupMode,setGroupMode]=useState<'community'|'chat'>('community'); const [joinApproval,setJoinApproval]=useState(true); const [working,setWorking]=useState(false);
 const [postDraft,setPostDraft]=useState(''); const [postFile,setPostFile]=useState<File|null>(null); const [groupTab,setGroupTab]=useState<'posts'|'members'|'requests'>('posts');

 const loadGroups=useCallback(async()=>{
  const sb=createClient(); if(!sb||!user){setLoading(false);return;} setLoading(true);setError('');
  try{
   const {data:all,error:e1}=await sb.from('conversations').select('id,title,description,group_visibility,group_mode,join_approval,created_by,created_at').eq('is_group',true).order('created_at',{ascending:false}).limit(100);
   if(e1)throw e1;
   const rows=all??[]; const ids=rows.map((g:any)=>g.id);
   if(!ids.length){setGroups([]);setSelectedId(null);return;}
   const [{data:mine,error:e2},{data:reqs,error:e3}]=await Promise.all([
    sb.from('conversation_members').select('conversation_id,user_id,member_role,joined_at').eq('user_id',user.id).in('conversation_id',ids),
    sb.from('group_join_requests').select('id,conversation_id,requester_id,status,created_at').in('conversation_id',ids),
   ]);
   if(e2)throw e2;if(e3)throw e3;
   const memberRows=mine??[]; const requestRows=reqs??[]; const requesterIds=[...new Set(requestRows.map((r:any)=>r.requester_id))];
   const {data:people}=requesterIds.length?await sb.from('profiles').select('id,username,full_name,avatar_url').in('id',requesterIds):{data:[]};
   const personMap=new Map((people??[]).map((p:any)=>[p.id,p as Profile]));
   const result:GroupRow[]=rows.map((g:any)=>({ ...g, members:[], mine:memberRows.find((m:any)=>m.conversation_id===g.id)||null, request:requestRows.filter((r:any)=>r.conversation_id===g.id&&r.requester_id===user.id).sort((a:any,b:any)=>b.created_at.localeCompare(a.created_at))[0]||null, posts:[] }));
   const groupIdsToRead=memberRows.map((m:any)=>m.conversation_id);
   if(groupIdsToRead.length){
    const {data:memberDetails}=await sb.from('conversation_members').select('conversation_id,user_id,member_role,joined_at').in('conversation_id',groupIdsToRead);
    const detailIds=[...new Set((memberDetails??[]).map((m:any)=>m.user_id))];
    const {data:details}=detailIds.length?await sb.from('profiles').select('id,username,full_name,avatar_url').in('id',detailIds):{data:[]};
    const detailMap=new Map((details??[]).map((p:any)=>[p.id,p as Profile]));
    for(const g of result) g.members=(memberDetails??[]).filter((m:any)=>m.conversation_id===g.id).map((m:any)=>({...m,profile:detailMap.get(m.user_id)}));
   }
   for(const g of result){ if(g.request)g.request={...g.request,profile:personMap.get(g.request.requester_id)}; }
   setGroups(result);setSelectedId(cur=>cur&&result.some(g=>g.id===cur)?cur:result.find(g=>g.mine)?.id??result[0]?.id??null);
  }catch(e){setError(e instanceof Error?e.message:'Impossible de charger les groupes.');}
  finally{setLoading(false);}
 },[user?.id]);
 useEffect(()=>{void loadGroups();},[loadGroups]);

 const selected=groups.find(g=>g.id===selectedId)||null;

 function changeGroupMode(value:'community'|'chat'){setGroupMode(value);setGroupVisibility(value==='chat'?'private':'public');setJoinApproval(true);}
 const loadGroupPosts=useCallback(async(id:string)=>{
  const sb=createClient();if(!sb)return;
  const {data,error:e1}=await sb.from('posts').select('id,author_id,body,visibility,post_type,group_id,created_at').eq('group_id',id).order('created_at',{ascending:false}).limit(30);
  if(e1){setError(e1.message);return;}
  const posts=data??[];const pids=posts.map((p:any)=>p.id);const aids=[...new Set(posts.map((p:any)=>p.author_id))];
  const [{data:people},{data:media}]=await Promise.all([
   aids.length?sb.from('profiles').select('id,username,full_name,avatar_url').in('id',aids):Promise.resolve({data:[]}),
   pids.length?sb.from('post_media').select('id,post_id,media_type,storage_path,width,height,position').in('post_id',pids).order('position'):Promise.resolve({data:[]}),
  ]);
  const map=new Map((people??[]).map((p:any)=>[p.id,p as Profile])); const postMap=new Map(posts.map((p:any)=>[p.id,p]));
  const enriched:any[]=[];for(const m of media??[]){if(!['image','video'].includes(m.media_type))continue;const url=await signedMediaUrl(sb,'post-media',m.storage_path);const current=postMap.get(m.post_id) as any;if(current){current.media={...(current.media||{}),[m.id]:{...m,url}};}}
  const list=posts.map((p:any)=>({...p,author:map.get(p.author_id),media:Object.values((p as any).media||{})}));
  setGroups(old=>old.map(g=>g.id===id?{...g,posts:list}:g));
 },[]);
 useEffect(()=>{if(selectedId&&selected?.mine&&selected.group_mode==='community')void loadGroupPosts(selectedId);},[selectedId,selected?.mine?.user_id,selected?.group_mode,loadGroupPosts]);
 useEffect(()=>{setGroupTab(selected?.group_mode==='chat'?'members':'posts');},[selectedId,selected?.group_mode]);

 async function createGroup(e:FormEvent){e.preventDefault();const sb=createClient();if(!sb||!user||!groupName.trim())return;setWorking(true);setError('');
  try{const {data:conv,error:e1}=await sb.from('conversations').insert({created_by:user.id,is_group:true,title:groupName.trim(),description:groupDescription.trim(),group_visibility:groupMode === 'chat' ? 'private' : groupVisibility,group_mode:groupMode,join_approval:groupMode === 'chat' || groupVisibility === 'private' ? true : joinApproval}).select('id').single();if(e1)throw e1;
   const {error:e2}=await sb.from('conversation_members').insert({conversation_id:conv.id,user_id:user.id,member_role:'admin'});if(e2)throw e2;
   setNotice(`Le groupe « ${groupName.trim()} » a été créé.`);setGroupName('');setGroupDescription('');setGroupMode('community');setGroupVisibility('public');setShowCreate(false);setSelectedId(conv.id);await loadGroups();
  }catch(e){setError(e instanceof Error?e.message:'Impossible de créer le groupe.');}finally{setWorking(false);}}
 async function joinGroup(g:GroupRow){const sb=createClient();if(!sb||!user)return;setWorking(true);setError('');
  try{if(g.group_visibility==='public'){const {error:e}=await sb.from('conversation_members').insert({conversation_id:g.id,user_id:user.id,member_role:'member'});if(e&&e.code!=='23505')throw e;setNotice('Tu as rejoint le groupe.');}
   else if(g.request?.status==='rejected'){const {error:e}=await sb.from('group_join_requests').update({status:'pending',reviewed_at:null,reviewed_by:null}).eq('id',g.request.id);if(e)throw e;setNotice('Ta demande a été renvoyée aux administrateurs.');}
   else{const {error:e}=await sb.from('group_join_requests').insert({conversation_id:g.id,requester_id:user.id,status:'pending'});if(e&&e.code!=='23505')throw e;setNotice('Ta demande a été envoyée aux administrateurs.');}
   await loadGroups();
  }catch(e){setError(e instanceof Error?e.message:'Impossible de rejoindre ce groupe.');}finally{setWorking(false);}}
 async function decideJoin(request:JoinRequest,status:'approved'|'rejected') {const sb=createClient();if(!sb)return;setWorking(true);setError('');
  try{const {error:e}=await sb.from('group_join_requests').update({status,reviewed_at:new Date().toISOString(),reviewed_by:user?.id}).eq('id',request.id);if(e)throw e;
   if(status==='approved'){const {error:addErr}=await sb.from('conversation_members').insert({conversation_id:request.conversation_id,user_id:request.requester_id,member_role:'member'});if(addErr&&addErr.code!=='23505')throw addErr;}
   setNotice(status==='approved'?'Demande acceptée.':'Demande refusée.');await loadGroups();
  }catch(e){setError(e instanceof Error?e.message:'Impossible de traiter la demande.');}finally{setWorking(false);}}
 async function promoteMember(g:GroupRow,m:Member){const sb=createClient();if(!sb)return;if(!window.confirm(`Donner les droits d’administrateur à ${m.profile?.full_name||m.profile?.username||'ce membre'} ?`))return;const {error:e}=await sb.from('conversation_members').update({member_role:'admin'}).eq('conversation_id',g.id).eq('user_id',m.user_id);if(e)setError(e.message);else{setNotice('Le membre est maintenant administrateur.');await loadGroups();}}
 async function publishGroupPost(e:FormEvent){e.preventDefault();const sb=createClient();if(!sb||!user||!selected||!selected.mine||(!postDraft.trim()&&!postFile))return;setWorking(true);setError('');
  try{const isVideo=!!postFile&&postFile.type.startsWith('video/');if(postFile&&postFile.size>MAX_UPLOAD_BYTES)throw new Error('Fichier de 50 Mo maximum.');const {data:post,error:e1}=await sb.from('posts').insert({author_id:user.id,body:postDraft.trim(),visibility:'public',post_type:isVideo?'reel':'post',group_id:selected.id}).select('id').single();if(e1)throw e1;
   if(postFile){const dims=await inspectMedia(postFile);const path=await uploadMedia(sb,'post-media',user.id,post.id,postFile,'group');const {error:e2}=await sb.from('post_media').insert({post_id:post.id,media_type:isVideo?'video':'image',storage_path:path,mime_type:postFile.type,original_filename:postFile.name,byte_size:postFile.size,width:dims.width,height:dims.height,duration_seconds:dims.durationSeconds,position:0});if(e2)throw e2;}
   setPostDraft('');setPostFile(null);await loadGroupPosts(selected.id);setNotice('Publication ajoutée au groupe.');
  }catch(e){setError(e instanceof Error?e.message:'Impossible de publier dans ce groupe.');}finally{setWorking(false);}}

 const visible=useMemo(()=>groups.filter(g=>(g.title||'').toLowerCase().includes(search.toLowerCase())||(g.description||'').toLowerCase().includes(search.toLowerCase())),[groups,search]);

 return <AppShell><div className="content-column groups-page"><div className="page-heading"><div><div className="eyebrow">LES COMMUNAUTÉS JÉMOR</div><h1>Tes <span>groupes.</span></h1><p>Crée un groupe public ou privé, échangez et partagez vos publications.</p></div><div className="heading-icon"><UsersRoundFallback/></div></div>
 {error?<div className="inline-alert"><span>{error}</span><button onClick={()=>setError('')}><X size={16}/></button></div>:null}{notice?<div className="inline-success"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={16}/></button></div>:null}
 <div className="groups-toolbar"><div className="conversation-search groups-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher un groupe…"/></div><button className="button button-primary" onClick={()=>setShowCreate(v=>!v)}><Plus size={16}/> Créer un groupe</button></div>
 {showCreate?<section className="card-surface group-create-card"><div className="section-line"><div><h2>Nouveau groupe</h2><small>Configure sa visibilité et l’accès aux membres.</small></div><button className="icon-button" onClick={()=>setShowCreate(false)} aria-label="Fermer"><X size={17}/></button></div><form className="group-create-form" onSubmit={createGroup}><label>Nom du groupe<input value={groupName} onChange={e=>setGroupName(e.target.value)} maxLength={100} required placeholder="Ex. : Les passionnés du numérique"/></label><label>Description<textarea value={groupDescription} onChange={e=>setGroupDescription(e.target.value)} rows={3} maxLength={1000} placeholder="De quoi parle ce groupe ?"/></label><label>Usage du groupe<select value={groupMode} onChange={e=>changeGroupMode(e.target.value as 'community'|'chat')}><option value="community">Publications</option><option value="chat">Conversation privée</option></select></label><div className="group-form-options"><label>Type de groupe<select value={groupVisibility} onChange={e=>setGroupVisibility(e.target.value as 'public'|'private')}><option value="public">🌍 Public — tout membre peut rejoindre</option><option value="private">🔒 Privé — demande d’approbation</option></select></label><label className="checkbox-label"><input type="checkbox" checked={groupVisibility === 'private' ? true : joinApproval} disabled={groupVisibility === 'private'} onChange={e=>setJoinApproval(e.target.checked)}/> Approbation des demandes pour ce groupe privé</label></div><button className="button button-primary" disabled={working||!groupName.trim()}>{working?<LoaderCircle size={16} className="spin"/>:<Plus size={16}/>} Créer le groupe</button></form></section>:null}
 <section className="groups-workspace"><aside className="groups-list card-surface"><div className="groups-list-heading"><b>Explorer</b><span>{visible.length}</span></div>{loading?<div className="mini-loading"><LoaderCircle size={18} className="spin"/></div>:visible.length?visible.map(g=><button key={g.id} className={`group-list-item ${selectedId===g.id?'selected':''}`} onClick={()=>setSelectedId(g.id)}><span className="group-list-icon">{g.group_mode==='chat'?<MessageCircle size={18}/>:g.group_visibility==='public'?<Globe size={18}/>:<LockKeyhole size={18}/>}</span><span><b>{g.title||'Groupe sans nom'}</b><small>{g.group_mode==='chat'?'Conversation privée':g.group_visibility==='public'?'Communauté publique':'Communauté privée'}{g.mine?' · Membre':''}</small></span><span className="group-chevron">›</span></button>):<div className="empty-conversations"><UsersRoundFallback/><strong>Aucun groupe trouvé</strong><p>Crée le premier groupe de ta communauté.</p></div>}</aside>
 <section className="group-detail card-surface">{selected?<><div className="group-detail-hero"><div className="group-detail-art"><UsersRoundFallback/></div><div className="group-detail-heading"><span className={`group-visibility-pill ${selected.group_visibility}`}>{selected.group_visibility==='public'?<Globe size={13}/>:<LockKeyhole size={13}/>} {selected.group_visibility==='public'?'Public':'Privé'}</span><h2>{selected.title||'Groupe Jémor'}</h2><p>{selected.description||'Un espace pour partager et discuter.'}</p><small>{selected.mine?`${selected.members.length} membre(s) dans ta liste visible`:'Découvre cette communauté et rejoins-la.'}</small></div></div>
 <div className="group-detail-actions">{selected.mine?<><Link className="button button-primary" href={`/messages?conversation=${selected.id}`}><MessageCircle size={15}/> Ouvrir le chat</Link><span className="group-admin-state">{['admin','owner'].includes(selected.mine.member_role)?<><ShieldCheck size={14}/> Administrateur</>:<><CheckCheck size={14}/> Membre</>}</span></>:selected.group_visibility==='public'?<button className="button button-primary" onClick={()=>void joinGroup(selected)} disabled={working}><Plus size={15}/> Rejoindre le groupe</button>:selected.request?.status==='pending'?<button className="button button-quiet" disabled>Demande envoyée</button>:selected.request?.status==='approved'?<button className="button button-quiet" disabled>Demande acceptée — actualise la liste</button>:<button className="button button-primary" onClick={()=>void joinGroup(selected)} disabled={working}><LockKeyhole size={15}/> Demander à rejoindre</button>}</div>
 {selected.mine?<div className="group-tabs">{selected.group_mode==='community'?<button className={groupTab==='posts'?'active':''} onClick={()=>setGroupTab('posts')}>Publications</button>:null}<button className={groupTab==='members'?'active':''} onClick={()=>setGroupTab('members')}>Membres</button>{['admin','owner'].includes(selected.mine.member_role)?<button className={groupTab==='requests'?'active':''} onClick={()=>setGroupTab('requests')}>Demandes d’accès</button>:null}</div>:null}
 {selected.mine&&selected.group_mode==='community'&&groupTab==='posts'?<div className="group-posts"><form className="group-post-composer" onSubmit={publishGroupPost}><div className="composer-head"><Avatar src={profile?.avatar_url} name={profile?.full_name} size="md"/><strong>Partager avec le groupe</strong></div><textarea value={postDraft} onChange={e=>setPostDraft(e.target.value)} rows={3} maxLength={10000} placeholder="Une idée ou un moment pour ce groupe…"/><div className="composer-bottom"><label className="media-picker-button"><ImagePlus size={16}/> Photo / vidéo<input type="file" hidden accept="image/*,video/*" onChange={e=>{setPostFile(e.target.files?.[0]||null);e.currentTarget.value='';}}/></label><button className="button button-primary" disabled={working||(!postDraft.trim()&&!postFile)}>{working?<LoaderCircle size={15} className="spin"/>:<Send size={15}/>} Publier</button></div>{postFile?<div className="media-file-chip"><span>{postFile.name}</span><button type="button" onClick={()=>setPostFile(null)}><X size={13}/></button></div>:null}</form>{selected.posts.length?selected.posts.map(p=><article className="post-card group-post-card" key={p.id}><div className="post-header"><Avatar src={p.author?.avatar_url} name={p.author?.full_name} size="md"/><div className="post-author"><strong>{p.author?.full_name||'Membre'}</strong><span>{timeAgo(p.created_at)}</span></div></div>{p.body?<p className="post-body">{p.body}</p>:null}{(p.media as any[]||[]).map(m=><div key={m.id} className="post-media-item">{m.media_type==='video'?<video controls playsInline src={m.url} width={m.width||undefined} height={m.height||undefined} style={{width:'100%',height:'auto',maxHeight:500,objectFit:'contain',aspectRatio:m.width&&m.height?`${m.width}/${m.height}`:undefined}}/>:<img src={m.url} alt="Média du groupe" style={{width:'100%',height:'auto',maxHeight:500,objectFit:'contain'}}/>}</div>)}</article>):<div className="empty-state group-empty"><div className="empty-illustration"><Users size={25}/></div><h3>Le groupe est prêt à vivre.</h3><p>Sois le premier à partager une publication ici. Le chat est aussi accessible depuis le bouton ci-dessus.</p></div>}</div>:null}
 {selected.mine&&groupTab==='members'?<div className="group-members-list">{selected.members.map(m=><div className="group-member-row" key={m.user_id}><Avatar src={m.profile?.avatar_url} name={m.profile?.full_name} size="md"/><div><b>{m.profile?.full_name||m.profile?.username||'Membre'}</b><small>@{m.profile?.username||'membre'} · {m.member_role==='admin'||m.member_role==='owner'?'Administrateur':'Membre'}</small></div>{['admin','owner'].includes(selected.mine!.member_role)&&m.member_role==='member'?<button className="button button-quiet button-small" onClick={()=>void promoteMember(selected,m)}><UserRoundCog size={14}/> Nommer admin</button>:null}</div>)}{!selected.members.length?<p className="muted small-copy">La liste des membres n’est pas accessible.</p>:null}</div>:null}
 {selected.mine&&groupTab==='requests'?<div className="group-members-list"><JoinRequestManager group={selected} onDecision={decideJoin} working={working}/></div>:null}
 </>:<div className="empty-state group-detail-empty"><div className="empty-illustration"><Users size={28}/></div><h3>Choisis un groupe</h3><p>Découvre un groupe public ou privé, ou crée ton propre espace de discussion.</p></div>}</section></section>
 </div></AppShell>;
}

function JoinRequestManager({group,onDecision,working}:{group:GroupRow;onDecision:(r:JoinRequest,status:'approved'|'rejected')=>Promise<void>;working:boolean}){
 const [requests,setRequests]=useState<JoinRequest[]>([]);const [loading,setLoading]=useState(true);const {user}=useAuth();
 useEffect(()=>{let alive=true;const sb=createClient();if(!sb||!user){setLoading(false);return;}void (async()=>{try{const {data,error}=await sb.from('group_join_requests').select('id,conversation_id,requester_id,status,created_at').eq('conversation_id',group.id).eq('status','pending');if(error)throw error;const rows=data??[];const ids=[...new Set(rows.map((r:any)=>r.requester_id))];const {data:people}=ids.length?await sb.from('profiles').select('id,username,full_name,avatar_url').in('id',ids):{data:[]};const map=new Map((people??[]).map((p:any)=>[p.id,p as Profile]));if(alive)setRequests(rows.map((r:any)=>({...r,profile:map.get(r.requester_id)})));}catch{if(alive)setRequests([]);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[group.id,user?.id]);
 if(loading)return <div className="mini-loading"><LoaderCircle size={18} className="spin"/></div>;
 if(!requests.length)return <div className="empty-state group-empty"><Check size={24}/><h3>Aucune demande en attente</h3><p>Les demandes privées apparaîtront ici.</p></div>;
 return <>{requests.map(r=><div className="group-member-row" key={r.id}><Avatar src={r.profile?.avatar_url} name={r.profile?.full_name} size="md"/><div><b>{r.profile?.full_name||r.profile?.username||'Membre'}</b><small>Demande à rejoindre le groupe</small></div><button className="button button-primary button-small" disabled={working} onClick={()=>void onDecision(r,'approved')}><Check size={14}/> Accepter</button><button className="button button-quiet button-small" disabled={working} onClick={()=>void onDecision(r,'rejected')}><X size={14}/> Refuser</button></div>)}</>;
}

function UsersRoundFallback(){return <Users size={22}/>;}
