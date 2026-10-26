import { initials } from '@/lib/types';

type Props = { src?: string | null; name?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl' };

export function Avatar({ src, name, size = 'md' }: Props) {
  if (src) return <img className={`avatar avatar-${size}`} src={src} alt={name ? `Photo de ${name}` : 'Avatar'} />;
  return <span className={`avatar avatar-fallback avatar-${size}`} aria-label={name || 'Avatar'}>{initials(name)}</span>;
}
