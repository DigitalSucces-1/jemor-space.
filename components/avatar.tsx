import { initials } from '@/lib/types';

type Props = { src?: string | null; name?: string | null; size?: 'sm' | 'md' | 'lg' | 'xl'; objectPosition?: string };

export function Avatar({ src, name, size = 'md', objectPosition }: Props) {
  if (src) return <img className={`avatar avatar-${size}`} src={src} alt={name ? `Photo de ${name}` : 'Avatar'} style={objectPosition ? { objectPosition } : undefined} />;
  return <span className={`avatar avatar-fallback avatar-${size}`} aria-label={name || 'Avatar'}>{initials(name)}</span>;
}
