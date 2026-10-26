'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Clapperboard, Compass, House, LogOut, MessageCircle, Settings2, Users, UsersRound, UserRound, Waves } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/avatar';
import { PwaRuntime } from '@/components/pwa-runtime';

const nav = [
  { href: '/', label: 'Fil d’actualité', short: 'Fil', icon: House },
  { href: '/reels', label: 'Réels', short: 'Réels', icon: Clapperboard },
  { href: '/friends', label: 'Amis', short: 'Amis', icon: Users },
  { href: '/groups', label: 'Groupes', short: 'Groupes', icon: UsersRound },
  { href: '/messages', label: 'Messages', short: 'Messages', icon: MessageCircle },
  { href: '/notifications', label: 'Notifications', short: 'Alertes', icon: Bell },
  { href: '/profile', label: 'Mon profil', short: 'Profil', icon: UserRound },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, configMissing } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  }

  return (
    <div className="app-background">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Jémor Space, accueil"><span className="brand-mark"><Waves size={23} /></span><span>Jémor <b>Space</b></span></Link>
        <div className="topbar-right">
          <PwaRuntime userId={user?.id ?? null} />
          <div className="live-chip"><span /> Un espace pour se retrouver</div>
          {user ? <button className="mini-profile" onClick={() => router.push('/profile')}><Avatar src={profile?.avatar_url} name={profile?.full_name || user.email} size="sm"/><span>{profile?.full_name || 'Mon compte'}</span></button> : <Link href="/auth" className="button button-primary button-small">Se connecter</Link>}
        </div>
      </header>
      {configMissing ? (
        <main className="setup-notice"><div className="eyebrow">CONFIGURATION REQUISE</div><h1>Connectons Jémor Space à sa base de données.</h1><p>Ajoute les variables <code>NEXT_PUBLIC_SUPABASE_URL</code> et <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> dans ton fichier <code>.env.local</code>, puis redémarre l’application.</p><a className="button button-primary" href="https://supabase.com/dashboard/project/khgrlguwegmyzgwwnwhv/settings/api-keys" target="_blank" rel="noreferrer">Ouvrir les clés Supabase</a></main>
      ) : !loading && !user ? (
        <main className="welcome-screen"><div className="welcome-glow"/><div className="welcome-card"><div className="welcome-icon"><Waves size={34}/></div><div className="eyebrow">BIENVENUE DANS TON ESPACE</div><h1>Les liens qui comptent, <span>au même endroit.</span></h1><p>Partage tes moments, retrouve tes amis et crée ta communauté avec Jémor Space.</p><Link className="button button-primary button-wide" href="/auth">Créer mon compte <span>→</span></Link><p className="fine-print">Déjà membre ? <Link href="/auth">Connecte-toi</Link></p></div><div className="welcome-notes"><span><Compass size={15}/> Découvrir</span><span><Users size={15}/> Se rapprocher</span><span><MessageCircle size={15}/> Échanger</span></div></main>
      ) : (
        <div className="app-layout">
          <aside className="sidebar">
            <div className="sidebar-label">TON ESPACE</div>
            <nav className="side-nav" aria-label="Navigation principale">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${pathname === href ? 'active' : ''}`}><Icon size={19}/><span>{label}</span>{href === '/notifications' ? <i className="nav-pip"/> : null}</Link>)}</nav>
            <div className="sidebar-bottom"><div className="community-card"><div className="community-orb"><Waves size={22}/></div><strong>Un espace à toi.</strong><p>Des conversations vraies, des moments partagés.</p></div>{user ? <button className="nav-link signout-button" onClick={signOut}><LogOut size={18}/><span>Se déconnecter</span></button> : null}</div>
          </aside>
          <main className="main-content">{children}</main>
          <aside className="right-rail"><div className="rail-card rail-intro"><div className="eyebrow">L’ESPRIT JÉMOR</div><h3>Plus proche, même à distance.</h3><p>Un endroit pour partager ce qui compte, à ton rythme.</p><div className="rail-gradient"/></div><div className="rail-card"><div className="rail-card-head"><strong>Ton espace, tes règles</strong><Settings2 size={17}/></div><p className="muted small-copy">Tes publications, tes conversations et tes données sont protégées par les règles d’accès du compte.</p><Link href="/profile" className="text-link">Gérer mon profil <span>→</span></Link></div><div className="footer-links"><span>Jémor Space © 2026</span><span>Un projet en construction</span></div></aside>
        </div>
      )}
      <nav className="mobile-nav" aria-label="Navigation mobile">{nav.map(({ href, label, short, icon: Icon }) => <Link key={href} href={href} className={pathname === href ? 'active' : ''} aria-label={label}><Icon size={20}/><span>{short}</span></Link>)}</nav>
    </div>
  );
}
