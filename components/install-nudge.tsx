'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

export function InstallNudge() {
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('jemor-install-nudge-dismissed') === '1';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    setInstalled(isStandalone);
    const timer = window.setTimeout(() => {
      if (!isStandalone && !dismissed) setShow(true);
    }, 2200);
    const onInstalled = () => {
      setInstalled(true);
      setShow(false);
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function install() {
    setShow(false);
    window.dispatchEvent(new Event('jemor-install-request'));
  }

  if (installed || !show) return null;
  return <aside className="pwa-install-nudge" role="status">
    <div className="pwa-install-nudge-icon"><Smartphone size={20}/></div>
    <div className="pwa-install-nudge-copy"><strong>Installe Jémor Space</strong><span>Retrouve ton espace plus rapidement, comme une application.</span></div>
    <button type="button" className="button button-primary button-small" onClick={install}><Download size={14}/> Installer</button>
    <button type="button" className="pwa-install-nudge-close" aria-label="Fermer l’invitation" onClick={() => { setShow(false); sessionStorage.setItem('jemor-install-nudge-dismissed', '1'); }}><X size={17}/></button>
  </aside>;
}
