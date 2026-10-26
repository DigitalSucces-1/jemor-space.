import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Jémor Space — Le lien qui nous rapproche',
  description: 'Partage tes moments, retrouve tes amis et échange avec ta communauté sur Jémor Space.',
  applicationName: 'Jémor Space',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Jémor Space' },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/brand/js-logo.png', type: 'image/png', sizes: '96x96' }],
    shortcut: '/brand/js-logo.png',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0878e8',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
