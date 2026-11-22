import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';

export const metadata: Metadata = {
  title: {
    default: 'AU News Digest · 澳洲与国际热点速览',
    template: '%s | 热点速览',
  },
  description:
    '汇聚澳洲（ABC、Guardian AU、SBS）与国际（BBC、Guardian World、Al Jazeera、CNBC）主流媒体热点，Gemini AI 深度中文编译与要点提炼，专为折叠屏双屏与长辈大字阅读优化。',
  manifest: '/manifest.json',
  other: {
    'text-scale': 'scale',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: '热点速览',
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#090c10' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-[100dvh] bg-canvas text-ink font-sans selection:bg-accent-soft selection:text-accent">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
