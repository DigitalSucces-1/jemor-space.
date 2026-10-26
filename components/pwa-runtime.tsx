
'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { BellRing, Download, Smartphone, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> };

type NoticePayload = { id?: string; notification_type?: string; body?: string; actor_id?: string | null };

export function PwaRuntime({ userId }: { userId: string | null }) {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [pushReady, setPushReady] = useState(false);
  const [message, setMessage] = useState('');
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showInstallNudge, setShowInstallNudge] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setPermission('Notification' in window ? Notification.permission : 'unsupported');
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => { setInstalled(true); setInstallPrompt(null); setMessage('Jémor Space est installé sur cet appareil.'); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', appInstalled);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => console.error('Service worker Jémor Space:', error));
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', appInstalled);
    };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase || !userId) return;
    const channel = supabase.channel(`pwa-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, async (event) => {
        const notice = event.new as NoticePayload;
        if (!notice?.id || !('Notification' in window) || Notification.permission !== 'granted') return;
        // Keep the in-app notification list as the primary source while the user is already viewing it.
        if (pathname === '/notifications') return;
        let actorName = 'Jémor Space';
        if (notice.actor_id) {
          const { data } = await supabase.from('profiles').select('full_name,username').eq('id', notice.actor_id).maybeSingle();
          actorName = data?.full_name || (data?.username ? `@${data.username}` : actorName);
        }
        const registration = await navigator.serviceWorker?.ready.catch(() => null);
        if (registration) {
          await registration.showNotification(actorName, {
            body: notice.body || 'Tu as une nouvelle notification sur Jémor Space.',
            icon: '/pwa-icon-192.png',
            badge: '/pwa-icon-192.png',
            tag: `jemor-${notice.id}`,
            data: { url: '/notifications' },
          });
        } else {
          new Notification(actorName, { body: notice.body || 'Tu as une nouvelle notification sur Jémor Space.', icon: '/pwa-icon-192.png' });
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, pathname]);

  const registerPushSubscription = useCallback(async () => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const supabase = createClient();
    if (!userId || !supabase) throw new Error('Connecte-toi à Jémor Space pour associer cet appareil à tes notifications.');
    if (!publicKey) throw new Error('Le service de notifications doit être configuré par le serveur.');
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.access_token) throw new Error('Reconnecte-toi avant d’activer les notifications.');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Ce navigateur ne prend pas en charge les notifications push.');
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const padding = '='.repeat((4 - publicKey.length % 4) % 4);
      const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const raw = window.atob(base64);
      const applicationServerKey = Uint8Array.from(raw, (character) => character.charCodeAt(0));
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });
    }
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(subscription.toJSON()),
    });
    const data = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(data.error || 'Impossible d’enregistrer cet appareil.');
    setPushReady(true);
    return registration;
  }, [userId]);

  useEffect(() => {
    if (permission !== 'granted' || !userId || pushReady || !('PushManager' in window)) return;
    void registerPushSubscription().catch((error) => {
      console.error('Abonnement Web Push Jémor Space:', error);
      setMessage(error instanceof Error ? error.message : 'Impossible de finaliser les notifications.');
    });
  }, [permission, userId, pushReady, registerPushSubscription]);

  const install = useCallback(async () => {
    setMessage('');
    if (installed) { setMessage('Jémor Space est déjà installé sur cet appareil.'); return; }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') setMessage('Installation lancée.');
      return;
    }
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setShowIosHelp(true);
    else setMessage('Dans le menu du navigateur, choisis « Installer Jémor Space » ou « Ajouter à l’écran d’accueil ».');
  }, [installPrompt, installed]);

  const enableNotifications = useCallback(async () => {
    if (!('Notification' in window)) { setPermission('unsupported'); setMessage('Ce navigateur ne prend pas en charge les notifications système.'); return; }
    try {
      const next = await Notification.requestPermission();
      setPermission(next);
      if (next !== 'granted') {
        setMessage(next === 'denied' ? 'Les notifications sont bloquées dans les paramètres du navigateur.' : 'Autorisation des notifications non accordée.');
        return;
      }
      if (!userId) {
        setMessage('Autorisation accordée. Connecte-toi puis réappuie sur Notifications pour associer cet appareil à ton compte.');
        return;
      }
      await registerPushSubscription();
      setMessage('Notifications activées sur cet appareil, même lorsque Jémor Space est fermé si le navigateur les prend en charge.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible d’activer les notifications sur ce navigateur.');
    }
  }, [registerPushSubscription, userId]);

  return <div className="pwa-controls" aria-label="Installation et notifications">
    {!installed ? <button type="button" className="pwa-control-button" onClick={() => void install()} title="Installer Jémor Space"><Download size={15}/><span>Installer</span></button> : <span className="pwa-installed" title="Application installée"><Smartphone size={15}/><span>Installée</span></span>}
    {permission === 'default' || permission === 'denied' ? <button type="button" className="pwa-control-button" onClick={() => void enableNotifications()} title="Activer les notifications"><BellRing size={15}/><span>Notifications</span></button> : null}
    {permission === 'granted' && pushReady ? <span className="pwa-notification-on" title="Notifications push activées"><BellRing size={15}/><span>Alertes actives</span></span> : null}
    {permission === 'granted' && !pushReady && userId ? <button type="button" className="pwa-control-button" onClick={() => void enableNotifications()} title="Finaliser les notifications"><BellRing size={15}/><span>Finaliser</span></button> : null}
    {message ? <div className="pwa-feedback" role="status">{message}<button type="button" onClick={() => setMessage('')} aria-label="Fermer"><X size={13}/></button></div> : null}
    {showIosHelp ? <div className="pwa-help-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowIosHelp(false); }}><section className="pwa-help-card" role="dialog" aria-modal="true" aria-labelledby="pwa-help-title"><button type="button" className="pwa-help-close" onClick={() => setShowIosHelp(false)} aria-label="Fermer"><X size={18}/></button><div className="eyebrow">INSTALLATION SUR IPHONE / IPAD</div><h3 id="pwa-help-title">Ajouter Jémor Space à l’écran d’accueil</h3><ol><li>Appuie sur le bouton <b>Partager</b> de Safari.</li><li>Choisis <b>Sur l’écran d’accueil</b>.</li><li>Confirme avec <b>Ajouter</b>.</li></ol><button type="button" className="button button-primary" onClick={() => setShowIosHelp(false)}>Compris</button></section></div> : null}
  </div>;
}
