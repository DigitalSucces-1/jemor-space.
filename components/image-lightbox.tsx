'use client';

import { X } from 'lucide-react';

export function ImageLightbox({src,label,onClose}:{src:string;label:string;onClose:()=>void}) {
  return <div className="modal-backdrop profile-image-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="profile-image-modal" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="profile-image-close" onClick={onClose} aria-label="Fermer"><X size={21}/></button>
      <img src={src} alt={label}/>
      <strong>{label}</strong>
    </section>
  </div>;
}
