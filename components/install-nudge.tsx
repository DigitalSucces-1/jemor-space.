'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function InstallNudge() {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(isStandalone);
    const timer = window.setTimeout(() => {
      if (!isStandalone) setShow(true);
    }, 2200);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setInstalled(true);
      setShow(false);
      setHelp(false);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (choice.outcome === 'accepted') setShow(false);
      else setShow(true);
      return;
    }
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) setHelp(true);
    else setHelp(true);
  }

  if (installed || (!show && !help)) return null;
  return <>
    {show && !help ? <aside className="pwa-install-nudge" role="status">
      <div className="pwa-install-nudge-icon"><Smartphone size={20}/></div>
      <div className="pwa-install-nudge-copy"><strong>Installe Jémor Space</strong><span>Retrouve ton espace plus rapidement, comme une application.</span></div>
      <button type="button" className="button button-primary button-small" onClick={() => void install()}><Download size={14}/> Installer</button>
      <button type="button" className="pwa-install-nudge-close" aria-label="Fermer l’invitation" onClick={() => setShow(false)}><X size={17}/></button>
    </aside> : null}
    {help ? <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setHelp(false); }}>
      <section className="pwa-help-card" role="dialog" aria-modal="true" aria-labelledby="install-nudge-title">
        <button type="button" className="icon-button" onClick={() => setHelp(false)} aria-label="Fermer"><X size={18}/></button>
        <div className="eyebrow">INSTALLER JÉMOR SPACE</div>
        <h3 id="install-nudge-title">Ajoute Jémor Space à ton appareil</h3>
        {/iphone|ipad|ipod/i.test(typeof navigator === 'undefined' ? '' : navigator.userAgent)
          ? <ol><li>Appuie sur le bouton Partager dans Safari.</li><li>Choisis « Sur l’écran d’accueil ».</li><li>Confirme avec « Ajouter ».</li></ol>
          : <p>Dans le menu de ton navigateur, choisis « Installer Jémor Space » ou « Ajouter à l’écran d’accueil ».</p>}
        <button type="button" className="button button-primary" onClick={() => setHelp(false)}>Compris</button>
      </section>
    </div> : null}
  </>;
}
