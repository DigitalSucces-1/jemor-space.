'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, KeyRound, LoaderCircle, Mail, Sparkles, UserRound, Waves } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    const supabase = createClient();
    if (!supabase) { setError('La connexion Supabase n’est pas configurée.'); return; }
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName.trim() } } });
        if (authError) throw authError;
        if (data.session) {
          router.push('/');
          router.refresh();
        } else {
          // With email confirmation disabled, signup should create a session immediately.
          // This fallback makes a misconfigured Auth setting explicit rather than sending the user to email.
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
          if (loginError) throw new Error('La confirmation par e-mail est encore activée dans Supabase. Désactive « Confirm email » pour permettre la connexion immédiate.');
          if (loginData.session) { router.push('/'); router.refresh(); }
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.push('/'); router.refresh();
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Une erreur est survenue. Réessaie.'); }
    finally { setBusy(false); }
  }

  return <main className="auth-page"><div className="auth-ambient"/><div className="auth-top"><Link href="/" className="brand"><span className="brand-mark"><Waves size={23}/></span><span>Jémor <b>Space</b></span></Link><Link href="/" className="back-link"><ArrowLeft size={16}/> Accueil</Link></div><div className="auth-grid"><section className="auth-story"><div className="story-pill"><Sparkles size={14}/> LE SOCIAL À TON IMAGE</div><h1>Ta communauté.<br/><span>Tes moments.</span><br/>Ton espace.</h1><p>Retrouve tes proches, partage ce qui te fait vibrer et crée des liens qui durent.</p><div className="story-stat-row"><div className="story-stat"><strong>100%</strong><span>Toi-même</span></div><div className="stat-divider"/><div className="story-stat"><strong>1 espace</strong><span>Toutes tes histoires</span></div></div><div className="decor-ring ring-one"/><div className="decor-ring ring-two"/></section><section className="auth-card"><div className="auth-card-top"><div className="auth-badge"><Waves size={21}/></div><div><div className="eyebrow">BIENVENUE CHEZ TOI</div><h2>{mode === 'signup' ? 'Créer ton compte' : 'Heureux de te revoir'}</h2></div></div><p className="auth-description">{mode === 'signup' ? 'Rejoins ton espace et commence à partager.' : 'Connecte-toi pour retrouver ton monde.'}</p><div className="auth-tabs"><button className={mode === 'signup' ? 'selected' : ''} onClick={() => {setMode('signup');setError('');setNotice('');}}>Créer un compte</button><button className={mode === 'signin' ? 'selected' : ''} onClick={() => {setMode('signin');setError('');setNotice('');}}>Connexion</button></div><form className="auth-form" onSubmit={submit}>{mode === 'signup' ? <label>Nom complet<div className="input-wrap"><UserRound size={17}/><input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Comment t’appelle-t-on ?" autoComplete="name"/></div></label> : null}<label>Adresse e-mail<div className="input-wrap"><Mail size={17}/><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="toi@exemple.com" autoComplete="email"/></div></label><label>Mot de passe<div className="input-wrap"><KeyRound size={17}/><input required type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="8 caractères minimum" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}/><button type="button" className="password-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={showPassword} title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div></label>{error ? <div className="form-message error-message">{error}</div> : null}{notice ? <div className="form-message success-message">{notice}</div> : null}<button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : null}{busy ? 'Un instant…' : mode === 'signup' ? 'Créer mon espace' : 'Me connecter'}<span>→</span></button></form><p className="privacy-note">En continuant, tu acceptes d’utiliser Jémor Space dans le respect des autres membres.</p></section></div><div className="auth-footer">© 2026 Jémor Space · Construisons du lien.</div></main>;
}
